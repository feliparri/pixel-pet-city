// The trip API (docs/trip-api.md) as pure functions: a request in, a { status, body } out. The database, the clock and the random source are
// injected (`deps`), so the same code runs in the Edge Functions and under `node --test` with an in-memory database.
import { parsePackage, buildReturn, petView, fromBase64, toBase64, GIFT_MAX, BYTES_MAX } from './travel-package.js';
import { sha256Hex, fromHex, verifyRequest, randomHex, safeEqual } from './crypto.js';
import { newCode, normalizeCode, isEntrance, DEFAULT_ENTRANCE } from './trip-code.js';
import { cleanRadar } from './radar.js';
import { SHOP, isForSale } from './shop.js';
import { TOOLS, isTool } from './tools.js';
import { events, eventSave, eventCancel } from './events.js';

export const BODY_MAX = 12288;                 // a 6144-byte package is 8192 base64 characters, plus the JSON around it
export const STATE_MAX = 2048;                 // the saved JSON state, serialized
export const CLAIM_TTL_S = 24 * 3600;
export const SESSION_IDLE_S = 600;             // a web session silent this long can be taken over by a new claim
export const OPEN = ['waiting', 'active', 'recalled', 'returned'];
const DEVICE_FNS = new Set(['trip-start', 'trip-recall', 'trip-return', 'trip-ack']);

const reply = (status, body) => ({ status, body });
const err = (status, error, extra = {}) => reply(status, { error, ...extra });

function parseJson(bytes) {
  if (bytes.length > BODY_MAX) return { fail: err(413, 'too_large') };
  try {
    const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return v && typeof v === 'object' && !Array.isArray(v) ? { v } : { fail: err(400, 'bad_json') };
  } catch { return { fail: err(400, 'bad_json') }; }
}

const isU32 = (n) => Number.isInteger(n) && n >= 1 && n <= 0xFFFFFFFF;
const iso = (s) => new Date(s * 1000).toISOString();
const ms = (t) => (t ? Date.parse(t) : 0);

/** device auth: returns { device } or { fail } */
async function authDevice(req, fn, deps) {
  const id = req.headers['x-device-id'];
  if (!/^[0-9a-f]{32}$/.test(id || '')) return { fail: err(401, 'bad_headers') };
  const device = await deps.db.getDevice(id);
  if (!device) return { fail: err(401, 'unknown_device') };
  const r = await verifyRequest({ headers: req.headers, method: req.method, fn, body: req.body, keyHashHex: device.key_hash, nowS: deps.nowS() });
  return r === 'ok' ? { device } : { fail: err(401, r) };
}

/** the trip a device names, or a 404 */
async function deviceTrip(device, tripId, deps) {
  if (!isU32(tripId)) return { fail: err(400, 'bad_trip_id') };
  const trip = await deps.db.getTripByDevice(device.id, tripId);
  return trip ? { trip } : { fail: err(404, 'unknown_trip') };
}

/** the trip a web session names (body.trip = the trip's opaque ref, header x-trip-token = the session token) */
async function webTrip(req, body, deps) {
  const token = req.headers['x-trip-token'];
  if (typeof body.trip !== 'string' || !/^[0-9a-f-]{36}$/.test(body.trip) || !/^[0-9a-f]{64}$/.test(token || '')) return { fail: err(401, 'bad_session') };
  const trip = await deps.db.getTripById(body.trip);
  if (!trip || !trip.session_hash || !safeEqual(await sha256Hex(fromHex(token)), trip.session_hash)) return { fail: err(401, 'bad_session') };
  return { trip };
}

/** what the shop has left to spend: the pet's gold at the start minus the ledger (null for a trip that started before gold was read) */
const shopView = (trip) => ({
  can_spend: !!trip.can_spend, gold_left: trip.can_spend && trip.pet_view?.gold !== undefined ? Math.max(0, trip.pet_view.gold - (trip.spent ?? 0)) : null,
  bought: trip.bought ?? [],
});

/** The claim's view; `tools` (the pet's farm tools, kept per board) goes inside the pet. */
const view = (trip, tools = []) => ({
  trip: trip.id, status: trip.status, entrance: trip.entrance, pet: { ...trip.pet_view, tools },
  state: { version: trip.state_version, data: trip.state }, ...shopView(trip),
});

