// The beach's art (La Playa): sand and shore tiles, the boardwalk, towels, and the sea (deep water that darkens away from the shore, the break, the shallows), plus the
// upright sprites: palms, beach umbrellas, the lifeguard post and rocks. Every tile function paints one 16 x 16 tile at (x, y) like src/art/ground.js; the sea's moving
// ripples are drawn on top each frame (rippleSpots) in the colour `rippleColour` gives for the tile.
import { P, noise, rect, dot, mix, shadow, canvas } from './palette.js';
import { rippleSpots } from './ground.js';
import { shallowFrom, BEACH } from '../map.js';

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

/** A beach towel on the sand: striped with fringed ends, a rolled edge, a folded corner and a little shadow. Red, blue or green by tile. */
export function towel(ctx, x, y, tx, ty) {
  sand(ctx, x, y, tx, ty);
  const pal = [[P.red, P.cream, P.red2], ['#3f7ad0', P.cream, '#2a56a0'], ['#2fa87a', P.yellow2, '#1f7a58']][(tx * 3 + ty) % 3];
  shadow(ctx, x + 8, y + 13, 8, 2, 0.2);
  rect(ctx, P.ink, x + 1, y + 3, 14, 10);
  for (let i = 0; i < 10; i++) rect(ctx, pal[i % 2 === 0 ? 0 : 1], x + 3 + i, y + 4, 1, 8);                  // the stripes
  rect(ctx, pal[2], x + 3, y + 11, 10, 1);                                                                       // the shaded lower edge
  rect(ctx, P.cream, x + 3, y + 4, 10, 1);                                                                       // the rolled edge, lit
  for (let j = 4; j < 12; j += 2) { dot(ctx, pal[0], x + 2, y + j); dot(ctx, pal[0], x + 13, y + j); }          // the fringe at both ends
  rect(ctx, pal[1], x + 3, y + 7, 10, 1); rect(ctx, pal[2], x + 3, y + 8, 10, 1);                              // a band across
  for (const [i, j] of [[10, 4], [11, 4], [11, 5], [12, 4]]) dot(ctx, P.cream, x + i, y + j + 1);              // a folded corner
  dot(ctx, P.ink, x + 12, y + 6);
  if ((tx + ty) % 2) { rect(ctx, P.ink, x + 4, y + 5, 3, 2); dot(ctx, P.glassHi, x + 5, y + 5); }              // sunglasses left on one
}

/**
 * One tile of the sea: `ch` is 'D' (deep), 'K' (the break), 'l' (shallows) or '%' (the open sea at the edge). Deep water darkens with the distance from the shore
 * (by column), the break is lighter with foam flecks, the shallows are clear turquoise with the sand showing through.
 */
