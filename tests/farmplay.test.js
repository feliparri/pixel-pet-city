import test from 'node:test';
import assert from 'node:assert/strict';
import { FARM, isWalkable, tileAt } from '../src/map.js';
import { KINDS, CAP, STATE_MAX, canastaFrom, packCanasta, stateWithCanasta, createCanasta } from '../src/canasta.js';
import { PLOTS, TREES, FRUIT_PER_TREE, WATER_HEAD_MIN, plotTimes, cropStage, plotLook, farmView, clockOf, createFarmMemory, plotAt } from '../src/farm-world.js';
import { actionAt, perform, objectAt, reach } from '../src/farm-actions.js';
import { stateWithRadar, radarOf } from '../src/radar.js';
import { stateWithStars } from '../src/stars.js';
import { zonedToMs } from '../src/admin-time.js';

const ROOM = 'FOCA-LUNA-42';
const at = (date, time) => zonedToMs(date, time);                       // a Chile wall clock time as a UTC instant
const D1 = '2026-10-26', D2 = '2026-10-27';
const ctxOf = (nowMs, basket = createCanasta(), mem = createFarmMemory()) => ({ basket, mem, room: ROOM, nowMs });
const plot = (kind) => PLOTS.find((p) => p.kind === kind);
/** A walkable tile next to a tree / the well / the fence for the tests. */
const standBy = (x, y) => [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => [x + dx, y + dy]).find(([a, b]) => isWalkable(a, b, 'farm'));
const dirTo = (from, to) => (to[0] > from[0] ? 'right' : to[0] < from[0] ? 'left' : to[1] > from[1] ? 'down' : 'up');

test('the farm has crop plots of the four kinds and fruit trees of the three fruits', () => {
  assert.deepEqual([...new Set(PLOTS.map((p) => p.kind))].sort(), ['carrot', 'lettuce', 'pumpkin', 'wheat']);
  assert.deepEqual([...new Set(TREES.map((t) => t.fruit))].sort(), ['apple', 'orange', 'pear']);
  assert.ok(PLOTS.length > 100 && TREES.length >= 15);
});

test('a plot cycles seeded, growing, ripe through the day and is the same for everyone in the room', () => {
  const p = plot('carrot'), t = plotTimes(ROOM, D1, p);
  assert.ok(t.grow >= 300 && t.grow <= 480 && t.ripe >= 540 && t.ripe <= 1080);
  assert.equal(cropStage(ROOM, D1, 0, p), 'seeded');
  assert.equal(cropStage(ROOM, D1, t.grow, p), 'growing');
  assert.equal(cropStage(ROOM, D1, t.ripe - 1, p), 'growing');
  assert.equal(cropStage(ROOM, D1, t.ripe, p), 'ripe');
  assert.equal(cropStage(ROOM, D1, 1439, p), 'ripe');
  const a = PLOTS.map((q) => cropStage(ROOM, D1, 700, q)).join(), b = PLOTS.map((q) => cropStage(ROOM, D1, 700, q)).join();
  assert.equal(a, b, 'a pure function of room, day, plot and time');
  assert.notEqual(PLOTS.map((q) => plotTimes('OTRA-SALA-1', D1, q).ripe).join(), PLOTS.map((q) => plotTimes(ROOM, D1, q).ripe).join(), 'another room grows on its own clock');
  assert.ok(new Set(PLOTS.map((q) => plotTimes(ROOM, D1, q).ripe)).size > 20, 'plots do not all ripen together');
});

test('the Chile day rolls over at midnight: the plots start seeded again and what was picked is forgotten', () => {
  assert.deepEqual(clockOf(at(D1, '23:59')), { day: D1, minute: 1439 });
  assert.deepEqual(clockOf(at(D2, '00:00')), { day: D2, minute: 0 });
  const mem = createFarmMemory(), p = plot('pumpkin');
  const late = farmView(ROOM, at(D1, '23:59'), mem);
  assert.equal(late.plots.get(p.id).look, 'ripe');
  mem.markPicked(p.id);
  assert.equal(farmView(ROOM, at(D1, '23:59'), mem).plots.get(p.id).look, 'bare');
  const next = farmView(ROOM, at(D2, '00:01'), mem);
  assert.ok([...next.plots.values()].every((v) => v.look === 'seeded' && !v.wet), 'a new day: everything seeded and dry');
  assert.equal(mem.picked(p.id), false);
});

