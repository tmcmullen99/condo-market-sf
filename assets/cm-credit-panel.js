/* cm-credit-panel.js — replaces the retired referral programme surface with the
 * membership credit, across every dashboard view.
 *
 * Background: Condo Market cannot offer commission credit in exchange for
 * referrals. The $10,000 is now granted for creating an account and applied at
 * close — a flat credit, matching the marketplace-app model (profiles.credit_usd,
 * "Commission credit · applied at close"). Nothing is earned, nothing increments,
 * and no ladder is shown.
 *
 * Why this runs as an overlay rather than an edit to the existing renderers:
 * the referral surface spans dashboard/index.html (2,568 lines, four separate
 * clusters), cm-dashboard-render.js and cm-dashboard-shell.js. Stripping markup
 * while those modules still write to the IDs throws on null; stripping the
 * writers while the markup stands leaves empty panels. This module lands the
 * corrected surface atomically, and the dead referral code can then be removed
 * at leisure with no user-visible step in between.
 *
 * The #referrals route is RENAMED, not removed — existing bookmarks and the
 * sidebar link still resolve, and land on the credit explanation. Same reasoning
 * as the /refer/ → /save-10k/ redirect.
 *
 * Load AFTER cm-dashboard-shell.js and cm-dashboard-render.js.
 */
