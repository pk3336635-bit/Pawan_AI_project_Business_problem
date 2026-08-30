/**
 * kpi.js — the analytics engine behind the Admin / Insights dashboard.
 *
 * Everything here is a pure function over three inputs:
 *   orders  — data/orders.json + orders placed in this browser
 *   menu    — data/menu.json
 *   events  — the localStorage funnel events from analytics.js
 *
 * "Now" is the newest timestamp in the dataset (see api.datasetNow) so the
 * dashboard is never empty, whichever day the project is opened.
 */

import { toMs, dateKey, istParts, DAY_MS, keyToMs, formatDate } from './utils/date.js';
import { TIME_SLOTS, capacityFor, festivalDayKeys } from './utils/timeslots.js';
import { stockoutStats } from './utils/inventory.js';
import { buildFunnel, conversionRate } from './analytics.js';

const CANCELLED = 'Cancelled';

const isBillable = (order) => order.status !== CANCELLED;

const sum = (values) => values.reduce((total, value) => total + value, 0);

/* -------------------------------------------------------------------------- */
/* Revenue & volume                                                           */
/* -------------------------------------------------------------------------- */

export function revenueSummary(orders, now) {
  const billable = orders.filter(isBillable);
  const cutoff7 = now - 7 * DAY_MS;
  const cutoff30 = now - 30 * DAY_MS;

  const last7 = billable.filter((order) => toMs(order.createdAt) >= cutoff7);
  const last30 = billable.filter((order) => toMs(order.createdAt) >= cutoff30);
  const previous7 = billable.filter((order) => {
    const ms = toMs(order.createdAt);
    return ms >= cutoff7 - 7 * DAY_MS && ms < cutoff7;
  });

  const total = sum(billable.map((order) => order.total));
  const revenue7 = sum(last7.map((order) => order.total));
  const revenuePrev7 = sum(previous7.map((order) => order.total));

  return {
    totalRevenue: total,
    totalOrders: billable.length,
    cancelledOrders: orders.length - billable.length,
    cancellationRate: orders.length ? ((orders.length - billable.length) / orders.length) * 100 : 0,
    avgOrderValue: billable.length ? total / billable.length : 0,
    revenue7,
    orders7: last7.length,
    revenue30: sum(last30.map((order) => order.total)),
    orders30: last30.length,
    revenueTrend: revenuePrev7 ? ((revenue7 - revenuePrev7) / revenuePrev7) * 100 : 0,
    totalDiscount: sum(billable.map((order) => order.discount || 0)),
    totalTax: sum(billable.map((order) => order.tax || 0)),
    itemsSold: sum(billable.map((order) => order.itemCount || 0)),
  };
}

/** Revenue and order count per calendar day, oldest first. */
export function dailySeries(orders, now, days = 30) {
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    buckets.set(dateKey(now - i * DAY_MS), { revenue: 0, orders: 0 });
  }

  orders.filter(isBillable).forEach((order) => {
    const key = dateKey(order.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) return;
    bucket.revenue += order.total;
    bucket.orders += 1;
  });

  return [...buckets.entries()].map(([key, value]) => ({
    key,
    label: `${istParts(keyToMs(key)).day}/${istParts(keyToMs(key)).month}`,
    ...value,
  }));
}

/** The single best revenue day in the whole dataset. */
export function peakDay(orders) {
  const byDay = new Map();
  orders.filter(isBillable).forEach((order) => {
    const key = dateKey(order.createdAt);
    const bucket = byDay.get(key) || { revenue: 0, orders: 0, festival: false, festivalName: null };
    bucket.revenue += order.total;
    bucket.orders += 1;
    if (order.isFestivalOrder) {
      bucket.festival = true;
      bucket.festivalName = bucket.festivalName || order.festivalName;
    }
    byDay.set(key, bucket);
  });

  const ranked = [...byDay.entries()]
    .map(([key, value]) => ({ key, label: formatDate(keyToMs(key)), ...value }))
    .sort((a, b) => b.revenue - a.revenue);

  return { best: ranked[0] || null, top5: ranked.slice(0, 5) };
}

/* -------------------------------------------------------------------------- */
/* Product performance                                                        */
/* -------------------------------------------------------------------------- */

export function itemPerformance(orders, menuById) {
  const stats = new Map();

  orders.filter(isBillable).forEach((order) => {
    (order.items || []).forEach((line) => {
      const entry = stats.get(line.menuItemId) || {
        menuItemId: line.menuItemId,
        name: line.name || menuById.get(line.menuItemId)?.name || line.menuItemId,
        category: line.category || menuById.get(line.menuItemId)?.category || 'other',
        qty: 0,
        revenue: 0,
        orders: 0,
        festivalQty: 0,
      };
      entry.qty += line.qty;
      entry.revenue += line.lineTotal ?? line.qty * line.unitPrice;
      entry.orders += 1;
      if (order.isFestivalOrder) entry.festivalQty += line.qty;
      stats.set(line.menuItemId, entry);
    });
  });

  return [...stats.values()];
}

export const topItems = (performance, limit = 10, by = 'qty') =>
  [...performance].sort((a, b) => b[by] - a[by]).slice(0, limit);

