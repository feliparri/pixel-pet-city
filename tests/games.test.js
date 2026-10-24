import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessage, createRateLimiter, LIMITS, GAME_TYPES } from '../src/protocol.js';
import { GAME_RULES, MAX_PLAYERS } from '../src/games/rules.js';
import { SETTLE_MS, ECHO_MS, GONE_GRACE_MS } from '../src/games/rules.js';
import { openLobby, joinLobby, leaveLobby, volunteerSeeker, chooseZone, electReferee, lobbyReady, pickSeeker, buildStart, lobbyKey } from '../src/games/lobby.js';
import { seekerSees, touching, createHide, tickHide, hideStars, hideResults } from '../src/games/hide.js';
import { createChicken, stepChicken, catcher, spawnTile, CHICKEN, planRoute, encodeRoute, decodeRoute } from '../src/games/chicken.js';
import { Walker } from '../src/walker.js';
import { createGames } from '../src/games/manager.js';
import { GAME_PLACES, HIDE_ZONES, DOORS, chickenTile, isWalkable, tileAt, TILES } from '../src/map.js';

const A = 'aaaaaap', B = 'bbbbbbp', C = 'ccccccp', D = 'ddddddp';
const ok = (m) => validateMessage({ id: A, ...m }, {});

test('game messages: well-formed ones pass, and only the known fields survive', () => {
  assert.deepEqual(ok({ t: 'gopen', g: 'hide', r: 'abc123', left: 10000, extra: 1 }), { t: 'gopen', id: A, g: 'hide', r: 'abc123', left: 10000 });
  assert.ok(ok({ t: 'gjoin', r: 'abc123' }) && ok({ t: 'gleave', r: 'abc123' }) && ok({ t: 'grole', r: 'abc123', role: 'seek' }));
  assert.deepEqual(ok({ t: 'gstart', g: 'hide', r: 'abc123', p: [A, B], s: 1 }).p, [A, B]);
  assert.ok(ok({ t: 'gstate', g: 'hide', r: 'abc123', ph: 'search', left: 5000, f: [-1, 12, -2] }));
  assert.ok(ok({ t: 'gstate', g: 'chicken', r: 'abc123', ph: 'play', left: 5000, f: [0, 2] }));
  assert.ok(ok({ t: 'gfound', r: 'abc123', i: 2, at: 40 }));
  assert.ok(ok({ t: 'gchick', r: 'abc123', x: 31, y: 42, d: 'left', m: 'f', s: 0 }));
  assert.ok(ok({ t: 'gcatch', r: 'abc123', i: 0, n: 1 }));
  assert.ok(ok({ t: 'gend', g: 'hide', r: 'abc123', rs: 'time', f: [-1, 20] }));
  assert.ok(ok({ t: 'gend', g: 'hide', r: 'abc123', rs: 'few', f: [] }));
});

test('game messages: unknown games, bad round ids, out-of-range numbers, wrong phases and tiles are refused', () => {
  const bad = [
    { t: 'gopen', g: 'soccer', r: 'abc123', left: 1000 }, { t: 'gopen', g: 'hide', r: 'ABC', left: 1000 }, { t: 'gopen', g: 'hide', r: 'abc123', left: 99999 },
    { t: 'gopen', g: 'hide', r: 'abc123', left: 1.5 }, { t: 'gjoin' }, { t: 'grole', r: 'abc123', role: 'boss' },
    { t: 'gstart', g: 'hide', r: 'abc123', p: [], s: -1 }, { t: 'gstart', g: 'hide', r: 'abc123', p: [A, A], s: 0 }, { t: 'gstart', g: 'hide', r: 'abc123', p: [A, 'x'], s: 0 },
    { t: 'gstart', g: 'hide', r: 'abc123', p: [A, B], s: 2 }, { t: 'gstart', g: 'hide', r: 'abc123', p: Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => `peer${i}xxxx`), s: 0 },
    { t: 'gstate', g: 'hide', r: 'abc123', ph: 'play', left: 1, f: [] }, { t: 'gstate', g: 'chicken', r: 'abc123', ph: 'search', left: 1, f: [] },
    { t: 'gstate', g: 'hide', r: 'abc123', ph: 'search', left: -1, f: [] }, { t: 'gstate', g: 'hide', r: 'abc123', ph: 'search', left: 1, f: [1000] },
    { t: 'gfound', r: 'abc123', i: 13, at: 1 }, { t: 'gfound', r: 'abc123', i: 0, at: -1 },
    { t: 'gchick', r: 'abc123', x: 0, y: 0, d: 'left', m: 'f', s: 0 }, { t: 'gchick', r: 'abc123', x: 99, y: 20, d: 'left', m: 'f', s: 0 },
    { t: 'gchick', r: 'abc123', x: DOORS.town[0].x, y: DOORS.town[0].y, d: 'left', m: 'f', s: 0 }, { t: 'gchick', r: 'abc123', x: 8, y: 14, d: 'left', m: 'f', s: 0 },
    { t: 'gchick', r: 'abc123', x: 30, y: 40, d: 'sideways', m: 'f', s: 0 }, { t: 'gchick', r: 'abc123', x: 30, y: 40, d: 'left', m: 'x', s: 0 },
    { t: 'gcatch', r: 'abc123', i: 0, n: 0 }, { t: 'gend', g: 'hide', r: 'abc123', rs: 'won', f: [] }, { t: 'gend', g: 'hide', r: 'abc123', rs: 'time', f: 'no' },
  ];
  for (const m of bad) assert.equal(ok(m), null, JSON.stringify(m));
  assert.equal(ok({ t: 'gchick', r: 'abc123', x: 31, y: 42, d: 'left', m: 'f', s: 0 }) !== null, true);
  assert.equal(ok({ t: 'gchick', r: 'abc123', x: 23, y: 30, d: 'left', m: 'f', s: 0 }) !== null, true, 'the chicken may be anywhere in the town, on the road too');
});

test('the biggest game message fits the payload limit', () => {
  const p = Array.from({ length: MAX_PLAYERS }, (_, i) => `${String(i).padStart(2, '0')}abcdefghijkl`.slice(0, 15));
  assert.ok(JSON.stringify({ t: 'gstart', id: 'abcdefghijklmnop', g: 'hide', r: 'abcdefghij', p, s: 12 }).length <= 512);
  assert.ok(JSON.stringify({ t: 'gstate', id: 'abcdefghijklmnop', g: 'hide', r: 'abcdefghij', ph: 'search', left: 120000, f: Array(MAX_PLAYERS).fill(-2) }).length <= 512);
  assert.ok(validateMessage({ t: 'gstart', id: A, g: 'hide', r: 'abcdefghij', p, s: 12 }, {}));
});

