// Football (Cancha), as pure rules: one ball in continuous tile units on the pitch of map.js, kicked by walking into it, two goals, two teams
// (0 = Azul, which defends the south goal and attacks the north one; 1 = Rojo). Only the referee simulates the ball and decides goals; the
// other browsers advance the last sample the referee sent with the very same fixed-step physics, so the ball glides on every screen.
import { PITCH, GOAL } from '../map.js';
import { GAME_RULES } from './rules.js';

export const SOCCER = {
  kickSpeed: 9,              // tiles a second right after a kick (a pet walks at 6)
  friction: 1.5,             // the ball loses this much speed a second (exponentially): a kick rolls about 6 tiles
  bounce: 0.6,
  radius: 0.3,
  touch: 0.95,               // a pet whose tile centre is this close to the ball kicks it
  kickCdMs: 220,             // the same pet cannot kick again at once
  tickMs: 1000 / 60,         // physics step, the same on every screen
  pauseMs: 1800,             // after a goal the ball waits on the centre spot
  stopBelow: 0.03,
  winStars: 4,
  goalsToWin: GAME_RULES.soccer.goal,
};
export const TEAMS = ['Azul', 'Rojo'];

export const centreSpot = () => ({ x: PITCH.x + PITCH.w / 2, y: PITCH.y + PITCH.h / 2 });
export const createBall = () => ({ ...centreSpot(), vx: 0, vy: 0, acc: 0, last: -1, kick: null });

/** The team a goal counts for: the north goal is scored on by Azul, the south one by Rojo. */
export const scorer = (end) => (end === 'n' ? 0 : 1);

/**
 * Advances the ball by `ms` in fixed steps (leftover time is kept in `ball.acc`). Returns 'n' or 's' when the ball crosses a goal line inside
 * the mouth (it stops there), else null. Outside the mouth the ends and the sides of the pitch bounce it back.
 */
export function advanceBall(ball, ms) {
  const dt = SOCCER.tickMs / 1000, r = SOCCER.radius, keep = Math.exp(-SOCCER.friction * dt);
  ball.acc += ms;
  while (ball.acc >= SOCCER.tickMs) {
    ball.acc -= SOCCER.tickMs;
    if (ball.vx === 0 && ball.vy === 0) continue;
    ball.vx *= keep; ball.vy *= keep;
    if (Math.hypot(ball.vx, ball.vy) < SOCCER.stopBelow) { ball.vx = 0; ball.vy = 0; continue; }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    const minX = PITCH.x + r, maxX = PITCH.x + PITCH.w - r, minY = PITCH.y + r, maxY = PITCH.y + PITCH.h - r;
    if (ball.x < minX) { ball.x = minX; ball.vx = Math.abs(ball.vx) * SOCCER.bounce; } else if (ball.x > maxX) { ball.x = maxX; ball.vx = -Math.abs(ball.vx) * SOCCER.bounce; }
    const mouth = ball.x >= GOAL.x0 && ball.x < GOAL.x1;
    if (ball.y < PITCH.y && mouth) { ball.vx = 0; ball.vy = 0; return 'n'; }
    if (ball.y >= PITCH.y + PITCH.h && mouth) { ball.vx = 0; ball.vy = 0; return 's'; }
    if (ball.y < minY && !mouth) { ball.y = minY; ball.vy = Math.abs(ball.vy) * SOCCER.bounce; } else if (ball.y > maxY && !mouth) { ball.y = maxY; ball.vy = -Math.abs(ball.vy) * SOCCER.bounce; }
  }
  return null;
}

const HEADING = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * A pet at tile `pet` ({ x, y }) kicks the ball when it touches it: the ball goes away from the pet (from its heading when they share the
 * spot, else towards the goal its team attacks). `idx` is the roster index (remembered as the last to touch the ball), `now` a clock in ms.
 * Returns true when the ball was kicked.
 */
export function kickBall(ball, pet, heading, idx, now, team = 0) {
  const dx = ball.x - (pet.x + 0.5), dy = ball.y - (pet.y + 0.5), d = Math.hypot(dx, dy);
  if (d > SOCCER.touch) return false;
  if (ball.kick && ball.kick.idx === idx && now - ball.kick.at < SOCCER.kickCdMs) return false;
  let ux, uy;
  if (d >= 0.25) { ux = dx / d; uy = dy / d; } else { [ux, uy] = HEADING[heading] || [0, team === 0 ? -1 : 1]; }
  ball.vx = ux * SOCCER.kickSpeed; ball.vy = uy * SOCCER.kickSpeed;
  ball.last = idx; ball.kick = { idx, at: now };
  return true;
}

/**
 * Teams for a roster (peer ids in order): `picks` is [[id, team], ...] in the order the players chose. A choice is honoured while its team has
 * room (half the players, rounded up); the rest, and anyone who did not choose, fill the smaller team (Azul first on a tie). One team index per
 * roster index.
 */
export function assignTeams(roster, picks) {
  const cap = Math.ceil(roster.length / 2), out = roster.map(() => -1), n = [0, 0];
  for (const [id, team] of picks) {
    const i = roster.indexOf(id);
    if (i < 0 || out[i] >= 0 || (team !== 0 && team !== 1) || n[team] >= cap) continue;
    out[i] = team; n[team]++;
  }
  return out.map((t) => { if (t >= 0) return t; const team = n[0] <= n[1] ? 0 : 1; n[team]++; return team; });
}

/** 0 Azul, 1 Rojo, -1 a draw. `f` is [Azul goals, Rojo goals]. */
export const winnerTeam = (f) => (f[0] === f[1] ? -1 : f[0] > f[1] ? 0 : 1);

/** Stars of a player of `team`: the winners earn winStars, a draw gives everybody 1; nothing when a team had nobody to play against. `sizes`: players per team. */
export function soccerStars(team, f, sizes) {
  if (sizes[0] === 0 || sizes[1] === 0) return 0;
  const w = winnerTeam(f);
  return w === -1 ? 1 : w === team ? SOCCER.winStars : 0;
}

/** Where the k-th player of a team stands at the kickoff: Azul in the south half, Rojo in the north half, spread across the width. */
export function kickoffTile(team, k) {
  const row = Math.floor(k / 6), x = PITCH.x + 2 + ((k % 6) * 5 + (row % 2) * 2) % (PITCH.w - 4);
  const y = team === 0 ? PITCH.y + PITCH.h - 4 - row : PITCH.y + 3 + row;
  return [x, y];
}