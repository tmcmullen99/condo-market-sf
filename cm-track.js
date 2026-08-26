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

  // ---- 3. Building slug from path (/building/<slug>) --------------------------
  function buildingSlug() {
    var m = location.pathname.match(/\/building\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  // ---- core sender -----------------------------------------------------------
  var VISITOR = persistentToken();
  var SESSION = sessionId();
  var ATTR = captureAttribution();

  function track(eventType, meta) {
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
      meta: Object.assign({}, meta || {}, ATTR.aid ? { aid: ATTR.aid } : {})
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

  // pageview
  track("pageview");

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

  // dwell_seconds lives in its own column server-side; pass it through meta too.
})();
