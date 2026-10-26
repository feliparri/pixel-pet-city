import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { world, fixture } from './trip-helpers.js';
import { parsePackage, buildReturn, fromBase64, crc32 } from '../supabase/functions/trip/travel-package.js';
import { handle } from '../supabase/functions/trip/handlers.js';
import * as SERVER from '../supabase/functions/trip/missions.js';
import * as M from '../src/missions.js';
import { dayOf } from '../src/npc-world.js';
import { VILLAGERS } from '../src/npcs.js';
import { zonedToMs } from '../src/admin-time.js';
import { createFarmMemory } from '../src/farm-world.js';
import { createCanasta } from '../src/canasta.js';
import { createMockShop } from '../src/shop-mock.js';
import { createTripClient } from '../src/trip.js';
import { PRODUCE } from '../src/art/produce.js';

const plain = fixture('plain.bin');
const catalogue = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url))).items;
const TRIP_ID = 0xA1B2C3D4;
const D1 = '2026-10-26', D2 = '2026-10-27';
const at = (date, time) => zonedToMs(date, time);
const petAt = (b) => b.length - 4 - 733;
const goldOf = (b) => new DataView(b.buffer, b.byteOffset).getUint32(petAt(b) + 103, true);
const withGold = (src, g) => { const b = new Uint8Array(src); new DataView(b.buffer).setUint32(petAt(b) + 103, g, true); new DataView(b.buffer).setUint32(b.length - 4, crc32(b, b.length - 4), true); return b; };

// ---- the tables the town and the server share ----------------------------------------------------------------------------------
test('the town mirrors the server tables: cap, villagers, templates, rewards', () => {
  assert.equal(M.DAILY_CAP, SERVER.DAILY_CAP);
  assert.equal(M.DAILY_CAP, 50);
  assert.deepEqual(VILLAGERS.map((v) => v.id), SERVER.VILLAGER_IDS);
  assert.deepEqual(M.MISSION_TYPES, SERVER.MISSION_TYPES);
  for (const [type, t] of Object.entries(SERVER.MISSION_TYPES)) for (let n = t.min; n <= t.max; n++) assert.equal(M.rewardOf(type, n), SERVER.rewardOf(type, n));
  for (const t of Object.values(SERVER.MISSION_TYPES)) for (const k of t.kinds) assert.ok(PRODUCE.includes(k), `${k} has an icon`);
});

test('the server town day is the villagers\' day (06:00 to 06:00 in Santiago), over a year with both clock changes', () => {
  const from = Date.UTC(2026, 0, 1), step = 131 * 60000;
  let n = 0;
  for (let t = from; t < from + 400 * 86400000; t += step) { n++; if (SERVER.townDay(t) !== dayOf(t).date) assert.fail(`${new Date(t).toISOString()}: ${SERVER.townDay(t)} vs ${dayOf(t).date}`); }
  assert.ok(n > 4000);
  assert.equal(SERVER.townDay(at(D1, '05:59')), '2026-10-25');
  assert.equal(SERVER.townDay(at(D1, '06:00')), D1);
  assert.equal(SERVER.townDay(at(D1, '23:59')), D1);
  assert.equal(SERVER.townDay(at(D2, '00:30')), D1, 'after midnight it is still yesterday\'s day for the villagers');
});

