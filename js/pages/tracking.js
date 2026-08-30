/**
 * pages/tracking.js — order tracking.
 *
 * Look up any order id: the ones you place in this browser *and* the 1,000+
 * simulated orders in data/orders.json. Live orders advance automatically
 * (one stage every 45 seconds) so the flow can be demonstrated end to end
 * without waiting for a real kitchen.
 */

import { html, raw, currency, plural, maskPhone } from '../utils/format.js';
import { formatDateTime, formatDateShort, relativeTime, toMs, formatTime } from '../utils/date.js';
import { getOrders } from '../api.js';
import { getLocalOrders, getOrdersForUser, updateOrderStatus, subscribe, getPrefs } from '../store.js';
import { currentCustomer, currentAdmin, ownedUserIds } from '../auth.js';
import { getSlot } from '../utils/timeslots.js';
import { skeletonRows } from '../components/skeleton.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { track, EVENTS } from '../analytics.js';

/** One stage every 45 seconds keeps a live demo watchable. */
const STAGE_MS = 45_000;

const FLOW_DELIVERY = ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'];
const FLOW_PICKUP = ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Delivered'];

const STAGE_COPY = {
  'Placed': { icon: '📝', note: 'We have your order and your slot is locked.' },
  'Confirmed': { icon: '✅', note: 'The counter accepted it and added it to the tray list.' },
  'Preparing': { icon: '🍳', note: 'Being made fresh right now.' },
  'Ready': { icon: '📦', note: 'Packed and waiting at the pickup counter.' },
  'Out for Delivery': { icon: '🛵', note: 'On the way to you.' },
  'Delivered': { icon: '🎉', note: 'Handed over. Enjoy!' },
  'Cancelled': { icon: '✖️', note: 'This order was cancelled.' },
};

let seeded = [];
let timer = null;

const flowFor = (order) => (order.deliveryType === 'pickup' ? FLOW_PICKUP : FLOW_DELIVERY);

/* -------------------------------------------------------------------------- */
/* Simulation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Moves a locally placed order along its flow based on elapsed time.
 *
 * Only runs when the owner has switched on "auto-advance" from the dashboard.
 * By default the counter drives every status change, which is what really
 * happens in a shop.
 */
function advanceIfDue(order, now = Date.now()) {
  if (!getPrefs().autoAdvance) return order;
  if (!order?.isLocal || order.status === 'Delivered' || order.status === 'Cancelled') return order;

  const flow = flowFor(order);
  const current = Math.max(0, flow.indexOf(order.status));
  const due = Math.min(flow.length - 1, Math.floor((now - toMs(order.createdAt)) / STAGE_MS));

  let updated = order;
  for (let index = current + 1; index <= due; index += 1) {
    updated = updateOrderStatus(order.id, flow[index], new Date(toMs(order.createdAt) + index * STAGE_MS).toISOString()) || updated;
  }
  return updated;
}

/* -------------------------------------------------------------------------- */
/* Markup                                                                     */
/* -------------------------------------------------------------------------- */

function timelineMarkup(order) {
  const flow = flowFor(order);
  const cancelled = order.status === 'Cancelled';
  const history = new Map((order.statusHistory || []).map((entry) => [entry.status, entry.at]));
  const currentIndex = cancelled ? -1 : flow.indexOf(order.status);

  const stages = cancelled
    ? [...flow.slice(0, Math.max(1, flow.indexOf('Confirmed'))), 'Cancelled']
    : flow;

  return html`
    <ol class="timeline">
      ${raw(stages.map((stage, index) => {
        const done = !cancelled && index < currentIndex;
        const current = !cancelled && index === currentIndex;
        const isCancelStage = stage === 'Cancelled';
        const at = history.get(stage);
        const copy = STAGE_COPY[stage] || { icon: '•', note: '' };

        const cls = isCancelStage ? 'is-cancelled' : done ? 'is-done' : current ? 'is-current' : '';

        return `
          <li class="${cls}">
            <span class="timeline__dot" aria-hidden="true">${done || isCancelStage ? '✓' : copy.icon}</span>
            <b>${stage}</b>
            <span>${at ? `${formatDateTime(at)} · ${relativeTime(at)}` : copy.note}</span>
          </li>`;
      }).join(''))}
    </ol>`;
}

