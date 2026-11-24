import test from 'node:test';
import assert from 'node:assert/strict';
import { WAVE, WAVE_LIFE_MS, waveAt, crestRow, crestOffset, judgeCatch, surfAction, createSurf, surfFlag, press, wipeout, wipeOver, finishRide, rideDecide, waveStrokes,
  CATCH_TILES, PROMPT_AHEAD, PROMPT_BEHIND, WIPE_MS, MAX_LAG, MAX_AHEAD, RIDE_MS, BOARD } from '../src/surf.js';
import { BEACH, waterAt, isWalkable, isBreak, shallowFrom } from '../src/map.js';

const X = BEACH.breakX[0], Y = 20;
const at = (ageMs, id = 7) => id * WAVE.periodMs + ageMs;            // a clock reading `ageMs` into wave number `id`
const withBoard = [BOARD];
/** The clock reading at which the crest is `e` rows below (negative) or above (positive) a pet at (x, y): offset = y - crest row. */
const clockAt = (x, y, e) => at(((WAVE.k0 - (y - e - x)) / WAVE.speed) * 1000);

test('waves come from the clock: the same instant gives the same wave, one every period, climbing the screen and dying off the top', () => {
  assert.deepEqual(waveAt(at(1000)), waveAt(at(1000)));
  assert.equal(waveAt(at(0)).k, WAVE.k0);
  assert.ok(Math.abs(waveAt(at(1000)).k - (WAVE.k0 - WAVE.speed)) < 1e-9);
  assert.equal(waveAt(at(1000, 7)).id + 1, waveAt(at(1000, 8)).id);
  assert.equal(waveAt(at(1000, 7)).k, waveAt(at(1000, 8)).k, 'every wave is the same');
  assert.ok(waveAt(at(WAVE_LIFE_MS - 10)));
  assert.equal(waveAt(at(WAVE_LIFE_MS + 10)), null, 'quiet until the next one');
  assert.ok(WAVE_LIFE_MS < WAVE.periodMs, 'one wave at a time');
  assert.equal(waveAt(NaN), null);
  const base = 5e12 - (5e12 % WAVE.periodMs), a = waveAt(base + 1234), b = waveAt(base + 1234 + WAVE.periodMs);
  assert.ok(Math.abs(a.k - b.k) < 1e-6);
});

test('the front is a diagonal that climbs: the row of the crest falls with the clock at every column, and rises towards the south-east along the line', () => {
  const w0 = waveAt(at(500)), w1 = waveAt(at(1500));
  for (const x of [2, 10, 18]) assert.ok(Math.abs(crestRow(w0, x) - crestRow(w1, x) - WAVE.speed) < 1e-9, `column ${x} climbs ${WAVE.speed} rows a second`);
  assert.equal(crestRow(w0, 11) - crestRow(w0, 10), 1, 'one row lower for every column to the east: a "\\" line');
  const early = waveAt(at(100));
  assert.ok(crestRow(early, 1) > 34, 'it starts below the bottom of the map');
  const late = waveAt(at(WAVE_LIFE_MS - 50));
  assert.ok(crestRow(late, 22) < 1, 'and leaves above the top');
  assert.ok(waveAt(at(3000)).peel < waveAt(at(500)).peel, 'the peel point runs out to the open sea');
  assert.ok(waveAt(at(0)).peel <= WAVE.peelFrom && waveAt(at(WAVE_LIFE_MS - 1)).peel >= WAVE.peelTo);
});

test('the catch window: early before it, a catch inside it, late after it', () => {
  assert.equal(judgeCatch(-CATCH_TILES - 0.01), 'early');
  assert.equal(judgeCatch(-CATCH_TILES), 'catch');
  assert.equal(judgeCatch(0), 'catch');
  assert.equal(judgeCatch(CATCH_TILES), 'catch');
  assert.equal(judgeCatch(CATCH_TILES + 0.01), 'late');
  assert.ok(PROMPT_AHEAD > CATCH_TILES && PROMPT_BEHIND > CATCH_TILES, 'early and late presses are possible while the prompt shows');
});

