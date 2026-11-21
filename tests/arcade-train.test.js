import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainGame, step, moveLane, botDir, scoreOf, speedAt, difficultyAt, gapSeconds, TRAIN, next } from '../src/arcade/train.js';

const MS = 1000 / 60;
const run = (s, seconds, bot = false) => { for (let i = 0; i < seconds * 60 && !s.over; i++) { if (bot) { const d = botDir(s); if (d) moveLane(s, d); } step(s, MS); } return s; };
const trains = (s) => s.objs.filter((o) => o.kind === 'train');
const rowsOf = (s) => { const m = new Map(); for (const o of trains(s)) { const k = Math.round(o.z); m.set(k, [...(m.get(k) || []), o]); } return m; };

test('the same seed gives the same run, another seed another', () => {
  const sig = (seed) => { const s = createTrainGame(seed); run(s, 20, true); return JSON.stringify([s.objs.map((o) => [o.kind, o.lane, Math.round(o.z * 100), o.len]), s.coins, Math.round(s.dist)]); };
  assert.equal(sig(7), sig(7)); assert.notEqual(sig(7), sig(8));
  const a = { rng: 5 }, b = { rng: 5 }; assert.equal(next(a), next(b));
});

test('spawn rules: never all three lanes blocked in a row, never more than two trains per row', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = createTrainGame(seed);
    const seen = new Map();
    for (let i = 0; i < 60 * 90; i++) { step(s, MS); for (const o of trains(s)) { const k = o.id; if (!seen.has(k)) seen.set(k, o); } }
    const byFront = new Map();
    for (const o of seen.values()) { const k = Math.round(o.z + s.dist) ; byFront.set(k, new Set([...(byFront.get(k) || []), o.lane])); }
    // trains spawned together share a front in world coordinates
    for (const lanes of byFront.values()) assert.ok(lanes.size <= 2, `seed ${seed}: ${lanes.size} blocked`);
  }
});

test('trains stay in 3 lanes; coins never sit inside a train', () => {
  const s = createTrainGame(11);
  for (let i = 0; i < 60 * 40; i++) {
    step(s, MS);
    for (const o of s.objs) assert.ok([-1, 0, 1].includes(o.lane));
    for (const c of s.objs.filter((o) => o.kind === 'coin' && !o.taken)) assert.ok(!trains(s).some((t) => t.lane === c.lane && c.z >= t.z && c.z <= t.z + t.len), 'coin inside a train');
  }
  const w = createTrainGame(11);
  for (const c of w.objs.filter((o) => o.kind === 'coin')) assert.ok(!trains(w).some((t) => t.lane === c.lane && c.z >= t.z && c.z <= t.z + t.len), 'coin inside a train');
});

test('fairness: a bot that only looks 1.5 s ahead survives two minutes on 40 seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = run(createTrainGame(seed), 120, true);
    assert.equal(s.hits, 0, `seed ${seed} was hit at ${s.t.toFixed(1)}s`);
  }
});

test('gaps shrink with difficulty but keep room for a lane change', () => {
  assert.ok(gapSeconds(0) > gapSeconds(TRAIN.RAMP_S));
  assert.ok(gapSeconds(TRAIN.RAMP_S) >= TRAIN.MOVE_S, 'at the hardest, one lane change still fits');
  const s = createTrainGame(3); run(s, 75, true);
  const all = trains(s).sort((a, b) => a.z - b.z);
  for (let i = 1; i < all.length; i++) {
    const prevEnd = Math.max(...all.filter((t) => Math.abs(t.z - all[i - 1].z) < 0.5).map((t) => t.z + t.len));
    if (Math.abs(all[i].z - all[i - 1].z) < 0.5) continue;
    assert.ok((all[i].z - prevEnd) / s.v >= TRAIN.GAP_HARD - 0.15, 'rows are separated by the gap time');
  }
});

