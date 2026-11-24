import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuadBatch, createRecorder, glWanted, FLOATS } from '../src/hd2d/glquads.js';
import { perfLines } from '../src/perf.js';

const img = (w, h, extra = {}) => ({ width: w, height: h, ...extra });
const vert = (b, i) => Array.from(b.data.subarray(i * FLOATS, (i + 1) * FLOATS));

test('glWanted is only the explicit ?gl=1', () => {
  assert.equal(glWanted('?gl=1'), true);
  assert.equal(glWanted('?local=1&gl=1&perf=1'), true);
  assert.equal(glWanted(''), false);
  assert.equal(glWanted('?gl=0'), false);
  assert.equal(glWanted('?gl=true'), false);
});

test('a plain drawImage becomes two triangles covering the destination with the full texture', () => {
  const b = createQuadBatch();
  b.drawImage(img(16, 8), 10, 20, 32, 16);
  assert.equal(b.quads, 1);
  assert.deepEqual(vert(b, 0), [10, 20, 0, 0, 1]);
  assert.deepEqual(vert(b, 1), [42, 20, 1, 0, 1]);
  assert.deepEqual(vert(b, 2), [10, 36, 0, 1, 1]);
  assert.deepEqual(vert(b, 5), [42, 36, 1, 1, 1]);
});

test('the 9-argument form maps the source rectangle to texture coordinates', () => {
  const b = createQuadBatch();
  b.drawImage(img(100, 200), 25, 50, 50, 100, 0, 0, 10, 10);
  assert.deepEqual(vert(b, 0), [0, 0, 0.25, 0.25, 1]);
  assert.deepEqual(vert(b, 5), [10, 10, 0.75, 0.75, 1]);
});

test('translate and scale compose like the 2D context, and save/restore bring the state back', () => {
  const b = createQuadBatch();
  b.save(); b.translate(100, 50); b.scale(2, 3);
  b.st.alpha = 0.5;
  b.drawImage(img(4, 4), 1, 1, 2, 2);
  assert.deepEqual(vert(b, 0), [102, 53, 0, 0, 0.5]);        // (100 + 2 * 1, 50 + 3 * 1)
  assert.deepEqual(vert(b, 5), [106, 59, 1, 1, 0.5]);        // (100 + 2 * 3, 50 + 3 * 3)
  b.restore();
  assert.deepEqual(b.matrix(), [1, 0, 0, 1, 0, 0]);
  assert.equal(b.st.alpha, 1);
});

test('a mirrored sprite (translate + scale(-1, 1)) lands where the 2D context puts it', () => {
  const b = createQuadBatch();
  b.save(); b.translate(30, 0); b.scale(-1, 1); b.drawImage(img(8, 8), 0, 0, 10, 10); b.restore();
  assert.deepEqual(vert(b, 0).slice(0, 2), [30, 0]);          // the left texel column is on the right edge
  assert.deepEqual(vert(b, 1).slice(0, 2), [20, 0]);
});

test('runs: quads of one image and filter share a draw, a change of either starts a new one', () => {
  const b = createQuadBatch(), a = img(4, 4), c = img(4, 4);
  for (let i = 0; i < 5; i++) b.drawImage(a, 0, i, 4, 1, 0, i, 4, 1);
  b.drawImage(c, 0, 0);
  b.st.smooth = true; b.drawImage(c, 0, 0);
  b.st.smooth = false; b.drawImage(a, 0, 0);
  assert.equal(b.quads, 8);
  assert.deepEqual(b.runs.map((r) => [r.img === a ? 'a' : 'c', r.smooth, r.first / 6, r.count / 6]), [['a', false, 0, 5], ['c', false, 5, 1], ['c', true, 6, 1], ['a', false, 7, 1]]);
});

test('empty, invisible and zero-size draws record nothing; the buffer grows past its first size', () => {
  const b = createQuadBatch();
  b.drawImage(img(0, 0), 0, 0); b.drawImage(img(4, 4), 0, 0, 0, 5); b.st.alpha = 0; b.drawImage(img(4, 4), 0, 0);
  assert.equal(b.quads, 0);
  b.st.alpha = 1;
  const a = img(2, 2);
  for (let i = 0; i < 1000; i++) b.drawImage(a, i, 0);
  assert.equal(b.quads, 1000);
  assert.deepEqual(vert(b, 6 * 999).slice(0, 2), [999, 0]);
  b.reset();
  assert.equal(b.quads, 0);
  assert.equal(b.runs.length, 0);
});

