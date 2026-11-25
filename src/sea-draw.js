// What a pet in the water looks like, drawn with plain squares so it works in both renderers (and under WebGL): expanding rings on the surface round a swimming pet, a
// small ring for one wading, and foam behind one that is moving. The surfboard of a surfing pet is drawn here too. Everything is in screen px of the caller's choice:
// (cx, cy) is the surface point under the pet's body and `u` the size of one art pixel.

const FOAM = [234, 247, 255];
const dots = (c, cx, cy, rx, ry, n, u, a, night, phase = 0) => {
  c.fillStyle = `rgba(${FOAM[0]},${FOAM[1]},${FOAM[2]},${Math.max(0, a * (1 - 0.45 * night))})`;
  const d = Math.max(1, Math.round(u * 1.1));
  for (let i = 0; i < n; i++) {
    const t = ((i + phase) / n) * Math.PI * 2;
    c.fillRect(Math.round(cx + Math.cos(t) * rx - d / 2), Math.round(cy + Math.sin(t) * ry - d / 2), d, d);
  }
};

/**
 * Rings on the water round a pet. `depth` 'deep' (two rings out of step) or 'shallow' (one small one); `moving`: foam trails behind it, away from `d` (the way it faces);
 * `squash` the tilt of the ground (about 0.5 in the tilted view, 1 flat), `night` 0..1 dims the foam.
 */
export function drawWake(c, cx, cy, u, { depth, moving, d, squash = 0.5, now, night = 0, seed = 0, paddle = false }) {
  const t = now / 700 + seed * 0.37;
  if (depth === 'shallow') {
    const p = t % 1;
    dots(c, cx, cy, (5 + 4 * p) * u, (5 + 4 * p) * u * squash, 10, u, 0.6 * (1 - p), night);
  } else {
    for (const k of [0, 0.5]) { const p = (t + k) % 1; dots(c, cx, cy, (6 + 9 * p) * u, (6 + 9 * p) * u * squash, 14, u, 0.95 * (1 - p), night, k * 5); }
  }
  if (paddle && moving) {                                                  // the strokes of the paddling arms: a splash at each side, one after the other
    const side = Math.floor(now / 220) % 2 ? 1 : -1, dd = Math.max(1, Math.round(u * 1.4));
    c.fillStyle = `rgba(${FOAM[0]},${FOAM[1]},${FOAM[2]},${0.9 * (1 - 0.45 * night)})`;
    for (let k = 0; k < 3; k++) c.fillRect(Math.round(cx + side * (9 + k * 2) * u - dd / 2), Math.round(cy + (k - 1) * u * squash * 2 - dd / 2), dd, dd);
  }
  if (moving) {
    const away = d === 'left' ? 1 : d === 'right' ? -1 : 0, vert = d === 'up' ? 1 : d === 'down' ? -1 : 0;
    c.fillStyle = `rgba(${FOAM[0]},${FOAM[1]},${FOAM[2]},${0.7 * (1 - 0.45 * night)})`;
    const dd = Math.max(1, Math.round(u));
    for (let k = 1; k <= 4; k++) {
      const bx = cx + away * k * 3.2 * u, by = cy + vert * k * 1.6 * u * squash * 2;
      c.fillRect(Math.round(bx - dd / 2), Math.round(by - u * (k % 2 ? 1.3 : 0.2) - dd / 2), dd, dd);
      c.fillRect(Math.round(bx - dd / 2 + (vert ? 3 * u : 0)), Math.round(by + u * (k % 2 ? 0.2 : 1.3) - dd / 2), dd, dd);
    }
  }
}

const dim = (hex, night) => {
  const k = 1 - 0.45 * night, n = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k));
  return `rgb(${n[0]},${n[1]},${n[2]})`;
};

export const BOARD_HALF = 22;           // half the length of the board in art px: a longboard, 44 px long (it was 26)

