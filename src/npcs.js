// The town's villagers: six NPCs built from the pet sprites (a colour variant and a couple of accessories each; Don Tito, Lula and Pipo are
// a frog, a cat and a seal, Bruno, Chispa and Doña Perla a bear, a raccoon and an elephant, animals that are not playable yet) that live in the
// town and on the farm, plus the shopkeeper (a raccoon too) and her greetings. What they do (npc-world.js: drives, objects, sleep) and what they
// say are pure functions of (room code, server time), so every player in the room sees the same one in the same spot; nothing here goes over the
// network. They say short lines in speech bubbles: from their own pool, or about what they attend to (the object they use or walk to, the drive
// that moves them, the local player's pet when it is near). The lines are drawn per (villager, time slot).
import { Walker } from './walker.js';
import { hashSeed, mulberry32 } from './life.js';
import { createWorld, NPC_STEP_MS } from './npc-world.js';
import { FARM } from './map.js';
import { CLERK_LINES } from './tools.js';

export { npcTile, showSpans } from './npc-world.js';
export const SLOT_MS = 13000;             // a villager may speak once per slot...
export const SAY_MS = 4200;               // ...for this long, from the start of the slot (each villager's slots are shifted by its own offset)
export const SAY_CHANCE = 0.7;
export const NEAR_PET = 3.5;              // a villager greets the local pet from this many tiles
export const SLEEP_LINE = 'Zzz...';

// Each villager: a name, a look (slots head, face, neck, back), the body's hue shift (none: the species' own colours; an elder's pale body has no
// hue left to shift) and the pool of lines it draws from.
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
  { id: 'bruno', name: 'Bruno', look: { species: 'bear', stage: 2, items: ['beanie', '', 'scarf', ''] }, variant: { id: 'bruno', hue: -14, sat: 1.1 }, lines: [
    '¡Mmm, huele a miel por aquí!', 'Cuando hace frío, me quedo en casa.', 'Mi bufanda es la más abrigada del pueblo.', 'Una siesta nunca está de más.',
    'Un oso no se apura: pasea.', 'Dicen que en el bosque hay panales enormes.', '¿Alguien tiene un poquito de miel?', 'Hoy desperté con ganas de abrazar.',
    '¡Buen día, vecinos! Qué lindo paseo.', 'Me gusta contar nubes desde el pasto.', 'Mi gorro no se cae, ni con viento.', 'Grrr... es mi manera de saludar.',
  ] },
  { id: 'chispa', name: 'Chispa', look: { species: 'raccoon', stage: 1, items: ['', 'sunglasses', '', 'cape'] }, variant: { id: 'chispa', hue: 28, sat: 3 }, lines: [
    '¡Shh! Busco tesoros brillantes.', 'Encontré una moneda... ¡y un botón!', 'De noche veo todo mejor, ¿saben?', 'Mi antifaz es de nacimiento, ¿vieron?',
    '¿Quién se llevó mi galleta? Ejem...', 'Me encanta revisar los rincones.', 'Las manitas sirven para todo.', '¡Miren qué lentes tan geniales!',
    'Hoy me porté bien, casi siempre.', '¿Jugamos a las escondidas?', 'Mi capa me da superpoderes.', 'Lo perdido aparece en mi bolsillo.',
  ] },
  { id: 'perla', name: 'Doña Perla', look: { species: 'elephant', stage: 3, items: ['bow', '', 'scarf', ''] }, lines: [
    'Un elefante nunca olvida a un amigo.', 'Con calma y buen paso se llega a todo.', 'Recuerdo cuando este pueblo era un prado.', '¿Ya regaron las plantas esta mañana?',
    'Una ducha con la trompa y listo.', 'Mi lazo es el favorito de mi nieta.', 'Mi memoria es larga, mi paseo, lento.', 'Qué alegría verlos a todos juntos.',
    'Cuiden a los más pequeños, ¿sí?', 'El agua de la fuente me da paz.', 'El sol de hoy trae buenos recuerdos.', '¡Trompetazo de alegría! Priiii...',
  ] },
];
export const NIGHT_LINES = ['¡Qué linda la noche!', 'Miren cuántas luces.', 'Ya casi es hora de dormir...', 'La luna está preciosa.'];
export const SHOW_LINES = ['¡Miren el cielo!', '¡Qué colores tan bonitos!', '¡Guau, qué espectáculo!', '¡Está lindísimo!'];

