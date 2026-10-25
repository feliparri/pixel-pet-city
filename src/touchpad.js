// The on-screen controls of a phone (a Game Boy layout in landscape): a D-pad, A (jump) and B (run while held). Every control keeps its own
// pointer (setPointerCapture), so B can be held while the thumb slides on the D-pad. It only reports; town.js feeds it into the key path.
import { dpadDir } from './keys.js';

/** Asks for fullscreen and then a landscape lock: only some browsers allow it (Android Chrome), nothing depends on it. */
export function goLandscape(doc = document, scr = screen) {
  try {
    const p = doc.documentElement.requestFullscreen && doc.documentElement.requestFullscreen();
    Promise.resolve(p).then(() => scr.orientation && scr.orientation.lock && scr.orientation.lock('landscape')).catch(() => {});
  } catch { /* iOS and others: the rotate hint is enough */ }
}

/**
 * els: { dpad, a, b } elements. Calls onDir(dir | null) when the direction under the thumb changes, onJump() for A and onRun(bool) as B goes
 * down and up. Returns { destroy }.
 */
export function createTouchpad({ dpad, a, b, onDir, onJump, onRun }) {
  let asked = false;
  const first = () => { if (!asked) { asked = true; goLandscape(); } };
  const off = [];
  const on = (el, type, fn) => { el.addEventListener(type, fn); off.push(() => el.removeEventListener(type, fn)); };

  let dir = null;
  const setDir = (d) => {
    if (d === dir) return;
    dir = d;
    for (const arrow of dpad.querySelectorAll('.arrow')) arrow.classList.toggle('on', arrow.classList.contains(d));
    onDir(d);
  };
  const aim = (ev) => {
    const r = dpad.getBoundingClientRect();
    setDir(dpadDir(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2), r.width / 2));
  };
  let dpadId = null;
  on(dpad, 'pointerdown', (ev) => { ev.preventDefault(); first(); dpadId = ev.pointerId; dpad.setPointerCapture(ev.pointerId); aim(ev); });
  on(dpad, 'pointermove', (ev) => { if (ev.pointerId === dpadId) aim(ev); });
  const lift = (ev) => { if (ev.pointerId === dpadId) { dpadId = null; setDir(null); } };
  on(dpad, 'pointerup', lift); on(dpad, 'pointercancel', lift); on(dpad, 'lostpointercapture', lift);

  on(a, 'pointerdown', (ev) => { ev.preventDefault(); first(); a.setPointerCapture(ev.pointerId); a.classList.add('on'); onJump(); });
  const aUp = () => a.classList.remove('on');
  on(a, 'pointerup', aUp); on(a, 'pointercancel', aUp);

  let bId = null;
  on(b, 'pointerdown', (ev) => { ev.preventDefault(); first(); bId = ev.pointerId; b.setPointerCapture(ev.pointerId); b.classList.add('on'); onRun(true); });
  const bUp = (ev) => { if (ev.pointerId === bId) { bId = null; b.classList.remove('on'); onRun(false); } };
  on(b, 'pointerup', bUp); on(b, 'pointercancel', bUp); on(b, 'lostpointercapture', bUp);

  for (const el of [dpad, a, b]) on(el, 'contextmenu', (ev) => ev.preventDefault());
  return { destroy() { off.forEach((f) => f()); setDir(null); onRun(false); } };
}
