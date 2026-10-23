// The thin Deno wrapper every trip function shares: CORS, body limits, the request/response mapping, the database and the clock.
// The API itself is in handlers.js (testable under Node).
import { handle, BODY_MAX } from './handlers.js';
import { createDb } from './db.ts';

const ORIGIN = 'https://feliparri.github.io';
const TOWN_URL = Deno.env.get('TOWN_URL') ?? 'https://feliparri.github.io/pixel-pet-city/';
const WEB_FUNCTIONS = new Set(['trip-claim', 'trip-save', 'trip-status']);   // the browser's; the board's endpoints send no CORS headers

const cors = (fn: string) => WEB_FUNCTIONS.has(fn) ? {
  'access-control-allow-origin': ORIGIN, 'vary': 'origin',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-trip-token, x-device-id, x-timestamp, x-signature',
  'access-control-max-age': '86400',
} : {};

let db: ReturnType<typeof createDb> | null = null;

export function serveFunction(fn: string) {
  return async (req: Request): Promise<Response> => {
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(fn) };
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
      randomBytes: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
      uuid: () => crypto.randomUUID(),
      townUrl: TOWN_URL,
      log: (name: string, e: unknown) => console.error(name, e instanceof Error ? e.message : 'error'),
    });
    return new Response(JSON.stringify(out.body), { status: out.status, headers });
  };
}
