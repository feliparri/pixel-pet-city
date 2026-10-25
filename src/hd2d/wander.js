// A pet that strolls on its own: it picks a walkable tile near it, walks there by the town's own paths (Walker + findPath), rests, repeats.
import { Walker } from '../walker.js';
import { findPath } from '../path.js';
import { isWalkable } from '../map.js';

/** A small seeded random generator (mulberry32) so a screenshot is the same every time. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Wanderer {
  /** `box` = { x0, y0, x1, y1 } tiles (inclusive) the pet may walk to. */
  constructor(id, look, x, y, box, rand) {
    this.id = id; this.name = id; this.look = look; this.walker = new Walker(x, y, 'down');
    this.box = box; this.rand = rand; this.wait = 400 + rand() * 2500;
  }

  update(dtMs) {
    this.walker.update(dtMs);
    if (this.walker.busy) return;
    this.wait -= dtMs;
    if (this.wait > 0) return;
    const { box, rand, walker: w } = this;
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.max(box.x0, Math.min(box.x1, w.tileX + Math.round((rand() - 0.5) * 14)));
      const y = Math.max(box.y0, Math.min(box.y1, w.tileY + Math.round((rand() - 0.5) * 12)));
      if (!isWalkable(x, y)) continue;
      const path = findPath(w.tileX, w.tileY, x, y);
      if (path.length >= 3 && path.length <= 16) { w.setPath(path); break; }
    }
    this.wait = 900 + rand() * 3200;
  }
}
