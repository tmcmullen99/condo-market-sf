/* cm-intent.js — first-moment intent capture + the permanent ask layer.
 *
 * v2 (7/27): the chat is now a PERMANENT feature of every page.
 *   - A launcher pill sits fixed bottom-right at all times. Dismissing the
 *     popup no longer kills access forever (it previously did — SEEN_KEY
 *     removed the only entry point). SEEN_KEY now suppresses only the
 *     automatic scroll trigger; the launcher always works.
 *   - The launcher reopens a saved conversation if one exists, otherwise
 *     opens the doors flow. It hides while the popup or dock is on screen.
 *   - market_slug is read from window.__CM_MARKET__ (was hardcoded to SF,
 *     which sent Silicon Valley visitors SF answers).
 *   - Starter chips replaced: every chip is now backed by a live tool
 *     (market_hold_stats, building_prices, site_knowledge, owner_economics,
 *     long_held_units) — the old set included questions with no tool behind
 *     them, which failed on camera in the first incognito test.
 *   - Owner pitch reframed to the $15,000-$35,000 cost-to-test-the-market
 *     number, answered in depth by the site_knowledge layer.
 *
 * v3 (7/28): owner screen 2 is an itemised ledger, not a paragraph.
 *   - REMOVED the $15,000-$35,000 claim. No knowledge_entries row supports it,
 *     and neither "move out and rent elsewhere" nor "carrying the mortgage"
 *     exists as sourced data. An unsourced cost range shown to an owner by a
 *     licensed agent to induce a listing decision is the exact thing this file
 *     says it will not do.
 *   - The ledger renders ONLY rows backed by a knowledge entry, each carrying
 *     its fact_type, and the total is summed from the rows present rather than
 *     hard-coded. Add an entry and the row appears; there is nothing to edit
 *     here.
 *   - Closing line is fee-transaction, a policy we control, which is stronger
 *     than an estimate we would have to defend.
 *
 * WHY THIS EXISTS
 * 92.3% of human visitors view exactly one page and 5.1% ever return, so there
 * is no second chance to ask who someone is. Platform-wide, 5 CTA clicks came
 * from 5,276 humans (0.09%) because every ask sat below the fold.
 *
 * SHAPE
 *   trigger  second scroll — intent already demonstrated, unlike an on-arrival modal
 *   step 1   two doors: own here / just looking
 *   step 2   ONE real answer, computed from live data, before any gate
 *   step 3   email for the saved report and continued access
 *
 * The free answer is the point. Describing value converts far worse than
 * showing it, and the only durable advantage here is that the answer is
 * genuinely specific to the building the visitor is already looking at.
 *
 * WHAT IT WILL NOT DO
 * It never states what a unit is worth. Backtesting put unit-level valuation at
 * 13.1% mean error with only 52% inside +/-10%, and price opinion is a licensed
 * activity in California. Owners asking about price are routed into the CMA
 * tool, which they drive themselves, and then to the agent for the opinion.
 * Every number shown carries the sale count behind it.
 */
