// The arcade's pixel art, drawn in code into small canvases (cached): the train game's roadside, the trains, the coin, the cart, the signs. Same look as the
// town's art (src/art/*.js): the plum-black outline of the pets, five-step ramps, light from the upper left. Sprites are anchored by their bottom centre.
import { P } from '../art/palette.js';
import { hash } from './scenery.js';

const mk = (w, h, fn) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  return c;
};
const R = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
const memo = (fn) => { const m = new Map(); return (key = '') => { if (!m.has(key)) m.set(key, fn(key)); return m.get(key); }; };
export const INK = P.ink;

/** A union of discs painted with five tones (light from the upper left), outlined; `pal` { o, d, m, l, h }; leaves get a dithered speckle. */
export function blob(g, discs, pal, seed = 1) {
  const inside = (x, y) => { for (const [cx, cy, r] of discs) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) return true; return false; };
  const W = g.canvas.width, H = g.canvas.height;
  const mask = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => inside(x, y)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y][x]) {
      if ((mask[y - 1] && mask[y - 1][x]) || (mask[y + 1] && mask[y + 1][x]) || mask[y][x - 1] || mask[y][x + 1]) R(g, pal.o, x, y, 1, 1);
      continue;
    }
    let best = null, bd = 1e9;
    for (const [cx, cy, r] of discs) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r; if (d <= 1 && d < bd) { bd = d; best = [cx, cy, r]; } }
    const [cx, cy, r] = best;
    const v = -(((x + 0.5 - cx) / r) * 0.6 + ((y + 0.5 - cy) / r) * 0.8);
    let t = v > 0.62 ? 'h' : v > 0.22 ? 'l' : v > -0.38 ? 'm' : 'd';
    if (hash(x * 31 + seed, y * 17) < 0.14 && t !== 'h') t = t === 'l' ? 'm' : t === 'm' ? 'd' : 'd';
    else if (hash(x * 13 + seed, y * 29 + 5) < 0.07 && t !== 'd') t = t === 'm' ? 'l' : t === 'l' ? 'h' : t;
    R(g, pal[t], x, y, 1, 1);
  }
}
const GREEN = { o: '#1d4030', d: '#295d39', m: '#3f8548', l: '#5ab25a', h: '#8bd97f' };
const PINK = { o: '#6a2a4a', d: '#b8486a', m: '#e0709a', l: '#ff9eb5', h: '#ffd0dc' };
const ROCKS = { o: INK, d: '#52597b', m: '#7b7d8c', l: '#9a9fb0', h: '#ced7de' };

const trunk = (g, cx, y0, y1, w = 5) => {
  R(g, INK, cx - Math.ceil(w / 2) - 0, y0, w + 2, y1 - y0);
  R(g, P.w2, cx - Math.floor(w / 2), y0, w, y1 - y0);
  R(g, P.w3, cx - Math.floor(w / 2), y0, 1, y1 - y0);
  R(g, P.w1, cx + Math.ceil(w / 2) - 1, y0, 1, y1 - y0);
};

export const tree = memo((v) => mk(38, 46, (g) => {
  const n = Number(v) || 0;
  trunk(g, 19, 30, 45, 5);
  blob(g, n === 1 ? [[19, 15, 13], [10, 22, 9], [28, 22, 9], [19, 26, 10]] : [[19, 14, 12], [11, 21, 9], [27, 21, 9], [19, 24, 10], [19, 8, 7]], GREEN, 3 + n);
}));
export const blossom = memo(() => mk(38, 46, (g) => {
  trunk(g, 19, 30, 45, 5);
  blob(g, [[19, 14, 12], [10, 21, 9], [28, 21, 9], [19, 24, 10]], PINK, 11);
}));
export const bush = memo(() => mk(24, 16, (g) => { blob(g, [[8, 9, 7], [16, 9, 7], [12, 6, 6]], GREEN, 21); }));
export const pine = memo(() => mk(28, 54, (g) => {
  trunk(g, 14, 44, 53, 4);
  const tier = (cy, hw, h, pal) => {
    for (let y = 0; y < h; y++) {
      const half = Math.round((hw * (y + 1)) / h);
      for (let x = -half; x <= half; x++) {
        const px = 14 + x, py = cy + y;
        const edge = Math.abs(x) >= half - 0;
        const t = x < -half * 0.35 ? pal.l : x > half * 0.3 ? pal.d : pal.m;
        R(g, edge && (y === h - 1 || Math.abs(x) === half) ? pal.o : (hash(px, py) < 0.12 ? pal.d : t), px, py, 1, 1);
      }
    }
  };
  tier(24, 12, 22, GREEN); tier(12, 10, 18, GREEN); tier(1, 7, 15, GREEN);
}));
export const rock = memo(() => mk(16, 10, (g) => { blob(g, [[6, 6, 5], [11, 7, 4]], ROCKS, 4); }));
export const flowers = memo(() => mk(18, 10, (g) => {
  blob(g, [[5, 7, 4], [9, 6, 5], [14, 7, 4]], { o: '#1d4030', d: '#3f8548', m: '#5ab25a', l: '#6bbe6b', h: '#8bd97f' }, 8);
  for (const [x, y, c] of [[3, 4, '#ff9eb5'], [8, 2, '#fff7de'], [12, 4, '#ffcb6b'], [15, 6, '#ff9eb5'], [6, 6, '#ffcb6b']]) R(g, c, x, y, 2, 2);
}));

