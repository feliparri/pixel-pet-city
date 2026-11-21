import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/arcade/train.js';
const { createTrainGame, step, setIntent, botIntent, upcomingFork, scoreOf, speedAt, difficultyAt, gapSeconds, escapeChance, nodeLat, sectionAt, TRAIN, next } = T;

const MS = 1000 / 60;
const run = (s, seconds, bot = false) => { for (let i = 0; i < seconds * 60 && !s.over; i++) { if (bot) botIntent(s); step(s, MS); } return s; };
/** Runs `seconds` and remembers every section, train and episode ever generated. */
function record(seed, seconds, bot = true) {
  const s = createTrainGame(seed), secs = new Set(), trains = new Map();
  for (let i = 0; i < seconds * 60; i++) { if (bot) botIntent(s); step(s, MS); for (const x of s.sections) secs.add(x); for (const t of s.trains) trains.set(t.id, t); }
  return { s, secs: [...secs], trains: [...trains.values()] };
}
const untilFork = (s) => { for (let i = 0; i < 60 * 60 && !(upcomingFork(s) && upcomingFork(s).z - s.dist < 60); i++) step(s, MS); return upcomingFork(s); };

test('there is no free lane switching, only the choice at a switch', () => {
  assert.equal(T.moveLane, undefined);
  assert.equal(typeof setIntent, 'function');
});

test('the same seed gives the same layout, another seed another', () => {
  const sig = (seed) => { const s = createTrainGame(seed); run(s, 40, true); return JSON.stringify([s.episodes, s.trains.map((t) => [t.node, Math.round(t.z), t.len]), s.coins, Math.round(s.dist)]); };
  assert.equal(sig(7), sig(7)); assert.notEqual(sig(7), sig(8));
  const a = { rng: 5 }, b = { rng: 5 }; assert.equal(next(a), next(b));
});

test('every fork has a safe branch: trains never sit on both sibling branches', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { secs, trains } = record(seed, 100, true);
    let forks = 0;
    for (const sec of secs.filter((x) => x.kind === 'fork')) {
      const byParent = new Map();
      for (const n of sec.nodes) byParent.set(n.parents[0], [...(byParent.get(n.parents[0]) || []), n]);
      for (const sibs of byParent.values()) {
        if (sibs.length < 2) continue;
        forks++;
        const occupied = sibs.filter((n) => trains.some((t) => t.node === n.id));
        assert.ok(occupied.length < sibs.length, `seed ${seed}: a fork with a train on every branch`);
        assert.ok(occupied.length <= 1);
      }
    }
    assert.ok(forks > 3);
  }
});

test('escape forks put the train on the outer sub-branch and leave the inner one and the other branch free', () => {
  let seen = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { secs, trains } = record(seed, 90, true);
    for (const sec of secs.filter((x) => x.kind === 'fork' && x.nodes.length === 3)) {
      seen++;
      const [s2, t1, t2] = sec.nodes;
      const dir = Math.sign(t1.xe - t1.xs);                       // the outer sub-branch is the one that goes away from the other branch
      assert.ok(Math.abs(s2.xe - s2.xs) < 1e-9 && Math.abs(t2.xe - t2.xs) > 0.5 && Math.sign(t2.xe - t2.xs) === -dir);
      assert.ok(trains.some((t) => t.node === t1.id));
      assert.ok(!trains.some((t) => t.node === t2.id || t.node === s2.id));
    }
  }
  assert.ok(seen >= 5, 'escape forks are generated');
});

test('escape forks get rarer with difficulty', () => {
  assert.ok(escapeChance(0) > escapeChance(TRAIN.RAMP_S) && Math.abs(escapeChance(1e6) - TRAIN.P_ESC_HARD) < 1e-9);
  let early = 0, earlyN = 0, late = 0, lateN = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = createTrainGame(seed); run(s, 140, true);
    for (const e of s.episodes) if (e.train) { const t = e.t; if (t < 25) { earlyN++; early += e.esc ? 1 : 0; } else if (t > 60) { lateN++; late += e.esc ? 1 : 0; } }
  }
  assert.ok(earlyN > 30 && lateN > 30);
  assert.ok(early / earlyN > late / lateN, `early ${early}/${earlyN} late ${late}/${lateN}`);
});

