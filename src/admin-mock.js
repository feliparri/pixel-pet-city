// Development only (admin.html?mock=1): a stand-in for the trip function that lives in the page, so the admin page can be tried and
// photographed without a server or a key. The key it accepts is "prueba". Never loaded without ?mock=1.
export function createMockFetch(now = () => Date.now()) {
  const events = [], seasons = new Map();
  let n = 0;
  const reply = (status, body) => ({ status, json: async () => body });
  return async (url, init) => {
    const fn = String(url).split('/').pop();
    const body = JSON.parse(init.body || '{}'), key = init.headers['x-admin-key'];
    if (fn === 'events') {
      const days = body.ahead_days || 7;
      return reply(200, { now: now(), events: events.filter((e) => !e.gone && e.start_ms < now() + days * 86400000).sort((a, b) => a.start_ms - b.start_ms), seasons: [...seasons.values()] });
    }
    if (key !== 'prueba') return reply(401, { error: 'bad_admin_key' });
    if (fn === 'event-save') {
      const start = Date.parse(body.start_at);
      if (!(start > now())) return reply(400, { error: 'start_in_the_past' });
      const dur = (body.duration_s ?? { fireworks: 38, meteors: 28, drones: 40, halloween: 40 }[body.kind]) * 1000;
      if (body.duration_s != null && !(Number.isInteger(body.duration_s) && body.duration_s >= 20 && body.duration_s <= 600)) return reply(400, { error: 'bad_duration' });
      const e = { id: `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`, kind: body.kind, seed: body.seed ?? 12345, start_at: new Date(start).toISOString(), start_ms: start, duration_ms: dur };
      events.push(e);
      return reply(201, { event: e });
    }
    if (fn === 'event-cancel') {
      const e = events.find((x) => x.id === body.id);
      if (!e) return reply(body.id === 'x' ? 400 : 404, { error: body.id === 'x' ? 'bad_id' : 'unknown_event' });
      e.gone = true;
      return reply(200, { id: e.id, cancelled: true, replayed: false });
    }
    if (fn === 'season-save' || fn === 'season-clear') {
      if (body.season !== 'halloween') return reply(400, { error: 'bad_season' });
      if (!Number.isInteger(body.year)) return reply(400, { error: 'bad_year' });
      const id = `${body.season}|${body.year}`;
      if (fn === 'season-clear') return reply(200, { season: body.season, year: body.year, cleared: true, replayed: !seasons.delete(id) });
      if (!['dates', 'on', 'off'].includes(body.mode)) return reply(400, { error: 'bad_mode' });
      const s = Date.parse(body.starts_at), e = Date.parse(body.ends_at);
      if (body.mode === 'dates' && !(e > s)) return reply(400, { error: Number.isNaN(s) ? 'bad_start' : Number.isNaN(e) ? 'bad_end' : 'bad_range' });
      const row = { season: body.season, year: body.year, mode: body.mode, starts_ms: body.mode === 'dates' ? s : null, ends_ms: body.mode === 'dates' ? e : null };
      seasons.set(id, row);
      return reply(200, { season: row });
    }
    return reply(404, { error: 'unknown_action' });
  };
}
