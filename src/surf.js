// Surfing, as pure rules. The waves come from the clock, like the weather: every WAVE.periodMs a wave sets off and sweeps up the beach, so every player sees the same wave at
// the same moment (nothing goes over the net for it).
//
// The geometry (screen: north is up, the shore is on the east): the wave's front is a straight diagonal, a line "\" that runs from the north-west (open sea) to the south-east
// (the shore): the points (x, y) with y = k + x, `k` being the line's intercept in tiles. The whole line moves north-east: `k` falls by WAVE.speed tiles a second, so at any
// column the crest climbs up the screen from the bottom to the top at that speed (and at any row it runs east, towards the shore). It starts below the map and leaves above it.
// It peels like a point break: the foam is only on the part of the line south-east of the peel point (`peel`, a column) and the peel point runs north-west along the line, so
// the broken, white part grows towards the open sea while the unbroken swell ahead of it stays a thin pale line.
//
// A pet with a surfboard waiting at the break (the columns of 'K' tiles) presses A while the crest passes its tile: `offset` = pet row - crest row at its column: negative while
// the crest is still coming (from below), positive once it has passed. Inside the window it catches the wave; too early or too late it wipes out. Riding, the pet keeps pace with
// the crest (a step north or east lowers its offset by one, just as the crest's climb raises it): the player picks the direction along the wall with up (north, up the
// wall, a longer ride) and down (east, cutting back to the shore); a ride ends in the shallows. Everything here is plain data in, plain data out; src/town.js drives it
// and the renderers draw it.
import { isBreak } from './map.js';
import { needText } from './tools.js';

export const BOARD = 'surfboard';
export const WAVE = {
  periodMs: 10000,         // a new wave every 10 s
  speed: 8,                // tiles a second the crest climbs at any column
  k0: 34,                  // the intercept when it appears: the line is below the bottom row of the map
  kEnd: -22,               // and when it has gone: the line is above the top of the map, even at the shore end
  peelFrom: 19,            // the peel point starts at this column (the shore end) ...
  peelTo: 2,               // ... and runs out to this one
};
export const WAVE_LIFE_MS = ((WAVE.k0 - WAVE.kEnd) / WAVE.speed) * 1000;
export const CATCH_TILES = 2;         // the window: the crest within this many rows of the pet, before or after (a quarter of a second)
export const PROMPT_AHEAD = 8;        // "Tomar la ola" shows from when the crest is this many rows below the pet ...
export const PROMPT_BEHIND = 3;       // ... until it is this many rows above it
export const RIDE_MS = 100;           // a step of the ride: a little quicker than the crest climbs (125 ms a row), so the rider is never left behind
export const MAX_LAG = 4;             // more rows behind the crest than this and the rider falls off
export const MAX_AHEAD = 3;           // ... and it waits for the wave when it is this far ahead of it
export const WIPE_MS = 1500;          // how long a wipeout lasts
export const SAY = { early: 'Muy pronto', late: 'Muy tarde', lag: '¡Te caíste!', done: '¡Qué ola!' };

/** The wave of the clock at `utcMs` (ms): { id, age (ms), k (the front's intercept: row = k + column), peel (the column the foam has reached) }, or null in the quiet between two waves. */
export function waveAt(utcMs) {
  if (!Number.isFinite(utcMs)) return null;
  const id = Math.floor(utcMs / WAVE.periodMs), age = utcMs - id * WAVE.periodMs, k = WAVE.k0 - (WAVE.speed * age) / 1000;
  return k >= WAVE.kEnd ? { id, age, k, peel: WAVE.peelFrom + (WAVE.peelTo - WAVE.peelFrom) * (age / WAVE_LIFE_MS) } : null;
}

/** The row of the crest at a column: the front is the line row = k + column. */
export const crestRow = (wave, x) => wave.k + x;

/** The pet's row minus the crest's at its column: negative while the crest is still coming (from below), positive once it has passed; null when no wave is near enough to matter. */
export function crestOffset(utcMs, x, y) {
  const w = waveAt(utcMs);
  if (!w) return null;
  const e = y - crestRow(w, x);
  return e >= -PROMPT_AHEAD && e <= PROMPT_BEHIND ? e : null;
}

/** What pressing at offset `e` does: 'early', 'catch' or 'late'. */
export const judgeCatch = (e) => (e < -CATCH_TILES ? 'early' : e > CATCH_TILES ? 'late' : 'catch');

