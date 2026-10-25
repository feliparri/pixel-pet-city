import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE, startSlot, hasFinished, tickRace, raceStars, raceResults, stumbled, paceAt } from '../src/games/race.js';
import { TRACK, tileAt, isWalkable } from '../src/map.js';

const A = 'aaaaaap', B = 'bbbbbbp', C = 'ccccccp';

test('race: starting slots are walkable tiles below the start line, spread over the three lanes', () => {
  const seen = new Set();
  for (let k = 0; k < 13; k++) {
    const [x, y] = startSlot(k);
    assert.ok(isWalkable(x, y) && y > TRACK.yBottom && x >= TRACK.x0 && x <= TRACK.x1, `${x},${y}`);
    seen.add(`${x},${y}`);
  }
  assert.ok(seen.size >= 9);
  assert.deepEqual(startSlot(0).map((v) => v), [TRACK.x0, TRACK.yBottom + 1]);
});

test('race: a pet has finished when it reaches the checkered row of the track', () => {
  assert.equal(hasFinished({ x: 40, y: TRACK.yTop }), true);
  assert.equal(hasFinished({ x: 40, y: TRACK.yTop + 1 }), false);
  assert.equal(hasFinished({ x: 20, y: TRACK.yTop }), false, 'not on the track');
  assert.equal(hasFinished(null), false);
});

test('race: places go in the order of arrival, a tie goes to the lowest roster index, and it ends when everybody has finished', () => {
  const s = { roster: [A, B, C], f: [0, 0, 0], phase: 'play', phaseEnd: 60000, firstAt: null };
  const at = { [A]: { x: 39, y: 60 }, [B]: { x: 40, y: 56 }, [C]: { x: 41, y: 50 } };
  const pos = (id) => at[id], here = () => true;
  assert.deepEqual(tickRace(s, 1000, pos, here), []);
  at[C] = { x: 41, y: TRACK.yTop };
  assert.deepEqual(tickRace(s, 2000, pos, here), [{ type: 'finish', i: 2, n: 1 }]);
  assert.deepEqual(s.f, [0, 0, 1]);
  at[A] = { x: 39, y: TRACK.yTop }; at[B] = { x: 40, y: TRACK.yTop };
  assert.deepEqual(tickRace(s, 3000, pos, here), [{ type: 'finish', i: 0, n: 2 }, { type: 'finish', i: 1, n: 3 }, { type: 'end', reason: 'all' }]);
  assert.deepEqual(s.f, [2, 3, 1]);
});

test('race: once somebody finishes the others have a limited time, and the whole race has a time limit', () => {
  const mk = () => ({ roster: [A, B], f: [0, 0], phase: 'play', phaseEnd: 60000, firstAt: null });
  const s = mk(), at = { [A]: { x: 40, y: TRACK.yTop }, [B]: { x: 40, y: 60 } };
  tickRace(s, 5000, (id) => at[id], () => true);
  assert.equal(s.firstAt, 5000);
  assert.deepEqual(tickRace(s, 5000 + RACE.capMs - 1, (id) => at[id], () => true), []);
  assert.deepEqual(tickRace(s, 5000 + RACE.capMs, (id) => at[id], () => true), [{ type: 'end', reason: 'time' }]);
  const t = mk();
  assert.deepEqual(tickRace(t, 60000, () => ({ x: 40, y: 60 }), () => true), [{ type: 'end', reason: 'time' }]);
});

test('race: a player who left is not waited for; nobody finishing and everybody gone ends it', () => {
  const s = { roster: [A, B], f: [0, 0], phase: 'play', phaseEnd: 60000, firstAt: null };
  const ev = tickRace(s, 2000, (id) => (id === A ? { x: 40, y: TRACK.yTop } : null), (id) => id === A);
  assert.deepEqual(ev, [{ type: 'finish', i: 0, n: 1 }, { type: 'end', reason: 'all' }]);
  assert.equal(s.f[1], -2, 'B gave up');
});

test('race: stars by place, nothing for those who did not finish, and nothing when racing alone', () => {
  assert.deepEqual([1, 2, 3, 4, 7].map((n) => raceStars(n, 5)), [5, 3, 2, 1, 1]);
  assert.equal(raceStars(0, 5), 0); assert.equal(raceStars(-2, 5), 0);
  assert.equal(raceStars(1, 1), 0, 'a lone racer is practising');
  const rows = raceResults([2, 0, 1]);
  assert.deepEqual(rows.map((r) => [r.i, r.place, r.stars]), [[0, 2, 3], [1, 0, 0], [2, 1, 5]]);
});

test('race: stepping onto an obstacle slows the pet for about a second, and only the step onto it counts', () => {
  const hurdle = [TRACK.x0, 0];
  let found = null;
  for (let y = TRACK.yTop + 1; y <= TRACK.yBottom && !found; y++) for (let x = TRACK.x0; x <= TRACK.x1; x++) if (['V', 'w', 'W'].includes(tileAt(x, y))) { found = [x, y]; break; }
  assert.ok(found && hurdle);
  assert.equal(stumbled(null, { x: found[0], y: found[1] }), true);
  assert.equal(stumbled({ x: found[0], y: found[1] }, { x: found[0], y: found[1] }), false, 'standing on it');
  assert.equal(stumbled(null, { x: 0, y: 0 }), false);
  assert.equal(paceAt(1000, 1500), RACE.slowStepMs, 'during the second');
  assert.equal(paceAt(2100, 1500), null, 'after it: normal pace');
  assert.ok(RACE.slowMs >= 900 && RACE.slowMs <= 1200 && RACE.slowStepMs >= 250);
});
