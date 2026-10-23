// The room session, the same for every transport: join/leave, who is here, positions (at most 10 a second, only on change) and emotes.
// A transport ("wire") only moves JSON; everything that comes in is validated and rate-limited here (protocol.js) before the app sees it.
import { validateMessage, validateLook, sanitizeName, createRateLimiter, newPeerId, MAX_PEERS, EMOTES } from './protocol.js';
import { isValidCode } from './code.js';
import { isConfigured } from './config-check.js';
import { createLocalWire } from './transport-local.js';
import { createSupabaseWire } from './transport-supabase.js';

export const POS_INTERVAL_MS = 100;        // at most 10 position messages a second
export const HEARTBEAT_MS = 2000;          // a hello now and then: late joiners and lost messages heal
export const PEER_TIMEOUT_MS = 7000;       // a peer silent this long (a crashed tab) is gone

// wrapped: the browser's timers throw "illegal invocation" when called as methods of another object
const browserTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h),
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h),
};

/**
 * Events handed to `onEvent`:
 *   { type: 'status', status: 'connecting'|'connected'|'error'|'closed' }
 *   { type: 'join', peer: { id, name, look, x, y, d } }   { type: 'leave', id }
 *   { type: 'pos', id, x, y, d, area }                        { type: 'emote', id, e }
 */
export function createNet({ wire, catalogue, onEvent = () => {}, now = () => Date.now(), timers = browserTimers, id = newPeerId() }) {
  const peers = new Map();                 // id -> { name, look, x, y, d, seen }
  let limiter = createRateLimiter(now);
  let conn = null, code = null, hello = null, heartbeat = null, posTimer = null;
  let lastPos = null, sentPos = null, sentAt = -Infinity, lastEmoteAt = -Infinity;
  let lastHelloReply = -Infinity;
  let opening = false, early = [];           // messages that arrive while the wire is still opening wait for it (the replies need it)

  const send = (msg) => { if (conn) conn.send(msg); };

  function flushPos() {
    posTimer = null;
    if (!lastPos || (sentPos && sentPos.x === lastPos.x && sentPos.y === lastPos.y && sentPos.d === lastPos.d && sentPos.area === lastPos.area)) return;
    sentPos = { ...lastPos };
    sentAt = now();
    send({ t: 'pos', id, ...sentPos });
  }

  function receive(raw) {
    if (!conn) { if (opening && early.length < 64) early.push(raw); return; }
    const m = validateMessage(raw, catalogue);
    if (!m || m.id === id) return;
    if (!limiter.allow(m.id, m.t)) return;
    const t = now();
    if (m.t === 'hello') {
      let p = peers.get(m.id);
      const fresh = !p;
      if (fresh) {
        if (peers.size >= MAX_PEERS) return;
        p = { x: null, y: null, d: 'down', area: 'town' };
        peers.set(m.id, p);
      }
      p.name = m.name; p.look = m.look; p.seen = t;
      if (fresh) {
        onEvent({ type: 'join', peer: { id: m.id, ...p } });
        if (t - lastHelloReply > 500) { lastHelloReply = t; send(hello); }     // tell the newcomer who is here ...
        if (sentPos) send({ t: 'pos', id, ...sentPos });                        // ... and where
      }
      return;
    }
    const p = peers.get(m.id);
    if (!p) {                                                                   // spoke before we heard its hello: ask for it
      if (t - lastHelloReply > 1000) { lastHelloReply = t; send(hello); }
      return;
    }
    p.seen = t;
    if (m.t === 'bye') { dropPeer(m.id); return; }
    if (m.t === 'pos') { p.x = m.x; p.y = m.y; p.d = m.d; p.area = m.area; onEvent({ type: 'pos', id: m.id, x: m.x, y: m.y, d: m.d, area: m.area }); } else if (m.t === 'emote') onEvent({ type: 'emote', id: m.id, e: m.e });
  }

  function dropPeer(pid) {
    if (!peers.delete(pid)) return;
    limiter.forget(pid);
    onEvent({ type: 'leave', id: pid });
  }

  return {
    get id() { return id; },
    get code() { return code; },
    get wireName() { return wire.name; },
    peers: () => Array.from(peers, ([pid, p]) => ({ id: pid, ...p })),

    /** me: { name, look }. Rejects when the code or the look is not valid or the wire cannot connect. */
    async join(roomCode, me) {
      if (conn) throw new Error('already in a room');
      if (!isValidCode(roomCode)) throw new Error('invalid room code');
      const look = validateLook(me && me.look, catalogue);
      if (!look) throw new Error('invalid pet');
      code = roomCode;
      hello = { t: 'hello', id, name: sanitizeName(me.name), look };
      limiter = createRateLimiter(now);
      onEvent({ type: 'status', status: 'connecting' });
      opening = true;
      early = [];
      try {
        conn = await wire.open(code, id, hello, receive, (status) => onEvent({ type: 'status', status }));
      } catch (e) {
        code = null; hello = null; opening = false; early = [];
        onEvent({ type: 'status', status: 'error' });
        throw e;
      }
      opening = false;
      send(hello);
      for (const raw of early.splice(0)) receive(raw);
      heartbeat = timers.setInterval(() => {
        send(hello);
        const t = now();
        for (const [pid, p] of peers) if (t - p.seen > PEER_TIMEOUT_MS) dropPeer(pid);
      }, HEARTBEAT_MS);
    },

    /** The tile this pet is walking to, in `area`. Sent at most every POS_INTERVAL_MS and only when it changed. */
    sendPos(x, y, d, area = 'town') {
      lastPos = { x, y, d, area };
      if (!conn) return;
      const wait = sentAt + POS_INTERVAL_MS - now();
      if (wait <= 0) { if (posTimer) { timers.clearTimeout(posTimer); } flushPos(); } else if (!posTimer) posTimer = timers.setTimeout(flushPos, wait);
    },

    sendEmote(e) {
      if (!conn || !Object.hasOwn(EMOTES, e) || now() - lastEmoteAt < 800) return false;
      lastEmoteAt = now();
      send({ t: 'emote', id, e });
      return true;
    },

    leave() {
      if (!conn) return;
      timers.clearInterval(heartbeat);
      if (posTimer) timers.clearTimeout(posTimer);
      heartbeat = posTimer = null;
      try { send({ t: 'bye', id }); } finally { conn.close(); }
      conn = null; code = null; sentPos = lastPos = null; sentAt = -Infinity;
      for (const pid of Array.from(peers.keys())) dropPeer(pid);
      onEvent({ type: 'status', status: 'closed' });
    },
  };
}

/** The app's entry: mode 'local' (BroadcastChannel) or 'supabase' (needs a usable config). */
export function createTownNet({ mode, config, catalogue, onEvent }) {
  let wire;
  if (mode === 'local') wire = createLocalWire();
  else if (mode === 'supabase' && isConfigured(config)) wire = createSupabaseWire({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey });
  else throw new Error('the online town is not configured');
  return createNet({ wire, catalogue, onEvent });
}
