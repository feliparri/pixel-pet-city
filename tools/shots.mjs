// Renders the preview PNGs under docs/ with the page itself: serves the folder, opens shot.html in headless Chrome and screenshots it.
//   node tools/shots.mjs            (set CHROME=/path/to/chrome if it is not in the usual place)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.error('No Chrome found: set CHROME=/path/to/chrome'); process.exit(1); }

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const body = await readFile(join(root, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;

const SHOTS = [
  ['town-day', 'shot=town&hour=13', 1536, 1408], ['town-dusk', 'shot=town&hour=18.5', 1536, 1408], ['town-night', 'shot=town&hour=22', 1536, 1408],
  ['shop', 'shot=shop&hour=13', 896, 768], ['park', 'shot=park&hour=13', 1536, 512], ['seek', 'shot=seek&hour=13', 672, 864], ['coop', 'shot=coop&hour=13', 672, 864], ['view-plaza-night', 'shot=view&hour=21.5', 672, 864], ['view-plaza-day', 'shot=view&hour=12', 672, 864],
];
const run = (args) => new Promise((resolve) => {
  const p = spawn(CHROME, args, { stdio: 'ignore' });
  const timer = setTimeout(() => p.kill('SIGKILL'), 40000);                 // the server must keep answering, so no spawnSync here
  p.on('exit', (code) => { clearTimeout(timer); resolve(code); });
});
for (const [name, query, w, h] of SHOTS) {
  const out = join(root, 'docs', `preview-${name}.png`);
  const profile = mkdtempSync(join(tmpdir(), 'shots-'));
  const code = await run(['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, '--virtual-time-budget=4000', `--screenshot=${out}`, `http://127.0.0.1:${port}/shot.html?${query}`]);
  console.log(code === 0 ? `wrote ${out}` : `FAILED ${name} (${code})`);
}
server.close();
