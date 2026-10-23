// device-register: see docs/trip-api.md. Auth: no auth (first use of a board); verify_jwt = false (supabase/config.toml).
import { serveFunction } from '../_shared/serve.ts';

Deno.serve(serveFunction('device-register'));
