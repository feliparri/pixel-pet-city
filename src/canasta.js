// The "Canasta": what the pet gathers on the farm (fruit, vegetables, wheat) and the water bucket. It is the town's own inventory: nothing
// of it goes home to the board. It lives in the trip's server state beside the stars (`canasta` key: a count per kind and the bucket flag),
// so it survives a reopen; it stays tiny (at most 7 kinds x 2 digits) because the whole state has a 2048 character limit (see radar.js).
export const KINDS = ['apple', 'pear', 'orange', 'carrot', 'lettuce', 'pumpkin', 'wheat'];
export const CAP = 20;                                   // at most this many of each kind
export const STATE_MAX = 2048;                           // the server's limit on the serialized trip state (supabase/functions/trip/handlers.js)
export const NAMES = {                                   // [one, many]
  apple: ['manzana', 'manzanas'], pear: ['pera', 'peras'], orange: ['naranja', 'naranjas'], carrot: ['zanahoria', 'zanahorias'],
  lettuce: ['lechuga', 'lechugas'], pumpkin: ['zapallo', 'zapallos'], wheat: ['trigo', 'trigo'],
};
const clamp = (n) => (Number.isInteger(n) && n > 0 ? Math.min(n, CAP) : 0);

/** The basket in a trip's state blob: { counts: { kind: n }, bucket: bool } (nonsense reads as an empty basket). */
export function canastaFrom(data) {
  const c = data && typeof data === 'object' ? data.canasta : null;
  const counts = {};
  for (const k of KINDS) counts[k] = c && typeof c === 'object' ? clamp(c[k]) : 0;
  return { counts, bucket: !!(c && typeof c === 'object' && c.bucket === 1) };
}

/** The compact form that is saved: only the kinds that are not zero, and `bucket: 1` when it is full. */
export function packCanasta(snap) {
  const out = {};
  for (const k of KINDS) if (clamp(snap.counts[k])) out[k] = clamp(snap.counts[k]);
  if (snap.bucket) out.bucket = 1;
  return out;
}

/** The state to save: what is already there is kept; when it would not fit `max`, the radar (rebuilt every 10 s) goes first, never the basket. */
export function stateWithCanasta(data, snap, max = STATE_MAX) {
  const base = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  let out = { ...base, canasta: packCanasta(snap) };
  if (JSON.stringify(out).length > max && out.radar) { out = { ...out }; delete out.radar; }
  return out;
}

/** The basket. `persist(snapshot)` is called after every change (a saver sends it to the server); without it the basket lives for this visit. */
export function createCanasta({ initial = null, persist = () => {} } = {}) {
  const snap0 = initial && initial.counts ? initial : canastaFrom(initial);
  const counts = { ...snap0.counts };
  let bucket = !!snap0.bucket;
  const snapshot = () => ({ counts: { ...counts }, bucket });
  const changed = () => persist(snapshot());
  return {
    snapshot,
    count: (k) => counts[k] || 0,
    total: () => KINDS.reduce((s, k) => s + counts[k], 0),
    room: (k) => KINDS.includes(k) && counts[k] < CAP,
    /** Adds `n` of a kind, up to the cap; returns how many went in. */
    add(k, n = 1) {
      if (!KINDS.includes(k) || !Number.isInteger(n) || n <= 0) return 0;
      const put = Math.min(n, CAP - counts[k]);
      if (put > 0) { counts[k] += put; changed(); }
      return put;
    },
    take(k, n = 1) {
      if (!KINDS.includes(k) || !Number.isInteger(n) || n <= 0 || counts[k] < n) return false;
      counts[k] -= n; changed();
      return true;
    },
    get bucketFull() { return bucket; },
    fillBucket() { if (bucket) return false; bucket = true; changed(); return true; },
    emptyBucket() { if (!bucket) return false; bucket = false; changed(); return true; },
  };
}
