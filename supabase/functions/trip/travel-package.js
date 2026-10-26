// The travel package (pixel-pet common/travel.h, format version 1), validated and read here with the same rules as the board's travel_parse.
// Pure JavaScript with no Deno or Node APIs, so the Edge Functions and `node --test` share it. Little endian throughout.
//
//   0 "PPTV" | 4 u16 version | 6 u8 direction (0 out, 1 back) | 7 u8 reserved | 8 u32 total length | 12 u32 trip id | 16 u32 sequence
//   20 u16 pet schema | 22 u16 pet length | 24 u8 n + n x (u8 kind, u32 id) backpack | gifts | u8 n + n x (u16 pack, u16 len, payload) records
//   | pet record | u32 CRC-32 of every byte before it
//
// The server cannot decode every value of the pet record (that is the board's job), so it checks the container completely and the pet
// record's size, schema and the few fields it shows the town (stage, species, name, worn items), and refuses what cannot be.

export const MAGIC = 'PPTV';
export const VERSION = 1;
export const BYTES_MAX = 6144;
export const HEADER_BYTES = 24;
export const MIN_BYTES = HEADER_BYTES + 3 + 4;
export const BAG_MAX = 3;
export const GIFT_MAX = 3;
export const RECORDS_MAX = 10;
export const PET_SCHEMA = 14;                 // the only pet record layout read here (save.h SAVE_SCHEMA_VER)
export const PET_LEN = 733;                   // SAVE_PAYLOAD_LEN_V14
export const DIR_OUT = 0;
export const DIR_BACK = 1;

const ITEM_BYTES = 5;
const KIND = { WEAR: 1, SEASON: 2, TOY: 3, DECOR: 4 };
const ITEM_COUNT = 16, TOY_COUNT = 3, DECOR_COUNT = 12;
const SITEM_BYTES_MAX = 4096, SITEM_NAME_MAX = 31, SITEM_SPRITES_MAX = 4, SITEM_PARTS_MAX = 6, SITEM_DIM_MAX = 64, SITEM_PRICE_MAX = 999;
const STAT_COUNT = 5, SLOTS = 4, DECOR_KIND_COUNT = 6, DECOR_KIND_BED = 4, SITEM_AT_COUNT = 9;

/** The catalogue key of every item id (store.c KEYS): what the town's sprites.json names it. */
export const ITEM_KEYS = [null, 'tophat', 'bow', 'beanie', 'crown', 'hood', 'jamiro', 'sunglasses', 'heart_cheeks', 'scarf', 'bell_collar', 'wings', 'cape', 'witch_hat', 'horns', 'furhat'];
export const SPECIES = [null, 'frog', 'seal', 'cat'];

// offsets inside the pet record (schema 14, save.c save_payload_encode)
const P = { stage: 8, species: 9, stats: 52, gold: 103, ownedMask: 107, equipped: 111, nameLen: 116, name: 117, nameBytes: 24, seasonN: 592, owned: 593, worn: 689 };

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const put16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; };
const put32 = (b, o, v) => { put16(b, o, v & 0xFFFF); put16(b, o + 2, v >>> 16); };

