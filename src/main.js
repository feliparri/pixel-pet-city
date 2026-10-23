// The page: lobby (pet, create or join a room) and the town screen (code, copy, leave, emotes).
import config from '../config.js';
import { isConfigured } from './config-check.js';
import { generateCode, normalizeCode } from './code.js';
import { EMOTES, SLOTS, SPECIES, STAGES, parsePetFragment, sanitizeName, validateLook } from './protocol.js';
import { createTownNet } from './net.js';
import { loadSprites, drawPet } from './sprites.js';
import { loadFont } from './font.js';
import { startTown } from './town.js';
import { createTripClient, tripCodeFromSearch, tripErrorText } from './trip.js';
import { devEntrance } from './entrance.js';
import { drawKeepsake } from './keepsake.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let sprites, font, net = null, town = null, mode = null, netMode = null;
let visit = null;                                 // a pet visiting from its board: { client, entrance, stop, solo }
let me = null;                                   // { name, look }
let fixedPet = false;                            // the pet came from the Android app: no chooser

function say(text) { $('error').textContent = text || ''; }

function readChooser() {
  const items = SLOTS.map((s) => $(`item-${s}`).value);
  return { name: sanitizeName($('name').value), look: validateLook({ species: $('species').value, stage: Number($('age').value), items }, sprites.catalogue) };
}

function paintPreview() {
  const c = $('preview'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas');
  tmp.width = 64; tmp.height = 64;
  drawPet(tmp.getContext('2d'), sprites, me.look, 16, 16 + 4);
  ctx.drawImage(tmp, 0, 0);
}

function fillItemSelects() {
  for (const slot of SLOTS) {
    const sel = $(`item-${slot}`);
    sel.replaceChildren(new Option('Nada', ''));
    for (const [id, def] of Object.entries(sprites.catalogue)) if (def.slot === slot) sel.append(new Option(def.name, id));
  }
}

function applySaved() {
  try {
    const s = JSON.parse(store.get('city.pet') || 'null');
    if (!s) return;
    $('name').value = sanitizeName(s.name);
    if (SPECIES.includes(s.species)) $('species').value = s.species;
    if (Number.isInteger(s.stage) && s.stage >= 0 && s.stage < STAGES.length) $('age').value = String(s.stage);
    SLOTS.forEach((slot, i) => { if (typeof s.items?.[i] === 'string') $(`item-${slot}`).value = s.items[i]; });
  } catch { /* ignore a broken save */ }
}

function refreshPet() {
  if (!fixedPet) {
    me = readChooser();
    store.set('city.pet', JSON.stringify({ name: me.name, species: me.look.species, stage: me.look.stage, items: me.look.items }));
  }
  paintPreview();
}

function setMode(m) {
  mode = m;
  const ready = m !== null;
  $('actions').hidden = !ready;
  $('config-note').hidden = ready || isConfigured(config);
  $('local-mode').hidden = ready || isConfigured(config);
}

function show(screen) {
  $('lobby').hidden = screen !== 'lobby';
  $('town').hidden = screen !== 'town';
  $('gone').hidden = screen !== 'gone';
}

async function enter(code, { transport = mode, arrival = null, solo = false } = {}) {
  say('');
  refreshPet();
  if (!me.look) { say('Elige una mascota.'); return; }
  $('create').disabled = $('join').disabled = true;
  try {
    netMode = transport;
    net = createTownNet({ mode: transport, config, catalogue: sprites.catalogue, onEvent: (ev) => {
      if (ev.type === 'status') setStatus(ev.status);
      if (town) town.onNetEvent(ev);
    } });
    await net.join(code, me);
  } catch (e) {
    net = null;
    say(transport === 'supabase' ? 'No se pudo conectar con la ciudad. Revisa tu conexión e inténtalo de nuevo.' : 'No se pudo abrir la sala en este navegador.');
    $('create').disabled = $('join').disabled = false;
    return false;
  }
  $('create').disabled = $('join').disabled = false;
  $('room-code').textContent = code;
  if (visit) visit.solo = solo;
  paintVisitBar();
  show('town');
  town = startTown({ canvas: $('view'), stage: $('stage'), sprites, font, net, me, entrance: arrival });
  setStatus('connected');
  return true;
}

function setStatus(status) {
  const text = { connecting: 'Conectando…', connected: visit && visit.solo ? '' : netMode === 'local' ? 'Modo local: solo pestañas de este navegador' : 'Conectado', error: 'Sin conexión', closed: '' }[status] || '';
  $('status').textContent = text;
}

function closeRoom() {
  if (town) { town.destroy(); town = null; }
  if (net) { net.leave(); net = null; }
}

function leave() {
  closeRoom();
  if (visit) { enterSolo(null); return; }          // a visiting pet goes back to its own corner of the town, not to the lobby
  show('lobby');
}
window.cityLeave = leave;                          // the Android back button calls this before it closes the page
window.addEventListener('pagehide', () => { if (net) net.leave(); });

async function copyCode() {
  const code = $('room-code').textContent;
  const btn = $('copy');
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; } catch { /* fall back below */ }
  if (!ok) {
    const sel = window.getSelection(), range = document.createRange();
    range.selectNodeContents($('room-code'));
    sel.removeAllRanges(); sel.addRange(range);
    try { ok = document.execCommand('copy'); } catch { ok = false; }
  }
  btn.textContent = ok ? '¡Copiado!' : 'Selecciona el código';
  setTimeout(() => { btn.textContent = 'Copiar código'; }, 1500);
}

