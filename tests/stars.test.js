import test from 'node:test';
import assert from 'node:assert/strict';
import { createStars, createStarSaver, starsFromState, stateWithStars, STATE_V } from '../src/stars.js';

test('stars start from the trip state and report every change to be saved', () => {
  const saved = [];
  const a = createStars({ initial: starsFromState({ v: 1, stars: 4 }), persist: (n) => saved.push(n) });
  assert.equal(a.get(), 4);
  a.add(3); a.add(1);
  assert.deepEqual(saved, [7, 8]);
  assert.equal(createStars().add(2), 2, 'without a saver the count lives for this visit');
});

test('stars ignore nonsense', () => {
  const a = createStars({ initial: 'banana' });
  assert.equal(a.get(), 0);
  assert.equal(a.add(-5), 0); assert.equal(a.add(1.5), 0); assert.equal(a.add(NaN), 0);
  for (const bad of [null, undefined, {}, { stars: -1 }, { stars: 'x' }, { stars: 2.5 }, []]) assert.equal(starsFromState(bad), 0);
  assert.equal(starsFromState({ stars: 10 ** 9 }), 999999);
});

test('the state blob is versioned and keeps the keys other stages add', () => {
  assert.deepEqual(stateWithStars({ shop: ['hat'], stars: 1 }, 9), { shop: ['hat'], v: STATE_V, stars: 9 });
  assert.deepEqual(stateWithStars(null, 2), { v: 1, stars: 2 });
  assert.deepEqual(stateWithStars([1], 2), { v: 1, stars: 2 });
});

test('the saver sends the latest count a little later, one request at a time, and retries a failure', async () => {
  const timers = [];
  const sent = [];
  let fail = false;
  const saver = createStarSaver(async (n) => { sent.push(n); return !fail; }, { delayMs: 10, retryMs: 50, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} });
  saver.save(3); saver.save(6); saver.save(9);
  assert.equal(timers.length, 1, 'changes are batched into one save');
  assert.equal(saver.pending, true);
  await timers.shift().fn();
  assert.deepEqual(sent, [9]);
  assert.equal(saver.pending, false);
  fail = true;
  saver.save(12);
  await timers.shift().fn();
  assert.equal(saver.pending, true, 'a refused save is kept');
  assert.equal(timers[0].ms, 50, 'and tried again later');
  fail = false;
  await timers.shift().fn();
  assert.deepEqual(sent, [9, 12, 12]);
  assert.equal(saver.pending, false);
  saver.save(15);
  await saver.flush();
  assert.deepEqual(sent.at(-1), 15, 'flush saves right away');
});
