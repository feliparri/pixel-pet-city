// Development only (admin.html?mock=1): a stand-in for the trip function that lives in the page, so the admin page can be tried and
// photographed without a server or a key. The key it accepts is "prueba". Never loaded without ?mock=1.
export function createMockFetch(now = () => Date.now()) {
  const events = [];
  let n = 0;
  const reply = (status, body) => ({ status, json: async () => body });
  return async (url, init) => {
    const fn = String(url).split('/').pop();
    const body = JSON.parse(init.body || '{}'), key = init.headers['x-admin-key'];
    if (fn === 'events') {
      const days = body.ahead_days || 7;
      return reply(200, { now: now(), events: events.filter((e) => !e.gone && e.start_ms < now() + days * 86400000).sort((a, b) => a.start_ms - b.start_ms) });
    }
    if (key !== 'prueba') return reply(401, { error: 'bad_admin_key' });
    if (fn === 'event-save') {
      const start = Date.parse(body.start_at);
      if (!(start > now())) return reply(400, { error: 'start_in_the_past' });
      const dur = { fireworks: 38000, meteors: 28000, drones: 40000, halloween: 40000 }[body.kind];
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
    return reply(404, { error: 'unknown_action' });
  };
}
