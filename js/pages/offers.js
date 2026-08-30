/**
 * pages/offers.js — coupons, festival combos and the bulk / corporate desk.
 *
 * The coupon rules here are the same ones the cart uses (store.evaluatePromo),
 * so what the page promises is exactly what checkout applies.
 */

import { html, raw, currency } from '../utils/format.js';
import { formatDate, formatDateShort, daysUntil } from '../utils/date.js';
import { getOffers, getCatalog, getFestivalPicks, getFestivals, getAllOrders } from '../api.js';
import { getCart, getCheckout, saveCheckout, evaluatePromo, saveOrder, getLocalOrders } from '../store.js';
import { productGrid, attachProductGrid, consumptionNow } from '../components/productCard.js';
import { skeletonGrid } from '../components/skeleton.js';
import {
  buildSlotBoard, bookingIndex, festivalDayKeys, buildDateOptions, assertSlotAvailable, getSlot,
} from '../utils/timeslots.js';
import { validateForm, validateName, validatePhone, validateQuantityKg, validateRequired, paintErrors, sanitizeText } from '../utils/validators.js';
import { orderId } from '../utils/uuid.js';
import { toast } from '../components/toast.js';
import { track, EVENTS } from '../analytics.js';

const data = {
  offers: null,
  bulkProducts: [],
  bookings: new Map(),
  festivalKeys: new Set(),
  dates: [],
};

/* -------------------------------------------------------------------------- */
/* Coupons                                                                    */
/* -------------------------------------------------------------------------- */

function couponCard(promo) {
  const cart = getCart();
  const evaluation = evaluatePromo(promo, { cart, deliveryType: getCheckout().deliveryType });
  const expired = promo.active === false || daysUntil(promo.validTill) < 0;
  const value = promo.type === 'percent' ? `${promo.value}%` : `₹${promo.value}`;

  return html`
    <article class="coupon ${expired ? 'is-expired' : ''}">
      <div class="coupon__side coupon__side--${promo.accent || 'orange'}">${value} OFF</div>
      <div class="coupon__body">
        <div class="row row--between" style="align-items:flex-start">
          <h4>${promo.title}</h4>
          <span class="badge ${expired ? 'badge--muted' : 'badge--hot'}">${promo.badge}</span>
        </div>
        <p>${promo.description}</p>

        <div class="row">
          <button class="coupon__code" type="button" data-copy-code="${promo.code}"
            aria-label="Copy coupon code ${promo.code}">
            <span aria-hidden="true">🏷️</span> ${promo.code}
          </button>
          ${expired
            ? raw('<span class="badge badge--danger">Expired</span>')
            : raw(`<button class="btn btn--secondary btn--sm" type="button" data-apply-code="${promo.code}">Apply to cart</button>`)}
        </div>

        <p class="field__hint" style="margin-top:var(--sp-2)">
          ${expired
            ? `Ran until ${formatDate(`${promo.validTill}T12:00:00+05:30`)}`
            : cart.length
              ? evaluation.message
              : `Valid till ${formatDate(`${promo.validTill}T12:00:00+05:30`)} · minimum ${currency(promo.minOrderValue)}`}
        </p>

        <ul class="coupon__terms">
          ${raw(promo.terms.map((term) => `<li>${term}</li>`).join(''))}
        </ul>
      </div>
    </article>`;
}

/* -------------------------------------------------------------------------- */
/* Bulk desk                                                                  */
/* -------------------------------------------------------------------------- */

function tierFor(kg) {
  return [...data.offers.bulkTiers].reverse().find((tier) => kg >= tier.minKg) || data.offers.bulkTiers[0];
}

