# City beach, swimming and surfing

## Objective
Owner 2026-11-24 asked for a new area on the left of the town: a beach where the pet can surf. It is not a separate minigame screen like fishing or the VR goggles. The pet walks into the sea and swims (the seal swims faster). With a surfboard it reaches the break and rides the waves. When the pet enters the sea, the camera zooms out to show more.

## Decisions (owner)
- The beach is a new area `beach`, like the farm. Its door is a path opened through the tree border on the left edge of the town. The town map is not widened, so every existing coordinate stays put.
- From land to sea the area runs sand, shore, shallow water, deep water, then the break. The pet walks in shallow water and swims in deep water, shown with its lower half under water and a wake. The seal swims faster than the frog and the cat.
- The surfboard is bought in the Almacén like the fishing rod (owner: "se compra"). This needs the server price list and a new migration widening the `pet_tools` check. Applying the migration and deploying the function need the owner's go. Local mode works with the mock shop and a dev flag.
- Surfing happens in the town's own step loop, not in a layer. With the board, at the break, the pet catches a wave by timing its press. The wave carries it toward the shore while it steers sideways. A miss or a fall wipes it out, and it goes back to swimming.
- Waves come from the clock, like the weather, so every player sees the same wave at the same moment. Other players are seen swimming (derived from their tile) and surfing (an optional field on `pos`, which older clients ignore).
- The camera eases out while the pet is in the water and eases back in on land.
- Ambient sound adds waves and gulls on the beach. Swimming has splash steps instead of footsteps, and surfing has its own sounds.

## Constraints
- Plain ES modules, no dependencies. Run the tests with `node --test tests/*.test.js` (740 pass at start). Run `node tools/stamp.mjs` after src changes.
- `isWalkable` is shared by movement, pathfinding and peer validation (`src/protocol.js:113`). Sea tiles must be valid for pets but excluded for NPCs, the chicken, games, hide zones and the radar.
- In HD-2D, `waterRects` (`src/hd2d/scene.js:61-63`) is one bounding box. Make it per region or per rows so the sea does not re-bake land. Phone performance must hold.
- The flat renderer needs the same poses (`src/render.js:147`). Pet frame cache keys (`src/hd2d/pets.js:78`) must include any new pose.
- UI copy is in neutral Spanish; artifacts are in English. Work on branch feat/christmas-event. Commit as felipe.huerta.iturra@gmail.com with Conventional Commits and no AI attribution. Push, migrations and deploys only with the owner's go.
- TDD is not configured, so run the ordinary checks.

## Tasks
- [x] BE.1 Beach area: map (sand, shore, shallow, deep, break, a few props such as umbrellas, a lifeguard post and rocks), door from the town's left edge and back, HD-2D and flat art, animated sea without a land re-bake, walkability rules for pets only, peer validation, and ambient waves and gulls. Route: delegated (one writer for the feature).
- [x] BE.2 Swimming: pose with the lower half submerged and a wake, no ground shadow, splash steps, faster seal (peer pacing checked), peers' swim pose derived from their tile. Route: delegated.
- [x] BE.3 Camera: eased zoom-out in the water, consistent through cameraFor, followFocus and showCamera; the flat view keeps working. Route: delegated.
- [x] BE.4 Surfboard tool: client and server TOOLS, a board icon, a migration file (not applied), the mock shop, a dev `?dev=1&board=1`, and the store hint. Route: delegated.
- [x] BE.5 Surfing: clock-driven waves at the break, catch timing, ride and steer, wipeout, the board drawn under the pet, peers see surfing, sounds. Route: delegated.
- [x] BE.7 Owner 2026-11-24 feedback after the first look: (a) with the board owned, the pet is on the board as soon as it enters the water (paddling, drawn on the board), no separate step; (b) the wave travels from the bottom of the screen toward the top along a diagonal front (peeling), and the rider rides along it; (c) beach loungers the pet can lie on ("A: Recostarse", a lying pose, any move gets up), peers see it; (d) taller palms; (e) bigger umbrellas. Route: delegated.
- [x] BE.8 Owner 2026-11-24 "el agua necesita el reflejo del show y las estrellas": the sea (and the town/farm ponds if cheap) reflects the night sky stars and the shows (fireworks, meteors and the other kinds), shimmering with the waves; cheap on the phone (cached, quantised, drawn only over water rows in view). Route: delegated.
- [x] BE.9 Owner 2026-11-25 "la ola debería verse con más volumen y los accesorios de playa con más detalles": the wave reads as a raised body of water (face shading, a lit lip, a shadowed trough in front, a curling lip where it breaks, spray), not a flat foam line; richer beach props (umbrellas, loungers, towels, lifeguard posts, palms, rocks, signs) with shading, texture and small details (shells, starfish, sandcastle, buckets, footprints). Cheap on the phone. Route: delegated.
- [x] BE.10 Owner 2026-11-25 "sip mejora la ola, y en las toallas en el suelo también debería poder descansar, pero que no sea automático, que deba interactuar para acostarse": (a) a much taller and wider wave that reads as a wall of water; (b) towels are resting spots too; (c) lying down needs the interaction ("A: Recostarse") on loungers and towels, standing still no longer lies the pet down, any move gets up; peers see it through an explicit state (optional pos field) instead of the tile. Route: delegated.
- [ ] BE.6 Owner go: apply the migrations (rod and board) and deploy the trip function.

