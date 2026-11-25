// Plays volleyball on the beach court for the local pet (the rules are src/volley.js): asking for a rival, the villager or the other player stepping in, the hits, the points, and what others who only
// watch can see. The town gives it the clock, the pet's tile and what to do for a sound, a line and the rival's pose; this module owns the match and its messages. One instance per town.
import { BEACH } from './map.js';
import { sideOf, other, volleyAt, createMatch, tick, tryHit, applyRivalHit, applyFly, applyPoint, ballAt, scoreText, isAuthority, LABELS, ASK_MS, SERVE_DELAY_MS, TARGET } from './volley.js';

const END_MS = 2200;                      // how long the final score stays up
const ASK_SEEN_MS = 5000;                 // a rival's ask is answered for this long
const SPEC_MS = 7000;                     // what a spectator keeps drawing after the last message
const STEP_MS = 240;                      // the villager rival's step
const NPC_SPOTS = { n: [55, 10], s: [55, 12] };
const court = BEACH.court;
const scorePos = { x: court.x + (court.w - 1) / 2, y: court.y - 0.25 };

/**
 * `io`: { id, phone, send(msg) (net.sendVb), cue(name), say(text, ms), emote(e), jump(), crowd (the crowd, its `rival` is set), peerTile(id) -> { x, y } | null }.
 */
