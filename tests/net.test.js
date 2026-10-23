import test from 'node:test';
import assert from 'node:assert/strict';
import { createNet, createTownNet, POS_INTERVAL_MS, PEER_TIMEOUT_MS } from '../src/net.js';
import { createLocalWire } from '../src/transport-local.js';
import { createSupabaseWire } from '../src/transport-supabase.js';
import { checkConfig } from '../src/config-check.js';
import { MAX_PEERS } from '../src/protocol.js';

const CAT = { tophat: { slot: 'head' } };
const look = { species: 'frog', stage: 1, items: ['tophat', '', '', ''] };
const CODE = 'FOCA-LUNA-42';
const tick = () => new Promise((r) => setTimeout(r, 25));

function fakeTimers() {
  const t = { intervals: [], timeouts: [] };
  t.setInterval = (fn) => { t.intervals.push(fn); return t.intervals.length; };
  t.clearInterval = () => {};
  t.setTimeout = (fn, ms) => { t.timeouts.push({ fn, ms }); return t.timeouts.length; };
  t.clearTimeout = () => {};
  return t;
}

/** An in-memory wire hub: every sent message goes to every other wire of the same code, synchronously. */
function hub() {
  const rooms = new Map();
  return () => ({
    name: 'fake',
    async open(code, _id, _hello, onRaw) {
      const set = rooms.get(code) || new Set();
      rooms.set(code, set);
      const me = { onRaw };
      set.add(me);
      return { send: (msg) => { for (const o of set) if (o !== me) o.onRaw(JSON.parse(JSON.stringify(msg))); }, close: () => set.delete(me) };
    },
  });
}

function pair() {
  let clock = 1000;
  const mk = hub();
  const wires = new Map();
  const make = (name) => {
    const events = [];
    const timers = fakeTimers();
    const net = createNet({ wire: mk(), catalogue: CAT, onEvent: (e) => events.push(e), now: () => clock, timers });
    return { net, events, timers, name };
  };
  return { a: make('a'), b: make('b'), advance: (ms) => { clock += ms; }, wires };
}

test('two players see each other join, move, emote and leave', async () => {
  const { a, b, advance } = pair();
  await a.net.join(CODE, { name: 'Ana', look });
  a.net.sendPos(12, 17, 'down');
  await b.net.join(CODE, { name: 'Beto<>', look: { ...look, species: 'cat' } });
  const join = a.events.find((e) => e.type === 'join');
  assert.equal(join.peer.name, 'Beto');
  assert.equal(join.peer.look.species, 'cat');
  const joinB = b.events.find((e) => e.type === 'join');          // a answered b's hello with its hello and its position
  assert.equal(joinB.peer.name, 'Ana');
  assert.ok(b.events.some((e) => e.type === 'pos' && e.x === 12 && e.y === 17));
  advance(500);
  b.net.sendPos(13, 17, 'right');
  assert.ok(a.events.some((e) => e.type === 'pos' && e.x === 13 && e.d === 'right'));
  assert.equal(b.net.sendEmote('hola'), true);
  assert.ok(a.events.some((e) => e.type === 'emote' && e.e === 'hola'));
  b.net.leave();
  assert.ok(a.events.some((e) => e.type === 'leave'));
  assert.equal(a.net.peers().length, 0);
  a.net.leave();
});

test('rooms are isolated by code', async () => {
  const { a, b } = pair();
  await a.net.join(CODE, { name: 'Ana', look });
  await b.net.join('FOCA-LUNA-43', { name: 'Beto', look });
  assert.equal(a.events.filter((e) => e.type === 'join').length, 0);
});

test('positions: at most one per 100 ms, the latest wins, nothing when unchanged', async () => {
  const { a, b, advance } = pair();
  await a.net.join(CODE, { name: 'Ana', look });
  await b.net.join(CODE, { name: 'Beto', look });
  const count = () => b.events.filter((e) => e.type === 'pos').length;
  a.net.sendPos(12, 17, 'down');                  // first one goes out
  assert.equal(count(), 1);
  a.net.sendPos(13, 17, 'right');                 // too soon: waits for the timer
  a.net.sendPos(14, 17, 'right');
  assert.equal(count(), 1);
  assert.equal(a.timers.timeouts.length, 1);
  assert.ok(a.timers.timeouts[0].ms <= POS_INTERVAL_MS);
  advance(POS_INTERVAL_MS);
  a.timers.timeouts[0].fn();
  assert.equal(count(), 2);
  assert.equal(b.events.filter((e) => e.type === 'pos').at(-1).x, 14);
  advance(500);
  a.net.sendPos(14, 17, 'right');                 // unchanged: not sent
  assert.equal(count(), 2);
  a.net.leave(); b.net.leave();
});

