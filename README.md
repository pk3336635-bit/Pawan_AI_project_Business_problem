# Mahalaxmi Sweets — online ordering &amp; preorder-slot platform

A complete, front-end-only ordering website for a small-city sweet shop, built with **HTML, CSS and vanilla JavaScript**. No frameworks, no build step, no backend — it runs from any static host, including GitHub Pages.

> **Where great minds meet great bites, and every break becomes a memory. Fresh flavors, good vibes, and the perfect place to connect.**

---

## 1. Problem statements

### Goal 1 — Peak-hour crowding, order mix-ups and zero visibility

Mahalaxmi Sweets is a busy counter in Muzaffarpur,Bihar. Between 5 PM and 8 PM the shop is three-deep at the till, orders get swapped, and the owner has no idea which items actually sell, which offers work, or how long anything takes to prepare.

**What this site does about it**

- Category-wise digital menu (407 items) with images, prices, ratings and live stock.
- Search, filters and sorting so a customer finds an item in seconds instead of shouting across the counter.
- A cart, checkout and simulated payment flow that produces a unique **Order ID** — no more "the box with the red ribbon, uncle".
- Live order tracking (Placed → Confirmed → Preparing → Ready → Out for delivery → Delivered).
- An **Insights dashboard** with revenue, top sellers, category mix, payment split, peak hours and a conversion funnel.

### Goal 2 — Festival rush and preorder slotting

During Diwali, Rakhi and Ganesh Chaturthi the queue spills onto the road, popular mithai runs out by noon, and promised delivery times slip. The kitchen has no way to cap how much work it accepts per hour.

**What this site does about it**

- **Preorder for a date and a time slot** — 11 hand-over windows per day, for pickup or delivery.
- **Slot capacity + auto-cutoff** — every window has a fixed capacity; when it fills, the slot is disabled and checkout is blocked for it. Bookings also close 45 minutes before a window starts.
- **Festival capacity boost** — festival days automatically get double capacity (extra staff).
- **Live availability badges** — "Only 4 left" / "Out of stock", driven by simulated inventory that decreases as you order.
- **Festival combo packs** highlighted on Home, Menu and Offers.
- **Bulk order desk** with quantity tiers, packaging options, a live estimate and a real "Place bulk preorder" that produces a trackable order.
- KPIs the owner actually needs: slot utilisation, on-time %, stockout rate, peak-day revenue and top festival items.

---

## 2. Feature list

| Area | What is included |
| --- | --- |
| **Home** | Hero, the brand quote, category tiles, bestsellers, live slot-availability strip, festival picks, how-it-works, live shop stats, testimonials |
| **Menu** | 407 items · 6 categories · search (debounced) · category filter · 5 quick filters · 5 sort orders · paged rendering (24 at a time) · quick-view dialog · shareable filter URLs |
| **Order (cart)** | Add/remove/update quantity, live totals, GST, packaging and delivery fees, coupon box, pickup/delivery switch, stock warnings, "goes well with" suggestions |
| **Checkout** | Validated customer form, pickup/delivery toggle, 7-day preorder date strip, capacity-aware slot grid, festival badges, final availability re-check before payment |
| **Payment** | UPI / Card / Wallet / Net banking / COD (all simulated), local card validation (Luhn + expiry + CVV), failure simulation for demos, printable receipt with Order ID |
| **Order tracking** | Look up any order ID (yours *or* one from the dataset), progress bar, status timeline, auto-advance every 45 s, manual advance/cancel, recent orders list |
| **Offers** | 8 coupons with real rules (minimum value, category/festival/pickup/bulk scope, caps, expiry), copy-to-clipboard, one-click apply, festival combos, bulk order desk |
| **Cert** | FSSAI/ISO/AGMARK/GST/fire-safety licences, quality pillars, daily hygiene checklist, ingredient sourcing, allergen table, store timings — all printable |
| **Sign in / sign up** | Customer accounts with mobile-or-email sign-in, password rules, show/hide password, failed-attempt lockout, three ready-made demo accounts |
| **My account** | Profile + saved address, personal KPI cards, and a live list of **only that customer's** orders |
| **Staff sign-in** | Restricted login for the two admin accounts |
| **Admin / Insights** | **Admins only.** 4 tabs — **Orders & kitchen** (queue + live slot board + stage controls), General KPIs, Products & customers, Festival & slots. SVG charts, funnel, restock list, staff order viewer, "reset demo data", sign out |
| **Cross-cutting** | Hash router with lazy-loaded pages and route guards, **cross-tab live sync**, cart drawer, sticky mobile cart bar, toasts, modals, skeleton loaders, image fallbacks, keyboard shortcuts, print styles |

