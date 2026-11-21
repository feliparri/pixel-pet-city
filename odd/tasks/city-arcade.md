# City arcade and gift wearables

## Objective
Owner 2026-11-21. Three new wearables found in Santa's gifts (elf hat, headphones, VR goggles) that travel home to the board and the phone app. Wearing the VR goggles in the city unlocks an arcade: a separate full-screen game screen with its own menu, game selection, score and sounds, holding two distinct games. The city gets sound.

## Design (owner, 2026-11-21)
- **Wearables, faithful to the owner's references** (session images 12 elf hat, 13 headphones, 14 VR goggles). Elf hat and headphones are clean pixel art: replicate pixel by pixel at pet scale. VR goggles: reduced version (the board already has face glasses, acc_lens/acc_bridge), shown to the owner before shipping.
- **Headphones animate** with small music notes, on the board, the app and the city.
- **Obtained in the shop (expensive) or, rarely, from Santa's gifts.** Owner: VR goggles about 1000-1500. Defaults: vr_goggles 1500, headphones 600, elf_hat 400 (adjustable). They come home like a bought item and the board/app can wear them. Needs an OTA release (the board must know the items).
- **Arcade.** In the city, a pet wearing the VR goggles gets a "Jugar" button. It switches to a game-only screen: title/menu, game selection, score and best score, sounds, a way back to the town.
- **Two different games, different physics.** (1) Rail cart dodging trains across lanes. (2) Skateboard run with jumps. Original games and art in the spirit of the owner's references; never a copy of an existing game's characters, art or screens.
- **Sound.** Port the board's 8-bit synth (pixel-pet common/sfx.c) to Web Audio; mute toggle; audio starts after the first tap (browser rule).

## Constraints
- Repos: pixel-pet (branch feat/m1-core) for items; pixel-pet-city (branch feat/christmas-event) for city, server, arcade.
- Art: don't freehand-design; replicate the owner's references; ask for references for trains, cart, skateboard and obstacles.
- UI copy neutral Spanish, artifacts English. Commit as felipe.huerta.iturra@gmail.com, Conventional Commits, no AI attribution.
- Push, release, OTA, migrations and deploys only with the owner's go.
- TDD not configured. Checks: pixel-pet make test (known failure tests/test_make_manifest.py), golden-check, sim-regress, android host test; city `node --test tests/*.test.js`.

## Tasks
- [ ] AR.1 Wearables in pixel-pet: elf_hat, headphones (with music-note animation), vr_goggles (reduced) for all playable species/stages; board, app, sim; export to the city catalogue (assets/sprites.json, parts.png). Route: delegated (several non-trivial files, two repos).
- [x] AR.2 Santa's gifts can hold one of the three items (server trip-gift + client + mock), item comes home in the return package. Route: delegated.
- [x] AR.3 City sound engine (Web Audio port of sfx.c), mute toggle, town cues.
- [x] AR.4 Arcade screen: "Jugar" when wearing VR goggles, menu, game select, score/best, back to town.
- [x] AR.5 Game 1: rail cart dodging trains (lanes). Needs art references.
- [ ] AR.6 Game 2: skateboard run with jump physics. Needs art references.
- [ ] AR.7 Release/deploy with the owner's go: pixel-pet OTA, city migration/edge function/site.

