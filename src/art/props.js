// Tall things that pets walk behind: trees (two kinds), bushes and lamp posts, drawn once into small canvases and sorted with the pets.
// The fountain is part of the ground (nothing walks behind it) but lives here with its animation.
import { P, canvas, rect, dot, shape, shadow, noise, stamp } from './palette.js';

const LEAF = [P.g0, P.g1, P.g2, P.g4];

/** Round leafy tree, 32 x 40, trunk centred at the bottom. `seed` varies the leaf clumps. */
export function oak(seed = 0) {
  const c = canvas(32, 40), ctx = c.getContext('2d');
  rect(ctx, P.ink, 13, 27, 6, 13);                                      // trunk: outline, bark, light side, roots
  rect(ctx, P.w2, 14, 27, 4, 12); rect(ctx, P.w3, 14, 27, 1, 11); rect(ctx, P.w1, 17, 27, 1, 12);
  rect(ctx, P.ink, 11, 38, 10, 2); rect(ctx, P.w2, 12, 38, 8, 1); rect(ctx, P.w1, 15, 36, 1, 2);
  const lobes = [[16, 13, 13, 11], [8, 19, 8, 7], [24, 19, 8, 7], [16, 7, 9, 6], [10, 11, 7, 7], [22, 11, 7, 7]];
  const inside = (x, y) => lobes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) && y < 29;
  shape(ctx, 0, 0, 32, 40, inside, (x, y) => {
    const v = -((x - 14) * 0.5 + (y - 9) * 0.85) / 15 + (noise(x >> 1, y >> 1, seed) - 0.5) * 0.7;      // light from the upper left, leaf clumps
    const bottom = y > 21 ? 0.5 : 0;
    const t = v - bottom;
    return t < -0.55 ? LEAF[0] : t < -0.05 ? LEAF[1] : t < 0.5 ? LEAF[2] : ((x + y) % 2 ? LEAF[3] : LEAF[2]);
  }, P.gOut);
  for (const [x, y] of [[9, 12], [20, 8], [14, 20], [23, 16]]) { rect(ctx, P.g1, x, y, 3, 1); dot(ctx, P.g0, x + 3, y + 1); }       // leaf notches
  return c;
}

/** Pine, 24 x 40: three tiers. */
export function pine(seed = 0) {
  const c = canvas(24, 40), ctx = c.getContext('2d');
  rect(ctx, P.ink, 10, 31, 4, 9); rect(ctx, P.w2, 11, 31, 2, 8); rect(ctx, P.w3, 11, 31, 1, 8);
  const tiers = [[1, 13, 5], [9, 14, 8], [18, 14, 11]];                   // top y, height, half width at its base
  const inside = (x, y) => tiers.some(([t, h, hw]) => y >= t && y < t + h && Math.abs(x - 11.5) <= 1 + ((y - t) / h) * hw);
  const dark = ['#1b4a34', '#27663f', '#3a8a4c', '#6bbe6b'];
  shape(ctx, 0, 0, 24, 40, inside, (x, y) => {
    const tier = tiers.findIndex(([t, h]) => y >= t && y < t + h), [t, h] = tiers[tier];
    const rel = (y - t) / h, side = (x - 11.5) / (1 + rel * tiers[tier][2]);
    const n = noise(x, y, seed + 3) * 0.3;
    const v = -side * 0.9 - rel * 0.3 + n;
    return rel > 0.78 ? dark[0] : v < -0.55 ? dark[0] : v < 0 ? dark[1] : v < 0.55 ? dark[2] : ((x + y) % 2 ? dark[3] : dark[2]);
  }, P.gOut);
  return c;
}

/** A walkable bush, 16 x 14 (hiding spot). */
export function bush(seed = 0) {
  const c = canvas(16, 14), ctx = c.getContext('2d');
  const lobes = [[8, 8, 7, 5], [4, 9, 4, 4], [12, 9, 4, 4], [8, 5, 5, 4]];
  const inside = (x, y) => lobes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  shape(ctx, 0, 0, 16, 14, inside, (x, y) => {
    const v = -((x - 7) * 0.5 + (y - 6) * 0.9) / 7 + (noise(x, y, seed) - 0.5) * 0.6;
    return v < -0.5 ? P.g0 : v < 0 ? P.g1 : v < 0.45 ? P.g2 : P.g4;
  }, P.gOut);
  if (seed % 2) for (const [x, y] of [[5, 8], [10, 6], [8, 10]]) { dot(ctx, P.red, x, y); dot(ctx, P.pink, x, y - 1); }          // berries on some
  return c;
}