### The owner runs the counter

The dashboard opens on **Orders & kitchen**, which is the working screen rather than a report:

- **Kitchen queue** — every live order that has not been handed over, sorted by promised
  time, with one button that moves it to its next stage:
  `Confirm order → Start preparing → Mark ready → Send out → Mark delivered`
  (pickup orders skip *Out for delivery*). Orders past their promise are flagged.
- **Cancel** releases the slot back to the board immediately.
- **Live slot board** — pick any of the next 7 days and see every window's
  `booked / capacity`, remaining places and Full / Closed state, with festival days
  highlighted.
- **Handed over & cancelled** — the day's finished orders with an on-time verdict.
- **Simulation settings** — an *auto-advance* switch. It is **off by default** so the owner
  drives every status, exactly like a real counter. Turn it on if you want statuses to march
  along by themselves every 45 seconds for an unattended demo.

Every stage change writes to the store, broadcasts to all tabs, and triggers a full KPI
recomputation — the customer's timeline, the queue counters, the status distribution,
on-time %, slot utilisation and revenue all move together, because they are all derived from
the same order records.

### Roles and access

| Role | Who | Can do |
| --- | --- | --- |
| **Guest** | Not signed in | Browse, search, fill a cart. **Cannot** check out or see any order |
| **Customer** | Anyone who signs up | Everything a guest can, **plus** place orders, book slots and track **their own** orders |
| **Admin** | **Pawan Kumar** — Owner<br>**Saurav Ranjan** — Store Manager | Everything above **plus** the Insights dashboard and every order in the shop |

Guards live in [`js/router.js`](js/router.js) and are re-run on **every** navigation,
so typing a URL by hand changes nothing:

| Route | Requires |
| --- | --- |
| `#/checkout`, `#/payment` | a signed-in **customer** (this is what "you must log in to order" means) |
| `#/account` | a signed-in **customer** |
| `#/admin` | a signed-in **admin** |
| `#/tracking` | a signed-in customer (or an admin when no customer is signed in) |

The cart is deliberately **not** gated — a guest can fill it, and it survives the sign-in
redirect, which is how real shops do it.

#### How "only my orders" is enforced

Every order carries the `userId` of the account that placed it. The tracking and account
pages call `getOrdersForUser(ownedUserIds(currentCustomer()))`, so another customer's order
id simply does not exist as far as they are concerned — you get
*"No order with that ID on your account"*.

A signed-in customer always wins over a staff session in the same browser, so opening the
dashboard in a second window can never quietly widen what the customer sees. Staff view
order detail through a built-in **order viewer** on the dashboard instead.

### Demo accounts

**Customers** — password `Demo@2026` for all three. Each is linked to a record in
`data/users.json`, so signing in shows a **year of real order history** straight away.

| Mobile | Name |
| --- | --- |
| `9515745229` | Yogita Maheshwari |
| `9035680293` | Vidya Vyas |
| `7067339624` | Varun Mishra |

Or just create a new account — it takes about twenty seconds.

**Admins**

| Username | Password | Account |
| --- | --- | --- |
| `pawan` | `Pawan@2026` | Pawan Kumar · Owner |
| `saurav` | `Saurav@2026` | Saurav Ranjan · Store Manager |

The full name (`Pawan Kumar` / `Saurav Ranjan`) works in the username box too.
Both credential sets are shown behind a "Demo credentials" disclosure on the sign-in pages
so the project can be evaluated — delete those `<details>` blocks in
[`js/pages/login.js`](js/pages/login.js) and
[`js/pages/adminLogin.js`](js/pages/adminLogin.js) if you do not want them visible.

