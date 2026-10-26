// Sky show demo page (show.html): the HD-2D plaza at night, and when a show starts the camera tilts up until a horizon band of night sky
// appears at the top of the screen. The show itself is a pure function of (seed, t) (see fireworks.js, meteors.js, drones.js).
//   ?show=fireworks|meteors|drones   start a show      &t=3.2   show time in seconds (with still=1: that exact frame)
//   &seed=5   the show's seed       &still=1   one deterministic frame, then stop (document.title becomes "ready")
//   &bench=1  time 120 frames       &res=0.75  scales the internal resolution
import { TILE } from '../map.js';
import { drawPet, loadSprites } from '../sprites.js';
import { cameraFor, project, sortBackToFront, snapScale, visibleTiles } from '../hd2d/camera.js';
import { approach, lightAt, nightMultiply } from '../hd2d/light.js';
import { buildWorld, bakeGround, drawGround, standingItems, drawGlows, fountainItem, grade } from '../hd2d/scene.js';
import { Wanderer, rng } from '../hd2d/wander.js';
import { createShowFx } from './fx.js';
import { SHOWS, tiltAt, showEnd, showCamera, horizonY, FALL } from './timeline.js';
import { makeStars, drawSky, pixelUnit, LAND } from './sky.js';
import { skyAt } from './layers.js';
import { drawBursts, drawRockets, drawMeteors, drawDrones } from './draw.js';
import { smooth } from './rand.js';
import { burstTint } from './tint.js';

const q = new URLSearchParams(location.search);
const still = q.get('still') === '1', bench = q.get('bench') === '1';
const SEED = Number(q.get('seed')) || 7;
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');
const RES = Math.min(1.5, Math.max(0.4, Number(q.get('res')) || 1));
const CAST = [['Mochi', 'cat', 2, ['tophat', '', '', ''], 21, 24], ['Luna', 'seal', 1, ['', '', '', ''], 27, 18], ['Rana', 'frog', 2, ['', '', '', ''], 24, 24], ['Nube', 'cat', 0, ['', '', '', ''], 19, 20], ['Coco', 'seal', 2, ['', '', '', ''], 29, 23]];
const BOX = { x0: 14, y0: 13, x1: 33, y1: 29 };
const FOLLOW_BOX = { x0: 20, y0: 20, x1: 28, y1: 24 };

let sprites, world, ground, fx, stars, view = { w: 0, h: 0 }, groundKey = '', pets = [], focus = { x: 24 * TILE, y: 21.5 * TILE };
let show = null;                                                        // { kind, start (ms on the page clock), cut (show seconds) }
const tmp = Object.assign(document.createElement('canvas'), { width: 48, height: 48 }), tctx = tmp.getContext('2d');
const stat = { ema: 0, frames: 0, last: 0 };

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * RES;
  const w = Math.round(Math.min(innerWidth * dpr, 1280 * RES)), h = Math.round(w * (innerHeight / innerWidth));
  if (w === view.w && h === view.h) return;
  view = { w, h }; canvas.width = w; canvas.height = h;
  fx = createShowFx(w, h);
}

const headFrame = (e, now) => (((now + e.id.charCodeAt(0) * 397) % 3400) < 130 ? 'blink' : 'idle');

function petItem(e, cam, now, flashes, watching) {
  const p = e.walker.pos();
  const wx = p.x * TILE + TILE / 2, wy = p.y * TILE + TILE;
  const g = project(cam, wx, wy);
  if (!g) return null;
  const moving = e.walker.moving, k = moving ? Math.min(1, e.walker.t / e.walker.stepMs()) : 0;
  const hop = moving ? Math.round(Math.abs(Math.sin(k * Math.PI)) * 3) : 0;
  const tint = flashes.length ? burstTint(flashes, wx) : null;
  return { depth: g.depth, order: 1, draw: (c) => {
    const s = snapScale(g.scale), cx = Math.round(g.x), cy = Math.round(g.y);
    c.save(); c.translate(cx, cy - s); c.scale(1, Math.max(0.3, cam.sin) * 0.5);
    for (const [r, a] of [[11, 0.16], [8.5, 0.2], [6, 0.24]]) { c.fillStyle = `rgba(8,10,30,${a * (1 - hop * 0.1)})`; c.beginPath(); c.arc(0, 0, r * s, 0, 6.2832); c.fill(); }
    c.restore();
    tctx.clearRect(0, 0, 48, 48);
    const flap = moving && Math.floor(now / 140) % 2 === 1;
    // watching the show: facing the camera (never flipped), still, a little hop at each burst
    const jump = watching && flashes.length ? Math.round(flashes[0].k * 2) : 0;
    drawPet(tctx, sprites, e.look, 8, 12 - hop - jump, { frame: headFrame(e, now), flip: !watching && e.walker.d === 'right', flap, now });
    grade(tctx, tmp, 1, lightAt(world.lights, wx, wy));
    if (tint) { tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = `rgba(${tint.r | 0},${tint.g | 0},${tint.b | 0},${tint.a})`; tctx.fillRect(0, 0, 48, 48); tctx.globalCompositeOperation = 'source-over'; }
    c.drawImage(tmp, 0, 0, 48, 48, cx - 24 * s, cy - 42 * s, 48 * s, 48 * s);
  } };
}

