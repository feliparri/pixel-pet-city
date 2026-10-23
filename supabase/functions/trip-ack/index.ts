// trip-ack: see docs/trip-api.md. Auth: device HMAC (x-device-id, x-timestamp, x-signature); verify_jwt = false (supabase/config.toml).
import { serveFunction } from '../_shared/serve.ts';

Deno.serve(serveFunction('trip-ack'));
