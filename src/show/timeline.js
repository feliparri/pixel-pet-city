// When a show runs and how the camera answers it. A show has a duration; the camera tilts up over RISE seconds when it starts and back
// down over FALL seconds before it ends (or when it is cut short). The tilt is what brings the horizon, and the sky above it, into view.
import { cameraFor, makeCamera, snapFocus } from '../hd2d/camera.js';
import { smooth, lerp } from './rand.js';

export const SHOWS = {
  fireworks: { dur: 38, label: 'Fuegos artificiales' },
  meteors: { dur: 28, label: 'Estrellas fugaces' },
  drones: { dur: 40, label: 'Drones' },
};
export const RISE = 2.6, FALL = 2.4;
export const SKY = { cy: 0.82, horizon: 0.4, zoom: 0.92 };     // at full tilt: the focus sits at 82% of the height, the horizon at 40%
const RAD = Math.PI / 180;

/** Seconds at which the show is over (earlier than `dur` when it was cut at `cut`). */
export const showEnd = (dur, cut = Infinity) => Math.min(dur, cut + FALL);

/** The camera's tilt 0..1 at show time `ts` seconds: smooth up, hold, smooth down. Pure. */
export function tiltAt(ts, dur, cut = Infinity) {
  if (ts <= 0) return 0;
  const downStart = Math.min(dur - FALL, cut);
  const down = ts > downStart ? smooth((ts - downStart) / FALL) : 0;
  return smooth(ts / RISE) * (1 - down);
}

/** The screen row of the horizon (negative when the camera looks too far down to see it). */
export const horizonY = (cam) => (cam.pitch >= 89.9 ? -Infinity : cam.cy - cam.focal * Math.tan(cam.pitch * RAD));

/** The HD-2D camera blended with the sky camera by tilt `k` 0..1: pitch drops, the focus slides down the screen, the horizon rises into view. */
export function showCamera(viewW, viewH, focusX, focusY, k) {
  const base = cameraFor(viewW, viewH, focusX, focusY, 1);
  const [fx, fy] = snapFocus(base, focusX, focusY);
  const focal = base.focal * lerp(1, SKY.zoom, k), cyT = viewH * SKY.cy;
  const pitchT = Math.atan((cyT - viewH * SKY.horizon) / focal) / RAD;
  return makeCamera({ focusX: fx, focusY: fy, pitch: lerp(base.pitch, pitchT, k), dist: base.dist, focal, cx: base.cx, cy: lerp(base.cy, cyT, k) });
}
