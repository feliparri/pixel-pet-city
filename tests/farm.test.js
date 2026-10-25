import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, TILES, DOORS, SIGNS, SPAWNS, FARM, GAME_PLACES, GAME_IDS, isWalkable, tileAt, doorAt, spotAt, getArea, isArea } from '../src/map.js';
import { findPath } from '../src/path.js';
import { createFarmLife, farmLifeFrame, animalPose, FARM_LIFE } from '../src/life.js';
import { inArea } from '../src/presence.js';
import { activityOf, radarPets } from '../src/radar.js';
import { ACTIVITIES, validateMessage } from '../src/protocol.js';

const farm = AREAS.farm, TILE = 16;
const id = 'abcdefghijklmnop';

function reachable(area, from) {
  const seen = new Set([from.join(',')]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const n = [x + dx, y + dy];
      if (isWalkable(n[0], n[1], area) && !seen.has(n.join(','))) { seen.add(n.join(',')); queue.push(n); }
    }
  }
  return seen;
}

test('the farm is an outdoor area of known tile classes, and the crops are walkable soil', () => {
  assert.ok(isArea('farm') && farm.outdoor === true && getArea('farm') === farm);
  assert.ok(farm.w * TILE > 224 && farm.h * TILE > 288);
  const kinds = new Set(farm.grid.join(''));
  for (const ch of kinds) assert.ok(TILES[ch], `unknown tile ${ch}`);
  for (const ch of 'dCUPY') { assert.ok(kinds.has(ch), `${ch} is on the map`); assert.equal(TILES[ch].solid, false); }
  for (const ch of 'RvZA') { assert.ok(kinds.has(ch), `${ch} is on the map`); assert.equal(TILES[ch].solid, true); }
});

test('the farm places are where FARM says: the barn is solid, the paddock is open grass inside a fence with one gate, the well and the scarecrow are solid', () => {
  const b = FARM.barn;
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) assert.equal(tileAt(b.x + i, b.y + j, 'farm'), 'R');
  const p = FARM.paddock;
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) assert.ok(['.', ','].includes(tileAt(p.x + i, p.y + j, 'farm')), `paddock ${p.x + i},${p.y + j}`);
  let gates = 0;
  for (let i = -1; i <= p.w; i++) for (const y of [p.y - 1, p.y + p.h]) { const ch = tileAt(p.x + i, y, 'farm'); assert.ok(ch === 'F' || ch === 'a'); gates += ch === 'a'; }
  for (let j = 0; j < p.h; j++) for (const x of [p.x - 1, p.x + p.w]) assert.equal(tileAt(x, p.y + j, 'farm'), 'F');
  assert.equal(gates, 1);
  assert.equal(tileAt(...FARM.well, 'farm'), 'v');
  assert.equal(tileAt(...FARM.scarecrow, 'farm'), 'Z');
  for (const s of SIGNS.filter((e) => e.area === 'farm')) assert.equal(tileAt(s.x, s.y, 'farm'), 'S');
  assert.ok(SIGNS.some((s) => s.area === 'town' && s.text === 'La Granja') && SIGNS.some((s) => s.area === 'farm' && s.text === 'Pueblo'));
});

