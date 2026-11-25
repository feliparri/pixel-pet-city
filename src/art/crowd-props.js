// The small things the crowd's pets hold while they work or play (src/crowd.js): a hoe, a sickle, a watering can, a crate, a hay bundle, a feed sack, a fruit basket and a volleyball.
// Plain rectangles and dots drawn with code, in the pets' own px with the origin at the feet (the same space as drawHeld in src/art/treat.js), so both renderers draw them with
// the same call. `p` is { kind, k }: `k` (0..1) is how far through the prop's own loop it is (a swing, a pour, a toss), so the motion is a pure function of the clock.

/** How long one loop of each prop's motion lasts, ms: the crowd turns the clock into `k` with these (a prop that does not move has 1). */
export const PROP_MS = { stick: 1, hoe: 1500, sickle: 1300, can: 2600, crate: 1, hay: 1, sack: 2200, basket: 3200, ball: 1 };
export const PROP_KINDS = Object.keys(PROP_MS);

const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const rect = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const dot = (ctx, c, x, y) => rect(ctx, c, x, y, 1, 1);

/** A tool swung from the hand: raised slowly over the shoulder, brought down fast, then a short rest. `blade` draws the head at the end of the handle. */
function swing(ctx, dir, k, len, blade) {
  const up = k < 0.55 ? smooth(k / 0.55) : k < 0.7 ? 1 - smooth((k - 0.55) / 0.15) : 0;
  ctx.save();
  ctx.translate(dir * 9, -14); ctx.scale(dir, 1); ctx.rotate(-0.2 - up * 2.2);                // from out in front and down, to raised up behind the head
  rect(ctx, '#8a5a2b', 0, -1, len, 2);                                                           // the handle
  blade(ctx, len);
  ctx.restore();
}

const BLADES = {
  hoe: (ctx, len) => { rect(ctx, '#aab2bd', len - 1, -2, 2, 6); rect(ctx, '#6c7480', len - 1, 3, 2, 1); },
  sickle: (ctx, len) => { rect(ctx, '#d6dde6', len - 1, -1, 3, 1); rect(ctx, '#d6dde6', len + 1, 0, 2, 1); rect(ctx, '#d6dde6', len + 2, 1, 1, 2); },
};

