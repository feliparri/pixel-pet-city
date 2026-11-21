// "Patineta": the rules of the half-pipe run (a finite route that ends at the pet's house: reaching it wins), no drawing, no clock. The board rides in a U-shaped chute with three positions: the left wall (-1), the floor
// (0) and the right wall (+1), and its position `p` is a continuous swing: holding left or right pushes it up that wall along a smooth arc, letting go lets the
// pipe's gravity swing it back down to the floor with a little overshoot. It can also JUMP (a gravity arc with hang time and a landing squash; allowed on a wall
// too: the board pops straight up off the surface and lands on the same spot) and ramps launch a higher jump. Obstacles lie at a position: low ones (cracks,
// cones, planks, a low barricade across the whole pipe) are cleared by height, tall ones (rocks, benches, pipes sticking out of the wall) only by changing position;
// coins hang in all three positions and some in the air. Everything is a function of the seed and the fixed steps, so a run is repeatable.
import { next } from './train.js';

export const SKATE = {
  LIVES: 3, INVULN_MS: 1600, FLASH_MS: 380,
  V0: 30, VMAX: 78, ACC: 0.75,
  ROUTE_LEN: 5400,                                    // the house is this far from the start (about 90 s at the speeds below)
  HOME_CLEAR: 200,                                    // no row starts closer than this to the house: the last stretch is clear
  HOLD_MS: 1000,                                      // how long the arrival stays on screen before the win panel
  SPAWN_Z: 230, BUFFER: 70, FIRST_Z: 130,
  SPRING: 18, PUSH: 36, DAMP: 4.6, AIR_PIPE: 0.5,     // the swing: gravity pulls towards the floor, a held direction pushes up the wall, damping settles it
  HW: 0.46, DEPTH: 1.6,                               // how close (in positions) the board must be to an obstacle to touch it, and the board's length
  G: 28, JUMP_V: 11.2, RAMP_V: 16,
  COYOTE_MS: 90, BUFFER_MS: 130, SQUASH_MS: 150,
  GAP_EASY: 1.9, GAP_HARD: 0.95, RAMP_S: 75,
  HOP_S: 0.32, CROSS_S: 0.6, REACT_S: 0.3,            // what the generator assumes a floor <-> wall hop, a wall <-> wall crossing and a reaction take
  SCORE_DIV: 4, COIN_POINTS: 5, AIR_POINTS: 8,        // points per second in the air
  LOOK_S: 1.6, P_TALL_EASY: 0.35, P_TALL_HARD: 0.6, P_DOUBLE_EASY: 0.15, P_DOUBLE_HARD: 0.55,
  P_GATE_EASY: 0.12, P_GATE_HARD: 0.26, P_RAMP_EASY: 0.16, P_RAMP_HARD: 0.08, P_CONES_EASY: 0.17, P_CONES_HARD: 0.08,   // what a row is: the odds move from easy to hard along the route
  WALL_BIAS: 1.6,                                     // late in the route, rows that block the walls are this much more likely (weight 1 + bias * wall share)
};
/** The obstacles: the positions they can stand at, the height a board must be above to pass, the depth along the pipe. */
export const KINDS = {
  rock: { at: [0], h: 3.0, d: 2 },
  bench: { at: [0], h: 2.7, d: 2 },
  crack: { at: [0], h: 0.35, d: 2 },
  plank: { at: [-1, 1], h: 0.4, d: 2 },              // a broken plank in the wall
  cone: { at: [-1, 0, 1], h: 0.9, d: 1 },
  pipe: { at: [-1, 1], h: 3.0, d: 2 },               // a drain pipe sticking out of the wall
  gate: { at: [-1, 0, 1], h: 1.25, d: 1.2, all: true },   // a barricade across the whole pipe: only a jump gets over
  ramp: { at: [-1, 0, 1], h: 0, d: 4 },
};
const FLOOR_LOW = ['crack', 'cone'], FLOOR_TALL = ['rock', 'bench'], WALL_LOW = ['plank', 'cone'], WALL_TALL = ['pipe'];
export const isHazard = (o) => o.kind !== 'ramp' && o.kind !== 'coin';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
export const speedAt = (t) => Math.min(SKATE.VMAX, SKATE.V0 + SKATE.ACC * t);
export const difficultyAt = (t) => clamp(t / SKATE.RAMP_S, 0, 1);
export const gapSeconds = (t) => lerp(SKATE.GAP_EASY, SKATE.GAP_HARD, difficultyAt(t));
/** What the generator assumes it takes to get from position a to position b. */
export const swingTime = (a, b) => (a === b ? 0 : Math.abs(a - b) === 2 ? SKATE.CROSS_S : SKATE.HOP_S);
export const apexOf = (v) => (v * v) / (2 * SKATE.G);
export const airtimeOf = (v) => (2 * v) / SKATE.G;
export const heightAt = (v, t) => v * t - 0.5 * SKATE.G * t * t;
/** How far along the route a distance is, 0..1. */
export const progressAt = (dist) => clamp(dist / SKATE.ROUTE_LEN, 0, 1);
export const scoreOf = (s) => Math.floor(s.dist / SKATE.SCORE_DIV) + s.coins * SKATE.COIN_POINTS + Math.floor(s.air * SKATE.AIR_POINTS);

