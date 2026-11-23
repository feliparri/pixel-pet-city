import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeter, perfLines } from '../src/perf.js';

test('the meter averages the frame interval into frames per second', () => {
  const m = createMeter();
  for (let i = 0; i <= 200; i++) m.tick(i * 50);
  const r = m.read();
  assert.ok(Math.abs(r.fps - 20) < 0.5, `fps ${r.fps}`);
  assert.ok(r.worst >= 49 && r.worst <= 51);
});

test('the meter ignores the long gap of a hidden tab', () => {
  const m = createMeter();
  for (let i = 0; i <= 100; i++) m.tick(i * 20);
  m.tick(100 * 20 + 5000);
  assert.ok(Math.abs(m.read().fps - 50) < 1);
});

test('the meter keeps a moving average of each span', () => {
  const m = createMeter();
  m.mark('draw', 10);
  for (let i = 0; i < 300; i++) m.mark('draw', 30);
  assert.ok(Math.abs(m.read().spans.draw - 30) < 0.1);
});

const town = { fps: 24.4, worst: 120, spans: { logic: 1.2, draw: 30.5 } };
const view = { w: 1266, h: 585, dpr: 3 };

test('the box shows the HD-2D level and where a frame goes', () => {
  const lines = perfLines({ town, view, hd: { mode: 'hd', level: 2, res: 0.65, parts: { ground: 8, items: 6, fx: 15, overlay: 1.5 }, autoFlat: false } });
  assert.equal(lines[0], 'HD-2D nivel 2 (res 0.65)');
  assert.ok(lines.some((l) => l.includes('efectos 15.0')));
  assert.ok(lines.some((l) => l.includes('lienzo 1266x585')));
});

test('after the automatic fallback the box says so and keeps the numbers from the fall', () => {
  const lines = perfLines({ town, view, hd: { mode: 'flat', level: 4, res: 0.5, parts: { ground: 1, items: 1, fx: 1, overlay: 1 }, autoFlat: true, atFall: { level: 4, fps: 21.3 } } });
  assert.equal(lines[0], 'plana (caída automática)');
  assert.ok(lines.includes('al caer: nivel 4, 21.3 fps'));
  assert.ok(!lines.some((l) => l.startsWith('suelo')));
});

test('skip only takes known parts, and only together with perf=1', async () => {
  const { perfSkip } = await import('../src/perf.js');
  assert.deepEqual([...perfSkip('?perf=1&skip=suelo,efectos,nada')], ['suelo', 'efectos']);
  assert.equal(perfSkip('?skip=suelo').size, 0);
  assert.ok(perfLines({ town, view, hd: { mode: 'hd', level: 4, res: 0.5, parts: {}, skip: ['suelo'] } }).includes('sin: suelo'));
});

test('the log posts the box lines and never throws into the town', async () => {
  const { startPerfLog } = await import('../src/perf.js');
  globalThis.navigator ??= { userAgent: 'test' };
  const sent = [];
  const stop = startPerfLog(() => ({ town, view, hd: { mode: 'hd', level: 1, res: 0.8, parts: {} } }), { every: 5, post: (b) => { sent.push(JSON.parse(b)); return Promise.reject(new Error('offline')); } });
  await new Promise((r) => setTimeout(r, 30));
  stop();
  assert.ok(sent.length >= 2);
  assert.equal(sent[0].lines[0], 'HD-2D nivel 1 (res 0.8)');
  const stop2 = startPerfLog(() => { throw new Error('boom'); }, { every: 5, post: () => {} });
  await new Promise((r) => setTimeout(r, 20));
  stop2();
});
