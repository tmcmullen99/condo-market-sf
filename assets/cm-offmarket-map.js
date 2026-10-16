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

  var map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView([37.772, -122.43], 12);
  var k = (document.querySelector('meta[name="carto-key"]') || {}).content || '';
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' + (k && k.indexOf('__') !== 0 ? '?key=' + encodeURIComponent(k) : ''),
    { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function e(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function money(n) { return n == null ? '' : '$' + fmt(n); }
  function dd(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : ''; }
  function sp(bd, ba, sf) { return [bd != null && bd !== '' ? bd + ' bd' : '', ba != null && ba !== '' ? ba + ' ba' : '', sf ? fmt(sf) + ' sq ft' : ''].filter(Boolean).join(' · '); }
  function track(cta, x) { try { if (window.cmTrack) window.cmTrack('cta_click', Object.assign({ cta: cta }, x || {})); } catch (z) {} }

  var L_ = { cs: L.layerGroup(), ex: L.layerGroup(), mm: L.layerGroup(), b: L.layerGroup() };
  var FEAT = L.layerGroup().addTo(map);
  var cur = null, MEM = null, ON = null;

  function pin(group, y, x, cls, label, fn, title) {
    var m = L.marker([y, x], { icon: L.divIcon({ className: 'om-di', html: '<span class="om-pin ' + cls + '">' + label + '</span>', iconSize: [0, 0] }),
      keyboard: true, riseOnHover: true, title: title || '' }).addTo(group);
    m.on('click', function () {
      var p = m.getElement() && m.getElement().querySelector('.om-pin');
      if (ON) ON.classList.remove('on'); ON = p; if (ON) ON.classList.add('on');
      fn();
    });
    return m;
  }
  function pane(name) {
    panel.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
    if (ON && name !== 'item') { ON.classList.remove('on'); ON = null; }
  }
  function fit(group) {
    var pts = [];
    group.eachLayer(function (m) { if (m.getLatLng) pts.push(m.getLatLng()); });
    if (!pts.length) { map.setView([37.772, -122.43], 12); return; }   // an empty layer shows the city, not one featured pin
    FEAT.eachLayer(function (m) { pts.push(m.getLatLng()); });
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 15 });
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
    m.bindTooltip(e(b[1]) + ' · ' + fmt(b[2]) + ' units · open the dossier', { direction: 'top' });
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

  /* ---- coming soon ---- */
  function anonCard(c) {
    pane('item');
    side.innerHTML = '<div class="act-k">Coming soon' + (c[3] ? ' · ' + e(c[3]) : '') + '</div>' +
      '<h3 class="mact-h">' + e(sp(c[4], c[5], c[6]) || 'A San Francisco condo') + '</h3>' +
      '<p class="mact-lede">First seen ' + dd(c[7]) + '. Entered on the MLS as coming soon, before the listing sites.</p>' +
      '<div class="mact-prop"><div class="mp-addr om-sc-blur">&#9608;&#9608;&#9608; &#9608;&#9608;&#9608;&#9608;&#9608; St #&#9608;&#9608;</div><div class="mp-sub">Address, price and photos for members</div></div>' +
      '<button class="btn btn-gold" data-om-signup="' + e(c[0]) + '" data-cta="offmarket:map-cs" style="margin-top:14px;width:100%">Create a free account to see it &rarr;</button>' +
      '<p class="om-sc-note">Until you sign in, the pin sits near the home rather than on it.</p>';
  }
  function memCard(it) {
    pane('item');
    var a = (MEM && MEM.agent && MEM.agent.first) || 'Tim';
    var anyUnit = it.building ? '<a class="mp-rec" href="/building/' + encodeURIComponent(it.building) + '#dossier" data-cta="offmarket:any-unit">Write an offer on any unit in ' + e(it.bname || 'the building') + ' &rarr;</a><br>' : '';
    var offer = it.type === 'mmm' && it.building && it.unit
      ? '<a class="mact-choice" href="/building/' + encodeURIComponent(it.building) + '#unit-' + encodeURIComponent(String(it.unit).replace(/^#+/, '')) + '" data-cta="offmarket:mmm-offer"><span class="mc-t">Make an offer</span><span class="mc-s">' + e(a) + ' presents it to the owner</span></a>' : '';
    side.innerHTML = '<div class="act-k">' + (it.type === 'cs' ? 'Coming soon' : 'Make Me Move') + (it.sub ? ' · ' + e(it.sub) : '') + '</div>' +
      (it.photo ? '<div class="om-sc-ph" style="background-image:url(\'' + e(it.photo).replace(/'/g, '%27') + '\')"></div>' : '') +
      '<h3 class="mact-h">' + e(it.title) + '</h3><p class="mact-lede">' +
      (it.price ? '<b>' + (it.type === 'mmm' ? 'Owner’s number ' : '') + money(it.price) + '</b>' + (it.spec ? ' · ' : '') : '') + e(it.spec) +
      (it.since ? '<br>' + (it.type === 'mmm' ? 'Named ' : 'First seen ') + dd(it.since) : '') + '</p>' +
      '<div class="mact-choose">' + offer +
      '<button type="button" class="mact-choice" data-om-k="tour"><span class="mc-t">Schedule a tour</span><span class="mc-s">' + e(a) + ' confirms a time with you</span></button>' +
      '<button type="button" class="mact-choice" data-om-k="disclosures"><span class="mc-t">Request the disclosures</span><span class="mc-s">' + (it.type === 'cs' ? 'From the listing agent, sent to you' : 'Sent to you, or a plain answer if they aren’t available') + '</span></button>' +
      '<button type="button" class="mact-choice" data-om-k="comps"><span class="mc-t">Request a Comp Report</span><span class="mc-s">In your inbox within 24 hours</span></button></div>' +
      anyUnit + '<a class="mp-rec" href="/account/off-market/' + (it.type === 'cs' ? '?cs=' + encodeURIComponent(it.key) : '#make-me-move') + '">Open in your off-market list &rarr;</a>';
    side.querySelectorAll('[data-om-k]').forEach(function (b) { b.addEventListener('click', function () { if (window.OM) window.OM.act(it, b.getAttribute('data-om-k')); }); });
  }
  function drawAnon() {
    L_.cs.clearLayers(); L_.mm.clearLayers();
    (D.cs || []).forEach(function (c) { pin(L_.cs, c[1], c[2], 'cs', 'Soon', function () { anonCard(c); }, 'Coming soon'); });
  }
  function drawMember(m) {
    L_.cs.clearLayers(); L_.mm.clearLayers();
    var N = window.OM && window.OM.norm; if (!N) return;
    (m.coming_soon || []).forEach(function (x) { if (x.y == null || x.x == null) return; var it = N('cs', x); pin(L_.cs, x.y, x.x, 'cs', 'Soon', function () { memCard(it); }, x.address); });
    (m.mmm || []).forEach(function (x) { if (x.y == null || x.x == null) return; var it = N('mmm', x); pin(L_.mm, x.y, x.x, 'mm', 'Owner', function () { memCard(it); }, it.title); });
    /* the layer panes list what a member can open */
    function list(id, items, type) {
      var box = document.getElementById(id); if (!box) return;
      box.innerHTML = items.map(function (x, i) { var it = N(type, x);
        return '<button type="button" class="om-row" data-i="' + i + '"><b>' + e(it.title) + '</b><span>' + (it.price ? money(it.price) + ' · ' : '') + e(it.spec || it.sub) + '</span></button>'; }).join('');
      box.querySelectorAll('.om-row').forEach(function (b) { b.addEventListener('click', function () {
        var x = items[+b.getAttribute('data-i')], it = N(type, x); memCard(it); if (x.y != null) map.setView([x.y, x.x], 16); }); });
    }
    list('omCsList', m.coming_soon || [], 'cs');
    list('omMmList', m.mmm || [], 'mmm');
  }

  /* ---- the Investor Exchange, and featured listings on every layer ---- */
  function exCard(x) {
    pane('item');
    side.innerHTML = '<div class="act-k">Investor Exchange' + (x[2] ? ' · ' + e(x[2]) : '') + '</div>' +
      '<h3 class="mact-h">' + e(sp(x[5], x[6], x[7]) || 'An Exchange listing') + '</h3>' +
      '<p class="mact-lede">Offered privately to investors, often with the tenant in place.' + (x[2] ? ' In ' + e(x[2]) + '.' : '') + '</p>' +
      (MEM ? '<a class="btn btn-gold" href="/account/off-market/#investor-exchange" style="margin-top:12px;width:100%">Open it in your off-market list &rarr;</a>'
           : '<button class="btn btn-gold" data-om-signup="" data-cta="offmarket:map-ex" style="margin-top:12px;width:100%">Create a free account to see it &rarr;</button>') +
      (x[1] ? '<a class="mp-rec" href="/building/' + encodeURIComponent(x[1]) + '#dossier">Every unit in ' + e(x[2] || 'the building') + ' &rarr;</a>' : '');
  }
  function showFeatured(token) {
    setLayer('ex', { noFit: true });
    var card = panel.querySelector('[data-pane="ex"] [data-om-feat="' + token + '"]');
    if (card) { card.classList.add('omf-hit'); setTimeout(function () { card.classList.remove('omf-hit'); }, 1600); card.scrollIntoView({ block: 'nearest' }); }
  }
  (D.ex || []).forEach(function (x) {
    if (x[3] == null || x[4] == null) return;
    if (x[8]) pin(FEAT, x[3], x[4], 'ft', 'Featured', function () { track('offmarket:map-featured'); showFeatured(x[0]); }, 'Featured listing');
    else pin(L_.ex, x[3], x[4], 'ex', 'Exchange', function () { exCard(x); }, 'Investor Exchange');
  });

  /* ---- tabs, deep links, sign-in ---- */
  tabs.forEach(function (t) { t.addEventListener('click', function () { var k = t.getAttribute('data-om-layer'); track('offmarket:layer-' + k); setLayer(k); }); });
  panel.addEventListener('click', function (ev) { if (ev.target.closest('[data-om-back]')) pane(cur || 'cs'); });
  var Q = null;
  function openQ() {
    Q = new URLSearchParams(location.search).get('cs'); if (!Q) return;
    if (MEM) { var x = (MEM.coming_soon || []).filter(function (r) { return r.t === Q; })[0];
      if (x && window.OM) { setLayer('cs', { keepPane: true, noFit: true }); memCard(window.OM.norm('cs', x)); if (x.y != null) map.setView([x.y, x.x], 16); } return; }
    var c = (D.cs || []).filter(function (r) { return r[0] === Q; })[0];
    if (c) { setLayer('cs', { keepPane: true, noFit: true }); anonCard(c); map.setView([c[1], c[2]], 15); }
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