let ids = 0;
export function createSkateGame(seed = 1) {
  const s = {
    seed: seed >>> 0, rng: seed >>> 0,
    t: 0, dist: 0, v: SKATE.V0, coins: 0, lives: SKATE.LIVES, over: false, won: false, hits: 0, air: 0,
    goal: SKATE.ROUTE_LEN,                       // the house
    p: 0, vp: 0, hold: 0,                        // the swing: position (-1 left wall, 0 floor, 1 right wall), its speed, the held direction
    h: 0, vy: 0, grounded: true, sinceGround: 0, jumpBuf: 0, squash: 0, ramps: 0,
    invuln: 0, flash: 0,
    objs: [], nextFront: SKATE.FIRST_Z, prevEnd: 0, prevFree: [-1, 0, 1], rows: 0,
    events: [],
  };
  fill(s);
  return s;
}

const put = (s, kind, slot, z) => { const k = KINDS[kind]; const o = { id: ++ids, kind, slot, z, h: k.h, d: k.d, all: !!k.all, row: s.rows }; s.objs.push(o); return o; };
const coin = (s, slot, z, h) => s.objs.push({ id: ++ids, kind: 'coin', slot, z, h, d: 0, taken: false });
const pickOf = (s, list) => list[Math.floor(next(s) * list.length)];
/** One of `list` by weight (one roll). */
function pickWeighted(s, list, weight) {
  const ws = list.map(weight), total = ws.reduce((a, b) => a + b, 0);
  let r = next(s) * total;
  for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r < 0) return list[i]; }
  return list[list.length - 1];
}

function genRow(s) {
  const front = s.nextFront;
  const arrival = s.t + Math.max(0, front) / Math.max(1, s.v);
  const d = difficultyAt(arrival), vArr = speedAt(arrival), gapT = gapSeconds(arrival);
  const budget = gapT - SKATE.REACT_S;
  const r = next(s);
  const pG = lerp(SKATE.P_GATE_EASY, SKATE.P_GATE_HARD, d), pR = lerp(SKATE.P_RAMP_EASY, SKATE.P_RAMP_HARD, d), pC = lerp(SKATE.P_CONES_EASY, SKATE.P_CONES_HARD, d);
  const kind = s.rows < 2 || r < 1 - pG - pR - pC ? 'blocks' : r < 1 - pR - pC ? 'gate' : r < 1 - pC ? 'ramp' : 'cones';
  let end = front, extra = 0, nextFree = [-1, 0, 1];
  const gapLen = front - s.prevEnd;
  if (kind === 'gate') {
    put(s, 'gate', 0, front);
    end = front + KINDS.gate.d;
    const at = pickOf(s, s.prevFree);
    for (let i = 0; i < 5; i++) coin(s, at, front - 7 + i * 4.5, 1.9 - Math.abs(i - 2) * 0.12);    // an arc only a jump collects
  } else if (kind === 'ramp') {
    const slot = pickOf(s, [-1, 0, 1].filter((b) => s.prevFree.some((a) => swingTime(a, b) <= budget)));
    put(s, 'ramp', slot, front);
    end = front + KINDS.ramp.d;
    const air = airtimeOf(SKATE.RAMP_V);
    for (let i = 1; i <= 5; i++) { const tt = (air * i) / 6; coin(s, slot, front + tt * vArr, heightAt(SKATE.RAMP_V, tt) * 0.9); }
    extra = air * vArr;
  } else {
    // a row of blocked positions: one or two of the three, never all (an all-low row is the gate)
    const nBlocked = kind === 'cones' ? 1 : next(s) < lerp(SKATE.P_DOUBLE_EASY, SKATE.P_DOUBLE_HARD, d) ? 2 : 1;
    const subsets = nBlocked === 1 ? [[-1], [0], [1]] : [[-1, 0], [-1, 1], [0, 1]];
    const ok = subsets.filter((b) => { const f = [-1, 0, 1].filter((x) => !b.includes(x)); return s.prevFree.some((a) => f.some((x) => swingTime(a, x) <= budget)); });
    const wallShare = (b) => b.filter((x) => x !== 0).length / b.length;
    const blocked = pickWeighted(s, ok.length ? ok : subsets, (b) => 1 + SKATE.WALL_BIAS * d * wallShare(b));
    nextFree = [-1, 0, 1].filter((x) => !blocked.includes(x));
    const pTall = lerp(SKATE.P_TALL_EASY, SKATE.P_TALL_HARD, d);
    blocked.forEach((slot, i) => {
      const tall = kind !== 'cones' && next(s) < pTall;
      const list = slot === 0 ? (tall ? FLOOR_TALL : FLOOR_LOW) : (tall ? WALL_TALL : WALL_LOW);
      put(s, kind === 'cones' ? 'cone' : pickOf(s, list), slot, front + (kind === 'cones' ? i * 3 : 0));
    });
    end = front + (kind === 'cones' ? 5 : 2.4);
  }
  // coins in the gap before the row: the first half in the position the board was likely in, the second half in the position it should move to
  const n = Math.min(6, Math.floor((gapLen - 8) / 7));
  const to = pickOf(s, nextFree), from = pickOf(s, s.prevFree);
  for (let i = 0; i < n; i++) coin(s, i < n / 2 ? from : to, s.prevEnd + 5 + i * 7, 0.4);
  s.prevEnd = end; s.prevFree = nextFree; s.rows++;
  s.nextFront = end + extra + gapT * vArr;
}
function fill(s) { while (s.nextFront <= SKATE.SPAWN_Z + SKATE.BUFFER && s.dist + s.nextFront <= s.goal - SKATE.HOME_CLEAR) genRow(s); }

