// What the villagers do all day, as a pure function of (room code, server time). Ideas borrowed from the Creatures paper: every villager has
// drives (hunger, tiredness, boredom, company) that rise at its own pace; the world's objects (the orchard, the well, a bench...) say which
// drive they relieve (affordances); a villager keeps picking its most pressing drive, walks to an object for it (across the road between the
// town and the farm when it has to), stays a while and picks again. Late at night it walks home and sleeps until its wake time.
// Nothing goes over the network. Each (room, town day) is simulated forward from a fixed state at 06:00 Chile time into a timeline of
// segments (walk, stay, sleep); the timeline is built lazily as time moves on and kept, so a frame only looks a segment up.
// Rules for sleep: nobody goes to bed before 01:00 Chile time, nobody falls asleep while a sky show runs, and wake times are after 06:00,
// so every day starts with everybody asleep (or just up) at home and the days join without a jump.
import { isWalkable, tileAt, doorAt, TILES, inZone, GAME_IDS, FARM, HOUSES } from './map.js';
import { findPath } from './path.js';
import { STEP_MS } from './walker.js';
import { hashSeed, mulberry32 } from './life.js';
import { msToZoned, zonedToMs } from './admin-time.js';
import { SHOWS } from './show/timeline.js';

/** A villager strolls: one step takes this long (a player's pet takes STEP_MS; at that pace the villagers looked in a hurry, owner 2026-10-25). */
export const NPC_STEP_MS = Math.round(STEP_MS * 2.5);

export const DAY_START = '06:00';           // the town's day begins at 06:00 America/Santiago (everybody is in bed then)
export const EARLIEST_BED = 1;              // nobody goes to bed before 01:00
export const SHOW_PAD_MS = 5000;            // a show's end plus this: nobody dozes off at the last firework
export const DRIVES = ['hunger', 'tired', 'bored', 'social'];

// ---- where a villager may stand -------------------------------------------------------------------------------------------------------------

/** Open town ground that is not a hiding bush, a door, or inside the Parque where the games are played. */
export const npcTile = (x, y) => isWalkable(x, y, 'town') && !TILES[tileAt(x, y, 'town')].hide && !doorAt(x, y, 'town') && !GAME_IDS.some((g) => inZone(g, x, y));
const PD = FARM.paddock;
const inPaddock = (x, y) => x >= PD.x - 1 && x <= PD.x + PD.w && y >= PD.y - 1 && y <= PD.y + PD.h;       // the animals' fence and what is inside it
/** Open farm ground, not the paddock, not a hiding bush, not the door tile. */
export const farmTile = (x, y) => isWalkable(x, y, 'farm') && !TILES[tileAt(x, y, 'farm')].hide && !doorAt(x, y, 'farm') && !inPaddock(x, y);
const TOWN_DOOR = [47, 29], FARM_DOOR = [0, 17];       // the east road's door tile on each side (map.js DOORS): stepping on one lands next to the other
const FARM_IN = [1, 17], TOWN_IN = [46, 29];
const passable = { town: (x, y) => npcTile(x, y) || (x === TOWN_DOOR[0] && y === TOWN_DOOR[1]), farm: (x, y) => farmTile(x, y) || (x === FARM_DOOR[0] && y === FARM_DOOR[1]) };

const paths = new Map();           // geometry only (the map never changes), shared by every room
let pathsMade = 0;
/** Tiles to walk from a to b in `area` for a villager, excluding the start; [] when already there or no way. */
export function route(area, a, b) {
  const key = `${area}:${a}>${b}`;
  let p = paths.get(key);
  if (!p) { pathsMade++; p = findPath(a[0], a[1], b[0], b[1], passable[area]); paths.set(key, p); }
  return p;
}
export const pathsComputed = () => pathsMade;

// ---- objects and what they relieve -----------------------------------------------------------------------------------------------------------

