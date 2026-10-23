// A trip code as people type it: six symbols from an alphabet without 0, 1, O, I or L (mirror of supabase/functions/trip/trip-code.js).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function normalizeTripCode(input) {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  return s.length === 6 && Array.from(s).every((ch) => ALPHABET.includes(ch)) ? s : null;
}
