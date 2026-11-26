import test from 'node:test';
import assert from 'node:assert/strict';
import { MOODS, MOOD_NAMES, LAYOUT, SONG_BARS, STEPS, VARIANTS, ARP_STYLES, songBar, moodFor, midiToHz, stepSeconds, locate } from '../src/city-song.js';

const bars = (mood, from, to) => Array.from({ length: to - from }, (_, i) => songBar(mood, from + i));
const key = (b) => JSON.stringify(b.steps);

test('song: five moods, a 40-bar structure of intro, A, B, A\', bridge and B\'', () => {
  assert.deepEqual(MOOD_NAMES.sort(), ['beach', 'day', 'farm', 'night', 'rain']);
  assert.deepEqual(LAYOUT.map(([n]) => n), ['intro', 'A', 'B', 'A2', 'bridge', 'B2']);
  assert.equal(SONG_BARS, 40);
  const seen = [];
  for (let n = 0; n < SONG_BARS; n++) { const s = locate('day', n).section; if (seen.at(-1) !== s) seen.push(s); }
  assert.deepEqual(seen, ['intro', 'A', 'B', 'A2', 'bridge', 'B2']);
  assert.equal(songBar('nope', 0), null);
});

test('song: every bar has 16 steps, voices and notes in a playable range, sane lengths and volumes', () => {
  for (const mood of MOOD_NAMES) {
    const voices = new Set();
    for (const b of bars(mood, 0, SONG_BARS * 2)) {
      assert.equal(b.steps.length, STEPS);
      b.steps.forEach((evs, i) => evs.forEach((e) => {
        voices.add(e.v);
        assert.ok(e.vel > 0 && e.vel <= 1, `${mood} vel ${e.vel}`);
        if (e.midi !== undefined) {
          assert.ok(Number.isInteger(e.midi) && e.midi >= 28 && e.midi <= 100, `${mood} ${e.v} midi ${e.midi}`);
          assert.ok(e.len >= 1 && i + e.len <= STEPS + 0, `${mood} ${e.v} len ${e.len} at ${i}`);
        }
      }));
    }
    for (const v of ['lead', 'harm', 'bass', 'hat']) assert.ok(voices.has(v), `${mood} has ${v}`);
  }
  assert.ok(midiToHz(69) === 440 && Math.abs(midiToHz(60) - 261.63) < 0.01);
});

test('song: bass stays low, the lead above it, and the bass plays the chord root on the first beat of the bar', () => {
  for (const mood of MOOD_NAMES) {
    for (const b of bars(mood, 0, SONG_BARS)) {
      const bass = b.steps.flat().filter((e) => e.v === 'bass'), lead = b.steps.flat().filter((e) => e.v === 'lead');
      assert.ok(bass.every((e) => e.midi < 66), `${mood} bass ${bass.map((e) => e.midi)}`);
      assert.ok(lead.every((e) => e.midi >= 60), `${mood} lead ${lead.map((e) => e.midi)}`);
      if (b.kind !== 'bridge' && MOODS[mood].bass[0] !== '.') assert.ok(b.steps[0].some((e) => e.v === 'bass'));
    }
  }
});

test('song: the sections differ: no lead in the intro of the first cycle, no kick or snare in the bridge, a fill closes B', () => {
  for (const mood of ['day', 'beach', 'farm', 'night']) {
    const all = bars(mood, 0, SONG_BARS), at = (s) => all.filter((b) => b.section === s);
    assert.ok(at('intro').every((b) => !b.steps.flat().some((e) => e.v === 'lead' || e.v === 'snare')), `${mood} intro`);
    assert.ok(at('bridge').every((b) => !b.steps.flat().some((e) => e.v === 'kick' || e.v === 'snare')), `${mood} bridge`);
    const last = at('B').at(-1), first = at('B')[0];
    assert.ok(last.steps.flat().filter((e) => e.v === 'snare').length > first.steps.flat().filter((e) => e.v === 'snare').length, `${mood} fill`);
  }
  assert.ok(songBar('day', SONG_BARS).steps.flat().some((e) => e.v === 'lead'), 'from the second cycle the first bars carry the tune');
});

