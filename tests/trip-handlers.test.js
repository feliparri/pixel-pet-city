import test from 'node:test';
import assert from 'node:assert/strict';
import { world, fixture } from './trip-helpers.js';
import { parsePackage } from '../supabase/functions/_shared/travel-package.js';
import { fromBase64, toBase64 } from '../supabase/functions/_shared/travel-package.js';
import { SESSION_IDLE_S, CLAIM_TTL_S, BODY_MAX } from '../supabase/functions/_shared/handlers.js';

const plain = fixture('plain.bin');
const TRIP = 0xA1B2C3D4;

async function started(over = {}) {
  const w = world();
  const board = w.board();
  assert.equal((await board.register()).status, 201);
  const s = await board.start(plain, over);
  return { w, board, s };
}

test('register: idempotent with the same secret, refused with another, validated', async () => {
  const w = world(), b = w.board();
  assert.equal((await b.register()).status, 201);
  const again = await b.register();
  assert.deepEqual([again.status, again.body.existed], [200, true]);
  const other = await w.raw('device-register', new TextEncoder().encode(JSON.stringify({ device_id: b.deviceId, secret: 'ab'.repeat(32) })));
  assert.deepEqual([other.status, other.body.error], [409, 'device_conflict']);
  assert.equal(w.db.devices.get(b.deviceId).key_hash.length, 64);
  assert.ok(!JSON.stringify([...w.db.devices.values()]).includes(b.secretHex), 'the secret itself is never stored');
  const bad = await w.raw('device-register', new TextEncoder().encode('{"device_id":"x","secret":"y"}'));
  assert.equal(bad.status, 400);
});

test('device auth: unknown device, bad signature, stale timestamp, unsigned', async () => {
  const w = world(), b = w.board();
  assert.equal((await b.start(plain)).body.error, 'unknown_device');
  await b.register();
  assert.equal((await b.call('trip-recall', { trip_id: 1 }, { ts: w.now - 301 })).body.error, 'stale');
  assert.equal((await b.call('trip-recall', { trip_id: 1 }, { secretHex: 'cd'.repeat(32) })).body.error, 'bad_signature');
  assert.equal((await w.raw('trip-recall', new TextEncoder().encode('{}'), {})).body.error, 'bad_headers');
  assert.equal((await b.call('trip-recall', { trip_id: 1 })).body.error, 'unknown_trip');
});

test('start: validates the package, returns a code and url, is idempotent on retry', async () => {
  const { w, board, s } = await started();
  assert.equal(s.status, 201);
  assert.match(s.body.code, /^[2-9A-HJKMNP-Z]{6}$/);
  assert.equal(s.body.url, `https://feliparri.github.io/pixel-pet-city/?trip=${s.body.code}`);
  assert.equal(s.body.trip_id, TRIP);
  assert.equal(s.body.entrance, 'parachute');
  assert.equal(Date.parse(s.body.expires_at) / 1000, w.now + CLAIM_TTL_S);
  const retry = await board.start(plain);
  assert.deepEqual([retry.status, retry.body.code], [200, s.body.code]);
  const corrupt = new Uint8Array(plain); corrupt[40] ^= 1;
  assert.deepEqual((await board.start(corrupt)).body, { error: 'bad_package', reason: 'bad_crc' });
  assert.equal((await board.call('trip-start', { package: '%%%' })).body.error, 'bad_package_encoding');
  assert.equal((await board.call('trip-start', { package: toBase64(plain), entrance: 'rocket' })).body.error, 'bad_entrance');
  const huge = await board.call('trip-start', { package: 'A'.repeat(BODY_MAX) });
  assert.equal(huge.status, 413);
});

test('start: a package that is already a return, or a second trip, supersedes the first', async () => {
  const { w, board, s } = await started();
  const { buildReturn } = await import('../supabase/functions/_shared/travel-package.js');
  assert.equal((await board.start(buildReturn(plain, 2))).body.reason, 'bad_direction');
  const second = new Uint8Array(fixture('keepsake.bin'));
  const r2 = await board.start(second, { entrance: 'blue_bolt' });
  assert.equal(r2.status, 201);
  assert.equal(r2.body.entrance, 'blue_bolt');
  assert.equal(w.db.trips.get(s.body.trip).status, 'cancelled');
  assert.equal((await board.call('trip-recall', { trip_id: TRIP })).body.error, 'trip_cancelled');
  assert.equal((await board.call('trip-return', { trip_id: TRIP })).body.error, 'trip_cancelled');
  const claimOld = await w.web().call('trip-claim', { code: s.body.code });
  assert.deepEqual([claimOld.status, claimOld.body.error], [410, 'trip_over']);
});

