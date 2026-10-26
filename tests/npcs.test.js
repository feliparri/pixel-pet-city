import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VILLAGERS, SHOPKEEPER, lineAt, shiftHue, createVariants, createNpcs, npcTile, nearShopkeeper, shopGreeting, SHOP_LINES, SLOT_MS, SAY_MS, NIGHT_LINES, SHOW_LINES } from '../src/npcs.js';
import { SPECIES, STAGES, SLOTS, validateLook, validateMessage } from '../src/protocol.js';

const SEED = 'FOCA-LUNA-42';
const fakeSprites = { pets: { id: 'sheet' }, parts: {}, catalogue: { tophat: {}, scarf: {}, bow: {}, bell_collar: {}, beanie: {}, sunglasses: {}, cape: {} } };
const pos = (e) => { const p = e.walker.pos(); return [p.x, p.y, e.walker.d, e.say]; };

test('two instances of a room put every villager in the same spot with the same line at the same time', () => {
  const a = createNpcs({ seed: SEED, sprites: fakeSprites, variants: createVariants(() => ({})) });
  const b = createNpcs({ seed: SEED, sprites: fakeSprites, variants: createVariants(() => ({})) });
  for (let t = 1.7e12; t < 1.7e12 + 400000; t += 777) assert.deepEqual(a.update(t).map(pos), b.update(t).map(pos));
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

test('the villagers with a variant have a distinct one each, and createNpcs uses the cache', () => {
  const tinted = VILLAGERS.filter((v) => v.variant);
  assert.ok(tinted.length >= VILLAGERS.length - 1);
  assert.equal(new Set(tinted.map((v) => v.variant.id)).size, tinted.length);
  let made = 0;
  const variants = createVariants(() => { made++; return {}; });
  createNpcs({ seed: SEED, sprites: fakeSprites, variants }); createNpcs({ seed: 'OTRO', sprites: fakeSprites, variants });
  assert.equal(made, tinted.length + 1, 'the villagers plus the Almacén clerk');
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

// ---- the animals that are not playable yet: bear, raccoon, elephant ------------------------------------------------------------------------

const sheet = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url), 'utf8'));
const NEW = ['bear', 'raccoon', 'elephant'];

test('the town has a villager of each new animal, with its own name, accessories and a line pool of its own', () => {
  for (const sp of NEW) assert.equal(VILLAGERS.filter((v) => v.look.species === sp).length, 1, sp);
  assert.equal(new Set(VILLAGERS.map((v) => v.name)).size, VILLAGERS.length);
  const all = VILLAGERS.flatMap((v) => v.lines);
  assert.equal(new Set(all).size, all.length, 'no line is shared between villagers');
  for (const v of VILLAGERS.filter((v) => NEW.includes(v.look.species))) {
    const worn = v.look.items.filter(Boolean).length;
    assert.ok(worn >= 1 && worn <= 2, `${v.id} wears ${worn}`);
    assert.ok(v.lines.length >= 10 && v.lines.every((l) => l.length <= 48 && /[a-záéíóúñ]/i.test(l)));
  }
});

test('the exported sheet draws every new animal at every stage, with an anchor for every accessory a villager or the shopkeeper wears', () => {
  assert.deepEqual(sheet.species.slice(0, 3), SPECIES);
  assert.deepEqual(sheet.playable, SPECIES);
  for (const sp of NEW) assert.ok(sheet.species.includes(sp));
  for (const look of [...VILLAGERS.map((v) => v.look), SHOPKEEPER.look]) {
    const key = `${look.species}-${STAGES[look.stage]}`;
    assert.ok(sheet.sizes[key] && sheet.sizes[key].length === sheet.frames.length, key);
    look.items.forEach((id, i) => {
      if (!id) return;
      assert.ok(sheet.items[id] && sheet.items[id].slot === SLOTS[i], `${id} is a ${SLOTS[i]} item`);
      assert.ok(sheet.items[id].worn[key] && sheet.items[id].worn[key].rest.length > 0, `${id} has an anchor on ${key}`);
    });
  }
  for (const id of Object.keys(sheet.items)) for (const sp of NEW) for (const st of STAGES) assert.ok(sheet.items[id].worn[`${sp}-${st}`], `${id} on ${sp}-${st}`);
});

test('the new animals are for drawing only: nothing from the network can be one', () => {
  assert.deepEqual(SPECIES, ['frog', 'seal', 'cat']);
  for (const sp of NEW) {
    assert.equal(validateLook({ species: sp, stage: 2, items: ['', '', '', ''] }, sheet.items), null, sp);
    assert.equal(validateMessage({ t: 'hello', id: 'abcdef1', name: 'x', look: { species: sp, stage: 1, items: ['', '', '', ''] } }, sheet.items), null, sp);
  }
});

test('the shopkeeper is the raccoon of the pets\' art and behind the counter', () => {
  assert.equal(SHOPKEEPER.look.species, 'raccoon');
  assert.ok(SHOPKEEPER.look.items.filter(Boolean).length >= 1);
  const { cell, head } = SHOPKEEPER;
  assert.ok(head.x > cell.x && head.x < cell.x + 32 && head.y >= cell.y && head.y < cell.y + 12, 'its bubble points at its head');
});
