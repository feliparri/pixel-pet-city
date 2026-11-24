// "Pesca": the rules of the fishing game, with no drawing, no DOM and no clock of its own (every function takes `dt` in seconds and `now` in ms).
// A cast goes idle -> charging (hold: the power swings 0..1) -> cast (the float flies; the distance comes from the power) -> waiting (a seeded bite time,
// with fake nibbles) -> bite (a short window to tap) -> reeling (hold to raise the marker, release to let it fall; keep it in the fish's zone) -> caught | escaped.
// `escaped` says why in `s.reason`: 'early' (tapped before the bite), 'missed' (the window closed), 'lost' (the fish got away) or 'snapped' (the line broke).
// A run is a function of its seed and the inputs. What the world is like (night, the Christmas season) comes in as `ctx` = { night, christmas }.
import { createDailyStars } from '../arcade/scores.js';

export const FISH_STARS_KEY = 'city.fishing.stars';
export const FISH_STAR_CAP_PER_DAY = 5;
export const ALBUM_KEY = 'city.fishing.album';

export const FISHING = {
  CHARGE_S: 0.9,                   // seconds for the power to swing from 0 to 1 (and back)
  CAST_S: 0.7,                     // the float's flight
  DIST_MIN: 3, DIST_MAX: 12,       // tiles from the pet to where the float lands
  BITE_MIN: 2.5, BITE_MAX: 7,      // seconds from landing to the bite
  NIBBLES_MAX: 3, NIBBLE_GAP: 0.6, // fake nibbles before the bite, never closer than this to it
  WINDOW_MIN: 0.6, WINDOW_MAX: 0.9,// seconds the bite waits for the tap
  MARKER_UP: 2.4, MARKER_G: 1.8, MARKER_VMAX: 0.9,   // the marker's push while held, its fall while released, and its top speed (bar units per second)
  START_PROGRESS: 0.3, FILL: 0.25, DRAIN: 0.1,       // progress per second inside / outside the zone
  SNAP_S: 2.2,                     // the line breaks after this long outside the zone without a break
};

export const RARITIES = ['common', 'rare', 'epic'];
const RARITY_W = { common: 70, rare: 25, epic: 5 };
const CONDITIONS = ['any', 'night', 'christmas'];

/**
 * The fish: id, Spanish name, rarity, when it can be caught (`when`), difficulty 1-5 (the zone shrinks, the fish pulls harder and jerks more), the stars it pays and its size range in cm.
 */
export const FISH = [
  { id: 'sardina', name: 'Sardina', rarity: 'common', when: 'any', diff: 1, stars: 1, cm: [10, 20] },
  { id: 'carpa', name: 'Carpa', rarity: 'common', when: 'any', diff: 2, stars: 1, cm: [30, 60] },
  { id: 'trucha', name: 'Trucha', rarity: 'common', when: 'any', diff: 2, stars: 1, cm: [25, 50] },
  { id: 'perca', name: 'Perca', rarity: 'common', when: 'any', diff: 1, stars: 1, cm: [15, 35] },
  { id: 'salmon', name: 'Salmón rojo', rarity: 'rare', when: 'any', diff: 3, stars: 2, cm: [50, 90] },
  { id: 'esturion', name: 'Esturión dorado', rarity: 'epic', when: 'any', diff: 5, stars: 3, cm: [100, 180] },
  { id: 'pez_luna', name: 'Pez luna', rarity: 'rare', when: 'night', diff: 3, stars: 2, cm: [40, 80] },
  { id: 'anguila', name: 'Anguila de sombra', rarity: 'epic', when: 'night', diff: 4, stars: 3, cm: [70, 140] },
  { id: 'copo', name: 'Pez copo de nieve', rarity: 'common', when: 'christmas', diff: 2, stars: 1, cm: [15, 30] },
  { id: 'caramelo', name: 'Pez bastón de caramelo', rarity: 'rare', when: 'christmas', diff: 4, stars: 2, cm: [30, 60] },
];
export const fishById = (id) => (typeof id === 'string' ? FISH.find((f) => f.id === id) || null : null);

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;

