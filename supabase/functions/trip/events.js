// The town's scheduled sky shows (docs/town-events.md): the public list `events`, and the owner's `event-save` / `event-cancel`, which need the
// function secret ADMIN_KEY in the `x-admin-key` header. Pure functions like handlers.js: the database, the clock and the secret are injected.
import { sha256Hex, safeEqual } from './crypto.js';

/** Show kinds and how long each runs, in seconds (the same numbers as SHOWS in src/show/timeline.js; a test keeps them equal). */
export const SHOW_SECONDS = { fireworks: 38, meteors: 28, drones: 40, halloween: 40 };
export const DURATION_MIN_S = 20, DURATION_MAX_S = 600;    // an event may run from 20 s to 10 min (the same bounds as MIN_DUR / MAX_DUR in src/show/timeline.js; a test keeps them equal)
export const LIST_AHEAD_S = 7 * 86400;        // the list shows what starts within a week
export const SCHEDULE_AHEAD_S = 60 * 86400;   // an event can be scheduled up to 60 days ahead
export const LIST_DEFAULT = 20, LIST_MAX = 50;  // how many a list holds by default and at most (the admin page asks for all it can)
export const MAX_UPCOMING = 50;               // and the owner cannot pile up more than this many
/** The seasons the town knows (the keys of SEASONS in src/seasons.js; a test keeps them equal) and the modes an override can take. */
export const SEASON_KEYS = ['halloween', 'christmas'];
export const SEASON_MODES = ['dates', 'on', 'off'];
export const SEASON_SPAN_MAX_S = 400 * 86400;   // a window of custom dates is at most this long
export const SEED_MAX = 2147483647;
export const ATTEMPT_WINDOW_S = 600;
export const ATTEMPT_MAX = 10;                // wrong admin keys per window, per function instance (best effort: instances do not share memory)

const reply = (status, body) => ({ status, body });
const err = (status, error, extra = {}) => reply(status, { error, ...extra });
const iso = (ms) => new Date(ms).toISOString();
const nowMs = (deps) => (deps.nowMs ? deps.nowMs() : deps.nowS() * 1000);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** An event's length in seconds: the one it was saved with (`duration_s`, null for the events that predate it), else its kind's. */
const lengthS = (row) => (Number.isInteger(row.duration_s) && row.duration_s >= DURATION_MIN_S && row.duration_s <= DURATION_MAX_S ? row.duration_s : SHOW_SECONDS[row.kind]);
const publicEvent = (row) => ({ id: row.id, kind: row.kind, seed: row.seed, start_at: iso(Date.parse(row.start_at)), start_ms: Date.parse(row.start_at), duration_ms: lengthS(row) * 1000 });

/** An override as the town reads it: dates in ms (null unless mode 'dates'). */
const publicSeason = (row) => ({ season: row.season, year: row.year, mode: row.mode, starts_ms: row.starts_at ? Date.parse(row.starts_at) : null, ends_ms: row.ends_at ? Date.parse(row.ends_at) : null });
const yearOf = (deps) => new Date(nowMs(deps)).getUTCFullYear();

function parseJson(bytes) {
  if (!bytes || !bytes.length) return { v: {} };
  try {
    const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return v && typeof v === 'object' && !Array.isArray(v) ? { v } : { fail: err(400, 'bad_json') };
  } catch { return { fail: err(400, 'bad_json') }; }
}

/** Is the request the owner's? Returns null when it is, else the answer to send. 503 when no ADMIN_KEY is set; wrong keys are counted and slowed down. */
async function adminCheck(req, deps) {
  if (!deps.adminKey) return err(503, 'admin_disabled');
  const now = deps.nowS();
  const attempts = deps.attempts || (deps.attempts = []);
  while (attempts.length && attempts[0] < now - ATTEMPT_WINDOW_S) attempts.shift();
  if (attempts.length >= ATTEMPT_MAX) return err(429, 'too_many_attempts');
  const given = req.headers['x-admin-key'];
  const enc = new TextEncoder();
  const a = await sha256Hex(enc.encode(String(deps.adminKey))), b = await sha256Hex(enc.encode(typeof given === 'string' ? given : ''));   // equal-length digests: a constant-time compare
  if (typeof given === 'string' && safeEqual(a, b)) return null;
  attempts.push(now);
  return err(401, 'bad_admin_key');
}

/** Upcoming and running shows, the season overrides of last, this and next year, and the server's clock (ms), so every player can line up with the same moment. */
export async function events(req, deps) {
  const p = parseJson(req.body);                                              // optional: { ahead_days: 1..60, limit: 1..50 } (a GET has no body)
  if (p.fail) return p.fail;
  const ahead = Number.isInteger(p.v.ahead_days) && p.v.ahead_days >= 1 && p.v.ahead_days <= SCHEDULE_AHEAD_S / 86400 ? p.v.ahead_days * 86400 : LIST_AHEAD_S;
  const limit = Number.isInteger(p.v.limit) && p.v.limit >= 1 && p.v.limit <= LIST_MAX ? p.v.limit : LIST_DEFAULT;
  const t = nowMs(deps);
  const longest = DURATION_MAX_S * 1000;                                     // a running show may be the longest one
  const rows = await deps.db.listEvents(iso(t - longest), iso(t + ahead * 1000));
  const list = rows.map(publicEvent).filter((e) => e.start_ms + e.duration_ms > t).sort((x, y) => x.start_ms - y.start_ms).slice(0, limit);
  let seasons = [];                                                          // the overrides are a bonus: if they cannot be read (no table yet, a db error) the shows still come and the town uses the defaults
  try { const y = yearOf(deps); seasons = (await deps.db.listSeasons(y - 1, y + 1)).map(publicSeason); } catch (e) { deps.log?.('events/seasons', e); }
  return reply(200, { now: t, events: list, seasons });
}

