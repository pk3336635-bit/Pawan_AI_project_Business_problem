/**
 * utils/format.js
 * Formatting helpers plus a tiny auto-escaping HTML template tag.
 *
 * Every string that comes from JSON, localStorage or a form is rendered
 * through `html` so untrusted content can never inject markup (OWASP A03).
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat('en-IN');

/** ₹1,24,500 */
export const currency = (value) => INR.format(Math.round(Number(value) || 0));

/** ₹1,24,500.00 */
export const currencyPrecise = (value) => INR_PRECISE.format(Number(value) || 0);

/** 1,24,500 */
export const number = (value) => NUM.format(Number(value) || 0);

/** Compact money for dashboards: ₹12.4L, ₹3.2Cr, ₹8.4K */
export function compactCurrency(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return currency(n);
}

/** 42.7% */
export const percent = (value, digits = 1) => `${(Number(value) || 0).toFixed(digits)}%`;

/** Safe division that returns 0 instead of NaN/Infinity. */
export const ratio = (numerator, denominator) =>
  !denominator ? 0 : (Number(numerator) || 0) / denominator;

export const pct = (numerator, denominator, digits = 1) =>
  percent(ratio(numerator, denominator) * 100, digits);

/** "1 item" / "3 items" */
export const plural = (count, singular, pluralWord) =>
  `${number(count)} ${count === 1 ? singular : pluralWord || `${singular}s`}`;

export function truncate(text, max = 80) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** "Ananya Sharma" -> "AS" */
export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Mask a phone number for receipts: +91 98765 43210 -> +91 98••• ••210 */
export function maskPhone(phone) {
  const value = String(phone || '');
  if (value.length < 8) return value;
  return `${value.slice(0, 6)}••• ••${value.slice(-3)}`;
}

/* -------------------------------------------------------------------------- */
/* Escaped HTML templating                                                    */
/* -------------------------------------------------------------------------- */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes every HTML-significant character. */
export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** Marks a string as already-safe markup produced by our own code. */
export const raw = (value) => ({ __raw: true, value: String(value ?? '') });

function renderValue(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (typeof value === 'object' && value.__raw) return value.value;
  return escapeHtml(value);
}

/**
 * Tagged template that escapes interpolations by default.
 *   html`<p>${userInput}</p>`          -> escaped
 *   html`<div>${raw(trustedMarkup)}</div>` -> inserted as-is
 */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((chunk, index) => {
    out += chunk;
    if (index < values.length) out += renderValue(values[index]);
  });
  return out;
}

/** Join an array of markup strings. */
export const joinHtml = (parts) => parts.filter(Boolean).join('');

/** Star rating markup for a 0-5 score. */
export function stars(rating) {
  const rounded = Math.round((Number(rating) || 0) * 2) / 2;
  let out = '';
  for (let i = 1; i <= 5; i += 1) {
    out += i <= rounded ? '★' : i - 0.5 === rounded ? '⯨' : '☆';
  }
  return out;
}
