// The surf wave drawn as pixel particles, in the spirit of odd/refs/surf-ref.png: the face is chunky dashes and specks of several blues (darker at the base, paler at the top, a few light
// streaks), the crest is a white foam ridge of clustered white and pale-blue pixel blobs that curls over at the peel point with a dark barrel under the lip, spray dots fly off the lip,
// and whitewater bits tumble behind the broken part. The geometry and the timing are the wave of the clock (src/surf.js waveAt / waveBody / bodyAt): nothing here decides anything. Every
// particle is placed from the sample's index and the wave's own age (the clock), so every player sees the same pattern and nothing is stored; each is snapped to a whole art pixel of the
// scene, the count is bounded, only the rows in view are drawn, and the cells are batched by colour into a few fill calls.
import { waveBody, WAVE_LIFT } from '../surf.js';
import { groundRow, project } from './camera.js';
import { TILE } from '../map.js';

export { WAVE_LIFT };
export const MAX_PARTICLES = 3600;

const hash = (a, b, c = 0) => { let h = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 0x45d9f3b); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967295; };

const DAY = { trough: '#0e2f60', trough2: '#173f7c', deep: '#123f78', mid: '#2a82bd', light: '#56bde4', pale: '#a8e8f6', streak: '#d2f4fb', foam: '#ffffff', foam2: '#d4f2fa', foam3: '#a6d6ee', barrel: '#133a74' };
const mixHex = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };
const palettes = new Map();
const paletteFor = (n) => {                                                              // the colours for a night amount, quantised so they are made once
  const q = Math.round(n * 10);
  let p = palettes.get(q);
  if (!p) { p = {}; for (const [k, v] of Object.entries(DAY)) p[k] = q ? mixHex(v, '#0b1632', 0.5 * (q / 10)) : v; palettes.set(q, p); }
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

/** Draws the wave into `ctx`. `n` is the night amount (it darkens the colours), `shore(y)` the first shallow column of a row, `rows` the map's row count. Returns how many particles were drawn. */
export function drawWave(ctx, cam, view, wave, n, now, shore, rows) {
  const rt = groundRow(cam, 0), rb = groundRow(cam, view.h - 1);
  const r0 = Math.max(1, Math.floor((rt ? rt.y : cam.focusY - 700) / TILE) - 1), r1 = Math.min(rows - 2, Math.ceil((rb ? rb.y : cam.focusY + 400) / TILE) + 1);
  const body = waveBody(wave, r0, r1, TILE, shore);
  if (!body.length) return 0;
  const U = pixelOf(cam), C = U * 2, P = paletteFor(n), age = wave.age, id = wave.id, out = bin();
  const ps = body.map((s) => project(cam, s.x, s.y)), behind = body.map((s) => project(cam, s.x - 13, s.y + 13));
  const on = (p, m = 80) => p && p.x > -m && p.x < view.w + m && p.y > -m * 3 && p.y < view.h + m * 3;
  const seed = (i) => Math.round(body[i].y * 2) + id * 977;                               // each sample's own seed: its row and the wave's id
  const lifts = body.map((s, i) => (ps[i] ? s.h * WAVE_LIFT * ps[i].scale : 0));
  const keep = (s, i, q) => hash(seed(i), q, 91) <= s.a;                                  // a wave that dies on the shallows thins out into fewer and fewer specks

  for (let i = 0; i < body.length; i++) {                                                  // 1. the trough ahead of the front: dark dashes, thinning out with the distance
    const s = body[i];
    if (!ps[i] || !on(ps[i])) continue;
    for (let d = 0; d < 4; d++) {
      if (hash(seed(i), d, 1) > [0.95, 0.85, 0.6, 0.35][d] || !keep(s, i, 10 + d)) continue;
      const p = project(cam, s.x + 3 + d * 6, s.y - 3 - d * 6);
      if (!p) continue;
      out.put(hash(seed(i), d, 2) > 0.5 ? P.trough : P.trough2, p.x - C, p.y, C * (2 + (hash(seed(i), d, 3) > 0.5 ? 1 : 0)), C, U);
    }
  }
  for (let i = 0; i < body.length; i++) {                                                  // 2. the face: rows of chunky dashes from the water behind the crest up to the lip, dark to pale
    const s = body[i], p = ps[i], b = behind[i];
    if (!p || !b || !on(p)) continue;
    const top = p.y - lifts[i], nk = Math.max(2, Math.round((b.y - top) / U / 1.5)), sp = ps[i + 1] ? Math.abs(ps[i + 1].x - p.x) : 20, wd = Math.max(C * 3, Math.round(sp / U) * U + C);
    for (let k = 0; k < nk; k++) {
      if (!keep(s, i, 20 + k)) continue;
      const f = (k + 0.5) / nk, v = f + (hash(seed(i), k, 4) - 0.5) * 0.38;
      const x = b.x + (p.x - b.x) * f + (hash(seed(i), k, 5) - 0.5) * U, y = b.y + (top - b.y) * f;
      const color = v < 0.2 ? P.deep : v < 0.46 ? P.mid : v < 0.74 ? P.light : P.pale;
      out.put(color, x - wd / 2, y - U, wd - (hash(seed(i), k, 6) > 0.6 ? U : 0), C - U, U);
      if (hash(seed(i), k, 7) > 0.84) out.put(P.streak, x - C * 0.5 + (hash(seed(i), k, 8) - 0.5) * C * 2, y - U * 1.5 + C * (hash(seed(i), k, 9) > 0.5 ? 1 : 0), C * 2, U, U);      // a light streak along the face
    }
  }
  for (let i = 0; i < body.length; i++) {                                                  // 3. the foam crest: a ridge of white and pale-blue blobs, hooking over at the peel
    const s = body[i], p = ps[i];
    if (!p || !on(p)) continue;
    const x = p.x, y = p.y - lifts[i], r = (q) => hash(seed(i), q, 11);
    if (s.curl > 0.55) {                                                                   // the barrel under the lip, and the lip curling over and down
      out.put(P.barrel, x, y + U, U * 3, U * 3, U);
      out.put(P.foam, x + U, y - U, U * 3, U, U); out.put(P.foam, x + U * 3, y, U, U * 2, U); out.put(P.foam, x + U * 2, y + U * 2, U, U, U); out.put(P.foam2, x + U * 4, y + U, U, U, U);
    }
    if (!keep(s, i, 30)) continue;
    out.put(P.foam, x - U * 2.5, y - (s.broken ? U : 0), U * (5 + (r(1) > 0.5 ? 2 : 0)), U * 2, U);
    out.put(P.foam2, x - U * 3.5 + (r(2) - 0.5) * U * 2, y + U * 2, U * 4, U, U);
    if (s.broken && r(10) > 0.3) out.put(P.foam, x - U * 4, y - U * 2, U * 3, U, U);
    if (r(3) > 0.35) out.put(P.foam, x - U + (r(4) - 0.5) * U * 3, y - U * 2, U * (1 + (r(5) > 0.5 ? 1 : 0)), U, U);
    if (r(6) > 0.5) out.put(P.foam3, x + (r(7) - 0.3) * U * 3, y + U * 2, U * 2, U, U);
    if (r(8) > 0.7) out.put(P.foam, x - U * 3, y + U * 2 + (r(9) > 0.5 ? U : 0), U, U, U);
  }
  for (let i = 0; i < body.length; i++) {                                                  // 4. spray dots flying off the lip
    const s = body[i], p = ps[i];
    if (!p || s.curl < 0.22 || !on(p)) continue;
    for (let q = 0; q < 5; q++) {
      const ph = (age / 560 + hash(seed(i), q, 12)) % 1;
      if (ph > 0.9) continue;
      const jx = (hash(seed(i), q, 13) - 0.25) * 12, vy = 12 + hash(seed(i), q, 14) * 12;
      out.put(P.foam, p.x + (jx * ph + 3) * p.scale, p.y - lifts[i] - (vy * ph - 18 * ph * ph) * p.scale, U, U, U);
    }
  }
  for (let i = 0; i < body.length; i++) {                                                  // 5. whitewater behind the broken part: blobs that drift back and tumble, and a thicker foam right behind the crest
    const s = body[i];
    if (!s.broken || !ps[i] || !on(ps[i])) continue;
    for (let q = 0; q < 7; q++) {
      if (!keep(s, i, 40 + q)) continue;
      const ph = (age / 900 + hash(seed(i), q, 15)) % 1;
      if (ph > 0.92) continue;
      const off = 5 + ph * 36, p = project(cam, s.x - off, s.y + off);
      if (!p || !on(p)) continue;
      const kind = hash(seed(i), q, 16), y = p.y - Math.sin(ph * Math.PI) * 5 * p.scale;
      if (kind < 0.3) out.put(P.foam, p.x, y, U, U, U); else if (kind < 0.7) out.put(P.foam, p.x, y, U * 3, U, U); else if (kind < 0.9) { out.put(P.foam2, p.x, y, U * 2, U, U); out.put(P.foam, p.x + U, y - U, U, U, U); } else out.put(P.foam3, p.x, y, U * 2, U * 2, U);
    }
    for (let q = 0; q < 3; q++) {
      const off = 3 + q * 4 + hash(seed(i), q, 17) * 3, p = project(cam, s.x - off, s.y + off);
      if (p && keep(s, i, 50 + q)) out.put(q === 2 ? P.foam3 : P.foam2, p.x, p.y, U * (2 + (hash(seed(i), q, 18) > 0.5 ? 1 : 0)), U, U);
    }
  }
  out.flush(ctx);
  return out.count;
}

/** The simple version for the flat view: the same particle style in game px (cells of 2 px), drawn into `sctx` already translated to the map (positions are world px minus `cam`). */
export function drawWaveFlat(sctx, wave, cam, area, shore, now = 0) {
  const body = waveBody(wave, 1, area.h - 2, TILE, shore);
  if (!body.length) return 0;
  const U = 2, out = bin(), P = DAY, id = wave.id, age = wave.age;
  const seed = (s) => Math.round(s.y * 2) + id * 977;
  body.forEach((s, i) => {
    const x = s.x - cam.x, y = s.y - cam.y, lift = Math.max(4, Math.round(s.h * 0.7)), sd = seed(s), keep = (q) => hash(sd, q, 91) <= s.a;
    if (x < -20 || x > 2000 || y < -20 || y > 2000) return;
    if (keep(1)) out.put(hash(sd, 1, 2) > 0.5 ? P.trough : P.trough2, x + 4, y - 7, 8, 2, U);
    const nk = Math.max(2, Math.round(lift / U));
    for (let k = 0; k < nk; k++) { if (!keep(20 + k)) continue; const f = (k + 0.5) / nk, v = f + (hash(sd, k, 4) - 0.5) * 0.4; out.put(v < 0.3 ? P.deep : v < 0.6 ? P.mid : v < 0.85 ? P.light : P.pale, x - 4, y - f * lift, 6 + (hash(sd, k, 6) > 0.5 ? 2 : 0), U, U); }
    if (keep(30)) { out.put(P.foam, x - 3, y - lift - (s.broken ? 2 : 0), 6, U, U); if (hash(sd, 3, 11) > 0.4) out.put(P.foam2, x - 5, y - lift + 2, 4, U, U); }
    if (s.curl > 0.25) { out.put(P.barrel, x, y - lift + 2, 6, 6, U); out.put(P.foam, x + 2, y - lift - 2, 6, U, U); out.put(P.foam, x + 6, y - lift, U, 4, U); }
    if (s.broken) for (let q = 0; q < 3; q++) { if (!keep(40 + q)) continue; const ph = (age / 900 + hash(sd, q, 15)) % 1; if (ph > 0.92) continue; out.put(hash(sd, q, 16) > 0.5 ? P.foam : P.foam2, x - 5 - ph * 22, y + 4 + ph * 18 - Math.sin(ph * Math.PI) * 3, hash(sd, q, 17) > 0.5 ? 4 : U, U, U); }
  });
  out.flush(sctx);
  return out.count;
}