test('claim: pet view and token; one session; resume with the token; takeover when idle; expiry', async () => {
  const { w, s } = await started();
  const bad = await w.web().call('trip-claim', { code: 'AB2CD' });
  assert.equal(bad.status, 400);
  assert.equal((await w.web().call('trip-claim', { code: 'ZZZZZZ' })).status, 404);
  const c = await w.web().call('trip-claim', { code: s.body.code.toLowerCase() });
  assert.equal(c.status, 200);
  assert.deepEqual(c.body.pet, { name: 'Mochi', species: 'cat', stage: 2, items: ['bow', 'sunglasses', '', ''], keepsakes: [] });
  assert.equal(c.body.status, 'active');
  assert.match(c.body.token, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(w.db.trips.get(c.body.trip)).includes(c.body.token), 'only the token hash is stored');
  const second = await w.web().call('trip-claim', { code: s.body.code });
  assert.deepEqual([second.status, second.body.error], [409, 'already_claimed']);
  const resume = await w.web().call('trip-claim', { code: s.body.code, token: c.body.token });
  assert.deepEqual([resume.status, resume.body.token], [200, c.body.token]);
  w.now += SESSION_IDLE_S + 1;
  const take = await w.web().call('trip-claim', { code: s.body.code });
  assert.equal(take.status, 200);
  assert.notEqual(take.body.token, c.body.token);
  const old = await w.web(c.body.token).call('trip-status', { trip: c.body.trip });
  assert.equal(old.status, 401, 'the displaced session no longer works');
  const fresh = await started();
  fresh.w.now += CLAIM_TTL_S + 1;
  assert.equal((await fresh.w.web().call('trip-claim', { code: fresh.s.body.code })).body.error, 'code_expired');
});

test('save: versioned, size-limited, session-bound; entrance may change', async () => {
  const { w, s } = await started();
  const c = await w.web().call('trip-claim', { code: s.body.code });
  const web = w.web(c.body.token);
  const save = (o) => web.call('trip-save', { trip: c.body.trip, ...o });
  assert.deepEqual((await save({ base_version: 0, state: { v: 1, spot: [3, 4] } })).body, { version: 1, entrance: 'parachute' });
  assert.equal((await save({ base_version: 0, state: {} })).body.error, 'version_conflict');
  assert.equal((await save({ base_version: 1, entrance: 'blue_bolt' })).body.entrance, 'blue_bolt');
  assert.equal((await save({ base_version: 2, entrance: 'x' })).body.error, 'bad_entrance');
  assert.equal((await save({ base_version: 2, state: { a: 'x'.repeat(3000) } })).body.error, 'bad_state');
  assert.equal((await save({ base_version: 2, state: [] })).body.error, 'bad_state');
  assert.equal((await save({ base_version: -1 })).body.error, 'bad_version');
  assert.equal((await w.web('00'.repeat(32)).call('trip-save', { trip: c.body.trip, base_version: 2 })).status, 401);
  assert.equal((await w.web().call('trip-save', { trip: c.body.trip, base_version: 2 })).status, 401);
  assert.deepEqual(w.db.trips.get(c.body.trip).state, { v: 1, spot: [3, 4] });
  const again = await w.web(c.body.token).call('trip-claim', { code: s.body.code });
  assert.deepEqual(again.body.state, { version: 2, data: { v: 1, spot: [3, 4] } });
});

