// Draws the world: a fixed 224 x 288 px view (portrait) scaled up by a whole number with nearest-neighbour, centred and letterboxed.
// The scene is drawn at 1 px = 1 game pixel on a small canvas and enlarged; only the emote bubbles are drawn at the final size (emoji).
// Layers: ground (baked), animated water, props and pets sorted by their feet, the day/night tint, the night lights, labels.
import { TILE, SIGNS, getArea } from './map.js';
import { drawPet, CELL } from './sprites.js';
import { drawText, textWidth, textCanvas } from './font.js';
import { EMOTES } from './protocol.js';
import { entranceState, drawEntranceFx, flickers } from './entrance.js';
import { bakeArea } from './art/bake.js';
import { rippleSpots } from './art/ground.js';
import { fountainFrame } from './art/props.js';
import { P } from './art/palette.js';

export const VIEW_W = 224;
export const VIEW_H = 288;
const HAPPY_EMOTES = new Set(['heart', 'smile', 'party', 'hola', 'wave']);
export const EMOTE_MS = 2600;
const NO_LIGHT = { tint: [255, 255, 255], night: 0 };

/** Integer scale that fits the view in a box of device pixels (at least 1). */
export const fitScale = (devW, devH) => Math.max(1, Math.floor(Math.min(devW / VIEW_W, devH / VIEW_H)));

/** The camera's top left in map pixels: centred on the player, never showing outside the map; a map smaller than the view is centred. */
export function cameraFor(px, py, mapW, mapH, viewW = VIEW_W, viewH = VIEW_H) {
  const axis = (p, map, view) => Math.round(map <= view ? (map - view) / 2 : Math.min(Math.max(p - view / 2, 0), map - view));
  return { x: axis(px, mapW, viewW), y: axis(py, mapH, viewH) };
}

const headFrame = (e, now, id) => {
  const emote = e.emote && now < e.emote.until && HAPPY_EMOTES.has(e.emote.e);
  if (emote) return 'happy';
  const blink = ((now + id.charCodeAt(0) * 397) % 3400) < 130;
  if (e.walker.moving && (e.walker.d === 'left' || e.walker.d === 'right')) return 'look';
  return blink ? 'blink' : 'idle';
};

/**
 * Paints one frame of an area into `sctx` (1 px = 1 game pixel, view of `vw` x `vh`).
 * opts: { area (name), cam {x, y}, entities [{ id, name, look, walker, emote?, fx?, gone? }], me, now, amb {tint, night}, sprites, font, marker?, fade? }.
 * Returns the emote bubbles to draw at the final size: [{ x, y, e }] in view pixels.
 */
