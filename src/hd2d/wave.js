// The surf wave drawn as the pixel-art wave of odd/refs/wave-shape-ref.png: a solid blue body that stands up from the sea, its back (towards the open sea, south-west) rising as a smooth
// slope with a light-blue outline that steps up pixel by pixel, a few lighter dashes on the water, and at the top the lip curling forward, over the front (towards the shore, north-east),
// under a big pale-blue and white foam cap that overhangs a dark pocket; a few loose spray pixels fly off the tip. Hard blocks of flat colour, no gradients.
//
// How it is made: the wave stands on its front line (y = k + x, the geometry of src/surf.js); across that line, towards the shore, the profile above is extruded vertically on screen, its
// height at every point of the front being the wave's own (waveBody's bodyAt height times WAVE_LIFT), so it grows towards the peel point and the broken part carries the big foam cap
// with whitewater behind. The ground points of that sheet (every few world px along the front and across it) are projected and written, nearest first, into a small grid of cells
// (three art pixels wide, anchored at the screen's origin so every block is snapped to the art pixel grid); each cell column is then emitted as runs, merged sideways, batched into one
// fill per colour. Nothing here decides anything: the clock gives the geometry, the sample's row and the wave's age give every dash and spray pixel; nothing is stored; the grid
// covers the rows in view only and the number of rectangles is bounded.
import { bodyAt, WAVE_LIFT } from '../surf.js';
import { groundRow, project } from './camera.js';
import { TILE } from '../map.js';

export { WAVE_LIFT };
export const MAX_PARTICLES = 4000;

const hash = (a, b, c = 0) => { let h = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 0x45d9f3b); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967295; };

const DAY = { body: '#1d8fd3', dash: '#38b4f2', edge: '#86d4fb', cap: '#d9f2fe', cap2: '#a7dcf8', barrel: '#0f5c9a', white: '#ffffff' };
const KEYS = ['', 'body', 'dash', 'edge', 'cap', 'cap2', 'barrel', 'white'];
const BODY = 1, DASH = 2, EDGE = 3, CAP = 4, CAP2 = 5, BARREL = 6, WHITE = 7;
const mixHex = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };
const palettes = new Map();
const paletteFor = (n) => {                                                              // the colours for a night amount (index by BODY..WHITE), quantised so they are made once
  const q = Math.round(n * 10);
  let p = palettes.get(q);
  if (!p) { p = KEYS.map((k) => (k ? (q ? mixHex(DAY[k], '#0b1632', 0.5 * (q / 10)) : DAY[k]) : '')); palettes.set(q, p); }
  return p;
};

/** The pixel unit of the scene: the screen px of one art pixel at the camera's focus (whole, at least 2). */
export const pixelOf = (cam) => Math.max(2, Math.round(cam.focal / cam.dist));

function bin() {
  const m = new Map();
  let n = 0;
  return {
    put(color, x, y, w, h, U) { if (n >= MAX_PARTICLES) return; let a = m.get(color); if (!a) m.set(color, a = []); a.push(Math.round(x / U) * U, Math.round(y / U) * U, Math.max(U, Math.round(w / U) * U), Math.max(U, Math.round(h / U) * U)); n++; },
    flush(ctx) { for (const [color, a] of m) { ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i < a.length; i += 4) ctx.rect(a[i], a[i + 1], a[i + 2], a[i + 3]); ctx.fill(); } },
    get count() { return n; },
  };
}

const sm = (t) => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * (3 - 2 * c); };

