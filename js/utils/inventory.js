/**
 * utils/inventory.js
 * -----------------------------------------------------------------------------
 * Simulated stock for the "live availability" badges of Goal 2.
 *
 * menu.json ships an `inventoryCount` per item. Anything the customer has
 * already ordered (localStorage orders) or is holding in the cart is deducted
 * on top of that, so the badges genuinely move while you use the demo.
 */

export const LOW_STOCK_THRESHOLD = 5;
export const LIMITED_STOCK_THRESHOLD = 12;

/**
 * How many units of each menu item are already spoken for.
 * @param {Array} localOrders orders placed in this browser
 * @param {Array} cart        current cart lines
 * @returns {Map<string, number>}
 */
export function buildConsumption(localOrders = [], cart = []) {
  const consumed = new Map();

  const take = (menuItemId, qty) => {
    if (!menuItemId) return;
    consumed.set(menuItemId, (consumed.get(menuItemId) || 0) + (Number(qty) || 0));
  };

  localOrders.forEach((order) => {
    if (order?.status === 'Cancelled') return;
    (order?.items || []).forEach((line) => take(line.menuItemId, line.qty));
  });

  cart.forEach((line) => take(line.menuItemId ?? line.id, line.qty));

  return consumed;
}

/**
 * Availability state for a single item.
 * level: 'out' | 'low' | 'limited' | 'ok'
 */
export function stockState(item, consumption) {
  const base = Number(item?.inventoryCount) || 0;
  const used = consumption?.get(item?.id) || 0;
  const remaining = Math.max(0, base - used);
  const isAvailable = Boolean(item?.available) && remaining > 0;

  let level = 'ok';
  if (!isAvailable) level = 'out';
  else if (remaining <= LOW_STOCK_THRESHOLD) level = 'low';
  else if (remaining <= LIMITED_STOCK_THRESHOLD) level = 'limited';

  const labels = {
    out: 'Out of stock',
    low: `Only ${remaining} left`,
    limited: `${remaining} in stock`,
    ok: 'In stock',
  };

  const badgeClass = {
    out: 'badge--danger',
    low: 'badge--warn',
    limited: 'badge--info',
    ok: 'badge--success',
  }[level];

  return {
    remaining,
    isAvailable,
    level,
    label: labels[level],
    badgeClass,
    /** Only low/out states are worth shouting about on a card. */
    shouldShowBadge: level !== 'ok',
  };
}

/** Maximum quantity a customer may add for an item right now. */
export function maxAddable(item, consumption, { hardCap = 20 } = {}) {
  const { remaining } = stockState(item, consumption);
  return Math.max(0, Math.min(hardCap, remaining));
}

/**
 * Validates a whole cart against live stock — run again just before payment so
 * a slow checkout cannot oversell an item.
 * @returns {{ ok: boolean, problems: Array<{ line, available }> }}
 */
export function validateCartStock(cart, menuById, consumptionWithoutCart) {
  const problems = [];

  cart.forEach((line) => {
    const item = menuById.get(line.menuItemId);
    if (!item) {
      problems.push({ line, available: 0, reason: 'no-longer-on-menu' });
      return;
    }
    const state = stockState(item, consumptionWithoutCart);
    if (!state.isAvailable) {
      problems.push({ line, available: 0, reason: 'out-of-stock' });
    } else if (line.qty > state.remaining) {
      problems.push({ line, available: state.remaining, reason: 'insufficient-stock' });
    }
  });

  return { ok: problems.length === 0, problems };
}

/* -------------------------------------------------------------------------- */
/* Stockout KPI helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Stockout rate = share of the catalogue that is currently unsellable.
 * `historicalEvents` counts how often items hit zero in the simulated month.
 */
export function stockoutStats(menu, consumption) {
  let outNow = 0;
  let lowNow = 0;
  let historicalEvents = 0;
  let itemsWithEvents = 0;
  const worst = [];

  menu.forEach((item) => {
    const state = stockState(item, consumption);
    if (state.level === 'out') {
      outNow += 1;
      worst.push(item);
    }
    if (state.level === 'low') lowNow += 1;

    const events = Number(item.stockoutEvents) || 0;
    historicalEvents += events;
    if (events > 0) itemsWithEvents += 1;
  });

  const total = menu.length || 1;

  return {
    total: menu.length,
    outNow,
    lowNow,
    historicalEvents,
    itemsWithEvents,
    /** % of the catalogue unavailable right now */
    stockoutRate: (outNow / total) * 100,
    /** % of the catalogue that ran out at least once in the simulated month */
    monthlyStockoutRate: (itemsWithEvents / total) * 100,
    worst: worst.slice(0, 10),
  };
}

/** Items that need a restock decision today — surfaced on the dashboard. */
export function restockList(menu, consumption, limit = 8) {
  return menu
    .map((item) => ({ item, state: stockState(item, consumption) }))
    .filter(({ state }) => state.level === 'out' || state.level === 'low')
    .sort((a, b) => {
      if (a.state.remaining !== b.state.remaining) return a.state.remaining - b.state.remaining;
      return (b.item.popularityScore || 0) - (a.item.popularityScore || 0);
    })
    .slice(0, limit);
}