/**
 * A longboard lying on the water, seen from above and a little from the side: a rounded nose on the right, a stripe down the middle, a narrower tail with a fin hint under it.
 * (cx, cy) is its middle on the surface, `u` the size of an art pixel, `squash` the tilt of the ground (the board gets thinner the lower the camera), `tilt` -1..1 turns one end up
 * for a board that tumbles after a wipeout.
 */
export function drawBoard(c, cx, cy, u, { squash = 0.6, night = 0, tilt = 0, slope = 0 } = {}) {
  const rows = Math.max(4, Math.round(9 * Math.min(1, squash * 1.3))), L = BOARD_HALF, px = Math.max(1, Math.round(u));
  for (let i = -L; i <= L; i++) {
    const nose = i > L * 0.55 ? Math.sqrt(Math.max(0, 1 - ((i - L * 0.55) / (L * 0.45)) ** 2)) : 1;
    const tail = i < -L * 0.45 ? 0.5 + 0.5 * ((i + L) / (L * 0.55)) : 1;
    const half = Math.max(1, (rows / 2) * Math.min(nose, tail) + 0.5), top = cy - half * u + tilt * i * u * 0.12 + slope * i * u, h = Math.max(px, Math.round(half * 2 * u));
    const x = Math.round(cx + i * u);
    c.fillStyle = dim('#312439', night); c.fillRect(x, Math.round(top - px), px, h + 2 * px);                   // the outline
    c.fillStyle = dim(i > L * 0.8 ? '#fff6e2' : '#fff0c8', night); c.fillRect(x, Math.round(top), px, h);        // the deck
    c.fillStyle = dim('#c9b8a0', night); c.fillRect(x, Math.round(top + h - px), px, px);                         // the shaded rail
    if (i > -L * 0.7 && i < L * 0.8) { c.fillStyle = dim('#e0485a', night); c.fillRect(x, Math.round(top + h / 2 - px / 2), px, px); }   // the stripe
  }
  c.fillStyle = dim('#312439', night);
  for (let k = 0; k < 4; k++) c.fillRect(Math.round(cx + (-L + 3 + k) * u), Math.round(cy + rows * 0.5 * u + (k % 2 ? px : 0) - slope * L * u), px, px * 2);   // the fin hint at the tail
}

const hashN = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 0x45d9f3b); h ^= h >>> 15; return (h >>> 0) / 4294967295; };
/**
 * White spray and foam round a board that is riding a wave: bits flung up from the tail (the high end of the tilted board) and from its edges, redrawn a few times a second.
 * Same arguments as drawBoard (`slope` the board's tilt); squares only.
 */
export function drawRideSpray(c, cx, cy, u, { now = 0, night = 0, slope = 0, squash = 0.6 } = {}) {
  const L = BOARD_HALF, step = Math.floor(now / 130), px = Math.max(1, Math.round(u));
  c.fillStyle = `rgba(255,255,255,${0.95 * (1 - 0.4 * night)})`;
  const tailX = cx - L * u, tailY = cy - slope * L * u, noseX = cx + L * u, noseY = cy + slope * L * u;
  for (let k = 0; k < 9; k++) {                                                         // the tail: a plume thrown up and back
    const h = hashN(k, step), g = hashN(k + 40, step);
    c.fillRect(Math.round(tailX - (1 + g * 7) * u), Math.round(tailY - (h * 9) * u * squash * 1.4), px * (1 + (k % 3 === 0 ? 1 : 0)), px);
  }
  for (let k = 0; k < 6; k++) {                                                         // along the lower edge: foam
    const h = hashN(k + 80, step), x = cx + (-0.9 + (k / 5) * 1.8) * L * u, y = cy + slope * (-0.9 + (k / 5) * 1.8) * L * u;
    c.fillRect(Math.round(x), Math.round(y + (2.5 + h * 2) * u * squash), px * 2, px);
  }
  for (let k = 0; k < 4; k++) { const h = hashN(k + 120, step); c.fillRect(Math.round(noseX + (1 + h * 4) * u), Math.round(noseY - (h * 5) * u * squash), px, px); }   // a few drops at the nose
}
