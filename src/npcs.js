// The town's villagers: three NPCs built from the pet sprites (a colour variant and a couple of accessories each) that stroll the north of
// the town and say short lines in speech bubbles, plus the shopkeeper's greetings. Nothing here goes over the network: where a villager is and
// what it says are pure functions of (room code, server time), so every player in the room sees the same one in the same spot. Their routes
// are fixed loops of waypoints on open tiles, walked at pet speed with pauses; the lines are drawn from a pool per (villager, time slot).
import { isWalkable, tileAt, doorAt, TILES, inZone, GAME_IDS } from './map.js';
import { findPath } from './path.js';
import { Walker, STEP_MS } from './walker.js';
import { hashSeed, mulberry32 } from './life.js';

export const SLOT_MS = 13000;             // a villager may speak once per slot...
export const SAY_MS = 4200;               // ...for this long, from the start of the slot (each villager's slots are shifted by its own offset)
export const SAY_CHANCE = 0.7;
const WAYPOINTS = 5, MIN_APART = 7;       // a route: this many stops, at least this many tiles from each other
const HOME = [24, 22];                    // a tile of the plaza: the routes use the open tiles connected to it

/** Where every villager may stand: open ground that is not a hiding bush, a door, or inside the Parque where the games are played. */
export const npcTile = (x, y) => isWalkable(x, y, 'town') && !TILES[tileAt(x, y, 'town')].hide && !doorAt(x, y, 'town') && !GAME_IDS.some((g) => inZone(g, x, y));

// Each villager: a name, a look (slots head, face, neck, back), the body's hue shift and the pool of lines it draws from.
export const VILLAGERS = [
  { id: 'tito', name: 'Don Tito', look: { species: 'frog', stage: 3, items: ['tophat', '', 'scarf', ''] }, variant: { id: 'tito', hue: 150, sat: 2.2 }, lines: [
    '¡Qué buen día para caminar!', 'Cuando yo era renacuajo, esto era puro pasto.', 'Las moscas ya no son lo que eran.', 'Despacito se llega lejos.',
    'Mi sombrero tiene mil historias.', '¿Ya probaron la fuente? Es muy fresquita.', 'Un paseo al día, alegría.', 'Saluden a todos, no cuesta nada.',
    '¡Cuidado con los charcos, jóvenes!', 'Aquí siempre se está bien.', 'Hoy me siento con suerte.', 'Hmm... creo que olvidé algo.',
  ] },
  { id: 'lula', name: 'Lula', look: { species: 'cat', stage: 2, items: ['bow', '', 'bell_collar', ''] }, variant: { id: 'lula', hue: -40 }, lines: [
    '¡Hola, hola! ¿Cómo están?', 'Mi cascabel suena bonito, ¿verdad?', '¡Me encanta pasear por la plaza!', 'Shhh... estoy buscando mariposas.',
    '¿Alguien vio mi ovillo de lana?', 'Hoy huele a flores.', '¡Qué lindo lazo, qué lindo día!', 'Me dio sueño al sol.',
    'Miau... digo, ¡hola!', '¿Jugamos en el parque?', 'Los amigos hacen todo mejor.', '¡Qué bonito está el pueblo!',
  ] },
  { id: 'pipo', name: 'Pipo', look: { species: 'seal', stage: 1, items: ['beanie', 'sunglasses', '', ''] }, variant: { id: 'pipo', hue: -60 }, lines: [
    '¡Plash! Es mi saludo favorito.', 'Me gustan mis lentes, ¿a ustedes?', '¡Corramos una carrera!', '¿Saben nadar? Yo sí.',
    'Hoy aprendí algo nuevo.', '¡Qué divertido es pasear!', 'Mi gorro es súper abrigado.', 'Quiero conocer a todos.',
    '¿Quién me persigue?', 'Los peces también juegan, ¿saben?', '¡Hola, amigo!', 'Hoy va a ser un gran día.',
  ] },
];
export const NIGHT_LINES = ['¡Qué linda la noche!', 'Miren cuántas luces.', 'Ya casi es hora de dormir...', 'La luna está preciosa.'];
export const SHOW_LINES = ['¡Miren el cielo!', '¡Qué colores tan bonitos!', '¡Guau, qué espectáculo!', '¡Está lindísimo!'];

// ---- routes -----------------------------------------------------------------------------------------------------------------------------

