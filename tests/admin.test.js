import test from 'node:test';
import assert from 'node:assert/strict';
import { zonedToMs, msToZoned, zoneOffset, untilText, parseDuration, durationText, DURATION_PRESETS } from '../src/admin-time.js';
import { createEventsApi, clockOffset, adminErrorText } from '../src/events-client.js';
import { createMockFetch } from '../src/admin-mock.js';

test('Santiago wall clock to UTC: summer time (UTC-3) and winter time (UTC-4)', () => {
  assert.equal(zonedToMs('2026-10-26', '21:30'), Date.UTC(2026, 9, 27, 0, 30));
  assert.equal(zonedToMs('2026-07-10', '12:00'), Date.UTC(2026, 6, 10, 16, 0));
  assert.equal(zoneOffset(Date.UTC(2026, 9, 26, 12)), -180);
  assert.equal(zoneOffset(Date.UTC(2026, 6, 10, 12)), -240);
});

test('wall clock and UTC convert back and forth, also around the clock changes', () => {
  for (const [d, t] of [['2026-10-26', '00:00'], ['2026-12-31', '23:59'], ['2027-04-03', '23:30'], ['2027-04-04', '00:30'], ['2026-09-05', '23:30'], ['2026-09-06', '03:00'], ['2027-02-28', '12:00']]) {
    assert.deepEqual(msToZoned(zonedToMs(d, t)), { date: d, time: t }, `${d} ${t}`);
  }
});

test('things that are not a date and a time are NaN', () => {
  for (const [d, t] of [['', ''], ['2026-13-01', '10:00'], ['2026-02-30', '10:00'], ['2026-10-26', '25:00'], ['2026-10-26', '10:61'], ['26-10-2026', '10:00'], ['2026-10-26', '10'], [null, '10:00'], ['2026-10-26', undefined]]) {
    assert.ok(Number.isNaN(zonedToMs(d, t)), `${d} ${t}`);
  }
});

test('the countdown text', () => {
  const now = 1_000_000_000;
  assert.equal(untilText(now + 45_000, now), 'en 45 s');
  assert.equal(untilText(now + 10 * 60_000, now), 'en 10 min');
  assert.equal(untilText(now + (3 * 60 + 5) * 60_000, now), 'en 3 h 5 min');
  assert.equal(untilText(now + 5 * 86_400_000, now), 'en 5 días');
  assert.equal(untilText(now - 10_000, now, 38_000), 'en curso');
  assert.equal(untilText(now - 50_000, now, 38_000), 'terminó');
});

test('the clock offset is the server time minus the middle of the round trip', () => {
  assert.equal(clockOffset(10_500, 10_000, 11_000), 0);
  assert.equal(clockOffset(20_000, 10_000, 12_000), 9_000);
  assert.equal(clockOffset(5_000, 10_000, 10_000), -5_000);
});

test('the events client: posts JSON, sends the admin key only when given, and reports errors by code', async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return { status: init.headers['x-admin-key'] === 'ok' || url.endsWith('/events') ? 200 : 401, json: async () => (url.endsWith('/events') ? { now: 1, events: [] } : init.headers['x-admin-key'] === 'ok' ? { cancelled: true } : { error: 'bad_admin_key' }) }; };
  const api = createEventsApi({ base: 'https://x.test/f', fetch: fetcher });
  const l = await api.list({ aheadDays: 60, limit: 50 });
  assert.deepEqual([l.ok, l.body.now, JSON.parse(calls[0].init.body)], [true, 1, { ahead_days: 60, limit: 50 }]);
  assert.equal(calls[0].url, 'https://x.test/f/events');
  assert.equal(calls[0].init.headers['x-admin-key'], undefined);
  assert.deepEqual(await api.cancel('id', 'wrong'), { ok: false, status: 401, error: 'bad_admin_key', body: { error: 'bad_admin_key' } });
  assert.equal((await api.cancel('id', 'ok')).ok, true);
  assert.equal(calls[1].init.headers['x-admin-key'], 'wrong');
  const down = createEventsApi({ base: 'x', fetch: async () => { throw new Error('offline'); } });
  assert.deepEqual(await down.list(), { ok: false, status: 0, error: 'network' });
  const junk = createEventsApi({ base: 'x', fetch: async () => ({ status: 200, json: async () => { throw new Error('not json'); } }) });
  assert.equal((await junk.list()).ok, false);
});

