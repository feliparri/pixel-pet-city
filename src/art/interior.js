// The shop's interior: plank floor with seams, a back wall with windows, shelves of small goods, a counter with a shopkeeper (an original
// raccoon), display tables, plants and crates, with cast shadows under everything. Drawn once (floor, walls, furniture) plus a few
// sorted props (the counter and the shopkeeper) and night overlays for the windows.
import { P, noise, rect, dot, canvas, shadow } from './palette.js';

const FLOOR = [P.w3, '#c27544', '#a85f34'];
const GOODS = [P.red, P.yellow, P.pink, P.a1, P.g2, P.lilac, P.orange];

function floor(ctx, w, h) {
  for (let c = 0; c < w / 8; c++) {
    let y = 32 - ((noise(c, 0, 1) * 30) | 0);
    while (y < h - 16) {
      const len = 28 + ((noise(c, y, 2) * 40) | 0), y1 = Math.min(y + len, h - 16), x = c * 8;
      const col = FLOOR[(noise(c, y, 3) * 3) | 0];
      rect(ctx, col, x, Math.max(y, 32), 8, y1 - Math.max(y, 32));
      rect(ctx, P.w4, x + 1, Math.max(y, 32), 2, y1 - Math.max(y, 32));                  // the lit edge of the board
      rect(ctx, P.w1, x, Math.max(y, 32), 1, y1 - Math.max(y, 32));                      // seam
      rect(ctx, P.w1, x, y1 - 1, 8, 1); rect(ctx, P.w5, x + 1, y1, 6, 1);                // butt joint
      if (noise(c, y, 4) > 0.8) { rect(ctx, P.w2, x + 3, y + 10, 1, 4); dot(ctx, P.w2, x + 4, y + 14); }   // a crack
      if (noise(c, y, 5) > 0.88) { rect(ctx, P.w1, x + 3, y + 7, 2, 2); }                // a knot
      y = y1;
    }
  }
}

function backWall(ctx, w) {
  rect(ctx, P.ink, 0, 0, w, 32);
  rect(ctx, P.cream3, 0, 3, w, 20);
  for (let x = 0; x < w; x += 8) rect(ctx, P.cream2, x + 3, 3, 2, 20);                    // wallpaper stripes
  rect(ctx, P.ink2, 0, 0, w, 3); rect(ctx, P.w1, 0, 3, w, 2); rect(ctx, P.w3, 0, 3, w, 1);      // the top beam
  rect(ctx, P.w1, 0, 22, w, 2); rect(ctx, P.w4, 0, 22, w, 1);                             // the chair rail
  rect(ctx, P.w2, 0, 24, w, 8);                                                           // wainscot
  for (let x = 0; x < w; x += 16) { rect(ctx, P.w1, x, 24, 1, 8); rect(ctx, P.w3, x + 2, 26, 12, 4); rect(ctx, P.w2, x + 3, 27, 10, 2); }
  rect(ctx, P.w0, 0, 30, w, 2);
}
function sideWalls(ctx, w, h) {
  for (const x of [0, w - 16]) {
    rect(ctx, P.ink, x, 0, 16, h); rect(ctx, P.w2, x + (x ? 0 : 2), 0, 14, h);
    rect(ctx, P.w3, x + (x ? 2 : 4), 0, 2, h); rect(ctx, P.w1, x + (x ? 10 : 12), 0, 2, h);
    for (let y = 8; y < h; y += 24) rect(ctx, P.w1, x + 2, y, 12, 1);
  }
  rect(ctx, P.ink, 0, h - 16, w, 16); rect(ctx, P.w2, 0, h - 14, w, 12); rect(ctx, P.w3, 0, h - 14, w, 1);
  for (let x = 0; x < w; x += 16) rect(ctx, P.w1, x, h - 14, 1, 12);
}

/** The door in the bottom wall: a double door with glass, a mat in front. */
function frontDoor(ctx, x, y) {
  rect(ctx, P.ink, x - 2, y - 2, 36, 18); rect(ctx, P.cream4, x - 1, y - 1, 34, 17);
  rect(ctx, P.w1, x, y, 32, 16); rect(ctx, P.glass, x + 2, y + 2, 12, 9); rect(ctx, P.glass, x + 18, y + 2, 12, 9);
  rect(ctx, P.glassHi, x + 3, y + 3, 2, 7); rect(ctx, P.glassHi, x + 19, y + 3, 2, 7);
  rect(ctx, P.w2, x + 15, y, 2, 16); rect(ctx, P.yellow, x + 13, y + 9, 2, 2); rect(ctx, P.yellow, x + 17, y + 9, 2, 2);
  rect(ctx, P.w3, x + 2, y + 12, 12, 3); rect(ctx, P.w3, x + 18, y + 12, 12, 3);
}

