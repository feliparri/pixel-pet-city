// The town's seasons (Halloween, ...): art and behaviour ship in the code, dormant; each season has a built-in yearly window in Chile time
// (America/Santiago), so it goes live by itself. The owner's overrides (docs/trip-api.md, "Seasons") are other dates for one year, forced on, or
// forced off; they come with the `events` list. `year` of a window is the year it STARTS in (a Dec -> Jan season belongs to the December's year).
// Pure functions of the server's clock: every player sees the same. A missing or failed fetch means no overrides, i.e. the defaults.
import { zonedToMs, msToZoned } from './admin-time.js';

/** The registry: key -> { label (Spanish, neutral), window(year) -> [start ms, end ms) } (Halloween: Oct 24 00:00 to Nov 1 06:00, when the town's day turns). */
export const SEASONS = {
  halloween: { label: 'Halloween', window: (y) => [zonedToMs(`${y}-10-24`, '00:00'), zonedToMs(`${y}-11-01`, '06:00')] },
};
export const SEASON_KEYS = Object.keys(SEASONS);
const MODES = new Set(['dates', 'on', 'off']);

const windows = new Map();                                                  // 'key|year' -> the default window (the registry's own, so keyed by registry too)
/** The default window of a season for a year: [start ms, end ms). Built once. */
export function defaultWindow(key, year, registry = SEASONS) {
  const id = `${key}|${year}`, c = registry === SEASONS ? windows : null;
  let w = c && c.get(id);
  if (!w) { w = registry[key].window(year); c?.set(id, w); }
  return w;
}

/** The town's calendar year (Chile) at `ms`. */
export const chileYear = (ms) => Number(msToZoned(ms).date.slice(0, 4));

/** The overrides that are usable: [{ season, year, mode, starts_ms, ends_ms }] -> a map 'key|year' -> row. Junk rows are dropped. */
function indexRows(overrides, registry) {
  const by = new Map();
  if (Array.isArray(overrides)) for (const r of overrides) {
    if (!r || !Object.hasOwn(registry, r.season) || !Number.isInteger(r.year) || !MODES.has(r.mode)) continue;
    if (r.mode === 'dates' && !(Number.isFinite(r.starts_ms) && Number.isFinite(r.ends_ms) && r.ends_ms > r.starts_ms)) continue;
    by.set(`${r.season}|${r.year}`, r);
  }
  return by;
}

/** The season's window for `year` as the override changes it: [s, e], or null when forced off. */
function effective(key, year, by, registry) {
  const r = by.get(`${key}|${year}`);
  if (r?.mode === 'off') return null;
  return r?.mode === 'dates' ? [r.starts_ms, r.ends_ms] : defaultWindow(key, year, registry);
}

/** Is `key` on at `ms` (given the Chile year `cy` of it)? */
function isOn(key, ms, cy, by, registry) {
  for (let y = cy - 1; y <= cy + 1; y++) {                                 // a window belongs to the year it starts in, and may run into the next one
    const r = by.get(`${key}|${y}`);
    if (r?.mode === 'off') continue;
    const w = effective(key, y, by, registry);
    if (w && ms >= w[0] && ms < w[1]) return true;
    if (r?.mode === 'on' && ms < defaultWindow(key, y, registry)[1]) return true;     // legacy forced on: from New Year's day of that year to the end of its default window (the admin sends dates now)
  }
  return false;
}

/**
 * The seasons that are on at server time `ms`: a Set of keys. `overrides` are the rows of the `events` answer (none: the defaults). `registry` is for tests.
 * Per override: mode 'dates' replaces that year's window, 'on' (legacy) is on until the end of that year's default window, 'off' turns that year's window off.
 */
export function activeSeasons(ms, overrides = [], registry = SEASONS) {
  const out = new Set();
  if (!Number.isFinite(ms)) return out;
  const by = indexRows(overrides, registry), cy = chileYear(ms);
  for (const key of Object.keys(registry)) if (isOn(key, ms, cy, by, registry)) out.add(key);
  return out;
}

/** "Lanzar ahora" at `ms`: { year, startsMs, endsMs } to save as an override of dates: from now to the end of this Chile year's default window, or, when that is already over, for the season's default length. */
export function launchWindow(key, ms, registry = SEASONS) {
  const year = chileYear(ms), [s, e] = defaultWindow(key, year, registry);
  return { year, startsMs: ms, endsMs: e > ms ? e : ms + (e - s) };
}

/**
 * What the admin page shows of one season at `ms`: { year (the one an override is saved for), window [s, e] (null when forced off), mode ('default'|'dates'|'on'|'off'),
 * state ('on' | 'scheduled' | 'off') }. The year is the current window's, else the next one's (this Chile year's).
 */
export function seasonStatus(key, ms, overrides = [], registry = SEASONS) {
  const by = indexRows(overrides, registry), cy = chileYear(ms);
  const active = isOn(key, ms, cy, by, registry);
  const year = defaultWindow(key, cy - 1, registry)[1] > ms ? cy - 1 : ms >= defaultWindow(key, cy, registry)[1] ? cy + 1 : cy;
  const r = by.get(`${key}|${year}`), window = effective(key, year, by, registry);
  const state = active ? 'on' : window && window[0] > ms ? 'scheduled' : 'off';
  return { year, window, mode: r ? r.mode : 'default', state, active };
}

/** The development shortcut: ?dev=1&season=halloween[,other] forces those on, ?dev=1&season=none all off; ?dev=1&halloween=1|0 is the same for Halloween. A Set, or null (no shortcut). */
export function parseDevSeasons(search, registry = SEASONS) {
  const p = new URLSearchParams(search);
  if (p.get('dev') !== '1') return null;
  if (p.has('season')) return new Set(p.get('season').split(',').filter((k) => Object.hasOwn(registry, k)));
  if (p.has('halloween')) return new Set(p.get('halloween') === '1' ? ['halloween'] : []);
  return null;
}
