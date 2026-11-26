// The town's 8-bit sound: a port of the board's synthesizer (pixel-pet common/sfx.c, integer only, deterministic) rendered into Web Audio buffers, so the
// town beeps like the pet does. Three layers:
//   1. the cue tables and the integer synth (pure: CUES, renderNotes, cueSamples; no browser needed, unit-tested);
//   2. the mute choice (createMuteStore: remembered in localStorage, every access guarded);
//   3. the player (createSound): an AudioContext made and resumed on the first user gesture (browsers refuse to start audio before one), cues rendered once to an
//      AudioBuffer and cached. The page-wide instance is `sound`; play / playNotes / setMuted / isMuted / unlock are also exported on their own.
// A note is { wave, f0, f1, ms, vol }: wave W.REST / SQ50 / SQ25 / SQ12 / TRI / NOISE, pitch sliding linearly f0 -> f1 (noise: its clock), vol 0..255. Any list of
// notes can be played (playNotes), which the arcade will use for its jingles and music.

export const SFX_RATE = 16000;                    // samples per second, as the board's (sfx.h SFX_RATE)
export const SFX_MAX_MS = 1000;                   // no built-in cue is longer
export const W = { REST: 0, SQ50: 1, SQ25: 2, SQ12: 3, TRI: 4, NOISE: 5 };
/** The peak of a full-volume note at each level: 0 off, 1 Bajo, 2 Medio, 3 Alto (sfx.c PEAK). */
export const PEAK = [0, 2600, 5800, 11500];
export const DEFAULT_LEVEL = 2;
export const AMBIENT_MAX = 6;                   // ambient one-shots sounding at once (a bird over a thunder over a footstep), no more
const ATTACK_SAMPLES = 48;                        // 3 ms
const LFSR_SEED = 0x4A3B;

/** Note names, Hz (equal temperament, rounded), as in sfx.c. */
export const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, DS5: 622, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, D6: 1175, E6: 1319, G6: 1568, C7: 2093 };

export const note = (wave, f0, f1, ms, vol) => ({ wave, f0, f1, ms, vol });
export const rest = (ms) => note(W.REST, 0, 0, ms, 0);

/** The cues, faithful to sfx.c (same notes, pitches, lengths and volumes). The first group is feedback, then the pet's calls, then the cable. */
export const CUES = {
  tap:     [note(W.SQ25, 1760, 1320, 16, 150)],
  eat:     [note(W.TRI, 700, 420, 70, 255), rest(40), note(W.TRI, 760, 460, 70, 255), rest(40), note(W.TRI, 700, 420, 70, 230)],
  happy:   [note(W.SQ25, N.C6, N.C6, 60, 170), note(W.SQ25, N.E6, N.E6, 60, 170), note(W.SQ25, N.G6, N.G6, 110, 170)],
  coin:    [note(W.SQ25, N.B5, N.B5, 60, 180), note(W.SQ25, N.E6, N.E6, 200, 180)],
  buy:     [note(W.SQ25, N.G5, N.G5, 50, 170), note(W.SQ25, N.C6, N.C6, 50, 170), note(W.SQ25, N.E6, N.E6, 50, 170), note(W.SQ25, N.G6, N.G6, 50, 170), note(W.SQ25, N.C7, N.C7, 160, 150)],
  win:     [note(W.SQ50, N.C5, N.C5, 90, 150), note(W.SQ50, N.E5, N.E5, 90, 150), note(W.SQ50, N.G5, N.G5, 90, 150), note(W.SQ50, N.C6, N.C6, 90, 150), rest(30), note(W.SQ50, N.G5, N.G5, 70, 150), note(W.SQ50, N.C6, N.C6, 250, 150)],
  lose:    [note(W.TRI, N.G4, N.G4, 170, 255), note(W.TRI, N.E4, N.E4, 170, 255), note(W.TRI, N.D4, N.C4, 300, 255)],
  shower:  [note(W.NOISE, 7000, 4000, 380, 110), note(W.TRI, 900, 1400, 50, 140), rest(30), note(W.TRI, 1000, 1600, 50, 140)],
  grow:    [note(W.SQ25, N.C5, N.C6, 280, 160), rest(30), note(W.SQ25, N.C6, N.C6, 70, 170), note(W.SQ25, N.G6, N.G6, 180, 170)],
  bounce:  [note(W.TRI, 300, 560, 26, 230), note(W.TRI, 560, 380, 54, 230)],
  bounce2: [note(W.TRI, 260, 460, 22, 150), note(W.TRI, 460, 320, 42, 150)],
  bounce3: [note(W.TRI, 230, 380, 18, 80), note(W.TRI, 380, 280, 32, 80)],
  hungry:  [note(W.TRI, N.A5, N.A5, 130, 210), note(W.TRI, N.F5, N.F5, 200, 210)],
  sick:    [note(W.TRI, N.E5, N.DS5, 220, 200), rest(60), note(W.TRI, N.D5, N.C5, 300, 200)],
  dirty:   [note(W.SQ12, N.A4, N.A4, 70, 140), rest(50), note(W.SQ12, N.A4, N.A4, 70, 140), rest(50), note(W.SQ12, N.F4, N.F4, 110, 140)],
  sleepy:  [note(W.TRI, N.G5, N.G5, 170, 200), note(W.TRI, N.E5, N.E5, 170, 200), note(W.TRI, N.C5, N.B4, 320, 200)],
  runaway: [note(W.TRI, N.C5, N.G5, 200, 210), rest(90), note(W.TRI, N.C5, N.A5, 240, 210)],
  ghost:   [note(W.TRI, N.E6, N.B5, 250, 170), note(W.TRI, N.B5, N.E6, 250, 170), note(W.TRI, N.E6, N.D6, 300, 140)],
  plug:    [note(W.SQ50, N.C5, N.C5, 60, 150), note(W.SQ50, N.G5, N.G5, 110, 150)],
  unplug:  [note(W.SQ50, N.G5, N.G5, 60, 150), note(W.SQ50, N.C5, N.C5, 110, 150)],
};
export const CUE_NAMES = Object.keys(CUES);
/** The level each cue plays at in the town unless the caller says otherwise: a tap is quiet, the rest Medio. */
export const CUE_LEVEL = { tap: 1 };

