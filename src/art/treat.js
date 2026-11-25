// The Kiosco's treats, drawn in code (no assets): an ice cream cone, a soda cup with a straw, a coconut with a straw and a paper umbrella, and an ice pop on a stick; held in the pet's
// hand, and brought up to its mouth and eaten or drunk (the treat shrinks bite by bite, a cup is drunk down, with a tilt). Sprites are 12 x 16 and cached per treat and how much is
// left; the pet's drawing is in its own pixels, the feet at the origin (see `drawHeld`).
import { P, rect, dot, canvas } from './palette.js';

const INK = P.ink;
const LEFT = [1, 0.75, 0.5, 0.25, 0.06];                                           // how much is left, in steps (cached)
const cache = new Map();

function helado(ctx, left) {
  rect(ctx, INK, 3, 8, 6, 2); rect(ctx, INK, 4, 10, 4, 2); rect(ctx, INK, 5, 12, 2, 3);                              // the cone's outline
  rect(ctx, '#d9a25c', 4, 8, 4, 2); rect(ctx, '#d9a25c', 5, 10, 2, 2); dot(ctx, '#d9a25c', 5, 12); dot(ctx, '#a8683a', 6, 9); dot(ctx, '#a8683a', 5, 11);       // the waffle
  const scoops = canvas(12, 9), c = scoops.getContext('2d');
  rect(c, INK, 2, 3, 8, 6); rect(c, '#f4a8c0', 3, 4, 6, 5); rect(c, '#ffd0e0', 3, 4, 3, 2); rect(c, '#d9708c', 7, 6, 2, 3);                                  // pink scoop
  rect(c, INK, 3, 0, 6, 4); rect(c, '#fff0c8', 4, 1, 4, 3); rect(c, '#ffffff', 4, 1, 2, 1); dot(c, '#e04050', 6, 0);                                            // cream scoop with a cherry
  const keep = Math.max(1, Math.round(9 * left));
  ctx.drawImage(scoops, 0, 9 - keep, 12, keep, 0, 8 - keep, 12, keep);
}
function refresco(ctx, left) {
  rect(ctx, INK, 1, 5, 9, 11); rect(ctx, '#f0f0f8', 2, 6, 7, 9); rect(ctx, '#e0485a', 2, 7 + Math.round((1 - left) * 7), 7, 8 - Math.round((1 - left) * 7)); rect(ctx, '#ffffff', 3, 7 + Math.round((1 - left) * 7), 1, 4);
  rect(ctx, INK, 0, 3, 11, 3); rect(ctx, '#3f7ad0', 1, 4, 9, 1);                                                                                                 // the lid
  for (let k = 0; k < 5; k++) { dot(ctx, INK, 7 + (k >> 1), 2 - Math.min(2, k)); dot(ctx, k % 2 ? P.cream : P.red, 7 + (k >> 1), 3 - Math.min(3, k) + 1); }      // the straw
  rect(ctx, INK, 8, 0, 3, 3); rect(ctx, P.red, 9, 0, 1, 3);
}
function coco(ctx, left) {
  rect(ctx, INK, 1, 4, 10, 11); rect(ctx, INK, 2, 3, 8, 13); rect(ctx, '#7a4a28', 2, 5, 8, 10); rect(ctx, '#9a6a3c', 2, 5, 3, 8); rect(ctx, '#5a3418', 8, 6, 2, 8);
  rect(ctx, INK, 2, 3, 8, 3); rect(ctx, P.cream, 3, 4, 6, 1); if (left > 0.25) rect(ctx, '#f6fbff', 3, 4 + (left > 0.6 ? 0 : 1), 6, 1);                      // the white rim and the water in it
  for (let k = 0; k < 7; k++) { dot(ctx, INK, 6 + (k >> 1), 3 - k); dot(ctx, k % 2 ? P.cream : P.red, 6 + (k >> 1), 4 - k); }                                  // the straw
  rect(ctx, '#f0902e', 0, 0, 3, 3); dot(ctx, '#ffd060', 1, 1);                                                                                                   // the paper umbrella
}
function paleta(ctx, left) {
  rect(ctx, INK, 5, 10, 2, 6); rect(ctx, '#e8c890', 5, 11, 2, 5);                                                                                               // the stick
  const pop = canvas(12, 11), c = pop.getContext('2d');
  rect(c, INK, 2, 0, 8, 11); rect(c, '#ff8a3a', 3, 1, 6, 9); rect(c, '#3fa0ff', 3, 1, 6, 3); rect(c, '#ffd0a0', 3, 1, 1, 9); rect(c, '#d95e1c', 8, 4, 1, 6); rect(c, '#ffffff', 4, 2, 1, 1);
  const keep = Math.max(2, Math.round(11 * left));
  ctx.drawImage(pop, 0, 11 - keep, 12, keep, 0, 10 - keep, 12, keep);
}
const DRAW = [helado, refresco, coco, paleta];

