import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '../src/show/rand.js';
import { SHOWS, RISE, FALL, SKY, tiltAt, showEnd, showCamera, horizonY } from '../src/show/timeline.js';
import { schedule, fireworksAt, burstSparks, SHAPES, directions } from '../src/show/fireworks.js';
import { meteorsAt, meteorSchedule } from '../src/show/meteors.js';
import { skyAt } from '../src/show/layers.js';
import { FORMATIONS, COUNT, T, dronesAt, dronesDuration, phaseAt, slot, pad } from '../src/show/drones.js';
import { makeStars, twinkle } from '../src/show/sky.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('the hash is stateless: same inputs, same number in [0, 1); other inputs differ', () => {
  for (let i = 0; i < 200; i++) { const v = hash(5, i, 2); assert.ok(v >= 0 && v < 1); assert.equal(v, hash(5, i, 2)); }
  assert.notEqual(hash(5, 1, 2), hash(6, 1, 2));
  assert.notEqual(hash(5, 1, 2), hash(5, 2, 2));
});

test('fireworks are a pure function of (seed, t): a fresh module instance gives the same particles', async () => {
  const fresh = await import('../src/show/fireworks.js?fresh-instance');            // another module instance: nothing cached carries over
  for (const [seed, t] of [[7, 3.2], [7, 8.8], [42, 26.1], [1, 0.5]]) {
    const a = fireworksAt(seed, t), b = fireworksAt(seed, t), c = fresh.fireworksAt(seed, t);
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
  }
  assert.notDeepEqual(fireworksAt(7, 8.8), fireworksAt(8, 8.8));
  assert.ok(fireworksAt(7, 8.8).sparks.length > 0);
});

test('fireworks: rockets climb before their burst, sparks fall with gravity and fade, nothing is left after a burst dies', () => {
  const b = schedule(7)[3];
  const zAt = (t) => fireworksAt(7, t).rockets.filter((r) => r.a === 1).map((r) => r.z);
  const mid = b.tl + (b.tb - b.tl) * 0.4, late = b.tl + (b.tb - b.tl) * 0.9;
  assert.ok(zAt(late).some((z) => z > Math.min(...zAt(mid))), 'the rocket is higher later in its climb');
  const heads = (age) => burstSparks(b, 7, age).filter((s) => s.tr === 0);
  const meanZ = (age) => heads(age).reduce((m, s) => m + s.z, 0) / heads(age).length;
  assert.ok(meanZ(2.0) < meanZ(0.8) - 20, 'the sparks fall under gravity');
  const meanA = (age) => heads(age).reduce((m, s) => m + s.a, 0) / heads(age).length;
  assert.ok(meanA(0.2) > meanA(1.0) && meanA(1.0) > meanA(2.0), 'and fade');
  assert.ok(heads(0.3).every((s) => s.a <= 1 && s.a > 0));
  const last = schedule(7).at(-1);
  assert.equal(fireworksAt(7, last.tb + 4).sparks.length, 0);
  assert.equal(fireworksAt(7, -1).rockets.length, 0);
  assert.ok(fireworksAt(7, b.tb + 0.2).flashes.length >= 1);
});

test('fireworks: every shape exists in the schedule and the sparks of a shape are deterministic', () => {
  const seen = new Set(schedule(7).map((b) => b.shape));
  for (const s of SHAPES) assert.ok(seen.has(s), `${s} appears`);
  for (const b of schedule(7)) { assert.deepEqual(directions(b, 7), directions(b, 7)); assert.ok(directions(b, 7).length >= 40); }
});

test('the camera tilt curve: 0 before, smooth up, 1 while it holds, smooth down to 0 at the end', () => {
  const dur = SHOWS.fireworks.dur;
  assert.equal(tiltAt(0, dur), 0); assert.equal(tiltAt(-3, dur), 0);
  assert.equal(tiltAt(RISE, dur), 1); assert.equal(tiltAt(dur / 2, dur), 1);
  near(tiltAt(dur, dur), 0); assert.equal(tiltAt(dur + 5, dur), 0);
  let prev = 0;
  for (let t = 0; t <= RISE; t += 0.05) { const k = tiltAt(t, dur); assert.ok(k >= prev - 1e-12, 'rises'); assert.ok(k >= 0 && k <= 1); prev = k; }
  prev = 1;
  for (let t = dur - FALL; t <= dur; t += 0.05) { const k = tiltAt(t, dur); assert.ok(k <= prev + 1e-12, 'falls'); prev = k; }
  near(tiltAt(RISE / 2, dur), 0.5);                                              // smoothstep is symmetric
});

