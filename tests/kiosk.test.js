import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEACH, SIGNS, isWalkable } from '../src/map.js';
import { TREATS, HOLD_MS, EAT_MS, SHORT, FULL_HAND, kioskAt, treatRows, createTreat, giveTreat, treatPhase, fromCode, buyTreat } from '../src/kiosk.js';
import { createStars } from '../src/stars.js';
import { validateMessage } from '../src/protocol.js';
import { createNet } from '../src/net.js';
import { CUES } from '../src/pet-sounds.js';
import { treatSprite, drawTreatIcon, drawHeld } from '../src/art/treat.js';

test('the Kiosco sells four treats for the town\'s stars, and nothing else is involved: not tools, no server, no migration', () => {
  assert.deepEqual(TREATS.map((t) => t.name), ['Helado', 'Refresco', 'Agua de coco', 'Paleta']);
  assert.ok(TREATS.every((t) => Number.isInteger(t.price) && t.price > 0 && ['eat', 'drink'].includes(t.act)));
  const src = readFileSync(new URL('../src/kiosk.js', import.meta.url), 'utf8');
  assert.ok(!/fetch|supabase|trip\.js|tools\.js/.test(src.replace(/\/\/.*$/gm, '')), 'no network, no tools');
  assert.ok(SIGNS.some((s) => s.area === 'beach' && s.text === 'Kiosco'));
});

test('A: Kiosco in front of the counter only', () => {
  const k = BEACH.kiosk;
  for (let x = k.x; x < k.x + k.w; x++) { assert.deepEqual(kioskAt(x, k.y + k.h), { id: 'kiosk', label: 'Kiosco', target: 'kiosk' }); assert.ok(isWalkable(x, k.y + k.h, 'beach')); }
  assert.equal(kioskAt(k.x - 1, k.y + k.h), null);
  assert.equal(kioskAt(k.x, k.y + k.h + 1), null);
  assert.equal(kioskAt(k.x, k.y + k.h, 'town'), null);
});

test('stars can be spent: down by the price, saved like any change, refused (and unchanged) when the pet is short', () => {
  const saved = [], s = createStars({ initial: 5, persist: (n) => saved.push(n) });
  assert.equal(s.spend(3), true); assert.equal(s.get(), 2); assert.deepEqual(saved, [2]);
  assert.equal(s.spend(3), false); assert.equal(s.get(), 2, 'not enough: nothing changes'); assert.deepEqual(saved, [2]);
  for (const bad of [0, -1, 1.5, NaN, '2']) assert.equal(s.spend(bad), false);
  assert.equal(s.get(), 2);
  assert.equal(s.add(4), 6);
});

test('buying: pays and fills the hand; "Te faltan estrellas" without enough, nothing spent; a full hand refuses', () => {
  const s = createStars({ initial: 3 }), t = createTreat();
  assert.deepEqual(buyTreat(s, t, 2, 0), { ok: false, text: SHORT }, 'a coconut water is 4 stars');
  assert.equal(s.get(), 3); assert.equal(t.idx, -1);
  const r = buyTreat(s, t, 0, 1000);
  assert.equal(r.ok, true); assert.equal(s.get(), 0); assert.equal(t.idx, 0);
  assert.deepEqual(buyTreat(createStars({ initial: 9 }), t, 1, 2000), { ok: false, text: FULL_HAND });
  assert.deepEqual(buyTreat(s, createTreat(), 9, 0), { ok: false, text: SHORT });
  assert.deepEqual(treatRows(2).map((r) => r.afford), [false, true, false, true]);
});

test('a treat is held about 20 s, the last stretch eaten or drunk, then it is gone (once); its code goes with the position', () => {
  const t = createTreat();
  assert.equal(treatPhase(t, 0), null);
  giveTreat(t, 3, 5000);
  let p = treatPhase(t, 5001);
  assert.deepEqual([p.idx, p.eating, p.code], [3, false, 4]);
  p = treatPhase(t, 5000 + HOLD_MS - EAT_MS + 1);
  assert.deepEqual([p.eating, p.code], [true, 8]); assert.ok(p.k > 0 && p.k < 0.01);
  p = treatPhase(t, 5000 + HOLD_MS - 1); assert.ok(p.eating && p.k > 0.99);
  p = treatPhase(t, 5000 + HOLD_MS); assert.equal(p.done, true); assert.equal(treatPhase(t, 5000 + HOLD_MS + 1), null, 'and it is gone');
  assert.deepEqual(fromCode(2), { idx: 1, eating: false }); assert.deepEqual(fromCode(7), { idx: 2, eating: true });
  for (const bad of [0, 9, 1.5, null, undefined, '3']) assert.equal(fromCode(bad), null);
});

test('the treat travels like rest and surf: an optional pos and hello field 1 to 8, anything else dropped, an old reader just sees a pos', () => {
  const id = 'abcdefgh', pos = (extra) => validateMessage({ t: 'pos', id, x: 50, y: 10, d: 'down', area: 'beach', ...extra });
  assert.equal(pos({ treat: 3 }).treat, 3);
  for (const bad of [0, 9, 2.5, '2', null, true]) assert.equal('treat' in pos({ treat: bad }), false, `${bad} is dropped`);
  assert.equal('treat' in pos({}), false);
  const hello = validateMessage({ t: 'hello', id, name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] }, x: 50, y: 10, d: 'down', area: 'beach', treat: 6 }, {});
  assert.equal(hello.pos.treat, 6);
  assert.equal('treat' in validateMessage({ t: 'hello', id, name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] }, x: 50, y: 10, d: 'down', area: 'beach', treat: 99 }, {}).pos, false);
});

test('net: a treat change is sent even on the same tile, and it reaches the peers as an event', async () => {
  const sent = [];
  const timers = { setInterval: () => 1, clearInterval() {}, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {} };
  let clock = 1000;
  const wire = { name: 'fake', async open() { return { send: (m) => sent.push(m), close() {} }; } };
  const net = createNet({ wire, catalogue: {}, now: () => (clock += 200), timers });
  await net.join('FOCA-LUNA-42', { name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] } });
  sent.length = 0;
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 0);
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 2);
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 2);
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 6);
  net.sendPos(50, 10, 'down', 'beach', 0, 0, 0);
  assert.deepEqual(sent.filter((m) => m.t === 'pos').map((m) => m.treat || 0), [0, 2, 6, 0]);
});

test('the cues and the drawing exist: munch, sip and yum are soft; each treat has a sprite that shrinks, an icon, and a held drawing for every stage', () => {
  for (const c of ['munch', 'sip', 'yum']) assert.ok(Array.isArray(CUES[c]) && CUES[c].length >= 2, c);
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? {} : (...a) => { calls.push(k); return undefined; }), set: () => true });
  assert.ok(typeof treatSprite === 'function' && typeof drawTreatIcon === 'function' && typeof drawHeld === 'function');
  const src = readFileSync(new URL('../src/art/treat.js', import.meta.url), 'utf8');
  assert.ok(src.includes('LEFT') && src.includes('drawHeld') && src.includes('smooth'));
  assert.ok(calls.length === 0);
});
