// The thin Deno wrapper every trip function shares: CORS, body limits, the request/response mapping, the database and the clock.
// The API itself is in handlers.js (testable under Node).
import { handle, BODY_MAX } from './handlers.js';
import { createDb } from './db.ts';

const ORIGIN = 'https://feliparri.github.io';
const TOWN_URL = Deno.env.get('TOWN_URL') ?? 'https://feliparri.github.io/pixel-pet-city/';

const ACTIONS: Record<string, true> = { 'device-register': true, 'trip-start': true, 'trip-claim': true, 'trip-save': true, 'trip-recall': true, 'trip-status': true, 'trip-return': true, 'trip-ack': true, 'events': true, 'event-save': true, 'event-cancel': true };
// The browser's: the town's own calls, and the board's, which the town page relays over the USB cable (docs/usb-link.md). The board's calls are signed, so the origin
// rule only keeps other pages from relaying for it; the board itself (no Origin header) is unaffected.
const WEB_FUNCTIONS = new Set(Object.keys(ACTIONS));

const cors = (fn: string) => WEB_FUNCTIONS.has(fn) ? {
  'access-control-allow-origin': ORIGIN, 'vary': 'origin',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-trip-token, x-device-id, x-timestamp, x-signature, x-admin-key',
  'access-control-max-age': '86400',
} : {};


let db: ReturnType<typeof createDb> | null = null;
const adminAttempts: number[] = [];          // the times of wrong admin keys in this instance (see events.js)

export async function serveTrip(req: Request): Promise<Response> {
  {
    const fn = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
    const known = Object.hasOwn(ACTIONS, fn);
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(fn) };
    if (!known) return new Response(JSON.stringify({ error: 'unknown_action' }), { status: 404, headers });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (WEB_FUNCTIONS.has(fn) && req.headers.get('origin') && req.headers.get('origin') !== ORIGIN) {
      return new Response(JSON.stringify({ error: 'forbidden_origin' }), { status: 403, headers });
    }
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > BODY_MAX) return new Response(JSON.stringify({ error: 'too_large' }), { status: 413, headers });
    const body = new Uint8Array(await req.arrayBuffer());
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 500, headers });
    db ??= createDb(url, key);
    const h: Record<string, string> = {};
    req.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    const out = await handle(fn, { method: req.method, headers: h, body }, {
      db,
      nowS: () => Math.floor(Date.now() / 1000),
      nowMs: () => Date.now(),
      adminKey: Deno.env.get('ADMIN_KEY') || undefined,         // set by the owner in the dashboard (Edge Functions > Secrets); never in the repository
      attempts: adminAttempts,
      randomBytes: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
      uuid: () => crypto.randomUUID(),
      townUrl: TOWN_URL,
      log: (name: string, e: unknown) => console.error(name, e instanceof Error ? e.message : 'error'),
    });
    return new Response(JSON.stringify(out.body), { status: out.status, headers });
  }
}
