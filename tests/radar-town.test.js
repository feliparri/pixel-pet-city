import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activityOf, radarPets, radarOf, stateWithRadar, createRadarSaver, STATE_MAX, RADAR_PETS_MAX } from '../src/radar.js';
import { createNet } from '../src/net.js';
import { createTripClient } from '../src/trip.js';
import { stateWithStars } from '../src/stars.js';
import { ACTIVITIES } from '../src/protocol.js';
import { ACTIVITIES as SERVER_ACTIVITIES } from '../supabase/functions/trip/radar.js';
import { handle } from '../supabase/functions/trip/handlers.js';
import { world, fixture } from './trip-helpers.js';

const catalogue = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url))).items;
const look = { species: 'frog', stage: 1, items: ['', '', '', ''] };

test('the town and the server name the same activities', () => {
  assert.deepEqual(ACTIVITIES, SERVER_ACTIVITIES);
});

test('activity: a game this pet plays, the shop, walking, or nothing', () => {
  assert.equal(activityOf({ area: 'town', game: { g: 'soccer', play: true }, moving: true }), 'football');
  assert.equal(activityOf({ area: 'town', game: { g: 'race', play: true }, moving: false }), 'race');
  assert.equal(activityOf({ area: 'town', game: { g: 'chicken', play: true }, moving: true }), 'chicken');
  assert.equal(activityOf({ area: 'town', game: { g: 'hide', play: true }, moving: true }), 'hide');
  assert.equal(activityOf({ area: 'town', game: { g: 'soccer', play: false }, moving: true }), 'walk', 'a spectator is only walking');
  assert.equal(activityOf({ area: 'shop', game: null, moving: false }), 'shop');
  assert.equal(activityOf({ area: 'shop', game: null, moving: true }), 'shop');
  assert.equal(activityOf({ area: 'town', game: null, moving: true }), 'walk');
  assert.equal(activityOf({ area: 'town', game: undefined, moving: false }), 'idle');
  for (const g of ['hide', 'chicken', 'soccer', 'race']) assert.ok(ACTIVITIES.includes(activityOf({ area: 'town', game: { g, play: true }, moving: false })));
});

const entry = (id, over = {}) => ({ id, name: id, look, stats: [90, 80, 70, 60, 50], act: 'idle', ...over });

test('the radar lists this pet first, then the others by id, only those with stats, at most 8', () => {
  const self = entry('zzz', { name: 'Yo', act: 'walk' });
  const others = [entry('bbb'), entry('aaa', { stats: null }), entry('ccc', { act: 'nope' }), ...Array.from({ length: 10 }, (_, i) => entry(`dd${i}`))];
  const pets = radarPets(self, others);
  assert.equal(pets.length, RADAR_PETS_MAX);
  assert.deepEqual(pets[0], { n: 'Yo', sp: 'frog', st: 1, s: [90, 80, 70, 60, 50], a: 'walk' });
  assert.deepEqual(pets.slice(1, 3).map((p) => p.n), ['bbb', 'ccc']);
  assert.equal(pets[2].a, 'idle');
  assert.deepEqual(radarPets(entry('me', { stats: null }), [entry('x')]).map((p) => p.n), ['x'], 'a pet without stats is left out, not invented');
});

test('the radar object: the room and the pets, or nothing when not in a room', () => {
  const pets = radarPets(entry('me'), []);
  assert.deepEqual(radarOf('FOCA-LUNA-42', pets, 1_800_000_123_456), { room: 'FOCA-LUNA-42', at: 1_800_000_123, pets });
  assert.deepEqual(radarOf('', pets, 5000), { room: '', at: 5, pets: [] });
});

test('the radar and the stars share the state; a state too big loses pets, never the stars', () => {
  const pets = Array.from({ length: 8 }, (_, i) => ({ n: `Mascota${i}`.padEnd(12, 'x'), sp: 'seal', st: 3, s: [100, 100, 100, 100, 100], a: 'football' }));
  const radar = { room: 'FOCA-LUNA-42', at: 1_800_000_000, pets };
  const full = stateWithRadar(stateWithStars({}, 999999), radar);
  assert.equal(full.radar.pets.length, 8);
  assert.equal(full.stars, 999999);
  assert.ok(JSON.stringify(full).length < 800, `a full radar with the stars is ${JSON.stringify(full).length} characters of ${STATE_MAX}`);
  const crowded = stateWithRadar({ v: 1, stars: 5, shop: 'x'.repeat(1700) }, radar);
  assert.ok(JSON.stringify(crowded).length <= STATE_MAX);
  assert.ok(crowded.radar.pets.length > 0 && crowded.radar.pets.length < 8);
  assert.equal(crowded.stars, 5);
  assert.equal(crowded.shop.length, 1700);
  const hopeless = stateWithRadar({ v: 1, stars: 5, shop: 'x'.repeat(2040) }, radar);
  assert.ok(!('radar' in hopeless) && hopeless.stars === 5);
  assert.equal(radar.pets.length, 8, 'the radar given is not changed');
  assert.deepEqual(stateWithRadar(null, { room: '', at: 1, pets: [] }), { radar: { room: '', at: 1, pets: [] } });
});

