// The game places of the Parque, drawn in the town's palette: the pad a pet stands on, the gallinero's gate and coop, the cancha's pitch
// and goals, the pista's lanes, hurdles and puddles. Ground functions paint one 16 px tile at (x, y); `at(dx, dy)` answers the neighbours' chars.
import { P, noise, rect, dot, shadow, canvas } from './palette.js';
import * as G from './ground.js';
import { PITCH, GOAL } from '../map.js';

/** The pad: a round stepping stone with a gold ring, so it reads as "stand here". */
export function pad(ctx, x, y, tx, ty) {
  G.grass(ctx, x, y, tx, ty);
  const cx = x + 8, cy = y + 8;
  for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
    const d = Math.hypot(i + 0.5, j + 0.5);
    if (d > 7.2) continue;
    dot(ctx, d > 6.2 ? P.ink : d > 5.2 ? P.yellow : d > 4.4 ? P.d0 : (i + j) % 2 ? P.s3 : P.s4, cx + i, cy + j);
  }
  for (const [i, j] of [[-1, -1], [0, -1], [-1, 0]]) dot(ctx, P.s5, cx + i, cy + j);
}

/** The open gate: two posts and the leaf swung open to one side. */
export function gate(ctx, x, y, tx, ty) {
  G.grass(ctx, x, y, tx, ty);
  for (const px of [1, 12]) {
    rect(ctx, P.ink, x + px, y + 3, 3, 13); rect(ctx, P.w2, x + px + 1, y + 4, 1, 11); rect(ctx, P.w4, x + px, y + 4, 1, 11); rect(ctx, P.w4, x + px + 1, y + 3, 1, 1);
  }
  rect(ctx, P.ink, x + 3, y + 9, 1, 5); rect(ctx, P.w3, x + 3, y + 10, 1, 4);                          // the leaf, open against the post
  rect(ctx, P.ink, x + 4, y + 10, 1, 1);
  shadow(ctx, x + 8, y + 15, 7, 1.5, 0.22);
}

/** Is the world pixel (wx, wy) on a line of the pitch (2 px wide): the border, the halfway line, the centre circle and the two goal areas? */
function pitchLine(wx, wy) {
  const T = 16, x0 = PITCH.x * T, y0 = PITCH.y * T, x1 = (PITCH.x + PITCH.w) * T, y1 = (PITCH.y + PITCH.h) * T;
  if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) return false;
  if (wx < x0 + 2 || wx >= x1 - 2 || wy < y0 + 2 || wy >= y1 - 2) return true;                        // the border
  const cy = (y0 + y1) / 2, cx = (x0 + x1) / 2;
  if (wy >= cy - 1 && wy < cy + 1) return true;                                                      // halfway
  if (Math.abs(Math.hypot(wx + 0.5 - cx, wy + 0.5 - cy) - 36) < 1.1) return true;                    // centre circle
  const ax0 = (GOAL.x0 - 2) * T, ax1 = (GOAL.x1 + 2) * T, depth = 4 * T;                              // the goal areas: 2 tiles wider than the mouth, 4 deep
  const inX = wx >= ax0 - 1 && wx < ax1 + 1, side = (wx >= ax0 - 1 && wx < ax0 + 1) || (wx >= ax1 - 1 && wx < ax1 + 1);
  if (inX && wy < y0 + depth + 1 && (side || wy >= y0 + depth - 1)) return true;
  if (inX && wy >= y1 - depth - 1 && (side || wy < y1 - depth + 1)) return true;
  return false;
}

/** Mowed grass in horizontal stripes with the white lines (see pitchLine). */
export function pitch(ctx, x, y, tx, ty) {
  rect(ctx, ty % 2 ? P.g3 : P.g2, x, y, 16, 16);
  for (let i = 0; i < 4; i++) dot(ctx, ty % 2 ? P.g4 : P.g1, x + ((noise(tx, ty, 80 + i) * 15) | 0), y + ((noise(tx, ty, 90 + i) * 15) | 0));
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (pitchLine(tx * 16 + i, ty * 16 + j)) dot(ctx, P.cream, x + i, y + j);
}

/**
 * A tile of a goal seen from above: a net with a post along each side and a bar at the far end, open towards the pitch
 * (`side` -1 for the north goal, whose pitch lies to the south, 1 for the south goal). `at(dx, dy)` answers the neighbours' chars.
 */
export function goal(ctx, x, y, tx, ty, at, side) {
  rect(ctx, P.g3, x, y, 16, 16);
  const left = at(-1, 0) !== 'g', right = at(1, 0) !== 'g', far = side < 0 ? at(0, -1) !== 'g' : at(0, 1) !== 'g';
  rect(ctx, P.ink, x, y, 16, 16); rect(ctx, P.s5, x + (left ? 2 : 0), y + (far && side < 0 ? 2 : 0), 16 - (left ? 2 : 0) - (right ? 2 : 0), 16 - (far ? 2 : 0));
  for (let j = 1; j < 16; j += 3) rect(ctx, P.s3, x + (left ? 2 : 0), y + j, 16 - (left ? 2 : 0) - (right ? 2 : 0), 1);               // the net
  for (let i = 1; i < 16; i += 3) rect(ctx, P.s3, x + i, y + (far && side < 0 ? 2 : 0), 1, 16 - (far ? 2 : 0));
  if (left) { rect(ctx, P.ink, x, y, 3, 16); rect(ctx, P.cream, x + 1, y, 1, 16); }
  if (right) { rect(ctx, P.ink, x + 13, y, 3, 16); rect(ctx, P.cream, x + 14, y, 1, 16); }
  if (far) { const fy = side < 0 ? y : y + 13; rect(ctx, P.ink, x, fy, 16, 3); rect(ctx, P.cream, x + (left ? 1 : 0), fy + 1, 16 - (left ? 1 : 0) - (right ? 1 : 0), 1); }
}

