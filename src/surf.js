// Surfing, as pure rules. The waves come from the clock, like the weather: every WAVE.periodMs a wave sets off from the open sea and runs towards the shore at WAVE.speed tiles
// a second, so every player sees the same wave at the same moment (nothing goes over the net for it). A pet with a surfboard waiting at the break presses A while the wave
// is passing: inside the window it catches the wave and rides it (the wave carries it towards the shore at the wave's own speed, and it can steer along the wave); too early or
// too late it wipes out. A ride ends in the shallows. Everything here is plain data in, plain data out; src/town.js drives it and the renderers draw it.
import { isBreak } from './map.js';
import { needText } from './tools.js';

export const BOARD = 'surfboard';
export const WAVE = {
  periodMs: 9000,          // a new wave every 9 s
  speed: 7,                // tiles a second
  startX: -3,              // where the crest appears (west of the break, in the open sea)
  endX: 27,                // where it has died on the beach
};
export const CATCH_TILES = 1.6;       // the window: the crest within this many tiles of the pet, before or after (about 0.45 s)
export const PROMPT_AHEAD = 8;        // "Tomar la ola" shows from when the crest is this many tiles upstream of the pet ...
export const PROMPT_BEHIND = 3;       // ... until it is this many tiles past it
export const RIDE_MS = 125;           // a step of the ride: a little faster than the crest (8 tiles a second against 7), so the rider can steer without falling behind
export const MAX_LAG = 4;             // more tiles behind the crest than this and the rider falls off
export const WIPE_MS = 1500;          // how long a wipeout lasts
export const SAY = { early: 'Muy pronto', late: 'Muy tarde', lag: '¡Te caíste!', done: '¡Qué ola!' };

/** The wave of the clock at `utcMs` (ms): { id, crestX (tiles, fractional), age (ms) }, or null in the quiet between two waves. */
export function waveAt(utcMs) {
  if (!Number.isFinite(utcMs)) return null;
  const id = Math.floor(utcMs / WAVE.periodMs), age = utcMs - id * WAVE.periodMs, crestX = WAVE.startX + (WAVE.speed * age) / 1000;
  return crestX <= WAVE.endX ? { id, crestX, age } : null;
}

/** Where the crest is relative to a pet standing at column `x`: negative while it is still coming, positive once it has passed; null when there is no wave near enough to matter. */
export function crestOffset(utcMs, x) {
  const w = waveAt(utcMs);
  if (!w) return null;
  const d = w.crestX - x;
  return d >= -PROMPT_AHEAD && d <= PROMPT_BEHIND ? d : null;
}

/** What pressing at crest offset `d` does: 'early', 'catch' or 'late'. */
export const judgeCatch = (d) => (d < -CATCH_TILES ? 'early' : d > CATCH_TILES ? 'late' : 'catch');

/** The prompt at the break for a pet standing still at (x, y): the catch with a wave near, what is missing without a board, or null away from the break. */
export function surfAction(utcMs, x, y, tools) {
  if (!isBreak(x, y, 'beach')) return null;
  if (!Array.isArray(tools) || !tools.includes(BOARD)) return { id: 'hint', label: needText(BOARD), need: BOARD, target: 'break' };
  return crestOffset(utcMs, x) !== null ? { id: 'surf', label: 'Tomar la ola', target: 'wave' } : { id: 'hint', label: 'Espera la próxima ola', target: 'break' };
}

export const createSurf = () => ({ mode: 'idle', since: 0, wave: null, why: null });
/** The `surf` flag a pet sends with its position and the others draw: 0 nothing, 1 riding, 2 wiped out. */
export const surfFlag = (s) => (s.mode === 'ride' ? 1 : s.mode === 'wipe' ? 2 : 0);

/**
 * The A press at the break: starts the ride (returns 'catch'), a wipeout ('early' or 'late'), or does nothing ('none': not at the break, no board, no wave near, already surfing).
 * `t` is any monotonic clock in ms (the wipeout's timer), `utcMs` the clock the waves run on.
 */
