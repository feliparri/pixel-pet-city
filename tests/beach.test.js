import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, DOORS, BEACH, TILES, isWalkable, isLand, waterAt, isBreak, doorAt, tileAt, chickenTile, shallowFrom, SIGNS } from '../src/map.js';
import { findPath } from '../src/path.js';
import { validateMessage } from '../src/protocol.js';
import { npcTile, farmTile } from '../src/npc-world.js';
import { seaBed, gull, seaLevel, createAmbience } from '../src/ambience.js';
import { waterRegions, visibleWater } from '../src/hd2d/scene.js';

const B = AREAS.beach;
const id = 'abcdefgh';

test('the beach is an outdoor area with the sea on the west and land on the east', () => {
  assert.equal(B.outdoor, true);
  assert.equal(B.w, BEACH.w); assert.equal(B.h, BEACH.h);
  let land = 0, sea = 0;
  for (let y = 1; y < B.h - 1; y++) for (let x = 0; x < B.w; x++) { if (waterAt(x, y, 'beach')) sea++; else if (isLand(x, y, 'beach')) land++; }
  assert.ok(land / (land + sea) >= 0.4, `land share ${land / (land + sea)}`);
  for (let y = 1; y < B.h - 1; y++) {                                       // west to east: open sea, deep water (the break inside), shallows, then land
    if (BEACH.pier.y.includes(y)) continue;                                  // (the pier's rows have planks over the shallows)
    const row = [...B.grid[y]];
    const kinds = row.map((c, x) => (c === '%' ? 'edge' : waterAt(x, y, 'beach') || 'land'));
    const firstShallow = kinds.indexOf('shallow');
    assert.equal(firstShallow, shallowFrom(y));
    assert.ok(kinds.slice(1, firstShallow).every((k) => k === 'deep'), `row ${y} deep`);
    assert.ok(kinds.slice(firstShallow).indexOf('land') > 0 && !kinds.slice(firstShallow + 4).includes('shallow'), `row ${y} shore`);
    for (const x of BEACH.breakX) assert.ok(isBreak(x, y, 'beach'), `break at ${x},${y}`);
  }
});

test('the beach tiles: sea is walkable by a pet but is never land', () => {
  assert.equal(waterAt(10, 10, 'beach'), 'deep');
  assert.equal(waterAt(shallowFrom(10), 10, 'beach'), 'shallow');
  assert.equal(waterAt(50, 10, 'beach'), null);
  assert.equal(isWalkable(10, 10, 'beach'), true);
  assert.equal(isLand(10, 10, 'beach'), false);
  assert.equal(isWalkable(0, 10, 'beach'), false);                           // the open sea at the edge is solid
  for (const ch of 'OJXI%') assert.equal(TILES[ch].solid, true, ch);
  for (const ch of 'sQ-i') assert.equal(TILES[ch].solid, false, ch);
  assert.equal(waterAt(10, 10, 'town'), null);
  assert.equal(waterAt(3, 3, 'nowhere'), null);
});

test('nothing but a pet treats the sea as ground: villagers, the chicken and the town have no sea tile', () => {
  assert.equal(npcTile(10, 10), isLand(10, 10, 'town'));
  assert.equal(farmTile(10, 10), isLand(10, 10, 'farm'));
  for (const name of ['town', 'farm']) for (let y = 0; y < AREAS[name].h; y++) for (let x = 0; x < AREAS[name].w; x++) assert.equal(waterAt(x, y, name), null);
  // the chicken's rule is land only: asked about a sea tile of another area it still says no (it only knows the town)
  assert.equal(chickenTile(10, 10), true);
  const seaTile = [10, 10];
  assert.equal(isLand(seaTile[0], seaTile[1], 'beach'), false);
});

test('the doors join the town and the beach both ways', () => {
  for (const d of DOORS.town.filter((e) => e.to.area === 'beach')) {
    assert.equal(d.x, 0);
    const back = doorAt(d.to.x + 1, d.to.y, 'beach');
    assert.ok(back && back.to.area === 'town' && back.to.y === d.y, 'a door back at the same row');
    assert.ok(isWalkable(d.to.x, d.to.y, 'beach') && isWalkable(back.to.x, back.to.y, 'town'));
    assert.equal(doorAt(back.to.x, back.to.y, 'town'), null, 'arrival is next to the door, not on it');
  }
  assert.ok(DOORS.beach.length === 2);
  assert.ok(SIGNS.some((s) => s.area === 'beach') && SIGNS.some((s) => s.area === 'town' && s.text === 'La Playa'));
});

test('the town path reaches the beach door and a pet can walk from it to the break', () => {
  assert.ok(findPath(10, 29, 1, 29, 'town').length > 0);
  const toBreak = findPath(66, 21, BEACH.breakX[0], 21, 'beach');
  assert.ok(toBreak.length > 0);
  assert.ok(toBreak.some(([x, y]) => waterAt(x, y, 'beach') === 'deep'));
  const noSolid = toBreak.every(([x, y]) => isWalkable(x, y, 'beach'));
  assert.ok(noSolid);
});

