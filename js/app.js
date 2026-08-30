/**
 * app.js — application bootstrap.
 *
 * Mounts the persistent chrome (navbar, footer, cart drawer), warms the JSON
 * caches and hands control to the hash router. Everything else is lazy.
 */

import { mountNavbar } from './components/navbar.js';
import { mountFooter } from './components/footer.js';
import { mountCartDrawer } from './components/cartDrawer.js';
import { toast } from './components/toast.js';
import { startRouter, onAfterRender } from './router.js';
import { preload } from './api.js';
import { storageAvailable, getCart, cartCount } from './store.js';
import { track, EVENTS } from './analytics.js';

/* -------------------------------------------------------------------------- */
/* Global error surface                                                       */
/* -------------------------------------------------------------------------- */

window.addEventListener('error', (event) => {
  console.error('[app] uncaught error', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[app] unhandled promise rejection', event.reason);
});

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

async function boot() {
  mountNavbar();
  mountFooter();
  mountCartDrawer();

  if (!storageAvailable()) {
    toast.info('Private browsing detected — your cart will not survive a refresh.', { duration: 6000 });
  }

  // Warm the menu/offers caches while the router resolves the first page.
  preload().catch((error) => {
    console.error('[app] data preload failed', error);
    toast.error('Could not load the menu data. Are you serving the folder over http?', { duration: 8000 });
  });

  await startRouter();

  // Restore the cart-bar padding class after every navigation.
  onAfterRender(() => {
    document.body.classList.toggle('has-cart-bar', cartCount(getCart()) > 0);
  });

  track(EVENTS.PAGE_VIEW, { page: 'boot' });
  document.body.classList.add('is-ready');
}

/* -------------------------------------------------------------------------- */
/* Nice-to-haves                                                              */
/* -------------------------------------------------------------------------- */

/** Keyboard shortcut: "/" focuses the menu search when it is on screen. */
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  const search = document.getElementById('menu-search');
  if (!search) return;
  event.preventDefault();
  search.focus();
  search.select();
});

/** In-page anchors such as #/offers#bulk need a manual scroll after render. */
onAfterRender(() => {
  const [, fragment] = (location.hash || '').split('#').slice(1);
  if (!fragment) return;
  const target = document.getElementById(fragment);
  if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
