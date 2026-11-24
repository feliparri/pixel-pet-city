import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneLayout, landingPoint, castArc, castD01, floatAt, barPieces, promptFor, ESCAPE_TEXT, resultDelay } from '../src/fishing/layout.js';
import { initialFlow, reduce } from '../src/fishing/flow.js';
import { createHold, fishKey } from '../src/fishing/input.js';
import { fishRows, FISH_IDS, FISH_W, FISH_H } from '../src/fishing/fish-art.js';
import { nextToPond, pondAction } from '../src/fishing/pond.js';
import { FISH, FISHING, createFishing, press, release, tick } from '../src/fishing/rules.js';

test('layout: the scene fits both the phone landscape and a portrait canvas', () => {
  for (const [w, h] of [[422, 195], [426, 240], [195, 340]]) {
    const L = sceneLayout(w, h);
    assert.ok(L.tip.x > L.feetX && L.tip.y < L.feetY, 'the rod rises from the pet');
    assert.ok(L.reachX[0] < L.reachX[1], 'there is water to cast into');
    assert.ok(L.reachX[1] < L.bar.x, 'the far float stays clear of the reeling bar');
    assert.ok(L.bar.y >= L.h * 0.15 && L.bar.y + L.bar.h < L.h * 0.75, 'the bar leaves room for the big button');
    assert.ok(L.gauge.y + L.gauge.h < h && L.gauge.x >= 0);
  }
  const L = sceneLayout(422, 195, { left: 10, right: 12, top: 6 });
  assert.ok(L.gauge.x >= 10 && L.bar.x + L.bar.w + 6 + L.meter.w <= 422 - 12 + 4);
});

test('layout: a far cast lands further right and higher on the picture', () => {
  const L = sceneLayout(422, 195), a = landingPoint(L, 0), b = landingPoint(L, 1);
  assert.ok(b.x > a.x && b.y < a.y);
  assert.deepEqual(landingPoint(L, -3), a); assert.deepEqual(landingPoint(L, 9), b);
  const start = castArc(L, b, 0), end = castArc(L, b, 1), mid = castArc(L, b, 0.5);
  assert.deepEqual([Math.round(start.x), Math.round(start.y)], [L.tip.x, L.tip.y]);
  assert.deepEqual([Math.round(end.x), Math.round(end.y)], [b.x, b.y]);
  assert.ok(mid.y < (start.y + end.y) / 2, 'the float flies in an arc');
});

test('layout: the float follows the run state', () => {
  const L = sceneLayout(422, 195), s = createFishing(5, { night: false, christmas: false });
  assert.equal(floatAt(s, L, 0).mode, 'hang');
  press(s); for (let i = 0; i < 40; i++) tick(s, 1 / 60); assert.equal(castD01(s), s.power);
  release(s); assert.equal(floatAt(s, L, 0).mode, 'fly');
  while (s.phase !== 'waiting') tick(s, 1 / 60);
  const w = floatAt(s, L, 0), land = landingPoint(L, castD01(s));
  assert.equal(w.mode, 'float'); assert.equal(w.x, land.x);
  while (s.phase === 'waiting' && !s.bite.nibbled) tick(s, 1 / 60);
  if (s.phase === 'waiting') assert.equal(floatAt(s, L, 0).mode, 'twitch');
  while (s.phase === 'waiting') tick(s, 1 / 60);
  assert.equal(floatAt(s, L, 0).mode, 'dip');
  press(s); tick(s, 0.5);
  const p = floatAt(s, L, 0); assert.equal(p.mode, 'pull'); assert.ok(p.x < land.x, 'reeling draws the float towards the pet');
});

test('layout: the bar pieces put the zone and the marker where the rules say', () => {
  const box = { x: 0, y: 10, w: 16, h: 100 };
  const p = barPieces(box, { zone: 0.5, zoneSize: 0.2, marker: 0, progress: 0.25 });
  assert.equal(p.marker, 110); assert.equal(p.zone.y, 50); assert.equal(p.zone.h, 20); assert.equal(p.progressH, 25);
  assert.equal(barPieces(box, { zone: 1, zoneSize: 0.2, marker: 1, progress: 1 }).marker, 10);
});

