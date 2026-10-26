// Draws the world: a view that fits the box it is given (see viewFor), scaled up by a whole number with nearest-neighbour, centred.
// The scene is drawn straight onto the canvas in game pixels magnified by a whole number: the world (ground, props, signs, names) by `zoom`, the pets by `petZoom`
// (about 2/3 of it, also a whole number), so a pet's pixels are a little smaller than the world's and every one is still a crisp square. Only the emote bubbles are drawn
// at the final size (emoji).
// Layers: ground (baked), animated water, props and pets sorted by their feet, the day/night tint, the night lights, labels.
import { TILE, SIGNS, PLACES, getArea, tileAt } from './map.js';
import { drawPet, CELL } from './sprites.js';
import { jumpLift } from './jump.js';
import { drawText, textWidth, textCanvas } from './font.js';
import { EMOTES } from './protocol.js';
import { entranceState, drawEntranceFx, flickers } from './entrance.js';
import { bakeArea } from './art/bake.js';
import { rippleSpots } from './art/ground.js';
import { fountainFrame } from './art/props.js';
import { P } from './art/palette.js';
import { badge, bobY, BADGE } from './art/icons.js';
import { drawChicken, CHICKEN_SIZE } from './art/chicken.js';
import { ball as drawBall } from './art/places.js';
import { drawBird, drawButterfly, drawFirefly, drawDuck, drawRing, drawSpray } from './art/life.js';
import { drawAnimal, plotTile } from './art/farm.js';

export const VIEW_W = 224;              // the portrait reference view; a box taller than wide is fitted to it (and the dev previews use it)
export const VIEW_H = 288;
export const MIN_VIEW_H = 264;          // a wide box (a landscape phone) always shows at least 16 tiles from top to bottom (it was 11: the camera was too close)
export const MIN_VIEW_W = 336;          // a tall phone shows at least 21 tiles across (it was 14)
export const PET_RATIO = 2 / 3;         // a pet's pixels against the world's: the pets are drawn smaller than the world around them
const HAPPY_EMOTES = new Set(['heart', 'smile', 'party', 'hola', 'wave']);
export const EMOTE_MS = 2600;
const NO_LIGHT = { tint: [255, 255, 255], night: 0 };

/** Integer scale that fits the portrait reference view (`wide` game px across, VIEW_H / VIEW_W as tall as wide) in a box of device pixels (at least 1). */
export const fitScale = (devW, devH, wide = VIEW_W) => Math.max(1, Math.floor(Math.min(devW / wide, devH / (wide * VIEW_H / VIEW_W))));

/** The whole-number scale of a pet's pixels for a world scale: about PET_RATIO of it, at least 1 (world 3 -> pets 2, 4 -> 3, 6 -> 4). */
export const petScaleFor = (scale) => Math.max(1, Math.round(scale * PET_RATIO));

/**
 * The view for a box of device pixels: { scale, pet, w, h } with w x h in game pixels, `scale` the world's pixel size and `pet` the pets' (petScaleFor). A box wider
 * than tall takes the scale from its height (a view of at least minH: MIN_VIEW_H on a phone; VIEW_H on a desktop, as tall as before); a taller one fits `minW`
 * across (MIN_VIEW_W on a phone, VIEW_W on a desktop). The view fills the box, but never beyond the area (areaW x areaH px): a small interior is shown whole
 * and the rest of the box stays empty around it.
 */
export function viewFor(devW, devH, areaW = Infinity, areaH = Infinity, minH = MIN_VIEW_H, minW = MIN_VIEW_W) {
  const scale = devW > devH ? Math.max(1, Math.floor(devH / minH)) : fitScale(devW, devH, minW);
  return { scale, pet: petScaleFor(scale), w: Math.max(1, Math.min(Math.floor(devW / scale), areaW)), h: Math.max(1, Math.min(Math.floor(devH / scale), areaH)) };
}