const samplesOfNote = (n) => n.ms * (SFX_RATE / 1000);
/** The whole length of a list of notes in samples (rests included). */
export const cueSamples = (notes) => notes.reduce((a, n) => a + samplesOfNote(n), 0);
export const cueMs = (notes) => cueSamples(notes) / (SFX_RATE / 1000);

const div = (a, b) => Math.trunc(a / b);          // C integer division (the operands stay far inside 2^53)

/** The envelope, 0..256: up over the attack, then down to 96 at 60 % of the note, then to 0 at its end (sfx.c envelope). */
export function envelope(pos, len) {
  const attack = Math.floor(len / 4) < ATTACK_SAMPLES ? Math.floor(len / 4) : ATTACK_SAMPLES, knee = Math.floor(len * 6 / 10);
  if (attack && pos < attack) return Math.floor(256 * pos / attack);
  if (pos < knee) return 256 - Math.floor(160 * (pos - attack) / (knee - attack || 1));
  return Math.floor(96 * (len - pos) / (len - knee || 1));
}

/**
 * Renders a list of notes to signed 16-bit samples at SFX_RATE and `level` (0 silent .. 3 Alto): the board's synth, sample for sample (the same integer steps,
 * the same LFSR seed), so the same cue always gives the same samples. Pitch slides linearly; phase is a 32 bit turn.
 */
export function renderNotes(notes, level = DEFAULT_LEVEL) {
  const lv = level < 0 ? 0 : level >= PEAK.length ? PEAK.length - 1 : Math.trunc(level);
  const out = new Int16Array(cueSamples(notes));
  let at = 0, phase = 0, lfsr = LFSR_SEED, noise = 1;
  for (const nt of notes) {
    const len = samplesOfNote(nt);
    for (let pos = 0; pos < len; pos++, at++) {
      if (nt.wave === W.REST) continue;
      const fLen = BigInt(nt.f0) * BigInt(len - pos) + BigInt(nt.f1) * BigInt(pos);        // f * len
      const step = Number(((fLen << 32n) / (BigInt(len) * BigInt(SFX_RATE))) & 0xFFFFFFFFn);
      const before = phase;
      phase = (phase + step) >>> 0;
      let osc = 0;
      switch (nt.wave) {
        case W.SQ50: osc = phase < 0x80000000 ? 32767 : -32767; break;
        case W.SQ25: osc = phase < 0x40000000 ? 32767 : -32767; break;
        case W.SQ12: osc = phase < 0x20000000 ? 32767 : -32767; break;
        case W.TRI: { const t = phase >>> 16; osc = t < 32768 ? t * 2 - 32767 : (65535 - t) * 2 - 32767; break; }
        case W.NOISE:
          if (phase < before) {                                                           // one clock of the noise
            const bit = (lfsr ^ (lfsr >> 1)) & 1;
            lfsr = ((lfsr >> 1) | (bit << 14)) & 0xFFFF;
            noise = (lfsr & 1) ? 1 : -1;
          }
          osc = noise * 32767;
          break;
        default: osc = 0;
      }
      let s = div(osc * envelope(pos, len), 256);
      s = div(s * nt.vol, 255);
      s = div(s * PEAK[lv], 32767);
      out[at] = s;
    }
  }
  return out;
}