let reach = null;                         // the open tiles connected to HOME (the map never changes, so once)
function reachable() {
  if (reach) return reach;
  const seen = new Set([HOME.join(',')]), queue = [HOME], out = [];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    out.push([x, y]);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (!seen.has(k) && npcTile(nx, ny)) { seen.add(k); queue.push([nx, ny]); }
    }
  }
  return (reach = out.filter(([x, y]) => tileAt(x, y, 'town') !== 'm'));       // (a doormat is a doorstep: keep clear of it)
}

/** A villager's loop for a room: { legs: [{ path, walkMs, pauseMs }], cycleMs, offset, start } built from the seed alone. */
export function routeFor(seed, index) {
  const rand = mulberry32(hashSeed(`${seed}:npc:${VILLAGERS[index].id}`));
  const open = reachable(), stops = [];
  for (let tries = 0; stops.length < WAYPOINTS && tries < 400; tries++) {
    const c = open[Math.floor(rand() * open.length)];
    if (stops.every((s) => Math.abs(s[0] - c[0]) + Math.abs(s[1] - c[1]) >= MIN_APART)) stops.push(c);
  }
  const legs = [];
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i], b = stops[(i + 1) % stops.length];
    const path = findPath(a[0], a[1], b[0], b[1], npcTile);
    if (path.length) legs.push({ from: a, path, walkMs: path.length * STEP_MS, pauseMs: Math.round(2500 + rand() * 5500) });
  }
  const cycleMs = legs.reduce((s, l) => s + l.walkMs + l.pauseMs, 0);
  return { legs, cycleMs, start: stops[0], offset: Math.floor(rand() * cycleMs), sayOffset: Math.floor(rand() * SLOT_MS) };
}

/** Where a route is at server time `t` (ms): { x0, y0, x, y, k (0-1 through the step), moving, d } with the tile it left and the one it heads to. */
export function poseAt(route, t) {
  let p = (Math.floor(t) + route.offset) % route.cycleMs, d = 'down';
  for (const leg of route.legs) {
    if (p < leg.walkMs) {
      const i = Math.floor(p / STEP_MS), from = i === 0 ? leg.from : leg.path[i - 1], to = leg.path[i];
      return { x0: from[0], y0: from[1], x: to[0], y: to[1], k: (p % STEP_MS) / STEP_MS, moving: true, d: to[0] > from[0] ? 'right' : to[0] < from[0] ? 'left' : to[1] < from[1] ? 'up' : 'down' };
    }
    p -= leg.walkMs;
    const end = leg.path[leg.path.length - 1];
    if (leg.path.length > 1) { const a = leg.path[leg.path.length - 2]; d = end[0] > a[0] ? 'right' : end[0] < a[0] ? 'left' : end[1] < a[1] ? 'up' : 'down'; }
    if (p < leg.pauseMs) return { x0: end[0], y0: end[1], x: end[0], y: end[1], k: 0, moving: false, d };
    p -= leg.pauseMs;
  }
  return { x0: route.start[0], y0: route.start[1], x: route.start[0], y: route.start[1], k: 0, moving: false, d };
}

// ---- lines ------------------------------------------------------------------------------------------------------------------------------

/** What villager `index` of room `seed` says at server time `t`, or null while it is quiet. `ctx`: { night, show } (the same ones for everybody who has the same). */
export function lineAt(seed, index, t, ctx = {}, sayOffset = 0) {
  const v = VILLAGERS[index], at = Math.floor(t) + sayOffset, slot = Math.floor(at / SLOT_MS);
  const rand = mulberry32(hashSeed(`${seed}:say:${v.id}:${slot}`));
  const speaks = rand() < SAY_CHANCE, pick = rand(), mood = rand();
  if (!speaks || at % SLOT_MS >= SAY_MS) return null;
  const pool = ctx.show && mood < 0.6 ? SHOW_LINES : ctx.night && mood < 0.4 ? NIGHT_LINES : v.lines;
  return pool[Math.floor(pick * pool.length)];
}

// ---- looks ------------------------------------------------------------------------------------------------------------------------------

