import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, AREA_NAMES, TILES, SIGNS, SPAWNS, ENTRY, HOUSES, DOORS, GAME_PLACES, GAME_IDS, PLACES, PITCH, GOAL, TRACK, isObstacle, MAP_W, MAP_H, inZone, spotAt, isWalkable, inMap, tileAt, doorAt, getArea, TILE } from '../src/map.js';
import { ICON_NAMES } from '../src/art/icons.js';
import { findPath, stepDir } from '../src/path.js';

test('every area is a rectangle of known tiles', () => {
  for (const name of AREA_NAMES) {
    const a = AREAS[name];
    assert.equal(a.grid.length, a.h);
    for (const row of a.grid) {
      assert.equal(row.length, a.w, `${name} row width`);
      for (const ch of row) assert.ok(TILES[ch], `unknown tile ${ch} in ${name}`);
    }
  }
  assert.ok(AREAS.town.w * TILE > 224 && AREAS.town.h * TILE > 288, 'the town is bigger than one screen');
});

test('town collisions: border trees, houses, fountain, pond, hedge, fences, lamps and signs are solid; roads and the plaza are not', () => {
  assert.equal(isWalkable(0, 0), false);
  assert.equal(isWalkable(23, 2), true);               // main road
  assert.equal(isWalkable(16, 20), true);              // plaza
  for (const [x, y] of [[23, 21], [6, 7], [6, 9], [7, 33], [11, 18], [34, 15], [17, 16], [21, 17], [36, 17]]) assert.equal(isWalkable(x, y), false, `${x},${y}`);
  for (const s of SIGNS.filter((e) => e.area === 'town')) assert.equal(tileAt(s.x, s.y), 'S');
  assert.equal(isWalkable(10, 21), true);              // grass
});

test('the bushes are walkable hiding spots (for hide and seek) and there are enough of them', () => {
  let n = 0;
  for (let y = 0; y < AREAS.town.h; y++) for (let x = 0; x < AREAS.town.w; x++) if (TILES[tileAt(x, y)].hide) { n++; assert.ok(isWalkable(x, y)); }
  assert.ok(n >= 12, `bushes: ${n}`);
});

test('houses: roof and wall are solid, the enterable door is the only open tile, and the doormat is in front of every door', () => {
  for (const h of HOUSES) {
    for (let j = 0; j < 4; j++) for (let i = 0; i < h.w; i++) {
      const open = h.enter && i === h.door && j === 3;
      assert.equal(isWalkable(h.x + i, h.y + j), !!open, `${h.x + i},${h.y + j}`);
    }
    assert.equal(tileAt(h.x + h.door, h.y + 4), 'm');
  }
});

test('outside an area nothing is walkable and nothing throws', () => {
  for (const [x, y] of [[-1, 0], [0, -1], [MAP_W, 3], [3, MAP_H], [1.5, 2], [NaN, 1], ['1', 1], [undefined, 1]]) {
    assert.equal(inMap(x, y), false);
    assert.equal(isWalkable(x, y), false);
  }
  assert.equal(isWalkable(1, 1, 'nowhere'), false);
  assert.equal(isWalkable(14, 3, 'shop'), false);
  assert.equal(getArea('nowhere').name, 'town');
});

function reachable(area, from) {
  const a = AREAS[area], seen = new Set([from.join(',')]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const n = [x + dx, y + dy];
      if (isWalkable(n[0], n[1], area) && !seen.has(n.join(','))) { seen.add(n.join(',')); queue.push(n); }
    }
  }
  return { a, seen };
}

test('spawns are walkable and every walkable tile of the town is reachable from the first one', () => {
  for (const [x, y] of SPAWNS) assert.ok(isWalkable(x, y), `${x},${y}`);
  const { a, seen } = reachable('town', SPAWNS[0]);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (isWalkable(x, y)) assert.ok(seen.has(`${x},${y}`), `unreachable ${x},${y}`);
});

test('the shop: everything walkable is reachable from the entry and the counter, tables and shelves block', () => {
  for (const [x, y] of ENTRY.shop) assert.ok(isWalkable(x, y, 'shop'));
  const { a, seen } = reachable('shop', ENTRY.shop[0]);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (isWalkable(x, y, 'shop')) assert.ok(seen.has(`${x},${y}`), `unreachable ${x},${y}`);
  for (const [x, y] of [[5, 4], [8, 4], [6, 3], [2, 6], [11, 7], [1, 2], [10, 9], [0, 5], [6, 1]]) assert.equal(isWalkable(x, y, 'shop'), false, `${x},${y}`);
  assert.equal(isWalkable(7, 4, 'shop'), false);
  assert.equal(isWalkable(7, 5, 'shop'), true);
});

