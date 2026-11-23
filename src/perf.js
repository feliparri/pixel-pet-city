// ?perf=1: a small box over the town with what a frame costs on this device, so a slow phone can be measured where it is played.
// createMeter (pure) keeps moving averages of named spans; perfLines turns the numbers into the box's text; attachPerfBox is the DOM glue.

const K = 0.05;                                                  // moving-average weight: about the last 20 frames

/** Moving averages in ms of named spans (mark(name, ms)) and of the interval between frames (tick(now)). */
export function createMeter() {
  const avg = {};
  let last = null, dt = 0, worst = 0;
  return {
    mark(name, ms) { if (!(ms >= 0)) return; avg[name] = avg[name] == null ? ms : avg[name] + (ms - avg[name]) * K; },
    tick(now) {
      if (last != null) {
        const raw = now - last;
        if (raw > 0 && raw < 1500) { dt = dt ? dt + (Math.min(raw, 150) - dt) * K : raw; worst = Math.max(worst * 0.98, raw); }
      }
      last = now;
    },
    read: () => ({ spans: { ...avg }, fps: dt ? 1000 / dt : 0, dt, worst }),
  };
}

const PARTS = ['suelo', 'cosas', 'efectos', 'textos'];
/** ?perf=1&skip=suelo,efectos: the HD-2D parts to leave out (only with perf=1, so a stray skip never strips the town). */
export function perfSkip(search) {
  const q = new URLSearchParams(search);
  if (q.get('perf') !== '1') return new Set();
  return new Set((q.get('skip') || '').split(',').map((x) => x.trim()).filter((x) => PARTS.includes(x)));
}

const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-');

/** The lines of the box: the mode, the frame rate, the cost of the town's logic and of each part of the drawing. */
export function perfLines({ town, hd, view }) {
  const lines = [];
  const mode = hd.mode === 'hd' ? `HD-2D nivel ${hd.level} (res ${hd.res})` : hd.autoFlat ? 'plana (caída automática)' : 'plana';
  lines.push(mode);
  lines.push(`${f1(town.fps)} fps  peor ${Math.round(town.worst)} ms`);
  lines.push(`lógica ${f1(town.spans.logic)}  dibujo ${f1(town.spans.draw)} ms`);
  if (hd.parts && hd.mode === 'hd') {
    const p = hd.parts;
    lines.push(`suelo ${f1(p.ground)}  cosas ${f1(p.items)}`);
    lines.push(`efectos ${f1(p.fx)}  textos ${f1(p.overlay)}`);
  }
  if (hd.skip && hd.skip.length) lines.push(`sin: ${hd.skip.join(', ')}`);
  if (hd.autoFlat && hd.atFall) lines.push(`al caer: nivel ${hd.atFall.level}, ${f1(hd.atFall.fps)} fps`);
  lines.push(`lienzo ${view.w}x${view.h}  dpr ${view.dpr}`);
  return lines;
}

/** Shows the box and refreshes it twice a second; returns a function that removes it. */
export function attachPerfBox(read, { doc = document, every = 500 } = {}) {
  const box = doc.createElement('pre');
  box.style.cssText = 'position:fixed;left:4px;top:4px;z-index:9999;margin:0;padding:4px 6px;background:rgba(0,0,0,.7);color:#9f9;font:11px/1.3 monospace;pointer-events:none;white-space:pre';
  doc.body.appendChild(box);
  const id = setInterval(() => { try { box.textContent = perfLines(read()).join('\n'); } catch (e) { box.textContent = String(e && e.message || e); } }, every);
  return () => { clearInterval(id); box.remove(); };
}
