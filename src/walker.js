// A pet that moves tile by tile: one step takes STEP_MS and is drawn interpolated, so everybody (the local player and the other pets,
// whose positions arrive at most 10 times a second) glides instead of jumping.
import { findPath, stepDir } from './path.js';

export const STEP_MS = 160;
export const RUN_FACTOR = 1.8;          // a running pet (Shift on the keyboard, free walk only) takes this many times less per step
export const REMOTE_SNAP = 6;           // a remote pet this many tiles behind its reported tile jumps instead of walking: a running pet is a few tiles ahead
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
    this.run = false;                   // the local pet runs: set between steps, so a step never changes pace half way
    this.hurry = false;                 // a remote or referee-driven walker that fell behind catches up at double pace; the local pet never does
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

  stepMs() { return this.stepOverride || (this.hurry && this.queue.length > 3 ? STEP_MS / 2 : this.run ? STEP_MS / RUN_FACTOR : STEP_MS); }   // a remote pet that fell behind hurries (a tapped route of the local pet does not)

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

  /**
   * Follow a route a referee sent: [[x, y], ...] where the first tile is where the mover is on the referee's side now. If this walker's
   * current target is on the route it just continues down it (no stop, no jump back); if it is near it walks there by the map's paths;
   * if it is far (more than `far` tiles) it jumps. `where`: an area name; `pastMs`: how far into its first step the mover already is.
   */
  follow(route, where, far = 6, pastMs = 0) {
    if (!route.length) return;
    const at = route.findIndex((p) => p[0] === this.tx && p[1] === this.ty);
    if (at >= 0) {
      this.queue = route.slice(at + 1).map((p) => [p[0], p[1]]);
      if (!this.moving) { this.begin(); if (this.moving && pastMs) this.t = Math.min(pastMs, this.stepMs() - 1); }
      return;
    }
    const [x, y] = route[0];
    const path = Math.abs(x - this.tx) + Math.abs(y - this.ty) <= far ? findPath(this.tx, this.ty, x, y, where) : [];
    if (Math.abs(x - this.tx) + Math.abs(y - this.ty) > far || (!path.length && !(x === this.tx && y === this.ty))) {
      const d = route[1] ? stepDir(x, y, route[1][0], route[1][1]) : this.d;
      this.snap(x, y, d);
      this.queue = route.slice(1).map((p) => [p[0], p[1]]);
      this.begin();
      if (this.moving && pastMs) this.t = Math.min(pastMs, this.stepMs() - 1);
      return;
    }
    this.queue = [...path, ...route.slice(1)].map((p) => [p[0], p[1]]);
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
