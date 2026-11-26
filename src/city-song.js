// The town's tune as pure data: no AudioContext, no clock. `songBar(mood, n)` gives bar number `n` of a mood as 16 steps of note events, the same way every time, so the
// scheduler (src/city-music.js) only has to turn events into sound and the tests can read the music. A song is 40 bars: intro, A, B, A', bridge, B'. The melody's rhythm is the
// song's identity (the same in every cycle), its pitches change with the section and with the cycle (4 melody variants), and the arpeggio has 3 styles, so the exact same bars
// only come back after 12 cycles (more than a quarter of an hour in any mood). Chords are diatonic triads on scale degrees, so every mood just names a scale and a progression.
// Events: { v: voice, midi, len (steps), vel (0..1) } for lead / harm / bass, and { v: 'kick'|'snare'|'hat', vel } for the noise channel.

export const STEPS = 16;                                       // sixteenth notes per 4/4 bar
export const LAYOUT = [['intro', 4], ['A', 8], ['B', 8], ['A2', 8], ['bridge', 4], ['B2', 8]];
export const SONG_BARS = LAYOUT.reduce((a, [, n]) => a + n, 0);
export const VARIANTS = 4;                                     // melody variants; the arpeggio styles (3) run beside them
export const ARP_STYLES = 3;

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], MIXO = [0, 2, 4, 5, 7, 9, 10];
// Lead rhythm templates by density ('x' starts a note); the bar position picks one, so a mood's rhythm is the same in every cycle.
const R = {
  busy: ['x.xxx.x.x.xxx.x.', 'x.x.xxx.x.x.x.xx', 'xx.x.x.xx.x.x.x.', 'x.x.x.xxx...x.x.'],
  mid: ['x...x.x.x...x.x.', 'x.x...x.x.x...x.', 'x..x..x.x...x...', 'x.x.x...x...x.x.'],
  long: ['x.......x.x.x...', 'x...x.......x.x.', 'x.....x.x.......', 'x.......x.......'],
  sparse: ['x.......x.......', 'x.....x.....x...', '........x.....x.', 'x...........x...'],
};
/**
 * The moods. `root` (MIDI) and `scale` set the key; `bpm`, `swing` (the off-sixteenths come late by this share of a step), `duty` (lead pulse width), `level` (the mood's share of
 * the music's volume). `progs` are 4-chord progressions in scale degrees per section kind; `lead` the rhythm family and the rest chance; `bass` and `drums` 16-char patterns
 * (bass: 0 root, 1 fifth, 2 octave); `arp` the harmony voice: a note every `every` steps.
 */