/** Lamp post, 16 x 32. The lantern's glass is dull by day; at night the renderer adds the glow (lampLight). */
export function lamp() {
  const c = canvas(16, 32), ctx = c.getContext('2d');
  rect(ctx, P.ink, 5, 28, 6, 4); rect(ctx, P.navy, 6, 28, 4, 3); rect(ctx, P.s2, 6, 28, 1, 3);       // base
  rect(ctx, P.ink, 6, 11, 4, 17); rect(ctx, P.navy, 7, 11, 2, 17); rect(ctx, P.s2, 7, 11, 1, 16);    // post
  rect(ctx, P.ink, 4, 24, 8, 2); rect(ctx, P.navy, 5, 24, 6, 1);
  rect(ctx, P.ink, 3, 2, 10, 10); rect(ctx, '#d8c890', 4, 4, 8, 7); rect(ctx, P.yellow2, 5, 5, 3, 4); rect(ctx, P.cream, 5, 5, 1, 2);   // lantern
  rect(ctx, P.ink, 7, 4, 2, 7); rect(ctx, P.navy, 7, 5, 1, 5);
  rect(ctx, P.ink, 2, 1, 12, 3); rect(ctx, P.navy, 3, 2, 10, 1); rect(ctx, P.ink, 5, 0, 6, 1);       // cap
  return c;
}
/** Where the lantern's light is, relative to the lamp's top left. */
export const LAMP_GLOW = { x: 8, y: 7 };
/** The bright glass shown at night (drawn over the lamp). */
export function lampLit() {
  const c = canvas(16, 32), ctx = c.getContext('2d');
  rect(ctx, P.yellow2, 4, 4, 8, 7); rect(ctx, P.cream, 5, 5, 6, 5); rect(ctx, P.ink, 7, 4, 2, 7); rect(ctx, P.yellow2, 7, 6, 2, 3);
  return c;
}

// ---- the fountain: 4 x 3 tiles (64 x 48) -----------------------------------------------------------------------------------------------
export const FOUNTAIN = { w: 64, h: 48, basin: { x: 6, y: 8, w: 52, h: 28 } };

export function drawFountain(ctx, x, y) {
  shadow(ctx, x + 34, y + 44, 29, 4, 0.3);
  const rim = (inset, colour) => {
    const w = 64 - inset * 2, h = 46 - inset * 2;
    rect(ctx, colour, x + inset + 2, y + inset, w - 4, h); rect(ctx, colour, x + inset, y + inset + 2, w, h - 4); rect(ctx, colour, x + inset + 1, y + inset + 1, w - 2, h - 2);
  };
  rim(0, P.ink); rim(1, P.s4);                                               // outer rim (top face light)
  rect(ctx, P.s2, x + 2, y + 30, 60, 14); rect(ctx, P.s1, x + 2, y + 38, 60, 6); rect(ctx, P.ink, x + 6, y + 45, 52, 1);   // front face of the rim
  for (let i = 0; i < 60; i += 8) rect(ctx, P.s1, x + 2 + i, y + 30, 1, 14);
  rect(ctx, P.s5, x + 3, y + 3, 58, 1);
  const b = FOUNTAIN.basin;
  rect(ctx, P.s0, x + b.x - 1, y + b.y - 1, b.w + 2, b.h + 2);              // the basin
  rect(ctx, P.a1, x + b.x, y + b.y, b.w, b.h);
  rect(ctx, P.a0, x + b.x, y + b.y, b.w, 2); rect(ctx, P.a0, x + b.x, y + b.y, 2, b.h);
  rect(ctx, P.a2, x + b.x + 2, y + b.y + b.h - 2, b.w - 2, 2);
  // the central pedestal
  rect(ctx, P.ink, x + 25, y + 15, 14, 16); rect(ctx, P.s3, x + 26, y + 16, 12, 14); rect(ctx, P.s4, x + 26, y + 16, 4, 14); rect(ctx, P.s1, x + 35, y + 16, 3, 14);
  rect(ctx, P.ink, x + 22, y + 26, 20, 6); rect(ctx, P.s3, x + 23, y + 27, 18, 4); rect(ctx, P.s5, x + 23, y + 27, 18, 1); rect(ctx, P.s1, x + 23, y + 30, 18, 1);
  rect(ctx, P.ink, x + 28, y + 9, 8, 8); rect(ctx, P.s4, x + 29, y + 10, 6, 6); rect(ctx, P.a2, x + 29, y + 10, 6, 2);
}

/** Water highlights and the jets of the fountain on a frame (0-2), in the fountain's own pixels (plain rects: [colour, x, y, w, h]). */
export function fountainFrame(frame) {
  const out = [];
  const b = FOUNTAIN.basin;
  for (let i = 0; i < 9; i++) {
    const row = i % 3, col = (i * 7 + frame * (row % 2 ? -3 : 3) + 40) % 40;
    out.push([P.a3, b.x + 3 + (col % 18) + (i > 4 ? 28 : 0), b.y + 4 + row * 8 + ((i * 3) % 4), 3 + (i % 2), 1]);
  }
  const jet = [[0, 0], [1, -1], [2, 0]][frame];
  out.push([P.a4, 31, 5 - jet[1], 2, 5 + jet[1]], [P.a3, 30, 8, 1, 2], [P.a3, 33, 8, 1, 2]);              // the column of water
  for (const [dx, dy, c] of [[-5, 10, P.a3], [-3, 6, P.a4], [3, 6, P.a4], [5, 10, P.a3], [-7, 14, P.a2], [7, 14, P.a2]]) out.push([c, 32 + dx, dy + jet[0], 1, 1]);   // drops
  out.push([P.a4, 28 + frame, 20 + frame % 2, 8, 1], [P.a3, 24, 30 + (frame % 2), 16, 1]);                 // splash rings around the base
  return out;
}
