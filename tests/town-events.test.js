import test from 'node:test';
import assert from 'node:assert/strict';
import { showAt, warningsAt, nextPollDelay, parseDevEvent, createTownEvents, WARN_MS, POLL_MS, RECHECK_BEFORE_MS, RETRY_MS } from '../src/town-events.js';
import { SHOWS, FALL } from '../src/show/timeline.js';
import { skyAt } from '../src/show/layers.js';

const T0 = 1_800_000_000_000;
const ev = (id, kind, startS, seed = 7) => ({ id, kind, seed, start_ms: T0 + startS * 1000, duration_ms: SHOWS[kind].dur * 1000 });

test('showAt: nothing before the start, the show time while it runs, nothing after the end', () => {
  const e = ev('a', 'fireworks', 100);
  assert.equal(showAt([e], T0 + 99_999), null);
  const mid = showAt([e], T0 + 120_000);
  assert.deepEqual([mid.event.id, mid.ts, mid.cut, mid.dur], ['a', 20, null, 38]);
  assert.equal(showAt([e], T0 + 100_000).ts, 0);
  assert.equal(showAt([e], T0 + 100_000 + 38_000), null);
  assert.ok(showAt([e], T0 + 100_000 + 37_999));
});

test('late joiners land mid-show: the same ts as everybody, whenever they arrive', () => {
  const e = ev('a', 'drones', 0);
  const early = showAt([e], T0 + 5_000), late = showAt([e], T0 + 30_000);
  assert.equal(late.ts - early.ts, 25);
  assert.deepEqual(skyAt('drones', e.seed, late.ts), skyAt('drones', e.seed, 30), 'the sky is a function of (seed, ts) only');
});

test('Volver: the show winds down FALL seconds after the cut, on that screen only', () => {
  const e = ev('a', 'meteors', 0), cuts = { a: 10 };
  const during = showAt([e], T0 + 10_000 + (FALL - 0.1) * 1000, cuts);
  assert.ok(during && during.cut === 10);
  assert.equal(showAt([e], T0 + 10_000 + FALL * 1000, cuts), null);
  assert.ok(showAt([e], T0 + 10_000 + FALL * 1000, {}), 'someone who did not cut still sees it');
});

test('showAt skips events it does not know and picks the first one that runs', () => {
  const bad = [{ id: 'x', kind: 'rain', seed: 1, start_ms: T0 }, { id: 'y', kind: 'drones', seed: 1.5, start_ms: T0 }, null, { id: 'z', kind: 'drones', seed: 1 }];
  assert.equal(showAt(bad, T0 + 1000), null);
  assert.equal(showAt([...bad, ev('ok', 'drones', 0)], T0 + 1000).event.id, 'ok');
});

test('warnings: one minute before, once, with the show\'s name', () => {
  const e = ev('a', 'fireworks', 90);
  const warned = new Set();
  assert.deepEqual(warningsAt([e], T0, warned), []);
  assert.deepEqual(warningsAt([e], T0 + 90_000 - WARN_MS - 1, warned), []);
  const w = warningsAt([e], T0 + 90_000 - WARN_MS, warned);
  assert.deepEqual(w.map((x) => x.text), ['¡Fuegos artificiales en 1 minuto!']);
  warned.add('a');
  assert.deepEqual(warningsAt([e], T0 + 40_000, warned), []);
  assert.deepEqual(warningsAt([e], T0 + 90_000, new Set()), [], 'at the start it is too late to warn');
  assert.equal(warningsAt([ev('b', 'meteors', 30)], T0, new Set())[0].text, '¡Estrellas fugaces en 1 minuto!');
});

test('the next ask of the server: every few minutes, sooner before a start', () => {
  assert.equal(nextPollDelay([], T0), POLL_MS);
  assert.equal(nextPollDelay([ev('a', 'drones', 3600)], T0), POLL_MS);
  assert.equal(nextPollDelay([ev('a', 'drones', 200)], T0), 200_000 - RECHECK_BEFORE_MS);
  assert.equal(nextPollDelay([ev('a', 'drones', 200), ev('b', 'drones', 100)], T0), 100_000 - RECHECK_BEFORE_MS);
  assert.equal(nextPollDelay([ev('a', 'drones', 20)], T0), POLL_MS, 'already inside the window: the normal pace');
});

test('the development shortcut needs dev=1 and a known kind', () => {
  assert.deepEqual(parseDevEvent('?event=fireworks:5', T0), []);
  assert.deepEqual(parseDevEvent('?dev=1&event=rain:5', T0), []);
  assert.deepEqual(parseDevEvent('?dev=1&event=fireworks:abc', T0), []);
  const [e] = parseDevEvent('?local=1&dev=1&event=drones:5:42', T0);
  assert.deepEqual([e.kind, e.seed, e.start_ms, e.duration_ms], ['drones', 42, T0 + 5000, 40000]);
  assert.equal(parseDevEvent('?dev=1&event=meteors', T0)[0].start_ms, T0 + 10_000);
});

