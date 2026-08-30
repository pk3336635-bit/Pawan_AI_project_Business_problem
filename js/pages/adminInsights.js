/**
 * pages/adminInsights.js — the owner / manager dashboard.
 *
 * Reads data/orders.json + data/menu.json + every order and analytics event
 * stored in this browser, then recomputes each KPI live. Nothing is pre-baked.
 *
 * It also listens for changes made in *other tabs*, so during a demo the
 * professor can watch a customer place an order in one window and see this
 * dashboard update by itself in another.
 */

import { html, raw, currency, compactCurrency, number, percent, plural } from '../utils/format.js';
import {
  formatDate, formatDateTime, formatTime, formatDateShort, relativeTime, keyToMs, toMs, dateKey, nextDays,
} from '../utils/date.js';
import { getCatalog, getOffers, getAllOrders, datasetNow, CATEGORY_META } from '../api.js';
import {
  getLocalOrders, getEvents, resetAll, subscribe, updateOrderStatus, getPrefs, savePrefs,
} from '../store.js';
import { currentAdmin, isAdmin, touchSession, logoutAdmin, getCustomers } from '../auth.js';
import { hasLiveChannel } from '../sync.js';
import { buildDashboard } from '../kpi.js';
import { consumptionNow } from '../components/productCard.js';
import { restockList } from '../utils/inventory.js';
import { bookingIndex, festivalDayKeys, buildSlotBoard, getSlot } from '../utils/timeslots.js';
import { barChart, lineChart, donutChart, rankedBars, heatmap, PALETTE } from '../components/charts.js';
import { skeletonKpis, skeletonPanel } from '../components/skeleton.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';

let dashboard = null;
let menuList = [];
/** The merged dataset + live orders behind the current render. */
let allOrders = [];
/** Which date the owner is inspecting on the slot board (survives live refreshes). */
let slotBoardDate = dateKey(Date.now());
/** Festival day keys, cached from offers.json for the slot board. */
let festivalKeys = new Set();

/** Order ids we have already announced, so a status change is not a "new order". */
let seenOrderIds = new Set();

/* -------------------------------------------------------------------------- */
/* Small building blocks                                                      */
/* -------------------------------------------------------------------------- */

function kpiCard({ label, value, meta, tone = '', icon = '' }) {
  return html`
    <div class="kpi-card ${tone ? `kpi-card--${tone}` : ''}">
      <div class="kpi-card__label">${icon ? raw(`<span aria-hidden="true">${icon}</span>`) : ''} ${label}</div>
      <div class="kpi-card__value">${value}</div>
      ${meta ? raw(`<div class="kpi-card__meta">${meta}</div>`) : ''}
    </div>`;
}

function panel(title, body, { note = '', id = '' } = {}) {
  return html`
    <div class="panel" ${id ? raw(`id="${id}"`) : ''}>
      <div class="panel__head">
        <h3>${title}</h3>
        ${note ? raw(`<span>${note}</span>`) : ''}
      </div>
      ${raw(body)}
    </div>`;
}

const trendBadge = (value) => {
  const up = value >= 0;
  return `<span class="badge ${up ? 'badge--success' : 'badge--danger'}">${up ? '▲' : '▼'} ${Math.abs(value).toFixed(1)}% vs previous week</span>`;
};

/* -------------------------------------------------------------------------- */
/* Live order feed (orders placed by signed-in customers, right now)          */
/* -------------------------------------------------------------------------- */