// The profile across the front, as fractions of the wave's height H. nu = distance towards the shore / H (negative: the back slope, towards the open sea).
const BACK = 1.7, E0 = 0.1;
/** The height of the solid body (0..1) at `nu`: a smooth back slope up to the crest, then (capped) a short steep drop to the lower front under the lip, or (not capped) a rounded fall. */
export function bodyFrac(nu, capped) {
  if (nu <= -BACK) return 0;
  if (nu < -0.08) { const r = (nu + BACK) / (BACK - 0.08); return 0.35 * r + 0.65 * sm(r); }
  if (nu <= E0) return 1;
  if (capped) return nu < 0.2 ? 1 - 0.45 * (nu - E0) / 0.1 : 0.55 * (1 - sm((nu - 0.2) / 0.22));
  return 1 - sm((nu - E0) / 0.34);
}
/** The foam cap's reach over the front (in nu) for a cap size `ck` (0..1). */
export const lipReach = (ck) => E0 + 0.42 * ck;
/** The overhanging cap at `nu` as [bottom, top] fractions of H, or null: it hangs over the front from the crest, thinning to a tip at `e`. */
export function capSpan(nu, e) {
  if (nu < 0.05 || nu > e) return null;
  const q = (nu - 0.05) / (e - 0.05), top = 1 - 0.28 * q * q, bot = 0.55 + (top - 0.55) * Math.pow(q, 1.4);
  return bot < top - 0.01 ? [bot, top] : null;
}
const capThick = (nu, ck) => ck * 0.5 * sm((nu + 1.1) / 0.9);                            // how deep the foam lies on the surface of the crest and the upper back slope

const LUT = { res: 64, plain: null, capped: null };                                         // the body's profile tabulated once (nu from -BACK, 1/64 steps), for the plain and the capped wave
{ const n = Math.ceil((BACK + 0.6) * LUT.res) + 1; LUT.plain = new Float32Array(n); LUT.capped = new Float32Array(n); for (let k = 0; k < n; k++) { const nu = k / LUT.res - BACK; LUT.plain[k] = bodyFrac(nu, false); LUT.capped[k] = bodyFrac(nu, true); } }

const gridCache = { key: '', grid: null, minTop: null, capTh: null, top: null, bot: null };

/**
 * Builds and draws the sheet. `env`: proj(wx, wy) -> { x, y, scale } | null, C (cell px, a multiple of the art pixel U), U, vw, vh (the view), wave, shore(y), y0, y1 (rows in view),
 * hK (height factor on the sample's h), step (world px between lattice points), P (palette), now. Returns how many rectangles were drawn.
 */
