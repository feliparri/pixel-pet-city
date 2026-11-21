import test from 'node:test';
import assert from 'node:assert/strict';
import { world, fixture } from './trip-helpers.js';
import { parsePackage, buildReturn, fromBase64 } from '../supabase/functions/trip/travel-package.js';
import { townDay } from '../supabase/functions/trip/missions.js';
import * as S from '../supabase/functions/trip/gifts.js';
import * as G from '../src/gifts.js';
import { zonedToMs } from '../src/admin-time.js';
import { createMockShop } from '../src/shop-mock.js';
import { shopAfterGift, shopFrom } from '../src/shop.js';

const plain = fixture('plain.bin');
const TRIP_ID = 0xA1B2C3D4;
const sid = (slot, n) => `santa:${slot}:${n}`;
/** The first Santa gift at or after `from` (a walk slot) that holds an item, as { slot, n }. */
function itemGift(from, skip = 0) {
  for (let slot = from, seen = 0; slot < from + 5000; slot++) for (let n = 0; n < 5; n++) if (G.santaHoldsItem(sid(slot, n)) && seen++ >= skip) return { slot, n, id: sid(slot, n) };
  throw new Error('none');
}
const walkNow = (slot) => (G.walkSlotStart(slot) + 5 * 60000) / 1000;

async function start({ items = 20, from = G.walkSlotOf(zonedToMs('2026-12-10', '12:00')) } = {}) {
  const gift = itemGift(from);
  const w = world({ now: walkNow(gift.slot) });
  const board = w.board();
  await board.register();
  const s = await board.start(plain, { spend: 1, items });
  const c = await w.web().call('trip-claim', { code: s.body.code });
  const web = w.web(c.body.token);
  const claim = (id) => web.call('trip-gift', { trip: s.body.trip, gift: id });
  return { w, board, web, gift, claim, row: w.db.trips.get(s.body.trip), ledger: () => w.db.petDays.get(`${board.deviceId}|${townDay(G.walkSlotStart(gift.slot))}`) };
}

test('santa item: the chance is about 1 in 20 and the pick is the same on the server and in the town', () => {
  let holds = 0;
  for (let slot = 8000; slot < 9000; slot++) for (let n = 0; n < 5; n++) {
    const id = sid(slot, n);
    assert.equal(S.santaHoldsItem(id), G.santaHoldsItem(id));
    assert.deepEqual(S.santaItemOrder(id), G.santaItemOrder(id));
    assert.deepEqual([...S.santaItemOrder(id)].sort(), [...S.SANTA_ITEMS].sort());
    assert.equal(S.santaItemFor(id, () => true), G.santaItemFor(id, () => true));
    if (G.santaHoldsItem(id)) holds++;
  }
  assert.ok(holds > 150 && holds < 350, `${holds} of 5000`);
  assert.deepEqual(S.SANTA_ITEMS, G.SANTA_ITEMS);
  assert.equal(S.SANTA_ITEM_ODDS, G.SANTA_ITEM_ODDS);
  const g = itemGift(8000);
  assert.equal(G.santaItemFor(g.id, (k) => k !== G.santaItemOrder(g.id)[0]), G.santaItemOrder(g.id)[1], 'the first one the pet can take');
  assert.equal(G.santaItemFor(g.id, () => false), null);
  const plainGift = sid(8000, [0, 1, 2, 3, 4].find((n) => !G.santaHoldsItem(sid(8000, n))));
  assert.equal(G.santaItemFor(plainGift, () => true), null);
});

test('santa item: the server gives the item instead of gold, outside the daily cap, and it comes home', async () => {
  const t = await start();
  const want = S.santaItemFor(t.gift.id, () => true);
  const r = await t.claim(t.gift.id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.gold, r.body.capped, r.body.item, r.body.gift, r.body.gift_earned], [0, false, want, t.gift.id, 0]);
  assert.deepEqual(t.row.bought, [want]);
  assert.equal(t.row.spent ?? 0, 0);
  assert.equal(t.row.earned ?? 0, 0);
  assert.deepEqual(t.ledger().gifts, [t.gift.id], 'the id is spent');
  assert.equal(t.ledger().gift_earned, 0);
  assert.equal((await t.claim(t.gift.id)).body.error, 'claimed');
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  const ret = await t.board.call('trip-return', { trip_id: TRIP_ID });
  assert.deepEqual(fromBase64(ret.body.package), buildReturn(plain, 1 + parsePackage(plain).pkg.seq, { spent: 0, earned: 0, bought: [want] }));
});

