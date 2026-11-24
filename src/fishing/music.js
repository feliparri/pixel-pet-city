// The music of fishing: a short phrase after another, from the town's synth, in three moods. Calm while the line is out (and between casts), tenser on the bite,
// quick and driving while reeling. Pure: `phraseFor` makes the notes, `createMusic` decides when the next phrase starts (the controller feeds it the loop's time).
// The synth has one voice: music plays at the lowest priority, so any effect cuts it and it never cuts an effect.
import { note, W, N } from '../sound.js';

export const MUSIC_LEVEL = 1;                                    // quieter than the effects (level 2)
const HZ = { C4: N.C4, D4: N.D4, E4: N.E4, G4: N.G4, A4: N.A4, C5: N.C5, D5: N.D5, E5: N.E5, G5: N.G5, A5: N.A5 };
const MINOR = { A4: N.A4, C5: N.C5, D5: N.D5, E5: N.E5, G5: N.G5, A5: N.A5, B4: N.B4, F5: N.F5 };

/** The moods: the scale, the length of a step in ms, the wave, the volume and the phrase patterns (indexes into the scale; -1 is a rest). */
export const MOODS = {
  calm: { scale: [HZ.C4, HZ.D4, HZ.E4, HZ.G4, HZ.A4, HZ.C5, HZ.D5, HZ.E5], ms: 300, wave: W.TRI, vol: 120, patterns: [[0, 2, 4, 2, 3, 1, 2, -1], [4, 5, 4, 3, 2, 3, 1, -1], [2, 3, 4, 6, 5, 4, 3, -1], [0, 1, 2, 4, 3, 2, 1, -1]] },
  tense: { scale: [MINOR.A4, MINOR.B4, MINOR.C5, MINOR.D5, MINOR.E5, MINOR.F5, MINOR.G5, MINOR.A5], ms: 150, wave: W.SQ25, vol: 110, patterns: [[0, 2, 4, 2, 0, 2, 4, 6], [4, 5, 4, 2, 4, 5, 6, 7]] },
  reel: { scale: [MINOR.A4, MINOR.C5, MINOR.D5, MINOR.E5, MINOR.G5, MINOR.A5], ms: 105, wave: W.SQ25, vol: 115, patterns: [[0, 0, 2, 0, 3, 0, 4, 3], [0, 0, 3, 0, 2, 0, 4, 5], [0, 2, 3, 2, 0, 2, 4, 2]] },
};

/** The mood for a phase of the run: null (silence) when the cast is over. */
export const moodFor = (phase) => (phase === 'bite' ? 'tense' : phase === 'reeling' ? 'reel' : phase === 'caught' || phase === 'escaped' ? null : 'calm');

/** The notes of phrase number `n` of a mood (the patterns take turns). */
export function phraseFor(mood, n = 0) {
  const m = MOODS[mood];
  if (!m) return [];
  const pat = m.patterns[Math.abs(n) % m.patterns.length];
  return pat.map((i) => (i < 0 ? note(W.REST, 0, 0, m.ms, 0) : note(m.wave, m.scale[i], m.scale[i], m.ms - 20, m.vol)));
}
export const phraseMs = (notes) => notes.reduce((a, x) => a + x.ms, 0);

/**
 * The scheduler. play(notes) starts a phrase and says whether it sounded (false: an effect was playing, or muted). step(ms, mood) is called every loop step with the
 * mood now (null: silence); a change of mood starts the next phrase at once. A phrase that did not sound is tried again soon. Returns true when a phrase was started.
 */
export function createMusic({ play, retryMs = 120 }) {
  let wait = 0, n = 0, last = null;
  return {
    step(ms, mood) {
      if (!mood) { last = null; wait = 0; return false; }
      if (mood !== last) { last = mood; wait = 0; }
      wait -= ms;
      if (wait > 0) return false;
      const notes = phraseFor(mood, n);
      if (play(notes)) { n++; wait = phraseMs(notes); return true; }
      wait = retryMs;
      return false;
    },
    reset() { wait = 0; last = null; },
    get phrases() { return n; },
  };
}
