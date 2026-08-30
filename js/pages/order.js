/**
 * pages/order.js — the full-page cart.
 *
 * Same data as the drawer, but with room for the promo box, the pickup /
 * delivery switch, live stock warnings and a few "goes well with" suggestions.
 */

import { html, raw, currency, plural } from '../utils/format.js';
import {
  getCart, getCheckout, saveCheckout, computeTotals, evaluatePromo,
  clearCart, subscribe, cartCount, getLocalOrders,
} from '../store.js';
import { getCatalog, getPromoCodes, getBestsellers } from '../api.js';
import { cartLines } from '../components/cartDrawer.js';
import { productGrid, attachProductGrid, consumptionNow } from '../components/productCard.js';
import { hydrateImages, skeletonRows } from '../components/skeleton.js';
import { validateCartStock, buildConsumption } from '../utils/inventory.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { track, EVENTS } from '../analytics.js';

let promos = [];
let menuById = new Map();

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

function summaryMarkup() {
  const cart = getCart();
  const checkout = getCheckout();
  const promo = promos.find((entry) => entry.code === checkout.promoCode);
  const evaluation = promo ? evaluatePromo(promo, { cart, deliveryType: checkout.deliveryType }) : null;
  const discount = evaluation?.valid ? evaluation.discount : 0;
  const totals = computeTotals({ cart, discount, deliveryType: checkout.deliveryType });

  return html`
    <div class="summary-card">
      <h3>Bill summary</h3>

      <div class="field" style="margin-bottom:var(--sp-4)">
        <label for="promo-input">Have a coupon?</label>
        <div class="row" style="gap:var(--sp-2);flex-wrap:nowrap">
          <input class="input" id="promo-input" name="promo" placeholder="e.g. SWEET10"
            value="${checkout.promoCode || ''}" autocomplete="off" maxlength="20"
            style="text-transform:uppercase" />
          <button class="btn btn--dark" type="button" data-apply-promo>Apply</button>
        </div>
        <p class="field__hint" data-promo-feedback>
          ${evaluation
            ? evaluation.message
            : raw('Browse every code on the <a href="#/offers">offers page</a>.')}
        </p>
      </div>

      <div class="summary-line"><span>Item total</span><span>${currency(totals.subtotal)}</span></div>
      ${discount > 0
        ? raw(`<div class="summary-line summary-line--discount"><span>Coupon ${checkout.promoCode}</span><span>− ${currency(discount)}</span></div>`)
        : ''}
      <div class="summary-line"><span>GST (5%)</span><span>${currency(totals.tax)}</span></div>
      <div class="summary-line"><span>Packaging</span><span>${currency(totals.packagingFee)}</span></div>
      <div class="summary-line">
        <span>${checkout.deliveryType === 'pickup' ? 'Store pickup' : 'Delivery'}</span>
        <span>${totals.deliveryFee ? currency(totals.deliveryFee) : 'Free'}</span>
      </div>
      <div class="summary-line summary-line--total"><span>To pay</span><span>${currency(totals.total)}</span></div>

      ${totals.savings > 0
        ? raw(`<div class="savings-pill">You are saving ${currency(totals.savings)} on this order 🎉</div>`)
        : ''}

      <div class="stack" style="margin-top:var(--sp-4)">
        <a class="btn btn--primary btn--block btn--lg" href="#/checkout" data-checkout-cta>
          Choose a slot &amp; checkout
        </a>
        <a class="btn btn--secondary btn--block" href="#/menu">Add more items</a>
      </div>

      <p class="field__hint" style="margin-top:var(--sp-3)">
        A pickup or delivery slot is required before payment — that is how we keep the
        counter from being overwhelmed at 6 PM.
      </p>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Cart body                                                                  */
/* -------------------------------------------------------------------------- */

function stockWarnings() {
  const cart = getCart();
  const consumption = buildConsumption(getLocalOrders(), []);
  const { ok, problems } = validateCartStock(cart, menuById, consumption);
  if (ok) return '';

  return html`
    <div class="notice notice--warn" style="margin-bottom:var(--sp-4)">
      <span class="notice__icon" aria-hidden="true">⚠️</span>
      <div>
        <strong>Stock changed while you were shopping</strong>
        <ul style="margin:6px 0 0">
          ${raw(problems.map((problem) => `
            <li>${problem.line.name} — ${problem.available === 0 ? 'sold out for today' : `only ${problem.available} left`}</li>`).join(''))}
        </ul>
      </div>
    </div>`;
}

function cartBody() {
  const cart = getCart();
  const checkout = getCheckout();

  if (!cart.length) {
    return html`
      <div class="empty-state">
        <div class="empty-state__icon" aria-hidden="true">🛒</div>
        <h3>Nothing in the cart yet</h3>
        <p>The kadhai is hot and the jalebi is going in right now. Pick something delicious.</p>
        <div class="row" style="justify-content:center">
          <a class="btn btn--primary" href="#/menu">Browse the menu</a>
          <a class="btn btn--secondary" href="#/tracking">Track a past order</a>
        </div>
      </div>`;
  }

  return html`
    ${raw(stockWarnings())}

    <div class="row row--between" style="margin-bottom:var(--sp-4)">
      <div class="switch-group" role="group" aria-label="Choose delivery or pickup">
        <button type="button" data-delivery-type="delivery"
          aria-pressed="${checkout.deliveryType === 'delivery'}">🛵 Delivery</button>
        <button type="button" data-delivery-type="pickup"
          aria-pressed="${checkout.deliveryType === 'pickup'}">🏪 Store pickup</button>
      </div>
      <button class="btn btn--ghost btn--sm" type="button" data-clear-cart>Empty cart</button>
    </div>

    <div class="stack" data-cart-lines>${raw(cartLines(cart, menuById))}</div>`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default {
  title: 'Your cart',

  skeleton: () => html`
    <div class="page">
      <section class="page-head"><div class="container"><h1>Your cart</h1></div></section>
      <section class="section"><div class="container">${raw(skeletonRows(3))}</div></section>
    </div>`,

  async render() {
    const [{ byId }, codes, suggestions] = await Promise.all([
      getCatalog(),
      getPromoCodes(),
      getBestsellers(4),
    ]);

    menuById = byId;
    promos = codes;

    const cart = getCart();
    track(EVENTS.CART_VIEW, { items: cartCount(cart) });

    return html`
      <section class="page-head">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Cart</span>
          </nav>
          <h1>Your cart</h1>
          <p>${cart.length ? `${plural(cartCount(cart), 'item')} ready to go. Review, apply a coupon, then pick your slot.` : 'Your cart is waiting to be filled.'}</p>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container">
          <div class="split-layout">
            <div data-cart-body>${raw(cartBody())}</div>
            <div data-summary>${cart.length ? raw(summaryMarkup()) : ''}</div>
          </div>
        </div>
      </section>

      ${cart.length
        ? raw(`
          <section class="section">
            <div class="container">
              <div class="section-head">
                <div class="section-head__text">
                  <span class="eyebrow">Goes well with</span>
                  <h2>Add a little something</h2>
                </div>
              </div>
              <div data-suggestions>${productGrid(suggestions, { consumption: consumptionNow() })}</div>
            </div>
          </section>`)
        : ''}`;
  },

  mount(root) {
    const body = root.querySelector('[data-cart-body]');
    const summary = root.querySelector('[data-summary]');
    const suggestions = root.querySelector('[data-suggestions] [data-product-grid]');

    if (suggestions) attachProductGrid(suggestions, menuById);
    hydrateImages(root);

    const repaint = () => {
      const cart = getCart();
      body.innerHTML = cartBody();
      summary.innerHTML = cart.length ? summaryMarkup() : '';
      hydrateImages(body);
    };

    // Quantity steppers / remove buttons inside the cart list.
    body.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-cart-inc],[data-cart-dec],[data-cart-remove],[data-delivery-type],[data-clear-cart]');
      if (!target) return;

      const { setCartQty, removeFromCart } = await import('../store.js');

      if (target.dataset.deliveryType) {
        saveCheckout({ deliveryType: target.dataset.deliveryType });
        return;
      }

      if (target.dataset.clearCart !== undefined) {
        const confirmed = await confirmDialog({
          title: 'Empty the cart?',
          message: 'Every item will be removed. You can always add them again.',
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
        track(EVENTS.REMOVE_FROM_CART, { itemId: id });
        removeFromCart(id);
        return;
      }

      const line = getCart().find((entry) => entry.menuItemId === id);
      if (!line) return;
      setCartQty(id, line.qty + (target.dataset.cartInc !== undefined ? 1 : -1));
    });

    // Coupon box.
    summary.addEventListener('click', (event) => {
      if (!event.target.closest('[data-apply-promo]')) return;

      const input = summary.querySelector('#promo-input');
      const feedback = summary.querySelector('[data-promo-feedback]');
      const code = String(input.value || '').trim().toUpperCase();

      if (!code) {
        saveCheckout({ promoCode: '' });
        return;
      }

      const promo = promos.find((entry) => entry.code === code);
      const result = evaluatePromo(promo, { cart: getCart(), deliveryType: getCheckout().deliveryType });

      feedback.textContent = result.message;
      feedback.style.color = result.valid ? 'var(--green-600)' : 'var(--red-600)';

      if (result.valid) {
        saveCheckout({ promoCode: code });
        toast.success(result.message);
        track(EVENTS.PROMO_APPLIED, { code, discount: result.discount });
      } else {
        track(EVENTS.PROMO_REJECTED, { code });
      }
    });

    summary.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.id === 'promo-input') {
        event.preventDefault();
        summary.querySelector('[data-apply-promo]')?.click();
      }
    });

    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-checkout-cta]')) {
        track(EVENTS.CHECKOUT_START, { items: cartCount(), value: computeTotals().total });
      }
    });

    this._unsubscribe = subscribe((event) => {
      if (['cart', 'checkout', 'orders', 'reset'].includes(event.type)) repaint();
    });
  },

  unmount() {
    this._unsubscribe?.();
    this._unsubscribe = null;
  },
};