/** The affordances: `stands` are the tiles a villager uses it from, `effects` how much of each drive one use takes away, `pool` the lines about it. */
export const AFFORDANCES = [
  { id: 'fountain', area: 'town', pool: 'fountain', stands: [[23, 19], [24, 19], [23, 23], [24, 23], [21, 21], [26, 21]], effects: { social: 0.6, bored: 0.3 } },
  { id: 'plaza', area: 'town', pool: 'plaza', stands: [[18, 17], [29, 17], [18, 26], [29, 26], [24, 18], [24, 25]], effects: { social: 0.5, bored: 0.2 } },
  { id: 'bench-town', area: 'town', pool: 'bench', stands: [[21, 18], [26, 18], [21, 24], [26, 24], [36, 18], [40, 21]], effects: { tired: 0.6, social: 0.1 } },
  { id: 'shop', area: 'town', pool: 'shop', stands: [[34, 10], [36, 10]], effects: { bored: 0.5 } },
  { id: 'park', area: 'town', pool: 'park', stands: [[19, 30], [26, 30], [30, 30]], effects: { bored: 0.6, social: 0.1 } },
  { id: 'orchard', area: 'farm', pool: 'orchard', stands: [[7, 5], [10, 5], [13, 5], [4, 11], [7, 11], [10, 11], [13, 11], [16, 11]], effects: { hunger: 0.7 } },
  { id: 'fields', area: 'farm', pool: 'fields', stands: [[5, 20], [14, 20], [5, 25], [14, 25]], effects: { hunger: 0.55, bored: 0.1 } },
  { id: 'wheat', area: 'farm', pool: 'wheat', stands: [[27, 22], [33, 22], [38, 22], [30, 25], [36, 27]], effects: { hunger: 0.45, bored: 0.15 } },
  { id: 'well', area: 'farm', pool: 'well', stands: [[25, 15], [24, 14], [26, 14]], effects: { hunger: 0.3, social: 0.1 } },
  { id: 'barn', area: 'farm', pool: 'barn', stands: [[26, 6], [27, 6], [31, 6]], effects: { tired: 0.7 } },
  { id: 'bench-farm', area: 'farm', pool: 'bench', stands: [[27, 16]], effects: { tired: 0.5, social: 0.1 } },
  { id: 'pond', area: 'farm', pool: 'pond', stands: [[34, 29], [36, 29], [39, 31]], effects: { bored: 0.5 } },
  { id: 'scarecrow', area: 'farm', pool: 'scarecrow', stands: [[11, 28]], effects: { bored: 0.3, social: 0.3 } },
];
const RELIEVES = 0.25;             // an object serves a drive when one use takes at least this much of it
const serving = Object.fromEntries(DRIVES.map((d) => [d, AFFORDANCES.filter((a) => (a.effects[d] || 0) >= RELIEVES)]));

// ---- personalities --------------------------------------------------------------------------------------------------------------------------

const HOUSE_DOORS = HOUSES.filter((h) => !h.enter).map((h) => [h.x + h.door, h.y + 4]);       // the door tile of each house (a doormat on the path)
/**
 * Per villager: how fast each drive rises (per minute), a bias towards a drive, the bedtime in hours after midnight (never before 1) and the wake
 * time in hours (never before 6), and the home (a house door in the town or the barn's yard). Night owls go to bed late and wake late.
 */
export const PERSONA = {
  tito: { rates: { hunger: 0.12, tired: 0.2, bored: 0.1, social: 0.14 }, bias: { tired: 1.1 }, bed: 1.0, wake: 6.0, home: { area: 'town', at: HOUSE_DOORS[0] } },
  lula: { rates: { hunger: 0.1, tired: 0.1, bored: 0.18, social: 0.2 }, bias: { social: 1.15 }, bed: 2.5, wake: 8.0, home: { area: 'town', at: HOUSE_DOORS[1] } },
  pipo: { rates: { hunger: 0.14, tired: 0.1, bored: 0.2, social: 0.16 }, bias: { bored: 1.15 }, bed: 2.0, wake: 7.5, home: { area: 'town', at: HOUSE_DOORS[2] } },
  bruno: { rates: { hunger: 0.22, tired: 0.18, bored: 0.08, social: 0.1 }, bias: { hunger: 1.15 }, bed: 1.0, wake: 8.5, home: { area: 'town', at: HOUSE_DOORS[3] } },
  chispa: { rates: { hunger: 0.13, tired: 0.1, bored: 0.2, social: 0.12 }, bias: {}, bed: 3.0, wake: 8.0, home: { area: 'farm', at: [27, 6] } },
  perla: { rates: { hunger: 0.15, tired: 0.17, bored: 0.09, social: 0.16 }, bias: { tired: 1.05 }, bed: 1.0, wake: 6.0, home: { area: 'farm', at: [30, 6] } },
};
const START_DRIVES = { hunger: 0.35, tired: 0.1, bored: 0.3, social: 0.3 };       // the same fixed state every day

// ---- the town's clock -----------------------------------------------------------------------------------------------------------------------

