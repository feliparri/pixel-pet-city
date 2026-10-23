import test from 'node:test';
import assert from 'node:assert/strict';
import { Walker, STEP_MS } from '../src/walker.js';
import { findPath } from '../src/path.js';

test('a path is walked one step per STEP_MS and the position is interpolated', () => {
  const w = new Walker(18, 24);
  const steps = [];
  w.onStep = (x, y, d) => steps.push([x, y, d]);
  w.setPath(findPath(18, 24, 20, 24));
  assert.deepEqual(steps, [[19, 24, 'right']]);
  w.update(STEP_MS / 2);
  assert.ok(Math.abs(w.pos().x - 18.5) < 1e-9);
  w.update(STEP_MS / 2);
  assert.deepEqual(steps.at(-1), [20, 24, 'right']);
  w.update(STEP_MS);
  assert.deepEqual(w.pos(), { x: 20, y: 24 });
  assert.equal(w.busy, false);
  assert.equal(steps.length, 2);
});

test('a long frame advances several steps without losing any', () => {
  const w = new Walker(18, 24);
  let n = 0;
  w.onStep = () => n++;
  w.setPath(findPath(18, 24, 18, 19));
  w.update(STEP_MS * 10);
  assert.equal(n, 5);
  assert.deepEqual(w.pos(), { x: 18, y: 19 });
});

test('a new path replaces the rest of the old one after the step in progress', () => {
  const w = new Walker(18, 24);
  w.setPath(findPath(18, 24, 24, 24));
  w.update(STEP_MS * 1.5);                       // on the second step
  w.setPath(findPath(w.tileX, w.tileY, 19, 19));
  w.update(STEP_MS * 20);
  assert.deepEqual(w.pos(), { x: 19, y: 19 });
});

test('stepToward is refused while moving; face reports a turn once', () => {
  const w = new Walker(18, 24);
  const seen = [];
  w.onStep = (x, y, d) => seen.push(`${x},${y},${d}`);
  assert.equal(w.stepToward(18, 23), true);
  assert.equal(w.stepToward(18, 22), false);
  w.update(STEP_MS);
  w.face('left'); w.face('left');
  assert.deepEqual(seen, ['18,23,up', '18,23,left']);
});

test('goTo walks a remote pet along the map and snaps when it is too far or unreachable', () => {
  const w = new Walker(18, 24);
  w.goTo(20, 24, 'right', 'town');
  w.update(STEP_MS * 3);
  assert.deepEqual(w.pos(), { x: 20, y: 24 });
  w.goTo(20, 24, 'left', 'town');            // same tile: only the facing changes
  assert.equal(w.d, 'left');
  w.goTo(5, 5, 'up', 'town');                    // too far to walk: snap
  assert.deepEqual(w.pos(), { x: 5, y: 5 });
  w.goTo(30, 39, 'up', 'town');                  // the other end of the town: snap
  assert.deepEqual(w.pos(), { x: 30, y: 39 });
});

test('a pet that is behind hurries: queued steps take half as long', () => {
  const w = new Walker(17, 24);
  w.goTo(27, 24, 'right', 'town');           // 10 steps queued
  w.update(STEP_MS * 3);
  assert.ok(w.pos().x >= 17 + 3 + 1 - 1e-9, String(w.pos().x));
});