test('cutting a show short ("Volver") tilts back down from where it was, without a jump', () => {
  const dur = SHOWS.drones.dur, cut = 12;
  near(tiltAt(cut, dur, cut), tiltAt(cut, dur));
  assert.ok(tiltAt(cut + 1, dur, cut) < 1);
  near(tiltAt(cut + FALL, dur, cut), 0);
  assert.equal(showEnd(dur, cut), cut + FALL);
  assert.equal(showEnd(dur), dur);
  const k = tiltAt(1.0, dur, 1.0);                                                // cut during the rise: continuous, never above the rise
  assert.ok(k > 0 && k < 1);
  near(tiltAt(1.0 + FALL, dur, 1.0), 0);
});

test('the show camera: no horizon in the flat view, the horizon rises to its target as the tilt grows, the focus stays put', () => {
  for (const [w, h] of [[844, 390], [390, 844], [1280, 720]]) {
    const c0 = showCamera(w, h, 384, 344, 0), c1 = showCamera(w, h, 384, 344, 1), cm = showCamera(w, h, 384, 344, 0.5);
    assert.ok(horizonY(c0) < 0, 'no sky at rest');
    near(horizonY(c1), h * SKY.horizon, 0.5);
    assert.ok(horizonY(cm) < horizonY(c1), 'the horizon is on its way down the screen');
    assert.ok(c1.pitch < c0.pitch, 'the camera looks up');
    let prev = -Infinity;
    for (let k = 0; k <= 1; k += 0.1) { const y = horizonY(showCamera(w, h, 384, 344, k)); assert.ok(y >= prev - 1e-6); prev = y; }
  }
});

test('shooting stars are deterministic and stay in sky space', async () => {
  const fresh = await import('../src/show/meteors.js?fresh-instance');
  for (const t of [4.1, 17.3, 20]) { assert.deepEqual(meteorsAt(9, t), meteorsAt(9, t)); assert.deepEqual(meteorsAt(9, t), fresh.meteorsAt(9, t)); }
  assert.ok(meteorsAt(9, 17.3).length > 0);
  for (const m of meteorSchedule(9)) assert.ok(m.v0 >= 0 && m.v1 <= 1.05 && m.u0 >= 0 && m.u0 <= 1);
  for (const p of meteorsAt(9, 17.3)) assert.ok(p.a >= 0 && p.a <= 1 && p.v >= 0 && p.v <= 1.05);
  assert.deepEqual(meteorsAt(9, -2), []);
});

test('every formation has exactly 40 distinct, sky-sized points', () => {
  assert.deepEqual(FORMATIONS.map((f) => f.name), ['paw', 'heart', 'hola']);
  for (const f of FORMATIONS) {
    assert.equal(f.pts.length, COUNT);
    for (const [x, z] of f.pts) assert.ok(Math.abs(x) <= 1.0001 && Math.abs(z) <= 1.0001);
  }
  const hola = FORMATIONS[2].pts, key = (p) => p.map((v) => v.toFixed(4)).join();
  assert.equal(new Set(hola.map(key)).size, COUNT, 'HOLA: one drone per lit pixel');
  assert.equal(new Set(FORMATIONS[1].pts.map(key)).size, COUNT);
  const heart = FORMATIONS[1].pts;                                               // the heart is left-right symmetric
  for (const [x, z] of heart) assert.ok(heart.some(([a, b]) => Math.abs(a + x) < 0.06 && Math.abs(b - z) < 0.06), 'mirror point exists');
});

