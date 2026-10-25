// The night sky above the horizon band: a gradient, twinkling pixel stars, a moon, and the distant dark land with a treeline along the
// horizon. Everything hangs from the horizon row `hy` (the camera's own horizon), so it slides down the screen as the camera tilts up.
import { hash, clamp01 } from './rand.js';

export const LAND = [10, 14, 26];
const STAR_TINTS = [[255, 255, 255], [200, 225, 255], [255, 236, 190], [255, 205, 225]];

/** The stars of a seed, as screen fractions: u across, v from the top of the sky to the horizon. Deterministic. */
export function makeStars(seed, n = 190) {
  return Array.from({ length: n }, (_, i) => ({
    u: hash(seed, i, 1), v: Math.pow(hash(seed, i, 2), 0.85), ph: hash(seed, i, 3) * 6.2832, sp: 1 + hash(seed, i, 4) * 3.2,
    big: hash(seed, i, 5) > 0.88 ? 1 : 0, c: STAR_TINTS[Math.floor(hash(seed, i, 6) * STAR_TINTS.length)],
  }));
}

/** A star's brightness 0..1 at time t (seconds): slow twinkle between dim and bright. Pure. */
export const twinkle = (s, t) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));

/** Pixel unit of the show (screen px per art pixel): scales with the view so a phone and a monitor read alike. */
export const pixelUnit = (viewH) => Math.max(2, Math.round(viewH / 190));

function moon(ctx, x, y, u, a) {
  const R = 7;
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, R * u * 5);
  g.addColorStop(0, 'rgba(210,225,255,0.34)'); g.addColorStop(0.35, 'rgba(150,175,255,0.12)'); g.addColorStop(1, 'rgba(120,150,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x - R * u * 5, y - R * u * 5, R * u * 10, R * u * 10);
  ctx.globalCompositeOperation = 'source-over';
  for (let j = -R; j <= R; j++) {                                  // a pixel disc: lit cream, a cooler shaded limb on the lower right, a few craters
    const half = Math.floor(Math.sqrt(R * R + 0.5 - j * j));
    for (let i = -half; i <= half; i++) {
      const d = (i + j * 0.6) / R, shade = d > 0.45 ? 2 : d > 0.15 ? 1 : 0;
      ctx.fillStyle = ['#f6f1d8', '#e2dcc0', '#bdb9a6'][shade];
      ctx.fillRect(x + i * u, y + j * u, u, u);
    }
  }
  ctx.fillStyle = '#c9c4ac';
  for (const [i, j, w] of [[-3, -2, 2], [1, -4, 1], [2, 2, 2], [-2, 3, 1], [-4, 1, 1]]) ctx.fillRect(x + i * u, y + j * u, w * u, w * u);
  ctx.globalAlpha = 1;
}

/** Draws the sky from the top of the view down to row `hy`, the land below it, and the treeline on the horizon. `t` is seconds. */
export function drawSky(ctx, view, hy, t, stars, u, edgeY = 0) {
  if (hy <= 0) return;
  const W = view.w, H = view.h, h = Math.min(hy, H);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [s, c] of [[0, '#03051a'], [0.5, '#0c1442'], [0.82, '#232068'], [0.95, '#4a3a86'], [1, '#7a5a9c']]) g.addColorStop(s, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, h); ctx.clip();
  for (const s of stars) {                                          // stars: one pixel, the bright ones a little cross
    const x = Math.round((s.u * W) / u) * u, y = Math.round((s.v * h * 0.97) / u) * u, a = twinkle(s, t) * (1 - s.v * 0.55);
    ctx.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a})`;
    ctx.fillRect(x, y, u, u);
    if (s.big) { ctx.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a * 0.55})`; ctx.fillRect(x - u, y, u, u); ctx.fillRect(x + u, y, u, u); ctx.fillRect(x, y - u, u, u); ctx.fillRect(x, y + u, u, u); }
  }
  moon(ctx, Math.round((W * 0.8) / u) * u, Math.round((h * 0.38) / u) * u, u, clamp01(h / (H * 0.2)));
  ctx.restore();
  ctx.fillStyle = `rgb(${LAND})`; ctx.fillRect(0, h, W, H - h);     // the land beyond the town
  const fog = ctx.createLinearGradient(0, h - 6 * u, 0, h + 26 * u);
  fog.addColorStop(0, 'rgba(122,90,156,0.0)'); fog.addColorStop(0.25, 'rgba(70,56,120,0.55)'); fog.addColorStop(1, 'rgba(10,14,26,0)');
  ctx.fillStyle = fog; ctx.fillRect(0, h - 6 * u, W, 32 * u);
  ctx.fillStyle = '#1a1c52';                                        // far hills, lit by the sky glow, behind the trees
  for (let x = 0; x < W; x += u) {
    const i = Math.floor(x / u), top = Math.round(9 + 3.4 * Math.sin(i * 0.021 + 0.4) + 2.2 * Math.sin(i * 0.063 + 2));
    ctx.fillRect(x, h - top * u, u, top * u);
  }
  ctx.fillStyle = '#070a1a';                                        // the treeline: rolling hills with a pine every few pixels
  for (let x = 0; x < W; x += u) {
    const i = Math.floor(x / u), hill = 3.2 + 2.4 * Math.sin(i * 0.045 + 1.3) + 1.6 * Math.sin(i * 0.11), p = i % 9;
    const pine = hash(7, Math.floor(i / 9)) > 0.45 ? Math.max(0, 5 - Math.abs(p - 4) * 1.4) * (0.6 + hash(8, Math.floor(i / 9)) * 0.8) : 0;
    const top = Math.round(hill + pine);
    ctx.fillRect(x, h - top * u, u, top * u + 3 * u);
  }
  const far = Math.max(h + 10 * u, edgeY) - 3 * u;                // distant farms on the dark land: a few warm lights, twinkling
  for (let i = 0; i < 90; i++) {
    const k = Math.pow(hash(5, i, 1), 1.6), x = Math.round((hash(5, i, 2) * W) / u) * u, y = Math.round((h + 3 * u + k * (far - h - 3 * u)) / u) * u;
    const a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.8 + hash(5, i, 3) * 2) + i))) * (1 - k * 0.5);
    ctx.fillStyle = `rgba(255,${190 + (i % 3) * 20},120,${a})`; ctx.fillRect(x, y, u, u);
    if (i % 7 === 0) { ctx.fillStyle = `rgba(255,210,140,${a * 0.5})`; ctx.fillRect(x + u, y, u, u); }
  }
}
