/**
 * pages/payment.js — simulated payment + the receipt.
 *
 * No gateway is contacted and no card data is ever stored or transmitted:
 * the inputs are validated locally (Luhn, expiry, CVV length) and discarded
 * the moment the simulated transaction resolves.
 */

import { html, raw, currency, plural, maskPhone } from '../utils/format.js';
import { formatDateShort, formatDateTime, slotTimeToMs, formatClock } from '../utils/date.js';
import {
  getCart, getCheckout, computeTotals, evaluatePromo, clearCart, clearCheckout,
  saveOrder, saveProfile, getLocalOrders, cartCount,
} from '../store.js';
import { currentCustomer } from '../auth.js';
import { getPromoCodes, getFestivals } from '../api.js';
import { getSlot, festivalDayKeys } from '../utils/timeslots.js';
import { orderId, transactionId } from '../utils/uuid.js';
import {
  validateUpiId, validateCardNumber, validateCardExpiry, validateCvv, validateForm, paintErrors,
} from '../utils/validators.js';
import { toast } from '../components/toast.js';
import { track, EVENTS, trackPaymentSuccess } from '../analytics.js';

const METHODS = [
  { id: 'UPI', icon: '📱', label: 'UPI', hint: 'GPay, PhonePe, Paytm, BHIM — instant and free' },
  { id: 'Card', icon: '💳', label: 'Credit / debit card', hint: 'Visa, Mastercard, RuPay' },
  { id: 'Wallet', icon: '👛', label: 'Wallet', hint: 'Paytm, Amazon Pay, Mobikwik' },
  { id: 'NetBanking', icon: '🏦', label: 'Net banking', hint: 'All major Indian banks' },
  { id: 'COD', icon: '💵', label: 'Cash on hand-over', hint: 'Pay the rider or at the counter' },
];

const WALLETS = ['Paytm Wallet', 'Amazon Pay', 'Mobikwik', 'Freecharge'];
const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Bank of Baroda', 'Punjab National Bank'];

let promos = [];
let festivalKeys = new Set();
let selected = 'UPI';

/* -------------------------------------------------------------------------- */
/* Method-specific fields                                                     */
/* -------------------------------------------------------------------------- */

