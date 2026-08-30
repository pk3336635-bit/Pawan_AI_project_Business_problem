/**
 * components/cartDrawer.js
 * Slide-in cart panel + the sticky mobile summary bar.
 * Both read the same store, so they can never disagree.
 */

import { html, raw, currency, plural, joinHtml } from '../utils/format.js';
import {
  getCart, getLocalOrders, setCartQty, removeFromCart, clearCart,
  cartCount, computeTotals, subscribe, getCheckout,
} from '../store.js';
import { buildConsumption, stockState } from '../utils/inventory.js';
import { track, EVENTS } from '../analytics.js';
import { toast } from './toast.js';
import { confirmDialog } from './modal.js';
import { hydrateImages } from './skeleton.js';

let isOpen = false;
let lastFocused = null;

const drawerEl = () => document.getElementById('cart-drawer');
const scrimEl = () => document.getElementById('scrim');

/* -------------------------------------------------------------------------- */
/* Line rendering                                                             */
/* -------------------------------------------------------------------------- */

function lineMarkup(line, stock) {
  return html`
    <div class="cart-line" data-line="${line.menuItemId}">
      <img class="cart-line__img" data-src="${line.imageUrl}" alt="${line.baseName || line.name}"
        width="152" height="124" loading="lazy" decoding="async" />

      <div>
        <p class="cart-line__title">${line.name}</p>
        <p class="cart-line__sub">${currency(line.price)} each · ${line.categoryName || ''}</p>
        ${stock && stock.level === 'low'
          ? raw(`<p class="cart-line__sub" style="color:var(--orange-600)">Only ${stock.remaining} left</p>`)
          : ''}
        ${stock && !stock.isAvailable
          ? raw('<p class="cart-line__sub" style="color:var(--red-600)">Out of stock — please remove</p>')
          : ''}
      </div>

      <div class="cart-line__side">
        <span class="cart-line__price">${currency(line.price * line.qty)}</span>
        <div class="stepper stepper--sm" role="group" aria-label="Quantity for ${line.name}">
          <button type="button" data-cart-dec="${line.menuItemId}" aria-label="Decrease quantity">−</button>
          <output aria-live="polite">${line.qty}</output>
          <button type="button" data-cart-inc="${line.menuItemId}" aria-label="Increase quantity">+</button>
        </div>
        <button class="btn btn--danger btn--sm" type="button" data-cart-remove="${line.menuItemId}"
          aria-label="Remove ${line.name} from cart">Remove</button>
      </div>
    </div>`;
}

/**
 * Cart rows with live stock context. The Order page reuses this so the drawer
 * and the full-page cart always look and behave the same.
 * @param {Array} cart
 * @param {Map} menuById optional — enables the "Only N left" warnings
 */
