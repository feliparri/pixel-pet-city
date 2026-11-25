// Draws the two beach poses of every playable species (sunbathing on a deck chair, surfing on the wave) as text grids in the device's art format ('.' transparent, palette digits)
// and writes them to src/art/poses-data.js. The pictures are built from shapes (ellipses with outlines, painted back to front like layers) and are meant to be hand-corrected
// afterwards: the grids in poses-data.js are the source of truth once written. Palette indices are the device's (pixel-pet/common/sprites.c PAL_FROG / PAL_SEAL / PAL_CAT):
// 1 outline, 2 shade, 3 body, 4 highlight, 5 belly, 6 sparkle, 7 blush / pink, 8 eyes and mouth, 9 glow (cat: tabby stripes), A (cat) green; plus two of ours: B sunglasses, C their sheen.
// Run: node tools/make-poses.mjs
import { writeFileSync } from 'node:fs';

const make = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
function ell(g, cx, cy, rx, ry, fill, { shade = null, hi = null, ring = '2', lx = 0.6, ly = 0.8 } = {}) {
  const H = g.length, W = g[0].length;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {        // a soft ring in the shade colour, only over what is already drawn (the silhouette's outline comes at the end)
    if (inEll(x, y, cx, cy, rx + 1, ry + 1) && !inEll(x, y, cx, cy, rx, ry) && ring && g[y][x] !== '.') g[y][x] = ring;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inEll(x, y, cx, cy, rx, ry)) continue;
    let c = fill;
    const dx = (x - cx) / rx, dy = (y - cy) / ry, light = -(dx * lx + dy * ly);
    if (shade && light < -0.42) c = shade;
    else if (hi && light > 0.62) c = hi;
    g[y][x] = c;
  }
}
function sausage(g, x0, y0, x1, y1, r, fill, opts) {                                              // a rounded limb: ellipses along a line
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let k = 0; k <= n; k++) ell(g, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, r, r * 0.82, fill, { ...opts, ring: k === 0 ? (opts.ring ?? '2') : null });
}
const px = (g, x, y, c) => { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c); };
function line(g, x0, y0, x1, y1, c, t = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) { const x = Math.round(x0 + ((x1 - x0) * k) / (n || 1)), y = Math.round(y0 + ((y1 - y0) * k) / (n || 1)); rect(g, x, y, t, t, c); }
}
const tri = (g, pts, c) => { // filled triangle
  const [a, b, d] = pts, minY = Math.min(a[1], b[1], d[1]), maxY = Math.max(a[1], b[1], d[1]), minX = Math.min(a[0], b[0], d[0]), maxX = Math.max(a[0], b[0], d[0]);
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { const p = [x, y], d1 = s(p, a, b), d2 = s(p, b, d), d3 = s(p, d, a); if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) px(g, x, y, c); }
};
function outlineAround(g, ch = '1', only = null) {            // an outline on every transparent cell touching a filled one (used for flat shapes such as ears and flippers)
  const H = g.length, W = g[0].length, add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === '.') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = g[y + dy] && g[y + dy][x + dx]; if (c && c !== '.' && c !== ch && (!only || only.includes(c))) { add.push([x, y]); break; } }
  for (const [x, y] of add) g[y][x] = ch;
}

// ---- shared parts -----------------------------------------------------------------------------------------------------------------------------------
function glasses(g, cx, y, tilt = 0) {                                                           // black sunglasses across the eyes: two lenses, a bridge and the arms
  for (const dx of [-7, 2]) { rect(g, cx + dx, y, 6, 4, 'B'); rect(g, cx + dx + 1, y + 1, 2, 1, 'C'); px(g, cx + dx + 4, y + 2, 'C'); rect(g, cx + dx + 1, y, 4, 1, 'B'); }
  rect(g, cx - 1, y, 3, 1, 'B'); px(g, cx - 8, y + 1, 'B'); px(g, cx + 8, y + 1, 'B'); px(g, cx - 9, y + 2, 'B'); px(g, cx + 9, y + 2, 'B');
}
const smile = (g, x, y) => { px(g, x, y, '8'); px(g, x + 1, y + 1, '8'); px(g, x + 2, y + 1, '8'); px(g, x + 3, y, '8'); };
const blushAt = (g, x, y) => { rect(g, x, y, 3, 2, '7'); };

