// The fish as small pixel art, made in code (one sprite per fish id, no image files): a body profile, a tail, a fin, an eye and a mark, rasterised to rows of letters.
// o outline, m back, b belly, f fins, k mark, e eye. `fishRows` is pure (tested); `fishCanvas` paints a row set into a canvas (an unseen fish is a silhouette).
export const FISH_W = 24, FISH_H = 14;
const CY = 7;

/** How each fish looks: `half` the body's half height, `len` its length in pixels, `shape` its profile, colours, and a `mark`. */
const SPECS = {
  sardina: { len: 15, half: 3, shape: 'slim', m: '#6f93b5', b: '#e6eef3', f: '#5a7898', k: '#3e5f82', mark: 'stripe' },
  carpa: { len: 17, half: 5, shape: 'round', m: '#c98d4a', b: '#f0cf8a', f: '#a96a34', k: '#e9b66a', mark: 'scales' },
  trucha: { len: 17, half: 4, shape: 'slim', m: '#7da56a', b: '#efe6c8', f: '#5c8450', k: '#d9544f', mark: 'spots' },
  perca: { len: 15, half: 4, shape: 'round', m: '#8aa84a', b: '#e9e3a6', f: '#d0643c', k: '#44601f', mark: 'bars' },
  salmon: { len: 20, half: 4, shape: 'slim', m: '#d4605a', b: '#f4b8a2', f: '#a8403d', k: '#8c2f34', mark: 'spots' },
  esturion: { len: 22, half: 4, shape: 'long', m: '#d6a935', b: '#f6e49a', f: '#9d7620', k: '#fff0a8', mark: 'plates' },
  pez_luna: { len: 15, half: 6, shape: 'round', m: '#c9d6f2', b: '#f4f7ff', f: '#8aa0d8', k: '#fff6b8', mark: 'moon' },
  anguila: { len: 23, half: 2, shape: 'eel', m: '#3d3a5e', b: '#6c6896', f: '#2a2845', k: '#9be3ff', mark: 'glow' },
  copo: { len: 14, half: 4, shape: 'round', m: '#bfe3f5', b: '#ffffff', f: '#86bfe0', k: '#ffffff', mark: 'flake' },
  caramelo: { len: 17, half: 4, shape: 'slim', m: '#f4f4f4', b: '#fff2f2', f: '#d93a4a', k: '#d93a4a', mark: 'candy' },
};
export const FISH_IDS = Object.keys(SPECS);

const profile = (shape, t) => {                                   // 0..1 across the body, tail (0) to head (1)
  const c = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
  if (shape === 'round') return Math.pow(c, 0.8);
  if (shape === 'slim') return Math.pow(c, 0.9) * (0.65 + 0.35 * t);
  if (shape === 'long') return t > 0.82 ? 0.45 + 0.4 * (1 - t) / 0.18 * 0.5 : Math.pow(c, 0.75);
  return 1;                                                       // eel
};

/** The sprite of fish `id` as FISH_H strings of FISH_W letters ('.' is empty), or null for an unknown id. */
export function fishRows(id) {
  const sp = SPECS[id];
  if (!sp) return null;
  const g = Array.from({ length: FISH_H }, () => Array(FISH_W).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && x < FISH_W && y >= 0 && y < FISH_H) g[y][x] = c; };
  const x1 = FISH_W - 2, x0 = x1 - sp.len + 1;
  const wave = (x) => (sp.shape === 'eel' ? Math.round(2.2 * Math.sin((x - x0) * 0.55)) : 0);
  const top = [], bot = [];
  for (let x = x0; x <= x1; x++) {
    const t = sp.len > 1 ? (x - x0) / (sp.len - 1) : 0.5, hh = Math.max(1, Math.round(sp.half * profile(sp.shape, t))), cy = CY + wave(x);
    top[x] = cy - hh + 1; bot[x] = cy + hh;
    for (let y = cy - hh + 1; y <= cy + hh; y++) set(x, y, y <= cy ? 'm' : 'b');
  }
  const tailH = sp.shape === 'eel' ? 2 : sp.half + 1;                // the tail: a fan behind the body
  for (let i = 1; i <= 3; i++) for (let j = -Math.round(tailH * i / 3); j <= Math.round(tailH * i / 3); j++) set(x0 - 4 + i, CY + wave(x0) + j, 'f');
  const fx = x0 + Math.round(sp.len * 0.42);                         // the back fin
  for (let i = 0; i < 4; i++) for (let j = 1; j <= 3 - i; j++) set(fx + i, top[fx + i] - j, 'f');
  if (sp.shape === 'eel') for (let x = x0 + 2; x < x1 - 2; x++) set(x, top[x] - 1, 'f');
  const ex = x1 - 3, ey = CY + wave(ex) - 1;
  mark(sp.mark, set, x0, x1, top, bot, g);
  set(ex, ey, 'e');
  const out = g.map((r) => r.slice());                                // the outline: any empty pixel that touches the fish
  for (let y = 0; y < FISH_H; y++) for (let x = 0; x < FISH_W; x++) {
    if (g[y][x] !== '.') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] && g[y + dy][x + dx] !== '.')) out[y][x] = 'o';
  }
  return out.map((r) => r.join(''));
}

