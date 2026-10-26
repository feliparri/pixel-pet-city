// The pets as the game exports them (assets/sprites.json, pets.png, parts.png): a body frame plus one layer per worn accessory.
// The sheet also holds animals that are not playable yet (bear, raccoon, elephant: sprites.json "species" lists every row, "playable" the pets
// a player can be). Only the town's NPCs wear them: protocol.js SPECIES stays the playable three, so nothing from the network can ask for them.
import { STAGES, SLOTS } from './protocol.js';

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`image: ${url}`));
  img.src = url;
});

export async function loadSprites(base = 'assets/') {
  const res = await fetch(`${base}sprites.json`);
  if (!res.ok) throw new Error(`sprites: ${res.status}`);
  const data = await res.json();
  const [pets, parts] = await Promise.all([loadImage(base + data.pets), loadImage(base + data.parts)]);
  return { data, pets, parts, catalogue: data.items };
}

export const CELL = 32;

/** Where a part's art is in parts.png: its top left corner (sprites.json partPos; the parts are packed tight, each at its partSizes size). */
const partXY = (data, part) => data.partPos[part];

/**
 * The part to draw for a placed part at time `now` (ms). An animated item (the Jamiro Crown, the "Automaton" helmet: sprites.json items.*.anim { tickMs, modeMs,
 * seq, sets }) is drawn for the width of the pet's head, so it has one set of frames per width: [[frame per tick-index] per colour mode]. A look is placed with the
 * resting art of its width's set, sets[v][0][0]. The game shows the frame the tick names (seq) in the colour mode the cycle falls in (one mode per modeMs: white with
 * mixed LEDs, pink, icy blue, red and amber), so the LEDs blink, the visor pulses, the fins step in and out and the colours change, as on the board. `now` undefined
 * (a still picture) or any other part: the part as placed.
 */
export const partAt = (item, part, now) => {
  const a = item && item.anim;
  if (!a || !Number.isFinite(now)) return part;
  const set = a.sets.find((s) => s[0][0] === part);
  return set ? set[Math.floor(now / a.modeMs) % set.length][a.seq[Math.floor(now / a.tickMs) % a.seq.length]] : part;
};

/** How far any worn part reaches beyond the pet's CELL x CELL square, in px: { top, left, right } (0 when nothing does). A painter that draws a pet on a scratch
 * canvas needs this much room around the cell, or a tall hat (the Jamiro Crown's fins) is cut off. Animated items have one size per width, so the placed art stands for all frames.
 * With a `look` it is what that pet wears; without, the worst case over every item. */
export const wornReach = (data, look) => {
  const r = { top: 0, left: 0, right: 0 };
  const key = look && `${look.species}-${STAGES[look.stage]}`;
  const items = look ? look.items.map((id) => id && data.items[id]).filter(Boolean) : Object.values(data.items);
  for (const item of items) for (const worn of look ? [item.worn[key]].filter(Boolean) : Object.values(item.worn)) for (const [part, px, py] of [...worn.rest, ...(worn.flap || [])]) {
    const w = data.partSizes[part][0];
    r.top = Math.max(r.top, -py); r.left = Math.max(r.left, -px); r.right = Math.max(r.right, px + w - CELL);
  }
  return r;
};

const MARGIN = { top: 12, side: 8, below: 4 };                              // the scratch canvas keeps at least this much around the 32 px cell (the feet are 30 rows down): 48 x 48 with nothing worn
/** The scratch canvas for a pet: the cell plus the room its tallest / widest worn part needs, so no hat is cut off (the flat view has no such canvas). With a `look`
 * only what that pet wears counts (no hat: the plain 48 x 48 canvas, not the crown's); without, every item of the sprite set. */
export function petLayout(data, look) {
  const r = wornReach(data, look), top = Math.max(MARGIN.top, r.top + 1), left = Math.max(MARGIN.side, r.left + 1), right = Math.max(MARGIN.side, r.right + 1);
  return { w: left + CELL + right, h: top + CELL + MARGIN.below, origin: { x: left, y: top }, feetX: left + CELL / 2, feetY: top + 30 };
}

/** Does the item move (its art changes over time)? The shop redraws such icons while it is open. */
export const isAnimated = (sp, key) => !!(sp.data.items[key] && sp.data.items[key].anim);

/** The frame to show: 'idle' | 'blink' | 'look' (eyes to its right) | 'chomp' | 'happy'. `now` (ms) drives an animated accessory; without it the crown rests. */
export function drawPet(ctx, sp, look, x, y, { frame = 'idle', flip = false, flap = false, now } = {}) {
  const { data } = sp;
  const key = `${look.species}-${STAGES[look.stage]}`;
  const row = data.species.indexOf(look.species) * STAGES.length + look.stage;
  const col = Math.max(0, data.frames.indexOf(frame));
  ctx.save();
  if (flip) { ctx.translate(x + CELL, y); ctx.scale(-1, 1); } else ctx.translate(x, y);
  const layer = (behind) => {
    for (const slot of data.drawOrder) {
      const id = look.items[SLOTS.indexOf(slot)];
      const worn = id && data.items[id] && data.items[id].worn[key];
      if (!worn) continue;
      for (const [placed, px, py, mirror, isBehind] of (flap && worn.flap) || worn.rest) {
        if (isBehind !== behind) continue;
        const part = partAt(data.items[id], placed, now);
        const [w, h] = data.partSizes[part];
        const [sx, sy] = partXY(data, part);
        if (mirror) {
          ctx.save();
          ctx.translate(px + w, py);
          ctx.scale(-1, 1);
          ctx.drawImage(sp.parts, sx, sy, w, h, 0, 0, w, h);
          ctx.restore();
        } else ctx.drawImage(sp.parts, sx, sy, w, h, px, py, w, h);
      }
    }
  };
  layer(1);
  ctx.drawImage(sp.pets, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
  layer(0);
  ctx.restore();
}

/** An accessory on its own (the shop and the backpack): its parts as an adult cat wears them, scaled to fit a `size` x `size` box. False when the catalogue has no art for it. */
export function drawItemIcon(ctx, sp, key, size = 40, now) {
  const def = sp.data.items[key], worn = def && (def.worn['cat-adult'] || Object.values(def.worn)[0]);
  if (!worn) return false;
  const parts = worn.rest.map(([part, px, py, mirror, behind]) => ({ part: partAt(def, part, now), px, py, mirror, behind, w: sp.data.partSizes[part][0], h: sp.data.partSizes[part][1] }));
  const x0 = Math.min(...parts.map((p) => p.px)), y0 = Math.min(...parts.map((p) => p.py));
  const bw = Math.max(...parts.map((p) => p.px + p.w)) - x0, bh = Math.max(...parts.map((p) => p.py + p.h)) - y0;
  const k = Math.max(1, Math.floor(size / Math.max(bw, bh))), ox = Math.floor((size - bw * k) / 2), oy = Math.floor((size - bh * k) / 2);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const behind of [1, 0]) {
    for (const p of parts) {
      if (p.behind !== behind) continue;
      const [sx, sy] = partXY(sp.data, p.part);
      const dx = ox + (p.px - x0) * k, dy = oy + (p.py - y0) * k;
      if (p.mirror) { ctx.save(); ctx.translate(dx + p.w * k, dy); ctx.scale(-1, 1); ctx.drawImage(sp.parts, sx, sy, p.w, p.h, 0, 0, p.w * k, p.h * k); ctx.restore(); }
      else ctx.drawImage(sp.parts, sx, sy, p.w, p.h, dx, dy, p.w * k, p.h * k);
    }
  }
  ctx.restore();
  return true;
}
