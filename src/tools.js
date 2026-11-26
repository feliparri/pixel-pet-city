// The farm's tools and the Almacén (the farm store), as plain data: the price list, what state each tool is in for this pet and the Spanish texts.
// The server (docs/trip-api.md, trip-buy-tool) decides every purchase and keeps the tools per pet; nothing here spends anything.

/** The price list, mirrored from supabase/functions/trip/tools.js (tests/farm-store.test.js keeps them equal): key -> { price, name, article, icon }. */
export const TOOLS = {
  sickle:    { price: 30, name: 'Hoz', article: 'una', icon: 'sickle' },
  bucket:    { price: 25, name: 'Balde', article: 'un', icon: 'bucket-empty' },
  feed_sack: { price: 35, name: 'Saco de alimento', article: 'un', icon: 'sack' },
  fishing_rod: { price: 40, name: 'Caña de pescar', article: 'una', icon: 'rod' },   // for the pond (fishing), not for a farm action
  surfboard: { price: 60, name: 'Tabla de surf', article: 'una', icon: 'board' },    // for the waves of the beach (surfing), not for a farm action
};

/** The tool each farm action needs (harvesting, drawing water, watering and feeding); picking fruit by hand needs none. Not every tool is here: the fishing rod is checked by the fishing entry and the surfboard by the break (src/surf.js). */
export const NEEDS = { harvest: 'sickle', fill: 'bucket', water: 'bucket', feed: 'feed_sack' };

export const isTool = (k) => typeof k === 'string' && Object.hasOwn(TOOLS, k);
export const toolKeys = (a) => (Array.isArray(a) ? [...new Set(a.filter(isTool))] : []);

/** Where each tool is easiest to find, for the "needs a tool" prompt: the surfboard is sold at the beach's surf stand (and also at the Almacén), the rest at the Almacén. */
const SOLD_AT = { surfboard: 'Tienda de surf' };
/** What the prompt says when the pet lacks a tool: "Necesitas una Hoz — Almacén". */
export const needText = (key) => `Necesitas ${TOOLS[key].article} ${TOOLS[key].name} — ${SOLD_AT[key] || 'Almacén'}`;

/** What the beach's surf stand sells: just the surfboard (the Almacén keeps selling it too). */
export const SURF_SHOP_KEYS = ['surfboard'];
export const SURF_SHOP_TITLE = 'Tienda de surf';
export const SURF_SHOP_HINT = 'La tabla para surfear las olas de la playa. Se queda con tu mascota en el pueblo y no viaja a casa.';

/**
 * One row per tool, in the store's order: { key, name, price, icon, state, label, enabled }. state: 'owned', 'closed' (the board cannot spend),
 * 'nogold' (needs `missing` more) or 'buy'. `shop` is src/shop.js shopFrom's state ({ canSpend, gold, tools }). `keys` (optional) keeps only those tools: a stand that sells part of the list.
 */
export function toolRows(shop, keys = null) {
  return Object.entries(TOOLS).filter(([key]) => !keys || keys.includes(key)).map(([key, it]) => {
    const row = { key, name: it.name, price: it.price, icon: it.icon };
    if (shop.tools.includes(key)) return { ...row, state: 'owned', label: 'Ya la tienes', enabled: false };
    if (!shop.canSpend) return { ...row, state: 'closed', label: 'No disponible', enabled: false };
    if (it.price > shop.gold) { const missing = it.price - shop.gold; return { ...row, state: 'nogold', label: `Te faltan ${missing} de oro`, missing, enabled: false }; }
    return { ...row, state: 'buy', label: 'Comprar', enabled: true };
  });
}

export const STORE_TITLE = 'Almacén';
export const STORE_HINT = 'Herramientas para la granja, para pescar y para surfear. Se quedan con tu mascota en el pueblo y no viajan a casa.';
export const confirmToolText = (key) => `¿Comprar ${TOOLS[key].article} ${TOOLS[key].name} por ${TOOLS[key].price} de oro? Se queda con tu mascota en el pueblo.`;
export const CLERK_LINES = ['¡Bienvenido al Almacén!', '¡Aquí hay de todo para la granja y el estanque!', '¿Necesitas una herramienta?'];
export const SURF_THANKS = ['¡Buena compra! A cazar olas.', '¡Gracias! Las olas te esperan.'];
export const CLERK_THANKS = ['¡Buena compra! A trabajar la tierra.', '¡Gracias! Con esto te irá muy bien.'];

/** The Spanish sentence for a refused tool purchase (`r` is { error, price?, gold_left? }). */
export function toolErrorText(r) {
  switch (r.error) {
    case 'owned': return 'Tu mascota ya tiene esa herramienta.';
    case 'not_for_sale': return 'Esa herramienta no está a la venta.';
    case 'try_again': return 'No se pudo guardar la compra. Inténtalo otra vez.';
    default: return null;                                                          // the rest reads like a shop refusal (src/shop.js buyErrorText)
  }
}
