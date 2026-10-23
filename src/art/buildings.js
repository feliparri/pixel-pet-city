// Houses with depth: a shingled roof with a ridge and a shaded side, an eave that throws a shadow on the front wall, a brick, plaster,
// wood or shop facade, windows (lit at night, see windowsOf), a door, a stone foundation. 16 px per tile; roof 2 tiles + wall 2 tiles.
import { P, ROOFS, noise, rect, dot, shadow } from './palette.js';

function roof(ctx, x, y, w, r) {
  const W = w * 16;
  rect(ctx, P.ink, x, y + 2, W, 29);                                                           // outline of the whole slope
  rect(ctx, P.ink, x + 3, y, W - 6, 3);
  for (let row = 0; row < 6; row++) {                                                          // shingle rows, lighter near the ridge
    const base = [r[3], r[3], r[2], r[2], r[2], r[1]][row], seam = [r[2], r[2], r[1], r[1], r[1], r[0]][row];
    const y0 = y + 4 + row * 4, off = (row % 2) * 4;
    rect(ctx, base, x + 1, y0, W - 2, 4);
    rect(ctx, r[row < 2 ? 4 : 3], x + 1, y0, W - 2, 1);                                         // lit top edge of each row
    for (let sx = off; sx < W; sx += 8) rect(ctx, seam, x + 1 + sx, y0 + 1, 1, 3);               // vertical seams, staggered
    rect(ctx, seam, x + 1, y0 + 3, W - 2, 1);                                                    // the shadow under the row
    for (let sx = off; sx < W - 2; sx += 8) dot(ctx, r[row < 2 ? 4 : 3], x + 2 + sx, y0 + 1);    // a glint
  }
  rect(ctx, r[4], x + 4, y + 1, W - 8, 1); rect(ctx, r[3], x + 3, y + 2, W - 6, 1); rect(ctx, r[1], x + 1, y + 3, W - 2, 1);   // the ridge cap
  rect(ctx, r[1], x + W - 4, y + 4, 3, 24);                                                      // the shaded side face
  rect(ctx, r[0], x + W - 2, y + 4, 1, 24);
  rect(ctx, P.ink, x + 1, y + 3, 1, 1); rect(ctx, P.ink, x + W - 2, y + 3, 1, 1);
  rect(ctx, P.ink, x, y + 29, W, 2);                                                           // the eave
  rect(ctx, r[0], x + 1, y + 28, W - 2, 1);
  for (let sx = 2; sx < W - 2; sx += 8) dot(ctx, r[1], x + sx, y + 28);
}

function brick(ctx, x, y, w, h) {
  const base = '#b8584a';
  rect(ctx, '#d49a86', x, y, w, h);
  for (let row = 0; row * 4 < h; row++) {
    const off = (row % 2) * 4;
    for (let bx = -8; bx < w; bx += 8) {
      const x0 = Math.max(0, bx + off), x1 = Math.min(w, bx + off + 7);
      if (x1 <= x0) continue;
      const n = noise(bx + off, row, 5);
      rect(ctx, n > 0.7 ? '#c8705c' : n < 0.25 ? '#a04a44' : base, x + x0, y + row * 4, x1 - x0, 3);
      rect(ctx, '#d88a74', x + x0, y + row * 4, x1 - x0, 1);
    }
  }
}
function plaster(ctx, x, y, w, h) {
  rect(ctx, P.cream3, x, y, w, h);
  for (let i = 0; i < w * h / 24; i++) dot(ctx, noise(i, 1, 9) > 0.5 ? P.cream2 : P.cream4, x + ((noise(i, 2, 9) * w) | 0), y + ((noise(i, 3, 9) * h) | 0));
  rect(ctx, P.w1, x, y, 2, h); rect(ctx, P.w1, x + w - 2, y, 2, h); rect(ctx, P.w2, x + 1, y, 1, h);          // timber frame
  rect(ctx, P.w1, x, y + 15, w, 2);
}
function planks(ctx, x, y, w, h) {
  rect(ctx, P.w3, x, y, w, h);
  for (let row = 0; row * 4 < h; row++) {
    rect(ctx, P.w4, x, y + row * 4, w, 1); rect(ctx, P.w2, x, y + row * 4 + 3, w, 1);
    for (let bx = (row % 2) * 6; bx < w; bx += 12) rect(ctx, P.w1, x + bx, y + row * 4 + 1, 1, 2);
  }
}
function shopWall(ctx, x, y, w, h) {
  rect(ctx, P.cream2, x, y, w, h);
  for (let i = 0; i < w * h / 30; i++) dot(ctx, noise(i, 1, 4) > 0.5 ? P.cream : P.cream3, x + ((noise(i, 2, 4) * w) | 0), y + ((noise(i, 3, 4) * h) | 0));
  rect(ctx, P.w2, x, y, 2, h); rect(ctx, P.w2, x + w - 2, y, 2, h); rect(ctx, P.w3, x, y, 1, h);
}

