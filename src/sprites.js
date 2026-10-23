// The pets as the game exports them (assets/sprites.json, pets.png, parts.png): a body frame plus one layer per worn accessory.
import { SPECIES, STAGES, SLOTS } from './protocol.js';

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

/** The frame to show: 'idle' | 'blink' | 'look' (eyes to its right) | 'chomp' | 'happy'. */
export function drawPet(ctx, sp, look, x, y, { frame = 'idle', flip = false, flap = false } = {}) {
  const { data } = sp;
  const key = `${look.species}-${STAGES[look.stage]}`;
  const row = SPECIES.indexOf(look.species) * STAGES.length + look.stage;
  const col = Math.max(0, data.frames.indexOf(frame));
  ctx.save();
  if (flip) { ctx.translate(x + CELL, y); ctx.scale(-1, 1); } else ctx.translate(x, y);
  const layer = (behind) => {
    for (const slot of data.drawOrder) {
      const id = look.items[SLOTS.indexOf(slot)];
      const worn = id && data.items[id] && data.items[id].worn[key];
      if (!worn) continue;
      for (const [part, px, py, mirror, isBehind] of (flap && worn.flap) || worn.rest) {
        if (isBehind !== behind) continue;
        const [w, h] = data.partSizes[part];
        const sx = (part % data.partCols) * data.partCell, sy = Math.floor(part / data.partCols) * data.partCell;
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
