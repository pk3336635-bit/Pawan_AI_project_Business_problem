/**
 * pages/login.js — customer sign-in and sign-up.
 *
 * You can browse and fill a cart as a guest, but you must have an account to
 * reach checkout. That is what ties every order to a person, which is what
 * makes "only my orders" and the admin's live order feed possible.
 */

import { html, raw } from '../utils/format.js';
import {
  loginCustomer, registerCustomer, currentCustomer, lockoutSecondsLeft,
  getCustomers, DEMO_CUSTOMER_PASSWORD,
} from '../auth.js';
import { getCart, cartCount, clearCheckout } from '../store.js';
import { sanitizeText } from '../utils/validators.js';
import { toast } from '../components/toast.js';

const NEXT_ROUTES = {
  checkout: '/checkout',
  payment: '/checkout',
  tracking: '/tracking',
  account: '/account',
};

function fieldMarkup({ name, label, type = 'text', placeholder = '', hint = '', autocomplete = 'off', maxlength = 80, full = true }) {
  return html`
    <div class="field ${full ? 'field--full' : ''}">
      <label for="l-${name}">${label} <span class="req" aria-hidden="true">*</span></label>
      <input class="input" id="l-${name}" name="${name}" type="${type}" placeholder="${placeholder}"
        autocomplete="${autocomplete}" maxlength="${maxlength}" autocapitalize="none" spellcheck="false" />
      ${hint ? raw(`<span class="field__hint">${hint}</span>`) : ''}
      <span class="field__error" role="alert"></span>
    </div>`;
}

