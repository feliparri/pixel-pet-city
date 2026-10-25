// La Granja, in the town's palette: tilled soil and the four crops (ground tiles, 16 x 16 px, `at(dx, dy)` answers the neighbours' chars),
// the red barn, the well, the scarecrow and the fruit trees (upright sprites that sort with the pets), and the cow and the sheep.
import { P, ROOFS, canvas, rect, dot, shape, noise, stamp, shadow } from './palette.js';
import { oak } from './props.js';

const SOIL = 'dCUPY';
const isSoil = (c) => SOIL.includes(c);

/** Tilled earth: ridges running sideways (a lit crest and a dark trough), a lip where it meets the grass. */
export function furrow(ctx, x, y, tx, ty, at) {
  rect(ctx, P.w1, x, y, 16, 16);
  for (let j = 0; j < 16; j += 4) { rect(ctx, P.w2, x, y + j, 16, 2); rect(ctx, P.w0, x, y + j + 3, 16, 1); }
  for (let i = 0; i < 9; i++) dot(ctx, noise(tx, ty, i) > 0.5 ? P.w3 : P.w0, x + ((noise(tx, ty, 10 + i) * 16) | 0), y + ((noise(tx, ty, 20 + i) * 16) | 0));
  if (!isSoil(at(0, -1))) rect(ctx, P.w3, x, y, 16, 1);
  if (!isSoil(at(0, 1))) { rect(ctx, P.w0, x, y + 14, 16, 2); rect(ctx, P.ink, x, y + 15, 16, 1); }
  if (!isSoil(at(-1, 0))) rect(ctx, P.w0, x, y, 1, 16);
  if (!isSoil(at(1, 0))) rect(ctx, P.w0, x + 15, y, 1, 16);
}

/** The `n` plants of a crop tile, in a row: `plant(ctx, px, py, tx, ty, i)` draws one with its base at (px, py); (x, y) is the tile's top left. */
function row(plant, n = 3) {
  return (ctx, x, y, tx, ty) => {
    for (let i = 0; i < n; i++) plant(ctx, x + Math.round(((i + 0.5) * 16) / n) + (((noise(tx, ty, 50 + i) * 3) | 0) - 1), y + 12 - (((noise(tx, ty, 60 + i) * 2) | 0)), tx, ty, i);
  };
}

const LETTUCE = ['.kkkkk.', 'kggGggk', 'kgGhGgk', 'kggGggk', '.kkkkk.'];
const PUMPKIN_KEY = { k: P.w1, o: P.orange, O: '#e8934a', r: '#b0532a', s: P.g1, l: P.g2 };

const carrotRow = row((ctx, px, py) => {
  dot(ctx, P.g1, px, py - 6); dot(ctx, P.g3, px - 1, py - 5); dot(ctx, P.g4, px, py - 5); dot(ctx, P.g3, px + 1, py - 5);
  for (const [dx, c] of [[-2, P.g2], [-1, P.g3], [0, P.g4], [1, P.g3], [2, P.g2]]) dot(ctx, c, px + dx, py - 4);
  dot(ctx, P.g1, px - 1, py - 3); dot(ctx, P.g2, px, py - 3); dot(ctx, P.g1, px + 1, py - 3); dot(ctx, P.g1, px, py - 2);
  rect(ctx, P.orange, px - 1, py - 1, 3, 2); dot(ctx, P.yellow, px - 1, py - 1); dot(ctx, P.red2, px, py + 1);
});

const lettuceRow = row((ctx, px, py) => {
  shadow(ctx, px + 1, py + 2, 4, 1, 0.25);
  stamp(ctx, LETTUCE, { k: P.gOut, g: P.g3, G: P.g4, h: P.g5 }, px - 3, py - 4);
});

