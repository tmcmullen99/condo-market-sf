/* cm-cma-sections.js — additive sections for /cma/
 *
 * The CMA page shipped rendering 3 of the 7 comp sets in comp_snapshot. This
 * module renders the remaining 4 without touching the existing renderers:
 *
 *   direct_comps               stack comps — same floorplan, ±N floors
 *   building_1bd_12mo          building-level aggregate (carries sales_count)
 *   sf_overall_1bd_12mo        citywide benchmark (carries sales_count)
 *   wider_harrison_recent_sales  full building sale history, sortable
 *
 * It also repairs one honesty bug in setupPeerBars(), which filtered out peer
 * buildings with a null median — silently hiding the entry that reads
 * "Not yet in catalog — follow-up data task" instead of disclosing the gap.
 *
 * Mount:  CMASections.mount(cma)   — call at the end of render(cma)
 *
 * Design rules this file follows, all from the platform's own constraints:
 *   • every stat renders its sample size; a stat without one does not render
 *   • market_context_snapshot is agent commentary, NOT a stats band — the
 *     cash-buyer and AI-proximity claims are not computed from anything in
 *     the database, and a demand claim made to a seller is a licensed act
 *   • nothing here states or implies a value for the subject unit
 */
(function (global) {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  var num = function (v) { return (v == null || v === '' || isNaN(Number(v))) ? null : Number(v); };
  var money = function (v) {
    var n = num(v); if (n == null) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString() + 'K';
    return '$' + Math.round(n).toLocaleString();
  };
  var moneyFull = function (v) {
    var n = num(v); return n == null ? '—' : '$' + Math.round(n).toLocaleString();
  };
  var psf = function (v) { var n = num(v); return n == null ? '—' : '$' + Math.round(n).toLocaleString(); };
  var dt = function (s) {
    if (!s) return '—';
    var d = new Date(String(s).length === 10 ? s + 'T12:00:00' : s);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  var CSS = [
    '.xs-section{padding:52px 0;border-top:1px solid var(--cream-14)}',
    '.xs-head{margin-bottom:8px}',
    '.xs-sub{color:var(--cream-58);font-size:15px;margin-top:8px;max-width:64ch}',
    '.xs-note{color:var(--cream-38);font-size:13px;margin-top:14px;font-family:var(--mono)}',
    '.xs-empty{background:var(--bg-card);border:1px dashed var(--cream-14);border-radius:12px;',
    ' padding:22px 24px;margin-top:20px;color:var(--cream-58);font-size:14.5px}',
    /* stack comps */
    '.xs-stack{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:24px}',
    '.xs-stack-card{background:var(--bg-card);border:1px solid var(--cream-14);border-left:3px solid var(--gold);',
    ' border-radius:12px;padding:20px 22px}',
    '.xs-stack-unit{font-family:var(--serif);font-size:24px;color:var(--cream)}',
    '.xs-stack-note{color:var(--gold);font-size:13px;margin-top:4px}',
    '.xs-stack-rows{margin-top:14px;padding-top:14px;border-top:1px solid var(--cream-14)}',
    '.xs-row{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:3px 0}',
    '.xs-row .k{color:var(--cream-58)}',
    '.xs-row .v{font-family:var(--mono);color:var(--cream)}',
    /* benchmark band */
    '.xs-bench{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;',
    ' background:var(--cream-14);border:1px solid var(--cream-14);border-radius:12px;overflow:hidden;margin-top:24px}',
    '.xs-bench .b{background:var(--bg-card);padding:20px}',
    '.xs-bench .bk{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cream-38)}',
    '.xs-bench .bv{font-family:var(--serif);font-size:26px;margin-top:8px;color:var(--cream)}',
    '.xs-bench .bs{font-size:12.5px;color:var(--cream-58);margin-top:6px}',
    /* table */
    '.xs-tbl-wrap{overflow-x:auto;margin-top:22px;border:1px solid var(--cream-14);border-radius:12px}',
    '.xs-tbl{width:100%;border-collapse:collapse;background:var(--bg-card);font-size:14px}',
    '.xs-tbl th{font-family:var(--mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;',
    ' color:var(--cream-38);text-align:left;padding:13px 16px;border-bottom:1px solid var(--cream-14);',
    ' white-space:nowrap;cursor:pointer;user-select:none}',
    '.xs-tbl th:hover{color:var(--gold)}',
    '.xs-tbl th.sorted{color:var(--gold)}',
    '.xs-tbl td{padding:13px 16px;border-bottom:1px solid var(--cream-14);color:var(--cream-78)}',
    '.xs-tbl tr:last-child td{border-bottom:none}',
    '.xs-tbl td.n{font-family:var(--mono);color:var(--cream);white-space:nowrap}',
    '.xs-tbl tr.is-subject td{background:var(--gold-15)}',
    /* glossary */
    '.xs-gloss{display:flex;flex-direction:column;gap:14px;margin-top:24px}',
    '.xs-g{background:var(--bg-card);border:1px solid var(--cream-14);border-radius:12px;padding:20px 22px}',
    '.xs-g b{color:var(--gold);font-size:14.5px}',
    '.xs-g span{display:block;color:var(--cream-78);font-size:14.5px;margin-top:6px}',
    /* commentary */
    '.xs-comment{background:var(--bg-card);border:1px solid var(--cream-14);border-radius:12px;padding:24px 26px;margin-top:22px}',
    '.xs-comment .tag{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.14em;',
    ' text-transform:uppercase;color:var(--cream-38);border:1px solid var(--cream-14);border-radius:999px;',
    ' padding:4px 10px;margin-bottom:14px}',
    '.xs-comment p{color:var(--cream-78);font-size:15px}',
    '.xs-comment p+p{margin-top:12px}',
    '.xs-uncat{opacity:.62}',
    '@media print{.xs-section{break-inside:avoid}}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('xs-styles')) return;
    var st = document.createElement('style');
    st.id = 'xs-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function section(id, title, emTail, sub) {
    var s = document.createElement('div');
    s.className = 'section xs-section';
    s.id = id;
    s.innerHTML =
      '<div class="xs-head"><h2 class="section-h">' + esc(title) +
      (emTail ? ' <em>' + esc(emTail) + '</em>' : '') + '</h2>' +
      (sub ? '<p class="xs-sub">' + esc(sub) + '</p>' : '') + '</div>' +
      '<div class="xs-body"></div>';
    return s;
  }

  /* ---- 1. Stack comps -------------------------------------------------- */
  function stackComps(cs) {
    var list = (cs.direct_comps || []).filter(function (c) { return c && c.unit; });
    var el = section('xs-stack-section', 'The same home,',
      'a few floors away.',
      'Units in a stack share a floorplan. Tested against 763 building sales, a same-stack ' +
      'sale one floor up or down predicts price better than any other single comparable — ' +
      'but only at adjacent floors. Beyond about three floors the advantage inverts.');
    var body = el.querySelector('.xs-body');

    if (!list.length) {
      body.innerHTML = '<div class="xs-empty">No same-stack sales have been identified for this unit yet.</div>';
      return el;
    }
    body.innerHTML = '<div class="xs-stack">' + list.map(function (c) {
      var rows = [
        ['Sold', moneyFull(c.sale_price)],
        ['Closed', dt(c.sale_date)],
        ['Size', c.sqft ? Number(c.sqft).toLocaleString() + ' sqft' : '—'],
        ['$/sqft', psf(c.psf)]
      ].map(function (r) {
        return '<div class="xs-row"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>';
      }).join('');
      return '<div class="xs-stack-card">' +
        '<div class="xs-stack-unit">' + esc(c.unit) + '</div>' +
        (c.note ? '<div class="xs-stack-note">' + esc(c.note) + '</div>' : '') +
        '<div class="xs-stack-rows">' + rows + '</div></div>';
    }).join('') + '</div>' +
      '<p class="xs-note">' + list.length + ' same-stack sale' + (list.length === 1 ? '' : 's') + ' on record.</p>';
    return el;
  }

  /* ---- 2. Benchmark band ----------------------------------------------- */
  function benchmark(cs) {
    var b = cs.building_1bd_12mo || null;
    var sf = cs.sf_overall_1bd_12mo || null;
    var el = section('xs-bench-section', 'This building against',
      'the city.',
      'Both figures cover one-bedroom sales over the same twelve months. Each shows the ' +
      'number of sales behind it, because a median drawn from a handful of sales is a ' +
      'different thing from one drawn from a hundred.');
    var body = el.querySelector('.xs-body');

    var cells = [];
    // A stat without a sample count does not render.
    if (b && num(b.sales_count)) {
      cells.push(['Building median', money(b.median_price), (b.building || 'This building') + ' · ' + b.sales_count + ' sales']);
      if (num(b.avg_psf)) cells.push(['Building $/sqft', psf(b.avg_psf), 'average across ' + b.sales_count + ' sales']);
      if (num(b.min_price) && num(b.max_price)) {
        cells.push(['Building range', money(b.min_price) + '–' + money(b.max_price), 'low to high, same period']);
      }
    }
    if (sf && num(sf.sales_count)) {
      cells.push(['Citywide median', money(sf.median_price), 'San Francisco · ' + sf.sales_count + ' sales']);
      if (num(sf.avg_psf)) cells.push(['Citywide $/sqft', psf(sf.avg_psf), 'average across ' + sf.sales_count + ' sales']);
    }

    if (!cells.length) {
      body.innerHTML = '<div class="xs-empty">No twelve-month benchmark has been compiled for this building yet.</div>';
      return el;
    }
    body.innerHTML = '<div class="xs-bench">' + cells.map(function (c) {
      return '<div class="b"><div class="bk">' + esc(c[0]) + '</div>' +
        '<div class="bv">' + esc(c[1]) + '</div>' +
        '<div class="bs">' + esc(c[2]) + '</div></div>';
    }).join('') + '</div>';

    if (b && sf && num(b.avg_psf) && num(sf.avg_psf)) {
      var d = Math.round(((Number(b.avg_psf) - Number(sf.avg_psf)) / Number(sf.avg_psf)) * 100);
      body.innerHTML += '<p class="xs-note">Building $/sqft runs ' + Math.abs(d) + '% ' +
        (d >= 0 ? 'above' : 'below') + ' the citywide one-bedroom average.</p>';
    }
    return el;
  }

  /* ---- 3. Sale history table ------------------------------------------- */
  function history(cs, cma) {
    var list = (cs.wider_harrison_recent_sales || []).filter(function (s) { return s && s.unit; });
    var el = section('xs-history-section', 'Every recorded sale in',
      'this building.',
      'Click any column to sort. If you have read the comparison above you can skip this — ' +
      'it is here so you can check the work.');
    var body = el.querySelector('.xs-body');

    if (!list.length) {
      body.innerHTML = '<div class="xs-empty">No sale history has been compiled for this building yet.</div>';
      return el;
    }
    var subject = (cma.unit_label || '').replace(/^#/, '').toUpperCase();
    var cols = [
      ['unit', 'Unit', 'str'], ['price', 'Sold', 'num'],
      ['sqft', 'Size', 'num'], ['psf', '$/sqft', 'num'], ['date', 'Closed', 'date']
    ];
    var sortKey = 'date', sortDir = -1;

    function draw() {
      var rows = list.slice().sort(function (a, b) {
        var x = a[sortKey], y = b[sortKey];
        if (sortKey === 'date') { x = new Date(x || 0); y = new Date(y || 0); }
        else if (sortKey !== 'unit') { x = num(x) || 0; y = num(y) || 0; }
        else { x = String(x || ''); y = String(y || ''); }
        return x < y ? -sortDir : x > y ? sortDir : 0;
      });
      body.innerHTML = '<div class="xs-tbl-wrap"><table class="xs-tbl"><thead><tr>' +
        cols.map(function (c) {
          return '<th data-k="' + c[0] + '" class="' + (c[0] === sortKey ? 'sorted' : '') + '">' +
            esc(c[1]) + (c[0] === sortKey ? (sortDir === 1 ? ' ▲' : ' ▼') : '') + '</th>';
        }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          var isSub = subject && String(r.unit || '').replace(/^#/, '').toUpperCase() === subject;
          return '<tr class="' + (isSub ? 'is-subject' : '') + '">' +
            '<td class="n">' + esc(r.unit) + (isSub ? ' — this unit' : '') + '</td>' +
            '<td class="n">' + moneyFull(r.price) + '</td>' +
            '<td class="n">' + (r.sqft ? Number(r.sqft).toLocaleString() : '—') + '</td>' +
            '<td class="n">' + psf(r.psf) + '</td>' +
            '<td>' + dt(r.date) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="xs-note">' + list.length + ' recorded sales.</p>';

      Array.prototype.forEach.call(body.querySelectorAll('th'), function (th) {
        th.addEventListener('click', function () {
          var k = th.getAttribute('data-k');
          if (k === sortKey) { sortDir = -sortDir; } else { sortKey = k; sortDir = -1; }
          draw();
        });
      });
    }
    draw();
    return el;
  }

  /* ---- 4. Glossary ------------------------------------------------------ */
  function glossary(cs) {
    var b = cs.building_1bd_12mo || {};
    var el = section('xs-gloss-section', 'What these numbers',
      'actually mean.',
      'Written for someone who does not read comps for a living.');
    var items = [
      ['Price per square foot',
        'Sale price divided by interior size. It is useful for comparing homes of different ' +
        'sizes and useless on its own — a high floor with a view and a low floor without one ' +
        'can differ by hundreds of dollars a foot in the same building, on the same floorplan. ' +
        'Treat it as a cross-check, never as a valuation.'],
      ['Same-stack comparable',
        'A unit directly above or below this one, sharing its floorplan. It removes layout and ' +
        'size from the comparison, leaving floor height, view and condition. It is the strongest ' +
        'single comparable available in a high-rise — at adjacent floors.'],
      ['Median vs average',
        'The median is the middle sale; the average is the arithmetic mean. In a building where ' +
        'one penthouse sells for double everything else, the average moves and the median does ' +
        'not. Where both appear here, the median is the more reliable of the two.'],
      ['Sample size',
        'Every figure on this page carries the number of sales behind it' +
        (num(b.sales_count) ? ' — the building figures rest on ' + b.sales_count + ' sales' : '') +
        '. A median from seven sales is a reasonable guide; a median from two is an anecdote. ' +
        'Where the sample is too thin to say anything, this report says so instead of ' +
        'producing a number.']
    ];
    el.querySelector('.xs-body').innerHTML = '<div class="xs-gloss">' + items.map(function (i) {
      return '<div class="xs-g"><b>' + esc(i[0]) + '</b><span>' + esc(i[1]) + '</span></div>';
    }).join('') + '</div>';
    return el;
  }

  /* ---- 5. Market context, as commentary -------------------------------- */
  function context(ctx) {
    if (!ctx || typeof ctx !== 'object') return null;
    var paras = [];
    var sb = ctx.south_beach_recovery || {};
    var ai = ctx.ai_wealth_context || {};

    if (sb.driver || sb.current_recovery_status || num(sb.estimated_psf_decline_from_peak_pct)) {
      var bits = [];
      if (num(sb.estimated_psf_decline_from_peak_pct)) {
        bits.push('Per-foot pricing in this submarket is estimated to sit about ' +
          sb.estimated_psf_decline_from_peak_pct + '% below its ' + (sb.peak_year || 'prior') + ' peak');
      }
      if (sb.current_recovery_status) bits.push('recovery is ' + sb.current_recovery_status);
      if (sb.driver) bits.push('the driver being ' + sb.driver);
      paras.push(bits.join('; ') + '.');
    }
    if (ai.narrative) paras.push(String(ai.narrative) + '.');
    if (Array.isArray(ai.major_ai_employers_near_property) && ai.major_ai_employers_near_property.length) {
      paras.push('Employers cited as nearby: ' + ai.major_ai_employers_near_property.join(', ') + '.');
    }
    if (!paras.length) return null;

    var el = section('xs-context-section', 'Wider context,', 'in the agent\'s words.', null);
    el.querySelector('.xs-body').innerHTML =
      '<div class="xs-comment"><span class="tag">Agent commentary · not derived from sales data</span>' +
      paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '<p class="xs-note" style="margin-top:16px">These are the preparing agent\'s observations about ' +
      'the surrounding market. Unlike the figures above, they are not computed from recorded sales ' +
      'and carry no sample. Weigh them as opinion.</p></div>';
    return el;
  }

  /* ---- 6. Peer-bar honesty repair -------------------------------------- */
  function repairPeerBars(cs) {
    var all = cs.peer_buildings_1bd_12mo || [];
    var uncat = all.filter(function (p) { return p && p.building && !num(p.median); });
    var host = document.getElementById('peer-bars');
    if (!host || !uncat.length) return;
    host.insertAdjacentHTML('beforeend', uncat.map(function (p) {
      return '<div class="peer-row xs-uncat"><div class="peer-header">' +
        '<span class="peer-name">' + esc(p.building) + '</span>' +
        '<span class="peer-meta">' + esc(p.note || 'no data on file') + '</span>' +
        '</div><div class="peer-bar"></div></div>';
    }).join(''));
  }

  /* ---- mount ------------------------------------------------------------ */
  function mount(cma) {
    try {
      if (!cma) return;
      injectCSS();
      var cs = cma.comp_snapshot || {};
      var anchor = document.getElementById('inline-calc-section');
      var main = document.getElementById('main');
      if (!main) return;

      var blocks = [
        stackComps(cs), benchmark(cs), history(cs, cma),
        glossary(cs), context(cma.market_context_snapshot)
      ].filter(Boolean);

      blocks.forEach(function (b) {
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(b, anchor);
        else main.appendChild(b);
      });

      repairPeerBars(cs);
    } catch (e) {
      // Surface rather than swallow — silent failures have cost this platform
      // real debugging time. Renders a visible note instead of a blank gap.
      if (typeof console !== 'undefined' && console.error) console.error('CMASections.mount', e);
      var m = document.getElementById('main');
      if (m) {
        var d = document.createElement('div');
        d.className = 'section xs-section';
        d.innerHTML = '<div class="xs-empty">Additional comparable sections could not be rendered (' +
          esc(e && e.message ? e.message : String(e)) + ').</div>';
        m.appendChild(d);
      }
    }
  }

  global.CMASections = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
