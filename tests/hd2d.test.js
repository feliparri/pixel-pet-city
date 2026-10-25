import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCamera, cameraFor, MAX_REACH, snapScale, snapFocus, visibleTiles, project, unproject, groundRow, depthOf, billboardScale, standAt, tileToScreen, screenToTile, sortBackToFront, TILE } from '../src/hd2d/camera.js';
import { falloff, lightAt, nightMultiply, spriteGrade, approach, LAMP_RADIUS } from '../src/hd2d/light.js';
import { Wanderer, rng } from '../src/hd2d/wander.js';
import { isWalkable } from '../src/map.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const cam = (extra = {}) => makeCamera({ focusX: 400, focusY: 320, pitch: 40, dist: 330, focal: 1000, cx: 640, cy: 380, ...extra });

test('the focus point lands on the screen centre, at the focus depth', () => {
  const c = cam(), p = project(c, 400, 320);
  near(p.x, 640); near(p.y, 380); near(p.depth, 330); near(p.scale, 1000 / 330);
});

test('ground projection and its inverse agree (tile -> screen -> tile, and points off the focus)', () => {
  const c = cam();
  for (const [x, y] of [[400, 320], [300, 250], [520, 400], [180, 90], [650, 470]]) {
    const p = project(c, x, y), w = unproject(c, p.x, p.y);
    near(w.x, x, 1e-6); near(w.y, y, 1e-6);
  }
  for (const [tx, ty] of [[24, 20], [17, 16], [30, 26], [10, 9]]) {
    const s = tileToScreen(c, tx, ty);
    assert.deepEqual(screenToTile(c, s.x, s.y), [tx, ty]);
    assert.deepEqual(screenToTile(c, s.x + 1, s.y - 1), [tx, ty]);                  // anywhere near the middle of the tile
  }
});

test('the tilt: further (north) is higher on screen and smaller, and the ground foreshortens by about sin(pitch)', () => {
  const c = cam(), a = project(c, 400, 320), far = project(c, 400, 200), close = project(c, 400, 440);
  assert.ok(far.y < a.y && a.y < close.y);
  assert.ok(far.scale < a.scale && a.scale < close.scale);
  const flat = project(cam({ pitch: 90 }), 400, 304), tilted = project(c, 400, 304);
  near(380 - flat.y, 16 * (1000 / 330), 1e-6);                                       // looking straight down: one world px north = focal / dist screen px up
  assert.ok(Math.abs(tilted.y - 380) < Math.abs(flat.y - 380));
  near(project(c, 401, 320).x - 640, 1000 / 330, 1e-9);                              // one world px sideways at the focus depth
});

test('a straight-down camera is a plain scaled map (every row has the same scale)', () => {
  const c = cam({ pitch: 90 });
  const r0 = groundRow(c, 100), r1 = groundRow(c, 700);
  near(r0.perPx, r1.perPx, 1e-9); near(r0.perPx, 330 / 1000, 1e-9);
  near(project(c, 100, 100).scale, project(c, 700, 500).scale);
});

test('rows above the horizon see no ground, and the row width grows with the distance', () => {
  const c = cam();
  assert.equal(groundRow(c, -100000), null);
  assert.equal(unproject(c, 640, -100000), null);
  assert.equal(screenToTile(c, 640, -100000), null);
  const top = groundRow(c, 20), bottom = groundRow(c, 700);
  assert.ok(top.perPx > bottom.perPx && top.y < bottom.y);
});

test('billboard scale is focal / depth, shrinks with distance, and standAt lifts straight up by height * scale', () => {
  const c = cam();
  near(billboardScale(c, 400, 320), 1000 / depthOf(c, 400, 320));
  assert.ok(billboardScale(c, 400, 100) < billboardScale(c, 400, 320));
  assert.ok(billboardScale(c, 400, 500) > billboardScale(c, 400, 320));
  const foot = project(c, 450, 380), top = standAt(c, 450, 380, 32);
  near(top.x, foot.x); near(top.y, foot.y - 32 * foot.scale); near(top.scale, foot.scale);
});

test('depth sort: furthest first, ties by order then by input order', () => {
  const c = cam();
  const items = [{ id: 'near', depth: depthOf(c, 400, 420) }, { id: 'far', depth: depthOf(c, 400, 100) }, { id: 'mid', depth: depthOf(c, 400, 320) },
    { id: 'tieB', depth: 200, order: 1 }, { id: 'tieA', depth: 200, order: 0 }, { id: 'tieC', depth: 200, order: 0 }];
  const sorted = sortBackToFront(items).map((i) => i.id);
  assert.deepEqual(sorted.filter((i) => ['far', 'mid', 'near'].includes(i)), ['far', 'mid', 'near']);
  assert.deepEqual(sorted.filter((i) => i.startsWith('tie')), ['tieA', 'tieC', 'tieB']);
  assert.deepEqual(items.map((i) => i.id), ['near', 'far', 'mid', 'tieB', 'tieA', 'tieC'], 'the input is not reordered');
});

test('sorting by depth matches the map order: a pet further north is drawn first', () => {
  const c = cam();
  const pets = [{ id: 'south', y: 400 }, { id: 'north', y: 200 }, { id: 'middle', y: 300 }].map((p) => ({ ...p, depth: depthOf(c, 400, p.y) }));
  assert.deepEqual(sortBackToFront(pets).map((p) => p.id), ['north', 'middle', 'south']);
});