/** mulberry32 on s.rng: next(s) advances it and returns [0, 1). */
export function next(s) {
  s.rng = (s.rng + 0x6D2B79F5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Can this fish be caught now? `ctx` = { night, christmas }. */
export const isAvailable = (fish, ctx = {}) => fish.when === 'any' || (fish.when === 'night' && !!ctx.night) || (fish.when === 'christmas' && !!ctx.christmas);

/** The odds of each rarity for a cast that landed `dist01` (0 near .. 1 far) out: the far water holds a few more of the good ones. */
export const rarityWeights = (dist01) => {
  const d = clamp01(dist01);
  return { common: RARITY_W.common * (1 - 0.2 * d), rare: RARITY_W.rare * (1 + 0.4 * d), epic: RARITY_W.epic * (1 + 1.2 * d) };
};

/** The fish for two rolls r1, r2 in [0, 1): the rarity by weight among those that have a fish available now, then one of them. null only when nothing is available. */
export function chooseFish(ctx, dist01, r1, r2) {
  const w = rarityWeights(dist01);
  const pools = RARITIES.map((r) => ({ r, fish: FISH.filter((f) => f.rarity === r && isAvailable(f, ctx)) })).filter((p) => p.fish.length);
  if (!pools.length) return null;
  const total = pools.reduce((a, p) => a + w[p.r], 0);
  let x = r1 * total, pool = pools[pools.length - 1];
  for (const p of pools) { if (x < w[p.r]) { pool = p; break; } x -= w[p.r]; }
  return pool.fish[Math.min(pool.fish.length - 1, Math.floor(r2 * pool.fish.length))];
}

/** How hard a fish fights: zone = the green zone's size (0..1 of the bar), speed = how fast the zone moves, jerk = how often it jumps to a new place (per second). */
export const difficulty = (fish) => {
  const t = clamp01((fish.diff - 1) / 4);
  return { zone: lerp(0.36, 0.18, t), speed: lerp(0.12, 0.34, t), jerk: lerp(0.2, 1.4, t) };
};

/** A new fishing run. `ctx` can change later (`s.ctx = ...`) as night falls. */
export function createFishing(seed = 1, ctx = {}) {
  return { phase: 'idle', rng: (Number(seed) >>> 0) || 1, ctx, t: 0, power: 0, dist: 0, holding: false, fish: null, size: 0, reason: null, events: [], bite: null, reel: null, catch: null };
}

/** The player presses (touch down, the key down). `now` is for the album, not for the rules. */
export function press(s, now = 0) {
  s.events = [];
  switch (s.phase) {
    case 'idle': case 'caught': case 'escaped':
      Object.assign(s, { phase: 'charging', t: 0, power: 0, fish: null, size: 0, reason: null, bite: null, reel: null, catch: null, holding: true });
      s.events.push('charge');
      break;
    case 'waiting':                                   // reeled in before anything bit
      s.phase = 'escaped'; s.reason = 'early'; s.holding = false; s.events.push('escape');
      break;
    case 'bite':
      s.phase = 'reeling'; s.t = 0; s.holding = true;
      s.reel = startReel(s);
      s.events.push('reel');
      break;
    case 'reeling': s.holding = true; break;
    default: break;
  }
  return s;
}

/** The player lets go: a charge becomes a cast; in the reel the marker starts to fall. */
export function release(s, now = 0) {
  s.events = [];
  if (s.phase === 'charging') {
    s.phase = 'cast'; s.t = 0; s.holding = false;
    s.dist = lerp(FISHING.DIST_MIN, FISHING.DIST_MAX, s.power);
    s.events.push('cast');
  } else if (s.phase === 'reeling') s.holding = false;
  return s;
}

function startReel(s) {
  const d = difficulty(s.fish);
  return { zoneSize: d.zone, speed: d.speed, jerk: d.jerk, zone: 0.5, target: 0.5, marker: 0.1, v: 0, progress: FISHING.START_PROGRESS, outside: 0, inside: false };
}

/** The distance of the cast as 0..1 (the rarity depends on it a little). */
export const distance01 = (s) => clamp01((s.dist - FISHING.DIST_MIN) / (FISHING.DIST_MAX - FISHING.DIST_MIN));

function land(s) {
  s.phase = 'waiting'; s.t = 0;
  s.fish = chooseFish(s.ctx, distance01(s), next(s), next(s));
  const cm = s.fish ? s.fish.cm : [0, 0];
  s.size = Math.round(lerp(cm[0], cm[1], next(s) ** 1.6));         // small ones are more common than big ones
  const biteAt = lerp(FISHING.BITE_MIN, FISHING.BITE_MAX, next(s));
  const n = Math.floor(next(s) * (FISHING.NIBBLES_MAX + 1));
  const nibbles = [];
  for (let i = 0; i < n; i++) nibbles.push(lerp(0.4, Math.max(0.4, biteAt - FISHING.NIBBLE_GAP), next(s)));
  s.bite = { at: biteAt, window: lerp(FISHING.WINDOW_MIN, FISHING.WINDOW_MAX, next(s)), nibbles: nibbles.sort((a, b) => a - b), nibbled: 0 };
  s.events.push('land');
}

/** Advances the run by `dt` seconds. Returns s; `s.events` lists what just happened (for sound and effects): charge, cast, land, nibble, bite, reel, catch, escape, snap. */
export function tick(s, dt, now = 0) {
  const F = FISHING;
  if (s.phase !== 'idle' || s.events.length) s.events = s.events.filter(() => false);
  s.t += dt;
  switch (s.phase) {
    case 'charging': {
      const u = (s.t / F.CHARGE_S) % 2;                 // a triangle wave: up, then down
      s.power = u < 1 ? u : 2 - u;
      break;
    }
    case 'cast':
      if (s.t >= F.CAST_S) land(s);
      break;
    case 'waiting': {
      const b = s.bite;
      while (b.nibbled < b.nibbles.length && s.t >= b.nibbles[b.nibbled]) { b.nibbled++; s.events.push('nibble'); }
      if (s.t >= b.at) { s.phase = 'bite'; s.t = 0; s.events.push('bite'); }
      break;
    }
    case 'bite':
      if (s.t >= s.bite.window) { s.phase = 'escaped'; s.reason = 'missed'; s.events.push('escape'); }
      break;
    case 'reeling': reel(s, dt, now); break;
    default: break;
  }
  return s;
}

function reel(s, dt, now) {
  const F = FISHING, r = s.reel;
  // the fish moves the zone: it keeps heading for a target and now and then jumps to another one
  if (next(s) < r.jerk * dt || Math.abs(r.zone - r.target) < 0.01) r.target = lerp(r.zoneSize / 2, 1 - r.zoneSize / 2, next(s));
  const step = r.speed * dt;
  r.zone += Math.max(-step, Math.min(step, r.target - r.zone));
  // the marker: held pushes it up, released lets it fall; the ends stop it
  r.v = Math.max(-F.MARKER_VMAX, Math.min(F.MARKER_VMAX, r.v + (s.holding ? F.MARKER_UP : -F.MARKER_G) * dt));
  r.marker += r.v * dt;
  if (r.marker < 0) { r.marker = 0; r.v = 0; } else if (r.marker > 1) { r.marker = 1; r.v = 0; }
  r.inside = Math.abs(r.marker - r.zone) <= r.zoneSize / 2;
  if (r.inside) { r.progress = Math.min(1, r.progress + F.FILL * dt); r.outside = 0; } else { r.progress = Math.max(0, r.progress - F.DRAIN * dt); r.outside += dt; }
  if (r.progress >= 1) { s.phase = 'caught'; s.catch = { id: s.fish.id, size: s.size, stars: s.fish.stars, at: now }; s.events.push('catch'); }
  else if (r.outside >= F.SNAP_S) { s.phase = 'escaped'; s.reason = 'snapped'; s.events.push('snap'); }
  else if (r.progress <= 0) { s.phase = 'escaped'; s.reason = 'lost'; s.events.push('escape'); }
}

// ---- the stars: a few a day, like the arcade (its own key) --------------------------------------------------------------------------------------------
/** Today's stars from fishing: { earned(), award(n) } (src/arcade/scores.js with this game's own key). */
export const createFishStars = (storage, today) => createDailyStars(storage, today, FISH_STARS_KEY);

/** The stars a catch pays today: its own, but never past the daily cap. */
export const starsForCatch = (fish, earnedToday, cap = FISH_STAR_CAP_PER_DAY) => (fish ? Math.max(0, Math.min(fish.stars, cap - earnedToday)) : 0);

// ---- the album: what has been caught ---------------------------------------------------------------------------------------------------------------------
/** The album as { [fishId]: { count, best (cm), first (ms) } }: a clean copy of whatever was stored (unknown fish and bad numbers are dropped). */
export function albumFrom(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const f of FISH) {
    const e = Object.hasOwn(raw, f.id) ? raw[f.id] : null;
    if (e && Number.isInteger(e.count) && e.count > 0 && Number.isFinite(e.best) && e.best > 0) out[f.id] = { count: e.count, best: Math.round(e.best), first: Number.isFinite(e.first) ? e.first : 0 };
  }
  return out;
}

/** A catch goes in: returns { album (a new object), first: the first of its kind, record: a new best size (not on the first catch) }. An unknown fish changes nothing. */
export function recordCatch(album, fishId, size, now = 0) {
  const cur = albumFrom(album);
  if (!fishById(fishId) || !Number.isFinite(size) || size <= 0) return { album: cur, first: false, record: false };
  const prev = cur[fishId], cm = Math.round(size);
  if (!prev) return { album: { ...cur, [fishId]: { count: 1, best: cm, first: now } }, first: true, record: false };
  const record = cm > prev.best;
  return { album: { ...cur, [fishId]: { count: prev.count + 1, best: Math.max(prev.best, cm), first: prev.first } }, first: false, record };
}

/** How many kinds of fish are in the album out of all of them. */
export const albumProgress = (album) => ({ have: Object.keys(albumFrom(album)).length, total: FISH.length });
