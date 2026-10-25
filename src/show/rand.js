// A stateless seeded hash: the same (seed, a, b, c) always gives the same number in [0, 1). The show is a pure function of
// (seed, t), so nothing here keeps state between frames and two players with the same seed see the same sky.
export function hash(seed, a = 0, b = 0, c = 0) {
  let h = (seed | 0) ^ 0x9e3779b9;
  for (const v of [a, b, c]) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b); h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, k) => a + (b - a) * k;
/** 0..1 ease in and out (smoothstep). */
export const smooth = (x) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
