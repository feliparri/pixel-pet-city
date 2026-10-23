// Draws the town: a fixed 224 x 288 px view (portrait) scaled up by a whole number with nearest-neighbour, centred and letterboxed.
// The scene is drawn at 1 px = 1 game pixel on a small canvas and enlarged; only the emote bubbles are drawn at the final size (emoji).
import { TILE, MAP_W, MAP_H, SIGNS } from './map.js';
import { drawPet, CELL } from './sprites.js';
import { drawText, textWidth, textCanvas } from './font.js';
import { EMOTES } from './protocol.js';
import { entranceState, drawEntranceFx, flickers } from './entrance.js';

export const VIEW_W = 224;
export const VIEW_H = 288;
const MAP_PX_W = MAP_W * TILE, MAP_PX_H = MAP_H * TILE;
const HAPPY_EMOTES = new Set(['heart', 'smile', 'party', 'hola', 'wave']);
export const EMOTE_MS = 2600;

/** Integer scale that fits the view in a box of device pixels (at least 1). */
export const fitScale = (devW, devH) => Math.max(1, Math.floor(Math.min(devW / VIEW_W, devH / VIEW_H)));

/** The camera's top left in map pixels: centred on the player, never showing outside the map. */
export function cameraFor(px, py) {
  return {
    x: Math.round(Math.min(Math.max(px - VIEW_W / 2, 0), MAP_PX_W - VIEW_W)),
    y: Math.round(Math.min(Math.max(py - VIEW_H / 2, 0), MAP_PX_H - VIEW_H)),
  };
}

export function createRenderer({ canvas, sprites, font, mapCanvas }) {
  const ctx = canvas.getContext('2d');
  const scene = document.createElement('canvas');
  scene.width = VIEW_W; scene.height = VIEW_H;
  const sctx = scene.getContext('2d');
  let scale = 1;
  let cam = { x: 0, y: 0 };

  function resize(cssW, cssH, dpr = 1) {
    scale = fitScale(cssW * dpr, cssH * dpr);
    canvas.width = VIEW_W * scale; canvas.height = VIEW_H * scale;
    canvas.style.width = `${(VIEW_W * scale) / dpr}px`;
    canvas.style.height = `${(VIEW_H * scale) / dpr}px`;
  }

  /** The tile under a pointer (client coordinates), or null outside the map. */
  function pointToTile(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * VIEW_W + cam.x;
    const ly = ((clientY - rect.top) / rect.height) * VIEW_H + cam.y;
    const tx = Math.floor(lx / TILE), ty = Math.floor(ly / TILE);
    return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H ? [tx, ty] : null;
  }

  const headFrame = (e, now, id) => {
    const emote = e.emote && now < e.emote.until && HAPPY_EMOTES.has(e.emote.e);
    if (emote) return 'happy';
    const blink = ((now + id.charCodeAt(0) * 397) % 3400) < 130;
    if (e.walker.moving && (e.walker.d === 'left' || e.walker.d === 'right')) return 'look';
    return blink ? 'blink' : 'idle';
  };

  /**
   * state: { me, others, marker } where an entity is { id, name, look, walker, emote? }.
   * `now` is a millisecond clock.
   */
  function draw(state, now) {
    const mp = state.me.walker.pos();
    cam = cameraFor(mp.x * TILE + TILE / 2, mp.y * TILE + TILE / 2);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(mapCanvas, cam.x, cam.y, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    if (state.marker && now < state.marker.until) {                      // where a tap sent the pet
      const mx = state.marker.x * TILE - cam.x, my = state.marker.y * TILE - cam.y;
      sctx.fillStyle = '#f8d040';
      for (const [dx, dy] of [[1, 1], [12, 1], [1, 12], [12, 12]]) sctx.fillRect(mx + dx, my + dy, 3, 3);
    }
    for (const s of SIGNS) {                                             // the signed placeholders
      const w = Math.max(textWidth(font, s.text), textWidth(font, s.sub)) + 6;
      const x = s.x * TILE + TILE / 2 - Math.floor(w / 2) - cam.x, y = s.y * TILE - 24 - cam.y;
      sctx.fillStyle = '#181c2c'; sctx.fillRect(x - 1, y - 1, w + 2, 24);
      sctx.fillStyle = '#f4e4a8'; sctx.fillRect(x, y, w, 22);
      sctx.drawImage(textCanvas(font, s.text, '#403020'), x + 3, y);
      sctx.drawImage(textCanvas(font, s.sub, '#8a5a28'), x + 3, y + 11);
    }

    const all = [state.me, ...state.others].filter((e) => e.walker.pos().x !== null);
    all.sort((a, b) => a.walker.pos().y - b.walker.pos().y);
    const bubbles = [];
    for (const e of all) {
      if (e.gone) continue;                                                                                // it left the town (a recalled visitor)
      const p = e.walker.pos();
      const k = e.walker.moving ? Math.min(1, e.walker.t / e.walker.stepMs()) : 0;
      const hop = e.walker.moving ? Math.round(Math.abs(Math.sin(k * Math.PI)) * 3) : 0;
      const bx = Math.round(p.x * TILE + TILE / 2 - cam.x), by = Math.round(p.y * TILE + TILE - cam.y);   // the feet
      if (bx < -20 || bx > VIEW_W + 20 || by < 0 || by > VIEW_H + 40) continue;                           // off screen: nothing to draw
      const fx = e.fx ? entranceState(e.fx.id, e.fx.phase, now - e.fx.t0) : null;                          // an arrival or an exit in progress
      const lift = fx ? Math.round(fx.lift * (by + CELL + 24)) : 0;                                         // 1 = just above the top edge
      const px = bx + (fx ? Math.round(fx.sway) : 0);
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
        drawText(sctx, font, e.name, px - Math.floor(textWidth(font, e.name) / 2), by + 2 - lift, e === state.me ? '#f8d040' : '#f4f6fa');
      }
      if (fx) drawEntranceFx(sctx, e.fx.id, fx, px, by - lift, CELL, true);
      if (e.emote && now < e.emote.until && !lift && !(fx && fx.hidden)) bubbles.push({ x: bx, y: by - CELL - hop, e: e.emote.e });
    }

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
