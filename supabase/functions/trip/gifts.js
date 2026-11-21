// The seasonal gifts, as far as the server needs them (src/gifts.js is the town's side). While a season is on, 3 gifts lie in the town every 2 hours (and while
// Christmas is on, Santa drops 5 more every walk, `santa:<walk slot>:<n>`, paid more); where
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
export const REWARD_MIN = 10, REWARD_MAX = 30;               // a hidden gift pays 10 to 30 gold
export const GIFT_DAILY_CAP = 150;                           // the most gold gifts pay one pet in one town day, across trips (apart from the missions' own cap)
export const WALK_SLOT_MS = 40 * 60 * 1000;                  // Santa's walk grid: one walk per 40 min slot, its gifts gone before the slot ends (src/gifts.js)
export const WALK_START_MAX_MS = 28 * 60 * 1000;
export const SANTA_PER = 5;                                  // gifts per walk: n = 0..4
export const SANTA_REWARD_MIN = 20, SANTA_REWARD_MAX = 30;
export const SANTA_ID = 'santa';

export const slotOf = (ms) => Math.floor((ms - ANCHOR_MS) / SLOT_MS);
export const slotStart = (slot) => ANCHOR_MS + slot * SLOT_MS;
/** Is `slot` one a claim may name at server time `ms`: the current slot, or the previous one during the first GRACE_MS of this one? */
export function slotAccepted(slot, ms) {
  const cur = slotOf(ms);
  return slot === cur || (slot === cur - 1 && ms - slotStart(cur) < GRACE_MS);
}

export const walkSlotOf = (ms) => Math.floor((ms - ANCHOR_MS) / WALK_SLOT_MS);
export const walkSlotStart = (slot) => ANCHOR_MS + slot * WALK_SLOT_MS;
/** Is `slot` a walk slot a claim may name at server time `ms`: the current one, or the previous one during the first GRACE_MS of this one? */
export function walkAccepted(slot, ms) {
  const cur = walkSlotOf(ms);
  return slot === cur || (slot === cur - 1 && ms - walkSlotStart(cur) < GRACE_MS);
}

/** A 32 bit hash of a string (the same as hashSeed in src/life.js). */
export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}
/** The gold a hidden gift pays: 10..30, a pure function of its id. */
export const rewardOf = (id) => REWARD_MIN + (hashSeed(id) % (REWARD_MAX - REWARD_MIN + 1));
/** The gold one of Santa's gifts pays: 20..30. */
export const santaRewardOf = (id) => SANTA_REWARD_MIN + (hashSeed(id) % (SANTA_REWARD_MAX - SANTA_REWARD_MIN + 1));

// ---- the rare item in one of Santa's gifts ----------------------------------------------------------------------------------------------
export const SANTA_ITEMS = ['elf_hat', 'headphones', 'vr_goggles'];   // the wearables a Santa gift can hold instead of gold
export const SANTA_ITEM_ODDS = 20;                                    // about 1 gift in 20 holds one
/** Does this Santa gift hold an item (a pure function of its id, salted so it does not follow the gold)? */
export const santaHoldsItem = (id) => hashSeed(`${id}:item`) % SANTA_ITEM_ODDS === 0;
/** The items in the order this gift would give them: by a hash of the id and the key (ties by list order). */
export const santaItemOrder = (id) => SANTA_ITEMS.map((k, i) => [hashSeed(`${id}:${k}`), i, k]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
/** The item this gift gives: the first of santaItemOrder that `can(key)` accepts (not owned, not bought, board knows it), or null: the gift pays gold. */
export const santaItemFor = (id, can) => (santaHoldsItem(id) ? santaItemOrder(id).find(can) ?? null : null);

const ID_RE = /^([a-z]+):(\d{1,7}):(\d)$/;
/**
 * A gift id as { id, season, kind ('hidden' | 'santa'), slot, n, reward }, or null when it is not a valid one (an id has one spelling only: no leading zeros).
 * `<season>:<slot>:<n>` is a hidden gift (a 2 h slot, n < PER_SLOT); `santa:<walk slot>:<n>` is one of Santa's (a 40 min walk slot, n < SANTA_PER; season 'christmas').
 */
export function parseGiftId(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  if (!m) return null;
  const [, season, slot, n] = m;
  if (String(+slot) !== slot) return null;
  if (season === SANTA_ID) return +n < SANTA_PER ? { id, season: 'christmas', kind: 'santa', slot: +slot, n: +n, reward: santaRewardOf(id) } : null;
  if (!SEASON_KEYS.includes(season) || +n >= PER_SLOT) return null;
  return { id, season, kind: 'hidden', slot: +slot, n: +n, reward: rewardOf(id) };
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