export function cartLines(cart = getCart(), menuById = null) {
  const consumption = buildConsumption(getLocalOrders(), []);
  return joinHtml(
    cart.map((line) => {
      const item = menuById?.get(line.menuItemId);
      return lineMarkup(line, item ? stockState(item, consumption) : null);
    })
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                     */
/* -------------------------------------------------------------------------- */

function drawerMarkup() {
  const cart = getCart();
  const checkout = getCheckout();
  const totals = computeTotals({ cart, deliveryType: checkout.deliveryType });

  const body = cart.length
    ? html`${raw(joinHtml(cart.map((line) => lineMarkup(line, null))))}`
    : html`
      <div class="empty-state" style="padding-block:var(--sp-7)">
        <div class="empty-state__icon" aria-hidden="true">🧁</div>
        <h3>Your cart is empty</h3>
        <p>Fresh jalebi is being pulled out of the kadhai right now. Shall we?</p>
        <a class="btn btn--primary" href="#/menu" data-drawer-close>Browse the menu</a>
      </div>`;

  const foot = cart.length
    ? html`
      ${totals.freeDeliveryGap > 0 && checkout.deliveryType === 'delivery'
        ? raw(`<div class="savings-pill" style="margin-bottom:12px">Add ${currency(totals.freeDeliveryGap)} more for free delivery</div>`)
        : ''}
      <div class="summary-line"><span>Subtotal</span><span>${currency(totals.subtotal)}</span></div>
      <div class="summary-line"><span>GST (5%)</span><span>${currency(totals.tax)}</span></div>
      <div class="summary-line"><span>Packaging</span><span>${currency(totals.packagingFee)}</span></div>
      <div class="summary-line summary-line--total"><span>Total</span><span>${currency(totals.total)}</span></div>
      <div class="stack" style="margin-top:var(--sp-4)">
        <a class="btn btn--primary btn--block" href="#/checkout" data-drawer-close>Choose a slot &amp; checkout</a>
        <a class="btn btn--secondary btn--block" href="#/order" data-drawer-close>Review full cart</a>
      </div>`
    : '';

  return html`
    <div class="cart-drawer__head">
      <h3>Your cart <span class="text-muted" style="font-weight:400">· ${plural(cartCount(cart), 'item')}</span></h3>
      <div class="row" style="gap:var(--sp-2)">
        ${cart.length ? raw('<button class="btn btn--ghost btn--sm" type="button" data-cart-clear>Clear</button>') : ''}
        <button class="icon-btn" type="button" data-drawer-close aria-label="Close cart">✕</button>
      </div>
    </div>
    <div class="cart-drawer__body">${raw(body)}</div>
    ${foot ? raw(`<div class="cart-drawer__foot">${foot}</div>`) : ''}`;
}

function paintDrawer() {
  const drawer = drawerEl();
  if (!drawer || !isOpen) return;
  drawer.innerHTML = drawerMarkup();
  hydrateImages(drawer);
}

export function openCartDrawer() {
  const drawer = drawerEl();
  const scrim = scrimEl();
  if (!drawer || !scrim) return;

  lastFocused = document.activeElement;
  isOpen = true;
  drawer.hidden = false;
  scrim.hidden = false;
  document.body.classList.add('no-scroll');
  paintDrawer();
  track(EVENTS.CART_VIEW, { items: cartCount() });

  drawer.querySelector('[data-drawer-close]')?.focus();
}

export function closeCartDrawer() {
  const drawer = drawerEl();
  const scrim = scrimEl();
  if (!drawer || !scrim) return;

  isOpen = false;
  drawer.hidden = true;
  scrim.hidden = true;
  drawer.innerHTML = '';
  document.body.classList.remove('no-scroll');
  lastFocused?.focus?.();
}

/* -------------------------------------------------------------------------- */
/* Sticky mobile bar                                                          */
/* -------------------------------------------------------------------------- */

function paintMobileBar() {
  const bar = document.getElementById('mobile-cart-bar');
  if (!bar) return;

  const cart = getCart();
  const count = cartCount(cart);

  if (!count) {
    bar.hidden = true;
    document.body.classList.remove('has-cart-bar');
    bar.innerHTML = '';
    return;
  }

  const totals = computeTotals({ cart, deliveryType: getCheckout().deliveryType });
  bar.hidden = false;
  document.body.classList.add('has-cart-bar');
  bar.innerHTML = html`
    <button class="mobile-cart-bar__info" type="button" data-mobile-cart
      style="background:none;border:0;color:inherit;text-align:left;cursor:pointer">
      <b>${currency(totals.total)}</b>
      <span>${plural(count, 'item')} · view cart</span>
    </button>
    <a class="btn btn--primary btn--sm" href="#/checkout">Checkout</a>`;

  bar.querySelector('[data-mobile-cart]').addEventListener('click', openCartDrawer);
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                     */
/* -------------------------------------------------------------------------- */

export function mountCartDrawer() {
  const drawer = drawerEl();
  const scrim = scrimEl();
  if (!drawer || !scrim) return;

  scrim.addEventListener('click', closeCartDrawer);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) closeCartDrawer();
  });

  drawer.addEventListener('click', async (event) => {
    const target = event.target.closest(
      '[data-drawer-close],[data-cart-inc],[data-cart-dec],[data-cart-remove],[data-cart-clear]'
    );
    if (!target) return;

    if (target.dataset.drawerClose !== undefined) {
      closeCartDrawer();
      return;
    }

    if (target.dataset.cartClear !== undefined) {
      const confirmed = await confirmDialog({
        title: 'Empty the cart?',
        message: 'This removes every item you have added. It cannot be undone.',
        confirmLabel: 'Yes, empty it',
        danger: true,
      });
      if (confirmed) {
        clearCart();
        toast.info('Cart emptied');
      }
      return;
    }

    const id = target.dataset.cartInc || target.dataset.cartDec || target.dataset.cartRemove;
    if (!id) return;

    if (target.dataset.cartRemove !== undefined) {
      const row = drawer.querySelector(`[data-line="${CSS.escape(id)}"]`);
      row?.classList.add('is-removing');
      track(EVENTS.REMOVE_FROM_CART, { itemId: id });
      setTimeout(() => removeFromCart(id), 160);
      return;
    }

    const cart = getCart();
    const line = cart.find((entry) => entry.menuItemId === id);
    if (!line) return;

    const delta = target.dataset.cartInc !== undefined ? 1 : -1;
    setCartQty(id, line.qty + delta);
  });

  // Keep both surfaces in sync with the store.
  subscribe((event) => {
    if (event.type === 'cart' || event.type === 'checkout' || event.type === 'reset') {
      paintDrawer();
      paintMobileBar();
    }
  });

  paintMobileBar();
}
