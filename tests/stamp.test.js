import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stamp, importMap, stampPage, version } from '../tools/stamp.mjs';

test('the pages are stamped with the current version (run node tools/stamp.mjs after changing src/, style.css or config.js)', () => {
  assert.deepEqual(stamp({ write: false }), []);
});

test('every module is in the import map with the version, and the CSP allows exactly that inline script', () => {
  const v = version();
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const f of ['./src/main.js', './src/map.js', './src/art/bake.js', './src/daynight.js', './config.js']) assert.equal(map[f], `${f}?v=${v}`);
  assert.match(html, new RegExp(`src="src/main.js\\?v=${v}"`));
  assert.match(html, new RegExp(`href="style.css\\?v=${v}"`));
  const hash = createHash('sha256').update(importMap(v)).digest('base64');
  assert.ok(html.includes(`script-src 'self' 'sha256-${hash}'`));
});

test('stamping is idempotent and replaces an older version', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(stampPage(html, version()), html);
  const old = stampPage(html, 'abcdef0123');
  assert.notEqual(old, html);
  assert.equal(stampPage(old, version()), html);
});
