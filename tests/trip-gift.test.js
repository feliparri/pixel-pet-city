import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { world, fixture } from './trip-helpers.js';
import { parsePackage, buildReturn, fromBase64 } from '../supabase/functions/trip/travel-package.js';
import { handle } from '../supabase/functions/trip/handlers.js';
import { townDay } from '../supabase/functions/trip/missions.js';
import * as S from '../supabase/functions/trip/gifts.js';
import * as G from '../src/gifts.js';
import { zonedToMs, msToZoned } from '../src/admin-time.js';
import { createMockShop } from '../src/shop-mock.js';
import { createTripClient } from '../src/trip.js';

const plain = fixture('plain.bin');
const catalogue = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url))).items;
const TRIP_ID = 0xA1B2C3D4, KEY = 'owner-key';
const at = (date, time = '12:00') => zonedToMs(date, time);
const petAt = (b) => b.length - 4 - 733;
const goldOf = (b) => new DataView(b.buffer, b.byteOffset).getUint32(petAt(b) + 103, true);
const XMAS = '2026-12-10';                                   // Christmas is on by its default window, Halloween is not
const id = (season, slot, n) => `${season}:${slot}:${n}`;

async function start({ src = plain, extra = { spend: 1 }, w = world({ now: at(XMAS) / 1000, adminKey: KEY }), board = w.board(), register = true } = {}) {
  if (register) await board.register();
  const s = await board.start(src, extra);
  const c = await w.web().call('trip-claim', { code: s.body.code });
  const web = w.web(c.body.token);
  const slot = () => G.slotOf(w.now * 1000);
  const claim = (gift, ref = s.body.trip) => web.call('trip-gift', { trip: ref, gift });
  const mine = (n, season = 'christmas') => id(season, slot(), n);
  const ledger = (day = townDay(G.slotStart(slot()))) => w.db.petDays.get(`${board.deviceId}|${day}`);
  return { w, board, web, ref: s.body.trip, row: w.db.trips.get(s.body.trip), claim, mine, slot, ledger };
}

test('gift: the happy path pays the price of the id into the trip, the ledger and the return', async () => {
  const t = await start();
  const gift = t.mine(0), price = G.rewardOf(gift);
  const r = await t.claim(gift);
  assert.deepEqual([r.status, r.body], [200, { gold: price, capped: false, gift, gift_earned: price, cap: 20, gold_left: 5000 + price }]);
  assert.equal(t.row.earned, price);
  assert.deepEqual([t.ledger().gift_earned, t.ledger().gifts, t.ledger().earned, t.ledger().done], [price, [gift], 0, []], 'the missions\' own ledger is untouched');
  const second = await t.claim(t.mine(1));
  assert.equal(second.body.gift_earned, price + G.rewardOf(t.mine(1)));
  assert.equal((await t.web.call('trip-status', { trip: t.ref })).body.gold_left, 5000 + t.row.earned);
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  const ret = await t.board.call('trip-return', { trip_id: TRIP_ID });
  const bytes = fromBase64(ret.body.package);
  assert.equal(goldOf(bytes), 5000 + t.row.earned);
  assert.deepEqual(bytes, buildReturn(plain, 1 + parsePackage(plain).pkg.seq, { spent: 0, earned: t.row.earned, bought: [] }));
});

test('gift: the price is the town\'s, whatever the client says', async () => {
  const t = await start();
  for (let n = 0; n < 3; n++) { const r = await t.claim(t.mine(n)); assert.equal(r.body.gold, G.rewardOf(t.mine(n))); assert.ok(r.body.gold >= 2 && r.body.gold <= 5); }
  const forged = await t.w.web((await t.w.web().call('trip-claim', { code: (await t.board.start(plain, { spend: 1 })).body.code })).body.token).call('trip-gift', { trip: t.ref, gift: t.mine(0, 'christmas'), reward: 500, gold: 500 });
  assert.notEqual(forged.status, 200, 'a second session for another trip');
});

