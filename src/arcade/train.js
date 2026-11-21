// "Tren": the rules of the rail-cart game, with no drawing and no clock of its own. The pet's cart rides one of three parallel tracks and trains come down
// the tracks towards it; the player slides left or right to a free track and picks up coins. Distances are in world units along the track (z = 0 is the cart,
// larger is further away), speeds in units per second. A run is a pure function of its seed: the spawner draws only from a seeded generator and from the
// run's own (fixed-step) time, so the same seed gives the same trains on every screen and in the tests.
import { clampLane } from './lanes.js';

export const TRAIN = {
  LIVES: 3,
  SLIDE_MS: 170,                 // a lane change takes this long (eased)
  INVULN_MS: 1600,               // after a crash the cart is a ghost for this long
  FLASH_MS: 380,                 // the crash flash
  V0: 34, VMAX: 84, ACC: 0.8,    // start speed, top speed, units per second gained per second
  SPAWN_Z: 230,                  // trains appear at this distance (the scene fades them in)
  BUFFER: 70,                    // rows are generated this far beyond SPAWN_Z, so the player never sees a row being made
  FIRST_Z: 140,                  // the first row's distance: a few seconds of free track at the start
  DEPTH: 2.4,                    // the cart's own length along the track
  HIT_X: 0.6,                    // a train hits when the cart is closer than this many lanes to its track
  COIN_X: 0.55,
  LEN_MIN: 24, LEN_MAX: 44,      // train lengths
  GAP_EASY: 1.7, GAP_HARD: 0.8,  // seconds of free track between the end of one row and the next, at the speed the cart will have by then
  MOVE_S: 0.45,                  // what the generator assumes it takes to change by one lane: the slide plus a thumb's reaction
  RAMP_S: 70,                    // seconds until the run is as hard as it gets
  SCORE_DIV: 4,                  // one score point per this many units travelled
  COIN_POINTS: 5,
  COIN_GAP: 7,                   // coins on a line are this far apart
  LOOK_S: 1.5,                   // how far ahead (seconds) the demo bot looks
};

