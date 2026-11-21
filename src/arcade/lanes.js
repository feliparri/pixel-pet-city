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
 * The logical canvas for a container of cw x ch css px. Portrait (taller than wide): every logical pixel is `px` css px, the width is clamped to a
 * phone-like column and the height to a range that keeps the scene's proportions (the canvas is stretched to the frame). Landscape: the canvas matches the
 * frame's aspect with ONE whole-number scale (`px`, grown with the height so a big screen does not show a tiny world), so pixels stay square; `fit` is the
 * canvas's exact css size (w * px by h * px, the leftover is under one logical pixel).
 */
export function logicalSize(cw, ch, px = 2, { minW = 160, maxW = 250, minH = 260, maxH = 480, wideH = 195, maxWideW = 600 } = {}) {
  if (!(cw > 0) || !(ch > 0)) return { w: 195, h: 340, px, wide: false };
  if (cw > ch) {
    const k = Math.max(px, Math.floor(ch / wideH)), w = Math.min(maxWideW, Math.max(minW, Math.floor(cw / k))), h = Math.max(100, Math.floor(ch / k));
    return { w, h, px: k, wide: true, fit: { w: w * k, h: h * k } };
  }
  return { w: Math.max(minW, Math.min(maxW, Math.round(cw / px))), h: Math.max(minH, Math.min(maxH, Math.round(ch / px))), px, wide: false };
}

/**
 * Where the pseudo-3D sits on a logical canvas: portrait uses the width for the lane size and a taller sky; a wide canvas sizes the lanes by its height (so the
 * sprites keep the size they have in portrait), lifts the horizon to show more road ahead, and leaves the sides to scenery.
 */
export function viewLayout(w, h, { horizon = 0.36 } = {}) {
  const wide = w > h;
  return { horizon: Math.round(h * (wide ? horizon - 0.07 : horizon)), ground: Math.round(h * (wide ? 0.8 : 0.82)), laneW: Math.round((wide ? h : w) * 0.27) };
}
