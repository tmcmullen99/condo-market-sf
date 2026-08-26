/* =============================================================================
 * cm-dossier.js  —  Condo Market interactive building dossier (stacking plan)
 * Desktop: full heat-colored tower + expanded unit card. Mobile: single-screen
 * building (floors as bars) -> tap floor -> unit list -> tap unit -> detail.
 * MMM units get a solid accent fill + pulse so they pop off the heat map.
 * Uses page CSS vars so per-market accent is inherited; heat ramp is independent.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__CM_DOSSIER__) return;
  window.__CM_DOSSIER__ = true;

  var SUPABASE_URL  = 'https://kfqphwerygccpzntbbif.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

  /* Flip to true to hide exact price + date behind sign-in (members model). */
  var GATE_PRICES = false;

  var match = location.pathname.match(/\/building\/([^\/]+)/);
  if (!match) return;
  var SLUG = decodeURIComponent(match[1]).trim().toLowerCase();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function boot() {
    injectCSS();
    rpc('building_dossier', { p_slug: SLUG })
      .then(function (d) { if (d) mount(d); })
      .catch(function (e) { console.warn('[cm-dossier]', e); });
  }

  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    }).then(function (r) { if (!r.ok) throw new Error('rpc ' + name + ' ' + r.status); return r.json(); });
  }

  /* ----------------------------- helpers ---------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ulabel(s) { return '#' + String(s == null ? '' : s).replace(/^#+/, '').toUpperCase(); }
  function money(n) { return (n == null || isNaN(n)) ? '\u2014' : '$' + Number(n).toLocaleString('en-US'); }
  function nf(n) { return (n == null || isNaN(n)) ? '\u2014' : Number(n).toLocaleString('en-US'); }
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(iso) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return esc(iso);
    return MONTHS[(+m[2]) - 1] + ' ' + (+m[3]) + ', ' + m[1];
  }

  /* heat ramp: cool blue -> warm gold -> hot red, anchored to p05..p95 */
  var COOL = [74, 105, 150], MID = [217, 164, 65], HOT = [217, 69, 69];
  function hx(c) { var s = Math.round(c).toString(16); return s.length < 2 ? '0' + s : s; }
  function mix(a, b, t) { return '#' + hx(a[0]+(b[0]-a[0])*t) + hx(a[1]+(b[1]-a[1])*t) + hx(a[2]+(b[2]-a[2])*t); }
  function psfColor(psf, lo, hi) {
    if (psf == null) return null;
    if (hi == null || lo == null || hi <= lo) return mix(COOL, HOT, 0.5);
    var t = (psf - lo) / (hi - lo); t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t < 0.5 ? mix(COOL, MID, t / 0.5) : mix(MID, HOT, (t - 0.5) / 0.5);
  }

  /* ----------------------------- builders --------------------------------- */
  function buildTower(d, lo, hi) {
    var stacks = d.stacks || [];
    if (!stacks.length || d.floor_max == null) return '';
    var map = {}, unplaced = [];
    d.units.forEach(function (u) {
      if (u.floor != null && u.stack) map[u.floor + '|' + u.stack] = u;
      else unplaced.push(u);
    });
    var html = '<div class="cmd-tower" style="--cmd-cols:' + stacks.length + '">';
    html += '<div class="cmd-trow cmd-thead"><div class="cmd-axis"></div>';
    stacks.forEach(function (s) { html += '<div class="cmd-stacklab">' + esc(s) + '</div>'; });
    html += '</div>';
    for (var f = d.floor_max; f >= d.floor_min; f--) {
      html += '<div class="cmd-trow"><div class="cmd-axis">' + f + '</div>';
      for (var i = 0; i < stacks.length; i++) {
        var u = map[f + '|' + stacks[i]];
        if (!u) { html += '<div class="cmd-cell cmd-empty"></div>'; continue; }
        var col = psfColor(u.psf, lo, hi) || 'rgba(255,255,255,0.06)';
        var mmm = u.mmm != null;
        var title = ulabel(u.label) + (u.sqft ? ' \u00b7 ' + nf(u.sqft) + ' sf' : '') +
          (u.price ? ' \u00b7 ' + money(u.price) : '') + (u.psf ? ' \u00b7 $' + u.psf + '/ft\u00b2' : '') +
          (mmm ? ' \u00b7 MMM ' + money(u.mmm) : '');
        html += '<button class="cmd-cell' + (mmm ? ' cmd-mmm' : '') + '" style="background:' + col +
          '" data-u="' + esc(u.u) + '" title="' + esc(title) + '">' + (mmm ? '<span class="cmd-dot"></span>' : '') + '</button>';
      }
      html += '</div>';
    }
    html += '</div>';
    if (unplaced.length) {
      html += '<div class="cmd-unplaced"><div class="cmd-unplaced-lab">Other residences</div><div class="cmd-unplaced-row">';
      unplaced.forEach(function (u) {
        var col = psfColor(u.psf, lo, hi) || 'var(--cm-rule)';
        html += '<button class="cmd-chip' + (u.mmm != null ? ' cmd-mmm' : '') + '" style="border-left-color:' + col +
          '" data-u="' + esc(u.u) + '">' + esc(ulabel(u.label)) + '</button>';
      });
      html += '</div></div>';
    }
    return html;
  }

  /* mobile single-screen building: floors as bars, tap floor -> unit list */
  function buildMini(d, lo, hi) {
    if (d.floor_max == null) return '';
    var stacks = d.stacks || [];
    var byFloor = {};
    d.units.forEach(function (u) { if (u.floor != null) (byFloor[u.floor] = byFloor[u.floor] || []).push(u); });
    var html = '<div class="cmd-mini" style="--cmd-cols:' + (stacks.length || 1) + '">';
    for (var f = d.floor_max; f >= d.floor_min; f--) {
      var units = byFloor[f] || [];
      var segs = '';
      if (stacks.length) {
        for (var i = 0; i < stacks.length; i++) {
          var u = null;
          for (var j = 0; j < units.length; j++) { if (units[j].stack === stacks[i]) { u = units[j]; break; } }
          var col = u ? (psfColor(u.psf, lo, hi) || 'rgba(255,255,255,0.06)') : 'rgba(255,255,255,0.035)';
          segs += '<span class="cmd-mini-seg' + (u && u.mmm != null ? ' cmd-mmm' : '') + '" style="background:' + col + '"></span>';
        }
      } else {
        segs = '<span class="cmd-mini-seg" style="background:rgba(255,255,255,0.06)"></span>';
      }
      var hasMMM = false; for (var k = 0; k < units.length; k++) { if (units[k].mmm != null) { hasMMM = true; break; } }
      html += '<button class="cmd-mini-floor' + (hasMMM ? ' cmd-has-mmm' : '') + '" data-floor="' + f + '">' +
        '<span class="cmd-mini-fl">' + f + '</span>' +
        '<span class="cmd-mini-bar">' + segs + '</span>' +
        '<span class="cmd-mini-ct">' + (units.length || '') + '</span></button>';
    }
    html += '</div>';
    return html;
  }

  function buildTable(d) {
    var rows = d.units.slice().sort(function (a, b) {
      var fa = a.floor == null ? -1 : a.floor, fb = b.floor == null ? -1 : b.floor;
      if (fb !== fa) return fb - fa;
      return String(a.stack || '').localeCompare(String(b.stack || ''));
    });
    var body = rows.map(function (u) {
      var bb = (u.beds != null ? u.beds + ' bd' : '') + (u.baths != null ? (u.beds != null ? ' / ' : '') + u.baths + ' ba' : '');
      return '<tr data-u="' + esc(u.u) + '">' +
        '<td class="cmd-td-floor">' + (u.floor != null ? u.floor : '\u2014') + '</td>' +
        '<td class="cmd-td-unit">' + esc(ulabel(u.label)) + (u.mmm != null ? ' <span class="cmd-tag">MMM</span>' : '') + '</td>' +
        '<td>' + (bb || '\u2014') + '</td>' +
        '<td>' + (u.sqft ? nf(u.sqft) : '\u2014') + '</td>' +
        '<td>' + money(u.price) + '</td>' +
        '<td class="cmd-td-date">' + (fmtDate(u.date) || '\u2014') + '</td>' +
        '<td class="cmd-td-psf">' + (u.psf != null ? '$' + u.psf : '\u2014') + '</td>' +
        '</tr>';
    }).join('');
    return '<table class="cmd-table"><thead><tr>' +
      '<th data-sort="floor">Floor</th><th data-sort="label">Unit</th><th>Bed / Bath</th>' +
      '<th data-sort="sqft">Sqft</th><th data-sort="price">Last sale</th><th data-sort="date">Date</th><th data-sort="psf">$/ft\u00b2</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function panelEmpty() {
    return '<div class="cmd-panel-empty">Select any unit on the tower to see its full history \u2014 beds, baths, size, last sale, price per foot. Hover a cell for a quick read.</div>';
  }

  function floorSheet(floorNum, units) {
    var sorted = units.slice().sort(function (a, b) { return String(a.stack || a.label).localeCompare(String(b.stack || b.label)); });
    var items = sorted.map(function (u) {
      var mmm = u.mmm != null;
      var meta = [];
      if (u.beds != null) meta.push(u.beds + 'bd');
      if (u.baths != null) meta.push(u.baths + 'ba');
      if (u.sqft) meta.push(nf(u.sqft) + ' sf');
      if (u.psf != null) meta.push('$' + u.psf + '/ft\u00b2');
      return '<button class="cmd-fl-item" data-u="' + esc(u.u) + '">' +
        '<span class="cmd-fl-unit">' + esc(ulabel(u.label)) + (mmm ? ' <span class="cmd-tag">MMM</span>' : '') + '</span>' +
        '<span class="cmd-fl-meta">' + esc(meta.join(' \u00b7 ')) + '</span>' +
        '<span class="cmd-fl-price">' + money(mmm ? u.mmm : u.price) + '</span></button>';
    }).join('');
    return '<button class="cmd-p-close" data-cmd-close aria-label="Close">\u00d7</button>' +
      '<div class="cmd-fl-head">Floor ' + floorNum + ' \u00b7 ' + units.length + ' unit' + (units.length === 1 ? '' : 's') + '</div>' +
      '<div class="cmd-fl-list">' + items + '</div>';
  }

  function ownerLink(addr, label) {
    if (!addr) return '#offer';
    var u = '/owner-signup/?address=' + encodeURIComponent(addr);
    if (label) u += '&unit=' + encodeURIComponent(label);
    return u;
  }

  function panelFor(u, addr, backFloor) {
    var mmm = u.mmm != null;
    var lab = esc(ulabel(u.label));

    var priceBlock = !GATE_PRICES
      ? '<div class="cmd-p-price">' + money(u.price) + '</div>' +
        '<div class="cmd-p-sub">Last recorded sale price</div>'
      : '<div class="cmd-p-price cmd-p-lock">$\u2014\u2014\u2014</div>' +
        '<div class="cmd-p-sub"><a href="#signin" data-cm-auth="login" style="color:var(--cm-peri);">Sign in</a> to see the sale price</div>';

    function row(lbl, val) { return '<div class="cmd-p-row"><span>' + lbl + '</span><span class="v">' + val + '</span></div>'; }
    var details =
      row('Bedrooms', u.beds != null ? u.beds : '\u2014') +
      row('Bathrooms', u.baths != null ? u.baths : '\u2014') +
      row('Interior', u.sqft ? nf(u.sqft) + ' ft\u00b2' : '\u2014') +
      row('Price / ft\u00b2', u.psf != null ? '$' + nf(u.psf) : '\u2014') +
      row('Sold', !GATE_PRICES ? (fmtDate(u.date) || '\u2014') : '\u2014') +
      row('Recorded sales', u.sales != null ? u.sales : '\u2014');

    var mmmBanner = mmm
      ? '<div class="cmd-mmm-banner">The owner has named a <b>Make-Me-Move</b> price of <b>' + money(u.mmm) + '</b>. Submit an offer at or above and we route it through a licensed agent.</div>'
      : '';

    /* The unit label has to travel with the trigger.

       cm-offer-modal already accepts data-unit-label and renders a
       unit-specific header from it - but neither of these buttons was passing
       one, so selecting 51C in the tower and pressing "Make an offer" still
       opened "Your number for any unit at The Avery". The whole point of
       clicking a unit was lost at the last step. */
    var unitAttr = ' data-unit-label="' + esc(u.label || '') + '"';
    var cta = mmm
      ? '<a class="cmd-cta-primary" href="#offer" data-cm-offer-trigger data-building-slug="' + esc(SLUG) + '"' + unitAttr + ' data-suggested-price="' + u.mmm + '">Make an offer on ' + lab + ' \u2192</a>' +
        '<a class="cmd-cta-ghost" href="' + esc(ownerLink(addr, u.label)) + '">Is ' + lab + ' yours? \u2192</a>'
      : '<a class="cmd-cta-primary" href="' + esc(ownerLink(addr, u.label)) + '">Own ' + lab + '? Name your price \u2192</a>' +
        '<a class="cmd-cta-ghost" href="#offer" data-cm-offer-trigger data-building-slug="' + esc(SLUG) + '"' + unitAttr + '>Make an offer on ' + lab + ' \u2192</a>';

    var back = (backFloor != null) ? '<button class="cmd-p-back" data-cmd-backfloor>\u2039 Floor ' + backFloor + '</button>' : '';
    var kicker = (u.floor != null)
      ? '<div class="cmd-p-floor">Floor ' + u.floor + (mmm ? ' \u00b7 <span class="cmd-p-mmmtag">Make-Me-Move</span>' : '') + '</div>'
      : (mmm ? '<div class="cmd-p-floor"><span class="cmd-p-mmmtag">Make-Me-Move</span></div>' : '');

    return '<button class="cmd-p-close" data-cmd-close aria-label="Close">\u00d7</button>' + back +
      '<div class="cmd-p-unit">' + lab + '</div>' + kicker +
      priceBlock +
      '<div class="cmd-p-grid">' + details + '</div>' +
      mmmBanner + cta;
  }

  /* ------------------------------- mount ---------------------------------- */
  function mount(d) {
    if (!d.units || !d.units.length) return;
    var lo = d.psf_p05, hi = d.psf_p95;
    var byU = {}, byFloor = {};
    d.units.forEach(function (u) {
      byU[u.u] = u;
      if (u.floor != null) (byFloor[u.floor] = byFloor[u.floor] || []).push(u);
    });
    var addrEl = document.querySelector('.hero-addr');
    var addr = addrEl ? addrEl.textContent.trim() : '';

    var hasTower = !!(d.stacks && d.stacks.length && d.floor_max != null);
    var hasFloors = d.floor_max != null;
    var cov = nf(d.units_with_data);
    var tot = d.unit_count != null ? nf(d.unit_count) : null;
    var floors = (d.floor_min != null && d.floor_max != null) ? ('floors ' + d.floor_min + '\u2013' + d.floor_max) : '';
    var psfr = (d.psf_p05 != null && d.psf_p95 != null) ? ('$' + nf(d.psf_p05) + '\u2013$' + nf(d.psf_p95) + '/ft\u00b2') : '';
    var med = (d.psf_p50 != null) ? ('median $' + nf(d.psf_p50) + '/ft\u00b2') : '';
    var summ = '<b>' + cov + '</b> ' + (tot ? 'of ' + tot + ' ' : '') + 'units with recorded sales' +
      (floors ? ' \u00b7 ' + floors : '') + (psfr ? ' \u00b7 ' + psfr : '') + (med ? ' \u00b7 ' + med : '');

    var towerHtml = (hasTower ? buildTower(d, lo, hi) : '') + (hasFloors ? buildMini(d, lo, hi) : '');
    var showTowerView = hasTower || hasFloors;

    var inner =
      '<div class="cmd-summary">' + summ + '</div>' +
      '<div class="cmd-toolbar">' +
        '<div class="cmd-toggle">' +
          (showTowerView ? '<button data-cmd-view="tower" class="on">Tower</button>' : '') +
          '<button data-cmd-view="table"' + (showTowerView ? '' : ' class="on"') + '>Table</button>' +
        '</div>' +
        '<div class="cmd-legend"><span>Lower $/ft\u00b2</span><span class="cmd-legend-bar"></span><span>Higher</span></div>' +
      '</div>' +
      '<div class="cmd-body">' +
        '<div class="cmd-views">' +
          (showTowerView ? '<div class="cmd-view cmd-view-tower">' + towerHtml + '</div>' : '') +
          '<div class="cmd-view cmd-view-table"' + (showTowerView ? ' hidden' : '') + '>' + buildTable(d) + '</div>' +
        '</div>' +
        '<aside class="cmd-panel" id="cmd-panel">' + panelEmpty() + '</aside>' +
      '</div>';

    var host, dossier = document.getElementById('dossier');
    var fm = document.getElementById('featured-mmm');
    if (dossier) {
      if (fm && fm.parentNode) fm.insertAdjacentElement('afterend', dossier);
      host = document.createElement('div');
      host.className = 'cmd-host';
      host.innerHTML = inner;
      var head = dossier.querySelector('.dossier-head');
      if (head) head.insertAdjacentElement('afterend', host);
      else { var w = dossier.querySelector('.wrap') || dossier; w.insertBefore(host, w.firstChild); }
    } else {
      var sec = document.createElement('section');
      sec.className = 'dossier-section'; sec.id = 'dossier';
      sec.innerHTML = '<div class="wrap"><div class="dossier-head">' +
        '<div class="dossier-kicker">The Dossier</div>' +
        '<h2 class="dossier-title">' + esc(d.name) + ', unit by <em>unit</em></h2></div>' +
        '<div class="cmd-host">' + inner + '</div></div>';
      if (fm && fm.parentNode) fm.insertAdjacentElement('afterend', sec);
      else { var main = document.querySelector('main'); if (main) main.appendChild(sec); }
      host = sec.querySelector('.cmd-host');
    }

    var navRow = document.querySelector('.sticky-nav-row');
    if (navRow) {
      var link = navRow.querySelector('a[href="#dossier"]');
      if (link) navRow.insertBefore(link, navRow.firstChild);
      else { var a = document.createElement('a'); a.href = '#dossier'; a.textContent = 'Dossier'; navRow.insertBefore(a, navRow.firstChild); }
    }

    var panel = host.querySelector('#cmd-panel');
    var sortState = {};
    var openFloor = null;

    function showFloor(f) {
      openFloor = f;
      panel.innerHTML = floorSheet(f, byFloor[f] || []);
      panel.classList.add('cmd-open');
    }
    function selectUnit(u) {
      if (!u) return;
      panel.innerHTML = panelFor(u, addr, openFloor);
      host.querySelectorAll('.is-sel').forEach(function (el) { el.classList.remove('is-sel'); });
      host.querySelectorAll('[data-u="' + u.u + '"]').forEach(function (el) { el.classList.add('is-sel'); });
      if (window.innerWidth < 900) panel.classList.add('cmd-open');
    }
    function setView(v) {
      var tw = host.querySelector('.cmd-view-tower'), tb = host.querySelector('.cmd-view-table');
      if (!tw) v = 'table';
      host.querySelectorAll('[data-cmd-view]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-cmd-view') === v); });
      if (tw) tw.hidden = v !== 'tower';
      if (tb) tb.hidden = v !== 'table';
    }
    function sortTable(key) {
      var tb = host.querySelector('.cmd-table tbody'); if (!tb) return;
      var dir = sortState[key] = (sortState[key] === 'asc' ? 'desc' : 'asc');
      var rows = Array.prototype.slice.call(tb.children);
      rows.sort(function (ra, rb) {
        var a = byU[ra.getAttribute('data-u')] || {}, b = byU[rb.getAttribute('data-u')] || {};
        var va = a[key], vb = b[key];
        if (key === 'label' || key === 'date') {
          va = String(va || ''); vb = String(vb || '');
          return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        va = va == null ? -Infinity : va; vb = vb == null ? -Infinity : vb;
        return dir === 'asc' ? va - vb : vb - va;
      });
      rows.forEach(function (r) { tb.appendChild(r); });
    }

    host.addEventListener('click', function (e) {
      var close = e.target.closest('[data-cmd-close]');
      if (close) { panel.classList.remove('cmd-open'); openFloor = null; return; }
      var back = e.target.closest('[data-cmd-backfloor]');
      if (back) { if (openFloor != null) showFloor(openFloor); return; }
      var vt = e.target.closest('[data-cmd-view]');
      if (vt) { setView(vt.getAttribute('data-cmd-view')); return; }
      var th = e.target.closest('th[data-sort]');
      if (th) { sortTable(th.getAttribute('data-sort')); return; }
      var fl = e.target.closest('[data-floor]');
      if (fl) { showFloor(+fl.getAttribute('data-floor')); return; }
      var hit = e.target.closest('[data-u]');
      if (hit) { selectUnit(byU[hit.getAttribute('data-u')]); }
    });

    setView(showTowerView ? 'tower' : 'table');
  }

  /* ------------------------------- styles --------------------------------- */
  function injectCSS() {
    if (document.getElementById('cmd-css')) return;
    var css =
    '.cmd-host{margin-top:36px;}' +
    '.cmd-summary{font-family:var(--ff-mono);font-size:12px;letter-spacing:.03em;color:var(--cm-ivory-dim);margin-bottom:18px;}' +
    '.cmd-summary b{color:var(--cm-ivory);font-weight:500;}' +
    '.cmd-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px;}' +
    '.cmd-toggle{display:inline-flex;border:1px solid var(--cm-rule);border-radius:999px;padding:4px;background:var(--cm-navy-deep);}' +
    '.cmd-toggle button{font-family:var(--ff-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--cm-ivory-dim);padding:8px 18px;border:none;background:transparent;border-radius:999px;cursor:pointer;transition:all .15s;}' +
    '.cmd-toggle button.on{background:var(--cm-peri);color:var(--cm-navy);}' +
    '.cmd-legend{display:flex;align-items:center;gap:10px;font-family:var(--ff-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--cm-ivory-dim);}' +
    '.cmd-legend-bar{width:120px;height:8px;border-radius:999px;background:linear-gradient(90deg,#4a6996,#d9a441,#d94545);}' +
    '.cmd-body{display:grid;grid-template-columns:1fr;gap:24px;}' +
    '@media(min-width:900px){.cmd-body{grid-template-columns:minmax(0,1fr) 300px;align-items:start;}}' +
    '.cmd-views{min-width:0;}' +
    '.cmd-view-tower{overflow-x:auto;padding-bottom:6px;}' +
    '.cmd-tower{display:inline-block;min-width:100%;}' +
    '.cmd-trow{display:grid;grid-template-columns:30px repeat(var(--cmd-cols),minmax(17px,1fr));gap:3px;margin-bottom:3px;}' +
    '.cmd-thead{margin-bottom:6px;}' +
    '.cmd-axis{font-family:var(--ff-mono);font-size:9px;color:var(--cm-ivory-dim);display:flex;align-items:center;justify-content:flex-end;padding-right:5px;}' +
    '.cmd-stacklab{font-family:var(--ff-mono);font-size:9px;color:var(--cm-ivory-dim);text-align:center;}' +
    '.cmd-cell{position:relative;aspect-ratio:1;border:none;border-radius:2px;cursor:pointer;padding:0;min-height:17px;transition:transform .1s,box-shadow .1s;}' +
    '.cmd-cell:hover{transform:scale(1.16);box-shadow:0 0 0 2px var(--cm-ivory);z-index:2;}' +
    '.cmd-cell.is-sel{box-shadow:0 0 0 2px var(--cm-ivory),0 0 0 4px var(--cm-peri);z-index:3;}' +
    '.cmd-empty{background:rgba(255,255,255,0.04);cursor:default;}' +
    '.cmd-empty:hover{transform:none;box-shadow:none;}' +
    /* MMM units: solid accent fill + pulse so they pop off the heat map */
    '.cmd-cell.cmd-mmm{background:var(--cm-peri)!important;z-index:1;animation:cmd-pulse 2.2s ease-in-out infinite;}' +
    '.cmd-cell.cmd-mmm:hover{transform:scale(1.18);}' +
    '.cmd-cell.cmd-mmm.is-sel{animation:none;box-shadow:0 0 0 2px var(--cm-ivory),0 0 0 4px var(--cm-peri);}' +
    '.cmd-cell.cmd-mmm .cmd-dot{position:absolute;top:2px;right:2px;width:5px;height:5px;border-radius:50%;background:var(--cm-navy);}' +
    '@keyframes cmd-pulse{0%,100%{box-shadow:0 0 0 2px var(--cm-ivory),0 0 6px 1px var(--cm-peri);}50%{box-shadow:0 0 0 2px var(--cm-ivory),0 0 17px 5px var(--cm-peri);}}' +
    '@media(prefers-reduced-motion:reduce){.cmd-cell.cmd-mmm{animation:none;box-shadow:0 0 0 2px var(--cm-ivory),0 0 10px 2px var(--cm-peri);}}' +
    '.cmd-unplaced{margin-top:20px;}' +
    '.cmd-unplaced-lab{font-family:var(--ff-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--cm-ivory-dim);margin-bottom:8px;}' +
    '.cmd-unplaced-row{display:flex;flex-wrap:wrap;gap:8px;}' +
    '.cmd-chip{font-family:var(--ff-mono);font-size:11px;color:var(--cm-ivory);background:var(--cm-navy-deep);border:1px solid var(--cm-rule);border-left-width:3px;border-radius:6px;padding:6px 10px;cursor:pointer;}' +
    '.cmd-chip.cmd-mmm{background:var(--cm-peri);border-color:var(--cm-peri);color:var(--cm-navy);font-weight:600;}' +
    '.cmd-chip.is-sel{border-color:var(--cm-peri);}' +
    '.cmd-mini{display:none;}' +
    '.cmd-view-table{overflow-x:auto;}' +
    '.cmd-table{width:100%;border-collapse:collapse;font-size:13px;}' +
    '.cmd-table th{font-family:var(--ff-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cm-ivory-dim);text-align:left;padding:10px 12px;border-bottom:1px solid var(--cm-rule);cursor:pointer;white-space:nowrap;}' +
    '.cmd-table th:hover{color:var(--cm-peri);}' +
    '.cmd-table td{padding:11px 12px;border-bottom:1px solid var(--cm-rule);color:var(--cm-ivory);}' +
    '.cmd-table tbody tr{cursor:pointer;}' +
    '.cmd-table tbody tr:hover{background:rgba(255,255,255,0.03);}' +
    '.cmd-table tr.is-sel{background:rgba(255,255,255,0.07);}' +
    '.cmd-td-unit{font-family:var(--ff-display);font-style:italic;}' +
    '.cmd-td-psf,.cmd-td-date{font-family:var(--ff-mono);font-size:12px;color:var(--cm-ivory-dim);}' +
    '.cmd-tag{font-family:var(--ff-mono);font-size:9px;letter-spacing:.06em;color:var(--cm-navy);background:var(--cm-peri);padding:1px 5px;border-radius:3px;vertical-align:middle;}' +
    '.cmd-panel{background:var(--cm-navy-deep);border:1px solid var(--cm-rule);border-radius:12px;padding:24px;position:sticky;top:80px;}' +
    '.cmd-panel-empty{color:var(--cm-ivory-dim);font-size:14px;line-height:1.65;}' +
    '.cmd-p-unit{font-family:var(--ff-display);font-style:italic;font-weight:500;font-size:34px;color:var(--cm-ivory);line-height:1;}' +
    '.cmd-p-back{display:block;background:none;border:none;color:var(--cm-ivory-dim);font-family:var(--ff-mono);font-size:11px;letter-spacing:.06em;cursor:pointer;margin-bottom:12px;padding:0;}' +
    '.cmd-p-back:hover{color:var(--cm-peri);}' +
    '.cmd-p-floor{font-family:var(--ff-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cm-ivory-dim);margin:9px 0 16px;}' +
    '.cmd-p-mmmtag{color:var(--cm-peri);}' +
    '.cmd-p-price{font-family:var(--ff-display);font-weight:500;font-size:30px;color:var(--cm-peri);line-height:1;}' +
    '.cmd-p-price.cmd-p-lock{filter:blur(6px);opacity:.5;user-select:none;}' +
    '.cmd-p-sub{font-family:var(--ff-mono);font-size:11px;color:var(--cm-ivory-dim);margin:8px 0 16px;}' +
    '.cmd-p-grid{margin-top:4px;}' +
    '.cmd-p-row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--cm-rule);font-size:13px;color:var(--cm-ivory-dim);}' +
    '.cmd-p-row .v{color:var(--cm-ivory);font-family:var(--ff-mono);}' +
    '.cmd-mmm-banner{margin:16px 0 0;padding:12px 14px;border:1px dashed var(--cm-peri);border-radius:8px;font-size:12px;line-height:1.5;color:var(--cm-ivory);}' +
    '.cmd-mmm-banner b{color:var(--cm-peri);font-weight:500;}' +
    '.cmd-cta-primary{display:block;text-align:center;background:var(--cm-peri);color:var(--cm-navy);border-radius:999px;padding:12px 18px;font-weight:500;font-size:13px;margin-top:18px;text-decoration:none;}' +
    '.cmd-cta-primary:hover{opacity:.9;}' +
    '.cmd-cta-ghost{display:block;text-align:center;border:1px solid var(--cm-rule);color:var(--cm-ivory);border-radius:999px;padding:11px 18px;font-size:13px;margin-top:10px;text-decoration:none;transition:all .15s;}' +
    '.cmd-cta-ghost:hover{border-color:var(--cm-peri);color:var(--cm-peri);}' +
    '.cmd-fl-head{font-family:var(--ff-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--cm-peri);margin-bottom:14px;}' +
    '.cmd-fl-list{display:flex;flex-direction:column;}' +
    '.cmd-fl-item{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:baseline;padding:12px 0;border:none;border-bottom:1px solid var(--cm-rule);background:none;cursor:pointer;text-align:left;width:100%;}' +
    '.cmd-fl-unit{font-family:var(--ff-display);font-style:italic;font-size:16px;color:var(--cm-ivory);}' +
    '.cmd-fl-meta{font-family:var(--ff-mono);font-size:10px;color:var(--cm-ivory-dim);}' +
    '.cmd-fl-price{font-family:var(--ff-mono);font-size:13px;color:var(--cm-peri);}' +
    '.cmd-p-close{display:none;}' +
    '@media(max-width:899px){' +
      '.cmd-legend{display:none;}' +
      '.cmd-host{margin-top:22px;}' +
      '.cmd-view-tower .cmd-tower,.cmd-view-tower .cmd-unplaced{display:none;}' +
      '.cmd-mini{display:flex;flex-direction:column;gap:2px;height:58vh;}' +
      '.cmd-mini-floor{flex:1 1 0;min-height:0;display:flex;align-items:center;gap:8px;background:transparent;border:none;padding:0 2px;cursor:pointer;width:100%;}' +
      '.cmd-mini-fl{font-family:var(--ff-mono);font-size:9px;color:var(--cm-ivory-dim);width:22px;text-align:right;flex:none;}' +
      '.cmd-has-mmm .cmd-mini-fl{color:var(--cm-peri);}' +
      '.cmd-mini-bar{display:grid;grid-template-columns:repeat(var(--cmd-cols),1fr);gap:2px;flex:1 1 auto;height:100%;border-radius:2px;overflow:hidden;}' +
      '.cmd-mini-seg{display:block;height:100%;width:100%;}' +
      '.cmd-mini-seg.cmd-mmm{background:var(--cm-peri)!important;box-shadow:inset 0 0 0 1px var(--cm-ivory);}' +
      '.cmd-mini-ct{font-family:var(--ff-mono);font-size:9px;color:var(--cm-ivory-faint);width:16px;text-align:left;flex:none;}' +
      '.cmd-mini-floor:active .cmd-mini-bar{box-shadow:0 0 0 1px var(--cm-ivory);}' +
      '.cmd-panel{position:fixed;left:0;right:0;bottom:0;top:auto;border-radius:16px 16px 0 0;transform:translateY(110%);transition:transform .25s;z-index:120;max-height:82vh;overflow:auto;box-shadow:0 -10px 40px rgba(0,0,0,.5);}' +
      '.cmd-panel.cmd-open{transform:translateY(0);}' +
      '.cmd-p-close{display:block;position:absolute;top:16px;right:18px;font-size:24px;line-height:1;color:var(--cm-ivory-dim);background:none;border:none;cursor:pointer;}' +
    '}';
    var st = document.createElement('style');
    st.id = 'cmd-css';
    st.textContent = css;
    document.head.appendChild(st);
  }
})();