test('drone formation interpolation: exact on the holds, between the two formations while morphing, same every run', async () => {
  assert.equal(dronesAt(3, 0).length, COUNT);
  const hold = T.lift + 3, d = dronesAt(3, hold);
  d.forEach((p, i) => { const s = slot(0, i); near(p.x, s[0], 1e-6); near(p.y, s[1], 1e-6); near(p.z, s[2], 1e-6); });
  const h2 = T.lift + T.hold + T.morph + 3;                                       // inside the second hold
  dronesAt(3, h2).forEach((p, i) => { const s = slot(1, i); near(p.x, s[0], 1e-6); near(p.z, s[2], 1e-6); });
  const mid = T.lift + T.hold + T.morph * 0.5, m = dronesAt(3, mid);              // half way through the morph paw -> heart
  assert.deepEqual(phaseAt(mid), { from: 0, to: 1, k: 0.5 });
  m.forEach((p, i) => {
    const a = slot(0, i), b = slot(1, i), lo = Math.min(a[0], b[0]) - 1e-6, hi = Math.max(a[0], b[0]) + 1e-6;
    assert.ok(p.x >= lo && p.x <= hi, `drone ${i} is between its two slots`);
  });
  assert.ok(m.some((p, i) => Math.abs(p.x - slot(0, i)[0]) > 1 && Math.abs(p.x - slot(1, i)[0]) > 1 || slot(0, i)[0] === slot(1, i)[0]), 'somebody is really in flight');
  assert.deepEqual(dronesAt(3, mid), dronesAt(3, mid));
  assert.deepEqual(dronesAt(3, mid), (await import('../src/show/drones.js?fresh-instance')).dronesAt(3, mid));
  // the morph starts and ends exactly on the formations (no jump into or out of a hold)
  const before = dronesAt(3, T.lift + T.hold), after = dronesAt(3, T.lift + T.hold + T.morph);
  before.forEach((p, i) => near(p.x, slot(0, i)[0], 1e-6));
  after.forEach((p, i) => near(p.x, slot(1, i)[0], 1e-6));
});

test('drones lift off from the plaza pads, land on them, and the show has a total length', () => {
  const end = dronesDuration();
  assert.ok(end < SHOWS.drones.dur, 'the camera is still up while the drones fly');
  const start = dronesAt(3, 0);
  start.forEach((p, i) => { const g = pad(i); near(p.x, g[0], 1e-6); near(p.z, 0, 1e-6); });
  const landed = dronesAt(3, end);
  landed.forEach((p, i) => { near(p.x, pad(i)[0], 1e-6); near(p.z, 0, 1e-6); assert.ok(p.a < 0.2, 'faded out'); });
  assert.deepEqual(dronesAt(3, end + 1), []);
  assert.equal(phaseAt(T.lift + 0.1).from, 0);
  assert.equal(phaseAt(end).from, 2);
});

test('stars: deterministic per seed, inside the sky, twinkling between dim and bright', () => {
  assert.deepEqual(makeStars(7), makeStars(7));
  assert.notDeepEqual(makeStars(7), makeStars(8));
  for (const s of makeStars(7)) { assert.ok(s.u >= 0 && s.u < 1 && s.v >= 0 && s.v < 1); for (let t = 0; t < 5; t += 0.7) { const a = twinkle(s, t); assert.ok(a >= 0.3 && a <= 1); } }
});

test('halloween: the same length as the drones, deterministic, empty outside the show, with a moon, witches, ghosts and bats', async () => {
  const H = await import('../src/show/halloween.js');
  assert.equal(H.DURATION, SHOWS.halloween.dur);
  assert.equal(SHOWS.halloween.label, 'Noche de Halloween');
  assert.deepEqual(H.halloweenAt(7, 15), H.halloweenAt(7, 15));
  assert.deepEqual(skyAt('halloween', 7, 15).hw, H.halloweenAt(7, 15));
  for (const t of [-1, 40.5]) { const r = H.halloweenAt(7, t); assert.deepEqual([r.moon, r.witches, r.ghosts, r.bats], [null, [], [], []]); }
  assert.equal(skyAt('drones', 7, 5).hw, null);
  assert.ok(H.halloweenAt(7, 12).moon.v < H.halloweenAt(7, 2).moon.v, 'the moon rises');
  assert.ok(H.halloweenAt(7, 5).witches.length + H.halloweenAt(7, 11).witches.length > 0);
  assert.ok([8, 12, 16, 20].some((t) => H.halloweenAt(7, t).ghosts.length > 0));
  assert.equal(H.PUMPKIN_PTS.length, H.FINALE.count);
  assert.equal(H.halloweenAt(7, 34).bats.filter((b) => b.lit > 0.99).length, H.FINALE.count, 'the finale: every bat is in the pumpkin and glowing');
  for (let t = 0; t <= 40; t += 0.5) for (const b of H.halloweenAt(3, t).bats) assert.ok(b.a >= 0 && b.a <= 1 && b.lit >= 0 && b.lit <= 1);
});

