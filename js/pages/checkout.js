/**
 * pages/checkout.js — customer details + the preorder slot picker.
 *
 * This is where Goal 2 lives: a date strip, a capacity-aware slot grid and a
 * hard cutoff that refuses to let an order into a window that is already full
 * (or too close to its start time).
 */

import { html, raw, currency, number } from '../utils/format.js';
import { formatDateShort } from '../utils/date.js';
import {
  getCart, getCheckout, saveCheckout, computeTotals, evaluatePromo, cartCount, getLocalOrders, getProfile,
} from '../store.js';
import { currentCustomer, touchSession } from '../auth.js';
import { getCatalog, getPromoCodes, getFestivals, getAllOrders } from '../api.js';
import {
  buildSlotBoard, buildDateOptions, bookingIndex, festivalDayKeys,
  assertSlotAvailable, CUTOFF_MINUTES, PREORDER_WINDOW_DAYS,
} from '../utils/timeslots.js';
import {
  validateForm, validateName, validatePhone, validateEmail, validateAddress,
  sanitizeText, normalisePhone, paintErrors,
} from '../utils/validators.js';
import { skeletonRows } from '../components/skeleton.js';
import { toast } from '../components/toast.js';
import { track, EVENTS } from '../analytics.js';

const context = {
  bookings: new Map(),
  festivalKeys: new Set(),
  festivals: [],
  dates: [],
  promos: [],
};

/* -------------------------------------------------------------------------- */
/* Slot UI                                                                    */
/* -------------------------------------------------------------------------- */

function slotCard(slot, selectedId) {
  const tone =
    slot.status === 'full' ? 'full'
      : slot.utilisation > 0.75 ? 'high'
        : slot.utilisation > 0.4 ? 'mid' : '';

  const badge = {
    full: '<span class="badge badge--danger">Slot full</span>',
    closed: '<span class="badge badge--muted">Closed</span>',
    filling: `<span class="badge badge--warn">Only ${slot.remaining} left</span>`,
    open: `<span class="badge badge--success">${slot.remaining} open</span>`,
  }[slot.status];

  return html`
    <button class="slot-card" type="button" data-slot="${slot.id}"
      aria-pressed="${selectedId === slot.id}"
      ${slot.bookable ? '' : raw('disabled')}
      aria-label="${slot.label}. ${slot.reason || `${slot.remaining} of ${slot.capacity} places left`}">
      <span class="slot-card__time">${slot.startLabel} – ${slot.endLabel}</span>
      <span class="slot-card__meta">${raw(badge)}<span>${slot.booked}/${slot.capacity}</span></span>
      <span class="capacity-bar">
        <span class="capacity-bar__fill ${tone ? `capacity-bar__fill--${tone}` : ''}"
          style="width:${(slot.utilisation * 100).toFixed(0)}%"></span>
      </span>
      ${slot.status === 'closed' ? raw(`<span class="field__hint">${slot.reason}</span>`) : ''}
    </button>`;
}

function slotBoardMarkup(key, selectedId) {
  const board = buildSlotBoard({
    key,
    bookings: context.bookings,
    festivalKeys: context.festivalKeys,
    now: Date.now(),
  });

  const open = board.filter((slot) => slot.bookable).length;
  const full = board.filter((slot) => slot.status === 'full').length;

  return html`
    <div class="row row--between" style="margin-bottom:var(--sp-3)">
      <span class="pill-note">
        ${open} of ${board.length} windows open${full ? ` · ${full} already full` : ''}
      </span>
      ${context.festivalKeys.has(key)
        ? raw('<span class="badge badge--festival">Festival day · extra capacity added</span>')
        : ''}
    </div>

    ${open === 0
      ? raw(`<div class="notice notice--danger" style="margin-bottom:var(--sp-3)">
          <span class="notice__icon" aria-hidden="true">🚫</span>
          <div><strong>Every window on this date is closed</strong>
          <p>Bookings shut ${CUTOFF_MINUTES} minutes before a window starts. Please pick another date.</p></div>
        </div>`)
      : ''}

    <div class="slot-grid">${raw(board.map((slot) => slotCard(slot, selectedId)).join(''))}</div>`;
}

