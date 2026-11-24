// Where the pet can fish: next to a pond tile of the park (the farm's pond is part of the farm scenery). Pure: the town asks it every frame the pet stands still.
import { tileAt } from '../map.js';
import { needText } from '../tools.js';

export const ROD = 'fishing_rod';
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Is (x, y) a tile beside the park's pond? */
export const nextToPond = (x, y, area = 'town') => area === 'town' && SIDES.some(([dx, dy]) => tileAt(x + dx, y + dy, 'town') === '~');

/** The prompt at the pond: { id: 'fish', label: 'Pescar' } with the rod, a hint that names it without, null away from the water. `tools`: the keys the pet owns. */
export function pondAction(area, x, y, tools) {
  if (!nextToPond(x, y, area)) return null;
  if (Array.isArray(tools) && tools.includes(ROD)) return { id: 'fish', label: 'Pescar', target: 'pond' };
  return { id: 'hint', label: needText(ROD), need: ROD, target: 'pond' };
}
