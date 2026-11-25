import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, BEACH, TILES, isWalkable, isLand, waterAt, isBreak, shallowFrom, tileAt, doorAt } from '../src/map.js';
import { findPath } from '../src/path.js';
import { groundOf } from '../src/pet-sounds.js';
import { createBeachLife, beachLifeFrame, gullPose, crabPose, BEACH_LIFE } from '../src/life.js';
import { SCATTER } from '../src/art/beach.js';

const B = AREAS.beach;
const all = (ch) => B.grid.flatMap((row, y) => [...row].map((c, x) => [x, y, c])).filter(([, , c]) => c === ch);

test('the beach is about twice the first one, deeper to the west: more sea between the shore and the break, open sea beyond it, the door still on the east edge', () => {
  assert.ok((B.w * B.h) / (48 * 36) >= 1.5, `${(B.w * B.h) / (48 * 36)} times the first beach`);
  assert.ok(shallowFrom(10) - BEACH.breakX[1] >= 22, 'a long swim from the shore to the break (it was 14 columns)');
  assert.ok(BEACH.breakX[0] >= 8, 'open sea beyond the break');
  assert.equal(doorAt(B.w - 1, BEACH.door[0], 'beach').to.area, 'town');
  for (let x = 1; x < BEACH.breakX[0]; x++) assert.equal(waterAt(x, 20, 'beach'), 'deep');
  const walk = findPath(B.w - 2, BEACH.door[0], BEACH.breakX[0], 21, 'beach');
  assert.ok(walk.length > 50, `${walk.length} steps from the door to the break`);
  for (const x of BEACH.breakX) assert.ok(isBreak(x, 5, 'beach'));
});

test('the new things stand where they should: a net with posts and mesh, tide pools you walk around, two huts, a bonfire, the Kiosco and its counter, a pier of planks', () => {
  assert.equal(all('2').length, 2, 'two net posts'); assert.ok(all('3').length >= 4, 'mesh between');
  for (const [x, y] of [...all('2'), ...all('3'), ...all('4'), ...all('5'), ...all('6'), ...all('7')]) assert.equal(isWalkable(x, y, 'beach'), false, `solid at ${x},${y}`);
  assert.ok(all('4').length >= 4, 'tide pools');
  assert.equal(all('5').length, BEACH.huts.reduce((n, h) => n + h.w * h.h, 0));
  assert.equal(all('6').length, 1);
  assert.equal(all('7').length, BEACH.kiosk.w * BEACH.kiosk.h);
  const k = BEACH.kiosk;
  for (let x = k.x; x < k.x + k.w; x++) assert.ok(isLand(x, k.y + k.h, 'beach'), `counter tile ${x}`);
  const plank = all('1');
  assert.ok(plank.length >= 20 && TILES['1'].solid === false && TILES['1'].water === undefined);
  assert.ok(plank.every(([x, y]) => isWalkable(x, y, 'beach') && !waterAt(x, y, 'beach') && isLand(x, y, 'beach')), 'the pier is walkable and is not water');
  assert.equal(groundOf('beach', plank[3][0], plank[3][1], { rain: 0, snow: 0 }), 'wood', 'wood footsteps');
  const end = plank.reduce((m, p) => (p[0] < m[0] ? p : m), plank[0]);
  assert.equal(waterAt(end[0] - 1, end[1], 'beach'), 'deep', 'it ends in deep water');
  assert.ok(findPath(B.w - 2, BEACH.door[0], end[0], end[1], 'beach').length > 0, 'and a pet can walk out along it');
  assert.ok(findPath(B.w - 2, BEACH.door[0], k.x + 1, k.y + k.h, 'beach').length > 0, 'the Kiosco is reachable');
  assert.ok(SCATTER.length > 30, 'more scatter');
});

test('everything solid of the beach can be walked round: every open land tile reaches the door', () => {
  const seen = new Set(), q = [[B.w - 2, BEACH.door[0]]];
  while (q.length) { const [x, y] = q.pop(); const k = `${x},${y}`; if (seen.has(k) || !isWalkable(x, y, 'beach')) continue; seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  let lost = 0;
  for (let y = 1; y < B.h - 1; y++) for (let x = 1; x < B.w - 1; x++) if (isLand(x, y, 'beach') && !seen.has(`${x},${y}`)) lost++;
  assert.equal(lost, 0, 'no sand cut off');
});

test('gulls and crabs: land only, deterministic from the room and the clock, gulls glide in and walk, crabs scuttle sideways, none of it is stored or sent', () => {
  const l = createBeachLife('room'), l2 = createBeachLife('room'), other = createBeachLife('elsewhere');
  assert.equal(l.gulls.length, BEACH_LIFE.gulls); assert.equal(l.crabs.length, BEACH_LIFE.crabs);
  let landed = 0, walked = 0, flew = 0, gone = 0, moved = 0;
  for (let t = 0; t < 400000; t += 400) {
    for (const g of l.gulls) {
      const p = gullPose(g, t), q = gullPose(l2.gulls[g.id], t);
      assert.deepEqual(p, q, 'the same room, the same gull');
      if (!p) { gone++; continue; }
      if (p.air > 0) { flew++; continue; }
      landed++;
      const tx = Math.floor(p.x / 16), ty = Math.floor((p.y - 1) / 16);
      assert.equal(tileAt(tx, ty, 'beach'), 's', `a gull on the sand at ${tx},${ty}`);
      assert.ok(isLand(tx, ty, 'beach'));
      if (p.frame === 2) walked++;
    }
    for (const c of l.crabs) {
      const p = crabPose(c, t);
      const tx = Math.floor(p.x / 16), ty = Math.floor((p.y - 1) / 16);
      assert.equal(tileAt(tx, ty, 'beach'), 's', `a crab on the sand at ${tx},${ty}`);
      if (p.frame > 0) moved++;
      const before = crabPose(c, t - 400);
      assert.ok(Math.abs(p.y - before.y) < 1e-6, 'a crab walks sideways: its row never changes');
      assert.ok(Math.abs(p.x - before.x) < 16, 'and it never jumps: where a slot ends is where the next begins');
    }
  }
  assert.ok(landed > 100 && walked > 5 && flew > 20 && gone > 20 && moved > 20, `${landed} ${walked} ${flew} ${gone} ${moved}`);
  assert.notDeepEqual(gullPose(l.gulls[0], 50000), gullPose(other.gulls[0], 50000));
  const day = beachLifeFrame(l, 100000, { night: 0 }), night = beachLifeFrame(l, 100000, { night: 1 });
  assert.ok(day.crabs.length === BEACH_LIFE.crabs && Array.isArray(day.birds) && day.butterflies.length === 0);
  assert.equal(night.birds.length, 0, 'the gulls sleep at night');
});
