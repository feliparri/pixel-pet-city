// The villagers' missions (F.5): each villager asks for one thing per town day (06:00 to 06:00 America/Santiago, like the villagers' routines), the same
// for everyone in the room: harvest N of a crop, bring N pieces of fruit, water N plots or feed the animals N times. The mission is a pure function of
// (room code, day, villager). Doing it is counted from what the pet did on the farm today (src/farm-world.js memory) and from the Canasta; the reward is
// paid in real gold by the server (docs/trip-api.md, trip-mission), which checks the claim's shape and caps what a pet can earn in a day.
import { hashSeed, mulberry32 } from './life.js';
import { NAMES } from './canasta.js';
import { VILLAGERS } from './npcs.js';

/** The tables below mirror supabase/functions/trip/missions.js (tests/farm-missions.test.js keeps them equal). */
export const DAILY_CAP = 50;
export const MISSION_TYPES = {
  harvest: { kinds: ['carrot', 'lettuce', 'pumpkin', 'wheat'], min: 2, max: 3, per: 3 },
  bring: { kinds: ['apple', 'pear', 'orange'], min: 2, max: 3, per: 3 },
  water: { kinds: [], min: 2, max: 3, per: 3 },
  feed: { kinds: [], min: 2, max: 3, per: 4 },
};
const TYPE_ORDER = Object.keys(MISSION_TYPES);
export const rewardOf = (type, n) => MISSION_TYPES[type].per * n;

