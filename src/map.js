// The world: named areas (the town, the farm outside it and the shop interior), each a grid of 16 px tiles. Tiles are solid or walkable; a few walkable
// tiles are doors that move a pet to another area. The renderer (art.js) draws every char; the game rules only read this file.

export const TILE = 16;

/** Tile kinds: char -> { name, solid, hide? }. Town chars first, then the farm's, then the interior ones. */
export const TILES = {
  '.': { name: 'grass', solid: false },
  ',': { name: 'flowers', solid: false },     // grass with a few wild flowers
  '=': { name: 'path', solid: false },
  '+': { name: 'plaza', solid: false },
  'm': { name: 'mat', solid: false },          // a doormat on the path
  'b': { name: 'bush', solid: false, hide: true },   // a hiding spot (hide and seek)
  'B': { name: 'flowerbed', solid: true },
  'h': { name: 'hedge', solid: true },
  'F': { name: 'fence', solid: true },
  't': { name: 'oak', solid: true },
  'T': { name: 'pine', solid: true },
  '~': { name: 'pond', solid: true },
  'o': { name: 'fountain', solid: true },
  'L': { name: 'lamp', solid: true },
  'n': { name: 'bench', solid: true },
  'S': { name: 'sign', solid: true },
  'H': { name: 'building', solid: true },     // roof, wall or the door of a house that cannot be entered
  'E': { name: 'door', solid: false },         // a door that can be entered (see DOORS)
  // the game places in the Parque (see GAME_PLACES)
  'p': { name: 'spot', solid: false },         // the pad a pet stands on to start a game
  'a': { name: 'gate', solid: false },         // the open gate of the gallinero
  'G': { name: 'coop', solid: true },
  'y': { name: 'pitch', solid: false },        // the cancha's grass
  'g': { name: 'goal', solid: true },
  'j': { name: 'track', solid: false },        // the pista's lanes
  'V': { name: 'hurdle', solid: false },       // walkable: stepping onto it slows the pet
  'w': { name: 'puddle', solid: false },
  'W': { name: 'hay', solid: false },          // a hay bale on the pista: walkable, it slows the pet
  'f': { name: 'finish', solid: false },       // the checkered finish row of the pista
  // the farm (La Granja): crops are walkable soil, the barn, the well, the scarecrow and the fruit trees are solid
  'd': { name: 'furrow', solid: false },
  'C': { name: 'carrots', solid: false },
  'U': { name: 'lettuce', solid: false },
  'P': { name: 'pumpkins', solid: false },
  'Y': { name: 'wheat', solid: false },
  'A': { name: 'fruit tree', solid: true },
  'R': { name: 'barn', solid: true },
  'v': { name: 'well', solid: true },
  'Z': { name: 'scarecrow', solid: true },
  'M': { name: 'stall', solid: true },         // the Almacén's stall (see FARM.store)
  // the shop
  '_': { name: 'floor', solid: false },
  'r': { name: 'rug', solid: false },
  'e': { name: 'exit', solid: false },
  'x': { name: 'wall', solid: true },
  'k': { name: 'shelf', solid: true },
  'u': { name: 'table', solid: true },
  'c': { name: 'counter', solid: true },
  'q': { name: 'plant', solid: true },
  'z': { name: 'crates', solid: true },
  'N': { name: 'shopkeeper', solid: true },
};

export const DEFAULT_AREA = 'town';

/** The plaza's rectangle (stone paving; the fountain, benches, lamps and planters stand on it). */
export const PLAZA = { x: 16, y: 15, w: 16, h: 13 };
export const inPlaza = (x, y) => x >= PLAZA.x && y >= PLAZA.y && x < PLAZA.x + PLAZA.w && y < PLAZA.y + PLAZA.h;

/** The east garden (flower beds behind a fence) and the Parque (the whole south field): where the butterflies and fireflies of life.js live. */
export const GARDEN = { x: 35, y: 16, w: 9, h: 10 };
export const PARQUE = { x: 3, y: 32, w: 42, h: 41 };