export function sea(ctx, x, y, tx, ty, ch, at) {
  const e = shallowFrom(ty), far = clamp01((e - tx) / (e - 2));                                                 // 1 at the far edge, 0 near the shore
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

/** A palm, 56 x 88 (about 1.8 times the first one): a tall leaning trunk with lit and shaded sides and ringed bark, a crown of long fronds with midribs and leaflets, and coconuts. */
export function palm(seed = 0) {
  const c = canvas(56, 88), ctx = c.getContext('2d');
  const lean = seed % 2 ? 6 : -6;
  const trunk = (t) => ({ x: 27 + lean * t * t, y: 87 - t * 62 });                     // t 0 (foot) .. 1 (crown)
  for (let k = 0; k <= 62; k++) {
    const t = k / 62, p = trunk(t), w = Math.round(7 - t * 2.6), px = Math.round(p.x - w / 2), py = Math.round(p.y);
    rect(ctx, P.ink, px - 1, py, w + 2, 2);
    rect(ctx, P.w2, px, py, w, 2);
    rect(ctx, P.w4, px, py, Math.max(1, w >> 2), 2);                                    // the lit side
    rect(ctx, P.w1, px + w - Math.max(1, w >> 2), py, Math.max(1, w >> 2), 2);          // the shaded side
    if (k % 5 === 0) { rect(ctx, P.w0, px, py, w, 1); rect(ctx, P.w5, px, py + 1, Math.max(1, w >> 1), 1); }      // a ring of the bark: dark line with a light edge under it
    else if (noise(k, seed, 4) > 0.8) dot(ctx, P.w0, px + 1 + (k % 3), py);              // a crack
  }
  rect(ctx, P.ink, 20, 85, 16, 3); rect(ctx, P.w2, 21, 85, 14, 2); rect(ctx, P.w4, 21, 85, 5, 1);            // the foot flares into roots
  for (const rx of [19, 35]) { rect(ctx, P.ink, rx, 86, 3, 2); dot(ctx, P.w3, rx + 1, 86); }
  const top = trunk(1), cx = Math.round(top.x), cy = Math.round(top.y);
  const fronds = [[-172, 25], [-142, 28], [-108, 21], [-72, 21], [-38, 28], [-8, 25], [24, 19], [158, 19]];
  for (const [deg, len] of fronds) {
    const a = (deg * Math.PI) / 180;
    const at = (s) => { const t = s / len; return [Math.round(cx + Math.cos(a) * s), Math.round(cy - Math.sin(a) * s * 0.7 + t * t * 17)]; };
    const lit = deg < -90 && deg > -180 ? 0 : 1;                                         // the fronds on the left catch the light
    for (let s = 0; s <= len; s++) { const [x, y] = at(s); rect(ctx, P.gOut, x - 2, y - 2, 4, 4); }
    for (let s = 0; s <= len; s++) {
      const [x, y] = at(s), t = s / len, [nx, ny] = [-Math.sin(a), -Math.cos(a)];
      rect(ctx, lit ? P.g3 : P.g2, x - 1, y - 1, 3, 3);                                  // the blade
      if (s % 2 === 0 && t > 0.1 && t < 0.97) {                                          // leaflets on both sides of the midrib, drooping
        const l = Math.round(2 + 3 * (1 - Math.abs(t - 0.45)));
        dot(ctx, lit ? P.g4 : P.g3, x + Math.round(nx * l), y + 2 + Math.round(ny * l * 0.4));
        dot(ctx, lit ? P.g1 : P.g0, x - Math.round(nx * l), y + 2 - Math.round(ny * l * 0.4) + 1);
      }
      if (s % 3 === 0) dot(ctx, P.g1, x, y);                                              // the midrib
      if (t > 0.88) dot(ctx, P.g5, x, y - 1);                                             // a bright tip
    }
  }
  rect(ctx, P.ink, cx - 4, cy, 9, 5); rect(ctx, P.w2, cx - 3, cy, 7, 4); rect(ctx, P.w4, cx - 3, cy, 3, 1);
  for (const [dx, dy] of [[-3, 5], [2, 5], [0, 8]]) {                                    // the coconuts: round, with a lit top and a shaded underside
    rect(ctx, P.ink, cx + dx - 2, cy + dy - 1, 6, 6); rect(ctx, P.w2, cx + dx - 1, cy + dy, 4, 4);
    rect(ctx, P.w1, cx + dx - 1, cy + dy + 3, 4, 1); rect(ctx, P.w5, cx + dx - 1, cy + dy, 2, 1); dot(ctx, P.cream, cx + dx - 1, cy + dy);
  }
  return c;
}

const RED = '#e8484e', RED_LIT = '#f47a74', RED_DK = '#b8343e', RED_TIP = '#8a2634', CREAM = '#fbe8c8', CREAM_LIT = '#fff6e2', CREAM_DK = '#e3c4a0', CREAM_TIP = '#b89478';
const WOOD = '#a8602c', WOOD_LIT = '#d68e5a', WOOD_DK = '#6b3421', INK = '#2a2033';
const mixHex = (a, b, t) => mix(a, b, t);

/**
 * A beach umbrella, 36 x 48, in the style of the reference (odd/refs/beach-chair-ref.png): a domed canopy of red and cream panels, the left lit and the right in shade with a darker
 * band along the hem, a scalloped hem with darker tips, a wooden finial, and a ringed wooden pole on a small square wooden base. `seed` 1 gives a blue and cream one, the others red.
 */
export function umbrella(seed = 0) {
  const c = canvas(36, 48), ctx = c.getContext('2d');
  const blue = seed % 4 === 1, main = blue ? '#3f78d0' : RED, lit = blue ? '#6ea4ec' : RED_LIT, dk = blue ? '#2a56a0' : RED_DK, tip = blue ? '#1d3f78' : RED_TIP;
  // the pole: wood with rings, and the square base
  rect(ctx, INK, 15, 20, 6, 24); rect(ctx, WOOD, 16, 20, 4, 24); rect(ctx, WOOD_LIT, 16, 20, 1, 24); rect(ctx, WOOD_DK, 19, 20, 1, 24);
  for (const y of [25, 29, 33, 37, 41]) { rect(ctx, WOOD_DK, 16, y, 4, 1); rect(ctx, WOOD_LIT, 16, y + 1, 2, 1); }
  rect(ctx, INK, 10, 43, 16, 5); rect(ctx, WOOD, 11, 44, 14, 3); rect(ctx, WOOD_LIT, 11, 44, 14, 1); rect(ctx, WOOD_DK, 11, 46, 14, 1);          // the base: lit top edge, dark front
  rect(ctx, WOOD_DK, 13, 45, 1, 1); rect(ctx, WOOD_DK, 22, 45, 1, 1);                                                                           // its nails
  // the canopy: eight panels, lit on the left, shaded on the right, a darker band along the hem
  const cx = 17.5, cy = 20, rx = 17.5, ry = 16.5, hem = 20;
  for (let j = 3; j <= hem; j++) for (let i = 0; i < 36; i++) {
    const dx = (i + 0.5 - 18) / rx, dy = (cy - j - 0.5) / ry;
    if (dy < 0 || dx * dx + dy * dy > 1) continue;
    const edge = dx * dx + dy * dy > 0.88 || j === 3, ang = Math.atan2(dy * ry, dx * rx), k = Math.min(7, Math.floor(((Math.PI - ang) / Math.PI) * 8)), cream = k % 2 === 1;
    let col = cream ? CREAM : main;
    if (i < 12) col = cream ? CREAM_LIT : lit;
    else if (i > 23) col = cream ? CREAM_DK : dk;
    if (j >= hem - 3) col = cream ? CREAM_DK : dk;                                                                                              // the hem band is in shadow
    if (j <= 6 && i > 10 && i < 22) col = cream ? CREAM_LIT : lit;                                                                              // the top catches the light
    rect(ctx, edge ? INK : col, i, j, 1, 1);
  }
  for (let i = 0; i < 36; i++) {                                                                                                                  // the scalloped hem with darker tips
    const sIdx = Math.floor(i / 6), s = i % 6, depth = Math.round(2.6 * Math.sin((Math.PI * (s + 0.5)) / 6)), cream = sIdx % 2 === 0, body = cream ? CREAM_DK : dk, tp = cream ? CREAM_TIP : tip;
    for (let d = 1; d <= depth; d++) rect(ctx, d === depth ? tp : body, i, hem + d, 1, 1);
    rect(ctx, INK, i, hem + depth + 1, 1, 1);
    if (s === 0 || s === 5) rect(ctx, INK, i, hem + 1, 1, Math.max(1, depth));
  }
  rect(ctx, INK, 16, 0, 4, 4); rect(ctx, WOOD, 17, 1, 2, 2); dot(ctx, WOOD_LIT, 17, 1);                                                          // the wooden finial
  return c;
}

/**
 * A deck chair, 32 x 26, in the style of the reference: a slanted back of red and cream striped fabric between wooden rails, a striped sling seat, crossed wooden legs with bolts, a
 * wooden crossbar at the front, a dark outline. It faces left (the back rises on the right) and the seat is centred on column 13. `seed` is unused (all are red and cream).
 */
export function lounger(seed = 0) {
  const c = canvas(32, 26), ctx = c.getContext('2d');
  const thick = (x0, y0, x1, y1, col, w) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let k = 0; k <= n; k++) { const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n); rect(ctx, col, x, y, w, w); } };
  const legs = [[4, 20, 1, 25], [19, 20, 27, 25], [27, 18, 20, 25]];                                 // the front leg and the crossed pair behind
  for (const [x0, y0, x1, y1] of legs) thick(x0 - 1, y0 - 1, x1 - 1, y1 - 1, INK, 4);
  for (const [x0, y0, x1, y1] of legs) { thick(x0, y0, x1, y1, WOOD, 2); thick(x0, y0, x1, y1, WOOD_LIT, 1); }
  // the sling seat: stripes across, from the front crossbar to the back, sagging a little
  for (let i = 4; i <= 20; i++) { const sag = Math.round(Math.sin(((i - 4) / 16) * Math.PI) * 1.5); rect(ctx, INK, i, 15 + sag, 1, 1); rect(ctx, ((i >> 1) % 2) ? CREAM : RED, i, 16 + sag, 1, 3); rect(ctx, ((i >> 1) % 2) ? CREAM_DK : RED_DK, i, 19 + sag, 1, 1); rect(ctx, INK, i, 20 + sag, 1, 1); }
  // the back: striped fabric between two wooden rails, slanting up to the right
  for (let t = 0; t <= 16; t++) {
    const xr = 20 + Math.round((10 * t) / 16), y = 19 - t;
    rect(ctx, INK, xr + 2, y, 1, 1); rect(ctx, WOOD, xr, y, 2, 1); rect(ctx, WOOD_LIT, xr, y, 1, 1);                       // the right rail
    for (let k = 1; k <= 7; k++) rect(ctx, (k >> 1) % 2 ? CREAM : RED, xr - k, y, 1, 1);                                     // the fabric, stripes running along it
    rect(ctx, RED_DK, xr - 7, y, 1, 1);
    rect(ctx, WOOD, xr - 9, y, 2, 1); rect(ctx, WOOD_LIT, xr - 9, y, 1, 1); rect(ctx, INK, xr - 10, y, 1, 1);               // the left rail
    if (t === 0 || t === 16) rect(ctx, INK, xr - 9, y + (t === 0 ? 1 : -1), 12, 1);                                           // the ends of the fabric
  }
  rect(ctx, INK, 28, 2, 4, 3); rect(ctx, WOOD, 29, 3, 2, 1);                                                                // the head of the back
  rect(ctx, INK, 1, 17, 6, 6); rect(ctx, WOOD, 2, 18, 4, 4); rect(ctx, WOOD_LIT, 2, 18, 4, 1); rect(ctx, WOOD_DK, 2, 21, 4, 1);   // the crossbar at the front, lit on top
  for (const [x, y] of [[30, 3], [23, 22], [3, 19]]) rect(ctx, '#3a3a48', x, y, 2, 2);                                      // the bolts
  return c;
}

