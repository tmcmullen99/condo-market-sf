/* Condo Market SF — Watchlist save button (v21).
 * Auto-mounts a "Save building" pill into header.masthead .nav-meta on every
 * /building/<slug>/ page. Loaded conditionally by cm-auth-nav.js.
 */
import { CM } from '/assets/cm-supabase.js';
import { openAuthModal } from '/assets/cm-auth.js';

const SLUG_RE = /^\/building\/([^\/]+)\/?$/;

function injectStyles() {
  if (document.getElementById('cm-save-styles')) return;
  const s = document.createElement('style');
  s.id = 'cm-save-styles';
  s.textContent = `
    .cm-save-btn {
      display:inline-flex; align-items:center; gap:6px;
      background:transparent; color:var(--cm-ivory,#e8e3d8);
      border:1px solid var(--cm-rule,rgba(232,227,216,0.14));
      padding:7px 14px; border-radius:999px;
      font-family:inherit; font-size:12px; font-weight:500;
      letter-spacing:0.04em; cursor:pointer; line-height:1; white-space:nowrap;
      transition:all 150ms ease;
    }
    .cm-save-btn:hover { border-color:var(--cm-bronze,#d4a574); color:var(--cm-bronze,#d4a574); }
    .cm-save-btn.is-saved {
      background:var(--cm-bronze,#d4a574); color:var(--cm-navy,#1a1f2e);
      border-color:var(--cm-bronze,#d4a574);
    }
    .cm-save-btn.is-saved:hover { background:var(--cm-ivory,#e8e3d8); border-color:var(--cm-ivory,#e8e3d8); }
    .cm-save-btn[disabled] { opacity:0.55; cursor:not-allowed; }
  `;
  document.head.appendChild(s);
}

function paint(btn, saved, busy) {
  btn.disabled = !!busy;
  btn.classList.toggle('is-saved', !!saved);
  btn.textContent = busy ? '…' : (saved ? '★ Saved' : '☆ Save');
}

export async function init() {
  const m = SLUG_RE.exec(location.pathname);
  if (!m) return;
  const slug = m[1];
  const target = document.querySelector('header.masthead .nav-meta')
              || document.querySelector('header.masthead .meta')
              || document.querySelector('header.cm-masthead .cm-masthead-meta');
  if (!target) return;
  if (target.querySelector('.cm-save-btn')) return; // idempotent
  injectStyles();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cm-save-btn';
  paint(btn, false, true);
  const signin = target.querySelector('[data-cm-auth]');
  if (signin) target.insertBefore(btn, signin); else target.appendChild(btn);

  let saved = false;
  try { saved = await CM.isInMyWatchlist(slug); } catch (e) {}
  paint(btn, saved, false);

  btn.addEventListener('click', async () => {
    let user = null;
    try { ({ data: { user } } = await CM.client.auth.getUser()); } catch (e) {}
    if (!user) { try { openAuthModal({ mode: 'login' }); } catch (e) {} return; }
    paint(btn, saved, true);
    if (saved) {
      const { error } = await CM.removeFromWatchlist(slug);
      if (!error) saved = false;
    } else {
      const { error } = await CM.addToWatchlist(slug);
      if (!error) saved = true;
    }
    paint(btn, saved, false);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
