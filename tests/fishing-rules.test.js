import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FISHING, FISH, createFishing, press, release, tick, chooseFish, isAvailable, rarityWeights, difficulty, distance01,
  createFishStars, starsForCatch, FISH_STAR_CAP_PER_DAY, FISH_STARS_KEY, albumFrom, recordCatch, albumProgress, fishById,
} from '../src/fishing/rules.js';
import { STARS_KEY } from '../src/arcade/scores.js';

const DT = 1 / 60;
const run = (s, secs, now = 0) => { for (let i = 0; i < secs / DT && !['caught', 'escaped'].includes(s.phase); i++) tick(s, DT, now); return s; };
/** casts with a given power: holds for `ms`-ish worth of charge, then lets go */
const castAt = (s, hold) => { press(s, 0); run(s, hold); release(s, 0); return s; };
const toWaiting = (s) => { castAt(s, 0.45); while (s.phase === 'cast') tick(s, DT, 0); return s; };
const toBite = (s) => { toWaiting(s); while (s.phase === 'waiting') tick(s, DT, 0); return s; };
const toReel = (s) => { toBite(s); press(s, 0); return s; };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

test('a cast walks the phases: idle, charging, cast, waiting, bite, reeling', () => {
  const s = createFishing(7);
  assert.equal(s.phase, 'idle');
  press(s, 0);
  assert.equal(s.phase, 'charging');
  run(s, 0.45);
  assert.ok(s.power > 0.4 && s.power < 0.6, `the power swings up: ${s.power}`);
  release(s, 0);
  assert.equal(s.phase, 'cast');
  assert.ok(s.dist > FISHING.DIST_MIN && s.dist < FISHING.DIST_MAX);
  tick(s, FISHING.CAST_S + 0.01, 0);
  assert.equal(s.phase, 'waiting');
  assert.ok(s.fish && s.size > 0, 'the fish is chosen when the float lands');
  while (s.phase === 'waiting') tick(s, DT, 0);
  assert.equal(s.phase, 'bite');
  assert.ok(s.bite.window >= FISHING.WINDOW_MIN && s.bite.window <= FISHING.WINDOW_MAX);
  press(s, 0);
  assert.equal(s.phase, 'reeling');
});

test('the power swings up and down, and the harder cast goes further', () => {
  const s = createFishing(1);
  press(s, 0);
  const seen = [];
  for (let i = 0; i < 2 * FISHING.CHARGE_S / DT; i++) { tick(s, DT, 0); seen.push(s.power); }
  assert.ok(Math.max(...seen) > 0.98 && seen.at(-1) < 0.05, 'up to 1 and back down to 0');
  const near = castAt(createFishing(1), 0.1), far = castAt(createFishing(1), 0.85);
  assert.ok(far.dist > near.dist);
  assert.ok(distance01(far) > distance01(near) && distance01(far) <= 1);
});

test('the waiting is seeded: the same seed bites at the same moment, with fake nibbles before it', () => {
  const a = toWaiting(createFishing(42)), b = toWaiting(createFishing(42)), c = toWaiting(createFishing(43));
  assert.deepEqual(a.bite, b.bite);
  assert.notDeepEqual(a.bite.at, c.bite.at);
  assert.ok(a.bite.at >= FISHING.BITE_MIN && a.bite.at <= FISHING.BITE_MAX);
  for (const n of a.bite.nibbles) assert.ok(n < a.bite.at - FISHING.NIBBLE_GAP + 1e-9);
  let nibbles = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) { const s = toWaiting(createFishing(seed)); while (s.phase === 'waiting') { tick(s, DT, 0); nibbles += s.events.filter((e) => e === 'nibble').length; } }
  assert.ok(nibbles > 0, 'the float twitches before it bites');
});

test('tapping before the bite reels in an empty line', () => {
  const s = toWaiting(createFishing(3));
  press(s, 0);
  assert.deepEqual([s.phase, s.reason], ['escaped', 'early']);
});

test('a missed bite: the window closes and the fish is gone', () => {
  const s = toBite(createFishing(3));
  tick(s, s.bite.window - 0.05, 0);
  assert.equal(s.phase, 'bite');
  tick(s, 0.1, 0);
  assert.deepEqual([s.phase, s.reason], ['escaped', 'missed']);
  assert.ok(s.events.includes('escape'));
  press(s, 0);
  assert.equal(s.phase, 'charging', 'a new cast can start');
});

