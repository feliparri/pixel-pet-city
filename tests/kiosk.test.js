import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEACH, SIGNS, isWalkable } from '../src/map.js';
import { TREATS, HOLD_MS, EAT_MS, SHORT, FULL_HAND, CLOSED_TEXT, kioskAt, treatRows, treatErrorText, createTreat, giveTreat, treatPhase, fromCode, buyTreat } from '../src/kiosk.js';
import { createStars } from '../src/stars.js';
import { TREATS as SERVER_TREATS } from '../supabase/functions/trip/treats.js';
import { createMockShop } from '../src/shop-mock.js';
import { shopFrom, shopAfterBuyTreat } from '../src/shop.js';
import { validateMessage } from '../src/protocol.js';
import { createNet } from '../src/net.js';
import { CUES } from '../src/pet-sounds.js';
import { treatSprite, drawTreatIcon, drawHeld } from '../src/art/treat.js';

test('the Kiosco sells four treats for gold; the pure rules touch no network and no tools; the server list is the same', () => {
  assert.deepEqual(TREATS.map((t) => t.name), ['Helado', 'Refresco', 'Agua de coco', 'Paleta']);
  assert.ok(TREATS.every((t) => Number.isInteger(t.price) && t.price > 0 && ['eat', 'drink'].includes(t.act)));
  const src = readFileSync(new URL('../src/kiosk.js', import.meta.url), 'utf8');
  assert.ok(!/fetch|supabase|trip\.js|tools\.js|stars/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'no network, no tools, no stars');
  assert.deepEqual(Object.fromEntries(TREATS.map((t) => [t.key, [t.price, t.name]])), Object.fromEntries(Object.entries(SERVER_TREATS).map(([k, t]) => [k, [t.price, t.name]])), 'prices mirror the server');
  assert.ok(TREATS.every((t) => t.price >= 3 && t.price <= 6));
  assert.ok(SIGNS.some((s) => s.area === 'beach' && s.text === 'Kiosco'));
});

test('A: Kiosco in front of the counter only', () => {
  const k = BEACH.kiosk;
  for (let x = k.x; x < k.x + k.w; x++) { assert.deepEqual(kioskAt(x, k.y + k.h), { id: 'kiosk', label: 'Kiosco', target: 'kiosk' }); assert.ok(isWalkable(x, k.y + k.h, 'beach')); }
  assert.equal(kioskAt(k.x - 1, k.y + k.h), null);
  assert.equal(kioskAt(k.x, k.y + k.h + 1), null);
  assert.equal(kioskAt(k.x, k.y + k.h, 'town'), null);
});

test('stars are earn-only now: no spend', () => {
  const s = createStars({ initial: 5 });
  assert.equal(s.spend, undefined);
  assert.equal(s.add(4), 9);
});

const shopOf = (gold, canSpend = true) => shopFrom({ can_spend: canSpend, gold_left: canSpend ? gold : null, bought: [] }, { owned: [], bag: [], tools: [] });

test('the menu: gold prices, a shortfall in gold, closed when the board cannot spend', () => {
  assert.deepEqual(treatRows(shopOf(4)).map((r) => [r.state, r.label]), [['nogold', 'Te faltan 1 de oro'], ['buy', 'Comprar'], ['nogold', 'Te faltan 2 de oro'], ['buy', 'Comprar']]);
  assert.ok(treatRows(shopOf(100)).every((r) => r.enabled));
  for (const closed of [shopOf(0, false), null]) assert.ok(treatRows(closed).every((r) => r.state === 'closed' && !r.enabled && r.label === 'No disponible'));
  assert.match(CLOSED_TEXT, /placa no puede gastar oro/);
});

test('buying: the pay function is asked once, the hand fills; a refusal says why and fills nothing; a full hand is not even asked', async () => {
  const asked = [], t = createTreat();
  const pay = (r) => (key) => { asked.push(key); return Promise.resolve(r); };
  assert.deepEqual(await buyTreat(pay({ ok: false, error: 'no_gold', price: 6, gold_left: 4 }), t, 2, 0), { ok: false, text: 'Te faltan 2 de oro para eso.' });
  assert.equal(t.idx, -1);
  const r = await buyTreat(pay({ ok: true, gold_left: 1 }), t, 0, 1000);
  assert.equal(r.ok, true); assert.equal(t.idx, 0); assert.deepEqual(asked, ['coco', 'helado']);
  assert.deepEqual(await buyTreat(pay({ ok: true }), t, 1, 2000), { ok: false, text: FULL_HAND });
  assert.deepEqual(asked, ['coco', 'helado'], 'a full hand never reaches the server');
  assert.deepEqual(await buyTreat(pay({ ok: true }), createTreat(), 9, 0), { ok: false, text: SHORT });
  assert.deepEqual(await buyTreat(null, createTreat(), 0, 0), { ok: false, text: CLOSED_TEXT });
  assert.equal(treatErrorText({ error: 'shop_closed' }), CLOSED_TEXT);
});

