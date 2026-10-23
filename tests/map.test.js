import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID, MAP_W, MAP_H, TILES, SIGNS, SPAWNS, isWalkable, inMap, tileAt } from '../src/map.js';
import { findPath, stepDir } from '../src/path.js';

test('the grid is MAP_W x MAP_H and every char is a known tile', () => {
  assert.equal(GRID.length, MAP_H);
  for (const row of GRID) {
    assert.equal(row.length, MAP_W);
    for (const ch of row) assert.ok(TILES[ch], `unknown tile ${ch}`);
  }
});

test('collisions: the border, trees, water, fences, walls and signs are solid; paths and the plaza are not', () => {
  assert.equal(isWalkable(0, 0), false);
  assert.equal(isWalkable(15, 1), true);
  assert.equal(isWalkable(14, 13), false);      // fountain
  assert.equal(isWalkable(10, 11), true);       // plaza corner
  assert.equal(isWalkable(22, 5), false);       // shop door
  assert.equal(isWalkable(7, 10), false);       // park gate
  assert.equal(isWalkable(5, 5), false);        // park pond
  for (const s of SIGNS) assert.equal(tileAt(s.x, s.y), 'S');
});

test('outside the map nothing is walkable and nothing throws', () => {
  for (const [x, y] of [[-1, 0], [0, -1], [MAP_W, 3], [3, MAP_H], [1.5, 2], [NaN, 1], ['1', 1], [undefined, 1]]) {
    assert.equal(inMap(x, y), false);
    assert.equal(isWalkable(x, y), false);
  }
});

test('spawns are walkable and every walkable tile outside the park is reachable from the first spawn', () => {
  for (const [x, y] of SPAWNS) assert.ok(isWalkable(x, y), `${x},${y}`);
  const [sx, sy] = SPAWNS[0];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!isWalkable(x, y)) continue;
    assert.ok(x === sx && y === sy || findPath(sx, sy, x, y).length > 0, `unreachable ${x},${y}`);
  }
});

test('findPath: shortest, 4-connected, every step walkable, ends on the target', () => {
  const p = findPath(12, 17, 16, 2);
  assert.ok(p.length >= 4 + 15);
  let [cx, cy] = [12, 17];
  for (const [x, y] of p) {
    assert.equal(Math.abs(x - cx) + Math.abs(y - cy), 1);
    assert.ok(isWalkable(x, y));
    [cx, cy] = [x, y];
  }
  assert.deepEqual([cx, cy], [16, 2]);
});

test('findPath: manhattan length on open ground, around the fountain otherwise', () => {
  assert.equal(findPath(10, 12, 15, 12).length, 5);
  assert.equal(findPath(13, 14, 18, 14).length, 5 + 4);   // 4 extra: up and down around the 3-row fountain
});

test('findPath: empty for the same tile, solid or out-of-map targets and the closed park', () => {
  assert.deepEqual(findPath(12, 17, 12, 17), []);
  assert.deepEqual(findPath(12, 17, 14, 13), []);
  assert.deepEqual(findPath(12, 17, -1, 3), []);
  assert.deepEqual(findPath(12, 17, 5, 7), []);           // inside the fence
  assert.deepEqual(findPath(0, 0, 12, 17), []);           // starting inside a tree
});

test('stepDir', () => {
  assert.equal(stepDir(1, 1, 2, 1), 'right');
  assert.equal(stepDir(1, 1, 0, 1), 'left');
  assert.equal(stepDir(1, 1, 1, 0), 'up');
  assert.equal(stepDir(1, 1, 1, 2), 'down');
});
