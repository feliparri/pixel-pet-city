// The town's tune as pure data: no AudioContext, no clock, no randomness. Every mood is ONE hand-written 16-bar loop in 4/4 (A bars 1-4, A' 5-8, B 9-12, A'' 13-16; bar 16 leads
// back to bar 1), with one chord per bar. `songBar(mood, n)` gives bar `n` (any integer >= 0; the loop wraps) as 16 sixteenth-note steps of events, the same way every time, so the
// scheduler (src/city-music.js) only turns events into sound and the tests can read the music.
// Four channels: lead (square 50 %, the written melody with rests), harmony (pulse 25 %, a 3-note arpeggio of the bar's chord), bass (triangle, root and fifth) and noise drums
// (kick on beats 1 and 3, snare or hat on beats 2 and 4, nothing else).
// Events: { v: voice, midi, len (steps), vel (0..1) } for lead / harm / bass, and { v: 'kick'|'snare'|'hat', vel } for the noise channel.

export const STEPS = 16;                                       // sixteenth notes per 4/4 bar
export const BARS = 16;                                        // bars in every mood's loop
export const SECTIONS = ['A', 'A2', 'B', 'A3'];                // A, A', B, A'': four bars each

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** The triad of a chord name ('C', 'Am', 'F#m'): { pcs: [root, third, fifth] as pitch classes }. */
export function chordPcs(name) {
  const m = /^([A-G])(#?)(m?)$/.exec(name);
  if (!m) throw new Error(`bad chord ${name}`);
  const root = (PC[m[1]] + (m[2] ? 1 : 0)) % 12;
  return [root, (root + (m[3] ? 3 : 4)) % 12, (root + 7) % 12];
}
/** A note name ('E5', 'G#4') as a MIDI number (C4 = 60). */
export function noteMidi(name) {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] ? 1 : 0);
}
/** A written bar 'E5/4 R/2 ...' (pitch/length in sixteenths, R a rest) as [midi|null, steps] pairs. */
export function parseBar(text) {
  return text.trim().split(/\s+/).map((t) => { const [p, d] = t.split('/'); return [p === 'R' ? null : noteMidi(p), +d]; });
}

// ---- The music. Each lead bar is written note by note: pitch/length in sixteenths (4 = a quarter), R = a rest. Every bar adds up to 16. ----

// Day: C major, bouncy quarter-and-eighth motif that breathes with a rest at the end of each bar.
const DAY_A = ['E5/4 G5/2 E5/2 C5/4 R/4', 'D5/4 G5/2 D5/2 B4/4 R/4', 'C5/4 E5/2 C5/2 A4/6 R/2'];
// Night: A minor, long held notes, a slow sigh.
const NIGHT_A = ['E5/8 C5/4 R/4', 'A4/8 C5/6 R/2', 'G5/6 E5/2 G5/4 E5/2 R/2'];
// Rain: G major, sparse: a few notes, lots of silence.
const RAIN_A = ['B4/6 R/2 D5/6 R/2', 'G4/6 R/2 B4/4 G4/2 R/2', 'E5/6 R/2 G5/6 R/2'];
// Beach: D major, running eighths that climb and fall like a wave.
const BEACH_A = ['F#5/2 A5/2 F#5/2 D5/2 A5/4 F#5/2 R/2', 'D5/2 F#5/2 D5/2 B4/2 F#5/4 D5/2 R/2', 'B4/2 D5/2 G5/2 D5/2 B5/4 G5/2 R/2'];
// Farm: G major, a dotted skipping rhythm (3+1).
const FARM_A = ['G4/3 B4/1 D5/2 B4/2 G5/3 D5/1 B4/2 R/2', 'E5/3 G5/1 E5/2 C5/2 G5/3 E5/1 C5/2 R/2', 'D5/3 B4/1 D5/2 G4/2 D5/3 B4/1 G4/2 R/2'];

