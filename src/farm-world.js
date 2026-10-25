// What grows on the farm and what a pet has done today. Two kinds of state, kept apart on purpose:
//  - the crops' clock is shared: a plot's stage (seeded, growing, ripe) is a pure function of (room, Chile day, plot, time of day), so every
//    player in a room sees the same field at the same moment; nothing of it goes over the network (like the villagers, src/npc-world.js);
//  - what a pet picked is its own: this screen remembers it (FarmMemory, kept per pet in this browser) and shows those plots as harvested
//    for it; another player still sees them ripe on theirs. Watering is per pet too: a watered plot ripens WATER_HEAD_MIN sooner for it.
// The town's day for crops is the calendar day of America/Santiago (it changes at midnight; the villagers' day starts at 06:00).
import { AREAS, fruitKind } from './map.js';
import { hashSeed, mulberry32 } from './life.js';
import { msToZoned } from './admin-time.js';

export const CROP_KIND = { C: 'carrot', U: 'lettuce', P: 'pumpkin', Y: 'wheat' };
export const FRUIT_BY_TREE = ['apple', 'orange', 'pear'];       // the art's fruitTree(kind): red apples, oranges, yellow pears (map.js fruitKind picks the kind by tile; art/bake.js draws it)
export const FRUIT_PER_TREE = 3;                                  // fruits a pet can take from one tree per day
export const GROW_MIN = [300, 480];                               // a plot starts growing between 05:00 and 08:00 ...
export const RIPE_MIN = [540, 1080];                              // ... and is ripe between 09:00 and 18:00 (stays ripe until midnight)
export const WATER_HEAD_MIN = 240;                                // a watered plot ripens this much sooner for the pet that watered it (and starts growing sooner)

const grid = AREAS.farm.grid;
/** The crop plots (one per crop tile) and the fruit trees of the farm, in map order. */
export const PLOTS = [], TREES = [];
for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
  const ch = grid[y][x];
  if (CROP_KIND[ch]) PLOTS.push({ id: `${x},${y}`, x, y, ch, kind: CROP_KIND[ch] });
  else if (ch === 'A') TREES.push({ id: `${x},${y}`, x, y, fruit: FRUIT_BY_TREE[fruitKind(x, y)] });
}
const plotById = new Map(PLOTS.map((p) => [p.id, p])), treeById = new Map(TREES.map((t) => [t.id, t]));
export const plotAt = (x, y) => plotById.get(`${x},${y}`) || null;
export const treeAt = (x, y) => treeById.get(`${x},${y}`) || null;

/** The Chile calendar day ('YYYY-MM-DD') and the minute of that day at a UTC instant. */
export function clockOf(ms) {
  const z = msToZoned(ms), [h, m] = z.time.split(':').map(Number);
  return { day: z.date, minute: h * 60 + m };
}

const between = (r, [lo, hi]) => lo + Math.floor(r() * (hi - lo + 1));
const times = new Map();
/** When plot `p` starts growing and ripens, in minutes of the day, the same for a room all day (a pure function of room, day and plot). */
export function plotTimes(room, day, p) {
  const key = `${room}|${day}|${p.id}`;
  let t = times.get(key);
  if (!t) {
    if (times.size > 4000) times.clear();
    const r = mulberry32(hashSeed(`crop:${key}`));
    t = { grow: between(r, GROW_MIN), ripe: between(r, RIPE_MIN) };
    times.set(key, t);
  }
  return t;
}

/** The shared stage of a plot at a minute of the day: 'seeded', 'growing' or 'ripe'. `watered` brings it forward for the one that watered it. */
export function cropStage(room, day, minute, p, watered = false) {
  const t = plotTimes(room, day, p), head = watered ? WATER_HEAD_MIN : 0;
  return minute < t.grow - head / 2 ? 'seeded' : minute < t.ripe - head ? 'growing' : 'ripe';
}

