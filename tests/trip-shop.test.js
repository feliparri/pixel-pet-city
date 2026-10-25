import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { world, fixture } from './trip-helpers.js';
import { parsePackage, buildReturn, crc32, fromBase64, toBase64, petView, ITEM_KEYS } from '../supabase/functions/trip/travel-package.js';
import { SHOP, isForSale } from '../supabase/functions/trip/shop.js';

const plain = fixture('plain.bin'), kept = fixture('keepsake.bin');
const petAt = (b) => b.length - 4 - 733;
const goldOf = (b) => new DataView(b.buffer, b.byteOffset).getUint32(petAt(b) + 103, true);
const reseal = (b) => { new DataView(b.buffer).setUint32(b.length - 4, crc32(b, b.length - 4), true); return b; };
const withGold = (src, g) => { const b = new Uint8Array(src); new DataView(b.buffer).setUint32(petAt(b) + 103, g, true); return reseal(b); };

// ---- the price list mirrors the game ------------------------------------------------------------------------------------------
const GAME = new URL('../../pixel-pet/common/', import.meta.url);
test('shop.js matches pixel-pet common/store.c (names, prices, ids, free and keepsake items)', { skip: !existsSync(new URL('store.c', GAME)) }, () => {
  const c = readFileSync(new URL('store.c', GAME), 'utf8'), h = readFileSync(new URL('store.h', GAME), 'utf8');
  const enumBody = h.match(/typedef enum \{\s*ITEM_NONE,([\s\S]*?)ITEM_COUNT\s*\} item_id_t/)[1];
  const names = ['ITEM_NONE', ...[...enumBody.matchAll(/^\s*(ITEM_[A-Z_]+)/gm)].map((m) => m[1])];
  const defs = [...c.matchAll(/\[(ITEM_[A-Z_]+)\]\s*=\s*\{\s*"([^"]+)",\s*SLOT_(\w+),\s*(\d+),\s*(true|false)\s*\}/g)];
  assert.equal(defs.length, names.length - 1, 'every item has a definition');
  const keys = c.match(/KEYS\[ITEM_COUNT\]\s*=\s*\{([^}]*)\}/)[1].split(',').map((k) => k.trim()).map((k) => (k === 'NULL' ? null : k.replace(/"/g, '')));
  assert.deepEqual(keys, ITEM_KEYS);
  const forSale = {};
  for (const [, enumName, name, slot, price, keepsake] of defs) {
    const id = names.indexOf(enumName), key = ITEM_KEYS[id];
    if (+price === 0 || keepsake === 'true') { assert.equal(isForSale(key), false, `${key} is not for sale`); continue; }
    forSale[key] = { id, price: +price, slot: ['HEAD', 'FACE', 'NECK', 'BACK'].indexOf(slot), name };
  }
  assert.deepEqual(SHOP, forSale);
  assert.match(h, /STORE_FREE_ITEMS \(1u << ITEM_TOPHAT\)/);
  assert.equal(readFileSync(new URL('save.h', GAME), 'utf8').match(/SAVE_OFF_OWNED (\d+)/)[1], '107');   // gold is the u32 before it (103)
});

// ---- the return patch ---------------------------------------------------------------------------------------------------------
test('a return with nothing spent or bought equals the old one byte for byte', () => {
  for (const src of [plain, kept]) {
    const old = new Uint8Array(src); old[6] = 1; new DataView(old.buffer).setUint32(16, 2, true); reseal(old);
    assert.deepEqual(buildReturn(src, 2), old);
    assert.deepEqual(buildReturn(src, 2, { spent: 0, bought: [] }), old);
  }
});

test('a return with a purchase: lower gold, the gifts appended, everything else identical, parses', () => {
  for (const src of [plain, kept]) {
    const out = parsePackage(src).pkg, g0 = goldOf(src);
    const back = buildReturn(src, 2, { spent: 100, bought: ['cape', 'crown'] });
    const r = parsePackage(back);
    assert.equal(r.ok, true);
    assert.equal(r.pkg.dir, 1);
    assert.deepEqual(r.pkg.gifts, [{ kind: 1, id: 12 }, { kind: 1, id: 4 }]);
    assert.equal(petView(r.pkg).gold, g0 - 100);
    assert.deepEqual(r.pkg.bag, out.bag);
    assert.deepEqual(r.pkg.records.map((x) => x.gid), out.records.map((x) => x.gid));
    // the pet record differs in the 4 gold bytes only
    const a = src.subarray(petAt(src), src.length - 4), b = back.subarray(petAt(back), back.length - 4);
    const diff = [...a.keys()].filter((i) => a[i] !== b[i]);
    assert.ok(diff.every((i) => i >= 103 && i < 107));
    assert.equal(back.length, src.length + 10);
    const ref = buildReturn(src, 2);                                                          // before the gifts and after them the bytes are the plain return's
    assert.deepEqual(back.subarray(0, 8), ref.subarray(0, 8));
    assert.deepEqual(back.subarray(12, 24 + 1 + 5 * out.bag.length), ref.subarray(12, 24 + 1 + 5 * out.bag.length));
    const tail = (x) => x.subarray(24 + 2 + 5 * out.bag.length, petAt(x));
    assert.deepEqual(tail(back).subarray(10), tail(ref));
  }
});

test('the return never takes more gold than the pet has, skips gifts already there, and keeps three at most', () => {
  assert.equal(goldOf(buildReturn(withGold(plain, 30), 2, { spent: 500 })), 0);
  const r = parsePackage(buildReturn(plain, 2, { spent: 0, bought: ['cape', 'cape', 'bow', 'wings', 'scarf', 'nope'] })).pkg;
  assert.deepEqual(r.gifts.map((x) => x.id), [12, 2, 11]);
});

// ---- trip-buy -----------------------------------------------------------------------------------------------------------------
async function trip(src = plain, extra = { spend: 1 }) {
  const w = world(), board = w.board();
  await board.register();
  const s = await board.start(src, extra);
  const c = await w.web().call('trip-claim', { code: s.body.code });
  const web = w.web(c.body.token);
  const row = w.db.trips.get(s.body.trip);
  return { w, board, web, ref: s.body.trip, row, claim: c.body, buy: (item, ref = s.body.trip) => web.call('trip-buy', { trip: ref, item }) };
}

test('buy: the happy path updates the ledger, the claim and status views, and the return', async () => {
  const t = await trip();
  assert.equal(t.row.can_spend, true);
  assert.deepEqual([t.claim.can_spend, t.claim.gold_left, t.claim.bought], [true, 5000, []]);
  const a = await t.buy('cape');
  assert.deepEqual([a.status, a.body], [200, { gold_left: 4880, bought: ['cape'] }]);
  const b = await t.buy('crown');
  assert.deepEqual(b.body, { gold_left: 4730, bought: ['cape', 'crown'] });
  assert.deepEqual([t.row.spent, t.row.bought], [270, ['cape', 'crown']]);
  const st = await t.web.call('trip-status', { trip: t.ref });
  assert.deepEqual([st.body.gold_left, st.body.bought], [4730, ['cape', 'crown']]);
  await t.board.call('trip-recall', { trip_id: 0xA1B2C3D4 });
  const ret = await t.board.call('trip-return', { trip_id: 0xA1B2C3D4 });
  const r = parsePackage(fromBase64(ret.body.package));
  assert.equal(r.ok, true);
  assert.equal(r.pkg.petInfo.gold, 4730);
  assert.deepEqual(r.pkg.gifts, [{ kind: 1, id: 12 }, { kind: 1, id: 4 }]);
  const same = await t.board.call('trip-return', { trip_id: 0xA1B2C3D4 });
  assert.equal(same.body.package, ret.body.package);                                        // asking again gives the same bytes
});

test('buy: every refusal has its code', async () => {
  const t = await trip();
  assert.deepEqual([(await t.buy('tophat')).body.error, (await t.buy('witch_hat')).body.error, (await t.buy('nope')).body.error, (await t.buy(7)).body.error], Array(4).fill('not_for_sale'));
  assert.equal((await t.buy('bow')).body.error, 'owned');                                   // the pet already has it
  assert.equal((await t.buy('cape')).status, 200);
  assert.equal((await t.buy('cape')).body.error, 'owned');                                  // already bought
  assert.equal((await t.buy('wings')).status, 200);
  assert.equal((await t.buy('scarf')).status, 200);
  const full = await t.buy('hood');
  assert.deepEqual([full.status, full.body.error], [409, 'bag_full']);                      // three gifts
  assert.equal((await t.web.call('trip-buy', { trip: t.ref, item: 'hood' })).body.error, 'bag_full');
  const bad = await t.w.web('ab'.repeat(32)).call('trip-buy', { trip: t.ref, item: 'hood' });
  assert.equal(bad.body.error, 'bad_session');
  const none = await t.w.web().call('trip-buy', { trip: t.ref, item: 'hood' });
  assert.equal(none.status, 401);
});

test('buy: not enough gold, exact gold works, a trip over refuses', async () => {
  const t = await trip(withGold(plain, 150));
  const r = await t.buy('jamiro');
  assert.deepEqual([r.status, r.body.error, r.body.gold_left, r.body.price], [409, 'no_gold', 150, 180]);
  assert.equal((await t.buy('crown')).body.gold_left, 0);                                   // price == gold is allowed
  assert.equal((await t.buy('hood')).body.error, 'no_gold');
  await t.board.call('trip-recall', { trip_id: 0xA1B2C3D4 });
  const over = await t.buy('hood');
  assert.deepEqual([over.status, over.body.error], [409, 'trip_over']);
});

test('buy: a trip started without spend (old firmware) is a closed shop and its return is untouched', async () => {
  const t = await trip(plain, {});
  assert.equal(t.row.can_spend, false);
  assert.deepEqual([t.claim.can_spend, t.claim.gold_left], [false, null]);
  assert.deepEqual([(await t.buy('cape')).status, (await t.buy('cape')).body.error], [403, 'shop_closed']);
  const odd = await trip(plain, { spend: true });                                           // only the number 1 opens it
  assert.equal(odd.row.can_spend, false);
  await t.board.call('trip-recall', { trip_id: 0xA1B2C3D4 });
  const ret = await t.board.call('trip-return', { trip_id: 0xA1B2C3D4 });
  assert.deepEqual(fromBase64(ret.body.package), buildReturn(plain, 1 + parsePackage(plain).pkg.seq));
});

test('buy: two buys at once cannot overspend, only one wins when the gold covers one', async () => {
  const t = await trip(withGold(plain, 150));
  const read = t.w.db.getTripById; let waiting = [];                                        // both calls read the trip before either one writes
  t.w.db.getTripById = async (id) => { const row = await read(id); if (waiting) { await new Promise((go) => { waiting.push(go); if (waiting.length === 2) { waiting.forEach((f) => f()); waiting = null; } }); } return row && { ...row }; };
  const [a, b] = await Promise.all([t.buy('crown'), t.buy('hood')]);
  const codes = [a, b].map((x) => x.status).sort();
  assert.deepEqual(codes, [200, 409]);
  assert.equal([a, b].find((x) => x.status === 409).body.error, 'conflict');
  assert.equal(t.row.spent, t.row.bought[0] === 'crown' ? 150 : 90);
  assert.equal(t.row.bought.length, 1);
  const retry = await t.buy(t.row.bought[0] === 'crown' ? 'hood' : 'crown');                // the client retries and now sees the real balance
  assert.equal(retry.body.error, 'no_gold');
});
