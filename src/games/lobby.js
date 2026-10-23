// The lobby of a game and who is the referee. Pure functions over plain data: the manager owns the clock and the network.
//
// A lobby is `{ g, r, opener, openedAt, deadline, joined: [ids in the order they joined], seekers: [ids that asked to search, in order], changedAt }`
// (`changedAt`: the last moment somebody joined, left or asked to search, so a start never lands right on top of a late button press).
// Nobody owns it: whoever presses "Jugar a ..." opens it and joins it like everyone else. Two lobbies opened at the same moment converge
// on the smaller `lobbyKey` on every browser.
import { GAME_RULES, MAX_PLAYERS, EARLY_START_MS, SETTLE_MS } from './rules.js';

export const lobbyKey = (l) => `${l.r}:${l.opener}`;

export function openLobby({ g, r, opener, now, leftMs }) {
  return { g, r, opener, openedAt: now, changedAt: now, deadline: now + leftMs, joined: [opener], seekers: [] };
}

export function joinLobby(l, id, now = l.changedAt) {
  if (l.joined.includes(id) || l.joined.length >= MAX_PLAYERS) return false;
  l.joined.push(id); l.changedAt = now;
  return true;
}

export function leaveLobby(l, id, now = l.changedAt) {
  const i = l.joined.indexOf(id);
  if (i < 0) return false;
  l.joined.splice(i, 1);
  l.seekers = l.seekers.filter((s) => s !== id);
  l.changedAt = now;
  return true;
}

/** "¡Yo busco!": only a player who joined, once. */
export function volunteerSeeker(l, id, now = l.changedAt) {
  if (!l.joined.includes(id) || l.seekers.includes(id)) return false;
  l.seekers.push(id); l.changedAt = now;
  return true;
}

/** The referee: the lowest peer id among `ids` that are present, or null. Everybody computes it the same way from the same ids. */
export function electReferee(ids, present) {
  let best = null;
  for (const id of ids) if (present.has(id) && (best === null || id < best)) best = id;
  return best;
}

/**
 * True when the lobby should start now: its time is up, or everybody present joined, the short minimum has passed and nobody changed
 * anything for SETTLE_MS (a player who just joined still has to find "¡Yo busco!" or choose the zone).
 */
export function lobbyReady(l, now, present) {
  if (now >= l.deadline) return true;
  return now - l.openedAt >= EARLY_START_MS && now - l.changedAt >= SETTLE_MS && Array.from(present).every((id) => l.joined.includes(id));
}

/**
 * Who searches. A volunteer (the first who asked); when nobody did, the player who searched least so far, then the one who joined first.
 * `seekCount` maps id -> how many rounds that peer searched in this room.
 */
export function pickSeeker(roster, volunteers, seekCount) {
  const asked = volunteers.find((id) => roster.includes(id));
  if (asked) return asked;
  let best = null;
  for (const id of roster) if (best === null || (seekCount.get(id) || 0) < (seekCount.get(best) || 0)) best = id;
  return best;
}

/**
 * The start message's content for a lobby that is ready: `{ g, r, p: roster, s: seeker index }`, or null when too few players are still here
 * (the lobby is cancelled). Only players who are present stay on the roster.
 */
export function buildStart(l, present, seekCount) {
  const rules = GAME_RULES[l.g];
  const roster = l.joined.filter((id) => present.has(id));
  if (!rules || roster.length < rules.min) return null;
  const seeker = l.g === 'hide' ? pickSeeker(roster, l.seekers, seekCount) : null;
  return { g: l.g, r: l.r, p: roster, s: seeker === null ? -1 : roster.indexOf(seeker) };
}
