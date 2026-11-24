import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, SLOT_MS, FADE_MS, WEIGHTS, weatherAt, levels, spellOf, strikesIn, flashAt, devWeather, weatherNow, hash01 } from '../src/weather.js';

const T0 = Date.UTC(2026, 5, 1);

test('weatherAt is deterministic and the same for a Date and its ms', () => {
  const a = weatherAt(new Date(T0 + 12345678)), b = weatherAt(T0 + 12345678);
  assert.deepEqual(a, b);
  assert.deepEqual(weatherAt(T0 + 99), weatherAt(T0 + 99));
  assert.equal(weatherAt(NaN).kind, 'clear');
});

test('weatherAt returns a known shape over a month: valid kinds, intensity and fade in range, snow only at Christmas', () => {
  for (let i = 0; i < 30 * 48; i++) {
    const w = weatherAt(T0 + i * SLOT_MS / 2);
    assert.ok(KINDS.includes(w.kind) && w.kind !== 'snow', w.kind);
    assert.ok(w.intensity >= 0.55 && w.intensity <= 1);
    assert.ok(w.fade >= 0 && w.fade <= 1);
    if (w.next) assert.ok(KINDS.includes(w.next.kind) && w.next.kind !== 'snow' && w.next.kind !== w.kind); else assert.equal(w.fade, 0);
    const c = weatherAt(T0 + i * SLOT_MS / 2, { christmas: true });
    assert.ok(c.kind !== 'rain' && c.kind !== 'storm');
  }
});

test('the mix over a month: clear and cloudy are the most common, storm and fog the rarest, and every kind shows up', () => {
  const n = {};
  for (let i = 0; i < 90 * 48; i++) { const k = weatherAt(T0 + i * SLOT_MS).kind; n[k] = (n[k] || 0) + 1; }
  for (const [k] of WEIGHTS) assert.ok(n[k] > 0, k);
  assert.ok(n.clear > n.rain && n.cloudy > n.rain, JSON.stringify(n));
  assert.ok(n.storm < n.rain && n.fog < n.rain && n.storm < n.cloudy, JSON.stringify(n));
});

test('spells last tens of minutes: a slot is 30 minutes and a spell is at least one of them, usually more than one', () => {
  assert.equal(SLOT_MS, 30 * 60 * 1000);
  let runs = 0, len = 0, longest = 0, prev = null;
  for (let i = 0; i < 2000; i++) {
    const k = spellOf(i).kind;
    if (k === prev) len++; else { if (prev !== null) longest = Math.max(longest, len); runs++; len = 1; prev = k; }
  }
  assert.ok(2000 / runs > 1.2, 'some spells go on past one slot');
  assert.ok(longest >= 2);
});

test('a change fades: the blend is continuous across the slot border and the fade only runs in the last FADE_MS', () => {
  let found = 0;
  for (let s = 1; s < 400 && found < 12; s++) {
    const edge = T0 + s * SLOT_MS, here = weatherAt(edge - 1), there = weatherAt(edge);
    if (!here.next) continue;
    found++;
    assert.ok(here.fade > 0.99, `fade at the end of a slot ${here.fade}`);
    assert.equal(there.kind, here.next.kind);
    const a = levels(here), b = levels(there);
    for (const c of ['rain', 'storm', 'cloud', 'fog', 'snow']) assert.ok(Math.abs(a[c] - b[c]) < 0.02, `${c} jumps ${a[c]} -> ${b[c]}`);
    assert.equal(weatherAt(edge - FADE_MS - 1000).fade, 0);
    assert.ok(weatherAt(edge - FADE_MS / 2).fade > 0.3 && weatherAt(edge - FADE_MS / 2).fade < 0.7);
  }
  assert.ok(found >= 8, 'some changes to look at');
});

