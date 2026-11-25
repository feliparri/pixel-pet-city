import test from 'node:test';
import assert from 'node:assert/strict';
import { SEATS, MAX_NPC_SEATS, FULL_TEXT, FIRE_MS, ROAST_MS, seatFacing, seatAt, sitCode, fromSit, bonfireAt, fireLevel, roastAt, seatsAreOpen } from '../src/bonfire.js';
import { BEACH } from '../src/map.js';
import { validateMessage, LIMITS } from '../src/protocol.js';
import { createNet } from '../src/net.js';
import { CAST, poseOf, eveningAt } from '../src/crowd.js';

const id = 'abcdefgh';
const pos = (extra) => validateMessage({ t: 'pos', id, x: 50, y: 10, d: 'down', area: 'beach', ...extra });

test('five seats around the ring, on open sand, each facing the fire', () => {
  assert.equal(SEATS.length, 5);
  assert.ok(seatsAreOpen());
  assert.equal(new Set(SEATS.map((s) => s.join())).size, 5);
  for (let i = 0; i < 5; i++) {
    const [x, y] = SEATS[i], f = seatFacing(i), dx = BEACH.bonfire.x - x, dy = BEACH.bonfire.y - y;
    assert.ok(Math.max(Math.abs(dx), Math.abs(dy)) === 2);
    assert.ok((f === 'left' && dx < 0) || (f === 'right' && dx > 0) || (f === 'up' && dy < 0) || (f === 'down' && dy > 0));
    assert.equal(seatAt(x, y), i);
  }
});

test('the prompt: Sentarse beside a free seat, the full hint with none free, nothing away from the ring or in another area', () => {
  const [x, y] = SEATS[0];
  assert.deepEqual([bonfireAt(x, y).id, bonfireAt(x, y).label, bonfireAt(x, y).seat], ['sit', 'Sentarse', 0]);
  assert.equal(bonfireAt(x - 1, y).id, 'sit');
  assert.equal(bonfireAt(x, y, 'beach', new Set([0])).id === 'sit' ? bonfireAt(x, y, 'beach', new Set([0])).seat !== 0 : true, true);
  const all = new Set([0, 1, 2, 3, 4]);
  for (const [sx, sy] of SEATS) assert.deepEqual(bonfireAt(sx, sy, 'beach', all), { id: 'hint', label: FULL_TEXT, target: 'bonfire' });
  assert.equal(FULL_TEXT, 'La fogata está llena');
  assert.equal(bonfireAt(10, 10), null);
  assert.equal(bonfireAt(x, y, 'town'), null);
});

test('the sit code: 1 to 5 seated, 6 to 10 toasting; anything else is not a seat', () => {
  assert.equal(sitCode(0), 1); assert.equal(sitCode(4), 5); assert.equal(sitCode(2, true), 8); assert.equal(sitCode(-1), 0); assert.equal(sitCode(5), 0);
  assert.deepEqual(fromSit(8), { seat: 2, roasting: true });
  assert.deepEqual(fromSit(1), { seat: 0, roasting: false });
  for (const bad of [0, 11, 1.5, '3', null]) assert.equal(fromSit(bad), null);
});

test('stoking: the fire rises, holds, dies down over about 20 s, and is out afterwards', () => {
  assert.equal(fireLevel(0, FIRE_MS, 0), 0);
  assert.ok(fireLevel(0, FIRE_MS, 400) > 0 && fireLevel(0, FIRE_MS, 400) < 1);
  assert.equal(fireLevel(0, FIRE_MS, 10000), 1);
  assert.ok(fireLevel(0, FIRE_MS, FIRE_MS - 1000) < 0.5);
  assert.equal(fireLevel(0, FIRE_MS, FIRE_MS), 0);
  assert.equal(FIRE_MS, 20000);
});

test('the marshmallow whitens, turns golden and is done after ROAST_MS; some burn black, from the start and id alone', () => {
  assert.equal(roastAt(0, 0, 'a').tone, 0);
  let burnt = 0, golden = 0;
  for (let i = 0; i < 400; i++) { const r = roastAt(i * 1000, i * 1000 + ROAST_MS - 1, `p${i}`); if (r.burnt) { burnt++; assert.equal(r.tone, 2); } else { golden++; assert.equal(r.tone, 1); } }
  assert.ok(burnt > 40 && burnt < 130 && golden > 250, `${burnt} of 400 burnt`);
  assert.deepEqual(roastAt(5, 5 + ROAST_MS, 'z'), roastAt(5, 5 + ROAST_MS, 'z'));
  assert.equal(roastAt(0, ROAST_MS, 'q').done, true);
});

test('protocol: sit 1 to 10 travels with pos and hello, anything else is dropped; the fire message is accepted and limited', () => {
  assert.equal(pos({ sit: 3 }).sit, 3); assert.equal(pos({ sit: 10 }).sit, 10);
  for (const bad of [0, 11, 2.5, '2', null, true]) assert.equal('sit' in pos({ sit: bad }), false);
  assert.equal('sit' in pos({}), false);
  const hello = validateMessage({ t: 'hello', id, name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] }, x: 50, y: 10, d: 'down', area: 'beach', sit: 7 }, {});
  assert.equal(hello.pos.sit, 7);
  assert.deepEqual(validateMessage({ t: 'fire', id, junk: 1 }), { t: 'fire', id });
  assert.ok(LIMITS.fire && LIMITS.fire.burst === 1);
});

test('net: a seat change is sent on the same tile, and the fire message reaches the peers as an event', async () => {
  const sent = [];
  const timers = { setInterval: () => 1, clearInterval() {}, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {} };
  let clock = 1000;
  const wire = { name: 'fake', async open() { return { send: (m) => sent.push(m), close() {} }; } };
  const net = createNet({ wire, catalogue: {}, now: () => (clock += 2000), timers });
  await net.join('FOCA-LUNA-42', { name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] } });
  sent.length = 0;
  net.sendPos(47, 27, 'right', 'beach', 0, 0, 0, 0);
  net.sendPos(47, 27, 'right', 'beach', 0, 0, 0, 1);
  net.sendPos(47, 27, 'right', 'beach', 0, 0, 0, 6);
  assert.deepEqual(sent.filter((m) => m.t === 'pos').map((m) => m.sit || 0), [0, 1, 6]);
  assert.equal(net.sendFire(), true);
  assert.deepEqual(sent.at(-1), { t: 'fire', id: sent.at(-1).id });
});

test('the crowd sits at the fire only in the evening, never more than MAX_NPC_SEATS of it', () => {
  const night = Date.UTC(2026, 10, 26, 2, 0, 0), day = Date.UTC(2026, 10, 25, 16, 0, 0);          // 23:00 and 13:00 in Chile (summer time, UTC-3)
  assert.ok(eveningAt(night) && !eveningAt(day));
  const seated = (utc) => CAST.beach.filter((m) => poseOf(m, utc).sit);
  assert.equal(seated(day).length, 0);
  assert.ok(seated(night).length >= 1 && seated(night).length <= MAX_NPC_SEATS);
  for (const m of seated(night)) { const p = poseOf(m, night); assert.ok(seatAt(p.x, p.y) >= 0); assert.equal(p.moving, false); }
});