/** The sprite of treat `idx` with `left` (0..1) of it left: a 12 x 16 canvas, cached. */
export function treatSprite(idx, left = 1) {
  const l = LEFT.reduce((m, v) => (Math.abs(v - left) < Math.abs(m - left) ? v : m), 1), key = `${idx}:${l}`;
  let c = cache.get(key);
  if (!c) { c = canvas(12, 16); DRAW[idx](c.getContext('2d'), l); cache.set(key, c); }
  return c;
}

/** The treat as an icon of the menu: the sprite scaled up (`size` px, no smoothing) onto `ctx`. */
export function drawTreatIcon(ctx, idx, size = 40) {
  ctx.imageSmoothingEnabled = false;
  const s = Math.floor(size / 16), w = 12 * s, h = 16 * s;
  ctx.drawImage(treatSprite(idx, 1), Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
}

const smooth = (k) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };
/**
 * A treat in a pet's hand, drawn in the pet's own px with the feet at the origin of `ctx` (`ctx` is translated and scaled to them): `idx`, whether it is being eaten and how far (`k`
 * 0..1), `flip` when the pet faces left, `now` for the little bob and the bites. Held: at the hand, bobbing a little. Eating: it comes up to the mouth, a drink tilts, the treat shrinks bite
 * by bite (an eat), or the cup is drunk down (a drink).
 */
export function drawHeld(ctx, idx, eating, k, flip, now, cell = 32) {
  const dir = flip ? -1 : 1, hand = { x: dir * 10, y: -cell * 0.16 }, mouth = { x: dir * 4, y: -cell * 0.06 }, lips = -cell * 0.44;      // the hand at the belly, the treat's top at the mouth (the pet's mouth row is about 14 px over its feet)
  const lift = eating ? smooth(k / 0.22) : 0, drink = idx === 1 || idx === 2;
  const left = eating ? Math.max(0.06, 1 - Math.max(0, k - 0.22) / 0.74) : 1;
  const bite = eating && k > 0.22 ? Math.sin((k - 0.22) * 40) * (drink ? 0.5 : 1.2) : 0, bob = eating ? bite : Math.sin(now / 420) * 0.8;
  const x = hand.x + (mouth.x - hand.x) * lift, y = hand.y + (mouth.y - hand.y) * lift + bob;
  const tilt = drink ? lift * 0.8 * dir : 0;
  const s = treatSprite(idx, left);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(tilt);
  ctx.drawImage(s, -6, -14);
  ctx.restore();
  if (eating && k > 0.25 && k < 0.95) {                                                                                       // crumbs and drops fly off with each bite
    const f = ((k - 0.22) * 20) % 1;
    dot(ctx, drink ? '#8ccbff' : '#ffe9b0', Math.round(mouth.x + dir * (2 + f * 4)), Math.round(lips + 3 + f * 5)); dot(ctx, drink ? '#d6efff' : '#ffffff', Math.round(mouth.x - dir * (1 + f * 3)), Math.round(lips + 4 + f * 6));
  }
}
