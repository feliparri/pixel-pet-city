// The farm's tools and the Almacén (the farm store), as plain data: the price list, what state each tool is in for this pet and the Spanish texts.
// The server (docs/trip-api.md, trip-buy-tool) decides every purchase and keeps the tools per pet; nothing here spends anything.

/** The price list, mirrored from supabase/functions/trip/tools.js (tests/farm-store.test.js keeps them equal): key -> { price, name, article, icon }. */
export const TOOLS = {
  sickle:    { price: 30, name: 'Hoz', article: 'una', icon: 'sickle' },
  bucket:    { price: 25, name: 'Balde', article: 'un', icon: 'bucket-empty' },
  feed_sack: { price: 35, name: 'Saco de alimento', article: 'un', icon: 'sack' },
};

/** The tool each farm action needs (harvesting, drawing water, watering and feeding); picking fruit by hand needs none. */
export const NEEDS = { harvest: 'sickle', fill: 'bucket', water: 'bucket', feed: 'feed_sack' };

export const isTool = (k) => typeof k === 'string' && Object.hasOwn(TOOLS, k);
export const toolKeys = (a) => (Array.isArray(a) ? [...new Set(a.filter(isTool))] : []);

/** What the prompt says when the pet lacks a tool: "Necesitas una Hoz — Almacén". */
export const needText = (key) => `Necesitas ${TOOLS[key].article} ${TOOLS[key].name} — Almacén`;

/**
 * One row per tool, in the store's order: { key, name, price, icon, state, label, enabled }. state: 'owned', 'closed' (the board cannot spend),
 * 'nogold' (needs `missing` more) or 'buy'. `shop` is src/shop.js shopFrom's state ({ canSpend, gold, tools }).
 */
export function toolRows(shop) {
  return Object.entries(TOOLS).map(([key, it]) => {
    const row = { key, name: it.name, price: it.price, icon: it.icon };
    if (shop.tools.includes(key)) return { ...row, state: 'owned', label: 'Ya la tienes', enabled: false };
    if (!shop.canSpend) return { ...row, state: 'closed', label: 'No disponible', enabled: false };
    if (it.price > shop.gold) { const missing = it.price - shop.gold; return { ...row, state: 'nogold', label: `Te faltan ${missing} de oro`, missing, enabled: false }; }
    return { ...row, state: 'buy', label: 'Comprar', enabled: true };
  });
}

export const STORE_TITLE = 'Almacén';
export const STORE_HINT = 'Herramientas para la granja. Se quedan con tu mascota en el pueblo y no viajan a casa.';
export const confirmToolText = (key) => `¿Comprar ${TOOLS[key].article} ${TOOLS[key].name} por ${TOOLS[key].price} de oro? Se queda con tu mascota en el pueblo.`;
export const CLERK_LINES = ['¡Bienvenido al Almacén!', '¡Aquí hay de todo para la granja!', '¿Necesitas una herramienta?'];
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