test('gift: asking again for the same gift is refused and pays nothing', async () => {
  const t = await start();
  const g = t.mine(1);
  assert.equal((await t.claim(g)).status, 200);
  const again = await t.claim(g);
  assert.deepEqual([again.status, again.body.error, again.body.gift_earned], [409, 'claimed', G.rewardOf(g)]);
  assert.equal(t.row.earned, G.rewardOf(g));
  assert.deepEqual(t.ledger().gifts, [g]);
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  await t.board.call('trip-return', { trip_id: TRIP_ID });
  await t.board.call('trip-ack', { trip_id: TRIP_ID });
  const next = await start({ src: fixture('keepsake.bin'), w: t.w, board: t.board, register: false });                          // the next trip of the same board: the ledger is the pet's
  const dup = await next.claim(g);
  assert.deepEqual([dup.status, dup.body.error], [409, 'claimed']);
  assert.equal(next.row.earned, 0);
});

test('gift: two claims of one gift at once pay once', async () => {
  const t = await start();
  const read = t.w.db.getPetDay; let waiting = [];
  t.w.db.getPetDay = async (d, day) => { const row = await read(d, day); if (waiting) await new Promise((go) => { waiting.push(go); if (waiting.length === 2) { waiting.forEach((f) => f()); waiting = null; } }); return row; };
  const g = t.mine(0);
  const [a, b] = await Promise.all([t.claim(g), t.claim(g)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal([a, b].find((x) => x.status === 409).body.error, 'conflict');
  assert.equal(t.row.earned, G.rewardOf(g));
  assert.deepEqual(t.ledger().gifts, [g]);
});

test('gift: the cap is 20 coins a town day: the last gift is cut to what is left, then gift_cap; a new town day starts over; another pet has its own', async () => {
  const t = await start();
  const paid = [];
  let day = townDay(t.w.now * 1000);
  for (let s = 0; s < 12 && !paid.includes('gift_cap'); s++) {
    for (let n = 0; n < 3 && !paid.includes('gift_cap'); n++) { const r = await t.claim(t.mine(n)); paid.push(r.status === 200 ? r.body.gold : r.body.error); if (r.status === 200 && r.body.capped) paid.push('capped'); }
    t.w.now += 2 * 3600;
    if (townDay(t.w.now * 1000) !== day) break;
  }
  assert.ok(paid.includes('capped') && paid.at(-1) === 'gift_cap', JSON.stringify(paid));
  const sum = paid.filter((x) => Number.isInteger(x)).reduce((a, b) => a + b, 0);
  assert.equal(sum, 20, 'exactly the cap was paid');
  assert.equal(t.row.earned, 20);
  const over = await t.claim(t.mine(2));
  assert.deepEqual([over.status, over.body.error, over.body.gift_earned, over.body.cap], [409, 'gift_cap', 20, 20]);
  assert.equal(t.row.earned, 20);
  // another pet has its own cap
  const other = await start({ w: t.w });
  assert.equal((await other.claim(other.mine(0))).status, 200);
  // a mission still pays: the gift cap is apart from the missions' 50
  const mission = await t.web.call('trip-mission', { trip: t.ref, mission: `${townDay(t.w.now * 1000)}:tito:water:-:2` });
  assert.deepEqual([mission.status, mission.body.gold], [200, 6]);
  // the next town day: a new ledger
  t.w.now = at('2026-12-11', '07:30') / 1000;                                                    // (the slot of 05:00 to 07:00 still belongs to the day before)
  const fresh = await t.claim(t.mine(0));
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.gift_earned, fresh.body.gold);
});

test('gift: only the current slot counts; the one before it for 2 minutes; not the next one', async () => {
  const t = await start();
  const cur = t.slot(), start0 = G.slotStart(cur);
  t.w.now = (start0 + 3 * 60000) / 1000;                                                         // 3 minutes into the slot: the previous one is over
  const old = await t.claim(id('christmas', cur - 1, 0));
  assert.deepEqual([old.status, old.body.error], [409, 'gift_expired']);
  const future = await t.claim(id('christmas', cur + 1, 0));
  assert.deepEqual([future.status, future.body.error], [409, 'gift_expired']);
  assert.equal((await t.claim(id('christmas', cur - 5, 0))).body.error, 'gift_expired');
  t.w.now = (start0 + 119000) / 1000;                                                            // 1 min 59 s in: the previous slot is still good
  const grace = await t.claim(id('christmas', cur - 1, 2));
  assert.deepEqual([grace.status, grace.body.gold], [200, G.rewardOf(id('christmas', cur - 1, 2))]);
  t.w.now = (start0 + 120000) / 1000;
  assert.equal((await t.claim(id('christmas', cur - 1, 1))).body.error, 'gift_expired');
  assert.equal((await t.claim(id('christmas', cur, 1))).status, 200);
  assert.equal(t.row.earned, G.rewardOf(id('christmas', cur - 1, 2)) + G.rewardOf(id('christmas', cur, 1)));
});

test('gift: a gift is booked on the town day its slot starts in, so it cannot be paid twice across the 06:00 change', async () => {
  const t = await start();
  const slotAt = (time) => G.slotOf(at('2026-12-11', time));
  const edge = slotAt('05:30');                                                                   // in summer a slot runs 05:00 to 07:00 Chile: it spans the town day's change
  assert.equal(msToZoned(G.slotStart(edge)).time, '05:00');
  assert.equal(slotAt('06:30'), edge);
  const g = id('christmas', edge, 0);
  t.w.now = at('2026-12-11', '05:40') / 1000;
  assert.equal((await t.claim(g)).status, 200);
  t.w.now = at('2026-12-11', '06:30') / 1000;                                                     // the town day changed under the same slot
  const dup = await t.claim(g);
  assert.deepEqual([dup.status, dup.body.error], [409, 'claimed']);
  assert.equal(t.row.earned, G.rewardOf(g));
  assert.deepEqual([...t.w.db.petDays.keys()].map((k) => k.split('|')[1]), ['2026-12-10'], 'one row, on the day the slot started in');
  assert.equal((await t.claim(id('christmas', edge, 1))).status, 200, 'the other gifts of that slot are the same day\'s');
});

test('gift: a season that is off pays nothing; the owner\'s overrides turn one on or off', async () => {
  const t = await start();
  const halloween = t.mine(0, 'halloween');
  const off = await t.claim(halloween);
  assert.deepEqual([off.status, off.body.error], [409, 'season_off']);
  assert.equal(t.w.db.petDays.size, 0, 'a refused claim leaves no ledger');
  // dates: halloween forced on for these days
  assert.equal((await t.w.admin('season-save', { season: 'halloween', year: 2026, mode: 'dates', starts_at: '2026-12-01T00:00:00Z', ends_at: '2026-12-31T00:00:00Z' }, KEY)).status, 200);
  assert.equal((await t.claim(halloween)).status, 200, 'override on');
  // off: christmas forced off for 2026
  assert.equal((await t.w.admin('season-save', { season: 'christmas', year: 2026, mode: 'off' }, KEY)).status, 200);
  const xmasOff = await t.claim(t.mine(0));
  assert.deepEqual([xmasOff.status, xmasOff.body.error], [409, 'season_off'], 'override off');
  assert.equal(t.row.earned, G.rewardOf(halloween));
  // cleared: back to the defaults
  await t.w.admin('season-clear', { season: 'christmas', year: 2026 }, KEY);
  await t.w.admin('season-clear', { season: 'halloween', year: 2026 }, KEY);
  assert.equal((await t.claim(t.mine(1))).status, 200);
  assert.equal((await t.claim(t.mine(2, 'halloween'))).body.error, 'season_off');
  // legacy 'on': until the end of the default window
  await t.w.admin('season-save', { season: 'halloween', year: 2026, mode: 'on' }, KEY);
  assert.equal((await t.claim(t.mine(2, 'halloween'))).body.error, 'season_off', 'forced on only until Nov 2');
  // the window of a default season: the edges
  const edges = [['2026-11-01', '23:59', 'halloween', 200], ['2026-11-02', '00:00', 'halloween', 409], ['2026-11-01', '23:59', 'christmas', 409], ['2026-11-02', '00:00', 'christmas', 200], ['2027-01-01', '23:59', 'christmas', 200], ['2027-01-02', '00:00', 'christmas', 409]];
  await t.w.admin('season-clear', { season: 'halloween', year: 2026 }, KEY);
  for (const [d, time, season, status] of edges) { t.w.now = at(d, time) / 1000; assert.equal((await t.claim(t.mine(0, season))).status, status, `${d} ${time} ${season}`); }
});

test('gift: when the owner\'s overrides cannot be read, nothing is paid (try again), and nothing is booked', async () => {
  const t = await start();
  t.w.db.listSeasons = async () => { throw new Error('db 500'); };
  const r = await t.claim(t.mine(0));
  assert.deepEqual([r.status, r.body.error], [503, 'try_again']);
  assert.equal(t.row.earned, 0);
  assert.equal(t.w.db.petDays.size, 0);
});

test('gift: a trip that is not active, cannot earn or is not the caller\'s pays nothing', async () => {
  const t = await start();
  assert.equal((await t.w.web('ab'.repeat(32)).call('trip-gift', { trip: t.ref, gift: t.mine(0) })).body.error, 'bad_session');
  assert.equal((await t.w.web().call('trip-gift', { trip: t.ref, gift: t.mine(0) })).status, 401);
  assert.equal((await t.claim(t.mine(0), '00000000-0000-0000-0000-000000000000')).body.error, 'bad_session');
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  const over = await t.claim(t.mine(0));
  assert.deepEqual([over.status, over.body.error], [409, 'trip_over']);
  assert.equal(t.row.earned, 0);
  const closed = await start({ extra: {} });                                                      // an old board cannot apply a gold change
  assert.deepEqual([(await closed.claim(closed.mine(0))).status, (await closed.claim(closed.mine(0))).body.error], [403, 'shop_closed']);
  assert.equal(closed.w.db.petDays.size, 0);
  const waiting = world({ now: at(XMAS) / 1000 }), b = waiting.board(); await b.register();
  const s = await b.start(plain, { spend: 1 });                                                   // started, never claimed: no session to ask with
  assert.equal((await waiting.web().call('trip-gift', { trip: s.body.trip, gift: id('christmas', G.slotOf(waiting.now * 1000), 0) })).status, 401);
});

test('gift: a recall between the day\'s ledger and the trip does not pay twice or crash', async () => {
  const t = await start();
  const upd = t.w.db.updateTrip;
  t.w.db.updateTrip = async (tid, where, patch) => { if (patch.earned !== undefined) { t.w.db.updateTrip = upd; await t.board.call('trip-recall', { trip_id: TRIP_ID }); } return upd(tid, where, patch); };
  const r = await t.claim(t.mine(0));
  assert.deepEqual([r.status, r.body.error], [409, 'trip_over']);
  assert.equal(t.row.earned, 0);
  assert.equal(t.ledger().gift_earned, G.rewardOf(t.mine(0)), 'the day keeps the count: forging a recall never earns more');
});

test('gift: every refusal has its code and changes nothing', async () => {
  const t = await start();
  const cur = t.slot();
  for (const bad of ['', 'x', 7, null, undefined, {}, [], `christmas:${cur}`, `christmas:${cur}:3`, `christmas:0${cur}:0`, `christmas:${cur}:00`, `easter:${cur}:0`, `Christmas:${cur}:0`, `christmas:${cur}:0 `, `christmas:${cur}:0:1`, `christmas:-${cur}:0`, `christmas:99999999:0`]) {
    const r = await t.claim(bad);
    assert.deepEqual([r.status, r.body.error], [400, 'bad_gift'], JSON.stringify(bad));
  }
  assert.equal(t.row.earned, 0);
  assert.equal(t.w.db.petDays.size, 0);
  assert.equal((await t.w.raw('trip-gift', new TextEncoder().encode('[]'), { 'x-trip-token': 'a'.repeat(64) })).status, 400);
  assert.equal((await t.w.raw('trip-gift', new TextEncoder().encode('{'), {})).body.error, 'bad_json');
  assert.equal((await t.w.raw('trip-gift', new Uint8Array(), {}, 'GET')).status, 405);
});

test('the trip client and the dev mock open gifts by the same rules', async () => {
  const w = world({ now: at(XMAS) / 1000 }), board = w.board();
  await board.register();
  const s = await board.start(plain, { spend: 1 });
  const deps = { db: w.db, nowS: () => w.now, randomBytes: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), uuid: () => crypto.randomUUID(), townUrl: 'https://town/' };
  const fetch = async (url, init) => { const out = await handle(url.split('/').pop(), { method: init.method, headers: Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v])), body: new TextEncoder().encode(init.body) }, deps); return { status: out.status, json: async () => out.body }; };
  const client = createTripClient({ base: 'https://x/functions/v1/trip', fetch, setInterval: () => 1, clearInterval() {} });
  await client.claim(s.body.code, catalogue);
  const gold0 = client.shop.gold, slot = G.slotOf(w.now * 1000), g = id('christmas', slot, 0);
  const ok = await client.claimGift(g);
  assert.deepEqual([ok.ok, ok.gold, client.shop.gold], [true, G.rewardOf(g), gold0 + G.rewardOf(g)]);
  const dup = await client.claimGift(g);
  assert.deepEqual([dup.ok, dup.error, G.giftErrorText(dup)], [false, 'claimed', null]);
  assert.equal(client.shop.gold, gold0 + G.rewardOf(g));
  assert.equal((await client.claimGift(id('halloween', slot, 0))).error, 'season_off');
  assert.equal((await createTripClient({ base: 'x', fetch }).claimGift(g)).error, 'bad_session');
  // the mock, with the clock of the town
  const noon = at(XMAS), mock = createMockShop('?gold=100');
  const mslot = G.slotOf(noon), m0 = id('christmas', mslot, 0);
  const r = await mock.claimGift(m0, noon);
  assert.deepEqual([r.ok, r.gold, mock.shop.gold], [true, G.rewardOf(m0), 100 + G.rewardOf(m0)]);
  assert.equal((await mock.claimGift(m0, noon)).error, 'claimed');
  assert.equal((await mock.claimGift(id('halloween', mslot, 0), noon)).error, 'season_off');
  assert.equal((await mock.claimGift(id('christmas', mslot - 1, 0), noon)).error, 'gift_expired');
  assert.equal((await mock.claimGift('nope', noon)).error, 'bad_gift');
  assert.equal((await createMockShop('?shop=closed').claimGift(m0, noon)).error, 'shop_closed');
  assert.equal((await createMockShop('?dev=1&season=halloween').claimGift(id('halloween', mslot, 1), noon)).ok, true, 'the dev flag turns a season on');
  const capped = createMockShop('?gold=0'), reach = [];
  for (let slot = mslot; slot < mslot + 12; slot++) for (let n = 0; n < 3; n++) { const x = await capped.claimGift(id('christmas', slot, n), G.slotStart(slot) + 1000); reach.push(x.ok ? x.gold : x.error); }
  assert.equal(reach.filter(Number.isInteger).reduce((a, b) => a + b, 0), 20, 'the mock stops at the cap, like the server');
  assert.ok(reach.includes('gift_cap'));
  assert.equal(S.GIFT_DAILY_CAP, 20);
});
