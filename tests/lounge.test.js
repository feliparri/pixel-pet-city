import test from 'node:test';
import assert from 'node:assert/strict';
import { isLounger, isRestSpot, restLift, lying, loungeAt, LOUNGER, TOWEL, LIE_LIFT, RECLINE_LIFT } from '../src/lounge.js';
import { reclinePlace, breath, LEAN, SLOUCH } from '../src/art/recline.js';
import { BOARD_HALF } from '../src/sea-draw.js';
import { AREAS, TILES, isWalkable, isLand, tileAt } from '../src/map.js';
import { Walker } from '../src/walker.js';
import { findPath } from '../src/path.js';
import { validateMessage } from '../src/protocol.js';
import { paceFactor, BOARD_PACE } from '../src/sea.js';
import { groundOf } from '../src/pet-sounds.js';
import { readFileSync } from 'node:fs';

const spots = [];
for (let y = 0; y < AREAS.beach.h; y++) for (let x = 0; x < AREAS.beach.w; x++) if (isLounger(x, y)) spots.push([x, y]);

test('the beach has a few loungers on open sand, walkable, and none anywhere else', () => {
  assert.ok(spots.length >= 4 && spots.length <= 10, `${spots.length} loungers`);
  assert.equal(TILES[LOUNGER].solid, false);
  for (const [x, y] of spots) { assert.ok(isLand(x, y, 'beach')); assert.equal(groundOf('beach', x, y), 'sand'); }
  for (const name of ['town', 'farm']) for (let y = 0; y < AREAS[name].h; y++) for (let x = 0; x < AREAS[name].w; x++) assert.equal(tileAt(x, y, name) === LOUNGER, false);
  assert.ok(findPath(46, 17, spots[0][0], spots[0][1], 'beach').length > 0, 'reachable');
});

const towels = [];
for (let y = 0; y < AREAS.beach.h; y++) for (let x = 0; x < AREAS.beach.w; x++) if (tileAt(x, y, 'beach') === TOWEL) towels.push([x, y]);

test('towels are resting spots too: open sand, walkable, in the ground rule of a lounger but at ground level', () => {
  assert.ok(towels.length >= 4);
  assert.equal(TILES[TOWEL].solid, false);
  for (const [x, y] of towels) { assert.ok(isRestSpot(x, y) && !isLounger(x, y) && isLand(x, y, 'beach')); assert.equal(restLift(x, y), 0); }
  for (const [x, y] of spots) { assert.ok(isRestSpot(x, y)); assert.equal(restLift(x, y), RECLINE_LIFT); }
  assert.equal(isRestSpot(46, 17), false);
});

test('the prompt: Recostarse on or beside a lounger or a towel, Levantarse while lying, nothing elsewhere or outside the beach', () => {
  for (const [lx, ly] of [spots[0], towels[0]]) {
    const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [lx + dx, ly + dy]).find(([x, y]) => isWalkable(x, y, 'beach') && !isRestSpot(x, y));
    const a = loungeAt(beside[0], beside[1]);
    assert.deepEqual([a.id, a.label], ['lounge', 'Recostarse']);
    assert.ok(isRestSpot(a.target[0], a.target[1]));
    const on = loungeAt(lx, ly);
    assert.deepEqual([on.id, on.label, on.target], ['lounge', 'Recostarse', [lx, ly]], 'on the spot, not lying: the prompt to lie down');
    const up = loungeAt(lx, ly, 'beach', true);
    assert.deepEqual([up.id, up.label], ['getup', 'Levantarse']);
    assert.equal(loungeAt(beside[0], beside[1], 'town'), null);
  }
  assert.equal(loungeAt(46, 17), null);
});

test('lying is a choice: standing still on a spot is not lying; with the flag it lies, any step gets it up; remote pets the same, from the flag', () => {
  const [lx, ly] = spots[0], [tx, ty] = towels[0];
  const w = new Walker(lx - 1, ly);
  w.stepToward(lx, ly);
  w.update(1000);
  assert.equal(lying('beach', w, 0), false, 'still on the lounger, no choice made');
  assert.equal(lying('beach', w, undefined), false);
  assert.equal(lying('beach', w, 1), true, 'it chose to');
  w.stepToward(lx, ly - 1);
  assert.equal(lying('beach', w, 1), false, 'a move gets it up');
  w.update(1000);
  assert.equal(lying('beach', w, 1), false, 'and the flag does nothing off a spot');
  const onTowel = new Walker(tx, ty);
  assert.equal(lying('beach', onTowel, 0), false);
  assert.equal(lying('beach', onTowel, 1), true);
  assert.equal(lying('town', onTowel, 1), false);
  const remote = new Walker(lx, ly); remote.hurry = true;
  assert.equal(lying('beach', remote, 0), false, 'a remote pet standing on a lounger is not lying until it says so');
  assert.equal(lying('beach', remote, 1), true);
  assert.equal(validateMessage({ t: 'pos', id: 'abcdefgh', x: lx, y: ly, d: 'down', area: 'beach' }).x, lx, 'a pet on a lounger is a valid position');
});

