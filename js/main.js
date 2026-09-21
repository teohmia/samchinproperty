// Sam Chin — Real Estate Website
// Mobile nav toggle + service-area map (Leaflet + Esri's free basemap tiles, no API key
// or account required). Note: plain tile.openstreetmap.org is reserved for light, non-app
// traffic and actively blocks embedded/app usage like this (see osm.wiki/Blocked); CARTO's
// basemap tiles, used here previously, now require signing up for a free API key — Esri's
// classic REST tile services don't, so we use those instead.

document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
  }

  initTabs();
});

// Simple tab switching for pages with a .tabs bar + matching .tab-panel elements
// (data-tab on the button matches the id on the panel). Supports deep-linking via
// URL hash, e.g. guide.html#renting opens straight to that tab.
function initTabs() {
  var tabBar = document.querySelector('.tabs');
  if (!tabBar) return;

  var buttons = Array.prototype.slice.call(tabBar.querySelectorAll('.tab-btn'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.tab-panel'));

  function activate(key, updateHash) {
    buttons.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === key); });
    panels.forEach(function (p) { p.classList.toggle('active', p.id === key); });
    if (updateHash && history.replaceState) {
      history.replaceState(null, '', '#' + key);
    }
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () { activate(btn.dataset.tab, true); });
  });

  var initial = window.location.hash ? window.location.hash.slice(1) : null;
  var hasMatch = initial && buttons.some(function (b) { return b.dataset.tab === initial; });
  activate(hasMatch ? initial : buttons[0].dataset.tab, false);
}

// Sam's core service districts (approximate district centroids — for
// showing coverage areas, not individual listing pins, since live listing
// coordinates aren't available from PropertyGuru/Huttons).
var SERVICE_AREAS = [
  { name: 'District 2 — Tanjong Pagar / Anson', lat: 1.2762, lng: 103.8455 },
  { name: 'District 9 — Orchard / River Valley', lat: 1.3048, lng: 103.8318 },
  { name: 'District 10 — Holland / Bukit Timah', lat: 1.3151, lng: 103.8065 },
  { name: 'District 11 — Newton / Novena', lat: 1.3204, lng: 103.8390 },
  { name: 'District 21 — Upper Bukit Timah / Clementi Park', lat: 1.3410, lng: 103.7764 }
];

// Esri's classic REST tile services (server.arcgisonline.com) are free to use in a web map
// without an API key or account, unlike CARTO's basemap tiles (which started requiring a
// free API key). Two layers stacked to get a light basemap + place/street labels, similar
// look to what CARTO's "light_all" style gave us.
function addBasemapTileLayer(map) {
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, FAO, NOAA, USGS',
    maxZoom: 16
  }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16
  }).addTo(map);
}

