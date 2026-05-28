/**
 * offer.js — "Impossible Offer" ($10,000 / 24h signup credit) frontend module
 * ---------------------------------------------------------------------------
 * Self-contained. Loads site-wide. Shares the app's Supabase client + auth
 * session via the cm-supabase.js `sb` export (so signup is auto-detected — no
 * edit to the signup file required).
 *
 * Does, automatically:
 *   - records a landing row once per browser (anon INSERT; RLS allows it)
 *   - keeps a 24h countdown anchored to first-landing (localStorage, no DB read)
 *   - injects a persistent countdown bar (until signed up / expired)
 *   - on detected sign-in: calls grant_impossible_offer_credit, then shows a
 *     celebratory + "gift your friends $10,000" referral modal
 *   - exit-intent reminder for un-signed-up visitors
 *   - fills any element with [data-offer-wallet] with the user's credit
 *   - hides ALL offer UI after signup
 *
 * Public API (window.offer): recordLanding, grantCredit, submitReferrals,
 *   getCredits, renderCountdown(el), openReferral(userId), countdownTarget,
 *   marketSlug. Use renderCountdown(el) to drop the live timer into your own
 *   hero/header markup.
 */

import { sb } from './cm-supabase.js';

const OFFER_SLUG   = 'impossible_offer_v1';
const WINDOW_HOURS = 24;
const AMOUNT_LABEL = '$10,000';

const LS = {
  token:     'cm_visitor_token',
  landed:    'cm_first_landed_at',
  sent:      'cm_landing_sent',
  signedUp:  'cm_signed_up',
  granted:   'cm_offer_grant_tried',
  referred:  'cm_referral_done'
};
const SS = { barHidden: 'cm_offer_bar_hidden', exitShown: 'cm_offer_exit_shown' };

/* ----------------------------- state helpers ---------------------------- */
function marketSlug() {
  return location.hostname.includes('siliconvalley')
    ? 'silicon-valley-condo-market'
    : 'san-francisco-condo-market';
}
function getVisitorToken() {
  let t = localStorage.getItem(LS.token);
  if (!t) { t = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()); localStorage.setItem(LS.token, t); }
  return t;
}
function landedAt() {
  let ts = localStorage.getItem(LS.landed);
  if (!ts) { ts = new Date().toISOString(); localStorage.setItem(LS.landed, ts); }
  return new Date(ts);
}
function countdownTarget() { return new Date(landedAt().getTime() + WINDOW_HOURS * 3600 * 1000); }
function isExpired() { return countdownTarget() - new Date() <= 0; }
function isSignedUp() { return localStorage.getItem(LS.signedUp) === '1'; }
function buildingSlug() { const m = location.pathname.match(/^\/building\/([^/]+)/); return m ? m[1] : null; }

/* --------------------------------- data --------------------------------- */
async function recordLanding() {
  getVisitorToken(); landedAt();
  if (localStorage.getItem(LS.sent)) return;
  const p = new URLSearchParams(location.search);
  try {
    await sb.from('offer_landings').insert({
      visitor_token: getVisitorToken(), offer_slug: OFFER_SLUG, market_slug: marketSlug(),
      landing_path: location.pathname, referrer: document.referrer || null,
      utm_source: p.get('utm_source'), utm_medium: p.get('utm_medium'),
      utm_campaign: p.get('utm_campaign'), utm_content: p.get('utm_content'),
      utm_term: p.get('utm_term'), ref_invite_id: p.get('inv') || null,
      building_slug: buildingSlug(), user_agent: navigator.userAgent
    });
    localStorage.setItem(LS.sent, '1');
  } catch (e) { console.warn('[offer] landing insert failed', e); }
}

async function grantCredit(userId) {
  try {
    const { data } = await sb.rpc('grant_impossible_offer_credit', {
      p_user_id: userId, p_visitor_token: getVisitorToken(), p_market_slug: marketSlug()
    });
    return data;
  } catch (e) { console.warn('[offer] grant failed', e); return null; }
}

async function submitReferrals(userId, friends) {
  const rows = (friends || []).filter(f => f.email && f.email.trim()).map(f => ({
    referrer_user_id: userId, offer_slug: OFFER_SLUG, market_slug: marketSlug(),
    friend_name: (f.name || '').trim() || null, friend_email: f.email.trim()
  }));
  if (!rows.length) return { count: 0 };
  try { await sb.from('offer_referral_invites').insert(rows); return { count: rows.length }; }
  catch (e) { console.warn('[offer] referral insert failed', e); return { count: 0, error: e }; }
}

