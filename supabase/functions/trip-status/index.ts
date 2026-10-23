// trip-status: see docs/trip-api.md. Auth: web session token (x-trip-token); trip-status also takes a device HMAC; verify_jwt = false (supabase/config.toml).
import { serveFunction } from '../_shared/serve.ts';

Deno.serve(serveFunction('trip-status'));