function fakeReal() {
  const log = [];
  const real = new Proxy({ canvas: { width: 10, height: 10 } }, {
    get: (t, p) => (p in t ? t[p] : (...a) => { log.push([p, ...a]); }),
    set: (t, p, v) => { log.push(['set', p, v]); t[p] = v; return true; },
  });
  return { real, log };
}

test('the recorder keeps drawImage, state and the default blend off the real context', () => {
  const b = createQuadBatch(), { real, log } = fakeReal();
  let flushes = 0;
  const r = createRecorder(b, real, { flush: () => flushes++ });
  r.begin();
  const c = r.ctx;
  c.imageSmoothingEnabled = false; c.globalCompositeOperation = 'source-over';
  c.save(); c.translate(5, 5); c.globalAlpha = 0.5; c.drawImage(img(4, 4), 0, 0); c.restore();
  assert.equal(c.globalAlpha, 1);
  r.endItem();
  assert.equal(b.quads, 1);
  assert.equal(flushes, 0);
  assert.deepEqual(log, []);
});

test('the first fill flushes the batch, carries the state over and passes the rest through until endItem', () => {
  const b = createQuadBatch(), { real, log } = fakeReal();
  let flushes = 0;
  const r = createRecorder(b, real, { flush: () => { flushes++; log.push(['flush', b.quads]); } });
  r.begin();
  const c = r.ctx;
  c.drawImage(img(4, 4), 0, 0);
  c.save(); c.translate(7, 9); c.globalAlpha = 0.25;
  c.fillStyle = 'red'; c.fillRect(0, 0, 2, 2);                          // not a drawImage: pass through
  c.drawImage(img(4, 4), 1, 1);                                          // after that, images go to the real context too
  c.restore();
  assert.equal(flushes, 1);
  assert.equal(r.passing, true);
  r.endItem();
  assert.equal(r.passing, false);
  assert.equal(b.quads, 1);                                              // only the first image was recorded
  const names = log.map((l) => l[0]);
  assert.deepEqual(names.slice(0, 3), ['flush', 'save', 'setTransform']);
  assert.deepEqual(log[2].slice(1), [1, 0, 0, 1, 7, 9]);
  assert.ok(log.some((l) => l[0] === 'set' && l[1] === 'globalAlpha' && l[2] === 0.25));
  assert.ok(log.some((l) => l[0] === 'fillRect'));
  assert.ok(log.some((l) => l[0] === 'drawImage'));
  assert.equal(names.at(-1), 'restore');                                 // the real context ends balanced
});

test('a volatile canvas (its pixels change between draws) is drawn on the real context, a blank one is skipped', () => {
  const b = createQuadBatch(), { real, log } = fakeReal();
  const r = createRecorder(b, real, { flush: () => {} });
  r.begin();
  r.ctx.drawImage(img(4, 4, { _volatile: true }), 0, 0);
  r.endItem();
  assert.equal(b.quads, 0);
  assert.ok(log.some((l) => l[0] === 'drawImage'));
  log.length = 0;
  r.ctx.drawImage(img(0, 0), 0, 0);
  r.endItem();
  assert.equal(log.length, 0);
});

test('perfLines names WebGL in the mode line when it is on', () => {
  const town = { fps: 60, worst: 20, spans: { logic: 1, draw: 2 } }, view = { w: 640, h: 242, dpr: 1 };
  const hd = { mode: 'hd', level: 4, res: 0.5, parts: { ground: 1, items: 2, fx: 3, overlay: 0.5 } };
  assert.equal(perfLines({ town, view, hd })[0], 'HD-2D nivel 4 (res 0.5)');
  const on = perfLines({ town, view, hd: { ...hd, gl: { on: true, quads: 390, calls: 120, uploads: 0 } } });
  assert.equal(on[0], 'HD-2D nivel 4 (res 0.5) WebGL');
  assert.ok(on.some((l) => l.includes('390 quads')));
  assert.equal(perfLines({ town, view, hd: { ...hd, gl: { on: false, quads: 0, calls: 0, uploads: 0 } } })[0], 'HD-2D nivel 4 (res 0.5)');
});
