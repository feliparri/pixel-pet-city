// The jump (Space): a short hop in place or on the move. Cosmetic only: no game rule reads it, and the pet's tile does not change.

export const JUMP_MS = 400;             // from take-off to landing; also the least time between two jumps
export const JUMP_PX = 9;               // the height of the arc, in game pixels

/** How high above the ground (px) a pet that jumped at `since` is at `now`: a half sine, 0 before, after and when it never jumped. */
export function jumpLift(now, since) {
  const k = (now - since) / JUMP_MS;
  return since != null && k >= 0 && k < 1 ? Math.round(Math.sin(k * Math.PI) * JUMP_PX) : 0;
}