function liveFeedMarkup() {
  const orders = [...getLocalOrders()].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

  if (!orders.length) {
    return html`
      <div class="notice notice--info">
        <span class="notice__icon" aria-hidden="true">📡</span>
        <div>
          <strong>Waiting for the first live order</strong>
          <p>Sign in as a customer in another tab and place an order — it lands here within a
             second, and every KPI below updates with it.</p>
        </div>
      </div>`;
  }

  const badge = (status) =>
    status === 'Delivered' ? 'badge--success'
      : status === 'Cancelled' ? 'badge--danger'
        : status === 'Placed' ? 'badge--info' : 'badge--hot';

  return html`
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Order ID</th><th>Account</th><th>Placed</th>
            <th class="num">Total</th><th>Slot</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${raw(orders.slice(0, 10).map((order) => `
            <tr>
              <td style="font-variant-numeric:tabular-nums">${order.id}</td>
              <td>${order.accountName || order.customerName || '—'}
                <div class="text-muted" style="font-size:var(--fs-xs)">${order.userId}</div></td>
              <td>${formatTime(order.createdAt)}
                <div class="text-muted" style="font-size:var(--fs-xs)">${relativeTime(order.createdAt)}</div></td>
              <td class="num">${currency(order.total)}</td>
              <td>${order.preorderDate || '—'}<div class="text-muted" style="font-size:var(--fs-xs)">${order.slotLabel || ''}</div></td>
              <td><span class="badge ${badge(order.status)}">${order.status}</span></td>
              <td><button class="btn btn--ghost btn--sm" type="button" data-view-order="${order.id}">View</button></td>
            </tr>`).join(''))}
        </tbody>
      </table>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Staff order viewer                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Staff see order detail *here*, inside the dashboard, rather than on the
 * customer tracking page — that page is deliberately scoped to whoever is
 * signed in as a customer.
 */
function openOrderViewer(order) {
  const history = (order.statusHistory || [])
    .map((entry) => `
      <li class="is-done">
        <span class="timeline__dot" aria-hidden="true">✓</span>
        <b>${entry.status}</b>
        <span>${formatDateTime(entry.at)}</span>
      </li>`)
    .join('');

  openModal({
    title: `Order ${order.id}`,
    wide: true,
    body: html`
      <div class="grid grid--2" style="gap:var(--sp-5);align-items:start">
        <div>
          <h4>Status history</h4>
          ${history ? raw(`<ol class="timeline">${history}</ol>`) : raw('<p class="text-muted">No status history.</p>')}
        </div>

        <div>
          <ul class="kv-list" style="margin-bottom:var(--sp-4)">
            <li><span>Account</span><b>${order.accountName || order.customerName || '—'}</b></li>
            <li><span>Account id</span><b>${order.userId}</b></li>
            <li><span>Status</span><b>${order.status}</b></li>
            <li><span>Placed</span><b>${formatDateTime(order.createdAt)}</b></li>
            <li><span>Promised by</span><b>${order.promisedAt ? formatDateTime(order.promisedAt) : '—'}</b></li>
            <li><span>Hand-over</span><b>${order.deliveryType === 'pickup' ? 'Store pickup' : 'Delivery'}</b></li>
            <li><span>Window</span><b>${order.preorderDate || '—'} ${order.slotLabel || order.timeSlotId || ''}</b></li>
            <li><span>Payment</span><b>${order.paymentMethod} · ${order.paymentStatus}</b></li>
            ${order.notes ? raw(`<li><span>Notes</span><b>${order.notes}</b></li>`) : ''}
          </ul>

          <h4>Items</h4>
          <ul class="kv-list">
            ${raw((order.items || []).map((line) => `
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
      </div>`,
    footer: '<button class="btn btn--dark" type="button" data-modal-close data-autofocus>Close</button>',
  });
}

/* -------------------------------------------------------------------------- */
/* Tab: Overview                                                              */
/* -------------------------------------------------------------------------- */

function overviewTab(d) {
  const liveOrders = getLocalOrders();
  const accounts = getCustomers();

  const cards = [
    kpiCard({
      label: 'Live orders', icon: '📡', tone: 'green',
      value: number(liveOrders.length),
      meta: liveOrders.length
        ? `${currency(liveOrders.filter((o) => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0))} placed by signed-in customers`
        : 'none placed in this browser yet',
    }),
    kpiCard({
      label: 'Registered accounts', icon: '👤', tone: 'blue',
      value: number(accounts.length),
      meta: `${number(accounts.filter((a) => !a.seeded).length)} signed up during the demo`,
    }),
    kpiCard({
      label: 'Total revenue', icon: '💰', tone: '',
      value: compactCurrency(d.revenue.totalRevenue),
      meta: `${plural(d.revenue.totalOrders, 'order')} · ${currency(d.revenue.totalRevenue)}`,
    }),
    kpiCard({
      label: 'Revenue · last 7 days', icon: '📈', tone: 'green',
      value: compactCurrency(d.revenue.revenue7),
      meta: trendBadge(d.revenue.revenueTrend),
    }),
    kpiCard({
      label: 'Total orders', icon: '🧾', tone: 'blue',
      value: number(d.revenue.totalOrders),
      meta: `${number(d.revenue.orders7)} in the last 7 days`,
    }),
    kpiCard({
      label: 'Average order value', icon: '🪙', tone: 'brown',
      value: currency(d.revenue.avgOrderValue),
      meta: `${number(d.revenue.itemsSold)} items sold in total`,
    }),
    kpiCard({
      label: 'Cancellation rate', icon: '✖️', tone: 'red',
      value: percent(d.revenue.cancellationRate),
      meta: `${number(d.revenue.cancelledOrders)} cancelled orders`,
    }),
    kpiCard({
      label: 'Unique customers', icon: '👥', tone: 'blue',
      value: number(d.customers.uniqueCustomers),
      meta: `${percent(d.customers.repeatRate)} ordered more than once`,
    }),
    kpiCard({
      label: 'Discounts given', icon: '🏷️', tone: 'brown',
      value: compactCurrency(d.revenue.totalDiscount),
      meta: `${percent((d.revenue.totalDiscount / (d.revenue.totalRevenue || 1)) * 100)} of revenue`,
    }),
    kpiCard({
      label: 'GST collected', icon: '🏛️', tone: '',
      value: compactCurrency(d.revenue.totalTax),
      meta: 'Charged at 5% on the discounted value',
    }),
  ];

  return html`
    <div style="margin-bottom:var(--sp-5)">
      ${raw(panel('Live order feed',
        liveFeedMarkup(),
        { note: hasLiveChannel() ? 'Updates instantly across every open tab' : 'Updates when another tab writes an order' }))}
    </div>

    <div class="kpi-grid">${raw(cards.join(''))}</div>

    <div style="margin-top:var(--sp-5)">
      ${raw(panel('Revenue over the last 30 days',
        lineChart({
          data: d.daily.map((day) => ({ label: day.label, value: day.revenue })),
          caption: 'Daily revenue for the last 30 days',
          format: compactCurrency,
        }),
        { note: `Peak day: ${d.peak.best ? `${d.peak.best.label} · ${currency(d.peak.best.revenue)}` : '—'}` }))}
    </div>

    <div class="panel-grid" style="margin-top:var(--sp-4)">
      ${raw(panel('Payment method split',
        donutChart({
          data: d.payments.map((entry, i) => ({ ...entry, color: PALETTE[i % PALETTE.length] })),
          centerValue: number(d.revenue.totalOrders),
          centerLabel: 'orders',
        })))}

      ${raw(panel('Order status distribution',
        rankedBars(
          d.statuses.map((entry) => ({
            label: entry.label,
            value: entry.value,
            color: entry.label === 'Cancelled' ? 'var(--red-500)' : entry.label === 'Delivered' ? 'var(--green-500)' : undefined,
          })),
          { showRank: false }
        )))}

      ${raw(panel('Orders by category',
        donutChart({
          data: d.categories.map((entry, i) => ({ label: entry.label, value: entry.revenue, color: PALETTE[i % PALETTE.length] })),
          centerValue: String(d.categories.length),
          centerLabel: 'counters',
        }),
        { note: 'by revenue' }))}

      ${raw(panel('Pickup vs delivery',
        donutChart({
          data: d.fulfilment.map((entry, i) => ({ ...entry, color: i === 0 ? PALETTE[1] : PALETTE[0] })),
          centerValue: percent(d.slots.preorderShare, 0),
          centerLabel: 'booked a slot',
        })))}
    </div>

    <div style="margin-top:var(--sp-4)">
      ${raw(panel('Peak order hours',
        heatmap({
          matrix: d.hours.matrix,
          rowLabels: d.hours.rowLabels,
          colLabels: d.hours.colLabels,
        }) + `<div style="margin-top:var(--sp-4)">${barChart({
          data: d.hours.hourSeries,
          color: PALETTE[0],
          caption: 'Orders by hour of day',
          height: 190,
        })}</div>`,
        { note: `Busiest hour: ${String(d.hours.busiestHour).padStart(2, '0')}:00 with ${number(d.hours.busiestHourOrders)} orders` }))}
    </div>

    <div style="margin-top:var(--sp-4)">
      ${raw(panel('Conversion funnel (this browser)',
        funnelMarkup(d),
        { note: `Menu view → payment success: ${percent(d.conversion)}` }))}
    </div>`;
}

function funnelMarkup(d) {
  const hasData = d.funnel.some((stage) => stage.sessions > 0);

  if (!hasData) {
    return html`
      <div class="notice notice--info">
        <span class="notice__icon" aria-hidden="true">💡</span>
        <div>
          <strong>No events recorded yet in this browser</strong>
          <p>Browse the menu, add something to the cart and complete a payment — the funnel
             fills up live from the events stored in localStorage.</p>
        </div>
      </div>`;
  }

  return html`
    <div class="funnel">
      ${raw(d.funnel.map((stage) => `
        <div class="funnel__step">
          <span>${stage.label}</span>
          <span class="funnel__bar">
            <span class="funnel__fill" style="width:${stage.shareOfTop.toFixed(1)}%"></span>
          </span>
          <span><strong>${number(stage.sessions)}</strong>
            <span class="text-muted">· ${percent(stage.stepConversion, 0)}</span></span>
        </div>`).join(''))}
    </div>
    <p class="field__hint" style="margin-top:var(--sp-3)">
      Counted by unique browsing session so a page refresh does not inflate the rate.
    </p>`;
}

/* -------------------------------------------------------------------------- */
/* Tab: Orders & kitchen — where the owner actually runs the counter          */
/* -------------------------------------------------------------------------- */

const FLOW_DELIVERY = ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'];
const FLOW_PICKUP = ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Delivered'];

const flowFor = (order) => (order.deliveryType === 'pickup' ? FLOW_PICKUP : FLOW_DELIVERY);

/** The label on the button that moves an order to its next stage. */
const NEXT_ACTION = {
  'Placed': 'Confirm order',
  'Confirmed': 'Start preparing',
  'Preparing': 'Mark ready',
  'Ready': 'Send out',
  'Out for Delivery': 'Mark delivered',
};

const STATUS_TONE = {
  'Placed': 'badge--info',
  'Confirmed': 'badge--hot',
  'Preparing': 'badge--warn',
  'Ready': 'badge--success',
  'Out for Delivery': 'badge--hot',
  'Delivered': 'badge--success',
  'Cancelled': 'badge--danger',
};

/** The next status in this order's flow, or null when it is finished. */
function nextStatus(order) {
  const flow = flowFor(order);
  const index = flow.indexOf(order.status);
  if (index === -1 || index >= flow.length - 1) return null;
  return flow[index + 1];
}

function queueRow(order) {
  const next = nextStatus(order);
  const slot = getSlot(order.timeSlotId);
  const late = order.promisedAt && toMs(order.promisedAt) < Date.now();

  return html`
    <article class="order-card" data-queue-order="${order.id}">
      <div class="order-card__head">
        <div style="min-width:0">
          <span class="order-card__id">${order.id}</span>
          <div class="text-muted" style="font-size:var(--fs-xs)">
            ${order.accountName || order.customerName || '—'} ·
            placed ${relativeTime(order.createdAt)}
          </div>
        </div>
        <div class="row" style="gap:6px">
          ${late && !['Delivered', 'Cancelled'].includes(order.status)
            ? raw('<span class="badge badge--danger">Past promise</span>')
            : ''}
          <span class="badge ${STATUS_TONE[order.status] || 'badge--muted'}">${order.status}</span>
        </div>
      </div>

      <p class="text-soft" style="font-size:var(--fs-sm);margin-bottom:var(--sp-2)">
        ${order.items.map((line) => `${line.qty} × ${line.name}`).join(', ')}
      </p>

      <ul class="kv-list" style="margin-bottom:var(--sp-3)">
        <li><span>Hand-over</span>
          <b>${order.deliveryType === 'pickup' ? '🏪 Pickup' : '🛵 Delivery'} ·
             ${order.preorderDate || '—'}${slot ? `, ${slot.label}` : ''}</b></li>
        <li><span>Promised by</span><b>${order.promisedAt ? formatTime(order.promisedAt) : '—'}</b></li>
        <li><span>Value</span><b>${currency(order.total)}</b></li>
      </ul>

      <div class="row row--between">
        <button class="btn btn--ghost btn--sm" type="button" data-view-order="${order.id}">Details</button>
        <div class="row" style="gap:var(--sp-2)">
          ${['Placed', 'Confirmed'].includes(order.status)
            ? raw(`<button class="btn btn--danger btn--sm" type="button" data-cancel-order="${order.id}">Cancel</button>`)
            : ''}
          ${next
            ? raw(`<button class="btn btn--primary btn--sm" type="button"
                data-advance-order="${order.id}" data-next-status="${next}">${NEXT_ACTION[order.status] || `Move to ${next}`}</button>`)
            : ''}
        </div>
      </div>
    </article>`;
}

/** The live slot board: how full each hand-over window is on a chosen date. */
function slotBoardMarkup(orders) {
  const bookings = bookingIndex(orders);
  const board = buildSlotBoard({
    key: slotBoardDate,
    bookings,
    festivalKeys,
    now: Date.now(),
  });

  const days = nextDays(Date.now(), 7);
  const booked = board.reduce((sum, slot) => sum + slot.booked, 0);
  const capacity = board.reduce((sum, slot) => sum + slot.capacity, 0);

  const cards = board.map((slot) => {
    const tone =
      slot.status === 'full' ? 'full'
        : slot.utilisation > 0.75 ? 'high'
          : slot.utilisation > 0.4 ? 'mid' : '';

    const badge = {
      full: '<span class="badge badge--danger">Full</span>',
      closed: '<span class="badge badge--muted">Closed</span>',
      filling: `<span class="badge badge--warn">${slot.remaining} left</span>`,
      open: `<span class="badge badge--success">${slot.remaining} free</span>`,
    }[slot.status];

    return `
      <div class="slot-card" style="cursor:default">
        <span class="slot-card__time">${slot.startLabel} – ${slot.endLabel}</span>
        <span class="slot-card__meta">${badge}<span><b>${slot.booked}</b>/${slot.capacity}</span></span>
        <span class="capacity-bar">
          <span class="capacity-bar__fill ${tone ? `capacity-bar__fill--${tone}` : ''}"
            style="width:${(slot.utilisation * 100).toFixed(0)}%"></span>
        </span>
      </div>`;
  });

  return html`
    <div class="date-scroller" role="group" aria-label="Choose a date to inspect">
      ${raw(days.map((day) => `
        <button class="date-pill ${festivalKeys.has(day.key) ? 'date-pill--festival' : ''}" type="button"
          data-slot-date="${day.key}" aria-pressed="${day.key === slotBoardDate}">
          <small>${day.isToday ? 'Today' : day.dayShort}</small>
          <b>${day.dayNum}</b>
          <i>${day.month}${festivalKeys.has(day.key) ? ' 🎊' : ''}</i>
        </button>`).join(''))}
    </div>

    <div class="row row--between" style="margin-block:var(--sp-4) var(--sp-3)">
      <span class="pill-note">
        ${formatDateShort(keyToMs(slotBoardDate))} · <b>${booked}</b> of ${capacity} places booked
        (${percent(capacity ? (booked / capacity) * 100 : 0, 0)})
      </span>
      <span class="pill-note">
        ${board.filter((s) => s.status === 'full').length} full ·
        ${board.filter((s) => s.bookable).length} still open
      </span>
    </div>

    <div class="slot-grid">${raw(cards.join(''))}</div>`;
}

function ordersTab(orders) {
  const live = getLocalOrders();
  const active = live
    .filter((order) => !['Delivered', 'Cancelled'].includes(order.status))
    .sort((a, b) => toMs(a.promisedAt || a.createdAt) - toMs(b.promisedAt || b.createdAt));

  const done = live
    .filter((order) => ['Delivered', 'Cancelled'].includes(order.status))
    .sort((a, b) => toMs(b.updatedAt || b.createdAt) - toMs(a.updatedAt || a.createdAt));

  const countBy = (status) => live.filter((order) => order.status === status).length;
  const autoAdvance = getPrefs().autoAdvance;

  const cards = [
    kpiCard({ label: 'In the queue', icon: '👨‍🍳', tone: 'green', value: number(active.length), meta: 'not yet handed over' }),
    kpiCard({ label: 'Awaiting confirmation', icon: '🔔', tone: 'red', value: number(countBy('Placed')), meta: 'needs your action' }),
    kpiCard({ label: 'Preparing', icon: '🍳', tone: 'brown', value: number(countBy('Preparing')), meta: 'on the fire' }),
    kpiCard({ label: 'Ready to hand over', icon: '📦', tone: 'blue', value: number(countBy('Ready')), meta: 'waiting at the counter' }),
  ];

  return html`
    <div class="notice notice--info" style="margin-bottom:var(--sp-4)">
      <span class="notice__icon" aria-hidden="true">👨‍🍳</span>
      <div>
        <strong>You are running the counter</strong>
        <p>
          Move each order along as it happens — Confirm → Preparing → Ready → Delivered.
          The customer's tracking page updates instantly, and every KPI on this dashboard
          is recomputed from the new statuses.
        </p>
      </div>
    </div>

    <div class="kpi-grid">${raw(cards.join(''))}</div>

    <div style="margin-top:var(--sp-5)">
      ${raw(panel('Kitchen queue',
        active.length
          ? `<div class="grid grid--2">${active.map(queueRow).join('')}</div>`
          : `<div class="empty-state" style="padding-block:var(--sp-6)">
               <div class="empty-state__icon" aria-hidden="true">✅</div>
               <h3>Nothing waiting</h3>
               <p>Every live order has been handed over. New ones appear here the moment a
                  customer pays.</p>
             </div>`,
        { note: `${plural(active.length, 'order')} to work through` }))}
    </div>

    <div style="margin-top:var(--sp-4)">
      ${raw(panel('Live slot board',
        slotBoardMarkup(orders),
        { note: 'Bookings close 45 minutes before a window starts' }))}
    </div>

    <div style="margin-top:var(--sp-4)">
      ${raw(panel('Handed over &amp; cancelled',
        done.length
          ? `<div class="table-scroll"><table class="data-table">
              <thead><tr><th>Order ID</th><th>Customer</th><th>Finished</th><th class="num">Total</th><th>On time</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${done.slice(0, 10).map((order) => `
                  <tr>
                    <td style="font-variant-numeric:tabular-nums">${order.id}</td>
                    <td>${order.accountName || order.customerName || '—'}</td>
                    <td>${relativeTime(order.updatedAt || order.createdAt)}</td>
                    <td class="num">${currency(order.total)}</td>
                    <td>${order.status === 'Cancelled'
                      ? '<span class="text-muted">—</span>'
                      : order.onTime
                        ? '<span class="badge badge--success">Yes</span>'
                        : '<span class="badge badge--warn">Late</span>'}</td>
                    <td><span class="badge ${STATUS_TONE[order.status]}">${order.status}</span></td>
                    <td><button class="btn btn--ghost btn--sm" type="button" data-view-order="${order.id}">Details</button></td>
                  </tr>`).join('')}
              </tbody></table></div>`
          : '<p class="text-muted mb-0">No completed live orders yet.</p>'))}
    </div>

    <div class="panel" style="margin-top:var(--sp-4)">
      <div class="panel__head">
        <h3>Simulation settings</h3>
        <span>For unattended demos</span>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" data-auto-advance ${autoAdvance ? raw('checked') : ''} />
        <span>
          <b>Auto-advance orders every 45 seconds</b>
          <span style="display:block;font-size:var(--fs-xs);color:var(--ink-muted)">
            Leave this off to move orders yourself, which is what a real counter does.
            Turn it on if you want the timeline to play out on its own.
          </span>
        </span>
      </label>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Tab: Products & customers                                                  */
/* -------------------------------------------------------------------------- */

function productsTab(d) {
  const consumption = consumptionNow();
  const restock = restockList(menuList, consumption, 10);

  return html`
    <div class="panel-grid">
      ${raw(panel('Top 10 selling items · by quantity',
        rankedBars(d.topByQty.map((item) => ({ label: item.name, value: item.qty })), { format: number })))}

      ${raw(panel('Top 10 selling items · by revenue',
        rankedBars(
          d.topByRevenue.map((item) => ({ label: item.name, value: item.revenue, color: 'linear-gradient(90deg,var(--green-500),var(--green-700))' })),
          { format: compactCurrency }
        )))}
    </div>

    <div style="margin-top:var(--sp-4)">
      ${raw(panel('Revenue by counter',
        barChart({
          data: d.categories.map((entry) => ({ label: entry.label.split(' ')[0], value: entry.revenue })),
          color: PALETTE[5],
          format: compactCurrency,
          caption: 'Revenue by category',
        }),
        { note: `${number(d.performance.length)} distinct items have been ordered at least once` }))}
    </div>

    <div class="panel-grid" style="margin-top:var(--sp-4)">
      ${raw(panel('Restock list · lowest stock first',
        restock.length
          ? `<div class="table-scroll"><table class="data-table">
              <thead><tr><th>Item</th><th>Counter</th><th class="num">Left</th><th>Status</th></tr></thead>
              <tbody>
                ${restock.map(({ item, state }) => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.categoryName}</td>
                    <td class="num">${state.remaining}</td>
                    <td><span class="badge ${state.badgeClass}">${state.label}</span></td>
                  </tr>`).join('')}
              </tbody></table></div>`
          : '<p class="text-muted mb-0">Everything is comfortably in stock.</p>',
        { note: `${number(d.stock.outNow)} sold out · ${number(d.stock.lowNow)} running low` }))}

      ${raw(panel('Best customers',
        `<div class="table-scroll"><table class="data-table">
          <thead><tr><th>Customer</th><th class="num">Orders</th><th class="num">Spend</th></tr></thead>
          <tbody>
            ${d.customers.top.map((customer) => `
              <tr>
                <td>${customer.name || customer.id}</td>
                <td class="num">${number(customer.orders)}</td>
                <td class="num">${currency(customer.revenue)}</td>
              </tr>`).join('')}
          </tbody></table></div>`,
        { note: `Average lifetime spend ${currency(d.customers.revenuePerCustomer)}` }))}
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Tab: Festival & operations (Goal 2)                                        */
/* -------------------------------------------------------------------------- */

function operationsTab(d) {
  const cards = [
    kpiCard({
      label: 'Slot utilisation', icon: '🕒', tone: 'blue',
      value: percent(d.slots.overallUtilisation),
      meta: `Next 7 days · ${number(d.slots.fullSlots)} windows already full`,
    }),
    kpiCard({
      label: 'On-time orders', icon: '⏱️', tone: 'green',
      value: percent(d.punctuality.overall.rate),
      meta: `${number(d.punctuality.overall.onTime)} of ${number(d.punctuality.overall.total)} completed orders`,
    }),
    kpiCard({
      label: 'Stockout rate', icon: '📦', tone: 'red',
      value: percent(d.stock.stockoutRate),
      meta: `${number(d.stock.outNow)} of ${number(d.stock.total)} items unavailable right now`,
    }),
    kpiCard({
      label: 'Peak-day revenue', icon: '🔥', tone: '',
      value: d.peak.best ? compactCurrency(d.peak.best.revenue) : '—',
      meta: d.peak.best ? `${d.peak.best.label} · ${plural(d.peak.best.orders, 'order')}` : '',
    }),
    kpiCard({
      label: 'Festival revenue share', icon: '🎊', tone: 'brown',
      value: percent(d.festival.revenueShare),
      meta: `${compactCurrency(d.festival.revenue)} from ${plural(d.festival.orders, 'festival order')}`,
    }),
    kpiCard({
      label: 'Orders with a booked slot', icon: '📅', tone: 'green',
      value: percent(d.slots.preorderShare),
      meta: `${number(d.slots.preorderCount)} preorders in the dataset`,
    }),
    kpiCard({
      label: 'On-time during festivals', icon: '⚠️', tone: 'red',
      value: percent(d.punctuality.festival.rate),
      meta: `vs ${percent(d.punctuality.regular.rate)} on normal days`,
    }),
    kpiCard({
      label: 'Average fulfilment time', icon: '🍳', tone: 'brown',
      value: `${Math.round(d.punctuality.avgFulfilmentMins)} min`,
      meta: `Late orders run ${Math.round(d.punctuality.overall.avgDelayMins)} min over promise`,
    }),
  ];

  return html`
    <div class="notice notice--info" style="margin-bottom:var(--sp-4)">
      <span class="notice__icon" aria-hidden="true">🎯</span>
      <div>
        <strong>Goal 2 — festival rush &amp; preorder slotting</strong>
        <p>These are the numbers the shop owner watches during Diwali and Rakhi week:
           can we fill our slots, keep our promises, and stay in stock?</p>
      </div>
    </div>

    <div class="kpi-grid">${raw(cards.join(''))}</div>

    <div style="margin-top:var(--sp-5)">
      ${raw(panel('Slot utilisation by window',
        rankedBars(
          d.slots.bySlot.map((slot) => ({
            label: slot.label,
            value: Math.round(slot.utilisation),
            color: slot.utilisation >= 90 ? 'var(--red-500)' : slot.utilisation >= 70 ? 'var(--orange-500)' : 'var(--green-500)',
          })),
          { format: (value) => `${value}%`, showRank: false }
        ),
        { note: d.slots.busiestSlot ? `Busiest window: ${d.slots.busiestSlot.label}` : '' }))}
    </div>

    <div style="margin-top:var(--sp-4)">
      ${raw(panel('Booked vs available capacity · next 7 days',
        barChart({
          data: d.slots.upcoming.map((day) => ({ label: day.label, value: Math.round(day.utilisation) })),
          color: PALETTE[3],
          format: (value) => `${value}%`,
          height: 200,
          caption: 'Slot utilisation percentage per upcoming day',
        }) + `<div class="table-scroll" style="margin-top:var(--sp-4)"><table class="data-table">
          <thead><tr><th>Date</th><th class="num">Booked</th><th class="num">Capacity</th><th class="num">Utilisation</th><th class="num">Full windows</th></tr></thead>
          <tbody>
            ${d.slots.upcoming.map((day) => `
              <tr>
                <td>${formatDate(keyToMs(day.key))} ${day.isFestival ? '<span class="badge badge--festival">Festival</span>' : ''}</td>
                <td class="num">${number(day.booked)}</td>
                <td class="num">${number(day.capacity)}</td>
                <td class="num">${percent(day.utilisation, 0)}</td>
                <td class="num">${number(day.fullSlots)}</td>
              </tr>`).join('')}
          </tbody></table></div>`))}
    </div>

    <div class="panel-grid" style="margin-top:var(--sp-4)">
      ${raw(panel('Top festival items',
        d.festival.topItems.length
          ? rankedBars(d.festival.topItems.map((item) => ({ label: item.label, value: item.qty })), { format: number })
          : '<p class="text-muted mb-0">No festival orders in range.</p>',
        { note: `Average festival order ${currency(d.festival.avgOrderValue)}` }))}

      ${raw(panel('Revenue by festival',
        d.festival.byFestival.length
          ? rankedBars(
              d.festival.byFestival.map((entry) => ({ label: entry.label, value: entry.revenue })),
              { format: compactCurrency }
            )
          : '<p class="text-muted mb-0">No festival orders in range.</p>'))}
    </div>

    <div style="margin-top:var(--sp-4)">
      ${raw(panel('Top revenue days',
        `<div class="table-scroll"><table class="data-table">
          <thead><tr><th>Date</th><th class="num">Orders</th><th class="num">Revenue</th><th>Occasion</th></tr></thead>
          <tbody>
            ${d.peak.top5.map((day) => `
              <tr>
                <td>${day.label}</td>
                <td class="num">${number(day.orders)}</td>
                <td class="num">${currency(day.revenue)}</td>
                <td>${day.festivalName ? `<span class="badge badge--festival">${day.festivalName}</span>` : '<span class="text-muted">Regular day</span>'}</td>
              </tr>`).join('')}
          </tbody></table></div>`))}
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Recent orders (handy for demoing the tracking page)                        */
/* -------------------------------------------------------------------------- */

function recentOrdersPanel(orders) {
  // Live orders always sit on top: a simulated order placed at 8 PM must never
  // push the order a customer just paid for below the fold.
  const recent = [...orders]
    .sort((a, b) => {
      const liveDiff = Number(Boolean(b.isLocal)) - Number(Boolean(a.isLocal));
      if (liveDiff !== 0) return liveDiff;
      return toMs(b.createdAt) - toMs(a.createdAt);
    })
    .slice(0, 12);

  return panel('Latest orders',
    `<div class="table-scroll"><table class="data-table">
      <thead><tr>
        <th>Order ID</th><th>Placed</th><th>Customer</th>
        <th class="num">Items</th><th class="num">Total</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>
        ${recent.map((order) => `
          <tr>
            <td style="font-variant-numeric:tabular-nums">${order.id}
              ${order.isLocal ? '<span class="badge badge--hot">Live</span>' : ''}</td>
            <td>${formatDateTime(order.createdAt)}</td>
            <td>${order.accountName || order.customerName || '—'}</td>
            <td class="num">${number(order.itemCount || order.items.length)}</td>
            <td class="num">${currency(order.total)}</td>
            <td><span class="badge ${order.status === 'Delivered' ? 'badge--success' : order.status === 'Cancelled' ? 'badge--danger' : 'badge--hot'}">${order.status}</span></td>
            <td><button class="btn btn--ghost btn--sm" type="button" data-view-order="${order.id}">View</button></td>
          </tr>`).join('')}
      </tbody></table></div>`,
    { note: 'Live orders appear at the top the moment a customer pays' });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

const page = {
  title: 'Admin insights',

  skeleton: () => html`
    <div class="page">
      <section class="page-head"><div class="container"><h1>Insights</h1></div></section>
      <section class="section">
        <div class="container">
          ${raw(skeletonKpis(8))}
          <div style="margin-top:1rem">${raw(skeletonPanel(240))}</div>
        </div>
      </section>
    </div>`,

  async render(ctx) {
    // Belt and braces: the router already guards this route, but never render
    // KPI data if the session expired between navigation and render.
    if (!isAdmin()) {
      ctx.navigate('/admin-login', { replace: true, query: { next: 'admin' } });
      return '';
    }
    touchSession('admin');
    const admin = currentAdmin();

    const [{ menu, byId }, offers, orders] = await Promise.all([
      getCatalog(),
      getOffers(),
      getAllOrders(getLocalOrders()),
    ]);

    menuList = menu;
    allOrders = orders;
    festivalKeys = festivalDayKeys(offers.festivals);
    const now = datasetNow(orders);

    dashboard = buildDashboard({
      orders,
      menu,
      menuById: byId,
      categories: CATEGORY_META,
      festivals: offers.festivals,
      events: getEvents(),
      consumption: consumptionNow(),
      now,
    });

    const localCount = getLocalOrders().length;
    const activeCount = getLocalOrders().filter(
      (order) => !['Delivered', 'Cancelled'].includes(order.status)
    ).length;

    return html`
      <section class="page-head">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Owner insights</span>
          </nav>
          <div class="row row--between">
            <div>
              <h1>Insights dashboard</h1>
              <p>
                ${number(dashboard.revenue.totalOrders + dashboard.revenue.cancelledOrders)} orders ·
                ${number(menu.length)} menu items · ${localCount ? `${plural(localCount, 'order')} placed in this browser` : 'no local orders yet'}
              </p>
            </div>
            <div class="row no-print">
              <span class="pill-note" data-live-pill>
                <span class="pulse-dot" aria-hidden="true"></span>
                Live · synced ${formatTime(Date.now())}
              </span>
              <span class="pill-note">
                <span class="avatar" style="width:24px;height:24px;font-size:0.6rem" aria-hidden="true">${admin.initials}</span>
                ${admin.name} · ${admin.role}
              </span>
              <button class="btn btn--secondary btn--sm" type="button" data-print>Print</button>
              <button class="btn btn--danger btn--sm" type="button" data-reset-demo>Reset demo data</button>
              <button class="btn btn--dark btn--sm" type="button" data-signout>Sign out</button>
            </div>
          </div>

          <div class="notice notice--info" style="margin-top:var(--sp-3)">
            <span class="notice__icon" aria-hidden="true">📅</span>
            <p>The simulated dataset ends on <strong>${formatDate(now)}</strong>, so “today” and “last 7 days” are measured against that date. Orders you place now are included automatically.</p>
          </div>
        </div>
      </section>

      <section class="section section--tight admin-shell">
        <div class="container">
          <div class="tabs" role="tablist" aria-label="Dashboard sections">
            <button role="tab" type="button" data-tab="orders" aria-selected="true">
              Orders &amp; kitchen${activeCount ? ` (${activeCount})` : ''}
            </button>
            <button role="tab" type="button" data-tab="overview" aria-selected="false">General KPIs</button>
            <button role="tab" type="button" data-tab="products" aria-selected="false">Products &amp; customers</button>
            <button role="tab" type="button" data-tab="ops" aria-selected="false">Festival &amp; slots</button>
          </div>

          <div style="margin-top:var(--sp-5)">
            <div data-panel="orders" role="tabpanel">${raw(ordersTab(orders))}</div>
            <div data-panel="overview" role="tabpanel" hidden>${raw(overviewTab(dashboard))}</div>
            <div data-panel="products" role="tabpanel" hidden>${raw(productsTab(dashboard))}</div>
            <div data-panel="ops" role="tabpanel" hidden>${raw(operationsTab(dashboard))}</div>
          </div>

          <div style="margin-top:var(--sp-5)">${raw(recentOrdersPanel(orders))}</div>

          <div class="panel" style="margin-top:var(--sp-4)">
            <div class="panel__head"><h3>How these numbers are calculated</h3></div>
            <ul class="text-soft" style="font-size:var(--fs-sm);padding-left:1.1rem">
              <li><strong>Revenue &amp; AOV</strong> — sum of <code>order.total</code> for every order that is not cancelled, across the simulated dataset <em>and</em> every order placed live by a signed-in customer.</li>
              <li><strong>Live orders</strong> — orders written by the checkout flow in this browser. They carry the customer's account id, which is how "only my orders" works on their side.</li>
              <li><strong>Slot utilisation</strong> — bookings ÷ capacity per <code>preorderDate + timeSlotId</code>; festival days get double capacity. A live order takes a real seat, so this moves as customers book.</li>
              <li><strong>On-time %</strong> — orders where <code>completedAt ≤ promisedAt</code>, out of all delivered orders.</li>
              <li><strong>Stockout rate</strong> — items with zero effective inventory ÷ total menu items, after deducting what has been ordered.</li>
              <li><strong>Conversion funnel</strong> — unique browser sessions that fired each analytics event, stored in localStorage.</li>
              <li><strong>Peak hours</strong> — order timestamps bucketed by IST weekday and hour.</li>
            </ul>
          </div>
        </div>
      </section>`;
  },

  mount(root, ctx) {
    bindDashboard(root, ctx);
    startLiveRefresh(root, ctx);
  },

  unmount() {
    clearInterval(sessionTimer);
    sessionTimer = null;
    clearTimeout(refreshTimer);
    refreshTimer = null;
    unsubscribeStore?.();
    unsubscribeStore = null;
    bindController?.abort();
    bindController = null;
  },
};

export default page;

/* -------------------------------------------------------------------------- */
/* Interactivity                                                              */
/* -------------------------------------------------------------------------- */

let sessionTimer = null;
let refreshTimer = null;
let unsubscribeStore = null;
/** Lets us drop every listener from the previous render in one go. */
let bindController = null;

/**
 * Attaches every listener the dashboard needs.
 *
 * `rerender()` only swaps `root.innerHTML`, so `root` itself survives — without
 * the AbortController the delegated listener would stack up and every click
 * would fire once per refresh.
 */
function bindDashboard(root, ctx) {
  bindController?.abort();
  bindController = new AbortController();
  const { signal } = bindController;

  const tabs = root.querySelectorAll('[data-tab]');
  const panels = root.querySelectorAll('[data-panel]');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((entry) => entry.setAttribute('aria-selected', String(entry === tab)));
      panels.forEach((entry) => {
        entry.hidden = entry.dataset.panel !== tab.dataset.tab;
      });
    }, { signal });
  });

  root.querySelector('[data-print]')?.addEventListener('click', () => window.print(), { signal });

  // Everything below is delegated, so it survives every live refresh.
  root.addEventListener('click', async (event) => {
    /* ---- Staff order viewer ------------------------------------------- */
    const viewButton = event.target.closest('[data-view-order]');
    if (viewButton) {
      const order = allOrders.find((entry) => entry.id === viewButton.dataset.viewOrder);
      if (order) openOrderViewer(order);
      return;
    }

    /* ---- Move an order to its next stage ------------------------------ */
    const advanceButton = event.target.closest('[data-advance-order]');
    if (advanceButton) {
      const id = advanceButton.dataset.advanceOrder;
      const next = advanceButton.dataset.nextStatus;

      advanceButton.disabled = true;
      advanceButton.textContent = 'Updating…';

      const updated = updateOrderStatus(id, next);
      if (!updated) {
        toast.error('That order could not be updated.');
        return;
      }

      toast.success(
        next === 'Delivered'
          ? `${id} handed over${updated.onTime ? ' — on time 🎉' : ' — late'}`
          : `${id} moved to “${next}”`
      );
      return;
    }

    /* ---- Cancel ------------------------------------------------------- */
    const cancelButton = event.target.closest('[data-cancel-order]');
    if (cancelButton) {
      const id = cancelButton.dataset.cancelOrder;
      const confirmed = await confirmDialog({
        title: `Cancel ${id}?`,
        message:
          'The customer will see the cancellation immediately and the slot is released back to the board. This cannot be undone.',
        confirmLabel: 'Cancel the order',
        cancelLabel: 'Keep it',
        danger: true,
      });
      if (!confirmed) return;
      updateOrderStatus(id, 'Cancelled');
      toast.info(`${id} cancelled — the slot is free again.`);
      return;
    }

    /* ---- Slot board date --------------------------------------------- */
    const dateButton = event.target.closest('[data-slot-date]');
    if (dateButton) {
      slotBoardDate = dateButton.dataset.slotDate;
      const board = root.querySelector('[data-panel="orders"]');
      board?.querySelectorAll('[data-slot-date]').forEach((entry) => {
        entry.setAttribute('aria-pressed', String(entry === dateButton));
      });
      rerender(root, ctx);
    }
  }, { signal });

  /* ---- Auto-advance simulation toggle --------------------------------- */
  root.querySelector('[data-auto-advance]')?.addEventListener('change', (event) => {
    savePrefs({ autoAdvance: event.target.checked });
    toast.info(
      event.target.checked
        ? 'Auto-advance on — orders will move by themselves every 45 seconds.'
        : 'Auto-advance off — you are driving the kitchen now.'
    );
  }, { signal });

  root.querySelector('[data-signout]')?.addEventListener('click', () => {
    logoutAdmin();
    toast.info('Signed out of the dashboard');
    ctx.navigate('/home', { replace: true });
  }, { signal });

  root.querySelector('[data-reset-demo]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset the demo?',
      message:
        'This clears the cart, saved details, orders placed in this browser and all analytics events. Customer accounts and the JSON datasets are untouched.',
      confirmLabel: 'Reset everything',
      danger: true,
    });
    if (!confirmed) return;
    resetAll();
    seenOrderIds = new Set();
    toast.success('Demo data cleared');
    ctx.navigate('/admin', { replace: true });
  }, { signal });
}

