// The database behind the trip handlers: PostgREST over fetch with the service role. The key comes from the function's environment
// (SUPABASE_SERVICE_ROLE_KEY is injected by Supabase); it is never written in the repository and never leaves this module.
// The handlers see only this small interface, which the tests replace with an in-memory one.

type Row = Record<string, unknown>;
type Where = Record<string, unknown[]>;

export function createDb(url: string, serviceKey: string) {
  const base = `${url}/rest/v1`;
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };
  const q = (v: unknown) => encodeURIComponent(String(v));
  const filter = (where: Where) => Object.entries(where).map(([k, vs]) => `${k}=in.(${vs.map(q).join(',')})`).join('&');

  async function call(path: string, init: RequestInit & { prefer?: string } = {}) {
    const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.prefer ? { prefer: init.prefer } : {}) } });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, json: text ? safeJson(text) : null };
  }
  const safeJson = (t: string) => { try { return JSON.parse(t); } catch { return null; } };
  const one = async (path: string): Promise<Row | null> => {
    const r = await call(path);
    if (!r.ok) throw new Error(`db ${r.status}`);
    return Array.isArray(r.json) && r.json.length ? r.json[0] : null;
  };

  return {
    getDevice: (id: string) => one(`/devices?id=eq.${q(id)}&select=*&limit=1`),
    async insertDevice(row: Row): Promise<boolean> {
      const r = await call('/devices', { method: 'POST', body: JSON.stringify(row), prefer: 'resolution=ignore-duplicates,return=representation' });
      if (!r.ok) throw new Error(`db ${r.status}`);
      return Array.isArray(r.json) && r.json.length === 1;
    },
    getTripByDevice: (deviceId: string, tripId: number) => one(`/trips?device_id=eq.${q(deviceId)}&trip_id=eq.${tripId}&select=*&limit=1`),
    getTripByCode: (code: string) => one(`/trips?code=eq.${q(code)}&select=*&limit=1`),
    getTripById: (id: string) => one(`/trips?id=eq.${q(id)}&select=*&limit=1`),
    async insertTrip(row: Row): Promise<'ok' | 'code_taken' | 'conflict'> {
      const r = await call('/trips', { method: 'POST', body: JSON.stringify(row), prefer: 'return=minimal' });
      if (r.ok) return 'ok';
      if (r.status === 409) return /trips_code_key/.test(r.text) ? 'code_taken' : 'conflict';
      throw new Error(`db ${r.status}`);
    },
    /** Atomic conditional update: the patch applies only while every `where` column holds one of its values. Returns the new row, or null. */
    async updateTrip(id: string, where: Where, patch: Row): Promise<Row | null> {
      const r = await call(`/trips?id=eq.${q(id)}&${filter(where)}`, { method: 'PATCH', body: JSON.stringify(patch), prefer: 'return=representation' });
      if (!r.ok) throw new Error(`db ${r.status}`);
      return Array.isArray(r.json) && r.json.length ? r.json[0] : null;
    },
    async cancelOpenTrips(deviceId: string): Promise<void> {
      const r = await call(`/trips?device_id=eq.${q(deviceId)}&status=in.(waiting,active,recalled,returned)`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', session_hash: null }), prefer: 'return=minimal' });
      if (!r.ok) throw new Error(`db ${r.status}`);
    },
    async listEvents(fromIso: string, toIso: string): Promise<Row[]> {
      const r = await call(`/town_events?cancelled_at=is.null&start_at=gte.${q(fromIso)}&start_at=lte.${q(toIso)}&select=*&order=start_at.asc&limit=50`);
      if (!r.ok) throw new Error(`db ${r.status}`);
      return Array.isArray(r.json) ? r.json : [];
    },
    async countUpcoming(nowIso: string): Promise<number> {
      const r = await call(`/town_events?cancelled_at=is.null&start_at=gt.${q(nowIso)}&select=id&limit=100`);
      if (!r.ok) throw new Error(`db ${r.status}`);
      return Array.isArray(r.json) ? r.json.length : 0;
    },
    getEvent: (id: string) => one(`/town_events?id=eq.${q(id)}&select=*&limit=1`),
    async insertEvent(row: Row): Promise<void> {
      const r = await call('/town_events', { method: 'POST', body: JSON.stringify(row), prefer: 'return=minimal' });
      if (!r.ok) throw new Error(`db ${r.status}`);
    },
    async cancelEvent(id: string, atIso: string): Promise<Row | null> {
      const r = await call(`/town_events?id=eq.${q(id)}&cancelled_at=is.null`, { method: 'PATCH', body: JSON.stringify({ cancelled_at: atIso }), prefer: 'return=representation' });
      if (!r.ok) throw new Error(`db ${r.status}`);
      return Array.isArray(r.json) && r.json.length ? r.json[0] : null;
    },
    async cleanup(): Promise<void> {
      await call('/rpc/cleanup_trips', { method: 'POST', body: '{}' });
    },
  };
}
