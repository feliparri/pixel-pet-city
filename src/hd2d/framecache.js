// A small cache of painted sprite frames for the HD-2D view's moving things (pets, birds, farm animals...). A frame is painted once per look and
// pose, its night grade once per quantised night and light (the steps nightSprite uses), and both are then just drawn. The cache is bounded: the
// oldest frame goes when it holds more than `limit`, so a long session never grows memory.

const NIGHT_STEPS = 12, LIGHT_STEPS = 8;                              // the same quantisation as nightSprite (scene.js)

/**
 * `canvas(w, h)` makes a canvas and `grade(ctx, src, n, l)` night-grades `src` into ctx (both injected: the cache itself touches no DOM).
 * Returns { painted, graded, size }.
 */
export function createFrameCache({ canvas, grade, limit = 600 }) {
  const store = new Map();                                            // key -> canvas, oldest first (a hit moves its entry to the end)
  const take = (key, make) => {
    let c = store.get(key);
    if (c) { store.delete(key); store.set(key, c); return c; }
    c = make();
    store.set(key, c);
    if (store.size > limit) store.delete(store.keys().next().value);
    return c;
  };

  /** The frame `key` as a w x h canvas: `paint(ctx)` runs only when it is not cached. The key must name everything that changes the pixels. */
  function painted(key, w, h, paint) {
    return take(key, () => { const c = canvas(w, h); paint(c.getContext('2d')); return c; });
  }

  /** The same frame graded for night amount `n` and light `l` (quantised); the plain frame by day (n <= 0.02). */
  function graded(key, w, h, paint, n, l) {
    const base = painted(key, w, h, paint);
    if (!(n > 0.02)) return base;
    const nq = Math.round(n * NIGHT_STEPS), lq = Math.round(l * LIGHT_STEPS);
    return take(`${key}|${nq}|${lq}`, () => { const c = canvas(w, h); grade(c.getContext('2d'), base, nq / NIGHT_STEPS, lq / LIGHT_STEPS); return c; });
  }
  return { painted, graded, size: () => store.size };
}

/**
 * A soft ground shadow as one sprite: concentric discs of `rings` ([fraction of the radius, alpha]) of a disc of `radius` px, cached by style and
 * radius. Draw it squashed to the tilt; it is the three arc fills that used to be drawn per thing per frame.
 */
export function createShadows(canvas) {
  const sprites = new Map();
  return (style, rings, radius) => {
    const r = Math.max(1, Math.round(radius)), key = `${style}|${r}`;
    let c = sprites.get(key);
    if (!c) {
      c = canvas(r * 2, r * 2);
      const ctx = c.getContext('2d');
      for (const [f, a] of rings) { ctx.fillStyle = `rgba(8,10,30,${a})`; ctx.beginPath(); ctx.arc(r, r, r * f, 0, 6.2832); ctx.fill(); }
      sprites.set(key, c);
    }
    return c;
  };
}

/** Draws a shadow sprite from `createShadows` centred on (x, y), squashed vertically by `squash`; `alpha` fades it. */
export function drawShadow(ctx, sprite, x, y, squash, alpha = 1) {
  const w = sprite.width, h = w * squash;
  const crisp = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;                                   // a soft edge, squashed smoothly
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, 0, 0, w, w, x - w / 2, y - h / 2, w, h);
  if (alpha !== 1) ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = crisp;
}