test('every game message kind has a rate limit, and a flood is cut', () => {
  for (const t of GAME_TYPES) assert.ok(LIMITS[t], `limit for ${t}`);
  let clock = 0;
  const lim = createRateLimiter(() => clock);
  let passed = 0;
  for (let i = 0; i < 50; i++) if (lim.allow(A, 'gopen')) passed++;
  assert.equal(passed, LIMITS.gopen.burst);
  clock += 5000;
  assert.equal(lim.allow(A, 'gopen'), true);
  assert.equal(lim.allow(B, 'gstate'), true, 'another peer has its own bucket');
});

test('the light: a circle of 3 tiles around the seeker, bushes hide inside it, touching always shows', () => {
  const s = { x: 10, y: 10 };
  assert.equal(seekerSees(s, { x: 12, y: 11 }, false), true);
  assert.equal(seekerSees(s, { x: 13, y: 10 }, false), true, 'exactly 3 tiles away');
  assert.equal(seekerSees(s, { x: 13, y: 11 }, false), false, 'a diagonal knight move is past the circle');
  assert.equal(seekerSees(s, { x: 14, y: 10 }, false), false);
  assert.equal(seekerSees(s, { x: 12, y: 10 }, true), false, 'in a bush, even inside the light');
  assert.equal(seekerSees(s, { x: 11, y: 11 }, true), true, 'adjacent to the bush');
  assert.equal(seekerSees(s, { x: 10, y: 10 }, true), true, 'same tile');
  assert.equal(touching({ x: 1, y: 1 }, { x: 2, y: 2 }), true);
  assert.equal(touching({ x: 1, y: 1 }, { x: 3, y: 1 }), false);
});

// ---- the lobby and the referee ----
test('lobby: opening joins the opener, joins and leaves keep the order, volunteers need to have joined', () => {
  const l = openLobby({ g: 'hide', r: 'abc123', opener: C, now: 1000, leftMs: 10000 });
  assert.deepEqual(l.joined, [C]);
  assert.equal(joinLobby(l, A), true); assert.equal(joinLobby(l, A), false);
  assert.equal(volunteerSeeker(l, D), false, 'D did not join');
  assert.equal(volunteerSeeker(l, A), true); assert.equal(volunteerSeeker(l, A), false);
  assert.deepEqual(l.seekers, [A]);
  assert.equal(leaveLobby(l, A), true);
  assert.deepEqual([l.joined, l.seekers], [[C], []]);
  assert.ok(lobbyKey(l) < lobbyKey({ r: 'zzzzzz', opener: A }));
});

test('referee: the lowest present id, ignoring absent ones; it hands over when the referee leaves', () => {
  assert.equal(electReferee([C, A, B], new Set([A, B, C])), A);
  assert.equal(electReferee([C, A, B], new Set([B, C])), B);
  assert.equal(electReferee([C, A, B], new Set([C])), C);
  assert.equal(electReferee([A], new Set()), null);
  assert.equal(electReferee([], new Set([A])), null);
});

test('lobby: ready at the deadline, or early when everybody present joined', () => {
  const l = openLobby({ g: 'chicken', r: 'abc123', opener: A, now: 0, leftMs: 10000 });
  assert.equal(lobbyReady(l, 1000, new Set([A])), false, 'too soon');
  assert.equal(lobbyReady(l, 3500, new Set([A])), true, 'alone: starts after the short minimum');
  assert.equal(lobbyReady(l, 3500, new Set([A, B])), false, 'B has not joined');
  assert.equal(lobbyReady(l, 10000, new Set([A, B])), true);
});

test('roles: a volunteer searches; otherwise the one who searched least, then the first who joined', () => {
  const none = new Map();
  assert.equal(pickSeeker([A, B, C], [C, B], none), C, 'the first volunteer');
  assert.equal(pickSeeker([A, B, C], [], none), A, 'nobody asked: the first who joined');
  assert.equal(pickSeeker([A, B, C], [], new Map([[A, 1]])), B, 'A already searched');
  assert.equal(pickSeeker([A, B, C], [], new Map([[A, 1], [B, 1]])), C);
  assert.equal(pickSeeker([A, B, C], [], new Map([[A, 1], [B, 1], [C, 1]])), A, 'everybody searched once: back to the first');
  assert.equal(pickSeeker([A, B], [D], none), A, 'a volunteer who is gone does not count');
});

test('start: hide needs two, chicken one; players who left are dropped; the seeker is an index', () => {
  const l = openLobby({ g: 'hide', r: 'abc123', opener: B, now: 0, leftMs: 10000 });
  assert.equal(buildStart(l, new Set([B]), new Map()), null, 'alone');
  joinLobby(l, A); joinLobby(l, C); volunteerSeeker(l, C);
  assert.deepEqual(buildStart(l, new Set([A, B, C]), new Map()), { g: 'hide', r: 'abc123', p: [B, A, C], s: 2, z: 'town' });
  assert.deepEqual(buildStart(l, new Set([A, B]), new Map()), { g: 'hide', r: 'abc123', p: [B, A], s: 0, z: 'town' }, 'C left before the start: the rotation picks the first');
  const c = openLobby({ g: 'chicken', r: 'abc123', opener: A, now: 0, leftMs: 10000 });
  assert.deepEqual(buildStart(c, new Set([A]), new Map()), { g: 'chicken', r: 'abc123', p: [A], s: -1 });
});

// ---- hide and seek as a state machine ----
const at = (x, y) => ({ x, y });
test('hide: countdown, then search, a find by touch, the end when all are found', () => {
  const s = createHide({ roster: [A, B, C], seeker: 0, now: 0 });
  const pos = new Map([[A, at(10, 34)], [B, at(30, 40)], [C, at(20, 40)]]);
  const tick = (t) => tickHide(s, t, (id) => pos.get(id), () => true);
  assert.deepEqual(tick(14999), []);
  assert.equal(s.phase, 'count');
  assert.deepEqual(tick(15000), [{ type: 'search' }]);
  assert.equal(s.phase, 'search');
  pos.set(A, at(20, 39));                                         // the seeker walks next to C
  assert.deepEqual(tick(15000 + 20500), [{ type: 'found', i: 2, at: 20 }]);
  assert.deepEqual(s.found, [-1, -1, 20]);
  pos.set(A, at(31, 40));
  assert.deepEqual(tick(15000 + 40000), [{ type: 'found', i: 1, at: 40 }, { type: 'end', reason: 'all' }]);
  assert.deepEqual(hideResults(0, s.found, 'all').map((r) => r.stars), [2, 0, 0], 'the seeker +1 per find, nobody else survived');
});

