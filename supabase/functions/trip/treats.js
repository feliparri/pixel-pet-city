// The Kiosco's price list (the beach stand): treats paid with the pet's gold through the same ledger (trip.spent) as the shop and the Almacén. A treat is town-only
// and perishable: nothing is stored per board, nothing goes in a return package, only its price lowers the returned gold. src/kiosk.js mirrors this list;
// tests/kiosk.test.js keeps them equal.

export const TREATS = {
  helado:   { price: 5, name: 'Helado' },
  refresco: { price: 3, name: 'Refresco' },
  coco:     { price: 6, name: 'Agua de coco' },
  paleta:   { price: 3, name: 'Paleta' },
};

export const isTreat = (key) => typeof key === 'string' && Object.hasOwn(TREATS, key);