// ---- device-register ----------------------------------------------------------------------------------------------------------
async function deviceRegister(req, deps) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const { device_id: id, secret } = p.v;
  if (!/^[0-9a-f]{32}$/.test(id || '') || !/^[0-9a-f]{64}$/.test(secret || '')) return err(400, 'bad_device');
  const keyHash = await sha256Hex(fromHex(secret));
  const existing = await deps.db.getDevice(id);
  if (existing) return safeEqual(existing.key_hash, keyHash) ? reply(200, { device_id: id, existed: true }) : err(409, 'device_conflict');
  if (await deps.db.insertDevice({ id, key_hash: keyHash })) return reply(201, { device_id: id, existed: false });
  const again = await deps.db.getDevice(id);                                  // lost a race: the same secret is still idempotent
  return again && safeEqual(again.key_hash, keyHash) ? reply(200, { device_id: id, existed: true }) : err(409, 'device_conflict');
}

// ---- trip-start ---------------------------------------------------------------------------------------------------------------
async function tripStart(req, deps, device) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const entrance = p.v.entrance === undefined ? DEFAULT_ENTRANCE : p.v.entrance;
  if (!isEntrance(entrance)) return err(400, 'bad_entrance');
  const bytes = fromBase64(p.v.package);
  if (!bytes) return err(400, 'bad_package_encoding');
  const parsed = parsePackage(bytes);
  if (!parsed.ok) return err(422, 'bad_package', { reason: parsed.status });
  const { pkg } = parsed;
  if (pkg.dir !== 0) return err(422, 'bad_package', { reason: 'bad_direction' });
  const sha = await sha256Hex(bytes);
  const town = deps.townUrl;
  const answer = (trip, status) => reply(status, { trip_id: pkg.tripId, trip: trip.id, code: trip.code, url: `${town}?trip=${trip.code}`, expires_at: trip.expires_at, entrance: trip.entrance, status: trip.status });

  const same = await deps.db.getTripByDevice(device.id, pkg.tripId);
  if (same) {
    if (same.package_sha256 === sha && ['waiting', 'active'].includes(same.status)) return answer(same, 200);   // the board retried
    return err(409, 'trip_exists', { status: same.status });
  }
  await deps.db.cleanup().catch(() => {});                                   // housekeeping; never blocks a start
  await deps.db.cancelOpenTrips(device.id);                                  // the board starts a new trip: the old one is over
  const now = deps.nowS();
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = {
      id: deps.uuid(), device_id: device.id, trip_id: pkg.tripId, code: newCode(deps.randomBytes), status: 'waiting',
      package_b64: p.v.package, package_sha256: sha, package_bytes: bytes.length, seq: pkg.seq,
      pet_view: petView(pkg), entrance, state: {}, state_version: 0, session_hash: null, session_seen_at: null,
      can_spend: p.v.spend === 1, spent: 0, bought: [],
      created_at: iso(now), expires_at: iso(now + CLAIM_TTL_S), claimed_at: null, recalled_at: null, returned_at: null, closed_at: null,
    };
    const r = await deps.db.insertTrip(row);
    if (r === 'ok') return answer(row, 201);
    if (r !== 'code_taken') return err(409, 'trip_exists');
  }
  return err(503, 'no_code_available');
}

