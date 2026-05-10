/* =========================================================================
   cm-truth-patch.js  v5
   ---------------------------------------------------------------------------
   v5 fix (2026-05-10):
     - Ticker now actually scrolls.
       Injects @keyframes cm-truth-scroll and wraps ticker content in an
       animated inline-block span. Doubled content + translateX(-50%) =
       seamless infinite loop. 60s/lap.
   ========================================================================= */

(function () {
  'use strict';

  var SUPABASE_URL  = 'https://kfqphwerygccpzntbbif.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';
  var SIGNUP_URL = '/owner-signup/';
  var LOG_PREFIX = '[cm-truth]';
  var DATA = { buildings: null, aggregates: null, ticker: null, cards: null, panel: null };
  var CARD_BY_SLUG = {};
  var SLUGS_WITH_DATA = {};
  var DATA_LOADED = false;
  var PATCH_RUN_COUNT = 0;

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
    return { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON };
  }
  function fmtInt(n) { return (Number(n) || 0).toLocaleString(); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function walkText(root, fn) {
    if (!root || !document.createTreeWalker) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var nodes = []; var n;
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
  function hasPatchedAncestor(el) {
    var n = el;
    while (n) {
      if (n.getAttribute && n.getAttribute('data-cm-truth-patched')) return true;
      n = n.parentNode;
    }
    return false;
  }

  // Inject @keyframes once for the ticker animation
  function injectStyles() {
    if (document.getElementById('cm-truth-style')) return;
    var s = document.createElement('style');
    s.id = 'cm-truth-style';
    s.textContent =
      '@keyframes cm-truth-scroll {' +
      '  from { transform: translate3d(0, 0, 0); }' +
      '  to   { transform: translate3d(-50%, 0, 0); }' +
      '}' +
      '.cm-truth-track {' +
      '  display: inline-block;' +
      '  white-space: nowrap;' +
      '  animation: cm-truth-scroll 60s linear infinite;' +
      '  padding-right: 48px;' +
      '  will-change: transform;' +
      '}' +
      '.cm-truth-ticker { overflow: hidden; white-space: nowrap; }' +
      '.cm-truth-ticker:hover .cm-truth-track { animation-play-state: paused; }';
    document.head.appendChild(s);
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
        method: 'POST', headers: anonHeaders(), body: '{}'
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
    if (!ticker) return;
    if (ticker.getAttribute('data-cm-truth-patched') === '1') return;

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

    // Doubled content lets translateX(-50%) loop seamlessly
    var oneLap = items.join(' \u00b7 ');
    ticker.classList.add('cm-truth-ticker');
    ticker.innerHTML = '<span class="cm-truth-track">' + oneLap + ' \u00b7 ' + oneLap + ' \u00b7 </span>';
    ticker.style.overflow = 'hidden';
    ticker.style.whiteSpace = 'nowrap';
    ticker.setAttribute('data-cm-truth-patched', '1');
    log('ticker patched (' + items.length + ' items, animated 60s loop)');
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
        n.nodeValue = v.replace(/7,564/g, real); replaced++;
      } else if (v.match(/12,400\+?/)) {
        n.nodeValue = v.replace(/12,400\+?/g, real); replaced++;
      }
    });
    if (replaced) log('units count patched (' + replaced + ' nodes)');
  }

  function patchTwoLayersPanel() {
    var panel = findContainer(['Public layer', 'Enhanced layer', 'Sale-to-list ratio']);
    if (!panel) panel = findContainer(['Sign in to unlock', 'enhanced layer']);
    if (!panel) panel = findContainer(['See what', 'members see', 'Per-unit specifics']);
    if (!panel) return;
    if (panel.getAttribute('data-cm-truth-patched') === 'v3') return;

    var agg = DATA.aggregates && DATA.aggregates[0] ? DATA.aggregates[0] : {};
    var sig = DATA.panel && DATA.panel[0] ? DATA.panel[0] : {};
    var bldCount = (DATA.buildings && DATA.buildings.length) || 64;
    var psf = agg.median_psf_36mo || 1197;
    var units = fmtInt(agg.total_units || 5082);
    var tenure = sig.median_tenure_years || '8.6';
    var jointPct = sig.joint_owned_pct || 45;
    var indPct = sig.individual_owned_pct || 39;
    var entPct = sig.entity_owned_pct || 16;

    var publicBullets = [
      'Citywide median $/sf \u2014 <strong style="color:#e8e3d8;">$' + fmtInt(psf) + '</strong>',
      'Building $/sf rankings (top 10)',
      'Most-recent sales feed',
      bldCount + ' buildings \u00b7 ' + units + ' units tracked'
    ];
    var memberBullets = [
      '<strong style="color:#e8e3d8;">Per-unit sale history</strong> \u2014 every closing, last 10 years',
      '<strong style="color:#e8e3d8;">Owner tenure by unit</strong> \u2014 median ' + tenure + ' years citywide',
      '<strong style="color:#e8e3d8;">Owner type per unit</strong> \u2014 ' + jointPct + '% joint \u00b7 ' + indPct + '% solo \u00b7 ' + entPct + '% entity',
      '<strong style="color:#e8e3d8;">Make-Me-Move prices</strong> \u2014 real $ amounts per unit',
      '<strong style="color:#e8e3d8;">Primary vs secondary residence</strong> \u2014 coming via ATTOM'
    ];

    function bulletList(items, color) {
      return items.map(function (b) {
        return '<li style="display:flex;gap:12px;align-items:flex-start;padding:0;margin:0;font-size:15px;line-height:1.55;color:rgba(232,227,216,0.78);">' +
          '<span style="color:' + color + ';flex-shrink:0;line-height:1.55;font-weight:600;">\u2713</span>' +
          '<span>' + b + '</span>' +
          '</li>';
      }).join('');
    }

    panel.innerHTML = [
      '<div style="width:100%;max-width:1100px;margin:0 auto;">',
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;">',
          '<div style="padding:40px 36px;background:rgba(159,180,216,0.04);border:1px solid rgba(159,180,216,0.18);border-radius:14px;">',
            '<div style="font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:rgba(232,227,216,0.5);margin-bottom:10px;">Public</div>',
            '<div style="font-family:\'Playfair Display\',Georgia,serif;font-size:28px;line-height:1.15;color:#e8e3d8;margin-bottom:6px;font-weight:500;font-style:italic;">Free, no account.</div>',
            '<div style="font-size:13px;color:rgba(232,227,216,0.5);margin-bottom:28px;">Aggregates only.</div>',
            '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:16px;">',
              bulletList(publicBullets, '#9fb4d8'),
            '</ul>',
          '</div>',
          '<div style="padding:40px 36px;background:linear-gradient(180deg, rgba(212,165,116,0.12) 0%, rgba(212,165,116,0.04) 100%);border:1px solid rgba(212,165,116,0.4);border-radius:14px;box-shadow:0 0 0 1px rgba(212,165,116,0.06), 0 8px 32px rgba(212,165,116,0.04);">',
            '<div style="font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#d4a574;margin-bottom:10px;">Members \u00b7 Free</div>',
            '<div style="font-family:\'Playfair Display\',Georgia,serif;font-size:28px;line-height:1.15;color:#e8e3d8;margin-bottom:6px;font-weight:500;font-style:italic;">Per-unit specifics.</div>',
            '<div style="font-size:13px;color:rgba(232,227,216,0.55);margin-bottom:28px;">Everything in public, plus:</div>',
            '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:16px;">',
              bulletList(memberBullets, '#d4a574'),
            '</ul>',
          '</div>',
        '</div>',
        '<div style="text-align:center;margin-top:40px;">',
          '<a href="' + SIGNUP_URL + '" style="display:inline-flex;align-items:center;gap:10px;padding:18px 36px;background:#d4a574;color:#0f131d;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px;letter-spacing:0.005em;box-shadow:0 4px 16px rgba(212,165,116,0.2);">Create a free account \u2192</a>',
          '<div style="margin-top:14px;font-size:12px;color:rgba(232,227,216,0.4);font-family:\'JetBrains Mono\',ui-monospace,monospace;">No credit card \u00b7 No spam \u00b7 30 seconds</div>',
        '</div>',
      '</div>'
    ].join('');
    panel.setAttribute('data-cm-truth-patched', 'v3');
    log('two-layer panel: v5 (1100px, bronze gradient, /owner-signup/)');
  }

  function patchFabricatedCounters() {
    var killPhrases = [
      'Make-me-move prices live',
      'Make-Me-Move prices live',
      'off-market signals today',
      'off-market signals',
      'active offers this week',
      'Concentrated in Pacific Heights',
      'Tax record feed updating soon',
      'integration landing soon'
    ];
    var killed = 0;
    var all = document.body.querySelectorAll('*');
    var toKill = [];
    for (var i = 0; i < all.length; i++) {
      var t = (all[i].textContent || '').trim();
      var hit = killPhrases.some(function (p) { return t.indexOf(p) !== -1; });
      if (!hit) continue;
      if (t.length > 250) continue;
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

  function patchActiveSignalsPanel() {
    var phrases = ['Active Signals', 'ACTIVE SIGNALS', 'active signals'];
    var found = null;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var t = all[i].textContent || '';
      var hasHeader = phrases.some(function (p) { return t.indexOf(p) !== -1; });
      var hasFake = t.indexOf('active offers this week') !== -1 ||
                    t.indexOf('Tax record feed') !== -1 ||
                    t.indexOf('Concentrated in Pacific Heights') !== -1;
      if (!hasHeader || !hasFake) continue;
      if (!found || (all[i].outerHTML || '').length < (found.outerHTML || '').length) {
        found = all[i];
      }
    }
    if (found && found.getAttribute('data-cm-truth-patched') !== '1') {
      try {
        found.style.display = 'none';
        found.setAttribute('data-cm-truth-patched', '1');
        log('active signals panel hidden');
      } catch (e) {}
    }
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

  function patchCardYears() {
    if (!Object.keys(CARD_BY_SLUG).length) return;
    var anchors = document.querySelectorAll('a[href*="/building/"]');
    var fixed = 0;
    var DATE_RX = /[A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4}/;
    anchors.forEach(function (a) {
      if (hasPatchedAncestor(a)) return;
      var m = a.getAttribute('href').match(/\/building\/([a-z0-9-]+)/);
      if (!m) return;
      var card = CARD_BY_SLUG[m[1]];
      if (!card || !card.year_built_mode) return;
      var realYear = String(card.year_built_mode);
      walkText(a, function (n) {
        var v = n.nodeValue;
        if (!v) return;
        if (DATE_RX.test(v)) return;
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
    var phrases = [
      'inventory at 7-year low',
      'fastest absorption this quarter',
      'zero new builds since 2018',
      'Jackson Square leads the city',
      'Median $1848/sf',
      '+66% vs city median'
    ];
    var killed = 0;
    walkText(document.body, function (n) {
      var v = n.nodeValue;
      if (!v) return;
      var newV = v;
      phrases.forEach(function (p) { newV = newV.replace(p, ''); });
      if (newV !== v) { n.nodeValue = newV; killed++; }
    });
    if (killed) log('editorial fakes scrubbed (' + killed + ' text nodes)');
  }

  function runPatches() {
    PATCH_RUN_COUNT++;
    injectStyles();
    var patches = [
      ['hero units', patchHeroUnitsCount],
      ['ticker', patchTicker],
      ['two-layer panel', patchTwoLayersPanel],
      ['fabricated counters', patchFabricatedCounters],
      ['active signals', patchActiveSignalsPanel],
      ['offer badges', patchOfferBadges],
      ['offer-activity line', patchOfferActivityLine],
      ['editorial fakes', patchEditorialFakes],
      ['card years', patchCardYears]
    ];
    patches.forEach(function (p) {
      try { p[1](); } catch (e) { err('patch failed:', p[0], e); }
    });
    log('patches run #' + PATCH_RUN_COUNT + ' (v5)');
  }

  async function init() {
    var t0 = Date.now();
    var results = await Promise.all([
      fetchBuildingsJson(),
      callRpc('homepage_aggregates'),
      callRpc('homepage_ticker_facts'),
      callRpc('homepage_building_cards'),
      callRpc('homepage_panel_signals')
    ]);
    DATA.buildings = results[0] || [];
    DATA.aggregates = results[1] || [];
    DATA.ticker = results[2] || [];
    DATA.cards = results[3] || [];
    DATA.panel = results[4] || [];
    DATA.cards.forEach(function (c) {
      CARD_BY_SLUG[c.building_slug] = c;
      SLUGS_WITH_DATA[c.building_slug] = true;
    });
    DATA_LOADED = true;
    log('data loaded in', (Date.now() - t0) + 'ms', {
      buildings: DATA.buildings.length, ticker: DATA.ticker.length,
      cards: DATA.cards.length, panel: DATA.panel.length
    });
    runPatches();
  }

  function onWindowLoad() {
    if (!DATA_LOADED) return;
    setTimeout(runPatches, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('load', onWindowLoad);
})();
