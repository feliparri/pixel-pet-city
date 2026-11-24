# City HUD on phones

## Objective
Owner 2026-11-24: the interface covers too much of the top and bottom of the town on the phone. On a landscape phone (about 390 css px tall) the top bar takes about 45 px and the emotes row about 60, and the camera keeps the pet clear of both.

## Scope (accepted by the owner)
- No bands: the top buttons float over the town in the corners, smaller and translucent (link and stars top left; scroll, bag, sound, exit top right).
- Emotes and phrases collapse into one 💬 button near the A/B pad; a tap opens the fan of emotes and phrases, which closes after a choice (or a tap outside).
- The camera no longer reserves the old bands (insets shrink to what the corner buttons really cover).
- Desktop keeps working; the change targets touch/phone layouts (the desktop can share it if it reads well).

## Constraints
- Plain ES modules, no dependencies; tests `node --test tests/*.test.js`; `node tools/stamp.mjs` after src changes.
- UI copy neutral Spanish; artifacts English. Keep accessibility labels. Branch feat/christmas-event; commit as felipe.huerta.iturra@gmail.com, Conventional Commits, no AI attribution. Push only with the owner's go.
- TDD not configured: ordinary checks.

## Tasks
- [x] HUD.1 Floating corner buttons, emotes behind one 💬 button, insets updated. Route: delegated (index.html, style.css, src/main.js, emotes UI, town insets).

## Progress
- 2026-11-24 Document created; HUD.1 delegated.
- 2026-11-24 HUD.1 done in acae68d: bar is transparent with 32px translucent buttons (link+stars left, rest right), emotes/phrases behind a 💬 button by A/B on touch landscape (closes on choice, outside tap, Escape), insets top 0 / bottom only for the desktop row (was ~34-45 / ~58). 663 tests pass; screenshots .playwright-mcp/hud-*.png.