// ---- a show's own length (the admin picks it per event) ------------------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { MIN_DUR, MAX_DUR, durationOf } from '../src/show/timeline.js';
import { plan } from '../src/show/drones.js';
import * as H from '../src/show/halloween.js';
import { DURATION as FW_DUR } from '../src/show/fireworks.js';
import { DURATION as MET_DUR } from '../src/show/meteors.js';

test('a show at its default length is exactly what it was before lengths existed (hashes of the old output)', () => {
  const sky = (kind, dur, explicit) => {
    const h = createHash('sha256');
    for (const seed of [7, 42, 12345]) for (let t = -1; t <= dur + 1; t += 0.25) h.update(JSON.stringify(skyAt(kind, seed, t, explicit ? dur : undefined)));
    return h.digest('hex').slice(0, 16);
  };
  const was = { fireworks: '9d8094d10973c8dc', meteors: '382e47a3845e651b', drones: '180b8df8456f30c9', halloween: 'a02863fab937dbb7' };
  for (const [kind, s] of Object.entries(SHOWS)) {
    assert.equal(sky(kind, s.dur, false), was[kind], `${kind} with no length`);
    assert.equal(sky(kind, s.dur, true), was[kind], `${kind} with its own length`);
  }
  assert.deepEqual([FW_DUR, MET_DUR, H.DURATION], [SHOWS.fireworks.dur, SHOWS.meteors.dur, SHOWS.halloween.dur]);
  assert.equal(dronesDuration(), plan().end);
  assert.deepEqual([plan().n, plan().hold], [FORMATIONS.length, T.hold]);
});

test('durationOf: the event\'s own length when it is within the bounds, else the kind\'s', () => {
  assert.equal(durationOf({ kind: 'drones', duration_ms: 90_000 }), 90);
  assert.equal(durationOf({ kind: 'drones', duration_ms: MIN_DUR * 1000 }), MIN_DUR);
  assert.equal(durationOf({ kind: 'drones', duration_ms: MAX_DUR * 1000 }), MAX_DUR);
  for (const bad of [undefined, null, 0, 5_000, 601_000, NaN, '40000x']) assert.equal(durationOf({ kind: 'fireworks', duration_ms: bad }), 38, String(bad));
  assert.equal(durationOf({ kind: 'meteors' }), 28);
});

test('a longer show has more of its main part, the intro and the finale keep their length', () => {
  const nb = (d) => schedule(7, d).length, nm = (d) => meteorSchedule(7, d).length;
  assert.ok(nb(120) > nb(38) && nb(38) > nb(20));                                              // more bursts in the main part
  assert.ok(nm(120) > nm(28) && nm(28) > nm(20));
  const finale = (d) => schedule(7, d).slice(-8);                                              // the finale: 8 bursts, 0.34 s apart, ending 13.8 s before the show does
  for (const d of [20, 38, 90, 600]) {
    const f = finale(d);
    near(f[0].tl - (d - 13.8), 0, 0.2); near(f[7].tl - f[0].tl, 7 * 0.34, 0.15);
    for (const b of schedule(7, d)) assert.ok(b.tb + 2.6 <= d + 0.01 || d < 24, `${d}: a burst is still going at the end`);
  }
  const shower = (d) => meteorSchedule(7, d).slice(-18);                                       // the shower: 18 streaks over 8.5 s, ending 13 s before the show does
  for (const d of [20, 28, 300]) { const m = shower(d); near(m[0].t0 - (d - 13), 0, 0.31); near(m[17].t0 - m[0].t0, 8.5, 0.31); }
  const first = (d) => schedule(7, d)[0];
  assert.deepEqual(first(38), first(120));                                                      // the opening is the same whatever the length
});

