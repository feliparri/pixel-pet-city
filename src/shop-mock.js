// Development only (?local=1&dev=1): a stand-in for the trip client's shop that lives in the page, so the shop and the backpack can be tried
// and photographed without a server. It follows the same rules as trip-buy. ?gold=N sets the gold, ?shop=closed an old board, ?gifts=2 gifts already packed.
import { SHOP, GIFT_MAX, shopFrom, shopAfterBuy } from './shop.js';

export function createMockShop(search = '') {
  const q = new URLSearchParams(search);
  const gold = Number.isInteger(Number(q.get('gold'))) && q.has('gold') ? Math.max(0, Number(q.get('gold'))) : 200;
  const packed = Math.max(0, Math.min(GIFT_MAX, Number(q.get('gifts')) | 0));
  let spent = 0, bought = [];
  const pet = { owned: ['tophat', 'bow'], bag: [{ kind: 'wear', key: 'scarf' }, { kind: 'season', name: 'Gorro de bruja' }, { kind: 'toy', id: 1 }] };
  const view = () => ({ can_spend: q.get('shop') !== 'closed', gold_left: gold - spent, bought });
  let shop = { ...shopFrom(view(), pet), full: packed >= GIFT_MAX };
  return {
    get shop() { return shop; },
    async buy(key) {
      let r;
      if (!shop.canSpend) r = { ok: false, error: 'shop_closed' };
      else if (!Object.hasOwn(SHOP, key)) r = { ok: false, error: 'not_for_sale' };
      else if (shop.owned.includes(key) || bought.includes(key)) r = { ok: false, error: 'owned' };
      else if (packed + bought.length >= GIFT_MAX) r = { ok: false, error: 'bag_full' };
      else if (SHOP[key].price > gold - spent) r = { ok: false, error: 'no_gold', price: SHOP[key].price, gold_left: gold - spent };
      else { spent += SHOP[key].price; bought = [...bought, key]; r = { ok: true, gold_left: gold - spent, bought }; }
      shop = shopAfterBuy(shop, key, r);
      return r;
    },
  };
}
