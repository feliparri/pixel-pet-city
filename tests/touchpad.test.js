import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchpad } from '../src/touchpad.js';

globalThis.document = { documentElement: {} };                    // goLandscape runs on the first touch and ignores what it cannot do
globalThis.screen = {};

function el(extra = {}) {
  const h = new Map(), cls = new Set();
  return {
    style: {}, offsetWidth: 112, ...extra,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
    addEventListener: (t, f) => h.set(t, f), removeEventListener: (t) => h.delete(t),
    fire: (t, ev = {}) => h.get(t)({ preventDefault() {}, ...ev }),
    setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 250, width: 300, height: 250 }),
  };
}

function setup() {
  const base = el(), knob = el();
  const stick = el({ querySelector: (q) => (q === '.stick-base' ? base : knob) }), a = el(), b = el();
  const log = [];
  const pad = createTouchpad({ stick, a, b, onStick: (s) => log.push(['stick', s.dirs.join('+'), s.run]), onJump: () => log.push(['jump']), onRun: (on) => log.push(['b', on]) });
  return { stick, a, b, base, knob, log, pad };
}

test('the stick appears under the thumb, follows it and releases to centre', () => {
  const { stick, base, knob, log } = setup();
  stick.fire('pointerdown', { pointerId: 1, clientX: 150, clientY: 125 });
  assert.equal(stick.classList.contains('on'), true);
  assert.equal(base.style.left, '150px');
  stick.fire('pointermove', { pointerId: 1, clientX: 150 + 30, clientY: 125 });
  stick.fire('pointermove', { pointerId: 1, clientX: 150 + 90, clientY: 125 });          // past 70% of the 56 px radius: run; the knob stays on the base
  assert.equal(knob.style.transform, 'translate(56px, 0px)');
  stick.fire('pointermove', { pointerId: 1, clientX: 150 + 90, clientY: 125 + 90 });
  stick.fire('pointerup', { pointerId: 1 });
  assert.deepEqual(log, [['stick', 'right', false], ['stick', 'right', true], ['stick', 'right+down', true], ['stick', '', false]]);
  assert.equal(stick.classList.contains('on'), false);
  assert.equal(knob.style.transform, '');
});

test('A and B work while the thumb stays on the stick, and a second finger does not steer it', () => {
  const { stick, a, b, log } = setup();
  stick.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  stick.fire('pointermove', { pointerId: 1, clientX: 130, clientY: 100 });
  a.fire('pointerdown', { pointerId: 2 });
  b.fire('pointerdown', { pointerId: 3 });
  stick.fire('pointerdown', { pointerId: 4, clientX: 10, clientY: 10 });                 // ignored: one thumb drives the stick
  stick.fire('pointermove', { pointerId: 4, clientX: 10, clientY: 200 });
  b.fire('pointerup', { pointerId: 3 });
  assert.deepEqual(log, [['stick', 'right', false], ['jump'], ['b', true], ['b', false]]);
});

test('reset (a panel opened) and destroy clear a held stick', () => {
  const { stick, log, pad } = setup();
  stick.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  stick.fire('pointermove', { pointerId: 1, clientX: 170, clientY: 100 });
  pad.reset();
  stick.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: 100 });               // the stick takes a new finger again
  stick.fire('pointermove', { pointerId: 2, clientX: 100, clientY: 170 });
  pad.destroy();
  assert.deepEqual(log.map((l) => l.slice(1).join(':')), ['right:true', ':false', 'down:true', ':false', 'false']);
});
