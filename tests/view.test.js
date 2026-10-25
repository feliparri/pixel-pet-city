import test from 'node:test';
import assert from 'node:assert/strict';
import { viewFor, cameraFor, fitScale, MIN_VIEW_H, VIEW_W, VIEW_H } from '../src/render.js';
import { getArea, TILE } from '../src/map.js';

const town = getArea('town'), shop = getArea('shop');

test('a landscape phone takes its scale from the height: at least 11 tiles from top to bottom, and the width fills the box', () => {
  const v = viewFor(2200, 1014, town.w * TILE, town.h * TILE);          // 844 x 390 css at a pixel ratio of 2.6
  assert.equal(v.scale, Math.floor(1014 / MIN_VIEW_H));
  assert.ok(v.h >= MIN_VIEW_H && v.h < MIN_VIEW_H * 2, String(v.h));
  assert.equal(v.w, Math.floor(2200 / v.scale));
  assert.ok(v.w > VIEW_W * 1.5);                                         // much more map than the old 224 wide view
  assert.ok(v.w * v.scale <= 2200 && v.h * v.scale <= 1014);
});

test('a small landscape box never goes below scale 1', () => {
  const v = viewFor(300, 120);
  assert.deepEqual(v, { scale: 1, w: 300, h: 120 });
});

test('a portrait box keeps the old portrait scale (a phone held upright, a tall desktop window)', () => {
  assert.equal(viewFor(1000, 1800).scale, fitScale(1000, 1800));
  const v = viewFor(672, 864);
  assert.deepEqual(v, { scale: 3, w: VIEW_W, h: VIEW_H });
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
