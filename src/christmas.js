// Christmas in the town: where the decorations stand (when they are up is the season registry's, src/seasons.js: Nov 2 00:00 to Jan 2 00:00, America/Santiago).
// The same rules as Halloween (src/halloween.js): the decorations are drawn over the map, never part of it, so nothing blocks a path; they stand on open grass or
// plaza that is not a door, a mat or a path, and outside the season nothing is drawn. The big tree stands in the plaza north of the fountain.
import { TILE, HOUSES, GAME_PLACES } from './map.js';

const doorSides = (side) => HOUSES.map((h) => [h.x + h.door + side, h.y + 4]);       // the tile beside each door mat
const TOWN = {
  tree: [[23, 18]],                                                                   // the big tree: it covers this tile and the next one
  minitree: [[16, 16], [31, 16], [16, 26], [31, 26],
    [5, 34], [11, 34], [5, 38], [11, 38]],                                            // the Parque: lit trees round the pond
  gift: [...doorSides(1), [22, 19], [25, 19], [21, 22], [26, 20], [46, 28], [46, 31],
    [18, 34], [30, 42], [13, 60], [41, 69]],                                          // the Parque: a pile beside each game's pad (hide, chicken, soccer, race), never on it
  cane: [...doorSides(-1), [22, 4], [25, 4], [22, 8], [25, 8], [22, 14], [25, 14],
    [5, 32], [10, 32], [14, 32], [19, 32], [22, 32], [25, 32], [28, 32], [33, 32], [36, 32], [41, 32]],    // the Parque's hedge: the posts of the strings of lights (STRINGS)
  snowman: [[25, 33]],                                                                // just inside the Parque's entrance
};
// The Parque's strings of lights hang between two posts of the hedge row: [x of the left cane, x of the right cane, y], tiles.
const STRINGS = [[5, 10, 32], [14, 19, 32], [22, 25, 32], [28, 33, 32], [36, 41, 32]];
const FARM = {
  tree: [],
  minitree: [[25, 6], [32, 6], [10, 29], [24, 15]],
  gift: [[12, 29], [1, 16], [1, 19], [24, 29], [35, 19]],
  cane: [[19, 6], [24, 6], [19, 16], [25, 16]],
  snowman: [],
};
const NONE = { tree: [], minitree: [], gift: [], cane: [], snowman: [] };
const TILES_OF = { town: TOWN, farm: FARM };

/** The walkable-ground tiles that hold a decoration: { tree, minitree, gift, cane, snowman } -> [[x, y]] for an area ('town' or 'farm'; others have none). */
/** The Parque's strings of lights: [[x of the left post, x of the right post, y]] in tiles (every post is a cane tile). */
export const PARK_STRINGS = STRINGS;
export const decorTiles = (area) => TILES_OF[area] || NONE;

const cache = new Map();
/**
 * Everything an area wears, in world px: [{ kind: 'tree'|'minitree'|'gift'|'cane'|'snowman'|'lights'|'wreath', x (centre), y (feet), lift (px above the feet), w? }]. Built once.
 * A string of lights hangs along the top of a house's wall (`w` px wide), a wreath on its door (the wall stands from 32 to 64 px down the facade, the eave above it).
 * In the Parque a string hangs between two canes of the hedge row (`park: true`) and a wreath on each game's signpost (`park: true`).
 */
export function decorOf(area) {
  if (cache.has(area)) return cache.get(area);
  const t = decorTiles(area), out = [];
  for (const [x, y] of t.tree) out.push({ kind: 'tree', x: x * TILE + TILE, y: y * TILE + TILE - 1, lift: 0 });
  for (const kind of ['minitree', 'gift', 'cane', 'snowman']) for (const [x, y] of t[kind]) out.push({ kind, x: x * TILE + TILE / 2, y: y * TILE + TILE - 1, lift: 0 });
  if (area === 'town') for (const h of HOUSES) {
    const foot = (h.y + 4) * TILE + 1;
    out.push({ kind: 'lights', x: h.x * TILE + (h.w * TILE) / 2, y: foot, lift: 24, w: h.w * TILE - 8 });
    out.push({ kind: 'wreath', x: (h.x + h.door) * TILE + TILE / 2, y: foot, lift: 4 });
  }
  if (area === 'town') {
    for (const [a, b, y] of STRINGS) out.push({ kind: 'lights', x: ((a + b) / 2 + 0.5) * TILE, y: y * TILE + TILE - 1, lift: 9, w: (b - a) * TILE, park: true });
    for (const g of Object.values(GAME_PLACES)) out.push({ kind: 'wreath', x: g.sign[0] * TILE + TILE / 2, y: g.sign[1] * TILE + TILE - 1, lift: 3, park: true });
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  cache.set(area, out);
  return out;
}
