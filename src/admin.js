// The owner's page (admin.html): schedule and cancel the town's sky shows. The admin key is asked for here and kept in sessionStorage only.
//   ?mock=1   development only: a stand-in server in the page (the key is "prueba"), to try and photograph the page
import config from '../config.js';
import { createEventsApi, adminErrorText } from './events-client.js';
import { zonedToMs, msToZoned, labelZoned, untilText, zoneOffset } from './admin-time.js';
import { SHOWS } from './show/timeline.js';

const $ = (id) => document.getElementById(id);
const KEY_STORE = 'town.adminKey';
const store = {
  get() { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch { return ''; } },
  set(v) { try { v ? sessionStorage.setItem(KEY_STORE, v) : sessionStorage.removeItem(KEY_STORE); } catch { /* private mode */ } },
};
const mock = new URLSearchParams(location.search).get('mock') === '1';
let api = null, key = store.get(), offset = 0, events = [], timer = 0;

const say = (text, kind = '') => { const m = $('msg'); m.textContent = text || ''; m.className = `msg ${kind}`; };
const randomSeed = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 1; };
const serverNow = () => Date.now() + offset;

function paintLink() {
  const kind = $('kind').value, seed = Number($('seed').value);
  $('try').href = `show.html?show=${encodeURIComponent(kind)}&seed=${Number.isInteger(seed) && seed >= 0 ? seed : 7}`;
}

function paintList() {
  const ul = $('events');
  ul.replaceChildren();
  $('none').hidden = events.length > 0;
  for (const e of events) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    const what = document.createElement('div'), when = document.createElement('div');
    what.className = 'what'; what.textContent = `${SHOWS[e.kind] ? SHOWS[e.kind].label : e.kind} · semilla ${e.seed}`;
    const run = untilText(e.start_ms, serverNow(), e.duration_ms);
    when.className = 'when'; when.textContent = `${labelZoned(e.start_ms)} (Chile) · `;
    const state = document.createElement('span');
    state.textContent = run; if (run === 'en curso') state.className = 'live';
    when.append(state);
    info.append(what, when);
    const acts = document.createElement('div');
    acts.className = 'acts';
    const tryIt = document.createElement('a');
    tryIt.className = 'btn small'; tryIt.textContent = 'Probar'; tryIt.target = '_blank'; tryIt.rel = 'noopener'; tryIt.href = `show.html?show=${encodeURIComponent(e.kind)}&seed=${e.seed}`;
    const cancel = document.createElement('button');
    cancel.className = 'btn small danger'; cancel.type = 'button'; cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => cancelEvent(e, cancel));
    acts.append(tryIt, cancel);
    li.append(info, acts);
    ul.append(li);
  }
}

async function refresh() {
  const sent = Date.now();
  const r = await api.list({ aheadDays: 60, limit: 50 });
  if (!r.ok) { say(adminErrorText(r.error), 'bad'); return; }
  offset = r.body.now - (sent + Date.now()) / 2;
  events = r.body.events;
  paintList();
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
  const seed = Number($('seed').value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) { say(adminErrorText('bad_seed'), 'bad'); return; }
  if (ms <= serverNow()) { say(adminErrorText('start_in_the_past'), 'bad'); return; }
  $('add').disabled = true;
  const r = await api.save({ kind: $('kind').value, seed, start_at: new Date(ms).toISOString() }, key);
  $('add').disabled = false;
  if (!r.ok) { say(adminErrorText(r.error), 'bad'); if (r.error === 'bad_admin_key') logout(); return; }
  say(`Programado para el ${labelZoned(ms)} (Chile).`, 'ok');
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
  for (const id of ['kind', 'seed']) $(id).addEventListener('input', paintLink);
  $('reseed').addEventListener('click', () => { $('seed').value = String(randomSeed()); paintLink(); });
  $('new').addEventListener('submit', add);
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