const pumpkinRow = row((ctx, px, py, tx, ty, i) => {
  shadow(ctx, px + 1, py + 2, 5, 1, 0.28);
  const inside = (x, y) => ((x - 3.5) / 4) ** 2 + ((y - 2.5) / 3) ** 2 <= 1;
  shape(ctx, px - 3, py - 5, 8, 6, inside, (x, y) => (x === 2 || x === 5 ? PUMPKIN_KEY.r : x < 3 && y < 3 ? PUMPKIN_KEY.O : PUMPKIN_KEY.o), PUMPKIN_KEY.k);
  dot(ctx, P.g1, px, py - 6); dot(ctx, P.g1, px + 1, py - 7); dot(ctx, P.g2, px - 1, py - 6);
  if (i === 1) { dot(ctx, P.g2, px + 4, py - 3); dot(ctx, P.g2, px + 5, py - 4); }       // a leaf of the vine
}, 2);

/** Wheat stalks: a back and a front row, golden heads over pale stems; `base` is the foot row of the front row. */
function stalks(ctx, x, y, tx, ty, base) {
  for (const [r, dy, n] of [[0, -5, 7], [1, 0, 8]]) {
    for (let i = 0; i < n; i++) {
      const sx = x + 1 + Math.round((i + 0.3 + noise(tx, ty, 80 + r * 9 + i) * 0.4) * (14 / n)), h = 8 + ((noise(tx + i, ty, 90 + r) * 3) | 0), top = base + dy - h;
      rect(ctx, i % 2 ? P.d2 : P.d1, sx, top + 3, 1, h - 2);
      rect(ctx, P.yellow, sx - (i % 2), top, 2, 1); rect(ctx, P.yellow2, sx - (i % 2), top + 1, 1, 1); rect(ctx, P.yellow, sx, top + 2, 1, 2);
      dot(ctx, P.d3, sx, top - 1); dot(ctx, P.d0, sx, base + dy);
    }
  }
}
const wheatRow = (ctx, x, y, tx, ty) => stalks(ctx, x, y, tx, ty, y + 14);

const CROP_ROWS = { C: carrotRow, U: lettuceRow, P: pumpkinRow, Y: wheatRow };
/** The crop tiles: tilled soil with their plants painted flat on it (the tilted view stands the plants up instead: see cropPiece). */
const crop = (ch) => (ctx, x, y, tx, ty, at) => { furrow(ctx, x, y, tx, ty, at); CROP_ROWS[ch](ctx, x, y, tx, ty); };
export const carrots = crop('C'), lettuce = crop('U'), pumpkins = crop('P'), wheat = crop('Y');
export const CROP_CHARS = Object.keys(CROP_ROWS);

// The stages before ripe: a mound with a seed, then a sprout, laid out like the crop's plants (row() keeps the same places).
const seedRow = (n) => row((ctx, px, py) => { rect(ctx, P.w3, px - 1, py, 3, 1); dot(ctx, P.w2, px, py - 1); dot(ctx, P.w4, px - 1, py); }, n);
const sproutRow = (n) => row((ctx, px, py) => { dot(ctx, P.g1, px, py); dot(ctx, P.g2, px, py - 1); dot(ctx, P.g3, px - 1, py - 2); dot(ctx, P.g4, px + 1, py - 2); dot(ctx, P.g3, px, py - 2); }, n);
const COUNT = { C: 3, U: 3, P: 2, Y: 4 };
/** How a plot looks at a stage: 'ripe' (the full plants), 'growing', 'seeded', or 'bare' (harvested: just the furrow). */
const plantsOf = (ch, look) => (look === 'ripe' ? CROP_ROWS[ch] : look === 'growing' ? sproutRow(COUNT[ch]) : look === 'seeded' ? seedRow(COUNT[ch]) : null);

/** Wet soil: the same furrow, darker (a pet watered it). */
function soak(ctx, x, y) { ctx.fillStyle = 'rgba(14,8,26,0.5)'; ctx.fillRect(x, y, 16, 16); }

