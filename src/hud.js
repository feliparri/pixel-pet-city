// The game's overlay: the play button on a pad, the invitation, the lobby and game bars, banners, toasts and the results.
// It only reads what the town reports (`update(info)`, see town.js) and calls back what the buttons do; no game rules here.
import { GAME_RULES } from './games/rules.js';
import { GAME_PLACES, HIDE_ZONES } from './map.js';

const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));
const clock = (ms) => { const s = secs(ms); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The banner text for a game, or ''. */
export function bannerText(game) {
  if (!game || !game.play) return '';
  if (game.g === 'hide' && game.phase === 'count') return game.role === 'seeker' ? `Contando... ${secs(game.left)}` : `¡Escóndete! ${secs(game.left)}`;
  if (game.g === 'hide' && game.role === 'found') return '¡Te encontraron! Mira el juego';
  return '';
}

/** The line in the game bar. */
export function barText(info) {
  const { lobby, game } = info;
  if (lobby) return `${lobby.name}${lobby.zoneName ? ` · ${lobby.zoneName}` : ''}: esperando jugadores (${lobby.joined}) ${secs(lobby.left)}`;
  if (!game) return '';
  const watching = game.play ? '' : ' · Mirando';
  if (game.g === 'hide') return `${game.name}${game.zoneName ? ` (${game.zoneName})` : ''} · ${game.phase === 'count' ? `Cuenta ${secs(game.left)}` : clock(game.left)} · Faltan ${game.hidersLeft}${watching}`;
  const score = game.scores.map((s) => `${s.name} ${s.n}`).join(' · ');
  return `${game.name} · ${clock(game.left)} · ${score}${watching}`;
}

/** Result rows as text: [{ text, win }]. */
export function resultLines(res) {
  return res.rows.map((r) => {
    const who = res.names[r.i];
    if (res.g === 'chicken') return { text: `${who}: ${r.found} ${r.found === 1 ? 'gallina' : 'gallinas'}`, win: r.found === Math.max(...res.rows.map((x) => x.found)) && r.found > 0 };
    if (r.role === 'seeker') return { text: `${who} (buscaba): encontró a ${res.rows.filter((x) => x.found >= 0 && x.role === 'hider').length}`, win: r.stars > 0 };
    if (r.found === -2) return { text: `${who}: salió del juego`, win: false };
    if (r.found === -1) return { text: `${who}: ¡no lo encontraron!`, win: true };
    return { text: `${who}: lo encontraron a los ${r.found} s`, win: false };
  });
}

export function createHud($, { onPlay, onJoin, onSeek, onLeave, onDismiss, onZone = () => {} }) {
  $('game-play').addEventListener('click', onPlay);
  $('invite-join').addEventListener('click', onJoin);
  $('game-seek').addEventListener('click', onSeek);
  $('game-exit').addEventListener('click', onLeave);
  $('results-close').addEventListener('click', onDismiss);
  const zoneButtons = Array.from($('zone-pick').querySelectorAll('button'));
  for (const b of zoneButtons) { b.textContent = HIDE_ZONES[b.dataset.zone].name; b.addEventListener('click', () => onZone(b.dataset.zone)); }
  let toastKey = '', resultKey = null;

  return {
    update(info) {
      const { lobby, game, results, notices } = info;
      const playBtn = $('game-play');
      const canStart = info.spot && !lobby && !game;
      playBtn.hidden = !canStart;
      if (canStart) {
        const rules = GAME_RULES[info.spot];
        playBtn.textContent = rules ? rules.play : `${GAME_PLACES[info.spot].name}: pronto`;
        playBtn.disabled = !rules;
      }
      $('invite').hidden = !(lobby && !lobby.iJoined);
      if (lobby) $('invite-text').textContent = `${lobby.invite} ${secs(lobby.left)}`;
      const seekBtn = $('game-seek');
      seekBtn.hidden = !(lobby && lobby.canVolunteer);
      if (lobby) { seekBtn.disabled = lobby.iVolunteered; seekBtn.textContent = lobby.iVolunteered ? '¡Tú buscas!' : '¡Yo busco!'; }
      $('zone-pick').hidden = !(lobby && lobby.zone && lobby.iJoined);                 // the zone of a hide and seek: the first to choose decides
      if (lobby && lobby.zone) for (const b of zoneButtons) { b.setAttribute('aria-pressed', String(b.dataset.zone === lobby.zone)); b.disabled = !lobby.canPickZone; }
      const inGame = !!(lobby && lobby.iJoined) || !!(game && game.play);
      $('game-bar').hidden = !(inGame || game);
      $('game-info').textContent = barText(info);
      $('game-exit').hidden = !inGame;
      const banner = bannerText(game);
      $('banner').hidden = !banner;
      $('banner').textContent = banner;
      const shown = notices.filter((n) => n.kind !== 'invite');
      const key = shown.map((n) => n.text).join('|');
      if (key !== toastKey) {
        toastKey = key;
        $('toasts').replaceChildren(...shown.map((n) => { const d = document.createElement('div'); d.className = `toast ${n.kind}`; d.textContent = n.text; return d; }));
      }
      $('results').hidden = !results;
      if (results && resultKey !== results) {
        resultKey = results;
        $('results-title').textContent = results.g === 'hide' ? '¡Terminó la escondida!' : '¡Terminó la gallina!';
        $('results-list').replaceChildren(...resultLines(results).map((l) => { const li = document.createElement('li'); li.textContent = l.text; if (l.win) li.className = 'win'; return li; }));
        $('results-stars').textContent = results.play ? (results.stars > 0 ? `⭐ +${results.stars}` : 'Sin estrellas esta vez') : '';
      }
      if (!results) resultKey = null;
    },
  };
}
