// The town's ground tiles, 16 x 16 px each: dithered grass, dirt and stone paths with edges and corners, the pond's shore, flower beds,
// hedges, fences, benches and signs. Every function paints one tile at (x, y) (pixels); `at(dx, dy)` answers the neighbours' chars.
import { P, noise, rect, dot, shadow } from './palette.js';

const SURFACE = '=+mE';                       // chars that belong to a walkable surface: no border between them
const FLOWER_COLOURS = [P.red, P.pink, P.yellow, P.cream, P.a3, P.lilac];

export function grass(ctx, x, y, tx, ty, flowers = false) {
  rect(ctx, P.g3, x, y, 16, 16);
  const v = noise(tx, ty, 1);
  if (v > 0.45) {                              // a dithered patch of the darker green (checkerboard, like the classic 16-bit lawns)
    const px = 1 + ((noise(tx, ty, 2) * 6) | 0), py = 1 + ((noise(tx, ty, 3) * 6) | 0), w = 5 + ((noise(tx, ty, 4) * 5) | 0), h = 4 + ((noise(tx, ty, 5) * 5) | 0);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((i + j) % 2 === 0) dot(ctx, P.g2, x + px + i, y + py + j);
  }
  if (v < 0.3) for (let i = 0; i < 4; i++) dot(ctx, P.g4, x + ((noise(tx, ty, 10 + i) * 15) | 0), y + ((noise(tx, ty, 20 + i) * 15) | 0));
  for (let i = 0; i < 3; i++) {                // blades: a little "v"
    const bx = x + 2 + ((noise(tx, ty, 30 + i) * 12) | 0), by = y + 3 + ((noise(tx, ty, 40 + i) * 11) | 0);
    dot(ctx, P.g2, bx, by); dot(ctx, P.g2, bx - 1, by - 1); dot(ctx, P.g2, bx + 1, by - 1);
  }
  if (flowers) for (let i = 0; i < 2; i++) {
    const fx = x + 2 + ((noise(tx, ty, 50 + i) * 11) | 0), fy = y + 3 + ((noise(tx, ty, 60 + i) * 10) | 0);
    const c = FLOWER_COLOURS[(noise(tx, ty, 70 + i) * FLOWER_COLOURS.length) | 0];
    dot(ctx, c, fx, fy - 1); dot(ctx, c, fx - 1, fy); dot(ctx, c, fx + 1, fy); dot(ctx, c, fx, fy + 1); dot(ctx, P.yellow2, fx, fy);
  }
}

const same = (c) => SURFACE.includes(c) || c === 'H';

/** Dirt path. Open sides (grass, hedges...) get a darker rim, open corners are rounded. */
export function path(ctx, x, y, tx, ty, at) {
  const open = { u: !same(at(0, -1)), d: !same(at(0, 1)), l: !same(at(-1, 0)), r: !same(at(1, 0)) };
  grass(ctx, x, y, tx, ty);
  const x0 = open.l ? 1 : 0, x1 = open.r ? 15 : 16, y0 = open.u ? 1 : 0, y1 = open.d ? 15 : 16;
  rect(ctx, P.d2, x, y, 16, 16);
  // clear the grass ring outside the rim
  const clear = (cx, cy, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dot(ctx, noise(tx * 16 + cx + i, ty * 16 + cy + j, 7) > 0.5 ? P.g3 : P.g2, x + cx + i, y + cy + j); };
  if (open.u) clear(0, 0, 16, 1); if (open.d) clear(0, 15, 16, 1);
  if (open.l) clear(0, 0, 1, 16); if (open.r) clear(15, 0, 1, 16);
  for (let i = 0; i < 6; i++) dot(ctx, noise(tx, ty, i) > 0.5 ? P.d1 : P.d3, x + 1 + ((noise(tx, ty, 10 + i) * 14) | 0), y + 1 + ((noise(tx, ty, 20 + i) * 14) | 0));
  for (let i = 0; i < 2; i++) { const px = x + 2 + ((noise(tx, ty, 30 + i) * 11) | 0), py = y + 2 + ((noise(tx, ty, 40 + i) * 12) | 0); rect(ctx, P.d1, px, py, 2, 1); dot(ctx, P.d4, px, py - 1); }
  const rim = (a, b, c, d) => rect(ctx, P.d0, x + a, y + b, c, d);
  if (open.u) { rim(x0 ? 1 : 0, 1, (x1 - x0), 1); for (let i = 1; i < 15; i += 2) dot(ctx, P.d1, x + i, y + 2); }
  if (open.d) { rim(x0 ? 1 : 0, 14, (x1 - x0), 1); for (let i = 1; i < 15; i += 2) dot(ctx, P.d1, x + i, y + 13); }
  if (open.l) { rim(1, y0 ? 1 : 0, 1, (y1 - y0)); }
  if (open.r) { rim(14, y0 ? 1 : 0, 1, (y1 - y0)); }
  const round = (cx, cy, ox, oy) => { clear(cx, cy, 2, 2); dot(ctx, P.d0, x + cx + ox, y + cy + oy); };
  if (open.u && open.l) round(0, 0, 1, 1); if (open.u && open.r) round(14, 0, 0, 1);
  if (open.d && open.l) round(0, 14, 1, 0); if (open.d && open.r) round(14, 14, 0, 0);
  // an inner corner: the grass bites into the dirt
  const notch = (cx, cy) => { rect(ctx, P.g3, x + cx, y + cy, 2, 2); dot(ctx, P.d0, x + (cx ? cx - 1 : 2), y + cy); dot(ctx, P.d0, x + cx, y + (cy ? cy - 1 : 2)); };
  if (!open.u && !open.l && !same(at(-1, -1))) notch(0, 0);
  if (!open.u && !open.r && !same(at(1, -1))) notch(14, 0);
  if (!open.d && !open.l && !same(at(-1, 1))) notch(0, 14);
  if (!open.d && !open.r && !same(at(1, 1))) notch(14, 14);
}

