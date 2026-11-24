// The fishing picture: sky, far shore, water, the dock with the pet and its rod, the float and the line, the gauge while charging, the reeling bar and the cues.
// Drawn on a logical canvas (src/arcade/lanes.js logicalSize) from a run state and a clock; the rules know nothing of it. `ctx` = { night, christmas } tints the scene.
import { drawPet } from '../sprites.js';
import { textWidth } from '../font.js';
import { bigText } from '../arcade/hud.js';
import { FISHING } from './rules.js';
import { sceneLayout, landingPoint, castArc, castD01, floatAt, barPieces, promptFor } from './layout.js';
import { fishCanvas, FISH_W, FISH_H } from './fish-art.js';

const SKY = { day: ['#69b9ea', '#8accf0', '#abdcf5', '#c9ecf9'], night: ['#0b0e2a', '#141a41', '#1d2554', '#2a3270'], dusk: ['#2a3a78', '#4a5898', '#7a78b0', '#b690a8'] };
const WATER = { day: ['#3f93d0', '#2f7fbf', '#2670ad', '#1d6099'], night: ['#1a2a5c', '#16254f', '#111e44', '#0d1838'], xmas: ['#5aaed0', '#4a9ec6', '#3b8cb6', '#2f7ba3'] };

const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const line = (g, c, x0, y0, x1, y1) => {                               // a pixel line (Bresenham)
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle = c;
  for (let i = 0; i < 400; i++) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
};
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 2246822519); n = Math.imul(n ^ (n >>> 13), 3266489917); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

function drawSky(g, L, w, c) {
  const bands = c.night ? SKY.night : SKY.day, bh = Math.ceil(L.water / bands.length);
  bands.forEach((col, i) => rect(g, col, 0, i * bh, w, bh + 1));
  if (c.night) {
    for (let i = 0; i < 34; i++) { const x = hash(i * 7 + 1) * w, y = hash(i * 13 + 5) * (L.water - 14); rect(g, hash(i) > 0.5 ? '#fff4c8' : '#a9b4e8', x, y, 1, 1); }
    const mx = Math.round(w * 0.74), my = Math.round(L.water * 0.3);                 // the moon: a disc with a bite out of it
    rect(g, '#f7f0c8', mx - 5, my - 7, 10, 14); rect(g, '#f7f0c8', mx - 7, my - 5, 14, 10); rect(g, bands[1], mx - 1, my - 8, 7, 9);
  } else {
    const sx = Math.round(w * 0.72), sy = Math.round(L.water * 0.3);                // the sun
    rect(g, '#fff2a8', sx - 6, sy - 8, 12, 16); rect(g, '#fff2a8', sx - 8, sy - 6, 16, 12); rect(g, '#ffe066', sx - 5, sy - 5, 10, 10);
  }
}

function drawFarShore(g, L, w, c, clock) {
  const base = L.water, snow = c.christmas, col = c.night ? '#162a3c' : snow ? '#cfe3ee' : '#5f9a58', col2 = c.night ? '#1c3446' : snow ? '#e8f3f8' : '#79b46c';
  for (let x = 0; x < w; x++) {                                                      // low hills
    const h1 = 7 + Math.round(5 * Math.sin(x * 0.045 + 1) + 3 * Math.sin(x * 0.13)), h2 = 4 + Math.round(3 * Math.sin(x * 0.07 + 4));
    rect(g, col, x, base - h1, 1, h1); rect(g, col2, x, base - h2, 1, h2);
  }
  for (let i = 0; i < Math.floor(w / 26); i++) {                                     // trees along it (pines at Christmas, with a few lights)
    const x = 8 + i * 26 + Math.round(hash(i) * 10), y = base - 14 - Math.round(hash(i + 9) * 3);
    if (snow) {
      for (let r = 0; r < 4; r++) rect(g, c.night ? '#1d4a3a' : '#2f7a52', x - 2 - r, y + r * 3, 5 + r * 2, 3);
      rect(g, c.night ? '#3a2a26' : '#6b4a30', x, y + 12, 2, 3); rect(g, '#ffffff', x - 1, y - 1, 3, 2);
      if (Math.floor(clock / 500 + i) % 2) rect(g, '#ff5a5a', x - 3, y + 7, 1, 1); else rect(g, '#ffd84a', x + 3, y + 4, 1, 1);
    } else {
      rect(g, c.night ? '#2a1f1d' : '#6b4a30', x, y + 8, 2, 6); rect(g, c.night ? '#173a2c' : '#3f8a4e', x - 4, y, 10, 9); rect(g, c.night ? '#1d4636' : '#58a85f', x - 2, y - 3, 6, 4);
    }
  }
}

