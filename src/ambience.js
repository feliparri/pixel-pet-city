// The town's ambient sound: birds by day, crickets at night, water by the fountain and the ponds, the farm's animals, the rain's bed and the thunder after a lightning flash.
// Three parts: the pure sample makers (Int16 at SFX_RATE, deterministic from a seed: chirp, cricket, cluck, moo, baa, thunder, the rain and water beds), `waterNear` (how close a
// tile is to water), and `createAmbience`, the scheduler. The scheduler is told what the town is like each frame (area, night, weather, the pet's tile, the clock) and asks the
// player's ambient channel (src/sound.js: its own gain, never the one voice) for a sound now and then, at random, sparse and low. Everything is silent while muted, indoors,
// before the first gesture (the context is not running) or while the town is suspended.
import { SFX_RATE } from './sound.js';
import { strikesIn } from './weather.js';
import { mulberry32 } from './life.js';
import { FARM, tileAt } from './map.js';

const TAU = Math.PI * 2;
const PCM = 32767;

// ---- sample makers --------------------------------------------------------------------------------------------------------------------------
const make = (ms) => new Float32Array(Math.max(1, Math.round(ms * SFX_RATE / 1000)));
export const toPcm = (f, peak = 0.9) => {
  let m = 0;
  for (let i = 0; i < f.length; i++) m = Math.max(m, Math.abs(f[i]));
  const k = m > 0 ? (peak * PCM) / m : 0, out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.round(f[i] * k);
  return out;
};
/** Adds a tone that glides f0 -> f1 over `ms` at `startMs` into `f`, with a smooth (sine squared) envelope, `vib` Hz of vibrato of depth `depth` (a fraction of the pitch). */
export function tone(f, startMs, ms, f0, f1, amp = 1, { vib = 0, depth = 0, harm = 0 } = {}) {
  const s0 = Math.round(startMs * SFX_RATE / 1000), n = Math.round(ms * SFX_RATE / 1000);
  let ph = 0;
  for (let i = 0; i < n && s0 + i < f.length; i++) {
    const p = i / n, fr = (f0 + (f1 - f0) * p) * (1 + (vib ? depth * Math.sin(TAU * vib * i / SFX_RATE) : 0));
    ph += TAU * fr / SFX_RATE;
    const env = Math.sin(Math.PI * p) ** 2;
    f[s0 + i] += amp * env * (Math.sin(ph) + harm * Math.sin(2 * ph));
  }
}

/** A bird's call: `variant` picks one of four little songs (2 to 5 rising or falling chirps). */
export function chirp(variant = 0) {
  const v = Math.abs(variant) % 4, f = make(420);
  if (v === 0) { tone(f, 0, 70, 3200, 4200); tone(f, 110, 70, 3300, 4400); tone(f, 220, 90, 3000, 4600); }
  else if (v === 1) { tone(f, 0, 110, 4400, 2900); tone(f, 150, 60, 3000, 3000); tone(f, 230, 110, 4200, 2800); }
  else if (v === 2) { for (let i = 0; i < 5; i++) tone(f, i * 70, 45, 3600 + i * 120, 3900 + i * 120, 0.9 - i * 0.08); }
  else { tone(f, 0, 160, 2600, 3800, 1, { vib: 22, depth: 0.04 }); tone(f, 190, 120, 3800, 3000); }
  return toPcm(f, 0.8);
}
/** A cricket: three or four little trills of a high tone, pulsed fast. */
export function cricket(variant = 0) {
  const trills = 3 + (Math.abs(variant) % 2), f = make(trills * 150 + 40);
  for (let t = 0; t < trills; t++) for (let k = 0; k < 4; k++) tone(f, t * 150 + k * 28, 22, 4300, 4200);
  return toPcm(f, 0.55);
}
/** A hen, a cow and a sheep, rough but recognisable: `cluck` (a short gruff burst or two), `moo` (a low glide with a rough edge), `baa` (a nasal bleat with a fast wobble). */
export function cluck() { const f = make(360); tone(f, 0, 90, 520, 380, 1, { harm: 0.6 }); tone(f, 130, 70, 560, 420, 0.8, { harm: 0.6 }); tone(f, 230, 100, 500, 360, 0.9, { harm: 0.6 }); return toPcm(f, 0.7); }
export function moo() { const f = make(1500); tone(f, 0, 1500, 150, 120, 1, { harm: 0.7, vib: 5, depth: 0.03 }); tone(f, 0, 1500, 300, 240, 0.35); return toPcm(f, 0.7); }
export function baa() { const f = make(750); tone(f, 0, 750, 360, 300, 1, { harm: 0.9, vib: 28, depth: 0.07 }); return toPcm(f, 0.6); }
export const ANIMAL_SOUNDS = { hen: cluck, cow: moo, sheep: baa };

