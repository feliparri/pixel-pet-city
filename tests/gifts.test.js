import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/gifts.js';
import * as S from '../supabase/functions/trip/gifts.js';
import { SEASON_KEYS as SERVER_KEYS } from '../supabase/functions/trip/events.js';
import { SEASONS, SEASON_KEYS, activeSeasons } from '../src/seasons.js';
import { zonedToMs, msToZoned, zoneOffset } from '../src/admin-time.js';
import { createGiftWorld, BURST_FRAME_MS } from '../src/gift-world.js';
import { BURST_FRAMES } from '../src/art/gifts.js';
import { isWalkable, tileAt, doorAt, spotAt, SPAWNS, PEN, PITCH, TRACK, HOUSES, SIGNS, getArea } from '../src/map.js';
import { decorTiles as xmasTiles } from '../src/christmas.js';
import { decorTiles as hallTiles } from '../src/halloween.js';
import { mulberry32, hashSeed } from '../src/life.js';

const at = (date, time = '12:00') => zonedToMs(date, time);
const HOUR = 3600e3;

// ---- slots -----------------------------------------------------------------------------------------------------------------------
test('a slot is a fixed 2 h window of UTC time from a fixed anchor', () => {
  assert.equal(G.SLOT_MS, 2 * HOUR);
  assert.equal(G.slotOf(G.ANCHOR_MS), 0);
  assert.equal(G.slotOf(G.ANCHOR_MS - 1), -1);
  assert.equal(G.slotOf(G.ANCHOR_MS + 2 * HOUR - 1), 0);
  assert.equal(G.slotOf(G.ANCHOR_MS + 2 * HOUR), 1);
  for (const ms of [1.8e12, 1.79e12 + 12345, Date.UTC(2027, 5, 1, 13, 59, 59, 999)]) {
    const s = G.slotOf(ms);
    assert.ok(G.slotStart(s) <= ms && ms < G.slotStart(s) + G.SLOT_MS, String(ms));
    assert.equal(G.slotStart(s) % (2 * HOUR), 0, 'boundaries are on even UTC hours');
  }
  assert.equal(G.PER_SLOT, 3);
});

test('slots go through both of Chile\'s clock changes without a skip, a repeat or a change of length', () => {
  const from = Date.UTC(2026, 0, 1), to = Date.UTC(2028, 0, 1);
  let changes = 0, prev = G.slotOf(from), off = zoneOffset(from);
  for (let t = from + 2 * HOUR; t < to; t += 2 * HOUR) {
    const s = G.slotOf(t);
    assert.equal(s, prev + 1, `${new Date(t).toISOString()}`);
    prev = s;
    const o = zoneOffset(t); if (o !== off) { changes++; off = o; }
  }
  assert.ok(changes >= 4, `the window holds ${changes} clock changes (two a year)`);
});

test('where a slot boundary falls on the Chile clock: even hours in winter (UTC-4), odd hours in summer (UTC-3)', () => {
  const hourOf = (ms) => Number(msToZoned(ms).time.slice(0, 2));
  const winter = G.slotStart(G.slotOf(at('2026-07-15'))), summer = G.slotStart(G.slotOf(at('2026-12-15')));
  assert.equal(zoneOffset(winter), -240);
  assert.equal(hourOf(winter) % 2, 0);
  assert.equal(zoneOffset(summer), -180);
  assert.equal(hourOf(summer) % 2, 1);
});

test('the previous slot is accepted for 2 minutes after it ended, never a later one', () => {
  const s = G.slotOf(1.8e12), start = G.slotStart(s);
  assert.ok(G.slotAccepted(s, start) && G.slotAccepted(s, start + G.SLOT_MS - 1));
  assert.ok(G.slotAccepted(s - 1, start + 119999));
  assert.ok(!G.slotAccepted(s - 1, start + 120000));
  assert.ok(!G.slotAccepted(s - 2, start));
  assert.ok(!G.slotAccepted(s + 1, start + G.SLOT_MS - 1), 'not the next one');
  assert.ok(G.slotAccepted(s, start + G.SLOT_MS - 1) && !G.slotAccepted(s, start + G.SLOT_MS + G.GRACE_MS), 'a slot is over for good after its grace');
});

