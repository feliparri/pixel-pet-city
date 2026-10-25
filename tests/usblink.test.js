// The USB link's frame codec (src/usblink.js, docs/usb-link.md): the shared vectors (pixel-pet's tests/test_usblink.c decodes the same lines), round trips, and what must be dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFrame, decodeFrame, crc32, BODY_MAX, LINE_MAX } from '../src/usblink.js';

const DEV = '000102030405060708090a0b0c0d0e0f';
const SIG = 'c51de50e0560e0a0b35f34e12a2e7dc45701f40842346aa1144c3e7799506060';
const te = new TextEncoder();
const V = {
  H: '@pp1 H 1793462400 87fa9d32',
  K: '@pp1 K 1793462402 1e6a2eee',
  B: `@pp1 B ${DEV} 0.5.1 away 125828da`,
  Q: `@pp1 Q 7 trip-recall ${DEV} 1800000000 ${SIG} eyJ0cmlwX2lkIjoxfQ== e6304339`,
  Q0: '@pp1 Q 8 device-register - - - eyJkZXZpY2VfaWQiOiJ4In0= a7c27c27',
  R: '@pp1 R 7 200 eyJyZWNhbGxlZCI6dHJ1ZX0= c0ed9351',
  R0: '@pp1 R 9 0 - c8340515',
};
const text = (b) => new TextDecoder().decode(b);

test('crc32 is the zlib one', () => {
  assert.equal(crc32(te.encode('123456789')), 0xcbf43926);
});

test('the shared vectors decode', () => {
  assert.deepEqual(decodeFrame(V.H), { type: 'H', unix: 1793462400 });
  assert.deepEqual(decodeFrame(V.K), { type: 'K', unix: 1793462402 });
  assert.deepEqual(decodeFrame(V.B), { type: 'B', device: DEV, fw: '0.5.1', state: 'away' });
  const q = decodeFrame(V.Q);
  assert.deepEqual({ ...q, body: text(q.body) }, { type: 'Q', id: 7, action: 'trip-recall', auth: { device: DEV, ts: 1800000000, sig: SIG }, body: '{"trip_id":1}' });
  const q0 = decodeFrame(V.Q0);
  assert.equal(q0.auth, null);
  assert.equal(text(q0.body), '{"device_id":"x"}');
  const r = decodeFrame(V.R);
  assert.deepEqual({ ...r, body: text(r.body) }, { type: 'R', id: 7, status: 200, body: '{"recalled":true}' });
  const r0 = decodeFrame(V.R0);
  assert.equal(r0.status, 0);
  assert.equal(r0.body.length, 0);
});

test('the shared vectors encode to the same lines', () => {
  assert.equal(encodeFrame({ type: 'H', unix: 1793462400 }), `${V.H}\n`);
  assert.equal(encodeFrame({ type: 'K', unix: 1793462402 }), `${V.K}\n`);
  assert.equal(encodeFrame({ type: 'B', device: DEV, fw: '0.5.1', state: 'away' }), `${V.B}\n`);
  assert.equal(encodeFrame({ type: 'Q', id: 7, action: 'trip-recall', auth: { device: DEV, ts: 1800000000, sig: SIG }, body: te.encode('{"trip_id":1}') }), `${V.Q}\n`);
  assert.equal(encodeFrame({ type: 'Q', id: 8, action: 'device-register', auth: null, body: te.encode('{"device_id":"x"}') }), `${V.Q0}\n`);
  assert.equal(encodeFrame({ type: 'R', id: 7, status: 200, body: te.encode('{"recalled":true}') }), `${V.R}\n`);
  assert.equal(encodeFrame({ type: 'R', id: 9, status: 0, body: new Uint8Array(0) }), `${V.R0}\n`);
});

test('a line end is tolerated; logs are not frames; bad frames are null', () => {
  assert.equal(decodeFrame(`${V.H}\r\n`).unix, 1793462400);
  for (const log of ['I (12345) city: trip-start -> HTTP 200 (230 bytes)', '', 'status', '@pp2 H 1 00000000', ` ${V.H}`]) assert.equal(decodeFrame(log), undefined);
  for (const bad of ['@pp1 H 1793462401 87fa9d32', '@pp1 H 1793462400 87FA9D32', '@pp1 H 1793462400', '@pp1 X 1 00000000', `${V.R} extra`, '@pp1  H 1793462400 87fa9d32']) assert.equal(decodeFrame(bad), null, bad);
});

const withCrc = (head) => `${head} ${crc32(te.encode(head)).toString(16).padStart(8, '0')}`;

test('bad fields with a good crc are dropped', () => {
  for (const head of ['@pp1 R 7 20x -', '@pp1 R 7 1000 -', '@pp1 R 0 200 -', '@pp1 R 7 200 e@==', '@pp1 H 12x', '@pp1 B zz 0.5.1 away', '@pp1 Q 7 Trip-Start - - - -', `@pp1 Q 7 trip-start ${DEV} - - -`]) {
    assert.equal(decodeFrame(withCrc(head)), null, head);
  }
});

test('the biggest body fits, one byte more and a longer line do not', () => {
  const big = new Uint8Array(BODY_MAX).fill(97);
  const line = encodeFrame({ type: 'R', id: 1, status: 200, body: big });
  assert.ok(line.length - 1 <= LINE_MAX);
  assert.equal(decodeFrame(line).body.length, BODY_MAX);
  assert.throws(() => encodeFrame({ type: 'R', id: 1, status: 200, body: new Uint8Array(BODY_MAX + 1) }));
  assert.equal(decodeFrame(`@pp1 R ${'x'.repeat(LINE_MAX)}`), null);
});

test('a binary body and a big id round trip', () => {
  const bin = Uint8Array.from({ length: 300 }, (_, i) => (i * 7 + 1) & 255);
  const back = decodeFrame(encodeFrame({ type: 'R', id: 4000000000, status: 502, body: bin }));
  assert.equal(back.id, 4000000000);
  assert.deepEqual([...back.body], [...bin]);
});
