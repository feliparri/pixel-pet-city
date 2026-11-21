import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, createLoop, STEP_MS } from '../src/arcade/loop.js';
import { createProjection, logicalSize, clampLane } from '../src/arcade/lanes.js';
import { swipeDirection, tapSide, keyAction } from '../src/arcade/input.js';
import { createBestStore, createDailyStars, starsFor, STAR_CAP_PER_DAY } from '../src/arcade/scores.js';
import { reduce, initialFlow, GAMES } from '../src/arcade/flow.js';
import { poseRows, pixelsOf, backArt, BACK_CELL } from '../src/arcade/back-sprites.js';
import { BACK_ART, PALETTE, ELDER_PALETTE } from '../src/arcade/back-art.js';
import { scoreText } from '../src/arcade/hud.js';
import { roadside } from '../src/arcade/scenery.js';

test('advance: whole steps, remainder kept, stalls dropped', () => {
  const a = advance(0, STEP_MS * 2.5); assert.equal(a.steps, 2); assert.ok(Math.abs(a.acc - STEP_MS * 0.5) < 1e-9);
  const r = advance(STEP_MS * 0.5, STEP_MS * 0.5); assert.equal(r.steps, 1);
  assert.equal(advance(0, 10000).steps, 6); assert.equal(advance(0, 10000).acc, 0);
  assert.equal(advance(0, -5).steps, 0);
});

test('createLoop steps and renders with injected timers, and stops cleanly', () => {
  let cb = null, t = 0, steps = 0, renders = 0;
  const loop = createLoop({ step: () => steps++, render: () => renders++, raf: (f) => { cb = f; return 1; }, caf: () => { cb = null; }, now: () => t });
  loop.start();
  t = 50; cb(t);
  assert.equal(steps, 3); assert.equal(renders, 1); assert.ok(cb);
  loop.stop(); assert.equal(cb, null); assert.equal(loop.running, false);
});

test('projection: scale 1 at the player, shrinking to the horizon, rowZ inverts y', () => {
  const p = createProjection({ w: 200, h: 400, horizon: 140, ground: 330, laneW: 50 });
  assert.equal(p.k(0), 1); assert.equal(p.y(0), 330);
  assert.ok(p.k(100) < p.k(10)); assert.ok(p.y(200) > 140 && p.y(200) < p.y(50));
  assert.equal(p.x(0, 40), 100); assert.ok(p.x(1, 0) - p.x(0, 0) === 50 && p.x(1, 100) - p.x(0, 100) < 50);
  for (const z of [0, 10, 80, 200]) assert.ok(Math.abs(p.rowZ(p.y(z)) - z) < 1e-6);
  assert.equal(p.x(0, 0, 0.5), 100 - 25);
  assert.equal(clampLane(5), 1); assert.equal(clampLane(-3), -1);
});

test('logicalSize: whole-number pixels, clamped', () => {
  assert.deepEqual(logicalSize(390, 844), { w: 195, h: 422, px: 2 });
  assert.equal(logicalSize(2000, 900).w, 250); assert.equal(logicalSize(100, 100).w, 160);
  assert.equal(logicalSize(0, 0).w, 195);
});

test('input decisions: swipes, taps, keys', () => {
  assert.equal(swipeDirection(-30, 5), 'left'); assert.equal(swipeDirection(30, -5), 'right');
  assert.equal(swipeDirection(3, -40), 'jump'); assert.equal(swipeDirection(3, 40), 'down'); assert.equal(swipeDirection(5, 5), null);
  assert.equal(tapSide(10, 200), 'left'); assert.equal(tapSide(150, 200), 'right');
  assert.equal(keyAction('ArrowLeft'), 'left'); assert.equal(keyAction('d'), 'right'); assert.equal(keyAction(' '), 'jump');
  assert.equal(keyAction('Escape'), 'pause'); assert.equal(keyAction('x'), null);
});

const memStore = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
test('best store: keeps the best, flags a record only over a real previous best', () => {
  const st = memStore(), b = createBestStore(st);
  assert.deepEqual(b.submit('train', 120), { best: 120, isNew: false });
  assert.deepEqual(b.submit('train', 90), { best: 120, isNew: false });
  assert.deepEqual(b.submit('train', 200), { best: 200, isNew: true });
  assert.equal(createBestStore(st).get('train'), 200);
  assert.equal(b.get('skate'), 0);
});
test('best store: survives a missing or throwing storage and junk values', () => {
  assert.equal(createBestStore(null).submit('train', 5).best, 5);
  const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.equal(createBestStore(bad).submit('train', 7).best, 7);
  assert.equal(createBestStore(memStore({ 'city.arcade.best.train': 'abc' })).get('train'), 0);
});
test('stars: threshold and a daily cap, per local day', () => {
  assert.equal(starsFor(249, 250, 0), 0); assert.equal(starsFor(250, 250, 0), 1); assert.equal(starsFor(900, 250, STAR_CAP_PER_DAY), 0);
  let day = 'a'; const st = memStore(), d = createDailyStars(st, () => day);
  assert.equal(d.earned(), 0); d.award(1); d.award(1); assert.equal(d.earned(), 2);
  assert.equal(createDailyStars(st, () => day).earned(), 2);
  day = 'b'; assert.equal(d.earned(), 0);
});

