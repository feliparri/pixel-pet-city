# City fishing and emotes

## Objective
Owner 2026-11-24: add fishing as a minigame in the style of the VR-goggles arcade, with its own sound and music, and a full set of emojis.

## Decisions (owner)
- Fishing needs a fishing rod bought in the Almacén (farm store); without it the pond says what is missing.
- Fishing is a full-screen layer like the arcade (town suspended): cast (hold to charge, release), wait for the bite (tap in time), reel (keep the bar in the green zone while the fish pulls). About 10 fish by rarity, some only at night or in the Christmas season. Daily stars like the arcade, and an album of caught fish.
- Sound and music from the game's own synth (src/sound.js): cast whoosh, float plop, bite cue, reel, catch fanfare (bigger for rare fish); a calm loop while waiting that speeds up on a bite; respects the town's sound switch.
- Emotes: no free text ever travels (src/protocol.js EMOTES are ids). About 24 curated emotes in tabs inside the 💬 fan (mood, gestures, things) plus a couple of new phrases.

## Constraints
- Plain ES modules, no dependencies; tests `node --test tests/*.test.js`; `node tools/stamp.mjs` after src changes.
- UI copy neutral Spanish; artifacts English. Branch feat/christmas-event; commit as felipe.huerta.iturra@gmail.com, Conventional Commits, no AI attribution.
- The rod needs the server: `supabase/functions/trip/tools.js` price list and the `pet_tools.tool` check constraint (new migration). Writing them is fine; applying the migration and deploying the function need the owner's go. Local mode (src/shop-mock.js) must work without the server.
- Push and publish only with the owner's go. TDD not configured: ordinary checks.

## Tasks
- [x] EM.1 Emotes: about 24 curated emotes plus new phrases in tabs inside the 💬 fan; protocol accepts the new ids; desktop row too. Route: delegated.
- [x] FI.1 Fishing rod in the Almacén: client TOOLS, server price list, migration file (not applied), mock shop. Route: delegated.
- [x] FI.2 Fishing rules (pure): cast, bite window, reel tension, fish table with rarity, night and season fish, stars per day, album. Tests. Route: delegated.
- [x] FI.3 Fishing layer: view, menus and HUD like the arcade; "A: Pescar" at the park pond with the rod, "Necesitas una Caña — Almacén" without it; touch and keyboard.
- [x] FI.4 Fishing sound and music.
- [x] FI.5 Album screen and daily stars wired to the town's star counter.
- [ ] FI.6 Owner go: apply the migration and deploy the trip function.

## Progress
- 2026-11-24 Document created; EM.1, FI.1, FI.2 delegated.
- 2026-11-24 EM.1 done (2d74c3c): 24 emoji in EMOTE_TABS (Ánimo, Gestos, Cosas) plus 6 phrases, `#emote-panel` shared by the phone fan and the desktop `Más`; villagers answer new emotes through group pools. Evidence: 664 tests pass; screenshots at 844x390 touch and 1280x720; a 🐟 and ¡Gracias! shown over the pet.
- 2026-11-24 FI.1 done (0a1f5d1): `fishing_rod` (40) in client and server TOOLS, `rod` icon, migration `20261124120000_fishing_rod_tool.sql` (NOT applied, no deploy), STORE_HINT widened. Evidence: store screenshot lists the rod; local buy shows `Ya la tienes`.
- 2026-11-24 FI.2 done (4c5f4f1): `src/fishing/rules.js` (phases, reel, 10 fish, daily stars with own key, album) and `tests/fishing-rules.test.js`; `createDailyStars` takes an optional key. Evidence: 680 tests pass.
- 2026-11-24 FI.3 done (f6d7378): `src/fishing/` layer (fishing.js controller, view.js scene, layout.js maths, fish-art.js sprites, flow.js, input.js one-button hold, pond.js prompt); town prompt `A: Pescar` / `Necesitas una Caña de pescar — Almacén`; `#fishing` root reuses the arcade's frame and panels. Evidence: 689 tests pass; screenshots at 844x390 touch and 1280x720; a full catch played with real pointer events from the pond prompt to the card and back to the town.
- 2026-11-24 FI.4 done (64c570d): `sfx.js` (cues from `s.events`, fanfare by rarity, reel click) and `music.js` (calm / tense / reel phrases, priority 0 so effects cut it); `sound.playNotes` takes a priority and `sound.stop()`. Evidence: 697 tests pass; in the browser a spy saw effects (priority 1) and music (priority 0) calls through a whole catch, 41 buffer sources started, and 0 started while muted.
- 2026-11-24 FI.5 done (a9c0aee): `reward.js` (album and daily stars, per pet through `scopedStorage`, stars to the town counter via `awardTownStars`) and `album-grid.js`; Álbum from the menu, pause and card. Evidence: 703 tests pass; a real catch moved the counter 0 -> 2 with the cap message shown at 5/5 and the album saved under `city.fishing.album.dev`.

## Dev hook (development only)
- `?local=1&dev=1&rod=1` grants the fishing rod to the town's tools (the pond prompt reads it). Warp next to the pond with `cityDebug().town.debug.warp('town', 4, 35)`.
- `&fish=menu|album|play|charging|waiting|bite|reeling|caught|escaped|result` opens the layer on that moment, frozen for a picture; also `&fishid=<id>`, `&reason=early|missed|lost|snapped`, `&power=0..1`, `&seed=<n>`. `window.fishingDev` exposes `state`, `flow`, `go(name, opts)`, `card({ fish | reason })`, `album()`, `freeze(on)`.
- Night: `&hour=22`. Without Christmas: `&season=none`.

## Tuning used (FI.3 to FI.5)
- Scene: dock and pet at 15 % of the width, feet at 74 % of the height; water starts at 45 %; float lands between the rod tip + 30 and the width - 70; reeling bar at 20 %..70 % of the height, right edge; big button 5.4 rem (4.6 rem on a wide screen).
- Reward: stars per fish as in the rules table, capped at 5 a day (own key per pet); a result card appears 1.1 s after a catch and 0.8 s after an escape.
- Music: level 1 (effects level 2); calm 300 ms a step (TRI), bite 150 ms, reel 105 ms (SQ25); reel click every 0.28 s, higher pitch inside the zone.
