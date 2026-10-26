// The villagers' missions, as far as the server needs them. The town (src/missions.js) picks each villager's mission of the day from the room's code,
// and the server cannot know the room (a pet may be in any room), so it does not regenerate it: it checks the SHAPE of the claim (a real villager, a
// real template within its limits, today's town day), prices it itself from the template, and bounds what a forged claim can earn with one mission
// per villager per day and a daily cap per pet across trips. src/missions.js mirrors the tables below; tests/farm-missions.test.js keeps them equal.

export const DAILY_CAP = 50;                                                  // the most gold missions pay one pet in one town day, across trips
export const VILLAGER_IDS = ['tito', 'lula', 'pipo', 'bruno', 'chispa', 'perla'];
/** What each kind of mission asks: the things it names (kinds), how many (min..max) and the gold per unit (reward = per x n). */
export const MISSION_TYPES = {
  harvest: { kinds: ['carrot', 'lettuce', 'pumpkin', 'wheat'], min: 2, max: 3, per: 3 },
  bring: { kinds: ['apple', 'pear', 'orange'], min: 2, max: 3, per: 3 },
  water: { kinds: [], min: 2, max: 3, per: 3 },
  feed: { kinds: [], min: 2, max: 3, per: 4 },
};

/** The gold a mission pays: a pure function of its template. */
export const rewardOf = (type, n) => MISSION_TYPES[type].per * n;

const ID_RE = /^(\d{4}-\d{2}-\d{2}):([a-z]+):([a-z]+):([a-z]+|-):(\d)$/;
/**
 * A mission id as { id, day, villager, type, kind (null when the type has none), n, reward }, or null when it is not a valid one.
 * An id is `<day>:<villager>:<type>:<kind or ->:<n>` (day = the town day, 'YYYY-MM-DD').
 */
export function parseMission(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  if (!m) return null;
  const [, day, villager, type, kind, n] = m, t = Object.hasOwn(MISSION_TYPES, type) ? MISSION_TYPES[type] : null;
  if (!t || !VILLAGER_IDS.includes(villager) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return null;
  if (t.kinds.length ? !t.kinds.includes(kind) : kind !== '-') return null;
  if (+n < t.min || +n > t.max) return null;
  return { id, day, villager, type, kind: kind === '-' ? null : kind, n: +n, reward: rewardOf(type, +n) };
}

// ---- the town day ---------------------------------------------------------------------------------------------------------------
// The villagers' day runs 06:00 to 06:00 in America/Santiago (src/npc-world.js dayOf). Copied from src/admin-time.js so the function needs no import
// outside its folder; tests/farm-missions.test.js compares both over a year, clock changes included.
const ZONE = 'America/Santiago', DAY_START = '06:00';

function zoneOffset(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}
function zonedToMs(date, time) {
  const [y, mo, da] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, da, h, mi);
  let ms = naive - zoneOffset(naive) * 60000;
  ms = naive - zoneOffset(ms) * 60000;
  return ms;
}
function zonedDate(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const addDay = (date, n) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** The town day ('YYYY-MM-DD') that holds the UTC instant `ms`: the Chile date, or the day before while it is not yet 06:00. */
export function townDay(ms) {
  const date = zonedDate(ms);
  return ms < zonedToMs(date, DAY_START) ? addDay(date, -1) : date;
}
