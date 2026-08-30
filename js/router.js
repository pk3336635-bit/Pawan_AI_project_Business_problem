/**
 * router.js — hash based single-page router.
 *
 * Hash routing (#/menu) is deliberate: GitHub Pages serves static files only,
 * so a deep link like /menu would 404 with the History API. Every page module
 * is imported lazily, which keeps the first paint small.
 *
 * Page module contract:
 *   export default {
 *     title,                       // document title suffix
 *     skeleton?(ctx) -> html,      // shown while render() resolves
 *     render(ctx) -> html|Promise, // markup for #view
 *     mount?(root, ctx),           // attach listeners after markup is live
 *     unmount?()                   // tear down timers/observers
 *   }
 */

import { trackPageView } from './analytics.js';
import { getCart } from './store.js';
import { isAdmin, isCustomer } from './auth.js';
import { toast } from './components/toast.js';
import { pageSkeleton } from './components/skeleton.js';

const routes = {
  '/home': { load: () => import('./pages/home.js'), label: 'Home' },
  '/menu': { load: () => import('./pages/menu.js'), label: 'Menu' },
  '/order': { load: () => import('./pages/order.js'), label: 'Order' },
  '/tracking': { load: () => import('./pages/tracking.js'), label: 'Track order' },
  '/offers': { load: () => import('./pages/offers.js'), label: 'Offers' },
  '/cert': { load: () => import('./pages/cert.js'), label: 'Certificates' },
  '/checkout': {
    load: () => import('./pages/checkout.js'),
    label: 'Checkout',
    requiresCart: true,
    requiresCustomer: true,
  },
  '/payment': {
    load: () => import('./pages/payment.js'),
    label: 'Payment',
    requiresCart: 'soft',
    requiresCustomer: true,
  },
  '/login': { load: () => import('./pages/login.js'), label: 'Sign in' },
  '/account': { load: () => import('./pages/account.js'), label: 'My account', requiresCustomer: true },
  '/admin-login': { load: () => import('./pages/adminLogin.js'), label: 'Staff sign-in' },
  '/admin': { load: () => import('./pages/adminInsights.js'), label: 'Insights', requiresAdmin: true },
};

export const ROUTE_LIST = routes;

const DEFAULT_ROUTE = '/home';
const SITE_NAME = 'Mahalaxmi Sweets';

let currentModule = null;
let renderToken = 0;
const afterRenderHooks = new Set();

/* -------------------------------------------------------------------------- */
/* URL helpers                                                                */
/* -------------------------------------------------------------------------- */

/** "#/menu?category=sweets&q=laddu" -> { path, query, hash } */
export function parseHash(hash = location.hash) {
  const clean = String(hash || '').replace(/^#/, '') || DEFAULT_ROUTE;
  const [rawPath, rawQuery = ''] = clean.split('?');
  const path = rawPath.replace(/\/+$/, '') || DEFAULT_ROUTE;
  const query = Object.fromEntries(new URLSearchParams(rawQuery));
  return { path: path.startsWith('/') ? path : `/${path}`, query, raw: clean };
}

/** Builds "#/menu?category=sweets" from parts. */
export function buildHash(path, query = {}) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  );
  const qs = params.toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

/** Programmatic navigation. */
export function navigate(path, { query = {}, replace = false, scroll = true } = {}) {
  const target = buildHash(path, query);
  if (target === location.hash) {
    render({ scroll });
    return;
  }
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) render({ scroll });
}

/** Updates the query string of the current route without a full re-render. */
export function setQuery(query, { replace = true } = {}) {
  const { path } = parseHash();
  const target = buildHash(path, query);
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
}

export const currentRoute = () => parseHash().path;