/** Houses (roof 2 rows + wall 2 rows). `door` is the tile offset of the door in the bottom row; `enter` marks the shop. */
export const HOUSES = [
  { x: 4, y: 6, w: 5, door: 2, roof: 'red', wall: 'brick', windows: [0, 4] },
  { x: 11, y: 6, w: 5, door: 2, roof: 'blue', wall: 'plaster', windows: [0, 4] },
  { x: 32, y: 6, w: 7, door: 3, roof: 'teal', wall: 'shop', windows: [1, 5], enter: 'shop' },
  { x: 41, y: 6, w: 5, door: 2, roof: 'plum', wall: 'wood', windows: [0, 4] },
  { x: 4, y: 17, w: 5, door: 2, roof: 'orange', wall: 'brick', windows: [0, 4] },
];

/** Doors: stepping on `at` moves the pet to (to.x, to.y) of area `to.area`, looking `to.d`. */
export const DOORS = {
  town: [
    { x: 35, y: 9, to: { area: 'shop', x: 6, y: 10, d: 'up' } },
    { x: 47, y: 29, to: { area: 'farm', x: 1, y: 17, d: 'right' } },          // the road east out of the town: the two tiles of its end
    { x: 47, y: 30, to: { area: 'farm', x: 1, y: 18, d: 'right' } },
  ],
  farm: [
    { x: 0, y: 17, to: { area: 'town', x: 46, y: 29, d: 'left' } },
    { x: 0, y: 18, to: { area: 'town', x: 46, y: 30, d: 'left' } },
  ],
  shop: [
    { x: 6, y: 11, to: { area: 'town', x: 35, y: 10, d: 'down' } },
    { x: 7, y: 11, to: { area: 'town', x: 35, y: 10, d: 'down' } },
  ],
};

/** Text boards drawn over the scene. x may be fractional (tile units); the board floats above the tile. */
export const SIGNS = [
  { area: 'town', x: 21, y: 31, text: 'Parque', sub: 'Para jugar' },
  { area: 'town', x: 33, y: 10, text: 'Tienda', sub: 'Abierto', below: true },
  { area: 'town', x: 16, y: 34, text: 'Escondida', sub: 'Jugar' },
  { area: 'town', x: 33, y: 42, text: 'Gallina', sub: 'Jugar' },
  { area: 'town', x: 13, y: 57, text: 'Cancha', sub: 'Jugar' },
  { area: 'town', x: 43, y: 69, text: 'Pista', sub: 'Jugar' },
  { area: 'town', x: 42, y: 28, text: 'La Granja', sub: 'Al este' },
  { area: 'farm', x: 2, y: 16, text: 'Pueblo', sub: 'Al oeste' },
  { area: 'farm', x: 36, y: 15, text: 'Almacén', sub: 'Herramientas' },
  { area: 'shop', x: 6.5, y: 2, text: 'Tienda', sub: 'Abierto' },
];

/**
 * The games' places, all in the Parque. `spot`: the pad tiles a pet stands on to start the game, `sign`: its signpost, `zone`: the
 * tiles the game is played on (pets playing cannot leave it).
 */
export const GAME_PLACES = {
  hide: { name: 'Escondida', area: 'town', spot: [[17, 34]], sign: [16, 34], zone: { x: 1, y: 32, w: 46, h: 41 } },
  chicken: { name: 'Pillar la gallina', area: 'town', spot: [[29, 42]], sign: [33, 42], zone: { x: 26, y: 37, w: 11, h: 6 } },
  soccer: { name: 'Cancha', area: 'town', spot: [[13, 59]], sign: [13, 57], zone: { x: 13, y: 44, w: 22, h: 29 } },
  race: { name: 'Pista', area: 'town', spot: [[40, 69]], sign: [43, 69], icon: [43.5, 67.15], zone: { x: 36, y: 46, w: 9, h: 27 } },
};
export const GAME_IDS = Object.keys(GAME_PLACES);
/**
 * The football pitch (the cancha), in tiles: the playing field is x in [x, x + w), y in [y, y + h), long and narrow so a phone held upright
 * shows most of it. A fence runs round it with a two tile entrance on each side at mid height; a goal sits at each short end: a net of
 * GOAL.depth rows behind the goal line, open to the pitch between GOAL.x0 and GOAL.x1 (the ball enters there). The north goal is Rojo's
 * to defend and the south one Azul's.
 */
