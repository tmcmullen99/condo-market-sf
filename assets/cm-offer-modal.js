/**
 * cm-offer-modal.js — Express Interest submission modal (v2.0)
 *
 * v2.0 (2026-05-10): full rename to "Express Interest" terminology
 * reflecting the lead-gen marketplace model:
 *   - Submissions are EOIs (Expressions of Interest), NOT Letters of Intent
 *   - The Platform records the presumptive signal; the licensed agent drafts
 *     the actual LOI off-platform
 *   - User must check certification box before submitting (Section 3 TOS
 *     anti-circumvention + EOI/LOI distinction)
 *   - Submit button: "Send to agent →" (was "Submit offer →")
 *   - Success state reflects agent handoff (was "your offer is on its way to
 *     the owner" → now "your assigned agent will contact you")
 *
 * Database column names (offers.offer_amount etc) unchanged — internal only.
 *
 * Auto-mounts a single global modal on document.body. Opens via two paths:
 *
 *   1. Click on any element with [data-cm-offer-trigger] — the modal reads
 *      data-listing-id, data-building-slug, data-suggested-price from the
 *      element to prefill its form.
 *
 *   2. window.dispatchEvent(new CustomEvent('cm:open-offer-modal', {
 *        detail: { listing_id, building_slug, suggested_price }
 *      })) — JS-driven open from modules like cm-featured (Featured card
 *      whole-card click).
 *
 * States:
 *   - Anon: gate with "Sign in to express interest" CTA
 *   - Form: amount slider (matches MMM price by default if listing provided),
 *           optional message, required certification checkbox, submit
 *   - Success: confirmation + auto-close after 5s
 *
 * Submission: CM.createOffer() inserts a row into offers; RLS allows the
 * buyer to insert their own. Owner & admin get notified server-side
 * (separate edge function).
 */

import { CM } from '/assets/cm-supabase.js';

const STYLE_ID = 'cm-offer-modal-styles';

