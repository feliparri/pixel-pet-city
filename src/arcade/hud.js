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

/** The HUD for the logical canvas of width w: lives (maxLives faces, the lost ones faded) and the score. `top`, `left` and `right` are the room to leave for a device's notch. */
export function drawHud(ctx, { w, lives, maxLives = 3, score, face, font, top = 0, left = 0, right = 0 }) {
  ctx.imageSmoothingEnabled = false;
  const y = top + 5;
  for (let i = 0; i < maxLives; i++) {
    ctx.globalAlpha = i < lives ? 1 : 0.28;
    ctx.drawImage(face, 5 + left + i * (FACE_W + 1), y);
  }
  ctx.globalAlpha = 1;
  const text = scoreText(score), sc = 2;
  bigText(ctx, font, text, w - 5 - right - textWidth(font, text) * sc, y - 2, sc);
}

/** The goal's little icon (11 x 10, anchored at its top left): the station (a red roof over a pale body) or the house (a roof, a lit door and window). */
export function drawGoalIcon(ctx, kind, x, y) {
  const R = (c, a, b, w, h) => { ctx.fillStyle = c; ctx.fillRect(x + a, y + b, w, h); };
  if (kind === 'house') {
    R('#312439', 4, 0, 3, 1); R('#312439', 2, 1, 7, 1); R('#312439', 0, 2, 11, 3); R('#c8584a', 1, 3, 9, 1); R('#e8806a', 2, 2, 7, 1); R('#8f3a3a', 1, 4, 9, 1);
    R('#312439', 1, 5, 9, 5); R('#fff0c0', 2, 5, 7, 4); R('#8f4a28', 4, 6, 3, 3); R('#ffd36a', 2, 6, 2, 2); R('#ffd36a', 7, 6, 2, 2);
  } else {
    R('#312439', 0, 1, 11, 3); R('#d96a62', 1, 2, 9, 1); R('#8a3042', 1, 3, 9, 1); R('#312439', 4, 0, 3, 2); R('#fff0c0', 5, 0, 1, 1);
    R('#312439', 1, 4, 9, 6); R('#fff0c0', 2, 4, 7, 5); R('#8f4a28', 4, 5, 3, 4); R('#ffd36a', 2, 5, 2, 2); R('#ffd36a', 7, 5, 2, 2); R('#312439', 0, 9, 11, 1);
  }
}

/** The route bar under the lives: a rail from the start to the goal's icon, filled as far as `progress` (0..1) with a small marker at the head. */
/** The bar's span and row for a canvas: portrait puts it under the lives across the width; a wide canvas puts it at the top centre, between lives and score. */
export function routeBarBox(w, h, top = 0) {
  if (w > h) { const len = Math.min(220, Math.round(w * 0.36)); return { x0: Math.round((w - len - 12) / 2), x1: Math.round((w + len - 12) / 2), y: top + 12 }; }
  return { x0: 8, x1: w - 8 - 12, y: top + 5 + FACE_H + 5 };
}

export function drawRouteBar(ctx, { w, progress, goal, top = 0, x0 = 8, x1 = w - 8 - 12, y = top + 5 + FACE_H + 5 }) {
  ctx.imageSmoothingEnabled = false;
  const len = x1 - x0, p = Math.max(0, Math.min(1, progress)), fx = Math.round(x0 + len * p);
  ctx.fillStyle = '#312439'; ctx.fillRect(x0 - 1, y - 1, len + 2, 5);
  ctx.fillStyle = '#6c6590'; ctx.fillRect(x0, y, len, 3);
  ctx.fillStyle = '#ffd36a'; ctx.fillRect(x0, y, Math.max(0, fx - x0), 3);
  ctx.fillStyle = '#fff7de'; ctx.fillRect(x0, y, Math.max(0, fx - x0), 1);
  for (const q of [0.25, 0.5, 0.75]) { ctx.fillStyle = '#312439'; ctx.fillRect(Math.round(x0 + len * q), y, 1, 3); }
  ctx.fillStyle = '#312439'; ctx.fillRect(fx - 2, y - 2, 5, 7); ctx.fillStyle = '#fff7de'; ctx.fillRect(fx - 1, y - 1, 3, 5); ctx.fillStyle = '#e0485a'; ctx.fillRect(fx - 1, y, 3, 3);
  drawGoalIcon(ctx, goal, x1 + 2, y - 4);
}
