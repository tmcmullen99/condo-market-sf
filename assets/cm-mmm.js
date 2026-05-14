/**
 * cm-mmm.js — Make Me Move section + email-click modal for building pages
 * --------------------------------------------------------------------------
 * Auto-mounts on /building/[slug]/* pages. Reads the building slug from the
 * URL pathname, fetches active make_me_move rows for that slug from Supabase,
 * and inserts a prominent <section id="mmm"> above the building content
 * sections (#about / #gallery / etc).
 *
 * Three visitor tiers:
 *
 *   1. ANONYMOUS — section renders, target_price CSS-blurred, CTA reads
 *      "Create free account to see price →" linking to /?auth=signup&return=…
 *
 *   2. EMAIL-CLICK (?ref=mmm-email in URL) — same as anonymous, PLUS a
 *      centered modal pops on load showing the lowest-priced MMM as a
 *      social-proof teaser with a blurred preview card. Dismissible via
 *      close button, backdrop click, or Escape key.
 *
 *   3. AUTHENTICATED — body class `mmm-auth-verified` removes the CSS blur,
 *      swaps locked CTAs for "Submit offer →" which dispatches the
 *      existing cm:open-offer-modal event with the building/unit context.
 *      Modal is suppressed entirely.
 *
 * Zero changes to the 64 building HTML files. cm-actions.js dynamic-imports
 * this module on building pages (mirrors the cm-building-intel.js pattern).
 *
 * Bails silently when:
 *   - URL isn't a /building/{slug}/ page (no slug detected)
 *   - No active make_me_move rows exist for the slug
 *   - Supabase fetch fails (console.warn but no throw)
 */

import { sb } from './cm-supabase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentBuildingSlug() {
  const m = window.location.pathname.match(/^\/building\/([^/]+)\/?/);
  return m ? m[1] : null;
}

function getRef() {
  return new URLSearchParams(window.location.search).get('ref') || '';
}

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Math.round(Number(n)).toLocaleString('en-US');
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function escAttr(s) { return escHtml(s); }

/**
 * Find the best DOM node to insert the MMM section BEFORE. We want MMM as
 * high as possible — above building content sections but below the hero/nav.
 * Fallback chain runs most-specific → least-specific.
 */