test('cameraFor frames the view: the focus is below the middle when tilted, centred when flat, and the zoom scales with the view', () => {
  const flat = cameraFor(1280, 720, 400, 320, 0), tilted = cameraFor(1280, 720, 400, 320, 1);
  assert.equal(flat.pitch, 90); assert.equal(tilted.pitch, 40);
  near(flat.cy, 360); assert.ok(tilted.cy > 360);
  const small = cameraFor(640, 360, 400, 320, 1);
  near(small.focal * 2, tilted.focal);
  assert.equal(TILE, 16);
});

test('a tall phone view zooms in so the top row never stretches to the horizon', () => {
  for (const [w, h] of [[390, 844], [750, 1136], [1280, 720], [600, 600]]) {
    const c = cameraFor(w, h, 24 * 16, 20 * 16, 1), top = groundRow(c, 0);
    assert.ok(top && 20 * 16 - top.y <= MAX_REACH + 1e-6, `${w}x${h}`);
  }
  assert.ok(cameraFor(750, 1136, 0, 0, 1).focal / 330 > 2.5);
});

test('sprite scale snaps to whole screen pixels per art pixel, never below 1', () => {
  assert.equal(snapScale(3.4), 3); assert.equal(snapScale(3.5), 4); assert.equal(snapScale(0.4), 1); assert.equal(snapScale(5), 5);
});

test('the focus snaps to whole screen pixels at the focus depth', () => {
  const c = cameraFor(1280, 720, 400, 320, 1), z = c.focal / c.dist;
  const [x, y] = snapFocus(c, 400.123, 320.456);
  near(x * z, Math.round(x * z), 1e-9); near(y * z, Math.round(y * z), 1e-9);
  assert.ok(Math.abs(x - 400.123) <= 0.5 / z + 1e-9 && Math.abs(y - 320.456) <= 0.5 / z + 1e-9);
});

test('visibleTiles is the rectangle of tiles fully on screen: its corners project inside the view, and it follows the focus', () => {
  const c = cameraFor(1280, 720, 24 * 16, 22 * 16, 1), box = visibleTiles(c, 1280, 720);
  assert.ok(box && box.x0 < 24 && box.x1 > 24 && box.y0 < 22 && box.y1 > 22);
  for (const [tx, ty] of [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]]) {
    const p = tileToScreen(c, tx, ty);
    assert.ok(p.x > 0 && p.x < 1280 && p.y > 0 && p.y < 720, `${tx},${ty}`);
  }
  const moved = visibleTiles(cameraFor(1280, 720, 28 * 16, 22 * 16, 1), 1280, 720);
  assert.ok(moved.x0 > box.x0 && moved.x1 > box.x1);
  assert.equal(visibleTiles(makeCamera({ focusX: 0, focusY: 0, pitch: 5, dist: 300, focal: 300, cx: 100, cy: 100 }), 200, 200), null);
});

test('lamp light: 1 at the lamp, smooth falloff, 0 beyond the radius, overlapping lamps stay under 1', () => {
  near(falloff(0, 90), 1); near(falloff(90, 90), 0); assert.equal(falloff(120, 90), 0);
  assert.ok(falloff(30, 90) > falloff(60, 90));
  const lamps = [{ x: 0, y: 0 }, { x: 40, y: 0 }];
  near(lightAt(lamps, 0, 0), 1);
  assert.ok(lightAt(lamps, 20, 0) > lightAt([lamps[0]], 20, 0));
  assert.ok(lightAt(lamps, 20, 0) < 1);
  assert.equal(lightAt(lamps, 500, 500), 0);
  assert.equal(lightAt([], 1, 1), 0);
  near(lightAt([{ x: 0, y: 0, r: 50, k: 0.5 }], 0, 0), 0.5);
  assert.ok(LAMP_RADIUS > 0);
});

test('night colour and sprite grading go from untouched (day) to dark and blue, lit sprites stay brighter', () => {
  assert.deepEqual(nightMultiply(0), [255, 255, 255]);
  const n = nightMultiply(1);
  assert.ok(n[2] > n[0] && n[0] < 255);
  assert.deepEqual(spriteGrade(0, 0), { veil: 0, warm: 0 });
  const dark = spriteGrade(1, 0), lit = spriteGrade(1, 1);
  assert.ok(lit.veil < dark.veil && lit.warm > dark.warm && dark.warm === 0);
});

test('the night amount approaches its target without overshooting', () => {
  assert.equal(approach(0, 1, 500, 1), 0.5);
  assert.equal(approach(0.9, 1, 500, 1), 1);
  assert.equal(approach(1, 0, 250, 1), 0.75);
  assert.equal(approach(0.2, 0, 1000, 1), 0);
  assert.equal(approach(1, 1, 16), 1);
});

test('the wandering pets only ever stand on walkable tiles and do move', () => {
  const rand = rng(7), box = { x0: 14, y0: 13, x1: 33, y1: 29 };
  const pets = [[21, 24], [27, 18], [24, 24]].map(([x, y], i) => new Wanderer(`p${i}`, { species: 'cat', stage: 2, items: ['', '', '', ''] }, x, y, box, rand));
  const seen = new Set();
  for (let t = 0; t < 4000; t++) for (const p of pets) {
    p.update(33);
    assert.ok(isWalkable(p.walker.tileX, p.walker.tileY), `${p.walker.tileX},${p.walker.tileY}`);
    seen.add(`${p.id}:${p.walker.tileX},${p.walker.tileY}`);
  }
  assert.ok(seen.size > 30);
});

test('the seeded generator is repeatable and in [0, 1)', () => {
  const a = rng(5), b = rng(5), c = rng(6);
  const xs = Array.from({ length: 50 }, a), ys = Array.from({ length: 50 }, b);
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, Array.from({ length: 50 }, c));
  assert.ok(xs.every((v) => v >= 0 && v < 1));
});