function drawWater(g, L, w, c, clock) {
  const bands = c.night ? WATER.night : c.christmas ? WATER.xmas : WATER.day, bh = Math.ceil((L.h - L.water) / bands.length);
  bands.forEach((col, i) => rect(g, col, 0, L.water + i * bh, w, bh + 1));
  const hi = c.night ? '#2c4486' : c.christmas ? '#a6dff2' : '#78bcec';
  for (let r = 0; r < 14; r++) {                                                     // ripples: short lines that drift
    const y = L.water + 6 + r * Math.round((L.h - L.water - 8) / 14), n = 4 + (r >> 1), sp = 4 + r * 1.2;
    for (let i = 0; i < n; i++) { const x = ((hash(r * 31 + i) * (w + 40) + clock * 0.001 * sp) % (w + 40)) - 20; rect(g, hi, x, y, 3 + (r >> 2), 1); }
  }
  if (c.night) for (let i = 0; i < 5; i++) rect(g, '#f7f0c8', Math.round(w * 0.74) - 5 + (i % 2) * 2, L.water + 4 + i * 5, 10 - (i % 2) * 4, 1);                 // the moon's reflection
  else for (let i = 0; i < 4; i++) rect(g, '#fff2a8', Math.round(w * 0.72) - 6 + (i % 2) * 2, L.water + 4 + i * 5, 12 - (i % 2) * 4, 1);
  if (c.christmas) for (let i = 0; i < 6; i++) {                                     // ice floes
    const x = ((hash(i + 77) * (w + 60) + clock * 0.004) % (w + 60)) - 30, y = L.water + 10 + hash(i + 3) * (L.h - L.water - 40);
    rect(g, '#e8f6fc', x, y, 10, 2); rect(g, '#ffffff', x + 1, y - 1, 7, 1); rect(g, '#9cc9dc', x + 2, y + 2, 6, 1);
  }
}

function drawDock(g, L, w, c, sprites, look, clock, s) {
  const snow = c.christmas;
  const y = L.feetY;
  rect(g, c.night ? '#2c1f1b' : '#6e4a2c', 0, y, L.dockW, 7);                          // planks
  for (let x = 0; x < L.dockW; x += 7) rect(g, c.night ? '#1d1411' : '#4c3220', x, y, 1, 7);
  rect(g, c.night ? '#3c2c26' : '#8a6038', 0, y, L.dockW, 1);
  rect(g, c.night ? '#1d1411' : '#4c3220', 0, y + 7, L.dockW, L.h - y - 7);           // the bank under it
  rect(g, c.night ? '#243a28' : '#4f9a4a', 0, y + 14, L.dockW, L.h - y - 14);
  for (const px of [L.dockW - 6, Math.round(L.dockW / 2)]) { rect(g, c.night ? '#2c1f1b' : '#5a3b22', px, y + 7, 3, 13); }
  if (snow) { rect(g, '#f4f9fc', 0, y - 1, L.dockW, 2); rect(g, '#f4f9fc', 0, y + 14, L.dockW, 3); for (let x = 3; x < L.dockW; x += 11) rect(g, '#ffffff', x, y - 2, 4, 1); }
  const frame = s.phase === 'caught' ? 'happy' : s.phase === 'escaped' ? 'idle' : 'look';
  try { drawPet(g, sprites, look, L.petOrigin.x, L.petOrigin.y + Math.round(Math.sin(clock / 500) * 0.6), { frame, now: clock }); } catch { /* an unseen item must not stop the picture */ }
  if (snow) { rect(g, '#d93a4a', L.petOrigin.x + 9, L.petOrigin.y - 2, 14, 3); rect(g, '#ffffff', L.petOrigin.x + 9, L.petOrigin.y + 1, 14, 1); }       // a Christmas cap (a band)
}

