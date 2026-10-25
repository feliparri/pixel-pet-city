// The HD-2D post effects for the show page. A copy of src/hd2d/fx.js with three changes so the sky stays crisp: the tilt-shift blurs the
// top band far less (stars and sparks live there), there is no top haze (the sky paints its own), and `boost` 0..1 pushes the bloom up
// while something bright (a burst) is on screen.
const make = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, w | 0), height: Math.max(1, h | 0) });

/** Blurs `src` into `dst` (any sizes) by drawing it through the smaller canvases `mids` in turn and then up to `dst`, all smoothed. */
function blur(dst, src, mids) {
  let from = src;
  for (const m of mids) { const c = m.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'medium'; c.drawImage(from, 0, 0, m.width, m.height); from = m; }
  const d = dst.getContext('2d');
  d.imageSmoothingEnabled = true; d.imageSmoothingQuality = 'medium';
  d.globalCompositeOperation = 'copy'; d.drawImage(from, 0, 0, dst.width, dst.height); d.globalCompositeOperation = 'source-over';
}

export function createShowFx(w, h) {
  const q = make(w / 4, h / 4), q2 = make(w / 4, h / 4), q3 = make(w / 4, h / 4), e = make(w / 8, h / 8), e2 = make(w / 16, h / 16), bloomBuf = make(w / 4, h / 4);
  const half = make(w / 2, h / 2), quarter = make(w / 4, h / 4), soft = make(w, h), mask = make(w, h), vig = make(w, h);
  {                                                                     // tilt-shift: opaque only at the very bottom (and a touch at the top), clear across the sky and the plaza
    const c = mask.getContext('2d'), g = c.createLinearGradient(0, 0, 0, h);
    for (const [t, a] of [[0, 0.35], [0.1, 0.12], [0.2, 0], [0.64, 0], [0.76, 0.2], [0.9, 0.85], [1, 1]]) g.addColorStop(t, `rgba(0,0,0,${a})`);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  {                                                                     // vignette: an ellipse, dark blue edges (lighter at the top so the sky is not dimmed)
    const c = vig.getContext('2d');
    c.save(); c.translate(w / 2, h * 0.55); c.scale(1, (h / w) * 1.25);
    const r = w * 0.62, g = c.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
    for (const [t, a] of [[0, 0], [0.5, 0.08], [0.8, 0.45], [1, 0.85]]) g.addColorStop(t, `rgba(4,6,18,${a})`);
    c.fillStyle = g; c.fillRect(-w, -w, w * 2, w * 2); c.restore();
  }
  return {
    /** Paints the effects over `ctx` (which already holds the scene). amount 0..1 fades them; night 0..1 sets the bloom and vignette. */
    apply(ctx, amount, night, boost = 0) {
      if (amount <= 0) return;
      const src = ctx.canvas;
      blur(soft, src, [half, quarter]);
      const sc = soft.getContext('2d');
      sc.globalCompositeOperation = 'destination-in'; sc.drawImage(mask, 0, 0); sc.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = amount; ctx.drawImage(soft, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1;
      const a = q.getContext('2d'), b = q2.getContext('2d'), c = q3.getContext('2d');             // bloom: bright pass = the low-res copy to the fourth power
      a.imageSmoothingEnabled = true; a.drawImage(src, 0, 0, q.width, q.height);
      b.globalCompositeOperation = 'copy'; b.drawImage(q, 0, 0); b.globalCompositeOperation = 'multiply'; b.drawImage(q, 0, 0);
      c.globalCompositeOperation = 'copy'; c.drawImage(q2, 0, 0); c.globalCompositeOperation = 'multiply'; c.drawImage(q2, 0, 0);
      blur(bloomBuf, q3, [e, e2]);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, amount * (0.2 + 0.4 * night) * (1 + boost * 1.1)); ctx.drawImage(bloomBuf, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = amount * (0.55 + 0.4 * night); ctx.drawImage(vig, 0, 0); ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
    },
  };
}
