// Pillar la gallina: the chicken's behaviour and the catch test, as pure functions. Only the referee runs them; everyone else just draws
// the chicken from the `gchick` messages. A chicken is `{ x, y, d, mode: 'wander'|'flee'|'tired', dash, nextAt, tiredUntil }`.
import { GAME_RULES } from './rules.js';
import { touching } from './hide.js';

export const CHICKEN = {
  wanderMs: 480,            // a calm step (2 tiles a second)
  fleeMs: 120,              // a sprint step (8 tiles a second; a pet needs 160 ms, 6)
  dashSteps: 12,            // a sprint this long (about 1.4 s) ...
  tiredMs: 1800,            // ... and then it stands panting this long, which lets a chaser close about 11 tiles
  fleeRadius: 4,            // it sprints when a pet comes this close
};
const LOOKAHEAD = 8;
export const catchesToWin = GAME_RULES.chicken.goal;
const DIRS = [[0, -1, 'up'], [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left']];

export const createChicken = (x, y, now = 0) => ({ x, y, d: 'left', mode: 'wander', dash: 0, nextAt: now + 600, tiredUntil: 0 });

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

/**
 * Lets the chicken act at `now`. It runs from the nearest pet with simple steering (the neighbour tile farthest from every pet, preferring
 * open ground over corners), gets tired after a dash, and otherwise wanders. Returns true when it moved a tile.
 * `walkable(x, y)` tells whether the chicken may stand there; `pets`: [{ x, y }].
 */
export function stepChicken(ch, pets, now, rng, walkable) {
  if (ch.mode === 'tired') {
    if (now < ch.tiredUntil) return false;
    ch.mode = 'wander'; ch.dash = 0; ch.nextAt = now + 300;
  }
  if (now < ch.nextAt) return false;
  const options = DIRS.filter(([dx, dy]) => walkable(ch.x + dx, ch.y + dy));
  if (!options.length) { ch.nextAt = now + 400; return false; }
  const near = pets.reduce((m, p) => Math.min(m, Math.hypot(p.x - ch.x, p.y - ch.y)), Infinity);
  if (near <= CHICKEN.fleeRadius) {
    if (ch.dash >= CHICKEN.dashSteps) { ch.mode = 'tired'; ch.tiredUntil = now + CHICKEN.tiredMs; ch.dash = 0; return false; }
    ch.mode = 'flee';
    const dist = (x, y) => pets.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
    // looks a few steps ahead: how far from the pets can it get from there? (so it goes round a wall instead of into a corner)
    const reach = (sx, sy) => {
      const seen = new Set([`${ch.x},${ch.y}`, `${sx},${sy}`]);
      let frontier = [[sx, sy]], far = dist(sx, sy);
      for (let depth = 0; depth < LOOKAHEAD && frontier.length; depth++) {
        const next = [];
        for (const [x, y] of frontier) for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
          if (seen.has(k) || !walkable(nx, ny)) continue;
          seen.add(k); next.push([nx, ny]);
          far = Math.max(far, dist(nx, ny));
        }
        frontier = next;
      }
      return far;
    };
    let best = null, bs = -Infinity;
    for (const [dx, dy, d] of options) {
      const x = ch.x + dx, y = ch.y + dy;
      const score = dist(x, y) + reach(x, y) * 1.5 + rng() * 0.5;
      if (score > bs) { bs = score; best = { x, y, d }; }
    }
    ch.x = best.x; ch.y = best.y; ch.d = best.d; ch.dash++; ch.nextAt = now + CHICKEN.fleeMs;
    return true;
  }
  ch.mode = 'wander'; ch.dash = 0;
  if (rng() < 0.4) { ch.nextAt = now + CHICKEN.wanderMs * 1.6; return false; }          // pecks at the ground
  const keep = options.find((o) => o[2] === ch.d);
  const [dx, dy, d] = keep && rng() < 0.6 ? keep : options[Math.floor(rng() * options.length)];
  ch.x += dx; ch.y += dy; ch.d = d; ch.nextAt = now + CHICKEN.wanderMs;
  return true;
}
