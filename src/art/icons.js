// The floating icons over the main places: a round badge (cream disc, plum-black outline, a small tail pointing down) with a pictogram of about 12 pixels drawn at double size
// in the town's palette. Drawn in code, never emoji fonts, so they look the same everywhere. Each icon is an ASCII picture; rows are
// centred in the 16 x 16 box.
import { P, canvas, dot, rect } from './palette.js';

export const BADGE = { w: 34, h: 42 };                       // the badge's pixels, including the tail
const KEY = {
  k: P.ink, w: P.cream, c: P.cream2, r: P.red, R: P.red2, y: P.yellow, Y: P.orange, g: P.g2, h: P.g4, G: P.g1, D: P.g0,
  a: P.a2, A: P.a1, b: P.w3, d: P.w1, e: P.w4, s: P.s3, S: P.s1, n: P.navy, p: P.pink, o: P.orange,
};

const PICTURES = {
  shop: [
    'kkkkkkkkkkkk',
    'krwrwrwrwrwk',
    'kwrwrwrwrwrk',
    'kkkkkkkkkkkk',
    '.kcccccccck.',
    '.kaacccaaak.',
    '.kaacccaaak.',
    '.kcccddccck.',
    '.kcccddccck.',
    '.kkkkkkkkkk.',
  ],
  park: [
    '..kkkkkkkk..',
    '.khhgggggGk.',
    'khhggggrggGk',
    'kgggggggggGk',
    'kgggrgggggGk',
    'kGgggggggGGk',
    '.kGGgggGGGk.',
    '..kkGGGGkk..',
    '....kek.....',
    '....kek.....',
    '...kedek....',
    '...kkkkk....',
  ],
  hide: [                                                    // a bush with a pair of eyes peeking out
    '..kkkkkkkk..',
    '.khhgggggGk.',
    '.kgwwgggwwk.',
    '.kgkwgggkwk.',
    '.kgggggggGk.',
    'kGgggggggGGk',
    '.kGGGGGGGGk.',
    '..kkkkkkkk..',
  ],
  chicken: [                                                 // a hen seen from the side, comb up, beak right
    '.......kRk..',
    '......kRRRk.',
    '..k...kwwwk.',
    '.kwk..kwkwky',
    '.kwwk.kwwwk.',
    'kwwwwkwwwwk.',
    'kwwwwwwwwwk.',
    'kwwwwcwwwwk.',
    '.kwwwcccwwk.',
    '..kwwwwwwk..',
    '....kykyk...',
    '....k.k.k...',
  ],
  soccer: [                                                  // a ball: white with plum-black patches
    '..kkkkkk..',
    '.kwwkkwwk.',
    'kwwkkkkwwk',
    'kwkkwwkkwk',
    'kkkwwwwkkk',
    'kwkkwwkkwk',
    'kwwkkkkwwk',
    '.kwwkkwwk.',
    '..kkkkkk..',
  ],
  race: [                                                    // a hurdle
    'kkkkkkkkkkkk',
    'krwrwrwrwrwk',
    'kkkkkkkkkkkk',
    '.kbk....kbk.',
    '.kbk....kbk.',
    '.kbk....kbk.',
    '.kdk....kdk.',
  ],
};
export const ICON_NAMES = Object.keys(PICTURES);

const cache = new Map();
/** The badge for an icon name: BADGE.w x BADGE.h px; its horizontal centre is the place's x and its bottom is the tail's tip. */
export function badge(name) {
  if (cache.has(name)) return cache.get(name);
  const rows = PICTURES[name];
  if (!rows) return null;
  const c = canvas(BADGE.w, BADGE.h), ctx = c.getContext('2d');
  const R = 16.5, cx = BADGE.w / 2, cy = 17;
  for (let j = 0; j < 36; j++) for (let i = 0; i < BADGE.w; i++) {                       // the disc and its ring
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
    if (d <= R - 1) dot(ctx, j + i * 0.4 < 24 ? P.cream : P.cream2, i, j);
    else if (d <= R) dot(ctx, P.ink, i, j);
  }
  for (const [y, w] of [[33, 8], [35, 6], [37, 4], [39, 2]]) { rect(ctx, P.ink, cx - w / 2 - 1, y, w + 2, 2); rect(ctx, P.cream2, cx - w / 2 + 1, y - 1, w - 2, 2); }    // the tail
  const w = Math.max(...rows.map((r) => r.length)), x0 = Math.round(cx - w), y0 = Math.round(cy - rows.length);
  rows.forEach((row, j) => {
    const off = Math.floor((w - row.length) / 2) * 2;
    for (let i = 0; i < row.length; i++) { const col = KEY[row[i]]; if (col) rect(ctx, col, x0 + off + i * 2, y0 + j * 2, 2, 2); }
  });
  cache.set(name, c);
  return c;
}

/** Where a badge is drawn for a place at `now`: the centre x and the bottom y in map pixels, bobbing gently (each place on its own phase). */
export function bobY(place, now) {
  return Math.round(place.y * 16 + Math.sin(now / 520 + place.x * 1.7) * 2.2);
}
