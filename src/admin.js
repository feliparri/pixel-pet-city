// The owner's page (admin.html): schedule and cancel the town's sky shows. The admin key is asked for here and kept in sessionStorage only.
//   ?mock=1   development only: a stand-in server in the page (the key is "prueba"), to try and photograph the page
import config from '../config.js';
import { createEventsApi, adminErrorText } from './events-client.js';
import { zonedToMs, msToZoned, labelZoned, untilText, zoneOffset, parseDuration, durationText } from './admin-time.js';
import { SHOWS } from './show/timeline.js';
import { LAUNCH_NOW_MS } from './town-events.js';
import { SEASONS, SEASON_KEYS, seasonStatus, defaultWindow, launchWindow } from './seasons.js';

const $ = (id) => document.getElementById(id);
const KEY_STORE = 'town.adminKey';
const store = {
  get() { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch { return ''; } },
  set(v) { try { v ? sessionStorage.setItem(KEY_STORE, v) : sessionStorage.removeItem(KEY_STORE); } catch { /* private mode */ } },
};
const mock = new URLSearchParams(location.search).get('mock') === '1';
let api = null, key = store.get(), offset = 0, events = [], seasonRows = [], timer = 0, seasonsDirty = false;

const say = (text, kind = '') => { const m = $('msg'); m.textContent = text || ''; m.className = `msg ${kind}`; };
const randomSeed = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 1; };
const serverNow = () => Date.now() + offset;

/** The length chosen in the form: { secs } (null: the show's own) or { error }. */
const chosenDuration = () => parseDuration($('dur').value, $('dur-min').value, $('dur-sec').value);

function paintLink() {
  const kind = $('kind').value, seed = Number($('seed').value), d = chosenDuration();
  $('dur-custom').hidden = $('dur').value !== 'custom';
  $('try').href = `show.html?show=${encodeURIComponent(kind)}&seed=${Number.isInteger(seed) && seed >= 0 ? seed : 7}${d.secs ? `&dur=${d.secs}` : ''}`;
}

function paintList() {
  const ul = $('events');
  ul.replaceChildren();
  $('none').hidden = events.length > 0;
  for (const e of events) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    const what = document.createElement('div'), when = document.createElement('div');
    what.className = 'what'; what.textContent = `${SHOWS[e.kind] ? SHOWS[e.kind].label : e.kind} · semilla ${e.seed} · ${durationText(e.duration_ms / 1000)}`;
    const run = untilText(e.start_ms, serverNow(), e.duration_ms);
    when.className = 'when'; when.textContent = `${labelZoned(e.start_ms)} (Chile) · `;
    const state = document.createElement('span');
    state.textContent = run; if (run === 'en curso') state.className = 'live';
    when.append(state);
    info.append(what, when);
    const acts = document.createElement('div');
    acts.className = 'acts';
    const tryIt = document.createElement('a');
    tryIt.className = 'btn small'; tryIt.textContent = 'Probar'; tryIt.target = '_blank'; tryIt.rel = 'noopener'; tryIt.href = `show.html?show=${encodeURIComponent(e.kind)}&seed=${e.seed}&dur=${Math.round(e.duration_ms / 1000)}`;
    const cancel = document.createElement('button');
    cancel.className = 'btn small danger'; cancel.type = 'button'; cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => cancelEvent(e, cancel));
    acts.append(tryIt, cancel);
    li.append(info, acts);
    ul.append(li);
  }
}

const STATE_TEXT = { on: 'Activa', scheduled: 'Programada', off: 'Apagada' };
const span = (w) => `${labelZoned(w[0])} → ${labelZoned(w[1])} (Chile)`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const field = (label, input) => { const l = el('label', '', label); l.append(input); return l; };
const input = (type, value) => { const i = el('input'); i.type = type; i.value = value; i.required = true; i.addEventListener('input', () => { seasonsDirty = true; }); return i; };