test('flow: menu -> select -> play -> pause -> play -> over -> again / menu', () => {
  let s = initialFlow();
  assert.equal(reduce(s, { type: 'pick', game: 'train' }), s, 'cannot pick from the title');
  s = reduce(s, { type: 'start' }); assert.equal(s.screen, 'select');
  assert.equal(reduce(s, { type: 'pick', game: 'skate' }).screen, 'play');
  assert.equal(reduce(s, { type: 'pick', game: 'skate' }, [{ id: 'skate', available: false }]), s, 'a game that is not ready cannot be picked');
  assert.equal(reduce(s, { type: 'pick', game: 'nope' }), s);
  s = reduce(s, { type: 'pick', game: 'train' }); assert.equal(s.screen, 'play'); assert.equal(s.game, 'train');
  s = reduce(s, { type: 'pause' }); assert.equal(s.screen, 'pause');
  s = reduce(s, { type: 'resume' }); assert.equal(s.screen, 'play');
  s = reduce(s, { type: 'over', score: 300, best: 300, isNew: true }); assert.deepEqual([s.screen, s.score, s.best, s.isNew], ['over', 300, 300, true]);
  assert.equal(reduce(s, { type: 'again' }).screen, 'play');
  assert.equal(reduce(s, { type: 'menu' }).screen, 'select');
  assert.equal(reduce(reduce(s, { type: 'menu' }), { type: 'title' }).screen, 'menu');
  assert.equal(reduce(s, { type: 'exit' }).exit, true);
  assert.equal(reduce(initialFlow(), { type: 'pause' }).screen, 'menu');
});
test('flow: the two cards exist and both can be played', () => {
  assert.deepEqual(GAMES.map((g) => [g.id, g.available]), [['train', true], ['skate', true]]);
});

test('back art: each pet is a clean 32 x 32 drawing in the board\'s palette indices', () => {
  for (const sp of ['frog', 'seal', 'cat']) {
    const rows = BACK_ART[sp];
    assert.equal(rows.length, BACK_CELL);
    for (const r of rows) { assert.equal(r.length, BACK_CELL); for (const ch of r) assert.ok(ch === '.' || ch in PALETTE[sp], `${sp} char ${ch}`); }
    assert.ok(rows.join('').includes('1'), 'has the outline colour');
    assert.ok(rows[BACK_CELL - 1].replace(/\./g, '').length > 0, 'feet on the last row');
    assert.deepEqual(Object.keys(PALETTE[sp]), Object.keys(ELDER_PALETTE[sp]));
    assert.match(PALETTE[sp][1], /^#[0-9a-f]{6}$/);
  }
  assert.equal(PALETTE.frog[1], '#295d39', 'the board\'s frog outline, as pets.png has it');
});
test('back art: the generator reads the board\'s art and palette formats', async () => {
  const { parseArt, parsePalettes } = await import('../tools/make-back-sprites.mjs');
  assert.deepEqual(parseArt('# 2x2\n.1\n21\n'), ['.1', '21']);
  assert.throws(() => parseArt('# 3x2\n.1\n21\n'));
  const p = parsePalettes('const gfx_palette_t PAL_X = {\n    0,\n    RGB565(0x2E, 0x5E, 0x3E),   /* o */\n};\n');
  assert.deepEqual(p.PAL_X, ['#295d39']);
});
test('back art: elder is the same drawing with the paler palette; unknown pets and stages have none', () => {
  const adult = backArt('cat', 2), elder = backArt('cat', 3), baby = backArt('cat', 0);
  assert.equal(adult.rows, elder.rows); assert.equal(adult.rows, baby.rows); assert.notEqual(adult.palette[3], elder.palette[3]); assert.equal(adult.palette, baby.palette);
  assert.equal(backArt('bear', 2), null); assert.equal(backArt('cat', 9), null);
});
test('poses move the art by whole pixels and stay in the cell', () => {
  const rows = backArt('frog', 2).rows;
  assert.deepEqual(poseRows(rows, 0, 0), rows);
  const p1 = poseRows(rows, 1, 0);
  assert.equal(p1.length, 32); assert.ok(p1.every((r) => r.length === 32));
  assert.equal(p1[0], '.'.repeat(32), 'dropped a pixel');
  assert.equal(p1[20], rows[19], 'lower body only drops');
  assert.notEqual(poseRows(rows, 0, 1)[3], rows[3], 'lean moves the head');
  assert.equal(poseRows(rows, 0, 1)[25], rows[25], 'but not the body');
  assert.equal(pixelsOf(['.o', 'f.'], { o: '#1', f: '#2' }).length, 2);
});

test('score text and roadside are stable', () => {
  assert.equal(scoreText(500), '00500'); assert.equal(scoreText(-3), '00000'); assert.equal(scoreText(1e9), '99999');
  assert.deepEqual(roadside(100, 400), roadside(100, 400));
  assert.ok(roadside(0, 600).some((o) => o.kind === 'station') && roadside(0, 300).some((o) => o.kind === 'pole'));
});