// ---- lines ------------------------------------------------------------------------------------------------------------------------------

/** What a villager says about the object it uses or walks to (`act.pool`, see AFFORDANCES) and about the drive that moves it. */
export const OBJECT_LINES = {
  orchard: ['¡Qué ricas manzanas!', 'Estas frutas están en su punto.', 'Mmm, huele a fruta fresca.', 'Una manzana al día, alegría.'],
  fields: ['¡Qué buenas zanahorias!', 'La tierra está bien húmeda hoy.', 'Las lechugas crecen rapidísimo.', 'Esta zapallera va a dar mucho.'],
  wheat: ['El trigo huele a pan recién hecho.', '¡Qué dorado está el trigo!', 'Escucho cómo susurra el trigal.', 'Pronto habrá harina de sobra.'],
  well: ['El agua del pozo está fresquita.', 'Un traguito de agua y sigo.', '¡Qué profundo es este pozo!', 'Aquí el agua nunca se acaba.'],
  barn: ['Qué calentito se está en el establo.', 'El heno huele riquísimo.', 'Un ratito a la sombra y listo.', 'Este establo es muy tranquilo.'],
  bench: ['Necesito un descanso…', 'Qué cómodo está este banco.', 'Me siento un ratito, ¿sí?', 'Descansar un poquito hace bien.'],
  fountain: ['Me encanta el sonido de la fuente.', '¡Qué buen lugar para charlar!', 'El agua de la fuente brilla hoy.', 'Aquí se junta todo el pueblo.'],
  plaza: ['La plaza está preciosa hoy.', '¿Con quién conversaré en la plaza?', '¡Qué lindo es ver a todos pasear!', 'En la plaza siempre pasa algo.'],
  shop: ['¿Qué habrá hoy en la tienda?', 'Me gustaría ver esa vitrina.', 'Algún día compraré algo lindo.', '¡Qué cosas tan bonitas venden!'],
  park: ['¡Voy al parque a jugar!', 'Qué ganas de correr un rato.', 'En el parque nunca me aburro.', '¿Habrá juegos en el parque?'],
  pond: ['¡Miren las ondas del estanque!', 'El estanque está muy tranquilo.', 'Quizás pesque algo… o no.', 'Me encanta mirar el agua quieta.'],
  scarecrow: ['Buen día, señor espantapájaros.', 'Este espantapájaros escucha muy bien.', 'Hola, amigo de paja, ¿cómo estás?', 'Nunca se queja de nada, qué buen vecino.'],
  home: ['Ya es hora de dormir…', 'Qué sueño, me voy a casa.', 'Mañana será otro lindo día.', 'Buenas noches a todos.'],
};
export const DRIVE_LINES = {
  hunger: ['Tengo hambre… ¿qué habrá de comer?', 'Mi pancita está rugiendo.', 'Ya casi es hora de comer algo rico.'],
  tired: ['Necesito un descanso…', 'Uf, qué cansancio.', 'Mis patitas piden sentarse un rato.'],
  bored: ['Qué aburrido… ¿qué hago?', 'Quiero hacer algo divertido.', 'Hoy me falta algo que hacer.'],
  social: ['¿Con quién charlo hoy?', 'Qué ganas de conversar con alguien.', 'Me siento solito, ¿hay alguien por aquí?'],
};
const petLines = (name) => [`¡Hola, ${name}!`, `¡${name}, qué gusto verte!`, `${name}, ¡qué linda mascota!`, `¿Cómo estás, ${name}?`];

