#!/usr/bin/env node
// Serve the town on the local network and collect what ?perf=1&log=1 posts, so a phone can be measured without reading its screen.
//   node tools/perf-serve.mjs [--port 8000] [--out perf-log.jsonl] [--host 0.0.0.0]
// On the phone (same Wi-Fi): http://<this computer>:8000/?local=1&dev=1&perf=1&log=1&autoroom=FOCA-LUNA-42
// Every post is one line of JSON appended to the out file. Development only: it serves this folder to the local network.
import { createServer } from 'node:http';
import { readFile, appendFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const port = Number(opt('--port', 8000)), out = opt('--out', 'perf-log.jsonl'), host = opt('--host', '0.0.0.0');
const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/perf-log') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 64e3) break; }
      await appendFile(out, JSON.stringify({ at: new Date().toISOString(), from: req.socket.remoteAddress, ...JSON.parse(body) }) + '\n');
      res.writeHead(204).end();
      return;
    }
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(port, host, () => console.log(`serving ${root} on :${port}, perf posts -> ${out}`));
