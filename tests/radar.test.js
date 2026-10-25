import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRadar, RADAR_PETS_MAX, ACTIVITIES } from '../supabase/functions/trip/radar.js';
import { world, fixture } from './trip-helpers.js';

const NOW = 1_800_000_000;
const pet = (over = {}) => ({ n: 'Mochi', sp: 'cat', st: 2, s: [80, 70, 60, 50, 100], a: 'walk', ...over });
const radar = (over = {}) => ({ room: 'FOCA-LUNA-42', at: NOW - 3, pets: [pet(), pet({ n: 'Kiwi', sp: 'frog', a: 'race' })], ...over });

test('cleanRadar keeps a good radar as it is', () => {
  assert.deepEqual(cleanRadar(radar(), NOW), radar());
  assert.deepEqual(cleanRadar({ room: '', at: NOW, pets: [] }, NOW), { room: '', at: NOW, pets: [] });
  for (const a of ACTIVITIES) assert.equal(cleanRadar(radar({ pets: [pet({ a })] }), NOW).pets[0].a, a);
});

test('cleanRadar refuses what is not a radar', () => {
  for (const bad of [undefined, null, 5, 'x', [], {}, radar({ room: 'nope' }), radar({ room: 7 }), radar({ at: 'now' }), radar({ at: 1.5 }), radar({ at: 0 }), radar({ at: NOW + 3600 })]) {
    assert.equal(cleanRadar(bad, NOW), null, JSON.stringify(bad));
  }
});

test('cleanRadar drops bad pets, caps the list, cuts names, and empties a radar with no room', () => {
  const bad = [null, 3, [], pet({ sp: 'dog' }), pet({ st: 4 }), pet({ st: 1.5 }), pet({ s: [1, 2, 3, 4] }), pet({ s: [1, 2, 3, 4, 101] }), pet({ s: [1, 2, 3, 4, -1] }), pet({ a: 'fly' }), pet({ n: 5 }), { ...pet(), n: undefined }];
  const r = cleanRadar(radar({ pets: [...bad, pet({ n: 'ok' })] }), NOW);
  assert.deepEqual(r.pets.map((p) => p.n), ['ok']);
  const many = cleanRadar(radar({ pets: Array.from({ length: 30 }, (_, i) => pet({ n: `p${i}` })) }), NOW);
  assert.equal(many.pets.length, RADAR_PETS_MAX);
  const long = cleanRadar(radar({ pets: [pet({ n: `a\u0007${'b'.repeat(80)}` })] }), NOW);
  assert.equal(long.pets[0].n.length, 24);
  assert.ok(!/[\u0000-\u001f]/.test(long.pets[0].n));
  assert.deepEqual(cleanRadar(radar({ room: '' }), NOW).pets, []);
  assert.deepEqual(Object.keys(cleanRadar(radar({ extra: 1, pets: [{ ...pet(), x: 1 }] }), NOW)).sort(), ['at', 'pets', 'room']);
  assert.deepEqual(Object.keys(cleanRadar(radar({ pets: [{ ...pet(), x: 1 }] }), NOW).pets[0]).sort(), ['a', 'n', 's', 'sp', 'st']);
});

test('the board gets the saved radar from trip-status, the browser session does not', async () => {
  const w = world({ now: NOW });
  const board = w.board();
  await board.register();
  const s = await board.start(fixture('plain.bin'));
  const TRIP = 0xA1B2C3D4;
  const c = await w.web().call('trip-claim', { code: s.body.code });
  assert.deepEqual(c.body.pet.stats, [80, 80, 100, 100, 100]);
  const web = w.web(c.body.token);
  assert.equal((await board.call('trip-status', { trip_id: TRIP })).body.radar, null);               // nothing saved yet
  await web.call('trip-save', { trip: c.body.trip, base_version: 0, state: { v: 1, stars: 3, radar: radar() } });
  const st = await board.call('trip-status', { trip_id: TRIP });
  assert.deepEqual(st.body.radar, radar());
  assert.equal(st.body.version, 1);
  assert.ok(!('radar' in (await web.call('trip-status', { trip: c.body.trip })).body), 'the web answer is unchanged');
  await web.call('trip-save', { trip: c.body.trip, base_version: 1, state: { v: 1, radar: { room: 'FOCA-LUNA-42', at: NOW, pets: [pet({ a: 'nope' }), pet()] } } });
  assert.equal((await board.call('trip-status', { trip_id: TRIP })).body.radar.pets.length, 1);       // a bad entry is dropped, not shown
  await web.call('trip-save', { trip: c.body.trip, base_version: 2, state: { v: 1, radar: 'junk' } });
  assert.equal((await board.call('trip-status', { trip_id: TRIP })).body.radar, null);
  assert.equal(JSON.stringify(st.body).includes('stars'), false);                                     // nothing else of the state leaks
});
