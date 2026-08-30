/**
 * utils/timeslots.js
 * -----------------------------------------------------------------------------
 * Goal 2 — "Festival rush + preorder slotting".
 *
 * The shop can only hand over a fixed number of orders per hour. Each slot has
 * a capacity; once the bookings for a date + slot reach that capacity the slot
 * is closed and checkout is blocked for it (auto-cutoff).
 *
 * The slot grid below is intentionally identical to the one in
 * scripts/generateData.js so historical orders and live orders share ids.
 */

import { dateKey, slotTimeToMs, nextDays, formatClock, daysUntil, DAY_MS } from './date.js';

/** Fixed hand-over windows. `capacity` = orders the kitchen can promise. */
export const TIME_SLOTS = [
  { id: 'SLOT-0900', start: '09:00', end: '10:00', label: '09:00 AM – 10:00 AM', capacity: 10, part: 'morning' },
  { id: 'SLOT-1000', start: '10:00', end: '11:00', label: '10:00 AM – 11:00 AM', capacity: 12, part: 'morning' },
  { id: 'SLOT-1100', start: '11:00', end: '12:00', label: '11:00 AM – 12:00 PM', capacity: 12, part: 'morning' },
  { id: 'SLOT-1200', start: '12:00', end: '13:00', label: '12:00 PM – 01:00 PM', capacity: 14, part: 'afternoon' },
  { id: 'SLOT-1300', start: '13:00', end: '14:00', label: '01:00 PM – 02:00 PM', capacity: 10, part: 'afternoon' },
  { id: 'SLOT-1600', start: '16:00', end: '17:00', label: '04:00 PM – 05:00 PM', capacity: 12, part: 'evening' },
  { id: 'SLOT-1700', start: '17:00', end: '18:00', label: '05:00 PM – 06:00 PM', capacity: 14, part: 'evening' },
  { id: 'SLOT-1800', start: '18:00', end: '19:00', label: '06:00 PM – 07:00 PM', capacity: 16, part: 'evening' },
  { id: 'SLOT-1900', start: '19:00', end: '20:00', label: '07:00 PM – 08:00 PM', capacity: 18, part: 'evening' },
  { id: 'SLOT-2000', start: '20:00', end: '21:00', label: '08:00 PM – 09:00 PM', capacity: 14, part: 'night' },
  { id: 'SLOT-2100', start: '21:00', end: '22:00', label: '09:00 PM – 10:00 PM', capacity: 10, part: 'night' },
];

/** Extra staff on festival days means more capacity per slot. */
export const FESTIVAL_CAPACITY_MULTIPLIER = 2;

/** How far ahead customers may preorder. */
export const PREORDER_WINDOW_DAYS = 7;

/** A slot stops accepting orders this many minutes before it starts. */
export const CUTOFF_MINUTES = 45;

/** Utilisation above this is shown as "Filling fast". */
export const FILLING_FAST_RATIO = 0.75;

export const SLOT_BY_ID = new Map(TIME_SLOTS.map((slot) => [slot.id, slot]));

export const getSlot = (id) => SLOT_BY_ID.get(id) || null;

export const slotLabel = (id) => getSlot(id)?.label || '—';

/* -------------------------------------------------------------------------- */
/* Capacity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} key       "YYYY-MM-DD"
 * @param {Set<string>} festivalDayKeys days that get boosted capacity
 */
export function capacityFor(slot, key, festivalDayKeys) {
  const boosted = festivalDayKeys?.has(key);
  return boosted ? slot.capacity * FESTIVAL_CAPACITY_MULTIPLIER : slot.capacity;
}

/**
 * Counts live bookings per "date|slot" from any list of orders.
 * Cancelled orders release their seat.
 */
export function bookingIndex(orders) {
  const index = new Map();
  (orders || []).forEach((order) => {
    if (!order?.preorderDate || !order?.timeSlotId) return;
    if (order.status === 'Cancelled') return;
    const key = `${order.preorderDate}|${order.timeSlotId}`;
    index.set(key, (index.get(key) || 0) + 1);
  });
  return index;
}

