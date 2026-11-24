// The sounds of fishing, all from the town's synth (src/sound.js notes: no audio files). `cuesFor` maps the rules' events to lists of notes (pure, tested);
// the controller plays them. A catch's fanfare grows with the fish's rarity.
import { note, rest, W, N } from '../sound.js';

const sq = (f, ms, vol = 170, wave = W.SQ25) => note(wave, f, f, ms, vol);

export const CAST = [note(W.NOISE, 6000, 2400, 110, 90), note(W.TRI, 260, 980, 110, 130)];            // a whoosh
export const PLOP = [note(W.TRI, 760, 170, 80, 240)];                                                  // the float hits the water
export const NIBBLE = [note(W.SQ12, 1500, 1500, 14, 110)];                                            // a soft tick
export const BITE = [sq(N.E6, 55, 210), sq(N.G6, 55, 210), sq(N.E6, 55, 210), sq(N.G6, 110, 210)];    // a sharp cue
export const HOOK = [note(W.SQ50, 400, 760, 60, 170)];                                                // the reel starts
export const SNAP = [note(W.NOISE, 9000, 3000, 150, 210), note(W.TRI, 620, 120, 220, 240)];
export const ESCAPE = [note(W.TRI, N.G4, N.G4, 110, 210), note(W.TRI, N.D4, N.C4, 240, 210)];
export const CHARGE = [note(W.TRI, 300, 300, 22, 130)];

/** A catch's fanfare: a short one for a common fish, a longer one for a rare fish, a long climbing one with a trill for an epic one. */
export const FANFARE = {
  common: [sq(N.C5, 80, 160, W.SQ50), sq(N.E5, 80, 160, W.SQ50), sq(N.G5, 80, 160, W.SQ50), sq(N.C6, 220, 160, W.SQ50)],
  rare: [sq(N.C5, 80, 170, W.SQ50), sq(N.E5, 80, 170, W.SQ50), sq(N.G5, 80, 170, W.SQ50), sq(N.C6, 80, 170, W.SQ50), rest(30), sq(N.G5, 70, 170, W.SQ50), sq(N.C6, 70, 170, W.SQ50), sq(N.E6, 300, 170, W.SQ50)],
  epic: [sq(N.C5, 70, 180, W.SQ50), sq(N.E5, 70, 180, W.SQ50), sq(N.G5, 70, 180, W.SQ50), sq(N.C6, 70, 180, W.SQ50), sq(N.E6, 70, 180, W.SQ50), sq(N.G6, 90, 190, W.SQ50), rest(40),
    sq(N.E6, 60, 180), sq(N.G6, 60, 180), sq(N.E6, 60, 180), sq(N.G6, 60, 180), sq(N.C7, 420, 190, W.SQ50)],
};

/** The tick of the reel: higher while the marker is on the fish's zone, dull while it is off. */
export const reelClick = (inside) => [note(W.SQ12, inside ? 1250 : 620, inside ? 1250 : 620, 14, inside ? 150 : 120)];
export const REEL_CLICK_S = 0.28;                                // seconds between two clicks

/** The note lists for one step's events: [{ name, notes }] in order. `fish` (the run's fish) sets the fanfare. A step can carry several (a land and a nibble). */
export function cuesFor(events, fish = null) {
  const out = [];
  for (const e of events || []) {
    if (e === 'charge') out.push({ name: e, notes: CHARGE });
    else if (e === 'cast') out.push({ name: e, notes: CAST });
    else if (e === 'land') out.push({ name: e, notes: PLOP });
    else if (e === 'nibble') out.push({ name: e, notes: NIBBLE });
    else if (e === 'bite') out.push({ name: e, notes: BITE });
    else if (e === 'reel') out.push({ name: e, notes: HOOK });
    else if (e === 'snap') out.push({ name: e, notes: SNAP });
    else if (e === 'escape') out.push({ name: e, notes: ESCAPE });
    else if (e === 'catch') out.push({ name: e, notes: FANFARE[fish && FANFARE[fish.rarity] ? fish.rarity : 'common'] });
  }
  return out;
}

/** Plays a step's events on `player` ({ playNotes }) the way the rules ordered them; when several come at once the last one wins the single voice, so the most important is last. Returns how many were sent. */
export function playEvents(player, events, fish = null) {
  let n = 0;
  for (const c of cuesFor(events, fish)) { try { player.playNotes(c.notes); n++; } catch { /* sound is optional */ } }
  return n;
}
