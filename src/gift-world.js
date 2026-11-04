// The seasonal gifts lying about the town, as the screen sees them (src/gifts.js is the pure part): which of this slot's gifts this pet has not opened, the list the
// two renderers draw (the same shape as a season's decorations: { id, x, y (feet), lift, sprite, lit, glows }, with `.glows` for the flat renderer's lamps), their
// bob and twinkle, and the burst of sparkles where one was opened. The list is rebuilt only when the slot, the season or what was opened changes; every frame costs
// one pass over at most three gifts and a few sparkles.
import { TILE } from './map.js';
import { giftsAt, createOpened, slotOf } from './gifts.js';
import { giftArt, burstFrames, BURST_FRAMES, GIFT_SIZE } from './art/gifts.js';

export const BURST_FRAME_MS = 130;                        // each of the burst's frames
export const TWINKLE_MS = 520;
const BOB_MS = 420;

/** Where a tile's gift stands: the middle of the tile, the feet on its bottom edge (world px). */
const footOf = (g) => ({ x: g.x * TILE + TILE / 2, y: g.y * TILE + TILE - 1 });

/**
 * A pet's view of the gifts of room `room`. `storage`: where the opened ids are kept (a Storage, or null); `art`: the sprites (tests pass a stand-in).
 * update(serverMs, seasons, owner, t) -> the list to draw (or null when nothing lies there), t being the screen's clock (performance.now) for the animation.
 */
export function createGiftWorld({ room, storage = null, art = { giftArt, burstFrames } }) {
  const opened = createOpened(storage);
  let sig = '', list = null, items = [], gifts = [], bursts = [];
  const phaseOf = (g) => ((g.x * 7 + g.y * 13) % 17) / 17;

  function build() {
    const out = [];
    for (const g of gifts) {
      const a = art.giftArt(g.season), f = footOf(g), left = f.x - GIFT_SIZE.w / 2;
      out.push({ id: g.id, x: f.x, y: f.y, lift: 0, sprite: a.frames[0], lit: a.lits[0], gift: g, art: a, phase: phaseOf(g), burst: null,
        glows: [{ x: left + GIFT_SIZE.w / 2, y: f.y - a.glow.z, z: a.glow.z, r: a.glow.r, rgb: a.glow.rgb }] });
    }
    for (const b of bursts) {
      const fr = art.burstFrames();
      out.push({ id: `${b.id}~0`, x: b.x, y: b.y, lift: 0, sprite: fr[0], lit: fr[0], gift: null, art: null, phase: 0, burst: b, glows: [] });
    }
    out.sort((p, q) => p.y - q.y || p.x - q.x);
    items = out;
    list = Object.assign(out.slice(), { glows: out.flatMap((d) => d.glows.map((g) => ({ kind: 'lamp', x: g.x, y: g.y, r: g.r, rgb: g.rgb }))) });      // a fresh array: the HD-2D view keys its lamp lookups by the list
    return list;
  }

  return {
    /** The list to draw now, or null. */
    update(ms, seasons, owner, t) {
      opened.owner(owner);
      const slot = slotOf(ms), here = giftsAt(room, ms, seasons);
      const key = `${slot}|${here.length ? here[0].season : ''}|${owner ?? ''}|${opened.size}|${bursts.length}`;
      if (key !== sig) {
        sig = key;
        opened.prune(slot);
        gifts = here.filter((g) => !opened.has(g.id));
        build();
      }
      if (bursts.length) {                                              // the sparkles of an opened gift last a few frames, then go
        const keep = bursts.filter((b) => t - b.t0 < BURST_FRAME_MS * BURST_FRAMES);
        if (keep.length !== bursts.length) { bursts = keep; sig = ''; return this.update(ms, seasons, owner, t); }
      }
      if (!items.length) return null;
      const fr = art.burstFrames();
      for (const d of items) {
        if (d.burst) {
          const f = Math.min(BURST_FRAMES - 1, Math.floor((t - d.burst.t0) / BURST_FRAME_MS));
          d.id = `${d.burst.id}~${f}`; d.sprite = d.lit = fr[f]; d.lift = 4 + f * 3;
        } else {
          const f = Math.floor(t / TWINKLE_MS + d.phase * 4) % 2;
          d.id = `${d.gift.id}#${f}`; d.sprite = d.art.frames[f]; d.lit = d.art.lits[f];
          d.lift = Math.round(1.5 + 1.5 * Math.sin(t / BOB_MS + d.phase * 6.28));      // a gentle bob of 0 to 3 px
        }
      }
      return list;
    },
    /** The unopened gift on tile (x, y) or on one of the eight tiles round it (the nearest first), or null. */
    near(x, y) {
      let best = null, bd = 3;
      for (const g of gifts) { const d = Math.max(Math.abs(g.x - x), Math.abs(g.y - y)), e = Math.hypot(g.x - x, g.y - y); if (d <= 1 && e < bd) { best = g; bd = e; } }
      return best;
    },
    /** The unopened gift exactly on tile (x, y), or null (a tap). */
    at(x, y) { return gifts.find((g) => g.x === x && g.y === y) || null; },
    /** The gift was opened: it goes, and a burst of sparkles plays where it lay. */
    open(id, t) {
      const g = gifts.find((x) => x.id === id);
      opened.add(id);
      if (g) { const f = footOf(g); bursts = [...bursts, { id, x: f.x, y: f.y, t0: t }]; }
      gifts = gifts.filter((x) => x.id !== id);
      sig = '';
    },
    /** The gift is gone without a burst (the server says it was opened already, or came too late). */
    dismiss(id) { opened.add(id); gifts = gifts.filter((x) => x.id !== id); sig = ''; },
    /** Opened already (by this pet, in this browser)? */
    isOpen: (id) => opened.has(id),
  };
}
