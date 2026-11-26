# Quieter rain and better town music

## Objective
Owner 2026-11-26: "el sonido de lluvia está muy fuerte, bajale un poco, y lo otro, dedicate a mejorar la musica, manten el estilo 8 bit pero haz mejoras significativas".

## Decisions
- Rain bed gain lowered (about half, -6 dB); thunder and other ambience unchanged.
- Music stays 8-bit (square/triangle/noise chip voices from the game's own synth), no samples, no dependencies. Significant improvement means: real song structure (intro, A, B, bridge, variations instead of one short loop), chord progressions with bass, arpeggio and lead, a noise-channel drum part, swing/dynamics, distinct day, night, rain and beach/farm moods, and smooth transitions between them.
- Keeps every existing rule: respects the sound switch, silent under the arcade and fishing layers, on hidden tab and suspend.

## Constraints
- Plain ES modules, no dependencies; tests `node --test tests/*.test.js`; `node tools/stamp.mjs` after src changes.
- Phone performance: schedule notes ahead in small batches, bounded oscillator count, no per-frame allocation storms.
- UI copy neutral Spanish; artifacts English. Branch feat/christmas-event; Conventional Commits, no AI attribution. Push and publish only with the owner's go.
- TDD not configured: ordinary checks.

## Tasks
- [x] MU.1 (a05b258) Rain bed quieter (GAIN.rain in src/ambience.js) plus a test pinning the lower level. Route: delegated (same writer as MU.2).
- [x] MU.2 (5d58649) Town music rewrite: song structure, chords, bass, arpeggios, lead, noise drums, mood variants (day, night, rain, beach, farm), crossfades. Tests for the pure song data and scheduler. Route: delegated (one writer, several files: city-music.js, maybe sound.js, tests).

## Progress
- 2026-11-26 Document created.
- 2026-11-26 MU.1 done (GAIN.rain 0.28 -> 0.14, a05b258): 867 passed (a footsteps test compared against the rain bed; it now compares against one-shot sounds only).
- 2026-11-26 MU.2 done: src/city-song.js (pure 40-bar song, 5 moods, 12-cycle variation), src/city-music.js (Web Audio lookahead scheduler), sound.audio(); 876 passed, 0 failed; stamp current.