/** One crop tile for the flat view in a given state (16 x 16, cached): the furrow, darker when `wet`, with the plants of `look`. */
const tiles = new Map();
export function plotTile(ch, tx, ty, look, wet, at) {
  const key = `${ch}${tx},${ty}${look}${wet ? 'w' : ''}`;
  let c = tiles.get(key);
  if (!c) {
    c = canvas(16, 16);
    const ctx = c.getContext('2d');
    furrow(ctx, 0, 0, tx, ty, at);
    if (wet) soak(ctx, 0, 0);
    const plants = plantsOf(ch, look);
    if (plants) plants(ctx, 0, 0, tx, ty);
    tiles.set(key, c);
  }
  return c;
}

/** The plants of a crop tile standing up for the tilted view: 16 x 20 with the feet on the bottom row (the plants' base is 2 rows above it). `look` as plotTile; null when bare. */
export function cropPiece(ch, tx, ty, look = 'ripe') {
  const plants = plantsOf(ch, look);
  if (!plants) return null;
  const c = canvas(16, 20);
  plants(c.getContext('2d'), 0, 5, tx, ty);
  return c;
}

/** The ground under the plants: the bare furrow (`wet`: darker). */
export const soil = (ctx, x, y, tx, ty, wet = false) => { furrow(ctx, x, y, tx, ty, () => 'd'); if (wet) soak(ctx, x, y); };

/** The red barn, 96 x 64: a gambrel front with cream trim, a hayloft door, big double doors and a stone footing. The foot is the bottom row. */
export function barn() {
  const W = 96, H = 64, c = canvas(W, H), ctx = c.getContext('2d');
  const half = (y) => (y < 2 ? -1 : y < 14 ? 8 + ((y - 2) * 26) / 12 : y < 24 ? 34 + (y - 14) * 0.8 : 42);
  const inside = (x, y) => Math.abs(x - 47.5) <= half(y) && y < H;
  const near = (x, y, d) => !inside(x - d, y) || !inside(x + d, y) || !inside(x, y - d) || (y < H - 3 && !inside(x, y + d));
  const R = ROOFS.red;
  shape(ctx, 0, 0, W, H, inside, (x, y) => {
    if (near(x, y, 1) ) return P.cream;
    if (near(x, y, 3)) return x % 4 === 0 ? P.cream3 : P.cream;
    if (y >= 60) return noise(x >> 2, y >> 1, 4) > 0.5 ? P.s2 : P.s1;
    return x % 4 === 0 ? R[1] : noise(x, y >> 2, 6) > 0.9 ? R[3] : R[2];
  }, P.ink);
  rect(ctx, P.s0, 6, 59, 84, 1);
  for (let x = 6; x < 90; x += 7) rect(ctx, P.s0, x + ((x >> 3) % 3), 60, 1, 4);
  // the hayloft: a dark opening in a cream frame with a cross, hay at its sill
  rect(ctx, P.ink, 39, 9, 18, 16); rect(ctx, P.cream, 40, 10, 16, 14); rect(ctx, P.w0, 42, 12, 12, 10);
  for (let i = 0; i < 10; i++) { dot(ctx, P.cream3, 43 + i, 12 + i); dot(ctx, P.cream3, 52 - i, 12 + i); }
  rect(ctx, P.yellow, 42, 20, 12, 2); for (let i = 0; i < 6; i++) dot(ctx, P.yellow2, 43 + i * 2, 19 + (i % 2));
  // the big door: two leaves with a diagonal brace each
  rect(ctx, P.ink, 30, 33, 36, 31); rect(ctx, P.cream, 31, 34, 34, 30);
  for (const lx of [33, 48]) {
    rect(ctx, R[0], lx, 36, 15, 28);
    for (let x = lx; x < lx + 15; x += 3) rect(ctx, R[1], x, 36, 2, 28);
    for (let i = 0; i < 15; i++) { dot(ctx, P.cream, lx + i, 36 + Math.round((i * 26) / 14)); dot(ctx, P.cream, lx + 14 - i, 36 + Math.round((i * 26) / 14)); }
    rect(ctx, P.cream, lx, 36, 15, 1); rect(ctx, P.cream, lx, 63, 15, 1);
  }
  rect(ctx, P.ink, 47, 36, 2, 28); dot(ctx, P.yellow, 45, 50); dot(ctx, P.yellow, 50, 50);
  // a window each side, as dark glass in a cream frame
  for (const wx of [13, 73]) { rect(ctx, P.ink, wx, 37, 12, 12); rect(ctx, P.cream, wx + 1, 38, 10, 10); rect(ctx, P.navy, wx + 2, 39, 8, 8); rect(ctx, P.cream, wx + 5, 39, 1, 8); rect(ctx, P.cream, wx + 2, 42, 8, 1); dot(ctx, P.glassHi, wx + 3, 40); }
  return c;
}