test('every error code the server can answer has a Spanish text, and the fallback is polite', () => {
  for (const e of ['bad_admin_key', 'admin_disabled', 'too_many_attempts', 'bad_kind', 'bad_seed', 'bad_start', 'start_in_the_past', 'start_too_far', 'too_many_events', 'unknown_event', 'network', 'bad_duration']) assert.match(adminErrorText(e), /[a-záéíóú]/i);
  assert.match(adminErrorText('whatever'), /Inténtalo/);
});

test('the page\'s development server stand-in behaves like the function: key, past times, listing, cancelling', async () => {
  const t0 = 1_800_000_000_000;
  const api = createEventsApi({ base: 'x', fetch: createMockFetch(() => t0) });
  assert.equal((await api.save({ kind: 'drones', start_at: new Date(t0 + 60_000).toISOString() }, 'nope')).error, 'bad_admin_key');
  assert.equal((await api.cancel('x', 'prueba')).error, 'bad_id');
  assert.equal((await api.save({ kind: 'drones', start_at: new Date(t0 - 1).toISOString() }, 'prueba')).error, 'start_in_the_past');
  const s = await api.save({ kind: 'drones', seed: 9, start_at: new Date(t0 + 60_000).toISOString() }, 'prueba');
  assert.equal(s.body.event.duration_ms, 40000);
  assert.equal((await api.list()).body.events.length, 1);
  assert.equal((await api.cancel(s.body.event.id, 'prueba')).ok, true);
  assert.equal((await api.list()).body.events.length, 0);
});

test('the length the owner picks: the show\'s own, a preset, or minutes and seconds, from 20 s to 10 min', () => {
  assert.deepEqual(parseDuration('', 1, 30), { secs: null });
  assert.deepEqual(DURATION_PRESETS, [30, 60, 120, 300]);
  for (const p of DURATION_PRESETS) assert.deepEqual(parseDuration(String(p)), { secs: p });
  assert.deepEqual(parseDuration('custom', '1', '30'), { secs: 90 });
  assert.deepEqual(parseDuration('custom', '', '45'), { secs: 45 });
  assert.deepEqual(parseDuration('custom', '10', '0'), { secs: 600 });
  assert.deepEqual(parseDuration('custom', '0', '20'), { secs: 20 });
  for (const [c, m, s] of [['custom', '0', '19'], ['custom', '10', '1'], ['custom', '', ''], ['custom', '0', '30.5'], ['custom', '-1', '30'], ['custom', 'x', '0'], ['5'], ['3600']]) assert.deepEqual(parseDuration(c, m, s), { error: 'bad_duration' }, `${c} ${m} ${s}`);
});

test('a length in words', () => {
  assert.deepEqual([20, 30, 60, 90, 120, 600].map(durationText), ['20 s', '30 s', '1 min', '1 min 30 s', '2 min', '10 min']);
});

test('the stand-in server keeps the length it is given and checks its bounds, like the function', async () => {
  const t0 = 1_800_000_000_000;
  const api = createEventsApi({ base: 'x', fetch: createMockFetch(() => t0) });
  const start_at = new Date(t0 + 60_000).toISOString();
  assert.equal((await api.save({ kind: 'fireworks', start_at, duration_s: 120 }, 'prueba')).body.event.duration_ms, 120000);
  assert.equal((await api.save({ kind: 'fireworks', start_at }, 'prueba')).body.event.duration_ms, 38000);
  assert.equal((await api.save({ kind: 'fireworks', start_at, duration_s: 5 }, 'prueba')).error, 'bad_duration');
});
