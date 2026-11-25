// The crowd: pets that fill the beach and the farm with things to do (owner 2026-11-25). On the beach some lie on loungers and towels, some swim, some paddle out and ride the shared
// waves, one strolls with an ice cream and two play volleyball; on the farm some hoe, water, carry crates and hay, feed the animals and harvest. Like the villagers (src/npc-world.js) they
// are a pure function of the clock, here of the UTC time alone (nothing of the room, nothing over the network), so every client sees the same pet in the same spot. They are not the
// villagers: they do not talk, sleep or answer, and they are drawn like any other pet (peers' art, poses and water rules) so the renderers need nothing new but the props they hold.
//  - A cast is a few members per area (BOUNDS keeps it small for phones); each has a looped plan of stays and walks (a cycle, offset per member so they are not in step).
//  - The surfers do not loop: they follow the wave of the clock (src/surf.js, the very rules the player rides by, `rideDecide`), so a surfer catches the same wave the player sees.
//  - A sunbather holds its lounger or towel while it lies (`holds`): the player's "Recostarse" says the spot is taken, and the free ones stay free.
import { Walker } from './walker.js';
import { findPath } from './path.js';
import { hashSeed, mulberry32 } from './life.js';
import { isLand, isWalkable, waterAt, doorAt } from './map.js';
import { WAVE, SIZES, waveSize, rideDecide } from './surf.js';
import { isRestSpot } from './lounge.js';
import { farmTile, townHour } from './npc-world.js';
import { SEATS, MAX_NPC_SEATS, seatFacing, sitCode } from './bonfire.js';
import { createVariants } from './npcs.js';
import { PROP_MS } from './art/crowd-props.js';

export const BOUNDS = { beach: 10, farm: 8 };       // the most a phone is asked to draw of the crowd in one area
/** Is it evening in the town (21:00 to 02:00 Chile time)? Two of the crowd then sit at the bonfire. */
export const eveningAt = (utc) => { const h = townHour(utc); return h >= 21 || h < 2; };
export const WIPE_MS = 1500;                        // a surfer's wipeout lasts as long as the player's (src/surf.js)
const SWIM_MS = 440, PADDLE_MS = 330, STROLL_MS = 420, WORK_MS = 430;      // a step of each kind of mover
const RALLY_MS = 3600;                              // a volleyball rally: the ball goes over the net and back
const HELADO = 0;                                   // the treat the stroller holds (src/kiosk.js TREATS index)
const EAT_MS = 2600;                                // the last stretch of a stay in which it eats it

const seeded = (id) => mulberry32(hashSeed(`crowd:${id}`));
const dirOf = (a, b) => (b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] < a[1] ? 'up' : b[1] > a[1] ? 'down' : null);
const mix32 = (a, b = 0) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

// ---- where things are ---------------------------------------------------------------------------------------------------------------------

const beachLand = (x, y) => isLand(x, y, 'beach') && !doorAt(x, y, 'beach');
const farmLand = (x, y) => farmTile(x, y);
const LAND = { beach: beachLand, farm: farmLand };
const route = (area, a, b) => findPath(a[0], a[1], b[0], b[1], LAND[area], area);
/** A straight route over open water (tiles after the start): along the row first, then along the column. Swimmers and surfers only use boxes of sea, so every tile on it is water. */
export function lineSteps(a, b) {
  const out = [];
  let [x, y] = a;
  while (x !== b[0]) { x += Math.sign(b[0] - x); out.push([x, y]); }
  while (y !== b[1]) { y += Math.sign(b[1] - y); out.push([x, y]); }
  return out;
}
/** The nearest open sand beside a spot that is not itself somewhere to lie: where a sunbather stretches its legs. */
export function awayTile(x, y, ok = beachLand) {
  for (let r = 2; r <= 5; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) if (ok(x + dx, y + dy) && !isRestSpot(x + dx, y + dy, 'beach')) return [x + dx, y + dy];
  return [x, y];
}

// ---- a looped plan ------------------------------------------------------------------------------------------------------------------------

