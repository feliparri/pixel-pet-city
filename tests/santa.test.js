import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/gifts.js';
import { walkOf, santaAt, santaGiftsAt, ROUTE, WALK_MS, GIFT_LIFE_MS } from '../src/santa.js';
import { createGiftWorld } from '../src/gift-world.js';
import { isWalkable, tileAt, doorAt, spotAt, SPAWNS, inPlaza, TILE } from '../src/map.js';
import { decorTiles as xmasTiles } from '../src/christmas.js';
import { decorTiles as hallTiles } from '../src/halloween.js';
import { zonedToMs } from '../src/admin-time.js';

const XMAS = new Set(['christmas']), MIN = 60_000;
const slot0 = G.walkSlotOf(zonedToMs('2026-12-10', '12:00'));

test('Santa\'s walk: one per 40 min slot, starting in its first 28 min, ending with its gifts before the slot is over, the same on every call', () => {
  assert.equal(G.WALK_SLOT_MS, 40 * MIN);
  for (const room of ['FOCA-LUNA-42', 'R', 'GATO-NUBE-7']) for (let slot = slot0; slot < slot0 + 200; slot++) {
    const w = walkOf(room, slot), at = G.walkSlotStart(slot);
    assert.deepEqual(w, walkOf(room, slot));
    assert.ok(w.start >= at && w.start < at + G.WALK_START_MAX_MS, 'starts in the first 28 min');
    assert.equal(w.end - w.start, WALK_MS);
    assert.ok(w.dir === 1 || w.dir === -1);
    assert.equal(w.gifts.length, 5);
    for (const g of w.gifts) assert.ok(g.expireAt < at + G.WALK_SLOT_MS, `${room} ${slot}: a gift outlives the slot`);
  }
});

test('Santa\'s walks come about every 40 minutes (12 to 68 min apart), differ between rooms and between slots, and both directions happen', () => {
  const starts = Array.from({ length: 300 }, (_, i) => walkOf('FOCA-LUNA-42', slot0 + i).start), gaps = starts.slice(1).map((s, i) => (s - starts[i]) / MIN);
  assert.ok(Math.min(...gaps) >= 12 - 1e-9 && Math.max(...gaps) <= 68 + 1e-9);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(mean > 36 && mean < 44, `mean gap ${mean}`);
  assert.notEqual(walkOf('A', slot0).start, walkOf('B', slot0).start);
  assert.notEqual(walkOf('A', slot0).start - G.walkSlotStart(slot0), walkOf('A', slot0 + 1).start - G.walkSlotStart(slot0 + 1));
  const dirs = new Set(Array.from({ length: 40 }, (_, i) => walkOf('A', slot0 + i).dir));
  assert.deepEqual([...dirs].sort(), [-1, 1]);
});

test('Santa\'s gifts: five along his path, dropped in order as he passes, each gone 5 minutes after it was dropped; ids are santa:<walk slot>:<n> and pay 20 to 30', () => {
  const w = walkOf('R', slot0 + 3);
  assert.deepEqual(w.gifts.map((g) => g.id), [0, 1, 2, 3, 4].map((n) => `santa:${slot0 + 3}:${n}`));
  for (const g of w.gifts) { assert.equal(g.reward, G.santaRewardOf(g.id)); assert.ok(g.reward >= 20 && g.reward <= 30); assert.equal(G.parseGiftId(g.id).kind, 'santa'); assert.equal(g.expireAt - g.dropAt, GIFT_LIFE_MS); }
  const xs = w.gifts.map((g) => g.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b) === xs ? xs : w.dir > 0 ? [...xs].sort((a, b) => a - b) : [...xs].sort((a, b) => b - a), 'they follow his direction');
  assert.ok(new Set(xs).size === 5 && xs.every((x) => x >= ROUTE.x0 && x <= ROUTE.x1));
  assert.deepEqual(santaGiftsAt('R', w.start - 1, XMAS), []);
  assert.deepEqual(santaGiftsAt('R', w.gifts[0].dropAt, XMAS).map((g) => g.n), [0]);
  assert.deepEqual(santaGiftsAt('R', w.gifts[2].dropAt + 1, XMAS).map((g) => g.n), [0, 1, 2]);
  assert.deepEqual(santaGiftsAt('R', w.gifts[4].dropAt, XMAS).map((g) => g.n), [0, 1, 2, 3, 4], 'all five at once while the last was just dropped');
  assert.deepEqual(santaGiftsAt('R', w.gifts[0].expireAt, XMAS).map((g) => g.n), [1, 2, 3, 4], 'the first one vanished');
  assert.deepEqual(santaGiftsAt('R', w.gifts[4].expireAt, XMAS), [], 'all gone');
  assert.deepEqual(santaGiftsAt('R', w.gifts[2].dropAt, new Set()), [], 'no Christmas, no gifts');
  assert.deepEqual(santaGiftsAt('R', w.gifts[2].dropAt, null), []);
  assert.ok(santaGiftsAt('R', w.gifts[2].dropAt, XMAS).every((g) => g.season === 'christmas' && g.kind === 'santa' && g.slot === slot0 + 3 && g.y === ROUTE.y));
});

