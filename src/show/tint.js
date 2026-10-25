// The colour a burst washes over something standing on the ground at world x (a pet): { r, g, b, a } for a source-atop wash, or null.
import { falloff } from '../hd2d/light.js';

export function burstTint(flashes, wx) {
  let a = 0, r = 0, g = 0, b = 0;
  for (const f of flashes) {
    const w = falloff(Math.abs(wx - f.x), 360) * f.k * 0.5;
    a += w; r += w * f.c[0]; g += w * f.c[1]; b += w * f.c[2];
  }
  return a > 0.01 ? { r: r / a, g: g / a, b: b / a, a: Math.min(0.55, a) } : null;
}
