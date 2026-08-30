/**
 * generateData.js  —  Mahalaxmi Sweets fake-data generator
 * ---------------------------------------------------------------------------
 * Produces three referentially-consistent datasets:
 *
 *   data/users.json   (>= 400 customers)
 *   data/menu.json    (>= 400 menu items across 6 categories)
 *   data/orders.json  (>= 400 orders; this build emits ~1,040)
 *
 * Referential integrity guarantees
 *   - order.userId              -> always an existing users.json id
 *   - order.items[].menuItemId  -> always an existing menu.json id
 *   - order.timeSlotId          -> always an id from the shared slot grid
 *                                  (mirrored in js/utils/timeslots.js)
 *
 * Realism baked in
 *   - Indian names / phone formats / Indore-style localities and hostels
 *   - Festival spikes (Navratri, Diwali, Bhai Dooj, New Year, Sankranti,
 *     Holi, Raksha Bandhan) with extra combo + gift-pack purchases
 *   - Weekend uplift, breakfast / evening peak hours
 *   - Preorder slots, prep-time promises and on-time / late completion
 *   - Inventory levels so the UI can show "Only 4 left" / "Out of stock"
 *
 * HOW TO RUN
 *   Node (preferred):   node scripts/generateData.js
 *   Browser (no Node):  open the site, then in DevTools console run
 *                       MahalaxmiDataGenerator.downloadAll()
 *                       (script is loaded on the Admin / Insights page)
 * ---------------------------------------------------------------------------
 */