function drawRod(g, L, s, flt) {
  const bend = s.phase === 'reeling' ? (s.reel.inside ? 2 : 4) : s.phase === 'bite' ? 3 : 0;
  const tip = { x: L.tip.x, y: L.tip.y + bend };
  line(g, '#7a5230', L.hand.x - 4, L.hand.y + 4, L.hand.x + 12, L.hand.y - 10);                    // the rod, in two pieces so it bends at the tip
  line(g, '#a07040', L.hand.x + 12, L.hand.y - 10, tip.x, tip.y);
  rect(g, '#2a2a2a', tip.x, tip.y, 1, 1);
  // the line: from the tip to the float, slack while waiting, taut while reeling
  const taut = s.phase === 'reeling' || s.phase === 'bite', n = Math.max(8, Math.ceil(Math.hypot(flt.x - tip.x, flt.y - tip.y)));
  g.fillStyle = '#e8eef5';
  for (let i = 0; i <= n; i++) {
    const t = i / n, sag = taut ? 2 * Math.sin(t * Math.PI) : (s.phase === 'cast' || s.phase === 'waiting' ? 9 + (flt.x - tip.x) * 0.04 : 0) * Math.sin(t * Math.PI);
    g.fillRect(Math.round(tip.x + (flt.x - tip.x) * t), Math.round(tip.y + (flt.y - tip.y) * t + sag), 1, 1);
  }
}

function drawFloat(g, f, clock, c) {
  const x = Math.round(f.x), y = Math.round(f.y);
  if (f.mode !== 'fly' && f.mode !== 'hang') {                                       // rings on the water
    const r = 3 + (Math.floor(clock / 260) % 3) * 2 + (f.mode === 'twitch' || f.mode === 'dip' ? 3 : 0);
    g.fillStyle = c.night ? 'rgba(200,220,255,0.35)' : 'rgba(255,255,255,0.5)';
    g.fillRect(x - r, y + 3, r * 2 + 1, 1);
  }
  rect(g, '#f2f2f2', x - 1, y + 1, 3, 3); rect(g, '#e23b3b', x - 1, y - 2, 3, 3); rect(g, '#7a1f1f', x, y - 3, 1, 1);
}

