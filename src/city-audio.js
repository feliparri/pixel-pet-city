// The town's whole soundtrack in one object: the music (src/city-music.js) and the ambient sound (src/ambience.js) over the page's player (src/sound.js). The town calls
// step(ms, info) every frame it is awake and silence() when something else takes the sound (the arcade, the fishing layer, a hidden tab, the town closing). Both stay quiet
// while the player is muted or its context is not running yet (no gesture), and neither creates the context itself.
import { createCityMusic } from './city-music.js';
import { moodFor } from './city-song.js';
import { createAmbience } from './ambience.js';

/** info = { area, outdoor, night, weather, x, y, utcMs } (see createAmbience). */
export function createCityAudio({ sound, rand = Math.random }) {
  const music = createCityMusic({ sound });
  const ambience = createAmbience({ sound, rand });
  return {
    step(ms, info) {
      const on = sound.running() && !sound.isMuted();
      music.step(ms, on ? moodFor(info.night, info.weather, info.area) : null);
      ambience.step(ms, info);
    },
    /** Everything stops now (the music's voice, the beds) and the schedules start over. */
    silence() { music.reset(); ambience.silence(); try { sound.stop(); } catch { /* optional */ } },
  };
}