export const PITCH = { x: 16, y: 48, w: 16, h: 22 };
export const GOAL = { x0: 21, x1: 27, depth: 2 };
/**
 * The pista (obstacle race), in tiles: three lanes x0..x1 running north from the start line (the bottom edge of row yBottom, pets line up
 * below it) to the checkered finish row yTop. A fence runs along both sides and across the far end. Hurdles, hay bales and puddles (the
 * OBSTACLES chars) are walkable but slow a pet that steps onto them.
 */
export const TRACK = { x0: 39, x1: 41, yTop: 48, yBottom: 67 };
export const OBSTACLES = new Set(['V', 'W', 'w']);
export const inZone = (g, x, y) => {
  const z = Object.hasOwn(GAME_PLACES, g) ? GAME_PLACES[g].zone : null;
  return !!z && Number.isInteger(x) && Number.isInteger(y) && x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h;
};
/** Is there an obstacle of the pista (hurdle, hay bale or puddle) on this tile of the town? */
export const isObstacle = (x, y) => OBSTACLES.has(tileAt(x, y, 'town'));
/** The game whose pad is at this tile of the town, or null. The games are played in the town only: no tile of another area is a pad. */
export const spotAt = (x, y, area = DEFAULT_AREA) => (area !== DEFAULT_AREA ? null : GAME_IDS.find((g) => GAME_PLACES[g].spot.some(([sx, sy]) => sx === x && sy === y)) || null);

/** Floating icons over the main places: (x, y) in tile units is the badge's centre and its bottom edge. */
export const PLACES = [
  { id: 'shop', area: 'town', icon: 'shop', x: 35.5, y: 5.7 },
  { id: 'park', area: 'town', icon: 'park', x: 21.5, y: 29.15 },
  ...GAME_IDS.map((g) => ({ id: g, area: 'town', icon: g, x: GAME_PLACES[g].icon ? GAME_PLACES[g].icon[0] : GAME_PLACES[g].spot[0][0] + 0.5, y: GAME_PLACES[g].icon ? GAME_PLACES[g].icon[1] : GAME_PLACES[g].sign[1] - 1.85 })),
];

export const SPAWNS = [[19, 18], [28, 18], [18, 21], [29, 21], [19, 24], [28, 24], [22, 24], [25, 24]];
export const ENTRY = { shop: [[6, 10], [7, 10]] };       // where a pet appears inside an interior

function make(w, h, base, paint) {
  const g = Array.from({ length: h }, () => Array(w).fill(base));
  const fill = (x, y, fw, fh, ch) => { for (let j = y; j < y + fh; j++) for (let i = x; i < x + fw; i++) if (g[j] && g[j][i] !== undefined) g[j][i] = ch; };
  const set = (x, y, ch) => { if (g[y] && g[y][x] !== undefined) g[y][x] = ch; };
  paint({ g, fill, set, w, h });
  return g.map((row) => row.join(''));
}

