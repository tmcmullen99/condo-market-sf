/**
 * cm-tos-modal.js — Combined "How It Works" + Terms of Service modal
 *
 * Two modes:
 *   - mode: 'accept' — checkbox + Accept button; cannot be dismissed.
 *                      Used at signup and on first dashboard load when
 *                      profile.tos_accepted_at is null OR profile.tos_version
 *                      does not match TOS_VERSION.
 *   - mode: 'info'   — no checkbox; used when the user clicks the
 *                      "How It Works" link to re-read the terms.
 *
 * On accept, calls CM.acceptTos(version) which updates the profile row.
 * After success, calls onAccept callback (or just closes if mode=info).
 *
 * v2.0 (2026-05-10): full TOS rewrite for the lead-generation marketplace
 * positioning. Platform is now explicitly framed as owned/operated by
 * McMullen Properties (CA DRE #02016832), NOT itself a brokerage. All
 * Platform interactions are PRESUMPTIVE signals routed through the
 * designated licensed agent for actual real estate activity. EOI vs LOI
 * distinction made explicit. Tim's name removed from user-facing
 * How-It-Works copy (DRE# remains in legal sections only).
 *
 * Bumping TOS_VERSION from '1.0' to '2.0' forces all existing users to
 * re-accept on next dashboard visit — by design.
 */

import { CM } from '/assets/cm-supabase.js';

export const TOS_VERSION = '2.0';
const TOS_LAST_UPDATED = 'May 10, 2026';

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

// ─── How It Works (user-facing, plain English) ──────────────────────────────
// Note: Tim's name does NOT appear here per the lead-gen marketplace positioning.
// The operator (McMullen Properties + DRE#) is disclosed in the Terms below.
const HOW_IT_WORKS_CONTENT = `
  <div class="cm-tos-section">
    <h3>What you're seeing</h3>
    <p>A platform member has submitted an <strong>Expression of Interest</strong> on your unit. An Expression of Interest (EOI) is a privately-submitted indication that the member would seriously consider purchasing at a specific price. It includes the member's name, contact, and any context they chose to share.</p>
    <p>An EOI is <em>not</em> a Letter of Intent. It is not a contract. It is not a binding offer. It is a presumptive signal — and an invitation for a licensed real estate agent to engage with both parties to handle the actual transaction.</p>
  </div>

  <div class="cm-tos-section">
    <h3>How Condo Market works</h3>
    <p>Condo Market is a marketing and lead-generation platform. The Platform itself does not negotiate, draft documents, or facilitate the actual real estate transaction. Every Platform interaction — submitting an EOI, signaling acceptance, signaling counter-interest, signaling pass — is a presumptive signal that the Platform routes to a licensed California real estate agent.</p>
    <p>The licensed agent then performs all the actual real estate work: contacting the parties, drafting the formal Letter of Intent (LOI), reviewing it with each party, presenting it for signature, and drafting the SFAR Residential Purchase Agreement if the LOI is accepted.</p>
  </div>

  <div class="cm-tos-section">
    <h3>Your three options — all presumptive</h3>

    <h4>Express acceptance</h4>
    <p>Signal that you would proceed with this EOI at the buyer's price. Your assigned licensed agent contacts both you and the buyer to schedule the formal LOI drafting and review meeting. Within 24 hours of your signal, you'll have a call scheduled to walk through the document. If both parties sign the LOI, the agent then drafts the SFAR Residential Purchase Agreement and standard escrow follows.</p>

    <h4>Express counter-interest</h4>
    <p>Signal that you would accept the deal at a different price. Your assigned agent receives your counter-price and communicates it to the buyer's side through licensed channels. The buyer can then express acceptance, decline, or counter back — all routed through your agent. <strong>Negotiation happens between licensed professionals, not directly between you and the buyer.</strong></p>

    <h4>Pass</h4>
    <p>Signal that you'd like to decline this EOI. The buyer is notified through your agent. Your make-me-move price stays active for any other interested members.</p>
  </div>

  <div class="cm-tos-section">
    <h3>From signal to closing</h3>
    <p>Once both parties have signaled mutual acceptance through the Platform, the licensed agent takes over completely:</p>
    <ol class="step-list">
      <li>Schedules a meeting with each party to review the prospective Letter of Intent.</li>
      <li>Drafts the actual Letter of Intent (legal document).</li>
      <li>Both parties sign the LOI through standard channels (DocuSign or wet ink).</li>
      <li>If the LOI is accepted, the agent drafts the SFAR Residential Purchase Agreement — the binding sale contract.</li>
      <li>Earnest money is wired to escrow per the RPA terms.</li>
      <li>Inspection, financing contingency, and final walkthrough proceed on the standard 30–45 day calendar.</li>
      <li>Final closing — keys exchange, funds disburse, deed records.</li>
    </ol>
    <p>Throughout this process, Condo Market itself does not draft, sign, or deliver any real estate documents, and does not accept any compensation derived from the transaction.</p>
  </div>

  <div class="cm-tos-section">
    <h3>What Condo Market is — and isn't</h3>
    <div class="cm-tos-callout cm-tos-callout-warn">
      <p style="margin-bottom: 8px;"><strong>Condo Market SF is a marketing and lead-generation platform owned and operated by McMullen Properties (CA DRE #02016832).</strong> It is not itself a real estate brokerage. The Platform does not perform real estate brokerage activity, does not facilitate real estate transactions on its own, and does not accept compensation derived from real estate transactions.</p>
      <p style="margin-bottom: 0;">All licensed real estate activity arising from Platform interactions is performed by licensed California real estate agents who acquire qualifying introductions through the Platform's lead-acquisition program. Our designated agents charge a 3% flat commission for Condo Market platform-generated transactions; this commission is paid to the agent, not to the Platform.</p>
    </div>
  </div>
`;

