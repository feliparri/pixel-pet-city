// The HD-2D lite post effects, all plain Canvas 2D (no ctx.filter, which Safari lacks): a bloom from a raised to the fourth power (bright-only) low-res copy
// blurred by scaling down and up with smoothing (only at night), a tilt-shift (a blurred half-size copy drawn only over the top and bottom bands)
// and one cached overlay with the haze and the vignette. Every full-screen pass costs real time on a phone, so there are as few as possible.
const make = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, w | 0), height: Math.max(1, h | 0) });

/** Blurs `src` into `dst` (any sizes) by drawing it through the smaller canvases `mids` in turn and then up to `dst`, all smoothed. */
function blur(dst, src, mids) {
  let from = src;
  for (const m of mids) { const c = m.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'medium'; c.drawImage(from, 0, 0, m.width, m.height); from = m; }
  const d = dst.getContext('2d');
  d.imageSmoothingEnabled = true; d.imageSmoothingQuality = 'medium';
  d.globalCompositeOperation = 'copy'; d.drawImage(from, 0, 0, dst.width, dst.height); d.globalCompositeOperation = 'source-over';
}

const BLOOM_FROM = 0.3, BLOOM_FULL = 0.45;                            // bloom is off in daylight, fades in over this night range and keeps its strength formula above it
const BAND_TOP = 0.44, BAND_BOTTOM = 0.62;                            // the tilt-shift is clear between these heights (fractions of the view): that middle is never drawn
const OVERLAY_STEPS = 16;                                             // the haze/vignette overlay is rebuilt only when the night amount moves one of these steps

/** Paints the vignette (an ellipse, dark blue edges) at full strength onto a canvas context of size w x h. */
function paintVignette(c, w, h) {
  c.save(); c.translate(w / 2, h * 0.52); c.scale(1, (h / w) * 1.25);
  const r = w * 0.62, g = c.createRadialGradient(0, 0, r * 0.38, 0, 0, r);
  for (const [t, a] of [[0, 0], [0.45, 0.1], [0.75, 0.55], [1, 0.95]]) g.addColorStop(t, `rgba(4,6,18,${a})`);
  c.fillStyle = g; c.fillRect(-w, -w, w * 2, w * 2); c.restore();
}

/**
 * The effects for a w x h view. apply(ctx, amount, night, { bloom, tiltshift }) paints them over a scene already in ctx. Each frame costs: the
 * tilt-shift (half-size work, two band draws), one overlay draw (haze and vignette together) and, at night only, the bloom.
 */
