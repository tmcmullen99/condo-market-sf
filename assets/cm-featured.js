/**
 * cm-featured.js — Featured Make-Me-Move prices widget
 *
 * Auto-mounts on any element with [data-cm-featured]. Reads the building slug
 * from data-building, queries Supabase via the CM module, and renders one of
 * three states:
 *
 *   1. Signed out               → "Sign in to see prices" gate
 *   2. Signed in, has listings  → grid of MMM listing cards with "Submit offer" CTA
 *   3. Signed in, no listings   → element is hidden entirely (display: none)
 *
 * RLS in Supabase enforces the access rules; this module just renders what
 * the API returns. Anonymous users get nothing (gate state). Members see all
 * active listings for the requested building.
 */

import { CM } from '/assets/cm-supabase.js';

const STYLE_ID = 'cm-featured-styles';

const STYLE_CSS = `
  .cm-feat { background: rgba(212, 165, 116, 0.04); border: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14)); border-radius: 16px; padding: clamp(28px, 4vw, 48px); }
  .cm-feat-eyebrow {
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--cm-bronze, #d4a574); margin-bottom: 14px;
    display: inline-block; padding: 4px 11px;
    border: 1px solid rgba(212, 165, 116, 0.3); border-radius: 999px;
  }
  .cm-feat h2 {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: clamp(28px, 3.6vw, 38px);
    margin-bottom: 12px; color: var(--cm-ivory, #e8e3d8);
    line-height: 1.15;
  }
  .cm-feat h2 em {
    font-style: italic; color: var(--cm-peri, #9fb4d8);
  }
  .cm-feat-sub {
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.64));
    font-size: 14px; margin-bottom: 28px;
    max-width: 60ch; line-height: 1.6;
  }
  .cm-feat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 18px;
  }
  .cm-feat-card {
    background: var(--cm-navy-deep, #0f131d);
    border: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    text-decoration: none;
    color: inherit;
    transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
    cursor: pointer;
  }
  .cm-feat-card:hover {
    transform: translateY(-3px);
    border-color: rgba(212, 165, 116, 0.5);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  }
  .cm-feat-card-photo {
    position: relative;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background: rgba(232, 227, 216, 0.04);
  }
  .cm-feat-card-photo img {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 600ms ease;
  }
  .cm-feat-card:hover .cm-feat-card-photo img { transform: scale(1.04); }
  .cm-feat-card-badge {
    position: absolute;
    top: 12px; left: 12px;
    background: rgba(15, 19, 29, 0.86);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(212, 165, 116, 0.42);
    color: var(--cm-bronze, #d4a574);
    padding: 5px 11px;
    border-radius: 999px;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 500;
  }
  .cm-feat-card-content {
    padding: 18px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }
  .cm-feat-card-price {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 600;
    font-size: 26px;
    color: var(--cm-bronze, #d4a574);
    line-height: 1;
    margin-bottom: 2px;
  }
  .cm-feat-card-addr {
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-weight: 500;
    font-size: 15px;
    color: var(--cm-ivory, #e8e3d8);
    line-height: 1.3;
  }
  .cm-feat-card-addr-sub {
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--cm-ivory-faint, rgba(232, 227, 216, 0.5));
    text-transform: uppercase;
  }
  .cm-feat-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.62));
    text-transform: uppercase;
    margin-top: 4px;
  }
  .cm-feat-card-meta .sep {
    color: var(--cm-ivory-faint, rgba(232, 227, 216, 0.32));
  }
  .cm-feat-card-cta {
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.1));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--cm-bronze, #d4a574);
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 500;
    transition: color 150ms ease;
  }
  .cm-feat-card:hover .cm-feat-card-cta { color: var(--cm-ivory, #e8e3d8); }
  .cm-feat-card-cta-arrow {
    transition: transform 220ms ease;
  }
  .cm-feat-card:hover .cm-feat-card-cta-arrow { transform: translateX(3px); }
  .cm-feat-gate { text-align: center; padding: 28px 20px 20px; }
  .cm-feat-gate .gate-title {
    font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: clamp(20px, 2.4vw, 24px);
    color: var(--cm-ivory, #e8e3d8); margin-bottom: 12px;
  }
  .cm-feat-gate p {
    max-width: 50ch; margin: 0 auto 22px;
    line-height: 1.6; font-size: 14px;
    color: var(--cm-ivory-dim, rgba(232, 227, 216, 0.64));
  }
  .cm-feat-gate .gate-cta {
    display: inline-block;
    background: var(--cm-peri, #9fb4d8);
    color: var(--cm-navy, #1a1f2e);
    padding: 12px 24px; border-radius: 999px;
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-size: 13px; font-weight: 500; cursor: pointer;
    text-decoration: none; transition: all 150ms ease;
  }
  .cm-feat-gate .gate-cta:hover { opacity: 0.88; transform: translateY(-1px); }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = STYLE_CSS;
  document.head.appendChild(s);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(n) {
  if (!n) return '$0';
  return '$' + Math.round(Number(n)).toLocaleString('en-US');
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ─── Building data loader (for card photos + name + hood) ───────────────────

let _buildingsCache = null;
async function loadBuildings() {
  if (_buildingsCache) return _buildingsCache;
  try {
    const r = await fetch('/assets/buildings.json', { cache: 'force-cache' });
    if (r.ok) _buildingsCache = await r.json();
  } catch (e) { /* network noop */ }
  return _buildingsCache || [];
}
function buildingBySlug(buildings, slug) {
  return buildings.find(b => {
    const s = (b.href || '').replace(/\/$/, '').split('/').pop();
    return s === slug;
  });
}

// ─── Render states ──────────────────────────────────────────────────────────

function renderGate(host) {
  host.innerHTML = `
    <div class="cm-feat">
      <span class="cm-feat-eyebrow">Private marketplace</span>
      <h2>Listings you won't find on <em>Zillow</em>, MLS, or open houses.</h2>
      <p class="cm-feat-sub">Owners across the 64 SF condo buildings on Condo Market who'd quietly entertain the right offer. Not listed publicly anywhere — visible only to verified members.</p>
      <div class="cm-feat-gate">
        <div class="gate-title">Sign in to see this building's prices</div>
        <p>Members see live make-me-move prices on every building. Free to create an account.</p>
        <a href="#signup" class="gate-cta" data-cm-auth="signup">Create free account →</a>
      </div>
    </div>
  `;
}

function renderListings(host, listings, building) {
  const buildingName = (building && (building.name || building.dname)) || '';
  const hood         = (building && building.hood) || '';
  const photoUrl     = (building && building.img) || '';
  const subAddrLine  = [buildingName, hood].filter(Boolean).join(' · ');

  const cards = listings.map(l => {
    // Display the full address as saved (now visible to verified members).
    // RLS already restricts this to authenticated users; previously the UI
    // was suppressing it unnecessarily.
    const fullAddress = l.address || '';

    // Bed / bath / sqft strip — only includes fields that are actually set.
    const metaParts = [];
    if (l.beds)  metaParts.push(escapeHtml(l.beds) + ' bed');
    if (l.baths) metaParts.push(escapeHtml(l.baths) + ' bath');
    if (l.sqft)  metaParts.push(escapeHtml(Number(l.sqft).toLocaleString()) + ' sqft');
    const metaHtml = metaParts.length
      ? '<div class="cm-feat-card-meta">' +
          metaParts.map((p, i) =>
            (i > 0 ? '<span class="sep">·</span>' : '') + '<span>' + p + '</span>'
          ).join('') +
        '</div>'
      : '';

    // Photo: prefer listing's own cover photo (if owner uploaded one), fall back to building hero.
    const listingPhotoUrl = l.cover_photo_path ? CM.getListingPhotoUrl(l.cover_photo_path) : null;
    const cardPhotoUrl    = listingPhotoUrl || photoUrl;
    const photoHtml = cardPhotoUrl
      ? `<img src="${escapeHtml(cardPhotoUrl)}" alt="${escapeHtml(buildingName || 'Building photo')}" loading="lazy">`
      : '';

    const subHtml = subAddrLine
      ? `<div class="cm-feat-card-addr-sub">${escapeHtml(subAddrLine)}</div>`
      : '';

    return `
      <a href="#offer" class="cm-feat-card" data-listing-id="${escapeHtml(l.id)}">
        <div class="cm-feat-card-photo">
          ${photoHtml}
          <span class="cm-feat-card-badge">Make-me-move</span>
        </div>
        <div class="cm-feat-card-content">
          <div class="cm-feat-card-price">${fmtMoney(l.price)}</div>
          <div class="cm-feat-card-addr">${escapeHtml(fullAddress)}</div>
          ${subHtml}
          ${metaHtml}
          <div class="cm-feat-card-cta">
            <span>Submit offer</span>
            <span class="cm-feat-card-cta-arrow">→</span>
          </div>
        </div>
      </a>
    `;
  }).join('');

  const countLabel = listings.length === 1
    ? 'Private marketplace · 1 live'
    : 'Private marketplace · ' + listings.length + ' live';

  host.innerHTML = `
    <div class="cm-feat">
      <span class="cm-feat-eyebrow">${countLabel}</span>
      <h2>Owners willing to sell — at <em>their</em> number.</h2>
      <p class="cm-feat-sub">These prices aren't listings. You won't find them on Zillow, MLS, or in any open house. They're the actual numbers each owner would say yes to. Submit an offer to start the conversation.</p>
      <div class="cm-feat-grid">${cards}</div>
    </div>
  `;

  // Wire the whole-card click → open offer modal with this listing's context
  host.querySelectorAll('.cm-feat-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const listingId = card.dataset.listingId;
      const listing = listings.find(l => l.id === listingId);
      window.dispatchEvent(new CustomEvent('cm:open-offer-modal', {
        detail: {
          listing_id:      listingId,
          building_slug:   host.dataset.building,
          suggested_price: listing ? listing.price : null,
        },
      }));
    });
  });
}

function hide(host) {
  host.style.display = 'none';
}

// ─── Mount ──────────────────────────────────────────────────────────────────

async function mount(host) {
  const slug = host.dataset.building;
  if (!slug) {
    console.warn('[cm-featured] missing data-building attribute');
    hide(host);
    return;
  }

  ensureStyles();
  host.style.display = '';

  let session = null;
  try { session = await CM.getSession(); } catch (e) { session = null; }

  if (!session?.user) {
    renderGate(host);
    return;
  }

  // Fetch listings + building metadata in parallel
  let listings = [];
  let buildings = [];
  try {
    [listings, buildings] = await Promise.all([
      CM.getActiveListingsForBuilding(slug),
      loadBuildings(),
    ]);
  } catch (e) { listings = []; }

  if (!listings || listings.length === 0) {
    hide(host);
    return;
  }

  const building = buildingBySlug(buildings, slug);
  renderListings(host, listings, building);
}

function init() {
  document.querySelectorAll('[data-cm-featured]').forEach(host => mount(host));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-render on auth state change (sign-in / sign-out reflows the gate ↔ listings)
window.addEventListener('cm-auth-change', () => {
  document.querySelectorAll('[data-cm-featured]').forEach(host => {
    host.style.display = '';
    host.innerHTML = '';
    mount(host);
  });
});