/** Steering input: -1 up the left wall, 0 let go, 1 up the right wall (held). */
export function steer(s, dir) { s.hold = dir; }

/** Jump now (or a little before landing: it is remembered for BUFFER_MS). On the floor or on a wall. True when the board left the surface. */
export function jump(s) {
  if (s.over) return false;
  if (s.grounded || (s.sinceGround * 1000 <= SKATE.COYOTE_MS && s.vy <= 0 && s.h < 0.3)) {
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
  // the swing: a held direction pushes up the wall, gravity pulls back to the floor, damping settles it (a little overshoot); in the air the pipe has less grip
  const k = s.grounded ? 1 : SKATE.AIR_PIPE;
  const acc = (s.hold * SKATE.PUSH - SKATE.SPRING * s.p) * k - SKATE.DAMP * s.vp;
  s.vp += acc * dt; s.p += s.vp * dt;
  if (s.p > 1) { s.p = 1; if (s.vp > 0) s.vp = 0; } else if (s.p < -1) { s.p = -1; if (s.vp < 0) s.vp = 0; }
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
      if (o.z <= 2.5 && o.z >= -2.5 && Math.abs(s.p - o.slot) < 0.55 && Math.abs(s.h - o.h) < 1.1) { o.taken = true; s.coins++; s.events.push('coin'); }
    } else if (o.kind === 'ramp') {
      if (!o.used && s.grounded && o.z <= SKATE.DEPTH && o.z + o.d >= 0 && Math.abs(s.p - o.slot) < SKATE.HW + 0.1) { o.used = true; s.vy = SKATE.RAMP_V; s.h = 0.001; s.grounded = false; s.sinceGround = 9; s.ramps++; s.events.push('ramp'); }
    } else if (!crashed && !o.hit && s.invuln <= 0 && o.z <= SKATE.DEPTH && o.z + o.d >= 0 && (o.all || Math.abs(s.p - o.slot) < SKATE.HW) && s.h < o.h) {
      o.hit = true; crashed = true;
      s.lives--; s.hits++; s.invuln = SKATE.INVULN_MS; s.flash = SKATE.FLASH_MS;
      s.events.push('hit');
      if (s.lives <= 0) { s.over = true; s.events.push('over'); }
    }
  }
  if (!s.over && s.dist >= s.goal) { s.dist = s.goal; s.over = true; s.won = true; s.events.push('win'); }
  return s.events;
}

/** The demo bot: { dir, jump } for the next step. It keeps to a position that is free in the row passing now and in the next one, holds up a wall to get there and
 * lets go for the floor, and jumps a low thing it cannot ride round (a gate, or lows in the way). */
export function botInput(s) {
  const hz = s.objs.filter((o) => isHazard(o) && !o.hit && o.z + o.d >= -0.3 && o.z <= s.v * SKATE.LOOK_S).sort((a, b) => a.z - b.z);
  const passing = (o) => o.z <= SKATE.DEPTH + s.v * 0.12;
  const cur = hz.filter(passing), nxt = hz.filter((o) => !passing(o));
  const nextRow = nxt.length ? nxt.filter((o) => o.z - nxt[0].z < 1.5) : [];
  const blocks = (row, slot) => row.some((o) => !o.all && o.slot === slot);
  const near = [-1, 0, 1].sort((a, b) => Math.abs(a - s.p) - Math.abs(b - s.p));
  const here = Math.round(s.p);
  // while a row is passing, only move to a position that is free in it and not through a blocked one (crossing wall to wall goes over the floor)
  const reachable = (slot) => !blocks(cur, slot) && (Math.abs(slot - here) < 2 || !blocks(cur, 0));
  let target;
  if (cur.length) target = near.find((slot) => reachable(slot) && !blocks(nextRow, slot)) ?? near.find(reachable) ?? near[0];
  else target = near.find((slot) => !blocks(nextRow, slot)) ?? near[0];
  let doJump = false;
  if (s.grounded && s.h < 0.3) {
    for (const o of hz) {
      if (o.h >= 2 || !(o.all || Math.abs(s.p - o.slot) < SKATE.HW + 0.12)) continue;
      const ttf = o.z / s.v;
      if (ttf <= 0.2 && ttf > -0.02) doJump = true;
    }
  }
  return { dir: target, jump: doJump };
}
