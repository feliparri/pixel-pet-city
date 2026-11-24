import test from 'node:test';
import assert from 'node:assert/strict';
import { albumGrid, cellLines, UNKNOWN_NAME } from '../src/fishing/album-grid.js';
import { createReward, createAlbumStore, scopedStorage } from '../src/fishing/reward.js';
import { FISH, ALBUM_KEY, FISH_STARS_KEY, FISH_STAR_CAP_PER_DAY, fishById } from '../src/fishing/rules.js';

const memory = (init = {}) => { const m = { ...init }; return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

test('album grid: all ten fish in order, caught ones with their numbers, the rest as ???', () => {
  const empty = albumGrid({});
  assert.equal(empty.cells.length, 10); assert.equal(empty.text, '0/10');
  assert.deepEqual(empty.cells.map((c) => c.id), FISH.map((f) => f.id));
  assert.ok(empty.cells.every((c) => !c.caught && c.label === UNKNOWN_NAME && c.count === 0));
  const g = albumGrid({ carpa: { count: 3, best: 54, first: 1 }, anguila: { count: 1, best: 120, first: 2 }, nope: { count: 9, best: 9, first: 0 } });
  assert.equal(g.text, '2/10');
  const carpa = g.cells.find((c) => c.id === 'carpa');
  assert.deepEqual([carpa.caught, carpa.label, carpa.count, carpa.best], [true, 'Carpa', 3, 54]);
  assert.deepEqual(cellLines(carpa), { count: 'x3', best: 'Mejor: 54 cm' });
  assert.deepEqual(cellLines(g.cells[0]), { count: '', best: '' });
  assert.equal(g.cells.find((c) => c.id === 'sardina').label, '???', 'a fish not caught keeps its name out');
  assert.equal(albumGrid(null).text, '0/10');
});

test('reward: a catch goes in the album and pays its stars to the counter', () => {
  const st = memory(), paid = [];
  const r = createReward({ storage: st, today: () => '2026-11-24', awardStars: (n) => paid.push(n), now: () => 1000 });
  const a = r.settle({ id: 'salmon', size: 70 });
  assert.deepEqual(a, { first: true, record: false, stars: 2, capped: false });
  assert.deepEqual(paid, [2]);
  const b = r.settle({ id: 'salmon', size: 80 });
  assert.deepEqual([b.first, b.record, b.stars], [false, true, 2]);
  assert.deepEqual(r.album().salmon, { count: 2, best: 80, first: 1000 });
  assert.ok(JSON.parse(st.m[ALBUM_KEY]).salmon, 'kept in the storage');
  assert.equal(JSON.parse(st.m[FISH_STARS_KEY]).n, 4);
  assert.deepEqual(r.settle(null), {}); assert.deepEqual(r.settle({ id: 'nope', size: 3 }), {});
});

test('reward: stars stop at the daily cap and the card is told', () => {
  const paid = [], r = createReward({ storage: memory(), today: () => 'd', awardStars: (n) => paid.push(n) });
  let last;
  for (let i = 0; i < 4; i++) last = r.settle({ id: 'esturion', size: 120 });                 // 3 stars each
  assert.deepEqual(paid, [3, 2], 'the second one is cut to what is left of the cap');
  assert.equal(paid.reduce((a, b) => a + b, 0), FISH_STAR_CAP_PER_DAY);
  assert.deepEqual([last.stars, last.capped], [0, true]);
  assert.equal(r.album().esturion.count, 4, 'the album still counts the catch');
  const first = createReward({ storage: memory(), today: () => 'd', awardStars() {} }).settle({ id: 'sardina', size: 12 });
  assert.equal(first.capped, false);
});

test('reward: a new day starts the stars again', () => {
  let day = 'a'; const st = memory(), paid = [];
  const r = createReward({ storage: st, today: () => day, awardStars: (n) => paid.push(n) });
  for (let i = 0; i < 3; i++) r.settle({ id: 'esturion', size: 120 });
  day = 'b';
  assert.equal(r.settle({ id: 'esturion', size: 120 }).stars, 3);
  assert.equal(createReward({ storage: st, today: () => 'b', awardStars() {} }).earnedToday(), 3, 'read back from the storage');
});

test('reward: the album and the stars are per pet', () => {
  const st = memory(), paid = [];
  const mk = (who) => createReward({ storage: scopedStorage(st, who), today: () => 'd', awardStars: (n) => paid.push([who, n]) });
  mk('A').settle({ id: 'copo', size: 20 });
  assert.deepEqual(Object.keys(mk('B').album()), []);
  assert.deepEqual(Object.keys(mk('A').album()), ['copo']);
  assert.equal(mk('B').settle({ id: 'copo', size: 20 }).first, true);
  assert.ok(`${ALBUM_KEY}.A` in st.m && `${ALBUM_KEY}.B` in st.m && `${FISH_STARS_KEY}.A` in st.m);
  assert.equal(scopedStorage(null, 'x'), null);
});

test('reward: bad or missing storage never breaks a catch', () => {
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  for (const storage of [null, boom, memory({ [ALBUM_KEY]: '{not json' })]) {
    const r = createReward({ storage, today: () => 'd', awardStars() { throw new Error('gone'); } });
    assert.doesNotThrow(() => r.settle({ id: 'carpa', size: 40 }));
    assert.equal(r.album().carpa.count, 1, 'kept for this visit');
  }
  const a = createAlbumStore(memory({ [ALBUM_KEY]: JSON.stringify({ carpa: { count: 'x', best: 5 }, trucha: { count: 2, best: 33, first: 1 } }) }));
  assert.deepEqual(Object.keys(a.get()), ['trucha'], 'bad rows are dropped');
  assert.ok(fishById('trucha'));
});