test('hide: the search ends when the 90 seconds are up; survivors win a star each', () => {
  const s = createHide({ roster: [A, B, C], seeker: 1, now: 0 });
  const pos = new Map([[A, at(5, 40)], [B, at(40, 33)], [C, at(20, 40)]]);
  const tick = (t) => tickHide(s, t, (id) => pos.get(id), () => true);
  tick(15000);
  assert.deepEqual(tick(15000 + 89999), []);
  assert.deepEqual(tick(15000 + 90000), [{ type: 'end', reason: 'time' }]);
  assert.deepEqual(hideResults(1, s.found, 'time').map((r) => [r.role, r.stars]), [['hider', 1], ['seeker', 0], ['hider', 1]]);
});

test('hide: touching during the countdown finds nobody; a hider that leaves is not a survivor; the seeker leaving ends the game without stars', () => {
  const s = createHide({ roster: [A, B, C], seeker: 0, now: 0 });
  const pos = new Map([[A, at(10, 34)], [B, at(10, 35)], [C, at(20, 40)]]);
  let present = new Set([A, B, C]);
  const tick = (t) => tickHide(s, t, (id) => pos.get(id), (id) => present.has(id));
  assert.deepEqual(tick(1000), [], 'the seeker is frozen and blind: no finds while counting');
  present = new Set([A, C]);
  tick(2000);
  assert.equal(s.found[1], -2);
  assert.equal(hideStars(1, 0, s.found, 'time'), 0);
  present = new Set([C]);
  assert.deepEqual(tick(3000), [{ type: 'end', reason: 'left' }]);
  assert.equal(hideStars(2, 0, s.found, 'left'), 0);
});

// ---- the chicken ----
const open = (x, y) => isWalkable(x, y) && x >= 26 && x < 37 && y >= 37 && y < 43 && !TILES[tileAt(x, y)].hide;
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

// an open field with a house in the middle, for the chases
const FW = 30, FH = 20;
const field = (x, y) => x >= 0 && y >= 0 && x < FW && y < FH && !(x >= 12 && x <= 15 && y >= 7 && y <= 12);
const bfs = (sx, sy, tx, ty) => {
  const prev = new Map([[`${sx},${sy}`, null]]), q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const k = `${x + dx},${y + dy}`; if (field(x + dx, y + dy) && !prev.has(k)) { prev.set(k, [x, y]); q.push([x + dx, y + dy]); } }
  }
  const out = []; let c = prev.has(`${tx},${ty}`) ? [tx, ty] : null;
  while (c && prev.get(`${c[0]},${c[1]}`)) { out.push(c); c = prev.get(`${c[0]},${c[1]}`); }
  return out.reverse();
};
/** Runs a chase in the field: the pet steps every 160 ms by `ai`; returns { caught: ms or Infinity, steps: [[ms, x, y, mode]] }. */
function chase(chickenAt, petAt, ai, maxMs = 30000) {
  const ch = createChicken(chickenAt[0], chickenAt[1], 0), pet = { x: petAt[0], y: petAt[1] }, steps = [];
  let petNext = 0;
  for (let t = 0; t < maxMs; t += 20) {
    if (t >= petNext) { ai(pet, ch); petNext += 160; }
    if (stepChicken(ch, [pet], t, () => 0.5, field)) steps.push([t, ch.x, ch.y, ch.mode, pet.x, pet.y]);
    if (Math.hypot(ch.x - pet.x, ch.y - pet.y) < 1.01) return { caught: t, steps, ch };
  }
  return { caught: Infinity, steps, ch };
}
const tail = (pet, ch) => { const p = bfs(pet.x, pet.y, ch.x, ch.y); if (p.length > 1) { pet.x = p[0][0]; pet.y = p[0][1]; } };

test('chicken: chased, it runs at one constant speed (5 tiles a second) with no sprints and no rests, and never steps toward the pet', () => {
  const ch = createChicken(5, 3, 0), pet = { x: 5, y: 0 };
  let t = 0, last = null;
  const gaps = [];
  for (; t < 60000; t += 20) {
    if (t % 160 === 0 && Math.hypot(ch.x - pet.x, ch.y - pet.y) > 4) { if (Math.abs(ch.x - pet.x) > Math.abs(ch.y - pet.y)) pet.x += Math.sign(ch.x - pet.x); else pet.y += Math.sign(ch.y - pet.y); }   // a pet keeping 4 tiles behind
    const before = Math.hypot(ch.x - pet.x, ch.y - pet.y);
    if (stepChicken(ch, [pet], t, () => 0.5, field)) {
      assert.equal(ch.mode, 'flee');
      assert.ok(field(ch.x, ch.y));
      if (t < 3500) assert.ok(Math.hypot(ch.x - pet.x, ch.y - pet.y) >= before, 'on open ground every step goes away from the pet (a corner can force it back)');
      if (last !== null) gaps.push(t - last);
      last = t;
    } else assert.notEqual(ch.mode, 'tired');
  }
  assert.ok(gaps.length > 200, 'it kept running the whole minute');
  assert.ok(gaps.every((g) => g === CHICKEN.fleeMs), `every step ${CHICKEN.fleeMs} ms apart (${[...new Set(gaps)]})`);
  assert.equal(1000 / CHICKEN.fleeMs, 5);
  assert.ok(CHICKEN.fleeMs > 160 && CHICKEN.fleeMs < 240, 'a little slower than a walking pet (160 ms)');
});

test('chicken: it runs while a pet is within 6 tiles and calms down only beyond 8 (hysteresis); calm steps stay slow', () => {
  const ch = createChicken(15, 3, 0);
  const at = (d, t) => { stepChicken(ch, [{ x: ch.x, y: ch.y + d }], t, () => 0.5, field); return ch.mode; };
  assert.equal(at(7, 0), 'wander', '7 tiles: calm');
  assert.equal(at(6, 20), 'flee', '6 tiles: runs');
  assert.equal(at(7, 40), 'flee', 'a little farther is not enough to stop');
  assert.equal(at(8, 60), 'flee');
  assert.equal(at(9, 80), 'wander', 'beyond 8 it wanders again');
  assert.equal(at(7, 100), 'wander', 'and 7 tiles does not scare it again');
  assert.equal(CHICKEN.fleeRadius, 6);
  const calm = createChicken(5, 3, 0), times = [];
  for (let t = 0; t < 30000; t += 20) if (stepChicken(calm, [], t, seq(0.9, 0.1, 0.7, 0.55), field)) times.push(t);
  assert.ok(times.length > 5 && times.every((v, i) => i === 0 || v - times[i - 1] >= CHICKEN.wanderMs), 'wandering steps are at least 480 ms apart');
});

