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
- [ ] FI.3 Fishing layer: view, menus and HUD like the arcade; "A: Pescar" at the park pond with the rod, "Necesitas una Caña — Almacén" without it; touch and keyboard.
- [ ] FI.4 Fishing sound and music.
- [ ] FI.5 Album screen and daily stars wired to the town's star counter.
- [ ] FI.6 Owner go: apply the migration and deploy the trip function.

## Progress
- 2026-11-24 Document created; EM.1, FI.1, FI.2 delegated.
- 2026-11-24 EM.1 done (2d74c3c): 24 emoji in EMOTE_TABS (Ánimo, Gestos, Cosas) plus 6 phrases, `#emote-panel` shared by the phone fan and the desktop `Más`; villagers answer new emotes through group pools. Evidence: 664 tests pass; screenshots at 844x390 touch and 1280x720; a 🐟 and ¡Gracias! shown over the pet.
- 2026-11-24 FI.1 done (0a1f5d1): `fishing_rod` (40) in client and server TOOLS, `rod` icon, migration `20261124120000_fishing_rod_tool.sql` (NOT applied, no deploy), STORE_HINT widened. Evidence: store screenshot lists the rod; local buy shows `Ya la tienes`.
- 2026-11-24 FI.2 done (4c5f4f1): `src/fishing/rules.js` (phases, reel, 10 fish, daily stars with own key, album) and `tests/fishing-rules.test.js`; `createDailyStars` takes an optional key. Evidence: 680 tests pass.
