/* =============================================================================
 * cm-report.js — Building Market Report renderer
 * Renders the full report from a single building_market_report RPC call.
 * Mounts into #cm-report-root (full-page shell served by the worker at
 * /building/<slug>/report), reading the slug from the URL. Self-contained;
 * uses the offer gold-token palette to match the email aesthetic.
 *
 * Sections (in order): topbar, hero (with photo gallery when available),
 * key stats tiles, sales-over-time chart, recent sales cards, market tier
 * comparison, the block (neighbor map + cards), signup credit CTA, footer.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__CM_REPORT__) return;
  window.__CM_REPORT__ = true;

  var SUPABASE_URL  = 'https://kfqphwerygccpzntbbif.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

  var m = location.pathname.match(/\/building\/([^\/]+)/);
  if (!m) return;
  var SLUG = decodeURIComponent(m[1]).trim().toLowerCase();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function boot() {
    injectCSS();
    var host = document.getElementById('cm-report-root');
    if (!host) { host = document.createElement('div'); host.id = 'cm-report-root'; document.body.appendChild(host); }
    host.innerHTML = '<div class="cmr-loading">Loading the market report\u2026</div>';
    rpc('building_market_report', { p_building_slug: SLUG, p_radius_mi: 0.5 })
      .then(function (d) {
        if (!d || !d.building) throw new Error('empty');
        render(host, d);
        // Defer map init until after layout settles
        if (d.surrounding_buildings && d.surrounding_buildings.length) {
          setTimeout(function () { initMap(d.building, d.surrounding_buildings); }, 60);
        }
        if (location.hash) {
          var el = document.getElementById(location.hash.slice(1));
          if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('cmr-flash'); }, 120);
        }
      })
      .catch(function (e) {
        console.warn('[cm-report]', e);
        host.innerHTML = '<div class="cmr-loading">We couldn\u2019t load this report. <a href="/building/' + encodeURIComponent(SLUG) + '/">Back to the building \u2192</a></div>';
      });
  }

  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { if (!r.ok) throw new Error('rpc ' + r.status); return r.json(); });
  }

  /* ----------------------------- helpers ---------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ulabel(s) { return '#' + String(s == null ? '' : s).replace(/^#+/, '').toUpperCase(); }
  function money(n) { return (n == null || isNaN(n)) ? '\u2014' : '$' + Math.round(Number(n)).toLocaleString('en-US'); }
  function moneyShort(n) {
    n = Number(n); if (!isFinite(n)) return '\u2014';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function ppsf(n) { return (n == null || isNaN(n)) ? '\u2014' : '$' + Math.round(Number(n)).toLocaleString('en-US'); }
  function num(n) { return (n == null || isNaN(n)) ? '\u2014' : Number(n).toLocaleString('en-US'); }
  function baths(n) { n = Number(n); return isFinite(n) ? String(n).replace(/\.0$/, '') : '\u2014'; }
  function pctStr(n) { if (n == null || isNaN(n)) return ''; var a = Math.abs(n).toFixed(1).replace(/\.0$/, ''); return (n >= 0 ? '+' : '\u2212') + a + '%'; }
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(iso) {
    if (!iso) return '\u2014';
    var mm = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!mm) return esc(iso);
    return MONTHS[(+mm[2]) - 1] + ' ' + (+mm[3]) + ', ' + mm[1];
  }
  function verdict(p) {
    if (p == null || isNaN(p)) return 'A data-grounded read on how this building is pricing right now.';
    var a = Math.abs(p).toFixed(1).replace(/\.0$/, '');
    if (p >= 0.5) return 'Commands a <b>' + a + '% premium</b> to the surrounding blocks.';
    if (p <= -0.5) return 'Trades at a <b>' + a + '% discount</b> to the surrounding blocks.';
    return 'Priced <b>in line</b> with the surrounding blocks.';
  }
  function trendBadge(n) {
    if (n == null || isNaN(n)) return '';
    var dir = n >= 0 ? 'up' : 'down';
    var arrow = n >= 0 ? '\u2197' : '\u2198';
    return '<span class="cmr-trend cmr-trend-' + dir + '">' + arrow + ' ' + pctStr(n) + ' YoY $/ft\u00b2</span>';
  }

  /* ------------------------------- render --------------------------------- */
  function statTile(label, value, sub) {
    return '<div class="cmr-tile"><div class="cmr-tile-label">' + esc(label) + '</div>' +
      '<div class="cmr-tile-value">' + value + '</div>' +
      (sub ? '<div class="cmr-tile-sub">' + sub + '</div>' : '') + '</div>';
  }

  function saleCard(s) {
    var hasDom = s.list_date && s.sale_date;
    var hasLvs = s.original_list_price != null && s.sale_price != null;
    var dom = '', lvs = '';
    if (hasDom) {
      var d = Math.round((new Date(s.sale_date) - new Date(s.list_date)) / 86400000);
      dom = '<div class="cmr-sc-row"><span>Days on market</span><span class="v">' + d + '</span></div>';
    }
    if (hasLvs) {
      var ratio = (Number(s.sale_price) / Number(s.original_list_price) * 100);
      lvs = '<div class="cmr-sc-row"><span>Sale vs list</span><span class="v">' + ratio.toFixed(1).replace(/\.0$/, '') + '%</span></div>';
    }
    var bb = [];
    if (s.beds != null) bb.push(s.beds + ' bd');
    if (s.baths_total != null) bb.push(baths(s.baths_total) + ' ba');
    if (s.sqft) bb.push(num(s.sqft) + ' ft\u00b2');
    var anchor = s.anchor || ('recent-sale-' + s.id);
    return '<article class="cmr-sc" id="' + esc(anchor) + '">' +
      '<div class="cmr-sc-top"><div class="cmr-sc-unit">' + esc(ulabel(s.unit_label)) + '</div>' +
      '<div class="cmr-sc-price">' + money(s.sale_price) + '</div></div>' +
      '<div class="cmr-sc-meta">' + esc(bb.join(' \u00b7 ')) + '</div>' +
      '<div class="cmr-sc-rows">' +
        '<div class="cmr-sc-row"><span>Sold</span><span class="v">' + fmtDate(s.sale_date) + '</span></div>' +
        '<div class="cmr-sc-row"><span>Price / ft\u00b2</span><span class="v">' + ppsf(s.ppsf) + '</span></div>' +
        dom + lvs +
      '</div></article>';
  }

  function compareRow(label, tier, buildingPpsf, premium) {
    if (!tier) return '';
    var prem = '';
    if (premium != null && !isNaN(premium)) {
      var dir = premium >= 0 ? 'up' : 'down';
      prem = '<span class="cmr-prem cmr-prem-' + dir + '">' + pctStr(premium) + '</span>';
    }
    var scope = tier.building_count != null ? (num(tier.building_count) + ' bldgs \u00b7 ' + num(tier.n_12mo) + ' sales') : (num(tier.n_12mo) + ' sales');
    return '<div class="cmr-cmp-row">' +
      '<div class="cmr-cmp-label">' + esc(label) + '<span class="cmr-cmp-scope">' + scope + '</span></div>' +
      '<div class="cmr-cmp-ppsf">' + ppsf(tier.median_ppsf_12mo) + '<span>/ft\u00b2 median</span></div>' +
      '<div class="cmr-cmp-prem">' + (prem || '<span class="cmr-cmp-na">\u2014</span>') + '<span class="cmr-cmp-premlab">this building</span></div>' +
      '</div>';
  }

  /* ---- NEW: SVG sales-over-time chart ------------------------------------ */
  // Dots for each sale + faint connecting line, dashed median, year axis,
  // $/ft² y-axis with grid lines. Hover any dot for unit/date/price tooltip.
  function buildSalesChart(ts) {
    if (!Array.isArray(ts) || ts.length < 2) return '';
    var pts = ts.filter(function (p) { return p && p.ppsf != null && p.sale_date; });
    if (pts.length < 2) return '';

    var W = 760, H = 300, PAD_L = 64, PAD_R = 24, PAD_T = 24, PAD_B = 36;
    var plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

    var firstT = +new Date(pts[0].sale_date);
    var lastT  = +new Date(pts[pts.length - 1].sale_date);
    if (lastT === firstT) { firstT -= 86400000; lastT += 86400000; }

    var minP = Infinity, maxP = -Infinity;
    pts.forEach(function (p) {
      if (p.ppsf < minP) minP = p.ppsf;
      if (p.ppsf > maxP) maxP = p.ppsf;
    });
    var rng = Math.max(50, maxP - minP);
    var pad = rng * 0.12;
    var yMin = Math.max(0, Math.floor((minP - pad) / 100) * 100);
    var yMax = Math.ceil((maxP + pad) / 100) * 100;
    if (yMax === yMin) yMax = yMin + 100;

    function xPos(d) { return PAD_L + ((+new Date(d)) - firstT) / (lastT - firstT) * plotW; }
    function yPos(p) { return PAD_T + (1 - (p - yMin) / (yMax - yMin)) * plotH; }

    // Y grid + labels
    var ySteps = 4, yMarkup = '';
    for (var i = 0; i <= ySteps; i++) {
      var v = yMin + (yMax - yMin) * (i / ySteps);
      var y = yPos(v);
      yMarkup += '<line x1="' + PAD_L + '" y1="' + y.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + y.toFixed(1) + '" stroke="rgba(232,227,216,0.07)" stroke-width="1"/>';
      yMarkup += '<text x="' + (PAD_L - 8) + '" y="' + (y + 3.5).toFixed(1) + '" fill="rgba(232,227,216,0.5)" font-size="10" font-family="JetBrains Mono, ui-monospace, monospace" text-anchor="end">$' + Math.round(v).toLocaleString() + '</text>';
    }

    // X year markers
    var firstYear = new Date(firstT).getFullYear();
    var lastYear  = new Date(lastT).getFullYear();
    var span = lastYear - firstYear;
    var step = span > 16 ? 4 : span > 8 ? 2 : 1;
    var xMarkup = '';
    for (var yr = Math.ceil(firstYear / step) * step; yr <= lastYear; yr += step) {
      var yt = +new Date(yr + '-01-01');
      if (yt < firstT || yt > lastT) continue;
      var xx = xPos(yt);
      xMarkup += '<line x1="' + xx.toFixed(1) + '" y1="' + (H - PAD_B) + '" x2="' + xx.toFixed(1) + '" y2="' + (H - PAD_B + 4) + '" stroke="rgba(232,227,216,0.3)"/>';
      xMarkup += '<text x="' + xx.toFixed(1) + '" y="' + (H - PAD_B + 18) + '" fill="rgba(232,227,216,0.55)" font-size="10" font-family="JetBrains Mono, ui-monospace, monospace" text-anchor="middle">' + yr + '</text>';
    }

    // Median dashed line
    var sortedP = pts.map(function (p) { return p.ppsf; }).sort(function (a, b) { return a - b; });
    var median = sortedP[Math.floor(sortedP.length / 2)];
    var mY = yPos(median);
    var medianMarkup =
      '<line x1="' + PAD_L + '" y1="' + mY.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + mY.toFixed(1) + '" stroke="rgba(212,165,116,0.45)" stroke-width="1" stroke-dasharray="4,4"/>' +
      '<text x="' + (W - PAD_R - 4) + '" y="' + (mY - 5).toFixed(1) + '" fill="rgba(212,165,116,0.85)" font-size="10" font-family="JetBrains Mono, ui-monospace, monospace" text-anchor="end">median $' + Math.round(median).toLocaleString() + '/ft\u00b2</text>';

    // Connecting line through sorted-by-date points
    var linePath = 'M ' + pts.map(function (p) { return xPos(p.sale_date).toFixed(1) + ' ' + yPos(p.ppsf).toFixed(1); }).join(' L ');
    var connectMarkup = '<path d="' + linePath + '" stroke="rgba(212,165,116,0.22)" stroke-width="1" fill="none"/>';

    // Dots with tooltip titles
    var dotsMarkup = pts.map(function (p) {
      var x = xPos(p.sale_date), y = yPos(p.ppsf);
      var unitTxt = p.unit_label ? ulabel(p.unit_label) + ' \u00b7 ' : '';
      var title = unitTxt + fmtDate(p.sale_date) + ' \u00b7 ' + ppsf(p.ppsf) + '/ft\u00b2 \u00b7 ' + money(p.sale_price);
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5" fill="#d4a574" stroke="rgba(15,19,29,0.9)" stroke-width="1.2"><title>' + esc(title) + '</title></circle>';
    }).join('');

    return '<div class="cmr-chart-wrap"><svg class="cmr-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Price per square foot, by sale date">' +
      yMarkup + xMarkup + medianMarkup + connectMarkup + dotsMarkup +
      '<text x="' + (PAD_L - 8) + '" y="' + (PAD_T - 8) + '" fill="rgba(232,227,216,0.55)" font-size="10" font-family="JetBrains Mono, ui-monospace, monospace" text-anchor="end">$/ft\u00b2</text>' +
      '</svg></div>';
  }

  /* ---- NEW: dedicated photos strip (uses photos_detail when available) --- */
  function buildPhotosSection(photosDetail) {
    if (!Array.isArray(photosDetail) || photosDetail.length < 2) return '';
    var items = photosDetail.slice(0, 8).map(function (p) {
      var alt = esc(p.alt || p.caption || 'Building photo');
      var cap = p.caption ? '<div class="cmr-photo-cap">' + esc(p.caption) + '</div>' : '';
      return '<figure class="cmr-photo"><div class="cmr-photo-img" style="background-image:url(' + JSON.stringify(esc(p.url)) + ')" role="img" aria-label="' + alt + '"></div>' + cap + '</figure>';
    }).join('');
    return '<section class="cmr-sec"><h2 class="cmr-h2">Photography</h2>' +
      '<div class="cmr-photo-grid">' + items + '</div></section>';
  }

  /* ---- NEW: surroundings (map placeholder + cards grid) ------------------ */
  function buildSurroundingsSection(b, surroundings) {
    if (!b || !b.has_geo || !Array.isArray(surroundings) || !surroundings.length) return '';
    var cards = surroundings.map(function (s) {
      var img = s.hero_image_url
        ? '<div class="cmr-nbr-img" style="background-image:url(' + JSON.stringify(esc(s.hero_image_url)) + ')" role="img" aria-label="' + esc(s.display_name) + '"></div>'
        : '<div class="cmr-nbr-img cmr-nbr-noimg" aria-hidden="true"></div>';
      var meta = [];
      if (s.unit_count) meta.push(num(s.unit_count) + ' units');
      if (s.year_built) meta.push(s.year_built);
      var ppsfBlock = s.ppsf_12mo_median
        ? '<div class="cmr-nbr-ppsf">' + ppsf(s.ppsf_12mo_median) + '<span>/ft\u00b2 \u00b7 ' + num(s.sales_12mo || 0) + ' sales</span></div>'
        : '<div class="cmr-nbr-ppsf cmr-nbr-noppsf">\u2014<span>no recorded sales (12 mo)</span></div>';
      var distMi = (Number(s.distance_mi) || 0).toFixed(2).replace(/\.00$/, '.0');
      return '<a class="cmr-nbr-card" href="' + esc(s.report_url) + '">' +
        img +
        '<div class="cmr-nbr-body">' +
          '<div class="cmr-nbr-name">' + esc(s.display_name) + '</div>' +
          '<div class="cmr-nbr-meta">' + esc(meta.join(' \u00b7 ')) + '</div>' +
          ppsfBlock +
          '<div class="cmr-nbr-dist">' + distMi + ' mi</div>' +
        '</div></a>';
    }).join('');
    return '<section class="cmr-sec" id="surroundings">' +
      '<h2 class="cmr-h2">The block</h2>' +
      '<p class="cmr-note">' + num(surroundings.length) + ' nearby ' + (surroundings.length === 1 ? 'building' : 'buildings') + ' within \u00bd mile. Tap any pin or card for its report.</p>' +
      '<div class="cmr-map" id="cmr-map"></div>' +
      '<div class="cmr-nbr-grid">' + cards + '</div>' +
      '</section>';
  }

  /* ---- NEW: Leaflet init (dynamic CDN load, gracefully no-ops on failure) */
  function initMap(b, surroundings) {
    var el = document.getElementById('cmr-map');
    if (!el || !b || b.lat == null || b.lng == null) return;
    if (el.dataset.cmrMapInit === '1') return;
    el.dataset.cmrMapInit = '1';

    function once(tag, attrs) {
      return new Promise(function (resolve, reject) {
        var existing = document.querySelector(tag + '[data-cmr-leaflet]');
        if (existing) { existing.addEventListener('load', resolve, { once: true }); if (existing.sheet || existing.readyState === 'complete' || tag === 'link') resolve(); return; }
        var node = document.createElement(tag);
        node.setAttribute('data-cmr-leaflet', '');
        Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        node.onload = resolve; node.onerror = reject;
        document.head.appendChild(node);
      });
    }

    Promise.all([
      once('link',   { rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' }),
      once('script', { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' })
    ]).then(function () {
      var L = window.L;
      if (!L) return;
      var map = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: false })
                .setView([b.lat, b.lng], 15);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19
      }).addTo(map);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19
      }).addTo(map);

      var subjIcon = L.divIcon({
        className: 'cmr-pin-subject',
        html: '<span class="cmr-pin cmr-pin-gold"></span>',
        iconSize: [22, 22], iconAnchor: [11, 11]
      });
      L.marker([b.lat, b.lng], { icon: subjIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip('<b>' + esc(b.name || '') + '</b><br>This building', { direction: 'top', offset: [0, -8] });

      var bounds = L.latLngBounds([[b.lat, b.lng]]);
      surroundings.forEach(function (s) {
        if (s.lat == null || s.lng == null) return;
        var icon = L.divIcon({
          className: 'cmr-pin-other',
          html: '<span class="cmr-pin cmr-pin-ivory"></span>',
          iconSize: [14, 14], iconAnchor: [7, 7]
        });
        var ttBody = '<b>' + esc(s.display_name) + '</b>';
        var meta = [];
        if (s.unit_count) meta.push(s.unit_count + ' units');
        if (s.year_built) meta.push(s.year_built);
        if (meta.length) ttBody += '<br>' + meta.join(' \u00b7 ');
        if (s.ppsf_12mo_median) ttBody += '<br>' + ppsf(s.ppsf_12mo_median) + '/ft\u00b2 median';
        var marker = L.marker([s.lat, s.lng], { icon: icon })
          .addTo(map)
          .bindTooltip(ttBody, { direction: 'top', offset: [0, -6] });
        marker.on('click', function () { window.location.href = s.report_url; });
        bounds.extend([s.lat, s.lng]);
      });
      map.fitBounds(bounds, { padding: [40, 40] });
    }).catch(function () { /* leave the empty map div; cards still work */ });
  }

  /* ------------------------------- render --------------------------------- */
  function render(host, d) {
    var b = d.building || {};
    var tb = (d.tiers && d.tiers.building) || {};
    var prem = d.premiums || {};
    var name = esc(b.name || SLUG);
    var hood = b.neighborhood ? esc(b.neighborhood) : '';

    /* hero gallery uses photos_detail when present, else falls back to photos */
    var photosDetail = Array.isArray(d.photos_detail) ? d.photos_detail : null;
    var photoUrls = photosDetail
      ? photosDetail.map(function (p) { return p.url; }).filter(Boolean)
      : (Array.isArray(d.photos) ? d.photos : []);
    var heroMedia;
    if (photoUrls.length) {
      heroMedia = '<div class="cmr-gallery">' + photoUrls.slice(0, 5).map(function (u) {
        return '<div class="cmr-gphoto" style="background-image:url(' + JSON.stringify(esc(u)) + ')"></div>';
      }).join('') + '</div>';
    } else {
      heroMedia = '<div class="cmr-hero-neutral"></div>';
    }

    var buildingTiles =
      statTile('Median sale price', money(tb.median_price_12mo), 'trailing 12 months') +
      statTile('Median $/ft\u00b2', ppsf(tb.median_ppsf_12mo), trendBadge(tb.trend_ppsf_pct)) +
      statTile('12-mo volume', moneyShort(tb.volume_12mo), num(tb.n_12mo) + ' recorded sales') +
      statTile('Sales this year', num(tb.n_12mo), 'vs ' + num(tb.n_prior_12mo) + ' prior 12 mo');

    var chartSection = '';
    if (Array.isArray(d.sales_timeseries) && d.sales_timeseries.length >= 2) {
      var chart = buildSalesChart(d.sales_timeseries);
      if (chart) chartSection =
        '<section class="cmr-sec"><h2 class="cmr-h2">$/ft\u00b2 over time</h2>' +
        '<p class="cmr-note">Every recorded sale at ' + name + ', plotted by sale date. Hover a point for the unit, date, and price.</p>' +
        chart + '</section>';
    }

    var photosSection = buildPhotosSection(photosDetail);

    var recent = (d.recent_sales || []).map(saleCard).join('');

    var compares =
      compareRow('Immediate surroundings (\u00bd mi)', d.tiers && d.tiers.surrounding, tb.median_ppsf_12mo, prem.vs_surrounding_pct) +
      compareRow((hood || 'Neighborhood'), d.tiers && d.tiers.neighborhood, tb.median_ppsf_12mo, prem.vs_neighborhood_pct) +
      compareRow('All San Francisco', d.tiers && d.tiers.sf, tb.median_ppsf_12mo, prem.vs_sf_pct);

    var surroundingsSection = buildSurroundingsSection(b, d.surrounding_buildings);

    var offerHref = '/?auth=signup&return=' + encodeURIComponent(location.pathname) + '&offer=save-10k&utm_content=report';

    host.innerHTML =
      '<div class="cmr-page">' +
        '<div class="cmr-topbar"><a class="cmr-back" href="/building/' + encodeURIComponent(SLUG) + '/">\u2039 ' + name + '</a>' +
          '<span class="cmr-gen">Generated ' + fmtDate(d.generated_at) + '</span></div>' +

        '<header class="cmr-hero">' + heroMedia +
          '<div class="cmr-hero-body">' +
            (hood ? '<div class="cmr-kicker">' + hood + ' \u00b7 Market Report</div>' : '<div class="cmr-kicker">Market Report</div>') +
            '<h1 class="cmr-title">' + name + '</h1>' +
            '<p class="cmr-verdict">' + verdict(prem.vs_surrounding_pct) + '</p>' +
          '</div>' +
        '</header>' +

        '<section class="cmr-sec"><h2 class="cmr-h2">The building</h2>' +
          '<div class="cmr-tiles">' + buildingTiles + '</div></section>' +

        chartSection +

        (recent ? '<section class="cmr-sec"><h2 class="cmr-h2">Recent sales</h2>' +
          '<div class="cmr-cards">' + recent + '</div></section>' : '') +

        photosSection +

        (compares.trim() ? '<section class="cmr-sec"><h2 class="cmr-h2">How it compares</h2>' +
          '<p class="cmr-note">Building median $/ft\u00b2 measured against each wider market, trailing 12 months.</p>' +
          '<div class="cmr-cmp">' + compares + '</div></section>' : '') +

        surroundingsSection +

        '<section class="cmr-offer">' +
          '<div class="cmr-offer-eyebrow">Limited \u00b7 Save $10K</div>' +
          '<div class="cmr-offer-headline">$10,000 toward your first transaction.</div>' +
          '<p class="cmr-offer-sub">Create a free account within 24 hours of your first visit and we credit $10,000 to your first deal through Condo Market \u2014 it never expires.</p>' +
          '<a class="cmr-offer-cta" href="' + offerHref + '">Claim $10,000 \u2192</a>' +
        '</section>' +

        '<footer class="cmr-foot">Condo Market is operated by Tim McMullen, a California licensed real estate agent (DRE #02016832) of McMullen Properties. Figures reflect recorded sales and are informational, not an appraisal.</footer>' +
      '</div>';
  }

  /* ------------------------------- styles --------------------------------- */
  function injectCSS() {
    if (document.getElementById('cmr-css')) return;
    var css =
    ':root{--cmr-bg:#0f131d;--cmr-card:#1a1f2e;--cmr-gold:#d4a574;--cmr-text:#e8e3d8;--cmr-dim:rgba(232,227,216,.62);--cmr-faint:rgba(232,227,216,.4);--cmr-rule:rgba(232,227,216,.14);--cmr-up:#8fb97a;--cmr-down:#c97865;--cmr-d:"Playfair Display",Georgia,serif;--cmr-b:"DM Sans",system-ui,sans-serif;--cmr-m:"JetBrains Mono",ui-monospace,monospace;}' +
    'body{margin:0;background:var(--cmr-bg);}' +
    '.cmr-loading{font-family:var(--cmr-b);color:var(--cmr-dim);text-align:center;padding:120px 20px;}' +
    '.cmr-loading a{color:var(--cmr-gold);}' +
    '.cmr-page{font-family:var(--cmr-b);color:var(--cmr-text);max-width:1080px;margin:0 auto;padding:0 clamp(18px,4vw,40px) 80px;}' +
    '.cmr-topbar{display:flex;align-items:center;justify-content:space-between;padding:20px 0;border-bottom:1px solid var(--cmr-rule);gap:16px;flex-wrap:wrap;}' +
    '.cmr-back{font-family:var(--cmr-d);font-style:italic;font-size:18px;color:var(--cmr-text);text-decoration:none;}' +
    '.cmr-back:hover{color:var(--cmr-gold);}' +
    '.cmr-gen{font-family:var(--cmr-m);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--cmr-faint);}' +
    '.cmr-hero{margin:34px 0 10px;}' +
    '.cmr-gallery{display:grid;grid-template-columns:2fr 1fr 1fr;grid-auto-rows:130px;gap:8px;border-radius:14px;overflow:hidden;margin-bottom:26px;}' +
    '.cmr-gallery .cmr-gphoto:first-child{grid-row:span 2;}' +
    '.cmr-gphoto{background-size:cover;background-position:center;}' +
    '.cmr-hero-neutral{height:180px;border-radius:14px;margin-bottom:26px;background:radial-gradient(circle at 20% 0%,rgba(212,165,116,.14),transparent 55%),radial-gradient(circle at 100% 100%,rgba(159,180,216,.12),transparent 55%),var(--cmr-card);border:1px solid var(--cmr-rule);}' +
    '.cmr-kicker{font-family:var(--cmr-m);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--cmr-gold);margin-bottom:10px;}' +
    '.cmr-title{font-family:var(--cmr-d);font-weight:500;font-size:clamp(34px,6vw,58px);line-height:1.02;margin:0 0 14px;}' +
    '.cmr-verdict{font-size:clamp(16px,2.2vw,20px);color:var(--cmr-dim);max-width:46ch;line-height:1.5;margin:0;}' +
    '.cmr-verdict b{color:var(--cmr-text);font-weight:500;}' +
    '.cmr-sec{margin-top:52px;}' +
    '.cmr-h2{font-family:var(--cmr-d);font-style:italic;font-weight:500;font-size:26px;margin:0 0 18px;}' +
    '.cmr-note{color:var(--cmr-dim);font-size:13px;margin:-8px 0 18px;}' +
    '.cmr-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}' +
    '@media(max-width:720px){.cmr-tiles{grid-template-columns:repeat(2,1fr);}}' +
    '.cmr-tile{background:var(--cmr-card);border:1px solid var(--cmr-rule);border-radius:12px;padding:20px;}' +
    '.cmr-tile-label{font-family:var(--cmr-m);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--cmr-faint);margin-bottom:10px;}' +
    '.cmr-tile-value{font-family:var(--cmr-d);font-style:italic;font-weight:500;font-size:clamp(24px,3vw,34px);color:var(--cmr-gold);line-height:1;}' +
    '.cmr-tile-sub{font-family:var(--cmr-m);font-size:10px;letter-spacing:.04em;color:var(--cmr-dim);margin-top:10px;}' +
    '.cmr-trend{font-family:var(--cmr-m);font-size:10px;letter-spacing:.04em;}' +
    '.cmr-trend-up{color:var(--cmr-up);}.cmr-trend-down{color:var(--cmr-down);}' +
    /* chart */
    '.cmr-chart-wrap{background:var(--cmr-card);border:1px solid var(--cmr-rule);border-radius:12px;padding:16px;overflow-x:auto;}' +
    '.cmr-chart{width:100%;height:auto;display:block;min-width:0;}' +
    '.cmr-chart circle{transition:r .12s ease,stroke-width .12s ease;cursor:default;}' +
    '.cmr-chart circle:hover{r:6;stroke-width:2;}' +
    /* recent sales cards */
    '.cmr-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;}' +
    '.cmr-sc{background:var(--cmr-card);border:1px solid var(--cmr-rule);border-radius:12px;padding:18px 20px;scroll-margin-top:24px;transition:border-color .3s,box-shadow .3s;}' +
    '.cmr-sc.cmr-flash{border-color:var(--cmr-gold);box-shadow:0 0 0 1px var(--cmr-gold),0 0 22px rgba(212,165,116,.25);}' +
    '.cmr-sc-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}' +
    '.cmr-sc-unit{font-family:var(--cmr-d);font-style:italic;font-weight:500;font-size:22px;color:var(--cmr-text);}' +
    '.cmr-sc-price{font-family:var(--cmr-d);font-style:italic;font-weight:600;font-size:20px;color:var(--cmr-gold);}' +
    '.cmr-sc-meta{font-family:var(--cmr-m);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--cmr-faint);margin:6px 0 12px;}' +
    '.cmr-sc-rows{border-top:1px solid var(--cmr-rule);}' +
    '.cmr-sc-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--cmr-rule);font-size:12.5px;color:var(--cmr-dim);}' +
    '.cmr-sc-row:last-child{border-bottom:none;}' +
    '.cmr-sc-row .v{color:var(--cmr-text);font-family:var(--cmr-m);font-size:12px;}' +
    /* dedicated photos */
    '.cmr-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}' +
    '.cmr-photo{margin:0;border-radius:10px;overflow:hidden;background:var(--cmr-card);border:1px solid var(--cmr-rule);}' +
    '.cmr-photo-img{aspect-ratio:4/3;background-size:cover;background-position:center;}' +
    '.cmr-photo-cap{font-family:var(--cmr-m);font-size:10px;letter-spacing:.04em;color:var(--cmr-dim);padding:8px 10px;border-top:1px solid var(--cmr-rule);}' +
    /* compare */
    '.cmr-cmp{background:var(--cmr-card);border:1px solid var(--cmr-rule);border-radius:12px;overflow:hidden;}' +
    '.cmr-cmp-row{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:14px;align-items:center;padding:18px 22px;border-bottom:1px solid var(--cmr-rule);}' +
    '.cmr-cmp-row:last-child{border-bottom:none;}' +
    '@media(max-width:600px){.cmr-cmp-row{grid-template-columns:1fr auto;row-gap:6px;}.cmr-cmp-prem{grid-column:2;text-align:right;}}' +
    '.cmr-cmp-label{font-size:15px;color:var(--cmr-text);display:flex;flex-direction:column;gap:4px;}' +
    '.cmr-cmp-scope{font-family:var(--cmr-m);font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--cmr-faint);}' +
    '.cmr-cmp-ppsf{font-family:var(--cmr-d);font-style:italic;font-size:20px;color:var(--cmr-text);}' +
    '.cmr-cmp-ppsf span{font-family:var(--cmr-m);font-style:normal;font-size:9px;letter-spacing:.04em;color:var(--cmr-faint);margin-left:4px;}' +
    '.cmr-cmp-prem{text-align:right;display:flex;flex-direction:column;gap:3px;align-items:flex-end;}' +
    '.cmr-prem{font-family:var(--cmr-d);font-style:italic;font-weight:600;font-size:22px;}' +
    '.cmr-prem-up{color:var(--cmr-up);}.cmr-prem-down{color:var(--cmr-down);}' +
    '.cmr-cmp-premlab{font-family:var(--cmr-m);font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--cmr-faint);}' +
    '.cmr-cmp-na{color:var(--cmr-faint);font-family:var(--cmr-d);font-style:italic;font-size:20px;}' +
    /* surroundings */
    '.cmr-map{width:100%;height:380px;border-radius:12px;border:1px solid var(--cmr-rule);background:var(--cmr-card);margin-bottom:18px;position:relative;z-index:0;}' +
    '@media(max-width:600px){.cmr-map{height:280px;}}' +
    '.cmr-pin{display:block;border-radius:50%;box-shadow:0 0 0 2px rgba(15,19,29,0.92);}' +
    '.cmr-pin-gold{width:22px;height:22px;background:#d4a574;box-shadow:0 0 0 3px rgba(15,19,29,0.92),0 0 14px rgba(212,165,116,0.55);}' +
    '.cmr-pin-ivory{width:14px;height:14px;background:#e8e3d8;}' +
    '.leaflet-tooltip{background:#1a1f2e;border:1px solid rgba(232,227,216,.16);color:#e8e3d8;font-family:"DM Sans",system-ui,sans-serif;font-size:12px;padding:8px 10px;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.45);}' +
    '.leaflet-tooltip-top:before{border-top-color:#1a1f2e;}' +
    '.cmr-nbr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;}' +
    '.cmr-nbr-card{background:var(--cmr-card);border:1px solid var(--cmr-rule);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s;position:relative;}' +
    '.cmr-nbr-card:hover{border-color:var(--cmr-gold);transform:translateY(-2px);}' +
    '.cmr-nbr-img{aspect-ratio:4/3;background-size:cover;background-position:center;background-color:#0f131d;}' +
    '.cmr-nbr-noimg{background:radial-gradient(circle at 30% 30%,rgba(212,165,116,.10),transparent 60%),radial-gradient(circle at 80% 80%,rgba(159,180,216,.08),transparent 60%),#1a1f2e;}' +
    '.cmr-nbr-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px;flex:1;}' +
    '.cmr-nbr-name{font-family:var(--cmr-d);font-style:italic;font-weight:500;font-size:18px;color:var(--cmr-text);line-height:1.15;}' +
    '.cmr-nbr-meta{font-family:var(--cmr-m);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--cmr-faint);}' +
    '.cmr-nbr-ppsf{font-family:var(--cmr-d);font-style:italic;font-weight:500;font-size:22px;color:var(--cmr-gold);margin-top:auto;}' +
    '.cmr-nbr-ppsf span{font-family:var(--cmr-m);font-style:normal;font-size:9px;letter-spacing:.04em;color:var(--cmr-faint);display:block;margin-top:2px;text-transform:uppercase;}' +
    '.cmr-nbr-noppsf{color:var(--cmr-faint);}' +
    '.cmr-nbr-dist{position:absolute;top:10px;right:10px;background:rgba(15,19,29,0.78);backdrop-filter:blur(6px);font-family:var(--cmr-m);font-size:10px;letter-spacing:.04em;color:var(--cmr-text);padding:4px 8px;border-radius:999px;}' +
    /* offer */
    '.cmr-offer{margin-top:56px;background:linear-gradient(135deg,rgba(212,165,116,.16),rgba(212,165,116,.04));border:1px solid var(--cmr-gold);border-radius:16px;padding:36px clamp(22px,4vw,44px);text-align:center;}' +
    '.cmr-offer-eyebrow{font-family:var(--cmr-m);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--cmr-gold);margin-bottom:12px;}' +
    '.cmr-offer-headline{font-family:var(--cmr-d);font-style:italic;font-weight:500;font-size:clamp(24px,3.4vw,34px);margin-bottom:12px;}' +
    '.cmr-offer-sub{color:var(--cmr-dim);max-width:52ch;margin:0 auto 22px;line-height:1.55;font-size:15px;}' +
    '.cmr-offer-cta{display:inline-block;background:var(--cmr-gold);color:#1a1f2e;font-weight:600;text-decoration:none;border-radius:10px;padding:14px 30px;font-size:15px;}' +
    '.cmr-offer-cta:hover{opacity:.9;}' +
    '.cmr-foot{margin-top:48px;padding-top:22px;border-top:1px solid var(--cmr-rule);font-size:11px;line-height:1.6;color:var(--cmr-faint);text-align:center;}';
    var st = document.createElement('style'); st.id = 'cmr-css'; st.textContent = css;
    document.head.appendChild(st);
  }
})();