function buildTown() {
  return make(48, 74, '.', ({ g, fill, set, w, h }) => {
    // wild flowers: a fixed scatter on the grass
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x * 7 + y * 13 + x * y) % 11 === 0) g[y][x] = ',';
    // roads: the main one (north-south), the one along the houses, the one south of the plaza, then the plaza itself
    fill(23, 2, 2, 40, '=');
    fill(3, 12, 42, 2, '=');
    fill(3, 29, 42, 2, '=');
    fill(PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h, '+');
    // the houses (solid) with the path to each door
    for (const hs of HOUSES) { fill(hs.x, hs.y, hs.w, 4, 'H'); set(hs.x + hs.door, hs.y + 3, hs.enter ? 'E' : 'H'); }
    for (const hs of HOUSES) {
      const dx = hs.x + hs.door, dy = hs.y + 4;
      set(dx, dy, 'm');
      if (hs.y < 12) fill(dx, dy + 1, 1, 12 - dy - 0, '=');
    }
    fill(6, 22, 1, 7, '=');                                    // from the west house to the south road
    // the fountain and the plaza's furniture
    fill(22, 20, 4, 3, 'o');
    for (const [x, y] of [[17, 16], [30, 16], [17, 26], [30, 26]]) set(x, y, 'L');
    for (const [x, y] of [[21, 17], [26, 17], [21, 25], [26, 25]]) set(x, y, 'n');
    for (const [x, y] of [[16, 15], [31, 15], [16, 27], [31, 27]]) set(x, y, 'B');
    for (let x = 18; x <= 20; x++) { set(x, 15, 'B'); set(x + 9, 15, 'B'); }
    // the east garden: flower beds, a fence, a bench and trees
    fill(35, 17, 8, 1, 'B'); fill(35, 20, 8, 1, 'B'); fill(35, 23, 8, 1, 'B');
    fill(34, 15, 11, 1, 'F'); fill(34, 26, 11, 1, 'F'); fill(44, 15, 1, 12, 'F'); fill(34, 15, 1, 3, 'F'); fill(34, 23, 1, 4, 'F');
    for (const [x, y] of [[36, 19], [40, 22], [38, 25]]) set(x, y, 'n');
    set(41, 19, 'L'); set(36, 22, 'L');
    // the west corner: a hedge row and flowers
    fill(11, 17, 5, 1, 'h'); fill(11, 24, 5, 1, 'h'); fill(11, 18, 1, 6, 'h');
    fill(12, 19, 3, 1, 'B'); fill(12, 22, 3, 1, 'B');
    // lamps along the roads
    for (const [x, y] of [[9, 11], [19, 11], [28, 11], [40, 11], [22, 5], [25, 5], [22, 28], [25, 28], [9, 28], [40, 28]]) set(x, y, 'L');
    // signs
    for (const s of SIGNS) if (s.area === 'town') set(s.x, s.y, 'S');
    // the park: a hedge along the road with an opening, a pond, paths, benches, trees and bushes
    for (let x = 3; x <= 44; x++) set(x, 31, 'h');
    fill(22, 31, 4, 1, '=');
    set(21, 31, 'S');
    const pond = { 33: [7, 9], 34: [6, 10], 35: [5, 11], 36: [5, 11], 37: [6, 10], 38: [7, 9] };
    for (const [y, [a, b]] of Object.entries(pond)) fill(a, Number(y), b - a + 1, 1, '~');
    fill(12, 35, 11, 2, '=');                                  // pond to the road
    fill(25, 35, 14, 2, '=');                                  // road to the east
    set(14, 34, 'n'); set(30, 34, 'n'); set(13, 37, 'L'); set(33, 37, 'L');
    fill(40, 33, 4, 1, 'B'); fill(40, 34, 4, 1, 'B');
    for (const [x, y] of [[4, 33], [3, 36], [4, 39], [13, 40], [14, 33], [20, 33], [27, 33], [36, 33], [44, 36], [42, 40], [30, 41], [18, 41], [8, 41], [12, 32]]) set(x, y, 't');
    for (const [x, y] of [[3, 32], [10, 41], [16, 33], [38, 41], [43, 32], [33, 33], [3, 42], [26, 41]]) set(x, y, 'T');
    for (const [x, y] of [[8, 40], [14, 38], [17, 39], [19, 37], [21, 40], [27, 38], [29, 40], [31, 38], [34, 40], [36, 38], [39, 39], [41, 37], [43, 41], [11, 40], [22, 38], [35, 41]]) set(x, y, 'b');
    // the game places: a cleared field south of the road, each place with its pad and signpost (see GAME_PLACES)
    fill(12, 37, 35, 36, '.');
    fill(23, 37, 2, 8, '=');
    set(13, 37, 'L'); set(25, 37, 'L');
    fill(11, 43, 34, 2, '='); fill(11, 43, 2, 18, '=');                // the way to the cancha: along the road's end, then down the west side of the pitch
    for (const gp of Object.values(GAME_PLACES)) {
      for (const [x, y] of gp.spot) set(x, y, 'p');
      set(gp.sign[0], gp.sign[1], 'S');
    }
    // the gallinero: a fenced pen with a coop and the gate open towards the pad
    fill(28, 38, 7, 1, 'F'); fill(28, 41, 7, 1, 'F'); fill(28, 39, 1, 2, 'F'); fill(34, 39, 1, 2, 'F');
    set(29, 41, 'a'); fill(32, 39, 2, 2, 'G');
    // the cancha: a long pitch inside a fence, an entrance on each side and a goal at each end (see PITCH)
    const { x: px, y: py, w: pw, h: ph } = PITCH, ey = py + (ph >> 1) - 1;
    fill(px, py, pw, ph, 'y');
    fill(px - 1, py - 1, pw + 2, 1, 'F'); fill(px - 1, py + ph, pw + 2, 1, 'F'); fill(px - 1, py - 1, 1, ph + 2, 'F'); fill(px + pw, py - 1, 1, ph + 2, 'F');
    fill(px - 1, ey, 1, 2, '.'); fill(px + pw, ey, 1, 2, '.');
    fill(GOAL.x0, py - GOAL.depth, GOAL.x1 - GOAL.x0, GOAL.depth, 'g'); fill(GOAL.x0, py + ph, GOAL.x1 - GOAL.x0, GOAL.depth, 'g');
    for (const [x, y] of [[14, 46], [33, 46], [14, 71], [33, 71], [14, 62]]) set(x, y, 'L');
    for (const [x, y] of [[3, 46], [8, 48], [4, 52], [9, 55], [3, 58], [8, 62], [5, 66], [9, 69], [3, 71], [36, 47], [42, 50], [38, 54], [45, 57], [37, 61], [43, 64], [39, 68], [45, 70], [35, 50], [20, 72], [29, 72]]) set(x, y, (x + y) % 3 ? 't' : 'T');
    for (const [x, y] of [[10, 45], [10, 51], [9, 58], [10, 64], [6, 70], [36, 45], [36, 52], [35, 57], [36, 65], [41, 71], [24, 72], [4, 49], [44, 53], [6, 60], [41, 60]]) set(x, y, 'b');
    // the rest of the park: trees at the edges and bushes to hide in
    for (const [x, y] of [[12, 42], [22, 40], [36, 42], [46, 42], [46, 37], [27, 40], [42, 42], [26, 42]]) set(x, y, (x + y) % 3 ? 't' : 'T');
    for (const [x, y] of [[14, 37], [18, 38], [21, 37], [15, 42], [20, 42], [22, 38], [22, 42], [26, 38], [26, 41], [36, 38], [36, 41], [37, 42], [44, 42], [46, 39], [46, 41], [19, 34], [22, 33], [28, 34], [32, 32], [38, 34], [45, 34], [11, 33], [26, 32], [39, 32]]) set(x, y, 'b');
    // the pista: a long fenced track of three lanes running north from the start line to the checkered finish, with obstacles (see TRACK)
    fill(36, 46, 9, 27, '.');
    for (const [x, y] of GAME_PLACES.race.spot) set(x, y, 'p');
    set(GAME_PLACES.race.sign[0], GAME_PLACES.race.sign[1], 'S');
    const { x0, x1, yTop, yBottom } = TRACK;
    fill(x0 - 1, yTop - 1, x1 - x0 + 3, 1, 'F'); fill(x0 - 1, yTop, 1, yBottom - yTop + 1, 'F'); fill(x1 + 1, yTop, 1, yBottom - yTop + 1, 'F');
    fill(x0, yTop, x1 - x0 + 1, 1, 'f'); fill(x0, yTop + 1, x1 - x0 + 1, yBottom - yTop, 'j');
    const rows = { 64: 'V.V', 62: '.w.', 60: 'W..', 58: '.VW', 56: 'w.V', 54: '.Ww', 52: 'VV.', 50: '..W' };
    for (const [y, pattern] of Object.entries(rows)) for (let i = 0; i < pattern.length; i++) if (pattern[i] !== '.') set(x0 + i, Number(y), pattern[i]);
    for (const [x, y] of [[37, 50], [37, 60], [44, 52], [44, 62], [37, 71], [44, 71]]) set(x, y, (x + y) % 3 ? 't' : 'T');
    // trees: the border and some clumps between the houses (never on a path)
    for (let x = 0; x < w; x++) { set(x, 0, x % 2 ? 'T' : 't'); set(x, h - 1, x % 2 ? 't' : 'T'); }
    for (let x = 1; x < w - 1; x++) set(x, h - 1, 'h');          // the park's south edge is a low hedge: tall trees there would cover the game pads
    for (let y = 0; y < h; y++) { set(0, y, y % 2 ? 't' : 'T'); set(w - 1, y, y % 2 ? 'T' : 't'); }
    for (const [x, y] of [[2, 3], [10, 3], [18, 3], [30, 3], [40, 3], [46, 8], [2, 9], [19, 8], [29, 8], [2, 13], [3, 15], [10, 14], [20, 5], [27, 5], [46, 13], [46, 20], [46, 26], [2, 26], [2, 20], [10, 22], [45, 28], [33, 28], [13, 28]]) set(x, y, (x + y) % 3 ? 't' : 'T');
    for (const [x, y] of [[8, 14], [14, 16], [45, 12], [41, 14], [8, 24]]) set(x, y, 'b');
    fill(45, 29, 3, 2, '=');                                   // the south road runs on through the east border: the way to the farm (see DOORS)
  });
}

