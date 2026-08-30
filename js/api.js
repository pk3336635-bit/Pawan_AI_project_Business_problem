/**
 * api.js — the data layer.
 *
 * There is no backend: everything is static JSON fetched once and cached in
 * memory. Paths are resolved against this module's URL so the site works from
 * a sub-folder (e.g. https://user.github.io/mahalaxmi-sweets/).
 */

import { toMs } from './utils/date.js';

const DATA_URL = (file) => new URL(`../data/${file}`, import.meta.url).href;

const cache = new Map();

/** Fetch + cache a JSON file. Repeat calls share the same promise. */
function loadJson(file) {
  if (!cache.has(file)) {
    const promise = fetch(DATA_URL(file), { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`${file} responded with ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        cache.delete(file); // allow a retry
        throw new Error(`Could not load ${file}: ${error.message}`);
      });
    cache.set(file, promise);
  }
  return cache.get(file);
}

/* -------------------------------------------------------------------------- */
/* Raw collections                                                            */
/* -------------------------------------------------------------------------- */

export const getMenu = () => loadJson('menu.json');
export const getUsers = () => loadJson('users.json');
export const getOrders = () => loadJson('orders.json');
export const getOffers = () => loadJson('offers.json');

/* -------------------------------------------------------------------------- */
/* Derived views                                                              */
/* -------------------------------------------------------------------------- */

export const CATEGORY_META = [
  { id: 'sweets', name: 'Sweets & Mithai', icon: '🍬', blurb: 'Made fresh every morning in pure desi ghee.' },
  { id: 'snacks', name: 'Snacks & Savouries', icon: '🥟', blurb: 'Fried to order — samosa, kachori, chaat and more.' },
  { id: 'beverages', name: 'Beverages', icon: '🍵', blurb: 'Kadak chai, thick lassi and cold coffee.' },
  { id: 'namkeen', name: 'Namkeen & Farsan', icon: '🥨', blurb: 'Sealed packs that stay crisp for weeks.' },
  { id: 'bakery', name: 'Bakery & Desserts', icon: '🧁', blurb: 'Pastries, brownies and matka kulfi.' },
  { id: 'combos', name: 'Combos & Specials', icon: '🎁', blurb: 'Festival hampers, gift boxes and value combos.' },
];

const CATEGORY_IMAGE = {
  sweets: 'assets/images/kaju-katli.svg',
  snacks: 'assets/images/samosa.svg',
  beverages: 'assets/images/masala-chai.svg',
  namkeen: 'assets/images/chivda.svg',
  bakery: 'assets/images/pastry.svg',
  combos: 'assets/images/festival-pack.svg',
};

let catalogPromise = null;

/**
 * The menu, indexed and grouped once so pages never re-scan 400+ rows.
 * @returns {Promise<{ menu, byId: Map, categories, byCategory: Map }>}
 */
export function getCatalog() {
  if (!catalogPromise) {
    catalogPromise = getMenu().then((menu) => {
      const byId = new Map(menu.map((item) => [item.id, item]));
      const byCategory = new Map();

      menu.forEach((item) => {
        if (!byCategory.has(item.category)) byCategory.set(item.category, []);
        byCategory.get(item.category).push(item);
      });

      const categories = CATEGORY_META.map((meta) => ({
        ...meta,
        image: CATEGORY_IMAGE[meta.id],
        count: byCategory.get(meta.id)?.length || 0,
        fromPrice: Math.min(...(byCategory.get(meta.id) || [{ price: 0 }]).map((i) => i.price)),
      }));

      return { menu, byId, byCategory, categories };
    });
  }
  return catalogPromise;
}

/** Highest-popularity items, optionally within a category. */
export async function getBestsellers(limit = 8, category = null) {
  const { menu } = await getCatalog();
  return menu
    .filter((item) => item.available && (!category || item.category === category))
    .sort((a, b) => b.popularityScore - a.popularityScore)
    .slice(0, limit);
}

/** Festival packs and combos to highlight on Home / Offers. */
export async function getFestivalPicks(limit = 8) {
  const { menu } = await getCatalog();
  return menu
    .filter((item) => item.isFestivalSpecial && item.available)
    .sort((a, b) => b.popularityScore - a.popularityScore)
    .slice(0, limit);
}

export async function getPromoCodes() {
  const offers = await getOffers();
  return offers.promoCodes || [];
}

export async function getFestivals() {
  const offers = await getOffers();
  return offers.festivals || [];
}

/** The festival the shop is currently preparing for. */
export async function getUpcomingFestival(now = Date.now()) {
  const festivals = await getFestivals();
  return (
    festivals
      .map((festival) => ({ ...festival, ms: toMs(`${festival.date}T12:00:00+05:30`) }))
      .filter((festival) => festival.ms >= now - 2 * 86400000)
      .sort((a, b) => a.ms - b.ms)[0] || null
  );
}

/**
 * Every order the dashboard should consider: the simulated history plus
 * anything placed in this browser during the demo.
 */
export async function getAllOrders(localOrders = []) {
  const seeded = await getOrders();
  return [...seeded, ...localOrders];
}

/**
 * The dataset ends on a fixed date, so "last 7 days" is measured against the
 * newest timestamp we can see rather than the wall clock. That keeps the KPI
 * dashboard populated no matter when the project is opened.
 */
export function datasetNow(orders) {
  let newest = 0;
  orders.forEach((order) => {
    const ms = toMs(order.createdAt);
    if (ms > newest) newest = ms;
  });
  return Math.max(newest, Date.now());
}

/** Small helper for pages that just need a user record for an order. */
export async function getUserIndex() {
  const users = await getUsers();
  return new Map(users.map((user) => [user.id, user]));
}

/** Warm the caches used by almost every page. */
export const preload = () => Promise.all([getCatalog(), getOffers()]);