/** Shifts the hue of the coloured pixels of RGBA `data` (a Uint8ClampedArray) by `deg` degrees (and multiplies their saturation by `sat`); greys (outlines, eyes) stay as they are. */
export function shiftHue(data, deg, sat = 1) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, c = mx - mn;
    if (c < 0.05) continue;
    const s = Math.min(1, (c / (1 - Math.abs(2 * l - 1))) * sat);
    let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
    h = (((h * 60 + deg) % 360) + 360) % 360;
    const k = (1 - Math.abs(2 * l - 1)) * s, x = k * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - k / 2;
    const [r2, g2, b2] = h < 60 ? [k, x, 0] : h < 120 ? [x, k, 0] : h < 180 ? [0, k, x] : h < 240 ? [0, x, k] : h < 300 ? [x, 0, k] : [k, 0, x];
    data[i] = Math.round((r2 + m) * 255); data[i + 1] = Math.round((g2 + m) * 255); data[i + 2] = Math.round((b2 + m) * 255);
  }
}

/** The browser's way to recolour the pets sheet: a canvas copy with the hue shifted. */
export function recolourSheet(sheet, variant) {
  const c = Object.assign(document.createElement('canvas'), { width: sheet.width, height: sheet.height }), x = c.getContext('2d');
  x.drawImage(sheet, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height);
  shiftHue(img.data, variant.hue, variant.sat || 1);
  x.putImageData(img, 0, 0);
  return c;
}

/** A cache of recoloured sprite sets, one per variant id (the sheet is recoloured once, however many frames ask). `render(sheet, variant)` makes the sheet. */
export function createVariants(render = recolourSheet) {
  const cache = new Map();
  return {
    /** `sprites` with its pets sheet recoloured for `variant` ({ id, hue }): the same object for the same variant. */
    get(sprites, variant) {
      let s = cache.get(variant.id);
      if (!s || s.base !== sprites.pets) { s = { base: sprites.pets, sprites: { ...sprites, pets: render(sprites.pets, variant) } }; cache.set(variant.id, s); }
      return s.sprites;
    },
    get size() { return cache.size; },
  };
}

// ---- the villagers as scene entities ------------------------------------------------------------------------------------------------------

/**
 * The villagers of a room. `update(t, ctx)` places them for server time `t` and returns entities as render.js draws them
 * ({ id, name, look, walker, emote, say, npc, sprites }); the same objects every call.
 */
export function createNpcs({ seed, sprites, variants = createVariants() }) {
  const ents = VILLAGERS.map((v, i) => {
    const route = routeFor(seed, i), ok = v.look.items.every((it) => !it || (sprites.catalogue && sprites.catalogue[it]));
    const look = ok ? v.look : { ...v.look, items: ['', '', '', ''] };
    return { route, entity: { id: `npc:${v.id}`, name: v.name, look, walker: new Walker(route.start[0], route.start[1]), emote: null, jumpAt: null, say: null, npc: true, sprites: variants.get(sprites, v.variant) } };
  });
  return {
    update(t, ctx = {}) {
      return ents.map(({ route, entity }, i) => {
        const p = poseAt(route, t), w = entity.walker;
        w.fx = p.x0; w.fy = p.y0; w.tx = p.x; w.ty = p.y; w.moving = p.moving; w.t = p.k * STEP_MS; w.d = p.d;
        entity.say = lineAt(seed, i, t, ctx, route.sayOffset);
        return entity;
      });
    },
  };
}

// ---- the shopkeeper ---------------------------------------------------------------------------------------------------------------------

export const SHOPKEEPER = { head: { x: 112, y: 34 }, stand: { x: 6.5, y: 5.5 }, near: 3 };        // the raccoon's head (map px of the shop) and the spot in front of the counter
export const SHOP_LINES = ['¡Hola! La tienda abre muy pronto.', '¡Bienvenido! Estamos preparando todo.', '¡Qué bueno verte! Vuelve pronto.', 'Estoy acomodando los estantes...'];
export const SHOP_SAY_MS = 4200;

/** Is a pet at tile (x, y) close enough to the counter for the shopkeeper to greet it? */
export const nearShopkeeper = (x, y) => Math.hypot(x - SHOPKEEPER.stand.x + 0.5, y - SHOPKEEPER.stand.y + 0.5) <= SHOPKEEPER.near;
/** The greeting for the n-th time a pet steps up to the counter (the first one is the plain announcement). */
export const shopGreeting = (n) => SHOP_LINES[((n % SHOP_LINES.length) + SHOP_LINES.length) % SHOP_LINES.length];
