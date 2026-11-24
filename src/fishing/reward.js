// What a catch earns, and what is kept (pure apart from the storage it is given, tested): the album of fish caught, per pet, and the few stars a day, through the
// town's star counter. Every storage call is guarded: a full disk or a private window must never break a catch (the album then lives for this visit only).
import { ALBUM_KEY, albumFrom, recordCatch, createFishStars, starsForCatch, fishById, FISH_STAR_CAP_PER_DAY } from './rules.js';

/** A storage that keeps this pet's own copy of every key (`key.who`): the album and the day's stars are per pet, as the farm's day is. */
export const scopedStorage = (storage, who) => (storage ? { getItem: (k) => storage.getItem(`${k}.${who}`), setItem: (k, v) => storage.setItem(`${k}.${who}`, v) } : null);

/** The album in a storage: { get() -> the clean album, set(album) }. */
export function createAlbumStore(storage, key = ALBUM_KEY) {
  let mem = null;
  const read = () => { try { return albumFrom(JSON.parse((storage && storage.getItem(key)) || 'null')); } catch { return {}; } };
  return {
    get() { if (!mem) mem = read(); return mem; },
    set(album) { mem = albumFrom(album); try { if (storage) storage.setItem(key, JSON.stringify(mem)); } catch { /* memory only */ } },
  };
}

/**
 * The reward of the fishing layer: settle(catch) records a catch in the album and pays its stars (never past today's cap) through awardStars(n); album() is the album.
 * today(): the day string; now(): ms. settle returns { first, record, stars, capped } (capped: today's cap is reached, so the card says so).
 */
export function createReward({ storage, today, awardStars = () => {}, now = () => Date.now(), cap = FISH_STAR_CAP_PER_DAY }) {
  const album = createAlbumStore(storage), daily = createFishStars(storage, today);
  return {
    album: () => album.get(),
    earnedToday: () => daily.earned(),
    settle(c) {
      const fish = c && fishById(c.id);
      if (!fish) return {};
      const r = recordCatch(album.get(), fish.id, c.size, now());
      album.set(r.album);
      const n = starsForCatch(fish, daily.earned(), cap);
      if (n > 0) { daily.award(n); try { awardStars(n); } catch { /* the town is gone */ } }
      return { first: r.first, record: r.record, stars: n, capped: daily.earned() >= cap };
    },
  };
}