const ease = (p) => p * p * (3 - 2 * p);                 // smoothstep: the slide starts and ends softly
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** mulberry32: a small seeded generator. next(s) advances s.rng and returns [0, 1). */
export function next(s) {
  s.rng = (s.rng + 0x6D2B79F5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, list) => list[Math.floor(next(s) * list.length)];

/** The cart's speed after `t` seconds of running. */
export const speedAt = (t) => Math.min(TRAIN.VMAX, TRAIN.V0 + TRAIN.ACC * t);
/** 0 at the start of a run, 1 once it is as hard as it gets. */
export const difficultyAt = (t) => clamp01(t / TRAIN.RAMP_S);
/** Seconds of free track the generator leaves between two rows when the second arrives at run time t. */
export const gapSeconds = (t) => TRAIN.GAP_EASY + (TRAIN.GAP_HARD - TRAIN.GAP_EASY) * difficultyAt(t);
/** The score of a run so far. */
export const scoreOf = (s) => Math.floor(s.dist / TRAIN.SCORE_DIV) + s.coins * TRAIN.COIN_POINTS;

let ids = 0;
export function createTrainGame(seed = 1) {
  const s = {
    seed: seed >>> 0, rng: seed >>> 0,
    t: 0, dist: 0, v: TRAIN.V0, coins: 0, lives: TRAIN.LIVES, over: false,
    lane: 0, x: 0, slide: null,                // lane: where the player is going (-1, 0, 1); x: where the cart is now, mid-slide in between
    invuln: 0, flash: 0, hits: 0,
    objs: [],                                  // { id, kind: 'train' | 'coin', lane, z, len?, look?, taken?, hit? }
    nextFront: TRAIN.FIRST_Z,                  // where the next row's front will be
    prevEnd: 0, prevFree: [-1, 0, 1], rows: 0,
    events: [],
  };
  fill(s);
  return s;
}

/** The lanes a row of `nBlocked` trains can leave free so that the cart can still get from where it was free to a free lane in the gap's time. */
function freeChoices(prevFree, nBlocked, maxShift) {
  const out = [];
  const all = [-1, 0, 1];
  const subsets = nBlocked === 1 ? [[-1], [0], [1]] : [[-1, 0], [-1, 1], [0, 1]];
  for (const blocked of subsets) {
    const free = all.filter((l) => !blocked.includes(l));
    if (prevFree.some((a) => free.some((b) => Math.abs(a - b) <= maxShift))) out.push({ blocked, free });
  }
  return out;
}

function genRow(s) {
  const front = s.nextFront;
  const arrival = s.t + Math.max(0, front) / Math.max(1, s.v);               // when the cart will get there (roughly)
  const d = difficultyAt(arrival), vArr = speedAt(arrival);
  const gapT = gapSeconds(arrival);
  const maxShift = Math.floor((gapT + 1e-9) / TRAIN.MOVE_S);
  const double = s.rows >= 2 && next(s) < 0.1 + 0.3 * d;
  const options = freeChoices(s.prevFree, double ? 2 : 1, maxShift);
  const { blocked, free } = options.length ? pick(s, options) : { blocked: [], free: [-1, 0, 1] };
  let end = front;
  const color = Math.floor(next(s) * 3);
  for (const lane of blocked) {
    const len = Math.round(TRAIN.LEN_MIN + next(s) * (TRAIN.LEN_MAX - TRAIN.LEN_MIN));
    s.objs.push({ id: ++ids, kind: 'train', lane, z: front, len, look: (color + lane + 1 + 3) % 3 });
    end = Math.max(end, front + len);
  }
  // coins: a line in the gap before this row, on a lane reachable from where the previous row left the cart, then (sometimes) along the row in a free lane
  const gapLen = front - s.prevEnd;
  const reach = free.filter((b) => s.prevFree.some((a) => Math.abs(a - b) <= maxShift));
  if (gapLen > 14 && reach.length) {
    const lane = pick(s, reach), n = Math.min(6, Math.floor((gapLen - 8) / TRAIN.COIN_GAP));
    for (let i = 0; i < n; i++) s.objs.push({ id: ++ids, kind: 'coin', lane, z: s.prevEnd + 5 + i * TRAIN.COIN_GAP, taken: false });
  }
  if (blocked.length && next(s) < 0.6) {
    const lane = pick(s, free);
    for (let z = front + 6, i = 0; z < end - 4 && i < 5; z += TRAIN.COIN_GAP + 2, i++) s.objs.push({ id: ++ids, kind: 'coin', lane, z, taken: false });
  }
  s.prevEnd = end;
  s.prevFree = free;
  s.rows++;
  s.nextFront = end + gapT * vArr;
}

function fill(s) { while (s.nextFront <= TRAIN.SPAWN_Z + TRAIN.BUFFER) genRow(s); }

/** Starts a slide to the next lane in `dir` (-1 left, +1 right). False when already at the edge, or the run is over. */
export function moveLane(s, dir) {
  if (s.over) return false;
  const target = clampLane(s.lane + dir);
  if (target === s.lane) return false;
  s.lane = target;
  s.slide = { from: s.x, to: target, t: 0 };
  s.events.push('move');
  return true;
}

/** One fixed step of `ms` milliseconds. Returns the events that happened ('move' is pushed by moveLane): 'coin' | 'hit' | 'over'. The array is s.events, emptied first. */
export function step(s, ms) {
  s.events.length = 0;
  if (s.over) return s.events;
  const dt = ms / 1000;
  s.t += dt;
  s.v = speedAt(s.t);
  const dz = s.v * dt;
  s.dist += dz;
  if (s.slide) {
    s.slide.t += ms;
    const p = clamp01(s.slide.t / TRAIN.SLIDE_MS);
    s.x = s.slide.from + (s.slide.to - s.slide.from) * ease(p);
    if (p >= 1) { s.x = s.slide.to; s.slide = null; }
  }
  s.invuln = Math.max(0, s.invuln - ms);
  s.flash = Math.max(0, s.flash - ms);
  s.nextFront -= dz;
  for (const o of s.objs) o.z -= dz;
  s.objs = s.objs.filter((o) => (o.kind === 'train' ? o.z + o.len > -10 : o.z > -8 && !o.taken));
  fill(s);
  let crashed = false;
  for (const o of s.objs) {
    if (o.kind === 'coin') {
      if (o.z <= 3 && o.z >= -3 && Math.abs(s.x - o.lane) < TRAIN.COIN_X) { o.taken = true; s.coins++; s.events.push('coin'); }
    } else if (!crashed && !o.hit && s.invuln <= 0 && o.z <= TRAIN.DEPTH && o.z + o.len >= 0 && Math.abs(s.x - o.lane) < TRAIN.HIT_X) {
      o.hit = true; crashed = true;
      s.lives--; s.hits++; s.invuln = TRAIN.INVULN_MS; s.flash = TRAIN.FLASH_MS;
      s.events.push('hit');
      if (s.lives <= 0) { s.over = true; s.events.push('over'); }
    }
  }
  return s.events;
}

/** The demo bot (used by the tests and the previews): which way to slide now (-1, 0, 1) to stay clear of the trains in the next LOOK_S seconds. */
export function botDir(s) {
  const look = s.v * TRAIN.LOOK_S;
  const trains = s.objs.filter((o) => o.kind === 'train' && !o.hit && o.z + o.len >= 0);
  const soon = (L) => trains.some((o) => o.lane === L && o.z <= look);
  const here = (L) => trains.some((o) => o.lane === L && o.z <= TRAIN.DEPTH + s.v * 0.3);     // a train is on this track right now (or about to be)
  if (!soon(s.lane)) return 0;
  const cands = [-1, 0, 1].filter((L) => L !== s.lane && !soon(L)).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane));
  for (const L of cands) {
    const dir = Math.sign(L - s.lane);
    if (!here(s.lane + dir)) return dir;
  }
  return 0;
}
