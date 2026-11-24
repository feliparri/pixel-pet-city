import test from 'node:test';
import assert from 'node:assert/strict';
import { Walker, STEP_MS } from '../src/walker.js';
import { paceFactor, waterOf, depthAt, SWIM_PACE, SUBMERGE } from '../src/sea.js';
import { groundOf, stepSamples, GROUNDS } from '../src/pet-sounds.js';
import { SPECIES } from '../src/protocol.js';
import { shallowFrom } from '../src/map.js';

const shallowX = shallowFrom(10);

test('depth and pace: land and shallows are walked at the normal pace, deep water is swum', () => {
  assert.equal(depthAt('beach', 10, 10), 'deep');
  assert.equal(depthAt('beach', shallowX, 10), 'shallow');
  assert.equal(depthAt('beach', 40, 10), null);
  assert.equal(depthAt('town', 10, 10), null);
  for (const sp of SPECIES) {
    assert.equal(paceFactor('beach', 40, 10, sp), 1);
    assert.equal(paceFactor('beach', shallowX, 10, sp), 1);
    assert.equal(paceFactor('town', 10, 10, sp), 1);
  }
  assert.equal(paceFactor('beach', 10, 10, 'frog'), 1.25);
  assert.equal(paceFactor('beach', 10, 10, 'cat'), 1.25);
  assert.equal(paceFactor('beach', 5, 10, 'seal'), 0.75, 'the break is deep water too');
  assert.equal(paceFactor('beach', 10, 10, 'unknown'), 1.25);
  assert.ok(SWIM_PACE.seal < 1 && SWIM_PACE.frog > 1 && SWIM_PACE.cat > 1);
});

test('a walker swims at the pace of the tile it steps onto, a seal faster than a frog, and never runs in deep water', () => {
  const make = (sp) => { const w = new Walker(shallowX - 1, 10); w.tileMult = (x, y) => paceFactor('beach', x, y, sp); return w; };
  const frog = make('frog'), seal = make('seal');
  frog.stepToward(shallowX - 2, 10); seal.stepToward(shallowX - 2, 10);          // onto a deep tile
  assert.equal(frog.stepMs(), STEP_MS * 1.25);
  assert.equal(seal.stepMs(), STEP_MS * 0.75);
  frog.run = true;
  assert.equal(frog.stepMs(), STEP_MS * 1.25, 'no running while swimming');
  const wade = make('frog'); wade.stepToward(shallowX, 10);
  assert.equal(wade.stepMs(), STEP_MS);
  const land = new Walker(1, 1); land.run = true; land.stepToward(2, 1);
  assert.ok(land.stepMs() < STEP_MS, 'a walker without the rule runs as before');
});

test('a remote walker that falls behind hurries in the water at half the swimming step, so it keeps up with a swimmer', () => {
  const w = new Walker(14, 10); w.hurry = true; w.tileMult = (x, y) => paceFactor('beach', x, y, 'seal');
  w.queue = [[13, 10], [12, 10], [11, 10], [10, 10], [9, 10]];
  w.begin();
  assert.equal(w.stepMs(), (STEP_MS * 0.75) / 2);
  const idle = new Walker(14, 10); idle.hurry = true; idle.tileMult = w.tileMult; idle.queue = [[13, 10]]; idle.begin();
  assert.equal(idle.stepMs(), STEP_MS * 0.75, 'no backlog: the sender\'s own pace');
});

test('a remote seal walks its reported path through the water in the time the sender took, smoothly', () => {
  const w = new Walker(14, 10); w.hurry = true; w.tileMult = (x, y) => paceFactor('beach', x, y, 'seal');
  w.goTo(10, 10, 'left', 'beach');
  let ms = 0;
  while (w.busy && ms < 5000) { w.update(8); ms += 8; }
  assert.ok(Math.abs(ms - 4 * STEP_MS * 0.75) < 24, `took ${ms} ms`);
  assert.deepEqual([w.tileX, w.tileY], [10, 10]);
});

test('waterOf: a pet sinks half way into a step from land to deep water and rises half way out', () => {
  const w = new Walker(shallowX - 1, 10);
  w.tileMult = (x, y) => paceFactor('beach', x, y, 'frog');
  assert.equal(waterOf('beach', w), 'deep');
  w.stepToward(shallowX, 10);                                                     // deep -> shallow
  assert.equal(waterOf('beach', w), 'deep');                                      // first half still in the deep tile
  w.update(w.stepMs() * 0.6);
  assert.equal(waterOf('beach', w), 'shallow');
  const dry = new Walker(40, 10);
  assert.equal(waterOf('beach', dry), null);
  assert.ok(SUBMERGE.cut > 0 && SUBMERGE.sink > 0);
});

test('steps in the water splash instead of stepping: shallows and deep water have their own soft sounds, rain does not change them', () => {
  assert.equal(groundOf('beach', shallowX, 10), 'splash');
  assert.equal(groundOf('beach', 10, 10), 'swim');
  assert.equal(groundOf('beach', 5, 10), 'swim');
  assert.equal(groundOf('beach', 40, 10), 'sand');
  assert.equal(groundOf('beach', 10, 10, { rain: 1, snow: 0 }), 'swim');
  assert.equal(groundOf('beach', 33, 17, { rain: 0, snow: 0 }), 'wood', 'the boardwalk');
  assert.ok(GROUNDS.includes('splash') && GROUNDS.includes('swim'));
  assert.notDeepEqual(Array.from(stepSamples('swim', 0)), Array.from(stepSamples('sand', 0)));
});
