// Draws the train game: sky, mountains, trees, then the ground one screen row at a time (grass, ballast, sleepers and rails in perspective, see lanes.js),
// then everything that stands on it, far to near (roadside objects, trains, coins), and the cart with the pet. No rules in here: it reads the game state
// and a clock. Work happens on the logical canvas (src/arcade/lanes.js logicalSize), one logical pixel is a whole number of screen pixels.
import { createProjection } from './lanes.js';
import { roadside, hash, POLE_GAP, POST_GAP } from './scenery.js';
import { TRAIN, nodeLat, sectionAt, upcomingFork } from './train.js';
import { backCanvas, RUN_SEQ } from './back-sprites.js';
import * as art from './art.js';

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`; };
const HAZE = '#cfe7e4';
export const FAR = 270;                                    // nothing is drawn beyond this distance
const FADE_FROM = 200;                                     // objects fade in between here and FAR
const SLEEPER_GAP = 7, STRIPE = 26;

const SKY = ['#4e9be0', '#5fa9e6', '#74b9ee', '#8ac8f3', '#a2d6f6', '#bde4f8', '#d6eff9'];

// ---- scaled copies: a sprite shrunk in one go from 40 px to 6 px turns to noise, so each size is made by halving (cached) --------------------------------
const scaledCache = new Map();
let artIds = 0;
const ids = new WeakMap();
const idOf = (cv) => { if (!ids.has(cv)) ids.set(cv, ++artIds); return ids.get(cv); };
export function scaled(cv, dw, dh) {
  const key = `${idOf(cv)}|${dw}|${dh}`;
  let c = scaledCache.get(key);
  if (c) return c;
  if (scaledCache.size > 900) scaledCache.clear();
  let src = cv;
  while (src.width / 2 > dw && src.height / 2 > dh) {
    const half = document.createElement('canvas');
    half.width = Math.max(1, Math.ceil(src.width / 2)); half.height = Math.max(1, Math.ceil(src.height / 2));
    const g = half.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, half.width, half.height);
    src = half;
  }
  c = document.createElement('canvas'); c.width = dw; c.height = dh;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = dw < src.width; g.drawImage(src, 0, 0, dw, dh);
  scaledCache.set(key, c);
  return c;
}

export function createTrainView({ w, h }) {
  const hy = Math.round(h * 0.36), gy = Math.round(h * 0.82);
  const proj = createProjection({ w, h, horizon: hy, ground: gy, laneW: Math.round(w * 0.27) });
  const U = proj.laneW / 50;                               // sprites are drawn for a 50 px lane
  const span = gy - hy;
  const FOCAL = proj.focal;

  // ---- per-row colours (they only depend on the row: haze towards the horizon) -------------------------------------------------------------------------
  const rows = [];
  for (let y = hy + 1; y < h; y++) {
    const k = (y - hy) / span, f = Math.max(0, Math.min(0.78, 1 - k * 3.2));
    const m = (c) => (f > 0.01 ? mix(c, HAZE, f) : c);
    rows[y] = {
      gA: m('#6bbe6b'), gB: m('#62b563'), gD: m('#3f8548'), gL: m('#8bd97f'), gAvg: m('#67b968'),
      dirt: m('#c09a62'), dirtD: m('#a8804c'),
      bal: m('#9c9284'), balD: m('#8f8576'), balL: m('#bdb4a2'), balK: m('#6f6558'),
      wood: m('#8f4a28'), woodHi: m('#c57a45'), woodLo: m('#5a2a1c'), woodAvg: m('#7a4a34'), woodSpeck: m('#6b3421'),
      rA: m('#59617f'), rB: m('#d0d7ea'), rC: m('#8a93ad'), shadow: m('#3a3550'),
    };
  }

  // ---- the backdrop: sky, mountain, hills and tree line, painted once --------------------------------------------------------------------------------
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
    // far mountains with snow caps: two ridges of different height, lit from the left
    const mountain = (px, ph, slope, seed) => {
      for (let x = 0; x < bw; x++) {
        const d = Math.abs(x - px), ridge = (hash(Math.floor(x / 3), seed) - 0.5) * 5 + Math.sin(x * 0.21 + seed) * 2.2;
        const mh = Math.round(ph - d * slope + ridge);
        if (mh <= 0) continue;
        const top = hy - 8 - mh, lit = x < px - Math.sin(x * 0.3) * 2;
        g.fillStyle = lit ? '#a7b7d9' : '#8697c0'; g.fillRect(x, top, 1, mh + 8);
        if (hash(Math.floor(x / 2), seed + 5) < 0.18) { g.fillStyle = lit ? '#93a5cf' : '#7384af'; g.fillRect(x, top + 6 + Math.floor(hash(x, seed) * mh * 0.6), 1, 3); }
        const snow = Math.round(ph * 0.34 - d * slope * 0.55 + ridge * 0.5);
        if (snow > 0) { g.fillStyle = lit ? '#f4f8ff' : '#cdd9ef'; g.fillRect(x, top, 1, snow); g.fillStyle = lit ? '#dbe6f8' : '#b3c3e3'; g.fillRect(x, top + snow, 1, 1 + (x & 1)); }
      }
    };
    mountain(Math.round(bw * 0.2), Math.round(hy * 0.3), 0.42, 3);
    mountain(Math.round(bw * 0.7), Math.round(hy * 0.4), 0.5, 9);
    // two ranks of hills
    const rank = (base, amp, c1, c2, seed, freq) => {
      for (let x = 0; x < bw; x++) {
        const y = hy - base - Math.round((Math.sin(x * freq + seed) + Math.sin(x * freq * 2.3 + seed * 2) * 0.5 + 1.5) * amp);
        g.fillStyle = c1; g.fillRect(x, y, 1, hy - y); g.fillStyle = c2; g.fillRect(x, y, 1, 1);
      }
    };
    rank(3, hy * 0.05, '#86b9a2', '#a6d0b4', 1.3, 0.035);
    rank(2, hy * 0.035, '#5aa070', '#78bd84', 4.1, 0.05);
    // the tree line along the horizon
    for (let x = -4; x < bw + 8; x += 5 + Math.floor(hash(x, 2) * 4)) {
      const r = 6 + Math.floor(hash(x, 3) * 5), cy = hy - 3 - Math.floor(hash(x, 5) * 3);
      const t = document.createElement('canvas'); t.width = 2 * r + 2; t.height = 2 * r + 2;
      art.blob(t.getContext('2d'), [[r + 1, r + 1, r]], { o: '#1d4030', d: '#295d39', m: '#3f8548', l: '#52a553', h: '#74c870' }, x);
      g.drawImage(t, x - r - 1, cy - r - 1);
    }
    g.fillStyle = '#2f6b3f'; g.fillRect(0, hy - 3, bw, 5);
  }

  const cam = (s) => s.x;                                   // the camera rides the cart's track: it is always in the middle
  /** The lateral extent of all tracks at distance z: { min, max } (absolute lanes). */
  function extAt(s, z) {
    const sec = s.sections[sectionAt(s, z)];
    let min = 1e9, max = -1e9;
    for (const n of sec.nodes) { const l = nodeLat(sec, n, z); if (l < min) min = l; if (l > max) max = l; }
    return { min, max };
  }

  function blit(ctx, cv, lane, z, c, { dy = 0, alpha = 1 } = {}) {
    const p = proj.project(lane, z, c), sc = p.s * U;
    const dw = Math.round(cv.width * sc), dh = Math.round(cv.height * sc);
    if (dw < 1 || dh < 1 || p.x + dw < 0 || p.x - dw > w) return;
    const a = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) * alpha : alpha;
    if (a <= 0.02) return;
    ctx.globalAlpha = a;
    ctx.drawImage(sc >= 0.999 && sc <= 1.001 ? cv : scaled(cv, dw, dh), Math.round(p.x - dw / 2), Math.round(p.y - dh - dy * sc));
    ctx.globalAlpha = 1;
  }

  // 1px lines (Bresenham) so wires and rails stay crisp
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
  const sagLine = (ctx, a, b, color, sag) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag; line(ctx, a.x, a.y, mx, my, color); line(ctx, mx, my, b.x, b.y, color); };

  // ---- the ground, a row at a time -------------------------------------------------------------------------------------------------------------------
  function ground(ctx, s) {
    const c = cam(s), dist = s.dist, secs = s.sections;
    let si = secs.length - 1;
    for (let y = hy + 1; y < h; y++) {
      const r = rows[y], k = (y - hy) / span;
      const z = FOCAL * (span / (y - hy) - 1), dz = (FOCAL * span) / ((y - hy) * (y - hy));
      const wz = z + dist;
      while (si > 0 && secs[si].z0 > wz) si--;
      const sec = secs[si];
      const stripe = dz > STRIPE * 0.7 ? 0.5 : Math.floor(wz / STRIPE) & 1;
      ctx.fillStyle = stripe === 0.5 ? r.gAvg : stripe ? r.gB : r.gA;
      ctx.fillRect(0, y, w, 1);
      const u = proj.laneW * k, mid = w / 2;
      if (dz < 6) {                                         // grass tufts
        const b = Math.floor(wz / 5);
        for (let i = 0; i < 5; i++) { const hx = Math.floor(hash(b, i + 3) * w); ctx.fillStyle = hash(b, i + 40) < 0.7 ? r.gD : r.gL; ctx.fillRect(hx, y, k > 0.6 ? 2 : 1, 1); }
      }
      const lcs = sec.nodes.map((n) => mid + (nodeLat(sec, n, wz) - c) * u);
      const bedHalf = 0.66 * u, sw = Math.max(1, Math.round(0.24 * u)), ew = Math.max(1, Math.round(0.07 * u));
      for (const lc of lcs) {                               // the dirt shoulder, then the ballast bed, under each track
        ctx.fillStyle = r.dirt; ctx.fillRect(Math.round(lc - bedHalf - sw), y, Math.round(2 * (bedHalf + sw)), 1);
      }
      for (const lc of lcs) { ctx.fillStyle = r.dirtD; ctx.fillRect(Math.round(lc - bedHalf - sw), y, ew, 1); ctx.fillRect(Math.round(lc + bedHalf + sw) - ew, y, ew, 1); }
      for (const lc of lcs) { ctx.fillStyle = Math.floor(wz / 5) & 1 ? r.bal : r.balD; ctx.fillRect(Math.round(lc - bedHalf), y, Math.round(2 * bedHalf), 1); }
      if (dz < 5) {
        const b = Math.floor(wz / 2.5);
        for (const lc of lcs) for (let i = 0; i < 2 + Math.round(k * 3); i++) { const hx = Math.round(lc - bedHalf + hash(b + Math.round(lc), i + 70) * 2 * bedHalf); ctx.fillStyle = hash(b, i + 90) < 0.5 ? r.balK : r.balL; ctx.fillRect(hx, y, 1, 1); }
      }
      // sleepers and rails of each track
      const ph = (((wz % SLEEPER_GAP) + SLEEPER_GAP) % SLEEPER_GAP) / SLEEPER_GAP, onSleeper = ph < 0.44;
      const sl = dz < SLEEPER_GAP * 0.6;
      const topEdge = onSleeper && ph + dz / SLEEPER_GAP >= 0.44, botEdge = onSleeper && ph < dz / SLEEPER_GAP;
      const rw = Math.max(1, Math.min(4, Math.round(u * 0.058)));
      let ni = 0;
      for (const lc of lcs) {
        const sh = 0.46 * u, L = ni++;
        if (sl) {
          if (onSleeper) {
            ctx.fillStyle = topEdge ? r.woodHi : botEdge ? r.woodLo : r.wood;
            ctx.fillRect(Math.round(lc - sh), y, Math.round(2 * sh), 1);
            if (!topEdge && !botEdge && hash(Math.floor(wz / SLEEPER_GAP) * 3 + L, 7) < 0.6) { ctx.fillStyle = r.woodSpeck; ctx.fillRect(Math.round(lc - sh + hash(Math.floor(wz / SLEEPER_GAP), L + 9) * sh * 1.8), y, 2, 1); }
            if (k > 0.5 && !topEdge) { ctx.fillStyle = r.woodLo; ctx.fillRect(Math.round(lc - sh), y, 1, 1); ctx.fillRect(Math.round(lc + sh) - 1, y, 1, 1); }
          }
        } else { ctx.fillStyle = r.woodAvg; ctx.fillRect(Math.round(lc - sh), y, Math.round(2 * sh), 1); }
        for (const side of [-1, 1]) {                       // the two rails
          const rx = Math.round(lc + side * 0.3 * u - rw / 2);
          if (rw >= 3) { ctx.fillStyle = r.rA; ctx.fillRect(rx, y, rw, 1); ctx.fillStyle = r.rB; ctx.fillRect(rx + 1, y, rw - 2, 1); ctx.fillStyle = r.rC; ctx.fillRect(rx + rw - 1, y, 1, 1); }
          else { ctx.fillStyle = rw === 2 ? r.rC : r.rB; ctx.fillRect(rx, y, rw, 1); }
        }
      }
    }
  }

  // ---- roadside and train drawables -------------------------------------------------------------------------------------------------------------------
  function drawables(s, t) {
    const c = cam(s), list = [];
    const items = roadside(s.dist - 40, s.dist + FAR + 20);
    for (const o of items) {
      const z = o.z - s.dist;
      if (z < -14 || z > FAR) continue;
      const ext = extAt(s, o.z), off = o.lane - 1.0, lane = o.side > 0 ? ext.max + off : ext.min - off;      // roadside things hug the outermost track
      list.push({ z, draw: (ctx) => {
        switch (o.kind) {
          case 'tree': blit(ctx, art.tree(String(o.variant)), lane, z, c); break;
          case 'pine': blit(ctx, art.pine(), lane, z, c); break;
          case 'bush': blit(ctx, art.bush(), lane, z, c); break;
          case 'blossom': blit(ctx, art.blossom(), lane, z, c); break;
          case 'flowers': blit(ctx, art.flowers(), lane, z, c); break;
          case 'rock': blit(ctx, art.rock(), lane, z, c); break;
          case 'post': blit(ctx, art.post(), lane, z, c); break;
          case 'pole': blit(ctx, art.pole(), lane, z, c); break;
          case 'signal': blit(ctx, art.signal(o.red ? 'red' : 'green'), lane, z, c); break;
          case 'station': blit(ctx, art.station(), lane, z, c); break;
          default:
        }
      } });
      if (o.kind === 'pole' || o.kind === 'post') {
        const far = o.kind === 'pole' ? POLE_GAP : POST_GAP, z2 = z + far;
        if (z2 > FAR) continue;
        list.push({ z: z - 0.01, draw: (ctx) => {
          const a = proj.project(lane, z, c), b = proj.project(lane, z2, c), fade = z > FADE_FROM ? Math.max(0, 1 - (z - FADE_FROM) / (FAR - FADE_FROM)) : 1;
          ctx.globalAlpha = fade;
          if (o.kind === 'pole') {
            for (const [dx, dy] of art.POLE_WIRES) sagLine(ctx, { x: a.x + dx * a.s * U, y: a.y + dy * a.s * U }, { x: b.x + dx * b.s * U, y: b.y + dy * b.s * U }, '#2b3350', Math.round(3 * a.s));
          } else {
            for (const [hh, col] of [[14, '#8f4a28'], [8, '#6b3421']]) line(ctx, a.x, a.y - hh * a.s * U, b.x, b.y - hh * b.s * U, col, a.s > 0.7 ? 2 : 1);
          }
          ctx.globalAlpha = 1;
        } });
      }
    }
    const latAt = (node, zAbs) => { const sec = s.sections[sectionAt(s, zAbs)], n = sec.nodes.find((q) => q.id === node); return n ? nodeLat(sec, n, zAbs) : null; };
    for (const o of s.coinList) {
      const z = o.z - s.dist, lat = latAt(o.node, o.z);
      if (z > FAR || z < -14 || lat === null) continue;
      list.push({ z, draw: (ctx) => blit(ctx, art.coin(String(Math.floor(t / 110 + o.id) % 4)), lat, z, c, { dy: 7 }) });
    }
    for (const o of s.trains) {
      const z = o.z - s.dist, lat = latAt(o.node, o.z + o.len * 0.5);
      if (z > FAR || z + o.len < -14 || lat === null) continue;
      list.push({ z, draw: (ctx) => train(ctx, { ...o, lane: lat, z }, c) });
    }
    // the switch ahead: a stand beside the rails and a plain arrow board over each branch (the one the cart will take is lit and bobs)
    const f = upcomingFork(s);
    for (const sec of s.sections) {
      if (sec.kind !== 'fork') continue;
      const z = sec.z0 - s.dist;
      if (z < 0 || z > FAR) continue;
      const isNext = f && f.sec === sec, ch = sec.nodes.length === 2 ? sec.nodes : sec.nodes.filter((n) => n.parents.length && sec.nodes.filter((q) => q.parents[0] === n.parents[0]).length === 2);
      const base = nodeLat(sec, ch[0], sec.z0), side = s.intent || s.lastSide;
      list.push({ z: z - 6, draw: (ctx) => {
        blit(ctx, art.switchStand(), base + 0.78, z, c);
        for (const dir of [-1, 1]) {
          const lit = isNext && dir === side, bob = lit ? Math.round(Math.sin(t / 120) * 1.5) : 0;
          blit(ctx, art.arrowSign(dir < 0 ? 'left' : 'right'), base + dir * 1.15, z - 3, c, { dy: 16 + bob, alpha: isNext ? (lit ? 1 : 0.5) : 0.85 });
        }
      } });
    }
    return list.sort((a, b) => b.z - a.z);
  }

  const TBODY = { red: ['#8a3042', '#6a2236', '#d96a62'], blue: ['#34457a', '#252f55', '#6a84c0'], teal: ['#2a6a62', '#1d4a4a', '#62b09a'] };
  function train(ctx, o, c) {
    const color = art.TRAIN_COLORS[o.look % 3], zf = Math.max(o.z, -3), zr = o.z + o.len;
    if (zr < -3) return;
    const pf = proj.project(o.lane, zf, c), pr = proj.project(o.lane, Math.min(zr, FAR + 60), c);
    const kf = pf.s * U, kr = pr.s * U, tw = art.TRAIN_W / 2, th = art.TRAIN_H;
    const xlF = pf.x - tw * kf, xrF = pf.x + tw * kf, xlR = pr.x - tw * kr, xrR = pr.x + tw * kr;
    const yFt = pf.y - th * kf, yRt = pr.y - th * kr;
    const fade = o.z > FADE_FROM ? Math.max(0, 1 - (o.z - FADE_FROM) / (FAR - FADE_FROM)) : 1;
    if (fade <= 0.02) return;
    ctx.globalAlpha = fade * (o.hit ? 0.35 : 1);
    const [sideC, sideD, sideL] = TBODY[color];
    // roof
    const y0 = Math.round(yRt), y1 = Math.round(yFt);
    for (let y = y0; y < y1; y++) {
      const t = (y - yRt) / ((yFt - yRt) || 1), xl = Math.round(lerp(xlR, xlF, t)), xr = Math.round(lerp(xrR, xrF, t)), z = lerp(zr, zf, t);
      const rib = ((z % 6) + 6) % 6 < 0.9;
      ctx.fillStyle = rib ? '#7b8499' : '#aab3c8'; ctx.fillRect(xl, y, xr - xl, 1);
      ctx.fillStyle = '#d6dcec'; ctx.fillRect(xl, y, Math.max(1, Math.round(kf * 2)), 1);
      ctx.fillStyle = '#7b8499'; ctx.fillRect(xr - 1, y, 1, 1);
    }
    // the side that faces the middle of the track (a: rear edge, b: front edge)
    const sideFace = (xa, xb, ya1, yb1) => {
      const lo = Math.round(Math.min(xa, xb)), hi = Math.round(Math.max(xa, xb));
      for (let X = lo; X < hi; X++) {
        const tt = Math.max(0, Math.min(1, (X + 0.5 - xa) / ((xb - xa) || 1)));
        const top = lerp(yRt, ya1, tt), bot = lerp(pr.y, yb1, tt), hgt = bot - top, z = lerp(zr, zf, tt);
        ctx.fillStyle = sideC; ctx.fillRect(X, Math.round(top), 1, Math.round(hgt));
        ctx.fillStyle = sideL; ctx.fillRect(X, Math.round(top), 1, Math.max(1, Math.round(hgt * 0.08)));
        if (((z % 9) + 9) % 9 < 5.2) {
          ctx.fillStyle = '#1d2c50'; ctx.fillRect(X, Math.round(top + hgt * 0.2), 1, Math.round(hgt * 0.32));
          ctx.fillStyle = '#3f63a0'; ctx.fillRect(X, Math.round(top + hgt * 0.42), 1, Math.max(1, Math.round(hgt * 0.1)));
        }
        ctx.fillStyle = '#ffcb6b'; ctx.fillRect(X, Math.round(top + hgt * 0.62), 1, Math.max(1, Math.round(hgt * 0.06)));
        ctx.fillStyle = sideD; ctx.fillRect(X, Math.round(top + hgt * 0.78), 1, Math.max(1, Math.round(hgt * 0.22)));
      }
    };
    if (xlF > xlR + 0.5) sideFace(xlR, xlF, yFt, pf.y);
    if (xrF < xrR - 0.5) sideFace(xrR, xrF, yFt, pf.y);
    // the front
    const dw = Math.round(art.TRAIN_W * kf), dh = Math.round(art.TRAIN_H * kf);
    if (dw >= 1 && dh >= 1 && o.z > -2.5) ctx.drawImage(kf >= 0.999 && kf <= 1.001 ? art.trainFront(color) : scaled(art.trainFront(color), dw, dh), Math.round(pf.x - dw / 2), Math.round(pf.y - dh));
    ctx.globalAlpha = 1;
  }

  // ---- the cart and the pet --------------------------------------------------------------------------------------------------------------------------
  function player(ctx, s, t, look) {
    if (s.invuln > 0 && Math.floor(s.invuln / 90) % 2 === 1 && !s.over) return;
    const c = cam(s), px = Math.round(w / 2), seq = RUN_SEQ[Math.floor(t / 120) % RUN_SEQ.length];
    const rumble = Math.round(Math.sin((t / 1000) * 38) * 0.5 + 0.5), lean = (() => { const sec = s.sections[sectionAt(s, s.dist + 3)], n = sec.nodes.find((q) => q.id === s.node) || sec.nodes[0], d = nodeLat(sec, n, s.dist + 3) - s.x; return Math.abs(d) > 0.01 ? Math.sign(d) : 0; })();
    const base = gy + 1;
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.26;
    ctx.fillRect(px - 17, base - 2, 34, 2); ctx.fillRect(px - 13, base, 26, 2); ctx.globalAlpha = 1;
    const cartTop = base - 22 - rumble;
    ctx.drawImage(backCanvas(look.species, look.stage, seq, lean), px - 16, cartTop - 21);
    ctx.drawImage(art.cart(String(Math.floor(t / 80) % 2)), px - 20, cartTop);
  }

  // ---- the whole picture --------------------------------------------------------------------------------------------------------------------------------
  function draw(ctx, s, t, look) {
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (s.flash > TRAIN.FLASH_MS * 0.4) ctx.translate(Math.round((hash(Math.floor(t / 30), 1) - 0.5) * 5), Math.round((hash(Math.floor(t / 30), 2) - 0.5) * 5));
    const c = cam(s);
    ctx.drawImage(backdrop, -PAD - Math.round(c * 6), 0);
    [[0, 18, 0.1, 0], [1, 96, 0.04, 1], [2, 150, 0.17, 0], [3, 54, 0.22, 0]].forEach(([i, x, y, v]) => {      // drifting clouds
      const cv = art.cloud(String(v)), span2 = w + cv.width;
      const px = ((x + t * (0.004 + i * 0.0015) + s.dist * 0.01) % span2) - cv.width;
      ctx.globalAlpha = 0.95; ctx.drawImage(cv, Math.round(px - c * 3), Math.round(hy * y)); ctx.globalAlpha = 1;
    });
    ground(ctx, s);
    for (const d of drawables(s, t)) d.draw(ctx);
    ctx.globalAlpha = 1;
    player(ctx, s, t, look);
    ctx.restore();
    if (s.flash > 0) {                                        // the crash: a white flash that settles into a red edge
      const f = s.flash / TRAIN.FLASH_MS;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, f - 0.35) * 0.9})`; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(224,72,90,${f * 0.35})`; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6); ctx.fillRect(0, 0, 5, h); ctx.fillRect(w - 5, 0, 5, h);
    }
  }
  return { w, h, proj, draw };
}
