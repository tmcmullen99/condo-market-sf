/**
 * cm-actions.js — Sticky action bar for building pages
 *
 * Auto-mounts on /building/[slug]/* pages. Reads the building slug from the
 * URL pathname, looks up the canonical street address from buildings.json,
 * and renders a fixed-position bar at the bottom of the viewport with two
 * CTAs:
 *
 *   1. "Make an offer →"   smooth-scrolls to the existing #offer / .cm-offer
 *      section in the page.
 *   2. "Set your number →" links to /owner-signup/?address=[street] with the
 *      building's street pre-filled — same path the mailer QR uses.
 *
 * The bar fades in only after the user has scrolled past the hero (~500px),
 * so it doesn't compete with the hero's own messaging. Dismissible; the
 * dismissal is remembered per-session (sessionStorage) so the bar respects
 * the user's preference for that visit but reappears on a new visit.
 *
 * No dependency on the CM module — building data is purely client-side from
 * buildings.json. Renders for both signed-in and signed-out users.
 */

const STYLE_ID = 'cm-actions-styles';

const STYLE_CSS = `
  .cm-actions-bar {
    position: fixed; left: 12px; right: 12px; bottom: 12px;
    background: rgba(15, 19, 29, 0.94);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(232, 227, 216, 0.16);
    border-radius: 14px;
    padding: 12px 16px;
    display: flex; align-items: center; gap: 10px;
    transform: translateY(calc(100% + 16px));
    opacity: 0;
    transition: transform 320ms cubic-bezier(.2,.7,.2,1), opacity 280ms ease;
    z-index: 90;
    box-shadow: 0 12px 40px rgba(0,0,0,0.45);
    max-width: 1080px;
    margin: 0 auto;
    pointer-events: none;
  }
  .cm-actions-bar.is-visible {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
  .cm-actions-eyebrow {
    flex: 1; min-width: 0;
    font-family: var(--cm-ff-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(232, 227, 216, 0.62);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    padding-left: 4px;
  }
  .cm-actions-eyebrow b {
    color: var(--cm-ivory, #e8e3d8);
    font-weight: 500;
  }
  .cm-actions-bar a {
    flex-shrink: 0;
    padding: 10px 18px;
    border-radius: 999px;
    font-family: var(--cm-ff-body, 'DM Sans', -apple-system, sans-serif);
    font-size: 13px; font-weight: 500;
    text-decoration: none;
    transition: transform 160ms ease, background 160ms ease, color 160ms ease, border-color 160ms ease;
    cursor: pointer;
    white-space: nowrap;
    line-height: 1;
  }
  .cm-actions-bar .cm-actions-primary {
    background: var(--cm-bronze, #d4a574);
    color: var(--cm-navy, #1a1f2e);
  }
  .cm-actions-bar .cm-actions-primary:hover {
    transform: translateY(-1px);
    background: var(--cm-ivory, #e8e3d8);
  }
  .cm-actions-bar .cm-actions-ghost {
    color: var(--cm-ivory, #e8e3d8);
    border: 1px solid rgba(232, 227, 216, 0.22);
  }
  .cm-actions-bar .cm-actions-ghost:hover {
    border-color: var(--cm-peri, #9fb4d8);
    color: var(--cm-peri, #9fb4d8);
  }
  .cm-actions-dismiss {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: rgba(232, 227, 216, 0.5);
    cursor: pointer;
    padding: 4px 8px;
    font-size: 18px;
    line-height: 1;
    border-radius: 50%;
    transition: color 150ms ease, background 150ms ease;
  }
  .cm-actions-dismiss:hover {
    color: var(--cm-ivory, #e8e3d8);
    background: rgba(232, 227, 216, 0.06);
  }
  @media (max-width: 600px) {
    .cm-actions-bar { padding: 10px 12px; gap: 8px; left: 8px; right: 8px; bottom: 8px; }
    .cm-actions-eyebrow { display: none; }
    .cm-actions-bar a { font-size: 12px; padding: 9px 14px; }
  }
`;

let _buildingsCache = null;
async function loadBuildings() {
  if (_buildingsCache) return _buildingsCache;
  try {
    const r = await fetch('/assets/buildings.json', { cache: 'force-cache' });
    if (r.ok) _buildingsCache = await r.json();
  } catch (e) { /* network noop */ }
  return _buildingsCache || [];
}

