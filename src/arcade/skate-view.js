// Draws the skate game: a night promenade seen from behind the board. A starry sky with a moon over a lit skyline, then the ground a screen row at a time
// (river with a railing on the left, the paved path with warm pools of lamplight, grass on the right), then the lamps, trees, planters and the things on the
// path far to near, and the board with the pet. The board's shadow stays on the ground while the pet arcs. No rules here: it reads the game state and a clock.
import { createProjection } from './lanes.js';
import { hash } from './scenery.js';
import { SKATE, KINDS, isHazard } from './skate.js';
import { backCanvas, RUN_SEQ } from './back-sprites.js';
import { scaled } from './train-view.js';
import * as art from './art.js';
import * as sa from './skate-art.js';

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`; };
const HAZE = '#5a4f98';
const hexMix = (a, b, t) => { const x = hex(a), y = hex(b); return `#${[0, 1, 2].map((i) => Math.round(lerp(x[i], y[i], t)).toString(16).padStart(2, '0')).join('')}`; };
export const FAR = 270, FADE_FROM = 200;
const HU = 13;                                   // pixels per height unit at the board's depth
const PAVER = 9;                                 // paving stones are this long
const LAMP_GAP = 40, LAMP_LANE = 2.15, POOL_Z = 15, POOL_X = 1.9;
const RAIL_LANE = -2.55, WATER_EDGE = -2.7;
const PIPE_FLOOR = 0.55, PIPE_TOP = 1.9, PIPE_H = 3.4, DECK = 0.5;     // the half-pipe: half width of the flat floor, where the coping is, how high it is (height units), the deck beyond it
const PIPE_R = PIPE_TOP - PIPE_FLOOR, RIDE_T = 0.8, RIDE_A = PIPE_FLOOR + RIDE_T * PIPE_R;   // the wall is a quarter circle; a board on a wall rides at 80 % of the way up it
const SLOT = RIDE_A;
const PLAZA_FROM = 90, PLAZA_FLAT = 10;                              // the pipe's walls sink to a flat paved yard over the 80 units before the house (distances before the goal)
const HOUSE_AHEAD = 18;                                             // the house stands this far past the goal (the board stops at the goal)
/** Height (height units) of the half-pipe's surface at lateral distance aa from the middle: flat floor, a quarter-circle wall, then the deck at the coping's height. */
const surfaceH = (aa) => (aa <= PIPE_FLOOR ? 0 : aa >= PIPE_TOP ? PIPE_H : PIPE_H * (1 - Math.sqrt(1 - ((aa - PIPE_FLOOR) / PIPE_R) ** 2)));
/** The wall's angle (radians) at lateral aa: 0 on the floor, 90 degrees at the coping. */
const surfaceTilt = (aa) => (aa <= PIPE_FLOOR ? 0 : Math.asin(Math.min(1, (aa - PIPE_FLOOR) / PIPE_R)));
const SKY = ['#10123a', '#171a4e', '#20256a', '#2c3282', '#3e3f98', '#58509f', '#7a5aa3', '#a86aa3'];

