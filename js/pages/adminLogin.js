/**
 * pages/adminLogin.js — staff sign-in for the Insights dashboard.
 *
 * Only the two accounts listed in js/auth.js can get through. Customers who
 * land here see nothing but the form; no KPI data is fetched or rendered
 * until a session exists.
 */

import { html, raw } from '../utils/format.js';
import { ADMINS, loginAdmin, isAdmin, currentAdmin, lockoutSecondsLeft } from '../auth.js';
import { sanitizeText } from '../utils/validators.js';
import { toast } from '../components/toast.js';

export default {
  title: 'Staff sign-in',

  render(ctx) {
    // Already signed in? Straight through to the dashboard.
    if (isAdmin()) {
      ctx.navigate('/admin', { replace: true });
      return '';
    }

    const requested = ctx.query.next === 'admin';

    return html`
      <section class="page-head">
        <div class="container container--narrow">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Staff sign-in</span>
          </nav>
          <h1>Staff sign-in</h1>
          <p>The insights dashboard is restricted to the shop owner and the store manager.</p>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container container--narrow">
          ${requested
            ? raw(`<div class="notice notice--warn" style="margin-bottom:var(--sp-4)">
                <span class="notice__icon" aria-hidden="true">🔒</span>
                <div>
                  <strong>That page is for staff only</strong>
                  <p>Sign in with an admin account to view revenue, slot utilisation and the other KPIs.</p>
                </div>
              </div>`)
            : ''}

          <div class="split-layout" style="grid-template-columns:minmax(0,1fr) 300px">
            <form class="panel" id="admin-login-form" novalidate autocomplete="off">
              <div class="panel__head">
                <h3>Sign in</h3>
                <span>Session lasts 2 hours</span>
              </div>

              <div class="form-grid">
                <div class="field field--full">
                  <label for="a-username">Username or full name <span class="req" aria-hidden="true">*</span></label>
                  <input class="input" id="a-username" name="username" maxlength="40"
                    placeholder="pawan" autocomplete="username" autocapitalize="none" spellcheck="false" />
                  <span class="field__error" role="alert"></span>
                </div>

                <div class="field field--full">
                  <label for="a-password">Password <span class="req" aria-hidden="true">*</span></label>
                  <div class="row" style="gap:var(--sp-2);flex-wrap:nowrap">
                    <input class="input" id="a-password" name="password" type="password" maxlength="64"
                      placeholder="••••••••••" autocomplete="current-password" />
                    <button class="btn btn--secondary btn--sm" type="button" data-toggle-password
                      aria-label="Show password" aria-pressed="false">Show</button>
                  </div>
                  <span class="field__error" role="alert"></span>
                </div>

                <label class="checkbox-row field--full">
                  <input type="checkbox" name="remember" checked />
                  <span>Keep me signed in on this device for 2 hours</span>
                </label>
              </div>

              <div data-login-feedback aria-live="polite"></div>

              <button class="btn btn--primary btn--block btn--lg" type="submit" style="margin-top:var(--sp-4)">
                Sign in to the dashboard
              </button>

              <a class="btn btn--ghost btn--block btn--sm" href="#/home" style="margin-top:var(--sp-2)">
                Back to the shop
              </a>
            </form>

            <div class="stack">
              <div class="filter-card">
                <h4>Authorised accounts</h4>
                <ul class="kv-list">
                  ${raw(ADMINS.map((admin) => `
                    <li>
                      <span>${admin.name}</span>
                      <b>${admin.role}</b>
                    </li>`).join(''))}
                </ul>
                <p class="field__hint" style="margin-top:var(--sp-3)">
                  Everyone else browses the shop as a normal customer.
                </p>
              </div>

              <details class="filter-card">
                <summary style="cursor:pointer;font-weight:600;font-size:var(--fs-sm);color:var(--brown-600)">
                  Demo credentials
                </summary>
                <ul class="kv-list" style="margin-top:var(--sp-3)">
                  <li><span>pawan</span><b>Pawan@2026</b></li>
                  <li><span>saurav</span><b>Saurav@2026</b></li>
                </ul>
                <p class="field__hint" style="margin-top:var(--sp-3)">
                  Shown here so the project can be evaluated. Remove this block before any
                  real-world use.
                </p>
              </details>

              <div class="notice notice--info">
                <span class="notice__icon" aria-hidden="true">ℹ️</span>
                <p>
                  This is a front-end-only project, so the check runs in the browser.
                  Passwords are stored as salted SHA-256 hashes, never in plain text.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  },

  mount(root, ctx) {
    const form = root.querySelector('#admin-login-form');
    if (!form) return;

    const feedback = form.querySelector('[data-login-feedback]');
    const passwordInput = form.querySelector('#a-password');
    const submitButton = form.querySelector('button[type="submit"]');

    form.querySelector('#a-username')?.focus();

    /* ---- Show / hide password ------------------------------------------- */
    form.querySelector('[data-toggle-password]')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      button.textContent = showing ? 'Show' : 'Hide';
      button.setAttribute('aria-pressed', String(!showing));
      button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      passwordInput.focus();
    });

    const showError = (message) => {
      feedback.innerHTML = html`
        <div class="notice notice--danger" style="margin-top:var(--sp-4)">
          <span class="notice__icon" aria-hidden="true">⚠️</span>
          <p>${message}</p>
        </div>`;
    };

    /* ---- Submit ---------------------------------------------------------- */
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const locked = lockoutSecondsLeft();
      if (locked > 0) {
        showError(`Too many failed attempts. Try again in ${locked} seconds.`);
        return;
      }

      const username = sanitizeText(form.querySelector('#a-username').value, 40);
      const password = passwordInput.value;
      const remember = form.querySelector('[name="remember"]').checked;

      submitButton.disabled = true;
      submitButton.textContent = 'Checking…';

      const result = await loginAdmin(username, password, { remember });

      submitButton.disabled = false;
      submitButton.textContent = 'Sign in to the dashboard';
      passwordInput.value = '';

      if (!result.ok) {
        showError(result.message);
        passwordInput.focus();
        return;
      }

      feedback.innerHTML = '';
      toast.success(`Welcome back, ${currentAdmin().name.split(' ')[0]}`);
      ctx.navigate('/admin', { replace: true });
    });
  },
};
