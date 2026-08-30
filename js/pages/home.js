/**
 * pages/home.js — the landing page.
 *
 * Renders instantly from the menu/offers JSON, then progressively fills in the
 * live preorder-slot strip and the shop stats once orders.json arrives. That
 * keeps the first paint fast even though the dataset has 1,000+ orders.
 */

import { html, raw, currency, number, joinHtml } from '../utils/format.js';
import { dateKey, daysUntil, formatDateShort, DAY_MS } from '../utils/date.js';
import { getCatalog, getBestsellers, getFestivalPicks, getOffers, getUpcomingFestival, getFestivals, getAllOrders } from '../api.js';
import { getLocalOrders } from '../store.js';
import { productGrid, attachProductGrid, consumptionNow } from '../components/productCard.js';
import { skeletonGrid } from '../components/skeleton.js';
import { bookingIndex, festivalDayKeys, summariseDay } from '../utils/timeslots.js';
import { currentAdmin } from '../auth.js';

/** The exact line the brief asks for — shown verbatim in the quote band. */
export const HOME_QUOTE =
  'Where great minds meet great bites, and every break becomes a memory. ' +
  'Fresh flavors, good vibes, and the perfect place to connect.';

const HERO_IMAGES = [
  { src: 'assets/images/kaju-katli.svg', alt: 'Kaju katli diamonds with silver leaf' },
  { src: 'assets/images/jalebi.svg', alt: 'Hot jalebi coils' },
  { src: 'assets/images/masala-chai.svg', alt: 'A cutting glass of masala chai' },
  { src: 'assets/images/samosa.svg', alt: 'Freshly fried samosas' },
];

const STEPS = [
  { title: 'Pick your favourites', body: 'Browse 400+ items across mithai, snacks, chai and festival hampers.' },
  { title: 'Choose a slot', body: 'Select a pickup or delivery window. Full slots are blocked automatically.' },
  { title: 'Pay your way', body: 'UPI, card, wallet or cash on delivery — all simulated for this demo.' },
  { title: 'Track till it is yours', body: 'Live status from Placed to Delivered, with an on-time promise.' },
];

const TESTIMONIALS = [
  {
    quote: 'I preorder a 6 PM slot on my way out of the lab and the box is on the counter when I reach. No queue, no arguments.',
    name: 'Ananya Sharma',
    role: 'Final year student, hostel block C',
  },
  {
    quote: 'Ordered 12 kg of mithai for Diwali. The slot system meant everything was packed and ready at 11 AM sharp.',
    name: 'Rakesh Malviya',
    role: 'Office admin, Vijay Nagar',
  },
  {
    quote: 'The stock badges are honest. If it says four gujiya left, there are four gujiya left. That is rare.',
    name: 'Priya Kulkarni',
    role: 'Regular since 2019',
  },
];

/* -------------------------------------------------------------------------- */
/* Markup helpers                                                             */
/* -------------------------------------------------------------------------- */

