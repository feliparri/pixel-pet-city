import test from 'node:test';
import assert from 'node:assert/strict';
import { BEACH, isWalkable } from '../src/map.js';
import { sideOf, other, volleyAt, landing, createMatch, tick, tryHit, ballAt, applyRivalHit, applyFly, applyPoint, scoreText, isAuthority, TARGET, FLIGHT_MS, WINDOW_MS, PHONE_WINDOW_MS, SERVE_DELAY_MS, NPC_RETURN, LABELS } from '../src/volley.js';
import { createVolleyPlay } from '../src/volley-play.js';
import { validateMessage, LIMITS } from '../src/protocol.js';
import { createNet } from '../src/net.js';

const C = BEACH.court, id = 'abcdefgh', peer = 'zyxwvuts';

test('the court has two halves split by the net row; the prompt is Jugar vóley on a half only', () => {
  assert.equal(sideOf(C.x + 2, BEACH.net.y - 1), 'n'); assert.equal(sideOf(C.x + 2, BEACH.net.y + 1), 's');
  for (const [x, y] of [[C.x + 2, BEACH.net.y], [C.x - 1, 10], [C.x + C.w, 10], [C.x, C.y - 1], [C.x, C.y + C.h]]) assert.equal(sideOf(x, y), null);
  assert.deepEqual(volleyAt(C.x + 2, 10), { id: 'volley', label: 'Jugar vóley', target: 'court', side: 'n' });
  assert.equal(volleyAt(C.x + 2, 10, 'town'), null); assert.equal(volleyAt(0, 0), null);
  assert.equal(other('n'), 's');
});

test('a landing spot is always on the asked half, inside the lines and walkable', () => {
  for (const side of ['n', 's']) for (let i = 0; i < 50; i++) { const [x, y] = landing(side, (i * 0.137) % 1, (i * 0.291) % 1); assert.equal(sideOf(x, y), side); assert.ok(isWalkable(x, y, 'beach')); assert.ok(x > C.x && x < C.x + C.w - 1); }
});

test('timing window: early and late presses do nothing, one inside it (and near the spot) sends the ball back', () => {
  const m = createMatch({ side: 'n', now: 0 });
  assert.deepEqual(tick(m, 0, [55, 10]), []);
  const [fly] = tick(m, SERVE_DELAY_MS, [55, 10]);
  assert.equal(fly.type, 'fly'); assert.equal(fly.by, 'me');
  assert.equal(sideOf(...fly.to), 's');
  const m2 = createMatch({ side: 'n', now: 0 });
  m2.server = 'rival'; tick(m2, SERVE_DELAY_MS, [55, 10]);
  const b = m2.ball, land = b.t0 + b.ms, [lx, ly] = b.to;
  assert.equal(b.by, 'rival'); assert.equal(sideOf(lx, ly), 'n');
  assert.equal(tryHit(m2, land - WINDOW_MS - 1, lx, ly).result, 'early');
  assert.equal(tryHit(m2, land + WINDOW_MS + 1, lx, ly).result, 'late');
  assert.equal(tryHit(m2, land, lx + 3, ly).result, 'far');
  const ok = tryHit(m2, land - WINDOW_MS + 10, lx + 1, ly);
  assert.equal(ok.result, 'ok'); assert.equal(ok.event.by, 'me'); assert.equal(sideOf(...ok.event.to), 's');
  assert.equal(tryHit(m2, land, lx, ly).result, 'none', 'one hit per ball');
});

test('the phone window is wider', () => {
  assert.ok(PHONE_WINDOW_MS > WINDOW_MS);
  assert.equal(createMatch({ side: 'n', phone: true }).window, PHONE_WINDOW_MS);
  assert.equal(createMatch({ side: 'n' }).window, WINDOW_MS);
});

test('scoring: a ball not returned is the rival\'s point and it serves next; first to five wins and the match is over', () => {
  const m = createMatch({ side: 'n', now: 0 });
  m.server = 'rival'; let now = SERVE_DELAY_MS; tick(m, now, [55, 10]);
  now += FLIGHT_MS + WINDOW_MS + 1;
  const ev = tick(m, now, [55, 10]);
  assert.deepEqual(ev[0], { type: 'point', to: 'rival', score: { me: 0, rival: 1 } });
  assert.equal(scoreText(m), '0 - 1'); assert.equal(m.server, 'rival'); assert.equal(m.ball, null);
  for (let i = 0; i < TARGET - 1; i++) { now += SERVE_DELAY_MS; tick(m, now, [55, 10]); now += FLIGHT_MS + WINDOW_MS + 1; tick(m, now, [55, 10]); }
  assert.equal(m.over, true); assert.equal(m.winner, 'rival'); assert.equal(scoreText(m), '0 - 5');
  assert.deepEqual(tick(m, now + 99999, [55, 10]), []);
});

