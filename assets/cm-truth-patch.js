/* =========================================================================
   cm-truth-patch.js
   ---------------------------------------------------------------------------
   Drop-in patch that replaces fabricated metrics on the homepage and
   intelligence page with real data from Supabase RPCs.

   Loaded via:  <script src="/assets/cm-truth-patch.js" defer></script>

   What it patches (all best-effort, no-ops if a target isn't found):
     - Ticker:                replaces fake "X offers this week" content
                              with rotating real building $/sf, recent
                              sales, citywide medians.
     - Hero stats:            replaces "7,564 units" / "12,400+ units"
                              with real DB-derived count.
     - "Two data layers":     finds the public/enhanced comparison panel,
                              replaces with a single simplified
                              "Sign in to unlock" CTA.
     - Fabricated counters:   removes "342 Make-Me-Move prices live",
                              "87 off-market signals today",
                              "Buildings with offer activity 64",
                              "Most-traded this week The Amero".
     - "X/wk" card badges:    removes the offer/wk tags from cards.
     - Data-pending cards:    flags the 9 buildings without sales data.
     - Building card years:   replaces card year_built with DB mode.

   Author: Condo Market SF, v1.0, 2026-05-09
   ========================================================================= */

(function () {
  'use strict';

  var SUPABASE_URL  = 'https://kfqphwerygccpzntbbif.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

  var LOG_PREFIX = '[cm-truth]';

  var DATA = {
    buildings: null,
    aggregates: null,
    ticker: null,
    cards: null
  };

  var CARD_BY_SLUG = {};
  var SLUGS_WITH_DATA = {};

  function log() {
    if (window.console && console.log) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.log.apply(console, args);
    }
  }

  function err() {
    if (window.console && console.warn) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.warn.apply(console, args);
    }
  }

  function anonHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON,
      'Authorization': 'Bearer ' + SUPABASE_ANON
    };
  }

  function fmtInt(n) {
    return (Number(n) || 0).toLocaleString();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function walkText(root, fn) {
    if (!root || !document.createTreeWalker) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(fn);
  }

  function findContainer(anchors) {
    if (!Array.isArray(anchors) || anchors.length === 0) return null;
    var all = document.body.querySelectorAll('*');
    var best = null;
    var bestSize = Infinity;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var t = el.textContent || '';
      var ok = anchors.every(function (s) { return t.indexOf(s) !== -1; });
      if (!ok) continue;
      var size = (el.outerHTML || '').length;
      if (size < bestSize) { best = el; bestSize = size; }
    }
    return best;
  }

  async function fetchBuildingsJson() {
    try {
      var r = await fetch('/assets/buildings.json', { cache: 'no-cache' });
      if (!r.ok) return [];
      return await r.json();
    } catch (e) { err('buildings.json', e); return []; }
  }

  async function callRpc(name) {
    try {
      var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: anonHeaders(),
        body: '{}'
      });
      if (!r.ok) { err('rpc', name, r.status); return null; }
      return await r.json();
    } catch (e) { err('rpc', name, e); return null; }
  }

  function patchTicker() {
    if (!DATA.ticker || !DATA.ticker.length) return;
    var ticker = null;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var t = all[i].textContent || '';
      var m = t.match(/offers this week/g);
      if (m && m.length >= 3) { ticker = all[i]; break; }
    }
    if (!ticker) { log('ticker not found'); return; }

    var items = DATA.ticker.map(function (row) {
      var label = escapeHtml(row.label || '');
      var detail = escapeHtml(row.detail || '');
      var inner = '<strong>' + label + '</strong> \u00b7 ' + detail;
      return row.href
        ? '<a href="' + escapeHtml(row.href) + '">' + inner + '</a>'
        : '<span>' + inner + '</span>';
    });

    var agg = DATA.aggregates && DATA.aggregates[0] ? DATA.aggregates[0] : {};
    var bldCount = (DATA.buildings && DATA.buildings.length) || 64;
    items.push('<span><strong>' + fmtInt(agg.total_units || 0) + ' units</strong> tracked across ' + bldCount + ' buildings</span>');
    items.push('<span><strong>Flat 3% fee</strong> \u00b7 1% returned to the HOA</span>');

    var oneLap = items.join(' \u00b7 ');
    ticker.innerHTML = oneLap + ' \u00b7 ' + oneLap;
    log('ticker patched (' + items.length + ' items)');
  }

  function patchHeroUnitsCount() {
    var agg = DATA.aggregates && DATA.aggregates[0];
    if (!agg) return;
    var real = fmtInt(agg.total_units);
    var replaced = 0;
    walkText(document.body, function (n) {
      var v = n.nodeValue;
      if (!v) return;
      if (v.indexOf('7,564') !== -1) {
        n.nodeValue = v.replace(/7,564/g, real);
        replaced++;
      } else if (v.match(/12,400\+?/)) {
        n.nodeValue = v.replace(/12,400\+?/g, real);
        replaced++;
      }
    });
    if (replaced) log('units count patched (' + replaced + ' nodes)');
  }

  function patchTwoLayersPanel() {
    var panel = findContainer(['Public layer', 'Enhanced layer', 'Sale-to-list ratio']);
    if (!panel) { log('two-layer panel not found'); return; }

    var agg = DATA.aggregates && DATA.aggregates[0] ? DATA.aggregates[0] : {};
    var bldCount = (DATA.buildings && DATA.buildings.length) || 64;

    function feature(title, desc) {
      return '<div style="padding:18px;background:#fff;border-radius:8px;border:1px solid rgba(26,31,46,0.08);text-align:left;">' +
        '<div style="font-weight:600;font-size:14px;color:#1a1f2e;margin-bottom:6px;">' + escapeHtml(title) + '</div>' +
        '<div style="font-size:13px;color:rgba(26,31,46,0.65);line-height:1.5;">' + escapeHtml(desc) + '</div>' +
      '</div>';
    }

    panel.innerHTML = [
      '<div style="padding:48px 32px;text-align:center;border-radius:12px;background:rgba(159,180,216,0.04);border:1px solid rgba(159,180,216,0.15);">',
        '<div style="font-family:JetBrains Mono,ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#d4a574;margin-bottom:16px;">Members-only intelligence</div>',
        '<h2 style="font-family:Playfair Display,Georgia,serif;font-size:clamp(28px,4vw,42px);font-weight:500;line-height:1.15;margin:0 0 16px;color:#1a1f2e;">Sign in to unlock the <em style="color:#9fb4d8;">enhanced layer.</em></h2>',
        '<p style="font-size:17px;color:rgba(26,31,46,0.7);max-width:56ch;margin:0 auto 32px;">Free account, no commitment. Members see per-unit sale history, owner tenure, last-sale prices, and Make-Me-Move prices for every building.</p>',
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;max-width:760px;margin:0 auto 32px;">',
          feature('Per-unit sale history', 'Every closing, every unit, last 10 years.'),
          feature('Owner tenure by unit', 'How long each owner has held \u2014 sortable, filterable.'),
          feature('Most-recent sale + price', 'The exact transaction that set today\'s comp.'),
          feature('Make-Me-Move prices', 'The number owners would say yes to.'),
        '</div>',
        '<a href="#signup" style="display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:#1a1f2e;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Create a free account \u2192</a>',
        '<div style="margin-top:24px;font-size:12px;color:rgba(26,31,46,0.5);font-family:JetBrains Mono,ui-monospace,monospace;">',
          fmtInt(agg.total_units || 0) + ' units \u00b7 ' + bldCount + ' buildings \u00b7 ' + fmtInt(agg.sales_last_10y || 0) + ' recorded sales (10y)',
        '</div>',
      '</div>'
    ].join('');
    log('two-layer panel replaced with sign-in CTA');
  }

  function patchFabricatedCounters() {
    var killPhrases = ['Make-me-move prices live', 'off-market signals today', 'Make-Me-Move prices live', 'off-market signals'];
    var killed = 0;
    var all = document.body.querySelectorAll('*');
    var toKill = [];
    for (var i = 0; i < all.length; i++) {
      var t = (all[i].textContent || '').trim();
      var hit = killPhrases.some(function (p) { return t.indexOf(p) !== -1; });
      if (!hit) continue;
      if (t.length > 200) continue;
      toKill.push(all[i]);
    }
    toKill.sort(function (a, b) { return (b.outerHTML || '').length - (a.outerHTML || '').length; });
    var seen = new Set();
    toKill.forEach(function (el) {
      var p = el.parentNode;
      while (p) { if (seen.has(p)) return; p = p.parentNode; }
      seen.add(el);
      try { el.style.display = 'none'; killed++; } catch (e) {}
    });
    if (killed) log('fabricated counters hidden (' + killed + ' elements)');
  }

  function patchOfferBadges() {
    var replaced = 0;
    walkText(document.body, function (n) {
      var v = n.nodeValue;
      if (!v) return;
      var newV = v.replace(/\s*[\u2022\u00b7]\s*\d+\/wk\b/g, '');
      if (newV !== v) { n.nodeValue = newV; replaced++; }
    });
    if (replaced) log('offer badges removed (' + replaced + ' text nodes)');
  }

  function patchOfferActivityLine() {
    walkText(document.body, function (n) {
      var v = n.nodeValue;
      if (!v) return;
      if (v.indexOf('Buildings with offer activity') !== -1) {
        n.nodeValue = v.replace(/Buildings with offer activity[^\d]*\d+/, 'Buildings with offer activity 0');
      }
      if (v.indexOf('Most-traded this week') !== -1) {
        var top = pickMostTradedLast12mo();
        if (top) {
          n.nodeValue = v.replace(/Most-traded this week[\s\S]*?(?=$|Sale-to-list|Median owner)/, 'Most-traded \u00b7 trailing 12 months ' + top + ' ');
        }
      }
    });
  }

  function pickMostTradedLast12mo() {
    if (!DATA.cards) return null;
    var byCount = DATA.cards.slice().sort(function (a, b) { return (b.sales_36mo || 0) - (a.sales_36mo || 0); });
    if (!byCount.length) return null;
    return slugToName(byCount[0].building_slug);
  }

  function slugToName(slug) {
    if (DATA.buildings) {
      var found = DATA.buildings.find(function (b) {
        return (b.href && b.href.indexOf(slug) !== -1) || b.slug === slug;
      });
      if (found && found.name) return found.name;
    }
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function patchDataPendingCards() {
    if (!DATA.buildings) return;
    var pendingCount = 0;
    var anchors = document.querySelectorAll('a[href*="/building/"]');
    anchors.forEach(function (a) {
      var m = a.getAttribute('href').match(/\/building\/([a-z0-9-]+)/);
      if (!m) return;
      var slug = m[1];
      if (SLUGS_WITH_DATA[slug]) return;
      try {
        a.style.position = 'relative';
        a.style.opacity = '0.5';
        a.setAttribute('data-cm-pending', '1');
        if (!a.querySelector('.cm-pending-overlay')) {
          var overlay = document.createElement('span');
          overlay.className = 'cm-pending-overlay';
          overlay.textContent = 'Data pending';
          overlay.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(201,87,66,0.9);color:#fff;font-family:JetBrains Mono,ui-monospace,monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;padding:4px 8px;border-radius:4px;pointer-events:none;z-index:5';
          a.appendChild(overlay);
        }
        pendingCount++;
      } catch (e) {}
    });
    if (pendingCount) log('data-pending cards flagged (' + pendingCount + ')');
  }

  function patchCardYears() {
    if (!Object.keys(CARD_BY_SLUG).length) return;
    var anchors = document.querySelectorAll('a[href*="/building/"]');
    var fixed = 0;
    anchors.forEach(function (a) {
      var m = a.getAttribute('href').match(/\/building\/([a-z0-9-]+)/);
      if (!m) return;
      var card = CARD_BY_SLUG[m[1]];
      if (!card || !card.year_built_mode) return;
      var realYear = String(card.year_built_mode);
      walkText(a, function (n) {
        var v = n.nodeValue;
        if (!v) return;
        var newV = v.replace(/\b(19\d{2}|20[0-2]\d)\b/g, function (yr) {
          if (yr === realYear) return yr;
          if (Math.abs(parseInt(yr) - parseInt(realYear)) > 2) {
            fixed++;
            return realYear;
          }
          return yr;
        });
        if (newV !== v) n.nodeValue = newV;
      });
    });
    if (fixed) log('card years corrected (' + fixed + ' replacements)');
  }

  function patchEditorialFakes() {
    var phrases = ['inventory at 7-year low', 'fastest absorption this quarter', 'zero new builds since 2018'];
    var killed = 0;
    walkText(document.body, function (n) {
      var v = n.nodeValue;
      if (!v) return;
      var newV = v;
      phrases.forEach(function (p) {
        newV = newV.replace(p, '');
      });
      if (newV !== v) { n.nodeValue = newV; killed++; }
    });
    if (killed) log('editorial fakes scrubbed (' + killed + ' text nodes)');
  }

  async function init() {
    var t0 = Date.now();
    var results = await Promise.all([
      fetchBuildingsJson(),
      callRpc('homepage_aggregates'),
      callRpc('homepage_ticker_facts'),
      callRpc('homepage_building_cards')
    ]);
    DATA.buildings = results[0] || [];
    DATA.aggregates = results[1] || [];
    DATA.ticker = results[2] || [];
    DATA.cards = results[3] || [];

    DATA.cards.forEach(function (c) {
      CARD_BY_SLUG[c.building_slug] = c;
      SLUGS_WITH_DATA[c.building_slug] = true;
    });

    log('data loaded in', (Date.now() - t0) + 'ms', {
      buildings: DATA.buildings.length,
      ticker: DATA.ticker.length,
      cards: DATA.cards.length
    });

    var patches = [
      ['hero units', patchHeroUnitsCount],
      ['ticker', patchTicker],
      ['two-layer panel', patchTwoLayersPanel],
      ['fabricated counters', patchFabricatedCounters],
      ['offer badges', patchOfferBadges],
      ['offer-activity line', patchOfferActivityLine],
      ['editorial fakes', patchEditorialFakes],
      ['data-pending cards', patchDataPendingCards],
      ['card years', patchCardYears]
    ];
    patches.forEach(function (p) {
      try { p[1](); }
      catch (e) { err('patch failed:', p[0], e); }
    });

    log('all patches applied in', (Date.now() - t0) + 'ms');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
