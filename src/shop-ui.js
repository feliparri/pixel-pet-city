// The "Tienda" and "Mochila" panels over the town (index.html #panel). Plain DOM on top of src/shop.js; the purchase itself is
// source.buy(key) (the trip client, or the dev mock). Opening and closing tell the town (onOpenChange) so the pet stops and the touch pad hides.
import { drawItemIcon } from './sprites.js';
import { drawProduce } from './art/produce.js';
import { KINDS, NAMES } from './canasta.js';
import { shopRows, bagList, confirmText, buyErrorText, thanks, CLOSED_TEXT, GOLD_TEXT, SHOP } from './shop.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** source: () => { shop, buy(key) } | null (nothing to show: no pet's trip). sprites: for the item icons. */
export function createShopUi($, { source, sprites, canasta = () => null, onBought = () => {}, onOpenChange = () => {} }) {
  const panel = $('panel'), body = $('panel-body'), note = $('panel-note');
  let view = null, confirming = null, busy = false, sold = 0;

  const icon = (key) => {
    const c = el('canvas', 'icon');
    c.width = c.height = 40;
    c.setAttribute('aria-hidden', 'true');
    drawItemIcon(c.getContext('2d'), sprites, key, 40);
    return c;
  };
  const say = (text, kind = '') => { note.textContent = text || ''; note.className = `panel-note ${kind}`.trim(); note.hidden = !text; };

  function paintShop(src) {
    const shop = src.shop;
    $('panel-title').textContent = 'Tienda';
    $('panel-gold').textContent = shop.canSpend ? GOLD_TEXT(shop.gold) : '';
    $('panel-gold').hidden = !shop.canSpend;
    if (!shop.canSpend && !note.textContent) say(CLOSED_TEXT, 'bad');
    const list = el('ul', 'shop-list');
    for (const row of shopRows(shop)) {
      const li = el('li', `shop-row ${row.state}`);
      const info = el('div', 'shop-info');
      info.append(el('strong', '', row.name), el('span', 'price', `${row.price} de oro`));
      const b = el('button', row.enabled ? 'btn small primary' : 'btn small', row.label);
      b.type = 'button'; b.disabled = !row.enabled || busy;
      b.addEventListener('click', () => { confirming = row.key; say(''); paint(); });
      li.append(icon(row.key), info, b);
      list.append(li);
    }
    body.replaceChildren(list);
  }

  function paintConfirm() {
    $('panel-title').textContent = 'Tienda';
    const box = el('div', 'confirm');
    box.append(icon(confirming), el('p', '', confirmText(confirming)));
    const yes = el('button', 'btn primary', 'Sí, comprar'), no = el('button', 'btn', 'No');
    yes.type = no.type = 'button'; yes.disabled = no.disabled = busy;
    yes.addEventListener('click', buy);
    no.addEventListener('click', () => { confirming = null; paint(); });
    const row = el('div', 'confirm-actions');
    row.append(yes, no);
    box.append(row);
    body.replaceChildren(box);
    yes.focus();
  }

  function paintBag(src) {
    $('panel-title').textContent = 'Mochila';
    $('panel-gold').hidden = true;
    const { carried, bought } = bagList(src.shop, sprites.catalogue);
    const frag = document.createDocumentFragment();
    const section = (title, items, empty) => {
      frag.append(el('h3', '', title));
      if (!items.length) { frag.append(el('p', 'empty', empty)); return; }
      const ul = el('ul', 'shop-list bag');
      for (const it of items) {
        const li = el('li', 'shop-row');
        li.append(it.key ? icon(it.key) : el('span', 'icon emoji', it.kind === 'toy' ? '🧸' : '🎁'), el('strong', '', it.name));
        ul.append(li);
      }
      frag.append(ul);
    };
    section('Lo que lleva tu mascota', carried, 'No trajo nada en la mochila.');
    section('Comprado (llega a casa con tu mascota)', bought, 'Todavía no compras nada.');
    const basket = canasta();
    if (basket) {                                                  // the farm's Canasta: stays in the town, nothing of it goes home
      frag.append(el('h3', '', 'Canasta (de la granja, se queda en el pueblo)'));
      const ul = el('ul', 'shop-list bag canasta');
      const row = (kind, name) => { const c = el('canvas', 'icon'); c.width = c.height = 40; c.setAttribute('aria-hidden', 'true'); drawProduce(c.getContext('2d'), kind, 40); const li = el('li', 'shop-row'); li.append(c, el('strong', '', name)); return li; };
      for (const k of KINDS) if (basket.count(k)) ul.append(row(k, `${basket.count(k)} ${NAMES[k][basket.count(k) === 1 ? 0 : 1]}`));
      ul.append(row(basket.bucketFull ? 'bucket-full' : 'bucket-empty', basket.bucketFull ? 'Cubo con agua' : 'Cubo vacío'));
      frag.append(ul);
      if (!basket.total()) frag.append(el('p', 'empty', 'Todavía no recoges nada en la granja.'));
    }
    body.replaceChildren(frag);
  }

  function paint() {
    const src = source();
    if (!view || !src) return;
    if (view === 'bag') paintBag(src);
    else if (confirming) paintConfirm();
    else paintShop(src);
  }

  async function buy() {
    const src = source(), key = confirming;
    if (!src || !key || busy) return;
    busy = true; paint(); say('Comprando…');
    const r = await src.buy(key);
    busy = false; confirming = null;
    if (r.ok) { const line = thanks(sold++); say(`🦝 ${line} ${SHOP[key].name} irá a casa con tu mascota.`, 'good'); onBought(key, line); }
    else say(buyErrorText(r), 'bad');
    paint();
  }

  function open(which) {
    if (!source()) return false;
    view = which; confirming = null; busy = false; say('');
    panel.hidden = false;
    paint();
    onOpenChange(true);
    if (!confirming) $('panel-close').focus();
    return true;
  }
  function close() {
    if (!view) return;
    view = null; confirming = null;
    panel.hidden = true;
    if (document.activeElement && panel.contains(document.activeElement)) document.activeElement.blur();
    onOpenChange(false);
  }
  $('panel-close').addEventListener('click', close);
  window.addEventListener('keydown', (ev) => {
    if (!view || ev.key !== 'Escape') return;
    ev.preventDefault();
    if (confirming && !busy) { confirming = null; paint(); } else close();
  });

  return { openShop: () => open('shop'), openBag: () => open('bag'), close, get isOpen() { return view !== null; } };
}
