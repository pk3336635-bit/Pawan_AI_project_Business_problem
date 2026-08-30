/**
 * store.js — all client-side state.
 *
 * Everything the customer does lives in localStorage so the demo survives a
 * refresh: cart, saved details, placed orders, the preorder slot they picked
 * and the analytics events used for the conversion KPI.
 *
 * Subscribers are notified on every mutation, which is how the navbar badge,
 * the cart drawer and the sticky mobile bar stay in sync.
 */

import { uuid } from './utils/uuid.js';
import { dateKey } from './utils/date.js';
import { broadcast, onRemoteChange } from './sync.js';

const NS = 'mahalaxmi';
const KEYS = {
  cart: `${NS}.cart.v1`,
  orders: `${NS}.orders.v1`,
  profile: `${NS}.profile.v1`,
  checkout: `${NS}.checkout.v1`,
  events: `${NS}.events.v1`,
  prefs: `${NS}.prefs.v1`,
  session: `${NS}.session.v1`,
};

/** Pricing rules used across cart, checkout, payment and receipts. */
export const PRICING = {
  gstRate: 0.05,
  packagingFee: 12,
  packagingFeeLarge: 20,
  largeCartThreshold: 3,
  deliveryFee: 29,
  freeDeliveryAbove: 499,
  maxQtyPerLine: 20,
};

const MAX_EVENTS = 600;
/** Generous, because several demo accounts can order from the same browser. */
const MAX_LOCAL_ORDERS = 200;

/* -------------------------------------------------------------------------- */
/* Safe storage access                                                        */
/* -------------------------------------------------------------------------- */

let memoryFallback = {};
let storageWorks = true;

try {
  const probe = `${NS}.probe`;
  localStorage.setItem(probe, '1');
  localStorage.removeItem(probe);
} catch {
  storageWorks = false; // private mode / storage disabled
}

function readRaw(key) {
  try {
    return storageWorks ? localStorage.getItem(key) : memoryFallback[key] ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    if (storageWorks) localStorage.setItem(key, value);
    else memoryFallback[key] = value;
    return true;
  } catch {
    // Quota exceeded — keep the app usable by falling back to memory.
    storageWorks = false;
    memoryFallback[key] = value;
    return false;
  }
}

