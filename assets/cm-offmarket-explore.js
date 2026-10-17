/* =============================================================================
 * cm-offmarket-explore.js - browse the coming-soon list (Tim, 17 Oct 2026)
 * -----------------------------------------------------------------------------
 * "On All Coming Soon Page > include map based function, toggles, etc >
 * enhance user ability to sort/filter coming soon listings."
 *
 * Mounted by cm-offmarket.js (mountAccount) on /account/off-market/, around the
 * member's Coming soon grid. Zillow's pattern:
 *   - search (address, building, neighbourhood, ZIP), Price, Beds & baths and
 *     More (neighbourhood, size, has photos, in a building we track, new this
 *     week) as dropdowns on a desk and bottom sheets on a phone; a chip for every
 *     filter in force, and Clear all
 *   - Sort: newest, price low/high, price per sq ft, largest, most photos
 *   - Grid, Map + list (wide screens) and Map views; price pins ("$1.25M"),
 *     a pin shared by a building reads "3 homes"; a pin narrows the list to its
 *     homes; hovering a card lights its pin; "Search as I move the map"
 * The state rides in the address bar, so a filtered view can be shared or
 * bookmarked, and the view and sort are remembered on this device.
 *
 * Only what a member already sees is used: the member payload's coming-soon
 * rows. Price per sq ft is the asking price divided by the size, used to sort,
 * never shown as a value.
 * ========================================================================== */
