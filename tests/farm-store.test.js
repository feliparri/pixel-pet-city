import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { world, fixture } from './trip-helpers.js';
import { parsePackage, buildReturn, fromBase64, crc32 } from '../supabase/functions/trip/travel-package.js';
import { handle } from '../supabase/functions/trip/handlers.js';
import { TOOLS as SERVER_TOOLS } from '../supabase/functions/trip/tools.js';
import { TOOLS, NEEDS, toolKeys, toolRows, needText, confirmToolText, toolErrorText } from '../src/tools.js';
import { shopFrom, shopAfterBuyTool } from '../src/shop.js';
import { createMockShop } from '../src/shop-mock.js';
import { createTripClient } from '../src/trip.js';
import { actionAt, perform } from '../src/farm-actions.js';
import { createCanasta } from '../src/canasta.js';
import { createFarmMemory, PLOTS, TREES, plotTimes } from '../src/farm-world.js';
import { FARM, AREAS, isWalkable, tileAt, SIGNS } from '../src/map.js';
import { findPath } from '../src/path.js';
import { CLERK, nearStore } from '../src/npcs.js';
import { PRODUCE } from '../src/art/produce.js';
import { zonedToMs } from '../src/admin-time.js';

const plain = fixture('plain.bin');
const catalogue = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url))).items;
const TRIP_ID = 0xA1B2C3D4;

// ---- the price list ------------------------------------------------------------------------------------------------------------
test('the Almacen price list mirrors the server one, in one place each, at modest prices', () => {
  assert.deepEqual(Object.keys(TOOLS), Object.keys(SERVER_TOOLS));
  for (const [k, it] of Object.entries(SERVER_TOOLS)) {
    assert.deepEqual([TOOLS[k].price, TOOLS[k].name], [it.price, it.name], k);
    assert.ok(it.price >= 25 && it.price <= 40, `${k} costs ${it.price}`);
    assert.ok(PRODUCE.includes(TOOLS[k].icon), `${k} has an icon`);
  }
  assert.deepEqual(NEEDS, { harvest: 'sickle', fill: 'bucket', water: 'bucket', feed: 'feed_sack' });
  assert.deepEqual(toolKeys(['sickle', 'sickle', 'nope', 3, 'bucket']), ['sickle', 'bucket']);
  assert.equal(toolKeys('x').length, 0);
});

