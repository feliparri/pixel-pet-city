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

export const STICK_DEAD = 0.2;          // the thumb must leave this share of the stick's radius before the pet moves
export const STICK_RUN = 0.7;           // pushed beyond this share of the radius = run

/**
 * What a thumb on the virtual stick means: (dx, dy) is its offset from the stick's centre (screen y grows down), `radius` the stick's reach.
 * Returns { dirs, run }: `dirs` holds 0 directions in the dead zone, 1 on an axis sector and 2 on a diagonal (8 sectors of 45 degrees,
 * the axes centred on their sector); `run` is true past STICK_RUN of the radius.
 */
export function stickState(dx, dy, radius) {
  const dist = Math.hypot(dx, dy);
  if (!(radius > 0) || dist < radius * STICK_DEAD) return { dirs: [], run: false };
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));        // 0 = right, 2 = down (y down), -2 = up, +-4 = left
  const dirs = [['right'], ['right', 'down'], ['down'], ['left', 'down'], ['left'], ['left', 'up'], ['up'], ['right', 'up']][((sector % 8) + 8) % 8];
  return { dirs, run: dist > radius * STICK_RUN };
}

/** Does a pointer-down on the map walk the pet there? A finger does not while the stick is on screen (`stickOn`); a mouse always does. */
export const tapWalks = (pointerType, stickOn) => !stickOn || pointerType === 'mouse';