// ---- trip-claim ---------------------------------------------------------------------------------------------------------------
async function tripClaim(req, deps) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const code = normalizeCode(p.v.code);
  if (!code) return err(400, 'bad_code');
  let trip = await deps.db.getTripByCode(code);
  if (!trip) return err(404, 'unknown_code');
  const now = deps.nowS();
  if (trip.status === 'waiting' && ms(trip.expires_at) < now * 1000) return err(410, 'code_expired');
  if (trip.status === 'expired') return err(410, 'code_expired');
  if (trip.status !== 'waiting' && trip.status !== 'active') return err(410, 'trip_over', { status: trip.status });

  const toolsOf = async (row) => deps.db.getTools(row.device_id).catch((e) => { deps.log?.('trip-claim tools', e); return []; });
  const newSession = async (where) => {
    const token = randomHex(32);
    const patch = { status: 'active', session_hash: await sha256Hex(fromHex(token)), session_seen_at: iso(now) };
    if (trip.status === 'waiting') patch.claimed_at = iso(now);
    const row = await deps.db.updateTrip(trip.id, where, patch);
    return row ? reply(200, { ...view(row, await toolsOf(row)), token }) : null;
  };
  if (trip.status === 'waiting') {
    const r = await newSession({ status: ['waiting'] });
    if (r) return r;
    trip = await deps.db.getTripById(trip.id);                                // somebody claimed it first
    if (!trip || trip.status !== 'active') return err(409, 'already_claimed');
  }
  const token = req.headers['x-trip-token'] || p.v.token;
  if (typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) && trip.session_hash && safeEqual(await sha256Hex(fromHex(token)), trip.session_hash)) {
    const row = await deps.db.updateTrip(trip.id, { status: ['active'], session_hash: [trip.session_hash] }, { session_seen_at: iso(now) });
    return row ? reply(200, { ...view(row, await toolsOf(row)), token }) : err(409, 'already_claimed');   // resumed: the same token keeps working
  }
  if (ms(trip.session_seen_at) < (now - SESSION_IDLE_S) * 1000) {            // the old tab went quiet: this one takes over
    const r = await newSession({ status: ['active'], session_hash: [trip.session_hash] });
    if (r) return r;
  }
  return err(409, 'already_claimed');
}

// ---- trip-save ----------------------------------------------------------------------------------------------------------------
async function tripSave(req, deps) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const s = await webTrip(req, p.v, deps);
  if (s.fail) return s.fail;
  const { trip } = s;
  if (trip.status !== 'active') return err(409, trip.status === 'recalled' || trip.status === 'returned' ? 'trip_recalled' : 'trip_over', { status: trip.status });
  const { base_version: base, state, entrance } = p.v;
  if (!Number.isInteger(base) || base < 0) return err(400, 'bad_version');
  if (state !== undefined && (!state || typeof state !== 'object' || Array.isArray(state) || JSON.stringify(state).length > STATE_MAX)) return err(400, 'bad_state');
  if (entrance !== undefined && !isEntrance(entrance)) return err(400, 'bad_entrance');
  if (base !== trip.state_version) return err(409, 'version_conflict', { version: trip.state_version });
  const patch = { session_seen_at: iso(deps.nowS()), state_version: base + 1 };
  if (state !== undefined) patch.state = state;
  if (entrance !== undefined) patch.entrance = entrance;
  const row = await deps.db.updateTrip(trip.id, { status: ['active'], state_version: [base] }, patch);
  if (!row) return err(409, 'version_conflict', { version: (await deps.db.getTripById(trip.id))?.state_version ?? base });
  return reply(200, { version: row.state_version, entrance: row.entrance });
}

// ---- trip-buy -----------------------------------------------------------------------------------------------------------------
// The shop (docs/trip-api.md): the pet's gold buys a core WEAR item that comes home as a gift. The ledger (spent, bought) is written only here.
async function tripBuy(req, deps) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const s = await webTrip(req, p.v, deps);
  if (s.fail) return s.fail;
  const { trip } = s;
  if (trip.status !== 'active') return err(409, 'trip_over', { status: trip.status });
  if (!trip.can_spend) return err(403, 'shop_closed');
  const key = p.v.item;
  if (!isForSale(key)) return err(400, 'not_for_sale');
  const bytes = trip.package_b64 ? fromBase64(trip.package_b64) : null;
  const parsed = bytes && parsePackage(bytes);
  if (!parsed || !parsed.ok) return err(500, 'internal');
  const { pkg } = parsed;
  const spent = trip.spent ?? 0, bought = trip.bought ?? [];
  const item = SHOP[key];
  if (pkg.petInfo.core.includes(key) || bought.includes(key)) return err(409, 'owned');
  if (pkg.gifts.length + bought.length >= GIFT_MAX || bytes.length + 5 * (bought.length + 1) > BYTES_MAX) return err(409, 'bag_full');
  if (item.price > pkg.petInfo.gold - spent) return err(409, 'no_gold', { gold_left: Math.max(0, pkg.petInfo.gold - spent), price: item.price });
  const row = await deps.db.updateTrip(trip.id, { status: ['active'], spent: [spent] }, { spent: spent + item.price, bought: [...bought, key], session_seen_at: iso(deps.nowS()) });
  if (!row) return err(409, 'conflict');                                       // another buy or the recall got in first: the client asks again
  return reply(200, { gold_left: pkg.petInfo.gold - row.spent, bought: row.bought });
}