/** Paving stones in running bond, with a curb where the plaza meets the grass. */
export function plaza(ctx, x, y, tx, ty, at) {
  rect(ctx, P.s3, x, y, 16, 16);
  for (let row = 0; row < 2; row++) {
    const off = ((ty * 2 + row) % 2) * 4;
    for (let k = -1; k < 3; k++) {
      const bx = k * 8 + off, by = row * 8;
      const shade = noise(tx * 2 + k, ty * 2 + row, 3);
      const c = shade > 0.7 ? P.s4 : shade < 0.25 ? '#a9afbf' : P.s3;
      for (let i = Math.max(0, bx); i < Math.min(16, bx + 7); i++) for (let j = 0; j < 7; j++) dot(ctx, c, x + i, y + by + j);
      if (bx >= 0 && bx < 16) for (let j = 0; j < 7; j++) dot(ctx, P.s5, x + bx, y + by + j);
      for (let i = Math.max(0, bx); i < Math.min(16, bx + 7); i++) dot(ctx, P.s5, x + i, y + by);
      if (bx + 7 >= 0 && bx + 7 < 16) rect(ctx, P.s2, x + bx + 7, y + by, 1, 8);
      rect(ctx, P.s2, x + Math.max(0, bx), y + by + 7, Math.min(16, bx + 8) - Math.max(0, bx), 1);
    }
  }
  if (noise(tx, ty, 9) > 0.8) { dot(ctx, P.s1, x + 5, y + 4); dot(ctx, P.s1, x + 6, y + 4); }
  const open = { u: !same(at(0, -1)) && at(0, -1) !== 'B', d: !same(at(0, 1)), l: !same(at(-1, 0)), r: !same(at(1, 0)) };
  if (open.u) { rect(ctx, P.s1, x, y, 16, 1); rect(ctx, P.s5, x, y + 1, 16, 1); }
  if (open.d) { rect(ctx, P.s1, x, y + 15, 16, 1); rect(ctx, P.s0, x, y + 14, 16, 1); }
  if (open.l) { rect(ctx, P.s1, x, y, 1, 16); rect(ctx, P.s5, x + 1, y, 1, 16); }
  if (open.r) { rect(ctx, P.s1, x + 15, y, 1, 16); rect(ctx, P.s0, x + 14, y, 1, 16); }
}

export function mat(ctx, x, y, tx, ty, at) {
  path(ctx, x, y, tx, ty, at);
  rect(ctx, P.ink, x + 2, y + 3, 12, 10);
  rect(ctx, P.red2, x + 3, y + 4, 10, 8);
  for (let i = 0; i < 10; i += 2) rect(ctx, P.w3, x + 3 + i, y + 4, 1, 8);
  rect(ctx, P.w4, x + 3, y + 7, 10, 1);
}

