/**
 * cm-watch-prompt.js — ask at the bottom, not the door.
 * ---------------------------------------------------------------------------
 * Fires when a visitor reaches the end of a building page, on the
 * `cm:read-to-end` event broadcast by cm-track.js.
 *
 * Why here and not on arrival:
 *   - The intent popup is shown on entry. Last month it was shown to 6,033
 *     visitors and 24 chose a door. It interrupts the read and gets ignored.
 *   - 388 visitors reached the bottom of a building page. Those visitors take
 *     an action at 2.3x the rate of everyone else (0.77% vs 0.34%). Reading a
 *     full building dossier is the strongest unprompted signal on the site.
 *
 * Why scroll depth rather than exit intent:
 *   82% of building traffic is mobile. Exit intent is a cursor leaving the top
 *   of a viewport — it does not exist on a phone, where "leaving" is a
 *   back-swipe with no warning. Scroll depth works everywhere.
 *
 * Rules it keeps:
 *   - once per building, per device, ever (dismissal is remembered)
 *   - never if they already watched this building from this device
 *   - never on top of the offer modal or any other open dialog
 *   - one dismissal suppresses it site-wide for 30 days, because someone who
 *     said no does not want to be asked on the next building either
 */

const SB_URL = 'https://kfqphwerygccpzntbbif.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

const SEEN_KEY    = 'cm_watch_prompt_seen';     // per building
const SNOOZE_KEY  = 'cm_watch_prompt_snooze';   // site-wide, timestamp
const WATCHED_KEY = 'cm_watched_buildings';
const SNOOZE_DAYS = 30;

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
  catch (e) { return fallback; }
}
function writeJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}
function visitorToken() {
  try { return localStorage.getItem('cm_visitor_token') || null; } catch (e) { return null; }
}

function snoozed() {
  try {
    const t = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return t && (Date.now() - t) < SNOOZE_DAYS * 864e5;
  } catch (e) { return false; }
}

function styles() {
  if (document.getElementById('cm-wp-styles')) return;
  const el = document.createElement('style');
  el.id = 'cm-wp-styles';
  el.textContent = `
  .cm-wp {
    position: fixed; left: 50%; bottom: 0; transform: translate(-50%, 110%);
    width: min(560px, calc(100% - 24px)); z-index: 900;
    background: #12161f; border: 1px solid rgba(212,165,116,.38);
    border-bottom: 0; border-radius: 16px 16px 0 0;
    padding: 20px 22px calc(20px + env(safe-area-inset-bottom, 0px));
    box-shadow: 0 -18px 50px rgba(0,0,0,.5);
    transition: transform .34s cubic-bezier(.16,1,.3,1);
    font-family: inherit;
  }
  .cm-wp.in { transform: translate(-50%, 0); }
  .cm-wp-head { font-family: Georgia, serif; font-size: 18px; color: #e8e3d8; margin: 0 0 5px; }
  .cm-wp-sub  { font-size: 13.5px; line-height: 1.5; color: rgba(232,227,216,.66); margin: 0 0 13px; }
  .cm-wp-row  { display: flex; gap: 8px; flex-wrap: wrap; }
  .cm-wp-row input {
    flex: 1 1 200px; min-width: 0; padding: 11px 13px; font: inherit; font-size: 15px;
    border-radius: 10px; border: 1px solid rgba(232,227,216,.24);
    background: rgba(0,0,0,.3); color: #e8e3d8; }
  .cm-wp-row input:focus { outline: none; border-color: #d4a574; }
  .cm-wp-row button {
    flex: 0 0 auto; padding: 11px 20px; font: inherit; font-size: 15px; font-weight: 600;
    border: 0; border-radius: 10px; cursor: pointer; background: #d4a574; color: #1a1408; }
  .cm-wp-row button:disabled { opacity: .55; cursor: default; }
  .cm-wp-no {
    display: block; margin: 11px auto 0; background: none; border: 0; cursor: pointer;
    font: inherit; font-size: 12.5px; color: rgba(232,227,216,.45); text-decoration: underline; }
  .cm-wp-msg { margin: 10px 0 0; font-size: 13.5px; color: rgba(232,227,216,.72); }
  .cm-wp-msg.bad { color: #e8a08f; }
  @media (max-width: 520px) {
    .cm-wp-row input, .cm-wp-row button { flex: 1 1 100%; }
  }`;
  document.head.appendChild(el);
}

