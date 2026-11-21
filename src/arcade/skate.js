// "Patineta": the rules of the skateboard run, no drawing, no clock. Unlike the rail cart (discrete lanes), the board has momentum: steering is an
// acceleration that builds sideways speed, friction bleeds it off, the path's edges stop it; and it can JUMP: a gravity arc with hang time (steering is weaker
// in the air) and a squash on landing. Low obstacles (cones, puddles, barriers) are cleared by height, tall ones (planters, benches) only by steering; ramps
// launch a higher jump; some coins hang in the air. Positions: x across the path (-EDGE..EDGE, in lanes), z ahead of the board in world units, h the board's
// height above the ground in height units. Everything is a function of the seed and the fixed steps, so a run is repeatable.
import { next } from './train.js';

export const SKATE = {
  LIVES: 3, INVULN_MS: 1600, FLASH_MS: 380,
  V0: 30, VMAX: 72, ACC: 0.75,
  SPAWN_Z: 230, BUFFER: 70, FIRST_Z: 130,
  CORRIDOR: 0.8,                    // half width of the gap the generator always leaves free
  EDGE: 1.4,                       // the board can go this far from the middle
  PW: 0.26, DEPTH: 1.6,            // the board's half width (lanes) and length (units)
  STEER_ACC: 11, BRAKE_MULT: 1.6, AIR_STEER: 0.55, FRICTION: 4.2, AIR_FRICTION: 1.2, VMAX_X: 3.2, EDGE_BOUNCE: 0.2,
  G: 28, JUMP_V: 11.2, RAMP_V: 16,
  COYOTE_MS: 90, BUFFER_MS: 130, SQUASH_MS: 150,
  GAP_EASY: 1.9, GAP_HARD: 1.05, RAMP_S: 70, STEER_SAFETY: 0.7, MAX_SHIFT: 2.2,
  SCORE_DIV: 4, COIN_POINTS: 5, AIR_POINTS: 8,   // points per second in the air
  LOOK_S: 1.6,
};
/** What can lie on the path: half width (lanes), height (height units a board must be above to pass), depth along the path. */
export const KINDS = {
  cone: { hw: 0.22, h: 0.9, d: 1 },
  puddle: { hw: 0.45, h: 0.3, d: 2 },
  barrier: { hw: SKATE.EDGE + 0.35, h: 1.25, d: 1.2 },
  bench: { hw: 0.8, h: 2.7, d: 2 },
  planter: { hw: 0.55, h: 3.2, d: 2 },
  ramp: { hw: 0.7, h: 0, d: 4 },
};
export const isHazard = (o) => o.kind !== 'ramp' && o.kind !== 'coin';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
export const speedAt = (t) => Math.min(SKATE.VMAX, SKATE.V0 + SKATE.ACC * t);
export const difficultyAt = (t) => clamp(t / SKATE.RAMP_S, 0, 1);
export const gapSeconds = (t) => lerp(SKATE.GAP_EASY, SKATE.GAP_HARD, difficultyAt(t));
/** How far sideways a board can get from rest in `t` seconds of steering with a stop at the end (accelerate half, brake half), less a safety margin. */
export const reachX = (t) => Math.min(SKATE.MAX_SHIFT, SKATE.STEER_SAFETY * (SKATE.STEER_ACC * Math.max(0, t) ** 2) / 4);
/** Jump physics, for tests and the generator: the apex height and the time in the air of a launch at `v`. */
export const apexOf = (v) => (v * v) / (2 * SKATE.G);
export const airtimeOf = (v) => (2 * v) / SKATE.G;
export const heightAt = (v, t) => v * t - 0.5 * SKATE.G * t * t;
export const scoreOf = (s) => Math.floor(s.dist / SKATE.SCORE_DIV) + s.coins * SKATE.COIN_POINTS + Math.floor(s.air * SKATE.AIR_POINTS);

let ids = 0;
export function createSkateGame(seed = 1) {
  const s = {
    seed: seed >>> 0, rng: seed >>> 0,
    t: 0, dist: 0, v: SKATE.V0, coins: 0, lives: SKATE.LIVES, over: false, hits: 0, air: 0,
    x: 0, vx: 0, hold: 0,                       // hold: the steering input, -1 left, 0 none, 1 right
    h: 0, vy: 0, grounded: true, sinceGround: 0, jumpBuf: 0, squash: 0, ramps: 0,
    invuln: 0, flash: 0,
    objs: [], nextFront: SKATE.FIRST_Z, prevEnd: 0, prevC: 0, rows: 0, lastBarrier: false,
    events: [],
  };
  fill(s);
  return s;
}

const put = (s, kind, x, z, extra = {}) => { const k = KINDS[kind]; s.objs.push({ id: ++ids, kind, x, z, hw: k.hw, h: k.h, d: k.d, ...extra }); return s.objs[s.objs.length - 1]; };
const coin = (s, x, z, h) => s.objs.push({ id: ++ids, kind: 'coin', x, z, h, taken: false });