// ---- ids and prices -----------------------------------------------------------------------------------------------------------------
test('a gift id is <season>:<slot>:<n> and has one spelling', () => {
  assert.equal(G.giftId('christmas', 3719, 2), 'christmas:3719:2');
  assert.deepEqual(G.parseGiftId('christmas:3719:2'), { id: 'christmas:3719:2', season: 'christmas', slot: 3719, n: 2, reward: G.rewardOf('christmas:3719:2') });
  for (const bad of ['', 'x', 'christmas:3719', 'christmas:3719:3', 'christmas:03719:0', 'christmas:3719:00', 'easter:3719:0', 'Christmas:3719:0', 'christmas:-3:0', 'christmas:3719:0 ', ' christmas:3719:0', 'christmas:99999999:0', 'christmas:3719:0:1', 7, null, undefined, {}]) assert.equal(G.parseGiftId(bad), null, String(bad));
});

test('the price of a gift is 2 to 5 coins, a pure function of its id, and every price shows up', () => {
  const seen = new Map();
  for (let slot = 3000; slot < 4000; slot++) for (let n = 0; n < 3; n++) for (const season of SEASON_KEYS) {
    const id = G.giftId(season, slot, n), r = G.rewardOf(id);
    assert.ok(Number.isInteger(r) && r >= G.REWARD_MIN && r <= G.REWARD_MAX, id);
    assert.equal(G.rewardOf(id), r);
    seen.set(r, (seen.get(r) || 0) + 1);
  }
  assert.deepEqual([...seen.keys()].sort(), [2, 3, 4, 5]);
  const total = [...seen.values()].reduce((a, b) => a + b, 0);
  for (const [r, c] of seen) assert.ok(c > total * 0.18 && c < total * 0.32, `price ${r} comes up ${c} of ${total}`);
});

// ---- where -------------------------------------------------------------------------------------------------------------------------
const inR = (r, x, y, p = 0) => x >= r.x - p && y >= r.y - p && x < r.x + r.w + p && y < r.y + r.h + p;

