  /* CARTO watermarks unkeyed raster tiles. The worker injects
     <meta name="carto-key"> into every HTML page; no key means an unkeyed
     URL, which still renders - watermarked, never broken. */
  function cmCartoTiles(style) {
    var m = document.querySelector('meta[name="carto-key"]');
    var k = (m && m.content && m.content.indexOf('__') !== 0) ? m.content : '';
    return 'https://{s}.basemaps.cartocdn.com/' + style + '/{z}/{x}/{y}{r}.png' + (k ? '?key=' + encodeURIComponent(k) : '');
  }
/* =============================================================================
 * cm-market.js — Market analysis section for the building page (v2)
 *
 * v2 (2026-05-29) — three fixes from production review:
 *   1. Hero image rendering bug: the prior version built
 *        style="background-image:url("https://...")"
 *      with double-quotes inside double-quotes, which collapsed the style
 *      attribute. Fixed by single-quoting the URL inside the CSS url() call.
 *   2. Surroundings line color clash with the worker's market color-swap
 *      (#9fb4d8 → market accent). Changed to a stable #6b8aa8 the worker
 *      does not target.
 *   3. Map tooltips upgraded from text-only to rich HTML: image, name,
 *      units · year, $/ft² (or "No recent sales").
 *
 * Plus a chart redesign for non-expert readers:
 *   - Plain-English title and subtitle, no jargon
 *   - 3-card callout strip above the chart with each tier's 12-mo median
 *     $/ft², YoY trend, and sales count
 *   - Plain-English summary sentence below the chart that names the
 *     current-quarter values and the premium/discount in words
 *
 * Mounts into #cm-market-root inside the worker-rendered #market section.
 * Data source: building_market_report RPC.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__CM_MARKET__) return;
  window.__CM_MARKET__ = true;

  var SUPABASE_URL  = 'https://kfqphwerygccpzntbbif.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

  /* Stable colors (NOT subject to worker color-swap):
       SUR_COLOR    : surroundings line (½-mile)
       MKT_COLOR    : citywide market line (kept ivory-faint)
     Subject building uses #d4a574 (bronze) which the worker DOES swap to
     market accent — that's intentional, the subject takes on the brand. */
  var SUR_COLOR = '#6b8aa8';
  var MKT_COLOR = 'rgba(232,227,216,0.5)';

  var pathMatch = location.pathname.match(/^\/building\/([^\/]+)/);
  if (!pathMatch) return;
  var SLUG = decodeURIComponent(pathMatch[1]).trim().toLowerCase();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function boot() {
    var mount = document.getElementById('cm-market-root');
    if (!mount) return;
    injectCSS();
    mount.innerHTML = '<div class="cmk-loading">Loading the market analysis\u2026</div>';
    rpc('building_market_report', { p_building_slug: SLUG, p_radius_mi: 0.5 })
      .then(function (d) {
        if (!d || !d.building) { mount.innerHTML = ''; return; }
        render(mount, d);
        if (d.surrounding_buildings && d.surrounding_buildings.length) {
          setTimeout(function () { initMap(d.building, d.surrounding_buildings); }, 60);
        }
      })
      .catch(function (e) { console.warn('[cm-market]', e); mount.innerHTML = ''; });
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
  /* v2: URL-safe for CSS url(...). Single-quote-wraps and percent-encodes
     any embedded single quote so it survives the inline style attribute. */
  function cssUrl(u) {
    if (!u) return '';
    return "url('" + String(u).replace(/'/g, '%27') + "')";
  }
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
  function pctMag(n) { if (n == null || isNaN(n)) return ''; return Math.abs(n).toFixed(1).replace(/\.0$/, ''); }
  function pctStr(n) { if (n == null || isNaN(n)) return ''; var a = Math.abs(n).toFixed(1).replace(/\.0$/, ''); return (n >= 0 ? '+' : '\u2212') + a + '%'; }
  function pluralS(n, base) { return num(n) + ' ' + base + (Number(n) === 1 ? '' : 's'); }

  /* ---- narrative --------------------------------------------------------- */
  function buildNarrative(d) {
    var b = d.building || {};
    var tb = (d.tiers && d.tiers.building) || {};
    var ts = (d.tiers && d.tiers.surrounding) || {};
    var tc = (d.tiers && d.tiers.sf) || {};
    var prem = d.premiums || {};
    var name = b.name || 'This building';
    var paragraphs = [];

    var p1;
    if (tb.n_12mo > 0 && tb.median_ppsf_12mo != null) {
      p1 = '<p>' + esc(name) + ' has recorded <b>' + pluralS(tb.n_12mo, 'sale') + '</b> over the trailing 12 months at a median of <b>' + ppsf(tb.median_ppsf_12mo) + '/ft\u00b2</b>';
      if (tb.median_price_12mo) p1 += ' (median sale price <b>' + money(tb.median_price_12mo) + '</b>)';
      p1 += '. ';
      if (ts.median_ppsf_12mo != null && prem.vs_surrounding_pct != null && ts.n_12mo > 0) {
        var dir1 = prem.vs_surrounding_pct >= 0 ? 'premium' : 'discount';
        p1 += 'Surrounding buildings within a half-mile radius \u2014 <b>' + pluralS(ts.building_count, 'building') + '</b> producing <b>' + pluralS(ts.n_12mo, 'sale') + '</b> at a median of <b>' + ppsf(ts.median_ppsf_12mo) + '/ft\u00b2</b> over the same period \u2014 collectively place ' + esc(name) + ' at a <b>' + pctMag(prem.vs_surrounding_pct) + '% ' + dir1 + '</b> to its immediate neighbors.';
      } else {
        p1 += 'Sales within a half-mile are too sparse this period to anchor a confident comparison.';
      }
      p1 += '</p>';
    } else {
      p1 = '<p>' + esc(name) + ' has not recorded a qualifying sale in the trailing 12 months.';
      if (ts.median_ppsf_12mo != null && ts.n_12mo > 0) {
        p1 += ' Surrounding buildings within a half-mile show a median of <b>' + ppsf(ts.median_ppsf_12mo) + '/ft\u00b2</b> across <b>' + pluralS(ts.building_count, 'building') + '</b> and <b>' + pluralS(ts.n_12mo, 'sale') + '</b> \u2014 useful baseline context for where ' + esc(name) + ' would price today.';
      }
      p1 += '</p>';
    }
    paragraphs.push(p1);

    if (tc.median_ppsf_12mo != null && prem.vs_sf_pct != null && tc.n_12mo > 0) {
      var p2 = '<p>Across the broader market \u2014 <b>' + pluralS(tc.building_count, 'tracked building') + '</b>, <b>' + pluralS(tc.n_12mo, 'sale') + '</b> over the past 12 months, a citywide median of <b>' + ppsf(tc.median_ppsf_12mo) + '/ft\u00b2</b>';
      if (tc.volume_12mo) p2 += ' across <b>' + moneyShort(tc.volume_12mo) + '</b> in volume';
      p2 += ' \u2014 ' + esc(name) + ' sits at a <b>' + pctMag(prem.vs_sf_pct) + '% ' + (prem.vs_sf_pct >= 0 ? 'premium' : 'discount') + '</b>';
      if (tb.trend_ppsf_pct != null && tc.trend_ppsf_pct != null) {
        var bD = tb.trend_ppsf_pct >= 0 ? 'up' : 'down';
        var cD = tc.trend_ppsf_pct >= 0 ? 'up' : 'down';
        p2 += ', a margin shaped by the building\u2019s $/ft\u00b2 moving <b>' + bD + ' ' + pctMag(tb.trend_ppsf_pct) + '%</b> year-over-year while the citywide median moved <b>' + cD + ' ' + pctMag(tc.trend_ppsf_pct) + '%</b> over the same window';
      }
      p2 += '.</p>';
      paragraphs.push(p2);
    }

    if (Array.isArray(d.quarterly_series) && d.quarterly_series.length >= 1) {
      var lastQ = d.quarterly_series[d.quarterly_series.length - 1];
      if (lastQ && lastQ.n_sales) {
        var p3 = '<p>Most recent quarter (<b>' + esc(lastQ.label) + '</b>) saw <b>' + pluralS(lastQ.n_sales, 'sale') + '</b> at a median of <b>' + ppsf(lastQ.median_ppsf) + '/ft\u00b2</b>';
        if (lastQ.median_price) p3 += ' and a median sale price of <b>' + money(lastQ.median_price) + '</b>';
        p3 += '.';
        if (d.quarterly_series.length >= 2) {
          var priorQ = d.quarterly_series[d.quarterly_series.length - 2];
          if (priorQ && priorQ.median_ppsf && lastQ.median_ppsf) {
            var qMove = ((lastQ.median_ppsf - priorQ.median_ppsf) / priorQ.median_ppsf) * 100;
            if (Math.abs(qMove) >= 0.5) {
              var qDir = qMove >= 0 ? 'up' : 'down';
              p3 += ' That\u2019s <b>' + qDir + ' ' + pctMag(qMove) + '%</b> from ' + esc(priorQ.label) + ' (' + ppsf(priorQ.median_ppsf) + '/ft\u00b2).';
            }
          }
        }
        p3 += '</p>';
        paragraphs.push(p3);
      }
    }

    return paragraphs.join('');
  }

  /* ---- chart callout strip (above chart) --------------------------------- */
  function callouts(d, name) {
    var tb = (d.tiers && d.tiers.building) || {};
    var ts = (d.tiers && d.tiers.surrounding) || {};
    var tc = (d.tiers && d.tiers.sf) || {};

    function card(label, accent, ppsfVal, trend, salesN, salesNoun) {
      var trendEl = '';
      if (trend != null && !isNaN(trend) && Math.abs(trend) >= 0.5) {
        var dir = trend >= 0 ? 'up' : 'down';
        trendEl = '<span class="cmk-cal-trend cmk-cal-' + dir + '">' + (trend >= 0 ? '\u2191' : '\u2193') + ' ' + pctMag(trend) + '% YoY</span>';
      } else if (trend != null) {
        trendEl = '<span class="cmk-cal-trend cmk-cal-flat">\u2192 flat YoY</span>';
      }
      var ppsfEl = ppsfVal != null
        ? '<div class="cmk-cal-num">' + ppsf(ppsfVal) + '<span class="cmk-cal-unit">/ft\u00b2</span></div>'
        : '<div class="cmk-cal-num cmk-cal-empty">No recent sales</div>';
      var salesEl = (salesN != null && salesN > 0)
        ? '<div class="cmk-cal-sub">' + num(salesN) + ' ' + salesNoun + ' \u00b7 last 12 months</div>'
        : '<div class="cmk-cal-sub">\u2014</div>';
      return '<div class="cmk-cal-card" style="--cmk-cal-accent:' + accent + ';">' +
        '<div class="cmk-cal-head"><span class="cmk-cal-swatch"></span>' + esc(label) + '</div>' +
        ppsfEl + trendEl + salesEl +
      '</div>';
    }

    return '<div class="cmk-cal-strip">' +
      card(name,                       '#d4a574', tb.median_ppsf_12mo, tb.trend_ppsf_pct, tb.n_12mo, 'sale here') +
      card('Nearby blocks (\u00bd mi)', SUR_COLOR, ts.median_ppsf_12mo, ts.trend_ppsf_pct, ts.n_12mo, 'sales nearby') +
      card('All SF condos',             '#a8a39a', tc.median_ppsf_12mo, tc.trend_ppsf_pct, tc.n_12mo, 'sales citywide') +
    '</div>';
  }

  /* ---- chart summary sentence (below chart) ----------------------------- */
  function chartSummary(d, name) {
    var tb = (d.tiers && d.tiers.building) || {};
    var ts = (d.tiers && d.tiers.surrounding) || {};
    var tc = (d.tiers && d.tiers.sf) || {};
    var prem = d.premiums || {};

    var self = (d.quarterly_series      || []).filter(function (q) { return q && q.median_ppsf != null; });
    var sur  = (d.quarterly_surrounding || []).filter(function (q) { return q && q.median_ppsf != null; });
    var mkt  = (d.quarterly_market      || []).filter(function (q) { return q && q.median_ppsf != null; });

    if (!self.length && !sur.length && !mkt.length) return '';

    var lastQ = self.length ? self[self.length - 1]
              : sur.length  ? sur[sur.length - 1]
              : mkt[mkt.length - 1];
    var qLabel = lastQ ? lastQ.label : '';

    // What did each tier do in that last shared quarter?
    var selfLast = self.length ? self[self.length - 1] : null;
    var surLast  = sur.length  ? sur[sur.length - 1]  : null;
    var mktLast  = mkt.length  ? mkt[mkt.length - 1]  : null;

    var bits = [];
    if (selfLast) bits.push('<b>' + ppsf(selfLast.median_ppsf) + '/ft\u00b2</b> at ' + esc(name) + ' (' + esc(selfLast.label) + ')');
    if (surLast)  bits.push('<b>' + ppsf(surLast.median_ppsf)  + '/ft\u00b2</b> in the surrounding ' + (sur.length ? 'half-mile' : 'half-mile') + ' (' + esc(surLast.label) + ')');
    if (mktLast)  bits.push('<b>' + ppsf(mktLast.median_ppsf)  + '/ft\u00b2</b> citywide (' + esc(mktLast.label) + ')');
    var line1 = '<p>Most recent quarters on record: ' + bits.join(' \u00b7 ') + '.</p>';

    var line2 = '';
    if (tb.median_ppsf_12mo != null && tc.median_ppsf_12mo != null && prem.vs_sf_pct != null) {
      var dir = prem.vs_sf_pct >= 0 ? 'more' : 'less';
      line2 = '<p>Over the last 12 months, ' + esc(name) + ' has sold for <b>' + pctMag(prem.vs_sf_pct) + '% ' + dir + '</b> per square foot than the average SF condo we track' +
              (ts.median_ppsf_12mo != null && prem.vs_surrounding_pct != null
                ? ', and <b>' + pctMag(prem.vs_surrounding_pct) + '% ' + (prem.vs_surrounding_pct >= 0 ? 'more' : 'less') + '</b> than its immediate neighbors.'
                : '.') +
              '</p>';
    } else if (tc.median_ppsf_12mo != null) {
      line2 = '<p>' + esc(name) + ' has no recorded sales in the last 12 months, so we can\u2019t compare it directly. Use the citywide and nearby lines as price-discovery context.</p>';
    }

    return '<div class="cmk-chart-summary">' + line1 + line2 + '</div>';
  }

  /* ---- 3-line overlay quarterly chart ------------------------------------ */
  function buildQuarterlyChart(d, buildingName) {
    var self = (d.quarterly_series      || []).filter(function (q) { return q && q.median_ppsf != null; });
    var sur  = (d.quarterly_surrounding || []).filter(function (q) { return q && q.median_ppsf != null; });
    var mkt  = (d.quarterly_market      || []).filter(function (q) { return q && q.median_ppsf != null; });

    var seriesList = [];
    if (self.length >= 2) seriesList.push({ key: 'self', name: buildingName,                color: '#d4a574', width: 2.0, dots: true,  pts: self, areaFill: 'rgba(212,165,116,0.12)' });
    if (sur.length  >= 2) seriesList.push({ key: 'sur',  name: 'Nearby blocks (\u00bd mi)',  color: SUR_COLOR, width: 1.4, dots: false, pts: sur,  areaFill: null });
    if (mkt.length  >= 2) seriesList.push({ key: 'mkt',  name: 'All SF condos',              color: MKT_COLOR, width: 1.2, dots: false, pts: mkt,  areaFill: null, dashed: true });
    if (!seriesList.length) return '';

    var qSet = {};
    seriesList.forEach(function (s) { s.pts.forEach(function (q) { qSet[q.quarter_start] = true; }); });
    var quarters = Object.keys(qSet).sort();
    if (quarters.length < 2) return '';

    var qIdx = {}; quarters.forEach(function (q, i) { qIdx[q] = i; });
    seriesList.forEach(function (s) {
      var byQ = {}; s.pts.forEach(function (p) { byQ[p.quarter_start] = p; }); s.byQ = byQ;
    });
    var qLabel = {}; seriesList.forEach(function (s) { s.pts.forEach(function (p) { qLabel[p.quarter_start] = p.label; }); });

    var W = 760, H = 300, PAD_L = 64, PAD_R = 24, PAD_T = 24, PAD_B = 50;
    var plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

    var minP = Infinity, maxP = -Infinity;
    seriesList.forEach(function (s) {
      s.pts.forEach(function (p) {
        if (p.median_ppsf < minP) minP = p.median_ppsf;
        if (p.median_ppsf > maxP) maxP = p.median_ppsf;
      });
    });
    var rng = Math.max(50, maxP - minP);
    var pad = rng * 0.12;
    var yMin = Math.max(0, Math.floor((minP - pad) / 100) * 100);
    var yMax = Math.ceil((maxP + pad) / 100) * 100;
    if (yMax === yMin) yMax = yMin + 100;

    function xPos(qStart) { return PAD_L + (qIdx[qStart] / Math.max(1, quarters.length - 1)) * plotW; }
    function yPos(p) { return PAD_T + (1 - (p - yMin) / (yMax - yMin)) * plotH; }

    var ySteps = 4, yMarkup = '';
    for (var i = 0; i <= ySteps; i++) {
      var v = yMin + (yMax - yMin) * (i / ySteps);
      var y = yPos(v);
      yMarkup += '<line x1="' + PAD_L + '" y1="' + y.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + y.toFixed(1) + '" stroke="rgba(232,227,216,0.07)"/>';
      yMarkup += '<text x="' + (PAD_L - 8) + '" y="' + (y + 3.5).toFixed(1) + '" fill="rgba(232,227,216,0.5)" font-size="10" font-family="JetBrains Mono, ui-monospace, monospace" text-anchor="end">$' + Math.round(v).toLocaleString() + '</text>';
    }

    var labelStep = quarters.length > 12 ? 3 : quarters.length > 8 ? 2 : 1;
    var xMarkup = '';
    for (var j = 0; j < quarters.length; j++) {
      var qq = quarters[j];
      var x = xPos(qq);
      xMarkup += '<line x1="' + x.toFixed(1) + '" y1="' + (H - PAD_B) + '" x2="' + x.toFixed(1) + '" y2="' + (H - PAD_B + 4) + '" stroke="rgba(232,227,216,0.3)"/>';
      if (j % labelStep === 0 || j === quarters.length - 1) {
        xMarkup += '<text x="' + x.toFixed(1) + '" y="' + (H - PAD_B + 18) + '" fill="rgba(232,227,216,0.55)" font-size="10" font-family="JetBrains Mono, ui-monospace, monospace" text-anchor="middle">' + esc(qLabel[qq] || '') + '</text>';
      }
    }

    function buildPath(s) {
      var openSeg = false, d = '';
      for (var k = 0; k < quarters.length; k++) {
        var qq = quarters[k];
        var p = s.byQ[qq];
        if (p) {
          var px = xPos(qq).toFixed(1), py = yPos(p.median_ppsf).toFixed(1);
          d += (openSeg ? ' L ' : 'M ') + px + ' ' + py;
          openSeg = true;
        } else {
          openSeg = false;
        }
      }
      return d;
    }

    var areaMarkup = '';
    var selfSeries = seriesList.filter(function (s) { return s.key === 'self'; })[0];
    if (selfSeries && selfSeries.areaFill && selfSeries.pts.length >= 2) {
      var pts = selfSeries.pts;
      var fp = 'M ' + xPos(pts[0].quarter_start).toFixed(1) + ' ' + (H - PAD_B);
      pts.forEach(function (p) { fp += ' L ' + xPos(p.quarter_start).toFixed(1) + ' ' + yPos(p.median_ppsf).toFixed(1); });
      fp += ' L ' + xPos(pts[pts.length - 1].quarter_start).toFixed(1) + ' ' + (H - PAD_B) + ' Z';
      areaMarkup = '<path d="' + fp + '" fill="' + selfSeries.areaFill + '" stroke="none"/>';
    }

    var lineOrder = ['mkt', 'sur', 'self'];
    var linesMarkup = '';
    lineOrder.forEach(function (key) {
      var s = seriesList.filter(function (x) { return x.key === key; })[0];
      if (!s) return;
      var dash = s.dashed ? ' stroke-dasharray="4,4"' : '';
      linesMarkup += '<path d="' + buildPath(s) + '" stroke="' + s.color + '" stroke-width="' + s.width + '" fill="none" stroke-linecap="round" stroke-linejoin="round"' + dash + '/>';
    });

    var dotsMarkup = '';
    if (selfSeries) {
      selfSeries.pts.forEach(function (p) {
        var x = xPos(p.quarter_start), y = yPos(p.median_ppsf);
        var title = p.label + ' \u00b7 ' + pluralS(p.n_sales, 'sale') + ' \u00b7 ' + ppsf(p.median_ppsf) + '/ft\u00b2 \u00b7 median ' + money(p.median_price);
        dotsMarkup += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" fill="' + selfSeries.color + '" stroke="rgba(15,19,29,0.95)" stroke-width="2"><title>' + esc(title) + '</title></circle>';
      });
    }

    var legendMarkup = '<div class="cmk-chart-legend">' + seriesList.map(function (s) {
      return '<span class="cmk-legend-item"><span class="cmk-legend-swatch" style="background:' + s.color + ';' + (s.dashed ? 'background-image:linear-gradient(90deg,' + s.color + ' 50%,transparent 50%);background-size:6px 100%;' : '') + '"></span>' + esc(s.name) + '</span>';
    }).join('') + '</div>';

    return '<div class="cmk-chart-wrap">' + legendMarkup +
      '<svg class="cmk-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Median price per square foot, by quarter, across three tiers">' +
      yMarkup + xMarkup + areaMarkup + linesMarkup + dotsMarkup +
      '<text x="' + (PAD_L - 8) + '" y="' + (PAD_T - 8) + '" fill="rgba(232,227,216,0.55)" font-size="10" font-family="JetBrains Mono, ui-monospace, monospace" text-anchor="end">$/ft\u00b2</text>' +
      '</svg></div>';
  }

  /* ---- tier comparison rows ---------------------------------------------- */
  function compareRow(label, tier, premium) {
    if (!tier) return '';
    var prem = '';
    if (premium != null && !isNaN(premium)) {
      var dir = premium >= 0 ? 'up' : 'down';
      prem = '<span class="cmk-prem cmk-prem-' + dir + '">' + pctStr(premium) + '</span>';
    }
    var scope = tier.building_count != null ? (num(tier.building_count) + ' bldgs \u00b7 ' + num(tier.n_12mo) + ' sales') : (num(tier.n_12mo) + ' sales');
    return '<div class="cmk-cmp-row">' +
      '<div class="cmk-cmp-label">' + esc(label) + '<span class="cmk-cmp-scope">' + scope + '</span></div>' +
      '<div class="cmk-cmp-ppsf">' + ppsf(tier.median_ppsf_12mo) + '<span>/ft\u00b2 median</span></div>' +
      '<div class="cmk-cmp-prem">' + (prem || '<span class="cmk-cmp-na">\u2014</span>') + '<span class="cmk-cmp-premlab">this building</span></div>' +
      '</div>';
  }

  function buildTierComparison(d) {
    var b = d.building || {};
    var hood = b.neighborhood;
    var prem = d.premiums || {};
    var rows =
      compareRow('Immediate surroundings (\u00bd mi)', d.tiers && d.tiers.surrounding, prem.vs_surrounding_pct) +
      compareRow(hood || 'Neighborhood', d.tiers && d.tiers.neighborhood, prem.vs_neighborhood_pct) +
      compareRow('Citywide', d.tiers && d.tiers.sf, prem.vs_sf_pct);
    if (!rows.trim()) return '';
    return '<div class="cmk-cmp">' + rows + '</div>';
  }

  /* ---- surroundings (map placeholder + cards) ---------------------------- */
  // v2 FIX: cssUrl() single-quote-wraps the URL inside CSS url() so the outer
  // double-quoted style attribute survives. Previously JSON.stringify wrapped
  // it in double quotes which collapsed the attribute and showed empty cards.
  function buildSurroundings(b, surroundings) {
    if (!b || !b.has_geo || !Array.isArray(surroundings) || !surroundings.length) return '';
    var cards = surroundings.map(function (s) {
      var img = s.hero_image_url
        ? '<div class="cmk-nbr-img" style="background-image:' + cssUrl(s.hero_image_url) + '" role="img" aria-label="' + esc(s.display_name) + '"></div>'
        : '<div class="cmk-nbr-img cmk-nbr-noimg" aria-hidden="true"></div>';
      var meta = [];
      if (s.unit_count) meta.push(num(s.unit_count) + ' units');
      if (s.year_built) meta.push(s.year_built);
      var ppsfBlock = s.ppsf_12mo_median
        ? '<div class="cmk-nbr-ppsf">' + ppsf(s.ppsf_12mo_median) + '<span>/ft\u00b2 \u00b7 ' + num(s.sales_12mo || 0) + ' sales</span></div>'
        : '<div class="cmk-nbr-ppsf cmk-nbr-noppsf">\u2014<span>no recorded sales (12 mo)</span></div>';
      var distMi = (Number(s.distance_mi) || 0).toFixed(2).replace(/\.00$/, '.0');
      return '<a class="cmk-nbr-card" href="' + esc(s.report_url) + '">' +
        img +
        '<div class="cmk-nbr-body">' +
          '<div class="cmk-nbr-name">' + esc(s.display_name) + '</div>' +
          '<div class="cmk-nbr-meta">' + esc(meta.join(' \u00b7 ')) + '</div>' +
          ppsfBlock +
          '<div class="cmk-nbr-dist">' + distMi + ' mi</div>' +
        '</div></a>';
    }).join('');
    return '<div class="cmk-map" id="cmk-map"></div>' +
      '<div class="cmk-nbr-grid">' + cards + '</div>';
  }

  /* ---- Leaflet init ------------------------------------------------------ */
  // v2: rich tooltip with hero image, units, year, $/ft² (or "no recent sales").
  function initMap(b, surroundings) {
    var el = document.getElementById('cmk-map');
    if (!el || !b || b.lat == null || b.lng == null) return;
    if (el.dataset.cmkMapInit === '1') return;
    el.dataset.cmkMapInit = '1';

    function once(tag, attrs) {
      return new Promise(function (resolve, reject) {
        var existing = document.querySelector(tag + '[data-cmk-leaflet]');
        if (existing) {
          if (existing.sheet || existing.readyState === 'complete' || tag === 'link') { resolve(); return; }
          existing.addEventListener('load', resolve, { once: true });
          return;
        }
        var node = document.createElement(tag);
        node.setAttribute('data-cmk-leaflet', '');
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
      L.tileLayer(cmCartoTiles('dark_nolabels'), { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
      L.tileLayer(cmCartoTiles('dark_only_labels'), { subdomains: 'abcd', maxZoom: 19 }).addTo(map);

      var subjIcon = L.divIcon({ className: 'cmk-pin-subject', html: '<span class="cmk-pin cmk-pin-gold"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
      L.marker([b.lat, b.lng], { icon: subjIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip(
          '<div class="cmk-mt"><div class="cmk-mt-body">' +
            '<div class="cmk-mt-name">' + esc(b.name || '') + '</div>' +
            '<div class="cmk-mt-tag">This building</div>' +
          '</div></div>',
          { direction: 'top', offset: [0, -12], className: 'cmk-rich-tt' }
        );

      var bounds = L.latLngBounds([[b.lat, b.lng]]);
      surroundings.forEach(function (s) {
        if (s.lat == null || s.lng == null) return;
        var icon = L.divIcon({ className: 'cmk-pin-other', html: '<span class="cmk-pin cmk-pin-ivory"></span>', iconSize: [14, 14], iconAnchor: [7, 7] });

        // Rich tooltip: image + name + units · year + $/ft² (or no-sales line)
        var imgPart = s.hero_image_url
          ? '<div class="cmk-mt-img" style="background-image:' + cssUrl(s.hero_image_url) + '"></div>'
          : '<div class="cmk-mt-img cmk-mt-img-empty" aria-hidden="true"></div>';
        var metaParts = [];
        if (s.unit_count) metaParts.push(num(s.unit_count) + ' units');
        if (s.year_built) metaParts.push(s.year_built);
        var metaPart = metaParts.length
          ? '<div class="cmk-mt-meta">' + esc(metaParts.join(' \u00b7 ')) + '</div>'
          : '';
        var ppsfPart = s.ppsf_12mo_median
          ? '<div class="cmk-mt-ppsf">' + ppsf(s.ppsf_12mo_median) + '<span>/ft\u00b2 \u00b7 ' + num(s.sales_12mo || 0) + ' sales (12mo)</span></div>'
          : '<div class="cmk-mt-ppsf cmk-mt-ppsf-empty">No recent sales</div>';
        var tooltipHtml =
          '<div class="cmk-mt">' +
            imgPart +
            '<div class="cmk-mt-body">' +
              '<div class="cmk-mt-name">' + esc(s.display_name) + '</div>' +
              metaPart +
              ppsfPart +
            '</div>' +
          '</div>';

        var marker = L.marker([s.lat, s.lng], { icon: icon })
          .addTo(map)
          .bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -10], className: 'cmk-rich-tt' });
        marker.on('click', function () { window.location.href = s.report_url; });
        bounds.extend([s.lat, s.lng]);
      });
      map.fitBounds(bounds, { padding: [40, 40] });
    }).catch(function () { /* leave map empty; cards still work */ });
  }

  /* ---- render ------------------------------------------------------------ */
  function render(host, d) {
    var b = d.building || {};
    var name = esc(b.name || 'This building');
    var narrative = buildNarrative(d);
    var calStrip = callouts(d, name);
    var chart = buildQuarterlyChart(d, name);
    var summary = chartSummary(d, name);
    var tiers = buildTierComparison(d);
    var surroundings = buildSurroundings(b, d.surrounding_buildings);

    var html = '';
    if (narrative) html += '<div class="cmk-narrative">' + narrative + '</div>';

    if (chart || calStrip) {
      html += '<div class="cmk-block">' +
        '<h3 class="cmk-h3">Price per square foot, by quarter</h3>' +
        '<p class="cmk-note">How much homes sell for per square foot, tracked over time. The gold line is ' + name + ', the blue line is the half-mile area around it, and the faint dashed line is every SF condo we track. A higher line means more expensive.</p>' +
        calStrip +
        chart +
        summary +
      '</div>';
    }

    if (tiers) {
      html += '<div class="cmk-block"><h3 class="cmk-h3">Tier comparison</h3>' +
              '<p class="cmk-note">Trailing-12-month medians across three concentric scopes \u2014 the half-mile surroundings, the full neighborhood, citywide.</p>' +
              tiers + '</div>';
    }
    if (surroundings) {
      html += '<div class="cmk-block"><h3 class="cmk-h3">The block</h3>' +
              '<p class="cmk-note">Nearby buildings within \u00bd mile of ' + name + '. Tap any pin or card for its full detail page.</p>' +
              surroundings + '</div>';
    }
    host.innerHTML = html || '';
  }

  /* ---- styles ------------------------------------------------------------ */
  function injectCSS() {
    if (document.getElementById('cmk-css')) return;
    var css =
    '.cmk-loading{font-family:"DM Sans",system-ui,sans-serif;color:rgba(232,227,216,.5);padding:48px 0;text-align:center;font-size:14px;}' +
    '.cmk-narrative{max-width:68ch;font-family:"DM Sans",system-ui,sans-serif;font-size:17px;line-height:1.65;color:var(--cm-ivory);margin-bottom:48px;}' +
    '.cmk-narrative p{margin:0 0 18px;}' +
    '.cmk-narrative p:last-child{margin-bottom:0;}' +
    '.cmk-narrative b{color:var(--cm-ivory);font-weight:500;}' +
    '.cmk-block{margin-top:42px;}' +
    '.cmk-h3{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:500;font-size:22px;color:var(--cm-ivory);margin:0 0 8px;}' +
    '.cmk-note{font-family:"DM Sans",system-ui,sans-serif;font-size:14px;color:var(--cm-ivory-dim);margin:0 0 18px;max-width:68ch;line-height:1.6;}' +
    /* callout strip */
    '.cmk-cal-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 18px;}' +
    '@media(max-width:600px){.cmk-cal-strip{grid-template-columns:1fr;}}' +
    '.cmk-cal-card{background:var(--cm-navy);border:1px solid var(--cm-rule);border-radius:10px;padding:14px 16px;position:relative;border-top:3px solid var(--cmk-cal-accent,#888);}' +
    '.cmk-cal-head{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:rgba(232,227,216,.6);display:flex;align-items:center;gap:7px;margin-bottom:8px;line-height:1.3;}' +
    '.cmk-cal-swatch{display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--cmk-cal-accent,#888);flex-shrink:0;}' +
    '.cmk-cal-num{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:600;font-size:26px;color:var(--cm-ivory);line-height:1.05;}' +
    '.cmk-cal-num.cmk-cal-empty{font-size:14px;font-style:italic;color:rgba(232,227,216,.5);font-weight:400;font-family:"DM Sans",system-ui,sans-serif;}' +
    '.cmk-cal-unit{font-family:"JetBrains Mono",ui-monospace,monospace;font-style:normal;font-weight:400;font-size:10px;letter-spacing:.04em;color:rgba(232,227,216,.5);margin-left:3px;}' +
    '.cmk-cal-trend{display:inline-block;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.02em;margin-top:6px;}' +
    '.cmk-cal-up{color:#8fb97a;}' +
    '.cmk-cal-down{color:#c97865;}' +
    '.cmk-cal-flat{color:rgba(232,227,216,.5);}' +
    '.cmk-cal-sub{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10px;color:rgba(232,227,216,.45);margin-top:4px;}' +
    /* chart */
    '.cmk-chart-wrap{background:var(--cm-navy);border:1px solid var(--cm-rule);border-radius:12px;padding:16px;overflow-x:auto;}' +
    '.cmk-chart-legend{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--cm-rule);}' +
    '.cmk-legend-item{display:inline-flex;align-items:center;gap:8px;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--cm-ivory-dim);}' +
    '.cmk-legend-swatch{display:inline-block;width:16px;height:3px;border-radius:1px;}' +
    '.cmk-chart{width:100%;height:auto;display:block;min-width:0;}' +
    '.cmk-chart circle{transition:r .12s ease,stroke-width .12s ease;cursor:default;}' +
    '.cmk-chart circle:hover{r:7;stroke-width:3;}' +
    '.cmk-chart-summary{margin-top:14px;font-family:"DM Sans",system-ui,sans-serif;font-size:14px;line-height:1.6;color:var(--cm-ivory-dim);max-width:68ch;}' +
    '.cmk-chart-summary p{margin:0 0 8px;}' +
    '.cmk-chart-summary p:last-child{margin-bottom:0;}' +
    '.cmk-chart-summary b{color:var(--cm-ivory);font-weight:500;}' +
    /* tier comparison */
    '.cmk-cmp{background:var(--cm-navy);border:1px solid var(--cm-rule);border-radius:12px;overflow:hidden;}' +
    '.cmk-cmp-row{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:14px;align-items:center;padding:18px 22px;border-bottom:1px solid var(--cm-rule);}' +
    '.cmk-cmp-row:last-child{border-bottom:none;}' +
    '@media(max-width:600px){.cmk-cmp-row{grid-template-columns:1fr auto;row-gap:6px;}.cmk-cmp-prem{grid-column:2;text-align:right;}}' +
    '.cmk-cmp-label{font-size:15px;color:var(--cm-ivory);display:flex;flex-direction:column;gap:4px;}' +
    '.cmk-cmp-scope{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:rgba(232,227,216,.45);}' +
    '.cmk-cmp-ppsf{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-size:20px;color:var(--cm-ivory);}' +
    '.cmk-cmp-ppsf span{font-family:"JetBrains Mono",ui-monospace,monospace;font-style:normal;font-size:9px;letter-spacing:.04em;color:rgba(232,227,216,.45);margin-left:4px;}' +
    '.cmk-cmp-prem{text-align:right;display:flex;flex-direction:column;gap:3px;align-items:flex-end;}' +
    '.cmk-prem{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:600;font-size:22px;}' +
    '.cmk-prem-up{color:#8fb97a;}.cmk-prem-down{color:#c97865;}' +
    '.cmk-cmp-premlab{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:rgba(232,227,216,.45);}' +
    '.cmk-cmp-na{color:rgba(232,227,216,.45);font-family:"Playfair Display",Georgia,serif;font-style:italic;font-size:20px;}' +
    /* map */
    '.cmk-map{width:100%;height:380px;border-radius:12px;border:1px solid var(--cm-rule);background:var(--cm-navy);margin-bottom:18px;position:relative;z-index:0;}' +
    '@media(max-width:600px){.cmk-map{height:280px;}}' +
    '.cmk-pin{display:block;border-radius:50%;box-shadow:0 0 0 2px rgba(15,19,29,0.92);}' +
    '.cmk-pin-gold{width:22px;height:22px;background:#d4a574;box-shadow:0 0 0 3px rgba(15,19,29,0.92),0 0 14px rgba(212,165,116,0.55);}' +
    '.cmk-pin-ivory{width:14px;height:14px;background:#e8e3d8;}' +
    /* rich tooltip — overrides default leaflet text styling */
    '.cmk-rich-tt{background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important;}' +
    '.cmk-rich-tt:before{display:none!important;}' +
    '.cmk-mt{background:#1a1f2e;border:1px solid rgba(232,227,216,.18);border-radius:10px;overflow:hidden;width:220px;box-shadow:0 8px 24px rgba(0,0,0,.5);font-family:"DM Sans",system-ui,sans-serif;}' +
    '.cmk-mt-img{aspect-ratio:16/9;background-size:cover;background-position:center;background-color:#0f131d;}' +
    '.cmk-mt-img-empty{background:radial-gradient(circle at 30% 30%,rgba(212,165,116,.10),transparent 60%),radial-gradient(circle at 80% 80%,rgba(159,180,216,.08),transparent 60%),#1a1f2e;}' +
    '.cmk-mt-body{padding:10px 12px 12px;}' +
    '.cmk-mt-name{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:500;font-size:15px;color:var(--cm-ivory);line-height:1.2;margin-bottom:4px;}' +
    '.cmk-mt-tag{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#d4a574;}' +
    '.cmk-mt-meta{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:rgba(232,227,216,.55);margin-bottom:6px;}' +
    '.cmk-mt-ppsf{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:500;font-size:17px;color:#d4a574;line-height:1.1;}' +
    '.cmk-mt-ppsf span{font-family:"JetBrains Mono",ui-monospace,monospace;font-style:normal;font-size:9px;letter-spacing:.03em;color:rgba(232,227,216,.55);display:block;margin-top:2px;text-transform:lowercase;}' +
    '.cmk-mt-ppsf.cmk-mt-ppsf-empty{font-size:12px;color:rgba(232,227,216,.5);font-weight:400;font-family:"DM Sans",system-ui,sans-serif;font-style:italic;}' +
    /* neighbor cards */
    '.cmk-nbr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;}' +
    '.cmk-nbr-card{background:var(--cm-navy);border:1px solid var(--cm-rule);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s;position:relative;}' +
    '.cmk-nbr-card:hover{border-color:#d4a574;transform:translateY(-2px);}' +
    '.cmk-nbr-img{aspect-ratio:4/3;background-size:cover;background-position:center;background-color:#0f131d;}' +
    '.cmk-nbr-noimg{background:radial-gradient(circle at 30% 30%,rgba(212,165,116,.10),transparent 60%),radial-gradient(circle at 80% 80%,rgba(159,180,216,.08),transparent 60%),#1a1f2e;}' +
    '.cmk-nbr-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px;flex:1;}' +
    '.cmk-nbr-name{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:500;font-size:18px;color:var(--cm-ivory);line-height:1.15;}' +
    '.cmk-nbr-meta{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:rgba(232,227,216,.45);}' +
    '.cmk-nbr-ppsf{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:500;font-size:22px;color:#d4a574;margin-top:auto;}' +
    '.cmk-nbr-ppsf span{font-family:"JetBrains Mono",ui-monospace,monospace;font-style:normal;font-size:9px;letter-spacing:.04em;color:rgba(232,227,216,.45);display:block;margin-top:2px;text-transform:uppercase;}' +
    '.cmk-nbr-noppsf{color:rgba(232,227,216,.45);}' +
    '.cmk-nbr-dist{position:absolute;top:10px;right:10px;background:rgba(15,19,29,0.78);backdrop-filter:blur(6px);font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.04em;color:var(--cm-ivory);padding:4px 8px;border-radius:999px;}';
    var st = document.createElement('style'); st.id = 'cmk-css'; st.textContent = css;
    document.head.appendChild(st);
  }
})();
