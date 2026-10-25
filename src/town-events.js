// The town's scheduled sky shows, as the running town sees them: it asks the server for the list (on start, every few minutes, and again
// shortly before the next start so a cancellation is noticed), keeps the offset between the server's clock and this device's, and every frame
// answers "which show is running, and how many seconds into it?". The same moment on every screen is what makes the show a shared one.
// The pure parts (showAt, warningsAt, nextPollDelay, parseDevEvent) are tested; the controller takes its clock, timers and server as parameters.
import { SHOWS, showEnd } from './show/timeline.js';
import { clockOffset } from './events-client.js';

export const WARN_MS = 60_000;          // "in 1 minute" toast
export const POLL_MS = 20_000;          // how often the list is asked for: a show launched from the admin page reaches everyone before it starts
export const LAUNCH_NOW_MS = POLL_MS + 5_000;    // the admin's "Lanzar ya": this far ahead, so every town has asked once before it starts
export const RECHECK_BEFORE_MS = 45_000;    // and once more this long before the next start
export const RETRY_MS = 60_000;         // after a failed ask

const valid = (e) => !!e && typeof e.id === 'string' && Object.hasOwn(SHOWS, e.kind) && Number.isInteger(e.seed) && Number.isFinite(e.start_ms);

/** What runs at server time `sn` (ms): { event, ts (seconds into the show), cut (seconds or null), dur } or null. `cuts` maps an event id to the show time at which the player pressed Volver. */
export function showAt(events, sn, cuts = {}) {
  for (const e of events) {
    if (!valid(e)) continue;
    const dur = SHOWS[e.kind].dur, cut = cuts[e.id] ?? null, ts = (sn - e.start_ms) / 1000;
    if (ts >= 0 && ts < showEnd(dur, cut == null ? Infinity : cut)) return { event: e, ts, cut, dur };
  }
  return null;
}

/** The events that start within the next WARN_MS and have not been warned about: [{ event, text }]. */
export function warningsAt(events, sn, warned) {
  return events.filter((e) => valid(e) && !warned.has(e.id) && e.start_ms - sn > 0 && e.start_ms - sn <= WARN_MS).map((e) => ({ event: e, text: `¡${SHOWS[e.kind].label} en 1 minuto!` }));
}

/** Milliseconds until the list should be asked for again: POLL_MS, sooner when an event is about to start (RECHECK_BEFORE_MS before it). */
export function nextPollDelay(events, sn) {
  let d = POLL_MS;
  for (const e of events) if (valid(e)) { const left = e.start_ms - RECHECK_BEFORE_MS - sn; if (left > 1000 && left < d) d = left; }
  return d;
}

/** The development shortcut ?dev=1&event=fireworks:5[:seed]: a fake show that starts in N seconds. Needs dev=1. */
export function parseDevEvent(search, nowMs) {
  const p = new URLSearchParams(search);
  if (p.get('dev') !== '1' || !p.has('event')) return [];
  const [kind, secs, seed] = p.get('event').split(':');
  const n = Number(secs === undefined || secs === '' ? 10 : secs), s = seed === undefined ? 7 : Number(seed);
  if (!Object.hasOwn(SHOWS, kind) || !Number.isFinite(n) || !Number.isInteger(s) || s < 0) return [];
  return [{ id: 'dev-show', kind, seed: s, start_at: new Date(nowMs + n * 1000).toISOString(), start_ms: nowMs + n * 1000, duration_ms: SHOWS[kind].dur * 1000 }];
}

/**
 * The controller. api: { list() } (events-client); devEvents: a fixed list instead of the server; notify(text): a toast; onShow(active): the
 * "Volver" button's visibility. tick(where) every frame, where = 'hd' (the HD-2D town: it draws the show), 'flat' or 'inside' (they only get a toast).
 */
export function createTownEvents({ api, nowMs = () => Date.now(), devEvents = null, notify = () => {}, onShow = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let events = devEvents || [], offset = 0, timer = null, alive = true, active = false;
  const cuts = {}, warned = new Set(), invited = new Set();
  const serverNow = () => nowMs() + offset;

  async function poll() {
    if (!alive || devEvents) return;
    clearTimer(timer);
    const sent = nowMs();
    const r = await api.list();
    if (!alive) return;
    const got = nowMs();
    let delay;
    if (r.ok && Array.isArray(r.body?.events) && Number.isFinite(r.body.now)) {
      offset = clockOffset(r.body.now, sent, got);
      events = r.body.events.filter(valid);
      delay = nextPollDelay(events, serverNow());
    } else delay = RETRY_MS;
    timer = setTimer(poll, delay);
  }

  return {
    start() {
      poll();
      // a phone that was in the background (timers paused) asks again as soon as it is back
      globalThis.document?.addEventListener?.('visibilitychange', () => { if (globalThis.document.visibilityState === 'visible') poll(); });
    },
    stop() { alive = false; clearTimer(timer); },
    serverNow,
    /** Per frame: sends the toasts that are due and returns the show to draw ({ kind, seed, ts, cut }) or null. */
    tick(where = 'hd') {
      const sn = serverNow();
      for (const w of warningsAt(events, sn, warned)) { warned.add(w.event.id); notify(w.text); }
      const cur = showAt(events, sn, cuts);
      const on = !!cur && cur.cut == null;
      if (on !== active) { active = on; onShow(on); }
      if (cur && where !== 'hd' && !invited.has(cur.event.id)) {
        invited.add(cur.event.id);
        notify(where === 'inside' ? '¡Hay un show en el cielo! Sal a la calle para verlo.' : '¡Hay un show en el cielo! Activa «Efectos» para verlo.');
      }
      return cur ? { kind: cur.event.kind, seed: cur.event.seed, ts: cur.ts, cut: cur.cut } : null;
    },
    /** The player's "Volver": the show winds down on this screen only. */
    cut() {
      const cur = showAt(events, serverNow(), cuts);
      if (cur && cur.cut == null) { cuts[cur.event.id] = cur.ts; active = false; onShow(false); return true; }
      return false;
    },
    get events() { return events; },
  };
}
