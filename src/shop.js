// The town's shop and the pet's backpack, as plain data: which items are for sale, what state each one is in for this pet, the Spanish
// texts and the list of what the pet carries. The server (docs/trip-api.md, trip-buy) decides every purchase; nothing here spends anything.

/** The price list, mirrored from supabase/functions/trip/shop.js (tests/shop.test.js keeps them equal): key -> { price, slot, name }. */
export const SHOP = {
  bow:          { price: 40,  slot: 0, name: 'Moño' },
  beanie:       { price: 60,  slot: 0, name: 'Gorro de lana' },
  crown:        { price: 150, slot: 0, name: 'Corona' },
  hood:         { price: 90,  slot: 0, name: 'Gorro de foca' },
  jamiro:       { price: 180, slot: 0, name: 'Jamiro Crown' },
  sunglasses:   { price: 70,  slot: 1, name: 'Anteojos de sol' },
  heart_cheeks: { price: 50,  slot: 1, name: 'Mejillas de corazón' },
  scarf:        { price: 60,  slot: 2, name: 'Bufanda' },
  bell_collar:  { price: 80,  slot: 2, name: 'Collar con cascabel' },
  wings:        { price: 100, slot: 3, name: 'Alitas' },
  cape:         { price: 120, slot: 3, name: 'Capa' },
};

export const GIFT_MAX = 3;                    // a trip brings home at most this many gifts (the board's limit)

const isKey = (k) => typeof k === 'string' && /^[a-z_]{1,24}$/.test(k);

/** The pet's backpack as the server sends it (pet.bag), keeping only what the town can name: [{ kind: 'wear', key } | { kind: 'season', name } | { kind: 'toy' }]. */
export function parseBag(bag) {
  if (!Array.isArray(bag)) return [];
  return bag.slice(0, GIFT_MAX).flatMap((it) => {
    if (!it || typeof it !== 'object') return [];
    if (it.kind === 'wear' && isKey(it.key)) return [{ kind: 'wear', key: it.key }];
    if (it.kind === 'season' && typeof it.name === 'string') return [{ kind: 'season', name: it.name.slice(0, 24) }];
    if (it.kind === 'toy') return [{ kind: 'toy' }];
    return [];
  });
}

const int = (n) => (Number.isInteger(n) && n >= 0 ? n : null);
const keys = (a) => (Array.isArray(a) ? a.filter(isKey) : []);

/**
 * What the shop panel works from. `view` is a claim or status reply ({ can_spend, gold_left, bought }), `pet` the claim's pet
 * ({ owned, bag }, optional on a status poll: `prev` keeps what the last state knew).
 * -> { canSpend, gold (null when the board cannot spend), owned, bought, full, bag }
 */
export function shopFrom(view, pet = null, prev = null) {
  const bought = keys(view && view.bought);
  const canSpend = !!(view && view.can_spend) && int(view.gold_left) !== null;
  return {
    canSpend, gold: canSpend ? int(view.gold_left) : null,
    owned: pet ? keys(pet.owned) : prev ? prev.owned : [],
    bought, full: bought.length >= GIFT_MAX || !!(prev && prev.full && prev.bought.length === bought.length),
    bag: pet ? parseBag(pet.bag) : prev ? prev.bag : [],
  };
}

/** What a finished buy request changes in the state: the gold left and the bought list on success; what the error teaches on a refusal. */
export function shopAfterBuy(shop, key, r) {
  if (r.ok) return { ...shop, gold: int(r.gold_left) ?? shop.gold, bought: keys(r.bought), full: keys(r.bought).length >= GIFT_MAX };
  if (r.error === 'no_gold' && int(r.gold_left) !== null) return { ...shop, gold: r.gold_left };
  if (r.error === 'owned') return shop.owned.includes(key) ? shop : { ...shop, owned: [...shop.owned, key] };
  if (r.error === 'bag_full') return { ...shop, full: true };
  if (r.error === 'shop_closed') return { ...shop, canSpend: false, gold: null };
  return shop;
}

