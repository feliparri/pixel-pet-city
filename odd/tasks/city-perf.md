# City HD-2D performance

## Objective
Owner 2026-11-23: the town is heavy on the phone and falls back to the flat view. Make HD-2D hold on the owner's phone and stop unfair fallbacks.

## Evidence
- Owner's phone (landscape, canvas 640x242 at level 4): HD-2D level 4 at 26-28 fps falls to flat; flat runs about 60 fps. It first fell when entering the farm.
- Desktop, CPU throttled 6x: HD-2D JavaScript draw time about 3 ms, so the cost is in rasterising, not in the code.
- Per frame at level 4: HD-2D 389 drawImage, 129 distinct source canvases, 119 strips from the 768x1184 ground; flat 123 drawImage, 31 sources.
- Chrome without GPU, CPU 4x, level 0: 33 fps; without effects 60 fps (stays at level 0); without ground 48; without labels 43; without sprites 35. Level 4: 60 fps in every case (this setup does not reproduce the phone's level-4 slowness).

## Scope
- Governor: an area change does not count against the view; the farm is prepared before the pet walks in; a saved low level does not stick forever; one hitch at the last level does not drop to flat.
- Effects: same look, far fewer full-screen passes.
- Later, measured on the phone first: the ground in fewer draws (WebGL layer or bands), the sprites in one atlas.

## Constraints
- Plain ES modules; tests `node --test tests/*.test.js`; run `node tools/stamp.mjs` after src changes.
- Branch feat/christmas-event; commit as felipe.huerta.iturra@gmail.com, Conventional Commits, no AI attribution.
- UI copy neutral Spanish; artifacts English. Push and publish only with the owner's go.
- TDD not configured.

## Tasks
- [x] CP.1 Measuring: ?perf=1 box and ?perf=1&skip= switches. Route: inline. Commits e50d91d, 3720816.
- [x] CP.2 Governor: reset on area change, farm prebuilt when idle, saved level expires, flat needs two slow windows in a row at the last level. Route: delegated (quality.js, renderer.js, town.js, tests).
- [x] CP.3 Cheaper effects: haze and vignette in one cached overlay, bloom only at night and during shows, lighter tilt-shift. Route: delegated with CP.2 (fx.js, tests, before/after shots).
- [x] CP.4 Tilt: owner 2026-11-24 "mejora el tilt, necesito que se vea más arriba ... ver si cambiando el tilt se estropea [el show]": the camera looks from higher up (steeper pitch); shows must still frame well. Route: delegated with CP.7-CP.8.
- [x] CP.6 Phone log: ?perf=1&log=1 posts the numbers to tools/perf-serve.mjs. Route: inline. Commit ce26aee.
- [x] CP.5 Moving things cached (replaces "ground in fewer draws"; the phone log shows the ground costs 1 ms): pets, villagers, birds, ducks, farm animals and the chicken are repainted and night-graded into a scratch canvas every frame. Cache each painted frame by its look and pose, and its night grade by quantised night and light, like nightSprite does for standing things; the soft shadow as one cached sprite instead of three arcs per thing per frame. Route: delegated (things.js, pets.js, scene.js, tests).
- [x] CP.7 Never flat outdoors: an HD-2D draw error skips that frame and is reported in the perf box instead of switching to flat for good; remove the "Efectos" (✨) button and ignore a stored off preference; guard decorItems against a decoration without a sprite (scene.js:292 crash). Interiors keep the flat renderer by design. Evidence: phone log 2026-11-24 17:40 shows flat without "caída automática" (crash path), back to HD after the button, then flat again. Route: delegated.
- [x] CP.8 Show test button (dev only, ?dev=1): starts a local show in a few seconds, cycling the kinds, to check the shows with the new tilt on the phone. Route: delegated.

## Progress
- 2026-11-23 CP.1 done (see Evidence).
- 2026-11-23 CP.2 done (commit 05dab0f): governor reset on area change, farm built in idle time after 90 town frames, saved level stored as {l,t} and ignored after 3 days (old plain number = expired), flat needs two slow windows at the last level. Checks: stamp, node --test 642 pass 0 fail.
- 2026-11-23 CP.3 done (commit effe3d5): haze+vignette in one cached overlay (16 night steps), bloom only above night 0.3 (fades in to 0.45, formula unchanged above), tilt-shift blurred and masked at half size with only the top and bottom bands drawn. Chrome no GPU, CPU 4x, level 0: day 43 -> 60 fps (effects 17.1 -> 8.7 ms), night 30 -> 36 fps. Checks: stamp, node --test pass.
- 2026-11-23 Parent check: tests 642/642; night before/after shots match; town -> farm -> town in the browser stays at level 0, 60 fps, no errors.
- 2026-11-23 Phone log (Android 10, Chrome 157, canvas 640x242 at level 4, night): fell to flat after 8 s at 24 fps; per frame ground 1.0 ms, effects 0.1, labels 0.4, sprites ("cosas") 25 ms. The cost is CPU in the moving things. Desktop profile at CPU 6x: things.js stand draw 22% and grade 13.5% of all time, pets.js draw 8%; grade runs per thing per frame.
- 2026-11-23 CP.5 done: new src/hd2d/framecache.js (LRU-bounded cache of painted frames, night grade cached by night*12 and light*8 steps, daytime uses the plain frame, one pre-rendered soft shadow sprite per style and radius). things.js keys chicken, ball, birds, duck and farm animals by kind, frame, flip, hop and air; pets.js keys by sprite set, look, frame, flip, flap, hop and the animated accessory's current art; the show's wash tint and entrance effects stay uncached. Chrome no GPU, CPU 6x, level 4, skip=efectos, "cosas": day town 3.9 -> 1.3 ms, day farm 7.6 -> 1.7, night town 6.4 -> 2.9, night farm 15.4 -> 2.9 (53.7 -> 60 fps). Checks: stamp, node --test 648 pass 0 fail (5 new in tests/framecache.test.js); day and night shots of town and farm compared by eye.
- 2026-11-24 Phone check of CP.5 (same phone, level 4, about 1 min with town and farm): stayed in HD-2D, no automatic fallback; sprites ("cosas") 25 -> 1.2-3.3 ms, ground 0.4-1.4 ms; 45-86 fps after the first seconds of loading. Next: let the governor climb above level 4 and re-measure; CP.4 tilt still waiting on the owner.
- 2026-11-24 CP.7 done (commit ff0db97): an HD-2D frame that throws is skipped, counted and shown in the perf box ("errores N: msg"), flat only after 120 bad frames in a row; "Efectos" button, its preference and the autoFlat notice removed. Cause of the missing sprite: a gift's sparkle burst read frame -1 when the frame clock (rAF) was a hair behind the click time (performance.now); clamped, and decorItems skips a decoration without a sprite. Checks: stamp, node --test 662 pass; forced 40 draw errors in Chrome: stayed HD-2D, box showed "errores 40: forced test error".
- 2026-11-24 CP.4 done (commit 7db7b8a): base pitch 40 -> 49 degrees (cameraFor in src/hd2d/camera.js); shows still frame the sky (they blend to their own sky pitch). Shots in ../.playwright-mcp/cp4-{before,after}-{day,night}-{town,farm}.png at 844x390.
- 2026-11-24 CP.8 done (commit 4e343b1): ?dev=1 button "Probar show: <next kind>" (top left) starts a local show in 3 s via events.injectDev, cycling the five kinds. Shots cp8-fireworks-{10s,25s}-844x390.png and cp8-meteors-10s-1280x720.png; absent without dev=1. node --test 663 pass.
