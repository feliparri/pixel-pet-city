import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeName, validateLook, validateMessage, createRateLimiter, parsePetFragment, EMOTES, MAX_NAME, newPeerId } from '../src/protocol.js';

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
  assert.deepEqual(m, { t: 'hello', id, name: 'Pepe', look });
  assert.equal(validateMessage({ t: 'hello', id, name: 'x', look: { species: 'dog', stage: 0 } }, CAT), null);
});

test('validateMessage: pos must be an integer walkable tile with a known direction', () => {
  assert.deepEqual(validateMessage({ t: 'pos', id, x: 12, y: 17, d: 'left' }), { t: 'pos', id, x: 12, y: 17, d: 'left' });
  for (const bad of [{ x: 0, y: 0 }, { x: 99, y: 17 }, { x: 12.5, y: 17 }, { x: '12', y: 17 }, { x: 12, y: -1 }, { x: 14, y: 13 }, { x: NaN, y: 1 }, { x: 12, y: 17, d: 'north' }]) {
    assert.equal(validateMessage({ t: 'pos', id, d: 'up', ...bad }), null, JSON.stringify(bad));
  }
});

test('validateMessage: emotes are presets only', () => {
  for (const e of Object.keys(EMOTES)) assert.equal(validateMessage({ t: 'emote', id, e }).e, e);
  for (const e of ['hola mundo', '__proto__', 'constructor', '', 5, null, '<script>']) assert.equal(validateMessage({ t: 'emote', id, e }), null);
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

test('parsePetFragment reads the Android hand-over and refuses the rest', () => {
  const p = parsePetFragment('#n=Mochi&s=cat&g=2&i=tophat,sunglasses,scarf,cape', CAT);
  assert.deepEqual(p, { name: 'Mochi', look: { species: 'cat', stage: 2, items: ['tophat', 'sunglasses', 'scarf', 'cape'] } });
  assert.deepEqual(parsePetFragment('#s=frog&g=0', CAT).look.items, ['', '', '', '']);
  assert.equal(parsePetFragment('#n=x&s=dog&g=0', CAT), null);
  assert.equal(parsePetFragment('#n=x&s=cat&g=9', CAT), null);
  assert.equal(parsePetFragment('', CAT), null);
  assert.equal(parsePetFragment('#' + 'a'.repeat(400), CAT), null);
  assert.equal(parsePetFragment('#n=%3Cscript%3E&s=seal&g=1', CAT).name, 'script');
});
