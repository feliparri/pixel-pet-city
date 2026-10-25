// The radar: the phone app lists the pets of the room its pet is visiting. This browser is the one that knows them (it hears every pet's
// presence), so it saves them inside the trip's state (`state.radar`, docs/trip-api.md) every few seconds; the server hands them to the
// board's phone. Nothing here touches the DOM or the network directly: the pieces are pure or take their timers and `send` as arguments.
import { ACTIVITIES } from './protocol.js';

export const RADAR_PETS_MAX = 8;
export const RADAR_EVERY_MS = 10000;
export const STATE_MAX = 2048;                       // the server's limit on the serialized trip state (supabase/functions/trip/handlers.js)

const GAME_ACTIVITY = { hide: 'hide', chicken: 'chicken', soccer: 'football', race: 'race' };

/** What a pet is doing: playing a game (only a player, not a spectator), inside the shop, walking, or nothing. One of ACTIVITIES. */
export function activityOf({ area, game, moving }) {
  const g = game && game.play ? GAME_ACTIVITY[game.g] : null;
  if (g) return g;
  if (area === 'shop') return 'shop';
  return moving ? 'walk' : 'idle';
}

/** The pets of a room as the radar lists them: this pet first, then the others by id; only pets whose stats are known; at most RADAR_PETS_MAX.
 *  entry: { id, name, look: { species, stage }, stats, act }. */
export function radarPets(self, others) {
  const sorted = others.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [self, ...sorted]
    .filter((p) => p && p.look && Array.isArray(p.stats) && p.stats.length === 5)
    .slice(0, RADAR_PETS_MAX)
    .map((p) => ({ n: p.name, sp: p.look.species, st: p.look.stage, s: p.stats.slice(), a: ACTIVITIES.includes(p.act) ? p.act : 'idle' }));
}

/** The radar object to save. `room` '' (and no pets) says the pet is not in a room; `nowMs` is the browser clock. */
export const radarOf = (room, pets, nowMs) => ({ room: room || '', at: Math.floor(nowMs / 1000), pets: room ? pets.slice(0, RADAR_PETS_MAX) : [] });

/** The state to save: what is already there (the stars, other keys) with the radar, fewer pets when it would not fit `max` characters. */
export function stateWithRadar(data, radar, max = STATE_MAX) {
  const base = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const r = { ...radar, pets: radar.pets.slice() };
  let out = { ...base, radar: r };
  while (JSON.stringify(out).length > max && r.pets.length) r.pets.pop();
  if (JSON.stringify(out).length > max) { out = { ...base }; delete out.radar; }       // not even an empty one fits: keep what was there
  return out;
}

/**
 * Saves the radar every `everyMs` and whenever `now()` is called (the room changed). One request at a time: a call while one is running
 * is done right after it. `build()` makes the radar to save, `send(radar)` resolves true when the server took it; a refused or failed
 * save is simply replaced by the next one (the radar is always the latest picture, never a queue).
 */
export function createRadarSaver({ build, send, everyMs = RADAR_EVERY_MS, setInterval: setI = globalThis.setInterval, clearInterval: clearI = globalThis.clearInterval }) {
  let timer = null, busy = false, again = false;
  async function run() {
    if (busy) { again = true; return; }
    busy = true;
    try { await send(build()); } catch { /* the next tick tries again */ }
    busy = false;
    if (again) { again = false; run(); }
  }
  return {
    start() { if (!timer) timer = setI(run, everyMs); },
    stop() { if (timer) { clearI(timer); timer = null; } },
    now: run,
  };
}
