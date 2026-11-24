// The town's HD-2D renderer: the outdoor town seen through the tilted camera (see camera.js), with the same interface as the flat
// renderer in render.js ({ resize, draw, pointToTile }). createTownRenderer wraps both: the outdoors (town, farm) is HD-2D, interiors (and
// ?flat=1, and the player's "Efectos" switch) use the flat one.
import { TILE, SIGNS, PLACES, getArea } from '../map.js';
import { createRenderer, drawBubble, MIN_VIEW_H, VIEW_H } from '../render.js';
import { drawText, textWidth, textCanvas } from '../font.js';
import { badge, bobY, BADGE } from '../art/icons.js';
import { cameraFor, PHONE_OUT, followFocus, followMargin, snapFocus, sortBackToFront, screenToTile, standAt, project } from './camera.js';
import { groundMult, approach } from './light.js';
import { buildWorld, bakeGround, drawGround, standingItems, drawGlows, fountainItem, paintFarm, decorItems, drawDecorGlows, drawGhosts } from './scene.js';
import { createFx } from './fx.js';
import { createGlLayer } from './gl.js';
import { createGovernor, encodeLevel, decodeLevel } from './quality.js';
import { createPetPainter } from './pets.js';
import { createThings } from './things.js';
import { SHOWS, RISE, FALL, tiltAt, showCamera, horizonY } from '../show/timeline.js';
import { makeStars, drawSky, pixelUnit, LAND } from '../show/sky.js';
import { drawChristmas } from '../show/draw-christmas.js';
import { seasonDecor } from '../art/decor.js';
import { drawBursts, drawRockets, drawMeteors, drawDrones, drawHalloween } from '../show/draw.js';
import { skyAt } from '../show/layers.js';
import { burstTint } from '../show/tint.js';
import { createShowFx } from '../show/fx.js';
import { smooth } from '../show/rand.js';
import { drawSnow } from '../snow.js';

const SHOW_FOCUS = { x: 24 * TILE, y: 21.5 * TILE };                     // the show's own frame: its bursts and drones are placed as seen from here
const BADGE_LIFT = 60;                                                  // a place's badge floats this high over the ground point under it

/** The HD-2D renderer of the outdoor town. `compact` (a phone) frames the view tighter, but shows 1.25 times more of the world than it used to (PHONE_OUT). */
const LEVEL_KEY = 'city.hd2d.level';
const savedLevel = () => { try { return decodeLevel(localStorage.getItem(LEVEL_KEY)); } catch { return 0; } };
const saveLevel = (v) => { try { localStorage.setItem(LEVEL_KEY, encodeLevel(v)); } catch { /* private mode */ } };

