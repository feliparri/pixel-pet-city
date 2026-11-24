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

/** A palm, 56 x 88 (about 1.8 times the first one): a tall leaning trunk with rings, a crown of long drooping fronds and a few coconuts. */
export function palm(seed = 0) {
  const c = canvas(56, 88), ctx = c.getContext('2d');
  const lean = seed % 2 ? 6 : -6;
  const trunk = (t) => ({ x: 27 + lean * t * t, y: 87 - t * 62 });                     // t 0 (foot) .. 1 (crown)
  for (let k = 0; k <= 62; k++) {
    const t = k / 62, p = trunk(t), w = 6.4 - t * 2.4, px = Math.round(p.x - w / 2), py = Math.round(p.y);
    rect(ctx, P.ink, px - 1, py, Math.round(w) + 2, 2);
    rect(ctx, k % 6 < 3 ? P.w3 : P.w2, px, py, Math.round(w), 2);
    dot(ctx, P.w4, px, py);
    if (k % 6 === 0) rect(ctx, P.w1, px, py, Math.round(w), 1);                        // the rings of the trunk
  }
  rect(ctx, P.ink, 22, 85, 12, 3); rect(ctx, P.w2, 23, 85, 10, 2);                    // the foot
  const top = trunk(1), cx = Math.round(top.x), cy = Math.round(top.y);
  const fronds = [[-172, 25], [-142, 28], [-108, 21], [-72, 21], [-38, 28], [-8, 25], [24, 19], [158, 19]];
  const leaf = [P.g1, P.g2, P.g3];
  for (const [deg, len] of fronds) {
    const a = (deg * Math.PI) / 180;
    const at = (s) => { const t = s / len; return [Math.round(cx + Math.cos(a) * s), Math.round(cy - Math.sin(a) * s * 0.7 + t * t * 17)]; };
    for (let s = 0; s <= len; s++) { const [x, y] = at(s); rect(ctx, P.gOut, x - 2, y - 2, 4, 4); }
    for (let s = 0; s <= len; s++) {
      const [x, y] = at(s), t = s / len;
      rect(ctx, leaf[(s + (seed >> 1)) % 4 === 0 ? 0 : s % 2 ? 1 : 2], x - 1, y - 1, 3, 3);
      if (s % 3 === 1 && t > 0.15) { dot(ctx, leaf[1], x - 2, y + 2); dot(ctx, leaf[0], x + 2, y + 2); }      // the leaflets
    }
  }
  rect(ctx, P.ink, cx - 4, cy, 9, 5); rect(ctx, P.w2, cx - 3, cy, 7, 4);
  for (const [dx, dy] of [[-3, 5], [2, 5], [-0, 7]]) { rect(ctx, P.ink, cx + dx - 2, cy + dy, 5, 5); rect(ctx, P.w3, cx + dx - 1, cy + dy + 1, 3, 3); dot(ctx, P.w5, cx + dx - 1, cy + dy + 1); }
  return c;
}

/** A beach umbrella, 36 x 48 (1.5 times the first one): a striped canopy on a pole. `seed` picks the colour pair. */
export function umbrella(seed = 0) {
  const c = canvas(36, 48), ctx = c.getContext('2d');
  const pal = [[P.red, P.cream], ['#3f7ad0', P.cream], ['#f0b030', P.cream], ['#2fa87a', P.cream]][seed % 4];
  rect(ctx, P.ink, 16, 15, 4, 33); rect(ctx, P.w4, 17, 15, 1, 33); rect(ctx, P.w2, 18, 15, 1, 33);      // the pole
  rect(ctx, P.ink, 13, 45, 10, 3); rect(ctx, P.w3, 14, 45, 8, 1);
  const cx = 18.5, cy = 16.5;
  for (let j = 0; j < 17; j++) for (let i = 0; i < 37; i++) {
    const dx = (i - cx) / 18, dy = (j - cy + 0.5) / 15, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const edge = d > 0.86 || j === 0;
    const stripe = Math.floor((i + 1) / 6) % 2 === 0;
    rect(ctx, edge ? P.ink : stripe ? pal[0] : pal[1], i, j + 1, 1, 1);
    if (!edge && stripe && j < 6) dot(ctx, P.cream, i, j + 1);
  }
  for (let i = 1; i < 36; i += 6) { rect(ctx, P.ink, i, 18, 2, 1); rect(ctx, i % 12 === 1 ? pal[0] : pal[1], i + 2, 18, 3, 1); }          // the scalloped hem
  rect(ctx, P.ink, 18, 0, 1, 2);
  return c;
}

/** A lounger (deck chair), 28 x 18: a wooden frame, a striped cushion and a raised back at one end. `seed` picks the colours. */
export function lounger(seed = 0) {
  const c = canvas(28, 18), ctx = c.getContext('2d');
  const pal = [[P.red, P.cream], ['#3f7ad0', P.cream], ['#2fa87a', P.yellow2]][seed % 3];
  rect(ctx, P.ink, 4, 14, 3, 4); rect(ctx, P.ink, 21, 14, 3, 4); rect(ctx, P.w3, 5, 14, 1, 3); rect(ctx, P.w3, 22, 14, 1, 3);            // the legs
  rect(ctx, P.ink, 3, 10, 23, 5); rect(ctx, P.w4, 4, 11, 21, 3);                                                                      // the frame
  for (let i = 0; i < 21; i++) rect(ctx, i % 6 < 3 ? pal[0] : pal[1], 4 + i, 10, 1, 4);                                              // the cushion
  rect(ctx, P.ink, 3, 9, 23, 1); rect(ctx, P.w2, 4, 14, 21, 1);
  for (let k = 0; k < 7; k++) { rect(ctx, P.ink, 2 + k, 9 - k, 8, 1); rect(ctx, P.ink, 2 + k, 9 - k, 1, 2); rect(ctx, k % 2 ? pal[1] : pal[0], 3 + k, 9 - k, 6, 1); }   // the raised back
  rect(ctx, P.ink, 2, 3, 8, 1);
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