test('Santa walks along the route at a steady pace, in his direction, only while Christmas is on', () => {
  const w = walkOf('R', slot0 + 5);
  assert.equal(santaAt('R', w.start - 1, XMAS), null);
  assert.equal(santaAt('R', w.end, XMAS), null);
  assert.equal(santaAt('R', w.start + 1000, new Set()), null);
  assert.equal(santaAt('R', NaN, XMAS), null);
  const a = santaAt('R', w.start, XMAS), b = santaAt('R', w.start + WALK_MS / 2, XMAS), c = santaAt('R', w.end - 1, XMAS);
  const mid = ((ROUTE.x0 + ROUTE.x1) / 2) * TILE + TILE / 2;
  assert.ok(Math.abs(b.x - mid) < 1, 'half way at half time');
  assert.equal(a.y, ROUTE.y * TILE + TILE - 1);
  assert.ok(w.dir > 0 ? a.x < b.x && b.x < c.x : a.x > b.x && b.x > c.x);
  assert.ok(Math.abs(a.x - (w.dir > 0 ? ROUTE.x0 : ROUTE.x1) * TILE - TILE / 2) < 1 && Math.abs(c.x - (w.dir > 0 ? ROUTE.x1 : ROUTE.x0) * TILE - TILE / 2) < 20);
  assert.deepEqual([a.dir, new Set([0, 1, 2, 3, 4, 5].map((i) => santaAt('R', w.start + i * 130, XMAS).frame)).size], [w.dir, 2], 'the stride alternates');
  assert.deepEqual(santaAt('R', w.start + 5000, XMAS), santaAt('R', w.start + 5000, XMAS));
});

test('Santa\'s route and every gift tile on it are bare plaza ground: walkable, reachable, no door, mat, pad, spawn, decoration or hidden gift', () => {
  const taken = new Set();
  for (const d of [xmasTiles('town'), hallTiles('town')]) for (const k of Object.keys(d)) for (const [x, y] of d[k]) { taken.add(`${x},${y}`); if (k === 'tree' || k === 'patch') taken.add(`${x + 1},${y}`); }
  for (const [x, y] of G.GIFT_TILES) taken.add(`${x},${y}`);
  for (let x = ROUTE.x0; x <= ROUTE.x1; x++) {
    const at = `${x},${ROUTE.y}`;
    assert.ok(isWalkable(x, ROUTE.y, 'town') && '.,+='.includes(tileAt(x, ROUTE.y, 'town')), `${at} is on '${tileAt(x, ROUTE.y, 'town')}'`);
    assert.equal(doorAt(x, ROUTE.y, 'town'), null, `${at} is a door`);
    assert.equal(spotAt(x, ROUTE.y), null, `${at} is a pad`);
  }
  const giftXs = new Set(); for (let s = slot0; s < slot0 + 50; s++) for (const g of walkOf('R', s).gifts) giftXs.add(g.x);
  for (const x of giftXs) {                                                                                    // a gift of his lies on a tile no one else uses: the route may cross a hidden gift's tile, a gift never lies on it
    const at = `${x},${ROUTE.y}`;
    assert.ok(!SPAWNS.some(([sx, sy]) => sx === x && sy === ROUTE.y), `${at} is a spawn`);
    assert.ok(!taken.has(at), `${at} holds a decoration or a hidden gift`);
  }
  assert.equal(giftXs.size, 5);
  assert.ok(inPlaza(ROUTE.x0, ROUTE.y) && inPlaza(24, ROUTE.y), 'it crosses the plaza');
});

