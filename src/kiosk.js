// The Kiosco of the beach: a small stand that sells treats for the town's stars (the local counter the games and the fishing fill, src/stars.js). The treats exist only in the town: they
// are not tools, nothing is stored on the pet, nothing goes to the server or its tables (the stars are the one thing spent, through the same save as when they are earned), and a
// treat lasts a little while: it is held in the pet's hand for HOLD_MS (the last EAT_MS of it eating or drinking it, a short code-drawn animation), then the pet is happy. Pure
// rules here; the drawing is src/art/treat.js, the panel src/shop-ui.js and the pet's state src/town.js.
import { BEACH } from './map.js';

export const KIOSK_TITLE = 'Kiosco';
export const KIOSK_HINT = 'Los antojos del pueblo, pagados con tus estrellas. Se quedan en la playa: no viajan a casa.';
/** What the Kiosco sells: `key`, the name, the price in stars, and how it is taken ('eat' or 'drink'). */
export const TREATS = [
  { key: 'helado', name: 'Helado', price: 3, act: 'eat' },
  { key: 'refresco', name: 'Refresco', price: 2, act: 'drink' },
  { key: 'coco', name: 'Agua de coco', price: 4, act: 'drink' },
  { key: 'paleta', name: 'Paleta', price: 2, act: 'eat' },
];
export const HOLD_MS = 20000;       // a treat stays in the pet's hand this long ...
export const EAT_MS = 2600;         // ... and the last stretch of it the pet eats or drinks it
export const SHORT = 'Te faltan estrellas';
export const FULL_HAND = 'Ya tienes algo en la mano';

/** The prompt for a pet standing still in front of the counter (the row of tiles south of the stand): "A: Kiosco"; null anywhere else. */
export function kioskAt(x, y, area = 'beach') {
  const k = BEACH.kiosk;
  return area === 'beach' && y === k.y + k.h && x >= k.x && x < k.x + k.w ? { id: 'kiosk', label: 'Kiosco', target: 'kiosk' } : null;
}

/** The rows of the menu for a pet with `stars`: { idx, key, name, price, afford }. */
export const treatRows = (stars) => TREATS.map((t, idx) => ({ idx, key: t.key, name: t.name, price: t.price, act: t.act, afford: stars >= t.price }));

/** What a pet holds: a treat (index in TREATS, -1 for nothing) since a moment. */
export const createTreat = () => ({ idx: -1, since: 0 });
export function giveTreat(t, idx, now) { t.idx = idx; t.since = now; }
/**
 * The treat in hand at `now`: null when there is none or it is finished (the state is cleared and `done` says so once), else { idx, eating, k (0..1 through the eating, 0 while it is just held), code }.
 * `code` is what goes over the net: 1 to 4 held, 5 to 8 being eaten or drunk (src/protocol.js).
 */
export function treatPhase(t, now) {
  if (t.idx < 0) return null;
  const age = now - t.since;
  if (age >= HOLD_MS) { const idx = t.idx; t.idx = -1; return { idx, done: true, eating: false, k: 1, code: 0 }; }
  const eating = age >= HOLD_MS - EAT_MS;
  return { idx: t.idx, eating, k: eating ? (age - (HOLD_MS - EAT_MS)) / EAT_MS : 0, code: t.idx + 1 + (eating ? 4 : 0), done: false };
}
/** The treat another pet shows, from its `treat` code: { idx, eating } or null. */
export const fromCode = (code) => (Number.isInteger(code) && code >= 1 && code <= 8 ? { idx: (code - 1) % 4, eating: code > 4 } : null);

/**
 * Buys a treat: `wallet` is the star counter ({ get(), spend(n) }). { ok: true, treat } when it was paid (the stars are spent), else { ok: false, text } (the hand is full, no such treat, not
 * enough stars). Nothing is spent unless it works.
 */
export function buyTreat(wallet, t, idx, now) {
  const tr = TREATS[idx];
  if (!tr) return { ok: false, text: SHORT };
  if (t.idx >= 0) return { ok: false, text: FULL_HAND };
  if (!wallet || typeof wallet.get !== 'function' || typeof wallet.spend !== 'function' || wallet.get() < tr.price || !wallet.spend(tr.price)) return { ok: false, text: SHORT };
  giveTreat(t, idx, now);
  return { ok: true, treat: tr };
}