/** Draws prop `p` for a pet standing at the origin; `flip` when it faces left. */
export function drawProp(ctx, p, flip, now, cell = 32) {
  const dir = flip ? -1 : 1, k = p.k || 0;
  if (p.kind === 'hoe') { swing(ctx, dir, k, 14, BLADES.hoe); return; }
  if (p.kind === 'sickle') { swing(ctx, dir, k, 9, BLADES.sickle); return; }
  ctx.save();
  switch (p.kind) {
    case 'can': {                                                                               // a watering can: held out, tips to pour for the middle of the loop, drops fall from its spout
      const pour = k > 0.2 && k < 0.85 ? smooth(Math.min((k - 0.2) / 0.12, (0.85 - k) / 0.12)) : 0;
      ctx.save();
      ctx.translate(dir * 11, -cell * 0.4); ctx.rotate(dir * pour * 0.45);
      rect(ctx, '#4f86c6', -3, -2, 7, 5); rect(ctx, '#8fb6e6', -3, -2, 7, 1); rect(ctx, '#3a669b', -1, -4, 3, 1);
      rect(ctx, '#4f86c6', dir > 0 ? 4 : -7, -3, 3, 1);                                         // the spout, on the side it faces
      ctx.restore();
      if (pour > 0.4) for (let i = 0; i < 4; i++) { const f = (k * 9 + i / 4) % 1; dot(ctx, '#9fd0ff', dir * (17 + f * 3), -cell * 0.38 + 2 + f * 11); dot(ctx, '#dcefff', dir * (16 + f * 3), -cell * 0.38 + f * 11); }
      break;
    }
    case 'crate': {                                                                             // a crate carried in front, high on the chest
      ctx.translate(dir * 6, -cell * 0.5);
      rect(ctx, '#7a4f27', -6, -4, 12, 9); rect(ctx, '#b07a3c', -5, -3, 10, 7); rect(ctx, '#7a4f27', -5, 0, 10, 1); rect(ctx, '#d6a05a', -5, -3, 10, 1);
      dot(ctx, '#e0453a', -2, -4); dot(ctx, '#e8a33a', 1, -5); dot(ctx, '#e0453a', 3, -4);        // what is in it: a few apples and oranges peeking out
      break;
    }
    case 'hay': {                                                                               // a hay bundle on the arms
      ctx.translate(dir * 5, -cell * 0.52);
      rect(ctx, '#c9a23c', -7, -3, 14, 8); rect(ctx, '#e8c458', -6, -4, 12, 7); rect(ctx, '#b88a2c', -1, -3, 1, 8);
      for (const x of [-7, -3, 2, 6]) dot(ctx, '#e8c458', x, -5 - (x & 1));                        // loose straws
      break;
    }
    case 'sack': {                                                                              // a feed sack held at the hip; the other hand scatters grain forward
      ctx.translate(dir * 8, -cell * 0.36);
      rect(ctx, '#8b6a3a', -3, -3, 7, 9); rect(ctx, '#c8a468', -2, -2, 5, 7); rect(ctx, '#8b6a3a', -2, -4, 3, 1);
      if (k < 0.5) { const f = k / 0.5; for (let i = 0; i < 5; i++) { const g = Math.min(1, f + i * 0.04); dot(ctx, i % 2 ? '#f1d98a' : '#e8c458', dir * (5 + g * (7 + i * 3)), -3 + g * (6 + i) - Math.sin(g * Math.PI) * 4); } }
      break;
    }
    case 'stick': {                                                                             // a toasting stick held out to the fire with a marshmallow on the end: white, then golden, then (now and then) black. `tone` 0..2, `k` through the toast
      ctx.translate(dir * 9, -cell * 0.2);
      const bob = Math.sin((p.t || 0) / 160) * 0.6;
      rect(ctx, '#8a5a2b', dir > 0 ? 0 : -14, -1 + bob, 14, 1);
      const col = ['#fbf6ec', '#e8b84a', '#2a2420'][p.tone || 0];
      rect(ctx, col, dir * 14 - (dir < 0 ? 4 : 0) - 1, -3 + bob, 4, 4); rect(ctx, (p.tone || 0) === 0 ? '#ffffff' : (p.tone === 1 ? '#f4d36a' : '#4a403a'), dir * 14 - (dir < 0 ? 4 : 0), -3 + bob, 2, 1);
      break;
    }
    case 'basket': {                                                                            // a wicker basket at the hip; a fruit drops into it from above on every pick
      ctx.translate(dir * 9, -cell * 0.34);
      rect(ctx, '#7d5a2c', -4, 0, 9, 6); rect(ctx, '#b88a4c', -3, 1, 7, 4); rect(ctx, '#7d5a2c', -3, 2, 7, 1); rect(ctx, '#7d5a2c', -4, -1, 9, 1);
      dot(ctx, '#e0453a', -2, -2); dot(ctx, '#e8a33a', 1, -2); dot(ctx, '#e0453a', 3, -1);
      if (k > 0.35 && k < 0.8) { const f = (k - 0.35) / 0.45; rect(ctx, '#e0453a', -dir * 2 + dir * f * 2, -cell * 0.45 + f * (cell * 0.45 - 4), 3, 3); }
      break;
    }
    case 'ball': {                                                                              // a volleyball: `h` (0..1) is the height of its arc over the hands, `dy` how far it has flown towards the other player (px, down the screen is positive)
      ctx.translate(dir * 2, -cell * 0.5 - Math.sin(Math.min(1, Math.max(0, p.h || 0)) * Math.PI) * cell * 0.9 + (p.dy || 0));
      rect(ctx, '#f4f6fa', -2, -3, 5, 5); rect(ctx, '#f4f6fa', -3, -2, 7, 3); rect(ctx, '#e8b84a', -1, -3, 1, 6); rect(ctx, '#7aa2d8', 1, -2, 1, 4);
      break;
    }
    default: break;
  }
  ctx.restore();
}
