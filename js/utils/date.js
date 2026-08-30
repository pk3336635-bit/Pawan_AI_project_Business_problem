/**
 * utils/date.js
 * Every timestamp in this project is IST (Asia/Kolkata) because the shop and
 * all of its customers live there. These helpers keep the whole app on the
 * same clock regardless of the browser's local time zone.
 */

export const IST_OFFSET_MS = 330 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Anything (ISO string | Date | number) -> epoch ms. Returns NaN when unparsable. */
export function toMs(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return Date.parse(value);
}

/** Epoch ms -> IST wall-clock parts. */
export function istParts(value) {
  const ms = toMs(value);
  const d = new Date(ms + IST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
  };
}

/** IST wall clock -> epoch ms. */
export const istMs = (y, m, d, h = 0, mi = 0, s = 0) =>
  Date.UTC(y, m - 1, d, h, mi, s) - IST_OFFSET_MS;

/** Epoch ms -> "2026-08-29T21:30:00+05:30". */
export function toIstIso(value) {
  const p = istParts(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}+05:30`;
}

/** Epoch ms -> "2026-08-29" (IST calendar day). */
export function dateKey(value) {
  const p = istParts(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "2026-08-29" -> epoch ms at the given IST hour. */
export function keyToMs(key, hour = 0, minute = 0) {
  const [y, m, d] = String(key).split('-').map(Number);
  return istMs(y, m, d, hour, minute);
}

/** "HH:mm" on a "YYYY-MM-DD" IST day -> epoch ms. */
export function slotTimeToMs(key, time) {
  const [h, mi] = String(time).split(':').map(Number);
  return keyToMs(key, h, mi);
}

/** "29 Aug 2026" */
export function formatDate(value) {
  const p = istParts(value);
  if (Number.isNaN(p.year)) return '—';
  return `${p.day} ${MONTH_SHORT[p.month - 1]} ${p.year}`;
}

/** "Sat, 29 Aug" */
export function formatDateShort(value) {
  const p = istParts(value);
  if (Number.isNaN(p.year)) return '—';
  return `${DAY_SHORT[p.weekday]}, ${p.day} ${MONTH_SHORT[p.month - 1]}`;
}

/** "09:35 PM" */
export function formatTime(value) {
  const p = istParts(value);
  if (Number.isNaN(p.hour)) return '—';
  const suffix = p.hour >= 12 ? 'PM' : 'AM';
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${pad(hour12)}:${pad(p.minute)} ${suffix}`;
}

/** "29 Aug 2026, 09:35 PM" */
export const formatDateTime = (value) => `${formatDate(value)}, ${formatTime(value)}`;

/** "09:00" -> "09:00 AM" */
export function formatClock(time) {
  const [h, m] = String(time).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(hour12)}:${pad(m)} ${suffix}`;
}

export const dayName = (value) => DAY_NAMES[istParts(value).weekday];
export const dayShort = (value) => DAY_SHORT[istParts(value).weekday];
export const monthShort = (value) => MONTH_SHORT[istParts(value).month - 1];
export const isWeekend = (value) => [0, 6].includes(istParts(value).weekday);

/** "in 2 days", "3 hours ago", "just now" */
export function relativeTime(value, now = Date.now()) {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return '—';
  const diff = ms - now;
  const abs = Math.abs(diff);
  const units = [
    [60000, 1000, 'second'],
    [3600000, 60000, 'minute'],
    [86400000, 3600000, 'hour'],
    [604800000, 86400000, 'day'],
    [2592000000, 604800000, 'week'],
    [31536000000, 2592000000, 'month'],
    [Infinity, 31536000000, 'year'],
  ];

  if (abs < 45000) return 'just now';

  for (const [limit, divisor, unit] of units) {
    if (abs < limit) {
      const amount = Math.round(abs / divisor);
      const label = `${amount} ${unit}${amount === 1 ? '' : 's'}`;
      return diff < 0 ? `${label} ago` : `in ${label}`;
    }
  }
  return '—';
}

/** Difference between two timestamps in whole IST calendar days. */
export const daysBetween = (a, b) =>
  Math.round((keyToMs(dateKey(b)) - keyToMs(dateKey(a))) / DAY_MS);

/** "1 h 25 m" */
export function formatDuration(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} m` : `${h} h`;
}

/** Next `count` IST calendar days starting from `fromMs`. */
export function nextDays(fromMs, count) {
  const start = keyToMs(dateKey(fromMs));
  return Array.from({ length: count }, (_, i) => {
    const ms = start + i * DAY_MS;
    return {
      key: dateKey(ms),
      ms,
      dayShort: dayShort(ms),
      dayNum: istParts(ms).day,
      month: monthShort(ms),
      isToday: i === 0,
      isWeekend: isWeekend(ms),
    };
  });
}

/** Days until a festival date key, relative to `fromMs`. */
export const daysUntil = (dateKeyValue, fromMs = Date.now()) =>
  Math.round((keyToMs(dateKeyValue) - keyToMs(dateKey(fromMs))) / DAY_MS);