/** The camera's top left in map pixels: centred on the player, never showing outside the map; a map smaller than the view is centred. */
export function cameraFor(px, py, mapW, mapH, viewW = VIEW_W, viewH = VIEW_H) {
  const axis = (p, map, view) => Math.round(map <= view ? (map - view) / 2 : Math.min(Math.max(p - view / 2, 0), map - view));
  return { x: axis(px, mapW, viewW), y: axis(py, mapH, viewH) };
}

export const headFrame = (e, now, id) => {
  const emote = e.emote && now < e.emote.until && HAPPY_EMOTES.has(e.emote.e);
  if (emote) return 'happy';
  if (e.asleep) return 'blink';
  const blink = ((now + id.charCodeAt(0) * 397) % 3400) < 130;
  if (e.walker.moving && (e.walker.d === 'left' || e.walker.d === 'right')) return 'look';
  return blink ? 'blink' : 'idle';
};

/**
 * Paints one frame of an area into `sctx` (1 px = 1 game pixel, view of `vw` x `vh`).
 * `zoom` / `petZoom`: device px per game px for the world / for the pets (1: the scene on a small canvas, to be enlarged). The context is left at the world's transform.
 * opts: { area (name), cam {x, y}, entities [{ id, name, look, walker, emote?, jumpAt?, fx?, gone? }], me, now, amb {tint, night}, sprites, font, marker?, fade? }.
 * Returns the bubbles to draw at the final size: [{ x, y, e }] (an emote) or [{ x, y, text }] (a line) in view pixels. `talk`: [{ x, y, text }] lines in map px.
 */
