// The town's weather: no location, no weather service. It is a pure function of the UTC clock and a fixed seed, so every player in the shared town sees the same sky at the
// same moment with nothing to send. The clock is cut into 30 minute slots; a spell is one slot or two (a slot may carry on the spell of the one before), so a spell lasts
// 30 to 60 minutes, or longer when the same kind comes up again. During the last FADE_MS of a slot the sky eases into the next spell, so a change is never a cut.
// Kinds: clear, cloudy, rain, storm (rain, lightning and thunder), fog; snow only in the Christmas season (it takes the place of rain and storm).
// `levels` turns a weather into the amounts the renderers and the sound read: { kind, rain, storm, cloud, fog, snow }, each 0..1.

export const KINDS = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow'];
export const SLOT_MS = 30 * 60 * 1000;
export const FADE_MS = 8 * 60 * 1000;
export const SEED = 0x57ea7;
/** How often each kind comes up (per cent), the likelier ones first: clear and cloudy are most of the day; fog and storm are rare. */
export const WEIGHTS = [['clear', 34], ['cloudy', 30], ['rain', 19], ['fog', 10], ['storm', 7]];
/** What a kind is made of, at full intensity. */
export const MAKEUP = {
  clear: {}, cloudy: { cloud: 1 }, rain: { cloud: 0.75, rain: 1 }, storm: { cloud: 1, rain: 1, storm: 1 }, fog: { cloud: 0.3, fog: 1 }, snow: { cloud: 0.4, snow: 1 },
};

/** A well mixed 0..1 number from two integers (a murmur-like integer hash): the same inputs always give the same number. */
export function hash01(a, b = 0) {
  let h = (Math.imul(a | 0, 0x85ebca6b) ^ Math.imul((b | 0) + SEED, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const pickKind = (r) => { let at = r * 100; for (const [k, w] of WEIGHTS) { if (at < w) return k; at -= w; } return 'clear'; };

/** The spell of a slot: { kind, intensity 0.55..1 } (no Christmas yet). A slot either starts a spell or carries on the one the slot before started. */
export function spellOf(slot) {
  const lead = hash01(slot, 1) < 0.5 ? slot - 1 : slot;
  return { kind: pickKind(hash01(lead, 2)), intensity: 0.55 + 0.45 * hash01(lead, 3) };
}
/** At Christmas the rain and the storms are snow. */
const dress = (s, christmas) => (christmas && (s.kind === 'rain' || s.kind === 'storm') ? { kind: 'snow', intensity: s.kind === 'storm' ? 1 : s.intensity } : s);

/**
 * The weather at `date` (a Date or ms): { kind, intensity 0..1, next: { kind, intensity } | null, fade 0..1 }. `kind` is the spell now; `next` is the spell after it and `fade` how far
 * the sky has moved towards it (0 for most of the slot, up to 1 at its end), so the two blend smoothly. `christmas`: it is the Christmas season (snow instead of rain).
 */
export function weatherAt(date, { christmas = false } = {}) {
  const t = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(t)) return { kind: 'clear', intensity: 0, next: null, fade: 0 };
  const slot = Math.floor(t / SLOT_MS), into = t - slot * SLOT_MS;
  const cur = dress(spellOf(slot), christmas), nxt = dress(spellOf(slot + 1), christmas);
  const same = cur.kind === nxt.kind;
  const fade = same ? 0 : smooth((into - (SLOT_MS - FADE_MS)) / FADE_MS);
  return { kind: cur.kind, intensity: cur.intensity, next: same ? null : nxt, fade };
}

/** The amounts of a weather (from weatherAt, or a dev kind), blended over the fade: { kind (the dominant one), rain, storm, cloud, fog, snow }, each 0..1. */
export function levels(w) {
  const out = { kind: 'clear', rain: 0, storm: 0, cloud: 0, fog: 0, snow: 0 };
  if (!w) return out;
  const add = (s, k) => { const m = MAKEUP[s.kind] || MAKEUP.clear; for (const c of ['rain', 'storm', 'cloud', 'fog', 'snow']) out[c] += (m[c] || 0) * s.intensity * k; };
  add(w, w.next ? 1 - w.fade : 1);
  if (w.next) add(w.next, w.fade);
  out.kind = w.next && w.fade > 0.5 ? w.next.kind : w.kind;
  for (const c of ['rain', 'storm', 'cloud', 'fog', 'snow']) out[c] = Math.round(Math.min(1, out[c]) * 1000) / 1000;
  return out;
}

/** The birds and the butterflies take shelter while it rains (or snows heavily): a life frame without them. Anything else in the frame (the duck, the animals, the fireflies) stays. */
export const shelterLife = (frame, lv) => (frame && lv && (lv.rain > 0.3 || lv.snow > 0.6) ? { ...frame, birds: [], butterflies: [] } : frame);

// ---- lightning ------------------------------------------------------------------------------------------------------------------------------
export const STRIKE_WINDOW_MS = 7000;
/** The strikes that start in [fromMs, toMs): [{ at (ms), delay (the thunder's wait in ms, 600..3200) }]. A 7 s window holds one strike (or none) with a chance that grows with the storm. */
export function strikesIn(fromMs, toMs, storm) {
  const out = [];
  if (!(storm > 0.25) || !(toMs > fromMs)) return out;
  for (let w = Math.floor(fromMs / STRIKE_WINDOW_MS); w * STRIKE_WINDOW_MS < toMs; w++) {
    if (hash01(w, 11) >= 0.15 + 0.5 * Math.min(1, storm)) continue;
    const at = w * STRIKE_WINDOW_MS + Math.floor(hash01(w, 12) * (STRIKE_WINDOW_MS - 600));
    if (at >= fromMs && at < toMs) out.push({ at, delay: 600 + Math.floor(hash01(w, 13) * 2600) });
  }
  return out;
}
/** The brightness of the sky at `ms` (0..1): a hard flash of 90 ms, a pause, then a weaker echo of 160 ms. Looks back one window, so a strike is found whichever window it is in. */
export function flashAt(ms, storm) {
  if (!(storm > 0.25)) return 0;
  const hits = strikesIn(ms - 400, ms + 1, storm);
  let best = 0;
  for (const s of hits) {
    const d = ms - s.at;
    const a = d < 0 ? 0 : d < 90 ? 1 - d / 90 * 0.3 : 0, b = d >= 170 && d < 330 ? 0.6 * (1 - (d - 170) / 160) : 0;
    best = Math.max(best, a, b);
  }
  return best;
}

// ---- the development override --------------------------------------------------------------------------------------------------------------------
/** ?dev=1&weather=<kind> pins the weather; ?dev=1&snow=1 (the old shortcut) is ?weather=snow. Null: no override (needs dev=1, like the other development flags). */
export function devWeather(search = '') {
  const p = new URLSearchParams(search);
  if (p.get('dev') !== '1') return null;
  const k = p.get('weather');
  if (k && KINDS.includes(k)) return k;
  return p.get('snow') === '1' ? 'snow' : null;
}
/** The weather to show now: the dev kind (full strength), else the clock's. `christmas` as in weatherAt. */
export function weatherNow(search, nowMs, christmas) {
  const dev = devWeather(search);
  return dev ? { kind: dev, intensity: 1, next: null, fade: 0 } : weatherAt(nowMs, { christmas });
}
