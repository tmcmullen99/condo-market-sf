/**
 * cm-offer-modal.js — Express Interest submission modal (v3.0)
 *
 * v3.0 (2026-05-29): building context card + RPC-backed building lookup
 *   - Replaces brittle `/assets/buildings.json` lookup (often misses SV
 *     buildings; was the root cause of "Generic interest in
 *     santa-clara-hampton-place" instead of "Hampton Place" copy) with a
 *     direct call to the `building_market_brief` Supabase RPC.
 *   - Adds calibration context: 12-mo median sale price, median $/ft²,
 *     $/ft² range, sales count, avg unit size.
 *   - Computes "your offer in context" line as the slider moves: multiple of
 *     building median + implied $/ft² (using avg_sqft) + delta vs median $/ft².
 *   - Accepts ctx.unit_label for unit-specific opens (cm-dossier wiring in a
 *     follow-up); prefixes "Unit X · " to the message body before submit so
 *     the unit context survives even without offers.unit_label being set.
 *
 * v2.0 (2026-05-10): full rename to "Express Interest" terminology
 *   - Submissions are EOIs (Expressions of Interest), NOT Letters of Intent
 *   - Cert checkbox gates submit
 *   - Success copy reflects agent handoff
 *
 * Auto-mounts a singleton modal on document.body. Opens via two paths:
 *   1. Click on any [data-cm-offer-trigger] (reads data-listing-id,
 *      data-building-slug, data-suggested-price, data-unit-label)
 *   2. window.dispatchEvent('cm:open-offer-modal', { detail: {...} })
 */

import { CM } from '/assets/cm-supabase.js';

const STYLE_ID = 'cm-offer-modal-styles';

const SUPABASE_URL  = 'https://kfqphwerygccpzntbbif.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