let crcTable = null;
/** CRC-32 (IEEE, reflected) of b[0..end). */
export function crc32(b, end = b.length) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < end; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** One seasonal record (sitem.c parse): the fields the town needs, or null when the board would refuse it. */
export function parseSitem(pack, b) {
  const n = b.length;
  if (n < 8 || n > SITEM_BYTES_MAX || pack === 0) return null;
  const local = b[0], kind = b[1], slot = b[2], price = u16(b, 3), scale = b[5], flags = b[6];
  if (local === 0 || price < 1 || price > SITEM_PRICE_MAX) return null;
  if (kind === 0) { if (slot >= SLOTS || scale !== 0 || flags !== 0) return null; }
  else if (kind === 1) { if (slot >= DECOR_KIND_COUNT || slot === DECOR_KIND_BED || scale < 1 || scale > 8 || (flags & ~1)) return null; }
  else return null;
  let at = 7;
  const len = b[at++];
  if (len < 1 || len > SITEM_NAME_MAX || at + len > n) return null;
  for (let i = 0; i < len; i++) if (b[at + i] < 0x20 || b[at + i] === 0x7F) return null;
  let name;
  try { name = new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(at, at + len)); } catch { return null; }
  at += len;
  if (at + 31 > n) return null;
  const palette = [null];                                   // entry 0 is transparent; 1..15 are RGB565
  for (let i = 1; i < 16; i++, at += 2) palette.push(u16(b, at));
  const spriteCount = b[at++];
  if (spriteCount < 1 || spriteCount > SITEM_SPRITES_MAX) return null;
  const sprites = [];
  for (let s = 0; s < spriteCount; s++) {
    if (at + 2 > n) return null;
    const w = b[at], h = b[at + 1];
    if (w < 1 || h < 1 || w > SITEM_DIM_MAX || h > SITEM_DIM_MAX) return null;
    const px = ((w + 1) >> 1) * h;
    if (at + 2 + px > n) return null;
    sprites.push({ w, h, px: b.subarray(at + 2, at + 2 + px) });
    at += 2 + px;
  }
  if (at + 1 > n) return null;
  const partCount = b[at++];
  if (kind === 0 ? partCount < 1 || partCount > SITEM_PARTS_MAX : partCount !== 0) return null;
  for (let k = 0; k < partCount; k++, at += 7) {
    if (at + 7 > n) return null;
    const view = b[at + 5];
    if (b[at] >= spriteCount || b[at + 1] >= SITEM_AT_COUNT || (view & ~15) || !(view & 3) || b[at + 6] > 1) return null;
  }
  if (kind === 1 && (flags & 1) && spriteCount < 2) return null;
  if (at !== n) return null;
  return { pack, local, kind, slot, name, palette, sprites, gid: ((pack << 8) | local) >>> 0 };
}

const fail = (status) => ({ ok: false, status });

/**
 * Validates a whole package. { ok: true, pkg } or { ok: false, status } with status one of:
 * too_short, bad_magic, bad_version, bad_size, bad_crc, bad_field, bad_pet, too_many, bad_item, bad_record, unsupported_pet_schema.
 * pkg: { dir, tripId, seq, petSchema, bag, gifts, records: [{pack, gid, raw}], pet: Uint8Array (a view into `buf`) }.
 */
export function parsePackage(buf) {
  if (!(buf instanceof Uint8Array) || buf.length < MIN_BYTES) return fail('too_short');
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== MAGIC) return fail('bad_magic');
  if (u16(buf, 4) !== VERSION) return fail('bad_version');
  if (buf.length > BYTES_MAX || u32(buf, 8) !== buf.length) return fail('bad_size');
  if (crc32(buf, buf.length - 4) !== u32(buf, buf.length - 4)) return fail('bad_crc');
  if (buf[6] > DIR_BACK || buf[7] !== 0 || u32(buf, 12) === 0) return fail('bad_field');
  const pkg = { dir: buf[6], tripId: u32(buf, 12), seq: u32(buf, 16), petSchema: u16(buf, 20), bag: [], gifts: [], records: [] };
  const petLen = u16(buf, 22);
  const end = buf.length - 4;
  let at = HEADER_BYTES;
  for (const list of [0, 1]) {
    if (at >= end) return fail('bad_field');
    const n = buf[at++];
    if (n > (list ? GIFT_MAX : BAG_MAX)) return fail('too_many');
    if (n * ITEM_BYTES > end - at) return fail('bad_field');
    for (let i = 0; i < n; i++, at += ITEM_BYTES) (list ? pkg.gifts : pkg.bag).push({ kind: buf[at], id: u32(buf, at + 1) });
  }
  if (at >= end) return fail('bad_field');
  const rn = buf[at++];
  if (rn > RECORDS_MAX) return fail('too_many');
  for (let i = 0; i < rn; i++) {
    if (end - at < 4) return fail('bad_field');
    const pack = u16(buf, at), plen = u16(buf, at + 2);
    at += 4;
    if (plen > end - at) return fail('bad_field');
    const raw = buf.subarray(at, at + plen);
    const si = parseSitem(pack, raw);
    if (!si) return fail('bad_record');
    if (pkg.records.some((r) => r.gid === si.gid)) return fail('bad_record');
    pkg.records.push({ pack, gid: si.gid, raw, item: si });
    at += plen;
  }
  if (end - at !== petLen) return fail('bad_field');
  if (pkg.petSchema !== PET_SCHEMA) return fail(pkg.petSchema > PET_SCHEMA ? 'unsupported_pet_schema' : 'bad_pet');
  if (petLen !== PET_LEN) return fail('bad_pet');
  pkg.pet = buf.subarray(at, at + petLen);
  const pet = readPet(pkg.pet);
  if (!pet) return fail('bad_pet');
  pkg.petInfo = pet;
  if (!itemsOk(pkg, pkg.bag, true) || !itemsOk(pkg, pkg.gifts, false)) return fail('bad_item');
  return { ok: true, pkg };
}

