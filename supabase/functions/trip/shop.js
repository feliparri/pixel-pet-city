// The shop's price list: the core WEAR items the pet's gold can buy on a trip. Mirrors pixel-pet common/store.c ITEMS (ids as in store.h item_id_t,
// keys as in travel-package.js ITEM_KEYS); tests/trip-shop.test.js parses store.c and fails when this drifts. The free top hat (every device owns it)
// and the keepsakes (a seasonal pack's gift: the witch hat) are not for sale.

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
};

export const isForSale = (key) => typeof key === 'string' && Object.hasOwn(SHOP, key);
