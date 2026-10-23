// "Entradas": the cosmetic pair by id that says how a visiting pet arrives in the town and how it leaves (stored with the trip on the server).
// Each id has an arrival and an exit. This file holds the timing as pure functions (tested) and the pixel drawing of the effects.
//   parachute  (default)  falls from the top of the screen under a canopy and lands; leaves lifted by a balloon
//   blue_bolt  (demo)     arrives as a bolt of blue lightning; leaves the same way
// More packs (a jungle vine, a barrel cannon...) are new ids here and in the server's list (supabase/functions/_shared/trip-code.js).

export const DEFAULT_ENTRANCE = 'parachute';
export const ENTRANCE_IDS = ['parachute', 'blue_bolt'];
/** Only these may be picked by a visitor today: the others need the dev flag (?dev=1&entrance=<id>). */
export const PUBLIC_ENTRANCES = ['parachute'];

const DURATION = { parachute: { arrive: 2600, leave: 2400 }, blue_bolt: { arrive: 900, leave: 900 } };

export const entranceId = (id) => (ENTRANCE_IDS.includes(id) ? id : DEFAULT_ENTRANCE);
export const entranceDuration = (id, phase) => DURATION[entranceId(id)][phase];

/** The id the dev flag asks for, or null: only with dev=1 and a known id. */
export function devEntrance(search) {
  const p = new URLSearchParams(search);
  const id = p.get('entrance');
  return p.get('dev') === '1' && ENTRANCE_IDS.includes(id) ? id : null;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * The state of an entrance `ms` after it began.
 *   done     the effect is over (an arrival: the pet is in place; an exit: the pet is gone)
 *   hidden   do not draw the pet itself
 *   lift     how far the pet is above its spot, as a fraction of the distance to the top edge of the screen (1 = just off screen)
 *   sway     horizontal swing in pixels
 *   canopy   0 none, 1 open canopy, 2 folded (parachute only)
 *   balloon  true while a balloon carries it (parachute exit)
 *   bolt     0..1 how far a lightning bolt has struck (0 none); flash 0..1 white-blue glare
 */
export function entranceState(id, phase, ms) {
  id = entranceId(id);
  const t = clamp01(ms / DURATION[id][phase]);
  const s = { done: t >= 1, hidden: false, lift: 0, sway: 0, canopy: 0, balloon: false, bolt: 0, flash: 0 };
  if (id === 'parachute') {
    if (phase === 'arrive') {
      s.lift = Math.pow(1 - t, 1.6);
      s.sway = Math.sin(t * 11) * 6 * (1 - t);
      s.canopy = t < 0.9 ? 1 : 2;
      if (t >= 1) { s.canopy = 0; s.lift = 0; s.sway = 0; }
    } else {
      s.lift = 1.15 * t * t;
      s.sway = Math.sin(t * 8) * 3 * t;
      s.balloon = !s.done;
      s.hidden = s.done;
    }
    return s;
  }
  // blue_bolt
  if (phase === 'arrive') {
    s.bolt = clamp01(t / 0.3);
    s.hidden = t < 0.3;
    s.flash = t < 0.3 ? 0 : 1 - (t - 0.3) / 0.7;
    if (t >= 1) { s.bolt = 0; s.flash = 0; }
    else if (t >= 0.45) s.bolt = 0;
  } else {
    s.flash = t < 0.4 ? t / 0.4 : 0;                       // it charges (the pet flickers), then the strike takes it
    s.bolt = t < 0.4 ? 0 : clamp01((t - 0.4) / 0.2);
    s.hidden = t >= 0.45;
    if (t >= 0.8) s.bolt = 0;
  }
  return s;
}

/** Does the pet flicker (blue_bolt leaving, while it charges)? */
export const flickers = (id, phase, ms) => entranceId(id) === 'blue_bolt' && phase === 'leave' && ms > 0 && ms < 360 && Math.floor(ms / 45) % 2 === 1;

// ---- drawing (one pixel = one game pixel, on the scene canvas) -----------------------------------------------------------------
const rect = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

function line(c, col, x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) rect(c, col, x0 + ((x1 - x0) * i) / (n || 1), y0 + ((y1 - y0) * i) / (n || 1), 1, 1);
}