function drawGauge(g, L, power, font, clock) {
  const b = L.gauge;
  rect(g, '#10131f', b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  const seg = Math.round(b.w * power);
  rect(g, power < 0.4 ? '#8bd97f' : power < 0.75 ? '#ffd84a' : '#ff7a4a', b.x, b.y, seg, b.h);
  for (let i = 1; i < 6; i++) rect(g, '#10131f', b.x + Math.round((b.w * i) / 6), b.y, 1, b.h);
  rect(g, '#ffffff', b.x + seg, b.y - 3, 1, b.h + 6);
}

function drawBar(g, L, r, clock) {
  const B = L.bar, M = L.meter, p = barPieces(B, r);
  rect(g, '#10131f', B.x - 2, B.y - 2, B.w + 4, B.h + 4);
  rect(g, '#1d3a5c', B.x, B.y, B.w, B.h);
  for (let i = 1; i < 10; i++) rect(g, '#2a4d78', B.x + 1, B.y + Math.round((B.h * i) / 10), B.w - 2, 1);
  rect(g, r.inside ? '#7fe06a' : '#3fa04a', B.x, p.zone.y, B.w, p.zone.h);                    // the fish's zone
  rect(g, '#d7ffc8', B.x, p.zone.y, B.w, 1); rect(g, '#d7ffc8', B.x, p.zone.y + p.zone.h - 1, B.w, 1);
  const fish = fishCanvas(r.fishId, 1);
  g.drawImage(fish, B.x - FISH_W - 5, Math.round(p.zone.y + p.zone.h / 2 - FISH_H / 2));            // the fish itself, beside its zone
  rect(g, '#ffffff', B.x - 3, p.marker - 1, B.w + 6, 3); rect(g, '#10131f', B.x - 3, p.marker + 2, B.w + 6, 1);   // the marker: a bar wider than the track
  rect(g, '#10131f', M.x - 2, M.y - 2, M.w + 4, M.h + 4);
  rect(g, '#243248', M.x, M.y, M.w, M.h);
  rect(g, r.progress > 0.66 ? '#8bd97f' : '#ffd84a', M.x, M.y + M.h - p.progressH, M.w, p.progressH);
  if (r.outside > 0.4) { const warn = Math.min(1, r.outside / FISHING.SNAP_S); g.fillStyle = `rgba(255,70,60,${(0.25 + 0.5 * warn).toFixed(2)})`; g.fillRect(B.x - 2, B.y - 2, B.w + 4, 2); g.fillRect(B.x - 2, B.y + B.h, B.w + 4, 2); }
}

/** A fish leaping out of the water on the way to the card (the catch), t 0..1. */
function drawLeap(g, L, f, id, t) {
  const up = Math.sin(Math.min(1, t) * Math.PI) * 26;
  g.drawImage(fishCanvas(id, 2), Math.round(f.x - FISH_W), Math.round(f.y - FISH_H * 2 - up), FISH_W * 2, FISH_H * 2);
  for (let i = 0; i < 5; i++) rect(g, '#ffffff', f.x - 8 + i * 4 + Math.round(hash(i) * 3), f.y - Math.round(up * 0.5) + (i % 2) * 2, 1, 1);
}

/** Draws a whole frame. `o` = { w, h, pad, font, sprites, look, ctx, clock, resultT (ms since the run ended) }. */
export function drawFishing(g, s, o) {
  g.imageSmoothingEnabled = false;
  const { w, h, font, clock } = o, c = o.ctx || {};
  const L = sceneLayout(w, h, o.pad);
  drawSky(g, L, w, c); drawFarShore(g, L, w, c, clock); drawWater(g, L, w, c, clock);
  const flt = floatAt(s, L, clock);
  if (s.phase === 'charging') {                                                      // where the float would land, and a dotted arc to it
    const to = landingPoint(L, castD01(s));
    for (let i = 1; i < 12; i++) { const p = castArc(L, to, i / 12); rect(g, 'rgba(255,255,255,0.45)', p.x, p.y, 1, 1); }
    rect(g, 'rgba(255,255,255,0.55)', to.x - 4, to.y + 2, 9, 1); rect(g, 'rgba(255,255,255,0.35)', to.x - 2, to.y + 4, 5, 1);
  }
  drawDock(g, L, w, c, o.sprites, o.look, clock, s);
  drawRod(g, L, s, flt);
  if (s.phase !== 'caught') drawFloat(g, flt, clock, c);
  if (s.phase === 'reeling') for (let i = 0; i < (s.reel.inside ? 4 : 7); i++) rect(g, '#ffffff', flt.x - 6 + Math.round(hash(i + Math.floor(clock / 90)) * 12), flt.y + 2 + (i % 3), 1, 1);   // splashes
  if (s.phase === 'caught') drawLeap(g, L, flt, s.fish.id, Math.min(1, (o.resultT || 0) / 900));
  if (s.phase === 'escaped' && s.reason === 'snapped') { const x = flt.x; rect(g, '#e8eef5', x - 2, flt.y - 8 - Math.min(10, (o.resultT || 0) / 60), 1, 6); }
  if (s.phase === 'charging') drawGauge(g, L, s.power, font, clock);
  if (s.phase === 'reeling') drawBar(g, L, { ...s.reel, fishId: s.fish.id }, clock);
  if (c.christmas) for (let i = 0; i < 26; i++) {                                    // snow falling over the scene
    const x = (hash(i + 400) * w + Math.sin(clock / 900 + i) * 4 + w) % w, y = (hash(i + 500) * h + clock * (0.012 + hash(i) * 0.012)) % h;
    rect(g, '#ffffff', x, y, 1, 1);
  }
  if (c.night) { g.fillStyle = 'rgba(8,12,40,0.22)'; g.fillRect(0, L.water, w, h - L.water); }
  // the cues
  if (s.phase === 'bite') {
    const t = clock % 360 < 180 ? 2 : 3, txt = '¡Pica!';
    g.fillStyle = 'rgba(255,230,120,0.18)'; g.fillRect(0, 0, w, h);
    bigText(g, font, txt, Math.round((w - textWidth(font, txt) * t) / 2), Math.round(L.water * 0.35), t, '#fff7de', '#b8302a');
    rect(g, '#ffe066', flt.x - 1, flt.y - 22, 3, 9); rect(g, '#ffe066', flt.x - 1, flt.y - 11, 3, 3);
  } else if (s.phase === 'waiting' && flt.mode === 'twitch') rect(g, '#ffffff', flt.x - 1, flt.y - 12, 2, 5);
  const hint = promptFor(s.phase).hint;
  if (hint && s.phase !== 'bite' && o.hints !== false) bigText(g, font, hint, Math.round((w - textWidth(font, hint)) / 2), h - 15, 1, '#fff7de', '#10131f');
}
