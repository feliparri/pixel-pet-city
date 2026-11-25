// Playable volleyball on the beach court (BEACH.court, the net across row BEACH.net.y), as pure rules: no separate screen, the match is played where the court is. A pet standing on one half gets
// "A: Jugar vóley". The ball flies in an arc over the net to a spot on the other half; the pet moves on its half and presses A as the ball comes down (a timing window, wider on a phone) to send it
// back; a miss gives the point to the other side. First to TARGET wins. The rival is a villager of the crowd (src/crowd.js) that misses sometimes, or another player: then one client is the authority
// (the lower id) that runs the rules and broadcasts every flight and point as short `vb` messages (src/protocol.js), the other mirrors them and sends its hits. Anyone else watching just draws the ball and the score.
import { BEACH } from './map.js';
import { hashSeed, mulberry32 } from './life.js';

export const TARGET = 5;
export const FLIGHT_MS = 1900;                 // from a hit to the ball landing
export const WINDOW_MS = 450;                  // the press counts this long before and after the landing (the phone's is wider)
export const PHONE_WINDOW_MS = 650;
export const REACH = 1;                        // tiles (Chebyshev) from the landing spot a hit still reaches
export const SERVE_DELAY_MS = 1400;            // the pause between a point and the next serve
export const NPC_RETURN = 0.78;                // how often the villager gets it back
export const ASK_MS = 4000;                    // a pet that asks for a rival waits this long for a player before a villager steps in
export const LABELS = { play: 'Jugar vóley', hit: 'Devolver', win: '¡Ganaste!', lose: 'Perdiste, otra vez será', wait: 'Buscando rival…' };

const C = BEACH.court, NET = BEACH.net.y;
/** Which half of the court a tile is on: 'n' (north of the net), 's' (south of it) or null (off the court, or on the net's own row). */
export function sideOf(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < C.x || x >= C.x + C.w || y < C.y || y >= C.y + C.h || y === NET) return null;
  return y < NET ? 'n' : 's';
}
export const other = (side) => (side === 'n' ? 's' : 'n');
/** The prompt for a pet standing still at (x, y) of the beach, on a half of the court; null elsewhere. */
export const volleyAt = (x, y, area = 'beach') => { const side = area === 'beach' ? sideOf(x, y) : null; return side ? { id: 'volley', label: LABELS.play, target: 'court', side } : null; };

/** A spot on `side`'s half to land the ball, from random number `r` in [0, 1): inside the lines, never on the outer column. */
export function landing(side, r1, r2) {
  const xs = C.w - 2, rows = side === 'n' ? NET - C.y : C.y + C.h - NET - 1, y0 = side === 'n' ? C.y : NET + 1;
  return [C.x + 1 + Math.floor(r1 * xs), y0 + Math.floor(r2 * rows)];
}

/**
 * A match from this client's point of view. `side`: the half the local pet plays on. `mode`: 'npc' (a villager rival), 'auth' (this client runs the rules against another player) or 'guest' (the
 * other player's client does; this one mirrors it). `by` of a ball: 'me' or 'rival'. Times are any monotonic ms.
 */
export function createMatch({ side, mode = 'npc', seed = 'match', phone = false, now = 0, peer = null }) {
  return { side, mode, peer, seed, window: phone ? PHONE_WINDOW_MS : WINDOW_MS, score: { me: 0, rival: 0 }, server: 'me', ball: null, serveAt: now + SERVE_DELAY_MS, n: 0, over: false, winner: null, rng: mulberry32(hashSeed(`volley:${seed}`)), rivalAt: null };
}

const tLand = (b) => b.t0 + b.ms;
/** Where the ball is at `now`: { x, y (tiles, fractional), lift (art px above the ground), k (0..1 through the flight), to } or null when there is none or it has landed. */
export function ballAt(m, now) {
  const b = m && m.ball;
  if (!b) return null;
  const k = (now - b.t0) / b.ms;
  if (k < 0 || k > 1.02) return null;
  const f = Math.min(1, k);
  return { x: b.from[0] + (b.to[0] - b.from[0]) * f, y: b.from[1] + (b.to[1] - b.from[1]) * f, lift: 8 + Math.sin(Math.PI * f) * 30, k: f, to: b.to, by: b.by };
}

function launch(m, by, from, to, now, ms = FLIGHT_MS) { m.n++; m.ball = { by, from, to, t0: now, ms, n: m.n, resolved: false }; }
function point(m, to, now, events) {
  m.score[to]++; m.ball = null; m.server = to; m.serveAt = now + SERVE_DELAY_MS;
  events.push({ type: 'point', to, score: { ...m.score } });
  if (m.score[to] >= TARGET) { m.over = true; m.winner = to; events.push({ type: 'end', winner: to }); }
}
const mySide = (m) => m.side, rivalSide = (m) => other(m.side);

