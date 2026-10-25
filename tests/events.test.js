import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { world } from './trip-helpers.js';
import { SHOW_SECONDS, MAX_UPCOMING, ATTEMPT_MAX, SCHEDULE_AHEAD_S } from '../supabase/functions/trip/events.js';
import { SHOWS } from '../src/show/timeline.js';

const KEY = 'a-long-test-admin-key';
const at = (w, plusS) => new Date((w.now + plusS) * 1000).toISOString();
const save = (w, over = {}, ...key) => w.admin('event-save', { kind: 'fireworks', seed: 42, start_at: at(w, 3600), ...over }, key.length ? key[0] : KEY);     // no third argument: the right key; undefined: no key

test('the server knows the same show lengths as the town', () => {
  for (const [kind, s] of Object.entries(SHOWS)) assert.equal(SHOW_SECONDS[kind], s.dur, kind);
  assert.deepEqual(Object.keys(SHOW_SECONDS).sort(), Object.keys(SHOWS).sort());
});

test('events: public, answers the server clock in ms, GET or POST', async () => {
  const w = world({ adminKey: KEY });
  const a = await w.web().call('events', {});
  assert.deepEqual([a.status, a.body.now, a.body.events], [200, w.now * 1000, []]);
  const g = await w.raw('events', new Uint8Array(0), {}, 'GET');
  assert.equal(g.status, 200);
  assert.equal((await w.raw('events', new Uint8Array(0), {}, 'PUT')).status, 405);
  assert.equal((await w.raw('event-save', new Uint8Array(0), {}, 'GET')).status, 405, 'only the public list takes GET');
});

test('event-save: the owner schedules a show and everybody sees it, with its start and length', async () => {
  const w = world({ adminKey: KEY });
  const s = await save(w);
  assert.equal(s.status, 201);
  assert.deepEqual([s.body.event.kind, s.body.event.seed, s.body.event.duration_ms], ['fireworks', 42, 38000]);
  const list = (await w.web().call('events', {})).body.events;
  assert.equal(list.length, 1);
  assert.equal(list[0].start_ms, (w.now + 3600) * 1000);
  assert.equal(list[0].id, s.body.event.id);
});

test('event-save without the key, with a wrong key, with no ADMIN_KEY set', async () => {
  const w = world({ adminKey: KEY });
  assert.deepEqual([(await save(w, {}, undefined)).status, (await save(w, {}, undefined)).body.error], [401, 'bad_admin_key']);
  assert.equal((await save(w, {}, 'nope')).body.error, 'bad_admin_key');
  assert.equal((await save(w, {}, KEY + 'x')).body.error, 'bad_admin_key');
  assert.equal(w.db.townEvents.size, 0, 'nothing was saved');
  const off = world();
  const r = await save(off, {}, KEY);
  assert.deepEqual([r.status, r.body.error], [503, 'admin_disabled']);
  assert.equal((await off.admin('event-cancel', { id: 'x'.repeat(36) }, KEY)).status, 503);
  assert.equal((await off.web().call('events', {})).status, 200, 'the public list needs no key');
});

test('wrong keys are slowed down: after ATTEMPT_MAX in ten minutes even the right key waits', async () => {
  const w = world({ adminKey: KEY });
  for (let i = 0; i < ATTEMPT_MAX; i++) assert.equal((await save(w, {}, `bad${i}`)).status, 401);
  assert.deepEqual([(await save(w, {}, 'bad')).status, (await save(w, {}, KEY)).body.error], [429, 'too_many_attempts']);
  w.now += 601;
  assert.equal((await save(w, {}, KEY)).status, 201);
});

test('event-save validates the kind, seed and start time', async () => {
  const w = world({ adminKey: KEY });
  const bad = async (over, error) => assert.equal((await save(w, over)).body.error, error, JSON.stringify(over));
  await bad({ kind: 'rain' }, 'bad_kind');
  await bad({ kind: 7 }, 'bad_kind');
  await bad({ kind: '__proto__' }, 'bad_kind');
  await bad({ seed: -1 }, 'bad_seed');
  await bad({ seed: 2 ** 31 }, 'bad_seed');
  await bad({ seed: 1.5 }, 'bad_seed');
  await bad({ seed: '5' }, 'bad_seed');
  await bad({ start_at: 'tomorrow' }, 'bad_start');
  await bad({ start_at: '2027-01-01 10:00' }, 'bad_start');
  await bad({ start_at: 12345 }, 'bad_start');
  await bad({ start_at: at(w, -60) }, 'start_in_the_past');
  await bad({ start_at: at(w, 0) }, 'start_in_the_past');
  await bad({ start_at: at(w, SCHEDULE_AHEAD_S + 60) }, 'start_too_far');
  assert.equal((await save(w, { seed: 0 })).status, 201);
  assert.equal((await save(w, { seed: 2 ** 31 - 1, start_at: at(w, SCHEDULE_AHEAD_S - 60) })).status, 201);
  assert.equal((await w.raw('event-save', new TextEncoder().encode('{bad'), { 'x-admin-key': KEY })).body.error, 'bad_json');
});