function sheet(ctx, env) {
  const { proj, C, U, vw, vh, wave, shore, y0, y1, hK, step: D, P } = env, age = wave.age, id = wave.id;
  const cols = Math.ceil(vw / C) + 1, R = Math.ceil(vh / C) + 1, key = cols + 'x' + R;
  if (gridCache.key !== key) { gridCache.key = key; gridCache.grid = new Uint8Array(cols * R); gridCache.minTop = new Int16Array(cols); gridCache.capTh = new Uint8Array(cols); gridCache.top = new Int16Array(cols); gridCache.bot = new Int16Array(cols); }
  const { grid, minTop, capTh, top, bot } = gridCache;
  const yStart = y0 * TILE + TILE / 2, nI = Math.floor(((y1 - y0) * TILE) / D) + 1, k16 = wave.k * TILE;
  const Hs = new Float32Array(nI), ck = new Float32Array(nI), brk = new Uint8Array(nI);
  let Hmax = 0;
  for (let i = 0; i < nI; i++) {                                                            // the wave's height and cap at every point of the front
    const wy = yStart + i * D, row = (wy - TILE / 2) / TILE, b = bodyAt(wave, row - wave.k, shore(Math.min(y1, Math.max(y0, Math.round(row)))));
    if (!b || b.a < 0.06) continue;
    Hs[i] = b.h * hK * (0.3 + 0.7 * b.a);
    ck[i] = b.broken ? 0.85 + 0.15 * b.curl : b.curl > 0.5 ? (b.curl - 0.5) * 1.8 : 0;
    brk[i] = b.broken ? 1 : 0;
    if (Hs[i] > Hmax) Hmax = Hs[i];
  }
  if (!Hmax) return 0;
  grid.fill(0); minTop.fill(32767); capTh.fill(0); top.fill(32767); bot.fill(-1);
  const jMax = Math.ceil(0.5 * Hmax / D);
  const wr = (c, ya, yb, v, onlyEmpty) => {                                                // write the cells [ya, yb) of column c
    if (c < 0 || c >= cols) return;
    if (ya < 0) ya = 0; if (yb > R) yb = R;
    const o = c * R;
    if (onlyEmpty) { let any = false; for (let r = ya; r < yb; r++) if (!grid[o + r]) { grid[o + r] = v; any = true; if (r < top[c]) top[c] = r; if (r > bot[c]) bot[c] = r; } return any; }
    if (ya >= yb) return false;
    for (let r = ya; r < yb; r++) grid[o + r] = v;
    if (ya < top[c]) top[c] = ya; if (yb - 1 > bot[c]) bot[c] = yb - 1;
    return true;
  };
  const rp = new Array(nI);                                                                 // the crest's ground point of each row, projected once: along a row the depth is the same, so a point j steps shoreward is just j * step * scale to the right
  for (let i = 0; i < nI; i++) if (Hs[i]) { const wy = yStart + i * D; rp[i] = proj(wy - k16, wy); }
  const at = (i, j) => { const r = rp[i]; return r ? { x: r.x + j * D * r.scale, y: r.y, scale: r.scale } : null; };   // the ground point j steps shoreward (east) of the front on the row of point i: the profile lies along the screen's horizontal, as in the reference
  for (let i = nI - 1; i >= 0; i--) {                                                        // 1. the body, nearest row first: each point writes only what it adds above what is already there
    const r = rp[i];
    if (!r || r.y < 0 || r.y - Hs[i] * r.scale > vh) continue;
    const H = Hs[i], capped = ck[i] > 0.25, lut = capped ? LUT.capped : LUT.plain, sc = r.scale, w = Math.max(1, Math.ceil(D * sc / C)), by = Math.ceil(r.y / C);
    const jlo = -Math.ceil(BACK * H / D), jhi = Math.ceil(0.45 * H / D);
    for (let j = jlo; j <= jhi; j++) {
      const nu = j * D / H, hb = lut[Math.round((nu + BACK) * LUT.res)] || 0;
      if (hb < 0.012) continue;
      const px = r.x + j * D * sc;
      if (px < -C * 4 || px > vw + C * 4) continue;
      const cx = Math.floor(px / C), ty = Math.floor((r.y - hb * H * sc) / C);
      if (by < 0 || ty >= R) continue;
      const th = capped ? Math.round(capThick(nu, ck[i]) * H * sc / C) : 0;
      for (let c = cx; c < cx + w; c++) {
        if (c < 0 || c >= cols) continue;
        const end = Math.min(by, minTop[c]);
        if (ty < end && wr(c, ty, end, BODY, false)) { minTop[c] = ty; capTh[c] = th > 255 ? 255 : th; }
      }
    }
  }
  for (let i = nI - 1; i >= 0; i--) {                                                        // 2. the lip: the foam cap overhanging the front, with the dark pocket under it (only where nothing nearer stands)
    if (!Hs[i] || ck[i] <= 0.25) continue;
    for (let j = 0; j <= jMax; j++) {
      const H = Hs[i], nu = j * D / H, e = lipReach(ck[i]);
      if (nu < 0.05 || nu > e) continue;
      const p = at(i, j);
      if (!p) continue;
      const cx = Math.floor(p.x / C), w = Math.max(1, Math.ceil(D * p.scale / C)), sp = capSpan(nu, e), body = bodyFrac(nu, true);
      for (let c = cx; c < cx + w; c++) {
        if (sp) wr(c, Math.floor((p.y - sp[1] * H * p.scale) / C), Math.ceil((p.y - sp[0] * H * p.scale) / C), CAP, true);
        if (nu > 0.12 && nu < e - 0.04 && sp) wr(c, Math.ceil((p.y - sp[0] * H * p.scale) / C), Math.ceil((p.y - Math.max(body, 0.04) * H * p.scale) / C), BARREL, true);
      }
    }
  }
  for (let i = 0; i < nI; i += 2) {                                                          // 3. the lighter dashes on the water, anchored to the front's own points
    if (!Hs[i]) continue;
    const ab = Math.round((yStart + i * D) / D), sd = ab + id * 977;
    if (hash(sd, 1, 31) > 0.78) continue;
    const H = Hs[i], nu = -0.1 - 0.75 * hash(sd, 2, 32), hb = bodyFrac(nu, ck[i] > 0.25), p = at(i, Math.round(nu * H / D));
    if (!p || hb < 0.12) continue;
    const c0 = Math.floor(p.x / C), r = Math.floor((p.y - hb * H * p.scale * (0.1 + 0.55 * hash(sd, 3, 33))) / C), len = 3 + Math.floor(hash(sd, 4, 34) * 5);
    for (let q = 0; q < len; q++) { const c = c0 + q; if (c >= 0 && c < cols && r >= 0 && r < R && grid[c * R + r] === BODY) grid[c * R + r] = DASH; }
  }
  for (let c = 0; c < cols; c++) {                                                           // 4. the foam lying on the crest, and the light outline that steps up the silhouette
    if (bot[c] < 0) continue;
    const t = top[c], o = c * R, th = capTh[c];
    for (let r = t; r < t + th && r <= bot[c]; r++) if (grid[o + r] === BODY || grid[o + r] === DASH) grid[o + r] = CAP;
    if (th > 2 && t + th <= bot[c]) {                                                       // the foam's lower rim, and the shaded teeth of water under it
      if (grid[o + t + th - 1] === CAP) grid[o + t + th - 1] = CAP2;
      if (grid[o + t + th] === BODY && (c & 1) === 0) grid[o + t + th] = BARREL;
      if (t + th + 1 <= bot[c] && grid[o + t + th + 1] === BODY && (c & 3) === 0) grid[o + t + th + 1] = BARREL;
    }
  }
  for (let c = 0; c < cols; c++) {
    if (bot[c] < 0) continue;
    const t = top[c], o = c * R, drop = Math.max(c > 0 && bot[c - 1] >= 0 ? top[c - 1] : t, c + 1 < cols && bot[c + 1] >= 0 ? top[c + 1] : t), last = Math.min(drop - 1, t + 1);
    for (let r = t; r <= Math.max(t, last) && r <= bot[c]; r++) { const v = grid[o + r]; if (v === BODY || v === CAP || v === DASH) grid[o + r] = EDGE; }
  }
  const out = bin(), list = [];
  let pk = [], pr = [], ck2 = [], cr = [];                                                   // the open runs of the column to the left (key, rect), and of this one
  for (let c = 0; c < cols; c++) {                                                           // 5. every column as runs, merged with the same run of the column to its left
    ck2.length = 0; cr.length = 0;
    if (bot[c] >= 0) {
      const o = c * R;
      let r = top[c];
      while (r <= bot[c]) {
        const v = grid[o + r];
        if (!v) { r++; continue; }
        let r1 = r;
        while (r1 + 1 <= bot[c] && grid[o + r1 + 1] === v) r1++;
        const below = r1 + 1 <= bot[c] ? grid[o + r1 + 1] : 0, rim = v === CAP && (below === 0 || below === BARREL);
        for (let part = 0; part < (rim && r1 > r ? 2 : 1); part++) {
          const a0 = rim && r1 > r && part === 1 ? r1 : r, b0 = rim ? (r1 > r && part === 0 ? r1 - 1 : r1) : r1, col = rim ? (r1 > r && part === 0 ? CAP : CAP2) : v;
          const k = (col << 20) | (a0 << 10) | b0;
          let f = null;
          for (let q = 0; q < pk.length; q++) if (pk[q] === k && pr[q].c1 === c) { f = pr[q]; break; }
          if (f) f.c1 = c + 1; else { f = { col, a: a0, b: b0, c0: c, c1: c + 1 }; list.push(f); }
          ck2.push(k); cr.push(f);
        }
        r = r1 + 1;
      }
    }
    [pk, ck2] = [ck2, pk]; [pr, cr] = [cr, pr];
  }
  for (const rc of list) out.put(P[rc.col], rc.c0 * C, rc.a * C, (rc.c1 - rc.c0) * C, (rc.b - rc.a + 1) * C, U);
  // 6. the loose spray off the lip, and the whitewater tumbling behind the broken part
  for (let i = 0; i < nI; i += 3) {
    if (!Hs[i] || ck[i] <= 0.25) continue;
    const H = Hs[i], e = lipReach(ck[i]), ab = Math.round((yStart + i * D) / D), sd = ab + id * 977;
    for (let q = 0; q < 3; q++) {
      const ph = (age / 640 + hash(sd, q, 12)) % 1;
      if (ph > 0.88) continue;
      const p = at(i, Math.round((e + 0.05 + ph * 0.28 + hash(sd, q, 13) * 0.1) * H / D));
      if (p) out.put(hash(sd, q, 14) > 0.4 ? P[WHITE] : P[CAP], p.x, p.y - (0.78 + 0.5 * ph - 0.35 * ph * ph + hash(sd, q, 15) * 0.15) * H * p.scale, U * (hash(sd, q, 16) > 0.7 ? 2 : 1), U * (hash(sd, q, 16) > 0.7 ? 2 : 1), U);
    }
  }
  for (let i = 0; i < nI; i += 2) {
    if (!Hs[i] || !brk[i]) continue;
    const H = Hs[i], ab = Math.round((yStart + i * D) / D), sd = ab + id * 977;
    for (let q = 0; q < 3; q++) {
      if (hash(sd, q, 40) > 0.7) continue;
      const ph = (age / 900 + hash(sd, q, 41)) % 1;
      if (ph > 0.9) continue;
      const p = at(i, Math.round((-BACK - 0.02 - ph * 0.45) * H / D));
      if (p) out.put(hash(sd, q, 42) > 0.45 ? P[CAP] : P[WHITE], p.x, p.y - Math.sin(ph * Math.PI) * 3 * p.scale, U * (hash(sd, q, 43) > 0.5 ? 3 : 2), U, U);
    }
  }
  out.flush(ctx);
  return out.count;
}

