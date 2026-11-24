// The arcade: a full-screen layer over the town with its own canvas and menus. One controller ties the pieces together (loop, input, flow, best scores,
// the train game and its view, the HUD, sound); every rule lives in the pure modules next to it. The town stops while this is open (town.suspend).
import { createLoop } from './loop.js';
import { attachInput } from './input.js';
import { logicalSize } from './lanes.js';
import { reduce, initialFlow, GAMES } from './flow.js';
import { createBestStore, createDailyStars, starsFor } from './scores.js';
import { createTrainGame, step as stepTrain, setIntent, scoreOf, botIntent, upcomingFork, progressAt, TRAIN } from './train.js';
import { createTrainView } from './train-view.js';
import { createSkateGame, step as stepSkate, steer, jump, scoreOf as skateScore, botInput, isHazard, progressAt as skateProgress } from './skate.js';
import { createSkateView } from './skate-view.js';
import { drawHud, drawRouteBar, routeBarBox, faceIcon, scoreText } from './hud.js';
import { drawPet, petLayout } from '../sprites.js';
import { note, W, N } from '../sound.js';
import * as art from './art.js';

const OVER_DELAY_MS = 1100;                           // the crash plays out before the game over panel appears
const WIN_DELAY_MS = 1000;                            // the arrival stays on screen this long before the win panel
const MENU_SPEED = 24;                                // the scenery drifts under the menus (units per second)
const JINGLE = [note(W.SQ25, N.E5, N.E5, 80, 140), note(W.SQ25, N.G5, N.G5, 80, 140), note(W.SQ25, N.C6, N.C6, 80, 140), note(W.SQ25, N.E6, N.E6, 130, 140), note(W.REST, 0, 0, 40, 0), note(W.SQ25, N.G5, N.G5, 60, 140), note(W.SQ25, N.C6, N.C6, 240, 140)];

/** What each game plugs in: how a run is made and stepped, what an action does, how the picture is made, and a demo bot (previews). */
const WHOOSH = [note(W.TRI, 260, 980, 110, 120)];
const ADAPTERS = {
  train: {
    create: createTrainGame, step: stepTrain, score: scoreOf, view: createTrainView, progress: (g) => progressAt(g.dist),
    act(g, a) { if (a === 'left' || a === 'right') return setIntent(g, a === 'left' ? -1 : 1); return false; },      // the choice for the next switch
    hold() {}, bot(g) { botIntent(g); },
  },
  skate: {
    create: createSkateGame, step: stepSkate, score: skateScore, view: createSkateView, progress: (g) => skateProgress(g.dist),
    act(g, a) { if (a === 'jump') jump(g); return false; },
    hold(g, d) { steer(g, d); }, bot(g) { const b = botInput(g); steer(g, b.dir); if (b.jump) jump(g); },
  },
};

/** Preview moments for the dev hook (?arcade=play&shot=...): the run goes on until the picture asked for happens. */
const SHOTS = {
  'train:fork3': (g) => { const f = upcomingFork(g); return !!f && f.branches.length === 3 && f.z - g.dist > 42 && f.z - g.dist < 62 && g.trains.filter((t) => t.z > f.z && t.z - g.dist < 190).length >= 2; },
  'train:fork4': (g) => { const f = upcomingFork(g); return !!f && f.branches.length === 4 && f.z - g.dist > 42 && f.z - g.dist < 62 && g.trains.filter((t) => t.z > f.z && t.z - g.dist < 190).length >= 2; },
  'train:station': (g) => g.goal - g.dist < 60,
  'train:fork': (g) => { const f = upcomingFork(g); return !!f && f.z - g.dist > 70 && f.z - g.dist < 120 && g.trains.some((t) => t.z > f.z && t.z - g.dist < 175); },
  'skate:home': (g) => g.goal - g.dist < 45,
  'skate:pipe': (g) => g.grounded && Math.abs(g.p) < 0.15 && !g.objs.some((o) => o.all && o.z < 110) && g.objs.some((o) => isHazard(o) && !o.all && o.slot === 0 && o.z > 40 && o.z < 75),
  'skate:wall': (g) => Math.abs(g.p) > 0.9 && g.objs.some((o) => isHazard(o) && !o.all && o.slot === 0 && o.z > 12 && o.z < 45),
  'skate:jump': (g) => g.h > 1.6 && g.objs.some((o) => isHazard(o) && o.h < 2 && o.z > -12 && o.z < 3 && (o.all || Math.abs(o.slot - g.p) < 0.6)),
  'train:escape': (g) => { const f = upcomingFork(g); return !!f && f.sec.esc && f.z - g.dist > 34 && f.z - g.dist < 48 && g.trains.some((t) => t.z > f.z); },
};