function genRow(s) {
  const front = s.nextFront;
  const arrival = s.t + Math.max(0, front) / Math.max(1, s.v);
  const d = difficultyAt(arrival), vArr = speedAt(arrival), gapT = gapSeconds(arrival);
  const shift = reachX(gapT - 0.3);
  const r = next(s);
  const kind = s.rows < 2 ? 'corridor' : r < 0.5 ? 'corridor' : r < 0.68 ? 'barrier' : r < 0.8 ? 'ramp' : 'cones';
  const c = clamp(s.prevC + (next(s) * 2 - 1) * shift, -1, 1);          // the corridor the board can always follow
  let end = front, extra = 0, cMid = s.prevC;
  const gapLen = front - s.prevEnd;
  if (kind === 'barrier') {
    put(s, 'barrier', 0, front);
    end = front + KINDS.barrier.d;
    for (let i = 0; i < 5; i++) coin(s, clamp(s.prevC, -1, 1), front - 7 + i * 4.5, 1.9 - Math.abs(i - 2) * 0.12);   // an arc only a jump collects
    s.lastBarrier = true;
  } else if (kind === 'ramp') {
    const rx = clamp(c, -1, 1);
    put(s, 'ramp', rx, front);
    end = front + KINDS.ramp.d;
    const air = airtimeOf(SKATE.RAMP_V);
    for (let i = 1; i <= 5; i++) { const tt = (air * i) / 6; coin(s, rx, front + tt * vArr, heightAt(SKATE.RAMP_V, tt) * 0.9); }
    extra = air * vArr;
    cMid = rx; s.lastBarrier = false;
  } else {
    const lo = c - SKATE.CORRIDOR, hi = c + SKATE.CORRIDOR;
    const wl = lo + SKATE.EDGE, wr = SKATE.EDGE - hi;
    const tall = (w, side) => {
      if (w < 0.55) return;
      const hw = Math.min(0.8, w / 2 - 0.02), cx = side < 0 ? -SKATE.EDGE + w / 2 : SKATE.EDGE - w / 2;
      put(s, hw > 0.65 && next(s) < 0.5 ? 'bench' : 'planter', cx, front, { hw: Math.min(hw, w / 2), edge: side });
    };
    if (kind === 'corridor') {
      tall(wl, -1); tall(wr, 1);
      if (next(s) < 0.25 + 0.3 * d) put(s, next(s) < 0.5 ? 'cone' : 'puddle', c, front + 0.5);   // low, in the way: steer round or jump
      end = front + 2.2;
    } else {
      const spots = [c - 0.9, c + 0.9, c - 1.15, c + 1.15].filter((x) => Math.abs(x) <= SKATE.EDGE);
      spots.slice(0, 3).forEach((x, i) => put(s, 'cone', x, front + i * 4));
      end = front + 9;
    }
    cMid = c; s.lastBarrier = false;
  }
  // coins in the gap before the row: a trail that bends from where the board was to where the corridor is
  const n = Math.min(6, Math.floor((gapLen - 8) / 7));
  for (let i = 0; i < n; i++) coin(s, lerp(s.prevC, cMid, (i + 1) / (n + 1)), s.prevEnd + 5 + i * 7, 0.4);
  s.prevEnd = end; s.prevC = cMid; s.rows++;
  s.nextFront = end + extra + gapT * vArr;
}
function fill(s) { while (s.nextFront <= SKATE.SPAWN_Z + SKATE.BUFFER) genRow(s); }

/** Steering input: -1 left, 0 none, 1 right (held). */
export function steer(s, dir) { s.hold = dir; }

/** Jump now (or a little before landing: it is remembered for BUFFER_MS). True when the board left the ground. */
export function jump(s) {
  if (s.over) return false;
  if (s.grounded || s.sinceGround * 1000 <= SKATE.COYOTE_MS && s.vy <= 0 && s.h < 0.3) {
    s.vy = SKATE.JUMP_V; s.h = Math.max(s.h, 0.001); s.grounded = false; s.sinceGround = 9; s.events.push('jump');
    return true;
  }
  s.jumpBuf = SKATE.BUFFER_MS;
  return false;
}

