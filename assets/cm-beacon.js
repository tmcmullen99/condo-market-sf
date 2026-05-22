(function () {
  var SUPA_URL = 'https://kfqphwerygccpzntbbif.supabase.co';
  // Prefers a global if your site already defines one (your admin app reads
  // window.CMSF_ANON_KEY); otherwise replace the placeholder with the public anon key.
  var ANON = window.CMSF_ANON_KEY || 'PASTE_PUBLIC_ANON_KEY_HERE';
  if (!ANON || ANON === 'PASTE_PUBLIC_ANON_KEY_HERE') {
    if (!window.CMSF_ANON_KEY) { console.warn('[cm-beacon] no anon key'); return; }
    ANON = window.CMSF_ANON_KEY;
  }

  var LS = window.localStorage;
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
    });
  }

  var visitorId = LS.getItem('cm_vid');
  if (!visitorId) { visitorId = uuid(); LS.setItem('cm_vid', visitorId); }

  var SESSION_MS = 30 * 60 * 1000;
  function sessionId() {
    var sid = LS.getItem('cm_sid'), last = parseInt(LS.getItem('cm_slast') || '0', 10), now = Date.now();
    if (!sid || !last || (now - last) > SESSION_MS) { sid = uuid(); LS.setItem('cm_sid', sid); }
    LS.setItem('cm_slast', String(now));
    return sid;
  }

  function token() {
    try { var v = new URLSearchParams(location.search).get('v'); if (v) { LS.setItem('cm_vtok', v); return v; } } catch (e) {}
    return LS.getItem('cm_vtok') || null;
  }
  function param(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }

  function buildingSlug() {
    var m = (location.hash || '').match(/#\/building\/([^\/?#]+)/); if (m) return decodeURIComponent(m[1]);
    var m2 = (location.pathname || '').match(/\/buildings\/([^\/?#]+)/); if (m2) return decodeURIComponent(m2[1]);
    return null;
  }

  function send(eventType, extra) {
    var body = {
      event_type: eventType, visitor_id: visitorId, session_id: sessionId(), visitor_token: token(),
      path: (location.pathname || '') + (location.hash || ''), building_slug: buildingSlug(),
      referrer: document.referrer || null,
      utm_source: param('utm_source'), utm_campaign: param('utm_campaign'), utm_content: param('utm_content'),
      user_agent: navigator.userAgent || null
    };
    if (extra) for (var k in extra) body[k] = extra[k];
    try {
      fetch(SUPA_URL + '/rest/v1/site_events', {
        method: 'POST', keepalive: true, mode: 'cors',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON, 'Prefer': 'return=minimal' },
        body: JSON.stringify(body)
      }).catch(function () {});
    } catch (e) {}
  }

  var activeStart = Date.now(), accrued = 0;
  function pause() { if (activeStart) { accrued += Date.now() - activeStart; activeStart = 0; } }
  function resume() { if (!activeStart) activeStart = Date.now(); }
  function flush(slug) {
    pause(); var secs = Math.round(accrued / 1000); accrued = 0;
    if (secs >= 2) send('dwell', { dwell_seconds: secs, building_slug: slug !== undefined ? slug : buildingSlug() });
    resume();
  }

  var lastSlug = buildingSlug();
  send('pageview');

  function onNav() { var s = buildingSlug(); if (s !== lastSlug) { flush(lastSlug); lastSlug = s; send('pageview'); } }
  window.addEventListener('hashchange', onNav);
  window.addEventListener('popstate', onNav);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(lastSlug); else resume(); });
  window.addEventListener('pagehide', function () { flush(lastSlug); });
  window.addEventListener('beforeunload', function () { flush(lastSlug); });
})();
