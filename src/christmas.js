// Christmas in the town: where the decorations stand (when they are up is the season registry's, src/seasons.js: Nov 2 00:00 to Jan 2 00:00, America/Santiago).
// The same rules as Halloween (src/halloween.js): the decorations are drawn over the map, never part of it, so nothing blocks a path; they stand on open grass or
// plaza that is not a door, a mat or a path, and outside the season nothing is drawn. The big tree stands in the plaza north of the fountain.
import { TILE, HOUSES } from './map.js';

const doorSides = (side) => HOUSES.map((h) => [h.x + h.door + side, h.y + 4]);       // the tile beside each door mat
const TOWN = {
  tree: [[23, 18]],                                                                   // the big tree: it covers this tile and the next one
  minitree: [[16, 16], [31, 16], [16, 26], [31, 26]],
  gift: [...doorSides(1), [22, 19], [25, 19], [21, 22], [26, 20], [46, 28], [46, 31]],
  cane: [...doorSides(-1), [22, 4], [25, 4], [22, 8], [25, 8], [22, 14], [25, 14]],
};
const FARM = {
  tree: [],
  minitree: [[25, 6], [32, 6], [10, 29], [24, 15]],
  gift: [[12, 29], [1, 16], [1, 19], [24, 29], [35, 19]],
  cane: [[19, 6], [24, 6], [19, 16], [25, 16]],
};
const NONE = { tree: [], minitree: [], gift: [], cane: [] };
const TILES_OF = { town: TOWN, farm: FARM };

/** The walkable-ground tiles that hold a decoration: { tree, minitree, gift, cane } -> [[x, y]] for an area ('town' or 'farm'; others have none). */
export const decorTiles = (area) => TILES_OF[area] || NONE;

const cache = new Map();
/**
 * Everything an area wears, in world px: [{ kind: 'tree'|'minitree'|'gift'|'cane'|'lights'|'wreath', x (centre), y (feet), lift (px above the feet), w? }]. Built once.
 * A string of lights hangs along the top of a house's wall (`w` px wide), a wreath on its door (the wall stands from 32 to 64 px down the facade, the eave above it).
 */
export function decorOf(area) {
  if (cache.has(area)) return cache.get(area);
  const t = decorTiles(area), out = [];
  for (const [x, y] of t.tree) out.push({ kind: 'tree', x: x * TILE + TILE, y: y * TILE + TILE - 1, lift: 0 });
  for (const kind of ['minitree', 'gift', 'cane']) for (const [x, y] of t[kind]) out.push({ kind, x: x * TILE + TILE / 2, y: y * TILE + TILE - 1, lift: 0 });
  if (area === 'town') for (const h of HOUSES) {
    const foot = (h.y + 4) * TILE + 1;
    out.push({ kind: 'lights', x: h.x * TILE + (h.w * TILE) / 2, y: foot, lift: 24, w: h.w * TILE - 8 });
    out.push({ kind: 'wreath', x: (h.x + h.door) * TILE + TILE / 2, y: foot, lift: 4 });
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  cache.set(area, out);
  return out;
}
