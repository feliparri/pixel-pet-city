// Draws the skate game: a night promenade seen from behind the board. A starry sky with a moon over a lit skyline, then the ground a screen row at a time
// (river with a railing on the left, the paved path with warm pools of lamplight, grass on the right), then the lamps, trees, planters and the things on the
// path far to near, and the board with the pet. The board's shadow stays on the ground while the pet arcs. No rules here: it reads the game state and a clock.
import { createProjection } from './lanes.js';
import { hash } from './scenery.js';
import { SKATE, KINDS } from './skate.js';
import { backCanvas, RUN_SEQ } from './back-sprites.js';
import { scaled } from './train-view.js';
import * as art from './art.js';
import * as sa from './skate-art.js';

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`; };
const HAZE = '#5a4f98';
export const FAR = 270, FADE_FROM = 200;
const HU = 13;                                   // pixels per height unit at the board's depth
const PAVER = 9;                                 // paving stones are this long
const LAMP_GAP = 40, LAMP_LANE = 2.05, POOL_Z = 15, POOL_X = 1.9;
const RAIL_LANE = -2.55, WATER_EDGE = -2.7, CURB = 1.78;
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
      pA: m('#6f74aa'), pB: m('#646a9f'), pJ: m('#474c7e'), pAvg: m('#6a6fa4'),
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

  const cam = (s) => s.x * 0.35;

  function blit(ctx, cv, lane, z, c, { dy = 0, alpha = 1, stretch = 1 } = {}) {
    const p = proj.project(lane, z, c), sc = p.s * U;
    const dw = Math.round(cv.width * sc * stretch), dh = Math.round(cv.height * sc);
    if (dw < 1 || dh < 1 || p.x + dw / 2 < 0 || p.x - dw / 2 > w) return;
    const a = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) * alpha : alpha;
    if (a <= 0.02) return;
    ctx.globalAlpha = a;
    ctx.drawImage(sc >= 0.999 && sc <= 1.001 && stretch === 1 ? cv : scaled(cv, dw, dh), Math.round(p.x - dw / 2), Math.round(p.y - dh - dy * sc));
    ctx.globalAlpha = 1;
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
      // the promenade strips beside the path and the path itself
      ctx.fillStyle = r.pr; ctx.fillRect(Math.max(0, wr), y, Math.max(0, X(2.45) - Math.max(0, wr)), 1);
      ctx.fillRect(X(CURB), y, Math.max(0, X(2.45) - X(CURB)), 1);
      const px0 = X(-CURB), px1 = X(CURB);
      ctx.fillStyle = stripe === 0.5 ? r.pAvg : r.pA; ctx.fillRect(px0, y, px1 - px0, 1);
      if (stripe !== 0.5) {
        const row = Math.floor(wz / PAVER), onJoint = ((wz % PAVER) + PAVER) % PAVER < dz + 0.3;
        for (let j = 0; j < 7; j++) if ((row + j) & 1) { ctx.fillStyle = r.pB; ctx.fillRect(X(-1.5 + j * 0.5 - 0.25), y, Math.max(1, X(-1.5 + j * 0.5 + 0.25) - X(-1.5 + j * 0.5 - 0.25)), 1); }
        ctx.fillStyle = r.pJ;
        if (onJoint) ctx.fillRect(px0, y, px1 - px0, 1);
        else for (let j = -3; j <= 3; j++) ctx.fillRect(X(j * 0.5 + 0.25 * ((row & 1) ? 1 : -1) + (j === 3 ? 0 : 0)) - 0, y, 1, 1);
      }
      ctx.fillStyle = r.cu; ctx.fillRect(px0 - Math.max(1, Math.round(0.14 * u)), y, Math.max(1, Math.round(0.14 * u)), 1); ctx.fillRect(px1, y, Math.max(1, Math.round(0.14 * u)), 1);
      ctx.fillStyle = r.cuD; ctx.fillRect(px0 - Math.max(1, Math.round(0.14 * u)), y, 1, 1);
      // the pools of lamplight: three nested ellipses of warm light
      for (const L of lamps) {
        const dzr = Math.abs(wz - L.z);
        if (dzr > POOL_Z) continue;
        for (const [sc, a] of [[1, 0.1], [0.72, 0.1], [0.42, 0.13]]) {
          if (dzr >= POOL_Z * sc) continue;
          const hx = POOL_X * sc * Math.sqrt(1 - (dzr / (POOL_Z * sc)) ** 2), cxl = L.side * 0.95;
          const x0 = Math.max(px0, X(cxl - hx)), x1 = Math.min(px1, X(cxl + hx));
          if (x1 > x0) { ctx.fillStyle = `rgba(255,190,90,${a})`; ctx.fillRect(x0, y, x1 - x0, 1); }
        }
      }
    }
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
        blit(ctx, sa.lamp(), L.side * LAMP_LANE, z, c);
        const p = proj.project(L.side * LAMP_LANE, z, c), a = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) : 1;
        const gy0 = p.y - 56 * p.s * U;                                                       // the lantern's height
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
    for (const o of s.objs) {
      if (o.z > FAR || o.z < -14) continue;
      if (o.kind === 'coin') list.push({ z: o.z, draw: (ctx) => blit(ctx, art.coin(String(Math.floor(t / 110 + o.id) % 4)), o.x, o.z, c, { dy: 7 + o.h * HU }) });
      else list.push({ z: o.z, draw: (ctx) => thing(ctx, o, c) });
    }
    return list.sort((a, b) => b.z - a.z);
  }
  function thing(ctx, o, c) {
    const z = Math.max(o.z, -3), width = wpx(o.hw * 2), al = o.hit ? 0.35 : 1;
    switch (o.kind) {
      case 'cone': blit(ctx, sa.nightify(sa.cone(), 0.2), o.x, z, c, { alpha: al }); break;
      case 'puddle': blit(ctx, sa.puddle(width), o.x, z, c, { alpha: al }); break;
      case 'barrier': blit(ctx, nt(sa.barrier(width)), o.x, z, c, { alpha: al }); break;
      case 'bench': blit(ctx, nt(sa.bench(width)), o.x, z, c, { alpha: al }); break;
      case 'planter': blit(ctx, nt(sa.planter(width)), o.x, z, c, { alpha: al }); break;
      case 'ramp': blit(ctx, sa.nightify(sa.ramp(width), 0.25), o.x, z, c, { alpha: al }); break;
      default:
    }
  }

  // ---- the board and the pet ------------------------------------------------------------------------------------------------------------------------
  function player(ctx, s, t, look) {
    if (s.invuln > 0 && Math.floor(s.invuln / 90) % 2 === 1 && !s.over) return;
    const c = cam(s), px = Math.round(proj.x(s.x, 0, c)), seq = RUN_SEQ[Math.floor(t / 130) % RUN_SEQ.length];
    const lean = Math.abs(s.vx) > 0.7 ? Math.sign(s.vx) : 0, rumble = s.grounded ? Math.round(Math.sin((t / 1000) * 42) * 0.5 + 0.5) : 0;
    const lift = Math.round(s.h * HU), base = gy + 1;
    const sh = Math.max(0.35, 1 - s.h * 0.16);                                // the shadow stays on the ground and shrinks with the height
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.34 * sh;
    const sw = Math.round(30 * sh); ctx.fillRect(px - Math.round(sw / 2), base - 2, sw, 2); ctx.fillRect(px - Math.round(sw / 2) + 3, base, sw - 6, 2); ctx.globalAlpha = 1;
    const boardTop = base - 14 - lift - rumble;
    // squash on landing, stretch on the way up
    const sq = s.squash > 0 ? 1 - 0.2 * (s.squash / SKATE.SQUASH_MS) : !s.grounded && s.vy > 4 ? 1.1 : 1;
    const ph = Math.round(32 * sq);
    ctx.drawImage(backCanvas(look.species, look.stage, s.grounded ? seq : 0, lean), 0, 0, 32, 32, px - 16 + (sq < 1 ? 0 : 0), boardTop + 2 - ph + 1, 32, ph);
    ctx.drawImage(sa.board(String(Math.floor(t / 70) % 2)), px - 17 + lean, boardTop);
  }

  // ---- the whole picture ---------------------------------------------------------------------------------------------------------------------------------
  function draw(ctx, s, t, look, { hints = 0 } = {}) {
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (s.flash > SKATE.FLASH_MS * 0.4) ctx.translate(Math.round((hash(Math.floor(t / 30), 1) - 0.5) * 5), Math.round((hash(Math.floor(t / 30), 2) - 0.5) * 5));
    const c = cam(s);
    ctx.drawImage(backdrop, -PAD - Math.round(c * 5), 0);
    ground(ctx, s, t);
    for (const d of drawables(s, t)) d.draw(ctx);
    ctx.globalAlpha = 1;
    player(ctx, s, t, look);
    if (hints > 0.02) {
      ctx.globalAlpha = Math.min(1, hints);
      ctx.drawImage(art.arrowSign('left'), 8, Math.round(h * 0.4)); ctx.drawImage(art.arrowSign('right'), w - 48, Math.round(h * 0.4));
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (s.flash > 0) {
      const f = s.flash / SKATE.FLASH_MS;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, f - 0.35) * 0.9})`; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(224,72,90,${f * 0.35})`; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6); ctx.fillRect(0, 0, 5, h); ctx.fillRect(w - 5, 0, 5, h);
    }
  }
  return { w, h, proj, draw, KINDS };
}
