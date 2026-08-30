/**
 * auth.js — accounts and sessions for both roles.
 * -----------------------------------------------------------------------------
 * Two independent kinds of account:
 *
 *   CUSTOMER  anyone may sign up. Must be signed in to place an order, and can
 *             only ever see their own orders.
 *   ADMIN     a fixed allow-list of two people:
 *               Pawan Kumar    (pawan)  — Owner
 *               Saurav Ranjan  (saurav) — Store Manager
 *             Only they can open the Insights dashboard.
 *
 * The two sessions live under separate keys **on purpose**: during a live demo
 * you want one window signed in as a customer and a second window signed in as
 * the admin, in the same browser, at the same time.
 *
 * ⚠️  HONEST SECURITY NOTE
 * There is no backend, so this is a *demonstration-grade* gate. Anything that
 * runs in the browser can be read in DevTools. What we do get right:
 *   - passwords are never stored in plain text (salted SHA-256 via Web Crypto)
 *   - constant-time comparison, so timing cannot leak the hash
 *   - sessions expire and can be revoked
 *   - repeated wrong guesses are rate-limited
 *   - guarded routes are re-checked on every navigation, not just on the link
 * In production the same `login()` would call a server API instead of hashing
 * locally; every other line of this file would be unchanged.
 */

import { broadcast, onRemoteChange } from './sync.js';

const KEYS = {
  adminSession: 'mahalaxmi.session.admin.v1',
  customerSession: 'mahalaxmi.session.customer.v1',
  customers: 'mahalaxmi.customers.v1',
  attempts: 'mahalaxmi.authAttempts.v1',
};

/** How long a signed-in session lasts. */
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const SHORT_SESSION_MS = 45 * 60 * 1000;

/** Brute-force protection. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Admin allow-list                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `passwordHash` = SHA-256("mahalaxmi::" + username + "::" + password)
 * Regenerate with:
 *   node -e "console.log(require('crypto').createHash('sha256').update('mahalaxmi::pawan::NewPass').digest('hex'))"
 */
export const ADMINS = [
  {
    id: 'ADM-01',
    username: 'pawan',
    name: 'Pawan Kumar',
    role: 'Owner',
    initials: 'PK',
    passwordHash: '93f909fb9560e59d92c9a43bf48c2fe6ef5ce47893229884294937141bc64735',
  },
  {
    id: 'ADM-02',
    username: 'saurav',
    name: 'Saurav Ranjan',
    role: 'Store Manager',
    initials: 'SR',
    passwordHash: '02fc497e86c526a2148f9637d4f04d5276d2155655f4c43ca03dce1d19935443',
  },
];

/* -------------------------------------------------------------------------- */
/* Demo customer accounts                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Three ready-made customers so the demo has instant order history.
 * `linkedUserId` points at the matching record in data/users.json, which is why
 * signing in as one of them immediately shows a year of past orders.
 * Password for all three: Demo@2026
 */
const SEED_CUSTOMERS = [
  {
    id: 'C-0001',
    linkedUserId: 'U0001',
    name: 'Yogita Maheshwari',
    phone: '+919515745229',
    email: 'yogita.maheshwari630@rediffmail.com',
    area: 'Vijay Nagar',
    addressLine: '31, Sector E, Rau Circle',
    pincode: '452008',
    passwordHash: 'e933ce078acded75f59783e62a9d79b0a694c2af750bf1df309465673ae42736',
    seeded: true,
  },
  {
    id: 'C-0002',
    linkedUserId: 'U0002',
    name: 'Vidya Vyas',
    phone: '+919035680293',
    email: 'vidya.vyas40@protonmail.com',
    area: 'Vivekananda Hostel — Block E',
    addressLine: 'Room 367, Shanti Boys Hostel',
    pincode: '452005',
    passwordHash: '4c026f26b01f3e0e2de3a8093addeb387cf8d675f7b6ae9101f29e531779d0ca',
    seeded: true,
  },
  {
    id: 'C-0003',
    linkedUserId: 'U0003',
    name: 'Varun Mishra',
    phone: '+917067339624',
    email: 'varun.mishra534@protonmail.com',
    area: 'Scheme No. 78',
    addressLine: '219, Sector C, Scheme No. 78',
    pincode: '452010',
    passwordHash: '6bfe45f7f83c5aed59c51fc209d2a028317cd59f74c5e56bb2a24ec2737b6e1b',
    seeded: true,
  },
];

