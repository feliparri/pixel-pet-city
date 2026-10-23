// The short human code of a trip (the board shows it, the QR carries it) and the entrance ids.
// 31 symbols: no 0, 1, O, I or L (they read as each other); 31^6 is about 887 million codes.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LEN = 6;

/** A random code: `randomBytes(n)` returns n random bytes. Rejection sampling keeps every symbol equally likely. */
export function newCode(randomBytes) {
  let out = '';
  while (out.length < CODE_LEN) {
    for (const b of randomBytes(CODE_LEN * 2)) {
      if (b < 248 && out.length < CODE_LEN) out += CODE_ALPHABET[b % CODE_ALPHABET.length];   // 248 = 8 x 31
    }
  }
  return out;
}

/** What a person typed, as a code: upper case, spaces and dashes dropped; null when it is not one. */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LEN) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** The "entrada" cosmetic ids a pet may carry: how it arrives in the town and how it leaves (arrival and exit are one pair by id). */
export const ENTRANCES = ['parachute', 'blue_bolt'];
export const DEFAULT_ENTRANCE = 'parachute';
export const isEntrance = (id) => typeof id === 'string' && ENTRANCES.includes(id);
