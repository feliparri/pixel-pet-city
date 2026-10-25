// The page: a landing that explains how to enter, the town of a real pet (?trip=<code>: a board or the phone), and, for development only
// (?local=1&dev=1), a pet chooser with local rooms. The town screen has the code, copy, leave and emotes.
import config from '../config.js';
import { isConfigured } from './config-check.js';
import { generateCode, normalizeCode } from './code.js';
import { EMOTES, SLOTS, SPECIES, STAGES, sanitizeName, validateLook } from './protocol.js';
import { createTownNet } from './net.js';
import { loadSprites, drawPet } from './sprites.js';
import { loadFont } from './font.js';
import { startTown } from './town.js';
import { isTouchDevice } from './keys.js';
import { createTripClient, tripCodeFromSearch, tripErrorText, entryMode } from './trip.js';
import { normalizeTripCode } from './trip-code.js';
import { devEntrance } from './entrance.js';
import { drawKeepsake } from './keepsake.js';
import { createHud } from './hud.js';
import { createBridge } from './usb-bridge.js';
import { createRadarSaver, radarOf, stateWithRadar } from './radar.js';
import { createStars, createStarSaver, starsFromState, stateWithStars } from './stars.js';

const $ = (id) => document.getElementById(id);
const touch = isTouchDevice(window);                          // a phone or tablet: the town shows its on-screen controls
document.documentElement.classList.toggle('touch', touch);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let sprites, font, net = null, town = null, mode = null, netMode = null;
let visit = null;                                 // a real pet visiting (trip): { client, entrance, stop, solo, stars, saver, radar }
let hud = null, stars = null;                    // the games' overlay and this pet's star counter (kept in the trip's server state)
let me = null;                                   // { name, look, stats }
let fixedPet = false;                            // the pet is a real one (a trip): no chooser

// The board's USB cable (src/usb-bridge.js): the bridge lives as long as the page, so it keeps serving the board while the town is open.
const CABLE_TEXT = { waiting: 'Esperando a la placa…', connected: 'Conectada', disconnected: 'Desconectada', failed: 'No se pudo abrir la placa' };
let bridge = null, townOpened = false;

function paintCable(state) {
  const text = CABLE_TEXT[state];
  if (!text) return;
  $('cable-status').textContent = text; $('cable-status').hidden = false;
  $('cable-state').textContent = state === 'connected' || state === 'waiting' ? `Placa: ${text}` : `Placa: ${text} · Reconectar`; $('cable-state').hidden = false;
  $('cable-state').disabled = state === 'connected' || state === 'waiting';
  $('cable-connect').textContent = state === 'waiting' || state === 'connected' ? 'Desconectar placa' : 'Conectar placa';
}

function openTown(code) {                         // the board started a trip: the same as typing its code, without leaving the page (a reload would drop the cable)
  if (townOpened) return;
  townOpened = true;
  history.pushState(null, '', `${location.pathname}?trip=${encodeURIComponent(code)}`);
  boot();
}

// Plugged in again: the page reopens the board by itself (only a board this page was already allowed to use, and only while the owner wants the cable).
// The board takes a moment to show up after a replug, so a failed reopen is tried again a little later.
let cableWanted = false;
function resumeCable() {
  if (!cableWanted || bridge.open) return;
  for (const ms of [0, 1000, 3000]) setTimeout(() => { if (cableWanted && !bridge.open) bridge.resume(navigator.serial); }, ms);
}
async function connectCable() {
  if (await bridge.resume(navigator.serial) || await bridge.connect(navigator.serial)) cableWanted = true;
}

function setupCable() {
  if (!('serial' in navigator) || !isConfigured(config)) return;     // Web Serial: desktop Chrome and Edge only
  bridge = createBridge({ base: `${config.supabaseUrl}/functions/v1/trip`, onState: paintCable, onTripCode: openTown });
  $('cable').hidden = false;
  $('cable-connect').addEventListener('click', () => {
    if (bridge.open) { cableWanted = false; bridge.disconnect(); } else connectCable();
  });
  $('cable-state').addEventListener('click', () => { if (!bridge.open) connectCable(); });   // in the town: reconnect the board from the bar
  navigator.serial.addEventListener('connect', resumeCable);
}

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
  $('actions').hidden = m === null;
}

function show(screen) {
  $('landing').hidden = screen !== 'landing';
  $('lobby').hidden = screen !== 'lobby';
  $('town').hidden = screen !== 'town';
  $('gone').hidden = screen !== 'gone';
}

async function enter(code, { transport = mode, arrival = null, solo = false } = {}) {
  say('');
  refreshPet();
  if (!me.look) { say('Elige una mascota.'); return; }
  if (transport === 'supabase' && !(visit && visit.client.session)) { say('Entra con tu mascota desde la placa o desde la app.'); return false; }   // rooms are for claimed trip pets only
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
  stars = visit ? visit.stars : createStars();                  // dev only: a counter that lives for this visit
  const showStars = () => { $('stars-n').textContent = String(stars.get()); };
  showStars();
  const counter = { add(n) { stars.add(n); showStars(); } };
  window.cityDebug = () => ({ town, net });                    // handy in the console when testing with two tabs
  town = startTown({ canvas: $('view'), stage: $('stage'), pad: touch ? { dpad: $('dpad'), a: $('pad-a'), b: $('pad-b') } : null, sprites, font, net, me, entrance: arrival, stars: counter, onHud: (info) => hud && hud.update(info) });
  setStatus('connected');
  if (visit) visit.radar.now();                                 // the room changed: tell the phone's radar now
  return true;
}