export const MOODS = {
  day: {
    bpm: 120, swing: 0, duty: 0.5, level: 1,
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C', 'Am', 'Em', 'F', 'G', 'C', 'G', 'F', 'G'],
    lead: [
      ...DAY_A, 'A4/4 C5/2 A4/2 F5/4 D5/2 E5/2',                                                     // A (bar 3 shares C and A with bar 7's F)
      ...DAY_A, 'E5/4 G5/2 E5/2 C5/6 R/2',                                                           // A': same three bars, closes on the tonic
      'A5/2 R/2 G5/2 E5/2 C6/4 A5/2 R/2', 'B5/2 R/2 G5/2 E5/2 G5/4 B5/2 R/2', 'A5/2 R/2 F5/2 C5/2 F5/4 A5/4', 'G5/2 B5/2 D6/4 B5/4 R/2 D5/2', // B: syncopated bridge
      DAY_A[0], DAY_A[1], 'A4/4 C5/2 F5/2 A5/4 R/4', 'D5/4 G5/2 B5/2 D6/2 B5/2 G5/2 R/2',            // A'': the theme returns, bar 16 leads home
    ],
    bass: '0.0.1.1.0.0.1.1.', arp: { pat: [0, 1, 2, 1], every: 1 }, drums: { backbeat: 'snare', kick: 0.8, back: 0.45 },
  },
  night: {
    bpm: 80, swing: 0, duty: 0.5, level: 0.8,
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am', 'Dm', 'Am', 'F', 'E', 'Am', 'F', 'G', 'E'],
    lead: [
      ...NIGHT_A, 'D5/8 B4/4 R/4',
      ...NIGHT_A, 'E5/8 C5/4 A4/4',
      'F5/8 A5/4 R/4', 'E5/8 C6/4 R/4', 'A5/8 F5/4 C5/4', 'G#5/6 B5/2 E6/4 B5/4',
      NIGHT_A[0], NIGHT_A[1], NIGHT_A[2], 'E5/6 D5/2 B4/4 G#4/2 R/2',
    ],
    bass: '0.......1.......', arp: { pat: [0, 1, 2, 1], every: 2 }, drums: { backbeat: 'snare', kick: 0.6, back: 0.3 },
  },
  rain: {
    bpm: 70, swing: 0, duty: 0.5, level: 0.7,
    chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'C', 'G', 'Em', 'Bm', 'C', 'D', 'G', 'Em', 'C', 'D'],
    lead: [
      ...RAIN_A, 'F#5/4 A4/4 D5/6 R/2',
      ...RAIN_A, 'D5/6 B4/2 G4/8',
      'E5/4 R/4 B4/6 R/2', 'D5/4 R/4 F#5/6 R/2', 'G5/4 R/4 E5/6 R/2', 'A5/4 R/4 F#5/6 D5/2',
      RAIN_A[0], RAIN_A[1], RAIN_A[2], 'A4/4 F#5/4 D5/6 R/2',
    ],
    bass: '0.......1.......', arp: { pat: [0, 1, 2, 1], every: 2 }, drums: { backbeat: 'hat', kick: 0.25, back: 0.35 },
  },
  beach: {
    bpm: 110, swing: 0.18, duty: 0.5, level: 0.95,
    chords: ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'G', 'D', 'G', 'A', 'F#m', 'Bm', 'D', 'Bm', 'G', 'A'],
    lead: [
      ...BEACH_A, 'A4/2 C#5/2 E5/2 C#5/2 A5/4 E5/2 C#5/2',
      ...BEACH_A, 'F#5/2 A5/2 F#5/2 D5/2 D6/6 R/2',
      'G5/4 B5/2 G5/2 D6/4 B5/2 R/2', 'A5/4 C#6/2 A5/2 E6/4 C#6/2 R/2', 'F#5/4 A5/2 F#5/2 C#6/4 A5/2 R/2', 'B5/2 D6/2 F#6/4 D6/4 B5/2 F#5/2',
      BEACH_A[0], BEACH_A[1], BEACH_A[2], 'A5/2 C#6/2 A5/2 E5/2 E6/4 A5/4',
    ],
    bass: '0.0.1.0.0.0.1.0.', arp: { pat: [0, 1, 2, 1], every: 2 }, drums: { backbeat: 'snare', kick: 0.8, back: 0.45 },
  },
  farm: {
    bpm: 104, swing: 0.1, duty: 0.5, level: 0.95,
    chords: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G', 'C', 'G', 'Am', 'D', 'G', 'C', 'Am', 'D'],
    lead: [
      ...FARM_A, 'F#5/3 A5/1 F#5/2 D5/2 A5/3 F#5/1 D5/2 R/2',
      ...FARM_A, 'B4/3 D5/1 G5/2 D5/2 G5/6 R/2',
      'G5/2 E5/2 C5/2 E5/2 G5/4 E5/2 R/2', 'B5/2 G5/2 D5/2 G5/2 B5/4 G5/2 R/2', 'A5/2 E5/2 C5/2 E5/2 A5/4 E5/2 R/2', 'A5/2 F#5/2 D5/2 F#5/2 A5/4 F#5/2 D5/2',
      FARM_A[0], FARM_A[1], 'C5/3 E5/1 A5/2 E5/2 C6/3 A5/1 E5/2 R/2', 'F#5/3 A5/1 F#5/2 D5/2 A5/3 F#5/1 D5/2 R/2',
    ],
    bass: '0.1.0.1.0.1.0.1.', arp: { pat: [0, 2, 1, 2], every: 2 }, drums: { backbeat: 'snare', kick: 0.8, back: 0.45 },
  },
};
export const MOOD_NAMES = Object.keys(MOODS);