/** Register a callback that runs after every successful render. */
export function onAfterRender(hook) {
  afterRenderHooks.add(hook);
  return () => afterRenderHooks.delete(hook);
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function notFoundModule(path) {
  return {
    title: 'Page not found',
    render: () => `
      <section class="section">
        <div class="container">
          <div class="empty-state">
            <div class="empty-state__icon" aria-hidden="true">🍩</div>
            <h3>We could not find that page</h3>
            <p>The link <code>${path.replace(/[<>&"]/g, '')}</code> does not exist. It may have been renamed.</p>
            <a class="btn btn--primary" href="#/home">Back to home</a>
          </div>
        </div>
      </section>`,
  };
}

/**
 * Route guards, re-run on *every* navigation so typing a URL by hand cannot
 * bypass them:
 *   requiresAdmin    -> staff sign-in
 *   requiresCustomer -> customer sign-in (this is what "you must log in to
 *                       place an order" actually means)
 *   requiresCart     -> something in the cart
 */
function guard(route, path) {
  if (route?.requiresAdmin && !isAdmin()) {
    return { path: '/admin-login', query: { next: 'admin' } };
  }

  if (route?.requiresCustomer && !isCustomer()) {
    toast.info('Please sign in to continue — your cart is safe.');
    return { path: '/login', query: { next: path.replace('/', '') } };
  }

  if (!route?.requiresCart) return null;
  if (getCart().length > 0) return null;

  if (route.requiresCart === 'soft') {
    // Payment can still show a receipt for a just-placed order.
    return null;
  }

  toast.info('Your cart is empty — add something delicious first.');
  return { path: '/menu' };
}

export async function render({ scroll = true } = {}) {
  const view = document.getElementById('view');
  if (!view) return;

  const { path, query } = parseHash();
  const route = routes[path];

  const redirect = guard(route, path);
  if (redirect) {
    navigate(redirect.path, { replace: true, query: redirect.query });
    return;
  }

  const token = ++renderToken;

  // Tear down the previous page (timers, observers, intervals).
  if (currentModule?.unmount) {
    try {
      currentModule.unmount();
    } catch (error) {
      console.error('[router] unmount failed', error);
    }
  }
  currentModule = null;

  const ctx = { path, query, navigate, setQuery };

  document.body.classList.add('is-routing');
  view.setAttribute('aria-busy', 'true');

  try {
    const module = route ? (await route.load()).default : notFoundModule(path);
    if (token !== renderToken) return; // a newer navigation won

    // Skeleton first so the user sees structure immediately.
    view.innerHTML = module.skeleton ? module.skeleton(ctx) : pageSkeleton();

    const markup = await module.render(ctx);
    if (token !== renderToken) return;

    view.innerHTML = `<div class="page">${markup}</div>`;
    currentModule = module;

    if (module.mount) await module.mount(view.querySelector('.page'), ctx);
    if (token !== renderToken) return;

    document.title = `${module.title || route?.label || 'Home'} · ${SITE_NAME}`;
    highlightNav(path);
    revealOnScroll(view);

    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    view.focus({ preventScroll: true });

    trackPageView(path);
    afterRenderHooks.forEach((hook) => hook(ctx));
  } catch (error) {
    console.error('[router] render failed', error);
    if (token !== renderToken) return;
    view.innerHTML = `
      <section class="section">
        <div class="container">
          <div class="empty-state">
            <div class="empty-state__icon" aria-hidden="true">⚠️</div>
            <h3>Something went wrong while loading this page</h3>
            <p>${String(error.message || error).replace(/[<>&"]/g, '')}</p>
            <button class="btn btn--primary" type="button" data-action="reload">Try again</button>
          </div>
        </div>
      </section>`;
    view.querySelector('[data-action="reload"]')?.addEventListener('click', () => render());
  } finally {
    document.body.classList.remove('is-routing');
    view.removeAttribute('aria-busy');
  }
}

/** Marks the active navigation link. */
function highlightNav(path) {
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    const isActive = link.dataset.navLink === path;
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

/** Fade-in-on-scroll for `.reveal` blocks. */
let revealObserver = null;

function revealOnScroll(root) {
  const targets = root.querySelectorAll('.reveal');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  revealObserver?.disconnect();
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.style.transitionDelay = `${Number(entry.target.dataset.revealDelay || 0)}ms`;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
  );

  targets.forEach((el) => revealObserver.observe(el));
}

/** Boots the router and listens for hash changes. */
export function startRouter() {
  if (!location.hash) history.replaceState(null, '', buildHash(DEFAULT_ROUTE));
  window.addEventListener('hashchange', () => render());
  return render();
}
