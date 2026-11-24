// The pure half of the WebGL path (?gl=1): turns canvas-2D drawImage calls into textured quads, with no DOM and no GL, so it can be tested in node.
// createQuadBatch keeps the 2D transform/alpha state and the vertex data; createRecorder is a stand-in 2D context that records what it can and
// hands everything else (fills, arcs, gradients, additive blending...) to the real context from that point of an item on.

/** ?gl=1 turns the WebGL path on (a prototype: it is off unless asked for). */
export const glWanted = (search) => new URLSearchParams(search).get('gl') === '1';

export const FLOATS = 5;                                          // per vertex: x, y (screen px), u, v (0..1), alpha
const PER_QUAD = 6 * FLOATS;                                      // two triangles

/**
 * Records quads in draw order. A run is a stretch of quads that share a source image and a filter: a run is one GL draw, so a depth-sorted
 * scene costs about one draw per change of image (the ground, 119 strips of one image, is one).
 */
export function createQuadBatch() {
  let data = new Float32Array(256 * PER_QUAD), n = 0;
  let runs = [];
  let m = [1, 0, 0, 1, 0, 0], stack = [];
  const st = { alpha: 1, smooth: false };

  const mul = (b) => { const [a0, b0, c0, d0, e0, f0] = m; m = [a0 * b[0] + c0 * b[1], b0 * b[0] + d0 * b[1], a0 * b[2] + c0 * b[3], b0 * b[2] + d0 * b[3], a0 * b[4] + c0 * b[5] + e0, b0 * b[4] + d0 * b[5] + f0]; };

  function put(x, y, u, v, a) { const i = n * FLOATS; data[i] = x; data[i + 1] = y; data[i + 2] = u; data[i + 3] = v; data[i + 4] = a; n++; }

  return {
    st,
    resetState() { m = [1, 0, 0, 1, 0, 0]; stack = []; st.alpha = 1; st.smooth = false; },
    reset() { n = 0; runs = []; this.resetState(); },
    save() { stack.push([m, st.alpha, st.smooth]); },
    restore() { const s = stack.pop(); if (s) { [m, st.alpha, st.smooth] = s; } },
    translate(x, y) { mul([1, 0, 0, 1, x, y]); },
    scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
    matrix: () => m.slice(),
    /** Same arguments as CanvasRenderingContext2D.drawImage: (img, dx, dy), (img, dx, dy, dw, dh) or (img, sx, sy, sw, sh, dx, dy, dw, dh). */
    drawImage(img, ...a) {
      const W = img.width, H = img.height;
      let sx = 0, sy = 0, sw = W, sh = H, dx, dy, dw, dh;
      if (a.length >= 8) [sx, sy, sw, sh, dx, dy, dw, dh] = a;
      else if (a.length >= 4) [dx, dy, dw, dh] = a;
      else { [dx, dy] = a; dw = W; dh = H; }
      if (!(W > 0 && H > 0) || !dw || !dh || !sw || !sh || !(st.alpha > 0)) return;
      if (n + 6 > data.length / FLOATS) { const bigger = new Float32Array(data.length * 2); bigger.set(data); data = bigger; }
      const u0 = sx / W, v0 = sy / H, u1 = (sx + sw) / W, v1 = (sy + sh) / H, al = st.alpha;
      const X = (x, y) => m[0] * x + m[2] * y + m[4], Y = (x, y) => m[1] * x + m[3] * y + m[5];
      const x0 = X(dx, dy), y0 = Y(dx, dy), x1 = X(dx + dw, dy), y1 = Y(dx + dw, dy), x2 = X(dx, dy + dh), y2 = Y(dx, dy + dh), x3 = X(dx + dw, dy + dh), y3 = Y(dx + dw, dy + dh);
      const first = n, last = runs[runs.length - 1];
      put(x0, y0, u0, v0, al); put(x1, y1, u1, v0, al); put(x2, y2, u0, v1, al);
      put(x2, y2, u0, v1, al); put(x1, y1, u1, v0, al); put(x3, y3, u1, v1, al);
      if (last && last.img === img && last.smooth === st.smooth) last.count += 6; else runs.push({ img, smooth: st.smooth, first, count: 6 });
    },
    get data() { return data; },
    get vertices() { return n; },
    get quads() { return n / 6; },
    get runs() { return runs; },
  };
}

const volatileOrEmpty = (img) => !img || img._volatile || !(img.width > 0 && img.height > 0);

/**
 * A 2D-context stand-in over `batch`. drawImage, save/restore, translate/scale, globalAlpha, imageSmoothingEnabled and the default blend mode are
 * recorded. The first thing it cannot record (any other method or property, another blend mode, a drawImage of a `_volatile` canvas whose content
 * changes between draws) calls `flush()` (which must draw what is recorded onto `real`), then carries the current state over to `real` and passes
 * everything through to it until endItem(). Items are drawn one after the other, so what comes later is still on top.
 * Returns { ctx, endItem, begin }: begin() before an item (it clears the state), endItem() after it.
 */
export function createRecorder(batch, real, { flush }) {
  let pass = false;
  const enter = () => {
    if (pass) return;
    flush();
    real.save(); real.setTransform(...batch.matrix()); real.globalAlpha = batch.st.alpha; real.imageSmoothingEnabled = batch.st.smooth;
    pass = true;
  };
  const own = {
    save: () => (pass ? real.save() : batch.save()),
    restore: () => (pass ? real.restore() : batch.restore()),
    translate: (x, y) => (pass ? real.translate(x, y) : batch.translate(x, y)),
    scale: (x, y) => (pass ? real.scale(x, y) : batch.scale(x, y)),
    drawImage(img, ...a) { if (pass) return real.drawImage(img, ...a); if (volatileOrEmpty(img)) { if (img && !(img.width > 0 && img.height > 0)) return; enter(); return real.drawImage(img, ...a); } batch.drawImage(img, ...a); },
  };
  const ctx = new Proxy({}, {
    get(_, p) {
      if (p in own) return own[p];
      if (p === 'canvas') return real.canvas;
      if (!pass) {
        if (p === 'globalAlpha') return batch.st.alpha;
        if (p === 'imageSmoothingEnabled') return batch.st.smooth;
        if (p === 'globalCompositeOperation') return 'source-over';
        enter();
      }
      const v = real[p];
      return typeof v === 'function' ? v.bind(real) : v;
    },
    set(_, p, v) {
      if (!pass) {
        if (p === 'globalAlpha') { batch.st.alpha = +v; return true; }
        if (p === 'imageSmoothingEnabled') { batch.st.smooth = !!v; return true; }
        if (p === 'globalCompositeOperation' && v === 'source-over') return true;
        enter();
      }
      real[p] = v;
      return true;
    },
  });
  return {
    ctx,
    begin() { batch.reset(); pass = false; },
    endItem() { if (pass) { real.restore(); pass = false; } batch.resetState(); },      // an item leaves the state as it found it, but a stray save is not allowed to leak into the next
    get passing() { return pass; },
  };
}
