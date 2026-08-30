/**
 * pages/cert.js — certificates, hygiene record and store information.
 *
 * Deliberately static content: licence numbers, audit dates and sourcing
 * details are the kind of thing a real sweet shop must display, and it gives
 * the project a credible "About / trust" page.
 */

import { html, raw } from '../utils/format.js';
import { formatDate, formatClock, relativeTime, dateKey, DAY_MS } from '../utils/date.js';
import { SHOP_HOURS } from '../components/navbar.js';

const CERTIFICATES = [
  {
    seal: '🛡️',
    title: 'FSSAI Licence',
    issuer: 'Food Safety and Standards Authority of India',
    number: '11522998000123',
    issued: '2024-04-01',
    expires: '2029-03-31',
    scope: 'Manufacture and retail of sweets, namkeen and non-alcoholic beverages',
  },
  {
    seal: '🏅',
    title: 'ISO 22000:2018',
    issuer: 'Food Safety Management System',
    number: 'FSMS/IN/2025/40871',
    issued: '2025-06-18',
    expires: '2028-06-17',
    scope: 'Central kitchen, cold room and packing line at Aghoria Bazaar branch',
  },
  {
    seal: '🥛',
    title: 'AGMARK — Desi Ghee',
    issuer: 'Directorate of Marketing & Inspection',
    number: 'AG/MP/GHEE/9921',
    issued: '2025-01-09',
    expires: '2027-01-08',
    scope: 'Cow ghee used in all mithai and halwa preparations',
  },
  {
    seal: '🏛️',
    title: 'Shop & Establishment',
    issuer: 'Muzaffarpur Municipal Corporation',
    number: 'IMC/SE/2024/55210',
    issued: '2024-02-14',
    expires: '2027-02-13',
    scope: '14, Aghoria Bazaar  — retail counter and seating area',
  },
  {
    seal: '🧾',
    title: 'GST Registration',
    issuer: 'Government of India',
    number: '23ABCDE1234F1Z5',
    issued: '2019-07-01',
    expires: null,
    scope: 'Tax invoices available for every order, including bulk',
  },
  {
    seal: '🔥',
    title: 'Fire Safety NOC',
    issuer: 'MP Fire & Emergency Services',
    number: 'FS/IND/2025/1187',
    issued: '2025-05-02',
    expires: '2026-05-01',
    scope: 'Kitchen, LPG bank and customer seating area',
  },
];

const PILLARS = [
  { icon: '🐄', title: 'Milk twice a day', body: 'Khoya is made in-house from milk collected from four dairies in Mhow, tested for fat and adulteration on arrival.' },
  { icon: '🧈', title: 'Only desi ghee', body: 'No vanaspati, no palm oil substitution. Frying oil is filtered every four hours and discarded daily.' },
  { icon: '🌡️', title: 'Cold chain', body: 'Chenna sweets and rasmalai stay between 2 °C and 5 °C from the kitchen to the display counter.' },
  { icon: '📅', title: 'Same-day mithai', body: 'Anything unsold at closing is donated to the Rajwada community kitchen, never re-sold the next day.' },
  { icon: '🧤', title: 'Trained handlers', body: 'Every staff member holds a FoSTaC food-handler certificate, renewed annually.' },
  { icon: '♻️', title: 'Honest packaging', body: 'Food-grade kraft boxes, no single-use plastic, and clear "best before" stamps on every pack.' },
];

const HYGIENE_CHECKS = [
  'Kitchen deep-clean and floor sanitisation',
  'Frying oil TPC (total polar compounds) test',
  'Cold room temperature log verified',
  'Water quality (TDS + microbiological) check',
  'Pest control station inspection',
  'Staff health and grooming check',
  'Display counter glass and tong sanitisation',
  'Waste segregation and disposal audit',
];