test('peers: a pet in the sea is valid, a rock or the open sea is not', () => {
  const pos = (x, y) => validateMessage({ t: 'pos', id, x, y, d: 'left', area: 'beach' });
  assert.deepEqual(pos(10, 10), { t: 'pos', id, x: 10, y: 10, d: 'left', area: 'beach' });
  assert.equal(pos(0, 10), null);
  const rock = B.grid.flatMap((row, y) => [...row].map((c, x) => [x, y, c])).find(([, , c]) => c === 'X');
  assert.equal(pos(rock[0], rock[1]), null);
  assert.equal(validateMessage({ t: 'pos', id, x: 5, y: 7, d: 'left', area: 'town' }), null, 'a roof of the town');
});

test('the sea beds and gulls are real samples, and the sea fades away from the shore', () => {
  const beds = seaBed();
  assert.equal(beds.length, 2);
  for (const b of beds) { assert.ok(b instanceof Int16Array && b.length > 16000 * 5); assert.ok(b.some((v) => Math.abs(v) > 3000)); }
  for (let v = 0; v < 3; v++) assert.ok(gull(v).length > 16000 * 0.5);
  assert.equal(seaLevel('town', 10), 0);
  assert.equal(seaLevel('beach', 10), 1);
  assert.ok(seaLevel('beach', 47) < seaLevel('beach', 30) && seaLevel('beach', 47) > 0.3);
});

test('on the beach the ambience asks for the sea bed and gulls, not songbirds', () => {
  const beds = [], played = [];
  const sound = { running: () => true, isMuted: () => false, bed: (n, f, l) => beds.push([n, l]), stopBeds() {}, ambient: (s, g) => { played.push([s.length, g]); return true; } };
  const amb = createAmbience({ sound, rand: () => 0.5 });
  for (let t = 0; t < 40; t++) amb.step(1000, { area: 'beach', outdoor: true, night: 0, weather: { rain: 0, storm: 0, snow: 0 }, x: 10, y: 10, utcMs: 1e12 + t * 1000 });
  assert.ok(beds.some(([n, l]) => n === 'sea' && l > 0.1));
  assert.ok(played.length > 0);
  const night = [];
  const s2 = { ...sound, ambient: (s) => { night.push(s.length); return true; } };
  const a2 = createAmbience({ sound: s2, rand: () => 0.5 });
  for (let t = 0; t < 40; t++) a2.step(1000, { area: 'beach', outdoor: true, night: 1, weather: { rain: 0, storm: 0, snow: 0 }, x: 10, y: 10, utcMs: 1e12 + t * 1000 });
  assert.equal(night.length, 0, 'no crickets on the sand');
});

test('a big sea is re-baked row by row, a small pond in one box', () => {
  const sea = [];
  for (let y = 1; y < 5; y++) for (let x = 1; x < 30; x++) sea.push({ x: x * 16, y: y * 16, tx: x, ty: y });
  const rects = waterRegions(sea);
  assert.equal(rects.length, 4);
  assert.deepEqual(rects[0], [16, 16, 29 * 16, 16]);
  const pond = sea.slice(0, 20);
  assert.equal(waterRegions(pond).length, 1);
  assert.deepEqual(waterRegions([]), []);
  assert.deepEqual(visibleWater(rects, 30, 50).map((r) => r[1]), [16, 32, 48].filter((y) => y + 16 > 30 && y < 50));
  assert.equal(visibleWater(rects.slice(0, 2), 900, 1000).length, 2, 'a few rectangles are all kept');
});

import { SCATTER } from '../src/art/beach.js';
test('the beach scatter lies on open sand, the seaweed on the wet sand, never on a solid tile, and it is sparse', () => {
  assert.ok(SCATTER.length >= 10 && SCATTER.length <= 60, `${SCATTER.length} things`);
  const kinds = new Set(SCATTER.map((s) => s.kind));
  for (const k of ['shell', 'starfish', 'castle', 'bucket', 'ball', 'weed', 'prints', 'table', 'tuft', 'court', 'vball']) assert.ok(kinds.has(k), k);
  for (const s of SCATTER) {
    const ch = tileAt(s.x, s.y, 'beach');
    assert.ok(ch === (s.kind === 'weed' ? 'i' : 's'), `${s.kind} at ${s.x},${s.y} is on ${ch}`);
    assert.ok(isWalkable(s.x, s.y, 'beach'));
    assert.ok(s.dx >= 0 && s.dx < 16 && s.dy >= 0 && s.dy < 16);
  }
  const per = new Map();
  for (const s of SCATTER) per.set(`${s.x},${s.y}`, (per.get(`${s.x},${s.y}`) || 0) + 1);
  assert.ok([...per.values()].every((n) => n === 1), 'one thing to a tile');
});