const STYLE_CSS = `
  .cm-om-backdrop {
    position: fixed; inset: 0;
    background: rgba(15, 19, 29, 0.86);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 200;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    opacity: 0;
    transition: opacity 220ms ease;
    pointer-events: none;
  }
  .cm-om-backdrop.is-open { opacity: 1; pointer-events: auto; }

  .cm-om {
    position: relative;
    background: var(--cm-navy-deep, #0f131d);
    border: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.16));
    border-radius: 16px;
    width: 100%;
    max-width: 540px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 36px 32px 28px;
    transform: translateY(20px) scale(0.98);
    transition: transform 280ms cubic-bezier(.2,.7,.2,1);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }
  .cm-om-backdrop.is-open .cm-om {
    transform: translateY(0) scale(1);
  }

  .cm-om-close {
    position: absolute;
    top: 16px; right: 16px;
    background: transparent; border: none;
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    font-size: 22px; cursor: pointer;
    width: 32px; height: 32px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    transition: color 150ms ease, background 150ms ease;
  }
  .cm-om-close:hover {
    color: var(--cm-ivory, #e8e3d8);
    background: rgba(232, 227, 216, 0.06);
  }

  .cm-om-eyebrow {
    display: inline-block;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--cm-bronze, #d4a574);
    padding: 4px 11px;
    border: 1px solid rgba(212, 165, 116, 0.34);
    border-radius: 999px;
    margin-bottom: 14px;
  }
  .cm-om h2 {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: 28px;
    color: var(--cm-ivory, #e8e3d8);
    line-height: 1.15;
    margin-bottom: 10px;
  }
  .cm-om h2 em {
    font-style: italic;
    color: var(--cm-peri, #9fb4d8);
  }
  .cm-om-sub {
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    font-size: 14px;
    line-height: 1.55;
    margin-bottom: 24px;
  }
  .cm-om-anchor {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    background: rgba(212, 165, 116, 0.06);
    border: 1px solid rgba(212, 165, 116, 0.24);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .cm-om-anchor-thumb {
    flex-shrink: 0;
    width: 56px; height: 56px;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(232, 227, 216, 0.06);
  }
  .cm-om-anchor-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cm-om-anchor-label {
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--cm-bronze, #d4a574);
  }
  .cm-om-anchor-price {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 600;
    font-size: 22px;
    color: var(--cm-bronze, #d4a574);
    line-height: 1;
    flex: 1;
  }
  .cm-om-match-btn {
    background: rgba(212, 165, 116, 0.15);
    color: var(--cm-bronze, #d4a574);
    border: 1px solid rgba(212, 165, 116, 0.4);
    padding: 8px 14px;
    border-radius: 999px;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 150ms ease;
  }
  .cm-om-match-btn:hover {
    background: var(--cm-bronze, #d4a574);
    color: var(--cm-navy, #1a1f2e);
  }

  .cm-om-field {
    margin-bottom: 22px;
  }
  .cm-om-field label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--cm-peri, #9fb4d8);
  }
  .cm-om-field-display {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 600;
    font-size: 28px;
    color: var(--cm-bronze, #d4a574);
    line-height: 1;
    text-transform: none;
    letter-spacing: 0;
  }
  .cm-om-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px;
    background: var(--cm-rule, rgba(232, 227, 216, 0.16));
    border-radius: 2px;
    outline: none; cursor: pointer;
    margin: 8px 0;
  }
  .cm-om-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 22px; height: 22px;
    background: var(--cm-bronze, #d4a574);
    border-radius: 50%;
    cursor: grab;
    border: 2px solid var(--cm-navy-deep, #0f131d);
  }
  .cm-om-slider::-moz-range-thumb {
    width: 22px; height: 22px;
    background: var(--cm-bronze, #d4a574);
    border-radius: 50%;
    cursor: grab;
    border: 2px solid var(--cm-navy-deep, #0f131d);
  }
  .cm-om-textarea {
    width: 100%;
    background: var(--cm-navy, #1a1f2e);
    border: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.16));
    border-radius: 8px;
    padding: 12px 14px;
    color: var(--cm-ivory, #e8e3d8);
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
    min-height: 88px;
    transition: border-color 150ms ease;
  }
  .cm-om-textarea:focus {
    outline: none;
    border-color: var(--cm-peri, #9fb4d8);
  }
  .cm-om-textarea::placeholder {
    color: var(--cm-ivory-faint, rgba(232, 227, 216, 0.36));
  }

  /* v2.0 — Certification checkbox */
  .cm-om-cert-row {
    display: flex;
    gap: 11px;
    align-items: flex-start;
    background: rgba(159, 180, 216, 0.06);
    border: 1px solid rgba(159, 180, 216, 0.2);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 18px;
    cursor: pointer;
  }
  .cm-om-cert-row input[type="checkbox"] {
    flex-shrink: 0;
    width: 17px; height: 17px;
    margin-top: 2px;
    accent-color: var(--cm-peri, #9fb4d8);
    cursor: pointer;
  }
  .cm-om-cert-label {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.72));
  }
  .cm-om-cert-label strong { color: var(--cm-ivory, #e8e3d8); }
  .cm-om-cert-label a {
    color: var(--cm-peri, #9fb4d8);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .cm-om-submit {
    width: 100%;
    background: var(--cm-bronze, #d4a574);
    color: var(--cm-navy, #1a1f2e);
    border: none;
    padding: 14px 24px;
    border-radius: 10px;
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: transform 150ms ease, background 150ms ease, opacity 150ms ease;
    margin-top: 4px;
  }
  .cm-om-submit:hover:not(:disabled) {
    background: var(--cm-ivory, #e8e3d8);
    transform: translateY(-1px);
  }
  .cm-om-submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .cm-om-fine {
    margin-top: 14px;
    font-size: 12px;
    color: var(--cm-ivory-faint, rgba(232, 227, 216, 0.5));
    line-height: 1.5;
    text-align: center;
  }

  .cm-om-msg {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.5;
  }
  .cm-om-msg.is-error {
    background: rgba(201, 120, 101, 0.1);
    border: 1px solid rgba(201, 120, 101, 0.3);
    color: var(--cm-loss, #c97865);
  }

  .cm-om-success {
    text-align: center;
    padding: 32px 0 12px;
  }
  .cm-om-success-icon {
    font-size: 36px;
    margin-bottom: 16px;
    display: inline-block;
    width: 64px; height: 64px;
    line-height: 64px;
    background: rgba(143, 185, 122, 0.15);
    border: 2px solid rgba(143, 185, 122, 0.5);
    border-radius: 50%;
    color: var(--cm-gain, #8fb97a);
  }
  .cm-om-success h3 {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: 24px;
    color: var(--cm-ivory, #e8e3d8);
    margin-bottom: 10px;
  }
  .cm-om-success p {
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    font-size: 14px;
    line-height: 1.55;
    max-width: 42ch;
    margin: 0 auto 8px;
  }
  .cm-om-success-steps {
    text-align: left;
    margin: 18px auto 0;
    max-width: 42ch;
    background: rgba(232, 227, 216, 0.03);
    border-left: 3px solid var(--cm-peri, #9fb4d8);
    padding: 14px 16px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
  }
  .cm-om-success-steps strong { color: var(--cm-ivory, #e8e3d8); }

  .cm-om-gate {
    text-align: center;
    padding: 12px 0;
  }
  .cm-om-gate h3 {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: 24px;
    color: var(--cm-ivory, #e8e3d8);
    margin-bottom: 12px;
  }
  .cm-om-gate p {
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    font-size: 14px;
    line-height: 1.55;
    margin-bottom: 22px;
    max-width: 42ch;
    margin-left: auto; margin-right: auto;
  }
  .cm-om-gate-cta {
    display: inline-block;
    background: var(--cm-peri, #9fb4d8);
    color: var(--cm-navy, #1a1f2e);
    padding: 12px 24px;
    border-radius: 999px;
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition: opacity 150ms ease;
  }
  .cm-om-gate-cta:hover { opacity: 0.88; }
`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
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
    let s = m.toFixed(m >= 10 ? 1 : 2).replace(/\.?0+$/, '');
    return '$' + s + 'M';
  }
  if (n >= 1000) return '$' + Math.round(n/1000) + 'K';
  return '$' + Math.round(n);
}

