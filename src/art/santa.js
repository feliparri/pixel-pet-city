// Santa as he walks across the plaza (src/santa.js): a small code-drawn figure in the look of the Christmas show's sleigh Santa (red coat, white trim, beard, hat with
// a pom, a sack of gifts on his back) and the town's Santa hat colours. Drawn on a 16 x 24 grid and baked at double size (32 x 48 px, as big as a pet), feet at the bottom, side view in two stride frames, facing right and mirrored for left;
// each has a `lit` twin (the white trim, the belt buckle and the pom, bright) shown over it at night, and a soft glow so he can be followed in the dark.
import { P, canvas, rect, dot } from './palette.js';

const GRID = { w: 16, h: 24 }, K = 2;                                   // the drawing grid and the baking scale
export const SANTA_SIZE = { w: GRID.w * K, h: GRID.h * K };
const COAT = '#e0334a', COAT_SHADE = '#a82438', COAT_HI = '#ff6f7e', WHITE = '#ffffff', FUR = '#f4ecdc', SKIN = '#ffe0c0', SKIN_SHADE = '#e8b894', GOLD = '#ffd45a', BOOT = '#3a2a2e', SACK = '#8a5a2c', SACK_HI = '#c8905a';
export const SANTA_GLOW = { z: 24, r: 34, rgb: '255,214,130' };

/** One frame facing right: `f` 0|1 is the stride; `lit` draws only the bright parts. */
function draw(ctx, f, lit) {
  const trim = lit ? '#ffffff' : FUR, gold = lit ? '#fff4b8' : GOLD;
  if (!lit) {
    const back = f ? 0 : 1, fore = f ? 1 : 0;                                                   // the legs swap: one steps forward, one back
    rect(ctx, P.ink, 4, 18 + 0, 9, 6);                                                          // the outline under the legs and the boots
    rect(ctx, COAT_SHADE, 5 + back, 17, 3, 4); rect(ctx, COAT, 8 + fore, 17, 3, 4);               // trousers
    rect(ctx, BOOT, 4 + back, 21, 4, 2); rect(ctx, BOOT, 8 + fore, 21, 4, 2); rect(ctx, P.ink, 4 + back, 23, 4, 1); rect(ctx, P.ink, 8 + fore, 23, 4, 1);   // boots
    rect(ctx, P.ink, 0, 9, 6, 8); rect(ctx, SACK, 1, 10, 4, 6); rect(ctx, SACK_HI, 1, 10, 2, 3); dot(ctx, gold, 2, 9); dot(ctx, P.red, 3, 9); // the sack on his back
    rect(ctx, P.ink, 4, 8, 9, 10); rect(ctx, COAT, 5, 9, 7, 8); rect(ctx, COAT_HI, 5, 9, 2, 5); rect(ctx, COAT_SHADE, 10, 9, 2, 8);   // the coat
    rect(ctx, '#2a2024', 5, 13, 7, 1);                                                          // the belt
    rect(ctx, P.ink, 10, 12, 3, 4); rect(ctx, COAT, 10 + (f ? 0 : 1), 12, 2, 3); rect(ctx, FUR, 10 + (f ? 0 : 1), 14, 2, 1);      // the arm and its cuff
    rect(ctx, P.ink, 5, 4, 8, 6); rect(ctx, SKIN, 8, 5, 4, 3); rect(ctx, SKIN_SHADE, 8, 7, 4, 1); dot(ctx, P.ink, 10, 6);                      // the face and its eye
    rect(ctx, P.ink, 4, 1, 8, 4); rect(ctx, COAT, 5, 2, 6, 3); rect(ctx, COAT_HI, 5, 2, 2, 1);                                                 // the hat
    rect(ctx, P.ink, 3, 3, 2, 3); rect(ctx, COAT, 4, 3, 1, 2);                                                                                // its tail
  }
  rect(ctx, trim, 5, 4, 7, 1);                                                                   // the hat's band
  rect(ctx, trim, 3, 5, 2, 1); dot(ctx, trim, 3, 6);                                              // the pom
  rect(ctx, trim, 8, 8, 5, 3); dot(ctx, trim, 12, 7);                                             // the beard
  rect(ctx, trim, 5, 17, 7, 1);                                                                   // the coat's hem
  rect(ctx, trim, 5, 9, 1, 8);                                                                    // the front trim
  rect(ctx, gold, 8, 13, 2, 1);                                                                   // the belt's buckle
  if (!lit) { rect(ctx, '#ffffff', 8, 8, 5, 1); dot(ctx, '#ffffff', 12, 7); }
}

let art = null;
/** Santa's art: { frames: { right: [canvas, canvas], left: [canvas, canvas] }, lits: the same, size, glow: { z, r, rgb } }. Built once. */
export function santaArt() {
  if (art) return art;
  const make = (lit, flip) => [0, 1].map((f) => {
    const c = canvas(SANTA_SIZE.w, SANTA_SIZE.h), g = c.getContext('2d');
    g.scale(K, K);
    if (flip) { g.translate(GRID.w, 0); g.scale(-1, 1); }
    draw(g, f, lit);
    return c;
  });
  return (art = { frames: { right: make(false, false), left: make(false, true) }, lits: { right: make(true, false), left: make(true, true) }, size: SANTA_SIZE, glow: SANTA_GLOW });
}
