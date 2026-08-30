/**
 * components/productCard.js
 * The menu item card plus its quick-view dialog and add-to-cart behaviour.
 *
 * One delegated listener serves an entire grid, so rendering 400 cards costs
 * 400 DOM nodes and exactly two event listeners.
 */

import { html, raw, currency, joinHtml, truncate } from '../utils/format.js';
import { stockState, buildConsumption, maxAddable } from '../utils/inventory.js';
import { getCart, getLocalOrders, addToCart, setCartQty, cartQty } from '../store.js';
import { trackAddToCart, track, EVENTS } from '../analytics.js';
import { toast } from './toast.js';
import { openModal } from './modal.js';
import { hydrateImages } from './skeleton.js';

/** Current stock consumption from placed orders + the live cart. */
export const consumptionNow = () => buildConsumption(getLocalOrders(), getCart());

/* -------------------------------------------------------------------------- */
/* Markup                                                                     */
/* -------------------------------------------------------------------------- */

function flags(item) {
  const parts = [];
  if (item.isBestseller) parts.push('<span class="badge badge--hot">Bestseller</span>');
  if (item.isFestivalSpecial) parts.push('<span class="badge badge--festival">Festival</span>');
  return parts.join('');
}

/** Add button, or a stepper once the item is in the cart. */
export function cardControls(item, { qty, stock }) {
  if (!stock.isAvailable) {
    return html`<button class="btn btn--secondary btn--sm" type="button" disabled aria-label="${item.name} is out of stock">Sold out</button>`;
  }

  if (qty > 0) {
    return html`
      <div class="stepper stepper--sm" role="group" aria-label="Quantity for ${item.name}">
        <button type="button" data-dec="${item.id}" aria-label="Remove one ${item.name}">−</button>
        <output aria-live="polite">${qty}</output>
        <button type="button" data-inc="${item.id}" aria-label="Add one more ${item.name}"
          ${qty >= stock.remaining ? raw('disabled') : ''}>+</button>
      </div>`;
  }

  return html`<button class="btn btn--primary btn--sm" type="button" data-add="${item.id}"
    aria-label="Add ${item.name} to cart">Add</button>`;
}

/**
 * @param {object} item menu row
 * @param {{ consumption?: Map, cart?: Array, eager?: boolean }} options
 */
export function productCard(item, options = {}) {
  const consumption = options.consumption || consumptionNow();
  const stock = stockState(item, consumption);
  const qty = cartQty(item.id, options.cart);

  return html`
    <article class="product-card ${stock.isAvailable ? '' : 'is-out'}" data-item-id="${item.id}">
      <div class="product-card__media">
        <img
          data-src="${item.imageUrl}"
          alt="${item.baseName || item.name}"
          width="800" height="600"
          loading="${options.eager ? 'eager' : 'lazy'}"
          decoding="async" />
        <div class="product-card__flags">${raw(flags(item))}</div>
        ${stock.shouldShowBadge
          ? raw(`<span class="product-card__stock badge ${stock.badgeClass}">${stock.label}</span>`)
          : ''}
        <button class="icon-btn product-card__quick" type="button" data-quick="${item.id}"
          aria-label="Quick view: ${item.name}" title="Quick view">↗</button>
      </div>

      <div class="product-card__body">
        <div class="product-card__meta">
          <span class="veg-mark ${item.isVeg ? '' : 'veg-mark--nonveg'}" title="${item.isVeg ? 'Vegetarian' : 'Non-vegetarian'}" role="img"
            aria-label="${item.isVeg ? 'Vegetarian' : 'Non-vegetarian'}"></span>
          <span class="rating-pill">★ ${item.rating}</span>
          <span>${item.prepTimeMins} min</span>
        </div>

        <h4 class="product-card__title">${item.name}</h4>
        <p class="product-card__desc">${truncate(item.description, 74)}</p>

        <div class="product-card__foot">
          <div class="price">
            <b>${currency(item.price)}</b>
            ${item.mrp > item.price ? raw(`<s>${currency(item.mrp)}</s>`) : ''}
          </div>
          <div data-card-controls="${item.id}">${raw(cardControls(item, { qty, stock }))}</div>
        </div>
      </div>
    </article>`;
}

