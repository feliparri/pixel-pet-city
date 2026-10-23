// The town's tiles, drawn in code (16 x 16 px, the game's pixel size) and baked once into a single map canvas.
// Colours follow the pets' palettes: the frog's greens, warm browns, the game UI's navy for outlines.
import { TILE, MAP_W, MAP_H, GRID } from './map.js';

const C = {
  grass: '#5cc45c', grassDark: '#3f9c4a', grassLight: '#86e07a', flower1: '#f8d040', flower2: '#f87878',
  path: '#d8b878', pathDark: '#c09c5c', plaza: '#b8bcc8', plazaDark: '#9aa0b4',
  water: '#3c78d8', waterDark: '#2a58a8', waterLight: '#78b4f0',
  trunk: '#7a4a28', leaf: '#2f8a3c', leafDark: '#206a30', leafLight: '#58b858',
  wood: '#a8783c', woodDark: '#7a5428', lawn: '#74d46c', lawnDark: '#5cc45c',
  roof: '#c8483c', roofDark: '#9a3028', roofShop: '#3c5cc8', roofShopDark: '#2a40a0', wall: '#e8d8b0', wallDark: '#c8b888', door: '#6a4020', window: '#78b4f0', gold: '#f8d040', ink: '#181c2c',
};

const noise = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 1274126177) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };
const r = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

function grass(ctx, x, y, tx, ty, flowers) {
  r(ctx, C.grass, x, y, TILE, TILE);
  for (let i = 0; i < 5; i++) r(ctx, noise(tx, ty, i) > 0.5 ? C.grassDark : C.grassLight, x + ((noise(tx, ty, i + 9) * 14) | 0), y + ((noise(tx, ty, i + 19) * 14) | 0), 1, 2);
  if (flowers) { const fx = x + 4 + ((noise(tx, ty, 3) * 8) | 0), fy = y + 4 + ((noise(tx, ty, 4) * 8) | 0); r(ctx, noise(tx, ty, 5) > 0.5 ? C.flower1 : C.flower2, fx, fy, 2, 2); r(ctx, C.gold, fx, fy, 1, 1); }
}
function path(ctx, x, y, tx, ty) { r(ctx, C.path, x, y, TILE, TILE); for (let i = 0; i < 4; i++) r(ctx, C.pathDark, x + ((noise(tx, ty, i) * 14) | 0), y + ((noise(tx, ty, i + 5) * 14) | 0), 2, 1); }
function plaza(ctx, x, y) { r(ctx, C.plaza, x, y, TILE, TILE); r(ctx, C.plazaDark, x, y + 7, TILE, 1); r(ctx, C.plazaDark, x + 7, y, 1, 7); r(ctx, C.plazaDark, x + 15, y + 8, 1, 8); }
function water(ctx, x, y, tx, ty, near) {
  r(ctx, C.water, x, y, TILE, TILE);
  r(ctx, C.waterLight, x + 3 + ((noise(tx, ty, 1) * 6) | 0), y + 4 + ((noise(tx, ty, 2) * 6) | 0), 4, 1);
  r(ctx, C.waterLight, x + 8 + ((noise(tx, ty, 3) * 4) | 0), y + 11, 3, 1);
  if (!near.up) r(ctx, C.waterDark, x, y, TILE, 2);
  if (!near.down) r(ctx, C.waterDark, x, y + 14, TILE, 2);
  if (!near.left) r(ctx, C.waterDark, x, y, 2, TILE);
  if (!near.right) r(ctx, C.waterDark, x + 14, y, 2, TILE);
}
function tree(ctx, x, y, tx, ty) {
  grass(ctx, x, y, tx, ty, false);
  r(ctx, C.trunk, x + 6, y + 10, 4, 6);
  r(ctx, C.leafDark, x + 1, y + 3, 14, 9); r(ctx, C.leafDark, x + 3, y + 1, 10, 2);
  r(ctx, C.leaf, x + 2, y + 3, 12, 7); r(ctx, C.leaf, x + 4, y + 1, 8, 2);
  r(ctx, C.leafLight, x + 4, y + 3, 4, 2); r(ctx, C.leafLight, x + 9, y + 6, 3, 2);
}
function fence(ctx, x, y, tx, ty, gate) {
  r(ctx, C.lawn, x, y, TILE, TILE);
  r(ctx, gate ? C.woodDark : C.wood, x + 6, y + 2, 4, 14);
  r(ctx, C.woodDark, x + 6, y + 2, 4, 1);
  r(ctx, C.wood, x, y + 5, TILE, 2); r(ctx, C.wood, x, y + 10, TILE, 2);
  r(ctx, C.woodDark, x, y + 7, TILE, 1); r(ctx, C.woodDark, x, y + 12, TILE, 1);
  if (gate) { r(ctx, C.gold, x + 2, y + 8, 3, 3); r(ctx, C.gold, x + 11, y + 8, 3, 3); }
}
function lawn(ctx, x, y, tx, ty) { r(ctx, C.lawn, x, y, TILE, TILE); r(ctx, C.lawnDark, x, y + ((ty & 1) ? 0 : 8), TILE, 8); if (noise(tx, ty, 7) > 0.8) r(ctx, C.flower1, x + 5, y + 6, 2, 2); }
function roof(ctx, x, y, tx, shop) {
  const a = shop ? C.roofShop : C.roof, b = shop ? C.roofShopDark : C.roofDark;
  r(ctx, a, x, y, TILE, TILE);
  for (let i = 0; i < 16; i += 5) r(ctx, b, x, y + i + 4, TILE, 1);
  for (let i = 0; i < 4; i++) r(ctx, b, x + ((i * 7 + (tx & 1) * 3) % 16), y + 4 + (i % 2) * 5, 1, 5);
  r(ctx, b, x, y + 15, TILE, 1);
}
function wall(ctx, x, y, tx, hasWindow) {
  r(ctx, C.wall, x, y, TILE, TILE);
  r(ctx, C.wallDark, x, y, TILE, 1); r(ctx, C.wallDark, x, y + 15, TILE, 1);
  if (hasWindow) { r(ctx, C.ink, x + 3, y + 4, 10, 8); r(ctx, C.window, x + 4, y + 5, 8, 6); r(ctx, C.ink, x + 7, y + 5, 2, 6); r(ctx, C.ink, x + 4, y + 7, 8, 1); }
}
function door(ctx, x, y, shop) {
  wall(ctx, x, y, 0, false);
  r(ctx, C.ink, x + 2, y + 1, 12, 15); r(ctx, C.door, x + 3, y + 2, 10, 14);
  r(ctx, C.wood, x + 3, y + 2, 10, 2); r(ctx, C.gold, x + 10, y + 9, 2, 2);
  if (shop) r(ctx, C.gold, x + 5, y + 5, 6, 3);
}
function sign(ctx, x, y, tx, ty) {
  grass(ctx, x, y, tx, ty, false);
  r(ctx, C.woodDark, x + 7, y + 8, 2, 8);
  r(ctx, C.ink, x + 2, y + 2, 12, 8); r(ctx, C.wall, x + 3, y + 3, 10, 6); r(ctx, C.wood, x + 4, y + 5, 8, 1);
}