test('chicken: it commits to a heading: straight lines until something blocks the way, no zigzag, no turning back', () => {
  const ch = createChicken(3, 16, 0), turns = [];
  let t = 0, prev = null;
  for (; t < 8000; t += 20) {
    const pet = { x: ch.x - 4, y: ch.y };                              // always four tiles to its west
    if (stepChicken(ch, [pet], t, () => 0.5, field)) { if (prev && prev !== ch.d) turns.push([prev, ch.d, ch.x, ch.y]); prev = ch.d; }
  }
  assert.ok(turns.length <= 4, `few turns: ${JSON.stringify(turns)}`);
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  assert.ok(turns.every(([a, b]) => opposite[a] !== b), 'never a U-turn');
  const plan = planRoute({ x: 3, y: 16, d: 'right' }, [{ x: -1, y: 16 }], field, 8);
  assert.deepEqual(plan.map(([x]) => x), [4, 5, 6, 7, 8, 9, 10, 11], 'the announced route is a straight run');
});

test('chicken: its announced route can be read and beaten: a pet that heads for a tile of that route catches it sooner than one that just follows', () => {
  const start = [[25, 5], [20, 9]];
  const follow = chase(start[0], start[1], tail);
  const cut = chase(start[0], start[1], (pet, ch) => {
    const route = planRoute(ch, [pet], field, 8), goal = route[Math.min(5, route.length - 1)] || [ch.x, ch.y];
    const p = bfs(pet.x, pet.y, goal[0], goal[1]);
    if (p.length) { pet.x = p[0][0]; pet.y = p[0][1]; } else tail(pet, ch);
  });
  assert.ok(follow.caught < Infinity && cut.caught < Infinity, 'both catch it in the end: a pet is faster than the chicken');
  assert.ok(cut.caught <= follow.caught - 800, `cutting corners wins at least 0.8 s (${cut.caught} vs ${follow.caught})`);
});

test('chicken: chased for a long time it runs across the field, only on open tiles', () => {
  const ch = createChicken(5, 3, 0), pet = { x: 5, y: 0 };
  let farthest = 0;
  for (let t = 0; t < 120000; t += 20) {
    if (t % 160 === 0 && Math.hypot(ch.x - pet.x, ch.y - pet.y) > 3) { const p = bfs(pet.x, pet.y, ch.x, ch.y); if (p.length) { pet.x = p[0][0]; pet.y = p[0][1]; } }
    stepChicken(ch, [pet], t, () => 0.5, field);
    assert.ok(field(ch.x, ch.y), `${ch.x},${ch.y}`);
    farthest = Math.max(farthest, Math.hypot(ch.x - 5, ch.y - 3));
  }
  assert.ok(farthest > 15, `it ran across the field (${farthest.toFixed(1)} tiles)`);
});

test('chicken motion: a route is sent as moves and decoded back to the same tiles', () => {
  const tiles = [[5, 4], [5, 3], [6, 3], [7, 3], [7, 4]];
  const moves = encodeRoute(5, 5, tiles);
  assert.equal(moves, 'uurrd');
  assert.deepEqual(decodeRoute(5, 5, moves), [[5, 5], ...tiles]);
  assert.deepEqual(decodeRoute(5, 5, ''), [[5, 5]]);
  assert.ok(ok({ t: 'gchick', r: 'abc123', x: 31, y: 42, d: 'left', m: 'f', s: 0, v: 200, p: 'uurrdlld', o: 60 }));
  assert.equal(ok({ t: 'gchick', r: 'abc123', x: 31, y: 42, d: 'left', m: 'f', s: 0, v: 200, p: 'uurrdlldd' }), null, 'at most 8 moves');
  assert.equal(ok({ t: 'gchick', r: 'abc123', x: 31, y: 42, d: 'left', m: 'f', s: 0, p: 'uxr' }), null);
  assert.equal(ok({ t: 'gchick', r: 'abc123', x: 31, y: 42, d: 'left', m: 'f', s: 0, v: 5 }), null);
  assert.equal(ok({ t: 'gchick', r: 'abc123', x: 31, y: 42, d: 'left', m: 't', s: 0 }), null, 'there is no tired mood any more');
});

test('chicken motion: a remote screen fed a route every 400 ms (200 ms a tile) glides without stopping, and corrects gently', () => {
  const w = new Walker(10, 10);
  w.stepOverride = CHICKEN.fleeMs;
  const refX = (ms) => 10 + Math.floor(ms / CHICKEN.fleeMs);              // the referee's chicken runs east, one tile per 200 ms
  let idle = 0, jumps = 0, prevX = 10, started = false;
  for (let t = 0; t <= 6000; t += 16) {
    if (t % 400 === 0) {                                                 // a message arrives (80 ms late), 8 tiles of route ahead
      const x = refX(Math.max(0, t - 80));
      w.follow(Array.from({ length: 9 }, (_, i) => [x + i, 10]), 'town', 6, 0);
    }
    w.update(16);
    if (t >= 400 && !started) started = true;
    if (started && !w.moving) idle++;
    const p = w.pos();
    if (Math.abs(p.x - prevX) > 0.25) jumps++;
    prevX = p.x;
  }
  assert.equal(idle, 0, 'never stands still between updates');
  assert.equal(jumps, 0, 'never jumps');
  const far = new Walker(10, 10);
  far.follow([[25, 10], [26, 10]], 'town', 6, 0);
  assert.deepEqual([far.tileX, far.tileY], [26, 10], 'a far-away correction snaps and carries on along the route');
  const near = new Walker(10, 10);
  near.follow([[8, 10], [9, 10], [10, 10], [11, 10]], 'town', 6, 0);
  assert.equal(near.tileX, 11, 'a route that includes where it is simply continues forward, never back');
});

test('chicken: with nobody near it wanders calmly and never leaves the area', () => {
  const ch = createChicken(31, 40, 0);
  let t = 0;
  const rnd = seq(0.9, 0.1, 0.7, 0.3, 0.55, 0.05, 0.8);
  for (let i = 0; i < 400; i++) { stepChicken(ch, [], t, rnd, open); t += 250; assert.ok(open(ch.x, ch.y), `${ch.x},${ch.y}`); assert.equal(ch.mode, 'wander'); }
});

test('chicken: a pet touching it catches it; the nearest wins and ties go to the lowest id', () => {
  const ch = createChicken(30, 40, 0);
  assert.equal(catcher(ch, [{ id: A, x: 33, y: 40 }]), null);
  assert.equal(catcher(ch, [{ id: B, x: 31, y: 41 }, { id: C, x: 30, y: 40 }]), C);
  assert.equal(catcher(ch, [{ id: C, x: 31, y: 40 }, { id: B, x: 29, y: 40 }]), B);
  assert.equal(catcher(ch, []), null);
});