To change a password, regenerate its hash and paste it into `ADMINS` (or a seed customer) in
[`js/auth.js`](js/auth.js). Admins are salted by username, customers by account id:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('mahalaxmi::pawan::YourNewPassword').digest('hex'))"
```

### Live sync across windows (the demo centrepiece)

[`js/sync.js`](js/sync.js) puts every open tab of the site on the same page:

1. **BroadcastChannel** — instant tab-to-tab messages on every store mutation.
2. **The `storage` event** — a fallback that fires in other tabs whenever localStorage
   changes, so it still works in older browsers.

Remote notifications are never re-broadcast, so there is no echo loop.

Open **two windows side by side**: sign in as a customer in one and as an admin in the
other (they use separate session keys precisely so this works). When the customer pays:

- the admin's **kitchen queue** and **live order feed** gain the order within a second,
- it appears at the **top of "Latest orders"** (live orders always outrank simulated ones),
- a toast announces *"New order MS-... · ₹512 from Ananya Sharma"*,
- the **slot board** shows one more place taken in that window,
- **every KPI recomputes** — total orders, revenue, AOV, category mix, payment split,
  peak hours, slot utilisation, stockout rate and the conversion funnel.

Then, as the owner moves the order along (*Confirm → Preparing → Ready → Delivered*), the
customer's tracking timeline updates in the other window within a second, and the queue
counters, status distribution and on-time % follow.

The dashboard preserves your open tab and scroll position across a live refresh, so the
update is barely noticeable — the numbers just change.

### Accessibility

- Semantic landmarks, skip link, visible focus rings, `aria-pressed` / `aria-selected` / `aria-live` where state changes.
- Focus trapping and Escape handling in the modal and cart drawer.
- Colour contrast on all text/button pairs; `prefers-reduced-motion` disables animation.
- Every interactive control is reachable and operable by keyboard.

### Security notes

- All rendered data goes through an auto-escaping ``html`...` `` template tag (`js/utils/format.js`), so nothing from JSON, localStorage or a form can inject markup.
- Free-text input is sanitised and length-clamped before it is stored.
- Card fields are validated locally and never stored, logged or transmitted; the payment is entirely simulated.
- Analytics events store only ids, counts and timestamps — no personal data.
- **Admin and customer passwords are never stored in plain text.** `js/auth.js` keeps only a
  salted SHA-256 digest, compares it in constant time, expires sessions after 8 hours and
  locks sign-in for 60 seconds after 5 failed attempts.
- **Order ownership is checked on read**, not just hidden in the UI — the tracking page
  searches only within the orders the current account owns.

> ⚠️ **Be honest about this in your viva:** with no backend, the login is
> *demonstration-grade*. Anything that runs in the browser can be inspected in DevTools.
> The same guards in a real deployment would live on a server behind a session cookie or
> JWT — the client-side code would be identical, only `login()` would call an API instead
> of hashing locally, and `getOrdersForUser()` would become a scoped database query.

---

## 3. Running it locally

The app uses ES modules and `fetch()`, so it must be served over **http://**, not opened as `file://`.

```bash
# option 1 — any static server
npx serve .

# option 2 — Python
python -m http.server 5173

# option 3 — VS Code
# install the "Live Server" extension, right-click index.html → Open with Live Server
```

Then open <http://localhost:5173/>.

Node is only needed if you want to **regenerate** the data or the images.

---

## 4. Project structure