// Fallback shown when no listing on the page has coordinates yet — plain district-level
// coverage pins rather than nothing.
function renderServiceAreaPins(map) {
  var goldIcon = L.divIcon({
    className: 'map-pin',
    html: '<div style="width:26px;height:26px;border-radius:999px;background:#0F1B33;border:2px solid #C6A15B;box-shadow:0 2px 6px rgba(15,27,51,0.35);"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
  SERVICE_AREAS.forEach(function (area) {
    L.marker([area.lat, area.lng], { icon: goldIcon }).addTo(map).bindPopup(area.name);
  });
}

// Legacy name kept in case anything still calls it directly — same as renderServiceAreaPins
// but sets up its own map/tiles first, for standalone use outside initListingMap.
function initServiceAreaMap(elementId) {
  var el = document.getElementById(elementId);
  if (!el || typeof L === 'undefined') return;
  var map = L.map(elementId, { scrollWheelZoom: false }).setView([1.31, 103.82], 12);
  addBasemapTileLayer(map);
  renderServiceAreaPins(map);
}

// Formats a listing's price compactly for a map pin badge, e.g. "$1.4M" for a sale or
// "$4.2K/mo" for a rental — the full price still shows in the popup and on the card.
function formatCompactPrice(l) {
  var n = parsePriceNumber(l);
  if (n === null) return l.price || '';
  var suffix = l.type === 'rent' ? '/mo' : '';
  if (n >= 1000000) {
    var rounded = Math.round(n / 100000) / 10; // one decimal place, e.g. 1.4, 3.3, 2
    var text = (rounded % 1 === 0) ? rounded.toFixed(0) : rounded.toFixed(1);
    return '$' + text + 'M' + suffix;
  }
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'K' + suffix;
  return '$' + n + suffix;
}

// Pinpoints each listing on the map at its actual address, with a price badge instead of
// a plain marker (matching the reference look) — click a pin for the listing name and a
// link straight to its detail page. Falls back to generic district-coverage pins (see
// renderServiceAreaPins) if no listing on this page has lat/lng yet.
function initListingMap(elementId, type) {
  var el = document.getElementById(elementId);
  if (!el || typeof L === 'undefined') return;

  var map = L.map(elementId, { scrollWheelZoom: false }).setView([1.31, 103.82], 12);
  addBasemapTileLayer(map);

  fetchListings().then(function (all) {
    var items = (all || []).filter(function (l) {
      return l.type === type && typeof l.lat === 'number' && typeof l.lng === 'number';
    });

    if (!items.length) { renderServiceAreaPins(map); return; }

    var markers = items.map(function (l) {
      var icon = L.divIcon({
        className: 'price-pin',
        html: '<div class="price-pin-badge">' + escapeHtml(formatCompactPrice(l)) + '</div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      var marker = L.marker([l.lat, l.lng], { icon: icon });
      marker.bindPopup(
        '<strong>' + escapeHtml(l.title) + '</strong><br>' +
        escapeHtml(l.price) + escapeHtml(l.priceSuffix || '') + '<br>' +
        '<a href="listing.html?id=' + encodeURIComponent(l.id) + '">View listing &rarr;</a>'
      );
      return marker;
    });

    // Several of Sam's listings sit a few hundred metres apart in the CBD/River Valley
    // area, so at a zoom that still fits the one outlier (e.g. Kingsford Waterbay, out in
    // Sengkang), their price badges land almost on top of each other and become unreadable.
    // Leaflet.markercluster groups pins that are this close into a single round badge
    // showing the count instead — click it to zoom in, and it re-splits back into normal
    // price pins once there's enough room between them. Falls back to plain (unclustered)
    // pins if the plugin didn't load for some reason, so the map still works either way.
    var hasCluster = typeof L.markerClusterGroup === 'function';
    var layer = hasCluster
      ? L.markerClusterGroup({
          // maxClusterRadius is measured pin-to-pin (anchor point to anchor point), but
          // each price badge is a label roughly 65–90px WIDE (more for rentals with a
          // "/mo" suffix), centered on its own anchor — so two pins need to be that far
          // apart, not just non-zero pixels apart, before their badges stop overlapping.
          // This needs to track the badge's rendered width (see .price-pin-badge in
          // css/styles.css) any time that size changes.
          maxClusterRadius: 85,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: function (cluster) {
            return L.divIcon({
              className: 'price-pin-cluster',
              html: '<div class="price-pin-cluster-badge">' + cluster.getChildCount() + ' homes</div>',
              iconSize: [0, 0],
              iconAnchor: [0, 0]
            });
          }
        })
      : L.featureGroup(); // plain featureGroup (not layerGroup) so .getBounds() below still works

    markers.forEach(function (m) { layer.addLayer(m); });
    map.addLayer(layer);

    // Pixel padding (not just a ratio of the geographic bounds) so a pin sitting right at
    // the edge of the framed area still has room for its price badge — the badge is a
    // label wider than the pin itself, centered above the marker's exact point, so a pin
    // near the frame's edge was getting its badge sliced off by the map's own edge. More
    // padding on top than the sides/bottom since the badge sits entirely above the point.
    if (markers.length > 1) {
      map.fitBounds(layer.getBounds(), {
        paddingTopLeft: [55, 70],
        paddingBottomRight: [55, 30]
      });
    } else {
      map.setView(markers[0].getLatLng(), 15);
    }
  });
}

// ============================================================
// Listings — read from data/listings.json, render on-site
// (For Sale / For Rent grids, the homepage featured strip, and
// the listing.html detail page). All paths below are relative
// to the page that loads main.js, so this expects listings.json
// at data/listings.json next to index.html.
//
// IMPORTANT: fetch() of a local JSON file only works when the
// site is served over http/https (a real web host, or a local
// dev server like `python3 -m http.server`). Double-clicking
// index.html and opening it as a file:// URL will NOT load the
// listings — browsers block that for security reasons. This is
// normal and goes away once the site is actually hosted.
// ============================================================

// Updates (or creates) the page's <meta name="description"> tag — used so each
// listing.html page gets a unique, keyword-relevant description for search engines,
// since the base tag in the HTML is generic.
function setMetaDescription(text) {
  var tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'description');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', text);
}

// Injects schema.org JSON-LD structured data for a listing, so search engines can
// understand it as a real-estate listing (price, address, agent) rather than just text.
function injectListingSchema(listing) {
  var data = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    'name': listing.title,
    'description': listing.description,
    'url': window.location.href,
    'address': { '@type': 'PostalAddress', 'addressLocality': listing.district, 'addressCountry': 'SG' },
    'offers': {
      '@type': 'Offer',
      'price': String(listing.price || '').replace(/[^0-9.]/g, ''),
      'priceCurrency': 'SGD',
      'availability': 'https://schema.org/InStock'
    },
    'numberOfBedrooms': listing.beds,
    'numberOfBathroomsTotal': listing.baths,
    'floorSize': listing.sqft ? { '@type': 'QuantitativeValue', 'value': listing.sqft, 'unitCode': 'FTK' } : undefined,
    'agent': { '@type': 'RealEstateAgent', 'name': 'Sam Chin', 'affiliation': 'Huttons Asia Pte Ltd' },
    'image': (listing.images && listing.images.length ? imgSrc(listing.images[0]) : undefined)
  };
  var script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

// Updates the "Home / For Sale Listings / <condo name>" breadcrumb trail on the listing
// detail page (see #breadcrumb-listings-link / #breadcrumb-current in listing.html) and
// adds matching schema.org BreadcrumbList structured data, so both the on-page trail and
// what Google shows in search results name the actual property instead of a generic
// "Details" — the middle crumb also switches between "For Sale Listings" and "For Rent
// Listings" (each linking to the matching category page) depending on the listing's type.
function updateBreadcrumb(listing) {
  var categoryPage = listing.type === 'rent' ? 'for-rent.html' : 'for-sale.html';
  var categoryLabel = listing.type === 'rent' ? 'For Rent Listings' : 'For Sale Listings';

  var listingsLink = document.getElementById('breadcrumb-listings-link');
  if (listingsLink) { listingsLink.href = categoryPage; listingsLink.textContent = categoryLabel; }
  var current = document.getElementById('breadcrumb-current');
  if (current) { current.textContent = listing.title; }

  var origin = window.location.origin + window.location.pathname.replace(/listing\.html$/, '');
  var data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': origin + 'index.html' },
      { '@type': 'ListItem', 'position': 2, 'name': categoryLabel, 'item': origin + categoryPage },
      { '@type': 'ListItem', 'position': 3, 'name': listing.title, 'item': window.location.href }
    ]
  };
  var script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A listing's `images` entries can be a plain path string (the original, simplest format)
// or an { src, alt } object (lets each photo carry its own descriptive alt text for SEO
// and accessibility, rather than every photo on a listing repeating its title). These two
// helpers read either shape so both keep working — imgAlt falls back to a supplied default
// (usually the listing title) whenever a specific alt wasn't set.
function imgSrc(img) { return typeof img === 'string' ? img : ((img && img.src) || ''); }
function imgAlt(img, fallback) {
  var alt = typeof img === 'string' ? '' : (img && img.alt);
  return alt || fallback || '';
}

function fetchListings() {
  return fetch('data/listings.json')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .catch(function (err) {
      // fetch() of a local file is blocked entirely when a page is opened via file://
      // (double-clicked) rather than served over http/https — a browser security
      // restriction, not something JS can work around directly. As a fallback, pages
      // that need listings to actually work when just double-clicked (not merely
      // displayed) embed a copy of the same data inline as a <script type="application/json"
      // id="listings-inline-data"> tag — see build-inline-data.js. Use that if present.
      var inline = document.getElementById('listings-inline-data');
      if (inline) {
        try { return JSON.parse(inline.textContent); } catch (parseErr) { /* fall through to null below */ }
      }
      console.warn('Could not load data/listings.json:', err);
      return null; // null = load failed with no fallback available; [] = loaded fine but empty
    });
}

// Strips "$" / "," / "/mo" etc. from a price string down to a plain number, for filtering.
function parsePriceNumber(l) {
  var n = parseFloat(String(l.price || '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// Fixed price brackets, tuned separately for sale (property price) vs rent (monthly rent) —
// the ranges are typical for Singapore private condos and meant to be a rough filter,
// not a precise one. Adjust the numbers here if Sam's listings skew outside these bands.
function priceBrackets(type) {
  return type === 'rent'
    ? [
        { label: 'Under $3,000/mo', max: 3000 },
        { label: '$3,000 – $5,000/mo', min: 3000, max: 5000 },
        { label: '$5,000 – $8,000/mo', min: 5000, max: 8000 },
        { label: 'Above $8,000/mo', min: 8000 }
      ]
    : [
        { label: 'Under $1.5M', max: 1500000 },
        { label: '$1.5M – $2.5M', min: 1500000, max: 2500000 },
        { label: '$2.5M – $3.5M', min: 2500000, max: 3500000 },
        { label: 'Above $3.5M', min: 3500000 }
      ];
}

// Formats price-per-sqft for the Property Details table, e.g. "$2,916 psf". Returns
// null when there isn't enough data to compute it (missing price or sqft).
function pricePsf(l) {
  var price = parsePriceNumber(l);
  if (price === null || !l.sqft) return null;
  return '$' + Math.round(price / l.sqft).toLocaleString() + ' psf';
}

// One row of the Property Details spec table; skipped entirely if value is falsy.
function specRow(label, value) {
  if (!value) return '';
  return '<div class="spec-row"><span class="spec-label">' + escapeHtml(label) + '</span><span class="spec-value">' + escapeHtml(value) + '</span></div>';
}

function listingFacts(l) {
  var parts = [];
  if (l.beds) parts.push(l.beds + ' bed');
  if (l.baths) parts.push(l.baths + ' bath');
  if (l.sqft) parts.push(l.sqft.toLocaleString() + ' sqft');
  return parts.join(' &middot; ');
}

// Photos pulled from a listing portal (PropertyGuru etc.) are hotlinked, not hosted
// locally — if the portal ever blocks hotlinking or a listing is taken down, the
// image 404s. onerror swaps the card back to the placeholder state so it degrades
// gracefully instead of showing a broken image icon.
var IMG_ONERROR = 'this.closest(\'.listing-photo, .listing-photo-lg\').classList.add(\'placeholder\'); this.remove();';

// Separate handler for the gallery hero image: unlike a card thumbnail, this element is
// kept and reused (its src gets swapped whenever a different filmstrip photo is picked),
// so on error it just hides itself and flags the placeholder state rather than removing
// itself from the DOM outright, which would otherwise break every later gallery click.
var HERO_IMG_ONERROR = 'this.style.display=\'none\'; var h=this.closest(\'.listing-gallery-hero\'); if (h) h.classList.add(\'placeholder\');';

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

function emptyStateHTML(kind) {
  var label = kind === 'rent' ? 'for rent' : (kind === 'sale' ? 'for sale' : '');
  return (
    '<div class="empty-state">' +
      '<p>No listings ' + label + ' on the site right now — check back soon.</p>' +
      '<div class="hero-actions" style="justify-content: center;">' +
        '<a class="btn btn-secondary btn-sm" href="https://www.propertyguru.com.sg/agent/sam-chin-328241" target="_blank" rel="noopener">View on PropertyGuru</a>' +
        '<a class="btn btn-secondary btn-sm" href="https://agents.huttonsgroup.com/R008856D/about" target="_blank" rel="noopener">View on Huttons</a>' +
      '</div>' +
    '</div>'
  );
}

function loadFailedHTML() {
  return (
    '<div class="empty-state">' +
      '<p>Listings couldn’t be loaded. If you’re previewing this file directly on your computer ' +
      '(a <code>file://</code> link), that’s expected — browsers block local pages from reading other ' +
      'local files. This works normally once the site is uploaded to a real web host, or you can preview it ' +
      'locally by running a simple server, e.g. <code>python3 -m http.server</code> in the site folder.</p>' +
    '</div>'
  );
}

// Builds the "&larr; Prev / Page X of Y / Next &rarr;" control shown under the grid on
// mobile. Returns '' (nothing rendered) whenever there's only one page, so the markup
// simply doesn't appear on desktop (where MOBILE_PAGE_SIZE isn't applied) or once a
// filtered result set is short enough to fit on a single page.
function paginationHTML(page, totalPages) {
  if (totalPages <= 1) return '';
  return (
    '<button type="button" class="pagination-btn" data-dir="prev"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">&larr; Prev</button>' +
    '<span class="pagination-status">Page ' + page + ' of ' + totalPages + '</span>' +
    '<button type="button" class="pagination-btn" data-dir="next"' + (page >= totalPages ? ' disabled' : '') + ' aria-label="Next page">Next &rarr;</button>'
  );
}

// Renders a filterable grid on for-sale.html / for-rent.html.
// Expects a <div id="listing-grid"></div> and, if a filter bar is wanted, any of
// <select id="district-filter">, <select id="beds-filter">, <select id="price-filter">
// already in the page markup — each is optional, wired up only if present. A sibling
// <div id="listing-pagination"></div> right after the grid is also optional: on mobile
// (<=900px, matching the layout breakpoint in css/styles.css) it paginates the results
// 4 cards at a time instead of dumping the whole list in one long scroll; on desktop it's
// left empty and every matching listing just shows at once, same as before.
function initListingGrid(type) {
  var grid = document.getElementById('listing-grid');
  if (!grid) return;
  var paginationEl = document.getElementById('listing-pagination');
  var districtFilter = document.getElementById('district-filter');
  var typeFilter = document.getElementById('property-type-filter');
  var bedsFilter = document.getElementById('beds-filter');
  var priceFilter = document.getElementById('price-filter');
  var MOBILE_PAGE_SIZE = 4;
  var mobileQuery = window.matchMedia('(max-width: 900px)');
  var currentPage = 1;
  // If the grid already has real listing cards baked into the HTML (see gencards.js /
  // README "SEO" section), that's a server-rendered fallback for search engines AND for
  // anyone opening this file directly as file:// (where fetch() below always fails).
  // Don't blow that away just because the live fetch failed — only replace it once we
  // have a real answer, good or bad.
  var hasPrerendered = !!grid.querySelector('.listing-card');

  // Pre-fill filters from the URL's query string, so the homepage search card (which
  // links here with ?district=...&propertyType=...&price=...) actually narrows the
  // results on arrival instead of just being decorative.
  var urlParams = new URLSearchParams(window.location.search);

  fetchListings().then(function (all) {
    if (all === null) {
      if (!hasPrerendered) { grid.innerHTML = loadFailedHTML(); }
      return; // keep whatever prerendered content is already there; filtering just won't be live
    }

    var items = all.filter(function (l) { return l.type === type; });
    var brackets = priceBrackets(type);

    // Any filter change starts back at page 1 — landing on, say, page 3 of a much shorter
    // filtered result (or one that's now empty) would otherwise look like a bug.
    function onFilterChange() { currentPage = 1; render(); }

    if (districtFilter) {
      var districts = items.reduce(function (acc, l) { if (l.district && acc.indexOf(l.district) === -1) acc.push(l.district); return acc; }, []).sort();
      districtFilter.innerHTML = '<option value="">All Districts</option>' +
        districts.map(function (d) { return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>'; }).join('');
      if (urlParams.get('district') && districts.indexOf(urlParams.get('district')) !== -1) districtFilter.value = urlParams.get('district');
      districtFilter.addEventListener('change', onFilterChange);
    }

    if (typeFilter) {
      var propTypes = items.reduce(function (acc, l) { if (l.propertyType && acc.indexOf(l.propertyType) === -1) acc.push(l.propertyType); return acc; }, []).sort();
      typeFilter.innerHTML = '<option value="">All Property Types</option>' +
        propTypes.map(function (t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>'; }).join('');
      if (urlParams.get('propertyType') && propTypes.indexOf(urlParams.get('propertyType')) !== -1) typeFilter.value = urlParams.get('propertyType');
      typeFilter.addEventListener('change', onFilterChange);
    }

    if (bedsFilter) {
      var bedCounts = items.reduce(function (acc, l) { if (l.beds && acc.indexOf(l.beds) === -1) acc.push(l.beds); return acc; }, []).sort(function (a, b) { return a - b; });
      bedsFilter.innerHTML = '<option value="">Any Bedrooms</option>' +
        bedCounts.map(function (b) { return '<option value="' + b + '">' + b + ' Bedroom' + (b > 1 ? 's' : '') + '</option>'; }).join('');
      if (urlParams.get('beds')) bedsFilter.value = urlParams.get('beds');
      bedsFilter.addEventListener('change', onFilterChange);
    }

    if (priceFilter) {
      priceFilter.innerHTML = '<option value="">Any Price</option>' +
        brackets.map(function (b, i) { return '<option value="' + i + '">' + b.label + '</option>'; }).join('');
      if (urlParams.get('price')) priceFilter.value = urlParams.get('price');
      priceFilter.addEventListener('change', onFilterChange);
    }

    if (paginationEl) {
      paginationEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.pagination-btn');
        if (!btn || btn.disabled) return;
        currentPage += (btn.dataset.dir === 'prev') ? -1 : 1;
        render();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      // Rotating a phone, or resizing a browser window across the 900px breakpoint,
      // should pick pagination up/drop it immediately rather than waiting for the next
      // filter change.
      var onBreakpointChange = function () { currentPage = 1; render(); };
      if (mobileQuery.addEventListener) { mobileQuery.addEventListener('change', onBreakpointChange); }
      else if (mobileQuery.addListener) { mobileQuery.addListener(onBreakpointChange); }
    }

    function render() {
      var districtValue = districtFilter ? districtFilter.value : '';
      var typeValue = typeFilter ? typeFilter.value : '';
      var bedsValue = bedsFilter ? bedsFilter.value : '';
      var bracket = (priceFilter && priceFilter.value !== '') ? brackets[Number(priceFilter.value)] : null;

      var filtered = items.filter(function (l) {
        if (districtValue && l.district !== districtValue) return false;
        if (typeValue && l.propertyType !== typeValue) return false;
        if (bedsValue && String(l.beds) !== bedsValue) return false;
        if (bracket) {
          var price = parsePriceNumber(l);
          if (price === null) return false;
          if (bracket.min != null && price < bracket.min) return false;
          if (bracket.max != null && price >= bracket.max) return false;
        }
        return true;
      });

      var isMobile = mobileQuery.matches;
      var pageSize = isMobile ? MOBILE_PAGE_SIZE : (filtered.length || 1);
      var totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;
      var pageItems = isMobile ? filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize) : filtered;

      grid.innerHTML = pageItems.length
        ? pageItems.map(listingCardHTML).join('')
        : emptyStateHTML(type);

      if (paginationEl) { paginationEl.innerHTML = isMobile ? paginationHTML(currentPage, totalPages) : ''; }
    }

    render();
  });
}

// Paginates the About page's "Client Reviews" wall so 8 real quotes of very different
// lengths don't turn into one long scroll. Unlike initListingGrid() above, the review
// cards are already static HTML (no fetch involved) — this just shows/hides whichever
// .testimonial-card elements belong to the current page and reuses the same
// paginationHTML() control used by the listing grids, restyled for the dark section via
// .testimonial-pagination in css/styles.css. Runs on every screen size (not just mobile)
// since the point here is to shorten the section, not just fix a mobile-only problem.
function initTestimonialPagination() {
  var grid = document.getElementById('testimonial-grid');
  var paginationEl = document.getElementById('testimonial-pagination');
  if (!grid || !paginationEl) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.testimonial-card'));
  var mobileQuery = window.matchMedia('(max-width: 900px)');
  var currentPage = 1;

  function pageSize() { return mobileQuery.matches ? 2 : 4; }

  function render() {
    var size = pageSize();
    var totalPages = Math.max(1, Math.ceil(cards.length / size));
    if (currentPage > totalPages) currentPage = totalPages;
    cards.forEach(function (card, i) {
      var page = Math.floor(i / size) + 1;
      card.style.display = (page === currentPage) ? '' : 'none';
    });
    paginationEl.innerHTML = paginationHTML(currentPage, totalPages);
  }

  paginationEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.pagination-btn');
    if (!btn || btn.disabled) return;
    currentPage += (btn.dataset.dir === 'prev') ? -1 : 1;
    render();
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  var onBreakpointChange = function () { currentPage = 1; render(); };
  if (mobileQuery.addEventListener) { mobileQuery.addEventListener('change', onBreakpointChange); }
  else if (mobileQuery.addListener) { mobileQuery.addListener(onBreakpointChange); }

  render();
}

// Wires up the homepage hero search card (Buy/Rent tabs + District/Property Type/Price
// dropdowns + Search button). Populates the dropdowns from the real listings data, then
// on Search, redirects to for-sale.html or for-rent.html with the picks as query
// params — initListingGrid() above reads those back out and pre-applies them.
function initHomeSearch() {
  var districtSel = document.getElementById('home-district');
  var typeSel = document.getElementById('home-property-type');
  var priceSel = document.getElementById('home-price');
  var searchBtn = document.getElementById('home-search-btn');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.search-tab'));
  if (!districtSel || !typeSel || !priceSel || !searchBtn) return;

  var currentMode = 'sale';

  function renderPriceOptions() {
    var brackets = priceBrackets(currentMode);
    priceSel.innerHTML = '<option value="">Any Price</option>' +
      brackets.map(function (b, i) { return '<option value="' + i + '">' + b.label + '</option>'; }).join('');
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
      currentMode = tab.dataset.mode;
      renderPriceOptions();
    });
  });

  searchBtn.addEventListener('click', function () {
    var params = new URLSearchParams();
    if (districtSel.value) params.set('district', districtSel.value);
    if (typeSel.value) params.set('propertyType', typeSel.value);
    if (priceSel.value !== '') params.set('price', priceSel.value);
    var target = currentMode === 'rent' ? 'for-rent.html' : 'for-sale.html';
    var qs = params.toString();
    window.location.href = target + (qs ? '?' + qs : '');
  });

  fetchListings().then(function (all) {
    var items = all || [];
    var districts = items.reduce(function (acc, l) { if (l.district && acc.indexOf(l.district) === -1) acc.push(l.district); return acc; }, []).sort();
    districtSel.innerHTML = '<option value="">Any District</option>' +
      districts.map(function (d) { return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>'; }).join('');

    var propTypes = items.reduce(function (acc, l) { if (l.propertyType && acc.indexOf(l.propertyType) === -1) acc.push(l.propertyType); return acc; }, []).sort();
    typeSel.innerHTML = '<option value="">Any Property Type</option>' +
      propTypes.map(function (t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>'; }).join('');

    renderPriceOptions();
  });
}

// Renders up to `limit` featured listings (either type) into #featured-grid.
// Hides the whole #featured-listings section if there's nothing to show.
function initFeaturedListings(limit) {
  var section = document.getElementById('featured-listings');
  var grid = document.getElementById('featured-grid');
  if (!section || !grid) return;
  var hasPrerendered = !!grid.querySelector('.listing-card');

  fetchListings().then(function (all) {
    if (all === null) { return; } // fetch failed (e.g. file:// preview) — leave prerendered cards as-is, don't hide the section

    var featured = all.filter(function (l) { return l.featured; }).slice(0, limit || 3);
    if (!featured.length) {
      if (!hasPrerendered) { section.style.display = 'none'; }
      return;
    }
    grid.innerHTML = featured.map(listingCardHTML).join('');
  });
}

// Renders a single listing on listing.html, read from ?id=
function initListingDetail() {
  var container = document.getElementById('listing-detail');
  if (!container) return;

  var id = new URLSearchParams(window.location.search).get('id');

  fetchListings().then(function (all) {
    if (all === null) { container.innerHTML = loadFailedHTML(); return; }

    var listing = all.find(function (l) { return l.id === id; });
    if (!listing) {
      container.innerHTML =
        '<div class="empty-state"><p>That listing isn’t available — it may have been sold, rented out, or removed.</p>' +
        '<div class="hero-actions" style="justify-content: center;">' +
        '<a class="btn btn-secondary btn-sm" href="for-sale.html">Browse For Sale</a>' +
        '<a class="btn btn-secondary btn-sm" href="for-rent.html">Browse For Rent</a></div></div>';
      document.title = 'Listing Not Found | Sam Chin, Huttons Asia';
      var notFoundCrumb = document.getElementById('breadcrumb-current');
      if (notFoundCrumb) { notFoundCrumb.textContent = 'Not Found'; }
      return;
    }

    document.title = listing.title + ' | ' + (listing.type === 'rent' ? 'For Rent' : 'For Sale') + ' | Sam Chin, Huttons Asia';
    setMetaDescription(
      (listing.type === 'rent' ? 'For rent: ' : 'For sale: ') + listing.title + ', ' + listing.district +
      ' — ' + escapeHtml(listing.price) + escapeHtml(listing.priceSuffix || '') + '. Listed by Sam Chin, Huttons Asia.'
    );
    injectListingSchema(listing);
    updateBreadcrumb(listing);

    var images = listing.images || [];
    // Floor plans are diagrams, not photos — forcing them into the same cropped/cover
    // treatment as a room photo would cut most of the plan off, so they get a "contain"
    // box (whole image visible, on a light backing) instead, in both the hero and thumb.
    var isFloorPlan = function (img) { return /floor-?plan/i.test(imgSrc(img)); };

    var galleryHtml;
    if (images.length) {
      var heroCls = 'listing-gallery-hero' + (isFloorPlan(images[0]) ? ' floor-plan' : '');
      var hero =
        '<div class="' + heroCls + '" id="gallery-hero">' +
          '<img id="gallery-hero-img" src="' + escapeHtml(imgSrc(images[0])) + '" alt="' + escapeHtml(imgAlt(images[0], listing.title)) + '" onerror="' + HERO_IMG_ONERROR + '" onload="this.style.display=\'block\'; var h=this.closest(\'.listing-gallery-hero\'); if (h) h.classList.remove(\'placeholder\');">' +
          (images.length > 1
            ? '<button type="button" class="gallery-nav prev" aria-label="Previous photo">&larr;</button>' +
              '<button type="button" class="gallery-nav next" aria-label="Next photo">&rarr;</button>' +
              '<span class="gallery-count" id="gallery-count">1 / ' + images.length + '</span>'
            : '') +
        '</div>';
      // Horizontal-scrolling filmstrip underneath — never a vertical stack of photos.
      // Each thumb gets its own alt text too (not left blank), same source as the hero.
      var filmstrip = images.length > 1
        ? '<div class="listing-filmstrip" id="gallery-filmstrip">' +
            images.map(function (img, i) {
              var cls = 'filmstrip-thumb' + (isFloorPlan(img) ? ' floor-plan' : '') + (i === 0 ? ' active' : '');
              return '<button type="button" class="' + cls + '" data-index="' + i + '">' +
                '<img src="' + escapeHtml(imgSrc(img)) + '" alt="' + escapeHtml(imgAlt(img, listing.title)) + '" loading="lazy" onerror="this.closest(\'.filmstrip-thumb\').style.display=\'none\'">' +
              '</button>';
            }).join('') +
          '</div>'
        : '';
      galleryHtml = hero + filmstrip;
    } else {
      galleryHtml = '<div class="listing-gallery-hero placeholder"><span class="photo-fallback" style="display:block;">[ PHOTOS COMING SOON ]</span></div>';
    }

    var amenities = (listing.amenities || []).map(function (a) { return '<span class="filter-chip">' + escapeHtml(a) + '</span>'; }).join('');
    var nearby = (listing.nearby || []).map(function (n) { return '<span class="filter-chip">' + escapeHtml(n) + '</span>'; }).join('');

    var specTable =
      '<div class="spec-table">' +
        specRow('Price', (listing.price || '') + (listing.priceSuffix || '')) +
        specRow('Property Type', listing.propertyType) +
        specRow('Tenure', listing.tenure) +
        specRow('Floor Size', listing.sqft ? listing.sqft.toLocaleString() + ' sqft' : '') +
        specRow('Price / sqft', pricePsf(listing)) +
        specRow('Bedrooms', listing.beds) +
        specRow('Bathrooms', listing.baths) +
        specRow('District', listing.district) +
      '</div>';

    container.innerHTML =
      '<div class="listing-gallery">' + galleryHtml + '</div>' +
      '<div class="listing-detail-grid">' +
        '<div class="listing-detail-main">' +
          '<span class="chip">' + (listing.type === 'rent' ? 'FOR RENT' : 'FOR SALE') + '</span>' +
          '<h1 style="font-size: 30px; margin: 10px 0 0;">' + escapeHtml(listing.title) + '</h1>' +
          '<span style="font-size: 14px; color: var(--text-muted);">' + escapeHtml(listing.district) + '</span>' +
          '<div class="listing-detail-facts">' +
            (listing.beds ? '<span>' + listing.beds + ' Bedroom' + (listing.beds === 1 ? '' : 's') + '</span>' : '') +
            (listing.baths ? '<span>' + listing.baths + ' Bathroom' + (listing.baths === 1 ? '' : 's') + '</span>' : '') +
            (listing.sqft ? '<span>' + listing.sqft.toLocaleString() + ' sqft</span>' : '') +
            (listing.tenure ? '<span>' + escapeHtml(listing.tenure) + '</span>' : '') +
          '</div>' +
          '<h3 class="detail-heading">Property Details</h3>' +
          specTable +
          '<h3 class="detail-heading">About This Property</h3>' +
          '<p>' + escapeHtml(listing.description || 'Details available on request.') + '</p>' +
          (amenities ? '<h4 class="detail-subheading">Facilities</h4><div class="chip-row">' + amenities + '</div>' : '') +
          (nearby ? '<h3 class="detail-heading">What&rsquo;s Nearby</h3><div class="chip-row">' + nearby + '</div>' : '') +
        '</div>' +
        '<div class="card listing-enquiry">' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            '<div class="avatar-placeholder" style="width:56px;height:56px;font-size:16px;"><img src="images/sam-chin-avatar.jpg" alt="Sam Chin, Huttons Asia property agent" loading="lazy"></div>' +
            '<div><span style="font-family:\'Fraunces\',serif;font-size:16px;font-weight:600;display:block;">Sam Chin</span>' +
            '<span style="font-size:12px;color:var(--text-muted);">R008856D</span></div>' +
          '</div>' +
          '<span style="font-family:\'Fraunces\',serif;font-size:24px;font-weight:600;">' + escapeHtml(listing.price) + escapeHtml(listing.priceSuffix || '') + '</span>' +
          '<a class="btn btn-primary" href="https://wa.me/6591860486" target="_blank" rel="noopener" style="justify-content:center;">WhatsApp Enquiry</a>' +
          '<a class="btn btn-secondary" href="tel:+6591860486" style="justify-content:center;">Call Sam</a>' +
          (listing.sourceUrl ? '<a href="' + escapeHtml(listing.sourceUrl) + '" target="_blank" rel="noopener" style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:4px;">View original listing on PropertyGuru &rarr;</a>' : '') +
        '</div>' +
      '</div>';

    if (images.length > 1) { initGalleryControls(images, isFloorPlan, listing.title); }
  });
}

// Wires up the hero photo + horizontal filmstrip built above: clicking a thumbnail (or
// the prev/next arrows) swaps the hero image, keeps the active thumbnail highlighted and
// scrolled into view, and updates the "n / total" counter — all without the filmstrip
// itself ever needing to scroll vertically.
function initGalleryControls(images, isFloorPlan, titleFallback) {
  var heroEl = document.getElementById('gallery-hero');
  var heroImg = document.getElementById('gallery-hero-img');
  var countEl = document.getElementById('gallery-count');
  var filmstrip = document.getElementById('gallery-filmstrip');
  if (!heroEl || !heroImg || !filmstrip) return;

  var current = 0;

  function show(index) {
    current = (index + images.length) % images.length;
    heroImg.src = imgSrc(images[current]);
    heroImg.alt = imgAlt(images[current], titleFallback);
    heroEl.classList.toggle('floor-plan', isFloorPlan(images[current]));
    if (countEl) { countEl.textContent = (current + 1) + ' / ' + images.length; }
    var thumbs = filmstrip.querySelectorAll('.filmstrip-thumb');
    thumbs.forEach(function (t, i) { t.classList.toggle('active', i === current); });
    var activeThumb = thumbs[current];
    if (activeThumb && activeThumb.scrollIntoView) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  filmstrip.addEventListener('click', function (e) {
    var btn = e.target.closest('.filmstrip-thumb');
    if (!btn) return;
    show(parseInt(btn.dataset.index, 10));
  });

  var prevBtn = heroEl.querySelector('.gallery-nav.prev');
  var nextBtn = heroEl.querySelector('.gallery-nav.next');
  if (prevBtn) { prevBtn.addEventListener('click', function () { show(current - 1); }); }
  if (nextBtn) { nextBtn.addEventListener('click', function () { show(current + 1); }); }
}