function findInsertionAnchor() {
  const candidates = [
    '#mmm-anchor',                       // explicit anchor (future-proof)
    '#gallery',                          // first content section in nav order
    '#about',
    '#amenities',
    'nav.section-nav + section',
    'nav.building-nav + section',
    'main > section:first-of-type',
    'section:first-of-type',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Look up the canonical building display name. Falls back gracefully.
 *   1. Try /buildings.json (the site's canonical building dataset)
 *   2. Try window.cm_buildings if some other script exposed it
 *   3. Last resort: prettify the slug
 */
async function resolveDisplayName(slug) {
  // Prefer in-memory cache if another module set it up
  if (typeof window !== 'undefined' && window.cm_buildings) {
    const b = window.cm_buildings.find(x => x.slug === slug);
    if (b) return b.display_name || b.name || slug;
  }
  try {
    const r = await fetch('/buildings.json', { cache: 'force-cache' });
    if (r.ok) {
      const data = await r.json();
      const arr = Array.isArray(data) ? data : (data.buildings || []);
      const b = arr.find(x => x.slug === slug);
      if (b) return b.display_name || b.name || slug;
    }
  } catch (e) {
    // ignore
  }
  // Prettify slug: "union-house" → "Union House"
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ---------------------------------------------------------------------------
// CSS — injected once
// ---------------------------------------------------------------------------

const STYLES = `
.cm-mmm-section {
  background: linear-gradient(180deg, rgba(212,165,116,0.07) 0%, rgba(212,165,116,0.01) 100%);
  border-top: 1px solid rgba(232,227,216,0.08);
  border-bottom: 1px solid rgba(232,227,216,0.08);
  padding: 3.5rem 0;
  font-family: 'DM Sans', system-ui, sans-serif;
  color: #e8e3d8;
}
.cm-mmm-container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
.cm-mmm-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: #d4a574; margin-bottom: 0.85rem;
}
.cm-mmm-heading {
  font-family: 'Playfair Display', Georgia, serif;
  font-style: italic; font-weight: 500;
  font-size: clamp(1.6rem, 3.2vw, 2.25rem);
  color: #e8e3d8; margin: 0 0 0.75rem; line-height: 1.2;
}
.cm-mmm-lede {
  color: rgba(232,227,216,0.68);
  margin: 0 0 2rem; max-width: 44rem; line-height: 1.6;
  font-size: 1rem;
}
.cm-mmm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
}
.cm-mmm-card {
  background: #1a1f2e;
  border: 1px solid #d4a574;
  border-radius: 14px;
  padding: 1.85rem;
  display: flex; flex-direction: column;
}
.cm-mmm-card-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(232,227,216,0.45); margin-bottom: 0.85rem;
}
.cm-mmm-card-price {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 2.4rem; font-weight: 500;
  color: #d4a574; margin-bottom: 1.5rem; line-height: 1;
}
.cm-mmm-price-value {
  filter: blur(10px); user-select: none;
  transition: filter 0.4s ease;
  display: inline-block;
}
body.mmm-auth-verified .cm-mmm-price-value { filter: none; user-select: text; }

.cm-mmm-btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.85rem 1.5rem;
  background: #d4a574; color: #0f131d;
  font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.95rem;
  border-radius: 8px; text-decoration: none;
  transition: opacity 0.15s;
  align-self: flex-start;
  border: none; cursor: pointer;
}
.cm-mmm-btn:hover { opacity: 0.88; color: #0f131d; }
.cm-mmm-btn-locked { display: inline-flex; }
.cm-mmm-btn-unlocked { display: none; }
body.mmm-auth-verified .cm-mmm-btn-locked { display: none; }
body.mmm-auth-verified .cm-mmm-btn-unlocked { display: inline-flex; }

@media (max-width: 768px) {
  .cm-mmm-section { padding: 2.5rem 0; }
  .cm-mmm-card { padding: 1.5rem; }
  .cm-mmm-card-price { font-size: 1.95rem; }
  .cm-mmm-grid { grid-template-columns: 1fr; }
}

/* Modal */
.cm-mmm-modal {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  padding: 1.5rem;
  animation: cmMmmFade 0.25s ease-out;
  font-family: 'DM Sans', system-ui, sans-serif;
}
@keyframes cmMmmFade { from { opacity: 0; } to { opacity: 1; } }
.cm-mmm-modal-backdrop {
  position: absolute; inset: 0;
  background: rgba(15,19,29,0.88);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  cursor: pointer;
}
.cm-mmm-modal-content {
  position: relative; max-width: 520px; width: 100%;
  background: #1a1f2e; border: 1px solid #d4a574;
  border-radius: 16px; padding: 2.5rem 2rem;
  z-index: 1; max-height: 90vh; overflow-y: auto;
  color: #e8e3d8;
}
.cm-mmm-modal-close {
  position: absolute; top: 0.75rem; right: 1rem;
  background: none; border: none;
  color: rgba(232,227,216,0.45);
  font-size: 1.85rem; cursor: pointer; line-height: 1;
  padding: 0.25rem 0.5rem; transition: color 0.15s;
}
.cm-mmm-modal-close:hover { color: #d4a574; }
.cm-mmm-modal-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: #d4a574; margin-bottom: 0.85rem;
}
.cm-mmm-modal-headline {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.65rem; font-weight: 500; font-style: italic;
  color: #e8e3d8; margin: 0 0 1.5rem; line-height: 1.2;
}
.cm-mmm-modal-card {
  background: #0f131d;
  border: 1px solid rgba(232,227,216,0.18);
  border-radius: 12px; padding: 1.5rem 1rem;
  margin-bottom: 1.5rem; text-align: center;
}
.cm-mmm-modal-card-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(232,227,216,0.45); margin-bottom: 0.65rem;
}
.cm-mmm-modal-card-price {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 2.5rem; font-weight: 500;
  color: #d4a574; margin-bottom: 0.65rem; line-height: 1;
}
.cm-mmm-modal-card-note {
  font-size: 0.85rem; color: rgba(232,227,216,0.45);
  font-style: italic;
}
.cm-mmm-modal-explainer {
  color: rgba(232,227,216,0.68);
  margin: 0 0 1.5rem; line-height: 1.55; font-size: 0.97rem;
}
.cm-mmm-modal-cta { display: flex; flex-direction: column; gap: 0.75rem; }
.cm-mmm-modal-cta-primary, .cm-mmm-modal-cta-secondary {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 0.5rem; padding: 0.85rem 1.5rem;
  font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.95rem;
  border-radius: 8px; text-decoration: none; width: 100%;
  cursor: pointer; border: 1px solid transparent;
}
.cm-mmm-modal-cta-primary { background: #d4a574; color: #0f131d; }
.cm-mmm-modal-cta-primary:hover { opacity: 0.88; color: #0f131d; }
.cm-mmm-modal-cta-secondary {
  background: transparent; color: #d4a574;
  border-color: #d4a574;
}
.cm-mmm-modal-cta-secondary:hover { background: rgba(212,165,116,0.08); color: #d4a574; }

@media (max-width: 480px) {
  .cm-mmm-modal-content { padding: 2rem 1.25rem; }
  .cm-mmm-modal-headline { font-size: 1.35rem; }
  .cm-mmm-modal-card-price { font-size: 2rem; }
}
`;

function injectStyles() {
  if (document.getElementById('cm-mmm-styles')) return;
  const style = document.createElement('style');
  style.id = 'cm-mmm-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSection(slug, displayName, mmms) {
  const anchor = findInsertionAnchor();
  if (!anchor) {
    console.warn('cm-mmm: no insertion anchor found, appending to body');
    document.body.appendChild(buildSectionEl(slug, displayName, mmms));
    return;
  }
  anchor.parentNode.insertBefore(buildSectionEl(slug, displayName, mmms), anchor);
}

function buildSectionEl(slug, displayName, mmms) {
  const sec = document.createElement('section');
  sec.id = 'mmm';
  sec.className = 'cm-mmm-section';
  const isPlural = mmms.length !== 1;
  const heading = isPlural
    ? `${mmms.length} owners at ${escHtml(displayName)} have set their Make Me Move price`
    : `One owner at ${escHtml(displayName)} has set their Make Me Move price`;

  const cardsHtml = mmms.map(m => `
    <div class="cm-mmm-card">
      <div class="cm-mmm-card-eyebrow">Unit ${escHtml(m.unit_address)}</div>
      <div class="cm-mmm-card-price"><span class="cm-mmm-price-value">${fmtMoney(m.target_price)}</span></div>
      <a href="/?auth=signup&return=${encodeURIComponent(window.location.pathname)}" class="cm-mmm-btn cm-mmm-btn-locked">Create free account to see price →</a>
      <button type="button" class="cm-mmm-btn cm-mmm-btn-unlocked" data-mmm-offer data-building="${escAttr(slug)}" data-unit="${escAttr(m.unit_address)}" data-price="${escAttr(m.target_price)}">Submit offer →</button>
    </div>
  `).join('');

  sec.innerHTML = `
    <div class="cm-mmm-container">
      <div class="cm-mmm-eyebrow">Make Me Move · Owner set their price</div>
      <h2 class="cm-mmm-heading">${heading}</h2>
      <p class="cm-mmm-lede">Submit an offer at or above the asking price. These owners only respond when a qualified buyer commits — no showings, no listing, just a direct private offer. Make Me Move prices are visible only to verified Condo Market accounts.</p>
      <div class="cm-mmm-grid">${cardsHtml}</div>
    </div>
  `;

  // Wire offer buttons to the existing offer-modal event used elsewhere on the site
  sec.querySelectorAll('[data-mmm-offer]').forEach(btn => {
    btn.addEventListener('click', () => {
      const detail = {
        building_slug: btn.dataset.building,
        unit_address: btn.dataset.unit,
        target_price: Number(btn.dataset.price) || null,
        source: 'mmm',
      };
      const ev = new CustomEvent('cm:open-offer-modal', { detail });
      window.dispatchEvent(ev);
    });
  });

  return sec;
}

function renderModal(slug, displayName, heroMmm) {
  const modal = document.createElement('div');
  modal.id = 'cm-mmm-modal';
  modal.className = 'cm-mmm-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'cm-mmm-modal-headline');

  const signupHref = '/?auth=signup&return=' + encodeURIComponent(window.location.pathname);
  const loginHref  = '/?auth=login&return='  + encodeURIComponent(window.location.pathname);

  modal.innerHTML = `
    <div class="cm-mmm-modal-backdrop" data-modal-dismiss></div>
    <div class="cm-mmm-modal-content">
      <button class="cm-mmm-modal-close" type="button" data-modal-dismiss aria-label="Close">&times;</button>
      <div class="cm-mmm-modal-eyebrow">Make Me Move · Off-market</div>
      <h2 id="cm-mmm-modal-headline" class="cm-mmm-modal-headline">A neighbor at ${escHtml(displayName)} just set their Make Me Move price.</h2>
      <div class="cm-mmm-modal-card">
        <div class="cm-mmm-modal-card-eyebrow">${escHtml(displayName)} · Unit ${escHtml(heroMmm.unit_address)}</div>
        <div class="cm-mmm-modal-card-price"><span class="cm-mmm-price-value">${fmtMoney(heroMmm.target_price)}</span></div>
        <div class="cm-mmm-modal-card-note">Verified Condo Market accounts can see this price.</div>
      </div>
      <p class="cm-mmm-modal-explainer">Make Me Move prices are visible only to verified Condo Market SF accounts. Create your free account in 30 seconds to see what your neighbors would accept for their unit — and to set your own Make Me Move price if you'd ever consider selling.</p>
      <div class="cm-mmm-modal-cta">
        <a href="${signupHref}" class="cm-mmm-modal-cta-primary">Create free account to see price →</a>
        <a href="${loginHref}" class="cm-mmm-modal-cta-secondary">I already have an account</a>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  function dismiss() {
    modal.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') dismiss(); }

  modal.querySelectorAll('[data-modal-dismiss]').forEach(el => {
    el.addEventListener('click', dismiss);
  });
  document.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

async function init() {
  const slug = getCurrentBuildingSlug();
  if (!slug) return;

  injectStyles();

  // Fetch MMM data + check auth state in parallel
  let mmms = [];
  let session = null;
  try {
    const [mmmRes, sessionRes] = await Promise.all([
      sb.from('make_me_move')
        .select('id, unit_address, target_price, set_at, notes')
        .eq('building_slug', slug)
        .eq('is_active', true)
        .order('target_price', { ascending: true }),
      sb.auth.getSession(),
    ]);
    if (mmmRes.error) {
      console.warn('cm-mmm: fetch failed', mmmRes.error);
      return;
    }
    mmms = mmmRes.data || [];
    session = sessionRes.data?.session || null;
  } catch (e) {
    console.warn('cm-mmm: init failed', e);
    return;
  }

  if (mmms.length === 0) return; // no active MMM at this building, render nothing

  if (session) {
    document.body.classList.add('mmm-auth-verified');
  }

  const displayName = await resolveDisplayName(slug);

  renderSection(slug, displayName, mmms);

  // Pop email-click modal for anonymous arrivals from the campaign
  if (!session && getRef() === 'mmm-email') {
    renderModal(slug, displayName, mmms[0]);
  }

  // React to auth state changes mid-page (login modal → MMM unblurs without reload)
  sb.auth.onAuthStateChange((event, sess) => {
    if (sess) {
      document.body.classList.add('mmm-auth-verified');
      const modal = document.getElementById('cm-mmm-modal');
      if (modal) modal.remove();
    } else {
      document.body.classList.remove('mmm-auth-verified');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