/** The line a slot would say before the "not the same twice" rule: { pool, idx } or null when quiet. `ctx`: { night, show, pet (the name of a pet that is near) }. */
function rawLine(seed, index, slot, ctx, sayOffset, actAt) {
  const v = VILLAGERS[index], rand = mulberry32(hashSeed(`${seed}:say:${v.id}:${slot}`));
  const speaks = rand() < SAY_CHANCE, pick = rand(), mood = rand(), pick2 = rand();
  if (!speaks) return null;
  const act = actAt ? actAt(slot * SLOT_MS - sayOffset) : null;       // what it is doing as the slot begins: the line stays the same for all of it
  if (act && act.state === 'sleep') return null;
  let pool = v.lines;
  if (ctx.show && mood < 0.6) pool = SHOW_LINES;
  else if (ctx.pet && mood < 0.5) pool = petLines(ctx.pet);
  else if (act && act.pool === 'home' && mood < 0.7) pool = OBJECT_LINES.home;
  else if (ctx.night && mood < 0.4) pool = NIGHT_LINES;
  else if (act && act.pool && mood < 0.75) pool = act.state === 'walk' && act.drive && pick2 < 0.5 ? DRIVE_LINES[act.drive] : OBJECT_LINES[act.pool];
  return { pool, idx: Math.floor(pick * pool.length) };
}

function slotLine(seed, index, slot, ctx, sayOffset, actAt) {
  const raw = rawLine(seed, index, slot, ctx, sayOffset, actAt);
  if (!raw) return null;
  let idx = raw.idx;
  const prev = rawLine(seed, index, slot - 1, ctx, sayOffset, actAt);
  // never the same line twice in a row: the previous slot said its own pick or, when that repeated its own predecessor, the next one in its pool
  if (prev && [prev.pool[prev.idx], prev.pool[(prev.idx + 1) % prev.pool.length]].includes(raw.pool[idx]) && slotLine(seed, index, slot - 1, ctx, sayOffset, actAt) === raw.pool[idx]) idx = (idx + 1) % raw.pool.length;
  return raw.pool[idx];
}

/**
 * What villager `index` of room `seed` says at server time `t`, or null while it is quiet. `ctx`: { night, show, pet }; `actAt(t)`: what the villager
 * does at server time t ({ state, pool, drive }, npc-world.js), so it can talk about it.
 */
export function lineAt(seed, index, t, ctx = {}, sayOffset = 0, actAt = null) {
  const at = Math.floor(t) + sayOffset;
  if (at % SLOT_MS >= SAY_MS) return null;
  return slotLine(seed, index, Math.floor(at / SLOT_MS), ctx, sayOffset, actAt);
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
 * ({ id, name, look, walker, emote, say, npc, area, asleep, sprites }); the same objects every call. Every villager is returned, wherever it is:
 * the caller draws the ones whose `area` is the player's. `ctx`: { night, show (this screen's), shows (npc-world's showSpans, the same for all), pet
 * ({ name, area, x, y }, the local pet: a villager greets it when it is near, so that line is per screen) }.
 */
