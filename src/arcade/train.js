// "Tren": the rules of the rail-cart game, with no drawing and no clock of its own. The cart rides ONE track. Every so often the track forks at a rail switch into
// two branches and the player must pick left or right before the cart reaches the switch (a tap or arrow key sets the intent; with no input the cart takes the side
// of its last choice, the left at the start). A train waits far ahead on one of the branches, its headlight visible early, so the player reads ahead which branch is
// free. Sometimes the train's branch forks again before the train (an escape fork) and a wrong choice can still be saved. Branches merge back later. There is no free
// lane switching. Distances are world units along the track (absolute z; the cart is at s.dist), speeds in units per second. A run is a function of its seed.
export const TRAIN = {
  LIVES: 3,
  INVULN_MS: 1600,               // after a crash the cart is a ghost for this long
  FLASH_MS: 380,                 // the crash flash
  V0: 34, VMAX: 84, ACC: 0.8,    // start speed, top speed, units per second gained per second
  SPAWN_Z: 230,                  // how far ahead the player can see (trains and branches fade in there)
  BUFFER: 100,                   // layout is generated this far beyond SPAWN_Z
  FIRST_Z: 150,                  // the first switch (no train on it: a free choice to learn the controls)
  DEPTH: 2.4,                    // the cart's own length along the track
  TL: 46,                        // length of a fork's / merge's transition: the rails part (or join) over this distance
  BR: 1.5,                       // how far a branch ends up from its parent, in lanes
  LEN_MIN: 26, LEN_MAX: 42,      // train lengths
  OFF_MIN: 18, OFF_MAX: 40,      // a train starts this far past the end of its fork's transition (close behind the switch: it is readable from the start)
  ESC_GAP: 34, ESC_JITTER: 18,   // an escape fork comes this far past the first fork's transition
  GAP_EASY: 1.8, GAP_HARD: 1.05, // seconds of plain track after a train, and between episodes, at the speed the cart will have by then
  RAMP_S: 70,                    // seconds until the run is as hard as it gets
  P_ESC_EASY: 0.65, P_ESC_HARD: 0.15,   // the chance that a train's branch has an escape fork, falling with difficulty
  P_FREE: 0.1,                   // forks with no train at all (just a choice of coins)
  COIN_GAP: 7, COIN_X: 3,        // coins on a line are this far apart; a coin counts when the cart is within COIN_X units
  SCORE_DIV: 4, COIN_POINTS: 5,
  READ_S: 1.4,                   // the layout guarantees at least this many seconds between seeing a train and reaching its switch (at top speed)
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
    t: 0, dist: 0, v: TRAIN.V0, coins: 0, lives: TRAIN.LIVES, over: false, hits: 0,
    invuln: 0, flash: 0,
    sections: [{ z0: -100, kind: 'start', nodes: [{ id: 0, xs: 0, xe: 0, parents: [] }] }],
    node: 0, si: 0, x: 0,                     // the node the cart is on, the section it is in, its lateral position
    intent: 0, lastSide: -1,                  // intent: the side picked for the next switch (-1 left, 1 right, 0 none); lastSide: the default
    trains: [], coinList: [],                 // { id, node, z, len } and { id, node, z, taken }
    episodes: [],                             // what was generated, for the tests: { z0, train, esc, ... }
    cur: 0, nextZ: TRAIN.FIRST_Z, nid: 0, uid: 0, eps: 0,
    events: [],
  };
  fill(s);
  return s;
}

const addSection = (s, z0, kind, nodes) => s.sections.push({ z0, kind, nodes });
const mkNode = (s, xs, xe, parents) => ({ id: ++s.nid, xs, xe, parents });
const rnd = (s, a, b) => a + next(s) * (b - a);
function coinLine(s, node, zFrom, zTo, max) {
  let n = 0;
  for (let z = zFrom; z <= zTo && n < max; z += TRAIN.COIN_GAP, n++) s.coinList.push({ id: ++s.uid, node: node.id, z, taken: false });
}

