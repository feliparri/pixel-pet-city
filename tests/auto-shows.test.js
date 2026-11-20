import test from 'node:test';
import assert from 'node:assert/strict';
import { autoEvents, AUTO_SHOW_S, AUTO_LEAD_MS } from '../src/auto-shows.js';
import { zonedToMs } from '../src/admin-time.js';
import { createTownEvents, showAt } from '../src/town-events.js';

const XMAS = zonedToMs('2026-12-25', '00:00'), NEWYEAR = zonedToMs('2027-01-01', '00:00');

test('auto shows: Nochebuena at Dec 25 00:00 and the New Year at Jan 1 00:00 (Chile time), 10 minutes each, the same on every screen', () => {
  assert.equal(AUTO_SHOW_S, 600);
  const x = autoEvents(XMAS + 5_000);
  assert.deepEqual(x.map((e) => [e.kind, e.start_ms, e.duration_ms]), [['christmas', XMAS, 600_000]]);
  const n = autoEvents(NEWYEAR + 1_000);
  assert.deepEqual(n.map((e) => [e.kind, e.start_ms, e.duration_ms]), [['fireworks', NEWYEAR, 600_000]]);
  assert.deepEqual(autoEvents(XMAS + 5_000), autoEvents(XMAS + 99_000).map((e) => e), 'the same row from any moment of the show');
  assert.notEqual(x[0].seed, n[0].seed);
  assert.ok(Number.isInteger(x[0].seed) && x[0].seed >= 0);
});

test('auto shows: listed shortly before the start and until the end, never otherwise', () => {
  assert.equal(autoEvents(XMAS - AUTO_LEAD_MS - 1).length, 0);
  assert.equal(autoEvents(XMAS - AUTO_LEAD_MS).length, 1);
  assert.equal(autoEvents(XMAS + 600_000 - 1).length, 1);
  assert.equal(autoEvents(XMAS + 600_000).length, 0);
  for (const day of ['2026-11-20', '2026-12-24', '2026-12-31', '2027-01-02']) assert.equal(autoEvents(zonedToMs(day, '12:00')).length, 0, day);
  assert.deepEqual(autoEvents(NaN), []);
});

test('auto shows respect the Christmas season: forced off, or dates that leave the moment out, mean no show', () => {
  assert.equal(autoEvents(XMAS + 1000, [{ season: 'christmas', year: 2026, mode: 'off' }]).length, 0);
  assert.equal(autoEvents(NEWYEAR + 1000, [{ season: 'christmas', year: 2026, mode: 'off' }]).length, 0, 'Jan 1 belongs to the December\'s year');
  assert.equal(autoEvents(XMAS + 1000, [{ season: 'christmas', year: 2026, mode: 'dates', starts_ms: zonedToMs('2026-12-01', '00:00'), ends_ms: zonedToMs('2026-12-20', '00:00') }]).length, 0);
  assert.equal(autoEvents(XMAS + 1000, [{ season: 'halloween', year: 2026, mode: 'off' }]).length, 1, 'another season does not matter');
});

test('the town runs an auto show with no server row, and the dev shortcut list stays untouched', async () => {
  let now = XMAS - 30_000;
  const toasts = [];
  const api = { list: async () => ({ ok: true, status: 200, body: { now, events: [], seasons: [] } }) };
  const ctl = createTownEvents({ api, nowMs: () => now, notify: (t) => toasts.push(t), setTimer: () => 1, clearTimer: () => {} });
  ctl.start(); await new Promise((x) => setImmediate(x));
  assert.equal(ctl.tick(), null);
  assert.deepEqual(toasts, ['¡Noche de Navidad en 1 minuto!']);
  now = XMAS + 30_000;
  const s = ctl.tick();
  assert.deepEqual([s.kind, Math.round(s.ts), s.dur], ['christmas', 30, 600]);
  assert.ok(showAt(ctl.events, now), 'the villagers and the others read the same list');
  const dev = createTownEvents({ api, nowMs: () => now, devEvents: [], setTimer: () => 1, clearTimer: () => {} });
  assert.equal(dev.tick(), null, 'no auto show in dev-event mode');
});