let _buildingsCache = null;
async function loadBuildings() {
  if (_buildingsCache) return _buildingsCache;
  try {
    const r = await fetch('/assets/buildings.json', { cache: 'force-cache' });
    if (r.ok) _buildingsCache = await r.json();
  } catch (e) {}
  return _buildingsCache || [];
}
function buildingBySlug(buildings, slug) {
  return buildings.find(b => {
    const s = (b.href || '').replace(/\/$/, '').split('/').pop();
    return s === slug;
  });
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = STYLE_CSS;
  document.head.appendChild(s);
}

// ─── Modal singleton (lazily created on first open) ─────────────────────────

let backdropEl = null;

function ensureModal() {
  if (backdropEl) return backdropEl;
  ensureStyles();
  backdropEl = document.createElement('div');
  backdropEl.className = 'cm-om-backdrop';
  backdropEl.setAttribute('role', 'presentation');
  backdropEl.innerHTML = `<div class="cm-om" role="dialog" aria-modal="true" aria-labelledby="cm-om-title"></div>`;
  document.body.appendChild(backdropEl);

  // Close handlers
  backdropEl.addEventListener('click', (e) => {
    if (e.target === backdropEl) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdropEl.classList.contains('is-open')) close();
  });
  return backdropEl;
}

function close() {
  if (!backdropEl) return;
  backdropEl.classList.remove('is-open');
  document.body.style.overflow = '';
}

// ─── Render: gate / form / success ──────────────────────────────────────────

function renderGate(modal) {
  modal.innerHTML = `
    <button class="cm-om-close" aria-label="Close">×</button>
    <span class="cm-om-eyebrow">Express interest</span>
    <h2 id="cm-om-title">Sign in to <em>express interest</em>.</h2>
    <p class="cm-om-sub">Members privately express interest in units they'd seriously consider buying. Owners are notified and a licensed agent handles the rest. Free to create an account.</p>
    <div class="cm-om-gate">
      <a href="#signup" class="cm-om-gate-cta" data-cm-auth="signup">Create free account →</a>
    </div>
  `;
  modal.querySelector('.cm-om-close').addEventListener('click', close);
}