export function ordersByCategory(performance, categoryMeta = []) {
  const byCategory = new Map();

  performance.forEach((entry) => {
    const bucket = byCategory.get(entry.category) || { category: entry.category, qty: 0, revenue: 0 };
    bucket.qty += entry.qty;
    bucket.revenue += entry.revenue;
    byCategory.set(entry.category, bucket);
  });

  const nameOf = (id) => categoryMeta.find((meta) => meta.id === id)?.name || id;

  return [...byCategory.values()]
    .map((bucket) => ({ ...bucket, label: nameOf(bucket.category) }))
    .sort((a, b) => b.revenue - a.revenue);
}

/* -------------------------------------------------------------------------- */
/* Distributions                                                              */
/* -------------------------------------------------------------------------- */

function countBy(orders, selector) {
  const counts = new Map();
  orders.forEach((order) => {
    const key = selector(order) || 'Unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export const paymentSplit = (orders) => countBy(orders.filter(isBillable), (o) => o.paymentMethod);
export const statusDistribution = (orders) => countBy(orders, (o) => o.status);
export const channelSplit = (orders) => countBy(orders.filter(isBillable), (o) => o.channel);
export const fulfilmentSplit = (orders) =>
  countBy(orders.filter(isBillable), (o) => (o.deliveryType === 'pickup' ? 'Store pickup' : 'Home delivery'));

/** Weekday x hour matrix used for the peak-hours heatmap. */
export function peakHours(orders) {
  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00 – 22:00
  const matrix = Array.from({ length: 7 }, () => hours.map(() => 0));
  const hourTotals = hours.map(() => 0);

  orders.filter(isBillable).forEach((order) => {
    const { hour, weekday } = istParts(order.createdAt);
    const col = hours.indexOf(hour);
    if (col === -1) return;
    matrix[weekday][col] += 1;
    hourTotals[col] += 1;
  });

  const busiestIndex = hourTotals.indexOf(Math.max(...hourTotals));

  return {
    matrix,
    hours,
    rowLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    colLabels: hours.map((hour) => String(hour).padStart(2, '0')),
    hourSeries: hours.map((hour, index) => ({
      label: `${String(hour).padStart(2, '0')}:00`,
      value: hourTotals[index],
    })),
    busiestHour: hours[busiestIndex],
    busiestHourOrders: hourTotals[busiestIndex] || 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Goal 2 — preorder slots, punctuality, stockouts, festivals                  */
/* -------------------------------------------------------------------------- */

/**
 * Slot utilisation.
 * - `bySlot`   aggregated across every date that has bookings
 * - `byDay`    per-date totals for the upcoming window
 */
export function slotUtilisation(orders, festivals, now, upcomingDays = 7) {
  const festKeys = festivalDayKeys(festivals);
  const preorders = orders.filter((o) => o.preorderDate && o.timeSlotId && isBillable(o));

  const bookings = new Map();
  const dates = new Set();
  preorders.forEach((order) => {
    const key = `${order.preorderDate}|${order.timeSlotId}`;
    bookings.set(key, (bookings.get(key) || 0) + 1);
    dates.add(order.preorderDate);
  });

  // Upcoming window always appears, even with zero bookings.
  for (let i = 0; i < upcomingDays; i += 1) dates.add(dateKey(now + i * DAY_MS));

  const bySlot = TIME_SLOTS.map((slot) => {
    let booked = 0;
    let capacity = 0;
    dates.forEach((date) => {
      capacity += capacityFor(slot, date, festKeys);
      booked += Math.min(capacityFor(slot, date, festKeys), bookings.get(`${date}|${slot.id}`) || 0);
    });
    return {
      id: slot.id,
      label: slot.label,
      short: `${slot.start}`,
      booked,
      capacity,
      utilisation: capacity ? (booked / capacity) * 100 : 0,
    };
  });

  const byDay = [...dates]
    .sort()
    .map((date) => {
      let booked = 0;
      let capacity = 0;
      let fullSlots = 0;
      TIME_SLOTS.forEach((slot) => {
        const cap = capacityFor(slot, date, festKeys);
        const used = Math.min(cap, bookings.get(`${date}|${slot.id}`) || 0);
        capacity += cap;
        booked += used;
        if (used >= cap) fullSlots += 1;
      });
      return {
        key: date,
        label: `${istParts(keyToMs(date)).day}/${istParts(keyToMs(date)).month}`,
        booked,
        capacity,
        fullSlots,
        isFestival: festKeys.has(date),
        utilisation: capacity ? (booked / capacity) * 100 : 0,
      };
    });

  const upcoming = byDay.filter((day) => keyToMs(day.key) >= keyToMs(dateKey(now)));
  const totalBooked = sum(upcoming.map((day) => day.booked));
  const totalCapacity = sum(upcoming.map((day) => day.capacity));

  return {
    bySlot,
    byDay,
    upcoming,
    preorderCount: preorders.length,
    preorderShare: orders.length ? (preorders.length / orders.length) * 100 : 0,
    overallUtilisation: totalCapacity ? (totalBooked / totalCapacity) * 100 : 0,
    fullSlots: sum(upcoming.map((day) => day.fullSlots)),
    busiestSlot: [...bySlot].sort((a, b) => b.utilisation - a.utilisation)[0] || null,
  };
}

/**
 * On-time performance: completed on or before the promised time.
 * Festival days are reported separately because that is where the pain is.
 */
export function onTimePerformance(orders) {
  const completed = orders.filter((order) => order.status === 'Delivered' && order.promisedAt && order.completedAt);

  const measure = (list) => {
    if (!list.length) return { total: 0, onTime: 0, rate: 0, avgDelayMins: 0 };
    const onTime = list.filter((order) => toMs(order.completedAt) <= toMs(order.promisedAt));
    const late = list.filter((order) => toMs(order.completedAt) > toMs(order.promisedAt));
    const avgDelay = late.length
      ? sum(late.map((order) => (toMs(order.completedAt) - toMs(order.promisedAt)) / 60000)) / late.length
      : 0;
    return {
      total: list.length,
      onTime: onTime.length,
      late: late.length,
      rate: (onTime.length / list.length) * 100,
      avgDelayMins: avgDelay,
    };
  };

  const avgFulfilmentMins = completed.length
    ? sum(completed.map((order) => (toMs(order.completedAt) - toMs(order.createdAt)) / 60000)) / completed.length
    : 0;

  return {
    overall: measure(completed),
    festival: measure(completed.filter((order) => order.isFestivalOrder)),
    regular: measure(completed.filter((order) => !order.isFestivalOrder)),
    avgFulfilmentMins,
  };
}

/** Festival revenue, orders and the items people actually buy for festivals. */
export function festivalPerformance(orders, menuById) {
  const billable = orders.filter(isBillable);
  const festivalOrders = billable.filter((order) => order.isFestivalOrder);

  const itemStats = new Map();
  festivalOrders.forEach((order) => {
    (order.items || []).forEach((line) => {
      const entry = itemStats.get(line.menuItemId) || {
        label: line.name || menuById.get(line.menuItemId)?.name || line.menuItemId,
        qty: 0,
        revenue: 0,
      };
      entry.qty += line.qty;
      entry.revenue += line.lineTotal ?? line.qty * line.unitPrice;
      itemStats.set(line.menuItemId, entry);
    });
  });

  const byFestival = new Map();
  festivalOrders.forEach((order) => {
    const name = order.festivalName || 'Festival week';
    const bucket = byFestival.get(name) || { label: name, orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += order.total;
    byFestival.set(name, bucket);
  });

  const festivalRevenue = sum(festivalOrders.map((order) => order.total));
  const totalRevenue = sum(billable.map((order) => order.total));

  return {
    orders: festivalOrders.length,
    revenue: festivalRevenue,
    revenueShare: totalRevenue ? (festivalRevenue / totalRevenue) * 100 : 0,
    avgOrderValue: festivalOrders.length ? festivalRevenue / festivalOrders.length : 0,
    topItems: [...itemStats.values()].sort((a, b) => b.qty - a.qty).slice(0, 10),
    byFestival: [...byFestival.values()].sort((a, b) => b.revenue - a.revenue),
  };
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                  */
/* -------------------------------------------------------------------------- */

export function customerStats(orders) {
  const byUser = new Map();
  orders.filter(isBillable).forEach((order) => {
    const bucket = byUser.get(order.userId) || { orders: 0, revenue: 0, name: order.customerName };
    bucket.orders += 1;
    bucket.revenue += order.total;
    byUser.set(order.userId, bucket);
  });

  const values = [...byUser.values()];
  const repeat = values.filter((entry) => entry.orders > 1);

  return {
    uniqueCustomers: values.length,
    repeatCustomers: repeat.length,
    repeatRate: values.length ? (repeat.length / values.length) * 100 : 0,
    revenuePerCustomer: values.length ? sum(values.map((entry) => entry.revenue)) / values.length : 0,
    top: [...byUser.entries()]
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
  };
}

/* -------------------------------------------------------------------------- */
/* One call to build the whole dashboard                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {{ orders, menu, menuById, categories, festivals, events, consumption, now }} input
 */
export function buildDashboard({ orders, menu, menuById, categories, festivals, events, consumption, now }) {
  const performance = itemPerformance(orders, menuById);

  return {
    now,
    revenue: revenueSummary(orders, now),
    daily: dailySeries(orders, now, 30),
    peak: peakDay(orders),
    performance,
    topByQty: topItems(performance, 10, 'qty'),
    topByRevenue: topItems(performance, 10, 'revenue'),
    categories: ordersByCategory(performance, categories),
    payments: paymentSplit(orders),
    statuses: statusDistribution(orders),
    channels: channelSplit(orders),
    fulfilment: fulfilmentSplit(orders),
    hours: peakHours(orders),
    slots: slotUtilisation(orders, festivals, now),
    punctuality: onTimePerformance(orders),
    stock: stockoutStats(menu, consumption),
    festival: festivalPerformance(orders, menuById),
    customers: customerStats(orders),
    funnel: buildFunnel(events),
    conversion: conversionRate(events),
  };
}
