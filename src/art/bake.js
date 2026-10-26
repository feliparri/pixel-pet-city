// Bakes an area (the town or an interior) into what the renderer needs: one ground canvas with every tile, small sprites for the tall
// things that sort with the pets, the animated spots (pond ripples, the fountain), and what lights up at night (windows, lamps).
import { TILE, HOUSES, PITCH, FARM, inPlaza, fruitKind } from '../map.js';
import { canvas, noise, shadow } from './palette.js';
import * as G from './ground.js';
import * as PL from './places.js';
import * as FM from './farm.js';
import { oak, pine, bush, lamp, lampLit, LAMP_GLOW, drawFountain } from './props.js';
import { drawHouse, windowsOf, litWindow } from './buildings.js';
import { drawInterior, counter, nightWindow, raccoon } from './interior.js';
import { drawPet, CELL } from '../sprites.js';
import { SHOPKEEPER } from '../npcs.js';

let sprites = null;
const kit = () => sprites || (sprites = { barn: FM.barn(), well: FM.well(), scarecrow: FM.scarecrow(), stallBack: FM.stallBack(), stallFront: FM.stallFront(), fruit: [FM.fruitTree(0), FM.fruitTree(1), FM.fruitTree(2)], oak: [oak(1), oak(2)], pine: [pine(1), pine(2)], bush: [bush(0), bush(1)], lamp: lamp(), lampLit: lampLit(), coop: PL.coop(), counter: counter(), nightWindow: nightWindow() });

/** The outdoor areas: the town (plaza, fountain, houses) and the farm (fields, barn, orchard) share every tile that is the same. */
function bakeOutdoor(area) {
  const town = area.name === 'town', k = kit();
  const W = area.w * TILE, H = area.h * TILE;
  const ground = canvas(W, H), ctx = ground.getContext('2d');
  const out = { name: area.name, w: W, h: H, outdoor: true, ground, props: [], water: [], fountain: null, overlays: [], glows: [] };
  const raw = (x, y) => (x >= 0 && y >= 0 && x < area.w && y < area.h ? area.grid[y][x] : '.');
  // what a neighbour is for the borders of paths and the plaza: everything inside the plaza's rectangle is paving
  const paved = (x, y) => town && inPlaza(x, y);
  const surfaceAt = (tx, ty) => (dx, dy) => (paved(tx + dx, ty + dy) ? '+' : raw(tx + dx, ty + dy));
  for (let ty = 0; ty < area.h; ty++) for (let tx = 0; tx < area.w; tx++) {
    const ch = raw(tx, ty), x = tx * TILE, y = ty * TILE, at = surfaceAt(tx, ty), base = () => (paved(tx, ty) ? G.plaza(ctx, x, y, tx, ty, at) : G.grass(ctx, x, y, tx, ty));
    switch (ch) {
      case ',': G.grass(ctx, x, y, tx, ty, true); break;
      case '=': G.path(ctx, x, y, tx, ty, at); break;
      case '+': G.plaza(ctx, x, y, tx, ty, at); break;
      case 'm': G.mat(ctx, x, y, tx, ty, at); break;
      case '~': G.pond(ctx, x, y, tx, ty, at); out.water.push([x, y, tx, ty]); break;
      case 'B': base(); G.flowerbed(ctx, x, y, tx, ty, at); break;
      case 'h': G.grass(ctx, x, y, tx, ty); G.hedge(ctx, x, y, tx, ty, at); break;
      case 'F': G.grass(ctx, x, y, tx, ty); G.fence(ctx, x, y, tx, ty, at); break;
      case 'n': base(); G.bench(ctx, x, y, tx, ty); break;
      case 'S': G.grass(ctx, x, y, tx, ty); G.sign(ctx, x, y); break;
      case 'p': PL.pad(ctx, x, y, tx, ty); break;
      case 'a': PL.gate(ctx, x, y, tx, ty); break;
      case 'y': PL.pitch(ctx, x, y, tx, ty); break;
      case 'g': PL.goal(ctx, x, y, tx, ty, at, ty < PITCH.y ? -1 : 1); break;
      case 'j': PL.track(ctx, x, y, tx, ty, at); break;
      case 'V': PL.hurdle(ctx, x, y, tx, ty, at); break;
      case 'w': PL.puddle(ctx, x, y, tx, ty, at); break;
      case 'W': PL.hay(ctx, x, y, tx, ty, at); break;
      case 'f': PL.finish(ctx, x, y, tx, ty, at); break;
      case 'G': G.grass(ctx, x, y, tx, ty); if (raw(tx - 1, ty) !== 'G' && raw(tx, ty - 1) !== 'G') out.props.push({ x, y: y + 32 - 40, sortY: y + 32, sprite: k.coop }); break;
      case 'o': G.plaza(ctx, x, y, tx, ty, at); break;
      case 'd': FM.furrow(ctx, x, y, tx, ty, at); break;
      case 'C': FM.carrots(ctx, x, y, tx, ty, at); break;
      case 'U': FM.lettuce(ctx, x, y, tx, ty, at); break;
      case 'P': FM.pumpkins(ctx, x, y, tx, ty, at); break;
      case 'Y': FM.wheat(ctx, x, y, tx, ty, at); break;
      case 'A': G.grass(ctx, x, y, tx, ty); shadow(ctx, x + 14, y + 13, 13, 4, 0.32); out.props.push({ x: x - 8, y: y + 16 - 40, sortY: y + 16, sprite: k.fruit[fruitKind(tx, ty)] }); break;
      case 'R': G.grass(ctx, x, y, tx, ty); if (raw(tx - 1, ty) !== 'R' && raw(tx, ty - 1) !== 'R') { shadow(ctx, x + 48, y + 49, 52, 4, 0.3); out.props.push({ x, y: y + 48 - 64, sortY: y + 48, sprite: k.barn }); } break;
      case 'v': G.grass(ctx, x, y, tx, ty); shadow(ctx, x + 12, y + 15, 11, 3, 0.3); out.props.push({ x: x - 4, y: y + 16 - 32, sortY: y + 16, sprite: k.well }); break;
      case 'M': G.grass(ctx, x, y, tx, ty); FM.stallFloor(ctx, x, y, tx, ty); if (tx === FARM.store.x && ty === FARM.store.y) {          // the Almacén's stall: the back stands behind the clerk, the front (awning, counter) before it
        const foot = (FARM.store.y + FARM.store.h) * TILE, back = foot - 2 * TILE;                         // the back's foot is the top of the clerk's row
        shadow(ctx, x + 32, foot - 1, 36, 4, 0.3);
        out.props.push({ x, y: back - 34, sortY: back - 2, sprite: k.stallBack });
        out.props.push({ x, y: foot - 62, sortY: foot, sprite: k.stallFront });
      } break;
      case 'Z': G.grass(ctx, x, y, tx, ty); shadow(ctx, x + 9, y + 15, 6, 1.5, 0.3); out.props.push({ x, y: y + 16 - 28, sortY: y + 14, sprite: k.scarecrow }); break;
      case 't': G.grass(ctx, x, y, tx, ty); shadow(ctx, x + 14, y + 13, 13, 4, 0.32); out.props.push({ x: x - 8, y: y + 16 - 40, sortY: y + 16, sprite: k.oak[(tx * 3 + ty) & 1] }); break;
      case 'T': G.grass(ctx, x, y, tx, ty); shadow(ctx, x + 14, y + 13, 11, 3.5, 0.32); out.props.push({ x: x - 4, y: y + 16 - 40, sortY: y + 16, sprite: k.pine[(tx + ty) & 1] }); break;
      case 'b': G.grass(ctx, x, y, tx, ty); shadow(ctx, x + 9, y + 14, 7, 2, 0.28); out.props.push({ x, y: y + 16 - 14, sortY: y + 10, sprite: k.bush[(tx + ty) & 1], hide: { x: tx, y: ty } }); break;
      case 'L': base(); shadow(ctx, x + 11, y + 15, 6, 1.5, 0.3); out.props.push({ x, y: y + 16 - 32, sortY: y + 15, sprite: k.lamp }); out.overlays.push({ x, y: y + 16 - 32, sprite: k.lampLit }); out.glows.push({ kind: 'lamp', x: x + LAMP_GLOW.x, y: y + 16 - 32 + LAMP_GLOW.y, r: 36 }); break;
      default: G.grass(ctx, x, y, tx, ty);                  // grass, flowers, and what the houses cover
    }
  }
  if (town) { drawFountain(ctx, 22 * TILE, 20 * TILE); out.fountain = { x: 22 * TILE, y: 20 * TILE }; }
  for (const h of town ? HOUSES : []) {
    drawHouse(ctx, h);
    for (const w of windowsOf(h)) {
      const lit = w.shop || noise(w.x, w.y, 2) > 0.25;
      if (!lit) continue;
      out.overlays.push({ x: w.x, y: w.y, sprite: litWindow(w.w, w.h, w.shop) });
      out.glows.push({ kind: 'window', x: w.x, y: w.y, w: w.w, h: w.h });
    }
    if (h.enter) out.glows.push({ kind: 'door', x: (h.x + h.door) * TILE, y: (h.y + 4) * TILE, w: TILE, h: 10 });
  }
  return out;
}

