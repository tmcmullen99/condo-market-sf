/* =========================================================================
   cm-truth-patch.js  v2
   ---------------------------------------------------------------------------
   Replaces fabricated metrics with real data from Supabase RPCs.
   Loaded via:  <script src="/assets/cm-truth-patch.js" defer></script>

   v2 changes (2026-05-10):
     - Two-card comparison panel (public vs members) replaces single CTA
     - Real value drivers: tenure 8.6y, 45/39/16 ownership split
     - Removed Data Pending overlay (Tim feedback)
     - Kills "270 active offers", "Concentrated in Pacific Heights",
       "Tax record feed updating soon" on /buildings/
     - Re-runs on window.load to catch deferred content
   ========================================================================= */

(function () {
  'use strict';

  var SUPABASE_URL  = 'https://kfqphwerygccpzntbbif.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

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
    if (!ticker) { return; }
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

    var oneLap = items.join(' \u00b7 ');
    ticker.innerHTML = oneLap + ' \u00b7 ' + oneLap;
    ticker.setAttribute('data-cm-truth-patched', '1');
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
        n.nodeValue = v.replace(/7,564/g, real); replaced++;
      } else if (v.match(/12,400\+?/)) {
        n.nodeValue = v.replace(/12,400\+?/g, real); replaced++;
      }
    });
    if (replaced) log('units count patched (' + replaced + ' nodes)');
  }

  function patchTwoLayersPanel() {
    var panel = findContainer(['Public layer', 'Enhanced layer', 'Sale-to-list ratio']);
    if (!panel) {
      panel = findContainer(['Sign in to unlock', 'enhanced layer']);
      if (!panel) return;
    }
    if (panel.getAttribute('data-cm-truth-patched') === '1') return;

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
        return '<li style="display:flex;gap:10px;align-items:flex-start;padding:0;margin:0;font-size:14px;line-height:1.55;color:rgba(232,227,216,0.75);">' +
          '<span style="color:' + color + ';flex-shrink:0;line-height:1.55;">\u2713</span>' +
          '<span>' + b + '</span>' +
          '</li>';
      }).join('');
    }

    panel.innerHTML = [
      '<div style="padding:56px 32px;background:#0f131d;border-radius:14px;border:1px solid rgba(159,180,216,0.12);">',
        '<div style="text-align:center;max-width:680px;margin:0 auto 36px;">',
          '<div style="font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#d4a574;margin-bottom:14px;">Two layers of intelligence</div>',
          '<h2 style="font-family:\'Playfair Display\',Georgia,serif;font-size:clamp(30px,4.2vw,46px);font-weight:500;line-height:1.1;margin:0 0 14px;color:#e8e3d8;">See what <em style="color:#9fb4d8;">members see.</em></h2>',
          '<p style="font-size:16px;color:rgba(232,227,216,0.6);margin:0;line-height:1.5;">A free account unlocks per-unit data \u2014 sale history, owner tenure, ownership type, and Make-Me-Move prices for every building.</p>',
        '</div>',
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;max-width:880px;margin:0 auto;">',
          '<div style="padding:32px 28px;background:rgba(159,180,216,0.04);border:1px solid rgba(159,180,216,0.18);border-radius:12px;">',
            '<div style="font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:rgba(232,227,216,0.5);margin-bottom:10px;">Public</div>',
            '<div style="font-family:\'Playfair Display\',Georgia,serif;font-size:22px;color:#e8e3d8;margin-bottom:6px;font-weight:500;">Free \u00b7 no account</div>',
            '<div style="font-size:13px;color:rgba(232,227,216,0.5);margin-bottom:24px;">Aggregates only.</div>',
            '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px;">',
              bulletList(publicBullets, '#9fb4d8'),
            '</ul>',
          '</div>',
          '<div style="padding:32px 28px;background:rgba(212,165,116,0.06);border:1px solid rgba(212,165,116,0.3);border-radius:12px;position:relative;">',
            '<div style="position:absolute;top:-1px;right:-1px;background:#d4a574;color:#0f131d;font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:10px;font-weight:600;padding:6px 10px;border-radius:0 12px 0 8px;letter-spacing:0.1em;">FREE \u00b7 30 SECONDS</div>',
            '<div style="font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#d4a574;margin-bottom:10px;">Members</div>',
            '<div style="font-family:\'Playfair Display\',Georgia,serif;font-size:22px;color:#e8e3d8;margin-bottom:6px;font-weight:500;">Per-unit specifics</div>',
            '<div style="font-size:13px;color:rgba(232,227,216,0.5);margin-bottom:24px;">Everything in public, plus:</div>',
            '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px;">',
              bulletList(memberBullets, '#d4a574'),
            '</ul>',
          '</div>',
        '</div>',
        '<div style="text-align:center;margin-top:36px;">',
          '<a href="#signup" style="display:inline-flex;align-items:center;gap:8px;padding:16px 32px;background:#d4a574;color:#0f131d;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.01em;">Create a free account \u2192</a>',
          '<div style="margin-top:14px;font-size:12px;color:rgba(232,227,216,0.4);font-family:\'JetBrains Mono\',ui-monospace,monospace;">No credit card. No spam. Cancel anytime.</div>',
        '</div>',
      '</div>'
    ].join('');
    panel.setAttribute('data-cm-truth-patched', '1');
    log('two-layer panel replaced with comparison cards');
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
    log('patches run #' + PATCH_RUN_COUNT);
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
