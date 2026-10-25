// A drone show as a pure function of (seed, t): 40 small lights lift off the plaza, fly to a formation hung in the sky, morph into the next
// (a paw print, a heart, the word HOLA) and come back down. A formation is a set of 40 points on a vertical plane facing the camera.
import { hash, smooth, lerp } from './rand.js';

export const COUNT = 40;
const PAW = ['...XX..XX...', '...XX..XX...', '.XX......XX.', '.XX......XX.', '....XXXX....', '...XXXXXX...', '..XXXXXXXX..', '...XXXXXX...'];
const FONT = { H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'], O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], L: ['X..', 'X..', 'X..', 'X..', 'XXX'], A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'] };

/** The '#'/'X' cells of an ascii grid as points in [-1, 1] x [-1, 1] (x right, z up), width-preserving. */
function gridPoints(rows) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length, s = Math.max(w, h) - 1, pts = [];
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'X') pts.push([((i - (w - 1) / 2) / s) * 2, (-(j - (h - 1) / 2) / s) * 2]); }));
  return pts;
}

/** Exactly `n` points taken evenly from a list (repeating some when the list is short). */
const resample = (pts, n) => Array.from({ length: n }, (_, i) => pts[Math.min(pts.length - 1, Math.floor(((i + 0.5) * pts.length) / n))]);

function heart() {
  return Array.from({ length: COUNT }, (_, i) => {
    const a = (i / COUNT) * Math.PI * 2, s = Math.sin(a);
    return [(16 * s * s * s) / 17, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17 + 0.1];
  });
}

function word(text) {
  const rows = [0, 1, 2, 3, 4].map((j) => [...text].map((c) => FONT[c][j]).join('.'));
  return gridPoints(rows);
}

/** Sorted left to right, then bottom to top, so drone i flies to the i-th point of every formation and the morph sweeps like a wave. */
const order = (pts) => pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);

export const FORMATIONS = [
  { name: 'paw', pts: order(resample(gridPoints(PAW), COUNT)), color: [255, 176, 96], size: 1.05 },
  { name: 'heart', pts: order(heart()), color: [255, 90, 130], size: 0.85 },
  { name: 'hola', pts: order(word('HOLA')), color: [120, 230, 255], size: 1.05 },
];

// The timeline in show seconds: lift off, hold, morph, hold, ... then a descent.
export const T = { lift: 5, hold: 7, morph: 3, descend: 4.5 };
export const dronesDuration = () => T.lift + FORMATIONS.length * T.hold + (FORMATIONS.length - 1) * T.morph + T.descend;
const STAGE = { x: 384, y: -150, z: 168, sx: 150, sz: 110, depth: 12 };     // where the formation hangs: world px, far to the north and high

/** Where drone i is, in the formation `f` (world px). */
export function slot(f, i) {
  const [px, pz] = FORMATIONS[f].pts[i], k = FORMATIONS[f].size;
  return [STAGE.x + px * STAGE.sx * k, STAGE.y + (hash(1, i, f) - 0.5) * STAGE.depth, STAGE.z + pz * STAGE.sx * k];
}

/** Where drone i waits on the ground before liftoff: a grid on the plaza, south of the fountain. */
export const pad = (i) => [352 + (i % 8) * 10, 352 + Math.floor(i / 8) * 9, 0];

/** Which formation the show is in at time t: { from, to, k } with k 0..1 the morph amount (0 = at `from`). */
export function phaseAt(t) {
  let at = T.lift;
  for (let f = 0; f < FORMATIONS.length; f++) {
    if (t < at + T.hold) return { from: f, to: f, k: 0 };
    at += T.hold;
    if (f < FORMATIONS.length - 1) { if (t < at + T.morph) return { from: f, to: f + 1, k: (t - at) / T.morph }; at += T.morph; }
  }
  return { from: FORMATIONS.length - 1, to: FORMATIONS.length - 1, k: 0 };
}

/** The 40 lights at time t: [{ x, y, z, a, r, g, b }] in world px. Pure: the same (t) always gives the same lights. */
export function dronesAt(seed, t) {
  const out = [], end = dronesDuration();
  if (t < 0 || t > end) return out;
  const { from, to, k } = phaseAt(t), c0 = FORMATIONS[from].color, c1 = FORMATIONS[to].color;
  for (let i = 0; i < COUNT; i++) {
    const delay = (i / COUNT) * 0.9 + hash(seed, i, 1) * 0.3;
    let p, a = 1;
    if (t < T.lift) {                                              // liftoff: climb from the pad, drifting to the first formation point
      const s = smooth((t - delay) / (T.lift - 1.2)), g = pad(i), h = slot(0, i);
      p = [lerp(g[0], h[0], s), lerp(g[1], h[1], s), lerp(g[2], h[2], s) * 1];
      p[2] += Math.sin(s * Math.PI) * 14;
      a = Math.min(1, (t - delay) * 2 + 0.25);
    } else if (t > end - T.descend) {                              // landing: back to the pad, fading near the end
      const s = smooth((t - (end - T.descend) - delay * 0.5) / (T.descend - 1.4)), h = slot(FORMATIONS.length - 1, i), g = pad(i);
      p = [lerp(h[0], g[0], s), lerp(h[1], g[1], s), lerp(h[2], g[2], s)];
      a = 1 - smooth((t - (end - 1.2)) / 1.2) * 0.9;
    } else {                                                       // formation and morph: each drone leaves a little after the one before it
      const s = smooth((k - (delay / 1.2) * 0.3) / 0.7), A = slot(from, i), B = slot(to, i);
      p = [lerp(A[0], B[0], s), lerp(A[1], B[1], s), lerp(A[2], B[2], s) + Math.sin(s * Math.PI) * 16 * (hash(seed, i, 2) - 0.3)];
    }
    const tw = 0.82 + 0.18 * Math.sin(t * 5 + i * 1.7);            // a slow blink: the real drones' lights breathe
    const m = smooth(k * 1.2);
    out.push({ x: p[0], y: p[1], z: p[2], a: a * tw, r: lerp(c0[0], c1[0], m), g: lerp(c0[1], c1[1], m), b: lerp(c0[2], c1[2], m) });
  }
  return out;
}
