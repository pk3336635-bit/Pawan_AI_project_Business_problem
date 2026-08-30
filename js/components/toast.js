/**
 * components/toast.js — small, accessible notifications.
 * Stacks at the bottom of the screen, auto-dismisses and never blocks the UI.
 */

import { html, raw } from '../utils/format.js';

const ICONS = { success: '✓', error: '!', info: '★' };
const DEFAULT_DURATION = 3200;
const MAX_VISIBLE = 3;

function stack() {
  let el = document.getElementById('toast-stack');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-stack';
    el.className = 'toast-stack';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

function dismiss(node) {
  if (!node || node.classList.contains('is-leaving')) return;
  node.classList.add('is-leaving');
  node.addEventListener('animationend', () => node.remove(), { once: true });
  // Safety net if the animation never fires (reduced motion).
  setTimeout(() => node.remove(), 400);
}

/**
 * @param {string} message
 * @param {{ type?: 'success'|'error'|'info', duration?: number,
 *           action?: { label: string, onClick: () => void } }} options
 */
export function showToast(message, options = {}) {
  const { type = 'info', duration = DEFAULT_DURATION, action } = options;
  const host = stack();

  while (host.children.length >= MAX_VISIBLE) dismiss(host.firstElementChild);

  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.innerHTML = html`
    <span class="toast__icon" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
    <span class="toast__msg">${message}</span>
    ${action ? raw('<button class="toast__action" type="button" data-toast-action></button>') : ''}
    <button class="toast__action" type="button" data-toast-close aria-label="Dismiss">✕</button>
  `;

  if (action) {
    const button = node.querySelector('[data-toast-action]');
    button.textContent = action.label;
    button.addEventListener('click', () => {
      dismiss(node);
      action.onClick?.();
    });
  }

  node.querySelector('[data-toast-close]').addEventListener('click', () => dismiss(node));

  let timer = setTimeout(() => dismiss(node), duration);
  node.addEventListener('mouseenter', () => clearTimeout(timer));
  node.addEventListener('mouseleave', () => {
    timer = setTimeout(() => dismiss(node), 1200);
  });

  host.appendChild(node);
  return () => dismiss(node);
}

export const toast = {
  success: (message, options) => showToast(message, { ...options, type: 'success' }),
  error: (message, options) => showToast(message, { ...options, type: 'error' }),
  info: (message, options) => showToast(message, { ...options, type: 'info' }),
};

export default toast;