test('chicken: a new chicken appears away from the pets when it can, and always on a playable tile', () => {
  const z = GAME_PLACES.chicken.zone, tiles = [];
  for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) if (open(x, y)) tiles.push([x, y]);
  const pets = [{ x: 30, y: 41 }];
  for (const r of [0, 0.3, 0.7, 0.99]) { const [x, y] = spawnTile(tiles, pets, () => r); assert.ok(open(x, y)); assert.ok(Math.hypot(x - 30, y - 41) >= 5); }
  assert.ok(spawnTile([[30, 40]], [{ x: 30, y: 40 }], () => 0));
});

// ---- the whole thing, between browsers ----
function room(ids) {
  let clock = 1000;
  const peers = new Map();
  const stars = new Map();
  const log = [];
  const gone = new Set();
  const lost = { when: null };                       // a predicate (from, msg) -> true drops that message for everybody
  const route = (from, msg) => {
    log.push({ from, ...msg });
    if (lost.when && lost.when(from, msg)) return;
    for (const [pid, p] of peers) {
      if (pid === from || gone.has(pid)) continue;
      const m = validateMessage({ ...msg, id: from }, {});
      assert.ok(m, `the receiver accepts ${msg.t}`);
      p.mgr.onMessage(m);
    }
  };
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const id of ids) {
    const p = { pos: { x: 23, y: 34, area: 'town' }, mgr: null };
    stars.set(id, 0);
    p.mgr = createGames({
      id, now: () => clock, rng,
      send: (msg) => { if (!gone.has(id)) route(id, msg); },
      present: () => new Set(ids.filter((o) => o !== id && !gone.has(o))),
      pos: (pid) => (gone.has(pid) ? null : peers.get(pid).pos),
      name: (pid) => pid.slice(0, 1).toUpperCase(),
      award: (n) => stars.set(id, stars.get(id) + n),
    });
    peers.set(id, p);
  }
  const run = (ms, step = 100) => { for (let t = 0; t < ms; t += step) { clock += step; for (const [pid, p] of peers) if (!gone.has(pid)) p.mgr.update(); } };
  const skip = (ms) => { clock += ms; };                            // time passes with no update at all (a sleeping tab)
  return { peers, stars, log, run, skip, gone, lost, mgr: (id) => peers.get(id).mgr, place: (id, x, y) => { peers.get(id).pos = { x, y, area: 'town' }; }, get now() { return clock; } };
}

test('a hide and seek game from the lobby to the results, with a volunteer seeker and stars', () => {
  const r = room([A, B, C]);
  assert.equal(r.mgr(B).open('hide'), true);
  assert.equal(r.mgr(A).open('chicken'), false, 'one lobby at a time: A already sees the invitation');
  for (const id of [A, B, C]) assert.equal(r.mgr(id).view().lobby.g, 'hide');
  assert.ok(r.mgr(A).view().notices.some((n) => n.kind === 'invite' && n.text === '¡Escondida! ¿Juegan?'));
  assert.equal(r.mgr(A).view().lobby.iJoined, false);
  r.mgr(A).join(); r.mgr(C).join();
  assert.equal(r.mgr(C).volunteer(), true);
  r.run(2000);
  assert.equal(r.mgr(A).view().game, null, 'the lobby is still open');
  r.run(9000);
  for (const id of [A, B, C]) {
    const v = r.mgr(id).view();
    assert.equal(v.lobby, null);
    assert.equal(v.game.g, 'hide');
    assert.equal(v.game.role, id === C ? 'seeker' : 'hider', `role of ${id}`);
    assert.equal(v.game.seekerId, C);
  }
  assert.equal(r.mgr(A).referee(), A, 'the lowest id referees');
  assert.equal(r.mgr(A).movement().frozen, false);
  assert.equal(r.mgr(C).movement().frozen, true, 'the seeker waits while the hiders hide');
  assert.equal(r.mgr(C).seekerVision().full, true);
  r.place(A, 10, 40); r.place(B, 40, 33); r.place(C, 23, 36);
  r.run(15000);
  assert.equal(r.mgr(B).view().game.phase, 'search');
  assert.equal(r.mgr(C).movement().frozen, false);
  assert.equal(r.mgr(C).seekerVision().full, false);
  assert.equal(r.mgr(C).view().game.hidersLeft, 2);
  r.place(C, 11, 40);                                           // the seeker reaches A
  r.run(1000);
  assert.ok(r.mgr(A).view().notices.some((n) => n.text === '¡Te encontré!'));
  assert.equal(r.mgr(B).view().game.hidersLeft, 1);
  r.run(91000);                                                  // time runs out with B still hidden
  for (const id of [A, B, C]) assert.equal(r.mgr(id).view().game, null);
  const res = r.mgr(B).view().results;
  assert.equal(res.reason, 'time');
  assert.deepEqual(res.rows.map((x) => [x.role, x.stars]), [['hider', 1], ['hider', 0], ['seeker', 1]]);
  assert.deepEqual([r.stars.get(A), r.stars.get(B), r.stars.get(C)], [0, 1, 1]);
});

test('nobody volunteers: the seeker rotates to the player who searched least in the next round', () => {
  const r = room([A, B]);
  const play = () => { r.mgr(A).open('hide'); r.mgr(B).join(); r.run(10500); const s = r.mgr(A).view().game.seekerId; r.run(110000); return s; };
  const first = play();
  const second = play();
  assert.equal(first, A);
  assert.equal(second, B);
});

test('the referee leaves in the middle of the search: the next lowest id takes over and the game ends normally', () => {
  const r = room([A, B, C, D]);
  r.mgr(B).open('hide'); r.mgr(A).join(); r.mgr(C).join(); r.mgr(D).join(); r.mgr(D).volunteer();
  r.run(10500);
  r.place(A, 5, 40); r.place(B, 40, 33); r.place(C, 30, 41); r.place(D, 23, 36);
  r.run(15000 + 5000);
  assert.equal(r.mgr(B).referee(), A);
  r.gone.add(A);                                                 // A's tab closes
  r.run(300);
  for (const id of [B, C, D]) assert.equal(r.mgr(id).referee(), B, 'B is the lowest id still here');
  assert.equal(r.mgr(B).view().game.referee, true);
  r.place(D, 30, 40);                                            // D finds C: B, the new referee, notices it
  r.run(1000);
  assert.equal(r.mgr(C).view().game.role, 'found');
  r.place(D, 40, 34);
  r.run(1000);
  assert.ok(r.mgr(B).view().game, 'A may only be late: the game waits before it gives A up');
  r.run(GONE_GRACE_MS);
  for (const id of [B, C, D]) assert.equal(r.mgr(id).view().game, null, `${id} saw the end`);
  assert.equal(r.mgr(C).view().results.reason, 'all');
  assert.equal(r.stars.get(D), 2, 'the seeker found C and B, and A had left');
  assert.equal(r.stars.get(B), 0);
});

