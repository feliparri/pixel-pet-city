// Everything that arrives from another player is untrusted: this module turns a raw payload into a clean message or null,
// and limits how often each peer may speak. Nothing else in the app reads a network payload directly.
import { isWalkable } from './map.js';

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
 *   pos    { id, x, y, d }         the tile the peer is walking to, and its facing; must be a walkable tile of the map
 *   emote  { id, e }               one of EMOTES
 *   bye    { id }
 */
export function validateMessage(raw, catalogue) {
  const m = parse(raw);
  if (!m || typeof m !== 'object' || Array.isArray(m) || !isId(m.id)) return null;
  switch (m.t) {
    case 'hello': {
      const look = validateLook(m.look, catalogue);
      return look ? { t: 'hello', id: m.id, name: sanitizeName(m.name), look } : null;
    }
    case 'pos':
      if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || !isWalkable(m.x, m.y) || !DIRS.includes(m.d)) return null;
      return { t: 'pos', id: m.id, x: m.x, y: m.y, d: m.d };
    case 'emote':
      return typeof m.e === 'string' && Object.hasOwn(EMOTES, m.e) ? { t: 'emote', id: m.id, e: m.e } : null;
    case 'bye':
      return { t: 'bye', id: m.id };
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

/**
 * The pet in the page fragment the Android app opens the town with: #n=<name>&s=<species>&g=<stage 0-3>&i=<head,face,neck,back>.
 * Returns { name, look } or null; the look is validated like a peer's.
 */
export function parsePetFragment(hash, catalogue) {
  if (typeof hash !== 'string' || hash.length > 300) return null;
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  if (!q.has('s')) return null;
  const items = (q.get('i') || '').split(',');
  const look = validateLook({ species: q.get('s'), stage: Number(q.get('g')), items }, catalogue);
  return look ? { name: sanitizeName(q.get('n') || ''), look } : null;
}
