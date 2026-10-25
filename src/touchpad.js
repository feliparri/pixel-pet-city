// The on-screen controls of a phone in landscape: a floating virtual stick under the left thumb, A (jump) and B (run while held). Every control
// keeps its own pointer (setPointerCapture), so A or B can be used while the thumb stays on the stick. It only reports; town.js feeds it into the key path.
import { stickState } from './keys.js';

/** Asks for fullscreen and then a landscape lock: only some browsers allow it (Android Chrome), nothing depends on it. */
export function goLandscape(doc = document, scr = screen) {
  try {
    const p = doc.documentElement.requestFullscreen && doc.documentElement.requestFullscreen();
    Promise.resolve(p).then(() => scr.orientation && scr.orientation.lock && scr.orientation.lock('landscape')).catch(() => {});
  } catch { /* iOS and others: the rotate hint is enough */ }
}

/**
 * els: { stick, a, b }: `stick` is the touch zone (it holds a .stick-base and a .stick-knob). The stick appears where the thumb lands, the knob
 * follows it (clamped to the base) and both hide on release. Calls onStick({ dirs, run }) when the held directions or the run flag change
 * (see stickState), onJump() for A and onRun(bool) as B goes down and up. Returns { reset, destroy }.
 */
export function createTouchpad({ stick, a, b, onStick, onJump, onRun }) {
  let asked = false;
  const first = () => { if (!asked) { asked = true; goLandscape(); } };
  const off = [];
  const on = (el, type, fn) => { el.addEventListener(type, fn); off.push(() => el.removeEventListener(type, fn)); };

  const base = stick.querySelector('.stick-base'), knob = stick.querySelector('.stick-knob');
  let cur = { dirs: [], run: false }, stickId = null, cx = 0, cy = 0, radius = 1;
  const report = (next) => {
    if (next.run === cur.run && next.dirs.join() === cur.dirs.join()) return;
    cur = next;
    base.classList.toggle('run', next.run);
    onStick(next);
  };
  const aim = (ev) => {
    const dx = ev.clientX - cx, dy = ev.clientY - cy, d = Math.hypot(dx, dy), k = d > radius ? radius / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    report(stickState(dx, dy, radius));
  };
  on(stick, 'pointerdown', (ev) => {
    if (stickId !== null) return;                                  // one thumb drives the stick
    ev.preventDefault(); first();
    stickId = ev.pointerId; stick.setPointerCapture(ev.pointerId);
    const z = stick.getBoundingClientRect(), r = base.offsetWidth / 2 || 56;
    radius = r;
    cx = Math.min(Math.max(ev.clientX, z.left + r), z.right - r);   // the base stays inside the zone, the knob starts under the thumb
    cy = Math.min(Math.max(ev.clientY, z.top + r), z.bottom - r);
    base.style.left = `${cx - z.left}px`; base.style.top = `${cy - z.top}px`;
    stick.classList.add('on');
    aim(ev);
  });
  on(stick, 'pointermove', (ev) => { if (ev.pointerId === stickId) aim(ev); });
  const release = () => { stickId = null; stick.classList.remove('on'); knob.style.transform = ''; report({ dirs: [], run: false }); };
  const lift = (ev) => { if (ev.pointerId === stickId) release(); };
  on(stick, 'pointerup', lift); on(stick, 'pointercancel', lift); on(stick, 'lostpointercapture', lift);

  on(a, 'pointerdown', (ev) => { ev.preventDefault(); first(); a.setPointerCapture(ev.pointerId); a.classList.add('on'); onJump(); });
  const aUp = () => a.classList.remove('on');
  on(a, 'pointerup', aUp); on(a, 'pointercancel', aUp);

  let bId = null;
  on(b, 'pointerdown', (ev) => { ev.preventDefault(); first(); bId = ev.pointerId; b.setPointerCapture(ev.pointerId); b.classList.add('on'); onRun(true); });
  const bUp = (ev) => { if (ev.pointerId === bId) { bId = null; b.classList.remove('on'); onRun(false); } };
  on(b, 'pointerup', bUp); on(b, 'pointercancel', bUp); on(b, 'lostpointercapture', bUp);

  for (const el of [stick, a, b]) on(el, 'contextmenu', (ev) => ev.preventDefault());
  return {
    reset() { release(); },                                          // the zone was hidden under a panel: no pointer-up will come
    destroy() { off.forEach((f) => f()); release(); onRun(false); },
  };
}
