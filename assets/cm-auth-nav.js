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
 *      button with "Hi, [FirstName]" and an account menu (who is signed in,
 *      buildings, dashboard, off-market list, Admin for agents, Sign out).
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
  /* Account menu (Tim, 17 Oct 2026: "Redesign drop down menu UI from building
     pages"). The menu is inserted where the Sign in button was, so it inherits
     whatever nav it lands in: on the building pages that is .nav-meta, whose
     link rule (cream at 64%, uppercase mono) made every link but Sign out
     near-invisible on the old white card. Everything below is scoped to the
     menu's id, so a page's link rules can't reach it, and every property a nav
     might set is stated rather than inherited. */
  .cm-nav-user-wrap { position: relative; display: inline-block; }
  .cm-nav-user-wrap > .cm-acct-btn.cm-acct-btn { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
  .cm-acct-chev { width: 9px; height: 9px; flex: 0 0 auto; transition: transform .18s ease; }
  .cm-acct-btn[aria-expanded="true"] .cm-acct-chev { transform: rotate(180deg); }
  #cm-acct-menu, #cm-acct-menu * { box-sizing: border-box; text-transform: none; letter-spacing: normal; }
  #cm-acct-menu {
    position: absolute; top: calc(100% + 12px); right: 0; z-index: 9999;
    width: 308px; max-width: calc(100vw - 24px); padding: 6px;
    background: #161a24; color: #ece7db; text-align: left;
    border: 1px solid rgba(236, 231, 219, 0.12); border-radius: 16px;
    box-shadow: 0 24px 60px rgba(10, 13, 18, 0.42), 0 2px 8px rgba(10, 13, 18, 0.25);
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif; font-size: 14px; font-weight: 400; line-height: 1.35;
    white-space: normal; visibility: hidden; opacity: 0; transform: translateY(-6px);
    transition: opacity .16s ease, transform .16s ease, visibility 0s linear .16s;
  }
  #cm-acct-menu.cm-open { visibility: visible; opacity: 1; transform: none; transition: opacity .16s ease, transform .16s ease; }
  #cm-acct-menu::before {
    content: ''; position: absolute; top: -6px; right: var(--cm-caret, 26px); width: 11px; height: 11px;
    background: #161a24; transform: rotate(45deg);
    border-left: 1px solid rgba(236, 231, 219, 0.12); border-top: 1px solid rgba(236, 231, 219, 0.12);
  }
  #cm-acct-menu .cm-acct-id { display: flex; align-items: center; gap: 12px; padding: 12px 12px 14px; }
  #cm-acct-menu .cm-acct-av {
    width: 40px; height: 40px; flex: 0 0 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: #C2410C; color: #fff; font-family: 'Playfair Display', Georgia, serif; font-size: 18px; font-weight: 500;
  }
  #cm-acct-menu .cm-acct-who { min-width: 0; flex: 1; }
  #cm-acct-menu .cm-acct-name { display: flex; align-items: center; gap: 8px; color: #fff; font-size: 15px; font-weight: 600; }
  #cm-acct-menu .cm-acct-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #cm-acct-menu .cm-acct-role {
    flex: 0 0 auto; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 9.5px; font-weight: 500;
    letter-spacing: .12em; text-transform: uppercase; color: #f28c63;
    border: 1px solid rgba(242, 140, 99, 0.4); border-radius: 999px; padding: 2px 7px;
  }
  #cm-acct-menu .cm-acct-mail {
    display: block; margin-top: 3px; color: rgba(236, 231, 219, 0.58);
    font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11.5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #cm-acct-menu .cm-acct-sep { height: 1px; background: rgba(236, 231, 219, 0.1); margin: 4px 6px; }
  #cm-acct-menu .cm-acct-item {
    display: flex; align-items: center; gap: 12px; width: 100%; margin: 0; padding: 9px 10px;
    background: transparent; border: 0; border-radius: 11px; cursor: pointer;
    color: #f3efe6; font: inherit; text-align: left; text-decoration: none; outline: none;
    transition: background .14s ease;
  }
  #cm-acct-menu .cm-acct-item:hover, #cm-acct-menu .cm-acct-item:focus-visible { background: rgba(236, 231, 219, 0.07); color: #fff; }
  #cm-acct-menu .cm-acct-item:focus-visible { box-shadow: inset 0 0 0 1px rgba(242, 140, 99, 0.55); }
  #cm-acct-menu .cm-acct-ico {
    width: 34px; height: 34px; flex: 0 0 34px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(236, 231, 219, 0.06); color: rgba(236, 231, 219, 0.78);
    transition: background .14s ease, color .14s ease;
  }
  #cm-acct-menu .cm-acct-ico svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  #cm-acct-menu .cm-acct-item:hover .cm-acct-ico, #cm-acct-menu .cm-acct-item:focus-visible .cm-acct-ico { background: rgba(232, 93, 42, 0.16); color: #f28c63; }
  #cm-acct-menu .cm-acct-txt { display: block; min-width: 0; flex: 1; }
  #cm-acct-menu .cm-acct-t { display: block; font-size: 14px; font-weight: 500; color: inherit; }
  #cm-acct-menu .cm-acct-s { display: block; margin-top: 1px; font-size: 12px; color: rgba(236, 231, 219, 0.52); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #cm-acct-menu .cm-acct-go { flex: 0 0 auto; color: #f28c63; opacity: 0; transform: translateX(-4px); transition: opacity .14s ease, transform .14s ease; font-size: 15px; }
  #cm-acct-menu .cm-acct-item:hover .cm-acct-go, #cm-acct-menu .cm-acct-item:focus-visible .cm-acct-go { opacity: 1; transform: none; }
  #cm-acct-menu .cm-acct-out { color: rgba(236, 231, 219, 0.72); padding-top: 8px; padding-bottom: 8px; }
  #cm-acct-menu .cm-acct-out .cm-acct-ico { background: transparent; }
  #cm-acct-menu .cm-acct-out[disabled] { opacity: .6; cursor: default; }
  @media (prefers-reduced-motion: reduce) {
    #cm-acct-menu, #cm-acct-menu.cm-open, .cm-acct-chev, #cm-acct-menu .cm-acct-go { transition: none; }
  }
  /* Phones (the building pages' collapsed masthead): the account pill stays
     beside the burger like the Sign in pill does, instead of hiding with the
     links. With the burger open, the account rows sit inline at the foot of
     the same dark panel rather than as a popover inside it. */
  .masthead-row.cm-nav-collapsed .nav-meta > .cm-nav-user-wrap.cm-nav-user-wrap { display: inline-block; }
  .masthead-row.cm-nav-collapsed.is-open .nav-meta > .cm-nav-user-wrap.cm-nav-user-wrap { display: block; padding: 6px 8px 10px; }
  .masthead-row.cm-nav-collapsed.is-open .cm-nav-user-wrap > .cm-acct-btn { display: none !important; }
  .masthead-row.cm-nav-collapsed.is-open #cm-acct-menu {
    position: static; width: auto; max-width: none; visibility: visible; opacity: 1; transform: none;
    background: transparent; border: 0; box-shadow: none; padding: 0; transition: none;
  }
  .masthead-row.cm-nav-collapsed.is-open #cm-acct-menu::before { display: none; }
  @media (max-width: 720px) {
    #cm-acct-menu { width: min(320px, calc(100vw - 24px)); }
    #cm-acct-menu .cm-acct-item { padding: 11px 10px; }
  }
  /* Hide signed-out-only elements when the user is authenticated.
     Targets both: (1) any element opting in via .cm-hide-when-signed-in
     (2) the existing .dossier-enhanced-cta blocks already in 63 building
     pages, so we don't have to patch each page. */
  body.cm-signed-in .cm-hide-when-signed-in,
  body.cm-signed-in .dossier-enhanced-cta {
    display: none !important;
  }
  /* Hide every link to /history/ site-wide (added 2026-05-10).
     Tim de-emphasized the History page; the link should disappear from
     every page's masthead nav AND footer without patching each page's
     hardcoded markup. The page itself at /history/ stays reachable by URL.
     Same precedent as the .dossier-enhanced-cta rule above. */
  a[href="/history/"],
  a[href="/history"] {
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
  renderedFor = null;
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

const ICONS = {
  buildings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M2.5 21h19M8 8h2M8 12h2M8 16h2M17 13h.01M17 17h.01"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="8.5" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.6"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.6"/><rect x="3.5" y="15" width="7" height="5.5" rx="1.6"/></svg>',
  offmarket: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3M16.5 6.5l2.5 2.5M14 9l2 2"/></svg>',
  admin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/></svg>'
};
const CHEV = '<svg class="cm-acct-chev" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function menuItem(href, icon, title, sub) {
  return '<a class="cm-acct-item" role="menuitem" href="' + href + '">'
    + '<span class="cm-acct-ico">' + ICONS[icon] + '</span>'
    + '<span class="cm-acct-txt"><span class="cm-acct-t">' + title + '</span><span class="cm-acct-s">' + sub + '</span></span>'
    + '<span class="cm-acct-go" aria-hidden="true">→</span></a>';
}

