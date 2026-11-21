// Draws the pets as seen from behind (the arcade's camera sits behind the pet) and writes src/arcade/back-art.js.
//   node tools/make-back-sprites.mjs        (rewrites the data module; the output is deterministic, commit it)
// Each pet is a union of ellipses / triangles / strokes on a 32 x 32 grid (the same cell as assets/pets.png, feet on the last rows). The rim of the union
// is outlined in the pet's dark colour, a one pixel band near the lower-right edge is shaded, one near the upper-left edge is lit, and the seam where
// one part lies over another (head over body, flipper over body) is shaded too. Baby and child are the adult drawn smaller (the cell's bottom stays put);
// the elder is the adult with a paler palette, as in the sheet, so it is a palette and not another drawing.
// Characters: . clear  o outline  f fill  h highlight  s shade  a accent (stripes, spots)  p pink  d deep (inner ear)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const N = 32;
const ellipse = (cx, cy, rx, ry, o = {}) => ({ ...o, hit: (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 });
const tri = (a, b, c, o = {}) => ({
  ...o,
  hit: (x, y) => {
    const px = x + 0.5, py = y + 0.5, s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    const d1 = s([px, py], a, b), d2 = s([px, py], b, c), d3 = s([px, py], c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  },
});
const stroke = (pts, r, o = {}) => ({
  ...o,
  hit: (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= r) return true;
    }
    return false;
  },
});

const SPECIES = {
  frog: (g) => ({
    parts: [
      ellipse(g(16, 22.5)[0], g(16, 22.5)[1], 9 * g.s, 8.6 * g.s),
      ellipse(g(7.5, 28.6)[0], g(7.5, 28.6)[1], 5 * g.s, 3.2 * g.s),
      ellipse(g(24.5, 28.6)[0], g(24.5, 28.6)[1], 5 * g.s, 3.2 * g.s),
      ellipse(g(16, 14)[0], g(16, 14)[1], 11.6 * g.s, 6.2 * g.s),
      ellipse(g(9.5, 7.4)[0], g(9.5, 7.4)[1], 4.7 * g.s, 4.5 * g.s),
      ellipse(g(22.5, 7.4)[0], g(22.5, 7.4)[1], 4.7 * g.s, 4.5 * g.s),
    ],
    dots: [[12, 21, 2, 2], [18, 24, 2, 2], [20, 20, 2, 1], [14, 25, 1, 1]],
    accent: 'a', seam: 'a',
  }),
  seal: (g) => ({
    parts: [
      ellipse(g(10.5, 29.4)[0], g(10.5, 29.4)[1], 4.6 * g.s, 2.3 * g.s),
      ellipse(g(21.5, 29.4)[0], g(21.5, 29.4)[1], 4.6 * g.s, 2.3 * g.s),
      ellipse(g(16, 17.5)[0], g(16, 17.5)[1], 11.6 * g.s, 11.8 * g.s),
      ellipse(g(16, 10.2)[0], g(16, 10.2)[1], 10.8 * g.s, 8.6 * g.s),
      ellipse(g(5.4, 23)[0], g(5.4, 23)[1], 2.6 * g.s, 4.6 * g.s, { fill: 's' }),
      ellipse(g(26.6, 23)[0], g(26.6, 23)[1], 2.6 * g.s, 4.6 * g.s, { fill: 's' }),
    ],
    dots: [[12, 19, 2, 2], [19, 22, 2, 2], [15, 26, 2, 1]],
    accent: 's', seam: 'a',
  }),
  cat: (g) => ({
    parts: [
      stroke([g(22, 27.5), g(27, 26.6), g(29.2, 21.5), g(28.2, 16.5)], 1.7 * g.s),
      ellipse(g(16, 23.8)[0], g(16, 23.8)[1], 8.6 * g.s, 7.6 * g.s),
      ellipse(g(11, 29.6)[0], g(11, 29.6)[1], 3.4 * g.s, 2.1 * g.s),
      ellipse(g(21, 29.6)[0], g(21, 29.6)[1], 3.4 * g.s, 2.1 * g.s),
      tri(g(4.6, 10), g(5.8, 0.4), g(13.4, 4.6)),
      tri(g(27.4, 10), g(26.2, 0.4), g(18.6, 4.6)),
      ellipse(g(16, 11.4)[0], g(16, 11.4)[1], 10.9 * g.s, 8 * g.s),
    ],
    dots: [[12, 5, 1, 3], [15, 4, 2, 4], [19, 5, 1, 3], [8, 22, 3, 1], [21, 22, 3, 1], [9, 26, 3, 1], [20, 26, 3, 1], [27, 24, 3, 1], [28, 19, 2, 1]],
    accent: 'a', seam: 'a',
    ears: true,
  }),
};