/** The whole map as one canvas (MAP_W x MAP_H tiles). */
export function renderMap() {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W * TILE; canvas.height = MAP_H * TILE;
  const ctx = canvas.getContext('2d');
  const at = (x, y) => (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? GRID[y][x] : '#');
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const ch = GRID[ty][tx], x = tx * TILE, y = ty * TILE;
    switch (ch) {
      case '.': grass(ctx, x, y, tx, ty, false); break;
      case ',': grass(ctx, x, y, tx, ty, true); break;
      case '=': path(ctx, x, y, tx, ty); break;
      case '+': plaza(ctx, x, y); break;
      case 'P': lawn(ctx, x, y, tx, ty); break;
      case '~': water(ctx, x, y, tx, ty, { up: at(tx, ty - 1) === '~', down: at(tx, ty + 1) === '~', left: at(tx - 1, ty) === '~', right: at(tx + 1, ty) === '~' }); break;
      case '#': tree(ctx, x, y, tx, ty); break;
      case 'F': fence(ctx, x, y, tx, ty, false); break;
      case 'G': fence(ctx, x, y, tx, ty, true); break;
      case 'R': roof(ctx, x, y, tx, ty < 6); break;
      case 'H': wall(ctx, x, y, tx, ty > 20 || (tx % 2 === 0)); break;
      case 'D': door(ctx, x, y, ty < 6); break;
      case 'S': sign(ctx, x, y, tx, ty); break;
      default: grass(ctx, x, y, tx, ty, false);
    }
  }
  return canvas;
}
