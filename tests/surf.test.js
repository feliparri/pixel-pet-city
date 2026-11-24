import test from 'node:test';
import assert from 'node:assert/strict';
import { WAVE, waveAt, crestOffset, judgeCatch, surfAction, createSurf, surfFlag, press, wipeout, wipeOver, finishRide, rideDecide, waveStrokes,
  CATCH_TILES, PROMPT_AHEAD, PROMPT_BEHIND, WIPE_MS, MAX_LAG, RIDE_MS, BOARD } from '../src/surf.js';
import { BEACH, waterAt, isWalkable, isBreak } from '../src/map.js';

const X = BEACH.breakX[0], Y = 10;
const at = (ageMs, k = 7) => k * WAVE.periodMs + ageMs;            // a clock reading `ageMs` into wave number k
const withBoard = [BOARD];

test('waves come from the clock: the same instant gives the same wave, one every period, running east and dying on the beach', () => {
  assert.deepEqual(waveAt(at(1000)), waveAt(at(1000)));
  assert.equal(waveAt(at(0)).crestX, WAVE.startX);
  assert.ok(Math.abs(waveAt(at(1000)).crestX - (WAVE.startX + WAVE.speed)) < 1e-9);
  assert.equal(waveAt(at(1000, 7)).id + 1, waveAt(at(1000, 8)).id);
  assert.equal(waveAt(at(1000, 7)).crestX, waveAt(at(1000, 8)).crestX, 'every wave is the same');
  const life = ((WAVE.endX - WAVE.startX) / WAVE.speed) * 1000;
  assert.ok(waveAt(at(life - 10)));
  assert.equal(waveAt(at(life + 10)), null, 'quiet until the next one');
  assert.ok(life < WAVE.periodMs, 'one wave at a time');
  assert.equal(waveAt(NaN), null);
  const base = 5e12 - (5e12 % WAVE.periodMs), a = waveAt(base + 1234), b = waveAt(base + 1234 + WAVE.periodMs);
  assert.ok(Math.abs(a.crestX - b.crestX) < 1e-6);
});

test('the catch window: early before it, a catch inside it, late after it', () => {
  assert.equal(judgeCatch(-CATCH_TILES - 0.01), 'early');
  assert.equal(judgeCatch(-CATCH_TILES), 'catch');
  assert.equal(judgeCatch(0), 'catch');
  assert.equal(judgeCatch(CATCH_TILES), 'catch');
  assert.equal(judgeCatch(CATCH_TILES + 0.01), 'late');
  assert.ok(PROMPT_AHEAD > CATCH_TILES && PROMPT_BEHIND > CATCH_TILES, 'early and late presses are possible while the prompt shows');
});

test('crestOffset: only while the wave is near the pet', () => {
  const crestAtPet = (X - WAVE.startX) / WAVE.speed * 1000;
  assert.ok(Math.abs(crestOffset(at(crestAtPet), X)) < 1e-9);
  assert.ok(crestOffset(at(crestAtPet - (PROMPT_AHEAD - 0.5) / WAVE.speed * 1000), X) < 0);
  assert.equal(crestOffset(at(crestAtPet - (PROMPT_AHEAD + 1) / WAVE.speed * 1000), X), null);
  assert.equal(crestOffset(at(crestAtPet + (PROMPT_BEHIND + 1) / WAVE.speed * 1000), X), null);
  assert.equal(crestOffset(at(8800), X), null);
});

test('the prompt: needs the break, then the board, then a wave', () => {
  const near = at((X - WAVE.startX) / WAVE.speed * 1000 - 400);
  assert.equal(surfAction(near, 40, Y, withBoard), null, 'on the sand there is nothing');
  assert.equal(surfAction(near, 12, Y, withBoard), null, 'deep water but not the break');
  assert.ok(isBreak(X, Y, 'beach'));
  const hint = surfAction(near, X, Y, []);
  assert.deepEqual([hint.id, hint.label], ['hint', 'Necesitas una Tabla de surf — Almacén']);
  assert.equal(surfAction(near, X, Y, undefined).id, 'hint');
  assert.deepEqual(surfAction(near, X, Y, withBoard), { id: 'surf', label: 'Tomar la ola', target: 'wave' });
  assert.equal(surfAction(at(8700), X, Y, withBoard).id, 'hint', 'no wave near: wait for it');
});

test('state machine: a press in the window starts a ride, too early or too late is a wipeout, no board or no wave does nothing', () => {
  const cr = (d) => at((X + d - WAVE.startX) / WAVE.speed * 1000);        // the clock when the crest is d tiles from the pet
  const run = (d, tools = withBoard, x = X) => { const s = createSurf(); const r = press(s, { utcMs: cr(d), x, y: Y, tools, t: 100 }); return [r, s]; };
  let [r, s] = run(0);
  assert.equal(r, 'catch'); assert.equal(s.mode, 'ride'); assert.equal(surfFlag(s), 1); assert.equal(s.since, 100);
  [r, s] = run(-1.4); assert.equal(r, 'catch');
  [r, s] = run(-3); assert.equal(r, 'early'); assert.equal(s.mode, 'wipe'); assert.equal(s.why, 'early'); assert.equal(surfFlag(s), 2);
  [r, s] = run(2.5); assert.equal(r, 'late'); assert.equal(s.mode, 'wipe');
  [r, s] = run(0, []); assert.equal(r, 'none'); assert.equal(s.mode, 'idle');
  [r, s] = run(0, withBoard, 20); assert.equal(r, 'none', 'not at the break');
  [r, s] = run(-20); assert.equal(r, 'none', 'no wave near');
  const busy = createSurf(); busy.mode = 'ride';
  assert.equal(press(busy, { utcMs: cr(0), x: X, y: Y, tools: withBoard, t: 1 }), 'none', 'already riding');
});

