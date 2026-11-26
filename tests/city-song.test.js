import test from 'node:test';
import assert from 'node:assert/strict';
import { MOODS, MOOD_NAMES, BARS, STEPS, SECTIONS, songBar, moodFor, midiToHz, stepSeconds, chordPcs, parseBar } from '../src/city-song.js';

const TABLE = {
  day: 'C G Am F | C G F C | Am Em F G | C G F G',
  night: 'Am F C G | Am F G Am | Dm Am F E | Am F G E',
  rain: 'G Em C D | G Em C G | Em Bm C D | G Em C D',
  beach: 'D Bm G A | D Bm G D | G A F#m Bm | D Bm G A',
  farm: 'G C G D | G C D G | C G Am D | G C Am D',
};
const BPM = { day: 120, night: 80, rain: 70, beach: 110, farm: 104 };
const bars = (mood) => Array.from({ length: BARS }, (_, i) => songBar(mood, i));
const leadOf = (mood, i) => songBar(mood, i).steps.flatMap((evs, at) => evs.filter((e) => e.v === 'lead').map((e) => ({ at, ...e })));
const pc = (midi) => midi % 12;

test('song: five moods, each exactly 16 bars in sections A, A\', B, A\'', () => {
  assert.deepEqual([...MOOD_NAMES].sort(), ['beach', 'day', 'farm', 'night', 'rain']);
  assert.equal(BARS, 16); assert.deepEqual(SECTIONS, ['A', 'A2', 'B', 'A3']);
  for (const mood of MOOD_NAMES) {
    assert.equal(MOODS[mood].chords.length, 16); assert.equal(MOODS[mood].lead.length, 16);
    assert.deepEqual(bars(mood).map((b) => b.section), ['A', 'A', 'A', 'A', 'A2', 'A2', 'A2', 'A2', 'B', 'B', 'B', 'B', 'A3', 'A3', 'A3', 'A3'], mood);
    assert.equal(MOODS[mood].bpm, BPM[mood]);
  }
  assert.equal(songBar('nope', 0), null);
});

test('song: one chord per bar, exactly the written progressions', () => {
  for (const mood of MOOD_NAMES) assert.deepEqual(bars(mood).map((b) => b.chord), TABLE[mood].replace(/\|/g, '').split(/\s+/), mood);
});

test('song: bars 5-7 repeat the lead of bars 1-3, bar 8 closes differently on the tonic, bars 13-16 return to A and lead home', () => {
  for (const mood of MOOD_NAMES) {
    for (let i = 0; i < 3; i++) assert.deepEqual(leadOf(mood, 4 + i), leadOf(mood, i), `${mood} bar ${5 + i}`);
    assert.notDeepEqual(leadOf(mood, 7), leadOf(mood, 3), `${mood} bar 8`);
    const tonic = chordPcs(MOODS[mood].chords[0])[0], last8 = leadOf(mood, 7).at(-1);
    assert.equal(pc(last8.midi) === tonic || leadOf(mood, 7).some((e) => e.at === 8 && pc(e.midi) === tonic), true, `${mood} bar 8 lands on the tonic`);
    assert.deepEqual(leadOf(mood, 12), leadOf(mood, 0)); assert.deepEqual(leadOf(mood, 13), leadOf(mood, 1));
    assert.notDeepEqual(MOODS[mood].lead.slice(8, 12), MOODS[mood].lead.slice(0, 4), `${mood} B contrasts`);
  }
});