(function () {
  'use strict';

  var CREDIT_USD = 10000;
  var usd = function (n) { return '$' + Number(n || 0).toLocaleString('en-US'); };

  function creditAmount() {
    // Prefer a per-member amount if the profile ever carries one, matching
    // marketplace-app's profiles.credit_usd. Falls back to the market default.
    try {
      var p = window.CM && window.CM._lastProfile;
      if (p && Number(p.credit_usd) > 0) return Number(p.credit_usd);
    } catch (e) {}
    return CREDIT_USD;
  }

  function css() {
    if (document.getElementById('cm-credit-styles')) return;
    var s = document.createElement('style');
    s.id = 'cm-credit-styles';
    s.textContent = [
      '.cmc-hero{background:var(--cm-card,#1a1f2e);border:1px solid rgba(232,227,216,.14);',
      ' border-radius:14px;padding:34px 32px;margin-top:22px;text-align:center}',
      '.cmc-hero .amt{font-family:Playfair Display,Georgia,serif;font-size:clamp(44px,8vw,72px);',
      ' color:var(--cm-bronze,#d4a574);line-height:1.05}',
      '.cmc-hero .cap{font-family:JetBrains Mono,ui-monospace,monospace;font-size:11px;',
      ' letter-spacing:.18em;text-transform:uppercase;color:var(--cm-bronze,#d4a574);margin-top:14px}',
      '.cmc-hero .sub{color:rgba(232,227,216,.72);margin-top:14px;font-size:15px;',
      ' max-width:52ch;margin-left:auto;margin-right:auto}',
      '.cmc-points{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-top:20px}',
      '.cmc-pt{background:var(--cm-card,#1a1f2e);border:1px solid rgba(232,227,216,.14);',
      ' border-radius:12px;padding:20px 22px}',
      '.cmc-pt h4{font-size:14.5px;margin:0 0 6px;color:#e8e3d8}',
      '.cmc-pt p{margin:0;font-size:14px;color:rgba(232,227,216,.68);line-height:1.6}'
    ].join('');
    document.head.appendChild(s);
  }

  /* 1. Sidebar: "1 of 5 referrals / 0.2%" → flat credit, bar always full. */
  function sidebar() {
    var lbl = document.getElementById('sb-ref-label');
    var pct = document.getElementById('sb-ref-pct');
    var fill = document.getElementById('sb-ref-fill');
    if (lbl) lbl.textContent = usd(creditAmount()) + ' credit';
    if (pct) pct.textContent = '';
    if (fill) fill.style.width = '100%';
    // The caption under the bar still reads "off your eventual commission",
    // which remains accurate for a flat credit applied at close.
    var cap = lbl && lbl.parentElement ? lbl.parentElement.parentElement : null;
    if (cap) {
      var small = cap.querySelector('.sb-ref-caption, .caption, small');
      if (small) small.textContent = 'applied at close';
    }
  }

  /* 2. Overview stat tile. */
  function statTile() {
    var v = document.getElementById('stat-referrals');
    var m = document.getElementById('stat-referrals-meta');
    if (!v) return;
    var card = v.closest ? v.closest('.stat-card') : null;
    var label = card ? card.querySelector('.stat-label') : null;
    if (label) label.textContent = 'Your credit';
    v.textContent = usd(creditAmount());
    if (m) m.textContent = 'Applied at close';
  }

  /* 3. The referrals view becomes the credit view. Route kept so bookmarks work. */
  function view() {
    var sec = document.querySelector('.dash-view[data-view="referrals"]');
    if (!sec || sec.dataset.cmcDone === '1') return;
    sec.dataset.cmcDone = '1';

    var amt = creditAmount();
    sec.innerHTML =
      '<h1 class="view-h1">Your <span class="accent">credit</span></h1>' +
      '<p class="view-intro">Creating an account earns you ' + usd(amt) +
      ' off commission, applied at close. It is yours from the moment you sign up — ' +
      'there is nothing to earn and nothing to unlock.</p>' +
      '<div class="cmc-hero">' +
        '<div class="amt">' + usd(amt) + '</div>' +
        '<div class="cap">Commission credit · applied at close</div>' +
        '<p class="sub">Held against your eventual transaction, buy side or sell side. ' +
        'It does not expire and it does not change.</p>' +
      '</div>' +
      '<div class="cmc-points">' +
        '<div class="cmc-pt"><h4>Granted at sign-up</h4><p>The credit attaches to your ' +
          'account the day you create it. No conditions, no qualifying period.</p></div>' +
        '<div class="cmc-pt"><h4>Applied at close</h4><p>It comes off commission on your ' +
          'transaction, and appears on the closing statement.</p></div>' +
        '<div class="cmc-pt"><h4>A flat amount</h4><p>' + usd(amt) + ', not a percentage ' +
          'and not a running total. Condo Market does not operate a referral programme.</p></div>' +
      '</div>';
  }

  /* 4. Nav + view title. */
  function nav() {
    var link = document.querySelector('[data-view-link="referrals"], a[href="#referrals"], [data-view-target="referrals"]');
    if (link) {
      var textNode = null;
      for (var i = 0; i < link.childNodes.length; i++) {
        if (link.childNodes[i].nodeType === 3 && link.childNodes[i].nodeValue.trim()) {
          textNode = link.childNodes[i];
        }
      }
      if (textNode) textNode.nodeValue = 'Your credit';
      else if (!link.querySelector('*')) link.textContent = 'Your credit';
    }
    // Shell writes the page title from VIEW_TITLES on route change.
    var crumb = document.querySelector('.dash-topbar-title, #view-title, .view-title');
    if (crumb && /referrals/i.test(crumb.textContent || '')) crumb.textContent = 'Your credit';
  }

  /* 5. Settings: drop the two referral rows, state the credit as a flat amount. */
  function settings() {
    var refs = document.getElementById('f-referrals');
    if (refs && refs.closest) {
      var row = refs.closest('.kv');
      if (row && row.parentNode) row.parentNode.removeChild(row);
    }
    var credit = document.getElementById('f-credit');
    if (credit) {
      credit.textContent = usd(creditAmount());
      var krow = credit.closest ? credit.closest('.kv') : null;
      var k = krow ? krow.querySelector('.k') : null;
      if (k) k.textContent = 'Commission credit';
    }
  }

  function apply() {
    try {
      css();
      sidebar();
      statTile();
      view();
      nav();
      settings();
    } catch (e) {
      if (window.console && console.error) console.error('cm-credit-panel', e);
    }
  }

  // render() dispatches this once the dashboard has painted; also cover the
  // case where this module loads after that event has already fired.
  window.addEventListener('cm-dash-rendered', apply);
  window.addEventListener('cm-auth-change', function () { setTimeout(apply, 60); });
  window.addEventListener('hashchange', function () { setTimeout(apply, 30); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(apply, 250); });
  } else {
    setTimeout(apply, 250);
  }

  window.CMCreditPanel = { apply: apply };
})();