/** A fence post, 8 x 18; the rails between posts are drawn by the view (rail anchors at 14 and 8 px above the foot). */
export const post = memo(() => mk(8, 18, (g) => {
  R(g, INK, 1, 0, 6, 18); R(g, P.w3, 2, 1, 4, 17); R(g, P.w4, 2, 1, 1, 17); R(g, P.w1, 5, 1, 1, 17); R(g, P.w5, 2, 0, 3, 1);
}));
/** A telegraph pole, 20 x 76: foot at the bottom centre; the wires hang from the three insulators. */
export const pole = memo(() => mk(20, 76, (g) => {
  R(g, INK, 8, 8, 5, 68); R(g, P.w2, 9, 8, 3, 68); R(g, P.w3, 9, 8, 1, 68); R(g, P.w1, 11, 8, 1, 68);
  R(g, INK, 0, 7, 21, 4); R(g, P.w3, 1, 8, 19, 2); R(g, P.w4, 1, 8, 19, 1);
  R(g, INK, 3, 17, 15, 3); R(g, P.w3, 4, 18, 13, 1);
  R(g, INK, 8, 5, 5, 3); R(g, P.w3, 9, 6, 3, 1);
  for (const x of [1, 18, 10]) { R(g, INK, x - 1, x === 10 ? 1 : 3, 3, 5); R(g, '#8ccbff', x, x === 10 ? 2 : 4, 1, 3); R(g, '#fff7de', x, x === 10 ? 2 : 4, 1, 1); }
  R(g, INK, 5, 24, 1, 6); R(g, INK, 14, 24, 1, 6);          // the braces
}));
/** Where the wires leave a pole, as offsets from its foot: three anchors. */
export const POLE_WIRES = [[-9, -74], [0, -76], [8, -74]];

export const signal = memo((v) => mk(18, 60, (g) => {
  const red = v === 'red';
  R(g, INK, 7, 20, 4, 40); R(g, '#52597b', 8, 20, 2, 40); R(g, '#7b7d8c', 8, 20, 1, 40);
  R(g, INK, 2, 0, 14, 28); R(g, '#394963', 3, 1, 12, 26); R(g, '#52597b', 3, 1, 12, 1); R(g, '#212839', 12, 2, 3, 24);
  const lamp = (y, on, col, glow) => {
    R(g, INK, 4, y, 10, 7);
    R(g, on ? col : '#2b3350', 5, y + 1, 8, 5); R(g, on ? glow : '#394963', 5, y + 1, 3, 2);
    if (on) R(g, '#ffffff', 6, y + 1, 1, 1);
    R(g, INK, 3, y - 1, 12, 1);                                    // the hood
  };
  lamp(3, red, '#e0485a', '#ffa09a'); lamp(10, false, '#ffcb6b', '#fff3b0'); lamp(17, !red, '#5ad07a', '#c8ffd0');
}));

