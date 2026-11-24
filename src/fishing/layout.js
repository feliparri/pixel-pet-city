// Where everything is on the fishing picture (pure, in logical pixels, so it is tested): the shore and the pet, the rod's tip, where a float lands and how it flies,
// and the boxes of the power gauge and of the reeling bar. The picture is a side view: the water fills the right, the pet stands on a dock at the left.
import { FISHING } from './rules.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const PET_CELL = 32, PET_FEET = 30;                     // the pet sprite's cell and the row of its feet (src/sprites.js)

/** The scene for a logical canvas w x h; `pad` ({ top, left, right }) keeps clear of a device's notch. */
export function sceneLayout(w, h, pad = {}) {
  const left = pad.left || 0, right = pad.right || 0, top = pad.top || 0;
  const water = Math.round(h * 0.45);                           // the top of the water (the horizon)
  const feetY = Math.round(h * 0.74), feetX = Math.round(w * 0.15) + left;
  const hand = { x: feetX + 9, y: feetY - 13 };
  const tip = { x: hand.x + 30, y: hand.y - 28 };
  const reachX = [tip.x + 30, w - right - 70];                   // the float lands between these (near .. far)
  const bar = { x: w - right - 38, y: Math.round(h * 0.2) + top, w: 16, h: Math.round(h * 0.5) };
  return {
    w, h, water, feetX, feetY, hand, tip, dockW: Math.round(w * 0.3) + left,
    petOrigin: { x: feetX - PET_CELL / 2, y: feetY - PET_FEET },
    reachX, reachY: [Math.round(h * 0.82), Math.round(h * 0.6)],  // far water is higher on the picture
    bar, meter: { x: bar.x + bar.w + 6, y: bar.y, w: 6, h: bar.h },
    gauge: { x: left + 8, y: feetY + 10, w: Math.max(40, Math.round(w * 0.3) - 16), h: 8 },
  };
}

/** Where a float lands for a cast that went `d01` (0 near .. 1 far) out. */
export const landingPoint = (L, d01) => ({ x: Math.round(lerp(L.reachX[0], L.reachX[1], clamp01(d01))), y: Math.round(lerp(L.reachY[0], L.reachY[1], clamp01(d01))) });

/** A point of the float's flight, p 0..1: a straight run with a lift in the middle. */
export function castArc(L, to, p) {
  const t = clamp01(p), lift = 26 + (to.x - L.tip.x) * 0.12;
  return { x: lerp(L.tip.x, to.x, t), y: lerp(L.tip.y, to.y, t) - 4 * lift * t * (1 - t) };
}

/** The distance 0..1 a run's cast went (or would go, while charging: the power). */
export const castD01 = (s) => (s.phase === 'charging' ? clamp01(s.power) : clamp01((s.dist - FISHING.DIST_MIN) / (FISHING.DIST_MAX - FISHING.DIST_MIN)));

/**
 * The float for the state `s` at `clock` (ms): { x, y, mode } with mode 'hang' (on the line under the rod's tip), 'fly', 'float', 'twitch' (a nibble), 'dip' (the bite)
 * or 'pull' (reeling: it drifts towards the pet as the progress grows).
 */
export function floatAt(s, L, clock) {
  const land = landingPoint(L, castD01(s));
  switch (s.phase) {
    case 'cast': return { ...castArc(L, land, s.t / FISHING.CAST_S), mode: 'fly' };
    case 'waiting': {
      const b = s.bite, last = b.nibbled ? b.nibbles[b.nibbled - 1] : -9, since = s.t - last;
      if (since >= 0 && since < 0.45) return { x: land.x, y: land.y + Math.round(2 * Math.sin(since * 40) * (1 - since / 0.45)) + 1, mode: 'twitch' };
      return { x: land.x, y: land.y + Math.round(Math.sin(clock / 420)), mode: 'float' };
    }
    case 'bite': return { x: land.x, y: land.y + 4 + (Math.floor(clock / 60) % 2), mode: 'dip' };
    case 'reeling': { const k = clamp01(s.reel.progress); return { x: Math.round(lerp(land.x, L.tip.x + 26, k * 0.8)), y: land.y + Math.round(Math.sin(clock / 90) * (s.reel.inside ? 1 : 2)), mode: 'pull' }; }
    case 'caught': case 'escaped': return { x: Math.round(lerp(land.x, L.tip.x + 26, 0.8)), y: land.y, mode: 'float' };
    default: return { x: L.tip.x + 1, y: L.tip.y + 22, mode: 'hang' };
  }
}

/** The reeling bar's pieces for a reel state `r` in a box: the zone and the marker as rows from the top, the progress as a height. 0 is the bottom of the bar. */
export function barPieces(box, r) {
  const yOf = (v) => Math.round(box.y + box.h - clamp01(v) * box.h);
  const zTop = yOf(r.zone + r.zoneSize / 2), zBot = yOf(r.zone - r.zoneSize / 2);
  return { zone: { y: zTop, h: Math.max(2, zBot - zTop) }, marker: yOf(r.marker), progressH: Math.round(clamp01(r.progress) * box.h) };
}

/** What to tell the player for a phase (Spanish): the hint line under the picture and the label of the big button. */
export function promptFor(phase) {
  switch (phase) {
    case 'idle': return { hint: 'Mantén para lanzar', button: 'Lanzar' };
    case 'charging': return { hint: 'Suelta para lanzar', button: 'Suelta' };
    case 'cast': return { hint: '', button: '…' };
    case 'waiting': return { hint: 'Espera a que pique…', button: 'Espera' };
    case 'bite': return { hint: '¡Toca ya!', button: '¡Ya!' };
    case 'reeling': return { hint: 'Mantén para subir, suelta para bajar', button: 'Mantén' };
    default: return { hint: '', button: '…' };
  }
}

/** The headline of an escape card for `s.reason`. */
export const ESCAPE_TEXT = { early: 'Tiraste muy pronto', missed: 'Se fue antes de que lo notaras', lost: 'Se te escapó', snapped: 'Se rompió el hilo' };
export const RARITY_TEXT = { common: 'Común', rare: 'Raro', epic: 'Épico' };

/** How long (ms) a finished cast stays on the picture before the card: the fish jumps, or the line goes limp. */
export const resultDelay = (phase) => (phase === 'caught' ? 1100 : 800);
