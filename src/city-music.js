// The town's music player: turns the pure song (src/city-song.js) into sound with the browser's own oscillators, in the voices of an 8-bit machine: two pulse voices (the lead, a 50 % square
// with vibrato and a quiet echo, and a 25 % pulse harmony arpeggio), a triangle bass and a noise channel for the drums. Notes are scheduled a little ahead (LOOK seconds) by one timer that
// only runs while the music plays; every note is its own short oscillator that is stopped at its end, and the voices share one gain each, so the node count stays small.
// The mood is read at each bar line, so a change of weather or place never cuts a bar: the next bar is in the new key, and the master level and the echo tail carry the change.
// step(ms, mood) is called every frame with the mood now (null: silence) and does no work beyond a check; reset() stops everything and the next start begins at bar 1 of the loop.
import { STEPS, MOODS, songBar, stepSeconds, midiToHz } from './city-song.js';

export const MUSIC_GAIN = 0.04;                    // the whole music's peak share of full scale: it plays under the ambience and the effects
const LOOK = 0.2, TICK_MS = 80, MAX_NOTES = 40;    // seconds scheduled ahead, the timer's period, the most notes sounding or waiting at once
const BUS = { lead: 0.5, harm: 0.24, bass: 0.55, kick: 0.5, snare: 0.28, hat: 0.1 };

function pulseWave(c, duty) {                       // a pulse of the given width as a periodic wave (here the 50 % square and the 25 % pulse)
  const n = 32, real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) { real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty); imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(k * Math.PI * duty)); }
  return c.createPeriodicWave(real, imag);
}

