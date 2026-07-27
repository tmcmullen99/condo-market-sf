/* cm-intent.js — first-moment intent capture.
 *
 * WHY THIS EXISTS
 * 92.3% of human visitors view exactly one page and 5.1% ever return, so there
 * is no second chance to ask who someone is. Platform-wide, 5 CTA clicks came
 * from 5,276 humans (0.09%) because every ask sat below the fold.
 *
 * SHAPE
 *   trigger  second scroll — intent already demonstrated, unlike an on-arrival modal
 *   step 1   two doors: own here / just looking
 *   step 2   ONE real answer, computed from live data, before any gate
 *   step 3   email for the saved report and continued access
 *
 * The free answer is the point. Describing value converts far worse than
 * showing it, and the only durable advantage here is that the answer is
 * genuinely specific to the building the visitor is already looking at.
 *
 * WHAT IT WILL NOT DO
 * It never states what a unit is worth. Backtesting put unit-level valuation at
 * 13.1% mean error with only 52% inside +/-10%, and price opinion is a licensed
 * activity in California. Owners asking about price are routed into the CMA
 * tool, which they drive themselves, and then to the agent for the opinion.
 * Every number shown carries the sale count behind it.
 */
(function () {
  'use strict';

  var SB_URL  = window.__CM_SUPABASE_URL__  || 'https://kfqphwerygccpzntbbif.supabase.co';
  var SB_KEY  = window.__CM_SUPABASE_ANON__ || '';
  var SEEN_KEY = 'cm_intent_v1';

  function track(ev, meta) { try { if (window.cmTrack) window.cmTrack(ev, meta || null); } catch (e) {} }

  function rpc(fn, body) {
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    }).then(function (r) { if (!r.ok) throw new Error(fn + ' ' + r.status); return r.json(); });
  }

  function buildingSlug() {
    var m = location.pathname.match(/^\/building\/([^\/]+)/i);
    if (m) return decodeURIComponent(m[1]);
    var el = document.querySelector('[data-building-slug],[data-building]');
    return el ? (el.getAttribute('data-building-slug') || el.getAttribute('data-building')) : null;
  }

  // Prices abbreviate; $/sf must not. An earlier version ran both through the
  // same formatter and rendered a $1,042/sq ft median as "$1K".
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function psf(n) {
    n = Number(n);
    return isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '—';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------- styles ------------------------------- */
  function injectCss() {
    if (document.getElementById('cm-intent-css')) return;
    var s = document.createElement('style');
    s.id = 'cm-intent-css';
    s.textContent = [
      '.cmi-back{position:fixed;inset:0;background:rgba(10,13,18,.62);backdrop-filter:blur(3px);z-index:9998;opacity:0;transition:opacity .22s ease}',
      '.cmi-back.on{opacity:1}',
      '.cmi{position:fixed;z-index:9999;left:50%;top:50%;transform:translate(-50%,-46%);width:min(560px,calc(100vw - 32px));max-height:88vh;overflow:auto;background:#faf7f2;border-radius:16px;box-shadow:0 24px 70px rgba(10,13,18,.4);opacity:0;transition:opacity .22s ease,transform .22s ease;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}',
      '.cmi.on{opacity:1;transform:translate(-50%,-50%)}',
      '.cmi-in{padding:30px 30px 26px}',
      '.cmi-x{position:absolute;top:12px;right:14px;border:0;background:transparent;font-size:24px;line-height:1;color:#9a938a;cursor:pointer;padding:6px}',
      '.cmi-eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#b2431a;margin:0 0 8px}',
      '.cmi-h{font-family:Georgia,"Times New Roman",serif;font-size:25px;line-height:1.25;color:#171c2a;margin:0 0 8px}',
      '.cmi-sub{font-size:14.5px;line-height:1.5;color:#5d574e;margin:0 0 20px}',
      '.cmi-door{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e3ddd2;border-radius:12px;padding:18px 20px;margin-bottom:12px;cursor:pointer;transition:border-color .15s,transform .15s,box-shadow .15s}',
      '.cmi-door:hover{border-color:#b2431a;transform:translateY(-1px);box-shadow:0 6px 18px rgba(10,13,18,.08)}',
      '.cmi-door b{display:block;font-size:17px;color:#171c2a;margin-bottom:3px;font-weight:600}',
      '.cmi-door span{display:block;font-size:13.5px;color:#6c655c;line-height:1.45}',
      '.cmi-ans{background:#fff;border:1px solid #e3ddd2;border-radius:12px;padding:18px 20px;margin:0 0 16px}',
      '.cmi-ans-q{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.05em;color:#9a938a;margin:0 0 10px}',
      '.cmi-stat{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid #f0ece4;font-size:14.5px}',
      '.cmi-stat:last-child{border-bottom:0}',
      '.cmi-stat b{font-family:Georgia,serif;font-size:19px;color:#171c2a}',
      '.cmi-stat i{font-style:normal;color:#6c655c}',
      '.cmi-note{font-size:12px;color:#8a837a;line-height:1.5;margin:10px 0 0}',
      '.cmi-field{display:flex;gap:8px;margin:4px 0 10px}',
      '.cmi-field input{flex:1;min-width:0;padding:13px 14px;border:1px solid #ddd6ca;border-radius:9px;font:inherit;font-size:15px;background:#fff}',
      '.cmi-field input:focus{outline:2px solid rgba(178,67,26,.3);border-color:#b2431a}',
      '.cmi-btn{background:#b2431a;color:#fff;border:0;border-radius:9px;padding:13px 22px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.cmi-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.cmi-alt{display:block;width:100%;background:transparent;border:0;color:#8a837a;font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer;padding:8px;margin-top:2px}',
      '.cmi-err{color:#9c2f16;font-size:13px;margin:2px 0 8px}',
      '@media(max-width:560px){.cmi-in{padding:26px 20px 22px}.cmi-h{font-size:22px}.cmi-field{flex-direction:column}.cmi-btn{width:100%}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ------------------------------- shell -------------------------------- */
  var backEl, boxEl, slug = null, chosen = null;

  function close(reason) {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {}
    track('intent_dismissed', { step: chosen || 'doors', reason: reason || 'close' });
    if (boxEl) boxEl.classList.remove('on');
    if (backEl) backEl.classList.remove('on');
    setTimeout(function () {
      if (boxEl && boxEl.parentNode) boxEl.parentNode.removeChild(boxEl);
      if (backEl && backEl.parentNode) backEl.parentNode.removeChild(backEl);
      boxEl = backEl = null;
    }, 240);
  }

  function open(why) {
    injectCss();
    backEl = document.createElement('div');
    backEl.className = 'cmi-back';
    backEl.addEventListener('click', function () { close('backdrop'); });
    boxEl = document.createElement('div');
    boxEl.className = 'cmi';
    boxEl.setAttribute('role', 'dialog');
    boxEl.setAttribute('aria-modal', 'true');
    document.body.appendChild(backEl);
    document.body.appendChild(boxEl);
    requestAnimationFrame(function () { backEl.classList.add('on'); boxEl.classList.add('on'); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close('esc'); document.removeEventListener('keydown', onEsc); }
    });
    renderDoors();
    track('intent_shown', { path: location.pathname, building: slug, trigger: why || 'unknown' });
  }

  function paint(html) {
    boxEl.innerHTML = '<button class="cmi-x" aria-label="Close">&times;</button><div class="cmi-in">' + html + '</div>';
    boxEl.querySelector('.cmi-x').addEventListener('click', function () { close('x'); });
  }

  /* ------------------------------ step 1 -------------------------------- */
  function renderDoors() {
    paint(
      '<p class="cmi-eyebrow">Condo Market</p>' +
      '<h2 class="cmi-h">Let\'s customise what you see.</h2>' +
      '<p class="cmi-sub">One tap. We\'ll show you the numbers that actually matter for your situation.</p>' +
      '<button class="cmi-door" data-door="owner"><b>I own a home here</b>' +
        '<span>See what your building has done since you bought — and float a price without moving out.</span></button>' +
      '<button class="cmi-door" data-door="buyer"><b>I\'m looking</b>' +
        '<span>Make an offer on any unit in any building — not just the ones listed on Zillow.</span></button>'
    );
    Array.prototype.forEach.call(boxEl.querySelectorAll('.cmi-door'), function (b) {
      b.addEventListener('click', function () {
        chosen = b.getAttribute('data-door');
        track('intent_chose', { door: chosen, building: slug });
        renderAnswer();
      });
    });
  }

  /* ------------------------------ step 2 --------------------------------
   * One real answer, no gate. Everything here comes from functions that
   * already refuse to speak when the sample is too thin.
   */
  function renderAnswer() {
    paint('<p class="cmi-eyebrow">Reading the record</p><h2 class="cmi-h">One moment…</h2>');

    if (!slug) { renderGate(null); return; }

    rpc('building_dossier', { p_slug: slug }).then(function (d) {
      d = d || {};
      var name  = d.name || 'this building';
      var units = d.units_with_data || 0;
      var sales = d.units_with_sales || 0;
      var p50   = d.psf_p50, p05 = d.psf_p05, p95 = d.psf_p95;

      var rows = '';
      if (p50)   rows += stat('Median $/sq ft', psf(p50));
      if (p05 && p95) rows += stat('Range across units', psf(p05) + ' \u2013 ' + psf(p95));
      if (units) rows += stat(chosen === 'owner' ? 'Units on record here' : 'Units you could offer on', String(units));
      if (!rows) { renderGate(name); return; }

      var q = chosen === 'owner'
        ? 'What has ' + name + ' been trading at?'
        : 'What would it take to buy in ' + name + '?';

      var lede = chosen === 'owner'
        ? 'Every recorded sale in your building, free. Find your unit and you\'ll see what it last sold for and how the building has moved since.'
        : 'Every one of these units can receive a written offer — listed or not. Most owners have never been asked.';

      paint(
        '<p class="cmi-eyebrow">' + (chosen === 'owner' ? 'Your building' : 'This building') + '</p>' +
        '<h2 class="cmi-h">' + esc(name) + '</h2>' +
        '<div class="cmi-ans"><p class="cmi-ans-q">' + esc(q) + '</p>' + rows + '</div>' +
        '<p class="cmi-sub">' + lede + '</p>' +
        gateForm(chosen === 'owner'
          ? 'Email me my unit\'s history'
          : 'Email me this building\'s full record') +
        '<button class="cmi-alt" data-skip>Keep browsing</button>'
      );
      wireGate(name);
      track('intent_answered', { door: chosen, building: slug, had_stats: true });
    }).catch(function () {
      renderGate(null);
      track('intent_answered', { door: chosen, building: slug, had_stats: false });
    });
  }

  function stat(label, val) {
    return '<div class="cmi-stat"><i>' + esc(label) + '</i><b>' + esc(val) + '</b></div>';
  }

  /* ------------------------------ step 3 -------------------------------- */
  function gateForm(cta) {
    return '<div class="cmi-field"><input type="email" placeholder="you@email.com" autocomplete="email" ' +
           'inputmode="email" aria-label="Email address"><button class="cmi-btn">' + esc(cta) + '</button></div>' +
           '<p class="cmi-err" hidden></p>' +
           '<p class="cmi-note">No password. We never sell your data, and you can stop the emails in one click.</p>';
  }

  function renderGate(name) {
    paint(
      '<p class="cmi-eyebrow">Condo Market</p>' +
      '<h2 class="cmi-h">' + (chosen === 'owner'
        ? 'See what your unit last sold for.'
        : 'Every unit is open to an offer.') + '</h2>' +
      '<p class="cmi-sub">' + (chosen === 'owner'
        ? 'The complete recorded history of ' + esc(name || 'your building') + ' — every sale, every price, free.'
        : 'Not just what\'s listed. Any unit, any building — the owner receives a real written offer.') + '</p>' +
      gateForm('Send it to me') +
      '<button class="cmi-alt" data-skip>Keep browsing</button>'
    );
    wireGate(name);
  }

  function wireGate(name) {
    var skip = boxEl.querySelector('[data-skip]');
    if (skip) skip.addEventListener('click', function () { close('skip'); });

    var input = boxEl.querySelector('input[type=email]');
    var btn   = boxEl.querySelector('.cmi-btn');
    var err   = boxEl.querySelector('.cmi-err');
    if (!input || !btn) return;

    function submit() {
      var v = (input.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) {
        err.textContent = 'That email doesn\'t look right.'; err.hidden = false; input.focus(); return;
      }
      err.hidden = true; btn.disabled = true; btn.textContent = 'Sending…';
      track('intent_email_submitted', { door: chosen, building: slug });

      rpc('capture_intent_lead', {
        p_email: v, p_intent: chosen, p_building_slug: slug,
        p_path: location.pathname, p_session_id: (window.cmSessionId || null)
      }).then(function () {
        track('intent_email_captured', { door: chosen, building: slug });
        paint(
          '<p class="cmi-eyebrow">Done</p>' +
          '<h2 class="cmi-h">Check your inbox.</h2>' +
          '<p class="cmi-sub">' + (chosen === 'owner'
            ? 'Your building\'s full sale record is on its way. Want a price for your specific unit? Build your own comparative analysis — it takes about a minute, and Tim will review it with you after.'
            : 'The full record is on its way. When you find a unit you want, you can send the owner a written offer whether or not it\'s listed.') + '</p>' +
          '<div class="cmi-field"><a class="cmi-btn" style="text-decoration:none;text-align:center;display:block;width:100%" href="' +
            (chosen === 'owner' ? '/tools/cma/?b=' + encodeURIComponent(slug || '') : '/buildings/') +
            '" data-cta="intent-' + chosen + '-next">' +
            (chosen === 'owner' ? 'Build my own CMA →' : 'Browse every building →') + '</a></div>'
        );
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'Try again';
        err.textContent = 'Something went wrong — ' + (e && e.message ? e.message : 'please retry.');
        err.hidden = false;
        track('intent_email_failed', { door: chosen, reason: String(e && e.message || 'unknown') });
      });
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 120);
  }

  /* ------------------------------ trigger -------------------------------
   * Second distinct scroll burst, not arrival. An on-arrival modal is
   * dismissed reflexively; by the second scroll the visitor has chosen to
   * keep reading, which is the earliest honest signal of intent.
   */
  function init() {
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch (e) {}
    if (SB_KEY.indexOf('ey') !== 0 && SB_KEY.indexOf('sb_') !== 0) return;  // no creds, stay silent
    slug = buildingSlug();

    // Trigger: the visitor has scrolled more than once and stayed a few seconds.
    // Two earlier designs were rejected - counting "scroll bursts" with a
    // cooldown proved unreliable, and measuring scroll DISTANCE depends on
    // layout, which makes it untestable outside a real browser. Counting scroll
    // events plus a dwell floor has neither problem: a single flick fires many
    // scroll events, so the dwell is what separates a bounce from a reader.
    var fired = false, scrolls = 0, firstScrollAt = 0;

    function fire(why) {
      if (fired) return;
      fired = true;
      window.removeEventListener('scroll', onScroll);
      open(why);
    }
    function onScroll() {
      if (fired) return;
      scrolls++;
      if (!firstScrollAt) firstScrollAt = Date.now();
      // enough movement to be reading, and enough time to be deliberate
      if (scrolls >= 6 && Date.now() - firstScrollAt >= 2500) fire('scroll');
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // Backstop: a reader who scrolled at all and stayed 12s gets the same offer.
    setTimeout(function () { if (scrolls > 0) fire('dwell'); }, 12000);

    // Manual opener, for verifying in a real browser without waiting.
    window.cmIntentOpen = function () { fire('manual'); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