function window_(ctx, x, y, w, h, shop) {
  rect(ctx, P.ink, x, y, w, h); rect(ctx, P.cream, x + 1, y + 1, w - 2, h - 2);                       // frame
  rect(ctx, P.glass, x + 2, y + 2, w - 4, h - 4);
  rect(ctx, P.glassHi, x + 2, y + 2, 2, h - 4); rect(ctx, P.a2, x + 2, y + h - 4, w - 4, 2);
  if (shop) {                                                                                         // goods on a shelf behind the glass
    rect(ctx, P.w2, x + 2, y + h - 5, w - 4, 1);
    for (let i = 0; i < w - 6; i += 4) { rect(ctx, [P.red, P.yellow, P.pink, P.a1][(i / 4) % 4], x + 3 + i, y + h - 8, 3, 3); dot(ctx, P.cream, x + 3 + i, y + h - 8); }
  } else { rect(ctx, P.cream, x + (w >> 1) - 1, y + 1, 1, h - 2); rect(ctx, P.cream, x + 1, y + (h >> 1) - 1, w - 2, 1); }
  rect(ctx, P.cream4, x - 1, y + h, w + 2, 2); rect(ctx, P.ink, x - 1, y + h + 2, w + 2, 1);          // sill
  rect(ctx, 'rgba(33,40,57,0.28)', x + 1, y + 1, w - 2, 2);                                          // the eave's shade
}

function door(ctx, x, y, enter) {
  rect(ctx, P.ink, x + 1, y + 6, 14, 26);                                                             // frame and doorway
  rect(ctx, P.cream4, x + 2, y + 7, 12, 25);
  rect(ctx, P.w2, x + 3, y + 8, 10, 24); rect(ctx, P.w3, x + 3, y + 8, 2, 24); rect(ctx, P.w1, x + 11, y + 8, 2, 24);
  rect(ctx, P.w1, x + 8, y + 8, 1, 24);
  rect(ctx, P.ink, x + 5, y + 10, 6, 6); rect(ctx, enter ? P.yellow2 : P.glass, x + 6, y + 11, 4, 4); rect(ctx, P.cream, x + 6, y + 11, 1, 2);   // door window
  rect(ctx, P.yellow, x + 10, y + 22, 2, 2);                                                         // knob
  rect(ctx, P.s2, x + 1, y + 31, 14, 1);                                                             // step
  rect(ctx, 'rgba(33,40,57,0.32)', x + 3, y + 8, 10, 2);
}

/** The window rectangles of a house, in pixels: [{ x, y, w, h, shop }] (the renderer lights them at night). */
export function windowsOf(h) {
  const wins = [];
  for (const i of h.windows) {
    if (h.wall === 'shop') wins.push({ x: h.x * 16 + i * 16 + 1, y: h.y * 16 + 32 + 8, w: 14, h: 15, shop: true });
    else wins.push({ x: h.x * 16 + i * 16 + 2, y: h.y * 16 + 32 + 6, w: 12, h: 13, shop: false });
  }
  return wins;
}