const WIN_W = 24;
function windowAt(ctx, x, y, night) {
  rect(ctx, P.ink, x, y, WIN_W, 22); rect(ctx, P.cream, x + 1, y + 1, WIN_W - 2, 20);
  rect(ctx, night ? '#1d2a5a' : P.glass, x + 3, y + 3, WIN_W - 6, 16);
  if (night) {
    for (const [dx, dy] of [[6, 5], [11, 9], [8, 14], [16, 13], [14, 5]]) dot(ctx, P.cream, x + dx, y + dy);
    rect(ctx, P.yellow2, x + 15, y + 4, 4, 4); rect(ctx, '#1d2a5a', x + 17, y + 4, 2, 3);                  // a moon
  } else {
    rect(ctx, P.glassHi, x + 3, y + 3, WIN_W - 6, 3); rect(ctx, P.a2, x + 3, y + 15, WIN_W - 6, 4);
    rect(ctx, P.cream, x + 5, y + 8, 7, 3); rect(ctx, P.cream, x + 7, y + 6, 4, 3); rect(ctx, P.cream, x + 14, y + 10, 5, 2);   // clouds
  }
  rect(ctx, P.cream, x + (WIN_W >> 1) - 1, y + 3, 2, 16); rect(ctx, P.cream, x + 3, y + 10, WIN_W - 6, 1);
  rect(ctx, P.cream4, x - 2, y + 22, WIN_W + 4, 2); rect(ctx, P.ink, x - 2, y + 24, WIN_W + 4, 1);
  rect(ctx, P.red, x + 3, y + 3, 3, 8); rect(ctx, P.red2, x + 4, y + 3, 1, 8); rect(ctx, P.red, x + WIN_W - 6, y + 3, 3, 8); rect(ctx, P.red2, x + WIN_W - 5, y + 3, 1, 8);  // curtains
}

export function item(ctx, kind, x, y, c = P.red) {
  switch (kind) {
    case 'box': rect(ctx, P.ink, x, y + 2, 7, 6); rect(ctx, c, x + 1, y + 3, 5, 4); rect(ctx, P.cream, x + 3, y + 3, 1, 4); rect(ctx, P.cream, x + 1, y + 4, 5, 1); dot(ctx, P.cream, x + 2, y + 2); dot(ctx, P.cream, x + 4, y + 2); break;
    case 'ball': rect(ctx, P.ink, x + 1, y + 1, 5, 6); rect(ctx, P.ink, x, y + 2, 7, 4); rect(ctx, c, x + 1, y + 2, 5, 4); rect(ctx, c, x + 2, y + 1, 3, 6); dot(ctx, P.cream, x + 2, y + 2); rect(ctx, P.cream, x + 1, y + 4, 5, 1); break;
    case 'jar': rect(ctx, P.ink, x + 1, y, 5, 8); rect(ctx, P.s4, x + 2, y + 1, 3, 1); rect(ctx, c, x + 2, y + 3, 3, 4); dot(ctx, P.cream, x + 2, y + 3); rect(ctx, P.ink, x, y + 3, 1, 4); rect(ctx, P.ink, x + 6, y + 3, 1, 4); break;
    case 'book': rect(ctx, P.ink, x, y, 5, 8); rect(ctx, c, x + 1, y + 1, 3, 6); rect(ctx, P.cream, x + 1, y + 2, 3, 1); rect(ctx, P.cream, x + 1, y + 5, 3, 1); break;
    case 'duck': rect(ctx, P.ink, x + 1, y + 2, 6, 6); rect(ctx, P.yellow, x + 2, y + 3, 4, 4); rect(ctx, P.yellow, x + 4, y + 1, 3, 2); rect(ctx, P.orange, x + 7, y + 2, 1, 1); dot(ctx, P.ink, x + 5, y + 2); rect(ctx, P.yellow2, x + 2, y + 4, 2, 1); break;
    case 'bag': rect(ctx, P.ink, x + 1, y + 1, 6, 7); rect(ctx, P.cream2, x + 2, y + 3, 4, 4); rect(ctx, P.red, x + 2, y + 2, 4, 1); dot(ctx, P.ink, x + 3, y); dot(ctx, P.ink, x + 4, y); break;
    default: break;
  }
}