export function press(s, { utcMs, x, y, tools, t }) {
  if (s.mode !== 'idle' || !isBreak(x, y, 'beach') || !Array.isArray(tools) || !tools.includes(BOARD)) return 'none';
  const d = crestOffset(utcMs, x);
  if (d === null) return 'none';
  const r = judgeCatch(d), w = waveAt(utcMs);
  if (r === 'catch') { s.mode = 'ride'; s.since = t; s.wave = w.id; s.why = null; } else wipeout(s, t, r);
  return r;
}

/** The pet fell: it stays where it is for WIPE_MS. */
export function wipeout(s, t, why) { s.mode = 'wipe'; s.since = t; s.why = why; }
/** The wipeout is over (and the state is idle again)? */
export function wipeOver(s, t) {
  if (s.mode !== 'wipe' || t - s.since < WIPE_MS) return false;
  s.mode = 'idle'; s.why = null; s.wave = null;
  return true;
}
/** The ride ended well, in the shallows. */
export function finishRide(s) { s.mode = 'idle'; s.wave = null; s.why = null; }

/**
 * The rider's next move, asked whenever it stands on a tile (one step a RIDE_MS): { type: 'move', dx, dy } (a steering step across the wave, or one towards the shore after the
 * crest), 'wait' (it is ahead of the crest: the wave catches up), or { type: 'end', why }: 'shore' (it reached the shallows or the end of the water), 'lag' (it fell behind the crest).
 * `steer` -1 (north on the map) / 0 / 1; `walkable(x, y)` and `water(x, y)` read the map; `crestX` is the wave's (Infinity when the wave is gone).
 */
export function rideDecide({ crestX, x, y, steer, walkable, water }) {
  if (water(x, y) !== 'deep') return { type: 'end', why: 'shore' };
  const lag = Math.floor(crestX) - x;
  if (lag > MAX_LAG) return crestX === Infinity ? { type: 'end', why: 'shore' } : { type: 'end', why: 'lag' };
  if (steer && walkable(x, y + steer) && water(x, y + steer)) return { type: 'move', dx: 0, dy: steer };
  if (lag < 1) return { type: 'wait' };
  return walkable(x + 1, y) ? { type: 'move', dx: 1, dy: 0 } : { type: 'end', why: 'shore' };
}

/**
 * The foam of the wave as strokes in world px, for the renderers to draw: { x, y, w, h, a } centred on (x, y), one set per tile row between rows y0 and y1 (inclusive):
 * the crest, a paler line behind it and a few flecks ahead. `shore(y)` is the first shallow column of a row: the wave fades out as it runs up the shallows. Empty without a wave.
 */
export function waveStrokes(wave, y0, y1, tile = 16, shore = () => 20) {
  if (!wave) return [];
  const out = [], ageS = wave.age / 1000, rise = Math.min(1, wave.age / 700);
  for (let ty = y0; ty <= y1; ty++) {
    const sx = shore(ty), into = wave.crestX - sx, fade = Math.max(0, 1 - Math.max(0, into) / 3.5) * rise;
    if (fade <= 0) continue;
    const wob = Math.sin(ty * 0.9 + ageS * 2.2) * 3, cx = wave.crestX * tile + tile / 2 + wob, cy = ty * tile + tile / 2;
    out.push({ x: cx, y: cy, w: 18, h: 6, a: 0.92 * fade });                                        // the crest
    out.push({ x: cx - 14, y: cy + (ty % 2 ? 2 : -2), w: 18, h: 5, a: 0.5 * fade });             // the foam it leaves behind
    out.push({ x: cx - 30, y: cy + (ty % 3 ? -2 : 3), w: 14, h: 4, a: 0.22 * fade });
    if (ty % 2 === 0) out.push({ x: cx + 12, y: cy + 2, w: 5, h: 3, a: 0.35 * fade });             // spray ahead of it
  }
  return out;
}