test('both sides read a mission id the same way, and refuse the same ones', () => {
  const good = [`${D1}:tito:harvest:carrot:3`, `${D1}:lula:bring:pear:2`, `${D1}:pipo:water:-:2`, `${D1}:perla:feed:-:3`];
  const bad = ['', 'x', `${D1}:tito:harvest:carrot:4`, `${D1}:tito:harvest:carrot:1`, `${D1}:tito:harvest:apple:2`, `${D1}:tito:harvest:-:2`, `${D1}:tito:water:carrot:2`, `${D1}:nobody:water:-:2`, `${D1}:tito:fly:-:2`,
    `2026-13-45:tito:water:-:2`, `${D1}:tito:water:-:22`, ` ${D1}:tito:water:-:2`, `${D1}:tito:water:-:2\n`, 7, null, undefined, {}, `${D1}:TITO:water:-:2`, `__proto__:tito:water:-:2`, `${D1}:tito:constructor:-:2`];
  for (const id of good) { assert.ok(SERVER.parseMission(id), id); assert.deepEqual(M.parseMission(id), SERVER.parseMission(id)); }
  for (const id of bad) { assert.equal(SERVER.parseMission(id), null, String(id)); assert.equal(M.parseMission(id), null, String(id)); }
  assert.equal(SERVER.parseMission(good[0]).reward, 9);
  assert.deepEqual(SERVER.parseMission(good[2]), { id: good[2], day: D1, villager: 'pipo', type: 'water', kind: null, n: 2, reward: 6 });
});

test('a mission is a pure function of (room, day, villager): same for everyone, new every day, valid for the server, all kinds appear', () => {
  const seen = new Set(), rewards = [];
  for (let r = 0; r < 40; r++) for (let d = 0; d < 14; d++) for (const v of VILLAGERS) {
    const room = `ROOM-${r}`, day = new Date(Date.UTC(2026, 9, 20 + d)).toISOString().slice(0, 10), m = M.missionFor(room, day, v.id);
    assert.deepEqual(m, M.missionFor(room, day, v.id));
    assert.deepEqual(SERVER.parseMission(m.id), m, m.id);
    assert.equal(m.villager, v.id); assert.equal(m.day, day);
    seen.add(m.type); seen.add(`${m.type}:${m.kind}`); rewards.push(m.reward);
    assert.match(M.missionText(m), /^[A-ZÁ¡¿]/);
    assert.ok(M.missionText(m).length <= 42, M.missionText(m));
    assert.ok(PRODUCE.includes(M.missionIcon(m)), M.missionIcon(m));
  }
  assert.deepEqual([...seen].filter((k) => !k.includes(':')).sort(), ['bring', 'feed', 'harvest', 'water']);
  assert.ok(Math.min(...rewards) >= 6 && Math.max(...rewards) <= 12, `${Math.min(...rewards)}..${Math.max(...rewards)}`);
  const day = M.missionsOf('FOCA-LUNA-42', D1), next = M.missionsOf('FOCA-LUNA-42', D2), other = M.missionsOf('OSO-LIMA-80', D1);
  assert.equal(day.length, 6);
  assert.notDeepEqual(day.map((m) => m.id.slice(11)), next.map((m) => m.id.slice(11)), 'another day, other requests');
  assert.notDeepEqual(day.map((m) => m.id), other.map((m) => m.id), 'another room, other requests');
  assert.ok(day.reduce((s, m) => s + m.reward, 0) <= 72, 'a day of missions pays about the cap, not far beyond it');
});

