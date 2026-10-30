// Canvas drawing of the show's layers, all additive pixel squares snapped to the show's pixel unit `u` so the art stays crisp.
import { project } from '../hd2d/camera.js';

const STYLES = new Map();
const snap = (v, u) => Math.round(v / u) * u;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function halo(ctx, x, y, r, c, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a)); g.addColorStop(0.3, rgba(c, a * 0.4)); g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Bursts: the flash of each burst and its sparks. These sit far away, so the town (drawn after) hides what falls behind it. */
export function drawBursts(ctx, cam, fw, u, alpha = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = false;
  const share = 1 / Math.max(1, Math.sqrt(fw.flashes.length * 0.6));      // a finale of many bursts shares the light instead of blowing out
  for (const f of fw.flashes) {
    const p = project(cam, f.x, f.y, f.z);
    if (p) halo(ctx, p.x, p.y, 190 * p.scale, f.c, 0.5 * f.k * alpha * share);
  }
  for (const s of fw.sparks) {
    const p = project(cam, s.x, s.y, s.z);
    if (!p) continue;
    const size = s.tr === 0 ? (s.age < 0.2 ? u * 2 : s.big ? u * 4 : u * 3) : s.tr < 3 ? u * 2 : u;
    const lvl = Math.ceil(Math.min(1, s.a * alpha) * 8), key = `${s.r}|${s.g}|${s.b}|${lvl}`;     // 8 alpha levels: the style strings are cached, not rebuilt per spark
    let st = STYLES.get(key);
    if (!st) STYLES.set(key, st = `rgba(${s.r},${s.g},${s.b},${lvl / 8})`);
    ctx.fillStyle = st;
    const sx = snap(p.x, u), sy = snap(p.y, u);
    ctx.fillRect(sx, sy, size, size);
    if (s.tr === 0 && s.age > 0.2) { ctx.globalAlpha = 0.16 * Math.min(1, s.a * alpha); ctx.fillRect(sx - u * 2, sy - u * 2, size + u * 4, size + u * 4); ctx.globalAlpha = 1; }   // a faint square glow round the head
  }
  ctx.restore();
}

/** Rockets climbing from the plaza: in front of the town, a warm spark with a thin tail. */
export function drawRockets(ctx, cam, fw, u, alpha = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const r of fw.rockets) {
    const p = project(cam, r.x, r.y, r.z);
    if (!p) continue;
    ctx.fillStyle = `rgba(255,${r.a === 1 ? 236 : 170},${r.a === 1 ? 190 : 90},${r.a * alpha})`;
    ctx.fillRect(snap(p.x, u), snap(p.y, u), u * (r.a === 1 ? 2 : 1), u * (r.a === 1 ? 2 : 1));
    if (r.a === 1) halo(ctx, p.x, p.y, 7 * u, [255, 190, 110], 0.4 * alpha);
  }
  ctx.restore();
}

/** Shooting stars in sky space (below `hy` nothing is drawn). */
export function drawMeteors(ctx, pts, view, hy, u, alpha = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); ctx.rect(0, 0, view.w, hy); ctx.clip();
  for (const m of pts) {
    const x = snap(m.u * view.w, u), y = snap(m.v * hy, u);
    ctx.fillStyle = rgba(m.c, m.a * alpha * (m.head ? 1 : 0.85));
    ctx.fillRect(x, y, m.head ? u * 3 : m.a > 0.45 ? u * 2 : u, m.head ? u * 3 : m.a > 0.45 ? u * 2 : u);
    if (m.head) halo(ctx, x, y, 9 * u, m.c, 0.45 * alpha);
  }
  ctx.restore();
}

/** Drone lights: a bright pixel with a soft glow. */
export function drawDrones(ctx, cam, drones, u, alpha = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const d of drones) {
    const p = project(cam, d.x, d.y, d.z);
    if (!p) continue;
    const x = snap(p.x, u), y = snap(p.y, u), a = d.a * alpha, c = [d.r, d.g, d.b], s = Math.max(2, Math.round(p.scale * 7 / u)) * u;
    halo(ctx, x, y, 3.6 * s, c, 0.6 * a);
    ctx.fillStyle = rgba(c, a); ctx.fillRect(x - s / 2, y - s / 2, s, s);
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x - s / 4, y - s / 4, s / 2, s / 2);
  }
  ctx.restore();
}

// ---- the Halloween show (src/show/halloween.js): pixel sprites baked once at 1 px per art pixel, drawn scaled by the show's unit `u` ----------
const ART = new Map();
const WITCH = [
  '.........X..............', '........XXX.............', '.......XXXX.............', '......XXXXXX............', '....XXXXXXXXXX..........', '........XXXXX.XX........', '.......XXXXXXXXX........', '......XXXXXXXXXX........',
  '...XXXXXXXXXXXXX........', 'XXXXXXXXXXXXXXXXXXXXXXX.', 'XXX.XXX.....XX..........', 'XX.........X............',
];
const GHOST = ['..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXooXXooXX', 'XXooXXooXX', 'XXXXooXXXX', 'XXXXooXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XX.XXXX.XX', 'X..XXXX..X', '.....XX...'];
const BAT = [['X.X...X.X', 'XXX.X.XXX', '.XXXXXXX.', '..XXXXX..', '...X.X...'], ['....X....', '..XXXXX..', '.XXXXXXX.', 'XXX.X.XXX', 'X...X...X']];
const MINI = [['X...X', 'XXXXX', '.X.X.'], ['..X..', 'XXXXX', 'X...X']];       // the finale's bats are small so the pumpkin's shape reads

