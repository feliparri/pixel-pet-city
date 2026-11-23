// How much the HD-2D view can afford, from the frame times it actually gets (pure: the renderer feeds it each frame's interval).
// Levels go from the full picture down to the cheapest HD-2D one; when even that cannot hold the pace the governor says "flat" and the
// town falls back to the plain renderer (only after two slow windows in a row at the last level). It only ever steps down (a phone that cannot keep up will not suddenly manage), and it ignores
// the intervals of a hidden tab, and caps a single hitch (the world being built).

/** From the full picture to the cheapest: `res` scales the internal resolution, `rowStep` how many screen rows each ground row covers. */
export const LEVELS = [
  { res: 1, bloom: true, tiltshift: true, rowStep: 1 },
  { res: 0.8, bloom: true, tiltshift: true, rowStep: 1 },
  { res: 0.65, bloom: true, tiltshift: true, rowStep: 1 },
  { res: 0.65, bloom: true, tiltshift: false, rowStep: 1 },
  { res: 0.5, bloom: false, tiltshift: false, rowStep: 2 },
];

export const LEVEL_TTL_MS = 3 * 24 * 3600 * 1000;   // a saved level older than this is forgotten (a phone that struggled once gets a fresh try)

/** The text to store for a level saved at `now`: JSON with the time, so it can expire. */
export const encodeLevel = (level, now = Date.now()) => JSON.stringify({ l: level | 0, t: now });

/**
 * The level to start at from the stored text (null/garbage/expired: 0). The old format, a bare number with no time, counts as expired:
 * it may be weeks old and is exactly what kept phones stuck on a low level.
 */
export function decodeLevel(raw, now = Date.now()) {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || !Number.isFinite(v.t) || now - v.t > LEVEL_TTL_MS || v.t > now + 60000) return 0;
    return Math.max(0, Number(v.l) | 0);
  } catch { return 0; }
}

export const SLOW_MS = 36;                  // an average interval above this (under about 28 fps) is "cannot hold 30 fps"
const MAX_MS = 1500;                        // longer than this: the tab slept; not a measure of drawing
const CAP_MS = 150;                         // one frame counts for at most this, so a single hitch (the world building) cannot decide alone, but a device that takes this long every frame still does

/**
 * createGovernor({ start, levels, slowMs, window, warm, allowFlat }): push(intervalMs) after every frame returns 'down' (the level went
 * down one: read `level`), 'flat' (nothing cheaper is left and flat is allowed) or null. A decision needs `window` fair frames (or
 * `minFrames` of them once `maxWait` ms have passed), and `warm` frames after a change are not counted (the new size has to settle).
 */
export function createGovernor({ start = 0, levels = LEVELS, slowMs = SLOW_MS, window = 45, warm = 15, allowFlat = true, maxWait = 3000, minFrames = 8 } = {}) {
  let level = Math.min(Math.max(0, start), levels.length - 1), sum = 0, n = 0, skip = warm, elapsed = 0, armed = false;
  const g = {
    allowFlat,
    get level() { return level; },
    get settings() { return levels[level]; },
    get last() { return level === levels.length - 1; },
    push(ms) {
      if (!(ms > 0) || ms > MAX_MS) return null;
      if (skip > 0) { skip--; return null; }
      sum += Math.min(ms, CAP_MS); n++; elapsed += ms;
      if (n < window && !(elapsed >= maxWait && n >= minFrames)) return null;      // a very slow device decides after a few seconds, not after `window` frames
      const avg = sum / n;
      sum = 0; n = 0; elapsed = 0;
      if (avg <= slowMs) { armed = false; return null; }              // a fair window disarms the flat verdict
      skip = warm;
      if (level < levels.length - 1) { level++; return 'down'; }
      if (!g.allowFlat) return null;
      if (!armed) { armed = true; return null; }                      // the first slow window at the last level only arms it
      return 'flat';
    },
    /** Start counting again (the view was resized or switched, or the area changed). */
    reset() { sum = 0; n = 0; elapsed = 0; skip = warm; armed = false; },
  };
  return g;
}
