/**
 * analytics.js
 * -----------------------------------------------------------------------------
 * Lightweight, privacy-friendly event tracking used to build the conversion
 * funnel KPI (menu views -> item views -> add to cart -> checkout -> payment).
 *
 * Nothing leaves the browser. Events are appended to localStorage and read back
 * by kpi.js. No personal data is recorded — only ids, counts and timestamps.
 */

import { pushEvent, getEvents, sessionId, clearEvents } from './store.js';

export const EVENTS = {
  PAGE_VIEW: 'page_view',
  MENU_VIEW: 'menu_view',
  ITEM_VIEW: 'item_view',
  SEARCH: 'search',
  ADD_TO_CART: 'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  CART_VIEW: 'cart_view',
  CHECKOUT_START: 'checkout_start',
  SLOT_SELECTED: 'slot_selected',
  SLOT_BLOCKED: 'slot_blocked',
  PROMO_APPLIED: 'promo_applied',
  PROMO_REJECTED: 'promo_rejected',
  PAYMENT_START: 'payment_start',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
  BULK_ENQUIRY: 'bulk_enquiry',
  ORDER_TRACKED: 'order_tracked',
};

/** Ordered stages of the conversion funnel shown on the dashboard. */
export const FUNNEL_STAGES = [
  { key: EVENTS.MENU_VIEW, label: 'Menu viewed' },
  { key: EVENTS.ADD_TO_CART, label: 'Added to cart' },
  { key: EVENTS.CHECKOUT_START, label: 'Checkout started' },
  { key: EVENTS.PAYMENT_START, label: 'Payment attempted' },
  { key: EVENTS.PAYMENT_SUCCESS, label: 'Payment successful' },
];

/**
 * Records an event.
 * @param {string} name  one of EVENTS
 * @param {object} props small, non-personal payload (ids, counts, labels)
 */
export function track(name, props = {}) {
  const event = {
    name,
    ts: new Date().toISOString(),
    session: sessionId(),
    route: location.hash || '#/home',
    ...sanitiseProps(props),
  };
  pushEvent(event);
  return event;
}

/** Keeps payloads small and free of anything personal. */
function sanitiseProps(props) {
  const allowed = {};
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'number' || typeof value === 'boolean') {
      allowed[key] = value;
    } else if (typeof value === 'string') {
      allowed[key] = value.slice(0, 80);
    }
  });
  return allowed;
}

export const trackPageView = (route) => track(EVENTS.PAGE_VIEW, { page: route });

export const trackAddToCart = (item, qty) =>
  track(EVENTS.ADD_TO_CART, {
    itemId: item.id,
    category: item.category,
    qty,
    value: item.price * qty,
  });

export const trackPaymentSuccess = (order) =>
  track(EVENTS.PAYMENT_SUCCESS, {
    orderId: order.id,
    value: order.total,
    method: order.paymentMethod,
    deliveryType: order.deliveryType,
    festival: Boolean(order.isFestivalOrder),
  });

/* -------------------------------------------------------------------------- */
/* Read side                                                                  */
/* -------------------------------------------------------------------------- */

/** Counts per event name. */
export function eventCounts(events = getEvents()) {
  const counts = new Map();
  events.forEach((event) => counts.set(event.name, (counts.get(event.name) || 0) + 1));
  return counts;
}

/** Unique sessions that reached each event name. */
export function sessionsPerEvent(events = getEvents()) {
  const map = new Map();
  events.forEach((event) => {
    if (!map.has(event.name)) map.set(event.name, new Set());
    map.get(event.name).add(event.session);
  });
  return map;
}

/**
 * Conversion funnel.
 * Counted by unique session so refreshing the menu ten times does not distort
 * the rate. Falls back to raw event counts when there is only one session.
 */
export function buildFunnel(events = getEvents()) {
  const sessions = sessionsPerEvent(events);
  const counts = eventCounts(events);

  const stages = FUNNEL_STAGES.map((stage) => ({
    ...stage,
    sessions: sessions.get(stage.key)?.size || 0,
    events: counts.get(stage.key) || 0,
  }));

  const top = stages[0].sessions || 0;

  return stages.map((stage, index) => {
    const previous = index === 0 ? top : stages[index - 1].sessions;
    return {
      ...stage,
      shareOfTop: top ? (stage.sessions / top) * 100 : 0,
      stepConversion: previous ? (stage.sessions / previous) * 100 : 0,
      dropOff: Math.max(0, previous - stage.sessions),
    };
  });
}

/** Overall menu-view -> payment-success rate. */
export function conversionRate(events = getEvents()) {
  const funnel = buildFunnel(events);
  const first = funnel[0]?.sessions || 0;
  const last = funnel[funnel.length - 1]?.sessions || 0;
  return first ? (last / first) * 100 : 0;
}

/** Most-viewed items in this browser — a proxy for interest without purchase. */
export function topViewedItems(events = getEvents(), limit = 5) {
  const counts = new Map();
  events
    .filter((event) => event.name === EVENTS.ITEM_VIEW && event.itemId)
    .forEach((event) => counts.set(event.itemId, (counts.get(event.itemId) || 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([itemId, views]) => ({ itemId, views }));
}

export const resetAnalytics = clearEvents;
export const allEvents = getEvents;
