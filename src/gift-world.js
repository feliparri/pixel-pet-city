// The seasonal gifts lying about the town, as the screen sees them (src/gifts.js is the pure part): which of this slot's gifts this pet has not opened, the list the
// two renderers draw (the same shape as a season's decorations: { id, x, y (feet), lift, sprite, lit, glows }, with `.glows` for the flat renderer's lamps), their
// bob and twinkle, and the burst of sparkles where one was opened. While Christmas is on, Santa's walk (src/santa.js) is part of it: the walking Santa is an item of
// the same list (no gift: nothing to open) and the gifts he dropped are gifts like the hidden ones, drawn from their own art. The list is rebuilt only when the slot,
// the season, what was opened, the gifts Santa left or the tile Santa stands on changes; every frame costs one pass over a handful of items and a few sparkles.
import { TILE } from './map.js';
import { giftsAt, createOpened, slotOf } from './gifts.js';
import { santaAt, santaGiftsAt } from './santa.js';
import { giftArt, burstFrames, BURST_FRAMES, GIFT_SIZE } from './art/gifts.js';
import { santaArt } from './art/santa.js';

export const BURST_FRAME_MS = 130;                        // each of the burst's frames
export const TWINKLE_MS = 520;
const BOB_MS = 420;

/** Where a tile's gift stands: the middle of the tile, the feet on its bottom edge (world px). */
const footOf = (g) => ({ x: g.x * TILE + TILE / 2, y: g.y * TILE + TILE - 1 });

/**
 * A pet's view of the gifts of room `room`. `storage`: where the opened ids are kept (a Storage, or null); `art`: the sprites (tests pass a stand-in).
 * update(serverMs, seasons, owner, t) -> the list to draw (or null when nothing lies there), t being the screen's clock (performance.now) for the animation.
 */
export function createGiftWorld({ room, storage = null, art = { giftArt, burstFrames, santaArt } }) {
  const opened = createOpened(storage);
  let sig = '', list = null, items = [], gifts = [], bursts = [], santaItem = null, santaGlow = null;
  const phaseOf = (g) => ((g.x * 7 + g.y * 13) % 17) / 17;

  function build(santa) {
    const out = [];
    for (const g of gifts) {
      const a = art.giftArt(g.kind === 'santa' ? 'santa' : g.season), f = footOf(g), left = f.x - GIFT_SIZE.w / 2;
      out.push({ id: g.id, x: f.x, y: f.y, lift: 0, sprite: a.frames[0], lit: a.lits[0], gift: g, art: a, phase: phaseOf(g), burst: null,
        glows: [{ x: left + GIFT_SIZE.w / 2, y: f.y - a.glow.z, z: a.glow.z, r: a.glow.r, rgb: a.glow.rgb }] });
    }
    for (const b of bursts) {
      const fr = art.burstFrames();
      out.push({ id: `${b.id}~0`, x: b.x, y: b.y, lift: 0, sprite: fr[0], lit: fr[0], gift: null, art: null, phase: 0, burst: b, glows: [] });
    }
    santaItem = null; santaGlow = null;
    if (santa) {
      const a = art.santaArt(), side = santa.dir > 0 ? 'right' : 'left';
      santaItem = { id: `santa#${side}0`, x: santa.x, y: santa.y, lift: 0, sprite: a.frames[side][0], lit: a.lits[side][0], gift: null, art: a, phase: 0, burst: null, santa: true,
        glows: [{ x: santa.x, y: santa.y - a.glow.z, z: a.glow.z, r: a.glow.r, rgb: a.glow.rgb }] };
      out.push(santaItem);
    }
    out.sort((p, q) => p.y - q.y || p.x - q.x);
    items = out;
    const glows = [];                                                                                       // the flat renderer's lamps (Santa's moves: its entry is updated in place)
    for (const d of out) for (const g of d.glows) { const lamp = { kind: 'lamp', x: g.x, y: g.y, r: g.r, rgb: g.rgb }; glows.push(lamp); if (d === santaItem) santaGlow = lamp; }
    list = Object.assign(out.slice(), { glows });                                                          // a fresh array: the HD-2D view keys its lamp lookups by the list
    return list;
  }

  return {
    /** The list to draw now, or null. */
    update(ms, seasons, owner, t) {
      opened.owner(owner);
      const slot = slotOf(ms), here = giftsAt(room, ms, seasons), left = santaGiftsAt(room, ms, seasons), santa = art.santaArt ? santaAt(room, ms, seasons) : null;
      const key = `${slot}|${here.length ? here[0].season : ''}|${owner ?? ''}|${opened.size}|${bursts.length}|${left.map((g) => g.id).join(',')}|${santa ? `${santa.dir}${Math.floor(santa.x / TILE)}` : ''}`;
      if (key !== sig) {
        sig = key;
        opened.prune(slot);
        gifts = [...here, ...left].filter((g) => !opened.has(g.id));
        build(santa);
      }
      if (bursts.length) {                                              // the sparkles of an opened gift last a few frames, then go
        const keep = bursts.filter((b) => t - b.t0 < BURST_FRAME_MS * BURST_FRAMES);
        if (keep.length !== bursts.length) { bursts = keep; sig = ''; return this.update(ms, seasons, owner, t); }
      }
      if (!items.length) return null;
      if (santaItem && santa) {                                           // Santa strolls: his position and stride change every frame, in place
        const a = santaItem.art, side = santa.dir > 0 ? 'right' : 'left';
        santaItem.x = santa.x; santaItem.y = santa.y; santaItem.id = `santa#${side}${santa.frame}`; santaItem.sprite = a.frames[side][santa.frame]; santaItem.lit = a.lits[side][santa.frame];
        santaItem.lift = santa.frame;
        santaItem.glows[0].x = santa.x; santaGlow.x = santa.x;
      }
      const fr = art.burstFrames();
      for (const d of items) {
        if (d.burst) {
          const f = Math.min(BURST_FRAMES - 1, Math.floor((t - d.burst.t0) / BURST_FRAME_MS));
          d.id = `${d.burst.id}~${f}`; d.sprite = d.lit = fr[f]; d.lift = 4 + f * 3;
        } else if (!d.santa) {
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