test('the villager misses sometimes and returns most balls: over many serves it wins and loses points', () => {
  let wins = 0, returns = 0, n = 0;
  for (let s = 0; s < 60; s++) {
    const m = createMatch({ side: 'n', seed: `s${s}`, now: 0 });
    let now = SERVE_DELAY_MS; tick(m, now, [55, 10]); now += FLIGHT_MS + 1;
    const ev = tick(m, now, [55, 10]); n++;
    if (ev.some((e) => e.type === 'point' && e.to === 'me')) wins++; else if (ev.some((e) => e.type === 'fly' && e.by === 'rival')) returns++;
  }
  assert.ok(wins > 3 && returns > 30 && wins + returns === n, `${wins} misses, ${returns} returns`);
  assert.ok(NPC_RETURN > 0.5 && NPC_RETURN < 0.95);
});

test('the ball follows an arc: on the ground at the ends, highest in the middle, gone after landing', () => {
  const m = createMatch({ side: 'n', now: 0 }); tick(m, SERVE_DELAY_MS, [55, 10]);
  const t0 = m.ball.t0, a = ballAt(m, t0), mid = ballAt(m, t0 + FLIGHT_MS / 2), end = ballAt(m, t0 + FLIGHT_MS);
  assert.ok(mid.lift > a.lift && mid.lift > end.lift);
  assert.equal(ballAt(m, t0 + FLIGHT_MS * 2), null);
  assert.ok(mid.y > a.y || mid.y < a.y);
});

test('two players: the authority is the lower id; it validates the guest\'s hit against the ball in flight', () => {
  assert.equal(isAuthority('aaa', 'bbb'), true); assert.equal(isAuthority('bbb', 'aaa'), false);
  const m = createMatch({ side: 'n', mode: 'auth', peer, now: 0 });
  const [fly] = tick(m, SERVE_DELAY_MS, [55, 10]);
  const land = m.ball.t0 + m.ball.ms, [lx, ly] = m.ball.to;
  assert.equal(applyRivalHit(m, land - 5000, fly.n, [lx, ly]), null, 'far too early');
  assert.equal(applyRivalHit(m, land, fly.n + 1, [lx, ly]), null, 'not that ball');
  assert.equal(applyRivalHit(m, land, fly.n, [lx + 5, ly]), null, 'not near');
  const back = applyRivalHit(m, land, fly.n, [lx, ly]);
  assert.equal(back.by, 'rival'); assert.equal(sideOf(...back.to), 'n');
  assert.equal(applyRivalHit(m, land, fly.n, [lx, ly]), null, 'once');
  const miss = createMatch({ side: 'n', mode: 'auth', peer, now: 0 }); tick(miss, SERVE_DELAY_MS, [55, 10]);
  const ev = tick(miss, miss.ball.t0 + miss.ball.ms + WINDOW_MS + 300, [55, 10]);
  assert.equal(ev[0].to, 'me');
});

test('a guest mirrors: it plays the authority\'s flights and points and decides nothing', () => {
  const g = createMatch({ side: 's', mode: 'guest', peer: id, now: 0 });
  assert.deepEqual(tick(g, 99999, [55, 12]), []);
  applyFly(g, { by: 'rival', from: [55, 10], to: [56, 12], ms: FLIGHT_MS, n: 3 }, 1000);
  assert.equal(ballAt(g, 1500).by, 'rival');
  const hit = tryHit(g, 1000 + FLIGHT_MS, 56, 12);
  assert.deepEqual([hit.result, hit.event.type, hit.event.n], ['ok', 'hit', 3]);
  applyPoint(g, { me: 5, rival: 3 });
  assert.deepEqual([g.over, g.winner], [true, 'me']);
});

test('protocol: the vb message is validated field by field, and limited', () => {
  const v = (extra) => validateMessage({ t: 'vb', id, ...extra });
  assert.deepEqual(v({ op: 'ask' }), { t: 'vb', id, op: 'ask' });
  assert.equal(v({ op: 'accept' }), null); assert.equal(v({ op: 'accept', w: peer }).w, peer);
  const fly = { op: 'fly', by: 'a', fx: 55, fy: 10, x: 56, y: 12, m: 1900, n: 4, w: peer };
  assert.deepEqual(v(fly), { t: 'vb', id, ...fly });
  for (const bad of [{ by: 'x' }, { fx: -1 }, { x: 80 }, { m: 10 }, { m: 99999 }, { n: 1.5 }, { y: '12' }]) assert.equal(v({ ...fly, ...bad }), null, JSON.stringify(bad));
  assert.deepEqual(v({ op: 'point', a: 3, b: 2, w: peer, junk: 1 }), { t: 'vb', id, op: 'point', a: 3, b: 2, w: peer });
  assert.equal(v({ op: 'point', a: 10, b: 2, w: peer }), null); assert.equal(v({ op: 'hit', fx: 1, fy: 2, n: 3 }), null);
  assert.equal(v({ op: 'nope' }), null); assert.ok(LIMITS.vb);
});

