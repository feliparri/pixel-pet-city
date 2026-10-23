import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../tools/fake-board.mjs';
import { world } from './trip-helpers.js';
import { handle } from '../supabase/functions/_shared/handlers.js';

test('the fake board runs a whole trip against the handlers, with each fixture', async () => {
  for (const fixture of ['plain', 'keepsake']) {
    const w = world();
    const deps = { db: w.db, nowS: () => w.now, randomBytes: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), uuid: () => crypto.randomUUID(), townUrl: 'https://town/' };
    let saved = null;
    const fetcher = async (url, init) => {
      const fn = url.split('/').pop();
      const headers = Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
      const body = typeof init.body === 'string' ? new TextEncoder().encode(init.body) : init.body;
      const out = await handle(fn, { method: init.method, headers, body }, deps);
      return { status: out.status, json: async () => out.body };
    };
    const board = createBoard({ fetch: fetcher, base: 'https://x/functions/v1', now: () => w.now * 1000, load: () => saved, save: (s) => { saved = s; }, log() {} });
    assert.ok([200, 201].includes((await board.register()).existed === false ? 201 : 200));
    const s = await board.start({ fixture, entrance: 'blue_bolt' });
    assert.equal(s.pet, 'Mochi');
    assert.equal((await board.status()).claimed, false);
    const claim = await handle('trip-claim', { method: 'POST', headers: {}, body: new TextEncoder().encode(JSON.stringify({ code: s.code })) }, deps);
    assert.equal(claim.body.entrance, 'blue_bolt');
    assert.equal((await board.status()).claimed, true);
    assert.equal((await board.recall()).status, 'recalled');
    const r = await board.fetchReturn();
    assert.equal(r.seq, 2);
    assert.equal((await board.ack()).status, 'closed');
    assert.equal(saved.returnSeq, 2);
  }
});
