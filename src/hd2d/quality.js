// How much the HD-2D view can afford, from the frame times it actually gets (pure: the renderer feeds it each frame's interval).
// Levels go from the full picture down to the cheapest HD-2D one; when even that cannot hold the pace the governor says "flat" and the
// town falls back to the plain renderer. It only ever steps down (a phone that cannot keep up will not suddenly manage), and it ignores
// the intervals of a hidden tab, and caps a single hitch (the world being built).

/** From the full picture to the cheapest: `res` scales the internal resolution, `rowStep` how many screen rows each ground row covers. */
export const LEVELS = [
  { res: 1, bloom: true, tiltshift: true, rowStep: 1 },
  { res: 0.8, bloom: true, tiltshift: true, rowStep: 1 },
  { res: 0.65, bloom: true, tiltshift: true, rowStep: 1 },
  { res: 0.65, bloom: true, tiltshift: false, rowStep: 1 },
  { res: 0.5, bloom: false, tiltshift: false, rowStep: 2 },
];

export const SLOW_MS = 36;                  // an average interval above this (under about 28 fps) is "cannot hold 30 fps"
const MAX_MS = 1500;                        // longer than this: the tab slept; not a measure of drawing
const CAP_MS = 150;                         // one frame counts for at most this, so a single hitch (the world building) cannot decide alone, but a device that takes this long every frame still does

/**
 * createGovernor({ start, levels, slowMs, window, warm, allowFlat }): push(intervalMs) after every frame returns 'down' (the level went
 * down one: read `level`), 'flat' (nothing cheaper is left and flat is allowed) or null. A decision needs `window` fair frames (or
 * `minFrames` of them once `maxWait` ms have passed), and `warm` frames after a change are not counted (the new size has to settle).
 */
export function createGovernor({ start = 0, levels = LEVELS, slowMs = SLOW_MS, window = 45, warm = 15, allowFlat = true, maxWait = 3000, minFrames = 8 } = {}) {
  let level = Math.min(Math.max(0, start), levels.length - 1), sum = 0, n = 0, skip = warm, elapsed = 0;
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
      if (avg <= slowMs) return null;
      skip = warm;
      if (level < levels.length - 1) { level++; return 'down'; }
      return g.allowFlat ? 'flat' : null;
    },
    /** Start counting again (the view was resized or switched). */
    reset() { sum = 0; n = 0; elapsed = 0; skip = warm; },
  };
  return g;
}