export function createSkateView({ w, h }) {
  const hy = Math.round(h * 0.34), gy = Math.round(h * 0.82);
  const proj = createProjection({ w, h, horizon: hy, ground: gy, laneW: Math.round(w * 0.27) });
  const U = proj.laneW / 50, span = gy - hy, FOCAL = proj.focal;
  const wpx = (lanes) => String(Math.max(8, Math.round(lanes * 50)));      // widths of the wide sprites, at a 50 px lane

  // ---- per-row colours ---------------------------------------------------------------------------------------------------------------------------
  const rows = [];
  for (let y = hy + 1; y < h; y++) {
    const k = (y - hy) / span, f = Math.max(0, Math.min(0.7, 1 - k * 3.4));
    const m = (c) => (f > 0.01 ? mix(c, HAZE, f) : c);
    rows[y] = {
      gr: m('#1d4743'), grD: m('#143a38'), grL: m('#2f6a53'),
      wa: m('#1d3b86'), waL: m('#4a7bd0'), waD: m('#162d6c'), waS: m('#9fc4ff'),
      pr: m('#474c7e'), prJ: m('#383d6a'),
      wb: Array.from({ length: 8 }, (_, i) => m(hexMix('#a8add9', '#2b2f5e', i / 7))), lip: m('#c4caf0'), lipD: m('#55598c'), fe: m('#2c3060'), cl: m('#e0d890'),
      pA: m('#858abf'), pB: m('#7a80b5'), pJ: m('#575c90'), pAvg: m('#8085ba'),
      cu: m('#a0a6d6'), cuD: m('#6d73aa'),
    };
  }

  // ---- the backdrop: sky, stars, moon, skyline and a tree line, painted once ------------------------------------------------------------------------
  const PAD = 24;
  const backdrop = document.createElement('canvas');
  backdrop.width = w + PAD * 2; backdrop.height = hy + 2;
  {
    const g = backdrop.getContext('2d'), bw = backdrop.width;
    const band = Math.ceil((hy + 2) / SKY.length);
    SKY.forEach((c, i) => {
      g.fillStyle = c; g.fillRect(0, i * band, bw, band + 1);
      if (i) for (let x = 0; x < bw; x += 2) { g.fillStyle = SKY[i - 1]; g.fillRect(x + (i & 1), i * band, 1, 1); g.fillRect(x + ((i + 1) & 1), i * band + 1, 1, 1); }
    });
    for (let i = 0; i < 70; i++) {                                            // stars, more of them higher up
      const x = Math.floor(hash(i, 1) * bw), y = Math.floor(hash(i, 2) ** 1.6 * hy * 0.62);
      g.fillStyle = hash(i, 3) < 0.2 ? '#fff7de' : '#b8bcf0'; g.fillRect(x, y, 1, 1);
      if (hash(i, 4) < 0.12) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
    }
    // the moon, with a halo and a few craters
    const mx = Math.round(bw * 0.66), my = Math.round(hy * 0.2), mr = Math.max(9, Math.round(hy * 0.07));
    for (const [r, a] of [[mr * 3, 0.06], [mr * 2.2, 0.09], [mr * 1.6, 0.14]]) { g.fillStyle = `rgba(210,210,255,${a})`; g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill(); }
    for (let y = -mr; y <= mr; y++) for (let x = -mr; x <= mr; x++) if (x * x + y * y <= mr * mr) { g.fillStyle = x * x + y * y > (mr - 1.5) ** 2 ? '#d8d6f0' : x + y > mr * 0.5 ? '#e6e4fa' : '#f6f4ff'; g.fillRect(mx + x, my + y, 1, 1); }
    for (const [dx, dy, r] of [[-3, -2, 2], [2, 3, 2], [3, -4, 1]]) { g.fillStyle = '#cfcce8'; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) g.fillRect(mx + dx + x, my + dy + y, 1, 1); }
    // two ranks of buildings with lit windows; a tower with a dome and a spire in the middle distance
    const rank = (base, minH, maxH, wMin, wMax, body, edge, seed, density, glow) => {
      for (let x = -4; x < bw; ) {
        const bwid = wMin + Math.floor(hash(x, seed) * (wMax - wMin)), bh = Math.round(minH + hash(x, seed + 1) * (maxH - minH)), top = hy - base - bh;
        g.fillStyle = body; g.fillRect(x, top, bwid, bh + base + 2);
        g.fillStyle = edge; g.fillRect(x, top, 1, bh + base + 2); g.fillRect(x, top, bwid, 1);
        for (let wy = top + 4; wy < hy - 6; wy += 4) for (let wx = x + 2; wx < x + bwid - 2; wx += 3) if (hash(wx * 7 + seed, wy * 3) < density) { g.fillStyle = hash(wx, wy) < 0.3 ? '#fff0b8' : glow; g.fillRect(wx, wy, 1, 2); }
        x += bwid + (hash(x, seed + 2) < 0.3 ? 1 : 0);
      }
    };
    rank(4, hy * 0.08, hy * 0.2, 7, 14, '#2a2f78', '#3c4296', 11, 0.16, '#ffd27a');
    const tx = Math.round(bw * 0.58);
    g.fillStyle = '#2b3080'; g.fillRect(tx - 9, hy - 4 - Math.round(hy * 0.2), 18, Math.round(hy * 0.2) + 6);
    g.fillStyle = '#3c4296'; g.fillRect(tx - 9, hy - 4 - Math.round(hy * 0.2), 1, Math.round(hy * 0.2) + 6);
    for (let y = -6; y <= 0; y++) for (let x = -8; x <= 8; x++) if (x * x / 64 + y * y / 36 <= 1) { g.fillStyle = x < 0 ? '#4a529e' : '#363c8a'; g.fillRect(tx + x, hy - 4 - Math.round(hy * 0.2) + y - 1, 1, 1); }
    g.fillStyle = '#4a529e'; g.fillRect(tx, hy - 4 - Math.round(hy * 0.2) - 14, 1, 8);
    for (let wy = hy - 4 - Math.round(hy * 0.2) + 4; wy < hy - 8; wy += 5) for (const wx of [tx - 6, tx - 2, tx + 2, tx + 5]) if (hash(wx, wy) < 0.6) { g.fillStyle = '#ffd27a'; g.fillRect(wx, wy, 2, 3); }
    rank(1, hy * 0.1, hy * 0.28, 8, 17, '#1d2160', '#2d3484', 23, 0.34, '#ffc766');
    // a tree line along the horizon, dark, with a pink blossom here and there
    for (let x = -4; x < bw + 8; x += 6 + Math.floor(hash(x, 2) * 5)) {
      const r = 6 + Math.floor(hash(x, 3) * 5), cy = hy - 2 - Math.floor(hash(x, 5) * 3), t = document.createElement('canvas');
      t.width = 2 * r + 2; t.height = 2 * r + 2;
      const blossom = hash(x, 6) < 0.12;
      art.blob(t.getContext('2d'), [[r + 1, r + 1, r]], blossom ? { o: '#4a2058', d: '#8a3a78', m: '#b8508e', l: '#d878a8', h: '#f0a0c4' } : { o: '#0c1f2a', d: '#123a3a', m: '#1c5a48', l: '#2a7656', h: '#3c9468' }, x);
      g.drawImage(t, x - r - 1, cy - r - 1);
    }
    g.fillStyle = '#123a3a'; g.fillRect(0, hy - 2, bw, 4);
  }

  const cam = (s) => s.p * SLOT * 0.28;
  const latOf = (slot) => slot * SLOT;
  const raiseOf = (slot) => surfaceH(Math.abs(slot) * SLOT) * HU;               // how many px (at the board's depth) the position is above the floor

  function blit(ctx, cv, lane, z, c, { dy = 0, alpha = 1, stretch = 1, mul = 1 } = {}) {
    const p = proj.project(lane, z, c), sc = p.s * U * mul;
    const dw = Math.round(cv.width * sc * stretch), dh = Math.round(cv.height * sc);
    if (dw < 1 || dh < 1 || p.x + dw / 2 < 0 || p.x - dw / 2 > w) return;
    const a = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) * alpha : alpha;
    if (a <= 0.02) return;
    ctx.globalAlpha = a;
    ctx.drawImage(sc >= 0.999 && sc <= 1.001 && stretch === 1 ? cv : scaled(cv, dw, dh), Math.round(p.x - dw / 2), Math.round(p.y - dh - dy * sc));
    ctx.globalAlpha = 1;
  }
  /** A sprite stuck to the wall: like blit, tipped by `ang` (radians) about its foot and lifted by `dy` px. */
  function blitTilt(ctx, cv, lane, z, c, ang, dy, alpha = 1) {
    const p = proj.project(lane, z, c), sc = p.s * U;
    const dw = Math.round(cv.width * sc), dh = Math.round(cv.height * sc);
    if (dw < 1 || dh < 1 || p.x + dw < 0 || p.x - dw > w) return;
    const a = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) * alpha : alpha;
    if (a <= 0.02) return;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(Math.round(p.x), Math.round(p.y - dy * sc)); ctx.rotate(ang);
    ctx.drawImage(sc >= 0.999 && sc <= 1.001 ? cv : scaled(cv, dw, dh), -Math.round(dw / 2), -dh);
    ctx.restore();
  }
  function line(ctx, x0, y0, x1, y1, color, thick = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    ctx.fillStyle = color;
    for (;;) {
      ctx.fillRect(x0, y0, 1, thick);
      if ((x0 === x1 && y0 === y1) || n++ > 800) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ---- lamps: where they stand (a pure function of the distance) ----------------------------------------------------------------------------------
  const lampsIn = (from, to) => {
    const out = [];
    for (let i = Math.ceil((from - 14) / LAMP_GAP); i * LAMP_GAP + 14 <= to; i++) out.push({ i, z: i * LAMP_GAP + 14, side: i % 2 ? 1 : -1 });
    return out;
  };

  // ---- the ground, a row at a time -----------------------------------------------------------------------------------------------------------------
  function ground(ctx, s, t) {
    const c = cam(s), lamps = lampsIn(s.dist - POOL_Z - 12, s.dist + 300);
    for (let y = hy + 1; y < h; y++) {
      const r = rows[y], k = (y - hy) / span;
      const z = FOCAL * (span / (y - hy) - 1), dz = (FOCAL * span) / ((y - hy) * (y - hy)), wz = z + s.dist;
      const u = proj.laneW * k, cx0 = w / 2 - c * proj.laneW * k;
      const X = (a) => Math.round(cx0 + a * u);
      const stripe = dz > 12 ? 0.5 : Math.floor(wz / 16) & 1;
      ctx.fillStyle = r.gr; ctx.fillRect(0, y, w, 1);
      if (dz < 6) { const b = Math.floor(wz / 5); for (let i = 0; i < 5; i++) { ctx.fillStyle = hash(b, i + 40) < 0.7 ? r.grD : r.grL; ctx.fillRect(Math.floor(hash(b, i + 3) * w), y, k > 0.6 ? 2 : 1, 1); } }
      // the river on the left: still water with slow ripples, lit a little where the moon would fall
      const wr = X(WATER_EDGE);
      if (wr > 0) {
        ctx.fillStyle = r.wa; ctx.fillRect(0, y, wr, 1);
        if (dz < 7) {
          const b = Math.floor((wz + t * 0.012) / 3);
          for (let i = 0; i < 4 + Math.round(k * 5); i++) { const hx = Math.floor(hash(b, i + 11) * wr); ctx.fillStyle = hash(b, i + 21) < 0.2 ? r.waS : hash(b, i + 25) < 0.55 ? r.waL : r.waD; ctx.fillRect(hx, y, 1 + (hash(b, i + 30) < 0.5 ? 1 : 0) + Math.round(k * 2), 1); }
        }
      }
      // the promenade strips beside the pipe (the half-pipe itself is painted on top, pixel by pixel, by pipeLayer)
      ctx.fillStyle = r.pr; ctx.fillRect(Math.max(0, wr), y, Math.max(0, X(2.9) - Math.max(0, wr)), 1);
    }
  }

  // ---- the half-pipe: a height-map seen from behind, painted into a pixel buffer (nearest rows first, each pixel once) --------------------------------
  const layer = document.createElement('canvas');
  layer.width = w; layer.height = h;
  const lctx = layer.getContext('2d'), img = lctx.createImageData(w, h), px = new Uint32Array(img.data.buffer), ymin = new Int16Array(w);
  const rgba = (r, g, b) => (255 << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0));
  const HZ = hex(HAZE);
  const TAGS = [[255, 122, 176], [78, 201, 192], [255, 203, 107]];
  function pipeLayer(ctx, s) {
    px.fill(0); ymin.fill(h);
    const c = cam(s), dist = s.dist, lamps = lampsIn(dist - POOL_Z - 12, dist + 300), aMax = PIPE_TOP + DECK;
    for (let y = h - 1; y > hy; y--) {
      const k = (y - hy) / span, z = FOCAL * (span / (y - hy) - 1), dz = (FOCAL * span) / ((y - hy) * (y - hy)), wz = z + dist;
      const u = proj.laneW * k, cx0 = w / 2 - c * u, hk = HU * k * U;
      const haze = Math.max(0, Math.min(0.7, 1 - k * 3.4));
      const row = Math.floor(wz / PAVER), joint = ((wz % PAVER) + PAVER) % PAVER < dz + 0.4, dash = Math.floor(wz / 14) % 3 === 0;
      const pools = lamps.filter((L) => Math.abs(wz - L.z) < POOL_Z);
      const x0 = Math.max(0, Math.ceil(cx0 - aMax * u)), x1 = Math.min(w - 1, Math.floor(cx0 + aMax * u));
      const fl = Math.max(0, Math.min(1, (s.goal - PLAZA_FLAT - wz) / (PLAZA_FROM - PLAZA_FLAT)));      // 1 in the pipe, 0 in the yard in front of the house
      for (let x = x0; x <= x1; x++) {
        const a = (x + 0.5 - cx0) / u, aa = Math.abs(a), hv = surfaceH(aa) * fl, yt = y - Math.round(hv * hk);
        const lim = ymin[x] - 1;
        if (yt > lim) continue;
        let r, g, b;
        if (aa <= PIPE_FLOOR || fl < 0.3) {                                            // the floor (and the yard): flat concrete with joints and a painted centre line
          r = 108; g = 114; b = 172;
          if (row & 1) { r += 8; g += 8; b += 8; }
          if (joint) { r -= 42; g -= 42; b -= 38; }
          else if (aa < 0.045 && dash) { r = 224; g = 216; b = 144; }
        } else if (aa < PIPE_TOP) {                                                    // the wall: darker low, lighter towards the coping, a hint of seam, tags
          const tt = (aa - PIPE_FLOOR) / PIPE_R, br = (0.3 + 0.78 * Math.pow(tt, 0.9)) * (a < 0 ? 1 : 0.92);
          r = 150 * br; g = 156 * br; b = 210 * br;
          if (joint) { r *= 0.7; g *= 0.7; b *= 0.72; }
          else if (Math.abs(tt - 0.5) < 0.012) { r *= 0.8; g *= 0.8; b *= 0.82; }
          const tag = Math.floor(wz / 12), sd = a < 0 ? 0 : 1;
          if (tt > 0.18 && tt < 0.78 && hash(tag, sd * 7 + 3) < 0.1 && hash(Math.floor(wz) * 3 + x, sd + 11) < 0.45) { const T = TAGS[Math.floor(hash(tag, 9) * 3)]; r = T[0] * br + 20; g = T[1] * br + 20; b = T[2] * br + 20; }
          if (tt > 0.955) { r = 222; g = 227; b = 247; if (tt > 0.985) { r = 255; g = 255; b = 255; } }        // the metal coping
        } else {                                                                       // the deck beyond the coping
          r = 172; g = 177; b = 222;
          if (joint) { r -= 40; g -= 40; b -= 36; }
          if (aa > aMax - 0.06) { r = 96; g = 100; b = 150; }
        }
        for (const L of pools) {                                                       // the lamplight: nested ellipses in (z, across) that follow the surface
          const dzr = (wz - L.z) / POOL_Z, dxr = (a - L.side * 1.0) / POOL_X, q = dzr * dzr + dxr * dxr;
          if (q < 1) { const lv = q < 0.18 ? 0.34 : q < 0.5 ? 0.22 : 0.12; r += (255 - r) * lv; g += (196 - g) * lv; b += (96 - b) * lv; }
        }
        if (haze > 0.01) { r += (HZ[0] - r) * haze; g += (HZ[1] - g) * haze; b += (HZ[2] - b) * haze; }
        const col = rgba(r, g, b);
        for (let yy = Math.max(0, yt); yy <= Math.min(lim, y); yy++) px[yy * w + x] = col;
        ymin[x] = yt;
      }
    }
    lctx.putImageData(img, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }

  // ---- roadside and the things on the path --------------------------------------------------------------------------------------------------------
  function side(from, to) {
    const out = [];
    for (let i = Math.ceil(from / 12); i * 12 <= to; i++) out.push({ kind: 'rail', z: i * 12 });                                   // railing posts along the river
    for (let i = Math.ceil(from / 17); i * 17 <= to; i++) {
      const r = hash(i, 5);
      if (r < 0.45) out.push({ kind: r < 0.12 ? 'blossom' : 'tree', lane: -4 + -hash(i, 6) * 3, z: i * 17 + hash(i, 7) * 7, v: Math.floor(hash(i, 8) * 3) });      // across the river
      if (hash(i, 9) < 0.85) out.push({ kind: hash(i, 10) < 0.5 ? 'tree' : hash(i, 10) < 0.8 ? 'pine' : 'bush', lane: 3.1 + hash(i, 11) * 3.2, z: i * 17 + 5 + hash(i, 12) * 8, v: Math.floor(hash(i, 13) * 3) });
    }
    for (let i = Math.ceil(from / 52); i * 52 <= to; i++) if (hash(i, 14) < 0.7) out.push({ kind: 'planter-s', lane: 2.55, z: i * 52 + 20 });
    return out;
  }
  const nt = (cv) => sa.nightify(cv, 0.52);

  function drawables(s, t) {
    const c = cam(s), list = [];
    for (const L of lampsIn(s.dist - 14, s.dist + FAR + 20)) {
      const z = L.z - s.dist;
      list.push({ z, draw: (ctx) => {
        blit(ctx, sa.lamp(), L.side * LAMP_LANE, z, c, { dy: PIPE_H * HU });
        const p = proj.project(L.side * LAMP_LANE, z, c), a = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) : 1;
        const gy0 = p.y - (56 + PIPE_H * HU) * p.s * U;                                                       // the lantern's height
        for (const [r, al] of [[16, 0.08], [11, 0.11], [7, 0.16]]) { ctx.fillStyle = `rgba(255,214,130,${al * a})`; ctx.beginPath(); ctx.arc(p.x, gy0, r * p.s * U, 0, Math.PI * 2); ctx.fill(); }
      } });
    }
    for (const o of side(s.dist - 14, s.dist + FAR + 20)) {
      const z = o.z - s.dist;
      if (z < -14 || z > FAR) continue;
      list.push({ z, draw: (ctx) => {
        switch (o.kind) {
          case 'tree': blit(ctx, nt(art.tree(String(o.v))), o.lane, z, c); break;
          case 'pine': blit(ctx, nt(art.pine()), o.lane, z, c); break;
          case 'bush': blit(ctx, nt(art.bush()), o.lane, z, c); break;
          case 'blossom': blit(ctx, art.blossom(), o.lane, z, c, { alpha: 1 }); break;
          case 'planter-s': blit(ctx, sa.planter('64'), o.lane, z, c); break;
          case 'rail': {
            blit(ctx, nt(art.post()), RAIL_LANE, z, c);
            const a = proj.project(RAIL_LANE, z, c), b = proj.project(RAIL_LANE, z + 12, c), fade = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) : 1;
            ctx.globalAlpha = fade;
            for (const [hh, col] of [[14, '#5f5a86'], [8, '#46426c']]) line(ctx, a.x, a.y - hh * a.s * U, b.x, b.y - hh * b.s * U, col, a.s > 0.7 ? 2 : 1);
            ctx.globalAlpha = 1;
            break;
          }
          default:
        }
      } });
    }
    const zh = s.goal - s.dist + HOUSE_AHEAD;
    if (zh < FAR && zh > -20) list.push({ z: zh, draw: (ctx) => house(ctx, zh, c, t) });
    for (const o of s.objs) {
      if (o.z > FAR || o.z < -14) continue;
      if (o.kind === 'coin') list.push({ z: o.z, draw: (ctx) => blit(ctx, art.coin(String(Math.floor(t / 110 + o.id) % 4)), latOf(o.slot), o.z, c, { dy: 7 + o.h * HU + raiseOf(o.slot) }) });
      else list.push({ z: o.z, draw: (ctx) => thing(ctx, o, c) });
    }
    return list.sort((a, b) => b.z - a.z);
  }
  /** The house at the end of the route: the lit brick house, a warm pool of light at its door and in its windows. */
  function house(ctx, z, c, t) {
    const p = proj.project(0, z, c), sc = p.s * U * 1.7, a = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) : 1;
    const flick = 0.85 + 0.15 * Math.sin(t / 380);
    ctx.globalAlpha = a;
    for (const [r, al] of [[70, 0.07], [50, 0.1], [32, 0.14]]) { ctx.fillStyle = `rgba(255,200,110,${al * flick * a})`; ctx.beginPath(); ctx.ellipse(p.x, p.y - 8 * sc, r * sc * 1.25, r * sc * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    blit(ctx, sa.home(), 0, z, c, { dy: -4, mul: 1.7 });
  }
  const SPRITE = { rock: () => sa.nightify(sa.rock(), 0.3), bench: () => sa.nightify(sa.bench('44'), 0.45), crack: () => sa.crack(), plank: () => sa.nightify(sa.plank(), 0.3), cone: () => sa.nightify(sa.cone(), 0.2), pipe: () => sa.pipe(), ramp: () => sa.nightify(sa.ramp('46'), 0.25), gate: () => sa.nightify(sa.barrier(String(Math.round(2 * (RIDE_A + 0.25) * 50))), 0.35) };
  function thing(ctx, o, c) {
    const z = Math.max(o.z, -3), al = o.hit ? 0.35 : 1, cv = SPRITE[o.kind] && SPRITE[o.kind]();
    if (!cv) return;
    if (o.all) { blit(ctx, cv, 0, z, c, { alpha: al }); return; }
    const wall = Math.abs(o.slot) === 1;
    blitTilt(ctx, cv, latOf(o.slot), z, c, wall ? -o.slot * surfaceTilt(SLOT) * 0.85 : 0, raiseOf(o.slot), al);
  }

  // ---- the board and the pet ------------------------------------------------------------------------------------------------------------------------
  function player(ctx, s, t, look) {
    if (s.invuln > 0 && Math.floor(s.invuln / 90) % 2 === 1 && !s.over) return;
    const c = cam(s), px = Math.round(proj.x(latOf(s.p), 0, c)), seq = RUN_SEQ[Math.floor(t / 130) % RUN_SEQ.length];
    const rumble = s.grounded ? Math.round(Math.sin((t / 1000) * 42) * 0.5 + 0.5) : 0;
    const lift = Math.round(s.h * HU), base = gy + 1 - Math.round(raiseOf(s.p));
    const ang = -Math.sign(s.p) * surfaceTilt(Math.abs(s.p) * SLOT) * 0.85;      // the board tips to the wall's local angle; the pet leans into it
    const sh = Math.max(0.35, 1 - s.h * 0.16);                                // the shadow stays on the surface and shrinks with the height
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.34 * sh;
    const sw = Math.round(30 * sh); ctx.fillRect(px - Math.round(sw / 2), base - 2, sw, 2); ctx.fillRect(px - Math.round(sw / 2) + 3, base, sw - 6, 2); ctx.globalAlpha = 1;
    const sq = s.squash > 0 ? 1 - 0.2 * (s.squash / SKATE.SQUASH_MS) : !s.grounded && s.vy > 4 ? 1.1 : 1, ph = Math.round(32 * sq);
    const lean = Math.abs(s.p) > 0.35 ? -Math.sign(s.p) : 0;
    ctx.save();
    ctx.translate(px, base - lift - rumble); ctx.rotate(ang);
    ctx.drawImage(backCanvas(look.species, look.stage, s.grounded ? seq : 0, lean), 0, 0, 32, 32, -16, -14 + 2 - ph + 1, 32, ph);
    ctx.drawImage(sa.board(String(Math.floor(t / 70) % 2)), -17, -14);
    ctx.restore();
  }

  // ---- the whole picture ---------------------------------------------------------------------------------------------------------------------------------
  function draw(ctx, s, t, look, { hints = 0 } = {}) {
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (s.flash > SKATE.FLASH_MS * 0.4) ctx.translate(Math.round((hash(Math.floor(t / 30), 1) - 0.5) * 5), Math.round((hash(Math.floor(t / 30), 2) - 0.5) * 5));
    const c = cam(s);
    ctx.drawImage(backdrop, -PAD - Math.round(c * 5), 0);
    ground(ctx, s, t);
    pipeLayer(ctx, s);
    for (const d of drawables(s, t)) d.draw(ctx);
    ctx.globalAlpha = 1;
    player(ctx, s, t, look);
    ctx.restore();
    if (s.flash > 0) {
      const f = s.flash / SKATE.FLASH_MS;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, f - 0.35) * 0.9})`; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(224,72,90,${f * 0.35})`; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6); ctx.fillRect(0, 0, 5, h); ctx.fillRect(w - 5, 0, 5, h);
    }
  }
  return { w, h, proj, draw, KINDS };
}