export function createFx(w, h) {
  const q = make(w / 4, h / 4), q2 = make(w / 4, h / 4), q3 = make(w / 4, h / 4), e = make(w / 8, h / 8), e2 = make(w / 16, h / 16), bloomBuf = make(w / 4, h / 4);
  const half = make(w / 2, h / 2), quarter = make(w / 4, h / 4);
  const mask = make(w / 2, h / 2), overlay = make(w, h), haze = [make(1, h), make(1, h)];     // haze[0] day, haze[1] night: a vertical gradient (the distance fog)
  let overlayStep = -1;
  haze.forEach((hz, i) => {
    const c = hz.getContext('2d'), g = c.createLinearGradient(0, 0, 0, h), rgb = i ? '12,18,48' : '190,220,255';
    for (const [t, a] of [[0, i ? 0.55 : 0.4], [0.18, i ? 0.32 : 0.2], [0.4, 0]]) g.addColorStop(t, `rgba(${rgb},${a})`);
    c.fillStyle = g; c.fillRect(0, 0, 1, h);
  });
  {                                                                     // the tilt-shift mask (half size): opaque at the top and bottom, clear in the middle band
    const c = mask.getContext('2d'), g = c.createLinearGradient(0, 0, 0, mask.height);
    for (const [t, a] of [[0, 1], [0.16, 0.85], [0.34, 0.12], [BAND_TOP, 0], [BAND_BOTTOM, 0], [0.74, 0.18], [0.88, 0.85], [1, 1]]) g.addColorStop(t, `rgba(0,0,0,${a})`);
    c.fillStyle = g; c.fillRect(0, 0, mask.width, mask.height);
  }
  /** The haze (day and night mixed by the night amount) and the vignette (its strength with the night) flattened into the one overlay canvas. */
  function paintOverlay(step) {
    const n = step / OVERLAY_STEPS, c = overlay.getContext('2d');
    c.clearRect(0, 0, w, h); c.imageSmoothingEnabled = true;
    c.globalAlpha = 1 - n; c.drawImage(haze[0], 0, 0, w, h);
    c.globalAlpha = n; c.drawImage(haze[1], 0, 0, w, h);
    c.globalAlpha = 0.55 + 0.4 * n; paintVignette(c, w, h);
    c.globalAlpha = 1; overlayStep = step;
  }
  return {
    /** Paints the effects over `ctx` (which already holds the scene). amount 0..1 fades them; night 0..1 sets the overlay and the bloom (bloom: only above night 0.3). */
    apply(ctx, amount, night, { bloom = true, tiltshift = true } = {}) {
      if (amount <= 0) return;
      const src = ctx.canvas, W = ctx.canvas.width, H = ctx.canvas.height;
      if (tiltshift) {                                                   // tilt-shift: blur at half size, mask it there, then draw only the two bands
        const hc = half.getContext('2d'), tb = Math.ceil(half.height * BAND_TOP) + 1, bt = Math.floor(half.height * BAND_BOTTOM) - 1;
        hc.imageSmoothingEnabled = true; hc.imageSmoothingQuality = 'medium';
        hc.drawImage(src, 0, 0, src.width, src.height * BAND_TOP, 0, 0, half.width, half.height * BAND_TOP);
        hc.drawImage(src, 0, src.height * BAND_BOTTOM, src.width, src.height * (1 - BAND_BOTTOM), 0, half.height * BAND_BOTTOM, half.width, half.height * (1 - BAND_BOTTOM));
        const qc = quarter.getContext('2d'); qc.imageSmoothingEnabled = true; qc.imageSmoothingQuality = 'medium';
        qc.drawImage(half, 0, 0, quarter.width, quarter.height);
        hc.globalCompositeOperation = 'copy'; hc.drawImage(quarter, 0, 0, half.width, half.height);
        hc.globalCompositeOperation = 'destination-in'; hc.drawImage(mask, 0, 0); hc.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = true; ctx.globalAlpha = amount;
        ctx.drawImage(half, 0, 0, half.width, tb, 0, 0, W, (tb / half.height) * H);
        ctx.drawImage(half, 0, bt, half.width, half.height - bt, 0, (bt / half.height) * H, W, H - (bt / half.height) * H);
      }
      ctx.imageSmoothingEnabled = true;
      const step = Math.round(night * OVERLAY_STEPS);
      if (step !== overlayStep) paintOverlay(step);
      ctx.globalAlpha = amount; ctx.drawImage(overlay, 0, 0, W, H);       // haze and vignette in one draw
      ctx.globalAlpha = 1;
      if (bloom && night > BLOOM_FROM) {                                 // bloom (night only): bright pass = the low-res copy to the fourth power, blurred, added
        const a = q.getContext('2d'), b = q2.getContext('2d'), c = q3.getContext('2d');
        a.imageSmoothingEnabled = true; a.drawImage(src, 0, 0, q.width, q.height);
        b.globalCompositeOperation = 'copy'; b.drawImage(q, 0, 0); b.globalCompositeOperation = 'multiply'; b.drawImage(q, 0, 0);
        c.globalCompositeOperation = 'copy'; c.drawImage(q2, 0, 0); c.globalCompositeOperation = 'multiply'; c.drawImage(q2, 0, 0);
        blur(bloomBuf, q3, [e, e2]);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = amount * (0.2 + 0.4 * night) * Math.min(1, (night - BLOOM_FROM) / (BLOOM_FULL - BLOOM_FROM)); ctx.drawImage(bloomBuf, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
    },
  };
}
