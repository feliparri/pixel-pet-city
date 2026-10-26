// The Jamiro Crown's animation as the game exports it (assets/sprites.json items.jamiro.anim) and how the town picks the frame (src/sprites.js partAt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partAt, isAnimated } from '../src/sprites.js';

const data = JSON.parse(readFileSync(new URL('../assets/sprites.json', import.meta.url), 'utf8'));
const crown = data.items.jamiro, anim = crown.anim;

test('the export carries the crown\'s animation: frames of one size, a cycle that rests out and starts and ends at the resting art', () => {
  assert.ok(anim && anim.tickMs === 100);
  assert.equal(anim.frames.length, 20);
  const [w, h] = data.partSizes[anim.frames[0]];
  for (const f of anim.frames) assert.deepEqual(data.partSizes[f], [w, h]);               // every frame fits the cell the resting art does
  assert.equal(new Set(anim.frames).size, 20);                                           // and is a part of its own
  assert.ok(anim.seq.every((i) => Number.isInteger(i) && i >= 0 && i < anim.frames.length));
  assert.equal(anim.seq[0], 0);
  assert.equal(anim.seq.at(-1), 0);
  let rest = 0; while (anim.seq[rest] === 0) rest++;
  assert.ok(rest * anim.tickMs >= 3000, 'a pause of a few seconds');
  assert.ok(anim.seq.length * anim.tickMs <= 6000);
  assert.equal(data.items.jamiro.worn['cat-adult'].rest[0][0], anim.frames[0]);          // placed with its resting art
});

test('partAt: the frame of the tick `now` falls in, the cycle repeats, a still picture or another part is as placed', () => {
  const base = anim.frames[0], tick = anim.tickMs;
  let moving = anim.seq.findIndex((i) => i !== 0);
  assert.ok(moving > 0);
  assert.equal(partAt(crown, base, 0), base);
  assert.equal(partAt(crown, base, undefined), base);                                    // no clock: the crown rests
  assert.equal(partAt(crown, base, moving * tick), anim.frames[anim.seq[moving]]);
  assert.equal(partAt(crown, base, moving * tick + tick - 1), anim.frames[anim.seq[moving]]);
  assert.equal(partAt(crown, base, (moving + anim.seq.length * 9) * tick + 5), anim.frames[anim.seq[moving]]);
  assert.equal(partAt(crown, base, anim.seq.length * tick), base);                       // a cycle on: at rest again
  const other = anim.frames[1];
  assert.equal(partAt(crown, other, moving * tick), other);                              // only the first part is swapped
  assert.equal(partAt(data.items.cape, 3, 12345), 3);                                    // an item without animation
  assert.equal(partAt(undefined, 3, 12345), 3);
  const seen = new Set(); for (let t = 0; t < anim.seq.length; t++) seen.add(partAt(crown, base, t * tick));
  assert.equal(seen.size, 20);                                                           // over a cycle every frame is shown
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
    for (const w of Object.values(it.worn)) assert.ok(w.rest.length === 1 && w.rest[0][4] === 0);   // one part, over the body
    assert.equal(id, Object.keys(data.items).indexOf(key) + 1);                          // the catalogue order is the ids' (1 = tophat)
  }
});