/** The station: platform, walls, the red roof with a clock gable, lit windows and door. 92 x 66. */
export const station = memo(() => mk(92, 66, (g) => {
  const roof = ['#5a2236', '#8a3042', '#b8484f', '#d96a62', '#f09a8a'];
  // platform (planks)
  R(g, INK, 0, 55, 92, 11);
  for (let x = 0; x < 92; x += 6) { R(g, x % 12 ? P.w3 : P.w2, x + 1, 56, 5, 9); R(g, P.w4, x + 1, 56, 5, 1); }
  R(g, P.w1, 1, 64, 90, 1);
  // walls
  R(g, INK, 12, 22, 70, 34); R(g, P.cream2, 13, 23, 68, 32); R(g, P.cream, 13, 23, 36, 32); R(g, P.cream3, 69, 23, 12, 32);
  R(g, P.s2, 13, 48, 68, 7); R(g, P.s3, 13, 48, 68, 1); R(g, P.s1, 13, 54, 68, 1);
  for (let x = 16; x < 80; x += 8) R(g, P.s1, x, 50, 6, 1);
  // roof: three rows of tiles with an overhang
  for (let i = 0; i < 4; i++) {
    const y = 8 + i * 5, inset = 6 - i * 2;
    R(g, INK, 4 + inset, y, 84 - 2 * inset, 6);
    R(g, roof[2], 5 + inset, y + 1, 82 - 2 * inset, 4);
    R(g, roof[3], 5 + inset, y + 1, 82 - 2 * inset, 1);
    for (let x = 6 + inset; x < 86 - inset; x += 4) R(g, roof[1], x, y + 3, 2, 1);
  }
  R(g, INK, 4, 24, 84, 3); R(g, roof[1], 5, 25, 82, 1);
  // the clock gable
  R(g, INK, 34, 0, 24, 14); R(g, P.cream2, 35, 5, 22, 9); R(g, roof[2], 35, 1, 22, 4); R(g, roof[3], 35, 1, 22, 1);
  R(g, INK, 40, 4, 12, 10); R(g, P.cream, 41, 5, 10, 8);
  R(g, INK, 45, 6, 1, 4); R(g, INK, 45, 9, 3, 1);                 // the hands
  // door and windows
  R(g, INK, 39, 30, 14, 26); R(g, P.w3, 40, 31, 12, 25); R(g, P.w2, 46, 31, 6, 25); R(g, P.w4, 40, 31, 1, 25); R(g, '#ffe89a', 42, 33, 8, 7); R(g, INK, 45, 33, 1, 7); R(g, INK, 42, 36, 8, 1);
  for (const x of [18, 62]) {
    R(g, INK, x - 1, 29, 13, 16); R(g, '#ffe89a', x, 30, 11, 14); R(g, '#fff7de', x, 30, 11, 3); R(g, INK, x + 5, 30, 1, 14); R(g, INK, x, 36, 11, 1);
    R(g, P.w2, x - 2, 44, 15, 2);
  }
  R(g, INK, 14, 26, 64, 1);
}));

// bold, warm colours that stand out from green grass and grey ballast: signal orange, yellow and red (body, shade, light, dark)
const body = { red: ['#ff6a2e', '#c8401a', '#ffa05a', '#7a2410'], blue: ['#ffcf3a', '#d99a14', '#ffe888', '#8a5a08'], teal: ['#e0384a', '#a02034', '#ff7a88', '#5a0f1c'] };
export const TRAIN_COLORS = ['red', 'blue', 'teal'];
export const TRAIN_W = 46, TRAIN_H = 50;
/** The front of a train, 46 x 50, head on, with lit headlights and a hazard-striped bumper (the game's own engine: a boxy diesel). */
export const trainFront = memo((color) => mk(TRAIN_W, TRAIN_H, (g) => {
  const [m, d, l, dd] = body[color] || body.red;
  // roof cap
  R(g, INK, 3, 0, 40, 5); R(g, '#9aa3b8', 4, 1, 38, 3); R(g, '#d6dcec', 4, 1, 38, 1); R(g, '#7b7d8c', 4, 3, 38, 1);
  // body
  R(g, INK, 0, 4, 46, 40); R(g, m, 1, 5, 44, 38); R(g, l, 1, 5, 3, 36); R(g, d, 41, 5, 4, 38); R(g, l, 4, 5, 38, 1);
  // windscreens
  for (const x of [5, 25]) {
    R(g, INK, x, 8, 16, 15); R(g, '#1d2c50', x + 1, 9, 14, 13); R(g, '#2f4a7a', x + 1, 13, 14, 9); R(g, '#3f63a0', x + 1, 18, 14, 4);
    for (const [gx, gy, gl] of [[3, 0, 4], [9, 0, 3], [2, 6, 3]]) for (let i = 0; i < gl; i++) R(g, '#8ccbff', x + gx + i + 1, 9 + gy + (gl - i), 1, 1);
    R(g, INK, x + 7, 8, 2, 2);
  }
  // destination lamp
  R(g, INK, 18, 4, 10, 6); R(g, '#ffcb6b', 19, 5, 8, 4); R(g, '#fff7de', 19, 5, 8, 1);
  // lower face: grille between the lights
  R(g, d, 2, 24, 42, 14); R(g, dd, 14, 26, 18, 11);
  for (let x = 15; x < 31; x += 3) { R(g, INK, x, 27, 1, 9); R(g, '#7b7d8c', x + 1, 27, 1, 9); }
  R(g, INK, 14, 26, 18, 1); R(g, '#cfd6e8', 14, 37, 18, 1);
  R(g, P.cream, 20, 38, 6, 3); R(g, INK, 21, 39, 4, 1);
  // headlights, lit: a halo, the lens and a hot centre
  for (const hx of [8, 38]) {
    R(g, '#ffe89a', hx - 5, 25, 11, 11); R(g, INK, hx - 4, 25, 9, 11); R(g, INK, hx - 5, 26, 11, 9);
    R(g, '#fff3b0', hx - 3, 27, 7, 7); R(g, '#ffffff', hx - 2, 28, 5, 5); R(g, '#fff3b0', hx - 3, 28, 1, 5); R(g, '#fff3b0', hx + 3, 28, 1, 5);
  }
  // hazard bumper
  R(g, INK, 0, 40, 46, 7);
  for (let x = 1; x < 45; x++) for (let y = 41; y < 46; y++) R(g, ((x + y) >> 2) & 1 ? '#ffcb6b' : INK, x, y, 1, 1);
  R(g, INK, 0, 46, 46, 1);
  // buffers and the coupling
  for (const bx of [4, 36]) { R(g, INK, bx, 46, 8, 4); R(g, '#9aa3b8', bx + 1, 46, 6, 3); R(g, '#ffffff', bx + 1, 46, 2, 1); }
  R(g, INK, 21, 46, 4, 4);
}));