/** The samples of a built-in cue, or null for an unknown name. */
export const renderCue = (name, level = CUE_LEVEL[name] ?? DEFAULT_LEVEL) => (Object.hasOwn(CUES, name) ? renderNotes(CUES[name], level) : null);

// ---- the mute choice -----------------------------------------------------------------------------------------------------------------------
export const MUTE_KEY = 'city.sound.muted';
/**
 * The remembered mute choice: { get(), set(on) } over a storage with getItem / setItem (localStorage, or a stand-in). Every storage call is guarded: it can be missing,
 * blocked or full (a private window), and then the choice lives in memory only. Sound is on until the player turns it off.
 */
export function createMuteStore(storage = null, key = MUTE_KEY) {
  let muted = false;
  try { muted = !!storage && storage.getItem(key) === '1'; } catch { muted = false; }
  return {
    get: () => muted,
    set(on) {
      muted = !!on;
      try { storage && storage.setItem(key, muted ? '1' : '0'); } catch { /* memory only */ }
    },
  };
}

// ---- the player ----------------------------------------------------------------------------------------------------------------------------
/** A cue a call cannot be replaced by a tap: the pet's calls matter most, feedback next, taps least (sfx.c priority). */
const ATTENTION = new Set(['hungry', 'sick', 'dirty', 'sleepy', 'runaway', 'ghost']);
export const priorityOf = (name) => (ATTENTION.has(name) ? 2 : name === 'tap' ? 0 : 1);

/**
 * The player. `ctxFactory()` makes an AudioContext (or returns null: no sound, everything below is a no-op); `storage` keeps the mute choice. One voice at a time, as
 * the board's: a new sound replaces the one playing unless that one matters more and is still going (then the new one is dropped).
 * play(name[, level]), playNotes(notes[, level[, priority]]), stop(), setMuted(on), isMuted(), unlock() (call it from a user gesture), toggle().
 */