test('the request texts, the progress and the status of a mission', () => {
  assert.equal(M.missionText(M.parseMission(`${D1}:tito:harvest:carrot:3`)), 'Cosecha 3 zanahorias');
  assert.equal(M.missionText(M.parseMission(`${D1}:tito:harvest:wheat:2`)), 'Cosecha 2 espigas de trigo');
  assert.equal(M.missionText(M.parseMission(`${D1}:tito:bring:apple:2`)), 'Tráeme 2 manzanas, por favor');
  assert.equal(M.missionText(M.parseMission(`${D1}:tito:water:-:3`)), 'Riega 3 parcelas de la huerta');
  assert.equal(M.missionText(M.parseMission(`${D1}:tito:feed:-:2`)), 'Alimenta a los animales 2 veces');
  const mem = createFarmMemory(), basket = createCanasta();
  mem.use(D1);
  const harvest = M.parseMission(`${D1}:tito:harvest:carrot:2`), bring = M.parseMission(`${D1}:lula:bring:pear:2`), water = M.parseMission(`${D1}:pipo:water:-:2`), feed = M.parseMission(`${D1}:perla:feed:-:3`);
  const st = (m, paidToday) => M.statusOf(m, { mem, basket, paidToday });
  assert.deepEqual(st(harvest), { state: 'open', have: 0, need: 2 });
  mem.record('harvest', 'carrot'); mem.record('harvest', 'lettuce');
  assert.deepEqual(st(harvest), { state: 'open', have: 1, need: 2 }, 'only the crop that was asked for counts');
  mem.record('harvest', 'carrot');
  assert.deepEqual(st(harvest), { state: 'ready', have: 2, need: 2 });
  basket.add('pear', 1); basket.add('apple', 5);
  assert.equal(st(bring).have, 1);
  basket.add('pear', 4);
  assert.equal(st(bring).state, 'ready');
  assert.equal(st(bring).have, 2, 'never more than asked');
  mem.record('water'); mem.record('water');
  assert.equal(st(water).state, 'ready');
  mem.record('feed', 'wheat'); mem.record('feed', 'lettuce'); mem.record('feed', 'wheat');
  assert.equal(st(feed).state, 'ready', 'any food counts as feeding');
  // handing a mission in uses up what it asked for, so one action never pays two villagers
  mem.consume('water', null, 2);
  assert.equal(mem.count('water'), 0);
  assert.equal(st(water).state, 'open');
  mem.consume('harvest', 'carrot', 9);
  assert.equal(mem.count('harvest', 'carrot'), 0);
  assert.equal(mem.count('harvest', 'lettuce'), 1);
  mem.markMission(harvest.id);
  assert.equal(st(harvest).state, 'done');
  assert.equal(st(water, ['pipo']).state, 'done', 'the server says it was paid');
  assert.equal(st(feed, ['tito']).state, 'ready');
  const kept = createFarmMemory({ load: () => JSON.parse(JSON.stringify(mem.toJSON())) });
  assert.equal(kept.missionDone(harvest.id), true);
  kept.use('2026-10-28');
  assert.equal(kept.missionDone(harvest.id), false, 'a new day forgets what was handed in');
  assert.equal(createFarmMemory({ load: () => ({ day: D1, missions: ['x', 7, harvest.id, harvest.id] }) }).toJSON().missions.length, 1);
});

test('the panel rows follow the villagers, their state and the server ledger', () => {
  const mem = createFarmMemory(), basket = createCanasta();
  mem.use(D1);
  const rows = M.missionRows('FOCA-LUNA-42', D1, { mem, basket, paidToday: ['lula'] });
  assert.deepEqual(rows.map((r) => r.villager), VILLAGERS.map((v) => v.id));
  assert.equal(rows[1].state, 'done');
  assert.ok(rows.filter((r) => r.state !== 'done').every((r) => r.state === 'open' && r.have === 0));
  assert.ok(rows.every((r) => r.text && r.reward >= 6 && r.name));
  assert.deepEqual(M.parseMissions({ day: D1, earned: 99, done: ['tito', 'zzz', 3] }), { day: D1, cap: 50, earned: 50, done: ['tito'] });
  assert.deepEqual(M.parseMissions(null), { day: '', cap: 50, earned: 0, done: [] });
  const m = M.parseMission(`${D1}:tito:feed:-:2`), led = M.missionsAfterClaim(null, m, { ok: true, earned_today: 8 });
  assert.deepEqual(led, { day: D1, cap: 50, earned: 8, done: ['tito'] });
  assert.deepEqual(M.missionsAfterClaim(led, m, { ok: false, error: 'network' }), led);
  assert.equal(M.missionsAfterClaim(led, M.parseMission(`${D1}:lula:feed:-:2`), { ok: false, error: 'cap_reached', earned_today: 50 }).earned, 50);
  for (const error of ['mission_expired', 'trip_over', 'bad_session', 'shop_closed', 'conflict', 'network', 'bad_mission', 'unknown']) assert.match(M.claimErrorText({ error }), /^[A-ZÁ¿¡]/);
  assert.equal(M.thanksFor('tito'), M.thanksFor('tito'));
  assert.ok(M.doneLine('lula'));
});

