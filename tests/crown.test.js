// The Jamiro Crown's animation as the game exports it (assets/sprites.json items.jamiro.anim) and how the town picks the frame (src/sprites.js partAt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partAt, isAnimated } from '../src/sprites.js';

const data = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url), 'utf8'));
const crown = data.items.jamiro, anim = crown.anim;
const modes = anim.frames.length, n = anim.frames[0].length;

test('the export carries the helmet\'s animation: frames of one size in four colour modes, a cycle that starts at the resting art', () => {
  assert.ok(anim && anim.tickMs === 100);
  assert.equal(modes, 4);
  assert.ok(n >= 20 && n <= 96);
  assert.equal(anim.modeMs, anim.seq.length * anim.tickMs);                              // one colour mode per cycle
  const [w, h] = data.partSizes[anim.frames[0][0]];
  assert.deepEqual([w, h], [40, 21]);
  for (const m of anim.frames) { assert.equal(m.length, n); for (const f of m) assert.deepEqual(data.partSizes[f], [w, h]); }
  assert.equal(new Set(anim.frames.flat()).size, modes * n);                              // every frame of every mode is a part of its own
  assert.ok(anim.seq.every((i) => Number.isInteger(i) && i >= 0 && i < n));
  assert.equal(anim.seq[0], 0);
  assert.ok(anim.seq.length * anim.tickMs >= 3000 && anim.seq.length * anim.tickMs <= 8000);
  assert.equal(data.items.jamiro.worn['cat-adult'].rest[0][0], anim.frames[0][0]);        // placed with its resting art
});

test('partAt: the frame of the tick and the colour mode `now` falls in, both cycle, a still picture or another part is as placed', () => {
  const base = anim.frames[0][0], tick = anim.tickMs, cycle = anim.seq.length;
  const moving = anim.seq.findIndex((i) => i !== 0);
  assert.ok(moving > 0);
  assert.equal(partAt(crown, base, 0), base);
  assert.equal(partAt(crown, base, undefined), base);                                    // no clock: the helmet rests, in its first mode
  assert.equal(partAt(crown, base, moving * tick), anim.frames[0][anim.seq[moving]]);
  assert.equal(partAt(crown, base, moving * tick + tick - 1), anim.frames[0][anim.seq[moving]]);
  for (let m = 0; m < modes; m++) {                                                      // each cycle is the next colour mode
    assert.equal(partAt(crown, base, m * anim.modeMs), anim.frames[m][0]);
    assert.equal(partAt(crown, base, m * anim.modeMs + moving * tick + 7), anim.frames[m][anim.seq[moving]]);
  }
  assert.equal(partAt(crown, base, modes * anim.modeMs), base);                          // a round of the modes on: back at the start
  assert.equal(partAt(crown, base, (9 * modes) * anim.modeMs + moving * tick), anim.frames[0][anim.seq[moving]]);
  const other = anim.frames[0][1];
  assert.equal(partAt(crown, other, moving * tick), other);                              // only the first part is swapped
  assert.equal(partAt(data.items.cape, 3, 12345), 3);                                    // an item without animation
  assert.equal(partAt(undefined, 3, 12345), 3);
  const seen = new Set();
  for (let t = 0; t < cycle * modes; t++) seen.add(partAt(crown, base, t * tick));
  assert.equal(seen.size, modes * n);                                                    // over a round every frame is shown in every mode
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
