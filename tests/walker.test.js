import test from 'node:test';
import assert from 'node:assert/strict';
import { Walker, STEP_MS, RUN_FACTOR, REMOTE_SNAP } from '../src/walker.js';
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

test('a running walker takes STEP_MS / RUN_FACTOR a step, unless something sets its own pace', () => {
  const w = new Walker(18, 24);
  w.run = true;
  w.stepToward(19, 24);
  w.update(STEP_MS / RUN_FACTOR);
  assert.deepEqual(w.pos(), { x: 19, y: 24 });
  assert.equal(w.busy, false);
  w.stepOverride = 200;                      // a game's pace (the chicken, the race) wins over running
  assert.equal(w.stepMs(), 200);
});

test('a remote pet follows a running one through the 10 a second position sync without ever jumping', () => {
  const runner = new Walker(17, 24), remote = new Walker(17, 24);
  runner.run = true;
  runner.setPath(findPath(17, 24, 27, 24));
  let sent = null, maxLag = 0;
  for (let t = 0; t < 2000; t += 10) {
    runner.update(10);
    if (t % 100 === 0 && (!sent || sent !== runner.tileX)) {              // the latest tile, at most every 100 ms
      sent = runner.tileX;
      const lag = Math.abs(remote.tileX - sent);
      assert.ok(lag <= REMOTE_SNAP, `would snap at ${t} ms (${lag} tiles behind)`);
      remote.goTo(sent, 24, 'right', 'town');
    }
    remote.update(10);
    maxLag = Math.max(maxLag, Math.abs(remote.tileX - runner.tileX));
  }
  assert.deepEqual(remote.pos(), { x: 27, y: 24 });
  assert.ok(maxLag <= REMOTE_SNAP, String(maxLag));
});