/** The mood for the town now: rain (or heavy snow) wins, then night, then the beach and the farm by area, else day. `night` 0..1, `weather` as src/weather.js (or null). */
export function moodFor(night, weather, area) {
  if (weather && (weather.rain > 0.3 || weather.snow > 0.6)) return 'rain';
  if (night > 0.5) return 'night';
  return area === 'beach' ? 'beach' : area === 'farm' ? 'farm' : 'day';
}

export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
export const stepSeconds = (mood) => 60 / MOODS[mood].bpm / 4;
export const barSeconds = (mood) => stepSeconds(mood) * STEPS;

/** The bass's root and fifth for a chord, in the octave from C2 to B2. */
export function bassNotes(chord) {
  const [root] = chordPcs(chord), low = 36 + root;
  return [low, low + 7];
}
/** The three arpeggio notes (root, third, fifth) of a chord, from the octave above the bass. */
export function arpNotes(chord) {
  const [r, t, f] = chordPcs(chord), base = 48 + r;
  return [base, base + ((t - r + 12) % 12), base + ((f - r + 12) % 12)];
}

/**
 * Bar `n` of `mood`: { mood, section, bar (0..15), chord, steps } where steps is 16 lists of events. Pure and deterministic; the loop wraps after bar 16 (n = 15 -> n = 16 is bar 1).
 * Dynamics are fixed: the lead is loudest (the beat-1 and beat-3 notes a little more), the harmony and the bass sit under it, and the drums are subtle.
 */
export function songBar(mood, n) {
  const m = MOODS[mood];
  if (!m) return null;
  const bar = ((n % BARS) + BARS) % BARS, chord = m.chords[bar], steps = Array.from({ length: STEPS }, () => []);
  let at = 0;
  for (const [midi, len] of parseBar(m.lead[bar])) {
    if (midi !== null) steps[at].push({ v: 'lead', midi, len, vel: at % 8 === 0 ? 0.9 : 0.75 });
    at += len;
  }
  const [root, fifth] = bassNotes(chord), hits = [...m.bass].map((c, i) => (c === '.' ? -1 : i)).filter((i) => i >= 0);
  hits.forEach((i, k) => steps[i].push({ v: 'bass', midi: +m.bass[i] ? fifth : root, len: (hits[k + 1] ?? STEPS) - i, vel: i % 8 ? 0.55 : 0.65 }));
  const tones = arpNotes(chord);
  for (let i = 0, k = 0; i < STEPS; i += m.arp.every, k++) steps[i].push({ v: 'harm', midi: tones[m.arp.pat[k % m.arp.pat.length]], len: m.arp.every, vel: 0.4 });
  const d = m.drums;
  for (const i of [0, 8]) steps[i].push({ v: 'kick', vel: d.kick });
  for (const i of [4, 12]) steps[i].push({ v: d.backbeat, vel: d.back });
  return { mood, section: SECTIONS[bar >> 2], bar, chord, steps };
}
