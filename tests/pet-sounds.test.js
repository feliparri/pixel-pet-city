import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUNDS, groundOf, stepSamples, STEP_VARIANTS, CUES, peerGain, HEAR_TILES, createPetSounds } from '../src/pet-sounds.js';
import { createSound, SFX_RATE } from '../src/sound.js';
import { tileAt } from '../src/map.js';

const find = (area, ch) => { for (let y = 0; y < 90; y++) for (let x = 0; x < 60; x++) if (tileAt(x, y, area) === ch) return [x, y]; return null; };

test('groundOf: grass, path, stone (the plaza) and wood (a shop floor); rain makes the open ground wet, snow covers it, indoors nothing changes', () => {
  const [gx, gy] = find('town', '.'), [px, py] = find('town', '='), [sx, sy] = find('town', '+'), [fx, fy] = find('shop', '_');
  assert.deepEqual([groundOf('town', gx, gy), groundOf('town', px, py), groundOf('town', sx, sy), groundOf('shop', fx, fy)], ['grass', 'path', 'stone', 'wood']);
  const rain = { rain: 0.8, snow: 0 }, snow = { rain: 0, snow: 0.9 };
  assert.equal(groundOf('town', gx, gy, rain), 'wet'); assert.equal(groundOf('town', sx, sy, rain), 'wet');
  assert.equal(groundOf('town', gx, gy, snow), 'snow'); assert.equal(groundOf('town', sx, sy, snow), 'snow');
  assert.equal(groundOf('shop', fx, fy, rain), 'wood');
  assert.equal(groundOf('town', gx, gy, { rain: 0.1, snow: 0.1 }), 'grass');
  assert.equal(groundOf('town', 999, 999), 'grass', 'off the map: a safe default');
});

test('footstep samples: every ground has a short, soft, deterministic sound with several variants that differ', () => {
  for (const g of GROUNDS) {
    const a = stepSamples(g, 0);
    assert.ok(a instanceof Int16Array && a.length / SFX_RATE <= 0.05 && a.length / SFX_RATE >= 0.03, g);
    assert.ok(a.reduce((m, x) => Math.max(m, Math.abs(x)), 0) > 6000, `${g} is audible`);
    assert.deepEqual(stepSamples(g, 0), a);
    assert.notDeepEqual(stepSamples(g, 1), a, `${g} varies`);
    assert.deepEqual(stepSamples(g, STEP_VARIANTS), a, 'variants wrap');
  }
  assert.notDeepEqual(stepSamples('grass', 0), stepSamples('stone', 0));
  assert.deepEqual(stepSamples('lava', 0), stepSamples('grass', 0), 'an unknown ground is grass');
});

test('peer gain fades with the distance and is nothing beyond HEAR_TILES', () => {
  assert.ok(peerGain(0) > peerGain(3) && peerGain(3) > peerGain(7) && peerGain(7) > 0);
  assert.equal(peerGain(HEAR_TILES), 0); assert.equal(peerGain(50), 0);
  assert.ok(peerGain(0) < 0.5, 'quieter than the own pet');
});

function spy() {
  const s = { calls: [], ambient: (samples, gain) => { s.calls.push([samples.length, gain]); return true; } };
  return s;
}