/* renderSignedIn runs for getSession() and again for INITIAL_SESSION, often
   while the first call is still waiting on the profile. The first version built
   a second menu each time: the one on the page stayed, the variable pointed at a
   detached copy, so a sign-out from another tab could not restore the button.
   One menu per user now; a repeat call for the same user is a no-op. */
let renderedFor = null;
let docWired = false;

async function renderSignedIn(user) {
  document.body.classList.remove('cm-signed-out');
  document.body.classList.add('cm-signed-in');
  if (!signInBtn || !user) return;
  if (renderedFor === user.id && (!userMenuWrap || userMenuWrap.isConnected)) return;
  renderedFor = user.id;

  let profile = null;
  try { profile = await CM.getMyProfile(); } catch (e) {}
  if (renderedFor !== user.id) return;   // signed out (or switched) while we waited
  const firstName = getFirstName(profile, user);
  const fullName = (profile?.full_name || user?.user_metadata?.full_name || '').trim() || firstName;
  const isAdmin = profile?.role === 'admin';

  const wrap = document.createElement('div');
  wrap.className = 'cm-nav-user-wrap';

  const tagName = signInBtn.tagName.toLowerCase();
  const userBtn = document.createElement(tagName === 'a' ? 'a' : 'button');
  userBtn.className = (signInBtn.className ? signInBtn.className + ' ' : '') + 'cm-acct-btn';
  if (tagName === 'a') { userBtn.setAttribute('href', '#account'); userBtn.setAttribute('role', 'button'); }
  else userBtn.setAttribute('type', 'button');
  userBtn.setAttribute('aria-haspopup', 'menu');
  userBtn.setAttribute('aria-expanded', 'false');
  userBtn.setAttribute('aria-controls', 'cm-acct-menu');
  userBtn.innerHTML = '<span>Hi, ' + escapeHtml(firstName) + '</span>' + CHEV;

  const menu = document.createElement('div');
  menu.className = 'cm-nav-user-menu';
  menu.id = 'cm-acct-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Your account');
  menu.innerHTML =
    '<div class="cm-acct-id" role="presentation">'
    + '<span class="cm-acct-av" aria-hidden="true">' + escapeHtml((fullName || '?').charAt(0).toUpperCase()) + '</span>'
    + '<span class="cm-acct-who"><span class="cm-acct-name"><span>' + escapeHtml(fullName) + '</span>'
    + (isAdmin ? '<em class="cm-acct-role" style="font-style:normal">Agent</em>' : '') + '</span>'
    + '<span class="cm-acct-mail" title="' + escapeHtml(user.email || '') + '">' + escapeHtml(user.email || '') + '</span></span>'
    + '</div>'
    + '<div class="cm-acct-sep" role="separator"></div>'
    + menuItem('/buildings/', 'buildings', 'Browse buildings', 'Every building we track')
    + menuItem('/dashboard/', 'dashboard', 'My dashboard', 'Your listings, offers and alerts')
    + menuItem('/account/off-market/', 'offmarket', 'Off-market listings', 'Coming soon and Exchange homes')
    + (isAdmin ? menuItem('/admin/', 'admin', 'Admin', 'Agent desk') : '')
    + '<div class="cm-acct-sep" role="separator"></div>'
    + '<button class="cm-acct-item cm-acct-out cm-nav-signout" role="menuitem" type="button">'
    + '<span class="cm-acct-ico">' + ICONS.out + '</span><span class="cm-acct-txt"><span class="cm-acct-t">Sign out</span></span></button>';

  wrap.appendChild(userBtn);
  wrap.appendChild(menu);

  // Replace whatever stands in the nav now: the Sign in button, or a menu
  // left over from an earlier render.
  const current = (userMenuWrap && userMenuWrap.isConnected) ? userMenuWrap : signInBtn;
  if (current.parentNode) current.parentNode.replaceChild(wrap, current);
  userMenuWrap = wrap;

  const items = () => Array.prototype.slice.call(menu.querySelectorAll('.cm-acct-item'));
  const isOpen = () => menu.classList.contains('cm-open');
  /* Anchored under the pill's right edge, then nudged back inside the
     viewport: on a phone the pill sits left of the burger, and a 320px card
     hung from it ran off the left edge. The caret follows the nudge. */
  const place = () => {
    if (menu.style.position === 'static' || getComputedStyle(menu).position === 'static') return;
    menu.style.right = ''; menu.style.removeProperty('--cm-caret');
    const r = menu.getBoundingClientRect(), b = userBtn.getBoundingClientRect(), vw = document.documentElement.clientWidth, pad = 12;
    let shift = 0;
    if (r.left < pad) shift = r.left - pad;                        // negative right: move right
    else if (r.right > vw - pad) shift = r.right - (vw - pad);      // positive right: move left
    if (shift) menu.style.right = shift + 'px';
    const mr = r.right - shift;                                     // menu's right edge after the nudge
    const caret = Math.max(16, Math.min(r.width - 28, mr - (b.left + b.width / 2) - 5.5));
    menu.style.setProperty('--cm-caret', caret + 'px');
  };
  const setOpen = (open, focusFirst) => {
    if (open) place();
    menu.classList.toggle('cm-open', open);
    userBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && focusFirst) { const f = items()[0]; if (f) setTimeout(() => f.focus(), 20); }
  };

  userBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // A click from the keyboard (Enter/Space reports detail 0) moves focus in.
    setOpen(!isOpen(), e.detail === 0);
  });
  userBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true, true); }
  });
  menu.addEventListener('keydown', (e) => {
    const list = items(); const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); userBtn.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (list[(i + 1) % list.length] || list[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (list[(i - 1 + list.length) % list.length] || list[0]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  });

  if (!docWired) {
    docWired = true;
    document.addEventListener('click', (e) => {
      const w = userMenuWrap; if (!w || w.contains(e.target)) return;
      const m = w.querySelector('#cm-acct-menu'), b = w.querySelector('.cm-acct-btn');
      if (m && m.classList.contains('cm-open')) { m.classList.remove('cm-open'); if (b) b.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const w = userMenuWrap; if (!w) return;
      const m = w.querySelector('#cm-acct-menu'), b = w.querySelector('.cm-acct-btn');
      if (m && m.classList.contains('cm-open')) { m.classList.remove('cm-open'); if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); } }
    });
  }

  const signoutBtn = menu.querySelector('.cm-nav-signout');
  signoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    signoutBtn.disabled = true;
    signoutBtn.querySelector('.cm-acct-t').textContent = 'Signing out…';
    try { await CM.signOut(); } catch (err) { console.warn('[cm-auth-nav] sign out failed', err); }
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
// Email deep links (Tim, 16 Oct 2026): ?signin=1 opens the sign-in form, ?join=1
// the free-account form, so a link in an email lands on the page with the door
// already open. The flag comes off the address bar first: the return path the
// modal remembers is the clean page, and a reload does not reopen it. Someone
// already signed in just sees the page, unlocked.
async function openFromLink() {
  let mode = null;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has('signin')) mode = 'login';
    else if (u.searchParams.has('join')) mode = 'signup';
    /* ?auth=signup|login&return=<path> (20 Oct 2026): the form cm-mmm.js, cm-cma-portfolio.js and
       cm-report.js have linked to for months, which nothing handled - the home page just loaded.
       The return path is remembered for after the sign-in. */
    else if (u.searchParams.has('auth')) {
      mode = u.searchParams.get('auth') === 'login' ? 'login' : 'signup';
      const ret = u.searchParams.get('return');
      if (ret && /^\/[^\s]*$/.test(ret) && ret.indexOf('//') !== 0) { try { localStorage.setItem('cm_return_to', ret); } catch (e) {} }
    }
    if (!mode) return;
    u.searchParams.delete('signin');
    u.searchParams.delete('join');
    u.searchParams.delete('auth');
    u.searchParams.delete('return');
    const qs = u.searchParams.toString();
    history.replaceState(history.state, '', u.pathname + (qs ? '?' + qs : '') + u.hash);
  } catch (e) { return; }
  // They came from an email, so we know who they are: don't also ask the
  // own-or-looking question this visit (cm-intent.js reads this key).
  try { sessionStorage.setItem('cm_prompt_asked', '1'); } catch (e) {}
  try {
    const session = await CM.getSession();
    if (session && session.user) return;
  } catch (e) { /* no session check: open the form anyway */ }
  openAuthModal(mode);
}