```
/
├── index.html                 App shell (chrome + mount points only)
├── .nojekyll                  Lets GitHub Pages serve every folder as-is
├── assets/
│   ├── images/                79 generated SVG food illustrations + fallback
│   └── icons/favicon.svg
├── css/
│   ├── variables.css          Design tokens (colour, type, spacing, motion)
│   ├── styles.css             Reset, layout shell, page compositions
│   ├── components.css         Buttons, cards, forms, drawer, modal, charts…
│   └── responsive.css         Breakpoints, mobile nav, print styles
├── js/
│   ├── app.js                 Bootstrap: mounts chrome, warms caches, starts router
│   ├── router.js              Hash router, lazy page imports, guards, reveal-on-scroll
│   ├── auth.js                Customer + admin accounts, hashed sign-in, sessions, lockout
│   ├── sync.js                Cross-tab live sync (BroadcastChannel + storage event)
│   ├── api.js                 JSON data layer + derived views (catalogue, festivals…)
│   ├── store.js               localStorage state: cart, checkout, orders, events, pricing
│   ├── analytics.js           Funnel event tracking + read helpers
│   ├── kpi.js                 All KPI maths (pure functions over orders/menu/events)
│   ├── components/
│   │   ├── navbar.js  footer.js  cartDrawer.js  productCard.js
│   │   ├── modal.js   toast.js   skeleton.js    charts.js
│   ├── pages/
│   │   ├── home.js    menu.js    order.js       tracking.js
│   │   ├── offers.js  cert.js    checkout.js    payment.js
│   │   ├── login.js   account.js
│   │   └── adminLogin.js  adminInsights.js
│   └── utils/
│       ├── format.js          Currency/number formatting + escaping HTML template tag
│       ├── date.js            IST-safe date maths and formatting
│       ├── uuid.js            Order IDs, transaction refs
│       ├── validators.js      Form rules + error painting
│       ├── inventory.js       Stock simulation, availability, stockout stats
│       └── timeslots.js       Slot grid, capacity, cut-off, booking index
├── data/
│   ├── users.json             420 customers
│   ├── menu.json              407 menu items
│   ├── orders.json            1,060 orders
│   └── offers.json            Coupons, banners, bulk tiers, packaging, festivals
├── scripts/
│   ├── generateData.js        Fake-data generator (Node **and** browser runnable)
    ├── generateImages.js      Builds the SVG food illustrations
    └── checkDeploy.js         Pre-flight check for GitHub Pages (case, paths, sizes)
└── README.md
```

---

## 5. How the fake data is structured and generated

### Regenerating

```bash
node scripts/generateData.js     # writes data/users.json, data/menu.json, data/orders.json
node scripts/generateImages.js   # writes assets/images/*.svg
```

If Node is not available, the generator also runs in the browser. Load the site, open DevTools and run:

```js
const m = await import('./scripts/generateData.js'); // or paste the file into the console
MahalaxmiDataGenerator.downloadAll();                // downloads the three JSON files
```

The generator is **seeded** (`mulberry32(20260829)`), so every run produces byte-identical output, and it validates referential integrity before writing anything.

### Referential integrity guarantees

- `order.userId` always exists in `users.json`
- `order.items[].menuItemId` always exists in `menu.json`
- `order.timeSlotId` always exists in the shared slot grid (mirrored in `js/utils/timeslots.js`)

The script refuses to write the files if any of these fail.

### Schemas

**`users.json`** (420 records)

```jsonc
{
  "id": "U0001",
  "name": "Ananya Sharma",
  "phone": "+91 98765 43210",
  "email": "ananya.sharma142@gmail.com",
  "area": "Aryabhatta Hostel — Block A",
  "addressLine": "Room 214, Aryabhatta Hostel — Block A",
  "city": "Indore", "state": "Madhya Pradesh", "pincode": "452004",
  "customerType": "student|resident|corporate",
  "loyaltyTier": "Silver|Gold|Platinum",
  "totalOrders": 17, "marketingOptIn": true,
  "createdAt": "2025-02-11T18:24:03+05:30"
}
```

**`menu.json`** (407 records — 6 categories × base items × pack-size variants)

```jsonc
{
  "id": "M0001",
  "name": "Gulab Jamun — 500 g Box",
  "baseName": "Gulab Jamun", "variant": "500 g Box",
  "category": "sweets", "categoryName": "Sweets & Mithai",
  "price": 449, "mrp": 509,
  "description": "Soft khoya dumplings soaked in warm cardamom syrup.",
  "imageUrl": "assets/images/gulab-jamun.svg", "imageKey": "gulab-jamun",
  "isVeg": true, "rating": 4.18, "ratingCount": 612,
  "popularityScore": 88, "available": true,
  "inventoryCount": 24,          // drives the availability badges
  "stockoutEvents": 2,           // times it hit zero in the simulated month
  "isFestivalSpecial": false, "isBestseller": true,
  "tags": ["bestseller", "classic"],
  "serves": 2, "prepTimeMins": 12, "shelfLifeDays": 3, "calories": 620
}
```

