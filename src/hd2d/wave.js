// The surf wave with volume, in the HD-2D view. The wave lies on the tilted ground, so its height is faked with shading: a dark trough just ahead of the front, a body whose face is
// shaded from deep teal at the water to pale at the top and lifted on the screen by its height (a raised wall of water), a bright lit lip along the top, a darker underside where the lip
// is thrown at the peel point with spray flung up from it, and tumbling white water behind the broken part. The geometry and the timing are the wave of the clock (src/surf.js
// waveAt / waveBody): nothing here decides anything. Only the rows in view are drawn, and the whole thing is a few hundred small rectangles.
import { waveBody } from '../surf.js';
import { groundRow, project } from './camera.js';
import { TILE } from '../map.js';

const hash = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 0x45d9f3b); h ^= h >>> 15; return (h >>> 0) / 4294967295; };

/** Draws the wave into `ctx`. `n` is the night amount (it dims the water), `now` ms, `shore(y)` the first shallow column of a row, `rows` the map's row count. */
export function drawWave(ctx, cam, view, wave, n, now, shore, rows) {
  const rt = groundRow(cam, 0), rb = groundRow(cam, view.h - 1);
  const r0 = Math.max(1, Math.floor((rt ? rt.y : cam.focusY - 700) / TILE) - 1), r1 = Math.min(rows - 2, Math.ceil((rb ? rb.y : cam.focusY + 400) / TILE) + 1);
  const body = waveBody(wave, r0, r1, TILE, shore);
  if (!body.length) return 0;
  const dim = 1 - 0.5 * n, rect = (x, y, w, h) => ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ps = body.map((s) => project(cam, s.x, s.y));
  const on = (p, m = 40) => p && p.x > -m && p.x < view.w + m && p.y > -m && p.y < view.h + m * 2;
  ctx.save();
  const links = [];                                                                        // consecutive samples: the wall is drawn as strips between them, so it is one continuous diagonal body
  for (let i = 0; i + 1 < body.length; i++) if (Math.abs(body[i + 1].y - body[i].y - 8) < 0.01 && (on(ps[i]) || on(ps[i + 1]))) links.push(i);
  const quad = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); ctx.fill(); };
  const H = 2.5, lifts = body.map((s, i) => (ps[i] ? s.h * H * ps[i].scale : 0));
  ctx.fillStyle = '#17407f';                                                              // 1. the trough: dark water just ahead of the front (north-east of it)
  for (const i of links) {
    const s = body[i], t = body[i + 1], a0 = project(cam, s.x + 3, s.y - 3), a1 = project(cam, t.x + 3, t.y - 3), b0 = project(cam, s.x + 17, s.y - 17), b1 = project(cam, t.x + 17, t.y - 17);
    if (!a0 || !a1 || !b0 || !b1) continue;
    ctx.globalAlpha = 0.42 * Math.min(s.a, t.a) * dim;
    quad([[a0.x, a0.y], [a1.x, a1.y], [b1.x, b1.y], [b0.x, b0.y]]);
  }
  const bands = [[0, 0.42, '#2a7fb0', 0.78], [0.42, 0.8, '#55b5d2', 0.82], [0.8, 1, '#a6e8f0', 0.92]];   // 2. the body: deep face, lighter teal, pale near the top, each lifted by the height
  for (const [f0, f1, col, al] of bands) {
    for (const i of links) {
      const s = body[i], t = body[i + 1], pa = ps[i], pb = ps[i + 1];
      if (!pa || !pb) continue;
      ctx.fillStyle = s.broken && f0 > 0.7 ? '#d0f3f8' : col;
      ctx.globalAlpha = al * Math.min(s.a, t.a) * dim;
      quad([[pa.x, pa.y - lifts[i] * f0], [pb.x, pb.y - lifts[i + 1] * f0], [pb.x, pb.y - lifts[i + 1] * f1 - 0.5], [pa.x, pa.y - lifts[i] * f1 - 0.5]]);
    }
  }
  body.forEach((s, i) => {                                                                // the lip thrown over at the peel: its dark underside, a wedge under the top
    const p = ps[i];
    if (!on(p) || s.curl < 0.12) return;
    ctx.globalAlpha = 0.85 * s.curl * s.a * dim; ctx.fillStyle = '#165f8f';
    rect(p.x - 1, p.y - lifts[i] * 0.66, 7 * p.scale, lifts[i] * 0.26);
  });
  ctx.lineCap = 'butt';
  for (const i of links) {                                                                // the bright lit lip along the top (thicker where it curls)
    const s = body[i], t = body[i + 1], pa = ps[i], pb = ps[i + 1];
    if (!pa || !pb) continue;
    const c = Math.max(s.curl, t.curl);
    ctx.globalAlpha = Math.min(s.a, t.a);
    ctx.strokeStyle = s.broken ? '#ffffff' : '#e6f9fd';
    ctx.lineWidth = Math.max(1, pa.scale * (c > 0.3 ? 2.4 : 1.4));
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y - lifts[i]); ctx.lineTo(pb.x, pb.y - lifts[i + 1]); ctx.stroke();
  }
  ctx.fillStyle = '#eaf9fd';                                                              // the foam sheet lying behind the broken part (south-west of the crest)
  for (const i of links) {
    const s = body[i], t = body[i + 1];
    if (!s.broken || !t.broken) continue;
    const a0 = project(cam, s.x - 2, s.y + 2), a1 = project(cam, t.x - 2, t.y + 2), b0 = project(cam, s.x - 15, s.y + 15), b1 = project(cam, t.x - 15, t.y + 15);
    if (!a0 || !a1 || !b0 || !b1) continue;
    ctx.globalAlpha = 0.5 * Math.min(s.a, t.a) * dim;
    quad([[a0.x, a0.y - 2], [a1.x, a1.y - 2], [b1.x, b1.y], [b0.x, b0.y]]);
  }
  ctx.fillStyle = '#ffffff';
  body.forEach((s, i) => {                                                                // 3. white water tumbling behind the broken part, and spray off the lip
    if (!s.broken) return;
    for (let q = 0; q < 4; q++) {
      const ph = (now / 760 + hash(Math.round(s.y * 2), q)) % 1, off = 6 + ph * 24, p = project(cam, s.x - off, s.y + off);
      if (!on(p)) continue;
      ctx.globalAlpha = Math.max(0, (1 - ph) * 0.75 * s.a * dim);
      const sz = (3.4 + 1.8 * hash(Math.round(s.y * 2), q + 7)) * p.scale;
      rect(p.x - sz / 2, p.y - Math.sin(ph * Math.PI) * 3 * p.scale - sz * 0.3, sz, sz * 0.7);
    }
    if (s.curl > 0.25) for (let q = 0; q < 2; q++) {
      const ph = (now / 520 + hash(Math.round(s.y * 2), q + 3)) % 1, p = ps[i];
      if (!on(p)) continue;
      ctx.globalAlpha = Math.max(0, (1 - ph) * 0.9 * s.curl * s.a * dim);
      rect(p.x + (hash(Math.round(s.y * 2), q + 11) - 0.3) * 7 * p.scale, p.y - lifts[i] - ph * 11 * p.scale, Math.max(1, p.scale * 0.9), Math.max(1, p.scale * 0.9));
    }
  });
  ctx.restore();
  return body.length;
}
