import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkateGame, step, steer, jump, botInput, scoreOf, SKATE, KINDS, apexOf, airtimeOf, heightAt, speedAt, gapSeconds, swingTime, isHazard } from '../src/arcade/skate.js';

const MS = 1000 / 60;
const fresh = (seed = 1, objs = []) => {
  const s = createSkateGame(seed);
  s.objs = objs.map((o, i) => ({ id: 5000 + i, d: KINDS[o.kind] ? KINDS[o.kind].d : 0, h: KINDS[o.kind] ? KINDS[o.kind].h : 0, all: !!(KINDS[o.kind] && KINDS[o.kind].all), ...o }));
  s.nextFront = 1e9;
  return s;
};
const run = (s, seconds, bot = false) => { for (let i = 0; i < seconds * 60 && !s.over; i++) { if (bot) { const b = botInput(s); steer(s, b.dir); if (b.jump) jump(s); } step(s, MS); } return s; };
const timeTo = (s, pred, max = 5) => { let t = 0; while (!pred(s) && t < max) { step(s, MS); t += MS / 1000; } return t; };

test('half-pipe swing: holding a direction carries the board up that wall along a smooth arc', () => {
  const s = fresh(); steer(s, -1);
  step(s, MS); assert.ok(s.p < 0 && s.p > -0.1, 'no instant snap');
  let prev = s.p, mono = true, t = 0;
  while (s.p > -1 && t < 2) { step(s, MS); t += MS / 1000; if (s.p > prev + 1e-9) mono = false; prev = s.p; }
  assert.ok(mono, 'it only goes up the wall'); assert.ok(t > 0.12 && t < 0.4, `reached the wall in ${t.toFixed(2)} s`);
  run(s, 1); assert.equal(s.p, -1, 'held on the wall'); assert.equal(s.vp, 0);
});
test('letting go: gravity swings it back to the floor with a little overshoot, then it settles', () => {
  const s = fresh(); steer(s, 1); run(s, 0.6); assert.equal(s.p, 1); steer(s, 0);
  let minP = 1, t = 0, crossed = false;
  while (t < 3) { step(s, MS); t += MS / 1000; minP = Math.min(minP, s.p); if (s.p < 0) crossed = true; }
  assert.ok(crossed && minP > -0.3 && minP < -0.02, `overshoot to ${minP.toFixed(3)}`);
  assert.ok(Math.abs(s.p) < 0.02 && Math.abs(s.vp) < 0.05, 'settled on the floor');
});
test('quick taps make a short swing; wall to wall passes over the floor and takes a fraction of a second', () => {
  const s = fresh(); steer(s, 1); run(s, 0.08); steer(s, 0); let peak = s.p; for (let i = 0; i < 90; i++) { step(s, MS); peak = Math.max(peak, s.p); }
  assert.ok(peak > 0.1 && peak < 0.7, `a tap swings to ${peak.toFixed(2)}`);
  const w = fresh(); steer(w, -1); run(w, 0.6); steer(w, 1);
  let sawFloor = false; const t = timeTo(w, (q) => { if (Math.abs(q.p) < 0.4) sawFloor = true; return q.p >= 0.99; });
  assert.ok(sawFloor && t < 0.6, `crossed in ${t.toFixed(2)} s`);
});
test('the swing is weaker in the air', () => {
  const g = fresh(); steer(g, 1); step(g, MS * 6);
  const a = fresh(); jump(a); step(a, MS); steer(a, 1); const p0 = a.p; step(a, MS * 6);
  assert.ok(a.p - p0 < g.p * 0.8);
});

test('jump arc: apex height, hang time and landing match the physics', () => {
  const s = fresh(); jump(s);
  let apex = 0, steps = 0;
  while (!s.grounded && steps < 600) { step(s, MS); apex = Math.max(apex, s.h); steps++; }
  assert.ok(Math.abs(apex - apexOf(SKATE.JUMP_V)) < 0.12, `apex ${apex}`);
  assert.ok(Math.abs(steps * MS / 1000 - airtimeOf(SKATE.JUMP_V)) < 0.05, 'air time');
  assert.equal(s.h, 0); assert.equal(s.grounded, true); assert.ok(s.squash > 0, 'a landing squash'); assert.ok(s.air > 0.6);
  assert.ok(heightAt(SKATE.JUMP_V, airtimeOf(SKATE.JUMP_V)) < 1e-9);
});
test('a jump on a wall pops straight up and lands back on the same wall', () => {
  const s = fresh(); steer(s, -1); run(s, 0.6); assert.equal(s.p, -1);
  assert.equal(jump(s), true); run(s, 0.3); assert.ok(s.h > 1.5 && s.p === -1);
  run(s, 1); assert.equal(s.grounded, true); assert.equal(s.p, -1);
});
test('a ramp launches a higher, longer jump; no double jump; a jump pressed just before landing is remembered', () => {
  assert.ok(apexOf(SKATE.RAMP_V) > apexOf(SKATE.JUMP_V) * 1.8 && airtimeOf(SKATE.RAMP_V) > airtimeOf(SKATE.JUMP_V));
  const r = fresh(1, [{ kind: 'ramp', slot: 0, z: 0.5 }]);
  assert.ok(step(r, MS).includes('ramp')); assert.equal(r.grounded, false);
  let apex = 0; for (let i = 0; i < 120; i++) { step(r, MS); apex = Math.max(apex, r.h); }
  assert.ok(apex > apexOf(SKATE.RAMP_V) - 0.25);
  const side = fresh(1, [{ kind: 'ramp', slot: 1, z: 0.5 }]); step(side, MS); assert.equal(side.grounded, true, 'a ramp on the wall does nothing on the floor');
  const s = fresh(); jump(s); run(s, 0.3); assert.equal(jump(s), false);
  while (s.h > 0.35) step(s, MS);
  assert.equal(jump(s), false); assert.equal(s.jumpBuf > 0, true);
  let again = false; for (let i = 0; i < 40 && !again; i++) again = step(s, MS).includes('jump');
  assert.ok(again);
});