/**
 * Advances the match to `now`; returns the events that happened: { type: 'fly', by, from, to, ms, n }, { type: 'point', to, score }, { type: 'end', winner }. `where` is the local pet's tile (a serve starts
 * from it). A guest client decides nothing: it only mirrors what the authority sent (applyFly, applyPoint).
 */
export function tick(m, now, where) {
  const events = [];
  if (m.over || m.mode === 'guest') return events;
  if (!m.ball) {
    if (now < m.serveAt) return events;
    const r = m.rng, from = m.server === 'me' ? where : (m.rivalAt || landing(rivalSide(m), 0.5, 0.5)), to = landing(m.server === 'me' ? rivalSide(m) : mySide(m), r(), r());
    launch(m, m.server, from, to, now);
    events.push({ type: 'fly', by: m.server, from, to, ms: FLIGHT_MS, n: m.n });
    return events;
  }
  const b = m.ball, due = tLand(b);
  if (b.by === 'rival') { if (now > due + m.window) point(m, 'rival', now, events); return events; }       // it came to me and I did not return it
  if (m.mode === 'npc') {                                                                                 // the villager's turn: it returns it, or it misses
    if (now < due) return events;
    if (m.rng() < NPC_RETURN) { const r = m.rng, to = landing(mySide(m), r(), r()); m.rivalAt = b.to; launch(m, 'rival', b.to, to, now); events.push({ type: 'fly', by: 'rival', from: b.to, to, ms: FLIGHT_MS, n: m.n }); } else point(m, 'me', now, events);
    return events;
  }
  if (now > due + m.window + 250) point(m, 'me', now, events);                                            // 'auth': the other player had its window and did not hit
  return events;
}

/** The local pet presses A at tile (px, py): { result: 'ok' | 'early' | 'late' | 'far' | 'none', event? }. A good hit sends the ball back (the authority and the villager's matches launch it; a guest only reports it). */
export function tryHit(m, now, px, py) {
  const b = m.ball;
  if (!b || m.over || b.by !== 'rival' || b.resolved) return { result: 'none' };
  if (now < tLand(b) - m.window) return { result: 'early' };
  if (now > tLand(b) + m.window) return { result: 'late' };
  if (Math.max(Math.abs(px - b.to[0]), Math.abs(py - b.to[1])) > REACH) return { result: 'far' };
  b.resolved = true;
  if (m.mode === 'guest') { m.ball = null; return { result: 'ok', event: { type: 'hit', from: [px, py], n: b.n } }; }
  const r = m.rng, to = landing(rivalSide(m), r(), r());
  launch(m, 'me', [px, py], to, now);
  return { result: 'ok', event: { type: 'fly', by: 'me', from: [px, py], to, ms: FLIGHT_MS, n: m.n } };
}

/** Authority only: the other player says it hit the ball number `n` from (x, y). Validated against the ball in flight; returns the flight to broadcast, or null. */
export function applyRivalHit(m, now, n, from) {
  const b = m.ball;
  if (m.mode !== 'auth' || !b || b.by !== 'me' || b.n !== n || m.over || b.resolved) return null;
  if (now < tLand(b) - m.window - 250 || now > tLand(b) + m.window + 250) return null;
  if (Math.max(Math.abs(from[0] - b.to[0]), Math.abs(from[1] - b.to[1])) > REACH + 1) return null;
  b.resolved = true;
  const r = m.rng, to = landing(mySide(m), r(), r());
  launch(m, 'rival', from, to, now);
  return { type: 'fly', by: 'rival', from, to, ms: FLIGHT_MS, n: m.n };
}

/** Guest only: the authority's flight (`by` from the authority's view is already turned into this client's 'me'/'rival' by the caller). */
export function applyFly(m, ev, now) { m.n = ev.n; m.ball = { by: ev.by, from: ev.from, to: ev.to, t0: now, ms: ev.ms, n: ev.n, resolved: false }; }
/** Guest only: the authority's point (scores from this client's view). */
export function applyPoint(m, score) {
  m.score = { ...score }; m.ball = null;
  if (m.score.me >= TARGET || m.score.rival >= TARGET) { m.over = true; m.winner = m.score.me >= TARGET ? 'me' : 'rival'; }
}
/** "3 - 2": my points first. */
export const scoreText = (m) => `${m.score.me} - ${m.score.rival}`;
/** Who is the authority between two players: the lower id. */
export const isAuthority = (myId, peerId) => myId < peerId;