export const DEMO_CUSTOMER_PASSWORD = 'Demo@2026';

/* -------------------------------------------------------------------------- */
/* Storage helpers (never throw, even in private mode)                        */
/* -------------------------------------------------------------------------- */

function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled — the session simply will not persist */
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* Change notifications                                                       */
/* -------------------------------------------------------------------------- */

const listeners = new Set();

/** @returns {() => void} unsubscribe */
export function onAuthChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit({ remote = false } = {}) {
  const snapshot = { customer: currentCustomer(), admin: currentAdmin() };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[auth] listener failed', error);
    }
  });
  if (!remote) broadcast('auth');
}

// Signing in or out in one tab updates the header in every other tab.
onRemoteChange((message) => {
  if (message.type === 'auth' || message.type === 'storage') emit({ remote: true });
});

/* -------------------------------------------------------------------------- */
/* Hashing                                                                    */
/* -------------------------------------------------------------------------- */

/** Salted SHA-256, hex encoded. Needs a secure context (https or localhost). */
async function hashPassword(salt, password) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Sign-in needs a secure context (https:// or http://localhost).');
  }
  const bytes = new TextEncoder().encode(`mahalaxmi::${salt}::${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Length-independent comparison so timing cannot leak the hash. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

function attemptState() {
  const state = read(KEYS.attempts, { count: 0, lockedUntil: 0 });
  if (state.lockedUntil && Date.now() > state.lockedUntil) {
    remove(KEYS.attempts);
    return { count: 0, lockedUntil: 0 };
  }
  return state;
}

/** Seconds remaining on a lockout, or 0 when sign-in is allowed. */
export function lockoutSecondsLeft() {
  const { lockedUntil } = attemptState();
  return lockedUntil > Date.now() ? Math.ceil((lockedUntil - Date.now()) / 1000) : 0;
}

function registerFailure() {
  const state = attemptState();
  const count = state.count + 1;
  const lockedUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
  write(KEYS.attempts, { count: lockedUntil ? 0 : count, lockedUntil });
  return { count, lockedUntil, remaining: Math.max(0, MAX_ATTEMPTS - count) };
}

const clearFailures = () => remove(KEYS.attempts);

/* -------------------------------------------------------------------------- */
/* Customer registry                                                          */
/* -------------------------------------------------------------------------- */

/** "+91 98765 43210" / "9876543210" -> "+919876543210" */
export function normalisePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return last10.length === 10 ? `+91${last10}` : digits;
}

/** Every customer account known to this browser (seeded + signed up). */
export function getCustomers() {
  const stored = read(KEYS.customers, null);

  if (Array.isArray(stored) && stored.length) {
    // Make sure the seeded demo accounts always exist, even after a partial reset.
    const ids = new Set(stored.map((c) => c.id));
    const missing = SEED_CUSTOMERS.filter((c) => !ids.has(c.id));
    if (!missing.length) return stored;

    const merged = [...SEED_CUSTOMERS, ...stored.filter((c) => !c.seeded)];
    write(KEYS.customers, merged);
    return merged;
  }

  write(KEYS.customers, SEED_CUSTOMERS);
  return SEED_CUSTOMERS;
}

const saveCustomers = (list) => write(KEYS.customers, list);

/** Password-free view of a customer record. */
function publicCustomer(customer) {
  if (!customer) return null;
  const { passwordHash, ...safe } = customer;
  return safe;
}

export const findCustomerById = (id) =>
  publicCustomer(getCustomers().find((c) => c.id === id));

function findCustomerByHandle(handle) {
  const value = String(handle || '').trim().toLowerCase();
  if (!value) return null;
  const phone = normalisePhone(value);
  return (
    getCustomers().find(
      (c) => c.email.toLowerCase() === value || (phone.length > 5 && c.phone === phone)
    ) || null
  );
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

function readSession(key) {
  const session = read(key);
  if (!session?.id || !session?.expiresAt) return null;
  if (Date.now() > session.expiresAt) {
    remove(key);
    return null;
  }
  return session;
}

/** The signed-in admin, or `null`. Expired sessions clear themselves. */
export function currentAdmin() {
  const session = readSession(KEYS.adminSession);
  if (!session) return null;

  const admin = ADMINS.find((entry) => entry.id === session.id);
  if (!admin) {
    remove(KEYS.adminSession);
    return null;
  }

  return {
    kind: 'admin',
    id: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role,
    initials: admin.initials,
    loginAt: session.loginAt,
    expiresAt: session.expiresAt,
  };
}

/** The signed-in customer, or `null`. */
export function currentCustomer() {
  const session = readSession(KEYS.customerSession);
  if (!session) return null;

  const customer = getCustomers().find((entry) => entry.id === session.id);
  if (!customer) {
    remove(KEYS.customerSession);
    return null;
  }

  return {
    kind: 'customer',
    ...publicCustomer(customer),
    initials: customer.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
    loginAt: session.loginAt,
    expiresAt: session.expiresAt,
  };
}

export const isAdmin = () => currentAdmin() !== null;
export const isCustomer = () => currentCustomer() !== null;

/** Pushes an expiry back — called whenever a guarded page renders. */
export function touchSession(kind = 'customer') {
  const key = kind === 'admin' ? KEYS.adminSession : KEYS.customerSession;
  const session = read(key);
  if (!session?.id) return;
  write(key, { ...session, expiresAt: Date.now() + SESSION_DURATION_MS });
}

function startSession(key, id, remember) {
  const now = Date.now();
  write(key, {
    id,
    loginAt: now,
    expiresAt: now + (remember ? SESSION_DURATION_MS : SHORT_SESSION_MS),
  });
}

/* -------------------------------------------------------------------------- */
/* Admin sign-in                                                              */
/* -------------------------------------------------------------------------- */

/** @returns {Promise<{ ok: boolean, admin?: object, message?: string }>} */
export async function loginAdmin(username, password, { remember = true } = {}) {
  const locked = lockoutSecondsLeft();
  if (locked > 0) {
    return { ok: false, message: `Too many failed attempts. Try again in ${locked} seconds.` };
  }

  const handle = String(username || '').trim().toLowerCase();
  const secret = String(password || '');
  if (!handle || !secret) return { ok: false, message: 'Enter both a username and a password.' };

  const admin = ADMINS.find(
    (entry) => entry.username === handle || entry.name.toLowerCase() === handle
  );

  let digest;
  try {
    // Always hash, even for an unknown user, so the response time is uniform.
    digest = await hashPassword(admin?.username || handle, secret);
  } catch (error) {
    return { ok: false, message: error.message };
  }

  if (!admin || !safeEqual(digest, admin.passwordHash)) {
    const { remaining, lockedUntil } = registerFailure();
    return {
      ok: false,
      message: lockedUntil
        ? 'Too many failed attempts. Sign-in is locked for 60 seconds.'
        : `Those credentials do not match an admin account. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.`,
    };
  }

  clearFailures();
  startSession(KEYS.adminSession, admin.id, remember);
  emit();
  return { ok: true, admin: currentAdmin() };
}

export function logoutAdmin() {
  remove(KEYS.adminSession);
  emit();
}

/* -------------------------------------------------------------------------- */
/* Customer sign-up / sign-in                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Creates a customer account and signs them in.
 * @returns {Promise<{ ok, customer?, field?, message? }>}
 */
export async function registerCustomer({ name, phone, email, password, area = '', addressLine = '' }) {
  const cleanName = String(name || '').trim();
  const cleanPhone = normalisePhone(phone);
  const cleanEmail = String(email || '').trim().toLowerCase();
  const secret = String(password || '');

  if (cleanName.length < 2) return { ok: false, field: 'name', message: 'Please enter your full name.' };
  if (!/^\+91[6-9]\d{9}$/.test(cleanPhone)) {
    return { ok: false, field: 'phone', message: 'Enter a valid 10-digit Indian mobile number.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(cleanEmail)) {
    return { ok: false, field: 'email', message: 'That email address does not look right.' };
  }
  if (secret.length < 8) {
    return { ok: false, field: 'password', message: 'Use at least 8 characters.' };
  }
  if (!/[A-Za-z]/.test(secret) || !/\d/.test(secret)) {
    return { ok: false, field: 'password', message: 'Mix letters and numbers for a stronger password.' };
  }

  const customers = getCustomers();
  if (customers.some((c) => c.phone === cleanPhone)) {
    return { ok: false, field: 'phone', message: 'An account already uses that mobile number. Try signing in.' };
  }
  if (customers.some((c) => c.email.toLowerCase() === cleanEmail)) {
    return { ok: false, field: 'email', message: 'An account already uses that email. Try signing in.' };
  }

  const id = `C-${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

  let passwordHash;
  try {
    passwordHash = await hashPassword(id, secret);
  } catch (error) {
    return { ok: false, message: error.message };
  }

  const customer = {
    id,
    linkedUserId: null,
    name: cleanName,
    phone: cleanPhone,
    email: cleanEmail,
    area: String(area || '').trim(),
    addressLine: String(addressLine || '').trim(),
    pincode: '',
    passwordHash,
    seeded: false,
    createdAt: new Date().toISOString(),
  };

  saveCustomers([...customers, customer]);
  startSession(KEYS.customerSession, id, true);
  emit();

  return { ok: true, customer: currentCustomer() };
}

/**
 * Signs a customer in with their mobile number or email.
 * @returns {Promise<{ ok, customer?, message? }>}
 */
export async function loginCustomer(handle, password, { remember = true } = {}) {
  const locked = lockoutSecondsLeft();
  if (locked > 0) {
    return { ok: false, message: `Too many failed attempts. Try again in ${locked} seconds.` };
  }

  const secret = String(password || '');
  if (!String(handle || '').trim() || !secret) {
    return { ok: false, message: 'Enter your mobile number (or email) and password.' };
  }

  const customer = findCustomerByHandle(handle);

  let digest;
  try {
    digest = await hashPassword(customer?.id || 'unknown', secret);
  } catch (error) {
    return { ok: false, message: error.message };
  }

  if (!customer || !safeEqual(digest, customer.passwordHash)) {
    const { remaining, lockedUntil } = registerFailure();
    return {
      ok: false,
      message: lockedUntil
        ? 'Too many failed attempts. Sign-in is locked for 60 seconds.'
        : `We could not match those details. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.`,
    };
  }

  clearFailures();
  startSession(KEYS.customerSession, customer.id, remember);
  saveCustomers(
    getCustomers().map((c) =>
      c.id === customer.id ? { ...c, lastLoginAt: new Date().toISOString() } : c
    )
  );
  emit();

  return { ok: true, customer: currentCustomer() };
}

export function logoutCustomer() {
  remove(KEYS.customerSession);
  emit();
}

/** Updates the signed-in customer's saved details. */
export function updateCustomerProfile(patch) {
  const session = readSession(KEYS.customerSession);
  if (!session) return null;

  saveCustomers(
    getCustomers().map((customer) =>
      customer.id === session.id
        ? {
            ...customer,
            name: patch.name?.trim() || customer.name,
            email: patch.email?.trim().toLowerCase() || customer.email,
            area: patch.area ?? customer.area,
            addressLine: patch.addressLine ?? customer.addressLine,
            pincode: patch.pincode ?? customer.pincode,
          }
        : customer
    )
  );

  emit();
  return currentCustomer();
}

/** Signs everyone out of this browser. */
export function logoutAll() {
  remove(KEYS.adminSession);
  remove(KEYS.customerSession);
  emit();
}

/**
 * Every id an order could carry for this customer: their account id plus the
 * data/users.json record the demo account is linked to.
 */
export function ownedUserIds(customer = currentCustomer()) {
  if (!customer) return [];
  return [customer.id, customer.linkedUserId].filter(Boolean);
}
