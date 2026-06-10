/* =============================================================================
 * Condo Market SF - Auth Modal (cm-auth.js)
 * -----------------------------------------------------------------------------
 * Self-contained auth modal: signup + sign-in + magic-link in one component.
 *
 * Usage:
 *   <script type="module">
 *     import { openAuthModal } from '/assets/cm-auth.js';
 *     document.querySelector('#signup-btn').addEventListener('click', () => {
 *       openAuthModal('signup');
 *     });
 *   </script>
 *
 * Auto-wires any element with [data-cm-auth="signup"] or [data-cm-auth="login"]
 * on DOMContentLoaded, so you can also just add attributes in HTML.
 * ========================================================================== */

import { CM, getStoredReferralCode, resolveReferrerName } from './cm-supabase.js';

const CSS = `
  .cm-auth-backdrop {
    position: fixed; inset: 0; background: rgba(26, 31, 46, 0.72);
    display: none; align-items: center; justify-content: center;
    z-index: 10000; font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    padding: 20px; box-sizing: border-box;
  }
  .cm-auth-backdrop.cm-open { display: flex; }
  .cm-auth-modal {
    background: #ffffff; border-radius: 14px; max-width: 440px; width: 100%;
    padding: 32px 28px 28px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    position: relative; max-height: 92vh; overflow-y: auto;
  }
  .cm-auth-close {
    position: absolute; top: 14px; right: 14px;
    background: transparent; border: none; font-size: 24px; cursor: pointer;
    color: #9a9a9a; padding: 4px 10px; line-height: 1; border-radius: 6px;
  }
  .cm-auth-close:hover { background: #f4f4f4; color: #1a1f2e; }
  .cm-auth-modal h2 {
    font-family: 'Playfair Display', Georgia, serif;
    font-style: italic; font-weight: 500; font-size: 26px;
    color: #1a1f2e; margin: 0 0 6px;
  }
  .cm-auth-sub { color: #666; margin: 0 0 18px; font-size: 14px; line-height: 1.5; }
  .cm-referrer-banner {
    background: #f0f4fa; border-left: 3px solid #9fb4d8;
    padding: 10px 14px; border-radius: 6px; margin: 0 0 18px;
    font-size: 13px; color: #1a1f2e;
  }
  .cm-auth-field {
    display: block; width: 100%; padding: 10px 12px; margin-bottom: 12px;
    border: 1px solid #d4d4d4; border-radius: 8px; font-size: 15px;
    font-family: inherit; box-sizing: border-box; background: #fff;
    color: #1a1f2e;
  }
  .cm-auth-field:focus {
    outline: none; border-color: #9fb4d8; box-shadow: 0 0 0 3px rgba(159, 180, 216, 0.2);
  }
  .cm-auth-submit {
    display: block; width: 100%; padding: 12px; margin-top: 4px;
    background: #1a1f2e; color: #fff; border: none; border-radius: 8px;
    font-size: 15px; font-weight: 500; cursor: pointer; font-family: inherit;
    transition: background 0.15s;
  }
  .cm-auth-tos {
    display: flex; gap: 9px; align-items: flex-start;
    padding: 8px 2px 12px; cursor: pointer;
    font-size: 12.5px; line-height: 1.45; color: #4a5169;
  }
  .cm-auth-tos input[type="checkbox"] {
    flex-shrink: 0; width: 16px; height: 16px;
    margin-top: 2px; cursor: pointer; accent-color: #1a1f2e;
  }
  .cm-auth-tos a {
    color: #1a1f2e; font-weight: 500; text-decoration: underline; cursor: pointer;
  }
  .cm-auth-submit:hover:not(:disabled) { background: #2a3041; }
  .cm-auth-submit:disabled { opacity: 0.5; cursor: not-allowed; }
  .cm-auth-switch { text-align: center; margin-top: 14px; font-size: 13px; color: #666; }
  .cm-auth-switch a {
    color: #1a1f2e; font-weight: 500; cursor: pointer; text-decoration: underline;
  }
  .cm-auth-divider {
    text-align: center; margin: 16px 0; font-size: 12px; color: #999;
    position: relative;
  }
  .cm-auth-divider::before, .cm-auth-divider::after {
    content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: #e5e5e5;
  }
  .cm-auth-divider::before { left: 0; }
  .cm-auth-divider::after { right: 0; }
  .cm-auth-magic {
    display: block; width: 100%; padding: 10px; margin-top: 4px;
    background: #fff; color: #1a1f2e; border: 1px solid #1a1f2e; border-radius: 8px;
    font-size: 14px; cursor: pointer; font-family: inherit;
  }
  .cm-auth-magic:hover:not(:disabled) { background: #f4f4f4; }
  .cm-auth-msg { font-size: 13px; margin-top: 12px; padding: 10px; border-radius: 6px; }
  .cm-auth-msg.err { background: #fdecea; color: #b91818; }
  .cm-auth-msg.ok  { background: #eaf7ee; color: #1a7a3a; }
`;

