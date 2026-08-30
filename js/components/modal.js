/**
 * components/modal.js — accessible dialog host.
 * Handles focus trapping, Escape, scrim clicks and body scroll locking.
 */

import { html, raw } from '../utils/format.js';

const HOST_ID = 'modal-host';
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let activeCloser = null;
let lastFocused = null;

function host() {
  let el = document.getElementById(HOST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = HOST_ID;
    el.className = 'modal-host';
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

function trapFocus(container, event) {
  const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Opens a modal.
 * @param {{ title: string, body: string, footer?: string, wide?: boolean,
 *           onMount?: (root, close) => void, labelledBy?: string }} options
 * @returns {() => void} close function
 */
export function openModal({ title, body, footer = '', wide = false, onMount }) {
  closeModal();

  const el = host();
  lastFocused = document.activeElement;

  el.innerHTML = html`
    <div class="modal ${wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal__head">
        <h3 id="modal-title">${title}</h3>
        <button class="icon-btn" type="button" data-modal-close aria-label="Close dialog">✕</button>
      </div>
      <div class="modal__body">${raw(body)}</div>
      ${footer ? raw(`<div class="modal__foot">${footer}</div>`) : ''}
    </div>`;

  el.hidden = false;
  document.body.classList.add('no-scroll');

  const dialog = el.querySelector('.modal');

  const close = () => {
    el.hidden = true;
    el.innerHTML = '';
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKeydown, true);
    el.removeEventListener('click', onScrimClick);
    activeCloser = null;
    lastFocused?.focus?.();
  };

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      trapFocus(dialog, event);
    }
  }

  function onScrimClick(event) {
    if (event.target === el) close();
  }

  el.querySelectorAll('[data-modal-close]').forEach((button) =>
    button.addEventListener('click', close)
  );
  document.addEventListener('keydown', onKeydown, true);
  el.addEventListener('click', onScrimClick);

  activeCloser = close;
  onMount?.(dialog, close);

  // Focus the first meaningful control, not the close button, when possible.
  const focusTarget =
    dialog.querySelector('[data-autofocus]') ||
    dialog.querySelector('.modal__foot button, .modal__foot a') ||
    dialog.querySelector('[data-modal-close]');
  focusTarget?.focus();

  return close;
}

export function closeModal() {
  activeCloser?.();
}

/**
 * Promise-based confirmation dialog.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const close = openModal({
      title,
      body: html`<p class="text-soft mb-0">${message}</p>`,
      footer: `
        <button class="btn btn--secondary" type="button" data-confirm-cancel></button>
        <button class="btn ${danger ? 'btn--primary' : 'btn--dark'}" type="button" data-confirm-ok data-autofocus></button>`,
      onMount(dialog) {
        const cancel = dialog.querySelector('[data-confirm-cancel]');
        const ok = dialog.querySelector('[data-confirm-ok]');
        cancel.textContent = cancelLabel;
        ok.textContent = confirmLabel;

        cancel.addEventListener('click', () => {
          settle(false);
          close();
        });
        ok.addEventListener('click', () => {
          settle(true);
          close();
        });
      },
    });

    // Escape / scrim resolve as "cancel".
    const observer = new MutationObserver(() => {
      if (host().hidden) {
        observer.disconnect();
        settle(false);
      }
    });
    observer.observe(host(), { attributes: true, attributeFilter: ['hidden'] });
  });
}

export default { openModal, closeModal, confirmDialog };