test('every tool icon is 12 x 12', () => {
  const src = readFileSync(new URL('../src/art/produce.js', import.meta.url), 'utf8');
  for (const name of ['sickle', 'sack']) {
    const rows = [...src.match(new RegExp(`PICTURES\\.${name} = \\[([\\s\\S]*?)\\];`))[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    assert.equal(rows.length, 12, name);
    assert.ok(rows.every((r) => r.length === 12), name);
  }
});

// ---- the store on the map ------------------------------------------------------------------------------------------------------
test('the stall stands on free ground, is solid, has its clerk behind the counter and a way to the counter from the road', () => {
  const g = AREAS.farm.grid, S = FARM.store;
  for (let y = S.y; y < S.y + S.h; y++) for (let x = S.x; x < S.x + S.w; x++) assert.equal(g[y][x], 'M', `${x},${y}`);
  assert.equal(isWalkable(S.x, S.y, 'farm'), false);
  assert.deepEqual(CLERK.tile, [S.x + 1, S.y]);
  assert.equal(g[CLERK.tile[1]][CLERK.tile[0]], 'M');
  assert.ok(!PLOTS.some((p) => p.x >= S.x && p.x < S.x + S.w && p.y >= S.y && p.y < S.y + S.h));
  assert.ok(!TREES.some((t) => t.x >= S.x && t.x < S.x + S.w && t.y >= S.y && t.y < S.y + S.h));
  const front = [S.x + 1, S.y + S.h];                                    // the tile below the counter
  assert.ok(isWalkable(front[0], front[1], 'farm') && nearStore(front[0], front[1]));
  assert.ok(findPath(21, 17, front[0], front[1], 'farm').length > 0, 'reachable from the road');
  assert.equal(nearStore(S.x + 1, S.y - 1), false, 'not from behind it');
  assert.equal(nearStore(S.x + 1, S.y + S.h + 3), false);
  assert.ok(SIGNS.some((s) => s.area === 'farm' && s.text === 'Almacén'));
  for (const s of SIGNS.filter((q) => q.area === 'farm')) assert.equal(g[s.y][s.x], 'S', s.text);
});

// ---- the panel's rows and texts ------------------------------------------------------------------------------------------------
test('the store rows: buy, not enough gold, owned and a board that cannot spend', () => {
  const rowsOf = (shop) => Object.fromEntries(toolRows(shop).map((r) => [r.key, r]));
  const shop = shopFrom({ can_spend: true, gold_left: 30, bought: [] }, { owned: [], bag: [], tools: ['sickle'] });
  const rows = rowsOf(shop);
  assert.deepEqual([rows.sickle.state, rows.sickle.label, rows.sickle.enabled], ['owned', 'Ya la tienes', false]);
  assert.deepEqual([rows.bucket.state, rows.bucket.label, rows.bucket.enabled], ['buy', 'Comprar', true]);
  assert.deepEqual([rows.feed_sack.state, rows.feed_sack.missing, rows.feed_sack.label, rows.feed_sack.enabled], ['nogold', 5, 'Te faltan 5 de oro', false]);
  const old = rowsOf(shopFrom({ can_spend: false, gold_left: null, bought: [] }, { owned: [], bag: [], tools: [] }));
  assert.ok(Object.values(old).every((r) => r.state === 'closed' && !r.enabled));
  assert.equal(confirmToolText('sickle'), '¿Comprar una Hoz por 30 de oro? Se queda con tu mascota en el pueblo.');
  assert.equal(needText('sickle'), 'Necesitas una Hoz — Almacén');
  assert.equal(needText('bucket'), 'Necesitas un Balde — Almacén');
  assert.equal(needText('feed_sack'), 'Necesitas un Saco de alimento — Almacén');
  assert.match(toolErrorText({ error: 'owned' }), /^Tu mascota/);
  assert.equal(toolErrorText({ error: 'no_gold' }), null);
});

test('what a tool reply teaches the state; a status poll keeps the tools', () => {
  const shop = shopFrom({ can_spend: true, gold_left: 100, bought: [] }, { owned: [], bag: [], tools: [] });
  const bought = shopAfterBuyTool(shop, 'sickle', { ok: true, gold_left: 70, tools: ['sickle'] });
  assert.deepEqual([bought.gold, bought.tools], [70, ['sickle']]);
  assert.equal(shopAfterBuyTool(shop, 'bucket', { ok: false, error: 'no_gold', price: 25, gold_left: 10 }).gold, 10);
  assert.deepEqual(shopAfterBuyTool(shop, 'bucket', { ok: false, error: 'owned' }).tools, ['bucket']);
  assert.equal(shopAfterBuyTool(shop, 'bucket', { ok: false, error: 'shop_closed' }).canSpend, false);
  assert.equal(shopAfterBuyTool(shop, 'bucket', { ok: false, error: 'network' }), shop);
  assert.deepEqual(shopFrom({ can_spend: true, gold_left: 60, bought: [] }, null, bought).tools, ['sickle']);
});

test('the dev mock follows the same rules as trip-buy-tool and shares the gold with the shop', async () => {
  const m = createMockShop('?gold=55&tools=sickle');
  assert.deepEqual(m.shop.tools, ['sickle']);
  assert.equal((await m.buyTool('sickle')).error, 'owned');
  assert.deepEqual(await m.buyTool('bucket'), { ok: true, gold_left: 30, tools: ['sickle', 'bucket'] });
  assert.equal(m.shop.gold, 30);
  assert.equal((await m.buyTool('feed_sack')).error, 'no_gold');
  assert.equal((await m.buyTool('plough')).error, 'not_for_sale');
  assert.equal((await m.buy('bow')).error, 'owned');
  assert.equal((await createMockShop('?shop=closed').buyTool('sickle')).error, 'shop_closed');
  assert.deepEqual(createMockShop('').shop.tools, []);
});

// ---- the actions need their tools ----------------------------------------------------------------------------------------------
const ROOM = 'FOCA-LUNA-42', D1 = '2026-10-26';
const at = (time) => zonedToMs(D1, time);
const ctx = (basket, mem, tools, time = '20:00') => ({ basket, mem, room: ROOM, nowMs: at(time), tools });
const ripe = PLOTS.find((p) => p.kind === 'carrot');
const near = (x, y) => [[x, y + 1], [x, y - 1], [x + 1, y], [x - 1, y]].find(([a, b]) => isWalkable(a, b, 'farm'));

test('without the Hoz a ripe plot only says what is missing; with it the pet harvests', () => {
  const mem = createFarmMemory(); mem.use(D1);
  const basket = createCanasta();
  const no = actionAt('farm', ripe.x, ripe.y, 'down', ctx(basket, mem, []));
  assert.deepEqual([no.id, no.label, no.need], ['hint', 'Necesitas una Hoz — Almacén', 'sickle']);
  assert.equal(actionAt('farm', ripe.x, ripe.y, 'down', ctx(basket, mem, undefined)).id, 'hint', 'no list at all: no tools');
  assert.equal(actionAt('farm', ripe.x, ripe.y, 'down', ctx(basket, mem, ['bucket', 'feed_sack'])).id, 'hint', 'other tools do not help');
  const yes = actionAt('farm', ripe.x, ripe.y, 'down', ctx(basket, mem, ['sickle']));
  assert.equal(yes.id, 'harvest');
  assert.deepEqual([perform(yes, { basket, mem, tools: [] }).ok, basket.count('carrot')], [false, 0]);
  assert.equal(perform(yes, { basket, mem, tools: [] }).text, 'Necesitas una Hoz — Almacén');
  assert.deepEqual([perform(yes, { basket, mem, tools: ['sickle'] }).ok, basket.count('carrot')], [true, 1]);
  assert.equal(mem.picked(ripe.id), true);
});

test('without the Balde the well and the watering say so; picking fruit by hand stays free', () => {
  const mem = createFarmMemory(); mem.use(D1);
  const basket = createCanasta();
  const [wx, wy] = near(...FARM.well);
  const fill = actionAt('farm', wx, wy, 'down', ctx(basket, mem, []));
  assert.deepEqual([fill.id, fill.label], ['hint', 'Necesitas un Balde — Almacén']);
  assert.equal(actionAt('farm', wx, wy, 'down', ctx(basket, mem, ['bucket'])).id, 'fill');
  const dry = PLOTS.find((q) => q.kind === 'pumpkin' && plotTimes(ROOM, D1, q).ripe > 7 * 60);
  basket.fillBucket();                                                    // a full bucket (it was bought before): still needs the tool to water
  const morning = (tools) => actionAt('farm', dry.x, dry.y, 'down', ctx(basket, mem, tools, '07:00'));
  assert.equal(morning([]).label, 'Necesitas un Balde — Almacén');
  assert.equal(morning(['bucket']).id, 'water');
  const tree = TREES[0], stand = near(tree.x, tree.y);
  const dir = stand[0] < tree.x ? 'right' : stand[0] > tree.x ? 'left' : stand[1] < tree.y ? 'down' : 'up';
  assert.equal(actionAt('farm', stand[0], stand[1], dir, ctx(createCanasta(), mem, [])).id, 'pick', 'fruit by hand needs nothing');
});

test('without the Saco the animals only get a hint; with it and no food, the old hint', () => {
  const mem = createFarmMemory(); mem.use(D1);
  const fence = [FARM.paddock.x + 2, FARM.paddock.y - 1], fs = [fence[0], fence[1] - 1];
  const fed = createCanasta(); fed.add('wheat', 2);
  const no = actionAt('farm', fs[0], fs[1], 'down', ctx(fed, mem, []));
  assert.deepEqual([no.id, no.label], ['hint', 'Necesitas un Saco de alimento — Almacén']);
  assert.equal(actionAt('farm', fs[0], fs[1], 'down', ctx(fed, mem, ['feed_sack'])).id, 'feed');
  assert.equal(actionAt('farm', fs[0], fs[1], 'down', ctx(createCanasta(), mem, ['feed_sack'])).label, 'Trae trigo o lechuga');
  assert.deepEqual([perform({ id: 'feed', label: 'x', kind: 'wheat', target: 'paddock' }, { basket: fed, mem, tools: [] }).ok, fed.count('wheat')], [false, 2]);
});

// ---- trip-buy-tool against the real handlers -----------------------------------------------------------------------------------
async function start(src = plain, extra = { spend: 1 }, w = world(), board = w.board(), register = true) {
  if (register) await board.register();
  const s = await board.start(src, extra);
  const c = await w.web().call('trip-claim', { code: s.body.code });
  const web = w.web(c.body.token);
  return { w, board, web, ref: s.body.trip, row: w.db.trips.get(s.body.trip), claim: c.body, buyTool: (tool) => web.call('trip-buy-tool', { trip: s.body.trip, tool }), buy: (item) => web.call('trip-buy', { trip: s.body.trip, item }) };
}
const goldOf = (b) => parsePackage(b).pkg.petInfo.gold;

test('buy tool: the happy path updates the ledger, keeps the tool per board, and the claim lists it', async () => {
  const t = await start();
  assert.deepEqual(t.claim.pet.tools, []);
  const a = await t.buyTool('sickle');
  assert.deepEqual([a.status, a.body], [200, { gold_left: 4970, tools: ['sickle'] }]);
  const b = await t.buyTool('feed_sack');
  assert.deepEqual(b.body, { gold_left: 4935, tools: ['sickle', 'feed_sack'] });
  assert.deepEqual([t.row.spent, t.row.bought], [65, []], 'the ledger counts the gold, the gift list stays empty');
  assert.deepEqual([...t.w.db.tools.get(t.board.deviceId)], ['sickle', 'feed_sack']);
  const st = await t.web.call('trip-status', { trip: t.ref });
  assert.equal(st.body.gold_left, 4935);
  const resumed = await t.web.call('trip-claim', { code: t.row.code });                   // the same session resumes and sees its tools
  assert.deepEqual([resumed.status, resumed.body.pet.tools], [200, ['sickle', 'feed_sack']]);
});

test('buy tool: tools stay with the pet on the next trip and never go in a return package', async () => {
  const t = await start();
  await t.buyTool('bucket');
  await t.buyTool('sickle');
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  const ret = await t.board.call('trip-return', { trip_id: TRIP_ID });
  const bytes = fromBase64(ret.body.package);
  assert.equal(goldOf(bytes), 5000 - 55, 'only the gold comes off');
  assert.deepEqual(bytes, buildReturn(plain, 1 + parsePackage(plain).pkg.seq, { spent: 55, bought: [] }), 'byte for byte a return with gold spent and nothing else');
  assert.deepEqual(parsePackage(bytes).pkg.gifts, []);
  await t.board.call('trip-ack', { trip_id: TRIP_ID });
  const next = await start(fixture('keepsake.bin'), { spend: 1 }, t.w, t.board, false);   // the same board, a later trip
  assert.deepEqual(next.claim.pet.tools, ['bucket', 'sickle']);
  assert.equal((await next.buyTool('bucket')).body.error, 'owned');
  assert.equal((await next.buyTool('feed_sack')).status, 200);
  const other = await start();                                                            // another board has its own tools
  assert.deepEqual(other.claim.pet.tools, []);
});

test('buy tool: shared ledger with the shop, shortfalls and every refusal have their code', async () => {
  const t = await start();
  const gold = t.claim.pet.gold;
  assert.equal((await t.buy('cape')).status, 200);                                          // the shop spent 120 first
  assert.equal((await t.buyTool('sickle')).body.gold_left, gold - 120 - 30);
  const bad = await t.buyTool('plough');
  assert.deepEqual([bad.status, bad.body.error], [400, 'not_for_sale']);
  assert.equal((await t.buyTool(7)).body.error, 'not_for_sale');
  assert.equal((await t.buyTool('sickle')).body.error, 'owned');
  assert.deepEqual((await t.buyTool('sickle')).body.tools, ['sickle']);
  assert.equal((await t.w.web('ab'.repeat(32)).call('trip-buy-tool', { trip: t.ref, tool: 'bucket' })).body.error, 'bad_session');
  assert.equal((await t.w.web().call('trip-buy-tool', { trip: t.ref, tool: 'bucket' })).status, 401);
  await t.board.call('trip-recall', { trip_id: TRIP_ID });
  const over = await t.buyTool('bucket');
  assert.deepEqual([over.status, over.body.error], [409, 'trip_over']);
  assert.equal(t.w.db.tools.get(t.board.deviceId).has('bucket'), false);
});

const petAt = (b) => b.length - 4 - 733;
const withGold = (src, g) => { const b = new Uint8Array(src); new DataView(b.buffer).setUint32(petAt(b) + 103, g, true); new DataView(b.buffer).setUint32(b.length - 4, crc32(b, b.length - 4), true); return b; };

test('buy tool: not enough gold, exact gold works, a trip over or an old board refuses', async () => {
  const t = await start(withGold(plain, 55));
  assert.equal(t.claim.pet.gold, 55);
  assert.equal((await t.buyTool('sickle')).body.gold_left, 25);
  const no = await t.buyTool('feed_sack');
  assert.deepEqual([no.status, no.body.error, no.body.gold_left, no.body.price], [409, 'no_gold', 25, 35]);
  assert.equal((await t.buyTool('bucket')).body.gold_left, 0);                              // price == gold left is allowed
  assert.equal(t.row.spent, 55);
  const old = await start(plain, {});
  assert.deepEqual([(await old.buyTool('sickle')).status, (await old.buyTool('sickle')).body.error], [403, 'shop_closed']);
  assert.equal(old.w.db.tools.size, 0);
});

test('buy tool: two buys at once cannot overspend; a failed save of the tool gives the gold back', async () => {
  const t = await start(withGold(plain, 40));
  const read = t.w.db.getTripById; let waiting = [];                                        // both calls read the trip before either one writes
  t.w.db.getTripById = async (id) => { const row = await read(id); if (waiting) { await new Promise((go) => { waiting.push(go); if (waiting.length === 2) { waiting.forEach((f) => f()); waiting = null; } }); } return row && { ...row }; };
  const [a, b] = await Promise.all([t.buyTool('sickle'), t.buyTool('bucket')]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal([a, b].find((x) => x.status === 409).body.error, 'conflict');
  assert.equal(t.row.spent, a.status === 200 ? 30 : 25);
  t.w.db.getTripById = read;
  const w2 = await start(withGold(plain, 100));
  w2.w.db.addTool = async () => { throw new Error('db down'); };
  const down = await w2.web.call('trip-buy-tool', { trip: w2.ref, tool: 'sickle' });
  assert.deepEqual([down.status, down.body.error], [503, 'try_again']);
  assert.equal(w2.row.spent, 0, 'the gold came back');
});

// ---- the trip client ---------------------------------------------------------------------------------------------------------------
const deps = (w) => ({ db: w.db, nowS: () => w.now, randomBytes: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), uuid: () => crypto.randomUUID(), townUrl: 'https://town/' });
const toFetch = (w) => async (url, init) => {
  const fn = url.split('/').pop();
  const out = await handle(fn, { method: init.method, headers: Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v])), body: new TextEncoder().encode(init.body) }, deps(w));
  return { status: out.status, json: async () => out.body };
};

test('the trip client: claim carries the tools, buyTool updates the state, a second buy says owned', async () => {
  const w = world(), board = w.board();
  await board.register();
  const s = await board.start(plain, { spend: 1 });
  const client = createTripClient({ base: 'https://x/functions/v1/trip', fetch: toFetch(w), setInterval: () => 1, clearInterval() {} });
  const r = await client.claim(s.body.code, catalogue);
  assert.deepEqual([r.ok, r.pet.tools, client.shop.tools], [true, [], []]);
  const gold0 = client.shop.gold;
  const ok = await client.buyTool('bucket');
  assert.deepEqual([ok.ok, ok.tools], [true, ['bucket']]);
  assert.deepEqual([client.shop.gold, client.shop.tools], [gold0 - 25, ['bucket']]);
  const again = await client.buyTool('bucket');
  assert.deepEqual([again.ok, again.error], [false, 'owned']);
  const bad = await client.buyTool('nope');
  assert.equal(bad.error, 'not_for_sale');
  assert.equal(createTripClient({ base: 'x', fetch: toFetch(w) }).session, null);
  assert.equal((await createTripClient({ base: 'x', fetch: toFetch(w) }).buyTool('bucket')).error, 'bad_session');
});
