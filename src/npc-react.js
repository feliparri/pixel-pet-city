// Answering a villager with an emoji (F.8): when a villager has just said something near the pet, the pet's emote (the same 👋 ❤️ 😄 🎉 and phrases every
// player can send) is answered by the nearest such villager with a short line, and for the happy ones an emote of its own. All of it is local to this screen:
// what goes over the network is only the player's own emote, which the others see like any emote. Lines are short, in neutral Spanish and kid-safe.
import { hashSeed } from './life.js';
import { EMOTES, EMOTE_TABS } from './protocol.js';

export const REPLY_WINDOW_MS = 6000;       // a villager hears the emote when it spoke this recently...
export const REPLY_RANGE = 6;              // ...and is this close (tiles)
export const REPLY_DELAY_MS = 800;         // it takes a moment to answer
export const REPLY_EMOTE_MS = 1500;        // its emote bubble comes first, then the line
export const REPLY_SAY_MS = 3600;          // how long its line stays up

/** What a villager answers to each of the player's emotes: its own emote (or none) and the pool of lines; {name} is the pet's name. */
export const REACTIONS = {
  heart: { emote: 'heart', lines: ['¡Qué bonito detalle, gracias!', 'Se me llenó el corazón de alegría.', '¡Qué cariñoso eres, {name}!', '¡Me encanta! Gracias, {name}.'] },
  smile: { emote: 'smile', lines: ['¡Jajaja, me haces reír!', '¡Qué linda sonrisa!', '¡Jiji! Ahora me río yo también.', 'Reír es lo mejor del día.'] },
  party: { emote: 'party', lines: ['¡Fiesta, fiesta!', '¡Vamos a celebrar!', '¡Qué alegría tan grande!', '¡Hurra, hurra, hurra!'] },
  wave: { emote: 'wave', lines: ['¡Hola, {name}!', '¡Hola, hola! ¿Cómo estás?', '¡Qué gusto saludarte!', '¡Buenas! Qué lindo día.'] },
  hola: { emote: 'wave', lines: ['¡Hola, {name}!', '¡Hola, hola! ¿Cómo estás?', '¡Qué gusto verte!', '¡Hola, amigo!'] },
  juguemos: { emote: null, lines: ['¡Me encantaría jugar!', 'Ahora no puedo, ¡pero luego sí!', '¡Qué buena idea! Más tarde jugamos.', '¡Juguemos en el parque!'] },
  chau: { emote: 'wave', lines: ['¡Chau, {name}! ¡Vuelve pronto!', '¡Hasta luego, amigo!', '¡Que te vaya muy bien!', '¡Nos vemos pronto!'] },
};

/** The emotes without lines of their own are answered by their tab's pool (mood, gestures, things) and the phrases by a kind one. */
const GROUP_REACTIONS = {
  mood: { emote: 'smile', lines: ['¡Te entiendo, {name}!', 'Los ánimos suben y bajan.', '¡Qué expresivo eres!', 'Cuéntame cómo te sientes.'] },
  gestures: { emote: 'wave', lines: ['¡Qué buen gesto, {name}!', '¡Igualmente, amigo!', '¡Me gusta tu estilo!', '¡Muy bien, {name}!'] },
  things: { emote: 'smile', lines: ['¡Qué buena idea, {name}!', '¡Me encanta eso!', '¡Qué divertido!', '¡Gran elección!'] },
  phrases: { emote: 'smile', lines: ['¡Qué amable, {name}!', '¡De nada, amigo!', '¡Muchas gracias a ti!', '¡Que tengas un lindo día!'] },
};
const groupOf = (emote) => (EMOTE_TABS.find((t) => t.ids.includes(emote)) || { id: 'phrases' }).id;

/** The answer of villager `villager` to emote `emote` from a pet called `name`; `n` (how many answers there were) moves it along the pool. -> { emote, line } or null. */
export function reactionTo(emote, villager, name = '', n = 0) {
  const r = Object.hasOwn(REACTIONS, emote) ? REACTIONS[emote] : Object.hasOwn(EMOTES, emote) ? GROUP_REACTIONS[groupOf(emote)] : null;
  if (!r) return null;
  const line = r.lines[(hashSeed(`${villager}:${emote}`) + n) % r.lines.length].replaceAll('{name}', name || 'amigo');
  return { emote: r.emote, line };
}

/**
 * Who hears the emote: the nearest of `voices` ([{ id, x, y, asleep? }]) that spoke within REPLY_WINDOW_MS of `now` (`spokeAt`: id -> the time it was last seen
 * speaking) and stands within REPLY_RANGE of the pet ({ x, y }); null when nobody does.
 */
export function hearer(voices, pet, spokeAt, now) {
  let best = null, bd = REPLY_RANGE + 1e-9;
  for (const v of voices) {
    const at = spokeAt.get(v.id);
    if (v.asleep || at === undefined || now - at > REPLY_WINDOW_MS) continue;
    const d = Math.hypot(v.x - pet.x, v.y - pet.y);
    if (d <= bd) { bd = d; best = v; }
  }
  return best;
}

/** Every emote the player can send has an answer (a test keeps this true when emotes are added). */
export const answersAll = () => Object.keys(EMOTES).every((e) => reactionTo(e, 'tito') !== null);
