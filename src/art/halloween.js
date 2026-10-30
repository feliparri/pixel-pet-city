// Halloween decorations (src/halloween.js says where and when): jack-o'-lanterns, orange paper lanterns on stakes, cobwebs and a pumpkin patch.
// Drawn once into small canvases like the other props; each lit thing has a `lit` twin (just the glowing parts) shown over it at night.
import { P, canvas, rect, dot, shape } from './palette.js';
import { decorOf } from '../halloween.js';

const FACE = { eyes: [[5, 7], [4, 8], [5, 8], [6, 8], [10, 7], [9, 8], [10, 8], [11, 8]], mouth: [[4, 11], [5, 11], [7, 11], [8, 11], [10, 11], [11, 11], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [6, 10], [9, 10]], nose: [[7, 9], [8, 9]] };
const DARK = '#3a1a10', ORANGE = ['#a8431a', '#d2651c', '#ee8424', '#ffb255'];

/** A pumpkin body inside a w x h box at (x0, y0): ribs, a light side on the left, an ink outline. */
function pumpkin(ctx, x0, y0, w, h) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  shape(ctx, x0, y0, w, h, (x, y) => ((x - cx) / (w / 2)) ** 2 + ((y - cy) / (h / 2)) ** 2 <= 1, (x) => {
    const d = (x - cx) / (w / 2), rib = Math.abs(d) < 0.12 || Math.abs(Math.abs(d) - 0.55) < 0.1;
    return rib ? ORANGE[0] : d < -0.45 ? ORANGE[3] : d < 0.25 ? ORANGE[2] : ORANGE[1];
  }, P.ink);
}

/** A jack-o'-lantern, 16 x 16 (feet at the bottom): the face is dark by day. */
export function jack() {
  const c = canvas(16, 16), ctx = c.getContext('2d');
  rect(ctx, P.ink, 6, 1, 4, 4); rect(ctx, P.g1, 7, 1, 2, 3); dot(ctx, P.g3, 7, 1); rect(ctx, P.g0, 9, 2, 1, 2);        // the stem
  pumpkin(ctx, 1, 3, 14, 12);
  for (const [x, y] of [...FACE.eyes, ...FACE.mouth, ...FACE.nose]) dot(ctx, DARK, x, y + 1);
  return c;
}
/** The glowing face of a jack-o'-lantern (over `jack()` at night). */
export function jackLit() {
  const c = canvas(16, 16), ctx = c.getContext('2d');
  for (const [x, y] of [...FACE.eyes, ...FACE.mouth, ...FACE.nose]) dot(ctx, '#ffcf55', x, y + 1);
  for (const [x, y] of [[5, 8], [10, 8], [7, 12], [8, 12]]) dot(ctx, '#fff2b0', x, y + 1);
  return c;
}
export const JACK_GLOW = { x: 8, z: 7 };                  // the glow's centre: across the sprite, and up from the feet

/** An orange paper lantern hanging from a wooden stake, 16 x 28. */
export function lantern() {
  const c = canvas(16, 28), ctx = c.getContext('2d');
  rect(ctx, P.ink, 5, 26, 6, 2); rect(ctx, P.w1, 6, 26, 4, 1);
  rect(ctx, P.ink, 6, 4, 4, 23); rect(ctx, P.w2, 7, 4, 2, 22); rect(ctx, P.w3, 7, 4, 1, 22);                              // the stake
  rect(ctx, P.ink, 6, 3, 9, 3); rect(ctx, P.w2, 7, 4, 7, 1);                                                              // the arm
  rect(ctx, P.ink, 12, 5, 1, 2);                                                                                          // the string
  rect(ctx, P.ink, 9, 7, 7, 1); rect(ctx, P.ink, 9, 17, 7, 1);
  shape(ctx, 9, 8, 7, 9, (x, y) => ((x - 3) / 3.5) ** 2 + ((y - 4) / 4.6) ** 2 <= 1, (x, y) => (y === 2 || y === 4 || y === 6 ? '#c8541a' : x < 3 ? '#ffb040' : '#f07a1c'), P.ink);
  rect(ctx, P.red, 12, 18, 1, 3); dot(ctx, '#ff9eb5', 12, 21);                                                            // the tassel
  return c;
}
/** The lantern's glowing paper (over `lantern()` at night). */
export function lanternLit() {
  const c = canvas(16, 28), ctx = c.getContext('2d');
  rect(ctx, '#ffc84a', 10, 9, 5, 7); rect(ctx, '#fff0a0', 11, 10, 3, 5);
  for (const y of [11, 13]) rect(ctx, '#e8892a', 10, y, 5, 1);
  return c;
}
export const LANTERN_GLOW = { x: 12, z: 16 };

