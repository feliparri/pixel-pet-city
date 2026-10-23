import test from 'node:test';
import assert from 'node:assert/strict';
import { bannerText, barText, resultLines } from '../src/hud.js';

test('banners: the seeker counts, the hiders are told to hide, a found pet watches, spectators get none', () => {
  const g = (role, phase, left = 14200, play = true) => ({ g: 'hide', role, phase, left, play });
  assert.equal(bannerText(g('seeker', 'count')), 'Contando... 15');
  assert.equal(bannerText(g('hider', 'count', 3000)), '¡Escóndete! 3');
  assert.equal(bannerText(g('found', 'search')), '¡Te encontraron! Mira el juego');
  assert.equal(bannerText(g('hider', 'search')), '');
  assert.equal(bannerText(g('hider', 'count', 5000, false)), '');
  assert.equal(bannerText(null), '');
});

test('the game bar tells the time left and who is missing', () => {
  const hide = { game: { g: 'hide', name: 'Escondida', phase: 'search', left: 83000, hidersLeft: 2, play: true } };
  assert.equal(barText(hide), 'Escondida · 1:23 · Faltan 2');
  assert.match(barText({ lobby: { name: 'Escondida', joined: 2, left: 6400 } }), /esperando jugadores \(2\) 7/);
  const hen = { game: { g: 'chicken', name: 'Pillar la gallina', phase: 'play', left: 59000, play: false, scores: [{ name: 'Ana', n: 1 }, { name: 'Beto', n: 0 }] } };
  assert.equal(barText(hen), 'Pillar la gallina · 0:59 · Ana 1 · Beto 0 · Mirando');
});

test('results: who was found when, who survived, who searched; the chicken winner is marked', () => {
  const res = { g: 'hide', names: ['Ana', 'Beto', 'Cleo'], rows: [{ i: 0, role: 'hider', found: 20, stars: 0 }, { i: 1, role: 'hider', found: -1, stars: 1 }, { i: 2, role: 'seeker', found: -1, stars: 1 }] };
  assert.deepEqual(resultLines(res), [
    { text: 'Ana: lo encontraron a los 20 s', win: false }, { text: 'Beto: ¡no lo encontraron!', win: true }, { text: 'Cleo (buscaba): encontró a 1', win: true },
  ]);
  const hen = { g: 'chicken', names: ['Ana', 'Beto'], rows: [{ i: 0, found: 3 }, { i: 1, found: 1 }] };
  assert.deepEqual(resultLines(hen).map((l) => l.win), [true, false]);
});
