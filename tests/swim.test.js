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
  assert.equal(groundOf('beach', 50, 10), 'sand');
  assert.equal(groundOf('beach', 10, 10, { rain: 1, snow: 0 }), 'swim');
  assert.equal(groundOf('beach', 50, 21, { rain: 0, snow: 0 }), 'wood', 'the boardwalk');
  assert.equal(groundOf('beach', 30, 31, { rain: 0, snow: 0 }), 'wood', 'the pier: wood underfoot, not the sea\'s splash');
  assert.ok(GROUNDS.includes('splash') && GROUNDS.includes('swim'));
  assert.notDeepEqual(Array.from(stepSamples('swim', 0)), Array.from(stepSamples('sand', 0)));
});

// ---- the camera in the water -------------------------------------------------------------------------------------------------------------------
import { zoomTarget, zoomFactor, SWIM_OUT } from '../src/sea.js';
import { cameraFor, followFocus, unproject, PHONE_OUT } from '../src/hd2d/camera.js';
import { approach } from '../src/hd2d/light.js';

test('zoom target: out in deep water, a little in the shallows, none on land; the factor is smooth and bounded', () => {
  assert.equal(zoomTarget('deep'), 1);
  assert.ok(zoomTarget('shallow') > 0 && zoomTarget('shallow') < 1);
  assert.equal(zoomTarget(null), 0);
  assert.equal(zoomFactor(0), 1);
  assert.equal(zoomFactor(1), 1 + SWIM_OUT);
  assert.equal(zoomFactor(-3), 1); assert.equal(zoomFactor(9), 1 + SWIM_OUT);
  let prev = 1;
  for (let k = 0; k <= 1.0001; k += 0.05) { const f = zoomFactor(k); assert.ok(f >= prev - 1e-12); prev = f; }
});

test('the zoom eases: it never jumps between two frames, and arrives', () => {
  let k = 0;
  const steps = [];
  for (let t = 0; t < 2000; t += 16) { const n = approach(k, 1, 16, 1 / 1.2); steps.push(zoomFactor(n) - zoomFactor(k)); k = n; }
  assert.equal(k, 1);
  assert.ok(Math.max(...steps) < 0.02, `biggest step ${Math.max(...steps)}`);
});

test('one zoomed-out option feeds the camera and the follow: the view shows more world and the focus bounds still keep the pet in view', () => {
  const opts = { ref: 148, out: PHONE_OUT }, far = { ...opts, out: PHONE_OUT * zoomFactor(1) };
  const width = (cam) => unproject(cam, 844, 300).x - unproject(cam, 0, 300).x;
  const a = cameraFor(844, 390, 384, 288, 1, opts), b = cameraFor(844, 390, 384, 288, 1, far);
  assert.ok(width(b) > width(a) * 1.15, `${width(a)} -> ${width(b)}`);
  const f = followFocus(844, 390, 12 * 16 + 8, 17 * 16 + 16, 768, 576, far);
  assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
  assert.ok(f.x >= 0 && f.x <= 768 && f.y >= 0 && f.y <= 576);
});
