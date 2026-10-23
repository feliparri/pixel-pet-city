// The game's own pixel font (assets/font.json, exported from common/font5x7), drawn into canvases.
// A glyph is `h` row bytes, bit 4 = the leftmost of 5 pixels. Missing characters draw as "?".

export async function loadFont(url = 'assets/font.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font: ${res.status}`);
  return parseFont(await res.json());
}

export function parseFont(json) {
  return { w: json.w, h: json.h, advance: json.advance, glyphs: json.glyphs };
}

const glyph = (font, ch) => font.glyphs[ch.codePointAt(0)] || font.glyphs[63] || null;

export function textWidth(font, text) {
  const n = Array.from(text).length;
  return n ? n * font.advance - (font.advance - font.w) : 0;
}

const cache = new Map();

/** A canvas with the text in one colour (cached), 1 canvas px per font pixel. */
export function textCanvas(font, text, color) {
  const key = `${color}|${text}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.max(1, textWidth(font, text));
  c.height = font.h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  let x = 0;
  for (const ch of Array.from(text)) {
    const rows = glyph(font, ch);
    if (rows) for (let y = 0; y < font.h; y++) for (let b = 0; b < font.w; b++) if (rows[y] & (1 << (font.w - 1 - b))) ctx.fillRect(x + b, y, 1, 1);
    x += font.advance;
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, c);
  return c;
}

/** Text with a dark outline, its cell's top left at (x, y). */
export function drawText(ctx, font, text, x, y, color = '#f4f6fa', outline = '#181c2c') {
  if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(textCanvas(font, text, outline), x + dx, y + dy);
  ctx.drawImage(textCanvas(font, text, color), x, y);
}
