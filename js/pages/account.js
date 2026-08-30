/**
 * pages/account.js — "My account" for a signed-in customer.
 *
 * Shows the profile, saved address and *only* this customer's orders. The list
 * re-renders whenever an order changes — including changes made in another tab
 * — so the professor can watch a status move live.
 */

import { html, raw, currency, maskPhone } from '../utils/format.js';
import { formatDateTime, relativeTime, toMs } from '../utils/date.js';
import { currentCustomer, updateCustomerProfile, logoutCustomer, ownedUserIds, touchSession } from '../auth.js';
import { getOrdersForUser, subscribe, clearCheckout } from '../store.js';
import { getOrders } from '../api.js';
import { getSlot } from '../utils/timeslots.js';
import { sanitizeText, validateEmail, validateAddress, validateForm, paintErrors } from '../utils/validators.js';
import { skeletonRows } from '../components/skeleton.js';
import { toast } from '../components/toast.js';

let historyOrders = [];

/* -------------------------------------------------------------------------- */
/* Order feed                                                                 */
/* -------------------------------------------------------------------------- */

/** This customer's orders: placed live in this browser + linked demo history. */
export function myOrders(customer = currentCustomer()) {
  if (!customer) return [];
  const ids = ownedUserIds(customer);

  const live = getOrdersForUser(ids);
  const past = historyOrders.filter((order) => ids.includes(order.userId));

  return [...live, ...past].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
}

const statusBadge = (status) =>
  status === 'Delivered' ? 'badge--success'
    : status === 'Cancelled' ? 'badge--danger'
      : status === 'Placed' ? 'badge--info' : 'badge--hot';

function orderRow(order) {
  const slot = getSlot(order.timeSlotId);
  const live = Boolean(order.isLocal);

  return html`
    <article class="order-card">
      <div class="order-card__head">
        <div>
          <span class="order-card__id">${order.id}</span>
          ${live ? raw('<span class="badge badge--hot" style="margin-left:6px">Live</span>') : ''}
          <div class="text-muted" style="font-size:var(--fs-xs)">
            ${formatDateTime(order.createdAt)} · ${relativeTime(order.createdAt)}
          </div>
        </div>
        <span class="badge ${statusBadge(order.status)}">${order.status}</span>
      </div>

      <p class="text-soft" style="font-size:var(--fs-sm);margin-bottom:var(--sp-2)">
        ${order.items.slice(0, 2).map((line) => `${line.qty} × ${line.name}`).join(', ')}${order.items.length > 2 ? ` +${order.items.length - 2} more` : ''}
      </p>

      ${order.preorderDate
        ? raw(`<p class="text-muted" style="font-size:var(--fs-xs);margin-bottom:var(--sp-3)">
            ${order.deliveryType === 'pickup' ? '🏪 Pickup' : '🛵 Delivery'} ·
            ${order.preorderDate}${slot ? ` · ${slot.label}` : ''}
          </p>`)
        : ''}

      <div class="row row--between">
        <b>${currency(order.total)}</b>
        <a class="btn btn--secondary btn--sm" href="#/tracking?id=${encodeURIComponent(order.id)}">
          Track order
        </a>
      </div>
    </article>`;
}

