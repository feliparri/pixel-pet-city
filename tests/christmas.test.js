import test from 'node:test';
import assert from 'node:assert/strict';
import { decorOf, decorTiles, PARK_STRINGS } from '../src/christmas.js';
import { activeSeasons } from '../src/seasons.js';
import { zonedToMs } from '../src/admin-time.js';
import { getArea, tileAt, isWalkable, TILE, HOUSES, PARQUE, GAME_PLACES, PITCH, TRACK, PEN, DOORS, SPAWNS, spotAt, doorAt } from '../src/map.js';

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
    for (const kind of ['tree', 'minitree', 'gift', 'cane', 'snowman']) for (const [x, y] of t[kind]) {
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
  assert.equal(town.filter((d) => d.kind === 'lights' && !d.park).length, HOUSES.length, 'a string of lights on every house');
  assert.equal(town.filter((d) => d.kind === 'wreath' && !d.park).length, HOUSES.length, 'a wreath on every door');
  assert.ok(town.some((d) => d.kind === 'gift') && town.some((d) => d.kind === 'cane') && town.some((d) => d.kind === 'minitree'));
});

test('the tree stands in the plaza and nothing sits on a pet spawn or a door tile', async () => {
  const { PLAZA, inPlaza, SPAWNS, DOORS } = await import('../src/map.js');
  const [tx, ty] = decorTiles('town').tree[0];
  assert.ok(inPlaza(tx, ty) && inPlaza(tx + 1, ty));
  const taken = new Set();
  for (const k of ['tree', 'minitree', 'gift', 'cane', 'snowman']) for (const [x, y] of decorTiles('town')[k]) taken.add(`${x},${y}`);
  for (const [x, y] of SPAWNS) assert.ok(!taken.has(`${x},${y}`), `a spawn ${x},${y} is covered`);
  for (const d of DOORS.town) assert.ok(!taken.has(`${d.x},${d.y}`), `a door ${d.x},${d.y} is covered`);
  assert.ok(PLAZA.w > 0);
});

// ---- the Parque ----------------------------------------------------------------------------------------------------------------------

const inRect = (r, x, y, pad = 0) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;
const parque = ['minitree', 'gift', 'cane', 'snowman'].flatMap((kind) => decorTiles('town')[kind].filter(([x, y]) => inRect(PARQUE, x, y)).map(([x, y]) => ({ kind, x, y })));

test('the Parque is decorated: trees round the pond, a snowman, canes with strings of lights, a gift pile by each pad and a wreath on each game sign', () => {
  const by = (k) => parque.filter((d) => d.kind === k);
  assert.ok(by('minitree').length >= 4 && by('cane').length >= 6 && by('gift').length === Object.keys(GAME_PLACES).length && by('snowman').length === 1);
  const d = decorOf('town');
  assert.equal(d.filter((x) => x.kind === 'lights' && x.park).length, PARK_STRINGS.length);
  const wreaths = d.filter((x) => x.kind === 'wreath' && x.park);
  assert.equal(wreaths.length, Object.keys(GAME_PLACES).length);
  for (const g of Object.values(GAME_PLACES)) assert.ok(wreaths.some((w) => w.x === g.sign[0] * TILE + TILE / 2 && w.y === g.sign[1] * TILE + TILE - 1), `a wreath on the ${g.name} sign`);
  for (const [a, b, y] of PARK_STRINGS) for (const x of [a, b]) assert.ok(by('cane').some((c) => c.x === x && c.y === y), `a cane holds the string at ${x},${y}`);
});

test('the Parque decorations stand on open ground: not a pad, a door, a spawn, the pen, the pitch or the track, and no two share a tile', () => {
  const seen = new Set();
  for (const { kind, x, y } of parque) {
    const at = `${kind} ${x},${y}`;
    assert.ok(isWalkable(x, y, 'town') && '.,'.includes(tileAt(x, y, 'town')), `${at} is on '${tileAt(x, y, 'town')}'`);
    assert.equal(spotAt(x, y), null, `${at} is on a pad`);
    assert.equal(doorAt(x, y, 'town'), null, `${at} is on a door`);
    assert.ok(!SPAWNS.some(([sx, sy]) => sx === x && sy === y), `${at} is on a spawn`);
    assert.ok(!inRect(PEN, x, y), `${at} is in the pen`);
    assert.ok(!inRect(PITCH, x, y, 1), `${at} is on the pitch`);
    assert.ok(!(x >= TRACK.x0 - 1 && x <= TRACK.x1 + 1 && y >= TRACK.yTop - 1 && y <= TRACK.yBottom), `${at} is on the track`);
    assert.ok(!seen.has(`${x},${y}`), `${at} shares its tile`);
    seen.add(`${x},${y}`);
  }
  assert.ok(DOORS.town.length > 0);
});

test('each game pad has a gift pile beside it, one or two tiles away', () => {
  for (const [id, g] of Object.entries(GAME_PLACES)) {
    const [px, py] = g.spot[0];
    assert.ok(parque.some((d) => d.kind === 'gift' && Math.max(Math.abs(d.x - px), Math.abs(d.y - py)) <= 2), `a gift beside the ${id} pad`);
  }
});

test('the lit Parque decorations are lit like the rest (trees and canes have a lit twin and a glow)', async () => {
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) };
  try {
    const { christmasDecor } = await import('../src/art/christmas.js');
    const list = christmasDecor('town');
    for (const d of list.filter((x) => x.kind === 'minitree' || x.kind === 'cane')) assert.ok(d.lit && d.glows.length, `${d.id} glows`);
    assert.ok(list.some((d) => d.kind === 'snowman' && d.sprite.width === 20 && d.sprite.height === 32));
    assert.ok(list.glows.length > 20);
  } finally { delete globalThis.document; }
});