// ---- trip-mission against the real handlers --------------------------------------------------------------------------------------
async function start({ src = plain, extra = { spend: 1 }, w = world({ now: at(D1, '12:00') / 1000 }), board = w.board(), register = true } = {}) {
  if (register) await board.register();
  const s = await board.start(src, extra);
  const c = await w.web().call('trip-claim', { code: s.body.code });
  const web = w.web(c.body.token);
  const claim = (mission, ref = s.body.trip) => web.call('trip-mission', { trip: ref, mission });
  return { w, board, web, ref: s.body.trip, row: w.db.trips.get(s.body.trip), claim0: c.body, claim, buy: (item) => web.call('trip-buy', { trip: s.body.trip, item }), buyTool: (tool) => web.call('trip-buy-tool', { trip: s.body.trip, tool }) };
}
const mid = (v, type = 'water', kind = '-', n = 2, day = D1) => `${day}:${v}:${type}:${kind}:${n}`;

test('mission: the gold goes into the trip, the claim, the status, the shop and the return', async () => {
  const t = await start();
  assert.deepEqual(t.claim0.missions, { day: D1, cap: 50, earned: 0, done: [] });
  assert.equal(t.claim0.gold_left, 5000);
  const a = await t.claim(mid('tito', 'harvest', 'carrot', 3));
  assert.deepEqual([a.status, a.body], [200, { gold: 9, capped: false, earned_today: 9, cap: 50, gold_left: 5009 }]);
  const b = await t.claim(mid('lula', 'feed', '-', 2));
  assert.deepEqual([b.body.gold, b.body.earned_today, b.body.gold_left], [8, 17, 5017]);
  assert.equal(t.row.earned, 17);
  assert.equal((await t.web.call('trip-status', { trip: t.ref })).body.gold_left, 5017);
  assert.equal((await t.buy('cape')).body.gold_left, 5017 - 120);                              // the shop spends the earned gold too
  assert.equal((await t.buyTool('sickle')).body.gold_left, 5017 - 150);
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  const ret = await t.board.call('trip-return', { trip_id: TRIP_ID });
  const bytes = fromBase64(ret.body.package);
  assert.equal(goldOf(bytes), 5000 - 150 + 17);
  assert.deepEqual(bytes, buildReturn(plain, 1 + parsePackage(plain).pkg.seq, { spent: 150, earned: 17, bought: ['cape'] }));
  assert.equal(parsePackage(bytes).ok, true);
  const again = await t.board.call('trip-return', { trip_id: TRIP_ID });
  assert.equal(again.body.package, ret.body.package, 'asking again gives the same bytes');
});

test('return patch: earned gold alone raises the gold, with a purchase it nets out, nothing earned keeps the old bytes', () => {
  assert.equal(goldOf(buildReturn(plain, 2, { earned: 30 })), goldOf(plain) + 30);
  assert.equal(goldOf(buildReturn(plain, 2, { spent: 100, earned: 30 })), goldOf(plain) - 70);
  assert.equal(goldOf(buildReturn(withGold(plain, 10), 2, { spent: 50, earned: 30 })), 0, 'never below 0');
  assert.equal(goldOf(buildReturn(withGold(plain, 0xFFFFFFF0), 2, { earned: 50 })), 0xFFFFFFFF, 'never past a u32');
  assert.deepEqual(buildReturn(plain, 2, { earned: 0 }), buildReturn(plain, 2));
  const a = buildReturn(plain, 2), b = buildReturn(plain, 2, { earned: 30 });
  const diff = [...a.keys()].filter((i) => a[i] !== b[i]);
  assert.ok(diff.every((i) => i === 16 + 0 || (i >= petAt(a) + 103 && i < petAt(a) + 107) || i >= a.length - 4), 'gold bytes and the CRC only');
  assert.equal(b.length, a.length);
});