test('crestOffset: negative while the crest is coming up from below, positive after it passed, null when far', () => {
  assert.ok(Math.abs(crestOffset(clockAt(X, Y, 0), X, Y)) < 1e-9);
  const coming = crestOffset(clockAt(X, Y, -5), X, Y);
  assert.ok(Math.abs(coming + 5) < 1e-9, 'five rows below the pet');
  assert.ok(Math.abs(crestOffset(clockAt(X, Y, 2), X, Y) - 2) < 1e-9);
  assert.equal(crestOffset(clockAt(X, Y, -PROMPT_AHEAD - 1), X, Y), null);
  assert.equal(crestOffset(clockAt(X, Y, PROMPT_BEHIND + 1), X, Y), null);
  assert.equal(crestOffset(at(9800), X, Y), null);
  const t = clockAt(X, Y, -3);
  assert.ok(crestOffset(t, X + 4, Y) < crestOffset(t, X, Y), 'further east the crest is lower on the screen: it reaches a pet there later');
});

test('the prompt: needs the break, then the board, then a wave', () => {
  const near = clockAt(X, Y, -3);
  assert.equal(surfAction(near, 40, Y, withBoard), null, 'on the sand there is nothing');
  assert.equal(surfAction(near, 12, Y, withBoard), null, 'deep water but not the break');
  assert.ok(isBreak(X, Y, 'beach'));
  const hint = surfAction(near, X, Y, []);
  assert.deepEqual([hint.id, hint.label], ['hint', 'Necesitas una Tabla de surf — Almacén']);
  assert.equal(surfAction(near, X, Y, undefined).id, 'hint');
  assert.deepEqual(surfAction(near, X, Y, withBoard), { id: 'surf', label: 'Tomar la ola', target: 'wave' });
  assert.equal(surfAction(at(9800), X, Y, withBoard).id, 'hint', 'no wave near: wait for it');
});

test('state machine: a press in the window starts a ride, too early or too late is a wipeout, no board or no wave does nothing', () => {
  const run = (e, tools = withBoard, x = X) => { const s = createSurf(); const r = press(s, { utcMs: clockAt(x, Y, e), x, y: Y, tools, t: 100 }); return [r, s]; };
  let [r, s] = run(0);
  assert.equal(r, 'catch'); assert.equal(s.mode, 'ride'); assert.equal(surfFlag(s), 1); assert.equal(s.since, 100); assert.equal(s.steps, 0);
  [r, s] = run(-1.8); assert.equal(r, 'catch');
  [r, s] = run(1.8); assert.equal(r, 'catch');
  [r, s] = run(-4); assert.equal(r, 'early'); assert.equal(s.mode, 'wipe'); assert.equal(s.why, 'early'); assert.equal(surfFlag(s), 2);
  [r, s] = run(2.6); assert.equal(r, 'late'); assert.equal(s.mode, 'wipe');
  [r, s] = run(0, []); assert.equal(r, 'none'); assert.equal(s.mode, 'idle');
  [r, s] = run(0, withBoard, 20); assert.equal(r, 'none', 'not at the break');
  [r, s] = run(-20); assert.equal(r, 'none', 'no wave near');
  const busy = createSurf(); busy.mode = 'ride';
  assert.equal(press(busy, { utcMs: clockAt(X, Y, 0), x: X, y: Y, tools: withBoard, t: 1 }), 'none', 'already riding');
});

test('the flag: riding 1, wiped out 2, paddling on the board 3, nothing 0; a ride or a fall wins over the paddle', () => {
  const s = createSurf();
  assert.equal(surfFlag(s), 0); assert.equal(surfFlag(s, true), 3);
  s.mode = 'ride'; assert.equal(surfFlag(s, true), 1);
  s.mode = 'wipe'; assert.equal(surfFlag(s, true), 2);
});