// ---- sunbathing (38 x 31), leaning back against a chair that rises on the right ------------------------------------------------------------------------
function recline(species) {
  const g = make(38, 31);
  const frog = species === 'frog', seal = species === 'seal', cat = species === 'cat';
  if (cat) {                                                                                      // the tail curls up behind the chair back, on the right
    for (const [x0, y0, x1, y1] of [[29, 25, 34, 24], [34, 24, 36, 19], [36, 19, 35, 14]]) line(g, x0, y0, x1, y1, '3', 2);
    for (const [x, y] of [[33, 24], [35, 22], [36, 18], [36, 15]]) px(g, x, y, '9');
  }
  if (frog) { ell(g, 16, 5, 3.4, 3, '3', { shade: '2', hi: '4' }); ell(g, 29, 5, 3.4, 3, '3', { shade: '2', hi: '4' }); }
  if (cat) { for (const [pts, inner] of [[[[13, 9], [14, 1], [20, 5]], [[15, 6], [15, 3], [18, 5]]], [[[31, 9], [31, 1], [25, 5]], [[29, 6], [30, 3], [27, 5]]]]) { tri(g, pts, '3'); tri(g, inner, '7'); } }
  ell(g, 18, 20, 11, 8, '3', { shade: '2', hi: '4' });                                           // the round body
  ell(g, 22, 11, 11, 8, '3', { shade: '2', hi: '4' });                                           // the head, tipped back to the right
  ell(g, 16, 21, 6.5, 5, '5', { ring: '2' });                                                    // the belly patch, facing out
  px(g, 13, 19, '5'); px(g, 12, 20, '5');
  if (cat) { for (const [x, y] of [[9, 16], [10, 15], [27, 17], [28, 18]]) px(g, x, y, '9'); }
  sausage(g, 14, 25.5, 6.5, 26.5, 3.2, '3', { shade: '2', hi: '4' }); ell(g, 3.5, 27, 2.8, 2.5, '3', { shade: '2' });      // the far leg, forward, and its foot
  sausage(g, 20, 28, 10.5, 29, 2.9, '3', { shade: '2', hi: '4' }); ell(g, 8, 29, 2.8, 2.1, '3', { shade: '2' });          // the near leg, in front, and its foot
  const inside = (x, y, c) => { if (g[y] && g[y][x] && g[y][x] !== '.') g[y][x] = c; };
  for (let x = 9; x <= 21; x++) inside(x, Math.round(25.2 + ((x - 9) * (-1.2)) / 12 * -1) - 1, '1');                  // a dark line along the top of the near leg: it reads as a separate limb
  for (let x = 5; x <= 15; x++) inside(x, 24, '2');                                                                  // and a soft one over the far leg
  ell(g, 10, 22, 3.3, 2.5, '3', { shade: '2', ring: '1' }); ell(g, 22, 24, 3.3, 2.3, '3', { shade: '2', ring: '1' });   // the arms rest on the belly
  if (cat) { for (const [x, y] of [[9, 26], [13, 25], [16, 28], [12, 29]]) px(g, x, y, '9'); }
  if (seal) { for (const [x, y] of [[1, 26], [2, 28], [6, 29], [6, 30]]) px(g, x, y, '2'); }
  if (frog) { for (const [x, y] of [[2, 27], [3, 29], [7, 30], [9, 30]]) px(g, x, y, '2'); }
  if (seal || cat) { ell(g, 22, 15, 4.6, 2.8, '5', { ring: '2' }); }
  outlineAround(g, '1');
  if (seal) { rect(g, 21, 13, 3, 1, '8'); px(g, 22, 14, '8'); px(g, 21, 16, '8'); px(g, 23, 16, '8'); px(g, 22, 17, '8'); for (const [x, y] of [[16, 15], [15, 16], [28, 15], [29, 16]]) px(g, x, y, '9'); }
  if (cat) { rect(g, 21, 13, 3, 1, '7'); px(g, 22, 14, '7'); px(g, 21, 16, '8'); px(g, 23, 16, '8'); px(g, 22, 17, '8'); for (const x of [20, 22, 24]) { px(g, x, 3, '9'); px(g, x, 4, '9'); } px(g, 21, 5, '9'); px(g, 23, 5, '9'); }
  glasses(g, 22, 8);                                                                             // sunglasses on the eyes
  blushAt(g, 11, 12); blushAt(g, 29, 12);
  if (frog) smile(g, 21, 15);
  return { grid: g, anchor: [19, 27], head: [22, 4] };
}