function mark(kind, set, x0, x1, top, bot, g) {
  const inBody = (x, y) => g[y] && (g[y][x] === 'm' || g[y][x] === 'b');
  const col = (x, f) => { for (let y = top[x]; y <= bot[x]; y++) if (inBody(x, y) && f(y)) set(x, y, 'k'); };
  if (kind === 'stripe') for (let x = x0 + 3; x < x1 - 3; x++) col(x, (y) => y === CY);
  else if (kind === 'bars') for (let x = x0 + 3; x < x1 - 2; x += 3) col(x, (y) => y <= CY + 1);
  else if (kind === 'spots') for (let x = x0 + 4; x < x1 - 3; x += 3) { const y = top[x] + 1 + (x % 2); if (inBody(x, y)) set(x, y, 'k'); }
  else if (kind === 'scales') for (let x = x0 + 4; x < x1 - 2; x += 3) { if (inBody(x, CY - 1)) set(x, CY - 1, 'k'); if (inBody(x + 1, CY + 1)) set(x + 1, CY + 1, 'k'); }
  else if (kind === 'plates') for (let x = x0 + 3; x < x1 - 4; x += 3) { if (top[x] !== undefined) set(x, top[x], 'k'); }
  else if (kind === 'moon') { for (let y = CY - 3; y <= CY + 3; y++) for (let x = x0 + 4; x <= x0 + 9; x++) { const d = Math.hypot(x - (x0 + 6), y - CY), d2 = Math.hypot(x - (x0 + 8), y - CY); if (d <= 3 && d2 > 2.6 && inBody(x, y)) set(x, y, 'k'); } }
  else if (kind === 'glow') for (let x = x0 + 4; x < x1 - 2; x += 4) set(x, CY + Math.round(2.2 * Math.sin((x - x0) * 0.55)), 'k');
  else if (kind === 'flake') { const cx = x0 + 6, cy = CY; for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 2], [-2, -2], [2, -2], [-2, 2]]) if (inBody(cx + dx, cy + dy)) set(cx + dx, cy + dy, 'k'); }
  else if (kind === 'candy') for (let x = x0 + 2; x < x1 - 1; x++) col(x, (y) => (x + y) % 5 < 2);
}

const cache = new Map();
/** A canvas with the fish scaled `scale` times (cached); `silhouette` paints every pixel dark (a fish not caught yet). */
export function fishCanvas(id, scale = 1, silhouette = false) {
  const key = `${id}|${scale}|${silhouette ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  const rows = fishRows(id), sp = SPECS[id];
  c = document.createElement('canvas');
  c.width = FISH_W * scale; c.height = FISH_H * scale;
  if (rows) {
    const g = c.getContext('2d'), col = { o: '#1c2233', m: sp.m, b: sp.b, f: sp.f, k: sp.k, e: '#10131f' };
    rows.forEach((row, y) => { for (let x = 0; x < FISH_W; x++) { const ch = row[x]; if (ch === '.') continue; g.fillStyle = silhouette ? (ch === 'o' ? '#0f1320' : '#323c5c') : col[ch]; g.fillRect(x * scale, y * scale, scale, scale); } });
  }
  cache.set(key, c);
  return c;
}
