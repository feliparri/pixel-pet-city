#!/usr/bin/env node
// A fake board: the device side of docs/trip-api.md (register, start, status, recall, return, ack) with a real travel package built by the
// game (tests/fixtures/*.bin, written by `make city-fixtures` in pixel-pet). Use it to test the deployed functions and the town end to end.
//
//   node tools/fake-board.mjs run [--fixture plain|keepsake] [--entrance parachute|blue_bolt] [--pause 30] [--base URL]
//       registers (once), starts a trip, prints the code, URL and a QR-less hint, waits for the browser to claim it, then waits --pause seconds
//       (or Enter) and recalls, downloads the return package, checks it and acks.
//   node tools/fake-board.mjs register | start | status | recall | return | ack     the same steps one by one (state in .fake-board.json)
//
// Options: --state FILE (default .fake-board.json), --base https://<ref>.supabase.co/functions/v1 (default: the project in config.js).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { signRequest, toHex } from '../supabase/functions/_shared/crypto.js';
import { parsePackage, toBase64, fromBase64, petView } from '../supabase/functions/_shared/travel-package.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** The board's side. `io`: { fetch, base, now(), load(), save(state), log(...) } so a test can run it against in-memory handlers. */
export function createBoard(io) {
  let state = io.load() || {};
  const persist = () => io.save(state);
  async function call(fn, obj) {
    const body = new TextEncoder().encode(JSON.stringify(obj));
    const headers = await signRequest({ deviceId: state.deviceId, secretHex: state.secretHex, fn, body, ts: Math.floor(io.now() / 1000) });
    const res = await io.fetch(`${io.base}/${fn}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  }
  const need = (r, ...ok) => {
    if (!ok.includes(r.status)) throw new Error(`HTTP ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return {
    get state() { return state; },
    async register() {
      if (!state.deviceId) { state = { ...state, deviceId: toHex(randomBytes(16)), secretHex: toHex(randomBytes(32)) }; persist(); }
      const res = await io.fetch(`${io.base}/device-register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device_id: state.deviceId, secret: state.secretHex }) });
      return need({ status: res.status, body: await res.json() }, 200, 201);
    },
    async start({ fixture = 'plain', entrance } = {}) {
      const pkg = new Uint8Array(readFileSync(here(`../tests/fixtures/${fixture}.bin`)));
      const parsed = parsePackage(pkg);
      if (!parsed.ok) throw new Error(`fixture refused: ${parsed.status}`);
      const out = need(await call('trip-start', { package: toBase64(pkg), ...(entrance ? { entrance } : {}) }), 200, 201);
      state = { ...state, tripId: out.trip_id, sentSeq: parsed.pkg.seq, code: out.code };
      persist();
      return { ...out, pet: petView(parsed.pkg).name };
    },
    status: async () => need(await call('trip-status', { trip_id: state.tripId }), 200),
    recall: async () => need(await call('trip-recall', { trip_id: state.tripId }), 200),
    async fetchReturn() {
      const out = need(await call('trip-return', { trip_id: state.tripId }), 200);
      const bytes = fromBase64(out.package);
      const parsed = bytes && parsePackage(bytes);
      if (!parsed || !parsed.ok) throw new Error(`the return package is refused: ${parsed && parsed.status}`);
      const { pkg } = parsed;
      if (pkg.dir !== 1 || pkg.tripId !== state.tripId || pkg.seq !== state.sentSeq + 1 || out.seq !== pkg.seq) throw new Error('the return package does not match the trip');
      state = { ...state, returnSeq: pkg.seq };
      persist();
      return { seq: pkg.seq, bytes: bytes.length, pet: petView(pkg).name };
    },
    ack: async () => need(await call('trip-ack', { trip_id: state.tripId, seq: state.returnSeq }), 200),
  };
}

// ---- CLI ----------------------------------------------------------------------------------------------------------------------
function arg(args, name, dflt) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const enter = (msg) => new Promise((r) => { const rl = createInterface({ input: process.stdin }); process.stdout.write(msg); rl.once('line', () => { rl.close(); r(); }); });

async function main(args) {
  const cmd = args[0];
  const statePath = arg(args, 'state', '.fake-board.json');
  let base = arg(args, 'base');
  if (!base) {
    const cfg = (await import('../config.js')).default;
    base = `${cfg.supabaseUrl}/functions/v1`;
  }
  const io = {
    fetch, base, now: Date.now, log: console.log,
    load: () => (existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null),
    save: (s) => writeFileSync(statePath, JSON.stringify(s, null, 2), { mode: 0o600 }),
  };
  const board = createBoard(io);
  const show = (label, v) => console.log(`${label}: ${JSON.stringify(v)}`);
  switch (cmd) {
    case 'register': return show('register', await board.register());
    case 'start': return show('start', await board.start({ fixture: arg(args, 'fixture'), entrance: arg(args, 'entrance') }));
    case 'status': return show('status', await board.status());
    case 'recall': return show('recall', await board.recall());
    case 'return': return show('return', await board.fetchReturn());
    case 'ack': return show('ack', await board.ack());
    case 'run': {
      show('register', await board.register());
      const s = await board.start({ fixture: arg(args, 'fixture', 'plain'), entrance: arg(args, 'entrance') });
      show('start', s);
      console.log(`\nOpen ${s.url}  (code ${s.code}) in a browser. Waiting for it to be claimed...`);
      while (!(await board.status()).claimed) await sleep(3);
      console.log('Claimed: the pet is in the town.');
      const pause = Number(arg(args, 'pause', 0));
      if (pause > 0) { console.log(`Recalling in ${pause} s...`); await sleep(pause); } else await enter('Press Enter to recall the pet... ');
      show('recall', await board.recall());
      show('return', await board.fetchReturn());
      show('ack', await board.ack());
      return console.log('\nThe pet is home. Trip closed.');
    }
    default:
      console.log('usage: fake-board.mjs run|register|start|status|recall|return|ack [--fixture plain|keepsake] [--entrance id] [--pause s] [--base URL] [--state FILE]');
      process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
