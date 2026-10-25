import test from 'node:test';
import assert from 'node:assert/strict';
import { isTyping, runs } from '../src/keys.js';

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