function shelf(ctx, x, y, seed) {
  rect(ctx, P.ink, x, y, 32, 32); rect(ctx, P.w0, x + 1, y + 1, 30, 30);
  rect(ctx, P.w3, x + 1, y + 1, 30, 1); rect(ctx, P.w2, x + 1, y + 2, 1, 29);
  for (const sy of [14, 28]) { rect(ctx, P.w4, x + 1, y + sy, 30, 2); rect(ctx, P.w1, x + 1, y + sy + 2, 30, 1); rect(ctx, P.w3, x + 1, y + sy, 30, 1); }
  rect(ctx, P.ink, x, y + 31, 32, 1);
  const kinds = ['box', 'jar', 'ball', 'book', 'duck', 'bag'];
  [[6, 0], [20, 1]].forEach(([sy, row]) => {
    for (let i = 0; i < 4; i++) {
      const kind = kinds[(noise(seed, i + row * 4, 6) * kinds.length) | 0];
      item(ctx, kind, x + 3 + i * 7, y + sy + (kind === 'book' ? 0 : 0), GOODS[(noise(seed, i * 3 + row, 7) * GOODS.length) | 0]);
    }
  });
  shadow(ctx, x + 18, y + 33, 17, 2, 0.35);
}

function plant(ctx, x, y) {                    // 16 x 26 at the tile's bottom
  shadow(ctx, x + 9, y + 24, 7, 2, 0.35);
  rect(ctx, P.ink, x + 3, y + 15, 10, 10); rect(ctx, P.orange, x + 4, y + 16, 8, 8); rect(ctx, P.w5, x + 4, y + 16, 2, 8); rect(ctx, P.w2, x + 10, y + 16, 2, 8); rect(ctx, P.w1, x + 4, y + 17, 8, 1);
  rect(ctx, P.w0, x + 4, y + 15, 8, 1);
  const leaf = (lx, ly, w, h) => { rect(ctx, P.gOut, lx - 1, ly - 1, w + 2, h + 2); rect(ctx, P.g1, lx, ly, w, h); rect(ctx, P.g4, lx, ly, w >> 1, 1); rect(ctx, P.g2, lx, ly + 1, w - 1, h - 1); };
  leaf(x + 6, y + 2, 5, 12); leaf(x + 2, y + 6, 4, 8); leaf(x + 10, y + 5, 4, 9); leaf(x + 7, y - 1, 3, 4);
  rect(ctx, P.g0, x + 7, y + 8, 1, 7);
}

function crates(ctx, x, y) {
  shadow(ctx, x + 9, y + 15, 8, 2, 0.35);
  rect(ctx, P.ink, x + 1, y + 1, 14, 15); rect(ctx, P.w3, x + 2, y + 2, 12, 13);
  rect(ctx, P.w2, x + 2, y + 2, 12, 1); rect(ctx, P.w1, x + 2, y + 8, 12, 1); rect(ctx, P.w4, x + 2, y + 3, 12, 1);
  rect(ctx, P.w1, x + 2, y + 2, 1, 13); rect(ctx, P.w1, x + 13, y + 2, 1, 13);
  for (let i = 0; i < 10; i++) { dot(ctx, P.w1, x + 3 + i, y + 3 + i); }                  // the cross board
  rect(ctx, P.cream2, x + 5, y + 4, 4, 3);
}

