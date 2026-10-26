import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHOP, GIFT_MAX, parseBag, shopFrom, shopAfterBuy, shopRows, bagList, confirmText, buyErrorText, CLOSED_TEXT } from '../src/shop.js';
import { SHOP as SERVER_SHOP } from '../supabase/functions/trip/shop.js';
import { createMockShop } from '../src/shop-mock.js';
import { createTripClient, petFromClaim } from '../src/trip.js';
import { handle } from '../supabase/functions/trip/handlers.js';
import { world, fixture } from './trip-helpers.js';

const catalogue = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url))).items;
const view = (o = {}) => ({ can_spend: true, gold_left: 200, bought: [], ...o });
const rowOf = (shop, key) => shopRows(shop).find((r) => r.key === key);

test('the price list mirrors the server one (names, prices, slots)', () => {
  assert.deepEqual(Object.keys(SHOP), Object.keys(SERVER_SHOP));
  for (const [k, it] of Object.entries(SERVER_SHOP)) assert.deepEqual(SHOP[k], { price: it.price, slot: it.slot, name: it.name, ...(it.town ? { needs: it.id + 1 } : {}) }, k);   // a town hat needs a board that knows its id
  for (const k of Object.keys(SHOP)) assert.ok(catalogue[k], `${k} has art`);
});

test('panel state per item: buy, owned, bought, not enough gold, gifts full, closed shop', () => {
  const shop = shopFrom(view({ gold_left: 100, bought: ['wings'] }), { owned: ['tophat', 'bow'], bag: [] });
  assert.deepEqual(rowOf(shop, 'bow'), { key: 'bow', name: 'Moño', price: 40, slot: 0, state: 'owned', label: 'Ya lo tienes', enabled: false });
  assert.equal(rowOf(shop, 'wings').state, 'bought');
  assert.equal(rowOf(shop, 'wings').label, 'Comprado');
  assert.equal(rowOf(shop, 'scarf').state, 'buy');
  assert.equal(rowOf(shop, 'scarf').label, 'Comprar');
  assert.equal(rowOf(shop, 'scarf').enabled, true);
  const poor = rowOf(shop, 'cape');
  assert.equal(poor.state, 'nogold'); assert.equal(poor.missing, 20); assert.equal(poor.label, 'Te faltan 20 de oro'); assert.equal(poor.enabled, false);
  assert.equal(rowOf(shop, 'crown').missing, 50);
  const full = shopFrom(view({ bought: ['bow', 'crown', 'cape'] }), { owned: [], bag: [] });
  assert.equal(full.full, true);
  assert.equal(rowOf(full, 'scarf').label, 'Mochila de regalos llena');
  assert.equal(rowOf(full, 'cape').state, 'bought');
  const old = shopFrom({ can_spend: false, gold_left: null, bought: [] }, { owned: ['bow'], bag: [] });
  assert.equal(old.canSpend, false); assert.equal(old.gold, null);
  assert.ok(shopRows(old).every((r) => !r.enabled));
  assert.equal(rowOf(old, 'bow').state, 'owned');
  assert.equal(rowOf(old, 'cape').state, 'closed');
  assert.equal(CLOSED_TEXT, 'Tu placa necesita actualizarse para comprar aquí.');
  assert.equal(shopFrom(view({ gold_left: undefined }), null).canSpend, false);       // a server that sent no gold: nothing to spend
});

test('the confirmation and every error code have a Spanish sentence', () => {
  assert.equal(confirmText('cape'), '¿Comprar Capa por 120 de oro? Tu mascota lo recibe al volver a casa.');
  for (const error of ['no_gold', 'owned', 'bag_full', 'shop_closed', 'not_for_sale', 'trip_over', 'bad_session', 'conflict', 'network', 'unknown', 'internal', 'update_board']) assert.match(buyErrorText({ error }), /^[A-ZÁ¿¡]/);
  assert.equal(buyErrorText({ error: 'no_gold', price: 120, gold_left: 90 }), 'Te faltan 30 de oro para eso.');
  assert.equal(buyErrorText({ error: 'shop_closed' }), CLOSED_TEXT);
  assert.equal(new Set(['owned', 'bag_full', 'trip_over', 'network', 'conflict'].map((error) => buyErrorText({ error }))).size, 5);
});

