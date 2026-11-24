# City WebGL renderer

## Objective
Owner 2026-11-24: find a new way to draw the city that performs better. Chosen: draw the HD-2D town with WebGL (sprites batched from shared textures, night and lamp light on the GPU), proven first by a small prototype measured on the owner's phone.

## Why
The HD-2D view is canvas 2D: about 390 drawImage per frame from about 129 source canvases (ground in 119 strips), plus full-screen effect passes. The frame cache (city-perf CP.5) removed the CPU cost of the moving things; the remaining model is still many small draws. WebGL turns them into a few batched draws and moves the grading into shaders.

## Scope
- Prototype first (GL.1): ground and sprites of the town through WebGL behind `?gl=1`, everything else unchanged, measured with `?perf=1`.
- Only after the owner sees the phone numbers: night and lights in shaders, effects, farm and shows, then making it the default with canvas 2D kept as fallback.

## Constraints
- Plain ES modules, no build step, no new dependencies; tests `node --test tests/*.test.js`; `node tools/stamp.mjs` after src changes.
- Branch feat/christmas-event; commit as felipe.huerta.iturra@gmail.com, Conventional Commits, no AI attribution.
- The default view (no `?gl=1`) must look and behave exactly as now. Since 397d549 the view never falls back to flat on slow frames; a crash still does.
- UI copy neutral Spanish; artifacts English. Push and publish only with the owner's go.
- TDD not configured: ordinary checks.

## Tasks
- [x] GL.1 Prototype: `?gl=1` draws the town's ground and sprites through WebGL (textures from the existing canvases, batched quads); labels and effects stay as they are. Perf box says the renderer in use. Route: delegated (renderer.js, scene.js, new src/hd2d/gl*.js, tests).
- [ ] GL.2 Night grade and lamp light in the shader (no graded copies).
- [ ] GL.3 Effects (haze, vignette, bloom, tilt-shift) in shaders.
- [ ] GL.4 Farm and shows.
- [ ] GL.5 WebGL by default, canvas 2D as fallback when WebGL is missing or fails.

## Progress
- 2026-11-24 Document created; GL.1 delegated.
- 2026-11-24 GL.1 done: `?gl=1` draws the ground (119 row strips, one draw) and the sprites (about 600-700 quads, 120-140 draws, one per change of source canvas) through WebGL on an offscreen canvas that is laid over the 2D canvas before the effects; new src/hd2d/gl.js (GL layer, texture per source canvas, WeakMap + FinalizationRegistry) and glquads.js (pure: quad batch and recording context). Items with fills, gradients, additive blend or a volatile scratch canvas (fountain jet, entrance effects, show-washed pets) are drawn on 2D in order. Perf box shows `WebGL` plus quads/draws/uploads. Checks: stamp, node --test 659 pass (11 new). Headless Chrome, SwiftShader (no GPU, numbers not representative), 900x600 level 0, 6x CPU: day draw 2.4 -> 1.1 ms (ground 0.6 -> 0.2, items 0.4 -> 0.8), night 3.9 -> 2.1 ms; 60 fps both. Phone numbers still to take.
