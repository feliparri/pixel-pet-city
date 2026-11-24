# City music, ambient sound and weather

## Objective
Owner 2026-11-24: "falta musica en la ciudad y sonidos de ambiente, la hora está bien, la ubicacion cambiemosla por distintos climas". The town gets its own music and ambient sound. Instead of weather taken from the player's location, the town cycles through varied weather.

## Decisions
- Time of day stays as now (the device's local clock, `src/daynight.js`).
- No location and no weather API. The weather is computed from the UTC clock with a fixed seed, so every player in the shared town sees the same weather at the same moment, with no server and no network.
- Weather kinds: clear, cloudy, rain, storm (rain plus lightning and thunder), fog; snow only in the Christmas season (reuse `src/snow.js`). A spell lasts some tens of minutes, and changes fade in and out. Clear and cloudy are the most frequent.
- Music: a calm town loop from the game's own synth (`src/sound.js`), with a different feel by day and at night and a softer one in rain. It respects the town's sound switch and stops while the arcade or fishing layer plays its own music.
- Ambient sound: soft and low, by area and moment: birds by day, crickets at night, water near the fountain and pond, rain and thunder with the weather, farm animals on the farm.

## Constraints
- Plain ES modules, no dependencies; tests `node --test tests/*.test.js`; `node tools/stamp.mjs` after src changes.
- Phone performance must hold (HD-2D canvas 2D with the frame cache, CP.5). Weather effects must be cheap: cached layers, bounded particle counts, no new per-thing grading pass.
- UI copy neutral Spanish; artifacts English. Branch feat/christmas-event; commit as felipe.huerta.iturra@gmail.com, Conventional Commits, no AI attribution. Push and publish only with the owner's go.
- TDD not configured: ordinary checks.

## Tasks
- [x] WX.1 Weather rules (pure): kind and intensity from UTC time and a fixed seed, fades between spells, snow only in the Christmas season; dev `?weather=<kind>`. Tests. Route: delegated (one writer for the feature, 4+ files). Done 5ad5104: src/weather.js (30 min slots, spells of 1-2 slots, 8 min fades, lightning strikes, dev override), 10 tests, full suite 713 pass.
- [x] WX.2 Weather on screen: rain streaks and splashes, cloud dimming, fog, lightning flash, in HD-2D and flat, with the existing snow folded in. The fishing scene shows the weather too. Screenshots at 844x390 and the perf box checked. Route: delegated. Done 90e59e3: src/weather-fx.js (one-stroke rain, bounded splashes, cached cloud and fog in the fx overlay, flash), snow folded in (?dev=1&snow=1 = weather snow), flat and fishing views, life shelters in rain. Screenshots ../.playwright-mcp/wx-*.png. Perf 6x CPU, night: clear dibujo 4.5 ms, rain 5.1, storm 5.0, rain with skip=clima 4.7; no throttle 1.9 vs 1.8 vs 2.1. 720 tests pass.
- [ ] AM.1 City music: day, night and rain variants, sound switch respected, silent under the arcade and fishing layers. Route: delegated.
- [ ] AM.2 Ambient sound: birds, crickets, water, rain and thunder, farm animals, by area and moment. Route: delegated.

## Progress
- 2026-11-24 Document created; WX.1, WX.2, AM.1, AM.2 delegated to one writer.
