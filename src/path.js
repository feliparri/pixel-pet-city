// Grid pathfinding: breadth-first search over 4-neighbour tiles, so every step costs the same and the shortest path is found.
import { getArea, isWalkable, DEFAULT_AREA } from './map.js';

const DIRS = [[0, -1, 'up'], [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left']];
export const DIR_NAMES = DIRS.map((d) => d[2]);
export const dirVector = (name) => { const d = DIRS.find((e) => e[2] === name); return d ? [d[0], d[1]] : [0, 0]; };

/** Tiles to walk from (sx, sy) to (tx, ty), excluding the start; [] when already there or no way.
 * `where` is an area name (default the town) or, for tests, a walkable(x, y) function over the town's dimensions. */
export function findPath(sx, sy, tx, ty, where = DEFAULT_AREA) {
  const area = getArea(typeof where === 'string' ? where : DEFAULT_AREA);
  const MAP_W = area.w, MAP_H = area.h;
  const walkable = typeof where === 'function' ? where : (x, y) => isWalkable(x, y, area.name);
  if (!walkable(sx, sy) || !walkable(tx, ty)) return [];
  if (sx === tx && sy === ty) return [];
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const start = sy * MAP_W + sx;
  const goal = ty * MAP_W + tx;
  prev[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || !walkable(nx, ny)) continue;
      const n = ny * MAP_W + nx;
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (prev[goal] === -1) return [];
  const out = [];
  for (let c = goal; c !== start; c = prev[c]) out.push([c % MAP_W, (c / MAP_W) | 0]);
  return out.reverse();
}

/** The direction name of one step. */
export function stepDir(fx, fy, tx, ty) {
  if (tx > fx) return 'right';
  if (tx < fx) return 'left';
  if (ty < fy) return 'up';
  return 'down';
}
