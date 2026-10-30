import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS, SEASON_KEYS, activeSeasons, seasonStatus, defaultWindow, parseDevSeasons } from '../src/seasons.js';
import { zonedToMs } from '../src/admin-time.js';
import { SEASON_KEYS as SERVER_KEYS } from '../supabase/functions/trip/events.js';

const at = (date, time = '12:00') => zonedToMs(date, time);
const on = (ms, rows, reg) => [...activeSeasons(ms, rows, reg)];
// a stub Christmas that crosses New Year: Dec 1 -> Jan 6 (window year = the year it starts in)
const REG = { ...SEASONS, navidad: { label: 'Navidad', window: (y) => [zonedToMs(`${y}-12-01`, '00:00'), zonedToMs(`${y + 1}-01-06`, '00:00')] } };

test('the server and the town know the same season keys', () => {
  assert.deepEqual([...SERVER_KEYS].sort(), [...SEASON_KEYS].sort());
});

test('defaults: Halloween goes live by itself on Oct 24 00:00 and ends Nov 1 06:00, Chile time', () => {
  assert.deepEqual(on(at('2026-10-23', '23:59')), []);
  assert.deepEqual(on(at('2026-10-24', '00:00')), ['halloween']);
  assert.deepEqual(on(at('2026-11-01', '05:59')), ['halloween']);
  assert.deepEqual(on(at('2026-11-01', '06:00')), []);
  assert.deepEqual(on(at('2027-10-30')), ['halloween']);
  assert.deepEqual(on(NaN), []);
  assert.deepEqual(defaultWindow('halloween', 2026), [Date.UTC(2026, 9, 24, 3), Date.UTC(2026, 10, 1, 9)]);
});

test('no overrides, junk overrides and a failed fetch all mean the defaults', () => {
  const ms = at('2026-10-30');
  for (const o of [undefined, null, [], 'x', [null, 5, { season: 'nope', year: 2026, mode: 'off' }, { season: 'halloween', year: 2026, mode: 'maybe' }, { season: 'halloween', year: 2026, mode: 'dates' }, { season: 'halloween', year: 2026, mode: 'dates', starts_ms: 5, ends_ms: 4 }]]) assert.deepEqual(on(ms, o), ['halloween']);
});

test('override dates replace the default window of that year only', () => {
  const rows = [{ season: 'halloween', year: 2026, mode: 'dates', starts_ms: at('2026-10-27', '00:00'), ends_ms: at('2026-11-03', '00:00') }];
  assert.deepEqual(on(at('2026-10-25'), rows), [], 'the default start no longer counts');
  assert.deepEqual(on(at('2026-10-27', '00:00'), rows), ['halloween']);
  assert.deepEqual(on(at('2026-11-02'), rows), ['halloween'], 'past the default end');
  assert.deepEqual(on(at('2026-11-03', '00:00'), rows), []);
  assert.deepEqual(on(at('2027-10-30'), rows), ['halloween'], 'next year is the default again');
});

test('forced on lasts the whole year; forced off silences that year\'s window', () => {
  const force = (mode) => [{ season: 'halloween', year: 2026, mode, starts_ms: null, ends_ms: null }];
  assert.deepEqual(on(at('2026-03-10'), force('on')), ['halloween']);
  assert.deepEqual(on(at('2026-12-31', '23:00'), force('on')), ['halloween']);
  assert.deepEqual(on(at('2027-03-10'), force('on')), [], 'not into the next year');
  assert.deepEqual(on(at('2026-10-30'), force('off')), []);
  assert.deepEqual(on(at('2027-10-30'), force('off')), ['halloween'], 'only that year');
});

test('a window that runs over New Year belongs to the year it starts in', () => {
  assert.deepEqual(on(at('2026-11-30'), [], REG), []);
  assert.deepEqual(on(at('2026-12-25'), [], REG), ['navidad']);
  assert.deepEqual(on(at('2027-01-05'), [], REG), ['navidad']);
  assert.deepEqual(on(at('2027-01-06', '00:00'), [], REG), []);
  const off = [{ season: 'navidad', year: 2026, mode: 'off' }], on26 = [{ season: 'navidad', year: 2026, mode: 'on' }];
  assert.deepEqual(on(at('2027-01-03'), off, REG), [], 'forced off for 2026 also covers its January');
  assert.deepEqual(on(at('2026-12-25'), off, REG), []);
  assert.deepEqual(on(at('2027-01-03'), on26, REG), ['navidad']);
  assert.deepEqual(on(at('2027-02-03'), on26, REG), [], 'forced on ends with its window when it runs into the next year');
  const dates = [{ season: 'navidad', year: 2027, mode: 'dates', starts_ms: at('2026-12-20', '00:00'), ends_ms: at('2027-01-02', '00:00') }];
  assert.deepEqual(on(at('2026-12-21'), dates, REG), ['navidad'], 'dates of a year may start the year before');
  assert.deepEqual(on(at('2026-12-31'), [], REG).concat(on(at('2026-12-31'), [{ season: 'navidad', year: 2026, mode: 'off' }, ...dates], REG)), ['navidad', 'navidad']);
});

test('seasonStatus: on, scheduled or off, the year an override is saved for and where it comes from', () => {
  const s = (d, rows) => seasonStatus('halloween', at(d), rows);
  assert.deepEqual([s('2026-10-30').state, s('2026-10-30').year, s('2026-10-30').mode], ['on', 2026, 'default']);
  assert.deepEqual([s('2026-06-01').state, s('2026-06-01').year], ['scheduled', 2026]);
  assert.deepEqual([s('2026-12-01').state, s('2026-12-01').year], ['scheduled', 2027], 'after this year\'s window: the next one');
  assert.deepEqual(s('2026-12-01').window, defaultWindow('halloween', 2027));
  const off = [{ season: 'halloween', year: 2026, mode: 'off' }];
  assert.deepEqual([s('2026-10-30', off).state, s('2026-10-30', off).mode, s('2026-10-30', off).window], ['off', 'off', null]);
  const on26 = [{ season: 'halloween', year: 2026, mode: 'on' }];
  assert.deepEqual([s('2026-06-01', on26).state, s('2026-06-01', on26).mode], ['on', 'on']);
  const d = [{ season: 'halloween', year: 2026, mode: 'dates', starts_ms: at('2026-11-10'), ends_ms: at('2026-11-12') }];
  assert.deepEqual([s('2026-10-30', d).state, s('2026-10-30', d).mode], ['scheduled', 'dates']);
  assert.equal(seasonStatus('navidad', at('2027-01-03'), [], REG).year, 2026);
});

test('dev shortcuts need dev=1', () => {
  assert.equal(parseDevSeasons('?season=halloween'), null);
  assert.deepEqual([...parseDevSeasons('?dev=1&season=halloween')], ['halloween']);
  assert.deepEqual([...parseDevSeasons('?dev=1&season=none')], []);
  assert.deepEqual([...parseDevSeasons('?dev=1&season=bogus')], []);
  assert.deepEqual([...parseDevSeasons('?dev=1&halloween=1')], ['halloween']);
  assert.deepEqual([...parseDevSeasons('?dev=1&halloween=0')], []);
  assert.equal(parseDevSeasons('?dev=1'), null);
});
