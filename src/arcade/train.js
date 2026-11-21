// "Tren": the rules of the rail-cart game, with no drawing and no clock of its own. The cart rides ONE track along a finite route that ends at a station
// (ROUTE_LEN). Every so often the track forks at a rail switch into 2, later 3 and finally 4 branches; trains block some of them (1 of 2; 1-2 of 3; then 2 or 3 of
// 4) but at least one branch is always open. The player picks the branch before the cart reaches the switch: each tap or arrow key moves the choice one branch left
// or right (with no input the cart keeps its last relative position: the leftmost at the start). A train waits far ahead on each blocked branch, its headlight
// visible early, so the player reads ahead which branch is free. On a 2-branch fork the train's branch sometimes forks again before the train (an escape fork),
// a chance that falls with difficulty. Branches merge back later. Reaching the station wins the run. Distances are world units along the track (absolute z; the
// cart is at s.dist), speeds in units per second. A run is a function of its seed.
export const TRAIN = {
  LIVES: 3,
  INVULN_MS: 1600,               // after a crash the cart is a ghost for this long
  FLASH_MS: 380,                 // the crash flash
  V0: 34, VMAX: 92, ACC: 0.9,    // start speed, top speed, units per second gained per second
  SPAWN_Z: 230,                  // how far ahead the player can see (trains and branches fade in there)
  BUFFER: 100,                   // layout is generated this far beyond SPAWN_Z
  FIRST_Z: 150,                  // the first switch (no train on it: a free choice to learn the controls)
  DEPTH: 2.4,                    // the cart's own length along the track
  TL: 46,                        // length of a fork's / merge's transition: the rails part (or join) over this distance
  BR: 1.5,                       // how far a branch ends up from its parent, in lanes
  ROUTE_LEN: 6400,               // the station is this far from the start (about 90 s at the speeds below)
  EP_RESERVE: 420,               // no fork starts closer than this to the station: the last stretch is clear track
  SPREAD: 1.9,                   // lanes between neighbouring branches of a 3 or 4 branch fork (a 2 branch fork uses +-BR)
  LEN_MIN: 26, LEN_MAX: 42,      // train lengths
  OFF_MIN: 18, OFF_MAX: 40,      // a train starts this far past the end of its fork's transition (close behind the switch: it is readable from the start)
  OFF_MIN_HARD: 28, OFF_MAX_HARD: 54,   // ... and further out late in the run, so there is less time to read it
  ESC_GAP: 34, ESC_JITTER: 18,   // an escape fork comes this far past the first fork's transition
  GAP_EASY: 1.8, GAP_HARD: 0.95, // seconds of plain track after a train, and between episodes, at the speed the cart will have by then
  RAMP_S: 80,                    // seconds until the run is as hard as it gets
  P_ESC_EASY: 0.65, P_ESC_HARD: 0.15,   // the chance that a train's branch has an escape fork, falling with difficulty
  P_FREE: 0.1,                   // forks with no train at all (just a choice of coins)
  COIN_GAP: 7, COIN_X: 3,        // coins on a line are this far apart; a coin counts when the cart is within COIN_X units
  SCORE_DIV: 4, COIN_POINTS: 5,
  READ_S: 1.3,                   // the layout guarantees at least this many seconds between seeing a train and reaching its switch (at top speed)
  HOLD_MS: 1000,                 // how long the run stays on screen after arriving before the win panel
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/** mulberry32: a small seeded generator. next(s) advances s.rng and returns [0, 1). */
export function next(s) {
  s.rng = (s.rng + 0x6D2B79F5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const speedAt = (t) => Math.min(TRAIN.VMAX, TRAIN.V0 + TRAIN.ACC * t);
export const difficultyAt = (t) => clamp01(t / TRAIN.RAMP_S);
export const gapSeconds = (t) => lerp(TRAIN.GAP_EASY, TRAIN.GAP_HARD, difficultyAt(t));
/** The chance that a train's branch has an escape fork when the episode is met at run time t. */
export const escapeChance = (t) => lerp(TRAIN.P_ESC_EASY, TRAIN.P_ESC_HARD, difficultyAt(t));
/** How far along the route a distance is, 0..1. */
export const progressAt = (dist) => clamp01(dist / TRAIN.ROUTE_LEN);
/** What a fork looks like at route progress p: { n branches, blocked }. r1 and r2 are [0, 1) rolls. n is 2 early, 3 mid-route, 4 late; there is always an open branch. */
export function forkShape(p, r1, r2) {
  const n = p < 0.2 ? 2 : p < 0.45 ? (r1 < 0.15 ? 2 : 3) : p < 0.7 ? (r1 < 0.5 ? 3 : 4) : (r1 < 0.15 ? 3 : 4);
  const blocked = n === 2 ? 1 : n === 3 ? (r2 < lerp(0.35, 0.8, p) ? 2 : 1) : (r2 < lerp(0.2, 0.75, p) ? 3 : 2);
  return { n, blocked };
}
/** The lateral end positions (lanes, relative to the parent track) of an n branch fork. */
export const branchX = (n) => (n === 2 ? [-TRAIN.BR, TRAIN.BR] : Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * TRAIN.SPREAD));
export const scoreOf = (s) => Math.floor(s.dist / TRAIN.SCORE_DIV) + s.coins * TRAIN.COIN_POINTS;

/** The lateral position (lanes, absolute) of a node of section `sec` at distance z: it moves from xs to xe over the section's first TL units, then holds. */
export const nodeLat = (sec, node, z) => lerp(node.xs, node.xe, smooth(clamp01((z - sec.z0) / TRAIN.TL)));

/** The section a distance z falls in (the last one starting at or before z). */
export function sectionAt(s, z) {
  let i = s.sections.length - 1;
  while (i > 0 && s.sections[i].z0 > z) i--;
  return i;
}

export function createTrainGame(seed = 1) {
  const s = {
    seed: seed >>> 0, rng: seed >>> 0,
    t: 0, dist: 0, v: TRAIN.V0, coins: 0, lives: TRAIN.LIVES, over: false, won: false, hits: 0,
    goal: TRAIN.ROUTE_LEN,                    // the station
    invuln: 0, flash: 0,
    sections: [{ z0: -100, kind: 'start', nodes: [{ id: 0, xs: 0, xe: 0, parents: [] }] }],
    node: 0, si: 0, x: 0,                     // the node the cart is on, the section it is in, its lateral position
    pick: null, lastFrac: 0,                  // pick: the branch index chosen for the next switch (null: none yet); lastFrac: where the last choice sat, 0 = leftmost .. 1 = rightmost
    trains: [], coinList: [],                 // { id, node, z, len } and { id, node, z, taken }
    episodes: [],                             // what was generated, for the tests: { z0, n, blocked, train, esc, ... }
    cur: 0, nextZ: TRAIN.FIRST_Z, nid: 0, uid: 0, eps: 0,
    events: [],
  };
  fill(s);
  return s;
}

const addSection = (s, z0, kind, nodes, extra) => s.sections.push({ z0, kind, nodes, ...extra });
const mkNode = (s, xs, xe, parents) => ({ id: ++s.nid, xs, xe, parents });
const rnd = (s, a, b) => a + next(s) * (b - a);
function coinLine(s, node, zFrom, zTo, max) {
  let n = 0;
  for (let z = zFrom; z <= zTo && n < max; z += TRAIN.COIN_GAP, n++) s.coinList.push({ id: ++s.uid, node: node.id, z, taken: false });
}
const shuffled = (s, n) => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(next(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function genEpisode(s) {
  const z0 = s.nextZ, cur = s.cur;
  const arrival = s.t + Math.max(0, z0 - s.dist) / Math.max(1, s.v);
  const vArr = speedAt(arrival), gap = gapSeconds(arrival) * vArr, d = difficultyAt(arrival);
  const hasTrain = s.eps > 0 && next(s) >= TRAIN.P_FREE;
  const shape = forkShape(progressAt(z0), next(s), next(s));
  const esc = hasTrain && shape.n === 2 && next(s) < escapeChance(arrival);
  const TL = TRAIN.TL, BR = TRAIN.BR;
  const offMin = lerp(TRAIN.OFF_MIN, TRAIN.OFF_MIN_HARD, d), offMax = lerp(TRAIN.OFF_MAX, TRAIN.OFF_MAX_HARD, d);
  const ep = { z0, t: arrival, n: shape.n, blocked: hasTrain ? shape.blocked : 0, train: hasTrain, esc, tSide: 0, trainZ: null, escZ: null, trainNode: null, trainNodes: [] };
  s.episodes.push(ep);
  s.eps++;
  const addTrain = (node, z) => {
    const len = Math.round(rnd(s, TRAIN.LEN_MIN, TRAIN.LEN_MAX));
    s.trains.push({ id: ++s.uid, node: node.id, z, len, look: Math.floor(next(s) * 3) });
    ep.trainNodes.push(node.id); ep.trainZ = Math.max(ep.trainZ ?? -1e9, z); if (ep.trainNode === null) ep.trainNode = node.id;
    return z + len;
  };
  if (!esc) {
    const br = branchX(shape.n).map((x) => mkNode(s, 0, x, [cur]));
    addSection(s, z0, 'fork', br);
    const blockedIdx = hasTrain ? shuffled(s, shape.n).slice(0, shape.blocked) : [];
    if (shape.n === 2 && hasTrain) ep.tSide = blockedIdx[0] === 0 ? -1 : 1;
    let end = z0 + TL + 70;
    if (hasTrain) {
      end = 0;
      br.forEach((node, i) => {
        if (blockedIdx.includes(i)) {
          const z = z0 + TL + rnd(s, offMin, offMax);
          coinLine(s, node, z0 + TL + 4, z - 6, 3);
          end = Math.max(end, addTrain(node, z));
        } else coinLine(s, node, z0 + TL + 8, z0 + TL + 60, 5);
      });
    } else br.forEach((node, i) => coinLine(s, node, z0 + TL + 8, z0 + TL + 60, 5 + (i & 1)));
    const zm = end + gap;
    const mn = br.map((node) => mkNode(s, node.xe, 0, [node.id]));
    addSection(s, zm, 'merge', mn);
    const n = mkNode(s, 0, 0, mn.map((q) => q.id));
    addSection(s, zm + TL, 'cont', [n]);
    s.cur = n.id;
    s.nextZ = zm + TL + gap;
  } else {
    // the train's branch forks again before the train: an escape. The train waits on the outer sub-branch; the inner one (towards the other branch) is free.
    const tSide = next(s) < 0.5 ? -1 : 1;
    ep.tSide = tSide;
    const L = mkNode(s, 0, -BR, [cur]), R = mkNode(s, 0, BR, [cur]);
    addSection(s, z0, 'fork', [L, R]);
    const T = tSide < 0 ? L : R, S = tSide < 0 ? R : L;
    const ze = z0 + TL + TRAIN.ESC_GAP + next(s) * TRAIN.ESC_JITTER;
    ep.escZ = ze;
    coinLine(s, T, z0 + TL + 6, ze - 6, 5);                          // bait: the risky branch holds more coins
    coinLine(s, S, z0 + TL + 8, z0 + TL + 50, 4);
    const s2 = mkNode(s, S.xe, S.xe, [S.id]);
    const t1 = mkNode(s, T.xe, T.xe + tSide * BR, [T.id]), t2 = mkNode(s, T.xe, T.xe - tSide * BR, [T.id]);
    addSection(s, ze, 'fork', [s2, t1, t2], { esc: true });
    const end = addTrain(t1, ze + TL + rnd(s, offMin, offMax));
    coinLine(s, t2, ze + TL + 6, ze + TL + 40, 4); coinLine(s, s2, ze + TL + 6, ze + TL + 40, 4);
    const zm1 = end + gap;
    const s3 = mkNode(s, S.xe, S.xe, [s2.id]), m1 = mkNode(s, t1.xe, T.xe, [t1.id]), m2 = mkNode(s, t2.xe, T.xe, [t2.id]);
    addSection(s, zm1, 'merge', [s3, m1, m2]);
    const s4 = mkNode(s, S.xe, S.xe, [s3.id]), tn = mkNode(s, T.xe, T.xe, [m1.id, m2.id]);
    addSection(s, zm1 + TL, 'cont', [s4, tn]);
    const zm2 = zm1 + TL + gap * 0.6;
    const mS = mkNode(s, S.xe, 0, [s4.id]), mT = mkNode(s, T.xe, 0, [tn.id]);
    addSection(s, zm2, 'merge', [mS, mT]);
    const n = mkNode(s, 0, 0, [mS.id, mT.id]);
    addSection(s, zm2 + TL, 'cont', [n]);
    s.cur = n.id;
    s.nextZ = zm2 + TL + gap;
  }
}
function fill(s) { while (s.nextZ <= s.dist + TRAIN.SPAWN_Z + TRAIN.BUFFER && s.nextZ <= TRAIN.ROUTE_LEN - TRAIN.EP_RESERVE) genEpisode(s); }

const childrenOf = (sec, id) => sec.nodes.filter((n) => n.parents.includes(id));
const byLat = (a, b) => a.xe - b.xe;

/** The branches a fork section offers, left to right (an escape fork: the two sub-branches of the train's branch). */
export const branchesOf = (sec) => (sec.esc ? [sec.nodes[1], sec.nodes[2]].sort(byLat) : [...sec.nodes].sort(byLat));

/** The next switch ahead of the cart on its way: { sec, z, branches (left to right), left, right (the outermost two) }, or null. Follows merges, not choices. */
export function upcomingFork(s) {
  let cur = s.node;
  for (let j = s.si + 1; j < s.sections.length; j++) {
    const sec = s.sections[j], ch = childrenOf(sec, cur);
    if (!ch.length) return null;
    if (sec.kind === 'fork' && ch.length >= 2) { const br = [...ch].sort(byLat); return { sec, z: sec.z0, branches: br, left: br[0], right: br[br.length - 1] }; }
    cur = ch[0].id;
  }
  return null;
}

/** The branch index the cart will take at fork f: the player's pick, else the same relative position as the last choice. */
export function chosenIndex(s, f) {
  const n = f.branches.length;
  return s.pick !== null && s.pick !== undefined ? Math.max(0, Math.min(n - 1, s.pick)) : Math.round(s.lastFrac * (n - 1));
}

/** The player's input: move the choice for the next switch one branch left (-1) or right (1). Only counts before the switch is crossed. */
export function setIntent(s, dir) {
  if (s.over || (dir !== -1 && dir !== 1)) return false;
  const f = upcomingFork(s);
  if (!f) return false;
  s.pick = Math.max(0, Math.min(f.branches.length - 1, chosenIndex(s, f) + dir));
  return true;
}
/** Choose branch `idx` (0 = leftmost) of the next switch directly (the demo bot, tests). */
export function pickBranch(s, idx) {
  const f = upcomingFork(s);
  if (s.over || !f) return false;
  s.pick = Math.max(0, Math.min(f.branches.length - 1, idx));
  return true;
}

/** One fixed step of `ms` ms. Returns the events: 'switch' (a fork was crossed), 'coin', 'hit', 'over' (all lives lost), 'win' (the station was reached) (s.events, emptied first). */
export function step(s, ms) {
  s.events.length = 0;
  if (s.over) return s.events;
  const dt = ms / 1000;
  s.t += dt; s.v = speedAt(s.t);
  s.dist += s.v * dt;
  // crossing section boundaries: a fork takes the chosen branch (or the one at the last choice's relative position), anything else just continues
  const i = sectionAt(s, s.dist);
  for (let j = s.si + 1; j <= i; j++) {
    const sec = s.sections[j], ch = childrenOf(sec, s.node);
    if (sec.kind === 'fork' && ch.length >= 2) {
      const br = [...ch].sort(byLat), idx = chosenIndex(s, { branches: br });
      s.node = br[idx].id; s.lastFrac = idx / (br.length - 1); s.pick = null; s.events.push('switch');
    } else if (ch.length) s.node = ch[0].id;
  }
  s.si = i;
  const sec = s.sections[i], me = sec.nodes.find((n) => n.id === s.node);
  s.x = nodeLat(sec, me, s.dist);
  s.invuln = Math.max(0, s.invuln - ms); s.flash = Math.max(0, s.flash - ms);
  s.trains = s.trains.filter((t) => t.z + t.len > s.dist - 12);
  s.coinList = s.coinList.filter((c) => c.z > s.dist - 10 && !c.taken);
  while (s.sections.length > 2 && s.sections[1].z0 < s.dist - 60) { s.sections.shift(); s.si--; }
  fill(s);
  for (const c of s.coinList) if (c.node === s.node && Math.abs(c.z - s.dist) < TRAIN.COIN_X) { c.taken = true; s.coins++; s.events.push('coin'); }
  for (const t of s.trains) {
    if (t.hit || t.node !== s.node || s.invuln > 0) continue;
    if (t.z - s.dist <= TRAIN.DEPTH && t.z + t.len - s.dist >= 0) {
      t.hit = true; s.lives--; s.hits++; s.invuln = TRAIN.INVULN_MS; s.flash = TRAIN.FLASH_MS; s.events.push('hit');
      if (s.lives <= 0) { s.over = true; s.events.push('over'); }
      break;
    }
  }
  if (!s.over && s.dist >= s.goal) { s.dist = s.goal; s.over = true; s.won = true; s.events.push('win'); }
  return s.events;
}

/** The demo bot: reads the next switch and picks the branch without a train (when several are free, the one with the most coins; the leftmost on a tie). */
export function botIntent(s) {
  const f = upcomingFork(s);
  if (!f || f.z - s.dist > TRAIN.SPAWN_Z) return -1;
  const score = (n) => (s.trains.some((t) => t.node === n.id) ? -1000 : 0) + s.coinList.filter((c) => c.node === n.id).length;
  let best = 0;
  f.branches.forEach((n, i) => { if (score(n) > score(f.branches[best])) best = i; });
  pickBranch(s, best);
  return best;
}