const ID_RE = /^(\d{4}-\d{2}-\d{2}):([a-z]+):([a-z]+):([a-z]+|-):(\d)$/;
/** A mission id (`<day>:<villager>:<type>:<kind or ->:<n>`) as { id, day, villager, type, kind, n, reward }, or null: the same check the server makes. */
export function parseMission(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  if (!m) return null;
  const [, day, villager, type, kind, n] = m, t = Object.hasOwn(MISSION_TYPES, type) ? MISSION_TYPES[type] : null;
  if (!t || !VILLAGERS.some((v) => v.id === villager) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return null;
  if (t.kinds.length ? !t.kinds.includes(kind) : kind !== '-') return null;
  if (+n < t.min || +n > t.max) return null;
  return { id, day, villager, type, kind: kind === '-' ? null : kind, n: +n, reward: rewardOf(type, +n) };
}

/** The mission villager `villager` gives in room `room` on town day `day` ('YYYY-MM-DD'). */
export function missionFor(room, day, villager) {
  const rand = mulberry32(hashSeed(`${room}:mission:${day}:${villager}`));
  const type = TYPE_ORDER[Math.floor(rand() * TYPE_ORDER.length)], t = MISSION_TYPES[type];
  const kind = t.kinds.length ? t.kinds[Math.floor(rand() * t.kinds.length)] : '-';
  const n = t.min + Math.floor(rand() * (t.max - t.min + 1));
  return parseMission(`${day}:${villager}:${type}:${kind}:${n}`);
}

/** The icon (src/art/produce.js) a mission shows: the crop or fruit, the full bucket for watering, wheat for the animals. */
export const missionIcon = (m) => (m.kind || (m.type === 'water' ? 'bucket-full' : 'wheat'));

/** Every villager's mission of the day, in the villagers' order. */
export const missionsOf = (room, day) => VILLAGERS.map((v) => missionFor(room, day, v.id));

// ---- texts ----------------------------------------------------------------------------------------------------------------------

const THING = { wheat: ['espiga de trigo', 'espigas de trigo'] };                       // what a mission calls a crop (the Canasta's own name for wheat is just "trigo")
const noun = (kind, n) => (THING[kind] || NAMES[kind])[n === 1 ? 0 : 1];

/** The request, as short as a speech bubble allows. */
export function missionText(m) {
  switch (m.type) {
    case 'harvest': return `Cosecha ${m.n} ${noun(m.kind, m.n)}`;
    case 'bring': return `Tráeme ${m.n} ${noun(m.kind, m.n)}, por favor`;
    case 'water': return `Riega ${m.n} parcelas de la huerta`;
    default: return `Alimenta a los animales ${m.n} veces`;
  }
}

const THANKS = ['¡Muchas gracias!', '¡Qué buen ayudante!', '¡Justo lo que necesitaba!', '¡Eres un amigo!', '¡Qué bien lo hiciste!', '¡Gracias, vecino!'];
export const thanksFor = (villager) => THANKS[hashSeed(villager) % THANKS.length];
export const DONE_LINES = ['Hoy ya me ayudaste, ¡gracias!', 'Por hoy estamos al día. ¡Vuelve mañana!'];
export const doneLine = (villager) => DONE_LINES[hashSeed(`${villager}:done`) % DONE_LINES.length];
export const CAPPED_LINE = '¡Gracias! Hoy ya no puedo pagarte más oro.';
export const NOT_READY = (have, need) => `Llevas ${have} de ${need}`;
export const GOLD_POP = (gold) => `+${gold} de oro`;
export const MISSIONS_CLOSED = 'Tu placa necesita actualizarse para ganar oro con las misiones.';
export const MISSIONS_TITLE = 'Misiones';
export const MISSIONS_HINT = (cap) => `Cada vecino pide algo nuevo cada día. Con las misiones ganas oro de verdad, hasta ${cap} al día.`;

/** The Spanish sentence for a refused claim (`r` is { error }), or null when the villager's own line says it. */
export function claimErrorText(r) {
  switch (r.error) {
    case 'mission_expired': return 'Ese pedido ya venció: mañana habrá otro.';
    case 'trip_over': return 'El viaje terminó.';
    case 'bad_session': return 'Tu sesión se cerró. Vuelve a entrar con el código de tu mascota.';
    case 'shop_closed': return MISSIONS_CLOSED;
    case 'conflict': return 'Algo cambió justo ahora. Inténtalo otra vez.';
    case 'network': return 'No hay conexión. Revisa tu internet e inténtalo otra vez.';
    case 'bad_mission': return 'Ese pedido no es válido.';
    default: return 'No se pudo completar. Inténtalo otra vez.';
  }
}

// ---- progress -------------------------------------------------------------------------------------------------------------------

/** How far the pet is: { have, need } from the day's actions not yet handed in (mem.count) and the Canasta (bring: what it carries now). */
export function progressOf(m, { mem, basket }) {
  const have = m.type === 'bring' ? basket.count(m.kind) : m.type === 'harvest' ? mem.count('harvest', m.kind) : mem.count(m.type);
  return { have: Math.min(have, m.n), need: m.n };
}

/**
 * Where a mission stands for this pet: { state: 'open' | 'ready' | 'done', have, need }. `doneIds` are the villagers the server says were paid today.
 * A mission is done once it was claimed (the day's memory) or the server says the villager already paid.
 */
export function statusOf(m, { mem, basket, paidToday = [] }) {
  const { have, need } = progressOf(m, { mem, basket });
  if (mem.missionDone(m.id) || paidToday.includes(m.villager)) return { state: 'done', have: need, need };
  return { state: have >= need ? 'ready' : 'open', have, need };
}

/** The rows of the "Misiones" panel: [{ villager, name, text, reward, icon, state, have, need }], in the villagers' order. */
export function missionRows(room, day, { mem, basket, paidToday = [] }) {
  return VILLAGERS.map((v) => {
    const m = missionFor(room, day, v.id);
    return { villager: v.id, name: v.name, text: missionText(m), reward: m.reward, icon: missionIcon(m), ...statusOf(m, { mem, basket, paidToday }) };
  });
}

/** What a claim reply teaches the mission state kept with the trip ({ day, cap, earned, done }); a refusal that says `done` or `cap_reached` teaches it too. */
export function missionsAfterClaim(prev, m, r) {
  const base = prev && prev.day === m.day ? prev : { day: m.day, cap: DAILY_CAP, earned: 0, done: [] };
  if (r.ok) return { ...base, earned: Number.isInteger(r.earned_today) ? r.earned_today : base.earned, done: base.done.includes(m.villager) ? base.done : [...base.done, m.villager] };
  if (r.error === 'done') return { ...base, earned: Number.isInteger(r.earned_today) ? r.earned_today : base.earned, done: base.done.includes(m.villager) ? base.done : [...base.done, m.villager] };
  if (r.error === 'cap_reached') return { ...base, earned: Number.isInteger(r.earned_today) ? r.earned_today : DAILY_CAP };
  return base;
}

/** The mission ledger of a claim reply, cleaned: { day, cap, earned, done: [villager ids] } (an empty one when the server sent none). */
export function parseMissions(raw) {
  if (!raw || typeof raw !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) return { day: '', cap: DAILY_CAP, earned: 0, done: [] };
  return { day: raw.day, cap: DAILY_CAP, earned: Number.isInteger(raw.earned) && raw.earned >= 0 ? Math.min(raw.earned, DAILY_CAP) : 0, done: (Array.isArray(raw.done) ? raw.done : []).filter((id) => VILLAGERS.some((v) => v.id === id)) };
}
