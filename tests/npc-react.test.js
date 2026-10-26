import test from 'node:test';
import assert from 'node:assert/strict';
import { REACTIONS, reactionTo, hearer, answersAll, REPLY_WINDOW_MS, REPLY_RANGE, REPLY_DELAY_MS, REPLY_EMOTE_MS, REPLY_SAY_MS } from '../src/npc-react.js';
import { EMOTES } from '../src/protocol.js';
import { VILLAGERS, SHOP_LINES } from '../src/npcs.js';

test('every emote a player can send has an answer, and an answer emote is itself an emote', () => {
  assert.equal(answersAll(), true);
  for (const [id, r] of Object.entries(REACTIONS)) {
    assert.ok(Object.hasOwn(EMOTES, id), `${id} is a real emote`);
    assert.ok(r.emote === null || Object.hasOwn(EMOTES, r.emote), `${id} answers with a real emote`);
    assert.ok(r.lines.length >= 4, id);
  }
  assert.equal(REACTIONS.heart.emote, 'heart');
  assert.equal(REACTIONS.party.emote, 'party');
  assert.equal(reactionTo('nope', 'tito'), null);
  assert.equal(reactionTo('constructor', 'tito'), null);
});

test('the answers are short, kind and in neutral Spanish', () => {
  for (const r of Object.values(REACTIONS)) for (const line of r.lines) {
    assert.ok(line.length <= 36, line);
    assert.match(line, /^[¡¿A-ZÁÉÍÓÚ]/, line);
    assert.ok(!/[ñÑ]?\b(vos|tenés|querés|podés|sos)\b/i.test(line), `no voseo: ${line}`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(line), `no emoji inside a line: ${line}`);
    assert.ok(!/(odio|tonto|feo|idiota|estúpid|callate|cállate|muerte|matar)/i.test(line), line);
  }
  assert.ok(Object.values(REACTIONS).some((r) => r.lines.some((l) => l.includes('{name}'))), 'some answers use the pet\'s name');
});

test('an answer is the same for the same villager and emote, changes with the count, and fills in the pet\'s name', () => {
  assert.deepEqual(reactionTo('heart', 'tito', 'Mochi', 0), reactionTo('heart', 'tito', 'Mochi', 0));
  const lines = Array.from({ length: REACTIONS.heart.lines.length }, (_, n) => reactionTo('heart', 'lula', 'Mochi', n).line);
  assert.equal(new Set(lines).size, REACTIONS.heart.lines.length, 'a run of hearts never repeats a line');
  assert.ok(lines.every((l) => !l.includes('{name}')));
  assert.ok(Array.from({ length: 4 }, (_, n) => reactionTo('wave', 'pipo', 'Luna', n).line).some((l) => l.includes('Luna')));
  assert.ok(reactionTo('wave', 'pipo', '', 0).line && !reactionTo('wave', 'pipo', '', 0).line.includes('{name}'));
  assert.deepEqual(reactionTo('hola', 'bruno', 'A', 0).emote, 'wave');
  assert.equal(reactionTo('juguemos', 'bruno', 'A', 0).emote, null, 'a phrase gets a line only');
  const heart = new Set(VILLAGERS.map((v) => reactionTo('heart', v.id, 'Mochi', 0).line));
  assert.ok(heart.size > 1, 'villagers do not all say the same');
});

const V = (id, x, y, extra = {}) => ({ id, x, y, ...extra });
test('the nearest villager that spoke lately hears the emote', () => {
  const pet = { x: 10, y: 10 }, now = 100000;
  const spoke = new Map([['a', now - 1000], ['b', now - 2000], ['c', now - REPLY_WINDOW_MS - 1], ['d', now - 500], ['e', now - 500]]);
  const voices = [V('a', 14, 10), V('b', 11, 11), V('c', 10, 11), V('d', 10 + REPLY_RANGE + 1, 10), V('e', 10, 12, { asleep: true }), V('f', 10, 10)];
  assert.equal(hearer(voices, pet, spoke, now).id, 'b', 'a is farther; c spoke too long ago; d is out of range; e sleeps; f never spoke');
  assert.equal(hearer(voices, pet, spoke, now + REPLY_WINDOW_MS + 5000), null, 'a few seconds later nobody is waiting for an answer any more');
  assert.equal(hearer(voices, pet, new Map(), now), null, 'nobody spoke');
  assert.equal(hearer([], pet, spoke, now), null);
  const edge = new Map([['g', now - REPLY_WINDOW_MS]]);
  assert.equal(hearer([V('g', 10 + REPLY_RANGE, 10)], pet, edge, now).id, 'g', 'the window and the range include their edge');
  assert.equal(hearer([V('g', 10 + REPLY_RANGE, 10)], pet, edge, now + 1), null);
});

test('the timing: it answers after a moment, the emote first and then the line, all within a few seconds', () => {
  assert.ok(REPLY_DELAY_MS >= 300 && REPLY_DELAY_MS <= 1500);
  assert.ok(REPLY_EMOTE_MS >= 1000 && REPLY_EMOTE_MS <= 2500);
  assert.ok(REPLY_SAY_MS >= 2500 && REPLY_SAY_MS <= 5000);
  assert.ok(REPLY_WINDOW_MS >= 4200, 'longer than a villager keeps a line up (SAY_MS 4200)');
  assert.ok(SHOP_LINES.length > 0);
});
