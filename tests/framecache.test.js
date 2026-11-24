import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameCache, createShadows, drawShadow } from '../src/hd2d/framecache.js';

const make = () => {
  const log = { canvases: 0, grades: [], paints: 0 };
  const canvas = (w, h) => { log.canvases++; return { width: w, height: h, getContext: () => ({}) }; };
  const grade = (ctx, src, n, l) => log.grades.push([n, l]);
  return { log, cache: createFrameCache({ canvas, grade, limit: 5 }), paint: () => log.paints++ };
};

test('a frame is painted once per key and reused', () => {
  const { log, cache, paint } = make();
  const a = cache.painted('a', 8, 8, paint);
  assert.equal(cache.painted('a', 8, 8, paint), a);
  cache.painted('b', 8, 8, paint);
  assert.equal(log.paints, 2);
});

test('by day the graded frame is the plain one, with no grading', () => {
  const { log, cache, paint } = make();
  assert.equal(cache.graded('a', 8, 8, paint, 0.02, 0.5), cache.painted('a', 8, 8, paint));
  assert.equal(log.grades.length, 0);
});

test('a night grade is reused inside one quantised step and redone across steps', () => {
  const { log, cache, paint } = make();
  const g1 = cache.graded('a', 8, 8, paint, 0.5, 0.5);
  assert.equal(cache.graded('a', 8, 8, paint, 0.51, 0.52), g1, 'same night*12 and light*8 steps');
  assert.equal(log.grades.length, 1);
  assert.notEqual(cache.graded('a', 8, 8, paint, 0.7, 0.5), g1);
  assert.notEqual(cache.graded('a', 8, 8, paint, 0.5, 0.9), g1);
  assert.equal(log.paints, 1, 'grading never repaints');
  assert.deepEqual(log.grades[0], [6 / 12, 4 / 8]);
});

test('the cache is bounded and drops the least recently used frame', () => {
  const { log, cache, paint } = make();
  for (let i = 0; i < 5; i++) cache.painted(`k${i}`, 4, 4, paint);
  cache.painted('k0', 4, 4, paint);                                  // k0 is now the newest
  cache.painted('k5', 4, 4, paint);                                  // evicts k1
  assert.equal(cache.size(), 5);
  const paints = log.paints;
  cache.painted('k0', 4, 4, paint);
  assert.equal(log.paints, paints, 'k0 survived');
  cache.painted('k1', 4, 4, paint);
  assert.equal(log.paints, paints + 1, 'k1 was dropped');
});

test('one shadow sprite per style and radius, drawn squashed', () => {
  let made = 0;
  const shadowOf = createShadows((w, h) => { made++; return { width: w, height: h, getContext: () => new Proxy({}, { get: () => () => {} }) }; });
  const a = shadowOf('pet', [[1, 0.2]], 11.4);
  assert.equal(shadowOf('pet', [[1, 0.2]], 11), a);
  assert.notEqual(shadowOf('thing', [[1, 0.2]], 11), a);
  assert.equal(made, 2);
  const calls = [];
  drawShadow({ drawImage: (...args) => calls.push(args) }, a, 100, 50, 0.5);
  assert.deepEqual(calls[0].slice(1), [0, 0, 22, 22, 89, 44.5, 22, 11]);
});