test('what a pet picks is its own: another memory still sees the plot ripe', () => {
  const mine = createFarmMemory(), yours = createFarmMemory(), p = plot('wheat'), now = at(D1, '20:00');
  mine.use(D1); yours.use(D1);
  mine.markPicked(p.id);
  assert.equal(farmView(ROOM, now, mine).plots.get(p.id).look, 'bare');
  assert.equal(farmView(ROOM, now, yours).plots.get(p.id).look, 'ripe');
  const over = farmView(ROOM, now, mine).over;
  assert.deepEqual(over.map((v) => v.id), [p.id], 'only the plots that differ from the baked ripe art are listed');
});

test('the memory is kept between visits (same day) and ignores nonsense', () => {
  let saved = null;
  const a = createFarmMemory({ save: (m) => { saved = JSON.parse(JSON.stringify(m)); } }), p = plot('lettuce'), tree = TREES[0];
  a.use(D1); a.markPicked(p.id); a.markWatered(plot('carrot').id); a.takeFruit(tree.id); a.record('harvest', 'lettuce'); a.record('water');
  const b = createFarmMemory({ load: () => saved });
  b.use(D1);
  assert.ok(b.picked(p.id) && b.watered(plot('carrot').id));
  assert.equal(b.fruitLeft(tree.id), FRUIT_PER_TREE - 1);
  assert.equal(b.count('harvest', 'lettuce'), 1); assert.equal(b.count('harvest'), 1); assert.equal(b.count('water'), 1);
  for (const bad of [null, 'x', 5, { day: 'hoy' }, { day: D1, picked: 'no', fruit: [], did: 3 }, { day: D1, picked: ['9999,9999', 7], fruit: { nope: 5 } }]) {
    const m = createFarmMemory({ load: () => bad });
    m.use(m.day || D1);
    assert.equal(m.picked('9999,9999'), false);
    assert.equal(m.fruitLeft(TREES[0].id), FRUIT_PER_TREE);
  }
  assert.ok(JSON.stringify(saved).length < 2000, 'the memory is small');
});

test('watering makes a plot ripen sooner for the pet that watered it, and darkens its soil', () => {
  const p = plot('carrot'), t = plotTimes(ROOM, D1, p), mem = createFarmMemory();
  mem.use(D1);
  const before = t.ripe - 1;                                          // a minute before the shared ripe time: still growing
  assert.equal(plotLook(ROOM, D1, before, p, mem).look, 'growing');
  mem.markWatered(p.id);
  assert.equal(plotLook(ROOM, D1, before, p, mem).look, 'ripe', 'watered: ripe already');
  assert.equal(plotLook(ROOM, D1, before, p, mem).wet, true);
  assert.equal(plotLook(ROOM, D1, t.ripe - WATER_HEAD_MIN - 1, p, mem).look, 'growing');
  assert.equal(plotLook(ROOM, D1, t.ripe - WATER_HEAD_MIN, p, mem).look, 'ripe');
  assert.equal(cropStage(ROOM, D1, before, p, false), 'growing', 'the shared clock is unchanged');
  assert.equal(plotLook(ROOM, D1, 1000, p, createFarmMemory()).wet, false);
  const other = createFarmMemory(); other.use(D1);
  assert.equal(plotLook(ROOM, D1, before, p, other).look, 'growing', 'another pet did not water it');
});

