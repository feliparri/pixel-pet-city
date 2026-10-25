// The tall things that the town's ground art paints flat (hedges, fences, benches, flower beds, the fountain's rim), redrawn as small
// upright sprites with the same palette: a lighter top edge and a front face, so under the tilt they stand like low walls.
// Every sprite is 16 px wide (one tile) and its bottom row is the foot, on the front edge of its tile.
import { P, canvas, rect, dot, noise } from '../art/palette.js';

export const PIECE_KINDS = { h: 'hedge', F: 'fence', n: 'bench', B: 'bed', C: 'carrots', U: 'lettuce', P: 'pumpkins', Y: 'wheat' };

/** A hedge tile: leafy front face under a lighter top. `l` and `r` say a hedge continues to that side (no outline there). */
export function hedgePiece(tx, ty, l, r) {
  const c = canvas(16, 20), ctx = c.getContext('2d');
  const x0 = l ? 0 : 1, x1 = r ? 16 : 15;
  rect(ctx, P.gOut, x0, 1, x1 - x0, 19);                                                   // outline of the whole block
  const w0 = x0 + (l ? 0 : 1), ww = x1 - x0 - (l ? 0 : 1) - (r ? 0 : 1);
  rect(ctx, P.g4, w0, 2, ww, 4);                                                           // the top: sunlit leaves, a bumpy back edge
  for (let i = w0; i < w0 + ww; i++) {
    const n = noise(tx * 16 + i, ty, 8);
    dot(ctx, n > 0.5 ? P.g5 : P.g3, i, 2 + ((noise(tx * 16 + i, ty, 9) * 3) | 0));
    if (n < 0.3) dot(ctx, P.g2, i, 4);
  }
  rect(ctx, P.g2, w0, 5, ww, 1);                                                           // the lit lip over the face
  rect(ctx, P.g1, w0, 6, ww, 5);                                                           // the front face: mid green, deep shade near the ground
  rect(ctx, P.g0, w0, 11, ww, 7);
  for (let j = 6; j < 18; j++) for (let i = x0 + 1; i < x1 - 1; i++) {
    const n = noise(tx * 16 + i, ty * 20 + j, 4);
    if (n > 0.84) dot(ctx, j < 11 ? P.g3 : P.g2, i, j); else if (n > 0.6 && (i + j) % 2 === 0) dot(ctx, j < 11 ? P.g2 : P.g1, i, j);
  }
  rect(ctx, P.gOut, x0, 5, x1 - x0, 1);                                                    // the crease between top and face
  rect(ctx, P.gOut, x0, 19, x1 - x0, 1);
  return c;
}

/** A fence tile: a post with its cap, and two rails when the fence runs sideways. */
export function fencePiece(l, r) {
  const c = canvas(16, 20), ctx = c.getContext('2d');
  if (l || r) for (const ry of [7, 13]) {
    const a = l ? 0 : 8, b = r ? 16 : 8;
    rect(ctx, P.ink, a, ry - 1, b - a, 5);
    rect(ctx, P.w4, a, ry, b - a, 1); rect(ctx, P.w3, a, ry + 1, b - a, 1); rect(ctx, P.w2, a, ry + 2, b - a, 1);
  }
  rect(ctx, P.ink, 5, 2, 6, 18);                                                           // the post: outline, front, lit left edge, shaded right
  rect(ctx, P.w3, 6, 4, 4, 15); rect(ctx, P.w4, 6, 4, 1, 15); rect(ctx, P.w2, 9, 4, 1, 15);
  rect(ctx, P.w5, 6, 2, 4, 2); rect(ctx, P.w4, 6, 3, 4, 1);                                // the cap, lit from above
  rect(ctx, P.ink, 5, 19, 6, 1);
  return c;
}

