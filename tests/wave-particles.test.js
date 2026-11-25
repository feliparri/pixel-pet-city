import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawWave, drawWaveFlat, pixelOf, MAX_PARTICLES, bodyFrac, capSpan, lipReach } from '../src/hd2d/wave.js';
import { waveAt, WAVE } from '../src/surf.js';
import { makeCamera } from '../src/hd2d/camera.js';
import { shallowFrom, AREAS } from '../src/map.js';

// a context that records the rectangles it fills, by colour
function recorder() {
  const fills = [];
  let style = null, path = [];
  return { fills, set fillStyle(v) { style = v; }, get fillStyle() { return style; }, beginPath() { path = []; }, rect(x, y, w, h) { path.push([x, y, w, h]); }, fill() { fills.push({ color: style, rects: path.slice() }); path = []; }, fillRect() { throw new Error('single fillRect: particles are batched'); } };
}
const cam = makeCamera({ focusX: 220, focusY: 290, pitch: 60, dist: 330, focal: 330 * 2.6, cx: 855, cy: 520 });
const view = { w: 1710, h: 986 };
const wave = (ageMs, id = 7) => waveAt(id * WAVE.periodMs + ageMs);

test('the wave is drawn as snapped pixel blocks, batched by colour: whole pixels of the scene, a few fill calls', () => {
  const ctx = recorder(), U = pixelOf(cam), n = drawWave(ctx, cam, view, wave(3500), 0, 123456, shallowFrom, 36);
  assert.ok(n > 200 && n <= MAX_PARTICLES, `${n} rectangles`);
  assert.ok(ctx.fills.length >= 6 && ctx.fills.length <= 16, `${ctx.fills.length} fill calls`);
  assert.equal(new Set(ctx.fills.map((f) => f.color)).size, ctx.fills.length, 'one fill call per colour');
  for (const f of ctx.fills) for (const [x, y, w, h] of f.rects) assert.ok(x % U === 0 && y % U === 0 && w % U === 0 && h % U === 0 && w >= U && h >= U, `a cell snapped to the ${U} px art pixel`);
  const colours = ctx.fills.map((f) => f.color);
  for (const c of ['#ffffff', '#1d8fd3', '#86d4fb', '#d9f2fe']) assert.ok(colours.includes(c), `${c}: spray, the body, its outline and the foam cap`);
});

test('the pattern is deterministic: the same clock gives the same particles for every player, another moment gives another, nothing is stored', () => {
  const run = (age, id = 7, t = 5000) => { const c = recorder(); drawWave(c, cam, view, wave(age, id), 0, t, shallowFrom, 36); return JSON.stringify(c.fills); };
  assert.equal(run(3500), run(3500), 'the same wave and time');
  assert.equal(run(3500, 7, 1000), run(3500, 7, 99999), 'the local frame time does not matter: only the wave\'s own clock');
  assert.notEqual(run(3500), run(3700), 'it moves with the clock');
  assert.notEqual(run(3500, 7), run(3500, 8), 'each wave has its own pattern');
  assert.equal(drawWave(recorder(), cam, view, null, 0, 0, shallowFrom, 36), 0, 'no wave, nothing drawn');
});

test('only the rows in view are drawn, the colours darken at night, and a dying wave thins out', () => {
  const full = drawWave(recorder(), cam, view, wave(3500), 0, 0, shallowFrom, 36);
  const tight = drawWave(recorder(), makeCamera({ focusX: 220, focusY: 100, pitch: 60, dist: 330, focal: 330 * 2.6, cx: 855, cy: 520 }), view, wave(3500), 0, 0, shallowFrom, 36);
  const day = recorder(), night = recorder();
  drawWave(day, cam, view, wave(3500), 0, 0, shallowFrom, 36); drawWave(night, cam, view, wave(3500), 1, 0, shallowFrom, 36);
  assert.notDeepEqual(day.fills.map((f) => f.color), night.fills.map((f) => f.color));
  assert.ok(night.fills.some((f) => /^rgb/.test(f.color)), 'mixed towards the night blue');
  const late = drawWave(recorder(), cam, view, wave(6900), 0, 0, shallowFrom, 36), mid = drawWave(recorder(), cam, view, wave(3500), 0, 0, shallowFrom, 36);
  assert.ok(late <= mid);
});

test('the flat view has the same style, simpler: cells of 2 px, batched, fewer particles', () => {
  const ctx = recorder(), n = drawWaveFlat(ctx, wave(3500), { x: 0, y: 0 }, AREAS.beach, shallowFrom);
  assert.ok(n > 60 && n < 1500, `${n} rectangles`);
  const body = ctx.fills.find((f) => f.color === '#1d8fd3');
  assert.ok(body && body.rects.length > 10, 'a solid blue body');
  for (const f of ctx.fills) for (const [x, y, w, h] of f.rects) assert.ok(x % 2 === 0 && y % 2 === 0 && w % 2 === 0 && h % 2 === 0);
  assert.equal(drawWaveFlat(recorder(), null, { x: 0, y: 0 }, AREAS.beach, shallowFrom), 0);
  const src = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.ok(src.includes('drawWaveFlat(sctx, wave, cam, area, shallowFrom, now, { w: vw, h: vh })'));
});

test('the geometry is untouched: the sheet reads the same bodyAt height and the same front line as the clock\'s wave', () => {
  const src = readFileSync(new URL('../src/hd2d/wave.js', import.meta.url), 'utf8');
  assert.ok(src.includes('bodyAt(wave, row - wave.k') && src.includes('hK: WAVE_LIFT') && src.includes('wave.k * TILE'));
});

test('the profile is the reference wave: a smooth back slope up to the crest, then a steep drop under an overhanging cap that thins to a tip', () => {
  let last = -1;
  for (let nu = -1.7; nu <= -0.1; nu += 0.1) { const f = bodyFrac(nu, true); assert.ok(f >= last && f <= 1, `the back slope only rises (${nu.toFixed(1)})`); last = f; }
  assert.equal(bodyFrac(-2, true), 0, 'no body beyond the foot of the back slope');
  assert.equal(bodyFrac(0, true), 1, 'the crest is the full height');
  assert.ok(bodyFrac(0.3, true) < 0.5 && bodyFrac(0.5, true) < 0.01, 'the front falls away under the lip');
  const e = lipReach(1);
  assert.ok(e > lipReach(0.3) && e > 0.4 && e < 0.7, 'a bigger cap reaches further over the front');
  assert.equal(capSpan(-0.2, e), null, 'the overhang starts at the crest');
  assert.equal(capSpan(e + 0.1, e), null, 'and ends at its tip');
  const [b1, t1] = capSpan(0.12, e), [b2, t2] = capSpan(e - 0.03, e);
  assert.ok(t1 - b1 > t2 - b2 && t2 - b2 >= 0, 'the cap thins towards the tip');
  assert.ok(capSpan(0.3, e)[0] > bodyFrac(0.3, true), 'it hangs over the lower front, leaving a pocket under it');
});
