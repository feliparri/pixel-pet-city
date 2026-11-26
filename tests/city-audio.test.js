import test from 'node:test';
import assert from 'node:assert/strict';
import { chirp, cricket, cluck, moo, baa, thunder, rainBed, waterBed, waterNear, WATER, createAmbience, EVERY, GAIN } from '../src/ambience.js';
import { MOODS, moodFor, phraseFor, phraseMs, createCityMusic, MUSIC_LEVEL } from '../src/city-music.js';
import { createCityAudio } from '../src/city-audio.js';
import { createSound, SFX_RATE, AMBIENT_MAX } from '../src/sound.js';
import { tileAt } from '../src/map.js';
import { strikesIn } from '../src/weather.js';

const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

test('the sample makers give deterministic, audible, bounded Int16 sounds of a sane length', () => {
  const all = { chirp: [chirp(0), 0.2, 0.6], cricket: [cricket(0), 0.2, 0.7], cluck: [cluck(), 0.2, 0.6], moo: [moo(), 1, 2], baa: [baa(), 0.5, 1.2], thunder: [thunder(3), 2.5, 4], rain: [rainBed()[0], 7, 8], water: [waterBed()[0], 5, 6] };
  for (const [k, [a, lo, hi]] of Object.entries(all)) {
    assert.ok(a instanceof Int16Array, k);
    const s = a.length / SFX_RATE;
    assert.ok(s >= lo && s <= hi, `${k} ${s}s`);
    assert.ok(peak(a) > 8000 && peak(a) <= 32767, `${k} peak ${peak(a)}`);
  }
  assert.deepEqual(thunder(5), thunder(5));
  assert.notDeepEqual(thunder(5), thunder(6));
  assert.notDeepEqual(chirp(0), chirp(1));
  assert.deepEqual(chirp(5), chirp(1), 'four variants, wrapping');
});

test('the beds loop without a click or a pulse: every layer joins its start, has even loudness across the join, and the layers differ in length so the sum never repeats audibly', () => {
  for (const layers of [rainBed(), waterBed()]) {
    assert.ok(layers.length >= 2 && new Set(layers.map((l) => l.length)).size === layers.length, 'layers of different lengths');
    for (const b of layers) {
      let step = 0;
      for (let i = 1; i < b.length; i++) step += Math.abs(b[i] - b[i - 1]);
      step /= b.length - 1;
      assert.ok(Math.abs(b[b.length - 1] - b[0]) < step * 8, 'no jump at the seam');
      assert.ok(b.length / SFX_RATE >= 4, 'a long loop');
      const rms = (from, to) => { let e = 0; for (let i = from; i < to; i++) e += b[i] * b[i]; return Math.sqrt(e / (to - from)); };
      const w = 1500, mid = rms(Math.floor(b.length / 2), Math.floor(b.length / 2) + w), start = rms(0, w), join = rms(2000, 2000 + w), end = rms(b.length - w, b.length);
      for (const v of [start, join, end]) assert.ok(v > mid * 0.6 && v < mid * 1.6, `loudness at the join ${v} vs ${mid}`);
    }
  }
  const rain = rainBed(), lcm = (rain[0].length / SFX_RATE) * (rain[1].length / SFX_RATE);
  assert.ok(lcm > 60, 'the two layers line up only about once a minute');
});

test('waterNear: 1 at the edge of the water, falling to 0 at its reach, 0 where there is none, and the rectangles really are water', () => {
  for (const r of WATER.town) { const x = r.x + (r.w >> 1), y = r.y + (r.h >> 1); assert.ok(['o', '~'].includes(tileAt(x, y, 'town')), `${x},${y} ${tileAt(x, y, 'town')}`); }
  for (const r of WATER.farm) assert.equal(tileAt(r.x + 2, r.y + 1, 'farm'), '~');
  assert.equal(waterNear('town', 22, 20), 1);
  assert.ok(waterNear('town', 22, 24) > 0 && waterNear('town', 22, 24) < 1);
  assert.equal(waterNear('town', 40, 5), 0);
  assert.equal(waterNear('shop', 3, 3), 0);
  assert.ok(waterNear('farm', 35, 30) === 1);
});