**`orders.json`** (1,060 records)

```jsonc
{
  "id": "ORD-20260828-00912",
  "userId": "U0137",
  "customerName": "Rakesh Malviya", "phone": "+91 98212 44119",
  "items": [{ "menuItemId": "M0043", "name": "…", "category": "sweets",
              "qty": 2, "unitPrice": 449, "lineTotal": 898 }],
  "itemCount": 5,
  "subtotal": 1240, "discount": 100, "promoCode": "SWEET10",
  "packagingFee": 15, "deliveryFee": 0, "tax": 57, "total": 1212,
  "paymentMethod": "UPI", "paymentStatus": "Paid",
  "status": "Delivered",
  "statusHistory": [{ "status": "Placed", "at": "…" }, …],
  "channel": "web|app|walk-in",
  "deliveryType": "pickup|delivery", "address": "…", "area": "…", "notes": "…",
  "preorderDate": "2026-08-28", "timeSlotId": "SLOT-1900",
  "isFestivalOrder": true, "festivalName": "Raksha Bandhan",
  "promisedAt": "…", "completedAt": "…", "onTime": true,
  "rating": 5,
  "createdAt": "2026-08-28T19:04:11+05:30",
  "updatedAt": "2026-08-28T19:41:52+05:30"
}
```

### Realism built into the simulation

- **Demand curve** — weekend uplift (×1.55), gentle year-on-year growth, breakfast and 5–8 PM evening peaks.
- **Festival spikes** — Navratri, Dussehra, Karva Chauth, Diwali, Bhai Dooj, Christmas/New Year, Makar Sankranti, Holi, Akshaya Tritiya and Raksha Bandhan. Demand is ×9 on the day itself and tapers over ±3 days, with more combos and gift packs in the basket.
- **Price-aware baskets** — cheap counter items sell far more often than ₹2,000 hampers, which keeps the average order value realistic (≈ ₹886).
- **Preorders** — ~68 % of orders book a slot; two marquee windows in the upcoming week are deliberately saturated so the "Slot full" behaviour is visible immediately.
- **Punctuality** — orders are late ~11 % of the time normally and ~28 % during festival weeks, which is exactly the pain Goal 2 targets.
- **Timestamps** — every timestamp carries an explicit `+05:30` offset and all date maths runs in IST, so the site behaves identically in any browser time zone.

> **About "today":** the dataset is anchored to **29 Aug 2026**. The dashboard therefore treats the newest timestamp it can see as "now", so "last 7 days" is never empty. Orders you place in the browser are merged in and shift that anchor forward automatically.

---

## 6. How the KPIs are computed

All KPI maths lives in [`js/kpi.js`](js/kpi.js) as pure functions over `orders`, `menu` and
`events`. Cancelled orders are excluded from every revenue figure.

**The dataset and the live orders are one pool.** `api.getAllOrders(getLocalOrders())`
concatenates `data/orders.json` with every order placed by a signed-in customer in this
browser, and *that* array feeds every calculation below. An order placed during the demo
is not a special case — it is simply the 1,061st order.

### General KPIs

| KPI | Formula |
| --- | --- |
| Live orders | count of orders written by the checkout flow in this browser |
| Registered accounts | customer accounts in this browser (3 seeded + every sign-up) |
| Kitchen queue counters | live orders grouped by status — recomputed on every stage change |
| Total revenue | `Σ order.total` where `status ≠ Cancelled` |
| Revenue · last 7 days | same, filtered to `createdAt ≥ now − 7 days`, compared with the previous 7 days for the trend arrow |
| Total orders | count of non-cancelled orders |
| Average order value | `totalRevenue / totalOrders` |
| Top 10 selling items | line items grouped by `menuItemId`, ranked by quantity **and** by revenue |
| Orders by category | item revenue grouped by `category` |
| Payment method split | order count grouped by `paymentMethod` |
| Order status distribution | order count grouped by `status` (cancelled included) |
| Peak order hours | orders bucketed into a 7 × 15 weekday-by-hour matrix in IST → heatmap + bar chart |
| Cancellation rate | `cancelled / all orders` |
| Repeat-customer rate | customers with more than one order ÷ unique customers |
| Conversion funnel | unique **sessions** that fired `menu_view → add_to_cart → checkout_start → payment_start → payment_success`, read from localStorage |

