import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCamera, cameraFor, MAX_REACH, focusBounds, followFocus, snapScale, snapFocus, visibleTiles, project, unproject, groundRow, depthOf, billboardScale, standAt, tileToScreen, screenToTile, sortBackToFront, TILE } from '../src/hd2d/camera.js';
import { groundMult, NIGHT_TINT, falloff, lightAt, nightMultiply, spriteGrade, approach, LAMP_RADIUS } from '../src/hd2d/light.js';
import { createGovernor, LEVELS, SLOW_MS } from '../src/hd2d/quality.js';
import { Wanderer, rng } from '../src/hd2d/wander.js';
import { isWalkable, getArea } from '../src/map.js';

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

test('focusBounds keeps the whole view on the map, and a map smaller than the view gives its middle', () => {
  const W = 768, H = 1184;
  for (const [vw, vh, ref] of [[1280, 720, 230], [1266, 585, 170], [750, 1136, 230]]) {
    const probe = cameraFor(vw, vh, W / 2, H / 2, 1, { ref }), b = focusBounds(probe, vw, vh, W, H);
    assert.ok(b.x0 <= b.x1 && b.y0 <= b.y1);
    for (const [fx, fy] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      const c = cameraFor(vw, vh, fx, fy, 1, { ref });
      const left = unproject(c, 0, vh * 0.2), right = unproject(c, vw, vh * 0.2), bottom = unproject(c, vw / 2, vh - 1);
      assert.ok(left.x >= -1e-6 && right.x <= W + 1e-6 && bottom.y <= H + 1e-6, `${vw}x${vh} at ${fx},${fy}`);
    }
  }
  const tiny = focusBounds(cameraFor(1280, 720, 100, 100, 1), 1280, 720, 100, 100);
  assert.deepEqual([tiny.x0, tiny.x1, tiny.y0, tiny.y1], [50, 50, 50, 50]);
});

test('the ground colour follows the town clock: untouched by day, the clock\'s warm tint at dusk, this view\'s deep blue at night', () => {
  assert.deepEqual(groundMult({ tint: [255, 255, 255], night: 0 }), [255, 255, 255]);
  assert.deepEqual(groundMult({ tint: [104, 112, 190], night: 1 }), NIGHT_TINT);
  const dusk = groundMult({ tint: [255, 214, 168], night: 0.2 });
  assert.ok(dusk[0] > dusk[2] && dusk[0] < 255);
  assert.deepEqual(groundMult({ tint: [255, 255, 255], night: 5 }), NIGHT_TINT);
});

const feed = (g, ms, frames) => { let out = null; for (let i = 0; i < frames && !out; i++) out = g.push(ms); return out; };

test('the governor holds the level while frames are fast and steps down one level when they are slow', () => {
  const g = createGovernor({ window: 10, warm: 2 });
  assert.equal(feed(g, 16.7, 200), null); assert.equal(g.level, 0);
  assert.equal(feed(g, 50, 60), 'down'); assert.equal(g.level, 1);
  assert.deepEqual(g.settings, LEVELS[1]);
  assert.equal(feed(g, 20, 100), null); assert.equal(g.level, 1);                          // it never steps back up
});

test('the governor judges the average, not one hitch, and ignores a hidden tab and the frames right after a change', () => {
  const g = createGovernor({ window: 10, warm: 3 });
  for (let i = 0; i < 100; i++) assert.equal(g.push(i % 10 === 0 ? 120 : 16), null);      // one slow frame in ten: average about 26 ms
  for (let i = 0; i < 100; i++) assert.equal(g.push(5000), null);                           // a sleeping tab
  assert.equal(g.push(0), null); assert.equal(g.push(-3), null); assert.equal(g.push(NaN), null);
  assert.equal(g.level, 0);
  assert.equal(feed(g, SLOW_MS + 10, 20), 'down');
});

