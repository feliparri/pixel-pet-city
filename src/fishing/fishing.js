// The fishing layer: a full-screen layer over the town with its own canvas and menus, like the arcade (src/arcade/arcade.js). One controller ties the pieces together
// (loop, the one-button input, the screens, the picture); the rules live in rules.js and the picture's maths in layout.js. The town stops while this is open (town.suspend).
import { createLoop } from '../arcade/loop.js';
import { logicalSize } from '../arcade/lanes.js';
import { el, button, safeInsets } from '../arcade/arcade.js';
import { drawPet, petLayout } from '../sprites.js';
import { createFishing, press, release, tick, fishById } from './rules.js';
import { initialFlow, reduce } from './flow.js';
import { createHold, attachFishInput } from './input.js';
import { drawFishing } from './view.js';
import { promptFor, ESCAPE_TEXT, RARITY_TEXT, resultDelay } from './layout.js';
import { fishCanvas } from './fish-art.js';

const NO_REWARD = { settle: () => ({}) };

/**
 * root: the empty element to build in. sprites, font: the town's. look: the pet's. sound: src/sound.js's player. getCtx(): { night, christmas } now (asked at every cast).
 * reward: { settle(catch) -> { first, record, stars, capped } } (the album and the stars, set up by the page). onExit(): back to the town. Returns { destroy, dev }.
 */