test('what a reply teaches the state: gold, bought, full, owned, closed', () => {
  const shop = shopFrom(view(), { owned: [], bag: [] });
  const bought = shopAfterBuy(shop, 'cape', { ok: true, gold_left: 80, bought: ['cape'] });
  assert.equal(bought.gold, 80); assert.deepEqual(bought.bought, ['cape']); assert.equal(bought.full, false);
  assert.equal(shopAfterBuy(shop, 'cape', { ok: false, error: 'bag_full' }).full, true);
  assert.deepEqual(shopAfterBuy(shop, 'bow', { ok: false, error: 'owned' }).owned, ['bow']);
  assert.equal(shopAfterBuy(shop, 'cape', { ok: false, error: 'no_gold', price: 120, gold_left: 90 }).gold, 90);
  assert.equal(shopAfterBuy(shop, 'cape', { ok: false, error: 'shop_closed' }).canSpend, false);
  assert.equal(shopAfterBuy(shop, 'cape', { ok: false, error: 'network' }), shop);
  const three = shopAfterBuy(shop, 'cape', { ok: true, gold_left: 0, bought: ['bow', 'crown', 'cape'] });
  assert.equal(three.full, true); assert.equal(GIFT_MAX, 3);
  const polled = shopFrom(view({ gold_left: 70, bought: ['cape'] }), null, bought);      // a status poll keeps the owned list and the bag
  assert.deepEqual(polled.owned, bought.owned); assert.equal(polled.gold, 70);
});

test('the mochila lists what the pet carries and what it bought on this trip', () => {
  const pet = { owned: [], bag: [{ kind: 'wear', key: 'scarf' }, { kind: 'season', gid: 9, name: 'Gorro de bruja' }, { kind: 'toy', id: 2 }, { kind: 'wear', key: 'Bad Key!' }, null] };
  const shop = shopFrom(view({ bought: ['cape'] }), pet);
  assert.deepEqual(bagList(shop, catalogue), {
    carried: [{ kind: 'wear', key: 'scarf', name: catalogue.scarf.name }, { kind: 'season', name: 'Gorro de bruja' }, { kind: 'toy', name: 'Un juguete' }],
    bought: [{ key: 'cape', name: 'Capa' }],
  });
  assert.deepEqual(bagList(shopFrom(view(), { owned: [], bag: [] }), catalogue), { carried: [], bought: [] });
  assert.equal(parseBag('x').length, 0);
});

test('the dev mock follows the same rules as trip-buy', async () => {
  const m = createMockShop('?gold=130&gifts=1');
  assert.equal(m.shop.gold, 130);
  assert.deepEqual(await m.buy('cape'), { ok: true, gold_left: 10, bought: ['cape'] });
  assert.equal(m.shop.gold, 10);
  assert.equal((await m.buy('cape')).error, 'owned');
  assert.equal((await m.buy('bow')).error, 'owned');                   // the pet already has it
  assert.equal((await m.buy('crown')).error, 'no_gold');
  assert.equal((await m.buy('tophat')).error, 'not_for_sale');
  assert.equal(createMockShop('?shop=closed').shop.canSpend, false);
  assert.equal((await createMockShop('?shop=closed').buy('cape')).error, 'shop_closed');
  const full = createMockShop('?gifts=3');
  assert.equal(full.shop.full, true);
  assert.equal((await full.buy('scarf')).error, 'bag_full');
});

// ---- the buy flow against the real handlers, and against a scripted fetch ---------------------------------------------------------------
const deps = (w) => ({ db: w.db, nowS: () => w.now, randomBytes: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), uuid: () => crypto.randomUUID(), townUrl: 'https://town/' });
const toFetch = (w, log = []) => async (url, init) => {
  const fn = url.split('/').pop();
  log.push(fn);
  const out = await handle(fn, { method: init.method, headers: Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v])), body: new TextEncoder().encode(init.body) }, deps(w));
  return { status: out.status, json: async () => out.body };
};

