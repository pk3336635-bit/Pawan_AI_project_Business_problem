/**
 * generateImages.js
 * ---------------------------------------------------------------------------
 * Builds the local, royalty-free food illustrations used by the menu cards.
 *
 * Why generated SVG instead of downloaded photos?
 *  - The site must run 100% offline / on GitHub Pages with no external calls.
 *  - SVG stays crisp on every screen, weighs ~2 KB and never breaks a layout.
 *
 * Run with:  node scripts/generateImages.js
 * Output:    assets/images/*.svg  +  assets/images/fallback.svg
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'images');

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const rad = (deg) => (deg * Math.PI) / 180;

function shade(hex, amount) {
  // amount > 0 lightens, amount < 0 darkens
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + 255 * amount);
  const g = clamp(((n >> 8) & 255) + 255 * amount);
  const b = clamp((n & 255) + 255 * amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/* ------------------------------------------------------------------ */
/* Shape templates - each returns the "food" group markup              */
/* ------------------------------------------------------------------ */

const TEMPLATES = {
  /** Round sweets: laddu, gulab jamun, rasgulla, peda ... */
  balls({ main }) {
    const positions = [
      [400, 330, 96],
      [268, 372, 78],
      [532, 372, 78],
      [334, 262, 62],
      [466, 262, 62],
    ];
    return positions
      .map(
        ([cx, cy, r]) => `
      <g>
        <ellipse cx="${cx}" cy="${cy + r * 0.82}" rx="${r * 0.92}" ry="${r * 0.22}" fill="#000" opacity=".13"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#foodGrad)"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${shade(main, -0.12)}" stroke-width="3" opacity=".55"/>
        <ellipse cx="${cx - r * 0.3}" cy="${cy - r * 0.36}" rx="${r * 0.3}" ry="${r * 0.2}" fill="#fff" opacity=".33" transform="rotate(-24 ${cx - r * 0.3} ${cy - r * 0.36})"/>
      </g>`
      )
      .join('');
  },

  /** Diamond mithai: kaju katli, barfi, kalakand ... */
  diamond({ main, accent }) {
    const piece = (cx, cy, s, rot) => `
      <g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
        <path d="M0 -58 L96 0 L0 58 L-96 0 Z" fill="#000" opacity=".12" transform="translate(0 16)"/>
        <path d="M0 -58 L96 0 L0 58 L-96 0 Z" fill="url(#foodGrad)"/>
        <path d="M0 -58 L96 0 L0 58 L-96 0 Z" fill="none" stroke="${shade(main, -0.16)}" stroke-width="3"/>
        <path d="M0 -40 L66 0 L0 40 L-66 0 Z" fill="${accent}" opacity=".35"/>
      </g>`;
    return `
      ${piece(300, 372, 1, -6)}
      ${piece(508, 356, 0.95, 5)}
      ${piece(402, 268, 0.86, -2)}`;
  },

  /** Coiled sweets: jalebi, imarti */
  spiral({ main, accent }) {
    const coil = (cx, cy, s) => {
      let d = '';
      const turns = 2.6;
      for (let a = 0; a <= 360 * turns; a += 6) {
        const r = 18 + (a / (360 * turns)) * 76;
        const x = cx + Math.cos(rad(a)) * r * s;
        const y = cy + Math.sin(rad(a)) * r * s * 0.92;
        d += `${a === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
      }
      return `
        <path d="${d}" fill="none" stroke="#000" opacity=".12" stroke-width="${24 * s}" stroke-linecap="round" transform="translate(0 14)"/>
        <path d="${d}" fill="none" stroke="url(#foodGrad)" stroke-width="${24 * s}" stroke-linecap="round"/>
        <path d="${d}" fill="none" stroke="${accent}" stroke-width="${7 * s}" stroke-linecap="round" opacity=".45"/>`;
    };
    return `${coil(330, 340, 1)}${coil(520, 372, 0.72)}`;
  },

  /** Triangular fried snacks: samosa, gujiya, sandwich */
  triangle({ main, accent }) {
    const piece = (cx, cy, s, rot) => `
      <g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
        <path d="M0 -92 L104 78 L-104 78 Z" fill="#000" opacity=".12" transform="translate(0 16)"/>
        <path d="M0 -92 L104 78 L-104 78 Z" fill="url(#foodGrad)" stroke="${shade(main, -0.18)}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M0 -70 L0 66" stroke="${accent}" stroke-width="6" opacity=".5" stroke-linecap="round"/>
        <path d="M-58 40 Q0 62 58 40" stroke="${shade(main, -0.2)}" stroke-width="5" fill="none" opacity=".5" stroke-linecap="round"/>
      </g>`;
    return `${piece(316, 356, 0.95, -8)}${piece(506, 366, 0.86, 9)}`;
  },

  /** Hot drinks in a cup: masala chai, filter coffee */
  cup({ main, accent }) {
    return `
      <g>
        <path d="M300 250 Q312 226 328 246" stroke="#fff" stroke-width="9" fill="none" opacity=".5" stroke-linecap="round"/>
        <path d="M370 232 Q384 202 400 228" stroke="#fff" stroke-width="9" fill="none" opacity=".45" stroke-linecap="round"/>
        <path d="M440 250 Q454 224 470 244" stroke="#fff" stroke-width="9" fill="none" opacity=".4" stroke-linecap="round"/>
        <ellipse cx="386" cy="472" rx="164" ry="30" fill="#000" opacity=".14"/>
        <path d="M262 300 L510 300 L482 452 Q478 476 452 476 L320 476 Q294 476 290 452 Z" fill="#ffffff"/>
        <path d="M272 316 L500 316 L476 444 Q473 462 454 462 L318 462 Q299 462 296 444 Z" fill="url(#foodGrad)"/>
        <ellipse cx="386" cy="316" rx="114" ry="26" fill="${shade(main, 0.18)}"/>
        <ellipse cx="386" cy="316" rx="92" ry="19" fill="${accent}" opacity=".6"/>
        <path d="M512 330 Q580 336 574 384 Q568 428 506 424" stroke="#ffffff" stroke-width="20" fill="none" stroke-linecap="round"/>
        <ellipse cx="386" cy="500" rx="150" ry="24" fill="#ffffff" opacity=".9"/>
      </g>`;
  },

  /** Cold drinks in a tall glass: lassi, shakes, cold coffee */
  glass({ main, accent }) {
    return `
      <g>
        <ellipse cx="400" cy="512" rx="130" ry="26" fill="#000" opacity=".14"/>
        <path d="M312 210 L488 210 L466 486 Q464 504 446 504 L354 504 Q336 504 334 486 Z" fill="#ffffff" opacity=".55"/>
        <path d="M322 246 L478 246 L458 478 Q457 492 442 492 L358 492 Q343 492 342 478 Z" fill="url(#foodGrad)"/>
        <ellipse cx="400" cy="246" rx="78" ry="18" fill="${shade(main, 0.24)}"/>
        <ellipse cx="400" cy="238" rx="62" ry="14" fill="#ffffff" opacity=".8"/>
        <circle cx="400" cy="226" r="16" fill="${accent}"/>
        <rect x="428" y="150" width="16" height="130" rx="8" fill="${accent}" transform="rotate(12 436 215)"/>
        <path d="M312 210 L488 210" stroke="#ffffff" stroke-width="8" opacity=".8" stroke-linecap="round"/>
        <path d="M348 300 L348 460" stroke="#ffffff" stroke-width="12" opacity=".35" stroke-linecap="round"/>
      </g>`;
  },

  /** Flat pieces served on a plate: dhokla, idli, kalakand slabs */
  plate({ main, accent }) {
    const piece = (x, y, w, h, rot) => `
      <g transform="translate(${x} ${y}) rotate(${rot})">
        <rect x="${-w / 2}" y="${-h / 2 + 12}" width="${w}" height="${h}" rx="12" fill="#000" opacity=".12"/>
        <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="12" fill="url(#foodGrad)" stroke="${shade(main, -0.16)}" stroke-width="3"/>
        <rect x="${-w / 2 + 10}" y="${-h / 2 + 9}" width="${w - 20}" height="10" rx="5" fill="${accent}" opacity=".45"/>
      </g>`;
    return `
      <ellipse cx="400" cy="386" rx="248" ry="128" fill="#ffffff" opacity=".92"/>
      <ellipse cx="400" cy="386" rx="212" ry="106" fill="${shade(main, 0.34)}" opacity=".45"/>
      ${piece(316, 350, 132, 96, -7)}
      ${piece(486, 366, 132, 96, 6)}
      ${piece(400, 430, 132, 96, 1)}`;
  },

  /** Bowl dishes: halwa, pav bhaji, kheer */
  bowl({ main, accent }) {
    return `
      <g>
        <ellipse cx="400" cy="492" rx="188" ry="30" fill="#000" opacity=".14"/>
        <path d="M212 320 L588 320 Q566 486 400 486 Q234 486 212 320 Z" fill="#ffffff"/>
        <path d="M232 336 L568 336 Q548 468 400 468 Q252 468 232 336 Z" fill="${shade(main, 0.3)}" opacity=".5"/>
        <ellipse cx="400" cy="322" rx="188" ry="46" fill="url(#foodGrad)"/>
        <ellipse cx="400" cy="316" rx="150" ry="34" fill="${shade(main, 0.12)}"/>
        <circle cx="356" cy="308" r="13" fill="${accent}"/>
        <circle cx="424" cy="318" r="11" fill="${accent}" opacity=".85"/>
        <circle cx="392" cy="330" r="9" fill="#ffffff" opacity=".6"/>
      </g>`;
  },

  /** Gift / sweet boxes and hampers */
  box({ main, accent }) {
    return `
      <g>
        <ellipse cx="400" cy="490" rx="200" ry="30" fill="#000" opacity=".14"/>
        <path d="M216 274 L584 274 L556 470 L244 470 Z" fill="url(#foodGrad)"/>
        <path d="M198 226 L602 226 L584 292 L216 292 Z" fill="${shade(main, 0.2)}" stroke="${shade(main, -0.14)}" stroke-width="3"/>
        <rect x="366" y="226" width="68" height="244" fill="${accent}" opacity=".9"/>
        <path d="M400 226 Q346 168 306 196 Q276 218 340 230 Z" fill="${accent}"/>
        <path d="M400 226 Q454 168 494 196 Q524 218 460 230 Z" fill="${shade(accent, -0.08)}"/>
        <circle cx="400" cy="226" r="20" fill="${shade(accent, 0.12)}"/>
        <path d="M244 470 L556 470" stroke="${shade(main, -0.2)}" stroke-width="4" opacity=".5"/>
      </g>`;
  },

  /** Cake / pastry slices */
  slice({ main, accent }) {
    return `
      <g>
        <ellipse cx="400" cy="486" rx="190" ry="28" fill="#000" opacity=".14"/>
        <path d="M250 460 L400 200 L550 460 Z" fill="url(#foodGrad)"/>
        <path d="M283 402 L400 200 L517 402 Z" fill="${accent}" opacity=".38"/>
        <path d="M250 460 L550 460 L540 486 L260 486 Z" fill="${shade(main, -0.14)}"/>
        <path d="M312 372 Q400 348 488 372" stroke="#ffffff" stroke-width="14" fill="none" opacity=".65" stroke-linecap="round"/>
        <circle cx="400" cy="214" r="20" fill="#e5484d"/>
        <path d="M400 196 Q412 176 428 180" stroke="#2f7d3a" stroke-width="7" fill="none" stroke-linecap="round"/>
      </g>`;
  },

  /** Cookies, biscuits, mathri, khakhra */
  cookie({ main, accent }) {
    const one = (cx, cy, r, rot) => `
      <g transform="translate(${cx} ${cy}) rotate(${rot})">
        <circle cx="0" cy="${r * 0.2}" r="${r}" fill="#000" opacity=".12"/>
        <circle cx="0" cy="0" r="${r}" fill="url(#foodGrad)" stroke="${shade(main, -0.18)}" stroke-width="3"/>
        <circle cx="${-r * 0.3}" cy="${-r * 0.24}" r="${r * 0.13}" fill="${accent}"/>
        <circle cx="${r * 0.32}" cy="${r * 0.05}" r="${r * 0.11}" fill="${accent}"/>
        <circle cx="${-r * 0.08}" cy="${r * 0.36}" r="${r * 0.1}" fill="${accent}"/>
      </g>`;
    return `${one(306, 366, 96, -6)}${one(486, 342, 86, 8)}${one(414, 448, 74, 3)}`;
  },

  /** Rolls / logs: cream roll, spring roll, murukku sticks */
  roll({ main, accent }) {
    const one = (cx, cy, rot) => `
      <g transform="translate(${cx} ${cy}) rotate(${rot})">
        <rect x="-128" y="-34" width="256" height="68" rx="34" fill="#000" opacity=".12" transform="translate(0 14)"/>
        <rect x="-128" y="-34" width="256" height="68" rx="34" fill="url(#foodGrad)" stroke="${shade(main, -0.18)}" stroke-width="3"/>
        <path d="M-84 -34 L-56 34 M-24 -34 L4 34 M36 -34 L64 34" stroke="${accent}" stroke-width="8" opacity=".5" stroke-linecap="round"/>
      </g>`;
    return `${one(392, 316, -10)}${one(408, 414, 7)}`;
  },

  /** Thali / combo plate with several compartments */
  thali({ main, accent }) {
    return `
      <g>
        <ellipse cx="400" cy="380" rx="262" ry="150" fill="#000" opacity=".12" transform="translate(0 16)"/>
        <ellipse cx="400" cy="380" rx="262" ry="150" fill="#ffffff"/>
        <ellipse cx="400" cy="380" rx="228" ry="126" fill="${shade(main, 0.34)}" opacity=".55"/>
        <circle cx="292" cy="336" r="58" fill="url(#foodGrad)"/>
        <circle cx="430" cy="316" r="50" fill="${accent}"/>
        <circle cx="522" cy="392" r="54" fill="${shade(main, -0.1)}"/>
        <circle cx="360" cy="440" r="46" fill="${shade(accent, 0.16)}"/>
        <ellipse cx="452" cy="424" rx="44" ry="28" fill="#ffffff" opacity=".85"/>
      </g>`;
  },
};

/* ------------------------------------------------------------------ */
/* Image catalogue: key -> { template, main, accent, bg }              */
/* ------------------------------------------------------------------ */

const IMAGES = {
  /* ---- Sweets / Mithai ---- */
  'gulab-jamun': ['balls', '#8a4b1e', '#c98b45', '#fff3e2'],
  'rasgulla': ['balls', '#f7f3ea', '#e8dcc4', '#eef6f3'],
  'laddu': ['balls', '#f0a32c', '#ffd27a', '#fff6e0'],
  'motichoor-laddu': ['balls', '#e8901c', '#ffc766', '#fff3dd'],
  'peda': ['balls', '#e9c98f', '#fbe6bd', '#fdf5e6'],
  'kaju-katli': ['diamond', '#f2e6c9', '#ffffff', '#fbf5e8'],
  'barfi': ['diamond', '#f6ead0', '#f2c15e', '#fdf6ea'],
  'kalakand': ['plate', '#f4e3c4', '#e0b878', '#fdf4e6'],
  'chocolate-barfi': ['diamond', '#6b3f22', '#a86b38', '#f6ece1'],
  'jalebi': ['spiral', '#f5a521', '#ffd57e', '#fff5e0'],
  'imarti': ['spiral', '#e2621f', '#ffab5e', '#fff0e2'],
  'rasmalai': ['bowl', '#f6e9c6', '#e7b85c', '#fdf7ec'],
  'halwa': ['bowl', '#c66a1e', '#f0a94d', '#fdf1e2'],
  'sandesh': ['plate', '#f8f1df', '#e6cf9e', '#fdf9f0'],
  'soan-papdi': ['plate', '#f3dfae', '#d7b56b', '#fdf6e6'],
  'gujiya': ['triangle', '#e9c184', '#f6e3bb', '#fdf5e7'],
  'malpua': ['plate', '#d98a2b', '#f5c072', '#fdf2e0'],
  'mysore-pak': ['diamond', '#e6a13f', '#f7cd82', '#fdf4e3'],
  'gajar-halwa': ['bowl', '#c8451f', '#ee8b52', '#fdeee6'],
  'kheer': ['bowl', '#f5efdd', '#e2cfa0', '#fbf8ef'],

  /* ---- Snacks & Savouries ---- */
  'samosa': ['triangle', '#e2ae62', '#8a5a22', '#fdf3e3'],
  'kachori': ['balls', '#dda355', '#b57a2e', '#fdf3e4'],
  'dhokla': ['plate', '#f2d64f', '#5aa74a', '#fdfae5'],
  'pav-bhaji': ['bowl', '#c93b1c', '#f0873f', '#fdeee7'],
  'vada-pav': ['balls', '#d99b45', '#8f5c22', '#fdf4e6'],
  'poha': ['plate', '#f6e08a', '#e0b03c', '#fefbe9'],
  'upma': ['bowl', '#efdfae', '#c9a45a', '#fdf9ec'],
  'chole-bhature': ['bowl', '#8a5726', '#d99a4a', '#fbf1e4'],
  'idli': ['plate', '#fbf8f0', '#e6dcc2', '#f4faf6'],
  'dosa': ['roll', '#e8c07a', '#b8802f', '#fdf5e8'],
  'sandwich': ['triangle', '#f6e5bd', '#6aa84f', '#fbf8ec'],
  'pakora': ['balls', '#dfa348', '#a46a24', '#fdf4e5'],
  'spring-roll': ['roll', '#e3b26a', '#a8712a', '#fdf5e9'],
  'bread-pakora': ['triangle', '#e6b45e', '#96601f', '#fdf4e6'],
  'aloo-tikki': ['balls', '#d99a3f', '#94601c', '#fdf3e2'],

  /* ---- Beverages ---- */
  'masala-chai': ['cup', '#b07b46', '#dcae76', '#fbf1e6'],
  'filter-coffee': ['cup', '#6f4527', '#a97a4d', '#f7eee6'],
  'lassi': ['glass', '#fbf6e6', '#f3c96a', '#f6fbf7'],
  'mango-lassi': ['glass', '#f6b93b', '#ffd97a', '#fff8e6'],
  'cold-coffee': ['glass', '#6d4630', '#c99a6d', '#f5efe9'],
  'badam-milk': ['glass', '#f7ead0', '#e0bd7c', '#fbf7ee'],
  'buttermilk': ['glass', '#f4f7ee', '#9ec27a', '#f4faf1'],
  'falooda': ['glass', '#e5548a', '#ffb3cd', '#fdeff4'],
  'mango-shake': ['glass', '#f0a318', '#ffd06a', '#fff6e3'],
  'nimbu-pani': ['glass', '#e7f2b8', '#a7c93c', '#f8fcec'],
  'thandai': ['glass', '#efe3c2', '#c9a45e', '#fbf6ea'],
  'green-tea': ['cup', '#8fb96a', '#c3dda2', '#f2f8ec'],
  'hot-chocolate': ['cup', '#5c3520', '#9a6b45', '#f6efe9'],

  /* ---- Namkeen & Farsan ---- */
  'bhujia': ['roll', '#eaa73c', '#c67a1f', '#fdf4e4'],
  'chivda': ['plate', '#eed99c', '#c9a04a', '#fdf8ea'],
  'mathri': ['cookie', '#eddcae', '#c2a05c', '#fdf7ea'],
  'sev': ['roll', '#f2b850', '#cf8a24', '#fdf5e6'],
  'namak-para': ['diamond', '#ecd9a8', '#c39c52', '#fdf7ea'],
  'khakhra': ['cookie', '#e2c185', '#a97c34', '#fdf5e8'],
  'murukku': ['spiral', '#e3b46b', '#b3812e', '#fdf5e7'],
  'chakli': ['spiral', '#dca85e', '#a97428', '#fdf4e5'],
  'peanut-masala': ['plate', '#e8b878', '#b8763a', '#fdf4e7'],

  /* ---- Bakery & Desserts ---- */
  'cake-slice': ['slice', '#f3ddb8', '#c96b8a', '#fdf3f0'],
  'pastry': ['slice', '#f6e2ce', '#7a4a2c', '#fbf2ec'],
  'cookies': ['cookie', '#dcae72', '#6b3f22', '#fdf5e9'],
  'brownie': ['diamond', '#4f2d1a', '#8c5a34', '#f5ece5'],
  'muffin': ['balls', '#b57a45', '#e4b177', '#fbf2e8'],
  'doughnut': ['balls', '#e88fb0', '#fff0f5', '#fdeff4'],
  'cream-roll': ['roll', '#efd7ab', '#fff8ec', '#fdf7ec'],
  'patties': ['plate', '#e3b877', '#a5713a', '#fdf4e8'],
  'ice-cream': ['glass', '#f8e9d9', '#e5a06a', '#fbf4ef'],

  /* ---- Combos & Specials ---- */
  'sweet-box': ['box', '#e2a13d', '#c9402f', '#fdf3e2'],
  'festival-pack': ['box', '#d4762a', '#f2b134', '#fdf0dd'],
  'gift-hamper': ['box', '#a8452f', '#e8a63b', '#fbeee6'],
  'snack-tea-combo': ['thali', '#e0b06a', '#c95a2c', '#fdf4e6'],
  'student-combo': ['thali', '#e8c076', '#5aa74a', '#fdf6e8'],
  'family-thali': ['thali', '#dfa94f', '#c8451f', '#fdf3e4'],
  'corporate-box': ['box', '#7a4a2c', '#e0a349', '#f8f1e8'],
  'diwali-special': ['box', '#c9402f', '#f5c542', '#fdefe2'],
  'rakhi-special': ['box', '#d1477d', '#f6c85f', '#fdeff4'],
  'holi-special': ['thali', '#d94f8c', '#5aa7c9', '#fdf0f5'],
  'ganesh-modak': ['balls', '#f3e2bc', '#e0a93f', '#fdf7e9'],
  'wedding-tray': ['thali', '#c9942f', '#8a2f2f', '#fbf3e4'],
};

/* ------------------------------------------------------------------ */
/* SVG assembly                                                        */
/* ------------------------------------------------------------------ */

function buildSvg(key, [templateName, main, accent, bg]) {
  const template = TEMPLATES[templateName];
  const food = template({ main, accent, bg });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 60 640 480" width="640" height="480" role="img" aria-label="${key.replace(/-/g, ' ')}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${shade(bg, 0.02)}"/>
      <stop offset="100%" stop-color="${shade(bg, -0.13)}"/>
    </linearGradient>
    <radialGradient id="foodGrad" cx="35%" cy="28%" r="78%">
      <stop offset="0%" stop-color="${shade(main, 0.18)}"/>
      <stop offset="60%" stop-color="${main}"/>
      <stop offset="100%" stop-color="${shade(main, -0.14)}"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="45%" r="72%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#3a2417" stop-opacity=".22"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="800" height="600" fill="url(#bgGrad)"/>
  <circle cx="128" cy="122" r="52" fill="#ffffff" opacity=".38"/>
  <circle cx="692" cy="162" r="30" fill="#ffffff" opacity=".3"/>
  <circle cx="648" cy="96" r="14" fill="${accent}" opacity=".38"/>
  <circle cx="124" cy="496" r="22" fill="${accent}" opacity=".3"/>
  <ellipse cx="400" cy="520" rx="330" ry="66" fill="${shade(bg, -0.22)}"/>
  ${food}
  <rect x="0" y="0" width="800" height="600" fill="url(#vignette)"/>
</svg>
`;
}

const FALLBACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" role="img" aria-label="Mahalaxmi Sweets">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff3e0"/><stop offset="100%" stop-color="#f6dfc0"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#f)"/>
  <circle cx="400" cy="272" r="120" fill="#f0a32c" opacity=".35"/>
  <circle cx="400" cy="272" r="78" fill="#e2621f" opacity=".55"/>
  <text x="400" y="452" text-anchor="middle" font-family="Poppins, Segoe UI, sans-serif" font-size="46" font-weight="700" fill="#4a2c18">Mahalaxmi Sweets</text>
  <text x="400" y="500" text-anchor="middle" font-family="Poppins, Segoe UI, sans-serif" font-size="26" fill="#8a6a52">Image unavailable</text>
</svg>
`;

/* ------------------------------------------------------------------ */
/* Write everything out                                                */
/* ------------------------------------------------------------------ */

function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let count = 0;
  for (const [key, config] of Object.entries(IMAGES)) {
    fs.writeFileSync(path.join(OUT_DIR, `${key}.svg`), buildSvg(key, config), 'utf8');
    count += 1;
  }
  fs.writeFileSync(path.join(OUT_DIR, 'fallback.svg'), FALLBACK, 'utf8');
  console.log(`✔ Generated ${count} food illustrations + fallback.svg in assets/images`);
}

if (require.main === module) run();

module.exports = { IMAGES, buildSvg };
