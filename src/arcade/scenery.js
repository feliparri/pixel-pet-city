// The train game's roadside, as pure data: what stands where along the track. The world is endless, so every object is a function of its slot number (no
// list is stored): `slotsBetween(zFar, zNear, dist)` gives what is on screen for a run `dist` units long. All positions are in lanes off the track's centre.
export const hash = (a, b = 0) => {
  let h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x7F4A7C15, 0xC2B2AE35);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

export const POST_GAP = 15;           // fence posts: every this many units, both sides
export const POLE_GAP = 64;           // telegraph poles: left side on the multiples, right side half a gap later
export const TREE_GAP = 11;
export const SIGNAL_GAP = 210;
export const STATION_GAP = 520;
export const FENCE_LANE = 2.3, POLE_LANE = 2.75, SIGNAL_LANE = 2.1;

/** { kind, side (-1 left, 1 right), lane, z (absolute along the track), ... } of every roadside object with a z in [from, to]. */
export function roadside(from, to) {
  const out = [];
  const each = (gap, off, fn) => { for (let i = Math.ceil((from - off) / gap); i * gap + off <= to; i++) fn(i, i * gap + off); };
  for (const side of [-1, 1]) {
    each(POST_GAP, 0, (i, z) => { if (hash(i, side * 11) > 0.07) out.push({ kind: 'post', side, lane: FENCE_LANE, z }); });
    each(POLE_GAP, side > 0 ? POLE_GAP / 2 : 0, (i, z) => out.push({ kind: 'pole', side, lane: POLE_LANE, z, i }));
    each(TREE_GAP, side * 5, (i, z) => {
      const r = hash(i, side * 31), r2 = hash(i, side * 57);
      if (r < 0.22) return;
      const kind = r2 < 0.5 ? 'tree' : r2 < 0.72 ? 'pine' : r2 < 0.88 ? 'bush' : 'blossom';
      out.push({ kind, side, lane: 2.85 + hash(i, side * 7) * 3.4, z: z + hash(i, 3) * 8, variant: Math.floor(hash(i, 9) * 3) });
    });
    each(TREE_GAP * 2, side * 9 + 3, (i, z) => { if (hash(i, side * 77) < 0.5) out.push({ kind: hash(i, 5) < 0.5 ? 'flowers' : 'rock', side, lane: 2.55 + hash(i, 6) * 1.2, z }); });
  }
  each(SIGNAL_GAP, 90, (i, z) => out.push({ kind: 'signal', side: i % 2 ? 1 : -1, lane: SIGNAL_LANE, z, red: hash(i, 4) < 0.7 }));
  each(STATION_GAP, 230, (i, z) => out.push({ kind: 'station', side: i % 2 ? -1 : 1, lane: 3.9, z }));
  return out;
}
