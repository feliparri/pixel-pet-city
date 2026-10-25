import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeName, validateLook, validateMessage, createRateLimiter, EMOTES, MAX_NAME, newPeerId, ACTIVITIES } from '../src/protocol.js';

const CAT = { tophat: { slot: 'head' }, sunglasses: { slot: 'face' }, scarf: { slot: 'neck' }, cape: { slot: 'back' } };
const look = { species: 'cat', stage: 2, items: ['tophat', '', '', ''] };

test('sanitizeName strips markup, controls and emoji, collapses spaces and cuts at 12 characters', () => {
  assert.equal(sanitizeName('  Pepe   Grillo '), 'Pepe Grillo');
  assert.equal(sanitizeName('<b>Hola</b>'), 'bHolab');
  assert.equal(sanitizeName('a\u0000b‮c\n'), 'abc');
  assert.equal(sanitizeName('Ñandú 🐸'), 'Ñandú');
  assert.equal(sanitizeName('x'.repeat(50)).length, MAX_NAME);
  assert.equal(Array.from(sanitizeName('ñ'.repeat(30))).length, MAX_NAME);
  assert.equal(sanitizeName('🐸🐸'), 'Mascota');
  for (const v of [null, undefined, 12, {}, [], '']) assert.equal(sanitizeName(v), 'Mascota');
});

test('validateLook keeps known species, stages and items in their own slot only', () => {
  assert.deepEqual(validateLook(look, CAT), look);
  assert.deepEqual(validateLook({ ...look, items: ['sunglasses', 'sunglasses', 'cape', 'x'] }, CAT).items, ['', 'sunglasses', '', '']);
  assert.deepEqual(validateLook({ ...look, items: ['__proto__', 'constructor', 'toString', 7] }, CAT).items, ['', '', '', '']);
  for (const bad of [null, 'cat', { species: 'dog', stage: 1 }, { species: 'cat', stage: 4 }, { species: 'cat', stage: -1 }, { species: 'cat', stage: 1.5 }, { species: 'cat', stage: '1' }]) {
    assert.equal(validateLook(bad, CAT), null);
  }
  assert.deepEqual(validateLook({ species: 'frog', stage: 0 }, CAT).items, ['', '', '', '']);
});

const id = 'abcdef1';

test('validateMessage: hello', () => {
  const m = validateMessage({ t: 'hello', id, name: 'Pepe<>', look }, CAT);
  assert.deepEqual(m, { t: 'hello', id, name: 'Pepe', look, stats: null, act: 'idle' });
  assert.equal(validateMessage({ t: 'hello', id, name: 'x', look: { species: 'dog', stage: 0 } }, CAT), null);
});

test('validateMessage: hello carries the stats and the activity for the radar, only when they are valid, and stays small', () => {
  const full = { t: 'hello', id, name: 'Mochi', look, s: [80, 70, 60, 50, 100], a: 'football' };
  assert.deepEqual(validateMessage(full, CAT), { t: 'hello', id, name: 'Mochi', look, stats: [80, 70, 60, 50, 100], act: 'football' });
  for (const s of [[1, 2, 3, 4], [1, 2, 3, 4, 101], [1, 2, 3, 4, -1], [1, 2, 3, 4, 1.5], [1, 2, 3, 4, '5'], 'x', null, {}]) assert.equal(validateMessage({ ...full, s }, CAT).stats, null, JSON.stringify(s));
  for (const a of ['fly', 5, null, {}, '__proto__']) assert.equal(validateMessage({ ...full, a }, CAT).act, 'idle', String(a));
  assert.deepEqual(ACTIVITIES, ['idle', 'walk', 'hide', 'chicken', 'football', 'race', 'shop']);
  const heartbeat = { ...full, name: 'Mochi Largo12', look: { species: 'seal', stage: 3, items: ['tophat', 'tophat', 'tophat', 'tophat'] }, s: [100, 100, 100, 100, 100], a: 'football', x: 19, y: 18, d: 'left', area: 'town' };
  assert.ok(JSON.stringify(heartbeat).length < 300, 'a heartbeat with stats stays well under the 512 B limit');
  assert.ok(validateMessage(heartbeat, CAT));
});

test('validateMessage: pos must be an integer walkable tile with a known direction', () => {
  assert.deepEqual(validateMessage({ t: 'pos', id, x: 19, y: 18, d: 'left' }), { t: 'pos', id, x: 19, y: 18, d: 'left', area: 'town' });
  for (const bad of [{ x: 0, y: 0 }, { x: 99, y: 18 }, { x: 19.5, y: 18 }, { x: '19', y: 18 }, { x: 19, y: -1 }, { x: 23, y: 21 }, { x: NaN, y: 1 }, { x: 19, y: 18, d: 'north' }, { x: 19, y: 18, area: 'moon' }, { x: 19, y: 18, area: 'shop' }, { x: 6, y: 10, area: 5 }]) {
    assert.equal(validateMessage({ t: 'pos', id, d: 'up', ...bad }), null, JSON.stringify(bad));
  }
});

