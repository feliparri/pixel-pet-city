import test from 'node:test';
import assert from 'node:assert/strict';
import { createStars, starsKey } from '../src/stars.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

test('stars are counted per pet name and survive a reload', () => {
  const st = mem();
  const a = createStars(st, 'Mochi');
  assert.equal(a.get(), 0);
  a.add(3); a.add(1);
  assert.equal(createStars(st, 'Mochi').get(), 4);
  assert.equal(createStars(st, 'Luna').get(), 0);
  assert.equal(starsKey('Mo<chi>'), 'city.stars.Mochi', 'the name is sanitized like everywhere else');
});

test('stars ignore nonsense and cope with a missing or broken storage', () => {
  const st = mem();
  st.setItem(starsKey('Mochi'), 'banana');
  const a = createStars(st, 'Mochi');
  assert.equal(a.get(), 0);
  assert.equal(a.add(-5), 0); assert.equal(a.add(1.5), 0); assert.equal(a.add(NaN), 0);
  const broken = createStars({ getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } }, 'Mochi');
  assert.equal(broken.add(2), 2);
  assert.equal(createStars(null, 'Mochi').add(2), 2);
});
