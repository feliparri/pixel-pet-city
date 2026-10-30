import test from 'node:test';
import assert from 'node:assert/strict';
import { ghostsAt, GHOST_HOMES, ROAM } from '../src/ghosts.js';
import { getArea, tileAt, TILE } from '../src/map.js';

test('ghosts: 4 in the town, 2 in the farm, none indoors', () => {
  assert.equal(ghostsAt('town', 1e12).length, 4);
  assert.equal(ghostsAt('farm', 1e12).length, 2);
  assert.equal(ghostsAt('shop', 1e12).length, 0);
  assert.equal(ghostsAt('town', NaN).length, 0);
});

test('ghosts: the same place for everybody (a pure function of area and time)', () => {
  assert.deepEqual(ghostsAt('town', 1_800_000_123_456, 0.5), ghostsAt('town', 1_800_000_123_456, 0.5));
  assert.notDeepEqual(ghostsAt('town', 1e12).map((g) => g.x), ghostsAt('town', 1e12 + 20_000).map((g) => g.x), 'they drift');
});

test('ghosts: homes are open ground and they stay near home, inside the map', () => {
  for (const [name, homes] of Object.entries(GHOST_HOMES)) {
    const a = getArea(name);
    for (const [x, y] of homes) assert.ok('.,+'.includes(tileAt(x, y, name)), `${name} home ${x},${y} is on '${tileAt(x, y, name)}'`);
    for (let k = 0; k < 400; k++) ghostsAt(name, 1e12 + k * 7919).forEach((g, i) => {
      assert.ok(Math.abs(g.x - (homes[i][0] + 0.5) * TILE) <= (ROAM.x + 0.3) * TILE + 1 && Math.abs(g.y - (homes[i][1] + 0.5) * TILE) <= ROAM.y * TILE + 1);
      assert.ok(g.x > 0 && g.y > 0 && g.x < a.w * TILE && g.y < a.h * TILE);
    });
  }
});

test('ghosts: more visible at night, always translucent', () => {
  const day = ghostsAt('town', 1e12, 0), night = ghostsAt('town', 1e12, 1);
  night.forEach((g, i) => { assert.ok(g.a > day[i].a); assert.ok(g.a <= 1 && day[i].a > 0.2); });
});
