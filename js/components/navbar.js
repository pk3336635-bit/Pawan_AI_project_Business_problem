/**
 * components/navbar.js — top strip + sticky header.
 *
 * Renders once, then patches only the cart badge and the shop-status strip so
 * navigation never re-creates DOM unnecessarily.
 */

import { html, raw, number } from '../utils/format.js';
import { istParts, daysUntil, formatClock } from '../utils/date.js';
import { subscribe, getCart, cartCount } from '../store.js';
import { getUpcomingFestival } from '../api.js';
import { currentAdmin, currentCustomer, onAuthChange } from '../auth.js';
import { openCartDrawer } from './cartDrawer.js';

/** The shop's physical opening hours (IST). */
export const SHOP_HOURS = { open: '08:00', close: '22:00' };

const NAV_ITEMS = [
  { path: '/home', label: 'Home', icon: '🏠' },
  { path: '/menu', label: 'Menu', icon: '🍽️' },
  { path: '/order', label: 'Order', icon: '🛒' },
  { path: '/tracking', label: 'Track', icon: '📍' },
  { path: '/offers', label: 'Offers', icon: '🎉' },
  { path: '/cert', label: 'Certificates', icon: '✅' },
];

let festivalCache = null;
let statusTimer = null;

/* -------------------------------------------------------------------------- */
/* Shop status                                                                */
/* -------------------------------------------------------------------------- */

export function shopStatus(now = Date.now()) {
  const { hour, minute } = istParts(now);
  const minutes = hour * 60 + minute;
  const [oh, om] = SHOP_HOURS.open.split(':').map(Number);
  const [ch, cm] = SHOP_HOURS.close.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const isOpen = minutes >= openMin && minutes < closeMin;

  return {
    isOpen,
    label: isOpen
      ? `Open now · closes ${formatClock(SHOP_HOURS.close)}`
      : `Closed · opens ${formatClock(SHOP_HOURS.open)}`,
  };
}

function topbarMarkup(festival) {
  const status = shopStatus();
  const days = festival ? daysUntil(festival.date) : null;
  const admin = currentAdmin();

  const festivalNote = festival
    ? days <= 0
      ? `<li><span aria-hidden="true">🎊</span> <strong>${festival.name}</strong> is here — preorder slots are live</li>`
      : `<li><span aria-hidden="true">🎊</span> <strong>${festival.name}</strong> in ${days} ${days === 1 ? 'day' : 'days'} — preorder now</li>`
    : '';

  // Customers never see the dashboard link; only a signed-in admin does.
  const adminNote = admin
    ? `<li><a href="#/admin" style="color:var(--orange-300)">📊 Insights · ${admin.name.split(' ')[0]}</a></li>`
    : '';

  return html`
    <div class="topbar__inner">
      <ul class="topbar__list">
        <li>
          <span class="pulse-dot ${status.isOpen ? '' : 'pulse-dot--closed'}" aria-hidden="true"></span>
          ${status.label}
        </li>
        ${raw(festivalNote)}
        <li><span aria-hidden="true">📞</span> +91 731 490 2211</li>
      </ul>
      <ul class="topbar__list">
        <li><a href="#/offers" style="color:var(--orange-300)">Free delivery above ₹499</a></li>
        ${raw(adminNote)}
      </ul>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

/** Account chip for a signed-in customer, or a plain "Sign in" button. */
function accountMarkup() {
  const customer = currentCustomer();

  if (!customer) {
    return html`
      <a class="cart-button" href="#/login" data-account-link>
        <span aria-hidden="true">👤</span>
        <span class="cart-button__label">Sign in</span>
      </a>`;
  }

  return html`
    <a class="cart-button" href="#/account" data-account-link
      aria-label="My account, signed in as ${customer.name}">
      <span class="avatar" style="width:22px;height:22px;font-size:0.6rem" aria-hidden="true">${customer.initials}</span>
      <span class="cart-button__label">${customer.name.split(' ')[0]}</span>
    </a>`;
}

function headerMarkup() {
  const count = cartCount();

  return html`
    <nav class="nav" aria-label="Primary">
      <a class="brand" href="#/home" aria-label="Mahalaxmi Sweets, home">
        <span class="brand__mark" aria-hidden="true">MS</span>
        <span class="brand__text">
          <span class="brand__name">Mahalaxmi Sweets</span>
          <span class="brand__tag">Since 1984 · Indore</span>
        </span>
      </a>

      <ul class="nav__links" id="nav-links">
        ${raw(NAV_ITEMS.map((item) => `
          <li>
            <a class="nav__link" href="#${item.path}" data-nav-link="${item.path}">
              <span aria-hidden="true">${item.icon}</span> ${item.label}
            </a>
          </li>`).join(''))}
      </ul>

      <div class="nav__actions">
        <span data-account-slot>${raw(accountMarkup())}</span>

        <button class="cart-button" type="button" data-cart-button
          aria-label="Open cart, ${count} ${count === 1 ? 'item' : 'items'}">
          <span aria-hidden="true">🛒</span>
          <span class="cart-button__label">Cart</span>
          <span class="cart-button__count" data-cart-count>${number(count)}</span>
        </button>

        <button class="nav__toggle" type="button" data-nav-toggle
          aria-expanded="false" aria-controls="nav-links" aria-label="Open navigation menu">
          <span></span>
        </button>
      </div>
    </nav>`;
}

/* -------------------------------------------------------------------------- */
/* Patching                                                                   */
/* -------------------------------------------------------------------------- */

function paintCartBadge() {
  const count = cartCount(getCart());
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = number(count);
  });
  document.querySelectorAll('[data-cart-button]').forEach((el) => {
    el.setAttribute('aria-label', `Open cart, ${count} ${count === 1 ? 'item' : 'items'}`);
  });
}

async function paintTopbar() {
  const el = document.getElementById('topbar');
  if (!el) return;
  if (festivalCache === null) {
    try {
      festivalCache = await getUpcomingFestival();
    } catch {
      festivalCache = false;
    }
  }
  el.innerHTML = topbarMarkup(festivalCache || null);
}

/* -------------------------------------------------------------------------- */
/* Mount                                                                      */
/* -------------------------------------------------------------------------- */

export function mountNavbar() {
  const header = document.getElementById('site-header');
  if (!header) return;

  header.innerHTML = headerMarkup();
  paintTopbar();

  const links = header.querySelector('#nav-links');
  const toggle = header.querySelector('[data-nav-toggle]');

  const closeMenu = () => {
    links.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
  };

  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  });

  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  header.querySelector('[data-cart-button]').addEventListener('click', () => {
    closeMenu();
    openCartDrawer();
  });

  // Shadow the header once the page scrolls.
  const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  subscribe((event) => {
    if (event.type === 'cart' || event.type === 'reset') paintCartBadge();
  });

  // Signing in or out changes what the header is allowed to show.
  onAuthChange(() => {
    paintTopbar();
    const slot = header.querySelector('[data-account-slot]');
    if (slot) slot.innerHTML = accountMarkup();
  });

  // Refresh "open / closed" every minute without touching the rest of the DOM.
  clearInterval(statusTimer);
  statusTimer = setInterval(paintTopbar, 60_000);

  paintCartBadge();
}
