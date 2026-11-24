// The reflection of the sky in the water (the sea, the ponds): at night the stars, and during a sky show whatever the show draws (bursts, rockets, meteors, drones, the
// Halloween and Christmas skies). It reuses the show's own drawing routines (src/show/draw*.js) rather than copying their logic: they are called onto a small offscreen canvas
// through a transform that flips the sky vertically about the horizon (a flat mirror reflects a distant sky mirrored about the horizon line), tinted blue and dimmer. That picture
// is cut to the water with a mask (the water tiles drawn by the same row-by-row ground pass at half size), then blitted into the view in thin horizontal strips that wobble
// with the clock, additively. Cheap on purpose: half resolution, the stars redrawn only a few times a second, the show layer every other frame, nothing at all by day or
// when no water is in view.
import { TILE } from '../map.js';
import { makeStars, twinkle } from '../show/sky.js';
import { drawBursts, drawRockets, drawMeteors, drawDrones, drawHalloween } from '../show/draw.js';
import { drawChristmas } from '../show/draw-christmas.js';
import { drawGround } from './scene.js';
import { groundRow, project } from './camera.js';

export const SCALE = 0.5;                          // the offscreen pictures are this fraction of the view
export const STRIP = 3;                            // strip height, in offscreen px (6 screen px at half size)
export const STAR_EVERY_MS = 220;                  // how often the stars are redrawn (they only twinkle)
export const SQUASH = 0.5;                         // the mirrored sky is this much shorter than the sky
export const SHOW_EVERY_MS = 33;                   // and the show's layer
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** How strongly the stars show for a night amount `n` (0 by day, from dusk on, full when it is dark). */
export const starLevel = (n) => clamp01((n - 0.3) / 0.45);

/** The strip offsets (offscreen px) and alpha factor of strip row `sy` at time `now` (ms): a gentle wobble, never more than 3 px, never above 1. Pure. */
export function shimmer(sy, now) {
  return { dx: Math.round(Math.sin(sy * 0.8 + now / 650) * 1.6 + Math.sin(sy * 0.31 - now / 1000) * 1.2), a: 0.7 + 0.3 * Math.sin(sy * 1.9 + now / 380) };
}

/** The box of the water of a world in world px: { x0, y0, x1, y1 } or null. */
export function waterBox(water) {
  if (!water.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of water) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + TILE); y1 = Math.max(y1, q.y + TILE); }
  return { x0, y0, x1, y1 };
}

