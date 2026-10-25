// The obstacle race on the pista, as pure rules. A race is `{ roster, f, phase: 'count'|'play', phaseEnd, firstAt }`: `f[i]` is the place of
// roster index i (1 first, 2 second, ...), 0 while it is still running and -2 when the pet left. The referee watches the pets' tiles and gives
// the places in the order they reach the finish row; the obstacles' slowdown is each pet's own (it walks slower for a moment), so every
// other screen sees it simply by the slower steps.
import { GAME_RULES } from './rules.js';
import { TRACK, isObstacle } from '../map.js';

export const RACE = GAME_RULES.race;

/** Where the k-th player lines up: below the start line, across the three lanes, then the next row down. */
export const startSlot = (k) => [TRACK.x0 + (k % 3), TRACK.yBottom + 1 + (Math.floor(k / 3) % 3)];

/** A pet ({ x, y } tile) has finished when it stands on the finish row between the lanes. */
export const hasFinished = (p) => !!p && p.y <= TRACK.yTop && p.x >= TRACK.x0 && p.x <= TRACK.x1;

/**
 * Advances a race (referee only). `pos(id)` gives a pet's tile or null, `present(id)` says the pet is still in the game. Returns the events:
 * `{ type: 'finish', i, n }` and, last, `{ type: 'end', reason }` ('all' finished or gone, 'time' up: the race's limit, or RACE.capMs after
 * the first finisher). Pets that arrive in the same tick are placed in roster order.
 */
export function tickRace(s, now, pos, present) {
  const events = [];
  s.roster.forEach((id, i) => { if (s.f[i] === 0 && !present(id)) s.f[i] = -2; });
  if (s.phase === 'play') {
    let n = s.f.filter((v) => v > 0).length;
    s.roster.forEach((id, i) => {
      if (s.f[i] !== 0 || !hasFinished(pos(id))) return;
      s.f[i] = ++n;
      if (s.firstAt === null) s.firstAt = now;
      events.push({ type: 'finish', i, n });
    });
  }
  if (!s.f.some((v) => v === 0)) events.push({ type: 'end', reason: 'all' });
  else if (s.phase === 'play' && (now >= s.phaseEnd || (s.firstAt !== null && now >= s.firstAt + RACE.capMs))) events.push({ type: 'end', reason: 'time' });
  return events;
}

/** Stars for a place among `racers` pets: 5, 3, 2, then 1 for any other finisher; nothing for those who did not finish or when racing alone. */
export function raceStars(place, racers) {
  if (place <= 0 || racers < 2) return 0;
  return RACE.stars[place - 1] ?? RACE.finishStars;
}

/** The results rows in roster order: `{ i, place (0 did not finish), stars }`. */
export const raceResults = (f) => f.map((place, i) => ({ i, place: place > 0 ? place : 0, stars: raceStars(place, f.length) }));

/** Did the pet just step onto an obstacle? `prev` is the tile it was on (or null), `tile` the one it is on now. */
export const stumbled = (prev, tile) => !!tile && isObstacle(tile.x, tile.y) && !(prev && prev.x === tile.x && prev.y === tile.y);

/** The ms per step of a pet that stumbled until `slowUntil` (a clock in ms), or null for its normal pace. */
export const paceAt = (now, slowUntil) => (now < slowUntil ? RACE.slowStepMs : null);
