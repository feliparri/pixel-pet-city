// The seasonal gifts: while a season is on (src/seasons.js), 3 gifts lie about the town and the Parque every 2 hours, the same for everyone in a room, and a
// pet on a trip that opens one is paid 2 to 5 coins by the server (docs/trip-api.md, trip-gift). Everything here is pure: where the gifts of a slot lie is a
// function of (room code, slot), what one pays a function of its id, so every screen of a room agrees and nothing goes over the net. The server cannot know the
// room, so it mirrors only what it must check (slots, ids, prices, which seasons are on: supabase/functions/trip/gifts.js; tests/gifts.test.js keeps them equal).
import { SEASON_KEYS } from './seasons.js';
import { hashSeed, mulberry32 } from './life.js';

// ---- slots ------------------------------------------------------------------------------------------------------------------------------
// A slot is a fixed 2 h window of UTC time: slot = floor((ms - ANCHOR_MS) / SLOT_MS). It is a plain UTC grid, so Chile's clock changes (two a year, at midnight of
// a Saturday night) neither skip nor repeat a slot nor change its length: they only move where a boundary falls on the Chile clock (on even hours in winter, UTC-4,
// and on odd hours in summer, UTC-3). A slot never spans two UTC days; in summer one slot (05:00 to 07:00 Chile) spans the 06:00 change of the town day, and the
// server books a gift on the town day its slot STARTS in.
export const SLOT_MS = 2 * 3600 * 1000;
export const ANCHOR_MS = Date.UTC(2026, 0, 1);
export const PER_SLOT = 3;                                   // gifts per slot: n = 0..2
export const GRACE_MS = 120 * 1000;                          // the slot before the current one is still accepted for this long after it ended
export const REWARD_MIN = 2, REWARD_MAX = 5;
export const GIFT_DAILY_CAP = 20;                            // the coins gifts pay one pet in one town day (the server's rule; the missions have their own cap)

export const slotOf = (ms) => Math.floor((ms - ANCHOR_MS) / SLOT_MS);
export const slotStart = (slot) => ANCHOR_MS + slot * SLOT_MS;
/** Is `slot` one the server accepts a claim for at its time `ms`: the current slot, or the previous one during the first GRACE_MS of this one? */
export function slotAccepted(slot, ms) {
  const cur = slotOf(ms);
  return slot === cur || (slot === cur - 1 && ms - slotStart(cur) < GRACE_MS);
}

// ---- ids and prices ---------------------------------------------------------------------------------------------------------------------
/** The first of `seasons` (a Set of keys) in the registry's order, or null: the season a gift of this moment belongs to. */
export const firstSeason = (seasons) => (seasons ? SEASON_KEYS.find((k) => seasons.has(k)) ?? null : null);
export const giftId = (season, slot, n) => `${season}:${slot}:${n}`;
/** The coins a gift pays: 2..5, a pure function of its id (the server prices it the same way). */
export const rewardOf = (id) => REWARD_MIN + (hashSeed(id) % (REWARD_MAX - REWARD_MIN + 1));

const ID_RE = /^([a-z]+):(\d{1,7}):(\d)$/;
/** A gift id as { id, season, slot, n, reward }, or null when it is not a valid one: the same check the server makes (an id has one spelling only: no leading zeros). */
export function parseGiftId(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  if (!m) return null;
  const [, season, slot, n] = m;
  if (!SEASON_KEYS.includes(season) || String(+slot) !== slot || +n >= PER_SLOT) return null;
  return { id, season, slot: +slot, n: +n, reward: rewardOf(id) };
}

// ---- where ------------------------------------------------------------------------------------------------------------------------------
/**
 * The tiles a gift may lie on, in the town (the Parque is part of it): open grass, flowers, plaza and road, none of them a door, a mat, a pad, a spawn, the pen, the
 * pitch or the track, and none a tile that holds a season's decoration. tests/gifts.test.js checks every one against the map and the decorations. [x, y].
 */
export const GIFT_TILES = [
  [6, 4], [20, 4], [34, 4], [11, 5], [39, 5], [30, 6], [21, 7], [26, 8], [17, 9], [22, 10], [27, 11], [14, 14], [28, 14], [42, 14], [5, 15], [33, 15],
  [10, 16], [24, 16], [38, 16], [43, 17], [34, 18], [18, 19], [39, 19], [29, 20], [35, 21], [19, 22], [28, 23], [36, 24], [13, 25], [19, 25], [29, 25], [41, 25],
  [4, 26], [24, 26], [32, 26], [9, 27], [37, 27], [14, 28], [28, 28],
  [6, 32], [34, 32], [39, 33], [44, 34], [16, 35], [31, 36], [40, 36], [17, 37], [13, 39], [41, 39], [4, 40], [18, 40], [9, 41], [37, 41], [14, 42], [5, 43],
  [10, 44], [20, 44], [26, 44], [35, 44], [15, 45], [29, 45], [43, 45], [6, 46], [34, 46], [44, 48], [7, 49], [35, 49], [8, 52], [36, 52], [13, 53], [4, 54],
  [5, 57], [10, 58], [34, 60], [11, 61], [7, 63], [35, 63], [12, 64], [8, 66], [36, 66], [13, 67], [4, 68], [37, 69], [5, 71],
];