test('speed ramps up and tops out', () => {
  assert.equal(speedAt(0), TRAIN.V0); assert.ok(speedAt(30) > speedAt(10)); assert.equal(speedAt(1e6), TRAIN.VMAX);
  assert.equal(difficultyAt(0), 0); assert.equal(difficultyAt(1e6), 1);
  const s = createTrainGame(2); run(s, 10, true); assert.ok(Math.abs(s.v - speedAt(s.t)) < 1e-9 && s.v > TRAIN.V0);
});

test('lane changes slide with an ease and clamp at the edges', () => {
  const s = createTrainGame(1);
  assert.equal(moveLane(s, -1), true); assert.equal(s.lane, -1); assert.equal(s.x, 0);
  step(s, MS * 3); assert.ok(s.x < 0 && s.x > -1);
  const h = createTrainGame(1); moveLane(h, -1); for (let i = 0; i < 5; i++) step(h, MS);
  assert.ok(Math.abs(h.x + 0.5) < 0.1, 'half way at half the time');
  run(s, 0.3); assert.equal(s.x, -1); assert.equal(s.slide, null);
  assert.equal(moveLane(s, -1), false);
  const o = createTrainGame(1); o.over = true; assert.equal(moveLane(o, 1), false);
});

function put(s, objs) { s.objs = objs.map((o, i) => ({ id: 1000 + i, ...o })); s.nextFront = 1e9; }
test('collision: a train in the cart lane costs a life, with a flash and invulnerability', () => {
  const s = createTrainGame(1); put(s, [{ kind: 'train', lane: 0, z: 1, len: 30, look: 0 }]);
  const ev = step(s, MS);
  assert.ok(ev.includes('hit')); assert.equal(s.lives, TRAIN.LIVES - 1); assert.ok(s.invuln > 0 && s.flash > 0);
  for (let i = 0; i < 30; i++) step(s, MS);
  assert.equal(s.lives, TRAIN.LIVES - 1, 'no second hit while ghosted or from the same train');
});
test('collision: other lanes are safe, a lane change dodges, mid-slide counts as both', () => {
  const s = createTrainGame(1); put(s, [{ kind: 'train', lane: 1, z: 1, len: 30, look: 0 }]); step(s, MS);
  assert.equal(s.lives, TRAIN.LIVES);
  const d = createTrainGame(1); put(d, [{ kind: 'train', lane: 0, z: 20, len: 30, look: 0 }]); moveLane(d, -1); run(d, 1.5); assert.equal(d.hits, 0);
});
test('collision: a train that already passed does not hit', () => {
  const s = createTrainGame(1); put(s, [{ kind: 'train', lane: 0, z: -40, len: 30, look: 0 }]); step(s, MS); assert.equal(s.hits, 0);
});
test('coins: picked up in the lane, paid in the score, not twice', () => {
  const s = createTrainGame(1); put(s, [{ kind: 'coin', lane: 0, z: 1, taken: false }, { kind: 'coin', lane: 1, z: 1, taken: false }]);
  const ev = step(s, MS); assert.deepEqual(ev, ['coin']); assert.equal(s.coins, 1);
  step(s, MS); assert.equal(s.coins, 1);
  assert.equal(scoreOf(s), Math.floor(s.dist / TRAIN.SCORE_DIV) + TRAIN.COIN_POINTS);
});
test('lives: three hits end the run, the game then ignores steps', () => {
  const s = createTrainGame(1);
  for (let n = 0; n < 3; n++) { s.invuln = 0; put(s, [{ kind: 'train', lane: 0, z: 1, len: 30, look: 0 }]); const ev = step(s, MS); if (n < 2) assert.ok(!ev.includes('over')); else assert.ok(ev.includes('over')); }
  assert.equal(s.lives, 0); assert.equal(s.over, true);
  const d = s.dist; step(s, MS); assert.equal(s.dist, d);
});
test('score grows with distance', () => {
  const s = createTrainGame(4); run(s, 5, true); const a = scoreOf(s); run(s, 5, true); assert.ok(scoreOf(s) > a);
});
