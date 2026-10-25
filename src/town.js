// The running town: the local pet, the other pets, input (taps, arrows/WASD), the net session and the draw loop.
import { findPath, dirVector } from './path.js';
import { isWalkable, doorAt, spotAt, tileAt, TILES, GAME_PLACES, SPAWNS } from './map.js';
import { Walker } from './walker.js';
import { createRenderer, EMOTE_MS } from './render.js';
import { ambientAt, hourNow } from './daynight.js';
import { entranceState } from './entrance.js';
import { createGames } from './games/manager.js';
import { GAME_RULES } from './games/rules.js';
import { stumbled, paceAt, RACE } from './games/race.js';
import { activityOf, radarPets } from './radar.js';
import { createLife, stepLife, lifeFrame } from './life.js';

const FADE_MS = 240;                                  // the fade-in after a door
const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };

function spawnFor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPAWNS[h % SPAWNS.length];
}

/** me: { name, look }; net: a createNet() session already joined; entrance: an entrance id to play on arrival (a visiting pet), or null;
 * stars: the pet's star counter ({ add(n) }); onHud(info): called a few times a second with what the game buttons and panels need.
 * Returns { onNetEvent, emote, playExit, games: { play, join, seek, leave, dismiss }, destroy }. */
export function startTown({ canvas, stage, sprites, font, net, me, entrance = null, stars = { add() {} }, onHud = () => {} }) {
  const [sx, sy] = spawnFor(net.id);
  const self = { id: net.id, name: me.name, look: me.look, stats: me.stats || null, act: 'idle', walker: new Walker(sx, sy), emote: null, area: 'town' };
  if (entrance) self.fx = { id: entrance, phase: 'arrive', t0: performance.now(), resolve: null };
  const others = new Map();
  const state = { me: self, others: [], marker: null, area: 'town', amb: ambientAt(hourNow(location.search)), fade: 0 };
  const life = createLife(net.code || net.id);                       // the same scene for a room, from its code; nothing of it goes over the net
  const renderer = createRenderer({ canvas, sprites, font });
  let fadeT0 = -Infinity, ambAt = -Infinity;
  const held = [];                                   // direction keys held, the latest last
  let raf = 0, last = performance.now(), alive = true;

  const names = (pid) => (pid === self.id ? self.name : (others.get(pid) || {}).name || 'Mascota');
  const games = createGames({
    id: net.id, send: (m) => net.sendGame(m), present: () => new Set(net.peers().map((p) => p.id)), name: names, now: () => performance.now(), award: (n) => stars.add(n),
    pos: (pid) => (pid === self.id ? { x: self.walker.tileX, y: self.walker.tileY, area: self.area } : net.peers().find((p) => p.id === pid) || null),
  });
  const chickWalker = new Walker(30, 40);
  let chickSeq = 0, hudAt = -Infinity, wasLobby = null;
  let racing = false, slowUntil = 0, lastTile = null;          // the obstacle race: a pet that steps onto an obstacle walks slower for RACE.slowMs
  self.walker.onStep = (x, y, d) => net.sendPos(x, y, d, self.area);
  net.sendPos(sx, sy, 'down', 'town');

  const addPeer = (p) => {
    const w = new Walker(p.x ?? 0, p.y ?? 0, p.d || 'down');
    others.set(p.id, { id: p.id, name: p.name, look: p.look, walker: w, emote: null, placed: p.x != null, area: p.area || 'town' });
  };
  for (const p of net.peers()) addPeer(p);

  function onNetEvent(ev) {
    if (!alive) return;
    if (ev.type === 'join') addPeer(ev.peer);
    else if (ev.type === 'leave') others.delete(ev.id);
    else if (ev.type === 'pos') {
      const o = others.get(ev.id);
      if (!o) return;
      if (!o.placed || o.area !== ev.area || Math.abs(o.walker.tileX - ev.x) + Math.abs(o.walker.tileY - ev.y) > 3) { o.walker.snap(ev.x, ev.y, ev.d); o.placed = true; o.area = ev.area; } else o.walker.goTo(ev.x, ev.y, ev.d, o.area);
    } else if (ev.type === 'game') {
      games.onMessage(ev.m);
    } else if (ev.type === 'emote') {
      const o = others.get(ev.id);
      if (o) o.emote = { e: ev.e, until: performance.now() + EMOTE_MS };
    }
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  /** Is this tile allowed for this pet now? A pet playing cannot leave its game's zone (the walls are soft: it just stays). */
  function canEnter(x, y, zone, closed = false) {
    if (closed && self.area === 'town' && doorAt(x, y, 'town')) { games.notify('Ahora no se puede entrar', 'wall'); return false; }      // the doors are shut while playing
    if (!zone || zone.has(x, y)) return true;
    games.notify(zone.wall, 'wall');
    return false;
  }
  const walkableFor = (mv) => (x, y) => isWalkable(x, y, 'town') && (!mv.zone || mv.zone.has(x, y)) && !(mv.closed && doorAt(x, y, 'town'));

  function frame(t) {
    if (!alive) return;
    const dt = Math.min(100, t - last);
    last = t;
    const w = self.walker;
    if (self.fx && entranceState(self.fx.id, self.fx.phase, t - self.fx.t0).done) {      // the arrival or the exit is over
      const f = self.fx;
      self.fx = null;
      if (f.phase === 'leave') self.gone = true;
      if (f.resolve) f.resolve();
    }
    games.update();
    const start = games.takeStart();                              // a line-up game began: stand on the spot it gives (football's kickoff)
    if (start && self.area === 'town') { w.snap(start[0], start[1], 'down'); net.sendPos(start[0], start[1], 'down', 'town'); held.length = 0; fadeT0 = t; }
    const mv = games.movement();
    if (mv.frozen) { w.queue = []; held.length = 0; }
    if (mv.zone && self.area === 'town' && !w.busy && !mv.zone.has(w.tileX, w.tileY)) {      // outside the game's area when it starts: run to its pad
      const [sx, sy] = mv.zone.pad;
      w.snap(sx, sy, 'down'); net.sendPos(sx, sy, 'down', 'town'); fadeT0 = t;
    }
    if (!w.busy && held.length && !self.fx) {                    // a held arrow key keeps walking
      const d = held[held.length - 1];
      const [dx, dy] = dirVector(d);
      const nx = w.tileX + dx, ny = w.tileY + dy;
      if (isWalkable(nx, ny, self.area) && canEnter(nx, ny, mv.zone, mv.closed)) w.stepToward(nx, ny); else w.face(d);
    }
    if (racing) {
      const cur = { x: w.tileX, y: w.tileY };
      if (stumbled(lastTile, cur)) { slowUntil = t + RACE.slowMs; games.notify('¡Tropezaste!', 'wall'); }
      lastTile = cur;
      w.stepOverride = paceAt(t, slowUntil);
    } else if (w.stepOverride) { w.stepOverride = null; lastTile = null; }
    w.update(dt);
    if (!w.busy && !self.fx) {                                    // arrived on a door: go through it
      const door = doorAt(w.tileX, w.tileY, self.area);
      if (door && !mv.closed) { self.area = door.to.area; w.snap(door.to.x, door.to.y, door.to.d); net.sendPos(door.to.x, door.to.y, door.to.d, self.area); state.marker = null; fadeT0 = t; }
    }
    if (t - ambAt > 2000) { ambAt = t; state.amb = ambientAt(hourNow(location.search)); }
    state.area = self.area;
    state.fade = 1 - (t - fadeT0) / FADE_MS;
    for (const o of others.values()) o.walker.update(dt);
    state.others = Array.from(others.values()).filter((o) => o.placed && o.area === self.area && games.canSee(o.id));      // in a game: only the players, and their names, are drawn
    const vision = games.seekerVision();                         // the seeker sees only a circle of light, and not what hides in bushes
    state.dark = vision ? { full: vision.full, r: GAME_RULES.hide.lightRadius * 16 } : null;
    if (vision) state.others = vision.full ? [] : state.others.filter((o) => vision.see({ x: o.walker.tileX, y: o.walker.tileY }, !!TILES[tileAt(o.walker.tileX, o.walker.tileY)].hide));
    if (self.area === 'town') {                                   // ambient life: the birds look at every pet in the town
      stepLife(life, [{ x: w.tileX, y: w.tileY }, ...Array.from(others.values()).filter((o) => o.placed && o.area === 'town').map((o) => ({ x: o.walker.tileX, y: o.walker.tileY }))], t);
      state.life = lifeFrame(life, t, state.amb);
    } else state.life = null;
    const gv = games.view();
    self.act = activityOf({ area: self.area, game: gv.game, moving: w.busy });
    net.setActivity(self.act);
    racing = !!(gv.game && gv.game.g === 'race' && gv.game.play && gv.game.phase === 'play' && self.area === 'town');
    const ck = gv.game && gv.game.chick;
    if (ck && ck.seq !== chickSeq) {                                                       // a new motion: continue along its route, correct only what differs
      chickSeq = ck.seq;
      chickWalker.stepOverride = ck.v || null;                                              // a flight is drawn at the pace the referee runs it
      if (ck.snap) chickWalker.snap(ck.x, ck.y, ck.d); else chickWalker.follow(ck.route, 'town', 6, ck.o);
    }
    chickWalker.update(dt);
    if (ck && self.area === 'town') {
      const cp = chickWalker.pos();
      state.chicken = { x: cp.x, y: cp.y, frame: chickWalker.moving && Math.floor(t / 110) % 2 ? 1 : 0, flip: chickWalker.d === 'left' };
    } else state.chicken = null;
    state.ball = gv.game && gv.game.ball && self.area === 'town' ? gv.game.ball : null;
    const here = !w.busy && self.area === 'town' ? spotAt(w.tileX, w.tileY) : null;      // standing on a game's pad: the button; walking onto the pad of an open lobby joins it
    if (here && gv.lobby && gv.lobby.g === here && !gv.lobby.iJoined) games.join();
    if (t - hudAt > 120) { hudAt = t; onHud({ ...gv, spot: here, wall: mv.zone && gv.game ? gv.game.name : null, frozen: mv.frozen }); }
    renderer.draw(state, t);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function onPointer(ev) {
    if (ev.button > 0 || self.fx || self.gone) return;
    const tile = renderer.pointToTile(ev.clientX, ev.clientY);
    if (!tile) return;
    ev.preventDefault();
    const mv = games.movement();
    if (mv.frozen) return;
    if ((mv.zone || mv.closed) && !canEnter(tile[0], tile[1], mv.zone, mv.closed)) return;
    const path = findPath(self.walker.tileX, self.walker.tileY, tile[0], tile[1], mv.zone || mv.closed ? walkableFor(mv) : self.area);
    if (path.length) {
      self.walker.setPath(path);
      state.marker = { x: tile[0], y: tile[1], until: performance.now() + 500 };
    }
  }
  function onKeyDown(ev) {
    if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const d = KEY_DIRS[ev.key];
    if (!d || self.fx) return;
    ev.preventDefault();
    if (!held.includes(d)) { held.push(d); self.walker.queue = []; }   // a key cancels a tapped route
  }
  function onKeyUp(ev) {
    const d = KEY_DIRS[ev.key];
    const i = held.indexOf(d);
    if (i >= 0) held.splice(i, 1);
  }
  canvas.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { held.length = 0; });
  const onVisibility = () => net.resync();                    // timers sleep in a hidden tab: say where we are going in and coming out
  document.addEventListener('visibilitychange', onVisibility);

  return {
    onNetEvent,
    /** The pets of this room for the radar (this pet first): [{ n, sp, st, s, a }]. */
    radarPets: () => radarPets(self, net.peers()),
    /** Plays the exit of an entrance id and resolves when the pet is gone (the caller then leaves the room). */
    playExit(id) {
      held.length = 0; self.walker.queue = [];
      return new Promise((resolve) => { self.fx = { id, phase: 'leave', t0: performance.now(), resolve }; });
    },
    /** For manual testing in the console (two tabs): where this pet is, and walk to a tile like a tap would. */
    debug: {
      pos: () => [self.walker.tileX, self.walker.tileY],
      goTo(x, y) { const mv = games.movement(); const path = findPath(self.walker.tileX, self.walker.tileY, x, y, mv.zone || mv.closed ? walkableFor(mv) : self.area); if (path.length) self.walker.setPath(path); return path.length; },
    },
    games: {
      play: () => { const g = spotAt(self.walker.tileX, self.walker.tileY); return !!g && games.open(g); },
      join() {                                                  // "Me sumo": from anywhere; a pet inside a building comes out on the pad
        const ok = games.join();
        const lv = games.view().lobby;
        if (ok && lv) { const [sx, sy] = GAME_PLACES[lv.g].spot[0]; if (self.area !== 'town') { self.area = 'town'; self.walker.snap(sx, sy, 'down'); net.sendPos(sx, sy, 'down', 'town'); fadeT0 = performance.now(); } }
        return ok;
      },
      seek: () => games.volunteer(),
      zone: (z) => games.pickZone(z),
      team: (t) => games.pickTeam(t),
      leave: () => games.leave(),
      dismiss: () => games.dismiss(),
    },
    emote(e) {
      if (self.fx || self.gone) return;
      if (net.sendEmote(e)) self.emote = { e, until: performance.now() + EMOTE_MS };
    },
    destroy() {
      alive = false;
      if (self.fx && self.fx.resolve) self.fx.resolve();
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
