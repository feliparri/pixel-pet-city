import test from 'node:test';
import assert from 'node:assert/strict';
import { isTyping, isJumpKey, isTouchDevice, stickState, tapWalks, STICK_DEAD, runs } from '../src/keys.js';

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

test('the stick maps the thumb offset to 8 directions, none in the dead zone', () => {
  const r = 56, at = (deg, k = 0.5) => stickState(Math.cos(deg * Math.PI / 180) * r * k, Math.sin(deg * Math.PI / 180) * r * k, r);   // screen y grows down: 90 degrees is down
  assert.deepEqual(at(0).dirs, ['right']);
  assert.deepEqual(at(90).dirs, ['down']);
  assert.deepEqual(at(180).dirs, ['left']);
  assert.deepEqual(at(270).dirs, ['up']);
  assert.deepEqual(at(45).dirs, ['right', 'down']);
  assert.deepEqual(at(135).dirs, ['left', 'down']);
  assert.deepEqual(at(225).dirs, ['left', 'up']);
  assert.deepEqual(at(315).dirs, ['right', 'up']);
  assert.deepEqual(at(20).dirs, ['right']);                       // inside the axis sector (+-22.5 degrees)
  assert.deepEqual(at(30).dirs, ['right', 'down']);
  assert.deepEqual(stickState(0, 0, r).dirs, []);
  assert.deepEqual(stickState(5, -5, r).dirs, []);                // inside the dead zone
  assert.deepEqual(at(0, STICK_DEAD + 0.02).dirs, ['right']);
  assert.deepEqual(stickState(500, 0, r).dirs, ['right']);        // a captured thumb may slide far outside the stick
  assert.deepEqual(stickState(1, 1, 0).dirs, []);
});

test('the stick runs only when pushed past 70% of its radius', () => {
  const r = 100;
  assert.equal(stickState(60, 0, r).run, false);
  assert.equal(stickState(70, 0, r).run, false);
  assert.equal(stickState(71, 0, r).run, true);
  assert.equal(stickState(0, -100, r).run, true);
  assert.equal(stickState(5, 0, r).run, false);                   // the dead zone never runs
});

test('a finger on the map walks only while there is no stick; a mouse always walks', () => {
  assert.equal(tapWalks('touch', true), false);
  assert.equal(tapWalks('pen', true), false);
  assert.equal(tapWalks('mouse', true), true);                    // a hybrid laptop keeps click-to-walk
  assert.equal(tapWalks('mouse', false), true);                   // desktop
  assert.equal(tapWalks('touch', false), true);
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
