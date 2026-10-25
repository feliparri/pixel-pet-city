// The USB bridge (src/usb-bridge.js) against a fake serial port and a fake trip API: what it opens and how, what it forwards (exactly the board's headers), what it answers, and when the town opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, USB_FILTER, BAUD } from '../src/usb-bridge.js';
import { encodeFrame, decodeFrame } from '../src/usblink.js';

const DEV = '000102030405060708090a0b0c0d0e0f';
const SIG = 'c51de50e0560e0a0b35f34e12a2e7dc45701f40842346aa1144c3e7799506060';
const te = new TextEncoder();
const tick = () => new Promise((r) => setTimeout(r, 5));

/** A serial port whose board side the test drives: feed(text) is what the board prints, `written` is what the page sent. */
function fakePort(log = []) {
  let controller;
  const written = [];
  const port = {
    readable: new ReadableStream({ start: (c) => { controller = c; } }),
    writable: new WritableStream({ write: (chunk) => { written.push(new TextDecoder().decode(chunk)); } }),
    async open(o) { log.push(['open', o]); },
    async setSignals(s) { log.push(['signals', s]); },
    async close() { log.push(['close']); },
  };
  return {
    port, log,
    feed: (text) => controller.enqueue(te.encode(text)),
    end: () => controller.close(),
    frames: () => written.join('').split('\n').map(decodeFrame).filter((f) => f),
  };
}

function setup({ answers = {} } = {}) {
  const calls = [], states = [], codes = [];
  const board = fakePort();
  const serial = { requestPort: async (o) => { board.log.push(['request', o]); return board.port; }, addEventListener() {} };
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    const a = answers[url.split('/').pop()] ?? { status: 200, body: '{"ok":true}' };
    if (a.fail) throw new TypeError('network');
    return { status: a.status, arrayBuffer: async () => te.encode(a.body).buffer };
  };
  const bridge = createBridge({ base: 'https://x.test/functions/v1/trip', fetch: fetchFn, now: () => 1793462400000, sleep: async () => {}, every: () => 0, stopEvery: () => {},
    onState: (s, info) => states.push([s, info]), onTripCode: (c) => codes.push(c) });
  return { board, serial, bridge, calls, states, codes };
}
const request = (o = {}) => encodeFrame({ type: 'Q', id: 7, action: 'trip-recall', auth: { device: DEV, ts: 1800000000, sig: SIG }, body: te.encode('{"trip_id":1}'), ...o });

test('it asks for the ESP32-S3 port, opens it at 115200 and drops DTR and RTS before anything is written', async () => {
  const { board, serial, bridge } = setup();
  await bridge.connect(serial);
  assert.deepEqual(board.log.slice(0, 3), [['request', { filters: [USB_FILTER] }], ['open', { baudRate: BAUD }], ['signals', { dataTerminalReady: false, requestToSend: false }]]);
  assert.equal(USB_FILTER.usbVendorId, 0x303a);
  assert.equal(USB_FILTER.usbProductId, 0x1001);
  await tick();
  assert.deepEqual(board.frames().map((f) => f.type), ['H']);
  assert.equal(board.frames()[0].unix, 1793462400);
});

test('the board answers the hello: connected, then keepalives', async () => {
  const { board, serial, bridge, states } = setup();
  await bridge.connect(serial);
  assert.equal(states.at(-1)[0], 'waiting');
  board.feed(encodeFrame({ type: 'B', device: DEV, fw: '0.5.1', state: 'home' }));
  await tick();
  assert.deepEqual(states.at(-1), ['connected', { device: DEV, fw: '0.5.1', tripState: 'home' }]);
  bridge.tick();
  await tick();
  assert.deepEqual(board.frames().map((f) => f.type), ['H', 'K']);
});

test('a board request is forwarded with exactly the board\'s headers and the answer goes back', async () => {
  const { board, serial, bridge, calls } = setup({ answers: { 'trip-recall': { status: 200, body: '{"recalled":true}' } } });
  await bridge.connect(serial);
  board.feed(`I (1234) city: something\n${request()}more logs\n`);
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://x.test/functions/v1/trip/trip-recall');
  assert.deepEqual(calls[0].init.headers, { 'content-type': 'application/json', 'x-device-id': DEV, 'x-timestamp': '1800000000', 'x-signature': SIG });
  assert.equal(new TextDecoder().decode(calls[0].init.body), '{"trip_id":1}');
  assert.equal(calls[0].init.method, 'POST');
  const r = board.frames().find((f) => f.type === 'R');
  assert.deepEqual({ id: r.id, status: r.status, body: new TextDecoder().decode(r.body) }, { id: 7, status: 200, body: '{"recalled":true}' });
});