/** The farm's places, in tiles: where the barn stands, the animals' paddock (inside its fence), the orchard, the crop fields and the pond. */
export const FARM = {
  barn: { x: 26, y: 3, w: 6, h: 3 },
  paddock: { x: 34, y: 3, w: 8, h: 8 },
  orchard: { x: 2, y: 2, w: 18, h: 14 },
  fields: { x: 3, y: 20, w: 17, h: 10 },
  wheat: { x: 25, y: 21, w: 16, h: 7 },
  pond: { x: 33, y: 30, w: 6, h: 4 },
  well: [25, 14],
  scarecrow: [11, 29],
  store: { x: 31, y: 13, w: 4, h: 2 },         // the Almacén: a stall of 4 x 2 tiles east of the barn lane; the clerk stands behind its counter, pets come from the south
};
/** Which of the three fruit trees (0 apples, 1 oranges, 2 pears) stands at an orchard tile: stripes across the rows and columns. */
export const fruitKind = (x, y) => (Math.floor((x - 4) / 3) + Math.floor((y - 4) / 3) + 6) % 3;
const CROPS = [['C', 3, 20], ['U', 12, 20], ['P', 3, 25], ['Y', 12, 25]];       // the four crop blocks of the field: char, x, y (8 x 4 tiles, rows of crop and furrow)