function table(ctx, x, y, seed) {              // 2 x 2 tiles: the top is the upper 26 px, the rest legs
  shadow(ctx, x + 18, y + 31, 17, 3, 0.4);
  rect(ctx, P.ink, x + 1, y + 2, 30, 26); rect(ctx, P.w4, x + 2, y + 3, 28, 17); rect(ctx, P.w5, x + 2, y + 3, 28, 1);
  rect(ctx, P.w3, x + 2, y + 19, 28, 6); rect(ctx, P.w2, x + 2, y + 24, 28, 2); rect(ctx, P.w1, x + 2, y + 26, 28, 1);
  for (let i = 5; i < 28; i += 7) rect(ctx, P.w3, x + i, y + 8, 1, 10);                   // grain
  rect(ctx, P.ink, x + 2, y + 27, 3, 5); rect(ctx, P.ink, x + 27, y + 27, 3, 5); rect(ctx, P.w1, x + 3, y + 27, 1, 4); rect(ctx, P.w1, x + 28, y + 27, 1, 4);
  const kinds = ['duck', 'ball', 'box', 'jar'];
  for (let i = 0; i < 3; i++) item(ctx, kinds[(noise(seed, i, 8) * 4) | 0], x + 4 + i * 9, y + 6 + (i % 2) * 3, GOODS[(noise(seed, i, 9) * GOODS.length) | 0]);
  rect(ctx, P.cream, x + 12, y + 14, 8, 4); rect(ctx, P.ink, x + 13, y + 15, 6, 1);       // a price tag
}

function rug(ctx, x, y, w, h) {
  rect(ctx, P.ink, x, y, w, h); rect(ctx, P.red2, x + 1, y + 1, w - 2, h - 2); rect(ctx, P.red, x + 3, y + 3, w - 6, h - 6);
  rect(ctx, P.cream2, x + 5, y + 5, w - 10, h - 10); rect(ctx, P.red, x + 6, y + 6, w - 12, h - 12);
  for (let j = 0; j < h - 14; j += 4) { rect(ctx, P.red2, x + (w >> 1) - 1, y + 8 + j, 2, 2); }
  for (let i = 0; i < w; i += 2) { dot(ctx, P.cream2, x + i, y - 1); dot(ctx, P.cream2, x + i, y + h); }
}

/** The counter: 64 x 28 (its top overhangs the tile row above by 6 px). */
export function counter() {
  const c = canvas(64, 28), ctx = c.getContext('2d');
  rect(ctx, P.ink, 0, 2, 64, 26); rect(ctx, P.w5, 1, 3, 62, 6); rect(ctx, P.w4, 1, 6, 62, 3);          // the top
  rect(ctx, P.w3, 1, 9, 62, 17); rect(ctx, P.w2, 1, 24, 62, 2);
  for (let x = 1; x < 62; x += 16) { rect(ctx, P.w1, x + 1, 11, 14, 11); rect(ctx, P.w2, x + 2, 12, 12, 9); rect(ctx, P.w4, x + 2, 12, 12, 1); }
  rect(ctx, P.w1, 1, 9, 62, 1);
  // on the counter: a till, a bell, a bag
  rect(ctx, P.ink, 4, 0, 14, 9); rect(ctx, P.s3, 5, 1, 12, 5); rect(ctx, P.s5, 5, 1, 12, 1); rect(ctx, P.s1, 5, 6, 12, 2); rect(ctx, P.ink2, 7, 2, 8, 3); rect(ctx, P.a3, 8, 3, 6, 1);
  rect(ctx, P.ink, 44, 3, 8, 5); rect(ctx, P.yellow, 45, 3, 6, 4); rect(ctx, P.yellow2, 45, 3, 2, 2); rect(ctx, P.ink, 47, 1, 2, 2);
  item(ctx, 'bag', 54, 1, P.cream2); item(ctx, 'jar', 30, 1, P.pink);
  return c;
}