export function createHdRenderer({ canvas, sprites, font, compact = false, onQuality = () => {}, skip = new Set(), gl = false }) {      // skip: parts left out to measure their cost (?perf=1&skip=suelo,cosas,efectos,textos)
  const ctx = canvas.getContext('2d');
  let glr = null;                                                                    // ?gl=1: the ground and the sprites go through WebGL (gl.js); null = plain canvas 2D, also when WebGL is not there
  if (gl) { try { glr = createGlLayer(); } catch { glr = null; } }
  const ref = compact ? 170 : 230, out = compact ? PHONE_OUT : 1;
  const painter = createPetPainter(sprites);
  const things = createThings();
  let darkCanvas = null;
  let world = null, ground = null, fx = null, box = null, areaName = 'town';
  const worlds = new Map();                                                         // one baked world per outdoor area, built the first time it is visited
  let view = { w: 0, h: 0 }, cam = null, focus = null, last = null, ui = 2, hits = [];
  let groundKey = '', waterFrame = -1;
  let inset = { top: 0, bottom: 0 };                                                // css px the bar (top) and the emotes row (bottom) cover: the pet is kept clear of them
  let showFx = null, kShow = 0, stars = null, starsSeed = null;
  const gov = createGovernor({ start: savedLevel(), allowFlat: false });            // slow frames only lower the quality: the view never falls back to flat by itself (owner 2026-11-24); a crash still does
  const stat = { ms: 0, dt: 33, build: 0, parts: { ground: 0, items: 0, fx: 0, overlay: 0 } };                                         // moving averages: the cost of drawing a frame, and the time between frames

  function resize(b) {
    box = b;
    const res = gov.settings.res, dpr = Math.min(b.dpr, 1.5) * res;
    const w = Math.max(2, Math.round(Math.min(b.w * dpr, 1280 * res))), h = Math.max(2, Math.round((w * b.h) / b.w));
    if (w !== view.w || h !== view.h) { view = { w, h }; fx = createFx(w, h); showFx = null; }
    canvas.width = w; canvas.height = h;
    canvas.style.width = `${b.w}px`; canvas.style.height = `${b.h}px`;
    canvas.style.imageRendering = res < 1 ? 'auto' : '';                    // below full size a whole-number step is gone: smooth is better than uneven pixels
    groundKey = '';
  }

  /** The world and the ground canvas of the area on screen (the town or the farm); another area starts with a fresh camera and ground. */
  function ensureWorld(name) {
    prepare(name);
    if (name !== areaName || !world) { const changed = !!world; areaName = name; focus = null; groundKey = ''; if (changed) gov.reset(); }      // the build and the first bake of a new area are not the view's fault
    ({ world, ground } = worlds.get(name));
  }

  /** Builds the world and ground canvas of an area if it is not built yet. */
  function prepare(name) {
    if (worlds.has(name)) return;
    const t0 = performance.now(), w = buildWorld(name);
    worlds.set(name, { world: w, ground: Object.assign(document.createElement('canvas'), { width: w.tex.width, height: w.tex.height }) });
    stat.build = Math.max(stat.build, Math.round(performance.now() - t0));
  }

  /** Once the town has run a while, builds the farm in idle time so the pet does not wait for it at the gate. Never throws into the frame loop. */
  let frames = 0, warming = false;
  function warmFarm() {
    if (warming || ++frames < 90 || worlds.has('farm') || typeof document === 'undefined') return;
    warming = true;
    const job = () => { try { prepare('farm'); } catch { /* it is built on demand later */ } };
    try { if (typeof requestIdleCallback === 'function') requestIdleCallback(job, { timeout: 4000 }); else setTimeout(job, 1500); } catch { /* no timers: on demand */ }
  }

  /** The canvas takes this renderer's layout again (the town after an interior, or the switch turned on). */
  function activate(b) { focus = null; last = null; resize(b); }

  function draw(state, now) {
    ensureWorld(state.area || 'town');
    if (areaName === 'town') warmFarm();
    const MAP_W = world.tex.width, MAP_H = world.tex.height;
    const raw = last == null ? 0 : now - last, dt = last == null ? 16 : Math.min(100, Math.max(0, raw));
    last = now;
    const t0 = performance.now();
    const verdict = raw > 0 ? gov.push(raw) : null;
    if (raw > 0 && raw < 1500) stat.dt += (Math.min(raw, 150) - stat.dt) * 0.05;
    if (verdict === 'down') { saveLevel(gov.level); resize(box); onQuality({ kind: 'down', level: gov.level }); }
    else if (verdict === 'flat') onQuality({ kind: 'flat' });
    const amb = state.amb || { tint: [255, 255, 255], night: 0 };

    const sh = state.show || null;                                        // a scheduled sky show: the camera tilts up, the town goes night, the show fills the sky
    const dur = sh ? sh.dur ?? SHOWS[sh.kind].dur : 0, cutS = sh && sh.cut != null ? sh.cut : Infinity;
    kShow = approach(kShow, sh ? tiltAt(sh.ts, dur, cutS) : 0, dt, 1 / RISE);   // a player who joins mid-show sees the camera rise, not jump
    const k = kShow, alpha = sh && cutS !== Infinity ? 1 - smooth((sh.ts - cutS) / FALL) : 1;
    const n = Math.max(amb.night, k), mult = groundMult({ tint: amb.tint, night: n });

    const mp = state.me.walker.pos();                                   // the camera follows the player (see followFocus for the edges of the map)
    const probe = cameraFor(view.w, view.h, MAP_W / 2, MAP_H / 2, 1, { ref, out });
    const t = followFocus(view.w, view.h, mp.x * TILE + TILE / 2, mp.y * TILE + TILE, MAP_W, MAP_H, { ref, out }, followMargin(box ? box.h : 0, inset.top, inset.bottom));
    const tx = t.x, ty = t.y;
    if (!focus) focus = { x: tx, y: ty };
    else { const kf = 1 - Math.exp(-dt / 140); focus.x += (tx - focus.x) * kf; focus.y += (ty - focus.y) * kf; }
    const [fxp, fyp] = snapFocus(probe, focus.x, focus.y);
    cam = k > 0.001 ? showCamera(view.w, view.h, fxp, fyp, k, { ref, out }) : cameraFor(view.w, view.h, fxp, fyp, 1, { ref, out });
    ui = Math.max(1, Math.round((cam.focal / cam.dist) * 0.6));
    const scam = { ...cam, focusX: SHOW_FOCUS.x, focusY: SHOW_FOCUS.y };    // the show's bursts and drones are placed in the show's own frame
    const u = pixelUnit(view.h), hy = horizonY(cam);
    if (sh && (!stars || starsSeed !== sh.seed)) { stars = makeStars(sh.seed); starsSeed = sh.seed; }
    if (k > 0.001 && !stars) stars = makeStars(7);
    const sky = sh ? skyAt(sh.kind, sh.seed, sh.ts, dur) : skyAt('', 0, 0);
    const flashes = sky.fw.flashes.filter((f) => f.k > 0.02);

    if (state.area === 'farm' && paintFarm(world, state.farm)) groundKey = '';        // a plot's soil changed (watered, or a new day): bake the ground again
    const step = k > 0.001 && k < 0.999 ? 8 : 16, nq = Math.round(n * step) * (16 / step), key = `${nq}|${mult.map((c) => c >> 2)}`, wf = Math.floor(now / 320) % 3;
    if (key !== groundKey) { bakeGround(world, nq / 16, mult, wf, ground); groundKey = key; waterFrame = wf; if (glr) glr.dirty(ground); }
    else if (wf !== waterFrame) { bakeGround(world, nq / 16, mult, wf, ground, world.waterRects); waterFrame = wf; if (glr) glr.dirty(ground); }
    const useGl = !!glr && glr.ok;                                       // a lost WebGL context leaves the frame to canvas 2D
    if (useGl) glr.startFrame();

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = k > 0.02 ? `rgb(${LAND})` : `rgb(${Math.round(30 - 20 * n)},${Math.round(48 - 34 * n)},${Math.round(44 - 20 * n)})`;
    ctx.fillRect(0, 0, view.w, view.h);
    if (hy > 0 && stars) drawSky(ctx, view, hy, now / 1000, stars, u, project(cam, focus.x, 0, 0)?.y, !(sky.hw?.moon || sky.xm?.star));
    if (sh) { drawMeteors(ctx, sky.meteors, view, hy, u, alpha); if (sky.hw) drawHalloween(ctx, sky.hw, view, hy, u, alpha); if (sky.xm) drawChristmas(ctx, sky.xm, view, hy, u, alpha); drawBursts(ctx, scam, sky.fw, u, alpha); }
    if (!skip.has('suelo')) {
      if (useGl) { drawGround(glr.begin(ctx).ctx, ground, cam, view.w, view.h, gov.settings.rowStep); glr.flush(); }
      else drawGround(ctx, ground, cam, view.w, view.h, gov.settings.rowStep);
    }
    const edge = project(cam, focus.x, 0, 0);                              // the north edge of the map fades into the dark land beyond it
    if (k > 0.02 && edge && hy > 0 && edge.y > hy) {
      const g = ctx.createLinearGradient(0, edge.y - 2, 0, edge.y + 44 * u * 0.5);
      g.addColorStop(0, `rgba(${LAND},1)`); g.addColorStop(1, `rgba(${LAND},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, edge.y - 2, view.w, 44 * u * 0.5 + 2);
    }
    const tGround = performance.now();
    things.rings(ctx, state, cam);
    if (state.marker && now < state.marker.until) drawMarker(state.marker);

    const items = standingItems(world, cam, n, view);
    const jet = world.fountain ? fountainItem(cam, n, now, view) : null;
    if (jet) items.push(jet);
    const decor = seasonDecor(world.name, state.seasons);                   // the decorations of every season that is on
    if (decor.length) items.push(...decorItems(world, cam, n, view, decor));
    const gifts = state.gifts && state.gifts.length ? state.gifts : null;     // the seasonal gifts lying about (src/gift-world.js), drawn like the decorations
    if (gifts) items.push(...decorItems(world, cam, n, view, gifts));
    const ent = { cam, n, now, world, me: state.me, view, wash: flashes.length ? (wx) => burstTint(flashes, wx) : null };
    items.push(...things.items(state, ent, now));
    for (const e of [state.me, ...state.others]) { const it = painter.item(e, ent); if (it) items.push(it); }
    const ov = { labels: [], bubbles: [], hits: [] };
    if (!skip.has('cosas')) {
      if (useGl) {                                                          // the sprites are recorded as quads in depth order; an item that paints with fills or gradients is drawn on the 2D canvas in its place
        const rec = glr.begin(ctx);
        for (const it of sortBackToFront(items)) { it.draw(rec.ctx, ov); rec.endItem(); }
        glr.flush();
      } else for (const it of sortBackToFront(items)) it.draw(ctx, ov);
    }
    things.air(ctx, state, cam, now, view);
    drawGlows(ctx, world, cam, n, now, view);
    if (decor.length) drawDecorGlows(ctx, world, cam, n, now, view, decor);
    if (gifts) drawDecorGlows(ctx, world, cam, n, now, view, gifts);
    if (state.ghosts && state.ghosts.length) drawGhosts(ctx, state.ghosts, cam, view);
    if (state.snow && k < 0.05) drawSnow(ctx, view.w, view.h, now, amb.night, Math.max(1, Math.round(pixelUnit(view.h) / 2)));      // December snow (src/snow.js), stronger at night; not while the sky show has the camera
    if (sh) {
      drawRockets(ctx, scam, sky.fw, u, alpha); drawDrones(ctx, scam, sky.drones, u, alpha);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';              // each burst lights the whole view with its colour (additive, widest across the ground)
      const share = 1 / Math.max(1, Math.sqrt(flashes.length * 0.7));
      for (const f of flashes) {
        const p = project(scam, f.x, f.y, f.z);
        if (!p) continue;
        const cy = Math.max(hy, 0) + (view.h - Math.max(hy, 0)) * 0.7, r = view.w * 0.62;
        ctx.save(); ctx.translate(p.x, cy); ctx.scale(1, 0.5);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(${f.c[0]},${f.c[1]},${f.c[2]},${0.17 * f.k * alpha * share})`); g.addColorStop(1, `rgba(${f.c[0]},${f.c[1]},${f.c[2]},0)`);
        ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
      }
      ctx.restore();
    }
    const tItems = performance.now();
    if (k > 0.02) {                                                       // the show's own effects: a sharper sky, the bloom pushed up while a burst is on screen
      showFx = showFx || createShowFx(view.w, view.h);
      showFx.apply(ctx, 1, n, Math.min(1, flashes.reduce((a, f) => a + f.k, 0) * 0.3) * alpha, gov.settings);
    } else if (!skip.has('efectos')) fx.apply(ctx, 1, n, gov.settings);
    const tFx = performance.now();
    if (!skip.has('textos')) drawOverlay(ov, now);
    hits = ov.hits;
    if (state.dark) drawDark(state.dark, mp);
    if (state.fade > 0) { ctx.fillStyle = `rgba(14,16,26,${Math.min(1, state.fade)})`; ctx.fillRect(0, 0, view.w, view.h); }
    const tEnd = performance.now(), pt = stat.parts;
    stat.ms += (tEnd - t0 - stat.ms) * 0.05;
    pt.ground += (tGround - t0 - pt.ground) * 0.05; pt.items += (tItems - tGround - pt.items) * 0.05;      // ?perf=1 shows where a frame goes
    pt.fx += (tFx - tItems - pt.fx) * 0.05; pt.overlay += (tEnd - tFx - pt.overlay) * 0.05;
  }

  /** The seeker's darkness: the whole view nearly black but a soft circle of light on the ground around the seeker (an ellipse once tilted). r = 0 or full: all dark. */
  function drawDark(dk, mp) {
    if (!darkCanvas || darkCanvas.width !== view.w || darkCanvas.height !== view.h) darkCanvas = Object.assign(document.createElement('canvas'), { width: view.w, height: view.h });
    const d = darkCanvas.getContext('2d');
    d.globalCompositeOperation = 'source-over'; d.fillStyle = 'rgba(8,10,20,0.975)'; d.clearRect(0, 0, view.w, view.h); d.fillRect(0, 0, view.w, view.h);
    const p = !dk.full && dk.r > 0 ? project(cam, mp.x * TILE + TILE / 2, mp.y * TILE + TILE / 2) : null;
    if (p) {
      const R = dk.r * 1.15 * p.scale;
      d.globalCompositeOperation = 'destination-out'; d.save(); d.translate(p.x, p.y); d.scale(1, Math.max(0.35, cam.sin));
      const g = d.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.fillRect(-R, -R, R * 2, R * 2); d.restore();
    }
    ctx.drawImage(darkCanvas, 0, 0);
  }

  /** Where a tap sent the pet: the corners of the tile, on the ground. */
  function drawMarker(m) {
    ctx.fillStyle = '#f8d040';
    for (const [dx, dy] of [[2, 2], [14, 2], [2, 14], [14, 14]]) {
      const p = project(cam, m.x * TILE + dx, m.y * TILE + dy);
      if (p) { const r = Math.max(3, Math.round(p.scale * 2.5)); ctx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), r, r); }
    }
  }

  /** Everything made of text goes over the finished picture, so the effects never blur it: signs, badges, names and emote bubbles. */
  function drawOverlay(ov, now) {
    ctx.imageSmoothingEnabled = false;
    const near = (p, m) => p && p.x > -m && p.x < view.w + m && p.y > -m && p.y < view.h + m * 2;
    for (const s of SIGNS) {                                              // the signed boards, standing above their post
      if (s.area !== areaName) continue;
      const w = Math.max(textWidth(font, s.text), textWidth(font, s.sub)) + 6;
      const p = standAt(cam, s.x * TILE + TILE / 2, s.y * TILE + TILE, s.below ? -26 : 17);
      if (!near(p, 120)) continue;
      ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(ui, ui);
      const x = -Math.floor(w / 2), y = -23;
      ctx.fillStyle = '#312439'; ctx.fillRect(x - 1, y - 1, w + 2, 24);
      ctx.fillStyle = '#f4e4a8'; ctx.fillRect(x, y, w, 22);
      ctx.drawImage(textCanvas(font, s.text, '#403020'), x + 3, y); ctx.drawImage(textCanvas(font, s.sub, '#8a5a28'), x + 3, y + 11);
      ctx.restore();
    }
    for (const pl of PLACES) {                                            // the floating icons over the main places
      if (pl.area !== areaName) continue;
      const bd = badge(pl.icon);
      const bob = bobY(pl, now) - pl.y * TILE;
      const p = standAt(cam, pl.x * TILE, pl.y * TILE + BADGE_LIFT, BADGE_LIFT - bob);
      if (!bd || !near(p, 120)) continue;
      ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(ui, ui);
      ctx.drawImage(bd, -BADGE.w / 2, -BADGE.h);
      ctx.restore();
    }
    for (const l of ov.labels) {
      ctx.save(); ctx.translate(Math.round(l.x), Math.round(l.y)); ctx.scale(ui, ui);
      drawText(ctx, font, l.text, -Math.floor(textWidth(font, l.text) / 2), 0, l.colour);
      ctx.restore();
    }
    for (const bb of ov.bubbles) drawBubble(ctx, bb, ui, view.w);
  }

  /** The tile under a pointer (client coordinates): a pet's own tile when its picture is hit, else the ground under it; null off the map. */
  function pointToTile(clientX, clientY) {
    if (!cam) return null;
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * view.w, y = ((clientY - r.top) / r.height) * view.h;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return [h.e.walker.tileX, h.e.walker.tileY];
    }
    const t = screenToTile(cam, x, y);
    const a = getArea(areaName);
    return t && t[0] >= 0 && t[1] >= 0 && t[0] < a.w && t[1] < a.h ? t : null;
  }

  return {
    resize, draw, pointToTile, activate, setInset(i) { inset = { top: i.top || 0, bottom: i.bottom || 0 }; },
    /** The player turned it back on after the automatic fallback: keep the cheapest level and do not fall back again. */
    pin() { gov.allowFlat = false; },
    /** For the console: { level, res, ms (drawing a frame), fps (frames per second as the screen got them), w, h }. */
    stats: () => ({ level: gov.level, res: gov.settings.res, ms: +stat.ms.toFixed(1), fps: +(1000 / stat.dt).toFixed(1), w: view.w, h: view.h, build: stat.build, parts: { ...stat.parts }, gl: glr ? { on: glr.ok, ...glr.stats() } : null }),
    get view() { return view; }, get cam() { return cam; },
  };
}