async function claimed(extra = {}, spend = 1) {
  const w = world(), board = w.board();
  await board.register();
  const s = await board.start(fixture('plain.bin'), spend ? { spend } : {});
  const code = s.body.code;
  const log = [];
  const client = createTripClient({ base: 'https://x/functions/v1/trip', fetch: toFetch(w, log), setInterval: () => 1, clearInterval() {}, ...extra });
  const r = await client.claim(code, catalogue);
  return { w, client, r, log };
}

test('claim: the pet carries gold state, owned items and the bag; an old board cannot spend', async () => {
  const { client, r } = await claimed();
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.pet.owned) && r.pet.owned.includes('tophat'));
  assert.ok(Array.isArray(r.pet.bag));
  assert.equal(client.shop.canSpend, true);
  assert.ok(Number.isInteger(client.shop.gold));
  const old = await claimed({}, 0);
  assert.equal(old.client.shop.canSpend, false);
  assert.equal(old.client.shop.gold, null);
  assert.equal(petFromClaim({ name: 'A', species: 'cat', stage: 2, items: ['', '', '', ''], owned: ['bow', 3, 'x y'], bag: 'no' }, catalogue).owned.length, 1);
});

test('buy: a purchase lowers the gold, lists the item as bought and a second buy says owned', async () => {
  const { client, w } = await claimed();
  const gold0 = client.shop.gold;
  const key = Object.keys(SHOP).find((k) => !client.shop.owned.includes(k) && SHOP[k].price <= gold0);
  if (!key) return;                                                      // the fixture's pet can afford nothing: covered by the gold tests
  const r = await client.buy(key);
  assert.equal(r.ok, true);
  assert.equal(client.shop.gold, gold0 - SHOP[key].price);
  assert.deepEqual(client.shop.bought, [key]);
  assert.equal(rowOf(client.shop, key).state, 'bought');
  const again = await client.buy(key);
  assert.deepEqual([again.ok, again.error], [false, 'owned']);
  assert.ok(w);
});

test('buy: refusals keep the state honest (no gold, closed shop, not for sale, no session)', async () => {
  const { client } = await claimed();
  const dear = Object.keys(SHOP).find((k) => SHOP[k].price > client.shop.gold && !client.shop.owned.includes(k));
  if (dear) { const r = await client.buy(dear); assert.deepEqual([r.ok, r.error, r.price], [false, 'no_gold', SHOP[dear].price]); assert.equal(r.gold_left, client.shop.gold); }
  assert.equal((await client.buy('tophat')).error, 'not_for_sale');
  const old = await claimed({}, 0);
  assert.equal((await old.client.buy('cape')).error, 'shop_closed');
  assert.equal(old.client.shop.canSpend, false);
  const none = createTripClient({ base: 'https://x', fetch: async () => { throw new Error('no'); } });
  assert.equal((await none.buy('cape')).error, 'bad_session');
});

function scripted(replies) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ fn: url.split('/').pop(), body: JSON.parse(init.body), token: init.headers['x-trip-token'] });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return { status: next.status, json: async () => next.body };
  };
  return { calls, fetch };
}
async function withScript(replies) {
  const claim = { status: 200, body: { trip: '11111111-1111-1111-1111-111111111111', status: 'active', token: 'a'.repeat(64), entrance: 'parachute', pet: { name: 'Mochi', species: 'cat', stage: 2, items: ['', '', '', ''], keepsakes: [], owned: ['tophat'], bag: [] }, state: { version: 0, data: {} }, can_spend: true, gold_left: 200, bought: [] } };
  const s = scripted([claim, ...replies]);
  const client = createTripClient({ base: 'https://x/functions/v1/trip', fetch: s.fetch, setInterval: () => 1, clearInterval() {} });
  await client.claim('K7M2QX', catalogue);
  return { client, calls: s.calls };
}

test('buy: a 409 conflict is asked again once, with the same item and session', async () => {
  const { client, calls } = await withScript([{ status: 409, body: { error: 'conflict' } }, { status: 200, body: { gold_left: 80, bought: ['cape'] } }]);
  const r = await client.buy('cape');
  assert.deepEqual(r, { ok: true, gold_left: 80, bought: ['cape'] });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1], calls[2]);
  assert.deepEqual([calls[1].fn, calls[1].body.item, calls[1].token], ['trip-buy', 'cape', 'a'.repeat(64)]);
  assert.equal(client.shop.gold, 80);
});

