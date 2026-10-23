// The web side of a trip (docs/trip-api.md): claim the code, keep the session, save, and watch for the recall.
// `fetch` and the timers are injected so the flow is tested in Node; nothing here touches the DOM.
import { normalizeTripCode } from './trip-code.js';
import { parseKeepsake } from './keepsake.js';
import { validateLook, sanitizeName } from './protocol.js';
import { entranceId } from './entrance.js';

export const POLL_MS = 5000;
const KEY = 'city.trip';

/** The code in a page's query string (?trip=K7M2QX), normalized, or null. */
export function tripCodeFromSearch(search) {
  return normalizeTripCode(new URLSearchParams(search).get('trip'));
}

/** What went wrong, as the Spanish sentence the page shows. */
export function tripErrorText(error) {
  switch (error) {
    case 'unknown_code': return 'Ese código de viaje no existe. Revisa que esté bien escrito.';
    case 'bad_code': return 'El código de viaje no es válido.';
    case 'code_expired': return 'Este código venció. Pide uno nuevo en la placa.';
    case 'trip_over': return 'Este viaje ya terminó.';
    case 'already_claimed': return 'Esta mascota ya está de visita en otra ventana.';
    case 'network': return 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.';
    default: return 'No se pudo abrir el viaje. Inténtalo de nuevo.';
  }
}

/** A claim's pet, as the town's own { name, look, keepsakes }; null when it is not something the town can draw. */
export function petFromClaim(pet, catalogue) {
  if (!pet || typeof pet !== 'object') return null;
  const look = validateLook(pet, catalogue);
  if (!look) return null;
  const keepsakes = (Array.isArray(pet.keepsakes) ? pet.keepsakes : []).slice(0, 4).map(parseKeepsake).filter(Boolean);
  return { name: sanitizeName(pet.name), look, keepsakes };
}

export function createTripClient({ base, fetch: fetcher = globalThis.fetch, storage = null, setInterval: setI = globalThis.setInterval, clearInterval: clearI = globalThis.clearInterval }) {
  let session = null;                                   // { code, trip, token, version, entrance }

  const read = () => { try { return JSON.parse(storage?.getItem(KEY) || 'null'); } catch { return null; } };
  const write = (v) => { try { v ? storage?.setItem(KEY, JSON.stringify(v)) : storage?.removeItem(KEY); } catch { /* private mode */ } };

  async function post(fn, body, token) {
    let res;
    try {
      res = await fetcher(`${base}/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-trip-token': token } : {}) }, body: JSON.stringify(body) });
    } catch { return { ok: false, status: 0, error: 'network' }; }
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    return res.status >= 200 && res.status < 300 && json ? { ok: true, status: res.status, body: json } : { ok: false, status: res.status, error: json?.error || 'unknown', body: json };
  }

  return {
    get session() { return session; },

    /** Claims (or resumes) a code. { ok, resumed, entrance, pet } or { ok: false, error }. */
    async claim(code, catalogue) {
      const saved = read();
      const token = saved && saved.code === code ? saved.token : undefined;
      const r = await post('trip-claim', { code, ...(token ? { token } : {}) });
      if (!r.ok) { if (r.error === 'trip_over') write(null); return { ok: false, error: r.error }; }
      const pet = petFromClaim(r.body.pet, catalogue);
      if (!pet) return { ok: false, error: 'bad_pet' };
      session = { code, trip: r.body.trip, token: r.body.token, version: r.body.state?.version ?? 0, entrance: entranceId(r.body.entrance) };
      write({ code, token: session.token });
      return { ok: true, resumed: token !== undefined && token === r.body.token, entrance: session.entrance, pet };
    },

    /** Stores the entrance (the dev flag) and, later, the state of the pet. Returns false when the server refused. */
    async save({ entrance, state } = {}) {
      if (!session) return false;
      const r = await post('trip-save', { trip: session.trip, base_version: session.version, ...(state ? { state } : {}), ...(entrance ? { entrance } : {}) }, session.token);
      if (r.ok) { session.version = r.body.version; session.entrance = entranceId(r.body.entrance); return true; }
      if (r.error === 'version_conflict' && Number.isInteger(r.body?.version)) session.version = r.body.version;
      return false;
    },

    /** Polls the trip every POLL_MS; `onChange(kind)` is called once with 'recalled' (play the departure) or 'over' (the session ended
     *  some other way: cancelled, replaced by another window). Returns a function that stops the polling. */
    watch(onChange) {
      let stopped = false, busy = false;
      const tick = async () => {
        if (stopped || busy || !session) return;
        busy = true;
        const r = await post('trip-status', { trip: session.trip }, session.token);
        busy = false;
        if (stopped) return;
        if (r.ok && r.body.recalled) { finish('recalled'); return; }
        if (r.ok && r.body.status !== 'active') finish('over');
        else if (!r.ok && (r.status === 401 || r.status === 410)) finish('over');
      };
      const finish = (kind) => { stopped = true; clearI(timer); write(null); onChange(kind); };
      const timer = setI(tick, POLL_MS);
      tick();
      return () => { stopped = true; clearI(timer); };
    },

    forget() { session = null; write(null); },
  };
}