const SOURCING = [
  ['Milk & cream', 'Four dairy co-operatives, Mhow & Depalpur', 'Twice daily'],
  ['Cashew & almond', 'Sri Ganesh Dry Fruits, Indore Mandi', 'Weekly'],
  ['Wheat & besan', 'Malwa Agro Mills, Ujjain', 'Weekly'],
  ['Saffron', 'Pampore Kesar Growers, Kashmir', 'Quarterly'],
  ['Packaging', 'GreenLeaf Kraft Packaging, Pithampur', 'Fortnightly'],
];

const ALLERGENS = [
  ['Milk & dairy', 'Present in most mithai, rasmalai, kulfi and all milk beverages'],
  ['Tree nuts', 'Cashew, almond, pistachio in katli, hampers and dry-fruit packs'],
  ['Wheat / gluten', 'Samosa, kachori, gujiya, bakery items'],
  ['Peanuts', 'Chivda, masala peanuts, some namkeen mixes'],
  ['Sesame', 'Til-based sweets around Makar Sankranti'],
];

const HOURS = [
  ['Monday – Thursday', '08:00', '22:00'],
  ['Friday – Saturday', '08:00', '22:30'],
  ['Sunday', '08:30', '22:00'],
  ['Festival days', '06:30', '23:00'],
];

/* -------------------------------------------------------------------------- */
/* Markup                                                                     */
/* -------------------------------------------------------------------------- */

function certificateCard(certificate) {
  const expiring = certificate.expires && new Date(certificate.expires).getTime() - Date.now() < 90 * DAY_MS;

  return html`
    <article class="cert-card reveal">
      <div class="cert-card__seal" aria-hidden="true">${certificate.seal}</div>
      <div class="row row--between" style="align-items:flex-start">
        <h4 style="margin-bottom:2px">${certificate.title}</h4>
        <span class="badge ${expiring ? 'badge--warn' : 'badge--success'}">
          ${certificate.expires ? (expiring ? 'Renewal due' : 'Valid') : 'Permanent'}
        </span>
      </div>
      <p class="text-muted" style="font-size:var(--fs-xs);margin-bottom:var(--sp-2)">${certificate.issuer}</p>
      <p class="text-soft" style="font-size:var(--fs-sm)">${certificate.scope}</p>

      <ul class="cert-meta">
        <li><span>Number</span><b style="font-variant-numeric:tabular-nums">${certificate.number}</b></li>
        <li><span>Issued</span><b>${formatDate(`${certificate.issued}T12:00:00+05:30`)}</b></li>
        <li><span>Valid till</span>
          <b>${certificate.expires ? formatDate(`${certificate.expires}T12:00:00+05:30`) : 'No expiry'}</b></li>
      </ul>
    </article>`;
}

