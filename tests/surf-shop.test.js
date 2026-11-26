import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, BEACH, isWalkable, isLand } from '../src/map.js';
import { findPath } from '../src/path.js';
import { SEATS } from '../src/bonfire.js';
import { surfShopAt, surfAction, BOARD } from '../src/surf.js';
import { kioskAt } from '../src/kiosk.js';
import { toolRows, needText, SURF_SHOP_KEYS, TOOLS } from '../src/tools.js';

const B = AREAS.beach, S = BEACH.surfShop;
const all = (ch) => { const out = []; for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) if (B.grid[y][x] === ch) out.push([x, y]); return out; };

test('the surf stand is solid, sits on dry sand away from the court, the Kiosco, the fire and the loungers, and its counter is reachable from the door', () => {
  assert.equal(all('8').length, S.w * S.h);
  for (const [x, y] of all('8')) assert.equal(isWalkable(x, y, 'beach'), false);
  for (let x = S.x; x < S.x + S.w; x++) {
    assert.ok(isLand(x, S.y + S.h, 'beach') && isWalkable(x, S.y + S.h, 'beach'), `counter tile ${x}`);
    assert.ok(findPath(B.w - 2, BEACH.door[0], x, S.y + S.h, 'beach').length > 0, `reachable ${x}`);
  }
  const near = (a, b) => a.x < b.x + b.w + 2 && b.x < a.x + a.w + 2 && a.y < b.y + b.h + 2 && b.y < a.y + a.h + 2;
  assert.ok(!near(S, BEACH.court) && !near(S, BEACH.kiosk) && !near(S, { x: BEACH.bonfire.x, y: BEACH.bonfire.y, w: 1, h: 1 }));
  for (const [x, y] of all('&')) assert.ok(x < S.x - 1 || x > S.x + S.w || y < S.y - 1 || y > S.y + S.h, 'no lounger on the stand');
});

test('the prompt only shows in front of the counter, and never hides the break hint or the Kiosco', () => {
  for (let x = S.x; x < S.x + S.w; x++) assert.deepEqual(surfShopAt(x, S.y + S.h), { id: 'surfshop', label: 'Tienda de surf', target: 'surfshop' });
  assert.equal(surfShopAt(S.x - 1, S.y + S.h), null);
  assert.equal(surfShopAt(S.x, S.y + S.h + 1), null);
  assert.equal(surfShopAt(S.x, S.y + S.h, 'farm'), null);
  assert.equal(kioskAt(S.x, S.y + S.h), null);
});

test('the stand sells just the surfboard with the Almacén rows and states; the Almacén still sells everything', () => {
  assert.deepEqual(SURF_SHOP_KEYS, [BOARD]);
  const rows = (shop, keys) => toolRows(shop, keys);
  assert.deepEqual(rows({ canSpend: true, gold: 200, tools: [] }, SURF_SHOP_KEYS).map((r) => [r.key, r.state, r.enabled]), [['surfboard', 'buy', true]]);
  assert.equal(rows({ canSpend: true, gold: 200, tools: ['surfboard'] }, SURF_SHOP_KEYS)[0].label, 'Ya la tienes');
  assert.equal(rows({ canSpend: false, gold: 0, tools: [] }, SURF_SHOP_KEYS)[0].state, 'closed');
  assert.equal(rows({ canSpend: true, gold: 45, tools: [] }, SURF_SHOP_KEYS)[0].label, 'Te faltan 15 de oro');
  assert.deepEqual(rows({ canSpend: true, gold: 200, tools: [] }).map((r) => r.key), Object.keys(TOOLS));
});

test('the break tells a pet without a board to go to the surf stand', () => {
  assert.equal(needText(BOARD), 'Necesitas una Tabla de surf — Tienda de surf');
  assert.equal(needText('sickle'), 'Necesitas una Hoz — Almacén');
  assert.equal(surfAction(0, BEACH.breakX[0], 20, []).label, 'Necesitas una Tabla de surf — Tienda de surf');
});

test('no palm, umbrella or lounger covers the bonfire or its five seats', () => {
  const spr = { J: [-20, -72, 56, 88], O: [-10, -32, 36, 48], '&': [-5, -10, 32, 26] };       // sprite offsets and sizes in px from the tile's top left (src/art/bake.js)
  const zones = [[BEACH.bonfire.x * 16 - 4, BEACH.bonfire.y * 16 - 4, 24, 22], ...SEATS.map(([x, y]) => [x * 16, y * 16 - 8, 16, 24])];
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    const s = spr[B.grid[y][x]]; if (!s) continue;
    const r = [x * 16 + s[0], y * 16 + s[1], s[2], s[3]];
    for (const z of zones) assert.ok(!(r[0] < z[0] + z[2] && r[0] + r[2] > z[0] && r[1] < z[1] + z[3] && r[1] + r[3] > z[1]), `${B.grid[y][x]} at ${x},${y} covers the fire circle`);
  }
});