test('emotes are rate limited locally and must be presets', async () => {
  const { a, b, advance } = pair();
  await a.net.join(CODE, { name: 'Ana', look });
  await b.net.join(CODE, { name: 'Beto', look });
  assert.equal(a.net.sendEmote('free text'), false);
  assert.equal(a.net.sendEmote('wave'), true);
  assert.equal(a.net.sendEmote('heart'), false);
  advance(900);
  assert.equal(a.net.sendEmote('heart'), true);
  a.net.leave(); b.net.leave();
});

test('hostile input is dropped: bad ids, unknown peers, bad positions, floods', async () => {
  const mk = hub();
  const injector = mk();
  let clock = 0;
  const events = [];
  const net = createNet({ wire: mk(), catalogue: CAT, onEvent: (e) => events.push(e), now: () => clock, timers: fakeTimers() });
  await net.join(CODE, { name: 'Ana', look });
  const hostile = await injector.open(CODE, 'x', {}, () => {});
  hostile.send({ t: 'pos', id: 'zzzzzz1', x: 12, y: 17, d: 'up' });          // never said hello
  hostile.send({ t: 'hello', id: 'zzzzzz1', name: '<img src=x>', look: { species: 'dragon', stage: 0 } });
  hostile.send({ t: 'hello', id: 'zzzzzz1', name: '<img src=x>', look });
  assert.equal(events.filter((e) => e.type === 'join').length, 1);
  assert.equal(net.peers()[0].name, 'img srcx');
  hostile.send({ t: 'pos', id: 'zzzzzz1', x: 0, y: 0, d: 'up' });            // inside a tree
  hostile.send({ t: 'emote', id: 'zzzzzz1', e: 'say anything' });
  assert.equal(events.filter((e) => e.type === 'pos' || e.type === 'emote').length, 0);
  for (let i = 0; i < 100; i++) hostile.send({ t: 'pos', id: 'zzzzzz1', x: 12 + (i % 2), y: 17, d: 'left' });
  const flood = events.filter((e) => e.type === 'pos').length;
  assert.ok(flood > 0 && flood <= 12, String(flood));
  net.leave();
});

test('a room holds at most MAX_PEERS others', async () => {
  const mk = hub();
  const events = [];
  const net = createNet({ wire: mk(), catalogue: CAT, onEvent: (e) => events.push(e), now: () => 0, timers: fakeTimers() });
  await net.join(CODE, { name: 'Ana', look });
  const w = await mk().open(CODE, 'x', {}, () => {});
  for (let i = 0; i < MAX_PEERS + 5; i++) w.send({ t: 'hello', id: `peer${String(i).padStart(3, '0')}`, name: 'p', look });
  assert.equal(net.peers().length, MAX_PEERS);
  net.leave();
});

test('a silent peer times out at the heartbeat', async () => {
  const mk = hub();
  let clock = 0;
  const timers = fakeTimers();
  const events = [];
  const net = createNet({ wire: mk(), catalogue: CAT, onEvent: (e) => events.push(e), now: () => clock, timers });
  await net.join(CODE, { name: 'Ana', look });
  const w = await mk().open(CODE, 'x', {}, () => {});
  w.send({ t: 'hello', id: 'quiet001', name: 'Q', look });
  clock += PEER_TIMEOUT_MS - 1;
  timers.intervals[0]();
  assert.equal(net.peers().length, 1);
  clock += 2;
  timers.intervals[0]();
  assert.equal(net.peers().length, 0);
  assert.ok(events.some((e) => e.type === 'leave'));
  net.leave();
});

test('join refuses bad codes and bad pets; the second join is refused', async () => {
  const net = createNet({ wire: hub()(), catalogue: CAT, timers: fakeTimers() });
  await assert.rejects(net.join('nope', { name: 'A', look }));
  await assert.rejects(net.join(CODE, { name: 'A', look: { species: 'dog', stage: 0 } }));
  await net.join(CODE, { name: 'A', look });
  await assert.rejects(net.join(CODE, { name: 'A', look }));
  net.leave();
  net.leave();                                     // leaving twice is harmless
});

