// An in-memory database with the interface of supabase/functions/trip/db.ts, and a way to call the handlers like a board or a browser.
import { readFileSync } from 'node:fs';
import { randomBytes as nodeRandom, randomUUID } from 'node:crypto';
import { handle } from '../supabase/functions/trip/handlers.js';
import { signRequest, toHex } from '../supabase/functions/trip/crypto.js';
import { toBase64 } from '../supabase/functions/trip/travel-package.js';

export const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

export function memoryDb() {
  const devices = new Map(), trips = new Map(), townEvents = new Map(), tools = new Map(), petDays = new Map();
  const matches = (row, where) => Object.entries(where).every(([k, vs]) => vs.some((v) => row[k] === v));
  const db = {
    devices, trips, townEvents, tools, petDays,
    async getDevice(id) { return devices.get(id) ?? null; },
    async insertDevice(row) { if (devices.has(row.id)) return false; devices.set(row.id, { ...row }); return true; },
    async getTripByDevice(d, t) { return [...trips.values()].find((x) => x.device_id === d && x.trip_id === t) ?? null; },
    async getTripByCode(c) { return [...trips.values()].find((x) => x.code === c) ?? null; },
    async getTripById(id) { return trips.get(id) ?? null; },
    async insertTrip(row) {
      if ([...trips.values()].some((x) => x.code === row.code)) return 'code_taken';
      if ([...trips.values()].some((x) => x.device_id === row.device_id && x.trip_id === row.trip_id)) return 'conflict';
      trips.set(row.id, { ...row });
      return 'ok';
    },
    async updateTrip(id, where, patch) {
      const row = trips.get(id);
      if (!row || !matches(row, where)) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async cancelOpenTrips(d) {
      for (const t of trips.values()) if (t.device_id === d && ['waiting', 'active', 'recalled', 'returned'].includes(t.status)) Object.assign(t, { status: 'cancelled', session_hash: null });
    },
    async getTools(d) { return [...(tools.get(d) ?? [])]; },
    async addTool(d, t) { tools.set(d, new Set([...(tools.get(d) ?? []), t])); },
    async getPetDay(d, day) { const r = petDays.get(`${d}|${day}`); return r ? { ...r, done: [...r.done] } : null; },
    async insertPetDay(row) { if (!petDays.has(`${row.device_id}|${row.day}`)) petDays.set(`${row.device_id}|${row.day}`, { ...row, done: [...row.done] }); },
    async updatePetDay(d, day, where, patch) {
      const row = petDays.get(`${d}|${day}`);
      if (!row || !matches(row, where)) return null;
      Object.assign(row, patch);
      return { ...row, done: [...row.done] };
    },
    async cleanup() {},
    async listEvents(from, to) { return [...townEvents.values()].filter((e) => !e.cancelled_at && e.start_at >= from && e.start_at <= to).sort((a, b) => a.start_at.localeCompare(b.start_at)); },
    async countUpcoming(now) { return [...townEvents.values()].filter((e) => !e.cancelled_at && e.start_at > now).length; },
    async getEvent(id) { return townEvents.get(id) ?? null; },
    async insertEvent(row) { townEvents.set(row.id, { ...row }); },
    async cancelEvent(id, at) { const e = townEvents.get(id); if (!e || e.cancelled_at) return null; e.cancelled_at = at; return { ...e }; },
  };
  return db;
}

/** A world: a database, a clock, and `board()` / `web()` callers. */
export function world({ now = 1_800_000_000, randomBytes, adminKey = undefined } = {}) {
  const w = { db: memoryDb(), now };
  const deps = {
    db: w.db, nowS: () => w.now, randomBytes: randomBytes ?? ((n) => new Uint8Array(nodeRandom(n))), uuid: randomUUID,
    townUrl: 'https://feliparri.github.io/pixel-pet-city/', adminKey, attempts: [],
  };
  const send = async (fn, headers, obj) => handle(fn, { method: 'POST', headers, body: new TextEncoder().encode(JSON.stringify(obj)) }, deps);
  w.raw = (fn, body, headers = {}, method = 'POST') => handle(fn, { method, headers, body }, deps);
  w.board = () => {
    const deviceId = toHex(nodeRandom(16)), secretHex = toHex(nodeRandom(32));
    const b = {
      deviceId, secretHex,
      call: async (fn, obj, over = {}) => {
        const body = new TextEncoder().encode(JSON.stringify(obj));
        const headers = await signRequest({ deviceId, secretHex, fn, body, ts: w.now, ...over });
        return handle(fn, { method: 'POST', headers, body }, deps);
      },
      register: () => send('device-register', {}, { device_id: deviceId, secret: secretHex }),
      start: (pkg, extra = {}) => b.call('trip-start', { package: toBase64(pkg), ...extra }),
    };
    return b;
  };
  w.admin = (fn, obj, key) => send(fn, key === undefined ? {} : { 'x-admin-key': key }, obj);
  w.web = (token) => ({
    call: (fn, obj) => send(fn, token ? { 'x-trip-token': token } : {}, obj),
  });
  return w;
}
