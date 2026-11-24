// The pet's own small sounds: footsteps (by the ground under it, wet in rain, crunchy on snow), the hop and the landing, and a few soft cues for what it does (a door, a villager's
// line, a prompt confirmed, something picked up). They go through the player's ambient channel (src/sound.js), never its one voice, so they do not cut the music nor an effect,
// and they are silent while muted or before the first gesture. Other players' steps and hops are heard only when near, quieter and fading with the distance.
// Everything is pure sample making (deterministic per variant) plus a small controller; `groundOf` reads the map. Taps, the shop, the gifts and the menus already have their
// effects (src/main.js, src/town.js): nothing here doubles them.
import { tileAt, TILES, getArea } from './map.js';
import { mulberry32 } from './life.js';
import { renderNotes, note, W, SFX_RATE } from './sound.js';
import { toPcm, tone, lowpass } from './ambience.js';

export const GROUNDS = ['grass', 'path', 'stone', 'wood', 'sand', 'snow', 'wet'];
const BY_NAME = {
  grass: 'grass', flowers: 'grass', bush: 'grass', pitch: 'grass', furrow: 'grass', carrots: 'grass', lettuce: 'grass', pumpkins: 'grass', wheat: 'grass',
  path: 'path', mat: 'path', gate: 'path', track: 'path', hurdle: 'path', hay: 'path', finish: 'path', spot: 'path',
  plaza: 'stone', floor: 'wood', rug: 'wood', door: 'wood', exit: 'wood', puddle: 'wet', sand: 'sand', dock: 'wood', bridge: 'wood', shore: 'sand', towel: 'sand', boardwalk: 'wood',
};
/** The ground under tile (x, y) of an area, given the weather's amounts (`wx`: rain, snow 0..1, or null): outdoors, rain makes it wet and snow covers grass, paths and paving. */
export function groundOf(area, x, y, wx = null) {
  const t = TILES[tileAt(x, y, area)], g = (t && BY_NAME[t.name]) || 'grass';
  if (g === 'wet' || !wx || !getArea(area).outdoor) return g;
  if (wx.snow > 0.3 && (g === 'grass' || g === 'path' || g === 'stone')) return 'snow';
  if (wx.rain > 0.3 && g !== 'wood') return 'wet';
  return g;
}

// ---- samples --------------------------------------------------------------------------------------------------------------------------------
const buf = (ms) => new Float32Array(Math.round(ms * SFX_RATE / 1000));
/** Noise grains: `n` short bursts of low-passed noise (alpha = how bright) spread over `ms`, each with a quick decay. */
function grains(f, r, n, ms, alpha, amp = 1) {
  for (let k = 0; k < n; k++) {
    const start = Math.floor((k / n) * f.length * 0.8 + r() * 120), len = Math.min(f.length - start, Math.round((ms / n) * 1.3 * SFX_RATE / 1000)), g = new Float32Array(len);
    for (let i = 0; i < len; i++) g[i] = r() * 2 - 1;
    lowpass(g, alpha);
    for (let i = 0; i < len; i++) f[start + i] += g[i] * amp * Math.exp(-i / (len * 0.35)) * Math.min(1, i / 30);
  }
}
const FOOT = {
  grass: (f, r, v) => grains(f, r, 2, 70, 0.22 + v * 0.03, 1),
  path: (f, r, v) => grains(f, r, 3, 60, 0.5 + v * 0.03, 0.9),
  stone: (f, r, v) => { grains(f, r, 1, 30, 0.7, 0.8); tone(f, 0, 32, 190 - v * 12, 120, 0.9); },
  wood: (f, r, v) => { tone(f, 0, 34, 160 + v * 10, 100, 1); grains(f, r, 1, 25, 0.6, 0.35); },
  sand: (f, r, v) => grains(f, r, 2, 100, 0.16 + v * 0.02, 0.9),
  snow: (f, r, v) => grains(f, r, 4, 90, 0.4 + v * 0.03, 0.8),
  wet: (f, r, v) => { grains(f, r, 2, 90, 0.55 + v * 0.03, 1); tone(f, 4, 30, 900 + v * 80, 500, 0.12); },
};
export const STEP_VARIANTS = 4;
export const STEP_MS = 45;                                       // a step lasts this long (was 110 ms of buffer): a soft tap, not a hiss
/** The dullness of each ground: two one-pole lowpasses of this alpha (cutoff about alpha * 2500 Hz at the 16 kHz rate: 400 to 700 Hz), so no hiss is left, only a soft thud. Before: one pole of 0.16 to 0.7, up to 1.8 kHz. */
const DULL = { grass: 0.16, sand: 0.14, path: 0.22, snow: 0.2, wet: 0.24, stone: 0.26, wood: 0.28 };
const cache = new Map();
/** A footstep on a ground: one of STEP_VARIANTS slightly different ones (pitch and grain), Int16 at SFX_RATE, deterministic. */
export function stepSamples(ground, variant = 0) {
  const g = FOOT[ground] ? ground : 'grass', v = Math.abs(variant) % STEP_VARIANTS, key = `${g}:${v}`;
  let s = cache.get(key);
  if (!s) {
    const f = buf(STEP_MS), r = mulberry32(0x57e9 + v * 977 + GROUNDS.indexOf(g) * 31);
    FOOT[g](f, r, v);
    lowpass(f, DULL[g]); lowpass(f, DULL[g]);
    for (let i = 0; i < f.length; i++) f[i] *= Math.exp(-i / (f.length * 0.3)) * Math.min(1, i / 24);          // a fast decay, and a short rise so there is no click
    cache.set(key, s = toPcm(f, 0.85));
  }
  return s;
}

