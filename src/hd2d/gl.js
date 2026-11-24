// The WebGL layer of the HD-2D town (?gl=1, a prototype): draws the recorded quads (see glquads.js) of the ground and the sprites on an offscreen
// WebGL canvas, then lays that canvas over the 2D canvas, so the effects, the labels and everything that is not an image stay canvas 2D on top.
// Each source canvas is a texture, uploaded once and again only when the renderer says its content changed (dirty). Returns null when WebGL
// or a shader is not available: the caller then keeps the plain canvas 2D path.
import { createQuadBatch, createRecorder, FLOATS } from './glquads.js';

const VS = `attribute vec2 p; attribute vec2 uv; attribute float a; uniform vec2 res; varying vec2 vuv; varying float va;
void main() { vuv = uv; va = a; gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0); }`;
const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D tex; varying vec2 vuv; varying float va;
void main() { gl_FragColor = texture2D(tex, vuv) * va; }`;                  // textures are premultiplied, so alpha scales the whole colour

export function createGlLayer(doc = document) {
  let canvas, gl;
  try {
    canvas = doc.createElement('canvas');
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) return null;
  } catch { return null; }

  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader'); return s; };
  let prog, buf, loc;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    loc = { p: gl.getAttribLocation(prog, 'p'), uv: gl.getAttribLocation(prog, 'uv'), a: gl.getAttribLocation(prog, 'a'), res: gl.getUniformLocation(prog, 'res') };
    const stride = FLOATS * 4;
    gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(loc.a); gl.vertexAttribPointer(loc.a, 1, gl.FLOAT, false, stride, 16);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);          // premultiplied
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.clearColor(0, 0, 0, 0);
  } catch { return null; }

  let lost = false, w = 0, h = 0, frame = { quads: 0, calls: 0, uploads: 0 }, last = { quads: 0, calls: 0, uploads: 0 };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  const texs = new WeakMap();                                                   // source canvas -> { t, smooth, stale }
  const reaper = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((t) => { if (!lost) gl.deleteTexture(t); }) : null;    // a frame the cache dropped frees its texture

  function texture(img, smooth) {
    let e = texs.get(img);
    if (!e) {
      e = { t: gl.createTexture(), smooth: null, stale: true };
      texs.set(img, e);
      if (reaper) reaper.register(img, e.t);
    }
    gl.bindTexture(gl.TEXTURE_2D, e.t);
    if (e.stale) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      e.stale = false; e.smooth = null; frame.uploads++;
    }
    if (e.smooth !== smooth) {
      const f = smooth ? gl.LINEAR : gl.NEAREST;                                // the pixel art stays crisp; only the soft shadows are smoothed
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      e.smooth = smooth;
    }
  }

  const batch = createQuadBatch();
  let real = null;

  /** Draws what is recorded on the GL canvas and lays it over the 2D canvas. */
  function flush() {
    if (!real || !batch.vertices) return;
    if (canvas.width !== real.canvas.width || canvas.height !== real.canvas.height) { canvas.width = real.canvas.width; canvas.height = real.canvas.height; }
    if (w !== canvas.width || h !== canvas.height) { w = canvas.width; h = canvas.height; gl.viewport(0, 0, w, h); gl.uniform2f(loc.res, w, h); }
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bufferData(gl.ARRAY_BUFFER, batch.data.subarray(0, batch.vertices * FLOATS), gl.STREAM_DRAW);
    for (const r of batch.runs) { texture(r.img, r.smooth); gl.drawArrays(gl.TRIANGLES, r.first, r.count); }
    frame.quads += batch.quads; frame.calls += batch.runs.length;
    real.save(); real.setTransform(1, 0, 0, 1, 0, 0); real.globalAlpha = 1; real.globalCompositeOperation = 'source-over'; real.imageSmoothingEnabled = false;
    real.drawImage(canvas, 0, 0);
    real.restore();
    batch.reset();
  }

  let rec = null;
  return {
    get ok() { return !lost && !gl.isContextLost(); },
    /** Once per frame: starts the counters over. */
    startFrame() { last = frame; frame = { quads: 0, calls: 0, uploads: 0 }; },
    /** The recorder to draw with instead of `ctx` (the real 2D context); everything recorded lands on `ctx` at flush(). */
    begin(ctx) {
      if (!rec || real !== ctx) { real = ctx; rec = createRecorder(batch, ctx, { flush }); }
      rec.begin();
      return rec;
    },
    flush,
    /** The content of this source canvas changed (the ground was baked again): upload it again the next time it is drawn. */
    dirty(img) { const e = texs.get(img); if (e) e.stale = true; },
    stats: () => ({ quads: last.quads, calls: last.calls, uploads: last.uploads }),
  };
}