function itemOk(pkg, it, bag) {
  switch (it.kind) {
    case KIND.WEAR: return it.id > 0 && it.id < ITEM_COUNT;
    case KIND.SEASON: {
      const r = pkg.records.find((x) => x.gid === it.id);
      return !!r && (!bag || r.item.kind === 0);
    }
    case KIND.TOY: return bag && it.id > 0 && it.id < TOY_COUNT;
    case KIND.DECOR: return !bag && it.id > 0 && it.id < DECOR_COUNT;
    default: return false;
  }
}
function itemsOk(pkg, list, bag) {
  return list.every((it, i) => itemOk(pkg, it, bag) && !list.slice(0, i).some((o) => o.kind === it.kind && o.id === it.id));
}

/** The few fields of the pet record the town shows; null when one cannot be (the board would refuse the record too). */
export function readPet(p) {
  if (p.length !== PET_LEN) return null;
  const stage = p[P.stage], species = p[P.species];
  if (stage > 4 || species < 1 || species > 3) return null;
  const nameLen = p[P.nameLen];
  if (nameLen > P.nameBytes) return null;
  for (let i = nameLen; i < P.nameBytes; i++) if (p[P.name + i] !== 0) return null;
  let name = '';
  try { name = new TextDecoder('utf-8', { fatal: true }).decode(p.subarray(P.name, P.name + nameLen)); } catch { return null; }
  const stats = [];                                          // hunger, fun, energy, clean, health (pet.h pet_stat_t order), 0-100
  for (let i = 0; i < STAT_COUNT; i++) stats.push(Math.min(100, p[P.stats + i]));
  const equipped = [];
  for (let s = 0; s < SLOTS; s++) { const id = p[P.equipped + s]; if (id >= ITEM_COUNT) return null; equipped.push(id); }
  const seasonN = p[P.seasonN];
  if (seasonN > 32) return null;
  const owned = [];
  for (let i = 0; i < seasonN; i++) owned.push(u16(p, P.owned + i * 3) << 8 | p[P.owned + i * 3 + 2]);
  const worn = [];
  for (let s = 0; s < SLOTS; s++) {
    const g = (u16(p, P.worn + s * 3) << 8 | p[P.worn + s * 3 + 2]) >>> 0;
    if (g && !owned.includes(g)) return null;               // a worn seasonal item must be owned
    worn.push(g);
  }
  const gold = u32(p, P.gold), mask = u32(p, P.ownedMask);
  const core = [];                                           // the core items owned (ITEM_KEYS ids), by key
  for (let id = 1; id < ITEM_COUNT; id++) if (mask >>> id & 1) core.push(ITEM_KEYS[id]);
  return { stage, species, name, stats, equipped, worn, gold, core };
}

/** The town stage index (0 baby .. 3 elder) of a pet stage byte (0 arriving, 1 baby .. 4 elder). */
export const townStage = (stage) => Math.max(0, stage - 1);

