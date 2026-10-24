import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTripClient, tripCodeFromSearch, petFromClaim, tripErrorText, entryMode, POLL_MS } from '../src/trip.js';
import { stateWithStars, starsFromState } from '../src/stars.js';
import { parseKeepsake, keepsakeRgba } from '../src/keepsake.js';
import { normalizeTripCode } from '../src/trip-code.js';
import { normalizeCode, CODE_ALPHABET } from '../supabase/functions/trip/trip-code.js';
import { handle } from '../supabase/functions/trip/handlers.js';
import { world, fixture } from './trip-helpers.js';

const catalogue = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url))).items;

function clientFor(w, extra = {}) {
  const deps = { db: w.db, nowS: () => w.now, randomBytes: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), uuid: () => crypto.randomUUID(), townUrl: 'https://town/' };
  const fetcher = async (url, init) => {
    const out = await handle(url.split('/').pop(), { method: init.method, headers: Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v])), body: new TextEncoder().encode(init.body) }, deps);
    return { status: out.status, json: async () => out.body };
  };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const timers = [];
  return { storage, timers, client: createTripClient({ base: 'https://x/functions/v1/trip', fetch: fetcher, storage, setInterval: (fn) => { timers.push(fn); return timers.length; }, clearInterval: () => {}, ...extra }) };
}

async function startTrip(fixtureName = 'plain', entrance) {
  const w = world();
  const board = w.board();
  await board.register();
  const s = await board.start(fixture(`${fixtureName}.bin`), entrance ? { entrance } : {});
  return { w, board, s };
}

test('the page code mirrors the server alphabet and rules', () => {
  assert.equal(tripCodeFromSearch('?trip=k7m-2qx&dev=1'), 'K7M2QX');
  assert.equal(tripCodeFromSearch('?local=1'), null);
  assert.equal(tripCodeFromSearch('?trip=K7M2Q0'), null);
  for (const s of ['K7M2QX', 'k7m 2qx', 'AB2CD', 'ABOCD2', '']) assert.equal(normalizeTripCode(s), normalizeCode(s));
  for (const ch of CODE_ALPHABET) assert.equal(normalizeTripCode(`${ch}`.repeat(6)), `${ch}`.repeat(6));
});

test('claim: the pet the town draws, the entrance, the stored session; resume keeps the token', async () => {
  const { w, s } = await startTrip('keepsake', 'blue_bolt');
  const { client, storage } = clientFor(w);
  const r = await client.claim(s.body.code, catalogue);
  assert.equal(r.ok, true);
  assert.equal(r.entrance, 'blue_bolt');
  assert.equal(r.pet.name, 'Mochi');
  assert.deepEqual([r.pet.look.species, r.pet.look.stage], ['cat', 2]);
  assert.equal(r.pet.keepsakes.length, 2);
  assert.ok(JSON.parse(storage.getItem('city.trip')).token);
  const again = clientFor(w, {});
  again.storage.setItem('city.trip', storage.getItem('city.trip'));
  const r2 = await again.client.claim(s.body.code, catalogue);
  assert.deepEqual([r2.ok, r2.resumed], [true, true]);
  const other = clientFor(w);
  assert.deepEqual(await other.client.claim(s.body.code, catalogue), { ok: false, error: 'already_claimed' });
  assert.deepEqual(await other.client.claim('ZZZZZZ', catalogue), { ok: false, error: 'unknown_code' });
});

test('network failures and odd answers become errors, never throws', async () => {
  const c = createTripClient({ base: 'x', fetch: async () => { throw new Error('offline'); }, storage: null });
  assert.deepEqual(await c.claim('K7M2QX', catalogue), { ok: false, error: 'network' });
  const d = createTripClient({ base: 'x', fetch: async () => ({ status: 200, json: async () => { throw new Error('html'); } }), storage: null });
  assert.equal((await d.claim('K7M2QX', catalogue)).ok, false);
  assert.match(tripErrorText('network'), /conexión/);
  assert.match(tripErrorText('whatever'), /No se pudo/);
});

test('save the entrance (the dev flag) and the watcher: polls, then reports the recall once', async () => {
  const { w, board, s } = await startTrip();
  const { client, timers } = clientFor(w);
  await client.claim(s.body.code, catalogue);
  assert.equal(await client.save({ entrance: 'blue_bolt' }), true);
  assert.equal(client.session.entrance, 'blue_bolt');
  assert.equal(client.session.version, 1);
  const seen = [];
  client.watch((k) => seen.push(k));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(seen, []);
  assert.equal(POLL_MS, 5000);
  await board.call('trip-recall', { trip_id: s.body.trip_id });                   // the board recalls; the page is still open
  await timers[0]();
  await timers[0]();
  assert.deepEqual(seen, ['recalled']);
});