const addDay = (date, n) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const clock = (h) => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/** The town day that holds server time `t`: { date, start, end } (06:00 to 06:00 America/Santiago) and `next` the following date. */
export function dayOf(t) {
  let date = msToZoned(t).date, start = zonedToMs(date, DAY_START);
  if (t < start) { date = addDay(date, -1); start = zonedToMs(date, DAY_START); }
  const next = addDay(date, 1);
  return { date, next, start, end: zonedToMs(next, DAY_START) };
}
/** The hour of the town's clock at `t` (0-24, fractional): what "bedtime" means. */
export function townHour(t) { const [h, m] = msToZoned(t).time.split(':').map(Number); return h + m / 60; }

/** The running sky shows as the villagers need them: [{ from, to }] in server ms, whole show length (a player's own "Volver" does not change the sky for the others). */
export function showSpans(events = []) {
  return events.filter((e) => e && Object.hasOwn(SHOWS, e.kind) && Number.isFinite(e.start_ms)).map((e) => ({ from: e.start_ms, to: e.start_ms + SHOWS[e.kind].dur * 1000 + SHOW_PAD_MS }));
}

// ---- one villager's day ---------------------------------------------------------------------------------------------------------------------

const dirOf = (a, b) => (b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] < a[1] ? 'up' : 'down');

class Timeline {
  constructor(seed, index, id, day, spans, stats) {
    const p = PERSONA[id];
    this.p = p; this.day = day; this.spans = spans; this.stats = stats;
    this.rand = mulberry32(hashSeed(`${seed}:needs:${id}:${day.start}`));
    this.bedMs = zonedToMs(day.next, clock(Math.max(EARLIEST_BED, p.bed + this.rand() * 0.3)));
    const wakeMs = zonedToMs(day.date, clock(Math.max(6, p.wake + this.rand() * 0.3)));
    this.vals = { ...START_DRIVES };
    this.pos = { area: p.home.area, x: p.home.at[0], y: p.home.at[1], d: 'down' };
    this.segs = []; this.t = day.start; this.cur = 0; this.done = false; this.slept = false;
    if (wakeMs > day.start) this.push({ kind: 'sleep', t1: Math.min(wakeMs, day.end), state: 'sleep', pool: 'home' });       // the day opens with the villager asleep in bed
  }
  spanAt(t) { return this.spans.find((s) => t >= s.from && t < s.to) || null; }
  push(seg) {
    const t0 = this.t, t1 = seg.t1 ?? t0 + seg.ms;
    const s = { ...seg, t0, t1, area: this.pos.area, x: this.pos.x, y: this.pos.y, d: this.pos.d };
    delete s.ms;
    this.segs.push(s); this.t = t1;
    if (s.kind !== 'sleep') for (const k of DRIVES) this.vals[k] = Math.min(1, this.vals[k] + (this.p.rates[k] * (t1 - t0)) / 60000);
    return s;
  }
  /** Walks `path` (tiles after the start) in `area`, starting from `from`. */
  walk(area, path, from, extra) {
    if (!path.length) return;
    const last = path[path.length - 1], a = path.length > 1 ? path[path.length - 2] : from;
    this.pos = { area, x: last[0], y: last[1], d: dirOf(a, last) };
    const s = this.push({ kind: 'walk', ms: path.length * NPC_STEP_MS, ...extra });
    s.area = area; s.from = from; s.path = path; s.x = last[0]; s.y = last[1];
  }
  /** Gets to `stand` of `area`, crossing the road when the villager is in the other area. */
  goTo(area, stand, extra) {
    const here = this.pos, at = [here.x, here.y];
    if (here.area === area) { this.walk(area, route(area, at, stand), at, extra); return; }
    if (area === 'farm') {
      this.walk('town', route('town', at, TOWN_DOOR), at, extra);
      this.walk('farm', [FARM_IN, ...route('farm', FARM_IN, stand)], FARM_DOOR, extra);
    } else {
      this.walk('farm', route('farm', at, FARM_DOOR), at, extra);
      this.walk('town', [TOWN_IN, ...route('town', TOWN_IN, stand)], TOWN_DOOR, extra);
    }
  }
  step() {
    if (this.t >= this.day.end) { this.done = true; return; }
    this.stats.steps++;
    const { home } = this.p;
    if (!this.slept && this.t >= this.bedMs && !this.spanAt(this.t)) {
      this.goTo(home.area, home.at, { state: 'walk', pool: 'home', aff: 'home' });
      let s = this.t, sp;
      while ((sp = this.spanAt(s))) s = sp.to;                                       // arrived in the middle of a show: waits, awake, until it is over
      if (s > this.t) this.push({ kind: 'stay', t1: s, state: 'wait', pool: 'home', aff: 'home' });
      this.slept = true;
      this.push({ kind: 'sleep', t1: Math.max(this.day.end, this.t + 1), state: 'sleep', pool: 'home', aff: 'home' });
      this.done = true;
      return;
    }
    // the most pressing drive (with a little taste of its own), an object for it, a walk there and a stay that lowers it
    let drive = DRIVES[0], best = -1;
    for (const k of DRIVES) { const sc = this.vals[k] * (this.p.bias[k] || 1) * (0.85 + 0.3 * this.rand()); if (sc > best) { best = sc; drive = k; } }
    const options = serving[drive], aff = options[Math.floor(this.rand() * options.length)], stand = aff.stands[Math.floor(this.rand() * aff.stands.length)];
    const before = this.t;
    this.goTo(aff.area, stand, { state: 'walk', pool: aff.pool, aff: aff.id, drive });
    const stay = Math.round(9000 + this.vals[drive] * 16000 + this.rand() * 5000);
    const was = this.vals[drive], seg = this.push({ kind: 'stay', ms: stay, state: 'use', pool: aff.pool, aff: aff.id, drive });
    const raised = this.vals[drive];                                                      // what it rose to while it stayed
    for (const [k, v] of Object.entries(aff.effects)) this.vals[k] = Math.max(0, this.vals[k] - v);
    seg.drive = drive; seg.before = was; seg.after = this.vals[drive]; seg.raised = raised; seg.started = before;
  }
  ensure(t) { while (!this.done && this.t <= t) this.step(); }
  /** The pose at `t`: the segment, the tile it left and the one it heads to, and how far through the step. */
  pose(t) {
    this.ensure(t);
    const segs = this.segs;
    let i = this.cur;
    if (!(i < segs.length && segs[i].t0 <= t && t < segs[i].t1)) {
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].t0 <= t) lo = mid; else hi = mid - 1; }
      i = this.cur = lo;
    }
    const s = segs[i], act = { state: s.state, pool: s.pool, aff: s.aff, drive: s.drive };
    if (s.kind === 'walk') {
      const p = Math.min(Math.max(t - s.t0, 0), s.t1 - s.t0 - 1), n = Math.floor(p / NPC_STEP_MS), from = n === 0 ? s.from : s.path[n - 1], to = s.path[n];
      return { area: s.area, x0: from[0], y0: from[1], x: to[0], y: to[1], k: (p % NPC_STEP_MS) / NPC_STEP_MS, moving: true, d: dirOf(from, to), asleep: false, act };
    }
    return { area: s.area, x0: s.x, y0: s.y, x: s.x, y: s.y, k: 0, moving: false, d: s.kind === 'sleep' ? 'down' : s.d, asleep: s.kind === 'sleep', act };
  }
}