function genEpisode(s) {
  const z0 = s.nextZ, cur = s.cur;
  const arrival = s.t + Math.max(0, z0 - s.dist) / Math.max(1, s.v);
  const vArr = speedAt(arrival), gap = gapSeconds(arrival) * vArr;
  const hasTrain = s.eps > 0 && next(s) >= TRAIN.P_FREE;
  const esc = hasTrain && next(s) < escapeChance(arrival);
  const tSide = next(s) < 0.5 ? -1 : 1;
  const TL = TRAIN.TL, BR = TRAIN.BR;
  const ep = { z0, t: arrival, train: hasTrain, esc, tSide, trainZ: null, escZ: null, trainNode: null };
  s.episodes.push(ep);
  s.eps++;
  const L = mkNode(s, 0, -BR, [cur]), R = mkNode(s, 0, BR, [cur]);
  addSection(s, z0, 'fork', [L, R]);
  const T = tSide < 0 ? L : R, S = tSide < 0 ? R : L;
  let end;
  if (!esc) {
    const len = Math.round(rnd(s, TRAIN.LEN_MIN, TRAIN.LEN_MAX)), off = rnd(s, TRAIN.OFF_MIN, TRAIN.OFF_MAX);
    if (hasTrain) {
      const z = z0 + TL + off;
      s.trains.push({ id: ++s.uid, node: T.id, z, len, look: Math.floor(next(s) * 3) });
      ep.trainZ = z; ep.trainNode = T.id;
      coinLine(s, S, z0 + TL + 8, z0 + TL + 60, 5);
      coinLine(s, T, z0 + TL + 4, z - 6, 3);
      end = z + len;
    } else {
      coinLine(s, L, z0 + TL + 8, z0 + TL + 60, 5); coinLine(s, R, z0 + TL + 8, z0 + TL + 60, 6);
      end = z0 + TL + 70;
    }
    const zm = end + gap;
    const mL = mkNode(s, -BR, 0, [L.id]), mR = mkNode(s, BR, 0, [R.id]);
    addSection(s, zm, 'merge', [mL, mR]);
    const n = mkNode(s, 0, 0, [mL.id, mR.id]);
    addSection(s, zm + TL, 'cont', [n]);
    s.cur = n.id;
    s.nextZ = zm + TL + gap;
  } else {
    // the train's branch forks again before the train: an escape. The train waits on the outer sub-branch; the inner one (towards the other branch) is free.
    const ze = z0 + TL + TRAIN.ESC_GAP + next(s) * TRAIN.ESC_JITTER;
    ep.escZ = ze;
    coinLine(s, T, z0 + TL + 6, ze - 6, 5);                          // bait: the risky branch holds more coins
    coinLine(s, S, z0 + TL + 8, z0 + TL + 50, 4);
    const s2 = mkNode(s, S.xe, S.xe, [S.id]);
    const t1 = mkNode(s, T.xe, T.xe + tSide * BR, [T.id]), t2 = mkNode(s, T.xe, T.xe - tSide * BR, [T.id]);
    addSection(s, ze, 'fork', [s2, t1, t2]);
    const len = Math.round(rnd(s, TRAIN.LEN_MIN, TRAIN.LEN_MAX)), off = rnd(s, TRAIN.OFF_MIN, TRAIN.OFF_MAX), z = ze + TL + off;
    s.trains.push({ id: ++s.uid, node: t1.id, z, len, look: Math.floor(next(s) * 3) });
    ep.trainZ = z; ep.trainNode = t1.id;
    coinLine(s, t2, ze + TL + 6, ze + TL + 40, 4); coinLine(s, s2, ze + TL + 6, ze + TL + 40, 4);
    end = z + len;
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
function fill(s) { while (s.nextZ <= s.dist + TRAIN.SPAWN_Z + TRAIN.BUFFER) genEpisode(s); }

const childrenOf = (sec, id) => sec.nodes.filter((n) => n.parents.includes(id));

/** The next switch ahead of the cart on its way: { sec, z, left, right } (the two children by lateral order), or null. Follows merges, not choices. */
export function upcomingFork(s) {
  let cur = s.node;
  for (let j = s.si + 1; j < s.sections.length; j++) {
    const sec = s.sections[j], ch = childrenOf(sec, cur);
    if (!ch.length) return null;
    if (sec.kind === 'fork' && ch.length === 2) { const [a, b] = [...ch].sort((p, q) => p.xe - q.xe); return { sec, z: sec.z0, left: a, right: b }; }
    cur = ch[0].id;
  }
  return null;
}

/** The player's choice for the next switch: -1 left, 1 right. Input only counts before the switch is crossed. */
export function setIntent(s, dir) { if (!s.over && (dir === -1 || dir === 1)) { s.intent = dir; return true; } return false; }

/** One fixed step of `ms` ms. Returns the events: 'switch' (a fork was crossed), 'coin', 'hit', 'over' (s.events, emptied first). */
export function step(s, ms) {
  s.events.length = 0;
  if (s.over) return s.events;
  const dt = ms / 1000;
  s.t += dt; s.v = speedAt(s.t);
  s.dist += s.v * dt;
  // crossing section boundaries: a fork takes the branch of the intent (or of the last choice), anything else just continues
  const i = sectionAt(s, s.dist);
  for (let j = s.si + 1; j <= i; j++) {
    const sec = s.sections[j], ch = childrenOf(sec, s.node);
    if (sec.kind === 'fork' && ch.length === 2) {
      const side = s.intent || s.lastSide, [a, b] = [...ch].sort((p, q) => p.xe - q.xe);
      s.node = (side < 0 ? a : b).id; s.lastSide = side; s.intent = 0; s.events.push('switch');
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
  return s.events;
}

/** The demo bot: reads the next switch and sets the intent for the branch without a train (when neither holds one, the one with more coins). */
export function botIntent(s) {
  const f = upcomingFork(s);
  if (!f || f.z - s.dist > TRAIN.SPAWN_Z) return 0;
  const score = (n) => (s.trains.some((t) => t.node === n.id) ? -1000 : 0) + s.coinList.filter((c) => c.node === n.id).length;
  const side = score(f.left) >= score(f.right) ? -1 : 1;
  setIntent(s, side);
  return side;
}
