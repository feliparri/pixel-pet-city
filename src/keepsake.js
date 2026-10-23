// The art of a seasonal keepsake the visiting pet wears (docs/trip-api.md, claim's `pet.keepsakes`). The anchors that place such an item on
// each species and stage live only in the game, so the town does not wear it on the pet: it shows the item as a small icon next to the badge.

const HEX = /^#[0-9a-f]{6}$/;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A clean keepsake entry, or null: { slot, name, w, h, pal (15 colours), px (Uint8Array of 4 bpp rows padded to a byte) }. */
export function parseKeepsake(k) {
  if (!k || typeof k !== 'object') return null;
  const { w, h, slot } = k;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 64 || h > 64) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) return null;
  if (!Array.isArray(k.pal) || k.pal.length !== 15 || !k.pal.every((c) => typeof c === 'string' && HEX.test(c))) return null;
  if (typeof k.px !== 'string' || k.px.length > 4400 || !B64.test(k.px)) return null;
  let bin;
  try { bin = atob(k.px); } catch { return null; }
  if (bin.length !== ((w + 1) >> 1) * h) return null;
  const px = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const name = typeof k.name === 'string' ? Array.from(k.name.replace(/[^\p{L}\p{N} _'.-]/gu, '')).slice(0, 31).join('') : '';
  return { slot, name, w, h, pal: k.pal, px };
}

/** RGBA bytes (w * h * 4) of a parsed keepsake: nibble 0 is transparent, 1..15 index the palette; the high nibble is the left pixel. */
export function keepsakeRgba(k) {
  const out = new Uint8ClampedArray(k.w * k.h * 4);
  const stride = (k.w + 1) >> 1;
  for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) {
    const byte = k.px[y * stride + (x >> 1)];
    const idx = x & 1 ? byte & 15 : byte >> 4;
    if (!idx) continue;
    const hex = k.pal[idx - 1];
    const o = (y * k.w + x) * 4;
    out[o] = parseInt(hex.slice(1, 3), 16); out[o + 1] = parseInt(hex.slice(3, 5), 16); out[o + 2] = parseInt(hex.slice(5, 7), 16); out[o + 3] = 255;
  }
  return out;
}

/** Paints the icon on a canvas (any size: scaled by whole numbers, nearest neighbour). */
export function drawKeepsake(canvas, k, scale = 2) {
  canvas.width = k.w * scale; canvas.height = k.h * scale;
  const tmp = document.createElement('canvas');
  tmp.width = k.w; tmp.height = k.h;
  tmp.getContext('2d').putImageData(new ImageData(keepsakeRgba(k), k.w, k.h), 0, 0);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}
