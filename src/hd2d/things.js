// The town's small moving things as items of the HD-2D view: the chicken of the game, the football, the birds and the duck stand up and
// are sorted with the pets (graded for the night and the lamps); butterflies and fireflies hover; rings spread on the pond. They are drawn by
// the town's own routines (src/art/*): a routine paints at one pixel per game pixel into a small scratch canvas, which is scaled by depth.
import { TILE } from '../map.js';
import { drawChicken, CHICKEN_SIZE } from '../art/chicken.js';
import { ball as drawBall } from '../art/places.js';
import { drawCrab, drawBird, drawButterfly, drawFirefly, drawDuck, drawRing } from '../art/life.js';
import { drawAnimal, COW_SIZE, SHEEP_SIZE } from '../art/farm.js';
import { project, standAt, snapScale } from './camera.js';
import { lightAt } from './light.js';
import { grade } from './scene.js';
import { createFrameCache, createShadows, drawShadow } from './framecache.js';

const THING_RINGS = [[1, 0.14], [1 / 1.3, 0.2], [0.7 / 1.3, 0.24]];   // the soft shadow: three discs, the widest faintest
const SIZE = 64, AX = 32, AY = 52;                                   // the scratch canvas: a thing's feet are at (AX, AY)

export function createThings() {
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const frames = createFrameCache({ canvas, grade }), shadowOf = createShadows(canvas);

  /**
   * An upright thing standing at world point (wx, wy): `paint(ctx, ax, ay)` draws it with its feet at (ax, ay). `key` names its pose (everything
   * that changes the pixels), so a frame is painted and graded once and reused. `shadow` (a radius in game px, or 0) is the soft ellipse it leaves.
   */
  function stand(ctx3, wx, wy, key, paint, shadow = 0) {
    const { cam, n, world, view } = ctx3;
    const g = project(cam, wx, wy);
    if (!g) return null;
    const s = snapScale(g.scale), cx = Math.round(g.x), cy = Math.round(g.y);
    if (cx < -SIZE * s || cx > view.w + SIZE * s || cy < 0 || cy > view.h + AY * s) return null;
    return { depth: g.depth, order: 0, draw: (c) => {
      if (shadow) drawShadow(c, shadowOf('thing', THING_RINGS, shadow * 1.3 * s), cx, cy - s, Math.max(0.3, cam.sin) * 0.5);
      const img = frames.graded(key, SIZE, SIZE, (t) => paint(t, AX, AY), n, lightAt(world.lights, wx, wy));
      c.drawImage(img, 0, 0, SIZE, SIZE, cx - AX * s, cy - AY * s, SIZE * s, SIZE * s);
    } };
  }

  /** Every item for the scene's moving things: state = { chicken?, ball?, life? } as the town sends it to the renderer. */
  function items(state, ctx3, now) {
    const out = [];
    const add = (it) => { if (it) out.push(it); };
    const { chicken, ball, life } = state;
    if (chicken) {
      const hop = chicken.frame === 1 ? (Math.floor(now / 110) % 2) * 2 : 0;
      add(stand(ctx3, chicken.x * TILE + TILE / 2, chicken.y * TILE + TILE, `chicken|${chicken.frame}|${chicken.flip ? 1 : 0}|${hop}`, (c, ax, ay) => drawChicken(c, ax - CHICKEN_SIZE / 2, ay - CHICKEN_SIZE - hop, chicken.frame, chicken.flip), 5));
    }
    if (ball) add(stand(ctx3, ball.x * TILE, ball.y * TILE + 4, 'ball', (c, ax, ay) => drawBall(c, ax, ay - 4)));
    if (life) {
      for (const c of life.crabs || []) add(stand(ctx3, c.x, c.y, `crab|${c.frame}|${c.claws}`, (cx, ax, ay) => drawCrab(cx, ax, ay, c.frame, c.claws), 6));
      for (const b of life.birds) add(stand(ctx3, b.x, b.y, `bird|${b.kind}|${b.frame}|${b.flip ? 1 : 0}|${b.air}`, (c, ax, ay) => drawBird(c, ax, ay, b.kind, b.frame, b.flip, b.air)));
      if (life.duck) add(stand(ctx3, life.duck.x, life.duck.y + 4, `duck|${life.duck.frame}|${life.duck.flip ? 1 : 0}`, (c, ax, ay) => drawDuck(c, ax, ay - 4, life.duck.frame, life.duck.flip)));
      for (const a of life.animals || []) add(stand(ctx3, a.x, a.y, `animal|${a.kind}|${a.frame}|${a.flip ? 1 : 0}`, (c, ax, ay) => drawAnimal(c, a, ax, ay), (a.kind === 'cow' ? COW_SIZE : SHEEP_SIZE).w / 2 - 2));
    }
    return out;
  }

  /** What floats over the sorted scene (butterflies by day, fireflies at night, drawn additively): call after the items. */
  function air(ctx, state, cam, now, view) {
    const life = state.life;
    if (!life) return;
    for (const b of life.butterflies) {
      const p = standAt(cam, b.x, b.y, 9);
      if (!p || p.x < -40 || p.x > view.w + 40) continue;
      const s = snapScale(p.scale);
      ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(s, s); drawButterfly(ctx, 0, 0, b.frame, b.colour, b.flip); ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const f of life.fireflies) {
      const p = standAt(cam, f.x, f.y, 10);
      if (!p || p.x < -40 || p.x > view.w + 40) continue;
      const s = Math.max(1, snapScale(p.scale));
      ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(s, s); drawFirefly(ctx, 0, 0, f.glow); ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The rings on the pond: flat on the water, squashed by the tilt (draw right after the ground). */
  function rings(ctx, state, cam) {
    if (!state.life) return;
    for (const r of state.life.ripples) {
      const p = project(cam, r.x, r.y);
      if (!p) continue;
      ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(p.scale, p.scale * Math.max(0.35, cam.sin)); drawRing(ctx, 0, 0, r.radius, r.fade * 0.8); ctx.restore();
    }
  }
  return { items, air, rings };
}
