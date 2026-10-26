// What a pet can do next to the farm's objects, and what each action does to the basket and to the pet's day (src/canasta.js, farm-world.js).
// Pure rules: town.js asks `actionAt` every frame the pet stands still (the prompt) and calls `perform` on A / Space / Enter / E or a tap.
// Missions (F.5) can read the same things: `perform` returns the event ({ type, kind }) and the memory counts the day's actions.
import { FARM, tileAt } from './map.js';
import { NAMES } from './canasta.js';
import { plotAt, treeAt, plotLook, clockOf } from './farm-world.js';
import { NEEDS, needText } from './tools.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SIDES = ['up', 'down', 'left', 'right'];
export const FEEDS = ['wheat', 'lettuce'];                        // what the animals eat (wheat first)
const PD = FARM.paddock;
/** Is a tile on the paddock's fence ring or inside it, plus the open ground just outside where a pet stands to reach over the fence? */
export const nearPaddock = (x, y) => x >= PD.x - 2 && x <= PD.x + PD.w + 1 && y >= PD.y - 2 && y <= PD.y + PD.h + 1;
const nextToWell = (x, y) => Math.abs(x - FARM.well[0]) + Math.abs(y - FARM.well[1]) === 1;
const one = (kind) => NAMES[kind][0];

/** The tiles a pet may act on from (x, y): its own, then the one it faces, then the other three neighbours. */
export function reach(x, y, d) {
  const faced = DIRS[d] ? d : 'down';
  return [[x, y], ...[faced, ...SIDES.filter((s) => s !== faced)].map((s) => [x + DIRS[s][0], y + DIRS[s][1]])];
}

/**
 * The action available to a pet at (x, y) facing `d`, or null: { id: 'harvest' | 'pick' | 'fill' | 'water' | 'feed' | 'hint', label, kind?, target }.
 * `hint` is only a line to show (no key); `focus` ([x, y]) limits it to a tapped object. ctx: { basket, mem, room, nowMs, tools } (`tools`: the keys of the
 * farm tools the pet owns, src/tools.js). Harvesting, drawing water, watering and feeding each need their tool: without it the answer is a hint that names it
 * ("Necesitas una Hoz — Almacén"), unless the pet can do something else from where it stands. Picking fruit by hand needs nothing. Plots first, then trees, the well, the paddock.
 */
export function actionAt(area, x, y, d, ctx, focus = null) {
  if (area !== 'farm') return null;
  const { basket, mem, room, nowMs } = ctx, { day, minute } = clockOf(nowMs);
  const has = (tool) => Array.isArray(ctx.tools) && ctx.tools.includes(tool);
  let missing = null;                                                          // the first tool that stopped an action here: shown only when nothing else can be done
  const need = (action, target) => { missing = missing || { id: 'hint', label: needText(NEEDS[action]), need: NEEDS[action], target }; };
  const tiles = focus ? [[x, y], focus] : reach(x, y, d);                      // `focus`: only what that tile (a tapped object) offers
  for (const [tx, ty] of focus ? [] : tiles.slice(0, 2)) {                  // plots: the one the pet stands on, then the one it faces
    const p = plotAt(tx, ty);
    if (!p) continue;
    const { look, wet } = plotLook(room, day, minute, p, mem);
    if (look === 'ripe') { if (has(NEEDS.harvest)) return { id: 'harvest', label: `Cosechar ${one(p.kind)}`, kind: p.kind, target: p.id }; need('harvest', p.id); continue; }
    if (basket.bucketFull && !wet && (look === 'seeded' || look === 'growing')) { if (has(NEEDS.water)) return { id: 'water', label: 'Regar', target: p.id }; need('water', p.id); }
  }
  for (const [tx, ty] of tiles.slice(1)) {
    const t = treeAt(tx, ty);
    if (t && mem.fruitLeft(t.id) > 0) return { id: 'pick', label: `Recoger ${one(t.fruit)}`, kind: t.fruit, target: t.id };
  }
  if (nextToWell(x, y) && !basket.bucketFull) { if (has(NEEDS.fill)) return { id: 'fill', label: 'Sacar agua', target: 'well' }; need('fill', 'well'); }
  if (nearPaddock(x, y) && tiles.slice(1).some(([tx, ty]) => tileAt(tx, ty, 'farm') === 'F' || tileAt(tx, ty, 'farm') === 'a')) {
    if (!has(NEEDS.feed)) need('feed', 'paddock');
    else {
      const food = FEEDS.find((k) => basket.count(k) > 0);
      return food ? { id: 'feed', label: 'Dar de comer', kind: food, target: 'paddock' } : { id: 'hint', label: 'Trae trigo o lechuga', target: 'paddock' };
    }
  }
  return missing;
}

/**
 * Does the action: returns { ok, type, kind?, text }. A full basket refuses a pick or a harvest and changes nothing (the plot stays ripe);
 * a pet without the tool (`tools` given) is told which one it lacks and nothing changes.
 * Success records the action in the pet's day (mem.count) and tells what to show: `icon` is a basket kind or 'bucket-empty' / 'bucket-full'.
 */
export function perform(action, { basket, mem, tools = null }) {
  if (!action || action.id === 'hint') return { ok: false, type: 'hint', text: '' };
  const { id, kind, target } = action;
  if (NEEDS[id] && Array.isArray(tools) && !tools.includes(NEEDS[id])) return { ok: false, type: id, text: needText(NEEDS[id]) };
  if (id === 'pick' || id === 'harvest') {
    if (!basket.room(kind)) return { ok: false, type: id, kind, text: 'La canasta está llena' };
    basket.add(kind, 1);
    if (id === 'pick') mem.takeFruit(target); else mem.markPicked(target);
    mem.record(id === 'pick' ? 'pick' : 'harvest', kind);
    return { ok: true, type: id, kind, icon: kind, text: '+1' };
  }
  if (id === 'fill') {
    if (!basket.fillBucket()) return { ok: false, type: id, text: 'El cubo ya está lleno' };
    mem.record('fill');
    return { ok: true, type: id, icon: 'bucket-full', text: 'Cubo lleno' };
  }
  if (id === 'water') {
    if (!basket.bucketFull) return { ok: false, type: id, text: 'Necesitas agua' };
    basket.emptyBucket(); mem.markWatered(target); mem.record('water');
    return { ok: true, type: id, icon: 'bucket-empty', text: 'Regado' };
  }
  if (id === 'feed') {
    const food = FEEDS.find((k) => basket.count(k) > 0);
    if (!food) return { ok: false, type: id, text: 'No tienes qué darles' };
    basket.take(food, 1); mem.record('feed', food);
    return { ok: true, type: id, kind: food, icon: food, text: '¡Ñam!' };
  }
  return { ok: false, type: id, text: '' };
}

/** The tile an object occupies (for a tap on it): 'tree', 'well' or 'fence' when it has an action, else null. */
export function objectAt(x, y) {
  const c = tileAt(x, y, 'farm');
  if (c === 'A') return 'tree';
  if (c === 'v') return 'well';
  if ((c === 'F' || c === 'a') && x >= PD.x - 1 && x <= PD.x + PD.w && y >= PD.y - 1 && y <= PD.y + PD.h) return 'fence';
  return null;
}