test('reading time: a train is in view long enough before its switch, even at top speed', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = createTrainGame(seed); run(s, 150, true);
    for (const e of s.episodes) {
      if (!e.train) continue;
      const decision = e.esc ? e.escZ : e.z0;
      const seeDist = TRAIN.SPAWN_Z - (e.trainZ - decision);       // how far before the switch the train comes into view
      assert.ok(seeDist / TRAIN.VMAX >= TRAIN.READ_S - 1e-9, `seed ${seed}: only ${(seeDist / TRAIN.VMAX).toFixed(2)} s`);
    }
  }
});

test('the first switch is free (no train), and the layout comes back to a single track after every episode', () => {
  const s = createTrainGame(5);
  assert.equal(s.episodes[0].train, false);
  run(s, 120, true);
  const last = s.sections[s.sections.length - 1];
  assert.equal(last.nodes.length, 1);
  assert.ok(Math.abs(last.nodes[0].xe) < 1e-9);
  for (let i = 0; i < 20; i++) { run(s, 3, true); const here = s.sections[s.si].nodes.find((n) => n.id === s.node); assert.ok(here); }
});

test('the cart takes the side it asked for at the switch; with no input, the side of its last choice (left at first)', () => {
  const a = createTrainGame(2), fa = untilFork(a);
  assert.equal(a.intent, 0); assert.equal(a.lastSide, -1);
  run(a, (fa.z - a.dist) / a.v + 0.5);
  assert.equal(a.node, fa.left.id, 'no input: the left, the default');
  const b = createTrainGame(2), fb = untilFork(b);
  assert.equal(setIntent(b, 1), true);
  run(b, (fb.z - b.dist) / b.v + 0.5);
  assert.equal(b.node, fb.right.id); assert.equal(b.lastSide, 1); assert.equal(b.intent, 0, 'the intent is spent at the switch');
  // and the next switch without input keeps the right side
  const f2 = untilFork(b); assert.ok(f2.z > fb.z);
  run(b, (f2.z - b.dist) / b.v + 0.5); assert.equal(b.node, f2.right.id);
  assert.equal(setIntent(b, 0), false);
});
test('the cart follows the rails: lateral position is continuous and the branch ends up BR away', () => {
  const s = createTrainGame(2), f = untilFork(s); setIntent(s, 1);
  let prev = s.x, maxStep = 0;
  while (s.dist < f.z + TRAIN.TL + 5) { step(s, MS); maxStep = Math.max(maxStep, Math.abs(s.x - prev)); prev = s.x; }
  assert.ok(maxStep < 0.05, 'no lateral jump'); assert.ok(Math.abs(s.x - TRAIN.BR) < 0.01);
  const sec = s.sections[sectionAt(s, f.z + 1)];
  assert.ok(Math.abs(nodeLat(sec, f.left, sec.z0) - 0) < 1e-9 && Math.abs(nodeLat(sec, f.left, sec.z0 + TRAIN.TL) + TRAIN.BR) < 1e-9);
});

test('the bot (which reads the trains) survives two minutes on 40 seeds; a player who never chooses does not', () => {
  let dumbHit = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = run(createTrainGame(seed), 120, true);
    assert.equal(s.hits, 0, `seed ${seed} was hit at ${s.t.toFixed(1)} s`);
    if (run(createTrainGame(seed), 120, false).hits) dumbHit++;
  }
  assert.ok(dumbHit >= 30, 'the choices matter');
});
test('a wrong choice is not always fatal: a bot that always takes the train branch at the first fork is saved by the escape fork when there is one', () => {
  let saved = 0, died = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = createTrainGame(seed);
    for (let i = 0; i < 60 * 40 && !s.over; i++) {
      const f = upcomingFork(s);
      if (f && f.z - s.dist < 200) {
        const withTrain = (n) => s.trains.some((t) => t.node === n.id);
        const ep = s.episodes.find((e) => Math.abs(e.z0 - f.z) < 1);
        if (ep && ep.train && !ep.esc) setIntent(s, withTrain(f.left) ? -1 : 1);                      // the wrong branch of a plain fork
        else if (ep && ep.esc && s.sections.indexOf(f.sec) >= 0 && f.sec.nodes.length === 2) setIntent(s, ep.tSide);   // the train's side of an escape episode
        else botIntent(s);
      }
      step(s, MS);
      if (s.hits) break;
    }
    const escEp = s.episodes.filter((e) => e.esc && e.z0 < s.dist);
    if (escEp.length && !s.hits) saved++;
    if (s.hits) died++;
  }
  assert.ok(saved > 0 && died > 0);
});