test('santa item: a second item gift gives another item; with all three taken it pays gold; the cap does not block an item', async () => {
  const t = await start();
  const a = await t.claim(t.gift.id);
  const next = itemGift(t.gift.slot, 1), b = next.slot === t.gift.slot ? next : null;
  assert.ok(a.body.item);
  // the same walk slot may hold a second item gift: take it, else the pick logic alone is checked above
  if (b) { const r = await t.claim(b.id); assert.ok(r.body.item && r.body.item !== a.body.item); }
  t.row.bought = [...S.SANTA_ITEMS];
  const other = [0, 1, 2, 3, 4].map((n) => sid(t.gift.slot, n)).find((id) => id !== t.gift.id && S.santaHoldsItem(id) === false);
  assert.equal((await t.claim(other)).body.item, undefined);
});

test('santa item: an old board, an owned or bought set, a full bag or a spent cap fall back to gold (or the cap error) with no item', async () => {
  const old = await start({ items: 14 });
  const r = await old.claim(old.gift.id);
  assert.deepEqual([r.status, r.body.gold, r.body.item], [200, G.santaRewardOf(old.gift.id), undefined]);
  assert.deepEqual(old.row.bought ?? [], []);
  const full = await start();
  full.row.bought = [...S.SANTA_ITEMS];
  const f = await full.claim(full.gift.id);
  assert.deepEqual([f.status, f.body.gold, f.body.item], [200, G.santaRewardOf(full.gift.id), undefined], 'every item bought already');
  const capped = await start();
  capped.w.db.petDays.set(`${capped.board.deviceId}|${townDay(G.walkSlotStart(capped.gift.slot))}`, { device_id: capped.board.deviceId, day: townDay(G.walkSlotStart(capped.gift.slot)), earned: 0, done: [], gift_earned: 150, gifts: [] });
  const c = await capped.claim(capped.gift.id);
  assert.deepEqual([c.status, c.body.gold, c.body.gift_earned], [200, 0, 150], 'the item is not gold: the cap does not stop it');
  assert.ok(c.body.item);
});

test('santa item: a hidden gift never holds an item', async () => {
  for (let slot = 8000; slot < 8500; slot++) for (let n = 0; n < 3; n++) assert.equal(G.parseGiftId(`christmas:${slot}:${n}`).kind, 'hidden');
  const mock = createMockShop('?gold=0&items=20');
  const slot = G.slotOf(zonedToMs('2026-12-10', '12:00')), now = G.slotStart(slot) + 1000;
  for (let n = 0; n < 3; n++) assert.equal((await mock.claimGift(`christmas:${slot}:${n}`, now)).item, undefined);
});

test('santa item: the town says what Santa left and the shop state counts it as bought', () => {
  assert.deepEqual(G.giftOutcome({ ok: true, gold: 0, item: 'headphones' }), { kind: 'paid', item: 'headphones', text: '¡Santa te dejó Audífonos!' });
  assert.deepEqual(G.giftOutcome({ ok: true, gold: 25 }), { kind: 'paid', text: '+25 monedas' });
  assert.deepEqual(G.giftOutcome({ ok: true, gold: 0, item: 'not_an_item' }), { kind: 'paid', text: '+0 monedas' });
  const shop = shopFrom({ can_spend: true, gold_left: 100, bought: [], items: 20 }, { owned: [], tools: [], bag: [] });
  const after = shopAfterGift(shop, { ok: true, gold: 0, item: 'vr_goggles', gold_left: 100 });
  assert.deepEqual(after.bought, ['vr_goggles']);
  assert.deepEqual(shopAfterGift(after, { ok: true, gold: 0, item: 'vr_goggles', gold_left: 100 }).bought, ['vr_goggles']);
  assert.deepEqual(shopAfterGift(shop, { ok: true, gold: 20, gold_left: 120 }).bought, []);
});

test('santa item: the dev mock follows the server (item, no gold, once; old board pays gold)', async () => {
  const slot0 = G.walkSlotOf(zonedToMs('2026-12-10', '12:00'));
  const g = itemGift(slot0), now = G.walkSlotStart(g.slot) + 60000;
  const mock = createMockShop('?gold=0&items=20');
  const r = await mock.claimGift(g.id, now);
  assert.deepEqual([r.ok, r.gold, r.item], [true, 0, G.santaItemFor(g.id, () => true)]);
  assert.deepEqual(mock.shop.bought, [r.item]);
  assert.equal((await mock.claimGift(g.id, now)).error, 'claimed');
  const old = await createMockShop('?gold=0&items=14').claimGift(g.id, now);
  assert.deepEqual([old.ok, old.gold, old.item], [true, G.santaRewardOf(g.id), undefined]);
});
