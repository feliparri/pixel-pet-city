// Pixel art for the night promenade (the skate game), drawn in code like art.js: lamps, cones, a barricade, a bench, a flower planter, a puddle, a ramp, the board.
// `night` darkens a daytime sprite (trees, bushes) with a cool tint so it sits in the scene.
import { P } from '../art/palette.js';
import * as art from './art.js';

const INK = art.INK;
const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; };
const R = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
const memo = (fn) => { const m = new Map(); return (key = '') => { if (!m.has(key)) m.set(key, fn(key)); return m.get(key); }; };

/** A copy of a sprite in night colours (cached per sprite): cool blue over it, a touch of the lamp's warmth at the top left. */
const nightCache = new WeakMap();
export function nightify(cv, amount = 0.5) {
  let byAmount = nightCache.get(cv);
  if (!byAmount) nightCache.set(cv, byAmount = new Map());
  if (byAmount.has(amount)) return byAmount.get(amount);
  const c = mk(cv.width, cv.height, (g) => {
    g.drawImage(cv, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(30,34,110,${amount})`; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(255,190,110,0.12)'; g.fillRect(0, 0, Math.ceil(cv.width / 2), Math.ceil(cv.height / 2));
  });
  byAmount.set(amount, c);
  return c;
}

export const lamp = memo(() => mk(18, 62, (g) => {
  R(g, INK, 8, 14, 3, 48); R(g, '#3a3f66', 8, 15, 2, 47); R(g, '#6a70a0', 8, 15, 1, 47);
  R(g, INK, 5, 56, 9, 6); R(g, '#3a3f66', 6, 57, 7, 4); R(g, INK, 6, 50, 7, 3); R(g, '#3a3f66', 7, 51, 5, 1);   // base and collar
  R(g, INK, 5, 11, 9, 3);                                                                                    // lantern cap, then the glass
  R(g, INK, 3, 2, 13, 9); R(g, '#ffe9a8', 4, 3, 11, 7); R(g, '#fff7de', 6, 4, 7, 4); R(g, '#ffd27a', 4, 8, 11, 2);
  R(g, INK, 7, 0, 5, 3); R(g, '#3a3f66', 8, 0, 3, 2); R(g, INK, 9, 2, 1, 9);
}));
export const cone = memo(() => mk(14, 18, (g) => {
  R(g, INK, 1, 15, 12, 3); R(g, '#3a3f66', 2, 16, 10, 1);
  for (let y = 0; y < 15; y++) {
    const half = 1 + Math.round(y * 0.42), x0 = 7 - half, w = half * 2;
    R(g, INK, x0 - 1, y, w + 2, 1);
    const stripe = (y >= 5 && y < 8) || (y >= 11 && y < 13);
    R(g, stripe ? '#f4f0ff' : '#ff7a2e', x0, y, w, 1);
    R(g, stripe ? '#c9c4e0' : '#d9531a', x0 + w - 2, y, 2, 1);
    R(g, stripe ? '#ffffff' : '#ffa060', x0, y, 1, 1);
  }
  R(g, INK, 6, 0, 2, 1);
}));
/** The wide things take their width in px at a 50 px lane (the key): the art repeats along it, so it is never stretched. */
export const barrier = memo((wk) => { const w = Number(wk); return mk(w, 20, (g) => {
  for (const x of [Math.round(w * 0.1), Math.round(w * 0.5), Math.round(w * 0.9) - 4]) { R(g, INK, x, 9, 4, 11); R(g, '#7b7d8c', x + 1, 9, 2, 10); }
  for (const y of [1, 9]) {
    R(g, INK, 0, y, w, 8);
    for (let x = 0, i = 0; x < w; x += 8, i++) { const ww = Math.min(8, w - x - 1); R(g, i % 2 ? '#f4f0ff' : '#e0485a', x + 1, y + 1, ww, 6); R(g, i % 2 ? '#c9c4e0' : '#a8404a', x + 1, y + 5, ww, 2); }
  }
  R(g, '#ffe89a', Math.round(w / 2) - 2, 2, 4, 2); R(g, '#ffe89a', Math.round(w / 2) - 2, 10, 4, 2);
}); });
/** A bench with a high back: tall enough that only steering gets past. */
export const bench = memo((wk) => { const w = Number(wk); return mk(w, 34, (g) => {
  for (const x of [3, Math.round(w / 2) - 2, w - 7]) { R(g, INK, x, 18, 4, 16); R(g, '#3a3f66', x + 1, 18, 2, 15); }
  R(g, INK, 0, 2, w, 14); R(g, P.w3, 1, 3, w - 2, 12); for (let y = 4; y < 15; y += 4) R(g, P.w2, 1, y, w - 2, 1); R(g, P.w4, 1, 3, w - 2, 1);
  for (let x = 14; x < w - 6; x += 22) R(g, P.w1, x, 3, 1, 12);
  R(g, INK, 0, 16, w, 9); R(g, P.w3, 1, 17, w - 2, 7); R(g, P.w4, 1, 17, w - 2, 1); R(g, P.w1, 1, 23, w - 2, 1);
  R(g, INK, 0, 24, w, 1);
}); });
/** A wooden planter with a flowering hedge: tall, steer round it. */
export const planter = memo((wk) => { const w = Number(wk); return mk(w, 40, (g) => {
  const discs = [];
  for (let x = 8, i = 0; x < w - 4; x += 11, i++) { discs.push([x, 11 + (i % 2) * 2, 8 + (i % 3)], [x + 2, 19, 8]); }
  discs.push([w / 2, 8, 9]);
  art.blob(g, discs, { o: '#16323a', d: '#1f5a43', m: '#2f8a52', l: '#4aaa5c', h: '#7bd07a' }, 17);
  const cols = ['#ff9eb5', '#fff7de', '#ffcb6b'];
  for (let x = 6, i = 0; x < w - 4; x += 9, i++) R(g, cols[i % 3], x, 6 + ((i * 5) % 12), 2, 2);
  R(g, INK, 0, 24, w, 16); R(g, P.w2, 1, 25, w - 2, 14); R(g, P.w3, 1, 25, w - 2, 2); for (let x = 5; x < w - 2; x += 7) R(g, P.w1, x, 27, 1, 12); R(g, P.w1, 1, 37, w - 2, 2);
}); });
export const puddle = memo((wk) => { const w = Number(wk); return mk(w, 8, (g) => {
  R(g, '#1c2456', 3, 2, w - 6, 5); R(g, '#1c2456', 0, 3, w, 3); R(g, '#2c4f9a', 4, 3, w - 8, 3);
  for (let x = 6; x < w - 10; x += 14) { R(g, '#6bb0f0', x, 3, 8, 1); R(g, '#d6efff', x + 2, 3, 3, 1); }
  R(g, '#4a8ad8', w - 10, 5, 6, 1);
}); });
/** A launch ramp: a wedge of boards with chevrons. */
export const ramp = memo((wk) => { const w = Number(wk); return mk(w, 22, (g) => {
  for (let x = 0; x < w; x++) {
    const top = 21 - Math.round((x / (w - 1)) * 17);
    R(g, INK, x, top - 1, 1, 22 - top + 1); R(g, x % 8 < 1 ? P.w1 : P.w3, x, top, 1, 22 - top - 1); R(g, P.w4, x, top, 1, 1);
  }
  R(g, INK, 0, 21, w, 1);
  for (let x = 10; x < w - 8; x += 12) for (let i = 0; i < 4; i++) { const yy = 21 - Math.round(((x + i) / (w - 1)) * 17) + 4; R(g, '#ffcb6b', x + i, yy + (i < 2 ? i : 3 - i), 1, 2); }
}); });
/** The board seen from behind, 34 x 14 (wheel phase 0 | 1): a deck with a kicked tail, two wheels with a bright rim. */
export const board = memo((phase) => mk(34, 14, (g) => {
  for (const x of [5, 23]) { R(g, INK, x, 7, 7, 7); R(g, '#e0485a', x + 1, 8, 5, 5); R(g, '#ff9eb5', x + 1, 8, 5, 1); R(g, INK, x + 2 + Number(phase), 10, 2, 2); }
  R(g, INK, 11, 7, 12, 3); R(g, '#7b7d8c', 12, 7, 10, 2);
  R(g, INK, 0, 1, 34, 7); R(g, '#1f6f78', 1, 2, 32, 5); R(g, '#4ec9c0', 1, 2, 32, 1); R(g, '#154a58', 1, 6, 32, 1);
  R(g, INK, 0, 0, 4, 3); R(g, INK, 30, 0, 4, 3); R(g, '#1f6f78', 1, 1, 2, 2); R(g, '#1f6f78', 31, 1, 2, 2);
  for (const x of [8, 16, 24]) R(g, '#ffcb6b', x, 4, 3, 1);
}));