function setStatus(status) {
  const text = { connecting: 'Conectando…', connected: visit && visit.solo ? '' : netMode === 'local' ? 'Modo local: solo pestañas de este navegador' : 'Conectado', error: 'Sin conexión', closed: '' }[status] || '';
  $('status').textContent = text;
}

function closeRoom() {
  if (hud) hud.update({ lobby: null, game: null, results: null, notices: [], spot: null });
  if (town) { town.destroy(); town = null; }
  if (net) { net.leave(); net = null; }
  if (visit) visit.radar.now();                                 // not in a room until the next one opens
}

function leave() {
  closeRoom();
  if (visit) { enterSolo(null); return; }          // a visiting pet goes back to its own corner of the town, not to the lobby
  show('lobby');
}
window.cityLeave = leave;                          // the Android back button calls this before it closes the page
window.addEventListener('pagehide', () => { if (net) net.leave(); if (visit) visit.saver.flush(); });

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

/** On a landscape phone the emotes hide behind the bar's 💬 button and open as a row over the stage (style.css); elsewhere the row is always there. */
function setEmotesOpen(open) {
  $('emotes').classList.toggle('open', open);
  $('emotes-toggle').setAttribute('aria-expanded', String(open));
}

function buildEmotes() {
  $('emotes-toggle').addEventListener('click', () => setEmotesOpen(!$('emotes').classList.contains('open')));
  const nav = $('emotes');
  for (const [id, label] of Object.entries(EMOTES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = label.length > 2 && !/\p{Extended_Pictographic}/u.test(label) ? 'btn text' : 'btn';
    b.textContent = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => { if (town) town.emote(id); setEmotesOpen(false); });
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
  visit.radar.stop();
  visit.saver.flush();                                          // the stars of the last seconds (the server may refuse after a recall)
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
  fixedPet = true; me = { name: r.pet.name, look: r.pet.look, stats: r.pet.stats };
  $('chooser').hidden = true; $('pet-fixed').hidden = false; $('pet-name').textContent = me.name;
  const dev = devEntrance(location.search);
  if (dev && dev !== r.entrance && !r.resumed) { await client.save({ entrance: dev }); }
  const saver = createStarSaver((n) => client.save({ state: (d) => stateWithStars(d, n), keepalive: true }));
  // the radar: the pets of the shared room this pet is in (nothing in its private corner), saved every 10 s and when the room changes
  const radar = createRadarSaver({
    build: () => {
      const inRoom = !!(net && town && visit && !visit.solo);
      return radarOf(inRoom ? net.code : '', inRoom ? town.radarPets() : [], Date.now());
    },
    send: (rd) => client.save({ state: (d) => stateWithRadar(d, rd), keepalive: true }),
  });
  radar.start();
  visit = { client, entrance: client.session.entrance, stop: null, solo: true, saver, radar, stars: createStars({ initial: starsFromState(r.state), persist: (n) => saver.save(n) }) };
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

function bootLanding() {
  show('landing');
  setupCable();
  $('config-note').hidden = isConfigured(config);
  const p = new URLSearchParams(location.search);
  $('landing-note').hidden = !(location.hash.length > 1 || p.has('trip'));     // an old #n=..&s=.. link, or a ?trip= that is not a code: nothing to enter with
  if (p.has('trip')) $('claim-error').textContent = tripErrorText('bad_code');
  $('claim-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeTripCode($('claim-code').value);
    if (!code) { $('claim-error').textContent = tripErrorText('bad_code'); return; }
    location.assign(`${location.pathname}?trip=${encodeURIComponent(code)}`);       // the same as opening ?trip=<code>
  });
}

async function boot() {
  const entry = entryMode(location.search);
  if (entry === 'landing') { bootLanding(); return; }                          // no pet to draw yet: nothing else to load
  try {
    [sprites, font] = await Promise.all([loadSprites(), loadFont()]);
  } catch {
    showGone('No se pudieron cargar los dibujos de la ciudad.');
    return;
  }
  fillItemSelects();
  buildEmotes();
  hud = createHud($, { onPlay: () => town && town.games.play(), onJoin: () => town && town.games.join(), onSeek: () => town && town.games.seek(), onZone: (z) => town && town.games.zone(z), onTeam: (t) => town && town.games.team(t), onLeave: () => town && town.games.leave(), onDismiss: () => town && town.games.dismiss() });
  if (entry === 'trip') {
    $('copy').addEventListener('click', copyCode);
    $('leave').addEventListener('click', leave);
    $('v-create').addEventListener('click', () => visitEnter(generateCode()));
    $('v-join').addEventListener('click', () => { const c = normalizeCode($('v-code').value); if (c) visitEnter(c); else $('status').textContent = 'Código no válido. Ejemplo: FOCA-LUNA-42'; });
    $('v-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('v-join').click(); });
    mode = 'supabase';
    return bootTrip(tripCodeFromSearch(location.search));
  }
  // development only (?local=1&dev=1): the pet chooser and rooms between tabs of this browser
  show('lobby');
  applySaved();
  $('chooser').addEventListener('input', refreshPet);
  refreshPet();
  setMode('local');
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
