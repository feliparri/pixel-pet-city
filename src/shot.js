// Developer preview (shot.html): draws a whole area, or one phone-sized view of the town, with a few pets standing around.
//   ?shot=town|shop|view   which picture (default town)
//   &hour=21               the time of day (default: 13); see daynight.js
//   &scale=2               integer zoom
// The page sets document.title to "ready" when it has painted, so a headless browser knows when to take the screenshot.
import { getArea, TILE } from './map.js';
import { drawScene, cameraFor, VIEW_W, VIEW_H } from './render.js';
import { loadSprites } from './sprites.js';
import { loadFont } from './font.js';
import { ambientAt } from './daynight.js';
import { Walker } from './walker.js';

const q = new URLSearchParams(location.search);
const kind = ['town', 'shop', 'view'].includes(q.get('shot')) ? q.get('shot') : 'town';
const hour = q.has('hour') && Number.isFinite(Number(q.get('hour'))) ? Number(q.get('hour')) : 13;
const scale = Math.max(1, Math.min(6, Number(q.get('scale')) | 0 || (kind === 'shop' ? 4 : kind === 'view' ? 3 : 2)));

const pet = (id, species, stage, items, x, y, d = 'down') => ({ id, name: id, look: { species, stage, items }, walker: new Walker(x, y, d), emote: null });
const CAST = {
  town: [pet('Mochi', 'cat', 2, ['tophat', '', '', ''], 20, 24), pet('Luna', 'seal', 1, ['', '', '', ''], 27, 18, 'left'), pet('Rana', 'frog', 2, ['', '', '', ''], 24, 24, 'right'), pet('Nube', 'cat', 0, ['', '', '', ''], 35, 11), pet('Pipo', 'frog', 1, ['', '', '', ''], 20, 36, 'right'), pet('Coco', 'seal', 2, ['', '', '', ''], 13, 33)],
  shop: [pet('Mochi', 'cat', 2, ['', '', '', ''], 6, 8, 'up'), pet('Luna', 'seal', 1, ['', '', '', ''], 9, 7, 'left')],
};

async function main() {
  const [sprites, font] = await Promise.all([loadSprites(), loadFont()]);
  const area = getArea(kind === 'shop' ? 'shop' : 'town');
  const entities = (kind === 'shop' ? CAST.shop : CAST.town).filter((e) => e.look.items.every((i) => !i || sprites.catalogue[i]));
  const me = entities[0], others = entities.slice(1);
  let vw = area.w * TILE, vh = area.h * TILE, cam = { x: 0, y: 0 };
  if (kind === 'view') { vw = VIEW_W; vh = VIEW_H; cam = cameraFor(24 * TILE, 22 * TILE, area.w * TILE, area.h * TILE); }
  const scene = document.createElement('canvas');
  scene.width = vw; scene.height = vh;
  const sctx = scene.getContext('2d');
  const amb = ambientAt(hour);
  drawScene(sctx, { area: area.name, cam, vw, vh, entities: others, me, now: 1000, amb, sprites, font });
  const c = document.getElementById('c');
  c.width = vw * scale; c.height = vh * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scene, 0, 0, c.width, c.height);
  document.title = 'ready';
}
main().catch((e) => { document.title = `error: ${e.message}`; console.error(e); });
