# pixel-pet-city

The online town of [pixel-pet](https://github.com/feliparri/pixel-pet): pets from different phones and browsers meet in a
small top-down town, walk around and greet each other with presets. Plain HTML, CSS and ES modules; there is no build step.

- Only real pets come in: the town is opened with `?trip=<code>` from the board (Opciones > Ciudad) or the phone app (same trip API).
  A page without a trip shows how to enter and a "Tengo un código" field; there is no free pet chooser on the public page.
- Private rooms by invite code (`FOCA-LUNA-42`): "Crear sala" makes one, "Unirse" needs it; only a pet whose trip was claimed sees these
  controls (see "Rooms and real pets" below for what is not enforced yet). Rooms cannot be listed and end when everyone leaves. No accounts.
- No free-text chat: only the presets (👋 ❤️ 😄 🎉 "¡Hola!", "¡Juguemos!", "¡Chau!"). Only the pet's name and look are shared. A villager that has just spoken near the pet
  answers the pet's preset with a short line (and an emote of its own for the happy ones), on that screen only (`src/npc-react.js`); the others only see the pet's own emote.
- A town of 48 x 74 tiles with a plaza and fountain, four houses, the Parque (pond, trees, bushes, open grass) and the Tienda, which can
  be entered (its raccoon shopkeeper sells accessories for the pet's gold, "Tienda" panel). On the farm the Almacén's stall sells the tools the farm work needs
  (Hoz, Balde, Saco de alimento; also the pet's gold, kept per pet in the town, "Almacén" panel). Every villager asks for one thing a day (harvest, bring fruit, water, feed;
  talk with A / E next to it, "Misiones" panel): the server pays real gold for it, at most 50 a day per pet, and the board applies it when the pet comes home. The town follows your local clock: dusk, night, lit windows and lamps.
- Ambient life (`src/life.js`, `src/art/life.js`): sparrows that peck and fly off when a pet comes within 3 tiles and return later, butterflies over
  the garden and the Parque by day, fireflies at night (they follow the town's clock), a duck and rings on the pond and the fountain's spray.
  It is drawn on each screen only, seeded by the room code (so every player sees a similar scene), sends nothing over the net and never
  blocks walking.
- Games, played in the Parque on their own marked places (a signpost, a pad and a big floating icon each). The town is social only:
  pets are not cared for here. Stand on a game's pad and press **Jugar a ...**: a 10 s lobby opens and everybody in the room gets
  "¡Escondida! ¿Juegan?" with **Me sumo** (or just walk onto the pad). Anyone can start; the creator of the room has no special power.
  - **Escondida** (hide and seek): in the lobby any pet that joined picks the zone, **Parque**, **Plaza** or **Todo el pueblo** (the
    default); the first choice wins and everybody sees it. Players cannot leave the zone (a soft "Vuelve al parque"). During the lobby anyone can press **¡Yo busco!**; if nobody does the seeker
    rotates (who searched least, then who joined first). 15 s countdown (the seeker is frozen in the dark), then 90 s search seeing
    only a 3-tile circle of light; bushes hide a pet unless the seeker is next to it. Touching a hider finds it. Stars: +1 per survivor,
    +1 for the seeker per find.
  - **Pillar la gallina** (works solo): the chicken starts at the gallinero and wanders calmly (2 tiles a second); while a pet is within
    6 tiles it runs at one constant speed, 5 tiles a second (a pet walks 6), with no sprints and no rests, and it calms down only when
    every pet is beyond 8 tiles. It keeps its heading until something blocks the way and never turns back on itself, so its route can be
    read and cut with a shortcut. The referee sends it as a motion (tile, pace, next 8 moves, ms since it arrived) every 400 ms and
    every browser glides along that route. First to touch it
    scores 3 stars; 60 s or first to 3 catches.
  - While a game is on its players see only the players who joined (pets and names); pets that did not join keep seeing everybody, and
    so do found hiders (as spectators of the game). Doors do not take a player inside during a game.
  - The lobby waits 2.5 s after the last join or button before an early start, and players repeat their join and "¡Yo busco!" every 2 s
    until it closes. Game clocks are referee-relative (the referee sends the milliseconds left): a tab that slept does not use the
    countdown or the search up, and a player missing for under 12 s is not given up.
  - **Cancha** (football, works solo as practice): a long 16 x 22 tile pitch in the south of the Parque, fenced, with an entrance on each side
    and a goal at each end (the pad is by the west entrance). In the lobby each player who joined picks **Azul** or **Rojo**: a player's
    first choice wins, nobody has special power, and teams are balanced by default (a choice is honoured while its team has half the
    players, rounded up; the rest fill the smaller team). Everybody is placed at their kickoff spot, a 3-2-1 countdown, then you kick the
    ball by walking into it (it rolls faster than a pet walks and bounces off the fence). The referee simulates the ball and sends a sample
    (`gball`) at every kick and every 200 ms while it rolls; every browser advances that sample with the same fixed-step physics. A goal
    (`ggoal`) puts the ball back on the centre spot for 1.8 s. First to 3 goals or 2 minutes; the winning team earns 4 stars each, a draw
    gives everybody 1, and with nobody on the other team there are no stars. North goal = Azul scores, south goal = Rojo scores.
  - **Pista** (obstacle race, works solo as practice): a 20 row track of three lanes in the south-east of the Parque, fenced, running
    north from a start line to a checkered finish row (the pad is below the start line). Hurdles, hay bales and puddles are walkable but
    a pet that steps onto one walks at half pace for 1 s ("¡Tropezaste!"; each screen slows its own pet, the others just see slower steps).
    Everybody lines up below the start line, a 3-2-1 countdown, then "¡Ya!". The referee gives the places in the order the pets reach the
    finish row (`gfin`, ties by roster order) and shows who has arrived; the race closes when everybody is in, 20 s after the first
    finisher, or at 60 s. Stars by place: 5, 3, 2, then 1 for any other finisher; nothing for those who did not arrive or when racing alone.
  - Stars show in the HUD (`⭐ 12`) and belong to the real pet: they are kept in the trip's server state (`trip-save`, `{ v: 1, stars }`,
    saved a moment after each change); the shop that spends them is a later stage.
  - Radar (for the phone app): every pet's presence (`hello`, also repeated on the 2 s heartbeat) carries its five stats (`s`: hunger, fun,
    energy, clean, health, 0-100, from the trip's pet view) and what it is doing (`a`: `idle`, `walk`, `hide`, `chicken`, `football`, `race`,
    `shop`; a game counts only for its players). The browser of a visiting pet saves the room's pets (itself first, at most 8) as
    `state.radar` through `trip-save` every 10 s and when the room changes, and an empty one (`room: ""`) when the pet is not in a shared
    room (its private corner counts as none). The board's phone reads it from the device `trip-status` (docs/trip-api.md). `src/radar.js`.
  - No host: one browser among the players is the invisible *referee* (the lowest peer id among the players) that simulates the shared
    things and broadcasts them; if it leaves, the next lowest id carries on. Shared state is only believed from the referee.
    One lobby or game at a time per room. See `src/games/`.

## Try it locally (two tabs)

```sh
python3 -m http.server 8000      # in this folder
```

1. Open <http://localhost:8000/?local=1&dev=1> (development only: the pet chooser and local rooms; without `dev=1` you get the landing page). Pick a pet, press **Crear sala**.
2. Open a second tab at the same address, pick another pet, type the code in **Código** and press **Unirse**.
3. Walk with the arrows or WASD (or tap the ground on a phone); press an emote and watch it in the other tab. **Salir** in one
   tab removes its pet from the other. A third tab with a different code sees nothing.

Local mode uses a `BroadcastChannel`, so it only connects tabs of the same browser.

Tests (Node 20+, no dependencies): `npm test`.

## Online mode (Supabase Realtime)

Realtime Broadcast and Presence only, on the free tier. No tables, no accounts. One channel per room: `room:<code>`.

1. Create a Supabase project. In Project settings > API copy the project URL and the **anon** public key.
2. Put both in [`config.js`](config.js). Never a `service_role` key (the app refuses one).
3. Commit and publish. Until `config.js` is filled in the landing page says the town is not configured.

The code is the only secret: anyone who knows the code and the anon key can listen to the room, so it is meant for friends,
not for strangers. Everything received is validated and rate-limited (`src/protocol.js`): names are cut to 12 safe characters,
looks and items must exist in the exported catalogue, positions must be walkable tiles, emotes must be presets.

## Publishing (GitHub Pages)

Settings > Pages > Deploy from a branch > `main` / root. `.nojekyll` is there, `index.html` is at the root. The Android app only
opens `https://feliparri.github.io/pixel-pet-city/`.

## Rooms and real pets

The pet comes from a trip (`docs/trip-api.md`): `?trip=<code>`. The old `#n=..&s=..` fragment is ignored, because it proved nothing.
Known limitation: the room controls are only shown to a claimed trip pet and the page refuses to open an online room without one, but
Realtime channels are still open to anyone holding the public anon key, so a modified client could join a room without a pet. True
enforcement needs the server to issue a short-lived room token for a claimed trip and Realtime to check it (private channels with an
authorization policy); see `docs/room-access.md`.

## Art

`assets/` is generated by the game's exporter and committed (about 55 KB): in the pixel-pet repo run
`make city-sprites CITY=../pixel-pet-city`.

- `pets.png`: 32 px cells, row = species * 4 + stage (frog, seal, cat; baby, child, adult, elder), column = frame (idle, blink, look, chomp, happy).
  The game has no side or back walk frames, so the town mirrors `look` for left/right and hops between tiles.
- `parts.png`: 40 px cells, every accessory part with its own palette; `sprites.json` says, per item and per species-stage, where each
  part goes (`[part, x, y, mirror, behind]`, relative to the pet's cell) and its draw order (`drawOrder`).
- `font.json`: the game's pixel font.

## Layout

| Path | What |
| --- | --- |
| `src/code.js` | room codes |
| `src/map.js`, `src/path.js`, `src/walker.js` | the map, collisions, grid pathfinding, tile-to-tile movement and interpolation |
| `src/protocol.js` | validation, sanitizing and rate limits for everything received |
| `src/net.js`, `src/transport-*.js` | the room session and its `local` and `supabase` transports |
| `src/art/*.js` | the tileset, drawn in code with the pets' palette: ground tiles, props, houses, the shop interior; `bake.js` bakes an area |
| `src/life.js` | the ambient life: seeded scene, birds' state, poses of butterflies, fireflies, duck, rings and spray |
| `src/render.js`, `src/sprites.js`, `src/font.js`, `src/daynight.js` | drawing: integer scale, camera, props sorted with pets, day/night tint and lights |
| `tools/stamp.mjs` | cache-busting: run `node tools/stamp.mjs` before committing changes to `src/`, `style.css` or `config.js` |
| `shot.html`, `tools/shots.mjs` | the preview (below) |
| `src/games/*.js` (`soccer.js`: ball physics, teams, stars; `race.js`: places, stars, slowdown), `src/hud.js`, `src/stars.js`, `src/radar.js` | game rules (pure), the per-browser game manager, the overlay, the star counter and the radar saver |
| `src/town.js`, `src/main.js` | input and the game loop; the lobby and town screens |

## Previews

`node tools/shots.mjs` renders the town (day, dusk, night), the shop and two phone-sized views to `docs/preview-*.png` with headless Chrome
(`CHROME=/path/to/chrome` if needed). Or open `shot.html?shot=town|shop|view&hour=21&scale=2` in a browser. In the game, `?hour=21` forces the time of day.

## Web trip (a pet visiting from its board)

Open `?trip=<code>` (the board shows the code and a QR): the pet arrives with its entrance animation (parachute by default), lives in the town,
and leaves when the board recalls it ("Volvió a su casa"). API contract: `docs/trip-api.md`; server: `supabase/` (migration + one `trip` Edge Function).

- No Supabase needed: `node tools/local-demo.mjs` serves the town with the real handlers on an in-memory database and prints a code to open;
  `curl -X POST localhost:8099/demo/recall` plays the board's recall (then `return`, `ack`).
- Against the deployed project: `node tools/fake-board.mjs run` (register, start, wait for the claim, recall, return, ack). Fixtures in
  `tests/fixtures` come from `make city-fixtures CITY=../pixel-pet-city` in the game repo.
- Demo entrance: add `&dev=1&entrance=blue_bolt` to the URL.