test('a longer show is still a pure function of (seed, t, dur): the same lists every time, other seeds and lengths differ', async () => {
  const fresh = await import('../src/show/layers.js?fresh-instance-dur');
  for (const [kind, dur] of [['fireworks', 150], ['meteors', 75], ['drones', 200], ['halloween', 300]]) {
    for (const t of [3.3, 40, 61.5, dur - 8, dur - 1]) {
      assert.deepEqual(skyAt(kind, 9, t, dur), skyAt(kind, 9, t, dur), `${kind} ${t}`);
      assert.deepEqual(skyAt(kind, 9, t, dur), fresh.skyAt(kind, 9, t, dur), `${kind} ${t} in a fresh module`);
    }
    assert.notDeepEqual(skyAt(kind, 9, 4, dur), skyAt(kind, 10, 4, dur), kind);              // another seed: another show (at 4 s every kind has something that depends on it)
  }
});

test('fireworks and meteors fill a long show: there is something in the sky all along, until near the end', () => {
  for (const d of [90, 300, 600]) {
    for (let t = 2; t < d - 14; t += 1) {
      const fw = fireworksAt(7, t, d);
      assert.ok(fw.rockets.length + fw.sparks.length > 0, `fireworks ${d}s at ${t}`);
    }
  }
  const idle = (d) => { let n = 0; for (let t = 3; t < d - 14; t += 0.5) if (!meteorsAt(7, t, d).length) n++; return n * 0.5; };
  assert.ok(idle(120) < 6, 'the meteors of a 2 minute show leave no long gaps');
});

test('drones: a longer show flies more formations (the three in turn), each holds 4.5 to 10.5 s, and lift off and the descent keep their length', () => {
  for (const d of [20, 25, 40, 60, 120, 600]) {
    const p = plan(d);
    assert.ok(p.hold >= 4.4 && p.hold <= 10.6, `${d}: hold ${p.hold}`);
    near(T.lift + p.n * p.hold + (p.n - 1) * T.morph + T.descend, p.end, 1e-9);
    assert.ok(p.end < d, 'the lights are down before the show is over');
    assert.equal(phaseAt(p.end, d).from, p.n - 1);
    assert.equal(dronesAt(3, p.end + 1, d).length, 0);
    assert.equal(dronesAt(3, 0, d).length, COUNT);
    const landed = dronesAt(3, p.end, d);
    landed.forEach((l, i) => near(l.z, pad(i)[2] + 0, 40));
  }
  assert.equal(plan(120).n, 11);
  assert.deepEqual([0, 1, 2, 3, 4].map((f) => slot(f, 5)[0] - slot(f % 3, 5)[0]), [0, 0, 0, 0, 0], 'the formations repeat in turn');
  assert.deepEqual(phaseAt(T.lift + plan(120).hold + 1, 120), { from: 0, to: 1, k: 1 / T.morph });
});

test('halloween: more witches, ghosts and bat swarms in a longer show; the pumpkin finale comes at the end, whole, and the moon sets with the show', () => {
  assert.deepEqual([H.witchesOf(40), H.ghostsOf(40), H.swarmsOf(40).length], [7, 6, 3]);
  assert.ok(H.witchesOf(120) > 7 && H.ghostsOf(120) > 6 && H.swarmsOf(120).length > 3);
  assert.ok(H.witchesOf(20) >= 2 && H.ghostsOf(20) >= 1 && H.swarmsOf(20).length >= 1);
  assert.equal(H.finaleOf().at, H.FINALE.at);
  for (const d of [20, 40, 90, 300]) {
    const fin = H.finaleOf(d);
    assert.equal(H.halloweenAt(7, fin.at + 6.5, d).bats.filter((b) => b.lit > 0.99).length, H.FINALE.count, `${d}s: every bat is in the pumpkin and glowing`);
    assert.deepEqual(H.halloweenAt(7, d + 0.5, d).bats, []);
    assert.equal(H.halloweenAt(7, d - 0.01, d).moon === null || H.halloweenAt(7, d - 0.01, d).moon.a < 0.01, true);
    assert.ok(H.halloweenAt(7, 5, d).moon.a > 0.5, 'the moon is up near the start');
    for (let t = 0; t <= d; t += 0.5) for (const b of H.halloweenAt(3, t, d).bats) assert.ok(b.a >= 0 && b.a <= 1 && b.lit >= 0 && b.lit <= 1);
  }
  for (let t = 5; t < 280; t += 7) { const r = H.halloweenAt(7, t, 300); assert.ok(r.witches.length + r.ghosts.length + r.bats.length > 0, `something in the sky at ${t}`); }
});
