/* =============================================================================
 * Condo Market SF - Navbar Auth Widget (cm-auth-nav.js)
 * -----------------------------------------------------------------------------
 * Drop-in ES module. Add this ONE line to any page's <head>:
 *
 *   <script type="module" src="/assets/cm-auth-nav.js"></script>
 *
 * What it does:
 *   1. Exposes window.CM so inline non-module scripts on the page can read
 *      auth state. Dispatches a `cm-ready` window event when CM is attached,
 *      and a `cm-auth-change` window event whenever auth state changes.
 *   2. Finds the existing "Sign in" button on the page and wires its click
 *      to open the Condo Market auth modal (signup/sign-in/magic-link).
 *   3. Watches auth state: when the user is signed in, it replaces the
 *      button contents with "Hi, [FirstName]" and shows a tiny dropdown
 *      with Sign out + admin link (if applicable).
 *   4. Handles a stray magic-link token if it lands on this page.
 *
 * How it finds the Sign in button (priority order):
 *   a. Any element with [data-cm-auth="login"]  ← recommended
 *   b. Any element with [data-cm-auth] (any value)
 *   c. Any <button> or <a> in header/nav whose text content equals "Sign in"
 *
 * Safe to load on every page. Does nothing if it finds no matching button.
 * ========================================================================== */

import { CM } from '/assets/cm-supabase.js';
import { openAuthModal } from '/assets/cm-auth.js';

// ---- Expose CM globally IMMEDIATELY --------------------------------------
// The v29 homepage has inline classic-script JS that reads window.CM directly.
// Attaching it synchronously at module-parse time means any DOMContentLoaded
// handler will find it.
window.CM = CM;

// ---- Styles (scoped under .cm-nav-*) -------------------------------------
const CSS = `
  .cm-nav-user-wrap { position: relative; display: inline-block; }
  .cm-nav-user-menu {
    position: absolute; top: calc(100% + 6px); right: 0;
    background: #fff; color: #1a1f2e; min-width: 200px;
    border-radius: 10px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
    padding: 6px 0; font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 14px; z-index: 9999; display: none;
    border: 1px solid rgba(26, 31, 46, 0.08);
  }
  .cm-nav-user-menu.cm-open { display: block; }
  .cm-nav-user-menu-item {
    display: block; width: 100%; padding: 9px 16px;
    background: transparent; border: none; text-align: left;
    font-family: inherit; font-size: 14px; color: #1a1f2e;
    cursor: pointer; text-decoration: none;
  }
  .cm-nav-user-menu-item:hover { background: #f4f0e8; }
  .cm-nav-user-menu-sep {
    height: 1px; background: rgba(26, 31, 46, 0.08); margin: 4px 0;
  }
  .cm-nav-user-menu-sub {
    display: block; padding: 9px 16px 10px; font-size: 11px;
    color: #888; letter-spacing: 0.02em; word-break: break-all;
    font-family: 'JetBrains Mono', Menlo, monospace;
  }
  /* Hide signed-out-only elements when the user is authenticated.
     Targets both: (1) any element opting in via .cm-hide-when-signed-in
     (2) the existing .dossier-enhanced-cta blocks already in 63 building
     pages, so we don't have to patch each page. */
  body.cm-signed-in .cm-hide-when-signed-in,
  body.cm-signed-in .dossier-enhanced-cta {
    display: none !important;
  }
`;

function injectStyles() {
  if (document.getElementById('cm-nav-auth-styles')) return;
  const style = document.createElement('style');
  style.id = 'cm-nav-auth-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ---- Event dispatch for legacy inline JS ---------------------------------
function dispatchAuthChange(event, session) {
  try {
    window.dispatchEvent(new CustomEvent('cm-auth-change', {
      detail: { event: event, session: session }
    }));
    document.dispatchEvent(new CustomEvent('cm-auth-change', {
      detail: { event: event, session: session }
    }));
  } catch (e) {}
}

function dispatchReady() {
  try {
    window.dispatchEvent(new CustomEvent('cm-ready'));
  } catch (e) {}
}

// ---- Find the sign-in button ---------------------------------------------
function findSignInButton() {
  const byAttrLogin = document.querySelector('[data-cm-auth="login"]');
  if (byAttrLogin) return byAttrLogin;

  const byAttrAny = document.querySelector('[data-cm-auth]');
  if (byAttrAny) return byAttrAny;

  const candidates = document.querySelectorAll('header button, header a, nav button, nav a, .navbar button, .navbar a, .cm-nav button, .cm-nav a');
  for (const el of candidates) {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text === 'sign in' || text === 'log in' || text === 'login' || text === 'account') {
      return el;
    }
  }

  const all = document.querySelectorAll('button, a');
  for (const el of all) {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text === 'sign in' || text === 'log in') {
      return el;
    }
  }

  return null;
}

// ---- Render state --------------------------------------------------------
let signInBtn = null;
let originalBtnHTML = null;
let userMenuWrap = null;