/** The prompt at the break for a pet standing still at (x, y): the catch with a wave near, what is missing without a board, or null away from the break. */
export function surfAction(utcMs, x, y, tools) {
  if (!isBreak(x, y, 'beach')) return null;
  if (!Array.isArray(tools) || !tools.includes(BOARD)) return { id: 'hint', label: needText(BOARD), need: BOARD, target: 'break' };
  return crestOffset(utcMs, x, y) !== null ? { id: 'surf', label: 'Tomar la ola', target: 'wave' } : { id: 'hint', label: 'Espera la próxima ola', target: 'break' };
}

export const createSurf = () => ({ mode: 'idle', since: 0, wave: null, why: null, steps: 0 });
/** The `surf` flag a pet sends with its position and the others draw: 0 nothing, 1 riding, 2 wiped out, 3 paddling on its board in the water. */
export const surfFlag = (s, paddling = false) => (s.mode === 'ride' ? 1 : s.mode === 'wipe' ? 2 : paddling ? 3 : 0);

/**
 * The A press at the break: starts the ride (returns 'catch'), a wipeout ('early' or 'late'), or does nothing ('none': not at the break, no board, no wave near, already surfing).
 * `t` is any monotonic clock in ms (the wipeout's timer), `utcMs` the clock the waves run on.
 */