function heroSection(categoryCount, itemCount) {
  return html`
    <section class="hero">
      <div class="hero__inner">
        <div>
          <span class="eyebrow"><span aria-hidden="true">✦</span> Since 1984 · Rajwada, Indore</span>
          <h1>Fresh mithai and hot chai, <em>without the queue</em>.</h1>
          <p class="hero__lede">
            Order from ${number(itemCount)} items across ${categoryCount} counters, reserve a
            pickup or delivery slot, and let the kitchen plan around you — especially
            during festival week.
          </p>

          <div class="hero__cta">
            <a class="btn btn--primary btn--lg" href="#/menu">Order now</a>
            <a class="btn btn--secondary btn--lg" href="#/menu?category=combos">Festival hampers</a>
          </div>

          <div class="hero__trust">
            <div><strong>4.8 ★</strong><span>2,400+ ratings</span></div>
            <div><strong>40 yrs</strong><span>same family, same recipes</span></div>
            <div><strong>11 slots</strong><span>every single day</span></div>
            <div><strong data-stat-ontime>—</strong><span>orders delivered on time</span></div>
          </div>
        </div>

        <div class="hero__art">
          ${raw(HERO_IMAGES.map((image) => `
            <figure>
              <img src="${image.src}" alt="${image.alt}" width="800" height="600" loading="eager" decoding="async" />
            </figure>`).join(''))}
          <div class="hero__badge">
            <span aria-hidden="true" style="font-size:1.6rem">🎊</span>
            <div>
              <b data-hero-festival>Festival preorders open</b>
              <span data-hero-festival-sub>Reserve a slot before it fills</span>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

function quoteSection() {
  return html`
    <section class="quote-band">
      <div class="quote-band__inner">
        <span class="quote-band__mark" aria-hidden="true">&ldquo;</span>
        <blockquote>${HOME_QUOTE}</blockquote>
        <cite>— The Mahalaxmi Sweets promise</cite>
      </div>
    </section>`;
}

function categorySection(categories) {
  return html`
    <section class="section">
      <div class="container">
        <div class="section-head reveal">
          <div class="section-head__text">
            <span class="eyebrow">Browse by counter</span>
            <h2>Six counters, one kitchen</h2>
            <p>Everything is made in small batches through the day, so what you order is what just came off the fire.</p>
          </div>
          <a class="btn btn--secondary" href="#/menu">See the full menu</a>
        </div>

        <div class="grid grid--3">
          ${raw(categories.map((category, index) => `
            <a class="category-tile reveal" data-reveal-delay="${index * 60}" href="#/menu?category=${category.id}">
              <img src="${category.image}" alt="${category.name}" width="800" height="500" loading="lazy" decoding="async" />
              <div class="category-tile__body">
                <h4>${category.icon} ${category.name}</h4>
                <span>${number(category.count)} items · from ${currency(category.fromPrice)}</span>
              </div>
            </a>`).join(''))}
        </div>
      </div>
    </section>`;
}

function slotStripSection() {
  return html`
    <section class="section section--alt">
      <div class="container">
        <div class="section-head reveal">
          <div class="section-head__text">
            <span class="eyebrow">Goal 2 · Festival rush &amp; preorder slotting</span>
            <h2>Live slot availability</h2>
            <p>
              Every hand-over window has a fixed capacity. When it fills, checkout is blocked
              for that window — so nobody is promised a box we cannot pack.
            </p>
          </div>
          <a class="btn btn--primary" href="#/checkout">Reserve a slot</a>
        </div>

        <div data-slot-strip>
          <div class="slot-strip">
            ${raw(Array.from({ length: 5 }, () => `
              <div class="slot-card" aria-hidden="true">
                <div class="skeleton skeleton-line" style="width:70%"></div>
                <div class="skeleton skeleton-line" style="width:44%"></div>
                <div class="skeleton" style="height:6px;border-radius:99px"></div>
              </div>`).join(''))}
          </div>
        </div>
      </div>
    </section>`;
}

function statSection() {
  const cell = (key, label) => `
    <div class="stat-strip__item">
      <b data-stat="${key}">—</b>
      <span>${label}</span>
    </div>`;

  return html`
    <section class="section section--tight">
      <div class="container">
        <div class="stat-strip reveal">
          ${raw(cell('orders', 'orders served (simulated)'))}
          ${raw(cell('revenue', 'lifetime revenue'))}
          ${raw(cell('aov', 'average order value'))}
          ${raw(cell('preorders', 'orders that booked a slot'))}
        </div>
      </div>
    </section>`;
}

function stepsSection() {
  return html`
    <section class="section">
      <div class="container">
        <div class="section-head reveal">
          <div class="section-head__text">
            <span class="eyebrow">How it works</span>
            <h2>Four steps, zero queue</h2>
          </div>
        </div>
        <div class="steps">
          ${raw(STEPS.map((step, index) => `
            <div class="step reveal" data-reveal-delay="${index * 70}">
              <h4>${step.title}</h4>
              <p>${step.body}</p>
            </div>`).join(''))}
        </div>
      </div>
    </section>`;
}

function testimonialSection() {
  return html`
    <section class="section section--alt">
      <div class="container">
        <div class="section-head reveal">
          <div class="section-head__text">
            <span class="eyebrow">From the counter</span>
            <h2>What regulars say</h2>
          </div>
        </div>
        <div class="grid grid--3">
          ${raw(TESTIMONIALS.map((entry, index) => `
            <figure class="testimonial reveal" data-reveal-delay="${index * 70}" style="margin:0">
              <p>“${entry.quote}”</p>
              <figcaption class="testimonial__who">
                <span class="avatar" aria-hidden="true">${entry.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                <span>
                  <b style="display:block;font-size:var(--fs-sm)">${entry.name}</b>
                  <span class="text-muted" style="font-size:var(--fs-xs)">${entry.role}</span>
                </span>
              </figcaption>
            </figure>`).join(''))}
        </div>
      </div>
    </section>`;
}

function ctaSection() {
  const admin = currentAdmin();

  return html`
    <section class="section">
      <div class="container">
        <div class="panel reveal" style="text-align:center;padding-block:var(--sp-7);background:
          linear-gradient(135deg, var(--cream-200), var(--orange-100))">
          <span class="eyebrow" style="justify-content:center">Staff only · owner &amp; manager</span>
          <h2>See the numbers behind the shop</h2>
          <p class="text-soft" style="max-width:56ch;margin-inline:auto">
            Revenue, top sellers, peak hours, slot utilisation, on-time percentage, stockout rate
            and a conversion funnel — all computed live from the same JSON this site runs on.
            ${admin ? '' : 'Sign in with an admin account to open it.'}
          </p>
          ${admin
            ? raw(`<a class="btn btn--dark btn--lg" href="#/admin">Open the insights dashboard</a>
                   <p class="field__hint" style="margin-top:var(--sp-3)">Signed in as ${admin.name} · ${admin.role}</p>`)
            : raw(`<a class="btn btn--dark btn--lg" href="#/admin-login">🔒 Staff sign-in</a>
                   <p class="field__hint" style="margin-top:var(--sp-3)">Restricted to Pawan Kumar (Owner) and Saurav Ranjan (Store Manager)</p>`)}
        </div>
      </div>
    </section>`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default {
  title: 'Home',

  skeleton: () => html`
    <div class="page">
      <section class="section"><div class="container">${raw(skeletonGrid(4))}</div></section>
    </div>`,

  async render() {
    const [{ categories, menu }, bestsellers, festivalPicks, offers, festival] = await Promise.all([
      getCatalog(),
      getBestsellers(8),
      getFestivalPicks(4),
      getOffers(),
      getUpcomingFestival(),
    ]);

    const consumption = consumptionNow();
    const banner = offers.banners?.[0];

    return html`
      ${raw(heroSection(categories.length, menu.length))}
      ${raw(quoteSection())}
      ${raw(categorySection(categories))}

      <section class="section">
        <div class="container">
          <div class="section-head reveal">
            <div class="section-head__text">
              <span class="eyebrow">Most ordered</span>
              <h2>What the city is eating today</h2>
              <p>Ranked by how often they leave the counter this month.</p>
            </div>
            <a class="btn btn--secondary" href="#/menu?sort=popularity">See all bestsellers</a>
          </div>
          <div data-home-grid>${raw(productGrid(bestsellers, { consumption }))}</div>
        </div>
      </section>

      ${raw(slotStripSection())}

      <section class="section">
        <div class="container">
          <div class="section-head reveal">
            <div class="section-head__text">
              <span class="eyebrow">Festival counter</span>
              <h2>${festival ? `Preorder for ${festival.name}` : 'Festival hampers'}</h2>
              <p>
                ${banner?.subtitle || 'Hampers, gift boxes and bulk trays, packed the morning of your slot.'}
              </p>
            </div>
            <a class="btn btn--secondary" href="#/offers">Offers &amp; bulk orders</a>
          </div>
          <div data-festival-grid>${raw(productGrid(festivalPicks, { consumption }))}</div>
        </div>
      </section>

      ${raw(statSection())}
      ${raw(stepsSection())}
      ${raw(testimonialSection())}
      ${raw(ctaSection())}`;
  },

  async mount(root) {
    const { byId } = await getCatalog();

    root.querySelectorAll('[data-product-grid]').forEach((grid) => attachProductGrid(grid, byId));

    // ---- Progressive enhancement: everything below needs orders.json -------
    try {
      const [orders, festivals, upcoming] = await Promise.all([
        getAllOrders(getLocalOrders()),
        getFestivals(),
        getUpcomingFestival(),
      ]);

      paintSlotStrip(root, orders, festivals);
      paintStats(root, orders);
      paintHeroBadge(root, upcoming);
    } catch (error) {
      console.warn('[home] live data unavailable', error);
      const strip = root.querySelector('[data-slot-strip]');
      if (strip) {
        strip.innerHTML = html`<div class="notice notice--warn">
          <span class="notice__icon" aria-hidden="true">⚠️</span>
          <p>Live slot data could not be loaded. Slot booking still works at checkout.</p>
        </div>`;
      }
    }
  },
};

/* -------------------------------------------------------------------------- */
/* Progressive fills                                                          */
/* -------------------------------------------------------------------------- */

function paintSlotStrip(root, orders, festivals) {
  const host = root.querySelector('[data-slot-strip]');
  if (!host) return;

  const now = Date.now();
  const bookings = bookingIndex(orders);
  const festKeys = festivalDayKeys(festivals);

  const days = [0, 1, 2].map((offset) =>
    summariseDay({ key: dateKey(now + offset * DAY_MS), bookings, festivalKeys: festKeys, now })
  );

  const dayBlocks = days.map((day, index) => {
    const slots = day.board.slice(index === 0 ? -6 : 0, index === 0 ? undefined : 6);
    const cards = slots.map((slot) => {
      const tone =
        slot.status === 'full' ? 'full' : slot.utilisation > 0.75 ? 'high' : slot.utilisation > 0.4 ? 'mid' : '';
      const badge =
        slot.status === 'full'
          ? '<span class="badge badge--danger">Slot full</span>'
          : slot.status === 'closed'
            ? '<span class="badge badge--muted">Closed</span>'
            : slot.status === 'filling'
              ? `<span class="badge badge--warn">${slot.remaining} left</span>`
              : `<span class="badge badge--success">${slot.remaining} open</span>`;

      return `
        <div class="slot-card" style="cursor:default">
          <span class="slot-card__time">${slot.startLabel}</span>
          <span class="slot-card__meta">${badge}<span>${slot.booked}/${slot.capacity}</span></span>
          <span class="capacity-bar"><span class="capacity-bar__fill ${tone ? `capacity-bar__fill--${tone}` : ''}"
            style="width:${(slot.utilisation * 100).toFixed(0)}%"></span></span>
        </div>`;
    });

    return `
      <div class="reveal" data-reveal-delay="${index * 80}" style="margin-bottom:var(--sp-5)">
        <div class="row row--between" style="margin-bottom:var(--sp-3)">
          <h4 style="margin:0">
            ${index === 0 ? 'Today' : formatDateShort(now + index * DAY_MS)}
            ${day.isFestivalDay ? '<span class="badge badge--festival">Festival capacity</span>' : ''}
          </h4>
          <span class="pill-note">${day.booked}/${day.capacity} booked · ${Math.round(day.utilisation * 100)}% full</span>
        </div>
        <div class="slot-strip">${cards.join('')}</div>
      </div>`;
  });

  host.innerHTML = joinHtml(dayBlocks);
  host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
}

function paintStats(root, orders) {
  const billable = orders.filter((order) => order.status !== 'Cancelled');
  const revenue = billable.reduce((total, order) => total + order.total, 0);
  const preorders = billable.filter((order) => order.preorderDate && order.timeSlotId).length;
  const delivered = orders.filter((order) => order.status === 'Delivered' && order.onTime !== null);
  const onTime = delivered.filter((order) => order.onTime).length;

  const set = (key, value) => {
    const el = root.querySelector(`[data-stat="${key}"]`);
    if (el) el.textContent = value;
  };

  set('orders', number(billable.length));
  set('revenue', `₹${(revenue / 100000).toFixed(1)}L`);
  set('aov', currency(billable.length ? revenue / billable.length : 0));
  set('preorders', `${Math.round((preorders / (billable.length || 1)) * 100)}%`);

  const onTimeEl = root.querySelector('[data-stat-ontime]');
  if (onTimeEl && delivered.length) {
    onTimeEl.textContent = `${Math.round((onTime / delivered.length) * 100)}%`;
  }
}

function paintHeroBadge(root, festival) {
  if (!festival) return;
  const title = root.querySelector('[data-hero-festival]');
  const sub = root.querySelector('[data-hero-festival-sub]');
  const days = daysUntil(festival.date);

  if (title) title.textContent = days <= 0 ? `${festival.name} is here` : `${festival.name} in ${days} days`;
  if (sub) sub.textContent = 'Preorder slots are open now';
}
