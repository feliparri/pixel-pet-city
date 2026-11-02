// Canvas drawing of the Christmas show (christmasAt in christmas.js): the star of Bethlehem, Santa's sleigh with its reindeer and the trail of light, sparkles and the
// lights of the finale's tree. Pixel sprites baked once at 1 px per art pixel, drawn scaled by the show's unit `u` and snapped to it like the other layers.
// The cost of a frame is a few dozen small rects and image blits (no gradients are built per frame), about the drones'.
const ART = new Map();
const snap = (v, u) => Math.round(v / u) * u;
const COLOR = ['#ffd45a', '#ff6f8a', '#7dffa0', '#8fd2ff', '#ffffff'], RGB = ['255,200,70', '255,90,120', '110,255,150', '120,190,255', '255,255,255'];
const baked = (id, w, h, paint) => {
  let c = ART.get(id);
  if (!c) { c = Object.assign(document.createElement('canvas'), { width: w, height: h }); paint(c.getContext('2d'), w, h); ART.set(id, c); }
  return c;
};
const halo = (rgb) => baked(`halo${rgb}`, 32, 32, (g) => {
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, `rgba(${rgb},0.9)`); r.addColorStop(0.3, `rgba(${rgb},0.35)`); r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
});

/** The star of Bethlehem, 41 x 41: a bright core, four long tapering rays and four short diagonal ones. */
const starSprite = () => baked('star', 41, 41, (g) => {
  const C = 20;
  for (let i = -20; i <= 20; i++) {
    const a = Math.max(0, 1 - Math.abs(i) / 20), th = Math.abs(i) < 4 ? 3 : Math.abs(i) < 11 ? 2 : 1;
    g.fillStyle = `rgba(255,${230 + Math.round(a * 25)},${170 + Math.round(a * 85)},${Math.min(1, 0.25 + a * 1.2)})`;
    g.fillRect(C - Math.floor(th / 2), C + i, th, 1); g.fillRect(C + i, C - Math.floor(th / 2), 1, th);
  }
  for (let i = -7; i <= 7; i++) { g.fillStyle = `rgba(255,236,190,${0.7 * (1 - Math.abs(i) / 8)})`; g.fillRect(C + i, C + i, 1, 1); g.fillRect(C + i, C - i, 1, 1); }
  g.fillStyle = '#fffbe0'; g.fillRect(C - 2, C - 2, 5, 5); g.fillStyle = '#ffffff'; g.fillRect(C - 1, C - 1, 3, 3);
});

/** Santa's sleigh and three reindeer flying right, 50 x 14 (`f` 0|1: the legs); `flip` mirrors it. */
function sleigh(f, flip) {
  return baked(`sleigh${f}${flip ? 'r' : ''}`, 50, 14, (g, w) => {
    if (flip) { g.translate(w, 0); g.scale(-1, 1); }
    const r = (c, x, y, ww, hh) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
    r('#7a1e2c', 1, 6, 15, 5); r('#e0334a', 1, 6, 15, 4); r('#ff6f7e', 2, 6, 13, 1); r('#e0334a', 14, 4, 2, 3);       // the sleigh
    r('#ffd45a', 0, 11, 17, 1); r('#ffd45a', 0, 9, 1, 3); r('#ffd45a', 16, 10, 1, 2);                                  // the runner and its curl
    r('#8a5a2c', 2, 3, 4, 3); r('#c8905a', 3, 3, 2, 1);                                                                 // the sack of gifts
    r('#e0334a', 7, 3, 4, 4); r('#ffe0c0', 9, 2, 3, 2); r('#ffffff', 9, 4, 3, 1); r('#e0334a', 8, 0, 3, 2); r('#ffffff', 7, 0, 1, 1); r('#ffffff', 8, 2, 4, 1);   // Santa: coat, face, beard, hat
    r('#ffd45a', 17, 7, 7, 1);                                                                                          // the reins
    for (let k = 0; k < 3; k++) {
      const x = 24 + k * 9, up = (f + k) % 2;
      r('#c8905a', x, 5, 6, 3); r('#e8b27a', x, 5, 6, 1); r('#c8905a', x + 5, 3, 3, 3);                                  // body, neck and head
      r('#f4e2b8', x + 5, 0, 1, 3); r('#f4e2b8', x + 7, 1, 1, 2); r('#f4e2b8', x + 4, 1, 1, 1); r('#f4e2b8', x + 8, 0, 1, 1);     // antlers
      r('#9a6a3c', x, 8, 1, 3 - up); r('#9a6a3c', x + 2, 8, 1, 2 + up); r('#9a6a3c', x + 4, 8, 1, 3 - up); r('#9a6a3c', x + 5, 8, 1, 2 + up);       // legs, two frames
      if (k === 2) { r('#ff3030', x + 8, 5, 2, 2); r('#ffffff', x + 8, 5, 1, 1); }                                        // the red nose of the lead reindeer
    }
  });
}

