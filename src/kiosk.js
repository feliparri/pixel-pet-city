// The Kiosco of the beach: a small stand that sells treats for the pet's gold, the server-held currency of the Almacén (trip-buy-treat, supabase/functions/trip/treats.js: the server
// owns the prices and the gold ledger). The treats exist only in the town: they are not tools, nothing is stored on the pet or in its tables (only the gold comes off, like any
// purchase), the stars stay earn-only, and a treat lasts a little while: it is held in the pet's hand for HOLD_MS (the last EAT_MS of it eating or drinking it, a short code-drawn animation), then the pet is happy. Pure
// rules here; the drawing is src/art/treat.js, the panel src/shop-ui.js and the pet's state src/town.js.
import { BEACH } from './map.js';

export const KIOSK_TITLE = 'Kiosco';
export const KIOSK_HINT = 'Los antojos del pueblo, pagados con tu oro. Se quedan en la playa: no viajan a casa.';
/** What the Kiosco sells: `key`, the name, the price in gold (mirrored from supabase/functions/trip/treats.js; tests/kiosk.test.js keeps them equal), and how it is taken ('eat' or 'drink'). */
export const TREATS = [
  { key: 'helado', name: 'Helado', price: 5, act: 'eat' },
  { key: 'refresco', name: 'Refresco', price: 3, act: 'drink' },
  { key: 'coco', name: 'Agua de coco', price: 6, act: 'drink' },
  { key: 'paleta', name: 'Paleta', price: 3, act: 'eat' },
];
export const HOLD_MS = 20000;       // a treat stays in the pet's hand this long ...
export const EAT_MS = 2600;         // ... and the last stretch of it the pet eats or drinks it
export const SHORT = 'No se pudo comprar';
export const CLOSED_TEXT = 'Tu placa no puede gastar oro aquí: el Kiosco está cerrado.';
export const FULL_HAND = 'Ya tienes algo en la mano';

/** The prompt for a pet standing still in front of the counter (the row of tiles south of the stand): "A: Kiosco"; null anywhere else. */
export function kioskAt(x, y, area = 'beach') {
  const k = BEACH.kiosk;
  return area === 'beach' && y === k.y + k.h && x >= k.x && x < k.x + k.w ? { id: 'kiosk', label: 'Kiosco', target: 'kiosk' } : null;
}

/**
 * The rows of the menu for a pet's shop state ({ canSpend, gold }, src/shop.js shopFrom; null or a closed one means the board cannot spend): { idx, key, name, price, act, state, label, enabled, missing? }.
 * state: 'closed' (the board cannot spend), 'nogold' (needs `missing` more) or 'buy'.
 */
export function treatRows(shop) {
  const open = !!(shop && shop.canSpend && Number.isInteger(shop.gold));
  return TREATS.map((t, idx) => {
    const row = { idx, key: t.key, name: t.name, price: t.price, act: t.act };
    if (!open) return { ...row, state: 'closed', label: 'No disponible', enabled: false };
    if (t.price > shop.gold) { const missing = t.price - shop.gold; return { ...row, state: 'nogold', label: `Te faltan ${missing} de oro`, missing, enabled: false }; }
    return { ...row, state: 'buy', label: 'Comprar', enabled: true };
  });
}

/** The Spanish sentence for a refused treat purchase (`r` is { error, price?, gold_left? }); the shortfall reads like the Almacén's. */
export function treatErrorText(r) {
  switch (r && r.error) {
    case 'no_gold': return Number.isInteger(r.price) && Number.isInteger(r.gold_left) ? `Te faltan ${Math.max(0, r.price - r.gold_left)} de oro para eso.` : 'No te alcanza el oro para eso.';
    case 'shop_closed': return CLOSED_TEXT;
    case 'not_for_sale': return 'Ese antojo no está a la venta.';
    case 'try_again': return 'No se pudo guardar la compra. Inténtalo otra vez.';
    case 'trip_over': return 'El viaje terminó, ya no se puede comprar.';
    case 'bad_session': return 'Tu sesión se cerró. Vuelve a entrar con el código de tu mascota.';
    case 'conflict': return 'Algo cambió justo ahora. Inténtalo otra vez.';
    case 'network': return 'No hay conexión. Revisa tu internet e inténtalo otra vez.';
    default: return SHORT + '. Inténtalo otra vez.';
  }
}

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
 * Buys a treat: `pay(key)` is the purchase with the pet's gold (the trip client's buyTreat, or the dev mock's; it resolves { ok, gold_left } or { ok: false, error, ... }). { ok: true, treat } when it
 * was paid and the treat is now in the hand, else { ok: false, text } (the hand is full, no such treat, or the server's refusal in words). Nothing is asked of the server when the hand is full.
 */
export async function buyTreat(pay, t, idx, now) {
  const tr = TREATS[idx];
  if (!tr) return { ok: false, text: SHORT };
  if (t.idx >= 0) return { ok: false, text: FULL_HAND };
  if (typeof pay !== 'function') return { ok: false, text: CLOSED_TEXT };
  const r = await pay(tr.key);
  if (!r || !r.ok) return { ok: false, text: treatErrorText(r || {}) };
  giveTreat(t, idx, now);
  return { ok: true, treat: tr };
}