test('only the referee can change the shared state: another player cannot end the game or move the clock', () => {
  const r = room([A, B, C]);
  r.mgr(A).open('hide'); r.mgr(B).join(); r.mgr(C).join();
  r.run(10500);
  const round = r.mgr(C).view();
  const rid = r.log.find((m) => m.t === 'gstart').r;
  const forged = (m) => r.mgr(C).onMessage({ id: B, r: rid, ...m });
  forged({ t: 'gend', g: 'hide', rs: 'time', f: [-1, -1, -1] });
  forged({ t: 'gstate', g: 'hide', ph: 'search', left: 1, f: [-1, 5, 5] });
  forged({ t: 'gfound', i: 2, at: 1 });
  assert.equal(r.mgr(C).view().game.phase, 'count');
  assert.equal(r.mgr(C).view().game.left > 2000, true, 'the forged clock was not taken');
  assert.notEqual(r.mgr(C).view().game, null);
  assert.equal(round.game.g, 'hide');
  r.mgr(C).onMessage({ id: B, t: 'gstart', g: 'hide', r: 'zzzzzz', p: [B], s: 0 });          // a start for a lobby that does not exist
  assert.equal(r.mgr(C).view().game.seekerId, round.game.seekerId);
});

test('leaving: "Saliste del juego" for a player, and the game goes on without that pet', () => {
  const r = room([A, B, C, D]);
  r.mgr(A).open('hide'); r.mgr(B).join(); r.mgr(C).join(); r.mgr(D).join(); r.mgr(D).volunteer();
  r.run(3500);
  assert.equal(r.mgr(B).leave(), true);
  assert.ok(r.mgr(B).view().notices.some((n) => n.text === 'Saliste del juego'));
  assert.equal(r.mgr(B).view().game.role, 'spectator');
  assert.equal(r.mgr(B).movement().zone, null, 'a spectator walks anywhere');
  r.run(500);
  assert.equal(r.mgr(C).view().game.hidersLeft, 2, 'A and C are still hiding');
  assert.equal(r.mgr(A).leave(), true);
  r.run(500);
  assert.equal(r.mgr(C).view().game.hidersLeft, 1);
  assert.equal(r.mgr(C).view().game.referee, true, 'the referee left: the next one runs it');
});

test('a pet that did not join watches: no zone, no darkness, but sees the game', () => {
  const r = room([A, B, C]);
  r.mgr(A).open('hide'); r.mgr(B).join();
  r.run(10500);
  const v = r.mgr(C).view();
  assert.equal(v.game.role, 'spectator');
  assert.deepEqual(r.mgr(C).movement(), { frozen: false, zone: null, closed: false });
  assert.equal(r.mgr(C).seekerVision(), null);
  assert.equal(r.mgr(C).view().game.phase, 'count');
});

test('a lobby with too few players is cancelled for everybody', () => {
  const r = room([A, B]);
  r.mgr(A).open('hide');                                          // B never joins
  r.run(11000);
  for (const id of [A, B]) { assert.equal(r.mgr(id).view().lobby, null); assert.equal(r.mgr(id).view().game, null); }
  assert.ok(r.mgr(B).view().notices.some((n) => /Faltaron jugadores/.test(n.text)));
});

test('two lobbies opened at once converge on one', () => {
  const r = room([A, B]);
  r.mgr(A).open('hide'); r.mgr(B).open('chicken');
  assert.equal(r.mgr(A).view().lobby.g, r.mgr(B).view().lobby.g);
});

test('catch the chicken, alone: the browser is its own referee; each catch is 3 stars; the third ends the game', () => {
  const r = room([A]);
  assert.equal(r.mgr(A).open('chicken'), true);
  r.run(3500);
  assert.equal(r.mgr(A).view().game.g, 'chicken');
  assert.equal(r.mgr(A).view().game.referee, true);
  assert.deepEqual(r.mgr(A).movement(), { frozen: false, zone: null, closed: true }, 'no soft wall for the chicken, but the doors are shut');
  r.place(A, 27, 39);
  r.run(1000);
  let catches = 0;
  for (let i = 0; i < 400 && r.mgr(A).view().game; i++) {
    const c = r.mgr(A).view().game.chick;
    if (c && !c.snap || c) r.place(A, c.x, c.y);                  // the pet runs straight onto the chicken
    r.run(100);
    catches = r.mgr(A).view().game ? r.mgr(A).view().game.scores[0].n : 3;
  }
  assert.equal(r.mgr(A).view().game, null, 'the game ended');
  const res = r.mgr(A).view().results;
  assert.equal(res.reason, 'goal');
  assert.equal(res.rows[0].found, 3);
  assert.equal(r.stars.get(A), 9);
  assert.ok(catches >= 0);
});

test('catch the chicken: while it flees the referee sends a motion about every 400 ms, and the other screen gets the route ahead', () => {
  const r = room([A, B]);
  r.mgr(A).open('chicken'); r.mgr(B).join();
  r.run(3500);
  for (let i = 0; i < 30 && !(r.mgr(A).view().game && r.mgr(A).view().game.chick); i++) r.run(100);
  const first = r.mgr(A).view().game.chick;
  r.place(B, Math.min(36, first.x + 3), first.y);                // a chaser close to it; A is the referee and stays away
  r.place(A, 23, 34);
  const from = r.log.length;
  for (let i = 0; i < 40; i++) { const c = r.mgr(A).view().game.chick; r.place(B, c.x - 3, c.y); r.run(100); }       // the chaser keeps three tiles behind it
  const msgs = r.log.slice(from).filter((m) => m.t === 'gchick' && m.m === 'f');
  assert.ok(msgs.length >= 5 && msgs.length <= 12, `a few motions, not a message per step (${msgs.length} in 4 s)`);
  assert.ok(msgs.every((m) => m.v === CHICKEN.fleeMs && typeof m.p === 'string' && m.p.length >= 4 && m.o >= 0), 'each carries its pace and the next moves');
  const seen = r.mgr(B).view().game.chick;
  assert.ok(seen.route.length >= 4 && seen.v === CHICKEN.fleeMs, 'the other browser holds a route to glide along');
});

