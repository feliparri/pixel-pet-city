// Development only (?local=1&dev=1): a stand-in for the trip client's shop that lives in the page, so the shop and the backpack can be tried
// and photographed without a server. It follows the same rules as trip-buy and trip-buy-tool. ?gold=N sets the gold, ?shop=closed an old board, ?items=14 a board that does not know the town's hats (16 by default), ?gifts=2 gifts already packed,
// ?tools=sickle,bucket the farm tools the pet already owns (none by default); claimMission follows trip-mission (one payment per villager a day, a daily cap, ?earned=N what
// missions paid already today).
import { SHOP, GIFT_MAX, shopFrom, shopAfterBuy, shopAfterBuyTool, shopAfterMission } from './shop.js';
import { TOOLS, isTool, toolKeys } from './tools.js';
import { DAILY_CAP, parseMission } from './missions.js';
import { dayOf } from './npc-world.js';

export function createMockShop(search = '') {
  const q = new URLSearchParams(search);
  const gold = Number.isInteger(Number(q.get('gold'))) && q.has('gold') ? Math.max(0, Number(q.get('gold'))) : 200;
  const packed = Math.max(0, Math.min(GIFT_MAX, Number(q.get('gifts')) | 0));
  let spent = 0, bought = [], earned = Math.max(0, Math.min(DAILY_CAP, Number(q.get('earned')) | 0)), paid = [];
  const pinned = q.has('npct') && Number.isFinite(Number(q.get('npct'))) ? Number(q.get('npct')) : null;         // the town's pinned clock (?dev=1&npct=<ms>) decides the mission day too
  const pet = { owned: ['tophat', 'bow'], tools: toolKeys((q.get('tools') || '').split(',')), bag: [{ kind: 'wear', key: 'scarf' }, { kind: 'season', name: 'Gorro de bruja' }, { kind: 'toy', id: 1 }] };
  const items = q.has('items') && Number.isInteger(Number(q.get('items'))) ? Number(q.get('items')) : 16;
  const view = () => ({ can_spend: q.get('shop') !== 'closed', gold_left: gold - spent + earned, bought, items });
  let shop = { ...shopFrom(view(), pet), full: packed >= GIFT_MAX };
  return {
    get shop() { return shop; },
    async buy(key) {
      let r;
      if (!shop.canSpend) r = { ok: false, error: 'shop_closed' };
      else if (!Object.hasOwn(SHOP, key)) r = { ok: false, error: 'not_for_sale' };
      else if (SHOP[key].needs && items < SHOP[key].needs) r = { ok: false, error: 'update_board' };
      else if (shop.owned.includes(key) || bought.includes(key)) r = { ok: false, error: 'owned' };
      else if (packed + bought.length >= GIFT_MAX) r = { ok: false, error: 'bag_full' };
      else if (SHOP[key].price > gold - spent + earned) r = { ok: false, error: 'no_gold', price: SHOP[key].price, gold_left: gold - spent + earned };
      else { spent += SHOP[key].price; bought = [...bought, key]; r = { ok: true, gold_left: gold - spent + earned, bought }; }
      shop = shopAfterBuy(shop, key, r);
      return r;
    },
    async claimMission(m, nowMs = pinned ?? Date.now()) {
      let r;
      const parsed = parseMission(m && m.id);
      if (!shop.canSpend) r = { ok: false, error: 'shop_closed' };
      else if (!parsed) r = { ok: false, error: 'bad_mission' };
      else if (parsed.day !== dayOf(nowMs).date) r = { ok: false, error: 'mission_expired' };
      else if (paid.includes(parsed.villager)) r = { ok: false, error: 'done', earned_today: earned };
      else if (earned >= DAILY_CAP) r = { ok: false, error: 'cap_reached', earned_today: earned };
      else {
        const pay = Math.min(parsed.reward, DAILY_CAP - earned);
        earned += pay; paid = [...paid, parsed.villager];
        r = { ok: true, gold: pay, capped: pay < parsed.reward, earned_today: earned, cap: DAILY_CAP, gold_left: gold - spent + earned };
      }
      shop = shopAfterMission(shop, parsed || m, r);
      return r;
    },
    async buyTool(key) {
      let r;
      if (!shop.canSpend) r = { ok: false, error: 'shop_closed' };
      else if (!isTool(key)) r = { ok: false, error: 'not_for_sale' };
      else if (shop.tools.includes(key)) r = { ok: false, error: 'owned' };
      else if (TOOLS[key].price > gold - spent + earned) r = { ok: false, error: 'no_gold', price: TOOLS[key].price, gold_left: gold - spent + earned };
      else { spent += TOOLS[key].price; r = { ok: true, gold_left: gold - spent + earned, tools: [...shop.tools, key] }; }
      shop = shopAfterBuyTool(shop, key, r);
      return r;
    },
  };
}