export function createCityMusic({ sound, setTimer = setInterval, clearTimer = clearInterval, later = setTimeout }) {
  let timer = null, g = null, want = null, mood = null, barN = 0, stepI = 0, nextT = 0, ends = [];

  function build(c) {
    const master = c.createGain(); master.gain.value = 0; master.connect(c.destination);
    const bus = {};
    for (const [k, v] of Object.entries(BUS)) { const b = c.createGain(); b.gain.value = v; bus[k] = b; }
    const filt = (type, f, q) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q) x.Q.value = q; return x; };
    bus.lead.connect(master); bus.harm.connect(master); bus.bass.connect(master);
    for (const [k, f] of [['kick', filt('lowpass', 180)], ['snare', filt('bandpass', 1900, 0.8)], ['hat', filt('highpass', 7000)]]) { bus[k].connect(f); f.connect(master); }
    const delay = c.createDelay(1), fb = c.createGain(), wet = c.createGain();      // the echo: a quieter copy of the lead, three steps later, that fades after a few repeats
    delay.delayTime.value = 0.3; fb.gain.value = 0.3; wet.gain.value = 0.3;
    bus.lead.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    const lfo = c.createOscillator(), depth = c.createGain();                       // one shared vibrato for every lead note (about 12 cents at 5.5 Hz)
    lfo.frequency.value = 5.5; depth.gain.value = 12; lfo.connect(depth); lfo.start();
    const noise = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * 0.5)), c.sampleRate), d = noise.getChannelData(0);
    for (let i = 0, s = 12345; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
    const waves = new Map([[0.5, pulseWave(c, 0.5)], [0.25, pulseWave(c, 0.25)]]);   // each wave is built once per context and reused by every note
    return { master, bus, delay, lfo, depth, noise, waves };
  }

  /** One pitched note: attack, a quick decay to a sustain, then a short release; the oscillator is stopped after it. */
  function tone(c, ev, t, sec, wave, vib) {
    const o = c.createOscillator(), a = c.createGain(), vel = Math.max(0.02, ev.vel), end = t + ev.len * sec;
    if (wave) o.setPeriodicWave(wave); else o.type = 'triangle';
    o.frequency.value = midiToHz(ev.midi);
    a.gain.setValueAtTime(0.0001, t);
    a.gain.linearRampToValueAtTime(vel, t + 0.008);
    a.gain.exponentialRampToValueAtTime(vel * 0.6, t + 0.008 + Math.min(0.12, ev.len * sec * 0.4));
    a.gain.setValueAtTime(vel * 0.6, Math.max(t + 0.02, end - 0.03));
    a.gain.linearRampToValueAtTime(0.0001, end + 0.02);
    o.connect(a); a.connect(g.bus[ev.v]);
    if (vib && o.detune && ev.len >= 3) g.depth.connect(o.detune);
    o.onended = () => { try { o.disconnect(); a.disconnect(); if (vib && o.detune) g.depth.disconnect(o.detune); } catch { /* gone */ } };
    o.start(t); o.stop(end + 0.04);
    return end + 0.04;
  }
  /** One drum hit: a short burst of noise through the voice's filter, and for the kick a quick falling thump. */
  function hit(c, ev, t) {
    const len = ev.v === 'hat' ? 0.04 : ev.v === 'kick' ? 0.13 : 0.14, src = c.createBufferSource(), a = c.createGain();
    src.buffer = g.noise;
    a.gain.setValueAtTime(ev.vel, t); a.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(a); a.connect(g.bus[ev.v]); src.start(t, (t * 7.3) % 0.3); src.stop(t + len + 0.02);
    src.onended = () => { try { src.disconnect(); a.disconnect(); } catch { /* gone */ } };
    if (ev.v === 'kick') {
      const o = c.createOscillator(), k = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
      k.gain.setValueAtTime(ev.vel * 1.2, t); k.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(k); k.connect(g.bus.kick); o.start(t); o.stop(t + 0.14);
      o.onended = () => { try { o.disconnect(); k.disconnect(); } catch { /* gone */ } };
    }
    return t + len + 0.02;
  }

  function play(c, ev, t, sec, m) {
    ends = ends.filter((e) => e > c.currentTime);
    if (ends.length >= MAX_NOTES) return;                                    // never more notes in flight than a phone can mix
    if (ev.v === 'lead' || ev.v === 'harm') {
      ends.push(tone(c, ev, t, sec, g.waves.get(ev.v === 'lead' ? m.duty : 0.25), ev.v === 'lead'));
    } else if (ev.v === 'bass') ends.push(tone(c, ev, t, sec, null, false));
    else ends.push(hit(c, ev, t));
  }

  function tick() {
    const c = sound.audio && sound.audio();
    if (!c || !want) { halt(); return; }
    const now = c.currentTime;
    if (nextT < now - 0.3) nextT = now + 0.05;                               // the page slept (a throttled timer): carry on from now, not in a burst
    while (nextT < now + LOOK) {
      if (stepI === 0) {                                                     // a bar line: the only place the mood may change
        mood = want;
        const m = MOODS[mood];
        g.master.gain.setTargetAtTime(MUSIC_GAIN * m.level, nextT, 0.5);
        g.delay.delayTime.setValueAtTime(stepSeconds(mood) * 3, nextT);
        g.bar = songBar(mood, barN);
      }
      const sec = stepSeconds(mood), m = MOODS[mood], swing = stepI % 2 ? m.swing * sec : 0;
      for (const ev of g.bar.steps[stepI]) play(c, ev, nextT + swing, sec, m);
      nextT += sec;
      if (++stepI === STEPS) { stepI = 0; barN++; }
    }
  }

  function halt() {
    if (timer != null) { clearTimer(timer); timer = null; }
    if (g) {
      const old = g, c = sound.audio && sound.audio();
      try { if (c) { old.master.gain.cancelScheduledValues(c.currentTime); old.master.gain.setTargetAtTime(0, c.currentTime, 0.03); } else old.master.gain.value = 0; } catch { /* closing */ }
      later(() => { try { old.lfo.stop(); old.master.disconnect(); } catch { /* gone */ } }, 400);
      g = null;
    }
    mood = null; barN = 0; stepI = 0; ends = [];
  }

  return {
    step(_ms, m) {
      want = m && MOODS[m] ? m : null;
      const c = want && sound.audio && sound.audio();
      if (!c) { if (timer != null || g) halt(); return false; }
      if (!g) { g = build(c); nextT = c.currentTime + 0.1; stepI = 0; barN = 0; timer = setTimer(tick, TICK_MS); }
      return true;
    },
    tick,
    reset() { want = null; halt(); },
    get playing() { return !!g; },
    get bar() { return barN; },
  };
}