function getFirstName(profile, user) {
  if (profile?.full_name) {
    const first = profile.full_name.trim().split(/\s+/)[0];
    if (first) return first;
  }
  if (user?.user_metadata?.full_name) {
    const first = user.user_metadata.full_name.trim().split(/\s+/)[0];
    if (first) return first;
  }
  if (user?.email) {
    return user.email.split('@')[0];
  }
  return 'there';
}

function restoreSignInButton() {
  if (!signInBtn) return;
  if (userMenuWrap && userMenuWrap.parentNode) {
    userMenuWrap.parentNode.replaceChild(signInBtn, userMenuWrap);
    userMenuWrap = null;
  }
  if (originalBtnHTML !== null) {
    signInBtn.innerHTML = originalBtnHTML;
  }
  signInBtn.onclick = null;
  signInBtn.removeEventListener('click', handleSignInClick);
  signInBtn.addEventListener('click', handleSignInClick);
}

function handleSignInClick(e) {
  e.preventDefault();
  openAuthModal('signup');
}

function renderSignedOut() {
  document.body.classList.remove('cm-signed-in');
  document.body.classList.add('cm-signed-out');
  restoreSignInButton();
}

async function renderSignedIn(user) {
  document.body.classList.remove('cm-signed-out');
  document.body.classList.add('cm-signed-in');
  if (!signInBtn) return;

  let profile = null;
  try { profile = await CM.getMyProfile(); } catch (e) {}
  const firstName = getFirstName(profile, user);

  const wrap = document.createElement('div');
  wrap.className = 'cm-nav-user-wrap';

  const tagName = signInBtn.tagName.toLowerCase();
  const userBtn = document.createElement(tagName === 'a' ? 'a' : tagName);
  userBtn.className = signInBtn.className;
  if (tagName === 'a') {
    userBtn.setAttribute('href', '#account');
  } else {
    userBtn.setAttribute('type', 'button');
  }
  userBtn.textContent = `Hi, ${firstName}`;
  userBtn.style.cursor = 'pointer';

  const menu = document.createElement('div');
  menu.className = 'cm-nav-user-menu';
  menu.innerHTML = `
    <span class="cm-nav-user-menu-sub">${escapeHtml(user.email || '')}</span>
    <div class="cm-nav-user-menu-sep"></div>
    <a class="cm-nav-user-menu-item" href="/buildings/">Browse buildings</a>
    <a class="cm-nav-user-menu-item" href="/dashboard/">My dashboard</a>
    ${profile?.role === 'admin' ? '<a class="cm-nav-user-menu-item" href="/admin/">Admin</a>' : ''}
    <div class="cm-nav-user-menu-sep"></div>
    <button class="cm-nav-user-menu-item cm-nav-signout" type="button">Sign out</button>
  `;

  wrap.appendChild(userBtn);
  wrap.appendChild(menu);

  if (signInBtn.parentNode) {
    signInBtn.parentNode.replaceChild(wrap, signInBtn);
  }
  userMenuWrap = wrap;

  userBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    menu.classList.toggle('cm-open');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) menu.classList.remove('cm-open');
  });

  const signoutBtn = menu.querySelector('.cm-nav-signout');
  signoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    signoutBtn.textContent = 'Signing out…';
    await CM.signOut();
    window.location.reload();
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---- Stray magic-link detection ------------------------------------------
function forwardStrayMagicLink() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  if (hash.indexOf('access_token=') !== -1 || hash.indexOf('refresh_token=') !== -1) {
    if (window.location.pathname !== '/auth-callback.html') {
      try {
        const path = window.location.pathname + window.location.search;
        localStorage.setItem('cm_return_to', path);
      } catch (e) {}
      window.location.replace('/auth-callback.html' + search + hash);
      return true;
    }
  }
  return false;
}

// ---- Bootstrap -----------------------------------------------------------
async function bootstrap() {
  injectStyles();

  // Tell the rest of the page that window.CM is attached and usable.
  dispatchReady();

  // Bail out if this is the callback page itself — it has its own logic.
  if (window.location.pathname === '/auth-callback.html') return;

  if (forwardStrayMagicLink()) return;

  signInBtn = findSignInButton();
  if (!signInBtn) {
    console.debug('[cm-auth-nav] No Sign in button found on this page.');
    CM.onAuthChange((event, session) => dispatchAuthChange(event, session));
    return;
  }
  originalBtnHTML = signInBtn.innerHTML;

  signInBtn.addEventListener('click', handleSignInClick);

  const session = await CM.getSession();
  if (session?.user) {
    renderSignedIn(session.user);
    dispatchAuthChange('SIGNED_IN', session);
  }

  CM.onAuthChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      renderSignedIn(session.user);
    } else if (event === 'SIGNED_OUT') {
      renderSignedOut();
    }
    dispatchAuthChange(event, session);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

// v21 Watchlist save button — auto-mounts on /building/<slug>/ pages
if (location.pathname.startsWith('/building/')) {
  import('/assets/cm-watchlist-btn.js').catch(() => {});
}
