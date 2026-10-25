import test from 'node:test';
import assert from 'node:assert/strict';
import { SOCCER, createBall, advanceBall, kickBall, centreSpot, assignTeams, winnerTeam, soccerStars, kickoffTile, scorer } from '../src/games/soccer.js';
import { PITCH, GOAL, isWalkable } from '../src/map.js';

const A = 'aaaaaap', B = 'bbbbbbp', C = 'ccccccp', D = 'ddddddp', E = 'eeeeeep';

test('ball: starts on the centre spot, at rest', () => {
  const b = createBall();
  assert.deepEqual([b.x, b.y, b.vx, b.vy], [PITCH.x + PITCH.w / 2, PITCH.y + PITCH.h / 2, 0, 0]);
  assert.deepEqual(centreSpot(), { x: b.x, y: b.y });
  assert.equal(advanceBall(b, 5000), null);
  assert.deepEqual([b.x, b.y], [24, 59]);
});

test('ball: a kick sends it away from the pet, faster than a pet walks, and friction stops it', () => {
  const b = { ...createBall(), x: 24.2, y: 59.5 };
  assert.equal(kickBall(b, { x: 23, y: 59 }, null, 0, 1000), true, 'a pet on the tile next to it touches it');
  assert.ok(b.vx > 0 && Math.abs(b.vy) < 1e-9, 'it goes away from the pet (to the right)');
  assert.ok(Math.hypot(b.vx, b.vy) > 6, 'faster than the 6 tiles a second a pet walks');
  assert.equal(b.last, 0);
  const x0 = b.x;
  advanceBall(b, 500);
  assert.ok(b.x > x0 + 2);
  advanceBall(b, 8000);
  assert.ok(Math.hypot(b.vx, b.vy) < 0.05, 'it comes to rest');
  assert.ok(b.x < PITCH.x + PITCH.w, 'inside the pitch');
});

test('ball: a pet too far does not kick it, and one pet cannot kick it again within the cooldown', () => {
  const b = createBall();
  assert.equal(kickBall(b, { x: 20, y: 59 }, null, 0, 1000), false);
  assert.equal(kickBall(b, { x: 24, y: 58 }, null, 0, 1000), true, 'diagonal-ish: touching');
  const v = b.vx + b.vy;
  assert.equal(kickBall(b, { x: 24, y: 58 }, null, 0, 1000 + SOCCER.kickCdMs - 10), false);
  assert.equal(b.vx + b.vy, v);
  assert.equal(kickBall({ ...createBall(), x: 24.5, y: 58.5 }, { x: 24, y: 58 }, 'up', 1, 5000), true, 'on the same tile: it goes the way the pet faces');
});

test('ball: kicking from the same tile uses the pet\'s heading, then the goal it attacks', () => {
  const b = { ...createBall(), x: 24.5, y: 58.5 };
  kickBall(b, { x: 24, y: 58 }, 'left', 0, 0);
  assert.ok(b.vx < 0 && Math.abs(b.vy) < 1e-9);
  const c = { ...createBall(), x: 24.5, y: 58.5 };
  kickBall(c, { x: 24, y: 58 }, null, 0, 0, 0);
  assert.ok(c.vy < 0, 'Azul (team 0) with no heading kicks north, towards the goal it attacks');
});

test('ball: it bounces off the sides and the ends of the pitch outside the goal mouth', () => {
  const b = createBall();
  b.x = PITCH.x + 1; b.y = PITCH.y + 5; b.vx = -10; b.vy = 0;
  assert.equal(advanceBall(b, 600), null);
  assert.ok(b.vx > 0 || b.x >= PITCH.x, 'it came back');
  assert.ok(b.x >= PITCH.x && b.x <= PITCH.x + PITCH.w);
  const c = createBall();
  c.x = GOAL.x0 - 2; c.y = PITCH.y + 2; c.vx = 0; c.vy = -10;                      // towards the north end, left of the mouth
  assert.equal(advanceBall(c, 1000), null, 'no goal outside the mouth');
  assert.ok(c.y >= PITCH.y);
});