test('mission: one payment per villager per day, whatever the template', async () => {
  const t = await start();
  assert.equal((await t.claim(mid('tito', 'harvest', 'carrot', 3))).status, 200);
  const dup = await t.claim(mid('tito', 'harvest', 'carrot', 3));
  assert.deepEqual([dup.status, dup.body.error, dup.body.earned_today], [409, 'done', 9]);
  assert.equal((await t.claim(mid('tito', 'feed', '-', 3))).body.error, 'done', 'another template for the same villager is not another mission');
  assert.equal(t.row.earned, 9);
  assert.equal((await t.claim(mid('lula', 'water', '-', 3))).status, 200);
  assert.equal(t.row.earned, 18);
});

test('mission: the daily cap, partial payment at the edge, then refused; shared across trips of the same board; a new day starts over', async () => {
  const t = await start();
  const ids = [mid('tito', 'feed', '-', 3), mid('lula', 'feed', '-', 3), mid('pipo', 'feed', '-', 3), mid('bruno', 'feed', '-', 3)];   // 12 each
  const paid = [];
  for (const id of ids) { const r = await t.claim(id); paid.push(r.status === 200 ? [r.body.gold, r.body.capped] : r.body.error); }
  assert.deepEqual(paid, [[12, false], [12, false], [12, false], [12, false]]);
  const edge = await t.claim(mid('chispa', 'feed', '-', 3));
  assert.deepEqual([edge.status, edge.body.gold, edge.body.capped, edge.body.earned_today], [200, 2, true, 50], '48 + 12 would pass 50: only 2 are paid');
  assert.equal(t.row.earned, 50);
  const over = await t.claim(mid('perla', 'feed', '-', 3));
  assert.deepEqual([over.status, over.body.error, over.body.earned_today], [409, 'cap_reached', 50]);
  assert.equal(t.row.earned, 50);
  // the next trip of the same board, the same day: the cap is the pet's, not the trip's
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  await t.board.call('trip-return', { trip_id: TRIP_ID });
  await t.board.call('trip-ack', { trip_id: TRIP_ID });
  const next = await start({ src: fixture('keepsake.bin'), w: t.w, board: t.board, register: false });
  assert.deepEqual(next.claim0.missions, { day: D1, cap: 50, earned: 50, done: ['tito', 'lula', 'pipo', 'bruno', 'chispa'] });
  assert.equal((await next.claim(mid('perla', 'feed', '-', 3))).body.error, 'cap_reached');
  assert.equal(next.row.earned, 0);
  // another board has its own cap
  const other = await start({ w: t.w });
  assert.equal((await other.claim(mid('tito', 'feed', '-', 3))).status, 200);
  // the next town day: new ledger (06:00 is the boundary)
  t.w.now = at(D2, '05:00') / 1000;
  assert.equal((await next.claim(mid('perla', 'feed', '-', 3))).body.error, 'cap_reached', 'still the same town day at 05:00');
  t.w.now = at(D2, '06:01') / 1000;
  assert.equal((await next.claim(mid('perla', 'feed', '-', 3))).body.error, 'mission_expired', 'yesterday\'s request');
  const fresh = await next.claim(mid('perla', 'feed', '-', 3, D2));
  assert.deepEqual([fresh.status, fresh.body.gold, fresh.body.earned_today], [200, 12, 12]);
});