test('collision is by position: a floor obstacle hits on the floor, not up a wall; a wall obstacle the other way round', () => {
  const rock = fresh(1, [{ kind: 'rock', slot: 0, z: 1 }]); step(rock, MS); assert.equal(rock.hits, 1);
  const up = fresh(1, [{ kind: 'rock', slot: 0, z: 1 }]); up.p = 1; step(up, MS); assert.equal(up.hits, 0, 'on the wall, past the rock');
  const between = fresh(1, [{ kind: 'rock', slot: 0, z: 1 }, { kind: 'pipe', slot: 1, z: 1 }]); between.p = 0.5; step(between, MS); assert.equal(between.hits, 0, 'half way up is between the two');
  const pipe = fresh(1, [{ kind: 'pipe', slot: 1, z: 1 }]); pipe.p = 1; step(pipe, MS); assert.equal(pipe.hits, 1);
  const floor = fresh(1, [{ kind: 'pipe', slot: 1, z: 1 }]); step(floor, MS); assert.equal(floor.hits, 0, 'on the floor, past the pipe');
  const past = fresh(1, [{ kind: 'cone', slot: 0, z: -30 }]); step(past, MS); assert.equal(past.hits, 0);
});
test('collision needs the board lower than the obstacle: low things are jumped, tall ones are not; the gate covers every position', () => {
  const hop = fresh(1, [{ kind: 'cone', slot: 0, z: 14 }]); hop.h = 1.6; hop.grounded = false; hop.vy = 0; run(hop, 0.2); assert.equal(hop.hits, 0, 'cleared by height');
  const bench = fresh(1, [{ kind: 'bench', slot: 0, z: 1 }]); bench.h = 1.9; bench.grounded = false; bench.vy = 0; step(bench, MS); assert.equal(bench.hits, 1, 'a jump does not clear a bench');
  const ramped = fresh(1, [{ kind: 'rock', slot: 0, z: 1 }]); ramped.h = 3.4; ramped.grounded = false; ramped.vy = 0; step(ramped, MS); assert.equal(ramped.hits, 0, 'a ramp jump clears it');
  for (const p of [-1, 0, 1]) { const g = fresh(1, [{ kind: 'gate', slot: 0, z: 1 }]); g.p = p; step(g, MS); assert.equal(g.hits, 1, `gate at ${p}`); }
  const jumped = fresh(1, [{ kind: 'gate', slot: 0, z: 1 }]); jumped.h = 1.5; jumped.grounded = false; jumped.vy = 0; step(jumped, MS); assert.equal(jumped.hits, 0);
});
test('a hit costs a life, flashes, ghosts the board; three end the run', () => {
  const s = fresh(1, [{ kind: 'rock', slot: 0, z: 1 }]);
  const ev = step(s, MS); assert.ok(ev.includes('hit')); assert.equal(s.lives, 2); assert.ok(s.invuln > 0 && s.flash > 0);
  s.objs.push({ id: 7001, kind: 'rock', slot: 0, z: 1, d: 2, h: 3, all: false }); step(s, MS); assert.equal(s.lives, 2, 'ghosted');
  for (let n = 0; n < 2; n++) { s.invuln = 0; s.objs = [{ id: 8000 + n, kind: 'rock', slot: 0, z: 1, d: 2, h: 3, all: false }]; step(s, MS); }
  assert.equal(s.lives, 0); assert.equal(s.over, true);
  const d = s.dist; step(s, MS); assert.equal(s.dist, d);
});
test('coins in every position, some only in the air', () => {
  for (const slot of [-1, 0, 1]) { const c = fresh(1, [{ kind: 'coin', slot, z: 1, h: 0.4, taken: false }]); c.p = slot; assert.deepEqual(step(c, MS), ['coin'], `slot ${slot}`); }
  const off = fresh(1, [{ kind: 'coin', slot: 1, z: 1, h: 0.4, taken: false }]); step(off, MS); assert.equal(off.coins, 0, 'wrong position');
  const hi = fresh(1, [{ kind: 'coin', slot: 0, z: 1, h: 2.0, taken: false }]); step(hi, MS); assert.equal(hi.coins, 0, 'out of reach on the ground');
  const up = fresh(1, [{ kind: 'coin', slot: 0, z: 1, h: 2.0, taken: false }]); up.h = 1.9; up.grounded = false; up.vy = 0; step(up, MS); assert.equal(up.coins, 1);
});
test('score = distance + coins + a little for airtime; speed ramps and tops out', () => {
  const s = fresh(); s.dist = 400; s.coins = 3; s.air = 1.5;
  assert.equal(scoreOf(s), 100 + 3 * SKATE.COIN_POINTS + Math.floor(1.5 * SKATE.AIR_POINTS));
  assert.equal(speedAt(0), SKATE.V0); assert.ok(speedAt(40) > speedAt(5)); assert.equal(speedAt(1e6), SKATE.VMAX);
  assert.ok(gapSeconds(0) > gapSeconds(100));
  const g = fresh(2); run(g, 5); assert.ok(g.v > SKATE.V0);
});

