import test from 'node:test';
import assert from 'node:assert/strict';
import { guardFrame } from '../src/frame-guard.js';

globalThis.document ??= { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };      // the renderers only touch it to make offscreen canvases
const { createTownRenderer } = await import('../src/hd2d/renderer.js');

function loop(step, opts) {
  const queue = [];
  const frame = guardFrame(step, (f) => queue.push(f), opts);
  return { frame, queue, run(n) { for (let i = 0; i < n && queue.length; i++) queue.shift()(i * 16); } };
}

test('a frame that throws does not end the loop', () => {
  const seen = [];
  const l = loop((t) => { seen.push(t); if (t === 16) throw new Error('boom'); }, { report: () => {} });
  l.frame(0);
  l.run(5);
  assert.deepEqual(seen, [0, 0, 16, 32, 48, 64]);
  assert.equal(l.queue.length, 1, 'the next frame is always asked for');
});

test('step returning false ends the loop (the town was closed)', () => {
  const l = loop(() => false);
  l.frame(0);
  assert.equal(l.queue.length, 0);
});

test('the same error is reported once, and distinct ones no more than max in all', () => {
  const reports = [];
  const l = loop(() => { throw new Error('same'); }, { report: (e) => reports.push(e.message) });
  l.frame(0); l.run(100);
  assert.deepEqual(reports, ['same']);
  let i = 0;
  const l2 = loop(() => { throw new Error(`e${i++}`); }, { report: (e) => reports.push(e.message), max: 3 });
  reports.length = 0; l2.frame(0); l2.run(20);
  assert.equal(reports.length, 3);
});

test('a reporter that throws does not stop the loop either', () => {
  const l = loop(() => { throw new Error('x'); }, { report: () => { throw new Error('reporter'); } });
  l.frame(0);
  l.run(3);
  assert.equal(l.queue.length, 1);
});

function fakeCanvas() {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const c = { style: {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) };
  let w = 0, sets = 0;
  Object.defineProperty(c, 'width', { get: () => w, set: (v) => { w = v; sets++; } });
  c.height = 0;
  return { c, sets: () => sets };
}

test('the flat renderer is laid out afresh after a frame it could not finish', () => {
  const { c, sets } = fakeCanvas();
  const r = createTownRenderer({ canvas: c, sprites: {}, font: {}, flat: true });
  r.resize(800, 400, 1);
  const bad = { area: 'town', me: { walker: { pos() { throw new Error('bad entity'); } } }, others: [] };
  const before = sets();
  assert.throws(() => r.draw(bad, 0), /bad entity/);
  const draw = () => { try { r.draw(bad, 16); } catch { /* expected */ } };
  draw();
  assert.ok(sets() > before, 'canvas.width is set again, which resets the context state left by a half-drawn frame');
});
