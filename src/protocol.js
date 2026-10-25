// Everything that arrives from another player is untrusted: this module turns a raw payload into a clean message or null,
// and limits how often each peer may speak. Nothing else in the app reads a network payload directly.
import { isWalkable, isArea, chickenTile, HIDE_ZONE_KEYS, DEFAULT_AREA } from './map.js';
import { isPlayable, MAX_PLAYERS } from './games/rules.js';

export const MAX_NAME = 12;
export const MAX_PEERS = 12;
export const MAX_PAYLOAD_BYTES = 512;
export const SPECIES = ['frog', 'seal', 'cat'];
export const STAGES = ['baby', 'child', 'adult', 'elder'];
export const SLOTS = ['head', 'face', 'neck', 'back'];
export const DIRS = ['up', 'right', 'down', 'left'];

/** The presets: id -> what a bubble shows. No free text ever travels. */
export const EMOTES = {
  wave: '👋', heart: '❤️', smile: '😄', party: '🎉',
  hola: '¡Hola!', juguemos: '¡Juguemos!', chau: '¡Chau!',
};

/** A display name: letters, digits, space and _ ' . - only, collapsed, at most MAX_NAME characters; a placeholder when nothing is left. */
export function sanitizeName(input) {
  const s = typeof input === 'string' ? input.normalize('NFC') : '';
  const clean = s.replace(/[^\p{L}\p{N} _'.-]/gu, '').replace(/\s+/g, ' ').trim();
  const cut = Array.from(clean).slice(0, MAX_NAME).join('').trim();
  return cut || 'Mascota';
}

/**
 * A pet's look as { species, stage (0-3), items: [head, face, neck, back] (item id or '') }.
 * `catalogue` is the exported sprites.json `items` object: an item must exist and belong to the slot it is in.
 * Returns the clean look, or null when the species or stage is unknown. An unknown item is dropped (shown as nothing).
 */
export function validateLook(look, catalogue) {
  if (!look || typeof look !== 'object') return null;
  if (!SPECIES.includes(look.species)) return null;
  const stage = look.stage;
  if (!Number.isInteger(stage) || stage < 0 || stage >= STAGES.length) return null;
  const items = SLOTS.map((slot, i) => {
    const id = Array.isArray(look.items) ? look.items[i] : '';
    if (typeof id !== 'string' || !id) return '';
    const def = Object.hasOwn(catalogue || {}, id) ? catalogue[id] : null;
    return def && def.slot === slot ? id : '';
  });
  return { species: look.species, stage, items };
}

function parse(raw) {
  if (typeof raw === 'string') {
    if (raw.length > MAX_PAYLOAD_BYTES) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  if (raw && typeof raw === 'object') {
    try { if (JSON.stringify(raw).length > MAX_PAYLOAD_BYTES) return null; } catch { return null; }
    return raw;
  }
  return null;
}

const isId = (v) => typeof v === 'string' && /^[a-z0-9]{6,16}$/.test(v);
export const newPeerId = () => {
  const b = new Uint8Array(6);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => (x % 36).toString(36)).join('') + 'p';
};

/**
 * One received message: { t: 'hello'|'pos'|'emote'|'bye', id, ... }. Returns the normalized message or null.
 *   hello  { id, name, look }      who is here (also the presence payload)
 *   pos    { id, x, y, d, area? }  the tile the peer is walking to, its facing and its area (default the town); must be a walkable tile of that area
 *   emote  { id, e }               one of EMOTES
 *   bye    { id }
 */
export function validateMessage(raw, catalogue) {
  const m = parse(raw);
  if (!m || typeof m !== 'object' || Array.isArray(m) || !isId(m.id)) return null;
  switch (m.t) {
    case 'hello': {
      const look = validateLook(m.look, catalogue);
      if (!look) return null;
      const out = { t: 'hello', id: m.id, name: sanitizeName(m.name), look };
      const area = m.area === undefined ? DEFAULT_AREA : m.area;                  // a heartbeat may carry the position: kept only when it is a real tile
      if (m.x !== undefined && isArea(area) && Number.isInteger(m.x) && Number.isInteger(m.y) && isWalkable(m.x, m.y, area) && DIRS.includes(m.d)) out.pos = { x: m.x, y: m.y, d: m.d, area };
      return out;
    }
    case 'pos':
    {
      const area = m.area === undefined ? DEFAULT_AREA : m.area;           // older clients never send it
      if (!isArea(area) || !Number.isInteger(m.x) || !Number.isInteger(m.y) || !isWalkable(m.x, m.y, area) || !DIRS.includes(m.d)) return null;
      return { t: 'pos', id: m.id, x: m.x, y: m.y, d: m.d, area };
    }
    case 'emote':
      return typeof m.e === 'string' && Object.hasOwn(EMOTES, m.e) ? { t: 'emote', id: m.id, e: m.e } : null;
    case 'bye':
      return { t: 'bye', id: m.id };
    default:
      return GAME_TYPES.has(m.t) ? validateGameMessage(m) : null;
  }
}

// ---- the games' messages -------------------------------------------------------------------------------------------------------------
// A game has no host: the players' browsers agree on a referee (the lowest peer id among the players, see games/lobby.js) and only the
// referee's `gstate`, `gfound`, `gchick`, `gcatch` and `gend` count. This module only checks shapes and ranges; who may say what is checked
// by the receiver (games/manager.js).
export const GAME_TYPES = new Set(['gopen', 'gjoin', 'gleave', 'grole', 'gzone', 'gstart', 'gstate', 'gfound', 'gchick', 'gcatch', 'gend', 'gteam', 'gball', 'ggoal']);
export const PHASES = { hide: ['count', 'search'], chicken: ['play'], soccer: ['count', 'play'] };
export const END_REASONS = ['all', 'time', 'goal', 'left', 'few'];
const isRound = (v) => typeof v === 'string' && /^[a-z0-9]{4,10}$/.test(v);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const intList = (v, lo, hi) => Array.isArray(v) && v.length <= MAX_PLAYERS && v.every((n) => int(n, lo, hi));

/**
 *   gopen  { g, r, left }       someone opens a lobby for game g (round id r) that closes in `left` ms
 *   gjoin  { r }                "Me sumo"            gleave { r }   "Salir del juego"
 *   grole  { r, role: 'seek' }  "¡Yo busco!"
 *   gzone  { r, z }             the zone of a hide and seek lobby (park, plaza, town): the first choice wins
 *   gstart { g, r, p, s, z?, tm? } the referee starts: roster p (peer ids, in order), seeker index s (-1 for games without a seeker), z the hide zone,
 *                               tm the team (0/1) of each roster index in football
 *   gstate { g, r, ph, left, f }  the shared clock: phase, ms left in it, and per roster index: seconds a hider was found (-1 not yet, -2 gone) or a score
 *   gfound { r, i, at }         roster index i was found `at` seconds into the search
 *   gchick { r, x, y, d, m, s, v?, p?, o? } the chicken's tile, facing, mood (w wander, f flee); s = 1 when it appeared there. A motion:
 *                               v = ms per step, p = its next moves from (x, y) as "uurrd" (at most 8), o = ms since it arrived at (x, y)
 *   gcatch { r, i, n }          roster index i caught it (n: its catches so far)
 *   gteam  { r, tm }            football lobby: this player's team (0 Azul, 1 Rojo); its first choice wins
 *   gball  { r, x, y, vx, vy, l, w } the ball: position in tenths of a tile, velocity in tenths of a tile a second, roster index of the last
 *                               player to touch it (-1 none), ms it waits on the centre spot (after a goal); screens advance it themselves
 *   ggoal  { r, tm, i, s }      team tm scored (roster index i touched it last, -1 none); s = [Azul, Rojo] goals now
 *   gend   { g, r, rs, f }      the game (or a lobby that could not start: rs 'few') is over, with the final f
 */
function validateGameMessage(m) {
  const base = { t: m.t, id: m.id };
  switch (m.t) {
    case 'gopen':
      return isPlayable(m.g) && isRound(m.r) && int(m.left, 0, 15000) ? { ...base, g: m.g, r: m.r, left: m.left } : null;
    case 'gjoin': case 'gleave':
      return isRound(m.r) ? { ...base, r: m.r } : null;
    case 'grole':
      return isRound(m.r) && m.role === 'seek' ? { ...base, r: m.r, role: 'seek' } : null;
    case 'gzone':
      return isRound(m.r) && HIDE_ZONE_KEYS.includes(m.z) ? { ...base, r: m.r, z: m.z } : null;
    case 'gstart': {
      if (!isPlayable(m.g) || !isRound(m.r) || !Array.isArray(m.p) || m.p.length < 1 || m.p.length > MAX_PLAYERS || !m.p.every(isId) || new Set(m.p).size !== m.p.length) return null;
      if (m.z !== undefined && !HIDE_ZONE_KEYS.includes(m.z)) return null;
      if (m.tm !== undefined && !(Array.isArray(m.tm) && m.tm.length === m.p.length && m.tm.every((v) => v === 0 || v === 1))) return null;
      return int(m.s, -1, m.p.length - 1) ? { ...base, g: m.g, r: m.r, p: m.p.slice(), s: m.s, ...(m.z ? { z: m.z } : {}), ...(m.tm ? { tm: m.tm.slice() } : {}) } : null;
    }
    case 'gstate':
      return isPlayable(m.g) && isRound(m.r) && PHASES[m.g].includes(m.ph) && int(m.left, 0, 120000) && intList(m.f, -2, 999)
        ? { ...base, g: m.g, r: m.r, ph: m.ph, left: m.left, f: m.f.slice() } : null;
    case 'gfound':
      return isRound(m.r) && int(m.i, 0, MAX_PLAYERS - 1) && int(m.at, 0, 999) ? { ...base, r: m.r, i: m.i, at: m.at } : null;
    case 'gchick':
      if (!(isRound(m.r) && chickenTile(m.x, m.y) && DIRS.includes(m.d) && ['w', 'f'].includes(m.m) && (m.s === 0 || m.s === 1))) return null;
      if (m.v !== undefined && !int(m.v, 60, 2000)) return null;
      if (m.o !== undefined && !int(m.o, 0, 2000)) return null;
      if (m.p !== undefined && !(typeof m.p === 'string' && /^[udlr]{0,8}$/.test(m.p))) return null;
      return { ...base, r: m.r, x: m.x, y: m.y, d: m.d, m: m.m, s: m.s, ...(m.v !== undefined ? { v: m.v } : {}), ...(m.p ? { p: m.p } : {}), ...(m.o !== undefined ? { o: m.o } : {}) };
    case 'gcatch':
      return isRound(m.r) && int(m.i, 0, MAX_PLAYERS - 1) && int(m.n, 1, 99) ? { ...base, r: m.r, i: m.i, n: m.n } : null;
    case 'gteam':
      return isRound(m.r) && (m.tm === 0 || m.tm === 1) ? { ...base, r: m.r, tm: m.tm } : null;
    case 'gball':
      return isRound(m.r) && int(m.x, 0, 1000) && int(m.y, 0, 1000) && int(m.vx, -200, 200) && int(m.vy, -200, 200) && int(m.l, -1, MAX_PLAYERS - 1) && int(m.w, 0, 3000)
        ? { ...base, r: m.r, x: m.x, y: m.y, vx: m.vx, vy: m.vy, l: m.l, w: m.w } : null;
    case 'ggoal':
      return isRound(m.r) && (m.tm === 0 || m.tm === 1) && int(m.i, -1, MAX_PLAYERS - 1) && Array.isArray(m.s) && m.s.length === 2 && m.s.every((n) => int(n, 0, 99))
        ? { ...base, r: m.r, tm: m.tm, i: m.i, s: m.s.slice() } : null;
    case 'gend':
      return isPlayable(m.g) && isRound(m.r) && END_REASONS.includes(m.rs) && intList(m.f, -2, 999) ? { ...base, g: m.g, r: m.r, rs: m.rs, f: m.f.slice() } : null;
    default:
      return null;
  }
}

/** Token buckets: per peer and kind, `burst` messages at once, refilled at `perSec`. */
export const LIMITS = {
  pos: { burst: 12, perSec: 12 },     // a walker sends at most ~7 a second; this leaves room for a burst after a lag
  emote: { burst: 3, perSec: 1 },
  hello: { burst: 4, perSec: 0.5 },   // the heartbeat is every 2 s
  bye: { burst: 2, perSec: 0.2 },
  gopen: { burst: 2, perSec: 0.2 },
  gjoin: { burst: 4, perSec: 1 },
  gleave: { burst: 3, perSec: 0.5 },
  grole: { burst: 4, perSec: 1 },
  gzone: { burst: 3, perSec: 0.5 },
  gstart: { burst: 2, perSec: 0.3 },
  gstate: { burst: 6, perSec: 4 },     // the referee sends two a second
  gfound: { burst: 13, perSec: 2 },
  gchick: { burst: 8, perSec: 4 },     // a motion every 400 ms while it flees, a message per step while it wanders (2 a second)
  gcatch: { burst: 4, perSec: 1 },
  gend: { burst: 2, perSec: 0.3 },
  gteam: { burst: 3, perSec: 0.5 },
  gball: { burst: 12, perSec: 10 },    // a sample at every kick and bounce, and every 200 ms while it rolls
  ggoal: { burst: 4, perSec: 0.5 },
};

export function createRateLimiter(now = () => Date.now()) {
  const buckets = new Map();
  return {
    /** true when the message may pass. */
    allow(id, kind) {
      const lim = LIMITS[kind];
      if (!lim) return false;
      const key = `${id}:${kind}`;
      const t = now();
      let b = buckets.get(key);
      if (!b) { b = { tokens: lim.burst, t }; buckets.set(key, b); }
      b.tokens = Math.min(lim.burst, b.tokens + ((t - b.t) / 1000) * lim.perSec);
      b.t = t;
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    },
    forget(id) { for (const k of buckets.keys()) if (k.startsWith(`${id}:`)) buckets.delete(k); },
  };
}
