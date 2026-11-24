import test from 'node:test';
import assert from 'node:assert/strict';
import { isLounger, lying, loungeAt, LOUNGER, LIE_SAY, LIE_LIFT } from '../src/lounge.js';
import { SLEEP_LINE } from '../src/npcs.js';
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

test('the prompt: Recostarse beside a lounger, not on it, not elsewhere, not outside the beach', () => {
  const [lx, ly] = spots[0];
  const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [lx + dx, ly + dy]).find(([x, y]) => isWalkable(x, y, 'beach') && !isLounger(x, y));
  const a = loungeAt(beside[0], beside[1]);
  assert.deepEqual([a.id, a.label], ['lounge', 'Recostarse']);
  assert.ok(isLounger(a.target[0], a.target[1]));
  assert.equal(loungeAt(lx, ly), null, 'already on it');
  assert.equal(loungeAt(46, 17), null);
  assert.equal(loungeAt(beside[0], beside[1], 'town'), null);
});

test('lying comes from the tile and the walker: still on a lounger lies, any step gets it up; remote pets the same', () => {
  const [lx, ly] = spots[0];
  const w = new Walker(lx - 1, ly);
  assert.equal(lying('beach', w), false);
  w.stepToward(lx, ly);
  assert.equal(lying('beach', w), false, 'still walking onto it');
  w.update(1000);
  assert.equal(lying('beach', w), true, 'arrived and stands still');
  w.stepToward(lx, ly - 1);
  assert.equal(lying('beach', w), false, 'a move gets it up');
  w.update(1000);
  assert.equal(lying('beach', w), false, 'and it is not lying on the sand');
  const remote = new Walker(lx, ly); remote.hurry = true;
  assert.equal(lying('beach', remote), true);
  assert.equal(lying('town', remote), false);
  assert.equal(validateMessage({ t: 'pos', id: 'abcdefgh', x: lx, y: ly, d: 'down', area: 'beach' }).x, lx, 'a pet on a lounger is a valid position');
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
  assert.deepEqual(size('lounger'), [28, 18]);
  const bake = readFileSync(new URL('../src/art/bake.js', import.meta.url), 'utf8');
  assert.ok(bake.includes(`y: y + 16 - ${ph}`) && bake.includes(`y: y + 16 - ${uh}`), 'the props stand on their tile with the new heights');
});

test('a pet on a lounger uses the sleeping drawing of the game: the same Zzz line as a sleeping villager, the eyes shut, resting on the seat, in both renderers', () => {
  assert.equal(LIE_SAY, SLEEP_LINE);
  assert.ok(LIE_LIFT > 0 && LIE_LIFT <= 6);
  for (const f of ['../src/hd2d/pets.js', '../src/render.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(src.includes('LIE_SAY') && src.includes('LIE_LIFT') && src.includes("lie ? 'blink'"), f);
    assert.equal(src.includes('rotate(flip'), false, 'no turned sprite any more');
  }
});