const STYLE_CSS = `
  .cm-om-backdrop {
    position: fixed; inset: 0;
    background: rgba(15, 19, 29, 0.86);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    z-index: 200;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    opacity: 0; transition: opacity 220ms ease;
    pointer-events: none;
  }
  .cm-om-backdrop.is-open { opacity: 1; pointer-events: auto; }

  .cm-om {
    position: relative;
    background: var(--cm-navy-deep, #0f131d);
    border: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.16));
    border-radius: 16px;
    width: 100%; max-width: 560px;
    max-height: 90vh; overflow-y: auto;
    padding: 36px 32px 28px;
    transform: translateY(20px) scale(0.98);
    transition: transform 280ms cubic-bezier(.2,.7,.2,1);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }
  .cm-om-backdrop.is-open .cm-om { transform: translateY(0) scale(1); }

  .cm-om-close {
    position: absolute; top: 16px; right: 16px;
    background: transparent; border: none;
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    font-size: 22px; cursor: pointer;
    width: 32px; height: 32px; border-radius: 50%;
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
    font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
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
  .cm-om h2 em { font-style: italic; color: var(--cm-peri, #9fb4d8); }
  .cm-om-sub {
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    font-size: 14px; line-height: 1.55;
    margin-bottom: 22px;
  }

  /* v3.0 — Building context card */
  .cm-om-bctx {
    background: rgba(159, 180, 216, 0.06);
    border: 1px solid rgba(159, 180, 216, 0.22);
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 22px;
  }
  .cm-om-bctx-head {
    display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--cm-peri, #9fb4d8);
    margin-bottom: 10px;
  }
  .cm-om-bctx-head-r { color: rgba(232, 227, 216, 0.45); font-weight: 400; }
  .cm-om-bctx-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 18px;
  }
  .cm-om-bctx-cell {
    display: flex; flex-direction: column; gap: 2px;
  }
  .cm-om-bctx-lab {
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase;
    color: rgba(232, 227, 216, 0.45);
  }
  .cm-om-bctx-val {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 600;
    font-size: 19px;
    color: var(--cm-ivory, #e8e3d8);
    line-height: 1.1;
  }
  .cm-om-bctx-val-sub {
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-style: normal; font-weight: 400;
    font-size: 10px; letter-spacing: 0.04em;
    color: rgba(232, 227, 216, 0.55);
    margin-left: 4px;
  }
  .cm-om-bctx-empty {
    font-size: 12px; line-height: 1.55;
    color: rgba(232, 227, 216, 0.45);
    font-style: italic;
  }

  /* Listing anchor (MMM match button) — only when listing prop present */
  .cm-om-anchor {
    display: flex; align-items: center; justify-content: space-between;
    gap: 14px;
    background: rgba(212, 165, 116, 0.06);
    border: 1px solid rgba(212, 165, 116, 0.24);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 22px;
    flex-wrap: wrap;
  }
  .cm-om-anchor-thumb {
    flex-shrink: 0; width: 56px; height: 56px;
    border-radius: 8px; overflow: hidden;
    background: rgba(232, 227, 216, 0.06);
  }
  .cm-om-anchor-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cm-om-anchor-label {
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--cm-bronze, #d4a574);
  }
  .cm-om-anchor-price {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 600;
    font-size: 22px;
    color: var(--cm-bronze, #d4a574);
    line-height: 1; flex: 1;
  }
  .cm-om-match-btn {
    background: rgba(212, 165, 116, 0.15);
    color: var(--cm-bronze, #d4a574);
    border: 1px solid rgba(212, 165, 116, 0.4);
    padding: 8px 14px; border-radius: 999px;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    cursor: pointer; transition: all 150ms ease;
  }
  .cm-om-match-btn:hover {
    background: var(--cm-bronze, #d4a574);
    color: var(--cm-navy, #1a1f2e);
  }

  .cm-om-field { margin-bottom: 14px; }
  .cm-om-field label {
    display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    margin-bottom: 8px;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--cm-peri, #9fb4d8);
  }
  .cm-om-field-display {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 600;
    font-size: 28px; color: var(--cm-bronze, #d4a574);
    line-height: 1; text-transform: none; letter-spacing: 0;
  }
  .cm-om-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px;
    background: var(--cm-rule, rgba(232, 227, 216, 0.16));
    border-radius: 2px; outline: none; cursor: pointer;
    margin: 8px 0;
  }
  .cm-om-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 22px; height: 22px;
    background: var(--cm-bronze, #d4a574);
    border-radius: 50%; cursor: grab;
    border: 2px solid var(--cm-navy-deep, #0f131d);
  }
  .cm-om-slider::-moz-range-thumb {
    width: 22px; height: 22px;
    background: var(--cm-bronze, #d4a574);
    border-radius: 50%; cursor: grab;
    border: 2px solid var(--cm-navy-deep, #0f131d);
  }
  /* v3.0 — Offer-in-context line below slider */
  .cm-om-calib {
    font-family: var(--cm-ff-body, 'DM Sans', system-ui, sans-serif);
    font-size: 12px; line-height: 1.5;
    color: rgba(232, 227, 216, 0.62);
    margin-top: 4px;
    padding: 8px 12px;
    background: rgba(15, 19, 29, 0.4);
    border-left: 2px solid rgba(212, 165, 116, 0.5);
    border-radius: 0 6px 6px 0;
  }
  .cm-om-calib b { color: var(--cm-bronze, #d4a574); font-weight: 600; }
  .cm-om-calib .cm-om-calib-up   { color: #c97865; }
  .cm-om-calib .cm-om-calib-down { color: #8fb97a; }
  .cm-om-calib-empty {
    color: rgba(232, 227, 216, 0.36); font-style: italic;
    border-left-color: rgba(232, 227, 216, 0.12);
  }

  .cm-om-textarea {
    width: 100%;
    background: var(--cm-navy, #1a1f2e);
    border: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.16));
    border-radius: 8px;
    padding: 12px 14px;
    color: var(--cm-ivory, #e8e3d8);
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-size: 14px; line-height: 1.5;
    resize: vertical; min-height: 76px;
    transition: border-color 150ms ease;
  }
  .cm-om-textarea:focus { outline: none; border-color: var(--cm-peri, #9fb4d8); }
  .cm-om-textarea::placeholder { color: var(--cm-ivory-faint, rgba(232, 227, 216, 0.36)); }

  .cm-om-cert-row {
    display: flex; gap: 11px; align-items: flex-start;
    background: rgba(159, 180, 216, 0.06);
    border: 1px solid rgba(159, 180, 216, 0.2);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 18px;
    cursor: pointer;
  }
  .cm-om-cert-row input[type="checkbox"] {
    flex-shrink: 0; width: 17px; height: 17px;
    margin-top: 2px; accent-color: var(--cm-peri, #9fb4d8);
    cursor: pointer;
  }
  .cm-om-cert-label {
    font-size: 12.5px; line-height: 1.5;
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.72));
  }
  .cm-om-cert-label strong { color: var(--cm-ivory, #e8e3d8); }
  .cm-om-cert-label a {
    color: var(--cm-peri, #9fb4d8);
    text-decoration: underline; text-underline-offset: 2px;
  }

  .cm-om-submit {
    width: 100%;
    background: var(--cm-bronze, #d4a574);
    color: var(--cm-navy, #1a1f2e);
    border: none;
    padding: 14px 24px; border-radius: 10px;
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-size: 15px; font-weight: 500;
    cursor: pointer;
    transition: transform 150ms ease, background 150ms ease, opacity 150ms ease;
    margin-top: 4px;
  }
  .cm-om-submit:hover:not(:disabled) {
    background: var(--cm-ivory, #e8e3d8);
    transform: translateY(-1px);
  }
  .cm-om-submit:disabled { opacity: 0.45; cursor: not-allowed; }
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
    font-size: 13px; line-height: 1.5;
  }
  /* The sample line under each context number. */
  .cm-om-bctx-n {
    display: block; margin-top: 5px;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10.5px; letter-spacing: 0.04em;
    color: rgba(232, 227, 216, 0.42);
  }

  /* ── Phone ───────────────────────────────────────────────────────────────
     This modal had no breakpoint at all — it was rendered desktop-shaped on
     every device. On a phone that meant a 90vh box, 32px side padding, and a
     submit button below eleven stacked blocks, so the action was always off
     screen and the form read as longer than it is.

     Full-height sheet, tighter rhythm, and the submit pinned to the bottom so
     the thing the visitor came to do is never more than a thumb away. */
  @media (max-width: 560px) {
    .cm-om-backdrop { padding: 0; align-items: flex-end; }
    .cm-om {
      max-width: none; border-radius: 16px 16px 0 0;
      max-height: 94svh; max-height: 94dvh;
      padding: 26px 18px 0;
      display: flex; flex-direction: column;
    }
    .cm-om-close { top: 12px; right: 12px; }
    .cm-om h2 { font-size: 26px; }
    .cm-om-bctx { padding: 14px 14px 12px; margin-bottom: 16px; }
    .cm-om-bctx-grid { gap: 14px; }
    .cm-om-bctx-val { font-size: 26px; }

    /* Only the form scrolls, so the submit can sit still beneath it. */
    #cm-om-form {
      flex: 1; min-height: 0; overflow-y: auto;
      display: flex; flex-direction: column;
      -webkit-overflow-scrolling: touch;
      margin: 0 -18px; padding: 0 18px;
    }
    .cm-om-cert-row { font-size: 11.5px; line-height: 1.5; }
    .cm-om-submit {
      position: sticky; bottom: 0; z-index: 2;
      margin: 8px -18px 0; width: auto;
      border-radius: 0; padding: 16px 24px;
      padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 -10px 24px rgba(15, 19, 29, 0.85);
    }
  }

  .cm-om-msg.is-error {
    background: rgba(201, 120, 101, 0.1);
    border: 1px solid rgba(201, 120, 101, 0.3);
    color: var(--cm-loss, #c97865);
  }

  .cm-om-success { text-align: center; padding: 32px 0 12px; }
  .cm-om-success-icon {
    font-size: 36px; margin-bottom: 16px;
    display: inline-block;
    width: 64px; height: 64px; line-height: 64px;
    background: rgba(143, 185, 122, 0.15);
    border: 2px solid rgba(143, 185, 122, 0.5);
    border-radius: 50%;
    color: var(--cm-gain, #8fb97a);
  }
  .cm-om-success h3 {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: 24px; color: var(--cm-ivory, #e8e3d8);
    margin-bottom: 10px;
  }
  .cm-om-success p {
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    font-size: 14px; line-height: 1.55;
    max-width: 42ch; margin: 0 auto 8px;
  }
  .cm-om-success-steps {
    text-align: left;
    margin: 18px auto 0;
    max-width: 42ch;
    background: rgba(232, 227, 216, 0.03);
    border-left: 3px solid var(--cm-peri, #9fb4d8);
    padding: 14px 16px; border-radius: 6px;
    font-size: 13px; line-height: 1.55;
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
  }
  .cm-om-success-steps strong { color: var(--cm-ivory, #e8e3d8); }

  .cm-om-gate { text-align: center; padding: 12px 0; }
  .cm-om-gate h3 {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: 24px; color: var(--cm-ivory, #e8e3d8);
    margin-bottom: 12px;
  }
  .cm-om-gate p {
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    font-size: 14px; line-height: 1.55;
    margin-bottom: 22px;
    max-width: 42ch; margin-left: auto; margin-right: auto;
  }
  .cm-om-gate-cta {
    display: inline-block;
    background: var(--cm-peri, #9fb4d8);
    color: var(--cm-navy, #1a1f2e);
    padding: 12px 24px; border-radius: 999px;
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-size: 14px; font-weight: 500;
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
function fmtPpsf(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Math.round(Number(n)).toLocaleString('en-US');
}
function fmtMult(n) {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return n.toFixed(n >= 10 ? 0 : 1).replace(/\.0$/, '') + 'x';
}
function fmtPctDelta(n) {
  if (n == null || isNaN(n) || !isFinite(n)) return null;
  const sign = n >= 0 ? '+' : '−';
  const mag  = Math.abs(n).toFixed(0);
  return { sign, mag, dir: n >= 0 ? 'up' : 'down' };
}

// v3.0 — fetch building_market_brief from Supabase RPC
async function fetchBuildingBrief(slug) {
  if (!slug) return null;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/building_market_brief', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_building_slug: slug })
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/* Real unit labels for the picker.

   Unioned server-side from the sale dossier, active listings and the partial
   roster. Coverage is good but never complete - 62 of 68 at 181 Fremont, 573
   of 595 at The Beacon, and zero at a three-unit building nobody has sold in.
   The caller must keep a "not listed" escape for that reason. */
async function loadUnitOptions(slug) {
  if (!slug) return [];
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/building_unit_options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON,
                 Authorization: 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ p_building_slug: slug })
    });
    const d = await r.json();
    return (d && d.ok && Array.isArray(d.units)) ? d.units : [];
  } catch (e) {
    /* An empty list is a legitimate answer - a three-unit building nobody has
       sold in genuinely has none. So a thrown error must be visible, or a bug
       here is indistinguishable from that and reads as "no units on file".
       This exact catch hid a ReferenceError on a mistyped constant name. */
    console.error('[cm-offer-modal] unit options failed:', e);
    return [];
  }
}

// Legacy fallback — buildings.json (kept for resilience if RPC fails)
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

// ─── Modal singleton ────────────────────────────────────────────────────────

let backdropEl = null;

function ensureModal() {
  if (backdropEl) return backdropEl;
  ensureStyles();
  backdropEl = document.createElement('div');
  backdropEl.className = 'cm-om-backdrop';
  backdropEl.setAttribute('role', 'presentation');
  backdropEl.innerHTML = `<div class="cm-om" role="dialog" aria-modal="true" aria-labelledby="cm-om-title"></div>`;
  document.body.appendChild(backdropEl);

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

// v3.0 — Building context card markup builder
function renderBuildingContext(brief) {
  if (!brief) return '';
  const hasMedian = brief.median_12mo != null;
  const hasPpsf   = brief.median_ppsf_12mo != null;
  const hasRange  = brief.ppsf_low_12mo != null && brief.ppsf_high_12mo != null;
  if (!hasMedian && !hasPpsf) {
    // No sales data — show stub
    return `
      <div class="cm-om-bctx">
        <div class="cm-om-bctx-head">
          <span>${escapeHtml(brief.building_name || 'This building')} · context</span>
        </div>
        <div class="cm-om-bctx-empty">No recorded sales in the trailing 12 months. Your offer establishes a price discovery point for this building.</div>
      </div>
    `;
  }
  /* Five numbers became two, and the sample moved to where it belongs.

     The card used to carry median sale, median $/ft², the $/ft² range, the
     sales count and the average unit size — then the calibration line under
     the slider restated the median a second time, 200px lower. Nobody decides
     an offer on average unit size; it is an input to the implied-$/ft² sum,
     not a number a buyer weighs.

     Dropping the separate "thin" line means the sales count has to travel
     WITH the median rather than sitting in its own sentence, which is the
     stricter reading of every-number-carries-its-sample: you can no longer
     read $3.63M without reading "7 sales · 12 mo" directly beneath it. */
  const sales = brief.sales_365d || 0;
  const nNote = sales ? `${sales} sale${sales === 1 ? '' : 's'} · 12 mo` : '12 mo';
  const cells = [];
  if (hasMedian) {
    cells.push(`
      <div class="cm-om-bctx-cell">
        <span class="cm-om-bctx-lab">Median sale</span>
        <span class="cm-om-bctx-val">${fmtMoneyShort(brief.median_12mo)}</span>
        <span class="cm-om-bctx-n">${nNote}</span>
      </div>
    `);
  }
  if (hasPpsf) {
    cells.push(`
      <div class="cm-om-bctx-cell">
        <span class="cm-om-bctx-lab">Median $/ft²</span>
        <span class="cm-om-bctx-val">${fmtPpsf(brief.median_ppsf_12mo)}<span class="cm-om-bctx-val-sub">/ft²</span></span>
        <span class="cm-om-bctx-n">${hasRange ? `${fmtPpsf(brief.ppsf_low_12mo)}–${fmtPpsf(brief.ppsf_high_12mo)}` : nNote}</span>
      </div>
    `);
  }
  return `
    <div class="cm-om-bctx">
      <div class="cm-om-bctx-head">
        <span>${escapeHtml(brief.building_name)} · what it has sold for</span>
      </div>
      <div class="cm-om-bctx-grid">${cells.join('')}</div>
    </div>
  `;
}

// v3.0 — Calibration line (recomputed live as slider moves)
function calibText(amount, brief) {
  if (!brief || brief.median_12mo == null) {
    return `<span class="cm-om-calib-empty">Slide to set your offer · no historical baseline available for this building yet.</span>`;
  }
  /* Three lines became one. The old version opened by restating the number
     the slider already displays, then restated the median printed in the card
     immediately above, then gave the implied $/ft² and its delta. Only the
     last part told the reader anything they could not already see. */
  const median = Number(brief.median_12mo);
  if (brief.avg_sqft_12mo && brief.median_ppsf_12mo) {
    const implied = amount / brief.avg_sqft_12mo;
    const d = fmtPctDelta((implied / brief.median_ppsf_12mo - 1) * 100);
    return `\u2248 <b>${fmtPpsf(implied)}/ft²</b>` +
           (d ? ` <span class="cm-om-calib-${d.dir}">${d.sign}${d.mag}% vs this building</span>` : '');
  }
  return `<b>${fmtMult(amount / median)}</b> this building's median`;
}