/** Renders a list of items into a responsive grid. */
export function productGrid(items, options = {}) {
  const consumption = options.consumption || consumptionNow();
  const cart = options.cart || getCart();
  return html`<div class="grid grid--cards" data-product-grid>
    ${raw(joinHtml(items.map((item, index) =>
      productCard(item, { consumption, cart, eager: index < 4 })
    )))}
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Behaviour                                                                  */
/* -------------------------------------------------------------------------- */

/** Repaints only the add/stepper controls inside `root` after a cart change. */
export function refreshControls(root, menuById) {
  const consumption = consumptionNow();
  const cart = getCart();

  root.querySelectorAll('[data-card-controls]').forEach((slot) => {
    const item = menuById.get(slot.dataset.cardControls);
    if (!item) return;
    const qty = cartQty(item.id, cart);
    slot.innerHTML = cardControls(item, { qty, stock: stockState(item, consumption) });
    slot.closest('.product-card')?.classList.toggle('is-out', !stockState(item, consumption).isAvailable);
  });

  root.querySelectorAll('[data-stock-badge]').forEach((badge) => {
    const item = menuById.get(badge.dataset.stockBadge);
    if (!item) return;
    const stock = stockState(item, consumption);
    badge.className = `badge ${stock.badgeClass}`;
    badge.textContent = stock.label;
  });
}

function bump() {
  const button = document.querySelector('[data-cart-button]');
  if (!button) return;
  button.classList.remove('is-bumping');
  void button.offsetWidth; // restart the animation
  button.classList.add('is-bumping');
}

function handleAdd(item) {
  const consumption = consumptionNow();
  const max = maxAddable(item, consumption);

  if (max <= 0) {
    toast.error(`${item.baseName || item.name} just went out of stock.`);
    return false;
  }

  const { added, capped } = addToCart(item, 1, { max: max + cartQty(item.id) });
  if (added <= 0) {
    toast.info(`Only ${max} left — that is everything we have today.`);
    return false;
  }

  trackAddToCart(item, added);
  bump();
  toast.success(`${item.baseName || item.name} added to cart`, {
    action: { label: 'View cart', onClick: () => { location.hash = '#/order'; } },
  });
  if (capped) toast.info('We capped the quantity to the stock left for today.');
  return true;
}

/**
 * Wires a container that holds product cards.
 * @param {HTMLElement} root
 * @param {Map} menuById
 */
export function attachProductGrid(root, menuById) {
  if (!root || root.dataset.productBound === '1') return;
  root.dataset.productBound = '1';

  hydrateImages(root);

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-add],[data-inc],[data-dec],[data-quick]');
    if (!target) return;

    const id = target.dataset.add || target.dataset.inc || target.dataset.dec || target.dataset.quick;
    const item = menuById.get(id);
    if (!item) return;

    if (target.dataset.quick !== undefined) {
      openQuickView(item, menuById, root);
      return;
    }

    if (target.dataset.add !== undefined) {
      handleAdd(item);
    } else if (target.dataset.inc !== undefined) {
      const consumption = buildConsumption(getLocalOrders(), []);
      const stock = stockState(item, consumption);
      const next = cartQty(item.id) + 1;
      if (next > stock.remaining) {
        toast.info(`Only ${stock.remaining} left in stock today.`);
        return;
      }
      setCartQty(item.id, next, { max: stock.remaining });
      bump();
    } else {
      const next = cartQty(item.id) - 1;
      setCartQty(item.id, next);
      if (next <= 0) track(EVENTS.REMOVE_FROM_CART, { itemId: item.id });
    }

    refreshControls(root, menuById);
  });
}

/* -------------------------------------------------------------------------- */
/* Quick view                                                                 */
/* -------------------------------------------------------------------------- */

export function openQuickView(item, menuById, gridRoot) {
  const stock = stockState(item, consumptionNow());
  track(EVENTS.ITEM_VIEW, { itemId: item.id, category: item.category });

  const body = html`
    <div class="grid grid--2" style="gap:1.25rem;align-items:start">
      <img src="${item.imageUrl}" alt="${item.baseName || item.name}" width="800" height="600"
        style="border-radius:16px;aspect-ratio:4/3;object-fit:cover;background:var(--cream-200)" />
      <div class="stack">
        <div class="row">
          <span class="veg-mark ${item.isVeg ? '' : 'veg-mark--nonveg'}" role="img"
            aria-label="${item.isVeg ? 'Vegetarian' : 'Non-vegetarian'}"></span>
          <span class="rating-pill">★ ${item.rating}</span>
          <span class="text-muted" style="font-size:var(--fs-xs)">${item.ratingCount} ratings</span>
        </div>

        <p class="text-soft mb-0">${item.description}</p>

        <div class="price price--lg">
          <b>${currency(item.price)}</b>
          ${item.mrp > item.price ? raw(`<s>${currency(item.mrp)}</s>`) : ''}
        </div>

        <ul class="kv-list">
          <li><span>Category</span><b>${item.categoryName}</b></li>
          <li><span>Serves</span><b>${item.serves} ${item.serves === 1 ? 'person' : 'people'}</b></li>
          <li><span>Preparation</span><b>${item.prepTimeMins} minutes</b></li>
          <li><span>Best within</span><b>${item.shelfLifeDays} ${item.shelfLifeDays === 1 ? 'day' : 'days'}</b></li>
          <li><span>Energy</span><b>${item.calories} kcal</b></li>
          <li><span>Availability</span><b data-stock-badge="${item.id}" class="badge ${stock.badgeClass}">${stock.label}</b></li>
        </ul>

        <div class="row">
          ${raw(item.tags.map((tag) => `<span class="badge badge--muted">#${tag}</span>`).join(''))}
        </div>
      </div>
    </div>`;

  openModal({
    title: item.name,
    body,
    wide: true,
    footer: `
      <button class="btn btn--secondary" type="button" data-modal-close>Keep browsing</button>
      <button class="btn btn--primary" type="button" data-quick-add data-autofocus
        ${stock.isAvailable ? '' : 'disabled'}>${stock.isAvailable ? 'Add to cart' : 'Sold out'}</button>`,
    onMount(dialog, close) {
      dialog.querySelector('[data-quick-add]')?.addEventListener('click', () => {
        if (handleAdd(item)) {
          if (gridRoot) refreshControls(gridRoot, menuById);
          close();
        }
      });
    },
  });
}
