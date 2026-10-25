// The radar the phone shows: the pets of the room a visiting pet is in, saved by the town's browser inside the trip's state
// (`state.radar`) and handed to the board's phone by the device-authenticated trip-status. The browser wrote it, so it is untrusted:
// this reads it back with fixed shapes and caps, drops whatever does not fit, and never throws. Pure JavaScript (Edge Function and node --test).
//
//   radar: null | { room, at (unix seconds), pets: [{ n, sp: frog|seal|cat, st: 0..3, s: [hunger, fun, energy, clean, health] 0..100, a: activity }] }

export const RADAR_PETS_MAX = 8;
export const RADAR_NAME_MAX = 24;
export const RADAR_AT_SKEW_S = 300;           // a stamp this far in the future is not a clock, it is a lie
export const ACTIVITIES = ['idle', 'walk', 'hide', 'chicken', 'football', 'race', 'shop'];
const SPECIES = ['frog', 'seal', 'cat'];
const ROOM_RE = /^[A-Z]{3,6}-[A-Z]{3,6}-\d{2}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function cleanPet(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (typeof p.n !== 'string' || !SPECIES.includes(p.sp) || !int(p.st, 0, 3) || !ACTIVITIES.includes(p.a)) return null;
  if (!Array.isArray(p.s) || p.s.length !== 5 || !p.s.every((v) => int(v, 0, 100))) return null;
  const n = Array.from(p.n.replace(/[\u0000-\u001f\u007f]/g, '')).slice(0, RADAR_NAME_MAX).join('');
  return { n, sp: p.sp, st: p.st, s: p.s.slice(), a: p.a };
}

/** The radar to answer: the normalized object, or null (nothing saved, not an object, a bad room or stamp). `nowS` is the server clock in seconds. */
export function cleanRadar(r, nowS) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (typeof r.room !== 'string' || (r.room !== '' && !ROOM_RE.test(r.room))) return null;
  if (!int(r.at, 1, nowS + RADAR_AT_SKEW_S)) return null;
  const pets = [];
  if (r.room !== '' && Array.isArray(r.pets)) {
    for (const p of r.pets.slice(0, RADAR_PETS_MAX * 2)) {            // look at a few more than we keep: a bad entry does not cost a good one its place
      const c = cleanPet(p);
      if (c) pets.push(c);
      if (pets.length === RADAR_PETS_MAX) break;
    }
  }
  return { room: r.room, at: r.at, pets };
}