/**
 * The town's renderer: HD-2D outdoors, the flat renderer in interiors or when HD-2D is off (setHd(false), or `flat`, which also locks it
 * off). Same interface as createRenderer, plus hd (is it on), setHd(on) and flat.
 */
export function createTownRenderer({ canvas, sprites, font, minH = MIN_VIEW_H, minW, flat = false, skip, gl = false, onNotice = () => {}, onMode = () => {} }) {
  const flatR = createRenderer({ canvas, sprites, font, minH, minW });
  let hdOn = !flat, kind = null, box = null, failed = false, autoFlat = false, told = false, atFall = null;      // atFall: the HD-2D numbers when it fell back (for ?perf=1)
  const hdR = createHdRenderer({ canvas, sprites, font, skip, gl, compact: minH < VIEW_H, onQuality(ev) {
    if (ev.kind === 'down' && !told) { told = true; onNotice('Bajamos un poco los efectos para que vaya fluido'); }
    else if (ev.kind === 'flat') { atFall = hdR.stats(); failed = true; autoFlat = true; onNotice('Pasamos a la vista plana para que vaya fluido. Puedes volver a probar con «Efectos»'); onMode(); }
  } });

  const use = (state) => (hdOn && !failed && getArea(state.area || 'town').outdoor ? 'hd' : 'flat');
  function switchTo(k) {
    kind = k;
    if (!box) return;
    if (k === 'hd') hdR.activate(box); else flatR.resize(box.w, box.h, box.dpr);
  }

  return {
    resize(w, h, dpr = 1) {
      box = { w, h, dpr };
      if (kind === 'hd') hdR.resize(box); else flatR.resize(w, h, dpr);
    },
    draw(state, now) {
      const k = use(state);
      if (k !== kind) switchTo(k);
      if (k === 'hd') {
        try { hdR.draw(state, now); return; } catch (e) { console.error('HD-2D failed, using the flat view', e); failed = true; switchTo('flat'); }
      }
      try { flatR.draw(state, now); } catch (e) { flatR.invalidate(); throw e; }      // a half-drawn frame leaves the canvas state (transform, clip, saves) unbalanced: lay it out afresh next frame
    },
    /** css px of the view the bar (top) and the emotes row (bottom) float over: both renderers keep the pet clear of them at the map's edges. */
    setInset(i) { hdR.setInset(i); flatR.setInset(i); },
    pointToTile: (x, y) => (kind === 'hd' ? hdR.pointToTile(x, y) : flatR.pointToTile(x, y)),
    get hd() { return hdOn && !failed; },
    stats: () => ({ mode: kind, ...hdR.stats(), autoFlat, atFall, skip: [...(skip || [])] }),
    get flat() { return flat; },
    /** `manual`: the player pressed the switch. After an automatic fallback, turning it on again is respected: the cheapest level, no second fallback. */
    setHd(on, manual = false) {
      if (flat) return;
      hdOn = !!on;
      if (on && manual && autoFlat) hdR.pin();
      failed = false;
    },
    get scale() { return flatR.scale; },
  };
}
