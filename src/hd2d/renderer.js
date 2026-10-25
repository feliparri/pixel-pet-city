// The town's HD-2D renderer: the outdoor town seen through the tilted camera (see camera.js), with the same interface as the flat
// renderer in render.js ({ resize, draw, pointToTile }). createTownRenderer wraps both: the town outdoors is HD-2D, interiors (and
// ?flat=1, and the player's "Efectos" switch) use the flat one.
import { TILE, SIGNS, PLACES, getArea } from '../map.js';
import { createRenderer, drawEmoteBubble, MIN_VIEW_H, VIEW_H } from '../render.js';
import { drawText, textWidth, textCanvas } from '../font.js';
import { badge, bobY, BADGE } from '../art/icons.js';
import { cameraFor, focusBounds, snapFocus, sortBackToFront, screenToTile, standAt, project } from './camera.js';
import { groundMult } from './light.js';
import { buildWorld, bakeGround, drawGround, standingItems, drawGlows, fountainItem } from './scene.js';
import { createFx } from './fx.js';
import { createPetPainter } from './pets.js';

const TOWN = getArea('town');
const MAP_W = TOWN.w * TILE, MAP_H = TOWN.h * TILE;
const BADGE_LIFT = 60;                                                  // a place's badge floats this high over the ground point under it