test('net: a vb message goes out with the id and comes in as an event', async () => {
  const sent = [];
  const timers = { setInterval: () => 1, clearInterval() {}, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {} };
  const wire = { name: 'fake', async open() { return { send: (m) => sent.push(m), close() {} }; } };
  const net = createNet({ wire, catalogue: {}, now: () => 5000, timers });
  await net.join('FOCA-LUNA-42', { name: 'A', look: { species: 'frog', stage: 1, items: ['', '', '', ''] } });
  assert.equal(net.sendVb({ op: 'ask' }), true);
  assert.deepEqual(sent.at(-1), { t: 'vb', id: sent.at(-1).id, op: 'ask' });
  assert.equal(net.sendVb(null), false);
});

function harness(over = {}) {
  const log = { sent: [], cues: [], said: [] }, crowd = { rival: null };
  const io = { id, phone: false, crowd, send: (m) => log.sent.push(m), cue: (c) => log.cues.push(c), say: (t) => log.said.push(t), emote() {}, jump() {}, peerTile: () => null, ...over };
  return { play: createVolleyPlay(io), log, crowd };
}

test('play: pressing on the court asks for a rival; with nobody answering a villager steps in after a few seconds and the other volley player stops its rally', () => {
  const { play, log, crowd } = harness();
  assert.equal(play.prompt(C.x + 3, 10).label, 'Jugar vóley');
  play.press(C.x + 3, 10, 0);
  assert.deepEqual(log.sent, [{ op: 'ask' }]); assert.equal(play.waiting, true); assert.equal(play.prompt(C.x + 3, 10).label, LABELS.wait);
  play.frame(1000, { x: C.x + 3, y: 10 }, 'beach'); assert.equal(play.active, false);
  play.frame(4100, { x: C.x + 3, y: 10 }, 'beach');
  assert.equal(play.active, true); assert.equal(play.match.mode, 'npc'); assert.equal(crowd.rival.side, 's');
  assert.equal(play.prompt(C.x + 3, 10).label, 'Devolver');
});

test('play: leaving the court ends the match and frees the villager', () => {
  const { play, crowd } = harness();
  play.press(C.x + 3, 10, 0); play.frame(4100, { x: C.x + 3, y: 10 }, 'beach'); assert.ok(play.active);
  play.frame(4200, { x: C.x + 3, y: 8 }, 'beach');
  assert.equal(play.active, false); assert.equal(crowd.rival, null);
});

test('play: a full match against the villager ends with the win or loss line and a sound', () => {
  const { play, log } = harness();
  play.press(C.x + 3, 10, 0); let t = 4100; const at = { x: C.x + 3, y: 10 };
  play.frame(t, at, 'beach');
  for (let i = 0; i < 4000 && !play.match.over; i++) { t += 50; const f = play.frame(t, at, 'beach'); if (f.ball && f.ball.mine && f.ball.k > 0.9) play.hit(f.ball.to[0], f.ball.to[1], t); }
  assert.ok(play.match.over);
  assert.ok(log.said.includes(LABELS.win) || log.said.includes(LABELS.lose));
  assert.ok(log.cues.includes('reward') || log.cues.includes('land'));
});

test('play: two players pair up (the later one answers the ask), the lower id is the authority, and the guest sends its hit', () => {
  const a = harness({ id: 'aaaaaaaa', peerTile: () => null }), b = harness({ id: 'bbbbbbbb', peerTile: (p) => (p === 'aaaaaaaa' ? { x: C.x + 3, y: 10 } : null) });
  a.play.press(C.x + 3, 10, 0);
  b.play.onMessage({ t: 'vb', id: 'aaaaaaaa', op: 'ask' }, 100);
  b.play.press(C.x + 3, 12, 200);
  assert.deepEqual(b.log.sent.at(-1), { op: 'accept', w: 'aaaaaaaa' });
  assert.equal(b.play.match.mode, 'guest');
  a.play.onMessage({ t: 'vb', id: 'bbbbbbbb', op: 'accept', w: 'aaaaaaaa' }, 250);
  assert.equal(a.play.match.mode, 'auth');
});

test('play: someone who only watches sees the ball and the score from the messages', () => {
  const { play } = harness();
  play.onMessage({ t: 'vb', id: peer, op: 'fly', by: 'a', fx: 55, fy: 10, x: 56, y: 12, m: 1900, n: 1, w: 'other123' }, 1000);
  const f = play.frame(1500, { x: 20, y: 20 }, 'beach');
  assert.ok(f.ball && f.ball.lift > 8);
  play.onMessage({ t: 'vb', id: peer, op: 'point', a: 3, b: 2, w: 'other123' }, 3000);
  assert.equal(play.frame(3100, { x: 20, y: 20 }, 'beach').score.text, '3 - 2');
  assert.equal(play.frame(99999, { x: 20, y: 20 }, 'beach').score, null);
});
