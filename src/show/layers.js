// What a show has in the sky at show time `ts` (seconds): the shared piece of the demo page and the town. Pure: (kind, seed, ts) -> lists.
import { fireworksAt } from './fireworks.js';
import { meteorsAt } from './meteors.js';
import { dronesAt } from './drones.js';
import { halloweenAt } from './halloween.js';

const NONE = { rockets: [], sparks: [], flashes: [] };

/** { fw: { rockets, sparks, flashes }, meteors, drones, hw } (empty lists for an unknown kind; hw is the Halloween sky or null). */
export function skyAt(kind, seed, ts) {
  if (kind === 'fireworks') return { fw: fireworksAt(seed, ts), meteors: [], drones: [], hw: null };
  if (kind === 'meteors') return { fw: NONE, meteors: meteorsAt(seed, ts), drones: [], hw: null };
  if (kind === 'drones') return { fw: NONE, meteors: [], drones: dronesAt(seed, ts), hw: null };
  if (kind === 'halloween') return { fw: NONE, meteors: [], drones: [], hw: halloweenAt(seed, ts) };
  return { fw: NONE, meteors: [], drones: [], hw: null };
}
