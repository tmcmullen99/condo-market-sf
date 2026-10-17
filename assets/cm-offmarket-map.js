/* =============================================================================
 * cm-offmarket-map.js - the Off Market map, first fold (Tim, 16 Oct 2026)
 * -----------------------------------------------------------------------------
 * "Make the map the top section of the Off Market page. Map needs to be
 * toggleable. Map opens on the Coming soon toggle. Remove active listing pins,
 * only showcase building pins > user clicks into building > automatically sent
 * to Dossier. 1 Daniel Burnham #618 should be featured."
 *
 * Layers (one at a time, from the tabs): Coming soon (default), Investor
 * Exchange, Owners' numbers, Every building. Featured listings are pinned on
 * every layer. A building pin goes straight to /building/<slug>#dossier.
 *
 * Data comes from <script type="application/json" id="omData"> (no address or
 * price in it). A member's exact pins, addresses and prices arrive through the
 * 'om-member' event from cm-offmarket.js, which also opens the request sheet.
 * ========================================================================== */
(function () {
  'use strict';
  var dataEl = document.getElementById('omData'), el = document.getElementById('cbmap');
  if (!dataEl || !el || !window.L) return;
  var D; try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var panel = document.getElementById('omPanel'), side = document.getElementById('omSide');
  var tabs = document.querySelectorAll('[data-om-layer]');

  /* Two-finger trackpad scroll and pinch zoom the map (Tim, 16 Oct 2026). Trackpads send many small wheel
     steps, so zoom moves in quarter levels and needs more travel per level than a mouse wheel's click. */
  var map = L.map(el, { scrollWheelZoom: true, wheelPxPerZoomLevel: 110, wheelDebounceTime: 25, zoomSnap: 0.25, zoomDelta: 0.5,
    zoomControl: true }).setView([37.772, -122.43], 12);
  var k = (document.querySelector('meta[name="carto-key"]') || {}).content || '';
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' + (k && k.indexOf('__') !== 0 ? '?key=' + encodeURIComponent(k) : ''),
    { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function e(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function money(n) { return n == null ? '' : '$' + fmt(n); }
  function dd(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : ''; }
  function sp(bd, ba, sf) { return [bd != null && bd !== '' ? bd + ' bd' : '', ba != null && ba !== '' ? ba + ' ba' : '', sf ? fmt(sf) + ' sq ft' : ''].filter(Boolean).join(' \u00b7 '); }
  function track(cta, x) { try { if (window.cmTrack) window.cmTrack('cta_click', Object.assign({ cta: cta }, x || {})); } catch (z) {} }

  var L_ = { cs: L.layerGroup(), ex: L.layerGroup(), mm: L.layerGroup(), b: L.layerGroup() };
  var FEAT = L.layerGroup().addTo(map);
  var cur = null, MEM = null, ON = null, lastLL = null;

  function pin(group, y, x, cls, label, fn, title) {
    var m = L.marker([y, x], { icon: L.divIcon({ className: 'om-di', html: '<span class="om-pin ' + cls + '">' + label + '</span>', iconSize: [0, 0] }),
      keyboard: true, riseOnHover: true, title: title || '' }).addTo(group);
    m.on('click', function () {
      var p = m.getElement() && m.getElement().querySelector('.om-pin');
      if (ON) ON.classList.remove('on'); ON = p; if (ON) ON.classList.add('on');
      lastLL = m.getLatLng();
      fn();
    });
    return m;
  }
  /* The panel can be closed to see the whole map (Tim, 16 Oct 2026); a pin, a tab or "Show the list" opens it again. */
  var grid = panel.closest('.mact-grid'), reopen = document.querySelector('[data-om-open]'), aside = panel.closest('.mact-side');
  function openPanel() { if (grid) grid.classList.remove('om-closed'); if (reopen) reopen.hidden = true; }
  function closePanel() {
    if (grid) grid.classList.add('om-closed'); if (reopen) reopen.hidden = false;
    if (ON) { ON.classList.remove('on'); ON = null; }
    track('offmarket:panel-close');
  }
  panel.addEventListener('click', function (ev) { if (ev.target.closest('[data-om-close]')) { ev.preventDefault(); closePanel(); } });
  if (reopen) reopen.addEventListener('click', function () { openPanel(); pane(cur || 'cs'); track('offmarket:panel-open'); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && grid && !grid.classList.contains('om-closed') && !document.querySelector('.omx-veil') && document.activeElement && panel.contains(document.activeElement)) closePanel();
  });
  /* ---- phones: Zillow's pattern (Tim, 17 Oct 2026: "When I click a tab on the map, I need to be able to see the
     property card. Mirror Zillow and consider it best-in-class.") ----
     On a phone the panel sits under the map, so a tapped pin used to change something off screen. Now a tap
     slides a card up over the bottom of the screen: photos, price, beds, baths, size, address. The map pans
     so the pin sits in the clear space above it. Tapping the card opens the whole home in a sheet (photos,
     the photo-day note, Schedule a tour, disclosures, Comp Report); a pin shared by several homes gives a row
     of cards to swipe. A tap on the map, the X, a layer tab or Escape puts it away. The list under the map
     stays where it was. Desktop is unchanged. */
  var PHONE = window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false };
  var deskSide = side, peekCards = [];
  /* asides, not divs: the page pads "body > div:first-of-type" for the fixed nav, and these hang off body */
  var peek = document.createElement('aside'); peek.className = 'om-peek'; peek.hidden = true;
  peek.setAttribute('role', 'region'); peek.setAttribute('aria-label', 'Selected home');
  var sheet = document.createElement('aside'); sheet.className = 'om-sheet'; sheet.hidden = true;
  sheet.innerHTML = '<div class="om-sheet-bg" data-om-sheet-x></div>' +
    '<div class="om-sheet-card" role="dialog" aria-modal="true" aria-label="Home details">' +
    '<div class="om-sheet-grab"><i aria-hidden="true"></i><button type="button" class="om-sheet-x" data-om-sheet-x aria-label="Close">×</button></div>' +
    '<div class="om-sheet-body"></div>' +
    '<button type="button" class="mact-back om-sheet-back" data-om-sheet-x>← Back to the map</button></div>';
  document.body.appendChild(peek); document.body.appendChild(sheet);
  var sheetBody = sheet.querySelector('.om-sheet-body'), sheetCard = sheet.querySelector('.om-sheet-card');
  function specLine(bd, ba, sf, extra) {
    var bits = [];
    if (bd != null && bd !== '') bits.push('<b>' + e(bd) + '</b> bd'); if (ba != null && ba !== '') bits.push('<b>' + e(ba) + '</b> ba');
    if (sf) bits.push('<b>' + fmt(sf) + '</b> sq ft'); if (extra) bits.push(e(extra));
    return bits.join('<i>|</i>');
  }
  /* No photo, no photo area (Tim, 17 Oct 2026: "If the coming soon listing is not within one of our buildings OR
     does not have a hero image, don't show the image section"). The card is then just the facts, with the tag on top. */
  function pk(o) {
    var img = o.img ? ' style="background-image:url(\'' + e(o.img).replace(/'/g, '%27') + '\')"' : '';
    var tag = '<span class="om-pk-tag ' + (o.tagCls || '') + '">' + e(o.tag) + '</span>';
    var media = o.strip || o.img
      ? '<div class="om-pk-media">' + (o.strip || '<div class="om-pk-ph"' + img + '>' + (o.inset ? '<i style="background-image:url(\'' + e(o.inset).replace(/'/g, '%27') + '\')"></i>' : '') + '</div>') + tag + '</div>'
      : '';
    return '<article class="om-pk' + (media ? '' : ' om-pk-bare') + '" tabindex="0" role="button" aria-label="Open ' + e(o.title) + '">' + media +
      '<div class="om-pk-b">' + (media ? '' : tag) +
      (o.price ? '<div class="om-pk-p">' + e(o.price) + (o.plab ? '<small>' + e(o.plab) + '</small>' : '') + '</div>'
               : '<div class="om-pk-p om-pk-lock"><span>$&#9608;,&#9608;&#9608;&#9608;,&#9608;&#9608;&#9608;</span><small>' + e(o.lock || 'Price for members') + '</small></div>') +
      (o.spec ? '<div class="om-pk-s">' + o.spec + '</div>' : '') +
      '<div class="om-pk-a">' + e(o.title) + '</div>' +
      (o.meta ? '<div class="om-pk-m">' + e(o.meta) + '</div>' : '') +
      '<span class="om-pk-go" aria-hidden="true">›</span></div></article>';
  }
  function hidePeek() {
    if (peek.hidden) return;
    peek.hidden = true; peek.innerHTML = ''; peekCards = [];
    document.body.classList.remove('om-peek-on');
    if (ON) { ON.classList.remove('on'); ON = null; }
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove('on'); document.body.classList.remove('om-sheet-on');
    sheetCard.style.transform = '';
    setTimeout(function () { if (!sheet.classList.contains('on')) { sheet.hidden = true; side = deskSide; } }, 220);
  }
  function openSheet() {
    sheet.hidden = false; sheetCard.scrollTop = 0;
    requestAnimationFrame(function () { sheet.classList.add('on'); });
    document.body.classList.add('om-sheet-on');
    var x = sheet.querySelector('.om-sheet-x'); if (x) setTimeout(function () { try { x.focus({ preventScroll: true }); } catch (z) {} }, 60);
    track('offmarket:phone-sheet');
  }
  function hidePhone() { closeSheet(); hidePeek(); }
  /* the pin into the clear space between the header and the card */
  function clearOfPeek(ll) {
    if (!ll) return;
    var r = el.getBoundingClientRect(), ph = peek.getBoundingClientRect().height + 16;
    var top = Math.max(r.top, 72), bottom = Math.min(r.bottom, window.innerHeight - ph);
    if (bottom - top < 90) return;
    var pt = map.latLngToContainerPoint(ll);
    map.panBy([r.left + pt.x - (r.left + r.width / 2), r.top + pt.y - (top + bottom) / 2], { animate: true, duration: 0.35 });
  }
  /* mode: undefined = a pin was tapped (show the card); 'quiet' = only fill the sheet; 'open' = card and sheet */
  function phoneCards(cards, mode) {
    if (!PHONE.matches || mode === 'quiet') return;
    peekCards = cards;
    peek.innerHTML = '<button type="button" class="om-peek-x" aria-label="Close">×</button>' +
      (cards.length > 1 ? '<div class="om-peek-k">' + cards.length + ' homes here · swipe</div>' : '') +
      '<div class="om-peek-row' + (cards.length > 1 ? ' many' : '') + '">' + cards.map(function (c) { return c.h; }).join('') + '</div>';
    peek.hidden = false; document.body.classList.add('om-peek-on');
    if (window.OM && window.OM.css) window.OM.css();
    if (mode === 'open') openSheet(); else { closeSheet(); clearOfPeek(lastLL); }
    lastLL = null;
  }
  peek.addEventListener('click', function (ev) {
    if (ev.target.closest('.om-peek-x')) { hidePeek(); return; }
    if (ev.target.closest('[data-omp-dir]') || ev.target.closest('a')) return;
    var card = ev.target.closest('.om-pk'); if (!card) return;
    var i = Array.prototype.indexOf.call(peek.querySelectorAll('.om-pk'), card), c = peekCards[i];
    if (c) { c.open(); openSheet(); }
  });
  peek.addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('om-pk')) { ev.preventDefault(); ev.target.click(); } });
  sheet.addEventListener('click', function (ev) { if (ev.target.closest('[data-om-sheet-x]')) { ev.preventDefault(); closeSheet(); } });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || document.querySelector('.omx-veil')) return;
    if (!sheet.hidden) closeSheet(); else if (!peek.hidden) hidePeek();
  });
  /* drag the sheet down by its handle, or from the top of its content, to put it away */
  (function () {
    var y0 = null, dy = 0;
    sheetCard.addEventListener('touchstart', function (ev) {
      var onGrab = ev.target.closest('.om-sheet-grab');
      if (!onGrab && sheetCard.scrollTop > 0) { y0 = null; return; }
      y0 = ev.touches[0].clientY; dy = 0; sheetCard.style.transition = 'none';
    }, { passive: true });
    sheetCard.addEventListener('touchmove', function (ev) {
      if (y0 == null) return; dy = ev.touches[0].clientY - y0;
      if (dy > 0) sheetCard.style.transform = 'translateY(' + dy + 'px)'; else { y0 = null; sheetCard.style.transform = ''; }
    }, { passive: true });
    sheetCard.addEventListener('touchend', function () {
      if (y0 == null) return; sheetCard.style.transition = '';
      if (dy > 90) closeSheet(); else sheetCard.style.transform = '';
      y0 = null;
    });
  })();
  map.on('click', function () { if (PHONE.matches) hidePeek(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es.forEach(function (en) { document.body.classList.toggle('om-map-view', en.intersectionRatio >= 0.55); }); },
      { threshold: [0, 0.3, 0.55, 0.8, 1] }).observe(el);
  }
  if (PHONE.addEventListener) PHONE.addEventListener('change', function () { hidePhone(); side = deskSide; });

  function pane(name) {
    if (name === 'item' && PHONE.matches) { side = sheetBody; return; }   // phones: the home opens over the map; the list stays
    side = deskSide; hidePhone();
    openPanel();
    panel.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
    if (aside) aside.scrollTop = 0;
    if (ON && name !== 'item') { ON.classList.remove('on'); ON = null; }
  }
  function fit(group) {
    var pts = [];
    group.eachLayer(function (m) { if (m.getLatLng) pts.push(m.getLatLng()); });
    if (!pts.length) { map.setView([37.772, -122.43], 12); return; }   // an empty layer shows the city, not one featured pin
    FEAT.eachLayer(function (m) { pts.push(m.getLatLng()); });
    /* keep pins out from under the panel when it floats over the map */
    var padR = aside && grid && !grid.classList.contains('om-closed') && window.innerWidth > 900 ? aside.offsetWidth + 24 : 0;
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15, paddingTopLeft: [20, 20], paddingBottomRight: [padR + 20, 20] });
    else if (pts.length === 1) map.setView(pts[0], 14);
    else map.setView([37.772, -122.43], 12);
  }
  function setLayer(k, opts) {
    opts = opts || {};
    if (!L_[k]) k = 'cs';
    cur = k;
    tabs.forEach(function (t) { var on = t.getAttribute('data-om-layer') === k; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.classList.toggle('on', on); });
    Object.keys(L_).forEach(function (n) { if (n === k) L_[n].addTo(map); else map.removeLayer(L_[n]); });
    if (!opts.keepPane) pane(k);
    if (!opts.noFit) fit(L_[k]);
  }

  /* ---- every building: one plain pin each; a click opens its dossier ---- */
  (D.b || []).forEach(function (b) {
    var r = 4 + Math.min(10, Math.sqrt(b[2] || 1) * 0.55);
    var m = L.circleMarker([b[3], b[4]], { radius: r, color: '#3d4452', weight: 1, fillColor: '#5d6575', fillOpacity: 0.55 }).addTo(L_.b);
    m.bindTooltip(e(b[1]) + ' \u00b7 ' + fmt(b[2]) + ' units \u00b7 open the dossier', { direction: 'top' });
    m.on('click', function () { track('offmarket:map-building', { building: b[0] }); location.href = '/building/' + encodeURIComponent(b[0]) + '#dossier'; });
  });
  var inp = document.getElementById('omFind');
  function findB(q) {
    q = (q || '').trim().toLowerCase(); if (!q) return null; var hit = null;
    (D.b || []).forEach(function (b) { if (!hit && b[1].toLowerCase() === q) hit = b; }); if (hit) return hit;
    (D.b || []).forEach(function (b) { if (!hit && (b[1].toLowerCase().indexOf(q) !== -1 || b[0].replace(/-/g, ' ').indexOf(q.replace(/[^a-z0-9 ]/g, '')) !== -1)) hit = b; });
    return hit;
  }
  var go = document.getElementById('omFindGo');
  if (go && inp) {
    go.addEventListener('click', function () {
      var b = findB(inp.value), miss = document.getElementById('omFindMiss');
      if (b) { track('offmarket:find-building', { building: b[0] }); location.href = '/building/' + encodeURIComponent(b[0]) + '#dossier'; }
      else if (miss) miss.hidden = false;
    });
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); go.click(); } });
  }

  /* ---- coming soon ----
     Pins carry the street name (Tim, 16 Oct 2026: "Use the Street Name as the label on the map e.g. Divisadero").
     Listings in the same catalogued building share one pin, "Main \u00b7 3", and the panel lists them. A card for a
     listing in a catalogued building shows that building's hero photo and name. */
  function streetOf(a) {
    var s = String(a || '').split('#')[0].replace(/\s+(unit|apt|ste|suite)\s+\S+$/i, '').trim();
    s = s.replace(/^\d+[A-Za-z]?(\s*-\s*\d+[A-Za-z]?)?\s+/, '').replace(/^the\s+/i, '');
    var m = s.match(/^(.*?)\s+(street|st|avenue|ave|boulevard|blvd|way|place|pl|court|ct|drive|dr|terrace|ter|lane|ln|road|rd|alley|aly|plaza|plz|circle|cir)\.?$/i);
    if (m && m[1].trim()) return /^\d+(st|nd|rd|th)$/i.test(m[1]) ? m[1].toLowerCase() + ' ' + ({ street: 'St', st: 'St', avenue: 'Ave', ave: 'Ave' }[m[2].toLowerCase()] || m[2]) : m[1].trim();
    return s;
  }
  function label(street, n) { return e(street || 'Soon') + (n > 1 ? '<b>' + n + '</b>' : ''); }
  function bhero(img, name, inset) {
    return img ? '<div class="om-bhero" style="background-image:url(\'' + e(img).replace(/'/g, '%27') + '\')">' + (name ? '<span>' + e(name) + '</span>' : '') +
      (inset ? '<i style="background-image:url(\'' + e(inset).replace(/'/g, '%27') + '\')" title="This home"></i>' : '') + '</div>' : '';
  }
  /* group rows that share a building (or, outside one, a point) */
  function groups(rows, keyOf) {
    var by = {}, out = [];
    rows.forEach(function (r) { var k = keyOf(r); if (!by[k]) { by[k] = []; out.push(by[k]); } by[k].push(r); });
    return out;
  }
  function anonPeek(c) {
    return pk({ img: c[11], tag: 'Coming soon', tagCls: 'cs', lock: 'Price, unit and photos for members',
      spec: specLine(c[4], c[5], c[6]), title: [c[8], c[10]].filter(Boolean).join(' \u00b7 ') || 'A San Francisco condo',
      meta: [c[3], c[7] ? 'First seen ' + dd(c[7]) : ''].filter(Boolean).join(' \u00b7 ') });
  }
  function anonCard(c, mode) {
    pane('item');
    var inB = !!c[9];
    side.innerHTML = '<div class="act-k">Coming soon' + (c[3] ? ' \u00b7 ' + e(c[3]) : '') + '</div>' +
      bhero(c[11], c[10]) +
      '<h3 class="mact-h">' + e([c[8], sp(c[4], c[5], c[6])].filter(Boolean).join(' \u00b7 ') || 'A San Francisco condo') + '</h3>' +
      '<p class="mact-lede">' + (inB ? 'In ' + e(c[10]) + '. ' : '') + 'First seen ' + dd(c[7]) + '. Entered on the MLS as coming soon, before the listing sites.</p>' +
      '<div class="mact-prop"><div class="mp-addr om-sc-blur">&#9608;&#9608;&#9608; ' + e(c[8] || '&#9608;&#9608;&#9608;&#9608;') + ' #&#9608;&#9608;</div><div class="mp-sub">' + (inB ? 'Unit' : 'Address') + ', price and photos for members</div></div>' +
      '<button class="btn btn-gold" data-om-signup="' + e(c[0]) + '" data-cta="offmarket:map-cs" style="margin-top:14px;width:100%">See it free &rarr;</button>' +
      (inB ? '<a class="mp-rec" href="/building/' + encodeURIComponent(c[9]) + '">The ' + e(c[10]) + ' record &rarr;</a>'
           : '<p class="om-sc-note">Until you sign in, the pin sits near the home rather than on it.</p>');
    phoneCards([{ h: anonPeek(c), open: function () { anonCard(c, 'quiet'); } }], mode);
  }
  function anonGroup(list, mode) {
    pane('item');
    var c0 = list[0];
    side.innerHTML = '<div class="act-k">Coming soon \u00b7 ' + list.length + ' in one building</div>' + bhero(c0[11], c0[10]) +
      '<h3 class="mact-h">' + e(c0[10] || c0[8]) + '</h3><p class="mact-lede">' + list.length + ' homes here are coming soon, before the listing sites. Units and prices for members.</p>' +
      list.map(function (c, i) { return '<button type="button" class="om-row" data-i="' + i + '"><b>' + e(sp(c[4], c[5], c[6]) || 'A home') + '</b><span>' + e(c[8]) + ' \u00b7 first seen ' + dd(c[7]) + '</span></button>'; }).join('') +
      '<button class="btn btn-gold" data-om-signup="' + e(c0[0]) + '" data-cta="offmarket:map-cs-group" style="margin-top:12px;width:100%">See them free &rarr;</button>' +
      (c0[9] ? '<a class="mp-rec" href="/building/' + encodeURIComponent(c0[9]) + '">The ' + e(c0[10]) + ' record &rarr;</a>' : '');
    side.querySelectorAll('.om-row').forEach(function (b) { b.addEventListener('click', function () { anonCard(list[+b.getAttribute('data-i')], PHONE.matches ? 'quiet' : undefined); }); });
    phoneCards(list.map(function (c) { return { h: anonPeek(c), open: function () { anonCard(c, 'quiet'); } }; }), mode);
  }
  function memPeek(it) {
    var O = window.OM, strip = O && O.hasStrip && O.hasStrip(it) ? O.strip(it, { panel: true }) : '';
    return pk({ strip: strip, img: it.building && it.bimg ? it.bimg : (it.type === 'mmm' ? it.photo : it.unitPhoto) || '', inset: it.building && it.bimg ? it.unitPhoto : '',
      tag: it.type === 'cs' ? 'Coming soon' : it.type === 'ex' ? 'Investor Exchange' : 'Owner\u2019s number', tagCls: it.type,
      price: it.price ? money(it.price) : '', plab: it.type === 'mmm' ? 'Owner\u2019s number' : '',
      spec: it.type === 'mmm' ? e(it.spec || '') : specLine(it.bd, it.ba, it.sf) || e(it.spec || ''), title: it.title,
      meta: [it.sub, it.since ? (it.type === 'mmm' ? 'Named ' : 'First seen ') + dd(it.since) : ''].filter(Boolean).join(' \u00b7 ') });
  }
  function memCard(it, mode) {
    pane('item');
    var a = (MEM && MEM.agent && MEM.agent.first) || 'Tim';
    var anyUnit = it.building ? '<a class="mp-rec" href="/building/' + encodeURIComponent(it.building) + '#dossier" data-cta="offmarket:any-unit">Write an offer on any unit in ' + e(it.bname || 'the building') + ' &rarr;</a><br>' : '';
    var offer = it.type === 'mmm' && it.building && it.unit
      ? '<a class="mact-choice" href="/building/' + encodeURIComponent(it.building) + '#unit-' + encodeURIComponent(String(it.unit).replace(/^#+/, '')) + '" data-cta="offmarket:mmm-offer"><span class="mc-t">Make an offer</span><span class="mc-s">' + e(a) + ' presents it to the owner</span></a>' : '';
    var O = window.OM; if (O && O.css) O.css();
    /* the home's own photos as a sideways strip when it has two or more; otherwise the building's photo and a note */
    var pic = O && O.hasStrip && O.hasStrip(it) ? O.strip(it, { panel: true })
      : it.building && it.bimg ? bhero(it.bimg, it.bname, it.unitPhoto)
      : (it.photo ? '<div class="om-sc-ph" style="background-image:url(\'' + e(it.photo).replace(/'/g, '%27') + '\')"></div>' : '');
    var note = O && O.photoNote ? O.photoNote(it, null) : '';   // the Schedule a tour choice sits right under it
    side.innerHTML = '<div class="act-k">' + (it.type === 'cs' ? 'Coming soon' : 'Make Me Move') + (it.sub ? ' \u00b7 ' + e(it.sub) : '') + '</div>' + pic +
      '<h3 class="mact-h">' + e(it.title) + '</h3><p class="mact-lede">' +
      (it.price ? '<b>' + (it.type === 'mmm' ? 'Owner\u2019s number ' : '') + money(it.price) + '</b>' + (it.spec ? ' \u00b7 ' : '') : '') + e(it.spec) +
      (it.since ? '<br>' + (it.type === 'mmm' ? 'Named ' : 'First seen ') + dd(it.since) : '') + '</p>' + note +
      '<div class="mact-choose">' + offer +
      '<button type="button" class="mact-choice" data-om-k="tour"><span class="mc-t">Schedule a tour</span><span class="mc-s">Pick two times, 48 hours or more out</span></button>' +
      '<button type="button" class="mact-choice" data-om-k="disclosures"><span class="mc-t">Request the disclosures</span><span class="mc-s">' + (it.type === 'cs' ? 'From the listing agent, sent to you' : 'Sent to you, or a plain answer if they aren\u2019t available') + '</span></button>' +
      '<button type="button" class="mact-choice" data-om-k="comps"><span class="mc-t">Request a Comp Report</span><span class="mc-s">In your inbox within 24 hours</span></button></div>' +
      anyUnit + '<a class="mp-rec" href="/account/off-market/' + (it.type === 'cs' ? '?cs=' + encodeURIComponent(it.key) : '#make-me-move') + '">Open in your off-market list &rarr;</a>';
    side.querySelectorAll('[data-om-k]').forEach(function (b) { b.addEventListener('click', function () { if (window.OM) window.OM.act(it, b.getAttribute('data-om-k')); }); });
    phoneCards([{ h: memPeek(it), open: function () { memCard(it, 'quiet'); } }], mode);
  }
  function memGroup(items, mode) {
    pane('item');
    var i0 = items[0];
    side.innerHTML = '<div class="act-k">Coming soon \u00b7 ' + items.length + ' in one building</div>' + bhero(i0.bimg, i0.bname) +
      '<h3 class="mact-h">' + e(i0.bname || i0.title) + '</h3><p class="mact-lede">' + items.length + ' homes here are coming soon, before the listing sites.</p>' +
      items.map(function (it, i) { return '<button type="button" class="om-row" data-i="' + i + '"><b>' + e(it.title) + '</b><span>' + (it.price ? money(it.price) + ' \u00b7 ' : '') + e(it.spec) + '</span></button>'; }).join('') +
      (i0.building ? '<a class="mp-rec" href="/building/' + encodeURIComponent(i0.building) + '#dossier">Write an offer on any unit in ' + e(i0.bname || 'the building') + ' &rarr;</a>' : '');
    side.querySelectorAll('.om-row').forEach(function (b) { b.addEventListener('click', function () { memCard(items[+b.getAttribute('data-i')], PHONE.matches ? 'quiet' : undefined); }); });
    phoneCards(items.map(function (it) { return { h: memPeek(it), open: function () { memCard(it, 'quiet'); } }; }), mode);
  }
  function drawAnon() {
    L_.cs.clearLayers(); L_.mm.clearLayers();
    groups(D.cs || [], function (c) { return c[9] || (c[1] + ',' + c[2]); }).forEach(function (g) {
      var c = g[0];
      pin(L_.cs, c[1], c[2], 'cs st', label(c[8], g.length), function () { if (g.length > 1) anonGroup(g); else anonCard(c); },
        (c[10] ? c[10] + ': ' : '') + (c[8] || 'Coming soon') + (g.length > 1 ? ' (' + g.length + ')' : ''));
    });
  }
  function drawMember(m) {
    L_.cs.clearLayers(); L_.mm.clearLayers();
    var N = window.OM && window.OM.norm; if (!N) return;
    var rows = (m.coming_soon || []).filter(function (x) { return x.y != null && x.x != null; });
    groups(rows, function (x) { return x.building || (x.y + ',' + x.x); }).forEach(function (g) {
      var x = g[0], its = g.map(function (r) { return N('cs', r); }), st = x.st || streetOf(x.address);
      pin(L_.cs, x.y, x.x, 'cs st', label(st, g.length), function () { if (g.length > 1) memGroup(its); else memCard(its[0]); },
        (x.building_name ? x.building_name + ': ' : '') + st + (g.length > 1 ? ' (' + g.length + ')' : ''));
    });
    (m.mmm || []).forEach(function (x) { if (x.y == null || x.x == null) return; var it = N('mmm', x); pin(L_.mm, x.y, x.x, 'mm', 'Owner', function () { memCard(it); }, it.title); });
    /* the layer panes list what a member can open */
    function list(id, items, type) {
      var box = document.getElementById(id); if (!box) return;
      box.innerHTML = items.map(function (x, i) { var it = N(type, x);
        /* a photo beside the row when there is one: the home's own first photo, else its building's */
        var th = it.unitPhoto || it.bimg || (it.type === 'mmm' ? it.photo : '');
        var tx = '<b>' + e(it.title) + '</b><span>' + (it.price ? money(it.price) + ' \u00b7 ' : '') + e(it.spec || it.sub) + '</span>';
        return th ? '<button type="button" class="om-row om-row-ph" data-i="' + i + '"><i class="om-row-th" style="background-image:url(\'' + e(th).replace(/'/g, '%27') + '\')"></i><span class="om-row-tx">' + tx + '</span></button>'
                  : '<button type="button" class="om-row" data-i="' + i + '">' + tx + '</button>'; }).join('');
      box.querySelectorAll('.om-row').forEach(function (b) { b.addEventListener('click', function () {
        var x = items[+b.getAttribute('data-i')], it = N(type, x); memCard(it, PHONE.matches ? 'open' : undefined); if (x.y != null) map.setView([x.y, x.x], 16); }); });
    }
    list('omCsList', m.coming_soon || [], 'cs');
    list('omMmList', m.mmm || [], 'mmm');
  }

  /* ---- the Investor Exchange, and featured listings on every layer ---- */
  function exCard(x, mode) {
    pane('item');
    side.innerHTML = '<div class="act-k">Investor Exchange' + (x[2] ? ' \u00b7 ' + e(x[2]) : '') + '</div>' +
      '<h3 class="mact-h">' + e(sp(x[5], x[6], x[7]) || 'An Exchange listing') + '</h3>' +
      '<p class="mact-lede">Offered privately to investors, often with the tenant in place.' + (x[2] ? ' In ' + e(x[2]) + '.' : '') + '</p>' +
      (MEM ? '<a class="btn btn-gold" href="/account/off-market/#investor-exchange" style="margin-top:12px;width:100%">Open it in your off-market list &rarr;</a>'
           : '<button class="btn btn-gold" data-om-signup="" data-cta="offmarket:map-ex" style="margin-top:12px;width:100%">Create a free account to see it &rarr;</button>') +
      (x[1] ? '<a class="mp-rec" href="/building/' + encodeURIComponent(x[1]) + '#dossier">Every unit in ' + e(x[2] || 'the building') + ' &rarr;</a>' : '');
    phoneCards([{ h: pk({ tag: 'Investor Exchange', tagCls: 'ex', lock: MEM ? 'Price in your off-market list' : 'Price for members', spec: specLine(x[5], x[6], x[7]),
      title: x[2] ? 'A condo in ' + x[2] : 'An Investor Exchange listing', meta: 'Offered privately, often with the tenant in place' }),
      open: function () { exCard(x, 'quiet'); } }], mode);
  }
  /* a featured listing: its card from the page, as the card and the sheet */
  function featPhone(token) {
    var full = document.querySelector('.om-feat-row [data-om-feat="' + token + '"]') || panel.querySelector('[data-om-feat="' + token + '"]');
    if (!full) return false;
    var q = function (sel) { var n = full.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; };
    var pr = full.querySelector('[data-om-fprice]'), price = pr && !pr.querySelector('.omf-lock') ? (pr.querySelector('b') || pr).textContent.trim() : '';
    var stripEl = full.querySelector('.omp'), ph = full.querySelector('.omf-ph'), bg = ph && ph.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    var spec = q('.omf-s'), title = q('.omf-t');
    phoneCards([{ h: pk({ strip: stripEl ? stripEl.outerHTML.replace('omf-ph omp', 'omx-ph omp omp-panel') : '', img: bg ? bg[1] : '', tag: 'Featured', tagCls: 'ft',
      price: price, plab: price ? 'Asking' : '', lock: 'Asking price for members', spec: e(spec), title: title, meta: 'Investor Exchange' }),
      open: function () { side = sheetBody; sheetBody.innerHTML = ''; var c = full.cloneNode(true); c.classList.remove('omf-c', 'omf-hit'); sheetBody.appendChild(c); } }]);
    return true;
  }
  function showFeatured(token) {
    setLayer('ex', { noFit: true });
    var card = panel.querySelector('[data-pane="ex"] [data-om-feat="' + token + '"]');
    if (card) { card.classList.add('omf-hit'); setTimeout(function () { card.classList.remove('omf-hit'); }, 1600); card.scrollIntoView({ block: 'nearest' }); }
  }
  (D.ex || []).forEach(function (x) {
    if (x[3] == null || x[4] == null) return;
    if (x[8]) pin(FEAT, x[3], x[4], 'ft', 'Featured', function () {
      track('offmarket:map-featured');
      if (PHONE.matches) { var ll = lastLL; setLayer('ex', { noFit: true, keepPane: false }); lastLL = ll; if (featPhone(x[0])) return; }
      showFeatured(x[0]); }, 'Featured listing');
    else pin(L_.ex, x[3], x[4], 'ex', 'Exchange', function () { exCard(x); }, 'Investor Exchange');
  });

  /* ---- tabs, deep links, sign-in ---- */
  tabs.forEach(function (t) { t.addEventListener('click', function () { var k = t.getAttribute('data-om-layer'); track('offmarket:layer-' + k); setLayer(k); }); });
  panel.addEventListener('click', function (ev) { if (ev.target.closest('[data-om-back]')) pane(cur || 'cs'); });
  var Q = null;
  function openQ() {
    Q = new URLSearchParams(location.search).get('cs'); if (!Q) return;
    if (MEM) { var x = (MEM.coming_soon || []).filter(function (r) { return r.t === Q; })[0];
      if (x && window.OM) { setLayer('cs', { keepPane: true, noFit: true }); if (x.y != null) map.setView([x.y, x.x], 16); memCard(window.OM.norm('cs', x), PHONE.matches ? 'open' : undefined); } return; }
    var c = (D.cs || []).filter(function (r) { return r[0] === Q; })[0];
    if (c) { setLayer('cs', { keepPane: true, noFit: true }); map.setView([c[1], c[2]], 15); anonCard(c, PHONE.matches ? 'open' : undefined); }
  }
  drawAnon();
  var start = (location.hash.match(/^#layer-(cs|ex|mm|b)$/) || [])[1] || 'cs';
  setLayer(start);
  openQ();
  window.addEventListener('om-member', function (ev) {
    MEM = ev.detail || null;
    if (MEM) drawMember(MEM); else drawAnon();
    var itemOpen = !panel.querySelector('[data-pane="item"]').hidden;
    openQ();
    if (itemOpen && !Q) pane(cur);
    if (cur === 'cs' || cur === 'mm') fit(L_[cur]);
  });
  window.OMMAP = { map: map, setLayer: setLayer, layer: function () { return cur; } };
})();
