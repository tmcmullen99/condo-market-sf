/* /assets/cm-case-studies.js
 * Client-side renderer for published case studies.
 *
 * Add to any page:
 *   <div data-cm-case-studies data-placement="how_it_works" data-limit="1"></div>
 *   <script src="/assets/cm-case-studies.js" defer></script>
 *
 * Attributes:
 *   data-placement   : 'homepage' | 'how_it_works' | 'dashboard'  (filters which rows show)
 *   data-market-slug : override market filter (defaults to window.__CM_MARKET__)
 *   data-limit       : max cards to render (default 1)
 *
 * Fetches public.featured_case_studies(p_placement, p_market_slug, p_limit).
 * Renders each study as a 3-tile narrative (MMM -> Coming Soon -> Closed) matching
 * the existing pricing-tier ladder visual language used in /how-it-works/.
 * Self-themed dark card — works on any host background.
 */
(function () {
  'use strict';
  if (window.__cmCaseStudiesLoaded) return;
  window.__cmCaseStudiesLoaded = true;

  var SUPABASE_URL  = 'https://kfqphwerygccpzntbbif.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('rpc ' + name + ' ' + r.status);
      return r.json();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function moneyShort(n) {
    if (n == null || isNaN(n)) return null;
    n = Number(n);
    if (n >= 1e6) {
      var m = n / 1e6;
      var s = (m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
      return '$' + s + 'M';
    }
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function moneyExact(n) {
    if (n == null || isNaN(n)) return null;
    return '$' + Number(n).toLocaleString('en-US');
  }

  function injectCSS() {
    if (document.getElementById('cm-case-studies-css')) return;
    var style = document.createElement('style');
    style.id = 'cm-case-studies-css';
    style.textContent = [
      ".cm-cs-wrap{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;}",
      ".cm-cs-card{background:#1a1f2e;color:#e8e3d8;border:1px solid rgba(159,180,216,0.18);border-radius:14px;padding:40px 44px;position:relative;overflow:hidden;}",
      ".cm-cs-card+.cm-cs-card{margin-top:24px;}",
      "@media(max-width:720px){.cm-cs-card{padding:28px 24px;}}",
      ".cm-cs-eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#9fb4d8;margin:0 0 14px;}",
      ".cm-cs-head{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:clamp(26px,3.4vw,38px);line-height:1.08;letter-spacing:-0.015em;margin:0 0 10px;color:#e8e3d8;}",
      ".cm-cs-head em{font-style:italic;color:#9fb4d8;font-weight:500;}",
      ".cm-cs-subhead{font-size:15px;line-height:1.55;color:rgba(232,227,216,0.7);margin:0 0 32px;max-width:62ch;}",
      ".cm-cs-tiles{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:18px;align-items:stretch;}",
      "@media(max-width:760px){.cm-cs-tiles{grid-template-columns:1fr;gap:14px;}.cm-cs-arrow{justify-self:center;transform:rotate(90deg);font-size:22px;padding:4px 0;}}",
      ".cm-cs-tile{background:#0f131d;border:1px solid rgba(159,180,216,0.15);border-radius:10px;padding:22px 22px 24px;display:flex;flex-direction:column;}",
      ".cm-cs-tile.is-final{border-color:rgba(159,180,216,0.42);background:linear-gradient(180deg,#11172a 0%,#0f131d 100%);}",
      ".cm-cs-tile-step{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(159,180,216,0.7);margin:0 0 12px;}",
      ".cm-cs-tile-name{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-weight:500;font-size:17px;color:#e8e3d8;margin:0 0 14px;line-height:1.2;}",
      ".cm-cs-tile-price{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:30px;line-height:1;color:#e8e3d8;margin:0 0 4px;letter-spacing:-0.015em;}",
      ".cm-cs-tile.is-final .cm-cs-tile-price{color:#9fb4d8;}",
      ".cm-cs-tile-price-exact{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:rgba(232,227,216,0.5);margin:0 0 18px;letter-spacing:0.02em;min-height:12px;}",
      ".cm-cs-tile-stats{display:flex;flex-direction:column;gap:6px;font-size:13px;color:rgba(232,227,216,0.75);line-height:1.4;margin-top:auto;}",
      ".cm-cs-tile-stat{display:flex;align-items:baseline;gap:8px;}",
      ".cm-cs-tile-stat strong{color:#e8e3d8;font-weight:500;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;white-space:nowrap;}",
      ".cm-cs-tile-outcome{margin-top:14px;padding-top:14px;border-top:1px dashed rgba(159,180,216,0.18);font-style:italic;font-family:'Playfair Display',Georgia,serif;font-size:13px;color:rgba(232,227,216,0.65);line-height:1.45;}",
      ".cm-cs-arrow{display:flex;align-items:center;justify-content:center;color:#9fb4d8;font-size:22px;opacity:0.55;line-height:1;}",
      ".cm-cs-quote{margin:32px 0 0;padding:18px 24px;border-left:2px solid #9fb4d8;font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:17px;line-height:1.55;color:rgba(232,227,216,0.82);}",
      ".cm-cs-quote::before{content:'\\201C';color:#9fb4d8;margin-right:2px;}",
      ".cm-cs-quote::after{content:'\\201D';color:#9fb4d8;margin-left:2px;}"
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderTile(opts) {
    var statsHtml = opts.stats.filter(Boolean).map(function (s) {
      return '<div class="cm-cs-tile-stat"><strong>' + esc(s.value) + '</strong><span>' + esc(s.label) + '</span></div>';
    }).join('');
    return [
      '<div class="cm-cs-tile' + (opts.isFinal ? ' is-final' : '') + '">',
        '<p class="cm-cs-tile-step">' + esc(opts.step) + '</p>',
        '<p class="cm-cs-tile-name">' + esc(opts.name) + '</p>',
        '<p class="cm-cs-tile-price">' + esc(opts.priceShort || '—') + '</p>',
        '<p class="cm-cs-tile-price-exact">' + esc(opts.priceExact || '') + '</p>',
        statsHtml ? '<div class="cm-cs-tile-stats">' + statsHtml + '</div>' : '',
        opts.outcome ? '<p class="cm-cs-tile-outcome">' + esc(opts.outcome) + '</p>' : '',
      '</div>'
    ].join('');
  }

  function renderCard(study) {
    var fname = study.seller_first_name || 'Owner';
    var linit = study.seller_last_initial ? study.seller_last_initial.replace(/\.$/, '') + '.' : '';
    var sellerName = (fname + (linit ? ' ' + linit : '')).trim();
    var buildingName = study.building_name || null;
    var hood = study.building_neighborhood || null;

    var finalShort = moneyShort(study.final_sale_price);
    var csShort = moneyShort(study.coming_soon_price);
    var aboveSomething = finalShort || (csShort ? csShort + '+' : null);

    var headline;
    if (study.headline) {
      headline = esc(study.headline);
    } else if (buildingName) {
      headline = esc(sellerName) + ' at <em>' + esc(buildingName) + '</em>'
        + (aboveSomething ? ' &mdash; ' + esc(aboveSomething) + ' all-cash close' : '');
    } else {
      headline = esc(sellerName) + '&rsquo;s <em>story</em>';
    }

    var subhead;
    if (buildingName && hood) {
      subhead = 'A real owner journey from MMM through Coming Soon to closed escrow at ' + buildingName + ', ' + hood + '.';
    } else if (buildingName) {
      subhead = 'A real owner journey from MMM through Coming Soon to closed escrow at ' + buildingName + '.';
    } else {
      subhead = 'A real owner journey from Make-Me-Move through Coming Soon to closed escrow.';
    }

    // Tile 1 — MMM
    var tile1Stats = [];
    if (study.mmm_duration_days != null) tile1Stats.push({ value: study.mmm_duration_days + ' days', label: 'tested' });
    tile1Stats.push({ value: (study.mmm_tours_requested != null ? study.mmm_tours_requested : 0), label: 'tour requests' });
    var tile1 = renderTile({
      step: 'Tier 1 · Make-Me-Move',
      name: 'Test a number',
      priceShort: moneyShort(study.mmm_price),
      priceExact: moneyExact(study.mmm_price),
      stats: tile1Stats,
      outcome: study.mmm_outcome
    });

    // Tile 2 — Coming Soon
    var tile2Stats = [];
    tile2Stats.push({ value: (study.coming_soon_tours_requested != null ? study.coming_soon_tours_requested : 0), label: 'tour requests' });
    tile2Stats.push({ value: (study.coming_soon_offers_received != null ? study.coming_soon_offers_received : 0), label: 'offer' + (study.coming_soon_offers_received === 1 ? '' : 's') });
    if (study.coming_soon_counter_rounds) tile2Stats.push({ value: study.coming_soon_counter_rounds, label: 'counter round' + (study.coming_soon_counter_rounds === 1 ? '' : 's') });
    var tile2 = renderTile({
      step: 'Tier 2 · Coming Soon',
      name: 'Recalibrate & surface',
      priceShort: moneyShort(study.coming_soon_price),
      priceExact: moneyExact(study.coming_soon_price),
      stats: tile2Stats,
      outcome: study.coming_soon_outcome
    });

    // Tile 3 — Closed
    var finalDisplay = finalShort || (csShort ? csShort + '+' : null);
    var finalExact = moneyExact(study.final_sale_price);
    if (!finalExact && csShort) finalExact = 'above ' + csShort;
    var tile3Stats = [];
    if (study.escrow_days != null) tile3Stats.push({ value: study.escrow_days + ' days', label: 'escrow' });
    if (study.payment_terms) {
      var pt = study.payment_terms === 'all_cash' ? 'All cash' : study.payment_terms === 'financed' ? 'Financed' : 'Mixed';
      tile3Stats.push({ value: pt, label: 'at close' });
    }
    var tile3 = renderTile({
      step: 'Tier 3 · Closed',
      name: 'Deal done',
      priceShort: finalDisplay,
      priceExact: finalExact,
      stats: tile3Stats,
      isFinal: true
    });

    var arrow = '<div class="cm-cs-arrow" aria-hidden="true">&rarr;</div>';

    return [
      '<article class="cm-cs-card">',
        '<p class="cm-cs-eyebrow">Recent win</p>',
        '<h3 class="cm-cs-head">' + headline + '</h3>',
        '<p class="cm-cs-subhead">' + esc(subhead) + '</p>',
        '<div class="cm-cs-tiles">',
          tile1, arrow, tile2, arrow, tile3,
        '</div>',
        study.pull_quote ? '<blockquote class="cm-cs-quote">' + esc(study.pull_quote) + '</blockquote>' : '',
      '</article>'
    ].join('');
  }

  function hydrateSlot(slot) {
    var placement = slot.dataset.placement || null;
    var marketSlug = slot.dataset.marketSlug || (typeof window.__CM_MARKET__ === 'string' ? window.__CM_MARKET__ : null);
    var limit = Math.max(1, parseInt(slot.dataset.limit || '1', 10) || 1);

    rpc('featured_case_studies', {
      p_placement: placement,
      p_market_slug: marketSlug,
      p_limit: limit
    }).then(function (payload) {
      if (!payload || !Array.isArray(payload.studies) || payload.studies.length === 0) {
        slot.style.display = 'none';
        return;
      }
      slot.classList.add('cm-cs-wrap');
      slot.innerHTML = payload.studies.map(renderCard).join('');
    }).catch(function (err) {
      console.warn('cm-case-studies hydrate failed', err);
      slot.style.display = 'none';
    });
  }

  function init() {
    injectCSS();
    var slots = document.querySelectorAll('[data-cm-case-studies]');
    for (var i = 0; i < slots.length; i++) hydrateSlot(slots[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
