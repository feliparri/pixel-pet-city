import test from 'node:test';
import assert from 'node:assert/strict';
import { VILLAGERS, routeFor, poseAt, lineAt, shiftHue, createVariants, createNpcs, npcTile, nearShopkeeper, shopGreeting, SHOP_LINES, SLOT_MS, SAY_MS, NIGHT_LINES, SHOW_LINES } from '../src/npcs.js';
import { STEP_MS } from '../src/walker.js';
import { isWalkable, inZone, GAME_IDS } from '../src/map.js';

const SEED = 'FOCA-LUNA-42';
const fakeSprites = { pets: { id: 'sheet' }, parts: {}, catalogue: { tophat: {}, scarf: {}, bow: {}, bell_collar: {}, beanie: {}, sunglasses: {} } };
const pos = (e) => { const p = e.walker.pos(); return [p.x, p.y, e.walker.d, e.say]; };

test('two instances of a room put every villager in the same spot with the same line at the same time', () => {
  const a = createNpcs({ seed: SEED, sprites: fakeSprites, variants: createVariants(() => ({})) });
  const b = createNpcs({ seed: SEED, sprites: fakeSprites, variants: createVariants(() => ({})) });
  for (let t = 1.7e12; t < 1.7e12 + 400000; t += 777) assert.deepEqual(a.update(t).map(pos), b.update(t).map(pos));
});

test('the route depends on the room: another code gives another loop', () => {
  assert.notDeepEqual(routeFor(SEED, 0).legs.map((l) => l.from), routeFor('GATO-RANA-07', 0).legs.map((l) => l.from));
});

test('a villager is always on a walkable tile outside the game places, and steps are one tile', () => {
  for (const seed of [SEED, 'GATO-RANA-07', 'RANA-NUBE-11']) {
    VILLAGERS.forEach((_, i) => {
      const r = routeFor(seed, i);
      assert.ok(r.legs.length >= 3 && r.cycleMs > 0);
      for (let t = 0; t < r.cycleMs; t += 97) {
        const p = poseAt(r, t);
        for (const [x, y] of [[p.x0, p.y0], [p.x, p.y]]) {
          assert.ok(isWalkable(x, y), `${seed} ${i} t=${t} (${x}, ${y}) is not walkable`);
          assert.ok(npcTile(x, y) && !GAME_IDS.some((g) => inZone(g, x, y)), `(${x}, ${y}) is in a game zone, a door or a bush`);
        }
        assert.ok(Math.abs(p.x - p.x0) + Math.abs(p.y - p.y0) <= 1);
        assert.ok(p.k >= 0 && p.k < 1);
      }
    });
  }
});

test('the loop repeats and a pose at t + one cycle is the same', () => {
  const r = routeFor(SEED, 1);
  for (const t of [0, 1234, 55555]) assert.deepEqual(poseAt(r, t), poseAt(r, t + r.cycleMs));
});

test('they walk at pet speed and rest between legs', () => {
  const r = routeFor(SEED, 2);
  let moved = 0, rested = 0;
  for (let t = 0; t < r.cycleMs; t += STEP_MS / 2) (poseAt(r, t).moving ? moved++ : rested++);
  assert.ok(moved > 0 && rested > 0);
  const l = r.legs[0];
  assert.equal(l.walkMs, l.path.length * STEP_MS);
});

test('a line is stable within a slot, only inside the speaking window, and the same for the same inputs', () => {
  VILLAGERS.forEach((v, i) => {
    let spoke = 0;
    for (let slot = 0; slot < 400; slot++) {
      const base = 1.7e12 - (1.7e12 % SLOT_MS) + slot * SLOT_MS;
      const first = lineAt(SEED, i, base, {}, 0);
      for (let dt = 0; dt < SAY_MS; dt += 500) assert.equal(lineAt(SEED, i, base + dt, {}, 0), first);
      for (let dt = SAY_MS; dt < SLOT_MS; dt += 700) assert.equal(lineAt(SEED, i, base + dt, {}, 0), null);
      if (first) { spoke++; assert.ok(v.lines.includes(first)); }
    }
    assert.ok(spoke > 200 && spoke < 360, `speaks in ${spoke} of 400 slots`);
    assert.ok(v.lines.length >= 10 && v.lines.every((l) => l.length <= 48));
  });
});

test('every line of a pool gets used, and the night and the show change what is said', () => {
  const seen = new Set(), night = new Set(), show = new Set();
  for (let slot = 0; slot < 3000; slot++) {
    const t = slot * SLOT_MS;
    seen.add(lineAt(SEED, 0, t, {}, 0)); night.add(lineAt(SEED, 0, t, { night: true }, 0)); show.add(lineAt(SEED, 0, t, { show: true }, 0));
  }
  for (const l of VILLAGERS[0].lines) assert.ok(seen.has(l), l);
  assert.ok(NIGHT_LINES.some((l) => night.has(l)) && !NIGHT_LINES.some((l) => seen.has(l)));
  assert.ok(SHOW_LINES.some((l) => show.has(l)));
});

test('a recoloured sheet is made once per variant and reused', () => {
  let made = 0;
  const v = createVariants((sheet, variant) => { made++; return { of: sheet, hue: variant.hue }; });
  const a = v.get(fakeSprites, { id: 'a', hue: 90 }), a2 = v.get(fakeSprites, { id: 'a', hue: 90 }), b = v.get(fakeSprites, { id: 'b', hue: -60 });
  assert.equal(a, a2);
  assert.notEqual(a, b);
  assert.equal(made, 2);
  assert.equal(v.size, 2);
  assert.equal(a.parts, fakeSprites.parts);
  assert.equal(b.pets.hue, -60);
  const other = { ...fakeSprites, pets: { id: 'other sheet' } };
  assert.notEqual(v.get(other, { id: 'a', hue: 90 }), a);                // a new sheet is recoloured again
});

test('the villagers have a distinct variant each, and createNpcs uses the cache', () => {
  assert.equal(new Set(VILLAGERS.map((v) => v.variant.id)).size, VILLAGERS.length);
  let made = 0;
  const variants = createVariants(() => { made++; return {}; });
  createNpcs({ seed: SEED, sprites: fakeSprites, variants }); createNpcs({ seed: 'OTRO', sprites: fakeSprites, variants });
  assert.equal(made, VILLAGERS.length);
});

test('the hue shift moves colours, leaves greys and transparent pixels alone and is reversible', () => {
  const px = new Uint8ClampedArray([80, 200, 90, 255, 30, 30, 36, 255, 250, 250, 250, 255, 10, 200, 10, 0]);
  const orig = Uint8ClampedArray.from(px);
  shiftHue(px, 120);
  assert.ok(px[0] < px[2] || px[1] < 200, 'the green went elsewhere');
  assert.deepEqual([...px.slice(4, 12)], [...orig.slice(4, 12)]);
  assert.deepEqual([...px.slice(12, 16)], [...orig.slice(12, 16)]);
  shiftHue(px, -120);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(px[i] - orig[i]) <= 2);
});

test('the shopkeeper greets near the counter only; the first greeting is the announcement', () => {
  assert.ok(nearShopkeeper(6, 5) && nearShopkeeper(7, 6) && nearShopkeeper(6, 7));
  assert.ok(!nearShopkeeper(6, 10) && !nearShopkeeper(1, 10));
  assert.equal(shopGreeting(0), '¡Hola! La tienda abre muy pronto.');
  assert.equal(shopGreeting(SHOP_LINES.length), shopGreeting(0));
  assert.ok(SHOP_LINES.length >= 3);
});
