import test from 'node:test';
import assert from 'node:assert/strict';
import { CAST, BOUNDS, poseOf, surfAttempt, surfPose, planPose, lineSteps } from '../src/crowd.js';
import { isLand, waterAt, isWalkable } from '../src/map.js';
import { isRestSpot, loungeAt } from '../src/lounge.js';
import { waveAt, WAVE, SIZES, waveSize } from '../src/surf.js';
import { PROP_MS, PROP_KINDS } from '../src/art/crowd-props.js';
import { SPECIES } from '../src/protocol.js';

const T0 = 1795000000000;
const everyone = Object.entries(CAST).flatMap(([area, list]) => list.map((m) => [area, m]));

test('the cast is small and bounded per area, with unique ids and names', () => {
  assert.ok(CAST.beach.length <= BOUNDS.beach && CAST.beach.length >= 6);
  assert.ok(CAST.farm.length <= BOUNDS.farm && CAST.farm.length >= 6);
  assert.equal(new Set(everyone.map(([, m]) => m.id)).size, everyone.length);
  for (const [, m] of everyone) if (m.role === 'sun' || m.role === 'surf') assert.ok(SPECIES.includes(m.look.species), `${m.id} needs pose art`);
});

test('every member stays where its kind may stand, all day long, and steps one tile at a time', () => {
  for (const [area, m] of everyone) {
    const water = m.role === 'swim' || m.role === 'surf';
    const ok = (x, y) => (water ? !!waterAt(x, y, 'beach') : isLand(x, y, area));
    for (let u = 0; u < 300000; u += 337) {
      const p = poseOf(m, T0 + u);
      assert.ok(ok(p.x, p.y) && ok(p.x0, p.y0), `${m.id} at ${u}: ${p.x},${p.y}`);
      assert.ok(Math.abs(p.x - p.x0) + Math.abs(p.y - p.y0) <= 1);
    }
  }
});

test('poses are a pure function of the clock: the same instant gives the same pose', () => {
  for (const [, m] of everyone) assert.deepEqual(poseOf(m, T0 + 91234), poseOf(m, T0 + 91234));
});

test('sunbathers lie only on loungers and towels, hold the spot while lying, and leave it free while away', () => {
  const sun = CAST.beach.filter((m) => m.role === 'sun');
  assert.ok(sun.length >= 3);
  for (const m of sun) {
    assert.ok(isRestSpot(m.spot[0], m.spot[1], 'beach'));
    let lay = 0, away = 0;
    for (let u = 0; u < 250000; u += 500) {
      const p = poseOf(m, T0 + u);
      if (p.rest) { lay++; assert.deepEqual([p.x, p.y, p.moving], [m.spot[0], m.spot[1], false]); assert.deepEqual(p.holds, m.spot); }
      else if (!p.holds) away++;
    }
    assert.ok(lay > 100 && away > 5, `${m.id} lies and gets up`);
  }
  const [x, y] = CAST.beach.find((m) => m.role === 'sun').spot;
  assert.equal(loungeAt(x, y, 'beach', false, () => true).label, 'Ocupado');
  assert.equal(loungeAt(x, y, 'beach', false, () => false).label, 'Recostarse');
  assert.equal(loungeAt(x, y, 'beach', false).id, 'lounge');
});

test('surfers catch the clock\'s own wave: the crest is at their row when they stand up, and the ride follows the wall', () => {
  for (const m of CAST.beach.filter((c) => c.role === 'surf')) {
    const w0 = Math.floor(T0 / WAVE.periodMs);
    let rides = 0, wipes = 0;
    for (let w = w0; w < w0 + 40; w++) {
      const a = surfAttempt(m, w), wave = waveAt(a.tCatch);
      assert.ok(wave && wave.id === w, 'the wave is alive when it is caught');
      assert.ok(Math.abs(m.spot[1] - (wave.k + m.spot[0])) < 0.6, 'crest at the surfer\'s row');
      if (a.wipe) wipes++; else if (a.steps.length) rides++;
      for (const s of a.steps) assert.ok(isWalkable(s.x1, s.y1, 'beach') && waterAt(s.x1, s.y1, 'beach'));
      assert.ok(a.tBack - a.tCatch < 24000, 'back at its spot before its next try');
    }
    assert.ok(rides > 10 && wipes > 0);
    const flags = new Set();
    for (let u = 0; u < 900000; u += 120) flags.add(surfPose(m, T0 + u).surf);
    assert.deepEqual([...flags].sort(), [1, 2, 3]);
  }
});

test('a surfer\'s ride pace is the wave\'s own, as the player\'s', () => {
  const m = CAST.beach.find((c) => c.role === 'surf');
  for (let w = 1000; w < 1010; w++) if (!surfAttempt(m, w).wipe) assert.equal(surfAttempt(m, w).rideMs, SIZES[waveSize(w)].rideMs);
});

test('the volleyball players hit in turn: a ball over one pair of hands, then over the other\'s, jumping at the hit', () => {
  const [a, b] = ['a', 'b'].map((s) => CAST.beach.find((m) => m.role === 'volley' && m.side === s));
  const seen = { a: new Set(), b: new Set() };
  for (let u = 0; u < 7200; u += 100) { for (const [k, m] of [['a', a], ['b', b]]) seen[k].add(!!poseOf(m, u).prop); }
  assert.deepEqual([[...seen.a].sort(), [...seen.b].sort()], [[false, true], [false, true]]);
  assert.equal(poseOf(a, 0).prop.kind, 'ball');
  assert.equal(poseOf(a, 0).jumpPhase, 0);
  assert.equal(poseOf(b, 1800).jumpPhase, 0);
  assert.ok(poseOf(a, 2000).prop === null);
});

test('farm workers carry a tool or a load while they work, and their props loop', () => {
  for (const m of CAST.farm) {
    const kinds = new Set();
    for (let u = 0; u < 200000; u += 300) { const p = poseOf(m, T0 + u); if (p.prop) { kinds.add(p.prop.kind); assert.ok(p.prop.k >= 0 && p.prop.k <= 1); } }
    assert.ok(kinds.size >= 1, m.id);
    for (const k of kinds) assert.ok(PROP_KINDS.includes(k) && PROP_MS[k] >= 1);
  }
  assert.ok(new Set(CAST.farm.map((m) => m.act || m.prop)).size >= 5, 'hoeing, watering, carrying, feeding, harvesting');
});

test('the stroller holds an ice cream and eats it at the end of a stay', () => {
  const m = CAST.beach.find((c) => c.role === 'stroll');
  let held = 0, ate = 0;
  for (let u = 0; u < 120000; u += 200) { const t = poseOf(m, T0 + u).treat; if (t) { held++; if (t.eating) { ate++; assert.ok(t.k >= 0 && t.k <= 1); } } }
  assert.ok(held > 300 && ate > 20);
});

test('lineSteps goes along the row then the column', () => {
  assert.deepEqual(lineSteps([1, 1], [3, 2]), [[2, 1], [3, 1], [3, 2]]);
  assert.deepEqual(lineSteps([1, 1], [1, 1]), []);
});