function follow(dt, jump = false) {
  const ps = pets.map((e) => e.walker.pos()), lead = ps[0];
  const mx = ps.reduce((a, p) => a + p.x, 0) / ps.length, my = ps.reduce((a, p) => a + p.y, 0) / ps.length;
  const tx = Math.min(FOLLOW_BOX.x1 * TILE, Math.max(FOLLOW_BOX.x0 * TILE, (lead.x * 0.55 + mx * 0.45) * TILE + 8));
  const ty = Math.min(FOLLOW_BOX.y1 * TILE, Math.max(FOLLOW_BOX.y0 * TILE, (lead.y * 0.55 + my * 0.45) * TILE + 8));
  const k = jump ? 1 : 1 - Math.exp(-dt / 700);
  focus.x += (tx - focus.x) * k; focus.y += (ty - focus.y) * k;
}

/** Pets keep wandering; while a show plays they finish the step they are on, then stand still and watch. */
function stepPets(dt, watching) {
  const vis = visibleTiles(cameraFor(view.w, view.h, focus.x, focus.y, 1), view.w, view.h);
  const fxT = Math.round(focus.x / TILE), fyT = Math.round(focus.y / TILE);
  const box = {
    x0: Math.max(BOX.x0, vis ? vis.x0 : fxT - 3), x1: Math.min(BOX.x1, vis ? vis.x1 : fxT + 3),
    y0: Math.max(BOX.y0, vis ? vis.y0 : fyT - 3), y1: Math.min(BOX.y1, vis ? vis.y1 : fyT + 3),
  };
  for (const p of pets) { p.box = box; if (watching) p.walker.update(dt); else p.update(dt); }
}

/** Draws one frame at page time `now` ms, the show being at `ts` seconds (null: no show). Returns the number of bursts on screen. */
function frame(now, ts) {
  const dur = show ? SHOWS[show.kind].dur : 0, cut = show && show.cut != null ? show.cut : Infinity;
  const k = show ? tiltAt(ts, dur, cut) : 0;
  const alpha = show && cut !== Infinity ? 1 - smooth((ts - cut) / FALL) : 1;
  const cam = showCamera(view.w, view.h, focus.x, focus.y, k), u = pixelUnit(view.h), hy = horizonY(cam);
  const wf = Math.floor(now / 320) % 3, key = String(wf);
  if (key !== groundKey) { bakeGround(world, 1, nightMultiply(1), wf, ground); groundKey = key; }
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = `rgb(${LAND})`; ctx.fillRect(0, 0, view.w, view.h);
  const sky = show ? skyAt(show.kind, SEED, ts) : skyAt('', SEED, 0);
  drawSky(ctx, view, hy, now / 1000, stars, u, project(cam, focus.x, 0, 0)?.y);
  if (show) {
    drawMeteors(ctx, sky.meteors, view, hy, u, alpha);
    drawBursts(ctx, cam, sky.fw, u, alpha);
  }
  drawGround(ctx, ground, cam, view.w, view.h);
  const edge = project(cam, focus.x, 0, 0);                              // the north edge of the baked plaza fades into the dark land beyond it
  if (edge && hy > 0 && edge.y > hy) {
    const g = ctx.createLinearGradient(0, edge.y - 2, 0, edge.y + 44 * u * 0.5);
    g.addColorStop(0, `rgba(${LAND},1)`); g.addColorStop(1, `rgba(${LAND},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, edge.y - 2, view.w, 44 * u * 0.5 + 2);
  }
  const items = standingItems(world, cam, 1, view), jet = fountainItem(cam, 1, now, view);
  if (jet) items.push(jet);
  const watching = k > 0.02, flashes = sky.fw.flashes.filter((f) => f.k > 0.02);
  for (const e of pets) { const it = petItem(e, cam, now, flashes, watching); if (it) items.push(it); }
  for (const it of sortBackToFront(items)) it.draw(ctx);
  drawGlows(ctx, world, cam, 1, now);
  if (show) { drawRockets(ctx, cam, sky.fw, u, alpha); drawDrones(ctx, cam, sky.drones, u, alpha); }
  ctx.save();                                                          // each burst lights the whole plaza with its colour (additive, widest across the ground)
  ctx.globalCompositeOperation = 'lighter';
  const share = 1 / Math.max(1, Math.sqrt(flashes.length * 0.7));
  for (const f of flashes) {
    const p = project(cam, f.x, f.y, f.z);
    if (!p) continue;
    const cy = Math.max(hy, 0) + (view.h - Math.max(hy, 0)) * 0.7, r = view.w * 0.62;
    ctx.save(); ctx.translate(p.x, cy); ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${f.c[0]},${f.c[1]},${f.c[2]},${0.17 * f.k * alpha * share})`); g.addColorStop(1, `rgba(${f.c[0]},${f.c[1]},${f.c[2]},0)`);
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
  }
  ctx.restore();
  const boost = Math.min(1, flashes.reduce((a, f) => a + f.k, 0) * 0.3) * alpha;
  fx.apply(ctx, 1, 1, boost);
  return flashes.length;
}