export function drawHouse(ctx, h) {
  const x = h.x * 16, y = h.y * 16, W = h.w * 16, r = ROOFS[h.roof];
  shadow(ctx, x + W / 2 + 4, y + 66, W / 2 + 6, 4, 0.3);                                                // cast on the ground, to the right
  const wallY = y + 30;
  ({ brick, plaster, wood: planks, shop: shopWall }[h.wall])(ctx, x, wallY, W, 34);
  rect(ctx, P.s2, x, y + 58, W, 6); rect(ctx, P.s1, x, y + 61, W, 3);                                   // foundation
  for (let i = 0; i < W; i += 8) rect(ctx, P.s0, x + i, y + 58, 1, 6);
  rect(ctx, P.s3, x, y + 58, W, 1); rect(ctx, P.ink, x, y + 63, W, 1);
  rect(ctx, P.ink, x, wallY, 1, 34); rect(ctx, P.ink, x + W - 1, wallY, 1, 34);
  roof(ctx, x, y, h.w, r);
  rect(ctx, 'rgba(33,40,57,0.34)', x + 1, y + 31, W - 2, 3); rect(ctx, 'rgba(33,40,57,0.16)', x + 1, y + 34, W - 2, 2);    // shade under the eave
  for (const w of windowsOf(h)) window_(ctx, w.x, w.y, w.w, w.h, w.shop);
  door(ctx, x + h.door * 16, y + 32, !!h.enter);
  if (h.wall === 'shop') {                                                                           // the striped awning over the door
    const ax = x + (h.door - 1) * 16 + 1, aw = 46;
    rect(ctx, P.ink, ax - 1, y + 33, aw + 2, 13);
    for (let i = 0; i < aw; i += 6) {
      const c = (i / 6) % 2 ? P.cream : P.red;
      rect(ctx, c, ax + i, y + 34, Math.min(6, aw - i), 8);
      rect(ctx, (i / 6) % 2 ? P.cream3 : P.red2, ax + i, y + 40, Math.min(6, aw - i), 2);
      rect(ctx, c, ax + i + 1, y + 42, Math.min(4, aw - i - 1), 2); dot(ctx, P.ink, ax + i, y + 43);
    }
    rect(ctx, P.ink, ax - 1, y + 33, aw + 2, 1); rect(ctx, 'rgba(255,255,255,0.25)', ax, y + 34, aw, 1);
    rect(ctx, 'rgba(33,40,57,0.3)', ax + 2, y + 46, aw - 4, 3);
  }
  if (h.roof === 'red' || h.roof === 'blue') {                                                       // a chimney (it stands above the roof's top row)
    const cx = x + W - 16;
    rect(ctx, P.ink, cx, y - 9, 8, 14); rect(ctx, '#b8584a', cx + 1, y - 8, 6, 12); rect(ctx, '#d49a86', cx + 1, y - 5, 6, 1); rect(ctx, '#d49a86', cx + 1, y - 1, 6, 1);
    rect(ctx, P.s1, cx - 1, y - 10, 10, 3); rect(ctx, P.s3, cx - 1, y - 10, 10, 1); rect(ctx, P.ink, cx + 2, y - 8, 4, 1);
  }
}

/** A window with the light on, the same size as its day sprite (shown at night over the day one). */
export function litWindow(w, h, shop) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  rect(ctx, P.ink, 0, 0, w, h); rect(ctx, '#ffd36a', 1, 1, w - 2, h - 2);
  rect(ctx, P.yellow2, 2, 2, w - 4, h - 4); rect(ctx, P.cream, 3, 3, w - 6, 3);
  if (shop) { rect(ctx, P.w2, 2, h - 5, w - 4, 1); for (let i = 0; i < w - 6; i += 4) { rect(ctx, [P.red, P.yellow, P.pink, P.a1][(i / 4) % 4], 3 + i, h - 8, 3, 3); dot(ctx, P.cream, 3 + i, h - 8); } }
  else { rect(ctx, '#d89a40', (w >> 1) - 1, 1, 1, h - 2); rect(ctx, '#d89a40', 1, (h >> 1), w - 2, 1); rect(ctx, '#e8b050', 2, h - 4, w - 4, 2); }
  rect(ctx, 'rgba(33,40,57,0.25)', 1, 1, w - 2, 2);
  return c;
}
