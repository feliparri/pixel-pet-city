// The plaza as the HD-2D view needs it: the ground baked into one texture (with its night lighting), the upright things as sprites with
// a foot point, the lights. Everything is built from the town's own art (src/art/*): nothing is redrawn or forked here.
import { TILE, HOUSES, getArea, inPlaza } from '../map.js';
import * as G from '../art/ground.js';
import { shadow } from '../art/palette.js';
import { bakeArea } from '../art/bake.js';
import { drawHouse, windowsOf, litWindow } from '../art/buildings.js';
import { fountainFrame, drawFountain } from '../art/props.js';
import { PIECE_KINDS, hedgePiece, fencePiece, benchPiece, bedPiece, fountainWall } from './pieces.js';
import { groundRow, project, standAt } from './camera.js';
import { LAMP_RADIUS, lightAt, nightMultiply, spriteGrade } from './light.js';

/** The part of the town this prototype shows, in tiles (the plaza, its roads, hedges and the houses along the north road). */
export const REGION = { x: 0, y: 0, w: 48, h: 36 };
export const FOUNTAIN_AT = { x: 22 * TILE, y: 20 * TILE };           // top left of the fountain, world px
const HOUSE_PAD = 12;                                                // transparent rows above a house sprite (the chimney)
const LAMP_TOP = 25;                                                 // the lantern's height above a lamp's foot
const OX = REGION.x * TILE, OY = REGION.y * TILE;
const inRegion = (x, y) => x >= OX && y >= OY && x < OX + REGION.w * TILE && y < OY + REGION.h * TILE;
const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Builds the world once: { tex (day ground), props, houses, lamps, windows, pools }. All positions are world px. */
export function buildWorld() {
  const baked = bakeArea(getArea('town'));
  const tex = canvasOf(REGION.w * TILE, REGION.h * TILE);
  tex.getContext('2d').drawImage(baked.ground, -OX, -OY);
  const props = [], houses = [], lamps = [], windows = [], pools = [];
  for (const it of standUp(tex, getArea('town'))) props.push(it);
  baked.props.forEach((pr, i) => {
    if (!pr.sprite) return;                                          // (the shop's raccoon is a drawing routine, not in this area)
    const x = pr.x + pr.sprite.width / 2, y = pr.y + pr.sprite.height;
    if (!inRegion(x, y)) return;
    const glass = baked.overlays.find((o) => o.x === pr.x && o.y === pr.y && o.sprite.width === pr.sprite.width && o.sprite.height === pr.sprite.height);   // a lamp's lit lantern
    props.push({ key: `p${i}`, sprite: pr.sprite, x, y, light: 0, after: glass ? (ctx, nn) => { ctx.globalAlpha = nn; ctx.drawImage(glass.sprite, 0, 0); ctx.globalAlpha = 1; } : null });
  });
  for (const h of HOUSES) {
    const x = h.x * TILE, y = h.y * TILE;
    if (!inRegion(x, y) || !inRegion(x + h.w * TILE - 1, y + 63)) continue;
    const day = canvasOf(h.w * TILE, 64 + HOUSE_PAD), ctx = day.getContext('2d');
    ctx.translate(-x, -y + HOUSE_PAD);
    drawHouse(ctx, h);                                               // the house on a transparent canvas: it stands up as a facade
    const wins = windowsOf(h).map((w) => ({ ...w, lit: litWindow(w.w, w.h, w.shop) }));
    houses.push({ key: `h${h.x}`, sprite: day, x: x + (h.w * TILE) / 2, y: y + 64, wins: wins.filter((w) => w.shop || baked.glows.some((g) => g.kind === 'window' && g.x === w.x && g.y === w.y)), ox: x, oy: y - HOUSE_PAD });
  }
  for (const g of baked.glows) {
    if (g.kind === 'lamp' && inRegion(g.x, g.y)) {
      lamps.push({ x: g.x, y: g.y + LAMP_TOP, z: LAMP_TOP });
      pools.push({ x: g.x, y: g.y + LAMP_TOP - 3, r: LAMP_RADIUS, k: 1 });
    } else if (g.kind === 'window' && inRegion(g.x, g.y)) {
      windows.push({ x: g.x + g.w / 2, y: g.y + g.h / 2, w: g.w, h: g.h });
    } else if (g.kind === 'door' && inRegion(g.x, g.y)) pools.push({ x: g.x + g.w / 2, y: g.y + 10, r: 44, k: 0.6 });
  }
  for (const w of windows) pools.push({ x: w.x, y: Math.round(w.y + 28), r: 30, k: 0.4 });          // the light of a window spills on the road
  const lights = pools.map((p) => ({ ...p, r: p.r * 1.5, k: p.k * 0.9 }));                       // what lights a standing thing reaches further than the floor pool
  for (const p of props) p.light = lightAt(lights, p.x, p.y);
  return { tex, props, houses, lamps, windows, pools, lights, cache: new Map() };
}

