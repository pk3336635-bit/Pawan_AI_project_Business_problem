/**
 * checkDeploy.js — pre-flight check for static hosting (GitHub Pages).
 *
 * GitHub Pages serves from a case-sensitive Linux filesystem, while Windows and
 * macOS are usually case-insensitive. A path like `./Utils/Format.js` therefore
 * works locally and 404s in production. This script catches that, plus a few
 * other things that only bite once the site is live.
 *
 * Run with:  node scripts/checkDeploy.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const problems = [];
const notes = [];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function walk(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const rel = (file) => path.relative(ROOT, file).replace(/\\/g, '/');

/** Exists **with exactly this casing** — the check Windows will not do for you. */
function existsExact(target) {
  const parts = path.relative(ROOT, target).split(path.sep);
  let current = ROOT;
  for (const part of parts) {
    if (!part || part === '.') continue;
    let entries;
    try {
      entries = fs.readdirSync(current);
    } catch {
      return false;
    }
    if (!entries.includes(part)) return false;
    current = path.join(current, part);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 1. ES module imports                                                */
/* ------------------------------------------------------------------ */

const jsFiles = walk(path.join(ROOT, 'js'), (f) => f.endsWith('.js'));
const IMPORT_RE = /(?:^|\s)(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

jsFiles.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = IMPORT_RE.exec(source))) {
    const specifier = match[1] || match[2];
    if (!specifier || !specifier.startsWith('.')) continue;

    const resolved = path.resolve(path.dirname(file), specifier);
    if (!existsExact(resolved)) {
      problems.push(`${rel(file)} imports "${specifier}" — no file with that exact name/case`);
    }
    if (!specifier.endsWith('.js')) {
      problems.push(`${rel(file)} imports "${specifier}" without a .js extension (browsers do not guess)`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2. new URL(..., import.meta.url) targets                            */
/* ------------------------------------------------------------------ */

const META_URL_RE = /new URL\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*import\.meta\.url\s*\)/g;

jsFiles.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = META_URL_RE.exec(source))) {
    const target = match[1];
    if (target.includes('${')) continue; // templated (e.g. ../data/${file})
    const resolved = path.resolve(path.dirname(file), target);
    if (!existsExact(resolved)) {
      problems.push(`${rel(file)} resolves "${target}" against import.meta.url — file missing`);
    }
  }
});

// data/*.json is loaded through a template literal, so check it explicitly.
['users.json', 'menu.json', 'orders.json', 'offers.json'].forEach((file) => {
  if (!existsExact(path.join(ROOT, 'data', file))) problems.push(`data/${file} is missing`);
});

/* ------------------------------------------------------------------ */
/* 3. Asset references inside HTML, CSS and JS                         */
/* ------------------------------------------------------------------ */

const assetFiles = [
  path.join(ROOT, 'index.html'),
  ...walk(path.join(ROOT, 'css'), (f) => f.endsWith('.css')),
  ...jsFiles,
];

const ASSET_RE = /['"(](assets\/[A-Za-z0-9._\-/]+)['")]/g;
const seenAssets = new Set();

assetFiles.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = ASSET_RE.exec(source))) {
    const target = match[1];
    if (seenAssets.has(target)) continue;
    seenAssets.add(target);
    if (!existsExact(path.join(ROOT, target))) {
      problems.push(`${rel(file)} references "${target}" — missing or wrong case`);
    }
  }
});

// Every image the menu data points at must exist.
const menu = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'menu.json'), 'utf8'));
const missingMenuImages = new Set();
menu.forEach((item) => {
  if (!existsExact(path.join(ROOT, item.imageUrl))) missingMenuImages.add(item.imageUrl);
});
missingMenuImages.forEach((img) => problems.push(`data/menu.json references "${img}" — missing or wrong case`));

const offers = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'offers.json'), 'utf8'));
offers.banners.forEach((banner) => {
  const img = `assets/images/${banner.imageKey}.svg`;
  if (!existsExact(path.join(ROOT, img))) problems.push(`data/offers.json banner "${banner.id}" -> "${img}" missing`);
});

/* ------------------------------------------------------------------ */
/* 4. Absolute paths — these break on a project subpath                */
/* ------------------------------------------------------------------ */

const ABSOLUTE_RE = /(?:src|href)\s*=\s*["'](\/[^"'/][^"']*)["']/g;

[path.join(ROOT, 'index.html'), ...jsFiles].forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = ABSOLUTE_RE.exec(source))) {
    problems.push(`${rel(file)} uses the root-absolute path "${match[1]}" — breaks under /repo-name/`);
  }
});

/* ------------------------------------------------------------------ */
/* 5. Hosting requirements                                             */
/* ------------------------------------------------------------------ */

if (!existsExact(path.join(ROOT, '.nojekyll'))) {
  problems.push('.nojekyll is missing — Jekyll may skip folders on GitHub Pages');
}
if (!existsExact(path.join(ROOT, 'index.html'))) {
  problems.push('index.html is missing from the repository root');
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!/<script[^>]+type=["']module["']/.test(html)) {
  problems.push('index.html does not load js/app.js as type="module"');
}

// Anything over 100 MB is rejected by GitHub.
walk(ROOT, () => true).forEach((file) => {
  const mb = fs.statSync(file).size / (1024 * 1024);
  if (mb > 100) problems.push(`${rel(file)} is ${mb.toFixed(1)} MB — over GitHub's 100 MB file limit`);
  else if (mb > 1) notes.push(`${rel(file)} is ${mb.toFixed(2)} MB (fine, and gzipped in transit)`);
});

// Secure-context APIs. GitHub Pages is always HTTPS, so these are safe there.
const usesSubtle = jsFiles.some((f) => fs.readFileSync(f, 'utf8').includes('crypto.subtle'));
if (usesSubtle) {
  notes.push('crypto.subtle is used (password hashing) — needs https:// or http://localhost. GitHub Pages is https, so this is fine.');
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

console.log(`\nChecked ${jsFiles.length} JS modules, ${seenAssets.size} asset references and ${menu.length} menu images.\n`);

if (notes.length) {
  console.log('Notes:');
  notes.forEach((note) => console.log('  •', note));
  console.log('');
}

if (problems.length) {
  console.error(`✖ ${problems.length} problem(s) would break on GitHub Pages:\n`);
  problems.forEach((problem) => console.error('  -', problem));
  process.exitCode = 1;
} else {
  console.log('✔ Ready for GitHub Pages — every path resolves with exact casing,');
  console.log('  no root-absolute URLs, .nojekyll present, no oversized files.');
}