function setUi() {
  for (const id of Object.keys(SHOWS)) $(id).setAttribute('aria-pressed', String(!!show && show.kind === id && show.cut == null));
  $('back').disabled = !show || show.cut != null;
}

function start(kind, now) { show = { kind, start: now, cut: null }; setUi(); }
const showTime = (now) => (now - show.start) / 1000;

async function main() {
  sprites = await loadSprites();
  world = buildWorld();
  ground = Object.assign(document.createElement('canvas'), { width: world.tex.width, height: world.tex.height });
  stars = makeStars(SEED);
  const rand = rng(still || bench ? 7 : (Date.now() & 0xffff) + 1);
  pets = CAST.filter((c) => c[3].every((i) => !i || sprites.catalogue[i])).map(([id, species, stage, items, x, y]) => new Wanderer(id, { species, stage, items }, x, y, BOX, rand));
  resize(); addEventListener('resize', resize);
  focus = { x: pets[0].walker.tileX * TILE + 8, y: pets[0].walker.tileY * TILE + 8 };
  const startLive = (kind) => () => start(kind, performance.now());
  for (const kind of Object.keys(SHOWS)) $(kind).onclick = startLive(kind);
  $('back').onclick = () => { if (show && show.cut == null) { show.cut = Math.max(0, showTime(performance.now())); setUi(); } };
  const kind = q.get('show'), t0 = Number(q.get('t')) || 0;
  if (still || bench) {
    for (let i = 0; i < 270; i++) { follow(33); stepPets(33, false); }
    follow(33, true);
    if (SHOWS[kind]) { show = { kind, start: 0, cut: q.get('cut') != null ? Number(q.get('cut')) : null }; }
    setUi();
  }
  if (still) {
    const paint = (left) => { try { frame(9000, t0); } catch (e) { document.title = `error: ${e.message}`; throw e; } if (left) requestAnimationFrame(() => paint(left - 1)); else document.title = 'ready'; };
    paint(3);
    return;
  }
  if (bench) {
    const times = [];
    for (let i = 0; i < 150; i++) { const ts = t0 + i / 30; stepPets(33, true); follow(33); const a = performance.now(); frame(i * 33, ts); ctx.getImageData(0, 0, 1, 1); times.push(performance.now() - a); }
    const run = times.slice(30).sort((a, b) => a - b), avg = run.reduce((s, v) => s + v, 0) / run.length;
    document.body.setAttribute('data-bench', `${view.w}x${view.h} show=${kind} t=${t0}..${(t0 + 5).toFixed(1)} avg=${avg.toFixed(2)}ms p50=${run[run.length >> 1].toFixed(2)}ms p95=${run[Math.floor(run.length * 0.95)].toFixed(2)}ms`);
    document.title = 'ready';
    return;
  }
  setUi();
  if (SHOWS[kind]) start(kind, performance.now() - t0 * 1000);
  const label = $('stat');
  const loop = (now) => {
    const dt = Math.min(100, stat.last ? now - stat.last : 16);
    stat.last = now;
    let ts = 0;
    if (show) {
      ts = showTime(now);
      const dur = SHOWS[show.kind].dur;
      if (ts >= showEnd(dur, show.cut == null ? Infinity : show.cut)) { show = null; setUi(); ts = 0; }
    }
    follow(dt); stepPets(dt, !!show);
    const a = performance.now();
    frame(now, ts);
    stat.ema += (performance.now() - a - stat.ema) * 0.08;
    if (++stat.frames % 20 === 0) label.textContent = `${stat.ema.toFixed(1)} ms/frame · ${view.w}×${view.h}${show ? ` · ${show.kind} ${ts.toFixed(1)}s` : ''}`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
main().catch((e) => { document.title = `error: ${e.message}`; console.error(e); });
