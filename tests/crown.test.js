// The Jamiro Crown's animation as the game exports it (assets/sprites.json items.jamiro.anim) and how the town picks the frame (src/sprites.js partAt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partAt, isAnimated } from '../src/sprites.js';

const data = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url), 'utf8'));
const crown = data.items.jamiro, anim = crown.anim;
const sets = anim.sets, modes = sets[0].length, n = sets[0][0].length;

test('the export carries the helmet\'s animation: a set of frames per head width, four colour modes each, a cycle that starts at the resting art', () => {
  assert.ok(anim && anim.tickMs === 100);
  assert.ok(sets.length >= 3 && sets.length <= 8);
  assert.equal(modes, 4);
  assert.ok(n >= 20 && n <= 96);
  assert.equal(anim.modeMs, anim.seq.length * anim.tickMs);                              // one colour mode per cycle
  const widths = new Set();
  for (const set of sets) {
    assert.equal(set.length, modes);
    const [w, h] = data.partSizes[set[0][0]];
    assert.ok(w <= 84 && h <= 84);
    widths.add(w);
    for (const m of set) { assert.equal(m.length, n); for (const f of m) assert.deepEqual(data.partSizes[f], [w, h]); }
  }
  assert.ok(widths.size >= 3);                                                           // the art is drawn per head width
  assert.equal(new Set(sets.flat(2)).size, sets.length * modes * n);                      // every frame of every mode of every width is a part of its own
  assert.ok(anim.seq.every((i) => Number.isInteger(i) && i >= 0 && i < n));
  assert.equal(anim.seq[0], 0);
  assert.ok(anim.seq.length * anim.tickMs >= 3000 && anim.seq.length * anim.tickMs <= 8000);
  const firsts = new Set(sets.map((s) => s[0][0]));
  for (const [key, worn] of Object.entries(crown.worn)) assert.ok(firsts.has(worn.rest[0][0]), key);   // every look is placed with the resting art of one width
  assert.equal(new Set(Object.values(crown.worn).map((w) => w.rest[0][0])).size, sets.length);       // and every width is worn by some look
});

test('the helmet is as wide as the head it sits on: its visor starts at the head\'s first column and the pets\' heads are the widths the sets are drawn for', () => {
  for (const sp of ['frog', 'seal', 'cat']) for (const st of ['baby', 'child', 'adult', 'elder']) {
    const placed = crown.worn[`${sp}-${st}`].rest[0];
    assert.equal(placed.length, 5);
    assert.ok(placed[1] < 0 && placed[1] + data.partSizes[placed[0]][0] > 32);                // the fins stick out beyond the pet's 32 px cell on both sides
  }
  const sizes = [...new Set(Object.values(crown.worn).map((w) => data.partSizes[w.rest[0][0]][0]))];
  assert.ok(sizes.length >= 3);
});

test('partAt: the frame of the tick and the colour mode `now` falls in, both cycle, a still picture or another part is as placed', () => {
  const tick = anim.tickMs, cycle = anim.seq.length;
  const moving = anim.seq.findIndex((i) => i !== 0);
  assert.ok(moving > 0);
  for (const set of sets) {
    const base = set[0][0];
    assert.equal(partAt(crown, base, 0), base);
    assert.equal(partAt(crown, base, undefined), base);                                  // no clock: the helmet rests, in its first mode
    assert.equal(partAt(crown, base, moving * tick), set[0][anim.seq[moving]]);
    assert.equal(partAt(crown, base, moving * tick + tick - 1), set[0][anim.seq[moving]]);
    for (let m = 0; m < modes; m++) {                                                    // each cycle is the next colour mode
      assert.equal(partAt(crown, base, m * anim.modeMs), set[m][0]);
      assert.equal(partAt(crown, base, m * anim.modeMs + moving * tick + 7), set[m][anim.seq[moving]]);
    }
    assert.equal(partAt(crown, base, modes * anim.modeMs), base);                        // a round of the modes on: back at the start
    assert.equal(partAt(crown, base, (9 * modes) * anim.modeMs + moving * tick), set[0][anim.seq[moving]]);
    assert.equal(partAt(crown, set[0][1], moving * tick), set[0][1]);                    // only the resting art is swapped
    const seen = new Set();
    for (let t = 0; t < cycle * modes; t++) seen.add(partAt(crown, base, t * tick));
    assert.equal(seen.size, modes * n);                                                  // over a round every frame is shown in every mode
  }
  assert.equal(partAt(data.items.cape, 3, 12345), 3);                                    // an item without animation
  assert.equal(partAt(undefined, 3, 12345), 3);
  assert.equal(isAnimated({ data }, 'jamiro'), true);
  assert.equal(isAnimated({ data }, 'cape'), false);
  assert.equal(isAnimated({ data }, 'nope'), false);
});

test('the town hats are in the catalogue with art for every species and stage', () => {
  for (const [key, name, id] of [['horns', 'Gorro con cuernos', 14], ['furhat', 'Sombrero de piel', 15]]) {
    const it = data.items[key];
    assert.ok(it, key);
    assert.deepEqual([it.slot, it.name], ['head', name]);
    const keys = Object.keys(it.worn);
    assert.equal(keys.length, data.species.length * data.stages.length);
    for (const w of Object.values(it.worn)) assert.ok(w.rest.length === 1 && w.rest[0][4] === 0);
    assert.equal(id, Object.keys(data.items).indexOf(key) + 1);
  }
});