export const MOODS = {
  day: {
    root: 60, scale: MAJOR, bpm: 116, swing: 0.12, duty: 0.25, level: 1, leadBase: 7, leadRest: 0.08, rhythm: R.busy, maxLen: 3,
    progs: { intro: [0, 4, 0, 4], A: [0, 4, 5, 3], B: [3, 4, 2, 5], bridge: [5, 3, 0, 4], B2: [3, 4, 0, 4] },
    bass: '0.0.1.2.0.0.1.2.', arp: { every: 2, vel: 0.7 },
    drums: { kick: 'x.....x.x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
  },
  night: {
    root: 57, scale: MINOR, bpm: 76, swing: 0.08, duty: 0.5, level: 0.8, leadBase: 7, leadRest: 0.2, rhythm: R.long, maxLen: 6,
    progs: { intro: [0, 5, 0, 5], A: [0, 5, 2, 6], B: [3, 5, 0, 4], bridge: [5, 6, 0, 0], B2: [3, 5, 6, 0] },
    bass: '0.......1.......', arp: { every: 4, vel: 0.6 },
    drums: { kick: 'x.......x.......', snare: '........x.......', hat: '..x...x...x...x.' },
  },
  rain: {
    root: 55, scale: MAJOR, bpm: 64, swing: 0, duty: 0.5, level: 0.7, leadBase: 7, leadRest: 0.3, rhythm: R.sparse, maxLen: 8,
    progs: { intro: [0, 3, 0, 3], A: [0, 5, 3, 4], B: [3, 0, 5, 4], bridge: [5, 3, 5, 4], B2: [0, 3, 5, 0] },
    bass: '0...............', arp: { every: 4, vel: 0.5, skip: 0.35 },
    drums: { kick: '................', snare: '................', hat: '....x.......x...' },
  },
  beach: {
    root: 62, scale: MIXO, bpm: 108, swing: 0.2, duty: 0.25, level: 0.95, leadBase: 7, leadRest: 0.1, rhythm: R.mid, maxLen: 3,
    progs: { intro: [0, 6, 0, 6], A: [0, 6, 3, 0], B: [3, 0, 6, 0], bridge: [5, 3, 6, 0], B2: [3, 6, 0, 0] },
    bass: '0..1..0.0..1..2.', arp: { every: 2, vel: 0.6, skip: 0.2 },
    drums: { kick: 'x.....x...x.....', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.xx' },
  },
  farm: {
    root: 55, scale: MAJOR, bpm: 104, swing: 0.15, duty: 0.5, level: 0.95, leadBase: 7, leadRest: 0.1, rhythm: R.mid, maxLen: 4,
    progs: { intro: [0, 4, 0, 4], A: [0, 3, 0, 4], B: [3, 0, 4, 0], bridge: [5, 3, 4, 4], B2: [0, 3, 4, 0] },
    bass: '0...1...0...1...', arp: { every: 4, vel: 0.65, offbeat: true },
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.' },
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
/** The note of scale degree `d` (any integer; 7 is the octave) in a mood. */
export const degreeMidi = (m, d) => m.root + m.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

// A small deterministic generator (FNV-1a hash into mulberry32): the same words, the same numbers, on every machine.
function rng(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SECTION_VEL = { intro: 0.65, A: 0.85, B: 1, A2: 0.9, bridge: 0.6, B2: 1 };

/** Where bar `n` of the song is: its section, the bar in it, the cycle and the chord (a scale degree). */
export function locate(mood, n) {
  const m = MOODS[mood], cycle = Math.floor(n / SONG_BARS);
  let pos = n % SONG_BARS, section = 'A', len = 8;
  for (const [name, l] of LAYOUT) { if (pos < l) { section = name; len = l; break; } pos -= l; }
  const kind = section === 'intro' && cycle > 0 ? 'A' : section;                   // after the first time the intro bars carry the tune
  const prog = m.progs[kind === 'A2' ? 'A' : kind];
  return { cycle, section, kind, bar: pos, len, chord: prog[pos % 4], family: kind === 'A2' ? 'A' : kind };
}

function leadBar(m, where, mood, vel) {
  const { kind, family, bar, len, chord, cycle } = where;
  if (kind === 'intro') return [];
  const pat = m.rhythm[rng(mood, family, bar % 4, 'rhythm')() * m.rhythm.length | 0];
  const r = rng(mood, kind, Math.floor(bar / 4), bar % 4, cycle % VARIANTS, 'pitch');
  const tones = [chord, chord + 2, chord + 4], onsets = [...pat].map((c, i) => (c === 'x' ? i : -1)).filter((i) => i >= 0);
  const lo = m.leadBase - 2, hi = m.leadBase + (kind === 'B' || kind === 'B2' ? 8 : 6), rest = kind === 'bridge' ? m.leadRest + 0.25 : m.leadRest;
  let deg = m.leadBase + (tones[(r() * 3) | 0] % 7);                                 // start on a chord tone in the lead's octave
  const out = [];
  onsets.forEach((s, k) => {
    const last = bar === len - 1 && k === onsets.length - 1;
    const walk = [-2, -1, -1, 0, 1, 1, 2][(r() * 7) | 0];
    deg = Math.min(hi, Math.max(lo, deg + walk));
    if (s % 8 === 0 || last) {                                                       // strong beats and the cadence land on the chord (the tonic to close a section)
      const goal = (last ? [0, 7, 14] : tones.flatMap((d) => [d, d + 7, d - 7])).filter((d) => d >= lo && d <= hi);
      if (goal.length) deg = goal.reduce((best, d) => (Math.abs(d - deg) < Math.abs(best - deg) ? d : best));
    }
    if (!last && s % 8 !== 0 && r() < rest) return;
    const next = onsets[k + 1] ?? STEPS;
    out.push({ at: s, ev: { v: 'lead', midi: degreeMidi(m, deg), len: Math.max(1, Math.min(next - s, m.maxLen)), vel: vel * (s % 8 === 0 ? 1 : 0.8) } });
  });
  return out;
}

/**
 * Bar `n` of `mood`: { section, cycle, chord, steps } where steps is 16 lists of events. Pure and deterministic. The intro has no lead or snare; the bridge holds the bass long
 * and drops the kick and snare; the last bar of the B sections ends with a snare fill; the first bar of a cycle's first intro starts the music alone.
 */
export function songBar(mood, n) {
  const m = MOODS[mood];
  if (!m) return null;
  const where = locate(mood, n), { kind, chord, bar, len, cycle } = where, vel = SECTION_VEL[kind];
  const steps = Array.from({ length: STEPS }, () => []);
  for (const { at, ev } of leadBar(m, where, mood, vel)) steps[at].push(ev);
  // bass: chord root two octaves under the lead, the fifth and the octave from the pattern; the bridge holds the root for the whole bar
  let rootMidi = degreeMidi(m, chord) - 12;
  while (rootMidi > 52) rootMidi -= 12;                                              // the bass never climbs into the lead's range
  const fifth = rootMidi + degreeMidi(m, chord + 4) - degreeMidi(m, chord), tone = [rootMidi, fifth, rootMidi + 12];
  if (kind === 'bridge') steps[0].push({ v: 'bass', midi: rootMidi, len: STEPS, vel: 0.7 });
  else {
    const hits = [...m.bass].map((c, i) => (c === '.' ? -1 : i)).filter((i) => i >= 0);
    hits.forEach((i, k) => steps[i].push({ v: 'bass', midi: tone[+m.bass[i]], len: Math.min(4, (hits[k + 1] ?? STEPS) - i), vel: vel * (i % 8 ? 0.8 : 1) }));
  }
  // harmony: an arpeggio of the triad (3 styles by cycle); the farm strums the offbeats instead
  const ar = rng(mood, kind, bar, cycle % ARP_STYLES, 'arp'), chordTones = [degreeMidi(m, chord), degreeMidi(m, chord + 2), degreeMidi(m, chord + 4), degreeMidi(m, chord) + 12];
  const style = [[0, 1, 2, 1, 0, 1, 2, 1], [0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 3, 2, 1, 2, 1]][cycle % ARP_STYLES];
  for (let i = 0, k = 0; i < STEPS; i += m.arp.every, k++) {
    if (m.arp.offbeat && i % 8 === 0) continue;                                       // the farm strums on the 2nd and 4th beats only
    if (m.arp.skip && ar() < m.arp.skip) continue;
    steps[i].push({ v: 'harm', midi: chordTones[style[k % 8]] + 12, len: Math.max(1, m.arp.every - 1), vel: vel * m.arp.vel });
  }
  // noise channel
  const d = m.drums, fill = (kind === 'B' || kind === 'B2' || kind === 'A2') && bar === len - 1, drumless = kind === 'bridge';
  [...d.hat].forEach((c, i) => { if (c === 'x') steps[i].push({ v: 'hat', vel: vel * (i % 4 === 0 ? 0.8 : 0.5) }); });
  if (!drumless) {
    [...d.kick].forEach((c, i) => { if (c === 'x') steps[i].push({ v: 'kick', vel: vel * (kind === 'intro' ? 0.7 : 1) }); });
    if (kind !== 'intro') [...d.snare].forEach((c, i) => { if (c === 'x') steps[i].push({ v: 'snare', vel }); });
    if (fill && d.snare.includes('x')) for (const i of [12, 13, 14, 15]) steps[i].push({ v: 'snare', vel: vel * (0.5 + (i - 12) * 0.15) });
  }
  return { mood, section: where.section, kind, cycle, bar, chord, steps };
}
