import test from 'node:test';
import assert from 'node:assert/strict';
import { CUES, CUE_NAMES, CUE_LEVEL, W, SFX_RATE, SFX_MAX_MS, PEAK, N, note, rest, renderNotes, renderCue, cueSamples, cueMs, envelope, createMuteStore, createSound, priorityOf, MUTE_KEY } from '../src/sound.js';

// Reference values: the board's own synth (pixel-pet common/sfx.c, compiled on the host) rendered every cue at level 2 (the tap at level 1) and these were taken
// from it: [samples, sum of sample * (index % 7 + 1), FNV-1a of the samples as u16]. The port must match it sample for sample.
const FROM_C = {
  tap: [256, -381069, 1105102697],
  eat: [4640, -6674, 1156863806],
  happy: [3680, -13632557, 3935598413],
  coin: [4160, -16357348, 24634572],
  buy: [5760, -20207066, 3210525438],
  win: [11360, 87055, 4098490230],
  lose: [10240, 25356, 1698295387],
  shower: [8160, 1010253, 1120567355],
  grow: [8960, -30705946, 675921559],
  bounce: [1280, -9899, 861866283],
  bounce2: [1024, 13983, 3038716815],
  bounce3: [800, 15123, 4250562460],
  hungry: [5280, 8198, 1928479881],
  sick: [9280, 24146, 3194786758],
  dirty: [5600, -18407970, 3429669825],
  sleepy: [10560, -4326, 195327209],
  runaway: [8480, 53333, 184158435],
  ghost: [12800, -15637, 3440259068],
  plug: [2720, 59611, 477183327],
  unplug: [2720, 100175, 71735879]
};
const fingerprint = (s) => { let sum = 0n, h = 2166136261; for (let i = 0; i < s.length; i++) { sum += BigInt(s[i]) * BigInt(i % 7 + 1); h = Math.imul(h ^ (s[i] & 0xffff), 16777619) >>> 0; } return [s.length, Number(sum), h]; };

test('sound: every cue renders the same samples as the board\'s synth', () => {
  assert.deepEqual(CUE_NAMES.sort(), Object.keys(FROM_C).sort());
  for (const name of CUE_NAMES) assert.deepEqual(fingerprint(renderCue(name)), FROM_C[name], name);
});

test('sound: the cue tables are valid and none outlasts a second', () => {
  assert.equal(SFX_RATE, 16000);
  for (const [name, notes] of Object.entries(CUES)) {
    assert.ok(notes.length > 0, name);
    assert.ok(cueMs(notes) <= SFX_MAX_MS, `${name} ${cueMs(notes)} ms`);
    for (const n of notes) {
      assert.ok(Object.values(W).includes(n.wave), name);
      assert.ok(n.ms > 0 && n.vol >= 0 && n.vol <= 255, name);
      if (n.wave !== W.REST) assert.ok(n.f0 > 0 && n.f1 > 0 && n.f0 <= 8000 && n.f1 <= 8000, name);
    }
  }
  assert.deepEqual(CUES.coin.map((n) => [n.wave, n.f0, n.ms]), [[W.SQ25, N.B5, 60], [W.SQ25, N.E6, 200]]);
  assert.equal(CUES.win.length, 7);
  assert.equal(CUES.win[4].wave, W.REST);
  assert.equal(CUE_LEVEL.tap, 1, 'a tap is quiet');
});

test('sound: rendering is deterministic, bounded by the level\'s peak, silent at level 0 and silent over rests', () => {
  for (const name of CUE_NAMES) {
    const a = renderCue(name, 3), b = renderCue(name, 3);
    assert.deepEqual(a, b, name);
    assert.equal(a.length, cueSamples(CUES[name]));
    assert.ok(Math.max(...a.map(Math.abs)) <= PEAK[3], name);
    assert.ok(renderCue(name, 0).every((x) => x === 0), name);
  }
  assert.equal(renderCue('nope'), null);
  const gap = renderNotes([note(W.SQ50, 440, 440, 20, 255), rest(10), note(W.SQ50, 440, 440, 20, 255)]);
  assert.ok(gap.slice(320, 480).every((x) => x === 0), 'the rest is silent');
  assert.ok(gap.slice(0, 320).some((x) => x !== 0));
  assert.deepEqual(renderNotes([note(W.SQ50, 440, 440, 20, 255)], 99), renderNotes([note(W.SQ50, 440, 440, 20, 255)], 3), 'level clamps');
});

