// Night lighting maths (pure): how much a lamp lights a point, the night colour of the world and how a lit sprite is graded.
export const NIGHT_TINT = [66, 82, 150];        // what the world is multiplied by at full night (deep blue)
export const LAMP_RADIUS = 92;                   // world px: how far a lamp's pool of light reaches on the ground

/** 0..1 light of one source at (x, y): 1 at the source, falling off smoothly to 0 at `radius` (the square of the linear falloff). */
export function falloff(dist, radius) {
  if (dist >= radius) return 0;
  const k = 1 - dist / radius;
  return k * k;
}

/** Total light 0..1 at (x, y) from sources [{ x, y, r?, k? }]. A rounded sum so overlapping pools never pass 1. */
export function lightAt(sources, x, y) {
  let dark = 1;
  for (const s of sources) dark *= 1 - (s.k ?? 1) * falloff(Math.hypot(x - s.x, y - s.y), s.r ?? LAMP_RADIUS);
  return 1 - dark;
}

/** The colour multiplied over the world for a night amount 0..1 (255 = untouched). */
export function nightMultiply(n, tint = NIGHT_TINT) {
  return tint.map((c) => Math.round(255 + (c - 255) * n));
}

/** How a sprite is graded at night amount `n` lit by `l` (0..1): the alpha of the dark blue veil and of the warm lamp wash over its pixels. */
export function spriteGrade(n, l) {
  return { veil: 0.64 * n * (1 - 0.92 * l), warm: 0.3 * n * l };
}

/** A night amount moved towards its target at `rate` per second (never overshoots). */
export function approach(value, target, dtMs, rate = 1.1) {
  const step = (rate * dtMs) / 1000;
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** The colour multiplied over the ground for the town's clock (`amb`: { tint, night }, see daynight.js): the clock's own tint (warm at dusk and dawn), sliding to this view's deeper blue as the night comes in. */
export function groundMult(amb) {
  const n = Math.min(1, Math.max(0, amb.night));
  return amb.tint.map((c, i) => Math.round(c + (NIGHT_TINT[i] - c) * n));
}