test('pos carries an optional rest flag: only 1 is kept, unknown values are dropped, an old reader sees a normal pos', () => {
  const id = 'abcdefgh', [lx, ly] = spots[0];
  const pos = (extra) => validateMessage({ t: 'pos', id, x: lx, y: ly, d: 'down', area: 'beach', ...extra });
  assert.equal(pos({ rest: 1 }).rest, 1);
  for (const bad of [0, 2, '1', true, null, {}, -1]) assert.equal('rest' in pos({ rest: bad }), false, String(bad));
  assert.equal('rest' in pos({}), false);
  assert.deepEqual(pos({ rest: 1, surf: 3 }).surf, 3, 'the two optional fields are independent');
  const hello = validateMessage({ t: 'hello', id, name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] }, x: lx, y: ly, d: 'down', area: 'beach', rest: 1 }, {});
  assert.equal(hello.pos.rest, 1, 'the heartbeat keeps a resting pet resting');
});

test('with a board, paddling in deep water is quicker than swimming for every species, and nothing changes elsewhere', () => {
  for (const sp of ['frog', 'cat', 'seal']) {
    const swim = paceFactor('beach', 10, 10, sp), paddle = paceFactor('beach', 10, 10, sp, true);
    assert.ok(Math.abs(paddle - swim * BOARD_PACE) < 1e-12 && paddle < swim, sp);
    assert.equal(paceFactor('beach', 40, 10, sp, true), 1);
    assert.equal(paceFactor('town', 10, 10, sp, true), 1);
  }
  assert.ok(BOARD_PACE < 1 && BOARD_PACE > 0.5, 'a bit faster, not a rocket');
});

test('the tall palms and the big umbrellas: palms 1.6 to 2 times the old height (48), umbrellas 1.5 times the old size (24 x 32); the lounger sprite exists', () => {
  const src = readFileSync(new URL('../src/art/beach.js', import.meta.url), 'utf8');
  const size = (name) => src.match(new RegExp(`export function ${name}\\([^)]*\\) \\{\\s*const c = canvas\\((\\d+), (\\d+)\\)`)).slice(1).map(Number);
  const [pw, ph] = size('palm'), [uw, uh] = size('umbrella');
  assert.ok(ph / 48 >= 1.6 && ph / 48 <= 2, `palm ${pw} x ${ph}`);
  assert.deepEqual([uw / 24, uh / 32], [1.5, 1.5]);
  assert.deepEqual(size('lounger'), [32, 26]);
  const bake = readFileSync(new URL('../src/art/bake.js', import.meta.url), 'utf8');
  assert.ok(bake.includes(`y: y + 16 - ${ph}`) && bake.includes(`y: y + 16 - ${uh}`), 'the props stand on their tile with the new heights');
});

test('a resting pet (on a lounger or a towel) is drawn as the board draws a sleeping pet (ported from the device), in both renderers', () => {
  assert.ok(LIE_LIFT > 0 && LIE_LIFT <= 6);
  for (const f of ['../src/hd2d/pets.js', '../src/render.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(src.includes('lieScale') && src.includes('zzzAt') && src.includes('restLift') && src.includes("lie ? 'blink'"), f);
    assert.equal(src.includes('rotate(flip'), false, 'no turned sprite any more');
  }
});

test('the sunbathing pose: the body leans back row by row and slouches, the feet stay put, and the breath is slow and small', () => {
  const fy = 30;
  assert.deepEqual(reclinePlace(fy, fy), { y: fy, dx: 0 }, 'the feet do not move');
  let prevDx = 0, prevY = fy + 1;
  for (let y = fy; y >= 0; y--) { const p = reclinePlace(y, fy); assert.ok(p.dx >= prevDx && p.y <= prevY, `row ${y}`); prevDx = p.dx; prevY = p.y; }
  assert.equal(reclinePlace(0, fy).dx, Math.round(fy * LEAN));
  assert.ok(reclinePlace(0, fy).y > 0 && reclinePlace(0, fy).y === Math.round(fy * (1 - SLOUCH)), 'shorter than standing');
  assert.ok(LEAN > 0.3 && LEAN < 0.6);
  for (let t = 0; t < 9000; t += 100) assert.ok(breath(t) >= 0.97 - 1e-9 && breath(t) <= 1 + 1e-9);
  assert.equal(breath(0), 1);
});

test('a deck chair is a sunbathing spot, a towel keeps the sleeping pose; both renderers choose by the tile and the sunbathing has no Zzz', () => {
  for (const f of ['../src/hd2d/pets.js', '../src/render.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(src.includes('reclineSprite') && src.includes('isLounger(e.walker.tx') && src.includes('lie && !rec'), f);
  }
  const rec = readFileSync(new URL('../src/art/recline.js', import.meta.url), 'utf8');
  assert.equal(/zzz/i.test(rec.replace(/Zzz\)\./, '')) && rec.includes('zzzAt'), false);
  assert.ok(rec.includes('look.items[0]'), 'a hat takes the place of the sunglasses');
});

test('the longboard is 1.6 to 2 times the old 26 px, in the water, in the icon and for the wipeout', () => {
  assert.ok((BOARD_HALF * 2) / 26 >= 1.6 && (BOARD_HALF * 2) / 26 <= 2, `${BOARD_HALF * 2} px`);
  const pets = readFileSync(new URL('../src/hd2d/pets.js', import.meta.url), 'utf8');
  assert.ok(pets.includes('cx + 26 * s'), 'the floating board is further from the pet');
});
