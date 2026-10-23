import test from 'node:test';
import assert from 'node:assert/strict';
import { entranceState, entranceDuration, entranceId, devEntrance, flickers, DEFAULT_ENTRANCE, ENTRANCE_IDS, PUBLIC_ENTRANCES } from '../src/entrance.js';
import { ENTRANCES } from '../supabase/functions/trip/trip-code.js';

test('the town and the server know the same entrance ids, and the default is the parachute', () => {
  assert.deepEqual(ENTRANCE_IDS, ENTRANCES);
  assert.equal(DEFAULT_ENTRANCE, 'parachute');
  assert.deepEqual(PUBLIC_ENTRANCES, ['parachute']);
  assert.equal(entranceId('liana'), 'parachute');
  assert.equal(entranceId(undefined), 'parachute');
});

test('parachute arrival: starts above the screen, sinks monotonically, folds the canopy, lands exactly', () => {
  const d = entranceDuration('parachute', 'arrive');
  let last = Infinity;
  for (let ms = 0; ms < d; ms += 50) {
    const s = entranceState('parachute', 'arrive', ms);
    assert.ok(s.lift <= last + 1e-9);
    last = s.lift;
    assert.ok(!s.hidden && !s.done);
  }
  assert.equal(entranceState('parachute', 'arrive', 0).lift, 1);
  assert.equal(entranceState('parachute', 'arrive', 0).canopy, 1);
  assert.equal(entranceState('parachute', 'arrive', d * 0.95).canopy, 2);
  const end = entranceState('parachute', 'arrive', d);
  assert.deepEqual([end.done, end.lift, end.canopy, end.sway, end.hidden], [true, 0, 0, 0, false]);
});

test('parachute exit: balloon, rises past the top edge, then gone', () => {
  const d = entranceDuration('parachute', 'leave');
  assert.equal(entranceState('parachute', 'leave', 0).balloon, true);
  assert.equal(entranceState('parachute', 'leave', 0).lift, 0);
  assert.ok(entranceState('parachute', 'leave', d - 1).lift > 1);
  const end = entranceState('parachute', 'leave', d);
  assert.deepEqual([end.done, end.hidden, end.balloon], [true, true, false]);
});

test('blue bolt: the pet is hidden until the strike, the glare fades; leaving mirrors it', () => {
  const a = (ms) => entranceState('blue_bolt', 'arrive', ms);
  assert.equal(a(0).hidden, true);
  assert.ok(a(150).bolt > 0 && a(150).hidden);
  assert.equal(a(400).hidden, false);
  assert.ok(a(400).flash > a(800).flash);
  assert.deepEqual([a(900).done, a(900).flash, a(900).bolt], [true, 0, 0]);
  const l = (ms) => entranceState('blue_bolt', 'leave', ms);
  assert.equal(l(0).hidden, false);
  assert.ok(l(300).flash > 0 && !l(300).hidden);
  assert.ok(l(420).bolt > 0);
  assert.equal(l(500).hidden, true);
  assert.equal(l(900).done, true);
  assert.ok(flickers('blue_bolt', 'leave', 50) && !flickers('blue_bolt', 'leave', 10) && !flickers('parachute', 'leave', 50));
});

test('the dev flag selects an extra entrance only with dev=1 and a known id', () => {
  assert.equal(devEntrance('?trip=ABC234&dev=1&entrance=blue_bolt'), 'blue_bolt');
  assert.equal(devEntrance('?entrance=blue_bolt'), null);
  assert.equal(devEntrance('?dev=1&entrance=nope'), null);
  assert.equal(devEntrance(''), null);
});