/**
 * Rebuilds the whole dashboard from the current data while preserving the
 * open tab and the scroll position, so a live refresh is barely noticeable.
 */
async function rerender(root, ctx) {
  if (!isAdmin() || !document.body.contains(root)) return;

  const openTab = root.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab || 'orders';
  const scrollY = window.scrollY;

  root.innerHTML = await page.render(ctx);
  bindDashboard(root, ctx);

  // 'orders' is the default tab, so only re-click when it is something else.
  if (openTab !== 'orders') root.querySelector(`[data-tab="${openTab}"]`)?.click();
  window.scrollTo({ top: scrollY, behavior: 'auto' });
}

/**
 * The live wire. Any order written in *this* tab or any other one triggers a
 * debounced rebuild, and genuinely new orders raise a toast.
 */
function startLiveRefresh(root, ctx) {
  seenOrderIds = new Set(getLocalOrders().map((order) => order.id));

  unsubscribeStore?.();
  unsubscribeStore = subscribe((event) => {
    if (event.type !== 'orders' && event.type !== 'reset') return;

    const current = getLocalOrders();
    const fresh = current.filter((order) => !seenOrderIds.has(order.id));
    seenOrderIds = new Set(current.map((order) => order.id));

    fresh.forEach((order) => {
      toast.success(
        `New order ${order.id} · ${currency(order.total)} from ${order.accountName || order.customerName || 'a customer'}`,
        { duration: 6000 }
      );
    });

    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => rerender(root, ctx), 450);
  });

  // If the session lapses while the tab is left open, kick back out.
  clearInterval(sessionTimer);
  sessionTimer = setInterval(() => {
    if (!isAdmin()) {
      toast.info('Your admin session expired. Please sign in again.');
      ctx.navigate('/admin-login', { replace: true, query: { next: 'admin' } });
    }
  }, 30_000);
}