/** The well, 24 x 32: a stone rim, two posts, a little red roof, a rope and a bucket. The foot is the bottom row. */
export function well() {
  const c = canvas(24, 32), ctx = c.getContext('2d');
  rect(ctx, P.ink, 3, 21, 18, 11);                                        // the stone wall of the rim
  rect(ctx, P.s3, 4, 22, 16, 9);
  for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) { const bx = 4 + k * 4 + (j % 2) * 2; rect(ctx, P.s2, Math.min(bx + 3, 19), 22 + j * 3, 1, 3); rect(ctx, P.s1, 4, 24 + j * 3, 16, 1); if (noise(k, j, 3) > 0.6) rect(ctx, P.s4, bx, 22 + j * 3, 2, 1); }
  rect(ctx, P.s0, 4, 30, 16, 1);
  shape(ctx, 3, 17, 18, 9, (x, y) => ((x - 8.5) / 9) ** 2 + ((y - 4) / 4) ** 2 <= 1, (x, y) => (((x - 8.5) / 6) ** 2 + ((y - 4) / 2.4) ** 2 <= 1 ? P.a0 : y < 4 ? P.s4 : P.s3), P.ink);
  rect(ctx, P.a1, 9, 21, 6, 1);
  for (const px of [4, 18]) { rect(ctx, P.ink, px, 7, 3, 16); rect(ctx, P.w2, px + 1, 7, 1, 15); rect(ctx, P.w4, px, 8, 1, 14); }       // the posts
  for (let r = 0; r < 8; r++) {                                            // the roof: a small triangle of red shingles
    const hw = 3 + r * 1.4, cx = 12;
    rect(ctx, P.ink, Math.round(cx - hw) - 1, 1 + r, Math.round(hw * 2) + 2, 1);
    rect(ctx, r < 2 ? R_LIGHT : r % 2 ? ROOFS.red[2] : ROOFS.red[3], Math.round(cx - hw), 2 + r, Math.round(hw * 2), 1);
  }
  rect(ctx, P.ink, 2, 9, 20, 1); rect(ctx, ROOFS.red[1], 3, 9, 18, 1);
  rect(ctx, P.cream4, 12, 10, 1, 8);                                      // the rope
  rect(ctx, P.ink, 10, 17, 5, 5); rect(ctx, P.w3, 11, 18, 3, 3); rect(ctx, P.w1, 11, 20, 3, 1); rect(ctx, P.navy, 10, 17, 5, 1);
  return c;
}
const R_LIGHT = ROOFS.red[4];

