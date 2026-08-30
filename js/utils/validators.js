/**
 * utils/validators.js
 * Input validation for the checkout, bulk-order and coupon forms.
 * All rules return `{ valid, message }` so the UI can render one consistent
 * error style, and every value is trimmed/normalised before it is stored.
 */

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PINCODE_RE = /^[1-9]\d{5}$/;
const NAME_RE = /^[a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F\s.'-]{1,49}$/;

const ok = { valid: true, message: '' };
const fail = (message) => ({ valid: false, message });

/** Strips control characters and clamps length — used on every free-text field. */
export function sanitizeText(value, maxLength = 300) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** "+91 98765 43210" / "9876543210" -> "+919876543210" */
export function normalisePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return last10.length === 10 ? `+91${last10}` : digits;
}

export function validateName(value) {
  const name = sanitizeText(value, 50);
  if (!name) return fail('Please enter your name');
  if (name.length < 2) return fail('Name looks too short');
  if (!NAME_RE.test(name)) return fail('Use letters, spaces, apostrophes or hyphens only');
  return ok;
}

export function validatePhone(value) {
  const phone = sanitizeText(value, 20);
  if (!phone) return fail('Please enter a mobile number');
  if (!PHONE_RE.test(phone.replace(/\s+/g, ' '))) {
    return fail('Enter a valid 10-digit Indian mobile number');
  }
  return ok;
}

export function validateEmail(value, { required = false } = {}) {
  const email = sanitizeText(value, 120);
  if (!email) return required ? fail('Please enter an email address') : ok;
  if (!EMAIL_RE.test(email)) return fail('That email address does not look right');
  return ok;
}

export function validateAddress(value, { required = true } = {}) {
  const address = sanitizeText(value, 200);
  if (!address) return required ? fail('Please add a delivery address or hostel block') : ok;
  if (address.length < 8) return fail('Add a little more detail (block, room, landmark)');
  return ok;
}

export function validatePincode(value, { required = false } = {}) {
  const pin = sanitizeText(value, 6);
  if (!pin) return required ? fail('Please enter a PIN code') : ok;
  if (!PINCODE_RE.test(pin)) return fail('Enter a valid 6-digit PIN code');
  return ok;
}

export function validateRequired(value, label = 'This field') {
  return sanitizeText(value, 200) ? ok : fail(`${label} is required`);
}

export function validateQuantityKg(value, { min = 5, max = 500 } = {}) {
  const qty = Number(value);
  if (!Number.isFinite(qty)) return fail('Enter a quantity in kilograms');
  if (qty < min) return fail(`Bulk orders start at ${min} kg`);
  if (qty > max) return fail(`For more than ${max} kg please call the shop`);
  return ok;
}

/** UPI id like name@bank — only used for the simulated payment screen. */
export function validateUpiId(value) {
  const id = sanitizeText(value, 60);
  if (!id) return fail('Enter your UPI ID');
  if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(id)) return fail('UPI ID should look like name@bank');
  return ok;
}

/** Card checks are Luhn + length only. Nothing is stored or transmitted. */
export function validateCardNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return fail('Enter your card number');
  if (digits.length < 15 || digits.length > 16) return fail('Card number should be 15–16 digits');

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0 ? ok : fail('That card number failed the checksum test');
}

export function validateCardExpiry(value) {
  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return fail('Use MM/YY');
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return fail('Month must be between 01 and 12');
  const expiry = new Date(year, month, 0, 23, 59, 59);
  if (expiry.getTime() < Date.now()) return fail('That card has expired');
  return ok;
}

export function validateCvv(value) {
  return /^\d{3,4}$/.test(String(value ?? '').trim()) ? ok : fail('CVV must be 3 or 4 digits');
}

/**
 * Runs a rule map over a form's values.
 * rules: { fieldName: (value, values) => ({ valid, message }) }
 * Returns { valid, errors: { field: message } }
 */
export function validateForm(values, rules) {
  const errors = {};
  Object.entries(rules).forEach(([field, rule]) => {
    const result = rule(values[field], values);
    if (result && !result.valid) errors[field] = result.message;
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Paints `{ field: message }` onto a rendered form and focuses the first error. */
export function paintErrors(formEl, errors) {
  if (!formEl) return;
  formEl.querySelectorAll('.field.has-error').forEach((el) => el.classList.remove('has-error'));

  let first = null;
  Object.entries(errors).forEach(([field, message]) => {
    const input = formEl.querySelector(`[name="${CSS.escape(field)}"]`);
    const wrapper = input?.closest('.field');
    if (!wrapper) return;
    wrapper.classList.add('has-error');
    const errorEl = wrapper.querySelector('.field__error');
    if (errorEl) errorEl.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    if (!first) first = input;
  });

  if (first) {
    first.focus();
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