/**
 * One row per item for sale, in the shop's order: { key, name, price, slot, state, label, enabled }. state: 'owned' (the pet has it),
 * 'bought' (bought on this trip), 'closed' (the board cannot spend), 'full' (the gift bag is full), 'nogold' (needs `missing` more) or 'buy'.
 */
export function shopRows(shop) {
  return Object.entries(SHOP).map(([key, it]) => {
    const row = { key, name: it.name, price: it.price, slot: it.slot };
    if (shop.owned.includes(key)) return { ...row, state: 'owned', label: 'Ya lo tienes', enabled: false };
    if (shop.bought.includes(key)) return { ...row, state: 'bought', label: 'Comprado', enabled: false };
    if (!shop.canSpend) return { ...row, state: 'closed', label: 'No disponible', enabled: false };
    if (shop.full) return { ...row, state: 'full', label: 'Mochila de regalos llena', enabled: false };
    if (it.price > shop.gold) { const missing = it.price - shop.gold; return { ...row, state: 'nogold', label: `Te faltan ${missing} de oro`, missing, enabled: false }; }
    return { ...row, state: 'buy', label: 'Comprar', enabled: true };
  });
}

export const CLOSED_TEXT = 'Tu placa necesita actualizarse para comprar aquí.';
export const GOLD_TEXT = (gold) => `Oro: ${gold}`;
export const confirmText = (key) => `¿Comprar ${SHOP[key].name} por ${SHOP[key].price} de oro? Tu mascota lo recibe al volver a casa.`;
export const THANKS_LINES = ['¡Gracias por tu compra!', '¡Qué bien te queda! Vuelve cuando quieras.'];
export const thanks = (n) => THANKS_LINES[((n % THANKS_LINES.length) + THANKS_LINES.length) % THANKS_LINES.length];

/** The Spanish sentence for a refused or failed purchase (`r` is { error, price?, gold_left? }). */
export function buyErrorText(r) {
  switch (r.error) {
    case 'no_gold': return Number.isInteger(r.price) && Number.isInteger(r.gold_left) ? `Te faltan ${Math.max(0, r.price - r.gold_left)} de oro para eso.` : 'No te alcanza el oro para eso.';
    case 'owned': return 'Tu mascota ya tiene ese artículo.';
    case 'bag_full': return 'La mochila de regalos está llena: tu mascota solo puede traer 3 regalos de cada viaje.';
    case 'shop_closed': return CLOSED_TEXT;
    case 'not_for_sale': return 'Ese artículo no está a la venta.';
    case 'trip_over': return 'El viaje terminó, ya no se puede comprar.';
    case 'bad_session': return 'Tu sesión se cerró. Vuelve a entrar con el código de tu mascota.';
    case 'conflict': return 'Algo cambió justo ahora. Inténtalo otra vez.';
    case 'network': return 'No hay conexión. Revisa tu internet e inténtalo otra vez.';
    default: return 'No se pudo comprar. Inténtalo otra vez.';
  }
}

/**
 * What the pet carries, for the "Mochila" panel: { carried: [{ kind, name, key? }], bought: [{ key, name }] }.
 * `catalogue` is sprites.json's items (names of the pet's own wear items); a season item keeps its own name.
 */
export function bagList(shop, catalogue = {}) {
  const wearName = (key) => (catalogue[key] && catalogue[key].name) || (SHOP[key] && SHOP[key].name) || 'Accesorio';
  return {
    carried: shop.bag.map((it) => (it.kind === 'wear' ? { kind: 'wear', key: it.key, name: wearName(it.key) } : it.kind === 'season' ? { kind: 'season', name: it.name } : { kind: 'toy', name: 'Un juguete' })),
    bought: shop.bought.filter((k) => SHOP[k]).map((key) => ({ key, name: SHOP[key].name })),
  };
}
