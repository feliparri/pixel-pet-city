// A pet as an upright item of the HD-2D view: its sprite (graded for the night and for the lamps that reach it), a flat ground shadow that
// stays on the ground when the pet jumps, and what goes in screen space afterwards (its name and its emote bubble). Used by the town
// and by the demo page. An entity is { id, name, look, walker, emote?, jumpAt?, fx?, gone? } as in render.js.
import { drawPet, petLayout, partAt, CELL } from '../sprites.js';
import { jumpLift } from '../jump.js';
import { entranceState, drawEntranceFx, flickers } from '../entrance.js';
import { headFrame } from '../render.js';
import { STAGES } from '../protocol.js';
import { TILE } from '../map.js';
import { project, petScaleOf } from './camera.js';
import { lightAt } from './light.js';
import { grade } from './scene.js';
import { createFrameCache, createShadows, drawShadow } from './framecache.js';
import { waterOf, SUBMERGE } from '../sea.js';
import { drawWake, drawBoard } from '../sea-draw.js';
import { lying, LIE_LIFT } from '../lounge.js';
import { lieScale, zzzAt, zzzSprite } from '../art/sleep.js';

const PET_RINGS = [[1, 0.16], [8.5 / 11, 0.2], [6 / 11, 0.24]];            // the soft ground shadow: three discs of 11, 8.5 and 6 px

