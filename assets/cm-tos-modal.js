/**
 * cm-tos-modal.js — Combined "How It Works" + Terms of Service modal
 *
 * Two modes:
 *   - mode: 'accept' — checkbox + Accept button; cannot be dismissed.
 *                      Used at signup and on first dashboard load when
 *                      profile.tos_accepted_at is null.
 *   - mode: 'info'   — no checkbox; used when the user clicks the
 *                      "How It Works" link to re-read the terms.
 *
 * On accept, calls CM.acceptTos(version) which updates the profile row.
 * After success, calls onAccept callback (or just closes if mode=info).
 */

import { CM } from '/assets/cm-supabase.js';

export const TOS_VERSION = '1.0';

const STYLE_ID = 'cm-tos-styles';
const STYLE_CSS = `
  .cm-tos-backdrop {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(15, 19, 29, 0.92);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px; overflow-y: auto;
    animation: cm-tos-fade-in 200ms ease;
  }
  @keyframes cm-tos-fade-in { from { opacity: 0; } to { opacity: 1; } }
  .cm-tos-card {
    background: var(--cm-navy-deep, #0f131d);
    border: 1px solid var(--cm-rule, rgba(232,227,216,0.14));
    border-radius: 14px;
    max-width: 720px;
    width: 100%;
    max-height: calc(100vh - 48px);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .cm-tos-head {
    padding: 28px 32px 20px;
    border-bottom: 1px solid var(--cm-rule);
    flex-shrink: 0;
  }
  .cm-tos-eyebrow {
    display: inline-block; font-family: var(--cm-ff-mono, 'JetBrains Mono', monospace);
    font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--cm-bronze, #d4a574);
    padding: 4px 11px; border: 1px solid rgba(212,165,116,0.34);
    border-radius: 999px; margin-bottom: 14px;
  }
  .cm-tos-card h2 {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: clamp(24px, 3.5vw, 32px); line-height: 1.15;
    color: var(--cm-ivory, #e8e3d8); margin-bottom: 6px;
  }
  .cm-tos-card h2 em { color: var(--cm-peri, #9fb4d8); }
  .cm-tos-sub {
    color: var(--cm-ivory-dim, rgba(232,227,216,0.62));
    font-size: 13px; line-height: 1.55;
  }
  .cm-tos-body {
    padding: 24px 32px;
    overflow-y: auto;
    flex: 1;
    color: var(--cm-ivory);
  }
  .cm-tos-section {
    margin-bottom: 28px;
  }
  .cm-tos-section h3 {
    font-family: var(--cm-ff-display);
    font-style: italic;
    font-size: 20px;
    color: var(--cm-ivory);
    margin-bottom: 8px;
  }
  .cm-tos-section h4 {
    font-family: var(--cm-ff-mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--cm-peri);
    margin: 14px 0 6px;
  }
  .cm-tos-section p,
  .cm-tos-section li {
    font-size: 14px; line-height: 1.65;
    color: var(--cm-ivory-dim);
    margin-bottom: 10px;
  }
  .cm-tos-section strong { color: var(--cm-ivory); }
  .cm-tos-section em { color: var(--cm-bronze); font-style: italic; }
  .cm-tos-section ul { padding-left: 20px; margin-bottom: 12px; }
  .cm-tos-section li { margin-bottom: 4px; }
  .cm-tos-section .step-list {
    list-style: none; padding: 0;
    counter-reset: step-counter;
  }
  .cm-tos-section .step-list li {
    counter-increment: step-counter;
    padding-left: 36px; position: relative; margin-bottom: 12px;
  }
  .cm-tos-section .step-list li::before {
    content: counter(step-counter);
    position: absolute; left: 0; top: 0;
    width: 24px; height: 24px;
    background: rgba(212, 165, 116, 0.12);
    border: 1px solid rgba(212, 165, 116, 0.4);
    color: var(--cm-bronze);
    border-radius: 50%;
    font-family: var(--cm-ff-mono); font-size: 11px;
    display: flex; align-items: center; justify-content: center;
  }
  .cm-tos-callout {
    background: rgba(159, 180, 216, 0.06);
    border-left: 3px solid var(--cm-peri);
    padding: 14px 18px; border-radius: 6px;
    margin: 14px 0;
  }
  .cm-tos-callout-warn {
    background: rgba(212, 165, 116, 0.06);
    border-left-color: var(--cm-bronze);
  }
  .cm-tos-tos-content {
    background: rgba(232, 227, 216, 0.03);
    border: 1px solid var(--cm-rule);
    border-radius: 8px;
    padding: 18px 22px;
    font-size: 13px; line-height: 1.6;
    color: var(--cm-ivory-dim);
  }
  .cm-tos-tos-content h3 {
    font-family: var(--cm-ff-display); font-style: italic;
    font-size: 16px; margin: 14px 0 6px; color: var(--cm-ivory);
  }
  .cm-tos-tos-content h3:first-child { margin-top: 0; }
  .cm-tos-tos-content p { margin-bottom: 8px; }

  .cm-tos-foot {
    padding: 18px 32px 24px;
    border-top: 1px solid var(--cm-rule);
    flex-shrink: 0;
    background: rgba(232, 227, 216, 0.02);
  }
  .cm-tos-checkbox-row {
    display: flex; gap: 12px; align-items: flex-start;
    cursor: pointer; padding: 8px 0; margin-bottom: 14px;
  }
  .cm-tos-checkbox-row input[type="checkbox"] {
    width: 18px; height: 18px; flex-shrink: 0;
    accent-color: var(--cm-peri);
    margin-top: 2px;
    cursor: pointer;
  }
  .cm-tos-checkbox-label {
    font-size: 13px; line-height: 1.5;
    color: var(--cm-ivory);
  }
  .cm-tos-actions {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  }
  .cm-tos-btn {
    padding: 12px 22px; border-radius: 999px;
    font-family: var(--cm-ff-body, 'DM Sans', sans-serif);
    font-size: 14px; font-weight: 500; cursor: pointer;
    border: 1px solid; transition: all 150ms ease;
  }
  .cm-tos-btn-primary {
    background: var(--cm-peri); color: var(--cm-navy, #1a1f2e);
    border-color: var(--cm-peri);
  }
  .cm-tos-btn-primary:hover:not(:disabled) {
    background: var(--cm-ivory); border-color: var(--cm-ivory);
  }
  .cm-tos-btn-primary:disabled {
    opacity: 0.4; cursor: not-allowed;
  }
  .cm-tos-btn-secondary {
    background: transparent; color: var(--cm-ivory);
    border-color: var(--cm-rule);
  }
  .cm-tos-btn-secondary:hover {
    border-color: var(--cm-ivory);
  }
  .cm-tos-error {
    color: var(--cm-loss, #c97865);
    font-size: 13px; margin-top: 8px;
  }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = STYLE_CSS;
  document.head.appendChild(s);
}

// ─── Content ────────────────────────────────────────────────────────────────
const HOW_IT_WORKS_CONTENT = `
  <div class="cm-tos-section">
    <h3>What you're seeing</h3>
    <p>A buyer just drafted and signed a <strong>Letter of Intent</strong> (LOI) on your unit. Each LOI includes a specific price, the buyer's verified name and contact, and an optional message with terms or context.</p>
  </div>

  <div class="cm-tos-section">
    <h3>The LOI is non-binding</h3>
    <p>An LOI is <em>not a contract</em>. It's a serious, signed expression of intent — enough to demonstrate that the buyer is real and ready to transact, but flexible enough that either party can walk away before a binding purchase agreement is signed.</p>
    <p>Think of it as the verified-buyer equivalent of a strong, written first offer.</p>
  </div>

  <div class="cm-tos-section">
    <h3>You have three choices</h3>

    <h4>Accept</h4>
    <p>Agree to the buyer's price and start the formal process. Within 24 hours, Tim McMullen of McMullen Properties at Compass (DRE #02016832) reaches out to coordinate the conversion of the LOI into an <strong>SFAR Residential Purchase Agreement</strong> — the binding contract that legally documents the sale. Standard escrow opens within 3 business days of the RPA being signed.</p>

    <h4>Negotiate</h4>
    <p>Counter the buyer's price or terms. The buyer receives your counter and can accept, decline, or counter back. Multiple rounds are common.</p>
    <div class="cm-tos-callout">
      <strong>Note:</strong> The in-dashboard counter-offer UI is launching shortly. Until then: reply directly to your offer-received email and Tim will relay your counter to the buyer. The same email Cc's Tim by default.
    </div>

    <h4>Decline</h4>
    <p>Pass on this offer. The buyer is notified and your make-me-move number stays live. Other buyers can still submit LOIs at the same price.</p>
  </div>

  <div class="cm-tos-section">
    <h3>From "yes" to closed</h3>
    <p>Once a price is agreed upon, the platform's role transitions to introduction and handoff. The licensed agent assigned to the transaction takes over:</p>
    <ol class="step-list">
      <li>Drafts the SFAR Residential Purchase Agreement (the binding contract).</li>
      <li>Both parties sign through standard channels (DocuSign or wet ink).</li>
      <li>Earnest money is wired to escrow per the RPA terms.</li>
      <li>Inspection, financing contingency, and final walkthrough proceed on the standard 30–45 day calendar.</li>
      <li>Final closing — keys exchange, funds disburse, deed records.</li>
    </ol>
  </div>

  <div class="cm-tos-section">
    <h3>What Condo Market is — and isn't</h3>
    <div class="cm-tos-callout cm-tos-callout-warn">
      <p style="margin-bottom: 8px;"><strong>Condo Market SF is a marketing and lead-generation platform.</strong> It is not a licensed brokerage, and no real estate transactions occur on the platform itself.</p>
      <p style="margin-bottom: 0;">All actual transactions are handled by licensed real estate agents. By using this platform, you agree to use the agent designated by the platform — typically Tim McMullen — to handle any transaction that originates here.</p>
    </div>
  </div>
