// trip-save: see docs/trip-api.md. Auth: web session token (x-trip-token); verify_jwt = false (supabase/config.toml).
import { serveFunction } from '../_shared/serve.ts';

Deno.serve(serveFunction('trip-save'));
