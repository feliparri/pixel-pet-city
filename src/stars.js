// The stars a pet earns in the town's games. They belong to the real pet: they live in the trip's server state (`trip-save`, a small
// versioned blob `{ v: 1, stars: n, ... }`), not in this browser, and later travel home with the pet. Until the shop exists they are only
// counted and shown in the HUD ("⭐ 12").
export const STATE_V = 1;
const MAX_STARS = 999999;

/** The star count in a trip's state blob (0 for anything that is not a count). */
export function starsFromState(data) {
  const n = data && typeof data === 'object' ? data.stars : 0;
  return Number.isInteger(n) && n >= 0 ? Math.min(n, MAX_STARS) : 0;
}

/** The blob to save: everything already there is kept (other stages add their own keys), with the version and the stars. */
export function stateWithStars(data, n) {
  const base = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return { ...base, v: STATE_V, stars: n };
}

/** A counter. `persist(n)` is called after every change (the saver below); without it the count lives for this visit only. */
export function createStars({ initial = 0, persist = () => {} } = {}) {
  let n = Number.isInteger(initial) && initial >= 0 ? Math.min(initial, MAX_STARS) : 0;
  return {
    get: () => n,
    add(k) {
      if (!Number.isInteger(k) || k <= 0) return n;
      n = Math.min(MAX_STARS, n + k);
      persist(n);
      return n;
    },
  };
}

/**
 * Saves the latest count to the server a little after the last change, one request at a time; a failed save is tried again later
 * (the count is never lost while the page is open). `send(n)` resolves true when the server took it. `flush()` saves right away.
 */
export function createStarSaver(send, { delayMs = 1500, retryMs = 5000, setTimeout: setT = globalThis.setTimeout, clearTimeout: clearT = globalThis.clearTimeout } = {}) {
  let wanted = null, saved = null, timer = null, busy = false;
  async function run() {
    timer = null;
    if (busy || wanted === null || wanted === saved) return;
    busy = true;
    const n = wanted;
    let ok = false;
    try { ok = await send(n); } catch { ok = false; }
    busy = false;
    if (ok) saved = n;
    if (wanted !== saved) timer = setT(run, ok ? delayMs : retryMs);
  }
  return {
    save(n) { wanted = n; if (!timer && !busy) timer = setT(run, delayMs); },
    flush() { if (timer) { clearT(timer); timer = null; } return run(); },
    get pending() { return wanted !== null && wanted !== saved; },
  };
}