// ---- a room's world -----------------------------------------------------------------------------------------------------------------------

/**
 * The villagers' world for a room: `poses(t, spans)` puts every villager (VILLAGERS order, `ids`) at server time `t`;
 * `pose(i, t, spans)` one of them; `segments(i, t, spans)` its timeline up to `t`. The timelines of a (day, shows that touch it) are built once and kept.
 */
export function createWorld(seed, ids = Object.keys(PERSONA)) {
  const days = new Map(), stats = { days: 0, steps: 0 };
  let lastDay = null;
  function lineup(t, spans) {
    if (!lastDay || t < lastDay.start || t >= lastDay.end) lastDay = dayOf(t);
    const day = lastDay, touching = spans.filter((s) => s.to > day.start && s.from < day.end);
    const key = `${day.start}|${touching.map((s) => `${s.from}-${s.to}`).join(',')}`;
    let tls = days.get(key);
    if (!tls) {
      tls = ids.map((id, i) => new Timeline(seed, i, id, day, touching, stats));
      days.set(key, tls); stats.days++;
      if (days.size > 6) days.delete(days.keys().next().value);
    }
    return tls;
  }
  return {
    stats,
    pose: (i, t, spans = []) => lineup(Math.floor(t), spans)[i].pose(Math.floor(t)),
    poses: (t, spans = []) => lineup(Math.floor(t), spans).map((tl) => tl.pose(Math.floor(t))),
    segments(i, t, spans = []) { const tl = lineup(Math.floor(t), spans)[i]; tl.ensure(Math.floor(t)); return tl.segs; },
    bedtime: (i, t, spans = []) => lineup(Math.floor(t), spans)[i].bedMs,
  };
}
