// Small keyboard rules of the town, apart from the DOM so they can be tested.

/** Is the key event aimed at a text field? Then the town ignores it (typing a room code must not walk, run or jump the pet). */
export const isTyping = (ev) => !!ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);

/** Does a held arrow key run now? Shift runs only in the free walk: a pet in a game (`mv` from games.movement()) keeps the game's pace. */
export const runs = (shift, mv) => !!shift && !mv.closed && !mv.zone && !mv.frozen;