/** The coin, four frames of a spin, 14 x 16. */
export const coin = memo((f) => mk(14, 16, (g) => {
  const widths = [12, 9, 4, 9], w = widths[Number(f) % 4], x0 = Math.floor((14 - w) / 2);
  R(g, '#8a4426', x0, 1, w, 14); R(g, '#8a4426', x0 + 1, 0, Math.max(0, w - 2), 16);
  R(g, '#ffcb6b', x0 + 1, 2, Math.max(1, w - 2), 12); R(g, '#ffe89a', x0 + 1, 2, Math.max(1, Math.floor((w - 2) / 2)), 10);
  if (w >= 9) { R(g, '#e0a030', x0 + w - 3, 4, 1, 9); R(g, '#fff7de', x0 + 2, 3, 1, 4); R(g, '#d67139', x0 + 4, 5, w - 8, 1); R(g, '#d67139', x0 + 4, 10, w - 8, 1); R(g, '#e0a030', x0 + 5, 6, w - 10, 4); }
}));

/** The rail cart seen from behind, 40 x 22 (wheel phase 0 | 1): a wooden box with steel rim and straps and a red tail lamp. The pet sits behind its rim. */
export const cart = memo((phase) => mk(40, 22, (g) => {
  for (const wx of [3, 29]) {                                       // wheels under the box
    R(g, INK, wx, 15, 8, 7); R(g, '#52597b', wx + 1, 16, 6, 5); R(g, '#9aa3b8', wx + 1, 16, 6, 1); R(g, '#9aa3b8', wx + 2 + Number(phase), 17, 1, 3); R(g, INK, wx + 3, 18, 2, 2);
  }
  R(g, INK, 1, 3, 38, 16); R(g, P.w3, 2, 4, 36, 14);               // box
  for (let x = 2; x < 38; x += 6) { R(g, P.w4, x, 4, 5, 14); R(g, P.w2, x + 4, 4, 1, 14); R(g, P.w1, x + 5, 4, 1, 14); }
  R(g, P.w1, 2, 16, 36, 2); R(g, INK, 2, 18, 36, 1);
  for (const sx of [7, 30]) { R(g, INK, sx - 1, 4, 5, 14); R(g, '#7b7d8c', sx, 4, 3, 14); R(g, '#ced7de', sx, 4, 1, 14); R(g, '#ced7de', sx + 1, 7, 1, 1); R(g, '#ced7de', sx + 1, 13, 1, 1); }
  R(g, INK, 0, 0, 40, 6); R(g, '#7b7d8c', 1, 1, 38, 4); R(g, '#ced7de', 1, 1, 38, 1); R(g, '#52597b', 1, 4, 38, 1);   // the rim
  for (let x = 4; x < 38; x += 7) R(g, '#ced7de', x, 2, 2, 1);
  R(g, INK, 17, 8, 7, 7); R(g, '#a8404a', 18, 9, 5, 5); R(g, '#ff6a5a', 18, 9, 5, 3); R(g, '#ffd0c0', 19, 9, 2, 1); R(g, INK, 18, 7, 5, 1);
  R(g, INK, 16, 18, 9, 4); R(g, '#7b7d8c', 17, 18, 7, 2);          // the hitch
}));

