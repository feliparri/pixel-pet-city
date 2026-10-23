// The town map: 32 x 28 tiles of 16 px, painted from rectangles. Tiles are solid or walkable; "Parque" and "Tienda" are
// signed placeholders (stage 2 and 4) that cannot be entered yet.

export const TILE = 16;
export const MAP_W = 32;
export const MAP_H = 28;

/** Tile kinds: char -> { solid }. The renderer draws each one. */
export const TILES = {
  '.': { name: 'grass', solid: false },
  ',': { name: 'flowers', solid: false },
  '=': { name: 'path', solid: false },
  '+': { name: 'plaza', solid: false },
  'P': { name: 'lawn', solid: true },        // the park's lawn: fenced, not open yet
  '#': { name: 'tree', solid: true },
  '~': { name: 'water', solid: true },       // the fountain and the park pond
  'F': { name: 'fence', solid: true },
  'G': { name: 'gate', solid: true },        // the park gate, closed
  'R': { name: 'roof', solid: true },
  'H': { name: 'wall', solid: true },
  'D': { name: 'door', solid: true },
  'S': { name: 'sign', solid: true },
};

export const SIGNS = [
  { x: 6, y: 11, text: 'Parque', sub: 'Próximamente' },
  { x: 20, y: 6, text: 'Tienda', sub: 'Próximamente' },
];

export const SPAWNS = [
  [12, 17], [13, 17], [18, 17], [19, 17], [11, 16], [20, 16], [12, 12], [19, 12],
];

function build() {
  const g = Array.from({ length: MAP_H }, () => Array(MAP_W).fill('.'));
  const fill = (x, y, w, h, ch) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = ch; };
  // flowers: a fixed scatter on the grass
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if ((x * 7 + y * 13 + x * y) % 11 === 0) g[y][x] = ',';
  // paths: the main road, the road along the houses, the park gate and the shop branch
  fill(15, 1, 2, 26, '=');
  fill(2, 20, 28, 2, '=');
  fill(7, 11, 2, 9, '=');
  fill(15, 7, 8, 1, '=');
  fill(22, 6, 1, 2, '=');
  // the plaza and its fountain
  fill(10, 11, 12, 8, '+');
  fill(14, 13, 4, 3, '~');
  // the park: fenced lawn with a pond and a closed gate
  fill(2, 2, 11, 9, 'F');
  fill(3, 3, 9, 7, 'P');
  fill(4, 4, 3, 2, '~');
  fill(7, 10, 2, 1, 'G');
  // the shop: roof, wall and door
  fill(19, 3, 7, 2, 'R');
  fill(19, 5, 7, 1, 'H');
  g[5][22] = 'D';
  // four houses south of the road (their doors face the grass below)
  for (const x of [3, 10, 19, 25]) { fill(x, 22, 3, 1, 'R'); fill(x, 23, 3, 1, 'H'); g[23][x + 1] = 'D'; }
  // signs
  for (const s of SIGNS) g[s.y][s.x] = 'S';
  // trees: the border and a few clumps (never on a path)
  fill(0, 0, MAP_W, 1, '#'); fill(0, MAP_H - 1, MAP_W, 1, '#'); fill(0, 0, 1, MAP_H, '#'); fill(MAP_W - 1, 0, 1, MAP_H, '#');
  for (const [x, y] of [[28, 3], [29, 8], [27, 11], [29, 14], [2, 14], [4, 16], [3, 18], [24, 14], [25, 17], [6, 25], [12, 25], [19, 25], [24, 25], [29, 25], [1, 12], [28, 18]]) g[y][x] = '#';
  return g.map((row) => row.join(''));
}

export const GRID = build();

export const inMap = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
export const tileAt = (x, y) => (inMap(x, y) ? GRID[y][x] : '#');
export const isWalkable = (x, y) => inMap(x, y) && !TILES[GRID[y][x]].solid;