/** Builds a plan: stays and walks one after the other from a start tile; `done()` gives { segs, period }. A plan must end on its start tile so the loop closes without a jump. */
function plan(x, y, d = 'down') {
  const segs = [];
  let t = 0, pos = { x, y, d };
  return {
    get at() { return [pos.x, pos.y]; },
    stay(ms, extra = {}) {
      const { d: face, ...rest } = extra;
      if (face) pos.d = face;
      segs.push({ kind: 'stay', t0: t, t1: t + ms, x: pos.x, y: pos.y, d: pos.d, ...rest });
      t += ms;
    },
    walk(path, stepMs, extra = {}) {
      if (!path.length) return;
      const from = [pos.x, pos.y], last = path[path.length - 1], before = path.length > 1 ? path[path.length - 2] : from;
      segs.push({ kind: 'walk', t0: t, t1: t + path.length * stepMs, path, from, stepMs, ...extra });
      pos = { x: last[0], y: last[1], d: dirOf(before, last) || pos.d };
      t += path.length * stepMs;
    },
    done: () => ({ segs, period: t }),
  };
}

/** The pose of a plan at `u` ms into its period: { x0, y0, x, y, k, moving, d, seg }. */
export function planPose({ segs, period }, u) {
  const t = ((u % period) + period) % period;
  let seg = segs[segs.length - 1];
  for (const s of segs) if (t < s.t1) { seg = s; break; }
  const ph = t - seg.t0;
  if (seg.kind === 'walk') {
    const n = Math.min(seg.path.length - 1, Math.floor(ph / seg.stepMs)), from = n === 0 ? seg.from : seg.path[n - 1], to = seg.path[n];
    return { x0: from[0], y0: from[1], x: to[0], y: to[1], k: (ph - n * seg.stepMs) / seg.stepMs, moving: true, d: dirOf(from, to) || 'down', seg, ph };
  }
  return { x0: seg.x, y0: seg.y, x: seg.x, y: seg.y, k: 0, moving: false, d: seg.d, seg, ph };
}

// ---- the plans of each role ---------------------------------------------------------------------------------------------------------------

function sunPlan(m) {
  const r = seeded(m.id), [sx, sy] = m.spot, [ax, ay] = awayTile(sx, sy), p = plan(sx, sy, 'down'), holds = [sx, sy];
  p.stay(70000 + Math.floor(r() * 30000), { rest: 1, holds, act: 'lie' });                  // lying on the lounger or the towel for a minute or more
  p.stay(4000, { holds, act: 'stand' });                                                       // gets up, stretches
  p.walk(route('beach', [sx, sy], [ax, ay]), STROLL_MS, { act: 'walk' });
  p.stay(8000 + Math.floor(r() * 5000), { d: 'left', act: 'look' });                          // looks at the sea a while
  p.walk(route('beach', [ax, ay], [sx, sy]), STROLL_MS, { act: 'walk', holds });          // and goes back: the spot stays taken
  return p.done();
}

function swimPlan(m) {
  const r = seeded(m.id), [x0, x1] = m.zone.x, [y0, y1] = m.zone.y, pick = () => [x0 + Math.floor(r() * (x1 - x0 + 1)), y0 + Math.floor(r() * (y1 - y0 + 1))];
  const start = pick(), p = plan(start[0], start[1], 'right');
  let cur = start;
  for (let i = 0; i < 6; i++) { const to = pick(); p.walk(lineSteps(cur, to), SWIM_MS, { act: 'swim' }); cur = to; p.stay(1500 + Math.floor(r() * 3500), { act: 'float' }); }
  p.walk(lineSteps(cur, start), SWIM_MS, { act: 'swim' });
  p.stay(2000, { act: 'float' });
  return p.done();
}

function strollPlan(m) {
  const r = seeded(m.id), p = plan(m.points[0][0], m.points[0][1], 'down');
  let cur = m.points[0];
  const treat = { idx: HELADO };
  p.stay(9000, { act: 'look', treat });
  for (const to of [...m.points.slice(1), m.points[0]]) {
    p.walk(route('beach', cur, to), STROLL_MS, { act: 'walk', treat });
    p.stay(9000 + Math.floor(r() * 3000), { d: 'down', act: 'look', treat });
    cur = to;
  }
  return p.done();
}