export function press(s, { utcMs, x, y, tools, t }) {
  if (s.mode !== 'idle' || !isBreak(x, y, 'beach') || !Array.isArray(tools) || !tools.includes(BOARD)) return 'none';
  const e = crestOffset(utcMs, x, y);
  if (e === null) return 'none';
  const r = judgeCatch(e), w = waveAt(utcMs);
  if (r === 'catch') { s.mode = 'ride'; s.since = t; s.wave = w.id; s.why = null; s.steps = 0; } else wipeout(s, t, r);
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
/** The ride ended well. */
export function finishRide(s) { s.mode = 'idle'; s.wave = null; s.why = null; s.steps = 0; }

/**
 * The rider's next move, asked whenever it stands on a tile (one step every RIDE_MS): { type: 'move', dx, dy } (north, up the wall, or east, towards the shore), 'wait' (it is
 * ahead of the crest: the wave comes on), or { type: 'end', why }: 'shore' (it reached the shallows or the wave is gone), 'edge' (there is no more beach to ride, it stays on
 * the wave to the end) or 'lag' (it fell behind the crest). Both moves keep the rider on the crest; `steer` 'up' prefers north, 'down' east, none alternates them (a diagonal);
 * `steps` is how many it has taken. `k` is the wave's intercept (null once it is gone); `walkable(x, y)` and `water(x, y)` read the map.
 */
export function rideDecide({ k, x, y, steer, steps = 0, walkable, water }) {
  if (water(x, y) !== 'deep' || k === null || k === undefined) return { type: 'end', why: 'shore' };
  const e = y - (k + x);
  if (e > MAX_LAG) return { type: 'end', why: 'lag' };
  if (e - 1 < -MAX_AHEAD) return { type: 'wait' };
  const N = { type: 'move', dx: 0, dy: -1 }, E = { type: 'move', dx: 1, dy: 0 };
  const order = steer === 'up' ? [N, E] : steer === 'down' ? [E, N] : steps % 2 ? [E, N] : [N, E];
  for (const m of order) if (walkable(x + m.dx, y + m.dy) && water(x + m.dx, y + m.dy)) return m;
  return { type: 'end', why: 'edge' };
}

/**
 * The foam of the wave as strokes in world px, for the renderers to draw: { x, y, w, h, a } centred on (x, y), along the diagonal front between rows y0 and y1 (inclusive), sampled
 * every half row. South-east of the peel point the wave has broken: a bright crest, foam trailing behind it (to the south-west) and spray ahead; north-west of it the unbroken swell
 * is a thin pale line. `shore(y)` is the first shallow column of a row: the wave fades out as it runs up the shallows. Empty without a wave.
 */
export function waveStrokes(wave, y0, y1, tile = 16, shore = () => 20) {
  if (!wave) return [];
  const out = [], rise = Math.min(1, wave.age / 600);
  for (let row = y0; row <= y1 + 0.001; row += 0.5) {
    const col = row - wave.k;                                                            // the column the front is at on this row
    const sx = shore(Math.min(y1, Math.max(y0, Math.round(row))));
    if (col < 0.7 || col > sx + 4) continue;
    const fade = Math.min(1, Math.max(0, 1 - Math.max(0, col - sx) / 3.5)) * rise * Math.min(1, (col - 0.7) / 1.5);
    if (fade <= 0) continue;
    const cx = col * tile + tile / 2, cy = row * tile + tile / 2;
    if (col >= wave.peel) {                                                              // broken: white water
      out.push({ x: cx, y: cy, w: 16, h: 7, a: 0.92 * fade });
      out.push({ x: cx - 9, y: cy + 9, w: 15, h: 6, a: 0.5 * fade });
      out.push({ x: cx - 19, y: cy + 19, w: 12, h: 5, a: 0.24 * fade });
      if (Math.floor(row * 2) % 3 === 0) out.push({ x: cx + 8, y: cy - 8, w: 5, h: 3, a: 0.38 * fade });
    } else out.push({ x: cx, y: cy, w: 11, h: 3, a: 0.4 * fade });                        // the swell that has not broken yet
  }
  return out;
}

export const WAVE_LIFT = 4.5;                 // the crest is lifted this many times a sample's height (world px) up the screen (src/hd2d/wave.js draws the wall with it)

/** The height of the wave's body (world px, before WAVE_LIFT) and its look at column `col`: { a (fade 0..1), broken, curl, h } or null where there is no wave. `sx` is the first shallow column of the row. */
export function bodyAt(wave, col, sx) {
  if (!wave || col < 0.7 || col > sx + 4) return null;
  const rise = Math.min(1, wave.age / 600), a = Math.min(1, Math.max(0, 1 - Math.max(0, col - sx) / 3.5)) * rise * Math.min(1, (col - 0.7) / 1.5);
  if (a <= 0) return null;
  const broken = col >= wave.peel, d = (col - wave.peel) / 2.2, curl = Math.exp(-d * d), swell = Math.exp(-(((col - wave.peel) / 5) ** 2));
  const h = (broken ? 7 + 3 * curl : 3 + 3 * swell) * (0.55 + 0.45 * Math.min(1, Math.max(0, (sx - col) / 3 + 0.5)));
  return { a, broken, curl, h };
}

/**
 * The body of the wave as samples along its front, for the renderers to give it volume: one per half row between rows y0 and y1 (inclusive), { x, y (world px, centre), a (fade 0..1),
 * broken, curl (0..1: how close it is to the peel point, where the lip is thrown), h (height of the water above the sea in world px), col }. The geometry is the one of `waveAt` (the
 * crest at column row - k): only the look is here. Unbroken swell is a gentle bulge that grows towards the peel point; the broken part is taller, with the lip curling at the peel.
 * `shore(y)` is the first shallow column of a row: the wave flattens and fades as it runs up the shallows.
 */
export function waveBody(wave, y0, y1, tile = 16, shore = () => 20) {
  if (!wave) return [];
  const out = [];
  for (let row = y0; row <= y1 + 0.001; row += 0.5) {
    const col = row - wave.k, b = bodyAt(wave, col, shore(Math.min(y1, Math.max(y0, Math.round(row)))));
    if (b) out.push({ x: col * tile + tile / 2, y: row * tile + tile / 2, a: b.a, broken: b.broken, curl: b.curl, h: b.h, col });
  }
  return out;
}

export const SWELL = { front: 3, back: 5, share: 0.7 };          // a pet is lifted from this many rows ahead of the crest and set down this many rows behind it (a longer back slope), by this share of the wall's height
const smoother = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * c * (c * (c * 6 - 15) + 10); };

/**
 * How high a swell lifts something floating at (x, y) (tiles, fractional while it moves) in world px: the pet rises up the face as the crest comes up from below, peaks at the crest and
 * slides down the back, as if the wave stood above the sea. It is the wall's own height profile (bodyAt, the one the wall is drawn with, times WAVE_LIFT), eased with a smooth curve
 * of the offset `e` = row - crest row at its column (negative while the crest is coming). 0 without a wave or off its reach. Draw only: it changes no tile.
 */
export function swellLift(wave, x, y, shore = () => 20, { front = SWELL.front, back = SWELL.back, share = SWELL.share } = {}) {
  if (!wave) return 0;
  const b = bodyAt(wave, x, shore(Math.min(34, Math.max(1, Math.round(y)))));
  if (!b) return 0;
  const e = y - (wave.k + x);
  const f = e < 0 ? smoother(1 + e / front) : smoother(1 - e / back);
  return b.h * WAVE_LIFT * share * b.a * f;
}
