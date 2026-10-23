import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, generateCode, normalizeCode, isValidCode, channelName } from '../src/code.js';

test('words are unique, upper case, A-Z only and short', () => {
  assert.equal(new Set(WORDS).size, WORDS.length);
  assert.ok(WORDS.length >= 90);
  for (const w of WORDS) assert.match(w, /^[A-Z]{3,6}$/);
});

test('generated codes are valid, have two different words and vary', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const c = generateCode();
    assert.ok(isValidCode(c), c);
    const [a, b] = c.split('-');
    assert.notEqual(a, b);
    seen.add(c);
  }
  assert.ok(seen.size > 290);
});

test('a seeded rng reaches the edges (00 and 99)', () => {
  assert.match(generateCode(() => 0), /-00$/);
  assert.match(generateCode(() => 0.999999), /-99$/);
});

test('normalizeCode accepts what people type', () => {
  assert.equal(normalizeCode('foca luna 42'), 'FOCA-LUNA-42');
  assert.equal(normalizeCode('  Foca_Luna-07 '), 'FOCA-LUNA-07');
  assert.equal(normalizeCode('FOCA--LUNA-42'), 'FOCA-LUNA-42');
});

test('normalizeCode rejects anything else', () => {
  for (const bad of ['', 'FOCA-LUNA', 'FOCA-LUNA-4', 'FOCA-LUNA-423', '12-LUNA-42', 'FOCA-LUNA-4x', 'AB-LUNA-42', null, undefined, 42, 'x'.repeat(100), '../etc-passwd-12', 'FOCA-LUNA-42\n--']) {
    assert.equal(normalizeCode(bad), null, String(bad));
  }
});

test('the channel is room:<code>', () => assert.equal(channelName('FOCA-LUNA-42'), 'room:FOCA-LUNA-42'));
