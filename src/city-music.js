// The town's own music: a calm, slow tune from the game's synth (src/sound.js), phrase after phrase with a pause between them, in three moods: day (bright, a pentatonic
// walk), night (lower, slower) and rain (softest, sparse, a little sad). Pure: `phraseFor` makes the notes, `createCityMusic` decides when the next phrase starts.
// The synth has one voice and the music plays at its lowest priority, so every effect cuts it and it never cuts one; a phrase that is cut is not played again at once
// (the next one follows after the pause). The mood is read when a phrase starts, so a change of weather never cuts a phrase short.
import { note, W } from './sound.js';

export const MUSIC_LEVEL = 1;                                    // the quietest level: the effects (level 2) and the ambient channel stay in front

// Hz, equal temperament, rounded: the low octave the night mood lives in, and the one above.
const F = { A3: 220, C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, G5: 784 };

/**
 * The moods: the scale (an index per note; -1 in a pattern is a rest), the step in ms, the wave, the volume and the phrase patterns of 16 steps. `gap` is the pause between
 * two phrases in ms [min, max]; it is what keeps the music from feeling like a loop.
 */
export const MOODS = {
  day: {
    scale: [F.C4, F.D4, F.E4, F.G4, F.A4, F.C5, F.D5, F.E5], ms: 340, wave: W.TRI, vol: 120, gap: [2500, 6000],
    patterns: [
      [0, 2, 3, 2, 4, 3, 2, -1, 1, 2, 3, 5, 4, 3, 2, -1],
      [4, 3, 2, 3, 4, 5, 4, -1, 3, 2, 1, 2, 3, 2, 0, -1],
      [2, 3, 4, 6, 5, 4, 3, -1, 2, 4, 5, 4, 3, 2, 1, -1],
      [0, 1, 2, 4, 3, 2, 1, -1, 2, 3, 4, 5, 7, 5, 4, -1],
    ],
  },
  night: {
    scale: [F.A3, F.C4, F.D4, F.E4, F.G4, F.A4, F.C5], ms: 520, wave: W.TRI, vol: 100, gap: [3500, 8000],
    patterns: [
      [0, -1, 2, 3, -1, 2, 1, -1, 0, -1, 3, 4, -1, 3, 2, -1],
      [3, -1, 4, 5, -1, 4, 3, -1, 2, -1, 1, 2, -1, 1, 0, -1],
      [0, 1, 2, -1, 3, 2, 1, -1, 2, 3, 4, -1, 3, 1, 0, -1],
    ],
  },
  rain: {
    scale: [F.C4, F.D4, F.F4, F.G4, F.A4, F.C5], ms: 620, wave: W.TRI, vol: 90, gap: [4500, 9000],
    patterns: [
      [0, -1, -1, 2, -1, 3, -1, -1, 4, -1, 3, -1, 2, -1, -1, -1],
      [3, -1, 2, -1, -1, 1, -1, -1, 0, -1, 2, -1, 3, -1, -1, -1],
      [5, -1, -1, 4, -1, 3, -1, -1, 2, -1, 1, -1, 0, -1, -1, -1],
    ],
  },
};

/** The mood for the town now: rain (or heavy snow) wins, then night, else day. `night` 0..1 (the town's), `weather` the amounts of src/weather.js (or null). */
export function moodFor(night, weather) {
  if (weather && (weather.rain > 0.3 || weather.snow > 0.6)) return 'rain';
  return night > 0.5 ? 'night' : 'day';
}

/** The notes of phrase number `n` of a mood (the patterns take turns). Each note is shorter than its step, so the notes are separate. */
export function phraseFor(mood, n = 0) {
  const m = MOODS[mood];
  if (!m) return [];
  const pat = m.patterns[Math.abs(n) % m.patterns.length];
  return pat.map((i) => (i < 0 ? note(W.REST, 0, 0, m.ms, 0) : note(m.wave, m.scale[i], m.scale[i], m.ms - 40, m.vol)));
}
export const phraseMs = (notes) => notes.reduce((a, x) => a + x.ms, 0);

/**
 * The scheduler. play(notes) starts a phrase and says whether it sounded (false: muted or no audio yet). step(ms, mood) is called every frame with the mood now (null: silence:
 * muted, or a layer over the town). The first phrase starts after a short wait, then each follows the last one's end plus a random pause (`rand`).
 */
export function createCityMusic({ play, rand = Math.random, firstMs = 1500, retryMs = 2000 }) {
  let wait = firstMs, n = 0;
  return {
    step(ms, mood) {
      if (!mood || !MOODS[mood]) { wait = Math.max(wait, 0); return false; }       // silent: the timer holds, so nothing bursts out when the sound comes back
      wait -= ms;
      if (wait > 0) return false;
      const notes = phraseFor(mood, n), [a, b] = MOODS[mood].gap;
      if (play(notes)) { n++; wait = phraseMs(notes) + a + rand() * (b - a); return true; }
      wait = retryMs;
      return false;
    },
    reset() { wait = firstMs; },
    get phrases() { return n; },
  };
}