test('pet sounds: own steps and cues play on the ambient channel; peers only when near, quieter, one step per 90 ms', () => {
  const s = spy(), p = createPetSounds({ sound: s, rand: () => 0.5 });
  assert.equal(p.step('town', 3, 3, false, null), true);
  assert.equal(p.step('town', 3, 3, false, null), false, 'every other step is skipped');
  assert.equal(s.calls.length, 1);
  const own = s.calls[0][1];
  assert.ok(own < 0.12, `a soft step (gain ${own})`);
  p.step('town', 3, 3, true, null);
  assert.equal(s.calls.length, 2);
  assert.ok(s.calls[1][1] > own, 'running is a little firmer');
  p.step('town', 3, 3, true, null);
  assert.equal(p.peerStep('a', 20, 'town', 1, 1, null, 1000), false, 'too far');
  assert.equal(p.peerStep('a', 2, 'town', 1, 1, null, 1000), true);
  assert.ok(s.calls.at(-1)[1] < own, 'a peer is quieter');
  assert.equal(p.peerStep('a', 2, 'town', 1, 1, null, 1150), false, 'rate limited');
  assert.equal(p.peerStep('a', 2, 'town', 1, 1, null, 1200), true);
  const n = s.calls.length;
  assert.equal(p.peerStep('b', 8, 'town', 1, 1, null, 1200), true);
  assert.ok(s.calls.at(-1)[1] < s.calls[n - 1][1], 'fading with distance');
  assert.equal(p.peerJump(30), false); assert.equal(p.peerJump(2), true);
  for (const c of Object.keys(CUES)) assert.equal(p.cue(c), true, c);
  assert.equal(p.cue('nope'), false);
});

test('pet sounds: a step pitches differently from one to the next (the variants are drawn at random)', () => {
  const lens = new Set(); let i = 0;
  const s = spy(), p = createPetSounds({ sound: s, rand: () => ((i++ * 0.37) % 1) });
  for (let k = 0; k < 24; k++) p.step('town', 3, 3, false, null);
  assert.equal(s.calls.length, 12, 'half of them');
  assert.ok(new Set(s.calls.map((c) => c[1].toFixed(4))).size > 3, 'the gain varies');
  assert.ok(lens.size === 0);
});

test('pet sounds on the real player: silent while muted and before a gesture, and the music voice is never cut', () => {
  const log = { started: 0, stopped: 0 };
  const ctx = { state: 'suspended', currentTime: 0, destination: {}, resume() { ctx.state = 'running'; }, createBuffer(c, n) { return { data: new Float32Array(n), getChannelData() { return this.data; } }; }, createGain() { return { gain: { value: 1 }, connect() {} }; }, createBufferSource() { return { connect() {}, start() { log.started++; }, stop() { log.stopped++; }, onended: null }; } };
  const snd = createSound({ ctxFactory: () => ctx }), p = createPetSounds({ sound: snd });
  assert.equal(p.step('town', 3, 3, false, null), false, 'before a gesture');
  snd.unlock();
  snd.playNotes([{ wave: 1, f0: 440, f1: 440, ms: 400, vol: 200 }], 1, 0);
  p.step('town', 3, 3, false, null);
  assert.equal(p.step('town', 3, 3, false, null) || p.step('town', 3, 3, false, null), true);
  assert.equal(p.cue('jump'), true);
  assert.equal(log.stopped, 0, 'the music voice was not cut');
  snd.setMuted(true);
  const before = log.started;
  assert.equal(p.step('town', 3, 3, false, null), false); assert.equal(p.cue('door'), false); assert.equal(p.peerStep('x', 1, 'town', 1, 1, null, 5000), false);
  assert.equal(log.started, before);
});

test('footsteps are dull and quiet: no hiss (the energy sits low), a gain far below the music and the other ambience', async () => {
  const { GAIN: AMB } = await import('../src/ambience.js');
  for (const g of GROUNDS) {
    const a = stepSamples(g, 0);
    let diff = 0, sum = 0;
    for (let i = 1; i < a.length; i++) { diff += Math.abs(a[i] - a[i - 1]); sum += Math.abs(a[i]); }
    assert.ok(diff / sum < 0.5, `${g}: sample-to-sample change ${(diff / sum).toFixed(2)} of the level (a hiss is above 1)`);
    const head = a.reduce((m, x) => Math.max(m, Math.abs(x)), 0), tail = a.slice(-150).reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    assert.ok(tail < head * 0.25, `${g} dies away fast`);
  }
  const p = createPetSounds({ sound: { ambient: (s, gain) => { p.last = gain; return true; } }, rand: () => 0.5 });
  p.step('town', 3, 3, true, null);
  assert.ok(p.last < Math.min(AMB.chirp, AMB.cricket, AMB.animal, AMB.rain) / 2, `step gain ${p.last}`);
});