async function renderForm(modal, ctx) {
  const { listing, building, suggested_price } = ctx;
  const buildingName = (building && (building.name || building.dname)) || ctx.building_slug || 'this building';
  const listingPrice = listing ? Number(listing.price) : null;

  // Slider config — fixed full-range so any condo price fits, default 95% of MMM
  const SLIDER_MIN  = 500000;
  const SLIDER_MAX  = listingPrice ? Math.max(5000000, Math.round(listingPrice * 1.2)) : 5000000;
  const SLIDER_STEP = 25000;
  const defaultAmt  = suggested_price
    ? Number(suggested_price)
    : (listingPrice ? Math.round(listingPrice * 0.95 / SLIDER_STEP) * SLIDER_STEP : 1500000);

  const subText = listing
    ? `${escapeHtml(listing.address || '')}${listing.unit_number ? ' · Unit ' + escapeHtml(listing.unit_number) : ''}`
    : `Generic interest in ${escapeHtml(buildingName)}.`;

  const anchorHtml = listing && listingPrice
    ? `
      <div class="cm-om-anchor">
        ${listing.cover_photo_path ? `<div class="cm-om-anchor-thumb"><img src="${escapeHtml(CM.getListingPhotoUrl(listing.cover_photo_path) || '')}" alt="Listing photo"></div>` : ''}
        <div style="flex:1;min-width:120px;">
          <div class="cm-om-anchor-label">Make-me-move</div>
          <div class="cm-om-anchor-price">${fmtMoney(listingPrice)}</div>
        </div>
        <button type="button" class="cm-om-match-btn" id="cm-om-match">Match this →</button>
      </div>
    `
    : '';

  modal.innerHTML = `
    <button class="cm-om-close" aria-label="Close">×</button>
    <span class="cm-om-eyebrow">Express interest · ${escapeHtml(buildingName)}</span>
    <h2 id="cm-om-title">What's your <em>number</em>?</h2>
    <p class="cm-om-sub">${subText}</p>

    ${anchorHtml}

    <form id="cm-om-form">
      <div class="cm-om-field">
        <label for="cm-om-amount">
          <span>Your number</span>
          <span class="cm-om-field-display" id="cm-om-amount-display">${fmtMoneyShort(defaultAmt)}</span>
        </label>
        <input type="range" class="cm-om-slider" id="cm-om-amount"
               min="${SLIDER_MIN}" max="${SLIDER_MAX}" step="${SLIDER_STEP}" value="${defaultAmt}">
      </div>

      <div class="cm-om-field">
        <label for="cm-om-message"><span>Note to your agent (optional)</span><span style="text-transform:none;font-size:11px;color:var(--cm-ivory-faint);">Optional</span></label>
        <textarea class="cm-om-textarea" id="cm-om-message" placeholder="Cash offer · 15-day close · pre-approved at $X · any context you want your agent to know"></textarea>
      </div>

      <label class="cm-om-cert-row">
        <input type="checkbox" id="cm-om-cert-cb">
        <span class="cm-om-cert-label">
          <strong>I understand:</strong> This is an Expression of Interest — not a Letter of Intent. My assigned licensed agent (<strong>McMullen Properties, CA DRE #02016832</strong>) will draft the formal LOI and review it with me before delivery to the owner. I agree to the Platform's <a href="#tos" data-cm-tos>Terms of Service</a>, including Section 3 requiring me to use the Platform-designated agent for any resulting transaction.
        </span>
      </label>

      <button type="submit" class="cm-om-submit" id="cm-om-submit" disabled>Send to agent →</button>
      <p class="cm-om-fine">Your assigned agent will contact you within 24 hours to review and prepare the formal LOI before any document is delivered to the owner.</p>
      <div id="cm-om-msg"></div>
    </form>
  `;

  // Wire close
  modal.querySelector('.cm-om-close').addEventListener('click', close);

  // Wire slider live-update
  const slider = modal.querySelector('#cm-om-amount');
  const display = modal.querySelector('#cm-om-amount-display');
  slider.addEventListener('input', () => {
    display.textContent = fmtMoneyShort(slider.value);
  });

  // Wire "Match make-me-move" button
  const matchBtn = modal.querySelector('#cm-om-match');
  if (matchBtn && listingPrice) {
    matchBtn.addEventListener('click', () => {
      slider.value = listingPrice;
      display.textContent = fmtMoneyShort(listingPrice);
    });
  }

  // Wire certification checkbox — gates submit button
  const certCb = modal.querySelector('#cm-om-cert-cb');
  const submitBtn = modal.querySelector('#cm-om-submit');
  certCb.addEventListener('change', () => {
    submitBtn.disabled = !certCb.checked;
  });

  // Wire TOS link inside cert label — opens TOS modal in info mode
  const tosLink = modal.querySelector('[data-cm-tos]');
  if (tosLink) {
    tosLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const m = await import('/assets/cm-tos-modal.js');
        m.openTosModal({ mode: 'info' });
      } catch (err) {
        console.error('Could not load TOS modal', err);
      }
    });
  }

  // Wire submit
  modal.querySelector('#cm-om-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!certCb.checked) return;
    const msgEl = modal.querySelector('#cm-om-msg');
    const amount = parseInt(slider.value, 10);
    const message = modal.querySelector('#cm-om-message').value.trim();

    msgEl.innerHTML = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    const result = await CM.createOffer({
      listing_id:    listing?.id || null,
      building_slug: ctx.building_slug,
      offer_amount:  amount,
      message:       message,
    });

    if (result.error) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send to agent →';
      msgEl.innerHTML = '<div class="cm-om-msg is-error">' + escapeHtml('Submission failed: ' + result.error.message) + '</div>';
      return;
    }

    renderSuccess(modal, { amount, building: buildingName });
    setTimeout(close, 6000);
  });
}

