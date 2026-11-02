// The decorations of every season that is on, as one list: each season has its own (halloweenDecor, christmasDecor), the renderers draw the union.
// A season's list is { id, x, y (feet), lift, sprite, lit, glows: [{ x, y, z, r, rgb? }] } sorted by y, with `.glows` the lamp-style glows of the flat renderer.
import { halloweenDecor } from './halloween.js';
import { christmasDecor } from './christmas.js';

const DECOR = { halloween: halloweenDecor, christmas: christmasDecor };
const NONE = Object.assign([], { glows: [] });
const merged = new Map();

/** What `area` wears while `seasons` (a Set of season keys, or null) are on: [] (with `.glows` []) when none has decorations there. Cached, so the same seasons give the same array. */
export function seasonDecor(area, seasons) {
  const keys = seasons && seasons.size ? Object.keys(DECOR).filter((k) => seasons.has(k)) : [];
  if (!keys.length) return NONE;
  if (keys.length === 1) return DECOR[keys[0]](area);
  const id = `${area}|${keys}`;
  let list = merged.get(id);
  if (!list) {
    list = keys.flatMap((k) => DECOR[k](area)).sort((a, b) => a.y - b.y || a.x - b.x);
    list.glows = keys.flatMap((k) => DECOR[k](area).glows);
    merged.set(id, list);
  }
  return list;
}
