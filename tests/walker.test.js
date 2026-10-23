import test from 'node:test';
import assert from 'node:assert/strict';
import { Walker, STEP_MS } from '../src/walker.js';
import { isWalkable } from '../src/map.js';
import { findPath } from '../src/path.js';

test('a path is walked one step per STEP_MS and the position is interpolated', () => {
  const w = new Walker(12, 17);
  const steps = [];
  w.onStep = (x, y, d) => steps.push([x, y, d]);
  w.setPath(findPath(12, 17, 14, 17));
  assert.deepEqual(steps, [[13, 17, 'right']]);
  w.update(STEP_MS / 2);
  assert.ok(Math.abs(w.pos().x - 12.5) < 1e-9);
  w.update(STEP_MS / 2);
  assert.deepEqual(steps.at(-1), [14, 17, 'right']);
  w.update(STEP_MS);
  assert.deepEqual(w.pos(), { x: 14, y: 17 });
  assert.equal(w.busy, false);
  assert.equal(steps.length, 2);
});

test('a long frame advances several steps without losing any', () => {
  const w = new Walker(12, 17);
  let n = 0;
  w.onStep = () => n++;
  w.setPath(findPath(12, 17, 12, 12));
  w.update(STEP_MS * 10);
  assert.equal(n, 5);
  assert.deepEqual(w.pos(), { x: 12, y: 12 });
});

test('a new path replaces the rest of the old one after the step in progress', () => {
  const w = new Walker(12, 17);
  w.setPath(findPath(12, 17, 18, 17));
  w.update(STEP_MS * 1.5);                       // on the second step
  w.setPath(findPath(w.tileX, w.tileY, 13, 12));
  w.update(STEP_MS * 20);
  assert.deepEqual(w.pos(), { x: 13, y: 12 });
});

test('stepToward is refused while moving; face reports a turn once', () => {
  const w = new Walker(12, 17);
  const seen = [];
  w.onStep = (x, y, d) => seen.push(`${x},${y},${d}`);
  assert.equal(w.stepToward(12, 16), true);
  assert.equal(w.stepToward(12, 15), false);
  w.update(STEP_MS);
  w.face('left'); w.face('left');
  assert.deepEqual(seen, ['12,16,up', '12,16,left']);
});

test('goTo walks a remote pet along the map and snaps when it is too far or unreachable', () => {
  const w = new Walker(12, 17);
  w.goTo(14, 17, 'right', isWalkable);
  w.update(STEP_MS * 3);
  assert.deepEqual(w.pos(), { x: 14, y: 17 });
  w.goTo(14, 17, 'left', isWalkable);            // same tile: only the facing changes
  assert.equal(w.d, 'left');
  w.goTo(5, 5, 'up', isWalkable);                // inside the park fence: no path
  assert.deepEqual(w.pos(), { x: 5, y: 5 });
  w.goTo(1, 1, 'up', isWalkable);                // far corner, but a walkable tile far away: snap
  assert.deepEqual(w.pos(), { x: 1, y: 1 });
});

test('a pet that is behind hurries: queued steps take half as long', () => {
  const w = new Walker(2, 20);
  w.goTo(12, 20, 'right', isWalkable);           // 10 steps queued
  w.update(STEP_MS * 3);
  assert.ok(w.pos().x >= 2 + 3 + 1 - 1e-9, String(w.pos().x));
});