The funnel is deliberately session-based, so refreshing the menu ten times does not distort the rate.

### Goal 2 KPIs

| KPI | Formula |
| --- | --- |
| **Slot utilisation** | For every `preorderDate + timeSlotId`: `bookings ÷ capacity`. Capacity is the slot's base value, doubled on festival days. Reported per window (aggregated across dates) and per day for the next 7 days. |
| **On-time orders %** | Delivered orders where `completedAt ≤ promisedAt`, ÷ all delivered orders. Reported overall, for festival orders and for normal days, plus the average minutes of delay on late orders. |
| **Stockout rate** | Items whose effective inventory is zero ÷ total menu items. "Effective" means `inventoryCount − everything you have ordered in this browser − what is in your cart`, so the number moves while you use the demo. `stockoutEvents` gives the monthly rate as well. |
| **Peak-day revenue** | Orders grouped by IST calendar day, ranked by revenue; the top 5 days are listed with the festival that caused them. |
| **Top festival items** | Line items from orders where `isFestivalOrder = true`, ranked by quantity and by revenue, plus a revenue breakdown per festival. |

### Charts

Every chart is hand-rolled SVG/HTML in [`js/components/charts.js`](js/components/charts.js) — line/area, vertical bars, donut, ranked horizontal bars, heatmap and progress bars. No chart library is used, and the whole module is about 6 KB.

---

## 7. Slot capacity rules (Goal 2 in detail)

The grid in [`js/utils/timeslots.js`](js/utils/timeslots.js) is the single source of truth and is mirrored exactly in the data generator.

| Window | Capacity | Window | Capacity |
| --- | --- | --- | --- |
| 09:00–10:00 | 10 | 17:00–18:00 | 14 |
| 10:00–11:00 | 12 | 18:00–19:00 | 16 |
| 11:00–12:00 | 12 | 19:00–20:00 | 18 |
| 12:00–13:00 | 14 | 20:00–21:00 | 14 |
| 13:00–14:00 | 10 | 21:00–22:00 | 10 |
| 16:00–17:00 | 12 | | |

- **Festival days** (± 2 days around a festival) get **×2 capacity**.
- A window is **`full`** when bookings reach capacity → the button is disabled.
- A window is **`closed`** once it is within **45 minutes** of starting.
- Above **75 %** utilisation the window is flagged "Filling fast · only N left".
- Cancelling an order releases its seat back to the slot.
- Availability is re-checked at submit time, so a slot that filled while the customer was typing is rejected with a clear message.

---

## 8. Deploying to GitHub Pages

Yes — the whole thing is static, so GitHub Pages runs it as-is. No build step, no server,
no environment variables.

### Pre-flight check

Before you push, run:

```bash
node scripts/checkDeploy.js
```

It verifies the things that only break **after** you deploy:

- **Exact-case paths** — GitHub Pages runs on Linux (case-sensitive); Windows and macOS are
  usually not. `./Utils/Format.js` works on your laptop and 404s in production. The script
  checks every `import`, every `new URL(..., import.meta.url)`, every `assets/…` reference in
  HTML/CSS/JS, and all 407 image paths in `menu.json`.
- **No root-absolute URLs** (`/css/styles.css`) — those break under `/your-repo-name/`.
- `.nojekyll` present, `index.html` at the root, `type="module"` script tag.
- No file over GitHub's 100 MB limit.

### Steps

1. Create a repository and push this folder:

   ```bash
   git init
   git add .
   git commit -m "Mahalaxmi Sweets — online ordering platform"
   git branch -M main
   git remote add origin https://github.com/<your-username>/mahalaxmi-sweets.git
   git push -u origin main
   ```

2. On GitHub go to **Settings → Pages**.
3. Under **Build and deployment → Source** choose **Deploy from a branch**.
4. Pick branch **`main`** and folder **`/ (root)`**, then **Save**.
5. Wait for the green tick, then open `https://<your-username>.github.io/mahalaxmi-sweets/`.

