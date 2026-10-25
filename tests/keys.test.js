import test from 'node:test';
import assert from 'node:assert/strict';
import { isTyping, isJumpKey, isTouchDevice, dpadDir, runs } from '../src/keys.js';

test('keys are ignored while the focus is in a text field', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(isTyping({ target: { tagName } }), true);
  for (const tagName of ['CANVAS', 'BODY', 'BUTTON']) assert.equal(isTyping({ target: { tagName } }), false);
  assert.equal(isTyping({}), false);
});

test('Shift runs only in the free walk: a game keeps its own pace', () => {
  const free = { frozen: false, zone: null, closed: false };
  assert.equal(runs(true, free), true);
  assert.equal(runs(false, free), false);
  assert.equal(runs(true, { frozen: false, zone: null, closed: true }), false);          // the chicken or "Todo el pueblo": no zone, doors shut
  assert.equal(runs(true, { frozen: false, zone: { has() {} }, closed: true }), false);   // hide and seek, football, the race
  assert.equal(runs(true, { frozen: true, zone: null, closed: false }), false);
});

test('Space is the jump key', () => {
  assert.equal(isJumpKey({ key: ' ' }), true);
  assert.equal(isJumpKey({ key: 'x', code: 'Space' }), true);
  assert.equal(isJumpKey({ key: 'Enter', code: 'Enter' }), false);
});

test('the D-pad maps the thumb position to a direction, none in the dead centre', () => {
  const half = 80;
  assert.equal(dpadDir(0, -60, half), 'up');
  assert.equal(dpadDir(0, 60, half), 'down');
  assert.equal(dpadDir(-60, 5, half), 'left');
  assert.equal(dpadDir(60, -5, half), 'right');
  assert.equal(dpadDir(30, 50, half), 'down');                    // the dominant axis wins on a diagonal
  assert.equal(dpadDir(50, 30, half), 'right');
  assert.equal(dpadDir(3, -4, half), null);
  assert.equal(dpadDir(0, 0, half), null);
  assert.equal(dpadDir(500, 0, half), 'right');                   // a captured thumb may slide far outside the pad
});

test('the B button runs through the same rule as Shift: free walk only', () => {
  const free = { frozen: false, zone: null, closed: false };
  assert.equal(runs(true, free), true);
  assert.equal(runs(true, { frozen: false, zone: null, closed: true }), false);
});

test('a touch device is a coarse pointer, no hover, or touch events; a desktop is none of them', () => {
  const win = (matches, extra = {}) => ({ matchMedia: (q) => ({ matches: matches.includes(q) }), ...extra });
  assert.equal(isTouchDevice(win(['(pointer: coarse)'])), true);
  assert.equal(isTouchDevice(win(['(hover: none)'])), true);
  assert.equal(isTouchDevice(win([], { ontouchstart: null })), true);
  assert.equal(isTouchDevice(win([])), false);
  assert.equal(isTouchDevice({}), false);
  assert.equal(isTouchDevice(null), false);
});