test('the dev mock follows the server: gold comes off, a shortfall, a closed shop, an unknown treat', async () => {
  const m = createMockShop('?gold=8');
  assert.deepEqual(await m.buyTreat('helado'), { ok: true, gold_left: 3 });
  assert.equal(m.shop.gold, 3);
  assert.deepEqual(await m.buyTreat('coco'), { ok: false, error: 'no_gold', price: 6, gold_left: 3 });
  assert.equal((await m.buyTreat('nope')).error, 'not_for_sale');
  assert.equal((await m.buyTreat('paleta')).gold_left, 0);
  assert.equal((await createMockShop('?shop=closed').buyTreat('helado')).error, 'shop_closed');
  const closed = shopAfterBuyTreat(shopOf(5), { ok: false, error: 'shop_closed' });
  assert.deepEqual([closed.canSpend, closed.gold], [false, null]);
});

test('a treat is held about 20 s, the last stretch eaten or drunk, then it is gone (once); its code goes with the position', () => {
  const t = createTreat();
  assert.equal(treatPhase(t, 0), null);
  giveTreat(t, 3, 5000);
  let p = treatPhase(t, 5001);
  assert.deepEqual([p.idx, p.eating, p.code], [3, false, 4]);
  p = treatPhase(t, 5000 + HOLD_MS - EAT_MS + 1);
  assert.deepEqual([p.eating, p.code], [true, 8]); assert.ok(p.k > 0 && p.k < 0.01);
  p = treatPhase(t, 5000 + HOLD_MS - 1); assert.ok(p.eating && p.k > 0.99);
  p = treatPhase(t, 5000 + HOLD_MS); assert.equal(p.done, true); assert.equal(treatPhase(t, 5000 + HOLD_MS + 1), null, 'and it is gone');
  assert.deepEqual(fromCode(2), { idx: 1, eating: false }); assert.deepEqual(fromCode(7), { idx: 2, eating: true });
  for (const bad of [0, 9, 1.5, null, undefined, '3']) assert.equal(fromCode(bad), null);
});

test('the treat travels like rest and surf: an optional pos and hello field 1 to 8, anything else dropped, an old reader just sees a pos', () => {
  const id = 'abcdefgh', pos = (extra) => validateMessage({ t: 'pos', id, x: 50, y: 10, d: 'down', area: 'beach', ...extra });
  assert.equal(pos({ treat: 3 }).treat, 3);
  for (const bad of [0, 9, 2.5, '2', null, true]) assert.equal('treat' in pos({ treat: bad }), false, `${bad} is dropped`);
  assert.equal('treat' in pos({}), false);
  const hello = validateMessage({ t: 'hello', id, name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] }, x: 50, y: 10, d: 'down', area: 'beach', treat: 6 }, {});
  assert.equal(hello.pos.treat, 6);
  assert.equal('treat' in validateMessage({ t: 'hello', id, name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] }, x: 50, y: 10, d: 'down', area: 'beach', treat: 99 }, {}).pos, false);
});

test('net: a treat change is sent even on the same tile, and it reaches the peers as an event', async () => {
  const sent = [];
  const timers = { setInterval: () => 1, clearInterval() {}, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {} };
  let clock = 1000;
  const wire = { name: 'fake', async open() { return { send: (m) => sent.push(m), close() {} }; } };
  const net = createNet({ wire, catalogue: {}, now: () => (clock += 200), timers });
  await net.join('FOCA-LUNA-42', { name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] } });
  sent.length = 0;
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 0);
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 2);
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 2);
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 6);
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 0);
  assert.deepEqual(sent.filter((m) => m.t === 'pos').map((m) => m.treat || 0), [0, 2, 6, 0]);
});

test('the cues and the drawing exist: munch, sip and yum are soft; each treat has a sprite that shrinks, an icon, and a held drawing for every stage', () => {
  for (const c of ['munch', 'sip', 'yum']) assert.ok(Array.isArray(CUES[c]) && CUES[c].length >= 2, c);
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? {} : (...a) => { calls.push(k); return undefined; }), set: () => true });
  assert.ok(typeof treatSprite === 'function' && typeof drawTreatIcon === 'function' && typeof drawHeld === 'function');
  const src = readFileSync(new URL('../src/art/treat.js', import.meta.url), 'utf8');
  assert.ok(src.includes('LEFT') && src.includes('drawHeld') && src.includes('smooth'));
  assert.ok(calls.length === 0);
});