function read(key, fallback) {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

const write = (key, value) => writeRaw(key, JSON.stringify(value));

/* -------------------------------------------------------------------------- */
/* Pub / sub                                                                  */
/* -------------------------------------------------------------------------- */

const listeners = new Set();

/** @returns {() => void} unsubscribe */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(type, detail = {}, { remote = false } = {}) {
  listeners.forEach((listener) => {
    try {
      listener({ type, remote, ...detail });
    } catch (error) {
      console.error('[store] listener failed', error);
    }
  });

  // Tell the other open tabs so the admin dashboard and the customer's
  // tracking page stay in step during a live demo.
  if (!remote) broadcast(type);
}

// A change made in another tab: re-read from localStorage and repaint.
onRemoteChange((message) => {
  const type = message.type === 'storage' ? 'orders' : message.type;
  if (type === 'auth') return; // auth.js handles its own fan-out
  emit(type, {}, { remote: true });
});

/* -------------------------------------------------------------------------- */
/* Cart                                                                       */
/* -------------------------------------------------------------------------- */

export const getCart = () => read(KEYS.cart, []);

const saveCart = (cart) => {
  write(KEYS.cart, cart);
  emit('cart', { cart });
  return cart;
};

export const cartCount = (cart = getCart()) =>
  cart.reduce((sum, line) => sum + line.qty, 0);

export const cartSubtotal = (cart = getCart()) =>
  cart.reduce((sum, line) => sum + line.qty * line.price, 0);

export const cartLine = (menuItemId, cart = getCart()) =>
  cart.find((line) => line.menuItemId === menuItemId) || null;

export const cartQty = (menuItemId, cart = getCart()) =>
  cartLine(menuItemId, cart)?.qty || 0;

/**
 * Adds an item (or increases its quantity).
 * `max` comes from the live inventory simulation.
 */
export function addToCart(item, qty = 1, { max = PRICING.maxQtyPerLine } = {}) {
  const cart = getCart();
  const existing = cart.find((line) => line.menuItemId === item.id);
  const ceiling = Math.max(0, Math.min(max, PRICING.maxQtyPerLine));

  if (ceiling === 0) return { cart, added: 0, capped: true };

  if (existing) {
    const next = Math.min(ceiling, existing.qty + qty);
    const added = next - existing.qty;
    existing.qty = next;
    saveCart(cart);
    return { cart, added, capped: added < qty };
  }

  const next = Math.min(ceiling, qty);
  cart.push({
    lineId: uuid(),
    menuItemId: item.id,
    name: item.name,
    baseName: item.baseName || item.name,
    variant: item.variant || '',
    price: item.price,
    mrp: item.mrp || item.price,
    qty: next,
    imageUrl: item.imageUrl,
    category: item.category,
    categoryName: item.categoryName,
    isVeg: item.isVeg !== false,
    isFestivalSpecial: Boolean(item.isFestivalSpecial),
    addedAt: new Date().toISOString(),
  });
  saveCart(cart);
  return { cart, added: next, capped: next < qty };
}

export function setCartQty(menuItemId, qty, { max = PRICING.maxQtyPerLine } = {}) {
  const cart = getCart();
  const line = cart.find((entry) => entry.menuItemId === menuItemId);
  if (!line) return cart;

  const next = Math.max(0, Math.min(max, PRICING.maxQtyPerLine, Math.floor(qty)));
  if (next === 0) return removeFromCart(menuItemId);

  line.qty = next;
  return saveCart(cart);
}

export function removeFromCart(menuItemId) {
  const cart = getCart().filter((line) => line.menuItemId !== menuItemId);
  return saveCart(cart);
}

export const clearCart = () => saveCart([]);

/* -------------------------------------------------------------------------- */
/* Totals & promo codes                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Checks a coupon against the current cart and delivery choice.
 * @returns {{ valid: boolean, discount: number, message: string, promo?: object }}
 */
export function evaluatePromo(promo, { cart = getCart(), deliveryType = 'delivery', now = Date.now() } = {}) {
  if (!promo) return { valid: false, discount: 0, message: 'That coupon code was not recognised.' };

  const subtotal = cartSubtotal(cart);
  const validFrom = Date.parse(`${promo.validFrom}T00:00:00+05:30`);
  const validTill = Date.parse(`${promo.validTill}T23:59:59+05:30`);

  if (promo.active === false || now > validTill) {
    return { valid: false, discount: 0, message: `${promo.code} expired on ${promo.validTill}.` };
  }
  if (now < validFrom) {
    return { valid: false, discount: 0, message: `${promo.code} becomes active on ${promo.validFrom}.` };
  }
  if (subtotal < promo.minOrderValue) {
    const gap = promo.minOrderValue - subtotal;
    return { valid: false, discount: 0, message: `Add ₹${Math.ceil(gap)} more to use ${promo.code}.` };
  }

  const applies = promo.appliesTo || 'all';
  if (applies === 'festival' && !cart.some((line) => line.isFestivalSpecial)) {
    return { valid: false, discount: 0, message: `${promo.code} works only on festival specials and combos.` };
  }
  if (applies.startsWith('category:')) {
    const category = applies.split(':')[1];
    if (!cart.some((line) => line.category === category)) {
      return { valid: false, discount: 0, message: `${promo.code} needs at least one item from that category.` };
    }
  }
  if (applies === 'pickup' && deliveryType !== 'pickup') {
    return { valid: false, discount: 0, message: `${promo.code} is valid on store pickup orders only.` };
  }
  if (applies === 'bulk' && subtotal < 2999) {
    return { valid: false, discount: 0, message: `${promo.code} applies to bulk carts above ₹2,999.` };
  }

  const rawDiscount = promo.type === 'percent' ? (subtotal * promo.value) / 100 : promo.value;
  const discount = Math.round(Math.min(rawDiscount, promo.maxDiscount ?? rawDiscount, subtotal));

  return { valid: true, discount, promo, message: `${promo.code} applied — you saved ₹${discount}.` };
}

/** The single source of truth for order maths (cart, checkout, payment, receipt). */
export function computeTotals({ cart = getCart(), discount = 0, deliveryType = 'delivery' } = {}) {
  const subtotal = Math.round(cartSubtotal(cart));
  const safeDiscount = Math.min(Math.round(discount) || 0, subtotal);
  const taxable = Math.max(0, subtotal - safeDiscount);
  const tax = Math.round(taxable * PRICING.gstRate);

  const packagingFee = cart.length === 0
    ? 0
    : cart.length >= PRICING.largeCartThreshold
      ? PRICING.packagingFeeLarge
      : PRICING.packagingFee;

  const deliveryFee = deliveryType === 'delivery' && cart.length
    ? (subtotal >= PRICING.freeDeliveryAbove ? 0 : PRICING.deliveryFee)
    : 0;

  const total = taxable + tax + packagingFee + deliveryFee;
  const mrpTotal = cart.reduce((sum, line) => sum + line.qty * (line.mrp || line.price), 0);

  return {
    subtotal,
    discount: safeDiscount,
    taxable,
    tax,
    packagingFee,
    deliveryFee,
    total,
    savings: Math.max(0, Math.round(mrpTotal - subtotal)) + safeDiscount,
    freeDeliveryGap: Math.max(0, PRICING.freeDeliveryAbove - subtotal),
  };
}

/* -------------------------------------------------------------------------- */
/* Checkout draft (customer details + preorder slot)                          */
/* -------------------------------------------------------------------------- */

const CHECKOUT_DEFAULTS = {
  name: '',
  phone: '',
  email: '',
  address: '',
  landmark: '',
  notes: '',
  deliveryType: 'delivery',
  preorderDate: '',
  timeSlotId: '',
  promoCode: '',
  giftWrap: false,
  contactless: false,
};

export const getCheckout = () => ({ ...CHECKOUT_DEFAULTS, ...read(KEYS.checkout, {}) });

export function saveCheckout(patch) {
  const next = { ...getCheckout(), ...patch };
  write(KEYS.checkout, next);
  emit('checkout', { checkout: next });
  return next;
}

export function clearCheckout() {
  write(KEYS.checkout, {});
  emit('checkout', { checkout: getCheckout() });
}

/* -------------------------------------------------------------------------- */
/* Saved customer profile                                                     */
/* -------------------------------------------------------------------------- */

export const getProfile = () => read(KEYS.profile, null);

export function saveProfile(profile) {
  write(KEYS.profile, profile);
  emit('profile', { profile });
  return profile;
}

/* -------------------------------------------------------------------------- */
/* Orders placed in this browser                                              */
/* -------------------------------------------------------------------------- */

/** Every locally placed order, from every account on this device. */
export const getLocalOrders = () => read(KEYS.orders, []);

/**
 * Only the orders that belong to the given account ids.
 * The tracking page uses this so a customer can never see someone else's order.
 * @param {string[]} userIds
 */
export const getOrdersForUser = (userIds = []) => {
  const owned = new Set(userIds.filter(Boolean));
  return getLocalOrders().filter((order) => owned.has(order.userId));
};

export function saveOrder(order) {
  const orders = [order, ...getLocalOrders()].slice(0, MAX_LOCAL_ORDERS);
  write(KEYS.orders, orders);
  emit('orders', { orders, order });
  return order;
}

export const findLocalOrder = (id) =>
  getLocalOrders().find((order) => order.id?.toUpperCase() === String(id).trim().toUpperCase()) || null;

/** Advances an order along its status flow and appends to its history. */
export function updateOrderStatus(id, status, at = new Date().toISOString()) {
  const orders = getLocalOrders();
  const order = orders.find((entry) => entry.id === id);
  if (!order) return null;

  // Idempotent: a double click, or two tabs acting at once, must not append
  // the same stage twice.
  if (order.status === status) return order;

  order.status = status;
  order.updatedAt = at;
  order.statusHistory = [...(order.statusHistory || []), { status, at }];

  if (status === 'Delivered') {
    order.completedAt = at;
    order.onTime = Date.parse(at) <= Date.parse(order.promisedAt || at);
  }
  if (status === 'Cancelled') {
    order.paymentStatus = order.paymentMethod === 'COD' ? 'Not required' : 'Refund initiated';
  }

  write(KEYS.orders, orders);
  emit('orders', { orders, order });
  return order;
}

/* -------------------------------------------------------------------------- */
/* Analytics events (conversion funnel KPI)                                   */
/* -------------------------------------------------------------------------- */

export const getEvents = () => read(KEYS.events, []);

export function pushEvent(event) {
  const events = getEvents();
  events.push(event);
  write(KEYS.events, events.slice(-MAX_EVENTS));
  return event;
}

export function clearEvents() {
  write(KEYS.events, []);
  emit('events', { events: [] });
}

/** Stable per-tab session id used to group funnel events. */
export function sessionId() {
  let id = read(KEYS.session, null);
  if (!id) {
    id = `S-${dateKey(Date.now())}-${uuid().slice(0, 8)}`;
    write(KEYS.session, id);
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `autoAdvance` drives the demo status simulation. It is OFF by default because
 * the shop owner moves orders through the kitchen from the dashboard — turn it
 * on when you want statuses to march along by themselves instead.
 */
export const getPrefs = () =>
  read(KEYS.prefs, { vegOnly: false, sort: 'popularity', view: 'grid', autoAdvance: false });

export function savePrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  write(KEYS.prefs, next);
  emit('prefs', { prefs: next });
  return next;
}

/* -------------------------------------------------------------------------- */
/* Demo reset                                                                 */
/* -------------------------------------------------------------------------- */

/** Wipes every Mahalaxmi key — handy before a live demo. */
export function resetAll() {
  Object.values(KEYS).forEach((key) => {
    try {
      if (storageWorks) localStorage.removeItem(key);
      delete memoryFallback[key];
    } catch {
      /* ignore */
    }
  });
  memoryFallback = {};
  emit('reset', {});
}

export const storageAvailable = () => storageWorks;