/** Pond water: still part (shore, deep rim); the ripples are drawn on top each frame (rippleSpots). */
export function pond(ctx, x, y, tx, ty, at) {
  const w = (dx, dy) => at(dx, dy) === '~';
  grass(ctx, x, y, tx, ty);
  const o = { u: !w(0, -1), d: !w(0, 1), l: !w(-1, 0), r: !w(1, 0) };
  const x0 = o.l ? 2 : 0, x1 = o.r ? 14 : 16, y0 = o.u ? 2 : 0, y1 = o.d ? 14 : 16;
  rect(ctx, P.sand, x, y, 16, 16);                                           // the beach strip
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) if ((i + j) % 2 && noise(tx * 16 + i, ty * 16 + j, 8) > 0.5) dot(ctx, P.cream, x + i, y + j);
  if (o.u) rect(ctx, P.g3, x, y, 16, 1); if (o.d) rect(ctx, P.g3, x, y + 15, 16, 1);
  if (o.l) rect(ctx, P.g3, x, y, 1, 16); if (o.r) rect(ctx, P.g3, x + 15, y, 1, 16);
  rect(ctx, P.a1, x + x0, y + y0, x1 - x0, y1 - y0);
  // darker deep water towards the middle, lighter close to the shore
  rect(ctx, P.a0, x + x0 + (o.l ? 1 : 0), y + y0 + (o.u ? 1 : 0), 16, 1);
  if (o.u) rect(ctx, P.a2, x + x0, y + y0 + 1, x1 - x0, 1);
  if (o.l) rect(ctx, P.a2, x + x0, y + y0, 1, y1 - y0);
  if (o.d) rect(ctx, P.a0, x + x0, y + y1 - 1, x1 - x0, 1);
  if (o.r) rect(ctx, P.a0, x + x1 - 1, y + y0, 1, y1 - y0);
  // round the open corners
  const cut = (cx, cy) => { rect(ctx, P.sand, x + cx, y + cy, 2, 2); };
  if (o.u && o.l) cut(2, 2); if (o.u && o.r) cut(12, 2); if (o.d && o.l) cut(2, 12); if (o.d && o.r) cut(12, 12);
}

/** The ripples of a pond tile on a frame (0-2): short light dashes that drift. Returns [x, y, w] triplets in the tile. */
export function rippleSpots(tx, ty, frame) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const bx = 2 + ((noise(tx, ty, 100 + i) * 9) | 0), by = 3 + i * 4 + ((noise(tx, ty, 110 + i) * 2) | 0);
    out.push([(bx + frame * (i % 2 ? -1 : 1) + 16) % 12 + 2, by, 3 + (i % 2)]);
  }
  return out;
}

export function flowerbed(ctx, x, y, tx, ty, at) {
  const left = at(-1, 0) === 'B', right = at(1, 0) === 'B';
  rect(ctx, P.w1, x, y + 2, 16, 13); rect(ctx, P.w2, x + (left ? 0 : 1), y + 3, 16 - (left ? 0 : 1) - (right ? 0 : 1), 11);
  rect(ctx, P.w0, x + (left ? 0 : 2), y + 4, 12 + (left ? 2 : 0) + (right ? 2 : 0), 9);       // the dark soil
  rect(ctx, P.w3, x, y + 2, 16, 1);
  if (!left) rect(ctx, P.w3, x, y + 2, 1, 13); if (!right) rect(ctx, P.w1, x + 15, y + 2, 1, 13);
  rect(ctx, P.ink, x, y + 15, 16, 1);
  const palette = [[P.red, P.red2], [P.pink, P.red], [P.yellow, P.orange], [P.cream, P.cream4]];
  const pair = palette[(noise(tx >> 1, ty, 5) * palette.length) | 0];
  for (const fx of [2, 7, 12]) for (const fy of [5, 9]) {
    const [petal, shade] = noise(tx * 3 + fx, ty * 2 + fy, 6) > 0.8 ? palette[(noise(tx, ty, 9 + fx) * 4) | 0] : pair;
    dot(ctx, P.g1, x + fx + 1, y + fy + 3); dot(ctx, P.g2, x + fx, y + fy + 3);              // leaf under it
    dot(ctx, petal, x + fx + 1, y + fy - 1); dot(ctx, petal, x + fx, y + fy); dot(ctx, petal, x + fx + 2, y + fy); dot(ctx, petal, x + fx + 1, y + fy + 1);
    dot(ctx, P.yellow2, x + fx + 1, y + fy); dot(ctx, shade, x + fx + 1, y + fy + 2);
  }
}