test('action availability by tile: ripe plots, trees, the well, the paddock, and nothing elsewhere', () => {
  const evening = at(D1, '20:00'), p = plot('carrot'), mem = createFarmMemory();
  mem.use(D1);
  assert.equal(actionAt('town', p.x, p.y, 'down', ctxOf(evening, undefined, mem)), null, 'only on the farm');
  const harvest = actionAt('farm', p.x, p.y, 'down', ctxOf(evening, undefined, mem));
  assert.deepEqual([harvest.id, harvest.kind, harvest.target], ['harvest', 'carrot', p.id]);
  assert.match(harvest.label, /Cosechar zanahoria/);
  assert.equal(actionAt('farm', p.x, p.y, 'down', ctxOf(at(D1, '00:30'), undefined, mem))?.id, undefined, 'still seeded: nothing to harvest, nothing to water without a bucket');
  assert.equal(actionAt('farm', 21, 17, 'down', ctxOf(evening, undefined, mem)), null, 'the road');
  const tree = TREES[0], stand = standBy(tree.x, tree.y), pick = actionAt('farm', stand[0], stand[1], dirTo(stand, [tree.x, tree.y]), ctxOf(evening, undefined, mem));
  assert.deepEqual([pick.id, pick.kind], ['pick', tree.fruit]);
  const [wx, wy] = FARM.well, ws = standBy(wx, wy);
  assert.equal(actionAt('farm', ws[0], ws[1], 'down', ctxOf(evening, undefined, mem)).id, 'fill');
  const full = createCanasta(); full.fillBucket();
  assert.equal(actionAt('farm', ws[0], ws[1], 'down', ctxOf(evening, full, mem)), null, 'a full bucket: nothing at the well');
  const fence = [FARM.paddock.x + 2, FARM.paddock.y - 1], fs = [fence[0], fence[1] - 1];
  assert.equal(tileAt(fence[0], fence[1], 'farm'), 'F');
  assert.equal(actionAt('farm', fs[0], fs[1], 'down', ctxOf(evening, undefined, mem)).id, 'hint', 'no feed in the basket: only a hint');
  const fed = createCanasta(); fed.add('wheat', 2);
  assert.equal(actionAt('farm', fs[0], fs[1], 'down', ctxOf(evening, fed, mem)).id, 'feed');
  assert.equal(objectAt(tree.x, tree.y), 'tree'); assert.equal(objectAt(wx, wy), 'well'); assert.equal(objectAt(fence[0], fence[1]), 'fence'); assert.equal(objectAt(21, 17), null);
  assert.deepEqual(reach(5, 5, 'left')[1], [4, 5], 'the faced tile comes first after the own one');
});

test('harvesting and picking fill the basket, once per plot and a few fruits per tree per day', () => {
  const evening = at(D1, '20:00'), basket = createCanasta(), mem = createFarmMemory(), p = plot('pumpkin');
  mem.use(D1);
  const a = actionAt('farm', p.x, p.y, 'down', ctxOf(evening, basket, mem));
  const r = perform(a, { basket, mem });
  assert.deepEqual([r.ok, r.type, r.kind, r.icon], [true, 'harvest', 'pumpkin', 'pumpkin']);
  assert.equal(basket.count('pumpkin'), 1);
  assert.equal(actionAt('farm', p.x, p.y, 'down', ctxOf(evening, basket, mem)), null, 'harvested: nothing more there today');
  const tree = TREES[3], stand = standBy(tree.x, tree.y), face = dirTo(stand, [tree.x, tree.y]);
  for (let i = 0; i < FRUIT_PER_TREE; i++) assert.equal(perform(actionAt('farm', stand[0], stand[1], face, ctxOf(evening, basket, mem)), { basket, mem }).ok, true);
  assert.equal(basket.count(tree.fruit), FRUIT_PER_TREE);
  assert.equal(actionAt('farm', stand[0], stand[1], face, ctxOf(evening, basket, mem)), null, 'the tree is bare for this pet today');
  assert.equal(mem.count('pick', tree.fruit), FRUIT_PER_TREE);
});

test('a full basket refuses a pick and the plot stays ripe', () => {
  const evening = at(D1, '20:00'), basket = createCanasta(), mem = createFarmMemory(), p = plot('carrot');
  mem.use(D1);
  basket.add('carrot', CAP);
  const r = perform(actionAt('farm', p.x, p.y, 'down', ctxOf(evening, basket, mem)), { basket, mem });
  assert.equal(r.ok, false); assert.match(r.text, /llena/);
  assert.equal(basket.count('carrot'), CAP);
  assert.equal(mem.picked(p.id), false);
});

test('the well fills the bucket, then a dry growing plot can be watered with it', () => {
  const morning = at(D1, '07:00'), basket = createCanasta(), mem = createFarmMemory();
  mem.use(D1);
  const dry = PLOTS.find((q) => cropStage(ROOM, D1, 7 * 60, q) !== 'ripe');
  assert.equal(actionAt('farm', dry.x, dry.y, 'down', ctxOf(morning, basket, mem)), null, 'no water to give yet');
  const [wx, wy] = FARM.well, ws = standBy(wx, wy);
  const fill = perform(actionAt('farm', ws[0], ws[1], 'down', ctxOf(morning, basket, mem)), { basket, mem });
  assert.deepEqual([fill.ok, fill.icon], [true, 'bucket-full']);
  assert.equal(basket.bucketFull, true);
  const water = actionAt('farm', dry.x, dry.y, 'down', ctxOf(morning, basket, mem));
  assert.deepEqual([water.id, water.label], ['water', 'Regar']);
  assert.deepEqual([perform(water, { basket, mem }).ok, basket.bucketFull, mem.watered(dry.id)], [true, false, true]);
  assert.notEqual(actionAt('farm', dry.x, dry.y, 'down', ctxOf(morning, basket, mem))?.id, 'water', 'already watered, and the bucket is empty');
  assert.equal(mem.count('fill'), 1); assert.equal(mem.count('water'), 1);
});