export function startFishing({ root, sprites, font, look, sound, getCtx = () => ({}), reward = NO_REWARD, onExit, seed, screen = 'menu' }) {
  root.replaceChildren();
  root.hidden = false;
  const frame = el('div', 'arc-frame'), canvas = el('canvas', 'arc-canvas'), ui = el('div', 'arc-ui'), tools = el('div', 'arc-tools'), big = el('button', 'fish-btn');
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Pesca');
  big.type = 'button'; big.hidden = true;
  frame.append(canvas, ui, tools, big);
  root.append(frame);
  const ctx = canvas.getContext('2d');

  let flow = initialFlow(screen), size = null, pad = { top: 0, left: 0, right: 0 };
  let clock = 0, frozen = false, destroyed = false, endAt = 0, endedAt = 0, outcome = null, casts = 0;
  let sim = createFishing(seed ?? (Math.random() * 4294967296) >>> 0, getCtx());

  // ---- sizing ------------------------------------------------------------------------------------------------------------------------------------
  function resize() {
    const r = frame.getBoundingClientRect(), s = logicalSize(r.width, r.height);
    if (size && size.w === s.w && size.h === s.h && size.px === s.px) return;
    size = s; canvas.width = s.w; canvas.height = s.h;
    root.dataset.wide = s.wide ? '1' : '';
    canvas.style.width = s.fit ? `${s.fit.w}px` : ''; canvas.style.height = s.fit ? `${s.fit.h}px` : '';
    const ins = safeInsets(root);
    pad = { top: Math.round(ins.top / s.px), left: Math.round(ins.left / s.px), right: Math.round(ins.right / s.px) };
  }
  const ro = new ResizeObserver(resize);
  ro.observe(frame);
  resize();

  // ---- screens -----------------------------------------------------------------------------------------------------------------------------------
  function dispatch(a) {
    const next = reduce(flow, a);
    if (next === flow) return false;
    if (flow.screen === 'play' && next.screen !== 'play') hold.clear();
    flow = next;
    paint();
    return true;
  }
  const leave = () => { if (!flow.exit) { dispatch({ type: 'exit' }); onExit(); } };
  const petCanvas = () => {
    const lay = petLayout(sprites.data, look), c = el('canvas', 'arc-pet');
    c.width = lay.w; c.height = lay.h; c.setAttribute('aria-hidden', 'true');
    drawPet(c.getContext('2d'), sprites, look, lay.origin.x, lay.origin.y, { frame: 'happy' });
    return c;
  };
  const panel = (info, actions) => { const p = el('div', 'arc-panel'), a = el('div', 'arc-info'), b = el('div', 'arc-actions'); a.append(...info); b.append(...actions); p.append(a, b); return p; };
  function muteButton() {
    const b = el('button', 'btn ico arc-mute'); b.type = 'button';
    const paintMute = () => { const m = sound.isMuted(); b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-label', m ? 'Activar sonido' : 'Silenciar'); b.title = m ? 'Activar sonido' : 'Silenciar'; b.setAttribute('aria-pressed', String(m)); };
    b.addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.isMuted()); paintMute(); b.blur(); });
    paintMute();
    return b;
  }
  const menuButtons = (primary) => [button(primary, 'primary big', () => startCast()), button('Volver a la ciudad', '', leave)];

  function resultPanel() {
    const caught = sim.phase === 'caught', info = [];
    if (caught) {
      const f = fishById(sim.catch.id), o = outcome || {};
      const c = fishCanvas(f.id, 5), pic = el('canvas', 'fish-pic'); pic.width = c.width; pic.height = c.height; pic.getContext('2d').drawImage(c, 0, 0); pic.setAttribute('aria-hidden', 'true');
      info.push(pic, el('h2', 'arc-head win', f.name), el('p', `fish-rarity ${f.rarity}`, `${RARITY_TEXT[f.rarity]} · ${sim.catch.size} cm`));
      if (o.first) info.push(el('p', 'fish-new', '¡Nuevo!'));
      else if (o.record) info.push(el('p', 'fish-new', '¡Récord de tamaño!'));
      if (o.stars) info.push(el('p', 'arc-stars', `+${o.stars} ⭐`));
      if (o.capped) info.push(el('p', 'arc-sub', 'Ya ganaste las estrellas de pesca de hoy'));
    } else {
      info.push(el('h2', 'arc-head', ESCAPE_TEXT[sim.reason] || 'Se escapó'), el('p', 'arc-sub', 'Prueba otra vez.'));
    }
    return panel(info, [button('Otra vez', 'primary big', () => startCast()), button('Volver a la ciudad', '', leave)]);
  }

  function paint() {
    ui.replaceChildren(); tools.replaceChildren();
    ui.dataset.screen = flow.screen; root.dataset.screen = flow.screen;
    big.hidden = flow.screen !== 'play';
    if (flow.screen === 'menu') {
      ui.append(el('h1', 'arc-title', 'Pesca'), panel([petCanvas(), el('p', 'arc-sub', 'Lanza la caña al estanque y espera a que pique.')], menuButtons('Pescar')));
    } else if (flow.screen === 'play') {
      const back = button('Volver', '', leave), pause = button('⏸', 'ico', () => dispatch({ type: 'pause' }));
      pause.setAttribute('aria-label', 'Pausa'); pause.title = 'Pausa';
      tools.append(back, el('span', 'fish-gap'), muteButton(), pause);
    } else if (flow.screen === 'pause') {
      ui.append(panel([el('h2', 'arc-head', 'Pausa')], [button('Seguir', 'primary big', () => dispatch({ type: 'resume' })), button('Volver a la ciudad', '', leave)]));
    } else if (flow.screen === 'result') {
      ui.append(resultPanel());
    }
    if (flow.screen !== 'play') tools.append(muteButton());
    paintButton();
    root.dataset.ready = '1';
  }
  const paintButton = () => { const p = promptFor(sim.phase); if (big.textContent !== p.button) big.textContent = p.button; big.dataset.phase = sim.phase; };

  // ---- a cast ------------------------------------------------------------------------------------------------------------------------------------
  function startCast() {
    if (flow.screen === 'menu' || flow.screen === 'result' || flow.screen === 'pause') {
      sim = createFishing(seed != null ? Number(seed) + casts : (Math.random() * 4294967296) >>> 0, getCtx());
      casts++; endAt = 0; endedAt = 0; outcome = null;
      dispatch({ type: 'start' });
    }
  }
  /** The run ended (a catch or an escape): settle the catch once and schedule the card. */
  function endRun() {
    if (endAt) return;
    outcome = sim.phase === 'caught' ? reward.settle(sim.catch) || {} : null;
    endedAt = clock; endAt = clock + resultDelay(sim.phase);
  }
  const playing = () => flow.screen === 'play' && (sim.phase !== 'caught' && sim.phase !== 'escaped');
  const hold = createHold({
    press: () => { if (playing()) { press(sim, Date.now()); fx(sim.events); paintButton(); } },
    release: () => { if (flow.screen === 'play' && sim.phase !== 'caught' && sim.phase !== 'escaped') { release(sim, Date.now()); fx(sim.events); } },
  });
  /** What the events of a step mean outside the rules (sound comes here). */
  function fx(events) { void events; }
  const detach = attachFishInput([canvas, big], hold, { onPause: () => { if (flow.screen === 'play') dispatch({ type: 'pause' }); else if (flow.screen === 'pause') dispatch({ type: 'resume' }); else if (flow.screen === 'menu') leave(); }, canHold: () => flow.screen === 'play' });
  const onHidden = () => { if (document.hidden && flow.screen === 'play') dispatch({ type: 'pause' }); };
  document.addEventListener('visibilitychange', onHidden);

  // ---- the loop ----------------------------------------------------------------------------------------------------------------------------------
  function onStep(ms) {
    if (flow.screen === 'pause' || frozen) return;
    clock += ms;
    if (flow.screen !== 'play') return;
    if (sim.phase !== 'caught' && sim.phase !== 'escaped') { tick(sim, ms / 1000, Date.now()); fx(sim.events); if (sim.phase === 'caught' || sim.phase === 'escaped') endRun(); paintButton(); }
    if (endAt && clock >= endAt) { endAt = 0; dispatch({ type: 'result' }); }
  }
  function onRender() {
    if (!size) return;
    paintButton();
    drawFishing(ctx, sim, { w: size.w, h: size.h, pad, font, sprites, look, ctx: sim.ctx, clock, resultT: endedAt ? clock - endedAt : 0, hints: flow.screen === 'play' });
    if (flow.screen !== 'play') { ctx.fillStyle = flow.screen === 'menu' ? 'rgba(18,22,40,0.25)' : 'rgba(18,22,40,0.5)'; ctx.fillRect(0, 0, size.w, size.h); }
  }
  const loop = createLoop({ step: onStep, render: onRender });
  paint();
  loop.start();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      loop.stop(); detach(); ro.disconnect();
      document.removeEventListener('visibilitychange', onHidden);
      root.replaceChildren(); root.hidden = true;
    },
    /** For previews and tests: drive the run to a moment and keep it (frozen) for a picture. */
    dev: {
      get flow() { return flow; },
      get state() { return sim; },
      get clock() { return clock; },
      freeze(on = true) { frozen = !!on; },
      /** go('play' | 'charging' | 'waiting' | 'bite' | 'reeling' | 'caught' | 'escaped' | 'result', { fish, power, reason, ctx, seed }): jumps there with the rules' own steps. */
      go(name, o = {}) {
        if (flow.screen !== 'play' && flow.screen !== 'result') { sim = createFishing(o.seed ?? seed ?? 7, o.ctx || getCtx()); } else if (o.ctx) sim.ctx = o.ctx;
        if (flow.screen === 'menu' || flow.screen === 'pause') dispatch({ type: 'start' });
        if (flow.screen === 'result') { sim = createFishing(o.seed ?? seed ?? 7, o.ctx || getCtx()); endAt = 0; endedAt = 0; outcome = null; dispatch({ type: 'start' }); }
        frozen = false;
        const step = (n = 1) => { for (let i = 0; i < n; i++) { clock += 1000 / 60; tick(sim, 1 / 60, Date.now()); fx(sim.events); } };
        if (name === 'play') return;
        press(sim); fx(sim.events);
        if (name === 'charging') { for (let i = 0; i < 600 && sim.power < (o.power ?? 0.6); i++) step(); frozen = true; return; }
        while (sim.power < (o.power ?? 0.6)) step();
        release(sim); fx(sim.events);
        for (let i = 0; i < 600 && sim.phase !== 'waiting'; i++) step();
        if (o.fish && fishById(o.fish)) { sim.fish = fishById(o.fish); sim.size = o.size || sim.fish.cm[0]; }
        if (name === 'waiting') { step(Math.round((o.at ?? 1.6) * 60)); frozen = true; return; }
        const finish = () => { endRun(); if (name === 'result') dispatch({ type: 'result' }); frozen = true; };
        if ((name === 'escaped' || name === 'result') && o.reason === 'early') { press(sim); fx(sim.events); finish(); return; }
        for (let i = 0; i < 1200 && sim.phase !== 'bite'; i++) step();
        if (name === 'bite') { step(10); frozen = true; return; }
        if ((name === 'escaped' || name === 'result') && o.reason === 'missed') { for (let i = 0; i < 300 && sim.phase === 'bite'; i++) step(); finish(); return; }
        press(sim); fx(sim.events);
        const bot = () => { const r = sim.reel; if (r) { if (r.marker < r.zone - 0.02) press(sim); else if (r.marker > r.zone + 0.02) release(sim); } };
        if (name === 'reeling') { for (let i = 0; i < (o.at ?? 1.2) * 60 && sim.phase === 'reeling'; i++) { bot(); step(); } frozen = true; return; }
        if (name === 'caught') { for (let i = 0; i < 3600 && sim.phase === 'reeling'; i++) { bot(); step(); } endRun(); frozen = true; return; }
        if (name === 'escaped' || name === 'result') {
          for (let i = 0; i < 3600 && sim.phase === 'reeling'; i++) step();                               // no input: the line snaps
          if (o.reason && o.reason !== 'snapped') { sim.phase = 'escaped'; sim.reason = o.reason; }
          finish();
        }
      },
      /** Jumps to the card of a catch or an escape with the given fish / reason (dev only). */
      card(o = {}) {
        sim = createFishing(o.seed ?? 3, getCtx()); frozen = true;
        if (o.reason) { sim.phase = 'escaped'; sim.reason = o.reason; } else { const f = fishById(o.fish) || fishById('trucha'); sim.phase = 'caught'; sim.fish = f; sim.catch = { id: f.id, size: o.size || f.cm[1], stars: f.stars, at: 0 }; }
        endAt = 0; endedAt = 0; endRun();
        if (flow.screen !== 'play') dispatch({ type: 'start' });
        dispatch({ type: 'result' });
      },
    },
  };
}