test('a wipeout lasts WIPE_MS and then the pet is free again; a finished ride resets', () => {
  const s = createSurf();
  wipeout(s, 1000, 'late');
  assert.equal(wipeOver(s, 1000 + WIPE_MS - 1), false); assert.equal(s.mode, 'wipe');
  assert.equal(wipeOver(s, 1000 + WIPE_MS), true); assert.equal(s.mode, 'idle'); assert.equal(surfFlag(s), 0);
  assert.equal(wipeOver(s, 9999), false);
  s.mode = 'ride'; s.wave = 3; s.steps = 9; finishRide(s);
  assert.deepEqual([s.mode, s.wave, s.why, s.steps], ['idle', null, null, 0]);
});

const map = { walkable: (x, y) => isWalkable(x, y, 'beach'), water: (x, y) => waterAt(x, y, 'beach') };
test('the ride: north or east keep the rider on the crest, up and down pick the direction, waiting when ahead, ending in the shallows, at the edge or when it falls behind', () => {
  // a pet at (10, 20) with the crest e rows below it: k = row - e - column
  const d = (o = {}) => rideDecide({ ...map, x: 10, y: 20, k: 20 - 0 - 10, steer: undefined, steps: 0, ...o });
  assert.deepEqual(d(), { type: 'move', dx: 0, dy: -1 }, 'on the crest: north first');
  assert.deepEqual(d({ steps: 1 }), { type: 'move', dx: 1, dy: 0 }, 'then east: a diagonal');
  assert.deepEqual(d({ steer: 'up', steps: 1 }), { type: 'move', dx: 0, dy: -1 });
  assert.deepEqual(d({ steer: 'down' }), { type: 'move', dx: 1, dy: 0 });
  assert.deepEqual(d({ k: 20 - 10 + 4 }), { type: 'wait' }, 'four rows ahead of the crest: the wave comes on');
  assert.notDeepEqual(d({ k: 20 - 10 + MAX_AHEAD - 1 }).type, 'wait', 'a little ahead is fine');
  assert.deepEqual(d({ k: 10 - MAX_LAG - 1 }), { type: 'end', why: 'lag' }, 'too far behind it');
  assert.equal(d({ k: 10 - MAX_LAG }).type, 'move');
  assert.deepEqual(d({ k: null }), { type: 'end', why: 'shore' }, 'the wave is gone');
  const inShallows = [...Array(30).keys()].find((x) => waterAt(x, 20, 'beach') === 'shallow');
  assert.deepEqual(d({ x: inShallows }), { type: 'end', why: 'shore' });
  assert.deepEqual(d({ y: 1, k: 1 - 10 }), { type: 'move', dx: 1, dy: 0 }, 'the open sea at the north edge blocks north: east instead');
  assert.deepEqual(rideDecide({ walkable: () => false, water: () => 'deep', x: 10, y: 1, k: -9, steps: 0 }), { type: 'end', why: 'edge' }, 'nowhere left to go: the ride ends on the wave');
  assert.ok(RIDE_MS < 1000 / WAVE.speed, 'the rider is a little quicker than the crest');
});

const simulate = (steer, start = { x: X, y: 24 }) => {
  let { x, y } = start, ms = 0, steps = 0, e0 = null;
  const t0 = clockAt(x, y, 0);
  const path = [];
  for (let i = 0; i < 600; i++) {
    const w = waveAt(t0 + ms), dec = rideDecide({ ...map, k: w ? w.k : null, x, y, steer: steer && steer(steps), steps });
    if (!w) return { end: 'shore', x, y, ms, path };
    if (dec.type === 'end') return { end: dec.why, x, y, ms, path };
    if (dec.type === 'move') { x += dec.dx; y += dec.dy; steps++; ms += RIDE_MS; path.push([x, y, +(y - crestRowAt(w, x)).toFixed(2)]); } else ms += 25;
  }
  return { end: 'timeout', x, y, ms, path };
};
const crestRowAt = (w, x) => crestRow(w, x);