function buildFarm() {
  return make(44, 36, '.', ({ g, fill, set, w, h }) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x * 5 + y * 11 + x * y) % 13 === 0) g[y][x] = ',';
    // roads: in from the west, the lane north to south, the barn's yard and the paddock's gate
    fill(0, 17, 42, 2, '=');
    fill(21, 2, 2, 32, '=');
    fill(28, 6, 2, 11, '=');
    fill(37, 12, 1, 5, '=');
    // the barn (see FARM.barn: its picture is a prop)
    fill(FARM.barn.x, FARM.barn.y, FARM.barn.w, FARM.barn.h, 'R');
    // the paddock: a fence round 8 x 8 tiles of grass, the gate on its south side
    const pd = FARM.paddock;
    fill(pd.x - 1, pd.y - 1, pd.w + 2, 1, 'F'); fill(pd.x - 1, pd.y + pd.h, pd.w + 2, 1, 'F'); fill(pd.x - 1, pd.y - 1, 1, pd.h + 2, 'F'); fill(pd.x + pd.w, pd.y - 1, 1, pd.h + 2, 'F');
    set(37, pd.y + pd.h, 'a');
    // the orchard: rows of fruit trees, every other row shifted
    for (const y of [4, 7, 10, 13]) for (const x of [4, 7, 10, 13, 16]) set(x + (y % 6 === 1 ? 1 : 0), y, 'A');
    // the crop field: a fence, a gate towards the road and one towards the lane, a lane through the middle, four blocks of rows
    fill(2, 19, 19, 1, 'F'); fill(2, 30, 19, 1, 'F'); fill(2, 19, 1, 12, 'F'); fill(20, 19, 1, 12, 'F');
    set(11, 19, 'a'); set(20, 24, 'a');
    fill(11, 20, 1, 9, '=');
    fill(3, 24, 8, 1, '='); fill(12, 24, 8, 1, '=');
    for (const [ch, x0, y0] of CROPS) for (let j = 0; j < 4; j++) fill(x0, y0 + j, 8, 1, j % 2 ? 'd' : ch);
    set(FARM.scarecrow[0], FARM.scarecrow[1], 'Z');
    // the wheat field east of the lane: rows of wheat with a furrow between every two
    const wh = FARM.wheat;
    for (let j = 0; j < wh.h; j++) fill(wh.x, wh.y + j, wh.w, 1, j % 3 === 2 ? 'd' : 'Y');
    // the well and a bench by the road, the pond in the south east
    set(FARM.well[0], FARM.well[1], 'v'); set(27, 15, 'n');
    fill(FARM.store.x, FARM.store.y, FARM.store.w, FARM.store.h, 'M');
    const pond = { 30: [34, 37], 31: [33, 38], 32: [33, 38], 33: [34, 37] };
    for (const [y, [a, b]] of Object.entries(pond)) fill(a, Number(y), b - a + 1, 1, '~');
    // lamps along the road and the lane, and the signpost back to the town
    for (const [x, y] of [[6, 16], [16, 16], [26, 16], [36, 16], [20, 6], [23, 6], [23, 25], [20, 32], [23, 32], [31, 19], [40, 19]]) set(x, y, 'L');
    for (const s of SIGNS) if (s.area === 'farm') set(s.x, s.y, 'S');
    // trees: the border (open where the road comes in) and some clumps
    for (let x = 0; x < w; x++) { set(x, 0, x % 2 ? 'T' : 't'); set(x, h - 1, x % 2 ? 't' : 'T'); }
    for (let y = 0; y < h; y++) { set(0, y, y % 2 ? 't' : 'T'); set(w - 1, y, y % 2 ? 'T' : 't'); }
    fill(0, 17, 1, 2, '=');
    for (const [x, y] of [[24, 2], [19, 2], [40, 14], [41, 15], [3, 32], [8, 33], [17, 33], [27, 33], [41, 33], [41, 29], [42, 22], [42, 26], [30, 31], [40, 31], [24, 20]]) set(x, y, (x + y) % 3 ? 't' : 'T');
  });
}

