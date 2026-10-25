// HD-2D lite prototype page (hd2d.html): the plaza seen through a tilted camera, upright sprites, night lamps, bloom, vignette, tilt-shift.
//   ?mode=day|night   the light (default night)      &fx=1|0   effects on / off (off = the flat view, no post effects)
//   &still=1          one deterministic frame, then stop (document.title becomes "ready")        &bench=1   time 120 frames, print the result
//   &res=0.75         scales the internal resolution
import { TILE } from '../map.js';
import { drawPet, CELL, loadSprites } from '../sprites.js';
import { cameraFor, project, depthOf, sortBackToFront } from './camera.js';
import { approach } from './light.js';
import { lightAt } from './light.js';
import { buildWorld, bakeGround, drawGround, standingItems, drawGlows, fountainItem, grade } from './scene.js';
import { createFx } from './fx.js';
import { Wanderer, rng } from './wander.js';

const q = new URLSearchParams(location.search);
const still = q.get('still') === '1', bench = q.get('bench') === '1';
const state = { night: q.get('mode') === 'day' ? 0 : 1, nightTarget: q.get('mode') === 'day' ? 0 : 1, tilt: q.get('fx') === '0' ? 0 : 1, tiltTarget: q.get('fx') === '0' ? 0 : 1 };
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');
const RES = Math.min(1.5, Math.max(0.4, Number(q.get('res')) || 1));
const CAST = [['Mochi', 'cat', 2, ['tophat', '', '', ''], 21, 24], ['Luna', 'seal', 1, ['', '', '', ''], 27, 18], ['Rana', 'frog', 2, ['', '', '', ''], 24, 24], ['Nube', 'cat', 0, ['', '', '', ''], 19, 20], ['Coco', 'seal', 2, ['', '', '', ''], 29, 23]];
const BOX = { x0: 14, y0: 13, x1: 33, y1: 29 };
const FOLLOW_BOX = { x0: 20, y0: 20, x1: 28, y1: 24 };                 // the camera's focus stays here so the view never leaves the baked region

let sprites, world, ground, fx, view = { w: 0, h: 0 }, groundKey = '', pets = [], focus = { x: 24 * TILE, y: 21.5 * TILE };
const tmp = Object.assign(document.createElement('canvas'), { width: 48, height: 48 }), tctx = tmp.getContext('2d');
const stat = { ema: 0, frames: 0, last: 0 };

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * RES;
  let w = Math.round(Math.min(innerWidth * dpr, 1280 * RES)), h = Math.round(w * (innerHeight / innerWidth));
  if (w === view.w && h === view.h) return;
  view = { w, h };
  canvas.width = w; canvas.height = h;
  fx = createFx(w, h);
}

const headFrame = (e, now) => {
  if (e.walker.moving && (e.walker.d === 'left' || e.walker.d === 'right')) return 'look';
  return ((now + e.id.charCodeAt(0) * 397) % 3400) < 130 ? 'blink' : 'idle';
};

function petItem(e, cam, n, now) {
  const p = e.walker.pos();
  const wx = p.x * TILE + TILE / 2, wy = p.y * TILE + TILE;
  const g = project(cam, wx, wy);
  if (!g) return null;
  const k = e.walker.moving ? Math.min(1, e.walker.t / e.walker.stepMs()) : 0;
  const hop = e.walker.moving ? Math.round(Math.abs(Math.sin(k * Math.PI)) * 3) : 0;
  return { depth: g.depth, order: 1, draw: (c) => {
    const s = g.scale, cx = g.x, cy = g.y;
    const sh = c.globalAlpha;                                           // the soft ground shadow: flattened by the tilt, fading as the pet hops
    c.save(); c.translate(cx, cy - s); c.scale(1, Math.max(0.3, cam.sin) * 0.5);
    for (const [r, a] of [[11, 0.16], [8.5, 0.2], [6, 0.24]]) { c.fillStyle = `rgba(8,10,30,${a * (1 - hop * 0.1)})`; c.beginPath(); c.arc(0, 0, r * s, 0, 6.2832); c.fill(); }
    c.restore(); c.globalAlpha = sh;
    tctx.clearRect(0, 0, 48, 48);
    const flap = e.walker.moving && Math.floor(now / 140) % 2 === 1;
    drawPet(tctx, sprites, e.look, 8, 12 - hop, { frame: headFrame(e, now), flip: e.walker.d === 'right', flap });
    if (n > 0.02) grade(tctx, tmp, n, lightAt(world.pools, wx, wy));        // night: the veil, and the warm wash where a lamp reaches
    c.drawImage(tmp, 0, 0, 48, 48, cx - 24 * s, cy - 42 * s, 48 * s, 48 * s);
  } };
}