(function () {
  'use strict';
  var LEAF = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  var PRICES = [500000, 750000, 1000000, 1250000, 1500000, 2000000, 2500000, 3000000, 5000000];
  var SIZES = [500, 750, 1000, 1250, 1500, 2000];
  var SORTS = [['new', 'Newest first'], ['plo', 'Price, low to high'], ['phi', 'Price, high to low'], ['ppsf', 'Price per sq ft, low to high'],
    ['size', 'Largest first'], ['photos', 'Most photos']];
  var VIEWS = [['grid', 'Grid'], ['split', 'Map + list'], ['map', 'Map']];
  var WIDE = window.matchMedia ? window.matchMedia('(min-width: 1100px)') : { matches: true };
  var PHONE = window.matchMedia ? window.matchMedia('(max-width: 720px)') : { matches: false };

  function e(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function short$(n) {
    if (n == null || isNaN(n)) return '';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    return '$' + Math.round(n / 1e3) + 'K';
  }
  function track(cta, x) { try { if (window.cmTrack) window.cmTrack('cta_click', Object.assign({ cta: cta }, x || {})); } catch (z) {} }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (z) { return null; } }
  function daysAgo(iso) { var t = Date.parse(String(iso || '') + 'T12:00:00Z'); return isNaN(t) ? 1e9 : (Date.now() - t) / 864e5; }
  function keyOf(it) { return it.building ? 'b:' + it.building : (it.y != null && it.x != null ? 'p:' + Number(it.y).toFixed(4) + ',' + Number(it.x).toFixed(4) : 'n:' + it.key); }
  function placeOf(list) { var a = list[0]; return list.length > 1 ? (a.bname || 'this spot') : a.title; }

  function css() {
    if (document.getElementById('csx-css')) return;
    var s = document.createElement('style'); s.id = 'csx-css';
    s.textContent =
      '.csx{margin:0 0 6px}' +
      '.csx-bar{position:sticky;top:var(--nav-h,56px);z-index:40;background:#f5f7fa;padding:10px 0 8px;margin:0 0 4px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.csx-search{flex:1 1 260px;min-width:0;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid rgba(26,31,46,.18);border-radius:999px;padding:0 14px;height:42px}' +
      '.csx-search:focus-within{border-color:#C2410C;box-shadow:0 0 0 3px rgba(194,65,12,.12)}' +
      '.csx-search svg{flex:0 0 16px;width:16px;height:16px;fill:none;stroke:#5d6575;stroke-width:2;stroke-linecap:round}' +
      '.csx-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:400 15px "DM Sans",system-ui,sans-serif;color:#1a1f2e;height:40px}' +
      '.csx-ctrls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.csx-dd{position:relative}' +
      '.csx-btn{appearance:none;display:inline-flex;align-items:center;gap:6px;height:42px;border:1px solid rgba(26,31,46,.18);background:#fff;color:#1a1f2e;font:600 13.5px "DM Sans",system-ui,sans-serif;padding:0 14px;border-radius:999px;cursor:pointer;white-space:nowrap}' +
      '.csx-btn:hover{border-color:#1a1f2e}.csx-btn.set{border-color:#C2410C;background:#fff3ec;color:#9a360c}' +
      '.csx-btn svg{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:1.8}' +
      '.csx-btn b{background:#C2410C;color:#fff;border-radius:999px;font:600 11px/18px "DM Sans",system-ui,sans-serif;min-width:18px;padding:0 5px;text-align:center}' +
      '.csx-pop{position:absolute;top:calc(100% + 8px);left:0;z-index:50;width:320px;max-width:calc(100vw - 32px);background:#fff;border:1px solid rgba(26,31,46,.12);border-radius:16px;box-shadow:0 20px 50px rgba(18,21,29,.22);padding:16px 16px 14px;display:none}' +
      '.csx-dd.r .csx-pop{left:auto;right:0}.csx-dd.open .csx-pop{display:block}' +
      '.csx-pop h4{margin:0 0 10px;font:600 13px "DM Sans",system-ui,sans-serif;color:#1a1f2e}.csx-pop h4+h4,.csx-pop .csx-gap{margin-top:16px}' +
      '.csx-row{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.csx-row span{color:#8a8f9a;font-size:13px}' +
      '.csx-pop select{width:100%;height:40px;border:1px solid rgba(26,31,46,.18);border-radius:10px;background:#fff;font:14px "DM Sans",system-ui,sans-serif;color:#1a1f2e;padding:0 8px}' +
      '.csx-seg{display:flex;border:1px solid rgba(26,31,46,.18);border-radius:10px;overflow:hidden}' +
      '.csx-seg button{flex:1;appearance:none;border:0;border-left:1px solid rgba(26,31,46,.12);background:#fff;font:600 13px "DM Sans",system-ui,sans-serif;color:#1a1f2e;height:38px;cursor:pointer;padding:0 4px}' +
      '.csx-seg button:first-child{border-left:0}.csx-seg button.on{background:#1a1f2e;color:#fff}' +
      '.csx-checks{max-height:190px;overflow:auto;display:grid;gap:2px;margin:0 -4px;padding:0 4px}' +
      '.csx-check{display:flex;align-items:center;gap:10px;font:14px "DM Sans",system-ui,sans-serif;color:#1a1f2e;padding:6px 2px;cursor:pointer}' +
      '.csx-check input{width:18px;height:18px;accent-color:#C2410C;margin:0}.csx-check i{margin-left:auto;font-style:normal;font:500 11px "JetBrains Mono",monospace;color:#8a8f9a}' +
      '.csx-sort{display:grid;gap:2px}.csx-sort button{appearance:none;border:0;background:none;text-align:left;font:500 14px "DM Sans",system-ui,sans-serif;color:#1a1f2e;padding:9px 10px;border-radius:9px;cursor:pointer}' +
      '.csx-sort button:hover{background:#f4f1ec}.csx-sort button.on{background:#fff3ec;color:#9a360c;font-weight:700}' +
      '.csx-done{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid rgba(26,31,46,.08)}' +
      '.csx-done a{font:600 13px "DM Sans",system-ui,sans-serif;color:#5d6575;cursor:pointer;text-decoration:underline}' +
      '.csx-done button{appearance:none;border:0;background:#C2410C;color:#fff;font:700 13.5px "DM Sans",system-ui,sans-serif;padding:10px 16px;border-radius:999px;cursor:pointer}' +
      '.csx-views{display:inline-flex;border:1px solid rgba(26,31,46,.18);border-radius:999px;background:#fff;padding:3px;height:42px;box-sizing:border-box}' +
      '.csx-views button{appearance:none;border:0;background:none;font:600 13px "DM Sans",system-ui,sans-serif;color:#5d6575;padding:0 13px;border-radius:999px;cursor:pointer;white-space:nowrap}' +
      '.csx-views button.on{background:#1a1f2e;color:#fff}.csx-views [data-view="split"][hidden]{display:none}' +
      '.csx-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:4px 0 14px;min-height:30px}' +
      '.csx-count{font:600 14px "DM Sans",system-ui,sans-serif;color:#1a1f2e;margin-right:4px}' +
      '.csx-chip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid rgba(194,65,12,.35);color:#9a360c;font:600 12.5px "DM Sans",system-ui,sans-serif;padding:5px 6px 5px 11px;border-radius:999px}' +
      '.csx-chip button{appearance:none;border:0;background:rgba(194,65,12,.12);color:#9a360c;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:14px;line-height:20px;padding:0}' +
      '.csx-clear{appearance:none;border:0;background:none;font:600 12.5px "DM Sans",system-ui,sans-serif;color:#5d6575;text-decoration:underline;cursor:pointer;padding:4px}' +
      '.csx-move{margin-left:auto;display:inline-flex;align-items:center;gap:8px;font:500 13px "DM Sans",system-ui,sans-serif;color:#3d4452;cursor:pointer}' +
      '.csx-move input{width:17px;height:17px;accent-color:#C2410C;margin:0}.csx-move[hidden]{display:none}' +
      '.csx-body{display:block}.csx-mapcol{display:none}' +
      '.csx-body.v-map .csx-mapcol,.csx-body.v-split .csx-mapcol{display:block}' +
      /* its own stacking context, so Leaflet's panes (z 400+) stay under the sticky bar */
      '.csx-map{position:relative;z-index:0;isolation:isolate;height:62vh;min-height:380px;border-radius:16px;overflow:hidden;border:1px solid rgba(26,31,46,.12);background:#eef0f2;margin:0 0 18px}' +
      '@media(min-width:1100px){.csx-body.v-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);gap:20px;align-items:start}' +
        '.csx-body.v-split .csx-mapcol{position:sticky;top:calc(var(--nav-h,56px) + 66px)}' +
        '.csx-body.v-split .csx-map{height:calc(100vh - var(--nav-h,56px) - 90px);min-height:420px;margin:0}' +
        '.csx-body.v-split .omx-grid{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}}' +
      '.csx-empty{background:#fff;border:1px dashed rgba(26,31,46,.22);border-radius:14px;padding:22px;color:#5d6575;font-size:.95rem;line-height:1.55}' +
      '.csx-empty button{appearance:none;border:0;background:#C2410C;color:#fff;font:700 13px "DM Sans",system-ui,sans-serif;padding:9px 14px;border-radius:999px;cursor:pointer;margin-top:10px}' +
      '.csx-off{font-size:.8rem;color:#6b7180;margin:-6px 0 14px}' +
      '.leaflet-div-icon.csx-di{background:none;border:0}' +
      '.csx-pin{display:inline-block;transform:translate(-50%,-100%);background:#12151d;color:#fff;font:700 12px/1 "DM Sans",system-ui,sans-serif;padding:6px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.3);cursor:pointer;position:relative;border:1.5px solid #fff}' +
      '.csx-pin:after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-5px;border:5px solid transparent;border-top-color:#12151d;border-bottom:0}' +
      '.csx-pin.grp{background:#fff;color:#12151d;border-color:#12151d}.csx-pin.grp:after{border-top-color:#12151d}' +
      '.csx-pin.on,.csx-pin:hover{background:#C2410C;color:#fff;border-color:#fff;z-index:2}.csx-pin.on:after,.csx-pin:hover:after{border-top-color:#C2410C}' +
      '.omx-card.csx-lit{box-shadow:0 0 0 2px #C2410C}' +
      '@media(max-width:720px){' +
        '.csx-bar{gap:8px;padding:8px 0}.csx-search{flex-basis:100%;height:44px}' +
        '.csx-ctrls{flex-wrap:nowrap;overflow-x:auto;width:100%;scrollbar-width:none;padding-bottom:2px}.csx-ctrls::-webkit-scrollbar{display:none}' +
        '.csx-dd{position:static}' +
        '.csx-pop{position:fixed;left:0;right:0;top:auto;bottom:0;width:auto;max-width:none;max-height:80vh;overflow:auto;border-radius:20px 20px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(18,21,29,.3)}' +
        '.csx-dd.open:before{content:"";position:fixed;inset:0;background:rgba(18,21,29,.45);z-index:49}' +
        '.csx-checks{max-height:40vh}.csx-move{margin-left:0}.csx-map{height:58vh;margin:0 -24px 16px;border-radius:0;border-left:0;border-right:0}' +
        'body.csx-pop-on .cmi-launch,body.csx-pop-on .cmi-prompt{display:none!important}' +
      '}';
    document.head.appendChild(s);
  }

  function loadLeaflet(cb) {
    if (window.L && window.L.map) return cb();
    if (!document.querySelector('link[href*="leaflet"]')) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LEAF + 'leaflet.min.css'; document.head.appendChild(l);
    }
    var sc = document.querySelector('script[data-csx-leaflet]');
    if (!sc) { sc = document.createElement('script'); sc.src = LEAF + 'leaflet.min.js'; sc.setAttribute('data-csx-leaflet', '1'); document.head.appendChild(sc); }
    sc.addEventListener('load', function () { cb(); });
    sc.addEventListener('error', function () { cb(new Error('map library did not load')); });
  }

  /* ------------------------------------------------------------------ state */
  var F, ALL = [], ROOT = null, GRID = null, mapObj = null, layer = null, pins = {}, userMove = false, lastFit = '', docWired = false;
  function fresh() { return { q: '', min: 0, max: 0, bd: 0, ba: 0, sf: 0, h: [], ph: false, inb: false, wk: false, sort: 'new', view: 'grid', move: true, at: null, bounds: null }; }
  function fromUrl() {
    var f = fresh(), u = new URLSearchParams(location.search);
    f.q = u.get('q') || ''; f.min = +u.get('min') || 0; f.max = +u.get('max') || 0; f.bd = +u.get('bd') || 0; f.ba = +u.get('ba') || 0; f.sf = +u.get('sf') || 0;
    f.h = (u.get('hood') || '').split(',').filter(Boolean); f.ph = u.get('photos') === '1'; f.inb = u.get('tracked') === '1'; f.wk = u.get('new') === '1';
    f.sort = u.get('sort') || store('csx_sort') || 'new'; if (!SORTS.some(function (x) { return x[0] === f.sort; })) f.sort = 'new';
    f.view = u.get('view') || store('csx_view') || 'grid'; if (!VIEWS.some(function (x) { return x[0] === f.view; })) f.view = 'grid';
    return f;
  }
  function toUrl() {
    try {
      var u = new URL(location.href), p = u.searchParams;
      ['q', 'min', 'max', 'bd', 'ba', 'sf', 'hood', 'photos', 'tracked', 'new', 'sort', 'view'].forEach(function (k) { p.delete(k); });
      if (F.q) p.set('q', F.q); if (F.min) p.set('min', F.min); if (F.max) p.set('max', F.max); if (F.bd) p.set('bd', F.bd); if (F.ba) p.set('ba', F.ba);
      if (F.sf) p.set('sf', F.sf); if (F.h.length) p.set('hood', F.h.join(',')); if (F.ph) p.set('photos', '1'); if (F.inb) p.set('tracked', '1'); if (F.wk) p.set('new', '1');
      if (F.sort !== 'new') p.set('sort', F.sort); if (F.view !== 'grid') p.set('view', F.view);
      var qs = p.toString();
      history.replaceState(history.state, '', u.pathname + (qs ? '?' + qs : '') + u.hash);
    } catch (z) {}
    store('csx_sort', F.sort); store('csx_view', F.view);
  }
  function view() { return F.view === 'split' && !WIDE.matches ? 'map' : F.view; }

  /* ---------------------------------------------------------------- filters */
  function base(it, skip) {
    if (F.q) {
      var hay = [it.title, it.bname, it.hood, it.zip, it.sub].join(' ').toLowerCase();
      if (!F.q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) !== -1; })) return false;
    }
    if (F.min && !(it.price >= F.min)) return false;
    if (F.max && !(it.price <= F.max)) return false;
    if (F.bd && !(+it.bd >= F.bd)) return false;
    if (F.ba && !(+it.ba >= F.ba)) return false;
    if (F.sf && !(+it.sf >= F.sf)) return false;
    if (F.h.length && F.h.indexOf(it.hood) === -1) return false;
    if (F.ph && (it.photos || []).length < 2) return false;
    if (F.inb && !it.building) return false;
    if (F.wk && daysAgo(it.since) > 7) return false;
    if (skip !== 'at' && F.at && keyOf(it) !== F.at) return false;
    return true;
  }
  function inView(it) {
    if (!F.bounds || !(view() !== 'grid')) return true;
    return it.y != null && it.x != null && F.bounds.contains([it.y, it.x]);
  }
  function sorted(list) {
    var by = {
      new: function (a, b) { return String(b.since || '').localeCompare(String(a.since || '')); },
      plo: function (a, b) { return (a.price || 9e15) - (b.price || 9e15); },
      phi: function (a, b) { return (b.price || 0) - (a.price || 0); },
      ppsf: function (a, b) { var x = a.price && a.sf ? a.price / a.sf : 9e15, y = b.price && b.sf ? b.price / b.sf : 9e15; return x - y; },
      size: function (a, b) { return (+b.sf || 0) - (+a.sf || 0); },
      photos: function (a, b) { return (b.photos || []).length - (a.photos || []).length; }
    }[F.sort];
    return list.slice().sort(by);
  }
  function chips() {
    var c = [];
    if (F.q) c.push(['q', '“' + F.q + '”']);
    if (F.min || F.max) c.push(['price', F.min && F.max ? short$(F.min) + '–' + short$(F.max) : F.min ? short$(F.min) + '+' : 'Under ' + short$(F.max)]);
    if (F.bd) c.push(['bd', F.bd + '+ bd']);
    if (F.ba) c.push(['ba', F.ba + '+ ba']);
    if (F.sf) c.push(['sf', F.sf.toLocaleString('en-US') + '+ sq ft']);
    F.h.forEach(function (h) { c.push(['h:' + h, h]); });
    if (F.ph) c.push(['ph', 'Has photos']);
    if (F.inb) c.push(['inb', 'In a building we track']);
    if (F.wk) c.push(['wk', 'New this week']);
    if (F.at) { var g = ALL.filter(function (it) { return keyOf(it) === F.at; }); c.push(['at', 'At ' + (g.length ? placeOf(g) : 'this pin')]); }
    if (F.bounds && view() !== 'grid') c.push(['bounds', 'In the map area']);
    return c;
  }
  function drop(k) {
    if (k === 'q') F.q = ''; else if (k === 'price') { F.min = 0; F.max = 0; } else if (k === 'bd') F.bd = 0; else if (k === 'ba') F.ba = 0; else if (k === 'sf') F.sf = 0;
    else if (k.indexOf('h:') === 0) F.h = F.h.filter(function (x) { return x !== k.slice(2); });
    else if (k === 'ph') F.ph = false; else if (k === 'inb') F.inb = false; else if (k === 'wk') F.wk = false; else if (k === 'at') F.at = null;
    else if (k === 'bounds') { F.bounds = null; F.move = false; }
  }

  /* ----------------------------------------------------------------- render */
  function apply(opts) {
    opts = opts || {};
    var pool = ALL.filter(function (it) { return base(it); });
    var shown = sorted(pool.filter(inView));
    var n = shown.length, tot = ALL.length;
    ROOT.querySelector('.csx-count').textContent = n === tot ? tot + ' coming soon' : n + ' of ' + tot + ' coming soon';
    var c = chips();
    ROOT.querySelector('.csx-chips').innerHTML = c.map(function (x) {
      return '<span class="csx-chip">' + e(x[1]) + '<button type="button" data-drop="' + e(x[0]) + '" aria-label="Remove ' + e(x[1]) + '">×</button></span>'; }).join('') +
      (c.length > 1 ? '<button type="button" class="csx-clear" data-clear>Clear all</button>' : '');
    var empty = ROOT.querySelector('.csx-empty');
    if (n) { GRID.hidden = false; empty.hidden = true; window.OM.render(GRID, shown); }
    else { GRID.hidden = true; GRID.innerHTML = ''; empty.hidden = false; }
    var offMap = shown.filter(function (it) { return it.y == null || it.x == null; }).length, off = ROOT.querySelector('.csx-off');
    off.hidden = view() === 'grid' || !offMap; off.textContent = offMap + (offMap === 1 ? ' home has' : ' homes have') + ' no map position yet and ' + (offMap === 1 ? 'is' : 'are') + ' in the list only.';
    paintButtons();
    var body = ROOT.querySelector('.csx-body'); body.className = 'csx-body v-' + view();
    ROOT.querySelector('.csx-move').hidden = view() === 'grid';
    if (view() !== 'grid') drawMap(pool.filter(function (it) { return base(it, 'at'); }), opts);
    if (!opts.quiet) toUrl();
  }
  function paintButtons() {
    var set = function (dd, on, label, count) {
      var b = ROOT.querySelector('[data-dd="' + dd + '"] > .csx-btn'); if (!b) return;
      b.classList.toggle('set', !!on);
      b.innerHTML = e(label) + (count ? ' <b>' + count + '</b>' : '') + '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5"/></svg>';
    };
    set('price', F.min || F.max, F.min || F.max ? (F.min && F.max ? short$(F.min) + '–' + short$(F.max) : F.min ? short$(F.min) + '+' : 'Under ' + short$(F.max)) : 'Price');
    set('beds', F.bd || F.ba, F.bd || F.ba ? [F.bd ? F.bd + '+ bd' : '', F.ba ? F.ba + '+ ba' : ''].filter(Boolean).join(', ') : 'Beds & baths');
    var more = F.h.length + (F.sf ? 1 : 0) + (F.ph ? 1 : 0) + (F.inb ? 1 : 0) + (F.wk ? 1 : 0);
    set('more', more, 'More', more);
    set('sort', false, 'Sort: ' + SORTS.filter(function (x) { return x[0] === F.sort; })[0][1].replace(', low to high', ' ↑').replace(', high to low', ' ↓'));
    ROOT.querySelectorAll('.csx-views button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-view') === view()); b.setAttribute('aria-pressed', b.getAttribute('data-view') === view()); });
    var sp = ROOT.querySelector('.csx-views [data-view="split"]'); if (sp) sp.hidden = !WIDE.matches;
    ROOT.querySelector('.csx-move input').checked = !!F.move;
    // the controls inside the dropdowns
    ROOT.querySelectorAll('[data-bd]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-bd') === F.bd); });
    ROOT.querySelectorAll('[data-ba]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-ba') === F.ba); });
    ROOT.querySelectorAll('[data-sort]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-sort') === F.sort); });
    var mn = ROOT.querySelector('[data-min]'), mx = ROOT.querySelector('[data-max]'), sz = ROOT.querySelector('[data-sf]');
    if (mn) mn.value = String(F.min || 0); if (mx) mx.value = String(F.max || 0); if (sz) sz.value = String(F.sf || 0);
    ROOT.querySelectorAll('[data-hood]').forEach(function (i) { i.checked = F.h.indexOf(i.getAttribute('data-hood')) !== -1; });
    var t = function (sel, v) { var i = ROOT.querySelector(sel); if (i) i.checked = v; };
    t('[data-ph]', F.ph); t('[data-inb]', F.inb); t('[data-wk]', F.wk);
    ROOT.querySelectorAll('.csx-done button').forEach(function (b) {
      var n = ALL.filter(function (it) { return base(it) && inView(it); }).length; b.textContent = 'Show ' + n + (n === 1 ? ' home' : ' homes'); });
  }

  /* -------------------------------------------------------------------- map */
  function drawMap(list, opts) {
    var el = ROOT.querySelector('.csx-map');
    loadLeaflet(function (err) {
      if (err || !window.L) { el.innerHTML = '<p class="csx-empty" style="margin:16px">The map didn’t load. The list below has every home.</p>'; return; }
      if (!mapObj) {
        mapObj = L.map(el, { scrollWheelZoom: true, wheelPxPerZoomLevel: 110, zoomSnap: 0.25, zoomDelta: 0.5 }).setView([37.772, -122.43], 12);
        var k = (document.querySelector('meta[name="carto-key"]') || {}).content || '';
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' + (k && k.indexOf('__') !== 0 ? '?key=' + encodeURIComponent(k) : ''),
          { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(mapObj);
        layer = L.layerGroup().addTo(mapObj);
        /* only the person's own drag or zoom narrows the list; a fit, a resize or a tab switch does not */
        ['pointerdown', 'touchstart', 'wheel'].forEach(function (t) { el.addEventListener(t, function () { userMove = true; }, { passive: true }); });
        mapObj.on('moveend', function () {
          if (!userMove) return; userMove = false;
          if (!F.move) return;
          F.bounds = mapObj.getBounds(); apply({ keepMap: true });
          track('offmarket:cs-map-move');
        });
      }
      setTimeout(function () { mapObj.invalidateSize(); }, 30);
      layer.clearLayers(); pins = {};
      var groups = {}, order = [];
      list.forEach(function (it) { if (it.y == null || it.x == null) return; var k = keyOf(it); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(it); });
      var pts = [];
      order.forEach(function (k) {
        var g = groups[k], it = g[0], ll = [it.y, it.x]; pts.push(ll);
        var label = g.length > 1 ? g.length + ' homes' : (short$(it.price) || 'Coming soon');
        var m = L.marker(ll, { icon: L.divIcon({ className: 'csx-di', html: '<span class="csx-pin' + (g.length > 1 ? ' grp' : '') + (F.at === k ? ' on' : '') + '">' + e(label) + '</span>', iconSize: [0, 0] }),
          riseOnHover: true, keyboard: true, title: placeOf(g) + (g.length > 1 ? ' (' + g.length + ' homes)' : '') }).addTo(layer);
        m.on('click', function () { F.at = F.at === k ? null : k; apply({ keepMap: true }); track('offmarket:cs-map-pin'); if (F.at) scrollToList(); });
        pins[k] = m;
      });
      /* fit to the homes when the filters change; not when the person moved the map themselves */
      var sig = order.join('|');
      if (!opts.keepMap && !F.bounds && sig !== lastFit) {
        lastFit = sig; userMove = false;
        if (pts.length > 1) mapObj.fitBounds(L.latLngBounds(pts).pad(0.12), { maxZoom: 15 });
        else if (pts.length === 1) mapObj.setView(pts[0], 15);
      }
    });
  }
  function scrollToList() {
    if (view() === 'split') return;
    var t = ROOT.querySelector('.csx-meta'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function lightPin(it, on) {
    if (!mapObj || !it) return;
    var m = pins[keyOf(it)], el = m && m.getElement && m.getElement(), p = el && el.querySelector('.csx-pin');
    if (p) p.classList.toggle('on', on || F.at === keyOf(it));
    if (m && on) m.setZIndexOffset(1000); else if (m) m.setZIndexOffset(0);
  }

  /* -------------------------------------------------------------- the toolbar */
  function toolbar(items) {
    var hoods = {}; items.forEach(function (it) { if (it.hood) hoods[it.hood] = (hoods[it.hood] || 0) + 1; });
    var hl = Object.keys(hoods).sort();
    var opt = function (v, label) { return '<option value="' + v + '">' + label + '</option>'; };
    var seg = function (attr, vals) { return '<div class="csx-seg">' + vals.map(function (v) { return '<button type="button" ' + attr + '="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div>'; };
    var done = '<div class="csx-done"><a data-reset>Reset</a><button type="button" data-close>Show homes</button></div>';
    return '<div class="csx-bar" role="search">' +
      '<label class="csx-search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="m11 11 3.5 3.5"/></svg>' +
      '<input type="search" data-q placeholder="Address, building, neighborhood or ZIP" aria-label="Search the coming-soon homes" autocomplete="off"></label>' +
      '<div class="csx-ctrls">' +
      '<div class="csx-dd" data-dd="price"><button type="button" class="csx-btn" aria-haspopup="dialog">Price</button><div class="csx-pop" role="dialog" aria-label="Price">' +
        '<h4>Price</h4><div class="csx-row"><select data-min aria-label="Minimum price">' + opt(0, 'No min') + PRICES.map(function (p) { return opt(p, short$(p)); }).join('') + '</select><span>to</span>' +
        '<select data-max aria-label="Maximum price">' + opt(0, 'No max') + PRICES.map(function (p) { return opt(p, short$(p)); }).join('') + '</select></div>' + done + '</div></div>' +
      '<div class="csx-dd" data-dd="beds"><button type="button" class="csx-btn" aria-haspopup="dialog">Beds & baths</button><div class="csx-pop" role="dialog" aria-label="Beds and baths">' +
        '<h4>Bedrooms</h4>' + seg('data-bd', [[0, 'Any'], [1, '1+'], [2, '2+'], [3, '3+'], [4, '4+']]) +
        '<h4 class="csx-gap">Bathrooms</h4>' + seg('data-ba', [[0, 'Any'], [1, '1+'], [2, '2+'], [3, '3+']]) + done + '</div></div>' +
      '<div class="csx-dd" data-dd="more"><button type="button" class="csx-btn" aria-haspopup="dialog">More</button><div class="csx-pop" role="dialog" aria-label="More filters">' +
        (hl.length ? '<h4>Neighborhood</h4><div class="csx-checks">' + hl.map(function (h) {
          return '<label class="csx-check"><input type="checkbox" data-hood="' + e(h) + '">' + e(h) + '<i>' + hoods[h] + '</i></label>'; }).join('') + '</div>' : '') +
        '<h4 class="csx-gap">Size</h4><select data-sf aria-label="Minimum size">' + opt(0, 'Any size') + SIZES.map(function (n) { return opt(n, n.toLocaleString('en-US') + '+ sq ft'); }).join('') + '</select>' +
        '<h4 class="csx-gap">Show only</h4>' +
        '<label class="csx-check"><input type="checkbox" data-ph>Has photos</label>' +
        '<label class="csx-check"><input type="checkbox" data-inb>In a building we track</label>' +
        '<label class="csx-check"><input type="checkbox" data-wk>New this week</label>' + done + '</div></div>' +
      '<div class="csx-dd r" data-dd="sort"><button type="button" class="csx-btn" aria-haspopup="dialog">Sort</button><div class="csx-pop" role="dialog" aria-label="Sort">' +
        '<h4>Sort by</h4><div class="csx-sort">' + SORTS.map(function (x) { return '<button type="button" data-sort="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="csx-views" role="group" aria-label="View">' + VIEWS.map(function (v) { return '<button type="button" data-view="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div>' +
      '</div></div>' +
      '<div class="csx-meta"><span class="csx-count"></span><span class="csx-chips"></span>' +
      '<label class="csx-move" hidden><input type="checkbox">Search as I move the map</label></div>' +
      '<div class="csx-body"><div class="csx-mapcol"><div class="csx-map" role="region" aria-label="Map of the coming-soon homes"></div><p class="csx-off" hidden></p></div>' +
      '<div class="csx-listcol"><div class="csx-empty" hidden>No coming-soon homes match these filters.<br><button type="button" data-clear>Clear the filters</button></div></div></div>';
  }

  function closeAll(except) {
    ROOT.querySelectorAll('.csx-dd.open').forEach(function (d) { if (d !== except) d.classList.remove('open'); });
    document.body.classList.toggle('csx-pop-on', !!ROOT.querySelector('.csx-dd.open'));
  }
  function wire() {
    var qT = null;
    ROOT.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.hasAttribute('data-q')) { clearTimeout(qT); qT = setTimeout(function () { F.q = t.value.trim(); F.at = null; apply(); if (F.q) track('offmarket:cs-search'); }, 180); }
    });
    ROOT.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.hasAttribute('data-min')) F.min = +t.value || 0;
      else if (t.hasAttribute('data-max')) F.max = +t.value || 0;
      else if (t.hasAttribute('data-sf')) F.sf = +t.value || 0;
      else if (t.hasAttribute('data-hood')) { var h = t.getAttribute('data-hood'); F.h = t.checked ? F.h.concat([h]) : F.h.filter(function (x) { return x !== h; }); }
      else if (t.hasAttribute('data-ph')) F.ph = t.checked; else if (t.hasAttribute('data-inb')) F.inb = t.checked; else if (t.hasAttribute('data-wk')) F.wk = t.checked;
      else if (t.closest('.csx-move')) { F.move = t.checked; if (!F.move) F.bounds = null; else if (mapObj) F.bounds = mapObj.getBounds(); }
      else return;
      if (F.min && F.max && F.min > F.max) { var x = F.min; F.min = F.max; F.max = x; }
      F.at = null; apply({ keepMap: !!F.bounds }); track('offmarket:cs-filter');
    });
    ROOT.addEventListener('click', function (ev) {
      var t = ev.target, b;
      if ((b = t.closest('.csx-dd > .csx-btn'))) { var dd = b.parentNode, was = dd.classList.contains('open'); closeAll(); if (!was) { dd.classList.add('open'); document.body.classList.add('csx-pop-on'); } return; }
      if ((b = t.closest('[data-bd]'))) { F.bd = +b.getAttribute('data-bd'); F.at = null; apply({ keepMap: !!F.bounds }); return; }
      if ((b = t.closest('[data-ba]'))) { F.ba = +b.getAttribute('data-ba'); F.at = null; apply({ keepMap: !!F.bounds }); return; }
      if ((b = t.closest('[data-sort]'))) { F.sort = b.getAttribute('data-sort'); closeAll(); apply({ keepMap: true }); track('offmarket:cs-sort', { sort: F.sort }); return; }
      if ((b = t.closest('[data-view]'))) { F.view = b.getAttribute('data-view'); if (F.view === 'grid') F.bounds = null; lastFit = ''; apply(); track('offmarket:cs-view', { view: F.view }); return; }
      if ((b = t.closest('[data-drop]'))) { drop(b.getAttribute('data-drop')); if (b.getAttribute('data-drop') === 'q') ROOT.querySelector('[data-q]').value = ''; lastFit = ''; apply(); return; }
      if (t.closest('[data-clear]') || t.closest('[data-reset]')) { var keep = { sort: F.sort, view: F.view }; F = fresh(); F.sort = keep.sort; F.view = keep.view; ROOT.querySelector('[data-q]').value = ''; lastFit = ''; apply(); return; }
      if (t.closest('[data-close]')) { closeAll(); scrollToList(); return; }
    });
    if (!docWired) {
      docWired = true;
      document.addEventListener('click', function (ev) { if (ROOT && !ev.target.closest('.csx-dd')) closeAll(); });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ROOT && ROOT.querySelector('.csx-dd.open')) closeAll(); });
      if (WIDE.addEventListener) WIDE.addEventListener('change', function () { if (ROOT) apply({ keepMap: true, quiet: true }); });
    }
    /* a card under the pointer lights its pin */
    ROOT.addEventListener('mouseover', function (ev) {
      var c = ev.target.closest && ev.target.closest('.omx-card'); if (!c || c.__csxOn) return;
      ROOT.querySelectorAll('.omx-card').forEach(function (x) { if (x.__csxOn && x !== c) { x.__csxOn = false; lightPin(x.__csxIt, false); } });
      c.__csxOn = true; c.__csxIt = c.__csxIt || ALL.filter(function (it) { return 'cs-' + it.key === c.id; })[0]; lightPin(c.__csxIt, true);
    });
    ROOT.addEventListener('mouseleave', function () { ROOT.querySelectorAll('.omx-card').forEach(function (x) { if (x.__csxOn) { x.__csxOn = false; lightPin(x.__csxIt, false); } }); });
  }

  function mount(grid, items) {
    css();
    ALL = items || [];
    var sec = grid.closest('.omx-sec') || grid.parentNode;
    var old = sec.querySelector('.csx'); if (old) { old.parentNode.insertBefore(grid, old); old.remove(); }
    mapObj = null; layer = null; pins = {}; lastFit = '';
    F = fromUrl();
    var wrap = document.createElement('div'); wrap.className = 'csx'; wrap.innerHTML = toolbar(ALL);
    grid.parentNode.insertBefore(wrap, grid);
    wrap.querySelector('.csx-listcol').insertBefore(grid, wrap.querySelector('.csx-empty'));
    ROOT = wrap; GRID = grid;
    ROOT.querySelector('[data-q]').value = F.q;
    wire();
    apply({ quiet: true });
  }

  window.OMCS = { mount: mount, state: function () { return F && { bounds: !!F.bounds, move: F.move, at: F.at, view: view() }; } };
})();
