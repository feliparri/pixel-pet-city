// Small keyboard rules of the town, apart from the DOM so they can be tested.

/** Is the key event aimed at a text field? Then the town ignores it (typing a room code must not walk, run or jump the pet). */
export const isTyping = (ev) => !!ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);

/** Is it the jump key? */
export const isJumpKey = (ev) => ev.key === ' ' || ev.code === 'Space';

/** Does a held arrow key run now? Shift runs only in the free walk: a pet in a game (`mv` from games.movement()) keeps the game's pace. */
export const runs = (shift, mv) => !!shift && !mv.closed && !mv.zone && !mv.frozen;

/** Is this a phone or tablet (a coarse pointer, no hover, or touch events)? `win` is the window; the town then shows its on-screen controls. */
export const isTouchDevice = (win) => {
  if (!win) return false;
  const mq = (q) => !!(win.matchMedia && win.matchMedia(q).matches);
  return mq('(pointer: coarse)') || mq('(hover: none)') || 'ontouchstart' in win;
};

/** The direction a thumb on the D-pad means: (dx, dy) is its offset from the centre, `half` the pad's half size; null in the dead centre. */
export function dpadDir(dx, dy, half) {
  if (Math.hypot(dx, dy) < half * 0.25) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}
