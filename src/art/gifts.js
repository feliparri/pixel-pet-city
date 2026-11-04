// The art of the seasonal gifts (src/gifts.js says where they lie and src/gift-world.js animates them): a wrapped box with a bow at Christmas, a small pumpkin pail
// of candy at Halloween, a gold-starred sack for a season without its own art. Each gift is 16 x 20 px (feet at the bottom) in two frames that differ in the twinkle, and
// has a `lit` twin of only its bright parts (shown over it at night) and a soft glow, so it can be found in the dark. The burst of an opened gift is three 24 x 24 frames.
import { P, canvas, rect, dot, shape } from './palette.js';

const GOLD = '#ffd45a', GOLD_LIT = '#fff4b8';
const SIZE = { w: 16, h: 20 };
const GLOW = { christmas: { z: 7, r: 16, rgb: '255,214,130' }, halloween: { z: 7, r: 16, rgb: '255,150,60' }, other: { z: 7, r: 16, rgb: '214,196,255' } };

/** A twinkle of the gift: frame 0 a speck, frame 1 a small four-point star (at the top right). */
function twinkle(ctx, frame, lit) {
  const c = lit ? '#ffffff' : GOLD_LIT;
  if (frame === 0) { dot(ctx, c, 12, 4); dot(ctx, lit ? GOLD_LIT : GOLD, 3, 6); return; }
  for (const [x, y] of [[12, 2], [12, 3], [11, 4], [12, 4], [13, 4], [12, 5], [12, 6]]) dot(ctx, c, x, y);
  dot(ctx, lit ? GOLD_LIT : GOLD, 3, 6);
}

/** Christmas: a red box with a gold ribbon and a bow. `lit`: only the ribbon, the bow and the twinkle, bright. */
function christmas(ctx, frame, lit) {
  const gold = lit ? GOLD_LIT : GOLD;
  if (!lit) {
    rect(ctx, P.ink, 2, 9, 12, 11); rect(ctx, '#c8404f', 3, 10, 10, 9); rect(ctx, '#e8707a', 3, 10, 2, 9); rect(ctx, '#8f2f3c', 11, 10, 2, 9);
    rect(ctx, P.ink, 4, 6, 8, 4);
  }
  rect(ctx, gold, 7, 10, 2, 9); rect(ctx, gold, 3, 13, 10, 2);                                  // the ribbon
  rect(ctx, gold, 5, 7, 2, 2); rect(ctx, gold, 9, 7, 2, 2); rect(ctx, gold, 7, 8, 2, 2);          // the bow
  if (!lit) { dot(ctx, P.red2, 6, 7); dot(ctx, P.red2, 10, 7); }
  twinkle(ctx, frame, lit);
}

/** Halloween: an orange pumpkin pail with a carved face, a black handle and four candies on top. */
function halloween(ctx, frame, lit) {
  const CANDY = lit ? ['#ff9a9a', '#fff0a0', '#ffc2d4', '#9ff0dc'] : ['#e0485a', '#ffcb6b', '#ff9eb5', '#5ac8b4'];
  if (!lit) {
    shape(ctx, 2, 9, 12, 10, (x, y) => x >= Math.floor(y / 5) && x < 12 - Math.floor(y / 5), (x) => (x < 3 ? '#ffb04a' : x < 8 ? '#e8821e' : '#b85a14'), P.ink);
    for (const [x, y] of [[4, 12], [5, 12], [9, 12], [10, 12], [5, 13], [10, 13]]) dot(ctx, '#3a1f10', x, y);          // eyes (two small triangles)
    for (const [x, y] of [[4, 15], [5, 16], [6, 15], [7, 16], [8, 15], [9, 16], [10, 15]]) dot(ctx, '#3a1f10', x, y);   // a toothy smile
    for (const [x, y] of [[3, 8], [3, 7], [4, 6], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 6], [11, 7], [12, 8]]) dot(ctx, P.ink, x, y);   // the handle
    dot(ctx, P.g1, 7, 8);
  }
  [[4, 8], [6, 7], [8, 8], [10, 7]].forEach(([x, y], i) => { if (!lit) rect(ctx, P.ink, x - 1, y - 1, 4, 4); rect(ctx, CANDY[i], x, y, 2, 2); });
  twinkle(ctx, frame, lit);
}

/** A season without its own art: a lilac sack tied with gold, and a gold star on it. */
function other(ctx, frame, lit) {
  const gold = lit ? GOLD_LIT : GOLD;
  if (!lit) {
    shape(ctx, 2, 9, 12, 10, (x, y) => (y < 2 ? x >= 3 && x < 9 : true), (x) => (x < 3 ? '#d6c4f4' : x < 8 ? '#b8a0e0' : '#8a74b8'), P.ink);
    rect(ctx, P.ink, 4, 7, 6, 3); rect(ctx, '#b8a0e0', 5, 7, 4, 2);
  }
  rect(ctx, gold, 4, 9, 6, 1);                                                                  // the tie
  for (const [x, y] of [[8, 12], [7, 13], [8, 13], [9, 13], [6, 14], [7, 14], [8, 14], [9, 14], [10, 14], [7, 15], [9, 15], [6, 16], [10, 16]]) dot(ctx, gold, x, y);   // a star on the sack
  twinkle(ctx, frame, lit);
}
const DRAW = { christmas, halloween };

const arts = new Map();
/** The art of a season's gift: { frames: [canvas, canvas], lits: [canvas, canvas], glow: { z, r, rgb } } (z: px above the feet). Built once per season. */
export function giftArt(season) {
  const key = Object.hasOwn(DRAW, season) ? season : 'other';
  if (!arts.has(key)) {
    const draw = DRAW[key] || other, make = (lit) => [0, 1].map((f) => { const c = canvas(SIZE.w, SIZE.h); draw(c.getContext('2d'), f, lit); return c; });
    arts.set(key, { frames: make(false), lits: make(true), glow: GLOW[key] });
  }
  return arts.get(key);
}
export const GIFT_SIZE = SIZE;

let burst = null;
export const BURST_FRAMES = 3;
/** The sparkles of an opened gift: three 24 x 24 frames, a small ring of stars that opens out and thins. */
export function burstFrames() {
  if (burst) return burst;
  const COL = [GOLD_LIT, GOLD, '#ffffff', '#ff9eb5'];
  return (burst = Array.from({ length: BURST_FRAMES }, (_, f) => {
    const c = canvas(24, 24), ctx = c.getContext('2d'), r = 3 + f * 3.5, n = 8 - f * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + f * 0.4, x = Math.round(12 + Math.cos(a) * r), y = Math.round(12 + Math.sin(a) * r * 0.9);
      dot(ctx, COL[i % COL.length], x, y);
      if (f < 2) { dot(ctx, COL[(i + 1) % COL.length], x + 1, y); dot(ctx, COL[(i + 1) % COL.length], x, y + 1); }
    }
    if (f === 0) for (const [x, y] of [[12, 10], [12, 11], [12, 12], [12, 13], [12, 14], [10, 12], [11, 12], [13, 12], [14, 12]]) dot(ctx, '#ffffff', x, y);
    return c;
  }));
}