/** The "Temporadas" section: one card per season, with its state and the controls. Repainted from the server's overrides unless the owner is typing. */
function paintSeasons() {
  const ul = $('seasons');
  ul.replaceChildren();
  seasonsDirty = false;
  const now = serverNow();
  for (const k of SEASON_KEYS) {
    const st = seasonStatus(k, now, seasonRows), dflt = defaultWindow(k, st.year), w = st.window || dflt;
    const li = el('li'), head = el('div', 'season-head');
    head.append(el('h3', '', SEASONS[k].label), el('span', `badge ${st.state}`, STATE_TEXT[st.state]));
    const how = st.mode === 'on' ? `Lanzada a mano hasta el fin de sus fechas por defecto de ${st.year}.` : st.mode === 'off' ? `Apagada a mano durante ${st.year}.` : st.mode === 'dates' ? `Fechas cambiadas para ${st.year}: ${span(w)}.` : `Usa las fechas por defecto de ${st.year}.`;
    const info = el('p', 'season-when', `Por defecto: ${span(dflt)}. ${how}`);
    const a = msToZoned(w[0]), z = msToZoned(w[1]);
    const from = input('date', a.date), fromT = input('time', a.time), to = input('date', z.date), toT = input('time', z.time);
    const dates = el('div', 'row');
    dates.append(field('Desde', from), field('Hora', fromT), field('Hasta', to), field('Hora', toT));
    const save = el('button', 'btn', 'Guardar fechas'); save.type = 'button';
    save.addEventListener('click', () => {
      const s = zonedToMs(from.value, fromT.value), e = zonedToMs(to.value, toT.value);
      if (!Number.isFinite(s) || !Number.isFinite(e)) { say('Elige las fechas y las horas.', 'bad'); return; }
      if (e <= s) { say(adminErrorText('bad_range'), 'bad'); return; }
      seasonAct(save, () => api.seasonSave({ season: k, year: st.year, mode: 'dates', starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString() }, key), `${SEASONS[k].label}: fechas guardadas.`);
    });
    const acts = el('div', 'row');
    const now_ = el('button', 'btn primary', 'Lanzar ahora'), off = el('button', 'btn danger', 'Apagar'), back = el('button', 'btn', 'Volver a las fechas por defecto');
    for (const x of [now_, off, back]) x.type = 'button';
    back.disabled = st.mode === 'default';
    now_.addEventListener('click', () => {
      const l = launchWindow(k, serverNow());                          // from now to the end of the default window (or for its default length); the owner can edit the end after
      seasonAct(now_, () => api.seasonSave({ season: k, year: l.year, mode: 'dates', starts_at: new Date(l.startsMs).toISOString(), ends_at: new Date(l.endsMs).toISOString() }, key), `${SEASONS[k].label}: lanzada hasta el ${labelZoned(l.endsMs)} (Chile). Todos la ven en unos 25 segundos; puedes cambiar el término abajo.`);
    });
    off.addEventListener('click', () => seasonAct(off, () => api.seasonSave({ season: k, year: st.year, mode: 'off' }, key), `${SEASONS[k].label}: apagada.`));
    back.addEventListener('click', () => seasonAct(back, () => api.seasonClear(k, st.year, key), `${SEASONS[k].label}: de vuelta a las fechas por defecto.`));
    const prev = el('a', 'btn', 'Vista previa'); prev.href = `index.html?dev=1&season=${encodeURIComponent(k)}`; prev.target = '_blank'; prev.rel = 'noopener';
    acts.append(now_, off, back, prev);
    li.append(head, info, dates, save, acts, el('p', 'note', '«Vista previa» abre la ciudad con la temporada encendida solo para ti, sin avisar a nadie.'));
    ul.append(li);
  }
}

async function seasonAct(btn, call, okText) {
  btn.disabled = true;
  const r = await call();
  if (!r.ok) { btn.disabled = false; say(adminErrorText(r.error), 'bad'); if (r.error === 'bad_admin_key') logout(); return; }
  say(okText, 'ok');
  await refresh(true);
}

async function refresh(force = false) {
  const sent = Date.now();
  const r = await api.list({ aheadDays: 60, limit: 50 });
  if (!r.ok) { say(adminErrorText(r.error), 'bad'); return; }
  offset = r.body.now - (sent + Date.now()) / 2;
  events = r.body.events;
  seasonRows = Array.isArray(r.body.seasons) ? r.body.seasons : [];
  paintList();
  if (force || !seasonsDirty) paintSeasons();
}