test('validateMessage: pos carries its area, validated against that area\'s own map', () => {
  assert.deepEqual(validateMessage({ t: 'pos', id, x: 6, y: 10, d: 'up', area: 'shop' }), { t: 'pos', id, x: 6, y: 10, d: 'up', area: 'shop' });
  assert.equal(validateMessage({ t: 'pos', id, x: 5, y: 7, d: 'up' }), null);                       // no area means the town, where (5, 7) is a roof
  assert.equal(validateMessage({ t: 'pos', id, x: 5, y: 4, d: 'up', area: 'shop' }), null);       // the counter
  assert.equal(validateMessage({ t: 'pos', id, x: 40, y: 3, d: 'up', area: 'shop' }), null);      // outside the shop
  assert.equal(validateMessage({ t: 'pos', id, x: 6, y: 11, d: 'down', area: 'shop' }).area, 'shop');
  for (const area of ['__proto__', 'constructor', '', null, {}, ['town']]) assert.equal(validateMessage({ t: 'pos', id, x: 19, y: 18, d: 'up', area }), null, String(area));
});

test('validateMessage: emotes are presets only', () => {
  for (const e of Object.keys(EMOTES)) assert.equal(validateMessage({ t: 'emote', id, e }).e, e);
  for (const e of ['hola mundo', '__proto__', 'constructor', '', 5, null, '<script>']) assert.equal(validateMessage({ t: 'emote', id, e }), null);
});

test('validateMessage: a jump carries nothing but who jumped', () => {
  assert.deepEqual(validateMessage({ t: 'jump', id, h: 99, x: 3 }), { t: 'jump', id });
  assert.deepEqual(validateMessage(JSON.stringify({ t: 'jump', id })), { t: 'jump', id });
  for (const bad of [{ t: 'jump' }, { t: 'jump', id: 'A B' }, { t: 'jump', id: 'ab' }, { t: 'jump', id, pad: 'x'.repeat(600) }, 'x'.repeat(600)]) assert.equal(validateMessage(bad), null, JSON.stringify(bad).slice(0, 40));
  assert.equal(validateMessage(JSON.stringify({ t: 'jump', id, pad: 'x'.repeat(600) })), null);        // over MAX_PAYLOAD_BYTES as a string
});

test('validateMessage: shape, ids, types and size', () => {
  assert.deepEqual(validateMessage({ t: 'bye', id, extra: 'ignored' }), { t: 'bye', id });
  assert.deepEqual(validateMessage(JSON.stringify({ t: 'bye', id })), { t: 'bye', id });
  for (const bad of [null, undefined, 3, 'not json', '[]', [], {}, { t: 'bye' }, { t: 'bye', id: 'A B' }, { t: 'bye', id: 'ab' }, { t: 'bye', id: 'x'.repeat(40) }, { t: 'boom', id }, { t: 5, id }, { t: 'hello', id, name: 'x'.repeat(2000), look }]) {
    assert.equal(validateMessage(bad, CAT), null, JSON.stringify(bad)?.slice(0, 40));
  }
  assert.equal(validateMessage('{'.repeat(1000)), null);
});

test('newPeerId makes ids the validator accepts', () => {
  for (let i = 0; i < 50; i++) assert.ok(validateMessage({ t: 'bye', id: newPeerId() }));
});

test('rate limiter: burst, refill, per peer and per kind', () => {
  let t = 0;
  const rl = createRateLimiter(() => t);
  for (let i = 0; i < 12; i++) assert.ok(rl.allow('a', 'pos'));
  assert.equal(rl.allow('a', 'pos'), false);
  assert.ok(rl.allow('b', 'pos'));                 // another peer
  assert.ok(rl.allow('a', 'emote'));               // another kind
  t += 250;                                        // 3 tokens back
  assert.ok(rl.allow('a', 'pos') && rl.allow('a', 'pos') && rl.allow('a', 'pos'));
  assert.equal(rl.allow('a', 'pos'), false);
  for (let i = 0; i < 2; i++) rl.allow('a', 'emote');
  assert.equal(rl.allow('a', 'emote'), false);
  t += 1000;
  assert.ok(rl.allow('a', 'emote'));
  assert.ok(rl.allow('a', 'jump') && rl.allow('a', 'jump'));              // a jump: two at once, then one every 400 ms
  assert.equal(rl.allow('a', 'jump'), false);
  assert.equal(rl.allow('a', 'unknown'), false);
  rl.forget('a');
  assert.ok(rl.allow('a', 'emote'));
});

test('a sustained flood is capped at the refill rate', () => {
  let t = 0;
  const rl = createRateLimiter(() => t);
  let passed = 0;
  for (let ms = 0; ms < 10000; ms += 5) { t = ms; if (rl.allow('x', 'pos')) passed++; }
  assert.ok(passed <= 12 + 12 * 10 + 1, String(passed));
  assert.ok(passed >= 100);
});

