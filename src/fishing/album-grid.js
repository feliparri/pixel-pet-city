// The album screen as data (pure, tested): one cell per fish in the table's order, with what the player has of it, and the progress as "x/10".
import { FISH, albumFrom, albumProgress } from './rules.js';

export const UNKNOWN_NAME = '???';

/** { cells: [{ id, name, label, rarity, when, caught, count, best }], have, total, text }. An uncaught fish keeps its name out of the cell (`label` is '???') and is drawn as a silhouette. */
export function albumGrid(album) {
  const a = albumFrom(album), { have, total } = albumProgress(a);
  const cells = FISH.map((f) => {
    const e = a[f.id];
    return { id: f.id, name: f.name, label: e ? f.name : UNKNOWN_NAME, rarity: f.rarity, when: f.when, caught: !!e, count: e ? e.count : 0, best: e ? e.best : 0 };
  });
  return { cells, have, total, text: `${have}/${total}` };
}

/** The two small lines under a caught fish ("x3", "Mejor: 54 cm"), or nothing for one not caught yet. */
export const cellLines = (c) => (c.caught ? { count: `x${c.count}`, best: `Mejor: ${c.best} cm` } : { count: '', best: '' });