/** A small wooden side table with a coconut drink (a striped straw and an orange slice), 14 x 16, as in the reference. */
export function sideTable() {
  const c = canvas(14, 16), ctx = c.getContext('2d');
  for (const x of [2, 10]) { rect(ctx, INK, x, 10, 3, 6); rect(ctx, WOOD, x + 1, 10, 1, 5); rect(ctx, WOOD_LIT, x, 10, 1, 5); }              // the legs
  rect(ctx, INK, 1, 8, 12, 4); rect(ctx, WOOD, 2, 8, 10, 3); rect(ctx, WOOD_LIT, 2, 8, 10, 1); rect(ctx, WOOD_DK, 2, 10, 10, 1);          // the top
  rect(ctx, INK, 3, 3, 8, 6); rect(ctx, '#7a4a28', 4, 4, 6, 4); rect(ctx, '#9a6a3c', 4, 4, 2, 3); rect(ctx, P.cream, 4, 3, 6, 1);                 // the coconut: shell and white rim
  rect(ctx, '#d8a868', 5, 3, 4, 1);
  for (let k = 0; k < 6; k++) { rect(ctx, INK, 8 + (k >> 1), 6 - k - 1, 2, 1); rect(ctx, k % 2 ? P.cream : RED, 8 + (k >> 1), 5 - k, 1, 1); }  // the straw
  rect(ctx, INK, 2, 1, 4, 4); rect(ctx, '#f0902e', 3, 2, 2, 2); dot(ctx, '#ffd060', 3, 2);                                                      // the orange slice on the rim
  return c;
}

/** A small tuft of beach grass, 9 x 7. */
export function tuft() {
  const c = canvas(9, 7), ctx = c.getContext('2d');
  for (const [x, h, col] of [[1, 4, P.g1], [3, 6, P.g2], [4, 7, P.g3], [5, 5, P.g2], [7, 4, P.g1]]) { rect(ctx, P.gOut, x, 7 - h - 1, 1, 1); rect(ctx, col, x, 7 - h, 1, h); }
  rect(ctx, P.g0, 2, 6, 5, 1);
  return c;
}

/** The lifeguard post, 24 x 40: a hut on stilts, planked and shaded on its right, with a lifebuoy, a glinting window, a rope ladder and a striped flag. */
export function lifeguard() {
  const c = canvas(24, 40), ctx = c.getContext('2d');
  for (const x of [3, 19]) { rect(ctx, P.ink, x, 22, 3, 18); rect(ctx, P.w4, x + 1, 22, 1, 17); rect(ctx, P.w1, x + 2, 22, 1, 17); }
  rect(ctx, P.ink, 3, 33, 19, 1); rect(ctx, P.w2, 4, 33, 17, 1);                         // the cross brace
  for (let k = 0; k < 7; k++) { dot(ctx, P.ink, 4 + k, 24 + k); dot(ctx, P.ink, 19 - k, 24 + k); }
  for (let y = 26; y < 40; y += 3) { rect(ctx, P.ink, 10, y, 5, 1); rect(ctx, P.w4, 11, y, 3, 1); rect(ctx, P.w1, 11, y + 1, 3, 1); }   // the ladder rungs
  rect(ctx, P.ink, 10, 24, 1, 15); rect(ctx, P.ink, 14, 24, 1, 15);
  rect(ctx, P.ink, 1, 20, 22, 4); rect(ctx, P.w4, 2, 21, 20, 2); rect(ctx, P.w5, 2, 21, 20, 1); rect(ctx, P.w2, 2, 23, 20, 1);          // the platform, lit on its top edge
  rect(ctx, P.ink, 3, 8, 18, 13); rect(ctx, P.cream, 4, 9, 16, 11);                     // the cabin
  for (let x = 6; x < 20; x += 3) rect(ctx, P.cream3, x, 9, 1, 11);                      // the planks
  rect(ctx, P.cream3, 17, 9, 3, 11); rect(ctx, P.cream4, 19, 9, 1, 11);                  // the shaded side
  rect(ctx, P.red, 4, 14, 16, 3); rect(ctx, P.red2, 4, 16, 16, 1); rect(ctx, '#f06a60', 4, 14, 16, 1);
  rect(ctx, P.ink, 6, 10, 6, 4); rect(ctx, P.glass, 7, 11, 4, 2); dot(ctx, P.glassHi, 7, 11); dot(ctx, P.glassHi, 8, 12);                 // the window and its glint
  rect(ctx, P.ink, 14, 10, 5, 4); rect(ctx, P.cream, 15, 11, 3, 2); dot(ctx, P.red, 16, 11); dot(ctx, P.red, 16, 12);                     // a lifebuoy on the wall
  rect(ctx, P.ink, 1, 5, 22, 4); rect(ctx, P.red, 2, 6, 20, 2); rect(ctx, '#f06a60', 2, 6, 20, 1);                                      // the roof
  for (let x = 4; x < 22; x += 4) rect(ctx, P.cream, x, 6, 2, 2);                        // its stripes
  rect(ctx, P.red2, 2, 8, 20, 1);                                                          // the shadow under the eaves
  rect(ctx, P.ink, 12, 0, 1, 6); rect(ctx, P.yellow, 13, 0, 6, 3); rect(ctx, P.ink, 19, 0, 1, 3); rect(ctx, P.orange, 13, 2, 5, 1); rect(ctx, P.red, 15, 0, 1, 2);   // the flag
  return c;
}

