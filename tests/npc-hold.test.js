import test from 'node:test';
import assert from 'node:assert/strict';
import { villagerAtTap, talkSpot, faceToward, createHold, BACK_STEP_MS } from '../src/npc-hold.js';
import { Walker } from '../src/walker.js';
import { NPC_STEP_MS } from '../src/npc-world.js';

const v = (id, x, y, extra = {}) => ({ id, x, y, asleep: false, ...extra });

test('a tap hits the villager whose feet box holds the tapped tile: the tile of its head, a tile beside or just below too', () => {
  const list = [v('a', 10, 10)];
  for (const t of [[10, 10], [10, 9], [10, 8], [9, 10], [11, 10], [10, 11]]) assert.equal(villagerAtTap(t, list).id, 'a', String(t));
  for (const t of [[10, 7], [12, 10], [8, 10], [10, 12], [20, 20]]) assert.equal(villagerAtTap(t, list), null, String(t));
});

test('the nearest villager wins; asleep ones and the clerk are not talk targets', () => {
  assert.equal(villagerAtTap([5, 5], [v('far', 6, 5), v('near', 5, 5)]).id, 'near');
  assert.equal(villagerAtTap([5, 5], [v('zz', 5, 5, { asleep: true })]), null);
  assert.equal(villagerAtTap([5, 5], [v('clerk', 5, 5, { clerk: true })]), null);
  assert.equal(villagerAtTap([5, 5], [v('mid', 5.4, 5.5)]).id, 'mid');         // a villager half way through a step
});

test('talkSpot: the free neighbour with the shortest path; none when boxed in', () => {
  const path = (x0, y0, x1, y1) => { const out = []; let x = x0, y = y0; while (x !== x1) { x += Math.sign(x1 - x); out.push([x, y]); } while (y !== y1) { y += Math.sign(y1 - y); out.push([x, y]); } return out; };
  const all = () => true;
  assert.deepEqual(talkSpot(10, 10, [4, 10], { walkable: all, path }) && (({ x, y }) => [x, y])(talkSpot(10, 10, [4, 10], { walkable: all, path })), [9, 10]);
  const s = talkSpot(10, 10, [10, 11], { walkable: all, path });
  assert.deepEqual([s.x, s.y, s.path.length], [10, 11, 0]);                       // already beside it: no walk
  const blocked = talkSpot(10, 10, [4, 10], { walkable: (x, y) => x !== 9, path });
  assert.notDeepEqual([blocked.x, blocked.y], [9, 10]);
  assert.equal(talkSpot(10, 10, [4, 10], { walkable: () => false, path }), null);
  assert.equal(talkSpot(10, 10, [4, 10], { walkable: all, taken: () => true, path }), null);
  assert.equal(talkSpot(10, 10, [4, 10], { walkable: all, path: () => [] }), null);       // unreachable
});

test('faceToward picks the longer axis', () => {
  assert.equal(faceToward(0, 0, 3, 1), 'right');
  assert.equal(faceToward(0, 0, -3, 1), 'left');
  assert.equal(faceToward(0, 0, 1, -3), 'up');
  assert.equal(faceToward(0, 0, 1, 3), 'down');
});

// a villager entity as npcs.js hands it over: the walker holds the routine's pose
const ent = (x, y) => { const w = new Walker(x, y); w.stepOverride = NPC_STEP_MS; return { id: 'npc:a', area: 'town', asleep: false, walker: w }; };
const route = (x0, y0, x1, y1) => { const out = []; let x = x0, y = y0; while (x !== x1) { x += Math.sign(x1 - x); out.push([x, y]); } while (y !== y1) { y += Math.sign(y1 - y); out.push([x, y]); } return out; };
const routinePose = (e, fx, fy, tx, ty, k = 0) => { const w = e.walker; w.fx = fx; w.fy = fy; w.tx = tx; w.ty = ty; w.moving = (fx !== tx || fy !== ty) && k < 1; w.t = k * NPC_STEP_MS; w.d = 'down'; };

