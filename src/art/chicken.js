// The chicken of "Pillar la gallina": an original hen, 12 x 12 px, three frames drawn from ASCII pictures facing right (the renderer mirrors it).
// Frame 0 stands, frame 1 runs with its wings out, frame 2 is tired: head low, beak open, a drop of sweat.
import { P, dot } from './palette.js';

const KEY = { k: P.ink, w: P.cream, c: P.cream3, R: P.red, y: P.yellow, o: P.orange, a: P.a3 };
const FRAMES = [
  [
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
    '....kokok...',
    '....k.k.k...',
  ],
  [
    '.......kRk..',
    '......kRRRk.',
    '..k...kwwwk.',
    '.kwk..kwkwky',
    '.kwwkkkwwwk.',
    'kwwwkccwwwk.',
    'kwwwkcccwwk.',
    'kwwwwkkwwwk.',
    '.kwwwwwwwwk.',
    '..kwwwwwwk..',
    '...kok..kok.',
    '...k.k..k.k.',
  ],
  [
    '............',
    '.....a......',
    '..k..a......',
    '.kwk.kRRk...',
    '.kwwkkwwwk..',
    'kwwwwkwkwky.',
    'kwwwwwwwwwyk',
    'kwwwwcwwwwk.',
    '.kwwwcccwwk.',
    '..kwwwwwwk..',
    '....kokok...',
    '....k.k.k...',
  ],
];

/** Paints a frame (0-2) with its top left at (x, y); `flip` mirrors it (facing left). */
export function drawChicken(ctx, x, y, frame = 0, flip = false) {
  const rows = FRAMES[frame] || FRAMES[0];
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) { const c = KEY[row[i]]; if (c) dot(ctx, c, x + (flip ? row.length - 1 - i : i), y + j); }
  });
}
export const CHICKEN_FRAMES = FRAMES.length;
export const CHICKEN_SIZE = 12;
