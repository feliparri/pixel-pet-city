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
- [ ] CP.4 Tilt: owner asked for it "un poco más arriba"; waiting on whether it means the camera angle or the tilt-shift band.
- [ ] CP.5 Ground in fewer draws and a sprite atlas, if the phone still falls after CP.2 and CP.3.

## Progress
- 2026-11-23 CP.1 done (see Evidence).
- 2026-11-23 CP.2 done (commit: 'fix(hd2d): do not count area changes ...', hash not recorded in-file, see git log): governor reset on area change, farm built in idle time after 90 town frames, saved level stored as {l,t} and ignored after 3 days (old plain number = expired), flat needs two slow windows at the last level. Checks: stamp, node --test 642 pass 0 fail.
- 2026-11-23 CP.3 done (commit 'perf(hd2d): cheaper effects ...', see git log): haze+vignette in one cached overlay (16 night steps), bloom only above night 0.3 (fades in to 0.45, formula unchanged above), tilt-shift blurred and masked at half size with only the top and bottom bands drawn. Chrome no GPU, CPU 4x, level 0: day 43 -> 60 fps (effects 17.1 -> 8.7 ms), night 30 -> 36 fps. Checks: stamp, node --test pass.