test('catch the chicken: with nobody chasing, it wanders calmly, starts at the gallinero, and the round ends at 60 seconds', () => {
  const r = room([A, B]);
  r.mgr(A).open('chicken'); r.mgr(B).join();
  r.run(3500);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    r.run(100);
    const c = r.mgr(B).view().game && r.mgr(B).view().game.chick;
    if (c) { seen.add(`${c.x},${c.y}`); assert.ok(chickenTile(c.x, c.y), `${c.x},${c.y} is playable`); }
  }
  assert.ok(seen.size > 3, 'the chicken wandered');
  r.run(41000);
  assert.equal(r.mgr(A).view().game, null);
  assert.equal(r.mgr(B).view().results.reason, 'time');
});

test('catch the chicken: the pet that touches it first gets the stars and everybody sees the announcement', () => {
  const r = room([A, B]);
  r.mgr(B).open('chicken'); r.mgr(A).join();
  r.run(3500);
  r.place(A, 36, 37); r.place(B, 26, 42);
  r.run(1500);
  const c = r.mgr(A).view().game.chick;
  assert.ok(c, 'the chicken is out');
  r.place(B, c.x, c.y);
  r.run(200);
  assert.ok(r.mgr(A).view().notices.some((n) => n.text === '¡B atrapó a la gallina!'));
  assert.equal(r.stars.get(B), GAME_RULES.chicken.starsPerCatch);
  assert.equal(r.stars.get(A), 0);
  assert.equal(r.mgr(A).view().game.chick, null, 'it respawns a moment later');
  r.run(2500);
  assert.ok(r.mgr(A).view().game.chick, 'a new chicken');
});

// ---- regressions: "¡Yo busco!" ignored, and a round that ended early ----
test('"¡Yo busco!" pressed right after joining a lobby that was already full of everybody present is honoured (the early start waits for the buttons)', () => {
  const r = room([A, B]);
  r.mgr(A).open('hide');
  r.run(6000);                                           // A has waited alone for longer than the early-start minimum
  assert.equal(r.mgr(B).join(), true);
  r.run(300);                                            // everybody present has joined, but B has not found the button yet
  assert.ok(r.mgr(A).view().lobby, 'the lobby does not start on top of the join');
  assert.equal(r.mgr(B).volunteer(), true);
  r.run(SETTLE_MS - 200);
  assert.ok(r.mgr(A).view().lobby, 'and not on top of the button press');
  r.run(1000);
  const g = r.mgr(A).view().game;
  assert.ok(g, 'then it starts');
  assert.equal(g.seekerId, B, 'B searches, as it asked');
  assert.equal(r.mgr(B).view().game.role, 'seeker');
});

test('a "¡Yo busco!" (or a join) that a peer never received is repeated until the lobby closes', () => {
  const r = room([A, B]);
  r.mgr(A).open('hide');
  r.lost.when = (from, m) => from === B && (m.t === 'grole' || m.t === 'gjoin') && r.now < 3000;      // the first copies are lost on the way
  r.mgr(B).join(); r.mgr(B).volunteer();
  r.run(ECHO_MS * 2);
  assert.deepEqual(r.mgr(A).view().lobby && [r.mgr(A).view().lobby.joined, r.mgr(A).view().lobby.seekers], [2, 1], 'A learned both from the repeats');
  r.run(9000);
  assert.equal(r.mgr(A).view().game.seekerId, B);
});

test('hide: a referee that wakes up late (a hidden tab) still gives the search its full 90 seconds', () => {
  const s = createHide({ roster: [A, B], seeker: 0, now: 0 });
  const pos = (id) => (id === A ? { x: 3, y: 34 } : { x: 40, y: 40 });
  const events = tickHide(s, 15000 + 40000, pos, () => true);          // the countdown ended 40 s ago and nobody was awake to say so
  assert.deepEqual(events.map((e) => e.type), ['search']);
  assert.equal(s.phaseEnd, 55000 + GAME_RULES.hide.searchMs);
  assert.deepEqual(tickHide(s, 55000 + GAME_RULES.hide.searchMs - 1, pos, () => true), []);
});

test('a tab that was asleep (no updates for a while) does not lose the countdown or the search: the clocks wait for it', () => {
  const r = room([A, B]);
  r.mgr(A).open('hide'); r.mgr(B).join(); r.mgr(B).volunteer();
  r.run(10500);
  r.place(A, 40, 40); r.place(B, 3, 34);
  r.run(5000);                                                          // 5 s into the countdown
  r.mgr(A).update();                                                    // (A is the referee)
  const before = r.mgr(A).view().game.left;
  r.skip(40000);                                                        // A's tab sleeps for 40 s: no frames, no updates
  r.run(100);
  assert.equal(r.mgr(A).view().game.phase, 'count', 'still counting: the sleep did not use the countdown up');
  assert.ok(Math.abs(r.mgr(A).view().game.left - before) < 300);
  r.run(before + 500);
  assert.equal(r.mgr(A).view().game.phase, 'search');
  r.skip(30000);
  r.run(100);
  r.run(GAME_RULES.hide.searchMs - 3000);                               // 90 s of search minus the few seconds that already passed
  assert.ok(r.mgr(A).view().game, 'the search is still on: it was not shortened by the sleep');
  r.run(4000);
  assert.equal(r.mgr(A).view().game, null);
  assert.equal(r.mgr(B).view().results.reason, 'time');
});

test('a hider whose tab goes quiet for a few seconds (a missed heartbeat) is not given up: only a long absence is', () => {
  const r = room([A, B, C]);
  r.mgr(A).open('hide'); r.mgr(B).join(); r.mgr(C).join(); r.mgr(C).volunteer();
  r.run(10500);
  r.place(A, 40, 40); r.place(B, 20, 40); r.place(C, 3, 34);
  r.run(16000);
  r.gone.add(B);                                                        // B's heartbeats stop for a moment ...
  r.run(5000);
  r.gone.delete(B);                                                     // ... and come back
  r.run(1000);
  assert.ok(r.mgr(A).view().game, 'the round goes on');
  assert.equal(r.mgr(A).view().game.hidersLeft, 2, 'B is still a hider, not "left"');
  r.gone.add(A);                                                        // A, the others' referee, vanishes only briefly too
  r.run(3000);
  r.gone.delete(A);
  r.run(1000);
  assert.ok(r.mgr(C).view().game, 'and still goes on');
  r.gone.add(A); r.gone.add(B);                                         // but really leaving ends it
  r.run(GONE_GRACE_MS + 1000);
  assert.equal(r.mgr(C).view().game, null);
});

