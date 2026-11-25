// A stoked bonfire (src/bonfire.js): extra tongues of flame over the baked one, more sparks rising and, at night, a stronger warm glow. Drawn in code over the ring, in game px with the
// origin at the middle of the fire's base; `k` (0..1) is how high the fire burns. A bounded handful of rects and dots, nothing allocated, so it costs next to nothing.
const SPARKS = 10;
const rect = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

export function drawFlare(ctx, k, now, night = 0) {
  if (!(k > 0)) return;
  ctx.save();
  if (night > 0.05) {                                                                           // the glow: additive, wider and warmer the higher the fire
    ctx.globalCompositeOperation = 'lighter';
    const r = 30 + 34 * k, g = ctx.createRadialGradient(0, -8, 2, 0, -8, r);
    g.addColorStop(0, `rgba(255,170,70,${0.34 * k * night})`); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.fillRect(-r, -8 - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
  }
  for (let i = 0; i < 5; i++) {                                                                 // tongues of flame, each flickering at its own rate
    const h = (7 + 15 * k) * (0.65 + 0.35 * Math.sin(now / (70 + i * 13) + i * 1.9)) * (1 - Math.abs(i - 2) * 0.18), x = (i - 2) * 3.4;
    rect(ctx, '#e8531c', x - 1.5, -4 - h, 4, h); rect(ctx, '#ff9a2e', x - 0.5, -4 - h * 0.8, 2, h * 0.8); if (i === 2) rect(ctx, '#ffd24a', x - 0.5, -4 - h * 0.55, 2, h * 0.5);
  }
  for (let j = 0; j < SPARKS; j++) {                                                            // sparks rise, drift and fade out
    const f = ((now / 1300 + j * 0.173) % 1), a = f < 0.8 ? 1 : (1 - f) / 0.2;
    if (a > 0.4) rect(ctx, j % 3 ? '#ffb347' : '#fff2a0', Math.sin(j * 7.3 + f * 6) * (5 + 9 * f), -12 - f * (16 + 30 * k), 1, 1);
  }
  ctx.restore();
}
