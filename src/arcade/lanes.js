// The arcade's pseudo-3D: the camera sits behind the player looking down a straight track with three lanes. A point is a lane (-1, 0, 1) and a distance z
// ahead of the player (z = 0 is the player's feet). Everything on screen follows from one number, the scale k = focal / (focal + z): 1 at the player,
// shrinking towards 0 at the horizon. A ground row is at y = horizon + (ground - horizon) * k, so k is also linear in y, which is what lets the
// scene be painted one screen row at a time (rowZ is the inverse).
export const LANES = [-1, 0, 1];
export const clampLane = (l) => Math.max(-1, Math.min(1, l));

/**
 * { w, h } the logical canvas, `horizon` and `ground` the rows of the horizon and of the player's feet, `laneW` the width of a lane at the player (px),
 * `focal` how fast things shrink (smaller: a steeper, more dramatic perspective).
 */
export function createProjection({ w, h, horizon, ground, laneW, focal = 52 }) {
  const span = ground - horizon;
  const p = {
    w, h, horizon, ground, laneW, focal,
    /** Scale at distance z (z >= -focal + 1). */
    k: (z) => focal / (focal + z),
    /** Screen row of the ground at distance z. */
    y: (z) => horizon + span * (focal / (focal + z)),
    /** Screen x of lane `lane` (may be fractional, mid-slide) at distance z, the camera `cam` lanes off the centre. */
    x: (lane, z, cam = 0) => w / 2 + (lane - cam) * laneW * (focal / (focal + z)),
    /** The ground distance shown on screen row y (> horizon). */
    rowZ: (y) => focal * (span / (y - horizon) - 1),
    /** { x, y, s } of a point on the ground. */
    project(lane, z, cam = 0) { const k = focal / (focal + z); return { x: w / 2 + (lane - cam) * laneW * k, y: horizon + span * k, s: k }; },
  };
  return p;
}

/**
 * The logical canvas for a container of cw x ch css px: every logical pixel is `px` css px (a whole number, so the art stays crisp), the width is clamped
 * to a phone-like column and the height to a range that keeps the scene's proportions.
 */
export function logicalSize(cw, ch, px = 2, { minW = 160, maxW = 250, minH = 260, maxH = 480 } = {}) {
  if (!(cw > 0) || !(ch > 0)) return { w: 195, h: 340, px };
  return { w: Math.max(minW, Math.min(maxW, Math.round(cw / px))), h: Math.max(minH, Math.min(maxH, Math.round(ch / px))), px };
}