export function drawScene(sctx, { area: areaName, cam, vw, vh, entities, me, now, amb = NO_LIGHT, sprites, font, marker = null, fade = 0, chicken = null, dark = null, life = null, ball = null, talk = null, farm = null, zoom = 1, petZoom = zoom }) {
  const area = getArea(areaName), baked = bakeArea(area);
  sctx.setTransform(zoom, 0, 0, zoom, 0, 0);                                    // everything below is in game px; the pets are drawn in their own (smaller) px
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = '#0e101a';
  sctx.fillRect(0, 0, vw, vh);
  sctx.drawImage(baked.ground, -cam.x, -cam.y);
  if (farm && areaName === 'farm') {                                           // the crops as this pet sees them: stages, harvested plots, watered soil (over the baked ripe ones)
    for (const o of farm.over) {
      const x = o.x * TILE - cam.x, y = o.y * TILE - cam.y;
      if (x > -TILE && x < vw && y > -TILE && y < vh) sctx.drawImage(plotTile(o.ch, o.x, o.y, o.look, o.wet, (dx, dy) => tileAt(o.x + dx, o.y + dy, 'farm')), x, y);
    }
  }

  const frame = Math.floor(now / 320) % 3;                                    // the water's three frames
  sctx.fillStyle = P.a3;
  for (const [x, y, tx, ty] of baked.water) {
    if (x - cam.x < -TILE || x - cam.x > vw || y - cam.y < -TILE || y - cam.y > vh) continue;
    for (const [dx, dy, w] of rippleSpots(tx, ty, frame)) sctx.fillRect(x + dx - cam.x, y + dy - cam.y, w, 1);
  }
  if (baked.fountain) for (const [c, dx, dy, w, h] of fountainFrame(frame)) { sctx.fillStyle = c; sctx.fillRect(baked.fountain.x + dx - cam.x, baked.fountain.y + dy - cam.y, w, h); }

  if (life) {                                                                  // the spray of the fountain and the rings on the pond
    if (baked.fountain && life.spray) drawSpray(sctx, life.spray, baked.fountain.x - cam.x, baked.fountain.y - cam.y);
    for (const r of life.ripples) drawRing(sctx, r.x - cam.x, r.y - cam.y, r.radius, r.fade * 0.8);
  }

  if (marker && now < marker.until) {                                          // where a tap sent the pet
    const mx = marker.x * TILE - cam.x, my = marker.y * TILE - cam.y;
    sctx.fillStyle = '#f8d040';
    for (const [dx, dy] of [[1, 1], [12, 1], [1, 12], [12, 12]]) sctx.fillRect(mx + dx, my + dy, 3, 3);
  }

  const items = [];                                                            // props and pets, back to front
  for (const pr of baked.props) {
    const sw = pr.sprite ? pr.sprite.width : pr.w || 16, sh = pr.sprite ? pr.sprite.height : pr.h || 24;
    if (pr.x - cam.x > vw || pr.x + sw - cam.x < 0 || pr.y - cam.y > vh || pr.y + sh - cam.y < 0) continue;
    items.push({ sortY: pr.sortY, order: 0, draw: () => (pr.sprite ? sctx.drawImage(pr.sprite, pr.x - cam.x, pr.y - cam.y) : pr.draw(sctx, cam.x, cam.y, now, sprites)) });
  }
  const labels = [], bubbles = [], pr = petZoom / zoom;
  const all = [me, ...entities].filter((e) => e && e.walker.pos().x !== null && !e.gone);
  for (const e of all) {
    const p = e.walker.pos();
    const k = e.walker.moving ? Math.min(1, e.walker.t / e.walker.stepMs()) : 0;
    const hop = e.walker.moving ? Math.round(Math.abs(Math.sin(k * Math.PI)) * 3) : 0;
    const air = jumpLift(now, e.jumpAt);                                                                      // a jump (Space): the pet rises, its shadow stays
    const bx = Math.round(p.x * TILE + TILE / 2 - cam.x), by = Math.round(p.y * TILE + TILE - cam.y);       // the feet
    if (bx < -20 || bx > vw + 20 || by < 0 || by > vh + 40) continue;                                       // off screen: nothing to draw
    const fx = e.fx ? entranceState(e.fx.id, e.fx.phase, now - e.fx.t0) : null;                              // an arrival or an exit in progress
    const lift = fx ? Math.round(fx.lift * (by + CELL + 24)) : 0;                                             // 1 = just above the top edge
    const px = bx + (fx ? Math.round(fx.sway) : 0);
    items.push({ sortY: p.y * TILE + TILE, order: 1, draw: () => {
      const small = (x, y, f) => { sctx.save(); sctx.translate(x, y); sctx.scale(pr, pr); f(); sctx.restore(); };         // in the pets' px, standing on (x, y)
      if (fx) small(bx, by, () => drawEntranceFx(sctx, e.fx.id, fx, 0, 0, CELL, false));
      if (!fx || !fx.hidden) {
        if (lift < by * 0.6) {
          sctx.fillStyle = 'rgba(24,28,44,0.35)';                                                           // shadow (it grows as the pet lands)
          small(bx, by, () => { sctx.fillRect(-7, -3, 14, 3); sctx.fillRect(-5, -4, 10, 1); });
        }
        if (!(fx && flickers(e.fx.id, e.fx.phase, now - e.fx.t0))) {
          const flap = (e.walker.moving || lift > 0) && Math.floor(now / 140) % 2 === 1;
          small(px, by - lift, () => drawPet(sctx, e.sprites || sprites, e.look, -CELL / 2, -CELL + 2 - hop - air, { frame: lift > 0 ? 'happy' : headFrame(e, now, e.id), flip: e.walker.d === 'left', flap, now }));
        }
        labels.push({ text: e.name, x: px - Math.floor(textWidth(font, e.name) / 2), y: by + 2 - lift, colour: e === me ? '#f8d040' : e.npc ? '#a8e6cf' : '#f4f6fa' });
      }
      if (fx) small(px, by - lift, () => drawEntranceFx(sctx, e.fx.id, fx, 0, 0, CELL, true));
    } });
    if (e.emote && now < e.emote.until && !lift && !(fx && fx.hidden)) bubbles.push({ x: bx, y: by - (CELL + hop + air) * pr, e: e.emote.e });      // above the head: the pet's height is in its own px
    else if (e.say && !lift) bubbles.push({ x: bx, y: by - (CELL + hop) * pr, text: e.say });                    // a villager's line
  }
  if (talk) for (const t of talk) bubbles.push({ x: Math.round(t.x - cam.x), y: Math.round(t.y - cam.y), text: t.text });      // a shopkeeper's line: (x, y) in map px, just above its head
  if (chicken && areaName === 'town') {                                      // the chicken of Pillar la gallina
    const cx = Math.round(chicken.x * TILE + TILE / 2 - cam.x), cy = Math.round(chicken.y * TILE + TILE - cam.y);
    const hop = chicken.frame === 1 ? (Math.floor(now / 110) % 2) * 2 : 0;
    items.push({ sortY: chicken.y * TILE + TILE, order: 1, draw: () => {
      sctx.fillStyle = 'rgba(24,28,44,0.35)'; sctx.fillRect(cx - 5, cy - 2, 10, 2);
      drawChicken(sctx, cx - CHICKEN_SIZE / 2, cy - CHICKEN_SIZE - hop, chicken.frame, chicken.flip);
    } });
  }
  if (ball && areaName === 'town') items.push({ sortY: ball.y * TILE + 3, order: 1, draw: () => drawBall(sctx, Math.round(ball.x * TILE - cam.x), Math.round(ball.y * TILE - cam.y)) });   // the football
  if (life) {                                                                  // birds, the duck and the farm animals stand in the scene, sorted with the pets
    for (const b of life.birds) items.push({ sortY: b.y, order: 0, draw: () => drawBird(sctx, Math.round(b.x - cam.x), Math.round(b.y - cam.y), b.kind, b.frame, b.flip, b.air) });
    if (life.duck) items.push({ sortY: life.duck.y, order: 0, draw: () => drawDuck(sctx, Math.round(life.duck.x - cam.x), Math.round(life.duck.y - cam.y), life.duck.frame, life.duck.flip) });
    for (const a of life.animals || []) items.push({ sortY: a.y, order: 0, draw: () => { const x = Math.round(a.x - cam.x), y = Math.round(a.y - cam.y); sctx.fillStyle = 'rgba(24,28,44,0.3)'; sctx.fillRect(x - 7, y - 2, 14, 2); drawAnimal(sctx, a, x, y); } });
  }
  items.sort((a, b) => a.sortY - b.sortY || a.order - b.order);
  for (const it of items) it.draw();
  if (life) for (const b of life.butterflies) drawButterfly(sctx, Math.round(b.x - cam.x), Math.round(b.y - cam.y), b.frame, b.colour, b.flip);

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
    if (life) { sctx.globalCompositeOperation = 'lighter'; for (const f of life.fireflies) drawFirefly(sctx, Math.round(f.x - cam.x), Math.round(f.y - cam.y), f.glow); sctx.globalCompositeOperation = 'source-over'; }
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
  for (const pl of PLACES) {                                                  // the floating icons over the main places
    if (pl.area !== area.name) continue;
    const b = badge(pl.icon), bx = Math.round(pl.x * TILE - BADGE.w / 2 - cam.x), by = bobY(pl, now) - BADGE.h - cam.y;
    if (b && bx > -BADGE.w && bx < vw && by > -BADGE.h && by < vh) sctx.drawImage(b, bx, by);
  }
  for (const l of labels) drawText(sctx, font, l.text, l.x, l.y, l.colour);
  if (dark) {
    const p = me.walker.pos();
    drawDark(sctx, vw, vh, Math.round(p.x * TILE + TILE / 2 - cam.x), Math.round(p.y * TILE + TILE / 2 - cam.y), dark.full ? 0 : dark.r);
  }
  if (fade > 0) { sctx.fillStyle = `rgba(14,16,26,${Math.min(1, fade)})`; sctx.fillRect(0, 0, vw, vh); }
  return bubbles;
}