/** Draws the wave into `ctx`. `n` is the night amount (it darkens the colours), `shore(y)` the first shallow column of a row, `rows` the map's row count. Returns how many rectangles were drawn. */
export function drawWave(ctx, cam, view, wave, n, now, shore, rows) {
  const rt = groundRow(cam, 0), rb = groundRow(cam, view.h - 1);
  const y0 = Math.max(1, Math.floor((rt ? rt.y : cam.focusY - 700) / TILE) - 1), y1 = Math.min(rows - 2, Math.ceil((rb ? rb.y : cam.focusY + 400) / TILE) + 1);
  if (!wave || y1 <= y0) return 0;
  const U = pixelOf(cam);
  return sheet(ctx, { proj: (x, y) => project(cam, x, y), C: U * 3, U, vw: view.w, vh: view.h, wave, shore, y0, y1, hK: WAVE_LIFT * 1.5, step: 6, P: paletteFor(n) });
}

/** The simple version for the flat view: the same silhouette in game px (cells of 2 px), drawn into `sctx` already translated to the map (positions are world px minus `cam`); `view` is the visible size. */
export function drawWaveFlat(sctx, wave, cam, area, shore, now = 0, view = { w: 400, h: 300 }) {
  if (!wave) return 0;
  const y0 = Math.max(1, Math.floor(cam.y / TILE) - 1), y1 = Math.min(area.h - 2, Math.ceil((cam.y + view.h) / TILE) + 1);
  if (y1 <= y0) return 0;
  return sheet(sctx, { proj: (x, y) => ({ x: x - cam.x, y: y - cam.y, scale: 1 }), C: 2, U: 2, vw: view.w, vh: view.h, wave, shore, y0, y1, hK: 3.4, step: 2, P: paletteFor(0) });
}