export async function eventSave(req, deps) {
  const denied = await adminCheck(req, deps);
  if (denied) return denied;
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const { kind, seed, start_at: startAt, duration_s: durationS } = p.v;
  if (typeof kind !== 'string' || !Object.hasOwn(SHOW_SECONDS, kind)) return err(400, 'bad_kind');
  let s = seed;
  if (s === undefined) { const r = deps.randomBytes(4); s = ((r[0] << 24) | (r[1] << 16) | (r[2] << 8) | r[3]) >>> 1; }
  if (!Number.isInteger(s) || s < 0 || s > SEED_MAX) return err(400, 'bad_seed');
  if (durationS != null && (!Number.isInteger(durationS) || durationS < DURATION_MIN_S || durationS > DURATION_MAX_S)) return err(400, 'bad_duration');
  if (typeof startAt !== 'string' || !ISO_RE.test(startAt) || Number.isNaN(Date.parse(startAt))) return err(400, 'bad_start');
  const start = Date.parse(startAt), t = nowMs(deps);
  if (start <= t) return err(400, 'start_in_the_past');
  if (start > t + SCHEDULE_AHEAD_S * 1000) return err(400, 'start_too_far');
  if ((await deps.db.countUpcoming(iso(t))) >= MAX_UPCOMING) return err(429, 'too_many_events');
  const row = { id: deps.uuid(), kind, seed: s, start_at: iso(start), created_at: iso(t), cancelled_at: null, ...(durationS != null ? { duration_s: durationS } : {}) };      // no column value for the kind's own length
  await deps.db.insertEvent(row);
  return reply(201, { event: publicEvent(row) });
}

export async function eventCancel(req, deps) {
  const denied = await adminCheck(req, deps);
  if (denied) return denied;
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const id = p.v.id;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return err(400, 'bad_id');
  const row = await deps.db.getEvent(id);
  if (!row) return err(404, 'unknown_event');
  if (row.cancelled_at) return reply(200, { id, cancelled: true, replayed: true });
  await deps.db.cancelEvent(id, iso(nowMs(deps)));
  return reply(200, { id, cancelled: true, replayed: false });
}

/** The (season, year) of a season call, validated: { season, year } or { fail }. */
function seasonKey(v, deps) {
  if (typeof v.season !== 'string' || !SEASON_KEYS.includes(v.season)) return { fail: err(400, 'bad_season') };
  const y = yearOf(deps);
  if (!Number.isInteger(v.year) || v.year < y - 1 || v.year > y + 5) return { fail: err(400, 'bad_year') };
  return { season: v.season, year: v.year };
}

const isoOk = (s) => typeof s === 'string' && ISO_RE.test(s) && !Number.isNaN(Date.parse(s));

/** The owner's override of a season for a year: mode 'dates' (starts_at and ends_at), 'on' (forced on) or 'off' (forced off). Replaces the one there was. */
export async function seasonSave(req, deps) {
  const denied = await adminCheck(req, deps);
  if (denied) return denied;
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const k = seasonKey(p.v, deps);
  if (k.fail) return k.fail;
  const { mode, starts_at: startsAt, ends_at: endsAt } = p.v;
  if (typeof mode !== 'string' || !SEASON_MODES.includes(mode)) return err(400, 'bad_mode');
  let starts = null, ends = null;
  if (mode === 'dates') {
    if (!isoOk(startsAt)) return err(400, 'bad_start');
    if (!isoOk(endsAt)) return err(400, 'bad_end');
    starts = Date.parse(startsAt); ends = Date.parse(endsAt);
    if (ends <= starts || ends - starts > SEASON_SPAN_MAX_S * 1000) return err(400, 'bad_range');
  }
  const row = { season: k.season, year: k.year, mode, starts_at: starts == null ? null : iso(starts), ends_at: ends == null ? null : iso(ends), updated_at: iso(nowMs(deps)) };
  await deps.db.upsertSeason(row);
  return reply(200, { season: publicSeason(row) });
}

/** Back to the built-in dates: deletes the override of a season for a year (asking again is fine). */
export async function seasonClear(req, deps) {
  const denied = await adminCheck(req, deps);
  if (denied) return denied;
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const k = seasonKey(p.v, deps);
  if (k.fail) return k.fail;
  const had = await deps.db.deleteSeason(k.season, k.year);
  return reply(200, { season: k.season, year: k.year, cleared: true, replayed: !had });
}