/**
 * The seeker's darkness: everything is almost black except a circle of light of radius `r` px around (cx, cy), with a soft stepped edge
 * (six rings, each a little darker). r = 0 darkens the whole view (the countdown).
 */
export function drawDark(sctx, vw, vh, cx, cy, r) {
  const RINGS = 6, NIGHT = 0.975;
  const edges = Array.from({ length: RINGS + 1 }, (_, k) => r * (0.7 + (0.45 * k) / RINGS));       // light fades between 0.7 r and 1.15 r
  const band = (ro, ri, alpha) => {
    sctx.fillStyle = `rgba(8,10,20,${alpha})`;
    for (let y = 0; y < vh; y++) {
      const dy = y + 0.5 - cy;
      const wo = Math.abs(dy) < ro ? Math.sqrt(ro * ro - dy * dy) : 0, wi = Math.abs(dy) < ri ? Math.sqrt(ri * ri - dy * dy) : 0;
      if (wo > wi) { sctx.fillRect(Math.round(cx - wo), y, Math.round(wo - wi), 1); sctx.fillRect(Math.round(cx + wi), y, Math.round(wo - wi), 1); }
    }
  };
  if (r <= 0) { sctx.fillStyle = `rgba(8,10,20,${NIGHT})`; sctx.fillRect(0, 0, vw, vh); return; }
  for (let k = RINGS; k >= 1; k--) band(edges[k], edges[k - 1], (NIGHT * k) / RINGS * 0.9);
  sctx.fillStyle = `rgba(8,10,20,${NIGHT})`;                                                    // outside the last ring
  for (let y = 0; y < vh; y++) {
    const dy = y + 0.5 - cy, wo = Math.abs(dy) < edges[RINGS] ? Math.sqrt(edges[RINGS] ** 2 - dy * dy) : 0;
    sctx.fillRect(0, y, Math.max(0, Math.round(cx - wo)), 1); sctx.fillRect(Math.round(cx + wo), y, Math.max(0, vw - Math.round(cx + wo)), 1);
  }
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

export function createRenderer({ canvas, sprites, font, minH = MIN_VIEW_H, minW = MIN_VIEW_W }) {
  const ctx = canvas.getContext('2d');
  let scale = 1, petScale = 1, viewW = VIEW_W, viewH = VIEW_H;
  let cam = { x: 0, y: 0 };
  let areaName = 'town';
  let box = null, laidOut = null;                   // the last box (css size and pixel ratio) and the area the view was fitted to

  function layout() {
    const a = getArea(areaName);
    const v = viewFor(box.w * box.dpr, box.h * box.dpr, a.w * TILE, a.h * TILE, minH, minW);
    scale = v.scale; petScale = v.pet; viewW = v.w; viewH = v.h; laidOut = areaName;
    canvas.width = viewW * scale; canvas.height = viewH * scale;
    canvas.style.width = `${(viewW * scale) / box.dpr}px`;
    canvas.style.height = `${(viewH * scale) / box.dpr}px`;
  }

  function resize(cssW, cssH, dpr = 1) {
    box = { w: cssW, h: cssH, dpr };
    layout();
  }

  /** The tile under a pointer (client coordinates), or null outside the area. */
  function pointToTile(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * viewW + cam.x;
    const ly = ((clientY - rect.top) / rect.height) * viewH + cam.y;
    const a = getArea(areaName);
    const tx = Math.floor(lx / TILE), ty = Math.floor(ly / TILE);
    return tx >= 0 && ty >= 0 && tx < a.w && ty < a.h ? [tx, ty] : null;
  }

  /**
   * state: { area, me, others, marker, amb, fade, chicken?, dark?, life?, ball? } where an entity is { id, name, look, walker, emote? }.
   * `now` is a millisecond clock.
   */
  function draw(state, now) {
    areaName = state.area || 'town';
    if (box && laidOut !== areaName) layout();      // another area (a small interior): the view is fitted to it
    const a = getArea(areaName);
    const mp = state.me.walker.pos();
    cam = cameraFor(mp.x * TILE + TILE / 2, mp.y * TILE + TILE / 2, a.w * TILE, a.h * TILE, viewW, viewH);
    const bubbles = drawScene(ctx, { area: areaName, cam, vw: viewW, vh: viewH, entities: state.others, me: state.me, now, amb: state.amb, sprites, font, marker: state.marker, fade: state.fade || 0, chicken: state.chicken || null, dark: state.dark || null, life: state.life || null, ball: state.ball || null, talk: state.talk || null, farm: state.farm || null, zoom: scale, petZoom: petScale });
    ctx.setTransform(1, 0, 0, 1, 0, 0);                                         // the bubbles are drawn at the final size
    for (const b of bubbles) drawBubble(ctx, b, scale, canvas.width, scale);
  }

  return { resize, draw, pointToTile, invalidate() { laidOut = null; }, get scale() { return scale; }, get petScale() { return petScale; } };
}

/** Draws a bubble from the list drawScene returns: an emote or a line. `x`, `y` are multiplied by `mul` (flat: the view's zoom; HD-2D: already final). */
export function drawBubble(ctx, b, scale, maxW, mul = 1) {
  if (b.text) drawTextBubble(ctx, b.text, b.x * mul, b.y * mul, scale, maxW);
  else drawEmoteBubble(ctx, b.e, b.x * mul, b.y * mul, scale, maxW);
}

/**
 * An emote's speech bubble on a 2D context, at final size: `x` is the middle and `y` the point just above the head, in canvas px; `scale` is
 * the pixel size of the bubble's border (and the font is 8 of those); the bubble stays inside `maxW`.
 */
export function drawEmoteBubble(ctx, e, x, y, scale, maxW) {
  const label = EMOTES[e];
  const textual = label.length > 2 && !/\p{Extended_Pictographic}/u.test(label);
  drawBubbleBox(ctx, [label], x, y, scale, maxW, textual ? '#181c2c' : '#000');
}

/** A villager's line in a speech bubble (same look as the emotes'): a line wider than ~ 17 characters per row is split over two rows. */
export function drawTextBubble(ctx, text, x, y, scale, maxW) {
  const words = text.split(' '), rows = [text];
  if (text.length > 17) {                                  // split at the space nearest the middle
    let best = 1;
    for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(' ').length - text.length / 2) < Math.abs(words.slice(0, best).join(' ').length - text.length / 2)) best = i;
    rows.splice(0, 1, words.slice(0, best).join(' '), words.slice(best).join(' '));
  }
  drawBubbleBox(ctx, rows, x, y, scale, maxW, '#f4f6fa', SOFT);
}

