import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { starLevel, shimmer, waterBox, SCALE, SQUASH, STRIP, STAR_EVERY_MS, SHOW_EVERY_MS } from '../src/hd2d/reflect.js';
import { perfSkip, perfLines } from '../src/perf.js';

test('the stars show from dusk and are full in the dark; none by day', () => {
  assert.equal(starLevel(0), 0);
  assert.equal(starLevel(0.3), 0);
  assert.ok(starLevel(0.5) > 0 && starLevel(0.5) < 1);
  assert.equal(starLevel(0.75), 1);
  assert.equal(starLevel(1), 1);
  let prev = 0;
  for (let n = 0; n <= 1; n += 0.05) { assert.ok(starLevel(n) >= prev); prev = starLevel(n); }
});

test('the shimmer: small offsets, an alpha that stays in range, and it moves with the clock and from strip to strip', () => {
  const seen = new Set();
  for (let sy = 0; sy < 300; sy += STRIP) for (const now of [0, 123, 5000, 99999]) {
    const s = shimmer(sy, now);
    assert.ok(Math.abs(s.dx) <= 3 && Number.isInteger(s.dx), `dx ${s.dx}`);
    assert.ok(s.a >= 0.4 - 1e-9 && s.a <= 1 + 1e-9, `a ${s.a}`);
    seen.add(s.dx);
  }
  assert.ok(seen.size >= 4, 'the strips do not all move alike');
  assert.notDeepEqual(shimmer(10, 0), shimmer(10, 400));
});

test('the water box and the cost knobs: half size or less, rare star updates, a squashed mirror', () => {
  assert.equal(waterBox([]), null);
  assert.deepEqual(waterBox([{ x: 32, y: 48 }, { x: 64, y: 16 }]), { x0: 32, y0: 16, x1: 80, y1: 64 });
  assert.ok(SCALE <= 0.5);
  assert.ok(STAR_EVERY_MS >= 150 && SHOW_EVERY_MS <= 50 && SHOW_EVERY_MS < STAR_EVERY_MS);
  assert.ok(SQUASH > 0 && SQUASH < 1);
});

test('the reflection reuses the show routines instead of copying them, and the renderer draws it only through the skip switch', () => {
  const src = readFileSync(new URL('../src/hd2d/reflect.js', import.meta.url), 'utf8');
  for (const fn of ['drawBursts', 'drawRockets', 'drawMeteors', 'drawDrones', 'drawHalloween', 'drawChristmas']) assert.ok(src.includes(`${fn}(r,`), fn);
  const rend = readFileSync(new URL('../src/hd2d/renderer.js', import.meta.url), 'utf8');
  assert.ok(rend.includes("!skip.has('reflejo')"));
  assert.deepEqual([...perfSkip('?perf=1&skip=reflejo,nada')], ['reflejo']);
  assert.ok(perfLines({ town: { fps: 30, worst: 33, spans: {} }, view: { w: 1, h: 1, dpr: 1 }, hd: { mode: 'hd', level: 0, res: 1, parts: { ground: 1, items: 1, fx: 1, overlay: 1, refl: 2.5 }, skip: ['reflejo'] } }).some((l) => l.includes('reflejo 2.5')));
});
