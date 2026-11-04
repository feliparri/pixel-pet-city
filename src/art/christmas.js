// Christmas decorations (src/christmas.js says where and when): a big tree in the plaza, small trees, gift piles, candy-cane stakes, string lights along the houses and
// wreaths on their doors. Drawn once into small canvases like the other props; each lit thing has a `lit` twin (just the glowing parts) shown over it at night.
import { P, canvas, rect, dot, shape } from './palette.js';
import { decorOf } from '../christmas.js';

const BULB = ['#e0485a', '#ffcb6b', '#4a8ad8', '#6bd05a'], BULB_LIT = ['#ff8a8a', '#fff0a0', '#9fd8ff', '#b6ff9a'];
const GOLD = '#ffd45a', GOLD_LIT = '#fff4b8';
const rgbOf = '255,214,130';

/** A tier of fir (a triangle of w x h px, its apex on top), shaded: light on the left, dark on the right, a scalloped hem. */
function tier(ctx, x0, y0, w, h) {
  const cx = (w - 1) / 2;
  shape(ctx, x0, y0, w, h, (x, y) => Math.abs(x - cx) <= (y / (h - 1)) * cx + 0.6 && (y < h - 2 || (x + y) % 4 !== 0), (x, y) => {
    const d = (x - cx) / Math.max(1, cx);
    return d < -0.35 ? P.g2 : d < 0.25 ? P.g1 : P.g0;
  }, P.gOut);
}

/** A star of 7 x 7 at (x0, y0). */
function star(ctx, x0, y0, c, hi) {
  for (const [dx, dy] of [[3, 0], [3, 1], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [4, 5], [1, 6], [5, 6]]) dot(ctx, c, x0 + dx, y0 + dy);
  dot(ctx, hi, x0 + 3, y0 + 2); dot(ctx, hi, x0 + 3, y0 + 3);
}
const STAR_AT = [16, 0];

// where the baubles of the big tree hang (x, y, colour index), on its tiers
const BAUBLES = [[20, 14, 0], [17, 19, 1], [23, 20, 2], [13, 27, 3], [20, 28, 0], [27, 27, 1], [10, 38, 2], [17, 39, 0], [24, 38, 3], [31, 39, 1], [8, 48, 1], [15, 49, 3], [22, 48, 2], [29, 49, 0], [33, 47, 2], [20, 33, 2]];

/** The big tree, 40 x 60 (feet at the bottom): three tiers, golden garlands, baubles, a star on top and a red skirt. */
export function tree() {
  const c = canvas(40, 60), ctx = c.getContext('2d');
  rect(ctx, P.ink, 16, 50, 8, 10); rect(ctx, P.w1, 17, 50, 6, 9); rect(ctx, P.w3, 17, 50, 2, 9);
  tier(ctx, 11, 6, 19, 19); tier(ctx, 6, 19, 29, 21); tier(ctx, 1, 33, 39, 21);
  for (const [x0, y0, x1, y1] of [[8, 25, 31, 31], [4, 39, 36, 45], [2, 51, 38, 53]]) {                                   // garlands: a swag across each tier
    const n = x1 - x0;
    for (let i = 0; i <= n; i++) dot(ctx, GOLD, x0 + i, Math.round(y0 + (y1 - y0) * (1 - ((i / n - 0.5) * 2) ** 2) * 0.55 + (y1 - y0) * 0.2));
  }
  for (const [x, y, k] of BAUBLES) { rect(ctx, P.ink, x - 1, y - 1, 4, 4); rect(ctx, BULB[k], x, y, 2, 2); dot(ctx, '#ffffff', x, y); }
  star(ctx, STAR_AT[0] + 0, STAR_AT[1], GOLD, '#fff4b8');
  rect(ctx, P.red2, 10, 55, 20, 5); rect(ctx, P.red, 11, 55, 18, 3); rect(ctx, P.cream, 10, 55, 20, 1);                      // the skirt
  return c;
}
/** The tree's lights (over `tree()` at night): the baubles, the garlands and the star. */
export function treeLit() {
  const c = canvas(40, 60), ctx = c.getContext('2d');
  for (const [x, y, k] of BAUBLES) { rect(ctx, BULB_LIT[k], x, y, 2, 2); dot(ctx, '#ffffff', x, y); }
  for (const [x0, y0, x1, y1] of [[8, 25, 31, 31], [4, 39, 36, 45], [2, 51, 38, 53]]) {
    const n = x1 - x0;
    for (let i = 0; i <= n; i += 2) dot(ctx, GOLD_LIT, x0 + i, Math.round(y0 + (y1 - y0) * (1 - ((i / n - 0.5) * 2) ** 2) * 0.55 + (y1 - y0) * 0.2));
  }
  star(ctx, STAR_AT[0], STAR_AT[1], '#fff08a', '#ffffff');
  return c;
}
export const TREE_GLOWS = [{ x: 20, z: 30, r: 52, rgb: rgbOf }, { x: 19, z: 54, r: 22, rgb: '255,240,170' }];