function volleyPlan(m) {
  const p = plan(m.spot[0], m.spot[1], m.d);
  p.stay(RALLY_MS, { act: 'volley', ball: m.side, jump: { ms: RALLY_MS, at: m.side === 'a' ? 0 : RALLY_MS / 2 } });
  return p.done();
}

/** Work at a series of spots: [x, y, facing]; each is a stay of `ms` with `extra` (the tool, the jump), walking between them and back to the first. */
function workPlan(m, { stepMs = WORK_MS } = {}) {
  const r = seeded(m.id), [first, ...more] = m.spots, p = plan(first[0], first[1], first[2]);
  let cur = first;
  const here = (s) => p.stay(m.ms + Math.floor(r() * 3000), { d: s[2], act: m.act, prop: m.prop, jump: m.jump });
  here(first);
  for (const s of [...more, first]) { p.walk(route('farm', [cur[0], cur[1]], [s[0], s[1]]), stepMs, { act: 'walk' }); cur = s; if (s !== first) here(s); }
  return p.done();
}

/** A trip to carry something from `a` to `b` and come back empty-handed. */
function carryPlan(m) {
  const p = plan(m.a[0], m.a[1], m.a[2]);
  p.stay(3000, { act: 'load' });
  p.stay(1500, { act: 'load', prop: m.prop });                                                // picks it up
  p.walk(route('farm', m.a, m.b), WORK_MS, { act: 'carry', prop: m.prop });
  p.stay(2500, { d: m.b[2], act: 'set down', prop: m.prop });
  p.stay(2500, { d: m.b[2], act: 'rest' });                                                    // puts it down
  p.walk(route('farm', m.b, m.a), WORK_MS, { act: 'walk' });
  return p.done();
}

// ---- the cast -----------------------------------------------------------------------------------------------------------------------------

const V = (id, hue, sat) => ({ id: `crowd-${id}`, hue, ...(sat ? { sat } : {}) });
const look = (species, stage, items = ['', '', '', '']) => ({ species, stage, items });

/** Who is on the beach and what each does. `role`: sun (lies on a lounger or a towel: a species with the pose art), swim, surf (a species with the pose art), stroll, volley. */
export const BEACH_CAST = [
  { id: 'mica', name: 'Mica', role: 'sun', look: look('cat', 2, ['bow', 'sunglasses', '', '']), spot: [46, 10] },
  { id: 'rulo', name: 'Rulo', role: 'sun', look: look('seal', 2, ['beanie', '', '', '']), spot: [46, 29] },
  { id: 'tula', name: 'Tula', role: 'sun', look: look('frog', 1, ['', 'sunglasses', '', '']), spot: [54, 29] },
  { id: 'nano', name: 'Nano', role: 'swim', look: look('bear', 2, ['', '', '', '']), variant: V('nano', 30, 1.2), zone: { x: [16, 30], y: [13, 24] } },
  { id: 'coco', name: 'Coco', role: 'swim', look: look('raccoon', 1, ['', 'sunglasses', '', '']), night: 2, variant: V('coco', 200), zone: { x: [16, 30], y: [35, 41] } },
  { id: 'pipa', name: 'Pipa', role: 'surf', look: look('frog', 2, ['beanie', '', '', '']), spot: [9, 12], phase: 0 },
  { id: 'duna', name: 'Duna', role: 'surf', look: look('cat', 3, ['', '', '', '']), spot: [10, 26], phase: 1 },
  { id: 'paco', name: 'Paco', role: 'stroll', look: look('elephant', 2, ['', 'sunglasses', '', '']), night: 0, variant: V('paco', -50), points: [[50, 22], [52, 26], [55, 32], [50, 34]] },
  { id: 'lalo', name: 'Lalo', role: 'volley', look: look('bear', 1, ['', '', '', '']), variant: V('lalo', 120), spot: [55, 10], d: 'down', side: 'a' },
  { id: 'zoe', name: 'Zoe', role: 'volley', look: look('raccoon', 2, ['', '', '', 'cape']), variant: V('zoe', -20), spot: [55, 12], d: 'up', side: 'b' },
];

