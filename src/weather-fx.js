// What the weather looks like, in plain Canvas 2D and cheap on a phone. Rain is a bounded table of drops drawn as short slanted lines in ONE path (one stroke), with a bounded
// table of small splashes on the ground in a second path; a drop's place is a closed form of (its index, the clock), so there is no state and no allocation per frame.
// The cloud dimming and the fog are not drawn here every frame in the HD-2D view: `paintSky` paints them into the cached haze overlay of src/hd2d/fx.js (rebuilt only when
// the quantised amounts move) and the flat renderer calls it directly. A lightning flash is one translucent rect, only while a flash is on.
import { mulberry32 } from './life.js';
import { flashAt } from './weather.js';

export const RAIN_DROPS = 140;
export const SPLASHES = 36;
export const QUANT = 8;                                        // cloud and fog amounts are drawn in steps of 1/8 (the overlay is rebuilt only when a step changes)
const DX = new Float32Array(RAIN_DROPS), DY = new Float32Array(RAIN_DROPS), DS = new Float32Array(RAIN_DROPS), DL = new Float32Array(RAIN_DROPS);
const SX = new Float32Array(SPLASHES), SY = new Float32Array(SPLASHES), SP = new Float32Array(SPLASHES);
{
  const r = mulberry32(0x7a1d5);
  for (let i = 0; i < RAIN_DROPS; i++) { DX[i] = r(); DY[i] = r(); DS[i] = 0.9 + r() * 0.7; DL[i] = r(); }
  for (let i = 0; i < SPLASHES; i++) { SX[i] = r(); SY[i] = r(); SP[i] = r(); }
}

/** How many drops and splashes at a rain level 0..1 (at least a few for any rain at all). */
export const dropsFor = (rain) => (rain > 0.02 ? Math.max(12, Math.round(RAIN_DROPS * Math.min(1, rain))) : 0);
export const splashesFor = (rain) => (rain > 0.02 ? Math.max(4, Math.round(SPLASHES * Math.min(1, rain))) : 0);

/**
 * Rain over a w x h view at clock `nowMs`. `unit`: one art pixel on this canvas; `night` 0..1 (the drops are brighter and bluer at night so they read on the dark scene); `storm` 0..1
 * (a steeper slant); `groundTop`: the fraction of the height where the ground starts (the splashes land below it).
 */
export function drawRain(ctx, w, h, nowMs, night, rain, unit = 1, storm = 0, groundTop = 0.42) {
  const nd = dropsFor(rain);
  if (!nd) return;
  const t = nowMs / 1000, slant = 0.2 + 0.2 * storm, dark = night > 0.5;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(1.5, unit);
  ctx.strokeStyle = dark ? 'rgba(206,222,250,0.8)' : 'rgba(200,216,240,0.72)';
  ctx.beginPath();
  for (let i = 0; i < nd; i++) {
    const len = unit * (5 + 6 * DL[i]), y = ((DY[i] + t * DS[i]) % 1) * (h + len) - len, x = Math.round(DX[i] * w);
    ctx.moveTo(x, Math.round(y)); ctx.lineTo(Math.round(x - len * slant), Math.round(y + len));
  }
  ctx.stroke();
  const ns = splashesFor(rain), top = h * groundTop;
  ctx.strokeStyle = dark ? 'rgba(210,225,250,0.55)' : 'rgba(205,220,240,0.6)';
  ctx.lineWidth = Math.max(1.5, unit * 0.8);
  ctx.beginPath();
  for (let i = 0; i < ns; i++) {                                // a splash lives a bit over half of its cycle: a small flat ring that opens (two dashes) and is gone
    const p = (t * 1.6 + SP[i]) % 1;
    if (p > 0.55) continue;
    const cx = Math.round(SX[i] * w), cy = Math.round(top + (h - top) * SY[i]), r = unit * (1 + p * 7);
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.45, cy); ctx.moveTo(cx + r * 0.45, cy); ctx.lineTo(cx + r, cy);
  }
  ctx.stroke();
  ctx.restore();
}

/** The lightning flash over the view: one translucent rect (only while `flash` 0..1 is on). */
export function drawFlash(ctx, w, h, flash) {
  if (!(flash > 0.01)) return;
  ctx.save(); ctx.fillStyle = `rgba(226,232,255,${(0.5 * flash).toFixed(3)})`; ctx.fillRect(0, 0, w, h); ctx.restore();
}

const mix = (a, b, t) => Math.round(a + (b - a) * t);
/**
 * The cloud dimming and the fog onto a context of w x h: a grey-blue tint (gentler at night, the night already being dark) and a veil of fog that is thickest in the middle of the
 * view. `cloud`, `fog` 0..1. Meant to be painted once into a cached overlay (HD-2D) or directly where the view is small (flat).
 */
export function paintSky(c, w, h, cloud, fog, night = 0) {
  if (cloud > 0.01) {
    c.fillStyle = `rgba(58,66,90,${(0.42 * cloud * (1 - 0.4 * night)).toFixed(3)})`;
    c.fillRect(0, 0, w, h);
  }
  if (fog > 0.01) {
    const g = c.createLinearGradient(0, 0, 0, h), a = 0.62 * fog, rgb = `${mix(222, 54, night)},${mix(228, 66, night)},${mix(236, 104, night)}`;
    for (const [t, k] of [[0, 0.25], [0.35, 0.8], [0.6, 1], [1, 0.7]]) g.addColorStop(t, `rgba(${rgb},${(a * k).toFixed(3)})`);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
}

/** The weather drawn over a finished view (after the effects): the rain with its splashes and, in a storm, the lightning flash at the real clock `utcMs`. */
export function drawWeatherTop(ctx, w, h, nowMs, utcMs, night, wx, unit = 1, groundTop = 0.42) {
  if (!wx) return;
  if (wx.rain > 0.02) drawRain(ctx, w, h, nowMs, night, wx.rain, unit, wx.storm, groundTop);
  if (wx.storm > 0.25) drawFlash(ctx, w, h, flashAt(utcMs, wx.storm));
}
