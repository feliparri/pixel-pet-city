// The screens of the fishing layer and how they follow each other (pure, like src/arcade/flow.js): menu -> play -> result, with pause and the album on the side.
export const initialFlow = (screen = 'menu') => ({ screen, from: 'menu', exit: false });

/** The next flow for an action; the same object when the action does nothing here. */
export function reduce(flow, a) {
  const { screen } = flow;
  switch (a.type) {
    case 'start': return screen === 'menu' || screen === 'result' || screen === 'pause' ? { ...flow, screen: 'play' } : flow;
    case 'pause': return screen === 'play' ? { ...flow, screen: 'pause' } : flow;
    case 'resume': return screen === 'pause' ? { ...flow, screen: 'play' } : flow;
    case 'result': return screen === 'play' ? { ...flow, screen: 'result' } : flow;
    case 'album': return screen === 'menu' || screen === 'pause' || screen === 'result' ? { ...flow, screen: 'album', from: screen } : flow;
    case 'back': return screen === 'album' ? { ...flow, screen: flow.from } : flow;
    case 'menu': return screen === 'pause' || screen === 'result' ? { ...flow, screen: 'menu' } : flow;
    case 'exit': return flow.exit ? flow : { ...flow, exit: true };
    default: return flow;
  }
}
