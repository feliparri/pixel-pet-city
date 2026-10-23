// The stars a pet earns in the town's games: a counter per pet name, kept in this browser (localStorage) for now.
// Stage 2 will let the shop spend them; until then they are only counted and shown in the HUD ("⭐ 12").
import { sanitizeName } from './protocol.js';

export const starsKey = (name) => `city.stars.${sanitizeName(name)}`;
const MAX_STARS = 999999;

/** `storage` has getItem/setItem (it may throw or be missing: then the count lives for this visit only). */
export function createStars(storage, name) {
  const key = starsKey(name);
  const read = () => { try { const n = Number(storage && storage.getItem(key)); return Number.isInteger(n) && n >= 0 ? Math.min(n, MAX_STARS) : 0; } catch { return 0; } };
  let n = read();
  return {
    get: () => n,
    add(k) {
      if (!Number.isInteger(k) || k <= 0) return n;
      n = Math.min(MAX_STARS, n + k);
      try { if (storage) storage.setItem(key, String(n)); } catch { /* private mode: keep the count in memory */ }
      return n;
    },
  };
}
