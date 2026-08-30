/**
 * components/skeleton.js — shimmer placeholders.
 *
 * Rendered instantly while JSON is fetched so the page never flashes empty.
 * Also used as the <img> loading treatment on product cards.
 */

const repeat = (count, fn) => Array.from({ length: count }, (_, i) => fn(i)).join('');

/** A single product-card placeholder. */
export const skeletonCard = () => `
  <div class="skeleton-card" aria-hidden="true">
    <div class="skeleton skeleton-card__media"></div>
    <div class="skeleton-card__body">
      <div class="skeleton skeleton-line" style="width:82%"></div>
      <div class="skeleton skeleton-line" style="width:56%"></div>
      <div class="skeleton skeleton-line" style="width:40%;height:22px;margin-top:6px"></div>
    </div>
  </div>`;

/** A responsive grid of product-card placeholders. */
export const skeletonGrid = (count = 8) => `
  <div class="grid grid--cards">${repeat(count, skeletonCard)}</div>`;

/** Generic text block placeholder. */
export const skeletonText = (lines = 3) => `
  <div class="stack" aria-hidden="true">
    ${repeat(lines, (i) => `<div class="skeleton skeleton-line" style="width:${94 - i * 13}%"></div>`)}
  </div>`;

/** KPI card placeholders for the dashboard. */
export const skeletonKpis = (count = 8) => `
  <div class="kpi-grid" aria-hidden="true">
    ${repeat(count, () => `
      <div class="kpi-card">
        <div class="skeleton skeleton-line" style="width:58%"></div>
        <div class="skeleton skeleton-line" style="width:76%;height:26px;margin-top:10px"></div>
        <div class="skeleton skeleton-line" style="width:44%;margin-top:8px"></div>
      </div>`)}
  </div>`;

/** Panel placeholder used for charts. */
export const skeletonPanel = (height = 200) => `
  <div class="panel" aria-hidden="true">
    <div class="skeleton skeleton-line" style="width:38%;height:14px"></div>
    <div class="skeleton" style="height:${height}px;margin-top:16px;border-radius:14px"></div>
  </div>`;

/** Cart / order row placeholders. */
export const skeletonRows = (count = 3) => `
  <div class="stack" aria-hidden="true">
    ${repeat(count, () => `
      <div class="cart-line">
        <div class="skeleton cart-line__img"></div>
        <div style="flex:1">
          <div class="skeleton skeleton-line" style="width:70%"></div>
          <div class="skeleton skeleton-line" style="width:40%;margin-top:8px"></div>
        </div>
        <div class="skeleton skeleton-line" style="width:56px;height:28px"></div>
      </div>`)}
  </div>`;

/** Default page-level skeleton used by the router between routes. */
export const pageSkeleton = () => `
  <div class="page" aria-hidden="true">
    <section class="page-head">
      <div class="container">
        <div class="skeleton skeleton-line" style="width:180px;height:12px"></div>
        <div class="skeleton skeleton-line" style="width:min(420px,70%);height:30px;margin-top:14px"></div>
        <div class="skeleton skeleton-line" style="width:min(560px,90%);margin-top:12px"></div>
      </div>
    </section>
    <section class="section">
      <div class="container">${skeletonGrid(8)}</div>
    </section>
  </div>`;

/**
 * Progressive image loading: swaps in the real src once decoded and falls back
 * to a branded placeholder when a file is missing.
 * @param {HTMLElement} root container to scan for [data-src] images
 */
export function hydrateImages(root = document) {
  root.querySelectorAll('img[data-src]').forEach((img) => {
    const src = img.dataset.src;
    delete img.dataset.src;

    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener(
      'error',
      () => {
        img.src = new URL('../../assets/images/fallback.svg', import.meta.url).href;
        img.classList.add('is-loaded');
      },
      { once: true }
    );

    img.src = src;
    if (img.complete && img.naturalWidth > 0) img.classList.add('is-loaded');
  });
}