test('doors lead to walkable tiles of the other area, and both ends agree', () => {
  for (const [area, list] of Object.entries(DOORS)) for (const d of list) {
    assert.ok(isWalkable(d.x, d.y, area), `${area} door ${d.x},${d.y}`);
    assert.equal(doorAt(d.x, d.y, area), d);
    assert.ok(isWalkable(d.to.x, d.to.y, d.to.area), `lands on ${d.to.area} ${d.to.x},${d.to.y}`);
    assert.equal(doorAt(d.to.x, d.to.y, d.to.area), null, 'landing on a door would bounce back');
  }
  const shop = HOUSES.find((h) => h.enter === 'shop');
  assert.deepEqual([DOORS.town[0].x, DOORS.town[0].y], [shop.x + shop.door, shop.y + 3]);
  assert.equal(doorAt(1, 1), null);
});

test('findPath: shortest, 4-connected, every step walkable, ends on the target', () => {
  const p = findPath(19, 24, 24, 2);
  assert.ok(p.length >= 5 + 22);
  let [cx, cy] = [19, 24];
  for (const [x, y] of p) {
    assert.equal(Math.abs(x - cx) + Math.abs(y - cy), 1);
    assert.ok(isWalkable(x, y));
    [cx, cy] = [x, y];
  }
  assert.deepEqual([cx, cy], [24, 2]);
});

test('findPath works inside the shop and can walk out of its door', () => {
  const p = findPath(6, 10, 7, 5, 'shop');
  assert.equal(p.length, 6);
  assert.deepEqual(findPath(6, 10, 6, 11, 'shop'), [[6, 11]]);
  assert.deepEqual(findPath(6, 10, 5, 4, 'shop'), []);              // the counter
});

test('findPath: manhattan length on open ground, around the fountain otherwise', () => {
  assert.equal(findPath(18, 24, 24, 24).length, 6);
  assert.equal(findPath(21, 21, 26, 21).length, 5 + 4);   // 4 extra: up and down around the 3-row fountain
});

test('findPath: empty for the same tile, solid or out-of-map targets', () => {
  assert.deepEqual(findPath(19, 24, 19, 24), []);
  assert.deepEqual(findPath(19, 24, 23, 21), []);         // the fountain
  assert.deepEqual(findPath(19, 24, -1, 3), []);
  assert.deepEqual(findPath(0, 0, 19, 24), []);           // starting inside a tree
});

test('stepDir', () => {
  assert.equal(stepDir(1, 1, 2, 1), 'right');
  assert.equal(stepDir(1, 1, 0, 1), 'left');
  assert.equal(stepDir(1, 1, 1, 0), 'up');
  assert.equal(stepDir(1, 1, 1, 2), 'down');
});

test('game places: every pad is walkable, inside its own zone, next to nothing solid it needs, and every sign is a solid signpost', () => {
  assert.deepEqual(GAME_IDS.sort(), ['chicken', 'hide', 'race', 'soccer']);
  for (const g of GAME_IDS) {
    const p = GAME_PLACES[g];
    for (const [x, y] of p.spot) { assert.equal(tileAt(x, y), 'p', `${g} pad`); assert.ok(inZone(g, x, y), `${g} pad in its zone`); assert.equal(spotAt(x, y), g); }
    assert.equal(tileAt(p.sign[0], p.sign[1]), 'S', `${g} sign`);
    assert.ok(SIGNS.some((s) => s.x === p.sign[0] && s.y === p.sign[1]), `${g} sign has a board`);
    const z = p.zone;
    assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.w <= AREAS.town.w && z.y + z.h <= AREAS.town.h, `${g} zone is on the map`);
  }
  assert.equal(spotAt(0, 0), null);
  assert.equal(inZone('nope', 21, 34), false);
  assert.equal(inZone('hide', 23, 20), false, 'the plaza is outside the Parque');
  assert.equal(inZone('hide', 23, 33), true);
});

test('the gallinero is a closed pen with one open gate and a coop; the cancha has two goals; the pista has hurdles and puddles', () => {
  const at = (x, y) => tileAt(x, y);
  assert.equal(at(29, 41), 'a');
  assert.ok(isWalkable(29, 41) && isWalkable(29, 40), 'the gate leads into the pen');
  for (let x = 28; x <= 34; x++) { if (x !== 29) assert.equal(at(x, 41), 'F'); assert.equal(at(x, 38), 'F'); }
  assert.equal(isWalkable(32, 39), false, 'the coop is solid');
  const count = (ch) => AREAS.town.grid.join('').split(ch).length - 1;
  assert.equal(count('g'), 2 * (GOAL.x1 - GOAL.x0) * GOAL.depth, 'two goals, each a net of mouth x depth tiles');
  assert.ok(count('V') >= 6 && count('w') >= 3 && count('j') >= 10);
});