/** A small tree, 16 x 26: two tiers, a star and four baubles. */
export function miniTree() {
  const c = canvas(16, 26), ctx = c.getContext('2d');
  rect(ctx, P.ink, 6, 21, 4, 5); rect(ctx, P.w2, 7, 21, 2, 4);
  tier(ctx, 3, 7, 11, 9); tier(ctx, 1, 13, 15, 10);
  for (const [x, y, k] of MINI) { rect(ctx, P.ink, x - 1, y - 1, 3, 3); dot(ctx, BULB[k], x, y); }
  rect(ctx, GOLD, 7, 2, 2, 5); rect(ctx, GOLD, 6, 4, 4, 1); dot(ctx, '#fff4b8', 7, 4);
  return c;
}
const MINI = [[7, 11, 0], [5, 17, 1], [10, 17, 2], [8, 21, 3]];
export function miniTreeLit() {
  const c = canvas(16, 26), ctx = c.getContext('2d');
  for (const [x, y, k] of MINI) dot(ctx, BULB_LIT[k], x, y);
  rect(ctx, '#fff08a', 7, 2, 2, 5); rect(ctx, '#fff08a', 6, 4, 4, 1); dot(ctx, '#ffffff', 7, 4);
  return c;
}
export const MINI_GLOWS = [{ x: 8, z: 14, r: 22, rgb: rgbOf }];

/** One wrapped box of w x h px at (x, y): a ribbon down the middle and across, outlined. */
function box(ctx, x, y, w, h, base, light, ribbon) {
  rect(ctx, P.ink, x - 1, y - 1, w + 2, h + 2); rect(ctx, base, x, y, w, h); rect(ctx, light, x, y, 2, h);
  rect(ctx, ribbon, x + Math.floor(w / 2) - 1, y, 2, h); rect(ctx, ribbon, x, y + Math.floor(h / 2) - 1, w, 2);
}
/** A pile of three gifts, 24 x 16 (feet at the bottom), with a bow on the top one. */
export function gifts() {
  const c = canvas(24, 16), ctx = c.getContext('2d');
  box(ctx, 2, 6, 11, 9, '#c8404f', '#e8707a', GOLD);
  box(ctx, 14, 8, 8, 7, '#3f8c5c', '#6bbe7a', P.cream);
  box(ctx, 5, 1, 7, 5, '#4a6ec0', '#7a98e0', P.yellow2);
  for (const x of [6, 7, 9]) dot(ctx, P.yellow2, x, 0);                                                                   // the bow
  rect(ctx, P.red, 14, 8, 2, 1); dot(ctx, P.red, 18, 7); dot(ctx, P.red, 19, 7);
  return c;
}