/** Every row the generator made over a run: { z0, end, blocked:Set, all, kind } in absolute distance. */
function rowsOf(seed, seconds = 100) {
  const s = createSkateGame(seed), seen = new Map();
  for (let i = 0; i < seconds * 60; i++) { const b = botInput(s); steer(s, b.dir); if (b.jump) jump(s); step(s, MS); for (const o of s.objs) if (o.kind !== 'coin' && !seen.has(o.id)) seen.set(o.id, { ...o, z0: o.z + s.dist, arrive: s.t + o.z / s.v }); }
  const rows = new Map();
  for (const o of seen.values()) { const k = o.row; rows.set(k, [...(rows.get(k) || []), o]); }
  return [...rows.values()].map((r) => ({ arrive: Math.min(...r.map((o) => o.arrive)), z0: Math.min(...r.map((o) => o.z0)), end: Math.max(...r.map((o) => o.z0 + o.d)), objs: r, blocked: new Set(r.filter((o) => isHazard(o) && !o.all).map((o) => o.slot)), gate: r.some((o) => o.all) })).sort((a, b) => a.z0 - b.z0);
}
test('same seed, same run; every row leaves a free position and only the gate spans the whole pipe', () => {
  const sig = (seed) => { const s = createSkateGame(seed); run(s, 20, true); return JSON.stringify([s.objs.map((o) => [o.kind, o.slot, Math.round(o.z * 100)]), s.coins, Math.round(s.dist), s.air.toFixed(3)]); };
  assert.equal(sig(4), sig(4)); assert.notEqual(sig(4), sig(5));
  let rows = 0, tall = 0, wall = 0;
  for (let seed = 1; seed <= 20; seed++) for (const r of rowsOf(seed)) {
    rows++;
    if (r.gate) continue;
    assert.ok(r.blocked.size <= 2, `seed ${seed}: all three positions blocked`);
    for (const o of r.objs) { assert.ok(KINDS[o.kind].at.includes(o.slot), `${o.kind} at ${o.slot}`); if (o.h >= 2) tall++; if (Math.abs(o.slot) === 1) wall++; }
  }
  assert.ok(rows > 100 && tall > 20 && wall > 20, 'walls and tall things are used');
});
test('fair spacing: the next free position is always reachable by swinging in the time the gap leaves', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rows = rowsOf(seed).filter((r) => !r.objs.some((o) => o.kind === 'ramp'));
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      const gapDist = b.z0 - a.end;
      assert.ok(gapDist / speedAt(b.arrive) >= gapSeconds(b.arrive) - 0.2, `seed ${seed}: rows ${gapDist.toFixed(1)} apart`);
      if (a.gate || b.gate) continue;
      const freeA = [-1, 0, 1].filter((x) => !a.blocked.has(x)), freeB = [-1, 0, 1].filter((x) => !b.blocked.has(x));
      const t = gapDist / speedAt(b.arrive) - SKATE.REACT_S + 0.2;
      assert.ok(freeA.some((x) => freeB.some((y) => swingTime(x, y) <= t + 1e-9)), `seed ${seed}: no reachable position`);
    }
  }
});
test('fairness: the demo bot survives two minutes on 40 seeds, riding the walls and jumping', () => {
  let wallTime = 0, air = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = createSkateGame(seed);
    for (let i = 0; i < 120 * 60 && !s.over; i++) { const b = botInput(s); steer(s, b.dir); if (b.jump) jump(s); step(s, MS); if (Math.abs(s.p) > 0.9) wallTime++; }
    assert.equal(s.hits, 0, `seed ${seed} was hit at ${s.t.toFixed(1)} s`); air += s.air;
  }
  assert.ok(wallTime > 500 && air > 40, 'the bot used the walls and the jump');
});