/** A sprite from ascii rows: 'X' is the body colour, 'o' the dark detail; `rim` adds a 1 px lighter outline round the body (so a dark shape reads on a dark sky). `flip` mirrors it. */
function sprite(key, rows, body, rim = null, flip = false) {
  const id = `${key}${flip ? 'r' : ''}`;
  let c = ART.get(id);
  if (c) return c;
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length, pad = rim ? 1 : 0;
  c = Object.assign(document.createElement('canvas'), { width: w + pad * 2, height: h + pad * 2 });
  const g = c.getContext('2d'), has = (x, y) => x >= 0 && y >= 0 && y < h && x < rows[y].length && rows[y][x] !== '.';
  const at = (x) => (flip ? w - 1 - x : x);
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    const sx = at(x), cell = x >= 0 && x < w && has(sx, y) ? rows[y][sx] : null;
    if (cell) { g.fillStyle = cell === 'o' ? '#23224a' : body; g.fillRect(x + pad, y + pad, 1, 1); }
    else if (rim && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (x + dx >= 0 && x + dx < w && has(at(x + dx), y + dy)))) { g.fillStyle = rim; g.fillRect(x + pad, y + pad, 1, 1); }
  }
  ART.set(id, c);
  return c;
}

function moonSprite() {
  let c = ART.get('moon');
  if (c) return c;
  const R = 14, n = R * 2 + 1;
  c = Object.assign(document.createElement('canvas'), { width: n, height: n });
  const g = c.getContext('2d');
  for (let j = -R; j <= R; j++) {
    const half = Math.floor(Math.sqrt(R * R + 0.5 - j * j));
    for (let i = -half; i <= half; i++) {
      const d = (i + j * 0.6) / R;
      g.fillStyle = d > 0.55 ? '#c85a1c' : d > 0.2 ? '#e8741f' : d > -0.3 ? '#ff9a2e' : '#ffb85a';
      g.fillRect(R + i, R + j, 1, 1);
    }
  }
  g.fillStyle = '#d2661e';
  for (const [i, j, w, h] of [[-6, -5, 4, 3], [3, -8, 3, 2], [4, 3, 5, 4], [-8, 4, 3, 3], [-1, 8, 3, 2], [-3, 0, 2, 2]]) g.fillRect(R + i, R + j, w, h);
  ART.set('moon', c);
  return c;
}

function haloSprite() {
  let c = ART.get('halo');
  if (c) return c;
  c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,150,50,0.9)'); r.addColorStop(0.3, 'rgba(255,120,30,0.35)'); r.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  ART.set('halo', c);
  return c;
}

/** The Halloween sky (hw from halloweenAt) above the horizon row `hy`: the moon and its glow, ghosts, bats, witches in silhouette, and the glowing bats of the finale. */
export function drawHalloween(ctx, hw, view, hy, u, alpha = 1) {
  if (hy <= 0 || (!hw.moon && !hw.bats.length && !hw.witches.length && !hw.ghosts.length)) return;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, view.w, hy); ctx.clip(); ctx.imageSmoothingEnabled = false;
  const X = (o) => snap(o.u * view.w + (o.ox || 0) * u, u), Y = (o) => snap(o.v * hy + (o.oy || 0) * u, u);
  const blit = (c, x, y, a) => { ctx.globalAlpha = a; ctx.drawImage(c, x - Math.floor(c.width / 2) * u, y - Math.floor(c.height / 2) * u, c.width * u, c.height * u); };
  const halo = haloSprite();
  const m = hw.moon;
  if (m) {                                                                              // the horizon glows orange, the moon sits in its own halo
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, hy - 34 * u, 0, hy);
    g.addColorStop(0, 'rgba(255,120,30,0)'); g.addColorStop(1, `rgba(255,110,30,${0.3 * m.a * alpha})`);
    ctx.fillStyle = g; ctx.fillRect(0, hy - 34 * u, view.w, 34 * u);
    ctx.globalAlpha = 0.55 * m.a * alpha; ctx.drawImage(halo, X(m) - 42 * u, Y(m) - 42 * u, 84 * u, 84 * u);
    ctx.globalCompositeOperation = 'source-over';
    blit(moonSprite(), X(m), Y(m), m.a * alpha);
  }
  for (const g of hw.ghosts) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 * g.a * alpha;
    ctx.drawImage(halo, X(g) - 9 * u, Y(g) - 9 * u, 18 * u, 18 * u);
    ctx.globalCompositeOperation = 'source-over';
    blit(sprite('ghost', GHOST, '#dce6ff'), X(g), Y(g), g.a * alpha);
  }
  for (const b of hw.bats) if (!b.lit) blit(sprite(`bat${b.f}`, BAT[b.f], '#1a0f2e', '#6a4a9a'), X(b), Y(b), b.a * alpha);
  for (const w of hw.witches) blit(sprite('witch', WITCH, '#0b0614', '#7a58b0', w.dir < 0), X(w), Y(w), alpha);
  for (const b of hw.bats) {                                                            // the finale's bats turn into orange sparks of the pumpkin
    if (!b.lit) continue;
    ctx.globalCompositeOperation = 'source-over';
    blit(sprite(`bat${b.f}`, BAT[b.f], '#1a0f2e', '#6a4a9a'), X(b), Y(b), b.a * alpha * (1 - b.lit));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 * b.lit * b.a * alpha; ctx.drawImage(halo, X(b) - 5 * u, Y(b) - 5 * u, 10 * u, 10 * u);
    blit(sprite(`mini${b.f}`, MINI[b.f], '#ffb347'), X(b), Y(b), b.lit * b.a * alpha);
  }
  ctx.restore();
}