test('a device that takes very long per frame is still judged slow, while one long hitch alone is not', () => {
  const slow = createGovernor({ window: 10, warm: 1 });
  assert.equal(feed(slow, 400, 30), 'down');
  const crawl = createGovernor({ window: 45, warm: 1, minFrames: 8, maxWait: 3000 });
  let frames = 0, verdict = null;
  while (!verdict && frames < 45) { verdict = crawl.push(400); frames++; }
  assert.equal(verdict, 'down'); assert.ok(frames <= 10, `decided after ${frames} frames`);                // it does not wait 45 frames at 400 ms each
  const hitch = createGovernor({ window: 45, warm: 1 });
  hitch.push(16); hitch.push(900);
  for (let i = 0; i < 100; i++) assert.equal(hitch.push(16), null);
});

test('at the cheapest level a slow device gets the flat verdict once, unless flat is not allowed', () => {
  const g = createGovernor({ window: 5, warm: 1 });
  const seen = [];
  for (let i = 0; i < 500 && seen[seen.length - 1] !== 'flat'; i++) { const v = g.push(60); if (v) seen.push(v); }
  assert.deepEqual(seen, ['down', 'down', 'down', 'down', 'flat']);
  assert.ok(g.last);
  const pinned = createGovernor({ window: 5, warm: 1, start: LEVELS.length - 1, allowFlat: false });
  assert.equal(feed(pinned, 60, 100), null);
  assert.equal(createGovernor({ start: 99 }).level, LEVELS.length - 1);
});

test('the levels only get cheaper: resolution never rises and effects are only ever dropped', () => {
  for (let i = 1; i < LEVELS.length; i++) {
    const a = LEVELS[i - 1], b = LEVELS[i];
    assert.ok(b.res <= a.res && b.rowStep >= a.rowStep);
    assert.ok(!(b.bloom && !a.bloom) && !(b.tiltshift && !a.tiltshift));
  }
});

test('the player stays on screen with a margin on every walkable tile, also along the edges of the map', () => {
  const town = getArea('town'), W = town.w * TILE, H = town.h * TILE;
  for (const [vw, vh, ref] of [[1280, 720, 230], [1266, 585, 170], [750, 1136, 230]]) {
    const opts = { ref };
    let checked = 0, atEdge = 0;
    for (let ty = 0; ty < town.h; ty++) for (let tx = 0; tx < town.w; tx++) {
      if (!isWalkable(tx, ty)) continue;
      const px = tx * TILE + TILE / 2, py = ty * TILE + TILE;
      const f = followFocus(vw, vh, px, py, W, H, opts), p = project(cameraFor(vw, vh, f.x, f.y, 1, opts), px, py);
      assert.ok(p.x >= vw * 0.1 - 1e-6 && p.x <= vw * 0.9 + 1e-6, `${vw}x${vh} tile ${tx},${ty}: x ${p.x.toFixed(0)}`);
      assert.ok(p.y - 34 * p.scale >= vh * 0.06 - 1e-6 && p.y <= vh * 0.9 + 1e-6, `${vw}x${vh} tile ${tx},${ty}: y ${p.y.toFixed(0)}`);
      checked++; if (tx <= 1 || ty <= 1 || tx >= town.w - 2 || ty >= town.h - 2) atEdge++;
    }
    assert.ok(checked > 1000 && atEdge > 20, `${checked} tiles, ${atEdge} on the edge`);
  }
});

test('away from the edges the focus is the player itself, and it never leaves the clamped bounds by more than it must', () => {
  const W = 768, H = 1184, opts = { ref: 230 };
  const mid = followFocus(1280, 720, 384, 592, W, H, opts);
  near(mid.x, 384); near(mid.y, 592);
  const corner = followFocus(1280, 720, 8, 8, W, H, opts), b = focusBounds(cameraFor(1280, 720, W / 2, H / 2, 1, opts), 1280, 720, W, H);
  assert.ok(corner.x < b.x0 && corner.x >= 8 && corner.y < b.y0 && corner.y >= 8);
});

