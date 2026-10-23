// trip-claim: see docs/trip-api.md. Auth: the claim code in the body, or the session token (x-trip-token) to resume; verify_jwt = false (supabase/config.toml).
import { serveFunction } from '../_shared/serve.ts';

Deno.serve(serveFunction('trip-claim'));
