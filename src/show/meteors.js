// Shooting stars as a pure function of (seed, t). They live in "sky space": u 0..1 across the screen, v 0..1 from the top of the screen
// down to the horizon, so they stay inside the sky band however far the camera has tilted.
import { hash, clamp01 } from './rand.js';

const TAILS = [[255, 255, 255], [190, 235, 255], [255, 232, 170], [255, 190, 235]];
export const DURATION = 28;                                          // seconds by default (the same number as SHOWS.meteors.dur; a test keeps them equal)
const cache = new Map();

/**
 * The streaks of a seed for a show of `dur` seconds: { t0, dur, u0, v0, u1, v1, c }. A trickle for the first part, then a shower that ends
 * the show. A longer show has a longer trickle (more streaks at the same pace); the shower keeps its length.
 */
export function meteorSchedule(seed, dur = DURATION) {
  const key = `${seed}/${dur}`;
  if (cache.has(key)) return cache.get(key);
  const list = [], trickle = Math.max(3, Math.round((16 * (dur - 16)) / 12)), showerAt = 15 + (dur - DURATION);
  for (let i = 0; i < trickle + 18; i++) {
    const shower = i >= trickle, k = shower ? i - trickle : i;
    const t0 = shower ? showerAt + k * 0.5 + hash(seed, i, 1) * 0.3 : 3 + k * 0.95 + hash(seed, i, 1) * 0.6;
    const dir = hash(seed, i, 2) < (shower ? 0.15 : 0.5) ? 1 : -1;        // the shower mostly falls the same way
    const u0 = 0.15 + hash(seed, i, 3) * 0.75, v0 = hash(seed, i, 4) * 0.45;
    const len = 0.3 + hash(seed, i, 5) * 0.3;
    list.push({ t0, dur: 0.65 + hash(seed, i, 6) * 0.6, u0, v0, u1: u0 + dir * len, v1: v0 + len * 0.6 * (0.7 + hash(seed, i, 7) * 0.6), c: TAILS[Math.floor(hash(seed, i, 8) * TAILS.length)] });
  }
  cache.set(key, list);
  return list;
}

/** The lit points of every streak at time t: [{ u, v, a, head, c }] (a = 0..1 brightness; the head is the brightest). Pure. */
export function meteorsAt(seed, t, dur = DURATION) {
  const pts = [];
  for (const m of meteorSchedule(seed, dur)) {
    const s = (t - m.t0) / m.dur;
    if (s < 0 || s > 1.45) continue;
    const head = clamp01(s), tail = clamp01(s - 0.62);        // the streak is the stretch between tail and head; it ends when the tail arrives
    const life = s < 1 ? 1 : 1 - (s - 1) / 0.45;
    const n = 44;
    for (let k = 0; k <= n; k++) {
      const p = tail + (head - tail) * (k / n);
      if (head - tail < 1e-4) continue;
      const w = k / n;
      pts.push({ u: m.u0 + (m.u1 - m.u0) * p, v: m.v0 + (m.v1 - m.v0) * p, a: w * w * life, head: k === n && s <= 1 ? 1 : 0, c: m.c });
    }
  }
  return pts;
}