test('every gift tile is open ground that is reachable and bare: no door, mat, pad, spawn, pen, pitch, track, sign, house or decoration', () => {
  const taken = new Set();
  for (const d of [xmasTiles('town'), hallTiles('town')]) for (const k of Object.keys(d)) for (const [x, y] of d[k]) { taken.add(`${x},${y}`); if (k === 'tree' || k === 'patch') taken.add(`${x + 1},${y}`); }
  const seen = new Set([SPAWNS[0].join()]), q = [SPAWNS[0]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${y + dy}`; if (!seen.has(k) && isWalkable(x + dx, y + dy, 'town') && !doorAt(x + dx, y + dy, 'town')) { seen.add(k); q.push([x + dx, y + dy]); } } }
  const area = getArea('town'), all = new Set();
  assert.ok(G.GIFT_TILES.length >= 60);
  for (const [x, y] of G.GIFT_TILES) {
    const at = `${x},${y}`;
    assert.ok(Number.isInteger(x) && Number.isInteger(y) && x > 0 && y > 0 && x < area.w - 1 && y < area.h - 1, `${at} is out of the town`);
    assert.ok(!all.has(at), `${at} is listed twice`); all.add(at);
    assert.ok(isWalkable(x, y, 'town') && '.,+='.includes(tileAt(x, y, 'town')), `${at} is on '${tileAt(x, y, 'town')}'`);
    assert.ok(seen.has(at), `${at} cannot be reached`);
    assert.equal(doorAt(x, y, 'town'), null, `${at} is a door`);
    assert.equal(spotAt(x, y), null, `${at} is a pad`);
    assert.ok(!SPAWNS.some(([sx, sy]) => sx === x && sy === y), `${at} is a spawn`);
    assert.ok(!inR(PEN, x, y, 1) && !inR(PITCH, x, y, 1), `${at} is in the pen or on the pitch`);
    assert.ok(!(x >= TRACK.x0 - 1 && x <= TRACK.x1 + 1 && y >= TRACK.yTop - 1 && y <= TRACK.yBottom), `${at} is on the track`);
    assert.ok(!taken.has(at), `${at} holds a decoration`);
    assert.ok(!HOUSES.some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y <= h.y + 4), `${at} is at a house`);
    assert.ok(!SIGNS.some((s) => s.area === 'town' && s.x === x && s.y === y), `${at} is a sign`);
  }
  assert.ok(G.GIFT_TILES.some(([, y]) => y >= 33) && G.GIFT_TILES.some(([, y]) => y < 29), 'the Parque and the town both have gifts');
});

test('the same room, slot and gift always lie on the same tile; the three of a slot are on three different tiles', () => {
  const rooms = ['FOCA-LUNA-42', 'ABCD-1234', 'x', 'GATO-NUBE-7'];
  for (const room of rooms) for (let slot = 3700; slot < 3900; slot++) {
    const a = G.giftTiles(room, slot), b = G.giftTiles(room, slot);
    assert.deepEqual(a, b);
    assert.equal(a.length, 3);
    assert.equal(new Set(a.map((t) => t.join())).size, 3, `${room} ${slot}: two gifts share a tile`);
    for (const t of a) assert.ok(G.GIFT_TILES.includes(t));
  }
  const one = G.giftTiles('FOCA-LUNA-42', 3719);
  assert.deepEqual(one[0], G.GIFT_TILES[Math.floor(mulberry32(hashSeed('FOCA-LUNA-42:gift:3719:0'))() * G.GIFT_TILES.length)], 'gift 0 starts at its own seed');
  assert.notDeepEqual(G.giftTiles('FOCA-LUNA-42', 3720), one, 'the next slot is somewhere else');
  assert.notDeepEqual(G.giftTiles('OTRA-SALA-1', 3719), one, 'another room is somewhere else');
  const used = new Set();
  for (let slot = 0; slot < 400; slot++) for (const t of G.giftTiles('FOCA-LUNA-42', slot)) used.add(t.join());
  assert.ok(used.size > G.GIFT_TILES.length * 0.9, `${used.size} of ${G.GIFT_TILES.length} tiles come up`);
});

test('giftsAt: 3 gifts of the current slot while a season is on, none otherwise; the first season in the registry\'s order names them', () => {
  const ms = at('2026-12-10');
  assert.deepEqual(G.giftsAt('R', ms, new Set()), []);
  assert.deepEqual(G.giftsAt('R', ms, null), []);
  assert.deepEqual(G.giftsAt('R', NaN, new Set(['christmas'])), []);
  const gs = G.giftsAt('R', ms, new Set(['christmas']));
  assert.deepEqual(gs.map((g) => g.id), [0, 1, 2].map((n) => `christmas:${G.slotOf(ms)}:${n}`));
  for (const g of gs) { assert.equal(g.reward, G.rewardOf(g.id)); assert.deepEqual(G.parseGiftId(g.id).id, g.id); }
  assert.deepEqual(G.giftsAt('R', ms, new Set(['christmas', 'halloween'])).map((g) => g.season), ['halloween', 'halloween', 'halloween']);
  assert.deepEqual(G.giftsAt('R', ms, new Set(['christmas'])).map((g) => [g.x, g.y]), G.giftTiles('R', G.slotOf(ms)));
  assert.deepEqual(G.giftsAt('R', ms, new Set(['christmas'])), G.giftsAt('R', ms + 60000, new Set(['christmas'])), 'the same all slot long');
  assert.notDeepEqual(G.giftsAt('R', ms, new Set(['christmas'])).map((g) => g.id), G.giftsAt('R', ms + 2 * HOUR, new Set(['christmas'])).map((g) => g.id));
});

// ---- what the pet opened ---------------------------------------------------------------------------------------------------------------
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('opened ids are kept in memory and in the browser, per pet; a broken storage costs nothing', () => {
  const st = memStorage(), a = G.createOpened(st);
  a.owner('trip-1'); a.add('christmas:3719:0'); a.add('christmas:3719:1');
  assert.ok(a.has('christmas:3719:0') && !a.has('christmas:3719:2'));
  const b = G.createOpened(st);                                           // another page load, the same pet
  b.owner('trip-1');
  assert.ok(b.has('christmas:3719:0') && b.has('christmas:3719:1') && b.size === 2);
  b.owner('trip-2'); assert.equal(b.size, 0, 'another pet starts clean');
  b.owner('trip-1'); assert.equal(b.size, 2);
  const v = G.createOpened(st); v.owner(null); v.add('christmas:3719:2'); assert.ok(!v.has('christmas:3719:2'), 'a visitor opens nothing');
  st.setItem('city.gifts', '{not json'); const c = G.createOpened(st); c.owner('trip-1'); assert.equal(c.size, 0);
  st.setItem('city.gifts', JSON.stringify({ owner: 'trip-1', ids: ['christmas:3719:0', 'junk', 5] })); const d = G.createOpened(st); d.owner('trip-1'); assert.equal(d.size, 1, 'junk ids are dropped');
  const boom = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const e = G.createOpened(boom); e.owner('t'); e.add('christmas:3719:0'); assert.ok(e.has('christmas:3719:0'));
  const none = G.createOpened(null); none.owner('t'); none.add('christmas:3719:0'); assert.ok(none.has('christmas:3719:0'));
  d.prune(3719 + 14); assert.equal(d.size, 1); d.prune(3719 + 15); assert.equal(d.size, 0, 'a day and a slot later it is forgotten');
});

test('the lines: the cap and the visitor hint, in Spanish; a gift that is gone has no line', () => {
  assert.equal(G.GIFT_CAP_LINE, 'Ya abriste muchos regalos hoy');
  assert.equal(G.HINT_NO_TRIP, 'Viaja con tu mascota para abrir regalos');
  assert.equal(G.GIFT_POP(4), '+4 monedas');
  for (const e of ['gift_cap', 'cap_reached']) assert.equal(G.giftErrorText({ error: e }), G.GIFT_CAP_LINE);
  for (const e of ['claimed', 'gift_expired', 'season_off', 'bad_gift']) assert.equal(G.giftErrorText({ error: e }), null);
  for (const e of ['trip_over', 'bad_session', 'network', 'whatever', 'try_again']) assert.ok(G.giftErrorText({ error: e }).length > 8);
  assert.deepEqual(G.giftOutcome({ ok: true, gold: 4 }), { kind: 'paid', text: '+4 monedas' });
  assert.deepEqual(G.giftOutcome({ ok: false, error: 'claimed' }), { kind: 'gone', text: null });
  assert.deepEqual(G.giftOutcome({ ok: false, error: 'gift_cap' }), { kind: 'cap', text: 'Ya abriste muchos regalos hoy' });
  assert.equal(G.giftOutcome({ ok: false, error: 'cap_reached' }).kind, 'cap');
  assert.equal(G.giftOutcome({ ok: false, error: 'network' }).kind, 'retry');
});

// ---- the gifts as the screen sees them ---------------------------------------------------------------------------------------------------
const fakeArt = { giftArt: (season) => ({ frames: [{ id: `${season}0` }, { id: `${season}1` }], lits: [{ id: `l${season}0` }, { id: `l${season}1` }], glow: { z: 7, r: 16, rgb: '255,214,130' } }), burstFrames: () => [{ id: 'b0' }, { id: 'b1' }, { id: 'b2' }] };

test('the gift world: the list is the slot\'s gifts, bobbing and twinkling; opening one plays a burst and removes it; it stays gone', () => {
  const st = memStorage(), ms = at('2026-12-10'), xmas = new Set(['christmas']);
  const w = createGiftWorld({ room: 'FOCA-LUNA-42', storage: st, art: fakeArt });
  assert.equal(w.update(ms, new Set(), 'trip', 0), null, 'no season, no gifts');
  const list = w.update(ms, xmas, 'trip', 0);
  assert.equal(list.length, 3);
  assert.ok(Array.isArray(list.glows) && list.glows.length === 3 && list.glows.every((g) => g.kind === 'lamp'));
  for (const d of list) { assert.ok(d.sprite && d.lit && Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.lift) && d.glows.length === 1); assert.equal(d.x % 16, 8); assert.equal(d.y % 16, 15); }
  assert.equal(w.update(ms, xmas, 'trip', 100), list, 'the same list, animated in place');
  const seenLift = new Set(), seenId = new Set();
  for (let t = 0; t < 4000; t += 50) { w.update(ms, xmas, 'trip', t); for (const d of list) { seenLift.add(d.lift); seenId.add(d.id); } assert.ok(list.every((d) => d.lift >= 0 && d.lift <= 3)); }
  assert.ok(seenLift.size >= 3, 'it bobs'); assert.equal(seenId.size, 6, 'two twinkle frames each');
  const first = G.giftsAt('FOCA-LUNA-42', ms, xmas)[0];
  assert.deepEqual(w.near(first.x, first.y).id, first.id);
  assert.deepEqual(w.near(first.x + 1, first.y - 1).id, first.id, 'next to it, on a diagonal, counts');
  assert.equal(w.near(first.x + 2, first.y), null);
  assert.equal(w.at(first.x, first.y).id, first.id);
  assert.equal(w.at(first.x + 1, first.y), null);
  w.open(first.id, 5000);
  assert.ok(w.isOpen(first.id));
  const after = w.update(ms, xmas, 'trip', 5001);
  assert.equal(after.length, 3, 'two gifts and a burst');
  assert.equal(after.filter((d) => d.gift).length, 2);
  assert.equal(w.near(first.x, first.y), null);
  const bst = after.find((d) => d.burst);
  assert.deepEqual([bst.x, bst.y], [first.x * 16 + 8, first.y * 16 + 15]);
  const ids = [];
  for (let t = 5001; t < 5000 + BURST_FRAME_MS * BURST_FRAMES; t += 20) { const l = w.update(ms, xmas, 'trip', t); ids.push(l.find((d) => d.burst).sprite.id); }
  assert.deepEqual([...new Set(ids)], ['b0', 'b1', 'b2']);
  const gone = w.update(ms, xmas, 'trip', 5000 + BURST_FRAME_MS * BURST_FRAMES + 1);
  assert.equal(gone.length, 2, 'the burst is over');
  const again = createGiftWorld({ room: 'FOCA-LUNA-42', storage: st, art: fakeArt });           // another page load: still opened
  assert.equal(again.update(ms, xmas, 'trip', 0).length, 2);
  assert.equal(createGiftWorld({ room: 'FOCA-LUNA-42', storage: st, art: fakeArt }).update(ms, xmas, 'other-trip', 0).length, 3, 'another pet sees all three');
  assert.equal(w.update(ms + 2 * HOUR, xmas, 'trip', 0).length, 3, 'the next slot brings three new ones');
  w.dismiss(w.update(ms + 2 * HOUR, xmas, 'trip', 0)[0].gift.id);
  assert.equal(w.update(ms + 2 * HOUR, xmas, 'trip', 1).length, 2, 'a dismissed gift goes without a burst');
});

test('the gift world: a visitor sees the gifts and opens none; the season off takes them away; art exists for every season, known or not', async () => {
  const ms = at('2026-12-10'), w = createGiftWorld({ room: 'R', art: fakeArt });
  const list = w.update(ms, new Set(['christmas']), null, 0);
  assert.equal(list.length, 3);
  w.open(list[0].gift.id, 10);
  assert.equal(w.update(ms, new Set(['christmas']), null, 11).filter((d) => d.gift).length, 3, 'nothing is remembered for a visitor');
  assert.deepEqual(w.update(ms, new Set(), null, 12).filter((d) => d.gift), [], 'the season off takes the gifts away (only the burst plays out)');
  assert.equal(w.update(ms, new Set(), null, 12 + BURST_FRAME_MS * BURST_FRAMES), null);
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) };
  try {
    const A = await import('../src/art/gifts.js');
    for (const season of [...SEASON_KEYS, 'easter']) { const a = A.giftArt(season); assert.equal(a.frames.length, 2); assert.equal(a.lits.length, 2); assert.ok(a.glow.r > 0 && a.glow.rgb); assert.equal(a.frames[0].width, A.GIFT_SIZE.w); }
    assert.equal(A.giftArt('easter'), A.giftArt('nothing'), 'one fallback for every unknown season');
    assert.notEqual(A.giftArt('christmas'), A.giftArt('halloween'));
    assert.equal(A.burstFrames().length, BURST_FRAMES);
  } finally { delete globalThis.document; }
});

// ---- the town and the server agree --------------------------------------------------------------------------------------------------------
test('the server mirrors the town: slots, ids, prices and the seasons it knows', () => {
  for (const k of ['SLOT_MS', 'ANCHOR_MS', 'PER_SLOT', 'GRACE_MS', 'REWARD_MIN', 'REWARD_MAX', 'GIFT_DAILY_CAP']) assert.equal(S[k], G[k], k);
  assert.equal(G.GIFT_DAILY_CAP, 20);
  assert.deepEqual(SERVER_KEYS, SEASON_KEYS);
  assert.deepEqual(Object.keys(S.SEASON_WINDOWS), SEASON_KEYS);
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 7 * 3600e3 + 12345) {
    assert.equal(S.slotOf(t), G.slotOf(t)); assert.equal(S.slotStart(S.slotOf(t)), G.slotStart(G.slotOf(t)));
    for (const d of [-1, 0, 1]) { const slot = G.slotOf(t) + d; assert.equal(S.slotAccepted(slot, t), G.slotAccepted(slot, t)); }
  }
  for (let slot = 3000; slot < 4000; slot += 7) for (const season of [...SEASON_KEYS, 'easter']) for (const n of [0, 1, 2, 3]) {
    const id = G.giftId(season, slot, n);
    assert.equal(S.rewardOf(id), G.rewardOf(id), id);
    assert.deepEqual(S.parseGiftId(id), G.parseGiftId(id), id);
  }
  for (const bad of ['', 'christmas:03719:0', 'christmas:3719:0:0', 'x', 5, null]) assert.deepEqual(S.parseGiftId(bad), G.parseGiftId(bad));
});

test('the server\'s default windows are the registry\'s, for every year', () => {
  for (let y = 2025; y <= 2031; y++) for (const k of SEASON_KEYS) assert.deepEqual(S.SEASON_WINDOWS[k](y), SEASONS[k].window(y), `${k} ${y}`);
});

test('the server\'s seasons on, with the owner\'s overrides, equal the town\'s activeSeasons', () => {
  const row = (season, year, mode, a, b) => ({ season, year, mode, starts_at: a == null ? null : new Date(a).toISOString(), ends_at: b == null ? null : new Date(b).toISOString() });
  const client = (r) => ({ season: r.season, year: r.year, mode: r.mode, starts_ms: r.starts_at ? Date.parse(r.starts_at) : null, ends_ms: r.ends_at ? Date.parse(r.ends_at) : null });
  const rowSets = [
    [], [row('christmas', 2026, 'off')], [row('halloween', 2026, 'dates', at('2026-09-20'), at('2026-10-10'))], [row('christmas', 2026, 'dates', at('2026-12-20'), at('2027-02-01'))],
    [row('halloween', 2026, 'on')], [row('christmas', 2026, 'on'), row('halloween', 2027, 'off')], [row('christmas', 2025, 'dates', at('2026-01-02'), at('2026-03-01'))],
    [row('halloween', 2026, 'dates', at('2026-11-01'), at('2026-11-20')), row('christmas', 2026, 'dates', at('2026-11-10'), at('2027-01-10'))],
    [{ season: 'easter', year: 2026, mode: 'on' }, row('halloween', 2026, 'dates', at('2026-10-10'), at('2026-10-10')), { season: 'christmas', year: 'x', mode: 'on' }, null],
  ];
  let on = 0;
  for (const rows of rowSets) for (let t = at('2025-09-01'); t < at('2028-02-01'); t += 67 * 3600e3 + 777) {
    const a = [...S.seasonsOn(t, rows)], b = [...activeSeasons(t, rows.map((r) => (r && r.starts_at !== undefined ? client(r) : r)))];
    assert.deepEqual(a, b, `${new Date(t).toISOString()} ${JSON.stringify(rows)}`);
    on += a.length;
  }
  assert.ok(on > 100, 'the seasons are on for a good part of the sample');
});

test('the actions in serve.ts are the handlers\' routes, trip-gift among them', async () => {
  const src = readFileSync(new URL('../supabase/functions/trip/serve.ts', import.meta.url), 'utf8');
  const acts = [...src.match(/const ACTIONS[^{]*\{([^}]*)\}/)[1].matchAll(/'([a-z-]+)': true/g)].map((m) => m[1]);
  assert.ok(acts.includes('trip-gift'));
  const { handle } = await import('../supabase/functions/trip/handlers.js');
  for (const fn of acts) assert.notEqual((await handle(fn, { method: 'POST', headers: {}, body: new Uint8Array() }, { db: {}, nowS: () => 0 })).body.error, 'unknown_function', fn);
  assert.equal((await handle('trip-gifts', { method: 'POST', headers: {}, body: new Uint8Array() }, {})).status, 404);
});
