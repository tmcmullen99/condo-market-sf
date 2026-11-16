/* =============================================================================
 * cm-vip-join.js - membership of The San Francisco List, by email (Tim, 16 Nov 2026)
 * -----------------------------------------------------------------------------
 * "Make the Off Market section require an email to see the VIP list", and "Design a user onboarding flow for VIP List
 * buyers AFTER they enter their email": bedrooms and price, neighborhoods, buildings or units to watch, and whether to
 * be emailed each new home that fits.
 *
 * The email is the whole sign-up. It opens a free account on the spot (the condo site confirms sign-ups itself) with a
 * password nobody knows; the member gets back in on another device with "Email me a sign-in link". The new session
 * unlocks the List on the page (cm-offmarket.js hears cm-auth-change), the Terms are recorded, and om_vip_join makes
 * them a member of the market's List with alerts on. An email that already has an account is sent a sign-in link.
 * The onboarding saves through om_vip_save: one search for what they want (beds, neighborhoods, price) and one for the
 * buildings and units they are watching. A member reopens it from "Your searches & alerts".
 *
 *   window.OMJOIN.open({token})   the email step (cm-offmarket.js sends every signed-out "open" here)
 *   window.OMJOIN.prefs()         a member's searches and alerts
 * ========================================================================== */
(function () {
  'use strict';
  if (window.OMJOIN) return;
  var host = document.querySelector('[data-vip-name]');
  var NAME = (host && host.getAttribute('data-vip-name')) || 'The List';
  var REGION = NAME.replace(/^The\s+/, '').replace(/\s+List$/, '') || 'the city';
  var VD = {}; try { VD = JSON.parse((document.getElementById('vipData') || {}).textContent || '{}'); } catch (e) { VD = {}; }
  var OD = {}; try { OD = JSON.parse((document.getElementById('omData') || {}).textContent || '{}'); } catch (e) { OD = {}; }
  var DOMAIN = VD.domain || location.hostname.replace(/^www\./, '');
  var BLD = (OD.b || []).map(function (b) { return { slug: b[0], name: b[1], units: b[2], hood: b[5] || '' }; });
  var BY = {}; BLD.forEach(function (b) { BY[b.slug] = b; });
  var PRICES = [500000, 750000, 1000000, 1250000, 1500000, 2000000, 2500000, 3000000, 4000000, 5000000];
  var BEDS = [[0, 'Studio'], [1, '1 bed'], [2, '2 beds'], [3, '3+ beds']];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function usd(n) { return n >= 1e6 ? '$' + (Math.round(n / 1e4) / 100).toString().replace(/\.?0+$/, '') + 'M' : '$' + Math.round(n / 1e3) + 'K'; }
  function track(ev, x) { try { if (window.cmTrack) window.cmTrack(ev, Object.assign({ via: 'vip_list' }, x || {})); } catch (e) {} }
  function whenCM(cb) {
    if (window.CM) { cb(window.CM); return; }
    window.addEventListener('cm-ready', function on() { window.removeEventListener('cm-ready', on); if (window.CM) cb(window.CM); });
  }
  function pw() {
    var a = new Uint8Array(18); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('') + 'Aa1!';
  }
  function unitKey(u) { return String(u || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }

  /* ------------------------------------------------------------------ styles */
  function css() {
    if (document.getElementById('vj-css')) return;
    var s = document.createElement('style'); s.id = 'vj-css';
    s.textContent =
      '.vj{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;font-family:"DM Sans",system-ui,sans-serif}.vj[hidden]{display:none}' +
      'html.vj-on{overflow:hidden}' +
      '.vj-bg{position:absolute;inset:0;background:rgba(5,6,9,.8);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}' +
      '.vj-card{position:relative;width:100%;max-width:500px;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;overscroll-behavior:contain;color:#f3ede0;border:1px solid rgba(217,154,78,.42);border-radius:6px;padding:42px 32px 28px;' +
        'background:radial-gradient(420px 220px at 50% 0%,rgba(217,154,78,.16),transparent 70%),#0b0d12;box-shadow:0 0 0 5px #0b0d12,0 0 0 6px rgba(217,154,78,.18),0 40px 120px rgba(0,0,0,.6)}' +
      '.vj-k{position:absolute;width:14px;height:14px;border:0 solid #d99a4e;opacity:.9}.vj-k.a{top:9px;left:9px;border-width:1px 0 0 1px}.vj-k.b{top:9px;right:9px;border-width:1px 1px 0 0}.vj-k.c{bottom:9px;left:9px;border-width:0 0 1px 1px}.vj-k.d{bottom:9px;right:9px;border-width:0 1px 1px 0}' +
      '.vj-x{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(217,154,78,.3);background:transparent;color:#f3ede0;font-size:20px;line-height:30px;padding:0;cursor:pointer;z-index:2}.vj-x:hover{border-color:#d99a4e}' +
      '.vj-ey{font-family:"JetBrains Mono",monospace;font-size:.6rem;letter-spacing:.28em;text-transform:uppercase;color:#d99a4e}' +
      '.vj-h{font-family:"Playfair Display",Georgia,serif;font-weight:500;font-size:1.95rem;line-height:1.12;margin:12px 0 0;color:#f3ede0}.vj-h em{color:#e8c58a}' +
      '.vj-p{color:#c6cbd6;line-height:1.6;font-size:.96rem;margin:12px 0 0}' +
      '.vj-l{display:block;margin-top:16px}.vj-l>span{font-family:"JetBrains Mono",monospace;font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:#93a3b8}.vj-l>span i{font-style:normal;opacity:.7;text-transform:none;letter-spacing:0}' +
      '.vj input[type=email],.vj input[type=text],.vj select{display:block;width:100%;box-sizing:border-box;margin-top:6px;background:#12151d;border:1px solid rgba(217,154,78,.3);border-radius:4px;color:#f3ede0;font:16px "DM Sans",system-ui,sans-serif;padding:12px 13px;-webkit-appearance:none;appearance:none}' +
      '.vj select{background-image:linear-gradient(45deg,transparent 50%,#d99a4e 50%),linear-gradient(135deg,#d99a4e 50%,transparent 50%);background-position:calc(100% - 18px) 52%,calc(100% - 13px) 52%;background-size:5px 5px;background-repeat:no-repeat;padding-right:32px}' +
      '.vj input:focus,.vj select:focus{outline:none;border-color:#d99a4e;box-shadow:0 0 0 3px rgba(217,154,78,.18)}' +
      '.vj-tos{display:flex;gap:10px;align-items:flex-start;margin-top:16px;font-size:.8rem;color:#93a3b8;line-height:1.5;cursor:pointer}.vj-tos input{margin-top:2px;width:16px;height:16px;flex:0 0 16px;accent-color:#d99a4e}.vj-tos a{color:#e8c58a}' +
      '.vj-go{display:block;width:100%;margin-top:20px;min-height:50px;border:0;border-radius:999px;background:linear-gradient(180deg,#e2a85c,#b06f24);color:#fff;font:600 1rem "DM Sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(176,111,36,.35),inset 0 1px 0 rgba(255,255,255,.25)}' +
      '.vj-go:disabled{opacity:.6;cursor:default}' +
      '.vj-msg{margin-top:12px;font-size:.88rem;line-height:1.5;padding:10px 12px;border-radius:4px}.vj-msg[hidden]{display:none}.vj-msg.err{background:rgba(185,60,40,.16);color:#f5c2b5}.vj-msg.ok{background:rgba(217,154,78,.12);color:#f6e7c8}' +
      '.vj-alt{margin:16px 0 0;text-align:center;font-size:.85rem;color:#93a3b8}.vj-alt a,.vj-alt button{color:#e8c58a;background:none;border:0;font:inherit;cursor:pointer;padding:0;text-decoration:underline}' +
      '.vj-bar{display:flex;gap:6px;margin:0 0 18px}.vj-bar i{flex:1;height:2px;background:rgba(217,154,78,.18)}.vj-bar i.on{background:#d99a4e}' +
      '.vj-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
      '.vj-chip{border:1px solid rgba(217,154,78,.35);background:transparent;color:#f3ede0;border-radius:999px;padding:9px 14px;font:500 .9rem "DM Sans",system-ui,sans-serif;cursor:pointer}' +
      '.vj-chip:hover{border-color:#d99a4e}.vj-chip[aria-pressed="true"]{background:#d99a4e;border-color:#d99a4e;color:#0b0d12}' +
      '.vj-hoods{max-height:min(300px,42vh);overflow:auto;padding:2px 2px 6px;margin-top:6px}' +
      '.vj-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
      '.vj-acts{display:flex;gap:6px;align-items:center;margin-top:22px}.vj-acts .vj-go{margin-top:0;flex:1}' +
      '.vj-txt{background:none;border:0;color:#93a3b8;font:500 .9rem "DM Sans",system-ui,sans-serif;cursor:pointer;padding:12px 10px}.vj-txt:hover{color:#f3ede0}' +
      '.vj-pick{display:grid;grid-template-columns:minmax(0,1fr) 92px auto;gap:8px;margin-top:10px;align-items:end}.vj-pick input{margin-top:0!important}' +
      '.vj-add{min-height:46px;border:1px solid #d99a4e;background:transparent;color:#e8c58a;border-radius:4px;font:600 .9rem "DM Sans",system-ui,sans-serif;padding:0 14px;cursor:pointer}' +
      '.vj-sel{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.vj-sel span{display:inline-flex;align-items:center;gap:8px;background:rgba(217,154,78,.14);border:1px solid rgba(217,154,78,.4);border-radius:999px;padding:7px 8px 7px 13px;font-size:.88rem}' +
      '.vj-sel button{width:22px;height:22px;border-radius:50%;border:0;background:rgba(243,237,224,.12);color:#f3ede0;cursor:pointer;line-height:22px;padding:0}' +
      '.vj-hint{margin-top:8px;font-size:.8rem;color:#93a3b8;line-height:1.5}.vj-hint.err{color:#f5c2b5}' +
      '.vj-opt{display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(217,154,78,.28);border-radius:6px;padding:14px 15px;margin-top:10px;cursor:pointer}.vj-opt:hover{border-color:#d99a4e}' +
      '.vj-opt input{margin-top:3px;accent-color:#d99a4e;width:16px;height:16px;flex:0 0 16px}.vj-opt b{display:block;font-weight:600;color:#f3ede0}.vj-opt span{display:block;font-size:.84rem;color:#93a3b8;margin-top:3px;line-height:1.45}' +
      '.vj-sum{margin-top:18px;padding:14px 16px;border-top:1px solid rgba(217,154,78,.2);font-size:.9rem;color:#c6cbd6;line-height:1.55}.vj-sum b{color:#e8c58a;font-family:"Playfair Display",Georgia,serif;font-size:1.15rem;font-weight:500}' +
      '@media(max-width:540px){.vj{align-items:flex-end;padding:0}.vj-card{max-width:none;border-radius:14px 14px 0 0;max-height:94vh;max-height:94dvh;padding:38px 20px calc(22px + env(safe-area-inset-bottom,0px))}.vj-h{font-size:1.65rem}' +
        '.vj-pick{grid-template-columns:minmax(0,1fr) 80px}.vj-pick .vj-add{grid-column:1/-1}}';
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ modal */
  var el = null, body = null, lastFocus = null;
  function build() {
    if (el) return;
    css();
    el = document.createElement('aside'); el.className = 'vj'; el.hidden = true;
    el.innerHTML = '<div class="vj-bg"></div><div class="vj-card" role="dialog" aria-modal="true" aria-labelledby="vjH">' +
      '<span class="vj-k a"></span><span class="vj-k b"></span><span class="vj-k c"></span><span class="vj-k d"></span>' +
      '<button type="button" class="vj-x" aria-label="Close">×</button><div class="vj-body"></div></div>';
    document.body.appendChild(el);
    body = el.querySelector('.vj-body');
    el.querySelector('.vj-x').addEventListener('click', close);
    /* no close on a stray click outside: a half-typed email is not thrown away (as in cm-auth.js) */
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && el && !el.hidden) close(); });
  }
  function show() {
    build(); lastFocus = document.activeElement;
    el.hidden = false; document.documentElement.classList.add('vj-on');
    el.querySelector('.vj-card').scrollTop = 0;
  }
  function close() {
    if (!el || el.hidden) return;
    el.hidden = true; document.documentElement.classList.remove('vj-on');
    if (S.joinedNow && !S.saved) { S.saved = true; save(true); }   // closing the onboarding keeps what they chose
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }
  function focusFirst() { setTimeout(function () { var f = body.querySelector('input:not([type=checkbox]):not([type=radio]),select,button.vj-chip,.vj-go'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {} }, 40); }

  /* ------------------------------------------------------------------ state */
  var S = { token: null, step: 'email', beds: [], hoods: [], pmin: 0, pmax: 0, watch: [], alerts: 'each', critId: null, watchId: null, others: [], joinedNow: false, saved: false, state: null };
  function reset() { S.beds = []; S.hoods = []; S.pmin = 0; S.pmax = 0; S.watch = []; S.alerts = 'each'; S.critId = null; S.watchId = null; S.others = []; S.saved = false; }

  /* ------------------------------------------------------------------ step 0: the email */
  function stepEmail() {
    S.step = 'email';
    var known = ''; try { known = (localStorage.getItem('cm_known_email') || '').trim(); } catch (e) {}
    body.innerHTML = '<div class="vj-ey">' + esc(NAME) + '</div>' +
      '<h2 class="vj-h" id="vjH">Request your <em>membership.</em></h2>' +
      '<p class="vj-p">Enter your email and the List opens on this page: every home on it, with the address, the price and the photos. Complimentary and private.</p>' +
      '<form class="vj-f" novalidate>' +
      '<label class="vj-l"><span>Email</span><input type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" required value="' + esc(known) + '"></label>' +
      '<label class="vj-l"><span>First name <i>(optional)</i></span><input type="text" name="name" autocomplete="given-name"></label>' +
      '<label class="vj-tos"><input type="checkbox" name="tos"><span>I agree to the <a href="#" data-vj-tos>Terms of Service</a> and understand Condo Market is a marketing platform, not a brokerage.</span></label>' +
      '<button type="submit" class="vj-go">Open the List</button><p class="vj-msg" role="status" hidden></p></form>' +
      '<p class="vj-alt">Already a member? <button type="button" data-vj-signin>Sign in</button></p>';
    var f = body.querySelector('form');
    f.addEventListener('submit', function (ev) { ev.preventDefault(); join(f); });
    body.querySelector('[data-vj-tos]').addEventListener('click', function (ev) {
      ev.preventDefault();
      import('/assets/cm-tos-modal.js').then(function (m) { m.openTosModal({ mode: 'info' }); }).catch(function () {});
    });
    body.querySelector('[data-vj-signin]').addEventListener('click', signin);
    focusFirst();
  }
  function say(kind, text) {
    var m = body.querySelector('.vj-msg'); if (!m) return;
    if (!text) { m.hidden = true; m.textContent = ''; return; }
    m.hidden = false; m.className = 'vj-msg ' + (kind === 'err' ? 'err' : 'ok'); m.textContent = text;
  }
  function join(f) {
    var email = String(f.email.value || '').trim().toLowerCase(), name = String(f.name.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say('err', 'Enter your email address.'); f.email.focus(); return; }
    if (!f.tos.checked) { say('err', 'Please accept the Terms of Service to continue.'); return; }
    var go = f.querySelector('.vj-go'); go.disabled = true; go.textContent = 'Opening the List…'; say(null, '');
    track('signup_submitted', { stage: 'form_submit' });
    try { localStorage.setItem('cm_known_email', email); } catch (e) {}
    function fail(err) {
      go.disabled = false; go.textContent = 'Open the List';
      var msg = (err && err.message) || '';
      track('signup_failed', { stage: 'error', reason: msg.slice(0, 200) || 'unknown' });
      say('err', /rate|seconds|too many/i.test(msg) ? 'Too many tries from here just now. Wait a minute and try again.' : (msg || 'That didn’t go through. Try again.'));
    }
    whenCM(function (CM) {
      var pass = pw();
      CM.signUp({ email: email, password: pass, fullName: name, phone: '' }).then(function (r) {
        var d = (r && r.data) || {}, err = r && r.error;
        if (err) { if (/already|registered|exists/i.test(err.message || '')) return existing(CM, email, go); return fail(err); }
        if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) return existing(CM, email, go);
        if (d.session) return joined(CM);
        /* no session: the project wants a confirmed email. Try the password once; else say where the link went. */
        return CM.signIn({ email: email, password: pass }).then(function (s) {
          if (s && s.data && s.data.session) return joined(CM);
          go.disabled = false; go.textContent = 'Open the List';
          say('ok', 'Check ' + email + ' for a link to confirm it’s you. The List opens when you do.');
        }, fail);
      }, fail);
    });
  }
  function existing(CM, email, go) {
    track('signup_existing_user', { stage: 'already_registered' });
    CM.sendMagicLink({ email: email }).then(function (r) {
      go.disabled = false; go.textContent = 'Open the List';
      if (r && r.error) { say('err', 'This email is already a member. Use Sign in below to get back in.'); return; }
      say('ok', 'You’re already a member. We sent a sign-in link to ' + email + '. Open it on this device and the List opens here.');
    }, function () { go.disabled = false; go.textContent = 'Open the List'; say('err', 'This email is already a member. Use Sign in below to get back in.'); });
  }
  function joined(CM) {
    S.joinedNow = true;
    track('signup_succeeded', { type: 'signup', confirmed: true, stage: 'account_created' });
    import('/assets/cm-tos-modal.js').then(function (m) { return CM.acceptTos(m.TOS_VERSION); }).catch(function (e) { console.warn('[vip] terms', e); });
    CM.client.rpc('om_vip_join', { p_domain: DOMAIN, p_source: 'vip_list' }).then(function (r) { if (r && r.data && r.data.ok) S.state = r.data; }, function () {});
    try { window.dispatchEvent(new CustomEvent('cm-auth-changed', { detail: { signedIn: true } })); } catch (e) {}
    reset(); stepBeds(true);
  }
  function signin() {
    close();
    track('login_started', { stage: 'vip_signin' });
    try { window.dispatchEvent(new CustomEvent('openAuthModal', { detail: { mode: 'login' } })); } catch (e) {}
  }

  /* ------------------------------------------------------------------ the onboarding */
  var STEPS = ['beds', 'hoods', 'bldg', 'alerts'];
  function bar(k) { var i = STEPS.indexOf(k); return '<div class="vj-bar" aria-hidden="true">' + STEPS.map(function (s, j) { return '<i class="' + (j <= i ? 'on' : '') + '"></i>'; }).join('') + '</div>'; }
  function acts(next, back, skip) {
    return '<div class="vj-acts">' + (back ? '<button type="button" class="vj-txt" data-vj-back>← Back</button>' : '') +
      (skip ? '<button type="button" class="vj-txt" data-vj-skip>Skip</button>' : '') + '<button type="button" class="vj-go" data-vj-next>' + next + '</button></div>';
  }
  function wire(next, back) {
    var n = body.querySelector('[data-vj-next]'), b = body.querySelector('[data-vj-back]'), s = body.querySelector('[data-vj-skip]');
    if (n) n.addEventListener('click', next);
    if (s) s.addEventListener('click', next);
    if (b && back) b.addEventListener('click', back);
  }
  function chips(list, sel, attr) {
    return list.map(function (c) { var v = c[0], on = sel.indexOf(v) >= 0;
      return '<button type="button" class="vj-chip" ' + attr + '="' + esc(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(c[1]) + '</button>'; }).join('');
  }
  function toggles(attr, arr, num) {
    body.querySelectorAll('[' + attr + ']').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute(attr); if (num) v = Number(v);
        var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v);
        b.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
      });
    });
  }
  function priceSel(name, val, none) {
    return '<select name="' + name + '" aria-label="' + (name === 'pmin' ? 'Lowest price' : 'Highest price') + '"><option value="0">' + none + '</option>' +
      PRICES.map(function (p) { return '<option value="' + p + '"' + (val === p ? ' selected' : '') + '>' + usd(p) + '</option>'; }).join('') + '</select>';
  }

  function stepBeds(first) {
    S.step = 'beds';
    body.innerHTML = bar('beds') +
      '<div class="vj-ey">' + (first ? 'Welcome to ' + esc(NAME) : esc(NAME) + ' · your search') + '</div>' +
      '<h2 class="vj-h" id="vjH">' + (first ? 'You’re in. <em>What are you looking for?</em>' : 'What are you <em>looking for?</em>') + '</h2>' +
      '<p class="vj-p">Four quick questions, and we’ll email you each new home on the List that fits. Skip any of them.</p>' +
      '<div class="vj-l"><span>Bedrooms</span><div class="vj-chips">' + chips(BEDS, S.beds, 'data-vj-bd') + '</div></div>' +
      '<div class="vj-l"><span>Price</span><div class="vj-two">' + priceSel('pmin', S.pmin, 'No minimum') + priceSel('pmax', S.pmax, 'No maximum') + '</div></div>' +
      '<p class="vj-hint" data-vj-hint></p>' + acts('Next', false, true);
    toggles('data-vj-bd', S.beds, true);
    var mn = body.querySelector('[name=pmin]'), mx = body.querySelector('[name=pmax]');
    wire(function () {
      var a = Number(mn.value) || 0, b = Number(mx.value) || 0;
      if (a && b && a > b) { var h = body.querySelector('[data-vj-hint]'); h.className = 'vj-hint err'; h.textContent = 'The lowest price is above the highest.'; return; }
      S.pmin = a; S.pmax = b; stepHoods();
    });
    focusFirst();
  }
  function stepHoods() {
    S.step = 'hoods';
    var hoods = (VD.hoods || []).slice();
    S.hoods.forEach(function (h) { if (hoods.indexOf(h) < 0) hoods.push(h); });
    body.innerHTML = bar('hoods') + '<div class="vj-ey">' + esc(NAME) + ' · 2 of 4</div>' +
      '<h2 class="vj-h" id="vjH">Where in <em>' + esc(REGION) + '?</em></h2>' +
      '<p class="vj-p">Pick as many neighborhoods as you like. None picked means anywhere.</p>' +
      '<div class="vj-hoods"><div class="vj-chips">' + chips(hoods.map(function (h) { return [h, h]; }), S.hoods, 'data-vj-hd') + '</div></div>' +
      acts('Next', true, true);
    toggles('data-vj-hd', S.hoods, false);
    wire(stepBldg, function () { stepBeds(false); });
    focusFirst();
  }
  function stepBldg() {
    S.step = 'bldg';
    body.innerHTML = bar('bldg') + '<div class="vj-ey">' + esc(NAME) + ' · 3 of 4</div>' +
      '<h2 class="vj-h" id="vjH">Any buildings <em>in mind?</em></h2>' +
      '<p class="vj-p">Name a building, or one unit in it. When a home there joins the List, you hear first, whatever else you picked.</p>' +
      '<div class="vj-pick"><label class="vj-l" style="margin:0"><span>Building</span><input type="text" data-vj-b list="vjBl" autocomplete="off" placeholder="e.g. The Infinity"></label>' +
      '<label class="vj-l" style="margin:0"><span>Unit <i>(optional)</i></span><input type="text" data-vj-u autocomplete="off" placeholder="#1204"></label>' +
      '<button type="button" class="vj-add" data-vj-add>Add</button></div>' +
      '<datalist id="vjBl">' + BLD.map(function (b) { return '<option value="' + esc(b.name) + '">'; }).join('') + '</datalist>' +
      '<p class="vj-hint" data-vj-hint></p><div class="vj-sel" data-vj-sel></div>' + acts('Next', true, true);
    var bi = body.querySelector('[data-vj-b]'), ui = body.querySelector('[data-vj-u]'), hint = body.querySelector('[data-vj-hint]');
    function draw() {
      body.querySelector('[data-vj-sel]').innerHTML = S.watch.map(function (w, i) {
        return '<span>' + esc((BY[w.slug] ? BY[w.slug].name : w.slug) + (w.unit ? ' #' + w.unit : '')) + '<button type="button" aria-label="Remove" data-vj-rm="' + i + '">×</button></span>'; }).join('');
      body.querySelectorAll('[data-vj-rm]').forEach(function (x) { x.addEventListener('click', function () { S.watch.splice(+x.getAttribute('data-vj-rm'), 1); draw(); }); });
    }
    function find(q) {
      q = String(q || '').trim().toLowerCase(); if (!q) return null;
      var hit = null;
      BLD.forEach(function (b) { if (!hit && b.name.toLowerCase() === q) hit = b; });
      BLD.forEach(function (b) { if (!hit && (b.name.toLowerCase().indexOf(q) >= 0 || b.slug.replace(/-/g, ' ').indexOf(q.replace(/[^a-z0-9 ]/g, '')) >= 0)) hit = b; });
      return hit;
    }
    function add() {
      var b = find(bi.value);
      if (!b) { hint.className = 'vj-hint err'; hint.textContent = bi.value.trim() ? 'That isn’t one of the buildings on file yet. Try its name or address.' : 'Type a building’s name first.'; return false; }
      var u = unitKey(ui.value).slice(0, 12);
      if (!S.watch.some(function (w) { return w.slug === b.slug && w.unit === u; })) {
        if (S.watch.length >= 20) { hint.className = 'vj-hint err'; hint.textContent = 'That’s twenty. Remove one to add another.'; return false; }
        S.watch.push({ slug: b.slug, unit: u });
      }
      bi.value = ''; ui.value = ''; hint.className = 'vj-hint'; hint.textContent = ''; draw(); bi.focus(); return true;
    }
    body.querySelector('[data-vj-add]').addEventListener('click', add);
    [bi, ui].forEach(function (x) { x.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); add(); } }); });
    draw();
    wire(function () { if (bi.value.trim() && !add()) return; stepAlerts(); }, stepHoods);
    focusFirst();
  }
  function stepAlerts() {
    S.step = 'alerts';
    body.innerHTML = bar('alerts') + '<div class="vj-ey">' + esc(NAME) + ' · 4 of 4</div>' +
      '<h2 class="vj-h" id="vjH">How should we <em>tell you?</em></h2>' +
      '<label class="vj-opt"><input type="radio" name="al" value="each"' + (S.alerts !== 'off' ? ' checked' : '') + '><div><b>Email me each new home that fits</b><span>Usually within hours of it joining the List. Stop any time, with one click.</span></div></label>' +
      '<label class="vj-opt"><input type="radio" name="al" value="off"' + (S.alerts === 'off' ? ' checked' : '') + '><div><b>No emails</b><span>I’ll check the List myself.</span></div></label>' +
      '<div class="vj-sum" data-vj-sum>' + summary() + '</div>' +
      '<p class="vj-msg" role="status" hidden></p>' + acts('Open the List', true, false);
    body.querySelectorAll('[name=al]').forEach(function (r) { r.addEventListener('change', function () { S.alerts = r.value; }); });
    wire(function () { save(false); }, stepBldg);
    focusFirst();
  }
  /* what they picked, in a sentence, and how many homes on the List fit it now */
  function searches() {
    var out = [];
    if (S.beds.length || S.hoods.length || S.pmin || S.pmax) out.push({ id: S.critId || undefined, name: 'My search', beds: S.beds.slice().sort(), hoods: S.hoods.slice(), price_min: S.pmin || null, price_max: S.pmax || null });
    var b = [], u = [];
    S.watch.forEach(function (w) { if (w.unit) u.push(w.slug + '|' + w.unit); else b.push(w.slug); });
    if (b.length || u.length) out.push({ id: S.watchId || undefined, name: 'Buildings I’m watching', buildings: b, units: u });
    return out.concat(S.others);
  }
  function fits(s, x) {
    var bd = x.bd == null || x.bd === '' ? null : Math.min(Number(x.bd), 3);
    if ((s.beds || []).length && (bd == null || s.beds.indexOf(bd) < 0)) return false;
    if ((s.hoods || []).length && s.hoods.indexOf(x.h) < 0) return false;
    if (s.price_min && !(Number(x.price) >= s.price_min)) return false;
    if (s.price_max && !(Number(x.price) <= s.price_max)) return false;
    if ((s.buildings || []).length || (s.units || []).length) {
      var key = x.building && x.unit ? x.building + '|' + unitKey(x.unit) : '';
      if ((s.buildings || []).indexOf(x.building) < 0 && (s.units || []).indexOf(key) < 0) return false;
    }
    return true;
  }
  function summary() {
    var bits = [];
    if (S.beds.length) bits.push(S.beds.slice().sort().map(function (b) { return b === 0 ? 'studios' : b === 3 ? '3+ beds' : b + ' bed' + (b > 1 ? 's' : ''); }).join(', '));
    if (S.hoods.length) bits.push('in ' + (S.hoods.length > 3 ? S.hoods.slice(0, 3).join(', ') + ' and ' + (S.hoods.length - 3) + ' more' : S.hoods.join(', ')));
    if (S.pmin && S.pmax) bits.push(usd(S.pmin) + ' to ' + usd(S.pmax)); else if (S.pmin) bits.push('from ' + usd(S.pmin)); else if (S.pmax) bits.push('up to ' + usd(S.pmax));
    var what = bits.length ? 'Homes ' + bits.join(' · ') : 'Every new home on the List';
    if (S.watch.length) what += (bits.length ? ', plus ' : ', and ') + 'anything in ' + (S.watch.length === 1 ? 'the building' : 'the ' + S.watch.length + ' buildings') + ' you named';
    var m = window.OM && window.OM.member && window.OM.member(), rows = (m && m.coming_soon) || null, line = '';
    if (rows) {
      var ss = searches(), n = rows.filter(function (x) { return !ss.length || ss.some(function (s) { return fits(s, x); }); }).length;
      line = '<br><b>' + n + '</b> ' + (n === 1 ? 'home on the List fits' : 'homes on the List fit') + ' right now.';
    }
    return esc(what) + '.' + line;
  }
  window.addEventListener('om-member', function () { var s = body && body.querySelector('[data-vj-sum]'); if (s) s.innerHTML = summary(); });

  function save(quiet) {
    var go = body && body.querySelector('[data-vj-next]');
    if (go && !quiet) { go.disabled = true; go.textContent = 'Saving…'; }
    whenCM(function (CM) {
      CM.client.rpc('om_vip_save', { p_domain: DOMAIN, p_alerts: S.alerts, p_searches: searches(), p_onboarded: true }).then(function (r) {
        S.saved = true;
        if (r && r.error) throw r.error;
        if (r && r.data && r.data.ok) S.state = r.data;
        track('vip_onboarded', { alerts: S.alerts, searches: searches().length });
        label();
        if (quiet) return;
        close();
        if (!new URLSearchParams(location.search).get('cs')) { var l = document.getElementById('list'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }).catch(function (e) {
        S.saved = false;
        if (quiet) return;
        if (go) { go.disabled = false; go.textContent = 'Open the List'; }
        say('err', (e && e.message) || 'Your choices didn’t save. Try again.');
      });
    });
  }

  /* ------------------------------------------------------------------ a member's searches and alerts */
  function load(cb) {
    whenCM(function (CM) {
      CM.client.rpc('om_vip_state', { p_domain: DOMAIN }).then(function (r) { S.state = r && r.data && r.data.ok ? r.data : null; cb(S.state); }, function () { cb(null); });
    });
  }
  function fromState(st) {
    reset();
    if (!st) return;
    S.alerts = st.member && st.member.alerts === 'off' ? 'off' : 'each';
    (st.searches || []).forEach(function (s) {
      var watchOnly = ((s.buildings || []).length || (s.units || []).length) && !(s.beds || []).length && !(s.hoods || []).length && !s.price_min && !s.price_max;
      var critOnly = !(s.buildings || []).length && !(s.units || []).length;
      if (critOnly && !S.critId) { S.critId = s.id; S.beds = (s.beds || []).slice(); S.hoods = (s.hoods || []).slice(); S.pmin = Number(s.price_min) || 0; S.pmax = Number(s.price_max) || 0; }
      else if (watchOnly && !S.watchId) {
        S.watchId = s.id;
        (s.buildings || []).forEach(function (b) { S.watch.push({ slug: b, unit: '' }); });
        (s.units || []).forEach(function (u) { var p = String(u).split('|'); S.watch.push({ slug: p[0], unit: p[1] || '' }); });
      } else S.others.push(s);
    });
  }
  function prefs() {
    S.joinedNow = false; show();
    body.innerHTML = '<div class="vj-ey">' + esc(NAME) + '</div><p class="vj-p">Loading your searches…</p>';
    load(function (st) {
      if (!st) { body.innerHTML = '<div class="vj-ey">' + esc(NAME) + '</div><h2 class="vj-h" id="vjH">Sign in <em>first.</em></h2><p class="vj-p">Your searches and alerts are in your membership.</p>' +
        '<button type="button" class="vj-go" data-vj-signin>Sign in</button>'; body.querySelector('[data-vj-signin]').addEventListener('click', signin); return; }
      fromState(st); stepBeds(false);
    });
  }
  /* the member's button says what it will do */
  function label() {
    var st = S.state, t = st && st.member && st.member.onboarded_at ? 'Your searches & alerts' : 'Get alerts for new homes';
    document.querySelectorAll('[data-vip-prefs]').forEach(function (b) { b.textContent = t; });
  }
  window.addEventListener('om-member', function (ev) { if (ev.detail) load(function () { label(); }); });

  /* ------------------------------------------------------------------ wiring */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-vip-signin],[data-vip-prefs]'); if (!t) return;
    ev.preventDefault();
    if (t.hasAttribute('data-vip-prefs')) { track('cta_click', { cta: 'vip:prefs' }); prefs(); } else signin();
  });
  window.OMJOIN = {
    open: function (o) {
      S.token = (o && o.token) || null; S.joinedNow = false;
      show(); stepEmail();
      track('signup_started', { stage: 'modal_open', cs: !!S.token });
    },
    prefs: prefs,
  };
})();
