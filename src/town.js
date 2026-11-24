// The running town: the local pet, the other pets, input (taps, arrows/WASD), the net session and the draw loop.
import { findPath, dirVector } from './path.js';
import { isWalkable, doorAt, spotAt, tileAt, getArea, waterAt, isBreak, TILES, GAME_PLACES, SPAWNS } from './map.js';
import { Walker, REMOTE_SNAP } from './walker.js';
import { paceFactor, waterOf, zoomTarget } from './sea.js';
import { createSurf, surfFlag, surfAction, press as surfPress, wipeout, wipeOver, finishRide, rideDecide, waveAt, RIDE_MS, SAY } from './surf.js';
import { isTyping, isJumpKey, runs, tapWalks } from './keys.js';
import { createTouchpad } from './touchpad.js';
import { JUMP_MS } from './jump.js';
import { EMOTE_MS, MIN_VIEW_H, MIN_VIEW_W, VIEW_H, VIEW_W } from './render.js';
import { createTownRenderer } from './hd2d/renderer.js';
import { guardFrame } from './frame-guard.js';
import { glWanted } from './hd2d/glquads.js';
import { createMeter, attachPerfBox, startPerfLog, perfSkip } from './perf.js';
import { ambientAt, hourNow } from './daynight.js';
import { entranceState } from './entrance.js';
import { createGames } from './games/manager.js';
import { GAME_RULES } from './games/rules.js';
import { stumbled, paceAt, RACE } from './games/race.js';
import { activityOf, radarPets } from './radar.js';
import { createLife, createFarmLife, stepLife, lifeFrame, farmLifeFrame } from './life.js';
import { inArea } from './presence.js';
import { SLOTS } from './protocol.js';
import { createNpcs, showSpans, nearShopkeeper, shopGreeting, SHOPKEEPER, SHOP_SAY_MS, nearStore, clerkGreeting } from './npcs.js';
import config from '../config.js';
import { isConfigured } from './config-check.js';
import { createEventsApi } from './events-client.js';
import { createTownEvents, parseDevEvent } from './town-events.js';
import { createCanasta } from './canasta.js';
import { createFarmMemory, farmView, clockOf } from './farm-world.js';
import { actionAt, perform, objectAt } from './farm-actions.js';
import { dayOf } from './npc-world.js';
import { activeSeasons, parseDevSeasons } from './seasons.js';
import { pondAction } from './fishing/pond.js';
import { snowing } from './snow.js';
import { weatherNow, levels as weatherLevels, shelterLife } from './weather.js';
import { ghostsAt } from './ghosts.js';
import { createHold, villagerAtTap, talkSpot, faceToward } from './npc-hold.js';
import { hearer, reactionTo, REPLY_WINDOW_MS, REPLY_DELAY_MS, REPLY_EMOTE_MS, REPLY_SAY_MS } from './npc-react.js';
import { createGiftWorld } from './gift-world.js';
import { HINT_NO_TRIP, giftOutcome } from './gifts.js';
import { sound } from './sound.js';
import { createCityAudio } from './city-audio.js';
import { createPetSounds } from './pet-sounds.js';
import { missionFor, missionText, missionRows, statusOf, thanksFor, doneLine, CAPPED_LINE, NOT_READY, GOLD_POP, claimErrorText } from './missions.js';

const FADE_MS = 240;                                  // the fade-in after a door
const TALK_DIST = 2, TALK_DIST_PHONE = 3;             // a pet can talk to a villager this many tiles away (A / E / the prompt; the phone's thumb is less exact, and its view shows more tiles)
const TALK_SAY_MS = 5200;                             // how long a villager's answer to the pet stays up
const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };

function spawnFor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPAWNS[h % SPAWNS.length];
}

/** pad: { stick, a, b } (the phone's on-screen controls) or null;
 * me: { name, look }; net: a createNet() session already joined; entrance: an entrance id to play on arrival (a visiting pet), or null;
 * stars: the pet's star counter ({ add(n) }); onHud(info): called a few times a second with what the game buttons and panels need.
 * canasta / farmMemory: the pet's basket (src/canasta.js) and what it did on the farm today (src/farm-world.js); tools(): the keys of the farm tools the pet owns
 * (src/tools.js); onStore(): the pet asked for the Almacén (the farm store); missions: null (villagers just chat) or { enabled(), ledger() ({ day, cap, earned,
 * done }, what the server paid today), claim(m) (hands a mission in: the server pays real gold, src/trip.js claimMission), giftOwner() (who opens the seasonal gifts: the trip's ref),
 * gift(id) (opens a gift: the server pays 10 to 30 gold (20 to 30 for one of Santa's), src/trip.js claimGift) }; onFarm({ action, prompt }) says which action is available (or null) when it changes, onFarmDone(result) reports an action's outcome (the pop) and onFarmAction(event) every action done (missions), onFish() the pet fished at the park's pond (the page opens the fishing layer).
 * Returns { onNetEvent, emote, playExit, games: { play, join, seek, leave, dismiss }, farm: { act }, destroy }. */