function show(slug) {
  styles();

  const name =
    (document.querySelector('h1')?.textContent || '').trim().replace(/\.$/, '') ||
    'this building';

  const box = document.createElement('div');
  box.className = 'cm-wp';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Watch this building');
  box.innerHTML = `
    <p class="cm-wp-head">You read the whole thing.</p>
    <p class="cm-wp-sub">Want to know when a unit lists at ${name}, or a sale records?
      No account, one click to stop.</p>
    <div class="cm-wp-row">
      <input type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address">
      <button type="button">Watch it</button>
    </div>
    <p class="cm-wp-msg" role="status"></p>
    <button class="cm-wp-no" type="button">No thanks</button>`;
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('in'));

  const input = box.querySelector('input');
  const btn   = box.querySelector('.cm-wp-row button');
  const msg   = box.querySelector('.cm-wp-msg');

  function close() {
    box.classList.remove('in');
    setTimeout(() => box.remove(), 380);
  }

  box.querySelector('.cm-wp-no').addEventListener('click', () => {
    /* One "no thanks" is an answer for the whole site, not just this page.
       Asking again on the next building is how a helpful prompt becomes a
       nuisance. */
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch (e) {}
    if (window.cmTrack) window.cmTrack('watch_prompt_dismissed', { building_slug: slug });
    close();
  });

  async function submit() {
    const email = (input.value || '').trim();
    if (!email || email.indexOf('@') < 1) {
      msg.textContent = 'Please add an email address.';
      msg.className = 'cm-wp-msg bad';
      return;
    }
    btn.disabled = true;
    msg.textContent = 'Saving…';
    msg.className = 'cm-wp-msg';
    try {
      const r = await fetch(SB_URL + '/rest/v1/rpc/watch_building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY,
                   Authorization: 'Bearer ' + SB_KEY },
        body: JSON.stringify({ p_building_slug: slug, p_email: email,
                               p_visitor_token: visitorToken(),
                               p_source: 'read_to_end_prompt' })
      });
      const d = await r.json();
      if (!d || d.ok !== true) {
        msg.textContent = d && d.error === 'email_invalid'
          ? 'That address does not look right.'
          : 'That did not save. Try again in a moment.';
        msg.className = 'cm-wp-msg bad';
        btn.disabled = false;
        return;
      }
      const watched = readJson(WATCHED_KEY, []);
      if (watched.indexOf(slug) < 0) { watched.push(slug); writeJson(WATCHED_KEY, watched); }
      if (window.cmTrack) window.cmTrack('watchlist_add', { building_slug: slug, via: 'read_to_end' });

      const n = Number(d.watchers || 0);
      msg.textContent = n > 1
        ? `Done — you and ${n - 1} ${n === 2 ? 'other person are' : 'others are'} watching.`
        : 'Done. You will hear from us when something happens here.';
      box.querySelector('.cm-wp-row').style.display = 'none';
      box.querySelector('.cm-wp-no').style.display = 'none';
      setTimeout(close, 2600);
    } catch (e) {
      msg.textContent = 'That did not save. Try again in a moment.';
      msg.className = 'cm-wp-msg bad';
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

window.addEventListener('cm:read-to-end', (e) => {
  const slug = (e.detail && e.detail.building_slug) || '';
  if (!slug) return;

  if (snoozed()) return;
  if (readJson(WATCHED_KEY, []).indexOf(slug) >= 0) return;   // already watching
  const seen = readJson(SEEN_KEY, []);
  if (seen.indexOf(slug) >= 0) return;                        // asked here before

  /* Never stack on top of something the visitor already opened. */
  if (document.querySelector('.cm-om-modal, [data-cm-modal-open], dialog[open]')) return;

  seen.push(slug);
  writeJson(SEEN_KEY, seen);
  if (window.cmTrack) window.cmTrack('watch_prompt_shown', { building_slug: slug });
  show(slug);
}, { once: false });