test('the saver sends every tick and on demand, one at a time, and survives a failure', async () => {
  const ticks = [];
  const sent = [];
  let release = null, fail = false;
  const saver = createRadarSaver({
    build: () => ({ n: sent.length }),
    send: (r) => { sent.push(r); return fail ? Promise.reject(new Error('net')) : new Promise((res) => { release = () => res(true); }); },
    setInterval: (fn, ms) => { ticks.push({ fn, ms }); return 1; }, clearInterval: () => { ticks.length = 0; },
  });
  saver.start(); saver.start();
  assert.equal(ticks.length, 1);
  assert.equal(ticks[0].ms, 10000);
  ticks[0].fn();
  ticks[0].fn();                                       // still busy: not a second request, but one more right after
  saver.now();
  assert.equal(sent.length, 1);
  release(); await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 2);
  release(); await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 2, 'the busy calls were folded into one');
  fail = true;
  await saver.now();
  assert.equal(sent.length, 3);
  fail = false;
  saver.now(); release(); await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 4, 'a failure does not stop the next save');
  saver.stop();
  assert.equal(ticks.length, 0);
});

// ---- presence over the room ----------------------------------------------------------------------------------------------------------
function room() {
  const set = new Set();
  let clock = 0;
  const wire = () => ({ name: 'fake', async open(_c, _i, _h, onRaw) { const me = { onRaw }; set.add(me); return { send: (m) => { for (const o of set) if (o !== me) o.onRaw(JSON.parse(JSON.stringify(m))); }, close: () => set.delete(me) }; } });
  const make = () => {
    const timers = { intervals: [], setInterval: (fn) => { timers.intervals.push(fn); return 1; }, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} };
    return { net: createNet({ wire: wire(), catalogue, now: () => clock, timers }), timers };
  };
  return { make, advance: (ms) => { clock += ms; } };
}

test('a pet\'s stats reach the room in its hello, and its activity follows on the heartbeat', async () => {
  const { make } = room();
  const a = make(), b = make();
  await a.net.join('FOCA-LUNA-42', { name: 'Ana', look, stats: [10, 20, 30, 40, 50] });
  await b.net.join('FOCA-LUNA-42', { name: 'Beto', look });                      // an older page: no stats
  const pa = b.net.peers()[0], pb = a.net.peers()[0];
  assert.deepEqual([pa.stats, pa.act], [[10, 20, 30, 40, 50], 'idle']);
  assert.deepEqual([pb.stats, pb.act], [null, 'idle']);
  a.net.setActivity('football');
  a.net.setActivity('bogus');
  assert.equal(b.net.peers()[0].act, 'idle', 'nothing is sent by itself');
  a.timers.intervals[0]();                                                       // the heartbeat
  assert.deepEqual([b.net.peers()[0].stats, b.net.peers()[0].act], [[10, 20, 30, 40, 50], 'football']);
  a.net.leave(); b.net.leave();
});

// ---- the whole way: browser state to the board's answer --------------------------------------------------------------------------------
test('the browser saves the radar next to the stars and the board reads it, with no writer undoing the other', async () => {
  const w = world();
  const board = w.board();
  await board.register();
  const s = await board.start(fixture('plain.bin'));
  const deps = { db: w.db, nowS: () => w.now, randomBytes: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), uuid: () => crypto.randomUUID(), townUrl: 'https://town/' };
  const fetcher = async (url, init) => {
    const out = await handle(url.split('/').pop(), { method: init.method, headers: Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v])), body: new TextEncoder().encode(init.body) }, deps);
    return { status: out.status, json: async () => out.body };
  };
  const store = new Map();
  const client = createTripClient({ base: 'https://x/functions/v1/trip', fetch: fetcher, storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } });
  const r = await client.claim(s.body.code, catalogue);
  assert.deepEqual(r.pet.stats, [80, 80, 100, 100, 100]);
  const self = { id: 'me', name: r.pet.name, look: r.pet.look, stats: r.pet.stats, act: 'walk' };
  const radar = radarOf('FOCA-LUNA-42', radarPets(self, [entry('p2', { name: 'Kiwi', look: { species: 'seal', stage: 0, items: [] }, act: 'race' })]), w.now * 1000);
  const TRIP = 0xA1B2C3D4;
  // both writers go out together: they are queued, so neither loses the other's keys
  const both = await Promise.all([client.save({ state: (d) => stateWithStars(d, 7) }), client.save({ state: (d) => stateWithRadar(d, radar) }), client.save({ state: (d) => stateWithStars(d, 9) })]);
  assert.deepEqual(both, [true, true, true]);
  const st = await board.call('trip-status', { trip_id: TRIP });
  assert.equal(st.body.radar.room, 'FOCA-LUNA-42');
  assert.deepEqual(st.body.radar.pets, [
    { n: 'Mochi', sp: 'cat', st: 2, s: [80, 80, 100, 100, 100], a: 'walk' },
    { n: 'Kiwi', sp: 'seal', st: 0, s: [90, 80, 70, 60, 50], a: 'race' },
  ]);
  assert.equal(client.state.stars, 9);
  assert.equal(client.state.radar.room, 'FOCA-LUNA-42', 'the later stars save kept the radar');
  await client.save({ state: (d) => stateWithRadar(d, radarOf('', [], w.now * 1000)) });          // the pet left the room
  assert.deepEqual((await board.call('trip-status', { trip_id: TRIP })).body.radar.pets, []);
  assert.equal((await board.call('trip-status', { trip_id: TRIP })).body.radar.room, '');
  assert.equal(client.state.stars, 9);
});