/** A player stand-in that records every call. */
function spySound({ running = true, muted = false } = {}) {
  const s = { calls: [], running: () => running, isMuted: () => muted, stopCount: 0 };
  s.ambient = (samples, gain) => { s.calls.push(['ambient', samples.length, gain]); return true; };
  s.bed = (name, make, level) => { s.calls.push(['bed', name, Math.round(level * 1000) / 1000]); return true; };
  s.stopBeds = () => { s.stopCount++; };
  s.playNotes = (notes, level, priority) => { s.calls.push(['notes', notes.length, level, priority]); return true; };
  s.stop = () => { s.calls.push(['stop']); };
  return s;
}
const lcg = (seed = 1) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const day = { area: 'town', outdoor: true, night: 0, weather: { rain: 0, storm: 0, snow: 0 }, x: 40, y: 5, utcMs: 1.78e12 };
const run = (amb, secs, info, dt = 100) => { for (let t = 0; t < secs * 1000; t += dt) amb.step(dt, { ...info, utcMs: info.utcMs + t }); };

test('ambience: nothing sounds when muted, before the context runs, or indoors', () => {
  for (const [opts, info] of [[{ muted: true }, day], [{ running: false }, day], [{}, { ...day, outdoor: false }]]) {
    const s = spySound(opts), a = createAmbience({ sound: s, rand: lcg() });
    run(a, 120, { ...info, weather: { rain: 1, storm: 1, snow: 0 }, area: 'farm', night: 0 });
    assert.equal(s.calls.filter((c) => c[0] === 'ambient' || (c[0] === 'bed' && c[2] > 0)).length, 0, JSON.stringify(opts));
  }
});

test('ambience: birds by day, now and then (not at once, not constantly); none at night or in the rain', () => {
  const s = spySound(), a = createAmbience({ sound: s, rand: lcg(7) });
  run(a, 2, day);
  assert.equal(s.calls.filter((c) => c[0] === 'ambient').length, 0, 'nothing the moment the town opens');
  run(a, 118, day);
  const n = s.calls.filter((c) => c[0] === 'ambient').length;
  assert.ok(n >= 120000 / EVERY.bird[1] - 1 && n <= 120000 / EVERY.bird[0] + 1, `${n} birds in two minutes`);
  assert.ok(s.calls.filter((c) => c[0] === 'ambient').every((c) => c[2] === GAIN.chirp));
  const night = spySound(), b = createAmbience({ sound: night, rand: lcg(7) });
  run(b, 120, { ...day, night: 1 });
  assert.ok(night.calls.filter((c) => c[0] === 'ambient').every((c) => c[2] === GAIN.cricket), 'only crickets at night');
  assert.ok(night.calls.filter((c) => c[0] === 'ambient').length > 5);
  const rain = spySound(), c = createAmbience({ sound: rain, rand: lcg(7) });
  run(c, 120, { ...day, weather: { rain: 0.8, storm: 0, snow: 0 } });
  assert.equal(rain.calls.filter((x) => x[0] === 'ambient').length, 0, 'the birds shelter');
});

test('ambience: the rain bed follows the rain, the water bed follows the distance to the water, both end indoors', () => {
  const s = spySound(), a = createAmbience({ sound: s, rand: lcg() });
  a.step(100, { ...day, weather: { rain: 1, storm: 0, snow: 0 }, x: 22, y: 20 });
  const bed = (name) => s.calls.filter((c) => c[0] === 'bed' && c[1] === name).pop();
  assert.equal(bed('rain')[2], GAIN.rain);
  assert.equal(GAIN.rain, 0.14, 'the rain bed is half as loud as it was (0.28)');
  assert.ok(GAIN.rain < GAIN.sea && GAIN.thunder === 0.8, 'quieter than the sea; thunder untouched');
  assert.ok(bed('water')[2] > 0 && bed('water')[2] <= GAIN.water);
  a.step(100, { ...day, outdoor: false });
  assert.equal(bed('rain')[2], 0); assert.equal(bed('water')[2], 0);
  a.step(100, day); assert.equal(bed('rain')[2], 0, 'dry'); assert.equal(bed('water')[2], 0, 'far from the water');
});

test('ambience: the farm has its animals, now and then; the town does not', () => {
  const s = spySound(), a = createAmbience({ sound: s, rand: lcg(3) });
  run(a, 180, { ...day, area: 'farm', night: 1 });
  const hits = s.calls.filter((c) => c[0] === 'ambient' && c[2] === GAIN.animal).length;
  assert.ok(hits >= 3 && hits <= 14, `${hits} animal calls at night`);
  const t = spySound(), b = createAmbience({ sound: t, rand: lcg(3) });
  run(b, 180, { ...day, night: 1 });
  assert.equal(t.calls.filter((c) => c[0] === 'ambient' && c[2] === GAIN.animal).length, 0);
});