// ---- the hide and seek zone ----
test('zones: park, plaza or the whole town; every pad is on open ground inside its own zone', () => {
  assert.deepEqual(Object.keys(HIDE_ZONES), ['park', 'plaza', 'town']);
  assert.deepEqual(Object.values(HIDE_ZONES).map((z) => z.name), ['Parque', 'Plaza', 'Todo el pueblo']);
  for (const z of Object.values(HIDE_ZONES)) { assert.ok(z.has(...z.pad), z.name); assert.ok(isWalkable(...z.pad), z.name); }
  assert.equal(HIDE_ZONES.plaza.has(20, 23), true); assert.equal(HIDE_ZONES.plaza.has(20, 33), false);
  assert.equal(HIDE_ZONES.park.has(20, 33), true); assert.equal(HIDE_ZONES.park.has(20, 23), false);
  assert.equal(HIDE_ZONES.town.has(20, 5), true); assert.equal(HIDE_ZONES.town.has(48, 5), false);
});

test('zones: the first joined player to choose decides; the default is the whole town; chicken has none', () => {
  const l = openLobby({ g: 'hide', r: 'abc123', opener: A, now: 0, leftMs: 10000 });
  assert.equal(l.zone, 'town');
  assert.equal(chooseZone(l, B, 'plaza'), false, 'B has not joined');
  assert.equal(chooseZone(l, A, 'moon'), false);
  assert.equal(chooseZone(l, A, 'park'), true);
  joinLobby(l, B);
  assert.equal(chooseZone(l, B, 'plaza'), false, 'too late: the first choice stays');
  assert.equal(l.zone, 'park');
  assert.equal(chooseZone(openLobby({ g: 'chicken', r: 'abc123', opener: A, now: 0, leftMs: 1 }), A, 'park'), false);
});

test('zones: messages are validated', () => {
  assert.ok(ok({ t: 'gzone', r: 'abc123', z: 'plaza' }));
  assert.equal(ok({ t: 'gzone', r: 'abc123', z: 'moon' }), null);
  assert.equal(ok({ t: 'gstart', g: 'hide', r: 'abc123', p: [A, B], s: 0, z: 'moon' }), null);
  assert.equal(ok({ t: 'gstart', g: 'hide', r: 'abc123', p: [A, B], s: 0, z: 'park' }).z, 'park');
  assert.equal(ok({ t: 'gstart', g: 'hide', r: 'abc123', p: [A, B], s: 0 }).z, undefined, 'older senders: no zone, the whole town');
});

test('zones: the lobby shows the choice to everybody, the game is played in the chosen zone, and the walls follow it', () => {
  const r = room([A, B, C]);
  r.mgr(A).open('hide'); r.mgr(B).join(); r.mgr(C).join(); r.mgr(C).volunteer();
  const v = (id) => r.mgr(id).view().lobby;
  assert.deepEqual([v(A).zone, v(A).zoneName, v(A).canPickZone], ['town', 'Todo el pueblo', true]);
  assert.equal(r.mgr(B).pickZone('plaza'), true);
  assert.equal(r.mgr(A).pickZone('park'), false, 'B was first');
  for (const id of [A, B, C]) assert.deepEqual([v(id).zone, v(id).zoneName, v(id).zoneLocked, v(id).canPickZone], ['plaza', 'Plaza', true, false]);
  r.run(10500);
  for (const id of [A, B, C]) {
    const g = r.mgr(id).view().game;
    assert.deepEqual([g.zone, g.zoneName], ['plaza', 'Plaza']);
    assert.equal(r.mgr(id).movement().zone, HIDE_ZONES.plaza);
    assert.equal(r.mgr(id).movement().zone.wall, 'Vuelve a la plaza');
    assert.equal(r.mgr(id).movement().closed, true);
  }
  r.place(C, 20, 23); r.place(A, 21, 33); r.place(B, 40, 38);          // C seeks in the plaza; A is outside the zone; B is in the park
  r.run(15000);
  r.place(A, 20, 24);                                                  // A inside the plaza next to C: found
  r.run(500);
  assert.equal(r.mgr(C).view().game.hidersLeft, 1);
  r.place(B, 21, 24);                                                  // B comes into the plaza next to C: the last hider is found
  r.run(500);
  assert.equal(r.mgr(C).view().game, null);
  assert.equal(r.mgr(C).view().results.reason, 'all');
});

test('zones: a pet outside the chosen zone is never found, even touching the seeker', () => {
  const r = room([A, B]);
  r.mgr(A).open('hide'); r.mgr(B).join(); r.mgr(B).volunteer(); r.mgr(A).pickZone('plaza');
  r.run(10500);
  r.place(B, 3, 34); r.place(A, 4, 34);                               // both in the park, neither in the plaza
  r.run(16000);
  assert.equal(r.mgr(B).view().game.hidersLeft, 1);
  r.place(B, 20, 23); r.place(A, 20, 24);                              // now both are in the plaza
  r.run(500);
  assert.equal(r.mgr(B).view().game, null, 'found, and the only hider: the game is over');
});

test('zones: the whole town has no wall but the doors stay shut; the park and the plaza have a wall', () => {
  const r = room([A, B]);
  r.mgr(A).open('hide'); r.mgr(B).join();
  r.run(10500);
  assert.deepEqual(r.mgr(A).movement(), { frozen: r.mgr(A).movement().frozen, zone: null, closed: true });
  assert.equal(r.mgr(A).view().game.zoneName, 'Todo el pueblo');
});

// ---- who is drawn ----
test('visibility: in a game its players see only the players; spectators, the lobby and the time after the game show everybody', () => {
  const r = room([A, B, C, D]);
  r.mgr(A).open('hide'); r.mgr(B).join(); r.mgr(C).join(); r.mgr(C).volunteer();              // D never joins
  for (const id of [A, B, C, D]) for (const o of [A, B, C, D]) assert.equal(r.mgr(id).canSee(o), true, 'in the lobby everybody sees everybody');
  r.run(10500);
  for (const id of [A, B, C]) {
    assert.deepEqual([A, B, C, D].filter((o) => r.mgr(id).canSee(o)), [A, B, C], `${id} sees the players only`);
  }
  assert.deepEqual([A, B, C, D].filter((o) => r.mgr(D).canSee(o)), [A, B, C, D], 'D watches and sees everybody');
  r.place(A, 3, 34); r.place(B, 40, 38); r.place(C, 4, 34); r.place(D, 4, 35);
  r.run(15500);                                                                        // C finds A: A becomes a spectator of the game, still seeing the players
  assert.equal(r.mgr(A).view().game.role, 'found');
  assert.deepEqual([A, B, C, D].filter((o) => r.mgr(A).canSee(o)), [A, B, C]);
  r.mgr(B).leave();
  assert.equal(r.mgr(C).canSee(B), false, 'a player who left the game is no longer drawn for the players');
  r.run(95000);
  assert.equal(r.mgr(A).view().game, null);
  for (const o of [A, B, C, D]) assert.equal(r.mgr(A).canSee(o), true, 'after the game everybody is back');
});