let modalEl = null;
let currentMode = 'signup';

function ensureStylesInjected() {
  if (document.getElementById('cm-auth-styles')) return;
  const style = document.createElement('style');
  style.id = 'cm-auth-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function buildModalElement() {
  const backdrop = document.createElement('div');
  backdrop.className = 'cm-auth-backdrop';
  backdrop.innerHTML = `
    <div class="cm-auth-modal" role="dialog" aria-modal="true">
      <button class="cm-auth-close" type="button" aria-label="Close">&times;</button>
      <h2 class="cm-auth-title">Create your account</h2>
      <p class="cm-auth-sub cm-auth-subtext">Save favorites, submit offers, and unlock insider market access.</p>
      <div class="cm-referrer-banner" style="display:none"></div>

      <input class="cm-auth-field cm-name"  type="text"  placeholder="Full name" autocomplete="name">
      <input class="cm-auth-field cm-email" type="email" placeholder="Email" autocomplete="email" required>
      <input class="cm-auth-field cm-phone" type="tel"   placeholder="Phone (optional)" autocomplete="tel">
      <input class="cm-auth-field cm-pass"  type="password" placeholder="Password (8+ characters)" autocomplete="new-password" required minlength="8">

      <label class="cm-auth-tos">
        <input type="checkbox" class="cm-tos-cb">
        <span>I agree to the <a class="cm-tos-link" href="#">Terms of Service</a> and understand Condo Market is a marketing platform — not a brokerage.</span>
      </label>

      <button class="cm-auth-submit" type="button">Create account</button>

      <div class="cm-auth-divider">or</div>
      <button class="cm-auth-magic" type="button">Email me a sign-in link</button>

      <div class="cm-auth-msg" style="display:none"></div>
      <div class="cm-auth-switch">
        <span class="cm-switch-text">Already have an account?</span>
        <a class="cm-switch-link">Sign in</a>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  // Wire up events
  backdrop.querySelector('.cm-auth-close').addEventListener('click', closeAuthModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeAuthModal(); });
  backdrop.querySelector('.cm-switch-link').addEventListener('click', toggleMode);
  backdrop.querySelector('.cm-auth-submit').addEventListener('click', handleSubmit);
  backdrop.querySelector('.cm-auth-magic').addEventListener('click', handleMagicLink);

  // Wire the TOS link to open the platform TOS modal (info mode)
  backdrop.querySelector('.cm-tos-link').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const m = await import('/assets/cm-tos-modal.js');
      m.openTosModal({ mode: 'info' });
    } catch (err) {
      console.error('Could not load TOS modal', err);
    }
  });

  return backdrop;
}

function setMessage(kind, text) {
  if (!modalEl) return;
  const msg = modalEl.querySelector('.cm-auth-msg');
  if (!text) { msg.style.display = 'none'; msg.textContent = ''; return; }
  msg.className = 'cm-auth-msg ' + (kind === 'err' ? 'err' : 'ok');
  msg.textContent = text;
  msg.style.display = 'block';
}

function applyMode() {
  if (!modalEl) return;
  const isSignup = currentMode === 'signup';
  modalEl.querySelector('.cm-auth-title').textContent = isSignup ? 'Create your account' : 'Welcome back';
  modalEl.querySelector('.cm-auth-subtext').textContent = isSignup
    ? 'Save favorites, submit offers, and unlock insider market access.'
    : 'Sign in to continue.';
  modalEl.querySelector('.cm-auth-submit').textContent = isSignup ? 'Create account' : 'Sign in';
  modalEl.querySelector('.cm-name').style.display  = isSignup ? 'block' : 'none';
  modalEl.querySelector('.cm-phone').style.display = isSignup ? 'block' : 'none';
  modalEl.querySelector('.cm-auth-tos').style.display = isSignup ? 'flex' : 'none';
  modalEl.querySelector('.cm-switch-text').textContent = isSignup ? 'Already have an account?' : 'New here?';
  modalEl.querySelector('.cm-switch-link').textContent = isSignup ? 'Sign in' : 'Create one';
  const passField = modalEl.querySelector('.cm-pass');
  passField.setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
  passField.placeholder = isSignup ? 'Password (8+ characters)' : 'Password';
  setMessage(null, '');
}

function toggleMode() {
  currentMode = (currentMode === 'signup') ? 'login' : 'signup';
  applyMode();
}

async function refreshReferrerBanner() {
  if (!modalEl) return;
  const banner = modalEl.querySelector('.cm-referrer-banner');
  const code = getStoredReferralCode();
  if (!code) { banner.style.display = 'none'; return; }
  const name = await resolveReferrerName(code);
  if (name) {
    banner.innerHTML = `🎉 You were invited by <strong>${escapeHtml(name)}</strong>`;
    banner.style.display = 'block';
  } else {
    banner.innerHTML = `Referral code: <strong>${escapeHtml(code)}</strong>`;
    banner.style.display = 'block';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

async function handleSubmit() {
  if (!modalEl) return;
  const submitBtn = modalEl.querySelector('.cm-auth-submit');
  const email = modalEl.querySelector('.cm-email').value.trim();
  const password = modalEl.querySelector('.cm-pass').value;
  const fullName = modalEl.querySelector('.cm-name').value.trim();
  const phone = modalEl.querySelector('.cm-phone').value.trim();
  const tosChecked = modalEl.querySelector('.cm-tos-cb')?.checked;

  if (!email || !password) {
    setMessage('err', 'Email and password are required.');
    return;
  }
  if (currentMode === 'signup' && password.length < 8) {
    setMessage('err', 'Password must be at least 8 characters.');
    return;
  }
  if (currentMode === 'signup' && !tosChecked) {
    setMessage('err', 'Please accept the Terms of Service to continue.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = (currentMode === 'signup') ? 'Creating...' : 'Signing in...';
  setMessage(null, '');

  try {
    if (currentMode === 'signup') {
      const { data, error } = await CM.signUp({ email, password, fullName, phone });
      if (error) throw error;

      // Detect "email already registered" — Supabase deliberately returns success
      // with an empty identities[] array (anti-enumeration default). Without this
      // check, the UI would falsely tell the user to check their email for a
      // confirmation link. Transparently fall back to a magic-link send so they
      // can actually get back into their existing account.
      const isExistingUser = !!(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
      if (isExistingUser) {
        const { error: magicErr } = await CM.sendMagicLink({ email });
        if (magicErr) {
          setMessage('err', 'This email already has an account. Click "Email me a sign-in link" below to get back in.');
        } else {
          setMessage('ok', 'Looks like you already have an account \u2014 we just sent you a sign-in link instead. Check your email.');
        }
        return;
      }

      // Record TOS acceptance immediately if we have a session.
      // (If only verification email was sent, we'll catch them on first dashboard visit.)
      if (data?.session) {
        try {
          const tosMod = await import('/assets/cm-tos-modal.js');
          await CM.acceptTos(tosMod.TOS_VERSION);
        } catch (e) { console.error('TOS accept after signup failed', e); }
      }

     if (window.cmTrack) {
        window.cmTrack('conversion', {
          type: 'signup',
          confirmed: !!data?.session
        });
      }

      if (data?.user && !data?.session) {
        setMessage('ok', 'Check your email for a confirmation link to finish signing up.');
      } else {
        setMessage('ok', 'Account created! You are signed in.');
        setTimeout(closeAuthModal, 1200);
      }
    } else {
      const { data, error } = await CM.signIn({ email, password });
      if (error) throw error;
      setMessage('ok', 'Welcome back.');
      setTimeout(closeAuthModal, 800);
    }
  } catch (err) {
    setMessage('err', err.message || 'Something went wrong. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = (currentMode === 'signup') ? 'Create account' : 'Sign in';
  }
}

async function handleMagicLink() {
  if (!modalEl) return;
  const btn = modalEl.querySelector('.cm-auth-magic');
  const email = modalEl.querySelector('.cm-email').value.trim();
  const tosChecked = modalEl.querySelector('.cm-tos-cb')?.checked;
  if (!email) {
    setMessage('err', 'Enter your email first.');
    return;
  }
  if (currentMode === 'signup' && !tosChecked) {
    setMessage('err', 'Please accept the Terms of Service to continue.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Sending...';
  setMessage(null, '');
  try {
    const { error } = await CM.sendMagicLink({ email });
    if (error) throw error;
    setMessage('ok', 'Check your email for a sign-in link.');
  } catch (err) {
    setMessage('err', err.message || 'Could not send link.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Email me a sign-in link';
  }
}

// ---- Public API ----------------------------------------------------------

export function openAuthModal(mode = 'signup') {
  ensureStylesInjected();
  if (!modalEl) modalEl = buildModalElement();
  currentMode = (mode === 'login') ? 'login' : 'signup';
  applyMode();
  modalEl.classList.add('cm-open');
  refreshReferrerBanner();
  setTimeout(() => modalEl.querySelector('.cm-email').focus(), 50);
}

export function closeAuthModal() {
  if (!modalEl) return;
  modalEl.classList.remove('cm-open');
  // Clear fields for next open
  modalEl.querySelectorAll('.cm-auth-field').forEach(f => f.value = '');
  setMessage(null, '');
}

// ---- Auto-wire [data-cm-auth] attributes ---------------------------------
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-cm-auth]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal(el.getAttribute('data-cm-auth') === 'login' ? 'login' : 'signup');
    });
  });

  // Listen for other modules dispatching the openAuthModal event
  // (e.g. cm-offer-modal.js opens auth before the user can submit an offer)
  window.addEventListener('openAuthModal', (e) => {
    openAuthModal(e.detail?.mode || 'signup');
  });
});

export default { openAuthModal, closeAuthModal };
