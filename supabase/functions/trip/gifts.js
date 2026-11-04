// The seasonal gifts, as far as the server needs them (src/gifts.js is the town's side). While a season is on, 3 gifts lie in the town every 2 hours; where
// they lie is the room's business (the server cannot know the room), so the server checks only the SHAPE of a claim: a real season that is on right now,
// the current slot (or the one before it, for 2 minutes), a gift number 0..2; it prices the gift itself from its id and bounds what forged claims can earn
// with one claim per gift id and a daily cap in coins per pet. The tables below mirror src/gifts.js and src/seasons.js; tests/gifts.test.js keeps them equal.
import { zonedToMs, zonedDate } from './missions.js';
import { SEASON_KEYS } from './events.js';

// ---- slots, ids and prices --------------------------------------------------------------------------------------------------------------
// A slot is a fixed 2 h window of UTC time: slot = floor((ms - ANCHOR_MS) / SLOT_MS). It is a plain UTC grid, so Chile's clock changes (two a year, at midnight
// of a Saturday night) neither skip nor repeat a slot nor change its length: they only move where a boundary falls on the Chile clock (on even hours in winter,
// UTC-4, and on odd hours in summer, UTC-3). A slot never spans two UTC days.
export const SLOT_MS = 2 * 3600 * 1000;
export const ANCHOR_MS = Date.UTC(2026, 0, 1);
export const PER_SLOT = 3;                                   // gifts per slot: n = 0..2
export const GRACE_MS = 120 * 1000;                          // the slot before the current one is still accepted for this long after it ended (a gift opened at the very edge)
export const REWARD_MIN = 2, REWARD_MAX = 5;
export const GIFT_DAILY_CAP = 20;                            // the most coins gifts pay one pet in one town day, across trips (apart from the missions' own cap)

export const slotOf = (ms) => Math.floor((ms - ANCHOR_MS) / SLOT_MS);
export const slotStart = (slot) => ANCHOR_MS + slot * SLOT_MS;
/** Is `slot` one a claim may name at server time `ms`: the current slot, or the previous one during the first GRACE_MS of this one? */
export function slotAccepted(slot, ms) {
  const cur = slotOf(ms);
  return slot === cur || (slot === cur - 1 && ms - slotStart(cur) < GRACE_MS);
}

/** A 32 bit hash of a string (the same as hashSeed in src/life.js). */
export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}
/** The coins a gift pays: 2..5, a pure function of its id. */
export const rewardOf = (id) => REWARD_MIN + (hashSeed(id) % (REWARD_MAX - REWARD_MIN + 1));

const ID_RE = /^([a-z]+):(\d{1,7}):(\d)$/;
/** A gift id (`<season>:<slot>:<n>`) as { id, season, slot, n, reward }, or null when it is not a valid one (an id has one spelling only: no leading zeros). */
export function parseGiftId(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  if (!m) return null;
  const [, season, slot, n] = m;
  if (!SEASON_KEYS.includes(season) || String(+slot) !== slot || +n >= PER_SLOT) return null;
  return { id, season, slot: +slot, n: +n, reward: rewardOf(id) };
}

// ---- which seasons are on ---------------------------------------------------------------------------------------------------------------
// The built-in yearly windows (SEASONS in src/seasons.js, Chile time) and the owner's overrides (table town_seasons), with the same rules as activeSeasons there.
/** key -> window(year) -> [start ms, end ms): the year is the one the window STARTS in. */
export const SEASON_WINDOWS = {
  halloween: (y) => [zonedToMs(`${y}-10-01`, '00:00'), zonedToMs(`${y}-11-02`, '00:00')],
  christmas: (y) => [zonedToMs(`${y}-11-02`, '00:00'), zonedToMs(`${y + 1}-01-02`, '00:00')],
};
const MODES = new Set(['dates', 'on', 'off']);
const chileYear = (ms) => Number(zonedDate(ms).slice(0, 4));
const windows = new Map();                                                          // 'key|year' -> the default window (the clock arithmetic below is not free: once per window)
const defaultWindow = (key, year) => { const id = `${key}|${year}`; let w = windows.get(id); if (!w) windows.set(id, w = SEASON_WINDOWS[key](year)); return w; };

/** The usable overrides of `rows` (table rows { season, year, mode, starts_at, ends_at }) as a map 'key|year' -> { mode, starts, ends }; junk rows are dropped. */
function indexRows(rows) {
  const by = new Map();
  if (Array.isArray(rows)) for (const r of rows) {
    if (!r || !Object.hasOwn(SEASON_WINDOWS, r.season) || !Number.isInteger(r.year) || !MODES.has(r.mode)) continue;
    const starts = r.starts_at ? Date.parse(r.starts_at) : NaN, ends = r.ends_at ? Date.parse(r.ends_at) : NaN;
    if (r.mode === 'dates' && !(Number.isFinite(starts) && Number.isFinite(ends) && ends > starts)) continue;
    by.set(`${r.season}|${r.year}`, { mode: r.mode, starts, ends });
  }
  return by;
}

function isOn(key, ms, cy, by) {
  for (let y = cy - 1; y <= cy + 1; y++) {                                        // a window belongs to the year it starts in, and may run into the next one
    const r = by.get(`${key}|${y}`);
    if (r?.mode === 'off') continue;
    const w = r?.mode === 'dates' ? [r.starts, r.ends] : defaultWindow(key, y);
    if (ms >= w[0] && ms < w[1]) return true;
    if (r?.mode === 'on' && ms < defaultWindow(key, y)[1]) return true;           // legacy forced on: from New Year's day of that year to the end of its default window
  }
  return false;
}

/** The seasons that are on at `ms`: a Set of keys, in the registry's order. `rows`: the overrides (none: the defaults). */
export function seasonsOn(ms, rows = []) {
  const out = new Set();
  if (!Number.isFinite(ms)) return out;
  const by = indexRows(rows), cy = chileYear(ms);
  for (const key of SEASON_KEYS) if (isOn(key, ms, cy, by)) out.add(key);
  return out;
}