export function step(s, ms) {
  s.events.length = 0;
  if (s.over) return s.events;
  const dt = ms / 1000;
  s.t += dt; s.v = speedAt(s.t);
  const dz = s.v * dt;
  s.dist += dz;
  // sideways: acceleration, braking when reversing, friction when not steering, the edges
  const air = !s.grounded;
  let ax = s.hold * SKATE.STEER_ACC * (air ? SKATE.AIR_STEER : 1);
  if (s.hold && s.vx * s.hold < 0) ax *= SKATE.BRAKE_MULT;
  s.vx += ax * dt;
  if (!s.hold) s.vx *= Math.exp(-(air ? SKATE.AIR_FRICTION : SKATE.FRICTION) * dt);
  s.vx = clamp(s.vx, -SKATE.VMAX_X, SKATE.VMAX_X);
  s.x += s.vx * dt;
  if (Math.abs(s.x) > SKATE.EDGE) { s.x = Math.sign(s.x) * SKATE.EDGE; s.vx = -s.vx * SKATE.EDGE_BOUNCE; }
  // vertical
  s.squash = Math.max(0, s.squash - ms);
  s.jumpBuf = Math.max(0, s.jumpBuf - ms);
  if (!s.grounded) {
    s.vy -= SKATE.G * dt; s.h += s.vy * dt; s.sinceGround += dt;
    if (s.h > 0.05) s.air += dt;
    if (s.h <= 0) {
      s.h = 0; s.vy = 0; s.grounded = true; s.sinceGround = 0; s.squash = SKATE.SQUASH_MS; s.events.push('land');
      if (s.jumpBuf > 0) { s.jumpBuf = 0; jump(s); }
    }
  }
  s.invuln = Math.max(0, s.invuln - ms); s.flash = Math.max(0, s.flash - ms);
  s.nextFront -= dz;
  for (const o of s.objs) o.z -= dz;
  s.objs = s.objs.filter((o) => (o.kind === 'coin' ? o.z > -8 && !o.taken : o.z + o.d > -10));
  fill(s);
  let crashed = false;
  for (const o of s.objs) {
    if (o.kind === 'coin') {
      if (o.z <= 2.5 && o.z >= -2.5 && Math.abs(s.x - o.x) < 0.5 && Math.abs(s.h - o.h) < 1.1) { o.taken = true; s.coins++; s.events.push('coin'); }
    } else if (o.kind === 'ramp') {
      if (!o.used && s.grounded && o.z <= SKATE.DEPTH && o.z + o.d >= 0 && Math.abs(s.x - o.x) < o.hw + 0.15) { o.used = true; s.vy = SKATE.RAMP_V; s.h = 0.001; s.grounded = false; s.sinceGround = 9; s.ramps++; s.events.push('ramp'); }
    } else if (!crashed && !o.hit && s.invuln <= 0 && o.z <= SKATE.DEPTH && o.z + o.d >= 0 && Math.abs(s.x - o.x) < o.hw + SKATE.PW && s.h < o.h) {
      o.hit = true; crashed = true;
      s.lives--; s.hits++; s.invuln = SKATE.INVULN_MS; s.flash = SKATE.FLASH_MS;
      s.events.push('hit');
      if (s.lives <= 0) { s.over = true; s.events.push('over'); }
    }
  }
  return s.events;
}

/** The demo bot: { dir, jump } for the next step. It looks LOOK_S ahead, steers (with a damped controller) to the nearest x clear of the tall and the low things,
 * or, when only low things block the way, jumps them just before they arrive. */
export function botInput(s) {
  const look = s.v * SKATE.LOOK_S;
  const ahead = s.objs.filter((o) => isHazard(o) && !o.hit && o.z + o.d >= -1 && o.z <= look);
  const clear = (x, only, m = 0.12) => ahead.every((o) => (only && !only(o)) || Math.abs(x - o.x) >= o.hw + SKATE.PW + m);
  const tallOnly = (o) => o.h >= 2;
  let target = s.x;
  const lowOk = (o) => o.h < 2;
  const full = ahead.some((o) => o.kind === 'barrier');
  const cands = [];
  for (let x = -SKATE.EDGE; x <= SKATE.EDGE + 1e-9; x += 0.1) cands.push(+x.toFixed(2));
  const pickFrom = (pred) => cands.filter(pred).sort((a, b) => Math.abs(a - s.x) - Math.abs(b - s.x))[0];
  // all hazards avoided if possible, else at least the tall ones (the low ones are jumped)
  const free = pickFrom((x) => clear(x, full ? tallOnly : null, 0.3)) ?? pickFrom((x) => clear(x, full ? tallOnly : null));
  target = free !== undefined ? free : (pickFrom((x) => clear(x, tallOnly)) ?? s.x);
  if (!clear(s.x, full ? tallOnly : null) || Math.abs(target - s.x) > 0.05) {
    const want = clamp((target - s.x) * 3.2, -SKATE.VMAX_X, SKATE.VMAX_X), diff = want - s.vx;
    var dir = Math.abs(diff) < 0.25 ? 0 : Math.sign(diff);
  } else dir = 0;
  // jump a low thing that is about to be under the board
  let doJump = false;
  for (const o of ahead) {
    if (!lowOk(o) || s.h > 0.3 || !s.grounded) continue;
    const ttf = o.z / s.v;
    if (Math.abs(s.x + s.vx * Math.max(0, ttf) - o.x) < o.hw + SKATE.PW + 0.1 && ttf <= 0.2 && ttf > -0.02) doJump = true;
  }
  return { dir, jump: doJump };
}
