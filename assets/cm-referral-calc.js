/* =============================================================================
 * Condo Market SF — Referral Savings Calculator Widget
 * -----------------------------------------------------------------------------
 * Drop-in widget that shows homeowners how much they save on commission by
 * referring others to Condo Market SF.
 *
 * MATH (locked, do not change without legal review):
 *   - 0.2% of sale price per successful referral signup
 *   - Maximum 5 referrals = 1% of sale price = 1% off the 3% CM commission
 *   - Credit accumulates permanently in account, applied at next CM transaction
 *   - At $1.5M sale price, full 5 referrals = $15,000 savings
 *
 * USAGE:
 *   <div data-cm-referral-calc
 *        data-property-value="1500000"
 *        data-referral-count="0"
 *        data-cta-href="/owner-signup/"
 *        data-theme="navy"></div>
 *   <script src="/assets/js/cm-referral-calc.js"></script>
 *
 * ATTRIBUTES (all optional):
 *   data-cm-referral-calc  presence triggers mount
 *   data-property-value    default property value in dollars (default 1,500,000)
 *   data-referral-count    current count, 0-5 (default 0 → pitch mode)
 *   data-cta-href          CTA button link (default '/refer/')
 *   data-cta-label         CTA text (default auto by mode)
 *   data-mode              'pitch' | 'progress' (default auto by count)
 *   data-theme             'navy' | 'ivory' (default 'navy')
 *
 * URL PARAM SUPPORT:
 *   /any-page/?value=2000000 → uses 2M as default unless data-property-value set
 * ========================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var PER_REFERRAL_RATE = 0.002;        // 0.2% per referral
  var MAX_RATE = 0.01;                  // 1% cap
  var MAX_REFERRALS = 5;
  var DEFAULT_PROPERTY_VALUE = 1500000; // SF condo median ballpark
  var SLIDER_MIN = 500000;
  var SLIDER_MAX = 5000000;
  var SLIDER_STEP = 25000;

  // ---------------------------------------------------------------------------
  // Scoped CSS — injected once on first init
  // ---------------------------------------------------------------------------

  var STYLES = [
    '.cm-rc {',
    '  --cm-rc-navy: #1a1f2e;',
    '  --cm-rc-navy-deep: #0f131d;',
    '  --cm-rc-peri: #9fb4d8;',
    '  --cm-rc-ivory: #e8e3d8;',
    '  --cm-rc-ivory-dim: rgba(232, 227, 216, 0.62);',
    '  --cm-rc-ivory-faint: rgba(232, 227, 216, 0.36);',
    '  --cm-rc-rule: rgba(232, 227, 216, 0.12);',
    '  --cm-rc-bronze: #d4a574;',
    '  --cm-rc-gain: #8fb97a;',
    '  --cm-rc-ff-display: \'Playfair Display\', Georgia, serif;',
    '  --cm-rc-ff-body: \'DM Sans\', -apple-system, BlinkMacSystemFont, sans-serif;',
    '  --cm-rc-ff-mono: \'JetBrains Mono\', ui-monospace, \'SF Mono\', Consolas, monospace;',
    '  font-family: var(--cm-rc-ff-body);',
    '  background: var(--cm-rc-navy);',
    '  color: var(--cm-rc-ivory);',
    '  border-radius: 12px;',
    '  padding: 2rem 1.6rem;',
    '  max-width: 540px;',
    '  margin: 0 auto;',
    '  box-sizing: border-box;',
    '}',
    '.cm-rc *, .cm-rc *::before, .cm-rc *::after { box-sizing: border-box; }',
    '.cm-rc-eyebrow {',
    '  font-family: var(--cm-rc-ff-mono);',
    '  font-size: 11px;',
    '  letter-spacing: 0.18em;',
    '  text-transform: uppercase;',
    '  color: var(--cm-rc-peri);',
    '  margin-bottom: 0.5rem;',
    '}',
    '.cm-rc-headline {',
    '  font-family: var(--cm-rc-ff-display);',
    '  font-style: italic;',
    '  font-weight: 500;',
    '  font-size: 1.6rem;',
    '  line-height: 1.2;',
    '  margin: 0 0 1.6rem 0;',
    '  color: inherit;',
    '}',
    '.cm-rc-headline em { color: var(--cm-rc-peri); font-style: italic; }',
    '.cm-rc-savings-card {',
    '  background: var(--cm-rc-navy-deep);',
    '  border: 1px solid var(--cm-rc-rule);',
    '  border-radius: 8px;',
    '  padding: 1.4rem 1.2rem;',
    '  margin-bottom: 1.4rem;',
    '  text-align: center;',
    '}',
    '.cm-rc-savings-amount {',
    '  font-family: var(--cm-rc-ff-display);',
    '  font-style: italic;',
    '  font-weight: 600;',
    '  font-size: 3.4rem;',
    '  line-height: 1;',
    '  color: var(--cm-rc-bronze);',
    '  transition: color 200ms ease;',
    '}',
    '.cm-rc-savings-amount.is-max { color: var(--cm-rc-gain); }',
    '.cm-rc-savings-label {',
    '  font-family: var(--cm-rc-ff-mono);',
    '  font-size: 11px;',
    '  letter-spacing: 0.12em;',
    '  text-transform: uppercase;',
    '  color: var(--cm-rc-peri);',
    '  margin-top: 0.7rem;',
    '}',
    '.cm-rc-savings-context {',
    '  font-size: 13px;',
    '  color: var(--cm-rc-ivory-dim);',
    '  margin-top: 0.5rem;',
    '  line-height: 1.5;',
    '}',
    '.cm-rc-input-group { margin-bottom: 1.4rem; }',
    '.cm-rc-input-label {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: baseline;',
    '  margin-bottom: 0.6rem;',
    '}',
    '.cm-rc-input-label-text {',
    '  font-family: var(--cm-rc-ff-mono);',
    '  font-size: 11px;',
    '  letter-spacing: 0.12em;',
    '  text-transform: uppercase;',
    '  color: var(--cm-rc-peri);',
    '}',
    '.cm-rc-input-value {',
    '  font-family: var(--cm-rc-ff-display);',
    '  font-size: 1.3rem;',
    '  font-weight: 500;',
    '  color: var(--cm-rc-ivory);',
    '}',
    '.cm-rc-slider {',
    '  -webkit-appearance: none;',
    '  appearance: none;',
    '  width: 100%;',
    '  height: 4px;',
    '  background: var(--cm-rc-rule);',
    '  border-radius: 2px;',
    '  outline: none;',
    '  cursor: pointer;',
    '  margin: 0;',
    '}',
    '.cm-rc-slider::-webkit-slider-thumb {',
    '  -webkit-appearance: none;',
    '  appearance: none;',
    '  width: 22px;',
    '  height: 22px;',
    '  background: var(--cm-rc-bronze);',
    '  border-radius: 50%;',
    '  cursor: grab;',
    '  border: 2px solid var(--cm-rc-navy);',
    '  transition: transform 100ms ease;',
    '}',
    '.cm-rc-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }',
    '.cm-rc-slider::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.05); }',
    '.cm-rc-slider::-moz-range-thumb {',
    '  width: 22px;',
    '  height: 22px;',
    '  background: var(--cm-rc-bronze);',
    '  border-radius: 50%;',
    '  cursor: grab;',
    '  border: 2px solid var(--cm-rc-navy);',
    '}',
    '.cm-rc-tiers {',
    '  display: grid;',
    '  grid-template-columns: repeat(5, 1fr);',
    '  gap: 0.4rem;',
    '  margin-bottom: 1.4rem;',
    '}',
    '.cm-rc-tier {',
    '  background: var(--cm-rc-navy-deep);',
    '  border: 1px solid var(--cm-rc-rule);',
    '  border-radius: 6px;',
    '  padding: 0.7rem 0.4rem;',
    '  text-align: center;',
    '  transition: border-color 200ms ease, background 200ms ease;',
    '}',
    '.cm-rc-tier.is-active {',
    '  border-color: var(--cm-rc-bronze);',
    '  background: rgba(212, 165, 116, 0.08);',
    '}',
    '.cm-rc-tier.is-completed {',
    '  border-color: var(--cm-rc-gain);',
    '  background: rgba(143, 185, 122, 0.08);',
    '}',
    '.cm-rc-tier-num {',
    '  font-family: var(--cm-rc-ff-mono);',
    '  font-size: 10px;',
    '  letter-spacing: 0.1em;',
    '  text-transform: uppercase;',
    '  color: var(--cm-rc-peri);',
    '  margin-bottom: 0.3rem;',
    '}',
    '.cm-rc-tier-amount {',
    '  font-family: var(--cm-rc-ff-display);',
    '  font-weight: 600;',
    '  font-size: 0.95rem;',
    '  color: var(--cm-rc-ivory);',
    '  line-height: 1;',
    '}',
    '.cm-rc-tier-rate {',
    '  font-family: var(--cm-rc-ff-mono);',
    '  font-size: 9px;',
    '  color: var(--cm-rc-ivory-faint);',
    '  margin-top: 0.3rem;',
    '}',
    '.cm-rc-cta {',
    '  display: block;',
    '  width: 100%;',
    '  background: var(--cm-rc-bronze);',
    '  color: var(--cm-rc-navy-deep);',
    '  text-align: center;',
    '  padding: 0.95rem 1.2rem;',
    '  border-radius: 6px;',
    '  font-family: var(--cm-rc-ff-body);',
    '  font-weight: 600;',
    '  font-size: 14px;',
    '  text-decoration: none;',
    '  transition: background 150ms ease, transform 150ms ease;',
    '  border: none;',
    '  cursor: pointer;',
    '}',
    '.cm-rc-cta:hover { background: #e2b682; transform: translateY(-1px); }',
    '.cm-rc-disclaimer {',
    '  font-family: var(--cm-rc-ff-mono);',
    '  font-size: 10px;',
    '  letter-spacing: 0.06em;',
    '  color: var(--cm-rc-ivory-faint);',
    '  margin-top: 1rem;',
    '  text-align: center;',
    '  line-height: 1.5;',
    '}',
    /* Ivory theme for use on light-background pages */
    '.cm-rc.cm-rc-ivory {',
    '  --cm-rc-ivory-dim: rgba(26, 31, 46, 0.62);',
    '  --cm-rc-ivory-faint: rgba(26, 31, 46, 0.36);',
    '  --cm-rc-rule: rgba(26, 31, 46, 0.1);',
    '  background: var(--cm-rc-ivory);',
    '  color: var(--cm-rc-navy);',
    '}',
    '.cm-rc.cm-rc-ivory .cm-rc-savings-card,',
    '.cm-rc.cm-rc-ivory .cm-rc-tier {',
    '  background: rgba(26, 31, 46, 0.04);',
    '}',
    '.cm-rc.cm-rc-ivory .cm-rc-eyebrow,',
    '.cm-rc.cm-rc-ivory .cm-rc-input-label-text,',
    '.cm-rc.cm-rc-ivory .cm-rc-savings-label,',
    '.cm-rc.cm-rc-ivory .cm-rc-tier-num {',
    '  color: var(--cm-rc-navy);',
    '  opacity: 0.65;',
    '}',
    '.cm-rc.cm-rc-ivory .cm-rc-input-value,',
    '.cm-rc.cm-rc-ivory .cm-rc-tier-amount,',
    '.cm-rc.cm-rc-ivory .cm-rc-headline em {',
    '  color: var(--cm-rc-navy);',
    '}',
    '.cm-rc.cm-rc-ivory .cm-rc-savings-context {',
    '  color: rgba(26, 31, 46, 0.62);',
    '}',
    '.cm-rc.cm-rc-ivory .cm-rc-slider::-webkit-slider-thumb {',
    '  border-color: var(--cm-rc-ivory);',
    '}',
    '.cm-rc.cm-rc-ivory .cm-rc-slider::-moz-range-thumb {',
    '  border-color: var(--cm-rc-ivory);',
    '}',
    /* Mobile */
    '@media (max-width: 480px) {',
    '  .cm-rc { padding: 1.6rem 1.2rem; }',
    '  .cm-rc-headline { font-size: 1.25rem; }',
    '  .cm-rc-savings-amount { font-size: 2.5rem; }',
    '  .cm-rc-tiers { gap: 0.25rem; }',
    '  .cm-rc-tier { padding: 0.5rem 0.2rem; }',
    '  .cm-rc-tier-amount { font-size: 0.78rem; }',
    '  .cm-rc-tier-num { font-size: 9px; letter-spacing: 0.05em; }',
    '  .cm-rc-tier-rate { display: none; }',
    '}',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function injectStyles() {
    if (document.getElementById('cm-rc-styles')) return;
    var style = document.createElement('style');
    style.id = 'cm-rc-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function formatCurrencyShort(n) {
    if (n >= 1000000) {
      var m = n / 1000000;
      var formatted = m.toFixed(m >= 10 ? 1 : 2);
      formatted = formatted.replace(/\.?0+$/, '');
      return '$' + formatted + 'M';
    }
    if (n >= 1000) {
      return '$' + Math.round(n / 1000) + 'K';
    }
    return '$' + Math.round(n);
  }

  function formatCurrencyFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function calculateSavings(propertyValue, referralCount) {
    var capped = Math.min(Math.max(0, referralCount), MAX_REFERRALS);
    return propertyValue * Math.min(capped * PER_REFERRAL_RATE, MAX_RATE);
  }

  function calculateMaxSavings(propertyValue) {
    return propertyValue * MAX_RATE;
  }

  function tierAmount(propertyValue, tier) {
    return propertyValue * PER_REFERRAL_RATE * tier;
  }

  function getURLValue() {
    try {
      var url = new URL(window.location.href);
      var v = url.searchParams.get('value') ||
              url.searchParams.get('property_value') ||
              url.searchParams.get('property-value');
      if (v) {
        var n = parseInt(v, 10);
        if (!isNaN(n) && n > 0) return n;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // ---------------------------------------------------------------------------
  // HTML builder
  // ---------------------------------------------------------------------------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildHTML(opts) {
    var propertyValue = opts.propertyValue;
    var referralCount = opts.referralCount;
    var ctaHref = opts.ctaHref;
    var ctaLabel = opts.ctaLabel;
    var mode = opts.mode;

    var currentSavings = calculateSavings(propertyValue, referralCount);
    var maxSavings = calculateMaxSavings(propertyValue);
    var isMax = referralCount >= MAX_REFERRALS;
    var displayAmount = referralCount > 0 ? currentSavings : maxSavings;

    var eyebrow, headline, contextText, savingsLabel;
    if (mode === 'progress' && referralCount > 0) {
      eyebrow = 'Your savings so far';
      savingsLabel = 'Earned to date';
      if (isMax) {
        headline = 'You\'ve maxed your <em>1% commission credit</em>.';
        contextText = 'Applied automatically at your next Condo Market transaction.';
      } else {
        var remaining = MAX_REFERRALS - referralCount;
        headline = 'You\'re <em>' + remaining + ' referral' + (remaining === 1 ? '' : 's') + '</em> from the full 1%.';
        contextText = referralCount + ' of ' + MAX_REFERRALS + ' earned. Each referral that joins Condo Market adds 0.2% off your 3% commission.';
      }
    } else {
      eyebrow = 'Refer & save';
      savingsLabel = 'Maximum savings at full referrals';
      headline = 'Save up to <em>1% of your sale price</em> on commission.';
      contextText = 'Refer ' + MAX_REFERRALS + ' people who join Condo Market. Each one earns you 0.2% off your 3% commission, capped at 1% credit.';
    }

    var tiersHtml = '';
    for (var i = 1; i <= MAX_REFERRALS; i++) {
      var amt = tierAmount(propertyValue, i);
      var completed = referralCount >= i;
      var active = (referralCount + 1) === i;
      var cls = 'cm-rc-tier';
      if (completed) cls += ' is-completed';
      else if (active) cls += ' is-active';
      tiersHtml += [
        '<div class="' + cls + '">',
        '  <div class="cm-rc-tier-num">Refer ' + i + '</div>',
        '  <div class="cm-rc-tier-amount" data-cm-rc-tier-amount>' + escapeHtml(formatCurrencyShort(amt)) + '</div>',
        '  <div class="cm-rc-tier-rate">' + (i * 0.2).toFixed(1) + '%</div>',
        '</div>'
      ].join('');
    }

    return [
      '<div class="cm-rc-eyebrow">' + escapeHtml(eyebrow) + '</div>',
      '<h3 class="cm-rc-headline">' + headline + '</h3>',
      '<div class="cm-rc-savings-card">',
      '  <div class="cm-rc-savings-amount' + (isMax ? ' is-max' : '') + '" data-cm-rc-amount>' + escapeHtml(formatCurrencyFull(displayAmount)) + '</div>',
      '  <div class="cm-rc-savings-label">' + escapeHtml(savingsLabel) + '</div>',
      '  <div class="cm-rc-savings-context">' + contextText + '</div>',
      '</div>',
      '<div class="cm-rc-input-group">',
      '  <label class="cm-rc-input-label">',
      '    <span class="cm-rc-input-label-text">Your property value</span>',
      '    <span class="cm-rc-input-value" data-cm-rc-value>' + escapeHtml(formatCurrencyShort(propertyValue)) + '</span>',
      '  </label>',
      '  <input type="range" class="cm-rc-slider" data-cm-rc-slider',
      '         min="' + SLIDER_MIN + '" max="' + SLIDER_MAX + '" step="' + SLIDER_STEP + '" value="' + propertyValue + '"',
      '         aria-label="Your property value">',
      '</div>',
      '<div class="cm-rc-tiers" data-cm-rc-tiers>' + tiersHtml + '</div>',
      '<a href="' + escapeHtml(ctaHref) + '" class="cm-rc-cta">' + escapeHtml(ctaLabel) + '</a>',
      '<div class="cm-rc-disclaimer">',
      '  Discount applied to listing-side commission at next Condo Market transaction.',
      '  Maximum 1% credit per account, regardless of property value.',
      '</div>'
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------

  function mountCalculator(el) {
    // Skip if already mounted
    if (el.classList.contains('cm-rc')) return;

    // Resolve property value: data attr → URL param → default
    var propertyValue = parseInt(el.dataset.propertyValue, 10);
    if (!propertyValue || isNaN(propertyValue)) propertyValue = getURLValue();
    if (!propertyValue || isNaN(propertyValue)) propertyValue = DEFAULT_PROPERTY_VALUE;
    propertyValue = clamp(propertyValue, SLIDER_MIN, SLIDER_MAX);

    var referralCount = parseInt(el.dataset.referralCount, 10);
    if (isNaN(referralCount)) referralCount = 0;
    referralCount = clamp(referralCount, 0, MAX_REFERRALS);

    var ctaHref = el.dataset.ctaHref || '/refer/';
    var theme = el.dataset.theme || 'navy';
    var mode = el.dataset.mode;
    if (!mode) mode = referralCount > 0 ? 'progress' : 'pitch';

    var ctaLabel = el.dataset.ctaLabel;
    if (!ctaLabel) {
      if (mode === 'progress' && referralCount > 0) {
        ctaLabel = referralCount >= MAX_REFERRALS ? 'View your credit' : 'Get your share link';
      } else {
        ctaLabel = 'Get started — create account';
      }
    }

    el.classList.add('cm-rc');
    if (theme === 'ivory') el.classList.add('cm-rc-ivory');

    el.innerHTML = buildHTML({
      propertyValue: propertyValue,
      referralCount: referralCount,
      ctaHref: ctaHref,
      ctaLabel: ctaLabel,
      mode: mode
    });

    // Wire up live slider
    var slider = el.querySelector('[data-cm-rc-slider]');
    var valueEl = el.querySelector('[data-cm-rc-value]');
    var amountEl = el.querySelector('[data-cm-rc-amount]');
    var tierAmountEls = el.querySelectorAll('[data-cm-rc-tier-amount]');

    if (slider) {
      slider.addEventListener('input', function () {
        var pv = parseInt(slider.value, 10);
        if (isNaN(pv)) return;

        valueEl.textContent = formatCurrencyShort(pv);

        var newSavings = referralCount > 0
          ? calculateSavings(pv, referralCount)
          : calculateMaxSavings(pv);
        amountEl.textContent = formatCurrencyFull(newSavings);

        for (var i = 0; i < tierAmountEls.length; i++) {
          tierAmountEls[i].textContent = formatCurrencyShort(tierAmount(pv, i + 1));
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function init() {
    injectStyles();
    var els = document.querySelectorAll('[data-cm-referral-calc]');
    for (var i = 0; i < els.length; i++) {
      mountCalculator(els[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for manual remount if needed
  window.CMReferralCalc = { init: init, mount: mountCalculator };
})();