// ---- surfing: only the small body below the head (30 x 17): the head is the pet's own standing frame, composed at run time (src/art/poses.js) -------------------------------------------
// Facing the viewer, a short body with the belly patch, both arms out to the sides for balance, short legs apart, standing on the board. Row 0 is where the neck meets the head.
function surfBody(species) {
  const g = make(30, 17);
  const frog = species === 'frog', seal = species === 'seal', cat = species === 'cat';
  if (cat) { for (const [x0, y0, x1, y1] of [[21, 12, 26, 11], [26, 11, 28, 8], [28, 8, 27, 4]]) line(g, x0, y0, x1, y1, '3', 2); for (const [x, y] of [[25, 11], [28, 7], [27, 5]]) px(g, x, y, '9'); }
  // legs apart (behind the torso), then the feet
  ell(g, 10.5, 11.5, 3.3, 3.4, '3', { shade: '2', hi: '4' }); ell(g, 19.5, 11.5, 3.3, 3.4, '3', { shade: '2', hi: '4' });
  ell(g, 9, 15.2, 3.6, 1.7, '3', { shade: '2' }); ell(g, 21, 15.2, 3.6, 1.7, '3', { shade: '2' });
  // arms out to the sides: the left down and out, the right up and out, hands open
  if (seal) { ell(g, 4.5, 6.5, 4.2, 1.9, '2', { shade: null, ring: '1' }); ell(g, 25.5, 2.8, 4.2, 1.9, '2', { shade: null, ring: '1' }); }
  else { line(g, 9, 3, 3, 5, '3', 2); ell(g, 2, 6, 2.3, 2.1, '3', { shade: '2' }); line(g, 21, 3, 27, 1, '3', 2); ell(g, 28, 1.5, 2.3, 2.1, '3', { shade: '2' }); }
  ell(g, 15, 5.5, 7.2, 6.3, '3', { shade: '2', hi: '4' });                                       // the torso
  ell(g, 15, 6.5, 4.4, 4.6, '5', { ring: '2' });                                                 // the belly patch
  if (cat) { for (const [x, y] of [[10, 3], [11, 2], [20, 3], [19, 2], [10, 9], [20, 9]]) px(g, x, y, '9'); }
  if (seal) { for (const [x, y] of [[7, 15], [8, 16], [22, 15], [23, 16]]) px(g, x, y, '2'); }
  if (frog) { for (const [x, y] of [[7, 16], [9, 16], [21, 16], [23, 16]]) px(g, x, y, '2'); }
  outlineAround(g, '1');
  return { grid: g, anchor: [15, 16], head: [15, 0] };
}

const out = { frog: {}, seal: {}, cat: {} };
for (const sp of Object.keys(out)) { out[sp].recline = recline(sp); out[sp].surf = surfBody(sp); }
const text = (p) => `# ${p.grid[0].length}x${p.grid.length}\n${p.grid.map((r) => r.join('')).join('\n')}`;
let src = `// The beach poses of the playable species, drawn for the poses (not transformed from the standing art), in the text-grid format of the device's art (pixel-pet/art/*.txt:\n// '.' is transparent, the digits are palette indices of the species' own palette, see PALETTES). Each pose has an \`anchor\` (where the pet sits or stands: the seat for the sunbathing,\n// the feet for the surfing) and a \`head\` anchor (the top of the head, where a hat goes). Drawn with tools/make-poses.mjs, then corrected by hand: this file is the source of truth.\n`;
src += `export const POSES = {\n`;
for (const sp of Object.keys(out)) {
  src += `  ${sp}: {\n`;
  for (const k of ['recline', 'surf']) { const p = out[sp][k]; src += `    ${k}: { anchor: [${p.anchor}], head: [${p.head}], grid: \`${text(p)}\` },\n`; }
  src += `  },\n`;
}
src += `};\n`;
writeFileSync(new URL('../src/art/poses-data.js', import.meta.url), src);
console.log('written');