const BALL = ['..kkk..', '.kwwwk.', 'kwwkwwk', 'kwkkkwk', 'kwwkwwk', '.kwwwk.', '..kkk..'];
/** The football, 7 x 7 px, centred on (cx, cy) with its shadow on the grass. */
export function ball(ctx, cx, cy) {
  shadow(ctx, cx, cy + 4, 4, 1.2, 0.35);
  BALL.forEach((row, j) => { for (let i = 0; i < 7; i++) if (row[i] !== '.') dot(ctx, row[i] === 'k' ? P.ink : '#ffffff', cx - 3 + i, cy - 3 + j); });
}

/** One lane of the pista: packed earth with a lighter lane line and a darker rim on the outer sides. */
export function track(ctx, x, y, tx, ty, at) {
  rect(ctx, P.d1, x, y, 16, 16);
  for (let i = 0; i < 7; i++) dot(ctx, noise(tx, ty, 100 + i) > 0.5 ? P.d0 : P.d2, x + ((noise(tx, ty, 110 + i) * 15) | 0), y + ((noise(tx, ty, 120 + i) * 15) | 0));
  if (at(0, -1) !== 'j' && at(0, -1) !== 'V' && at(0, -1) !== 'w') rect(ctx, P.cream, x, y, 16, 2); else if ((tx & 1) === 0) rect(ctx, P.d3, x + 2, y, 6, 1);
  if (at(0, 1) !== 'j' && at(0, 1) !== 'V' && at(0, 1) !== 'w') rect(ctx, P.cream, x, y + 14, 16, 2);
  if (at(-1, 0) !== 'j' && at(-1, 0) !== 'V' && at(-1, 0) !== 'w') rect(ctx, P.cream, x, y, 2, 16);        // the start line
}

/** A hurdle across a lane: two posts and a striped bar. */
export function hurdle(ctx, x, y, tx, ty, at) {
  track(ctx, x, y, tx, ty, at);
  shadow(ctx, x + 8, y + 14, 6, 1.5, 0.28);
  for (const px of [3, 11]) { rect(ctx, P.ink, x + px, y + 5, 3, 10); rect(ctx, P.w3, x + px + 1, y + 6, 1, 8); }
  rect(ctx, P.ink, x + 2, y + 6, 12, 5);
  for (let i = 0; i < 5; i++) { rect(ctx, i % 2 ? P.cream : P.red, x + 3 + i * 2, y + 7, 2, 3); }
}

/** A puddle on a lane: a rippled blob of water. */
export function puddle(ctx, x, y, tx, ty, at) {
  track(ctx, x, y, tx, ty, at);
  const inside = (i, j) => ((i - 8) / 6.5) ** 2 + ((j - 9) / 4) ** 2 <= 1;
  for (let j = 4; j < 15; j++) for (let i = 1; i < 15; i++) {
    if (inside(i, j)) dot(ctx, j < 8 ? P.a1 : P.a2, x + i, y + j);
    else if (inside(i - 1, j) || inside(i + 1, j) || inside(i, j - 1) || inside(i, j + 1)) dot(ctx, P.d0, x + i, y + j);
  }
  rect(ctx, P.a3, x + 5, y + 9, 3, 1); rect(ctx, P.a4, x + 9, y + 8, 2, 1); dot(ctx, P.a4, x + 6, y + 10);
}

/** The coop, 32 x 40 (two tiles wide, two tall plus the roof): a red-roofed hut with a round door and a perch. */
export function coop() {
  const c = canvas(32, 40), ctx = c.getContext('2d');
  rect(ctx, P.ink, 1, 18, 30, 22); rect(ctx, P.w3, 2, 19, 28, 20);                                       // walls: planks
  for (let i = 5; i < 30; i += 4) rect(ctx, P.w2, i, 19, 1, 20);
  rect(ctx, P.w4, 2, 19, 28, 1); rect(ctx, P.w1, 2, 38, 28, 1);
  rect(ctx, P.ink, 11, 24, 10, 15); rect(ctx, P.w0, 12, 25, 8, 14); rect(ctx, P.ink, 14, 28, 4, 4); rect(ctx, P.yellow2, 15, 29, 2, 2);   // the pop hole
  rect(ctx, P.w2, 11, 36, 10, 1); rect(ctx, P.w3, 11, 37, 10, 1);                                         // the ramp
  const roof = ['#5a2236', '#8a3042', '#b8484f', '#d96a62', '#f09a8a'];
  for (let j = 0; j < 12; j++) {                                                                          // the roof: a stepped triangle
    const hw = 8 + j * 1.1;
    rect(ctx, P.ink, Math.round(16 - hw - 1), 4 + j, Math.round(hw * 2 + 2), 1);
    rect(ctx, roof[j < 2 ? 4 : j < 6 ? 3 : j < 10 ? 2 : 1], Math.round(16 - hw), 4 + j, Math.round(hw * 2), 1);
  }
  rect(ctx, P.ink, 0, 16, 32, 3); rect(ctx, roof[1], 1, 16, 30, 2); rect(ctx, roof[0], 1, 18, 30, 1);
  for (let i = 3; i < 30; i += 5) rect(ctx, roof[2], i, 6 + ((i / 5) | 0), 2, 1);
  rect(ctx, P.ink, 15, 1, 2, 4); rect(ctx, P.yellow, 14, 0, 4, 2);                                        // the weather vane
  shadow(ctx, 16, 38, 15, 2.5, 0.3);
  return c;
}