/** The Christmas sky (xm from christmasAt) above the horizon row `hy`. */
export function drawChristmas(ctx, xm, view, hy, u, alpha = 1) {
  if (hy <= 0 || (!xm.star && !xm.sleighs.length && !xm.baubles.length && !xm.sparkles.length)) return;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, view.w, hy); ctx.clip(); ctx.imageSmoothingEnabled = false;
  const X = (o) => snap(o.u * view.w + (o.ox || 0) * u, u), Y = (o) => snap(o.v * hy + (o.oy || 0) * u, u);
  ctx.globalCompositeOperation = 'lighter';
  const s = xm.star;
  if (s) {
    const x = X(s), y = Y(s), k = s.k * s.a * alpha;
    ctx.globalAlpha = 0.55 * k; ctx.drawImage(halo('255,210,110'), x - 40 * u, y - 40 * u, 80 * u, 80 * u);
    ctx.globalAlpha = k; const st = starSprite(); ctx.drawImage(st, x - 20 * u, y - 20 * u, st.width * u, st.height * u);
  }
  for (const p of xm.sparkles) {                                                         // twinkles: a coloured pixel, the bigger ones a little cross
    const a = p.a * alpha;
    if (a < 0.05) continue;
    const x = snap(p.u * view.w, u), y = snap(p.v * hy, u);
    ctx.fillStyle = COLOR[p.c]; ctx.globalAlpha = a; ctx.fillRect(x, y, u, u);
    if (p.big) { ctx.globalAlpha = a * 0.55; ctx.fillRect(x - u, y, 3 * u, u); ctx.fillRect(x, y - u, u, 3 * u); }
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const w of xm.sleighs) {
    ctx.globalCompositeOperation = 'lighter';
    for (const t of w.trail) {                                                           // the trail: gold lights that fade behind the sleigh, a little spread
      ctx.globalAlpha = 0.85 * t.a * alpha; ctx.fillStyle = t.a > 0.55 ? '#fff0b0' : '#ffc85a';
      const x = X(t), y = Y(t), n = t.a > 0.5 ? 2 : 1;
      ctx.fillRect(x - w.dir * 4 * u, y + 4 * u, n * u, n * u); ctx.fillRect(x - w.dir * 7 * u, y + 5 * u, u, u);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    const c = sleigh(Math.abs(Math.floor(w.u * 40)) % 2, w.dir < 0), x = X(w), y = Y(w);
    ctx.drawImage(c, x - Math.floor(c.width / 2) * u, y - Math.floor(c.height / 2) * u, c.width * u, c.height * u);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const b of xm.baubles) {                                                          // the finale's lights: small and pale on the way in, coloured and glowing in the tree
    const x = X(b), y = Y(b), a = b.a * alpha;
    ctx.globalAlpha = 0.6 * b.lit * a; ctx.drawImage(halo(RGB[b.c]), x - 5 * u, y - 5 * u, 10 * u, 10 * u);
    ctx.globalAlpha = a; ctx.fillStyle = b.lit > 0.5 ? COLOR[b.c] : '#dfe8ff'; ctx.fillRect(x, y, 2 * u, 2 * u);
    if (b.lit > 0.5) { ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, u, u); }
  }
  ctx.restore();
}
