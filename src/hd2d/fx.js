// The HD-2D lite post effects, all plain Canvas 2D (no ctx.filter, which Safari lacks): a bloom from a raised to the fourth power (bright-only) low-res copy
// blurred by scaling down and up with smoothing, a tilt-shift (a blurred copy shown only at the top and bottom bands) and a vignette.
const make = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, w | 0), height: Math.max(1, h | 0) });

/** Blurs `src` into `dst` (any sizes) by drawing it through the smaller canvases `mids` in turn and then up to `dst`, all smoothed. */
function blur(dst, src, mids) {
  let from = src;
  for (const m of mids) { const c = m.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'medium'; c.drawImage(from, 0, 0, m.width, m.height); from = m; }
  const d = dst.getContext('2d');
  d.imageSmoothingEnabled = true; d.imageSmoothingQuality = 'medium';
  d.globalCompositeOperation = 'copy'; d.drawImage(from, 0, 0, dst.width, dst.height); d.globalCompositeOperation = 'source-over';
}

export function createFx(w, h) {
  const q = make(w / 4, h / 4), q2 = make(w / 4, h / 4), q3 = make(w / 4, h / 4), e = make(w / 8, h / 8), e2 = make(w / 16, h / 16), bloomBuf = make(w / 4, h / 4);
  const half = make(w / 2, h / 2), quarter = make(w / 4, h / 4), soft = make(w, h);
  const mask = make(w, h), vig = make(w, h), haze = [make(1, h), make(1, h)];     // haze[0] day, haze[1] night: a vertical gradient (the distance fog)
  haze.forEach((hz, i) => {
    const c = hz.getContext('2d'), g = c.createLinearGradient(0, 0, 0, h), rgb = i ? '12,18,48' : '190,220,255';
    for (const [t, a] of [[0, i ? 0.55 : 0.4], [0.18, i ? 0.32 : 0.2], [0.4, 0]]) g.addColorStop(t, `rgba(${rgb},${a})`);
    c.fillStyle = g; c.fillRect(0, 0, 1, h);
  });
  {                                                                     // the tilt-shift mask: opaque at the top and bottom, clear in the middle band
    const c = mask.getContext('2d'), g = c.createLinearGradient(0, 0, 0, h);
    for (const [t, a] of [[0, 1], [0.16, 0.85], [0.34, 0.12], [0.44, 0], [0.62, 0], [0.74, 0.18], [0.88, 0.85], [1, 1]]) g.addColorStop(t, `rgba(0,0,0,${a})`);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  {                                                                     // the vignette: an ellipse, dark blue edges
    const c = vig.getContext('2d');
    c.save(); c.translate(w / 2, h * 0.52); c.scale(1, (h / w) * 1.25);
    const r = w * 0.62, g = c.createRadialGradient(0, 0, r * 0.38, 0, 0, r);
    for (const [t, a] of [[0, 0], [0.45, 0.1], [0.75, 0.55], [1, 0.95]]) g.addColorStop(t, `rgba(4,6,18,${a})`);
    c.fillStyle = g; c.fillRect(-w, -w, w * 2, w * 2); c.restore();
  }
  return {
    /** Paints the effects over `ctx` (which already holds the scene). amount 0..1 fades them; night 0..1 sets the bloom and vignette. */
    apply(ctx, amount, night) {
      if (amount <= 0) return;
      const src = ctx.canvas;
      blur(soft, src, [half, quarter]);                                  // tilt-shift: the blurred copy, masked to the bands
      const sc = soft.getContext('2d');
      sc.globalCompositeOperation = 'destination-in'; sc.drawImage(mask, 0, 0); sc.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = amount; ctx.drawImage(soft, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = amount * (1 - night); ctx.drawImage(haze[0], 0, 0, ctx.canvas.width, ctx.canvas.height);       // distance fog toward the top
      ctx.globalAlpha = amount * night; ctx.drawImage(haze[1], 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalAlpha = 1;
      const a = q.getContext('2d'), b = q2.getContext('2d'), c = q3.getContext('2d');             // bloom: bright pass = the low-res copy to the fourth power
      a.imageSmoothingEnabled = true; a.drawImage(src, 0, 0, q.width, q.height);
      b.globalCompositeOperation = 'copy'; b.drawImage(q, 0, 0); b.globalCompositeOperation = 'multiply'; b.drawImage(q, 0, 0);
      c.globalCompositeOperation = 'copy'; c.drawImage(q2, 0, 0); c.globalCompositeOperation = 'multiply'; c.drawImage(q2, 0, 0);
      blur(bloomBuf, q3, [e, e2]);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = amount * (0.2 + 0.4 * night); ctx.drawImage(bloomBuf, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = amount * (0.55 + 0.4 * night); ctx.drawImage(vig, 0, 0); ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
    },
  };
}
