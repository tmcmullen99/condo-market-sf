/**
 * cm-counter-modal.js — Counter-offer submission modal
 *
 * Opens for either buyer or owner when it's their turn to respond. Shows the
 * other party's most recent number as the anchor, lets the user enter their
 * counter, and submits via CM.counterOffer() which calls the counter_offer()
 * RPC on the DB. The RPC atomically:
 *   - inserts a new offer_rounds row
 *   - updates offers: status='countered', current_round++, awaiting flips
 *
 * The DB trigger then fires `offer_countered` event → email to the other party.
 *
 * Usage:
 *   import { openCounterModal } from '/assets/cm-counter-modal.js';
 *   openCounterModal({
 *     offer,             // full offer row (must include current_round, awaiting_response_from)
 *     listing,           // optional: listing row for context (address)
 *     previousAmount,    // the latest round's amount — the number being countered
 *     onSubmit: () => {} // called after successful counter; refresh UI here
 *     onCancel: () => {} // called when user dismisses
 *   });
 */

import { CM } from '/assets/cm-supabase.js';

const STYLE_ID = 'cm-counter-styles';
const STYLE_CSS = `
  .cm-co-backdrop {
    position: fixed; inset: 0; z-index: 9998;
    background: rgba(15, 19, 29, 0.86);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px; overflow-y: auto;
    animation: cm-co-fade 180ms ease;
  }
  @keyframes cm-co-fade { from { opacity: 0; } to { opacity: 1; } }
  .cm-co-card {
    background: var(--cm-navy-deep, #0f131d);
    border: 1px solid var(--cm-rule, rgba(232,227,216,0.14));
    border-radius: 14px;
    max-width: 540px; width: 100%;
    max-height: calc(100vh - 48px);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .cm-co-head {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--cm-rule);
  }
  .cm-co-eyebrow {
    display: inline-block; padding: 4px 11px; margin-bottom: 14px;
    border: 1px solid rgba(212,165,116,0.34); border-radius: 999px;
    font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--cm-bronze);
  }
  .cm-co-card h2 {
    font-family: var(--cm-ff-display); font-style: italic; font-weight: 500;
    font-size: clamp(22px, 3vw, 28px); line-height: 1.15;
    color: var(--cm-ivory); margin-bottom: 4px;
  }
  .cm-co-card h2 em { color: var(--cm-peri); font-style: italic; }
  .cm-co-sub {
    color: var(--cm-ivory-dim); font-size: 13px; line-height: 1.55;
  }
  .cm-co-body {
    padding: 22px 32px; overflow-y: auto; flex: 1;
  }

  .cm-co-anchor {
    background: rgba(232, 227, 216, 0.04);
    border: 1px solid var(--cm-rule);
    border-radius: 10px;
    padding: 14px 18px; margin-bottom: 22px;
  }
  .cm-co-anchor-label {
    font-family: var(--cm-ff-mono); font-size: 9px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--cm-ivory-faint); margin-bottom: 4px;
  }
  .cm-co-anchor-addr {
    font-family: var(--cm-ff-display); font-style: italic; font-size: 16px;
    color: var(--cm-ivory); margin-bottom: 8px;
  }
  .cm-co-anchor-row {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-top: 8px; border-top: 1px solid var(--cm-rule);
  }
  .cm-co-anchor-from {
    font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--cm-ivory-dim);
  }
  .cm-co-anchor-amt {
    font-family: var(--cm-ff-display); font-style: italic; font-weight: 600;
    font-size: 22px; color: var(--cm-peri);
  }

  .cm-co-input-block {
    margin-bottom: 18px;
  }
  .cm-co-input-label {
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--cm-bronze); margin-bottom: 10px;
  }
  .cm-co-input-label .val {
    font-family: var(--cm-ff-display); font-style: italic; font-weight: 600;
    font-size: 28px; color: var(--cm-bronze); letter-spacing: 0; text-transform: none;
    line-height: 1;
  }
  .cm-co-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px; background: var(--cm-rule);
    border-radius: 2px; cursor: pointer; outline: none;
  }
  .cm-co-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 22px; height: 22px; background: var(--cm-bronze);
    border-radius: 50%; cursor: grab; border: 2px solid var(--cm-navy-deep);
  }
  .cm-co-slider::-moz-range-thumb {
    width: 22px; height: 22px; background: var(--cm-bronze);
    border-radius: 50%; cursor: grab; border: 2px solid var(--cm-navy-deep);
  }
  .cm-co-slider-bounds {
    display: flex; justify-content: space-between;
    font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.06em;
    color: var(--cm-ivory-faint); margin-top: 6px;
  }
  .cm-co-precise {
    margin-top: 10px; display: flex; align-items: center; gap: 8px;
  }
  .cm-co-precise label {
    font-family: var(--cm-ff-mono); font-size: 9px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--cm-ivory-faint);
  }
  .cm-co-precise-input-wrap {
    flex: 1; display: flex; align-items: center;
    background: var(--cm-navy); border: 1px solid var(--cm-rule);
    border-radius: 6px; padding: 0 12px;
    transition: border-color 150ms ease;
  }
  .cm-co-precise-input-wrap:focus-within { border-color: var(--cm-peri); }
  .cm-co-precise-prefix { color: var(--cm-ivory-faint); font-size: 13px; margin-right: 4px; }
  .cm-co-precise input {
    flex: 1; background: transparent; border: none; outline: none;
    padding: 9px 0; color: var(--cm-ivory);
    font-family: var(--cm-ff-body); font-size: 14px;
  }

  .cm-co-msg-input {
    width: 100%; min-height: 80px; padding: 12px 14px;
    background: var(--cm-navy); border: 1px solid var(--cm-rule);
    border-radius: 6px; color: var(--cm-ivory);
    font-family: var(--cm-ff-body); font-size: 14px; line-height: 1.5;
    resize: vertical; transition: border-color 150ms ease;
  }
  .cm-co-msg-input:focus { outline: none; border-color: var(--cm-peri); }
  .cm-co-msg-input::placeholder { color: var(--cm-ivory-faint); }

  .cm-co-foot {
    padding: 18px 32px 22px;
    border-top: 1px solid var(--cm-rule);
    background: rgba(232, 227, 216, 0.02);
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  }
  .cm-co-btn {
    padding: 12px 22px; border-radius: 999px;
    font-family: var(--cm-ff-body); font-size: 14px; font-weight: 500;
    cursor: pointer; border: 1px solid; transition: all 150ms ease;
  }
  .cm-co-btn-primary {
    background: var(--cm-bronze); color: var(--cm-navy);
    border-color: var(--cm-bronze);
  }
  .cm-co-btn-primary:hover:not(:disabled) {
    background: var(--cm-ivory); border-color: var(--cm-ivory);
  }
  .cm-co-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .cm-co-btn-cancel {
    background: transparent; color: var(--cm-ivory-dim);
    border-color: transparent; margin-left: auto;
  }
  .cm-co-btn-cancel:hover { color: var(--cm-ivory); }

  .cm-co-error {
    margin-top: 12px; padding: 10px 14px;
    background: rgba(201, 120, 101, 0.1);
    border: 1px solid rgba(201, 120, 101, 0.3);
    border-radius: 6px; color: var(--cm-loss);
    font-size: 13px; line-height: 1.5;
  }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = STYLE_CSS;
  document.head.appendChild(s);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function fmtMoney(n) {
  if (!n) return '$0';
  return '$' + Math.round(Number(n)).toLocaleString('en-US');
}
function fmtMoneyShort(n) {
  n = Number(n);
  if (n >= 1000000) {
    const m = n / 1000000;
    return '$' + m.toFixed(m >= 10 ? 2 : 3).replace(/\.?0+$/, '') + 'M';
  }
  if (n >= 1000) return '$' + Math.round(n/1000) + 'K';
  return '$' + Math.round(n);
}

let _activeRoot = null;

/**
 * Open the counter-offer modal.
 * @param {Object} opts
 * @param {Object} opts.offer            - full offer row (must include current_round, awaiting_response_from, listing_id)
 * @param {Object} [opts.listing]        - listing row for context (address shown)
 * @param {number} [opts.previousAmount] - amount being countered (most recent round's amount). If omitted, defaults to offer.offer_amount.
 * @param {Function} [opts.onSubmit]     - called after successful counter
 * @param {Function} [opts.onCancel]     - called when user dismisses
 */
export function openCounterModal(opts = {}) {
  ensureStyles();
  if (_activeRoot) { _activeRoot.remove(); _activeRoot = null; }

  const offer = opts.offer || {};
  const listing = opts.listing || null;
  const previousAmount = Number(opts.previousAmount || offer.offer_amount || 0);

  // Determine who the OTHER party is (whose number the user is countering)
  // Note: openCounterModal is invoked when it's THIS user's turn. The previous
  // round was placed by the other party.
  const otherPartyLabel =
    offer.awaiting_response_from === 'owner'
      ? "Buyer's offer"
      : (offer.current_round > 1 ? "Owner's counter" : "Buyer's offer");

  const addr = listing
    ? (listing.address || '') + (listing.unit_number ? ' #' + listing.unit_number : '')
    : 'Offer';

  // Default counter amount: midpoint between their offer and listing's MMM price (if known),
  // bounded by [500K, 20M].
  let initialCounter = previousAmount;
  if (listing?.price && listing.price > previousAmount) {
    initialCounter = Math.round((previousAmount + Number(listing.price)) / 2 / 25000) * 25000;
  } else if (listing?.price && listing.price < previousAmount) {
    initialCounter = Math.round((previousAmount + Number(listing.price)) / 2 / 25000) * 25000;
  } else {
    initialCounter = Math.round(previousAmount * 1.05 / 25000) * 25000;  // +5% nudge
  }
  if (initialCounter < 500000)   initialCounter = 500000;
  if (initialCounter > 20000000) initialCounter = 20000000;

  const card = document.createElement('div');
  card.className = 'cm-co-backdrop';
  card.innerHTML = `
    <div class="cm-co-card" role="dialog" aria-modal="true">
      <div class="cm-co-head">
        <span class="cm-co-eyebrow">Round ${(offer.current_round || 1) + 1} · Your counter</span>
        <h2>Counter <em>${escapeHtml(otherPartyLabel.toLowerCase())}</em></h2>
        <p class="cm-co-sub">Send your number back. They'll get an email and can accept, decline, or counter again.</p>
      </div>

      <div class="cm-co-body">
        <div class="cm-co-anchor">
          <div class="cm-co-anchor-label">${otherPartyLabel === "Buyer's offer" ? 'On' : 'Listing'}</div>
          <div class="cm-co-anchor-addr">${escapeHtml(addr)}</div>
          <div class="cm-co-anchor-row">
            <span class="cm-co-anchor-from">${escapeHtml(otherPartyLabel)}</span>
            <span class="cm-co-anchor-amt">${fmtMoney(previousAmount)}</span>
          </div>
        </div>

        <div class="cm-co-input-block">
          <div class="cm-co-input-label">
            <span>Your counter</span>
            <span class="val" id="cm-co-display">${fmtMoneyShort(initialCounter)}</span>
          </div>
          <input type="range" class="cm-co-slider" id="cm-co-slider"
                 min="500000" max="20000000" step="25000" value="${initialCounter}">
          <div class="cm-co-slider-bounds">
            <span>$500K</span>
            <span>$20M</span>
          </div>
          <div class="cm-co-precise">
            <label>Or type:</label>
            <div class="cm-co-precise-input-wrap">
              <span class="cm-co-precise-prefix">$</span>
              <input type="number" id="cm-co-precise"
                     min="500000" max="20000000" step="1000"
                     value="${initialCounter}">
            </div>
          </div>
        </div>

        <div class="cm-co-input-block">
          <div class="cm-co-input-label">
            <span>Message (optional)</span>
          </div>
          <textarea class="cm-co-msg-input" id="cm-co-message"
                    placeholder="Optional: explain your number, terms, or timeline."
                    maxlength="500"></textarea>
        </div>

        <div id="cm-co-error-slot"></div>
      </div>

      <div class="cm-co-foot">
        <button type="button" class="cm-co-btn cm-co-btn-primary" id="cm-co-submit">Send counter →</button>
        <button type="button" class="cm-co-btn cm-co-btn-cancel" id="cm-co-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(card);
  _activeRoot = card;
  document.body.style.overflow = 'hidden';

  function close() {
    card.remove();
    document.body.style.overflow = '';
    _activeRoot = null;
  }

  // Sync slider <-> precise input
  const slider  = card.querySelector('#cm-co-slider');
  const precise = card.querySelector('#cm-co-precise');
  const display = card.querySelector('#cm-co-display');
  function setValue(v, source) {
    let n = Number(v) || 0;
    if (n < 500000)   n = 500000;
    if (n > 20000000) n = 20000000;
    if (source !== 'slider') slider.value = String(Math.round(n / 25000) * 25000);
    if (source !== 'precise') precise.value = String(n);
    display.textContent = fmtMoneyShort(n);
  }
  slider.addEventListener('input',  () => setValue(slider.value,  'slider'));
  precise.addEventListener('input', () => setValue(precise.value, 'precise'));

  // Cancel
  card.querySelector('#cm-co-cancel').addEventListener('click', () => {
    close();
    if (opts.onCancel) opts.onCancel();
  });
  card.addEventListener('click', (e) => {
    if (e.target === card) {
      close();
      if (opts.onCancel) opts.onCancel();
    }
  });

  // Submit
  card.querySelector('#cm-co-submit').addEventListener('click', async () => {
    const btn = card.querySelector('#cm-co-submit');
    const msgEl = card.querySelector('#cm-co-message');
    const errorSlot = card.querySelector('#cm-co-error-slot');
    const amount = Number(precise.value) || 0;
    const message = msgEl.value.trim();

    errorSlot.innerHTML = '';
    if (amount < 500000 || amount > 20000000) {
      errorSlot.innerHTML = `<div class="cm-co-error">Counter must be between $500,000 and $20,000,000.</div>`;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';

    const result = await CM.counterOffer(offer.id, amount, message || null);

    if (result.error) {
      errorSlot.innerHTML = `<div class="cm-co-error">${escapeHtml(result.error.message || 'Could not send counter. Please try again.')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Send counter →';
      return;
    }

    close();
    if (opts.onSubmit) opts.onSubmit(result.data);
  });
}