test('mission: every refusal has its code and changes nothing', async () => {
  const t = await start();
  for (const bad of ['', 'x', mid('nobody'), mid('tito', 'fly'), mid('tito', 'harvest', 'carrot', 9), mid('tito', 'water', 'carrot'), 7, null]) {
    const r = await t.claim(bad);
    assert.deepEqual([r.status, r.body.error], [400, 'bad_mission'], String(bad));
  }
  const old = await t.claim(mid('tito', 'water', '-', 2, '2026-10-25'));
  assert.deepEqual([old.status, old.body.error, old.body.day], [409, 'mission_expired', D1]);
  assert.equal((await t.claim(mid('tito', 'water', '-', 2, '2026-10-27'))).body.error, 'mission_expired', 'not tomorrow\'s either');
  assert.equal((await t.w.web('ab'.repeat(32)).call('trip-mission', { trip: t.ref, mission: mid('tito') })).body.error, 'bad_session');
  assert.equal((await t.w.web().call('trip-mission', { trip: t.ref, mission: mid('tito') })).status, 401);
  assert.equal(t.row.earned, 0);
  assert.equal(t.w.db.petDays.size, 0, 'a refused claim leaves no ledger');
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  const over = await t.claim(mid('tito'));
  assert.deepEqual([over.status, over.body.error], [409, 'trip_over']);
  assert.equal(t.row.earned, 0);
  const closed = await start({ extra: {} });                                                    // an old board cannot apply a gold change: no missions
  assert.deepEqual([(await closed.claim(mid('tito'))).status, (await closed.claim(mid('tito'))).body.error], [403, 'shop_closed']);
  assert.equal(closed.w.db.petDays.size, 0);
});

test('mission: two claims at once pay once; two villagers at once cannot pass the cap', async () => {
  const t = await start();
  const read = t.w.db.getPetDay; let waiting = [];                                                // both calls read the ledger before either one writes
  const slow = async (d, day) => { const row = await read(d, day); if (waiting) { await new Promise((go) => { waiting.push(go); if (waiting.length === 2) { waiting.forEach((f) => f()); waiting = null; } }); } return row && { ...row, done: [...row.done] }; };
  t.w.db.getPetDay = slow;
  const [a, b] = await Promise.all([t.claim(mid('tito', 'feed', '-', 3)), t.claim(mid('tito', 'feed', '-', 3))]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal([a, b].find((x) => x.status === 409).body.error, 'conflict');
  assert.equal(t.row.earned, 12);
  t.w.db.getPetDay = read;
  for (const v of ['lula', 'pipo', 'bruno']) await t.claim(mid(v, 'feed', '-', 3));             // 48 today
  waiting = []; t.w.db.getPetDay = slow;
  const [c, d] = await Promise.all([t.claim(mid('chispa', 'feed', '-', 3)), t.claim(mid('perla', 'feed', '-', 3))]);
  assert.deepEqual([c.status, d.status].sort(), [200, 409]);
  assert.equal(t.row.earned, 50, 'never past the cap');
});

test('mission: a recall between the day\'s ledger and the trip does not pay twice or crash', async () => {
  const t = await start();
  const upd = t.w.db.updateTrip;
  t.w.db.updateTrip = async (id, where, patch) => { if (patch.earned !== undefined) { t.w.db.updateTrip = upd; await t.board.call('trip-recall', { trip_id: TRIP_ID }); } return upd(id, where, patch); };
  const r = await t.claim(mid('tito', 'feed', '-', 3));
  assert.deepEqual([r.status, r.body.error], [409, 'trip_over']);
  assert.equal(t.row.earned, 0);
  assert.equal(t.w.db.petDays.get(`${t.board.deviceId}|${D1}`).earned, 12, 'the day keeps the count: forging a recall never earns more');
});

test('shop gold counts the earned gold: a pet short of gold can buy after a mission', async () => {
  const t = await start({ src: withGold(plain, 35) });
  assert.equal((await t.buy('cape')).body.error, 'no_gold');
  assert.equal((await t.claim(mid('tito', 'harvest', 'carrot', 3))).status, 200);
  assert.equal((await t.buyTool('sickle')).body.gold_left, 35 + 9 - 30);
  assert.equal((await t.buy('bow')).body.error, 'owned');
  const need = await t.buy('heart_cheeks');                                                       // 50 > 14
  assert.deepEqual([need.body.error, need.body.gold_left, need.body.price], ['no_gold', 14, 50]);
});

// ---- the client ------------------------------------------------------------------------------------------------------------------
const deps = (w) => ({ db: w.db, nowS: () => w.now, randomBytes: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), uuid: () => crypto.randomUUID(), townUrl: 'https://town/' });
const toFetch = (w) => async (url, init) => {
  const fn = url.split('/').pop();
  const out = await handle(fn, { method: init.method, headers: Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v])), body: new TextEncoder().encode(init.body) }, deps(w));
  return { status: out.status, json: async () => out.body };
};