export function drawScene(sctx, { area: areaName, cam, vw, vh, entities, me, now, amb = NO_LIGHT, sprites, font, marker = null, fade = 0 }) {
  const area = getArea(areaName), baked = bakeArea(area);
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = '#0e101a';
  sctx.fillRect(0, 0, vw, vh);
  sctx.drawImage(baked.ground, -cam.x, -cam.y);

  const frame = Math.floor(now / 320) % 3;                                    // the water's three frames
  sctx.fillStyle = P.a3;
  for (const [x, y, tx, ty] of baked.water) {
    if (x - cam.x < -TILE || x - cam.x > vw || y - cam.y < -TILE || y - cam.y > vh) continue;
    for (const [dx, dy, w] of rippleSpots(tx, ty, frame)) sctx.fillRect(x + dx - cam.x, y + dy - cam.y, w, 1);
  }
  if (baked.fountain) for (const [c, dx, dy, w, h] of fountainFrame(frame)) { sctx.fillStyle = c; sctx.fillRect(baked.fountain.x + dx - cam.x, baked.fountain.y + dy - cam.y, w, h); }

  if (marker && now < marker.until) {                                          // where a tap sent the pet
    const mx = marker.x * TILE - cam.x, my = marker.y * TILE - cam.y;
    sctx.fillStyle = '#f8d040';
    for (const [dx, dy] of [[1, 1], [12, 1], [1, 12], [12, 12]]) sctx.fillRect(mx + dx, my + dy, 3, 3);
  }

  const items = [];                                                            // props and pets, back to front
  for (const pr of baked.props) {
    const sw = pr.sprite ? pr.sprite.width : 16, sh = pr.sprite ? pr.sprite.height : 24;
    if (pr.x - cam.x > vw || pr.x + sw - cam.x < 0 || pr.y - cam.y > vh || pr.y + sh - cam.y < 0) continue;
    items.push({ sortY: pr.sortY, order: 0, draw: () => (pr.sprite ? sctx.drawImage(pr.sprite, pr.x - cam.x, pr.y - cam.y) : pr.draw(sctx, cam.x, cam.y, now)) });
  }
  const labels = [], bubbles = [];
  const all = [me, ...entities].filter((e) => e && e.walker.pos().x !== null && !e.gone);
  for (const e of all) {
    const p = e.walker.pos();
    const k = e.walker.moving ? Math.min(1, e.walker.t / e.walker.stepMs()) : 0;
    const hop = e.walker.moving ? Math.round(Math.abs(Math.sin(k * Math.PI)) * 3) : 0;
    const bx = Math.round(p.x * TILE + TILE / 2 - cam.x), by = Math.round(p.y * TILE + TILE - cam.y);       // the feet
    if (bx < -20 || bx > vw + 20 || by < 0 || by > vh + 40) continue;                                       // off screen: nothing to draw
    const fx = e.fx ? entranceState(e.fx.id, e.fx.phase, now - e.fx.t0) : null;                              // an arrival or an exit in progress
    const lift = fx ? Math.round(fx.lift * (by + CELL + 24)) : 0;                                             // 1 = just above the top edge
    const px = bx + (fx ? Math.round(fx.sway) : 0);
    items.push({ sortY: p.y * TILE + TILE, order: 1, draw: () => {
      if (fx) drawEntranceFx(sctx, e.fx.id, fx, bx, by, CELL, false);
      if (!fx || !fx.hidden) {
        if (lift < by * 0.6) {
          sctx.fillStyle = 'rgba(24,28,44,0.35)';                                                           // shadow (it grows as the pet lands)
          sctx.fillRect(bx - 7, by - 3, 14, 3); sctx.fillRect(bx - 5, by - 4, 10, 1);
        }
        if (!(fx && flickers(e.fx.id, e.fx.phase, now - e.fx.t0))) {
          const flap = (e.walker.moving || lift > 0) && Math.floor(now / 140) % 2 === 1;
          drawPet(sctx, sprites, e.look, px - CELL / 2, by - CELL + 2 - hop - lift, { frame: lift > 0 ? 'happy' : headFrame(e, now, e.id), flip: e.walker.d === 'right', flap });
        }
        labels.push({ text: e.name, x: px - Math.floor(textWidth(font, e.name) / 2), y: by + 2 - lift, colour: e === me ? '#f8d040' : '#f4f6fa' });
      }
      if (fx) drawEntranceFx(sctx, e.fx.id, fx, px, by - lift, CELL, true);
    } });
    if (e.emote && now < e.emote.until && !lift && !(fx && fx.hidden)) bubbles.push({ x: bx, y: by - CELL - hop, e: e.emote.e });
  }
  items.sort((a, b) => a.sortY - b.sortY || a.order - b.order);
  for (const it of items) it.draw();

  if (baked.outdoor) {                                                         // the day's light: a multiply tint over everything drawn so far
    sctx.globalCompositeOperation = 'multiply';
    sctx.fillStyle = `rgb(${amb.tint[0]},${amb.tint[1]},${amb.tint[2]})`;
    sctx.fillRect(0, 0, vw, vh);
    sctx.globalCompositeOperation = 'source-over';
  }
  if (amb.night > 0) {                                                         // lit windows and lamps: after the tint so they stay bright
    sctx.globalAlpha = amb.night;
    for (const o of baked.overlays) if (o.x - cam.x < vw && o.x + o.sprite.width - cam.x > 0 && o.y - cam.y < vh && o.y + o.sprite.height - cam.y > 0) sctx.drawImage(o.sprite, o.x - cam.x, o.y - cam.y);
    sctx.globalAlpha = 1;
    if (baked.outdoor) drawGlows(sctx, baked.glows, cam, amb.night, now, vw, vh);
  }

  for (const s of SIGNS) {                                                     // the signed boards
    if (s.area !== area.name) continue;
    const w = Math.max(textWidth(font, s.text), textWidth(font, s.sub)) + 6;
    const x = Math.round(s.x * TILE + TILE / 2 - Math.floor(w / 2) - cam.x), y = Math.round((s.below ? s.y * TILE + TILE + 2 : s.y * TILE - 24) - cam.y);
    sctx.fillStyle = '#312439'; sctx.fillRect(x - 1, y - 1, w + 2, 24);
    sctx.fillStyle = '#f4e4a8'; sctx.fillRect(x, y, w, 22);
    sctx.drawImage(textCanvas(font, s.text, '#403020'), x + 3, y);
    sctx.drawImage(textCanvas(font, s.sub, '#8a5a28'), x + 3, y + 11);
  }
  for (const l of labels) drawText(sctx, font, l.text, l.x, l.y, l.colour);
  if (fade > 0) { sctx.fillStyle = `rgba(14,16,26,${Math.min(1, fade)})`; sctx.fillRect(0, 0, vw, vh); }
  return bubbles;
}