/** A bench: the backrest stands up, the seat is a lighter top over a front board, iron legs and arms. */
export function benchPiece() {
  const c = canvas(16, 16), ctx = c.getContext('2d');
  rect(ctx, P.navy, 2, 8, 2, 8); rect(ctx, P.navy, 12, 8, 2, 8); rect(ctx, P.ink, 2, 14, 2, 2); rect(ctx, P.ink, 12, 14, 2, 2);   // legs
  rect(ctx, P.ink, 1, 0, 14, 8);                                                           // the backrest: three planks
  rect(ctx, P.w4, 2, 1, 12, 1); rect(ctx, P.w3, 2, 2, 12, 2); rect(ctx, P.w2, 2, 4, 12, 1); rect(ctx, P.w3, 2, 5, 12, 2);
  rect(ctx, P.ink, 1, 8, 14, 5);                                                           // the seat
  rect(ctx, P.w5, 2, 8, 12, 1); rect(ctx, P.w4, 2, 9, 12, 2); rect(ctx, P.w2, 2, 11, 12, 1);
  rect(ctx, P.ink, 1, 13, 14, 1);
  rect(ctx, P.navy, 0, 7, 2, 3); rect(ctx, P.navy, 14, 7, 2, 3);
  return c;
}

const BLOOMS = [[P.red, P.red2], [P.pink, P.red], [P.yellow, P.orange], [P.cream, P.cream4]];
/** A flower bed tile: a low raised box with the flowers standing on its soil. */
export function bedPiece(tx, ty, l, r) {
  const c = canvas(16, 24), ctx = c.getContext('2d');
  const x0 = l ? 0 : 1, x1 = r ? 16 : 15;
  rect(ctx, P.ink, x0, 12, x1 - x0, 12);
  rect(ctx, P.w0, x0 + (l ? 0 : 1), 13, x1 - x0 - (l ? 0 : 1) - (r ? 0 : 1), 5);            // the soil seen from above
  rect(ctx, P.w3, x0 + (l ? 0 : 1), 12, x1 - x0 - (l ? 0 : 1) - (r ? 0 : 1), 1);            // the back rim
  rect(ctx, P.w4, x0 + (l ? 0 : 1), 18, x1 - x0 - (l ? 0 : 1) - (r ? 0 : 1), 1);            // the front rim's top edge
  rect(ctx, P.w2, x0 + (l ? 0 : 1), 19, x1 - x0 - (l ? 0 : 1) - (r ? 0 : 1), 4);            // the front board
  rect(ctx, P.w1, x0 + (l ? 0 : 1), 22, x1 - x0 - (l ? 0 : 1) - (r ? 0 : 1), 1);
  rect(ctx, P.ink, x0, 23, x1 - x0, 1);
  const pair = BLOOMS[(noise(tx >> 1, ty, 5) * BLOOMS.length) | 0];
  for (const fx of [3, 8, 13]) {
    const rise = 3 + ((noise(tx * 3 + fx, ty, 11) * 6) | 0), top = 16 - rise;
    const [petal, shade] = noise(tx * 3 + fx, ty, 6) > 0.8 ? BLOOMS[(noise(tx, ty, 9 + fx) * 4) | 0] : pair;
    rect(ctx, P.g1, fx, top + 2, 1, rise); dot(ctx, P.g2, fx - 1, top + 5); dot(ctx, P.g2, fx + 1, top + 4);   // stem and leaves
    dot(ctx, petal, fx, top - 1); dot(ctx, petal, fx - 1, top); dot(ctx, petal, fx + 1, top); dot(ctx, petal, fx, top + 1);
    dot(ctx, P.yellow2, fx, top); dot(ctx, shade, fx, top + 2);
  }
  return c;
}

/** The fountain's front rim as a standing wall (60 x 11): a lit top edge, stone courses, a dark foot. */
export function fountainWall() {
  const c = canvas(60, 11), ctx = c.getContext('2d');
  rect(ctx, P.ink, 0, 0, 60, 11);
  rect(ctx, P.s5, 1, 1, 58, 1); rect(ctx, P.s4, 1, 2, 58, 2);                              // the top edge of the rim
  rect(ctx, P.s3, 1, 4, 58, 3); rect(ctx, P.s2, 1, 7, 58, 3);                              // the front face, darker below
  for (let row = 0; row < 2; row++) for (let x = (row % 2) * 5 + 3; x < 59; x += 10) rect(ctx, P.s1, x, 4 + row * 3, 1, 3);
  rect(ctx, P.s1, 1, 7, 58, 1); rect(ctx, P.s0, 1, 9, 58, 1);
  return c;
}
