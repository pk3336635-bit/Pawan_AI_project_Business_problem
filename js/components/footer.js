/**
 * components/footer.js — site footer with the secondary navigation.
 * The Admin / Insights dashboard is reachable from here (and from the topbar).
 */

import { html, raw } from '../utils/format.js';
import { SHOP_HOURS } from './navbar.js';
import { formatClock } from '../utils/date.js';
import { currentAdmin, onAuthChange, logoutAdmin } from '../auth.js';

const COLUMNS = [
  {
    title: 'Order',
    links: [
      { label: 'Full menu', href: '#/menu' },
      { label: 'Your cart', href: '#/order' },
      { label: 'Checkout & slots', href: '#/checkout' },
      { label: 'Track an order', href: '#/tracking' },
    ],
  },
  {
    title: 'Discover',
    links: [
      { label: 'Offers & coupons', href: '#/offers' },
      { label: 'Festival hampers', href: '#/menu?category=combos' },
      { label: 'Bulk & corporate', href: '#/offers#bulk' },
      { label: 'Certificates & hygiene', href: '#/cert' },
    ],
  },
];

export function mountFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;

  const year = new Date().getFullYear();
  const admin = currentAdmin();

  // Customers only ever see "Staff sign-in"; the dashboard link appears once
  // an authorised admin is signed in.
  const staffLinks = admin
    ? `<a href="#/admin">📊 Insights dashboard</a>
       <a href="#/home" data-footer-logout>Sign out (${admin.name})</a>`
    : '<a href="#/admin-login">Staff sign-in</a>';

  footer.innerHTML = html`
    <div class="footer__inner">
      <div>
        <div class="footer__brand">
          <span class="brand__mark" aria-hidden="true">MS</span>
          <div>
            <div class="brand__name" style="color:var(--cream-100)">Mahalaxmi Sweets</div>
            <div class="brand__tag" style="color:var(--brown-200)">Muzaffarpur</div>
          </div>
        </div>
        <p>
          Three generations of halwais, one very busy kadhai. We put the shop online so
          you never have to stand in the 6 PM queue again.
        </p>
        <p class="mb-0">
          <strong style="color:var(--orange-300)">Open daily</strong>
          ${formatClock(SHOP_HOURS.open)} – ${formatClock(SHOP_HOURS.close)}
        </p>
      </div>

      ${raw(COLUMNS.map((column) => `
        <div>
          <h5>${column.title}</h5>
          <ul>
            ${column.links.map((link) => `<li><a href="${link.href}">${link.label}</a></li>`).join('')}
          </ul>
        </div>`).join(''))}

      <div>
        <h5>Visit or call</h5>
        <ul>
          <li><a href="tel:+917314902211">+91 731 490 2211</a></li>
          <li><a href="mailto:hello@mahalaxmisweets.example">hello@mahalaxmisweets.example</a></li>
        </ul>
        <p style="margin-top:var(--sp-3)">
          14, Rajwada Chowk, Indore,<br />Madhya Pradesh 452002
        </p>
        <p class="mb-0">
          <span class="badge badge--success">FSSAI 11522998000123</span>
        </p>
      </div>
    </div>

    <div class="footer__bottom">
      <span>© ${year} Mahalaxmi Sweets. A student project — orders and payments are simulated.</span>
      <span class="row" style="gap:var(--sp-4)">
        <a href="#/cert">Quality &amp; hygiene</a>
        ${raw(staffLinks)}
        <a href="#/home">Back to top ↑</a>
      </span>
    </div>`;

  footer.querySelector('[data-footer-logout]')?.addEventListener('click', (event) => {
    event.preventDefault();
    logoutAdmin();
  });
}

/** Re-render the footer whenever an admin signs in or out. */
onAuthChange(() => mountFooter());