/** Additive glow: stepped discs around the lamps, a soft rectangle under the lit windows and the shop door. */
function drawGlows(sctx, glows, cam, night, now, vw, vh) {
  sctx.globalCompositeOperation = 'lighter';
  const flick = 1 + Math.sin(now / 900) * 0.04;
  for (const g of glows) {
    if (g.kind === 'lamp') {
      if (g.x - cam.x < -40 || g.x - cam.x > vw + 40 || g.y - cam.y < -40 || g.y - cam.y > vh + 40) continue;
      for (const [k, a] of [[1, 0.04], [0.85, 0.045], [0.7, 0.05], [0.55, 0.055], [0.4, 0.06], [0.25, 0.07]]) {
        sctx.fillStyle = `rgba(255,196,96,${a * night * flick})`;
        const r = Math.round(g.r * k);
        for (let y = -r; y <= r; y += 2) { const hw = Math.round(Math.sqrt(r * r - y * y)); sctx.fillRect(g.x - hw - cam.x, g.y + y - cam.y, hw * 2, 2); }
      }
    } else {
      sctx.fillStyle = `rgba(255,190,90,${0.1 * night})`;
      const pad = g.kind === 'door' ? 0 : 3;
      sctx.fillRect(g.x - pad - cam.x, g.y - pad - cam.y, g.w + pad * 2, g.h + pad * 2 + (g.kind === 'window' ? 4 : 0));
      sctx.fillStyle = `rgba(255,190,90,${0.06 * night})`;
      sctx.fillRect(g.x - pad - 2 - cam.x, g.y - pad - 2 - cam.y, g.w + pad * 2 + 4, g.h + pad * 2 + 8);
    }
  }
  sctx.globalCompositeOperation = 'source-over';
}

export function createRenderer({ canvas, sprites, font }) {
  const ctx = canvas.getContext('2d');
  const scene = document.createElement('canvas');
  scene.width = VIEW_W; scene.height = VIEW_H;
  const sctx = scene.getContext('2d');
  let scale = 1;
  let cam = { x: 0, y: 0 };
  let areaName = 'town';

  function resize(cssW, cssH, dpr = 1) {
    scale = fitScale(cssW * dpr, cssH * dpr);
    canvas.width = VIEW_W * scale; canvas.height = VIEW_H * scale;
    canvas.style.width = `${(VIEW_W * scale) / dpr}px`;
    canvas.style.height = `${(VIEW_H * scale) / dpr}px`;
  }

  /** The tile under a pointer (client coordinates), or null outside the area. */
  function pointToTile(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * VIEW_W + cam.x;
    const ly = ((clientY - rect.top) / rect.height) * VIEW_H + cam.y;
    const a = getArea(areaName);
    const tx = Math.floor(lx / TILE), ty = Math.floor(ly / TILE);
    return tx >= 0 && ty >= 0 && tx < a.w && ty < a.h ? [tx, ty] : null;
  }

  /**
   * state: { area, me, others, marker, amb, fade } where an entity is { id, name, look, walker, emote? }.
   * `now` is a millisecond clock.
   */
  function draw(state, now) {
    areaName = state.area || 'town';
    const a = getArea(areaName);
    const mp = state.me.walker.pos();
    cam = cameraFor(mp.x * TILE + TILE / 2, mp.y * TILE + TILE / 2, a.w * TILE, a.h * TILE);
    const bubbles = drawScene(sctx, { area: areaName, cam, vw: VIEW_W, vh: VIEW_H, entities: state.others, me: state.me, now, amb: state.amb, sprites, font, marker: state.marker, fade: state.fade || 0 });
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e101a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(scene, 0, 0, canvas.width, canvas.height);
    for (const b of bubbles) drawBubble(b);
  }

  function drawBubble({ x, y, e }) {
    const label = EMOTES[e];
    const px = 8 * scale;
    ctx.font = `${px}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    const textual = label.length > 2 && !/\p{Extended_Pictographic}/u.test(label);
    const w = Math.ceil(ctx.measureText(label).width) + 4 * scale, h = 11 * scale;
    const cx = Math.min(Math.max(x * scale, w / 2 + scale), canvas.width - w / 2 - scale);
    const top = Math.max(scale, y * scale - h - 2 * scale);
    ctx.fillStyle = '#f4f6fa';
    ctx.fillRect(cx - w / 2, top, w, h);
    ctx.fillStyle = '#181c2c';
    ctx.fillRect(cx - w / 2 - scale, top + scale, scale, h - 2 * scale); ctx.fillRect(cx + w / 2, top + scale, scale, h - 2 * scale);
    ctx.fillRect(cx - w / 2 + scale, top - scale, w - 2 * scale, scale); ctx.fillRect(cx - w / 2 + scale, top + h, w - 2 * scale, scale);
    ctx.fillRect(cx - scale, top + h + scale, 2 * scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = textual ? '#181c2c' : '#000';
    ctx.fillText(label, cx, top + h / 2 + scale / 2);
  }

  return { resize, draw, pointToTile, get scale() { return scale; } };
}