// ---- trip-buy-tool ------------------------------------------------------------------------------------------------------------
// The Almacén: a farm tool paid with the pet's gold through the same ledger (trip.spent) as trip-buy. The tool is kept per board (pet_tools), so it
// stays with the pet on later trips; it never goes in the return package, only its price lowers the returned gold.
async function tripBuyTool(req, deps) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const s = await webTrip(req, p.v, deps);
  if (s.fail) return s.fail;
  const { trip } = s;
  if (trip.status !== 'active') return err(409, 'trip_over', { status: trip.status });
  const gold = trip.pet_view?.gold;
  if (!trip.can_spend || !Number.isInteger(gold)) return err(403, 'shop_closed');
  const key = p.v.tool;
  if (!isTool(key)) return err(400, 'not_for_sale');
  const owned = await deps.db.getTools(trip.device_id);
  if (owned.includes(key)) return err(409, 'owned', { tools: owned });
  const spent = trip.spent ?? 0, price = TOOLS[key].price, left = gold - spent;
  if (price > left) return err(409, 'no_gold', { gold_left: Math.max(0, left), price });
  const row = await deps.db.updateTrip(trip.id, { status: ['active'], spent: [spent] }, { spent: spent + price, session_seen_at: iso(deps.nowS()) });
  if (!row) return err(409, 'conflict');                                       // another buy or the recall got in first: the client asks again
  try {
    await deps.db.addTool(trip.device_id, key);
  } catch (e) {                                                                // the gold must not go without the tool: give it back, then fail
    deps.log?.('trip-buy-tool', e);
    await deps.db.updateTrip(trip.id, { spent: [row.spent] }, { spent }).catch((e2) => deps.log?.('trip-buy-tool undo', e2));
    return err(503, 'try_again');
  }
  return reply(200, { gold_left: gold - row.spent, tools: [...owned, key] });
}

// ---- trip-recall --------------------------------------------------------------------------------------------------------------
async function tripRecall(req, deps, device) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const t = await deviceTrip(device, p.v.trip_id, deps);
  if (t.fail) return t.fail;
  let { trip } = t;
  if (trip.status === 'recalled') return reply(200, { trip_id: trip.trip_id, status: 'recalled', replayed: true });
  if (['returned', 'closed', 'cancelled'].includes(trip.status)) return err(409, trip.status === 'cancelled' ? 'trip_cancelled' : 'trip_already_returned', { status: trip.status });
  const row = await deps.db.updateTrip(trip.id, { status: ['waiting', 'active', 'expired'] }, { status: 'recalled', recalled_at: iso(deps.nowS()) });
  if (row) return reply(200, { trip_id: trip.trip_id, status: 'recalled', replayed: false });
  trip = await deps.db.getTripById(trip.id);                                   // it moved while we looked
  return trip && trip.status === 'recalled' ? reply(200, { trip_id: trip.trip_id, status: 'recalled', replayed: true }) : err(409, 'trip_already_returned', { status: trip?.status });
}

// ---- trip-status --------------------------------------------------------------------------------------------------------------
async function tripStatus(req, deps) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  let trip;
  let device = false;
  if (req.headers['x-device-id']) {
    const a = await authDevice(req, 'trip-status', deps);
    if (a.fail) return a.fail;
    const t = await deviceTrip(a.device, p.v.trip_id, deps);
    if (t.fail) return t.fail;
    trip = t.trip, device = true;
  } else {
    const s = await webTrip(req, p.v, deps);
    if (s.fail) return s.fail;
    trip = s.trip;
    if (trip.status === 'active') await deps.db.updateTrip(trip.id, { status: ['active'], session_hash: [trip.session_hash] }, { session_seen_at: iso(deps.nowS()) });
  }
  return reply(200, {
    status: trip.status, recalled: ['recalled', 'returned', 'closed'].includes(trip.status), claimed: !!trip.claimed_at,
    entrance: trip.entrance, version: trip.state_version,
    ...(device ? { trip_id: trip.trip_id, radar: cleanRadar(trip.state?.radar, deps.nowS()) } : shopView(trip)),
  });
}