/** Rocks, 16 x 14: rounded boulders cut by facets, lit on the upper left, a wet dark foot, a little moss and a crack. */
export function rocks(seed = 0) {
  const c = canvas(16, 14), ctx = c.getContext('2d');
  const blobs = [[7, 8, 7, 5], [12, 10, 4, 3], [3, 10, 3, 3]];
  for (let j = 0; j < 14; j++) for (let i = 0; i < 16; i++) {
    const k = blobs.findIndex(([cx, cy, rx, ry]) => ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2 <= 1);
    if (k < 0) continue;
    const [cx, cy, rx, ry] = blobs[k];
    const edge = !blobs.some(([bx, by, brx, bry]) => ((i - bx) / (brx - 1)) ** 2 + ((j - by) / (bry - 1)) ** 2 <= 1);
    const facet = ((i - cx) * 0.7 + (j - cy)) / (ry + 1);                                // a diagonal facet plane splits each boulder
    let v = -((i - cx + 2) * 0.5 + (j - cy + 2) * 0.9) / (rx + ry) * 1.6 + (noise(i, j, seed + 5) - 0.5) * 0.3;
    if (facet > 0.15) v -= 0.45;                                                          // the facet turned away from the light
    let col = v < -0.55 ? P.s0 : v < -0.2 ? P.s1 : v < 0.1 ? P.s2 : v < 0.4 ? P.s3 : P.s4;
    if (j > cy + ry - 2) col = P.s0;                                                      // the wet dark foot
    dot(ctx, edge ? P.ink : col, i, j);
  }
  for (const [i, j] of [[5, 5], [6, 4], [4, 6]]) if (seed % 2 === 0) dot(ctx, P.g2, i, j);   // moss on the top of one
  for (const [i, j] of [[8, 7], [9, 8], [9, 9]]) dot(ctx, P.s0, i, j);                       // a crack
  dot(ctx, P.s5, 5, 5); dot(ctx, P.s5, 6, 5); dot(ctx, P.s5, 11, 8);                         // glints on the lit edges
  return c;
}

// ---- sparse scatter on the sand ---------------------------------------------------------------------------------------------------------------------

/** Where the small things lie, in tiles: kind, tile column and row, and a pixel offset inside the tile. Footprints are painted on the ground, the rest are upright props. */
const OLD = [
  { kind: 'shell', x: 25, y: 8, dx: 4, dy: 9 }, { kind: 'shell', x: 26, y: 19, dx: 9, dy: 5 }, { kind: 'shell', x: 28, y: 27, dx: 3, dy: 8 }, { kind: 'shell', x: 38, y: 14, dx: 10, dy: 7 },
  { kind: 'starfish', x: 27, y: 14, dx: 6, dy: 6 }, { kind: 'starfish', x: 29, y: 30, dx: 5, dy: 8 },
  { kind: 'castle', x: 27, y: 27, dx: 2, dy: 12 },
  { kind: 'bucket', x: 31, y: 23, dx: 4, dy: 12 },
  { kind: 'ball', x: 34, y: 28, dx: 8, dy: 11 },
  { kind: 'table', x: 31, y: 6, dx: 1, dy: 15 }, { kind: 'table', x: 40, y: 13, dx: 1, dy: 15 }, { kind: 'table', x: 43, y: 25, dx: 1, dy: 15 },   // side tables with a drink beside some deck chairs
  { kind: 'tuft', x: 31, y: 7, dx: 6, dy: 14 }, { kind: 'tuft', x: 43, y: 7, dx: 4, dy: 14 }, { kind: 'tuft', x: 35, y: 32, dx: 3, dy: 13 },
  { kind: 'shell', x: 33, y: 7, dx: 6, dy: 6 }, { kind: 'shell', x: 43, y: 26, dx: 9, dy: 8 }, { kind: 'starfish', x: 42, y: 7, dx: 5, dy: 9 }, { kind: 'starfish', x: 35, y: 33, dx: 8, dy: 5 },
  { kind: 'prints', x: 30, y: 17, dx: 0, dy: 0 }, { kind: 'prints', x: 28, y: 18, dx: 0, dy: 0 },
].map((e) => ({ ...e, x: e.x + 14, y: e.y + 4 })).filter((e) => !(e.x >= BEACH.court.x && e.x < BEACH.court.x + BEACH.court.w && e.y >= BEACH.court.y && e.y < BEACH.court.y + BEACH.court.h));                                          // the first beach's things, shifted with the sea and the rows added
export const SCATTER = [
  ...OLD,
  ...[10, 17, 25, 30, 35, 3, 22, 39].map((y) => ({ kind: 'weed', x: shallowFrom(y) + 4, y, dx: 0, dy: 0 })),         // on the wet sand at the waterline
  { kind: 'court', x: BEACH.court.x, y: BEACH.court.y, dx: 0, dy: 0 }, { kind: 'vball', x: 55, y: 12, dx: 5, dy: 9 },                          // the volleyball court's lines, and the ball by the net
  { kind: 'shell', x: 42, y: 2, dx: 5, dy: 8 }, { kind: 'shell', x: 52, y: 33, dx: 8, dy: 4 }, { kind: 'shell', x: 60, y: 38, dx: 3, dy: 7 }, { kind: 'shell', x: 47, y: 40, dx: 9, dy: 9 },
  { kind: 'starfish', x: 41, y: 22, dx: 6, dy: 6 }, { kind: 'starfish', x: 56, y: 40, dx: 5, dy: 6 },
  { kind: 'tuft', x: 58, y: 3, dx: 4, dy: 14 }, { kind: 'tuft', x: 52, y: 25, dx: 5, dy: 13 }, { kind: 'tuft', x: 63, y: 29, dx: 3, dy: 14 }, { kind: 'tuft', x: 45, y: 41, dx: 6, dy: 13 },
  { kind: 'bucket', x: 61, y: 19, dx: 6, dy: 12 }, { kind: 'ball', x: 60, y: 31, dx: 7, dy: 11 },
  { kind: 'prints', x: 56, y: 20, dx: 0, dy: 0 }, { kind: 'prints', x: 41, y: 33, dx: 0, dy: 0 },
];

