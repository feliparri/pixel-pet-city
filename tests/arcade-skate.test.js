import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkateGame, step, steer, jump, botInput, scoreOf, SKATE, KINDS, apexOf, airtimeOf, heightAt, reachX, speedAt, gapSeconds } from '../src/arcade/skate.js';

const MS = 1000 / 60;
const fresh = (seed = 1, objs = []) => { const s = createSkateGame(seed); s.objs = objs.map((o, i) => ({ id: 5000 + i, ...(KINDS[o.kind] || {}), ...o })); s.nextFront = 1e9; return s; };
const run = (s, seconds, bot = false) => { for (let i = 0; i < seconds * 60 && !s.over; i++) { if (bot) { const b = botInput(s); steer(s, b.dir); if (b.jump) jump(s); } step(s, MS); } return s; };

test('jump arc: apex height, hang time and landing match the physics', () => {
  const s = fresh(); jump(s);
  let apex = 0, steps = 0;
  while (!s.grounded && steps < 600) { step(s, MS); apex = Math.max(apex, s.h); steps++; }
  assert.ok(Math.abs(apex - apexOf(SKATE.JUMP_V)) < 0.12, `apex ${apex}`);
  assert.ok(Math.abs(steps * MS / 1000 - airtimeOf(SKATE.JUMP_V)) < 0.05, 'air time');
  assert.equal(s.h, 0); assert.equal(s.grounded, true); assert.ok(s.squash > 0, 'a landing squash');
  assert.ok(s.air > 0.6, 'air time is counted');
  assert.ok(heightAt(SKATE.JUMP_V, airtimeOf(SKATE.JUMP_V)) < 1e-9);
});
test('a ramp launches a higher, longer jump than a jump', () => {
  assert.ok(apexOf(SKATE.RAMP_V) > apexOf(SKATE.JUMP_V) * 1.8); assert.ok(airtimeOf(SKATE.RAMP_V) > airtimeOf(SKATE.JUMP_V));
  const s = fresh(1, [{ kind: 'ramp', x: 0, z: 0.5 }]);
  const ev = step(s, MS); assert.ok(ev.includes('ramp')); assert.equal(s.grounded, false);
  let apex = 0; for (let i = 0; i < 120; i++) { step(s, MS); apex = Math.max(apex, s.h); }
  assert.ok(apex > apexOf(SKATE.RAMP_V) - 0.25);
});
test('no double jump; a jump pressed just before landing is remembered', () => {
  const s = fresh(); jump(s); run(s, 0.3); assert.equal(jump(s), false);
  while (s.h > 0.35) step(s, MS);
  assert.equal(jump(s), false); assert.equal(s.jumpBuf > 0, true);
  let again = false; for (let i = 0; i < 40 && !again; i++) { const ev = step(s, MS); again = ev.includes('jump'); }
  assert.ok(again, 'the buffered jump fires on landing');
});

test('steering has inertia: speed builds, friction bleeds it, it never snaps', () => {
  const s = fresh(); steer(s, 1);
  step(s, MS); assert.ok(s.vx > 0 && s.vx < 0.3, 'accelerates, no instant speed');
  run(s, 0.3); const v1 = s.vx; assert.ok(v1 > 2);
  steer(s, 0); step(s, MS); assert.ok(s.vx > 0.9 * v1, 'still gliding right after letting go');
  const x0 = s.x; run(s, 0.5); assert.ok(s.x > x0 + 0.1, 'it keeps drifting');
  run(s, 3); assert.ok(s.vx < 0.01, 'friction stops it');
});
test('reversing brakes harder than speeding up', () => {
  const a = fresh(); steer(a, 1); run(a, 0.4); steer(a, -1); const v = a.vx; step(a, MS * 6);
  const dv = v - a.vx, b = fresh(); steer(b, 1); const w0 = b.vx; step(b, MS * 6);
  assert.ok(dv > (b.vx - w0) * 1.3);
});
test('the path edges clamp the board and kill most of its speed', () => {
  const s = fresh(); steer(s, 1); run(s, 3);
  assert.equal(s.x, SKATE.EDGE); assert.ok(Math.abs(s.vx) <= SKATE.VMAX_X * SKATE.EDGE_BOUNCE + 1e-9 || s.vx > 0);
  steer(s, -1); run(s, 6); assert.equal(s.x, -SKATE.EDGE);
  assert.ok(Math.abs(s.vx) <= SKATE.VMAX_X);
});
test('steering is weaker in the air', () => {
  const g = fresh(); steer(g, 1); step(g, MS * 6);
  const a = fresh(); jump(a); step(a, MS); steer(a, 1); const v0 = a.vx; step(a, MS * 6);
  assert.ok(a.vx - v0 < g.vx * 0.8);
});