export function createPetPainter(sprites) {
  // A pet's painted frames are cached by look and pose (see framecache.js), so a pet is only repainted when its pose changes. A pet's layout comes from what
  // it wears, so the common bare or lightly dressed pet stays on the small 48 x 48 one.
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const frames = createFrameCache({ canvas, grade }), shadowOf = createShadows(canvas);
  const scratches = new Map();                                                                  // one canvas per size for the show's tint
  const scratch = (w, h) => {
    const k = `${w}x${h}`;
    let c = scratches.get(k);
    if (!c) { const t = canvas(w, h); t._volatile = true; scratches.set(k, c = { t, tctx: t.getContext('2d') }); }
    return c;
  };
  const layouts = new WeakMap(), setIds = new WeakMap();
  let sets = 0;
  const layoutFor = (sp, look) => {
    let byLook = layouts.get(sp.data);
    if (!byLook) { layouts.set(sp.data, byLook = new Map()); setIds.set(sp.data, sets++); }
    const k = `${look.species}${look.stage}${look.items.join()}`;
    let lay = byLook.get(k);
    if (!lay) byLook.set(k, lay = { ...petLayout(sp.data, look), id: `${setIds.get(sp.data)}|${k}`, anim: animated(sp.data, look) });
    return lay;
  };
  /** The animated accessories a look wears as [item, placed parts]: the crown and the helmet change art over time, so their frame is part of a pet's key. */
  const animated = (data, look) => {
    const out = [], key = `${look.species}-${STAGES[look.stage]}`;
    for (const id of look.items) {
      const item = id && data.items[id];
      if (!item || !item.anim) continue;
      const worn = item.worn[key];
      out.push([item, worn ? [...worn.rest, ...(worn.flap || [])].map((w) => w[0]) : []]);
    }
    return out;
  };
  /** What an animated accessory shows at time `now`, as a key part (empty when the look wears none). */
  const animKey = (lay, now) => lay.anim.length ? lay.anim.map(([item, parts]) => parts.map((p) => partAt(item, p, now)).join()).join(';') : '';

  /** The depth-sortable item for an entity, or null when it is off screen / gone. `ctx.me` marks the local pet (its name is gold). */
  function item(e, { cam, n, now, world, me, view, wash = null, area = 'town' }) {
    if (!e || e.gone) return null;
    const p = e.walker.pos();
    if (p.x === null) return null;
    const wx = p.x * TILE + TILE / 2, wy = p.y * TILE + TILE;
    const g = project(cam, wx, wy);
    if (!g) return null;
    const s = petScaleOf(cam), cx = Math.round(g.x), cy = Math.round(g.y);
    const { w: SIZE, feetY: FEET_Y } = layoutFor(e.sprites || sprites, e.look);
    if (cx < -SIZE * s || cx > view.w + SIZE * s || cy < 0 || cy > view.h + FEET_Y * s) return null;
    const k = e.walker.moving ? Math.min(1, e.walker.t / e.walker.stepMs()) : 0;
    const ride = e.surf === 1, wiped = e.surf === 2, water = e.npc ? null : waterOf(area, e.walker) || (ride || wiped ? 'deep' : null);
    const paddle = e.surf === 3 && !!water && !ride && !wiped;                                      // with a board, a pet in the water kneels on it and paddles
    const swim = water === 'deep' && !ride && !paddle;                                              // in deep water the pet swims: its lower part is under the surface and it bobs instead of hopping; a surfer stands on its board
    const lie = !e.npc && !water && lying(area, e.walker);                                          // standing still on a lounger: lying down
    const hop = e.walker.moving && !swim && !ride && !paddle ? Math.round(Math.abs(Math.sin(k * Math.PI)) * 3) : 0;
    const bob = wiped ? Math.round(Math.sin(now / 110 + e.id.charCodeAt(0)) * 2) : swim ? Math.round(Math.sin(now / 320 + e.id.charCodeAt(0))) : 0;
    const dip = wiped ? { sink: 9, cut: 12 } : SUBMERGE, stand = ride ? 2 : 0;
    const air = jumpLift(now, e.jumpAt);
    const fx = e.fx ? entranceState(e.fx.id, e.fx.phase, now - e.fx.t0) : null;                // an arrival or an exit in progress
    const lift = fx ? Math.round(fx.lift * (cy / s + CELL + 24)) : 0;                            // game px above the spot; 1 = just above the top edge
    const sway = fx ? Math.round(fx.sway) : 0;
    return { depth: g.depth, order: 1, draw: (c, ov) => {
      const effects = (front, x, y) => { c.save(); c.translate(cx, cy); c.scale(s, s); drawEntranceFx(c, e.fx.id, fx, x, y, CELL, front); c.restore(); };
      if (fx) effects(false, 0, 0);
      if (!fx || !fx.hidden) {
        if (!water && lift < (cy / s) * 0.6) drawShadow(c, shadowOf('pet', PET_RINGS, 11 * s), cx, cy - s, Math.max(0.3, cam.sin) * 0.5, 1 - air * 0.04);   // it grows as the pet lands, and stays down in a jump
        if (!(fx && flickers(e.fx.id, e.fx.phase, now - e.fx.t0))) {
          const flap = (e.walker.moving || lift > 0) && Math.floor(now / 140) % 2 === 1;
          const L = layoutFor(e.sprites || sprites, e.look), frame = lift > 0 ? 'happy' : lie ? 'blink' : headFrame(e, now, e.id), flip = e.walker.d === 'left';
          const key = `${L.id}|${frame}|${flip ? 1 : 0}|${flap ? 1 : 0}|${hop}|${animKey(L, now)}`;
          const paint = (t) => drawPet(t, e.sprites || sprites, e.look, L.origin.x, L.origin.y - hop, { frame, flip, flap, now });
          const img = frames.graded(key, L.w, L.h, paint, n, lightAt(world.lights, wx, wy));   // night: the veil, and the warm wash where a lamp reaches
          const tint = wash ? wash(wx) : null;                                                    // a burst of the sky show washes its colour over the pet
          let src = img;
          if (tint) {                                                                             // (only during a show: it varies by the frame, so it is not cached)
            const { t, tctx } = scratch(L.w, L.h);
            tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, L.w, L.h); tctx.drawImage(img, 0, 0);
            tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = `rgba(${tint.r | 0},${tint.g | 0},${tint.b | 0},${tint.a})`; tctx.fillRect(0, 0, L.w, L.h);
            src = t;
          }
          if (ride || paddle) drawBoard(c, cx, cy - s, s, { squash: Math.max(0.3, cam.sin) * 0.6, night: n });                                   // the board under the surfer
          if (swim) { const sh = L.feetY - dip.cut; c.drawImage(src, 0, 0, L.w, sh, cx - L.feetX * s + sway * s, cy - (L.feetY + air + lift - dip.sink - bob) * s, L.w * s, sh * s); }      // only what is above the water
          else if (paddle) { const k = 0.8, bobP = Math.round(Math.sin(now / 260 + e.id.charCodeAt(0))); c.drawImage(src, 0, 0, L.w, L.h, cx - L.feetX * s + sway * s, cy - (L.feetY * k + air + lift + 1 + bobP) * s, L.w * s, L.h * k * s); }      // kneeling on the board, a little lower
          else if (lie) { const q = lieScale(now); c.drawImage(src, 0, 0, L.w, L.h, cx - L.feetX * s * q.sx + sway * s, cy - (LIE_LIFT + L.feetY * q.sy) * s, L.w * s * q.sx, L.h * s * q.sy); }      // lying flat on the seat, as the board draws a sleeping pet (squashed, eyes shut)
          else c.drawImage(src, 0, 0, L.w, L.h, cx - L.feetX * s + sway * s, cy - (L.feetY + air + lift + stand) * s, L.w * s, L.h * s);
        }
        if (wiped) { drawBoard(c, cx + 15 * s, cy + s, s, { squash: Math.max(0.3, cam.sin) * 0.6, night: n, tilt: Math.sin(now / 200) }); drawWake(c, cx, cy - s, s * 1.3, { depth: 'deep', moving: false, d: 'down', squash: Math.max(0.3, cam.sin) * 0.6, now: now * 2, night: n, seed: 3 }); }
        if (water) drawWake(c, cx, cy - (swim ? 1 : 0) * s, s, { depth: water, moving: ride || e.walker.moving, d: ride ? 'right' : e.walker.d, paddle, squash: Math.max(0.3, cam.sin) * 0.6, now, night: n, seed: e.id.charCodeAt(0) });      // rings and foam on the water instead of the ground shadow
        if (lie) for (const z of zzzAt(now, CELL)) c.drawImage(zzzSprite(), 0, 0, 12, 14, Math.round(cx + z.x * s), Math.round(cy + (z.y - LIE_LIFT) * s), Math.round(12 * z.k * s), Math.round(14 * z.k * s));      // the two Zzz drifting up from its head
        ov.labels.push({ text: e.name, x: cx + sway * s, y: cy + (2 - lift) * s, colour: e === me ? '#f8d040' : e.npc ? '#a8e6cf' : '#f4f6fa' });
      }
      if (fx) effects(true, sway, -lift);
      if (e.emote && now < e.emote.until && !lift && !(fx && fx.hidden)) ov.bubbles.push({ x: cx, y: cy - (CELL + hop + air) * s, e: e.emote.e });
      else if (e.say && !lift) ov.bubbles.push({ x: cx, y: cy - (CELL + hop) * s, text: e.say });                  // a villager's line
      if (!e.npc) ov.hits.push({ e, x: cx - 14 * s, y: cy - (CELL + air) * s, w: 28 * s, h: (CELL + 4) * s });
    } };
  }
  return { item };
}
