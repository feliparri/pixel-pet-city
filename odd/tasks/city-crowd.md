# Kiosco gold and a livelier beach and farm

## Objective
Owner 2026-11-25: "deberia poder comprar con oro, y necesito mas personajes haciendo cosas en la playa, descansando, nadando, surfeando, y otros en la granja tambien haciendo otras cosas, trabajando por ejemplo".

## Decisions
- The Kiosco charges the pet's gold (the server-held currency spent at the Almacén through trip-buy / trip-buy-tool) instead of town stars. Gold is server-authoritative, so the purchase goes through the trip function like the tools do; the treat itself stays town-only (not stored on the pet, not a tool). Stars go back to earn-only.
- Prices in gold are set by the server; the client shows them. When the board cannot spend (shop closed) the Kiosco says so, like the Almacén.
- Any server change (function code, migration) is written and tested here but applied and deployed only with the owner's go (same as BE.6).
- More characters: villager NPCs on the beach that lie on loungers and towels, swim, and surf the shared waves; on the farm, NPCs that work (hoe, water, carry, feed the animals, harvest). They follow the shared deterministic clock where it matters (waves), stay on land rules except the swimmers and surfers, reuse the existing NPC and pose art, and keep phone performance.

## Constraints
- Plain ES modules, no dependencies; tests `node --test tests/*.test.js`; `node tools/stamp.mjs` after src changes.
- Phone performance must hold (HD-2D frame cache, bounded counts).
- UI copy neutral Spanish; artifacts English. Branch feat/christmas-event; commit as felipe.huerta.iturra@gmail.com, Conventional Commits, no AI attribution. Push, migrations and deploys only with the owner's go.
- TDD not configured: ordinary checks.

## Tasks
- [x] CR.1 Kiosco pays in gold: server action for a treat purchase in the trip function (price list server-side, daily sanity, gold_left back), client call and shop-state update, dev mock, menu shows gold and "Te faltan N de oro" / closed shop; stars no longer spent. Tests. Route: delegated (writer, 4+ files).
- [x] CR.2 Beach crowd: NPCs resting on loungers and towels, swimming, paddling and riding the shared waves with the surf poses. Tests and screenshots. Route: delegated (same writer).
- [x] CR.3 Farm work: NPCs working on the farm (hoeing, watering, carrying, feeding animals, harvesting) with small work animations. Tests and screenshots. Route: delegated (same writer).

- [ ] CR.4 Bonfire circle (owner 2026-11-25: "una fogata, se puede sentar? un maximo de 5 mascotas sentadas al rededor de la fogata? que puedan cocinar marshmellow y animar el fuego"): 5 seats round the beach bonfire, taken through an interaction ("A: Sentarse"), seen by peers; while seated, "Tostar malvavisco" (stick over the fire, golden then eaten, sometimes burnt) and "Avivar el fuego" (the flame grows for a while, sparks and crackle, seen and heard by everyone near). Full when 5 pets sit. Route: delegated (same writer, after CR.3).

- [ ] CR.5 Playable volleyball (owner 2026-11-25 "sip" to playing for real, against another player or a villager): a player steps onto one side of the court and takes "A: Jugar vóley"; with a peer on the other side it is a 1v1 rally, otherwise a villager joins. Timed hit (A when the ball comes down over you), score to 5, a small cheer at the end. No new screen: it plays on the beach court. Route: delegated (same writer, after CR.4).

## Progress
- 2026-11-25 Document created; CR.1-CR.3 delegated to one writer.
- 2026-11-25 CR.1 done (af76365): new server action `trip-buy-treat` (supabase/functions/trip/treats.js prices 3 to 6 gold, handlers.js, serve.ts, docs/trip-api.md), client buyTreat with one retry on 409, shopAfterBuyTreat, dev mock, menu in gold with "Te faltan N de oro" and closed shop, stars earn-only (spend removed). No migration needed (nothing is stored; only the existing trips.spent ledger moves). AWAITS THE OWNER'S GO: the Edge Function `trip` must be deployed before the Kiosco works against a real server (the dev mock works offline). Evidence: 828 tests pass; screenshots crowd-kiosk-gold.png, crowd-kiosk-short.png.
- 2026-11-25 CR.2 + CR.3 done together (ebf1de7): src/crowd.js (pure function of UTC time), props in src/art/crowd-props.js, wired in town.js and both renderers. Beach 10: 3 sunbathers (hold lounger/towel; "Ocupado" prompt for the player), 2 swimmers, 2 surfers on the clock's own wave via rideDecide, 1 stroller with an ice cream, 2 volleyball players. Farm 8: hoe x2, watering can, crate, hay, feed sack, orchard picker, sickle. Evidence: 838 tests pass; screenshots crowd-beach-*.png, crowd-farm-*.png. Perf (6x CPU, 844x390 run before: beach draw 4.6 ms, farm 6.7, town 5.8; after, a later run at 1280x738 dpr2: beach 4.8, court 4.0, farm 5.2, town 5.3 unchanged-code control), crowd logic under 0.1 ms.
- [x] CR.4 Bonfire circle (see Progress)
- [ ] CR.5 Playable volleyball on the court (see Progress)
