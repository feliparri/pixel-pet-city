// A pet that moves tile by tile: one step takes STEP_MS and is drawn interpolated, so everybody (the local player and the other pets,
// whose positions arrive at most 10 times a second) glides instead of jumping.
import { findPath, stepDir } from './path.js';

export const STEP_MS = 160;
const MAX_CATCHUP = 24;                 // a remote target further than this many steps away is a teleport

export class Walker {
  constructor(x, y, d = 'down') {
    this.fx = x; this.fy = y;           // where the current step started
    this.tx = x; this.ty = y;           // where it ends (the tile the walker is "on" for the game rules)
    this.t = 0;                         // ms into the step
    this.moving = false;
    this.d = d;
    this.queue = [];                    // tiles still to walk
    this.onStep = null;                 // (x, y, d) when a step starts
    this.stepOverride = null;           // ms per step when something (the chicken sprinting) goes at its own pace
  }

  get tileX() { return this.tx; }
  get tileY() { return this.ty; }
  get busy() { return this.moving || this.queue.length > 0; }

  /** Tile coordinates, fractional while a step is in progress. */
  pos() {
    if (!this.moving) return { x: this.tx, y: this.ty };
    const k = Math.min(1, this.t / this.stepMs());
    return { x: this.fx + (this.tx - this.fx) * k, y: this.fy + (this.ty - this.fy) * k };
  }

  stepMs() { return this.stepOverride || (this.queue.length > 3 ? STEP_MS / 2 : STEP_MS); }   // a pet that fell behind hurries

  /** Replace what is left to walk (the step in progress finishes first). */
  setPath(tiles) {
    this.queue = tiles.map((p) => [p[0], p[1]]);
    if (!this.moving) this.begin();
  }

  /** Walk one tile in a direction when idle (arrow keys): the caller checks the tile is walkable. */
  stepToward(x, y) {
    if (this.moving) return false;
    this.queue = [[x, y]];
    this.begin();
    return true;
  }

  /** Face a direction without moving (a key into a wall). */
  face(d) {
    if (this.d !== d) { this.d = d; if (this.onStep) this.onStep(this.tx, this.ty, d); }
  }

  /** A remote pet reports the tile it is walking to: walk there by the map's own paths (`where`: an area name), or jump when it is too far. */
  goTo(x, y, d, where) {
    const endX = this.queue.length ? this.queue[this.queue.length - 1][0] : this.tx;
    const endY = this.queue.length ? this.queue[this.queue.length - 1][1] : this.ty;
    if (endX === x && endY === y) { if (!this.busy) this.d = d; return; }
    const path = findPath(endX, endY, x, y, where);
    if (!path.length || path.length > MAX_CATCHUP) { this.snap(x, y, d); return; }
    this.queue.push(...path);
    if (!this.moving) this.begin();
  }

  snap(x, y, d) {
    this.fx = this.tx = x; this.fy = this.ty = y;
    this.moving = false; this.t = 0; this.queue = []; this.d = d;
  }

  begin() {
    const next = this.queue.shift();
    if (!next) { this.moving = false; return; }
    this.fx = this.tx; this.fy = this.ty;
    this.tx = next[0]; this.ty = next[1];
    this.d = stepDir(this.fx, this.fy, this.tx, this.ty);
    this.t = 0;
    this.moving = true;
    if (this.onStep) this.onStep(this.tx, this.ty, this.d);
  }

  update(dtMs) {
    let left = dtMs;
    while (this.moving && left > 0) {
      const need = this.stepMs() - this.t;
      if (left < need) { this.t += left; return; }
      left -= need;
      this.moving = false;
      this.t = 0;
      this.begin();
    }
  }
}