test('ambience: thunder follows a lightning strike after its delay, never before, one per strike; a long gap is not replayed', () => {
  const t0 = 1.78e12, strikes = strikesIn(t0, t0 + 600e3, 1), first = strikes[0];
  const s = spySound(), a = createAmbience({ sound: s, rand: lcg() }), info = { ...day, weather: { rain: 1, storm: 1, snow: 0 } };
  const thunderCalls = () => s.calls.filter((c) => c[0] === 'ambient' && c[2] === GAIN.thunder).length;
  for (let t = t0; t < first.at + 50; t += 100) a.step(100, { ...info, utcMs: t });
  assert.equal(thunderCalls(), 0, 'the flash comes first');
  for (let t = first.at + 50; t < first.at + first.delay - 50; t += 100) a.step(100, { ...info, utcMs: t });
  assert.equal(thunderCalls(), 0, 'and the thunder waits');
  for (let t = first.at + first.delay - 50; t < first.at + first.delay + 300; t += 100) a.step(100, { ...info, utcMs: t });
  assert.equal(thunderCalls(), 1);
  const gap = spySound(), b = createAmbience({ sound: gap, rand: lcg() });
  b.step(100, { ...info, utcMs: t0 }); b.step(100, { ...info, utcMs: t0 + 600e3 }); b.step(100, { ...info, utcMs: t0 + 600e3 + 100 });
  for (let i = 0; i < 40; i++) b.step(100, { ...info, utcMs: t0 + 600e3 + 200 + i * 100 });
  assert.ok(gap.calls.filter((c) => c[2] === GAIN.thunder).length <= 1, 'a ten minute gap is not replayed as a hundred thunders');
});

test('music: three moods of 16 steps, quiet and slow; the mood follows rain, then night, else day', () => {
  for (const [k, m] of Object.entries(MOODS)) {
    for (const p of m.patterns) { assert.equal(p.length, 16, k); assert.ok(p.every((i) => i < m.scale.length), k); }
    assert.ok(m.ms >= 300 && m.vol <= 130);
  }
  assert.ok(MUSIC_LEVEL <= 1);
  assert.ok(MOODS.night.ms > MOODS.day.ms && MOODS.rain.ms > MOODS.night.ms, 'night and rain are slower');
  assert.ok(MOODS.rain.vol < MOODS.night.vol && MOODS.night.vol < MOODS.day.vol, 'and softer');
  assert.equal(moodFor(0, null), 'day'); assert.equal(moodFor(1, { rain: 0, snow: 0 }), 'night'); assert.equal(moodFor(1, { rain: 0.8, snow: 0 }), 'rain'); assert.equal(moodFor(0, { rain: 0, snow: 0.9 }), 'rain');
  assert.deepEqual(phraseFor('nope'), []);
  assert.equal(phraseFor('day', 0).length, 16);
  assert.notDeepEqual(phraseFor('day', 0), phraseFor('day', 1));
  assert.ok(phraseMs(phraseFor('day', 0)) > 4500);
});

test('music: the first phrase waits, phrases follow with a pause, silence holds the timer, an unsounded phrase is retried later', () => {
  const played = [];
  let ok = true;
  const m = createCityMusic({ play: (n) => { if (ok) played.push(n); return ok; }, rand: () => 0.5 });
  assert.equal(m.step(1000, 'day'), false);
  assert.equal(m.step(600, 'day'), true, 'after the first wait');
  const len = phraseMs(played[0]), pause = (MOODS.day.gap[0] + MOODS.day.gap[1]) / 2;
  assert.equal(m.step(len - 1, 'day'), false);
  assert.equal(m.step(pause - 1, null), false, 'silent: the timer holds');
  assert.equal(m.step(pause - 1, 'day'), false);
  assert.equal(m.step(10, 'day'), true);
  assert.equal(played.length, 2);
  ok = false;
  m.reset(); assert.equal(m.step(1600, 'rain'), false);
  assert.equal(m.step(500, 'rain'), false, 'refused: retry in a while, not every frame');
  ok = true; assert.equal(m.step(2100, 'rain'), true);
});

test('city audio: music at the lowest priority and level 1; silent when muted or before a gesture; silence stops the voice and the beds', () => {
  const s = spySound(), a = createCityAudio({ sound: s, rand: lcg() });
  for (let i = 0; i < 40; i++) a.step(100, day);
  const notes = s.calls.filter((c) => c[0] === 'notes');
  assert.ok(notes.length >= 1);
  assert.ok(notes.every((c) => c[2] === MUSIC_LEVEL && c[3] === 0), 'level 1, priority 0 (any effect cuts it)');
  a.silence();
  assert.equal(s.stopCount, 1); assert.equal(s.calls.at(-1)[0], 'stop');
  for (const opts of [{ muted: true }, { running: false }]) {
    const q = spySound(opts), b = createCityAudio({ sound: q, rand: lcg() });
    for (let i = 0; i < 400; i++) b.step(100, { ...day, weather: { rain: 1, storm: 1, snow: 0 } });
    assert.equal(q.calls.filter((c) => c[0] === 'notes' || c[0] === 'ambient').length, 0, JSON.stringify(opts));
  }
});

