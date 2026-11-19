/**
 * Condo Market — Site Event Tracking Module  (cm-track.js)
 * ----------------------------------------------------------
 * Drop-in tracker that feeds the public.track_event() RPC in Supabase.
 *
 * What it does:
 *   1. Creates ONE persistent visitor_token (localStorage) so a person is the
 *      same identity across visits — fixes the journey-stitching gap.
 *   2. Captures email attribution from the URL (utm_*, and ?aid=<anchor>) and
 *      remembers it for the whole session so on-site actions tie back to the
 *      exact email that drove the visit.
 *   3. Exposes window.cmTrack(eventType, meta) for one-line event calls.
 *   4. Auto-fires pageview, dwell, scroll depth, and any element marked with
 *      data-cm-cta="<label>" — so most tracking needs zero extra code.
 *
 * Install:
 *   Include once, sitewide, before </body>:
 *     <script src="/js/cm-track.js" defer></script>
 *   (Or paste the contents into your existing site bundle.)
 *
 * Requires nothing else — it talks to Supabase REST directly with the
 * publishable key. No supabase-js dependency needed.
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://kfqphwerygccpzntbbif.supabase.co";
  var SUPABASE_KEY = "sb_publishable_cR53l68E0KtOpANRKiVi7Q_Vx57yQb0";
  var RPC = SUPABASE_URL + "/rest/v1/rpc/track_event";

  // ---- 1. Persistent identity ------------------------------------------------
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function persistentToken() {
    var k = "cm_visitor_token", t = null;
    try { t = localStorage.getItem(k); if (!t) { t = uuid(); localStorage.setItem(k, t); } }
    catch (e) { t = t || uuid(); }   // private mode fallback (per-session)
    return t;
  }
  function sessionId() {
    var k = "cm_session_id", t = null;
    try { t = sessionStorage.getItem(k); if (!t) { t = uuid(); sessionStorage.setItem(k, t); } }
    catch (e) { t = t || uuid(); }
    return t;
  }

  // ---- 2. Attribution capture (sticky for the session) -----------------------
  function captureAttribution() {
    var k = "cm_attr";
    var qs = new URLSearchParams(location.search);
    var fresh = {
      utm_source: qs.get("utm_source"),
      utm_campaign: qs.get("utm_campaign"),
      utm_content: qs.get("utm_content"),
      aid: qs.get("aid")        // ties to launch_invitations.template_anchor_id
    };
    var hasFresh = fresh.utm_source || fresh.utm_campaign || fresh.aid;
    try {
      if (hasFresh) { sessionStorage.setItem(k, JSON.stringify(fresh)); return fresh; }
      var saved = sessionStorage.getItem(k);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return fresh;
  }

  // ---- 2b. Email click tokens (?e=<uuid>) — 15 Oct 2026 ---------------------
  /* Our emails are sent by the city platform (qinuukntpyulqjzndnho), which
     puts the send's own token on every link to this site. Until now nothing
     here read it, so a click on an SF onboarding email arrived as an
     anonymous pageview and the send never learned it had been clicked.
     On the landing hop: claim the send there (link_email_landing, with the
     page path only - never the query or #fragment), remember the token for
     90 days so later visits stay attributable, put it on every event's meta,
     and take ?e= off the address bar so a reload does not count twice and a
     shared link does not carry the reader's token. No pixel, no redirect. */
  var EM_URL = "https://qinuukntpyulqjzndnho.supabase.co/rest/v1/rpc/link_email_landing";
  var EM_KEY = "sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2";   // that platform's public key
  var EM_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function emailToken() {
    var k = "cm_em", t = new URLSearchParams(location.search).get("e");
    if (t && EM_RE.test(t)) {
      var o = { t: t.toLowerCase(), ts: Date.now(), fresh: true };
      try { localStorage.setItem(k, JSON.stringify({ t: o.t, ts: o.ts })); } catch (e) {}
      return o;
    }
    try {
      var s = JSON.parse(localStorage.getItem(k) || "null");
      if (s && s.t && Date.now() - (s.ts || 0) <= 90 * 864e5) return { t: s.t, ts: s.ts, fresh: false };
      if (s) localStorage.removeItem(k);
    } catch (e) {}
    return null;
  }
  function emailClaim(em, visitor) {
    if (!em || !em.fresh) return;
    try {
      fetch(EM_URL, {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json", apikey: EM_KEY, Authorization: "Bearer " + EM_KEY },
        body: JSON.stringify({ p_token: em.t, p_visitor: visitor, p_path: location.pathname })
      }).catch(function () {});
    } catch (e) {}
  }
  function emailStrip(em) {
    try {
      var p = new URLSearchParams(location.search);
      if (!em || !em.fresh || String(p.get("e") || "").toLowerCase() !== em.t || !history.replaceState) return;
      p.delete("e");
      var q = p.toString();
      history.replaceState(history.state, "", location.pathname + (q ? "?" + q : "") + location.hash);
    } catch (e) {}
  }

  // ---- 3. Building slug from path (/building/<slug>) --------------------------
  function buildingSlug() {
    var m = location.pathname.match(/\/building\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  // ---- core sender -----------------------------------------------------------
  var VISITOR = persistentToken();
  var SESSION = sessionId();
  var ATTR = captureAttribution();
  var EM = emailToken();

  function track(eventType, meta) {
    /* A sign-up, log-in, claim or watchlist step says which click led to it (the last one in this tab, if
       within ten minutes): "Created an account after clicking 'Save this building'", not just "created". */
    if (/^(signup_|login_started|claim_|watchlist_add|offer_submit|valuation_request)/.test(eventType) && !(meta && meta.trigger)) {
      try {
        var lc = JSON.parse(sessionStorage.getItem("cm_last_click") || "null");
        if (lc && Date.now() - lc.at < 600000) meta = Object.assign({}, meta || {}, { trigger: lc.label, trigger_section: lc.section || null, trigger_path: lc.path });
      } catch (e) {}
    }
    var payload = {
      event_type: eventType,
      visitor_token: VISITOR,
      visitor_id: VISITOR,
      session_id: SESSION,
      path: location.pathname,
      building_slug: buildingSlug(),
      referrer: document.referrer || null,
      utm_source: ATTR.utm_source || null,
      utm_campaign: ATTR.utm_campaign || null,
      utm_content: ATTR.utm_content || null,
      user_agent: navigator.userAgent,
      host: location.hostname,
      /* dwell_seconds has its own column server-side and track_event reads it
         from the TOP level of the payload (p->>'dwell_seconds'). It was only
         ever being passed inside meta, so the column came back null on 91% of
         dwell events and the best engagement signal on the site was silently
         empty. Promote it; it stays in meta as well, harmlessly. */
      dwell_seconds: (meta && meta.dwell_seconds != null) ? meta.dwell_seconds : null,
      meta: Object.assign({}, meta || {}, ATTR.aid ? { aid: ATTR.aid } : {}, EM ? { email_token: EM.t } : {})
    };
    // keepalive so events still send during page unload
    try {
      fetch(RPC, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        },
        body: JSON.stringify({ p: payload }),
        keepalive: true
      });
    } catch (e) { /* never break the page over analytics */ }
  }
  window.cmTrack = track;   // public helper for manual events

  // ---- 4. Auto-tracking ------------------------------------------------------

  // pageview (the landing hop from an email says so in meta: track_event only
  // knows its own event names, so this rides on the pageview, not a new type)
  emailClaim(EM, VISITOR);
  track("pageview", EM && EM.fresh ? { email_landing: true, page: location.pathname } : null);
  emailStrip(EM);

  // dwell on unload (seconds on page)
  var start = Date.now();
  var dwellSent = false;
  function sendDwell() {
    /* `once` only guarded pagehide. visibilitychange fires every time the tab
       is backgrounded, so switching apps four times sent four dwell events for
       one visit, each with a larger cumulative figure - which inflates any
       average built on them. One per page view. */
    if (dwellSent) return;
    var secs = Math.round((Date.now() - start) / 1000);
    /* A 13-hour reading is a tab left open overnight, not attention. Cap it so
       one abandoned tab cannot dominate a building's average. */
    if (secs > 3600) secs = 3600;
    if (secs > 0) { dwellSent = true; track("dwell", { dwell_seconds: secs }); }
  }
  window.addEventListener("pagehide", sendDwell, { once: true });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendDwell();
  });

  // scroll depth (fire 50% / 90% once each)
  var fired = {};
  window.addEventListener("scroll", function () {
    var h = document.documentElement;
    var pct = (h.scrollTop + window.innerHeight) / h.scrollHeight * 100;
    if (pct >= 50 && !fired["50"]) { fired["50"] = 1; track("scroll_50"); }
    if (pct >= 90 && !fired["90"]) {
      fired["90"] = 1;
      track("scroll_90");
      /* Broadcast it. Reaching the bottom of a building page is the one
         moment a visitor has demonstrably read the thing, and those visitors
         act at 2.3x the rate of everyone else. Anything that wants to ask for
         something should ask here, not on arrival. */
      try { window.dispatchEvent(new CustomEvent("cm:read-to-end", {
        detail: { building_slug: buildingSlug(), path: location.pathname } })); } catch (e) {}
    }
  }, { passive: true });

  // CTA clicks: any element with data-cm-cta="Label" auto-fires cta_click
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-cm-cta]");
    if (el) track("cta_click", { cta_label: el.getAttribute("data-cm-cta") });
  });

  /* ---- 5. Every click, every form (19 Nov 2026) ------------------------------
     Tim: "ensure we can follow a site visitor's path exactly". Until now only
     pages, dwell, scroll and a handful of tagged buttons were recorded, so a
     path read "viewed listing X, created an account" with nothing between: the
     button that opened the sign-up form was never known. Now every link and
     button clicked is a `click` event (both gates - track_event's allowlist and
     the site_events CHECK - already know it) saying what it said, where it went
     and which part of the page it sat in; a form is recorded when it is first
     used and when it is sent. Never a value typed into a field, never the
     address of a mailto: or tel: link. The last click is kept for this tab, so
     the sign-up and log-in events carry the click that opened them. */
  var CLICK_SEL = "a[href],button,[role=button],summary,input[type=submit],input[type=button],[data-cm-cta]";
  function txt(el) {
    var t = el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.value || el.getAttribute("alt") || "";
    if (!String(t).trim()) { var im = el.querySelector && el.querySelector("img[alt]"); if (im) t = im.getAttribute("alt"); }
    t = String(t).replace(/\s+/g, " ").trim();
    return t.replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "[email]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]").slice(0, 60);
  }
  function where(el) {
    var s = el.closest("[data-sec],[data-cm-section],dialog,[role=dialog],form,nav,header,footer,aside,section,article");
    if (!s) return null;
    var n = s.getAttribute("data-sec") || s.getAttribute("data-cm-section") || s.getAttribute("aria-label") || s.id || "";
    if (!n) { var h = s.querySelector("h1,h2,h3,h4,legend"); n = h ? h.textContent : ""; }
    n = String(n).replace(/\s+/g, " ").trim().slice(0, 50);
    var tag = s.tagName.toLowerCase(), kind = (s.getAttribute("role") === "dialog" || tag === "dialog") ? "pop-up" : tag;
    return n ? (/^(nav|header|footer)$/.test(tag) ? tag + ": " + n : n) : (/^(nav|header|footer|form|pop-up)$/.test(kind) ? kind : null);
  }
  function dest(el) {
    var h = el.getAttribute && el.getAttribute("href");
    if (!h) return null;
    if (/^mailto:/i.test(h)) return "mailto"; if (/^tel:/i.test(h)) return "tel"; if (/^sms:/i.test(h)) return "sms";
    if (h.charAt(0) === "#") return h.slice(0, 40);
    try {
      var u = new URL(h, location.href);
      return (u.hostname === location.hostname ? "" : u.hostname) + u.pathname.slice(0, 100);
    } catch (e) { return null; }
  }
  var lastSig = "", lastAt = 0;
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest(CLICK_SEL) : null;
    if (!el) return;
    var m = { label: txt(el), section: where(el), to: dest(el),
              el: el.tagName.toLowerCase(), id: (el.id || "").slice(0, 40) || null };
    var cta = el.getAttribute("data-cm-cta") || el.getAttribute("data-cta");
    if (cta) m.cta = cta.slice(0, 60);
    if (!m.label && !m.to && !m.cta) return;
    var sig = m.label + "|" + m.to + "|" + m.section, now = Date.now();
    if (sig === lastSig && now - lastAt < 1500) return;          // a double click is one click
    lastSig = sig; lastAt = now;
    try { sessionStorage.setItem("cm_last_click", JSON.stringify({ label: m.label || m.cta || m.to, section: m.section, path: location.pathname, at: now })); } catch (x) {}
    track("click", m);
  }, true);

  function formName(f) {
    var n = f.getAttribute("data-cm-form") || f.getAttribute("aria-label") || f.getAttribute("name") || f.id || "";
    if (!n) { var h = f.querySelector("h1,h2,h3,h4,legend") || (f.closest("dialog,[role=dialog],section") || f).querySelector("h1,h2,h3,h4"); n = h ? h.textContent : ""; }
    if (!n) { var b = f.querySelector("button[type=submit],input[type=submit],button:not([type])"); n = b ? txt(b) : "a form"; }
    return String(n).replace(/\s+/g, " ").trim().slice(0, 60);
  }
  var formsStarted = typeof WeakSet === "function" ? new WeakSet() : null;
  document.addEventListener("focusin", function (e) {
    var t = e.target, f = t && t.form;
    if (!f || !formsStarted || formsStarted.has(f) || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || /^(submit|button|hidden)$/i.test(t.type || "")) return;
    formsStarted.add(f);
    track("form_start", { form: formName(f), field: (t.name || t.type || t.tagName).toString().toLowerCase().slice(0, 30), section: where(f) });
  }, true);
  document.addEventListener("submit", function (e) {
    var f = e.target; if (!f || f.tagName !== "FORM") return;
    track("form_submit", { form: formName(f), section: where(f), fields: f.querySelectorAll("input:not([type=hidden]),textarea,select").length });
  }, true);

  // dwell_seconds lives in its own column server-side; pass it through meta too.
})();
