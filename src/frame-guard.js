// The frame loop that survives a throwing frame. A requestAnimationFrame callback that throws before it asks for the next frame ends the loop for good:
// the picture freezes half drawn and nothing recovers it. guardFrame asks for the next frame whatever the step did, and reports each distinct error
// a few times (not 60 times a second).

/**
 * guardFrame(step, schedule, { report, max }) returns the callback for requestAnimationFrame. `step(t)` draws one frame; it returns false to stop the loop
 * (the town was closed). `schedule(callback)` asks for the next frame. `report(error)` hears each distinct message up to `max` times in all.
 */
export function guardFrame(step, schedule, { report = (e) => console.error('Frame failed, carrying on', e), max = 5 } = {}) {
  const seen = new Map();
  let total = 0;
  return function frame(t) {
    let go = true;
    try { go = step(t) !== false; } catch (e) {
      const key = String(e && e.message || e);
      if (total < max && (seen.get(key) || 0) < 1) { total++; try { report(e); } catch { /* reporting must not stop the loop either */ } }
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    if (go) schedule(frame);
  };
}