/** A bot that holds when the marker is under the zone: it keeps up with any fish. */
const chase = (s, secs) => {
  for (let i = 0; i < secs / DT && s.phase === 'reeling'; i++) { const r = s.reel; if (r.marker < r.zone) press(s, 0); else release(s, 0); tick(s, DT, 1234); }
  return s;
};

test('reeling well catches the fish: the progress fills inside the zone', () => {
  const s = toReel(createFishing(11));
  const fish = s.fish;
  assert.equal(s.reel.progress, FISHING.START_PROGRESS);
  chase(s, 40);
  assert.equal(s.phase, 'caught');
  assert.deepEqual([s.catch.id, s.catch.size, s.catch.stars, s.catch.at], [fish.id, s.size, fish.stars, 1234]);
  assert.ok(s.events.includes('catch') || s.catch);
});

test('the line breaks when the player stays outside the zone too long', () => {
  const s = toReel(createFishing(11));
  s.reel.progress = 0.95;                           // so the fish cannot get away first
  s.reel.zone = s.reel.target = 0.8;
  release(s, 0);
  for (let i = 0; i < 4 / DT && s.phase === 'reeling'; i++) { s.reel.zone = 0.8; tick(s, DT, 0); }
  assert.deepEqual([s.phase, s.reason], ['escaped', 'snapped']);
  assert.ok(s.events.includes('snap') || s.reason === 'snapped');
});

test('the fish escapes when the progress runs out', () => {
  const s = toReel(createFishing(11));
  s.reel.progress = 0.02;
  s.reel.zone = s.reel.target = 0.8;
  s.reel.marker = 0;
  release(s, 0);
  run(s, 1);
  assert.deepEqual([s.phase, s.reason], ['escaped', 'lost']);
});

test('the marker rises while held, falls when released and stops at the ends', () => {
  const s = toReel(createFishing(5));
  const m0 = s.reel.marker;
  for (let i = 0; i < 20; i++) tick(s, DT, 0);
  assert.ok(s.reel.marker > m0, 'held: up');
  for (let i = 0; i < 300 && s.phase === 'reeling'; i++) { press(s, 0); s.reel.progress = 0.5; s.reel.outside = 0; tick(s, DT, 0); }
  assert.equal(s.reel.marker, 1);
  release(s, 0);
  for (let i = 0; i < 20; i++) { s.reel.progress = 0.5; s.reel.outside = 0; tick(s, DT, 0); }
  assert.ok(s.reel.marker < 1, 'released: down');
});

test('a harder fish has a smaller zone, moves faster and jerks more', () => {
  const easy = difficulty(fishById('sardina')), hard = difficulty(fishById('esturion'));
  assert.ok(hard.zone < easy.zone && hard.speed > easy.speed && hard.jerk > easy.jerk);
  for (const f of FISH) { const d = difficulty(f); assert.ok(d.zone >= 0.18 && d.zone <= 0.36, f.id); }
});

test('the fish table: about ten, three rarities, night and Christmas fish, sensible sizes', () => {
  assert.equal(FISH.length, 10);
  assert.equal(new Set(FISH.map((f) => f.id)).size, FISH.length);
  assert.deepEqual([...new Set(FISH.map((f) => f.rarity))].sort(), ['common', 'epic', 'rare']);
  assert.ok(FISH.filter((f) => f.when === 'night').length >= 2);
  assert.ok(FISH.filter((f) => f.when === 'christmas').length >= 1);
  for (const f of FISH) { assert.ok(f.name && f.stars >= 1 && f.cm[0] < f.cm[1] && f.diff >= 1 && f.diff <= 5, f.id); }
  assert.ok(FISH.every((f) => !/\p{Extended_Pictographic}/u.test(f.name)));
});

test('night fish only at night, Christmas fish only in the season, and always something to catch', () => {
  const day = { night: false, christmas: false }, night = { night: true, christmas: false }, xmas = { night: false, christmas: true };
  const caught = (ctx) => { const ids = new Set(); for (let i = 0; i < 400; i++) ids.add(chooseFish(ctx, i / 400, (i * 0.618) % 1, (i * 0.381) % 1).id); return ids; };
  const d = caught(day), n = caught(night), x = caught(xmas);
  for (const f of FISH) {
    assert.equal(d.has(f.id), f.when === 'any', `day ${f.id}`);
    assert.equal(n.has(f.id), f.when === 'any' || f.when === 'night', `night ${f.id}`);
    assert.equal(x.has(f.id), f.when === 'any' || f.when === 'christmas', `christmas ${f.id}`);
  }
  assert.equal(isAvailable(fishById('anguila'), {}), false);
  assert.equal(isAvailable(fishById('caramelo'), { christmas: true }), true);
});