/** The scarecrow, 16 x 28: a sack head under a brown hat, a plaid shirt on a cross of wood, straw at the cuffs. The foot is the bottom row. */
export function scarecrow() {
  const c = canvas(16, 28), ctx = c.getContext('2d');
  rect(ctx, P.ink, 6, 18, 4, 10); rect(ctx, P.w2, 7, 18, 2, 10); rect(ctx, P.w3, 7, 18, 1, 9);                  // the post
  rect(ctx, P.ink, 0, 11, 16, 4); rect(ctx, P.w2, 1, 12, 14, 2); rect(ctx, P.w3, 1, 12, 14, 1);               // the arms
  rect(ctx, P.ink, 3, 10, 10, 11); rect(ctx, '#4a63a0', 4, 11, 8, 9);                                         // the shirt
  for (let i = 0; i < 8; i += 3) { rect(ctx, '#6a84c0', 4 + i, 11, 1, 9); } for (let j = 0; j < 9; j += 3) rect(ctx, '#34457a', 4, 11 + j, 8, 1);
  rect(ctx, P.red2, 5, 14, 2, 2); rect(ctx, P.red, 5, 14, 1, 1);                                                // a patch
  for (const [x, y] of [[0, 10], [1, 9], [0, 13], [14, 10], [15, 9], [15, 13], [4, 21], [7, 21], [10, 21], [5, 22], [9, 22]]) { dot(ctx, P.yellow, x, y); dot(ctx, P.d2, x + (x < 8 ? 1 : -1), y + 1); }
  shape(ctx, 4, 2, 8, 8, (x, y) => ((x - 3.5) / 4) ** 2 + ((y - 3.5) / 4) ** 2 <= 1, (x, y) => (x < 2 ? P.cream : y > 5 ? P.cream4 : P.cream3), P.ink);        // the sack head
  dot(ctx, P.ink, 6, 5); dot(ctx, P.ink, 9, 5); dot(ctx, P.orange, 7, 6); dot(ctx, P.orange, 8, 6);
  for (let i = 0; i < 4; i++) dot(ctx, P.ink, 6 + i, 8 + (i % 3 === 1 ? 1 : 0));                                // the stitched smile
  for (const [x, y] of [[3, 8], [2, 9], [12, 8], [13, 9]]) dot(ctx, P.yellow, x, y);
  rect(ctx, P.ink, 2, 3, 12, 2); rect(ctx, P.w2, 3, 3, 10, 1);                                                   // the hat's brim, crown and band
  rect(ctx, P.ink, 4, 0, 8, 4); rect(ctx, P.w1, 5, 1, 6, 2); rect(ctx, P.w3, 5, 1, 1, 2); rect(ctx, P.red, 5, 2, 6, 1);
  return c;
}

const FRUITS = [[P.red, P.pink], [P.orange, P.yellow], [P.yellow, P.yellow2]];
const FRUIT_AT = [[10, 10], [19, 7], [14, 14], [23, 14], [8, 17], [17, 19], [13, 8], [21, 11], [26, 19], [11, 22]];
/** A fruit tree, 32 x 40 like the oak: apples, oranges or pears among the leaves. `kind` 0-2. */
export function fruitTree(kind = 0) {
  const c = canvas(32, 40), ctx = c.getContext('2d');
  ctx.drawImage(oak(kind + 1), 0, 0);
  const [main, light] = FRUITS[kind % FRUITS.length];
  for (const [x, y] of FRUIT_AT) { rect(ctx, P.ink, x - 1, y - 1, 4, 4); rect(ctx, main, x, y, 2, 2); dot(ctx, light, x, y); }
  return c;
}

/** The animals' sizes in px (the sprites' top left is the corner, the feet on the bottom row). */
export const COW_SIZE = { w: 20, h: 14 };
export const SHEEP_SIZE = { w: 16, h: 12 };
export const ANIMAL_FRAMES = 4;                // 0 stands, 1 grazes (head down), 2 and 3 are the two steps of a walk

/** Paints with a mirror: `put(i, j, w, h, colour)` takes the picture's own x for a sprite facing right. */
const mirrored = (ctx, x, y, w, flip) => (i, j, iw, ih, col) => rect(ctx, col, x + (flip ? w - i - iw : i), y + j, iw, ih);

