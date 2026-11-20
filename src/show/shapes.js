// The outlines of the festive firework shapes (star, Christmas tree, snowflake, gift, double heart) as unit spark directions in the burst's plane
// (x right, z up, both about -1..1): [vx, vy, vz, ring 0|1, glitter 0|1], the same tuples as the classic shapes in fireworks.js. Pure and deterministic:
// no seed is needed because the outline is the picture.

/** `n` points spread evenly along a closed (or open) polyline of [x, z] vertices. */
export function sample(poly, n, closed = true) {
  const pts = closed ? [...poly, poly[0]] : poly, lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
  const out = [], step = total / (closed ? n : Math.max(1, n - 1));
  let seg = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const want = k * step;
    while (seg < lens.length - 1 && acc + lens[seg] < want) acc += lens[seg++];
    const f = lens[seg] ? Math.min(1, (want - acc) / lens[seg]) : 0;
    out.push([pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * f, pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * f]);
  }
  return out;
}

const dir = (x, z, ring = 0, glit = 0) => [x, 0, z, ring, glit];
const polar = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];                       // angle 0 points up, clockwise

/** A five-pointed star, one point up. */
export function starDirs() {
  const poly = [];
  for (let i = 0; i < 10; i++) poly.push(polar(i % 2 ? 0.42 : 1, (i * Math.PI) / 5));
  return sample(poly, 60).map(([x, z], i) => dir(x, z + 0.08, 0, i % 6 === 0 ? 1 : 0));
}

/** A tiered Christmas tree with a trunk and a bright point for the star on top. */
export function treeDirs() {
  const poly = [[0, 0.95], [-0.38, 0.42], [-0.2, 0.42], [-0.62, -0.12], [-0.3, -0.12], [-0.82, -0.66], [-0.14, -0.66], [-0.14, -0.96], [0.14, -0.96], [0.14, -0.66], [0.82, -0.66], [0.3, -0.12], [0.62, -0.12], [0.2, 0.42], [0.38, 0.42]];
  const out = sample(poly, 66).map(([x, z]) => dir(x, z + 0.05, z < -0.64 ? 1 : 0, 0));
  for (let k = 0; k < 4; k++) out.push(dir((k - 1.5) * 0.09, 1.08 + (k % 2) * 0.05, 1, 1));         // the star on the top
  return out;
}

/** A six-armed snowflake: a stem with two pairs of branches on every arm. */
export function snowflakeDirs() {
  const out = [];
  for (let arm = 0; arm < 6; arm++) {
    const a = (arm * Math.PI) / 3, [ux, uz] = polar(1, a);
    for (const r of [0.2, 0.4, 0.6, 0.8, 1]) out.push(dir(ux * r, uz * r, 0, r === 1 ? 1 : 0));
    for (const at of [0.5, 0.78]) for (const side of [-1, 1]) {
      const [bx, bz] = polar(1, a + side * (Math.PI / 3));
      for (const l of [0.12, 0.24]) out.push(dir(ux * at + bx * l, uz * at + bz * l, 1, 0));
    }
  }
  return out;
}

/** A wrapped gift: the box, a ribbon cross and a two-loop bow on top. */
export function giftDirs() {
  const box = [[-0.7, -0.75], [0.7, -0.75], [0.7, 0.45], [-0.7, 0.45]];
  const out = sample(box, 36).map(([x, z]) => dir(x, z, 0, 0));
  for (let k = 0; k < 7; k++) { const s = -0.7 + (k * 1.4) / 6; out.push(dir(0, -0.75 + ((s + 0.7) / 1.4) * 1.2, 1, 0)); }
  for (let k = 0; k < 7; k++) out.push(dir(-0.7 + (k * 1.4) / 6, -0.15, 1, 0));
  for (const side of [-1, 1]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; out.push(dir(side * 0.3 + Math.cos(a) * 0.22, 0.67 + Math.sin(a) * 0.2, 1, k % 4 === 0 ? 1 : 0)); }
  return out;
}

const heart = (n, sc, ox, oz, ring) => {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, s = Math.sin(a);
    out.push(dir(ox + ((16 * s * s * s) / 17) * sc, oz + ((13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17 + 0.12) * sc, ring, 0));
  }
  return out;
};
/** Two hearts side by side, the right one a little higher and in the second colour. */
export const doubleHeartDirs = () => [...heart(40, 0.62, -0.42, -0.08, 0), ...heart(40, 0.62, 0.42, 0.12, 1)];

export const SHAPE_DIRS = { star: starDirs, tree: treeDirs, snowflake: snowflakeDirs, gift: giftDirs, heart2: doubleHeartDirs };
export const NEW_SHAPES = Object.keys(SHAPE_DIRS);
const memo = new Map();
/** The directions of a festive shape (built once). */
export const festiveDirs = (shape) => { let d = memo.get(shape); if (!d) { d = SHAPE_DIRS[shape](); memo.set(shape, d); } return d; };
