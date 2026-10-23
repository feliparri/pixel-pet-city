// Hide and seek (Escondida), as pure rules. A game is `{ roster, seeker (index), phase: 'count'|'search', phaseEnd (clock ms), found }`:
// `found[i]` is the second of the search when hider i was found, -1 while hidden, -2 when the pet left. The clock is a deadline, not a counter,
// so another browser can take over as referee with nothing but the last state it saw.
import { GAME_RULES } from './rules.js';

const R = GAME_RULES.hide;

/** Same tile or a neighbour (diagonals too): the distance of a "touch". */
export const touching = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;

/**
 * Does the seeker see a pet? Only inside the circle of light around the seeker (`radius` tiles, between tile centres); a pet in a bush
 * is hidden even there, unless it is touching the seeker. `inBush` is whether the pet's tile hides. Pure: the same answer on every browser.
 */
export function seekerSees(seeker, pet, inBush, radius = R.lightRadius) {
  if (touching(seeker, pet)) return true;
  if (inBush) return false;
  return Math.hypot(seeker.x - pet.x, seeker.y - pet.y) <= radius;
}

export function createHide({ roster, seeker, now }) {
  return { roster: roster.slice(), seeker, phase: 'count', phaseEnd: now + R.countMs, found: roster.map(() => -1) };
}

/** Milliseconds into the search (0 before it starts). */
export const searchElapsed = (s, now) => (s.phase === 'search' ? Math.max(0, R.searchMs - (s.phaseEnd - now)) : 0);
export const hidersLeft = (s) => s.found.filter((f, i) => i !== s.seeker && f === -1).length;

/**
 * Advances the game to `now` (referee only). `pos(id)` gives a pet's tile or null; `present(id)` says the pet is still in the game.
 * Returns the events: `{ type: 'search' }`, `{ type: 'found', i, at }` and, last, `{ type: 'end', reason }` ('all' found, 'time' up, 'left' the seeker went).
 */
export function tickHide(s, now, pos, present) {
  const events = [];
  s.roster.forEach((id, i) => { if (s.found[i] === -1 && !present(id)) s.found[i] = -2; });
  if (s.found[s.seeker] === -2) return [{ type: 'end', reason: 'left' }];
  // the search runs 90 s from now, not from the old deadline: a referee that woke up late (a hidden tab) must not eat it
  if (s.phase === 'count' && now >= s.phaseEnd) { s.phase = 'search'; s.phaseEnd = now + R.searchMs; events.push({ type: 'search' }); }
  if (s.phase === 'search') {
    const at = Math.floor(searchElapsed(s, now) / 1000), me = pos(s.roster[s.seeker]);
    if (me) s.roster.forEach((id, i) => {
      if (i === s.seeker || s.found[i] !== -1) return;
      const p = pos(id);
      if (p && touching(me, p)) { s.found[i] = at; events.push({ type: 'found', i, at }); }
    });
  }
  if (!s.found.some((f, i) => i !== s.seeker && f === -1)) events.push({ type: 'end', reason: s.found.some((f, i) => i !== s.seeker && f >= 0) ? 'all' : 'left' });
  else if (s.phase === 'search' && now >= s.phaseEnd) events.push({ type: 'end', reason: 'time' });
  return events;
}

/**
 * The stars of roster index `i` at the end: +1 for each hider never found, +1 for the seeker per hider found; nothing when the seeker left.
 * `f` is the final `found` array and `reason` the end reason.
 */
export function hideStars(i, seeker, f, reason) {
  if (reason === 'left') return 0;
  if (i === seeker) return f.filter((v, j) => j !== seeker && v >= 0).length;
  return f[i] === -1 ? 1 : 0;
}

/** The results rows, in roster order: `{ i, role, found (seconds or -1 survived or -2 left), stars }`. */
export function hideResults(seeker, f, reason) {
  return f.map((found, i) => ({ i, role: i === seeker ? 'seeker' : 'hider', found, stars: hideStars(i, seeker, f, reason) }));
}