function buildEmotes() {
  const nav = $('emotes');
  for (const [id, label] of Object.entries(EMOTES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = label.length > 2 && !/\p{Extended_Pictographic}/u.test(label) ? 'btn text' : 'btn';
    b.textContent = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => town && town.emote(id));
    nav.append(b);
  }
}

// ---- a pet visiting from its board (docs/trip-api.md) ------------------------------------------------------------------------------
async function visitEnter(code) {
  closeRoom();
  if (!(await enter(code, { transport: mode }))) {
    await enterSolo(null);
    $('status').textContent = 'No se pudo conectar con la sala.';
  }
}

function enterSolo(arrival) {
  return enter(generateCode(), { transport: 'local', arrival, solo: true });   // a private corner nobody else can join: no network
}

function paintVisitBar() {
  const inSolo = !!visit && visit.solo;
  $('visit-badge').hidden = !visit;
  $('room-info').hidden = inSolo;
  $('visit-join').hidden = !inSolo;
  $('leave').hidden = inSolo;
}

function showGone(text, canGoToLobby = false) {
  $('gone-text').textContent = text;
  $('gone-lobby').hidden = !canGoToLobby;
  show('gone');
}

async function recalled(kind) {
  if (!visit) return;
  if (kind === 'recalled' && town) await town.playExit(visit.entrance);
  closeRoom();
  visit.client.forget();
  const text = kind === 'recalled' ? 'Volvió a su casa' : 'El viaje terminó';
  visit = null;
  showGone(text);
}

async function bootTrip(code) {
  show('gone');
  $('gone-text').textContent = 'Abriendo el viaje…';
  if (!isConfigured(config)) { showGone('La ciudad en línea todavía no está configurada.'); return; }
  const client = createTripClient({ base: `${config.supabaseUrl}/functions/v1/trip`, storage: (() => { try { return localStorage; } catch { return null; } })() });
  const r = await client.claim(code, sprites.catalogue);
  if (!r.ok) { showGone(tripErrorText(r.error), true); return; }
  fixedPet = true; me = { name: r.pet.name, look: r.pet.look };
  $('chooser').hidden = true; $('pet-fixed').hidden = false; $('pet-name').textContent = me.name;
  const dev = devEntrance(location.search);
  if (dev && dev !== r.entrance && !r.resumed) { await client.save({ entrance: dev }); }
  visit = { client, entrance: client.session.entrance, stop: null, solo: true };
  const box = $('keepsakes');
  box.replaceChildren();
  for (const k of r.pet.keepsakes) {
    const c = document.createElement('canvas');
    c.title = k.name; c.setAttribute('role', 'img'); c.setAttribute('aria-label', k.name);
    drawKeepsake(c, k, 2);
    box.append(c);
  }
  refreshPet();
  visit.stop = client.watch(recalled);
  await enterSolo(r.resumed ? null : visit.entrance);
}

async function boot() {
  try {
    [sprites, font] = await Promise.all([loadSprites(), loadFont()]);
  } catch {
    say('No se pudieron cargar los dibujos de la ciudad.');
    return;
  }
  fillItemSelects();
  buildEmotes();
  const tripCode = tripCodeFromSearch(location.search);
  if (tripCode) {
    $('copy').addEventListener('click', copyCode);
    $('leave').addEventListener('click', leave);
    $('v-create').addEventListener('click', () => visitEnter(generateCode()));
    $('v-join').addEventListener('click', () => { const c = normalizeCode($('v-code').value); if (c) visitEnter(c); else $('status').textContent = 'Código no válido. Ejemplo: FOCA-LUNA-42'; });
    $('v-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('v-join').click(); });
    mode = 'supabase';
    return bootTrip(tripCode);
  }
  const fromApp = parsePetFragment(location.hash, sprites.catalogue);
  if (fromApp) {
    fixedPet = true; me = fromApp;
    $('chooser').hidden = true; $('pet-fixed').hidden = false; $('pet-name').textContent = me.name;
  } else {
    applySaved();
    $('chooser').addEventListener('input', refreshPet);
  }
  refreshPet();
  const forceLocal = new URLSearchParams(location.search).has('local');
  setMode(isConfigured(config) && !forceLocal ? 'supabase' : forceLocal ? 'local' : null);
  $('local-mode').addEventListener('click', () => setMode('local'));
  $('create').addEventListener('click', () => enter(generateCode()));
  const join = () => {
    const code = normalizeCode($('code-input').value);
    if (!code) { say('Código no válido. Ejemplo: FOCA-LUNA-42'); return; }
    enter(code);
  };
  $('join').addEventListener('click', join);
  $('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  $('copy').addEventListener('click', copyCode);
  $('leave').addEventListener('click', leave);
}

boot();
