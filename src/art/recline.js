// The sunbathing pose of a pet on a deck chair, built from the pet's own art: the 'blink' frame (eyes closed, with the pink blush the art already has) sheared back row by row so
// the body leans against the slanted back of the chair, slouched a little shorter, with two legs stretched forward in the pet's own colours, and a pair of black sunglasses pushed up
// on its head. Whatever the pet wears is part of the sheared picture, so a hat, a bow or a collar stays on the head or the neck, leaning with it; a pet that wears something on its
// head gets no sunglasses (the hat takes the place), so nothing ever clashes. The same for every species and stage: the shape comes from each pet's own frame. A slow breath is done
// at draw time (`breath`). The result is cached per look. No Zzz: this is not sleep (the towel keeps the device's sleeping pose, src/art/sleep.js).
import { drawPet, petLayout } from '../sprites.js';

export const LEAN = 0.42;                 // columns of lean per row up from the feet: about 23 degrees back
export const SLOUCH = 0.86;               // the sitting body is a little shorter than the standing one
export const PAD = 14;                    // room on the left of the picture for the legs stretched forward
const cache = new WeakMap();

/** The breath: the vertical scale at time `now` (ms), 0.97 to 1 over a slow 4.2 s. */
export const breath = (now) => 1 - 0.015 * (1 - Math.cos((2 * Math.PI * (now % 4200)) / 4200));

/** The row `y` of the standing picture goes to this row of the reclined one, and this many columns to the right. */
export const reclinePlace = (y, feetY) => ({ y: Math.round(feetY - (feetY - y) * SLOUCH), dx: Math.round((feetY - y) * LEAN) });

const hex = (r, g, b) => `rgb(${r},${g},${b})`;
/** Looks at a painted frame: where the head starts, its centre, the body's main colour and the outline's. */
function analyse(img, w, h) {
  const px = img.data, count = new Map(), dark = new Map();
  let top = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (px[i + 3] < 200) continue;
    if (top < 0) top = y;
    const r = px[i], g = px[i + 1], b = px[i + 2], luma = 0.3 * r + 0.59 * g + 0.11 * b, k = (r << 16) | (g << 8) | b;
    if (luma < 80) dark.set(k, (dark.get(k) || 0) + 1);
    else if (luma < 235) count.set(k, (count.get(k) || 0) + 1);
  }
  const best = (m, fallback) => { let k = fallback, n = 0; for (const [c, v] of m) if (v > n) { n = v; k = c; } return k; };
  let sx = 0, sn = 0;
  for (let y = Math.max(0, top); y < top + 4 && y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= 200) { sx += x; sn++; }
  const m = best(count, 0x7fd070), o = best(dark, 0x312439);
  return { top: Math.max(0, top), headX: sn ? sx / sn : w / 2, main: [m >> 16, (m >> 8) & 255, m & 255], line: [o >> 16, (o >> 8) & 255, o & 255] };
}

function blob(ctx, cx, cy, rx, ry, fill, line, shade) {
  for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -rx - 1; x <= rx + 1; x++) {
    const d = (x / rx) ** 2 + (y / ry) ** 2;
    if (d > 1.35) continue;
    ctx.fillStyle = d > 0.9 ? line : y > ry * 0.35 ? shade : fill;
    ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
  }
}

/**
 * The reclined picture of a look: { canvas, w, h, feetX, feetY } (the feet are where the pet's feet stood, so it is drawn like any pet; the legs reach to the left of them).
 * `sp` the sprites ({ data, pets, parts }), `look` the pet's look, `make(w, h)` a canvas maker (default: the document's).
 */
export function reclineSprite(sp, look, make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })) {
  let byLook = cache.get(sp.data);
  if (!byLook) cache.set(sp.data, byLook = new Map());
  const key = `${look.species}|${look.stage}|${look.items.join()}`;
  let r = byLook.get(key);
  if (r) return r;
  const L = petLayout(sp.data, look), scratch = make(L.w, L.h), sctx = scratch.getContext('2d');
  drawPet(sctx, sp, look, L.origin.x, L.origin.y, { frame: 'blink' });
  const info = analyse(sctx.getImageData(0, 0, L.w, L.h), L.w, L.h);
  const W = L.w + PAD, out = make(W, L.h), ctx = out.getContext('2d'), fy = L.feetY, fx = L.feetX + PAD;
  ctx.imageSmoothingEnabled = false;
  const fill = hex(...info.main), line = hex(...info.line), shade = hex(...info.main.map((v) => Math.round(v * 0.78)));
  blob(ctx, fx - 11, fy - 2, 7, 3, fill, line, shade);                                  // the legs stretched forward: the far one, then the near one in front
  blob(ctx, fx - 8, fy + 0, 7, 3, fill, line, shade);
  for (let y = 0; y < L.h; y++) {                                                       // the body, row by row: leaning back and slouched
    const p = reclinePlace(y, fy);
    ctx.drawImage(scratch, 0, y, L.w, 1, PAD + p.dx, p.y, L.w, 1);
  }
  const hat = look.items[0];
  if (!hat) {                                                                           // black sunglasses pushed up on the head (none when something is worn there)
    const hp = reclinePlace(info.top, fy), cx = Math.round(PAD + info.headX + hp.dx), y = hp.y + 1;
    const lens = (x0) => { ctx.fillStyle = '#14101c'; ctx.fillRect(x0, y, 5, 4); ctx.fillStyle = '#2d2a3c'; ctx.fillRect(x0 + 1, y + 1, 3, 2); ctx.fillStyle = '#9ab8e0'; ctx.fillRect(x0 + 1, y + 1, 1, 1); };
    lens(cx - 6); lens(cx + 1);
    ctx.fillStyle = '#14101c'; ctx.fillRect(cx - 1, y, 2, 1);
  }
  r = { canvas: out, w: W, h: L.h, feetX: fx, feetY: fy };
  byLook.set(key, r);
  return r;
}
