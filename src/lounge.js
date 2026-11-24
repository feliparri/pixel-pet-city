// Beach loungers: a lounger tile ('&') is open ground a pet can walk across. A pet that stands still on one lies on it, and any step gets it up: so the pose comes from the tile and
// the walker alone (the own pet and the remote ones alike, nothing goes over the net). Beside one, the prompt "A: Recostarse" walks the pet onto it.
import { tileAt } from './map.js';
import { SLEEP_LINE } from './npcs.js';

/** What a pet on a lounger shows is the game's own sleeping drawing (a sleeping villager's): the eyes shut ('blink') and the "Zzz..." bubble over its head. */
export const LIE_SAY = SLEEP_LINE;
export const LIE_LIFT = 4;                      // art px it rests above the ground: on the seat

export const LOUNGER = '&';
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Is there a lounger at (x, y) of the area? */
export const isLounger = (x, y, area = 'beach') => tileAt(x, y, area) === LOUNGER;

/** Is this pet lying down? It is standing still on a lounger (a walker: { tx, ty, moving, queue }). */
export const lying = (area, w) => !w.moving && !(w.queue && w.queue.length) && isLounger(w.tx, w.ty, area);

/** The prompt for a pet standing still at (x, y) of the beach: { id: 'lounge', label: 'Recostarse', target: [x, y] } beside a lounger (not on one), else null. */
export function loungeAt(x, y, area = 'beach') {
  if (area !== 'beach' || isLounger(x, y, area)) return null;
  const s = SIDES.find(([dx, dy]) => isLounger(x + dx, y + dy, area));
  return s ? { id: 'lounge', label: 'Recostarse', target: [x + s[0], y + s[1]] } : null;
}