/** A one-pole lowpass over a Float32Array in place (alpha 0..1: the smaller, the duller). */
export function lowpass(a, alpha) { let y = 0; for (let i = 0; i < a.length; i++) { y += alpha * (a[i] - y); a[i] = y; } return a; }
/** Thunder: a crack and a long low rumble (noise through a lowpass, a slow wobble) that dies away; `seed` makes each one a little different. */
export function thunder(seed = 1) {
  const r = mulberry32(seed >>> 0), ms = 2600 + Math.floor(r() * 1200), f = make(ms), n = f.length;
  const rumble = make(ms), crack = make(ms);
  for (let i = 0; i < n; i++) { rumble[i] = r() * 2 - 1; crack[i] = r() * 2 - 1; }
  lowpass(rumble, 0.045); lowpass(rumble, 0.09); lowpass(crack, 0.35);
  const wob = 2 + r() * 2;
  for (let i = 0; i < n; i++) {
    const t = i / SFX_RATE, att = Math.min(1, i / 400), dec = Math.exp(-t * 1.1) * (0.75 + 0.25 * Math.sin(TAU * wob * t));
    f[i] = att * (rumble[i] * 9 * dec + crack[i] * 0.5 * Math.exp(-t * 14));
  }
  return toPcm(f, 0.9);
}
/** A seamless loop: the last `fade` samples are mixed into the start (equal power), so the end joins the beginning with no jump and no dip in loudness. */
function loopable(a, fade) {
  const n = a.length - fade;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i];
  for (let i = 0; i < fade; i++) { const k = (i / fade) * Math.PI / 2; out[i] = out[i] * Math.sin(k) + a[n + i] * Math.cos(k); }      // equal power: uncorrelated noise faded linearly would dip 3 dB at the join, a pulse at every loop
  return out;
}
/** A gull: a few drawn-out mewing cries that glide down in pitch (`variant` 0..2 picks how many and how long). */
export function gull(variant = 0) {
  const v = Math.abs(variant) % 3, f = make(900 + v * 250);
  const cries = 2 + v;
  for (let k = 0; k < cries; k++) tone(f, k * (240 + v * 40), 200 + v * 30, 1900 - k * 80, 1250 - k * 60, 1, { harm: 0.45, vib: 9, depth: 0.025 });
  tone(f, 0, 160, 3000, 2400, 0.12);
  return toPcm(f, 0.6);
}

/**
 * The sea's bed: slow waves breaking and drawing back. Two layers of different lengths (9.6 s and 7.3 s, each with its own swell of exactly one cycle per loop, so the join is
 * seamless): dull noise that rises and falls like a swell, and a brighter hiss of foam that follows the crest a little later.
 */
export function seaBed() {
  const layer = (seed, secs, dull, foam, lag) => {
    const r = mulberry32(seed), fade = 4000, n = Math.round(secs * SFX_RATE), a = new Float32Array(n + fade + 500), b = new Float32Array(n + fade + 500);
    for (let i = 0; i < a.length; i++) { a[i] = r() * 2 - 1; b[i] = r() * 2 - 1; }
    lowpass(a, dull); lowpass(a, dull * 2.2);
    lowpass(b, 0.4);
    for (let i = 0; i < a.length; i++) {
      const ph = (i / n) * TAU, swell = 0.5 + 0.5 * Math.sin(ph), crest = 0.5 + 0.5 * Math.sin(ph - lag);
      a[i] = a[i] * 8 * (0.25 + 0.75 * swell * swell) + b[i] * foam * crest ** 3;
    }
    return toPcm(loopable(a.subarray(500), fade), 0.7);          // (the first 500 samples, while the filters warm up, are left out)
  };
  return [layer(0x5ea1, 9.6, 0.05, 0.9, 0.9), layer(0x1d77, 7.3, 0.06, 0.6, 1.4)];
}