test('local transport: two nets over BroadcastChannel', async () => {
  const mk = (name) => {
    const events = [];
    const net = createNet({ wire: createLocalWire(), catalogue: CAT, onEvent: (e) => events.push(e), timers: fakeTimers() });
    return { net, events, name };
  };
  const a = mk('a'), b = mk('b');
  await a.net.join(CODE, { name: 'Ana', look });
  a.net.sendPos(12, 17, 'down');
  await b.net.join(CODE, { name: 'Beto', look });
  await tick();
  assert.ok(a.events.some((e) => e.type === 'join' && e.peer.name === 'Beto'));
  assert.ok(b.events.some((e) => e.type === 'pos' && e.x === 12));
  b.net.leave();
  await tick();
  assert.ok(a.events.some((e) => e.type === 'leave'));
  a.net.leave();
});

test('local transport without BroadcastChannel reports an error', async () => {
  const events = [];
  const net = createNet({ wire: createLocalWire({ BroadcastChannelImpl: null }), catalogue: CAT, onEvent: (e) => events.push(e), timers: fakeTimers() });
  await assert.rejects(net.join(CODE, { name: 'A', look }));
  assert.ok(events.some((e) => e.type === 'status' && e.status === 'error'));
});

/** A fake supabase-js: channels of the same name share a hub, presence and broadcast as the real client shapes them. */
function fakeSupabase() {
  const rooms = new Map();
  const createClient = (url, key, opts) => ({
    url, key, opts,
    channel(name, cfg) {
      const room = rooms.get(name) || { members: new Set() };
      rooms.set(name, room);
      const handlers = [];
      const me = { handlers, key: cfg.config.presence.key, state: null };
      const ch = {
        name, cfg, tracked: null,
        on(type, filter, fn) { handlers.push({ type, filter, fn }); return ch; },
        subscribe(cb) { room.members.add(me); queueMicrotask(async () => { await cb('SUBSCRIBED'); }); return ch; },
        async track(payload) {
          me.state = { ...payload, presence_ref: 'r' + me.key };
          ch.tracked = payload;
          for (const o of room.members) if (o !== me) for (const h of o.handlers) if (h.type === 'presence' && h.filter.event === 'join') h.fn({ key: me.key, newPresences: [me.state] });
          for (const o of room.members) if (o !== me && o.state) for (const h of handlers) if (h.type === 'presence' && h.filter.event === 'join') h.fn({ key: o.key, newPresences: [o.state] });
        },
        untrack() { for (const o of room.members) if (o !== me) for (const h of o.handlers) if (h.type === 'presence' && h.filter.event === 'leave') h.fn({ key: me.key, leftPresences: [me.state] }); },
        send(msg) { for (const o of room.members) if (o !== me) for (const h of o.handlers) if (h.type === 'broadcast' && h.filter.event === msg.event) h.fn({ payload: msg.payload }); },
      };
      return ch;
    },
    removeChannel(ch) { for (const room of rooms.values()) for (const m of room.members) if (m.handlers.some(() => true) && m.key === ch.cfg.config.presence.key) room.members.delete(m); },
  });
  return createClient;
}

test('supabase transport: presence and broadcast, with the channel and the anon key', async () => {
  const createClient = fakeSupabase();
  const mk = () => {
    const events = [];
    const wire = createSupabaseWire({ url: 'https://abcd1234.supabase.co', anonKey: 'anon-key-anon-key-anon-key', createClient });
    return { events, net: createNet({ wire, catalogue: CAT, onEvent: (e) => events.push(e), timers: fakeTimers() }) };
  };
  const a = mk(), b = mk();
  await a.net.join(CODE, { name: 'Ana', look });
  a.net.sendPos(12, 17, 'down');
  await b.net.join(CODE, { name: 'Beto', look });
  assert.ok(a.events.some((e) => e.type === 'join' && e.peer.name === 'Beto'));
  assert.ok(b.events.some((e) => e.type === 'join' && e.peer.name === 'Ana'));
  assert.ok(b.events.some((e) => e.type === 'pos' && e.x === 12));
  b.net.sendEmote('party');
  assert.ok(a.events.some((e) => e.type === 'emote' && e.e === 'party'));
  b.net.leave();
  assert.ok(a.events.some((e) => e.type === 'leave'));
  a.net.leave();
});