/** Paints the flat things of the scatter into the ground (shells, starfish, seaweed at the waterline and footprints leading to the boardwalk). `raw(x, y)` gives a tile's char. */
export function scatterGround(ctx) {
  for (const s of SCATTER) {
    const x = s.x * 16 + s.dx, y = s.y * 16 + s.dy;
    if (s.kind === 'shell') { rect(ctx, P.ink, x, y, 4, 3); rect(ctx, P.pink, x + 1, y, 2, 2); dot(ctx, P.cream, x + 1, y); dot(ctx, P.red2, x + 2, y + 1); }
    else if (s.kind === 'starfish') {
      const arms = [[0, -2], [2, -1], [1, 2], [-1, 2], [-2, -1]];
      for (const [ax, ay] of arms) { dot(ctx, P.ink, x + Math.round(ax * 1.5), y + Math.round(ay * 1.5)); }
      for (const [ax, ay] of [[0, 0], ...arms]) dot(ctx, P.orange, x + ax, y + ay);
      dot(ctx, P.yellow, x, y); dot(ctx, P.red2, x - 1, y + 1);
    } else if (s.kind === 'weed') {
      const x0 = s.x * 16 + 8;                                                          // a tangle of seaweed on the wet sand: dark green strands with a lighter edge
      for (let k = 0; k < 5; k++) {
        const bx = x0 + k * 2 - 4, by = s.y * 16 + 3 + k * 2;
        for (let j = 0; j < 7; j++) { const wx = bx + Math.round(Math.sin((j + k) * 0.9) * 1.5); dot(ctx, P.g0, wx, by + j); if (j % 2 === 0) dot(ctx, P.g1, wx + 1, by + j); }
        dot(ctx, P.g2, bx, by);
      }
      for (const [dx, dy] of [[-4, 1], [3, 6], [6, 2]]) dot(ctx, P.ink2, x0 + dx, s.y * 16 + 4 + dy);
    } else if (s.kind === 'court') {                                                       // the volleyball court: pale lines on the sand, an outer rectangle, a line across each half
      const x0 = s.x * 16 + 6, y0 = s.y * 16 + 5, cw = 9 * 16 - 12, ch = 5 * 16 - 10, ln = '#fbf2d2';
      rect(ctx, ln, x0, y0, cw, 1); rect(ctx, ln, x0, y0 + ch - 1, cw, 1); rect(ctx, ln, x0, y0, 1, ch); rect(ctx, ln, x0 + cw - 1, y0, 1, ch);
      rect(ctx, ln, x0, y0 + 14, cw, 1); rect(ctx, ln, x0, y0 + ch - 15, cw, 1);
    } else if (s.kind === 'prints') {                                                    // footprints: pairs of dents in the sand walking towards the boardwalk
      for (let k = 0; k < 4; k++) {
        const px = s.x * 16 + 1 + k * 4, py = s.y * 16 + 5 + (k % 2) * 4;
        rect(ctx, '#bda468', px, py, 3, 2); dot(ctx, '#bda468', px + 3, py); dot(ctx, '#f6ecc4', px, py - 1);
      }
    }
  }
}

/** The upright small props: a sandcastle (12 x 12), a bucket with a spade (10 x 10) and a beach ball (8 x 8), each with its shaded side and highlight. */
export function sandcastle() {
  const c = canvas(14, 12), ctx = c.getContext('2d');
  rect(ctx, P.ink, 1, 6, 12, 6); rect(ctx, '#d4bd84', 2, 7, 10, 4); rect(ctx, '#f6ecc4', 2, 7, 4, 4); rect(ctx, '#b89c62', 9, 7, 3, 4);       // the wall, lit left, shaded right
  for (const x of [1, 5, 9]) { rect(ctx, P.ink, x, 3, 4, 4); rect(ctx, '#d4bd84', x + 1, 4, 2, 3); dot(ctx, '#f6ecc4', x + 1, 4); }          // the battlements
  rect(ctx, P.ink, 5, 0, 4, 4); rect(ctx, '#e8d8a0', 6, 1, 2, 3); rect(ctx, P.red, 7, 0, 3, 1); dot(ctx, P.ink, 6, 8);                    // the tower and a little flag
  rect(ctx, P.ink2, 6, 8, 2, 3);                                                                                                           // the door
  return c;
}
export function bucket() {
  const c = canvas(12, 10), ctx = c.getContext('2d');
  rect(ctx, P.ink, 1, 3, 8, 7); rect(ctx, '#e0485a', 2, 4, 6, 5); rect(ctx, '#f06a60', 2, 4, 2, 5); rect(ctx, P.red2, 7, 4, 1, 5); rect(ctx, P.yellow, 2, 6, 6, 1);   // the bucket
  rect(ctx, P.ink, 1, 2, 8, 1); rect(ctx, P.s4, 2, 2, 6, 1); dot(ctx, P.ink, 0, 1); dot(ctx, P.ink, 9, 1); rect(ctx, P.s2, 1, 0, 8, 1);                          // the rim and the handle
  for (let k = 0; k < 6; k++) { dot(ctx, P.ink, 8 + (k >> 1), 9 - k); dot(ctx, P.w3, 9 + (k >> 1), 9 - k); }                                                    // the spade leaning on it
  rect(ctx, P.ink, 10, 3, 2, 2); rect(ctx, P.w4, 10, 3, 1, 1);
  return c;
}
export function beachBall() {
  const c = canvas(10, 10), ctx = c.getContext('2d');
  for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) {
    const dx = (i - 4.5) / 4.5, dy = (j - 4.5) / 4.5, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const edge = d > 0.7, sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 6) % 6;
    let col = [P.red, P.cream, '#3f7ad0', P.cream, P.yellow, P.cream][sector];
    if (dx + dy > 0.5) col = ['#a8404a', '#c6a294', '#2a56a0', '#c6a294', '#c88a1c', '#c6a294'][sector];       // the shaded lower right
    dot(ctx, edge ? P.ink : col, i, j);
  }
  dot(ctx, '#ffffff', 3, 2); dot(ctx, '#ffffff', 2, 3);                                                          // the highlight
  return c;
}