export function createReflector() {
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const stars = makeStars(4242, 560), masks = new WeakMap(), boxes = new WeakMap();
  let refl = null, out = null, size = '', lastStars = -1e9, lastShow = -1e9, built = false;
  const stat = { ms: 0, draws: 0 };

  const maskOf = (world) => {
    let m = masks.get(world);
    if (!m) {
      m = mk(world.tex.width, world.tex.height);
      const c = m.getContext('2d');
      c.fillStyle = '#fff';
      for (const q of world.water) c.fillRect(q.x, q.y, TILE, TILE);
      masks.set(world, m);
    }
    return m;
  };

  /**
   * Draws the reflection into `ctx` (the view). o: { world, cam, view, now (ms), n (night 0..1, the show's tilt counts), sh (the show or null), sky (skyAt of it), scam, u, hy, k (the show's tilt 0..1), alpha }.
   * Returns true when something was drawn.
   */
  function draw(ctx, o) {
    const { world, cam, view, now, n, sh, sky, scam, u, hy, k, alpha } = o;
    const showOn = !!sh && k > 0.3 && hy > 0, sk = starLevel(n);
    if ((sk < 0.02 && !showOn) || !world.water.length) return false;
    let box = boxes.get(world);
    if (box === undefined) boxes.set(world, box = waterBox(world.water));
    const rt = groundRow(cam, 0), rb = groundRow(cam, view.h - 1);
    if (box.y1 < (rt ? rt.y : cam.focusY - 700) - TILE || box.y0 > (rb ? rb.y : cam.focusY + 400) + TILE) return false;      // no water in view
    const t0 = performance.now();
    let y0 = Infinity, y1 = -Infinity;                                        // the screen rows the water covers
    for (const [wx, wy] of [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]]) { const p = project(cam, wx, wy); if (p) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } else y0 = 0; }
    const waterTop = Math.max(0, y0);
    const rw = Math.ceil(view.w * SCALE), rh = Math.ceil(view.h * SCALE), key = `${rw}x${rh}`;
    if (key !== size) { refl = mk(rw, rh); out = mk(rw, rh); size = key; built = false; }
    if (!built || now - lastStars > STAR_EVERY_MS || (showOn && now - lastShow > SHOW_EVERY_MS)) {
      const r = refl.getContext('2d');
      r.setTransform(1, 0, 0, 1, 0, 0); r.globalCompositeOperation = 'source-over'; r.clearRect(0, 0, rw, rh);
      const t = now / 1000;
      for (const s of stars) {                                                // the stars: in the view's own coordinates (a distant sky does not move with the camera)
        const x = Math.floor(s.u * rw), y = Math.floor(s.v * rh), a = twinkle(s, t) * 0.9;
        r.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a})`;
        r.fillRect(x, y, 1, 1);
        if (s.big) { r.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a * 0.5})`; r.fillRect(x - 1, y, 3, 1); r.fillRect(x, y - 1, 1, 3); }
      }
      if (showOn) {                                                           // the show: the same routines as the sky, flipped about the horizon
        r.save();
        const axis = Math.max(hy, Math.min(view.h, waterTop));                  // the sky is mirrored about the top edge of the water in view (about the horizon when the sea reaches it), and squashed, so the lights fall inside the water
        r.setTransform(SCALE, 0, 0, -SCALE * SQUASH, 0, SCALE * (axis + axis * SQUASH));
        drawMeteors(r, sky.meteors, view, hy, u, alpha);
        if (sky.hw) drawHalloween(r, sky.hw, view, hy, u, alpha);
        if (sky.xm) drawChristmas(r, sky.xm, view, hy, u, alpha);
        drawBursts(r, scam, sky.fw, u, alpha);
        drawRockets(r, scam, sky.fw, u, alpha);
        drawDrones(r, scam, sky.drones, u, alpha);
        r.restore();
      }
      r.setTransform(1, 0, 0, 1, 0, 0);
      r.globalCompositeOperation = 'source-atop'; r.fillStyle = 'rgba(95,140,245,0.4)'; r.fillRect(0, 0, rw, rh);      // cooler and dimmer than the sky
      r.globalCompositeOperation = 'source-over';
      lastStars = now; if (showOn) lastShow = now;
      built = true;
    }
    const m = out.getContext('2d');                                           // cut to the water: the water tiles through the ground's own row pass, at half size
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, rw, rh);
    m.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    drawGround(m, maskOf(world), cam, view.w, view.h, 4);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-in'; m.drawImage(refl, 0, 0); m.globalCompositeOperation = 'source-over';
    y0 = Math.max(0, Math.floor(y0 * SCALE / STRIP) * STRIP); y1 = Math.min(rh, Math.ceil(y1 * SCALE));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = false;
    const level = Math.max(sk, showOn ? 1 : 0) * 0.95;
    for (let sy = y0; sy < y1; sy += STRIP) {
      const s = shimmer(sy, now);
      ctx.globalAlpha = level * s.a;
      ctx.drawImage(out, 0, sy, rw, STRIP, (s.dx) / SCALE, sy / SCALE, rw / SCALE, STRIP / SCALE);
    }
    ctx.restore();
    stat.ms += (performance.now() - t0 - stat.ms) * 0.05; stat.draws++;
    return true;
  }
  return { draw, stats: () => ({ ms: +stat.ms.toFixed(2), draws: stat.draws }) };
}
