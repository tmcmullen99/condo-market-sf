  // ─── v20 SHELL: sidebar + view router + activity feed + persona toggle ───
  // Listens for cm-dash-rendered (dispatched at end of render()) and re-syncs.

  import { CM } from '/assets/cm-supabase.js';
  import { openTosModal } from '/assets/cm-tos-modal.js';
  import { SCHEDULE_URL } from '/assets/cm-config.js';

  const PERSONA_KEY = 'cm_persona';
  const VIEW_TITLES = {
    overview:      'Overview',
    listings:      'My listings',
    offers:        'My offers',
    referrals:     'Referrals',
    notifications: 'Notifications',
    settings:      'Settings',
  };
  const VALID_VIEWS = Object.keys(VIEW_TITLES);

  // ─── Format helpers (small, scoped to this module) ───────────────────────
  function fmtMoneyShort(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return '$0';
    if (n >= 1000000) {
      const m = n / 1000000;
      let s = m.toFixed(m >= 10 ? 1 : 2);
      s = s.replace(/\.?0+$/, '');
      return '$' + s + 'M';
    }
    if (n >= 1000) return '$' + Math.round(n/1000) + 'K';
    return '$' + Math.round(n);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function relativeTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    const months = Math.floor(days / 30);
    if (months < 12) return months + 'mo ago';
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  // ─── Body shell visibility ───────────────────────────────────────────────
  // The original render() sets #signed-in display to block on auth and 'none'
  // otherwise. We mirror that into a body class so our CSS can hide the
  // legacy masthead/main when the shell is on.
  function syncBodyShellClass() {
    const signedIn = document.getElementById('signed-in');
    if (!signedIn) return;
    const visible = signedIn.style.display && signedIn.style.display !== 'none';
    document.body.classList.toggle('cm-shell-on', !!visible);
  }

  // ─── Router ──────────────────────────────────────────────────────────────
  function currentViewFromHash() {
    const h = (window.location.hash || '').replace('#', '').toLowerCase();
    return VALID_VIEWS.includes(h) ? h : 'overview';
  }

  function activateView(view) {
    if (!VALID_VIEWS.includes(view)) view = 'overview';
    document.querySelectorAll('.dash-view').forEach(el => {
      el.classList.toggle('is-active', el.dataset.view === view);
    });
    document.querySelectorAll('#cm-sidebar-nav a').forEach(a => {
      a.classList.toggle('is-active', a.dataset.nav === view);
    });
    const titleEl = document.getElementById('dash-view-title');
    if (titleEl) titleEl.textContent = VIEW_TITLES[view];

    // Close mobile drawer when nav happens
    document.body.classList.remove('cm-sidebar-open');

    // If user navigates away from the listings view while the wizard is open,
    // close it cleanly so they can come back to a fresh state.
    if (view !== 'listings') {
      const mount = document.getElementById('mmm-wizard-mount');
      if (mount && mount.style.display === 'block') {
        mount.style.display = 'none';
        mount.innerHTML = '';
      }
    }

    // Reorder offers stack based on persona (homeowner → owner first; buyer → buyer first)
    if (view === 'offers') reorderOffersStack();

    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function reorderOffersStack() {
    const stack = document.getElementById('offers-stack');
    if (!stack) return;
    const owner = document.getElementById('owner-offers-card');
    const buyer = document.getElementById('buyer-offers-card');
    if (!owner || !buyer) return;
    const persona = readPersona();
    if (persona === 'buyer') {
      stack.appendChild(owner);    // buyer first → owner moves to end
      stack.insertBefore(buyer, owner);
    } else {
      stack.appendChild(buyer);    // homeowner first → owner stays first
      stack.insertBefore(owner, buyer);
    }
  }

  // ─── Persona toggle ──────────────────────────────────────────────────────
  function readPersona() {
    try {
      const v = localStorage.getItem(PERSONA_KEY);
      if (v === 'homeowner' || v === 'buyer') return v;
    } catch (e) {}
    return null; // unset → caller picks default
  }
  function writePersona(v) {
    try { localStorage.setItem(PERSONA_KEY, v); } catch (e) {}
  }
  function applyPersonaUI(persona) {
    document.querySelectorAll('.persona-toggle button').forEach(b => {
      b.classList.toggle('is-active', b.dataset.persona === persona);
    });

    // Swap the visible second stat card: homeowner sees Offers Received,
    // buyer sees Offers Made.
    const card = document.getElementById('stat-card-offers-received');
    if (card) {
      const label = card.querySelector('.stat-label');
      if (label) label.textContent = persona === 'buyer' ? 'My Offers' : 'Offers Received';
    }
  }
  function autoPersona(myListingsCount) {
    return myListingsCount > 0 ? 'homeowner' : 'buyer';
  }

  // ─── Sidebar profile + progress sync ─────────────────────────────────────
  async function syncSidebar() {
    let user = null, profile = null, credits = [];
    try {
      const session = await CM.getSession();
      user = session?.user || null;
    } catch (e) {}
    if (!user) return;

    try { profile = await CM.getMyProfile(); } catch (e) {}
    try { credits = await CM.listMyReferralCredits(); } catch (e) {}

    const name = profile?.full_name || user.user_metadata?.full_name || (user.email || '').split('@')[0] || '—';
    const email = user.email || '—';
    const sbName = document.getElementById('sb-name');
    const sbEmail = document.getElementById('sb-email');
    if (sbName) sbName.textContent = name;
    if (sbEmail) sbEmail.textContent = email;
    const notifEmail = document.getElementById('notif-email');
    if (notifEmail) notifEmail.textContent = email;

    const refCount = Math.min((credits || []).length, 5);
    const pct = Math.min(refCount * 0.2, 1.0);
    const pctText = (Math.round(pct * 10) / 10).toFixed(1) + '%';
    const lbl = document.getElementById('sb-ref-label');
    const pctEl = document.getElementById('sb-ref-pct');
    const fill = document.getElementById('sb-ref-fill');
    if (lbl) lbl.textContent = refCount + ' of 5 referrals';
    if (pctEl) pctEl.textContent = pctText;
    if (fill) fill.style.width = (refCount / 5 * 100) + '%';

    // Persona: respect explicit choice; otherwise auto-pick based on listings count.
    let persona = readPersona();
    if (!persona) {
      try {
        const listings = await CM.getMyListings();
        const visible = (listings || []).filter(l => l.status !== 'removed');
        persona = autoPersona(visible.length);
      } catch (e) { persona = 'buyer'; }
    }
    applyPersonaUI(persona);
  }

  // ─── Activity feed ───────────────────────────────────────────────────────
  // Derives a recent-activity timeline from listings + owner-offers + buyer-offers.
  // Each event has: { ts, type, icon, iconClass, html }
  async function renderActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;

    let listings = [], ownerOffers = [], buyerOffers = [], watchlist = [];
    try { listings = await CM.getMyListings(); } catch (e) {}
    try { ownerOffers = await CM.listOffersForMyListings(); } catch (e) {}
    try { buyerOffers = await CM.listMyOffers(); } catch (e) {}
    try { watchlist = await CM.listMyWatchlist(); } catch (e) {}

    const events = [];

    // Listing lifecycle events
    for (const l of (listings || [])) {
      const addr = l.unit_number ? l.address + ' · ' + l.unit_number : l.address;
      events.push({
        ts: l.created_at,
        icon: '⌂', iconClass: '',
        html: 'You listed <a href="#listings">' + escapeHtml(addr) + '</a> at <span class="accent">' + escapeHtml(fmtMoneyShort(l.price)) + '</span>.',
      });
      if (l.status === 'paused' && l.updated_at && l.updated_at !== l.created_at) {
        events.push({
          ts: l.updated_at,
          icon: '⏸', iconClass: 'is-amber',
          html: 'You paused <a href="#listings">' + escapeHtml(addr) + '</a>.',
        });
      } else if (l.status === 'sold' && l.updated_at && l.updated_at !== l.created_at) {
        events.push({
          ts: l.updated_at,
          icon: '✓', iconClass: 'is-gain',
          html: '<a href="#listings">' + escapeHtml(addr) + '</a> marked sold.',
        });
      } else if (l.status === 'removed' && l.updated_at && l.updated_at !== l.created_at) {
        events.push({
          ts: l.updated_at,
          icon: '×', iconClass: 'is-loss',
          html: 'You removed <a href="#listings">' + escapeHtml(addr) + '</a>.',
        });
      }
    }

    // Owner-side: offers received
    for (const o of (ownerOffers || [])) {
      const buyerName = o.buyer_name || (o.buyer_email || '').split('@')[0] || 'A buyer';
      const addr = o.listing?.address || o.building_slug || 'your unit';
      events.push({
        ts: o.created_at,
        icon: '◇', iconClass: 'is-bronze',
        html: escapeHtml(buyerName) + ' offered <span class="accent">' + escapeHtml(fmtMoneyShort(o.offer_amount)) + '</span> on <a href="#offers">' + escapeHtml(addr) + '</a>.',
      });
      // Status-change events on owner offers (most-recent terminal change)
      const stUpdated = o.updated_at && o.updated_at !== o.created_at;
      if (stUpdated && o.status === 'accepted') {
        events.push({
          ts: o.updated_at,
          icon: '✓', iconClass: 'is-gain',
          html: 'You accepted ' + escapeHtml(buyerName) + "'s offer on <a href=\"#offers\">" + escapeHtml(addr) + '</a>.',
        });
      } else if (stUpdated && o.status === 'declined') {
        events.push({
          ts: o.updated_at,
          icon: '×', iconClass: 'is-loss',
          html: 'You declined ' + escapeHtml(buyerName) + "'s offer on <a href=\"#offers\">" + escapeHtml(addr) + '</a>.',
        });
      } else if (stUpdated && o.status === 'countered' && o.current_round > 1) {
        events.push({
          ts: o.updated_at,
          icon: '↔', iconClass: 'is-bronze',
          html: 'Counter on <a href="#offers">' + escapeHtml(addr) + '</a> · round ' + escapeHtml(String(o.current_round)) + '.',
        });
      }
    }

    // Buyer-side: offers I've made
    for (const o of (buyerOffers || [])) {
      const addr = o.listing?.address || o.building_slug || 'a building';
      events.push({
        ts: o.created_at,
        icon: '→', iconClass: '',
        html: 'You offered <span class="accent">' + escapeHtml(fmtMoneyShort(o.offer_amount)) + '</span> on <a href="#offers">' + escapeHtml(addr) + '</a>.',
      });
      const stUpdated = o.updated_at && o.updated_at !== o.created_at;
      if (stUpdated && o.status === 'accepted') {
        events.push({
          ts: o.updated_at,
          icon: '✓', iconClass: 'is-gain',
          html: 'Your offer on <a href="#offers">' + escapeHtml(addr) + '</a> was <span class="accent">accepted</span>.',
        });
      } else if (stUpdated && o.status === 'declined') {
        events.push({
          ts: o.updated_at,
          icon: '×', iconClass: 'is-loss',
          html: 'Your offer on <a href="#offers">' + escapeHtml(addr) + '</a> was declined.',
        });
      } else if (stUpdated && o.status === 'withdrawn') {
        events.push({
          ts: o.updated_at,
          icon: '↩', iconClass: '',
          html: 'You withdrew your offer on <a href="#offers">' + escapeHtml(addr) + '</a>.',
        });
      } else if (stUpdated && o.status === 'countered' && o.current_round > 1) {
        events.push({
          ts: o.updated_at,
          icon: '↔', iconClass: 'is-bronze',
          html: 'Counter on your offer for <a href="#offers">' + escapeHtml(addr) + '</a> · round ' + escapeHtml(String(o.current_round)) + '.',
        });
      }
    }

    // Watchlist saves (v22)
    for (const w of (watchlist || [])) {
      const slug = w.building_slug || '';
      const displayName = slug
        ? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : 'a building';
      events.push({
        ts: w.created_at,
        icon: '★', iconClass: 'is-bronze',
        html: 'You saved <a href="/building/' + escapeHtml(slug) + '/">' + escapeHtml(displayName) + '</a> to your watchlist.',
      });
    }

    // Sort newest-first, take top 8
    events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const top = events.slice(0, 8);

    if (top.length === 0) {
      feed.innerHTML = '<div class="empty"><div class="em-title">No activity yet</div><p>Once you list a unit or submit an offer, the timeline will start filling in here.</p></div>';
      return;
    }

    feed.innerHTML = '<div class="activity-list">' + top.map(e => (
      '<div class="activity-item">' +
        '<div class="activity-icon ' + (e.iconClass || '') + '">' + escapeHtml(e.icon) + '</div>' +
        '<div class="activity-text">' + e.html + '</div>' +
        '<div class="activity-when">' + escapeHtml(relativeTime(e.ts)) + '</div>' +
      '</div>'
    )).join('') + '</div>';

    // Update offers nav badge: count of offers awaiting MY response
    let yourTurnCount = 0;
    for (const o of (ownerOffers || [])) {
      if ((o.status === 'pending' || o.status === 'countered') && o.awaiting_response_from === 'owner') yourTurnCount++;
    }
    for (const o of (buyerOffers || [])) {
      if (o.status === 'countered' && o.awaiting_response_from === 'buyer') yourTurnCount++;
    }
    const badge = document.getElementById('sb-badge-offers');
    if (badge) {
      if (yourTurnCount > 0) {
        badge.textContent = String(yourTurnCount);
        badge.classList.add('is-on');
      } else {
        badge.textContent = '';
        badge.classList.remove('is-on');
      }
    }

    // Empty-state next-action card on Overview
    const nextCard = document.getElementById('next-action-card');
    if (nextCard) {
      const visibleListings = (listings || []).filter(l => l.status !== 'removed');
      const noListings = visibleListings.length === 0;
      const noOffersMade = (buyerOffers || []).length === 0;
      const persona = readPersona() || autoPersona(visibleListings.length);
      if (top.length === 0 && noListings && persona !== 'buyer') {
        document.getElementById('next-action-title').textContent = 'Set your make-me-move number';
        document.getElementById('next-action-body').textContent = 'List your unit silently — visible only to verified buyers signed into Condo Market, never on Zillow or MLS.';
        const btn = document.getElementById('next-action-btn');
        btn.textContent = 'Create my listing →';
        btn.setAttribute('href', '#listings');
        nextCard.style.display = 'block';
      } else if (top.length === 0 && noOffersMade && persona === 'buyer') {
        document.getElementById('next-action-title').textContent = 'Find a unit you\u2019d sign for';
        document.getElementById('next-action-body').textContent = 'Browse 64 SF condo buildings. Submit a signed Letter of Intent on any unit — owner sees it, you start a real negotiation.';
        const btn = document.getElementById('next-action-btn');
        btn.textContent = 'Browse buildings →';
        btn.setAttribute('href', '/buildings/');
        nextCard.style.display = 'block';
      } else {
        nextCard.style.display = 'none';
      }
    }
  }

  // ─── Saved buildings (v22) ───────────────────────────────────────────────
  // Renders the watchlist as a photo grid on the Overview view. Hidden when empty.
  async function renderSavedBuildings() {
    const card = document.getElementById('saved-buildings-card');
    const grid = document.getElementById('saved-buildings-grid');
    if (!card || !grid) return;

    let watchlist = [];
    try { watchlist = await CM.listMyWatchlist(); } catch (e) {}

    if (!watchlist.length) {
      card.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    // Lazy-load buildings index (cached on window for repeat renders)
    if (!window.CM_BUILDINGS_INDEX) {
      try {
        const r = await fetch('/assets/buildings.json');
        const list = await r.json();
        const idx = {};
        for (const b of (list || [])) {
          const slug = (b.href || '').replace(/^\/building\//, '').replace(/\/$/, '');
          if (slug) idx[slug] = b;
        }
        window.CM_BUILDINGS_INDEX = idx;
      } catch (e) {
        window.CM_BUILDINGS_INDEX = {};
      }
    }
    const idx = window.CM_BUILDINGS_INDEX || {};

    card.style.display = '';
    grid.innerHTML = watchlist.map(w => {
      const slug = w.building_slug || '';
      const b = idx[slug] || {};
      const name = b.name || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const hood = b.hood || '';
      const img  = b.img  || '';
      const href = '/building/' + slug + '/';
      return (
        '<a class="saved-building-tile" href="' + escapeHtml(href) + '">' +
          '<div class="saved-building-img"' +
            (img ? ' style="background-image:url(\'' + escapeHtml(img) + '\')"' : '') + '></div>' +
          '<div class="saved-building-meta">' +
            '<div class="saved-building-name">' + escapeHtml(name) + '</div>' +
            (hood ? '<div class="saved-building-hood">' + escapeHtml(hood) + '</div>' : '') +
          '</div>' +
        '</a>'
      );
    }).join('');
  }

  // ─── Wiring ──────────────────────────────────────────────────────────────
  function wireSidebarOnce() {
    if (window._cmShellWired) return;
    window._cmShellWired = true;

    // Persona buttons
    document.querySelectorAll('.persona-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.persona;
        if (v !== 'homeowner' && v !== 'buyer') return;
        writePersona(v);
        applyPersonaUI(v);
        // Re-derive layout that depends on persona
        reorderOffersStack();
        renderActivityFeed();
      });
    });

    // Sidebar nav links — use default anchor behavior; hashchange handler does work
    // Hamburger toggle
    const hamburger = document.getElementById('hamburger-btn');
    const closeBtn  = document.getElementById('sidebar-close-btn');
    const overlay   = document.getElementById('sidebar-overlay');
    hamburger?.addEventListener('click', () => document.body.classList.add('cm-sidebar-open'));
    closeBtn?.addEventListener('click', () => document.body.classList.remove('cm-sidebar-open'));
    overlay?.addEventListener('click', () => document.body.classList.remove('cm-sidebar-open'));

    // Sign-out (sidebar + settings)
    async function doSignOut(triggerEl) {
      if (!confirm('Sign out of Condo Market?')) return;
      const orig = triggerEl ? triggerEl.textContent : '';
      if (triggerEl) { triggerEl.disabled = true; triggerEl.textContent = 'Signing out…'; }
      try { await CM.signOut(); } catch (e) {}
      window.location.href = '/';
    }
    document.getElementById('sb-signout')?.addEventListener('click', (e) => doSignOut(e.currentTarget));
    document.getElementById('settings-signout')?.addEventListener('click', (e) => doSignOut(e.currentTarget));

    // Settings: view TOS
    document.getElementById('settings-tos-view')?.addEventListener('click', () => openTosModal({ mode: 'info' }));

    // Apply SCHEDULE_URL from cm-config.js (so Tim can swap mailto for Acuity later in one place)
    const schedBtn = document.getElementById('schedule-call-btn');
    if (schedBtn && SCHEDULE_URL) schedBtn.setAttribute('href', SCHEDULE_URL);

    // Hash router
    window.addEventListener('hashchange', () => activateView(currentViewFromHash()));

    // ESC closes mobile drawer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.body.classList.remove('cm-sidebar-open');
    });

    // Initial route
    activateView(currentViewFromHash());
  }

  // ─── Lifecycle hooks ─────────────────────────────────────────────────────
  // The legacy render() in the script above dispatches cm-dash-rendered when
  // it finishes. We use that as the trigger to (re)wire and refresh the shell.
  window.addEventListener('cm-dash-rendered', () => {
    syncBodyShellClass();
    wireSidebarOnce();
    syncSidebar();
    renderActivityFeed();
    renderSavedBuildings();
  });

  // Also sync body class on initial DOM ready in case render() hasn't fired yet
  if (document.readyState !== 'loading') {
    syncBodyShellClass();
  } else {
    document.addEventListener('DOMContentLoaded', syncBodyShellClass);
  }