function estimateFor({ productId, kg, packagingId }) {
  const product = data.bulkProducts.find((item) => item.id === productId) || data.bulkProducts[0];
  const packaging = data.offers.packagingOptions.find((option) => option.id === packagingId) || data.offers.packagingOptions[0];
  const quantity = Math.max(0, Number(kg) || 0);
  const tier = tierFor(quantity);

  const pricePerKg = product?.price || 0;
  const gross = pricePerKg * quantity;
  const discount = Math.round((gross * tier.discountPercent) / 100);
  const packagingCost = packaging.pricePerKg * quantity;
  const taxable = Math.max(0, gross - discount + packagingCost);
  const tax = Math.round(taxable * 0.05);

  return {
    product,
    packaging,
    tier,
    quantity,
    pricePerKg,
    gross: Math.round(gross),
    discount,
    packagingCost: Math.round(packagingCost),
    tax,
    total: Math.round(taxable + tax),
  };
}

function estimateMarkup(estimate) {
  if (!estimate.quantity) {
    return html`<p class="text-muted mb-0">Enter a quantity to see a live estimate.</p>`;
  }

  return html`
    <div class="summary-line"><span>${estimate.product.baseName} × ${estimate.quantity} kg</span><span>${currency(estimate.gross)}</span></div>
    <div class="summary-line summary-line--discount">
      <span>${estimate.tier.label} tier (−${estimate.tier.discountPercent}%)</span><span>− ${currency(estimate.discount)}</span>
    </div>
    <div class="summary-line"><span>${estimate.packaging.label}</span><span>${estimate.packagingCost ? currency(estimate.packagingCost) : 'Included'}</span></div>
    <div class="summary-line"><span>GST (5%)</span><span>${currency(estimate.tax)}</span></div>
    <div class="summary-line summary-line--total"><span>Estimated total</span><span>${currency(estimate.total)}</span></div>
    <p class="field__hint" style="margin-top:var(--sp-3)">
      Needs ${estimate.tier.leadTimeHours} hours of notice · ${currency(estimate.pricePerKg)} per kg before discount
    </p>`;
}

function slotOptions(key) {
  const board = buildSlotBoard({
    key,
    bookings: data.bookings,
    festivalKeys: data.festivalKeys,
    now: Date.now(),
  });

  const options = board.map((slot) => `
    <option value="${slot.id}" ${slot.bookable ? '' : 'disabled'}>
      ${slot.label}${slot.bookable ? ` — ${slot.remaining} left` : ` — ${slot.reason}`}
    </option>`);

  return `<option value="">Choose a packing window…</option>${options.join('')}`;
}

