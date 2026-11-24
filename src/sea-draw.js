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

/**
 * A surfboard lying on the water, seen from above and a little from the side: pointed at both ends, a stripe down the middle. (cx, cy) is its middle on the surface, `u` the size
 * of an art pixel, `squash` the tilt of the ground (the board gets thinner the lower the camera), `tilt` -1..1 turns one end up for a board that tumbles after a wipeout.
 */
export function drawBoard(c, cx, cy, u, { squash = 0.6, night = 0, tilt = 0 } = {}) {
  const rows = Math.max(4, Math.round(9 * Math.min(1, squash * 1.3))), L = 13;
  for (let j = 0; j < rows; j++) {
    const t = ((j + 0.5) / rows) * 2 - 1, hw = Math.max(2, Math.round(L * Math.sqrt(1 - t * t * 0.85))), y = Math.round(cy + (j - rows / 2) * u + tilt * (j - rows / 2) * u * 0.5);
    c.fillStyle = dim('#312439', night); c.fillRect(Math.round(cx - (hw + 1) * u), y, Math.round((hw * 2 + 2) * u), Math.max(1, Math.round(u)));
    c.fillStyle = dim(j === (rows >> 1) ? '#e0485a' : j === 0 || j === rows - 1 ? '#c9b8a0' : '#fff0c8', night);
    c.fillRect(Math.round(cx - hw * u), y, Math.round(hw * 2 * u), Math.max(1, Math.round(u)));
  }
}