// a villager's line: a translucent dark box with light text and no outline, so it does not stand out as much as an emote (owner 2026-10-25)
const SOFT = { fill: 'rgba(24, 28, 44, 0.55)', edge: null };
const SOLID = { fill: '#f4f6fa', edge: '#181c2c' };

function drawBubbleBox(ctx, rows, x, y, scale, maxW, colour, look = SOLID) {
  const px = 8 * scale;
  ctx.font = `${px}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  const w = Math.ceil(Math.max(...rows.map((r) => ctx.measureText(r).width))) + 4 * scale, rowH = 10 * scale, h = rows.length > 1 ? rows.length * rowH + scale : 11 * scale;
  const cx = Math.min(Math.max(x, w / 2 + scale), maxW - w / 2 - scale);
  const top = Math.max(scale, y - h - 2 * scale);
  ctx.fillStyle = look.fill;
  ctx.fillRect(cx - w / 2, top, w, h);
  if (look.edge) {
    ctx.fillStyle = look.edge;
    ctx.fillRect(cx - w / 2 - scale, top + scale, scale, h - 2 * scale); ctx.fillRect(cx + w / 2, top + scale, scale, h - 2 * scale);
    ctx.fillRect(cx - w / 2 + scale, top - scale, w - 2 * scale, scale); ctx.fillRect(cx - w / 2 + scale, top + h, w - 2 * scale, scale);
    ctx.fillRect(cx - scale, top + h + scale, 2 * scale, scale);
  } else ctx.fillRect(cx - scale, top + h, 2 * scale, scale);                      // a soft box: just a small tail
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  rows.forEach((r, i) => ctx.fillText(r, cx, rows.length > 1 ? top + scale + rowH * (i + 0.5) + scale / 2 : top + h / 2 + scale / 2));
}