async function bootstrap() {
  injectStyles();

  // Tell the rest of the page that window.CM is attached and usable.
  dispatchReady();

  // Bail out if this is the callback page itself — it has its own logic.
  if (window.location.pathname === '/auth-callback.html') return;

  if (forwardStrayMagicLink()) return;

  openFromLink();

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
      /* A ?auth=...&return= link remembered where to go (openFromLink); a password sign-in never
         reaches auth-callback.html, so the return happens here. Same-origin paths only. */
      if (event === 'SIGNED_IN') {
        let ret = null;
        try { ret = localStorage.getItem('cm_return_to'); } catch (e) {}
        if (ret && /^\/[^\s]*$/.test(ret) && ret.indexOf('//') !== 0 && ret.split('#')[0] !== window.location.pathname) {
          try { localStorage.removeItem('cm_return_to'); } catch (e) {}
          window.location.assign(ret);
        }
      }
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
  // v22.5 Sales & pricing section (public + enhanced layers)
  import('/assets/cm-building-sales.js').catch(() => {});
}

// Site-tracking — load the FULL tracker (cm-track.js: pageview/dwell/scroll +
// CTA auto-wiring + window.cmTrack for funnel events) on EVERY page. Guard against
// double-loading: skip if cm-track.js is already directly included (server-rendered
// pages do this via the worker) OR if the legacy beacon is present. This makes the
// funnel-event instrumentation in cm-auth.js work sitewide, including on static pages
// like /owner-signup/ that previously loaded only the beacon (no cmTrack, no CTA tracking).
if (!document.querySelector('script[src*="cm-track.js"]') &&
    !document.querySelector('script[src*="cm-beacon.js"]')) {
  const cmTrk = document.createElement('script');
  cmTrk.src = '/assets/cm-track.js';
  cmTrk.defer = true;
  document.head.appendChild(cmTrk);
}