function dateStripMarkup(selectedKey) {
  return html`
    <div class="date-scroller" role="group" aria-label="Choose a preorder date">
      ${raw(context.dates.map((day) => `
        <button class="date-pill ${day.isFestival ? 'date-pill--festival' : ''}" type="button"
          data-date="${day.key}" aria-pressed="${day.key === selectedKey}"
          aria-label="${day.isToday ? 'Today' : formatDateShort(day.ms)}${day.festivalName ? `, ${day.festivalName}` : ''}">
          <small>${day.isToday ? 'Today' : day.dayShort}</small>
          <b>${day.dayNum}</b>
          <i>${day.month}${day.isFestival ? ' 🎊' : ''}</i>
        </button>`).join(''))}
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

function summaryMarkup() {
  const cart = getCart();
  const checkout = getCheckout();
  const promo = context.promos.find((entry) => entry.code === checkout.promoCode);
  const evaluation = promo ? evaluatePromo(promo, { cart, deliveryType: checkout.deliveryType }) : null;
  const discount = evaluation?.valid ? evaluation.discount : 0;
  const totals = computeTotals({ cart, discount, deliveryType: checkout.deliveryType });

  return html`
    <div class="summary-card">
      <h3>Order summary</h3>

      <ul class="kv-list" style="margin-bottom:var(--sp-4)">
        ${raw(cart.slice(0, 4).map((line) => `
          <li><span>${line.qty} × ${line.name}</span><b>${currency(line.qty * line.price)}</b></li>`).join(''))}
        ${cart.length > 4 ? raw(`<li><span>+ ${cart.length - 4} more items</span><b></b></li>`) : ''}
      </ul>

      <div class="summary-line"><span>Item total</span><span>${currency(totals.subtotal)}</span></div>
      ${discount > 0
        ? raw(`<div class="summary-line summary-line--discount"><span>${checkout.promoCode}</span><span>− ${currency(discount)}</span></div>`)
        : ''}
      <div class="summary-line"><span>GST (5%)</span><span>${currency(totals.tax)}</span></div>
      <div class="summary-line"><span>Packaging</span><span>${currency(totals.packagingFee)}</span></div>
      <div class="summary-line">
        <span>${checkout.deliveryType === 'pickup' ? 'Store pickup' : 'Delivery'}</span>
        <span>${totals.deliveryFee ? currency(totals.deliveryFee) : 'Free'}</span>
      </div>
      <div class="summary-line summary-line--total"><span>To pay</span><span>${currency(totals.total)}</span></div>

      <div data-slot-recap style="margin-top:var(--sp-4)"></div>

      <button class="btn btn--primary btn--block btn--lg" type="submit" form="checkout-form"
        style="margin-top:var(--sp-4)">
        Continue to payment
      </button>
      <a class="btn btn--ghost btn--block btn--sm" href="#/order" style="margin-top:var(--sp-2)">Back to cart</a>
    </div>`;
}

function slotRecapMarkup() {
  const { preorderDate, timeSlotId, deliveryType } = getCheckout();
  if (!preorderDate || !timeSlotId) {
    return html`<div class="notice notice--warn">
      <span class="notice__icon" aria-hidden="true">🕒</span>
      <p>Pick a date and a window to continue.</p>
    </div>`;
  }

  const board = buildSlotBoard({
    key: preorderDate,
    bookings: context.bookings,
    festivalKeys: context.festivalKeys,
    now: Date.now(),
  });
  const slot = board.find((entry) => entry.id === timeSlotId);
  if (!slot) return '';

  return html`
    <div class="notice notice--success">
      <span class="notice__icon" aria-hidden="true">✅</span>
      <div>
        <strong>${deliveryType === 'pickup' ? 'Pickup' : 'Delivery'} reserved</strong>
        <p>${formatDateShort(slot.startsAt)} · ${slot.startLabel} – ${slot.endLabel}
        (${slot.remaining} ${slot.remaining === 1 ? 'place' : 'places'} left)</p>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Form                                                                       */
/* -------------------------------------------------------------------------- */

function field({ name, label, type = 'text', value = '', placeholder = '', required = false, hint = '', full = false, maxlength = 120 }) {
  return html`
    <div class="field ${full ? 'field--full' : ''}">
      <label for="f-${name}">${label} ${required ? raw('<span class="req" aria-hidden="true">*</span>') : ''}</label>
      <input class="input" id="f-${name}" name="${name}" type="${type}" value="${value}"
        placeholder="${placeholder}" maxlength="${maxlength}"
        ${required ? raw('required aria-required="true"') : ''} />
      ${hint ? raw(`<span class="field__hint">${hint}</span>`) : ''}
      <span class="field__error" role="alert"></span>
    </div>`;
}

function formMarkup() {
  const checkout = getCheckout();
  const profile = getProfile();
  const account = currentCustomer();

  // Account details win, then whatever was typed before, then the old profile.
  const values = {
    name: checkout.name || account?.name || profile?.name || '',
    phone: checkout.phone || account?.phone || profile?.phone || '',
    email: checkout.email || account?.email || profile?.email || '',
    address: checkout.address || account?.addressLine || profile?.address || '',
    landmark: checkout.landmark || account?.area || '',
    notes: checkout.notes || '',
  };

  return html`
    <form id="checkout-form" novalidate>
      <div class="panel" style="margin-bottom:var(--sp-5)">
        <div class="panel__head">
          <h3>1 · Your details</h3>
          <span>We only use this to hand over your order</span>
        </div>

        ${account
          ? raw(`<div class="notice notice--success" style="margin-bottom:var(--sp-4)">
              <span class="notice__icon" aria-hidden="true">✅</span>
              <div>
                <strong>Ordering as ${account.name}</strong>
                <p>This order will be saved to your account, and only you can track it.
                   <a href="#/account">View your orders</a></p>
              </div>
            </div>`)
          : ''}

        <div class="form-grid">
          ${raw(field({ name: 'name', label: 'Full name', value: values.name, placeholder: 'Ananya Sharma', required: true, maxlength: 50 }))}
          ${raw(field({ name: 'phone', label: 'Mobile number', type: 'tel', value: values.phone, placeholder: '+91 98765 43210', required: true, hint: 'We call only if the delivery rider cannot find you.', maxlength: 20 }))}
          ${raw(field({ name: 'email', label: 'Email (optional)', type: 'email', value: values.email, placeholder: 'you@example.com', full: false }))}

          <div class="field">
            <label id="delivery-label">Hand-over method <span class="req" aria-hidden="true">*</span></label>
            <div class="switch-group" role="group" aria-labelledby="delivery-label">
              <button type="button" data-delivery-type="delivery"
                aria-pressed="${checkout.deliveryType === 'delivery'}">🛵 Delivery</button>
              <button type="button" data-delivery-type="pickup"
                aria-pressed="${checkout.deliveryType === 'pickup'}">🏪 Pickup</button>
            </div>
          </div>

          <div class="field field--full" data-address-field
            ${checkout.deliveryType === 'pickup' ? raw('hidden') : ''}>
            <label for="f-address">Delivery address / hostel block <span class="req" aria-hidden="true">*</span></label>
            <textarea class="textarea" id="f-address" name="address" maxlength="200"
              placeholder="Room 214, Aryabhatta Hostel Block A, near the main gate">${values.address}</textarea>
            <span class="field__hint">Hostel? Add the block and room number — it saves a phone call.</span>
            <span class="field__error" role="alert"></span>
          </div>

          ${raw(field({ name: 'landmark', label: 'Landmark (optional)', value: values.landmark, placeholder: 'Opposite the library gate' }))}

          <div class="field field--full">
            <label for="f-notes">Notes for the kitchen (optional)</label>
            <textarea class="textarea" id="f-notes" name="notes" maxlength="200"
              placeholder="Less sugar in the chai, please pack sweets separately…">${values.notes}</textarea>
            <span class="field__error" role="alert"></span>
          </div>

          <label class="checkbox-row field--full">
            <input type="checkbox" name="giftWrap" ${checkout.giftWrap ? raw('checked') : ''} />
            <span>Gift wrap this order with a hand-written card (free during festival week)</span>
          </label>

          <label class="checkbox-row field--full">
            <input type="checkbox" name="contactless" ${checkout.contactless ? raw('checked') : ''} />
            <span>Contactless hand-over — leave it at the counter/gate and message me</span>
          </label>
        </div>
      </div>

      <div class="panel">
        <div class="panel__head">
          <h3>2 · Pick your slot</h3>
          <span>Bookings close ${CUTOFF_MINUTES} minutes before a window starts</span>
        </div>

        <p class="text-soft" style="font-size:var(--fs-sm)">
          Each window has a fixed capacity so the kitchen can actually keep its promise.
          Full windows are disabled automatically — this is the festival-rush fix.
        </p>

        <div data-date-strip style="margin-bottom:var(--sp-4)">${raw(dateStripMarkup(checkout.preorderDate))}</div>
        <div data-slot-board>${raw(slotBoardMarkup(checkout.preorderDate, checkout.timeSlotId))}</div>
      </div>
    </form>`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default {
  title: 'Checkout',

  skeleton: () => html`
    <div class="page">
      <section class="page-head"><div class="container"><h1>Checkout</h1></div></section>
      <section class="section"><div class="container">${raw(skeletonRows(4))}</div></section>
    </div>`,

  async render() {
    touchSession('customer');

    const [, promos, festivals, orders] = await Promise.all([
      getCatalog(),
      getPromoCodes(),
      getFestivals(),
      getAllOrders(getLocalOrders()),
    ]);

    context.promos = promos;
    context.festivals = festivals;
    context.bookings = bookingIndex(orders);
    context.festivalKeys = festivalDayKeys(festivals);
    context.dates = buildDateOptions({ festivals, days: PREORDER_WINDOW_DAYS });

    // Default to today unless the customer already chose something valid.
    const checkout = getCheckout();
    if (!context.dates.some((day) => day.key === checkout.preorderDate)) {
      saveCheckout({ preorderDate: context.dates[0].key, timeSlotId: '' });
    }

    track(EVENTS.CHECKOUT_START, { items: cartCount(), value: computeTotals().total });

    return html`
      <section class="page-head">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/order">Cart</a> <span aria-hidden="true">›</span>
            <strong>Checkout</strong> <span aria-hidden="true">›</span>
            <span class="text-muted">Payment</span>
          </nav>
          <h1>Almost there</h1>
          <p>
            Tell us where the box is going and pick a hand-over window.
            ${number(context.bookings.size)} windows already have bookings today.
          </p>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container">
          <div class="split-layout">
            <div data-form-host>${raw(formMarkup())}</div>
            <div data-summary>${raw(summaryMarkup())}</div>
          </div>
        </div>
      </section>`;
  },

  mount(root, ctx) {
    const form = root.querySelector('#checkout-form');
    const summary = root.querySelector('[data-summary]');
    const slotBoard = root.querySelector('[data-slot-board]');
    const dateStrip = root.querySelector('[data-date-strip]');

    /**
     * The form is the source of truth on submit — fields can be pre-filled from
     * the signed-in account without ever firing an `input` event.
     */
    const readForm = () => {
      const data = Object.fromEntries(new FormData(form).entries());
      return {
        name: sanitizeText(data.name, 50),
        phone: sanitizeText(data.phone, 20),
        email: sanitizeText(data.email, 120),
        address: sanitizeText(data.address, 200),
        landmark: sanitizeText(data.landmark, 120),
        notes: sanitizeText(data.notes, 200),
        giftWrap: Boolean(data.giftWrap),
        contactless: Boolean(data.contactless),
      };
    };

    // Seed the draft with whatever the account pre-filled.
    saveCheckout(readForm());

    const repaintSummary = () => {
      summary.innerHTML = summaryMarkup();
      summary.querySelector('[data-slot-recap]').innerHTML = slotRecapMarkup();
    };

    const repaintSlots = () => {
      const { preorderDate, timeSlotId } = getCheckout();
      dateStrip.innerHTML = dateStripMarkup(preorderDate);
      slotBoard.innerHTML = slotBoardMarkup(preorderDate, timeSlotId);
      repaintSummary();
    };

    repaintSummary();

    /* ---- Delivery type + address visibility ------------------------------ */
    form.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-delivery-type]');
      if (toggle) {
        const type = toggle.dataset.deliveryType;
        saveCheckout({ deliveryType: type });
        form.querySelectorAll('[data-delivery-type]').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.deliveryType === type));
        });
        form.querySelector('[data-address-field]').hidden = type === 'pickup';
        repaintSummary();
        return;
      }

      const dateButton = event.target.closest('[data-date]');
      if (dateButton) {
        saveCheckout({ preorderDate: dateButton.dataset.date, timeSlotId: '' });
        repaintSlots();
        return;
      }

      const slotButton = event.target.closest('[data-slot]');
      if (slotButton) {
        if (slotButton.disabled) {
          track(EVENTS.SLOT_BLOCKED, { slot: slotButton.dataset.slot });
          return;
        }
        saveCheckout({ timeSlotId: slotButton.dataset.slot });
        track(EVENTS.SLOT_SELECTED, {
          slot: slotButton.dataset.slot,
          date: getCheckout().preorderDate,
        });
        slotBoard.querySelectorAll('[data-slot]').forEach((button) => {
          button.setAttribute('aria-pressed', String(button === slotButton));
        });
        repaintSummary();
      }
    });

    /* ---- Persist typing (so a refresh does not lose the form) ------------ */
    form.addEventListener('input', (event) => {
      const { name, type, value, checked } = event.target;
      if (!name) return;
      saveCheckout({ [name]: type === 'checkbox' ? checked : sanitizeText(value, 200) });
    });

    /* ---- Submit ---------------------------------------------------------- */
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      // Persist exactly what is on screen, then validate that.
      const checkout = saveCheckout(readForm());
      const isDelivery = checkout.deliveryType === 'delivery';

      const { valid, errors } = validateForm(checkout, {
        name: validateName,
        phone: validatePhone,
        email: (value) => validateEmail(value),
        address: (value) => validateAddress(value, { required: isDelivery }),
      });

      if (!valid) {
        paintErrors(form, errors);
        toast.error('Please fix the highlighted fields.');
        return;
      }

      if (!getCart().length) {
        toast.error('Your cart is empty.');
        ctx.navigate('/menu');
        return;
      }

      if (!checkout.timeSlotId) {
        toast.error('Choose a hand-over window before paying.');
        slotBoard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // Final auto-cutoff check — the slot may have filled while they typed.
      const check = assertSlotAvailable({
        key: checkout.preorderDate,
        slotId: checkout.timeSlotId,
        bookings: context.bookings,
        festivalKeys: context.festivalKeys,
      });

      if (!check.ok) {
        toast.error(check.message);
        track(EVENTS.SLOT_BLOCKED, { slot: checkout.timeSlotId, reason: 'cutoff' });
        saveCheckout({ timeSlotId: '' });
        repaintSlots();
        slotBoard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      saveCheckout({ phone: normalisePhone(checkout.phone) });
      ctx.navigate('/payment');
    });

    // Re-check slot availability every half minute so a stale tab cannot
    // sneak an order into a window that has since closed.
    this._timer = setInterval(repaintSlots, 30_000);
  },

  unmount() {
    clearInterval(this._timer);
    this._timer = null;
  },
};