function canopy(c, cx, top, folded) {
  const stripes = ['#e0605a', '#f4f6fa'];
  const w = folded ? 12 : 30, h = folded ? 6 : 12;
  for (let row = 0; row < h; row++) {
    const k = folded ? 1 : Math.sqrt(1 - Math.pow(1 - row / (h - 1), 2));
    const half = Math.max(2, Math.round((w / 2) * k));
    for (let x = -half; x < half; x++) rect(c, stripes[Math.floor((x + 40) / 5) % 2], cx + x, top + row, 1, 1);
    rect(c, '#181c2c', cx - half - 1, top + row, 1, 1); rect(c, '#181c2c', cx + half, top + row, 1, 1);
  }
  rect(c, '#181c2c', cx - Math.round(w / 2), top - 1, w, 1);
}

function balloon(c, cx, top) {
  const R = 8;
  for (let y = -R; y <= R; y++) {
    const half = Math.round(Math.sqrt(R * R - y * y));
    rect(c, y < -3 ? '#f8f0a0' : '#f8d040', cx - half, top + R + y, half * 2, 1);
    rect(c, '#181c2c', cx - half - 1, top + R + y, 1, 1); rect(c, '#181c2c', cx + half, top + R + y, 1, 1);
  }
  rect(c, '#f4f6fa', cx - 4, top + 3, 2, 3);
}

function bolt(c, x, yTop, yBottom, progress) {
  const len = Math.round((yBottom - yTop) * progress);
  let px = x - 3 + 6, py = yTop;
  const pts = [];
  for (let y = 0; y <= len; y += 6) { pts.push([px, yTop + y]); px = x + (((y / 6) % 2) ? 5 : -5) * (1 - y / Math.max(1, yBottom - yTop)); }
  pts.push([x, yTop + len]);
  for (let i = 1; i < pts.length; i++) {
    line(c, '#78d8ff', pts[i - 1][0] - 1, pts[i - 1][1], pts[i][0] - 1, pts[i][1]);
    line(c, '#78d8ff', pts[i - 1][0] + 1, pts[i - 1][1], pts[i][0] + 1, pts[i][1]);
    line(c, '#ffffff', pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
}

/**
 * Draws the effects of a state around a pet whose feet are at (fx, fy) on the scene, with `cell` the pet sprite's size.
 * `behind` effects (a bolt) go under the pet; call with front = false first, then true.
 */
export function drawEntranceFx(c, id, state, fx, fy, cell, front) {
  id = entranceId(id);
  const headY = fy - cell + 4;
  if (id === 'parachute') {
    if (!front) return;
    if (state.canopy === 1) {
      const top = headY - 22;
      canopy(c, fx, top, false);
      for (const dx of [-14, -7, 7, 14]) line(c, '#181c2c', fx + dx, top + 11, fx + Math.round(dx / 4), headY + 6);
    } else if (state.canopy === 2) {
      canopy(c, fx, headY - 8, true);
    }
    if (state.balloon) {
      const top = headY - 26;
      balloon(c, fx, top);
      line(c, '#181c2c', fx, top + 17, fx, headY + 8);
    }
    return;
  }
  if (!front) {
    if (state.bolt > 0) bolt(c, fx, 0, fy - 4, state.bolt);
    return;
  }
  if (state.flash > 0) {
    c.save();
    c.globalAlpha = 0.55 * state.flash;
    const r = Math.round(10 + 16 * state.flash);
    for (let dy = -r; dy <= r; dy += 2) { const half = Math.round(Math.sqrt(r * r - dy * dy)); rect(c, '#bfeaff', fx - half, fy - cell / 2 + dy, half * 2, 2); }
    c.restore();
  }
}
