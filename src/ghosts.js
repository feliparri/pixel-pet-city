// The ghosts that drift over the map during Halloween (src/seasons.js): a few translucent ghosts per outdoor area, each wandering around a home tile and
// bobbing. A pure function of (area, server time): every player sees them in the same place, nothing is stored, and they never block a path (they are
// drawn over the map, flying). Flat: drawScene; HD-2D: drawGhosts (src/hd2d/scene.js), as billboards like the pets.
import { TILE } from './map.js';
import { hash } from './show/rand.js';

/** Home tiles [x, y] of the ghosts of an area (open grass or plaza; a test keeps them on walkable ground), 4 in the town, 2 in the farm. */
export const GHOST_HOMES = {
  town: [[10, 5], [38, 21], [5, 41], [40, 46]],
  farm: [[10, 13], [36, 29]],
};
export const ROAM = { x: 2.4, y: 1.4 };                                // how far, in tiles, a ghost wanders from home
const SEED = { town: 11, farm: 23 };

/**
 * The ghosts of `area` at server time `ms`: [{ x, y (world px of the spot on the ground below it), lift (px above it), a (0..1 opacity), flip, frame (0|1) }].
 * `night` (0..1) makes them more visible: they are faint by day and glow by night. Areas without homes (interiors) have none.
 */
export function ghostsAt(area, ms, night = 0) {
  const homes = GHOST_HOMES[area];
  if (!homes || !Number.isFinite(ms)) return NONE;
  const t = ms / 1000, out = [];
  for (let i = 0; i < homes.length; i++) {
    const s = SEED[area], ph = hash(s, i, 1) * 6.2832, ph2 = hash(s, i, 2) * 6.2832, sp = 0.5 + hash(s, i, 3) * 0.4;       // each ghost has its own phase and pace
    const wx = Math.sin(t * 0.11 * sp + ph), wy = Math.sin(t * 0.08 * sp + ph2);
    const x = (homes[i][0] + 0.5 + wx * ROAM.x + Math.sin(t * 0.37 + ph2) * 0.3) * TILE, y = (homes[i][1] + 0.5 + wy * ROAM.y) * TILE;
    const vx = Math.cos(t * 0.11 * sp + ph);                           // the sign of the horizontal drift: which way it faces
    out.push({ x, y, lift: 12 + Math.sin(t * 1.3 + ph) * 3, a: (0.38 + 0.42 * night) * (0.9 + 0.1 * Math.sin(t * 0.9 + ph2)), flip: vx < 0, frame: Math.floor(t * 2 + i) % 2 });
  }
  return out;
}
const NONE = Object.freeze([]);
