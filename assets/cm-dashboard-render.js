  import { CM } from '/assets/cm-supabase.js';
  import { openListingWizard } from '/assets/cm-listing-wizard.js';
  import { openTosModal, hasAcceptedCurrentTos } from '/assets/cm-tos-modal.js';
  import { openCounterModal } from '/assets/cm-counter-modal.js';

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const STORE_KEY = 'cm_owner_intent';

  function readIntent() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.address || !parsed.price) return null;
      return parsed;
    } catch (e) { return null; }
  }
  function clearIntent() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }
  function fmtMoney(n) {
    if (!n) return '$0';
    return '$' + Math.round(Number(n)).toLocaleString('en-US');
  }
  function fmtMoneyShort(n) {
    n = Number(n);
    if (n >= 1000000) {
      const m = n / 1000000;
      let s = m.toFixed(m >= 10 ? 1 : 2);
      s = s.replace(/\.?0+$/, '');
      return '$' + s + 'M';
    }
    if (n >= 1000) return '$' + Math.round(n/1000) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { return (Math.round(n * 10) / 10).toFixed(1) + '%'; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function relativeDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / (24*60*60*1000));
    if (days === 0) return 'Listed today';
    if (days === 1) return 'Listed yesterday';
    if (days < 30) return 'Listed ' + days + ' days ago';
    if (days < 365) return 'Listed ' + Math.floor(days/30) + ' months ago';
    return 'Listed ' + d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  function setMsg(el, text, kind) {
    if (!el) return;
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="mmm-msg is-' + kind + '">' + escapeHtml(text) + '</div>';
  }

  // ─── Building auto-resolve from address ──────────────────────────────────
  // Fuzzy-matches a free-text address against buildings.json so the saved
  // listing gets a slug (which the building page Featured section reads).
  // No match → building stays null and listing exists but appears on no
  // building page.

  let _buildingsCache = null;
  async function loadBuildings() {
    if (_buildingsCache) return _buildingsCache;
    try {
      const r = await fetch('/assets/buildings.json', { cache: 'force-cache' });
      if (!r.ok) return [];
      _buildingsCache = await r.json();
      return _buildingsCache;
    } catch (e) {
      console.warn('[cm-dash] failed to load buildings.json:', e);
      _buildingsCache = [];
      return _buildingsCache;
    }
  }

  function _normalizeAddr(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function resolveBuildingSlug(enteredAddress, buildings) {
    if (!enteredAddress || !buildings || !buildings.length) return null;
    const enteredNorm = _normalizeAddr(enteredAddress);
    if (!enteredNorm) return null;
    for (const b of buildings) {
      const candidates = [b.street, b.dstreet, b.name, b.dname].filter(Boolean);
      for (const c of candidates) {
        const cTokens = _normalizeAddr(c).split(' ');
        if (cTokens.length < 2) continue;
        const pattern = cTokens.slice(0, 2).join(' ');
        if (enteredNorm.startsWith(pattern + ' ') || enteredNorm === pattern) {
          if (b.href) return b.href.split('/').filter(Boolean).pop();
        }
      }
    }
    return null;
  }

  // ─── Wizard helpers ──────────────────────────────────────────────────────

  let _wizardOpen = false;

  async function openWizard(listingOrNull) {
    _wizardOpen = true;
    const mount   = document.getElementById('mmm-wizard-mount');
    const confirmEl = document.getElementById('mmm-confirm');
    const emptyEl   = document.getElementById('mmm-empty');
    const activeEl  = document.getElementById('mmm-active');
    confirmEl.style.display = 'none';
    emptyEl.style.display   = 'none';
    activeEl.style.display  = 'none';
    mount.style.display     = 'block';

    // For edit mode: re-fetch the full listing so the wizard sees all v17 columns
    // (cover_photo_path, additional_photo_paths, floorplan_path, orientation).
    let listing = listingOrNull;
    if (listing && listing.id) {
      const fresh = await CM.getListingById(listing.id);
      if (fresh) listing = fresh;
    }

    openListingWizard(mount, {
      listing,
      onComplete: async () => {
        _wizardOpen = false;
        mount.style.display = 'none';
        mount.innerHTML = '';
        clearIntent();          // wipe any signup-page intent — we just published
        await refreshMMM();
      },
      onCancel: async () => {
        _wizardOpen = false;
        mount.style.display = 'none';
        mount.innerHTML = '';
        await refreshMMM();
      },
    });
    mount.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Confirm-from-intent state actions ───────────────────────────────────
  // (User set a price on the signup page; on first dashboard visit they
  //  see a "confirm what you set" card before any listing exists.)

  document.getElementById('mmm-confirm-save').addEventListener('click', async () => {
    const intent = readIntent();
    if (!intent) { await refreshMMM(); return; }
    const btn = document.getElementById('mmm-confirm-save');
    const msgEl = document.getElementById('mmm-confirm-msg');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const buildings = await loadBuildings();
    const buildingSlug = resolveBuildingSlug(intent.address, buildings);
    const result = await CM.setMakeMyMove({
      address: intent.address,
      price: intent.price,
      building: buildingSlug,
    });
    btn.disabled = false;
    btn.textContent = 'Save my number →';
    if (result.error) {
      setMsg(msgEl, 'Save failed: ' + result.error.message + '. Verify the listings table exists in Supabase.', 'error');
      return;
    }
    clearIntent();
    await refreshMMM();
  });

  document.getElementById('mmm-confirm-edit').addEventListener('click', () => {
    const intent = readIntent();
    if (!intent) return;
    // Pass the intent into the wizard as a partial prefill (no id → new listing)
    openWizard({ address: intent.address, price: intent.price });
  });

  document.getElementById('mmm-confirm-discard').addEventListener('click', () => {
    if (!confirm('Discard the number you set on the signup page?')) return;
    clearIntent();
    refreshMMM();
  });

  // ─── Empty + Add-another buttons → open wizard ───────────────────────────

  document.getElementById('mmm-empty-add').addEventListener('click', () => {
    openWizard(null);
  });

  document.getElementById('mmm-add-another').addEventListener('click', () => {
    openWizard(null);
  });

  // ─── Listing card actions (event delegation) ─────────────────────────────

  document.getElementById('mmm-listings').addEventListener('click', async (e) => {
    const trigger = e.target.closest('button[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;
    if (!id) return;

    if (action === 'edit') {
      // Open the wizard with this listing — wizard re-fetches full row internally
      await openWizard({ id });
      return;
    }
    if (action === 'pause') {
      trigger.disabled = true; trigger.textContent = '…';
      const r = await CM.pauseListing(id);
      trigger.disabled = false;
      if (r.error) { alert('Pause failed: ' + r.error.message); trigger.textContent = 'Pause'; return; }
      await refreshMMM();
      return;
    }
    if (action === 'resume') {
      trigger.disabled = true; trigger.textContent = '…';
      const r = await CM.resumeListing(id);
      trigger.disabled = false;
      if (r.error) { alert('Resume failed: ' + r.error.message); trigger.textContent = 'Resume'; return; }
      await refreshMMM();
      return;
    }
    if (action === 'remove') {
      if (!confirm('Remove this listing? It will no longer be visible to buyers.')) return;
      trigger.disabled = true; trigger.textContent = '…';
      const r = await CM.removeListing(id);
      trigger.disabled = false;
      if (r.error) { alert('Remove failed: ' + r.error.message); trigger.textContent = 'Remove'; return; }
      await refreshMMM();
      return;
    }
  });

  // ─── State machine ───────────────────────────────────────────────────────

  function renderListing(listing) {
    const status = listing.status || 'active';
    const statusLabel = { active: 'Active', paused: 'Paused', sold: 'Sold' }[status] || status;
    const isPaused = status === 'paused';
    const isActive = status === 'active';
    const meta = [];
    if (listing.unit_number) meta.push('Unit ' + escapeHtml(listing.unit_number));
    if (listing.sqft) meta.push(escapeHtml(listing.sqft.toLocaleString()) + ' sqft');
    if (listing.created_at) meta.push(escapeHtml(relativeDate(listing.created_at)));

    // Photo: read-only display. To replace or remove, owner uses Edit → wizard.
    const photoUrl = listing.cover_photo_path ? CM.getListingPhotoUrl(listing.cover_photo_path) : null;
    const photoHtml = photoUrl
      ? `<div class="mmm-listing-photo has-photo">
           <img src="${escapeHtml(photoUrl)}" alt="Listing cover">
         </div>`
      : `<div class="mmm-listing-photo">
           <div class="mmm-listing-photo-empty">No<br>photo</div>
         </div>`;

    return [
      '<div class="mmm-listing' + (isPaused ? ' is-paused' : '') + '" data-listing-id="' + escapeHtml(listing.id) + '">',
      '  <div class="mmm-listing-row">',
      '    ' + photoHtml,
      '    <div>',
      '      <div class="mmm-listing-addr">' + escapeHtml(listing.address || '—') + (listing.unit_number ? ' #' + escapeHtml(listing.unit_number) : '') + '</div>',
      '      <div class="mmm-listing-meta">',
      '        <span class="mmm-status mmm-status-' + escapeHtml(status) + '">' + escapeHtml(statusLabel) + '</span>',
      meta.length ? '        <span>' + meta.join('</span><span class="sep"></span><span>') + '</span>' : '',
      '      </div>',
      '    </div>',
      '    <div class="mmm-listing-price">' + fmtMoney(listing.price) + '</div>',
      '  </div>',
      '  <div class="mmm-listing-actions">',
      '    <button type="button" class="btn-link" data-action="edit" data-id="' + escapeHtml(listing.id) + '">Edit</button>',
      isActive ? '    <button type="button" class="btn-link" data-action="pause" data-id="' + escapeHtml(listing.id) + '">Pause</button>' : '',
      isPaused ? '    <button type="button" class="btn-link" data-action="resume" data-id="' + escapeHtml(listing.id) + '">Resume</button>' : '',
      '    <button type="button" class="btn-link is-danger" data-action="remove" data-id="' + escapeHtml(listing.id) + '">Remove</button>',
      '  </div>',
      '</div>',
    ].filter(Boolean).join('\n');
  }

  async function refreshMMM() {
    // If the wizard is open, leave the UI alone — its onComplete/onCancel
    // will call refreshMMM after the user closes it.
    if (_wizardOpen) return;

    const confirmEl = document.getElementById('mmm-confirm');
    const emptyEl   = document.getElementById('mmm-empty');
    const activeEl  = document.getElementById('mmm-active');
    const wizMount  = document.getElementById('mmm-wizard-mount');
    const listings  = await CM.getMyListings();
    const visible   = listings.filter(l => l.status !== 'removed');
    const intent    = readIntent();

    confirmEl.style.display = 'none';
    emptyEl.style.display   = 'none';
    activeEl.style.display  = 'none';
    wizMount.style.display  = 'none';
    wizMount.innerHTML      = '';

    if (visible.length === 0 && intent) {
      // Show confirm-from-intent state
      document.getElementById('mmm-confirm-addr').textContent  = intent.address;
      document.getElementById('mmm-confirm-price').textContent = fmtMoney(intent.price);
      confirmEl.style.display = 'block';
      return;
    }

    if (visible.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    document.getElementById('mmm-listings').innerHTML = visible.map(renderListing).join('');
    activeEl.style.display = 'block';
  }

  // ─── Offers rendering ──────────────────────────────────────────────────────

  function relativeTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1)    return 'just now';
    if (mins < 60)   return mins + ' min ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)    return hrs + ' hr ago';
    const days = Math.floor(hrs / 24);
    if (days < 30)   return days + ' day' + (days === 1 ? '' : 's') + ' ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function offerStatusLabel(s) {
    return ({ pending: 'Pending', countered: 'Countered', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', withdrawn: 'Withdrawn' })[s] || s;
  }

  /** Pick the highest-numbered round from an offer's embedded rounds array. */
  function latestRoundOf(offer) {
    const rounds = offer && offer.rounds;
    if (!Array.isArray(rounds) || rounds.length === 0) return null;
    return rounds.reduce((a, b) => (a && a.round_number > b.round_number ? a : b), null);
  }

  /** Format a round line for the thread display: "Buyer · $2.5M · 2 days ago". */
  function renderRoundLine(r) {
    const who = r.from_role === 'buyer' ? 'Buyer' : 'Owner';
    return `<div class="offer-round-line"><span class="who">${escapeHtml(who)}</span> <span class="amt">${fmtMoney(r.amount)}</span> <span class="when">· ${escapeHtml(relativeTime(r.created_at))}</span>${r.message ? `<div class="msg">${escapeHtml(r.message)}</div>` : ''}</div>`;
  }

  /** Render the full negotiation thread (rounds in order). */
  function renderThread(offer) {
    const rounds = (offer.rounds || []).slice().sort((a, b) => a.round_number - b.round_number);
    if (rounds.length <= 1) return '';  // round 1 == initial offer; skip thread for single-round
    return '<div class="offer-thread">' + rounds.map(renderRoundLine).join('') + '</div>';
  }

  function renderBuyerOfferRow(o) {
    const status = o.status || 'pending';
    const buildingPretty = (o.building_slug || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const heading = buildingPretty || 'Building offer';
    const isPending   = status === 'pending';
    const isCountered = status === 'countered';
    const myTurn      = (isPending && o.awaiting_response_from === 'owner' && false) || (isCountered && o.awaiting_response_from === 'buyer');
    // For buyer: pending => awaiting owner (not your turn); countered+awaiting=buyer => your turn (owner countered)
    const isAwaitingOther = (isPending) || (isCountered && o.awaiting_response_from === 'owner');

    const latest = latestRoundOf(o);
    const currentAmount = latest ? latest.amount : o.offer_amount;
    const originalAmount = o.offer_amount;

    // What to show as the headline amount: if pending, show original; if countered, show latest.
    const headlineAmount = currentAmount;
    const headlineSub = isCountered
      ? (myTurn
          ? `Owner countered (was your $${(originalAmount/1000000).toFixed(2).replace(/\.?0+$/, '')}M)`
          : `You countered (their last: $${currentAmount === originalAmount ? '—' : (originalAmount/1000000).toFixed(2)}M)`)
      : '';

    const messageBlock = o.message && !isCountered
      ? `<div class="offer-row-message"><span class="offer-row-message-label">Your message</span>${escapeHtml(o.message)}</div>`
      : '';

    // Action buttons
    let actions = '';
    if (myTurn) {
      // Owner countered, buyer's turn: Accept / Counter / Decline
      actions = `
        <button type="button" class="btn-primary"            style="padding:8px 16px;font-size:12px;" data-action="accept"  data-id="${escapeHtml(o.id)}">Accept ${fmtMoneyShort(currentAmount)}</button>
        <button type="button" class="btn-link is-primary"                                            data-action="counter" data-id="${escapeHtml(o.id)}">Counter</button>
        <button type="button" class="btn-link is-danger"                                             data-action="decline" data-id="${escapeHtml(o.id)}">Decline</button>
      `;
    } else if (isPending) {
      // Buyer's initial offer is out, waiting for owner: only withdraw
      actions = `<button type="button" class="btn-link is-danger" data-action="withdraw" data-id="${escapeHtml(o.id)}">Withdraw</button>`;
    } else if (isCountered && o.awaiting_response_from === 'owner') {
      // Buyer just countered back, waiting on owner
      actions = `<button type="button" class="btn-link is-danger" data-action="withdraw" data-id="${escapeHtml(o.id)}">Withdraw</button>`;
    }
    // accepted/declined/expired/withdrawn: no actions

    const turnBadge = myTurn ? `<span class="offer-status is-their-turn" style="margin-left:6px;">Your turn</span>` : '';
    const awaitingBadge = (isCountered && !myTurn)
      ? `<span class="offer-meta-awaiting">Awaiting ${escapeHtml(o.awaiting_response_from === 'owner' ? 'owner' : 'buyer')}</span>`
      : '';

    return [
      `<div class="offer-row is-${escapeHtml(status)}${myTurn ? ' is-your-turn' : ''}" data-offer-id="${escapeHtml(o.id)}">`,
      '  <div class="offer-row-head">',
      '    <div>',
      `      <div class="offer-row-addr">${escapeHtml(heading)}</div>`,
      '      <div class="offer-row-meta">',
      `        <span class="offer-status offer-status-${escapeHtml(status)}">${escapeHtml(offerStatusLabel(status))}</span>`,
      turnBadge,
      `        <span>${escapeHtml(relativeTime(o.created_at))}</span>`,
      awaitingBadge,
      '      </div>',
      '    </div>',
      `    <div class="offer-row-amount">${fmtMoney(headlineAmount)}${headlineSub ? `<div class="offer-row-amount-sub">${escapeHtml(headlineSub)}</div>` : ''}</div>`,
      '  </div>',
      messageBlock,
      renderThread(o),
      actions ? `<div class="offer-row-actions">${actions}</div>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  }

  function renderOwnerOfferRow(o) {
    const status = o.status || 'pending';
    const lst = o.listing || {};
    const addr = (lst.address || 'Your unit') + (lst.unit_number ? ' #' + lst.unit_number : '');
    const isPending   = status === 'pending';
    const isCountered = status === 'countered';
    // Owner's turn: pending+awaiting=owner, OR countered+awaiting=owner (buyer counter-back)
    const myTurn = (isPending && o.awaiting_response_from === 'owner') || (isCountered && o.awaiting_response_from === 'owner');

    const latest = latestRoundOf(o);
    const currentAmount = latest ? latest.amount : o.offer_amount;
    const originalAmount = o.offer_amount;

    const headlineAmount = currentAmount;
    const headlineSub = isCountered
      ? (myTurn
          ? `Buyer countered back (was your $${(originalAmount === currentAmount ? '—' : (originalAmount/1000000).toFixed(2))}M)`
          : `You countered (buyer's was $${(originalAmount/1000000).toFixed(2).replace(/\.?0+$/, '')}M)`)
      : '';

    const buyer = o.buyer_name || o.buyer_email || 'Buyer';
    const photoUrl = lst.cover_photo_path ? CM.getListingPhotoUrl(lst.cover_photo_path) : null;
    const thumbHtml = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="" style="width:48px;height:48px;border-radius:6px;object-fit:cover;flex-shrink:0;">`
      : '';

    const messageBlock = o.message && !isCountered
      ? `<div class="offer-row-message"><span class="offer-row-message-label">Buyer's message</span>${escapeHtml(o.message)}</div>`
      : '';

    let actions = '';
    if (myTurn) {
      actions = `
        <button type="button" class="btn-primary"          style="padding:8px 16px;font-size:12px;" data-action="accept"  data-id="${escapeHtml(o.id)}">Accept ${fmtMoneyShort(currentAmount)}</button>
        <button type="button" class="btn-link is-primary"                                          data-action="counter" data-id="${escapeHtml(o.id)}">Counter</button>
        <button type="button" class="btn-link is-danger"                                           data-action="decline" data-id="${escapeHtml(o.id)}">Decline</button>
      `;
    }

    const turnBadge = myTurn ? `<span class="offer-status is-their-turn" style="margin-left:6px;">Your turn</span>` : '';
    const awaitingBadge = (isCountered && !myTurn)
      ? `<span class="offer-meta-awaiting">Awaiting ${escapeHtml(o.awaiting_response_from === 'buyer' ? 'buyer' : 'owner')}</span>`
      : '';

    return [
      `<div class="offer-row is-${escapeHtml(status)}${myTurn ? ' is-your-turn' : ''}" data-offer-id="${escapeHtml(o.id)}">`,
      '  <div class="offer-row-head">',
      '    <div style="display:flex;gap:12px;align-items:center;">',
      thumbHtml,
      '      <div>',
      `        <div class="offer-row-addr">${escapeHtml(addr)}</div>`,
      '        <div class="offer-row-meta">',
      `          <span class="offer-status offer-status-${escapeHtml(status)}">${escapeHtml(offerStatusLabel(status))}</span>`,
      turnBadge,
      `          <span>From ${escapeHtml(buyer)}</span>`,
      `          <span>${escapeHtml(relativeTime(o.created_at))}</span>`,
      awaitingBadge,
      '        </div>',
      '      </div>',
      '    </div>',
      `    <div class="offer-row-amount">${fmtMoney(headlineAmount)}${headlineSub ? `<div class="offer-row-amount-sub">${escapeHtml(headlineSub)}</div>` : ''}</div>`,
      '  </div>',
      messageBlock,
      renderThread(o),
      actions ? `<div class="offer-row-actions">${actions}</div>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  }

  async function renderBuyerOffers() {
    const host = document.getElementById('buyer-offers-list');
    if (!host) return;
    const offers = await CM.listMyOffers();
    if (!offers || offers.length === 0) return;  // keep empty state already in HTML
    host.innerHTML = '<div class="offers-list">' + offers.map(renderBuyerOfferRow).join('') + '</div>';
  }

  async function renderOwnerOffers() {
    const card = document.getElementById('owner-offers-card');
    const list = document.getElementById('owner-offers-list');
    const intro = document.getElementById('owner-offers-intro');
    if (!card || !list) return;

    // Only show this card if the user has at least one MMM listing.
    const myListings = await CM.getMyListings();
    const hasListings = myListings && myListings.some(l => l.status !== 'removed');
    if (!hasListings) { card.style.display = 'none'; return; }

    const offers = await CM.listOffersForMyListings();
    card.style.display = 'block';
    if (!offers || offers.length === 0) {
      intro.textContent = "No offers yet on your make-me-move number. We'll email you when one arrives.";
      list.innerHTML = '';
      return;
    }
    intro.textContent = "Buyers who've made an offer on your unit. Accept or decline on your terms.";
    list.innerHTML = '<div class="offers-list">' + offers.map(renderOwnerOfferRow).join('') + '</div>';
  }

  // Event delegation for offer-row action buttons (Withdraw / Accept / Decline / Counter)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id || !['withdraw','accept','decline','counter'].includes(action)) return;

    // Counter is special: open modal, don't disable button until submit
    if (action === 'counter') {
      // Find the offer in either the buyer or owner cache to pass into the modal
      const [buyerOffers, ownerOffers] = await Promise.all([CM.listMyOffers(), CM.listOffersForMyListings()]);
      const offer = [...buyerOffers, ...ownerOffers].find(o => o.id === id);
      if (!offer) { alert('Offer not found.'); return; }
      const latest = (offer.rounds || []).slice().sort((a,b) => b.round_number - a.round_number)[0];
      const previousAmount = latest ? latest.amount : offer.offer_amount;
      openCounterModal({
        offer,
        listing: offer.listing || null,
        previousAmount,
        onSubmit: async () => {
          await renderBuyerOffers();
          await renderOwnerOffers();
        },
      });
      return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '…';

    let result;
    if (action === 'withdraw') result = await CM.withdrawOffer(id);
    if (action === 'accept')   result = await CM.acceptOffer(id);
    if (action === 'decline')  result = await CM.declineOffer(id);

    btn.disabled = false;
    btn.textContent = originalText;

    if (result?.error) {
      alert(action + ' failed: ' + result.error.message);
      return;
    }

    await renderBuyerOffers();
    await renderOwnerOffers();
  });

  // ─── Top-level render ────────────────────────────────────────────────────

  async function render() {
    const loading   = document.getElementById('loading');
    const signedIn  = document.getElementById('signed-in');
    const signedOut = document.getElementById('signed-out');

    const session = await CM.getSession();
    loading.style.display = 'none';

    if (!session?.user) {
      signedOut.style.display = 'block';
      return;
    }

    signedIn.style.display = 'block';
    const user = session.user;
    document.getElementById('f-email').textContent = user.email || '—';

    let profile = null;
    let credits = [];
    try { profile = await CM.getMyProfile(); } catch (e) {}
    try { credits = await CM.listMyReferralCredits(); } catch (e) {}

    document.getElementById('f-name').textContent = profile?.full_name || user.user_metadata?.full_name || '—';

    if (profile?.created_at) {
      const d = new Date(profile.created_at);
      document.getElementById('f-since').textContent = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    // ─── Force TOS acceptance on first sign-in (or after a TOS update) ─────
    if (!hasAcceptedCurrentTos(profile)) {
      openTosModal({
        mode: 'accept',
        onAccept: async () => {
          // Re-render after acceptance is recorded
          render();
        },
      });
      return;  // Don't continue rendering until acceptance is in
    }

    // ─── Wire "How it works" link in owner-offers card ─────────────────────
    const howtoBtn = document.getElementById('owner-offers-howto');
    if (howtoBtn && !howtoBtn._wired) {
      howtoBtn._wired = true;
      howtoBtn.addEventListener('click', () => openTosModal({ mode: 'info' }));
    }

    const referralCount = Math.min(credits.length, 5);
    const creditPct = Math.min(referralCount * 0.2, 1.0);
    document.getElementById('f-referrals').textContent = referralCount + ' of 5';
    document.getElementById('f-credit').textContent = fmtPct(creditPct);

    const code = profile?.referral_code || '—';
    document.getElementById('f-refcode').textContent = code;
    const refLink = code !== '—'
      ? `${window.location.origin}/?ref=${code}`
      : 'Generating your referral code…';
    document.getElementById('f-reflink').textContent = refLink;

    // ─── Populate first-fold stats row ─────────────────────────────────────
    try {
      const myListings = await CM.getMyListings();
      const visibleListings = myListings.filter(l => l.status !== 'removed');
      const activeListings  = visibleListings.filter(l => l.status === 'active');
      document.getElementById('stat-listings').textContent = String(visibleListings.length);
      document.getElementById('stat-listings-meta').textContent = visibleListings.length === 0
        ? 'None yet'
        : `${activeListings.length} active`;

      const ownerOffers = await CM.listOffersForMyListings();
      const pending = ownerOffers.filter(o => o.status === 'pending');
      document.getElementById('stat-offers-received').textContent = String(ownerOffers.length);
      document.getElementById('stat-offers-received-meta').textContent = pending.length > 0
        ? `${pending.length} pending`
        : (ownerOffers.length > 0 ? 'All resolved' : 'No offers yet');
    } catch (e) { /* stats are nice-to-have */ }

    document.getElementById('stat-referrals').textContent = `${referralCount} / 5`;
    document.getElementById('stat-referrals-meta').textContent = creditPct >= 1.0
      ? '1% off — maxed!'
      : `${fmtPct(creditPct)} off so far`;

    // Mount calculator in progress mode
    const calcEl = document.getElementById('cm-rc-dash');
    if (calcEl && window.CMReferralCalc) {
      calcEl.innerHTML = '';
      calcEl.classList.remove('cm-rc');
      calcEl.classList.remove('cm-rc-ivory');
      calcEl.dataset.referralCount = String(referralCount);
      calcEl.dataset.mode = 'progress';
      window.CMReferralCalc.mount(calcEl);
    }

    // Render MMM card
    await refreshMMM();

    // Render offers — buyer-side (always) and owner-side (if user has listings)
    await Promise.all([
      renderBuyerOffers(),
      renderOwnerOffers(),
    ]);

    // Wire copy button
    document.getElementById('copy-btn').addEventListener('click', async () => {
      const btn = document.getElementById('copy-btn');
      try {
        await navigator.clipboard.writeText(refLink);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      } catch (e) {
        btn.textContent = 'Error';
      }
    }, { once: true });

    // v20: notify shell modules that render() has completed so they can sync sidebar + activity feed
    window.dispatchEvent(new CustomEvent('cm-dash-rendered'));
  }

  window.addEventListener('cm-ready', render);
  window.addEventListener('cm-auth-change', render);
