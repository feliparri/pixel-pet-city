// The town's palette and the small drawing helpers every tile uses. The colours extend the pets' palette (assets/pets.png): the same
// plum-black outline, the same leaf greens, cream and warm browns, the game's navy for iron and stone; each ramp has 5-6 steps.

export const P = {
  ink: '#312439', ink2: '#212839', navy: '#394963', plum: '#5a4973',
  // greens: g0 deepest shade ... g5 highlight; g3 is the grass
  g0: '#295d39', g1: '#3f8548', g2: '#5ab25a', g3: '#6bbe6b', g4: '#8bd97f', g5: '#b9ee9c', gOut: '#1d4030',
  // dirt
  d0: '#a8804c', d1: '#c09a62', d2: '#d9b87a', d3: '#e8cf9a', d4: '#f4e2b8',
  // stone
  s0: '#52597b', s1: '#7b7d8c', s2: '#9a9fb0', s3: '#b5bac6', s4: '#ced7de', s5: '#efeff7',
  // wood
  w0: '#4a2a1c', w1: '#6b3421', w2: '#8f4a28', w3: '#b8683a', w4: '#d68e5a', w5: '#ffba73',
  // water
  a0: '#2f5fa8', a1: '#4a8ad8', a2: '#6bb0f0', a3: '#8ccbff', a4: '#d6efff',
  // cream, sand, warm accents
  cream: '#fff7de', cream2: '#ffdfad', cream3: '#efd3bd', cream4: '#c6a294', sand: '#e8d8a0',
  yellow: '#ffcb6b', yellow2: '#ffe89a', red: '#e0485a', red2: '#a8404a', pink: '#ff9eb5', orange: '#d67139', lilac: '#b8a0e0',
  glass: '#8ccbff', glassHi: '#d6efff',
};

/** Roof ramps, dark to light: [outline-ish, shade, base, light, ridge]. */
export const ROOFS = {
  red: ['#5a2236', '#8a3042', '#b8484f', '#d96a62', '#f09a8a'],
  blue: ['#252f55', '#34457a', '#4a63a0', '#6a84c0', '#9ab4e0'],
  teal: ['#1d4a4a', '#2a6a62', '#3f8c7c', '#62b09a', '#94d4bc'],
  plum: ['#3a2a5a', '#554080', '#7458a4', '#9478c4', '#b8a0e0'],
  orange: ['#5a2a1c', '#8a4426', '#b8642e', '#d68a46', '#f0b068'],
};

export const noise = (x, y, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1274126177 | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
};

export const rect = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
export const dot = (ctx, c, x, y) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
export const mix = (a, b, t) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Stamp an ASCII sprite: `rows` are equal-length strings, `key` maps a char to a colour ('.' and ' ' are transparent). */
export function stamp(ctx, rows, key, x, y, flip = false) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = key[row[i]];
      if (c) dot(ctx, c, x + (flip ? row.length - 1 - i : i), y + j);
    }
  });
}

/** Paint every pixel of a w x h box for which inside(x, y) holds; colour(x, y, edge) picks it. `edge` is true on the outline ring (outside, touching the shape). */
export function shape(ctx, x0, y0, w, h, inside, colour, outline = null) {
  const hit = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (hit(x, y)) dot(ctx, colour(x, y), x0 + x, y0 + y);
    else if (outline && (hit(x - 1, y) || hit(x + 1, y) || hit(x, y - 1) || hit(x, y + 1))) dot(ctx, outline, x0 + x, y0 + y);
  }
}

/** A soft cast shadow: two stepped ellipses of translucent ink. */
export function shadow(ctx, cx, cy, rx, ry, a = 0.3) {
  for (const [k, al] of [[1, a * 0.55], [0.68, a * 0.55]]) {
    ctx.fillStyle = `rgba(33,40,57,${al})`;
    const rrx = rx * k, rry = Math.max(1, ry * k);
    for (let y = -Math.round(rry); y <= Math.round(rry); y++) {
      const hw = Math.round(rrx * Math.sqrt(Math.max(0, 1 - (y / rry) ** 2)));
      ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2, 1);
    }
  }
}