(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (typeof require !== 'undefined' && require.main === module) api.writeToDisk();
  } else {
    root.MahalaxmiDataGenerator = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* =================================================================== */
  /* 1. Deterministic randomness (so regenerating gives the same data)   */
  /* =================================================================== */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = mulberry32(20260829);
  const rnd = () => rand();
  const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  const round2 = (n) => Math.round(n * 100) / 100;

  function weightedPick(entries) {
    // entries: [[value, weight], ...]
    const total = entries.reduce((s, e) => s + e[1], 0);
    let r = rnd() * total;
    for (const [value, weight] of entries) {
      r -= weight;
      if (r <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  /* =================================================================== */
  /* 2. IST time helpers (all timestamps are stored with +05:30 offset)  */
  /* =================================================================== */

  const IST_OFFSET_MS = 330 * 60 * 1000;
  const pad = (n) => String(n).padStart(2, '0');

  /** Wall-clock IST components -> epoch milliseconds. */
  function istMs(y, m, d, h = 0, mi = 0, s = 0) {
    return Date.UTC(y, m - 1, d, h, mi, s) - IST_OFFSET_MS;
  }

  /** Epoch ms -> "YYYY-MM-DDTHH:mm:ss+05:30". */
  function istIso(ms) {
    const d = new Date(ms + IST_OFFSET_MS);
    return (
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+05:30`
    );
  }

  /** Epoch ms -> "YYYY-MM-DD" in IST. */
  const istDateKey = (ms) => istIso(ms).slice(0, 10);

  /** Day of week in IST (0 = Sunday). */
  const istDay = (ms) => new Date(ms + IST_OFFSET_MS).getUTCDay();

  const DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Anchor = the moment the dataset "ends".
   * Fixed so the JSON is reproducible; the KPI engine treats the newest
   * timestamp in the data as "today" so dashboards never look empty.
   */
  const ANCHOR_MS = istMs(2026, 8, 29, 21, 30, 0);
  const HISTORY_DAYS = 365;

  /* =================================================================== */
  /* 3. Shared time-slot grid (mirrored in js/utils/timeslots.js)        */
  /* =================================================================== */

  const TIME_SLOTS = [
    { id: 'SLOT-0900', start: '09:00', end: '10:00', label: '09:00 AM – 10:00 AM', capacity: 10, part: 'morning' },
    { id: 'SLOT-1000', start: '10:00', end: '11:00', label: '10:00 AM – 11:00 AM', capacity: 12, part: 'morning' },
    { id: 'SLOT-1100', start: '11:00', end: '12:00', label: '11:00 AM – 12:00 PM', capacity: 12, part: 'morning' },
    { id: 'SLOT-1200', start: '12:00', end: '13:00', label: '12:00 PM – 01:00 PM', capacity: 14, part: 'afternoon' },
    { id: 'SLOT-1300', start: '13:00', end: '14:00', label: '01:00 PM – 02:00 PM', capacity: 10, part: 'afternoon' },
    { id: 'SLOT-1600', start: '16:00', end: '17:00', label: '04:00 PM – 05:00 PM', capacity: 12, part: 'evening' },
    { id: 'SLOT-1700', start: '17:00', end: '18:00', label: '05:00 PM – 06:00 PM', capacity: 14, part: 'evening' },
    { id: 'SLOT-1800', start: '18:00', end: '19:00', label: '06:00 PM – 07:00 PM', capacity: 16, part: 'evening' },
    { id: 'SLOT-1900', start: '19:00', end: '20:00', label: '07:00 PM – 08:00 PM', capacity: 18, part: 'evening' },
    { id: 'SLOT-2000', start: '20:00', end: '21:00', label: '08:00 PM – 09:00 PM', capacity: 14, part: 'night' },
    { id: 'SLOT-2100', start: '21:00', end: '22:00', label: '09:00 PM – 10:00 PM', capacity: 10, part: 'night' },
  ];

  /** Slots get extra kitchen staff on festival days. */
  const FESTIVAL_CAPACITY_MULTIPLIER = 2;

  /* =================================================================== */
  /* 4. Festival calendar (approximate dates, used to shape demand)      */
  /* =================================================================== */

  const FESTIVALS = [
    { name: 'Navratri Special', date: '2025-09-22', combo: 'festival-pack' },
    { name: 'Dussehra', date: '2025-10-02', combo: 'festival-pack' },
    { name: 'Karva Chauth', date: '2025-10-10', combo: 'sweet-box' },
    { name: 'Diwali', date: '2025-10-20', combo: 'diwali-special' },
    { name: 'Bhai Dooj', date: '2025-10-23', combo: 'gift-hamper' },
    { name: 'Christmas & New Year', date: '2025-12-25', combo: 'corporate-box' },
    { name: 'New Year', date: '2026-01-01', combo: 'corporate-box' },
    { name: 'Makar Sankranti', date: '2026-01-14', combo: 'sweet-box' },
    { name: 'Holi', date: '2026-03-04', combo: 'holi-special' },
    { name: 'Akshaya Tritiya', date: '2026-04-19', combo: 'wedding-tray' },
    { name: 'Raksha Bandhan', date: '2026-08-28', combo: 'rakhi-special' },
  ];

  const FESTIVAL_MS = FESTIVALS.map((f) => {
    const [y, m, d] = f.date.split('-').map(Number);
    return { ...f, ms: istMs(y, m, d, 12) };
  });

  /** Multiplier applied to a day's demand because of nearby festivals. */
  function festivalBoost(dayMs) {
    let boost = 1;
    for (const f of FESTIVAL_MS) {
      const diffDays = Math.abs(Math.round((dayMs - f.ms) / DAY_MS));
      if (diffDays === 0) boost = Math.max(boost, 9);
      else if (diffDays === 1) boost = Math.max(boost, 6);
      else if (diffDays === 2) boost = Math.max(boost, 3.8);
      else if (diffDays === 3) boost = Math.max(boost, 2.4);
    }
    return boost;
  }

  const isFestivalWindow = (dayMs) => festivalBoost(dayMs) > 2;

  /* =================================================================== */
  /* 5. Menu catalogue                                                   */
  /* =================================================================== */

  const CATEGORIES = [
    { id: 'sweets', name: 'Sweets & Mithai', icon: '🍬' },
    { id: 'snacks', name: 'Snacks & Savouries', icon: '🥟' },
    { id: 'beverages', name: 'Beverages', icon: '🍵' },
    { id: 'namkeen', name: 'Namkeen & Farsan', icon: '🥨' },
    { id: 'bakery', name: 'Bakery & Desserts', icon: '🧁' },
    { id: 'combos', name: 'Combos & Specials', icon: '🎁' },
  ];

  // [name, imageKey, basePrice, isVeg, shortDescription, tags]
  const BASE_ITEMS = {
    sweets: [
      ['Gulab Jamun', 'gulab-jamun', 240, true, 'Soft khoya dumplings soaked in warm cardamom syrup.', ['bestseller', 'classic']],
      ['Sponge Rasgulla', 'rasgulla', 220, true, 'Spongy chenna balls simmered in light sugar syrup.', ['bengali', 'classic']],
      ['Kaju Katli', 'kaju-katli', 780, true, 'Silky cashew fudge finished with edible silver leaf.', ['premium', 'gifting']],
      ['Motichoor Laddu', 'motichoor-laddu', 360, true, 'Fine boondi pearls bound with ghee and saffron.', ['festival', 'classic']],
      ['Besan Laddu', 'laddu', 320, true, 'Slow-roasted gram flour laddus with pure desi ghee.', ['classic']],
      ['Kesar Milk Peda', 'peda', 400, true, 'Dense milk peda perfumed with Kashmiri saffron.', ['festival']],
      ['Kalakand', 'kalakand', 420, true, 'Grainy milk cake studded with pistachio slivers.', ['premium']],
      ['Chocolate Barfi', 'chocolate-barfi', 440, true, 'Two-layer barfi with Belgian cocoa ganache.', ['kids', 'fusion']],
      ['Crispy Jalebi', 'jalebi', 260, true, 'Fermented coils fried to order, dripping in syrup.', ['bestseller', 'hot']],
      ['Imarti', 'imarti', 300, true, 'Urad dal rings in saffron syrup, a Malwa favourite.', ['classic']],
      ['Rasmalai', 'rasmalai', 380, true, 'Chenna patties floating in thickened saffron milk.', ['bestseller', 'chilled']],
      ['Moong Dal Halwa', 'halwa', 460, true, 'Ghee-rich halwa slow cooked for four hours.', ['winter', 'premium']],
      ['Sandesh', 'sandesh', 340, true, 'Delicate chenna sweet with a hint of nolen gur.', ['bengali']],
      ['Soan Papdi', 'soan-papdi', 280, true, 'Flaky cubes that melt the moment they touch you.', ['gifting']],
      ['Mawa Gujiya', 'gujiya', 400, true, 'Half-moon pastry stuffed with mawa and dry fruits.', ['festival', 'holi']],
      ['Rabri Malpua', 'malpua', 340, true, 'Golden malpua served with a ladle of chilled rabri.', ['hot']],
      ['Mysore Pak', 'mysore-pak', 420, true, 'Ghee-loaded gram flour squares from the south.', ['classic']],
      ['Gajar Ka Halwa', 'gajar-halwa', 440, true, 'Delhi carrots, khoya and cardamom, served warm.', ['winter', 'bestseller']],
      ['Rajbhog Kheer', 'kheer', 300, true, 'Creamy rice kheer with almonds and rose water.', ['chilled']],
      ['Ukadiche Modak', 'ganesh-modak', 420, true, 'Steamed rice modak with coconut-jaggery filling.', ['festival', 'ganesh']],
    ],
    snacks: [
      ['Punjabi Samosa', 'samosa', 25, true, 'Flaky triangle packed with spiced potato and peas.', ['bestseller', 'hot']],
      ['Pyaaz Kachori', 'kachori', 30, true, 'Jodhpur-style kachori with a tangy onion filling.', ['hot']],
      ['Khaman Dhokla', 'dhokla', 60, true, 'Steamed, fluffy and finished with mustard tempering.', ['healthy']],
      ['Pav Bhaji', 'pav-bhaji', 110, true, 'Buttery mashed vegetables with toasted pav.', ['bestseller']],
      ['Vada Pav', 'vada-pav', 35, true, 'Mumbai classic with dry garlic chutney.', ['street']],
      ['Kanda Poha', 'poha', 45, true, 'Indori poha topped with sev, jeeravan and lemon.', ['breakfast', 'bestseller']],
      ['Rava Upma', 'upma', 55, true, 'Soft semolina upma with curry leaves and cashew.', ['breakfast', 'healthy']],
      ['Chole Bhature', 'chole-bhature', 130, true, 'Fluffy bhature with slow-cooked Amritsari chole.', ['heavy']],
      ['Idli Sambar', 'idli', 70, true, 'Steamed idli with sambar and coconut chutney.', ['breakfast', 'healthy']],
      ['Masala Dosa', 'dosa', 120, true, 'Crisp dosa rolled around masala aloo.', ['bestseller']],
      ['Grilled Sandwich', 'sandwich', 90, true, 'Triple-layer veg sandwich grilled with butter.', ['quick']],
      ['Mixed Pakora', 'pakora', 80, true, 'Onion, potato and palak fritters with chutney.', ['monsoon', 'hot']],
      ['Veg Spring Roll', 'spring-roll', 100, true, 'Crunchy rolls with schezwan dip.', ['fusion']],
      ['Bread Pakora', 'bread-pakora', 40, true, 'Stuffed bread fritter served with imli chutney.', ['street']],
      ['Aloo Tikki Chaat', 'aloo-tikki', 70, true, 'Crisp tikki, curd, chutneys and pomegranate.', ['chaat', 'bestseller']],
    ],
    beverages: [
      ['Kadak Masala Chai', 'masala-chai', 20, true, 'Boiled with ginger, cardamom and lots of love.', ['bestseller', 'hot']],
      ['South Filter Coffee', 'filter-coffee', 35, true, 'Decoction brewed overnight, frothed to order.', ['hot']],
      ['Sweet Punjabi Lassi', 'lassi', 60, true, 'Thick curd lassi topped with malai.', ['chilled', 'bestseller']],
      ['Alphonso Mango Lassi', 'mango-lassi', 80, true, 'Seasonal Alphonso pulp blended with curd.', ['chilled', 'seasonal']],
      ['Cold Coffee', 'cold-coffee', 90, true, 'Ice-blended coffee with chocolate drizzle.', ['chilled', 'kids']],
      ['Kesar Badam Milk', 'badam-milk', 70, true, 'Almond milk with saffron strands, served hot.', ['hot', 'healthy']],
      ['Masala Chaas', 'buttermilk', 30, true, 'Spiced buttermilk with roasted cumin.', ['healthy', 'summer']],
      ['Royal Falooda', 'falooda', 120, true, 'Rose syrup, sabja, noodles and kulfi scoop.', ['dessert', 'chilled']],
      ['Mango Shake', 'mango-shake', 95, true, 'Thick shake with real mango chunks.', ['summer']],
      ['Nimbu Pani', 'nimbu-pani', 25, true, 'Fresh lime, black salt and a hint of mint.', ['summer', 'healthy']],
      ['Kesar Thandai', 'thandai', 85, true, 'Cooling nut-and-spice blend, a Holi must-have.', ['festival', 'holi']],
      ['Tulsi Green Tea', 'green-tea', 40, true, 'Light tulsi infusion with honey on the side.', ['healthy']],
      ['Hot Chocolate', 'hot-chocolate', 100, true, 'Rich cocoa with steamed milk and marshmallows.', ['kids', 'winter']],
    ],
    namkeen: [
      ['Bikaneri Bhujia', 'bhujia', 90, true, 'Fine moth-dal bhujia, fried in groundnut oil.', ['classic']],
      ['Indori Poha Chivda', 'chivda', 80, true, 'Light chivda with peanuts, curry leaf and sev.', ['bestseller']],
      ['Methi Mathri', 'mathri', 110, true, 'Layered fenugreek crackers, perfect with chai.', ['teatime']],
      ['Nylon Sev', 'sev', 70, true, 'Ultra-thin sev that stays crisp for weeks.', ['classic']],
      ['Namak Para', 'namak-para', 85, true, 'Diamond-cut salty crisps with ajwain.', ['teatime']],
      ['Masala Khakhra', 'khakhra', 95, true, 'Roasted khakhra, only 2 g fat per piece.', ['healthy']],
      ['Butter Murukku', 'murukku', 120, true, 'Coiled rice-flour murukku with white butter.', ['south']],
      ['Bhajani Chakli', 'chakli', 130, true, 'Multi-grain chakli roasted the Maharashtrian way.', ['festival']],
      ['Masala Peanuts', 'peanut-masala', 75, true, 'Besan-coated peanuts with chaat masala.', ['teatime']],
    ],
    bakery: [
      ['Black Forest Slice', 'cake-slice', 90, true, 'Cherry compote between cocoa sponge layers.', ['dessert']],
      ['Chocolate Truffle Pastry', 'pastry', 95, true, 'Dark chocolate ganache on moist sponge.', ['bestseller', 'dessert']],
      ['Danish Butter Cookies', 'cookies', 150, true, 'Crumbly butter cookies baked fresh daily.', ['teatime']],
      ['Walnut Brownie', 'brownie', 110, true, 'Fudgy brownie with roasted walnut chunks.', ['dessert']],
      ['Choco Chip Muffin', 'muffin', 70, true, 'Soft muffin loaded with chocolate chips.', ['kids']],
      ['Sugar Doughnut', 'doughnut', 60, true, 'Pillowy doughnut rolled in cinnamon sugar.', ['kids']],
      ['Cream Roll', 'cream-roll', 45, true, 'Flaky puff roll piped with vanilla cream.', ['teatime', 'nostalgia']],
      ['Veg Puff Patties', 'patties', 40, true, 'Buttery puff with spiced vegetable filling.', ['quick', 'bestseller']],
      ['Matka Kulfi', 'ice-cream', 80, true, 'Slow-set kulfi in a clay matka, malai rich.', ['chilled', 'dessert']],
    ],
    combos: [
      ['Assorted Sweet Box', 'sweet-box', 620, true, 'Six house favourites packed in a keepsake box.', ['gifting', 'bestseller']],
      ['Festival Special Pack', 'festival-pack', 899, true, 'Mithai, namkeen and dry fruits in one tray.', ['festival', 'gifting']],
      ['Diwali Mithai Hamper', 'diwali-special', 1450, true, 'Premium hamper with diya, mithai and dry fruits.', ['festival', 'diwali', 'gifting']],
      ['Rakhi Gift Combo', 'rakhi-special', 780, true, 'Rakhi, roli-chawal and 500 g of mithai.', ['festival', 'rakhi', 'gifting']],
      ['Holi Gujiya Pack', 'holi-special', 690, true, 'Gujiya, thandai mix and gulal in one pack.', ['festival', 'holi']],
      ['Ganesh Modak Thali', 'ganesh-modak', 750, true, 'Twenty-one modak with prasad accessories.', ['festival', 'ganesh']],
      ['Snack + Tea Combo', 'snack-tea-combo', 65, true, 'Two samosas with a cutting chai. Break sorted.', ['bestseller', 'value']],
      ['Student Saver Combo', 'student-combo', 99, true, 'Poha, samosa and chai at a campus-friendly price.', ['value', 'campus', 'bestseller']],
      ['Family Feast Thali', 'family-thali', 480, true, 'Chole bhature, dhokla, sweets and lassi for four.', ['family']],
      ['Corporate Gift Box', 'corporate-box', 1250, true, 'Branded box for teams, GST invoice included.', ['gifting', 'bulk']],
      ['Wedding Sweet Tray', 'wedding-tray', 2200, true, 'Twelve-variety tray for shagun and baraat.', ['bulk', 'gifting']],
      ['Premium Dry Fruit Hamper', 'gift-hamper', 1850, true, 'Kaju, badam, anjeer and sugar-free mithai.', ['premium', 'gifting']],
    ],
  };

  // [variantLabel, priceMultiplier, servesMultiplier]
  const VARIANTS = {
    sweets: [
      ['250 g Box', 1, 1],
      ['500 g Box', 1.85, 2],
      ['1 kg Box', 3.5, 4],
      ['Pack of 6', 0.7, 1],
      ['Sugar-Free 250 g', 1.25, 1],
      ['Premium Gift Pack 500 g', 2.3, 2],
    ],
    snacks: [
      ['Single', 1, 1],
      ['Plate of 2', 1.9, 1],
      ['Plate of 4', 3.6, 2],
      ['Party Pack of 10', 8.5, 5],
      ['Jain Special', 1.15, 1],
      ['With Chutney Combo', 1.35, 1],
    ],
    beverages: [
      ['Regular 200 ml', 1, 1],
      ['Large 350 ml', 1.6, 1],
      ['Family Pack 1 L', 3.9, 4],
      ['Sugar-Free', 1.1, 1],
      ['Premium Malai', 1.45, 1],
    ],
    namkeen: [
      ['200 g Pack', 1, 1],
      ['500 g Pack', 2.3, 2],
      ['1 kg Pack', 4.4, 4],
      ['Family Tin 1.5 kg', 6.3, 6],
    ],
    bakery: [
      ['Single', 1, 1],
      ['Box of 4', 3.7, 2],
      ['Box of 6', 5.4, 3],
      ['Party Box of 12', 10.2, 6],
    ],
    combos: [
      ['Mini', 0.75, 1],
      ['Regular', 1, 2],
      ['Large', 1.55, 4],
      ['Family', 2.2, 6],
      ['Corporate', 3.4, 10],
    ],
  };

  const FESTIVAL_TAGS = ['festival', 'diwali', 'holi', 'rakhi', 'ganesh', 'gifting'];

  /** Prices always end in 9 or 5 — looks like a real shop board. */
  function prettyPrice(value) {
    const v = Math.round(value);
    if (v < 100) return Math.max(15, Math.round(v / 5) * 5);
    const base = Math.round(v / 10) * 10;
    return base - 1;
  }

  function buildMenu() {
    const menu = [];
    let n = 0;

    for (const category of CATEGORIES) {
      const bases = BASE_ITEMS[category.id];
      const variants = VARIANTS[category.id];

      bases.forEach((base, baseIndex) => {
        const [name, imageKey, basePrice, isVeg, description, tags] = base;

        variants.forEach(([variantLabel, priceMul, servesMul]) => {
          n += 1;
          const id = `M${String(n).padStart(4, '0')}`;
          const price = prettyPrice(basePrice * priceMul * (0.95 + rnd() * 0.12));
          const isFestivalSpecial =
            tags.some((t) => FESTIVAL_TAGS.includes(t)) || category.id === 'combos';

          // A believable stock picture: a few items are genuinely sold out.
          const soldOut = chance(0.07);
          const inventoryCount = soldOut ? 0 : weightedPick([
            [int(1, 5), 12],    // "Only N left"
            [int(6, 20), 46],
            [int(21, 60), 42],
          ]);

          const popularityScore = Math.min(
            100,
            Math.round(
              (tags.includes('bestseller') ? 72 : 38) +
              rnd() * 26 +
              (variantLabel === 'Regular' || variantLabel === 'Single' ? 8 : 0) -
              baseIndex * 0.4
            )
          );

          menu.push({
            id,
            name: `${name} — ${variantLabel}`,
            baseName: name,
            variant: variantLabel,
            category: category.id,
            categoryName: category.name,
            price,
            mrp: prettyPrice(price * (1 + (chance(0.35) ? 0.12 + rnd() * 0.1 : 0))),
            description,
            imageUrl: `assets/images/${imageKey}.svg`,
            imageKey,
            isVeg,
            rating: round2(3.6 + rnd() * 1.3),
            ratingCount: int(24, 980),
            popularityScore,
            available: !soldOut,
            inventoryCount,
            stockoutEvents: soldOut ? int(2, 9) : chance(0.22) ? int(1, 4) : 0,
            isFestivalSpecial,
            isBestseller: tags.includes('bestseller'),
            tags,
            serves: Math.max(1, Math.round(servesMul)),
            prepTimeMins: category.id === 'beverages' ? int(4, 9) : category.id === 'combos' ? int(15, 30) : int(8, 20),
            shelfLifeDays: category.id === 'namkeen' ? 30 : category.id === 'sweets' ? int(2, 7) : 1,
            calories: int(90, 620) * Math.max(1, Math.round(servesMul * 0.8)),
          });
        });
      });
    }

    return menu;
  }

  /* =================================================================== */
  /* 6. Customers                                                        */
  /* =================================================================== */

  const FIRST_NAMES = [
    'Aarav', 'Aditya', 'Ananya', 'Anjali', 'Ankit', 'Arjun', 'Bhavna', 'Chirag', 'Deepak', 'Divya',
    'Farhan', 'Gaurav', 'Harsh', 'Isha', 'Jatin', 'Kavya', 'Kunal', 'Lakshmi', 'Mahesh', 'Manisha',
    'Mohit', 'Neha', 'Nikhil', 'Nisha', 'Pallavi', 'Pankaj', 'Parth', 'Pooja', 'Prachi', 'Pranav',
    'Priya', 'Rahul', 'Rajesh', 'Rakesh', 'Ramesh', 'Rani', 'Riya', 'Rohit', 'Sagar', 'Sakshi',
    'Sandeep', 'Sanjay', 'Sarita', 'Saurabh', 'Shalini', 'Shivam', 'Shreya', 'Shubham', 'Simran', 'Snehal',
    'Sonal', 'Sudhir', 'Suman', 'Sunil', 'Swati', 'Tanvi', 'Tarun', 'Uday', 'Vaibhav', 'Varun',
    'Vidya', 'Vikas', 'Vinay', 'Vishal', 'Yash', 'Yogita', 'Zoya', 'Aakash', 'Bhumika', 'Chetan',
  ];

  const LAST_NAMES = [
    'Sharma', 'Verma', 'Patel', 'Joshi', 'Agrawal', 'Gupta', 'Yadav', 'Chouhan', 'Rathore', 'Malviya',
    'Jain', 'Mehta', 'Trivedi', 'Pandey', 'Mishra', 'Tiwari', 'Dubey', 'Solanki', 'Parmar', 'Nagar',
    'Bhargava', 'Kulkarni', 'Deshmukh', 'Iyer', 'Nair', 'Rao', 'Reddy', 'Saxena', 'Shukla', 'Thakur',
    'Chourasia', 'Bansal', 'Khandelwal', 'Maheshwari', 'Soni', 'Vyas', 'Purohit', 'Kothari', 'Sethi', 'Bhatia',
  ];

  const LOCALITIES = [
    'Vijay Nagar', 'Rajwada', 'New Palasia', 'Sudama Nagar', 'Bhawarkuan', 'Scheme No. 78',
    'Annapurna Road', 'MG Road', 'Geeta Bhawan', 'Nanda Nagar', 'Sapna Sangeeta', 'Khajrana',
    'LIG Colony', 'Silicon City', 'Mhow Naka', 'Saket Nagar', 'Tilak Nagar', 'Manik Bagh',
    'Rau Circle', 'Bengali Square',
  ];

  const HOSTELS = [
    'Aryabhatta Hostel — Block A', 'Ramanujan Hostel — Block C', 'Sarojini Girls Hostel',
    'Tagore Hostel — Block B', 'Kalam Hostel — Block D', 'Nalanda PG — Wing 2',
    'Shanti Boys Hostel', 'Vivekananda Hostel — Block E',
  ];

  const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.in', 'rediffmail.com', 'protonmail.com'];

  function buildUsers(count) {
    const users = [];
    const seenPhones = new Set();

    for (let i = 1; i <= count; i += 1) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const isStudent = chance(0.32);

      let phone;
      do {
        phone = `+91 ${pick(['70', '72', '73', '78', '80', '81', '88', '90', '91', '94', '95', '97', '98', '99'])}${int(100, 999)} ${int(10000, 99999)}`;
      } while (seenPhones.has(phone));
      seenPhones.add(phone);

      const createdAt = ANCHOR_MS - int(1, HISTORY_DAYS + 250) * DAY_MS - int(0, 86399) * 1000;
      const totalOrders = int(1, 42);

      users.push({
        id: `U${String(i).padStart(4, '0')}`,
        name: `${first} ${last}`,
        phone,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${int(1, 999)}@${pick(EMAIL_DOMAINS)}`,
        area: isStudent ? pick(HOSTELS) : pick(LOCALITIES),
        addressLine: isStudent
          ? `Room ${int(101, 420)}, ${pick(HOSTELS)}`
          : `${int(1, 480)}, ${pick(['Sector', 'Block', 'Lane'])} ${pick(['A', 'B', 'C', 'D', 'E'])}, ${pick(LOCALITIES)}`,
        city: 'Indore',
        state: 'Madhya Pradesh',
        pincode: String(452001 + int(0, 19)),
        customerType: isStudent ? 'student' : chance(0.12) ? 'corporate' : 'resident',
        loyaltyTier: totalOrders > 30 ? 'Platinum' : totalOrders > 15 ? 'Gold' : 'Silver',
        totalOrders,
        marketingOptIn: chance(0.62),
        createdAt: istIso(createdAt),
      });
    }

    return users;
  }

  /* =================================================================== */
  /* 7. Orders                                                           */
  /* =================================================================== */

  const PAYMENT_METHODS = [
    ['UPI', 52], ['COD', 20], ['Card', 14], ['Wallet', 9], ['NetBanking', 5],
  ];

  const CANCEL_REASONS = [
    'Customer unreachable', 'Item out of stock', 'Slot capacity exceeded',
    'Duplicate order', 'Address not serviceable',
  ];

  const NOTES = [
    'Please pack sweets separately.', 'Less sugar in chai.', 'Ring the bell twice.',
    'Gift wrap required.', 'Call on arrival, hostel gate closes at 10 PM.',
    'Need GST invoice.', 'Extra chutney please.', 'Deliver to reception desk.',
    'Jain — no onion garlic.', '',
  ];

  const PROMOS = [
    ['SWEET10', 0.10, 299, 100], ['FESTIVE20', 0.20, 799, 250], ['FIRSTBITE', 0.15, 199, 120],
    ['STUDENT50', 'flat50', 249, 50], ['CHAI25', 'flat25', 149, 25], ['BULK15', 0.15, 2999, 800],
  ];

  /** Hour-of-day demand curve for an Indian sweet shop. */
  const HOUR_WEIGHTS = [
    [8, 6], [9, 10], [10, 12], [11, 11], [12, 9], [13, 7], [14, 4], [15, 4],
    [16, 8], [17, 13], [18, 17], [19, 20], [20, 16], [21, 9],
  ];

  function buildOrderItems(menu, festivalDay) {
    const pool = festivalDay
      ? menu.filter((m) => m.isFestivalSpecial || chance(0.5))
      : menu;

    // Cheap counter items sell far more often than ₹2,000 hampers.
    const affordability = (price) =>
      price <= 100 ? 1.3 : price <= 250 ? 1.1 : price <= 500 ? 0.8 : price <= 1000 ? 0.45 : 0.22;

    const itemCount = weightedPick([[1, 30], [2, 33], [3, 22], [4, 10], [5, 5]]);
    const chosen = new Map();

    let guard = 0;
    while (chosen.size < itemCount && guard < 40) {
      guard += 1;
      // Popularity- and price-weighted pick: try a few candidates, keep the best.
      let best = null;
      let bestScore = -1;
      for (let t = 0; t < 3; t += 1) {
        const candidate = pool[Math.floor(rnd() * pool.length)];
        if (!candidate) continue;
        const score = candidate.popularityScore * affordability(candidate.price);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (!best || chosen.has(best.id)) continue;

      const qty = best.price > 600
        ? weightedPick([[1, 78], [2, 17], [3, 5]])
        : best.price > 200
          ? weightedPick([[1, 58], [2, 27], [3, 10], [4, 5]])
          : weightedPick([[1, 42], [2, 27], [3, 14], [4, 9], [6, 6], [10, 2]]);

      chosen.set(best.id, {
        menuItemId: best.id,
        name: best.name,
        category: best.category,
        qty,
        unitPrice: best.price,
      });
    }

    return [...chosen.values()].map((line) => ({
      ...line,
      lineTotal: round2(line.qty * line.unitPrice),
    }));
  }

  function applyPromo(subtotal, festivalDay) {
    if (!chance(festivalDay ? 0.42 : 0.26)) return { code: null, discount: 0 };
    const eligible = PROMOS.filter(([, , minValue]) => subtotal >= minValue);
    if (!eligible.length) return { code: null, discount: 0 };

    const [code, rule, , cap] = pick(eligible);
    let discount;
    if (rule === 'flat50') discount = 50;
    else if (rule === 'flat25') discount = 25;
    else discount = Math.min(cap, subtotal * rule);

    return { code, discount: round2(discount) };
  }

  function buildOrders(users, menu, historyCount, upcomingCount) {
    const orders = [];
    const menuById = new Map(menu.map((m) => [m.id, m]));

    /* ---- 7a. Day sampling weights ------------------------------------ */
    const days = [];
    for (let i = HISTORY_DAYS; i >= 0; i -= 1) {
      const dayMs = ANCHOR_MS - i * DAY_MS;
      const dow = istDay(dayMs);
      const weekend = dow === 0 || dow === 6 ? 1.55 : 1;
      // Gentle growth over the year - the shop is getting more popular.
      const growth = 0.75 + ((HISTORY_DAYS - i) / HISTORY_DAYS) * 0.7;
      days.push([dayMs, weekend * growth * festivalBoost(dayMs)]);
    }

    const emit = (createdMs, opts = {}) => {
      const seq = orders.length + 1;
      const dayKey = istDateKey(createdMs);
      const festivalDay = opts.festival ?? isFestivalWindow(createdMs);

      const user = users[Math.floor(rnd() * users.length)];
      const items = buildOrderItems(menu, festivalDay);
      if (!items.length) return;

      const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
      const { code, discount } = applyPromo(subtotal, festivalDay);
      const deliveryType = opts.deliveryType || weightedPick([['delivery', 55], ['pickup', 45]]);
      const deliveryFee = deliveryType === 'delivery' ? (subtotal > 499 ? 0 : 29) : 0;
      const packagingFee = items.length > 2 || festivalDay ? 15 : 8;
      const taxable = Math.max(0, subtotal - discount);
      const tax = round2(taxable * 0.05);
      const total = round2(taxable + tax + deliveryFee + packagingFee);

      /* ---- Preorder slot ------------------------------------------- */
      const wantsSlot = opts.forceSlot || chance(festivalDay ? 0.85 : 0.45);
      let preorderDate = null;
      let timeSlotId = null;
      if (wantsSlot) {
        preorderDate = opts.preorderDate || dayKey;
        timeSlotId = opts.timeSlotId || weightedPick(
          TIME_SLOTS.map((s) => [s.id, s.capacity])
        );
      }

      /* ---- Timing & status ----------------------------------------- */
      const prepMins = items.reduce((s, i) => s + (menuById.get(i.menuItemId)?.prepTimeMins || 10), 0);
      const promiseMins = Math.min(90, 12 + prepMins * 0.6) + (deliveryType === 'delivery' ? 18 : 0);
      const promisedMs = createdMs + promiseMins * 60000;

      const ageMs = ANCHOR_MS - createdMs;
      const isFuture = createdMs > ANCHOR_MS || (opts.upcoming === true);

      let status;
      if (isFuture) {
        status = weightedPick([['Placed', 46], ['Confirmed', 40], ['Preparing', 14]]);
      } else if (ageMs < 25 * 60000) {
        status = weightedPick([['Placed', 40], ['Confirmed', 34], ['Preparing', 26]]);
      } else if (ageMs < 70 * 60000) {
        status = weightedPick([['Preparing', 34], ['Ready', 30], ['Out for Delivery', 22], ['Delivered', 14]]);
      } else {
        status = weightedPick([['Delivered', 92], ['Cancelled', 6], ['Ready', 2]]);
      }

      const flow = deliveryType === 'delivery'
        ? ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered']
        : ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Delivered'];

      // Festival rush = more late orders.
      const lateProbability = festivalDay ? 0.28 : 0.11;
      const runsLate = chance(lateProbability);
      const spread = (promiseMins * (runsLate ? 1.15 + rnd() * 0.6 : 0.55 + rnd() * 0.4)) * 60000;

      const statusHistory = [];
      let completedMs = null;

      if (status === 'Cancelled') {
        statusHistory.push({ status: 'Placed', at: istIso(createdMs) });
        const cancelledAt = createdMs + int(3, 30) * 60000;
        statusHistory.push({ status: 'Cancelled', at: istIso(cancelledAt) });
        completedMs = cancelledAt;
      } else {
        const reachedIndex = flow.indexOf(status);
        for (let s = 0; s <= reachedIndex; s += 1) {
          const at = createdMs + (spread * s) / Math.max(1, flow.length - 1);
          statusHistory.push({ status: flow[s], at: istIso(at) });
        }
        if (status === 'Delivered') completedMs = createdMs + spread;
      }

      const updatedMs = statusHistory.length
        ? Date.parse(statusHistory[statusHistory.length - 1].at)
        : createdMs;

      orders.push({
        id: `ORD-${dayKey.replace(/-/g, '')}-${String(seq).padStart(5, '0')}`,
        userId: user.id,
        customerName: user.name,
        phone: user.phone,
        items,
        itemCount: items.reduce((s, i) => s + i.qty, 0),
        subtotal,
        discount,
        promoCode: code,
        packagingFee,
        deliveryFee,
        tax,
        total,
        paymentMethod: weightedPick(PAYMENT_METHODS),
        paymentStatus: status === 'Cancelled' ? 'Refunded' : 'Paid',
        status,
        statusHistory,
        channel: weightedPick([['web', 62], ['app', 24], ['walk-in', 14]]),
        deliveryType,
        address: deliveryType === 'delivery' ? user.addressLine : 'Store pickup — Rajwada Main Branch',
        area: user.area,
        notes: pick(NOTES),
        preorderDate,
        timeSlotId,
        isFestivalOrder: festivalDay,
        festivalName: festivalDay
          ? (FESTIVAL_MS.find((f) => Math.abs(f.ms - createdMs) < 3.5 * DAY_MS) || {}).name || null
          : null,
        cancelReason: status === 'Cancelled' ? pick(CANCEL_REASONS) : null,
        promisedAt: istIso(promisedMs),
        completedAt: completedMs ? istIso(completedMs) : null,
        onTime: completedMs && status === 'Delivered' ? completedMs <= promisedMs : null,
        rating: status === 'Delivered' && chance(0.55) ? int(3, 5) : null,
        createdAt: istIso(createdMs),
        updatedAt: istIso(updatedMs),
      });
    };

    /* ---- 7b. Historical orders --------------------------------------- */
    const totalWeight = days.reduce((s, d) => s + d[1], 0);
    for (let i = 0; i < historyCount; i += 1) {
      let r = rnd() * totalWeight;
      let dayMs = days[days.length - 1][0];
      for (const [ms, w] of days) {
        r -= w;
        if (r <= 0) { dayMs = ms; break; }
      }
      const hour = weightedPick(HOUR_WEIGHTS);
      const createdMs = Math.min(
        ANCHOR_MS,
        istMs(...istDateKey(dayMs).split('-').map(Number), hour, int(0, 59), int(0, 59))
      );
      emit(createdMs);
    }

    /* ---- 7c. Upcoming preorders (drives the slot-capacity demo) ------- */
    // Concentrated on the next three days so a few slots are genuinely full.
    const upcomingPlan = [];
    for (let d = 0; d < 7; d += 1) {
      const weight = [30, 26, 18, 10, 7, 5, 4][d];
      upcomingPlan.push([d, weight]);
    }

    // Deliberately saturate two marquee slots on day+1 and day+2.
    const saturate = [
      { dayOffset: 1, slotId: 'SLOT-1900' },
      { dayOffset: 2, slotId: 'SLOT-1800' },
    ];
    saturate.forEach(({ dayOffset, slotId }) => {
      const slot = TIME_SLOTS.find((s) => s.id === slotId);
      const dateKey = istDateKey(ANCHOR_MS + dayOffset * DAY_MS);
      const cap = slot.capacity * (isFestivalWindow(ANCHOR_MS + dayOffset * DAY_MS) ? FESTIVAL_CAPACITY_MULTIPLIER : 1);
      for (let i = 0; i < cap; i += 1) {
        // Preorders trickle in over the preceding days, not all at once.
        emit(ANCHOR_MS - int(30, 9 * 1440) * 60000, {
          upcoming: true,
          forceSlot: true,
          preorderDate: dateKey,
          timeSlotId: slotId,
          festival: true,
        });
      }
    });

    const remaining = Math.max(0, upcomingCount - orders.length + historyCount);
    for (let i = 0; i < remaining; i += 1) {
      const dayOffset = weightedPick(upcomingPlan);
      const dateKey = istDateKey(ANCHOR_MS + dayOffset * DAY_MS);
      emit(ANCHOR_MS - int(30, 11 * 1440) * 60000, {
        upcoming: true,
        forceSlot: true,
        preorderDate: dateKey,
        festival: chance(0.6),
      });
    }

    orders.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return orders;
  }

  /* =================================================================== */
  /* 8. Public API                                                       */
  /* =================================================================== */

  function generate(options = {}) {
    const userCount = options.userCount || 420;
    const historyCount = options.historyCount || 900;
    const upcomingCount = options.upcomingCount || 160;

    const users = buildUsers(userCount);
    const menu = buildMenu();
    const orders = buildOrders(users, menu, historyCount, upcomingCount);

    return { users, menu, orders };
  }

  function validate({ users, menu, orders }) {
    const userIds = new Set(users.map((u) => u.id));
    const menuIds = new Set(menu.map((m) => m.id));
    const slotIds = new Set(TIME_SLOTS.map((s) => s.id));
    const problems = [];

    orders.forEach((o) => {
      if (!userIds.has(o.userId)) problems.push(`${o.id}: unknown userId ${o.userId}`);
      if (o.timeSlotId && !slotIds.has(o.timeSlotId)) problems.push(`${o.id}: unknown slot ${o.timeSlotId}`);
      o.items.forEach((i) => {
        if (!menuIds.has(i.menuItemId)) problems.push(`${o.id}: unknown menuItemId ${i.menuItemId}`);
      });
    });

    return problems;
  }

  function writeToDisk() {
    const fs = require('fs');
    const path = require('path');
    const outDir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(outDir, { recursive: true });

    const data = generate();
    const problems = validate(data);
    if (problems.length) {
      console.error('✖ Referential integrity failed:', problems.slice(0, 10));
      process.exitCode = 1;
      return;
    }

    // Written compactly: these files are fetched by the browser on every load.
    fs.writeFileSync(path.join(outDir, 'users.json'), JSON.stringify(data.users), 'utf8');
    fs.writeFileSync(path.join(outDir, 'menu.json'), JSON.stringify(data.menu), 'utf8');
    fs.writeFileSync(path.join(outDir, 'orders.json'), JSON.stringify(data.orders), 'utf8');

    const revenue = data.orders
      .filter((o) => o.status !== 'Cancelled')
      .reduce((s, o) => s + o.total, 0);

    console.log('✔ data/users.json  ', data.users.length, 'customers');
    console.log('✔ data/menu.json   ', data.menu.length, 'menu items');
    console.log('✔ data/orders.json ', data.orders.length, 'orders');
    console.log('  simulated revenue ₹' + Math.round(revenue).toLocaleString('en-IN'));
    console.log('  referential integrity: OK');
  }

  /** Browser helper — downloads the three JSON files. */
  function downloadAll() {
    const data = generate();
    Object.entries(data).forEach(([name, payload]) => {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    return { users: data.users.length, menu: data.menu.length, orders: data.orders.length };
  }

  return { generate, validate, writeToDisk, downloadAll, TIME_SLOTS, FESTIVALS, CATEGORIES };
});