function bulkFormMarkup() {
  const estimate = estimateFor({ productId: data.bulkProducts[0]?.id, kg: 10, packagingId: 'P1' });

  return html`
    <form class="panel" id="bulk-form" novalidate>
      <div class="panel__head">
        <h3>Bulk &amp; corporate order desk</h3>
        <span>Weddings · offices · hostel messes · temple prasad</span>
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="b-productId">What would you like?</label>
          <select class="select" id="b-productId" name="productId">
            ${raw(data.bulkProducts.map((item) => `
              <option value="${item.id}">${item.baseName} — ${currency(item.price)}/kg</option>`).join(''))}
          </select>
        </div>

        <div class="field">
          <label for="b-kg">Quantity (kg) <span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="b-kg" name="kg" type="number" min="5" max="500" step="0.5" value="10" />
          <span class="field__hint">Tiered pricing starts at 5 kg.</span>
          <span class="field__error" role="alert"></span>
        </div>

        <div class="field">
          <label for="b-packagingId">Packaging</label>
          <select class="select" id="b-packagingId" name="packagingId">
            ${raw(data.offers.packagingOptions.map((option) => `
              <option value="${option.id}">${option.label}${option.pricePerKg ? ` (+₹${option.pricePerKg}/kg)` : ''}</option>`).join(''))}
          </select>
        </div>

        <div class="field">
          <label for="b-preorderDate">Preorder date <span class="req" aria-hidden="true">*</span></label>
          <select class="select" id="b-preorderDate" name="preorderDate">
            ${raw(data.dates.map((day) => `
              <option value="${day.key}">${formatDateShort(day.ms)}${day.isFestival ? ' 🎊' : ''}</option>`).join(''))}
          </select>
          <span class="field__error" role="alert"></span>
        </div>

        <div class="field field--full">
          <label for="b-timeSlotId">Packing &amp; hand-over window <span class="req" aria-hidden="true">*</span></label>
          <select class="select" id="b-timeSlotId" name="timeSlotId">
            ${raw(slotOptions(data.dates[0]?.key))}
          </select>
          <span class="field__hint">Full windows are disabled — capacity is shared with regular orders.</span>
          <span class="field__error" role="alert"></span>
        </div>

        <div class="field">
          <label for="b-name">Contact name <span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="b-name" name="name" maxlength="50" placeholder="Rakesh Malviya" />
          <span class="field__error" role="alert"></span>
        </div>

        <div class="field">
          <label for="b-phone">Mobile number <span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="b-phone" name="phone" type="tel" maxlength="20" placeholder="+91 98765 43210" />
          <span class="field__error" role="alert"></span>
        </div>

        <div class="field field--full">
          <label for="b-organisation">Organisation / occasion <span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="b-organisation" name="organisation" maxlength="80"
            placeholder="Sharma–Verma wedding, 400 guests" />
          <span class="field__error" role="alert"></span>
        </div>

        <div class="field field--full">
          <label for="b-notes">Anything else?</label>
          <textarea class="textarea" id="b-notes" name="notes" maxlength="200"
            placeholder="Sugar-free portion for 20 boxes, deliver to the banquet gate…"></textarea>
        </div>
      </div>

      <div class="divider-dashed"></div>

      <div class="grid grid--2" style="align-items:start">
        <div>
          <h4>Live estimate</h4>
          <div data-bulk-estimate>${raw(estimateMarkup(estimate))}</div>
        </div>
        <div>
          <h4>Quantity tiers</h4>
          <ul class="kv-list">
            ${raw(data.offers.bulkTiers.map((tier) => `
              <li><span>${tier.label}</span><b>${tier.discountPercent}% off · ${tier.leadTimeHours} h notice</b></li>`).join(''))}
          </ul>
          <button class="btn btn--primary btn--block btn--lg" type="submit" style="margin-top:var(--sp-4)">
            Place bulk preorder
          </button>
          <p class="field__hint" style="margin-top:var(--sp-2)">
            You will get an order ID immediately and can track it like any other order.
          </p>
        </div>
      </div>
    </form>`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default {
  title: 'Offers',

  skeleton: () => html`
    <div class="page">
      <section class="page-head"><div class="container"><h1>Offers</h1></div></section>
      <section class="section"><div class="container">${raw(skeletonGrid(4))}</div></section>
    </div>`,

  async render() {
    const [offers, { menu }, festivalPicks, festivals, orders] = await Promise.all([
      getOffers(),
      getCatalog(),
      getFestivalPicks(8),
      getFestivals(),
      getAllOrders(getLocalOrders()),
    ]);

    data.offers = offers;
    data.bookings = bookingIndex(orders);
    data.festivalKeys = festivalDayKeys(festivals);
    data.dates = buildDateOptions({ festivals, days: 10 });
    data.bulkProducts = menu
      .filter((item) => /1\s?kg/i.test(item.variant))
      .sort((a, b) => a.baseName.localeCompare(b.baseName));

    const upcoming = festivals
      .map((festival) => ({ ...festival, days: daysUntil(festival.date) }))
      .filter((festival) => festival.days >= 0)
      .slice(0, 4);

    return html`
      <section class="page-head">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Offers</span>
          </nav>
          <h1>Offers, festival packs &amp; bulk orders</h1>
          <p>
            Real coupon rules — minimum cart value, category limits, expiry dates and caps are all
            enforced by the same code the cart uses.
          </p>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container">
          <div class="grid grid--3">
            ${raw(offers.banners.map((banner) => `
              <a class="category-tile reveal" href="${banner.route}">
                <img src="assets/images/${banner.imageKey}.svg" alt="${banner.title}" width="800" height="500" loading="lazy" decoding="async" />
                <div class="category-tile__body">
                  <h4>${banner.title}</h4>
                  <span>${banner.subtitle}</span>
                </div>
              </a>`).join(''))}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-head reveal">
            <div class="section-head__text">
              <span class="eyebrow">Coupons</span>
              <h2>Codes you can use right now</h2>
              <p>Tap a code to copy it, or apply it straight to your cart.</p>
            </div>
            <a class="btn btn--secondary" href="#/order">Go to cart</a>
          </div>

          <div class="grid grid--2" data-coupons>
            ${raw(offers.promoCodes.map((promo) => couponCard(promo)).join(''))}
          </div>
        </div>
      </section>

      <section class="section section--alt">
        <div class="container">
          <div class="section-head reveal">
            <div class="section-head__text">
              <span class="eyebrow">Festival counter</span>
              <h2>Combo packs worth preordering</h2>
              <p>Hampers and thalis are packed the morning of your slot, never the night before.</p>
            </div>
          </div>

          <div class="row" style="margin-bottom:var(--sp-4)">
            ${raw(upcoming.map((festival) => `
              <span class="pill-note">🎊 ${festival.name} · ${festival.days === 0 ? 'today' : `in ${festival.days} days`}</span>`).join(''))}
          </div>

          <div data-festival-grid>${raw(productGrid(festivalPicks, { consumption: consumptionNow() }))}</div>
        </div>
      </section>

      <section class="section" id="bulk">
        <div class="container">
          <div class="section-head reveal">
            <div class="section-head__text">
              <span class="eyebrow">Bulk &amp; corporate</span>
              <h2>Ordering for a crowd?</h2>
              <p>
                Pick a sweet, tell us how many kilos, choose packaging and a hand-over window.
                The estimate updates as you type.
              </p>
            </div>
          </div>
          ${raw(bulkFormMarkup())}
        </div>
      </section>`;
  },

  async mount(root) {
    const { byId } = await getCatalog();
    root.querySelectorAll('[data-product-grid]').forEach((grid) => attachProductGrid(grid, byId));

    const coupons = root.querySelector('[data-coupons]');
    const form = root.querySelector('#bulk-form');

    /* ---- Coupon actions -------------------------------------------------- */
    coupons?.addEventListener('click', async (event) => {
      const copyButton = event.target.closest('[data-copy-code]');
      if (copyButton) {
        const code = copyButton.dataset.copyCode;
        try {
          await navigator.clipboard.writeText(code);
          toast.success(`${code} copied`);
        } catch {
          toast.info(`Coupon code: ${code}`);
        }
        return;
      }

      const applyButton = event.target.closest('[data-apply-code]');
      if (!applyButton) return;

      const code = applyButton.dataset.applyCode;
      const promo = data.offers.promoCodes.find((entry) => entry.code === code);
      const result = evaluatePromo(promo, { cart: getCart(), deliveryType: getCheckout().deliveryType });

      if (result.valid) {
        saveCheckout({ promoCode: code });
        toast.success(result.message, { action: { label: 'View cart', onClick: () => { location.hash = '#/order'; } } });
        track(EVENTS.PROMO_APPLIED, { code, discount: result.discount });
      } else {
        toast.error(result.message);
        track(EVENTS.PROMO_REJECTED, { code });
      }

      coupons.innerHTML = data.offers.promoCodes.map((entry) => couponCard(entry)).join('');
    });

    /* ---- Bulk desk ------------------------------------------------------- */
    if (!form) return;

    const estimateHost = form.querySelector('[data-bulk-estimate]');
    const slotSelect = form.querySelector('#b-timeSlotId');
    const dateSelect = form.querySelector('#b-preorderDate');

    const readForm = () => Object.fromEntries(new FormData(form).entries());

    const repaintEstimate = () => {
      estimateHost.innerHTML = estimateMarkup(estimateFor(readForm()));
    };

    form.addEventListener('input', repaintEstimate);
    form.addEventListener('change', (event) => {
      if (event.target === dateSelect) {
        slotSelect.innerHTML = slotOptions(dateSelect.value);
      }
      repaintEstimate();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = readForm();

      const { valid, errors } = validateForm(values, {
        name: validateName,
        phone: validatePhone,
        kg: (value) => validateQuantityKg(value),
        organisation: (value) => validateRequired(value, 'Organisation or occasion'),
        timeSlotId: (value) => validateRequired(value, 'A hand-over window'),
      });

      if (!valid) {
        paintErrors(form, errors);
        toast.error('Please complete the highlighted fields.');
        return;
      }

      const check = assertSlotAvailable({
        key: values.preorderDate,
        slotId: values.timeSlotId,
        bookings: data.bookings,
        festivalKeys: data.festivalKeys,
      });

      if (!check.ok) {
        toast.error(check.message);
        slotSelect.innerHTML = slotOptions(values.preorderDate);
        return;
      }

      const estimate = estimateFor(values);
      const tierLead = estimate.tier.leadTimeHours * 3600000;
      if (Date.parse(`${values.preorderDate}T09:00:00+05:30`) - Date.now() < tierLead) {
        toast.error(`${estimate.tier.label} orders need ${estimate.tier.leadTimeHours} hours of notice. Please pick a later date.`);
        return;
      }

      const order = buildBulkOrder(values, estimate);
      saveOrder(order);
      track(EVENTS.BULK_ENQUIRY, { kg: estimate.quantity, value: estimate.total, tier: estimate.tier.id });

      toast.success(`Bulk preorder ${order.id} placed`, {
        action: { label: 'Track it', onClick: () => { location.hash = `#/tracking?id=${encodeURIComponent(order.id)}`; } },
      });

      form.reset();
      slotSelect.innerHTML = slotOptions(data.dates[0]?.key);
      repaintEstimate();
      location.hash = `#/tracking?id=${encodeURIComponent(order.id)}`;
    });

    repaintEstimate();
  },
};

/* -------------------------------------------------------------------------- */
/* Bulk order record                                                          */
/* -------------------------------------------------------------------------- */

function buildBulkOrder(values, estimate) {
  const now = new Date();
  const slot = getSlot(values.timeSlotId);
  const promisedMs = Date.parse(`${values.preorderDate}T${slot?.end || '21:00'}:00+05:30`);

  return {
    id: orderId(values.preorderDate),
    userId: 'U-LOCAL',
    customerName: sanitizeText(values.name, 50),
    phone: sanitizeText(values.phone, 20),
    items: [{
      menuItemId: estimate.product.id,
      name: `${estimate.product.baseName} — ${estimate.quantity} kg bulk`,
      category: estimate.product.category,
      qty: Math.round(estimate.quantity),
      unitPrice: estimate.pricePerKg,
      lineTotal: estimate.gross,
    }],
    itemCount: Math.round(estimate.quantity),
    subtotal: estimate.gross,
    discount: estimate.discount,
    promoCode: `BULK-${estimate.tier.id}`,
    packagingFee: estimate.packagingCost,
    deliveryFee: 0,
    tax: estimate.tax,
    total: estimate.total,
    paymentMethod: 'COD',
    paymentStatus: 'Pending (invoice on hand-over)',
    status: 'Placed',
    statusHistory: [{ status: 'Placed', at: now.toISOString() }],
    channel: 'web',
    deliveryType: 'pickup',
    address: 'Store pickup — Rajwada Main Branch',
    area: sanitizeText(values.organisation, 80),
    notes: `${sanitizeText(values.organisation, 80)} · ${estimate.packaging.label}${values.notes ? ` · ${sanitizeText(values.notes, 200)}` : ''}`,
    preorderDate: values.preorderDate,
    timeSlotId: values.timeSlotId,
    slotLabel: slot?.label || '',
    isFestivalOrder: true,
    isBulkOrder: true,
    festivalName: null,
    promisedAt: new Date(promisedMs).toISOString(),
    completedAt: null,
    onTime: null,
    rating: null,
    isLocal: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
