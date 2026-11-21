// What the player's fingers and keys mean in the arcade: left / right (swipe, tap on a half of the screen, arrows or A / D), jump (swipe up, up, W or Space; the
// skate uses it), pause (Escape or P). The decisions are pure (tested); `attachInput` is the DOM glue.
export const SWIPE_PX = 22;                          // a drag this long is a swipe
export const TAP_PX = 10;                            // a touch that moved less than this is a tap

/** The direction of a drag (dx, dy in px), or null when it is too short. The longer axis wins. */
export function swipeDirection(dx, dy, min = SWIPE_PX) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < min) return null;
  if (ax >= ay) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'jump' : 'down';
}

/** A tap at x (0..width) is a left or a right move. */
export const tapSide = (x, width) => (x < width / 2 ? 'left' : 'right');

const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', ArrowDown: 'down', s: 'down', S: 'down', Escape: 'pause', p: 'pause', P: 'pause' };
/** The action of a key ('left' | 'right' | 'jump' | 'down' | 'pause') or null. */
export const keyAction = (key) => KEYS[key] || null;

/**
 * Listens on `el` (the play surface) and the window's keys; calls onAction(action) for left / right / jump / down / pause. A drag fires once per gesture as
 * soon as it is long enough (so the lane changes under the thumb, not on release); a short touch is a tap on the left or right half. Returns a detach function.
 */
export function attachInput(el, onAction, { win = window } = {}) {
  let start = null;
  const down = (e) => { if (e.button > 0) return; start = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false }; try { el.setPointerCapture(e.pointerId); } catch { /* no capture */ } };
  const move = (e) => {
    if (!start || start.done || e.pointerId !== start.id) return;
    const a = swipeDirection(e.clientX - start.x, e.clientY - start.y);
    if (a) { start.done = true; onAction(a); }
  };
  const up = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const s = start; start = null;
    if (s.done || Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_PX) return;
    const r = el.getBoundingClientRect();
    onAction(tapSide(e.clientX - r.left, r.width));
  };
  const cancel = () => { start = null; };
  const key = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = keyAction(e.key);
    if (!a) return;
    e.preventDefault();
    if (!e.repeat) onAction(a);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  win.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel); win.removeEventListener('keydown', key);
  };
}