test('device-register goes without the signature headers; a network failure answers 0; an unknown action is refused without a call', async () => {
  const { board, serial, bridge, calls } = setup({ answers: { 'trip-status': { fail: true } } });
  await bridge.connect(serial);
  board.feed(request({ id: 1, action: 'device-register', auth: null }) + request({ id: 2, action: 'trip-status' }) + request({ id: 3, action: 'trip-claim' }));
  await tick();
  assert.deepEqual(calls.map((c) => c.url.split('/').pop()), ['device-register', 'trip-status']);
  assert.deepEqual(Object.keys(calls[0].init.headers), ['content-type']);
  const byId = Object.fromEntries(board.frames().filter((f) => f.type === 'R').map((f) => [f.id, f.status]));
  assert.deepEqual(byId, { 1: 200, 2: 0, 3: 400 });
});

test('a trip-start answer with the code opens the town, after the board got its answer', async () => {
  const { board, serial, bridge, codes } = setup({ answers: { 'trip-start': { status: 201, body: '{"trip_id":5,"code":"K7M2QX","url":"https://x/?trip=K7M2QX"}' } } });
  await bridge.connect(serial);
  board.feed(request({ id: 4, action: 'trip-start' }));
  await tick();
  assert.deepEqual(codes, ['K7M2QX']);
  assert.ok(board.frames().some((f) => f.type === 'R' && f.id === 4 && f.status === 201));
});

test('no code for other answers, a refused start, or a request seen twice while it is in flight', async () => {
  const { board, serial, bridge, codes, calls } = setup({ answers: { 'trip-start': { status: 409, body: '{"error":"trip_exists","code":"K7M2QX"}' } } });
  await bridge.connect(serial);
  board.feed(request({ id: 4, action: 'trip-start' }) + request({ id: 4, action: 'trip-start' }));
  await tick();
  assert.deepEqual(codes, []);
  assert.equal(calls.length, 1);
});

test('unplugging the board ends in disconnected and a later disconnect() is harmless', async () => {
  const { board, serial, bridge, states } = setup();
  await bridge.connect(serial);
  board.end();
  await tick();
  assert.equal(states.at(-1)[0], 'disconnected');
  await bridge.disconnect();
  assert.equal(states.at(-1)[0], 'disconnected');
});

test('a cancelled port picker is not an error state', async () => {
  const { bridge, states } = setup();
  const serial = { requestPort: async () => { throw new DOMException('No port selected', 'NotFoundError'); }, addEventListener() {} };
  assert.equal(await bridge.connect(serial), false);
  assert.equal(states.at(-1)?.[0] ?? 'idle', 'idle');
});

test('replugged: resume() reopens the board the user already chose, without the picker, and only while closed', async () => {
  const { board, serial, bridge, states } = setup();
  await bridge.connect(serial);
  board.end();
  await tick();
  assert.equal(states.at(-1)[0], 'disconnected');
  const again = fakePort();
  const granted = { getPorts: async () => [{ getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 }) }, Object.assign(again.port, { getInfo: () => ({ ...USB_FILTER }) })],
    requestPort: async () => { throw new Error('no picker on resume'); }, addEventListener() {} };
  assert.equal(await bridge.resume(granted), true);
  assert.deepEqual(again.log.slice(0, 2), [['open', { baudRate: BAUD }], ['signals', { dataTerminalReady: false, requestToSend: false }]]);
  assert.equal(states.at(-1)[0], 'waiting');
  assert.equal(await bridge.resume(granted), false);
});

test('resume() with no granted board is a quiet no', async () => {
  const { bridge, states } = setup();
  assert.equal(await bridge.resume({ getPorts: async () => [], addEventListener() {} }), false);
  assert.equal(await bridge.resume({}), false);
  assert.equal(states.length, 0);
});
