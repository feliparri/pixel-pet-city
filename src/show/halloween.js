// The Halloween show as a pure function of (seed, t): a big orange moon rises over the horizon; witches on brooms cross the sky (some in front
// of the moon); ghosts rise and fade; swarms of bats flap across; and in the finale a flock of bats gathers into a glowing jack-o'-lantern,
// holds it and scatters. Everything lives in sky space like the shooting stars: u across the screen (0..1), v from the top of the sky to the
// horizon (0..1), plus an offset (ox, oy) in art pixels so a formation keeps its proportions on any screen (see drawHalloween in draw.js).
import { hash, smooth, lerp } from './rand.js';
import { gridPoints, resample } from './drones.js';

export const DURATION = 40;                                         // seconds; the same number as SHOWS.halloween.dur (a test keeps them equal)
export const MOON = { u: 0.74, v0: 0.62, v1: 0.26, from: 0.5, to: 9.5, fadeIn: 3, fadeOut: 3.5 };
export const FINALE = { at: 27.8, form: 3.2, hold: 36, scatter: 3, u: 0.3, v: 0.55, size: 24, count: 64 };
const PUMPKIN = [
  '......XX........', '.....XXX........', '..XXXXXXXXXXXX..', '.XXXXXXXXXXXXXX.', 'XXXXXXXXXXXXXXXX', 'XXX..XXXXXX..XXX', 'XXXX.XXXXXXX.XXX', 'XXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXX', 'XXX.XXX..XXX.XXX', 'XXXX.XXXXXX.XXXX', 'XXXXXXXXXXXXXXXX', '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXX..',
];
export const PUMPKIN_PTS = resample(gridPoints(PUMPKIN), FINALE.count);          // [-1, 1] x [-1, 1] (x right, z up), one bat per point
export const WITCHES = 7, GHOSTS = 6;
const SWARMS = [{ t0: 3, dur: 10, dir: 1, v: 0.42, n: 14 }, { t0: 12.5, dur: 10, dir: -1, v: 0.58, n: 16 }, { t0: 19.5, dur: 9, dir: 1, v: 0.3, n: 12 }];

/** Where the moon is at time t: { u, v, a } (a = 0..1 brightness), or null before it appears and after it has set. */
export function moonAt(t) {
  const a = smooth(t / MOON.fadeIn) * (1 - smooth((t - (DURATION - MOON.fadeOut)) / MOON.fadeOut));
  return a > 0.001 ? { u: MOON.u, v: lerp(MOON.v0, MOON.v1, smooth((t - MOON.from) / (MOON.to - MOON.from))), a } : null;
}

/** The witches of a seed: { t0, dur, dir (1 flies to the right), v (height), hero (flies across the moon) }. */
export function witchSchedule(seed) {
  const flip = hash(seed, 99) < 0.5 ? 1 : -1;
  return Array.from({ length: WITCHES }, (_, i) => {
    const hero = i === 2 || i === 5;
    return { t0: 4.5 + i * 3.7 + hash(seed, i, 1) * 0.8, dur: 8.5 + hash(seed, i, 2) * 2.5, dir: i % 2 ? -flip : flip, hero, v: hero ? MOON.v1 + (hash(seed, i, 3) - 0.5) * 0.12 : i % 3 === 0 ? 0.12 + hash(seed, i, 3) * 0.1 : 0.46 + hash(seed, i, 3) * 0.28 };
  });
}

/** The ghosts of a seed: { t0, life, u, ph }. They rise from the horizon, sway, and fade out. */
export function ghostSchedule(seed) {
  return Array.from({ length: GHOSTS }, (_, i) => ({ t0: 6 + i * 4.2 + hash(seed, i, 11) * 1.2, life: 7 + hash(seed, i, 12) * 2, u: 0.06 + hash(seed, i, 13) * 0.88, ph: hash(seed, i, 14) * 6.28 }));
}