## Progress
- 2026-11-21 created. Mapping done (city has no audio; wearables come from pixel-pet export; gifts pay gold only; existing games are multiplayer in src/games/).
- 2026-11-21 AR.1 (delegated writer): pixel-pet e86cae2, city 3ed38d4. elf_hat 27x21 (head, 400), headphones 36x23 with AT_NOTES music-note anim 12x150ms (head, 600), vr_goggles 32x23 (face, 1500); ids 17-19, ITEM_COUNT 20, needs id+1 gate for old boards. Checks: make test 98/99 (known manifest), golden 426 after update (9 shop scenes), sim-regress refreshed 6 shop CRCs, android 24/24, strict C11 ok, city 552/552 (parent re-ran). Firmware build not run (no idf.py). Open: VR goggles look bulky (3/4 view sits right of the face); owner to judge. Previews scratchpad/ar1/wearables_*.png.
- 2026-11-21 AR.1 fix (owner feedback: headphones too low, VR pasted on): pixel-pet 1731706, city 03aeaf5. Headphones band hugs head top, cups at ear height; VR goggles redrawn front-on 30x11 by owner authorization (opaque dark visor). Checks: make test known-only, golden 426, sim 28, android 24/24, city 552/552.
- 2026-11-21 AR.1 notes fix (owner: notes not visible): pixel-pet 1efdb7b, city c6deba5. Two 6x8 outlined eighth notes, pink/cyan, float ~10 px over 1.7 s, half-cycle apart. Checks: make test known-only, golden 426, sim 28, android 24/24, city 552/552.
- 2026-11-21 Owner reference for both games: session image 17 (portrait, camera behind the pet, pseudo-3D lane perspective; skate: night city promenade with lamps, river, planters, cones, coins; train: rail track, oncoming train, signal, station, poles; HUD lives as pet faces top-left, score top-right, left/right arrows). Owner: "tómalo como ejemplo pero con nuestros personajes" = design our own art in that style with our pets (back-view sprites needed). No numbered 4/6 keypad cues (keep plain arrows). Train game keeps the cart the owner asked for earlier.
- 2026-11-21 AR.2 (delegated writer): a Santa gift (`santa:` ids only) holds an item with chance 1/20 (hash of `<id>:item`); item = first of [elf_hat, headphones, vr_goggles] ordered by hash of `<id>:<key>` that the pet does not own, is not in trip.bought and the board knows, else gold. Server trip-gift appends to trip.bought (no gold, outside the daily cap, id still spent in the ledger; reply `item`, gold 0); client giftOutcome says "¡Santa te dejó <nombre>!", shopAfterGift counts it as bought; mock mirrors. No migration. Commit 3f8f76b. Checks: city node --test 559/559 (552 + 7 new in tests/trip-santa-item.test.js).
- 2026-11-21 AR.3 (delegated writer): src/sound.js ports sfx.c (all 20 cues, 16 kHz integer synth with BigInt phase steps; samples verified bit-identical to the C synth compiled on the host, fingerprints kept in tests/sound.test.js), rendered once to AudioBuffers; createSound player (context made/resumed on the first gesture, one voice, call > feedback > tap priority, play/playNotes/setMuted/isMuted/toggle/unlock/onChange; no-op without Web Audio), createMuteStore (localStorage key city.sound.muted, guarded). Town: mute button #sound-toggle in the bar (aria-label Silenciar / Activar sonido), quiet TAP on every button, COIN for gold gifts, WIN for a Santa item gift, BUY on shop and tool purchases, WIN/LOSE when a game's results appear for a player. Checks: city node --test 566/566 (559 + 7 new in tests/sound.test.js). Not verified in a real browser (no audio device here); owner to listen.
- 2026-11-21 Owner decision: no notice on the board/app when a Santa item comes home ("mejor que sea sorpresa"); the item just appears in the wardrobe. Only the city shows "¡Santa te dejó …!" at the moment of opening.
- 2026-11-21 AR.4 + AR.5 (delegated writer): AR.4 engine commit 4889ae9 (src/arcade loop, lanes, input, scores, flow, hud, back-art generated by tools/make-back-sprites.mjs); AR.5 commit follows it with the train game, art, view, arcade controller, town glue (town.suspend/look, "Jugar" #arcade-open, #arcade layer, style.css) and tests. Flow: Jugar (VR goggles worn) -> Arcade title -> game cards (Tren; Patineta "Pronto") -> run -> pause / game over (score, best, Otra vez, Menu, Volver a la ciudad). Train: seeded spawner, bot-verified fairness (40 seeds x 120 s, 0 hits), speed 34 -> 84 u/s, 3 lives, 1 star per run over 250 points, max 3 a day, local. Back-view art is per species and stage (elder = adult palette); the cart hides the lower body. Previews: scratchpad/arcade/*.png (390x844 mobile emulation). Checks: node --test tests/*.test.js 593/593. Not verified: audio by ear, real touch swipes, skate (AR.6) card is a placeholder.
