import test from 'node:test';
import assert from 'node:assert/strict';
import { decorOf, decorTiles } from '../src/christmas.js';
import { activeSeasons } from '../src/seasons.js';
import { zonedToMs } from '../src/admin-time.js';
import { getArea, tileAt, TILE, HOUSES } from '../src/map.js';

const at = (date, time) => zonedToMs(date, time);
const on = (d, t = '12:00') => [...activeSeasons(at(d, t))];

test('Christmas is on from Nov 2 00:00 to Jan 2 00:00 America/Santiago, over the new year', () => {
  assert.deepEqual(on('2026-11-01', '23:59'), ['halloween']);
  assert.deepEqual(on('2026-11-02', '00:00'), ['christmas']);
  assert.deepEqual(on('2026-12-24'), ['christmas']);
  assert.deepEqual(on('2027-01-01', '23:59'), ['christmas']);
  assert.deepEqual(on('2027-01-02', '00:00'), []);
  assert.deepEqual(on('2027-06-15'), []);
});

test('christmas decor: deterministic, inside the area and on open ground (never a door, a mat, a path or a solid tile)', () => {
  for (const name of ['town', 'farm']) {
    const a = getArea(name), t = decorTiles(name);
    for (const kind of ['tree', 'minitree', 'gift', 'cane']) for (const [x, y] of t[kind]) {
      assert.ok(x >= 0 && y >= 0 && x < a.w && y < a.h, `${name} ${kind} ${x},${y} out of the area`);
      assert.ok('.,+'.includes(tileAt(x, y, name)), `${name} ${kind} ${x},${y} is on '${tileAt(x, y, name)}'`);
    }
    for (const [x, y] of t.tree) assert.ok('.,+'.includes(tileAt(x + 1, y, name)), `${name} tree ${x + 1},${y}`);
    const d = decorOf(name);
    assert.deepEqual(decorOf(name), d);
    for (const it of d) assert.ok(it.x >= 0 && it.x <= a.w * TILE && it.y >= 0 && it.y <= a.h * TILE, `${name} ${it.kind} ${it.x},${it.y}`);
  }
  assert.ok(decorOf('farm').length > 8);
  assert.deepEqual(decorOf('shop'), []);
  const town = decorOf('town');
  assert.equal(town.filter((d) => d.kind === 'tree').length, 1, 'one big tree');
  assert.equal(town.filter((d) => d.kind === 'lights').length, HOUSES.length, 'a string of lights on every house');
  assert.equal(town.filter((d) => d.kind === 'wreath').length, HOUSES.length, 'a wreath on every door');
  assert.ok(town.some((d) => d.kind === 'gift') && town.some((d) => d.kind === 'cane') && town.some((d) => d.kind === 'minitree'));
});

test('the tree stands in the plaza and nothing sits on a pet spawn or a door tile', async () => {
  const { PLAZA, inPlaza, SPAWNS, DOORS } = await import('../src/map.js');
  const [tx, ty] = decorTiles('town').tree[0];
  assert.ok(inPlaza(tx, ty) && inPlaza(tx + 1, ty));
  const taken = new Set();
  for (const k of ['tree', 'minitree', 'gift', 'cane']) for (const [x, y] of decorTiles('town')[k]) taken.add(`${x},${y}`);
  for (const [x, y] of SPAWNS) assert.ok(!taken.has(`${x},${y}`), `a spawn ${x},${y} is covered`);
  for (const d of DOORS.town) assert.ok(!taken.has(`${d.x},${d.y}`), `a door ${d.x},${d.y} is covered`);
  assert.ok(PLAZA.w > 0);
});