test('the whole trip: recall with the browser closed, return, ack, replays', async () => {
  const { w, board, s } = await started();
  assert.equal((await board.call('trip-return', { trip_id: TRIP })).body.error, 'not_recalled');
  const c = await w.web().call('trip-claim', { code: s.body.code });
  const web = w.web(c.body.token);
  assert.equal((await web.call('trip-status', { trip: c.body.trip })).body.recalled, false);
  assert.equal((await board.call('trip-status', { trip_id: TRIP })).body.claimed, true);

  const r = await board.call('trip-recall', { trip_id: TRIP });                    // nobody has the page open
  assert.deepEqual([r.status, r.body.status, r.body.replayed], [200, 'recalled', false]);
  assert.equal((await board.call('trip-recall', { trip_id: TRIP })).body.replayed, true);
  const st = await web.call('trip-status', { trip: c.body.trip });                 // the browser comes back later
  assert.deepEqual([st.body.status, st.body.recalled], ['recalled', true]);
  assert.equal((await web.call('trip-save', { trip: c.body.trip, base_version: 0 })).body.error, 'trip_recalled');
  assert.equal((await w.web().call('trip-claim', { code: s.body.code, token: c.body.token })).body.error, 'trip_over');

  const ret = await board.call('trip-return', { trip_id: TRIP });
  assert.equal(ret.status, 200);
  assert.equal(ret.body.seq, 2);
  const bytes = fromBase64(ret.body.package);
  assert.equal(bytes.length, ret.body.size);
  const back = parsePackage(bytes);
  assert.equal(back.ok, true);
  assert.deepEqual([back.pkg.dir, back.pkg.seq, back.pkg.tripId], [1, 2, TRIP]);
  assert.deepEqual((await board.call('trip-return', { trip_id: TRIP })).body, ret.body, 'asking again gives the same package');
  assert.equal((await board.call('trip-recall', { trip_id: TRIP })).body.error, 'trip_already_returned');

  assert.equal((await board.call('trip-ack', { trip_id: TRIP, seq: 9 })).body.error, 'bad_seq');
  const ack = await board.call('trip-ack', { trip_id: TRIP, seq: 2 });
  assert.deepEqual([ack.status, ack.body.status, ack.body.replayed], [200, 'closed', false]);
  assert.equal((await board.call('trip-ack', { trip_id: TRIP })).body.replayed, true);
  assert.equal((await board.call('trip-return', { trip_id: TRIP })).body.error, 'trip_closed');
  const row = w.db.trips.get(c.body.trip);
  assert.deepEqual([row.package_b64, row.session_hash], ['', null], 'a finished trip keeps no package and no session');
});

test('ack before the return is refused; recall of an unclaimed or expired trip works and the pet can come home', async () => {
  const { w, board } = await started();
  assert.equal((await board.call('trip-ack', { trip_id: TRIP })).body.error, 'not_returned');
  w.now += CLAIM_TTL_S + 5;
  const r = await board.call('trip-recall', { trip_id: TRIP });                    // never claimed
  assert.equal(r.body.status, 'recalled');
  assert.equal((await board.call('trip-return', { trip_id: TRIP })).status, 200);
});

test('recall is race-safe: a conditional update that loses still answers recalled', async () => {
  const { w, board, s } = await started();
  const real = w.db.updateTrip;
  w.db.updateTrip = async (id, where, patch) => { await real(id, { status: ['waiting'] }, { status: 'recalled' }); w.db.updateTrip = real; return null; };
  assert.equal((await board.call('trip-recall', { trip_id: TRIP })).body.status, 'recalled');
  assert.equal(w.db.trips.get(s.body.trip).status, 'recalled');
});

test('wrong method, unknown function, bad json, hostile ids', async () => {
  const { w, board } = await started();
  assert.equal((await w.raw('trip-start', new Uint8Array(0), {}, 'GET')).status, 405);
  assert.equal((await w.raw('nope', new Uint8Array(0))).status, 404);
  assert.equal((await w.raw('trip-claim', new TextEncoder().encode('[1]'))).body.error, 'bad_json');
  assert.equal((await w.raw('trip-claim', new Uint8Array([0xff, 0xfe]))).body.error, 'bad_json');
  assert.equal((await board.call('trip-recall', { trip_id: '1' })).body.error, 'bad_trip_id');
  assert.equal((await board.call('trip-recall', { trip_id: 0 })).body.error, 'bad_trip_id');
  assert.equal((await w.web('x').call('trip-status', { trip: '../..' })).status, 401);
});

test('another board cannot touch a trip it does not own', async () => {
  const { w, s } = await started();
  const mallory = w.board();
  await mallory.register();
  assert.equal((await mallory.call('trip-recall', { trip_id: TRIP })).body.error, 'unknown_trip');
  assert.equal((await mallory.call('trip-return', { trip_id: TRIP })).body.error, 'unknown_trip');
  assert.equal(w.db.trips.get(s.body.trip).status, 'waiting');
});
