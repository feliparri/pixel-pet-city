import test from 'node:test';
import assert from 'node:assert/strict';
import { halloweenOn, decorOf, decorTiles } from '../src/halloween.js';
import { zonedToMs } from '../src/admin-time.js';
import { getArea, tileAt, TILE } from '../src/map.js';

const at = (date, time) => zonedToMs(date, time);

test('halloweenOn: from Oct 24 00:00 to Nov 1 06:00 America/Santiago', () => {
  assert.equal(halloweenOn(at('2026-10-24', '00:00') - 1), false);
  assert.equal(halloweenOn(at('2026-10-24', '00:00')), true);
  assert.equal(halloweenOn(at('2026-10-31', '23:59')), true);
  assert.equal(halloweenOn(at('2026-11-01', '00:00')), true);          // the show's night
  assert.equal(halloweenOn(at('2026-11-01', '05:59')), true);
  assert.equal(halloweenOn(at('2026-11-01', '06:00')), false);
  assert.equal(halloweenOn(at('2026-11-02', '12:00')), false);
  assert.equal(halloweenOn(at('2026-06-15', '12:00')), false);
});

test('halloweenOn: every year, and the clock edges are Chile time (UTC-3 in that range, so 03:00 UTC)', () => {
  for (const y of [2026, 2027, 2030]) {
    assert.equal(halloweenOn(Date.UTC(y, 9, 24, 3, 0) - 1), false);
    assert.equal(halloweenOn(Date.UTC(y, 9, 24, 3, 0)), true);
    assert.equal(halloweenOn(Date.UTC(y, 10, 1, 9, 0) - 1), true);
    assert.equal(halloweenOn(Date.UTC(y, 10, 1, 9, 0)), false);
  }
  assert.equal(halloweenOn(NaN), false);
  assert.equal(halloweenOn(undefined), false);
});

test('decor: deterministic, inside the area and on open ground (never a door, a mat, a path or a solid tile)', () => {
  for (const name of ['town', 'farm']) {
    const a = getArea(name), t = decorTiles(name);
    for (const kind of ['jack', 'lantern', 'patch']) for (const [x, y] of t[kind]) {
      assert.ok(x >= 0 && y >= 0 && x < a.w && y < a.h, `${name} ${kind} ${x},${y} out of the area`);
      assert.ok('.,+'.includes(tileAt(x, y, name)), `${name} ${kind} ${x},${y} is on '${tileAt(x, y, name)}'`);
    }
    for (const [x, y] of t.patch) assert.ok('.,'.includes(tileAt(x + 1, y, name)), `${name} patch ${x + 1},${y}`);
    const d = decorOf(name);
    assert.deepEqual(decorOf(name), d);
    assert.ok(d.length > 10);
    for (const it of d) assert.ok(it.x >= 0 && it.x <= a.w * TILE && it.y >= 0 && it.y <= a.h * TILE, `${name} ${it.kind} ${it.x},${it.y}`);
  }
  assert.deepEqual(decorOf('shop'), []);
  assert.ok(decorOf('town').some((d) => d.kind === 'web') && decorOf('town').some((d) => d.kind === 'lantern'));
});
