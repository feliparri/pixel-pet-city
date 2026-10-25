// The town's scheduled shows from the browser's side: the calls to the trip function's `events`, `event-save` and `event-cancel`
// (docs/trip-api.md) and the clock offset that lines every player up with the server's moment.

/** A client for the function at `base` (".../functions/v1/trip"). Every call answers { ok, status, body } or { ok: false, status: 0, error: 'network' }. */
export function createEventsApi({ base, fetch: fetcher = globalThis.fetch }) {
  async function call(fn, body, adminKey) {
    let res;
    try {
      res = await fetcher(`${base}/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(adminKey ? { 'x-admin-key': adminKey } : {}) }, body: JSON.stringify(body || {}) });
    } catch { return { ok: false, status: 0, error: 'network' }; }
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    return res.status >= 200 && res.status < 300 && json ? { ok: true, status: res.status, body: json } : { ok: false, status: res.status, error: json?.error || 'unknown', body: json };
  }
  return {
    /** Upcoming and running shows; `aheadDays` (1..60) and `limit` (1..50) widen the list. */
    list: ({ aheadDays, limit } = {}) => call('events', { ...(aheadDays ? { ahead_days: aheadDays } : {}), ...(limit ? { limit } : {}) }),
    save: (event, adminKey) => call('event-save', event, adminKey),
    cancel: (id, adminKey) => call('event-cancel', { id }, adminKey),
  };
}

/**
 * The server's clock minus this device's, in ms, from an `events` answer sent at `sentAt` and received at `receivedAt` (device clock, ms): the
 * server's `now` is taken to be the middle of the round trip. Add it to Date.now() to read the server's time.
 */
export function clockOffset(serverNow, sentAt, receivedAt) {
  return serverNow - (sentAt + receivedAt) / 2;
}

/** The text for an error code of the admin calls (Spanish). */
export function adminErrorText(error) {
  switch (error) {
    case 'bad_admin_key': return 'La clave no es correcta.';
    case 'admin_disabled': return 'El servidor todavía no tiene configurada la clave de administrador (ADMIN_KEY).';
    case 'too_many_attempts': return 'Demasiados intentos con clave incorrecta. Espera unos minutos.';
    case 'bad_kind': return 'Elige un tipo de show.';
    case 'bad_seed': return 'La semilla debe ser un número entero entre 0 y 2147483647.';
    case 'bad_start': case 'start_in_the_past': return 'La fecha y la hora deben estar en el futuro.';
    case 'start_too_far': return 'Solo se puede programar hasta 60 días hacia adelante.';
    case 'too_many_events': return 'Ya hay demasiados shows programados. Cancela alguno.';
    case 'unknown_event': return 'Ese show ya no existe.';
    case 'network': return 'No se pudo conectar con el servidor.';
    default: return 'No se pudo completar. Inténtalo de nuevo.';
  }
}
