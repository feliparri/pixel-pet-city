// The arcade's small memories, all kept in this browser and all guarded (private mode, a full disk or no storage at all must never break a run):
// the best score of each game, and the stars the arcade pays (one per run that reaches its goal, a few a day, the same local-only rule as the town's other games).
export const BEST_PREFIX = 'city.arcade.best.';
export const STARS_KEY = 'city.arcade.stars';
export const STAR_CAP_PER_DAY = 3;

const read = (storage, key) => { try { return storage ? storage.getItem(key) : null; } catch { return null; } };
const write = (storage, key, value) => { try { if (storage) storage.setItem(key, value); } catch { /* private mode: it lives for this visit only */ } };
const whole = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** The best score of each game. submit(game, score) -> { best, isNew } (isNew only when it beat a best that was greater than 0). */
export function createBestStore(storage) {
  const mem = new Map();
  const get = (game) => {
    if (mem.has(game)) return mem.get(game);
    const v = whole(Number(read(storage, BEST_PREFIX + game)));
    mem.set(game, v);
    return v;
  };
  return {
    get,
    submit(game, score) {
      const s = whole(score), prev = get(game);
      if (s > prev) { mem.set(game, s); write(storage, BEST_PREFIX + game, String(s)); return { best: s, isNew: prev > 0 }; }
      return { best: prev, isNew: false };
    },
  };
}

/** Stars for a run: one when it reached the goal (the station, the house) and today's cap is not spent. A run that ended in a crash earns none, whatever its score. */
export const starsFor = (arrived, earnedToday, cap = STAR_CAP_PER_DAY) => (arrived === true && earnedToday < cap ? 1 : 0);

/** Today's stars from this arcade, per local day: { earned(), award(n) }. `today()` gives the day string (e.g. 2026-11-21). */
export function createDailyStars(storage, today) {
  const load = () => {
    try { const v = JSON.parse(read(storage, STARS_KEY) || 'null'); if (v && v.day === today() && Number.isInteger(v.n) && v.n >= 0) return v.n; } catch { /* unreadable: start again */ }
    return 0;
  };
  let mem = null, day = null;
  const current = () => { if (day !== today()) { day = today(); mem = load(); } return mem; };
  return {
    earned: current,
    award(n) { mem = current() + n; write(storage, STARS_KEY, JSON.stringify({ day, n: mem })); return mem; },
  };
}