test('the cancha is a big pitch (at least ten times the old 7 x 5 one) with a goal at each end and an entrance on each side', () => {
  assert.ok(PITCH.w * PITCH.h >= 350, `pitch ${PITCH.w} x ${PITCH.h}`);
  assert.ok(PITCH.h > PITCH.w, 'long and narrow: it fits a phone held upright');
  for (let y = PITCH.y; y < PITCH.y + PITCH.h; y++) for (let x = PITCH.x; x < PITCH.x + PITCH.w; x++) { assert.equal(tileAt(x, y), 'y', `pitch ${x},${y}`); assert.ok(isWalkable(x, y)); }
  const z = GAME_PLACES.soccer.zone;
  assert.ok(inZone('soccer', PITCH.x, PITCH.y) && inZone('soccer', PITCH.x + PITCH.w - 1, PITCH.y + PITCH.h - 1), 'the pitch is inside the zone');
  assert.ok(z.x + z.w <= MAP_W && z.y + z.h <= MAP_H);
  const mid = PITCH.x + PITCH.w / 2;
  assert.ok(GOAL.x0 < mid && GOAL.x1 > mid && GOAL.x1 - GOAL.x0 >= 4 && GOAL.x1 - GOAL.x0 <= 8, 'the mouth is centred and not too wide');
  for (let x = GOAL.x0; x < GOAL.x1; x++) for (let d = 1; d <= GOAL.depth; d++) {
    assert.equal(tileAt(x, PITCH.y - d), 'g', `north net ${x},${PITCH.y - d}`);
    assert.equal(tileAt(x, PITCH.y + PITCH.h - 1 + d), 'g', `south net ${x},${PITCH.y + PITCH.h - 1 + d}`);
    assert.equal(isWalkable(x, PITCH.y - d), false);
  }
  for (const x of [PITCH.x - 1, PITCH.x + PITCH.w]) {                                  // the fence along the sides, with a two tile entrance at mid height
    const ys = []; for (let y = PITCH.y; y < PITCH.y + PITCH.h; y++) if (isWalkable(x, y)) ys.push(y);
    assert.equal(ys.length, 2, `entrance at x=${x}`);
  }
  const [px, py] = GAME_PLACES.soccer.spot[0];
  assert.ok(px < PITCH.x - 1, 'the pad is outside the fence, by the west entrance');
  assert.deepEqual(findPath(px, py, PITCH.x + 3, PITCH.y + 3).length > 0, true, 'a pet walks from the pad onto the pitch');
  assert.deepEqual(findPath(px, py, PITCH.x + PITCH.w - 2, PITCH.y + PITCH.h - 2).length > 0, true);
  assert.deepEqual(findPath(23, 30, px, py).length > 0, true, 'and from the plaza to the pad');
});

test('every place has a floating icon, and the icons sit above their pads', () => {
  const ids = PLACES.map((p) => p.id).sort();
  assert.deepEqual(ids, ['chicken', 'hide', 'park', 'race', 'shop', 'soccer']);
  for (const p of PLACES) assert.ok(ICON_NAMES.includes(p.icon), `icon ${p.icon} is drawn`);
  for (const g of GAME_IDS) { const p = PLACES.find((e) => e.id === g); assert.ok(p.y < GAME_PLACES[g].spot[0][1]); }
});

test('the pista: three lanes running north from a start line to a checkered finish, fenced, with obstacles and always a free lane, and a pad below the start', () => {
  const lanes = []; for (let x = TRACK.x0; x <= TRACK.x1; x++) lanes.push(x);
  assert.equal(lanes.length, 3);
  assert.ok(TRACK.yBottom - TRACK.yTop >= 16, 'a long track: at least 16 rows');
  for (const x of lanes) {
    assert.equal(tileAt(x, TRACK.yTop), 'f', `finish ${x}`);
    for (let y = TRACK.yTop + 1; y <= TRACK.yBottom; y++) assert.ok(isWalkable(x, y), `lane ${x},${y}`);
    assert.equal(isWalkable(x, TRACK.yTop - 1), false, 'the fence closes the far end');
  }
  for (let y = TRACK.yTop; y <= TRACK.yBottom; y++) for (const x of [TRACK.x0 - 1, TRACK.x1 + 1]) assert.equal(isWalkable(x, y), false, `fence ${x},${y}`);
  let n = 0;
  for (let y = TRACK.yTop + 1; y <= TRACK.yBottom; y++) {
    const blocked = lanes.filter((x) => isObstacle(x, y)).length;
    n += blocked;
    assert.ok(blocked <= 2, `row ${y} leaves a free lane`);
  }
  assert.ok(n >= 10, `obstacles: ${n}`);
  const kinds = new Set(); for (let y = TRACK.yTop + 1; y <= TRACK.yBottom; y++) for (const x of lanes) if (isObstacle(x, y)) kinds.add(tileAt(x, y));
  assert.deepEqual([...kinds].sort(), ['V', 'W', 'w'], 'hurdles, hay bales and puddles');
  assert.equal(isObstacle(0, 0), false); assert.equal(isObstacle(-1, 5), false);
  const [px, py] = GAME_PLACES.race.spot[0];
  assert.ok(py > TRACK.yBottom && inZone('race', px, py), 'the pad is below the start line, in the zone');
  assert.ok(findPath(px, py, TRACK.x0, TRACK.yTop + 2).length > 0 && findPath(23, 30, px, py).length > 0);
  for (let y = TRACK.yTop; y <= TRACK.yBottom; y++) for (const x of lanes) assert.ok(inZone('race', x, y));
  assert.equal(PLACES.find((p) => p.id === 'race').y < py, true);
});