const SCALE = { baby: 0.78, child: 0.9, adult: 1 };

function draw(species, stage) {
  const s = SCALE[stage];
  const g = (x, y) => [16 + (x - 16) * s, 31.5 - (31.5 - y) * s];
  g.s = s;
  const def = SPECIES[species](g);
  const owner = Array.from({ length: N }, () => Array(N).fill(-1));
  def.parts.forEach((p, i) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (p.hit(x, y)) owner[y][x] = i; });
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : owner[y][x]);
  const out = Array.from({ length: N }, () => Array(N).fill('.'));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = at(x, y);
    if (o < 0) {
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) >= 0)) out[y][x] = 'o';
      continue;
    }
    let c = def.parts[o].fill || 'f';
    if (c === 'f') {
      if (at(x + 1, y) < 0 || at(x, y + 1) < 0 || at(x + 1, y + 1) < 0) c = 's';
      else if (at(x, y - 1) < 0 || at(x - 1, y) < 0) c = 'h';
    }
    // a seam: this cell is the lower rim of a part lying over an earlier one (head over body): a dark line along it
    if ([[0, 1], [1, 0], [-1, 0]].some(([dx, dy]) => at(x + dx, y + dy) >= 0 && at(x + dx, y + dy) < o)) c = def.seam || 's';
    out[y][x] = c;
  }
  for (const [dx, dy, w, h] of def.dots) {
    const [x0, y0] = g(dx, dy);
    for (let y = Math.round(y0); y < Math.round(y0) + Math.max(1, Math.round(h * s)); y++) for (let x = Math.round(x0); x < Math.round(x0) + Math.max(1, Math.round(w * s)); x++) if (out[y] && (out[y][x] === 'f' || out[y][x] === 's' || out[y][x] === 'h')) out[y][x] = def.accent;
  }
  if (def.ears) {                                  // a pink edge on the inside of each ear, the way the front view shows the inner ear
    for (const [ex, ey] of [[8.5, 4.5], [23, 4.5]]) {
      const [x, y] = g(ex, ey);
      for (const oy of [0, 1, 2]) if (out[Math.round(y) + oy] && ['f', 's', 'h'].includes(out[Math.round(y) + oy][Math.round(x)])) out[Math.round(y) + oy][Math.round(x)] = 'p';
    }
  }
  return out.map((r) => r.join(''));
}

const PALETTES = {
  frog: { o: '#295d39', f: '#9ce38c', h: '#d6f7b5', s: '#6bbe6b', a: '#5ab25a', p: '#ff9eb5', d: '#295d39' },
  seal: { o: '#394963', f: '#b5c7de', h: '#deebf7', s: '#849ebd', a: '#849ebd', p: '#ff9eb5', d: '#394963' },
  cat: { o: '#6b3421', f: '#ffba73', h: '#ffdfad', s: '#e78a4a', a: '#d67139', p: '#ff9eb5', d: '#a5714a' },
};
const ELDER = {                                    // the sheet's elder colours: paler, with a grey outline
  frog: { o: '#7b867b', f: '#c6dfc6', h: '#e7f3de', s: '#adc7ad', a: '#adc7ad', p: '#ff9eb5', d: '#7b867b' },
  seal: { o: '#7b7d8c', f: '#ced7de', h: '#efeff7', s: '#b5bac6', a: '#b5bac6', p: '#ff9eb5', d: '#7b7d8c' },
  cat: { o: '#847573', f: '#efd3bd', h: '#f7ebde', s: '#c6a294', a: '#b59e94', p: '#ff9eb5', d: '#847573' },
};

export function buildArt() {
  const art = {};
  for (const sp of Object.keys(SPECIES)) for (const st of Object.keys(SCALE)) art[`${sp}-${st}`] = draw(sp, st);
  return art;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const art = buildArt();
  const lines = [
    '// GENERATED by tools/make-back-sprites.mjs: do not edit by hand (edit the tool and run it again).',
    '// The three playable pets seen from behind, 32 x 32 like assets/pets.png. One string per row; the characters are keys of PALETTE[species]:',
    '// . clear  o outline  f fill  h highlight  s shade  a accent (stripes, spots)  p pink  d deep. The elder is the adult with ELDER_PALETTE.',
    `export const PALETTE = ${JSON.stringify(PALETTES)};`,
    `export const ELDER_PALETTE = ${JSON.stringify(ELDER)};`,
    'export const BACK_ART = {',
  ];
  for (const [k, rows] of Object.entries(art)) {
    lines.push(`  '${k}': [`);
    for (const r of rows) lines.push(`    '${r}',`);
    lines.push('  ],');
  }
  lines.push('};', '');
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'arcade', 'back-art.js'), lines.join('\n'));
  console.log('wrote src/arcade/back-art.js');
}
