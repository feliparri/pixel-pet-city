// Snow in the town: while Christmas is on and the Chile date is in December, flakes fall over the town and the farm, more of them (and a bluer white) at night.
// A flake is a pure function of (its index, the clock): its column, speed, sway and size come from a seeded table built once, its position at time t from a closed
// form, so there is no state to keep and a frame costs one pass over at most FLAKES small rects with no allocation (two fill styles: small dim flakes, big bright ones).
import { msToZoned } from './admin-time.js';
import { mulberry32 } from './life.js';

export const FLAKES = 150;
export const SNOW_MONTH = 12;                               // December, Chile time
const X = new Float32Array(FLAKES), Y = new Float32Array(FLAKES), SPEED = new Float32Array(FLAKES), SWAY = new Float32Array(FLAKES), PHASE = new Float32Array(FLAKES), BIG = new Uint8Array(FLAKES);
{
  const r = mulberry32(0x5eed5);
  for (let i = 0; i < FLAKES; i++) { X[i] = r(); Y[i] = r(); SPEED[i] = 0.05 + r() * 0.07; SWAY[i] = 0.004 + r() * 0.012; PHASE[i] = r() * 6.2832; BIG[i] = i % 4 === 0 ? 1 : 0; }
}

/** The Chile month (1..12) at server time `ms`. Not free (Intl): the caller asks about once a second. */
export const chileMonth = (ms) => Number(msToZoned(ms).date.slice(5, 7));
/** Does it snow? Christmas is on (`seasons`, a Set of keys) and it is December in Chile at `ms`. */
export const snowing = (seasons, ms) => !!seasons && seasons.has('christmas') && Number.isFinite(ms) && chileMonth(ms) === SNOW_MONTH;
/** How many flakes fall at a night level 0..1 (the town's `amb.night`): about half in daylight, all of them at night. */
export const flakesFor = (night) => Math.round(FLAKES * (0.5 + 0.5 * Math.min(1, Math.max(0, night || 0))));

/**
 * Draws the snow over a `w` x `h` view at clock `nowMs`. `unit` is the size of one art pixel on this canvas (a flake is 1 unit, the big ones 2); `night` 0..1.
 * Call it after the scene and its light, before the screen's own overlays.
 */
export function drawSnow(ctx, w, h, nowMs, night, unit = 1) {
  const n = flakesFor(night), t = nowMs / 1000, tint = night > 0.5 ? '#dce8ff' : '#ffffff';
  ctx.save();
  ctx.fillStyle = tint;
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.95 : 0.6;
    for (let i = 0; i < n; i++) {
      if (BIG[i] !== pass) continue;
      const y = ((Y[i] + t * SPEED[i]) % 1) * h, x = (X[i] + Math.sin(t * 0.9 + PHASE[i]) * SWAY[i] * 3) % 1;
      const px = Math.round((x < 0 ? x + 1 : x) * w / unit) * unit, py = Math.round(y / unit) * unit, s = unit * (pass ? 2 : 1);
      ctx.fillRect(px, py, s, s);
    }
  }
  ctx.restore();
}