function orderView(order) {
  const flow = flowFor(order);
  const index = Math.max(0, flow.indexOf(order.status));
  const progress = order.status === 'Cancelled' ? 100 : ((index + 1) / flow.length) * 100;
  const slot = getSlot(order.timeSlotId);
  const canCancel = order.isLocal && ['Placed', 'Confirmed'].includes(order.status);
  const autoAdvance = getPrefs().autoAdvance;

  const promiseNote = order.completedAt
    ? order.onTime
      ? '<span class="badge badge--success">Delivered on time</span>'
      : '<span class="badge badge--warn">Delivered late</span>'
    : `<span class="badge badge--info">Promised by ${formatTime(order.promisedAt)}</span>`;

  return html`
    <div class="split-layout">
      <div class="panel">
        <div class="panel__head">
          <div>
            <span class="order-card__id">${order.id}</span>
            <div class="text-muted" style="font-size:var(--fs-xs)">
              Placed ${formatDateTime(order.createdAt)} · ${relativeTime(order.createdAt)}
            </div>
          </div>
          <div class="row" style="gap:var(--sp-2)">
            ${raw(promiseNote)}
            ${order.isFestivalOrder ? raw('<span class="badge badge--festival">Festival order</span>') : ''}
          </div>
        </div>

        <div class="track-progress" role="progressbar" aria-valuenow="${Math.round(progress)}"
          aria-valuemin="0" aria-valuemax="100" aria-label="Order progress">
          <div class="track-progress__bar" style="width:${progress.toFixed(0)}%"></div>
        </div>

        ${raw(timelineMarkup(order))}

        ${order.isLocal
          ? raw(`
            <div class="divider-dashed"></div>
            <div class="row no-print">
              ${canCancel ? '<button class="btn btn--danger btn--sm" type="button" data-cancel>Cancel order</button>' : ''}
              <span class="pill-note">
                <span class="pulse-dot" aria-hidden="true"></span>
                ${autoAdvance
                  ? 'Auto-advance is on — status moves every 45 seconds'
                  : 'The counter updates this as your order moves'}
              </span>
            </div>`)
          : raw(`
            <div class="divider-dashed"></div>
            <p class="field__hint mb-0">
              This is a completed order from your history, shown read-only.
            </p>`)}
      </div>

      <div class="summary-card">
        <h3>Order details</h3>

        <ul class="kv-list" style="margin-bottom:var(--sp-4)">
          <li><span>Customer</span><b>${order.customerName || '—'}</b></li>
          <li><span>Phone</span><b>${maskPhone(order.phone)}</b></li>
          <li><span>Method</span><b>${order.deliveryType === 'pickup' ? 'Store pickup' : 'Home delivery'}</b></li>
          <li><span>${order.deliveryType === 'pickup' ? 'Collect from' : 'Deliver to'}</span><b>${order.address || '—'}</b></li>
          ${order.preorderDate
            ? raw(`<li><span>Window</span><b>${formatDateShort(`${order.preorderDate}T12:00:00+05:30`)}${slot ? `, ${slot.label}` : ''}</b></li>`)
            : ''}
          <li><span>Payment</span><b>${order.paymentMethod} · ${order.paymentStatus}</b></li>
          ${order.notes ? raw(`<li><span>Notes</span><b>${order.notes}</b></li>`) : ''}
        </ul>

        <h4>${plural(order.itemCount || order.items.length, 'item')}</h4>
        <ul class="kv-list">
          ${raw(order.items.map((line) => `
            <li><span>${line.qty} × ${line.name}</span><b>${currency(line.lineTotal ?? line.qty * line.unitPrice)}</b></li>`).join(''))}
        </ul>

        <div class="divider-dashed"></div>
        <div class="summary-line"><span>Item total</span><span>${currency(order.subtotal)}</span></div>
        ${order.discount > 0
          ? raw(`<div class="summary-line summary-line--discount"><span>${order.promoCode || 'Discount'}</span><span>− ${currency(order.discount)}</span></div>`)
          : ''}
        <div class="summary-line"><span>GST</span><span>${currency(order.tax)}</span></div>
        <div class="summary-line summary-line--total"><span>Total</span><span>${currency(order.total)}</span></div>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Visibility rules                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Orders the current viewer is allowed to see.
 *
 * A signed-in customer ALWAYS wins, even if a staff session also exists in this
 * browser — otherwise "only my orders" would quietly stop being true the moment
 * someone opened the dashboard in another tab. Staff get shop-wide visibility
 * only when no customer is signed in; from the dashboard they use the built-in
 * order viewer instead.
 */
function visibleOrders() {
  const customer = currentCustomer();

  if (customer) {
    const ids = ownedUserIds(customer);
    const mine = getOrdersForUser(ids);
    const past = seeded.filter((order) => ids.includes(order.userId));
    return [...mine, ...past];
  }

  if (currentAdmin()) return [...getLocalOrders(), ...seeded];

  return [];
}

/** The viewer's own orders, newest first (used for the cards at the bottom). */
function myRecentOrders() {
  return [...visibleOrders()].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
}

function recentMarkup() {
  const orders = myRecentOrders();

  if (!orders.length) {
    return html`
      <div class="notice notice--info">
        <span class="notice__icon" aria-hidden="true">💡</span>
        <div>
          <strong>No orders on your account yet</strong>
          <p>Place one and it will appear here with a live status timeline.</p>
        </div>
      </div>`;
  }

  return html`
    <div class="grid grid--2">
      ${raw(orders.slice(0, 6).map((order) => `
        <article class="order-card">
          <div class="order-card__head">
            <div>
              <span class="order-card__id">${order.id}</span>
              ${order.isLocal ? '<span class="badge badge--hot" style="margin-left:6px">Live</span>' : ''}
              <div class="text-muted" style="font-size:var(--fs-xs)">${relativeTime(order.createdAt)}</div>
            </div>
            <span class="badge ${order.status === 'Delivered' ? 'badge--success' : order.status === 'Cancelled' ? 'badge--danger' : 'badge--hot'}">${order.status}</span>
          </div>
          <p class="text-soft" style="font-size:var(--fs-sm);margin-bottom:var(--sp-3)">
            ${order.items.slice(0, 2).map((line) => `${line.qty} × ${line.name}`).join(', ')}${order.items.length > 2 ? ` +${order.items.length - 2} more` : ''}
          </p>
          <div class="row row--between">
            <b>${currency(order.total)}</b>
            <button class="btn btn--secondary btn--sm" type="button" data-open-order="${order.id}">Track</button>
          </div>
        </article>`).join(''))}
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Lookup                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Finds an order **within what the viewer is allowed to see**. Guessing another
 * customer's order id gets you nothing.
 */
function findOrder(id) {
  const needle = String(id || '').trim().toUpperCase();
  if (!needle) return null;

  const match = visibleOrders().find((order) => order.id.toUpperCase() === needle);
  if (!match) return null;

  return match.isLocal ? advanceIfDue(match) : match;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default {
  title: 'Track order',

  skeleton: () => html`
    <div class="page">
      <section class="page-head"><div class="container"><h1>Track your order</h1></div></section>
      <section class="section"><div class="container">${raw(skeletonRows(2))}</div></section>
    </div>`,

  async render(ctx) {
    seeded = await getOrders();

    const customer = currentCustomer();
    const admin = currentAdmin();

    // Orders belong to people. No account, nothing to show.
    if (!customer && !admin) {
      return html`
        <section class="page-head">
          <div class="container">
            <nav class="breadcrumb" aria-label="Breadcrumb">
              <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Track order</span>
            </nav>
            <h1>Track your order</h1>
            <p>Your orders are private to your account.</p>
          </div>
        </section>

        <section class="section section--tight">
          <div class="container container--narrow">
            <div class="empty-state">
              <div class="empty-state__icon" aria-hidden="true">🔐</div>
              <h3>Sign in to see your orders</h3>
              <p>
                We keep every order tied to the account that placed it, so only you can
                follow it from the counter to your hand.
              </p>
              <div class="row" style="justify-content:center">
                <a class="btn btn--primary" href="#/login?next=tracking">Sign in</a>
                <a class="btn btn--secondary" href="#/login?mode=signup">Create an account</a>
              </div>
            </div>
          </div>
        </section>`;
    }

    const requested = ctx.query.id || '';
    const fallback = myRecentOrders()[0];
    const order = requested
      ? findOrder(requested)
      : fallback
        ? (fallback.isLocal ? advanceIfDue(fallback) : fallback)
        : null;

    if (requested) track(EVENTS.ORDER_TRACKED, { found: Boolean(order) });

    return html`
      <section class="page-head">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Track order</span>
          </nav>
          <h1>Track your order</h1>
          <p>
            ${admin && !customer
              ? 'Signed in as staff — you can look up any order in the shop.'
              : `Signed in as ${customer.name}. Only your own orders are visible here.`}
          </p>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container">
          <form class="panel" id="track-form" style="margin-bottom:var(--sp-5)" novalidate>
            <div class="row" style="gap:var(--sp-3);flex-wrap:nowrap;align-items:flex-end">
              <div class="field" style="flex:1">
                <label for="track-id">Order ID</label>
                <input class="input" id="track-id" name="id" placeholder="MS-20260829-K3M9QZ"
                  value="${requested}" autocomplete="off" maxlength="40" />
                <span class="field__error" role="alert"></span>
              </div>
              <button class="btn btn--primary" type="submit">Track</button>
            </div>
          </form>

          <div data-track-result>
            ${order
              ? raw(orderView(order))
              : requested
                ? raw(`
                  <div class="empty-state">
                    <div class="empty-state__icon" aria-hidden="true">🔍</div>
                    <h3>No order with that ID on your account</h3>
                    <p>Check the ID on your receipt — it looks like MS-20260829-K3M9QZ.
                       Orders belonging to other customers are never shown here.</p>
                  </div>`)
                : raw(`
                  <div class="empty-state">
                    <div class="empty-state__icon" aria-hidden="true">📦</div>
                    <h3>Nothing to track yet</h3>
                    <p>Place an order and its live timeline will appear right here.</p>
                    <a class="btn btn--primary" href="#/menu">Browse the menu</a>
                  </div>`)}
          </div>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container">
          <div class="section-head">
            <div class="section-head__text">
              <span class="eyebrow">Your account</span>
              <h2>Your recent orders</h2>
            </div>
            <a class="btn btn--secondary btn--sm" href="#/account">Account &amp; history</a>
          </div>
          <div data-recent>${raw(recentMarkup())}</div>
        </div>
      </section>`;
  },

  mount(root, ctx) {
    const form = root.querySelector('#track-form');
    const result = root.querySelector('[data-track-result]');
    const recent = root.querySelector('[data-recent]');
    if (!form || !result) return; // signed-out wall

    let activeId = ctx.query.id || myRecentOrders()[0]?.id || '';

    const show = (id) => {
      activeId = id;
      const order = findOrder(id);
      if (!order) {
        result.innerHTML = html`
          <div class="empty-state">
            <div class="empty-state__icon" aria-hidden="true">🔍</div>
            <h3>No order with that ID on your account</h3>
            <p>Check the ID on your receipt — it looks like MS-20260829-K3M9QZ.
               Orders belonging to other customers are never shown here.</p>
          </div>`;
        return;
      }
      result.innerHTML = orderView(order);
      ctx.setQuery({ id: order.id });
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = form.querySelector('#track-id').value.trim();
      if (!value) {
        toast.error('Enter an order ID first.');
        return;
      }
      track(EVENTS.ORDER_TRACKED, { manual: true });
      show(value);
    });

    root.addEventListener('click', async (event) => {
      const openButton = event.target.closest('[data-open-order]');
      if (openButton) {
        form.querySelector('#track-id').value = openButton.dataset.openOrder;
        show(openButton.dataset.openOrder);
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (event.target.closest('[data-cancel]')) {
        const order = findOrder(activeId);
        if (!order) return;
        const confirmed = await confirmDialog({
          title: `Cancel ${order.id}?`,
          message: 'The kitchen will release your slot back to other customers. This cannot be undone.',
          confirmLabel: 'Cancel the order',
          cancelLabel: 'Keep it',
          danger: true,
        });
        if (!confirmed) return;
        updateOrderStatus(order.id, 'Cancelled');
        toast.info('Order cancelled and the slot released.');
        show(order.id);
      }
    });

    // Live ticking: advance the shown order and refresh relative timestamps.
    clearInterval(timer);
    timer = setInterval(() => {
      if (!activeId) return;
      const before = findOrder(activeId);
      const status = before?.status;
      const after = advanceIfDue(before);
      if (after && after.status !== status) show(activeId);
    }, 5000);

    this._unsubscribe = subscribe((event) => {
      if (event.type !== 'orders' && event.type !== 'reset') return;
      if (recent) recent.innerHTML = recentMarkup();
      // A status changed here or in the admin tab — refresh what is on screen.
      if (activeId && findOrder(activeId)) show(activeId);
    });
  },

  unmount() {
    clearInterval(timer);
    timer = null;
    this._unsubscribe?.();
    this._unsubscribe = null;
  },
};