/** Who works on the farm. Every spot is [x, y, facing] on open ground next to what the pet works on. */
export const FARM_CAST = [
  { id: 'tomas', name: 'Tomás', role: 'work', look: look('bear', 3, ['tophat', '', '', '']), variant: V('tomas', -14, 1.1), act: 'hoe', prop: 'hoe', ms: 14000, spots: [[6, 24, 'up'], [9, 24, 'up'], [8, 24, 'down']] },
  { id: 'rosa', name: 'Rosa', role: 'work', look: look('elephant', 2, ['bow', '', '', '']), act: 'hoe', prop: 'hoe', ms: 13000, spots: [[24, 23, 'right'], [24, 26, 'right']] },
  { id: 'luz', name: 'Luz', role: 'work', look: look('cat', 2, ['bow', '', '', '']), variant: V('luz', -40), act: 'water', prop: 'can', ms: 15000, spots: [[15, 24, 'down'], [17, 24, 'down'], [14, 24, 'up']] },
  { id: 'beto', name: 'Beto', role: 'carry', look: look('raccoon', 2, ['', '', '', '']), variant: V('beto', 28, 3), prop: 'crate', a: [29, 8, 'down'], b: [35, 16, 'right'] },
  { id: 'nena', name: 'Nena', role: 'carry', look: look('frog', 2, ['beanie', '', '', '']), variant: V('nena', 150, 2.2), prop: 'hay', a: [29, 7, 'down'], b: [37, 13, 'down'] },
  { id: 'chelo', name: 'Chelo', role: 'work', look: look('seal', 2, ['', 'sunglasses', '', '']), variant: V('chelo', -60), act: 'feed', prop: 'sack', ms: 16000, spots: [[32, 7, 'right'], [32, 9, 'right']] },
  { id: 'fina', name: 'Fina', role: 'work', look: look('cat', 1, ['', '', '', '']), act: 'pick', prop: 'basket', ms: 10000, jump: { ms: 3200, at: 1000 }, spots: [[5, 4, 'left'], [8, 4, 'left'], [6, 10, 'left']] },
  { id: 'gus', name: 'Gus', role: 'work', look: look('bear', 2, ['beanie', '', '', '']), variant: V('gus', 20, 1.2), act: 'harvest', prop: 'sickle', ms: 14000, spots: [[36, 23, 'up'], [33, 23, 'up']] },
];
export const CAST = { beach: BEACH_CAST, farm: FARM_CAST };
const SEAT_OF = { paco: 0, coco: 3 };                        // the crowd's two evening seats at the bonfire (the others are for players)

const PLANS = { sun: sunPlan, swim: swimPlan, stroll: strollPlan, volley: volleyPlan, work: workPlan, carry: carryPlan };
const plans = new Map();
const planOf = (m) => { let p = plans.get(m.id); if (!p) plans.set(m.id, p = PLANS[m.role](m)); return p; };

// ---- the surfers --------------------------------------------------------------------------------------------------------------------------

const attempts = new Map();
/**
 * What surfer `m` does on wave number `w` (the clock's own wave, src/surf.js waveAt): it sits at its spot in the break, the crest reaches its row at `tCatch` and it stands up. A ride follows the
 * same `rideDecide` the player's does (north and east along the wall, steps of the wave's own pace), or it wipes out in place; then it paddles back to its spot. Cached per (surfer, wave).
 * { tCatch, wipe, steps: [{ t, x0, y0, x1, y1 }], tRideEnd, back: { t0, path, from }, tBack } (times in UTC ms).
 */
export function surfAttempt(m, w) {
  const key = `${m.id}:${w}`;
  let a = attempts.get(key);
  if (a) return a;
  if (attempts.size > 400) attempts.clear();
  const [sx, sy] = m.spot, z = SIZES[waveSize(w)], t0 = w * WAVE.periodMs, tCatch = t0 + (((WAVE.k0 + sx - sy) * 1000) / z.speed);
  const wipe = mix32(hashSeed(m.id), w) < 0.2;
  const steps = [];
  let x = sx, y = sy, t = tCatch, tRideEnd = tCatch + WIPE_MS;
  if (!wipe) {
    for (let n = 0, taken = 0; n < 240; n++) {
      const k = WAVE.k0 - (z.speed * (t - t0)) / 1000;
      const dec = rideDecide({ k: k >= WAVE.kEnd ? k : null, x, y, steps: taken, walkable: (a2, b2) => isWalkable(a2, b2, 'beach'), water: (a2, b2) => waterAt(a2, b2, 'beach'), maxLag: z.maxLag });
      if (dec.type === 'end') break;
      if (dec.type === 'move') { steps.push({ t, x0: x, y0: y, x1: x + dec.dx, y1: y + dec.dy }); x += dec.dx; y += dec.dy; taken++; } else steps.push({ t, x0: x, y0: y, x1: x, y1: y });
      t += z.rideMs;
    }
    tRideEnd = t;
  }
  const path = lineSteps([x, y], [sx, sy]);
  a = { tCatch, wipe, steps, tRideEnd, back: { t0: tRideEnd, path, from: [x, y] }, tBack: tRideEnd + path.length * PADDLE_MS, size: waveSize(w), rideMs: z.rideMs };
  attempts.set(key, a);
  return a;
}