async function getCredits() {
  try {
    const { data } = await sb.from('account_credits')
      .select('amount_usd,status,expires_at,offer_slug').eq('status', 'active');
    return data || [];
  } catch (e) { return []; }
}

/* ------------------------------- countdown ------------------------------ */
const tickers = new Set();
function fmtClock(ms) {
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms % 3.6e6 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function renderCountdown(el) { if (el) { tickers.add(el); tick(); } }
function tick() {
  const ms = countdownTarget() - new Date();
  const txt = fmtClock(ms);
  tickers.forEach(el => { if (!document.body.contains(el)) { tickers.delete(el); return; } el.textContent = txt || 'Offer expired'; });
  if (txt === null) removeOfferUI();
}
setInterval(tick, 1000);

/* --------------------------------- UI ----------------------------------- */
function signupHref() { return '/?auth=signup&return=' + encodeURIComponent(location.pathname); }

function injectStyles() {
  if (document.getElementById('cmo-css')) return;
  const css = `
  .cmo{--bg:#0f131d;--card:#1a1f2e;--gold:#d4a574;--text:#e8e3d8;--border:rgba(232,227,216,0.14);
       font-family:'DM Sans',system-ui,sans-serif;color:var(--text);}
  .cmo-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:9000;
    display:flex;align-items:center;gap:16px;max-width:calc(100vw - 24px);
    background:var(--card);border:1px solid var(--gold);border-radius:999px;
    padding:10px 12px 10px 20px;box-shadow:0 12px 40px rgba(0,0,0,.45);}
  .cmo-bar--building{bottom:84px;}
  .cmo-bar-txt{font-size:13.5px;line-height:1.3;}
  .cmo-bar-txt b{color:var(--gold);font-weight:600;}
  .cmo-bar-clock{font-family:'JetBrains Mono',monospace;color:var(--gold);font-weight:600;
    letter-spacing:.04em;font-variant-numeric:tabular-nums;}
  .cmo-bar-cta{flex:none;background:var(--gold);color:#1a1f2e;font-weight:600;font-size:13px;
    text-decoration:none;border-radius:999px;padding:9px 16px;white-space:nowrap;}
  .cmo-bar-cta:hover{opacity:.9;color:#1a1f2e;}
  .cmo-bar-x{flex:none;background:none;border:none;color:rgba(232,227,216,0.4);font-size:18px;
    line-height:1;cursor:pointer;padding:4px 6px;}
  .cmo-bar-x:hover{color:var(--gold);}
  @media(max-width:620px){.cmo-bar{bottom:12px;padding:9px 10px 9px 16px;gap:10px;}
    .cmo-bar--building{bottom:74px;} .cmo-bar-txt{font-size:12px;} .cmo-bar-lead{display:none;}}
  .cmo-modal{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;
    padding:1.5rem;animation:cmoFade .25s ease-out;}
  @keyframes cmoFade{from{opacity:0}to{opacity:1}}
  .cmo-backdrop{position:absolute;inset:0;background:rgba(15,19,29,.9);
    -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);cursor:pointer;}
  .cmo-card{position:relative;z-index:1;max-width:520px;width:100%;background:var(--card);
    border:1px solid var(--gold);border-radius:16px;padding:2.4rem 2rem;max-height:90vh;overflow-y:auto;}
  .cmo-close{position:absolute;top:.7rem;right:1rem;background:none;border:none;
    color:rgba(232,227,216,.45);font-size:1.8rem;line-height:1;cursor:pointer;}
  .cmo-close:hover{color:var(--gold);}
  .cmo-eyebrow{font-family:'JetBrains Mono',monospace;font-size:.72rem;letter-spacing:.18em;
    text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  .cmo-headline{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-weight:500;
    font-size:1.7rem;line-height:1.2;margin:0 0 .8rem;}
  .cmo-big{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:2.8rem;
    color:var(--gold);line-height:1;margin:.2rem 0 1rem;}
  .cmo-sub{color:rgba(232,227,216,.68);line-height:1.55;font-size:.97rem;margin:0 0 1.5rem;}
  .cmo-row{display:grid;grid-template-columns:1fr 1.3fr;gap:.6rem;margin-bottom:.6rem;}
  .cmo-row input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;
    padding:.7rem .8rem;color:var(--text);font-family:inherit;font-size:.92rem;}
  .cmo-row input:focus{outline:none;border-color:var(--gold);}
  .cmo-btn{display:block;width:100%;text-align:center;background:var(--gold);color:#1a1f2e;
    font-weight:600;font-size:.95rem;border:none;border-radius:10px;padding:.85rem 1.5rem;
    cursor:pointer;text-decoration:none;margin-top:1rem;}
  .cmo-btn:hover{opacity:.9;color:#1a1f2e;}
  .cmo-link{display:block;text-align:center;background:none;border:none;color:rgba(232,227,216,.5);
    font-size:.85rem;cursor:pointer;margin-top:.8rem;width:100%;}
  .cmo-link:hover{color:var(--gold);}
  .cmo-wallet{font-family:'DM Sans',sans-serif;}
  .cmo-wallet-amt{font-family:'Playfair Display',Georgia,serif;font-weight:500;color:#d4a574;}
  `;
  const st = document.createElement('style'); st.id = 'cmo-css'; st.textContent = css;
  document.head.appendChild(st);
}

function removeOfferUI() {
  document.querySelectorAll('.cmo-bar, .cmo-modal.cmo-exit').forEach(el => el.remove());
}

function mountBar() {
  if (document.querySelector('.cmo-bar')) return;
  if (sessionStorage.getItem(SS.barHidden)) return;
  const bar = document.createElement('div');
  bar.className = 'cmo cmo-bar' + (buildingSlug() ? ' cmo-bar--building' : '');
  bar.innerHTML =
    '<div class="cmo-bar-txt"><span class="cmo-bar-lead">Sign up within </span>' +
    '<span class="cmo-bar-clock" data-cmo-countdown>--:--:--</span> ' +
    'for <b>' + AMOUNT_LABEL + '</b> off your first transaction</div>' +
    '<a class="cmo-bar-cta" href="' + signupHref() + '">Claim ' + AMOUNT_LABEL + ' \u2192</a>' +
    '<button class="cmo-bar-x" aria-label="Hide">\u00d7</button>';
  document.body.appendChild(bar);
  renderCountdown(bar.querySelector('[data-cmo-countdown]'));
  bar.querySelector('.cmo-bar-x').addEventListener('click', () => { sessionStorage.setItem(SS.barHidden, '1'); bar.remove(); });
}

function openModal(html, opts) {
  const m = document.createElement('div');
  m.className = 'cmo cmo-modal' + (opts && opts.cls ? ' ' + opts.cls : '');
  m.innerHTML = '<div class="cmo-backdrop" data-cmo-dismiss></div><div class="cmo-card">' +
    '<button class="cmo-close" data-cmo-dismiss aria-label="Close">\u00d7</button>' + html + '</div>';
  document.body.appendChild(m);
  function dismiss() { m.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') dismiss(); }
  m.querySelectorAll('[data-cmo-dismiss]').forEach(el => el.addEventListener('click', dismiss));
  document.addEventListener('keydown', onKey);
  return { el: m, dismiss };
}

function openReferral(userId) {
  if (localStorage.getItem(LS.referred)) return;
  const rows = [0, 1, 2].map(i =>
    '<div class="cmo-row"><input type="text" placeholder="Friend\u2019s name" data-cmo-name="' + i + '">' +
    '<input type="email" placeholder="their@email.com" data-cmo-email="' + i + '"></div>').join('');
  const { el, dismiss } = openModal(
    '<div class="cmo-eyebrow">Locked in \u00b7 ' + AMOUNT_LABEL + '</div>' +
    '<h2 class="cmo-headline">' + AMOUNT_LABEL + ' now lives in your account.</h2>' +
    '<p class="cmo-sub">It applies to your first transaction through Condo Market \u2014 and it never expires. ' +
    'Want to do something ridiculous? Gift your three closest friends or colleagues the same ' + AMOUNT_LABEL + '.</p>' +
    rows +
    '<button class="cmo-btn" data-cmo-gift>Gift ' + AMOUNT_LABEL + ' to my friends \u2192</button>' +
    '<button class="cmo-link" data-cmo-dismiss>Maybe later</button>'
  );
  el.querySelector('[data-cmo-gift]').addEventListener('click', async () => {
    const friends = [0, 1, 2].map(i => ({
      name: el.querySelector('[data-cmo-name="' + i + '"]').value,
      email: el.querySelector('[data-cmo-email="' + i + '"]').value
    }));
    const btn = el.querySelector('[data-cmo-gift]'); btn.textContent = 'Sending\u2026'; btn.disabled = true;
    const res = await submitReferrals(userId, friends);
    localStorage.setItem(LS.referred, '1');
    el.querySelector('.cmo-card').innerHTML =
      '<button class="cmo-close" data-cmo-dismiss aria-label="Close">\u00d7</button>' +
      '<div class="cmo-eyebrow">Done</div>' +
      '<h2 class="cmo-headline">' + (res.count ? 'Your gifts are on their way.' : 'No problem \u2014 your credit is safe.') + '</h2>' +
      '<p class="cmo-sub">' + (res.count
        ? 'We\u2019ll reach out to ' + res.count + ' ' + (res.count === 1 ? 'friend' : 'friends') + ' on your behalf. Your ' + AMOUNT_LABEL + ' is locked in either way.'
        : 'You can gift friends anytime from your dashboard.') + '</p>' +
      '<button class="cmo-btn" data-cmo-dismiss>Done</button>';
    el.querySelectorAll('[data-cmo-dismiss]').forEach(x => x.addEventListener('click', dismiss));
  });
}

function showExitIntent() {
  if (isSignedUp() || isExpired()) return;
  if (sessionStorage.getItem(SS.exitShown)) return;
  sessionStorage.setItem(SS.exitShown, '1');
  const { el } = openModal(
    '<div class="cmo-eyebrow">Don\u2019t leave it on the table</div>' +
    '<h2 class="cmo-headline">' + AMOUNT_LABEL + ' is waiting for you.</h2>' +
    '<div class="cmo-big" data-cmo-countdown>--:--:--</div>' +
    '<p class="cmo-sub">Create your free account before the clock runs out and ' + AMOUNT_LABEL +
    ' is credited to your first transaction \u2014 forever.</p>' +
    '<a class="cmo-btn" href="' + signupHref() + '">Claim my ' + AMOUNT_LABEL + ' \u2192</a>',
    { cls: 'cmo-exit' }
  );
  renderCountdown(el.querySelector('[data-cmo-countdown]'));
}

function armExitIntent() {
  document.addEventListener('mouseout', e => {
    if (!e.relatedTarget && e.clientY <= 0) showExitIntent();
  });
  setTimeout(() => { if (!sessionStorage.getItem(SS.exitShown)) showExitIntent(); }, 35000);
}

async function refreshWallets() {
  const mounts = document.querySelectorAll('[data-offer-wallet]');
  if (!mounts.length) return;
  const credits = await getCredits();
  const total = credits.reduce((s, c) => s + Number(c.amount_usd || 0), 0);
  mounts.forEach(el => {
    el.classList.add('cmo', 'cmo-wallet');
    el.innerHTML = total > 0
      ? '<div class="cmo-eyebrow">Your credits</div><div class="cmo-big cmo-wallet-amt">$' +
        total.toLocaleString('en-US') + '</div><p class="cmo-sub" style="margin:0;">Applies to your first transaction through Condo Market.</p>'
      : '<div class="cmo-eyebrow">Your credits</div><p class="cmo-sub" style="margin:0;">No active credits yet.</p>';
  });
}

/* -------------------------------- signup -------------------------------- */
async function onSession(session) {
  if (!session || !session.user) return;
  if (localStorage.getItem(LS.granted)) { markSignedUp(); refreshWallets(); return; }
  localStorage.setItem(LS.granted, '1');
  const res = await grantCredit(session.user.id);
  markSignedUp();
  refreshWallets();
  if (res && res.granted) openReferral(session.user.id);
}
function markSignedUp() { localStorage.setItem(LS.signedUp, '1'); removeOfferUI(); }

/* --------------------------------- boot --------------------------------- */
async function boot() {
  injectStyles();
  recordLanding();
  refreshWallets();
  try { const { data } = await sb.auth.getSession(); if (data && data.session) await onSession(data.session); } catch (e) {}
  sb.auth.onAuthStateChange((_e, session) => { if (session) onSession(session); });
  if (isSignedUp() || isExpired()) { removeOfferUI(); return; }
  mountBar();
  armExitIntent();
}

window.offer = { recordLanding, grantCredit, submitReferrals, getCredits, renderCountdown, openReferral, countdownTarget, marketSlug };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
