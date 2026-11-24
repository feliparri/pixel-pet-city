// The sleeping pet of the board, ported from the device (pixel-pet/common/ui_goal.c, case RFX_SLEEP / RFX_DOZE, and pixel-pet/common/ui_main.c draw_cues):
// a sleeping pet is the 'blink' frame (eyes shut), lying flat: the body squashed to sx16 = 19 / 16 wide and sy16 = 11 / 16 tall (plus a breath of 1/16 that rises and falls
// every 3.6 s), anchored at its feet; and two "Zzz" (pixel-pet/art/zzz.txt, 12 x 14, white and light blue of PAL_UI) drifting up and away from its head, one after the other
// every 2.8 s. The same for every species: the device draws no other lying art. Pure maths plus one small sprite.
import { canvas } from './palette.js';

export const LIE_SX = 19 / 16;
const LIE_SY = 11;
export const BREATH_MS = 3600;
export const ZZZ_MS = 2800;

/** The body's scale at time `now` (ms): { sx, sy } (device rest(): sy16 = 11 + round(breath), breath 0..1 along a cosine over 3.6 s). */
export function lieScale(now) {
  const b = 0.5 * (1 - Math.cos((2 * Math.PI * (now % BREATH_MS)) / BREATH_MS));
  return { sx: LIE_SX, sy: (LIE_SY + Math.round(b)) / 16 };
}

/**
 * The two Zzz at time `now`: [{ x, y, k }] with (x, y) the top left of the sprite in the pet's art px, relative to the pet's feet-centre (the head's top is 32 art px above the feet,
 * the pet's right edge 16 to the right), and k the size of one Zzz pixel in pet art px (0.75 for the first, 1 for the second, as the device's 3 and 4 at x4). They drift
 * 10 px right and 17.5 px up over ZZZ_MS, the second 1.4 s behind the first (device draw_cues).
 */
export function zzzAt(now, cell = 32) {
  return [0, 1].map((i) => {
    const ph = (now + i * 1400) % ZZZ_MS;
    return { x: 16 - 5 + (ph * 10) / ZZZ_MS, y: -cell - 2.5 - (ph * 17.5) / ZZZ_MS, k: ph < 1400 ? 0.75 : 1 };
  });
}

const ZZZ = [
  '.........444', '..........4.', '.........444', '............', '.....4444...', '.......4....', '......4.....', '.....4444...', '............',
  'AAAAA.......', '...A........', '..A.........', '.A..........', 'AAAAA.......',
];
const KEY = { 4: '#ffffff', A: '#8cc8ff' };
let sprite = null;
/** The Zzz sprite (12 x 14), as the device draws it. */
export function zzzSprite() {
  if (sprite) return sprite;
  sprite = canvas(12, 14);
  const ctx = sprite.getContext('2d');
  ZZZ.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (KEY[row[i]]) { ctx.fillStyle = KEY[row[i]]; ctx.fillRect(i, j, 1, 1); } });
  return sprite;
}
export const ZZZ_ROWS = ZZZ;