/** One layer of hiss: `secs` seconds of noise with its lows taken out, looped with a long equal-power join (a quarter second). */
function hiss(seed, secs, dullAlpha, mul) {
  const r = mulberry32(seed), fade = 4000, n = Math.round(secs * SFX_RATE) + fade, a = new Float32Array(n), dull = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = dull[i] = r() * 2 - 1;
  lowpass(dull, dullAlpha);
  for (let i = 0; i < n; i++) a[i] = a[i] * 0.55 - dull[i] * mul;
  return toPcm(loopable(a.subarray(500), fade), 0.8);                 // the first 500 samples (the filter warming up) are left out
}
/** The rain's bed: two layers of hiss of different lengths (7.3 s and 9.1 s, so the sum repeats only every ~66 s) that the player loops on separate sources and drifts in volume. */
export function rainBed() { return [hiss(0x7a1b, 7.3, 0.12, 1.3), hiss(0x52c9, 9.1, 0.2, 1.1)]; }
/** The water's bed: a dull layer that swells and ebbs (5.3 s) and a second one (4.1 s) with a few small bubbles. */
export function waterBed() {
  const swell = (seed, secs) => {
    const r = mulberry32(seed), fade = 4000, n = Math.round(secs * SFX_RATE) + fade, a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = r() * 2 - 1;
    lowpass(a, 0.07); lowpass(a, 0.2);
    return loopable(a.subarray(500), fade);
  };
  const one = swell(0x3e11, 5.3), two = swell(0x91c3, 4.1), r = mulberry32(0x2f17);
  for (let b = 0; b < 6; b++) tone(two, Math.floor(r() * (two.length / SFX_RATE * 1000 - 100)), 40 + r() * 40, 700 + r() * 500, 1100 + r() * 700, 0.05 + r() * 0.05);
  return [toPcm(one, 0.7), toPcm(two, 0.7)];
}

