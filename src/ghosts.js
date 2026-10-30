// The ghosts that drift over the map during Halloween (src/seasons.js): a few translucent ghosts per outdoor area, each wandering around a home tile and
// bobbing. A pure function of (area, server time): every player sees them in the same place, nothing is stored, and they never block a path (they are
// drawn over the map, flying). Flat: drawScene; HD-2D: drawGhosts (src/hd2d/scene.js), as billboards like the pets.
import { TILE } from './map.js';
import { hash } from './show/rand.js';

/** Zones { x, y, w, h } (tiles, every one open grass or plaza; a test checks it) each ghost wanders inside, 4 in the town, 2 in the farm: never over a building, a tree or the water. */
export const GHOST_ZONES = {
  town: [{ x: 11, y: 1, w: 6, h: 4 }, { x: 26, y: 18, w: 6, h: 4 }, { x: 37, y: 37, w: 6, h: 4 }, { x: 4, y: 42, w: 6, h: 4 }],
  farm: [{ x: 34, y: 3, w: 6, h: 4 }, { x: 9, y: 31, w: 6, h: 4 }],
};
export const GHOST_SCALE = 2;                                          // the 10 x 12 sprite is drawn this many game px per art px (whole pixels, so it stays crisp)
const SEED = { town: 11, farm: 23 };

/**
 * The ghosts of `area` at server time `ms`: [{ x, y (world px of the spot on the ground below it; at least half a tile inside its zone), lift (px above it), a (0..1 opacity), flip, frame (0|1) }].
 * `night` (0..1) makes them more visible: they are faint by day and glow by night. Areas without zones (interiors) have none.
 */
export function ghostsAt(area, ms, night = 0) {
  const zones = GHOST_ZONES[area];
  if (!zones || !Number.isFinite(ms)) return NONE;
  const t = ms / 1000, out = [];
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i], s = SEED[area], ph = hash(s, i, 1) * 6.2832, ph2 = hash(s, i, 2) * 6.2832, sp = 0.5 + hash(s, i, 3) * 0.4;       // each ghost has its own phase and pace
    const ax = t * 0.11 * sp + ph;
    const kx = 0.75 * Math.sin(ax) + 0.25 * Math.sin(t * 0.37 + ph2), ky = 0.8 * Math.sin(t * 0.08 * sp + ph2) + 0.2 * Math.sin(t * 0.23 + ph);       // within -1..1
    const x = (z.x + z.w / 2 + kx * (z.w - 1) / 2) * TILE, y = (z.y + z.h / 2 + ky * (z.h - 1) / 2) * TILE;
    out.push({ x, y, lift: 10 + Math.sin(t * 1.3 + ph) * 3, a: (0.38 + 0.42 * night) * (0.9 + 0.1 * Math.sin(t * 0.9 + ph2)), flip: Math.cos(ax) < 0, frame: Math.floor(t * 2 + i) % 2 });
  }
  return out;
}
const NONE = Object.freeze([]);