test('song: chords follow each mood\'s progression, so the harmony is diatonic', () => {
  for (const mood of MOOD_NAMES) {
    const m = MOODS[mood];
    for (const b of bars(mood, 0, SONG_BARS)) {
      const prog = m.progs[b.section === 'A2' ? 'A' : b.section];
      assert.equal(b.chord, prog[b.bar % 4], `${mood} ${b.section} ${b.bar}`);
      const scalePcs = new Set(m.scale.map((x) => (m.root + x) % 12));
      for (const e of b.steps.flat()) if (e.midi !== undefined && e.v !== 'lead') assert.ok(scalePcs.has(e.midi % 12), `${mood} ${e.v} ${e.midi} out of key`);
    }
  }
});

test('song: deterministic, and the same bar never comes twice in the first cycles', () => {
  for (const mood of MOOD_NAMES) {
    assert.deepEqual(songBar(mood, 17), songBar(mood, 17));
    const first = bars(mood, 0, SONG_BARS * 4).map(key);
    // cycles differ from each other (the melody has 4 variants) ...
    for (let c = 1; c < 4; c++) assert.notDeepEqual(first.slice(c * SONG_BARS, (c + 1) * SONG_BARS), first.slice(0, SONG_BARS), `${mood} cycle ${c}`);
    // ... and A differs from A' and B from B' inside a cycle
    const sec = (name) => bars(mood, 0, SONG_BARS).filter((b) => b.section === name).map(key);
    assert.notDeepEqual(sec('A'), sec('A2'), `${mood} A vs A2`); assert.notDeepEqual(sec('B'), sec('B2'), `${mood} B vs B2`);
  }
});

test('song: the exact music only repeats after 12 cycles, which is many minutes in every mood', () => {
  assert.equal(VARIANTS * ARP_STYLES, 12);
  for (const mood of MOOD_NAMES) {
    const total = (SONG_BARS * VARIANTS * ARP_STYLES) * stepSeconds(mood) * STEPS;
    assert.ok(total > 14 * 60, `${mood}: ${Math.round(total / 60)} min`);
    const seen = new Set();
    for (let c = 0; c < 6; c++) seen.add(bars(mood, c * SONG_BARS + 4, c * SONG_BARS + 12).map(key).join());
    assert.equal(seen.size, 6, `${mood}: the first six cycles' A sections are all different`);
  }
});

test('song: moods: rain wins, then night, then the beach and the farm by place, else day; night and rain are slower and softer', () => {
  assert.equal(moodFor(0, null), 'day'); assert.equal(moodFor(1, { rain: 0, snow: 0 }), 'night');
  assert.equal(moodFor(1, { rain: 0.8, snow: 0 }), 'rain'); assert.equal(moodFor(0, { rain: 0, snow: 0.9 }), 'rain');
  assert.equal(moodFor(0, null, 'beach'), 'beach'); assert.equal(moodFor(0, null, 'farm'), 'farm'); assert.equal(moodFor(0, null, 'town'), 'day');
  assert.equal(moodFor(0.9, null, 'beach'), 'night'); assert.equal(moodFor(0, { rain: 1, snow: 0 }, 'farm'), 'rain');
  assert.ok(MOODS.rain.bpm < MOODS.night.bpm && MOODS.night.bpm < MOODS.day.bpm);
  assert.ok(MOODS.rain.level < MOODS.night.level && MOODS.night.level < MOODS.day.level);
  assert.ok(MOODS.beach.swing > MOODS.day.swing, 'the beach swings the most');
  assert.ok(MOODS.night.scale.includes(3) && !MOODS.night.scale.includes(4), 'night is minor');
  assert.ok(MOODS.day.scale.includes(4), 'day is major');
});
