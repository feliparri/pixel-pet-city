// The games in a room, from the lobby to the results, for one browser. There is no host: everyone keeps a copy of the shared state, and the
// *referee* (the lowest peer id among the players still here) is the only one that advances the clock, simulates the chicken, decides who was
// found or who caught it, and broadcasts it. When the referee leaves, the next lowest id already holds the last state and carries on.
// Everything that arrives was validated by protocol.js; here the receiver also checks who is allowed to say it: shared state is only
// believed from the current referee, never from another player.
import { GAME_RULES, isPlayable, STATE_MS, LOBBY_MS, ECHO_MS, GONE_GRACE_MS } from './rules.js';
import { openLobby, joinLobby, leaveLobby, volunteerSeeker, chooseZone, electReferee, lobbyReady, buildStart, lobbyKey } from './lobby.js';
import { tickHide, hideResults, hideStars, seekerSees } from './hide.js';
import { createChicken, stepChicken, catcher, spawnTile, catchesToWin, planRoute, encodeRoute, decodeRoute, CHICKEN } from './chicken.js';
import { GAME_PLACES, HIDE_ZONES, DEFAULT_HIDE_ZONE, chickenTile, tileAt } from '../map.js';

const CHICK_SEND_MS = 400;
const NOTICE_MS = 3200;
const STALL_MS = 1500;                                // a gap between two updates this long means this tab was asleep: the clocks wait for it
const LOBBY_GRACE_MS = 4000;                          // a lobby whose start never came is dropped this long after its time
const newRound = (rng) => Array.from({ length: 6 }, () => Math.floor(rng() * 36).toString(36)).join('');

/**
 * Hooks: `id` (this browser's peer id), `send(msg)` (a game message to everybody else), `present()` (a Set of the other peers' ids),
 * `pos(id)` ({ x, y, area } of a peer or of this pet, or null), `name(id)`, `award(n)` (stars for this pet), `now()` and `rng()`.
 */