(function () {
  'use strict';

  var DEFAULT_URL = 'https://kfqphwerygccpzntbbif.supabase.co';
  var DEFAULT_KEY = 'sb_publishable_cR53l68E0KtOpANRKiVi7Q_Vx57yQb0';
  function creds() {
    return {
      url: (window.__CM_SUPABASE_URL__ || DEFAULT_URL),
      key: (window.__CM_SUPABASE_ANON__ || DEFAULT_KEY)
    };
  }
  var SEEN_KEY = 'cm_intent_v1';

  // Shared with cm-auth.js, which reads cm_known_email to prefill the sign-up
  // modal. One identity across the popup and the account flow.
  function rememberEmail(v) {
    try { localStorage.setItem('cm_known_email', String(v || '').trim().toLowerCase()); } catch (e) {}
  }
  function rememberedEmail() {
    try { return (localStorage.getItem('cm_known_email') || '').trim(); } catch (e) { return ''; }
  }

  // Event names must be added in TWO places or they are silently dropped:
  //   1. the track_event allowlist        2. the site_events CHECK constraint
  // Both rejected every intent_* event for a day while the popup appeared fine.
  function track(ev, meta) {
    try { if (window.cmTrack) window.cmTrack(ev, meta || null); } catch (e) {}
  }

  function rpc(fn, body) {
    var c = creds();
    return fetch(c.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': c.key, 'Authorization': 'Bearer ' + c.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    }).then(function (r) { if (!r.ok) throw new Error(fn + ' ' + r.status); return r.json(); });
  }

  // The answer layer. Tool use runs 8-20s, so callers must show a thinking
  // state rather than blocking on a spinner that looks like a hang.
  function askAI(question, history) {
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, 90000);
    var started = Date.now();

    return fetch(creds().url + '/functions/v1/market-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({ message: question, messages: history || [],
        market_slug: (typeof window.__CM_MARKET__ === 'string' && window.__CM_MARKET__) || 'san-francisco-condo-market' })
    }).then(function (r) {
      clearTimeout(timer);
      return r.text().then(function (raw) {
        var data = null;
        try { data = JSON.parse(raw); } catch (e) {}
        if (!r.ok) {
          return { ok: false, error: 'http ' + r.status,
                   detail: (data && (data.error || data.detail)) || raw.slice(0, 200),
                   ms: Date.now() - started };
        }
        if (!data) return { ok: false, error: 'bad json', detail: raw.slice(0, 200), ms: Date.now() - started };
        data.ms = Date.now() - started;
        return data;
      });
    }).catch(function (e) {
      clearTimeout(timer);
      var aborted = e && (e.name === 'AbortError');
      return { ok: false,
               error: aborted ? 'timeout after 90s' : 'network',
               detail: (e && e.message) ? String(e.message).slice(0, 200) : String(e),
               ms: Date.now() - started };
    });
  }

  function buildingSlug() {
    var m = location.pathname.match(/^\/building\/([^\/]+)/i);
    if (m) return decodeURIComponent(m[1]);
    var el = document.querySelector('[data-building-slug],[data-building]');
    return el ? (el.getAttribute('data-building-slug') || el.getAttribute('data-building')) : null;
  }

  // Prices abbreviate; $/sf must not. An earlier version ran both through the
  // same formatter and rendered a $1,042/sq ft median as "$1K".
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function psf(n) {
    n = Number(n);
    return isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '—';
  }
  /* --------------------------- answer rendering --------------------------
   * The model replies in markdown. Rendering it raw leaked "**bold**" into the
   * UI, and a list of sales was a wall of text with nothing to click.
   *
   * Escape first, then apply a deliberately small subset - bold, bullets,
   * paragraphs - and finally linkify building names against the `refs` the
   * server returned. Linking from server-side refs rather than parsing prose
   * means a link only ever appears for a building whose page actually renders.
   */
  // Only link domains we control. The model should only emit URLs that came from
  // a tool result, but a hallucinated link rendered as clickable is a real risk
  // on a page carrying a DRE number. Anything else stays plain text - visible
  // and copyable, but not one tap from somewhere unknown.
  var LINK_ALLOWED = ['sanfranciscocondomarket.com','siliconvalleycondomarket.com',
                      'mcmullenresidential.com','mcmullen.properties','eichlermarket.com',
                      'campbellrealestatemarket.com','losgatosrealestatemarket.com',
                      'saratogarealestatemarket.com','penngroverealestatemarket.com'];
  function allowedUrl(u) {
    if (!/^https?:\/\//i.test(u)) return false;
    var host = u.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0].toLowerCase().replace(/^www\./, '');
    return LINK_ALLOWED.some(function (d) { return host === d || host.slice(-(d.length + 1)) === '.' + d; });
  }

  function renderReply(text, refs) {
    var html = esc(String(text || ''));

    // building names -> links, longest first so "The Beacon" wins over "Beacon"
    (refs || []).slice()
      .sort(function (a, b) { return (b.name || '').length - (a.name || '').length; })
      .forEach(function (r) {
        if (!r || !r.name || !r.slug) return;
        var needle = esc(r.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(new RegExp('(?<!building\\/)\\b' + needle + '\\b', 'g'),
          '<a class="cmi-ref" href="/building/' + encodeURIComponent(r.slug) + '" ' +
          'data-cta="chat-ref">' + esc(r.name) + '</a>');
      });

    // Links, in two passes with placeholders in between. Running the bare-URL
    // pass over HTML the markdown pass had just produced rewrote the inside of
    // its own href attribute, so the first link came out pointing at "<a class=".
    // Markdown links are parked as tokens, bare URLs handled, then restored.
    var parked = [];
    function park(html_) { parked.push(html_); return '\u0000LINK' + (parked.length - 1) + '\u0000'; }

    // [label](url) \u2014 any target, so javascript: and other schemes are caught
    // and flattened rather than left as visible bracket syntax.
    html = html.replace(/\[([^\]]{1,120})\]\(([^\s)]{1,300})\)/g, function (m, label, url) {
      if (!allowedUrl(url)) return label;          // keep the words, drop the link
      return park('<a class="cmi-ref" href="' + url + '" target="_blank" rel="noopener noreferrer" ' +
                  'data-cta="chat-external">' + label + '</a>');
    });

    // Bare URLs
    html = html.replace(/https?:\/\/[^\s<>"']+/g, function (u) {
      var clean = u.replace(/[.,;:)\]]+$/, '');
      var tail  = u.slice(clean.length);
      if (!allowedUrl(clean)) return u;
      var label = clean.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
      return park('<a class="cmi-ref" href="' + clean + '" target="_blank" rel="noopener noreferrer" ' +
                  'data-cta="chat-external">' + label + '</a>') + tail;
    });

    html = html.replace(/\u0000LINK(\d+)\u0000/g, function (m, i) { return parked[Number(i)]; });

    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // bullets become record rows; everything else stays a paragraph
    var out = [], list = [];
    html.split('\n').forEach(function (raw) {
      var line = raw.trim();
      var m = line.match(/^[-\u2022]\s+(.*)$/);
      if (m) { list.push('<li>' + m[1] + '</li>'); return; }
      if (list.length) { out.push('<ul class="cmi-rows">' + list.join('') + '</ul>'); list = []; }
      if (line) out.push('<p>' + line + '</p>');
    });
    if (list.length) out.push('<ul class="cmi-rows">' + list.join('') + '</ul>');
    return out.join('');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------- styles ------------------------------- */
  function injectCss() {
    if (document.getElementById('cm-intent-css')) return;
    var s = document.createElement('style');
    s.id = 'cm-intent-css';
    s.textContent = [
      '.cmi-back{position:fixed;inset:0;background:rgba(10,13,18,.62);backdrop-filter:blur(3px);z-index:9998;opacity:0;transition:opacity .22s ease}',
      '.cmi-back.on{opacity:1}',
      '.cmi{position:fixed;z-index:9999;left:50%;top:50%;transform:translate(-50%,-46%);width:min(560px,calc(100vw - 32px));max-height:88vh;overflow:auto;background:#faf7f2;border-radius:16px;box-shadow:0 24px 70px rgba(10,13,18,.4);opacity:0;transition:opacity .22s ease,transform .22s ease;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}',
      '.cmi.on{opacity:1;transform:translate(-50%,-50%)}',
      '.cmi-in{padding:30px 30px 26px}',
      '.cmi-x{position:absolute;top:12px;right:14px;border:0;background:transparent;font-size:24px;line-height:1;color:#9a938a;cursor:pointer;padding:6px}',
      '.cmi-eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#b2431a;margin:0 0 8px}',
      '.cmi-h{font-family:Georgia,"Times New Roman",serif;font-size:25px;line-height:1.25;color:#171c2a;margin:0 0 8px}',
      '.cmi-sub{font-size:14.5px;line-height:1.5;color:#5d574e;margin:0 0 20px}',
      '.cmi-door{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e3ddd2;border-radius:12px;padding:18px 20px;margin-bottom:12px;cursor:pointer;transition:border-color .15s,transform .15s,box-shadow .15s}',
      '.cmi-door:hover{border-color:#b2431a;transform:translateY(-1px);box-shadow:0 6px 18px rgba(10,13,18,.08)}',
      '.cmi-door b{display:block;font-size:17px;color:#171c2a;margin-bottom:3px;font-weight:600}',
      '.cmi-door span{display:block;font-size:13.5px;color:#6c655c;line-height:1.45}',
      '.cmi-ans{background:#fff;border:1px solid #e3ddd2;border-radius:12px;padding:18px 20px;margin:0 0 16px}',
      '.cmi-ans-q{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.05em;color:#9a938a;margin:0 0 10px}',
      '.cmi-stat{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid #f0ece4;font-size:14.5px}',
      '.cmi-stat:last-child{border-bottom:0}',
      '.cmi-stat b{font-family:Georgia,serif;font-size:19px;color:#171c2a}',
      '.cmi-stat i{font-style:normal;color:#6c655c}',
      '.cmi-note{font-size:12px;color:#8a837a;line-height:1.5;margin:10px 0 0}',
      '.cmi-field{display:flex;gap:8px;margin:4px 0 10px}',
      '.cmi-msg p{margin:0 0 9px}.cmi-msg p:last-child{margin-bottom:0}',
      '.cmi-msg strong{font-weight:650;color:#171c2a}',
      '.cmi-rows{list-style:none;margin:10px 0;padding:0;border-top:1px solid #efeae1}',
      '.cmi-rows li{padding:9px 2px;border-bottom:1px solid #efeae1;font-size:14px;line-height:1.45}',
      '.cmi-ref{color:#b2431a;text-decoration:none;border-bottom:1px solid rgba(178,67,26,.32);font-weight:600}',
      '.cmi-ref:hover{border-bottom-color:#b2431a;background:rgba(178,67,26,.06)}',
      '.cmi-agent{display:inline-flex;align-items:center;gap:8px;background:#171c2a;color:#f1ede4;border:0;border-radius:999px;padding:11px 18px;font:inherit;font-size:13.5px;font-weight:600;text-decoration:none;cursor:pointer;margin-top:10px}',
      '.cmi-agent:hover{background:#232a3c}',
      '.cmi-agent-ic{font-size:14px;opacity:.85}',
      '.cmi-standing{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:9px;padding:8px;border-top:1px solid #ece6dc;color:#6c655c;font-size:12.5px;text-decoration:none;font-weight:500}',
      '.cmi-standing:hover{color:#b2431a}',
      '.cmi-agent-box{margin-top:10px}',
      '.cmi-agent-alt{display:block;width:100%;margin-top:8px;background:transparent;border:0;color:#8a837a;font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer;padding:6px 0;text-align:left}',
      '.cmi-agent-alt[hidden]{display:none}',
      '.cmi-form{margin:0}',
      /* DOCK - after the email is in, the modal becomes a panel so the page is
         usable while the conversation continues. */
      '.cmi.cmi-docked{left:auto;right:20px;top:auto;bottom:20px;transform:none;width:380px;max-width:calc(100vw - 32px);max-height:min(560px,calc(100vh - 40px));display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(10,13,18,.28)}',
      '.cmi.cmi-docked .cmi-in{padding:0;display:flex;flex-direction:column;min-height:0;flex:1}',
      '.cmi-dock-bar{display:flex;align-items:center;gap:8px;padding:13px 15px;border-bottom:1px solid #ece6dc;background:#f4efe6;border-radius:16px 16px 0 0;cursor:pointer;flex:none}',
      '.cmi-dock-bar b{font-size:13.5px;color:#171c2a;font-weight:600;flex:1}',
      '.cmi-dock-live{width:7px;height:7px;border-radius:50%;background:#5d8a5d;flex:none}',
      '.cmi-dock-min{border:0;background:transparent;font-size:17px;color:#8a837a;cursor:pointer;padding:2px 6px;line-height:1}',
      '.cmi-dock-body{overflow-y:auto;padding:15px;flex:1;min-height:0}',
      '.cmi-dock-foot{padding:11px 13px;border-top:1px solid #ece6dc;background:#fdfbf8;border-radius:0 0 16px 16px;flex:none}',
      '.cmi.cmi-min{max-height:none;height:auto}',
      '.cmi.cmi-min .cmi-dock-body,.cmi.cmi-min .cmi-dock-foot{display:none}',
      '.cmi.cmi-min .cmi-dock-bar{border-bottom:0;border-radius:16px}',
      '@media(max-width:620px){',
      '  .cmi.cmi-docked{right:0;left:0;bottom:0;width:auto;max-width:none;border-radius:16px 16px 0 0;max-height:72vh}',
      '  .cmi.cmi-docked .cmi-dock-bar{border-radius:16px 16px 0 0}',
      '  .cmi.cmi-min .cmi-dock-bar{border-radius:16px 16px 0 0}',
      '  .cmi.cmi-docked .cmi-field{flex-direction:row}',
      '  .cmi.cmi-docked .cmi-btn{width:auto}',
      '}',
      '.cmi-field input{flex:1;min-width:0;padding:13px 14px;border:1px solid #ddd6ca;border-radius:9px;font:inherit;font-size:15px;background:#fff}',
      '.cmi-field input:focus{outline:2px solid rgba(178,67,26,.3);border-color:#b2431a}',
      '.cmi-btn{background:#b2431a;color:#fff;border:0;border-radius:9px;padding:13px 22px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.cmi-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.cmi-alt{display:block;width:100%;background:transparent;border:0;color:#8a837a;font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer;padding:8px;margin-top:2px}',
      '.cmi-err{color:#9c2f16;font-size:13px;margin:2px 0 8px}',
      '.cmi-ask{margin:14px 0 0}',
      '.cmi-chip{display:inline-block;background:#fff;border:1px solid #e3ddd2;border-radius:999px;padding:9px 15px;margin:0 6px 8px 0;font-size:13px;color:#3d3830;cursor:pointer;text-align:left;line-height:1.35}',
      '.cmi-chip:hover{border-color:#b2431a;color:#b2431a}',
      '.cmi-msg{background:#fff;border:1px solid #e3ddd2;border-radius:12px;padding:15px 17px;margin:0 0 10px;font-size:14.5px;line-height:1.55;color:#2e2a24;white-space:pre-wrap}',
      '.cmi-you{background:#efeae1;border:0;color:#4b453c;font-size:13.5px}',
      '.cmi-think{display:flex;align-items:center;gap:9px;font-size:13.5px;color:#8a837a;padding:13px 2px}',
      '.cmi-dot{width:7px;height:7px;border-radius:50%;background:#b2431a;animation:cmiPulse 1.15s infinite ease-in-out}',
      '.cmi-dot:nth-child(2){animation-delay:.18s}.cmi-dot:nth-child(3){animation-delay:.36s}',
      '@keyframes cmiPulse{0%,80%,100%{opacity:.25}40%{opacity:1}}',
      '.cmi-go{display:inline-block;background:#b2431a;color:#fff;border-radius:9px;padding:11px 18px;font-size:14px;font-weight:600;text-decoration:none;margin-top:4px}',
      /* LAUNCHER - the permanent entry point. Always on the page; hides only
         while the popup or dock is on screen. */
      '.cmi-launch{position:fixed;right:20px;bottom:20px;z-index:9997;display:flex;align-items:center;gap:9px;background:#171c2a;color:#f1ede4;border:1px solid rgba(241,237,228,.14);border-radius:999px;padding:12px 18px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px rgba(10,13,18,.35);transition:transform .15s,box-shadow .15s,opacity .2s}',
      '.cmi-launch:hover{transform:translateY(-1px);box-shadow:0 14px 36px rgba(10,13,18,.45)}',
      '.cmi-launch .cmi-dock-live{background:#7aa87a}',
      '.cmi-launch[hidden]{display:none}',
      '@media(max-width:620px){.cmi-launch{right:14px;bottom:14px;padding:11px 16px}}',
      /* Persistent persona prompt. Present on 100% of sessions from first
         paint - no scroll gesture, no dwell timer, no suppression key. */
      '.cmi-prompt{position:fixed;right:20px;bottom:20px;z-index:9997;width:268px;background:#171c2a;color:#f1ede4;border:1px solid rgba(241,237,228,.16);border-radius:16px;padding:15px 15px 13px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 14px 40px rgba(10,13,18,.45);animation:cmiRise .4s cubic-bezier(.2,.8,.2,1) both}',
      '@keyframes cmiRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
      '.cmi-prompt[hidden]{display:none}',
      '.cmi-prompt-h{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;letter-spacing:.01em;margin:0 0 3px}',
      '.cmi-prompt-sub{font-size:11.5px;line-height:1.45;color:rgba(241,237,228,.6);margin:0 0 11px}',
      '.cmi-prompt-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.cmi-pick{appearance:none;background:rgba(241,237,228,.06);color:#f1ede4;border:1px solid rgba(241,237,228,.18);border-radius:10px;padding:10px 8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,transform .12s}',
      '.cmi-pick:hover{background:rgba(212,165,116,.16);border-color:#d4a574;transform:translateY(-1px)}',
      '.cmi-pick small{display:block;font-weight:400;font-size:10.5px;color:rgba(241,237,228,.55);margin-top:3px}',
      '.cmi-prompt-x{position:absolute;top:8px;right:10px;background:none;border:0;color:rgba(241,237,228,.4);font-size:17px;line-height:1;cursor:pointer;padding:2px 4px}',
      '.cmi-prompt-x:hover{color:#f1ede4}',
      /* Owner cost ledger. Rows animate in so the total lands last. */
      '.cmi-ledger{margin:16px 0 4px;border-top:1px solid rgba(23,28,42,.12)}',
      '.cmi-lrow{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid rgba(23,28,42,.08);opacity:0;animation:cmiRowIn .42s cubic-bezier(.2,.8,.2,1) forwards}',
      '@keyframes cmiRowIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '.cmi-lk{font-size:13.5px;line-height:1.4;color:#171c2a}',
      '.cmi-lk em{display:block;font-style:normal;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:rgba(23,28,42,.42);margin-top:3px}',
      '.cmi-lv{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;white-space:nowrap;color:#171c2a}',
      '.cmi-ltot{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:13px 0 4px;font-weight:700}',
      '.cmi-ltot .cmi-lv{font-size:15px}',
      '.cmi-lhere{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:9px 12px;margin-top:10px;background:rgba(193,84,40,.08);border:1px solid rgba(193,84,40,.22);border-radius:9px}',
      '.cmi-lhere .cmi-lk{font-weight:700;color:#a8431f}',
      '.cmi-lhere .cmi-lv{font-weight:700;color:#a8431f}',
      /* Mobile: same two buttons, bottom-right, narrower and tighter. */
      '@media(max-width:620px){.cmi-prompt{right:10px;left:10px;bottom:10px;width:auto;padding:13px 13px 12px;border-radius:14px}',
      '.cmi-prompt-sub{margin-bottom:9px}.cmi-pick{padding:11px 8px}}',
      '@media(max-width:560px){.cmi-in{padding:26px 20px 22px}.cmi-h{font-size:22px}.cmi-field{flex-direction:column}.cmi-btn{width:100%}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ------------------------------- shell -------------------------------- */
  var backEl, boxEl, slug = null, chosen = null;

  /* ----------------------------- launcher --------------------------------
   * The permanent entry point. The popup used to be the ONLY way in, and
   * dismissing it set SEEN_KEY forever — a visitor who closed it once could
   * never reach the chat again. The launcher is always present; SEEN_KEY now
   * only stops the automatic trigger from firing twice.
   */
  var launchEl = null;
  var promptEl = null;
  var PERSONA_KEY = 'cm_persona';

  function storedPersona() {
    try { return localStorage.getItem(PERSONA_KEY) || ''; } catch (e) { return ''; }
  }
  function storePersona(v) {
    try { localStorage.setItem(PERSONA_KEY, v); } catch (e) {}
  }

  /* --------------------- persistent persona prompt -----------------------
   * Replaces the scroll/dwell trigger. The old flow reached 3.7% of sessions
   * because it required a scroll gesture AND survived a localStorage key with
   * no expiry. This renders on first paint for every visitor, so the door
   * question is asked once per person rather than once per lucky session.
   *
   * Choosing a door skips the doors step entirely and opens the modal at the
   * answer, which is where the value is.
   */
  function ensurePrompt() {
    if (promptEl) return;
    injectCss();
    promptEl = document.createElement('div');
    promptEl.className = 'cmi-prompt';
    promptEl.setAttribute('role', 'region');
    promptEl.setAttribute('aria-label', 'Customise your experience');
    promptEl.innerHTML =
      '<button class="cmi-prompt-x" aria-label="Dismiss">&times;</button>' +
      '<p class="cmi-prompt-h"><span class="cmi-dock-live" style="background:#7aa87a"></span>Customise your experience</p>' +
      '<p class="cmi-prompt-sub">The numbers that matter depend on which side you are on.</p>' +
      '<div class="cmi-prompt-row">' +
        '<button class="cmi-pick" data-door="owner">Owner<small>I own here</small></button>' +
        '<button class="cmi-pick" data-door="buyer">Buyer<small>I am looking</small></button>' +
      '</div>';
    document.body.appendChild(promptEl);

    Array.prototype.forEach.call(promptEl.querySelectorAll('.cmi-pick'), function (b) {
      b.addEventListener('click', function () {
        chosen = b.getAttribute('data-door');
        storePersona(chosen);
        track('intent_chose', { door: chosen, building: slug, surface: 'persistent_prompt' });
        hidePrompt();
        open('persona_prompt', true);   // straight to the answer
      });
    });
    promptEl.querySelector('.cmi-prompt-x').addEventListener('click', function () {
      track('intent_dismissed', { step: 'persona_prompt', reason: 'x' });
      hidePrompt();
      showLauncher();                   // the chat stays reachable
    });

    track('intent_shown', {
      path: location.pathname, building: slug,
      trigger: 'persistent', surface: 'persona_prompt'
    });
  }
  function hidePrompt() { if (promptEl) promptEl.hidden = true; }
  function showPrompt() { ensurePrompt(); promptEl.hidden = false; }

  function ensureLauncher() {
    if (launchEl) return;
    injectCss();
    launchEl = document.createElement('button');
    launchEl.className = 'cmi-launch';
    launchEl.setAttribute('aria-label', 'Ask the market');
    launchEl.innerHTML = '<span class="cmi-dock-live"></span>Ask the market';
    launchEl.addEventListener('click', function () {
      track('intent_launcher_clicked', { path: location.pathname });
      hideLauncher();
      if (restoreDock()) return;          // an existing conversation reopens
      open('launcher');                    // otherwise the doors flow
    });
    document.body.appendChild(launchEl);
  }
  function hideLauncher() { if (launchEl) launchEl.hidden = true; }
  function showLauncher() { ensureLauncher(); launchEl.hidden = false; }

  function close(reason) {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {}
    track('intent_dismissed', { step: chosen || 'doors', reason: reason || 'close' });
    if (boxEl) boxEl.classList.remove('on');
    if (backEl) backEl.classList.remove('on');
    setTimeout(function () {
      if (boxEl && boxEl.parentNode) boxEl.parentNode.removeChild(boxEl);
      if (backEl && backEl.parentNode) backEl.parentNode.removeChild(backEl);
      boxEl = backEl = null;
      if (!chosen && !storedPersona()) { showPrompt(); } else { showLauncher(); }
    }, 240);
  }

  function open(why, skipDoors) {
    injectCss();
    hideLauncher();
    hidePrompt();
    backEl = document.createElement('div');
    backEl.className = 'cmi-back';
    backEl.addEventListener('click', function () { close('backdrop'); });
    boxEl = document.createElement('div');
    boxEl.className = 'cmi';
    boxEl.setAttribute('role', 'dialog');
    boxEl.setAttribute('aria-modal', 'true');
    document.body.appendChild(backEl);
    document.body.appendChild(boxEl);
    requestAnimationFrame(function () { backEl.classList.add('on'); boxEl.classList.add('on'); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close('esc'); document.removeEventListener('keydown', onEsc); }
    });
    if (skipDoors && chosen) { renderAnswer(); } else { renderDoors(); }
    track('intent_shown', {
      path: location.pathname, building: slug,
      trigger: why || 'unknown', surface: 'modal', door: chosen || null
    });
  }

  function paint(html) {
    boxEl.innerHTML = '<button class="cmi-x" aria-label="Close">&times;</button><div class="cmi-in">' + html + '</div>';
    boxEl.querySelector('.cmi-x').addEventListener('click', function () { close('x'); });
  }

  /* ------------------------------ step 1 -------------------------------- */
  function renderDoors() {
    paint(
      '<p class="cmi-eyebrow">Condo Market</p>' +
      '<h2 class="cmi-h">Let\'s customise what you see.</h2>' +
      '<p class="cmi-sub">One tap. We\'ll show you the numbers that actually matter for your situation.</p>' +
      '<button class="cmi-door" data-door="owner"><b>I own a home here</b>' +
        '<span>See what your building has done since you bought — and float a price without moving out.</span></button>' +
      '<button class="cmi-door" data-door="buyer"><b>I\'m looking</b>' +
        '<span>Make an offer on any unit in any building — not just the ones listed on Zillow.</span></button>'
    );
    Array.prototype.forEach.call(boxEl.querySelectorAll('.cmi-door'), function (b) {
      b.addEventListener('click', function () {
        chosen = b.getAttribute('data-door');
        track('intent_chose', { door: chosen, building: slug });
        renderAnswer();
      });
    });
  }

  /* ------------------------------ step 2 --------------------------------
   * One real answer, no gate. Everything here comes from functions that
   * already refuse to speak when the sample is too thin.
   */
  function renderAnswer() {
    paint('<p class="cmi-eyebrow">One moment</p><h2 class="cmi-h">Opening the record\u2026</h2>');

    // Without a building slug (the index, tools, how-it-works - most of the
    // site) an earlier version dropped straight to a bare email form having
    // shown nothing at all. Now the chat carries the second fold either way;
    // building stats are a bonus when we happen to be on a building page.
    if (!slug) { renderAsk(null, null); return; }

    rpc('building_dossier', { p_slug: slug })
      .then(function (d) { renderAsk((d && d.name) || null, d || null); })
      .catch(function () { renderAsk(null, null); });
  }

  function renderAsk(name, d) {
    var owner = chosen === 'owner';

    // Value proposition, stated plainly. This is what an email is being asked
    // for, so it has to be legible in one read.
    var head = owner
      ? 'Float your price without moving out.'
      : 'Make an offer on any unit \u2014 not just the listed ones.';

    var pitch = owner
      ? 'Testing the market the traditional way is paid for before a single buyer is found. Here is what that actually costs.'
      : 'Zillow shows you what\u0027s listed. We index every unit in ' + (d && d.name ? esc(d.name) : '143 buildings') +
        ' \u2014 and any of them can receive a written offer, whether or not it\u0027s for sale. Most owners have simply never been asked.';

    /* ---------------------------- cost ledger ---------------------------
     * Every row must trace to a knowledge_entries row. Rows without a source
     * are omitted, not estimated, and the total is summed from what is
     * actually present. If an entry is added for move-out or carrying cost,
     * add it here with its slug and the total moves on its own.
     *
     * NOTE: two staging entries currently disagree (cost-staging-2bed says
     * $8k-$15k for a 2-bed; prep-staging-cost says $3k-$10k across sizes).
     * The narrower, size-explicit one is used until that is resolved.
     */
    var LEDGER = [
      { k: 'Paint and repair',  sub: '2-bed, ~1,000 sq ft', lo: 4000,  hi: 6000,
        tag: 'market estimate', src: 'prep-paint-cost' },
      { k: 'Staging',           sub: '60-day contract',     lo: 3000,  hi: 10000,
        tag: 'market estimate', src: 'prep-staging-cost' },
      { k: 'Photography, floor plans, video', sub: 'paid by the agent', lo: 0, hi: 0,
        tag: 'our terms',       src: 'prep-who-pays' }
    ];

    function money(n) { return '$' + Number(n).toLocaleString('en-US'); }
    function band(lo, hi) {
      if (!lo && !hi) return '$0';
      return lo === hi ? money(lo) : money(lo) + ' \u2013 ' + money(hi);
    }

    function ledgerHtml() {
      var lo = 0, hi = 0, out = '';
      LEDGER.forEach(function (r, i) {
        lo += r.lo; hi += r.hi;
        out += '<div class="cmi-lrow" style="animation-delay:' + (i * 110) + 'ms">' +
          '<span class="cmi-lk">' + esc(r.k) +
            (r.sub ? '<em>' + esc(r.sub) + ' \u00b7 ' + esc(r.tag) + '</em>' : '') +
          '</span><span class="cmi-lv">' + band(r.lo, r.hi) + '</span></div>';
      });
      var delay = LEDGER.length * 110;
      out += '<div class="cmi-lrow cmi-ltot" style="animation-delay:' + delay + 'ms">' +
        '<span class="cmi-lk">Before a buyer is found</span>' +
        '<span class="cmi-lv">' + band(lo, hi) + '</span></div>';
      out += '<div class="cmi-lrow cmi-lhere" style="animation-delay:' + (delay + 140) + 'ms">' +
        '<span class="cmi-lk">Here</span>' +
        '<span class="cmi-lv">$0 up front \u00b7 3% only if it closes</span></div>';
      return '<div class="cmi-ledger">' + out + '</div>';
    }

    var rows = '';
    if (d) {
      if (d.psf_p50) rows += stat('Median $/sq ft', psf(d.psf_p50));
      if (d.psf_p05 && d.psf_p95) rows += stat('Range across units', psf(d.psf_p05) + ' \u2013 ' + psf(d.psf_p95));
      if (d.units_with_data) rows += stat(owner ? 'Units on record here' : 'Units you could offer on', String(d.units_with_data));
    }

    // Every chip must have a live tool behind it. The previous set included
    // "Where have owners gained the most" (no cross-building ranking exists)
    // and "cheapest neighbourhoods per sq ft" (trend tool takes ONE
    // neighbourhood) — both failed on camera in the first incognito test.
    var chips = owner
      ? (slug ? ['How have owners in this building done since they bought?',
                 'What sold here most recently?',
                 'How long do owners here typically hold?']
              : ['How much does staging cost for a 2-bedroom?',
                 'What does it cost to list the traditional way?',
                 'How long do owners typically hold here?'])
      : (slug ? ['How do I write an offer on a unit that isn\u0027t listed?',
                 'Which units here haven\u0027t traded in years?',
                 'What sold here most recently?']
              : ['How do I write an offer on a unit that isn\u0027t listed?',
                 'Which units haven\u0027t traded in over a decade?',
                 'What sold this week?']);

    paint(
      '<p class="cmi-eyebrow">' + (owner ? 'For owners' : 'For buyers') + '</p>' +
      '<h2 class="cmi-h">' + head + '</h2>' +
      '<p class="cmi-sub">' + pitch + '</p>' +
      (owner ? ledgerHtml() : '') +
      (rows ? '<div class="cmi-ans">' + rows + '</div>' : '') +
      '<div class="cmi-thread"></div>' +
      '<div class="cmi-ask">' +
        '<p class="cmi-ans-q">Ask anything \u2014 answered from the recorded sales, free.</p>' +
        chips.map(function (c) { return '<button class="cmi-chip">' + c + '</button>'; }).join('') +
        '<div class="cmi-field" style="margin-top:6px">' +
          '<input type="text" class="cmi-q" placeholder="' +
            (owner ? 'e.g. what did 12B last sell for?' : 'e.g. what\u0027s cheapest in Mission Bay?') +
            '" aria-label="Ask a question">' +
          '<button class="cmi-btn cmi-send">Ask</button>' +
        '</div>' +
      '</div>' +
      '<button class="cmi-alt" data-skip>Keep browsing</button>'
    );
    wireAsk(name);
    track('intent_answered', { door: chosen, building: slug, had_stats: !!rows });
  }

  /* ------------------------------- the dock -----------------------------
   * Once the email is in, the modal becomes a panel in the corner. The whole
   * premise is browsing while you ask, so a centred modal is exactly wrong at
   * that point - and the thread has to survive page navigation or the promise
   * of "anywhere on the site" is empty. State lives in sessionStorage.
   */
  var DOCK_KEY = 'cm_intent_dock';

  function saveDock(min) {
    try {
      sessionStorage.setItem(DOCK_KEY, JSON.stringify({
        thread: thread.slice(-16), door: chosen, slug: slug, min: !!min, name: dockName
      }));
    } catch (e) {}
  }
  function loadDock() {
    try { return JSON.parse(sessionStorage.getItem(DOCK_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearDock() { try { sessionStorage.removeItem(DOCK_KEY); } catch (e) {} }

  var dockName = null, docked = false;

  function renderDock(minimised) {
    docked = true;
    injectCss();
    hideLauncher();
    if (!boxEl) {
      backEl = null;
      boxEl = document.createElement('div');
      boxEl.className = 'cmi';
      document.body.appendChild(boxEl);
      requestAnimationFrame(function () { boxEl.classList.add('on'); });
    }
    // the backdrop goes away - the page must be usable
    if (backEl && backEl.parentNode) { backEl.parentNode.removeChild(backEl); backEl = null; }
    boxEl.classList.add('cmi-docked');
    boxEl.classList.toggle('cmi-min', !!minimised);

    var msgs = thread.map(function (m) {
      return m.role === 'user'
        ? '<div class="cmi-msg cmi-you">' + esc(m.content) + '</div>'
        : '<div class="cmi-msg">' + renderReply(m.content, m.refs) + '</div>';
    }).join('');

    boxEl.innerHTML =
      '<div class="cmi-in">' +
        '<div class="cmi-dock-bar" data-toggle>' +
          '<span class="cmi-dock-live"></span>' +
          '<b>' + esc(dockName || 'Condo Market') + '</b>' +
          '<button class="cmi-dock-min" aria-label="' + (minimised ? 'Expand' : 'Minimise') + '">' +
            (minimised ? '\u25B4' : '\u25BE') + '</button>' +
          '<button class="cmi-dock-min" data-dock-close aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="cmi-dock-body"><div class="cmi-thread">' + msgs + '</div></div>' +
        '<div class="cmi-dock-foot">' +
          '<div class="cmi-field">' +
            '<input type="text" class="cmi-q" placeholder="Ask anything\u2026" aria-label="Ask a question">' +
            '<button class="cmi-btn cmi-send">Ask</button>' +
          '</div>' +
          // Always present, always one tap. The per-answer button carries the
          // last question; this one is the standing offer.
          '<a class="cmi-standing" href="' + esc(smsHref(lastQuestion())) + '" data-cta="text-agent-standing">' +
            '<span class="cmi-agent-ic">\u2709</span>Text an expert local agent any time' +
          '</a>' +
        '</div>' +
      '</div>';

    var bar = boxEl.querySelector('[data-toggle]');
    bar.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-dock-close')) return;
      var nowMin = !boxEl.classList.contains('cmi-min');
      boxEl.classList.toggle('cmi-min', nowMin);
      bar.querySelector('.cmi-dock-min').textContent = nowMin ? '\u25B4' : '\u25BE';
      saveDock(nowMin);
      track('intent_dock_toggle', { minimised: nowMin });
    });
    boxEl.querySelector('[data-dock-close]').addEventListener('click', function (e) {
      e.stopPropagation();
      clearDock();
      if (boxEl && boxEl.parentNode) boxEl.parentNode.removeChild(boxEl);
      boxEl = null; docked = false;
      track('intent_dock_closed');
      showLauncher();
    });

    var input = boxEl.querySelector('.cmi-q');
    var send1 = boxEl.querySelector('.cmi-send');
    function go() { send(input.value, dockName); input.value = ''; }
    send1.addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });

    scrollThread();
    saveDock(minimised);
  }

  function refreshStandingLink() {
    var el = boxEl && boxEl.querySelector('[data-cta="text-agent-standing"]');
    if (el) el.setAttribute('href', smsHref(lastQuestion()));
  }

  function scrollThread() {
    var b = boxEl && boxEl.querySelector('.cmi-dock-body');
    if (b) b.scrollTop = b.scrollHeight;
  }

  // Restore across navigation, so the conversation follows the visitor.
  function restoreDock() {
    var d = loadDock();
    if (!d || !d.thread || !d.thread.length) return false;
    thread = d.thread; chosen = d.door; dockName = d.name || null;
    gated = false; asked = 1;
    renderDock(!!d.min);
    track('intent_dock_restored', { messages: thread.length });
    return true;
  }

  /* ------------------------- the ask layer -------------------------------
   * First question is free and unauthenticated. Demonstrated value converts
   * far better than described value, and the only durable advantage here is
   * that the answer is specific to the building already on screen.
   * The gate lands on the SECOND question, once it has been shown to work.
   */
  var thread = [], asked = 0, gated = false;

  function wireAsk(name) {
    var skip = boxEl.querySelector('[data-skip]');
    if (skip) skip.addEventListener('click', function () { close('skip'); });

    Array.prototype.forEach.call(boxEl.querySelectorAll('.cmi-chip'), function (c) {
      c.addEventListener('click', function () { send(c.textContent, name); });
    });
    var input = boxEl.querySelector('.cmi-q');
    var send1 = boxEl.querySelector('.cmi-send');
    if (send1) send1.addEventListener('click', function () { send(input.value, name); });
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') send(input.value, name);
    });
  }

  // The API rejects unknown fields on a message ("messages.N.refs: Extra inputs
  // are not permitted"), so refs are kept locally for rendering links on a
  // restored dock but stripped before the thread is sent upstream. Every first
  // question worked and every follow-up 400'd until this.
  function wireThread() {
    return thread.map(function (m) { return { role: m.role, content: m.content }; });
  }

  /* ---------------------------- text the agent ---------------------------
   * An sms: deep link opens the visitor's OWN messaging app with Tim's number
   * and the body pre-filled. No provider, no server, no captured contact
   * details - they text from their own phone, so Tim gets a real thread he can
   * reply to normally.
   *
   * Platform quirk: iOS wants sms:NUMBER&body=..., Android wants
   * sms:NUMBER?body=... The "?&" form is the one that works on both.
   * Desktop generally has no sms: handler, so the button is swapped for
   * copy-to-clipboard there rather than leading somewhere dead.
   */
  var AGENT_PHONE = '+14156919272';
  var AGENT_LABEL = 'an expert local agent';

  /* ---------------------------- text the agent ---------------------------
   * A real <a href="sms:"> on EVERY platform — one tap, native messaging app,
   * their own number, body pre-filled. No provider, no server, no captured
   * contact details.
   *
   * URL form: sms:NUMBER?&body=TEXT
   *   iOS 8+   wants sms:NUMBER&body=...
   *   Android  wants sms:NUMBER?body=...
   *   macOS    Messages handles either
   * The combined "?&" satisfies all three. An earlier version assumed desktop
   * had no handler and shipped copy-to-clipboard instead, which is strictly
   * worse on a Mac — where Messages opens the same as on a phone.
   *
   * Windows and Linux may genuinely have no sms: handler. Rather than detect
   * the OS (unreliable, and Windows Phone Link does register one), we let the
   * click happen and watch: if the page never loses focus, nothing opened, so
   * a copy fallback is revealed. Detection by consequence, not by user agent.
   */
  function smsBody(question) {
    var q = String(question || '').trim();
    var lead = 'Hi, I was on SF Condo Market and had a question:';
    return q ? (lead + ' ' + q) : (lead + ' ');
  }

  function smsHref(question) {
    return 'sms:' + AGENT_PHONE + '?&body=' + encodeURIComponent(smsBody(question));
  }

  function lastQuestion() {
    for (var i = thread.length - 1; i >= 0; i--) {
      if (thread[i].role === 'user') return thread[i].content;
    }
    return '';
  }

  function agentButton() {
    var q = lastQuestion();
    return '<div class="cmi-agent-box">' +
             '<a class="cmi-agent" href="' + esc(smsHref(q)) + '" data-cta="text-agent">' +
               '<span class="cmi-agent-ic">\u2709</span>' +
               (q ? 'Text an expert local agent this question' : 'Text an expert local agent') +
             '</a>' +
             '<button class="cmi-agent-alt" data-copy-sms hidden>' +
               'Messaging app didn\u0027t open \u2014 copy the message instead' +
             '</button>' +
           '</div>';
  }

  function wireAgentButton(scope) {
    var root = scope || boxEl;
    if (!root) return;
    var link = root.querySelector('a[data-cta="text-agent"]');
    var standing = root.querySelector('a[data-cta="text-agent-standing"]');
    if (standing) standing.addEventListener('click', function () {
      track('agent_text_clicked', { source: 'standing', had_question: !!lastQuestion() });
    });
    var alt  = root.querySelector('[data-copy-sms]');

    if (link) {
      link.addEventListener('click', function () {
        track('agent_text_clicked', { had_question: !!lastQuestion() });
        // If the OS handed off to a messaging app the page loses focus. Still
        // visible a beat later means nothing opened — offer the fallback then,
        // rather than cluttering the UI for the majority where it works.
        var hiddenSince = false;
        function onHide() { if (document.visibilityState === 'hidden') hiddenSince = true; }
        document.addEventListener('visibilitychange', onHide);
        setTimeout(function () {
          document.removeEventListener('visibilitychange', onHide);
          if (!hiddenSince && !document.hidden && alt) {
            alt.hidden = false;
            track('agent_text_no_handler', {});
          }
        }, 1400);
      });
    }

    if (alt) {
      alt.addEventListener('click', function () {
        var text = smsBody(lastQuestion());
        function done() { alt.textContent = 'Copied \u2014 text ' + AGENT_PHONE; }
        try {
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
          else done();
        } catch (e) { done(); }
        track('agent_text_copied', {});
      });
    }
  }

  function threadEl() { return boxEl.querySelector('.cmi-thread'); }

  function send(q, name) {
    q = String(q || '').trim();
    if (!q) return;
    if (!docked) {
      // Parity rule (7/28): a captured email skips the gate on every future
      // visit. rememberedEmail() was being written but never consulted, so
      // returning leads were re-gated and retyped their address each session.
      if (!rememberedEmail()) {
        if (gated) { renderGate(name, q); return; }
        if (asked >= 1) { gated = true; renderGate(name, q); return; }
      }
      asked++;
    }

    var t = threadEl();
    if (!t) return;
    var ask = docked ? null : boxEl.querySelector('.cmi-ask');
    if (ask) ask.style.display = 'none';
    t.insertAdjacentHTML('beforeend', '<div class="cmi-msg cmi-you">' + esc(q) + '</div>');
    if (docked) scrollThread();
    t.insertAdjacentHTML('beforeend',
      '<div class="cmi-think" data-think><span class="cmi-dot"></span><span class="cmi-dot"></span>' +
      '<span class="cmi-dot"></span> <em data-think-label>Reading the record\u2026</em></div>');
    // Some questions need several passes over the data and genuinely take
    // 20-60s. Silence for that long reads as failure, so say what is happening.
    var thinkTimers = [
      setTimeout(function () { var l = boxEl && boxEl.querySelector('[data-think-label]');
        if (l) l.textContent = 'Checking the sales history\u2026'; }, 6000),
      setTimeout(function () { var l = boxEl && boxEl.querySelector('[data-think-label]');
        if (l) l.textContent = 'Still working \u2014 this one needs a few passes\u2026'; }, 18000),
      setTimeout(function () { var l = boxEl && boxEl.querySelector('[data-think-label]');
        if (l) l.textContent = 'Almost there\u2026'; }, 40000)
    ];
    function clearThinkTimers() { thinkTimers.forEach(clearTimeout); }
    track('intent_ask', { door: chosen, building: slug, q: q.slice(0, 120) });

    askAI(q, wireThread()).then(function (res) {
      clearThinkTimers();
      var th = boxEl.querySelector('[data-think]');
      if (th) th.parentNode.removeChild(th);
      if (!res || !res.ok) {
        // Name the failure. A generic shrug made a working server look broken
        // for hours; the user gets a plain sentence, the console gets specifics.
        var why = (res && res.error) || 'unknown';
        var human = why.indexOf('timeout') === 0
          ? 'That took too long to come back. Shorter, more specific questions answer faster \u2014 try naming a building.'
          : why.indexOf('http') === 0
            ? 'Something went wrong reaching the record. Try again in a moment.'
            : 'That one didn\u0027t come back \u2014 try asking it a different way.';
        t.insertAdjacentHTML('beforeend', '<div class="cmi-msg">' + esc(human) + '</div>');
        try { console.warn('[cm-intent] ask failed:', why, res && res.detail, (res && res.ms) + 'ms'); } catch (e) {}
        track('intent_ask_failed', { door: chosen, reason: why,
                                     detail: (res && res.detail) || null, ms: (res && res.ms) || null });
        if (ask) ask.style.display = '';
        asked = 0;   // a failure should not consume the free question
        return;
      }
      thread.push({ role: 'user', content: q });
      thread.push({ role: 'assistant', content: res.reply || '', refs: res.refs || [] });
      t.insertAdjacentHTML('beforeend', '<div class="cmi-msg">' + renderReply(res.reply, res.refs) + '</div>');
      if (docked) { saveDock(false); scrollThread(); }
      if (res.navigate && res.navigate.path) {
        t.insertAdjacentHTML('beforeend',
          '<a class="cmi-go" href="' + esc(res.navigate.path) + '" data-cta="intent-ai-nav">' +
          esc(res.navigate.label || 'Open') + ' \u2192</a>');
      }
      track('intent_ask_answered', { door: chosen, tools: (res.tools_used || []).join(',') });
      // The gate, offered now that it has been shown to work - but only before
      // docking. Once docked the email is already in, and re-asking for it after
      // every answer is both wrong and insulting.
      if (docked) {
        // Offer the human straight after the answer, carrying their own words.
        var prev = boxEl.querySelector('.cmi-agent-wrap');
        if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        t.insertAdjacentHTML('beforeend',
          '<div class="cmi-agent-wrap"><p class="cmi-ans-q" style="margin:14px 0 2px">' +
          'Want a person instead?</p>' + agentButton() + '</div>');
        wireAgentButton(boxEl);
        saveDock(false); scrollThread(); refreshStandingLink(); return;
      }
      t.insertAdjacentHTML('beforeend',
        '<div style="margin:18px 0 6px">' +
          '<p class="cmi-ans-q" style="margin-bottom:6px">That was one question.</p>' +
          '<p class="cmi-sub" style="margin:0 0 12px">Add your email and keep asking \u2014 on any building, any unit, anywhere on the site. ' +
          (chosen === 'owner'
            ? 'We\u0027ll also send your building\u0027s full recorded history.'
            : 'We\u0027ll also send the list of units here that haven\u0027t traded in years.') +
          '</p></div>' +
        gateForm('Keep asking') +
        '<div class="cmi-agent-wrap" style="margin-top:14px">' + agentButton() + '</div>');
      wireGate(name);
      wireAgentButton(boxEl);
    }).catch(function () {
      clearThinkTimers();
      var th = boxEl.querySelector('[data-think]');
      if (th) th.parentNode.removeChild(th);
      if (ask) ask.style.display = '';
      asked = 0;
      track('intent_ask_failed', { door: chosen, reason: 'network' });
    });
  }

  function stat(label, val) {
    return '<div class="cmi-stat"><i>' + esc(label) + '</i><b>' + esc(val) + '</b></div>';
  }

  /* ------------------------------ step 3 -------------------------------- */
  // AUTOFILL
  // type + autocomplete alone are not enough. iOS Safari and most password
  // managers will only offer to fill a field that (a) carries a name attribute
  // and (b) sits inside a real <form>. The earlier version had neither, so on
  // mobile - where typing an address is the whole friction - nothing was offered.
  // autocapitalize/autocorrect off stops iOS mangling the address as it is typed.
  function gateForm(cta) {
    return '<form class="cmi-form" novalidate>' +
             '<div class="cmi-field">' +
               '<input type="email" name="email" id="cmi-email" class="cmi-email" ' +
                 'placeholder="you@email.com" autocomplete="email" inputmode="email" ' +
                 'autocapitalize="off" autocorrect="off" spellcheck="false" ' +
                 'aria-label="Email address">' +
               '<button type="submit" class="cmi-btn">' + esc(cta) + '</button>' +
             '</div>' +
           '</form>' +
           '<p class="cmi-err" hidden></p>' +
           '<p class="cmi-note">No password. We never sell your data, and you can stop the emails in one click.</p>';
  }

  function renderGate(name, pendingQ) {
    paint(
      '<p class="cmi-eyebrow">Condo Market</p>' +
      '<h2 class="cmi-h">' + (chosen === 'owner'
        ? 'See what your unit last sold for.'
        : 'Every unit is open to an offer.') + '</h2>' +
      '<p class="cmi-sub">' + (chosen === 'owner'
        ? 'The complete recorded history of ' + esc(name || 'your building') + ' — every sale, every price, free.'
        : 'Not just what\'s listed. Any unit, any building — the owner receives a real written offer.') + '</p>' +
      (pendingQ ? '<div class="cmi-msg cmi-you">' + esc(pendingQ) + '</div>' : '') +
      gateForm(pendingQ ? 'Answer this and keep going' : 'Send it to me') +
      '<button class="cmi-alt" data-skip>Keep browsing</button>'
    );
    wireGate(name);
  }

  function wireGate(name) {
    var skip = boxEl.querySelector('[data-skip]');
    if (skip) skip.addEventListener('click', function () { close('skip'); });

    var input = boxEl.querySelector('input[type=email]');
    var form  = boxEl.querySelector('.cmi-form');
    var btn   = form ? form.querySelector('.cmi-btn') : null;
    var err   = boxEl.querySelector('.cmi-err');
    if (!input || !btn) return;

    // If they already told us who they are - here or at the auth modal - do not
    // ask again. Prefilled and one tap from done.
    var known = rememberedEmail();
    if (known && !input.value) input.value = known;

    function submit() {
      var v = (input.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) {
        err.textContent = 'That email doesn\'t look right.'; err.hidden = false; input.focus(); return;
      }
      err.hidden = true; btn.disabled = true; btn.textContent = 'Sending…';
      track('intent_email_submitted', { door: chosen, building: slug });

      rememberEmail(v);
      rpc('capture_intent_lead', {
        p_email: v, p_intent: chosen, p_building_slug: slug,
        p_path: location.pathname, p_session_id: (window.cmSessionId || null)
      }).then(function () {
        track('intent_email_captured', { door: chosen, building: slug });
        dockName = name || (chosen === 'owner' ? 'Your building' : 'Condo Market');
        // Seed the thread with a confirmation so the dock never opens empty.
        thread.push({ role: 'assistant', content:
          (chosen === 'owner'
            ? 'You\u0027re in. Your building\u0027s full sale record is on its way. Ask me anything as you look around \u2014 and if you want a price for your specific unit, set your number and a local agent will follow up.'
            : 'You\u0027re in. Ask me anything as you look around \u2014 any building, any unit. Remember every one of them can receive a written offer, listed or not.') });
        gated = false;
        renderDock(false);
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'Try again';
        err.textContent = 'Something went wrong — ' + (e && e.message ? e.message : 'please retry.');
        err.hidden = false;
        track('intent_email_failed', { door: chosen, reason: String(e && e.message || 'unknown') });
      });
    }
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    btn.addEventListener('click', function (e) { e.preventDefault(); submit(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    // Don't steal focus on mobile when the value is already there - the keyboard
    // popping up over a filled field reads as another thing to do.
    setTimeout(function () {
      try { if (!input.value) input.focus(); } catch (e) {}
    }, 120);
  }

  /* ------------------------------ trigger -------------------------------
   * There is no longer a trigger. The old flow waited for three scroll
   * gestures past 1.2s, or eight seconds AFTER a scroll had already happened,
   * and was then suppressed permanently by a localStorage key with no expiry.
   * Measured result: 16 impressions against 429 sessions.
   *
   * The persona prompt now renders on first paint for every visitor. A visitor
   * who has already answered sees the launcher instead, so the question is
   * asked once per person, not once per session.
   */
  function init() {
    injectCss();
    if (restoreDock()) return;   // a conversation in progress outranks everything
    slug = buildingSlug();

    var persona = storedPersona();
    if (persona) {
      chosen = persona;          // personalise without asking again
      showLauncher();
    } else {
      showPrompt();              // 100% of sessions, no gesture required
    }

    // Manual opener, for verifying in a real browser.
    window.cmIntentOpen = function () { hidePrompt(); open('manual'); };

    /* Seeded ask, for the hero bar. City Markets exposes window.mktChatAsk(q)
       and its hero drives that; this is the same contract on this platform.

       It drives the real composer rather than reaching into open()'s closure:
       send() is declared inside open() and is not in scope here, and even if
       it were, calling it before the panel has rendered would fail. Typing
       into the input the user would have typed into and clicking the button
       they would have clicked is both simpler and impossible to get subtly
       out of step with the UI.

       skipDoors: the visitor has already told us what they want by typing a
       question. Asking "own or looking?" first would be asking them to
       restate it. */
    window.cmMarketAsk = function (q) {
      q = String(q == null ? '' : q).trim();
      if (!q) return;
      hidePrompt();
      open('hero_ask', true);
      var tries = 0;
      var t = setInterval(function () {
        var input = document.querySelector('.cmi-q');
        var btn = document.querySelector('.cmi-send');
        if (input) {
          clearInterval(t);
          input.value = q;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          if (btn) btn.click();
          else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        } else if (++tries > 60) {
          /* Surfacing a real reason: a silent no-op here would look exactly
             like a dead Ask button, which is the failure this codebase keeps
             producing. */
          clearInterval(t);
          if (window.console) console.warn('cmMarketAsk: composer did not appear');
        }
      }, 100);
    };
    // Escape hatch for testing the prompt after choosing.
    window.cmIntentReset = function () {
      try { localStorage.removeItem(PERSONA_KEY); localStorage.removeItem(SEEN_KEY); } catch (e) {}
      chosen = null; hideLauncher(); if (promptEl) { promptEl.remove(); promptEl = null; } showPrompt();
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