/** Does surfer `m` try wave `w`? Every other wave at most (so a ride and the paddle back are over before its next), and not all of those. */
const tries = (m, w) => (w + m.phase) % 2 === 0 && mix32(hashSeed(m.id) + 7, w) < 0.85;

/** The surfer's pose at UTC time `utc`: the same shape as planPose's, plus the `surf` flag (1 riding, 2 wiped out, 3 paddling) the renderers draw. */
export function surfPose(m, utc) {
  const w0 = Math.floor(utc / WAVE.periodMs), [sx, sy] = m.spot;
  for (let w = w0; w >= w0 - 2; w--) {
    if (!tries(m, w)) continue;
    const a = surfAttempt(m, w);
    if (utc < a.tCatch) continue;
    if (utc >= a.tBack) break;
    if (utc < a.tRideEnd) {
      if (a.wipe) return { x0: sx, y0: sy, x: sx, y: sy, k: 0, moving: false, d: 'right', surf: 2, act: 'wipeout', stepMs: a.rideMs };
      let i = 0;
      while (i + 1 < a.steps.length && a.steps[i + 1].t <= utc) i++;
      const s = a.steps[i] || { x0: sx, y0: sy, x1: sx, y1: sy };
      return { x0: s.x0, y0: s.y0, x: s.x1, y: s.y1, k: Math.min(1, (utc - (s.t || utc)) / a.rideMs), moving: s.x0 !== s.x1 || s.y0 !== s.y1, d: 'right', surf: 1, act: 'ride', stepMs: a.rideMs, size: a.size };
    }
    const n = Math.min(a.back.path.length - 1, Math.floor((utc - a.back.t0) / PADDLE_MS)), from = n === 0 ? a.back.from : a.back.path[n - 1], to = a.back.path[n];
    if (!to) break;
    return { x0: from[0], y0: from[1], x: to[0], y: to[1], k: ((utc - a.back.t0) - n * PADDLE_MS) / PADDLE_MS, moving: true, d: dirOf(from, to) || 'left', surf: 3, act: 'paddle', stepMs: PADDLE_MS };
  }
  return { x0: sx, y0: sy, x: sx, y: sy, k: 0, moving: false, d: 'right', surf: 3, act: 'wait', stepMs: PADDLE_MS };
}

// ---- one member at a time -----------------------------------------------------------------------------------------------------------------