// ─── Terms of Service (legal language) ──────────────────────────────────────
const TOS_LEGAL_CONTENT = `
  <div class="cm-tos-tos-content">
    <h3>1. About this platform</h3>
    <p>Condo Market SF (the "Platform") is a marketing and lead-generation service <strong>owned and operated by McMullen Properties</strong> ("Operator," CA DRE #02016832). The Platform connects San Francisco condominium owners with platform members who submit Expressions of Interest (defined below). <strong>The Platform is not a real estate brokerage and does not perform real estate brokerage activity.</strong> All license-required real estate activity arising from Platform interactions is performed by licensed California real estate agents who have acquired the introduction through the Platform's lead-acquisition program.</p>

    <h3>2. Expressions of Interest are presumptive, not transactional</h3>
    <p>When a Platform member indicates buying interest in a property by selecting a price and submitting through the Platform's "Express Interest" feature, that submission is an <strong>Expression of Interest</strong> ("EOI"). An EOI is not a Letter of Intent. An EOI is not a contract. An EOI is not a binding offer or a legally enforceable obligation to transact. An EOI is a presumptive signal: it indicates the member would seriously consider purchasing at the stated price and authorizes the Platform to introduce the member to a licensed California real estate agent.</p>

    <p>Similarly, owner responses to an EOI — "Express acceptance," "Express counter-interest," or "Pass" — are presumptive signals only. They are not binding acceptances, counter-offers, or rejections. They authorize the Platform's designated agent to communicate the indicated position to the relevant party through licensed channels.</p>

    <p>The Platform itself does not draft, store, sign, deliver, or otherwise facilitate Letters of Intent, Purchase Agreements, or any other documents requiring a California real estate license. All such activity is performed by licensed agents off-platform.</p>

    <h3>3. Required use of designated agent — anti-circumvention</h3>
    <p>The Platform introduces qualifying members (those who have submitted an EOI, set a make-me-move price, signaled acceptance/counter-interest/pass on an EOI, or otherwise engaged a transactional feature) to a licensed California real estate agent who has acquired the introduction through the Platform's lead-acquisition program. <strong>The current designated agent on all Platform-originated introductions is Tim McMullen, CA DRE #02016832, of McMullen Properties (CA DRE #02016832).</strong></p>

    <p>By using the Platform's transactional features (Express Interest, Make-Me-Move, presumptive responses, or similar), the user agrees that <strong>any real estate transaction substantially originating from a Platform interaction will be coordinated by the licensed agent designated by the Platform.</strong></p>

    <p>Users who circumvent this requirement — by transacting directly with a counterparty introduced through the Platform without using the designated agent — may be liable to McMullen Properties for <strong>liquidated damages equal to 2.5% of the gross transaction price</strong> (the standard commission a designated agent would have earned). This obligation applies to any transaction commenced within <strong>12 months</strong> of the user's last meaningful Platform interaction (an EOI submission, accepted MMM offer, scheduled review meeting, or similar). This provision exists because the Platform invests substantially in identifying, qualifying, and introducing buyers and sellers; that investment is recovered solely through commissions paid by participating agents on completed transactions.</p>

    <h3>4. Transaction conversion happens off-platform</h3>
    <p>If both parties signal mutual acceptance through the Platform, the licensed agent takes over completely. The agent — not the Platform — drafts the formal Letter of Intent, reviews it with each party, presents it for signature, and (if accepted) drafts the SFAR Residential Purchase Agreement. Earnest money is deposited in escrow per the RPA terms. The transaction proceeds through standard escrow, inspection, financing, and closing. The Platform itself does not handle any of these activities and does not accept any compensation derived from the transaction.</p>

    <h3>5. Make-me-move pricing</h3>
    <p>Owners on the Platform may set a "make-me-move number" — the price at which they would seriously consider selling. This number is visible only to platform members signed into the Platform. It is not a list price, not an MLS listing, and not a public-facing sale. Setting a make-me-move number does not constitute listing the property and creates no obligation to sell. The owner may pause, edit, or remove the number at any time. If a Platform member submits an EOI at or near the make-me-move number, the owner is notified by email and may signal acceptance, counter-interest, or pass — all subject to Section 2.</p>

    <h3>6. Identity verification</h3>
    <p>Both prospective buyers and sellers undergo basic identity verification through standard account creation. The Platform may request additional verification (proof of funds, agent license confirmation for any participating buyer's agent, etc.) before introductions are made.</p>

    <h3>7. Platform compensation model</h3>
    <p>The Platform's revenue is derived solely from <strong>lead-acquisition fees paid by participating licensed agents</strong> — not from per-transaction commissions or fees derived from real estate transactions. Our designated agents charge a 3% flat commission for Condo Market platform-generated transactions; this commission is paid to the designated agent (currently McMullen Properties, CA DRE #02016832), not to the Platform. The Platform does not collect, hold, or distribute funds related to real estate transactions.</p>

    <h3>8. Limitations on Platform liability</h3>
    <p>The Platform is not liable for: failed transactions, including those that fall through after both parties signal acceptance; disputes between buyer and seller; errors in property data, photos, or descriptions provided by owners; or tax, legal, or financial advice. <strong>The Platform does not provide legal, tax, or financial advice.</strong> Users should consult their own attorneys, tax advisors, and financial professionals before signing any real estate document.</p>

    <h3>9. Privacy</h3>
    <p>Make-me-move numbers, EOIs, and member interactions are visible only to platform members signed into their own dashboard and to the licensed agent designated by the Platform. The Platform does not publish, sell, or share this data with third parties except as required by law or as necessary to facilitate an introduction with the designated agent.</p>

    <h3>10. Acceptable use</h3>
    <p>Users agree not to: submit fraudulent EOIs or signals; misrepresent property ownership; use the Platform to circumvent the designated-agent requirement (Section 3); or scrape, redistribute, or resell Platform data.</p>

    <h3>11. Changes to these Terms</h3>
    <p>The Platform may update these Terms with reasonable notice. Material changes will require renewed acceptance.</p>

    <h3>12. Contact</h3>
    <p>Operator: McMullen Properties, CA DRE #02016832 · hello@sanfranciscocondomarket.com</p>

    <p style="margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(232,227,216,0.1); font-size: 11px; color: rgba(232,227,216,0.4); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.04em;">Version ${TOS_VERSION} · Last updated ${TOS_LAST_UPDATED}</p>
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
    : 'Reference for how Expressions of Interest, presumptive signaling, and licensed-agent handoff work on Condo Market SF.';

  const footHtml = isAccept
    ? `
      <label class="cm-tos-checkbox-row">
        <input type="checkbox" id="cm-tos-accept-cb">
        <span class="cm-tos-checkbox-label">
          I have read and agree to the <strong>Terms of Service</strong>. I understand that Condo Market SF is a marketing and lead-generation platform owned and operated by <strong>McMullen Properties (CA DRE #02016832)</strong>, that the Platform itself is not a real estate brokerage and does not facilitate real estate transactions, and that any transaction substantially originating from a Platform interaction will be coordinated by the licensed agent designated by the Platform.
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