test('the trip client: the claim carries the ledger, claimMission updates gold and ledger, errors teach', async () => {
  const w = world({ now: at(D1, '12:00') / 1000 }), board = w.board();
  await board.register();
  const s = await board.start(plain, { spend: 1 });
  const client = createTripClient({ base: 'https://x/functions/v1/trip', fetch: toFetch(w), setInterval: () => 1, clearInterval() {} });
  await client.claim(s.body.code, catalogue);
  assert.deepEqual(client.shop.missions, { day: D1, cap: 50, earned: 0, done: [] });
  const gold0 = client.shop.gold;
  const m = M.parseMission(mid('tito', 'harvest', 'carrot', 3));
  const ok = await client.claimMission(m);
  assert.deepEqual([ok.ok, ok.gold], [true, 9]);
  assert.deepEqual([client.shop.gold, client.shop.missions], [gold0 + 9, { day: D1, cap: 50, earned: 9, done: ['tito'] }]);
  const dup = await client.claimMission(m);
  assert.deepEqual([dup.ok, dup.error], [false, 'done']);
  assert.equal(client.shop.gold, gold0 + 9);
  const stale = await client.claimMission(M.parseMission(mid('lula', 'water', '-', 2, '2026-10-25')));
  assert.equal(stale.error, 'mission_expired');
  assert.equal((await createTripClient({ base: 'x', fetch: toFetch(w) }).claimMission(m)).error, 'bad_session');
});

test('the dev mock follows trip-mission: pays once per villager, caps, expires, shares the gold with the shop', async () => {
  const noon = at(D1, '12:00');
  const m = createMockShop('?gold=100');
  assert.deepEqual(m.shop.missions, { day: '', cap: 50, earned: 0, done: [] });
  const r = await m.claimMission(M.parseMission(mid('tito', 'harvest', 'carrot', 3)), noon);
  assert.deepEqual([r.ok, r.gold, m.shop.gold], [true, 9, 109]);
  assert.equal((await m.claimMission(M.parseMission(mid('tito', 'water', '-', 2)), noon)).error, 'done');
  assert.equal((await m.claimMission(M.parseMission(mid('lula', 'water', '-', 2, '2026-10-25')), noon)).error, 'mission_expired');
  assert.equal((await m.claimMission({ id: 'nope' }, noon)).error, 'bad_mission');
  const short = await m.buy('cape');                                                            // 120 > 109: the earned gold is what the shop sees
  assert.deepEqual([short.error, short.gold_left], ['no_gold', 109]);
  const capped = createMockShop('?gold=0&earned=45');
  const e = await capped.claimMission(M.parseMission(mid('pipo', 'feed', '-', 3)), noon);
  assert.deepEqual([e.gold, e.capped, e.earned_today], [5, true, 50]);
  assert.equal((await capped.claimMission(M.parseMission(mid('bruno', 'feed', '-', 3)), noon)).error, 'cap_reached');
  assert.equal((await createMockShop('?shop=closed').claimMission(M.parseMission(mid('tito')), noon)).error, 'shop_closed');
  const pinned = createMockShop('?npct=1793055600000');
  assert.equal((await pinned.claimMission(M.parseMission(mid('tito', 'feed', '-', 2)))).ok, true, 'the pinned dev clock decides the day');
});
