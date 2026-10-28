// Tap a villager to talk, and a villager that waits for the pet: pure logic (the town wires it up, see src/town.js). Nothing here touches the network:
// a villager is a function of (room, server time) for everybody; a hold only changes how THIS screen draws it while this pet is talking to it.
import { Walker } from './walker.js';
import { NPC_STEP_MS } from './npc-world.js';

export const TAP_X = 1.1;               // a tap hits a villager when the tapped tile is within this many tiles sideways of its feet...
export const TAP_UP = 2;                // ...up to this many tiles above them (a tap on the head lands on the ground behind: more so in the HD-2D perspective)...
export const TAP_DOWN = 1;              // ...and this many below. The same box in both renderers: it only needs the tile under the tap, which both give (pointToTile)
export const BACK_STEP_MS = 140;        // a villager walks back to where its routine is faster than the routine itself (NPC_STEP_MS), so it catches up

/** The talkable villager a tap on `tile` ([x, y]) means: the nearest awake one (not the clerk) whose feet box (above) holds the tile, or null. list: [{ id, x, y, asleep, clerk }] (x, y fractional while it walks). */
export function villagerAtTap(tile, list) {
  let best = null, bd = Infinity;
  for (const n of list) {
    if (n.asleep || n.clerk) continue;
    const dx = tile[0] - n.x, dy = tile[1] - n.y;
    if (Math.abs(dx) > TAP_X || dy < -TAP_UP || dy > TAP_DOWN) continue;
    const d = Math.hypot(dx, dy * (dy < 0 ? 0.6 : 1));            // a tap above the feet (the body) counts a bit less than one on the feet
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/** The free tile beside a villager at tile (vx, vy) the pet should walk to: the 4 neighbours that are walkable and not `taken(x, y)`, the one with the shortest path from `me` ([x, y]); { x, y, path } or null. `path(x0, y0, x1, y1)` -> tiles excluding the start. */
export function talkSpot(vx, vy, me, { walkable, taken = () => false, path }) {
  let best = null;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const x = vx + dx, y = vy + dy;
    if (!walkable(x, y) || taken(x, y)) continue;
    const p = x === me[0] && y === me[1] ? [] : path(me[0], me[1], x, y);
    if (!p.length && !(x === me[0] && y === me[1])) continue;
    if (!best || p.length < best.path.length) best = { x, y, path: p };
  }
  return best;
}

/** The direction a walker at (x, y) looks to face (tx, ty): the longer axis. */
export const faceToward = (x, y, tx, ty) => (Math.abs(tx - x) >= Math.abs(ty - y) ? (tx < x ? 'left' : 'right') : (ty < y ? 'up' : 'down'));

/**
 * The villagers that wait for this pet. `wanted` (ids) are held where they are (they finish the step they were on), facing the pet; one that is no longer wanted walks
 * back to the tile its routine says it is on (faster than the routine, re-aimed as the routine moves on) and is then handed back to the routine untouched.
 * `step(entities, wanted, pet, dt, area, route)`: entities as src/npcs.js returns them (their walker already holds the routine's pose); it rewrites the walker of a held
 * or returning one. `route(x0, y0, x1, y1)` -> tiles. A villager that falls asleep or leaves the area is released at once (its routine puts it somewhere else anyway).
 */
export function createHold() {
  const holds = new Map();                                        // id -> { w: Walker, area, back: bool, aim: 'x,y' }
  return {
    has: (id) => holds.has(id),
    held: () => [...holds].filter(([, h]) => !h.back).map(([id]) => id),
    step(entities, wanted, pet, dt, area, route) {
      for (const e of entities) {
        const rw = e.walker, id = e.id;
        let h = holds.get(id);
        const keep = wanted.has(id) && !e.asleep && e.area === area;
        if (!h && !keep) continue;
        if (h && (e.asleep || e.area !== h.area)) { holds.delete(id); continue; }
        const goal = [rw.tx, rw.ty];                              // where the routine has this villager (the end of its step)
        if (!h) {
          const w = new Walker(rw.fx, rw.fy, rw.d);               // starts as the routine's own pose, so a step in progress is finished, not cut
          w.tx = rw.tx; w.ty = rw.ty; w.t = rw.t; w.moving = rw.moving;
          h = { w, area, back: false, aim: '' }; holds.set(id, h);
        }
        const w = h.w;
        if (keep) {
          h.back = false; w.queue = []; w.stepOverride = NPC_STEP_MS;
          w.update(dt);
          if (!w.moving) w.d = faceToward(w.tx, w.ty, pet.x, pet.y);
        } else {
          h.back = true; w.stepOverride = BACK_STEP_MS;
          if (!w.moving && w.tx === goal[0] && w.ty === goal[1]) { holds.delete(id); continue; }       // back on its routine
          const aim = `${goal[0]},${goal[1]}`;
          if (aim !== h.aim || (!w.moving && !w.queue.length)) {
            h.aim = aim;
            const p = w.moving || !(w.tx === goal[0] && w.ty === goal[1]) ? route(w.tx, w.ty, goal[0], goal[1]) : [];
            if (p.length) { w.queue = p.map((t) => [t[0], t[1]]); if (!w.moving) w.begin(); }
            else if (!w.moving) { holds.delete(id); continue; }  // no way back (blocked tile): let the routine have it
          }
          w.update(dt);
        }
        rw.fx = w.fx; rw.fy = w.fy; rw.tx = w.tx; rw.ty = w.ty; rw.t = w.t; rw.moving = w.moving; rw.d = w.d; rw.stepOverride = w.stepOverride;
        e.area = h.area;
      }
    },
  };
}