test('buy: a second conflict is reported, not retried forever; other errors are not retried', async () => {
  const two = await withScript([{ status: 409, body: { error: 'conflict' } }, { status: 409, body: { error: 'conflict' } }]);
  assert.equal((await two.client.buy('cape')).error, 'conflict');
  assert.equal(two.calls.length, 3);
  const net = await withScript([new Error('offline')]);
  assert.equal((await net.client.buy('cape')).error, 'network');
  assert.equal(net.calls.length, 2);
  const full = await withScript([{ status: 409, body: { error: 'bag_full' } }]);
  assert.equal((await full.client.buy('cape')).error, 'bag_full');
  assert.equal(full.client.shop.full, true);
  const poor = await withScript([{ status: 409, body: { error: 'no_gold', gold_left: 30, price: 120 } }]);
  const r = await poor.client.buy('cape');
  assert.deepEqual([r.error, r.price, r.gold_left, poor.client.shop.gold], ['no_gold', 120, 30, 30]);
  const over = await withScript([{ status: 409, body: { error: 'trip_over', status: 'recalled' } }]);
  assert.equal((await over.client.buy('cape')).error, 'trip_over');
  const dead = await withScript([{ status: 401, body: { error: 'bad_session' } }]);
  assert.equal((await dead.client.buy('cape')).error, 'bad_session');
  const boom = await withScript([{ status: 500, body: { error: 'internal' } }]);
  assert.equal((await boom.client.buy('cape')).ok, false);
  assert.equal(boom.client.shop.canSpend, true);
});

test('the town hats: shown with their price, buyable only when the board knows their ids', () => {
  const pet = { owned: ['tophat'], bag: [] };
  assert.equal(shopFrom(view(), pet).items, 14);                                           // a claim without "items": an older board
  assert.equal(shopFrom(view({ items: 16 }), pet).items, 16);
  assert.equal(shopFrom(view({ items: 'x' }), pet).items, 14);
  assert.equal(shopFrom(view(), null, { items: 15 }).items, 15);                           // a status poll keeps what the claim said
  const old = shopFrom(view({ gold_left: 1000 }), pet);
  for (const key of ['horns', 'furhat']) {
    assert.deepEqual([rowOf(old, key).state, rowOf(old, key).label, rowOf(old, key).enabled], ['update', 'Necesitas actualizar tu placa', false]);
    assert.equal(rowOf(old, key).price, SHOP[key].price);                                  // the price is there to see
  }
  assert.equal(rowOf(old, 'cape').state, 'buy');                                           // the rest of the shop is untouched
  const half = shopFrom(view({ gold_left: 1000, items: 15 }), pet);                        // knows horns (id 14) but not furhat (id 15)
  assert.deepEqual([rowOf(half, 'horns').state, rowOf(half, 'furhat').state], ['buy', 'update']);
  const now = shopFrom(view({ gold_left: 300, items: 16 }), pet);
  assert.deepEqual([rowOf(now, 'furhat').state, rowOf(now, 'furhat').enabled, rowOf(now, 'horns').state, rowOf(now, 'horns').missing], ['buy', true, 'nogold', 50]);
  const closed = shopFrom({ can_spend: false, gold_left: null, bought: [], items: 16 }, pet);
  assert.equal(rowOf(closed, 'horns').state, 'closed');
  assert.equal(shopFrom(view({ gold_left: 1000, items: 14 }), { owned: ['horns'], bag: [] }).owned[0], 'horns');
  assert.equal(rowOf(shopFrom(view({ gold_left: 1000, items: 14 }), { owned: ['horns'], bag: [] }), 'horns').state, 'owned');   // owned wins
  assert.equal(buyErrorText({ error: 'update_board' }), 'Tu placa necesita una actualización para recibir ese artículo.');
  assert.equal(confirmText('horns'), '¿Comprar Gorro con cuernos por 350 de oro? Tu mascota lo recibe al volver a casa.');
  assert.deepEqual(Object.keys(SHOP).slice(-2), ['horns', 'furhat']);                      // after the rest, in the order of their ids
});