export function startTown({ canvas, stage, pad = null, sprites, font, net, me, entrance = null, stars = { add() {} }, canasta = createCanasta(), farmMemory = createFarmMemory(), tools = () => [], onStore = () => {}, missions = null, onHud = () => {}, onShow = () => {}, onShop = () => {}, insets = () => ({ top: 0, bottom: 0 }), onFarm = () => {}, onFarmDone = () => {}, onFarmAction = () => {}, onFish = () => {} }) {
  const [sx, sy] = spawnFor(net.id);
  const self = { id: net.id, name: me.name, look: me.look, stats: me.stats || null, act: 'idle', walker: new Walker(sx, sy), emote: null, jumpAt: null, area: 'town' };
  const surf = createSurf();                                       // surfing at the beach's break (src/surf.js): idle, riding a wave, or wiped out
  self.walker.tileMult = (x, y) => paceFactor(self.area, x, y, self.look.species);      // the sea slows the pet (the seal swims faster than it walks), src/sea.js
  if (entrance) self.fx = { id: entrance, phase: 'arrive', t0: performance.now(), resolve: null };
  const others = new Map();
  const state = { me: self, others: [], marker: null, area: 'town', amb: ambientAt(hourNow(location.search)), fade: 0 };
  const life = createLife(net.code || net.id);                       // the same scene for a room, from its code; nothing of it goes over the net
  const farmLife = createFarmLife(net.code || net.id);               // and the farm's: the animals walk where the room's clock says
  const renderer = createTownRenderer({ canvas, sprites, font, minH: pad ? MIN_VIEW_H : VIEW_H, minW: pad ? MIN_VIEW_W : VIEW_W, flat: new URLSearchParams(location.search).get('flat') === '1', skip: perfSkip(location.search), gl: glWanted(location.search), onNotice: (text) => games.notify(text) });   // a phone: 1.25 times the tiles it showed (and a whole-number pixel size); a desktop: as many tiles as before
  const npcs = createNpcs({ seed: net.code || net.id, sprites });           // the villagers: their place and lines come from (room, server time) alone, nothing of them goes over the net
  const search = new URLSearchParams(location.search);
  const meter = search.get('perf') === '1' ? createMeter() : null;      // ?perf=1: a box with what each frame costs on this device (src/perf.js)
  const perfRead = () => ({ town: meter.read(), hd: renderer.stats(), view: { w: canvas.width, h: canvas.height, dpr: +(window.devicePixelRatio || 1).toFixed(2) } });
  const stopBox = meter ? attachPerfBox(perfRead) : () => {}, stopLog = meter && search.get('log') === '1' ? startPerfLog(perfRead) : () => {};
  const stopPerf = () => { stopBox(); stopLog(); };
  const devSeasons = parseDevSeasons(location.search);      // development only: ?dev=1&season=halloween|christmas|none (or &halloween=1|0, &christmas=1|0) forces seasons on or off
  let seasonSet = new Set(), seasonAt = -1e9, wxLv = weatherLevels(null), wxAt = -1e9;      // wxLv: the weather's amounts (src/weather.js), read again once a second; ?dev=1&weather=<kind> (or the old &snow=1) pins it
  let devNpcT = search.get('dev') === '1' && Number.isFinite(Number(search.get('npct'))) && search.has('npct') ? Number(search.get('npct')) : null;      // development only: ?dev=1&npct=<ms> pins the villagers' clock
  let shopVisits = 0, shopNear = false, shopSayUntil = 0, modal = false, thankLine = null,   // modal: a panel is open (shop, backpack): the pet stands still
    storeVisits = 0, storeNear = false, clerkSayUntil = 0;
  const talkDist = pad ? TALK_DIST_PHONE : TALK_DIST, hold = createHold();   // hold: the villagers that wait for this pet on this screen (src/npc-hold.js)
  let talkGo = null, nearTalkId = null;                              // talkGo: { id } a tapped villager the pet is walking to; nearTalkId: the one the prompt offers (both stand still for the pet)
  let talkLine = null, npcsHere = [], claiming = false, voices = [], spokeAt = new Map(), reply = null, replies = 0, shopSpokeAt = -Infinity;
  // talkLine: a villager's answer to this pet (this screen only); npcsHere: the villagers of this area; claiming: a mission being handed in; voices/spokeAt: who spoke lately (the pet's emote is answered by one of them, src/npc-react.js)
  let farmAction = null, farmKey = '', farmAt = -Infinity, farmStamp = 0, farmSig = '', farmState = null;       // the farm: the action available now, and the crops as this pet sees them
  let fadeT0 = -Infinity, ambAt = -Infinity;
  const held = [];                                   // direction keys held, the latest last
  let shift = false, padRun = false, stickRun = false;               // Shift (or B, or the stick pushed far) is down: a held direction runs (outside the games)
  let stickDirs = [], flip = 0;                                       // the stick's held directions: a diagonal alternates its two axes step by step
  let raf = 0, last = performance.now(), alive = true, suspended = false;      // suspended: the arcade is open over the town: nothing is drawn or read until it closes

  /** The weather's amounts at the town's clock (and the clock's skew from this device's, for the lightning). */
  function weatherNowLevels() {
    const ms = devNpcT === null ? events.serverNow() : devNpcT, lv = weatherLevels(weatherNow(location.search, ms, snowing(seasonSet, ms)));
    lv.skew = ms - Date.now();
    return lv;
  }
  const cityAudio = createCityAudio({ sound });                   // the town's music and ambient sound (src/city-audio.js); it waits for the first gesture and respects the sound switch
  const pets = createPetSounds({ sound });                        // footsteps, hops and soft interaction cues (src/pet-sounds.js): the ambient channel, so the music is never cut
  let landAt = 0;                                                  // when the own pet's hop lands (its landing sound)
  const names = (pid) => (pid === self.id ? self.name : (others.get(pid) || {}).name || 'Mascota');
  const games = createGames({
    id: net.id, send: (m) => net.sendGame(m), present: () => new Set(net.peers().map((p) => p.id)), name: names, now: () => performance.now(), award: (n) => stars.add(n),
    pos: (pid) => (pid === self.id ? { x: self.walker.tileX, y: self.walker.tileY, area: self.area } : net.peers().find((p) => p.id === pid) || null),
  });
  const dev = parseDevEvent(location.search, Date.now());           // development only: ?dev=1&event=fireworks:5 fakes a show that starts in 5 s, with no server
  const events = createTownEvents({ api: createEventsApi({ base: `${config.supabaseUrl}/functions/v1/trip` }), devEvents: dev.length ? dev : null, notify: (text) => games.notify(text), onShow });
  if (dev.length || isConfigured(config)) events.start();            // the scheduled sky shows (src/town-events.js)
  const chickWalker = new Walker(30, 40);
  chickWalker.hurry = true;
  let chickSeq = 0, hudAt = -Infinity, wasLobby = null;
  const giftWorld = createGiftWorld({ room: net.code || net.id, storage: (() => { try { return localStorage; } catch { return null; } })() });      // the seasonal gifts of the room (src/gift-world.js)
  let giftBusy = new Set(), giftHinted = false, giftCapDay = null, giftRetry = new Map(), giftScanAt = -Infinity, selfSay = null;      // giftBusy: ids being opened; giftHinted: the "travel with your pet" hint was shown; giftCapDay: the town day the server said the cap was reached; giftRetry: id -> when to try again
  let racing = false, slowUntil = 0, lastTile = null;          // the obstacle race: a pet that steps onto an obstacle walks slower for RACE.slowMs
  self.walker.onStep = (x, y, d) => { net.sendPos(x, y, d, self.area, surfFlag(surf)); if (!self.fx && !suspended && surf.mode !== 'ride') pets.step(self.area, x, y, self.walker.run, wxLv); stepGift(x, y); };      // a step onto or next to a seasonal gift opens it
  net.sendPos(sx, sy, 'down', 'town');

  const addPeer = (p) => {
    const w = new Walker(p.x ?? 0, p.y ?? 0, p.d || 'down');
    w.hurry = true;
    const o = { id: p.id, name: p.name, look: p.look, walker: w, emote: null, jumpAt: null, placed: p.x != null, area: p.area || 'town' };
    w.tileMult = (x, y) => paceFactor(o.area, x, y, o.look.species);                  // the same rule for a remote pet: its steps in the water last as long as the sender's
    w.onStep = (x, y) => { if (o.placed && o.area === self.area && !suspended) pets.peerStep(o.id, Math.hypot(x - self.walker.tileX, y - self.walker.tileY), o.area, x, y, wxLv); };      // another pet's step: heard only when near
    others.set(p.id, o);
  };
  for (const p of net.peers()) addPeer(p);

  function onNetEvent(ev) {
    if (!alive) return;
    if (ev.type === 'join') addPeer(ev.peer);
    else if (ev.type === 'leave') others.delete(ev.id);
    else if (ev.type === 'pos') {
      const o = others.get(ev.id);
      if (!o) return;
      o.surf = ev.surf || 0;                                                                  // riding (1) or wiped out (2): drawn with a board; a ride is walked at the wave's own pace
      o.walker.stepOverride = o.surf === 1 ? RIDE_MS : null;
      if (!o.placed || o.area !== ev.area || Math.abs(o.walker.tileX - ev.x) + Math.abs(o.walker.tileY - ev.y) > REMOTE_SNAP) { o.walker.snap(ev.x, ev.y, ev.d); o.placed = true; o.area = ev.area; } else o.walker.goTo(ev.x, ev.y, ev.d, o.area);
    } else if (ev.type === 'game') {
      games.onMessage(ev.m);
    } else if (ev.type === 'emote') {
      const o = others.get(ev.id);
      if (o) o.emote = { e: ev.e, until: performance.now() + EMOTE_MS };
    } else if (ev.type === 'jump') {
      const o = others.get(ev.id);
      if (o) { o.jumpAt = performance.now(); if (o.area === self.area && !suspended) pets.peerJump(Math.hypot(o.walker.tileX - self.walker.tileX, o.walker.tileY - self.walker.tileY)); }
    }
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    renderer.setInset(insets());
    renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  /** Is this tile allowed for this pet now? A pet playing cannot leave its game's zone (the walls are soft: it just stays). */
  function canEnter(x, y, zone, closed = false) {
    if (closed && doorAt(x, y, self.area)) { games.notify('Ahora no se puede entrar', 'wall'); return false; }      // the doors are shut while playing
    if (!zone || zone.has(x, y)) return true;
    games.notify(zone.wall, 'wall');
    return false;
  }
  const walkableFor = (mv) => (x, y) => isWalkable(x, y, self.area) && (!mv.zone || mv.zone.has(x, y)) && !(mv.closed && doorAt(x, y, self.area));

  function step(t) {
    if (!alive) return false;
    if (suspended) { last = t; return true; }
    const tStep = meter ? performance.now() : 0;
    if (meter) meter.tick(t);
    const dt = Math.min(100, t - last);
    last = t;
    const w = self.walker;
    if (self.fx && entranceState(self.fx.id, self.fx.phase, t - self.fx.t0).done) {      // the arrival or the exit is over
      const f = self.fx;
      self.fx = null;
      if (f.phase === 'leave') self.gone = true;
      if (f.resolve) f.resolve();
    }
    games.update();
    const start = games.takeStart();                              // a line-up game began: stand on the spot it gives (football's kickoff)
    if (start && self.area === 'town') { w.snap(start[0], start[1], 'down'); net.sendPos(start[0], start[1], 'down', 'town'); held.length = 0; fadeT0 = t; }
    const mv = games.movement();
    if (mv.frozen) { w.queue = []; held.length = 0; }
    if (mv.closed && self.area !== 'town' && !w.busy) {           // a game began while this pet was in the shop or on the farm: it comes back to the game's pad
      const g = games.view().game, [px, py] = GAME_PLACES[g && g.g ? g.g : 'hide'].spot[0];
      self.area = 'town'; w.snap(px, py, 'down'); net.sendPos(px, py, 'down', 'town'); held.length = 0; fadeT0 = t;
    }
    if (mv.zone && self.area === 'town' && !w.busy && !mv.zone.has(w.tileX, w.tileY)) {      // outside the game's area when it starts: run to its pad
      const [sx, sy] = mv.zone.pad;
      w.snap(sx, sy, 'down'); net.sendPos(sx, sy, 'down', 'town'); fadeT0 = t;
    }
    if (!w.busy) w.run = false;
    if (!w.busy && held.length && !self.fx && surf.mode === 'idle') {                    // a held arrow key keeps walking (not while surfing: the wave carries the pet)
      w.run = runs(shift || padRun || stickRun, mv);
      const d = held[held.length - 1];
      const diag = stickDirs.length === 2 && stickDirs.includes(d);
      const order = diag ? (flip ^= 1, flip ? stickDirs : [stickDirs[1], stickDirs[0]]) : [d];      // a diagonal tries its other axis when one is blocked: the pet slides along walls
      const can = (dir) => { const [dx, dy] = dirVector(dir); return isWalkable(w.tileX + dx, w.tileY + dy, self.area) && canEnter(w.tileX + dx, w.tileY + dy, mv.zone, mv.closed); };
      const go = order.find(can);
      if (go) { const [dx, dy] = dirVector(go); w.stepToward(w.tileX + dx, w.tileY + dy); } else w.face(order[0]);
    }
    if (racing) {
      const cur = { x: w.tileX, y: w.tileY };
      if (stumbled(lastTile, cur)) { slowUntil = t + RACE.slowMs; games.notify('¡Tropezaste!', 'wall'); }
      lastTile = cur;
      w.stepOverride = paceAt(t, slowUntil);
    } else if (w.stepOverride && surf.mode !== 'ride') { w.stepOverride = null; lastTile = null; }
    const utc = devNpcT === null ? events.serverNow() : devNpcT;                      // the clock the waves run on, the weather's: every player sees the same wave
    if (self.area !== 'beach' && surf.mode !== 'idle') { finishRide(surf); w.stepOverride = null; }      // taken away (a debug warp): no surfing anywhere else
    if (surf.mode === 'ride') {                                                          // riding: the wave sets the pace; the pet follows the crest, steering across it with up and down
      w.stepOverride = RIDE_MS;
      if (!w.busy) {
        const wave = waveAt(utc), steer = held.findLast((d) => d === 'up' || d === 'down');
        const dec = rideDecide({ crestX: wave ? wave.crestX : Infinity, x: w.tileX, y: w.tileY, steer: steer === 'up' ? -1 : steer === 'down' ? 1 : 0, walkable: (x, y) => isWalkable(x, y, 'beach'), water: (x, y) => waterAt(x, y, 'beach') });
        if (dec.type === 'move') w.stepToward(w.tileX + dec.dx, w.tileY + dec.dy);
        else if (dec.type === 'end') endRide(dec.why, t);
      }
    } else if (surf.mode === 'wipe' && wipeOver(surf, t)) net.sendPos(w.tileX, w.tileY, w.d, self.area, 0);      // free again
    pets.ride(surf.mode === 'ride' && !suspended);
    self.surf = surfFlag(surf);
    w.update(dt);
    if (!w.busy && !self.fx) {                                    // arrived on a door: go through it
      const door = doorAt(w.tileX, w.tileY, self.area);
      if (door && !mv.closed) { pets.cue('door'); self.area = door.to.area; w.snap(door.to.x, door.to.y, door.to.d); net.sendPos(door.to.x, door.to.y, door.to.d, self.area); state.marker = null; fadeT0 = t; }
    }
    if (landAt && t >= landAt) { landAt = 0; pets.cue('land'); }                    // the hop is over: the landing
    if (t - ambAt > 2000) { ambAt = t; state.amb = ambientAt(hourNow(location.search)); }
    state.area = self.area;
    state.swim = zoomTarget(waterOf(self.area, w));
    state.wave = self.area === 'beach' ? waveAt(devNpcT === null ? events.serverNow() : devNpcT) : null;      // the wave of the clock, for the foam                 // the camera eases out while the pet is in the sea (src/sea.js)
    state.fade = 1 - (t - fadeT0) / FADE_MS;
    for (const o of others.values()) o.walker.update(dt);
    state.others = inArea(others.values(), self.area).filter((o) => games.canSee(o.id));      // in a game: only the players, and their names, are drawn
    const vision = games.seekerVision();                         // the seeker sees only a circle of light, and not what hides in bushes
    state.dark = vision ? { full: vision.full, r: GAME_RULES.hide.lightRadius * 16 } : null;
    if (vision) state.others = vision.full ? [] : state.others.filter((o) => vision.see({ x: o.walker.tileX, y: o.walker.tileY }, !!TILES[tileAt(o.walker.tileX, o.walker.tileY)].hide));
    if (devSeasons) seasonSet = devSeasons;
    else if (t - seasonAt > 1000) { seasonAt = t; seasonSet = activeSeasons(devNpcT === null ? events.serverNow() : devNpcT, events.seasons); }      // default windows, overridden by the server's list (src/seasons.js); once a second is plenty
    state.seasons = seasonSet;
    if (t - wxAt > 1000) {                                        // the weather comes from the UTC clock and a fixed seed, so every player sees the same sky; Christmas (and December in Chile) turns rain into snow (src/snow.js)
      wxAt = t; wxLv = weatherNowLevels();
    }
    const outdoors = getArea(self.area).outdoor;
    state.weather = outdoors ? wxLv : null;                       // the town and the farm: both renderers draw the clouds, fog and rain
    state.snow = outdoors && wxLv.snow > 0.02 ? wxLv.snow : null;      // and the snow, stronger at night
    cityAudio.step(dt, { area: self.area, outdoor: outdoors, night: state.amb.night, weather: wxLv, x: w.tileX, y: w.tileY, utcMs: Date.now() + (wxLv.skew || 0) });
    npcs.dress(seasonSet);                                        // the villagers wear the Santa hat while Christmas is on (a swap only when the season set changes)
    state.gifts = self.area === 'town' ? giftWorld.update(devNpcT === null ? events.serverNow() : devNpcT, seasonSet, missions && missions.enabled() ? missions.giftOwner() : null, t) : null;      // the seasonal gifts lying about (3 every 2 hours while a season is on)
    if (self.area === 'town' && !w.busy && !self.fx && t - giftScanAt > 400) { giftScanAt = t; stepGift(w.tileX, w.tileY); }      // a gift that appears under, or next to, a pet standing still
    self.say = selfSay && t < selfSay.until ? selfSay.text : null;      // "+3 monedas" above the pet
    if (self.area === 'town') {                                   // ambient life: the birds look at every pet in the town
      stepLife(life, [{ x: w.tileX, y: w.tileY }, ...Array.from(others.values()).filter((o) => o.placed && o.area === 'town').map((o) => ({ x: o.walker.tileX, y: o.walker.tileY }))], t);
      state.life = shelterLife(lifeFrame(life, t, state.amb), wxLv);
    } else if (self.area === 'farm') {                            // the farm: the same birds, and the animals of the paddock
      stepLife(farmLife, [{ x: w.tileX, y: w.tileY }, ...inArea(others.values(), 'farm').map((o) => ({ x: o.walker.tileX, y: o.walker.tileY }))], t);
      state.life = shelterLife(farmLifeFrame(farmLife, t, state.amb), wxLv);
    } else state.life = null;
    const gv = games.view();
    if (getArea(self.area).outdoor && !vision && !(gv.game && gv.game.play)) {         // the villagers live in the town and on the farm (the ones of this area are drawn); while a game is played they are not drawn at all
      const sn = devNpcT === null ? events.serverNow() : devNpcT;
      const all = npcs.update(sn, { night: state.amb.night > 0.6, show: !!state.show && state.show.cut == null, shows: showSpans(events.events), pet: { name: self.name, area: self.area, x: w.tileX, y: w.tileY } });
      const wait = new Set(); if (talkGo) wait.add(talkGo.id); if (nearTalkId) wait.add(nearTalkId); if (talkLine && t < talkLine.until) wait.add(talkLine.id);
      hold.step(all, wait, { x: w.tileX, y: w.tileY }, dt, self.area, (x0, y0, x1, y1) => findPath(x0, y0, x1, y1, self.area));      // the villagers waiting for this pet stand still facing it, then walk back to their routine
      npcsHere = all.filter((n) => n.area === self.area);
      state.others = [...state.others, ...npcsHere];
    } else npcsHere = [];
    if (talkGo) {                                                  // the pet was sent to a tapped villager: talk when it has arrived
      const n = npcsHere.find((e) => e.id === talkGo.id), id = talkGo.id;
      if (!n || n.asleep || held.length || self.fx || modal || mv.closed) talkGo = null;
      else if (!w.busy) {
        const p = n.walker.pos();
        talkGo = null;
        if (Math.hypot(p.x - w.tileX, p.y - w.tileY) <= talkDist) { w.face(faceToward(w.tileX, w.tileY, p.x, p.y)); talk(id); }
      }
    }
    if (self.area === 'farm') {                                    // the crops (the same clock for everyone, what was picked is this pet's) and the action the pet can do here
      const sn = devNpcT === null ? events.serverNow() : devNpcT;
      if (t - farmAt > 500 || !farmState) {
        farmAt = t;
        const v = farmView(net.code || net.id, sn, farmMemory), sig = `${v.day}|${v.minute}|${farmMemory.rev}`;
        if (sig !== farmSig) { farmSig = sig; farmStamp++; }
        farmState = { ...v, stamp: farmStamp };
      }
      state.farm = farmState;
      farmAction = !w.busy && !self.fx && !modal && !mv.closed ? actionAt('farm', w.tileX, w.tileY, w.d, { basket: canasta, mem: farmMemory, room: net.code || net.id, nowMs: devNpcT === null ? events.serverNow() : devNpcT, tools: tools() }) : null;
    } else { state.farm = null; farmAction = null; }
    if (self.area === 'town' && !farmAction && !w.busy && !self.fx && !modal && !mv.closed) farmAction = pondAction(self.area, w.tileX, w.tileY, tools());      // beside the park's pond: A fishes (with the rod)
    if (self.area === 'beach' && !farmAction && !w.busy && !self.fx && !modal && !mv.closed && surf.mode === 'idle') farmAction = surfAction(utc, w.tileX, w.tileY, tools());      // at the break: A catches the wave (with the board), or what is missing
    const talkTo = !w.busy && !self.fx && !modal && !mv.closed && !claiming && missions && missions.enabled() ? talkTarget() : null;
    nearTalkId = talkTo ? talkTo.id : null;
    const atStore = self.area === 'farm' && !w.busy && !self.fx && !modal && !mv.closed && nearStore(w.tileX, w.tileY);
    if (atStore && (!farmAction || farmAction.id === 'hint')) farmAction = { id: 'store', label: 'Ver Almacén', target: 'store' };       // the stall's counter: the prompt opens the store
    if (talkTo && (!farmAction || farmAction.id === 'hint')) farmAction = { id: 'talk', label: `Hablar con ${talkTo.name}`, target: talkTo.id };      // a villager next to the pet: A talks (its mission)
    if (talkLine && t < talkLine.until) { const n = npcsHere.find((e) => e.id === talkLine.id); if (n) n.say = talkLine.text; }
    if (self.area === 'farm') {                                    // the Almacén's clerk greets a pet that steps up to the counter, and thanks it after a purchase
      const near = nearStore(w.tileX, w.tileY);
      if (near && !storeNear) { clerkSayUntil = t + SHOP_SAY_MS; storeVisits++; }
      storeNear = near;
      const clerk = npcs.clerk;
      clerk.say = thankLine && t < thankLine.until ? thankLine.text : t < clerkSayUntil ? clerkGreeting(storeVisits - 1) : null;
      state.others = [...state.others, clerk];
    } else storeNear = false;
    voices = self.area === 'farm' ? [...npcsHere, npcs.clerk] : npcsHere;      // whoever is talking now can be answered with an emote (react below); a villager's answer to that is not "talking"
    for (const v of voices) if (v.say && !v.asleep) spokeAt.set(v.id, t);
    if (reply && t >= reply.from) {
      const v = voices.find((e) => e.id === reply.id);
      if (t >= reply.until) reply = null;
      else if (v) { if (reply.emote && t < reply.from + REPLY_EMOTE_MS) v.emote = { e: reply.emote, until: reply.from + REPLY_EMOTE_MS }; else v.say = reply.text; }
    }
    const fk = farmAction ? `${farmAction.id}|${farmAction.label}` : '';
    if (fk !== farmKey) { farmKey = fk; onFarm({ action: farmAction }); }
    state.talk = null;
    if (self.area === 'shop') {                                    // the shopkeeper greets a pet that steps up to the counter
      const near = nearShopkeeper(w.tileX, w.tileY);
      if (near && !shopNear) { shopSayUntil = t + SHOP_SAY_MS; shopVisits++; }
      shopNear = near;
      if (t < shopSayUntil || (thankLine && t < thankLine.until)) shopSpokeAt = t;
      if (thankLine && t < thankLine.until) state.talk = [{ x: SHOPKEEPER.head.x, y: SHOPKEEPER.head.y, text: thankLine.text }];
      else if (t < shopSayUntil) state.talk = [{ x: SHOPKEEPER.head.x, y: SHOPKEEPER.head.y, text: shopGreeting(shopVisits - 1) }];
      if (reply && reply.id === 'shopkeeper' && t >= reply.from && t < reply.until) state.talk = [{ x: SHOPKEEPER.head.x, y: SHOPKEEPER.head.y, text: reply.text }];
    } else shopNear = false;
    self.act = activityOf({ area: self.area, game: gv.game, moving: w.busy });
    net.setActivity(self.act);
    racing = !!(gv.game && gv.game.g === 'race' && gv.game.play && gv.game.phase === 'play' && self.area === 'town');
    const ck = gv.game && gv.game.chick;
    if (ck && ck.seq !== chickSeq) {                                                       // a new motion: continue along its route, correct only what differs
      chickSeq = ck.seq;
      chickWalker.stepOverride = ck.v || null;                                              // a flight is drawn at the pace the referee runs it
      if (ck.snap) chickWalker.snap(ck.x, ck.y, ck.d); else chickWalker.follow(ck.route, 'town', 6, ck.o);
    }
    chickWalker.update(dt);
    if (ck && self.area === 'town') {
      const cp = chickWalker.pos();
      state.chicken = { x: cp.x, y: cp.y, frame: chickWalker.moving && Math.floor(t / 110) % 2 ? 1 : 0, flip: chickWalker.d === 'left' };
    } else state.chicken = null;
    state.ball = gv.game && gv.game.ball && self.area === 'town' ? gv.game.ball : null;
    const here = !w.busy ? spotAt(w.tileX, w.tileY, self.area) : null;      // standing on a game's pad: the button; walking onto the pad of an open lobby joins it
    if (here && gv.lobby && gv.lobby.g === here && !gv.lobby.iJoined) games.join();
    if (t - hudAt > 120) { hudAt = t; onHud({ ...gv, shopNear: self.area === 'shop' && shopNear && !modal, spot: here, wall: mv.zone && gv.game ? gv.game.name : null, frozen: mv.frozen }); }
    state.ghosts = seasonSet.has('halloween') ? ghostsAt(self.area, events.serverNow(), state.amb.night) : null;      // the wandering ghosts: the same place for everyone
    state.show = events.tick(!getArea(self.area).outdoor ? 'inside' : renderer.hd ? 'hd' : 'flat');      // the sky is seen from the town and from the farm      // the show that runs now, the same moment on every screen
    if (!meter) { renderer.draw(state, t); return true; }
    const tDraw = performance.now();
    renderer.draw(state, t);
    meter.mark('logic', tDraw - tStep); meter.mark('draw', performance.now() - tDraw);
    return true;
  }
  const frame = guardFrame(step, (f) => { raf = requestAnimationFrame(f); });      // a frame that throws is reported and skipped: the loop never ends on an error
  raf = requestAnimationFrame(frame);

  /** The pet stepped onto (or next to) a seasonal gift: open it. */
  function stepGift(x, y) {
    if (self.area !== 'town' || self.fx || modal) return;
    const g = giftWorld.near(x, y);
    if (g) openGift(g);
  }
  /**
   * Opens a gift: the server pays 10 to 30 gold (20 to 30 for one of Santa's) (`missions.gift`) when this pet is on a trip that can earn; sparkles, "+N monedas" above the pet. A visitor (no trip, or a board
   * that cannot earn) is told once how to open gifts; a gift opened already, or too late, just goes; the daily cap is told once a day; any other failure is tried again in 8 s.
   */
  async function openGift(g) {
    const t = performance.now();
    if (giftBusy.has(g.id) || (giftRetry.get(g.id) || 0) > t) return;
    if (!missions || !missions.enabled()) {
      if (!giftHinted) { giftHinted = true; onFarmDone({ ok: false, text: HINT_NO_TRIP }); }
      return;
    }
    const day = dayOf(devNpcT === null ? events.serverNow() : devNpcT).date;
    if (giftCapDay === day) return;
    giftBusy.add(g.id);
    const r = await missions.gift(g.id);
    giftBusy.delete(g.id);
    if (!alive) return;
    const t2 = performance.now(), out = giftOutcome(r);
    if (out.kind === 'paid') {
      giftWorld.open(g.id, t2);
      sound.play(out.item ? 'win' : 'coin');                          // Santa left an item: the fanfare; gold: the coin
      selfSay = { text: out.text, until: t2 + 1800 };
      self.jumpAt = t2; net.sendJump();
      onFarmDone({ ok: true, icon: 'coin', text: out.text });
    } else if (out.kind === 'gone') giftWorld.dismiss(g.id);          // opened already (or too late): it just goes
    else if (out.kind === 'cap') { giftCapDay = day; onFarmDone({ ok: false, text: out.text }); }
    else { giftRetry.set(g.id, t2 + 8000); onFarmDone({ ok: false, text: out.text }); }
  }
  /** A tap on a gift: open it when the pet is on or next to it, else walk there (it opens on the way, one step before). Not a map walk, so it works with the stick on screen too. */
  function tapGift(tile) {
    const g = self.area === 'town' ? giftWorld.at(tile[0], tile[1]) : null;
    if (!g) return false;
    const w = self.walker, mv = games.movement();
    if (mv.frozen || mv.zone || mv.closed) return false;
    if (Math.max(Math.abs(w.tileX - g.x), Math.abs(w.tileY - g.y)) <= 1) { openGift(g); return true; }
    const path = findPath(w.tileX, w.tileY, g.x, g.y, self.area);
    if (!path.length) return false;
    w.queue = []; w.setPath(path); state.marker = { x: g.x, y: g.y, until: performance.now() + 500 };
    return true;
  }

  /** The nearest villager that is awake and within TALK_DIST of the pet, or null. */
  function talkTarget() {
    const w = self.walker;
    let best = null, bd = talkDist + 1e-9;
    for (const n of npcsHere) {
      if (n.asleep || n.clerk) continue;
      const p = n.walker.pos(), d = Math.hypot(p.x - w.tileX, p.y - w.tileY);
      if (d <= bd) { bd = d; best = n; }
    }
    return best;
  }
  /** The pet's emote was sent: the nearest villager that has just spoken (src/npc-react.js; in the shop, the shopkeeper) answers it, on this screen only. */
  function react(e) {
    const now = performance.now(), w = self.walker, pet = { x: w.tileX, y: w.tileY };
    let target = null;
    if (self.area === 'shop') { if (nearShopkeeper(pet.x, pet.y) && now - shopSpokeAt <= REPLY_WINDOW_MS) target = { id: 'shopkeeper' }; }
    else target = hearer(voices.map((n) => { const p = n.walker.pos(); return { id: n.id, x: p.x, y: p.y, asleep: n.asleep }; }), pet, spokeAt, now);
    const r = target && reactionTo(e, target.id.replace('npc:', ''), self.name, replies);
    if (!r) return;
    replies++;
    reply = { id: target.id, text: r.line, emote: r.emote, from: now + REPLY_DELAY_MS, until: now + REPLY_DELAY_MS + (r.emote ? REPLY_EMOTE_MS : 0) + REPLY_SAY_MS };
  }
  const says = (id, text) => { if (text !== '...') pets.cue('talk'); talkLine = { id, text, until: performance.now() + TALK_SAY_MS }; };
  /**
   * The pet talks to a villager: it asks for its mission of the day (the same for the whole room), tells how far the pet is, or, once the pet has done it,
   * hands it in: the server pays real gold within its daily cap (`missions.claim`), the villager thanks the pet and the mission uses up what it asked for (a bring mission takes its items from the Canasta, the others the day's counted actions).
   */
  async function talk(id) {
    const n = npcsHere.find((e) => e.id === id);
    if (!n || !missions || claiming) return;
    const vid = id.slice(4), nowMs = devNpcT === null ? events.serverNow() : devNpcT, room = net.code || net.id, day = dayOf(nowMs).date;
    farmMemory.use(clockOf(nowMs).day);
    const m = missionFor(room, day, vid), paidToday = () => { const l = missions.ledger(); return l.day === day ? l.done : []; };
    const st = statusOf(m, { mem: farmMemory, basket: canasta, paidToday: paidToday() });
    if (st.state === 'done') { says(id, doneLine(vid)); return; }
    if (st.state === 'open') { says(id, missionText(m)); onFarmDone({ ok: true, text: NOT_READY(st.have, st.need) }); return; }
    claiming = true; says(id, '...');
    const r = await missions.claim(m);
    claiming = false;
    const settle = (line, use = true) => { if (use) { if (m.type === 'bring') canasta.take(m.kind, m.n); else farmMemory.consume(m.type, m.kind, m.n); } farmMemory.markMission(m.id); says(id, line); };
    if (r.ok) { pets.cue('reward'); settle(r.capped ? CAPPED_LINE : thanksFor(vid)); self.jumpAt = performance.now(); net.sendJump(); onFarmDone({ ok: true, icon: 'coin', text: GOLD_POP(r.gold) }); }
    else if (r.error === 'done') settle(doneLine(vid), false);                // the server says it was paid already (this browser forgot): nothing is used up
    else if (r.error === 'cap_reached') settle(CAPPED_LINE);
    else { talkLine = null; onFarmDone({ ok: false, text: claimErrorText(r) }); }
  }
  /** A on the break: catch the wave when it is passing (it starts the ride), or fall (too early, too late). Sounds, a line over the pet, and the position the others see. */
  function catchWave() {
    const w = self.walker, t = performance.now(), r = surfPress(surf, { utcMs: devNpcT === null ? events.serverNow() : devNpcT, x: w.tileX, y: w.tileY, tools: tools(), t });
    if (r === 'catch') { pets.cue('whoosh'); w.queue = []; w.face('right'); net.sendPos(w.tileX, w.tileY, 'right', self.area, surfFlag(surf)); }
    else if (r === 'early' || r === 'late') fall(r, t);
  }
  function fall(why, t) {
    const w = self.walker;
    if (surf.mode !== 'wipe') wipeout(surf, t, why);
    w.queue = []; w.stepOverride = null; held.length = 0;
    pets.cue('wipe');
    selfSay = { text: SAY[why], until: t + 1500 };
    net.sendPos(w.tileX, w.tileY, w.d, self.area, surfFlag(surf));
  }
  function endRide(why, t) {
    const w = self.walker;
    w.stepOverride = null;
    if (why === 'lag') { fall('lag', t); return; }
    finishRide(surf);
    pets.cue('splash'); pets.cue('reward');
    selfSay = { text: SAY.done, until: t + 1800 };
    self.jumpAt = t; net.sendJump();
    net.sendPos(w.tileX, w.tileY, w.d, self.area, 0);
  }
  /** Does the farm action of this pet's reach (the object that was tapped, or the pet's own tile)? Does it and returns true. */
  function farmDo() {
    if (!farmAction || farmAction.id === 'hint') return false;
    if (farmAction.id === 'store') { pets.cue('door'); onStore(); return true; }
    if (farmAction.id === 'surf') { catchWave(); return true; }
    if (farmAction.id === 'fish') { pets.cue('confirm'); onFish(); return true; }
    if (farmAction.id === 'talk') { talk(farmAction.target); return true; }
    const res = perform(farmAction, { basket: canasta, mem: farmMemory, tools: tools() });
    farmAt = -Infinity;                                            // the plots and the prompt are looked at again at once
    if (res.ok) { pets.cue('pick'); const t = performance.now(); self.jumpAt = t; net.sendJump(); onFarmAction({ type: res.type, kind: res.kind || null, target: farmAction.target }); }
    onFarmDone(res);
    return true;
  }
  /** A tap on the farm's object (a tree, the well, the paddock's fence): do its action when the pet is already there, else walk to the nearest open tile beside it. */
  function farmTap(tile, walks) {
    if (self.area !== 'farm' || self.walker.busy) return false;
    const obj = objectAt(tile[0], tile[1]);
    if (!obj) return false;
    const w = self.walker;
    if (Math.abs(w.tileX - tile[0]) + Math.abs(w.tileY - tile[1]) === 1) {       // beside it: face it and act
      w.face(w.tileX < tile[0] ? 'right' : w.tileX > tile[0] ? 'left' : w.tileY < tile[1] ? 'down' : 'up');
      farmAction = actionAt('farm', w.tileX, w.tileY, w.d, { basket: canasta, mem: farmMemory, room: net.code || net.id, nowMs: devNpcT === null ? events.serverNow() : devNpcT, tools: tools() }, tile);      // only what that object offers
      if (farmDo()) return true;
    }
    if (!walks) return false;
    let best = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = tile[0] + dx, ny = tile[1] + dy;
      if (!isWalkable(nx, ny, 'farm')) continue;
      const path = nx === w.tileX && ny === w.tileY ? [] : findPath(w.tileX, w.tileY, nx, ny, 'farm');
      if ((path.length || (nx === w.tileX && ny === w.tileY)) && (!best || path.length < best.length)) best = path;
    }
    if (best && best.length) { w.setPath(best); state.marker = { x: tile[0], y: tile[1], until: performance.now() + 500 }; return true; }
    return false;
  }
  /** A tap on (or just behind, for a head in the HD-2D view) an awake villager: walk to a free tile beside it and talk on arrival, or talk at once when already within talkDist. Not a map walk, so it works with the stick on screen too. */
  function tapVillager(tile) {
    if (!missions || !missions.enabled() || claiming || !npcsHere.length) return false;
    const w = self.walker, mv = games.movement();
    if (mv.frozen || mv.zone || mv.closed) return false;
    const n = villagerAtTap(tile, npcsHere.map((e) => { const p = e.walker.pos(); return { id: e.id, x: p.x, y: p.y, asleep: e.asleep, clerk: e.clerk }; }));
    if (!n) return false;
    const v = npcsHere.find((e) => e.id === n.id), vx = v.walker.tileX, vy = v.walker.tileY;
    w.queue = [];
    if (!w.busy && Math.hypot(n.x - w.tileX, n.y - w.tileY) <= talkDist) { w.face(faceToward(w.tileX, w.tileY, n.x, n.y)); talkGo = null; talk(n.id); return true; }
    const spot = talkSpot(vx, vy, [w.tileX, w.tileY], { walkable: (x, y) => isWalkable(x, y, self.area) && !doorAt(x, y, self.area), taken: (x, y) => npcsHere.some((e) => e.walker.tileX === x && e.walker.tileY === y), path: (x0, y0, x1, y1) => findPath(x0, y0, x1, y1, self.area) });
    if (!spot) return false;
    talkGo = { id: n.id };
    if (spot.path.length) { w.setPath(spot.path); state.marker = { x: spot.x, y: spot.y, until: performance.now() + 500 }; }
    return true;
  }
  function onPointer(ev) {
    if (suspended || ev.button > 0 || self.fx || self.gone || modal || surf.mode !== 'idle') return;      // surfing: the wave decides where the pet goes
    const tile = renderer.pointToTile(ev.clientX, ev.clientY);
    if (!tile) return;
    talkGo = null;
    if (tapVillager(tile) || tapGift(tile)) { ev.preventDefault(); return; }
    if (farmTap(tile, tapWalks(ev.pointerType, !!pad))) { ev.preventDefault(); return; }
    if (!tapWalks(ev.pointerType, !!pad)) return;      // with the stick on screen a finger on the map does not walk the pet
    ev.preventDefault();
    const mv = games.movement();
    if (mv.frozen) return;
    if ((mv.zone || mv.closed) && !canEnter(tile[0], tile[1], mv.zone, mv.closed)) return;
    const path = findPath(self.walker.tileX, self.walker.tileY, tile[0], tile[1], mv.zone || mv.closed ? walkableFor(mv) : self.area);
    if (path.length) {
      self.walker.setPath(path);
      state.marker = { x: tile[0], y: tile[1], until: performance.now() + 500 };
    }
  }
  function onKeyDown(ev) {
    if (suspended || isTyping(ev) || modal) return;
    shift = ev.shiftKey;
    if (self.area === 'shop' && shopNear && (ev.key === 'Enter' || ev.key === 'e' || ev.key === 'E')) { ev.preventDefault(); if (!ev.repeat) { pets.cue('door'); onShop(); } return; }      // Enter or E at the counter opens the shop
    if ((ev.key === 'Enter' || ev.key === 'e' || ev.key === 'E') && farmAction && farmAction.id !== 'hint') { ev.preventDefault(); if (!ev.repeat) farmDo(); return; }      // Enter or E next to a farm object does its action
    if (isJumpKey(ev)) {                                                // Space: a hop, also in a game (it changes no rule); never scrolls the page
      ev.preventDefault();
      if (!ev.repeat) jump();
      return;
    }
    const d = KEY_DIRS[ev.key];
    if (!d || self.fx) return;
    ev.preventDefault();
    press(d);
  }
  function onKeyUp(ev) {
    shift = ev.shiftKey;
    if (isJumpKey(ev) && !isTyping(ev)) ev.preventDefault();          // a focused button must not click on Space's release
    release(KEY_DIRS[ev.key]);
  }
  // keys and the phone's controls share these: a direction held, a hop
  function press(d) { if (!held.includes(d)) { held.push(d); self.walker.queue = []; } }   // a key cancels a tapped route
  function release(d) {
    const i = held.indexOf(d);
    if (i >= 0) held.splice(i, 1);
  }
  function jump() {
    if (self.area === 'shop' && shopNear && !modal) { pets.cue('door'); onShop(); return; }          // A (or Space) at the counter opens the shop instead of hopping
    if (!modal && farmDo()) return;                                                 // A (or Space) next to a farm object does its action instead of hopping
    const t = performance.now();
    if (!self.fx && !self.gone && (self.jumpAt == null || t - self.jumpAt >= JUMP_MS)) { self.jumpAt = t; net.sendJump(); pets.cue('jump'); landAt = t + JUMP_MS * 0.85; }
  }
  const touchpad = pad && createTouchpad({
    ...pad,
    onStick({ dirs, run }) { for (const d of stickDirs) release(d); stickDirs = dirs; stickRun = run; if (!self.fx) for (const d of dirs) press(d); },
    onJump: jump,
    onRun(on) { padRun = on; },
  });
  canvas.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { held.length = 0; shift = false; padRun = false; stickRun = false; stickDirs = []; });
  const onVisibility = () => { if (document.hidden) cityAudio.silence(); net.resync(); };                    // timers sleep in a hidden tab: say where we are going in and coming out
  document.addEventListener('visibilitychange', onVisibility);

  return {
    onNetEvent,
    /** The scheduled sky show: "Volver al pueblo" winds it down on this screen only and "Ver show" brings it back. */
    events: { cut: () => events.cut(), resume: () => events.resume(), toggle: () => events.toggle(), injectDev: (kind, secs) => events.injectDev(kind, secs) },
    /** The HD-2D view: is it on, switch it (the page remembers the choice), and is it locked off (?flat=1). */
    hd: { get on() { return renderer.hd; }, stats: () => renderer.stats(), get locked() { return renderer.flat; } },
    /** The pets of this room for the radar (this pet first): [{ n, sp, st, s, a }]. */
    radarPets: () => radarPets(self, net.peers()),
    /** Plays the exit of an entrance id and resolves when the pet is gone (the caller then leaves the room). */
    playExit(id) {
      held.length = 0; self.walker.queue = [];
      return new Promise((resolve) => { self.fx = { id, phase: 'leave', t0: performance.now(), resolve }; });
    },
    /** For manual testing in the console (two tabs): where this pet is, and walk to a tile like a tap would. */
    debug: {
      pos: () => [self.walker.tileX, self.walker.tileY],
      area: () => self.area,
      /** development only (?dev=1&npct=<ms>): moves the pinned villagers' clock. */
      setClock(ms) { if (devNpcT !== null && Number.isFinite(ms)) devNpcT = ms; },
      npcs: () => npcsHere.map((n) => { const p = n.walker.pos(); return { id: n.id, name: n.name, x: p.x, y: p.y, asleep: n.asleep, say: n.say }; }),
      warp(area, x, y) { self.area = area; self.walker.snap(x, y, 'down'); net.sendPos(x, y, 'down', area); fadeT0 = performance.now(); },
      /** For testing the surf: what the surf state is, and A at the break. */
      surf: () => ({ mode: surf.mode, why: surf.why }),
      catchWave: () => { catchWave(); return surf.mode; },
      goTo(x, y) { const mv = games.movement(); const path = findPath(self.walker.tileX, self.walker.tileY, x, y, mv.zone || mv.closed ? walkableFor(mv) : self.area); if (path.length) self.walker.setPath(path); return path.length; },
    },
    games: {
      play: () => { const g = spotAt(self.walker.tileX, self.walker.tileY, self.area); return !!g && games.open(g); },
      join() {                                                  // "Me sumo": from anywhere; a pet inside a building comes out on the pad
        const ok = games.join();
        const lv = games.view().lobby;
        if (ok && lv) { const [sx, sy] = GAME_PLACES[lv.g].spot[0]; if (self.area !== 'town') { self.area = 'town'; self.walker.snap(sx, sy, 'down'); net.sendPos(sx, sy, 'down', 'town'); fadeT0 = performance.now(); } }
        return ok;
      },
      seek: () => games.volunteer(),
      zone: (z) => games.pickZone(z),
      team: (t) => games.pickTeam(t),
      leave: () => games.leave(),
      dismiss: () => games.dismiss(),
    },
    /** The farm's action available now (for the prompt's own button: a tap on it does it). */
    /** What the water is like now, for the fishing layer (the town is suspended while it is open): { night, christmas }. */
    fishCtx: () => ({ night: ambientAt(hourNow(location.search)).night >= 0.5, christmas: (devSeasons || activeSeasons(devNpcT === null ? events.serverNow() : devNpcT, events.seasons)).has('christmas'), weather: weatherNowLevels() }),
    farm: { act: () => farmDo(), get action() { return farmAction; }, memory: farmMemory, basket: canasta },
    /** The rows of the "Misiones" panel for today ({ rows, earned, cap }), or null when the missions are off (no pet's trip, an old board). */
    missions: {
      list() {
        if (!missions || !missions.enabled()) return null;
        const nowMs = devNpcT === null ? events.serverNow() : devNpcT, day = dayOf(nowMs).date, l = missions.ledger();
        farmMemory.use(clockOf(nowMs).day);
        return { rows: missionRows(net.code || net.id, day, { mem: farmMemory, basket: canasta, paidToday: l.day === day ? l.done : [] }), earned: l.day === day ? l.earned : 0, cap: l.cap };
      },
    },
    /** A panel opened or closed over the town: the pet stops while it is open. */
    /** The pet's look now (what it wears, a bought item included): the page shows "Jugar" when it wears the VR goggles. */
    look: () => self.look,
    /** The arcade opens over the town (true) or closes (false): the town stops drawing and listening, and the pet stands still. */
    suspend(on) { suspended = on; if (on) { cityAudio.silence(); landAt = 0; held.length = 0; shift = false; padRun = false; stickRun = false; stickDirs = []; self.walker.queue = []; if (touchpad) touchpad.reset(); } },
    setModal(on) { modal = on; if (on) { held.length = 0; self.walker.queue = []; if (touchpad) touchpad.reset(); } },
    /** The pet shows an item it just bought (this screen only: the look the others see does not change), and the shopkeeper says thanks. */
    wear(key) {
      const slot = sprites.catalogue[key] && SLOTS.indexOf(sprites.catalogue[key].slot);
      if (slot >= 0) self.look = { ...self.look, items: self.look.items.map((it, i) => (i === slot ? key : it)) };
    },
    thank(text) { thankLine = { text, until: performance.now() + SHOP_SAY_MS }; },
    emote(e) {
      if (self.fx || self.gone) return;
      if (net.sendEmote(e)) { self.emote = { e, until: performance.now() + EMOTE_MS }; react(e); }
    },
    destroy() {
      alive = false;
      cityAudio.silence();
      stopPerf();
      events.stop(); onShow(false);
      if (self.fx && self.fx.resolve) self.fx.resolve();
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (touchpad) touchpad.destroy();
      canvas.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