function buildShop() {
  return make(14, 12, '_', ({ fill, set, w, h }) => {
    fill(0, 0, w, 2, 'x'); fill(0, 0, 1, h, 'x'); fill(w - 1, 0, 1, h, 'x'); fill(0, h - 1, w, 1, 'x');
    fill(6, 11, 2, 1, 'e');
    fill(1, 2, 2, 1, 'k'); fill(11, 2, 2, 1, 'k');
    fill(5, 4, 4, 1, 'c'); set(6, 3, 'N');
    fill(2, 6, 2, 2, 'u'); fill(10, 6, 2, 2, 'u');
    fill(6, 7, 2, 4, 'r');
    set(1, 10, 'q'); set(12, 10, 'q'); set(12, 9, 'z'); set(1, 9, 'z'); set(10, 9, 'q');
  });
}

export const AREAS = {
  town: { name: 'town', grid: buildTown(), outdoor: true },
  farm: { name: 'farm', grid: buildFarm(), outdoor: true },
  shop: { name: 'shop', grid: buildShop(), outdoor: false },
};
for (const a of Object.values(AREAS)) { a.h = a.grid.length; a.w = a.grid[0].length; }

export const AREA_NAMES = Object.keys(AREAS);
export const isArea = (name) => typeof name === 'string' && Object.hasOwn(AREAS, name);
export const getArea = (name = DEFAULT_AREA) => AREAS[isArea(name) ? name : DEFAULT_AREA];

