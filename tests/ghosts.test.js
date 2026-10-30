import test from 'node:test';
import assert from 'node:assert/strict';
import { ghostsAt, GHOST_ZONES } from '../src/ghosts.js';
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

test('ghosts: all the zones are open ground and every ghost, all day long, hovers over open walkable tiles of its area (never a building, a tree or water)', () => {
  const open = (x, y, name) => '.,+'.includes(tileAt(Math.floor(x / TILE), Math.floor(y / TILE), name));
  for (const [name, zones] of Object.entries(GHOST_ZONES)) {
    for (const z of zones) for (let j = 0; j < z.h; j++) for (let i = 0; i < z.w; i++) assert.ok('.,+'.includes(tileAt(z.x + i, z.y + j, name)), `${name} zone tile ${z.x + i},${z.y + j} is '${tileAt(z.x + i, z.y + j, name)}'`);
    const a = getArea(name);
    for (let ms = 1e12; ms < 1e12 + 86_400_000; ms += 20_000) ghostsAt(name, ms).forEach((g) => {
      for (const [dx, dy] of [[0, 0], [-8, 0], [8, 0], [0, -8], [0, 8]]) assert.ok(open(g.x + dx, g.y + dy, name), `${name} ghost at ${g.x},${g.y} (${dx},${dy})`);
      assert.ok(g.x > 0 && g.y > 0 && g.x < a.w * TILE && g.y < a.h * TILE);
    });
  }
});

test('ghosts: they actually wander across their zone', () => {
  const xs = []; for (let ms = 1e12; ms < 1e12 + 86_400_000; ms += 20_000) xs.push(ghostsAt('town', ms)[0].x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 3 * TILE);
});

test('ghosts: more visible at night, always translucent', () => {
  const day = ghostsAt('town', 1e12, 0), night = ghostsAt('town', 1e12, 1);
  night.forEach((g, i) => { assert.ok(g.a > day[i].a); assert.ok(g.a <= 1 && day[i].a > 0.2); });
});
