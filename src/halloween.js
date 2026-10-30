// Halloween in the town: when the decorations are up (a pure function of the server's clock, the same for every player) and where they stand.
// The window is Oct 24 00:00 to Nov 1 06:00 America/Santiago, every year (06:00 is when the town's day turns, so the night of Oct 31 to Nov 1
// keeps its decorations). Chile is on summer time (UTC-3) all through it, so there is no clock change inside the window.
// The decorations are drawn over the map, never part of it: nothing blocks a path, and outside the window nothing is drawn.
import { TILE, HOUSES } from './map.js';
import { zonedToMs } from './admin-time.js';

const edges = new Map();                                      // year -> [start ms, end ms]
/** True while the town wears its Halloween decorations at server time `ms` (UTC ms). */
export function halloweenOn(ms) {
  if (!Number.isFinite(ms)) return false;
  const y = new Date(ms).getUTCFullYear();
  let e = edges.get(y);
  if (!e) edges.set(y, e = [zonedToMs(`${y}-10-24`, '00:00'), zonedToMs(`${y}-11-01`, '06:00')]);
  return ms >= e[0] && ms < e[1];
}

// Tiles (x, y) of the jack-o'-lanterns and of the lantern stakes; every one is open grass or plaza that is not a door, a mat or a path.
const doorJacks = HOUSES.flatMap((h) => [[h.x + h.door - 1, h.y + 4], [h.x + h.door + 1, h.y + 4]]);       // beside each door mat
const TOWN = {
  jack: [...doorJacks, [16, 16], [31, 16], [16, 26], [31, 26], [21, 22], [26, 20], [46, 28], [46, 31]],
  lantern: [[22, 4], [25, 4], [22, 8], [25, 8], [22, 14], [25, 14]],
  patch: [],
};
const FARM = {
  jack: [[25, 6], [32, 6], [10, 29], [12, 29], [24, 15], [1, 16], [1, 19]],
  lantern: [[19, 6], [24, 6], [19, 16], [25, 16]],
  patch: [[24, 29], [35, 19]],                                // the patch covers this tile and the next one
};
const TILES_OF = { town: TOWN, farm: FARM };

/** The walkable-ground tiles that hold a decoration: { jack, lantern, patch } -> [[x, y]] for an area ('town' or 'farm'; others have none). */
export const decorTiles = (area) => TILES_OF[area] || { jack: [], lantern: [], patch: [] };

const cache = new Map();
/**
 * Everything an area wears, in world px: [{ kind: 'jack'|'lantern'|'patch'|'web'|'webR', x (centre), y (feet), lift (px above the feet) }]. Built once.
 * A web hangs in the top corners of a house's wall (the wall stands from 32 to 64 px down the facade, the eave above it).
 */
export function decorOf(area) {
  if (cache.has(area)) return cache.get(area);
  const t = decorTiles(area), out = [];
  for (const [x, y] of t.jack) out.push({ kind: 'jack', x: x * TILE + TILE / 2, y: y * TILE + TILE - 1, lift: 0 });
  for (const [x, y] of t.lantern) out.push({ kind: 'lantern', x: x * TILE + TILE / 2, y: y * TILE + TILE - 1, lift: 0 });
  for (const [x, y] of t.patch) out.push({ kind: 'patch', x: x * TILE + TILE, y: y * TILE + TILE - 1, lift: 0 });
  if (area === 'town') for (const h of HOUSES) {
    const foot = (h.y + 4) * TILE + 1;
    out.push({ kind: 'web', x: h.x * TILE + 6, y: foot, lift: 22 }, { kind: 'webR', x: (h.x + h.w) * TILE - 6, y: foot, lift: 22 });
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  cache.set(area, out);
  return out;
}
