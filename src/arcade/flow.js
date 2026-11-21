// The arcade's screens as a small state machine (no DOM): menu -> select -> play <-> pause -> over -> (again | menu), and "exit" from anywhere.
// reduce(state, action) returns the next state; an action that makes no sense on the current screen changes nothing. The games on offer come in as data
// (`available` false: its card says "Pronto" and cannot be picked).
export const SCREENS = ['menu', 'select', 'play', 'pause', 'over'];
export const GAMES = [
  { id: 'train', name: 'Tren', blurb: 'Esquiva los trenes', available: true, starScore: 250 },
  { id: 'skate', name: 'Patineta', blurb: 'Salta los obstáculos', available: true, starScore: 250 },
];
export const initialFlow = () => ({ screen: 'menu', game: null, score: 0, best: 0, isNew: false, exit: false });

/** actions: { type: 'start' } | 'pick' (game id) | 'pause' | 'resume' | 'over' (score, best, isNew) | 'again' | 'menu' (the game menu) | 'title' | 'exit'. */
export function reduce(s, a, games = GAMES) {
  switch (a.type) {
    case 'start': return s.screen === 'menu' ? { ...s, screen: 'select' } : s;
    case 'pick': {
      const g = games.find((x) => x.id === a.game);
      return s.screen === 'select' && g && g.available ? { ...s, screen: 'play', game: g.id, score: 0, isNew: false } : s;
    }
    case 'pause': return s.screen === 'play' ? { ...s, screen: 'pause' } : s;
    case 'resume': return s.screen === 'pause' ? { ...s, screen: 'play' } : s;
    case 'over': return s.screen === 'play' ? { ...s, screen: 'over', score: a.score, best: a.best, isNew: !!a.isNew } : s;
    case 'again': return s.screen === 'over' || s.screen === 'pause' ? { ...s, screen: 'play', score: 0, isNew: false } : s;
    case 'menu': return s.screen === 'select' || s.screen === 'over' || s.screen === 'pause' ? { ...s, screen: 'select', game: null } : s;
    case 'title': return s.screen === 'select' ? { ...s, screen: 'menu' } : s;
    case 'exit': return { ...s, exit: true };
    default: return s;
  }
}