test('song: the lead plays chord tones on beats 1 and 3, every bar adds up to a full bar, and each section has a rest', () => {
  for (const mood of MOOD_NAMES) {
    bars(mood).forEach((b, i) => {
      const parsed = parseBar(MOODS[mood].lead[i]);
      assert.equal(parsed.reduce((a, [, d]) => a + d, 0), STEPS, `${mood} bar ${i + 1} adds up to one bar`);
      const tones = chordPcs(b.chord);
      for (const e of leadOf(mood, i)) if (e.at === 0 || e.at === 8) assert.ok(tones.includes(pc(e.midi)), `${mood} bar ${i + 1} step ${e.at}: ${e.midi} over ${b.chord}`);
    });
    for (let s = 0; s < 4; s++) assert.ok(MOODS[mood].lead.slice(s * 4, s * 4 + 4).some((t) => /\bR\//.test(t)), `${mood} section ${SECTIONS[s]} has a rest`);
  }
});

test('song: bass plays only the root or fifth, the arpeggio only chord tones, both under the lead', () => {
  for (const mood of MOOD_NAMES) {
    for (const b of bars(mood)) {
      const [root, third, fifth] = chordPcs(b.chord), all = b.steps.flat();
      const bass = all.filter((e) => e.v === 'bass'), harm = all.filter((e) => e.v === 'harm'), lead = all.filter((e) => e.v === 'lead');
      assert.ok(bass.length > 0 && harm.length > 0 && lead.length > 0);
      assert.ok(bass.every((e) => [root, fifth].includes(pc(e.midi)) && e.midi >= 36 && e.midi < 60), `${mood} bass`);
      assert.ok(harm.every((e) => [root, third, fifth].includes(pc(e.midi))), `${mood} arpeggio`);
      assert.deepEqual(new Set(harm.map((e) => pc(e.midi))), new Set([root, third, fifth]), `${mood} arpeggio uses all three notes`);
      assert.ok(Math.max(...harm.map((e) => e.vel)) < Math.min(...lead.map((e) => e.vel)), `${mood} harmony softer than the lead`);
      assert.ok(Math.max(...bass.map((e) => e.vel)) < Math.min(...lead.map((e) => e.vel)));
      for (const e of all) if (e.midi !== undefined) assert.ok(Number.isInteger(e.midi) && e.midi >= 36 && e.midi <= 100 && e.len >= 1, `${mood} ${e.v}`);
    }
  }
  assert.ok(midiToHz(69) === 440 && Math.abs(midiToHz(60) - 261.63) < 0.01);
});

test('song: drums: the kick only on beats 1 and 3, the snare or hat only on beats 2 and 4, nothing else', () => {
  for (const mood of MOOD_NAMES) {
    for (const b of bars(mood)) {
      const hits = b.steps.flatMap((evs, at) => evs.filter((e) => ['kick', 'snare', 'hat'].includes(e.v)).map((e) => [at, e.v]));
      assert.deepEqual(hits.filter(([, v]) => v === 'kick').map(([a]) => a), [0, 8]);
      const back = hits.filter(([, v]) => v !== 'kick');
      assert.deepEqual(back.map(([a]) => a), [4, 12]);
      assert.ok(back.every(([, v]) => v === (mood === 'rain' ? 'hat' : 'snare')), `${mood} backbeat voice`);
    }
  }
  const kick = (m) => songBar(m, 0).steps[0].find((e) => e.v === 'kick').vel;
  assert.ok(kick('rain') < kick('day') && kick('rain') <= 0.3, 'rain has a very soft kick');
});

test('song: deterministic, and the loop restarts at bar 1 after bar 16', () => {
  for (const mood of MOOD_NAMES) {
    assert.deepEqual(songBar(mood, 5), songBar(mood, 5));
    assert.deepEqual(songBar(mood, 16).steps, songBar(mood, 0).steps);
    assert.deepEqual(songBar(mood, 16 * 7 + 9), songBar(mood, 9));
    assert.equal(songBar(mood, 16).bar, 0); assert.equal(songBar(mood, 15).bar, 15);
  }
});

test('song: moods: rain wins, then night, then the beach and the farm by place, else day; night and rain are slower, softer and sparser', () => {
  assert.equal(moodFor(0, null), 'day'); assert.equal(moodFor(1, { rain: 0, snow: 0 }), 'night');
  assert.equal(moodFor(1, { rain: 0.8, snow: 0 }), 'rain'); assert.equal(moodFor(0, { rain: 0, snow: 0.9 }), 'rain');
  assert.equal(moodFor(0, null, 'beach'), 'beach'); assert.equal(moodFor(0, null, 'farm'), 'farm'); assert.equal(moodFor(0, null, 'town'), 'day');
  assert.equal(moodFor(0.9, null, 'beach'), 'night'); assert.equal(moodFor(0, { rain: 1, snow: 0 }, 'farm'), 'rain');
  assert.ok(MOODS.rain.bpm < MOODS.night.bpm && MOODS.night.bpm < MOODS.day.bpm);
  assert.ok(MOODS.rain.level < MOODS.night.level && MOODS.night.level < MOODS.day.level);
  const rests = (m) => MOODS[m].lead.join(' ').match(/R\/\d+/g).length, notes = (m) => MOODS[m].lead.join(' ').split(/\s+/).length;
  assert.ok(rests('rain') / notes('rain') > rests('day') / notes('day'), 'rain has proportionally more rests');
  assert.ok(MOODS.beach.swing > 0 && stepSeconds('day') === 0.125);
});