/**
 * The tiles of a slot's gifts in room `room`: [[x, y] x PER_SLOT], every one of GIFT_TILES and no two the same. Gift n starts from
 * mulberry32(hashSeed(`${room}:gift:${slot}:${n}`)) and, when that tile is taken by an earlier gift of the slot, takes the next free one in the list.
 */
export function giftTiles(room, slot) {
  const used = new Set(), out = [];
  for (let n = 0; n < PER_SLOT; n++) {
    let i = Math.floor(mulberry32(hashSeed(`${room}:gift:${slot}:${n}`))() * GIFT_TILES.length);
    while (used.has(i)) i = (i + 1) % GIFT_TILES.length;
    used.add(i);
    out.push(GIFT_TILES[i]);
  }
  return out;
}

/**
 * The gifts lying about at server time `ms` in room `room`: [{ id, season, slot, n, x, y, reward }] while a season of `seasons` (a Set of keys) is on,
 * else []. All of them are in the town (area 'town'). The ones this pet already opened are the caller's business (the town keeps them).
 */
export function giftsAt(room, ms, seasons) {
  const season = firstSeason(seasons);
  if (!season || !Number.isFinite(ms)) return [];
  const slot = slotOf(ms);
  return giftTiles(room, slot).map(([x, y], n) => { const id = giftId(season, slot, n); return { id, season, slot, n, x, y, reward: rewardOf(id) }; });
}

// ---- what the pet opened ----------------------------------------------------------------------------------------------------------------
const KEEP_SLOTS = 14;                                         // ids older than this many slots (a day plus a slot) are forgotten: the server's day ledger knows them
/**
 * The ids this pet opened lately, in memory and (when `storage` works) in this browser, for the pet `owner` (a string: the trip): { has(id), add(id), owner(o) }.
 * Another owner starts from what was saved for it, or nothing. Every storage call is guarded: it can be missing, full or blocked.
 */
export function createOpened(storage = null, key = 'city.gifts') {
  let who = null, ids = new Set(), now = 0;
  const save = () => { try { storage && storage.setItem(key, JSON.stringify({ owner: who, ids: [...ids] })); } catch { /* private window, full or blocked: memory only */ } };
  const load = () => {
    try {
      const v = JSON.parse((storage && storage.getItem(key)) || 'null');
      if (v && v.owner === who && Array.isArray(v.ids)) return new Set(v.ids.filter((x) => typeof x === 'string' && parseGiftId(x)));
    } catch { /* nothing saved, or not readable */ }
    return new Set();
  };
  return {
    /** Switches to the pet `o` (null: a visitor, who opens nothing). Cheap when it is the same one. */
    owner(o) { if (o !== who) { who = o; ids = who === null ? new Set() : load(); } },
    has: (id) => ids.has(id),
    /** Forgets what is too old for `slot`'s moment. */
    prune(slot) { now = slot; for (const id of [...ids]) { const g = parseGiftId(id); if (!g || g.slot < now - KEEP_SLOTS) ids.delete(id); } },
    add(id) { if (who === null || ids.has(id)) return; ids.add(id); save(); },
    get size() { return ids.size; },
  };
}

// ---- texts (neutral Spanish) --------------------------------------------------------------------------------------------------------------
export const HINT_NO_TRIP = 'Viaja con tu mascota para abrir regalos';
export const GIFT_CAP_LINE = 'Ya abriste muchos regalos hoy';
export const GIFT_POP = (gold) => `+${gold} monedas`;
/** The Spanish line for a refused claim (`r` is { error }), or null when the gift just goes away (opened already, or too late). */
export function giftErrorText(r) {
  switch (r.error) {
    case 'gift_cap': case 'cap_reached': return GIFT_CAP_LINE;
    case 'claimed': case 'gift_expired': case 'season_off': case 'bad_gift': return null;
    case 'trip_over': return 'El viaje terminó.';
    case 'bad_session': return 'Tu sesión se cerró. Vuelve a entrar con el código de tu mascota.';
    case 'shop_closed': return HINT_NO_TRIP;
    case 'network': return 'No hay conexión. Revisa tu internet e inténtalo otra vez.';
    default: return 'No se pudo abrir el regalo. Inténtalo otra vez.';
  }
}