test('sound: the waves and the slide behave: square duty, triangle range, noise, attack and decay', () => {
  const sq = (w) => { const s = renderNotes([note(w, 1000, 1000, 100, 255)], 3).slice(300, 800); return s.filter((x) => x > 0).length / s.length; };
  assert.ok(Math.abs(sq(W.SQ50) - 0.5) < 0.06 && Math.abs(sq(W.SQ25) - 0.25) < 0.06 && Math.abs(sq(W.SQ12) - 0.125) < 0.06, 'duty 50 / 25 / 12.5');
  const tri = renderNotes([note(W.TRI, 440, 440, 100, 255)], 3);
  assert.ok(Math.max(...tri) > 0 && Math.min(...tri) < 0);
  const noise = renderNotes([note(W.NOISE, 4000, 4000, 100, 255)], 3);
  assert.ok(noise.some((x) => x > 0) && noise.some((x) => x < 0), 'noise flips sign');
  assert.equal(envelope(0, 800), 0, 'starts silent (3 ms attack)');
  assert.equal(envelope(48, 800), 256, 'full after the attack');
  assert.ok(envelope(799, 800) <= 1, 'decays to silence at the end');
  const slide = renderNotes([note(W.SQ50, 200, 1600, 200, 255)], 3), flat = renderNotes([note(W.SQ50, 200, 200, 200, 255)], 3);
  const crossings = (s) => s.reduce((a, x, i) => a + (i && (x > 0) !== (s[i - 1] > 0) ? 1 : 0), 0);
  assert.ok(crossings(slide) > crossings(flat) * 2, 'the pitch rises');
});

test('sound: the mute choice is remembered and survives broken storage', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  const a = createMuteStore(storage);
  assert.equal(a.get(), false, 'sound is on by default');
  a.set(true);
  assert.equal(mem.get(MUTE_KEY), '1');
  assert.equal(createMuteStore(storage).get(), true, 'a new page reads it back');
  a.set(false);
  assert.equal(createMuteStore(storage).get(), false);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const b = createMuteStore(broken);
  assert.equal(b.get(), false);
  b.set(true);
  assert.equal(b.get(), true, 'kept in memory');
  assert.equal(createMuteStore(null).get(), false);
  assert.doesNotThrow(() => createMuteStore(null).set(true));
});

function fakeContext() {
  const log = { created: 0, resumed: 0, started: [], stopped: 0 };
  const ctx = {
    state: 'suspended', currentTime: 0, destination: {},
    resume() { log.resumed++; ctx.state = 'running'; },
    createBuffer(ch, n, rate) { return { n, rate, data: new Float32Array(n), getChannelData() { return this.data; } }; },
    createBufferSource() { return { connect() {}, start() { log.started.push(this.buffer); }, stop() { log.stopped++; }, buffer: null, onended: null }; },
  };
  return { ctx, log, factory: () => { log.created++; return ctx; } };
}

test('sound: the context is made and resumed on the first gesture; play renders once and caches', () => {
  const f = fakeContext(), snd = createSound({ ctxFactory: f.factory });
  assert.equal(f.log.created, 0, 'nothing before a gesture');
  assert.equal(snd.unlock(), true);
  assert.deepEqual([f.log.created, f.log.resumed], [1, 1]);
  snd.unlock();
  assert.equal(f.log.created, 1, 'one context');
  assert.equal(snd.play('coin'), true);
  assert.equal(f.log.started.length, 1);
  assert.equal(f.log.started[0].rate, SFX_RATE);
  const expect = renderCue('coin');
  assert.ok(f.log.started[0].data.every((x, i) => x === expect[i] / 32768));
  assert.equal(snd.play('nope'), false);
  assert.equal(snd.playNotes([note(W.SQ50, 440, 440, 50, 200)]), true, 'any tone sequence plays');
});

test('sound: muted means silent (and stops the voice); no Web Audio means a quiet no-op; a call outranks a tap', () => {
  const f = fakeContext(), snd = createSound({ ctxFactory: f.factory });
  snd.unlock();
  const seen = [];
  snd.onChange((m) => seen.push(m));
  snd.play('win');
  snd.setMuted(true);
  assert.deepEqual([snd.isMuted(), f.log.stopped, seen], [true, 1, [true]]);
  assert.equal(snd.play('coin'), false);
  assert.equal(f.log.started.length, 1, 'nothing started while muted');
  assert.equal(snd.toggle(), false);
  assert.equal(snd.play('coin'), true);
  const none = createSound({ ctxFactory: () => null });
  assert.deepEqual([none.unlock(), none.play('coin'), none.playNotes(CUES.coin)], [false, false, false]);
  const boom = createSound({ ctxFactory: () => { throw new Error('no audio'); } });
  assert.equal(boom.play('coin'), false);
  const g = fakeContext(), s2 = createSound({ ctxFactory: g.factory });
  s2.unlock();
  assert.equal(s2.play('hungry'), true);
  assert.equal(s2.play('tap'), false, 'a tap does not cut a call');
  g.ctx.currentTime = 10;
  assert.equal(s2.play('tap'), true, 'once the call is over it may');
  assert.deepEqual([priorityOf('hungry'), priorityOf('coin'), priorityOf('tap')], [2, 1, 0]);
});