test('coins sit on branches, the risky branch of an escape fork holds more', () => {
  let found = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = createTrainGame(seed); const coins = new Map();
    for (let i = 0; i < 60 * 80; i++) { botIntent(s); step(s, MS); for (const c of s.coinList) coins.set(c.id, c); }
    for (const sec of s.sections.filter((x) => x.kind === 'fork' && x.nodes.length === 2)) {
      const ep = s.episodes.find((e) => Math.abs(e.z0 - sec.z0) < 1);
      if (!ep || !ep.esc) continue;
      const T1 = sec.nodes.find((n) => (n.xe < 0 ? -1 : 1) === ep.tSide), S1 = sec.nodes.find((n) => n !== T1);
      const cnt = (n) => [...coins.values()].filter((c) => c.node === n.id).length;
      if (cnt(T1) && cnt(S1)) { assert.ok(cnt(T1) >= cnt(S1)); found++; }
    }
  }
  assert.ok(found > 0);
});

test('speed ramps up and tops out; gaps shrink', () => {
  assert.equal(speedAt(0), TRAIN.V0); assert.ok(speedAt(30) > speedAt(10)); assert.equal(speedAt(1e6), TRAIN.VMAX);
  assert.equal(difficultyAt(0), 0); assert.equal(difficultyAt(1e6), 1);
  assert.ok(gapSeconds(0) > gapSeconds(TRAIN.RAMP_S));
  const s = createTrainGame(2); run(s, 10, true); assert.ok(Math.abs(s.v - speedAt(s.t)) < 1e-9 && s.v > TRAIN.V0);
});

function onTrack(s, z, len = 30) { s.trains = [{ id: 9001, node: s.node, z: s.dist + z, len }]; }
test('collision: a train on the cart\'s own track costs a life, with a flash and invulnerability', () => {
  const s = createTrainGame(1); onTrack(s, 1);
  const ev = step(s, MS);
  assert.ok(ev.includes('hit')); assert.equal(s.lives, TRAIN.LIVES - 1); assert.ok(s.invuln > 0 && s.flash > 0);
  for (let i = 0; i < 30; i++) step(s, MS);
  assert.equal(s.lives, TRAIN.LIVES - 1, 'no second hit from the same train, or while ghosted');
});
test('collision: a train on another branch, or already passed, does nothing', () => {
  const s = createTrainGame(1); s.trains = [{ id: 9001, node: s.node + 99, z: s.dist + 1, len: 30 }]; step(s, MS); assert.equal(s.hits, 0);
  const p = createTrainGame(1); p.trains = [{ id: 9002, node: p.node, z: p.dist - 60, len: 30 }]; step(p, MS); assert.equal(p.hits, 0);
});
test('lives: three hits end the run, then steps are ignored', () => {
  const s = createTrainGame(1);
  for (let n = 0; n < 3; n++) { s.invuln = 0; onTrack(s, 1); const ev = step(s, MS); if (n < 2) assert.ok(!ev.includes('over')); else assert.ok(ev.includes('over')); }
  assert.equal(s.lives, 0); assert.equal(s.over, true);
  const d = s.dist; step(s, MS); assert.equal(s.dist, d);
});
test('coins on the cart\'s own track are picked up once, and pay in the score', () => {
  const s = createTrainGame(1); s.coinList = [{ id: 1, node: s.node, z: s.dist + 1, taken: false }, { id: 2, node: s.node + 5, z: s.dist + 1, taken: false }];
  const ev = step(s, MS); assert.deepEqual(ev.filter((e) => e === 'coin'), ['coin']); assert.equal(s.coins, 1);
  step(s, MS); assert.equal(s.coins, 1);
  assert.equal(scoreOf(s), Math.floor(s.dist / TRAIN.SCORE_DIV) + TRAIN.COIN_POINTS);
});
test('score grows with distance', () => {
  const s = createTrainGame(4); run(s, 5, true); const a = scoreOf(s); run(s, 5, true); assert.ok(scoreOf(s) > a);
});