/** A cobweb in a corner, 10 x 10: the threads fan out from the top left; mirrored for a right corner. */
export function web(flip = false) {
  const c = canvas(10, 10), ctx = c.getContext('2d');
  if (flip) { ctx.translate(10, 0); ctx.scale(-1, 1); }
  ctx.fillStyle = 'rgba(238,242,255,0.88)';
  const line = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1); };
  line(0, 0, 9, 0); line(0, 0, 0, 9); line(0, 0, 8, 8); line(0, 0, 9, 4); line(0, 0, 4, 9);
  for (const r of [3, 6, 9]) { const m = Math.round(r * 0.55); line(r, 0, m + 1, m - 1); line(m + 1, m - 1, 0, r); }
  ctx.fillStyle = 'rgba(40,36,60,0.9)'; ctx.fillRect(7, 7, 1, 1); ctx.fillRect(6, 7, 1, 1);                                // a tiny spider on the thread
  return c;
}

/** A pumpkin patch, 32 x 16: three pumpkins on a bed of leaves. */
export function patch() {
  const c = canvas(32, 16), ctx = c.getContext('2d');
  for (const [x, y, w] of [[1, 9, 7], [10, 10, 9], [22, 9, 8]]) { rect(ctx, P.g1, x, y + 3, w + 6, 3); rect(ctx, P.g2, x + 1, y + 2, w + 3, 2); dot(ctx, P.g4, x + 3, y + 2); }
  pumpkin(ctx, 3, 2, 12, 11); pumpkin(ctx, 15, 5, 9, 8); pumpkin(ctx, 20, 0, 11, 11);
  for (const [x, y] of [[8, 1], [19, 4], [25, -1]]) { rect(ctx, P.ink, x, Math.max(0, y), 3, 3); rect(ctx, P.g1, x + 1, Math.max(0, y), 1, 2); }
  rect(ctx, P.g2, 14, 12, 3, 1); dot(ctx, P.g0, 17, 13);
  return c;
}

let kitCache = null;
/** The sprites by decoration kind: { jack, lantern, web, webR, patch } with their lit twins and glow points (null: it does not glow). */
export function halloweenKit() {
  return kitCache || (kitCache = {
    jack: { sprite: jack(), lit: jackLit(), glow: JACK_GLOW, r: 22 },
    lantern: { sprite: lantern(), lit: lanternLit(), glow: LANTERN_GLOW, r: 30 },
    web: { sprite: web(false), lit: null, glow: null, r: 0 },
    webR: { sprite: web(true), lit: null, glow: null, r: 0 },
    patch: { sprite: patch(), lit: null, glow: null, r: 0 },
  });
}

const dressed = new Map();
/** What an area wears, ready to draw: [{ x, y (feet), lift, sprite, lit, glow? { x, y, r } }] (world px; the list's `glows` are the lamp-style glows of the flat renderer). Built once per area. */
export function halloweenDecor(area) {
  if (dressed.has(area)) return dressed.get(area);
  const kit = halloweenKit(), list = decorOf(area).map((d) => {
    const k = kit[d.kind], g = k.glow;
    return { ...d, sprite: k.sprite, lit: k.lit, glow: g ? { x: d.x - k.sprite.width / 2 + g.x, y: d.y - d.lift - g.z, z: d.lift + g.z, r: k.r } : null };
  });
  list.glows = list.filter((d) => d.glow).map((d) => ({ kind: 'lamp', x: d.glow.x, y: d.glow.y, r: d.glow.r }));
  dressed.set(area, list);
  return list;
}
