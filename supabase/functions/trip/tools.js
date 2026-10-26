// The Almacén's price list (the farm store): the tools a pet needs to work on the farm. They are town-only: bought with the pet's gold through the
// same ledger as the shop (trip.spent), but kept per board (table pet_tools) so they stay with the pet across trips and never go in a return package.
// src/tools.js mirrors this list; tests/farm-store.test.js keeps them equal.

export const TOOLS = {
  sickle:    { price: 30, name: 'Hoz' },               // harvest crops
  bucket:    { price: 25, name: 'Balde' },             // draw water at the well and water plots
  feed_sack: { price: 35, name: 'Saco de alimento' },  // feed the cows and the sheep
};

export const isTool = (key) => typeof key === 'string' && Object.hasOwn(TOOLS, key);