function ordersMarkup() {
  const orders = myOrders();

  if (!orders.length) {
    return html`
      <div class="empty-state">
        <div class="empty-state__icon" aria-hidden="true">🧾</div>
        <h3>No orders on your account yet</h3>
        <p>Once you place one it appears here instantly, with its live status.</p>
        <a class="btn btn--primary" href="#/menu">Browse the menu</a>
      </div>`;
  }

  const live = orders.filter((order) => order.isLocal).length;
  const spend = orders.reduce((sum, order) => sum + (order.status === 'Cancelled' ? 0 : order.total), 0);

  return html`
    <div class="kpi-grid" style="margin-bottom:var(--sp-5)">
      <div class="kpi-card">
        <div class="kpi-card__label">Orders</div>
        <div class="kpi-card__value">${orders.length}</div>
        <div class="kpi-card__meta">${live} placed in this browser</div>
      </div>
      <div class="kpi-card kpi-card--green">
        <div class="kpi-card__label">Lifetime spend</div>
        <div class="kpi-card__value">${currency(spend)}</div>
        <div class="kpi-card__meta">excludes cancelled orders</div>
      </div>
      <div class="kpi-card kpi-card--blue">
        <div class="kpi-card__label">In progress</div>
        <div class="kpi-card__value">
          ${orders.filter((o) => !['Delivered', 'Cancelled'].includes(o.status)).length}
        </div>
        <div class="kpi-card__meta">being prepared or on the way</div>
      </div>
    </div>

    <div class="grid grid--2">${raw(orders.slice(0, 12).map(orderRow).join(''))}</div>`;
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

function profileMarkup(customer) {
  return html`
    <form class="summary-card" id="profile-form" novalidate>
      <div class="row" style="gap:var(--sp-3);margin-bottom:var(--sp-4)">
        <span class="avatar" style="width:52px;height:52px;font-size:1rem" aria-hidden="true">${customer.initials}</span>
        <div style="min-width:0">
          <b style="display:block">${customer.name}</b>
          <span class="text-muted" style="font-size:var(--fs-xs)">${maskPhone(customer.phone)}</span>
        </div>
      </div>

      <div class="field" style="margin-bottom:var(--sp-3)">
        <label for="p-email">Email</label>
        <input class="input" id="p-email" name="email" type="email" maxlength="120" value="${customer.email}" />
        <span class="field__error" role="alert"></span>
      </div>

      <div class="field" style="margin-bottom:var(--sp-3)">
        <label for="p-addressLine">Saved address</label>
        <textarea class="textarea" id="p-addressLine" name="addressLine" maxlength="200"
          placeholder="Room 214, Aryabhatta Hostel Block A">${customer.addressLine || ''}</textarea>
        <span class="field__hint">Used to pre-fill checkout.</span>
        <span class="field__error" role="alert"></span>
      </div>

      <div class="field" style="margin-bottom:var(--sp-4)">
        <label for="p-area">Area / locality</label>
        <input class="input" id="p-area" name="area" maxlength="80" value="${customer.area || ''}" />
      </div>

      <button class="btn btn--dark btn--block" type="submit">Save details</button>

      <div class="divider-dashed"></div>

      <ul class="kv-list" style="margin-bottom:var(--sp-4)">
        <li><span>Account ID</span><b>${customer.id}</b></li>
        <li><span>Signed in</span><b>${relativeTime(customer.loginAt)}</b></li>
        <li><span>Session ends</span><b>${relativeTime(customer.expiresAt)}</b></li>
      </ul>

      <button class="btn btn--danger btn--block btn--sm" type="button" data-signout>Sign out</button>
    </form>`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default {
  title: 'My account',

  skeleton: () => html`
    <div class="page">
      <section class="page-head"><div class="container"><h1>My account</h1></div></section>
      <section class="section"><div class="container">${raw(skeletonRows(3))}</div></section>
    </div>`,

  async render(ctx) {
    const customer = currentCustomer();
    if (!customer) {
      ctx.navigate('/login', { replace: true, query: { next: 'account' } });
      return '';
    }
    touchSession('customer');

    // Only fetch the historical dataset when the account is linked to one.
    historyOrders = customer.linkedUserId ? await getOrders() : [];

    return html`
      <section class="page-head">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>My account</span>
          </nav>
          <h1>Hello, ${customer.name.split(' ')[0]}</h1>
          <p>Everything below belongs to your account only. Nobody else can see it.</p>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container">
          <div class="split-layout">
            <div>
              <div class="section-head">
                <div class="section-head__text">
                  <span class="eyebrow">Your orders</span>
                  <h2>Order history &amp; live status</h2>
                </div>
                <a class="btn btn--secondary btn--sm" href="#/tracking">Open tracking</a>
              </div>
              <div data-my-orders>${raw(ordersMarkup())}</div>
            </div>

            <div data-profile>${raw(profileMarkup(customer))}</div>
          </div>
        </div>
      </section>`;
  },

  mount(root, ctx) {
    const ordersHost = root.querySelector('[data-my-orders]');
    const form = root.querySelector('#profile-form');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {
        email: sanitizeText(form.querySelector('#p-email').value, 120),
        addressLine: sanitizeText(form.querySelector('#p-addressLine').value, 200),
        area: sanitizeText(form.querySelector('#p-area').value, 80),
      };

      const { valid, errors } = validateForm(values, {
        email: (value) => validateEmail(value, { required: true }),
        addressLine: (value) => validateAddress(value, { required: false }),
      });

      if (!valid) {
        paintErrors(form, errors);
        toast.error('Please check the highlighted fields.');
        return;
      }

      updateCustomerProfile(values);
      toast.success('Details saved');
    });

    form.querySelector('[data-signout]')?.addEventListener('click', () => {
      logoutCustomer();
      clearCheckout();
      toast.info('Signed out');
      ctx.navigate('/home', { replace: true });
    });

    // Live: repaint whenever an order changes here *or in another tab*.
    this._unsubscribe = subscribe((event) => {
      if (event.type !== 'orders' && event.type !== 'reset') return;
      if (!currentCustomer()) {
        ctx.navigate('/login', { replace: true, query: { next: 'account' } });
        return;
      }
      ordersHost.innerHTML = ordersMarkup();
    });
  },

  unmount() {
    this._unsubscribe?.();
    this._unsubscribe = null;
  },
};
