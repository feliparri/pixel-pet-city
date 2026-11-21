// What the arcade draws over a game: the lives as small pet faces (the pet's own sprite) at the top left and the score, big, at the top right. Text uses the
// town's pixel font (assets/font.json); the numbers are drawn at a whole-number scale with a dark outline.
import { drawPet, petLayout } from '../sprites.js';
import { textCanvas, textWidth } from '../font.js';

export const FACE_W = 26, FACE_H = 22;

/** A canvas with the pet's face (front view, what it wears included): FACE_W x FACE_H. */
export function faceIcon(sprites, look) {
  const lay = petLayout(sprites.data, look);
  const tmp = document.createElement('canvas');
  tmp.width = lay.w; tmp.height = lay.h;
  drawPet(tmp.getContext('2d'), sprites, look, lay.origin.x, lay.origin.y, { frame: 'idle' });
  const c = document.createElement('canvas');
  c.width = FACE_W; c.height = FACE_H;
  const g = c.getContext('2d');
  g.drawImage(tmp, lay.origin.x + 3, lay.origin.y - 1, FACE_W, FACE_H, 0, 0, FACE_W, FACE_H);
  return c;
}

/** The score as the arcade shows it: five digits, like a cabinet. */
export const scoreText = (n) => String(Math.max(0, Math.min(99999, Math.floor(n)))).padStart(5, '0');

/** Text at an integer scale with a 1 logical px outline (the font's cell has room above and below the digits: the digits are the 7 middle rows). */
export function bigText(ctx, font, text, x, y, scale, color = '#fff7de', outline = '#312439') {
  const out = textCanvas(font, text, outline), fill = textCanvas(font, text, color);
  const wpx = textWidth(font, text) * scale, hpx = font.h * scale;
  for (const [dx, dy] of [[0, 2], [1, 2], [-1, 2], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) ctx.drawImage(out, x + dx, y + dy, wpx, hpx);
  ctx.drawImage(fill, x, y, wpx, hpx);
  return wpx;
}

/** The HUD for the logical canvas of width w: lives (maxLives faces, the lost ones faded) and the score. `top` is the room to leave for a device's notch. */
export function drawHud(ctx, { w, lives, maxLives = 3, score, face, font, top = 0 }) {
  ctx.imageSmoothingEnabled = false;
  const y = top + 5;
  for (let i = 0; i < maxLives; i++) {
    ctx.globalAlpha = i < lives ? 1 : 0.28;
    ctx.drawImage(face, 5 + i * (FACE_W + 1), y);
  }
  ctx.globalAlpha = 1;
  const text = scoreText(score), sc = 2;
  bigText(ctx, font, text, w - 5 - textWidth(font, text) * sc, y - 2, sc);
}
