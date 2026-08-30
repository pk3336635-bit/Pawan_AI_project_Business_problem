/**
 * utils/uuid.js
 * Collision-resistant ids for orders, cart lines and analytics events.
 * Uses crypto.randomUUID / crypto.getRandomValues when available and falls
 * back to a time-seeded generator on very old browsers.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford-ish, no I/L/O/U

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** RFC-4122 style unique id. */
export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Short, human-readable token, e.g. "K3M9QZ". */
export function shortId(length = 6) {
  const bytes = randomBytes(length);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * Customer-facing order id: MS-20260829-K3M9QZ
 * Date first so the shop can sort a day's tickets at a glance.
 */
export function orderId(dateKey) {
  const day = String(dateKey || '').replace(/-/g, '') || 'PREORDER';
  return `MS-${day}-${shortId(6)}`;
}

/** Simulated payment reference for the receipt. */
export const transactionId = (method) =>
  `${String(method || 'PAY').toUpperCase().slice(0, 4)}-${shortId(4)}-${shortId(4)}-${shortId(4)}`;

/** Cart line key so the same item can be re-added without duplicating rows. */
export const cartLineId = (menuItemId) => `L-${menuItemId}`;