export function hedge(ctx, x, y, tx, ty, at) {
  const l = at(-1, 0) === 'h', r = at(1, 0) === 'h', u = at(0, -1) === 'h', d = at(0, 1) === 'h';
  const x0 = l ? 0 : 1, x1 = r ? 16 : 15, y0 = u ? 0 : 3, y1 = d ? 16 : 15;
  rect(ctx, P.gOut, x + x0, y + y0, x1 - x0, y1 - y0);
  rect(ctx, P.g0, x + x0 + (l ? 0 : 1), y + y0 + (u ? 0 : 1), x1 - x0 - (l ? 0 : 1) - (r ? 0 : 1), y1 - y0 - (u ? 0 : 1) - (d ? 0 : 1));
  for (let j = y0 + 1; j < y1 - 1; j++) for (let i = x0 + 1; i < x1 - 1; i++) {
    const n = noise(tx * 16 + i, ty * 16 + j, 4);
    if (n > 0.8) dot(ctx, P.g2, x + i, y + j); else if (n > 0.55 && (i + j) % 2 === 0) dot(ctx, P.g1, x + i, y + j);
  }
  if (!u) for (let i = x0 + 1; i < x1 - 1; i += 3) dot(ctx, P.g4, x + i, y + y0 + 1);
  if (!l) { dot(ctx, P.g0, x + 1, y + y0); }
  shadow(ctx, x + 9, y + 16, 8, 1.5, 0.25);
}

export function fence(ctx, x, y, tx, ty, at) {
  const f = (dx, dy) => at(dx, dy) === 'F' || at(dx, dy) === 'S';
  const l = f(-1, 0), r = f(1, 0), u = f(0, -1), d = f(0, 1);
  shadow(ctx, x + 8, y + 15, 7, 1.5, 0.25);
  if (l || r) for (const ry of [6, 11]) {
    rect(ctx, P.w1, x + (l ? 0 : 7), y + ry, (l ? 8 : 0) + (r ? 8 : 0) + (l || !r ? 0 : 0) + (l && r ? 0 : 1), 3);
    rect(ctx, P.w3, x + (l ? 0 : 7), y + ry, (l ? 8 : 0) + (r ? 8 : 0) + 1, 1);
    rect(ctx, P.w2, x + (l ? 0 : 7), y + ry + 1, (l ? 8 : 0) + (r ? 8 : 0) + 1, 1);
  }
  if (u || d) { rect(ctx, P.w2, x + 7, y + (u ? 0 : 4), 2, 16 - (u ? 0 : 4)); rect(ctx, P.w3, x + 7, y + (u ? 0 : 4), 1, 16 - (u ? 0 : 4)); }
  rect(ctx, P.ink, x + 6, y + 3, 4, 1); rect(ctx, P.w4, x + 7, y + 4, 2, 1);                       // the post
  rect(ctx, P.w2, x + 6, y + 4, 4, 11); rect(ctx, P.w3, x + 6, y + 4, 1, 11); rect(ctx, P.w1, x + 9, y + 4, 1, 11);
  rect(ctx, P.w4, x + 7, y + 3, 2, 1); rect(ctx, P.ink, x + 6, y + 15, 4, 1);
}

export function bench(ctx, x, y, tx, ty) {
  shadow(ctx, x + 8, y + 14, 8, 2, 0.3);
  rect(ctx, P.ink, x + 1, y + 3, 14, 5); rect(ctx, P.w3, x + 2, y + 4, 12, 1); rect(ctx, P.w2, x + 2, y + 5, 12, 1); rect(ctx, P.w3, x + 2, y + 6, 12, 1);   // back
  rect(ctx, P.ink, x + 1, y + 8, 14, 5); rect(ctx, P.w4, x + 2, y + 9, 12, 1); rect(ctx, P.w3, x + 2, y + 10, 12, 1); rect(ctx, P.w2, x + 2, y + 11, 12, 1);   // seat
  rect(ctx, P.ink, x + 2, y + 13, 2, 2); rect(ctx, P.ink, x + 12, y + 13, 2, 2);                                    // legs
  rect(ctx, P.navy, x + 1, y + 7, 2, 2); rect(ctx, P.navy, x + 13, y + 7, 2, 2);                                    // iron arms
}

export function sign(ctx, x, y) {
  shadow(ctx, x + 9, y + 15, 5, 1.5, 0.3);
  rect(ctx, P.w1, x + 7, y + 8, 3, 8); rect(ctx, P.w3, x + 7, y + 8, 1, 8);
  rect(ctx, P.ink, x + 2, y + 1, 12, 9); rect(ctx, P.w4, x + 3, y + 2, 10, 7); rect(ctx, P.w3, x + 3, y + 5, 10, 1); rect(ctx, P.w5, x + 3, y + 2, 10, 1);
  rect(ctx, P.w2, x + 4, y + 4, 8, 1); rect(ctx, P.w2, x + 4, y + 7, 8, 1);
}
