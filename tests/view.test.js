import test from 'node:test';
import assert from 'node:assert/strict';
import { viewFor, cameraFor, fitScale, petScaleFor, MIN_VIEW_H, MIN_VIEW_W, VIEW_W, VIEW_H } from '../src/render.js';
import { getArea, TILE } from '../src/map.js';

const town = getArea('town'), shop = getArea('shop');

test('a landscape phone takes its scale from the height: at least 16 tiles from top to bottom, and the width fills the box', () => {
  const v = viewFor(2200, 1014, town.w * TILE, town.h * TILE);          // 844 x 390 css at a pixel ratio of 2.6
  assert.equal(v.scale, Math.floor(1014 / MIN_VIEW_H));
  assert.ok(v.h >= MIN_VIEW_H && v.h < MIN_VIEW_H * 2, String(v.h));
  assert.equal(v.w, Math.floor(2200 / v.scale));
  assert.ok(v.w > VIEW_W * 1.5);                                         // much more map than the old 224 wide view
  assert.ok(v.w * v.scale <= 2200 && v.h * v.scale <= 1014);
});

test('a small landscape box never goes below scale 1', () => {
  const v = viewFor(300, 120);
  assert.deepEqual(v, { scale: 1, pet: 1, w: 300, h: 120 });
});

test('a portrait box keeps the old portrait scale (a phone held upright, a tall desktop window)', () => {
  assert.equal(viewFor(1000, 1800, Infinity, Infinity, VIEW_H, VIEW_W).scale, fitScale(1000, 1800));
  const v = viewFor(672, 864, Infinity, Infinity, VIEW_H, VIEW_W);
  assert.deepEqual(v, { scale: 3, pet: 2, w: VIEW_W, h: VIEW_H });
});

test('a view never exceeds its area: a small interior is shown whole', () => {
  const v = viewFor(2200, 1014, shop.w * TILE, shop.h * TILE);
  assert.equal(v.w, shop.w * TILE);
  assert.equal(v.h, shop.h * TILE);
  assert.equal(v.scale, Math.floor(1014 / MIN_VIEW_H));
});

test('the camera uses the view it is given: centred on the player, clamped to the map, a smaller map centred', () => {
  assert.deepEqual(cameraFor(400, 300, 768, 640, 400, 180), { x: 200, y: 210 });
  assert.deepEqual(cameraFor(10, 10, 768, 640, 400, 180), { x: 0, y: 0 });
  assert.deepEqual(cameraFor(760, 630, 768, 640, 400, 180), { x: 368, y: 460 });
  assert.deepEqual(cameraFor(96, 80, 192, 160, 400, 180), { x: -104, y: -10 });
  assert.deepEqual(cameraFor(96, 80, 192, 160, 192, 160), { x: 0, y: 0 });
});

test('a wide desktop window keeps the old pixel size: the minimum height is the portrait view, not the phone one', () => {
  const v = viewFor(1920, 1000, Infinity, Infinity, VIEW_H);
  assert.equal(v.scale, Math.floor(1000 / VIEW_H));
  assert.ok(v.h >= VIEW_H && v.w > VIEW_W, `${v.w}x${v.h}`);
});

test('pets are drawn about 2/3 the size of the world pixels, a whole number each', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(petScaleFor), [1, 1, 2, 3, 3, 4, 6]);
  for (const sc of [3, 6, 9]) assert.equal(petScaleFor(sc) / sc, 2 / 3);
  assert.equal(viewFor(1170, 2532).pet, petScaleFor(viewFor(1170, 2532).scale));
});

test('a phone shows 1.5 times the tiles it did: landscape 844 x 390 at dpr 3, and portrait 390 x 844', () => {
  const old = (devW, devH) => (devW > devH ? Math.floor(devH / 176) : fitScale(devW, devH));      // the scale before
  const land = viewFor(2532, 1170), was = old(2532, 1170);
  assert.equal(land.scale, 4);
  assert.ok(land.h / TILE >= 16 && land.h / TILE / (Math.floor(1170 / was) && 1170 / was / TILE) >= 1.4, String(land.h));
  const port = viewFor(1170, 2532, Infinity, Infinity, MIN_VIEW_H, MIN_VIEW_W);
  assert.equal(port.scale, 3);
  assert.ok(port.w >= MIN_VIEW_W && port.w / (1170 / old(1170, 2532)) >= 1.4, String(port.w));
  assert.ok(port.pet < port.scale && land.pet < land.scale);
});