test('the watcher ends the session when the code is replaced or the token is taken over', async () => {
  const { w, board, s } = await startTrip();
  const { client, timers } = clientFor(w);
  await client.claim(s.body.code, catalogue);
  const seen = [];
  client.watch((k) => seen.push(k));
  await board.start(fixture('keepsake.bin'));                                      // a new trip cancels this one
  await timers[0]();
  assert.deepEqual(seen, ['over']);
});

test('petFromClaim refuses what the town cannot draw and cleans names and keepsakes', () => {
  assert.equal(petFromClaim(null, catalogue), null);
  assert.equal(petFromClaim({ name: 'x', species: 'dragon', stage: 1, items: [] }, catalogue), null);
  const p = petFromClaim({ name: '<b>Mochi</b>', species: 'cat', stage: 9, items: [] }, catalogue);
  assert.equal(p, null);
  const ok = petFromClaim({ name: '<b>Mochi</b>', species: 'cat', stage: 2, items: ['bow', 'nope', '', ''], keepsakes: [{ bad: true }] }, catalogue);
  assert.equal(ok.name, 'bMochib');
  assert.deepEqual(ok.look.items, ['bow', '', '', '']);
  assert.deepEqual(ok.keepsakes, []);
});

test('keepsake art decodes: high nibble first, 0 is transparent, bad sizes are refused', () => {
  const pal = Array.from({ length: 15 }, (_, i) => `#${(i + 1).toString(16).padStart(2, '0')}0000`);
  const k = parseKeepsake({ slot: 0, name: 'Capa', w: 3, h: 1, pal, px: Buffer.from([0x12, 0x30]).toString('base64') });
  assert.deepEqual(Array.from(keepsakeRgba(k)), [1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255]);
  const t = parseKeepsake({ slot: 0, name: 'x', w: 2, h: 1, pal, px: Buffer.from([0x05]).toString('base64') });
  assert.deepEqual(Array.from(keepsakeRgba(t)).slice(0, 4), [0, 0, 0, 0]);
  assert.equal(parseKeepsake({ slot: 0, name: 'x', w: 3, h: 1, pal, px: Buffer.from([1]).toString('base64') }), null);
  assert.equal(parseKeepsake({ slot: 9, name: 'x', w: 1, h: 1, pal, px: 'AA==' }), null);
  assert.equal(parseKeepsake({ slot: 0, name: 'x', w: 1, h: 1, pal: ['red'], px: 'AA==' }), null);
});

test('entry: only a trip code enters the town; the chooser needs ?local=1&dev=1; the old fragment and bare pages land on the explanation', () => {
  assert.equal(entryMode('?trip=K7M2QX'), 'trip');
  assert.equal(entryMode('?trip=k7m-2qx&dev=1'), 'trip');
  assert.equal(entryMode(''), 'landing');
  assert.equal(entryMode('?local=1'), 'landing', 'local rooms without dev are not offered');
  assert.equal(entryMode('?dev=1'), 'landing');
  assert.equal(entryMode('?trip=nonsense'), 'landing');
  assert.equal(entryMode('?local=1&dev=1'), 'dev');
  assert.equal(entryMode('?local=1&dev=0'), 'landing');
  assert.equal(entryMode('#n=Mochi&s=cat&g=2'), 'landing', 'a pet in the fragment proves nothing and is ignored');
});

test('stars live in the trip state: saved with the version, read back on resume, other keys kept', async () => {
  const { w, s } = await startTrip();
  const { client, storage } = clientFor(w);
  const r = await client.claim(s.body.code, catalogue);
  assert.equal(starsFromState(r.state), 0);
  assert.equal(await client.save({ state: stateWithStars(client.state, 5) }), true);
  assert.equal(await client.save({ state: stateWithStars({ ...client.state, shop: ['hat'] }, 8) }), true, 'the version moved on, so the next save goes through');
  const again = clientFor(w);
  again.storage.setItem('city.trip', storage.getItem('city.trip'));
  const r2 = await again.client.claim(s.body.code, catalogue);
  assert.deepEqual(r2.state, { shop: ['hat'], v: 1, stars: 8 });
  assert.equal(starsFromState(r2.state), 8);
  const stale = clientFor(w);
  stale.storage.setItem('city.trip', storage.getItem('city.trip'));
  await stale.client.claim(s.body.code, catalogue);
  assert.equal(await client.save({ state: stateWithStars(client.state, 9) }), true);
  assert.equal(await stale.client.save({ state: stateWithStars(stale.client.state, 10) }), false, 'a stale version is refused, then learns the current one');
  assert.equal(await stale.client.save({ state: stateWithStars(stale.client.state, 10) }), true);
});