## Progress
- 2026-11-24 Document created after a read-only map of areas, movement, water, camera, protocol, tools and sprites; BE.1-BE.5 delegated to one writer.
- 2026-11-24 BE.1 done (1319be6): `beach` area 48x36 (sea west, land east, door at town (0,29)/(0,30)), `isLand` vs `isWalkable`, row-wise water baking, sea bed and gulls. Evidence: 749 tests pass, screenshots `.playwright-mcp/beach-*.png`.
- 2026-11-24 BE.2 done (ec62c24): swimming pose and wake, `Walker.tileMult` pace by tile and species (seal 0.75x, frog and cat 1.25x), splash and swim steps. 755 tests pass.
- 2026-11-24 BE.3 done (b0164db): eased zoom (`SWIM_OUT` 0.25) through cameraFor, followFocus and showCamera; flat view keeps its scale. 758 tests pass.
- 2026-11-24 BE.4 done (3043e61): `surfboard` (60) in both price lists, `board` icon, migration `20261124130000_surfboard_tool.sql` (NOT applied), `?dev=1&board=1`. 759 tests pass.
- 2026-11-24 BE.5 done (989c706): `src/surf.js` (waves from the clock, catch, ride, wipeout), optional `surf` field on `pos`, sounds. 773 tests pass. Not verified: a second client seeing a ride, real audio, a real phone.
- 2026-11-24 BE.7 done (57f383a): board paddling in the water (`surf` flag 3), a diagonal peeling wave (`y = k + x`, climbing at 8 rows/s, `src/surf.js`), loungers (`src/lounge.js`, lying derived from the tile; a pet on one lies flat as the device's sleeping pet (ported from pixel-pet/common/ui_goal.c and ui_main.c, art/zzz.txt; fix d60d2e3), palms 1.8x and umbrellas 1.5x. 788 tests pass after the fix.
- 2026-11-24 BE.8 done (6a5321d): `src/hd2d/reflect.js` mirrors the stars and the show layers into the water through a half-size offscreen canvas, masked by the water tiles, blitted in wobbling strips; `?perf=1&skip=reflejo`. 784 tests pass.
- 2026-11-25 BE.9 done (07333d0): `src/hd2d/wave.js` draws the clock wave as a raised wall (dark trough, three-band face lifted by its height, lit lip, curl and spray at the peel, foam sheet and whitewater behind), flat view simpler; props redrawn with shading and texture, scatter in `SCATTER` (shells, starfish, sandcastle, bucket, ball, seaweed, footprints). 790 tests pass; perf at 6x before/after: day 2.6 to 2.5 ms, night 4.8 to 4.3 ms.
- 2026-11-25 BE.10 done (974ce1b): wave wall 4.5x lifted with a dark base to light top, thick lip, overhanging lip over a dark barrel, more spray and whitewater, darker trough, rider raised 12 art px; towels and loungers are resting spots, lying is a choice (`A` Recostarse / Levantarse, any move gets up) synced with the optional `rest: 1` field on pos. 793 tests pass. Screenshots `.playwright-mcp/beach-wave-*-before.png` vs `beach-wave-*volume.png`, `beach-towel-prompt.png`, `beach-towel-lying.png`, `beach-lounger-standing.png`.