function rig({ events = [], serverOffset = 0, fail = false } = {}) {
  const r = { now: T0, toasts: [], shows: [], timers: [], calls: 0 };
  const api = { list: async () => { r.calls++; if (fail) return { ok: false, status: 0, error: 'network' }; r.now += 100; return { ok: true, status: 200, body: { now: r.now + serverOffset - 50, events } }; } };
  r.ctl = createTownEvents({ api, nowMs: () => r.now, notify: (t) => r.toasts.push(t), onShow: (on) => r.shows.push(on), setTimer: (fn, ms) => { r.timers.push(ms); return r.timers.length; }, clearTimer: () => {} });
  return r;
}

test('the controller keeps the server clock offset and every screen sees the same show moment', async () => {
  const e = ev('a', 'fireworks', 60);
  const slow = rig({ events: [e], serverOffset: 7_000 });                  // this device's clock is 7 s behind the server's
  slow.ctl.start(); await new Promise((r) => setImmediate(r));
  assert.ok(Math.abs(slow.ctl.serverNow() - (slow.now + 7_000)) < 60);
  const ok = rig({ events: [e] });
  ok.ctl.start(); await new Promise((r) => setImmediate(r));
  slow.now = T0 + 53_000; ok.now = T0 + 60_000;                            // the same server moment (T0 + 60 s) on both
  assert.ok(Math.abs(slow.ctl.tick().ts - ok.ctl.tick().ts) < 0.2);
});

test('the controller: asks again later (sooner before a start), retries after a failure, and tells the town', async () => {
  const r = rig({ events: [ev('a', 'fireworks', 200)] });
  r.ctl.start(); await new Promise((x) => setImmediate(x));
  assert.ok(r.timers[0] < POLL_MS && r.timers[0] > 100_000);
  const f = rig({ fail: true });
  f.ctl.start(); await new Promise((x) => setImmediate(x));
  assert.deepEqual(f.timers, [RETRY_MS]);
  assert.equal(f.ctl.tick(), null);
  f.ctl.stop();
});

test('tick: the toast a minute before, the show with its time, Volver, and the Volver button\'s visibility', async () => {
  const r = rig({ events: [ev('a', 'meteors', 90)] });
  r.ctl.start(); await new Promise((x) => setImmediate(x));
  r.now = T0 + 30_100; assert.equal(r.ctl.tick(), null); assert.deepEqual(r.toasts, ['¡Estrellas fugaces en 1 minuto!']);
  r.ctl.tick(); assert.equal(r.toasts.length, 1, 'only once');
  r.now = T0 + 95_000;
  const s = r.ctl.tick();
  assert.deepEqual([s.kind, s.seed, Math.round(s.ts), s.cut], ['meteors', 7, 5, null]);
  assert.deepEqual(r.shows, [true]);
  assert.equal(r.ctl.cut(), true);
  assert.deepEqual(r.shows, [true, false]);
  assert.ok(Math.abs(r.ctl.tick().cut - 5) < 0.2, 'the cut is remembered at the show time it was pressed');
  assert.equal(r.ctl.cut(), false, 'a second Volver does nothing');
  r.now = T0 + 120_000; assert.equal(r.ctl.tick(), null);
});

test('flat mode and interiors only get a toast inviting them, once per show', async () => {
  const r = rig({ events: [ev('a', 'drones', 0)] });
  r.ctl.start(); await new Promise((x) => setImmediate(x));
  r.now = T0 + 10_000;
  assert.ok(r.ctl.tick('flat'));
  assert.deepEqual(r.toasts, ['¡Hay un show en el cielo! Activa «Efectos» para verlo.']);
  r.ctl.tick('inside'); r.ctl.tick('flat');
  assert.equal(r.toasts.length, 1);
  const i = rig({ events: [ev('b', 'drones', 0)] });
  i.ctl.start(); await new Promise((x) => setImmediate(x));
  i.now = T0 + 5_000; i.ctl.tick('inside');
  assert.deepEqual(i.toasts, ['¡Hay un show en el cielo! Sal a la calle para verlo.']);
  const h = rig({ events: [ev('c', 'drones', 0)] });
  h.ctl.start(); await new Promise((x) => setImmediate(x));
  h.now = T0 + 5_000; h.ctl.tick('hd');
  assert.deepEqual(h.toasts, [], 'the HD-2D town just draws the show');
});
