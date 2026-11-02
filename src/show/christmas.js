// The Christmas show as a pure function of (seed, t, dur): the star of Bethlehem rises over the horizon; Santa's sleigh and its reindeer cross the sky
// leaving a trail of light (one pass crosses the star); coloured sparkles twinkle among the stars; and in the finale a flock of lights gathers into a
// Christmas tree, holds it and scatters. Everything lives in sky space like the other shows: u across the screen (0..1), v from the top of the sky to the
// horizon (0..1), plus an offset (ox, oy) in art pixels so a formation keeps its proportions on any screen (see drawChristmas in draw-christmas.js).
import { hash, smooth, lerp } from './rand.js';
import { gridPoints, resample } from './drones.js';

export const DURATION = 40;                                         // seconds by default (the same number as SHOWS.christmas.dur; a test keeps them equal)
export const STAR = { u: 0.78, v0: 0.62, v1: 0.24, from: 0.5, to: 9.5, fadeIn: 3, fadeOut: 3.5 };
export const FINALE = { at: 27.8, form: 3.2, hold: 36, scatter: 3, u: 0.3, v: 0.52, size: 28, count: 64 };       // at the default length; see `finaleOf`
/** The finale for a show of `dur` seconds: it keeps its length and ends with the show (the default is FINALE as it is). */
export const finaleOf = (dur = DURATION) => ({ ...FINALE, at: FINALE.at + (dur - DURATION), hold: FINALE.hold + (dur - DURATION) });
const TREE = [
  '.......X.......', '......XXX......', '.....XXXXX.....', '......XXX......', '.....XXXXX.....', '....XXXXXXX....', '.....XXXXX.....', '....XXXXXXX....',
  '...XXXXXXXXX...', '..XXXXXXXXXXX..', '....XXXXXXX....', '...XXXXXXXXX...', '..XXXXXXXXXXX..', '.XXXXXXXXXXXXX.', 'XXXXXXXXXXXXXXX', '......XXX......', '......XXX......',
];
export const TREE_PTS = resample(gridPoints(TREE), FINALE.count);          // [-1, 1] x [-1, 1] (x right, z up), one light per point
export const SLEIGHS = 4, SPARKLES = 28, COLORS = 5;                      // sleighs at the default length: a longer show has more (see sleighsOf)
export const sleighsOf = (dur = DURATION) => Math.max(2, Math.round(SLEIGHS + (dur - DURATION) / 6));
const SPACING = 5.8;

/** Where the star of Bethlehem is at time t: { u, v, a (0..1 brightness), k (a slow pulse, 0.85..1) }, or null before it appears and after it has set. */
export function starAt(t, dur = DURATION) {
  const a = smooth(t / STAR.fadeIn) * (1 - smooth((t - (dur - STAR.fadeOut)) / STAR.fadeOut));
  return a > 0.001 ? { u: STAR.u, v: lerp(STAR.v0, STAR.v1, smooth((t - STAR.from) / (STAR.to - STAR.from))), a, k: 0.925 + 0.075 * Math.sin(t * 3.1) } : null;
}

/** The sleighs of a seed: { t0, dur, dir (1 flies to the right), v (height), hero (flies across the star) }. */
export function sleighSchedule(seed, dur = DURATION) {
  const flip = hash(seed, 99) < 0.5 ? 1 : -1;
  return Array.from({ length: sleighsOf(dur) }, (_, i) => {
    const hero = i % 4 === 1;
    return { t0: 3.5 + i * SPACING + hash(seed, i, 1) * 0.8, dur: 9 + hash(seed, i, 2) * 2, dir: i % 2 ? -flip : flip, hero, v: hero ? STAR.v1 + 0.08 + (hash(seed, i, 3) - 0.5) * 0.06 : i % 4 === 0 ? 0.22 + hash(seed, i, 3) * 0.1 : 0.42 + hash(seed, i, 3) * 0.3 };
  });
}