/** The shopkeeper: a raccoon in an apron, 16 x 24. `frame`: 0 idle, 1 blink. */
export function raccoon(ctx, x, y, frame = 0, bob = 0) {
  const fur = P.s3, dark = P.s1, mask = P.ink;
  ctx.save();
  ctx.translate(x, y + bob);
  // tail with rings, behind the body on the right
  rect(ctx, P.ink, 11, 12, 6, 10); rect(ctx, fur, 12, 13, 4, 8); for (const ty of [14, 17, 20]) rect(ctx, mask, 12, ty, 4, 2);
  rect(ctx, P.ink, 3, 11, 10, 13); rect(ctx, dark, 4, 12, 8, 11); rect(ctx, fur, 4, 12, 3, 10);              // body
  rect(ctx, P.ink, 4, 14, 8, 9); rect(ctx, P.orange, 5, 15, 6, 8); rect(ctx, P.w5, 5, 15, 1, 8); rect(ctx, P.w2, 5, 20, 6, 1);   // apron
  rect(ctx, P.yellow, 7, 17, 3, 2);                                                                         // the pocket's badge
  rect(ctx, P.ink, 2, 14, 2, 6); rect(ctx, fur, 2, 15, 1, 4); rect(ctx, P.ink, 12, 14, 2, 6); rect(ctx, fur, 13, 15, 1, 4);       // arms
  rect(ctx, P.ink, 4, 22, 3, 2); rect(ctx, P.ink, 9, 22, 3, 2); rect(ctx, mask, 5, 22, 1, 1); rect(ctx, mask, 10, 22, 1, 1);        // feet
  // head
  rect(ctx, P.ink, 1, 2, 14, 11); rect(ctx, P.ink, 2, 1, 4, 3); rect(ctx, P.ink, 10, 1, 4, 3);                // ears
  rect(ctx, fur, 2, 3, 12, 9); rect(ctx, fur, 2, 2, 3, 2); rect(ctx, fur, 11, 2, 3, 2); rect(ctx, mask, 3, 2, 2, 1); rect(ctx, mask, 11, 2, 2, 1);
  rect(ctx, P.s5, 4, 3, 8, 2);                                                                                // the pale forehead
  rect(ctx, mask, 2, 5, 12, 4); rect(ctx, mask, 1, 6, 14, 2);                                                 // the bandit mask
  rect(ctx, P.s5, 4, 9, 8, 3); rect(ctx, P.s5, 5, 8, 6, 1);                                                   // the muzzle
  if (frame === 1) { rect(ctx, P.s1, 4, 7, 3, 1); rect(ctx, P.s1, 9, 7, 3, 1); } else {
    rect(ctx, P.s5, 4, 6, 3, 2); rect(ctx, P.s5, 9, 6, 3, 2); rect(ctx, P.ink, 5, 7, 1, 1); rect(ctx, P.ink, 10, 7, 1, 1); dot(ctx, P.cream, 4, 6); dot(ctx, P.cream, 9, 6);
  }
  rect(ctx, P.ink, 7, 9, 2, 1); dot(ctx, P.ink, 7, 11); dot(ctx, P.ink, 8, 11);                                // nose and smile
  rect(ctx, P.red, 7, 12, 2, 1);                                                                              // a bow tie
  ctx.restore();
}

/** Everything of the shop that does not move or sort, baked: the floor, the walls and the furniture against them. */
export function drawInterior(ctx, area) {
  const W = area.w * 16, H = area.h * 16;
  floor(ctx, W, H);
  backWall(ctx, W);
  sideWalls(ctx, W, H);
  rect(ctx, 'rgba(33,40,57,0.3)', 16, 32, W - 32, 3); rect(ctx, 'rgba(33,40,57,0.15)', 16, 35, W - 32, 3);   // the wall's shadow on the floor
  rect(ctx, 'rgba(33,40,57,0.25)', 16, 32, 3, H - 48);  rect(ctx, 'rgba(33,40,57,0.25)', W - 19, 32, 3, H - 48);
  const wins = [[50, 6], [150, 6]];
  for (const [x, y] of wins) windowAt(ctx, x, y, false);
  frontDoor(ctx, 96, H - 16);
  const at = (x, y) => (area.grid[y] || '')[x];
  for (let y = 0; y < area.h; y++) for (let x = 0; x < area.w; x++) {
    const ch = at(x, y);
    if (ch === 'k' && at(x - 1, y) !== 'k') shelf(ctx, x * 16, (y - 1) * 16, x);
    if (ch === 'q') plant(ctx, x * 16, y * 16 - 10);
    if (ch === 'z') crates(ctx, x * 16, y * 16);
    if (ch === 'u' && at(x - 1, y) !== 'u' && at(x, y - 1) !== 'u') table(ctx, x * 16, y * 16 - 2, x + y);
  }
  rug(ctx, 6 * 16 + 2, 7 * 16, 28, 62);
  return wins.map(([x, y]) => ({ x, y }));
}

/** The night view through a window (a sprite the same size as the window). */
export function nightWindow() {
  const c = canvas(WIN_W, 22), ctx = c.getContext('2d');
  windowAt(ctx, 0, 0, true);
  return c;
}
