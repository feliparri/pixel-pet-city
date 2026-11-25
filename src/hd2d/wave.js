// The surf wave as a wall of water, in the HD-2D view. The wave lies on the tilted ground, so its height is faked with shading and a lift up the screen: a dark trough ahead of the front,
// a wall whose back slope rises from the water behind the crest to a crest lifted about 4.5 times the wave's height, shaded strongly from a dark base to a light top, a thick lit
// lip, and where it breaks (around the peel point) a lip that clearly overhangs with a dark barrel under it, spray thrown up from it, a foam sheet and tumbling whitewater behind.
// The geometry and the timing are the wave of the clock (src/surf.js waveAt / waveBody): nothing here decides anything. Only the rows in view are drawn.
import { waveBody, WAVE_LIFT } from '../surf.js';
import { groundRow, project } from './camera.js';
import { TILE } from '../map.js';

export { WAVE_LIFT };
const hash = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 0x45d9f3b); h ^= h >>> 15; return (h >>> 0) / 4294967295; };

/** Draws the wave into `ctx`. `n` is the night amount (it dims the water), `now` ms, `shore(y)` the first shallow column of a row, `rows` the map's row count. Returns the samples drawn. */
export function drawWave(ctx, cam, view, wave, n, now, shore, rows) {
  const rt = groundRow(cam, 0), rb = groundRow(cam, view.h - 1);
  const r0 = Math.max(1, Math.floor((rt ? rt.y : cam.focusY - 700) / TILE) - 1), r1 = Math.min(rows - 2, Math.ceil((rb ? rb.y : cam.focusY + 400) / TILE) + 1);
  const body = waveBody(wave, r0, r1, TILE, shore);
  if (!body.length) return 0;
  const dim = 1 - 0.5 * n, rect = (x, y, w, h) => ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ps = body.map((s) => project(cam, s.x, s.y));
  const on = (p, m = 60) => p && p.x > -m && p.x < view.w + m && p.y > -m * 3 && p.y < view.h + m * 3;
  const links = [];                                                                        // consecutive samples: the wall is drawn as strips between them, one continuous diagonal body
  for (let i = 0; i + 1 < body.length; i++) if (Math.abs(body[i + 1].y - body[i].y - 8) < 0.01 && (on(ps[i]) || on(ps[i + 1]))) links.push(i);
  const lifts = body.map((s, i) => (ps[i] ? s.h * WAVE_LIFT * ps[i].scale : 0));
  const behind = body.map((s) => project(cam, s.x - 13, s.y + 13));                         // where the back slope meets the water: behind the crest, nearer the camera
  const quad = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); ctx.fill(); };
  const pt = (i, f) => { const b = behind[i], p = ps[i]; return [b.x + (p.x - b.x) * Math.min(1, f * 1.0), b.y + ((p.y - lifts[i]) - b.y) * f]; };      // along the slope from the water (f 0) to the crest (f 1)
  ctx.save();
  ctx.fillStyle = '#0c2f5e';                                                              // 1. the trough: clearly darker water ahead of the front (north-east of it), two tiles wide
  for (const i of links) {
    const s = body[i], t = body[i + 1], a0 = project(cam, s.x + 2, s.y - 2), a1 = project(cam, t.x + 2, t.y - 2), b0 = project(cam, s.x + 30, s.y - 30), b1 = project(cam, t.x + 30, t.y - 30);
    if (!a0 || !a1 || !b0 || !b1 || Math.min(s.a, t.a) < 0.35) continue;                    // (no thin ghost strips where the wave dies on the shallows)
    ctx.globalAlpha = 0.62 * Math.min(s.a, t.a) * dim;
    quad([[a0.x, a0.y], [a1.x, a1.y], [b1.x, b1.y], [b0.x, b0.y]]);
  }
  const bands = [[0, 0.3, '#143f73', 0.95], [0.3, 0.6, '#1f7aa8', 0.95], [0.6, 0.86, '#4db4d2', 0.95], [0.86, 1, '#b8f0f6', 0.97]];   // 2. the wall: dark base to light top
  for (const [f0, f1, col, al] of bands) {
    for (const i of links) {
      const s = body[i], t = body[i + 1];
      if (!ps[i] || !ps[i + 1] || !behind[i] || !behind[i + 1]) continue;
      ctx.fillStyle = s.broken && f0 > 0.8 ? '#e2fbff' : col;
      ctx.globalAlpha = al * Math.min(s.a, t.a) * dim;
      const a = pt(i, f0), b = pt(i + 1, f0), c = pt(i + 1, f1), d = pt(i, f1);
      quad([a, b, [c[0], c[1] - 0.5], [d[0], d[1] - 0.5]]);
    }
  }
  for (const i of links) {                                                                // the barrel and the overhanging lip where it breaks
    const s = body[i], t = body[i + 1], c = Math.max(s.curl, t.curl);
    if (c < 0.2 || !ps[i] || !ps[i + 1]) continue;
    const sc = ps[i].scale, ox = 11 * sc, Ti = [ps[i].x, ps[i].y - lifts[i]], Tj = [ps[i + 1].x, ps[i + 1].y - lifts[i + 1]];
    ctx.fillStyle = '#071f45'; ctx.globalAlpha = 0.9 * c * Math.min(s.a, t.a) * dim;                // the dark barrel under the lip
    quad([[Ti[0], Ti[1] + 2 * sc], [Tj[0], Tj[1] + 2 * sc], [Tj[0] + ox * 0.85, Tj[1] + lifts[i + 1] * 0.5], [Ti[0] + ox * 0.85, Ti[1] + lifts[i] * 0.5]]);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = Math.min(s.a, t.a) * dim;                        // the lip thrown forward and curling down
    quad([[Ti[0] - sc, Ti[1] - 1.5 * sc], [Tj[0] - sc, Tj[1] - 1.5 * sc], [Tj[0] + ox, Tj[1] - sc], [Ti[0] + ox, Ti[1] - sc]]);
    quad([[Ti[0] + ox * 0.6, Ti[1] - sc], [Tj[0] + ox * 0.6, Tj[1] - sc], [Tj[0] + ox * 1.15, Tj[1] + 5 * sc], [Ti[0] + ox * 1.15, Ti[1] + 5 * sc]]);
  }
  ctx.lineCap = 'butt';
  for (const i of links) {                                                                // the thick bright lit lip along the top
    const s = body[i], t = body[i + 1], pa = ps[i], pb = ps[i + 1];
    if (!pa || !pb) continue;
    const c = Math.max(s.curl, t.curl);
    ctx.globalAlpha = Math.min(s.a, t.a) * dim;
    ctx.strokeStyle = s.broken ? '#ffffff' : '#e6f9fd';
    ctx.lineWidth = Math.max(2, pa.scale * (c > 0.3 ? 4.2 : 3));
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y - lifts[i]); ctx.lineTo(pb.x, pb.y - lifts[i + 1]); ctx.stroke();
  }
  ctx.fillStyle = '#eaf9fd';                                                              // 3. the foam sheet on the back slope and behind the broken part
  for (const i of links) {
    const s = body[i], t = body[i + 1];
    if (!s.broken || !t.broken || !behind[i] || !behind[i + 1] || Math.min(s.a, t.a) < 0.35) continue;
    const b0 = project(cam, s.x - 26, s.y + 26), b1 = project(cam, t.x - 26, t.y + 26);
    if (!b0 || !b1) continue;
    ctx.globalAlpha = 0.55 * Math.min(s.a, t.a) * dim;
    quad([[behind[i].x, behind[i].y], [behind[i + 1].x, behind[i + 1].y], [b1.x, b1.y], [b0.x, b0.y]]);
  }
  ctx.fillStyle = '#ffffff';
  body.forEach((s, i) => {                                                                // tumbling whitewater, and spray flung up from the curl
    if (!s.broken || !ps[i]) return;
    for (let q = 0; q < 6; q++) {
      const ph = (now / 820 + hash(Math.round(s.y * 2), q)) % 1, off = 8 + ph * 34, p = project(cam, s.x - off, s.y + off);
      if (!on(p)) continue;
      ctx.globalAlpha = Math.max(0, (1 - ph) * 0.8 * s.a * dim);
      const sz = (3.6 + 2.4 * hash(Math.round(s.y * 2), q + 7)) * p.scale;
      rect(p.x - sz / 2, p.y - Math.sin(ph * Math.PI) * 5 * p.scale - sz * 0.3, sz, sz * 0.7);
    }
    if (s.curl > 0.2) for (let q = 0; q < 5; q++) {
      const ph = (now / 560 + hash(Math.round(s.y * 2), q + 3)) % 1, p = ps[i];
      ctx.globalAlpha = Math.max(0, (1 - ph) * 0.95 * s.curl * s.a * dim);
      const sz = Math.max(1, p.scale * (1 + hash(Math.round(s.y * 2), q + 5)));
      rect(p.x + (hash(Math.round(s.y * 2), q + 11) - 0.2) * 12 * p.scale + ph * 6 * p.scale, p.y - lifts[i] - ph * 18 * p.scale, sz, sz);
    }
  });
  ctx.restore();
  return body.length;
}
