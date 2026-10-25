// Fireworks as a pure function of (seed, t): a schedule of bursts is derived from the seed, and every rocket and spark has a closed-form
// position at any time, so any client can draw the same sky at the same moment without keeping particle state.
// World units are map px (x right, y south, z up). Bursts happen far to the north of the plaza and high, so the tilted camera shows them in the sky band.
import { hash, clamp01 } from './rand.js';

export const PALETTES = [
  [[255, 84, 96], [255, 200, 90]], [[255, 214, 80], [255, 120, 60]], [[90, 220, 255], [200, 255, 255]], [[255, 110, 210], [255, 190, 240]],
  [[120, 255, 150], [230, 255, 140]], [[170, 140, 255], [120, 200, 255]], [[255, 255, 255], [255, 220, 150]],
];
export const SHAPES = ['ring', 'palm', 'heart', 'peony'];
const GRAV = 40, DRAG = 2.1, LIFE = 2.6, HEAD = { x: 384, y: 330 };

const cache = new Map();
/** The schedule for a seed: one entry per burst { tl launch, tb burst, lx, ly, bx, by, bz, R radius, shape, c1, c2 }. */
export function schedule(seed) {
  if (cache.has(seed)) return cache.get(seed);
  const list = [], n = 21, finale = 8;
  for (let i = 0; i < n + finale; i++) {
    const fin = i >= n, j = fin ? i - n : i;
    const tl = fin ? 24.2 + j * 0.34 + hash(seed, i, 1) * 0.15 : 0.8 + j * 1.12 + hash(seed, i, 1) * 0.5;
    const u = hash(seed, i, 2), v = hash(seed, i, 3);
    const bx = HEAD.x + (fin ? (j / (finale - 1) - 0.5) * 520 : (u - 0.5) * 480), bz = 112 + v * 45 + (fin ? j % 3 * 14 : 0);
    const pal = PALETTES[Math.floor(hash(seed, i, 4) * PALETTES.length)];
    list.push({
      i, tl, tb: tl + 1.0 + hash(seed, i, 5) * 0.35, lx: HEAD.x + (bx - HEAD.x) * 0.35 + (hash(seed, i, 6) - 0.5) * 60, ly: HEAD.y + 6 + hash(seed, i, 7) * 40,
      bx, by: -170 + hash(seed, i, 8) * 130, bz, R: 150 + hash(seed, i, 9) * 40,
      shape: SHAPES[fin ? (j % 4) : Math.floor(hash(seed, i, 10) * SHAPES.length)], c1: pal[0], c2: pal[1],
    });
  }
  cache.set(seed, list);
  return list;
}

/** The unit launch directions of a burst's sparks [[vx, vy, vz, ring 0|1, glitter 0|1]], deterministic per burst. */
export function directions(b, seed) {
  const out = [];
  if (b.shape === 'ring') {
    for (let k = 0; k < 56; k++) { const a = (k / 56) * Math.PI * 2; out.push([Math.cos(a), Math.cos(a) * 0.2, Math.sin(a), k % 2, 0]); }
  } else if (b.shape === 'heart') {
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2, s = Math.sin(a);
      out.push([(16 * s * s * s) / 17, 0, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17 + 0.12, 0, 0]);
    }
  } else if (b.shape === 'palm') {
    for (let arm = 0; arm < 8; arm++) {
      const th = ((arm + 0.5) / 8) * Math.PI - Math.PI / 2, jitter = (hash(seed, b.i, 20 + arm) - 0.5) * 0.2;    // the arms fan over the top half
      for (let s = 0; s < 7; s++) { const sp = 0.42 + s * 0.1; out.push([Math.sin(th + jitter) * sp, 0.1 * sp, (Math.cos(th + jitter) * 0.8 + 0.25) * sp, 0, s > 4 ? 1 : 0]); }
    }
    for (let k = 0; k < 8; k++) out.push([(hash(seed, b.i, 40 + k) - 0.5) * 0.3, 0, 0.5 + hash(seed, b.i, 50 + k) * 0.3, 1, 1]);   // the stem sparks
  } else {
    for (let k = 0; k < 56; k++) {
      const z = hash(seed, b.i, 60 + k) * 2 - 1, a = hash(seed, b.i, 120 + k) * 6.2832, r = Math.sqrt(1 - z * z), sp = 0.55 + hash(seed, b.i, 180 + k) * 0.45;
      out.push([Math.cos(a) * r * sp, Math.sin(a) * r * sp * 0.5, z * sp, k % 3 === 0 ? 1 : 0, k % 4 === 0 ? 1 : 0]);
    }
  }
  return out;
}

const ease = (s) => 1 - (1 - s) * (1 - s) * (1 - s);
const fade = (a) => Math.pow(clamp01(1 - a / LIFE), 1.15);

/** The sparks (head and short trail) of one burst `age` seconds after it went off. Pure. */
export function burstSparks(b, seed, age) {
  const out = [];
  for (const [vx, vy, vz, ring, glit] of directions(b, seed)) {
    for (let tr = 0; tr < 6; tr++) {                                // head + five older points = a short trail
      const a = age - tr * 0.032;
      if (a < 0) continue;
      const d = b.R * (1 - Math.exp(-DRAG * a));                      // drag: fast at first, then it hangs at the full radius
      let al = fade(a) * (tr ? 0.8 * (1 - tr / 6) : 1);
      if (glit && a > 1.2) al *= 0.45 + 0.55 * Math.sin(a * 38 + vx * 20) ** 2;       // glitter flickers as it dies
      if (al <= 0.01) continue;
      const c = ring ? b.c2 : b.c1;
      out.push({ x: b.bx + vx * d, y: b.by + vy * d, z: b.bz + vz * d - 0.5 * GRAV * a * a, r: c[0], g: c[1], b: c[2], a: al, big: tr === 0 && a < 0.5 ? 1 : 0, tr, age: a });
    }
  }
  return out;
}

/** Everything in the sky at show time t: { rockets, sparks, flashes }. Pure: the same (seed, t) always returns the same lists. */
export function fireworksAt(seed, t) {
  const rockets = [], sparks = [], flashes = [];
  for (const b of schedule(seed)) {
    if (t < b.tl || t > b.tb + LIFE) continue;
    if (t < b.tb) {                                                    // the rocket climbs, leaving a few dim points behind it
      const f = b.tb - b.tl;
      for (let k = 0; k < 4; k++) {
        const s = ease(clamp01((t - b.tl - k * 0.035) / f));
        if (s <= 0) continue;
        rockets.push({ x: b.lx + (b.bx - b.lx) * s, y: b.ly + (b.by - b.ly) * s, z: b.bz * s, a: k === 0 ? 1 : 0.5 / k });
      }
      continue;
    }
    const age = t - b.tb;
    flashes.push({ x: b.bx, y: b.by, z: b.bz, c: b.c1, k: Math.pow(clamp01(1 - age / 2.1), 1.4) });
    for (const sp of burstSparks(b, seed, age)) sparks.push(sp);
  }
  return { rockets, sparks, flashes };
}