function methodFields(method) {
  if (method === 'UPI') {
    return html`
      <div class="form-grid">
        <div class="field field--full">
          <label for="f-upiId">Your UPI ID</label>
          <input class="input" id="f-upiId" name="upiId" placeholder="ananya@okhdfcbank" autocomplete="off" maxlength="60" />
          <span class="field__hint">Simulated — nothing is sent to a bank.</span>
          <span class="field__error" role="alert"></span>
        </div>
      </div>`;
  }

  if (method === 'Card') {
    return html`
      <div class="form-grid">
        <div class="field field--full">
          <label for="f-cardNumber">Card number</label>
          <input class="input" id="f-cardNumber" name="cardNumber" inputmode="numeric"
            placeholder="4111 1111 1111 1111" autocomplete="off" maxlength="19" />
          <span class="field__hint">Use any test number that passes the Luhn check.</span>
          <span class="field__error" role="alert"></span>
        </div>
        <div class="field">
          <label for="f-cardExpiry">Expiry (MM/YY)</label>
          <input class="input" id="f-cardExpiry" name="cardExpiry" placeholder="09/28" autocomplete="off" maxlength="5" />
          <span class="field__error" role="alert"></span>
        </div>
        <div class="field">
          <label for="f-cvv">CVV</label>
          <input class="input" id="f-cvv" name="cvv" type="password" inputmode="numeric"
            placeholder="•••" autocomplete="off" maxlength="4" />
          <span class="field__error" role="alert"></span>
        </div>
      </div>`;
  }

  if (method === 'Wallet') {
    return html`
      <div class="field">
        <label for="f-wallet">Choose a wallet</label>
        <select class="select" id="f-wallet" name="wallet">
          ${raw(WALLETS.map((wallet) => `<option>${wallet}</option>`).join(''))}
        </select>
      </div>`;
  }

  if (method === 'NetBanking') {
    return html`
      <div class="field">
        <label for="f-bank">Choose your bank</label>
        <select class="select" id="f-bank" name="bank">
          ${raw(BANKS.map((bank) => `<option>${bank}</option>`).join(''))}
        </select>
      </div>`;
  }

  return html`
    <div class="notice notice--info">
      <span class="notice__icon" aria-hidden="true">ℹ️</span>
      <div>
        <strong>Keep the exact amount ready</strong>
        <p>Our riders and counter staff carry limited change during festival week.</p>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Order building                                                             */
/* -------------------------------------------------------------------------- */

function buildOrder(method) {
  const cart = getCart();
  const checkout = getCheckout();
  const account = currentCustomer();
  const promo = promos.find((entry) => entry.code === checkout.promoCode);
  const evaluation = promo ? evaluatePromo(promo, { cart, deliveryType: checkout.deliveryType }) : null;
  const discount = evaluation?.valid ? evaluation.discount : 0;
  const totals = computeTotals({ cart, discount, deliveryType: checkout.deliveryType });

  const slot = getSlot(checkout.timeSlotId);
  const now = new Date();
  // The promise is the end of the booked window — that is what we measure
  // "on-time %" against on the dashboard.
  const promisedMs = slot ? slotTimeToMs(checkout.preorderDate, slot.end) : now.getTime() + 45 * 60000;

  const isFestivalOrder =
    festivalKeys.has(checkout.preorderDate) || cart.some((line) => line.isFestivalSpecial);

  return {
    id: orderId(checkout.preorderDate),
    // The account that placed it. This is what scopes "my orders" and what the
    // dashboard groups by.
    userId: account?.id || 'GUEST',
    accountName: account?.name || null,
    customerName: checkout.name,
    phone: checkout.phone,
    email: checkout.email || account?.email || null,
    items: cart.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      category: line.category,
      qty: line.qty,
      unitPrice: line.price,
      lineTotal: line.qty * line.price,
    })),
    itemCount: cartCount(cart),
    subtotal: totals.subtotal,
    discount: totals.discount,
    promoCode: evaluation?.valid ? checkout.promoCode : null,
    packagingFee: totals.packagingFee,
    deliveryFee: totals.deliveryFee,
    tax: totals.tax,
    total: totals.total,
    paymentMethod: method,
    paymentStatus: method === 'COD' ? 'Pending (cash)' : 'Paid',
    transactionRef: transactionId(method),
    status: 'Placed',
    statusHistory: [{ status: 'Placed', at: now.toISOString() }],
    channel: 'web',
    deliveryType: checkout.deliveryType,
    address: checkout.deliveryType === 'pickup' ? 'Store pickup — Rajwada Main Branch' : checkout.address,
    landmark: checkout.landmark || null,
    area: checkout.landmark || checkout.address?.slice(0, 40) || 'Indore',
    notes: checkout.notes || '',
    giftWrap: Boolean(checkout.giftWrap),
    contactless: Boolean(checkout.contactless),
    preorderDate: checkout.preorderDate,
    timeSlotId: checkout.timeSlotId,
    slotLabel: slot?.label || '',
    isFestivalOrder,
    festivalName: null,
    promisedAt: new Date(promisedMs).toISOString(),
    completedAt: null,
    onTime: null,
    rating: null,
    isLocal: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

function selectView() {
  const cart = getCart();
  const checkout = getCheckout();
  const promo = promos.find((entry) => entry.code === checkout.promoCode);
  const evaluation = promo ? evaluatePromo(promo, { cart, deliveryType: checkout.deliveryType }) : null;
  const totals = computeTotals({
    cart,
    discount: evaluation?.valid ? evaluation.discount : 0,
    deliveryType: checkout.deliveryType,
  });
  const slot = getSlot(checkout.timeSlotId);

  return html`
    <section class="page-head">
      <div class="container">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="#/order">Cart</a> <span aria-hidden="true">›</span>
          <a href="#/checkout">Checkout</a> <span aria-hidden="true">›</span>
          <strong>Payment</strong>
        </nav>
        <h1>Choose how you would like to pay</h1>
        <p>
          Every payment on this site is simulated for the college demo — no gateway is
          contacted and no card details are stored.
        </p>
      </div>
    </section>

    <section class="section section--tight">
      <div class="container">
        <div class="split-layout">
          <form id="payment-form" novalidate>
            <div class="panel" style="margin-bottom:var(--sp-5)">
              <div class="panel__head">
                <h3>Payment method</h3>
                <span>${plural(cartCount(cart), 'item')} · ${currency(totals.total)}</span>
              </div>

              <div class="pay-methods" role="radiogroup" aria-label="Payment method">
                ${raw(METHODS.map((method) => `
                  <label class="pay-method ${selected === method.id ? 'is-selected' : ''}" data-method="${method.id}">
                    <input type="radio" name="paymentMethod" value="${method.id}"
                      ${selected === method.id ? 'checked' : ''} />
                    <span class="pay-method__icon" aria-hidden="true">${method.icon}</span>
                    <span class="pay-method__body">
                      <b>${method.label}</b>
                      <span>${method.hint}</span>
                    </span>
                  </label>`).join(''))}
              </div>

              <div class="divider-dashed"></div>
              <div data-method-fields>${raw(methodFields(selected))}</div>

              <label class="checkbox-row" style="margin-top:var(--sp-4)">
                <input type="checkbox" name="simulateFailure" />
                <span>Simulate a failed transaction (useful when demonstrating retries)</span>
              </label>
            </div>
          </form>

          <div>
            <div class="summary-card">
              <h3>Paying now</h3>

              <div class="notice notice--success" style="margin-bottom:var(--sp-4)">
                <span class="notice__icon" aria-hidden="true">🕒</span>
                <div>
                  <strong>${checkout.deliveryType === 'pickup' ? 'Pickup' : 'Delivery'} window</strong>
                  <p>${checkout.preorderDate ? formatDateShort(`${checkout.preorderDate}T12:00:00+05:30`) : '—'}
                     · ${slot ? `${formatClock(slot.start)} – ${formatClock(slot.end)}` : '—'}</p>
                </div>
              </div>

              <div class="summary-line"><span>Item total</span><span>${currency(totals.subtotal)}</span></div>
              ${totals.discount > 0
                ? raw(`<div class="summary-line summary-line--discount"><span>${checkout.promoCode}</span><span>− ${currency(totals.discount)}</span></div>`)
                : ''}
              <div class="summary-line"><span>GST (5%)</span><span>${currency(totals.tax)}</span></div>
              <div class="summary-line"><span>Packaging</span><span>${currency(totals.packagingFee)}</span></div>
              <div class="summary-line"><span>Delivery</span><span>${totals.deliveryFee ? currency(totals.deliveryFee) : 'Free'}</span></div>
              <div class="summary-line summary-line--total"><span>Total</span><span>${currency(totals.total)}</span></div>

              <button class="btn btn--primary btn--block btn--lg" type="submit" form="payment-form"
                style="margin-top:var(--sp-4)">
                Pay ${currency(totals.total)}
              </button>
              <a class="btn btn--ghost btn--block btn--sm" href="#/checkout" style="margin-top:var(--sp-2)">
                Change slot or details
              </a>

              <p class="field__hint" style="margin-top:var(--sp-3)">
                🔒 Simulated secure checkout. Card fields are validated locally and never stored.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

function processingView(method) {
  return html`
    <section class="section">
      <div class="container container--narrow">
        <div class="panel processing">
          <div class="spinner" role="status" aria-label="Processing payment"></div>
          <h2 style="margin:0">Talking to ${method === 'COD' ? 'the kitchen' : 'your bank'}…</h2>
          <p class="text-soft mb-0">Please do not refresh or close this tab.</p>
          <div class="track-progress" style="width:min(320px,80vw)">
            <div class="track-progress__bar" style="width:12%" data-pay-progress></div>
          </div>
        </div>
      </div>
    </section>`;
}

function receiptView(order) {
  const slot = getSlot(order.timeSlotId);

  return html`
    <section class="section">
      <div class="container">
        <div class="receipt">
          <div class="receipt__top">
            <div class="receipt__tick" aria-hidden="true">✓</div>
            <h2>Order confirmed</h2>
            <p>${order.paymentMethod === 'COD'
              ? 'Pay when you collect — we have blocked your slot.'
              : `Payment successful via ${order.paymentMethod}.`}</p>
          </div>

          <div class="receipt__body">
            <div class="receipt__id">
              <div>
                <span class="text-muted" style="font-size:var(--fs-xs)">Order ID</span>
                <b style="display:block">${order.id}</b>
              </div>
              <button class="btn btn--secondary btn--sm no-print" type="button" data-copy-id>Copy</button>
            </div>

            <ul class="kv-list" style="margin-bottom:var(--sp-4)">
              <li><span>Placed</span><b>${formatDateTime(order.createdAt)}</b></li>
              <li><span>${order.deliveryType === 'pickup' ? 'Pickup window' : 'Delivery window'}</span>
                <b>${formatDateShort(`${order.preorderDate}T12:00:00+05:30`)}, ${slot ? `${formatClock(slot.start)} – ${formatClock(slot.end)}` : '—'}</b></li>
              <li><span>Name</span><b>${order.customerName}</b></li>
              <li><span>Phone</span><b>${maskPhone(order.phone)}</b></li>
              <li><span>${order.deliveryType === 'pickup' ? 'Collect from' : 'Deliver to'}</span><b>${order.address}</b></li>
              ${order.notes ? raw(`<li><span>Notes</span><b>${order.notes}</b></li>`) : ''}
              <li><span>Payment</span><b>${order.paymentMethod} · ${order.paymentStatus}</b></li>
              <li><span>Reference</span><b>${order.transactionRef}</b></li>
            </ul>

            <div class="receipt__perf" style="padding-top:var(--sp-4)">
              <h4>Items</h4>
              <ul class="kv-list">
                ${raw(order.items.map((line) => `
                  <li><span>${line.qty} × ${line.name}</span><b>${currency(line.lineTotal)}</b></li>`).join(''))}
              </ul>

              <div class="divider-dashed"></div>
              <div class="summary-line"><span>Item total</span><span>${currency(order.subtotal)}</span></div>
              ${order.discount > 0
                ? raw(`<div class="summary-line summary-line--discount"><span>${order.promoCode}</span><span>− ${currency(order.discount)}</span></div>`)
                : ''}
              <div class="summary-line"><span>GST (5%)</span><span>${currency(order.tax)}</span></div>
              <div class="summary-line"><span>Packaging</span><span>${currency(order.packagingFee)}</span></div>
              <div class="summary-line"><span>Delivery</span><span>${order.deliveryFee ? currency(order.deliveryFee) : 'Free'}</span></div>
              <div class="summary-line summary-line--total"><span>Paid</span><span>${currency(order.total)}</span></div>
            </div>

            <div class="row no-print" style="margin-top:var(--sp-5)">
              <a class="btn btn--primary" href="#/tracking?id=${encodeURIComponent(order.id)}">Track this order</a>
              <button class="btn btn--secondary" type="button" data-print>Print receipt</button>
              <a class="btn btn--ghost" href="#/menu">Order something else</a>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

function failedView(reason) {
  return html`
    <section class="section">
      <div class="container container--narrow">
        <div class="panel" style="text-align:center">
          <div class="empty-state__icon" style="margin-inline:auto" aria-hidden="true">💳</div>
          <h2>Payment did not go through</h2>
          <p class="text-soft">${reason}</p>
          <div class="row" style="justify-content:center">
            <button class="btn btn--primary" type="button" data-retry>Try again</button>
            <a class="btn btn--secondary" href="#/checkout">Change details</a>
          </div>
          <p class="field__hint" style="margin-top:var(--sp-4)">
            Your cart and your slot are still reserved.
          </p>
        </div>
      </div>
    </section>`;
}

function emptyView() {
  const recent = getLocalOrders()[0];
  return html`
    <section class="section">
      <div class="container">
        <div class="empty-state">
          <div class="empty-state__icon" aria-hidden="true">🧾</div>
          <h3>There is nothing to pay for right now</h3>
          <p>Your cart is empty. ${recent ? 'Your most recent order is below.' : 'Add a few items and pick a slot first.'}</p>
          <div class="row" style="justify-content:center">
            <a class="btn btn--primary" href="#/menu">Browse the menu</a>
            ${recent ? raw(`<a class="btn btn--secondary" href="#/tracking?id=${encodeURIComponent(recent.id)}">Track last order</a>`) : ''}
          </div>
        </div>
      </div>
    </section>`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default {
  title: 'Payment',

  async render() {
    [promos, festivalKeys] = await Promise.all([
      getPromoCodes(),
      getFestivals().then((festivals) => festivalDayKeys(festivals)),
    ]);

    if (!getCart().length) return emptyView();

    const checkout = getCheckout();
    if (!checkout.timeSlotId || !checkout.preorderDate) {
      toast.info('Pick a hand-over window before paying.');
      location.hash = '#/checkout';
      return emptyView();
    }

    return selectView();
  },

  mount(root, ctx) {
    const form = root.querySelector('#payment-form');
    if (!form) return;

    const fields = root.querySelector('[data-method-fields]');

    form.addEventListener('change', (event) => {
      if (event.target.name !== 'paymentMethod') return;
      selected = event.target.value;
      fields.innerHTML = methodFields(selected);
      form.querySelectorAll('.pay-method').forEach((label) => {
        label.classList.toggle('is-selected', label.dataset.method === selected);
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(form).entries());
      const rules = {
        UPI: { upiId: validateUpiId },
        Card: { cardNumber: validateCardNumber, cardExpiry: validateCardExpiry, cvv: validateCvv },
      }[selected] || {};

      const { valid, errors } = validateForm(data, rules);
      if (!valid) {
        paintErrors(form, errors);
        toast.error('Please check the payment details.');
        return;
      }

      track(EVENTS.PAYMENT_START, { method: selected, value: computeTotals().total });

      const shouldFail = Boolean(data.simulateFailure);

      root.innerHTML = processingView(selected);
      animateProgress(root);

      await wait(1500 + Math.random() * 900);

      if (shouldFail) {
        track(EVENTS.PAYMENT_FAILED, { method: selected });
        root.innerHTML = failedView(
          'The bank declined the simulated transaction. Nothing was charged and your slot is still held.'
        );
        root.querySelector('[data-retry]')?.addEventListener('click', () => ctx.navigate('/payment'));
        return;
      }

      // ---- Success: persist the order, clear the cart, show the receipt ----
      const order = buildOrder(selected);
      saveOrder(order);

      const checkout = getCheckout();
      saveProfile({
        name: checkout.name,
        phone: checkout.phone,
        email: checkout.email,
        address: checkout.address,
      });

      clearCart();
      clearCheckout();
      trackPaymentSuccess(order);

      root.innerHTML = receiptView(order);
      wireReceipt(root);
      toast.success(`Order ${order.id} confirmed`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  },
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function animateProgress(root) {
  const bar = root.querySelector('[data-pay-progress]');
  if (!bar) return;
  let width = 12;
  const timer = setInterval(() => {
    width = Math.min(96, width + 8 + Math.random() * 12);
    bar.style.width = `${width}%`;
    if (width >= 96) clearInterval(timer);
  }, 180);
}

function wireReceipt(root) {
  root.querySelector('[data-print]')?.addEventListener('click', () => window.print());

  root.querySelector('[data-copy-id]')?.addEventListener('click', async (event) => {
    const id = event.target.closest('.receipt__id')?.querySelector('b')?.textContent?.trim();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Order ID copied');
    } catch {
      toast.info(`Your order ID is ${id}`);
    }
  });
}
