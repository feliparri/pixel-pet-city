import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { lieScale, zzzAt, ZZZ_ROWS, LIE_SX, BREATH_MS, ZZZ_MS } from '../src/art/sleep.js';

test('the lying pose is the device\'s: 19/16 wide, 11/16 tall plus a breath of 1/16, every 3.6 s', () => {
  assert.equal(LIE_SX, 19 / 16);
  assert.equal(lieScale(0).sy, 11 / 16);
  assert.equal(lieScale(BREATH_MS / 2).sy, 12 / 16);
  assert.equal(lieScale(BREATH_MS).sy, 11 / 16, 'the breath repeats');
  for (let t = 0; t < 8000; t += 100) { const q = lieScale(t); assert.ok(q.sy >= 11 / 16 && q.sy <= 12 / 16 && q.sx === 19 / 16); }
});

test('two Zzz drift up and to the right, one after the other, the second a little bigger (device draw_cues)', () => {
  const a = zzzAt(0), b = zzzAt(700);
  assert.equal(a.length, 2);
  assert.deepEqual(a.map((z) => z.k), [0.75, 1], 'the first is at the start of its drift (small), the second half way through (big)');
  assert.ok(b[0].x > a[0].x && b[0].y < a[0].y, 'it drifts right and up');
  assert.ok(Math.abs((zzzAt(ZZZ_MS)[0].x - a[0].x)) < 1e-9, 'and starts over every 2.8 s');
  for (let t = 0; t < 6000; t += 50) for (const z of zzzAt(t)) assert.ok(z.y < -32 && z.x >= 11 && z.x <= 21 + 1e-9);
});

test('the Zzz sprite is the device\'s art/zzz.txt (12 x 14), and the pose comes from the repository above, when it is there', () => {
  assert.equal(ZZZ_ROWS.length, 14);
  assert.ok(ZZZ_ROWS.every((r) => r.length === 12));
  const dev = new URL('../../pixel-pet/art/zzz.txt', import.meta.url);
  if (!existsSync(dev)) return;
  const rows = readFileSync(dev, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  assert.deepEqual(rows, ZZZ_ROWS);
  const goal = readFileSync(new URL('../../pixel-pet/common/ui_goal.c', import.meta.url), 'utf8');
  assert.ok(goal.includes('rest(p, now_ms, 3600, 0, 19, 11)'), 'the posture numbers of the device');
});
