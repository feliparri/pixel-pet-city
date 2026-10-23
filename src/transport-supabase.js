// The "supabase" transport: Realtime Broadcast (moves, emotes) + Presence (who is here), one channel per room: `room:<code>`.
// No tables, no auth, only the public anon key. supabase-js v2 is loaded from a pinned CDN version, and only when this wire is used.
import { channelName } from './code.js';

export const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const loadClient = async () => (await import(/* @vite-ignore */ SUPABASE_JS_URL)).createClient;

/** `createClient` is replaceable for tests. */
export function createSupabaseWire({ url, anonKey, createClient }) {
  return {
    name: 'supabase',
    async open(code, selfId, hello, onRaw, onStatus) {
      const make = createClient || (await loadClient());
      const client = make(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } },
      });
      const ch = client.channel(channelName(code), { config: { broadcast: { self: false }, presence: { key: selfId } } });
      ch.on('broadcast', { event: 'm' }, (msg) => onRaw(msg && msg.payload));
      // the presence KEY is the server's word for who joined or left; the payload's own id is not trusted
      ch.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        for (const p of newPresences || []) onRaw({ ...p, t: 'hello', id: key });
      });
      ch.on('presence', { event: 'leave' }, ({ key }) => onRaw({ t: 'bye', id: key }));
      await new Promise((resolve, reject) => {
        ch.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            try { await ch.track(hello); } catch { /* the broadcast hello still announces us */ }
            onStatus('connected');
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            onStatus('error', status);
            reject(new Error(status));
          } else if (status === 'CLOSED') {
            onStatus('closed');
          }
        });
      });
      return {
        send: (msg) => { ch.send({ type: 'broadcast', event: 'm', payload: msg }); },
        close: () => { try { ch.untrack(); } catch { /* gone */ } client.removeChannel(ch); },
      };
    },
  };
}