test('levels: rain has clouds, storm is rain plus lightning, fog has no rain, clear is empty, snow comes only from a snow weather', () => {
  const at = (kind, intensity = 1) => levels({ kind, intensity, next: null, fade: 0 });
  assert.deepEqual(at('clear'), { kind: 'clear', rain: 0, storm: 0, cloud: 0, fog: 0, snow: 0 });
  assert.ok(at('rain').rain === 1 && at('rain').cloud > 0.5 && at('rain').storm === 0);
  assert.ok(at('storm').storm === 1 && at('storm').rain === 1 && at('storm').cloud === 1);
  assert.ok(at('fog').fog === 1 && at('fog').rain === 0);
  assert.ok(at('snow').snow === 1 && at('snow').rain === 0);
  assert.ok(at('rain', 0.6).rain === 0.6);
  assert.equal(levels(null).kind, 'clear');
  assert.equal(levels({ kind: 'rain', intensity: 1, next: { kind: 'fog', intensity: 1 }, fade: 0.8 }).kind, 'fog');
});

test('Christmas turns rain and storm into snow, and nothing else changes', () => {
  let snow = 0;
  for (let s = 0; s < 500; s++) {
    const t = T0 + s * SLOT_MS, a = weatherAt(t), c = weatherAt(t, { christmas: true });
    if (a.kind === 'rain' || a.kind === 'storm') { assert.equal(c.kind, 'snow'); snow++; } else assert.equal(c.kind, a.kind);
  }
  assert.ok(snow > 50, 'it snows a fair part of the time');
});

test('lightning: only in a storm, deterministic, one strike at most per 7 s window, with a thunder delay, and the flash is short', () => {
  assert.deepEqual(strikesIn(T0, T0 + 3600e3, 0.2), []);
  assert.equal(flashAt(T0, 0), 0);
  const a = strikesIn(T0, T0 + 3600e3, 1), b = strikesIn(T0, T0 + 3600e3, 1);
  assert.deepEqual(a, b);
  assert.ok(a.length > 100 && a.length < 3600 / 7, `${a.length} strikes an hour`);
  assert.ok(strikesIn(T0, T0 + 3600e3, 0.3).length < a.length, 'a lighter storm has fewer');
  for (const s of a) { assert.ok(s.delay >= 600 && s.delay <= 3200); assert.ok(s.at >= T0 && s.at < T0 + 3600e3); }
  assert.deepEqual(strikesIn(T0, T0 + 1800e3, 1).concat(strikesIn(T0 + 1800e3, T0 + 3600e3, 1)), a, 'the same strikes however the span is cut');
  const s = a[3];
  assert.ok(flashAt(s.at + 5, 1) > 0.6, 'bright at the strike');
  assert.equal(flashAt(s.at + 120, 1), 0, 'dark in between');
  assert.ok(flashAt(s.at + 200, 1) > 0.3, 'an echo');
  assert.equal(flashAt(s.at + 600, 1), 0);
  assert.equal(flashAt(s.at - 10, 1) === 0 || strikesIn(s.at - 410, s.at - 9, 1).length > 0, true);
});

test('dev override: needs dev=1, takes a known kind, and ?snow=1 is the old shortcut for snow', () => {
  assert.equal(devWeather('?weather=rain'), null);
  assert.equal(devWeather('?dev=1&weather=rain'), 'rain');
  assert.equal(devWeather('?dev=1&weather=hail'), null);
  assert.equal(devWeather('?dev=1&snow=1'), 'snow');
  assert.equal(devWeather('?dev=1&weather=fog&snow=1'), 'fog');
  assert.equal(devWeather('?snow=1'), null);
  assert.deepEqual(weatherNow('?dev=1&weather=storm', T0, false), { kind: 'storm', intensity: 1, next: null, fade: 0 });
  assert.deepEqual(weatherNow('', T0, false), weatherAt(T0));
});

test('hash01 stays in [0, 1) and differs between inputs', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const v = hash01(i, 3); assert.ok(v >= 0 && v < 1); seen.add(v); }
  assert.equal(seen.size, 200);
});