export function createGames({ id, send, present, pos, name = (i) => i, award = () => {}, now = () => Date.now(), rng = Math.random }) {
  let lobby = null;                 // the lobby that is open, or null
  let game = null;                  // the game in progress: { g, r, roster, seeker, play (am I a player), left: Set of idx, ... }
  let results = null;               // the last game's results, until dismissed
  const seekCount = new Map();      // id -> rounds searched in this room (everyone counts them from the same gstart messages)
  const notices = [];
  const awarded = new Set();
  let chickSentAt = -Infinity;      // the referee: when the chicken's motion was last sent
  let stateAt = -Infinity, echoAt = -Infinity, lastAt = null;
  const absentSince = new Map();    // id -> when it was first missed (cleared when it is back)

  const everyone = () => { const s = new Set(present()); s.add(id); return s; };
  const say = (text, kind = 'info') => { notices.push({ text, kind, until: now() + NOTICE_MS }); if (notices.length > 4) notices.shift(); };
  const tile = (pid) => { const p = pos(pid); return p && p.area === 'town' ? p : null; };
  const aliveIds = () => (game ? game.roster.filter((_, i) => !game.gone.has(i)) : []);
  const referee = () => (game ? electReferee(aliveIds(), everyone()) : lobby ? electReferee(lobby.joined, everyone()) : null);
  const amReferee = () => referee() === id;
  const myIndex = () => (game ? game.roster.indexOf(id) : -1);
  /** Is this player still here? A peer that vanishes (a throttled tab misses its heartbeats) only counts as gone after GONE_GRACE_MS. */
  const here = (pid) => {
    if (pid === id || everyone().has(pid)) { absentSince.delete(pid); return true; }
    if (!absentSince.has(pid)) absentSince.set(pid, now());
    return now() - absentSince.get(pid) < GONE_GRACE_MS;
  };
  const award1 = (key, n) => { if (n > 0 && !awarded.has(key)) { awarded.add(key); award(n); } };

  // ---- starting, joining, leaving (this browser's own actions) ----
  function open(g) {
    if (!isPlayable(g) || lobby || game) return false;
    const msg = { g, r: newRound(rng), left: LOBBY_MS };
    lobby = openLobby({ g, r: msg.r, opener: id, now: now(), leftMs: LOBBY_MS });
    send({ t: 'gopen', ...msg });
    return true;
  }
  function join() {
    if (!lobby || lobby.joined.includes(id) || !joinLobby(lobby, id, now())) return false;
    send({ t: 'gjoin', r: lobby.r });
    return true;
  }
  function volunteer() {
    if (!lobby || lobby.g !== 'hide' || !volunteerSeeker(lobby, id, now())) return false;
    send({ t: 'grole', r: lobby.r, role: 'seek' });
    return true;
  }
  /** The hide and seek zone ('park', 'plaza' or 'town'): a joined player, once; the first choice wins. */
  function pickZone(z) {
    if (!lobby || !chooseZone(lobby, id, z, now())) return false;
    send({ t: 'gzone', r: lobby.r, z });
    return true;
  }
  /** "Salir del juego": leaves the lobby or the game (the game goes on without this pet, which becomes a spectator). */
  function leave() {
    if (lobby && lobby.joined.includes(id)) {
      leaveLobby(lobby, id, now());
      send({ t: 'gleave', r: lobby.r });
      say('Saliste del juego');
      return true;
    }
    if (game && game.play) {
      game.play = false; game.gone.add(myIndex());
      send({ t: 'gleave', r: game.r });
      say('Saliste del juego');
      return true;
    }
    return false;
  }

  // ---- what arrives ----
  function onMessage(m) {
    const from = m.id;
    switch (m.t) {
      case 'gopen': {
        if (game) return;
        const incoming = openLobby({ g: m.g, r: m.r, opener: from, now: now(), leftMs: m.left });
        if (lobby && lobbyKey(lobby) <= lobbyKey(incoming)) return;                    // two lobbies at once: the smaller key wins everywhere
        lobby = incoming;
        say(GAME_RULES[m.g].invite, 'invite');
        return;
      }
      case 'gjoin': if (lobby && lobby.r === m.r) joinLobby(lobby, from, now()); return;
      case 'gzone': if (lobby && lobby.r === m.r) chooseZone(lobby, from, m.z, now()); return;
      case 'grole': if (lobby && lobby.r === m.r) volunteerSeeker(lobby, from, now()); return;
      case 'gleave':
        if (lobby && lobby.r === m.r) leaveLobby(lobby, from, now());
        else if (game && game.r === m.r) { const i = game.roster.indexOf(from); if (i >= 0) game.gone.add(i); }
        return;
      case 'gstart':
        if (lobby && lobby.r === m.r && lobby.g === m.g && from === referee()) begin(m);
        return;
      default: break;
    }
    if (!game || game.r !== m.r) {
      if (m.t === 'gend' && lobby && lobby.r === m.r && from === referee()) { lobby = null; say('Faltaron jugadores. ¡Otra vez!'); }
      return;
    }
    if (from !== referee()) return;                                                    // shared state is only believed from the referee
    if (m.t === 'gstate') {
      if (game.g !== m.g || (game.phase === 'search' && m.ph === 'count')) return;
      game.phase = m.ph; game.phaseEnd = now() + m.left;
      m.f.forEach((v, i) => { if (i < game.f.length) game.f[i] = v; });
    } else if (m.t === 'gfound') {
      applyFound(m.i, m.at);
    } else if (m.t === 'gchick') {
      if (game.g !== 'chicken') return;
      game.chick = { x: m.x, y: m.y, d: m.d, m: m.m, snap: m.s === 1, seq: (game.chick ? game.chick.seq : 0) + 1, v: m.v || 0, o: m.o || 0, route: decodeRoute(m.x, m.y, m.p) };
    } else if (m.t === 'gcatch') {
      applyCatch(m.i, m.n);
    } else if (m.t === 'gend') {
      finish(m.rs, m.f);
    }
  }

  function begin(m) {
    if (m.s >= 0) seekCount.set(m.p[m.s], (seekCount.get(m.p[m.s]) || 0) + 1);
    const t = now(), rules = GAME_RULES[m.g], hide = m.g === 'hide';
    game = {
      g: m.g, r: m.r, roster: m.p.slice(), seeker: m.s, play: m.p.includes(id) && !!lobby && lobby.joined.includes(id), gone: new Set(),
      f: m.p.map(() => (hide ? -1 : 0)), phase: hide ? 'count' : 'play', phaseEnd: t + (hide ? rules.countMs : rules.roundMs),
      zone: hide ? (HIDE_ZONES[m.z] ? m.z : DEFAULT_HIDE_ZONE) : null, chick: null, sim: null, respawnAt: t + 800,
    };
    lobby = null; results = null;
    stateAt = -Infinity; absentSince.clear();
    if (game.play) say(hide ? (m.p[m.s] === id ? 'Tú buscas. ¡Cuenta hasta 15!' : '¡Escóndete!') : '¡Pilla a la gallina!', 'start');
    else say('Hay un juego: puedes mirar', 'info');
  }

  function applyFound(i, at) {
    if (i < 0 || i >= game.roster.length || i === game.seeker) return;
    if (game.f[i] === -1) game.f[i] = at;
    if (game.roster[i] === id && !game.saidFound) { game.saidFound = true; say('¡Te encontré!', 'found'); }
    else if (game.roster[i] !== id) say(`¡${name(game.roster[i])} apareció!`, 'found');
  }

  function applyCatch(i, n) {
    if (i < 0 || i >= game.roster.length) return;
    game.f[i] = Math.max(game.f[i], n);
    game.chick = null;
    say(`¡${name(game.roster[i])} atrapó a la gallina!`, 'catch');
    if (game.roster[i] === id) award1(`${game.r}:c${n}`, GAME_RULES.chicken.starsPerCatch);
  }

  /** The end of a game: stars for this pet, the results panel. */
  function finish(reason, f) {
    const g = game;
    if (!g) return;
    const mine = g.roster.indexOf(id);
    let rows, stars = 0;
    if (g.g === 'hide') {
      rows = hideResults(g.seeker, f, reason);
      if (mine >= 0 && g.play) { stars = hideStars(mine, g.seeker, f, reason); award1(`${g.r}:end`, stars); }
    } else {
      rows = f.map((n, i) => ({ i, role: 'player', found: n, stars: n * GAME_RULES.chicken.starsPerCatch }));
      stars = mine >= 0 ? f[mine] * GAME_RULES.chicken.starsPerCatch : 0;
    }
    results = { g: g.g, reason, roster: g.roster.slice(), names: g.roster.map((p) => name(p)), rows, mine, stars: g.play ? stars : 0, play: g.play, until: now() + 15000 };
    game = null;
  }

  // ---- the clock: every frame ----
  function update() {
    const t = now();
    const gap = lastAt === null ? 0 : t - lastAt;
    lastAt = t;
    if (game && gap > STALL_MS) {                                  // this tab was asleep (rAF stops in a hidden tab): the game waits for it, it does not run out meanwhile
      game.phaseEnd += gap; game.respawnAt += gap; absentSince.clear();
    }
    while (notices.length && notices[0].until < t) notices.shift();
    if (results && t > results.until) results = null;
    if (lobby) {
      if (lobby.joined.includes(id) && t - echoAt >= ECHO_MS) {                       // say it again now and then: a message a peer dropped heals
        echoAt = t;
        send({ t: 'gjoin', r: lobby.r });
        if (lobby.seekers.includes(id)) send({ t: 'grole', r: lobby.r, role: 'seek' });
        if (lobby.zoneBy === id) send({ t: 'gzone', r: lobby.r, z: lobby.zone });
      }
      const ref = referee();
      if (ref === id && lobbyReady(lobby, t, everyone())) {
        const start = buildStart(lobby, everyone(), seekCount);
        if (!start) { send({ t: 'gend', g: lobby.g, r: lobby.r, rs: 'few', f: [] }); lobby = null; say('Faltaron jugadores. ¡Otra vez!'); }
        else { send({ t: 'gstart', ...start }); begin({ t: 'gstart', id, ...start }); }
      } else if (ref !== id && t > lobby.deadline + LOBBY_GRACE_MS) lobby = null;
      else if (ref === null) lobby = null;
      return;
    }
    if (!game) return;
    for (const [i, p] of game.roster.entries()) if (i !== myIndex() && !game.gone.has(i) && !here(p)) game.gone.add(i);   // a peer that dropped
    if (!amReferee()) {
      game.sim = null;
      if (referee() === null) game = null;                     // nobody is left to run it
      return;
    }
    if (game.g === 'hide') refereeHide(t); else refereeChicken(t);
  }

  const stateMsg = (extra = {}) => ({ t: 'gstate', g: game.g, r: game.r, ph: game.phase, left: Math.max(0, Math.min(120000, Math.round(game.phaseEnd - now()))), f: game.f.slice(), ...extra });
  const broadcastState = (t) => { if (t - stateAt >= STATE_MS) { stateAt = t; send(stateMsg()); } };
  const petPos = (pid) => { const p = tile(pid); return p && (game.g === 'chicken' || HIDE_ZONES[game.zone].has(p.x, p.y)) ? p : null; };

  function refereeHide(t) {
    const s = { roster: game.roster, seeker: game.seeker, phase: game.phase, phaseEnd: game.phaseEnd, found: game.f };
    const events = tickHide(s, t, petPos, (pid) => !game.gone.has(game.roster.indexOf(pid)) && here(pid));
    game.phase = s.phase; game.phaseEnd = s.phaseEnd;
    let end = null;
    for (const e of events) {
      if (e.type === 'found') { send({ t: 'gfound', r: game.r, i: e.i, at: e.at }); applyFound(e.i, e.at); }
      else if (e.type === 'search') { stateAt = -Infinity; say('¡A buscar!', 'start'); }
      else if (e.type === 'end') end = e.reason;
    }
    if (end) { const f = game.f.slice(); send({ t: 'gend', g: 'hide', r: game.r, rs: end, f }); finish(end, f); return; }
    broadcastState(t);
  }

  const chickenTiles = () => {
    const z = GAME_PLACES.chicken.zone, out = [];
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) if (chickenTile(x, y) && tileAt(x, y) !== 'p') out.push([x, y]);
    return out;
  };
  const chickenWalkable = chickenTile;               // the chicken runs across the whole town; only its first spot is at the gallinero

  function refereeChicken(t) {
    const pets = game.roster.filter((_, i) => !game.gone.has(i)).map((pid) => ({ id: pid, ...petPos(pid) })).filter((p) => p.x !== undefined);
    if (!game.sim && game.chick) game.sim = { ...createChicken(game.chick.x, game.chick.y, t), mode: 'wander' };    // took over as referee: carry on from the last chicken seen
    if (!game.sim && t >= game.respawnAt) {
      const [x, y] = spawnTile(chickenTiles(), pets, rng);
      game.sim = createChicken(x, y, t);
      game.chick = { x, y, d: 'left', m: 'w', snap: true, seq: (game.chick ? game.chick.seq : 0) + 1, v: 0, o: 0, route: [[x, y]] };
      chickSentAt = t;
      send({ t: 'gchick', r: game.r, x, y, d: 'left', m: 'w', s: 1 });
    }
    const ch = game.sim;
    if (ch) {
      const moved = stepChicken(ch, pets, t, rng, chickenWalkable);
      if (moved) game.chickAt = t;                                  // when it arrived at its tile
      const flee = ch.mode === 'flee', m = flee ? 'f' : 'w';
      // wandering: one message per step; fleeing: a motion (the route ahead) every CHICK_SEND_MS, so the others glide instead of stop and go
      if ((!!game.chick && game.chick.m !== m) || (flee ? t - chickSentAt >= CHICK_SEND_MS : moved)) {
        const route = flee ? planRoute(ch, pets, chickenWalkable) : [];
        const p = encodeRoute(ch.x, ch.y, route), o = Math.max(0, Math.min(2000, Math.round(t - (game.chickAt || t))));
        chickSentAt = t;
        game.chick = { x: ch.x, y: ch.y, d: ch.d, m, snap: false, seq: (game.chick ? game.chick.seq : 0) + 1, v: flee ? CHICKEN.fleeMs : 0, o, route: decodeRoute(ch.x, ch.y, p) };
        send({ t: 'gchick', r: game.r, x: ch.x, y: ch.y, d: ch.d, m, s: 0, ...(flee ? { v: CHICKEN.fleeMs, p, o } : {}) });
      }
      const who = catcher(ch, pets);
      if (who) {
        const i = game.roster.indexOf(who), n = game.f[i] + 1;
        send({ t: 'gcatch', r: game.r, i, n });
        applyCatch(i, n);                                           // records the score and the notice, like everyone else
        game.sim = null; game.respawnAt = t + GAME_RULES.chicken.respawnMs;
        if (n >= catchesToWin) { const f = game.f.slice(); send({ t: 'gend', g: 'chicken', r: game.r, rs: 'goal', f }); finish('goal', f); return; }
      }
    }
    if (t >= game.phaseEnd) { const f = game.f.slice(); send({ t: 'gend', g: 'chicken', r: game.r, rs: 'time', f }); finish('time', f); return; }
    broadcastState(t);
  }

  // ---- what the screen needs ----
  function view() {
    const t = now();
    const out = { lobby: null, game: null, results, notices: notices.slice() };
    if (lobby) {
      const rules = GAME_RULES[lobby.g];
      out.lobby = { g: lobby.g, name: rules.name, invite: rules.invite, left: Math.max(0, lobby.deadline - t), joined: lobby.joined.length, iJoined: lobby.joined.includes(id), iVolunteered: lobby.seekers.includes(id), canVolunteer: lobby.g === 'hide' && lobby.joined.includes(id), seekers: lobby.seekers.length,
        zone: lobby.g === 'hide' ? lobby.zone : null, zoneName: lobby.g === 'hide' ? HIDE_ZONES[lobby.zone].name : null, canPickZone: lobby.g === 'hide' && lobby.joined.includes(id) && !lobby.zoneSet, zoneLocked: lobby.zoneSet };
    }
    if (game) {
      const mine = myIndex(), rules = GAME_RULES[game.g];
      const role = !game.play ? 'spectator' : game.g === 'chicken' ? 'player' : mine === game.seeker ? 'seeker' : game.f[mine] >= 0 ? 'found' : 'hider';
      out.game = {
        g: game.g, name: rules.name, phase: game.phase, left: Math.max(0, game.phaseEnd - t), role, play: game.play, seekerId: game.seeker >= 0 ? game.roster[game.seeker] : null,
        hidersLeft: game.g === 'hide' ? game.f.filter((v, i) => i !== game.seeker && v === -1).length : 0, scores: game.g === 'chicken' ? game.roster.map((p, i) => ({ id: p, name: name(p), n: game.f[i] })) : null,
        zone: game.zone, zoneName: game.zone ? HIDE_ZONES[game.zone].name : null, chick: game.chick, referee: referee() === id,
      };
    }
    return out;
  }

  /**
   * What this pet may do now: `frozen` (the seeker during the countdown), `zone` (the hide zone it cannot leave: an entry of HIDE_ZONES, or
   * null when there is no wall: the chicken and "Todo el pueblo" run across the whole town) and `closed` (the doors are shut while it plays).
   */
  function movement() {
    if (!game || !game.play) return { frozen: false, zone: null, closed: false };
    const frozen = game.g === 'hide' && game.phase === 'count' && game.roster[game.seeker] === id;
    return { frozen, zone: game.g === 'hide' && game.zone !== 'town' ? HIDE_ZONES[game.zone] : null, closed: true };
  }

  /** For the seeker's screen: null, or `{ full, see(pet tile, inBush) }`. `full` = the countdown (everything dark). */
  function seekerVision() {
    if (!game || !game.play || game.g !== 'hide' || game.roster[game.seeker] !== id) return null;
    const me = pos(id);
    return { full: game.phase === 'count', see: (p, inBush) => !!me && seekerSees(me, p, inBush) };
  }

  /**
   * Is this pet (and its name) drawn on this screen? A player of a running game sees only the players who joined it, so a pet that did not
   * join is hidden, and so is one that left the game; a spectator (who never joined) keeps seeing everybody. A found hider is still a player.
   */
  function canSee(pid) {
    if (!game || !game.play || pid === id) return true;
    const i = game.roster.indexOf(pid);
    return i >= 0 && !game.gone.has(i);
  }

  const dismiss = () => { results = null; };
  /** A short hint on the screen (for example the soft wall). */
  const notify = (text, kind = 'info') => { if (!notices.some((n) => n.text === text)) say(text, kind); };
  return { open, join, volunteer, pickZone, leave, onMessage, update, view, movement, seekerVision, canSee, dismiss, notify, referee, get id() { return id; } };
}
