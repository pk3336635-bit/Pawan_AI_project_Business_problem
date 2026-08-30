/**
 * sync.js — keeps every open tab/window in agreement.
 * -----------------------------------------------------------------------------
 * The demo story is: the professor watches a customer place an order in one
 * window while the admin dashboard in a second window updates by itself.
 *
 * There is no server, so "syncing" means two things:
 *   1. BroadcastChannel — instant, same-origin, tab-to-tab messaging.
 *   2. The `storage` event — a fallback that fires in *other* tabs whenever
 *      localStorage changes, so the demo still works in older browsers.
 *
 * Both paths converge on `onRemoteChange`, and remote notifications are never
 * re-broadcast, so there is no echo loop.
 */

const CHANNEL_NAME = 'mahalaxmi.sync.v1';
const STORAGE_PREFIX = 'mahalaxmi.';

const listeners = new Set();

/** A per-tab id so a tab can ignore its own messages. */
export const TAB_ID = `T-${Math.random().toString(36).slice(2, 10)}`;

let channel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL_NAME);
} catch {
  channel = null; // very old browser, or blocked — the storage event covers us
}

function notify(message) {
  listeners.forEach((listener) => {
    try {
      listener(message);
    } catch (error) {
      console.error('[sync] listener failed', error);
    }
  });
}

if (channel) {
  channel.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.tab === TAB_ID) return;
    notify(message);
  });
}

// Fallback / belt-and-braces: fires in every *other* tab of this origin.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) return;
    notify({ type: 'storage', key: event.key, tab: 'storage-event' });
  });
}

/**
 * Tells the other tabs that something changed.
 * @param {string} type e.g. 'orders' | 'cart' | 'auth'
 */
export function broadcast(type, detail = {}) {
  if (!channel) return;
  try {
    channel.postMessage({ type, detail, tab: TAB_ID, at: Date.now() });
  } catch {
    /* structured-clone failure — nothing worth crashing over */
  }
}

/**
 * Subscribe to changes made in another tab.
 * @returns {() => void} unsubscribe
 */
export function onRemoteChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when instant tab-to-tab messaging is available. */
export const hasLiveChannel = () => channel !== null;