// ---- the things of the second beach -----------------------------------------------------------------------------------------------------------------

/** One tile of the pier: the sea (or the wet sand) under it, then planks running east-west with seams and nails; the top row of the pier has a rail, the bottom one a shadow on the water and posts every few tiles. */
export function pier(ctx, x, y, tx, ty, at) {
  const e = shallowFrom(ty);
  if (tx < e) sea(ctx, x, y, tx, ty, 'D', at); else if (tx < e + 4) sea(ctx, x, y, tx, ty, 'l', at); else shore(ctx, x, y, tx, ty);
  const top = at && at(0, -1) !== '1', bottom = at && at(0, 1) !== '1', end = at && at(-1, 0) !== '1';
  if (bottom) { ctx.globalAlpha = 0.28; rect(ctx, P.ink2, x, y + 14, 16, 2); ctx.globalAlpha = 1; }
  const y0 = top ? y + 3 : y, h = (top ? 13 : 16) - (bottom ? 3 : 0);
  rect(ctx, P.w3, x, y0, 16, h);
  for (let r = 0; r * 5 < h; r++) {                                                       // the planks: lit top edge, dark seam under
    const py = y0 + r * 5;
    rect(ctx, r % 2 ? P.w4 : P.w3, x, py, 16, 4); rect(ctx, P.w5, x, py, 16, 1); rect(ctx, P.w1, x, Math.min(py + 4, y0 + h - 1), 16, 1);
    const seam = 2 + ((tx * 7 + r * 5) % 12); rect(ctx, P.w1, x + seam, py, 1, 4);
    dot(ctx, P.w0, x + 1, py + 1); dot(ctx, P.w0, x + 14, py + 2);
  }
  if (top) { rect(ctx, P.w1, x, y + 1, 16, 2); rect(ctx, P.w4, x, y + 1, 16, 1); if (tx % 4 === 0) { rect(ctx, P.w0, x + 6, y - 1, 3, 4); rect(ctx, P.w3, x + 6, y - 1, 2, 3); } }   // the rail, with a post every four tiles
  if (bottom && tx % 4 === 2) { rect(ctx, P.w0, x + 5, y + 12, 3, 4); rect(ctx, P.w2, x + 5, y + 12, 2, 3); }
  if (end) { rect(ctx, P.w0, x, y0, 1, h); rect(ctx, P.w1, x + 1, y0, 1, h); }
}

/** A tide pool: wet sand with a rim of dark rocks round a small pool of clear water with a sparkle and, now and then, a starfish. Solid: walked around. */
export function tidePool(ctx, x, y, tx, ty) {
  sand(ctx, x, y, tx, ty);
  const cx = 8 + ((noise(tx, ty, 11) * 2 - 1) | 0), cy = 9, rx = 6.4, ry = 4.6;
  shadow(ctx, x + 8, y + 14, 8, 2, 0.2);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d > 1.55) continue;
    if (d > 1) { dot(ctx, noise(tx * 16 + i, ty * 16 + j, 61) > 0.45 ? P.s1 : P.s0, x + i, y + j); continue; }                // the rocky rim
    dot(ctx, d > 0.72 ? P.a0 : d > 0.4 ? '#3f9ec0' : '#6cc3d8', x + i, y + j);                                                 // the water, deeper towards the rim
  }
  for (const [i, j] of [[5, 8], [6, 8], [9, 10]]) dot(ctx, P.a4, x + i, y + j);                                                 // glints
  for (const [i, j] of [[3, 5], [12, 6], [10, 14], [4, 13]]) rect(ctx, P.s2, x + i, y + j, 2, 2);                               // small rocks about
  if ((tx + ty) % 3 === 0) { dot(ctx, P.orange, x + 8, y + 10); dot(ctx, P.orange, x + 7, y + 10); dot(ctx, P.orange, x + 9, y + 10); dot(ctx, P.yellow, x + 8, y + 9); dot(ctx, P.orange, x + 8, y + 11); }
}

/** The volleyball net's post: a pole with a red cap and a dark foot, 16 x 34. */
export function netPost() {
  const c = canvas(16, 34), ctx = c.getContext('2d');
  rect(ctx, P.ink, 6, 2, 4, 32); rect(ctx, '#e8e2d0', 7, 3, 2, 30); rect(ctx, '#bdb7a4', 8, 3, 1, 30); rect(ctx, P.cream, 7, 3, 1, 30);
  rect(ctx, P.ink, 5, 0, 6, 4); rect(ctx, P.red, 6, 1, 4, 2); dot(ctx, '#f47a74', 6, 1);
  for (const y of [8, 22]) rect(ctx, P.s2, 6, y, 4, 1);                                  // the straps that hold the net
  rect(ctx, P.ink, 4, 31, 8, 3); rect(ctx, P.s1, 5, 31, 6, 2);                            // the foot, in the sand
  return c;
}
/** A tile of the volleyball net: a white tape along the top, a dark mesh below it, 16 x 22 (the posts on both sides line up with its ends). */
export function netMesh() {
  const c = canvas(16, 22), ctx = c.getContext('2d');
  rect(ctx, P.ink, 0, 4, 16, 14); rect(ctx, P.cream, 0, 5, 16, 3); rect(ctx, '#d9d2b8', 0, 7, 16, 1);       // the top tape
  for (let j = 8; j < 17; j++) for (let i = 0; i < 16; i++) if ((i + j) % 3 === 0) dot(ctx, '#e8e2d0', i, j);        // the mesh: a lattice of light knots on dark
  rect(ctx, P.ink, 0, 17, 16, 1); rect(ctx, P.cream, 0, 17, 16, 1); ctx.globalAlpha = 0.5; rect(ctx, P.cream, 0, 17, 16, 1); ctx.globalAlpha = 1;   // the bottom cord
  return c;
}
/** A volleyball, 8 x 8: white with blue and yellow panels. */
export function volleyball() {
  const c = canvas(9, 9), ctx = c.getContext('2d');
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const dx = (i - 4) / 4, dy = (j - 4) / 4, d = dx * dx + dy * dy;
    if (d > 1) continue;
    let col = d > 0.72 ? P.ink : Math.abs(dx - dy) < 0.32 ? '#3f7ad0' : Math.abs(dx + dy) < 0.32 ? P.yellow : P.cream;
    if (col === P.cream && dx + dy > 0.4) col = '#d9c9ac';
    dot(ctx, col, i, j);
  }
  dot(ctx, '#ffffff', 2, 2);
  return c;
}

