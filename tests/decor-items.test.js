import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ??= { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };      // scene.js only makes offscreen canvases
const { decorItems } = await import('../src/hd2d/scene.js');
const { makeCamera } = await import('../src/hd2d/camera.js');

test('a decoration without a sprite is skipped instead of throwing', () => {
  const cam = makeCamera({ focusX: 100, focusY: 100, cx: 400, cy: 200 });
  const ok = { id: 'a', x: 100, y: 100, lift: 0, sprite: { width: 8, height: 8 }, lit: null, glows: [] };
  const bad = { id: 'b', x: 120, y: 100, lift: 0, sprite: undefined, lit: null, glows: [] };
  const items = decorItems({ lights: [], name: 'town' }, cam, 0, { w: 800, h: 400 }, [ok, bad]);
  assert.equal(items.length, 1);
});