const CANE = [[6, 25], [6, 23], [6, 21], [6, 19], [6, 17], [6, 15], [6, 13], [6, 11], [6, 9], [6, 7], [6, 5], [7, 3], [9, 2], [11, 3], [12, 5], [12, 7]];       // the 2 x 2 steps of a cane's spine
/** A candy-cane stake, 14 x 28: a striped cane with a bow, and a small bulb on the hook. */
export function cane() {
  const c = canvas(14, 28), ctx = c.getContext('2d');
  for (const [x, y] of CANE) rect(ctx, P.ink, x - 1, y - 1, 4, 4);
  CANE.forEach(([x, y], i) => rect(ctx, i % 2 ? P.cream : P.red, x, y, 2, 2));
  rect(ctx, P.g1, 3, 22, 4, 2); rect(ctx, P.red, 4, 22, 2, 2); dot(ctx, P.g4, 3, 22); dot(ctx, P.g4, 7, 22);
  rect(ctx, P.ink, 11, 8, 3, 3); rect(ctx, BULB[1], 12, 9, 1, 1);
  return c;
}
export function caneLit() {
  const c = canvas(14, 28), ctx = c.getContext('2d');
  rect(ctx, '#ffe27a', 11, 8, 3, 3); dot(ctx, '#ffffff', 12, 9);
  return c;
}
export const CANE_GLOWS = [{ x: 12, z: 19, r: 16, rgb: rgbOf }];

const SWAG = 16;      // px between the posts of a string of lights
/** A string of lights `w` px wide, 10 px tall: a dark wire in swags with a bulb every 5 px. Returns { sprite, lit, glows }. */
export function lights(w) {
  const c = canvas(w, 10), l = canvas(w, 10), g = c.getContext('2d'), gl = l.getContext('2d'), bulbs = [];
  for (let x = 0; x < w; x++) {
    const k = (x % SWAG) / SWAG, y = Math.round(1 + 4 * (1 - (2 * k - 1) ** 2));
    dot(g, '#26402e', x, y);
    if (x % 5 === 2 && x % SWAG !== 0) bulbs.push([x, y + 1, bulbs.length % 4]);
  }
  for (const [x, y, k] of bulbs) { rect(g, P.ink, x - 1, y - 1, 3, 3); dot(g, BULB[k], x, y); rect(gl, BULB_LIT[k], x, y, 1, 1); dot(gl, '#ffffff', x, y); }
  const glows = [0.18, 0.5, 0.82].map((f) => ({ x: Math.round(w * f), z: 5, r: 18, rgb: '255,210,120' }));
  return { sprite: c, lit: l, glows };
}

/** A wreath on a door, 10 x 11: a ring of fir with a red bow and berries. */
export function wreath() {
  const c = canvas(10, 11), ctx = c.getContext('2d');
  shape(ctx, 0, 0, 10, 10, (x, y) => { const d = Math.hypot(x - 4.5, y - 4.5); return d <= 4.6 && d >= 2; }, (x, y) => ((x * 3 + y * 5) % 4 === 0 ? P.g3 : (x + y) % 3 === 0 ? P.g1 : P.g2), P.gOut);
  for (const [x, y] of [[2, 3], [7, 2], [8, 6], [1, 6]]) dot(ctx, P.red, x, y);
  rect(ctx, P.ink, 2, 7, 6, 4); rect(ctx, P.red, 3, 8, 2, 2); rect(ctx, P.red, 5, 8, 2, 2); rect(ctx, P.red2, 4, 9, 2, 1); dot(ctx, P.red, 4, 8); dot(ctx, P.red, 5, 8);
  return c;
}

