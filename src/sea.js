// Swimming, as pure rules: how deep the water under a pet is, how fast a species goes through it, and how it is drawn. A pet wades through the shallows at the normal
// pace and swims through deep water (the break included): the frog and the cat slower, the seal faster than it walks. The same rule drives the own pet, the remote pets (their
// walkers ask it for each step, so a swimming seal is drawn at the pace it really swims) and the splash of their steps.
import { waterAt } from './map.js';

/** Step time in deep water, as a multiple of the walking step (STEP_MS). */
export const SWIM_PACE = { frog: 1.25, cat: 1.25, seal: 0.75 };
export const DEFAULT_SWIM_PACE = 1.25;

/** 'shallow', 'deep' or null for the tile (x, y) of `area`. */
export const depthAt = (area, x, y) => waterAt(x, y, area);

/** The step time multiplier for a pet of `species` stepping onto (x, y), on its board or not: 1 on land and in the shallows. */
export function paceFactor(area, x, y, species, board = false) {
  return depthAt(area, x, y) === 'deep' ? (SWIM_PACE[species] ?? DEFAULT_SWIM_PACE) * (board ? BOARD_PACE : 1) : 1;
}
/** Paddling on a board is quicker than swimming: a step in deep water takes this much of the swimmer's. */
export const BOARD_PACE = 0.8;

/**
 * The water a walker is in, for its pose: the tile it started the step on for the first half of the step, the one it is going to after that (so the pet sinks and
 * rises half way between two tiles). `w` is a Walker: { fx, fy, tx, ty, moving, t, stepMs() }.
 */
export function waterOf(area, w) {
  const half = w.moving && w.t >= w.stepMs() / 2;
  return depthAt(area, half || !w.moving ? w.tx : w.fx, half || !w.moving ? w.ty : w.fy);
}

/** How a pet is drawn in the water: art px the sprite sinks, and art px cut off its lower end (the part under the surface). */
export const SUBMERGE = { sink: 5, cut: 6 };

// ---- the camera in the water -------------------------------------------------------------------------------------------------------------------
/** In the water the camera eases out to show this much more of the world each way (1 + SWIM_OUT times as much at full zoom), over about ZOOM_SECS. */
export const SWIM_OUT = 0.25;
export const ZOOM_SECS = 1.2;
/** How far out the camera wants to be for the water under the pet: 1 in deep water, a little in the shallows (the way in), 0 on land. */
export const zoomTarget = (water) => (water === 'deep' ? 1 : water === 'shallow' ? 0.35 : 0);
/** The factor the camera's `out` is multiplied by for an eased zoom amount `k` (0..1): smooth at both ends. */
export const zoomFactor = (k) => { const c = Math.min(1, Math.max(0, k)); return 1 + SWIM_OUT * c * c * (3 - 2 * c); };
