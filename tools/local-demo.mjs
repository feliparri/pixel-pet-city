#!/usr/bin/env node
// Try the web trip with no Supabase at all: serves the town, runs the real trip handlers on an in-memory database behind /api/<function>,
// and starts one trip from a fixture (the board's side) so there is a code to open. Nothing leaves your machine.
//   node tools/local-demo.mjs [--port 8099] [--fixture plain|keepsake] [--entrance parachute|blue_bolt]
// Open the printed URL (add &dev=1&entrance=blue_bolt for the demo entrance). `curl -X POST localhost:8099/demo/recall` is the board's recall.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../supabase/functions/trip/handlers.js';
import { memoryDb } from '../tests/trip-helpers.js';
import { createBoard } from './fake-board.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const port = Number(opt('port', 8099));
const root = fileURLToPath(new URL('..', import.meta.url));
const db = memoryDb();
const deps = { db, nowS: () => Math.floor(Date.now() / 1000), randomBytes: (n) => new Uint8Array(randomBytes(n)), uuid: randomUUID, townUrl: `http://localhost:${port}/` };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

// the page believes it talks to Supabase; this shim sends its function calls to /api instead (a demo-only file: it is not in the repo's pages)
const SHIM = "const f = window.fetch.bind(window); window.fetch = (u, i) => f(String(u).includes('/functions/v1/') ? '/api/' + String(u).split('/').pop() : u, i);\n";

const apiFetch = async (url, init) => {
  const fn = new URL(url).pathname.split('/').pop();
  const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const body = typeof init.body === 'string' ? new TextEncoder().encode(init.body) : init.body;
  const out = await handle(fn, { method: init.method, headers, body }, deps);
  return { status: out.status, json: async () => out.body };
};
let saved = null;
const board = createBoard({ fetch: apiFetch, base: 'http://x/api', now: Date.now, load: () => saved, save: (s) => { saved = s; }, log() {} });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const out = await handle(url.pathname.slice(5), { method: req.method, headers: Object.fromEntries(Object.entries(req.headers)), body: new Uint8Array(Buffer.concat(chunks)) }, deps);
      res.writeHead(out.status, { 'content-type': 'application/json' }).end(JSON.stringify(out.body));
      return;
    }
    if (url.pathname.startsWith('/demo/')) {
      const step = url.pathname.slice(6);
      const r = step === 'recall' ? await board.recall() : step === 'return' ? await board.fetchReturn() : step === 'ack' ? await board.ack() : step === 'status' ? await board.status() : null;
      res.writeHead(r ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify(r ?? { error: 'unknown step' }));
      return;
    }
    if (url.pathname === '/test-shim.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end(SHIM); return; }
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (rel === '/' || rel === '\\') rel = '/index.html';
    if (/^[/\\](supabase|tests|tools|docs|\.git)/.test(rel)) { res.writeHead(404).end(); return; }
    let data = await readFile(join(root, rel));
    if (rel === '/index.html') data = Buffer.from(data.toString().replace('<script type="module"', '<script src="test-shim.js"></script>\n  <script type="module"'));
    if (rel === '/config.js') data = Buffer.from("export default { supabaseUrl: 'https://localdemo.supabase.co', supabaseAnonKey: 'anon-key-of-the-local-demo-0000000000' };\n");
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(port, async () => {
  await board.register();
  const s = await board.start({ fixture: opt('fixture', 'plain'), entrance: opt('entrance') });
  console.log(`Town: http://localhost:${port}/?trip=${s.code}\nBoard steps: curl -X POST localhost:${port}/demo/recall | return | ack | status`);
});
