// The beach poses of the pets (src/art/poses-data.js): a sunbathing pet leaning back in a deck chair and a surfing pet in a side stance on the wave, hand-drawn per species in the
// palettes of the species' own art (the same colours as the walking pet, young and elder). Stages: the adult is drawn; baby, child and elder are the adult resampled
// (nearest neighbour) to the stage's body size (the widths and heights the device's own stage art has, measured against the adult's), the elder in the elder palette. A hat is the
// only accessory kept: it is drawn on the pose's head anchor, exactly as the device anchors a hat on the head of the standing pet; the rest (a face, neck or back item) is left
// off in these poses, where it would not sit right. The result is a canvas with its anchors, cached per species, stage and hat.
import { POSES } from './poses-data.js';
import { STAGES, SLOTS } from '../protocol.js';

// The palettes: pixel-pet/common/sprites.c PAL_FROG / PAL_SEAL / PAL_CAT and their elder versions, entries 1..9 and A; B and C are the sunglasses.
const P = {
  frog: { young: ['#2e5e3e', '#6abe6e', '#9ae08a', '#d0f6b4', '#fcf6d8', '#ffffff', '#ff9cb4', '#30263c', '#5a4870', '#5c44a0'], elder: ['#78877d', '#a9c4ab', '#c7ddc2', '#e5f1dc', '#fcf6d8', '#ffffff', '#ff9cb4', '#30263c', '#5a4870', '#5c44a0'] },
  seal: { young: ['#3a4866', '#869cbc', '#b2c6de', '#dce8f4', '#ffffff', '#ffffff', '#ff9cb4', '#26283a', '#505a7a', '#5c44a0'], elder: ['#7a7e88', '#b1b8c2', '#cfd5dd', '#eaeef1', '#ffffff', '#ffffff', '#ff9cb4', '#26283a', '#505a7a', '#5c44a0'] },
  cat: { young: ['#6a3624', '#e48a4c', '#ffb874', '#ffdcaa', '#fff4e6', '#ffffff', '#ff9cb4', '#3a2622', '#d0703a', '#5cb05c'], elder: ['#877771', '#d1b4a1', '#e8d2bd', '#f3e8d8', '#fff4e6', '#ffffff', '#ff9cb4', '#3a2622', '#c1a392', '#5cb05c'] },
};
const SHADES = { B: '#14101c', C: '#7a8ab8' };

/** The colour of a grid char for a species palette ('.' is transparent). */
export function colourOf(species, elder, ch) {
  if (SHADES[ch]) return SHADES[ch];
  const p = P[species][elder ? 'elder' : 'young'];
  const i = ch === 'A' ? 9 : Number(ch) - 1;
  return Number.isInteger(i) && i >= 0 && i < p.length ? p[i] : null;
}

/** How much of the adult's size each stage is, [width, height]: the device's idle art, bounding boxes against the adult's (frog 26 x 30, seal 28 x 29, cat 27 x 32). */
export const STAGE_SCALE = {
  frog: [[30 / 26, 27 / 30], [28 / 26, 28 / 30], [1, 1], [28 / 26, 28 / 30]],
  seal: [[31 / 28, 26 / 29], [30 / 28, 27 / 29], [1, 1], [30 / 28, 27 / 29]],
  cat: [[31 / 27, 29 / 32], [29 / 27, 30 / 32], [1, 1], [29 / 27, 30 / 32]],
};
/** Where a hat goes on the standing pet's cell: the head anchor of each stage (pixel-pet/common/pet_looks_data.c), [x, y] per stage baby..elder. */
export const CELL_HEAD = { frog: [[16, 6], [16, 5], [16, 3], [16, 5]], seal: [[16, 8], [16, 7], [16, 5], [16, 7]], cat: [[16, 8], [16, 7], [16, 5], [16, 7]] };

/** The rows of a pose's text grid. */
export const rowsOf = (pose) => pose.grid.split('\n').filter((l) => l && !l.startsWith('#'));

/** Resamples rows (strings) to [sx, sy] times their size by nearest neighbour. */
export function resample(rows, sx, sy) {
  const w = rows[0].length, h = rows.length, W = Math.max(1, Math.round(w * sx)), H = Math.max(1, Math.round(h * sy)), out = [];
  for (let j = 0; j < H; j++) { let r = ''; for (let i = 0; i < W; i++) r += rows[Math.min(h - 1, Math.floor(j / sy))][Math.min(w - 1, Math.floor(i / sx))]; out.push(r); }
  return out;
}

/** Paints rows into a canvas context at (x0, y0) in a species' palette. */
export function paintRows(ctx, rows, species, elder, x0 = 0, y0 = 0) {
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = row[x] === '.' ? null : colourOf(species, elder, row[x]); if (c) { ctx.fillStyle = c; ctx.fillRect(x0 + x, y0 + y, 1, 1); } } });
}

const cache = new WeakMap();
const MARGIN = { top: 16, side: 8 };                       // room for a hat above and beside the head

/**
 * The pose picture of a look: { canvas, w, h, ax, ay, hx, hy } with the anchor (ax, ay) (the seat of the sunbathing pet, the feet of the surfing one) and the head anchor (hx, hy), all in canvas px.
 * `sp` the sprites ({ data, parts }), `kind` 'recline' or 'surf'.
 */
export function poseSprite(sp, look, kind, make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })) {
  let byKey = cache.get(sp.data);
  if (!byKey) cache.set(sp.data, byKey = new Map());
  const hat = look.items[0] || '', key = `${look.species}|${look.stage}|${kind}|${hat}`;
  let r = byKey.get(key);
  if (r) return r;
  const pose = POSES[look.species][kind], [sx, sy] = STAGE_SCALE[look.species][look.stage], elder = look.stage === 3;
  const rows = resample(rowsOf(pose), sx, sy), w = rows[0].length, h = rows.length;
  const W = w + MARGIN.side * 2, H = h + MARGIN.top, canvas = make(W, H), ctx = canvas.getContext('2d');
  paintRows(ctx, rows, look.species, elder, MARGIN.side, MARGIN.top);
  const a = [Math.round(pose.anchor[0] * sx) + MARGIN.side, Math.round(pose.anchor[1] * sy) + MARGIN.top], hd = [Math.round(pose.head[0] * sx) + MARGIN.side, Math.round(pose.head[1] * sy) + MARGIN.top];
  if (hat && sp.data.items[hat]) {                                                  // a hat sits on the head anchor as it does on the standing pet's
    const worn = sp.data.items[hat].worn[`${look.species}-${STAGES[look.stage]}`], [cx, cy] = CELL_HEAD[look.species][look.stage];
    if (worn) for (const [part, px, py, mirror] of worn.rest) {
      const [pw, ph] = sp.data.partSizes[part], [qx, qy] = sp.data.partPos[part], dx = hd[0] - cx + px, dy = hd[1] - cy + py;
      if (mirror) { ctx.save(); ctx.translate(dx + pw, dy); ctx.scale(-1, 1); ctx.drawImage(sp.parts, qx, qy, pw, ph, 0, 0, pw, ph); ctx.restore(); } else ctx.drawImage(sp.parts, qx, qy, pw, ph, dx, dy, pw, ph);
    }
  }
  r = { canvas, w: W, h: H, ax: a[0], ay: a[1], hx: hd[0], hy: hd[1] };
  byKey.set(key, r);
  return r;
}

/** The breath of the sunbathing pet: the vertical scale at time `now` (ms), 0.97 to 1 over a slow 4.2 s. */
export const breath = (now) => 1 - 0.015 * (1 - Math.cos((2 * Math.PI * (now % 4200)) / 4200));