/** The HD-2D renderer of the outdoor town. `compact` (a phone in landscape) frames the view a little tighter. */
export function createHdRenderer({ canvas, sprites, font, compact = false }) {
  const ctx = canvas.getContext('2d');
  const ref = compact ? 170 : 230;
  const painter = createPetPainter(sprites);
  let world = null, ground = null, fx = null, box = null;
  let view = { w: 0, h: 0 }, cam = null, focus = null, last = null, ui = 2, hits = [];
  let groundKey = '', waterFrame = -1;

  function resize(b) {
    box = b;
    const dpr = Math.min(b.dpr, 1.5);
    const w = Math.max(2, Math.round(Math.min(b.w * dpr, 1280))), h = Math.max(2, Math.round((w * b.h) / b.w));
    if (w !== view.w || h !== view.h) { view = { w, h }; fx = createFx(w, h); }
    canvas.width = w; canvas.height = h;
    canvas.style.width = `${b.w}px`; canvas.style.height = `${b.h}px`;
    groundKey = '';
  }

  function ensureWorld() {
    if (world) return;
    world = buildWorld();
    ground = Object.assign(document.createElement('canvas'), { width: world.tex.width, height: world.tex.height });
  }

  /** The canvas takes this renderer's layout again (the town after an interior, or the switch turned on). */
  function activate(b) { focus = null; last = null; resize(b); }

  function draw(state, now) {
    ensureWorld();
    const dt = last == null ? 16 : Math.min(100, Math.max(0, now - last));
    last = now;
    const amb = state.amb || { tint: [255, 255, 255], night: 0 }, n = amb.night, mult = groundMult(amb);

    const mp = state.me.walker.pos();                                   // the camera follows the player, inside the map
    const probe = cameraFor(view.w, view.h, MAP_W / 2, MAP_H / 2, 1, { ref });
    const b = focusBounds(probe, view.w, view.h, MAP_W, MAP_H);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const tx = clamp(mp.x * TILE + TILE / 2, b.x0, b.x1), ty = clamp(mp.y * TILE + TILE / 2, b.y0, b.y1);
    if (!focus) focus = { x: tx, y: ty };
    else { const k = 1 - Math.exp(-dt / 140); focus.x += (tx - focus.x) * k; focus.y += (ty - focus.y) * k; }
    const [fxp, fyp] = snapFocus(probe, focus.x, focus.y);
    cam = cameraFor(view.w, view.h, fxp, fyp, 1, { ref });
    ui = Math.max(1, Math.round((cam.focal / cam.dist) * 0.6));

    const nq = Math.round(n * 16), key = `${nq}|${mult.map((c) => c >> 2)}`, wf = Math.floor(now / 320) % 3;
    if (key !== groundKey) { bakeGround(world, nq / 16, mult, wf, ground); groundKey = key; waterFrame = wf; }
    else if (wf !== waterFrame) { bakeGround(world, nq / 16, mult, wf, ground, world.waterRects); waterFrame = wf; }

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = `rgb(${Math.round(30 - 20 * n)},${Math.round(48 - 34 * n)},${Math.round(44 - 20 * n)})`;
    ctx.fillRect(0, 0, view.w, view.h);
    drawGround(ctx, ground, cam, view.w, view.h);
    if (state.marker && now < state.marker.until) drawMarker(state.marker);

    const items = standingItems(world, cam, n, view);
    const jet = fountainItem(cam, n, now, view);
    if (jet) items.push(jet);
    const ent = { cam, n, now, world, me: state.me, view };
    for (const e of [state.me, ...state.others]) { const it = painter.item(e, ent); if (it) items.push(it); }
    const ov = { labels: [], bubbles: [], hits: [] };
    for (const it of sortBackToFront(items)) it.draw(ctx, ov);
    drawGlows(ctx, world, cam, n, now, view);
    fx.apply(ctx, 1, n);
    drawOverlay(ov, now);
    hits = ov.hits;
    if (state.fade > 0) { ctx.fillStyle = `rgba(14,16,26,${Math.min(1, state.fade)})`; ctx.fillRect(0, 0, view.w, view.h); }
  }

  /** Where a tap sent the pet: the corners of the tile, on the ground. */
  function drawMarker(m) {
    ctx.fillStyle = '#f8d040';
    for (const [dx, dy] of [[2, 2], [14, 2], [2, 14], [14, 14]]) {
      const p = project(cam, m.x * TILE + dx, m.y * TILE + dy);
      if (p) { const r = Math.max(2, Math.round(p.scale * 1.5)); ctx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), r, r); }
    }
  }

  /** Everything made of text goes over the finished picture, so the effects never blur it: signs, badges, names and emote bubbles. */
  function drawOverlay(ov, now) {
    ctx.imageSmoothingEnabled = false;
    const near = (p, m) => p && p.x > -m && p.x < view.w + m && p.y > -m && p.y < view.h + m * 2;
    for (const s of SIGNS) {                                              // the signed boards, standing above their post
      if (s.area !== 'town') continue;
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
      if (pl.area !== 'town') continue;
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
    for (const bb of ov.bubbles) drawEmoteBubble(ctx, bb.e, bb.x, bb.y, ui, view.w);
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
    return t && t[0] >= 0 && t[1] >= 0 && t[0] < TOWN.w && t[1] < TOWN.h ? t : null;
  }

  return { resize, draw, pointToTile, activate, get view() { return view; }, get cam() { return cam; } };
}

/**
 * The town's renderer: HD-2D outdoors, the flat renderer in interiors or when HD-2D is off (setHd(false), or `flat`, which also locks it
 * off). Same interface as createRenderer, plus hd (is it on), setHd(on) and flat.
 */
export function createTownRenderer({ canvas, sprites, font, minH = MIN_VIEW_H, flat = false }) {
  const flatR = createRenderer({ canvas, sprites, font, minH });
  const hdR = createHdRenderer({ canvas, sprites, font, compact: minH < VIEW_H });
  let hdOn = !flat, kind = null, box = null, failed = false;

  const use = (state) => (hdOn && !failed && (state.area || 'town') === 'town' ? 'hd' : 'flat');
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
      flatR.draw(state, now);
    },
    pointToTile: (x, y) => (kind === 'hd' ? hdR.pointToTile(x, y) : flatR.pointToTile(x, y)),
    get hd() { return hdOn && !failed; },
    get flat() { return flat; },
    setHd(on) { if (flat) return; hdOn = !!on; failed = false; },
    get scale() { return flatR.scale; },
  };
}