// The town as the default area (kept as plain exports for the many callers that only know one map).
export const GRID = AREAS.town.grid;
export const MAP_W = AREAS.town.w;
export const MAP_H = AREAS.town.h;

/**
 * Where a game of hide and seek is played, chosen in its lobby: `has(x, y)` is the zone, `pad` the tile a pet that is somewhere else starts on,
 * `wall` what the soft wall says. "Todo el pueblo" has no wall at all: only the doors are shut while a game is on.
 */
export const HIDE_ZONES = {
  park: { name: 'Parque', wall: 'Vuelve al parque', pad: [17, 34], has: (x, y) => inZone('hide', x, y) },
  plaza: { name: 'Plaza', wall: 'Vuelve a la plaza', pad: [20, 23], has: (x, y) => inPlaza(x, y) },
  town: { name: 'Todo el pueblo', wall: '', pad: [17, 34], has: (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAP_W && y < MAP_H },
};
export const HIDE_ZONE_KEYS = Object.keys(HIDE_ZONES);
export const DEFAULT_HIDE_ZONE = 'town';

export const inMap = (x, y, area = DEFAULT_AREA) => {
  const a = AREAS[area];
  return !!a && Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < a.w && y < a.h;
};
export const tileAt = (x, y, area = DEFAULT_AREA) => (inMap(x, y, area) ? AREAS[area].grid[y][x] : 'x');
export const isWalkable = (x, y, area = DEFAULT_AREA) => inMap(x, y, area) && !TILES[AREAS[area].grid[y][x]].solid;
/** The fenced pen of the gallinero (its gate is at (29, 41)): the chicken of the game never goes in, it would be a dead end. */
export const PEN = { x: 28, y: 38, w: 7, h: 4 };
/** Where the chicken of Pillar la gallina may stand: any open tile of the town, but not a hiding bush, the pen, and never a door (it never goes inside). */
export const chickenTile = (x, y) => isWalkable(x, y, 'town') && !(x >= PEN.x && y >= PEN.y && x < PEN.x + PEN.w && y < PEN.y + PEN.h) && !TILES[tileAt(x, y)].hide && !(DOORS.town || []).some((d) => d.x === x && d.y === y);
/** The door at a tile, or null. */
export const doorAt = (x, y, area = DEFAULT_AREA) => (DOORS[area] || []).find((d) => d.x === x && d.y === y) || null;