/** A beach cabana, 3 x 2 tiles (48 wide, 46 tall; its foot is the bottom edge): striped walls, a pitched roof with a lit edge, a wooden door, a shuttered window and a step. `seed` 1 is blue and white, otherwise red and white. */
export function hut(seed = 0) {
  const c = canvas(48, 46), ctx = c.getContext('2d'), blue = seed % 2 === 1;
  const main = blue ? '#3f78d0' : RED, lit = blue ? '#6ea4ec' : RED_LIT, dk = blue ? '#2a56a0' : RED_DK;
  rect(ctx, INK, 3, 17, 42, 28); rect(ctx, CREAM, 4, 18, 40, 26);
  for (let i = 0; i < 20; i++) rect(ctx, i % 2 ? CREAM : main, 4 + i * 2, 18, 2, 26);                      // vertical stripes on the walls
  rect(ctx, CREAM_DK, 4, 40, 40, 4); rect(ctx, WOOD_DK, 4, 43, 40, 1);                                      // the shaded foot
  rect(ctx, INK, 19, 24, 12, 21); rect(ctx, WOOD, 20, 25, 10, 20); rect(ctx, WOOD_LIT, 20, 25, 1, 20); rect(ctx, WOOD_DK, 29, 25, 1, 20);   // the door
  for (const y of [29, 35]) rect(ctx, WOOD_DK, 21, y, 8, 1);
  dot(ctx, P.yellow, 27, 35);
  rect(ctx, INK, 7, 25, 9, 9); rect(ctx, '#8ccbff', 8, 26, 7, 7); rect(ctx, '#d6efff', 8, 26, 3, 3); rect(ctx, WOOD, 11, 26, 1, 7); rect(ctx, WOOD, 8, 29, 7, 1);   // the window
  rect(ctx, INK, 34, 25, 9, 9); rect(ctx, WOOD, 35, 26, 7, 7); for (const y of [27, 29, 31]) rect(ctx, WOOD_DK, 35, y, 7, 1);                           // a shuttered one
  rect(ctx, INK, 16, 44, 18, 2); rect(ctx, WOOD_LIT, 17, 44, 16, 1);                                       // the step
  for (let j = 0; j < 17; j++) {                                                                            // the roof: a trapezoid, rows from the ridge to the eave
    const inset = Math.round((16 - j) * 0.9), x0 = 1 + inset, x1 = 47 - inset;
    rect(ctx, INK, x0, j, x1 - x0, 1);
    if (j > 0 && j < 16) { rect(ctx, j % 4 < 2 ? main : lit, x0 + 1, j, x1 - x0 - 2, 1); rect(ctx, dk, x1 - 6 - Math.round((16 - j) * 0.2), j, 5 + Math.round((16 - j) * 0.2), 1); }
  }
  rect(ctx, INK, 0, 16, 48, 3); rect(ctx, lit, 1, 16, 46, 1); rect(ctx, dk, 1, 17, 46, 1);              // the eave, lit on top
  rect(ctx, INK, 22, 0, 4, 3); rect(ctx, P.cream, 23, 0, 2, 2);                                             // the ridge cap
  return c;
}

/** The bonfire ring, 24 x 22: a ring of grey stones round crossed logs and a tall flame (orange, yellow and white at the heart), a little ash and a few embers. */
export function bonfire() {
  const c = canvas(24, 22), ctx = c.getContext('2d');
  for (const [x, y] of [[1, 15], [4, 18], [8, 19], [13, 19], [17, 18], [20, 15], [18, 12], [4, 12]]) { rect(ctx, INK, x, y, 5, 4); rect(ctx, P.s2, x + 1, y + 1, 3, 2); dot(ctx, P.s4, x + 1, y + 1); }       // the stones
  rect(ctx, INK, 4, 14, 16, 4); rect(ctx, '#3a2a28', 5, 15, 14, 2);                                                                // the ash bed
  for (let k = 0; k < 14; k++) { dot(ctx, INK, 5 + k, 16 - (k >> 2)); dot(ctx, P.w1, 5 + k, 15 - (k >> 2)); dot(ctx, INK, 18 - k, 16 - (k >> 2)); dot(ctx, P.w2, 18 - k, 15 - (k >> 2)); }   // two crossed logs
  const flame = [[12, 0, 1], [11, 2, 3], [10, 4, 5], [9, 6, 7], [8, 8, 9], [8, 10, 9], [9, 12, 7]];                                  // [x, y, width] of the outer flame, rows of 2
  for (const [x, y, w] of flame) { rect(ctx, '#e8531c', x, y, w, 2); rect(ctx, '#ff9a2e', x + 1, y + 1, Math.max(1, w - 2), 1); }
  rect(ctx, '#ffd24a', 10, 6, 4, 6); rect(ctx, '#fff2a0', 11, 8, 2, 4); dot(ctx, '#ffffff', 11, 10);
  for (const [x, y] of [[6, 9], [17, 7], [14, 2], [9, 3]]) dot(ctx, '#ffb347', x, y);                                                  // embers
  return c;
}

/**
 * The Kiosco, 4 x 2 tiles (64 wide, 62 tall: its foot is the bottom edge): a small stand with a striped awning that overhangs the front, a counter with a few treats on it, and shelves
 * and a menu board behind. The counter is the row of tiles south of it.
 */