async function renderForm(modal, ctx) {
  const { listing, brief, suggested_price, unit_label } = ctx;

  // Building name resolution priority: brief.building_name (from RPC, authoritative)
  // → listing fallback → ctx-passed building obj → slug.
  const buildingName = (brief && brief.building_name)
    || (ctx.building && (ctx.building.name || ctx.building.dname))
    || ctx.building_slug
    || 'this building';

  const listingPrice = listing ? Number(listing.price) : null;

  // Slider config — fixed full-range, default 95% of MMM or building median if available
  const SLIDER_MIN  = 250000;
  const briefMedian = brief && brief.median_12mo ? Number(brief.median_12mo) : null;
  const briefHigh   = briefMedian ? Math.max(5000000, Math.round(briefMedian * 2.5)) : 5000000;
  const SLIDER_MAX  = listingPrice ? Math.max(briefHigh, Math.round(listingPrice * 1.2)) : briefHigh;
  const SLIDER_STEP = 25000;
  const defaultAmt  = suggested_price
    ? Number(suggested_price)
    : (listingPrice
        ? Math.round(listingPrice * 0.95 / SLIDER_STEP) * SLIDER_STEP
        : (briefMedian
            ? Math.round(briefMedian / SLIDER_STEP) * SLIDER_STEP
            : 1500000));

  // Subtitle — unit-specific takes priority, then generic
  let subText;
  if (listing) {
    subText = `${escapeHtml(listing.address || '')}${listing.unit_number ? ' · Unit ' + escapeHtml(listing.unit_number) : ''}`;
  } else if (unit_label) {
    subText = `${escapeHtml(unit_label)} · ${escapeHtml(buildingName)}`;
  } else {
    /* Opened from a building-level button with no unit chosen.

       "Your number for any unit" is not an offer anybody can act on - an owner
       cannot be shown a price for an unnamed apartment, and the agent drafting
       the LOI has nothing to draft against. Ask which one, in the field below,
       before the number means anything. */
    /* Was "Which unit at X?" — the same question the required Which unit
       field asks 200px below, and the eyebrow already names the building. A
       third header line that restates a field label is not orientation. */
    subText = '';
  }

  /* Required only when nothing upstream supplied a unit. Coming from the tower
     or from a live listing, the unit is already known and asking again would
     be friction for no gain. */
  const needsUnit = !listing && !unit_label;
  /* A dropdown of real units, not a text box.

     Typed unit numbers arrive as "51c", "#51 C", "Unit 51C" and occasionally
     as a unit that does not exist in the building - and an offer on a
     mistyped apartment is worse than no offer, because the agent has to go
     back and ask. Selecting from the building's own list removes the class of
     error entirely.

     The list is populated after open() so the modal is never held up by a
     network call; until it arrives the select shows a loading option and is
     disabled, which also stops anyone submitting mid-load. */
  const unitFieldHtml = needsUnit
    ? `
      <div class="cm-om-field">
        <label for="cm-om-unit"><span>Which unit</span><span style="text-transform:none;font-size:11px;color:var(--cm-ivory-faint);">Required</span></label>
        <select class="cm-om-textarea" id="cm-om-unit" style="min-height:0;height:auto;" disabled>
          <option value="">Loading units\u2026</option>
        </select>
        <input class="cm-om-textarea" id="cm-om-unit-other" type="text" autocomplete="off"
               style="min-height:0;height:auto;margin-top:8px;display:none;"
               placeholder="Type the unit number">
        <div class="cm-om-calib" id="cm-om-unit-hint">Or pick a unit on the tower and this fills itself in.</div>
      </div>`
    : '';

  const buildingContextHtml = renderBuildingContext(brief);

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
    ${subText ? `<p class="cm-om-sub">${subText}</p>` : ''}

    ${buildingContextHtml}
    ${anchorHtml}

    <form id="cm-om-form">
      <div class="cm-om-field">
        <label for="cm-om-amount">
          <span>Your number</span>
          <span class="cm-om-field-display" id="cm-om-amount-display">${fmtMoneyShort(defaultAmt)}</span>
        </label>
        <input type="range" class="cm-om-slider" id="cm-om-amount"
               min="${SLIDER_MIN}" max="${SLIDER_MAX}" step="${SLIDER_STEP}" value="${defaultAmt}">
        <div class="cm-om-calib" id="cm-om-calib">${calibText(defaultAmt, brief)}</div>
      </div>

      ${unitFieldHtml}

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
      <!-- The fine print that sat here said the agent reviews and prepares the
           LOI before anything reaches the owner. The certification checkbox
           immediately above says exactly that, and it is the sentence the
           reader has to tick to proceed. Saying it twice made the shorter,
           unbinding copy compete with the binding one. -->
      <div id="cm-om-msg"></div>
    </form>
  `;

  modal.querySelector('.cm-om-close').addEventListener('click', close);

  // Slider live-update — amount display + calibration line
  const slider     = modal.querySelector('#cm-om-amount');
  const display    = modal.querySelector('#cm-om-amount-display');
  const calibEl    = modal.querySelector('#cm-om-calib');
  slider.addEventListener('input', () => {
    const amt = Number(slider.value);
    display.textContent = fmtMoneyShort(amt);
    calibEl.innerHTML = calibText(amt, brief);
  });

  // Match make-me-move
  const matchBtn = modal.querySelector('#cm-om-match');
  if (matchBtn && listingPrice) {
    matchBtn.addEventListener('click', () => {
      slider.value = listingPrice;
      display.textContent = fmtMoneyShort(listingPrice);
      calibEl.innerHTML = calibText(listingPrice, brief);
    });
  }

  // Cert checkbox gates submit
  const certCb = modal.querySelector('#cm-om-cert-cb');
  const submitBtn = modal.querySelector('#cm-om-submit');
  /* Both gates, not either: the certification AND a named unit. Previously the
     checkbox alone released an offer that identified no apartment. */
  const unitSel   = modal.querySelector('#cm-om-unit');
  const unitOther = modal.querySelector('#cm-om-unit-other');
  const unitHint  = modal.querySelector('#cm-om-unit-hint');

  /* One place decides what the chosen unit is, whichever control supplied it,
     so the gate and the submit can never disagree about whether one exists. */
  function chosenUnit() {
    if (!unitSel) return '';
    if (unitSel.value === '__other') return (unitOther.value || '').trim();
    return (unitSel.value || '').trim();
  }
  function gate() {
    const certOk = modal.querySelector('#cm-om-cert-cb').checked;
    const unitOk = !unitSel || chosenUnit().length > 0;
    submitBtn.disabled = !(certOk && unitOk);
  }
  if (unitSel) {
    unitSel.addEventListener('change', () => {
      const other = unitSel.value === '__other';
      unitOther.style.display = other ? '' : 'none';
      if (other) unitOther.focus();
      gate();
    });
    unitOther.addEventListener('input', gate);

    loadUnitOptions(ctx.building_slug || '').then((units) => {
      if (units.length) {
        unitSel.innerHTML =
          '<option value="">Select a unit\u2026</option>' +
          units.map(u => `<option value="${escapeHtml(u.label)}">${escapeHtml(u.label)}` +
                         `${u.floor != null ? ` \u00b7 floor ${u.floor}` : ''}</option>`).join('') +
          '<option value="__other">My unit isn\u2019t listed\u2026</option>';
        /* Was two sentences: the count, then the escape hatch. The count is
           not a decision the reader makes, and the escape hatch is visible in
           the dropdown itself as the last option. */
        unitHint.textContent = 'Not listed? Choose the last option.';
      } else {
        /* Some buildings have no unit on file at all - a three-unit building
           nobody has sold in returns an empty list. Falling back to typing is
           the only honest option; a dropdown that cannot express your own
           apartment is worse than a text box. */
        unitSel.innerHTML = '<option value="__other" selected>Type the unit number</option>';
        unitOther.style.display = '';
        unitHint.textContent = 'No units on file for this building yet \u2014 type the number.';
      }
      unitSel.disabled = false;
      gate();
    });
  }
  certCb.addEventListener('change', gate);

  // TOS modal link
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

  // Submit
  modal.querySelector('#cm-om-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!certCb.checked) return;
    if (unitSel && !chosenUnit()) {
      modal.querySelector('#cm-om-msg').innerHTML =
        '<div class="cm-om-msg is-error">Please choose the unit this offer is for.</div>';
      (unitSel.value === '__other' ? unitOther : unitSel).focus();
      return;
    }
    const msgEl = modal.querySelector('#cm-om-msg');
    const amount = parseInt(slider.value, 10);
    let message = modal.querySelector('#cm-om-message').value.trim();

    // v3.0 — preserve unit context in message body until cm-supabase.js is
    // updated to pass unit_label through to offers.unit_label
    /* Whichever way the unit was established - passed in from the tower, or
       typed here - it is the same field on the way out. */
    const finalUnit = unit_label || chosenUnit() || null;
    if (finalUnit) {
      message = (message ? `${finalUnit} · ${message}` : finalUnit);
    }

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

    if (window.cmTrack) {
      window.cmTrack('offer_submit', {
        building_slug: ctx.building_slug || null,
        offer_amount: amount,
        unit_label: finalUnit
      });
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

  document.body.style.overflow = 'hidden';
  backdrop.classList.add('is-open');

  // Auth check
  let session = null;
  try { session = await CM.getSession(); } catch (e) {}
  if (!session?.user) {
    renderGate(modal);
    return;
  }

  // Resolve listing if provided
  let listing = null;
  if (ctx.listing_id) {
    try { listing = await CM.getListingById(ctx.listing_id); } catch (e) {}
  }

  // Resolve building slug
  let buildingSlug = ctx.building_slug
    || (listing && listing.building)
    || null;
  if (!buildingSlug) {
    const m = window.location.pathname.match(/\/building\/([^\/]+)/);
    if (m) buildingSlug = m[1];
  }

  // v3.0 — fetch building_market_brief from RPC (authoritative source)
  // Fallback to buildings.json if RPC returns nothing
  let brief = await fetchBuildingBrief(buildingSlug);
  let buildingObj = null;
  if (!brief && buildingSlug) {
    const buildings = await loadBuildings();
    buildingObj = buildingBySlug(buildings, buildingSlug);
  }

  await renderForm(modal, {
    listing,
    brief,
    building: buildingObj,
    building_slug: buildingSlug,
    suggested_price: ctx.suggested_price || null,
    unit_label: ctx.unit_label || null,
  });
}

// ─── Trigger wiring ─────────────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-cm-offer-trigger]');
  if (!trigger) return;
  e.preventDefault();
  open({
    listing_id:      trigger.dataset.listingId || null,
    building_slug:   trigger.dataset.buildingSlug || null,
    suggested_price: trigger.dataset.suggestedPrice ? Number(trigger.dataset.suggestedPrice) : null,
    unit_label:      trigger.dataset.unitLabel || null,
  });
});

window.addEventListener('cm:open-offer-modal', (e) => {
  open(e.detail || {});
});