/**
 * Takes hedges, fences, benches and flower beds off the ground texture (the ground under them is painted again, as the town does), makes
 * each an upright piece standing on its tile's front edge, and does the same for the fountain's front rim. Returns the pieces as props.
 */
function standUp(tex, area) {
  const t = tex.getContext('2d'), out = [];
  const raw = (x, y) => (x >= 0 && y >= 0 && x < area.w && y < area.h ? area.grid[y][x] : '.');
  const surface = (tx, ty) => (dx, dy) => (inPlaza(tx + dx, ty + dy) ? '+' : raw(tx + dx, ty + dy));
  const floor = (tx, ty) => (inPlaza(tx, ty) ? G.plaza(t, tx * TILE - OX, ty * TILE - OY, tx, ty, surface(tx, ty)) : G.grass(t, tx * TILE - OX, ty * TILE - OY, tx, ty));
  const cells = [];
  for (let ty = REGION.y; ty < REGION.y + REGION.h; ty++) for (let tx = REGION.x; tx < REGION.x + REGION.w; tx++) if (PIECE_KINDS[raw(tx, ty)]) cells.push([tx, ty, raw(tx, ty)]);
  for (const [tx, ty] of cells) floor(tx, ty);
  for (const [tx, ty, ch] of cells) {
    const l = raw(tx - 1, ty) === ch || (ch === 'F' && raw(tx - 1, ty) === 'S'), r = raw(tx + 1, ty) === ch || (ch === 'F' && raw(tx + 1, ty) === 'S');
    const x = tx * TILE - OX, y = ty * TILE - OY;
    const sprite = ch === 'h' ? hedgePiece(tx, ty, l, r) : ch === 'F' ? fencePiece(l, r) : ch === 'n' ? benchPiece() : bedPiece(tx, ty, l, r);
    shadow(t, x + 9, y + 16, ch === 'n' ? 8 : 8.5, 2.4, 0.32);                                  // the shadow on the ground, in front of the foot
    out.push({ key: `s${tx},${ty}`, sprite, x: tx * TILE + TILE / 2, y: ty * TILE + 15, light: 0, after: null });
  }
  const fx = FOUNTAIN_AT.x, fy = FOUNTAIN_AT.y;                                                 // the fountain: water stays on the ground, the front rim stands up
  for (let tx = 22; tx < 26; tx++) for (let ty = 20; ty < 23; ty++) G.plaza(t, tx * TILE - OX, ty * TILE - OY, tx, ty, surface(tx, ty));
  drawFountain(t, fx - OX, fy - OY);
  t.save(); t.beginPath(); t.rect(fx - OX, fy - OY + 37, 64, 11); t.clip();
  for (let tx = 22; tx < 26; tx++) G.plaza(t, tx * TILE - OX, 22 * TILE - OY, tx, 22, surface(tx, 22));      // wipe the flat front face
  t.restore();
  shadow(t, fx - OX + 33, fy - OY + 42, 29, 3.5, 0.32);
  out.push({ key: 'fountain-wall', sprite: fountainWall(), x: fx + 32, y: fy + 40, light: 0, after: null });
  return out;
}

const glowStops = (g, rgb, a) => { for (const [t, k] of [[0, 1], [0.25, 0.56], [0.5, 0.25], [0.75, 0.06], [1, 0]]) g.addColorStop(t, `rgba(${rgb},${a * k})`); };

/**
 * The ground texture for a night amount `n` (0 = day) and water frame: the day art multiplied by the night's blue, then the day art
 * shown again (a little warmer) inside every pool of lamp, door and window light, so the light really lights the floor.
 */
