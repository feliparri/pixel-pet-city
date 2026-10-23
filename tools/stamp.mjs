// Cache-busting without a build step: GitHub Pages serves modules with a cache of several minutes, so after an update players could mix
// old and new modules. This stamps a version (a hash of every module, the stylesheet and the config) into
//   - an import map in index.html and shot.html: every module's URL gets ?v=<hash>, so the code in src/ stays plain
//   - the entry script and the stylesheet links
//   - the page's CSP (the import map is an inline script, allowed by its hash)
// Run it before committing a change to anything under src/, style.css or config.js:  node tools/stamp.mjs
// `node tools/stamp.mjs --check` exits 1 when the stamp is stale (tests/stamp.test.js runs the same check).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'shot.html'];
const ENTRIES = /((?:src|href)="(?:style\.css|src\/main\.js|src\/shot\.js))(\?v=[0-9a-f]+)?"/g;

function modules(dir = join(root, 'src')) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? modules(p) : name.endsWith('.js') ? [p] : [];
  }).sort();
}

export function version() {
  const h = createHash('sha256');
  for (const f of [...modules(), join(root, 'config.js'), join(root, 'style.css')]) h.update(`${relative(root, f)}\n`).update(readFileSync(f));
  return h.digest('hex').slice(0, 10);
}

export function importMap(v) {
  const imports = {};
  for (const f of [...modules(), join(root, 'config.js')]) {
    const rel = relative(root, f).split(sep).join('/');
    imports[`./${rel}`] = `./${rel}?v=${v}`;
  }
  return `\n${JSON.stringify({ imports }, null, 2)}\n`;
}

/** The stamped text of a page. */
export function stampPage(html, v) {
  const body = importMap(v);
  const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
  let out = html.replace(/(<!-- stamp:start -->\n)[\s\S]*?(\n\s*<!-- stamp:end -->)/, (_, a, b) => `${a}  <script type="importmap">${body}</script>${b}`);
  out = out.replace(ENTRIES, (_, f) => `${f}?v=${v}"`);
  out = out.replace(/script-src 'self'(?: 'sha256-[A-Za-z0-9+/=]+')?/, `script-src 'self' ${hash}`);
  return out;
}

/** Stamps the pages; returns the names of the ones that changed (written only when `write`). */
export function stamp({ write = true } = {}) {
  const v = version(), changed = [];
  for (const name of PAGES) {
    const file = join(root, name), html = readFileSync(file, 'utf8'), next = stampPage(html, v);
    if (next !== html) { changed.push(name); if (write) writeFileSync(file, next); }
  }
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stale = stamp({ write: !process.argv.includes('--check') });
  if (process.argv.includes('--check')) { console.log(stale.length ? `stale: ${stale.join(', ')} (run node tools/stamp.mjs)` : 'stamp is current'); process.exit(stale.length ? 1 : 0); }
  console.log(stale.length ? `stamped ${stale.join(', ')} with v=${version()}` : `already current (v=${version()})`);
}
