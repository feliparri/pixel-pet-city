// The games' fixed rules: names, who can play, how long each phase lasts. Shared by the state machines, the protocol and the UI.

export const MAX_PLAYERS = 13;                // everyone in a room (MAX_PEERS others plus this browser)
export const LOBBY_MS = 10000;                // how long a lobby stays open for "Me sumo"
export const EARLY_START_MS = 3000;           // a lobby where everybody already joined starts after this long (so a solo player is not kept waiting)
export const SETTLE_MS = 2500;                 // ... and when nobody joined, left or asked to search for this long
export const ECHO_MS = 2000;                   // a joined player repeats its join (and its "¡Yo busco!") this often until the lobby closes
export const STATE_MS = 500;                  // how often the referee broadcasts the shared state

export const GAME_RULES = {
  hide: {
    name: 'Escondida', play: 'Jugar a Escondida', invite: '¡Escondida! ¿Juegan?', min: 2,
    countMs: 15000, searchMs: 90000, lightRadius: 3,
  },
  chicken: {
    name: 'Pillar la gallina', play: 'Jugar a Pillar la gallina', invite: '¡La gallina! ¿Juegan?', min: 1,
    roundMs: 60000, goal: 3, starsPerCatch: 3, respawnMs: 1500,
  },
};
export const PLAYABLE = Object.keys(GAME_RULES);
export const isPlayable = (g) => typeof g === 'string' && Object.hasOwn(GAME_RULES, g);