// A pet is drawn on a scratch canvas in the HD-2D view: it must have room for the tallest / widest hat, or the hat is cut off (the flat view draws straight to the screen).
import { readFileSync } from 'node:fs';
import { petLayout, wornReach, CELL } from '../src/sprites.js';
test('the HD-2D pet canvas has room around the cell for every worn part, so a tall hat (the Jamiro Crown\'s fins) is not clipped', () => {
  const data = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url), 'utf8'));
  const reach = wornReach(data), lay = petLayout(data);
  assert.ok(reach.top > 12);                                                              // the crown reaches higher than the old fixed 12 px of headroom
  for (const item of Object.values(data.items)) for (const worn of Object.values(item.worn)) for (const [part, px, py] of [...worn.rest, ...(worn.flap || [])]) {
    const [w, h] = data.partSizes[part];
    assert.ok(lay.origin.x + px >= 0 && lay.origin.y + py >= 0, 'left / top edge inside the canvas');
    assert.ok(lay.origin.x + px + w <= lay.w && lay.origin.y + py + h <= lay.h, 'right / bottom edge inside the canvas');
  }
  assert.equal(lay.feetX, lay.origin.x + CELL / 2);
  assert.equal(lay.feetY, lay.origin.y + 30);                                             // the feet keep their row in the cell
  assert.deepEqual(petLayout({ items: {}, partSizes: [] }), { w: 48, h: 48, origin: { x: 8, y: 12 }, feetX: 24, feetY: 42 });   // no hats: the old canvas
});

test('the canvas is sized from what the pet wears: no hat is the old 48 x 48 with the feet where they were, the crown gets its own room, and no look needs more than the worst case', () => {
  const data = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url), 'utf8'));
  const all = petLayout(data);
  const bare = petLayout(data, { species: 'cat', stage: 2, items: ['', '', '', ''] });
  assert.deepEqual(bare, { w: 48, h: 48, origin: { x: 8, y: 12 }, feetX: 24, feetY: 42 });
  assert.deepEqual(petLayout(data, { species: 'cat', stage: 2, items: ['', '', '', ''] }), petLayout({ items: {}, partSizes: [] }));
  const crowned = { species: 'cat', stage: 2, items: ['jamiro', '', '', ''] };
  const lay = petLayout(data, crowned);
  assert.ok(lay.w * lay.h > bare.w * bare.h && lay.w * lay.h <= all.w * all.h);
  for (const [part, px, py] of [...data.items.jamiro.worn['cat-adult'].rest, ...(data.items.jamiro.worn['cat-adult'].flap || [])]) {
    const [w, h] = data.partSizes[part];
    assert.ok(lay.origin.x + px >= 0 && lay.origin.y + py >= 0 && lay.origin.x + px + w <= lay.w && lay.origin.y + py + h <= lay.h, 'the worn crown fits its own canvas');
  }
  for (const key of Object.keys(data.items.jamiro.worn)) {                                // every look the crown is worn in fits the worst case canvas
    const [species, stage] = key.split('-'), l = petLayout(data, { species, stage: data.stages.indexOf(stage), items: ['jamiro', '', '', ''] });
    assert.ok(l.w <= all.w && l.h <= all.h);
  }
});

test('parts.png fits a phone\'s texture limit and every part sits inside it, apart from the others', () => {
  const data = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url), 'utf8'));
  const head = readFileSync(new URL('../assets/parts.png', import.meta.url));
  const W = head.readUInt32BE(16), H = head.readUInt32BE(20);
  assert.ok(W <= 4096 && H <= 4096, `${W}x${H}`);
  assert.equal(data.partPos.length, data.partSizes.length);
  const rects = data.partPos.map(([x, y], i) => ({ x, y, w: data.partSizes[i][0], h: data.partSizes[i][1] }));
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H);
  rects.sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length && rects[j].y < rects[i].y + rects[i].h; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, 'two parts overlap');
  }
});