test('layout: every phase has a Spanish prompt and every escape reason a card text', () => {
  for (const ph of ['idle', 'charging', 'cast', 'waiting', 'bite', 'reeling']) assert.ok(typeof promptFor(ph).button === 'string' && promptFor(ph).button.length);
  assert.match(promptFor('bite').hint, /Toca/);
  for (const r of ['early', 'missed', 'lost', 'snapped']) assert.ok(ESCAPE_TEXT[r]);
  assert.ok(resultDelay('caught') > 0 && resultDelay('escaped') > 0);
});

test('flow: menu -> play -> result, with pause and the album on the side', () => {
  let f = initialFlow();
  assert.equal(f.screen, 'menu');
  assert.equal(reduce(f, { type: 'pause' }), f, 'nothing to pause on the menu');
  f = reduce(f, { type: 'start' }); assert.equal(f.screen, 'play');
  f = reduce(f, { type: 'pause' }); assert.equal(f.screen, 'pause');
  f = reduce(f, { type: 'album' }); assert.equal(f.screen, 'album'); assert.equal(f.from, 'pause');
  f = reduce(f, { type: 'back' }); assert.equal(f.screen, 'pause');
  f = reduce(f, { type: 'resume' }); f = reduce(f, { type: 'result' }); assert.equal(f.screen, 'result');
  f = reduce(f, { type: 'start' }); assert.equal(f.screen, 'play');
  const e = reduce(f, { type: 'exit' }); assert.equal(e.exit, true); assert.equal(reduce(e, { type: 'exit' }), e);
  assert.equal(reduce(initialFlow('menu'), { type: 'resume' }).screen, 'menu');
});

test('input: the button is down while any source holds it, and only one press goes out', () => {
  const log = [], h = createHold({ press: () => log.push('p'), release: () => log.push('r') });
  h.down('a'); h.down('b'); h.down('a'); assert.deepEqual(log, ['p']);
  h.up('a'); assert.deepEqual(log, ['p']); assert.equal(h.held, true);
  h.up('b'); assert.deepEqual(log, ['p', 'r']); h.up('b'); assert.deepEqual(log, ['p', 'r']);
  h.down('key'); h.clear(); assert.deepEqual(log, ['p', 'r', 'p', 'r']); h.clear(); assert.equal(log.length, 4);
  assert.equal(fishKey(' '), 'hold'); assert.equal(fishKey('Escape'), 'pause'); assert.equal(fishKey('x'), null);
});

test('fish art: one sprite per fish, in a fixed frame, with an eye and an outline, and no two alike', () => {
  assert.deepEqual([...FISH_IDS].sort(), FISH.map((f) => f.id).sort());
  const seen = new Set();
  for (const id of FISH_IDS) {
    const rows = fishRows(id);
    assert.equal(rows.length, FISH_H); assert.ok(rows.every((r) => r.length === FISH_W), id);
    const all = rows.join('');
    for (const ch of ['m', 'b', 'f', 'e', 'o']) assert.ok(all.includes(ch), `${id} has ${ch}`);
    assert.match(all, /^[.obmfke]+$/);
    seen.add(all);
  }
  assert.equal(seen.size, FISH.length);
  assert.equal(fishRows('nope'), null);
});

test('pond: a prompt beside the park pond, the rod decides what it says', () => {
  assert.equal(nextToPond(4, 35), true);                       // west bank of the park pond
  assert.equal(nextToPond(8, 32), true);                       // the bank above it
  assert.equal(nextToPond(3, 35), false);                      // two tiles from the water
  assert.equal(nextToPond(20, 20), false);
  assert.equal(nextToPond(4, 35, 'farm'), false);
  assert.deepEqual(pondAction('town', 4, 35, ['fishing_rod']), { id: 'fish', label: 'Pescar', target: 'pond' });
  const hint = pondAction('town', 4, 35, ['sickle']);
  assert.equal(hint.id, 'hint'); assert.equal(hint.label, 'Necesitas una Caña de pescar — Almacén');
  assert.equal(pondAction('town', 20, 20, ['fishing_rod']), null);
  assert.equal(pondAction('town', 4, 35, null).id, 'hint');
});
