// The bonfire circle of the beach (BEACH.bonfire, tile '6'): five seats around the ring, taken only through a prompt ("A: Sentarse"), never automatically. A seated pet faces the fire
// and can toast a marshmallow or stoke the fire; the others see who sits (the optional `sit` field of a position, src/protocol.js: 1 to 5 seated, 6 to 10 the same seat while toasting)
// and the stoking (the message `fire`). Pure rules here; the drawing is src/art/flare.js and the sitting is drawn by the pet painters.
import { BEACH, isWalkable, tileAt } from './map.js';
import { hashSeed } from './life.js';

export const SEATS = [[47, 27], [48, 29], [50, 29], [51, 27], [49, 25]];     // the open sand round the ring, a stone's throw from the fire
export const FULL_TEXT = 'La fogata está llena';
export const SIT_LABEL = 'Sentarse';
export const MAX_NPC_SEATS = 2;                      // the crowd may sit at the fire at night, never more than this many: the rest are for players
export const FIRE_MS = 20000;                        // a stoked fire burns high this long
export const RISE_MS = 900, FALL_MS = 3000;          // ... rising and dying down
export const ROAST_MS = 4500;                        // the marshmallow over the flame, then it is eaten (or it burns)
export const BURN_CHANCE = 0.2;

/** The direction a pet on seat `i` faces: towards the fire. */
export function seatFacing(i) {
  const [sx, sy] = SEATS[i], dx = BEACH.bonfire.x - sx, dy = BEACH.bonfire.y - sy;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
/** The seat (0..4) at a tile, or -1. */
export const seatAt = (x, y) => SEATS.findIndex(([sx, sy]) => sx === x && sy === y);
/** The `sit` field to send for a pet on seat `i` (0..4): 1 to 5, plus 5 while it is toasting; 0 when it is not seated. */
export const sitCode = (i, roasting = false) => (i >= 0 && i < SEATS.length ? i + 1 + (roasting ? SEATS.length : 0) : 0);
/** What another pet's `sit` field says: { seat, roasting } or null. */
export const fromSit = (code) => (Number.isInteger(code) && code >= 1 && code <= 2 * SEATS.length ? { seat: (code - 1) % SEATS.length, roasting: code > SEATS.length } : null);

/**
 * The prompt for a pet standing still at (x, y) of the beach: on or next to a free seat "Sentarse" (id 'sit', `target` the seat's tile and `seat` its index), "La fogata está llena" (a hint)
 * when it stands by the ring and every seat is taken; null elsewhere. `taken` is a Set of seat indices that are taken (by anyone but this pet).
 */
export function bonfireAt(x, y, area = 'beach', taken = new Set()) {
  if (area !== 'beach') return null;
  const near = SEATS.map(([sx, sy], i) => ({ i, d: Math.max(Math.abs(sx - x), Math.abs(sy - y)) })).filter((s) => s.d <= 1);
  if (!near.length) return null;
  const free = near.filter((s) => !taken.has(s.i)).sort((a, b) => a.d - b.d)[0];
  return free ? { id: 'sit', label: SIT_LABEL, target: SEATS[free.i], seat: free.i } : { id: 'hint', label: FULL_TEXT, target: 'bonfire' };
}

/** How high the stoked fire is at `now` (0..1): 0 when `until` has passed, up in RISE_MS from `since`, down over the last FALL_MS. */
export function fireLevel(since, until, now) {
  if (!(until > now)) return 0;
  return Math.max(0, Math.min(1, (now - since) / RISE_MS, (until - now) / FALL_MS));
}

/** The marshmallow of a toast begun at `since` for pet `id`: { k (0..1 through the toast), tone (0 white, 1 golden, 2 black), done, burnt }. It burns for fun now and then, from the id and the start alone. */
export function roastAt(since, now, id) {
  const k = Math.max(0, Math.min(1, (now - since) / ROAST_MS)), burnt = (hashSeed(`${id}:${Math.floor(since)}`) % 1000) / 1000 < BURN_CHANCE;
  const tone = burnt && k > 0.7 ? 2 : k > 0.35 ? 1 : 0;
  return { k, tone, done: now - since >= ROAST_MS, burnt };
}

/** A tile may be a seat only if it is open ground (checked by the tests against the map). */
export const seatsAreOpen = () => SEATS.every(([x, y]) => isWalkable(x, y, 'beach') && tileAt(x, y, 'beach') !== '6');