// ---- where the water is ---------------------------------------------------------------------------------------------------------------------
/** The tile rectangles of water, per area ({ x, y, w, h }, tiles): the plaza's fountain and the park's pond in the town, the pond in the farm. */
export const WATER = {
  town: [{ x: 22, y: 20, w: 4, h: 3 }, { x: 5, y: 33, w: 7, h: 6 }],
  farm: [{ x: FARM.pond.x, y: FARM.pond.y, w: FARM.pond.w, h: FARM.pond.h }],
};
export const WATER_REACH = 6;                    // tiles from the water's edge where it stops being heard
/** How near the water is at a tile: 1 at its edge, 0 from WATER_REACH tiles away (0 in an area without water). */
export function waterNear(area, x, y) {
  let best = Infinity;
  for (const r of WATER[area] || []) {
    const dx = Math.max(r.x - x, 0, x - (r.x + r.w - 1)), dy = Math.max(r.y - y, 0, y - (r.y + r.h - 1));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best >= WATER_REACH ? 0 : 1 - best / WATER_REACH;
}

/** How loud the sea is at a tile of an area: full over the water and the shore, fading to a murmur at the far end of the sand (0 away from the beach). */
export function seaLevel(area, x) {
  if (area !== 'beach') return 0;
  const shore = 24, end = 47;
  return x <= shore ? 1 : 1 - 0.6 * Math.min(1, (x - shore) / (end - shore));
}

// ---- the scheduler --------------------------------------------------------------------------------------------------------------------------
/** How loud each thing is (0..1 of the ambient channel's gain): low on purpose, the music and the effects stay in front. */
export const GAIN = { chirp: 0.35, cricket: 0.22, animal: 0.3, thunder: 0.8, rain: 0.28, water: 0.22, sea: 0.26, gull: 0.3 };
/** The waits between two sounds, ms [min, max]: sparse and random. */
export const EVERY = { bird: [6000, 16000], farmBird: [5000, 12000], cricket: [3500, 9000], animal: [10000, 26000], gull: [6000, 15000] };

/**
 * `sound`: the player (ambient, bed, stopBeds, running, isMuted); `rand`: a 0..1 source (Math.random; tests give a fixed one). step(ms, info) once a frame with
 * info = { area, outdoor, night 0..1, weather (src/weather.js levels, with .skew), x, y (the pet's tile), utcMs }; silence() stops the beds and forgets what was planned.
 */
export function createAmbience({ sound, rand = Math.random }) {
  const next = { bird: null, cricket: null, animal: null, gull: null };
  let strikeFrom = null, thunders = [];
  const wait = ([a, b]) => a + rand() * (b - a);
  const play = (samples, gain) => { try { return !!sound.ambient(samples, gain); } catch { return false; } };
  const bed = (name, make, level) => { try { sound.bed(name, make, level); } catch { /* optional */ } };
  function silence() { try { sound.stopBeds(); } catch { /* optional */ } next.bird = next.cricket = next.animal = null; strikeFrom = null; thunders = []; }
  return {
    silence,
    step(ms, info) {
      if (!sound.running() || sound.isMuted()) { if (strikeFrom !== null || thunders.length) { strikeFrom = null; thunders = []; } return; }
      const w = info.weather || { rain: 0, storm: 0, snow: 0 }, out = info.outdoor;
      bed('rain', rainBed, out ? Math.min(1, w.rain) * GAIN.rain : 0);
      bed('sea', seaBed, out ? seaLevel(info.area, info.x) * GAIN.sea * (1 - 0.3 * Math.min(1, w.rain)) : 0);
      bed('water', waterBed, out ? waterNear(info.area, info.x, info.y) * GAIN.water * (1 - 0.5 * Math.min(1, w.rain)) : 0);
      for (const k of Object.keys(next)) if (next[k] !== null) next[k] = Math.max(0, next[k] - ms);
      if (!out) { strikeFrom = null; thunders = []; return; }
      /** True when the timer `k` ran out (and it is set again to a random wait); the first wait is random too, so nothing sounds the moment the town opens. */
      const due = (k, range, scale = 1) => {
        if (next[k] === null) { next[k] = wait(range) * scale; return false; }
        if (next[k] > 0) return false;
        next[k] = wait(range) * scale; return true;
      };
      const calm = w.rain < 0.25 && w.storm < 0.2 && w.snow < 0.5;
      const beach = info.area === 'beach';                                  // on the beach the sea's own birds, the gulls, take the place of the songbirds and the crickets
      if (!beach && info.night < 0.4 && calm && due('bird', info.area === 'farm' ? EVERY.farmBird : EVERY.bird)) play(chirp(Math.floor(rand() * 4)), GAIN.chirp);
      if (beach && info.night < 0.5 && calm && due('gull', EVERY.gull)) play(gull(Math.floor(rand() * 3)), GAIN.gull);
      if (!beach && info.night > 0.6 && w.rain < 0.3 && w.snow < 0.5 && due('cricket', EVERY.cricket)) play(cricket(Math.floor(rand() * 2)), GAIN.cricket);
      if (info.area === 'farm' && w.rain < 0.6 && due('animal', EVERY.animal, info.night > 0.5 ? 2 : 1)) {
        const kinds = Object.keys(ANIMAL_SOUNDS);
        play(ANIMAL_SOUNDS[kinds[Math.floor(rand() * kinds.length)]](), GAIN.animal);
      }
      // thunder: the strikes of the clock since the last frame (a long gap, a hidden tab, is not replayed); each rumbles after its own delay, once the flash has been seen
      const now = info.utcMs;
      if (Number.isFinite(now)) {
        if (strikeFrom !== null && now - strikeFrom < 2000) for (const s of strikesIn(strikeFrom, now, w.storm)) thunders.push({ due: s.at + s.delay, seed: Math.floor(s.at) });
        strikeFrom = now;
        if (thunders.length) {
          const due = thunders.filter((t) => t.due <= now);
          if (due.length) { thunders = thunders.filter((t) => t.due > now); for (const t of due.slice(0, 2)) play(thunder(t.seed), GAIN.thunder); }
        }
      }
    },
  };
}
