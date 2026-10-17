/* =============================================================================
 * cm-offmarket.js \u2014 off-market listings for members (Tim, 16 Oct 2026)
 * -----------------------------------------------------------------------------
 * "Investor Exchange, make me move + coming soon listings all display inside the
 * user account > can click property cards, request disclosures, request comps,
 * schedule a tour, etc > agent gets notified. Then up-sell 'Write An Offer On Any
 * Unit' in the building > send user to dossier."
 *
 * Classic script, loaded before the page's own script so window.OM exists:
 *   OM.signup(token)   open the account modal; ?cs=<token> brings them back to it
 *   OM.act(item, kind) the request sheet (disclosures, Comp Report, tour, question)
 *   OM.member()        the member payload once loaded (null when signed out)
 *   'om-member' event  fired on window with detail = payload (or null)
 *
 * Mounts, by attribute:
 *   [data-om-grid]          /off-market/: the gated cards become the real ones
 *   [data-om-bcs="<slug>"]  building page: this building's coming-soon cards
 *   [data-om-account]       /account/off-market/: everything, with actions
 *
 * Nothing gated is in the page's HTML. Addresses, prices and photos come only from
 * offmarket_member_payload, which answers a signed-in session and nobody else.
 * Requests go to the offmarket-request function, which checks the session itself,
 * looks the property up on the server, and emails the market's own agent.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.OM) return;

  var cfgEl = document.querySelector('[data-om-domain]');
  var DOMAIN = (cfgEl && cfgEl.getAttribute('data-om-domain')) || location.hostname.replace(/^www\./, '');
  var A_URL = cfgEl && cfgEl.getAttribute('data-om-a-url');
  var A_KEY = cfgEl && cfgEl.getAttribute('data-om-a-key');
  var A_MKT = cfgEl && Number(cfgEl.getAttribute('data-om-a-market') || 0);

  var S = { member: null, uid: null, pending: null, ex: null };
  var TYPE = { cs: 'Coming soon', mmm: 'Make Me Move', ex: 'Investor Exchange' };

  /* --------------------------------- helpers --------------------------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return n == null || n === '' || isNaN(n) ? '' : '$' + Number(n).toLocaleString('en-US'); }
  function nf(n) { return Number(n).toLocaleString('en-US'); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : ''; }
  function spec(bd, ba, sf) {
    return [bd != null && bd !== '' ? bd + ' bd' : '', ba != null && ba !== '' ? ba + ' ba' : '', sf ? nf(sf) + ' sq ft' : ''].filter(Boolean).join(' \u00b7 ');
  }
  function agentFirst() { return (S.member && S.member.agent && S.member.agent.first) || 'Tim'; }
  function track(cta, extra) { try { if (window.cmTrack) window.cmTrack('cta_click', Object.assign({ cta: cta }, extra || {})); } catch (e) {} }
  function whenCM(cb) {
    if (window.CM) { cb(window.CM); return; }
    window.addEventListener('cm-ready', function on() { window.removeEventListener('cm-ready', on); if (window.CM) cb(window.CM); });
  }

  /* An item, whatever kind it is, in one shape. */
  function norm(type, x) {
    if (type === 'cs') return { type: 'cs', ref: 'cs:' + x.t, key: x.t, title: x.address || 'Coming soon',
      sub: [x.building_name, x.h].filter(Boolean).join(' \u00b7 '), price: x.price, plab: 'Price',
      /* in a catalogued building: the building's hero photo, so the building is clear; the home's own photo inset */
      photo: (x.building && x.hero) || (x.photos && x.photos[0]) || x.hero || '', bimg: x.building ? (x.hero || '') : '',
      unitPhoto: (x.photos && x.photos[0]) || '', nPhotos: (x.photos || []).length, spec: spec(x.bd, x.ba, x.sf),
      since: x.since, building: x.building, bname: x.building_name, y: x.y, x: x.x };
    if (type === 'mmm') return { type: 'mmm', ref: 'mmm:' + x.id, key: x.id, unit: x.unit,
      title: (x.unit ? 'Unit ' + x.unit : 'A unit') + (x.building_name ? ', ' + x.building_name : ''),
      sub: x.h || '', price: x.price, plab: 'Owner\u2019s number', photo: x.hero || '', spec: x.units ? nf(x.units) + ' homes in the building' : '',
      since: x.since, building: x.building, bname: x.building_name, y: x.y, x: x.x };
    var b = x.building || {};
    return { type: 'ex', ref: 'ex:' + x.token, key: x.token, title: x.address || (b.name ? 'A unit at ' + b.name : 'An Investor Exchange listing'),
      sub: [x.area, x.property_type].filter(Boolean).join(' \u00b7 '), price: null, plab: '', cover: x.cover, nPhotos: x.photo_count || 0,
      spec: spec(x.beds, x.baths, x.sqft) + (x.hoa_fee_monthly ? ' \u00b7 HOA ' + money(Math.round(x.hoa_fee_monthly)) + '/mo' : ''),
      since: String(x.published_at || '').slice(0, 10), building: b.slug, bname: b.name, exUrl: x.member_url };
  }

  /* --------------------------------- styles ---------------------------------- */
  function css() {
    if (document.getElementById('omx-css')) return;
    var s = document.createElement('style'); s.id = 'omx-css';
    s.textContent =
      '.omx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:18px}' +
      '.omx-card{background:#fff;color:#1a1f2e;border:1px solid rgba(26,31,46,.1);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;text-align:left;scroll-margin-top:90px;transition:box-shadow .2s}' +
      '.omx-card.omx-hit{box-shadow:0 0 0 3px #C2410C}' +
      '.omx-ph{position:relative;height:178px;background:#e8ebf1 center/cover no-repeat;display:block}' +
      '.omx-ph .omx-n{position:absolute;right:10px;bottom:10px;background:rgba(18,21,29,.75);color:#fff;font:500 11px/1 "JetBrains Mono",monospace;padding:5px 8px;border-radius:999px}' +
      '.omx-tag{position:absolute;left:10px;top:10px;background:#12151d;color:#fff;font:500 10px/1 "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;padding:6px 9px;border-radius:999px}' +
      '.omx-tag.cs{background:#C2410C}' +
      '.omx-bn{position:absolute;left:10px;bottom:10px;background:rgba(18,21,29,.8);color:#fff;font:600 11.5px/1 "DM Sans",system-ui,sans-serif;padding:6px 9px;border-radius:999px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.omx-inset{position:absolute;right:10px;bottom:10px;width:58px;height:58px;border-radius:9px;border:2px solid #fff;background:#ccc center/cover no-repeat;box-shadow:0 2px 8px rgba(0,0,0,.3)}' +
      '.omx-b{padding:16px 18px 18px;display:flex;flex-direction:column;gap:3px;flex:1}' +
      '.omx-plab{font:500 10px/1.4 "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:#5d6575}' +
      '.omx-price{font-family:"Playfair Display",Georgia,serif;font-size:1.45rem;font-weight:600;line-height:1.15}' +
      '.omx-addr{font-weight:600;font-size:1rem;line-height:1.35;margin-top:4px}' +
      '.omx-sub{font-size:.86rem;color:#5d6575;line-height:1.45}' +
      '.omx-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}' +
      '.omx-act{appearance:none;border:1px solid rgba(26,31,46,.18);background:#fff;color:#1a1f2e;font:600 12.5px/1.2 "DM Sans",system-ui,sans-serif;padding:8px 11px;border-radius:999px;cursor:pointer;text-decoration:none;display:inline-block}' +
      '.omx-act:hover{border-color:#C2410C;color:#C2410C}' +
      '.omx-act.pri{background:#C2410C;border-color:#C2410C;color:#fff}.omx-act.pri:hover{color:#fff;background:#9a360c}' +
      '.omx-up{margin-top:12px;padding-top:12px;border-top:1px solid rgba(26,31,46,.08);font-size:.86rem;line-height:1.45}' +
      '.omx-up a{color:#C2410C;font-weight:600;text-decoration:none}.omx-up a:hover{text-decoration:underline}' +
      '.omx-empty{border:1px dashed rgba(26,31,46,.22);border-radius:14px;padding:20px 22px;color:#5d6575;font-size:.95rem;line-height:1.55;background:#fff}' +
      '.omx-sec{margin:0 0 44px}.omx-sec h2{font-family:"Playfair Display",Georgia,serif;font-size:clamp(1.4rem,2.6vw,1.9rem);margin:0 0 4px;color:#1a1f2e}' +
      '.omx-sec h2 span{font:500 .8rem "JetBrains Mono",monospace;color:#5d6575;margin-left:8px;letter-spacing:.06em}' +
      '.omx-sec .omx-lede{color:#5d6575;font-size:.95rem;line-height:1.55;margin:0 0 16px;max-width:68ch}' +
      '.omx-veil{position:fixed;inset:0;z-index:10050;background:rgba(18,21,29,.55);display:flex;align-items:flex-end;justify-content:center}' +
      '@media(min-width:640px){.omx-veil{align-items:center;padding:20px}}' +
      '.omx-sheet{position:relative;background:#faf7f2;color:#1a1f2e;width:100%;max-width:520px;border-radius:18px 18px 0 0;padding:24px 22px 22px;max-height:92vh;overflow:auto;box-shadow:0 30px 80px rgba(18,21,29,.4);font-family:"DM Sans",system-ui,sans-serif}' +
      '@media(min-width:640px){.omx-sheet{border-radius:18px}}' +
      '.omx-x{position:absolute;top:6px;right:8px;appearance:none;background:none;border:0;font-size:28px;line-height:1;color:#5d6575;cursor:pointer;padding:8px}' +
      '.omx-k{font:500 10.5px/1.4 "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#9a360c;padding-right:30px}' +
      '.omx-h{font-family:"Playfair Display",Georgia,serif;font-size:1.45rem;line-height:1.2;margin:6px 0 2px}' +
      '.omx-kinds{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0 6px}' +
      '.omx-kind{appearance:none;border:1px solid rgba(26,31,46,.16);background:#fff;color:#1a1f2e;font:600 13.5px/1.25 "DM Sans",system-ui,sans-serif;padding:11px 10px;border-radius:12px;cursor:pointer;text-align:left}' +
      '.omx-kind.on{border-color:#C2410C;background:#fff3ec;color:#9a360c}' +
      '.omx-what{font-size:.9rem;color:#3d4452;line-height:1.55;margin:10px 0 0}' +
      '.omx-f label{display:block;font-size:.84rem;font-weight:600;margin:12px 0 4px}' +
      '.omx-f input,.omx-f textarea{width:100%;box-sizing:border-box;border:1px solid rgba(26,31,46,.18);border-radius:10px;padding:11px 12px;font:inherit;font-size:16px;background:#fff;color:#1a1f2e}' +
      '.omx-f textarea{min-height:76px;resize:vertical}' +
      '.omx-go{margin-top:16px;width:100%;appearance:none;border:0;background:#C2410C;color:#fff;font:700 15px "DM Sans",system-ui,sans-serif;padding:14px;border-radius:12px;cursor:pointer}' +
      '.omx-go[disabled]{opacity:.6;cursor:default}' +
      '.omx-msg{margin:10px 0 0;font-size:.92rem;line-height:1.5}.omx-msg.err{color:#a8431f}.omx-msg.ok{color:#245f3d}' +
      '.omx-done{text-align:left}.omx-done p{margin:8px 0 0;line-height:1.55}' +
      /* the tour calendar: two picks, nothing inside 48 hours (see tourPicker) */
      '.omx-sheet{transition:max-width .2s ease}@media(min-width:760px){.omx-sheet.wide{max-width:740px}}' +
      '.omx-cal-grid{display:grid;gap:14px;margin-top:14px}' +
      '@media(min-width:760px){.omx-sheet.wide .omx-cal-grid{grid-template-columns:292px minmax(0,1fr);gap:22px;align-items:start}}' +
      '.omx-mo{background:#fff;border:1px solid rgba(26,31,46,.12);border-radius:14px;padding:8px 8px 6px}' +
      '.omx-mo-h{display:flex;align-items:center;justify-content:space-between;margin:0 0 4px}' +
      '.omx-mo-h b{font:600 14px "DM Sans",system-ui,sans-serif;color:#1a1f2e}' +
      '.omx-mo-nav{appearance:none;border:0;background:none;width:34px;height:34px;border-radius:9px;cursor:pointer;color:#1a1f2e;font:500 18px/1 "DM Sans",system-ui,sans-serif}' +
      '.omx-mo-nav:hover:not([disabled]){background:#f4efe7}.omx-mo-nav[disabled]{opacity:.22;cursor:default}' +
      '.omx-dow,.omx-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}' +
      '.omx-dow span{font:500 9.5px/2 "JetBrains Mono",monospace;letter-spacing:.08em;color:#8a8f9a;text-align:center}' +
      '.omx-day{appearance:none;border:0;background:none;height:36px;border-radius:9px;font:500 14px "DM Sans",system-ui,sans-serif;color:#1a1f2e;cursor:pointer;position:relative;padding:0}' +
      '.omx-day:hover:not([disabled]):not(.on){background:#f6eee4}' +
      '.omx-day[disabled]{color:#c3c6cc;cursor:default}' +
      '.omx-day.on{background:#1a1f2e;color:#fff}' +
      '.omx-day.has:after{content:"";position:absolute;left:50%;bottom:4px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:#C2410C}' +
      '.omx-day.on.has:after{background:#f28c63}' +
      '.omx-day:focus-visible,.omx-slot:focus-visible,.omx-mo-nav:focus-visible{outline:2px solid #C2410C;outline-offset:1px}' +
      '.omx-sl-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:0 0 8px}' +
      '.omx-sl-h b{font-size:.9rem;font-weight:600;color:#1a1f2e}.omx-sl-h span{font-size:.76rem;color:#6b7180;white-space:nowrap}' +
      '.omx-slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}' +
      '.omx-slot{appearance:none;border:1px solid rgba(26,31,46,.16);background:#fff;border-radius:10px;padding:10px 2px;font:600 13px "DM Sans",system-ui,sans-serif;color:#1a1f2e;cursor:pointer;white-space:nowrap;position:relative}' +
      '.omx-slot:hover:not([disabled]):not(.on){border-color:#C2410C;color:#9a360c}' +
      '.omx-slot[disabled]{opacity:.4;cursor:default;background:transparent}' +
      '.omx-slot.on{background:#C2410C;border-color:#C2410C;color:#fff}' +
      '.omx-slot sup{position:absolute;top:-7px;right:-5px;background:#1a1f2e;color:#fff;font:600 9.5px/16px "DM Sans",system-ui,sans-serif;min-width:16px;height:16px;border-radius:8px;padding:0 3px}' +
      '.omx-picks{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}' +
      '.omx-pick{display:flex;align-items:center;gap:6px;min-height:52px;border:1px dashed rgba(26,31,46,.24);border-radius:12px;padding:7px 6px 7px 12px;min-width:0}' +
      '.omx-pick.set{border:1px solid #C2410C;background:#fff3ec}' +
      '.omx-pick div{min-width:0}.omx-pick i{display:block;font:500 9.5px/1.5 "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:#9a360c;font-style:normal}' +
      '.omx-pick span{display:block;font-size:13.5px;font-weight:600;color:#1a1f2e;line-height:1.3}.omx-pick span.e{font-weight:400;color:#8a8f9a}' +
      '.omx-pick button{margin-left:auto;flex:0 0 auto;appearance:none;border:0;background:none;color:#9a360c;font-size:20px;line-height:1;width:30px;height:30px;border-radius:8px;cursor:pointer}' +
      '.omx-pick button:hover{background:rgba(194,65,12,.1)}' +
      '.omx-hint{font-size:.8rem;color:#6b7180;margin:8px 0 0;min-height:1.2em}.omx-hint.warn{color:#a8431f}' +
      '.omx-addnote{appearance:none;border:0;background:none;color:#9a360c;font:600 13.5px "DM Sans",system-ui,sans-serif;padding:4px 0;margin:12px 0 0;cursor:pointer}' +
      '@media(max-width:400px){.omx-slot{font-size:12px}.omx-pick span{font-size:12.5px}}';
    document.head.appendChild(s);
  }

  /* --------------------------------- cards ----------------------------------- */
  function cardHtml(it, opt) {
    opt = opt || {};
    var photo = it.photo ? ' style="background-image:url(\'' + esc(it.photo).replace(/'/g, '%27') + '\')"' : '';
    var acts = '<div class="omx-acts">' +
      (it.type === 'mmm' && it.building && it.unit
        ? '<a class="omx-act pri" href="/building/' + encodeURIComponent(it.building) + '#unit-' + encodeURIComponent(String(it.unit).replace(/^#+/, '')) + '" data-cta="offmarket:mmm-offer">Make an offer \u2192</a>'
        : '<button type="button" class="omx-act pri" data-om-act="tour">Schedule a tour</button>') +
      '<button type="button" class="omx-act" data-om-act="disclosures">Disclosures</button>' +
      (it.type === 'ex' ? '' : '<button type="button" class="omx-act" data-om-act="comps">Comp Report</button>') +
      (it.type === 'mmm' ? '<button type="button" class="omx-act" data-om-act="tour">Tour</button>' : '') +
      '<button type="button" class="omx-act" data-om-act="question">Ask ' + esc(agentFirst()) + '</button>' +
      '</div>';
    var up = it.building && opt.upsell !== false
      ? '<div class="omx-up">Not this one? <a href="/building/' + encodeURIComponent(it.building) + '#dossier" data-cta="offmarket:any-unit">Write an offer on any unit in ' + esc(it.bname || 'the building') + ' \u2192</a></div>'
      : '';
    var ex = it.type === 'ex' && it.exUrl ? '<div class="omx-sub"><a href="' + esc(it.exUrl) + '" style="color:#C2410C;font-weight:600;text-decoration:none">Full listing on the Investor Exchange \u2192</a></div>' : '';
    return '<article class="omx-card" id="' + it.type + '-' + esc(it.key) + '" data-om-ref="' + esc(it.ref) + '">' +
      '<div class="omx-ph"' + photo + (it.cover ? ' data-om-cover="' + esc(it.cover) + '"' : '') + '><span class="omx-tag' + (it.type === 'cs' ? ' cs' : '') + '">' + TYPE[it.type] + '</span>' +
      (it.bimg && it.bname ? '<span class="omx-bn">' + esc(it.bname) + '</span>' : '') +
      (it.bimg && it.unitPhoto ? '<i class="omx-inset" style="background-image:url(\'' + esc(it.unitPhoto).replace(/'/g, '%27') + '\')" title="This home' + (it.nPhotos > 1 ? ', ' + it.nPhotos + ' photos' : '') + '"></i>'
        : (it.nPhotos > 1 ? '<span class="omx-n">' + it.nPhotos + ' photos</span>' : '')) + '</div>' +
      '<div class="omx-b">' +
      (it.price ? '<div class="omx-plab">' + esc(it.plab) + '</div><div class="omx-price">' + money(it.price) + '</div>' : '') +
      (it.type === 'ex' ? '<div class="omx-fp" data-om-fprice="' + esc(it.key) + '" data-om-fstyle="card" hidden></div>' : '') +
      '<div class="omx-addr">' + esc(it.title) + '</div>' +
      (it.spec ? '<div class="omx-sub">' + esc(it.spec) + '</div>' : '') +
      (it.sub ? '<div class="omx-sub">' + esc(it.sub) + '</div>' : '') +
      (it.since ? '<div class="omx-sub">' + (it.type === 'mmm' ? 'Named ' : it.type === 'ex' ? 'On the Exchange since ' : 'First seen ') + day(it.since) + '</div>' : '') +
      (it.building && opt.buildingLink !== false ? '<div class="omx-sub"><a href="/building/' + encodeURIComponent(it.building) + '" style="color:inherit">The building record \u2192</a></div>' : '') +
      ex + acts + up + '</div></article>';
  }
  /* Cards are wired once per container: a click on an action opens the sheet. */
  function wire(box, items) {
    var by = {}; items.forEach(function (it) { by[it.ref] = it; });
    box.__omItems = by;
    if (box.__omWired) return; box.__omWired = true;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-om-act]'); if (!b) return;
      var card = b.closest('[data-om-ref]'); var it = card && box.__omItems[card.getAttribute('data-om-ref')];
      if (it) { e.preventDefault(); act(it, b.getAttribute('data-om-act')); }
    });
  }
  function signCovers(box) {
    if (!A_URL || !A_KEY) return;
    box.querySelectorAll('[data-om-cover]').forEach(function (el) {
      fetch(A_URL + '/storage/v1/object/sign/exchange-photos/' + encodeURI(el.getAttribute('data-om-cover')), {
        method: 'POST', headers: { apikey: A_KEY, Authorization: 'Bearer ' + A_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (x) { if (x && x.signedURL) el.style.backgroundImage = 'url(' + A_URL + '/storage/v1' + x.signedURL + ')'; })
        .catch(function () {});
    });
  }
  function render(box, items, opt) {
    css();
    box.innerHTML = items.map(function (it) { return cardHtml(it, opt); }).join('');
    wire(box, items); signCovers(box);
  }
  /* ?cs=<token>: the card someone signed up from, brought into view. */
  function focusDeepLink() {
    var t = new URLSearchParams(location.search).get('cs'); if (!t) return;
    var el = document.getElementById('cs-' + t); if (!el) return;
    el.classList.add('omx-hit');
    setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
  }

  /* ------------------------------ tour calendar ------------------------------ */
  /* Tim, 17 Oct 2026: "Make schedule a tour a calendar function. Cannot book a tour within 48 hours.
     User selects two times, due to the agent having to request those times from owner, most off market
     properties mean the owner/tenant needs notice." So: a month calendar and hourly start times, every
     time inside 48 hours greyed out, and exactly two picks, sent as instants. offmarket-request checks
     the same rules again. Every time is Pacific, because the homes are: a visitor in New York sees
     "10 AM" meaning 10 AM in San Francisco, and the line under the times says so. */
  var TOUR = { notice: 48, days: 30, first: 9, last: 18 };   // start times 9 AM to 6 PM, on the hour
  function tourParty(it) {
    return it && it.type === 'cs' ? 'the listing agent' : it && it.type === 'ex' ? 'the owner (and the tenant, if it’s rented)' : 'the owner';
  }
  var PTF = null, PTL = null;
  function ptParts(d) {
    if (!PTF) PTF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    var o = {}; PTF.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month - 1, d: +o.day, h: (+o.hour) % 24, mi: +o.minute };
  }
  /* The instant that is h:00 on that Pacific calendar day (DST included): start from the UTC reading
     and correct by the Pacific offset at that instant, twice so a guess across a DST change settles. */
  function ptTime(y, m, d, h) {
    var guess = Date.UTC(y, m, d, h), t = guess;
    for (var i = 0; i < 2; i++) { var p = ptParts(new Date(t)); t = guess - (Date.UTC(p.y, p.m, p.d, p.h, p.mi) - t); }
    return new Date(t);
  }
  function slotLabel(t) {
    if (!PTL) PTL = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' });
    return PTL.format(t);
  }
  function hourLabel(h) { return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); }
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function tourPicker(root, hint) {
    var picks = [];                        // [{t: Date, k: 'y-m-d', h}], in the order chosen: 1st, then 2nd choice
    var cutoff, days = [], byKey = {}, sel = null, view = null;
    function key(y, m, d) { return y + '-' + m + '-' + d; }
    function build() {
      cutoff = Date.now() + TOUR.notice * 3600e3;
      var today = ptParts(new Date()); days = []; byKey = {};
      for (var i = 0; i <= TOUR.days + 2; i++) {
        var u = new Date(Date.UTC(today.y, today.m, today.d + i));
        var y = u.getUTCFullYear(), m = u.getUTCMonth(), d = u.getUTCDate(), hrs = [];
        for (var h = TOUR.first; h <= TOUR.last; h++) { var t = ptTime(y, m, d, h); hrs.push({ h: h, t: t, ok: t.getTime() >= cutoff }); }
        var day = { y: y, m: m, d: d, dow: u.getUTCDay(), k: key(y, m, d), hrs: hrs, ok: i <= TOUR.days + 2 && hrs.some(function (x) { return x.ok; }) };
        days.push(day); byKey[day.k] = day;
      }
      /* the window is TOUR.days of bookable days from the first one, so it never shrinks to 28 */
      var first = days.filter(function (x) { return x.ok; })[0];
      if (first) { var n = 0; days.forEach(function (x) { if (x.ok) { n++; if (n > TOUR.days) x.ok = false; } }); }
      if (!sel || !byKey[sel] || !byKey[sel].ok) sel = first ? first.k : null;
      if (!view && first) view = { y: first.y, m: first.m };
    }
    function months() {
      var ok = days.filter(function (x) { return x.ok; });
      return ok.length ? { a: ok[0].y * 12 + ok[0].m, b: ok[ok.length - 1].y * 12 + ok[ok.length - 1].m } : null;
    }
    function picked(t) { for (var i = 0; i < picks.length; i++) if (picks[i].t.getTime() === t.getTime()) return i; return -1; }
    function render() {
      var r = months(); if (!r || !view) { root.innerHTML = '<p class="omx-hint">No times to offer right now. Ask a question instead and ' + esc(agentFirst()) + ' will reply.</p>'; return; }
      var vm = view.y * 12 + view.m;
      var start = new Date(Date.UTC(view.y, view.m, 1)), lead = start.getUTCDay(), dim = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
      var cells = '';
      for (var b = 0; b < lead; b++) cells += '<span></span>';
      for (var d = 1; d <= dim; d++) {
        var k = key(view.y, view.m, d), day = byKey[k], ok = !!(day && day.ok);
        var has = picks.some(function (p) { return p.k === k; });
        cells += '<button type="button" class="omx-day' + (k === sel ? ' on' : '') + (has ? ' has' : '') + '" data-day="' + k + '"' + (ok ? '' : ' disabled')
          + ' aria-pressed="' + (k === sel) + '" aria-label="' + DOW[new Date(Date.UTC(view.y, view.m, d)).getUTCDay()] + ', ' + MON[view.m] + ' ' + d + (has ? ', one of your times' : '') + (ok ? '' : ', not available') + '">' + d + '</button>';
      }
      var sd = sel && byKey[sel];
      var slots = sd ? sd.hrs.map(function (x) {
        var i = picked(x.t);
        return '<button type="button" class="omx-slot' + (i > -1 ? ' on' : '') + '" data-t="' + x.t.getTime() + '"' + (x.ok ? '' : ' disabled')
          + ' aria-pressed="' + (i > -1) + '" aria-label="' + hourLabel(x.h) + (x.ok ? '' : ', less than 48 hours away') + (i > -1 ? ', your ' + (i ? 'second' : 'first') + ' choice' : '') + '">'
          + hourLabel(x.h) + (i > -1 ? '<sup>' + (i + 1) + '</sup>' : '') + '</button>';
      }).join('') : '';
      var tz = '';
      try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (z && z !== 'America/Los_Angeles') tz = 'Pacific time'; } catch (e) {}
      root.innerHTML =
        '<div class="omx-cal-grid"><div class="omx-mo">' +
          '<div class="omx-mo-h"><button type="button" class="omx-mo-nav" data-mo="-1" aria-label="Previous month"' + (vm <= r.a ? ' disabled' : '') + '>‹</button>' +
          '<b>' + MON[view.m] + ' ' + view.y + '</b>' +
          '<button type="button" class="omx-mo-nav" data-mo="1" aria-label="Next month"' + (vm >= r.b ? ' disabled' : '') + '>›</button></div>' +
          '<div class="omx-dow" aria-hidden="true"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>' +
          '<div class="omx-days">' + cells + '</div></div>' +
        '<div class="omx-sl">' +
          '<div class="omx-sl-h"><b>' + (sd ? DOW[sd.dow] + ', ' + MON[sd.m].slice(0, 3) + ' ' + sd.d : 'Pick a day') + '</b>' + (tz ? '<span>' + tz + '</span>' : '') + '</div>' +
          '<div class="omx-slots">' + slots + '</div>' +
          '<div class="omx-picks">' + [0, 1].map(function (i) {
            var p = picks[i];
            return '<div class="omx-pick' + (p ? ' set' : '') + '"><div><i>' + (i ? '2nd choice' : '1st choice') + '</i>' +
              (p ? '<span>' + esc(slotLabel(p.t)) + '</span>' : '<span class="e">' + (i && picks.length ? 'Pick another time' : 'Pick a time') + '</span>') + '</div>' +
              (p ? '<button type="button" data-rm="' + i + '" aria-label="Remove ' + (i ? '2nd' : '1st') + ' choice">×</button>' : '') + '</div>';
          }).join('') + '</div>' +
        '</div></div>';
    }
    function say(t, warn) { if (hint) { hint.textContent = t || ''; hint.className = 'omx-hint' + (warn ? ' warn' : ''); } }
    root.addEventListener('click', function (e) {
      var el = e.target.closest('button'); if (!el || el.disabled) return;
      if (el.hasAttribute('data-mo')) { var n = view.y * 12 + view.m + (+el.getAttribute('data-mo')); view = { y: Math.floor(n / 12), m: n % 12 };
        var f = days.filter(function (x) { return x.ok && x.y === view.y && x.m === view.m; })[0]; if (f && (!byKey[sel] || byKey[sel].m !== view.m)) sel = f.k; render(); return; }
      if (el.hasAttribute('data-day')) { sel = el.getAttribute('data-day'); render(); var b = root.querySelector('.omx-slot:not([disabled])'); if (b && window.innerWidth < 760) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      if (el.hasAttribute('data-rm')) { picks.splice(+el.getAttribute('data-rm'), 1); say(''); render(); return; }
      if (el.hasAttribute('data-t')) {
        var t = new Date(+el.getAttribute('data-t')), i = picked(t);
        if (i > -1) { picks.splice(i, 1); say(''); }
        else if (picks.length >= 2) { say('You have two times. Remove one to choose a different time.', true); return; }
        else { picks.push({ t: t, k: sel }); say(picks.length === 1 ? 'Now pick a second time. A different day gives ' + agentFirst() + ' the best chance of a yes.' : ''); }
        render();
        var again = root.querySelector('[data-t="' + t.getTime() + '"]'); if (again) again.focus();
      }
    });
    build(); render();
    return {
      /* null when both picks are good; otherwise what to tell them. A pick that has slipped inside 48
         hours while the sheet sat open is dropped and named. */
      check: function () {
        var lim = Date.now() + TOUR.notice * 3600e3, late = picks.filter(function (p) { return p.t.getTime() < lim; });
        if (late.length) { picks = picks.filter(function (p) { return p.t.getTime() >= lim; }); build(); render();
          return slotLabel(late[0].t) + ' is now less than 48 hours away. Pick a later time.'; }
        if (picks.length < 2) return picks.length ? 'Pick a second time. ' + agentFirst() + ' asks for both, in case one doesn’t work.' : 'Pick two times on the calendar.';
        return null;
      },
      iso: function () { return picks.map(function (p) { return p.t.toISOString(); }); },
      text: function () { return picks.map(function (p, i) { return (i ? '2nd choice ' : '1st choice ') + slotLabel(p.t); }).join('; ') + ' (Pacific)'; },
      labels: function () { return picks.map(function (p) { return slotLabel(p.t); }); }
    };
  }

  /* --------------------------------- the sheet ------------------------------- */
  var KIND = {
    disclosures: { b: 'Disclosures', h: 'Request the disclosures',
      w: function (it) { return agentFirst() + ' asks ' + (it.type === 'cs' ? 'the listing agent ' : '') + 'for the disclosure package and sends it to you, or tells you plainly if it isn\u2019t available yet.'; } },
    comps: { b: 'Comp Report', h: 'Request a Comp Report',
      w: function () { return 'Recorded sales chosen one by one for this home, with the arithmetic shown, delivered to your inbox within 24 hours.'; } },
    tour: { b: 'Schedule a tour', h: 'Schedule a tour',
      w: function (it) { return 'Pick two times. ' + agentFirst() + ' asks ' + tourParty(it) + ' which one works, then confirms it with you by email. Off-market homes are lived in, so the earliest time is 48 hours from now.'; } },
    question: { b: 'Ask a question', h: 'Ask a question',
      w: function () { return agentFirst() + ' replies to you directly, by email.'; } },
  };
  var DONE = {
    disclosures: function (it) { return agentFirst() + ' will ask ' + (it.type === 'cs' ? 'the listing agent ' : '') + 'for the disclosure package and send it to you, or tell you plainly if it isn\u2019t available yet.'; },
    comps: function () { return 'Your Comp Report will be in your inbox within 24 hours.'; },
    tour: function (it) { return agentFirst() + ' will ask ' + tourParty(it) + ' which of your two times works and confirm one with you by email. Nothing is booked until then.'; },
    question: function () { return agentFirst() + ' will reply to you directly, by email.'; },
  };
  function act(it, kind) {
    if (!S.member) {
      if (S.pending) { S.pending.then(function () { if (S.member) act(it, kind); }); return; }
      signup(it.type === 'cs' ? it.key : null); return;
    }
    css();
    kind = KIND[kind] ? kind : 'tour';
    if (it.type === 'ex' && kind === 'comps') kind = 'question';
    track('offmarket:sheet-' + kind, { ref_type: it.type });
    var v = document.createElement('div'); v.className = 'omx-veil';
    v.innerHTML = '<div class="omx-sheet" role="dialog" aria-modal="true" aria-labelledby="omxH">' +
      '<button type="button" class="omx-x" aria-label="Close">\u00d7</button>' +
      '<div class="omx-k">' + TYPE[it.type] + ' \u00b7 ' + esc(it.title) + '</div>' +
      '<h3 class="omx-h" id="omxH"></h3>' +
      '<div class="omx-kinds">' + Object.keys(KIND).filter(function (k) { return !(it.type === 'ex' && k === 'comps'); }).map(function (k) { return '<button type="button" class="omx-kind" data-k="' + k + '">' + KIND[k].b + '</button>'; }).join('') + '</div>' +
      '<p class="omx-what"></p>' +
      '<form class="omx-f"><div class="omx-times"><div class="omx-cal"></div><p class="omx-hint" aria-live="polite"></p></div>' +
      '<button type="button" class="omx-addnote">+ Add a note for ' + esc(agentFirst()) + ' (optional)</button>' +
      '<div class="omx-nw"><label for="omxN" class="omx-nl"></label><textarea id="omxN" name="note" maxlength="1000"></textarea></div>' +
      '<button type="submit" class="omx-go">Send to ' + esc(agentFirst()) + ' \u2192</button><p class="omx-msg" role="status"></p></form></div>';
    document.body.appendChild(v);
    var sheet = v.querySelector('.omx-sheet'), f = v.querySelector('form'), msg = v.querySelector('.omx-msg'), go = v.querySelector('.omx-go');
    var picker = null, noteOpen = false;
    function goLabel() { return kind === 'tour' ? 'Send both times to ' + agentFirst() + ' \u2192' : 'Send to ' + agentFirst() + ' \u2192'; }
    function setKind(k) {
      kind = k;
      v.querySelectorAll('.omx-kind').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === k); });
      v.querySelector('.omx-h').textContent = k === 'question' ? 'Ask ' + agentFirst() + ' a question' : KIND[k].h;
      v.querySelector('.omx-what').textContent = KIND[k].w(it);
      v.querySelector('.omx-times').style.display = k === 'tour' ? '' : 'none';
      if (k === 'tour' && !picker) picker = tourPicker(v.querySelector('.omx-cal'), v.querySelector('.omx-times .omx-hint'));
      sheet.classList.toggle('wide', k === 'tour');
      /* the calendar is the tour form; the note waits behind a link so the sheet stays one screen */
      var hideNote = k === 'tour' && !noteOpen && !f.note.value;
      v.querySelector('.omx-nw').style.display = hideNote ? 'none' : '';
      v.querySelector('.omx-addnote').style.display = hideNote ? '' : 'none';
      v.querySelector('.omx-nl').textContent = k === 'question' ? 'Your question' : 'Anything ' + agentFirst() + ' should know? (optional)';
      go.textContent = goLabel();
      msg.textContent = ''; msg.className = 'omx-msg';
    }
    function close() { v.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    v.addEventListener('click', function (e) { if (e.target === v || e.target.closest('.omx-x')) close(); var kb = e.target.closest('.omx-kind'); if (kb) setKind(kb.getAttribute('data-k'));
      if (e.target.closest('.omx-addnote')) { noteOpen = true; setKind(kind); f.note.focus(); } });
    setKind(kind);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = f.note.value.trim(), body = { kind: kind, ref: it.ref, note: note, times: '', domain: DOMAIN }, chosen = null;
      if (kind === 'question' && !note) { msg.className = 'omx-msg err'; msg.textContent = 'Write your question first.'; return; }
      if (kind === 'tour') {
        var bad = picker ? picker.check() : 'Pick two times on the calendar.';
        if (bad) { msg.className = 'omx-msg err'; msg.textContent = bad; return; }
        body.slots = picker.iso(); body.times = picker.text(); chosen = picker.labels();
      }
      go.disabled = true; go.textContent = 'Sending\u2026'; msg.textContent = ''; msg.className = 'omx-msg';
      whenCM(function (CM) {
        CM.client.functions.invoke('offmarket-request', { body: body })
          .then(function (r) {
            if (r.error) {
              var ctx = r.error.context;
              return (ctx && ctx.json ? ctx.json().catch(function () { return null; }) : Promise.resolve(null)).then(function (j) {
                throw new Error((j && j.error) || r.error.message || 'The request did not go through.');
              });
            }
            var d = r.data || {};
            if (!d.ok) throw new Error(d.error || 'The request did not go through.');
            track('offmarket:request-' + kind, { ref_type: it.type });
            sheet.innerHTML = '<button type="button" class="omx-x" aria-label="Close">\u00d7</button>' +
              '<div class="omx-done"><div class="omx-k">Sent</div><h3 class="omx-h">' + esc(d.agent || agentFirst()) + ' has your request.</h3>' +
              (chosen ? '<p><b>Your times</b><br>1st choice: ' + esc(chosen[0]) + '<br>2nd choice: ' + esc(chosen[1]) + ' <span style="color:#6b7180">(Pacific)</span></p>' : '') +
              '<p>' + esc(DONE[kind](it)) + '</p>' +
              (d.confirmed ? '<p>A confirmation is on its way to your inbox. Reply to it any time to reach ' + esc(d.agent || agentFirst()) + '.</p>' : '') +
              (it.building ? '<p><a href="/building/' + encodeURIComponent(it.building) + '#dossier" style="color:#C2410C;font-weight:600">While you wait: every unit in ' + esc(it.bname || 'the building') + ', and an offer on any of them \u2192</a></p>' : '') +
              '<button type="button" class="omx-go" data-close>Done</button></div>';
            sheet.querySelector('[data-close]').addEventListener('click', close);
          })
          .catch(function (err) {
            go.disabled = false; go.textContent = goLabel();
            msg.className = 'omx-msg err'; msg.textContent = (err && err.message) || 'The request did not go through. Try again.';
            if (window.console) console.warn('[cm-offmarket] request failed', err);
          });
      });
    });
    setTimeout(function () { if (kind !== 'tour' && window.innerWidth >= 640) f.note.focus(); }, 30);
  }

  /* --------------------------------- auth ------------------------------------ */
  function signup(token) {
    try {
      if (token) {
        var u = new URL(location.href); u.searchParams.set('cs', token);
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      }
    } catch (e) {}
    track('offmarket:signup', token ? { cs: true } : {});
    window.dispatchEvent(new CustomEvent('openAuthModal', { detail: { mode: 'signup' } }));
  }
  function load(session) {
    var uid = session && session.user && session.user.id;
    if (!uid) { if (S.uid) { S.uid = null; S.member = null; publish(); } return; }
    if (uid === S.uid && (S.member || S.pending)) return;
    S.uid = uid;
    S.pending = new Promise(function (res) {
      whenCM(function (CM) {
        CM.client.rpc('offmarket_member_payload', { p_market_domain: DOMAIN }).then(function (r) {
          if (r.error) { console.warn('[cm-offmarket] member payload', r.error.message); res(null); return; }
          res(r.data && r.data.ok ? r.data : null);
        }, function (e) { console.warn('[cm-offmarket] member payload', e); res(null); });
      });
    }).then(function (d) { S.pending = null; S.member = d; publish(); return d; });
  }
  function publish() {
    try { window.dispatchEvent(new CustomEvent('om-member', { detail: S.member })); } catch (e) {}
    mountAll();
    fillPrices();
  }
  /* Featured Exchange listings: the asking price comes from the city platform, for a member only
     (offmarket-featured checks the session). Filled into every [data-om-fprice="<token>"]. */
  function fillPrices() {
    if (!S.member || !document.querySelector('[data-om-fprice]')) return;
    var go = function (list) {
      (list || []).forEach(function (x) {
        if (x.price == null) return;
        document.querySelectorAll('[data-om-fprice="' + x.token + '"]').forEach(function (el) {
          el.hidden = false;
          el.innerHTML = el.getAttribute('data-om-fstyle') === 'card'
            ? '<div class="omx-plab">Asking</div><div class="omx-price">' + money(x.price) + '</div>' + (x.rent ? '<div class="omx-sub">Rent ' + money(Math.round(x.rent)) + '/mo, tenant in place</div>' : '')
            : '<b>' + money(x.price) + '</b>' + (x.rent ? ' <span class="omf-rent">\u00b7 rent ' + money(Math.round(x.rent)) + '/mo</span>' : '');
        });
      });
    };
    if (S.feat) { go(S.feat); return; }
    whenCM(function (CM) {
      CM.client.functions.invoke('offmarket-featured', { body: { domain: DOMAIN } }).then(function (r) {
        if (r.error || !r.data || !r.data.ok) { console.warn('[cm-offmarket] featured price', (r.error && r.error.message) || (r.data && r.data.error)); return; }
        S.feat = r.data.listings || []; go(S.feat);
      }, function (e) { console.warn('[cm-offmarket] featured price', e); });
    });
  }

  /* --------------------------------- mounts ---------------------------------- */
  function mountAll() {
    var m = S.member;
    /* Sign-up prompts go away for a member, member-only links appear (and the reverse on sign-out). */
    document.querySelectorAll('[data-om-anon]').forEach(function (el) { if (el.closest('[data-om-account]')) return; el.hidden = !!m; el.style.display = m ? 'none' : ''; });
    document.querySelectorAll('[data-om-mem]').forEach(function (el) { el.hidden = !m; el.style.display = m ? '' : 'none'; });
    document.querySelectorAll('[data-om-grid]').forEach(function (box) {
      if (!m) return;
      /* the newest twelve coming soon here; the rest are on the map and in the member's list */
      var csAll = m.coming_soon || [], t = new URLSearchParams(location.search).get('cs');
      var csShow = csAll.slice(0, 12);
      if (t && !csShow.some(function (x) { return x.t === t; })) { var hit = csAll.filter(function (x) { return x.t === t; })[0]; if (hit) csShow.unshift(hit); }
      var items = csShow.map(function (x) { return norm('cs', x); }).concat((m.mmm || []).map(function (x) { return norm('mmm', x); }));
      if (!items.length) return;   // the honest empty state the page rendered stays
      render(box, items);
      box.classList.add('omx-grid'); box.classList.remove('om-grid');
      var more = document.querySelector('.om-more');
      if (more) more.innerHTML = csAll.length > csShow.length ? '<a href="/account/off-market/#coming-soon">All ' + csAll.length + ' coming soon in your off-market list &rarr;</a>' : '';
      focusDeepLink();
    });
    document.querySelectorAll('[data-om-bcs]').forEach(mountBuilding);
    document.querySelectorAll('[data-om-account]').forEach(mountAccount);
  }

  /* A building page's off-market section (Tim, 17 Oct 2026): this building's coming soon, its Investor
     Exchange listings and owners' private numbers, as the member's cards; or, with none, the member's
     "nothing here today" panel in place of the visitor's call to action. */
  function mountBuilding(sec) {
    var m = S.member; if (!m) return;
    var slug = sec.getAttribute('data-om-bcs');
    var box = sec.querySelector('[data-om-bcs-grid]'), none = sec.querySelector('[data-om-bnone]');
    var cs = (m.coming_soon || []).filter(function (x) { return x.building === slug; }).map(function (x) { return norm('cs', x); });
    var mm = (m.mmm || []).filter(function (x) { return x.building === slug; }).map(function (x) { return norm('mmm', x); });
    function draw(ex) {
      var items = cs.concat(ex || [], mm);
      if (!box) return;
      if (!items.length) {
        if (ex === null) return;                    // wait for the Exchange before saying "nothing"
        box.hidden = true; box.style.display = 'none';
        if (none) { none.hidden = false; none.style.display = ''; }
        return;
      }
      if (none) { none.hidden = true; none.style.display = 'none'; }
      box.hidden = false; box.style.display = '';
      render(box, items, { upsell: false, buildingLink: false });
      box.classList.add('omx-grid'); box.classList.remove('obm-grid');
      fillPrices(); focusDeepLink();
    }
    draw(null);
    exchangeFor(slug).then(draw, function () { draw([]); });
  }
  /* The Exchange listings in one building, for a member: the public teaser, with the featured listing's
     street and page where it has one (exchange_featured_public). The asking price is filled by fillPrices. */
  function exchangeFor(slug) {
    if (!A_URL || !A_KEY || !A_MKT) return Promise.resolve([]);
    function post(fn) {
      return fetch(A_URL + '/rest/v1/rpc/' + fn, { method: 'POST',
        headers: { apikey: A_KEY, Authorization: 'Bearer ' + A_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_market_id: A_MKT }) })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    S.ex = S.ex || post('exchange_public_teaser');
    S.exf = S.exf || post('exchange_featured_public');
    return Promise.all([S.ex, S.exf]).then(function (r) {
      var f = {}; (Array.isArray(r[1]) ? r[1] : []).forEach(function (x) { if (x && x.token) f[x.token] = x; });
      return ((r[0] && r[0].listings) || []).filter(function (x) { return x.building && x.building.slug === slug; }).map(function (x) {
        var it = norm('ex', x), fx = f[x.token];
        if (fx) { it.title = fx.street || fx.address || it.title; if (fx.url) it.exUrl = fx.url; }
        return it;
      });
    });
  }

  function mountAccount(root) {
    css();
    var anon = root.querySelector('[data-om-anon]'), body = root.querySelector('[data-om-body]'), wait = root.querySelector('[data-om-wait]');
    if (wait) wait.hidden = true;
    if (!S.member) {
      if (S.uid && !S.pending) { if (anon) anon.hidden = true; if (body) body.innerHTML = '<div class="omx-empty">Your off-market list didn\u2019t load. Refresh the page to try again.</div>'; return; }
      if (anon) anon.hidden = !!S.uid; if (body) body.innerHTML = ''; if (wait) wait.hidden = !S.uid; return;
    }
    if (anon) anon.hidden = true;
    var m = S.member, a = esc(agentFirst());
    var cs = (m.coming_soon || []).map(function (x) { return norm('cs', x); });
    var mm = (m.mmm || []).map(function (x) { return norm('mmm', x); });
    function sec(id, title, n, lede, items, empty) {
      return '<div class="omx-sec" id="' + id + '"><h2>' + title + '<span>' + n + '</span></h2><p class="omx-lede">' + lede + '</p>' +
        (items.length ? '<div class="omx-grid" data-om-list="' + id + '"></div>' : '<div class="omx-empty">' + empty + '</div>') + '</div>';
    }
    body.innerHTML =
      sec('coming-soon', 'Coming soon', cs.length, 'San Francisco condos entered as coming soon and not yet on the listing sites. Ask for the disclosures, a Comp Report or a tour, and ' + a + ' takes it from there.', cs,
        'No coming-soon condos right now. New ones appear here as soon as they are entered; the list is checked twice a day.') +
      sec('make-me-move', 'Owners\u2019 private numbers', mm.length, 'Owners who named the price that would make them move, with no listing. An offer at or near the number goes to the owner through ' + a + '.', mm,
        'No owner has a private number open right now.') +
      '<div class="omx-sec" id="investor-exchange"><h2>Investor Exchange<span data-om-exn></span></h2><p class="omx-lede">Investor-owned units offered privately, between members.</p><div data-om-ex><div class="omx-empty">Loading the Exchange\u2026</div></div></div>';
    var g1 = body.querySelector('[data-om-list="coming-soon"]'); if (g1) render(g1, cs);
    var g2 = body.querySelector('[data-om-list="make-me-move"]'); if (g2) render(g2, mm);
    loadExchange(body.querySelector('[data-om-ex]'), body.querySelector('[data-om-exn]'));
    focusDeepLink();
  }
  function loadExchange(box, n) {
    if (!box) return;
    if (!A_URL || !A_KEY || !A_MKT) { box.innerHTML = '<div class="omx-empty">The Investor Exchange isn\u2019t open in this market.</div>'; return; }
    (S.ex || (S.ex = fetch(A_URL + '/rest/v1/rpc/exchange_public_teaser', { method: 'POST',
      headers: { apikey: A_KEY, Authorization: 'Bearer ' + A_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_market_id: A_MKT }) })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })))
      .then(function (d) {
        if (!d) { box.innerHTML = '<div class="omx-empty">The Exchange didn\u2019t load. Refresh the page to try again.</div>'; return; }
        var items = (d.listings || []).map(function (x) { return norm('ex', x); });
        if (n) n.textContent = items.length;
        if (!items.length) { box.innerHTML = '<div class="omx-empty">Nothing on the Exchange right now.</div>'; return; }
        box.className = 'omx-grid'; render(box, items); fillPrices();
      });
  }

  window.OM = { signup: signup, act: act, member: function () { return S.member; }, norm: norm, card: cardHtml, css: css };

  /* Signed-out buttons anywhere on the page: data-om-signup="<token or empty>". */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-om-signup]'); if (!b) return;
    e.preventDefault();
    if (S.member) { var t = b.getAttribute('data-om-signup'); var el = t && document.getElementById('cs-' + t); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    signup(b.getAttribute('data-om-signup') || null);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-om-act]'); if (!b) return;
    var host = b.closest('[data-om-item]'); if (!host) return;
    var it; try { it = JSON.parse(host.getAttribute('data-om-item')); } catch (x) { return; }
    e.preventDefault(); act(it, b.getAttribute('data-om-act'));
  });
  window.addEventListener('cm-auth-change', function (e) { load(e.detail && e.detail.session); });
  whenCM(function (CM) {
    CM.getSession().then(function (s) {
      load(s);
      if (!s) document.querySelectorAll('[data-om-account]').forEach(mountAccount);
    }, function () { document.querySelectorAll('[data-om-account]').forEach(mountAccount); });
  });
})();