/** A wooden arrow board for the left / right hints, 40 x 26, plain arrow, no numbers. */
export const arrowSign = memo((dir) => mk(40, 26, (g, w, h) => {
  const left = dir === 'left';
  const shape = (x, y) => {
    const nx = left ? x : w - 1 - x;                               // pointing left: the tip at x = 0
    const mid = (h - 1) / 2;
    if (nx < 12) return Math.abs(y - mid) <= (nx + 1) * (mid / 12) + 0.4;
    return y >= 3 && y <= h - 4;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!shape(x, y)) continue;
    const edge = !shape(x - 1, y) || !shape(x + 1, y) || !shape(x, y - 1) || !shape(x, y + 1);
    R(g, edge ? INK : (!shape(x, y - 1) || !shape(x - 1, y - 1) ? P.w4 : P.w3), x, y, 1, 1);
    if (!edge && (y >= h - 6)) R(g, P.w2, x, y, 1, 1);
  }
  R(g, INK, left ? 14 : 8, 9, 18, 8);                               // the arrow glyph: a bar and a chevron head
  R(g, P.cream, left ? 15 : 9, 11, 16, 4);
  for (let i = 0; i < 5; i++) { const x = left ? 11 - i + 1 : w - 12 + i - 1; R(g, INK, x, 12 - i - 1 + 1, 1, 1 + 2 * i + 2); R(g, P.cream, x + (left ? 1 : -1), 12 - i, 1, 1 + 2 * i); }
}));

export const cloud = memo((v) => mk(46, 18, (g) => {
  const big = Number(v) === 1;
  blob(g, big ? [[10, 11, 7], [20, 8, 8], [31, 10, 7], [38, 12, 5], [22, 12, 7]] : [[9, 11, 6], [18, 9, 7], [28, 11, 6]], { o: '#9ac0e6', d: '#bcd8f2', m: '#e0efff', l: '#f4faff', h: '#ffffff' }, 6);
}));

/** A skateboard for the game menu's second card, 46 x 50: side view, a kicked deck, bright wheels, a moon and a star behind. */
export const skateIcon = memo(() => mk(46, 50, (g) => {
  R(g, '#2c3282', 0, 0, 46, 36);
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 36) R(g, x + y > 2 ? '#d8d6f0' : '#f6f4ff', 33 + x, 11 + y, 1, 1);
  R(g, '#fff7de', 6, 6, 1, 1); R(g, '#fff7de', 12, 14, 1, 1); R(g, '#b8bcf0', 20, 4, 1, 1);
  R(g, '#383d6a', 0, 36, 46, 14); R(g, '#6f74aa', 0, 36, 46, 2);
  R(g, 'rgba(0,0,0,0.3)', 6, 46, 34, 3);
  for (const x of [9, 31]) { R(g, INK, x, 36, 9, 9); R(g, '#e0485a', x + 1, 37, 7, 7); R(g, '#ff9eb5', x + 1, 37, 7, 2); R(g, INK, x + 3, 39, 3, 3); R(g, '#ffd0c0', x + 4, 40, 1, 1); }
  R(g, INK, 14, 33, 18, 4); R(g, '#7b7d8c', 15, 33, 16, 2);
  for (let x = 0; x < 42; x++) { const kick = x < 6 ? 6 - x : x > 35 ? x - 35 : 0, y = 28 - Math.round(kick * 0.9); R(g, INK, 2 + x, y, 1, 7); R(g, '#1f6f78', 2 + x, y + 1, 1, 4); R(g, '#4ec9c0', 2 + x, y + 1, 1, 1); R(g, '#154a58', 2 + x, y + 4, 1, 1); }
  for (const x of [14, 22, 30]) R(g, '#ffcb6b', x, 31, 3, 1);
}));

/** A rail switch stand: a short post with a lever box and a lamp, 14 x 26. */
export const switchStand = memo(() => mk(14, 26, (g) => {
  R(g, INK, 6, 8, 3, 18); R(g, '#52597b', 7, 9, 1, 17);
  R(g, INK, 2, 14, 11, 8); R(g, '#7b7d8c', 3, 15, 9, 6); R(g, '#ced7de', 3, 15, 9, 1); R(g, '#52597b', 3, 20, 9, 1);
  R(g, INK, 1, 2, 12, 9); R(g, '#394963', 2, 3, 10, 7); R(g, '#5ad07a', 4, 4, 6, 5); R(g, '#c8ffd0', 4, 4, 2, 2);
  R(g, INK, 0, 24, 14, 2);
}));
