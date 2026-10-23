import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, AREA_NAMES, TILES, SIGNS, SPAWNS, ENTRY, HOUSES, DOORS, isWalkable, inMap, tileAt, doorAt, getArea, TILE } from '../src/map.js';
import { findPath, stepDir } from '../src/path.js';

test('every area is a rectangle of known tiles', () => {
  for (const name of AREA_NAMES) {
    const a = AREAS[name];
    assert.equal(a.grid.length, a.h);
    for (const row of a.grid) {
      assert.equal(row.length, a.w, `${name} row width`);
      for (const ch of row) assert.ok(TILES[ch], `unknown tile ${ch} in ${name}`);
    }
  }
  assert.ok(AREAS.town.w * TILE > 224 && AREAS.town.h * TILE > 288, 'the town is bigger than one screen');
});

test('town collisions: border trees, houses, fountain, pond, hedge, fences, lamps and signs are solid; roads and the plaza are not', () => {
  assert.equal(isWalkable(0, 0), false);
  assert.equal(isWalkable(23, 2), true);               // main road
  assert.equal(isWalkable(16, 20), true);              // plaza
  for (const [x, y] of [[23, 21], [6, 7], [6, 9], [7, 33], [11, 18], [34, 15], [17, 16], [21, 17], [36, 17]]) assert.equal(isWalkable(x, y), false, `${x},${y}`);
  for (const s of SIGNS.filter((e) => e.area === 'town')) assert.equal(tileAt(s.x, s.y), 'S');
  assert.equal(isWalkable(10, 21), true);              // grass
});

test('the bushes are walkable hiding spots (for hide and seek) and there are enough of them', () => {
  let n = 0;
  for (let y = 0; y < AREAS.town.h; y++) for (let x = 0; x < AREAS.town.w; x++) if (TILES[tileAt(x, y)].hide) { n++; assert.ok(isWalkable(x, y)); }
  assert.ok(n >= 12, `bushes: ${n}`);
});

test('houses: roof and wall are solid, the enterable door is the only open tile, and the doormat is in front of every door', () => {
  for (const h of HOUSES) {
    for (let j = 0; j < 4; j++) for (let i = 0; i < h.w; i++) {
      const open = h.enter && i === h.door && j === 3;
      assert.equal(isWalkable(h.x + i, h.y + j), !!open, `${h.x + i},${h.y + j}`);
    }
    assert.equal(tileAt(h.x + h.door, h.y + 4), 'm');
  }
});

test('outside an area nothing is walkable and nothing throws', () => {
  for (const [x, y] of [[-1, 0], [0, -1], [48, 3], [3, 44], [1.5, 2], [NaN, 1], ['1', 1], [undefined, 1]]) {
    assert.equal(inMap(x, y), false);
    assert.equal(isWalkable(x, y), false);
  }
  assert.equal(isWalkable(1, 1, 'nowhere'), false);
  assert.equal(isWalkable(14, 3, 'shop'), false);
  assert.equal(getArea('nowhere').name, 'town');
});

function reachable(area, from) {
  const a = AREAS[area], seen = new Set([from.join(',')]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const n = [x + dx, y + dy];
      if (isWalkable(n[0], n[1], area) && !seen.has(n.join(','))) { seen.add(n.join(',')); queue.push(n); }
    }
  }
  return { a, seen };
}

test('spawns are walkable and every walkable tile of the town is reachable from the first one', () => {
  for (const [x, y] of SPAWNS) assert.ok(isWalkable(x, y), `${x},${y}`);
  const { a, seen } = reachable('town', SPAWNS[0]);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (isWalkable(x, y)) assert.ok(seen.has(`${x},${y}`), `unreachable ${x},${y}`);
});

test('the shop: everything walkable is reachable from the entry and the counter, tables and shelves block', () => {
  for (const [x, y] of ENTRY.shop) assert.ok(isWalkable(x, y, 'shop'));
  const { a, seen } = reachable('shop', ENTRY.shop[0]);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (isWalkable(x, y, 'shop')) assert.ok(seen.has(`${x},${y}`), `unreachable ${x},${y}`);
  for (const [x, y] of [[5, 4], [8, 4], [6, 3], [2, 6], [11, 7], [1, 2], [10, 9], [0, 5], [6, 1]]) assert.equal(isWalkable(x, y, 'shop'), false, `${x},${y}`);
  assert.equal(isWalkable(7, 4, 'shop'), false);
  assert.equal(isWalkable(7, 5, 'shop'), true);
});

test('doors lead to walkable tiles of the other area, and both ends agree', () => {
  for (const [area, list] of Object.entries(DOORS)) for (const d of list) {
    assert.ok(isWalkable(d.x, d.y, area), `${area} door ${d.x},${d.y}`);
    assert.equal(doorAt(d.x, d.y, area), d);
    assert.ok(isWalkable(d.to.x, d.to.y, d.to.area), `lands on ${d.to.area} ${d.to.x},${d.to.y}`);
    assert.equal(doorAt(d.to.x, d.to.y, d.to.area), null, 'landing on a door would bounce back');
  }
  const shop = HOUSES.find((h) => h.enter === 'shop');
  assert.deepEqual([DOORS.town[0].x, DOORS.town[0].y], [shop.x + shop.door, shop.y + 3]);
  assert.equal(doorAt(1, 1), null);
});

test('findPath: shortest, 4-connected, every step walkable, ends on the target', () => {
  const p = findPath(19, 24, 24, 2);
  assert.ok(p.length >= 5 + 22);
  let [cx, cy] = [19, 24];
  for (const [x, y] of p) {
    assert.equal(Math.abs(x - cx) + Math.abs(y - cy), 1);
    assert.ok(isWalkable(x, y));
    [cx, cy] = [x, y];
  }
  assert.deepEqual([cx, cy], [24, 2]);
});

test('findPath works inside the shop and can walk out of its door', () => {
  const p = findPath(6, 10, 7, 5, 'shop');
  assert.equal(p.length, 6);
  assert.deepEqual(findPath(6, 10, 6, 11, 'shop'), [[6, 11]]);
  assert.deepEqual(findPath(6, 10, 5, 4, 'shop'), []);              // the counter
});

test('findPath: manhattan length on open ground, around the fountain otherwise', () => {
  assert.equal(findPath(18, 24, 24, 24).length, 6);
  assert.equal(findPath(21, 21, 26, 21).length, 5 + 4);   // 4 extra: up and down around the 3-row fountain
});

test('findPath: empty for the same tile, solid or out-of-map targets', () => {
  assert.deepEqual(findPath(19, 24, 19, 24), []);
  assert.deepEqual(findPath(19, 24, 23, 21), []);         // the fountain
  assert.deepEqual(findPath(19, 24, -1, 3), []);
  assert.deepEqual(findPath(0, 0, 19, 24), []);           // starting inside a tree
});

test('stepDir', () => {
  assert.equal(stepDir(1, 1, 2, 1), 'right');
  assert.equal(stepDir(1, 1, 0, 1), 'left');
  assert.equal(stepDir(1, 1, 1, 0), 'up');
  assert.equal(stepDir(1, 1, 1, 2), 'down');
});