export function createSound({ ctxFactory = () => null, storage = null } = {}) {
  const mute = createMuteStore(storage);
  const buffers = new Map();
  let ctx = null, voice = null, voiceEnd = 0, voicePriority = 0;
  const listeners = new Set();

  function ensure() {
    if (!ctx) { try { ctx = ctxFactory(); } catch { ctx = null; } }
    return ctx;
  }
  function unlock() {
    const c = ensure();
    try { if (c && c.state === 'suspended' && c.resume) c.resume(); } catch { /* the browser said no: the next gesture tries again */ }
    return !!c;
  }
  function start(samples, priority) {
    const c = ensure();
    if (!c || mute.get() || !samples || !samples.length) return false;
    if (c.state === 'suspended') unlock();
    if (voice && c.currentTime < voiceEnd && voicePriority > priority) return false;
    try {
      if (voice) { voice.onended = null; voice.stop(); }
    } catch { /* it ended already */ }
    const buf = c.createBuffer(1, samples.length, SFX_RATE), ch = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.onended = () => { if (voice === src) voice = null; };
    src.start();
    voice = src; voiceEnd = c.currentTime + samples.length / SFX_RATE; voicePriority = priority;
    return true;
  }
  // The ambient channel (the town's sound of place and weather): beside the one voice, with its own gain, so a bird, a thunder or the rain never cuts the music nor an effect.
  // It never starts before the first gesture (it needs a context that is running) and is silent while muted. Samples are Int16 at SFX_RATE, as the voice's.
  const beds = new Map(), bedSamples = new Map();
  let oneShots = 0;
  const running = () => !!ctx && ctx.state === 'running';
  const bufferOf = (samples) => {
    const buf = ctx.createBuffer(1, samples.length, SFX_RATE), ch = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
    return buf;
  };
  function ambient(samples, gain = 0.5) {
    if (!running() || mute.get() || !samples || !samples.length || oneShots >= AMBIENT_MAX) return false;
    try {
      const src = ctx.createBufferSource();
      src.buffer = bufferOf(samples);
      if (ctx.createGain) { const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(ctx.destination); } else src.connect(ctx.destination);
      oneShots++;
      src.onended = () => { oneShots = Math.max(0, oneShots - 1); };
      src.start();
      return true;
    } catch { return false; }
  }
  const fadeTo = (g, v, tc) => {                                // a smooth move of an AudioParam (time constant `tc` s); a stand-in without setTargetAtTime jumps
    if (g.setTargetAtTime) { g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(g.value, ctx.currentTime); g.setTargetAtTime(v, ctx.currentTime, tc); } else g.value = v;
  };
  function dropBed(name, fadeS) {
    const b = beds.get(name);
    if (!b) return;
    beds.delete(name);
    const end = (t) => { for (const l of b.layers) { try { l.src.stop(t); if (l.osc) l.osc.stop(t); } catch { /* ended */ } } };
    try {
      if (fadeS > 0 && b.gain.gain.setTargetAtTime) { fadeTo(b.gain.gain, 0, fadeS / 4); end(ctx.currentTime + fadeS + 0.1); } else end(0);
    } catch { /* ended */ }
  }
  /**
   * A looping bed (rain, water): `make()` gives its samples once, either one Int16Array or a list of them (layers of different lengths: each loops on its own source, so the sum
   * only repeats after the common multiple of their lengths, which no ear can follow). Each layer's volume drifts slowly (a very low oscillator on its gain, when the context has
   * one) so even a short loop is never the same twice. `level` 0..1 is the bed's volume: it moves with a smooth fade (never a jump), 0 ends the bed. False when it is not sounding.
   */
  function bed(name, make, level) {
    if (!(level > 0.005) || !running() || mute.get() || !ctx.createGain) { dropBed(name, 1.2); return false; }
    try {
      let b = beds.get(name);
      if (!b) {
        let s = bedSamples.get(name);
        if (!s) bedSamples.set(name, s = [].concat(make()));
        const gain = ctx.createGain(), layers = [];
        gain.gain.value = 0; gain.connect(ctx.destination);
        for (const samples of s) {
          const src = ctx.createBufferSource(), lg = ctx.createGain();
          src.buffer = bufferOf(samples); src.loop = true; lg.gain.value = 1;
          src.connect(lg); lg.connect(gain);
          let osc = null;
          if (ctx.createOscillator) {
            osc = ctx.createOscillator(); const depth = ctx.createGain();
            osc.frequency.value = 0.05 + Math.random() * 0.1; depth.gain.value = 0.18;
            osc.connect(depth); depth.connect(lg.gain); osc.start();
          }
          src.start(0, Math.random() * (samples.length / SFX_RATE));          // each start at its own point in the loop
          layers.push({ src, osc });
        }
        beds.set(name, b = { gain, layers, level: -1 });
      }
      if (Math.abs(b.level - level) > 0.01) { b.level = level; fadeTo(b.gain.gain, Math.min(1, level), 0.5); }
      return true;
    } catch { return false; }
  }
  function stopBeds() { for (const n of [...beds.keys()]) dropBed(n, 0); }
  return {
    unlock,
    /** Is the audio context running (a gesture has unlocked it)? The town's ambience waits for it, so it never creates a context on its own. */
    running,
    /** The audio context for a caller that makes its own synth (the town's music), or null while it is not running or the sound is muted. */
    audio: () => (running() && !mute.get() ? ctx : null),
    ambient, bed, stopBeds,
    isMuted: () => mute.get(),
    setMuted(on) { mute.set(on); if (mute.get()) { stopBeds(); if (voice) { try { voice.stop(); } catch { /* ended */ } voice = null; } } listeners.forEach((f) => f(mute.get())); },
    toggle() { this.setMuted(!mute.get()); return mute.get(); },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    /** Plays a built-in cue by name; false when muted, unknown, or dropped. */
    play(name, level = CUE_LEVEL[name] ?? DEFAULT_LEVEL) {
      if (!Object.hasOwn(CUES, name)) return false;
      const k = `${name}@${level}`;
      let s = buffers.get(k);
      if (!s) buffers.set(k, s = renderNotes(CUES[name], level));
      return start(s, priorityOf(name));
    },
    /** Plays a list of notes (a jingle, a tune): same synth, feedback priority (1) unless `priority` says 0 (background music: it gives way to any effect and never cuts one). */
    playNotes(notes, level = DEFAULT_LEVEL, priority = 1) { return start(renderNotes(notes, level), priority); },
    /** Stops whatever is playing now (the music of a screen that closes). */
    stop() { if (voice) { try { voice.onended = null; voice.stop(); } catch { /* ended */ } voice = null; } },
  };
}

const browserCtx = () => {
  const C = globalThis.AudioContext || globalThis.webkitAudioContext;
  return C ? new C() : null;
};
/** The page's player: sound on, mute remembered in this browser. In a page without Web Audio (or in Node) every call is a harmless no-op. */
export const sound = createSound({
  ctxFactory: browserCtx,
  storage: (() => { try { return globalThis.localStorage || null; } catch { return null; } })(),
});
export const play = (name, level) => sound.play(name, level);
export const playNotes = (notes, level) => sound.playNotes(notes, level);
export const setMuted = (on) => sound.setMuted(on);
export const isMuted = () => sound.isMuted();
export const unlock = () => sound.unlock();
