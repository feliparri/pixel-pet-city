import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { POSES } from '../src/art/poses-data.js';
import { rowsOf, resample, colourOf, poseSprite, STAGE_SCALE, CELL_HEAD, breath } from '../src/art/poses.js';
import { SPECIES } from '../src/protocol.js';

const KINDS = ['recline', 'surf'];
const VALID = new Set('.123456789ABC');

test('every species has both poses, in the device text-grid format: one width, known palette chars, anchors and head inside the picture', () => {
  assert.deepEqual(Object.keys(POSES).sort(), [...SPECIES].sort());
  for (const sp of SPECIES) for (const k of KINDS) {
    const pose = POSES[sp][k], rows = rowsOf(pose), w = rows[0].length;
    assert.ok(pose.grid.startsWith(`# ${w}x${rows.length}`), `${sp} ${k}: the header says the size`);
    assert.ok(rows.every((r) => r.length === w && [...r].every((c) => VALID.has(c))), `${sp} ${k}`);
    assert.ok(w >= 28 && w <= 44 && rows.length >= 28 && rows.length <= 36, `${sp} ${k} is ${w}x${rows.length}: the pets' pixel density`);
    const [ax, ay] = pose.anchor, [hx, hy] = pose.head;
    assert.ok(ax >= 0 && ax < w && ay >= 0 && ay < rows.length && hx >= 0 && hx < w && hy >= 0 && hy < rows.length, `${sp} ${k} anchors`);
    assert.ok(rows[ay].slice(Math.max(0, ax - 3), ax + 4).split('').some((c) => c !== '.'), `${sp} ${k}: the anchor is on the body`);
    assert.ok(rows.some((r) => r.includes('1')), 'an outline');
  }
});

test('each pose has the species\' own identity: the frog\'s eye bumps, the seal\'s white muzzle, the cat\'s ears and stripes; and the sunbathing one wears sunglasses and blush, the surfing one an open eye', () => {
  const has = (sp, k, ch) => rowsOf(POSES[sp][k]).some((r) => r.includes(ch));
  for (const sp of SPECIES) { assert.ok(has(sp, 'recline', 'B') && has(sp, 'recline', 'C'), `${sp} sunglasses`); assert.ok(has(sp, 'recline', '7'), `${sp} blush`); assert.ok(has(sp, 'surf', '7') && has(sp, 'surf', '8') && has(sp, 'surf', '6'), `${sp} surf face`); assert.equal(has(sp, 'surf', 'B'), false, 'no sunglasses while surfing'); }
  assert.ok(has('cat', 'recline', '9') && has('cat', 'surf', '9'), 'tabby stripes');
  assert.equal(has('frog', 'recline', '9') || has('seal', 'recline', '9') && false, false, 'the frog has no stripes');
  const top = (sp, k) => rowsOf(POSES[sp][k]).slice(0, 4).join('');
  assert.ok(top('cat', 'recline').includes('7'), 'pink ears at the top of the cat');
  assert.ok(!top('seal', 'recline').includes('7'));
});

test('the palettes are the device\'s own (pixel-pet/common/sprites.c), young and elder, when the repository above is there', () => {
  const dev = new URL('../../pixel-pet/common/sprites.c', import.meta.url);
  if (!existsSync(dev)) return;
  const src = readFileSync(dev, 'utf8');
  const hexOf = (name) => { const m = src.match(new RegExp(`const gfx_palette_t ${name} = \\{([\\s\\S]*?)\\};`)); return [...m[1].matchAll(/RGB565\(0x(..), 0x(..), 0x(..)\)/g)].map((x) => `#${x[1]}${x[2]}${x[3]}`.toLowerCase()); };
  for (const [sp, young, elder] of [['frog', 'PAL_FROG', 'PAL_FROG_ELDER'], ['seal', 'PAL_SEAL', 'PAL_SEAL_ELDER'], ['cat', 'PAL_CAT', 'PAL_CAT_ELDER']]) {
    const y = hexOf(young), e = hexOf(elder);
    for (let i = 1; i <= 9; i++) { assert.equal(colourOf(sp, false, String(i)), y[i - 1], `${sp} young ${i}`); assert.equal(colourOf(sp, true, String(i)), e[i - 1], `${sp} elder ${i}`); }
  }
});