test('the road joins both ways: a walkable way town -> farm -> town, and everything walkable on the farm is reachable from where you arrive', () => {
  const out = DOORS.town.find((d) => d.to.area === 'farm'), back = DOORS.farm.find((d) => d.to.area === 'town');
  const there = findPath(SPAWNS[0][0], SPAWNS[0][1], out.x, out.y, 'town');
  assert.ok(there.length > 20 && there.at(-1)[0] === out.x && there.at(-1)[1] === out.y);
  assert.equal(doorAt(out.x, out.y, 'town').to.area, 'farm');
  const inside = findPath(out.to.x, out.to.y, back.x, back.y, 'farm');
  assert.ok(inside.length >= 1 && inside.at(-1)[0] === back.x);
  assert.equal(doorAt(back.x, back.y, 'farm').to.area, 'town');
  assert.ok(findPath(back.to.x, back.to.y, SPAWNS[0][0], SPAWNS[0][1], 'town').length > 20, 'the way home is walkable');
  for (const d of [...DOORS.town, ...DOORS.farm].filter((e) => e.to.area !== 'shop')) {
    assert.ok(isWalkable(d.to.x, d.to.y, d.to.area));
    assert.equal(doorAt(d.to.x, d.to.y, d.to.area), null, 'landing on a door would bounce back');
  }
  const seen = reachable('farm', [out.to.x, out.to.y]);
  for (let y = 0; y < farm.h; y++) for (let x = 0; x < farm.w; x++) if (isWalkable(x, y, 'farm')) assert.ok(seen.has(`${x},${y}`), `unreachable ${x},${y}`);
  // the pads, the shop door and the other doors are untouched by the new road
  const townSeen = reachable('town', SPAWNS[0]);
  for (let y = 0; y < AREAS.town.h; y++) for (let x = 0; x < AREAS.town.w; x++) if (isWalkable(x, y, 'town')) assert.ok(townSeen.has(`${x},${y}`), `unreachable in town ${x},${y}`);
  assert.equal(doorAt(35, 9, 'town').to.area, 'shop');
});

test('crossing the road changes the area on both sides (and a position of the other area is not valid where it is solid)', () => {
  const out = DOORS.town.find((d) => d.to.area === 'farm');
  let area = 'town';
  const step = (x, y) => { const door = doorAt(x, y, area); if (door) { area = door.to.area; return [door.to.x, door.to.y]; } return [x, y]; };
  assert.deepEqual(step(out.x, out.y), [1, out.y - 12]);
  assert.equal(area, 'farm');
  assert.deepEqual(step(0, 17), [46, 29]);
  assert.equal(area, 'town');
  assert.equal(validateMessage({ t: 'pos', id, x: 1, y: 17, d: 'right', area: 'farm' }).area, 'farm');
  assert.equal(validateMessage({ t: 'pos', id, x: 28, y: 4, d: 'up', area: 'farm' }), null);       // the barn
  assert.equal(validateMessage({ t: 'pos', id, x: 99, y: 4, d: 'up', area: 'farm' }), null);
  assert.equal(validateMessage({ t: 'pos', id, x: 24, y: 2, d: 'up', area: 'farm' }), null);       // a tree of the farm, a walkable tile of the town
  assert.equal(validateMessage({ t: 'pos', id, x: 28, y: 4, d: 'up', area: 'town' }).area, 'town');
});

test('peers are drawn only in the area they are in: the farm, the town and the shop do not see each other', () => {
  const peers = [{ id: 'a', area: 'town', placed: true }, { id: 'b', area: 'farm', placed: true }, { id: 'c', area: 'shop', placed: true }, { id: 'd', area: 'farm', placed: false }, { id: 'e', area: 'farm', placed: true }];
  assert.deepEqual(inArea(peers, 'farm').map((p) => p.id), ['b', 'e']);
  assert.deepEqual(inArea(peers, 'town').map((p) => p.id), ['a']);
  assert.deepEqual(inArea(peers, 'shop').map((p) => p.id), ['c']);
  assert.equal(inArea(new Map(peers.map((p) => [p.id, p])).values(), 'farm').length, 2);      // a Map's values() work too
});

