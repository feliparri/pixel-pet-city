// The running town: the local pet, the other pets, input (taps, arrows/WASD), the net session and the draw loop.
import { findPath, dirVector } from './path.js';
import { isWalkable, SPAWNS, TILE } from './map.js';
import { Walker } from './walker.js';
import { createRenderer, EMOTE_MS } from './render.js';
import { renderMap } from './art.js';
import { entranceState } from './entrance.js';

const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };

function spawnFor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPAWNS[h % SPAWNS.length];
}

/** me: { name, look }; net: a createNet() session already joined; entrance: an entrance id to play on arrival (a visiting pet), or null.
 * Returns { onNetEvent, emote, playExit, destroy }. */
export function startTown({ canvas, stage, sprites, font, net, me, entrance = null }) {
  const [sx, sy] = spawnFor(net.id);
  const self = { id: net.id, name: me.name, look: me.look, walker: new Walker(sx, sy), emote: null };
  if (entrance) self.fx = { id: entrance, phase: 'arrive', t0: performance.now(), resolve: null };
  const others = new Map();
  const state = { me: self, others: [], marker: null };
  const renderer = createRenderer({ canvas, sprites, font, mapCanvas: renderMap() });
  const held = [];                                   // direction keys held, the latest last
  let raf = 0, last = performance.now(), alive = true;

  self.walker.onStep = (x, y, d) => net.sendPos(x, y, d);
  net.sendPos(sx, sy, 'down');

  const addPeer = (p) => {
    const w = new Walker(p.x ?? 0, p.y ?? 0, p.d || 'down');
    others.set(p.id, { id: p.id, name: p.name, look: p.look, walker: w, emote: null, placed: p.x != null });
  };
  for (const p of net.peers()) addPeer(p);

  function onNetEvent(ev) {
    if (!alive) return;
    if (ev.type === 'join') addPeer(ev.peer);
    else if (ev.type === 'leave') others.delete(ev.id);
    else if (ev.type === 'pos') {
      const o = others.get(ev.id);
      if (!o) return;
      if (!o.placed) { o.walker.snap(ev.x, ev.y, ev.d); o.placed = true; } else o.walker.goTo(ev.x, ev.y, ev.d, isWalkable);
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
    if (!w.busy && held.length && !self.fx) {                    // a held arrow key keeps walking
      const d = held[held.length - 1];
      const [dx, dy] = dirVector(d);
      const nx = w.tileX + dx, ny = w.tileY + dy;
      if (isWalkable(nx, ny)) w.stepToward(nx, ny); else w.face(d);
    }
    w.update(dt);
    for (const o of others.values()) o.walker.update(dt);
    state.others = Array.from(others.values()).filter((o) => o.placed);
    renderer.draw(state, t);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function onPointer(ev) {
    if (ev.button > 0 || self.fx || self.gone) return;
    const tile = renderer.pointToTile(ev.clientX, ev.clientY);
    if (!tile) return;
    ev.preventDefault();
    const path = findPath(self.walker.tileX, self.walker.tileY, tile[0], tile[1]);
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

  return {
    onNetEvent,
    /** Plays the exit of an entrance id and resolves when the pet is gone (the caller then leaves the room). */
    playExit(id) {
      held.length = 0; self.walker.queue = [];
      return new Promise((resolve) => { self.fx = { id, phase: 'leave', t0: performance.now(), resolve }; });
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
    },
  };
}
