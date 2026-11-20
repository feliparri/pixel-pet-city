// The shows the town runs by itself during the Christmas season, with no `town_events` row: "Noche de Navidad" at Dec 25 00:00 and fireworks for the
// New Year at Jan 1 00:00, both America/Santiago. Like the seasons they are a pure function of the server's clock, so every screen has the same show at
// the same moment. They run only while the Christmas season is on at their start (an owner override of 'off', or dates that exclude the moment, cancel
// them) and last AUTO_SHOW_S seconds (10 minutes). The seed is the year and the day, so each show is the same everywhere and differs from year to year.
import { zonedToMs } from './admin-time.js';
import { activeSeasons } from './seasons.js';

export const AUTO_SHOW_S = 600;
export const AUTO_LEAD_MS = 120_000;                  // an auto show is listed this long before it starts (for the "in 1 minute" toast and the camera)
const memo = new Map();

/** The two automatic shows around the Chile year `y`: Jan 1 of `y` (fireworks) and Dec 25 of `y` ("Noche de Navidad"). */
function yearShows(y) {
  let l = memo.get(y);
  if (!l) {
    l = [
      { id: `auto-newyear-${y}`, kind: 'fireworks', seed: y * 100 + 1, start_ms: zonedToMs(`${y}-01-01`, '00:00') },
      { id: `auto-xmas-${y}`, kind: 'christmas', seed: y * 100 + 25, start_ms: zonedToMs(`${y}-12-25`, '00:00') },
    ].map((e) => ({ ...e, start_at: new Date(e.start_ms).toISOString(), duration_ms: AUTO_SHOW_S * 1000, auto: true }));
    memo.set(y, l);
  }
  return l;
}

/**
 * The automatic shows that are running at server time `ms` or start within AUTO_LEAD_MS, as event rows like the server's:
 * [{ id, kind, seed, start_at, start_ms, duration_ms, auto: true }]. `overrides` are the season overrides of the `events` answer.
 */
export function autoEvents(ms, overrides = []) {
  if (!Number.isFinite(ms)) return [];
  const y = new Date(ms).getUTCFullYear(), out = [];
  for (const yr of [y - 1, y, y + 1]) for (const e of yearShows(yr)) {
    if (ms < e.start_ms - AUTO_LEAD_MS || ms >= e.start_ms + e.duration_ms) continue;
    if (activeSeasons(e.start_ms, overrides).has('christmas')) out.push(e);
  }
  return out;
}
