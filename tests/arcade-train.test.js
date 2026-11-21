import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/arcade/train.js';
const { createTrainGame, step, setIntent, pickBranch, chosenIndex, botIntent, upcomingFork, scoreOf, speedAt, difficultyAt, gapSeconds, escapeChance, nodeLat, sectionAt, forkShape, branchX, progressAt, branchesOf, TRAIN, next } = T;

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
        if (sibs.length === 2) assert.ok(occupied.length <= 1);
      }
    }
    assert.ok(forks > 3);
  }
});

test('escape forks put the train on the outer sub-branch and leave the inner one and the other branch free', () => {
  let seen = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { secs, trains } = record(seed, 90, true);
    for (const sec of secs.filter((x) => x.esc)) {
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

test('reading distance in landscape: a train at the reading distance is as big on screen as in portrait, and its row is well below the horizon', async () => {
  const { createProjection, viewLayout, logicalSize } = await import('../src/arcade/lanes.js');
  const z = T.TRAIN.VMAX * T.TRAIN.READ_S;                         // how far ahead a train must be readable at top speed
  const px = (cw, ch) => { const s = logicalSize(cw, ch), L = viewLayout(s.w, s.h), p = createProjection({ w: s.w, h: s.h, horizon: L.horizon, ground: L.ground, laneW: L.laneW }); return { s, p, size: p.k(z) * p.laneW / 50, rows: p.y(z) - p.horizon, lane: p.x(1, z) - p.x(0, z) }; };
  const port = px(390, 844), land = px(844, 390);
  assert.ok(land.size >= port.size * 0.95, `sprite scale ${land.size} vs ${port.size}`);
  assert.ok(land.rows >= 10, `${land.rows} rows below the horizon at ${z} units`);
  assert.ok(land.lane >= port.lane * 0.95);
  assert.ok(land.p.y(T.TRAIN.SPAWN_Z) - land.p.horizon >= 5);       // the far end of the view is still above the player's row, not on the horizon line
});

test('the first switch is free (no train), and the layout comes back to a single track after every episode', () => {
  const s = createTrainGame(5);
  assert.equal(s.episodes[0].train, false);
  run(s, 80, true);
  const last = s.sections[s.sections.length - 1];
  assert.equal(last.nodes.length, 1);
  assert.ok(Math.abs(last.nodes[0].xe) < 1e-9);
  for (let i = 0; i < 2; i++) { run(s, 3, true); const here = s.sections[s.si].nodes.find((n) => n.id === s.node); assert.ok(here); }
});

test('the cart takes the side it asked for at the switch; with no input, the side of its last choice (left at first)', () => {
  const a = createTrainGame(2), fa = untilFork(a);
  assert.equal(a.pick, null); assert.equal(a.lastFrac, 0);
  run(a, (fa.z - a.dist) / a.v + 0.5);
  assert.equal(a.node, fa.left.id, 'no input: the left, the default');
  const b = createTrainGame(2), fb = untilFork(b);
  assert.equal(setIntent(b, 1), true);
  run(b, (fb.z - b.dist) / b.v + 0.5);
  assert.equal(b.node, fb.right.id); assert.equal(b.lastFrac, 1); assert.equal(b.pick, null, 'the pick is spent at the switch');
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

test('the bot (which reads the trains) reaches the station unhurt on 40 seeds; a player who never chooses does not', () => {
  let dumbHit = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = run(createTrainGame(seed), 120, true);
    assert.equal(s.hits, 0, `seed ${seed} was hit at ${s.t.toFixed(1)} s`);
    assert.equal(s.won, true, `seed ${seed} did not arrive`);
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
        if (ep && ep.train && !ep.esc && ep.n === 2) pickBranch(s, withTrain(f.left) ? 0 : 1);          // the wrong branch of a plain fork
        else if (ep && ep.esc && s.sections.indexOf(f.sec) >= 0 && !f.sec.esc) pickBranch(s, ep.tSide < 0 ? 0 : 1);   // the train's side of an escape episode
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
    const s = createTrainGame(seed); const coins = new Map(), secs = new Set();
    for (let i = 0; i < 60 * 60; i++) { botIntent(s); step(s, MS); for (const c of s.coinList) coins.set(c.id, c); for (const x of s.sections) secs.add(x); }
    for (const sec of [...secs].filter((x) => x.kind === 'fork' && !x.esc && x.nodes.length === 2)) {
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

// ---- the route, the growing forks and the station ------------------------------------------------------------------------------------------------

test('fork shapes grow with the route: 2 branches early, 3 mid-route, 4 late, and the blocked ones outnumber the open ones as it goes', () => {
  const stats = (p) => { const n = new Map(), maxBlocked = new Map(); for (let a = 0; a < 20; a++) for (let b = 0; b < 20; b++) { const f = forkShape(p, a / 20, b / 20); n.set(f.n, (n.get(f.n) || 0) + 1); maxBlocked.set(f.n, Math.max(maxBlocked.get(f.n) || 0, f.blocked)); } return { n, maxBlocked }; };
  assert.deepEqual([...stats(0.05).n.keys()], [2]);
  const mid = stats(0.35); assert.ok(mid.n.get(3) > mid.n.get(2) && !mid.n.has(4));
  const late = stats(0.9); assert.ok(late.n.get(4) > late.n.get(3) && !late.n.has(2));
  for (let p = 0; p <= 1.0001; p += 0.05) for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
    const f = forkShape(p, a / 10, b / 10);
    assert.ok(f.n >= 2 && f.n <= 4 && f.blocked >= 1 && f.blocked <= f.n - 1, `p ${p}: ${f.n} branches ${f.blocked} blocked`);
  }
  assert.equal(stats(0.1).maxBlocked.get(2), 1);
  assert.equal(stats(0.6).maxBlocked.get(3), 2);          // 3 branches: one or two blocked
  assert.ok(stats(0.3).maxBlocked.get(4) === undefined || stats(0.3).maxBlocked.get(4) >= 2);
  assert.equal(stats(0.9).maxBlocked.get(4), 3);          // 4 branches: two blocked / two open, then three blocked / one open
  const low = new Set(), high = new Set();
  for (let a = 0; a < 20; a++) for (let b = 0; b < 20; b++) { const f = forkShape(0.9, 0.9 + a / 1000, b / 20); if (f.n === 4) high.add(f.blocked); const g = forkShape(0.9, 0.9, b / 20); if (g.n === 4) low.add(g.blocked); }
  assert.deepEqual([...high].sort(), ['2', '3'].map(Number)); assert.ok(low.has(2) && low.has(3));
  assert.deepEqual(branchX(2), [-TRAIN.BR, TRAIN.BR]);
  const x4 = branchX(4); assert.equal(x4.length, 4); assert.ok(Math.abs(x4[0] + x4[3]) < 1e-9 && x4[1] < x4[2]);
  assert.equal(branchX(3)[1], 0);
});

test('generated forks have 2, 3 and 4 branches in that order along the route, always with an open branch, and 4 branch forks block 2 or 3', () => {
  const seen = new Map();
  let lastOrderOk = true;
  for (let seed = 1; seed <= 30; seed++) {
    const s = createTrainGame(seed);
    run(s, 100, true);
    let maxN = 0;
    for (const e of s.episodes) {
      const k = `${e.n}/${e.blocked}`; seen.set(k, (seen.get(k) || 0) + 1);
      if (e.train) assert.ok(e.blocked >= 1 && e.blocked <= e.n - 1, `${k}: no open branch`);
      assert.equal(e.trainNodes.length, e.train ? (e.esc ? 1 : e.blocked) : 0);
      if (e.n < maxN - 1) lastOrderOk = false;
      maxN = Math.max(maxN, e.n);
      if (progressAt(e.z0) < 0.2) assert.equal(e.n, 2);
      if (progressAt(e.z0) > 0.7) assert.ok(e.n >= 3);
    }
    assert.ok(s.episodes[0].n === 2 && s.episodes[s.episodes.length - 1].n >= 3, `seed ${seed}: forks grow`);
  }
  assert.ok(lastOrderOk);
  for (const k of ['2/1', '3/1', '3/2', '4/2', '4/3']) assert.ok(seen.get(k) > 5, `${k} is generated`);
  assert.ok(![...seen.keys()].some((k) => k === '4/1' || k === '4/4' || k === '3/3'));
});

test('on a wide fork the trains block exactly the planned branches and the rest are open and reachable by the rails', () => {
  let checked = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const { s, secs, trains } = record(seed, 100, true);
    for (const sec of secs.filter((x) => x.kind === 'fork' && !x.esc && x.nodes.length >= 3)) {
      const blocked = sec.nodes.filter((n) => trains.some((t) => t.node === n.id)), open = sec.nodes.filter((n) => !blocked.includes(n));
      if (!blocked.length) continue;                                    // a free fork: only coins
      checked++;
      assert.ok(open.length >= 1 && blocked.length < sec.nodes.length);
      assert.ok(open.every((n) => n.parents.length === 1 && n.parents[0] === sec.nodes[0].parents[0]), 'every branch leaves the same track');
      assert.equal(branchesOf(sec).length, sec.nodes.length);
    }
    assert.equal(s.hits, 0);
  }
  assert.ok(checked > 50);
});

test('input on a wide fork: each tap moves the choice one branch and stops at the ends; no input keeps the last relative position', () => {
  const s = createTrainGame(11);
  const toWide = () => { for (let i = 0; i < 60 * 120; i++) { botIntent(s); step(s, MS); const f = upcomingFork(s); if (f && f.branches.length === 4 && f.z - s.dist < 150 && f.z - s.dist > 90) return f; } return null; };
  const f = toWide(); assert.ok(f, 'a 4 branch fork comes up');
  s.pick = null; s.lastFrac = 0;
  assert.equal(chosenIndex(s, f), 0);
  setIntent(s, 1); assert.equal(chosenIndex(s, f), 1);
  setIntent(s, 1); setIntent(s, 1); assert.equal(chosenIndex(s, f), 3);
  setIntent(s, 1); assert.equal(chosenIndex(s, f), 3, 'clamped at the right end');
  setIntent(s, -1); assert.equal(chosenIndex(s, f), 2);
  for (let i = 0; i < 5; i++) setIntent(s, -1);
  assert.equal(chosenIndex(s, f), 0, 'clamped at the left end');
  setIntent(s, 1); setIntent(s, 1);
  while (!s.events.includes('switch')) step(s, MS);
  assert.equal(s.node, f.branches[2].id); assert.equal(s.pick, null);
  assert.ok(Math.abs(s.lastFrac - 2 / 3) < 1e-9);
  // with no input at the next fork, the same relative position (rounded to a branch)
  assert.equal(chosenIndex(s, { branches: [1, 2] }), 1); assert.equal(chosenIndex(s, { branches: [1, 2, 3, 4] }), 2); assert.equal(chosenIndex(s, { branches: [1, 2, 3] }), 1);
  assert.equal(pickBranch(s, 99), upcomingFork(s) ? true : false);
});

/** A player at human pace: sees every blocked branch of the next switch, reacts after 0.3 s, then taps once every 0.18 s. */
function humanRun(seed) {
  const s = createTrainGame(seed);
  let plan = null, tapAt = 0;
  for (let i = 0; i < 60 * 200 && !s.over; i++) {
    const f = upcomingFork(s);
    if (f) {
      const ep = s.episodes.find((e) => Math.abs(e.z0 - f.z) < 1);
      const ahead = s.trains.filter((t) => f.branches.some((b) => b.id === t.node));
      const seen = ahead.length > 0 && ahead.every((t) => t.z - s.dist <= TRAIN.SPAWN_Z);
      if (!plan || plan.z !== f.z) plan = { z: f.z, at: null, target: null };
      if (seen && plan.at === null) {
        const open = f.branches.map((b, k) => [k, ahead.some((t) => t.node === b.id)]).filter(([, bl]) => !bl).map(([k]) => k);
        const here = chosenIndex(s, f);
        plan.target = open.sort((a, b) => Math.abs(a - here) - Math.abs(b - here))[0]; plan.at = s.t + 0.3; tapAt = plan.at;
      } else if (!ep || !ep.train) { if (plan.target === null) plan.target = chosenIndex(s, f); }
      if (plan.at !== null && s.t >= tapAt && chosenIndex(s, f) !== plan.target) { setIntent(s, plan.target > chosenIndex(s, f) ? 1 : -1); tapAt = s.t + 0.18; }
    }
    step(s, MS);
  }
  return s;
}
test('fairness at human pace: a player who reacts in 0.3 s and taps every 0.18 s still arrives, on every seed', () => {
  let tapsMax = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = humanRun(seed);
    assert.equal(s.hits, 0, `seed ${seed} was hit at ${s.t.toFixed(1)} s`);
    assert.equal(s.won, true);
    tapsMax = Math.max(tapsMax, s.episodes.length);
  }
  assert.ok(tapsMax > 10);
});

test('the route is finite: the cart arrives at the station at about 90 s, the run ends as a win and nothing moves afterwards', () => {
  assert.equal(createTrainGame(1).goal, TRAIN.ROUTE_LEN);
  const s = createTrainGame(6); let won = 0, arrivedAt = 0;
  for (let i = 0; i < 60 * 200 && !s.over; i++) { botIntent(s); const ev = step(s, MS); if (ev.includes('win')) { won++; arrivedAt = s.t; } }
  assert.equal(won, 1); assert.equal(s.won, true); assert.equal(s.over, true); assert.equal(s.dist, TRAIN.ROUTE_LEN);
  assert.ok(arrivedAt > 80 && arrivedAt < 100, `arrived at ${arrivedAt.toFixed(1)} s`);
  const d = s.dist; step(s, MS); assert.equal(s.dist, d); assert.equal(s.hits, 0);
});
test('losing every life ends the run without a win; the last stretch before the station is clear track', () => {
  const s = createTrainGame(1);
  for (let n = 0; n < 3; n++) { s.invuln = 0; s.trains = [{ id: 9100 + n, node: s.node, z: s.dist + 1, len: 30 }]; step(s, MS); }
  assert.equal(s.over, true); assert.equal(s.won, false);
  const r = createTrainGame(2); run(r, 85, true);
  const last = r.episodes[r.episodes.length - 1];
  assert.ok(TRAIN.ROUTE_LEN - last.z0 >= TRAIN.EP_RESERVE - 1);
  assert.equal(r.trains.filter((t) => t.z > TRAIN.ROUTE_LEN - 100).length, 0);
  assert.equal(progressAt(0), 0); assert.equal(progressAt(TRAIN.ROUTE_LEN * 2), 1); assert.ok(Math.abs(progressAt(TRAIN.ROUTE_LEN / 2) - 0.5) < 1e-9);
});
test('difficulty rises with the route: faster, closer-spaced episodes, trains further past their switch', () => {
  assert.ok(speedAt(60) > speedAt(10) && gapSeconds(80) < gapSeconds(5));
  const early = [], late = [];
  for (let seed = 1; seed <= 20; seed++) { const s = createTrainGame(seed); run(s, 90, true); for (const e of s.episodes) if (e.train && !e.esc) (e.z0 < 1500 ? early : late).push(e.trainZ - e.z0); }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(late) > avg(early), `trains start ${avg(early).toFixed(0)} early, ${avg(late).toFixed(0)} late past the switch`);
});
