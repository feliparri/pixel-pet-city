// Developer preview (shot.html): draws a whole area, or one phone-sized view of the town, with a few pets standing around.
//   ?shot=town|shop|view   which picture (default town)
//   &hour=21               the time of day (default: 13); see daynight.js
//   &scale=2               integer zoom
// The page sets document.title to "ready" when it has painted, so a headless browser knows when to take the screenshot.
import { getArea, tileAt, TILES, TILE } from './map.js';
import { seekerSees } from './games/hide.js';
import { drawScene, cameraFor, VIEW_W, VIEW_H } from './render.js';
import { loadSprites } from './sprites.js';
import { loadFont } from './font.js';
import { ambientAt } from './daynight.js';
import { Walker } from './walker.js';
import { createLife, stepLife, lifeFrame } from './life.js';

const q = new URLSearchParams(location.search);
const kind = ['town', 'shop', 'view', 'park', 'seek', 'coop', 'sprint', 'life'].includes(q.get('shot')) ? q.get('shot') : 'town';
const hour = q.has('hour') && Number.isFinite(Number(q.get('hour'))) ? Number(q.get('hour')) : 13;
const scale = Math.max(1, Math.min(6, Number(q.get('scale')) | 0 || (kind === 'shop' ? 4 : kind === 'view' || kind === 'life' || kind === 'seek' || kind === 'coop' || kind === 'sprint' ? 3 : 2)));

const pet = (id, species, stage, items, x, y, d = 'down') => ({ id, name: id, look: { species, stage, items }, walker: new Walker(x, y, d), emote: null });
const CAST = {
  town: [pet('Mochi', 'cat', 2, ['tophat', '', '', ''], 20, 24), pet('Luna', 'seal', 1, ['', '', '', ''], 27, 18, 'left'), pet('Rana', 'frog', 2, ['', '', '', ''], 24, 24, 'right'), pet('Nube', 'cat', 0, ['', '', '', ''], 35, 11), pet('Pipo', 'frog', 1, ['', '', '', ''], 20, 36, 'right'), pet('Coco', 'seal', 2, ['', '', '', ''], 13, 33)],
  seek: [pet('Mochi', 'cat', 2, ['tophat', '', '', ''], 22, 38, 'right'), pet('Rana', 'frog', 2, ['', '', '', ''], 24, 39, 'left'), pet('Luna', 'seal', 1, ['', '', '', ''], 30, 40), pet('Pipo', 'frog', 1, ['', '', '', ''], 22, 37), pet('Coco', 'seal', 2, ['', '', '', ''], 19, 37)],
  coop: [pet('Mochi', 'cat', 2, ['tophat', '', '', ''], 29, 42, 'up'), pet('Luna', 'seal', 1, ['', '', '', ''], 35, 39, 'left'), pet('Rana', 'frog', 2, ['', '', '', ''], 27, 40, 'right')],
  sprint: [pet('Mochi', 'cat', 2, ['tophat', '', '', ''], 19, 24, 'right'), pet('Luna', 'seal', 1, ['', '', '', ''], 17, 26, 'right')],
  life: [pet('Mochi', 'cat', 2, ['tophat', '', '', ''], 14, 36, 'right'), pet('Rana', 'frog', 2, ['', '', '', ''], 18, 39, 'left')],
  shop: [pet('Mochi', 'cat', 2, ['', '', '', ''], 6, 8, 'up'), pet('Luna', 'seal', 1, ['', '', '', ''], 9, 7, 'left')],
};

async function main() {
  const [sprites, font] = await Promise.all([loadSprites(), loadFont()]);
  const area = getArea(kind === 'shop' ? 'shop' : 'town');
  const entities = (kind === 'shop' ? CAST.shop : CAST[kind] || CAST.town).filter((e) => e.look.items.every((i) => !i || sprites.catalogue[i]));
  const me = entities[0], others = entities.slice(1);
  let vw = area.w * TILE, vh = area.h * TILE, cam = { x: 0, y: 0 };
  if (kind === 'park') { cam = { x: 0, y: 28 * TILE }; vh = 16 * TILE; }
  if (kind === 'view') { vw = VIEW_W; vh = VIEW_H; cam = cameraFor(24 * TILE, 22 * TILE, area.w * TILE, area.h * TILE); }
  let chicken = null, dark = null, shown = others;
  if (kind === 'seek') {                                                       // the seeker's view: pets outside the light, or in a bush, are not drawn
    cam = cameraFor(me.walker.tileX * TILE + 8, me.walker.tileY * TILE + 8, area.w * TILE, area.h * TILE); vw = VIEW_W; vh = VIEW_H;
    shown = others.filter((o) => seekerSees({ x: me.walker.tileX, y: me.walker.tileY }, { x: o.walker.tileX, y: o.walker.tileY }, !!TILES[tileAt(o.walker.tileX, o.walker.tileY)].hide));
    dark = { full: false, r: 3 * TILE };
  }
  if (kind === 'coop') { cam = cameraFor(31 * TILE + 8, 40 * TILE + 8, area.w * TILE, area.h * TILE); vw = VIEW_W; vh = VIEW_H; chicken = { x: 32, y: 42, frame: 1, flip: false }; }
  if (kind === 'sprint') { cam = cameraFor(24 * TILE + 8, 24 * TILE + 8, area.w * TILE, area.h * TILE); vw = VIEW_W; vh = VIEW_H; chicken = { x: 25.5, y: 24, frame: 1, flip: false }; }   // the chicken sprinting across the plaza, a pet chasing it
  const lifeNow = 7300, amb = ambientAt(hour);
  const life = createLife('FOCA-LUNA-42');                                       // the same scene as the room FOCA-LUNA-42; a pet walking up scares a bird
  stepLife(life, [], 0);
  stepLife(life, entities.filter((e) => e.walker.tileY > 28).map((e) => ({ x: e.walker.tileX, y: e.walker.tileY })), lifeNow - 500);
  const lifeScene = kind === 'shop' ? null : lifeFrame(life, lifeNow, amb);
  if (kind === 'life') { vw = 20 * TILE; vh = 14 * TILE; cam = { x: 2 * TILE, y: 30 * TILE }; }
  const scene = document.createElement('canvas');
  scene.width = vw; scene.height = vh;
  const sctx = scene.getContext('2d');
  drawScene(sctx, { area: area.name, cam, vw, vh, entities: shown, me, now: kind === 'life' ? lifeNow : 1000, amb, sprites, font, chicken, dark, life: lifeScene });
  const c = document.getElementById('c');
  c.width = vw * scale; c.height = vh * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scene, 0, 0, c.width, c.height);
  document.title = 'ready';
}
main().catch((e) => { document.title = `error: ${e.message}`; console.error(e); });