/** Festival day keys (± 2 days around each festival) used for capacity boosts. */
export function festivalDayKeys(festivals, spread = 2) {
  const keys = new Set();
  (festivals || []).forEach((festival) => {
    const base = new Date(`${festival.date}T12:00:00+05:30`).getTime();
    for (let offset = -spread; offset <= spread; offset += 1) {
      keys.add(dateKey(base + offset * DAY_MS));
    }
  });
  return keys;
}

/* -------------------------------------------------------------------------- */
/* Slot board                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Builds the bookable state of every slot for one date.
 * status: 'open' | 'filling' | 'full' | 'closed'
 */
export function buildSlotBoard({ key, bookings, festivalKeys, now = Date.now() }) {
  return TIME_SLOTS.map((slot) => {
    const capacity = capacityFor(slot, key, festivalKeys);
    const booked = Math.min(capacity, bookings.get(`${key}|${slot.id}`) || 0);
    const remaining = Math.max(0, capacity - booked);
    const utilisation = capacity ? booked / capacity : 0;
    const startsAt = slotTimeToMs(key, slot.start);
    const cutoffAt = startsAt - CUTOFF_MINUTES * 60 * 1000;
    const isPastCutoff = now >= cutoffAt;

    let status = 'open';
    let reason = '';

    if (remaining === 0) {
      status = 'full';
      reason = 'Slot full';
    } else if (isPastCutoff) {
      status = 'closed';
      reason = now >= startsAt ? 'Window passed' : `Closes ${CUTOFF_MINUTES} min before`;
    } else if (utilisation >= FILLING_FAST_RATIO) {
      status = 'filling';
      reason = `Only ${remaining} left`;
    }

    return {
      ...slot,
      key,
      capacity,
      booked,
      remaining,
      utilisation,
      startsAt,
      cutoffAt,
      status,
      reason,
      bookable: status === 'open' || status === 'filling',
      isFestivalDay: Boolean(festivalKeys?.has(key)),
      startLabel: formatClock(slot.start),
      endLabel: formatClock(slot.end),
    };
  });
}

/** Preorder date strip for the checkout page. */
export function buildDateOptions({ now = Date.now(), festivals = [], days = PREORDER_WINDOW_DAYS } = {}) {
  const keys = festivalDayKeys(festivals, 1);
  return nextDays(now, days).map((day) => {
    const festival = festivals.find((f) => Math.abs(daysUntil(f.date, day.ms)) === 0);
    return {
      ...day,
      isFestival: keys.has(day.key),
      festivalName: festival?.name || null,
    };
  });
}

/** Day-level roll-up used by the home page strip and the KPI dashboard. */
export function summariseDay({ key, bookings, festivalKeys, now = Date.now() }) {
  const board = buildSlotBoard({ key, bookings, festivalKeys, now });
  const capacity = board.reduce((sum, slot) => sum + slot.capacity, 0);
  const booked = board.reduce((sum, slot) => sum + slot.booked, 0);
  return {
    key,
    board,
    capacity,
    booked,
    remaining: Math.max(0, capacity - booked),
    utilisation: capacity ? booked / capacity : 0,
    fullSlots: board.filter((slot) => slot.status === 'full').length,
    openSlots: board.filter((slot) => slot.bookable).length,
    isFestivalDay: Boolean(festivalKeys?.has(key)),
  };
}

/** Guard used right before an order is written — the final auto-cutoff check. */
export function assertSlotAvailable({ key, slotId, bookings, festivalKeys, now = Date.now() }) {
  const slot = getSlot(slotId);
  if (!slot) return { ok: false, message: 'Please choose a pickup or delivery slot.' };

  const board = buildSlotBoard({ key, bookings, festivalKeys, now });
  const state = board.find((entry) => entry.id === slotId);

  if (!state) return { ok: false, message: 'That slot is no longer offered.' };
  if (state.status === 'full') {
    return { ok: false, message: `${slot.label} is now full. Please pick another window.`, state };
  }
  if (state.status === 'closed') {
    return { ok: false, message: `Bookings for ${slot.label} closed ${CUTOFF_MINUTES} minutes before the window.`, state };
  }
  return { ok: true, state };
}