export function kiosk() {
  const c = canvas(64, 62), ctx = c.getContext('2d');
  rect(ctx, INK, 3, 14, 58, 48); rect(ctx, '#e9d4a6', 4, 15, 56, 46);                                       // the back wall (light wood)
  for (let i = 0; i < 14; i++) rect(ctx, i % 2 ? '#e1c995' : '#ecd9ae', 4 + i * 4, 15, 4, 46);
  rect(ctx, INK, 6, 28, 22, 18); rect(ctx, '#6b3421', 7, 29, 20, 16);                                        // a shelf unit with bottles and cones on it
  for (const y of [36, 44]) rect(ctx, WOOD_LIT, 7, y, 20, 1);
  for (const [x, col] of [[9, '#e0485a'], [13, '#3f7ad0'], [17, '#2fa87a'], [21, '#ffcb6b']]) { rect(ctx, INK, x, 31, 3, 5); rect(ctx, col, x, 32, 3, 4); rect(ctx, P.cream, x, 30, 3, 2); }
  for (const [x, col] of [[10, '#f4a8c0'], [16, '#fbe8c8'], [22, '#a8683a']]) { rect(ctx, INK, x, 38, 3, 6); rect(ctx, '#d8a868', x, 41, 3, 3); rect(ctx, col, x, 38, 3, 3); }
  rect(ctx, INK, 36, 24, 22, 20); rect(ctx, '#2f4a3a', 37, 25, 20, 18); rect(ctx, '#f0e6c8', 40, 29, 14, 1); rect(ctx, '#f0e6c8', 40, 33, 11, 1); rect(ctx, '#f0e6c8', 40, 37, 13, 1);      // the menu board
  rect(ctx, P.yellow, 38, 28, 2, 2); rect(ctx, P.pink, 38, 32, 2, 2); rect(ctx, '#8ccbff', 38, 36, 2, 2);
  rect(ctx, INK, 0, 47, 64, 15); rect(ctx, WOOD, 1, 48, 62, 13); rect(ctx, WOOD_LIT, 1, 48, 62, 3); rect(ctx, WOOD_DK, 1, 58, 62, 3);       // the counter: lit top edge, dark front
  for (let i = 0; i < 6; i++) rect(ctx, WOOD_DK, 10 + i * 10, 52, 1, 6);                                      // its planks
  for (const [x, col] of [[6, '#f4a8c0'], [30, '#3f7ad0']]) { rect(ctx, INK, x, 42, 7, 7); rect(ctx, col, x + 1, 43, 5, 5); dot(ctx, '#ffffff', x + 1, 43); }   // treats on the counter: a cup and a bottle
  rect(ctx, INK, 46, 40, 5, 9); rect(ctx, '#ffffff', 47, 41, 3, 7); rect(ctx, '#7a4a28', 47, 41, 3, 3); dot(ctx, P.red, 48, 45);                                  // a coconut drink and a straw
  for (let i = 0; i < 64; i += 8) {                                                                          // the awning: red and cream stripes with a scalloped hem
    for (let k = 0; k < 8; k++) { const col = (i / 8) % 2 ? CREAM : RED; rect(ctx, col, i + k, 2, 1, 12); }
    rect(ctx, (i / 8) % 2 ? CREAM_DK : RED_DK, i, 12, 8, 2);
    for (let k = 0; k < 8; k++) { const d = Math.round(2.4 * Math.sin((Math.PI * (k + 0.5)) / 8)); rect(ctx, (i / 8) % 2 ? CREAM_DK : RED_DK, i + k, 14, 1, d); rect(ctx, INK, i + k, 14 + d, 1, 1); }
  }
  rect(ctx, INK, 0, 0, 64, 2); rect(ctx, RED_LIT, 0, 1, 64, 1); rect(ctx, INK, 0, 11, 64, 1); rect(ctx, RED_LIT, 0, 2, 64, 1);
  rect(ctx, INK, 0, 14, 3, 48); rect(ctx, WOOD, 1, 14, 1, 46); rect(ctx, INK, 61, 14, 3, 48); rect(ctx, WOOD, 62, 14, 1, 46);               // the posts at the corners
  return c;
}

/**
 * The surf stand, 3 x 2 tiles (48 wide, 46 tall; its foot is the bottom edge): a small wooden hut with a sloped roof and a "Surf" sign, a counter at the front and three boards leaning
 * on its side (one with a stripe). The counter is the row of tiles south of it.
 */
export function surfShop() {
  const c = canvas(48, 46), ctx = c.getContext('2d');
  rect(ctx, INK, 6, 16, 38, 30); rect(ctx, WOOD, 7, 17, 36, 28);                                          // the plank walls
  for (let i = 0; i < 9; i++) rect(ctx, WOOD_DK, 11 + i * 4, 17, 1, 28);
  rect(ctx, INK, 12, 28, 26, 12); rect(ctx, '#2c1a18', 13, 29, 24, 10);                                    // the dark serving window
  rect(ctx, INK, 9, 38, 32, 7); rect(ctx, WOOD_LIT, 10, 39, 30, 2); rect(ctx, WOOD_DK, 10, 42, 30, 2);      // the counter
  rect(ctx, INK, 2, 3, 44, 14); rect(ctx, '#2a9bb0', 3, 4, 42, 11); rect(ctx, '#58c7d8', 3, 4, 42, 2); rect(ctx, '#1d7a8e', 3, 13, 42, 2);   // the roof, teal
  rect(ctx, INK, 11, 0, 26, 10); rect(ctx, P.cream, 12, 1, 24, 8);                                         // the sign board
  const GLYPH = { S: ['111', '100', '111', '001', '111'], U: ['101', '101', '101', '101', '111'], R: ['111', '101', '111', '110', '101'], F: ['111', '100', '110', '100', '100'] };
  [...'SURF'].forEach((ch, i) => GLYPH[ch].forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') rect(ctx, '#1d7a8e', 14 + i * 6 + x, 2 + y, 1, 1); })));   // "Surf" in 3 x 5 pixel letters
  for (const [x, col] of [[36, '#e0485a'], [40, '#ffcb6b'], [44, '#3f7ad0']]) {                             // boards leaning on the right side
    rect(ctx, INK, x - 1, 14, 5, 31); rect(ctx, col, x, 15, 3, 29); rect(ctx, P.cream, x, 28, 3, 2);
  }
  return c;
}