test('farm animals: the same seed gives the same scene, and over a long sweep every animal stands on a walkable tile of the paddock', () => {
  const sig = (l) => JSON.stringify(l.animals.map((a) => [a.kind, a.ph]));
  assert.equal(sig(createFarmLife('FOCA-LUNA-42')), sig(createFarmLife('FOCA-LUNA-42')));
  assert.notEqual(sig(createFarmLife('FOCA-LUNA-42')), sig(createFarmLife('GATO-NUBE-07')));
  const p = FARM.paddock;
  for (const code of ['FOCA-LUNA-42', 'GATO-NUBE-07', 'RANA-SOL-99']) {
    const l = createFarmLife(code);
    assert.equal(l.animals.filter((a) => a.kind === 'cow').length, FARM_LIFE.cows);
    assert.equal(l.animals.filter((a) => a.kind === 'sheep').length, FARM_LIFE.sheep);
    const frames = new Set();
    for (let t = 0; t < 6 * 3600 * 1000; t += 997) {
      for (const a of l.animals) {
        const pose = animalPose(a, t), tx = Math.floor(pose.x / TILE), ty = Math.floor(pose.y / TILE);
        assert.ok(isWalkable(tx, ty, 'farm'), `${code} ${a.kind} ${a.id} at ${t}: ${tx},${ty}`);
        assert.ok(tx >= p.x && ty >= p.y && tx < p.x + p.w && ty < p.y + p.h, `${code} ${a.kind} ${a.id} left the paddock at ${t}: ${tx},${ty}`);
        frames.add(pose.frame);
      }
    }
    assert.ok([0, 1, 2, 3].every((f) => frames.has(f)), `every frame is used: ${[...frames]}`);
  }
  const l = createFarmLife('FOCA-LUNA-42');
  assert.deepEqual(animalPose(l.animals[0], 123456), animalPose(l.animals[0], 123456));
  assert.notDeepEqual(animalPose(l.animals[0], 0), animalPose(l.animals[0], 15000));
});

test('farm life: birds on open grass of the farm, butterflies by day and fireflies by night, no duck, no fountain, rings on the pond', () => {
  const l = createFarmLife('FOCA-LUNA-42');
  assert.ok(l.birds.length >= 5);
  for (const b of l.birds) { assert.ok(['.', ','].includes(tileAt(b.hx, b.hy, 'farm'))); assert.ok(isWalkable(b.hx, b.hy, 'farm')); }
  for (const r of l.ripples) assert.equal(tileAt(r.tx, r.ty, 'farm'), '~');
  const day = farmLifeFrame(l, 5000, { night: 0 }), night = farmLifeFrame(l, 5000, { night: 1 });
  assert.ok(day.butterflies.length > 0 && day.fireflies.length === 0 && night.butterflies.length === 0 && night.fireflies.length > 0);
  assert.equal(day.animals.length, FARM_LIFE.cows + FARM_LIFE.sheep);
  assert.equal(day.duck, undefined);
});

test('the games stay in the town: no tile of the farm is a pad, every place is a town one, and the farm is never a pad even at a pad\'s coordinates', () => {
  for (const g of GAME_IDS) {
    assert.equal(GAME_PLACES[g].area, 'town');
    for (const [x, y] of GAME_PLACES[g].spot) { assert.equal(spotAt(x, y), g); assert.equal(spotAt(x, y, 'town'), g); assert.equal(spotAt(x, y, 'farm'), null); assert.equal(spotAt(x, y, 'shop'), null); }
  }
  for (let y = 0; y < farm.h; y++) for (let x = 0; x < farm.w; x++) assert.equal(spotAt(x, y, 'farm'), null);
  assert.ok(!farm.grid.join('').includes('p'));
});

test('the radar: on the farm a pet is walking or idle (the server does not list a farm activity yet), a pet playing is still its game', () => {
  assert.equal(activityOf({ area: 'farm', game: null, moving: true }), 'walk');
  assert.equal(activityOf({ area: 'farm', game: null, moving: false }), 'idle');
  assert.ok(!ACTIVITIES.includes('farm'));
  const stats = [50, 50, 50, 50, 50];
  const [mine] = radarPets({ name: 'Mochi', look: { species: 'frog', stage: 1 }, stats, act: activityOf({ area: 'farm', game: null, moving: true }) }, []);
  assert.equal(mine.a, 'walk');
});