export default {
  title: 'Sign in',

  render(ctx) {
    if (currentCustomer()) {
      ctx.navigate(NEXT_ROUTES[ctx.query.next] || '/account', { replace: true });
      return '';
    }

    const next = ctx.query.next || '';
    const items = cartCount(getCart());
    const startOnSignup = ctx.query.mode === 'signup';
    const demoAccounts = getCustomers().filter((customer) => customer.seeded);

    return html`
      <section class="page-head">
        <div class="container container--narrow">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Sign in</span>
          </nav>
          <h1>${startOnSignup ? 'Create your account' : 'Sign in to Mahalaxmi'}</h1>
          <p>Your orders, your slots, your history — kept to your account and nobody else's.</p>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container container--narrow">
          ${next
            ? raw(`<div class="notice notice--warn" style="margin-bottom:var(--sp-4)">
                <span class="notice__icon" aria-hidden="true">🔐</span>
                <div>
                  <strong>Sign in to place your order</strong>
                  <p>${items ? `Your ${items === 1 ? 'item is' : `${items} items are`} still in the cart — nothing is lost.` : 'It takes about twenty seconds.'}</p>
                </div>
              </div>`)
            : ''}

          <div class="split-layout" style="grid-template-columns:minmax(0,1fr) 300px">
            <div class="panel">
              <div class="tabs" role="tablist" aria-label="Sign in or create an account">
                <button role="tab" type="button" data-auth-tab="signin"
                  aria-selected="${!startOnSignup}">Sign in</button>
                <button role="tab" type="button" data-auth-tab="signup"
                  aria-selected="${startOnSignup}">Create account</button>
              </div>

              <!-- ---------------- Sign in ---------------- -->
              <form id="signin-form" role="tabpanel" novalidate autocomplete="on"
                style="margin-top:var(--sp-5)" ${startOnSignup ? raw('hidden') : ''}>
                <div class="form-grid">
                  ${raw(fieldMarkup({
                    name: 'handle',
                    label: 'Mobile number or email',
                    placeholder: '98765 43210',
                    autocomplete: 'username',
                  }))}

                  <div class="field field--full">
                    <label for="l-password">Password <span class="req" aria-hidden="true">*</span></label>
                    <div class="row" style="gap:var(--sp-2);flex-wrap:nowrap">
                      <input class="input" id="l-password" name="password" type="password" maxlength="64"
                        placeholder="••••••••" autocomplete="current-password" />
                      <button class="btn btn--secondary btn--sm" type="button" data-toggle-password="l-password"
                        aria-label="Show password" aria-pressed="false">Show</button>
                    </div>
                    <span class="field__error" role="alert"></span>
                  </div>

                  <label class="checkbox-row field--full">
                    <input type="checkbox" name="remember" checked />
                    <span>Keep me signed in on this device</span>
                  </label>
                </div>

                <div data-auth-feedback aria-live="polite"></div>

                <button class="btn btn--primary btn--block btn--lg" type="submit" style="margin-top:var(--sp-4)">
                  Sign in
                </button>
              </form>

              <!-- ---------------- Sign up ---------------- -->
              <form id="signup-form" role="tabpanel" novalidate autocomplete="on"
                style="margin-top:var(--sp-5)" ${startOnSignup ? '' : raw('hidden')}>
                <div class="form-grid">
                  ${raw(fieldMarkup({
                    name: 'name', label: 'Full name', placeholder: 'Ananya Sharma',
                    autocomplete: 'name', maxlength: 50, full: false,
                  }))}
                  ${raw(fieldMarkup({
                    name: 'phone', label: 'Mobile number', type: 'tel', placeholder: '98765 43210',
                    autocomplete: 'tel', maxlength: 20, full: false,
                  }))}
                  ${raw(fieldMarkup({
                    name: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com',
                    autocomplete: 'email', maxlength: 120,
                  }))}

                  <div class="field field--full">
                    <label for="l-newPassword">Password <span class="req" aria-hidden="true">*</span></label>
                    <div class="row" style="gap:var(--sp-2);flex-wrap:nowrap">
                      <input class="input" id="l-newPassword" name="newPassword" type="password" maxlength="64"
                        placeholder="At least 8 characters" autocomplete="new-password" />
                      <button class="btn btn--secondary btn--sm" type="button" data-toggle-password="l-newPassword"
                        aria-label="Show password" aria-pressed="false">Show</button>
                    </div>
                    <span class="field__hint">Minimum 8 characters, with letters and numbers.</span>
                    <span class="field__error" role="alert"></span>
                  </div>

                  <div class="field field--full">
                    <label for="l-addressLine">Delivery address or hostel block</label>
                    <textarea class="textarea" id="l-addressLine" name="addressLine" maxlength="200"
                      placeholder="Room 214, Aryabhatta Hostel Block A"></textarea>
                    <span class="field__hint">Optional now — we will ask again at checkout.</span>
                  </div>

                  <label class="checkbox-row field--full">
                    <input type="checkbox" name="terms" />
                    <span>I understand this is a college project and all orders and payments are simulated.</span>
                  </label>
                </div>

                <div data-signup-feedback aria-live="polite"></div>

                <button class="btn btn--primary btn--block btn--lg" type="submit" style="margin-top:var(--sp-4)">
                  Create account &amp; continue
                </button>
              </form>

              <a class="btn btn--ghost btn--block btn--sm" href="#/menu" style="margin-top:var(--sp-2)">
                Keep browsing as a guest
              </a>
            </div>

            <div class="stack">
              <div class="filter-card">
                <h4>Why an account?</h4>
                <ul class="text-soft" style="font-size:var(--fs-sm);padding-left:1.05rem;margin:0">
                  <li>Only you can see your orders and their live status</li>
                  <li>Your slot booking is tied to your name at the counter</li>
                  <li>Saved address and phone, so checkout is one tap</li>
                  <li>Full order history in one place</li>
                </ul>
              </div>

              <details class="filter-card" ${startOnSignup ? '' : raw('open')}>
                <summary style="cursor:pointer;font-weight:600;font-size:var(--fs-sm);color:var(--brown-600)">
                  Demo accounts
                </summary>
                <p class="field__hint" style="margin-top:var(--sp-2)">
                  Password for all three: <b>${DEMO_CUSTOMER_PASSWORD}</b>. They already have a
                  year of order history.
                </p>
                <ul class="kv-list" style="margin-top:var(--sp-2)">
                  ${raw(demoAccounts.map((customer) => `
                    <li>
                      <span>${customer.name}</span>
                      <b><button class="btn btn--ghost btn--sm" type="button"
                        data-fill-demo="${customer.phone}">${customer.phone.replace('+91', '')}</button></b>
                    </li>`).join(''))}
                </ul>
              </details>

              <div class="notice notice--info">
                <span class="notice__icon" aria-hidden="true">🔒</span>
                <p>
                  Passwords are stored as salted SHA-256 hashes in this browser, never in plain
                  text and never sent anywhere.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  },

  mount(root, ctx) {
    const signin = root.querySelector('#signin-form');
    const signup = root.querySelector('#signup-form');
    if (!signin || !signup) return;

    const tabs = root.querySelectorAll('[data-auth-tab]');
    const next = NEXT_ROUTES[ctx.query.next] || '/account';

    /* ---- Tabs ------------------------------------------------------------ */
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.authTab;
        tabs.forEach((entry) => entry.setAttribute('aria-selected', String(entry === tab)));
        signin.hidden = mode !== 'signin';
        signup.hidden = mode !== 'signup';
        (mode === 'signin' ? signin : signup).querySelector('input')?.focus();
      });
    });

    /* ---- Show / hide password ------------------------------------------- */
    root.querySelectorAll('[data-toggle-password]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = root.querySelector(`#${button.dataset.togglePassword}`);
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        button.textContent = showing ? 'Show' : 'Hide';
        button.setAttribute('aria-pressed', String(!showing));
        input.focus();
      });
    });

    /* ---- Demo account shortcut ------------------------------------------ */
    root.querySelectorAll('[data-fill-demo]').forEach((button) => {
      button.addEventListener('click', () => {
        tabs[0].click();
        signin.querySelector('#l-handle').value = button.dataset.fillDemo;
        signin.querySelector('#l-password').value = DEMO_CUSTOMER_PASSWORD;
        signin.querySelector('button[type="submit"]').focus();
      });
    });

    const feedbackInto = (host, message, tone = 'danger') => {
      host.innerHTML = html`
        <div class="notice notice--${tone}" style="margin-top:var(--sp-4)">
          <span class="notice__icon" aria-hidden="true">${tone === 'danger' ? '⚠️' : 'ℹ️'}</span>
          <p>${message}</p>
        </div>`;
    };

    const finish = (customer) => {
      // A fresh sign-in must not inherit the previous person's checkout draft.
      clearCheckout();
      toast.success(`Welcome, ${customer.name.split(' ')[0]}!`);
      ctx.navigate(next, { replace: true });
    };

    /* ---- Sign in --------------------------------------------------------- */
    signin.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = signin.querySelector('[data-auth-feedback]');
      const button = signin.querySelector('button[type="submit"]');

      const locked = lockoutSecondsLeft();
      if (locked > 0) {
        feedbackInto(feedback, `Too many failed attempts. Try again in ${locked} seconds.`);
        return;
      }

      const handle = sanitizeText(signin.querySelector('#l-handle').value, 120);
      const password = signin.querySelector('#l-password').value;
      const remember = signin.querySelector('[name="remember"]').checked;

      button.disabled = true;
      button.textContent = 'Checking…';
      const result = await loginCustomer(handle, password, { remember });
      button.disabled = false;
      button.textContent = 'Sign in';
      signin.querySelector('#l-password').value = '';

      if (!result.ok) {
        feedbackInto(feedback, result.message);
        return;
      }
      finish(result.customer);
    });

    /* ---- Sign up --------------------------------------------------------- */
    signup.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = signup.querySelector('[data-signup-feedback]');
      const button = signup.querySelector('button[type="submit"]');

      if (!signup.querySelector('[name="terms"]').checked) {
        feedbackInto(feedback, 'Please tick the box to confirm you understand this is a simulation.');
        return;
      }

      const payload = {
        name: sanitizeText(signup.querySelector('#l-name').value, 50),
        phone: sanitizeText(signup.querySelector('#l-phone').value, 20),
        email: sanitizeText(signup.querySelector('#l-email').value, 120),
        password: signup.querySelector('#l-newPassword').value,
        addressLine: sanitizeText(signup.querySelector('#l-addressLine').value, 200),
      };

      button.disabled = true;
      button.textContent = 'Creating your account…';
      const result = await registerCustomer(payload);
      button.disabled = false;
      button.textContent = 'Create account & continue';

      if (!result.ok) {
        feedbackInto(feedback, result.message);
        const input = result.field && signup.querySelector(`[name="${result.field}"], [name="new${result.field[0].toUpperCase()}${result.field.slice(1)}"]`);
        input?.focus();
        return;
      }
      finish(result.customer);
    });

    (signup.hidden ? signin : signup).querySelector('input')?.focus();
  },
};