export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const button = (text, cls, onClick) => { const b = el('button', `btn ${cls || ''}`.trim(), text); b.type = 'button'; b.addEventListener('click', () => { onClick(); b.blur(); }); return b; };

export const dayString = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export const safeInsets = (root) => {                       // the notch: env(safe-area-inset-*) resolved by the browser through a probe element (css px)
  try {
    const p = el('div', 'arc-probe'); root.append(p); const c = getComputedStyle(p);
    const v = { top: parseFloat(c.paddingTop) || 0, left: parseFloat(c.paddingLeft) || 0, right: parseFloat(c.paddingRight) || 0 };
    p.remove(); return v;
  } catch { return { top: 0, left: 0, right: 0 }; }
};

/**
 * root: the empty element to build in. sprites, font: the town's. look: { species, stage, items } of the pet. sound: src/sound.js's player. awardStars(n): the town's
 * star counter. storage: localStorage (guarded by the stores). onExit(): "Volver a la ciudad". Returns { destroy, dev } (dev: for previews and tests).
 */
export function startArcade({ root, sprites, font, look, sound, awardStars = () => {}, storage = null, onExit, seed, screen = 'menu' }) {
  root.replaceChildren();
  root.hidden = false;
  const frame = el('div', 'arc-frame'), canvas = el('canvas', 'arc-canvas'), ui = el('div', 'arc-ui'), tools = el('div', 'arc-tools');
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Arcade');
  frame.append(canvas, ui, tools);
  root.append(frame);
  const ctx = canvas.getContext('2d');

  const best = createBestStore(storage), daily = createDailyStars(storage, dayString);
  const face = faceIcon(sprites, look);
  let flow = initialFlow(), game = null, views = {}, size = null, pad = { top: 0, left: 0, right: 0 };
  let frozen = false, clock = 0, idleDist = 0, overAt = 0, runStars = 0, destroyed = false, hintsT = 0;
  const idle = { dist: 0, x: 0, goal: 1e9, pick: null, lastFrac: 0, sections: [{ z0: -1e5, kind: 'start', nodes: [{ id: 0, xs: 0, xe: 0, parents: [] }] }], node: 0, si: 0, trains: [], coinList: [], invuln: 0, flash: 0, lives: TRAIN.LIVES, over: false, t: 0 };

  // ---- sizing ------------------------------------------------------------------------------------------------------------------------------------
  function resize() {
    const r = frame.getBoundingClientRect();
    const s = logicalSize(r.width, r.height);
    if (size && size.w === s.w && size.h === s.h && size.px === s.px) return;
    size = s; canvas.width = s.w; canvas.height = s.h;
    root.dataset.wide = s.wide ? '1' : '';
    canvas.style.width = s.fit ? `${s.fit.w}px` : ''; canvas.style.height = s.fit ? `${s.fit.h}px` : '';      // wide: one whole-number scale, never stretched
    const ins = safeInsets(root);
    pad = { top: Math.round(ins.top / s.px), left: Math.round(ins.left / s.px), right: Math.round(ins.right / s.px) };
    views = {};
  }
  const viewFor = (id) => { if (!size) return null; return views[id] || (views[id] = ADAPTERS[id].view(size, { font })); };
  const ro = new ResizeObserver(resize);
  ro.observe(frame);
  resize();

  // ---- screens (DOM over the canvas) -----------------------------------------------------------------------------------------------------------
  const tap = (name) => { try { sound.play(name); } catch { /* sound is optional */ } };
  function dispatch(a) {
    const next = reduce(flow, a);
    if (next === flow) return false;
    flow = next;
    if (next.screen === 'pause' && game) ADAPTERS[next.game].hold(game, 0);       // a paused board stops steering
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
  /** A panel: `info` (headline, score...) and `actions` (buttons). Portrait stacks them as one column; a wide screen puts them side by side (style.css). */
  const panel = (info, actions) => { const p = el('div', 'arc-panel'), a = el('div', 'arc-info'), b = el('div', 'arc-actions'); a.append(...info); b.append(...actions); p.append(a, b); return p; };

  function paint() {
    ui.replaceChildren();
    tools.replaceChildren();
    ui.dataset.screen = flow.screen;
    root.dataset.screen = flow.screen;
    if (flow.screen === 'menu') {
      const title = el('h1', 'arc-title', 'Arcade');
      ui.append(title, panel([petCanvas(), el('p', 'arc-sub', 'Con tus lentes VR puestos, ¡a jugar!')], [button('Jugar', 'primary big', () => dispatch({ type: 'start' })), button('Volver a la ciudad', '', leave)]));
    } else if (flow.screen === 'select') {
      const list = el('div', 'arc-cards');
      for (const g of GAMES) {
        const card = el('button', `arc-card${g.available ? '' : ' soon'}`);
        card.type = 'button'; card.disabled = !g.available;
        const icon = el('canvas', 'arc-card-icon'); icon.width = art.TRAIN_W; icon.height = art.TRAIN_H; icon.setAttribute('aria-hidden', 'true');
        icon.getContext('2d').drawImage(g.id === 'train' ? art.trainFront('red') : art.skateIcon(), 0, 0);
        const best1 = best.get(g.id);
        card.append(icon, el('span', 'arc-card-name', g.name), el('span', 'arc-card-sub', g.available ? g.blurb : 'Pronto'), el('span', 'arc-card-best', g.available ? (best1 ? `Mejor: ${best1}` : 'Sin puntaje') : ' '));
        if (g.available) card.addEventListener('click', () => { startRun(g.id); });
        list.append(card);
      }
      ui.append(el('h2', 'arc-head', 'Elige un juego'), list, panel([], [button('Atrás', '', () => dispatch({ type: 'title' })), button('Volver a la ciudad', '', leave)]));
    } else if (flow.screen === 'play') {
      tools.append(button('⏸', 'ico', () => dispatch({ type: 'pause' })), muteButton());
      tools.firstChild.setAttribute('aria-label', 'Pausa'); tools.firstChild.title = 'Pausa';
    } else if (flow.screen === 'pause') {
      ui.append(panel([el('h2', 'arc-head', 'Pausa')], [button('Seguir', 'primary big', () => dispatch({ type: 'resume' })), button('Otra vez', '', () => startRun(flow.game)), button('Menú', '', () => dispatch({ type: 'menu' })), button('Volver a la ciudad', '', leave)]));
    } else if (flow.screen === 'over') {
      const gm = GAMES.find((x) => x.id === flow.game);
      const lines = [el('h2', `arc-head${flow.won ? ' win' : ''}`, flow.won ? gm.win : '¡Fin del juego!'), el('p', 'arc-score', scoreText(flow.score)), el('p', 'arc-best', flow.isNew ? '¡Nuevo récord!' : `Mejor: ${flow.best}`)];
      if (runStars) lines.push(el('p', 'arc-stars', `+${runStars} ⭐`));
      ui.append(panel(lines, [button('Otra vez', 'primary big', () => startRun(flow.game)), button('Menú', '', () => dispatch({ type: 'menu' })), button('Volver a la ciudad', '', leave)]));
    }
    if (flow.screen === 'menu' || flow.screen === 'select') tools.append(muteButton());
    root.dataset.ready = '1';
  }
  function muteButton() {
    const b = el('button', 'btn ico arc-mute'); b.type = 'button';
    const paintMute = () => { const m = sound.isMuted(); b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-label', m ? 'Activar sonido' : 'Silenciar'); b.title = m ? 'Activar sonido' : 'Silenciar'; b.setAttribute('aria-pressed', String(m)); };
    b.addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.isMuted()); paintMute(); b.blur(); });
    paintMute();
    return b;
  }

  // ---- a run -----------------------------------------------------------------------------------------------------------------------------------------
  function startRun(id) {
    if (flow.screen === 'select') { if (!dispatch({ type: 'pick', game: id })) return; } else if (!dispatch({ type: 'again' })) return;
    game = ADAPTERS[flow.game].create(seed ?? (Math.random() * 4294967296) >>> 0);
    overAt = 0; runStars = 0; hintsT = clock;
  }
  function finishRun() {
    const id = flow.game, score = ADAPTERS[id].score(game), r = best.submit(id, score);
    const won = game.won === true, n = starsFor(won, daily.earned());
    runStars = 0;
    if (n > 0) { daily.award(n); try { awardStars(n); } catch { /* the town is gone */ } runStars = n; }
    dispatch({ type: 'over', score, best: r.best, isNew: r.isNew, won });
    if (won) tap('win');
  }

  // ---- input -----------------------------------------------------------------------------------------------------------------------------------------
  const detach = attachInput(canvas, (a) => {
    if (flow.screen === 'play' && game && !game.over) {
      if (a === 'pause') dispatch({ type: 'pause' });
      else if (ADAPTERS[flow.game].act(game, a)) hintsT = -1e9;
    } else if (a === 'pause') {
      if (flow.screen === 'pause') dispatch({ type: 'resume' });
      else if (flow.screen === 'menu') leave();
      else if (flow.screen === 'select') dispatch({ type: 'title' });
      else if (flow.screen === 'over') dispatch({ type: 'menu' });
    }
  }, { hold: (d) => { if (flow.screen === 'play' && game && !game.over) { ADAPTERS[flow.game].hold(game, d); if (d) hintsT = Math.min(hintsT, clock - 1500); } } });
  const onHidden = () => { if (document.hidden && flow.screen === 'play') dispatch({ type: 'pause' }); };
  document.addEventListener('visibilitychange', onHidden);

  // ---- the loop ----------------------------------------------------------------------------------------------------------------------------------------
  function onStep(ms) {
    if (flow.screen === 'pause' || frozen) return;
    clock += ms;
    if (flow.screen === 'play' && game) {
      const events = ADAPTERS[flow.game].step(game, ms);
      for (const e of events) {
        if (e === 'coin') tap('coin'); else if (e === 'hit') tap('lose'); else if (e === 'move') tap('bounce3');
        else if (e === 'jump') { try { sound.playNotes(WHOOSH); } catch { /* optional */ } } else if (e === 'ramp') tap('bounce'); else if (e === 'land') tap('bounce3');
      }
      if (game.over && !overAt) overAt = clock + (game.won ? WIN_DELAY_MS : OVER_DELAY_MS);
      if (overAt && clock >= overAt) { overAt = 0; finishRun(); }
    } else if (flow.screen !== 'over') idleDist += (MENU_SPEED * ms) / 1000;
  }
  function onRender() {
    const playing = (flow.screen === 'play' || flow.screen === 'pause' || flow.screen === 'over') && game;
    const view = viewFor(playing ? flow.game : 'train');
    if (!view) return;
    const s = playing ? game : { ...idle, dist: idleDist };
    view.draw(ctx, s, clock, look, { hints: playing ? Math.max(0, Math.min(1, 1.6 - (clock - hintsT) / 3500)) : 0 });
    if (playing) {
      drawHud(ctx, { w: size.w, lives: game.lives, score: ADAPTERS[flow.game].score(game), face, font, top: pad.top, left: pad.left, right: pad.right });
      drawRouteBar(ctx, { w: size.w, progress: ADAPTERS[flow.game].progress(game), goal: GAMES.find((x) => x.id === flow.game).goal, ...routeBarBox(size.w, size.h, pad.top) });
    }
    if (flow.screen === 'pause' || flow.screen === 'over' || flow.screen === 'menu' || flow.screen === 'select') { ctx.fillStyle = flow.screen === 'menu' || flow.screen === 'select' ? 'rgba(18,22,40,0.28)' : 'rgba(18,22,40,0.55)'; ctx.fillRect(0, 0, size.w, size.h); }
  }
  const loop = createLoop({ step: onStep, render: onRender });
  paint();
  try { sound.playNotes(JINGLE); } catch { /* sound is optional */ }
  loop.start();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      loop.stop(); detach(); ro.disconnect();
      document.removeEventListener('visibilitychange', onHidden);
      root.replaceChildren(); root.hidden = true;
    },
    /** For previews and tests: jump to a screen, optionally after a demo run of `seconds` driven by the bot. */
    dev: {
      get flow() { return flow; },
      get game() { return game; },
      go(name, seconds = 0, bot = true, gameId = 'train', shot = '') {
        if (name === 'select') dispatch({ type: 'start' });
        if (name === 'play' || name === 'pause' || name === 'over' || name === 'win') {
          dispatch({ type: 'start' }); startRun(gameId);
          const A = ADAPTERS[gameId];
          for (let i = 0; i < seconds * 60; i++) { if (bot) A.bot(game); A.step(game, 1000 / 60); clock += 1000 / 60; }
          if (shot && SHOTS[gameId + ':' + shot]) for (let i = 0; i < 30000 && !game.over && !SHOTS[gameId + ':' + shot](game); i++) { A.bot(game); A.step(game, 1000 / 60); clock += 1000 / 60; }
          if (seconds > 0) frozen = true;                          // a preview keeps the frame it was made for
          if (name === 'pause') dispatch({ type: 'pause' });
          if (name === 'over') { game.lives = 0; game.over = true; finishRun(); }
          if (name === 'win') { for (let i = 0; i < 60 * 400 && !game.over; i++) { A.bot(game); A.step(game, 1000 / 60); clock += 1000 / 60; } frozen = true; finishRun(); }
        }
      },
    },
  };
}
