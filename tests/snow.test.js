import test from 'node:test';
import assert from 'node:assert/strict';
import { snowing, chileMonth, flakesFor, drawSnow, FLAKES } from '../src/snow.js';
import { zonedToMs } from '../src/admin-time.js';

const XMAS = new Set(['christmas']), at = (d, t = '12:00') => zonedToMs(d, t);

test('snow: only while Christmas is on AND it is December in Chile', () => {
  assert.equal(snowing(XMAS, at('2026-12-01', '00:00')), true);
  assert.equal(snowing(XMAS, at('2026-12-31', '23:59')), true);
  assert.equal(snowing(XMAS, at('2026-11-20')), false, 'the season is on in November: decorations, no snow');
  assert.equal(snowing(XMAS, at('2027-01-01', '12:00')), false, 'January is part of the season but not of the snow');
  assert.equal(snowing(new Set(), at('2026-12-10')), false);
  assert.equal(snowing(new Set(['halloween']), at('2026-12-10')), false);
  assert.equal(snowing(null, at('2026-12-10')), false);
  assert.equal(snowing(XMAS, NaN), false);
  assert.equal(chileMonth(Date.UTC(2026, 11, 1, 2, 0)), 11, '02:00 UTC on Dec 1 is still Nov 30 in Chile');
  assert.equal(chileMonth(Date.UTC(2026, 11, 1, 3, 0)), 12);
});

test('snow: more flakes at night than by day, none beyond the table, a sane count', () => {
  assert.equal(flakesFor(0), FLAKES / 2);
  assert.equal(flakesFor(1), FLAKES);
  assert.ok(flakesFor(0.5) > flakesFor(0) && flakesFor(0.5) < flakesFor(1));
  assert.equal(flakesFor(5), FLAKES); assert.equal(flakesFor(-1), FLAKES / 2); assert.equal(flakesFor(undefined), FLAKES / 2);
  assert.ok(FLAKES >= 100 && FLAKES <= 300, 'cheap: a few hundred small rects at most');
});

function recorder() {
  const rects = [], c = { rects, fills: new Set(), save() {}, restore() {}, fillRect: (x, y, w, h) => rects.push([x, y, w, h]), set fillStyle(v) { c.fills.add(v); }, set globalAlpha(v) {} };
  return c;
}

test('snow: a frame is a pure function of the clock: the same time draws the same flakes, they fall and stay in the view, and nothing is allocated per flake', () => {
  const a = recorder(), b = recorder();
  drawSnow(a, 400, 300, 12345, 1, 2); drawSnow(b, 400, 300, 12345, 1, 2);
  assert.deepEqual(a.rects, b.rects);
  assert.equal(a.rects.length, FLAKES, 'all of them at night');
  for (const [x, y, w, h] of a.rects) { assert.ok(x >= 0 && x <= 400 && y >= 0 && y <= 300, `${x},${y}`); assert.ok(w === 2 || w === 4); assert.equal(w, h); assert.equal(x % 2, 0); assert.equal(y % 2, 0); }
  const day = recorder(); drawSnow(day, 400, 300, 12345, 0, 2);
  assert.equal(day.rects.length, FLAKES / 2);
  const later = recorder(); drawSnow(later, 400, 300, 14345, 1, 2);
  assert.notDeepEqual(later.rects, a.rects, 'it falls');
  assert.ok(day.fills.has('#ffffff') && a.fills.has('#dce8ff'), 'white by day, a bluer white at night');
  let falls = 0; const p = recorder(), q = recorder(); drawSnow(p, 400, 300, 0, 1, 1); drawSnow(q, 400, 300, 1000, 1, 1);
  for (let i = 0; i < p.rects.length; i++) if (q.rects[i][1] !== p.rects[i][1]) falls++;
  assert.ok(falls > p.rects.length * 0.8, 'most flakes are lower a second later');
});