/** A cow: white with dark patches, a pink muzzle and little horns. `frame` 0-3 (see ANIMAL_FRAMES). */
export function drawCow(ctx, x, y, frame = 0, flip = false) {
  const put = mirrored(ctx, x, y, COW_SIZE.w, flip), PATCH = '#3b3550', down = frame === 1, hy = down ? 5 : 0;
  const lift = (leg) => (frame === 2 && (leg === 0 || leg === 3)) || (frame === 3 && (leg === 1 || leg === 2));
  [3, 5, 11, 13].forEach((lx, leg) => { const h = lift(leg) ? 2 : 3; put(lx, 10, 2, h, P.ink); put(lx, 10, 1, h - 1, P.cream3); });       // legs
  put(1, 3, 1, 5, P.ink); put(0, 7, 2, 3, P.cream4);                                                                                        // tail
  put(2, 2, 13, 9, P.ink); put(3, 3, 11, 7, P.cream); put(3, 8, 11, 2, P.cream3);                                                           // body
  put(4, 3, 4, 3, PATCH); put(5, 6, 2, 1, PATCH); put(10, 5, 3, 3, PATCH); put(9, 3, 2, 1, PATCH);
  put(7, 10, 3, 1, P.pink);                                                                                                                 // udder
  put(13, 2 + hy, 7, 7, P.ink); put(14, 3 + hy, 5, 5, P.cream);                                                                             // head
  if (down) { put(13, 3, 3, 5, P.ink); put(14, 3, 1, 4, P.cream); }
  put(17, 6 + hy, 3, 3, P.pink); put(19, 7 + hy, 1, 1, P.ink); put(16, 4 + hy, 1, 1, P.ink);                                                // muzzle, nostril, eye
  put(13, 1 + hy, 2, 2, P.cream3); put(17, 0 + hy, 1, 2, P.cream); put(18, 1 + hy, 1, 1, P.cream3);                                         // ear and horns
  if (hy === 0) put(15, 3, 2, 2, PATCH);
}

/** A sheep: a cloud of wool, a dark face, thin legs. `frame` 0-3 (see ANIMAL_FRAMES). */
export function drawSheep(ctx, x, y, frame = 0, flip = false) {
  const put = mirrored(ctx, x, y, SHEEP_SIZE.w, flip), down = frame === 1, hy = down ? 3 : 0, FACE = '#3b3550';
  const lift = (leg) => (frame === 2 && (leg === 0 || leg === 3)) || (frame === 3 && (leg === 1 || leg === 2));
  [3, 5, 9, 11].forEach((lx, leg) => { const h = lift(leg) ? 2 : 3; put(lx, 9, 1, h, P.ink); put(lx, 9 + h - 1, 1, 1, P.ink2); });
  const lobes = [[7, 5, 6, 4], [3.5, 6, 4, 3], [10, 5.5, 4, 3.5], [6, 3, 4, 3]];
  const inside = (px, py) => lobes.some(([cx, cy, rx, ry]) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1) && py < 9;
  for (let j = -1; j <= 9; j++) for (let i = -1; i <= 14; i++) {
    const hit = (a, b) => a >= 0 && b >= 0 && a < 14 && b < 9 && inside(a, b);
    if (hit(i, j)) put(i, j, 1, 1, j < 3 ? P.cream : j > 6 ? P.cream4 : (i + j) % 3 === 0 ? P.cream : P.cream3);
    else if (hit(i - 1, j) || hit(i + 1, j) || hit(i, j - 1) || hit(i, j + 1)) put(i, j, 1, 1, P.ink);
  }
  put(11, 3 + hy, 5, 5, P.ink); put(12, 4 + hy, 3, 3, FACE); put(14, 5 + hy, 1, 1, P.cream); put(11, 3 + hy, 1, 2, P.ink); put(10, 5 + hy, 2, 1, FACE);       // face and ear
  if (down) put(10, 3, 3, 4, P.ink);
}

/** An animal of life.js's `animals` ({ kind, frame, flip }) with its feet at (x, y). */
export function drawAnimal(ctx, a, x, y) {
  const size = a.kind === 'cow' ? COW_SIZE : SHEEP_SIZE;
  (a.kind === 'cow' ? drawCow : drawSheep)(ctx, x - (size.w >> 1), y - size.h, a.frame, a.flip);
}
