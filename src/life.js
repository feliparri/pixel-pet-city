// The town's ambient life: birds that peck and fly off when a pet comes close, butterflies by day and fireflies at night over the garden and
// the Parque, a duck and ripples on the pond, the fountain's spray. All client-side: the scene is seeded by the room code (so everybody sees
// a similar one) and nothing of it is ever sent. Positions are pure functions of the clock; only the birds keep a tiny state. None of it
// blocks walking: it is drawn over the town and never read by the game rules.
import { tileAt, isWalkable, TILES, TILE, GARDEN, PARQUE, AREAS } from './map.js';

export const LIFE = {
  birds: 9, birdSpacing: 5, scare: 3, calm: 4.5,             // a pet within `scare` tiles flushes a bird; it returns when every pet is farther than `calm`
  flyMs: 1100, backMs: 1200, awayMin: 6000, awayMax: 14000,
  butterflies: 8, fireflies: 14,
};

/** A 32 bit hash of a string (the room code). */
export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

/** A small seeded random generator (mulberry32): the same seed always gives the same numbers. */
export function mulberry32(a) {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLOURS = ['#ffcb6b', '#ff9eb5', '#b8a0e0', '#fff7de', '#8ccbff'];            // the butterflies' wings

function grassTiles() {
  const a = AREAS.town, out = [];
  for (let y = 1; y < a.h - 1; y++) for (let x = 1; x < a.w - 1; x++) {
    const c = tileAt(x, y);
    if ((c === '.' || c === ',') && isWalkable(x, y) && !TILES[c].hide) out.push([x, y]);
  }
  return out;
}

function pondTiles() {
  const a = AREAS.town, out = [];
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (tileAt(x, y) === '~') out.push([x, y]);
  return out;
}

const within = (r, rng, margin = 1) => [r.x + margin + rng() * (r.w - 2 * margin), r.y + margin + rng() * (r.h - 2 * margin)];

/** The scene for a room: `seed` is the room code (or any string). */
export function createLife(seed) {
  const rng = mulberry32(hashSeed(seed));
  const grass = grassTiles(), birds = [];
  for (let tries = 0; birds.length < LIFE.birds && tries < 600; tries++) {          // spread out: no two closer than birdSpacing tiles
    const [x, y] = grass[Math.floor(rng() * grass.length)];
    if (birds.every((b) => Math.hypot(b.hx - x, b.hy - y) >= LIFE.birdSpacing)) {
      birds.push({ id: birds.length, hx: x, hy: y, ox: Math.floor(rng() * 7) - 3, ph: Math.floor(rng() * 1600), kind: birds.length % 3, state: 'peck', t0: 0, dx: 1, dy: -0.4, awayMs: 0, n: 0, flip: rng() < 0.5 });
    }
  }
  const butterflies = Array.from({ length: LIFE.butterflies }, (_, i) => {
    const [cx, cy] = within(i % 4 === 0 ? GARDEN : PARQUE, rng, 2);
    return { id: i, cx, cy, rx: 1 + rng() * 1.8, ry: 0.8 + rng() * 1.4, sx: 0.00035 + rng() * 0.0004, sy: 0.00045 + rng() * 0.0004, ph: rng() * 6.28, colour: COLOURS[i % COLOURS.length] };
  });
  const fireflies = Array.from({ length: LIFE.fireflies }, (_, i) => {
    const [cx, cy] = within(i % 3 === 0 ? GARDEN : PARQUE, rng, 2);
    return { id: i, cx, cy, rx: 0.8 + rng() * 1.6, ry: 0.6 + rng() * 1.2, sx: 0.0002 + rng() * 0.0003, sy: 0.0003 + rng() * 0.0003, ph: rng() * 6.28, blink: 0.0012 + rng() * 0.001 };
  });
  const pond = pondTiles();
  const ripples = Array.from({ length: 5 }, () => { const [tx, ty] = pond[Math.floor(rng() * pond.length)]; return { tx, ty, ox: 3 + Math.floor(rng() * 10), oy: 4 + Math.floor(rng() * 8), period: 2600 + Math.floor(rng() * 2400), ph: Math.floor(rng() * 5000) }; });
  const px = pond.map(([x]) => x), py = pond.map(([, y]) => y);
  const duck = { cx: ((Math.min(...px) + Math.max(...px) + 1) / 2) * TILE, cy: ((Math.min(...py) + Math.max(...py) + 1) / 2) * TILE, rx: 26, ry: 13, speed: 0.00022 + rng() * 0.0001, ph: rng() * 6.28 };
  return { seed: String(seed), birds, butterflies, fireflies, ripples, duck, spraySeed: hashSeed(seed) };
}

const dist = (pets, x, y) => pets.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
const nextAway = (l, b) => { b.n++; return LIFE.awayMin + mulberry32(hashSeed(`${l.seed}:${b.id}:${b.n}`))() * (LIFE.awayMax - LIFE.awayMin); };

/**
 * Advances the birds to `now` (ms). `pets`: [{ x, y }] in tiles (every pet in the town, this one included). A bird that has a pet within
 * LIFE.scare tiles flies off away from it; after a while, once every pet is farther than LIFE.calm, it flies back and goes on pecking.
 */
export function stepLife(l, pets, now) {
  for (const b of l.birds) {
    const near = dist(pets, b.hx, b.hy);
    if (b.state === 'peck' && near <= LIFE.scare) {
      const p = pets.reduce((m, q) => (Math.hypot(q.x - b.hx, q.y - b.hy) < Math.hypot(m.x - b.hx, m.y - b.hy) ? q : m));
      const vx = b.hx - p.x, vy = b.hy - p.y, len = Math.hypot(vx, vy) || 1;
      b.dx = len < 0.01 ? (b.flip ? 1 : -1) : vx / len; b.dy = len < 0.01 ? -0.3 : vy / len * 0.6 - 0.3;
      b.state = 'fly'; b.t0 = now; b.awayMs = nextAway(l, b);
    } else if (b.state === 'fly' && now - b.t0 >= LIFE.flyMs) {
      b.state = 'gone'; b.t0 = now;
    } else if (b.state === 'gone' && now - b.t0 >= b.awayMs && near > LIFE.calm) {
      b.state = 'back'; b.t0 = now;
    } else if (b.state === 'back' && now - b.t0 >= LIFE.backMs) {
      b.state = 'peck'; b.t0 = now;
    }
  }
}

const FLY_TILES = 9;
const smooth = (k) => k * k * (3 - 2 * k);

/** Where a bird is, in map pixels: its feet (x, y), `air` px above the ground, the sprite frame and which way it faces. */
export function birdPose(b, now) {
  const x0 = b.hx * TILE + TILE / 2 + b.ox, y0 = b.hy * TILE + TILE - 2;
  if (b.state === 'fly' || b.state === 'back') {
    const k = Math.max(0, Math.min(1, (now - b.t0) / (b.state === 'fly' ? LIFE.flyMs : LIFE.backMs)));
    const away = b.state === 'fly' ? smooth(k) : 1 - smooth(k);                          // 0 at home, 1 far away
    return { x: x0 + b.dx * away * FLY_TILES * TILE, y: y0 + b.dy * away * FLY_TILES * TILE, air: Math.round(Math.sin(Math.min(1, away * 1.2) * 1.4) * 26 * (b.state === 'fly' ? 1 : 0.6) + away * 12), frame: 2 + (Math.floor(now / 90) % 2), flip: b.dx < 0 };
  }
  const t = (now + b.ph) % 1600, pecking = t < 260 || (t > 560 && t < 780);
  return { x: x0, y: y0, air: 0, frame: pecking ? 1 : 0, flip: b.flip };
}

/** A butterfly over its patch: a slow loop with a flutter; `x`, `y` in map pixels, `frame` 0-1 (wings). */
export function butterflyPose(b, now) {
  const x = b.cx + Math.sin(now * b.sx + b.ph) * b.rx + Math.sin(now * b.sx * 3.1) * 0.35, y = b.cy + Math.cos(now * b.sy + b.ph * 1.7) * b.ry;
  return { x: x * TILE, y: y * TILE, frame: Math.floor((now + b.ph * 100) / 140) % 2, flip: Math.cos(now * b.sx + b.ph) < 0 };
}

/** A firefly: drifts slowly and blinks; `glow` 0-1. */
export function fireflyPose(f, now) {
  const x = f.cx + Math.sin(now * f.sx + f.ph) * f.rx, y = f.cy + Math.cos(now * f.sy + f.ph * 1.3) * f.ry;
  const glow = Math.max(0, Math.sin(now * f.blink + f.ph * 3)) ** 2;
  return { x: x * TILE, y: y * TILE, glow };
}

/** The duck swimming round the pond: always over water; `flip` when it heads left. */
export function duckPose(d, now) {
  const a = now * d.speed + d.ph;
  return { x: d.cx + Math.cos(a) * d.rx, y: d.cy + Math.sin(a) * d.ry, flip: Math.sin(a) > 0, frame: Math.floor(now / 500) % 2 };
}

/** A ring on the pond: radius 1-6 px growing over its period, or null while the spot rests. */
export function rippleRing(r, now) {
  const k = ((now + r.ph) % r.period) / r.period;
  return k < 0.5 ? { x: r.tx * TILE + r.ox, y: r.ty * TILE + r.oy, radius: 1 + Math.round(k * 10), fade: 1 - k * 2 } : null;
}

/** The fountain's spray: droplets thrown out of the top jet in arcs, [{ x, y }] in the fountain's own pixels (a few at a time, looping). */
export function spray(now) {
  const out = [];
  for (let i = 0; i < 14; i++) {
    const per = 1100, k = (((now + i * per / 14) % per) / per), side = i % 2 ? 1 : -1, reach = 5 + (i % 5) * 2.5;
    out.push({ x: Math.round(32 + side * reach * k), y: Math.round(6 - 48 * k * (1 - k) + 14 * k), a: 1 - k * 0.6 });
  }
  return out;
}

/**
 * What to draw at `now` for the light `amb` ({ night: 0-1 }): the birds that are in sight, butterflies by day (night < 0.4) and fireflies when it
 * is dark (night > 0.5, a few more as it gets darker). Returns plain lists of poses; the renderer draws them.
 */
export function lifeFrame(l, now, amb) {
  const night = amb ? amb.night : 0;
  const birds = l.birds.filter((b) => b.state !== 'gone').map((b) => ({ id: b.id, kind: b.kind, ...birdPose(b, now) }));
  const butterflies = night < 0.4 ? l.butterflies.map((b) => ({ id: b.id, colour: b.colour, ...butterflyPose(b, now) })) : [];
  const count = night > 0.5 ? Math.ceil(l.fireflies.length * Math.min(1, (night - 0.5) * 2)) : 0;
  const fireflies = l.fireflies.slice(0, count).map((f) => ({ id: f.id, ...fireflyPose(f, now) }));
  return { birds, butterflies, fireflies, duck: duckPose(l.duck, now), ripples: l.ripples.map((r) => rippleRing(r, now)).filter(Boolean), spray: spray(now) };
}