export function createNpcs({ seed, sprites, variants = createVariants() }) {
  const world = createWorld(seed, VILLAGERS.map((v) => v.id));
  const ents = VILLAGERS.map((v, i) => {
    const ok = v.look.items.every((it) => !it || (sprites.catalogue && sprites.catalogue[it]));
    const look = ok ? v.look : { ...v.look, items: ['', '', '', ''] };
    const sayOffset = Math.floor(mulberry32(hashSeed(`${seed}:npc:${v.id}`))() * SLOT_MS);
    return { sayOffset, entity: { id: `npc:${v.id}`, name: v.name, look, walker: new Walker(0, 0), emote: null, jumpAt: null, say: null, npc: true, area: 'town', asleep: false, sprites: v.variant ? variants.get(sprites, v.variant) : sprites } };
  });
  const clerkOk = CLERK.look.items.every((it) => !it || (sprites.catalogue && sprites.catalogue[it]));
  const clerk = { id: `npc:${CLERK.id}`, name: CLERK.name, look: clerkOk ? CLERK.look : { ...CLERK.look, items: ['', '', '', ''] }, walker: new Walker(CLERK.tile[0], CLERK.tile[1], 'down'), emote: null, jumpAt: null, say: null, npc: true, clerk: true, area: 'farm', asleep: false, sprites: variants.get(sprites, CLERK.variant) };
  return {
    world,
    /** The Almacén's clerk: one fixed entity in the farm (always awake, not part of the villagers' routines); the town sets its `say` when a pet comes by. */
    clerk,
    update(t, ctx = {}) {
      const spans = ctx.shows || [], poses = world.poses(t, spans), pet = ctx.pet;
      return ents.map(({ entity, sayOffset }, i) => {
        const p = poses[i], w = entity.walker;
        w.fx = p.x0; w.fy = p.y0; w.tx = p.x; w.ty = p.y; w.moving = p.moving; w.stepOverride = NPC_STEP_MS; w.t = p.k * NPC_STEP_MS; w.d = p.d;
        entity.area = p.area; entity.asleep = p.asleep;
        if (p.asleep) entity.say = SLEEP_LINE;
        else {
          const near = pet && pet.area === p.area && Math.hypot(pet.x - p.x, pet.y - p.y) <= NEAR_PET;
          entity.say = lineAt(seed, i, t, { night: ctx.night, show: ctx.show, pet: near ? pet.name : null }, sayOffset, (tt) => world.pose(i, tt, spans).act);
        }
        return entity;
      });
    },
  };
}

// ---- the Almacén's clerk ----------------------------------------------------------------------------------------------------------------

/** The clerk stands behind the stall's counter (FARM.store); pets come from the south. `near`: tiles from which the stall can be used and the clerk greets. */
export const CLERK = { id: 'clerk', name: 'Don Beto', look: { species: 'bear', stage: 2, items: ['tophat', '', 'bell_collar', ''] }, variant: { id: 'clerk', hue: 40, sat: 1.3 }, tile: [FARM.store.x + 1, FARM.store.y] };
/** Is a pet at tile (x, y) at the stall's counter (the row below it, or one further, from a tile before its left end to one after its right end)? */
export const nearStore = (x, y) => x >= FARM.store.x - 1 && x <= FARM.store.x + FARM.store.w && y >= FARM.store.y + FARM.store.h && y <= FARM.store.y + FARM.store.h + 1;
/** The clerk's greeting for the n-th time a pet comes to the counter. */
export const clerkGreeting = (n) => CLERK_LINES[((n % CLERK_LINES.length) + CLERK_LINES.length) % CLERK_LINES.length];

// ---- the shopkeeper ---------------------------------------------------------------------------------------------------------------------

// The shopkeeper is a raccoon of the pets' own art (an adult in a shop bell collar), drawn like any pet behind the counter: `cell` is the top left of its
// 32 px cell in map px of the shop, `head` the top of its head (where its speech bubble points) and `stand` the spot in front of the counter.
export const SHOPKEEPER = { head: { x: 112, y: 28 }, stand: { x: 6.5, y: 5.5 }, near: 3, cell: { x: 96, y: 26 }, look: { species: 'raccoon', stage: 2, items: ['', '', 'bell_collar', ''] } };
export const SHOP_LINES = ['¡Hola! La tienda abre muy pronto.', '¡Bienvenido! Estamos preparando todo.', '¡Qué bueno verte! Vuelve pronto.', 'Estoy acomodando los estantes...'];
export const SHOP_SAY_MS = 4200;

/** Is a pet at tile (x, y) close enough to the counter for the shopkeeper to greet it? */
export const nearShopkeeper = (x, y) => Math.hypot(x - SHOPKEEPER.stand.x + 0.5, y - SHOPKEEPER.stand.y + 0.5) <= SHOPKEEPER.near;
/** The greeting for the n-th time a pet steps up to the counter (the first one is the plain announcement). */
export const shopGreeting = (n) => SHOP_LINES[((n % SHOP_LINES.length) + SHOP_LINES.length) % SHOP_LINES.length];