test('the fish choice is deterministic for a seed and leans to rare fish a little with the distance', () => {
  const pick = (seed, hold) => { const s = toWaiting(createFishing(seed, { night: true })); return [s.fish.id, s.size]; };
  assert.deepEqual(pick(9), pick(9));
  assert.equal(chooseFish({}, 0, 0, 0).id, 'sardina');
  const near = rarityWeights(0), far = rarityWeights(1);
  assert.ok(far.epic > near.epic && far.rare > near.rare && far.common < near.common);
  assert.ok(far.common / (far.common + far.rare + far.epic) > 0.5, 'a little, not a lot: most are still common');
  const share = (d) => { let n = 0; for (let i = 0; i < 1000; i++) if (chooseFish({}, d, i / 1000, 0.5).rarity === 'epic') n++; return n; };
  assert.ok(share(1) > share(0));
  const sizes = new Set(); for (let seed = 1; seed < 40; seed++) { const s = toWaiting(createFishing(seed)); assert.ok(s.size >= s.fish.cm[0] && s.size <= s.fish.cm[1]); sizes.add(s.size); }
  assert.ok(sizes.size > 10, 'fish come in random sizes');
});

test('daily stars: the cap holds, a new day starts again, and fishing keeps its own key', () => {
  const st = mem();
  let day = '2026-12-24';
  const stars = createFishStars(st, () => day);
  assert.equal(stars.earned(), 0);
  assert.equal(starsForCatch(fishById('esturion'), 0), 3);
  assert.equal(starsForCatch(fishById('esturion'), FISH_STAR_CAP_PER_DAY - 1), 1, 'only what is left of the cap');
  assert.equal(starsForCatch(fishById('sardina'), FISH_STAR_CAP_PER_DAY), 0);
  assert.equal(starsForCatch(null, 0), 0);
  stars.award(3); stars.award(2);
  assert.equal(stars.earned(), FISH_STAR_CAP_PER_DAY);
  assert.equal(starsForCatch(fishById('salmon'), stars.earned()), 0);
  assert.equal(createFishStars(st, () => day).earned(), FISH_STAR_CAP_PER_DAY, 'kept in storage');
  assert.equal(st.getItem(STARS_KEY), null, 'the arcade\'s counter is untouched');
  assert.ok(st.getItem(FISH_STARS_KEY));
  day = '2026-12-25';
  assert.equal(stars.earned(), 0);
  assert.equal(createFishStars(null, () => day).earned(), 0, 'no storage at all still works');
});

test('the album: first catch, count and best size', () => {
  let a = {};
  const r1 = recordCatch(a, 'carpa', 41.6, 1000);
  assert.deepEqual([r1.first, r1.record], [true, false]);
  assert.deepEqual(r1.album.carpa, { count: 1, best: 42, first: 1000 });
  const r2 = recordCatch(r1.album, 'carpa', 55, 2000);
  assert.deepEqual([r2.first, r2.record], [false, true]);
  assert.deepEqual(r2.album.carpa, { count: 2, best: 55, first: 1000 });
  const r3 = recordCatch(r2.album, 'carpa', 30, 3000);
  assert.deepEqual([r3.record, r3.album.carpa.best, r3.album.carpa.count], [false, 55, 3]);
  assert.deepEqual(r1.album, { carpa: { count: 1, best: 42, first: 1000 } }, 'the old album is not changed');
  assert.deepEqual(recordCatch(r3.album, 'nope', 20).album, r3.album);
  assert.deepEqual(recordCatch(r3.album, 'carpa', -3).album, r3.album);
  assert.deepEqual(albumProgress(r3.album), { have: 1, total: 10 });
  assert.deepEqual(albumFrom({ carpa: { count: 'x', best: 3 }, perca: { count: 2, best: 20.4, first: 5 }, ghost: { count: 1, best: 1 }, __proto__: null }), { perca: { count: 2, best: 20, first: 5 } });
  assert.deepEqual(albumFrom(null), {});
});

test('a catch from a real run goes into the album', () => {
  const s = chase(toReel(createFishing(21)), 60);
  assert.equal(s.phase, 'caught');
  const r = recordCatch({}, s.catch.id, s.catch.size, s.catch.at);
  assert.equal(r.first, true);
  assert.equal(r.album[s.catch.id].best, s.catch.size);
});