test('a full ride from the break stays on the crest and reaches the shallows in a few seconds, heading north-east', () => {
  const r = simulate(null);
  assert.equal(r.end, 'shore');
  assert.equal(waterAt(r.x, r.y, 'beach'), 'shallow');
  assert.ok(r.ms > 800 && r.ms < 5000, `${r.ms} ms`);
  assert.ok(r.y < 24 && r.x > X, 'north and east');
  for (const [, , off] of r.path) assert.ok(off >= -MAX_AHEAD - 0.5 && off <= MAX_LAG, `offset ${off}`);
});

test('steering up rides up the wall for longer, steering down cuts back to the shore sooner', () => {
  const up = simulate(() => 'up'), down = simulate(() => 'down'), diag = simulate(null);
  assert.ok(down.ms <= diag.ms, `${down.ms} vs ${diag.ms}`);
  assert.ok(up.ms >= diag.ms, `${up.ms} vs ${diag.ms}`);
  assert.ok(up.y < diag.y || up.end === 'edge' || up.ms > diag.ms);
  assert.ok(['shore', 'edge'].includes(up.end));
  assert.equal(down.end, 'shore');
  assert.ok(down.y > up.y, 'down stays further south than up');
});

test('the foam: strokes along the diagonal, white where it has broken (south-east of the peel point), a thin swell ahead of it, fading on the shallows, none without a wave', () => {
  assert.deepEqual(waveStrokes(null, 0, 10), []);
  const w = waveAt(at(3000)), s = waveStrokes(w, 1, 34, 16, () => 20);
  assert.ok(s.length > 60);
  assert.ok(s.every((q) => q.a > 0 && q.a <= 1 && q.w > 0 && q.h > 0));
  const crest = s.filter((q) => q.w === 16 && q.h === 7);
  assert.ok(crest.length > 5 && crest.every((q) => q.x / 16 - 0.5 >= w.peel - 0.01), 'broken part only south-east of the peel');
  const swell = s.filter((q) => q.w === 11 && q.h === 3);
  assert.ok(swell.length > 3 && swell.every((q) => q.x / 16 - 0.5 < w.peel + 0.01));
  const sorted = [...crest].sort((a, b) => a.x - b.x);
  assert.ok(sorted[sorted.length - 1].y > sorted[0].y, 'further east, lower on the screen: a "\\" front');
  assert.ok(waveStrokes(waveAt(at(100)), 1, 34, 16, () => 20)[0].a < 0.5 || waveStrokes(waveAt(at(100)), 1, 34, 16, () => 20).length === 0, 'it fades in');
  const gone = waveStrokes({ id: 1, age: 7100, k: -25, peel: 3 }, 1, 34, 16, () => 20);
  assert.equal(gone.length, 0, 'off the top of the map');
  assert.ok(Math.max(...s.map((q) => q.x)) < (20 + 4.5) * 16, 'nothing beyond the shallows');
});

// ---- the net, the sounds and the old clients ---------------------------------------------------------------------------------------------------
import { validateMessage } from '../src/protocol.js';
import { createNet } from '../src/net.js';
import { createPetSounds, CUES } from '../src/pet-sounds.js';
import { rideBed } from '../src/ambience.js';