export function bakeGround(world, n, frame, out = null) {
  const w = world.tex.width, h = world.tex.height;
  const lit = out || canvasOf(w, h), ctx = lit.getContext('2d');
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(world.tex, 0, 0);
  for (const [c, dx, dy, rw, rh] of fountainFrame(frame)) { ctx.fillStyle = c; ctx.fillRect(FOUNTAIN_AT.x - OX + dx, FOUNTAIN_AT.y - OY + dy, rw, rh); }
  if (n <= 0) return lit;
  const day = world._day || (world._day = canvasOf(w, h)), dctx = day.getContext('2d');
  dctx.globalCompositeOperation = 'source-over'; dctx.drawImage(lit, 0, 0);                  // the day ground with the water frame
  ctx.globalCompositeOperation = 'multiply';
  const m = nightMultiply(n);
  ctx.fillStyle = `rgb(${m[0]},${m[1]},${m[2]})`; ctx.fillRect(0, 0, w, h);
  const mask = world._mask || (world._mask = canvasOf(w, h)), mctx = mask.getContext('2d');
  mctx.globalCompositeOperation = 'source-over'; mctx.clearRect(0, 0, w, h);
  mctx.globalCompositeOperation = 'lighter';
  for (const p of world.pools) {
    const g = mctx.createRadialGradient(p.x - OX, p.y - OY, 0, p.x - OX, p.y - OY, p.r);
    glowStops(g, '255,255,255', p.k);
    mctx.fillStyle = g; mctx.fillRect(p.x - OX - p.r, p.y - OY - p.r, p.r * 2, p.r * 2);
  }
  dctx.globalCompositeOperation = 'destination-in'; dctx.drawImage(mask, 0, 0);               // the day ground, only where there is light
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.8 * n; ctx.drawImage(day, 0, 0); ctx.globalAlpha = 1;
  mctx.globalCompositeOperation = 'source-in'; mctx.fillStyle = 'rgb(255,150,60)'; mctx.fillRect(0, 0, w, h);   // and a warm wash in the same pools
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * n; ctx.drawImage(mask, 0, 0); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return lit;
}

/** Mode 7: draws the ground texture one screen row at a time, each row scaled by its depth (nearest neighbour, so the pixels stay crisp). */
export function drawGround(ctx, ground, cam, viewW, viewH, rowStep = 1) {
  ctx.imageSmoothingEnabled = false;
  for (let sy = 0; sy < viewH; sy += rowStep) {
    const row = groundRow(cam, sy + rowStep / 2);
    if (!row) continue;
    const ty = Math.floor(row.y - OY);
    if (ty < 0 || ty >= ground.height) continue;
    const x0 = cam.focusX - cam.cx * row.perPx - OX, x1 = x0 + viewW * row.perPx;
    const l = Math.max(0, x0), r = Math.min(ground.width, x1);
    if (r > l) ctx.drawImage(ground, l, ty, r - l, 1, (l - x0) / row.perPx, sy, (r - l) / row.perPx, rowStep);
  }
}

/** A sprite graded for night amount `n` and light `l`, cached by quantised amounts. `after(ctx)` paints what stays bright (lit windows). */
export function nightSprite(world, key, src, n, l, after = null) {
  const nq = Math.round(n * 12), lq = Math.round(l * 8), id = `${key}|${nq}|${lq}`;
  let c = world.cache.get(id);
  if (!c) { c = canvasOf(src.width, src.height); grade(c.getContext('2d'), src, nq / 12, lq / 8); if (after) after(c.getContext('2d'), nq / 12); world.cache.set(id, c); }
  return c;
}

/** Draws `src` into `ctx` at (0, 0) graded for night: a dark blue veil over its pixels, a warm wash where a lamp lights it. */
export function grade(ctx, src, n, l) {
  ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(src, 0, 0);
  const { veil, warm } = spriteGrade(n, l);
  ctx.globalCompositeOperation = 'source-atop';
  if (veil > 0) { ctx.fillStyle = `rgba(10,18,64,${veil})`; ctx.fillRect(0, 0, src.width, src.height); }
  if (warm > 0) { ctx.fillStyle = `rgba(255,164,70,${warm})`; ctx.fillRect(0, 0, src.width, src.height); }
  ctx.globalCompositeOperation = 'source-over';
}

