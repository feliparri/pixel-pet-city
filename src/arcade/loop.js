// The arcade's fixed-step loop: the game's rules advance in equal steps (so a run is the same on every screen, and a seed gives the same run), the picture
// is drawn once per animation frame. `advance` is the pure accumulator (tested); `createLoop` ties it to requestAnimationFrame.
export const STEP_MS = 1000 / 60;
export const MAX_STEPS = 6;                         // a long stall (a hidden tab) never replays more than this many steps

/** How many fixed steps fit in `dtMs` on top of the `acc` left over: { steps, acc }. A stall beyond `maxSteps` is dropped, not replayed. */
export function advance(acc, dtMs, stepMs = STEP_MS, maxSteps = MAX_STEPS) {
  let a = acc + Math.max(0, dtMs);
  let steps = Math.floor(a / stepMs);
  a -= steps * stepMs;
  if (steps > maxSteps) { steps = maxSteps; a = 0; }
  return { steps, acc: a };
}

/**
 * step(stepMs) runs the rules, render(alpha) draws (alpha: how far into the next step, 0..1). The timers are parameters so a test can drive it.
 * start / stop / running; a stopped loop keeps nothing scheduled.
 */
export function createLoop({ step, render, stepMs = STEP_MS, maxSteps = MAX_STEPS, raf = (f) => requestAnimationFrame(f), caf = (h) => cancelAnimationFrame(h), now = () => performance.now() }) {
  let handle = null, last = 0, acc = 0;
  function frame(t) {
    handle = null;
    const r = advance(acc, t - last, stepMs, maxSteps);
    last = t; acc = r.acc;
    for (let i = 0; i < r.steps; i++) step(stepMs);
    render(acc / stepMs);
    if (handle === null && running) handle = raf(frame);
  }
  let running = false;
  return {
    start() { if (running) return; running = true; last = now(); acc = 0; handle = raf(frame); },
    stop() { running = false; if (handle !== null) { caf(handle); handle = null; } },
    get running() { return running; },
  };
}