export function createVolleyPlay(io) {
  let m = null, waiting = null, endAt = 0, asks = new Map(), spec = null, rival = null, lastSide = null;
  const peerMsg = (op, extra = {}) => io.send({ op, ...(m && m.peer ? { w: m.peer } : {}), ...extra });
  const reset = () => { m = null; waiting = null; rival = null; io.crowd.rival = null; };

  function begin(side, mode, peer, seed, t) {
    waiting = null;
    m = createMatch({ side, mode, peer, seed, phone: io.phone, now: t });
    const [rx, ry] = NPC_SPOTS[other(side)];
    rival = { side: other(side), x0: rx, y0: ry, x: rx, y: ry, k: 1, d: side === 'n' ? 'up' : 'down', nextAt: 0, jumpAt: null };
    io.crowd.rival = mode === 'npc' ? rival : null;
  }

  function fly(ev, t) {
    io.cue('jump');
    if (ev.by === 'rival') { rival.jumpAt = t; }
    if (m.mode === 'auth') peerMsg('fly', { by: ev.by === 'me' ? 'a' : 'g', fx: ev.from[0], fy: ev.from[1], x: ev.to[0], y: ev.to[1], m: ev.ms, n: ev.n });
  }
  function point(ev, t) {
    io.cue(ev.to === 'me' ? 'reward' : 'land');
    if (m.mode === 'auth') peerMsg('point', { a: ev.score.me, b: ev.score.rival });
  }
  function finish(winner, t) {
    endAt = t + END_MS;
    if (winner === 'me') { io.cue('reward'); io.say(LABELS.win, END_MS); io.emote('smile'); } else { io.cue('land'); io.say(LABELS.lose, END_MS); io.emote('heart'); }
  }
  function leave(send = true) {
    if (m && send && m.peer) io.send({ op: 'end', w: m.peer });
    reset();
  }

  return {
    get active() { return !!m; },
    get waiting() { return !!waiting; },
    get match() { return m; },
    /** The prompt: "Jugar vóley" on a half of the court, "Devolver" during a match, the waiting hint while it looks for a rival; null elsewhere. */
    prompt(x, y, area = 'beach') {
      if (area !== 'beach') return null;
      if (m && !m.over) return { id: 'vhit', label: LABELS.hit, target: 'court' };
      if (waiting) return { id: 'hint', label: LABELS.wait, target: 'court' };
      return m ? null : volleyAt(x, y, area);
    },
    /** A pressed on the court: asks for a rival (answering another player's ask at once) or, in a match, returns the ball. */
    press(x, y, t) {
      if (m && !m.over) return this.hit(x, y, t);
      const side = sideOf(x, y);
      if (!side || m || waiting) return false;
      for (const [id, at] of asks) {                                                              // a player on the other half asked a moment ago: play against them
        const tile = io.peerTile(id);
        if (t - at < ASK_SEEN_MS && tile && sideOf(tile.x, tile.y) === other(side)) { asks.delete(id); begin(side, isAuthority(io.id, id) ? 'auth' : 'guest', id, [io.id, id].sort().join(':'), t); io.send({ op: 'accept', w: id }); return true; }
      }
      io.send({ op: 'ask' });
      waiting = { side, until: t + ASK_MS };
      return true;
    },
    hit(x, y, t) {
      if (!m || m.over) return false;
      const r = tryHit(m, t, x, y);
      if (r.result !== 'ok') return false;
      io.jump();
      if (m.mode === 'guest') peerMsg('hit', { n: r.event.n, fx: x, fy: y });
      else fly(r.event, t);
      return true;
    },
    /** Each frame: `at` = the pet's tile { x, y, moving }. Returns { ball, score } for the renderers (or nulls), and ends the match when the pet leaves its half. */
    frame(t, at, area) {
      if (waiting && t >= waiting.until) begin(waiting.side, 'npc', null, `${io.id}:${Math.floor(t)}`, t);
      if (m && (area !== 'beach' || sideOf(at.x, at.y) !== m.side) && !m.over) leave();
      if (m && m.over && t >= endAt) reset();
      if (waiting && (area !== 'beach' || sideOf(at.x, at.y) !== waiting.side)) waiting = null;
      if (m && !m.over) {
        for (const ev of tick(m, t, [at.x, at.y])) {
          if (ev.type === 'fly') fly(ev, t); else if (ev.type === 'point') point(ev, t); else if (ev.type === 'end') finish(ev.winner, t);
        }
        if (m.over && !endAt) endAt = t + END_MS;
      }
      let ball = null, score = null;
      if (m) {
        const b = ballAt(m, t);
        if (b) ball = { x: b.x, y: b.y, lift: b.lift, k: b.k, to: b.to, mine: b.by === 'rival' };
        score = { text: scoreText(m), x: scorePos.x, y: scorePos.y };
        if (m.mode === 'npc' && rival) {                                                         // the villager walks to where the ball will land, a tile at a time, and back to its spot
          const goal = m.ball && m.ball.by === 'me' ? m.ball.to : NPC_SPOTS[rival.side];
          if (t >= rival.nextAt && (rival.x !== goal[0] || rival.y !== goal[1])) {
            rival.x0 = rival.x; rival.y0 = rival.y;
            const dx = Math.sign(goal[0] - rival.x), dy = Math.abs(goal[0] - rival.x) >= Math.abs(goal[1] - rival.y) ? 0 : Math.sign(goal[1] - rival.y);
            rival.x += dx || 0; rival.y += dx ? 0 : dy; rival.nextAt = t + STEP_MS; rival.t0 = t;
            rival.d = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
          }
          rival.k = Math.min(1, (t - (rival.t0 || 0)) / STEP_MS);
          if (rival.k >= 1) { rival.x0 = rival.x; rival.y0 = rival.y; }
          if (rival.jumpAt && t - rival.jumpAt > 400) rival.jumpAt = null;
        }
      } else if (spec && t < spec.until) {                                                       // others' match, only watched
        const f = spec.ball ? (t - spec.ball.t0) / spec.ball.ms : 2;
        if (f >= 0 && f <= 1.02) { const k = Math.min(1, f), b = spec.ball; ball = { x: b.from[0] + (b.to[0] - b.from[0]) * k, y: b.from[1] + (b.to[1] - b.from[1]) * k, lift: 8 + Math.sin(Math.PI * k) * 30, k, to: b.to, mine: false }; }
        if (spec.text) score = { text: spec.text, x: scorePos.x, y: scorePos.y };
      } else spec = null;
      return { ball, score };
    },
    /** A `vb` message from a peer (already validated). `t`: now. */
    onMessage(msg, t) {
      const from = msg.id;
      if (msg.op === 'ask') { asks.set(from, t); return; }
      if (msg.op === 'accept') { if (msg.w === io.id && waiting) begin(waiting.side, isAuthority(io.id, from) ? 'auth' : 'guest', from, [io.id, from].sort().join(':'), t); return; }
      if (m && m.peer === from && msg.w === io.id) {
        if (msg.op === 'fly' && m.mode === 'guest') { applyFly(m, { by: msg.by === 'a' ? 'rival' : 'me', from: [msg.fx, msg.fy], to: [msg.x, msg.y], ms: msg.m, n: msg.n }, t); io.cue('jump'); }
        else if (msg.op === 'hit' && m.mode === 'auth') { const ev = applyRivalHit(m, t, msg.n, [msg.fx, msg.fy]); if (ev) fly(ev, t); }
        else if (msg.op === 'point' && m.mode === 'guest') { applyPoint(m, { me: msg.b, rival: msg.a }); io.cue(msg.b > m.score.rival ? 'reward' : 'land'); if (m.over) finish(m.winner, t); }
        else if (msg.op === 'end') reset();
        return;
      }
      if (msg.op === 'fly') spec = { ball: { from: [msg.fx, msg.fy], to: [msg.x, msg.y], t0: t, ms: msg.m }, text: spec && spec.text, until: t + SPEC_MS };
      else if (msg.op === 'point') spec = { ball: null, text: `${msg.a} - ${msg.b}`, until: t + SPEC_MS };
    },
    forget(id) { asks.delete(id); if (m && m.peer === id) reset(); },
    leave,
  };
}
export { TARGET, SERVE_DELAY_MS };