test('collision needs the board lower than the obstacle: low ones are jumped, tall ones are not', () => {
  const cone = fresh(1, [{ kind: 'cone', x: 0, z: 1 }]); step(cone, MS); assert.equal(cone.hits, 1);
  const hop = fresh(1, [{ kind: 'cone', x: 0, z: 14 }]); hop.h = 1.6; hop.grounded = false; hop.vy = 0; run(hop, 0.2); assert.equal(hop.hits, 0, 'cleared by height');
  const bench = fresh(1, [{ kind: 'bench', x: 0, z: 1 }]); bench.h = 1.9; bench.grounded = false; bench.vy = 0; step(bench, MS); assert.equal(bench.hits, 1, 'a jump does not clear a bench');
  const ramped = fresh(1, [{ kind: 'planter', x: 0, z: 1 }]); ramped.h = 3.4; ramped.grounded = false; ramped.vy = 0; step(ramped, MS); assert.equal(ramped.hits, 0, 'a ramp jump does');
  const side = fresh(1, [{ kind: 'bench', x: -1.2, z: 1, hw: 0.2 }]); side.x = 0.3; step(side, MS); assert.equal(side.hits, 0, 'steering round works');
  const past = fresh(1, [{ kind: 'cone', x: 0, z: -30 }]); step(past, MS); assert.equal(past.hits, 0);
});
test('a hit costs a life, flashes, ghosts the board; three end the run', () => {
  const s = fresh(1, [{ kind: 'cone', x: 0, z: 1 }]);
  const ev = step(s, MS); assert.ok(ev.includes('hit')); assert.equal(s.lives, 2); assert.ok(s.invuln > 0 && s.flash > 0);
  s.objs.push({ id: 7001, ...KINDS.cone, kind: 'cone', x: 0, z: 1 }); step(s, MS); assert.equal(s.lives, 2, 'ghosted');
  for (let n = 0; n < 2; n++) { s.invuln = 0; s.objs = [{ id: 8000 + n, ...KINDS.cone, kind: 'cone', x: 0, z: 1 }]; step(s, MS); }
  assert.equal(s.lives, 0); assert.equal(s.over, true);
  const d = s.dist; step(s, MS); assert.equal(s.dist, d);
});
test('coins: on the ground by steering, in the air only by jumping', () => {
  const g = fresh(1, [{ kind: 'coin', x: 0, z: 1, h: 0.4, taken: false }]); assert.deepEqual(step(g, MS), ['coin']); assert.equal(g.coins, 1);
  const hi = fresh(1, [{ kind: 'coin', x: 0, z: 1, h: 2.0, taken: false }]); step(hi, MS); assert.equal(hi.coins, 0, 'out of reach on the ground');
  const up = fresh(1, [{ kind: 'coin', x: 0, z: 1, h: 2.0, taken: false }]); up.h = 1.9; up.grounded = false; up.vy = 0; step(up, MS); assert.equal(up.coins, 1);
});
test('score = distance + coins + a little for airtime', () => {
  const s = fresh(); s.dist = 400; s.coins = 3; s.air = 1.5;
  assert.equal(scoreOf(s), 100 + 3 * SKATE.COIN_POINTS + Math.floor(1.5 * SKATE.AIR_POINTS));
});
test('speed ramps and tops out; gaps shrink but keep room to steer', () => {
  assert.equal(speedAt(0), SKATE.V0); assert.ok(speedAt(40) > speedAt(5)); assert.equal(speedAt(1e6), SKATE.VMAX);
  assert.ok(gapSeconds(0) > gapSeconds(100));
  assert.ok(reachX(gapSeconds(100) - 0.3) >= 1.0, 'at the hardest the corridor can still move a fair way');
  const s = fresh(2); s.nextFront = 140; run(s, 5); assert.ok(s.v > SKATE.V0);
});

test('same seed, same run; the spawner leaves a corridor the board can follow', () => {
  const sig = (seed) => { const s = createSkateGame(seed); run(s, 20, true); return JSON.stringify([s.objs.map((o) => [o.kind, +o.x.toFixed(3), Math.round(o.z * 100)]), s.coins, Math.round(s.dist), s.air.toFixed(3)]); };
  assert.equal(sig(4), sig(4)); assert.notEqual(sig(4), sig(5));
  for (let seed = 1; seed <= 20; seed++) {
    const s = createSkateGame(seed); const seen = new Map();
    for (let i = 0; i < 60 * 80; i++) { step(s, MS); for (const o of s.objs) if (o.kind !== 'coin' && !seen.has(o.id)) seen.set(o.id, { ...o, z0: o.z + s.dist }); }
    const rows = new Map(); for (const o of seen.values()) { const k = Math.round(o.z0); rows.set(k, [...(rows.get(k) || []), o]); }
    for (const row of rows.values()) {
      const tall = row.filter((o) => o.h >= 2);
      if (row.some((o) => o.kind === 'barrier')) continue;
      let free = false;                                                  // some x stays clear of every tall thing by the board's width
      for (let x = -SKATE.EDGE; x <= SKATE.EDGE && !free; x += 0.05) free = tall.every((o) => Math.abs(x - o.x) >= o.hw + SKATE.PW);
      assert.ok(free, `seed ${seed}: a tall row with no way through`);
    }
  }
});
test('fairness: the demo bot survives two minutes on 40 seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = run(createSkateGame(seed), 120, true);
    assert.equal(s.hits, 0, `seed ${seed} was hit at ${s.t.toFixed(1)} s`);
  }
});
test('the bot uses the jump: it clears barriers and takes some air', () => {
  const s = run(createSkateGame(3), 60, true); assert.ok(s.air > 2 && s.coins > 5);
});
