// The beach's art (La Playa): sand and shore tiles, the boardwalk, towels, and the sea (deep water that darkens away from the shore, the break, the shallows), plus the
// upright sprites: palms, beach umbrellas, the lifeguard post and rocks. Every tile function paints one 16 x 16 tile at (x, y) like src/art/ground.js; the sea's moving
// ripples are drawn on top each frame (rippleSpots) in the colour `rippleColour` gives for the tile.
import { P, noise, rect, dot, mix, shadow, canvas } from './palette.js';
import { rippleSpots } from './ground.js';

const C = {
  sand: '#ead9a2', sand2: '#f6ecc4', sandDark: '#d4bd84', wet: '#c9b27a', wet2: '#b69e68',
  deep0: '#1f4182', deep1: '#3978c6', shallow: '#78d2e2', shallow2: '#a8e6e8', foam: '#eaf7ff', reef: '#17346c',
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Plain sand: warm, with a dither of lighter grains, a few darker flecks and now and then a shell. */
export function sand(ctx, x, y, tx, ty) {
  rect(ctx, C.sand, x, y, 16, 16);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if ((i + j) % 2 === 0 && noise(tx * 16 + i, ty * 16 + j, 21) > 0.7) dot(ctx, C.sand2, x + i, y + j);
  for (let k = 0; k < 4; k++) dot(ctx, C.sandDark, x + ((noise(tx, ty, 80 + k) * 15) | 0), y + ((noise(tx, ty, 90 + k) * 15) | 0));
  if (noise(tx, ty, 99) > 0.93) { const sx = x + 3 + ((noise(tx, ty, 98) * 9) | 0), sy = y + 4 + ((noise(tx, ty, 97) * 8) | 0); dot(ctx, P.cream, sx, sy); dot(ctx, P.pink, sx + 1, sy); }
}

/** Wet sand where the last waves reach: darker, with a lacy white edge on the sea side. */
export function shore(ctx, x, y, tx, ty) {
  rect(ctx, C.wet, x, y, 16, 16);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if ((i + j) % 2 === 0 && noise(tx * 16 + i, ty * 16 + j, 22) > 0.62) dot(ctx, C.wet2, x + i, y + j);
  for (let j = 0; j < 16; j++) { const w = 1 + ((noise(tx, ty + j, 23) * 3) | 0); rect(ctx, C.foam, x, y + j, w, 1); if (noise(tx, ty + j, 24) > 0.55) dot(ctx, C.sand2, x + w, y + j); }
  rect(ctx, C.sand, x + 14, y, 2, 16);                                                       // it dries towards the sand
  for (let j = 0; j < 16; j += 2) dot(ctx, C.sand2, x + 15, y + j);
}

/** The boardwalk: planks running along the way, with their seams and nails. */
export function boardwalk(ctx, x, y, tx, ty) {
  rect(ctx, P.w3, x, y, 16, 16);
  for (let r = 0; r < 3; r++) {
    const py = y + r * 5 + (r === 0 ? 0 : 1);
    rect(ctx, r % 2 ? P.w4 : P.w3, x, py, 16, 4);
    rect(ctx, P.w2, x, py + 4, 16, 1);
    rect(ctx, P.w5, x, py, 16, 1);
    const seam = (3 + ((tx * 5 + r * 7) % 9));
    rect(ctx, P.w1, x + seam, py, 1, 4);
    dot(ctx, P.w1, x + 1, py + 1); dot(ctx, P.w1, x + 14, py + 1);
  }
  rect(ctx, P.w2, x, y + 15, 16, 1);
}

/** A beach towel on the sand: striped, with fringes. Red, blue or green by tile. */
export function towel(ctx, x, y, tx, ty) {
  sand(ctx, x, y, tx, ty);
  const pal = [[P.red, P.cream], ['#3f7ad0', P.cream], ['#2fa87a', P.yellow2]][(tx * 3 + ty) % 3];
  shadow(ctx, x + 8, y + 13, 8, 2, 0.18);
  rect(ctx, P.ink, x + 2, y + 3, 12, 10);
  for (let i = 0; i < 10; i++) rect(ctx, pal[i % 2 === 0 ? 0 : 1], x + 3 + i, y + 4, 1, 8);
  for (let j = 4; j < 12; j += 2) dot(ctx, P.cream, x + 3, y + j);
  rect(ctx, pal[0], x + 3, y + 7, 10, 1);
}

/**
 * One tile of the sea: `ch` is 'D' (deep), 'K' (the break), 'l' (shallows) or '%' (the open sea at the edge). Deep water darkens with the distance from the shore
 * (by column), the break is lighter with foam flecks, the shallows are clear turquoise with the sand showing through.
 */
export function sea(ctx, x, y, tx, ty, ch, at) {
  const far = clamp01((20 - tx) / 18);                                                 // 1 at the far edge, 0 near the shore
  const base = ch === '%' ? C.reef : ch === 'l' ? C.shallow : ch === 'K' ? mix(C.deep1, C.shallow, 0.3) : mix(C.deep1, C.deep0, far * far * 0.9 + 0.05);
  rect(ctx, base, x, y, 16, 16);
  const light = ch === 'l' ? C.shallow2 : ch === 'K' ? C.foam : mix(base, '#6bb0f0', 0.22);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if ((i + j) % 2 === 0 && noise(tx * 16 + i, ty * 16 + j, 31) > (ch === 'l' ? 0.55 : 0.68)) dot(ctx, light, x + i, y + j);
  if (ch === 'K') {                                                                    // the break: a lighter band with foam flecks
    for (let k = 0; k < 5; k++) dot(ctx, C.foam, x + ((noise(tx, ty, 40 + k) * 15) | 0), y + ((noise(tx, ty, 50 + k) * 15) | 0));
    if (at && at(-1, 0) === 'D') rect(ctx, mix(C.deep1, C.shallow, 0.55), x, y, 1, 16);
  }
  if (ch === 'l') {
    if (at && at(-1, 0) === 'D') for (let j = 0; j < 16; j++) rect(ctx, mix(C.deep1, C.shallow, 0.55), x, y + j, 1 + ((noise(tx, ty + j, 33) * 2) | 0), 1);   // where the deep water ends
    if (at && at(1, 0) === 'l') { /* inner shallows */ } else if (at && at(1, 0) === 'i') for (let j = 0; j < 16; j++) if (noise(tx, ty + j, 34) > 0.5) rect(ctx, C.foam, x + 13, y + j, 3, 1);
    for (let k = 0; k < 3; k++) dot(ctx, C.sand2, x + ((noise(tx, ty, 60 + k) * 15) | 0), y + ((noise(tx, ty, 70 + k) * 15) | 0));   // the sandy bottom shows through
  }
}

/** The colour of the moving ripples of a sea tile char: pale on the shallows, foam on the break, a lighter blue on the deep water. */
export function rippleColour(ch) {
  return ch === 'l' ? '#e2f8f4' : ch === 'K' ? C.foam : ch === 'D' ? '#6aa8e8' : P.a3;
}
export { rippleSpots };

// ---- upright things ---------------------------------------------------------------------------------------------------------------------------

/** A palm, 32 x 48: a leaning trunk with rings, a crown of drooping fronds and a few coconuts. */
export function palm(seed = 0) {
  const c = canvas(32, 48), ctx = c.getContext('2d');
  const lean = seed % 2 ? 3 : -3;
  const trunk = (t) => ({ x: 15 + lean * t * t, y: 47 - t * 31 });                     // t 0 (foot) .. 1 (crown)
  for (let k = 0; k <= 30; k++) {
    const t = k / 30, p = trunk(t), w = 4 - t * 1.6, px = Math.round(p.x - w / 2), py = Math.round(p.y);
    rect(ctx, P.ink, px - 1, py, Math.round(w) + 2, 2);
    rect(ctx, k % 4 < 2 ? P.w3 : P.w2, px, py, Math.round(w), 2);
    dot(ctx, P.w4, px, py);
  }
  const top = trunk(1), cx = Math.round(top.x), cy = Math.round(top.y);
  const fronds = [[-170, 13], [-140, 15], [-105, 11], [-70, 11], [-40, 15], [-10, 13], [20, 10], [160, 10]];
  const leaf = [P.g1, P.g2, P.g3];
  for (const [deg, len] of fronds) {
    const a = (deg * Math.PI) / 180;
    for (let s = 0; s <= len; s++) {
      const t = s / len, px = cx + Math.cos(a) * s, py = cy - Math.sin(a) * s * 0.7 + t * t * 9;
      const x = Math.round(px), y = Math.round(py);
      rect(ctx, P.gOut, x - 1, y - 1, 3, 3);
    }
    for (let s = 0; s <= len; s++) {
      const t = s / len, px = cx + Math.cos(a) * s, py = cy - Math.sin(a) * s * 0.7 + t * t * 9;
      const x = Math.round(px), y = Math.round(py);
      rect(ctx, leaf[(s + (seed >> 1)) % 3 === 0 ? 0 : s % 2 ? 1 : 2], x - 1, y - 1, 2, 2);
      if (s % 3 === 1 && t > 0.2) dot(ctx, leaf[1], x - 1, y + 1);
    }
  }
  rect(ctx, P.ink, cx - 2, cy, 5, 3); rect(ctx, P.w2, cx - 1, cy, 3, 2);
  for (const [dx, dy] of [[-2, 3], [1, 3]]) { rect(ctx, P.ink, cx + dx - 1, cy + dy, 3, 3); rect(ctx, P.w3, cx + dx, cy + dy, 2, 2); dot(ctx, P.w5, cx + dx, cy + dy); }
  return c;
}

/** A beach umbrella, 24 x 32: a striped canopy on a pole. `seed` picks the colour pair. */
export function umbrella(seed = 0) {
  const c = canvas(24, 32), ctx = c.getContext('2d');
  const pal = [[P.red, P.cream], ['#3f7ad0', P.cream], ['#f0b030', P.cream], ['#2fa87a', P.cream]][seed % 4];
  rect(ctx, P.ink, 11, 10, 3, 22); rect(ctx, P.w4, 12, 10, 1, 22); rect(ctx, P.w2, 13, 10, 1, 22);      // the pole
  rect(ctx, P.ink, 9, 30, 7, 2); rect(ctx, P.w3, 10, 30, 5, 1);
  const cx = 12.5, cy = 11;
  for (let j = 0; j < 11; j++) for (let i = 0; i < 25; i++) {
    const dx = (i - cx) / 12, dy = (j - cy + 0.5) / 9.5, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const edge = d > 0.82 || j === 0;
    const stripe = Math.floor((i + 1) / 4) % 2 === 0;
    rect(ctx, edge ? P.ink : stripe ? pal[0] : pal[1], i - 0, j + 1, 1, 1);
    if (!edge && stripe && j < 4) dot(ctx, P.cream, i, j + 1);
  }
  for (let i = 1; i < 24; i += 4) { dot(ctx, P.ink, i, 12); dot(ctx, i % 8 === 1 ? pal[0] : pal[1], i + 1, 12); }          // the scalloped hem
  dot(ctx, P.ink, 12, 0); dot(ctx, P.ink, 12, 1);
  return c;
}

/** The lifeguard post, 24 x 40: a hut on stilts with a ladder, a red stripe and a flag. */
export function lifeguard() {
  const c = canvas(24, 40), ctx = c.getContext('2d');
  for (const x of [3, 19]) { rect(ctx, P.ink, x, 22, 3, 18); rect(ctx, P.w3, x + 1, 22, 1, 17); }
  rect(ctx, P.ink, 3, 33, 19, 1); rect(ctx, P.w2, 4, 33, 17, 1);                         // the cross brace
  for (let y = 26; y < 40; y += 3) { rect(ctx, P.ink, 10, y, 5, 1); rect(ctx, P.w4, 11, y, 3, 1); }   // the ladder
  rect(ctx, P.ink, 10, 24, 1, 15); rect(ctx, P.ink, 14, 24, 1, 15);
  rect(ctx, P.ink, 1, 20, 22, 4); rect(ctx, P.w4, 2, 21, 20, 2);                         // the platform
  rect(ctx, P.ink, 3, 8, 18, 13); rect(ctx, P.cream, 4, 9, 16, 11);                     // the cabin
  rect(ctx, P.red, 4, 14, 16, 3); rect(ctx, P.red2, 4, 16, 16, 1);
  rect(ctx, P.ink, 6, 10, 6, 4); rect(ctx, P.glass, 7, 11, 4, 2); dot(ctx, P.glassHi, 7, 11);
  rect(ctx, P.ink, 1, 5, 22, 4); rect(ctx, P.red, 2, 6, 20, 2); rect(ctx, '#f06a60', 2, 6, 20, 1);   // the roof
  rect(ctx, P.ink, 12, 0, 1, 6); rect(ctx, P.yellow, 13, 0, 6, 3); rect(ctx, P.ink, 19, 0, 1, 3); rect(ctx, P.orange, 13, 2, 5, 1);    // the flag
  return c;
}

/** Rocks, 16 x 14: a couple of rounded grey boulders with a lit top. */
export function rocks(seed = 0) {
  const c = canvas(16, 14), ctx = c.getContext('2d');
  const blobs = [[7, 8, 7, 5], [12, 10, 4, 3], [3, 10, 3, 3]];
  for (let j = 0; j < 14; j++) for (let i = 0; i < 16; i++) {
    const hit = blobs.find(([cx, cy, rx, ry]) => ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2 <= 1);
    if (!hit) continue;
    const edge = !blobs.some(([cx, cy, rx, ry]) => ((i - cx) / (rx - 1)) ** 2 + ((j - cy) / (ry - 1)) ** 2 <= 1);
    const v = -((i - 5) * 0.5 + (j - 5) * 0.9) / 8 + (noise(i, j, seed + 5) - 0.5) * 0.4;
    dot(ctx, edge ? P.ink : v < -0.35 ? P.s0 : v < 0.05 ? P.s1 : v < 0.4 ? P.s2 : P.s3, i, j);
  }
  return c;
}
