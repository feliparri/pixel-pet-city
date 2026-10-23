import test from 'node:test';
import assert from 'node:assert/strict';
import { ambientAt, hourNow } from '../src/daynight.js';

test('midday is untouched, midnight is dark blue with the lights on', () => {
  assert.deepEqual(ambientAt(13), { tint: [255, 255, 255], night: 0 });
  const n = ambientAt(23);
  assert.equal(n.night, 1);
  assert.ok(n.tint[2] > n.tint[0] && n.tint[0] < 140);
});

test('dusk is warm and the lamps come on gradually; dawn mirrors it', () => {
  const d = ambientAt(18);
  assert.ok(d.tint[0] > d.tint[2] && d.night > 0 && d.night < 1);
  assert.ok(ambientAt(18.5).night > d.night);
  assert.ok(ambientAt(6.5).night < 1 && ambientAt(6.5).night > ambientAt(7).night);
  assert.equal(ambientAt(8).night, 0);
});

test('the tint is continuous around the clock and handles odd hours', () => {
  let prev = ambientAt(0).tint;
  for (let h = 0.05; h <= 24; h += 0.05) {
    const t = ambientAt(h).tint;
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(t[k] - prev[k]) < 25, `jump at ${h}`);
    prev = t;
  }
  assert.deepEqual(ambientAt(37), ambientAt(13));
  assert.deepEqual(ambientAt(-1), ambientAt(23));
});

test('hourNow: the hour query wins when valid, else the local clock', () => {
  const at = new Date(2026, 0, 1, 9, 30);
  assert.equal(hourNow('', at), 9.5);
  assert.equal(hourNow('?hour=21.5', at), 21.5);
  for (const bad of ['?hour=', '?hour=abc', '?hour=24', '?hour=-3']) assert.equal(hourNow(bad, at), 9.5);
});