`;

const TOS_LEGAL_CONTENT = `
  <div class="cm-tos-tos-content">
    <h3>1. About this platform</h3>
    <p>Condo Market SF (the "Platform") is a marketing and lead-generation service operated by Tim McMullen ("Operator," CA DRE #02016832) of McMullen Properties at Compass. The Platform connects San Francisco condominium owners with verified prospective buyers who submit non-binding Letters of Intent ("LOIs"). <strong>The Platform is not a real estate brokerage.</strong> No real estate transactions occur on the Platform itself.</p>

    <h3>2. Letters of Intent</h3>
    <p>LOIs submitted through the Platform are non-binding written, signed expressions of intent to purchase. An LOI demonstrates a buyer's serious interest at a specific price but does not constitute a contract or any obligation to transact. Owners may accept, decline, or negotiate any LOI. Acceptance of an LOI is itself non-binding; the parties must subsequently execute a binding purchase agreement (typically the SFAR Residential Purchase Agreement) through licensed agents to consummate a sale.</p>

    <h3>3. Required use of platform-provided agent</h3>
    <p>If an LOI on the Platform results in an agreed-upon price (whether through acceptance or negotiation), <strong>the parties agree to use the licensed real estate agent designated by the Platform</strong> — typically Tim McMullen of McMullen Properties at Compass — to handle the resulting transaction. The Platform's revenue model depends on agent commissions on completed transactions originated here. Users who circumvent this requirement may be liable to the Operator for damages equal to the standard commission that would have been earned (typically 2.5% of sale price).</p>

    <h3>4. Contract conversion</h3>
    <p>Once a buyer and seller agree on price, the designated licensed agent drafts the SFAR Residential Purchase Agreement (RPA) — the binding contract documenting the sale. Both parties sign the RPA through standard channels. Earnest money is deposited in escrow per the RPA terms. The transaction proceeds through standard escrow, inspection, financing, and closing. The Platform itself does not draft, store, or facilitate signatures on the RPA.</p>

    <h3>5. Make-me-move pricing</h3>
    <p>Owners on the Platform set a "make-me-move number" — the price at which they would genuinely sell. This number is shown only to verified buyers signed into the Platform. It is not a list price, not an MLS listing, and not a public-facing sale. Setting a make-me-move number does not constitute listing the property. The owner may pause, edit, or remove the number at any time.</p>

    <h3>6. Verification</h3>
    <p>Both buyers and sellers undergo basic identity verification. The Platform reserves the right to request additional verification (including agent license verification for buyer's agents) before LOIs are exchanged.</p>

    <h3>7. Limitations on Platform liability</h3>
    <p>The Platform is not liable for: failed transactions, including those that fall through after an LOI is accepted; disputes between buyer and seller; errors in property data, photos, or descriptions provided by owners; or tax, legal, or financial advice. <strong>The Platform does not provide legal, tax, or financial advice.</strong> Users should consult their own attorneys, tax advisors, and financial professionals.</p>

    <h3>8. Privacy</h3>
    <p>Make-me-move numbers, listings, and offer history are visible only to verified members signed into the Platform. The Platform does not publish, sell, or share this data with third parties except as required by law or as necessary to facilitate a transaction with the designated agent.</p>

    <h3>9. Acceptable use</h3>
    <p>Users agree not to: submit fraudulent LOIs or offers; misrepresent property ownership or buyer financing; use the Platform to circumvent the designated-agent requirement (Section 3); or scrape, redistribute, or resell Platform data.</p>

    <h3>10. Changes to these Terms</h3>
    <p>The Platform may update these Terms with reasonable notice. Material changes will require renewed acceptance.</p>

    <h3>11. Contact</h3>
    <p>Tim McMullen, McMullen Properties at Compass · DRE #02016832 · tim@mcmullen.properties</p>

    <p style="margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(232,227,216,0.1); font-size: 11px; color: rgba(232,227,216,0.4); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.04em;">Version ${TOS_VERSION} · Last updated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  </div>
`;

// ─── Render ─────────────────────────────────────────────────────────────────
function renderModal(mode) {
  const isAccept = mode === 'accept';
  const eyebrow = isAccept ? 'Welcome · Please review' : 'How it works · Terms of Service';
  const headline = isAccept
    ? `One quick <em>read</em>.`
    : `How it <em>works</em>.`;
  const sub = isAccept
    ? 'Before you continue, take a moment to understand how the platform works and how your data is handled.'
    : 'Reference for how LOIs, negotiation, and contract conversion work on Condo Market SF.';

  const footHtml = isAccept
    ? `
      <label class="cm-tos-checkbox-row">
        <input type="checkbox" id="cm-tos-accept-cb">
        <span class="cm-tos-checkbox-label">
          I have read and agree to the <strong>Terms of Service</strong>, and I understand that Condo Market SF is a marketing platform — not a licensed brokerage — and that any transaction originating here will be handled by the licensed agent designated by the platform.
        </span>
      </label>
      <div class="cm-tos-actions">
        <button type="button" class="cm-tos-btn cm-tos-btn-primary" id="cm-tos-accept-btn" disabled>I accept</button>
        <div id="cm-tos-error"></div>
      </div>
    `
    : `
      <div class="cm-tos-actions">
        <button type="button" class="cm-tos-btn cm-tos-btn-secondary" data-action="close">Got it</button>
      </div>
    `;

  return `
    <div class="cm-tos-backdrop" id="cm-tos-modal-root">
      <div class="cm-tos-card" role="dialog" aria-labelledby="cm-tos-h2" aria-modal="true">
        <div class="cm-tos-head">
          <span class="cm-tos-eyebrow">${eyebrow}</span>
          <h2 id="cm-tos-h2">${headline}</h2>
          <p class="cm-tos-sub">${sub}</p>
        </div>
        <div class="cm-tos-body">
          ${HOW_IT_WORKS_CONTENT}
          <div class="cm-tos-section">
            <h3>Terms of Service</h3>
            ${TOS_LEGAL_CONTENT}
          </div>
        </div>
        <div class="cm-tos-foot">
          ${footHtml}
        </div>
      </div>
    </div>
  `;
}

// ─── Public API ─────────────────────────────────────────────────────────────
let _activeRoot = null;

/**
 * Open the TOS modal.
 * @param {Object} opts
 * @param {'accept'|'info'} [opts.mode='info']
 * @param {Function} [opts.onAccept] - called after successful TOS save
 * @param {Function} [opts.onClose]  - called when user dismisses (info mode)
 */
export function openTosModal(opts = {}) {
  ensureStyles();
  const mode = opts.mode || 'info';

  // Avoid stacking
  if (_activeRoot) {
    _activeRoot.remove();
    _activeRoot = null;
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = renderModal(mode);
  const root = wrap.firstElementChild;
  document.body.appendChild(root);
  _activeRoot = root;
  document.body.style.overflow = 'hidden';

  function close() {
    root.remove();
    document.body.style.overflow = '';
    _activeRoot = null;
    if (opts.onClose) opts.onClose();
  }

  if (mode === 'info') {
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="close"]')) close();
      // Click on backdrop also closes (info mode only)
      if (e.target === root) close();
    });
    return;
  }

  // ─── Accept mode ──────────────────────────────────────────────────────────
  const cb       = root.querySelector('#cm-tos-accept-cb');
  const btn      = root.querySelector('#cm-tos-accept-btn');
  const errorEl  = root.querySelector('#cm-tos-error');

  cb.addEventListener('change', () => {
    btn.disabled = !cb.checked;
  });

  btn.addEventListener('click', async () => {
    if (!cb.checked) return;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    errorEl.innerHTML = '';
    const result = await CM.acceptTos(TOS_VERSION);
    if (result.error) {
      errorEl.innerHTML = `<span class="cm-tos-error">Could not save your acceptance: ${escapeHtml(result.error.message || 'unknown error')}. Please try again.</span>`;
      btn.disabled = false;
      btn.textContent = 'I accept';
      return;
    }
    document.body.style.overflow = '';
    root.remove();
    _activeRoot = null;
    if (opts.onAccept) opts.onAccept();
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/**
 * Returns true if the given profile has accepted the current TOS version.
 * Pass the profile row from CM.getMyProfile().
 */
export function hasAcceptedCurrentTos(profile) {
  if (!profile) return false;
  if (!profile.tos_accepted_at) return false;
  return profile.tos_version === TOS_VERSION;
}
