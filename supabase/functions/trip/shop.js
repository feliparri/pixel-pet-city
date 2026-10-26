// The shop's price list: the core WEAR items the pet's gold can buy on a trip. Mirrors pixel-pet common/store.c ITEMS (ids as in store.h item_id_t,
// keys as in travel-package.js ITEM_KEYS); tests/trip-shop.test.js parses store.c and fails when this drifts. The free top hat (every device owns it)
// and the keepsakes (a seasonal pack's gift: the witch hat) are not for sale. The two hats marked `town` are sold only here (store.h STORE_TOWN_ITEMS): a
// board whose firmware predates them refuses a return package that carries them, so trip-buy sells them only on a trip whose start advertised
// a catalogue that holds their id (`items`, the board's ITEM_COUNT).

export const SHOP = {
  bow:          { id: 2,  price: 40,  slot: 0, name: 'Moño' },
  beanie:       { id: 3,  price: 60,  slot: 0, name: 'Gorro de lana' },
  crown:        { id: 4,  price: 150, slot: 0, name: 'Corona' },
  hood:         { id: 5,  price: 90,  slot: 0, name: 'Gorro de foca' },
  jamiro:       { id: 6,  price: 180, slot: 0, name: 'Jamiro Crown' },
  sunglasses:   { id: 7,  price: 70,  slot: 1, name: 'Anteojos de sol' },
  heart_cheeks: { id: 8,  price: 50,  slot: 1, name: 'Mejillas de corazón' },
  scarf:        { id: 9,  price: 60,  slot: 2, name: 'Bufanda' },
  bell_collar:  { id: 10, price: 80,  slot: 2, name: 'Collar con cascabel' },
  wings:        { id: 11, price: 100, slot: 3, name: 'Alitas' },
  cape:         { id: 12, price: 120, slot: 3, name: 'Capa' },
  horns:        { id: 14, price: 350, slot: 0, name: 'Gorro con cuernos', town: true },
  furhat:       { id: 15, price: 280, slot: 0, name: 'Sombrero de piel', town: true },
};

export const isForSale = (key) => typeof key === 'string' && Object.hasOwn(SHOP, key);

/** The catalogue size every board knew before the town hats: what a trip-start without an `items` field (an older firmware) means. */
export const LEGACY_ITEMS = 14;
/** The catalogue size a trip-start body advertises ("items": the firmware's ITEM_COUNT); anything but a sane integer is the legacy one (the safe, closed answer). */
export const knownItems = (n) => (Number.isInteger(n) && n >= 1 && n <= 255 ? n : LEGACY_ITEMS);
/** Does the board of a trip that advertised `items` know the item (its id is inside that catalogue)? */
export const boardKnows = (key, items) => SHOP[key].id < knownItems(items);
