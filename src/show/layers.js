// What a show has in the sky at show time `ts` (seconds): the shared piece of the demo page and the town. Pure: (kind, seed, ts) -> lists.
import { fireworksAt } from './fireworks.js';
import { meteorsAt } from './meteors.js';
import { dronesAt } from './drones.js';
import { halloweenAt } from './halloween.js';
import { christmasAt } from './christmas.js';
import { hash } from './rand.js';
import { SHOWS } from './timeline.js';

const NONE = { rockets: [], sparks: [], flashes: [] };

// A show of up to LONG_AFTER seconds is built whole (more bursts, more sleighs... see each kind). A longer one (the admin may schedule up to 24 h) plays
// in CHUNK-second pieces, each its own show of that kind with a seed derived from the chunk, without its finale (the piece is built for a longer
// length, so its finale lies beyond the piece); the last CHUNK seconds of the real length play the whole show, finale included, so the finale
// comes only at the real end. Pure: the same (kind, seed, ts, dur) always gives the same sky.
export const LONG_AFTER = 600, CHUNK = 300, SETTLE = 12;      // SETTLE: a later chunk starts that far into its show, so the star / moon is already up and no pop marks the seam
const chunkSeed = (seed, k) => Math.floor(hash(seed, k, 777) * 2147483647);

/** The sky of any length: { fw, meteors, drones, hw, xm? } (see sky). */
export function skyAt(kind, seed, ts, dur) {
  if (dur === undefined || dur <= LONG_AFTER || !Object.hasOwn(SHOWS, kind)) return sky(kind, seed, ts, dur);
  const tail = dur - CHUNK;
  if (ts >= tail) return sky(kind, seed, ts - tail, CHUNK);
  const k = Math.floor(Math.max(0, ts) / CHUNK), settle = k > 0 && (kind === 'christmas' || kind === 'halloween') ? SETTLE : 0;
  return sky(kind, k === 0 ? seed : chunkSeed(seed, k), ts - k * CHUNK + settle, LONG_AFTER);
}

/** { fw: { rockets, sparks, flashes }, meteors, drones, hw, xm } (empty lists for an unknown kind; hw is the Halloween sky or null). */
function sky(kind, seed, ts, dur) {                      // `dur`: the show's length in seconds (omitted: the kind's own length)
  if (kind === 'fireworks') return { fw: fireworksAt(seed, ts, dur), meteors: [], drones: [], hw: null };
  if (kind === 'meteors') return { fw: NONE, meteors: meteorsAt(seed, ts, dur), drones: [], hw: null };
  if (kind === 'drones') return { fw: NONE, meteors: [], drones: dronesAt(seed, ts, dur), hw: null };
  if (kind === 'halloween') return { fw: NONE, meteors: [], drones: [], hw: halloweenAt(seed, ts, dur) };
  if (kind === 'christmas') return { fw: NONE, meteors: [], drones: [], hw: null, xm: christmasAt(seed, ts, dur) };       // `xm` exists only for this kind, so the other kinds' output is what it always was
  return { fw: NONE, meteors: [], drones: [], hw: null };
}
