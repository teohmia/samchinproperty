#!/usr/bin/env node
// Regenerates the static fallback content in the HTML files from data/listings.json.
// Run this (`node build.js` from inside the site folder) any time you edit
// data/listings.json directly, so the fallback content stays in sync. Not required for
// the live/hosted site to work (JavaScript reads listings.json directly at runtime) —
// this only keeps two things fresh for people who open the HTML files directly via
// file:// (double-click) instead of through a real web server:
//   1. Real listing cards baked into index.html (#featured-grid) and for-sale.html
//      (#listing-grid), so search engines and file:// previews see real content
//      immediately instead of "Loading...".
//   2. A hidden inline copy of the full listings.json data (as a <script
//      type="application/json"> tag) in every page that needs listings, so the
//      filters, for-rent.html, and listing.html?id=... detail pages also work
//      when just double-clicked — not only the two pages with baked-in cards.
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = __dirname;

// ---- Pure render helpers (mirrors of the same functions in js/main.js) ----
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const IMG_ONERROR = "this.closest('.listing-photo, .listing-photo-lg').classList.add('placeholder'); this.remove();";
// `images` entries can be a plain path string or an { src, alt } object — same helpers as
// js/main.js's imgSrc/imgAlt, kept in sync here since this file runs standalone in Node.
function imgSrc(img) { return typeof img === 'string' ? img : ((img && img.src) || ''); }
function imgAlt(img, fallback) {
  var alt = typeof img === 'string' ? '' : (img && img.alt);
  return alt || fallback || '';
}
function listingFacts(l) {
  var parts = [];
  if (l.beds) parts.push(l.beds + ' bed');
  if (l.baths) parts.push(l.baths + ' bath');
  if (l.sqft) parts.push(l.sqft.toLocaleString() + ' sqft');
  return parts.join(' &middot; ');
}
function listingCardHTML(l) {
  var photo = (l.images && l.images[0])
    ? '<img src="' + escapeHtml(imgSrc(l.images[0])) + '" alt="' + escapeHtml(imgAlt(l.images[0], l.title)) + '" loading="lazy" onerror="' + IMG_ONERROR + '">'
    : '';
  return (
    '<a class="listing-card" href="listing.html?id=' + encodeURIComponent(l.id) + '">' +
      '<div class="listing-photo' + (photo ? '' : ' placeholder') + '">' +
        photo +
        '<span class="photo-fallback">[ PHOTO ]</span>' +
        '<span class="listing-tag">' + (l.type === 'rent' ? 'For Rent' : 'For Sale') + '</span>' +
      '</div>' +
      '<div class="listing-body">' +
        '<div class="listing-price">' + escapeHtml(l.price) + escapeHtml(l.priceSuffix || '') + '</div>' +
        '<div class="listing-title">' + escapeHtml(l.title) + '</div>' +
        '<div class="listing-address">' + escapeHtml(l.district) + '</div>' +
        '<div class="listing-facts">' + listingFacts(l) + '</div>' +
      '</div>' +
    '</a>'
  );
}

// ---- Load data ----
const listings = JSON.parse(fs.readFileSync(path.join(SITE, 'data/listings.json'), 'utf8'));
const saleCards = listings.filter(l => l.type === 'sale').map(listingCardHTML).join('\n    ');
const rentCards = listings.filter(l => l.type === 'rent').map(listingCardHTML).join('\n    ');
const featuredCards = listings.filter(l => l.featured).slice(0, 3).map(listingCardHTML).join('\n    ');

// Inline data blob: same JSON, embedded as a script tag every listings-dependent page
// can fall back to when a live fetch() fails (see fetchListings() in js/main.js).
// Escaping "</" prevents the literal string from ever being misread as closing the tag.
const inlineJson = JSON.stringify(listings).replace(/<\//g, '<\\/');
const inlineBlock =
  '<script type="application/json" id="listings-inline-data">' + inlineJson + '</script>';

function replaceBetweenMarkers(content, startMarker, endMarker, replacement) {
  const re = new RegExp(startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!re.test(content)) return null;
  return content.replace(re, startMarker + '\n' + replacement + '\n' + endMarker);
}

function injectInlineData(file) {
  const fp = path.join(SITE, file);
  let content = fs.readFileSync(fp, 'utf8');
  const startMarker = '<!-- BUILD:INLINE-DATA:START -->';
  const endMarker = '<!-- BUILD:INLINE-DATA:END -->';
  let updated = replaceBetweenMarkers(content, startMarker, endMarker, inlineBlock);
  if (updated === null) {
    // First run on this file: insert markers + block right before the main.js script tag.
    const anchor = '<script src="js/main.js"></script>';
    if (!content.includes(anchor)) { console.warn('  ! anchor not found in', file, '- skipped'); return; }
    updated = content.replace(anchor, startMarker + '\n' + inlineBlock + '\n' + endMarker + '\n' + anchor);
  }
  fs.writeFileSync(fp, updated);
  console.log('  inline data ->', file);
}

function injectGrid(file, gridId, cardsHtml) {
  const fp = path.join(SITE, file);
  let content = fs.readFileSync(fp, 'utf8');
  // Closing indentation is left flexible (\s* rather than a fixed 2 spaces) since the
  // grid may be nested at different depths across pages (e.g. inside .listing-with-map).
  const re = new RegExp('(<div class="listing-grid" id="' + gridId + '">\\n)[\\s\\S]*?(\\n\\s*</div>)');
  if (!re.test(content)) { console.warn('  ! grid anchor not found in', file, '- skipped'); return; }
  content = content.replace(re, (m, open, close) => open + '    ' + cardsHtml + close);
  fs.writeFileSync(fp, content);
  console.log('  grid cards  ->', file, '(#' + gridId + ')');
}

console.log('Building static fallbacks from data/listings.json (' + listings.length + ' listings)...');
injectGrid('for-sale.html', 'listing-grid', saleCards || '<div class="empty-state"><p>No listings for sale on the site right now — check back soon.</p></div>');
injectGrid('for-rent.html', 'listing-grid', rentCards || '<div class="empty-state"><p>No listings for rent on the site right now — check back soon.</p></div>');
injectGrid('index.html', 'featured-grid', featuredCards || '<div class="empty-state"><p>No featured listings right now — check back soon.</p></div>');
['index.html', 'for-sale.html', 'for-rent.html', 'listing.html'].forEach(injectInlineData);
console.log('Done.');