const pid = 'abcdefgh';
test('pos carries an optional surf flag (1 riding, 2 wiped out); anything else is dropped, and an old reader just sees a pos', () => {
  const pos = (extra) => validateMessage({ t: 'pos', id: pid, x: 8, y: 10, d: 'right', area: 'beach', ...extra });
  assert.deepEqual(pos({ surf: 1 }), { t: 'pos', id: pid, x: 8, y: 10, d: 'right', area: 'beach', surf: 1 });
  assert.equal(pos({ surf: 2 }).surf, 2);
  assert.equal(pos({ surf: 3 }).surf, 3, 'paddling on the board');
  for (const bad of [0, 4, '1', true, null, {}, -1]) assert.equal('surf' in pos({ surf: bad }), false, String(bad));
  assert.equal('surf' in pos({}), false);
  assert.ok(JSON.stringify({ t: 'pos', id: pid, x: 8, y: 10, d: 'right', area: 'beach', surf: 2 }).length < 100, 'far below the payload limit');
  const hello = validateMessage({ t: 'hello', id: pid, name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] }, x: 8, y: 10, d: 'right', area: 'beach', surf: 1 }, {});
  assert.equal(hello.pos.surf, 1, 'the heartbeat keeps a rider riding');
});

test('net: a surf change is sent even on the same tile, and a peer hears it', () => {
  const sent = [];
  const timers = { setInterval: () => 1, clearInterval() {}, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {} };
  let clock = 1000;
  const wire = { name: 'fake', async open(code, id, hello, onRaw) { return { send: (m) => sent.push(m), close() {} }; } };
  const net = createNet({ wire, catalogue: {}, now: () => (clock += 200), timers });
  return net.join('FOCA-LUNA-42', { name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] } }).then(() => {
    sent.length = 0;
    net.sendPos(6, 10, 'right', 'beach', 0);
    net.sendPos(6, 10, 'right', 'beach', 1);
    net.sendPos(6, 10, 'right', 'beach', 1);
    net.sendPos(6, 10, 'right', 'beach', 2);
    const pos = sent.filter((m) => m.t === 'pos').map((m) => m.surf || 0);
    assert.deepEqual(pos, [0, 1, 2]);
  });
});

test('surf sounds: a whoosh, a wipeout and a splash cue exist and are soft; the ride hiss is a bed that follows the ride', () => {
  for (const c of ['whoosh', 'wipe', 'splash']) assert.ok(CUES[c] && CUES[c].length, c);
  const calls = [], played = [];
  const sound = { ambient: (s, g) => { played.push([s.length, g]); return true; }, bed: (n, make, level) => { calls.push([n, level, typeof make]); return true; } };
  const p = createPetSounds({ sound, rand: () => 0.5 });
  for (const c of ['whoosh', 'wipe', 'splash']) assert.equal(p.cue(c), true);
  assert.ok(played.every(([len, g]) => len > 100 && g <= 0.5));
  p.ride(false); assert.equal(calls.length, 0, 'nothing to stop when it never started');
  p.ride(true); p.ride(true); p.ride(false); p.ride(false);
  assert.deepEqual(calls.map((c) => c.slice(0, 2)), [['ride', 0.18], ['ride', 0.18], ['ride', 0]]);
  const bed = rideBed();
  assert.ok(bed.length === 1 && bed[0] instanceof Int16Array && bed[0].length > 16000);
});

test('the surfboard and the wipeout are drawn as squares only: the drawing helpers work on a plain 2D context', async () => {
  const { drawBoard, drawWake } = await import('../src/sea-draw.js');
  const ops = [];
  const ctx = { set fillStyle(v) { ops.push(['fill', v]); }, fillRect: (...a) => ops.push(['rect', ...a]) };
  drawBoard(ctx, 50, 50, 2, { squash: 0.5, night: 0.5, tilt: 0.4 });
  const rects = ops.filter((o) => o[0] === 'rect');
  assert.ok(rects.length >= 8 && rects.every((r) => r.slice(1).every(Number.isFinite)));
  const n = ops.length;
  drawWake(ctx, 50, 50, 2, { depth: 'deep', moving: true, d: 'left', squash: 0.5, now: 1234, night: 0, seed: 3 });
  drawWake(ctx, 50, 50, 2, { depth: 'shallow', moving: false, d: 'up', squash: 0.5, now: 99, night: 1, seed: 1 });
  assert.ok(ops.length > n + 20);
});
