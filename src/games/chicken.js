// Pillar la gallina: the chicken's behaviour and the catch test, as pure functions. Only the referee runs them; everyone else just draws
// the chicken from the `gchick` messages. A chicken is `{ x, y, d, mode: 'wander'|'flee', nextAt }`.
import { GAME_RULES } from './rules.js';
import { touching } from './hide.js';

export const CHICKEN = {
  wanderMs: 480,            // a calm step (2 tiles a second)
  fleeMs: 200,              // a flight step: 5 tiles a second, always the same, while a pet is near (a pet walks at 160 ms, 6 a second)
  fleeRadius: 6,            // it starts to run when a pet comes this close ...
  calmRadius: 8,            // ... and goes back to wandering only when every pet is farther than this (hysteresis)
  commit: 12,              // score bonus for keeping its heading: it turns only when another way is clearly better, or the way is blocked
  planSteps: 8,             // how many tiles of its route the referee sends ahead of time
};
const LOOKAHEAD = 8;
export const catchesToWin = GAME_RULES.chicken.goal;
const DIRS = [[0, -1, 'up'], [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left']];

export const createChicken = (x, y, now = 0) => ({ x, y, d: 'left', mode: 'wander', nextAt: now + 600 });

/** The player touching the chicken (nearest first, lowest id on a tie), or null. `pets`: [{ id, x, y }]. */
export function catcher(ch, pets) {
  let best = null, bd = Infinity;
  for (const p of pets) {
    if (!touching(ch, p)) continue;
    const d = Math.hypot(ch.x - p.x, ch.y - p.y);
    if (d < bd || (d === bd && p.id < best.id)) { best = p; bd = d; }
  }
  return best ? best.id : null;
}

/** A tile for a fresh chicken: random among the walkable ones, at least 5 tiles from every pet when there is such a tile. */
export function spawnTile(tiles, pets, rng) {
  const far = tiles.filter(([x, y]) => pets.every((p) => Math.hypot(p.x - x, p.y - y) >= 5));
  const pool = far.length ? far : tiles;
  return pool[Math.floor(rng() * pool.length)];
}

const nearest = (pets, x, y) => pets.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);

/**
 * The next tile of a flight from `pets`: the open neighbour with the best score (distance from the nearest pet, how far from the pets it can
 * still get from there so it goes round a wall instead of into a corner, and a bonus for keeping its heading). Never turns back on itself
 * unless it has to. Deterministic, so the referee can send the route ahead of time. Returns { x, y, d } or null when boxed in.
 */
export function fleeStep(ch, pets, walkable) {
  const open = DIRS.filter(([dx, dy]) => walkable(ch.x + dx, ch.y + dy));
  if (!open.length) return null;
  const here = nearest(pets, ch.x, ch.y);
  const away = open.filter(([dx, dy]) => nearest(pets, ch.x + dx, ch.y + dy) >= here);       // never a step toward the pet while there is another way
  const options = away.length ? away : open;
  const reach = (sx, sy) => {
    const seen = new Set([`${ch.x},${ch.y}`, `${sx},${sy}`]);
    let frontier = [[sx, sy]], far = nearest(pets, sx, sy);
    for (let depth = 0; depth < LOOKAHEAD && frontier.length; depth++) {
      const next = [];
      for (const [x, y] of frontier) for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (seen.has(k) || !walkable(nx, ny)) continue;
        seen.add(k); next.push([nx, ny]);
        far = Math.max(far, nearest(pets, nx, ny));
      }
      frontier = next;
    }
    return far;
  };
  const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[ch.d];
  let best = null, bs = -Infinity;
  for (const [dx, dy, d] of options) {
    const x = ch.x + dx, y = ch.y + dy;
    const score = nearest(pets, x, y) + reach(x, y) * 1.5 + (d === ch.d ? CHICKEN.commit : 0) - (d === back && options.length > 1 ? 4 : 0);
    if (score > bs) { bs = score; best = { x, y, d }; }
  }
  return best;
}

/** The tiles the chicken would run next if the pets stood still: up to `n`, as [[x, y], ...]. */
export function planRoute(ch, pets, walkable, n = CHICKEN.planSteps) {
  const sim = { x: ch.x, y: ch.y, d: ch.d }, out = [];
  for (let i = 0; i < n; i++) {
    const s = fleeStep(sim, pets, walkable);
    if (!s) break;
    sim.x = s.x; sim.y = s.y; sim.d = s.d; out.push([s.x, s.y]);
  }
  return out;
}

const LETTER = { '0,-1': 'u', '1,0': 'r', '0,1': 'd', '-1,0': 'l' };
const VECTOR = { u: [0, -1], r: [1, 0], d: [0, 1], l: [-1, 0] };
/** A route as the moves from (x, y): "uurrd". */
export function encodeRoute(x, y, tiles) {
  let out = '', cx = x, cy = y;
  for (const [tx, ty] of tiles) { out += LETTER[`${tx - cx},${ty - cy}`] || ''; cx = tx; cy = ty; }
  return out;
}
/** The tiles of a route sent as moves from (x, y), starting with (x, y) itself. */
export function decodeRoute(x, y, moves) {
  const out = [[x, y]];
  for (const c of moves || '') { const v = VECTOR[c]; if (!v) break; x += v[0]; y += v[1]; out.push([x, y]); }
  return out;
}

/**
 * Lets the chicken act at `now`. While a pet is within fleeRadius it runs at one constant speed (a step every fleeMs, no bursts and no
 * rests) along open tiles and keeps its heading unless blocked; it goes back to wandering only when every pet is beyond calmRadius.
 * Returns true when it moved a tile. `walkable(x, y)`: may the chicken stand there; `pets`: [{ x, y }].
 */
export function stepChicken(ch, pets, now, rng, walkable) {
  const near = nearest(pets, ch.x, ch.y);
  if (ch.mode !== 'flee' && near <= CHICKEN.fleeRadius) { ch.mode = 'flee'; ch.nextAt = now; }
  else if (ch.mode === 'flee' && near > CHICKEN.calmRadius) { ch.mode = 'wander'; ch.nextAt = now + CHICKEN.wanderMs; }
  if (now < ch.nextAt) return false;
  if (ch.mode === 'flee') {
    const s = fleeStep(ch, pets, walkable);
    if (!s) { ch.nextAt = now + CHICKEN.fleeMs; return false; }
    ch.x = s.x; ch.y = s.y; ch.d = s.d;
    ch.nextAt = now - ch.nextAt < CHICKEN.fleeMs ? ch.nextAt + CHICKEN.fleeMs : now + CHICKEN.fleeMs;   // an even beat, whatever the frame rate
    return true;
  }
  const options = DIRS.filter(([dx, dy]) => walkable(ch.x + dx, ch.y + dy));
  if (!options.length) { ch.nextAt = now + 400; return false; }
  if (rng() < 0.4) { ch.nextAt = now + CHICKEN.wanderMs * 1.6; return false; }          // pecks at the ground
  const keep = options.find((o) => o[2] === ch.d);
  const [dx, dy, d] = keep && rng() < 0.6 ? keep : options[Math.floor(rng() * options.length)];
  ch.x += dx; ch.y += dy; ch.d = d; ch.nextAt = now + CHICKEN.wanderMs;
  return true;
}