function bakeShop(area) {
  const k = kit();
  const W = area.w * TILE, H = area.h * TILE;
  const ground = canvas(W, H), ctx = ground.getContext('2d');
  const wins = drawInterior(ctx, area);
  const out = { name: area.name, w: W, h: H, outdoor: false, ground, props: [], water: [], fountain: null, overlays: wins.map((p) => ({ x: p.x, y: p.y, sprite: k.nightWindow })), glows: [] };
  out.props.push({ x: 5 * TILE, y: 4 * TILE + 16 - 28, sortY: 5 * TILE, sprite: k.counter });
  out.props.push({ x: SHOPKEEPER.cell.x, y: SHOPKEEPER.cell.y, w: CELL, h: CELL, sortY: 4 * TILE - 4, draw: (c, ox, oy, now, sprites) => {
    const blink = (now % 3600) < 140, bob = Math.floor(now / 700) % 2;
    if (sprites && sprites.data.species.includes(SHOPKEEPER.look.species)) {         // the pets' art; a sheet without the raccoon keeps the old drawing
      const look = { ...SHOPKEEPER.look, items: SHOPKEEPER.look.items.map((it) => (it && sprites.catalogue[it] ? it : '')) };
      drawPet(c, sprites, look, SHOPKEEPER.cell.x - ox, SHOPKEEPER.cell.y - oy + bob, { frame: blink ? 'blink' : 'idle' });
    } else raccoon(c, 104 - ox, 34 - oy, blink ? 1 : 0, bob);
  } });
  return out;
}

const cache = new Map();
/** The baked area (once per area). */
export function bakeArea(area) {
  if (!cache.has(area.name)) cache.set(area.name, area.outdoor ? bakeOutdoor(area) : bakeShop(area));
  return cache.get(area.name);
}
