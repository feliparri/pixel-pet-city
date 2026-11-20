# Christmas event in the town

## Objective
Owner 2026-11-20: more to do in the town while Christmas comes, and fixes to the shows.

## Design (owner approved 2026-11-20)
- **Fix: one Santa.** The Christmas show draws more than one Santa at the same time; only one may be on screen.
- **Show length set by the owner.** The admin page schedules a show as a time range (start and end date/time), any length, 120 min or more allowed. A show longer than its kind's base length keeps playing (loops/continues) until the end of the range.
- **Event mode button.** The town screen gets a button to leave or enter the event mode (the sky view of a running show), so a player can keep playing during a long show and come back to it.
- **1. More firework shapes:** star, Christmas tree, snowflake, gift, double heart.
- **2. Automatic shows:** Nochebuena (Dec 25 00:00) and New Year (Jan 1 00:00) Chile time, without the owner scheduling them.
- **3. Snow** falling in the town in December, stronger at night.
- **4. Santa walks by:** from time to time Santa crosses the plaza and leaves special gifts on his path, worth more than the hidden ones, that disappear after a few minutes.
- **Gold:** every gift (hidden and Santa's) pays 10 to 30 gold. The daily gift cap (20) would block that; it is raised to 150 (assumption, owner may change it).
- **More gifts and clothing:** new gift kinds and new clothing. Art follows the owner rule: no freehand art; ask the owner for a drawing or reference first.

## Constraints
- Repo pixel-pet-city, branch feat/christmas-event. Plain ES modules; tests `node --test tests/*.test.js`; `node tools/stamp.mjs` before committing. Both renderers (2D canvas and HD-2D) must get new visuals.
- Client and edge-function mirrors stay equal (tests keep them so). Server changes (edge function `trip`, migrations) are deployed only with the owner's go.
- Artifacts in English, UI copy in neutral Spanish. Commit as felipe.huerta.iturra@gmail.com, Conventional Commits, no AI attribution.
- TDD not configured; ordinary checks.

## Tasks
- [x] CE.1 Shows: one Santa; owner-chosen ranges in admin (any length, >= 120 min), long shows continue to the end; event mode button in the town; new firework shapes; automatic Nochebuena and New Year shows.
- [x] CE.2 Town: snow in December; Santa walking by and dropping special gifts; gift gold 10-30 and the daily cap 150 (client and server).
- [ ] CE.3 Deploy (owner's go): edge function and migrations; publish the town.
- [ ] CE.4 More gifts and clothing: waits for the owner's references.

## Progress
- Created 2026-11-20. Route: CE.1 and CE.2 delegated direct (writer trigger: many non-trivial files across src/, supabase/, tests/).
- CE.1 done 2026-11-20 (delegated writer). Santa bug: sleigh passes lasted 9-11 s but started 5.8 s apart, so 2 (sometimes 3) sleighs overlapped; passes are now 6.4-7.0 s, 7.8 s apart, never overlapping (3 per default show). Shows may last 20 s to 24 h (admin schedules a start/end range; longer than 10 min plays in 5 min chunks with a derived seed, the finale only in the last 5 min). Event-mode button: "Volver al pueblo" / "Ver show" (hd renderer only). New firework shapes: star, tree, snowflake, gift, heart2 (about a third of the bursts; the finale shows all but one). Auto shows: Dec 25 (christmas) and Jan 1 (fireworks) 00:00 Chile, 10 min. Migration 20261120120000_town_events_duration_24h.sql (not applied). Checks: node --test tests/*.test.js, tools/stamp.mjs, headless previews.
- CE.2 done 2026-11-20 (delegated writer). Snow (src/snow.js): christmas season on and Chile month = December, 75 flakes by day up to 150 at night, both renderers. Santa (src/santa.js, src/art/santa.js): one walk per 40 min walk slot per room (start in the first 28 min, mean gap 40 min, 12 to 68), 60 s along row 23 of the plaza, 5 gifts `santa:<walk slot>:<n>` that last 5 min; extra server check in gifts.js/handlers.js (mirror tests). Gold: hidden 10-30, Santa 20-30, daily cap 150 (no migration: at most 16 ids/day fit the existing jsonb check of 20). Not deployed: edge function trip needs deploying (client and server must go together).