test('a wipeout lasts WIPE_MS and then the pet is free again; a finished ride resets', () => {
  const s = createSurf();
  wipeout(s, 1000, 'late');
  assert.equal(wipeOver(s, 1000 + WIPE_MS - 1), false); assert.equal(s.mode, 'wipe');
  assert.equal(wipeOver(s, 1000 + WIPE_MS), true); assert.equal(s.mode, 'idle'); assert.equal(surfFlag(s), 0);
  assert.equal(wipeOver(s, 9999), false);
  s.mode = 'ride'; s.wave = 3; finishRide(s);
  assert.deepEqual([s.mode, s.wave, s.why], ['idle', null, null]);
});

const map = { walkable: (x, y) => isWalkable(x, y, 'beach'), water: (x, y) => waterAt(x, y, 'beach') };
test('the ride: forward after the crest, steering across it, waiting ahead of it, ending in the shallows or when it falls behind', () => {
  const d = (o) => rideDecide({ ...map, crestX: 10.5, x: 8, y: 10, steer: 0, ...o });
  assert.deepEqual(d({}), { type: 'move', dx: 1, dy: 0 }, 'two tiles behind the crest: follow');
  assert.deepEqual(d({ x: 10 }), { type: 'wait' }, 'level with the crest: it comes on');
  assert.deepEqual(d({ x: 12 }), { type: 'wait' }, 'ahead of it');
  assert.deepEqual(d({ steer: -1 }), { type: 'move', dx: 0, dy: -1 });
  assert.deepEqual(d({ steer: 1 }), { type: 'move', dx: 0, dy: 1 });
  assert.deepEqual(d({ x: 6, steer: 1 }), { type: 'move', dx: 0, dy: 1 }, 'steering has priority, the lag grows');
  assert.deepEqual(d({ crestX: 8 + MAX_LAG + 1.2 }), { type: 'end', why: 'lag' });
  assert.deepEqual(d({ crestX: 8 + MAX_LAG + 0.2 }), { type: 'move', dx: 1, dy: 0 });
  assert.deepEqual(d({ y: 1, steer: -1 }), { type: 'move', dx: 1, dy: 0 }, 'the open sea at the edge blocks the steering');
  const inShallows = [...Array(30).keys()].find((x) => waterAt(x, 10, 'beach') === 'shallow');
  assert.deepEqual(d({ x: inShallows }), { type: 'end', why: 'shore' });
  assert.equal(d({ crestX: Infinity, x: 8 }).type, 'end', 'the wave is gone: the ride is over');
  assert.ok(RIDE_MS * WAVE.speed < 1000, 'the rider is a little quicker than the crest');
});

test('a full ride from the break reaches the shallows in a few seconds, following the real crest', () => {
  const start = at((X - WAVE.startX) / WAVE.speed * 1000);
  let x = X, y = Y, ms = 0, end = null;
  for (let i = 0; i < 400 && !end; i++) {
    const w = waveAt(start + ms);
    const dec = rideDecide({ ...map, crestX: w ? w.crestX : Infinity, x, y, steer: 0 });
    if (dec.type === 'end') end = dec.why; else if (dec.type === 'move') { x += dec.dx; y += dec.dy; ms += RIDE_MS; } else ms += 25;
  }
  assert.equal(end, 'shore');
  assert.equal(waterAt(x, y, 'beach'), 'shallow');
  assert.ok(ms > 1500 && ms < 5000, `${ms} ms`);
});

test('a rider that steers every step falls behind and wipes out; one that steers a little keeps up', () => {
  const run = (steerEvery) => {
    const start = at((X - WAVE.startX) / WAVE.speed * 1000);
    let x = X, y = 16, ms = 0, n = 0;
    for (let i = 0; i < 400; i++) {
      const w = waveAt(start + ms), steer = steerEvery && n % steerEvery === 0 ? (Math.floor(n / steerEvery) % 2 ? 1 : -1) : 0;
      const dec = rideDecide({ ...map, crestX: w ? w.crestX : Infinity, x, y, steer });
      if (dec.type === 'end') return dec.why;
      if (dec.type === 'move') { x += dec.dx; y += dec.dy; ms += RIDE_MS; n++; } else ms += 25;
    }
    return 'timeout';
  };
  assert.equal(run(1), 'lag');
  assert.equal(run(4), 'shore');
});

test('the foam: strokes along the rows, fading in at the start and out on the shallows, none without a wave', () => {
  assert.deepEqual(waveStrokes(null, 0, 10), []);
  const w = { id: 1, crestX: 12, age: 2000 };
  const s = waveStrokes(w, 1, 34, 16, () => 20);
  assert.ok(s.length >= 34 * 3);
  assert.ok(s.every((q) => q.a > 0 && q.a <= 1 && q.w > 0 && q.h > 0));
  const crest = s.filter((q) => q.w === 18 && q.h === 6);
  assert.ok(crest.every((q) => Math.abs(q.x - (12 * 16 + 8)) <= 3.01), 'the crest line wobbles a little round its column');
  assert.ok(waveStrokes({ ...w, age: 100 }, 1, 5, 16, () => 20)[0].a < s[0].a, 'it fades in');
  assert.equal(waveStrokes({ id: 1, crestX: 26, age: 3000 }, 1, 5, 16, () => 20).length, 0, 'gone on the beach');
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
  for (const bad of [0, 3, '1', true, null, {}, -1]) assert.equal('surf' in pos({ surf: bad }), false, String(bad));
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