/** What member `m` is doing at UTC time `utc`: { x0, y0, x, y, k, moving, d, stepMs, surf, rest, holds, prop: { kind, k, ... }, treat, jumpPhase }; all pure. */
export function poseOf(m, utc) {
  if (m.night !== undefined && eveningAt(utc)) {                 // in the evening: on a seat of the bonfire circle (at most MAX_NPC_SEATS of the crowd), toasting now and then
    const [x, y] = SEATS[SEAT_OF[m.id]], roasting = Math.floor(utc / 6000 + m.night) % 2 === 0;
    return { x0: x, y0: y, x, y, k: 0, moving: false, d: seatFacing(SEAT_OF[m.id]), stepMs: 400, surf: 0, rest: 0, holds: null, prop: roasting ? { kind: 'stick', tone: Math.floor(utc / 2500) % 2, t: utc, k: 0 } : null, treat: null, jumpPhase: null, sit: sitCode(SEAT_OF[m.id], roasting) };
  }
  if (m.role === 'surf') { const p = surfPose(m, utc); return { ...p, rest: 0, holds: null, prop: null, treat: null, jumpPhase: null }; }
  const pl = planOf(m), off = m.role === 'volley' ? 0 : Math.floor(seeded(`${m.id}:off`)() * pl.period), p = planPose(pl, utc + off), s = p.seg;
  let prop = null;
  if (s.prop) prop = { kind: s.prop, k: ((utc + off) % PROP_MS[s.prop]) / PROP_MS[s.prop] };
  else if (s.ball) {                                                                          // the volleyball: over A's hands for the first half of the rally and over B's for the second
    const f = (p.ph % (RALLY_MS / 2)) / (RALLY_MS / 2), mine = (m.side === 'a') === (p.ph < RALLY_MS / 2);
    if (mine) prop = { kind: 'ball', h: f, dy: f * (m.side === 'a' ? 32 : -32) };
  }
  let treat = null;
  if (s.treat) {
    const left = s.t1 - s.t0 - p.ph, eating = s.kind === 'stay' && left <= EAT_MS && s.t1 - s.t0 > EAT_MS + 2000;
    treat = { idx: s.treat.idx, eating, k: eating ? 1 - left / EAT_MS : 0 };
  }
  return { x0: p.x0, y0: p.y0, x: p.x, y: p.y, k: p.k, moving: p.moving, d: p.d, stepMs: s.stepMs || 400, surf: 0, rest: s.rest || 0, holds: s.holds || null, prop, treat, act: s.act, jumpPhase: s.jump ? (((utc + off) % s.jump.ms) - s.jump.at) : null };
}

// ---- the crowd as scene entities ---------------------------------------------------------------------------------------------------------

/** The beach's and the farm's crowd: `update(area, utcMs, now)` places the members of that area and returns entities as render.js and hd2d/pets.js draw them (the same objects every call). */
export function createCrowd({ sprites, variants = createVariants() }) {
  const made = new Map();                                                                     // area -> [{ m, e }], built the first time the area is visited (the variants' recolour is lazy too)
  let held = new Set(), seats = new Set();
  const build = (area) => {
    const list = CAST[area].map((m) => {
      const ok = m.look.items.every((it) => !it || (sprites.catalogue && sprites.catalogue[it]));
      const e = { id: `crowd:${m.id}`, name: m.name, look: ok ? m.look : { ...m.look, items: ['', '', '', ''] }, walker: new Walker(m.spot ? m.spot[0] : 0, m.spot ? m.spot[1] : 0), emote: null, jumpAt: null, say: null, crowd: true, area, asleep: false,
        sprites: m.variant ? variants.get(sprites, m.variant) : sprites, surf: 0, rest: 0, treatView: null, propView: null };
      return { m, e };
    });
    made.set(area, list);
    return list;
  };
  return {
    /** The spots held right now by the beach's members (lying, or on their way back to lie), as a Set of "x,y". */
    get held() { return held; },
    /** The bonfire seats (indices of SEATS) the crowd holds right now. */
    get seats() { return seats; },
    /** Is the lounger or towel at (x, y) taken by a member of the crowd right now? */
    taken: (x, y) => held.has(`${x},${y}`),
    update(area, utc, now) {
      if (!CAST[area]) return [];
      const list = made.get(area) || build(area), nowHeld = new Set(), nowSeats = new Set();
      for (const { m, e } of list) {
        const p = poseOf(m, utc), w = e.walker;
        w.fx = p.x0; w.fy = p.y0; w.tx = p.x; w.ty = p.y; w.moving = p.moving; w.stepOverride = p.stepMs; w.t = p.k * p.stepMs; w.d = p.d;
        e.surf = p.surf || 0; e.rest = p.rest; e.sit = p.sit || 0; e.treatView = p.treat; e.propView = p.prop;
        e.jumpAt = p.jumpPhase !== null && p.jumpPhase >= 0 && p.jumpPhase < 400 ? now - p.jumpPhase : null;
        if (p.holds) nowHeld.add(`${p.holds[0]},${p.holds[1]}`);
        if (p.sit) nowSeats.add((p.sit - 1) % SEATS.length);
      }
      if (area === 'beach') { held = nowHeld; seats = nowSeats; }
      return list.map(({ e }) => e);
    },
  };
}