async function cancelEvent(e, btn) {
  if (!window.confirm(`¿Cancelar «${SHOWS[e.kind] ? SHOWS[e.kind].label : e.kind}» del ${labelZoned(e.start_ms)}?`)) return;
  btn.disabled = true;
  const r = await api.cancel(e.id, key);
  if (!r.ok) { btn.disabled = false; say(adminErrorText(r.error), 'bad'); if (r.error === 'bad_admin_key') logout(); return; }
  say('Show cancelado.', 'ok');
  await refresh();
}

async function add(ev) {
  ev.preventDefault();
  const ms = zonedToMs($('date').value, $('time').value);
  if (!Number.isFinite(ms)) { say('Elige una fecha y una hora.', 'bad'); return; }
  await schedule(ms);
}

/** "Lanzar ya": the show starts in LAUNCH_NOW_MS, the soonest every open town is sure to have heard of it. */
async function launchNow() {
  await schedule(serverNow() + LAUNCH_NOW_MS);
}

async function schedule(ms) {
  const seed = Number($('seed').value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) { say(adminErrorText('bad_seed'), 'bad'); return; }
  if (ms <= serverNow()) { say(adminErrorText('start_in_the_past'), 'bad'); return; }
  const d = chosenDuration();
  if (d.error) { say(adminErrorText(d.error), 'bad'); return; }
  $('add').disabled = $('now').disabled = true;
  const r = await api.save({ kind: $('kind').value, seed, start_at: new Date(ms).toISOString(), ...(d.secs ? { duration_s: d.secs } : {}) }, key);
  $('add').disabled = $('now').disabled = false;
  if (!r.ok) { say(adminErrorText(r.error), 'bad'); if (r.error === 'bad_admin_key') logout(); return; }
  say(ms - serverNow() < 60_000 ? `¡Lanzado! Empieza en ${Math.round((ms - serverNow()) / 1000)} segundos.` : `Programado para el ${labelZoned(ms)} (Chile).`, 'ok');
  $('seed').value = String(randomSeed()); paintLink();
  await refresh();
}

function showPanel(on) {
  $('login').hidden = on; $('panel').hidden = !on; $('logout').hidden = !on;
  clearInterval(timer);
  if (on) timer = setInterval(() => { refresh(); }, 30000);
}

function logout() { key = ''; store.set(''); showPanel(false); }

async function login(ev) {
  ev.preventDefault();
  const typed = $('key').value.trim();
  if (!typed) return;
  say('Comprobando…');
  const probe = await api.cancel('x', typed);                       // a wrong key is refused before the id is looked at; a right one answers bad_id
  if (probe.error === 'bad_id') { key = typed; store.set(key); $('key').value = ''; say(''); showPanel(true); await refresh(); return; }
  say(adminErrorText(probe.error), 'bad');
}

async function main() {
  const base = `${config.supabaseUrl}/functions/v1/trip`;
  if (mock) { const { createMockFetch } = await import('./admin-mock.js'); api = createEventsApi({ base, fetch: createMockFetch() }); }
  else api = createEventsApi({ base });
  const soon = msToZoned(Date.now() + 15 * 60000);
  $('date').value = soon.date; $('time').value = soon.time;
  $('seed').value = String(randomSeed());
  $('zone-note').textContent = `Ahora en Chile: ${msToZoned(Date.now()).time} (UTC${zoneOffset(Date.now()) >= 0 ? '+' : '−'}${Math.abs(zoneOffset(Date.now()) / 60)}).`;
  for (const id of ['kind', 'seed', 'dur', 'dur-min', 'dur-sec']) $(id).addEventListener('input', paintLink);
  $('reseed').addEventListener('click', () => { $('seed').value = String(randomSeed()); paintLink(); });
  $('new').addEventListener('submit', add);
  $('now').addEventListener('click', launchNow);
  $('login').addEventListener('submit', login);
  $('logout').addEventListener('click', () => { logout(); say(''); });
  paintLink();
  if (key) {                                                        // a key kept for this tab: check it is still good
    const probe = await api.cancel('x', key);
    if (probe.error === 'bad_id') { showPanel(true); await refresh(); } else { key = ''; store.set(''); showPanel(false); if (probe.error !== 'bad_admin_key') say(adminErrorText(probe.error), 'bad'); }
  } else showPanel(false);
  document.title = 'ready';
}
main().catch((e) => { say('Algo salió mal al abrir la página.', 'bad'); console.error(e); document.title = `error: ${e.message}`; });
