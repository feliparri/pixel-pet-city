import test from 'node:test';
import assert from 'node:assert/strict';
import { JUMP_MS, JUMP_PX, jumpLift } from '../src/jump.js';

test('a jump is a half sine arc of JUMP_MS: up, the peak half way, back on the ground', () => {
  const t0 = 5000;
  assert.equal(jumpLift(t0, t0), 0);
  assert.equal(jumpLift(t0 + JUMP_MS / 2, t0), JUMP_PX);
  const rise = [0.1, 0.25, 0.4].map((k) => jumpLift(t0 + k * JUMP_MS, t0));
  assert.ok(rise[0] > 0 && rise[0] < rise[1] && rise[1] < rise[2] && rise[2] <= JUMP_PX, String(rise));
  assert.equal(jumpLift(t0 + 0.25 * JUMP_MS, t0), jumpLift(t0 + 0.75 * JUMP_MS, t0));        // symmetric
  assert.equal(jumpLift(t0 + JUMP_MS, t0), 0);
  assert.equal(jumpLift(t0 + JUMP_MS * 3, t0), 0);
});

test('a pet that never jumped, or whose jump starts in the future, stays on the ground', () => {
  assert.equal(jumpLift(1000, null), 0);
  assert.equal(jumpLift(1000, undefined), 0);
  assert.equal(jumpLift(1000, 2000), 0);
});
