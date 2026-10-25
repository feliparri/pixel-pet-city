// The ambient life of the town, in the town's palette: sparrows, butterflies, fireflies, a duck, pond rings and the fountain's spray.
// Positions come from src/life.js; this only paints one thing at a time. Sprites are ASCII pictures facing right (`flip` mirrors them).
import { P, dot, rect, stamp } from './palette.js';

const BIRD_BODY = [[P.w3, P.w1], ['#b5bac6', '#7b7d8c'], ['#8a6aa8', '#554080']];        // brown sparrow, grey dove, a plum finch: [body, dark]
const BIRD = [
  ['....kkk..', '...kbbbk.', '..kbbkbky', '.kbbbbbk.', 'kdbbllbk.', '.kdllllk.', '..o...o..'],                // stands
  ['.........', '....kk...', '..kkbbk..', '.kbbbbbkk', 'kdbbllbky', '.kdllllk.', '..o...o..'],                // pecks
  ['.b.......', 'kbb...kk.', '.kbb.kbky', '..kbbbbk.', '...kllk..', '....kk...', '.........'],                // wings up
  ['.........', '....kkk..', '...kbbkky', '..kbbbbk.', '.kbbllk..', 'kbb.kk...', '.b.......'],                // wings down
];
export const BIRD_SIZE = { w: 9, h: 7 };

/** A bird with its feet at (x, y), `air` px above the ground (its shadow stays down there). */
export function drawBird(ctx, x, y, kind = 0, frame = 0, flip = false, air = 0) {
  const [body, dark] = BIRD_BODY[kind % BIRD_BODY.length];
  if (air > 0) { ctx.globalAlpha = Math.max(0.15, 0.32 - air / 120); rect(ctx, P.ink, x - 3, y - 1, 6, 1); ctx.globalAlpha = 1; }
  stamp(ctx, BIRD[frame] || BIRD[0], { k: P.ink, b: body, d: dark, l: P.cream, y: P.yellow, o: P.orange }, x - 4, y - 7 - air, flip);
}

const BUTTERFLY = [['w.k.w', 'wwkww', '.wkw.'], ['..k..', '.wkw.', '..k..']];
/** A butterfly centred on (x, y). */
export function drawButterfly(ctx, x, y, frame, colour, flip = false) {
  stamp(ctx, BUTTERFLY[frame] || BUTTERFLY[0], { w: colour, k: P.ink }, x - 2, y - 1, flip);
}

/** A firefly: a warm light and a faint halo; `glow` 0-1 (drawn additively, after the day's tint). */
export function drawFirefly(ctx, x, y, glow) {
  if (glow < 0.05) return;
  ctx.globalAlpha = 0.16 * glow; rect(ctx, '#ffe066', x - 3, y - 2, 7, 5); rect(ctx, '#ffe066', x - 2, y - 3, 5, 7);
  ctx.globalAlpha = 0.3 * glow; rect(ctx, '#ffe066', x - 1, y - 1, 3, 3);
  ctx.globalAlpha = Math.min(1, glow * 1.2); dot(ctx, '#fff7a0', x, y);
  ctx.globalAlpha = 1;
}

const DUCK = [
  ['.....kk...', '....kggk..', '....kgkgyy', 'kk..kggk..', 'kwkkwwwwk.', '.kwwwwwwk.', '..kkkkkk..'],
  ['.........k', '....kggk..', '....kgkgyy', 'kkk.kggk..', '.kwkwwwwk.', '.kwwwwwwk.', '..kkkkkk..'],
];
/** The duck, centred on (x, y) with a little wake. */
export function drawDuck(ctx, x, y, frame = 0, flip = false) {
  ctx.globalAlpha = 0.7; rect(ctx, P.a3, x - 7, y + 4, 14, 1); rect(ctx, P.a4, x - 4, y + 5, 8, 1); ctx.globalAlpha = 1;
  stamp(ctx, DUCK[frame] || DUCK[0], { k: P.ink, g: P.g1, w: P.cream, y: P.yellow }, x - 5, y - 4, flip);
}

/** A ring on the water: a pixel diamond of radius r (1-11) that fades. */
export function drawRing(ctx, x, y, radius, fade) {
  ctx.globalAlpha = Math.max(0, Math.min(1, fade));
  for (let i = -radius; i <= radius; i++) {
    const j = radius - Math.abs(i);
    dot(ctx, P.a4, x + i, y + (j >> 1)); dot(ctx, P.a4, x + i, y - (j >> 1));
  }
  ctx.globalAlpha = 1;
}

/** The spray of the fountain: droplets from life.spray(), in the fountain's own pixels, drawn from its top-left (ox, oy). */
export function drawSpray(ctx, drops, ox, oy) {
  for (const d of drops) { ctx.globalAlpha = Math.max(0.35, d.a); rect(ctx, d.a > 0.7 ? P.a4 : P.a3, ox + d.x, oy + d.y, 2, 2); }
  ctx.globalAlpha = 1;
}