test('a start time with an offset (Santiago) is the same moment as its UTC form', async () => {
  const w = world({ adminKey: KEY });
  const utc = at(w, 7200);
  const local = new Date(Date.parse(utc) - 3 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '-03:00');
  const r = await save(w, { start_at: local });
  assert.equal(r.status, 201);
  assert.equal(r.body.event.start_ms, Date.parse(utc));
});

test('the seed is random when the owner leaves it out, and within range', async () => {
  const w = world({ adminKey: KEY });
  const r = await w.admin('event-save', { kind: 'meteors', start_at: at(w, 600) }, KEY);
  assert.equal(r.status, 201);
  assert.ok(Number.isInteger(r.body.event.seed) && r.body.event.seed >= 0 && r.body.event.seed <= 2 ** 31 - 1);
});

test('the owner cannot pile up more than MAX_UPCOMING shows', async () => {
  const w = world({ adminKey: KEY });
  for (let i = 0; i < MAX_UPCOMING; i++) assert.equal((await save(w, { start_at: at(w, 600 + i * 60) })).status, 201);
  assert.deepEqual([(await save(w)).status, (await save(w)).body.error], [429, 'too_many_events']);
});

test('event-cancel: needs the key, is idempotent, and a cancelled show disappears from the list', async () => {
  const w = world({ adminKey: KEY });
  const id = (await save(w)).body.event.id;
  assert.equal((await w.admin('event-cancel', { id }, 'nope')).status, 401);
  assert.equal((await w.web().call('events', {})).body.events.length, 1);
  assert.deepEqual((await w.admin('event-cancel', { id }, KEY)).body, { id, cancelled: true, replayed: false });
  assert.equal((await w.web().call('events', {})).body.events.length, 0);
  assert.equal((await w.admin('event-cancel', { id }, KEY)).body.replayed, true);
  assert.equal((await w.admin('event-cancel', { id: '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12) }, KEY)).status, 404);
  assert.equal((await w.admin('event-cancel', { id: 'nope' }, KEY)).body.error, 'bad_id');
});

test('events lists what runs now and what starts within a week, in order, and drops what is over', async () => {
  const w = world({ adminKey: KEY });
  await save(w, { kind: 'drones', seed: 1, start_at: at(w, 7 * 86400 - 60) });
  await save(w, { kind: 'meteors', seed: 2, start_at: at(w, 600) });
  await save(w, { kind: 'fireworks', seed: 3, start_at: at(w, 30) });
  await save(w, { kind: 'fireworks', seed: 4, start_at: at(w, 8 * 86400) });          // beyond the week: not listed yet
  assert.deepEqual((await w.web().call('events', {})).body.events.map((e) => e.seed), [3, 2, 1]);
  w.now += 30 + 20;                                                                      // the first is 20 s in: it still runs
  assert.deepEqual((await w.web().call('events', {})).body.events.map((e) => e.seed), [3, 2, 1]);
  w.now += 30;                                                                           // 50 s in a 38 s show: over
  assert.deepEqual((await w.web().call('events', {})).body.events.map((e) => e.seed), [2, 1]);
});

test('the admin key is never stored or echoed', async () => {
  const w = world({ adminKey: KEY });
  const out = [await save(w), await save(w, {}, 'wrong'), await w.web().call('events', {})];
  assert.ok(!JSON.stringify(out).includes(KEY));
  assert.ok(!JSON.stringify([...w.db.townEvents.values()]).includes(KEY));
});

test('the migration exists, locks the table (RLS, no anon access) and the function sources never name a key', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261025120000_town_events.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table public\.town_events/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.town_events from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/);
  for (const f of ['serve.ts', 'events.js', 'db.ts']) {
    const src = readFileSync(new URL(`../supabase/functions/trip/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{20,}/, `${f}: no JWT in the source`);
  }
  assert.match(readFileSync(new URL('../supabase/functions/trip/serve.ts', import.meta.url), 'utf8'), /Deno\.env\.get\('ADMIN_KEY'\)/);
});
