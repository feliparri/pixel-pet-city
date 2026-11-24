import test from 'node:test';
import assert from 'node:assert/strict';
import { RAIN_DROPS, SPLASHES, dropsFor, splashesFor, drawRain, drawFlash, paintSky, drawWeatherTop, QUANT } from '../src/weather-fx.js';
import { shelterLife, spellOf, strikesIn } from '../src/weather.js';
import { drawSnow, FLAKES } from '../src/snow.js';

function rec() {
  const o = { paths: 0, strokes: 0, moves: 0, lines: 0, rects: [], stops: [], stops2: 0 };
  const c = {
    o, save() {}, restore() {}, beginPath() { o.paths++; }, stroke() { o.strokes++; }, moveTo(x, y) { o.moves++; o.last = [x, y]; }, lineTo(x, y) { o.lines++; o.lastTo = [x, y]; },
    fillRect(x, y, w, h) { o.rects.push([x, y, w, h, c.fillStyle]); }, createLinearGradient() { return { addColorStop(t, col) { o.stops.push([t, col]); } }; },
    set strokeStyle(v) {}, set lineWidth(v) {}, set lineCap(v) {}, set globalAlpha(v) {},
  };
  return c;
}

test('rain is bounded and cheap: one stroke for the drops and one for the splashes, never more than the tables', () => {
  for (const level of [0.05, 0.5, 1, 5]) {
    const c = rec(); drawRain(c, 400, 300, 123456, 1, level, 2, 1);
    assert.equal(c.o.strokes, 2, 'two strokes in all');
    assert.ok(c.o.lines <= RAIN_DROPS + SPLASHES * 2, `${c.o.lines} lines`);
  }
  assert.equal(dropsFor(1), RAIN_DROPS); assert.equal(dropsFor(0), 0); assert.ok(dropsFor(0.05) >= 12 && dropsFor(0.5) < dropsFor(1));
  assert.equal(splashesFor(1), SPLASHES); assert.equal(splashesFor(0.01), 0);
  const none = rec(); drawRain(none, 400, 300, 1, 0, 0, 2); assert.equal(none.o.strokes, 0, 'no rain, no work');
  assert.ok(RAIN_DROPS <= 200 && SPLASHES <= 60);
});

test('rain is a pure function of the clock, the drops stay in the view, and they fall', () => {
  const a = rec(), b = rec(); drawRain(a, 400, 300, 5000, 0, 1, 2); drawRain(b, 400, 300, 5000, 0, 1, 2);
  assert.deepEqual(a.o, b.o);
  const c = rec(); drawRain(c, 400, 300, 5400, 0, 1, 2);
  assert.notDeepEqual(a.o.last, c.o.last);
  assert.ok(a.o.last[0] >= -10 && a.o.last[0] <= 410);
});

test('lightning is one translucent rect, only while the flash is on', () => {
  const on = rec(); drawFlash(on, 400, 300, 1); assert.equal(on.o.rects.length, 1); assert.deepEqual(on.o.rects[0].slice(0, 4), [0, 0, 400, 300]);
  const off = rec(); drawFlash(off, 400, 300, 0); assert.equal(off.o.rects.length, 0);
});

test('drawWeatherTop: nothing for clear skies, rain for rain, a flash only in a storm at a strike', () => {
  const clear = rec(); drawWeatherTop(clear, 400, 300, 1000, 1e12, 0, { rain: 0, storm: 0, cloud: 0, fog: 0 }); assert.equal(clear.o.strokes + clear.o.rects.length, 0);
  assert.doesNotThrow(() => drawWeatherTop(rec(), 400, 300, 1, 1, 0, null));
  const rain = rec(); drawWeatherTop(rain, 400, 300, 1000, 1e12, 0, { rain: 1, storm: 0, cloud: 0.7, fog: 0 }); assert.equal(rain.o.strokes, 2); assert.equal(rain.o.rects.length, 0);
  const t = 1.78e12, s = strikesIn(t, t + 3600e3, 1)[2];
  const storm = rec(); drawWeatherTop(storm, 400, 300, 1000, s.at + 5, 0, { rain: 1, storm: 1, cloud: 1, fog: 0 }); assert.equal(storm.o.rects.length, 1, 'the flash');
  const quiet = rec(); drawWeatherTop(quiet, 400, 300, 1000, s.at + 120, 0, { rain: 1, storm: 1, cloud: 1, fog: 0 }); assert.equal(quiet.o.rects.length, 0, 'dark between the flashes');
});

test('paintSky: clouds dim a little less at night, fog is a gradient, clear paints nothing', () => {
  const none = rec(); paintSky(none, 100, 80, 0, 0, 0); assert.equal(none.o.rects.length, 0);
  const alpha = (c) => Number(/,([\d.]+)\)$/.exec(c.o.rects[0][4])[1]);
  const day = rec(), night = rec(); paintSky(day, 100, 80, 1, 0, 0); paintSky(night, 100, 80, 1, 0, 1);
  assert.ok(alpha(day) > alpha(night) && alpha(night) > 0);
  const fog = rec(); paintSky(fog, 100, 80, 0, 1, 0); assert.equal(fog.o.stops.length, 4); assert.equal(fog.o.rects.length, 1);
  assert.equal(QUANT, 8);
});

test('birds and butterflies take shelter in rain, the rest of the frame stays', () => {
  const f = { birds: [1], butterflies: [2], fireflies: [3], duck: { x: 1 } };
  assert.deepEqual(shelterLife(f, { rain: 0.1, snow: 0 }), f);
  assert.deepEqual(shelterLife(f, { rain: 0.8, snow: 0 }), { birds: [], butterflies: [], fireflies: [3], duck: { x: 1 } });
  assert.deepEqual(shelterLife(f, { rain: 0, snow: 0.9 }).birds, []);
  assert.equal(shelterLife(null, { rain: 1 }), null);
  assert.equal(shelterLife(f, null), f);
});

test('snow takes an amount: a lighter snow has fewer flakes, the default is all of them', () => {
  const count = (amount) => { let n = 0; drawSnow({ save() {}, restore() {}, fillRect() { n++; }, set fillStyle(v) {}, set globalAlpha(v) {} }, 400, 300, 1, 1, 2, amount); return n; };
  assert.equal(count(undefined), FLAKES);
  assert.ok(count(0.4) < FLAKES && count(0.4) > 10);
  assert.ok(spellOf(3).kind);
});
