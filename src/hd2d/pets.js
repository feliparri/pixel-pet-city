// A pet as an upright item of the HD-2D view: its sprite (graded for the night and for the lamps that reach it), a flat ground shadow that
// stays on the ground when the pet jumps, and what goes in screen space afterwards (its name and its emote bubble). Used by the town
// and by the demo page. An entity is { id, name, look, walker, emote?, jumpAt?, fx?, gone? } as in render.js.
import { drawPet, CELL } from '../sprites.js';
import { jumpLift } from '../jump.js';
import { entranceState, drawEntranceFx, flickers } from '../entrance.js';
import { headFrame } from '../render.js';
import { TILE } from '../map.js';
import { project, snapScale } from './camera.js';
import { lightAt } from './light.js';
import { grade } from './scene.js';

const SIZE = 48, FEET_X = 24, FEET_Y = 42, ORIGIN = { x: 8, y: 12 };      // the scratch canvas: the 32 px cell sits at (8, 12), its feet 30 rows below

export function createPetPainter(sprites) {
  const tmp = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE }), tctx = tmp.getContext('2d');

  /** The depth-sortable item for an entity, or null when it is off screen / gone. `ctx.me` marks the local pet (its name is gold). */
  function item(e, { cam, n, now, world, me, view }) {
    if (!e || e.gone) return null;
    const p = e.walker.pos();
    if (p.x === null) return null;
    const wx = p.x * TILE + TILE / 2, wy = p.y * TILE + TILE;
    const g = project(cam, wx, wy);
    if (!g) return null;
    const s = snapScale(g.scale), cx = Math.round(g.x), cy = Math.round(g.y);
    if (cx < -SIZE * s || cx > view.w + SIZE * s || cy < 0 || cy > view.h + FEET_Y * s) return null;
    const k = e.walker.moving ? Math.min(1, e.walker.t / e.walker.stepMs()) : 0;
    const hop = e.walker.moving ? Math.round(Math.abs(Math.sin(k * Math.PI)) * 3) : 0;
    const air = jumpLift(now, e.jumpAt);
    const fx = e.fx ? entranceState(e.fx.id, e.fx.phase, now - e.fx.t0) : null;                // an arrival or an exit in progress
    const lift = fx ? Math.round(fx.lift * (cy / s + CELL + 24)) : 0;                            // game px above the spot; 1 = just above the top edge
    const sway = fx ? Math.round(fx.sway) : 0;
    return { depth: g.depth, order: 1, draw: (c, ov) => {
      const effects = (front, x, y) => { c.save(); c.translate(cx, cy); c.scale(s, s); drawEntranceFx(c, e.fx.id, fx, x, y, CELL, front); c.restore(); };
      if (fx) effects(false, 0, 0);
      if (!fx || !fx.hidden) {
        if (lift < (cy / s) * 0.6) {                                                             // the shadow: it grows as the pet lands, and stays down in a jump
          c.save(); c.translate(cx, cy - s); c.scale(1, Math.max(0.3, cam.sin) * 0.5);
          for (const [r, a] of [[11, 0.16], [8.5, 0.2], [6, 0.24]]) { c.fillStyle = `rgba(8,10,30,${a * (1 - air * 0.04)})`; c.beginPath(); c.arc(0, 0, r * s, 0, 6.2832); c.fill(); }
          c.restore();
        }
        if (!(fx && flickers(e.fx.id, e.fx.phase, now - e.fx.t0))) {
          const flap = (e.walker.moving || lift > 0) && Math.floor(now / 140) % 2 === 1;
          tctx.clearRect(0, 0, SIZE, SIZE);
          drawPet(tctx, sprites, e.look, ORIGIN.x, ORIGIN.y - hop, { frame: lift > 0 ? 'happy' : headFrame(e, now, e.id), flip: e.walker.d === 'right', flap });
          if (n > 0.02) grade(tctx, tmp, n, lightAt(world.lights, wx, wy));                      // night: the veil, and the warm wash where a lamp reaches
          c.drawImage(tmp, 0, 0, SIZE, SIZE, cx - FEET_X * s + sway * s, cy - (FEET_Y + air + lift) * s, SIZE * s, SIZE * s);
        }
        ov.labels.push({ text: e.name, x: cx + sway * s, y: cy + (2 - lift) * s, colour: e === me ? '#f8d040' : '#f4f6fa' });
      }
      if (fx) effects(true, sway, -lift);
      if (e.emote && now < e.emote.until && !lift && !(fx && fx.hidden)) ov.bubbles.push({ x: cx, y: cy - (CELL + hop + air) * s, e: e.emote.e });
      ov.hits.push({ e, x: cx - 14 * s, y: cy - (CELL + air) * s, w: 28 * s, h: (CELL + 4) * s });
    } };
  }
  return { item };
}