test('a wanted villager stands still facing the pet while its routine walks on; the routine is not touched', () => {
  const hold = createHold(), e = ent(5, 5), wait = new Set(['npc:a']);
  hold.step([e], wait, { x: 8, y: 5 }, 16, 'town', route);                      // idle: held where it is
  for (let i = 1; i <= 20; i++) { routinePose(e, 5 + i, 5, 6 + i); hold.step([e], wait, { x: 8, y: 5 }, 16, 'town', route); }
  assert.deepEqual([e.walker.tileX, e.walker.tileY, e.walker.moving, e.walker.d], [5, 5, false, 'right']);
  assert.ok(hold.has('npc:a'));
});

test('a step in progress is finished, then it stands; a villager asleep or in another area is released at once', () => {
  const hold = createHold(), e = ent(5, 5);
  routinePose(e, 5, 5, 6, 5, 0.5);
  hold.step([e], new Set(['npc:a']), { x: 9, y: 5 }, 16, 'town', route);
  assert.equal(e.walker.moving, true);
  hold.step([e], new Set(['npc:a']), { x: 9, y: 5 }, NPC_STEP_MS, 'town', route);
  assert.deepEqual([e.walker.tileX, e.walker.moving], [6, false]);
  const h2 = createHold(), f = ent(5, 5);
  h2.step([f], new Set(['npc:a']), { x: 9, y: 5 }, 16, 'town', route);
  f.asleep = true; h2.step([f], new Set(), { x: 9, y: 5 }, 16, 'town', route);
  assert.equal(h2.has('npc:a'), false);
  const g = ent(5, 5); h2.step([g], new Set(['npc:a']), { x: 9, y: 5 }, 16, 'town', route);
  g.area = 'farm'; h2.step([g], new Set(['npc:a']), { x: 9, y: 5 }, 16, 'town', route);
  assert.equal(h2.has('npc:a'), false);
});

test('once released it walks back to where the routine says it is, faster than the routine, then is handed back; no snap in between', () => {
  const hold = createHold(), e = ent(5, 5), wait = new Set(['npc:a']);
  hold.step([e], wait, { x: 8, y: 5 }, 16, 'town', route);
  routinePose(e, 9, 5, 10, 5);                                                      // the routine has moved on 5 tiles
  const seen = [];
  let i = 0;
  for (; i < 400 && hold.has('npc:a'); i++) {
    routinePose(e, 9, 5, 10, 5);
    hold.step([e], new Set(), { x: 8, y: 5 }, 16, 'town', route);
    if (hold.has('npc:a')) { seen.push(e.walker.pos().x); assert.equal(e.walker.stepOverride, BACK_STEP_MS); }
  }
  assert.ok(!hold.has('npc:a') && i < 400);
  for (let k = 1; k < seen.length; k++) assert.ok(seen[k] - seen[k - 1] < 0.5, 'a jump');          // never more than a fraction of a tile per frame
  assert.ok(seen.length * 16 < 6 * NPC_STEP_MS);                                      // quicker than walking the 5 tiles at the routine's pace
  assert.deepEqual([e.walker.tileX, e.walker.tileY], [10, 5]);
});

test('a returning villager is held again at once if the pet wants it again; no way back hands it to the routine', () => {
  const hold = createHold(), e = ent(5, 5);
  hold.step([e], new Set(['npc:a']), { x: 8, y: 5 }, 16, 'town', route);
  routinePose(e, 12, 5, 12, 5);
  hold.step([e], new Set(), { x: 8, y: 5 }, 16, 'town', route);
  assert.deepEqual(hold.held(), []);
  hold.step([e], new Set(['npc:a']), { x: 8, y: 5 }, 16, 'town', route);
  assert.deepEqual(hold.held(), ['npc:a']);
  const f = ent(5, 5); hold.step([f], new Set(), { x: 8, y: 5 }, 16, 'town', () => []);   // not held: nothing to do
  const h2 = createHold(), g = ent(5, 5);
  h2.step([g], new Set(['npc:a']), { x: 8, y: 5 }, 16, 'town', route);
  routinePose(g, 9, 9, 9, 9);
  h2.step([g], new Set(), { x: 8, y: 5 }, 16, 'town', () => []);
  assert.equal(h2.has('npc:a'), false);
});
