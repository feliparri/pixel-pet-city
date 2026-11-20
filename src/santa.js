// Santa walks across the town's plaza while Christmas is on. The schedule is a pure function of (room code, server time), so everyone in a room sees the same walk
// at the same moment and nothing goes over the net: in each 40 min walk slot (src/gifts.js) Santa walks once, starting at a moment the room's hash picks in the first
// 28 min of the slot, strolling along ROUTE for WALK_MS and dropping SANTA_PER special gifts on its tiles. A gift appears when Santa drops it and vanishes
// GIFT_LIFE_MS later (5 min), so a walk and its gifts end before the slot does. The gifts go through the server like the hidden ones (ids `santa:<walk slot>:<n>`).
import { TILE } from './map.js';
import { hashSeed, mulberry32 } from './life.js';
import { WALK_SLOT_MS, WALK_START_MAX_MS, SANTA_PER, SANTA_ID, walkSlotOf, walkSlotStart, santaRewardOf } from './gifts.js';

export const WALK_MS = 60_000;                         // the stroll across the plaza
export const GIFT_LIFE_MS = 5 * 60_000;                // a dropped gift stays this long
export const ROUTE = { y: 23, x0: 16, x1: 33 };        // the row of open paving south of the fountain (the plaza's spawn tiles are one row below), from the plaza's west edge to the lawn east of it: tiles, inclusive
export const STEP_MS = 260;                            // a walking frame

/** The walk of room `room` in walk slot `slot`: { slot, start, end (ms), dir (1 walks east, -1 west), gifts: [{ id, n, x, y (tile), dropAt, expireAt, reward }] }. Built once per slot. */
const cache = new Map();
export function walkOf(room, slot) {
  const key = `${room}|${slot}`;
  let w = cache.get(key);
  if (w) return w;
  const rnd = mulberry32(hashSeed(`${room}:santa:${slot}`));
  const start = walkSlotStart(slot) + Math.floor(rnd() * WALK_START_MAX_MS), dir = rnd() < 0.5 ? 1 : -1;
  const at = (f) => Math.round(dir > 0 ? ROUTE.x0 + (ROUTE.x1 - ROUTE.x0) * f : ROUTE.x1 - (ROUTE.x1 - ROUTE.x0) * f);
  const gifts = Array.from({ length: SANTA_PER }, (_, n) => {
    const f = (n + 1) / (SANTA_PER + 1), id = `${SANTA_ID}:${slot}:${n}`, dropAt = start + Math.round(f * WALK_MS);
    return { id, n, x: at(f), y: ROUTE.y, dropAt, expireAt: dropAt + GIFT_LIFE_MS, reward: santaRewardOf(id) };
  });
  w = { slot, start, end: start + WALK_MS, dir, gifts };
  if (cache.size > 64) cache.clear();
  cache.set(key, w);
  return w;
}

/** Is Christmas among `seasons` (a Set of keys, or null)? Santa walks only then. */
const on = (seasons) => !!seasons && seasons.has('christmas');

/** Where Santa is at server time `ms` in room `room`: { x, y (world px, the feet), dir, frame (0|1, the stride) }, or null when he is not walking (or Christmas is off). */
export function santaAt(room, ms, seasons) {
  if (!on(seasons) || !Number.isFinite(ms)) return null;
  const w = walkOf(room, walkSlotOf(ms));
  if (ms < w.start || ms >= w.end) return null;
  const f = (ms - w.start) / WALK_MS, tx = w.dir > 0 ? ROUTE.x0 + (ROUTE.x1 - ROUTE.x0) * f : ROUTE.x1 - (ROUTE.x1 - ROUTE.x0) * f;
  return { x: tx * TILE + TILE / 2, y: ROUTE.y * TILE + TILE - 1, dir: w.dir, frame: Math.floor((ms - w.start) / STEP_MS) % 2 };
}

/** The gifts of Santa's lying about at `ms` in `room`: those dropped already and not yet gone, [{ id, n, x, y, season: 'christmas', kind: 'santa', slot, reward, dropAt, expireAt }]. */
export function santaGiftsAt(room, ms, seasons) {
  if (!on(seasons) || !Number.isFinite(ms)) return [];
  const w = walkOf(room, walkSlotOf(ms));
  return w.gifts.filter((g) => ms >= g.dropAt && ms < g.expireAt).map((g) => ({ ...g, season: 'christmas', kind: 'santa', slot: w.slot }));
}