test('ball: crossing the north goal line inside the mouth is a goal for Azul, the south one for Rojo', () => {
  const n = createBall();
  n.x = 24; n.y = PITCH.y + 3; n.vx = 0; n.vy = -12;
  assert.equal(advanceBall(n, 1000), 'n');
  const s = createBall();
  s.x = 23; s.y = PITCH.y + PITCH.h - 3; s.vx = 0; s.vy = 12;
  assert.equal(advanceBall(s, 1000), 's');
  assert.equal(scorer('n'), 0); assert.equal(scorer('s'), 1);
});

test('ball: the same sample advanced in different slices ends in the same place (the screens agree with the referee)', () => {
  const mk = () => ({ ...createBall(), x: 20, y: 55, vx: 7, vy: -4 });
  const one = mk(), two = mk();
  advanceBall(one, 2000);
  for (let i = 0; i < 40; i++) advanceBall(two, 50);
  assert.ok(Math.abs(one.x - two.x) < 0.05 && Math.abs(one.y - two.y) < 0.05, `${one.x},${one.y} vs ${two.x},${two.y}`);
});

test('teams: balanced by default, the first choice of each player is honoured while the team has room', () => {
  assert.deepEqual(assignTeams([A, B, C, D], []), [0, 1, 0, 1], 'nobody chose: alternate');
  assert.deepEqual(assignTeams([A, B, C, D], [[B, 0], [A, 0]]), [0, 0, 1, 1], 'B and A chose Azul: they are Azul, the rest balance');
  assert.deepEqual(assignTeams([A, B, C, D], [[A, 1], [B, 1], [C, 1]]), [1, 1, 0, 0], 'three chose Rojo: the third is moved so it is two against two');
  assert.deepEqual(assignTeams([A], []), [0]);
  assert.deepEqual(assignTeams([A], [[A, 1]]), [1]);
  assert.deepEqual(assignTeams([A, B, C], [[C, 1]]), [0, 0, 1], 'odd count: sizes differ by at most one');
  const t = assignTeams([A, B, C, D, E], [[A, 0], [B, 0], [C, 0]]);
  assert.equal(t.filter((v) => v === 0).length, 3); assert.equal(t.filter((v) => v === 1).length, 2);
  assert.equal(assignTeams([A, B], [[E, 1]]).length, 2, 'a choice by someone who is not on the roster is ignored');
});

test('result: higher score wins, equal is a draw; winners earn stars, a draw gives everybody 1, losers none', () => {
  assert.equal(winnerTeam([3, 1]), 0); assert.equal(winnerTeam([0, 2]), 1); assert.equal(winnerTeam([1, 1]), -1);
  assert.equal(soccerStars(0, [3, 1], [1, 1]), SOCCER.winStars);
  assert.equal(soccerStars(1, [3, 1], [1, 1]), 0);
  assert.equal(soccerStars(0, [1, 1], [2, 2]), 1); assert.equal(soccerStars(1, [1, 1], [2, 2]), 1);
  assert.equal(soccerStars(0, [2, 0], [1, 0]), 0, 'practising alone against nobody earns no stars');
});

test('kickoff tiles: Azul in the south half, Rojo in the north half, all walkable pitch tiles, spread out', () => {
  for (let team = 0; team < 2; team++) for (let k = 0; k < 7; k++) {
    const [x, y] = kickoffTile(team, k);
    assert.ok(isWalkable(x, y) && x >= PITCH.x && x < PITCH.x + PITCH.w && y >= PITCH.y && y < PITCH.y + PITCH.h);
    assert.equal(y > PITCH.y + PITCH.h / 2, team === 0);
  }
  assert.notDeepEqual(kickoffTile(0, 0), kickoffTile(0, 1));
});