/** The whole ground shadow pass needs sprites sorted with it, so shadows ride inside each pet item. */
function frame(now, dt) {
  state.night = approach(state.night, state.nightTarget, dt);
  state.tilt = approach(state.tilt, state.tiltTarget, dt, 1.6);
  const n = state.night, t = state.tilt;
  const lead = pets[0].walker.pos();
  const tx = Math.min(FOLLOW_BOX.x1 * TILE, Math.max(FOLLOW_BOX.x0 * TILE, lead.x * TILE + 8)), ty = Math.min(FOLLOW_BOX.y1 * TILE, Math.max(FOLLOW_BOX.y0 * TILE, lead.y * TILE + 8));
  const k = still ? 1 : 1 - Math.exp(-dt / 700);                        // the camera slowly follows the first pet
  focus.x += (tx - focus.x) * k; focus.y += (ty - focus.y) * k;
  const cam = cameraFor(view.w, view.h, focus.x, focus.y, t);

  const nq = Math.round(n * 16), wf = Math.floor(now / 320) % 3, key = `${nq}:${wf}`;
  if (key !== groundKey) { bakeGround(world, nq / 16, wf, ground); groundKey = key; }
  ctx.imageSmoothingEnabled = false;
  const bg = [Math.round(30 - 20 * n), Math.round(48 - 34 * n), Math.round(44 - 20 * n)];
  ctx.fillStyle = `rgb(${bg})`; ctx.fillRect(0, 0, view.w, view.h);
  drawGround(ctx, ground, cam, view.w, view.h);

  const items = standingItems(world, cam, n, view);
  const jet = fountainItem(cam, n, now, view);
  if (jet) items.push(jet);
  for (const e of pets) { const it = petItem(e, cam, n, now); if (it) items.push(it); }
  for (const it of sortBackToFront(items)) it.draw(ctx);
  drawGlows(ctx, world, cam, n, now);
  fx.apply(ctx, t, n);
}

function setUi() {
  for (const [id, on] of [['day', state.nightTarget === 0], ['night', state.nightTarget === 1], ['fx', state.tiltTarget === 1]]) { $(id).setAttribute('aria-pressed', String(on)); }
}

async function main() {
  sprites = await loadSprites();
  world = buildWorld();
  ground = Object.assign(document.createElement('canvas'), { width: world.tex.width, height: world.tex.height });
  const rand = rng(still || bench ? 7 : (Date.now() & 0xffff) + 1);
  pets = CAST.filter((c) => c[3].every((i) => !i || sprites.catalogue[i])).map(([id, species, stage, items, x, y]) => new Wanderer(id, { species, stage, items }, x, y, BOX, rand));
  resize(); addEventListener('resize', resize);
  focus = { x: pets[0].walker.tileX * TILE + 8, y: pets[0].walker.tileY * TILE + 8 };
  $('day').onclick = () => { state.nightTarget = 0; setUi(); };
  $('night').onclick = () => { state.nightTarget = 1; setUi(); };
  $('fx').onclick = () => { state.tiltTarget = state.tiltTarget ? 0 : 1; setUi(); };
  setUi();
  if (still) {                                                          // a deterministic frame: simulate 9 seconds, then draw once
    state.tilt = state.tiltTarget;
    for (let i = 0; i < 270; i++) for (const p of pets) p.update(33);
    const paint = (left) => { try { frame(9000, 33); } catch (e) { document.title = `error: ${e.message}`; throw e; } if (left) requestAnimationFrame(() => paint(left - 1)); else document.title = 'ready'; };   // a few frames, so the browser presents the canvas before a screenshot
    paint(3);
    return;
  }
  if (bench) {
    state.tilt = state.tiltTarget;
    const times = [];
    for (let i = 0; i < 150; i++) { for (const p of pets) p.update(33); const a = performance.now(); frame(i * 33, 33); ctx.getImageData(0, 0, 1, 1); times.push(performance.now() - a); }
    const run = times.slice(30).sort((a, b) => a - b), avg = run.reduce((s, v) => s + v, 0) / run.length;
    document.body.setAttribute('data-bench', `${view.w}x${view.h} fx=${state.tilt} night=${state.night} avg=${avg.toFixed(2)}ms p50=${run[run.length >> 1].toFixed(2)}ms p95=${run[Math.floor(run.length * 0.95)].toFixed(2)}ms`);
    document.title = 'ready';
    return;
  }
  const label = $('stat');
  const loop = (now) => {
    const dt = Math.min(100, stat.last ? now - stat.last : 16);
    stat.last = now;
    for (const p of pets) p.update(dt);
    const a = performance.now();
    frame(now, dt);
    stat.ema += (performance.now() - a - stat.ema) * 0.08;
    if (++stat.frames % 20 === 0) label.textContent = `${stat.ema.toFixed(1)} ms/frame · ${view.w}×${view.h}`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
main().catch((e) => { document.title = `error: ${e.message}`; console.error(e); });
