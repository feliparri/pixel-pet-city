// The USB bridge (docs/usb-link.md): the page becomes the board's network. It opens the board's USB serial port (Web Serial, desktop Chrome/Edge), says hello, and forwards every
// signed trip request the board prints to the trip API with exactly the headers the board gave, then writes the answer back. The page never sees the device secret.
import { encodeFrame, decodeFrame, BODY_MAX, LINE_MAX } from './usblink.js';
import { normalizeTripCode } from './trip-code.js';

export const USB_FILTER = { usbVendorId: 0x303a, usbProductId: 0x1001 };     // Espressif's USB-Serial-JTAG: the ESP32-S3's own USB port
export const BAUD = 115200;                                                  // ignored by USB-Serial-JTAG, but open() wants one
const HELLO_MS = 2000;                                                       // the board counts the page as there for 5 s after its last hello or keepalive
const CHUNK = 512, CHUNK_GAP_MS = 5;                                         // the board's receive buffer is finite: a big answer goes out in pieces
const ACTIONS = new Set(['device-register', 'trip-start', 'trip-status', 'trip-recall', 'trip-return', 'trip-ack']);   // the board's endpoints, nothing else

const te = new TextEncoder();
const td = new TextDecoder();

/**
 * `base`: the trip API's URL without the action. `fetch`, `now()`, `sleep(ms)` and the timer (`every(fn, ms)` / `stopEvery(id)`) are injectable for tests.
 * `onState(state, info)`: 'waiting' (open, no answer yet), 'connected' (info: { device, fw, tripState }), 'disconnected', 'failed'.
 * `onTripCode(code)`: a trip-start answer carried the code (called after the board got its answer).
 */
export function createBridge({ base, fetch: fetchFn = (...a) => fetch(...a), now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), every = setInterval, stopEvery = clearInterval, onState = () => {}, onTripCode = () => {} }) {
  let port = null, writer = null, reader = null, timer = 0, greeted = false, chain = Promise.resolve();
  const inflight = new Set();

  const state = (s, info) => onState(s, info);
  const unix = () => Math.floor(now() / 1000);

  function send(msg) {
    chain = chain.then(async () => {
      if (!writer) return;
      const bytes = te.encode(encodeFrame(msg));
      for (let i = 0; i < bytes.length; i += CHUNK) {
        await writer.write(bytes.subarray(i, i + CHUNK));
        if (i + CHUNK < bytes.length) await sleep(CHUNK_GAP_MS);
      }
    }).catch(() => {});                                                      // a closed port: the read loop reports it
    return chain;
  }

  async function forward(q) {
    if (inflight.has(q.id)) return;                                          // the board asks again when an answer is slow: one call at a time per id
    inflight.add(q.id);
    let status = 0, body = new Uint8Array(0), code = null;
    try {
      if (!ACTIONS.has(q.action)) {
        status = 400, body = te.encode('{"error":"unknown_action"}');
      } else {
        const headers = { 'content-type': 'application/json' };
        if (q.auth) Object.assign(headers, { 'x-device-id': q.auth.device, 'x-timestamp': String(q.auth.ts), 'x-signature': q.auth.sig });
        const res = await fetchFn(`${base}/${q.action}`, { method: 'POST', headers, body: q.body, cache: 'no-store', credentials: 'omit' });
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length <= BODY_MAX) {                                      // an answer the board could not take is no answer
          status = res.status, body = bytes;
          if (q.action === 'trip-start' && (status === 200 || status === 201)) code = normalizeTripCode(JSON.parse(td.decode(bytes)).code);
        }
      }
    } catch { /* no network, or an answer that does not read: status stays 0 (or the code stays null) */ }
    inflight.delete(q.id);
    await send({ type: 'R', id: q.id, status, body });
    if (code) onTripCode(code);
  }

  function onLine(line) {
    const f = decodeFrame(line);
    if (!f) return;                                                          // a log line, or a frame that failed its crc
    if (f.type === 'B') {
      greeted = true;
      state('connected', { device: f.device, fw: f.fw, tripState: f.state });
    } else if (f.type === 'Q') {
      forward(f);
    }
  }

  async function readLoop(p) {
    let buf = '';
    try {
      reader = p.readable.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += td.decode(value, { stream: true });
        for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
          onLine(buf.slice(0, i));
          buf = buf.slice(i + 1);
        }
        if (buf.length > 2 * LINE_MAX) buf = '';                             // no line end in sight: not a frame
      }
    } catch { /* unplugged: the stream errors */ }
    if (port === p) await shut();
  }

  async function shut() {
    const p = port;
    port = null;
    if (timer) stopEvery(timer), timer = 0;
    greeted = false;
    try { reader?.releaseLock(); } catch { /* already released */ }
    try { writer?.releaseLock(); } catch { /* already released */ }
    reader = writer = null;
    try { await p?.close(); } catch { /* gone already */ }
    if (p) state('disconnected');
  }

  const bridge = {
    /** One hello (until the board answers) or keepalive; the timer calls it. */
    tick() { send({ type: greeted ? 'K' : 'H', unix: unix() }); },
    /** Ask for the board's port and start. False when nothing was chosen or it could not be opened. */
    async connect(serial) {
      let p;
      try {
        p = await serial.requestPort({ filters: [USB_FILTER] });
      } catch {
        return false;                                                        // the picker was closed: nothing happened
      }
      return bridge.attach(p, serial);
    },
    /** The board was plugged in again: reopen a board port this page was already allowed to use (no picker). False when one is open already or none is granted. */
    async resume(serial) {
      if (port || typeof serial?.getPorts !== 'function') return false;
      let ports = [];
      try { ports = await serial.getPorts(); } catch { return false; }
      const p = ports.find((x) => {
        const i = x.getInfo?.() ?? {};
        return i.usbVendorId === USB_FILTER.usbVendorId && i.usbProductId === USB_FILTER.usbProductId;
      });
      return p && !port ? bridge.attach(p, serial) : false;
    },
    /** Open a port the user chose and start. */
    async attach(p, serial) {
      try {
        await p.open({ baudRate: BAUD });
        // The ESP32-S3's USB-Serial-JTAG reads DTR/RTS like a download circuit: RTS toggling while DTR is set resets the chip and some sequences enter the bootloader.
        // Drop both at once, right after open and before the first byte, so the board keeps running.
        await p.setSignals({ dataTerminalReady: false, requestToSend: false });
      } catch {
        state('failed');
        try { await p.close(); } catch { /* not open */ }
        return false;
      }
      port = p;
      writer = p.writable.getWriter();
      greeted = false;
      serial?.addEventListener?.('disconnect', (e) => { if (e.target === p || e.port === p) shut(); });
      state('waiting');
      bridge.tick();
      timer = every(bridge.tick, HELLO_MS);
      readLoop(p);
      return true;
    },
    async disconnect() {
      try { await reader?.cancel(); } catch { /* closed */ }
      await shut();
    },
    get open() { return port !== null; },
  };
  return bridge;
}
