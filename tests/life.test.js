import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSeed, mulberry32, createLife, stepLife, birdPose, butterflyPose, fireflyPose, duckPose, lifeFrame, spray, LIFE } from '../src/life.js';
import { tileAt, isWalkable, TILE, GARDEN, PARQUE, TILES } from '../src/map.js';

const snap = (l) => JSON.stringify([l.birds.map((b) => [b.hx, b.hy]), l.butterflies.map((b) => [b.cx, b.cy]), l.fireflies.map((f) => [f.cx, f.cy])]);

test('life: the same room code gives the same scene, another code a different one', () => {
  assert.equal(snap(createLife('FOCA-LUNA-42')), snap(createLife('FOCA-LUNA-42')));
  assert.notEqual(snap(createLife('FOCA-LUNA-42')), snap(createLife('GATO-NUBE-07')));
  assert.equal(hashSeed('a'), hashSeed('a'));
  assert.notEqual(hashSeed('a'), hashSeed('b'));
  const r = mulberry32(5), s = mulberry32(5);
  assert.deepEqual([r(), r(), r()], [s(), s(), s()]);
});

test('life: birds stand on open grass, spread out, and never on a path, a pad, a bush or a solid tile', () => {
  for (const code of ['FOCA-LUNA-42', 'GATO-NUBE-07', 'RANA-SOL-99']) {
    const l = createLife(code);
    assert.equal(l.birds.length, LIFE.birds);
    for (const b of l.birds) {
      assert.ok(['.', ','].includes(tileAt(b.hx, b.hy)), `bird on ${tileAt(b.hx, b.hy)}`);
      assert.ok(isWalkable(b.hx, b.hy) && !TILES[tileAt(b.hx, b.hy)].hide);
    }
    for (const a of l.birds) for (const b of l.birds) if (a !== b) assert.ok(Math.hypot(a.hx - b.hx, a.hy - b.hy) >= LIFE.birdSpacing, 'spread');
  }
});

test('life: butterflies and fireflies live over the garden and the Parque, ducks and ripples on the pond', () => {
  const l = createLife('FOCA-LUNA-42');
  assert.ok(l.butterflies.length >= 6 && l.fireflies.length >= 8);
  const inside = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  for (const f of [...l.butterflies, ...l.fireflies]) assert.ok(inside(GARDEN, f.cx, f.cy) || inside(PARQUE, f.cx, f.cy), `${f.cx},${f.cy}`);
  for (let t = 0; t < 20000; t += 700) {
    const d = duckPose(l.duck, t);
    assert.equal(tileAt(Math.floor(d.x / TILE), Math.floor(d.y / TILE)), '~', `duck at ${t}`);
  }
  for (const r of l.ripples) assert.equal(tileAt(r.tx, r.ty), '~');
});

test('life: butterflies and fireflies stay near their centre, and move over time', () => {
  const l = createLife('FOCA-LUNA-42');
  const b = l.butterflies[0], f = l.fireflies[0];
  const p0 = butterflyPose(b, 0), p1 = butterflyPose(b, 1300);
  assert.ok(p0.x !== p1.x || p0.y !== p1.y);
  for (let t = 0; t < 30000; t += 500) {
    const p = butterflyPose(b, t), q = fireflyPose(f, t);
    assert.ok(Math.hypot(p.x / TILE - b.cx, p.y / TILE - b.cy) <= 3.5);
    assert.ok(Math.hypot(q.x / TILE - f.cx, q.y / TILE - f.cy) <= 3);
    assert.ok(q.glow >= 0 && q.glow <= 1);
  }
});

test('life: by day butterflies show and fireflies hide; at night the other way round; dusk blends', () => {
  const l = createLife('FOCA-LUNA-42');
  const day = lifeFrame(l, 1000, { night: 0 }), night = lifeFrame(l, 1000, { night: 1 });
  assert.equal(day.butterflies.length, l.butterflies.length); assert.equal(day.fireflies.length, 0);
  assert.equal(night.butterflies.length, 0); assert.ok(night.fireflies.length > 0 && night.fireflies.length <= l.fireflies.length);
  assert.equal(lifeFrame(l, 1000, { night: 0.5 }).butterflies.length, 0, 'dusk: the butterflies have gone to sleep');
});

test('birds: they peck at home, fly off when a pet comes within a few tiles, and come back later when it is gone', () => {
  const l = createLife('FOCA-LUNA-42');
  const b = l.birds[0];
  stepLife(l, [], 0);
  assert.equal(b.state, 'peck');
  const home = birdPose(b, 100);
  assert.ok(Math.abs(home.x - (b.hx * TILE + TILE / 2)) <= 6 && home.air === 0, 'it stands near the middle of its tile');
  const near = [{ x: b.hx + LIFE.scare - 0.5, y: b.hy }];
  stepLife(l, near, 1000);
  assert.equal(b.state, 'fly', 'a pet within the scare radius');
  assert.ok(birdPose(b, 1000 + 500).air > 0, 'it is in the air');
  stepLife(l, near, 1000 + LIFE.flyMs + 10);
  assert.equal(b.state, 'gone');
  assert.equal(lifeFrame(l, 3000, { night: 0 }).birds.some((e) => e.id === b.id), false, 'not drawn while away');
  stepLife(l, [{ x: b.hx, y: b.hy }], 1000 + b.awayMs + 5000);
  assert.equal(b.state, 'gone', 'a pet is still standing there: it does not come back');
  const later = 1000 + b.awayMs + 6000;
  stepLife(l, [], later);
  assert.equal(b.state, 'back');
  stepLife(l, [], later + LIFE.backMs + 10);
  assert.equal(b.state, 'peck');
  assert.equal(birdPose(b, later + 5000).air, 0);
});

test('birds: a pet that stays farther than the scare radius does not bother them, and one bird flying does not move the others', () => {
  const l = createLife('FOCA-LUNA-42');
  const [a, ...rest] = l.birds;
  stepLife(l, [{ x: a.hx + LIFE.scare + 1, y: a.hy }], 100);
  assert.equal(a.state, 'peck');
  stepLife(l, [{ x: a.hx, y: a.hy + 1 }], 200);
  assert.equal(a.state, 'fly');
  for (const o of rest) if (Math.hypot(o.hx - a.hx, o.hy - a.hy) > LIFE.scare + 1) assert.equal(o.state, 'peck');
});

test('birds: they fly away from the pet', () => {
  const l = createLife('FOCA-LUNA-42');
  const b = l.birds[1];
  stepLife(l, [{ x: b.hx - 1, y: b.hy }], 0);
  const p = birdPose(b, LIFE.flyMs - 50);
  assert.ok(p.x > b.hx * TILE + TILE / 2 + TILE, 'the pet was on the left, so it goes right');
});

test('the fountain spray and the scene are cheap, bounded and pure', () => {
  const s = spray(1234);
  assert.ok(s.length > 6 && s.length <= 24);
  assert.deepEqual(spray(1234), s);
  const l = createLife('FOCA-LUNA-42');
  const f = lifeFrame(l, 5000, { night: 0 });
  assert.ok(f.birds.length + f.butterflies.length + f.fireflies.length + 1 <= 40, 'a few dozen things at most');
});