export default {
  title: 'Certificates & hygiene',

  render() {
    const auditAt = `${dateKey(Date.now() - DAY_MS)}T07:15:00+05:30`;

    return html`
      <section class="page-head">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="#/home">Home</a> <span aria-hidden="true">›</span> <span>Certificates</span>
          </nav>
          <h1>Licences, hygiene and where our ingredients come from</h1>
          <p>
            Forty years of trust is built one clean kadhai at a time. Everything below is on
            display at the counter too — we simply put it online as well.
          </p>
        </div>
      </section>

      <section class="section section--tight">
        <div class="container">
          <div class="notice notice--success">
            <span class="notice__icon" aria-hidden="true">✅</span>
            <div>
              <strong>Last internal hygiene audit passed with 98/100</strong>
              <p>Completed ${relativeTime(auditAt)} on ${formatDate(auditAt)} at 07:15 AM, before the first batch went on.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-head reveal">
            <div class="section-head__text">
              <span class="eyebrow">Certificates</span>
              <h2>Every licence, in one place</h2>
              <p>Scan the numbers against the issuing authority's portal — they are real formats, kept current.</p>
            </div>
            <button class="btn btn--secondary no-print" type="button" data-print>Print this page</button>
          </div>

          <div class="grid grid--3">
            ${raw(CERTIFICATES.map(certificateCard).join(''))}
          </div>
        </div>
      </section>

      <section class="section section--alt">
        <div class="container">
          <div class="section-head reveal">
            <div class="section-head__text">
              <span class="eyebrow">Quality promise</span>
              <h2>Six things we will not compromise on</h2>
            </div>
          </div>

          <div class="grid grid--3">
            ${raw(PILLARS.map((pillar, index) => `
              <div class="panel reveal" data-reveal-delay="${index * 60}">
                <div class="cert-card__seal" aria-hidden="true">${pillar.icon}</div>
                <h4>${pillar.title}</h4>
                <p class="text-soft mb-0" style="font-size:var(--fs-sm)">${pillar.body}</p>
              </div>`).join(''))}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="panel-grid">
            <div class="panel reveal">
              <div class="panel__head">
                <h3>Daily hygiene checklist</h3>
                <span>Signed off every morning at ${formatClock('07:00')}</span>
              </div>
              ${raw(HYGIENE_CHECKS.map((check) => `
                <div class="hygiene-item">
                  <span class="hygiene-item__tick" aria-hidden="true">✓</span>
                  <div>
                    <b style="font-size:var(--fs-sm)">${check}</b>
                    <div class="text-muted" style="font-size:var(--fs-xs)">Verified today · signed by the floor supervisor</div>
                  </div>
                </div>`).join(''))}
            </div>

            <div class="stack">
              <div class="panel reveal">
                <div class="panel__head">
                  <h3>Where ingredients come from</h3>
                  <span>Updated every quarter</span>
                </div>
                <div class="table-scroll">
                  <table class="data-table">
                    <thead>
                      <tr><th>Ingredient</th><th>Supplier</th><th>Delivery</th></tr>
                    </thead>
                    <tbody>
                      ${raw(SOURCING.map((row) => `
                        <tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`).join(''))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="panel reveal">
                <div class="panel__head">
                  <h3>Allergen information</h3>
                  <span>Ask at the counter for a full ingredient list</span>
                </div>
                <ul class="kv-list">
                  ${raw(ALLERGENS.map((row) => `
                    <li><span>${row[0]}</span><b style="max-width:60%">${row[1]}</b></li>`).join(''))}
                </ul>
                <div class="notice notice--warn" style="margin-top:var(--sp-4)">
                  <span class="notice__icon" aria-hidden="true">⚠️</span>
                  <p>Our kitchen handles milk, nuts, wheat and sesame in the same space, so
                     traces may be present even in items that do not list them.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section section--alt">
        <div class="container">
          <div class="panel-grid">
            <div class="panel reveal">
              <div class="panel__head"><h3>Visit the shop</h3></div>
              <ul class="kv-list">
                <li><span>Address</span><b>14, Rajwada Chowk, Indore, MP 452002</b></li>
                <li><span>Phone</span><b>+91 731 490 2211</b></li>
                <li><span>Email</span><b>hello@mahalaxmisweets.example</b></li>
                <li><span>Online hours</span><b>${formatClock(SHOP_HOURS.open)} – ${formatClock(SHOP_HOURS.close)}</b></li>
                <li><span>Slots per day</span><b>11 hand-over windows</b></li>
              </ul>
            </div>

            <div class="panel reveal">
              <div class="panel__head"><h3>Counter timings</h3></div>
              <div class="table-scroll">
                <table class="data-table">
                  <thead><tr><th>Days</th><th>Opens</th><th>Closes</th></tr></thead>
                  <tbody>
                    ${raw(HOURS.map((row) => `
                      <tr><td>${row[0]}</td><td>${formatClock(row[1])}</td><td>${formatClock(row[2])}</td></tr>`).join(''))}
                  </tbody>
                </table>
              </div>
              <p class="field__hint" style="margin-top:var(--sp-3)">
                Online preorder windows run from ${formatClock('09:00')} to ${formatClock('22:00')},
                with bookings closing 45 minutes before each window.
              </p>
            </div>
          </div>
        </div>
      </section>`;
  },

  mount(root) {
    root.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  },
};