function getCurrentBuildingSlug() {
  // /building/lumina/ → lumina  ;  /building/lumina/unit-map.html → lumina
  const m = window.location.pathname.match(/\/building\/([^\/]+)/);
  return m ? m[1] : null;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = STYLE_CSS;
  document.head.appendChild(s);
}

function findOfferAnchor() {
  // Standard template uses #offer; the-avery uses .cm-offer with no id.
  return document.getElementById('offer')
      || document.querySelector('.cm-offer')
      || document.querySelector('[id*="offer"]');
}

async function init() {
  // Skip if user already dismissed this visit
  try {
    if (sessionStorage.getItem('cm-actions-dismissed') === '1') return;
  } catch (e) {}

  const slug = getCurrentBuildingSlug();
  if (!slug) return;

  const buildings = await loadBuildings();
  const b = buildings.find(b => {
    const s = (b.href || '').replace(/\/$/, '').split('/').pop();
    return s === slug;
  });
  if (!b) return;

  ensureStyles();

  const street = b.street || b.dstreet || b.name || '';
  const buildingName = b.name || b.dname || 'this building';
  const ownerSignupUrl = '/owner-signup/?address=' + encodeURIComponent(street);

  const bar = document.createElement('div');
  bar.className = 'cm-actions-bar';
  bar.setAttribute('role', 'complementary');
  bar.setAttribute('aria-label', 'Building actions');
  bar.innerHTML = `
    <span class="cm-actions-eyebrow">at <b>${escapeHtml(buildingName)}</b></span>
    <!-- Watch sits first because it is the smallest ask on the bar. Someone
         who is not ready to name a price will still take a notification, and
         it is the only one of the three that costs them nothing to accept. -->
    <a href="#watchBox" class="cm-actions-ghost cm-actions-watch">Watch this building</a>
    <a href="#offer" class="cm-actions-ghost cm-actions-offer">Make an offer →</a>
    <a href="${escapeHtml(ownerSignupUrl)}" class="cm-actions-primary">Set your number →</a>
    <button class="cm-actions-dismiss" aria-label="Dismiss">×</button>
  `;
  document.body.appendChild(bar);

  /* A bare #watchBox jump lands the box at the top of the viewport with the
     input off-centre and unfocused, which reads as "nothing happened". Centre
     it and take the cursor there so the next keystroke goes where it should. */
  const watchLink = bar.querySelector('.cm-actions-watch');
  if (watchLink) {
    watchLink.addEventListener('click', (ev) => {
      const box = document.getElementById('watchBox');
      if (!box) return;                 // let the anchor fall through
      ev.preventDefault();
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = document.getElementById('watchEmail');
      if (input) setTimeout(() => input.focus({ preventScroll: true }), 420);
    });
  }

  // Show/hide based on scroll position. Hero is roughly 500-700px tall on
  // desktop; on mobile it can be shorter. 350px is a safe trigger that
  // doesn't conflict with the hero's own messaging.
  let visible = false;
  const SHOW_AFTER = 350;
  function onScroll() {
    const shouldShow = window.scrollY > SHOW_AFTER;
    if (shouldShow !== visible) {
      visible = shouldShow;
      bar.classList.toggle('is-visible', visible);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Dismiss button — fade out, remember for this session
  bar.querySelector('.cm-actions-dismiss').addEventListener('click', () => {
    bar.classList.remove('is-visible');
    try { sessionStorage.setItem('cm-actions-dismissed', '1'); } catch (e) {}
    // Remove element after fade-out completes so it can't trap clicks
    setTimeout(() => bar.remove(), 350);
  });

  // "Make an offer →" opens the offer modal with building context
  bar.querySelector('.cm-actions-offer').addEventListener('click', (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('cm:open-offer-modal', {
      detail: { building_slug: slug },
    }));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Per-building intelligence panel — loaded on the same pages as the action bar.
// The intel module self-mounts and bails on non-building pages.
if (getCurrentBuildingSlug()) {
  import('/assets/cm-building-intel.js').catch((err) => {
    console.warn('cm-building-intel: load failed', err);
  });
}

// Per-building Make Me Move section + email-click modal — loaded on the same
// pages as the action bar. The mmm module self-mounts and bails on non-building
// pages and on buildings with no active make_me_move rows.
if (getCurrentBuildingSlug()) {
  import('/assets/cm-mmm.js').catch((err) => {
    console.warn('cm-mmm: load failed', err);
  });
}
