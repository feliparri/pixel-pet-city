// The town follows the player's local clock: a multiply tint (warm at dusk and dawn, blue at night) and how much the lights are on.
// Pure functions of the hour so they are tested; `?hour=21` (or 21.5) forces an hour for screenshots and for trying the town.

// hour -> [r, g, b] multiplied over the scene (255 = untouched)
const TINT = [
  [0, [104, 112, 190]], [5.5, [108, 116, 192]], [6.5, [226, 178, 170]], [7.5, [255, 238, 220]], [9, [255, 255, 255]],
  [17, [255, 255, 255]], [18, [255, 214, 168]], [19, [196, 150, 176]], [20.25, [116, 120, 192]], [24, [104, 112, 190]],
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** { tint: [r, g, b], night: 0..1 } for an hour 0-24 (fractional). `night` is how much the lamps and windows glow. */
export function ambientAt(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  let i = 0;
  while (i < TINT.length - 2 && h >= TINT[i + 1][0]) i++;
  const [h0, c0] = TINT[i], [h1, c1] = TINT[i + 1];
  const t = clamp01((h - h0) / (h1 - h0));
  const tint = c0.map((v, k) => Math.round(lerp(v, c1[k], t)));
  const night = h >= 19.5 || h < 5.5 ? 1 : h >= 17.75 ? clamp01((h - 17.75) / 1.75) : h >= 5.5 && h < 7.25 ? clamp01(1 - (h - 5.5) / 1.75) : 0;
  return { tint, night };
}

/** The hour to use now: the `hour` query parameter when it is a valid number, else the local time. */
export function hourNow(search = '', date = new Date()) {
  const v = new URLSearchParams(search).get('hour');
  if (v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 24) return Number(v);
  return date.getHours() + date.getMinutes() / 60;
}