// ---- the player's ambient channel ----------------------------------------------------------------------------------------------------------
function audioContext() {
  const log = { sources: [], gains: [], started: 0, stopped: 0, ramps: [] };
  const ctx = {
    state: 'suspended', currentTime: 0, destination: {},
    resume() { ctx.state = 'running'; },
    createBuffer(c, n) { return { n, data: new Float32Array(n), getChannelData() { return this.data; } }; },
    createGain() { const g = { gain: { value: 1, setValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime(v, t, tc) { log.ramps.push([v, tc]); } }, connect() {} }; log.gains.push(g); return g; },
    createBufferSource() { const s = { connect() {}, start() { log.started++; }, stop() { log.stopped++; }, buffer: null, loop: false, onended: null }; s.kind = 'src'; log.sources.push(s); return s; },
  };
  return { ctx, log, factory: () => ctx };
}

test('sound ambient channel: waits for a running context, never touches the voice, caps the overlap, and is silent when muted', () => {
  const f = audioContext(), snd = createSound({ ctxFactory: f.factory });
  const samples = Int16Array.from({ length: 800 }, (_, i) => (i % 40) * 500);
  assert.equal(snd.running(), false);
  assert.equal(snd.ambient(samples, 0.3), false, 'before a gesture');
  assert.equal(snd.bed('rain', () => samples, 0.5), false);
  assert.equal(f.log.sources.length, 0, 'no context was made for it');
  snd.unlock();
  assert.equal(snd.running(), true);
  assert.equal(snd.playNotes([{ wave: 1, f0: 440, f1: 440, ms: 400, vol: 200 }], 1, 0), true);
  assert.equal(snd.ambient(samples, 0.3), true);
  assert.equal(f.log.gains.at(-1).gain.value, 0.3);
  assert.equal(f.log.stopped, 0, 'the music voice was not cut');
  for (let i = 0; i < AMBIENT_MAX + 3; i++) snd.ambient(samples, 0.2);
  assert.ok(f.log.started <= 1 + 1 + AMBIENT_MAX, 'at most AMBIENT_MAX at once');
  snd.setMuted(true);
  const before = f.log.started;
  assert.equal(snd.ambient(samples), false); assert.equal(snd.bed('rain', () => samples, 0.5), false); assert.equal(snd.playNotes(CUE_ONE), false);
  assert.equal(f.log.started, before, 'nothing starts while muted');
});

const CUE_ONE = [{ wave: 1, f0: 440, f1: 440, ms: 100, vol: 200 }];

test('sound beds: one looping source per bed with its own gain that ramps; level 0 ends it; muting stops every bed', () => {
  const f = audioContext(), snd = createSound({ ctxFactory: f.factory });
  snd.unlock();
  let made = 0;
  const mk = () => { made++; return [new Int16Array(4000), new Int16Array(5000)]; };
  assert.equal(snd.bed('rain', mk, 0.3), true);
  assert.equal(snd.bed('rain', mk, 0.2), true);
  assert.equal(made, 1, 'samples made once');
  assert.equal(f.log.sources.length, 2, 'one looping source per layer, never restarted');
  assert.ok(f.log.sources.every((x) => x.loop === true));
  assert.deepEqual(f.log.ramps.map((r) => r[0]), [0.3, 0.2], 'the level moves with setTargetAtTime');
  snd.bed('rain', mk, 0.205);
  assert.equal(f.log.ramps.length, 2, 'a level that barely moved (a per-frame call) schedules nothing');
  assert.equal(f.log.sources.length, 2);
  snd.bed('water', mk, 0.1);
  assert.equal(f.log.sources.length, 4);
  snd.bed('rain', mk, 0);
  assert.equal(f.log.stopped, 2, 'level 0 ends the bed (after a fade)');
  assert.equal(f.log.ramps.at(-1)[0], 0, 'it fades to 0 first');
  snd.setMuted(true);
  assert.equal(f.log.stopped, 4, 'muting stops the others');
  assert.equal(snd.bed('water', mk, 0.1), false);
});