/** A snowball of radius r centred on (cx, cy): white on the left, blue-grey shade on the right, outlined. */
function ball(ctx, cx, cy, r) {
  const x0 = Math.floor(cx - r - 1), y0 = Math.floor(cy - r - 1), n = Math.ceil(2 * r + 2);
  shape(ctx, x0, y0, n, n, (x, y) => Math.hypot(x + x0 + 0.5 - cx, y + y0 + 0.5 - cy) <= r, (x, y) => {
    const d = (x + x0 + 0.5 - cx) / r;
    return d < -0.3 ? '#ffffff' : d < 0.35 ? '#e6eef8' : '#b4c4de';
  }, P.ink);
}
/** A snowman, 20 x 32 (feet at the bottom): three snowballs, coal eyes and buttons, a carrot nose, a red scarf, stick arms and a small black hat. */
export function snowman() {
  const c = canvas(20, 32), ctx = c.getContext('2d');
  for (const [x, y] of [[3, 17], [2, 16], [1, 15], [0, 14], [16, 17], [17, 16], [18, 15], [19, 14]]) dot(ctx, P.w1, x, y);          // the stick arms, behind the body
  dot(ctx, P.w1, 1, 13); dot(ctx, P.w1, 19, 13);
  ball(ctx, 10, 24, 7); ball(ctx, 10, 15.5, 5.2); ball(ctx, 10, 8.5, 4.4);
  rect(ctx, P.ink, 6, 3, 9, 2); rect(ctx, P.ink, 7, 0, 7, 4); rect(ctx, P.plum, 8, 1, 5, 2); rect(ctx, P.red, 7, 3, 7, 1);              // the hat: brim, crown, a red band
  dot(ctx, P.ink, 8, 7); dot(ctx, P.ink, 12, 7); for (const x of [7, 8, 9, 10, 11]) dot(ctx, P.ink2, x, 10 + (x === 7 || x === 11 ? -1 : 0));  // eyes, a smile of coal
  rect(ctx, P.orange, 10, 8, 4, 1); dot(ctx, P.red2, 13, 8);                                                                            // the carrot nose
  rect(ctx, P.red, 6, 12, 9, 2); rect(ctx, P.red2, 6, 13, 9, 1); rect(ctx, P.red, 13, 14, 2, 5); rect(ctx, P.cream, 13, 16, 2, 1);        // the scarf and its hanging end
  for (const y of [16, 19, 23, 26]) { rect(ctx, P.ink, 9, y, 2, 2); }                                                                    // buttons
  return c;
}

let kitCache = null, lightsCache = new Map();
/** The sprites by decoration kind: { tree, minitree, gift, cane, snowman, wreath } with their lit twins and glows ([] when it does not glow). */
export function christmasKit() {
  return kitCache || (kitCache = {
    tree: { sprite: tree(), lit: treeLit(), glows: TREE_GLOWS },
    minitree: { sprite: miniTree(), lit: miniTreeLit(), glows: MINI_GLOWS },
    gift: { sprite: gifts(), lit: null, glows: [] },
    cane: { sprite: cane(), lit: caneLit(), glows: CANE_GLOWS },
    snowman: { sprite: snowman(), lit: null, glows: [] },
    wreath: { sprite: wreath(), lit: null, glows: [] },
  });
}
const lightsOf = (w) => lightsCache.get(w) || (lightsCache.set(w, lights(w)), lightsCache.get(w));

const dressed = new Map();
/** What an area wears, ready to draw (the same shape as halloweenDecor): [{ id, x, y (feet), lift, sprite, lit, glows: [{ x, y, z, r, rgb }] }] (world px; `.glows` are the flat renderer's lamps). Built once per area. */
export function christmasDecor(area) {
  if (dressed.has(area)) return dressed.get(area);
  const kit = christmasKit(), list = decorOf(area).map((d) => {
    const k = d.kind === 'lights' ? lightsOf(d.w) : kit[d.kind], left = d.x - k.sprite.width / 2;
    return { ...d, id: `${d.kind}@${d.x},${d.y}`, sprite: k.sprite, lit: k.lit, glows: k.glows.map((g) => ({ ...g, x: left + g.x, y: d.y - d.lift - g.z, z: d.lift + g.z })) };
  });
  list.glows = list.flatMap((d) => d.glows.map((g) => ({ kind: 'lamp', x: g.x, y: g.y, r: g.r, rgb: g.rgb })));
  dressed.set(area, list);
  return list;
}
