// The one Edge Function of the web trip: POST /functions/v1/trip/<action>, see docs/trip-api.md.
// Actions: device-register, trip-start, trip-claim, trip-save, trip-recall, trip-status, trip-return, trip-ack, events, event-save, event-cancel.
// Auth is per action (device HMAC, or the web session token), so verify_jwt = false (supabase/config.toml).
import { serveTrip } from './serve.ts';

Deno.serve(serveTrip);