/** The upright things as depth-sortable items: { depth, order, draw }. Trees, bushes, lamps and the house facades. */
export function standingItems(world, cam, n, view) {
  const items = [];
  const put = (obj, sprite, key, dx, dy, order, lightOf) => {
    const p = project(cam, obj.x, obj.y);
    if (!p) return;
    const w = sprite.width * p.scale, h = sprite.height * p.scale, x = p.x - (obj.cxs ?? sprite.width / 2) * p.scale, y = p.y - h;
    if (x > view.w || x + w < 0 || y > view.h || y + h < 0) return;
    items.push({ depth: p.depth, order, draw: (ctx) => {
      ctx.drawImage(n > 0.02 ? nightSprite(world, key, sprite, n, lightOf, obj.after) : sprite, 0, 0, sprite.width, sprite.height, x, y, w, h);
    } });
  };
  for (const pr of world.props) put(pr, pr.sprite, pr.key, 0, 0, 0, pr.light);
  for (const h of world.houses) {
    const after = (ctx, nn) => { ctx.globalAlpha = nn; for (const w of h.wins) ctx.drawImage(w.lit, w.x - h.ox, w.y - h.oy); ctx.globalAlpha = 1; };
    put({ x: h.x, y: h.y, after }, h.sprite, h.key, 0, 0, 0, 0);
  }
  return items;
}

/** Additive glow of the lamps and lit windows on screen (the ground's own light is in the ground texture). */
export function drawGlows(ctx, world, cam, n, now) {
  if (n <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  const flick = 1 + Math.sin(now / 900) * 0.05 + Math.sin(now / 230) * 0.02;
  const halo = (p, r, rgb, a) => {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    glowStops(g, rgb, a);
    ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  };
  for (const l of world.lamps) {
    const p = standAt(cam, l.x, l.y, l.z);
    if (!p) continue;
    halo(p, 48 * p.scale, '255,170,70', 0.26 * n * flick);
    halo(p, 12 * p.scale, '255,226,150', 0.5 * n * flick);
  }
  for (const w of world.windows) {
    const h = world.houses.find((hs) => Math.abs(hs.x - w.x) < (hs.sprite.width / 2));
    const base = h ? h.y : w.y;
    const p = standAt(cam, w.x, base, base - w.y);
    if (!p) continue;
    halo(p, 16 * p.scale, '255,180,80', 0.22 * n);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** The fountain's jet as an upright item: a column and arcing drops that rise from the pedestal (it gives the flat basin some height). */
export function fountainItem(cam, n, now, view) {
  const fx = FOUNTAIN_AT.x + 32, fy = FOUNTAIN_AT.y + 28;           // the spout, on the pedestal
  const p0 = project(cam, fx, fy + 6);
  if (!p0) return null;
  return { depth: p0.depth, order: 1, draw: (ctx) => {
    const s = p0.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const t = ((now / 1300 + i / 18) % 1), a = i * 2.399, r = Math.sin(t * Math.PI) * 0 + t * (6 + (i % 4) * 2.2);
      const wx = fx + Math.cos(a) * r, wz = 15 + 30 * t * (1 - t) * 4 * (0.7 + (i % 3) * 0.15) - t * 8 + 2;
      const p = standAt(cam, wx, fy + 6 + Math.sin(a) * r * 0.5, wz);
      if (!p) continue;
      const rad = (1.1 + (i % 2) * 0.5) * s;
      ctx.fillStyle = `rgba(190,230,255,${0.55 * (1 - t * 0.5)})`;
      ctx.fillRect(Math.round(p.x - rad / 2), Math.round(p.y - rad / 2), Math.max(1, Math.round(rad)), Math.max(1, Math.round(rad)));
    }
    const top = standAt(cam, fx, fy + 6, 38), g = ctx.createLinearGradient(0, top.y, 0, p0.y);
    g.addColorStop(0, 'rgba(200,236,255,0)'); g.addColorStop(1, `rgba(200,236,255,${0.5 - 0.15 * n})`);
    ctx.fillStyle = g; ctx.fillRect(p0.x - s * 0.9, top.y, s * 1.8, p0.y - top.y);
    ctx.restore();
  } };
}
