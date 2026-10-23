import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { signRequest, verifyRequest, sha256Hex, WINDOW_S, canonical } from '../supabase/functions/_shared/crypto.js';
import { newCode, normalizeCode, CODE_ALPHABET, CODE_LEN, isEntrance, ENTRANCES, DEFAULT_ENTRANCE } from '../supabase/functions/_shared/trip-code.js';

const secretHex = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const body = new TextEncoder().encode('{"trip_id":1}');

test('the signature matches an independent HMAC (and is the vector documented in docs/trip-api.md)', async () => {
  const h = await signRequest({ deviceId: '0'.repeat(32), secretHex, fn: 'trip-recall', body, ts: 1800000000 });
  const key = createHash('sha256').update(Buffer.from(secretHex, 'hex')).digest();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const want = createHmac('sha256', key).update(`POST|trip-recall|1800000000|${bodyHash}`).digest('hex');
  assert.equal(h['x-signature'], want);
  assert.equal(await sha256Hex(body), bodyHash);
  assert.equal(canonical('POST', 'trip-recall', 1800000000, bodyHash), `POST|trip-recall|1800000000|${bodyHash}`);
  assert.equal(key.toString('hex'), '630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd');
  assert.equal(bodyHash, 'a85d204c767e1c6428ba1a67c46077c500b39cb362b78f6ecee0eba41a068e79');
  assert.equal(want, 'c51de50e0560e0a0b35f34e12a2e7dc45701f40842346aa1144c3e7799506060');
});

async function check(over = {}, nowS = 1800000000) {
  const keyHashHex = createHash('sha256').update(Buffer.from(secretHex, 'hex')).digest('hex');
  const headers = { ...(await signRequest({ deviceId: '0'.repeat(32), secretHex, fn: 'trip-recall', body, ts: 1800000000 })), ...over };
  return verifyRequest({ headers, method: 'POST', fn: 'trip-recall', body, keyHashHex, nowS });
}

test('verification: ok, tampered body or function, stale, future, bad headers', async () => {
  assert.equal(await check(), 'ok');
  assert.equal(await check({}, 1800000000 + WINDOW_S), 'ok');
  assert.equal(await check({}, 1800000000 + WINDOW_S + 1), 'stale');
  assert.equal(await check({}, 1800000000 - WINDOW_S - 1), 'stale');
  assert.equal(await check({ 'x-signature': 'a'.repeat(64) }), 'bad_signature');
  assert.equal(await check({ 'x-signature': 'zz' }), 'bad_headers');
  assert.equal(await check({ 'x-timestamp': 'now' }), 'bad_headers');
  assert.equal(await check({ 'x-timestamp': '1800000001' }), 'bad_signature');           // the timestamp is signed
  const keyHashHex = createHash('sha256').update(Buffer.from(secretHex, 'hex')).digest('hex');
  const headers = await signRequest({ deviceId: 'a', secretHex, fn: 'trip-recall', body, ts: 1800000000 });
  const v = (o) => verifyRequest({ headers, method: 'POST', fn: 'trip-recall', body, keyHashHex, nowS: 1800000000, ...o });
  assert.equal(await v({ body: new TextEncoder().encode('{"trip_id":2}') }), 'bad_signature');
  assert.equal(await v({ fn: 'trip-return' }), 'bad_signature');
  assert.equal(await v({ method: 'GET' }), 'bad_signature');
});

test('codes: six symbols from the unambiguous alphabet, values above the unbiased range are skipped', () => {
  assert.equal(CODE_ALPHABET.length, 31);
  for (const bad of '01OIL') assert.ok(!CODE_ALPHABET.includes(bad));
  const code = newCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 7 + 3));
  assert.equal(code.length, CODE_LEN);
  assert.match(code, /^[2-9A-HJKMNP-Z]{6}$/);
  let calls = 0;
  const c2 = newCode((n) => { calls++; return calls === 1 ? new Uint8Array(n).fill(250) : new Uint8Array(n).fill(0); });
  assert.equal(c2, '222222');
  assert.equal(calls, 2);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(newCode((n) => globalThis.crypto.getRandomValues(new Uint8Array(n))));
  assert.ok(seen.size > 195);
});

test('codes: what people type', () => {
  assert.equal(normalizeCode(' ab2-cd3 '), 'AB2CD3');
  assert.equal(normalizeCode('AB2CD'), null);
  assert.equal(normalizeCode('AB2CD0'), null);
  assert.equal(normalizeCode('ABOCD2'), null);
  assert.equal(normalizeCode(null), null);
  assert.equal(normalizeCode('AB2CD3E'), null);
});

test('entrances: the default pair and the demo pair', () => {
  assert.equal(DEFAULT_ENTRANCE, 'parachute');
  assert.deepEqual(ENTRANCES, ['parachute', 'blue_bolt']);
  assert.ok(isEntrance('blue_bolt'));
  assert.ok(!isEntrance('rayo azul') && !isEntrance(null) && !isEntrance('__proto__'));
});
