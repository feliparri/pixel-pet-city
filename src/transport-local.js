// The "local" transport: BroadcastChannel between tabs of the same browser. It needs no server, so the town works and is testable now.

export function createLocalWire({ BroadcastChannelImpl = globalThis.BroadcastChannel } = {}) {
  return {
    name: 'local',
    /** @returns {Promise<{send(msg): void, close(): void}>} */
    async open(code, _selfId, _hello, onRaw, onStatus) {
      if (typeof BroadcastChannelImpl !== 'function') {
        onStatus('error', 'unsupported');
        throw new Error('BroadcastChannel is not available in this browser');
      }
      const ch = new BroadcastChannelImpl(`pixel-pet-city:room:${code}`);
      ch.onmessage = (ev) => onRaw(ev.data);
      onStatus('connected');
      return {
        send: (msg) => { try { ch.postMessage(msg); } catch { /* closed */ } },
        close: () => ch.close(),
      };
    },
  };
}