/** What this pet sees on a plot: { look: 'seeded' | 'growing' | 'ripe' | 'bare' (harvested), wet }. */
export function plotLook(room, day, minute, p, mem) {
  const wet = mem.watered(p.id);
  if (mem.picked(p.id)) return { look: 'bare', wet };
  return { look: cropStage(room, day, minute, p, wet), wet };
}

/** Everything the renderers need for the farm: `plots` (id -> { ...plot, look, wet }) and `over` (the ones that differ from the baked art: ripe and dry). */
export function farmView(room, nowMs, mem) {
  const { day, minute } = clockOf(nowMs);
  mem.use(day);
  const plots = new Map(), over = [];
  for (const p of PLOTS) {
    const v = { ...p, ...plotLook(room, day, minute, p, mem) };
    plots.set(p.id, v);
    if (v.look !== 'ripe' || v.wet) over.push(v);
  }
  return { day, minute, plots, over };
}

// ---- what this pet did today ----------------------------------------------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/, ID_RE = /^\d{1,3},\d{1,3}$/;
const fresh = (day) => ({ day, picked: [], watered: [], fruit: {}, did: {} });
function sane(raw) {
  if (!raw || typeof raw !== 'object' || !DAY_RE.test(raw.day)) return null;
  const m = fresh(raw.day);
  for (const [key, src] of [['picked', plotById], ['watered', plotById]]) if (Array.isArray(raw[key])) m[key] = [...new Set(raw[key].filter((id) => src.has(id)))];
  if (raw.fruit && typeof raw.fruit === 'object') for (const [id, n] of Object.entries(raw.fruit)) if (treeById.has(id) && Number.isInteger(n) && n > 0) m.fruit[id] = Math.min(n, FRUIT_PER_TREE);
  if (raw.did && typeof raw.did === 'object') for (const [k, n] of Object.entries(raw.did)) if (/^[a-z]+(:[a-z]+)?$/.test(k) && Number.isInteger(n) && n > 0) m.did[k] = Math.min(n, 9999);
  return m;
}

/**
 * The pet's day on the farm. `load()` returns what was saved (or null), `save(data)` stores it; both are optional (the memory then lives for
 * this visit). `use(day)` starts a fresh day when the Chile day changed. `did` counts what was done today by action ('harvest:carrot',
 * 'pick:apple', 'water', 'fill', 'feed'): the missions (F.5) read it through count().
 */
export function createFarmMemory({ load = () => null, save = () => {} } = {}) {
  let m = sane(load()) || fresh(''), rev = 0;
  const touch = () => { rev++; save(m); };
  return {
    get day() { return m.day; },
    get rev() { return rev; },
    use(day) { if (m.day !== day) { m = fresh(day); touch(); } },
    picked: (id) => m.picked.includes(id),
    watered: (id) => m.watered.includes(id),
    fruitLeft: (id) => FRUIT_PER_TREE - (m.fruit[id] || 0),
    markPicked(id) { if (!m.picked.includes(id)) { m.picked.push(id); touch(); } },
    markWatered(id) { if (!m.watered.includes(id)) { m.watered.push(id); touch(); } },
    takeFruit(id) { m.fruit[id] = (m.fruit[id] || 0) + 1; touch(); },
    record(type, kind) { const k = kind ? `${type}:${kind}` : type; m.did[k] = (m.did[k] || 0) + 1; touch(); },
    /** How many times today: count('harvest', 'carrot'), count('water'); count('harvest') adds up every kind. */
    count(type, kind) {
      if (kind) return m.did[`${type}:${kind}`] || 0;
      return Object.entries(m.did).reduce((s, [k, n]) => s + (k === type || k.startsWith(`${type}:`) ? n : 0), 0);
    },
    toJSON: () => ({ ...m, picked: m.picked.slice(), watered: m.watered.slice(), fruit: { ...m.fruit }, did: { ...m.did } }),
  };
}