test('feeding the animals takes wheat first, then lettuce', () => {
  const basket = createCanasta(), mem = createFarmMemory();
  mem.use(D1);
  basket.add('lettuce', 1); basket.add('wheat', 1);
  const act = { id: 'feed', label: 'Dar de comer', kind: 'wheat', target: 'paddock' };
  assert.equal(perform(act, { basket, mem }).kind, 'wheat');
  assert.equal(perform(act, { basket, mem }).kind, 'lettuce');
  assert.equal(perform(act, { basket, mem }).ok, false);
  assert.equal(mem.count('feed'), 2);
});

test('the basket caps every kind, ignores nonsense and reports every change', () => {
  const saved = [], b = createCanasta({ persist: (s) => saved.push(s) });
  assert.equal(b.add('apple', 5), 5);
  assert.equal(b.add('apple', 100), CAP - 5);
  assert.equal(b.add('apple', 1), 0);
  assert.equal(b.room('apple'), false); assert.equal(b.room('pear'), true);
  assert.equal(b.add('rock', 1), 0); assert.equal(b.add('pear', -2), 0); assert.equal(b.add('pear', 1.5), 0);
  assert.equal(b.take('apple', 25), false); assert.equal(b.take('apple', 4), true); assert.equal(b.count('apple'), CAP - 4);
  assert.equal(b.fillBucket(), true); assert.equal(b.fillBucket(), false); assert.equal(b.emptyBucket(), true); assert.equal(b.emptyBucket(), false);
  assert.equal(saved.length, 5, 'one save per real change');
  assert.deepEqual(canastaFrom({ canasta: { apple: 99, pear: -3, wheat: 'x', carrot: 2.5, bucket: 1 } }), { counts: { apple: CAP, pear: 0, orange: 0, carrot: 0, lettuce: 0, pumpkin: 0, wheat: 0 }, bucket: true });
  for (const bad of [null, undefined, {}, { canasta: 5 }, { canasta: [] }, []]) assert.deepEqual(canastaFrom(bad).counts, canastaFrom({}).counts);
});

test('the basket is saved in the trip state beside the stars and restored on reopen', () => {
  const b = createCanasta();
  b.add('apple', 3); b.add('wheat', 7); b.fillBucket();
  const state = stateWithCanasta(stateWithStars({ shop: ['x'] }, 12), b.snapshot());
  assert.deepEqual(state.canasta, { apple: 3, wheat: 7, bucket: 1 });
  assert.equal(state.stars, 12); assert.deepEqual(state.shop, ['x']);
  const back = createCanasta({ initial: canastaFrom(JSON.parse(JSON.stringify(state))) });
  assert.deepEqual(back.snapshot(), b.snapshot());
  assert.deepEqual(packCanasta(createCanasta().snapshot()), {});
});

test('a full basket, the stars and a full radar still fit the 2048 character limit', () => {
  const b = createCanasta();
  for (const k of KINDS) b.add(k, CAP);
  b.fillBucket();
  const pets = Array.from({ length: 8 }, (_, i) => ({ n: `Mascota${i}`.padEnd(12, 'x'), sp: 'cat', st: 2, s: 99999, a: 'town' }));
  let state = stateWithStars({ shop: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], pets: 1 }, 999999);
  state = stateWithRadar(state, radarOf(ROOM, pets, 1.7e12));
  state = stateWithCanasta(state, b.snapshot());
  assert.ok(JSON.stringify(state).length <= STATE_MAX, `the state is ${JSON.stringify(state).length} characters`);
  assert.ok(JSON.stringify(packCanasta(b.snapshot())).length < 120, 'the basket alone is small');
  assert.deepEqual(canastaFrom(state).counts, b.snapshot().counts, 'the basket is never the one dropped');
  const tight = stateWithCanasta(stateWithRadar({}, radarOf(ROOM, pets, 1.7e12)), b.snapshot(), 150);       // a limit so low that something must go: the radar, not the basket
  assert.equal(tight.radar, undefined); assert.equal(tight.canasta.apple, CAP);
});

test('plotAt finds a plot by tile and nothing on grass', () => {
  const p = PLOTS[0];
  assert.equal(plotAt(p.x, p.y).id, p.id);
  assert.equal(plotAt(0, 0), null);
});