test('supabase wire uses the room channel name and a presence key that is the peer id', async () => {
  const seen = {};
  const createClient = (url, key, opts) => ({
    channel(name, cfg) { seen.name = name; seen.cfg = cfg; seen.key = key; seen.opts = opts; const ch = { on: () => ch, subscribe: (cb) => { queueMicrotask(() => cb('SUBSCRIBED')); return ch; }, track: async () => {}, send() {}, untrack() {} }; return ch; },
    removeChannel() {},
  });
  const net = createNet({ wire: createSupabaseWire({ url: 'https://abcd1234.supabase.co', anonKey: 'k'.repeat(30), createClient }), catalogue: CAT, timers: fakeTimers() });
  await net.join(CODE, { name: 'A', look });
  assert.equal(seen.name, `room:${CODE}`);
  assert.equal(seen.cfg.config.presence.key, net.id);
  assert.equal(seen.cfg.config.broadcast.self, false);
  assert.equal(seen.opts.auth.persistSession, false);
  net.leave();
});

test('supabase channel errors reject the join', async () => {
  const createClient = () => ({ channel() { const ch = { on: () => ch, subscribe: (cb) => { queueMicrotask(() => cb('CHANNEL_ERROR')); return ch; } }; return ch; }, removeChannel() {} });
  const events = [];
  const net = createNet({ wire: createSupabaseWire({ url: 'https://abcd1234.supabase.co', anonKey: 'k'.repeat(30), createClient }), catalogue: CAT, onEvent: (e) => events.push(e), timers: fakeTimers() });
  await assert.rejects(net.join(CODE, { name: 'A', look }));
  assert.ok(events.some((e) => e.status === 'error'));
});

test('a peer cannot make another one leave through its own presence payload', async () => {
  const createClient = (url, key) => {
    const handlers = [];
    return { channel() { const ch = { on: (t, f, fn) => { handlers.push({ t, f, fn }); return ch; }, subscribe: (cb) => { queueMicrotask(() => cb('SUBSCRIBED')); return ch; }, track: async () => {}, send() {}, untrack() {} }; ch.handlers = handlers; createClient.last = ch; return ch; }, removeChannel() {} };
  };
  const events = [];
  const net = createNet({ wire: createSupabaseWire({ url: 'https://abcd1234.supabase.co', anonKey: 'k'.repeat(30), createClient }), catalogue: CAT, onEvent: (e) => events.push(e), timers: fakeTimers() });
  await net.join(CODE, { name: 'A', look });
  const h = (ev) => createClient.last.handlers.find((x) => x.t === 'presence' && x.f.event === ev).fn;
  h('join')({ key: 'victim01', newPresences: [{ id: 'other002', name: 'V', look }] });
  assert.deepEqual(net.peers().map((p) => p.id), ['victim01']);       // the key, not the payload's id
  h('leave')({ key: 'attack03', leftPresences: [{ id: 'victim01' }] });
  assert.equal(net.peers().length, 1);
  net.leave();
});

test('createTownNet: local always; supabase only with a usable config', () => {
  assert.ok(createTownNet({ mode: 'local', config: {}, catalogue: CAT }).join);
  assert.throws(() => createTownNet({ mode: 'supabase', config: { supabaseUrl: 'https://YOUR-PROJECT.supabase.co', supabaseAnonKey: 'YOUR-ANON-KEY' }, catalogue: CAT }));
  assert.ok(createTownNet({ mode: 'supabase', config: { supabaseUrl: 'https://abcd1234.supabase.co', supabaseAnonKey: 'k'.repeat(30) }, catalogue: CAT }));
});

test('checkConfig: placeholders, urls and service_role keys', () => {
  const jwt = (role) => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;
  const url = 'https://abcd1234.supabase.co';
  assert.equal(checkConfig({ supabaseUrl: 'https://YOUR-PROJECT.supabase.co', supabaseAnonKey: 'YOUR-ANON-KEY' }), 'placeholder');
  assert.equal(checkConfig(null), 'placeholder');
  assert.equal(checkConfig({ supabaseUrl: 'http://abcd1234.supabase.co', supabaseAnonKey: jwt('anon') + 'x'.repeat(20) }), 'bad-url');
  assert.equal(checkConfig({ supabaseUrl: 'https://evil.example.com', supabaseAnonKey: jwt('anon') + 'x'.repeat(20) }), 'bad-url');
  assert.equal(checkConfig({ supabaseUrl: url, supabaseAnonKey: jwt('service_role') + 'x'.repeat(20) }), 'service-role');
  assert.equal(checkConfig({ supabaseUrl: url, supabaseAnonKey: 'short' }), 'bad-key');
  assert.equal(checkConfig({ supabaseUrl: url, supabaseAnonKey: jwt('anon') + 'x'.repeat(20) }), 'ok');
});
