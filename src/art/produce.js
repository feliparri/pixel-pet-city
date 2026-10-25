// The little icons of the Canasta: fruit, vegetables, wheat and the water bucket, in the town's palette (12 x 12 ASCII pictures, drawn in code,
// never emoji, so they look the same everywhere). `drawProduce` scales one by a whole number into a `size` box.
import { P, canvas } from './palette.js';

const KEY = { k: P.ink, r: P.red, R: P.red2, p: P.pink, o: '#f0902e', O: P.orange, l: P.yellow2, y: P.yellow, Y: '#e8b04a', g: P.g2, G: P.g1, h: P.g5, n: P.g4, N: P.g2,
  d: P.d0, w: P.w3, W: P.w2, s: P.s3, a: P.a1, A: P.a3, e: P.w0, q: P.g3, z: P.g5 };

const APPLE = [
  '.....kg.....', '.....kgg....', '..kkkkkkkk..', '.krrrrrrrrk.', 'krrprrrrrrrk', 'krpprrrrrRrk',
  'krrrrrrrrRrk', 'krrrrrrrrRRk', '.krrrrrrRRk.', '.krrrrrRRRk.', '..kkRRRRkk..', '....kkkk....',
];
const PICTURES = {
  apple: APPLE,
  orange: APPLE.map((r) => r.replace(/r/g, 'o').replace(/R/g, 'O').replace(/p/g, 'l').replace(/g/g, 'G')),
  pear: [
    '.....kg.....', '.....kgg....', '....kkkk....', '...knnnnk...', '...knlnnk...', '...knnnNk...',
    '..knnnnnNk..', '.knnlnnnnNk.', '.knnnnnnnNk.', '.knnnnnnNNk.', '..kNnnnNNk..', '...kkkkkk...',
  ],
  carrot: [
    '....g.g.....', '...gGgGg....', '....gGg.....', '...kkkkk....', '..koyooOk...', '..koooooOk..',
    '...kooooOk..', '...kooooOk..', '....kooOk...', '....kooOk...', '.....kOk....', '......k.....',
  ],
  lettuce: [
    '....kkkk....', '..kkqqqqkk..', '.kqqzzqGqqk.', 'kqqzGqqqGqqk', 'kqzqGqqqqqGk', 'kqGqqqzqqqGk',
    'kqqqGqqqGqqk', '.kqGqqqqqGk.', '.kGqqqGqGGk.', '..kkGGGGkk..', '....kkkk....', '............',
  ],
  pumpkin: [
    '.....kgk....', '....kkgk....', '..kkkkkkkk..', '.kooOooOoook', 'kooloOooOook', 'kooooOooOook',
    'kooooOooOook', 'kooooOooOook', '.kooOooOoOk.', '..kkOooOkk..', '....kkkk....', '............',
  ],
  wheat: [
    '..y..y..y...', '.yYy.yYy.yY.', '.yYy.yYy.yY.', '..yd.yd.yd..', '..dyyydyyd..', '..rRrRrRrR..',
    '...dy.dy.d..', '..d..d..d...', '............', '............', '............', '............',
  ],
};
const bucket = (full) => [
  '...kkkkkk...', '..k......k..', '..k......k..', '.kkkkkkkkkk.', '.kElEElEEEk.', '.kwwwwwwwWk.',
  '.kwwwwwwwWk.', '.kssssssssk.', '.kwwwwwwwWk.', '..kwwwwwWk..', '..kkkkkkkk..', '............',
].map((r) => r.replace(/E/g, full ? 'a' : 'e').replace(/l/g, full ? 'A' : 'e'));
PICTURES['bucket-empty'] = bucket(false);
PICTURES['bucket-full'] = bucket(true);

export const PRODUCE = Object.keys(PICTURES);

/** Draws an icon (a basket kind, or 'bucket-empty' / 'bucket-full') centred in a `size` x `size` box; false for an unknown kind. */
export function drawProduce(ctx, kind, size = 40) {
  const rows = PICTURES[kind];
  if (!rows) return false;
  const k = Math.max(1, Math.floor(size / 12)), top = rows.findIndex((r) => /[^.]/.test(r)), bottom = rows.length - 1 - [...rows].reverse().findIndex((r) => /[^.]/.test(r));
  const ox = Math.floor((size - 12 * k) / 2), oy = Math.floor((size - (bottom - top + 1) * k) / 2) - top * k;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = KEY[row[i]];
      if (c) { ctx.fillStyle = c; ctx.fillRect(ox + i * k, oy + j * k, k, k); }
    }
  });
  ctx.restore();
  return true;
}

/** An icon on its own canvas (cached by kind and size) for the DOM and the pop. */
export function produceCanvas(kind, size = 40) {
  const c = canvas(size, size);
  drawProduce(c.getContext('2d'), kind, size);
  return c;
}