const hex565 = (v) => {
  const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
  const c = [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
};
export const toBase64 = (b) => (typeof Buffer !== 'undefined' ? Buffer.from(b).toString('base64') : btoa(String.fromCharCode(...b)));
export const fromBase64 = (s) => {
  if (typeof s !== 'string' || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

/**
 * What the town needs to draw the pet: { name, species, stage (0..3), stats: [hunger, fun, energy, clean, health] 0..100, items: [head, face, neck, back] (catalogue keys or ''),
 * keepsakes: [{ slot, name, w, h, pal: ['#rrggbb' x 15], px: base64 of the first sprite's 4 bpp pixels }] }.
 * A keepsake whose record is not in the package is left out (the board hides it too).
 */
export function petView(pkg) {
  const info = pkg.petInfo;
  const keepsakes = [];
  const items = info.equipped.map((id, slot) => {
    const gid = info.worn[slot];
    const rec = gid ? pkg.records.find((r) => r.gid === gid) : null;
    if (rec && rec.item.kind === 0 && rec.item.slot === slot) {
      const s = rec.item.sprites[0];
      keepsakes.push({ slot, name: rec.item.name, w: s.w, h: s.h, pal: rec.item.palette.slice(1).map(hex565), px: toBase64(s.px) });
      return '';
    }
    return ITEM_KEYS[id] || '';
  });
  const bag = pkg.bag.map((it) => {                          // what the pet carries (X.0): wear by key, season by gid + name, toy by id
    if (it.kind === KIND.WEAR) return { kind: 'wear', key: ITEM_KEYS[it.id] };
    if (it.kind === KIND.SEASON) return { kind: 'season', gid: it.id, name: pkg.records.find((r) => r.gid === it.id).item.name };
    return { kind: 'toy', id: it.id };
  });
  return { name: info.name, species: SPECIES[info.species], stage: townStage(info.stage), stats: info.stats.slice(), items, keepsakes,
    gold: info.gold, owned: info.core, bag };
}

/**
 * The return package of an outbound one: the same bytes with the direction BACK and the sequence +1. A purchase (the shop, docs/trip-api.md)
 * also lowers the pet record's gold by `spent` (never below 0) and appends the `bought` core items (ITEM_KEYS keys) to the gifts list as
 * WEAR gifts; the gifts sit before the records, so the later bytes shift, and the length and the CRC are recomputed. Gold the villagers' missions
 * paid (`earned`) is added to the pet record's gold the same way (outbound - spent + earned): the board applies the signed difference with the gold it
 * left with. With nothing spent, earned or bought the bytes are the outbound ones, direction and sequence aside.
 */
export function buildReturn(out, seq, { spent = 0, earned = 0, bought = [] } = {}) {
  let b = new Uint8Array(out);
  b[6] = DIR_BACK;
  put32(b, 16, seq >>> 0);
  if (spent > 0 || earned > 0 || bought.length) {
    const petAt = b.length - 4 - u16(b, 22);
    if (spent > 0 || earned > 0) put32(b, petAt + P.gold, Math.min(0xFFFFFFFF, Math.max(0, u32(b, petAt + P.gold) - spent + earned)));
    if (bought.length) {
      let at = HEADER_BYTES + 1 + b[HEADER_BYTES] * ITEM_BYTES;           // the gifts count byte, after the backpack
      const gifts = b[at], end = at + 1 + gifts * ITEM_BYTES;
      const have = new Set();
      for (let i = 0; i < gifts; i++) if (b[at + 1 + i * ITEM_BYTES] === KIND.WEAR) have.add(u32(b, at + 2 + i * ITEM_BYTES));
      const ids = [...new Set(bought.map((k) => ITEM_KEYS.indexOf(k)))].filter((id) => id > 0 && !have.has(id)).slice(0, GIFT_MAX - gifts);
      const nb = new Uint8Array(b.length + ids.length * ITEM_BYTES);
      nb.set(b.subarray(0, end));
      ids.forEach((id, i) => { nb[end + i * ITEM_BYTES] = KIND.WEAR; put32(nb, end + i * ITEM_BYTES + 1, id); });
      nb.set(b.subarray(end), end + ids.length * ITEM_BYTES);
      nb[at] = gifts + ids.length;
      put32(nb, 8, nb.length);
      b = nb;
    }
  }
  put32(b, b.length - 4, crc32(b, b.length - 4));
  return b;
}
