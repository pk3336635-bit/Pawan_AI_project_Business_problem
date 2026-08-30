/**
 * pages/menu.js — the full catalogue with search, filters, sorting and paging.
 *
 * 400+ items are held in memory and filtered synchronously; only 24 cards are
 * in the DOM at a time (with a "load more" button) so scrolling stays smooth
 * even on a mid-range phone.
 */

import { html, raw, number, joinHtml } from '../utils/format.js';
import { getCatalog, CATEGORY_META } from '../api.js';
import { getPrefs, savePrefs, subscribe } from '../store.js';
import { productCard, attachProductGrid, refreshControls, consumptionNow } from '../components/productCard.js';
import { skeletonGrid, hydrateImages } from '../components/skeleton.js';
import { stockState } from '../utils/inventory.js';
import { track, EVENTS } from '../analytics.js';

const PAGE_SIZE = 24;

const SORTS = [
  { id: 'popularity', label: 'Popularity' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Customer rating' },
  { id: 'name', label: 'Name A–Z' },
];

const QUICK_FILTERS = [
  { id: 'bestseller', label: '⭐ Bestsellers' },
  { id: 'festival', label: '🎊 Festival specials' },
  { id: 'instock', label: '✅ In stock only' },
  { id: 'under100', label: '💸 Under ₹100' },
  { id: 'gifting', label: '🎁 Great for gifting' },
];

/** Page-local UI state, rebuilt from the URL on every render. */
const state = {
  all: [],
  byId: new Map(),
  filtered: [],
  shown: PAGE_SIZE,
  query: '',
  category: '',
  sort: 'popularity',
  quick: new Set(),
  ctx: null,
};

/* -------------------------------------------------------------------------- */
/* Filtering + sorting                                                        */
/* -------------------------------------------------------------------------- */

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = `${item.name} ${item.baseName} ${item.description} ${item.categoryName} ${item.tags.join(' ')}`.toLowerCase();
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

function applyFilters() {
  const query = state.query.trim().toLowerCase();
  const consumption = consumptionNow();

  let list = state.all.filter((item) => {
    if (state.category && item.category !== state.category) return false;
    if (!matchesQuery(item, query)) return false;
    if (state.quick.has('bestseller') && !item.isBestseller) return false;
    if (state.quick.has('festival') && !item.isFestivalSpecial) return false;
    if (state.quick.has('under100') && item.price >= 100) return false;
    if (state.quick.has('gifting') && !item.tags.includes('gifting')) return false;
    if (state.quick.has('instock') && !stockState(item, consumption).isAvailable) return false;
    return true;
  });

  const sorters = {
    'popularity': (a, b) => b.popularityScore - a.popularityScore,
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    'rating': (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
    'name': (a, b) => a.name.localeCompare(b.name),
  };

  list = list.sort(sorters[state.sort] || sorters.popularity);

  // Out-of-stock items always sink to the bottom of their sort order.
  const available = list.filter((item) => stockState(item, consumption).isAvailable);
  const sold = list.filter((item) => !stockState(item, consumption).isAvailable);

  state.filtered = [...available, ...sold];
  return state.filtered;
}

/* -------------------------------------------------------------------------- */
/* Markup                                                                     */
/* -------------------------------------------------------------------------- */

function toolbar(categories) {
  return html`
    <div class="menu-toolbar">
      <div class="menu-toolbar__inner">
        <div class="search-box">
          <span class="search-box__icon" aria-hidden="true">🔍</span>
          <label class="sr-only" for="menu-search">Search the menu</label>
          <input class="input" id="menu-search" type="search" name="q" autocomplete="off"
            placeholder="Search for gulab jamun, chai, festival pack…" value="${state.query}" />
        </div>

        <div class="chip-scroller" role="group" aria-label="Filter by category">
          <button class="chip" type="button" data-category="" aria-pressed="${state.category === ''}">All</button>
          ${raw(categories.map((category) => `
            <button class="chip" type="button" data-category="${category.id}"
              aria-pressed="${state.category === category.id}">
              <span aria-hidden="true">${category.icon}</span> ${category.name}
            </button>`).join(''))}
        </div>

        <div class="row" style="gap:var(--sp-2)">
          <label class="sr-only" for="menu-sort">Sort items</label>
          <select class="select" id="menu-sort" name="sort" style="min-width:180px">
            ${raw(SORTS.map((sort) => `
              <option value="${sort.id}" ${state.sort === sort.id ? 'selected' : ''}>${sort.label}</option>`).join(''))}
          </select>
        </div>
      </div>
    </div>`;
}

function sidebar(categories) {
  return html`
    <aside class="menu-sidebar">
      <div class="filter-card">
        <h4>Counters</h4>
        <ul class="filter-list">
          <li>
            <button type="button" data-category="" aria-pressed="${state.category === ''}">
              All counters <span>${number(state.all.length)}</span>
            </button>
          </li>
          ${raw(categories.map((category) => `
            <li>
              <button type="button" data-category="${category.id}" aria-pressed="${state.category === category.id}">
                ${category.icon} ${category.name} <span>${number(category.count)}</span>
              </button>
            </li>`).join(''))}
        </ul>
      </div>

      <div class="filter-card">
        <h4>Quick filters</h4>
        <ul class="filter-list">
          ${raw(QUICK_FILTERS.map((filter) => `
            <li>
              <button type="button" data-quick="${filter.id}" aria-pressed="${state.quick.has(filter.id)}">
                ${filter.label}
              </button>
            </li>`).join(''))}
        </ul>
      </div>

      <div class="filter-card">
        <h4>Need a lot?</h4>
        <p class="text-soft" style="font-size:var(--fs-sm)">
          Weddings, offices and hostel messes get tiered pricing and a dedicated packing slot.
        </p>
        <a class="btn btn--secondary btn--sm btn--block" href="#/offers">Bulk &amp; corporate orders</a>
      </div>
    </aside>`;
}

function resultsBar() {
  const activeChips = [
    state.category && CATEGORY_META.find((c) => c.id === state.category)?.name,
    state.query && `“${state.query}”`,
    ...[...state.quick].map((id) => QUICK_FILTERS.find((f) => f.id === id)?.label),
  ].filter(Boolean);

  return html`
    <div class="menu-results-bar">
      <div>
        <strong>${number(state.filtered.length)}</strong>
        <span class="text-muted">${state.filtered.length === 1 ? 'item' : 'items'} found</span>
        ${activeChips.length
          ? raw(`<span class="text-muted"> · ${activeChips.map((chip) => `<span class="badge badge--muted">${chip}</span>`).join(' ')}</span>`)
          : ''}
      </div>
      ${activeChips.length
        ? raw('<button class="btn btn--ghost btn--sm" type="button" data-clear-filters>Clear filters</button>')
        : ''}
    </div>`;
}

function resultsMarkup() {
  if (!state.filtered.length) {
    return html`
      <div class="empty-state">
        <div class="empty-state__icon" aria-hidden="true">🔎</div>
        <h3>Nothing matched that</h3>
        <p>Try a different spelling, drop a filter, or browse a whole counter instead.</p>
        <button class="btn btn--primary" type="button" data-clear-filters>Clear all filters</button>
      </div>`;
  }

  const consumption = consumptionNow();
  const visible = state.filtered.slice(0, state.shown);
  const remaining = state.filtered.length - visible.length;

  return html`
    <div class="grid grid--cards" data-product-grid>
      ${raw(joinHtml(visible.map((item, index) => productCard(item, { consumption, eager: index < 4 }))))}
    </div>
    ${remaining > 0
      ? raw(`
        <div class="load-more-wrap">
          <button class="btn btn--secondary btn--lg" type="button" data-load-more>
            Show ${Math.min(PAGE_SIZE, remaining)} more · ${number(remaining)} left
          </button>
        </div>`)
      : raw(`<p class="text-center text-muted" style="padding-block:var(--sp-6) 0">
          That is every item on this counter.
        </p>`)}`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default {
  title: 'Menu',

  skeleton: () => html`
    <div class="page">
      <section class="page-head"><div class="container"><h1>Our menu</h1></div></section>
      <section class="section"><div class="container">${raw(skeletonGrid(12))}</div></section>
    </div>`,

  async render(ctx) {
    const { menu, byId, categories } = await getCatalog();
    const prefs = getPrefs();

    state.all = menu;
    state.byId = byId;
    state.ctx = ctx;
    state.query = ctx.query.q || '';
    state.category = categories.some((c) => c.id === ctx.query.category) ? ctx.query.category : '';
    state.sort = SORTS.some((s) => s.id === ctx.query.sort) ? ctx.query.sort : prefs.sort || 'popularity';
    state.quick = new Set((ctx.query.filters || '').split(',').filter(Boolean));
    state.shown = PAGE_SIZE;

    applyFilters();
    track(EVENTS.MENU_VIEW, { category: state.category || 'all', results: state.filtered.length });

    const active = categories.find((c) => c.id === state.category);

    return html`
      <section class="page-head">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Menu</span>
            ${active ? raw(`<span aria-hidden="true">›</span> <span>${active.name}</span>`) : ''}
          </nav>
          <h1>${active ? active.name : 'The whole counter, online'}</h1>
          <p>
            ${active
              ? active.blurb
              : `${number(menu.length)} items across ${categories.length} counters. Everything is vegetarian,
                 freshly made, and shows live stock so you always know what is actually left.`}
          </p>
        </div>
      </section>

      ${raw(toolbar(categories))}

      <section class="section section--tight">
        <div class="container">
          <div class="menu-layout">
            ${raw(sidebar(categories))}
            <div>
              <div data-results-bar>${raw(resultsBar())}</div>
              <div data-results>${raw(resultsMarkup())}</div>
            </div>
          </div>
        </div>
      </section>`;
  },

  mount(root, ctx) {
    const results = root.querySelector('[data-results]');
    const resultsBarEl = root.querySelector('[data-results-bar]');
    const searchInput = root.querySelector('#menu-search');
    const sortSelect = root.querySelector('#menu-sort');

    // One delegated listener for every card in the results container.
    attachProductGrid(results, state.byId);

    const repaint = ({ resetPaging = true } = {}) => {
      if (resetPaging) state.shown = PAGE_SIZE;
      applyFilters();
      resultsBarEl.innerHTML = resultsBar();
      results.innerHTML = resultsMarkup();
      hydrateImages(results);
      syncUrl(ctx);
      syncPressedStates(root);
    };

    /* ---- Search (debounced) --------------------------------------------- */
    let debounce;
    searchInput?.addEventListener('input', (event) => {
      clearTimeout(debounce);
      const value = event.target.value;
      debounce = setTimeout(() => {
        state.query = value;
        repaint();
        if (value.trim().length > 2) {
          track(EVENTS.SEARCH, { term: value.trim().toLowerCase(), results: state.filtered.length });
        }
      }, 220);
    });

    /* ---- Sort ------------------------------------------------------------ */
    sortSelect?.addEventListener('change', (event) => {
      state.sort = event.target.value;
      savePrefs({ sort: state.sort });
      repaint();
    });

    /* ---- Category + quick filters (delegated across toolbar & sidebar) ---- */
    root.addEventListener('click', (event) => {
      const categoryButton = event.target.closest('[data-category]');
      if (categoryButton) {
        state.category = categoryButton.dataset.category;
        repaint();
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const quickButton = event.target.closest('[data-quick]');
      if (quickButton) {
        const id = quickButton.dataset.quick;
        if (state.quick.has(id)) state.quick.delete(id);
        else state.quick.add(id);
        repaint();
        return;
      }

      if (event.target.closest('[data-clear-filters]')) {
        state.query = '';
        state.category = '';
        state.quick.clear();
        if (searchInput) searchInput.value = '';
        repaint();
        return;
      }

      if (event.target.closest('[data-load-more]')) {
        state.shown += PAGE_SIZE;
        results.innerHTML = resultsMarkup();
        hydrateImages(results);
      }
    });

    // Keep stock badges and steppers fresh when the cart changes elsewhere.
    this._unsubscribe = subscribe((event) => {
      if (event.type === 'cart' || event.type === 'orders' || event.type === 'reset') {
        refreshControls(results, state.byId);
      }
    });
  },

  unmount() {
    this._unsubscribe?.();
    this._unsubscribe = null;
  },
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function syncPressedStates(root) {
  root.querySelectorAll('[data-category]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
  });
  root.querySelectorAll('[data-quick]').forEach((button) => {
    button.setAttribute('aria-pressed', String(state.quick.has(button.dataset.quick)));
  });
}

/** Reflects filters in the address bar so a filtered menu can be shared. */
function syncUrl(ctx) {
  ctx.setQuery({
    category: state.category,
    q: state.query.trim(),
    sort: state.sort === 'popularity' ? '' : state.sort,
    filters: [...state.quick].join(','),
  });
}