### Why it works on a project subpath

The site was tested served from `http://localhost:5174/mahalaxmi-sweets/` — the exact shape
of a GitHub Pages *project* site — and the full flow (sign-up → order → slot → payment →
receipt → admin dashboard) ran with **zero failed requests**:

- **Hash routing** (`#/menu`) means every URL is still `index.html`, so deep links work
  without the `404.html` redirect hack other SPAs need.
- **Data paths** resolve through `new URL('../data/menu.json', import.meta.url)`, which is
  relative to the module, not the domain root.
- **Asset paths** (`assets/images/…`) are document-relative, and the document never changes.

### Things worth knowing

| | |
| --- | --- |
| **HTTPS is required** | Password hashing uses `crypto.subtle`, which browsers only expose in a secure context. GitHub Pages is always HTTPS, so this is fine — but opening `index.html` as a `file://` URL will not work (nor will ES modules or `fetch`). |
| **Data is per-browser** | Accounts, orders and analytics live in `localStorage`. Your professor opening the link on their own laptop sees the 1,060 simulated orders but not the ones you placed. That is expected for a backend-less project — say so up front. |
| **Live sync is per-browser too** | The two-window demo works because both windows share `localStorage` on one machine. Across devices you would need a real backend. |
| **Repository visibility** | Pages on a **public** repo is free. Private repos need a paid plan. |
| **First deploy takes a minute** | And a hard refresh (Ctrl+Shift+R) helps after you push updates, since Pages caches aggressively. |
| **Do not rename files by case only** | Git on Windows may not record the change, and the Linux host will then 404. Re-run `checkDeploy.js` after any rename. |

---

## 9. Demo script (7 minutes, two windows side by side)

> Open the site in **two browser windows**: left = customer, right = admin.

**Left window — the customer**

1. **Home** — read the quote, scroll to *Live slot availability*: today's later windows are already partly booked.
2. **Menu** — search "gulab", switch to *Festival specials*, note the "Only 3 left" and "Out of stock" badges, open a quick view.
3. Add 2–3 items → the cart badge bumps and the drawer opens.
4. Hit **Checkout** → you are bounced to **Sign in**, and the cart is still intact. Create an account (or use `9515745229` / `Demo@2026`).
5. **Order** — apply `SWEET10` (works), then `HOLI30` (expired) to show coupon validation.
6. **Checkout** — pick **tomorrow**: the 7–8 PM window is **Slot full and disabled**. Pick another window. Your name and address are already filled in from your account.
7. **Payment** — tick *Simulate a failed transaction*, pay, see the failure, retry successfully, get the Order ID.

**Right window — the admin** *(do this before step 7)*

8. Type `#/admin` → bounced to staff sign-in, **no KPI rendered**. Sign in as `pawan` / `Pawan@2026`. It opens on **Orders & kitchen**.
9. The moment the customer pays in the left window: a toast fires, the order appears in the
   **kitchen queue** and at the top of **Latest orders**, the **slot board** loses a place, and
   *Live orders*, *Total orders*, *Total revenue*, *AOV* and *Slot utilisation* all change —
   with **no refresh**.
10. Press **Confirm order**, then **Start preparing**, **Mark ready**, **Send out**,
    **Mark delivered**. Watch the queue counters empty out and the order drop into
    *Handed over & cancelled* with an on-time verdict.

**Back to the left window**

11. **Tracking** — the timeline now shows exactly the stages the owner set, with timestamps, and *"Delivered on time"*.
12. **Prove the privacy claim** — paste another customer's order ID into the tracking box: *"No order with that ID on your account"*.
13. **Offers → Bulk desk** — 25 kg of kaju katli in a premium gift box, watch the estimate and tier change, place the bulk preorder.
14. **Right window → Festival & slots** — slot utilisation, on-time %, stockout rate, peak-day revenue, top festival items. Point out that the conversion funnel filled up from the steps above.

---

## 10. Credits & disclaimer

Built as a college project. The shop, its licences, customers, orders and payments are **entirely fictional and simulated** — no real transaction is ever processed. All illustrations are generated by `scripts/generateImages.js` and are original to this project. Fonts: Poppins and Fraunces via Google Fonts.