/** The soft cues, as notes for the player's synth (rendered once): the hop, the landing, a villager's line, a door, a prompt confirmed, a pick-up and a small reward. */
export const CUES = {
  jump: [note(W.TRI, 330, 720, 70, 120)],
  land: [note(W.TRI, 240, 120, 60, 150), note(W.NOISE, 3000, 1200, 30, 50)],
  talk: [note(W.SQ25, 760, 760, 22, 90), note(W.REST, 0, 0, 30, 0), note(W.SQ25, 940, 940, 22, 90)],
  door: [note(W.NOISE, 4000, 2000, 25, 70), note(W.TRI, 330, 494, 70, 130), note(W.TRI, 494, 660, 90, 130)],
  confirm: [note(W.SQ50, 880, 880, 30, 110), note(W.SQ50, 1175, 1175, 50, 110)],
  pick: [note(W.SQ25, 1047, 1047, 40, 120), note(W.SQ25, 1319, 1319, 70, 120)],
  reward: [note(W.SQ25, 988, 988, 50, 130), note(W.SQ25, 1319, 1319, 150, 130)],
};
const GAIN = { step: 0.08, jump: 0.5, land: 0.55, talk: 0.5, door: 0.6, confirm: 0.5, pick: 0.55, reward: 0.6 };
export const HEAR_TILES = 9;                                     // another pet's steps are heard from this many tiles, fading to nothing
export const peerGain = (dist) => (dist >= HEAR_TILES ? 0 : 0.05 * (1 - dist / HEAR_TILES) ** 2);

/** `sound`: the player (ambient). step(area, x, y, run, wx) is the own pet's step; peerStep / peerJump(dist, area, x, y, wx) another's (only when near); cue(name) a soft interaction cue. */
export function createPetSounds({ sound, rand = Math.random }) {
  const rendered = new Map(), lastPeer = new Map();
  let ownN = 0;                                                   // every other step of the own pet sounds: a lighter rhythm
  const play = (samples, gain) => { try { return !!sound.ambient(samples, gain); } catch { return false; } };
  const cueSamples = (name) => { let s = rendered.get(name); if (!s) rendered.set(name, s = renderNotes(CUES[name], 2)); return s; };
  const variant = () => Math.floor(rand() * STEP_VARIANTS);
  return {
    step(area, x, y, run, wx) { if (ownN++ & 1) return false; return play(stepSamples(groundOf(area, x, y, wx), variant()), GAIN.step * (0.85 + 0.3 * rand()) * (run ? 1.15 : 1)); },
    /** `who` limits a pet to about one sounding step per 200 ms (a pet catching up takes many). */
    peerStep(who, dist, area, x, y, wx, now = Date.now()) {
      const g = peerGain(dist);
      if (g <= 0 || now - (lastPeer.get(who) || 0) < 200) return false;       // about one step in two of a pet at walking pace
      lastPeer.set(who, now);
      return play(stepSamples(groundOf(area, x, y, wx), variant()), g * (0.85 + 0.3 * rand()));
    },
    peerJump(dist) { const g = peerGain(dist); return g > 0 && play(cueSamples('jump'), g); },
    cue(name) { return !!CUES[name] && play(cueSamples(name), GAIN[name] ?? 0.5); },
    forget(who) { lastPeer.delete(who); },
  };
}