/** The twinkling sparkles of a seed: { u, v, ph, sp, c (colour 0..4), big }. */
export function sparkleSchedule(seed) {
  return Array.from({ length: SPARKLES }, (_, i) => ({ u: hash(seed, i, 51), v: Math.pow(hash(seed, i, 52), 0.9) * 0.95, ph: hash(seed, i, 53) * 6.28, sp: 1.6 + hash(seed, i, 54) * 2.8, c: Math.floor(hash(seed, i, 55) * COLORS), big: i % 3 === 0 ? 1 : 0 }));
}

const TRAIL = 12;                                                    // lights in a sleigh's trail
/**
 * The show at time t (seconds): { star, sparkles: [{ u, v, a, c, big }], sleighs: [{ u, v, dir, trail: [{ u, v, a }] }], baubles: [{ u, v, ox, oy, a, c, lit (0..1) }] }.
 * Empty before the start and after the end.
 */
export function christmasAt(seed, t, dur = DURATION) {
  const out = { star: null, sparkles: [], sleighs: [], baubles: [] }, fin = finaleOf(dur);
  if (t < 0 || t > dur) return out;
  out.star = starAt(t, dur);
  const fade = smooth(t / 2) * (1 - smooth((t - (dur - 2.5)) / 2.5));
  if (fade > 0.001) for (const s of sparkleSchedule(seed)) out.sparkles.push({ u: s.u, v: s.v, a: fade * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)), c: s.c, big: s.big });
  sleighSchedule(seed, dur).forEach((w, i) => {
    const p = (t - w.t0) / w.dur;
    if (p < 0 || p > 1) return;
    const at = (q) => ({ u: w.dir > 0 ? lerp(-0.14, 1.14, q) : lerp(1.14, -0.14, q), v: w.v + Math.sin(q * 6 + i) * 0.022 - (q - 0.5) * 0.06 * w.dir });
    const trail = [];
    for (let k = 1; k <= TRAIL; k++) { const q = p - k * 0.011; if (q >= 0) trail.push({ ...at(q), a: Math.pow(1 - k / (TRAIL + 1), 1.4) }); }
    out.sleighs.push({ ...at(p), dir: w.dir, trail });
  });
  if (t >= fin.at) for (let i = 0; i < FINALE.count; i++) {
    const [px, pz] = TREE_PTS[i], ta = fin.at + (i / FINALE.count) * 1.4, left = i % 2 === 0;
    const sx = left ? -0.12 : 1.12, sv = 0.1 + hash(seed, i, 31) * 0.7;
    const so = (t - fin.hold) / FINALE.scatter;                                    // 0..1 while the tree breaks up
    const p = smooth((t - ta) / FINALE.form);
    if (t < ta || so > 1) continue;
    const ox = px * FINALE.size, oy = -pz * FINALE.size;
    let bx = lerp(sx, FINALE.u, p), by = lerp(sv, FINALE.v, p) + Math.sin(p * Math.PI) * (hash(seed, i, 32) - 0.5) * 0.3, bo = ox * p, bp = oy * p, a = Math.min(1, p * 4);
    if (p >= 1) { bp += Math.sin(t * 3 + i) * 0.5; bo += Math.cos(t * 2.3 + i * 1.3) * 0.4; }
    if (so > 0) {                                                                       // scatter outwards (and up), fading
      const ang = Math.atan2(oy, ox) + (hash(seed, i, 33) - 0.5) * 0.8, s = so * so * 0.6 + so * 0.4;
      bo += Math.cos(ang) * s * 90; bp += Math.sin(ang) * s * 90 - s * 25;
      a *= 1 - smooth(so * 1.1);
    }
    out.baubles.push({ u: bx, v: by, ox: bo, oy: bp, a, c: Math.floor(hash(seed, i, 41) * COLORS), lit: smooth((p - 0.4) / 0.6) });
  }
  return out;
}