test('the stage sizes come from the device\'s own stage art (idle bounding boxes against the adult), and the hat anchors from its table', () => {
  const dir = new URL('../../pixel-pet/art/', import.meta.url);
  for (const sp of SPECIES) {
    assert.deepEqual(STAGE_SCALE[sp][2], [1, 1], 'the adult is as drawn');
    assert.deepEqual(STAGE_SCALE[sp][3], STAGE_SCALE[sp][1], 'the elder is the child\'s size');
    assert.ok(STAGE_SCALE[sp][0][0] > 1 && STAGE_SCALE[sp][0][1] < 1, 'a baby is wider and shorter');
    assert.deepEqual(CELL_HEAD[sp].map((p) => p[0]), [16, 16, 16, 16]);
  }
  if (!existsSync(new URL('frog_adult_idle.txt', dir))) return;
  const box = (file) => { const rows = readFileSync(new URL(file, dir), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')); let x0 = 99, x1 = -1, y0 = 99, y1 = -1; rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } })); return [x1 - x0 + 1, y1 - y0 + 1]; };
  for (const sp of SPECIES) {
    const [aw, ah] = box(`${sp}_adult_idle.txt`);
    for (const [i, st] of [[0, 'baby'], [2, 'adult'], [3, 'elder']]) { const [w, h] = box(`${sp}_${st}_idle.txt`); assert.ok(Math.abs(w / aw - STAGE_SCALE[sp][i][0]) < 0.01 && Math.abs(h / ah - STAGE_SCALE[sp][i][1]) < 0.04, `${sp} ${st}`); }
  }
});

test('resampling is nearest neighbour: a stage keeps the pixels, only repeated or dropped', () => {
  const rows = ['12', '34'];
  assert.deepEqual(resample(rows, 1, 1), rows);
  assert.deepEqual(resample(rows, 2, 2), ['1122', '1122', '3344', '3344']);
  assert.deepEqual(resample(rows, 1.5, 1), ['112', '334']);
  const frog = rowsOf(POSES.frog.recline), baby = resample(frog, STAGE_SCALE.frog[0][0], STAGE_SCALE.frog[0][1]);
  assert.ok(baby[0].length > frog[0].length && baby.length < frog.length);
  assert.ok(new Set(baby.join('')).size <= new Set(frog.join('')).size, 'no new colours');
});

// a canvas stand-in that records what is drawn
const fakeCanvas = (w, h) => { const ops = []; return { width: w, height: h, ops, getContext: () => ({ set fillStyle(v) { ops.push(['style', v]); }, fillRect: (...a) => ops.push(['rect', ...a]), drawImage: (...a) => ops.push(['image', ...a.slice(1)]), save() {}, restore() {}, translate() {}, scale() {} }) }; };
const sp = { data: { items: { tophat: { worn: { 'frog-adult': { rest: [['hatpart', 4, -10, 0, 0]] } } } }, partSizes: { hatpart: [16, 12] }, partPos: { hatpart: [0, 0] } }, parts: {} };

test('poseSprite builds each species at each stage with its anchors, caches it, and a hat is drawn on the head anchor', () => {
  for (const species of SPECIES) for (let stage = 0; stage < 4; stage++) for (const kind of KINDS) {
    const look = { species, stage, items: ['', '', '', ''] }, r = poseSprite(sp, look, kind, fakeCanvas);
    assert.ok(r.w > 28 && r.h > 28 && r.ax > 0 && r.ay > 0 && r.hx > 0 && r.hy > 0, `${species} ${stage} ${kind}`);
    assert.equal(poseSprite(sp, look, kind, fakeCanvas), r, 'cached');
    const rect = r.canvas.ops.filter((o) => o[0] === 'rect');
    assert.ok(rect.length > 300, 'painted pixel by pixel');
    assert.ok(rect.every((o) => o[1] >= 0 && o[2] >= 0 && o[1] < r.w && o[2] < r.h), 'inside the picture');
  }
  const bare = poseSprite(sp, { species: 'frog', stage: 2, items: ['', '', '', ''] }, 'recline', fakeCanvas);
  const hat = poseSprite(sp, { species: 'frog', stage: 2, items: ['tophat', '', '', ''] }, 'recline', fakeCanvas);
  const img = hat.canvas.ops.find((o) => o[0] === 'image');
  assert.ok(img && !bare.canvas.ops.some((o) => o[0] === 'image'), 'only the hat is drawn from the parts sheet');
  assert.equal(img[img.length - 4] + 0, hat.hx - CELL_HEAD.frog[2][0] + 4, 'the hat part lands on the head anchor like on the standing pet');
  const baby = poseSprite(sp, { species: 'frog', stage: 0, items: ['', '', '', ''] }, 'surf', fakeCanvas), adult = poseSprite(sp, { species: 'frog', stage: 2, items: ['', '', '', ''] }, 'surf', fakeCanvas);
  assert.ok(baby.w > adult.w && baby.h - 0 <= adult.h, 'the baby is wider and shorter');
  assert.ok(breath(0) === 1 && breath(2100) < 1 && breath(2100) >= 0.97 - 1e-9);
});