/**
 * The show at time t (seconds): { moon, witches: [{ u, v, dir }], ghosts: [{ u, v, ox, a }], bats: [{ u, v, ox, oy, a, f (wing frame 0|1), lit (0..1, glowing orange), dir }], glow (0..1) }.
 * Empty before the start and after the end.
 */
export function halloweenAt(seed, t) {
  const out = { moon: null, witches: [], ghosts: [], bats: [], glow: 0 };
  if (t < 0 || t > DURATION) return out;
  out.moon = moonAt(t);
  out.glow = out.moon ? out.moon.a : 0;
  witchSchedule(seed).forEach((w, i) => {
    const p = (t - w.t0) / w.dur;
    if (p < 0 || p > 1) return;
    out.witches.push({ u: w.dir > 0 ? lerp(-0.12, 1.12, p) : lerp(1.12, -0.12, p), v: w.v + Math.sin(p * 9 + i) * 0.025 - (p - 0.5) * 0.05 * w.dir, dir: w.dir });
  });
  ghostSchedule(seed).forEach((g) => {
    const p = (t - g.t0) / g.life;
    if (p < 0 || p > 1) return;
    out.ghosts.push({ u: g.u, v: lerp(0.84, 0.24, smooth(p)), ox: Math.sin(p * 7 + g.ph) * 3, a: Math.pow(Math.sin(p * Math.PI), 0.8) * 0.78 });
  });
  SWARMS.forEach((s, k) => {
    const p = (t - s.t0) / s.dur;
    if (p < 0 || p > 1) return;
    for (let i = 0; i < s.n; i++) {
      const lag = (hash(seed, k * 50 + i, 21) - 0.5) * 0.12, q = Math.min(1, Math.max(0, p + lag * s.dir * -1));
      out.bats.push({ u: (s.dir > 0 ? lerp(-0.12, 1.12, q) : lerp(1.12, -0.12, q)), v: s.v + (hash(seed, k * 50 + i, 22) - 0.5) * 0.16 + 0.035 * Math.sin(t * 2.3 + i * 1.7), ox: 0, oy: 0, a: 1, f: Math.floor(t * 9 + hash(seed, k * 50 + i, 23) * 8) % 2, lit: 0, dir: s.dir });
    }
  });
  if (t >= FINALE.at) for (let i = 0; i < FINALE.count; i++) {
    const [px, pz] = PUMPKIN_PTS[i], ta = FINALE.at + (i / FINALE.count) * 1.4, left = i % 2 === 0;
    const sx = left ? -0.12 : 1.12, sv = 0.1 + hash(seed, i, 31) * 0.7;
    const so = (t - (FINALE.hold)) / FINALE.scatter;                                    // 0..1 while the pumpkin breaks up
    const p = smooth((t - ta) / FINALE.form);
    if (t < ta || so > 1) continue;
    const ox = px * FINALE.size, oy = -pz * FINALE.size;
    let bx = lerp(sx, FINALE.u, p), by = lerp(sv, FINALE.v, p) + Math.sin(p * Math.PI) * (hash(seed, i, 32) - 0.5) * 0.3, bo = ox * p, bp = oy * p, a = Math.min(1, p * 4);
    if (p >= 1) { bp += Math.sin(t * 3 + i) * 0.8; bo += Math.cos(t * 2.3 + i * 1.3) * 0.5; }
    if (so > 0) {                                                                       // scatter outwards (and up), fading
      const ang = Math.atan2(oy, ox) + (hash(seed, i, 33) - 0.5) * 0.8, s = so * so * 0.6 + so * 0.4;
      bo += Math.cos(ang) * s * 90; bp += Math.sin(ang) * s * 90 - s * 25;
      a *= 1 - smooth(so * 1.1);
    }
    out.bats.push({ u: bx, v: by, ox: bo, oy: bp, a, f: Math.floor(t * (so > 0 ? 14 : 10) + i) % 2, lit: smooth((p - 0.55) / 0.45), dir: left ? 1 : -1 });
  }
  return out;
}
