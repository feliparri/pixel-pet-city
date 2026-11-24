// The one button of fishing: hold to charge and to reel, release to cast, tap on the bite. Several sources can hold it (a finger on the picture, the big button,
// the space bar): it is down while any of them is, so two fingers never press twice. `createHold` is pure (tested); `attachFishInput` is the DOM glue.
export function createHold({ press, release }) {
  const held = new Set();
  return {
    down(src) { if (held.has(src)) return; const first = held.size === 0; held.add(src); if (first) press(); },
    up(src) { if (!held.delete(src)) return; if (held.size === 0) release(); },
    clear() { if (held.size) { held.clear(); release(); } },
    get held() { return held.size > 0; },
  };
}

/** The action of a key: 'hold' (space), 'pause' (Escape or P), or null. */
export const fishKey = (key) => (key === ' ' ? 'hold' : key === 'Escape' || key === 'p' || key === 'P' ? 'pause' : null);

/**
 * Wires `surfaces` (elements that hold the button while a pointer is down on them) and the keyboard to `hold`; `canHold()` says whether the play screen is up.
 * onPause() is Escape or P. Returns a detach function.
 */
export function attachFishInput(surfaces, hold, { onPause, canHold = () => true, win = window } = {}) {
  const off = [];
  for (const el of surfaces) {
    const down = (e) => { if (e.button > 0 || !canHold()) return; e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* no capture */ } hold.down(`p${e.pointerId}`); };
    const up = (e) => hold.up(`p${e.pointerId}`);
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    off.push(() => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); });
  }
  const keyDown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = fishKey(e.key);
    if (a === 'hold' && canHold()) { e.preventDefault(); if (!e.repeat) hold.down('key'); } else if (a === 'pause' && !e.repeat) { e.preventDefault(); onPause && onPause(); }
  };
  const keyUp = (e) => { if (fishKey(e.key) === 'hold') { if (canHold()) e.preventDefault(); hold.up('key'); } };
  win.addEventListener('keydown', keyDown); win.addEventListener('keyup', keyUp);
  return () => { off.forEach((f) => f()); win.removeEventListener('keydown', keyDown); win.removeEventListener('keyup', keyUp); hold.clear(); };
}
