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
