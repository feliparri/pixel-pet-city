import test from 'node:test';
import assert from 'node:assert/strict';
import { cuesFor, playEvents, FANFARE, reelClick, REEL_CLICK_S, CAST, BITE, PLOP } from '../src/fishing/sfx.js';
import { phraseFor, phraseMs, createMusic, moodFor, MOODS } from '../src/fishing/music.js';
import { createFishing, press, release, tick, fishById, FISH } from '../src/fishing/rules.js';
import { renderNotes, cueMs, createSound, W } from '../src/sound.js';

const EVENTS = ['charge', 'cast', 'land', 'nibble', 'bite', 'reel', 'catch', 'escape', 'snap'];

test('sfx: every event of the rules has a cue, and its notes render', () => {
  for (const e of EVENTS) {
    const c = cuesFor([e], fishById('carpa'));
    assert.equal(c.length, 1, e); assert.equal(c[0].name, e);
    assert.ok(c[0].notes.length > 0);
    const pcm = renderNotes(c[0].notes, 2);
    assert.ok(pcm.some((x) => x !== 0), `${e} makes a sound`);
  }
  assert.deepEqual(cuesFor(['nope', 'charge']).map((c) => c.name), ['charge'], 'an unknown event is ignored');
  assert.deepEqual(cuesFor(null), []);
});

test('sfx: the catch fanfare grows with the fish', () => {
  const ms = (rarity) => cueMs(FANFARE[rarity]);
  assert.ok(ms('common') < ms('rare') && ms('rare') < ms('epic'), `${ms('common')} < ${ms('rare')} < ${ms('epic')}`);
  for (const f of FISH) assert.equal(cuesFor(['catch'], f)[0].notes, FANFARE[f.rarity]);
  assert.equal(cuesFor(['catch'], null)[0].notes, FANFARE.common, 'no fish: the plain one');
});

test('sfx: the bite is sharper than the nibble, and the reel click says whether the marker is on the zone', () => {
  const peak = (notes) => Math.max(...renderNotes(notes, 2).map(Math.abs));
  assert.ok(peak(BITE) > peak(cuesFor(['nibble'])[0].notes));
  assert.notDeepEqual(reelClick(true), reelClick(false));
  assert.ok(reelClick(true)[0].f0 > reelClick(false)[0].f0);
  assert.ok(REEL_CLICK_S > 0.1 && REEL_CLICK_S < 0.6);
});

test('sfx: a whole run asks for its sounds in order, from the rules events', () => {
  const heard = [], player = { playNotes: (n) => heard.push(n) };
  const s = createFishing(21, { night: false, christmas: false });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { tick(s, 1 / 60); playEvents(player, s.events, s.fish); } };
  press(s); playEvents(player, s.events);
  step(30); release(s); playEvents(player, s.events);
  while (s.phase !== 'bite') step();
  press(s); playEvents(player, s.events, s.fish);
  assert.equal(heard[0], cuesFor(['charge'])[0].notes);
  assert.equal(heard[1], CAST);
  assert.ok(heard.includes(PLOP), 'the float plops');
  assert.ok(heard.includes(BITE), 'the bite cue');
  assert.ok(heard.indexOf(PLOP) < heard.indexOf(BITE));
  assert.equal(playEvents({ playNotes() { throw new Error('no audio'); } }, ['cast']), 0, 'a broken player never breaks the game');
});

test('music: phrases are deterministic, and the tense moods are quicker than the calm one', () => {
  for (const mood of Object.keys(MOODS)) {
    assert.deepEqual(phraseFor(mood, 3), phraseFor(mood, 3));
    assert.ok(phraseFor(mood, 0).length >= 8);
    for (let n = 0; n < 4; n++) assert.ok(renderNotes(phraseFor(mood, n), 1).some((x) => x !== 0));
  }
  assert.ok(MOODS.tense.ms < MOODS.calm.ms && MOODS.reel.ms < MOODS.tense.ms, 'calm slowest, reel quickest');
  assert.ok(phraseMs(phraseFor('reel', 0)) < phraseMs(phraseFor('calm', 0)));
  assert.notDeepEqual(phraseFor('calm', 0), phraseFor('calm', 1), 'the phrases take turns');
  assert.deepEqual(phraseFor('nope'), []);
});

test('music: the mood follows the phase and the cast over means silence', () => {
  for (const p of ['idle', 'charging', 'cast', 'waiting']) assert.equal(moodFor(p), 'calm');
  assert.equal(moodFor('bite'), 'tense'); assert.equal(moodFor('reeling'), 'reel');
  assert.equal(moodFor('caught'), null); assert.equal(moodFor('escaped'), null);
});

test('music: a phrase after another, a change of mood at once, silence on null, a dropped phrase retried soon', () => {
  const heard = []; let sounds = true;
  const m = createMusic({ play: (n) => { heard.push(n); return sounds; } });
  assert.equal(m.step(16, 'calm'), true); assert.equal(heard.length, 1);
  const len = phraseMs(heard[0]);
  assert.equal(m.step(len - 100, 'calm'), false, 'the phrase is still going');
  assert.equal(m.step(100, 'calm'), true, 'the next one when it ends'); assert.equal(heard.length, 2);
  assert.equal(m.step(16, 'reel'), true, 'a new mood starts at once'); assert.deepEqual(heard[2].map((x) => x.wave).includes(W.SQ25), true);
  assert.equal(m.step(16, null), false); assert.equal(heard.length, 3, 'silence');
  sounds = false;
  assert.equal(m.step(16, 'calm'), false); const tried = heard.length;
  assert.equal(m.step(50, 'calm'), false); assert.equal(heard.length, tried, 'not yet');
  sounds = true;
  assert.equal(m.step(100, 'calm'), true, 'retried after a moment');
});

test('sound: music (priority 0) never cuts an effect, an effect cuts the music, stop() silences, mute is respected', () => {
  const log = { started: 0, stopped: 0 };
  const ctx = { state: 'running', currentTime: 0, destination: {}, createBuffer: (c, n) => ({ n, getChannelData: () => new Float32Array(n) }), createBufferSource: () => ({ connect() {}, start() { log.started++; }, stop() { log.stopped++; }, buffer: null, onended: null }) };
  const snd = createSound({ ctxFactory: () => ctx });
  const tune = phraseFor('calm', 0), blip = reelClick(true);
  assert.equal(snd.playNotes(tune, 1, 0), true);
  assert.equal(snd.playNotes(blip), true, 'an effect cuts the music'); assert.equal(log.stopped, 1);
  assert.equal(snd.playNotes(tune, 1, 0), false, 'music does not cut an effect');
  ctx.currentTime = 5;
  assert.equal(snd.playNotes(tune, 1, 0), true, 'once the effect is over it may');
  snd.stop(); assert.equal(log.stopped, 3);
  snd.stop(); assert.equal(log.stopped, 3, 'nothing left to stop');
  snd.setMuted(true);
  assert.equal(snd.playNotes(tune, 1, 0), false); assert.equal(snd.playNotes(blip), false);
});
