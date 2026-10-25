// What a show has in the sky at show time `ts` (seconds): the shared piece of the demo page and the town. Pure: (kind, seed, ts) -> lists.
import { fireworksAt } from './fireworks.js';
import { meteorsAt } from './meteors.js';
import { dronesAt } from './drones.js';

const NONE = { rockets: [], sparks: [], flashes: [] };

/** { fw: { rockets, sparks, flashes }, meteors, drones } (empty lists for an unknown kind). */
export function skyAt(kind, seed, ts) {
  if (kind === 'fireworks') return { fw: fireworksAt(seed, ts), meteors: [], drones: [] };
  if (kind === 'meteors') return { fw: NONE, meteors: meteorsAt(seed, ts), drones: [] };
  if (kind === 'drones') return { fw: NONE, meteors: [], drones: dronesAt(seed, ts) };
  return { fw: NONE, meteors: [], drones: [] };
}