function renderSuccess(modal, { amount, building }) {
  modal.innerHTML = `
    <button class="cm-om-close" aria-label="Close">×</button>
    <div class="cm-om-success">
      <div class="cm-om-success-icon">✓</div>
      <h3 id="cm-om-title">Interest registered.</h3>
      <p>Your <strong>${fmtMoney(amount)}</strong> Expression of Interest at ${escapeHtml(building)} has been submitted to your assigned agent.</p>
      <div class="cm-om-success-steps">
        <strong>What happens next:</strong>
        <br>· Within 24 hours, your assigned licensed agent contacts you to schedule a review meeting.
        <br>· The agent drafts the formal Letter of Intent and reviews it with you before any document is delivered to the owner.
        <br>· You can track status anytime in your dashboard.
      </div>
    </div>
  `;
  modal.querySelector('.cm-om-close').addEventListener('click', close);
}

// ─── Open ───────────────────────────────────────────────────────────────────

async function open(ctx = {}) {
  const backdrop = ensureModal();
  const modal = backdrop.querySelector('.cm-om');

  // Scroll lock
  document.body.style.overflow = 'hidden';
  backdrop.classList.add('is-open');

  // Auth check
  let session = null;
  try { session = await CM.getSession(); } catch (e) {}
  if (!session?.user) {
    renderGate(modal);
    return;
  }

  // Resolve listing + building details for context
  let listing = null;
  if (ctx.listing_id) {
    try { listing = await CM.getListingById(ctx.listing_id); } catch (e) {}
  }
  let building = null;
  let buildingSlug = ctx.building_slug
    || (listing && listing.building)
    || null;
  // Fall back: derive slug from URL if still missing
  if (!buildingSlug) {
    const m = window.location.pathname.match(/\/building\/([^\/]+)/);
    if (m) buildingSlug = m[1];
  }
  if (buildingSlug) {
    const buildings = await loadBuildings();
    building = buildingBySlug(buildings, buildingSlug);
  }

  await renderForm(modal, {
    listing,
    building,
    building_slug: buildingSlug,
    suggested_price: ctx.suggested_price || null,
  });
}

// ─── Trigger wiring ─────────────────────────────────────────────────────────

// Click delegation for [data-cm-offer-trigger]
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-cm-offer-trigger]');
  if (!trigger) return;
  e.preventDefault();
  open({
    listing_id:      trigger.dataset.listingId || null,
    building_slug:   trigger.dataset.buildingSlug || null,
    suggested_price: trigger.dataset.suggestedPrice ? Number(trigger.dataset.suggestedPrice) : null,
  });
});

// Custom event API for JS-driven opens
window.addEventListener('cm:open-offer-modal', (e) => {
  open(e.detail || {});
});
