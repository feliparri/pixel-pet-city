// Beach loungers ('&') and towels ('Q'): open ground a pet can walk across and also rest on. Resting is never automatic: beside or on a resting spot the prompt "A: Recostarse"
// lies the pet down on it (a pet standing still on one without pressing is just standing), and any step, or A again ("Levantarse"), gets it up. Because it is a choice it
// travels: a pet sends the optional field `rest: 1` with its position while it lies (src/protocol.js), and the others draw it lying, only while it stands still on a resting spot.
import { tileAt } from './map.js';

/** A resting pet is drawn as the board draws a sleeping pet, lying flat (src/art/sleep.js: ported from the device's ui_goal.c): on a lounger on its seat, on a towel at ground level. */
export const LIE_LIFT = 3;

export const LOUNGER = '&';
export const TOWEL = 'Q';
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Is there a lounger at (x, y) of the area? */
export const isLounger = (x, y, area = 'beach') => tileAt(x, y, area) === LOUNGER;
/** A lounger or a towel: somewhere to lie down. */
export const isRestSpot = (x, y, area = 'beach') => { const c = tileAt(x, y, area); return c === LOUNGER || c === TOWEL; };
/** How many art px a pet lying at (x, y) is above the ground: the seat of a lounger, nothing on a towel. */
export const restLift = (x, y, area = 'beach') => (isLounger(x, y, area) ? LIE_LIFT : 0);

/** Is this pet drawn lying down? It chose to (`rest`: the flag), and it stands still on a resting spot (a walker: { tx, ty, moving, queue }). */
export const lying = (area, w, rest) => !!rest && !w.moving && !(w.queue && w.queue.length) && isRestSpot(w.tx, w.ty, area);

/**
 * The prompt for a pet standing still at (x, y) of the beach: "Recostarse" (id 'lounge', `target` the spot: its own tile, or the neighbouring one) on or beside a resting spot, and
 * "Levantarse" (id 'getup') while it is lying; null elsewhere. `resting`: the pet is lying now.
 */
export function loungeAt(x, y, area = 'beach', resting = false) {
  if (area !== 'beach') return null;
  if (isRestSpot(x, y, area)) return resting ? { id: 'getup', label: 'Levantarse', target: [x, y] } : { id: 'lounge', label: 'Recostarse', target: [x, y] };
  const s = SIDES.find(([dx, dy]) => isRestSpot(x + dx, y + dy, area));
  return s ? { id: 'lounge', label: 'Recostarse', target: [x + s[0], y + s[1]] } : null;
}