test('the gift world draws Santa and his gifts, and a gift of his can be opened like any other', () => {
  const w = walkOf('FOCA-LUNA-42', slot0 + 7), mk = (n) => ({ id: n, w: 16, h: 24 });
  const art = {
    giftArt: (k) => ({ frames: [{ id: `${k}0` }, { id: `${k}1` }], lits: [{ id: `l${k}0` }, { id: `l${k}1` }], glow: { z: 7, r: 16, rgb: '1,2,3' } }), burstFrames: () => [{ id: 'b0' }, { id: 'b1' }, { id: 'b2' }],
    santaArt: () => ({ frames: { right: [mk('r0'), mk('r1')], left: [mk('l0'), mk('l1')] }, lits: { right: [mk('lr0'), mk('lr1')], left: [mk('ll0'), mk('ll1')] }, size: { w: 16, h: 24 }, glow: { z: 12, r: 20, rgb: '255,214,130' } }),
  };
  const gw = createGiftWorld({ room: 'FOCA-LUNA-42', art });
  assert.equal(gw.update(w.start - MIN, XMAS, 'trip', 0).filter((d) => d.santa || (d.gift && d.gift.kind === 'santa')).length, 0, 'not yet');
  const t = w.start + 20_000, list = gw.update(t, XMAS, 'trip', 0), s = list.find((d) => d.santa);
  assert.ok(s && !s.gift && Number.isFinite(s.x) && s.sprite && s.lit && s.glows.length === 1);
  assert.ok(/^[rl][01]$/.test(s.sprite.id) && s.sprite.id[0] === (w.dir > 0 ? 'r' : 'l'), 'a stride frame facing his way');
  assert.ok(s.id.startsWith(w.dir > 0 ? 'santa#right' : 'santa#left'));
  const x0 = s.x, l2 = gw.update(t + 12_000, XMAS, 'trip', 1);
  assert.ok(Math.abs(l2.find((d) => d.santa).x - x0) > 10, 'he moved');
  assert.ok(list.glows.length >= 1 && list.glows.every((g) => g.kind === 'lamp'));
  const dropped = list.filter((d) => d.gift && d.gift.kind === 'santa');
  assert.ok(dropped.length >= 1 && dropped.every((d) => d.gift.id.startsWith('santa:') && d.art.glow));
  const g = dropped[0].gift;
  assert.deepEqual(gw.near(g.x, g.y).id, g.id);
  assert.equal(gw.at(g.x, g.y).id, g.id);
  gw.open(g.id, 100);
  assert.ok(gw.isOpen(g.id));
  assert.equal(gw.update(t, XMAS, 'trip', 101).filter((d) => d.gift && d.gift.id === g.id).length, 0, 'it is gone');
  const late = gw.update(w.gifts[4].expireAt + 1000, XMAS, 'trip', 200);
  assert.ok(!late || !late.some((d) => d.santa || (d.gift && d.gift.kind === 'santa')), 'the walk and its gifts are over');
  assert.deepEqual((gw.update(t, new Set(), 'trip', 300) || []).filter((d) => !d.burst), [], 'no Christmas: nothing of Santa\'s (only a burst plays out)');
  const noArt = createGiftWorld({ room: 'FOCA-LUNA-42', art: { ...art, santaArt: undefined } });
  assert.ok(!noArt.update(t, XMAS, 'trip', 0).some((d) => d.santa), 'a stand-in without Santa\'s art draws no Santa');
});

test('Santa\'s art: four canvases of 32 x 48, as big as a pet (two strides, both ways) with their lit twins, a glow, and a gift art of its own', async () => {
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) };
  try {
    const A = await import('../src/art/santa.js'), GA = await import('../src/art/gifts.js');
    const a = A.santaArt();
    assert.equal(A.santaArt(), a, 'built once');
    for (const k of ['frames', 'lits']) for (const side of ['right', 'left']) { assert.equal(a[k][side].length, 2); for (const c of a[k][side]) assert.deepEqual([c.width, c.height], [32, 48]); }
    assert.ok(a.glow.r > 0 && a.glow.rgb);
    assert.notEqual(GA.giftArt('santa'), GA.giftArt('christmas'), 'Santa\'s gifts do not look like the hidden ones');
    assert.equal(GA.giftArt('santa').frames.length, 2);
  } finally { delete globalThis.document; }
});