// ---- trip-return --------------------------------------------------------------------------------------------------------------
async function tripReturn(req, deps, device) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const t = await deviceTrip(device, p.v.trip_id, deps);
  if (t.fail) return t.fail;
  let { trip } = t;
  if (['waiting', 'active', 'expired'].includes(trip.status)) return err(409, 'not_recalled', { status: trip.status });
  if (trip.status === 'closed' || trip.status === 'cancelled') return err(409, trip.status === 'closed' ? 'trip_closed' : 'trip_cancelled', { status: trip.status });
  if (trip.status === 'recalled') {
    const row = await deps.db.updateTrip(trip.id, { status: ['recalled'] }, { status: 'returned', returned_at: iso(deps.nowS()) });
    if (row) trip = row;
    else trip = await deps.db.getTripById(trip.id);
  }
  if (!trip || trip.status !== 'returned' || !trip.package_b64) return err(409, 'trip_closed', { status: trip?.status });
  const seq = (trip.seq + 1) >>> 0;
  const pkg = buildReturn(fromBase64(trip.package_b64), seq, { spent: trip.spent ?? 0, bought: trip.bought ?? [] });
  return reply(200, { trip_id: trip.trip_id, seq, size: pkg.length, package: toBase64(pkg) });   // asking again returns the same bytes until the ack
}

// ---- trip-ack -----------------------------------------------------------------------------------------------------------------
async function tripAck(req, deps, device) {
  const p = parseJson(req.body);
  if (p.fail) return p.fail;
  const t = await deviceTrip(device, p.v.trip_id, deps);
  if (t.fail) return t.fail;
  const { trip } = t;
  if (p.v.seq !== undefined && p.v.seq !== (trip.seq + 1) >>> 0) return err(409, 'bad_seq');
  if (trip.status === 'closed') return reply(200, { trip_id: trip.trip_id, status: 'closed', replayed: true });
  if (trip.status !== 'returned') return err(409, trip.status === 'cancelled' ? 'trip_cancelled' : 'not_returned', { status: trip.status });
  const row = await deps.db.updateTrip(trip.id, { status: ['returned'] }, { status: 'closed', closed_at: iso(deps.nowS()), package_b64: '', session_hash: null, state: {} });
  if (row) return reply(200, { trip_id: trip.trip_id, status: 'closed', replayed: false });
  const now = await deps.db.getTripById(trip.id);
  return now && now.status === 'closed' ? reply(200, { trip_id: trip.trip_id, status: 'closed', replayed: true }) : err(409, 'not_returned', { status: now?.status });
}

const ROUTES = { 'device-register': deviceRegister, 'trip-claim': tripClaim, 'trip-save': tripSave, 'trip-buy': tripBuy, 'trip-buy-tool': tripBuyTool, 'trip-status': tripStatus,
  'trip-start': tripStart, 'trip-recall': tripRecall, 'trip-return': tripReturn, 'trip-ack': tripAck,
  'events': events, 'event-save': eventSave, 'event-cancel': eventCancel };
const GET_OK = new Set(['events']);                // the public list can also be read with GET

/**
 * One call. req: { method, headers (lower-case names), body: Uint8Array }; deps: { db, nowS(), randomBytes(n), uuid(), townUrl }.
 * Returns { status, body } where body is the JSON object to send.
 */
export async function handle(fn, req, deps) {
  const route = ROUTES[fn];
  if (!route) return err(404, 'unknown_function');
  if (req.method !== 'POST' && !(req.method === 'GET' && GET_OK.has(fn))) return err(405, 'method_not_allowed');
  if (req.body.length > BODY_MAX) return err(413, 'too_large');
  try {
    if (DEVICE_FNS.has(fn)) {
      const a = await authDevice(req, fn, deps);
      if (a.fail) return a.fail;
      return await route(req, deps, a.device);
    }
    return await route(req, deps);
  } catch (e) {
    deps.log?.(fn, e);
    return err(500, 'internal');
  }
}

