// _worker.js  (Cloudflare Pages — Advanced Mode)
// =============================================================================
// Condo Market — multi-market dynamic building pages + static passthrough.
//
// Key responsibilities:
//   - Host-aware market chrome (SF / SV) for static pages via renderChrome().
//   - Dynamic edge-render of /building/<slug>/ from building_page_payload RPC.
//   - /building/<slug>/report 301 → /building/<slug>/#market (consolidated).
//   - Per-market text + color swap on every text response (applyMarketSwaps).
//   - Layout-aware building dossier labels (tower / garden / townhomes).
//   - #market section placeholder rendered server-side; cm-market.js hydrates.
// =============================================================================

const SUPABASE_URL      = 'https://kfqphwerygccpzntbbif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

/* ---------------- Platform A: building disclosure reviews ----------------
 * The condo PUBLIC SITE stays on Platform B and is not being merged. But the
 * disclosure reviews are produced by the campaign/account layer, which lives on
 * Platform A. So the building page reads one anon RPC across projects.
 *
 * `building_disclosure_teaser` is deliberately the ONLY thing this page may
 * call. It is SECURITY DEFINER and returns existence, dates and counts —
 * never a finding, never a number out of the documents. The content sits
 * behind `building_disclosure_detail`, which returns account_required to
 * anyone not signed in. That split is what lets this page make the offer
 * without giving the thing away, and what makes it safe to embed a public key.
 *
 * A building on B is a TRACT on A and the sync preserved slugs, so the same
 * slug keys both sides. No translation table.
 */
const SB_A_URL = 'https://qinuukntpyulqjzndnho.supabase.co';
const SB_A_KEY = 'sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
const A_MARKET_ID_BY_TAG = { sf: 5, sv: 6 };

/* --------------------- multi-market chrome (per-Host) -------------------- */
const MARKET_BY_HOST = {
  'sanfranciscocondomarket.com':      'sf',
  'www.sanfranciscocondomarket.com':  'sf',
  'siliconvalleycondomarket.com':     'sv',
  'www.siliconvalleycondomarket.com': 'sv',
};
const MARKETS = {
  sf: { tag: 'sf', slug: 'san-francisco-condo-market',  brand: 'Condo Market SF',             region: 'San Francisco', domain: 'sanfranciscocondomarket.com',  email: 'tim@sanfranciscocondomarket.com',  ogImage: 'https://www.sanfranciscocondomarket.com/og-sf.jpg', accent: '#C2410C', accentDeep: '#9A3412', accentRgb: '194,65,12' },
  sv: { tag: 'sv', slug: 'silicon-valley-condo-market', brand: 'Condo Market Silicon Valley', region: 'Silicon Valley', domain: 'siliconvalleycondomarket.com', email: 'tim@siliconvalleycondomarket.com', heroImage: 'https://images.unsplash.com/photo-1719290227108-ea72b5728ec7?w=2400&q=85&auto=format&fit=crop', ogImage: 'https://www.siliconvalleycondomarket.com/og-sv.jpg', accent: '#00A8B5', accentDeep: '#006D75', accentRgb: '0,168,181' },
};
function resolveMarket(hostname) {
  return MARKETS[MARKET_BY_HOST[(hostname || '').toLowerCase()] || 'sf'];
}
function isHomePath(p)  { return p === '/buildings' || p === '/buildings/' || p === '/buildings/index.html'; }
function isIntelPath(p) { return p === '/intelligence' || p === '/intelligence/' || p === '/intelligence/index.html'; }
function isPetitionPath(p) { return p === '/petition' || p === '/petition.html' || p === '/petition/'; }
function attr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function chromeFor(mk, kind) {
  const www = 'https://www.' + mk.domain;
  if (kind === 'intel') return {
    title: 'Market intelligence \u00b7 ' + mk.brand,
    desc:  'Search every ' + mk.region + ' condo \u2014 ten years of sale history, the citywide $/sf trend, live activity, owner tenure, and per-unit detail.',
    url:   www + '/intelligence/',
  };
  return {
    title: mk.brand + ' \u2014 Every unit is for sale, for the right price.',
    desc:  'A private marketplace for every condo in ' + mk.region + '. Browse buildings, ten years of sales, owner tenure, and live offer activity \u2014 no listing required.',
    /* The home page IS this page (/ is served by rewriting to /buildings/), so
       both declare the root. It declared /buildings/, which told Google the home
       page was a duplicate not worth indexing (24 Sep 2026). */
    url:   www + '/',
  };
}

/* ------------------------- rotating share cards --------------------------
 * Four cards for the How It Works pages. Selection is a hash of pathname +
 * query, so:
 *   - each distinct URL gets a stable card (no flapping between crawls)
 *   - /how-it-works/?v=2 picks a different card AND forces a fresh scrape
 *
 * NOTE ON CACHING: social platforms crawl a URL once and cache the resulting
 * card (X for roughly a week). A given URL therefore locks to whichever card
 * was served at first crawl - randomising per request would not change that.
 * Variety comes from distinct URLs and from cache expiry, not per-share.
 * ------------------------------------------------------------------------ */
const OG_CARDS = ['og-sf-1.png', 'og-sf-2.png', 'og-sf-3.png', 'og-sf-4.png'];

// Explicit pairing beats hashing here: with three pages and four cards a hash
// collided (two pages on card 3, card 2 never used). Each page now gets the
// card whose argument matches its own.
//   1  12,000+ Condos For Sale, Listed Or Not
//   2  12,000+ Off Market Units
//   3  List Without Moving Out, $0 To Test The Market
//   4  Every Unit In San Francisco Is For Sale, For The Right Price
const OG_BY_PATH = {
  '/how-it-works':                  'og-sf-3.png',  // page is about the cost of finding out
  '/how-it-works/sell-with-tenants': 'og-sf-2.png',  // tenants in place -> off-market angle
  '/how-it-works/1031-exchange':     'og-sf-4.png',  // investors buying specific units
};

function ogCardFor(url, mk) {
  if (!mk || mk.tag !== 'sf') return null;
  const path = url.pathname.replace(/\/+$/, '') || '/how-it-works';
  if (!/^\/how-it-works(\/|$)/i.test(url.pathname)) return null;

  // ?v=1..4 forces a specific card and, being a distinct URL, also guarantees
  // the platform re-crawls instead of serving its cached card.
  const v = parseInt(url.searchParams.get('v') || '', 10);
  if (v >= 1 && v <= OG_CARDS.length) {
    return 'https://www.' + mk.domain + '/' + OG_CARDS[v - 1];
  }

  const named = OG_BY_PATH[path.toLowerCase()];
  if (named) return 'https://www.' + mk.domain + '/' + named;

  let h = 2166136261;
  for (let i = 0; i < path.length; i++) { h ^= path.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'https://www.' + mk.domain + '/' + OG_CARDS[(h >>> 0) % OG_CARDS.length];
}

function applyOgRotation(html, url, mk) {
  const img = ogCardFor(url, mk);
  if (!img) return html;
  const esc = String(img).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  if (/<meta\s+property="og:image"[^>]*>/i.test(html)) {
    html = html.replace(/<meta\s+property="og:image"[^>]*>/i,
      '<meta property="og:image" content="' + esc + '">');
  } else {
    html = html.replace(/<head>/i, '<head>\n<meta property="og:image" content="' + esc + '">');
  }
  if (/<meta\s+name="twitter:image"[^>]*>/i.test(html)) {
    html = html.replace(/<meta\s+name="twitter:image"[^>]*>/i,
      '<meta name="twitter:image" content="' + esc + '">');
  } else {
    html = html.replace(/<head>/i, '<head>\n<meta name="twitter:image" content="' + esc + '">');
  }
  return html;
}

/* ------------------------------ favicon ---------------------------------
 * 76 of 166 HTML pages shipped with no favicon link (admin, account,
 * building unit-map pages, auth-callback and others), and dynamically rendered
 * pages had none either. Injecting at the edge covers every route in one
 * place, including any page added later, rather than patching 76 files that
 * would drift apart again.
 * ------------------------------------------------------------------------ */
// First-moment intent capture. Injected at the edge so it reaches static pages,
// edge-rendered building pages, and anything added later - the same reason the
// favicon is handled here rather than in 166 files.
// Bump INTENT_VER on every cm-intent.js change. Cloudflare Pages caches
// /assets/* at the edge, so a redeploy alone can keep serving the previous file
// - fixes then appear not to land even though the repo is correct.
// Same edge-cache problem as INTENT_VER, and cm-track.js is now the file the
// read-to-end prompt depends on. Bump on every cm-track.js or
// cm-watch-prompt.js change.
/* CARTO now watermarks its raster basemaps unless a key is present, and is
   retiring the raster service. The key is free to 5M tile requests a month and
   lives in the Pages environment, not in this file - the tile URLs sit inside
   module-scope template strings built before env exists, so it is stitched in
   on the way out instead. Same variable name as the city worker: one key, both
   platforms. No key set means watermarked tiles, never a broken map. */
let CARTO_KEY = '';
const CARTO_TOKEN = '__CARTO_KEY__';

/* Bump on every og card change. X caches a card per URL for about a week and
   will not re-fetch an image at a URL it has already seen - the version query
   is the only thing that forces it, so a replaced card file with the same name
   stays invisible until the cache expires. */
const OG_VER = '3';

const TRACK_VER = '2';
const INTENT_VER = '24';
const INTENT_TAG = '<script src="/assets/cm-intent.js?v=' + INTENT_VER + '" defer></script>';

function ensureIntent(html) {
  if (typeof html !== 'string') return html;
  if (!/<\/body>/i.test(html)) return html;
  var add = '';
  // cm-track.js was only injected by renderChrome, so static pages had no
  // window.cmTrack at all - no pageviews, no scroll depth, no funnel.
  if (html.indexOf('cm-track.js') === -1) add += '<script src="/assets/cm-track.js?v=' + TRACK_VER + '" defer></script>';
  if (html.indexOf('cm-intent.js') === -1) add += INTENT_TAG;
  return add ? html.replace(/<\/body>/i, add + '</body>') : html;
}

/* Two things every HTML response needs, injected at the same seam as the
   favicon so a page added later cannot miss them.

   carto-key: /assets/*.js is served as application/javascript, so the
   __CARTO_KEY__ substitution below never reaches it. The meta carries the key
   into the DOM instead, and cmCartoTiles() in cm-market.js / cm-report.js
   reads it. No key set means an unkeyed tile URL - watermarked, never broken.

   cm-guard: horizontal overflow on mobile. Any single element wider than the
   viewport widens the document and makes the whole page scroll sideways. The
   real fix is per-element (see .nav-meta below); this is the net that stops one
   missed element taking the whole page with it. overflow-x:clip rather than
   hidden - hidden creates a scroll container and silently breaks
   position:sticky, which the building page header relies on. */
const GLOBAL_TAGS =
  '<meta name="carto-key" content="__CARTO_KEY__">' +
  '<style id="cm-guard">html{overflow-x:clip}body{overflow-x:clip;max-width:100%}' +
  'img,svg,video,canvas,iframe{max-width:100%}</style>';

/* Collapse the masthead nav behind a burger on phones.

   Six links plus a sign-in pill wrapped onto three rows and ate ~230px before
   the page began. Wrapping was the right fix for the horizontal overflow it
   replaced; it is the wrong resting state.

   Injected at the seam rather than written into the four render functions
   that emit a .masthead-row, so there is one copy and a fifth masthead added
   later inherits it. .nav-meta is worker-only markup - no static page uses the
   class - so this cannot reach a page with its own drawer.

   The links are hidden by CSS selector, not moved in the DOM, because the
   Save button is injected into this nav after load: anything that arrives
   late is collapsed by the same rule with no second registration step. */
const NAV_SCRIPT =
  '<script id="cm-nav-boot">(function(){' +
  'if(!window.matchMedia)return;' +
  'var mq=window.matchMedia("(max-width: 720px)");' +
  'function go(){' +
  'if(!mq.matches)return;' +
  'var row=document.querySelector(".masthead-row");' +
  'if(!row||!row.querySelector(".nav-meta")||row.querySelector(".cm-burger"))return;' +
  'var b=document.createElement("button");b.type="button";b.className="cm-burger";' +
  'b.setAttribute("aria-label","Menu");b.setAttribute("aria-expanded","false");' +
  'b.innerHTML="\u2630";row.appendChild(b);row.classList.add("cm-nav-collapsed");' +
  'function shut(){row.classList.remove("is-open");b.setAttribute("aria-expanded","false");b.innerHTML="\u2630";}' +
  'b.addEventListener("click",function(){' +
  'var open=row.classList.toggle("is-open");' +
  'b.setAttribute("aria-expanded",open?"true":"false");b.innerHTML=open?"\u00d7":"\u2630";});' +
  'row.querySelector(".nav-meta").addEventListener("click",function(e){' +
  'if(e.target&&e.target.closest&&e.target.closest("a"))shut();});' +
  'document.addEventListener("keydown",function(e){if(e.key==="Escape")shut();});' +
  '}' +
  'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();' +
  '/* Rotating a phone into range, or resizing on desktop, has to arrive at the\n' +
  '   same place a reload would. */' +
  'if(mq.addEventListener)mq.addEventListener("change",go);' +
  '})();<\/script>';

function ensureGlobals(html) {
  if (typeof html !== 'string') return html;
  if (html.indexOf('id="cm-guard"') !== -1) return html;          // already present
  /* The idempotency guard has to be a token that appears ONLY in the injected
     script. The first version tested for 'cm-nav-collapsed' — which is also
     the class name in the stylesheet on every page that renders a masthead.
     So the check was true before injection, and the script was skipped on
     exactly the pages that needed it: the building pages. Match on the script
     tag's own id instead, which nothing else can contain. */
  if (/<\/body>/i.test(html) && html.indexOf('id="cm-nav-boot"') === -1) {
    html = html.replace(/<\/body>/i, NAV_SCRIPT + '</body>');
  }
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>' + GLOBAL_TAGS);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, '<html$1><head>' + GLOBAL_TAGS + '</head>');
  return html;
}

const FAVICON_TAGS =
  '<link rel="icon" type="image/svg+xml" href="/favicon.svg">' +
  '<link rel="alternate icon" href="/favicon.svg">' +
  '<link rel="apple-touch-icon" href="/favicon.svg">';

function ensureFavicon(html) {
  if (typeof html !== 'string') return html;
  if (/<link[^>]+rel=["']?(?:shortcut\s+)?icon["']?/i.test(html)) return html;  // already declared
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>' + FAVICON_TAGS);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, '<html$1><head>' + FAVICON_TAGS + '</head>');
  return html;
}

/* CITY PALETTE (26 Sep 2026): the condo platform mirrors the City Markets - light content,
   dark chrome, the orange accent. Content colours were converted in place; this gives the
   header and footer containers the city chrome background, on the seam every page passes. */
const CITY_CHROME_CSS = '<style id="cm-city-chrome">'
  + 'header.cm,header.masthead,.masthead,.cm-masthead,.topnav,.cm-header,.cm-drawer,.cm-ticker,header.site,header.top,header.header,'
  + 'body>header:not(.hero):not(.pf-hero):not(.cmr-hero):not(.page-hero),body>footer,footer.cf,footer.footer,.cm-footer'
  + '{background:#12151d;color:#ece7db;border-color:#262c3a}'
  + ':is(header,footer,.masthead,.cm-masthead,.cf) :is(.wordmark,.cm-wordmark) em{color:#e85d2a}'
  + 'footer.cf a{color:#e85d2a}.cf-fine{color:#93a3b8}.cf-fine a{color:#b9c4d6}'
  + 'body>footer :is(p,span,li,small){color:inherit}.cm-hero .cm-eyebrow{color:#e85d2a}'
  + '</style>';
function ensureChrome(html) {
  if (html.indexOf('id="cm-city-chrome"') !== -1 || html.indexOf('/assets/cm-city-ui.css') !== -1) return html;
  const i = html.search(/<\/head>/i);
  return i === -1 ? html : html.slice(0, i) + CITY_CHROME_CSS + html.slice(i);
}

async function withFavicon(res) {
  try {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) return res;
    if (!res.body) return res;
    const body = await res.text();
    /* One seam, on the path every HTML response already takes - so a map
       added later cannot miss the key. */
    let out = ensureMarketNav(ensureBrand(ensureChrome(ensureGlobals(ensureIntent(ensureFavicon(body))))));   // brand first, then the nav links
    if (out.indexOf(CARTO_TOKEN) !== -1) out = out.split(CARTO_TOKEN).join(CARTO_KEY);
    if (out === body) return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return new Response(out, { status: res.status, statusText: res.statusText, headers });
  } catch (e) {
    return res;   // never let favicon injection break a page
  }
}

function applyMarketSwaps(s, mk) {
  if (!mk || !s) return s;
  if (mk.accent) {
    s = s.replace(/#9fb4d8/gi, mk.accent)
         .replace(/#91a1ba/gi, mk.accent)
         .replace(/#5a73a8/gi, mk.accentDeep || mk.accent)
         .replace(/#6a7fa3/gi, mk.accentDeep || mk.accent)
         .replace(/159,180,216/g, mk.accentRgb);
  }
  /* City palette (26 Sep 2026): the light theme writes San Francisco's orange directly; another
     market gets its deep accent on light surfaces and its bright accent on the dark chrome. */
  if (mk.accent && mk.accent.toLowerCase() !== '#c2410c') {
    s = s.replace(/#c2410c/gi, mk.accentDeep || mk.accent).replace(/194,65,12/g, '0,109,117').replace(/#e85d2a/gi, mk.accent);
  }
  if (mk.region && mk.region !== 'San Francisco') {
    s = s.replace(/San Francisco/g, mk.region);
  }
  if (mk.domain && mk.domain !== 'sanfranciscocondomarket.com') {
    s = s.replace(/sanfranciscocondomarket\.com/g, mk.domain);
  }
  if (mk.brand && mk.brand !== 'Condo Market SF') {
    s = s.replace(/Condo Market SF/g, mk.brand);
  }
  if (mk.tag && mk.tag !== 'sf') {
    s = s.replace(/Market<\/em> \u00b7 sf\b/g, 'Market</em> \u00b7 ' + mk.tag);
    s = s.replace(/Market \u00b7 sf\b/g, 'Market \u00b7 ' + mk.tag);
  }
  return s;
}

async function renderChrome(request, env, kind) {
  const res = await env.ASSETS.fetch(request);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('text/html')) return res;

  const mk = resolveMarket(new URL(request.url).hostname);
  const c  = chromeFor(mk, kind);
  let html = await res.text();

  const inject =
    '\n<script>window.__CM_MARKET__=' + JSON.stringify(mk.slug) + ';</script>' +
    '\n<script src="/assets/cm-track.js?v=' + TRACK_VER + '" defer></script>' +
    '\n<link rel="canonical" href="' + attr(c.url) + '">';
  html = html.replace('<head>', '<head>' + inject);

  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>' + attr(c.title) + '</title>')
    .replace(/<meta\s+name="description"[^>]*>/i, '<meta name="description" content="' + attr(c.desc) + '">')
    .replace(/<meta\s+property="og:title"[^>]*>/i, '<meta property="og:title" content="' + attr(c.title) + '">')
    .replace(/<meta\s+property="og:description"[^>]*>/i, '<meta property="og:description" content="' + attr(c.desc) + '">')
    .replace(/<meta\s+property="og:url"[^>]*>/i, '<meta property="og:url" content="' + attr(c.url) + '">');

  if (mk.ogImage) {
    /* Serve the card from the host the crawler is actually on. og:image was
       hardcoded to www.; a crawl that lands on the apex then has to follow a
       redirect for the image, and X fetches a card image once and does not
       follow. Same-origin removes the hop entirely. */
    let ogAbs = mk.ogImage;
    try {
      const reqUrl = new URL(request.url);
      ogAbs = reqUrl.origin + new URL(mk.ogImage).pathname;
    } catch (e) { /* keep the registry value */ }
    ogAbs += (ogAbs.indexOf('?') === -1 ? '?v=' : '&v=') + OG_VER;
    const ogImg = attr(ogAbs);
    if (/<meta\s+property="og:image"[^>]*>/i.test(html)) {
      html = html.replace(/<meta\s+property="og:image"[^>]*>/i, '<meta property="og:image" content="' + ogImg + '">');
    } else {
      html = html.replace('<head>', '<head>\n<meta property="og:image" content="' + ogImg + '">');
    }
    if (/<meta\s+name="twitter:image"[^>]*>/i.test(html)) {
      html = html.replace(/<meta\s+name="twitter:image"[^>]*>/i, '<meta name="twitter:image" content="' + ogImg + '">');
    } else {
      html = html.replace('<head>', '<head>\n<meta name="twitter:image" content="' + ogImg + '">\n<meta name="twitter:card" content="summary_large_image">');
    }
    /* The tags a strict crawler looks for and this page never had. Declared
       once, after the two replacements above, so they cannot be duplicated. */
    if (html.indexOf('og:image:secure_url') === -1) {
      html = html.replace('<head>',
        '<head>\n<meta property="og:image:secure_url" content="' + ogImg + '">' +
        '\n<meta property="og:image:type" content="' + (/\.png(\?|$)/i.test(ogAbs) ? 'image/png' : 'image/jpeg') + '">' +
        '\n<meta property="og:image:alt" content="' + attr(mk.brand) + '">' +
        '\n<meta name="twitter:image:alt" content="' + attr(mk.brand) + '">');
    }
    if (html.indexOf('twitter:card') === -1) {
      html = html.replace('<head>', '<head>\n<meta name="twitter:card" content="summary_large_image">');
    }
  }

  if (kind === 'home' && mk.heroImage) {
    const hero = attr(mk.heroImage);
    html = html
      .replace(/(<img class="cm-hero-img" src=")[^"]*(")/i, function (m, a, b) { return a + hero + b; })
      .replace(/(<link rel="preload" as="image" href=")[^"]*(")/i, function (m, a, b) { return a + hero + b; });
  }

  // (Home active-listings teaser removed — replaced by building-list highlights.)

  if (kind === 'intel' && mk.tag === 'sf') {
    const widget = neighborhoodCompareWidget(mk) + priceMovementWidget(mk);
    // Place ABOVE the footer, in the dark content area. Try anchors in order;
    // each replace only fires if the marker exists, so the first match wins.
    if (html.indexOf('<footer') !== -1) {
      html = html.replace('<footer', widget + '<footer');
    } else if (html.indexOf('</main>') !== -1) {
      html = html.replace('</main>', widget + '</main>');
    } else {
      html = html.replace('</body>', widget + '</body>');
    }
  }

  // Comprehensive sitewide footer: replace the static page footer with CM_FOOTER.
  try {
    const fd = await fetchFooterData(mk);
    const cf = CM_FOOTER(fd);
    const fStart = html.indexOf('<footer');
    if (fStart !== -1) {
      const fEnd = html.indexOf('</footer>', fStart);
      if (fEnd !== -1) {
        html = html.slice(0, fStart) + cf + html.slice(fEnd + '</footer>'.length);
      } else {
        html = html.replace('</body>', cf + '</body>');
      }
    } else if (html.indexOf('</main>') !== -1) {
      html = html.replace('</main>', '</main>' + cf);
    } else {
      html = html.replace('</body>', cf + '</body>');
    }
  } catch (e) { /* leave original footer on failure */ }

  html = applyMarketSwaps(html, mk);

  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('content-type', 'text/html;charset=utf-8');
  return new Response(html, { status: 200, headers });
}

async function wrapStaticWithSwaps(request, env, mk) {
  const resp = await env.ASSETS.fetch(request);
  if (!resp.ok) return resp;
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  const isText = ct.startsWith('text/') || ct.includes('javascript') || ct.includes('xml') || ct.includes('json');
  if (!isText) return resp;
  let body;
  try { body = await resp.text(); } catch (e) { return resp; }
  body = applyMarketSwaps(body, mk);
  body = applyOgRotation(body, new URL(request.url), mk);
  const headers = new Headers(resp.headers);
  headers.delete('content-length');
  return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
}


/* ============================================================================
   CITY UI ON THE CONDO MARKET (26 Sep 2026)
   The condo market takes the City Markets' UI and UX page by page. The design
   system is the City Markets' own stylesheet, published as
   /assets/cm-city-ui.css (the accent swapped to the condo orange). These are
   its shared pieces - header, agent strip, footer - and the pages built on it.
   ========================================================================== */
const CITY_UI_VER = '6';

function cityEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function citySlug(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function cityHead(title, desc, canonical, extra) {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + cityEsc(title) + '</title>\n<meta name="description" content="' + cityEsc(desc) + '">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:title" content="' + cityEsc(title) + '">\n<meta property="og:description" content="' + cityEsc(desc) + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n<meta property="og:image" content="https://www.sanfranciscocondomarket.com/og-sf.jpg">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/assets/cm-city-ui.css?v=' + CITY_UI_VER + '">\n' + (extra || '') + '</head>\n';
}

function cityNav(active) {
  const a = (href, label, key, extra) => '<a href="' + href + '"' + (active === key ? ' aria-current="page" class="on"' : '') + (extra || '') + '>' + label + '</a>';
  return '<body>\n<nav class="nav">\n  <div class="nav-inner">\n' +
    '    <a class="wordmark" href="/" style="--bs:1.00"><b>Condo</b> Market<span class="tag">SF</span></a>\n' +
    '    <div class="nav-links">\n' +
    '      ' + a('/active-listings/', '<span class="live-dot"></span>For sale', 'forsale') + '\n' +
    '      ' + a('/off-market/', 'Off market', 'offmarket') + '\n' +
    '      ' + a('/buildings/', 'Buildings', 'buildings') + '\n' +
    '      ' + a('/intelligence/', 'Intelligence', 'intelligence') + '\n' +
    '      ' + a('/how-it-works/', 'How it works', 'how') + '\n' +
    '    </div>\n' +
    '    <div class="nav-right"><a class="nav-cta" href="#signin" data-cm-auth="login">Sign in</a></div>\n' +
    '    <button class="burger" aria-label="Open menu" aria-expanded="false" id="burger"><span></span><span></span><span></span></button>\n' +
    '  </div>\n</nav>\n';
}

function cityFooter(payload) {
  const hoods = (payload.hoods || []).slice(0, 12);
  const blds = (payload.buildings || []).slice(0, 12);
  return '<section class="meet-agent"><div class="wrap"><div class="ma-card">\n' +
    '  <div class="ma-text"><span class="ma-eyebrow">The agent behind Condo Market SF</span>\n' +
    '    <p>Condo Market SF is run by one licensed agent, not a portal. Tim publishes the record, answers the questions and takes the calls.</p></div>\n' +
    '  <a class="ma-cta" href="https://mcmullenresidential.com/meet-tim" target="_blank" rel="noopener" data-cta="meet_agent">Meet Tim &#8599;</a>\n' +
    '</div></div></section>\n' +
    '<footer>\n  <div class="wrap">\n    <div class="seo-foot" aria-label="Explore San Francisco condos">\n' +
    '  <style>.seo-foot{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:26px 30px;padding:6px 0 30px;margin-bottom:26px;border-bottom:1px solid rgba(255,255,255,.08)}' +
    '.seo-foot h4{font-family:\'JetBrains Mono\',monospace;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;opacity:.75;margin:0 0 10px}' +
    '.seo-foot ul{list-style:none;margin:0;padding:0}.seo-foot li{margin:0 0 5px;line-height:1.35}' +
    '.seo-foot a{color:inherit;opacity:.78;text-decoration:none;font-size:.82rem}.seo-foot a:hover{opacity:1;text-decoration:underline}' +
    '.seo-foot .sf-more{display:inline-block;margin-top:6px;font-size:.78rem;opacity:.95}</style>\n' +
    '  <div class="sf-col"><h4>Neighborhoods in San Francisco</h4><ul>' +
    hoods.map((h) => '<li><a href="/neighborhood/' + citySlug(h.h) + '/">' + cityEsc(h.h) + '</a></li>').join('') +
    '</ul><a class="sf-more" href="/neighborhoods/">All neighborhoods &rarr;</a></div>\n' +
    '  <div class="sf-col"><h4>Condo buildings</h4><ul>' +
    blds.map((b) => '<li><a href="/building/' + cityEsc(b.s) + '/">' + cityEsc(b.n) + '</a></li>').join('') +
    '</ul><a class="sf-more" href="/buildings/">All buildings &rarr;</a></div>\n' +
    '  <div class="sf-col"><h4>The condo markets</h4><ul>' +
    '<li><a href="https://www.sanfranciscocondomarket.com/">San Francisco condos</a></li>' +
    '<li><a href="https://www.siliconvalleycondomarket.com/">Silicon Valley condos</a></li>' +
    '<li><a href="https://www.eichlermarket.com/">Eichler homes</a></li></ul></div>\n' +
    '    </div>\n' +
    '    <div class="foot-grid">\n' +
    '      <div><a class="wordmark" href="/" style="--bs:1.00"><b>Condo</b> Market<span class="tag">SF</span></a>\n' +
    '        <p style="color:var(--slate-dim);font-size:.84rem;margin-top:12px;max-width:36ch">The complete record of San Francisco condominiums.</p></div>\n' +
    '      <div><h4>Index</h4><a href="/active-listings/">For sale</a><a href="/off-market/">Off market</a><a href="/buildings/">Buildings</a>' +
    '<a href="/neighborhoods/">Neighborhoods</a><a href="/san-francisco-condo-market-stats/">Market stats</a><a href="/san-francisco-condo-rankings/">Rankings</a>' +
    '<a href="/intelligence/">Intelligence</a><a href="/how-it-works/">How it works</a><a href="/investor-exchange/">Investor Exchange</a></div>\n' +
    '      <div><h4>Contact</h4><a href="mailto:tim@mcmullen.properties">tim@mcmullen.properties</a><a href="/methodology/">Methodology</a></div>\n' +
    '    </div>\n' +
    '    <p class="disclosure">&copy; 2026 Condo Market SF &middot; Platform operated by McMullen Properties LLC, which is not a real estate brokerage &middot; ' +
    'Real estate services provided by Tim McMullen, Broker, CA DRE #02016832. Condo Market SF is a marketing platform and is not a real estate brokerage. ' +
    'Building and sales information is compiled from public records and other sources; it is deemed reliable but not guaranteed and should be independently verified.</p>\n' +
    '  </div>\n</footer>\n';
}

function cityTail(scripts) {
  return (scripts || '') +
    '<script type="module" src="/assets/cm-auth-nav.js"></script>\n' +
    '<script>(function(){var b=document.getElementById("burger"),n=document.querySelector(".nav");if(b&&n)b.addEventListener("click",function(){var o=n.classList.toggle("open");b.setAttribute("aria-expanded",o?"true":"false");});' +
    'var io="IntersectionObserver" in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}});},{rootMargin:"0px 0px -8% 0px"}):null;' +
    'document.querySelectorAll(".reveal").forEach(function(el){io?io.observe(el):el.classList.add("in");});})();</script>\n' +
    '</body>\n</html>\n';
}

/* ---------------------------------------------------------------------------
   /off-market/  - the City Markets' Off Market page, for condos.
   COUNTS ONLY in the first fold: no address, no price, no owner. A Make Me
   Move price is members-only; the page never carries one.
   ------------------------------------------------------------------------- */
function renderOffMarket(payload) {
  const T = payload.totals || {};
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const mmm = Number(T.mmm_named || 0);
  const title = 'Off-Market Condos in San Francisco — Owner Prices & Every Building | Condo Market SF';
  const desc = 'The San Francisco condos that never reach a listing site: prices owners have named privately, and ' + num(T.homes) +
    ' homes in ' + num(T.buildings) + ' buildings you can make an offer on — listed or not.';
  const canonical = 'https://www.sanfranciscocondomarket.com/off-market/';
  const leaflet = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">\n';
  const ghosts = Math.max(6, Math.min(9, mmm || 6));

  const offmarket = '<section id="offmarket" class="om-first" style="background:var(--chrome);color:var(--chrome-ink)">\n  <div class="wrap">\n' +
    '    <div class="section-head reveal">\n' +
    '      <span class="eyebrow" style="color:var(--accent-on-dark)">Off-market &middot; members only</span>\n' +
    '      <h1 class="om-h1" style="color:var(--chrome-ink)">The prices you <em style="color:var(--accent-on-dark)">can&rsquo;t see yet.</em></h1>\n' +
    '      <p class="sub" style="color:#c6cbd6">Two kinds of San Francisco condo never reach a listing site: the unit whose owner has quietly named a number, and the unit that simply has not traded in years. Both are here.</p>\n' +
    '    </div>\n' +
    '    <div class="om-doors reveal">\n' +
    '      <div class="om-door"><div class="om-door-n">' + num(mmm) + '</div>' +
    '<div class="om-door-l">' + (mmm === 1 ? 'Owner who named a private number' : 'Owners who named a private number') + '</div>' +
    '<p class="om-door-b">No listing, no Zillow. A price they would sell at, held quietly until someone meets it.</p></div>\n' +
    '      <div class="om-door"><div class="om-door-n">' + num(T.not_sold_10y) + '</div>' +
    '<div class="om-door-l">Units with no recorded sale in ten years</div>' +
    '<p class="om-door-b">Of ' + num(T.homes) + ' homes in ' + num(T.buildings) + ' buildings. Recorded sales are public; these units have not changed hands in a decade &mdash; and every one is still open to an offer.</p></div>\n' +
    '    </div>\n' +
    '    <div class="om-grid-head"><span class="om-gh-k">Prices owners have named</span>' +
    '<span class="om-soon" id="omSoon"' + (mmm >= 6 ? ' hidden' : '') + '>Opening soon</span></div>\n' +
    '    <div class="om-grid reveal" id="omGrid" data-ghost="1">' +
    Array.from({ length: ghosts }, () => '<div class="om-card om-ghost"><div class="omg-b"></div><div class="omg-s"></div><div class="omg-s" style="width:60%"></div></div>').join('') +
    '</div>\n' +
    '    <div class="reveal" style="text-align:center;margin-top:30px">\n' +
    '      <button class="btn btn-gold" data-cm-auth="signup" data-cta="offmarket:combined-signup">Create a free account to see the numbers &rarr;</button>\n' +
    '    </div>\n  </div>\n</section>\n';

  const map = '<section class="map-section omap" id="map">\n  <div class="wrap">\n' +
    '    <div class="omap-head reveal">\n      <div>\n' +
    '        <span class="eyebrow">Every building &middot; one map</span>\n' +
    '        <h2>Pick any San Francisco condo building. <em>Write an offer, or name your price.</em></h2>\n' +
    '        <p class="sub">All <b>' + num(T.homes) + '</b> homes in ' + num(T.buildings) + ' buildings can trade &mdash; listed or not. Click a building, then choose: an offer on a unit in it, or, if a unit is yours, the number that would make you move.</p>\n' +
    '      </div>\n' +
    '      <div class="omap-legend"><span><i class="lg-h"></i>A building</span><span><i class="lg-m"></i>Units for sale now</span></div>\n' +
    '    </div>\n' +
    '    <div class="omap-frame reveal">\n    <div class="mact-grid">\n' +
    '      <div class="mact-map"><div id="cbmap"></div>\n' +
    '        <p class="map-note">Building locations from public records. Unit counts and sales are compiled from public records &mdash; see <a href="/methodology/">methodology</a>.</p></div>\n' +
    '      <aside class="mact-side"><div class="mact-card">\n' +
    '        <div data-mstate="pick">\n' +
    '          <div class="act-k">Start here</div><h3 class="mact-h">Pick a building</h3>\n' +
    '          <p class="mact-lede">Click any building on the map, or type its name or address.</p>\n' +
    '          <div class="act-f act-f-wide" style="margin-top:18px"><label for="mactAddr">Not sure where it is? Type it</label>' +
    '<input id="mactAddr" type="text" placeholder="e.g. Lumina or 338 Main St" autocomplete="off" list="mactList">' +
    '<datalist id="mactList">' + (payload.buildings || []).map((b) => '<option value="' + cityEsc(b.n) + '">').join('') + '</datalist></div>\n' +
    '          <button class="btn btn-line" id="mactUseAddr" style="margin-top:12px">Use this building &rarr;</button>\n' +
    '          <p class="mact-lede" id="mactMiss" style="display:none;margin-top:10px">Not one of the buildings on file yet. <a href="/buildings/">Browse every building &rarr;</a></p>\n' +
    '        </div>\n' +
    '        <div data-mstate="chosen" style="display:none">\n' +
    '          <div class="act-k">This building</div>\n' +
    '          <div class="mact-prop"><div class="mp-addr" id="mactAddrOut"></div><div class="mp-sub" id="mactMetaOut"></div>' +
    '<div class="mp-facts" id="mactFacts"></div><a class="mp-rec" id="mactRec" href="#">View the full building record &rarr;</a></div>\n' +
    '          <p class="mact-lede" style="margin-top:16px">What would you like to do?</p>\n' +
    '          <div class="mact-choose">\n' +
    '            <a class="mact-choice" id="mactOffer" href="#" data-cta="offmarket:map-offer"><span class="mc-t">Write an offer</span><span class="mc-s">On any unit, listed or not &mdash; Tim drafts it with you</span></a>\n' +
    '            <a class="mact-choice" id="mactClaim" href="#" data-cta="offmarket:map-mmm"><span class="mc-t">This is my home &mdash; set my price</span><span class="mc-s">Name what would make you move. No listing, no agreement</span></a>\n' +
    '          </div>\n' +
    '          <button class="mact-back" data-mback>&larr; Pick a different building</button>\n' +
    '        </div>\n' +
    '      </div></aside>\n' +
    '    </div>\n    </div>\n  </div>\n</section>\n';

  const cta = '<section class="omap-cta"><div class="wrap"><div class="omap-cta-in reveal">\n  <div>\n    <div class="omap-cta-k">Members only</div>\n' +
    '    <h3>See the prices that never reach a listing site.</h3>\n' +
    '    <p>Owners&rsquo; private numbers and every building&rsquo;s full sales history with a free account.</p>\n' +
    '  </div>\n  <button class="btn btn-gold" data-cm-auth="signup" data-cta="offmarket:map-signup">Create a free account &rarr;</button>\n</div></div></section>\n';

  const how = '<section class="om-how" id="how"><div class="wrap">\n' +
    '  <div class="om-how-head reveal"><span class="eyebrow">How it works</span><h2>Two ways to trade <em>without a listing.</em></h2>\n' +
    '    <p class="sub">Neither needs a sign, a listing, or an agreement. Neither costs anything until a sale closes.</p></div>\n' +
    '  <div class="om-how-grid">\n' +
    '    <div class="om-path reveal"><div class="om-path-k">For buyers</div><h3>Write an offer</h3>\n      <ol class="om-steps">\n' +
    '        <li><b>Find the unit</b><p>Pick the building on the map above, or search any San Francisco condo &mdash; listed, off-market, or never on the market.</p></li>\n' +
    '        <li><b>Read the record</b><p>Every recorded sale in the building, price per foot against the neighborhood, and the HOA figures, on every building&rsquo;s page.</p></li>\n' +
    '        <li><b>Name your terms</b><p>Price, funding, closing and deposit. Tim drafts a non-binding Letter of Intent and reviews it with you.</p></li>\n' +
    '        <li><b>The owner decides, privately</b><p>Tim presents it to the owner of record. Nothing reaches them until you have seen the draft.</p></li>\n' +
    '      </ol>\n      <a class="btn btn-gold" href="#map" data-cta="offmarket:how-offer">Pick a building on the map &uarr;</a>\n    </div>\n' +
    '    <div class="om-path reveal"><div class="om-path-k">For owners</div><h3>Make Me Move</h3>\n      <ol class="om-steps">\n' +
    '        <li><b>Name your number</b><p>The price that would make you move. No sign, no listing, no agreement.</p></li>\n' +
    '        <li><b>It stays private</b><p>Your price opens only to people with a free account here &mdash; never on Zillow, never on the MLS.</p></li>\n' +
    '        <li><b>A buyer meets it</b><p>When an offer reaches your number, Tim brings it to you. Until then, nothing happens.</p></li>\n' +
    '        <li><b>Change it any time</b><p>Adjust your number or withdraw it whenever you like, at no cost.</p></li>\n' +
    '      </ol>\n      <a class="btn btn-line" href="/owner-signup/" data-cta="offmarket:how-mmm">Set my number &rarr;</a>\n    </div>\n' +
    '  </div>\n  <p class="om-how-foot reveal">Questions? <a href="/how-it-works/">See how Condo Market SF works &rarr;</a></p>\n</div></section>\n';

  const data = (payload.buildings || []).map((b) => [b.s, b.n, b.h, b.u, b.y, b.la, b.lo, b.m ? 1 : 0]);
  const script = '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>\n' +
    '<script>(function(){\n' +
    'var B=' + JSON.stringify(data).replace(/</g, '\\u003c') + ';\n' +
    'var el=document.getElementById("cbmap"); if(!el||!window.L) return;\n' +
    'var map=L.map(el,{scrollWheelZoom:false,zoomControl:true}).setView([37.782,-122.415],13);\n' +
    'var k=(document.querySelector(\'meta[name="carto-key"]\')||{}).content||"";\n' +
    'L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"+(k&&k.indexOf("__")!==0?"?key="+encodeURIComponent(k):""),{attribution:"&copy; OpenStreetMap &copy; CARTO",subdomains:"abcd",maxZoom:19}).addTo(map);\n' +
    'var side=document.querySelector(".mact-card"), pins={};\n' +
    'function state(s){side.querySelectorAll("[data-mstate]").forEach(function(d){d.style.display=d.getAttribute("data-mstate")===s?"":"none";});}\n' +
    'function fmt(n){return Number(n||0).toLocaleString("en-US");}\n' +
    'function choose(b){ if(!b) return; state("chosen");\n' +
    '  document.getElementById("mactAddrOut").textContent=b[1];\n' +
    '  document.getElementById("mactMetaOut").textContent=(b[2]||"San Francisco")+", San Francisco";\n' +
    '  function f(k,v){return "<div><div class=\\"mf-k\\">"+k+"</div><div class=\\"mf-v\\">"+v+"</div></div>";}\n' +
    '  document.getElementById("mactFacts").innerHTML=(b[3]?f("Units",fmt(b[3])):"")+(b[4]?f("Built",b[4]):"")+f("For sale",b[7]?"Now":"None listed");\n' +
    '  document.getElementById("mactRec").href="/building/"+b[0]+"/";\n' +
    '  document.getElementById("mactOffer").href="/building/"+b[0]+"/#offer";\n' +
    '  document.getElementById("mactClaim").href="/owner-signup/?address="+encodeURIComponent(b[1]);\n' +
    '  Object.keys(pins).forEach(function(s){pins[s].setStyle({weight:s===b[0]?3:1});});\n' +
    '  map.panTo([b[5],b[6]]);\n' +
    '  if(window.cmTrack) try{window.cmTrack("cta_click",{cta:"offmarket:map-pick",building:b[0]});}catch(e){}\n' +
    '}\n' +
    'B.forEach(function(b){ var r=4+Math.min(10,Math.sqrt(b[3]||1)*0.55);\n' +
    '  var m=L.circleMarker([b[5],b[6]],{radius:r,color:b[7]?"#9a3412":"#5d6575",weight:1,fillColor:b[7]?"#C2410C":"#8a93a3",fillOpacity:b[7]?0.85:0.55}).addTo(map);\n' +
    '  m.bindTooltip(b[1]+" · "+fmt(b[3])+" units",{direction:"top"}); m.on("click",function(){choose(b);}); pins[b[0]]=m; });\n' +
    'var inp=document.getElementById("mactAddr");\n' +
    'function find(q){ q=(q||"").trim().toLowerCase(); if(!q) return null; var hit=null;\n' +
    '  B.forEach(function(b){ if(!hit && b[1].toLowerCase()===q) hit=b; }); if(hit) return hit;\n' +
    '  B.forEach(function(b){ if(!hit && (b[1].toLowerCase().indexOf(q)!==-1 || b[0].replace(/-/g," ").indexOf(q.replace(/[^a-z0-9 ]/g,""))!==-1)) hit=b; }); return hit; }\n' +
    'document.getElementById("mactUseAddr").addEventListener("click",function(){ var b=find(inp.value); document.getElementById("mactMiss").style.display=b?"none":""; if(b){ choose(b); map.setView([b[5],b[6]],16); } });\n' +
    'inp.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); document.getElementById("mactUseAddr").click(); } });\n' +
    'side.querySelector("[data-mback]").addEventListener("click",function(){ state("pick"); });\n' +
    '})();</script>\n';

  return cityHead(title, desc, canonical, leaflet) + cityNav('offmarket') + offmarket + map + cta + how + cityFooter(payload) + cityTail(script);
}


/* THE MARKET NAV (Tim, 26 Sep 2026): For sale and Off market lead every header, as on the City
   Markets. Added once, at the output seam every HTML response passes, rather than in each template
   and static page: every older header style (masthead nav-meta, the homepage cm-nav, how-it-works
   topnav, press site-nav) gets the two links first, styled like its own links; an existing
   Active Listings link is replaced by For sale so nothing appears twice. */
function ensureMarketNav(html) {
  if (typeof html !== 'string' || html.indexOf('data-cm-mkt-nav') !== -1) return html;
  /* The neighbourhood / news / stats header: <header class="cm"> ... <nav class="nav">. "nav" alone
     is too generic a class to match site-wide, so only inside that header. */
  html = html.replace(/(<header class="cm">[\s\S]{0,600}?<nav class="nav">)(?![\s\S]{0,1200}?href="[^"]*\/off-market)/,
    '$1<a href="/active-listings/" data-cm-mkt-nav>For sale</a><a href="/off-market/" data-cm-mkt-nav>Off market</a>');
  /* The press header squeezes on a phone once it carries two more links: wrap whole links. */
  if (html.indexOf('class="site-nav"') !== -1 && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, '<style>@media(max-width:640px){.site-nav{flex-wrap:wrap;gap:6px 14px;justify-content:flex-end}.site-nav a{white-space:nowrap}}</style></head>');
  }
  return html.replace(/(<(nav|div)\b[^>]*\bclass="(?:[^"]*\s)?(?:nav-meta|cm-nav|cm-drawer|topnav|site-nav)(?:\s[^"]*)?"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    function (all, open, tag, inner, close) {
      if (/href="\/off-market\/?"/.test(inner)) return all;
      inner = inner.replace(/<a\b[^>]*href="\/active-listings\/?"[^>]*>[\s\S]*?<\/a>/g, '');
      const first = inner.match(/<a\b(?![^>]*(?:signin|data-cm-auth|btn|cta|wordmark|cm-wordmark|class="wm"))[^>]*>/);
      if (!first) return all;
      const cls = (first[0].match(/\sclass="[^"]*"/) || [''])[0];
      const add = '<a href="/active-listings/"' + cls + ' data-cm-mkt-nav>For sale</a><a href="/off-market/"' + cls + ' data-cm-mkt-nav>Off market</a>';
      const at = inner.indexOf(first[0]);
      return open + inner.slice(0, at) + add + inner.slice(at) + close;
    });
}

/* ONE BRAND IN EVERY HEADER (Tim, 27 Sep 2026): the Condo Market SF wordmark - "Condo Market"
   in white Playfair, "· sf" in the orange italic - and the orange accent button. Six wordmark
   variants and five sign-in button styles had grown across the templates and static pages;
   they are normalised here, at the seam every HTML page passes. */
const CM_BRAND_CSS = '<style id="cm-brand">'
  + 'a.wordmark,a.wm,a.cm-wordmark{font-family:"Playfair Display",Georgia,serif!important;font-weight:600!important;font-style:normal!important;'
  + 'color:#ffffff!important;text-decoration:none!important;letter-spacing:-.01em;white-space:nowrap}'
  + 'a.wordmark .cm-sf,a.wm .cm-sf,a.cm-wordmark .cm-sf{color:#e85d2a!important;font-style:italic!important;font-weight:500!important;margin-left:.12em}'
  + ':is(header,nav,.nav,.masthead,.cm-masthead,.cm-header,.topnav) :is(a.signin-btn,a.nav-cta,a.cm-signin,a.cm-signin-mini,a.signin-pill,.nav-right a[data-cm-auth]){'
  + 'background:#C2410C!important;color:#ffffff!important;border:1px solid #C2410C!important;box-shadow:none!important}'
  + ':is(header,nav,.nav,.masthead,.cm-masthead,.cm-header,.topnav) :is(a.signin-btn,a.nav-cta,a.cm-signin,a.cm-signin-mini,a.signin-pill,.nav-right a[data-cm-auth]):hover{'
  + 'background:#a8370a!important;border-color:#a8370a!important;color:#ffffff!important}'
  + '.topnav a.cm-wordmark{font-size:20px;line-height:1.2}'
  + '.nav .nav-inner a.wordmark{font-size:20px;line-height:1.2}'
  + '</style>';
function ensureBrand(html) {
  if (typeof html !== 'string' || html.indexOf('id="cm-brand"') !== -1) return html;
  html = html.replace(/<a\b([^>]*\bclass="(?:[^"]*\s)?(?:wordmark|wm|cm-wordmark)(?:\s[^"]*)?"[^>]*)>[\s\S]{0,240}?<\/a>/g,
    function (all, attrs) {
      if (/<a\b/i.test(all.slice(2))) return all;          // never swallow a neighbouring link
      return '<a' + attrs + '>Condo Market<span class="cm-sf"> \u00b7 sf</span></a>';
    });
  /* the How it works pages carry a text brand ("Condo Market · How it works"): the standard wordmark, linked home */
  html = html.replace(/<div class="topnav-brand">(?:(?!<\/div>)[\s\S]){0,200}<\/div>/,
    '<a class="cm-wordmark topnav-brand" href="/">Condo Market<span class="cm-sf"> \u00b7 sf</span></a>');
  const i = html.search(/<\/head>/i);
  return i === -1 ? html : html.slice(0, i) + CM_BRAND_CSS + html.slice(i);
}


/* ---------------------------------------------------------------------------
   DISCLOSURE VIEWER - the City Markets' renderDisclosureSheet / renderCheatSheet, ported (26 Sep 2026).
   San Francisco's disclosure reviews are published on the city platform (market 5), where the
   agent desk writes them; this renders those tokens on the condo domain. /disclosure/?token= tries
   this first and falls back to the condo platform's own viewer (static /disclosure/) otherwise.
   ------------------------------------------------------------------------- */
const RPT_KEY = 'sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';   // the city platform's public key
const RPT_M = { id: 5, name: 'Condo Market SF', city: 'San Francisco', agent: { name: 'Tim McMullen' } };
async function renderDisclosureSheet(token) {
  /* The structured cheat sheet first (published, or a draft to its token);
     a review from before v10 has no sheet and renders the older page. A sheet
     is only served on its own market's domain. */
  const cs = await rptRpc('get_disclosure_sheet', { p_token: token });
  if (cs && cs.ok === true && cs.sheet) {
    if (Number(cs.market_id) !== Number(RPT_M.id)) return null;
    return renderCheatSheet(cs);
  }
  const d = await rptRpc('get_published_disclosure', { p_token: token });
  if (!d || d.ok !== true) return null;
  const F = Array.isArray(d.key_findings) ? d.key_findings : [];
  const bySec = (s) => F.filter((f) => (f.section || 'confirm') === s);
  const findCard = (f) =>
    `<div class="rpt-find">${f.title ? `<h3>${esc(f.title)}</h3>` : (f.severity ? `<h3 class="rpt-sev ${esc(f.severity)}">${esc(String(f.severity).replace(/^./, (c) => c.toUpperCase()))}</h3>` : '')}` +
    `<p>${esc(f.body || f.finding || '')}</p><span class="rpt-src">${esc(f.source)}</span></div>`;   // older reviews: {finding, severity}
  const section = (title, em, list) => list.length
    ? `<section class="rpt-sec"><h2>${title} <em>${em}</em></h2>${list.map(findCard).join('')}</section>` : '';

  const flags = Array.isArray(d.financial_flags) ? d.financial_flags : [];
  const tierRows = (tier) => flags.filter((x) => (x.tier || 'near_term') === tier);
  const row = (x) => `<tr><td>${esc(x.item)}</td><td class="rpt-basis">${esc(x.basis || 'Estimate')}</td>` +
    `<td class="num">${rptMoney(x.low)}</td><td class="num">${rptMoney(x.high)}</td></tr>`;
  const sum = (list, k) => list.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const near = tierRows('near_term'), def = tierRows('deferrable'), cont = tierRows('contingent');
  let budget = '';
  /* Older reviews carry money items as sourced notes, not low/high figures: list them. */
  if (flags.length && !flags.some((x) => x.low != null || x.high != null)) {
    budget = `<section class="rpt-sec"><h2>The money <em>side</em></h2>${flags.map((x) =>
      `<div class="rpt-find"><p>${esc(x.flag || x.item || '')}</p>${x.source ? `<span class="rpt-src">${esc(x.source)}</span>` : ''}</div>`).join('')}</section>`;
  } else if (flags.length) {
    budget = `<section class="rpt-sec"><h2>What to <em>budget for</em></h2>
<table class="rpt-table"><thead><tr><th>Item</th><th>Basis</th><th class="num">Low</th><th class="num">High</th></tr></thead><tbody>
${near.map(row).join('')}
${near.length ? `<tr class="subtotal"><td colspan="2">Near-term subtotal</td><td class="num">${rptMoney(sum(near,'low'))}</td><td class="num">${rptMoney(sum(near,'high'))}</td></tr>` : ''}
${def.map(row).join('')}${cont.map(row).join('')}
${flags.length > near.length ? `<tr class="subtotal"><td colspan="2">All items</td><td class="num">${rptMoney(sum(flags,'low'))}</td><td class="num">${rptMoney(sum(flags,'high'))}</td></tr>` : ''}
</tbody></table>
<p style="font-size:.76rem;color:#8a8f9c;margin-top:8px">Figures labeled "Formal bid" are the contractor's own numbers from the package. Everything else is a planning estimate — not a quote. Get trade bids before removing contingencies.</p></section>`;
  }

  const qs = Array.isArray(d.questions_to_ask) ? d.questions_to_ask : [];
  const questions = qs.length
    ? `<section class="rpt-sec"><h2>Confirm these <em>before you write</em></h2><ol class="rpt-q">${qs.map((q) => `<li>${esc(typeof q === 'string' ? q : ((q && (q.question || q.q)) || ''))}</li>`).join('')}</ol></section>` : '';

  const cross = d.cma_token
    ? `<a class="rpt-cross" href="/cma/?token=${encodeURIComponent(d.cma_token)}">See the Comp Report — the recorded comps →</a>` : '';

  const body = `<div class="rpt-page">
<p class="rpt-eyebrow">Disclosure cheat sheet · ${esc(RPT_M.name)}</p>
<h1>${esc(d.address)}</h1>
<p class="rpt-sub">${esc(RPT_M.city)}, CA${d.mls ? ' · MLS ' + esc(d.mls) : ''} · reviewed ${esc(String(d.published_at || '').slice(0, 10))}</p>
<div class="rpt-head">
${d.condition_score != null ? `<div class="rpt-score"><span class="v">${Number(d.condition_score)}</span><span class="l">Condition</span></div>` : ''}
<div><div class="rpt-strip">${d.risk_level ? `<span class="rpt-risk ${esc(d.risk_level)}">${esc(d.risk_level)} risk</span>` : ''}</div>
<p class="rpt-headline">${esc(d.headline || '')}</p></div>
</div>
${d.property_summary ? `<p style="font-size:.95rem;line-height:1.65;color:#3a3f4c;max-width:64ch">${esc(d.property_summary)}</p>` : ''}
${section("What's genuinely", 'strong', bySec('strong'))}
${section('Verify before', 'you write', bySec('confirm'))}
${section('Looks alarming,', "isn't", bySec('calm'))}
${budget}
${questions}
${d.condition_summary ? `<div class="rpt-bottom"><h2>The bottom line</h2><p>${esc(d.condition_summary)}</p></div>` : ''}
${cross}
<p class="rpt-meta">Prepared by ${esc(d.prepared_by || RPT_M.agent.name)}${d.prepared_dre ? ', DRE #' + esc(d.prepared_dre) : ''} · ${esc(RPT_M.name)} · Sourced from the seller's disclosure package for ${esc(d.address)}; every finding above names the document it came from. This summary does not replace reading the full package, and nothing here is an appraisal or an opinion of value.</p>
</div>`;
  return cityHead('Disclosure Cheat Sheet \u00b7 ' + d.address, 'What the disclosure package for ' + d.address + ' actually says \u2014 sourced finding by finding.', 'https://www.sanfranciscocondomarket.com/disclosure/', '<meta name="robots" content="noindex,nofollow"><style>' + rptCss() + '</style>') +
    cityNav('') + body + cityFooter({}) + cityTail('');
}

async function renderCheatSheet(d) {
  const S = d.sheet || {};
  const m = (n) => (n == null || isNaN(Number(n))) ? '\u2014' : '$' + Math.round(Number(n)).toLocaleString('en-US');
  const cite = (s) => s ? `<span class="cite">${esc(s)}</span>` : '';
  const L = Array.isArray(S.ledger) ? S.ledger : [];
  const buyer = L.filter((x) => x.basis !== 'seller_cost');
  const toSeller = L.filter((x) => x.basis === 'seller_cost');
  const sum = (list, k) => list.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const cat = (c) => buyer.filter((x) => x.category === c);
  const safety = cat('safety'), future = cat('known_future'), elective = cat('elective');
  const other = [...future, ...elective];
  const allLo = sum(buyer, 'low'), allHi = sum(buyer, 'high');

  /* The Comp Report this sheet belongs to: its range and asking price, by the same
     rule the Comp Report page uses. No Comp Report, or no range, and the price sections are
     simply absent — never estimated here. */
  let R = null, asking = null, sqft = null, cmaHref = null;
  if (d.cma_slug) {
    const c = await rptRpc('get_cma_by_slug', { p_slug: d.cma_slug });
    if (c && c.ok === true) {
      const snap = c.comp_snapshot || {};
      sqft = Number((snap.subject || {}).sqft || 0) || null;
      R = cmaRange(snap.comps, sqft, c.mmm_range_low, c.mmm_range_high, c.implied);
      if (!R.lo || !R.hi) R = null;
      const ph = await rptRpc('cma_subject_photos', { p_token: c.public_token, p_limit: 1 });
      asking = (ph && ph.asking) ? Number(ph.asking) : null;
      cmaHref = '/cma/' + d.cma_slug + '/';
    }
  }
  const rangeName = R ? (R.agent ? 'Range on the Comp Report' : 'Supported range') : '';
  const pct = (a, b) => (a && b) ? (a / b * 100).toFixed(1) + '%' : '\u2014';
  const score = Number.isFinite(Number(d.condition_score)) ? Math.max(0, Math.min(100, Number(d.condition_score))) : null;
  const pkg = S.package || {};
  const pages = Number(pkg.pages) || null;
  const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const prepared = d.published_at || d.analyzed_at;
  const preparedOn = prepared ? new Date(prepared).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : today;
  const foot = `${esc(RPT_M.name)} \u00b7 ${esc(d.prepared_by || RPT_M.agent.name)}${d.prepared_dre ? ', California DRE #' + esc(d.prepared_dre) : ''} \u00b7 Prepared ${esc(preparedOn)}`;

  const ledgerRows = (title, list, note) => list.length ? `
<tr class="grp"><td colspan="4">${title}</td></tr>
${list.map((x) => `<tr><td>${esc(x.item)}${x.basis === 'bid' ? ' <span class="bid">contractor bid</span>' : ''}</td><td class="src">${esc(x.source)}</td><td class="n">${m(x.low)}</td><td class="n">${m(x.high)}</td></tr>`).join('')}
<tr class="sub"><td colspan="2">${note}</td><td class="n">${m(sum(list, 'low'))}</td><td class="n">${m(sum(list, 'high'))}</td></tr>` : '';

  const work = Math.round((allLo + allHi) / 2 / 1000) * 1000;
  const offerRows = R ? [
    [R.lo, 'Bottom of the ' + (R.agent ? 'range on the Comp Report' : 'supported range')],
    [Math.round((R.lo + R.hi) / 2000) * 1000, 'Midpoint'],
    [R.hi, 'Top of the ' + (R.agent ? 'range on the Comp Report' : 'supported range')],
  ] : [];

  const body = `
<div class="bar noprint"><div class="in">
  <span>${d.is_draft ? '<b class="draft">Draft \u2014 not published</b> \u00b7 only you can see this link' : 'Disclosure cheat sheet'}</span>
  <span class="acts">${cmaHref ? `<a class="btn ghost" href="${cmaHref}">Back to the Comp Report</a>` : ''}<button class="btn" type="button" onclick="window.print()">Download PDF</button></span>
</div></div>
<main class="doc">
<header class="mast">
  <div>
    <h1>${esc(d.address)}</h1>
    <p class="kick">${esc(RPT_M.city)}${RPT_M.city ? ', CA' : ''} \u00b7 Property condition review \u00b7 Prepared for a buyer</p>
  </div>
  <div class="px">
    ${asking ? `<div class="k">Asking</div><div class="v">${m(asking)}</div>` : ''}
    ${R ? `<div class="k">${rangeName}</div><div class="r">${m(R.lo)} \u2013 ${m(R.hi)}</div>` : ''}
  </div>
</header>

${score != null ? `<section class="score">
  <div class="num"><b>${score}</b><span>out of 100</span></div>
  <div class="band"><b>${esc(S.band || '')}</b><span>${esc(S.band_note || '')}</span></div>
  <div class="scale"><div class="track"><i style="left:${score}%"></i></div>
    <div class="lbl"><span>Major problems</span><span>Typical older home</span><span>Turnkey</span></div></div>
</section>` : ''}

${S.thesis ? `<section class="thesis"><h2 class="eyebrow">What the ${pages ? pages + '-page ' : ''}package says, in one paragraph</h2><p>${esc(S.thesis)}</p></section>` : ''}

${buyer.length ? `<section class="money">
  <div><div class="k">To make it safe</div><div class="v">${m(sum(safety, 'low'))} \u2013 ${m(sum(safety, 'high'))}</div><p>${esc((S.money_notes || {}).safety || '')}</p></div>
  <div><div class="k">Everything else, over time</div><div class="v">${m(sum(other, 'low'))} \u2013 ${m(sum(other, 'high'))}</div><p>${esc((S.money_notes || {}).other || '')}</p></div>
  <div class="all"><div class="k">All open items</div><div class="v">${m(allLo)} \u2013 ${m(allHi)}</div><p>${R
      ? 'About ' + Math.max(1, Math.round(allLo / R.hi * 100)) + '% to ' + Math.max(1, Math.round(allHi / R.lo * 100)) + '% of a purchase in the ' + (R.agent ? 'range on the Comp Report' : 'supported range')
      : buyer.length + ' open item' + (buyer.length === 1 ? '' : 's') + ' in the ledger'}</p></div>
</section>` : ''}

${(S.matters || []).length ? `<section><h2>The ${S.matters.length === 2 ? 'two' : S.matters.length === 1 ? 'one' : 'three'} thing${S.matters.length === 1 ? '' : 's'} that matter${S.matters.length === 1 ? 's' : ''}</h2>
${S.matters.map((x, i) => `<div class="matter"><h3><span>${i + 1}.</span> ${esc(x.title)}</h3><p>${esc(x.body)} ${cite(x.source)}</p>${x.action ? `<p class="do">${esc(x.action)}</p>` : ''}</div>`).join('')}
</section>` : ''}

${(S.strong || []).length ? `<section class="strong"><h2>What is genuinely strong</h2><ul>
${S.strong.map((x) => `<li><b>${esc(x.title)}</b> ${esc(x.body)} ${cite(x.source)}</li>`).join('')}
</ul></section>` : ''}

${L.length ? `<section class="ledger"><h2>Every open item, grouped by urgency</h2>
<table><thead><tr><th>Item, in plain terms</th><th>Where it comes from</th><th class="n">Low</th><th class="n">High</th></tr></thead><tbody>
${ledgerRows('Safety \u2014 do these first, before or soon after you move in', safety, 'Safety subtotal')}
${ledgerRows('Known future \u2014 real costs, but on your timetable', future, 'Known-future subtotal')}
${ledgerRows('Elective \u2014 tidy-up and prevention, no urgency', elective, 'Elective subtotal')}
${buyer.length ? `<tr class="tot"><td colspan="2">All open items \u2014 ${buyer.length} line${buyer.length === 1 ? '' : 's'}</td><td class="n">${m(allLo)}</td><td class="n">${m(allHi)}</td></tr>` : ''}
${toSeller.length ? `<tr class="grp"><td colspan="4">Cost to the seller \u2014 repair requests, not buyer budget</td></tr>
${toSeller.map((x) => `<tr class="seller"><td>${esc(x.item)}</td><td class="src">${esc(x.source)}</td><td class="n" colspan="2">seller</td></tr>`).join('')}` : ''}
</tbody></table>
<p class="fine">Figures are planning estimates prepared by ${esc(RPT_M.name)}. They are not bids, quotes, or the inspector\u2019s opinion \u2014 lines marked contractor bid carry the bid\u2019s own figure. Get contractor numbers on the largest lines before you commit.</p>
</section>` : ''}

${(S.not_defect || []).length ? `<section class="calm"><h2>${S.not_defect.length === 1 ? 'One thing' : 'Two things'} to ask about, which ${S.not_defect.length === 1 ? 'is' : 'are'} not a defect</h2>
${S.not_defect.map((x) => `<h3>${esc(x.title)}</h3><p>${esc(x.body)} ${cite(x.source)}</p>`).join('')}
</section>` : ''}

<section class="uninspected"><h2>What was not inspected</h2>
${(S.not_inspected || []).length
    ? `<ul>${S.not_inspected.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '<p>The reports in this package do not name any area as not entered, tested or scoped. That is worth confirming with the inspector rather than assuming.</p>'}
</section>

${R ? `<section class="offer"><h2>What this means for your offer</h2>
<table><thead><tr><th>Offer</th><th class="n">Per sq ft</th>${asking ? '<th class="n">Of asking</th>' : ''}<th class="n">All-in with ${m(work)} of work</th><th>How to read it</th></tr></thead><tbody>
${offerRows.map(([o, lab]) => `<tr><td class="n b">${m(o)}</td><td class="n">${sqft ? m(o / sqft) : '\u2014'}</td>${asking ? `<td class="n">${pct(o, asking)}</td>` : ''}<td class="n">${m(o + work)}</td><td>${esc(lab)}</td></tr>`).join('')}
</tbody></table>
<p class="fine">${R.agent ? 'The range is the one set on the Comp Report for this home.' : `The range is what the ${R.n} recorded comparable sales on the Comp Report imply per square foot, applied to this home\u2019s recorded area.`} All-in adds the midpoint of the open-items budget. Arithmetic on the Comp Report and the ledger, not an appraisal.</p>
</section>` : ''}

${(S.questions || []).length ? `<section class="qs"><h2>${S.questions.length === 1 ? 'One thing' : ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][S.questions.length] + ' things'} to ask in writing, before the offer date</h2>
<table><thead><tr><th>Question</th><th>Why it matters</th></tr></thead><tbody>
${S.questions.map((x) => `<tr><td>${esc(x.q)}</td><td>${esc(x.why)}</td></tr>`).join('')}
</tbody></table></section>` : ''}

${S.bottom_line ? `<section class="bottom"><h2>The bottom line</h2><p>${esc(S.bottom_line)}</p></section>` : ''}

${d.agent_saw ? `<section class="saw"><h2>What I saw on site</h2><p>${esc(d.agent_saw)}</p>${d.agent_saw_on ? `<p class="fine">${esc(d.prepared_by || RPT_M.agent.name)}, ${esc(String(d.agent_saw_on))}</p>` : ''}</section>` : ''}

${(S.file_facts || []).length ? `<section class="facts">${S.file_facts.map((x) => `<div><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</section>` : ''}

<footer class="src"><p>Prepared from the seller\u2019s disclosure package for ${esc(d.address)}${pkg.compiled ? ', compiled ' + esc(String(pkg.compiled)) : ''}. Every finding names the document it came from. The property condition score is ${esc(RPT_M.name)}\u2019s own measure of physical condition relative to comparable housing; it is not a warranty and not an inspection. Cost figures are planning estimates, not bids or quotes. This sheet is a summary and is not a substitute for reading the full package or commissioning your own inspections. Not an appraisal, a construction estimate, legal advice or tax advice.</p>
<p class="who">${foot}</p></footer>
</main>`;

  const title = d.address + ' \u2014 disclosure cheat sheet';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;0,700;1,500&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>${cheatCss(foot)}</style></head><body>${body}</body></html>`;
}

function cheatCss(foot) {
  return `
:root{--cream:#faf7f1;--navy:#1a1f2e;--ink:#2a2f3c;--mute:#6b7180;--rule:#e3ddd0;--rust:#b0632a;--green:#3f7d4e;--amber:#c79a2e}
*{box-sizing:border-box}
html{background:#efeae0}
body{margin:0;color:var(--ink);font:400 14px/1.6 Poppins,system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;z-index:5;background:var(--navy);color:#ece7db;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px}
.bar .in{max-width:860px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:13px}
.bar .draft{color:#f2c27a}
.bar .acts{display:flex;gap:8px}
.btn{font:600 13px/1 Poppins,sans-serif;border:0;border-radius:999px;padding:11px 18px;background:#d99a4e;color:var(--navy);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;min-height:42px}
.btn.ghost{background:transparent;color:#ece7db;border:1px solid rgba(236,231,219,.3)}
.doc{max-width:860px;margin:24px auto 60px;background:var(--cream);padding:48px 52px;box-shadow:0 2px 24px rgba(26,31,46,.08)}
h1,h2,h3{font-family:Lora,Georgia,serif;color:var(--navy);margin:0}
h1{font-size:34px;line-height:1.1;font-weight:700}
h2{font-size:21px;margin:0 0 12px;font-weight:600}
h2.eyebrow{font:600 11px/1.3 Poppins,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin-bottom:8px}
h3{font-size:16px;margin:14px 0 4px;font-weight:600}
section{margin:30px 0 0;break-inside:auto}
.mast{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:2px solid var(--navy);padding-bottom:18px}
.kick{font:600 10.5px/1.4 Poppins,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin:8px 0 0}
.px{text-align:right;min-width:170px}
.px .k{font:600 10px/1.2 Poppins,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin-top:6px}
.px .v{font:700 26px/1.1 Lora,serif;color:var(--navy)}
.px .r{font:600 15px/1.3 Lora,serif;color:var(--rust)}
.score{display:grid;grid-template-columns:auto auto 1fr;gap:26px;align-items:center;background:var(--navy);color:#ece7db;border-radius:10px;padding:22px 26px;break-inside:avoid}
.score .num b{display:block;font:700 58px/1 Lora,serif;color:#fff}
.score .num span{font:600 10px/1 Poppins,sans-serif;letter-spacing:.16em;text-transform:uppercase;opacity:.7}
.score .band b{display:block;font:600 19px/1.2 Lora,serif;color:#fff}
.score .band span{font-size:12.5px;opacity:.75}
.track{position:relative;height:10px;border-radius:99px;background:linear-gradient(90deg,#b8452e,#d99a4e 45%,#e2c86a 65%,#5e9b63)}
.track i{position:absolute;top:-5px;width:4px;height:20px;margin-left:-2px;background:#fff;border-radius:2px;box-shadow:0 0 0 2px var(--navy)}
.lbl{display:flex;justify-content:space-between;font-size:10.5px;opacity:.7;margin-top:8px}
.thesis p{font:500 16px/1.65 Lora,serif;color:var(--navy);margin:0}
.money{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;break-inside:avoid}
.money>div{border:1px solid var(--rule);border-radius:8px;padding:14px 16px;background:#fff}
.money .all{background:var(--navy);color:#ece7db;border-color:var(--navy)}
.money .k{font:600 10px/1.3 Poppins,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--mute)}
.money .all .k{color:rgba(236,231,219,.7)}
.money .v{font:700 19px/1.25 Lora,serif;color:var(--navy);margin:6px 0 6px}
.money .all .v{color:#fff}
.money p{font-size:12px;line-height:1.5;margin:0;color:var(--mute)}
.money .all p{color:rgba(236,231,219,.8)}
.matter{border-left:3px solid var(--rust);padding:2px 0 2px 16px;margin:0 0 16px;break-inside:avoid}
.matter h3 span{color:var(--rust)}
.matter p{margin:6px 0}
.matter .do{font-weight:500;color:var(--navy)}
.cite{display:inline-block;font:500 10.5px/1.4 Poppins,sans-serif;color:var(--rust);background:rgba(176,99,42,.08);border-radius:4px;padding:1px 6px;margin-left:2px;white-space:normal}
.strong ul{list-style:none;padding:0;margin:0}
.strong li{padding:8px 0 8px 22px;border-bottom:1px solid var(--rule);position:relative;break-inside:avoid}
.strong li:before{content:"";position:absolute;left:4px;top:15px;width:8px;height:8px;border-radius:50%;background:var(--green)}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{font:600 10px/1.3 Poppins,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);text-align:left;padding:8px 8px;border-bottom:2px solid var(--navy)}
td{padding:7px 8px;border-bottom:1px solid var(--rule);vertical-align:top}
tr{break-inside:avoid}
.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.b{font-weight:600}
td.src{color:var(--mute);font-size:11.5px}
.bid{font-size:10px;color:var(--green);border:1px solid var(--green);border-radius:3px;padding:0 4px}
.grp td{font:600 12.5px/1.4 Lora,serif;color:var(--navy);background:rgba(26,31,46,.05);padding-top:10px}
.sub td{font-weight:600;border-bottom:2px solid var(--rule)}
.tot td{font-weight:700;color:#fff;background:var(--navy)}
.seller td{color:var(--mute)}
.fine{font-size:11px;color:var(--mute);margin:10px 0 0}
.calm{background:#fff;border:1px solid var(--rule);border-radius:8px;padding:18px 20px;break-inside:avoid}
.calm h3:first-of-type{margin-top:0}
.uninspected{border:1px dashed var(--mute);border-radius:8px;padding:14px 18px;break-inside:avoid}
.uninspected h2{font-size:17px}
.uninspected ul{margin:0;padding-left:18px}
.bottom{background:var(--navy);color:#ece7db;border-radius:10px;padding:20px 24px;break-inside:avoid}
.bottom h2{color:#fff}
.bottom p{margin:0;font:500 15px/1.65 Lora,serif}
.saw{border-left:3px solid var(--green);padding-left:16px}
.facts{display:grid;grid-template-columns:repeat(2,1fr);gap:0 24px;font-size:12px;border-top:2px solid var(--navy);padding-top:10px}
.facts div{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--rule)}
.facts span{color:var(--mute);min-width:110px}
footer.src{margin-top:26px;font-size:10.5px;color:var(--mute);line-height:1.55}
footer .who{font-weight:600;color:var(--navy)}
@media(max-width:700px){
  .doc{margin:0;padding:26px 18px;box-shadow:none}
  h1{font-size:26px}
  .mast{flex-direction:column}.px{text-align:left}
  .score{grid-template-columns:auto 1fr}.score .scale{grid-column:1/-1}
  .money{grid-template-columns:1fr}
  .facts{grid-template-columns:1fr}
  table{display:block;overflow-x:auto}
}
@page{size:letter;margin:.55in .6in .7in;
  @bottom-left{content:${JSON.stringify(String(foot).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'"))};font:9px Poppins,sans-serif;color:#6b7180}
  @bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px Poppins,sans-serif;color:#6b7180}}
@media print{
  html,body{background:#fff}
  .noprint{display:none!important}
  .doc{max-width:none;margin:0;padding:0;box-shadow:none;background:#fff}
  body{font-size:11.5px}
  h1{font-size:28px} section{margin-top:20px}
  a{color:inherit;text-decoration:none}
}`;
}

function rptCss() {
  return `
.rpt-page{max-width:880px;margin:0 auto;padding:36px 20px 90px}
.rpt-eyebrow{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--apricot);margin-bottom:10px}
.rpt-page h1{font-family:'Playfair Display',serif;font-size:clamp(1.7rem,4vw,2.5rem);line-height:1.12;margin:0 0 8px}
.rpt-sub{color:#5d6575;font-size:.95rem;margin-bottom:22px}
.rpt-strip{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 26px}
.rpt-chip{border:1px solid rgba(32,36,46,.14);border-radius:999px;padding:6px 14px;font-size:.82rem;background:#fff}
.rpt-chip b{font-weight:600}
.rpt-score{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:86px;height:86px;border-radius:50%;border:3px solid var(--apricot);background:#fff;font-family:'Playfair Display',serif}
.rpt-score .v{font-size:1.7rem;line-height:1}
.rpt-score .l{font-family:'JetBrains Mono',monospace;font-size:.44rem;letter-spacing:.14em;text-transform:uppercase;color:#5d6575;margin-top:3px}
.rpt-risk{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;border-radius:999px;padding:5px 13px}
.rpt-risk.low{background:rgba(63,125,78,.1);color:#3f7d4e}
.rpt-risk.moderate{background:rgba(176,125,36,.12);color:#8a6015}
.rpt-risk.elevated{background:rgba(168,67,31,.1);color:#a8431f}
.rpt-head{display:flex;gap:22px;align-items:center;margin-bottom:26px;flex-wrap:wrap}
.rpt-headline{font-size:1.06rem;line-height:1.55;font-weight:500;max-width:56ch}
.rpt-sec{margin:34px 0 0}
.rpt-sec h2{font-family:'Playfair Display',serif;font-size:1.28rem;margin:0 0 14px}
.rpt-sec h2 em{color:var(--apricot);font-style:italic}
.rpt-find{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:16px 18px;margin-bottom:11px}
.rpt-find h3{font-size:.98rem;margin:0 0 6px}
.rpt-find p{margin:0;font-size:.92rem;line-height:1.6;color:#3a3f4c}
.rpt-src{display:block;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:.62rem;color:#8a8f9c}
.rpt-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;overflow:hidden;font-size:.88rem}
.rpt-table th{font-family:'JetBrains Mono',monospace;font-size:.56rem;letter-spacing:.12em;text-transform:uppercase;color:#8a8f9c;text-align:left;padding:10px 14px;border-bottom:1px solid rgba(32,36,46,.1)}
.rpt-table td{padding:10px 14px;border-bottom:1px solid rgba(32,36,46,.07);color:#3a3f4c}
.rpt-table tr:last-child td{border-bottom:0}
.rpt-table .num{text-align:right;white-space:nowrap}
.rpt-table .subtotal td{font-weight:600;background:rgba(193,84,40,.05)}
.rpt-basis{font-family:'JetBrains Mono',monospace;font-size:.62rem;color:#8a8f9c}
.rpt-q{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:6px 18px}
.rpt-q li{margin:11px 0;font-size:.92rem;line-height:1.55;color:#3a3f4c}
.rpt-bottom{background:var(--chrome,#12151d);color:#ece7db;border-radius:14px;padding:24px 26px;margin-top:36px}
.rpt-bottom h2{font-family:'Playfair Display',serif;font-size:1.25rem;margin:0 0 10px;color:#fff}
.rpt-bottom p{margin:0;line-height:1.65;font-size:.95rem;color:#c6cbd6}
.rpt-cross{display:inline-block;margin-top:26px;background:var(--apricot);color:#fff;border-radius:11px;padding:13px 22px;font-weight:600;text-decoration:none}
.rpt-cross.ghost{background:transparent;border:1.5px solid var(--apricot);color:var(--apricot);margin-left:10px}
.rpt-meta{margin-top:34px;padding-top:18px;border-top:1px solid rgba(32,36,46,.12);font-size:.74rem;color:#8a8f9c;line-height:1.7}
.rpt-scatter{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:14px;margin-top:10px}
.rpt-scatter text{font-family:'JetBrains Mono',monospace;font-size:9px;fill:#8a8f9c}
@media print{
  header,footer,.rpt-cross,.site-header,.site-footer,nav{display:none !important}
  body{background:#fff}
  .rpt-page{padding:0;max-width:none}
  .rpt-find,.rpt-table,.rpt-q{break-inside:avoid;border-color:#ccc}
  .rpt-bottom{background:#fff;color:#111;border:2px solid #111}
  .rpt-bottom h2{color:#111}.rpt-bottom p{color:#333}
}`;
}

async function rptRpc(fn, body) {
  try {
    const r = await fetch('https://qinuukntpyulqjzndnho.supabase.co/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': RPT_KEY, 'Authorization': 'Bearer ' + RPT_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
function rptMoney(n) {
  if (n == null || n === '' || isNaN(Number(n))) return '\u2014';
  return '$' + Number(n).toLocaleString('en-US');
}

function cmaRange(comps, sqft, agentLo, agentHi, implied) {
  /* The range comes from the database's cma_implied_range — the one rule the
     composer and the cheat sheet read too: each sale adjusted to this home's
     size at half its own $/sf. The same arithmetic runs here only if a page
     arrives without it, so the two can only agree. */
  let impliedLo = null, impliedHi = null, n = 0;
  if (implied && Number(implied.n) > 0) {
    impliedLo = Number(implied.lo); impliedHi = Number(implied.hi); n = Number(implied.n);
  } else {
    const adj = (Array.isArray(comps) ? comps : [])
      .filter((x) => x && Number(x.soldPrice) > 0 && Number(x.sqft) > 100 && Number(sqft) > 100)
      .map((x) => Number(x.soldPrice) + (Number(sqft) - Number(x.sqft)) * (Number(x.soldPrice) / Number(x.sqft)) * 0.5);
    if (adj.length) {
      impliedLo = Math.round(Math.min(...adj) / 1000) * 1000;
      impliedHi = Math.round(Math.max(...adj) / 1000) * 1000;
      n = adj.length;
    }
  }
  return { impliedLo, impliedHi, lo: agentLo || impliedLo, hi: agentHi || impliedHi,
           agent: !!(agentLo && agentHi), n };
}


/* ---------------------------------------------------------------------------
   LISTING REPORTS SECTION - the City Markets listing 'lead magnet', ported (Tim, 26 Sep 2026).
   Every listing gets it: when a Comp Report / disclosure review is published for this unit (on the city
   platform, market 5, where the desk publishes), the preview + email gate that opens it and emails
   the links; otherwise the same section asks the buyer to request them.
   Only a listing WITH a unit is looked up: the city matcher treats a unit-less address as the
   whole building, and a review of #607 must never appear on another unit.
   ------------------------------------------------------------------------- */
const LM_CSS = ".lm{background:#161a24;color:#ece7db;padding:72px 0 80px;position:relative;overflow:hidden;scroll-margin-top:60px}\n.lm:before{content:\"\";position:absolute;inset:0;background:radial-gradient(900px 480px at 20% 110%,rgba(232,93,42,.16),transparent 60%),radial-gradient(700px 380px at 90% -10%,rgba(232,93,42,.12),transparent 60%);pointer-events:none}\n.lm:after{content:\"\";position:absolute;inset:0;pointer-events:none;opacity:var(--glow,0);transition:opacity .5s ease;\n  background:radial-gradient(520px circle at var(--mx,80%) var(--my,10%),rgba(232,93,42,.16),rgba(232,93,42,.05) 40%,transparent 70%)}\n.lm .wrap{position:relative;z-index:1}\n.lm-eyebrow{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#e85d2a}\n.lm h2{font-family:'Playfair Display',serif;font-size:clamp(2rem,4.2vw,3.1rem);line-height:1.08;color:#fff;margin:12px 0 12px;max-width:20ch}\n.lm h2 em{color:#e85d2a}\n.lm-sub{font-size:1.02rem;line-height:1.6;color:rgba(236,231,219,.78);max-width:62ch;margin:0}\n.lm-stage{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:56px;margin-top:40px;align-items:center}\n/* the document, in miniature */\n.lm-vis{position:relative;min-height:480px;display:flex;align-items:center;justify-content:center}\n.pp{position:relative;width:min(420px,100%);background:#fbf8f2;color:#1a1f2e;border-radius:14px;padding:22px 22px 0;margin:0;\n  box-shadow:0 30px 70px rgba(0,0,0,.45),0 2px 0 rgba(255,255,255,.6) inset;overflow:hidden;height:460px;\n  transform:perspective(1000px) rotate(var(--rot,0deg)) translate(var(--tx,0px),var(--ty,0px)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(var(--lift,0px));\n  transition:transform .35s cubic-bezier(.2,.7,.2,1);will-change:transform}\n.pp:before{content:\"\";position:absolute;inset:0;pointer-events:none;opacity:var(--shine,0);transition:opacity .35s ease;\n  background:radial-gradient(360px circle at var(--cx,50%) var(--cy,50%),rgba(255,255,255,.6),transparent 55%);mix-blend-mode:soft-light;z-index:2}\n.lm-vis .pp-cma{--rot:-2.5deg;z-index:2}\n.lm-vis.two .pp-cma{--tx:-26px;--ty:14px}\n.lm-vis .pp-disc{--rot:3deg;z-index:1}\n.lm-vis.two .pp-disc{position:absolute;--tx:46px;--ty:-18px;opacity:.97}\n.lm-vis:not(.two) .pp-disc{--rot:-2.5deg}\n.pp-head{display:flex;justify-content:space-between;align-items:center;gap:10px}\n.pp-kind{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#b0632a}\n.pp-ok{font-size:11px;font-weight:700;color:#2f7a4f;background:rgba(47,122,79,.12);border-radius:999px;padding:4px 9px;white-space:nowrap}\n.pp-addr{font-family:'Playfair Display',serif;font-size:1.55rem;line-height:1.15;margin:12px 0 4px}\n.pp-by{font-size:12px;color:#6b7180}\n.pp-photo{height:132px;border-radius:10px;margin:14px 0 0;background:#e9e3d6 center/cover no-repeat}\n.pp-veil{padding:16px 0 30px;filter:blur(3.6px);-webkit-mask-image:linear-gradient(#000 55%,transparent);mask-image:linear-gradient(#000 55%,transparent);user-select:none}\n.pp-lbl{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#8a8f9a;margin-bottom:8px}\n.pp-range{display:flex;align-items:center;gap:8px;margin-bottom:14px}\n.pp-range i{height:22px;flex:1;border-radius:6px;background:#1a1f2e}\n.pp-range b{width:18px;height:3px;background:#b0632a}\n.pp-chart{width:100%;height:62px;margin-bottom:12px}\n.pp-chart rect{fill:#d9a441}\n.pp-chart rect:nth-child(4){fill:#b0632a}\n.pp-row{display:flex;gap:10px;align-items:center;margin:9px 0}\n.pp-row i{display:block;height:10px;border-radius:5px;background:#cfc7b8}\n.pp-row b{display:block;width:62px;height:10px;border-radius:5px;background:#1a1f2e;margin-left:auto}\n.pp-score{display:flex;gap:14px;align-items:center;margin:4px 0 14px}\n.pp-score svg{width:64px;height:64px;flex:0 0 64px}\n.pp-score circle{fill:none;stroke:#e5dfd2;stroke-width:7}\n.pp-score circle.arc{stroke:#2f7a4f;stroke-dasharray:130 164;transform:rotate(-90deg);transform-origin:center;stroke-linecap:round}\n.pp-score > div{flex:1}\n.pp-led{display:flex;gap:9px;align-items:center;margin:10px 0}\n.pp-led i{height:10px;border-radius:5px;background:#cfc7b8;flex:0 0 auto}\n.pp-led b{width:54px;height:10px;border-radius:5px;background:#1a1f2e;margin-left:auto}\n.pp-tag{font-size:9px;font-weight:700;border-radius:5px;padding:3px 6px;white-space:nowrap}\n.pp-tag.saf{background:rgba(176,99,42,.16);color:#b0632a}.pp-tag.fut{background:rgba(217,164,65,.2);color:#8a6310}.pp-tag.ele{background:rgba(47,122,79,.14);color:#2f7a4f}\n.pp-lock{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:8px;white-space:nowrap;\n  background:#1a1f2e;color:#fff;font-size:13px;font-weight:600;border-radius:999px;padding:10px 16px;box-shadow:0 12px 30px rgba(0,0,0,.4)}\n.pp-lock svg{width:16px;height:16px;fill:none;stroke:#e85d2a;stroke-width:2;stroke-linecap:round}\n/* the ask */\n.lm-inside{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:10px}\n.lm-inside li{position:relative;padding-left:26px;font-size:.98rem;line-height:1.5;color:rgba(236,231,219,.88)}\n.lm-inside li:before{content:\"\\2713\";position:absolute;left:0;top:0;color:#e85d2a;font-weight:700}\n.lm-gate{background:#faf7f1;color:#20242e;border-radius:18px;padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.3)}\n.lm-gate-copy{font-size:1rem;margin-bottom:12px}\n.lm-gate-copy b{font-family:'Playfair Display',serif;font-size:1.25rem;margin-right:6px}\n.lm-form .rpt-in{font-size:16px;padding:15px 16px;border-radius:12px}\n.lm-form .rpt-btn{font-size:16px;padding:15px 24px;border-radius:12px;transition:transform .2s ease,box-shadow .2s ease}\n.lm-form .rpt-btn:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(193,84,40,.35)}\n.lm .rpt-note{color:#6b7180;margin-top:10px}\n.lm-agent{display:grid;grid-template-columns:56px 1fr;column-gap:14px;align-items:center;margin-top:16px;padding:14px 16px;border-radius:16px;\n  background:rgba(255,255,255,.05);border:1px solid rgba(236,231,219,.14)}\n.lm-agent img,.lm-mono{width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid rgba(232,93,42,.6)}\n.lm-mono{display:flex;align-items:center;justify-content:center;background:#2a3040;font-family:'Playfair Display',serif;font-size:1.2rem;color:#e85d2a}\n.lm-by{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(236,231,219,.55)}\n.lm-name{font-family:'Playfair Display',serif;font-size:1.2rem;color:#fff}\n.lm-title{font-size:.8rem;color:#e85d2a}\n.lm-stats{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}\n.lm-stats div{background:rgba(255,255,255,.06);border-radius:10px;padding:8px 4px;text-align:center}\n.lm-stats b{display:block;font-family:'Playfair Display',serif;font-size:1.1rem;color:#fff}\n.lm-stats span{font-size:9.5px;color:rgba(236,231,219,.62);text-transform:uppercase;letter-spacing:.06em}\n@media(max-width:900px){.lm-stage{grid-template-columns:1fr;gap:28px}.lm-vis{min-height:400px}.pp{height:400px}}\n/* PHONE: the preview on top, the ask right under it, the agent last. */\n@media(max-width:600px){\n  .lm{padding:22px 0 26px}\n  .lm-eyebrow{font-size:9.5px;letter-spacing:.12em}\n  .lm h2{font-size:1.5rem;line-height:1.12;margin:6px 0 0;max-width:none}\n  .lm-sub,.lm-inside{display:none}\n  .lm-stage{margin-top:14px;gap:12px}\n  .lm-vis{min-height:0;height:232px;align-items:flex-start;overflow:visible}\n  .pp{height:232px;padding:14px 15px 0;border-radius:12px;width:calc(100% - 26px)}\n  .lm-vis .pp-cma{--rot:-1.5deg}\n  .lm-vis.two .pp-cma{--tx:-10px;--ty:6px}\n  .lm-vis.two .pp-disc{--tx:18px;--ty:-6px;--rot:2.5deg}\n  .pp-addr{font-size:1.15rem;margin:8px 0 2px}\n  .pp-by{font-size:10.5px}\n  .pp-photo{height:62px;margin-top:9px}\n  .pp-veil{padding-top:10px}\n  .pp-chart{height:40px}\n  .pp-lock{bottom:14px;font-size:11.5px;padding:8px 12px}\n  .lm-gate{padding:13px;border-radius:14px}\n  .lm-gate-copy{font-size:.82rem;margin-bottom:8px}\n  .lm-gate-copy b{font-size:1.02rem}\n  .lm-form{flex-direction:column;gap:7px}\n  .lm-form .rpt-in{width:100%;min-width:0;padding:12px 13px}\n  .lm-form .rpt-btn{width:100%;font-size:15px;padding:13px 16px}\n  .lm .rpt-note{margin-top:6px;font-size:11px}\n  .lm-agent{grid-template-columns:44px 1fr;padding:10px 12px;margin-top:10px}\n  .lm-agent img,.lm-mono{width:44px;height:44px;font-size:1rem}\n  .lm-stats{gap:6px;margin-top:9px}\n  .lm-stats b{font-size:.95rem}\n  .lm-stats span{font-size:8px}\n}\n@media (prefers-reduced-motion: reduce){.lm:after{display:none}.pp{transition:none}}\n.rpt-grid{display:grid;grid-template-columns:300px minmax(0,640px);gap:40px;align-items:start}\n.rpt-grid--solo{grid-template-columns:minmax(0,640px)}\n@media(max-width:840px){.rpt-grid{grid-template-columns:1fr}.rpt-agent{max-width:240px}}\n.rpt-agent img{width:100%;height:auto;border-radius:18px;border:1px solid rgba(32,36,46,.13);box-shadow:0 10px 30px rgba(18,21,29,.10);display:block}\n.rpt-agent-cap{font-size:13px;line-height:1.55;color:rgba(32,36,46,.62);margin-top:12px}\n.rpt-section .rpt-card{background:#fff;border:1px solid rgba(32,36,46,.13);border-radius:14px;padding:24px}\n.rpt-list li{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}\n.rpt-list{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:8px;font-size:14.5px}\n.rpt-risk{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;\n  background:rgba(193,84,40,.08);color:#c15428;border-radius:999px;padding:2px 9px;margin-left:6px}\n.rpt-form{display:flex;gap:8px;flex-wrap:wrap}\n.rpt-in{flex:1;min-width:200px;border:1px solid rgba(32,36,46,.16);border-radius:10px;padding:11px 13px;font:inherit;font-size:14.5px}\n.rpt-in:focus{outline:none;border-color:#c15428}\n.rpt-btn{appearance:none;background:#c15428;color:#fff;border:0;border-radius:10px;padding:11px 20px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}\n.rpt-btn[disabled]{opacity:.5}\n.rpt-note{font-size:12px;color:rgba(32,36,46,.45);margin-top:10px}\n.rpt-out{margin-top:14px;font-size:14.5px}\n.rpt-out a{display:block;color:#c15428;font-weight:600;text-decoration:none;margin-top:6px}\n.rpt-unlocked{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px}\n@media(max-width:700px){.rpt-unlocked{grid-template-columns:1fr}}\n.rpt-doc{display:block;background:#fff;border:1.5px solid #c15428;border-radius:14px;padding:18px 18px 16px;\n  text-decoration:none;color:inherit;box-shadow:0 12px 32px rgba(193,84,40,.16);\n  animation:rptPop .45s cubic-bezier(.2,.9,.3,1.2) both;transition:transform .15s,box-shadow .15s}\n.rpt-doc:hover{transform:translateY(-3px);box-shadow:0 18px 40px rgba(193,84,40,.24)}\n.rpt-doc-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;\n  color:#c15428;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}\n.rpt-doc p{font-size:13.5px;line-height:1.55;color:rgba(32,36,46,.78);margin:0 0 10px;\n  display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}\n.rpt-score{font-size:12.5px;color:rgba(32,36,46,.6);margin-bottom:10px}\n.rpt-open{font-weight:700;font-size:14px;color:#c15428}\n@keyframes rptPop{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}\n.rpt-modal-veil{position:fixed;inset:0;background:rgba(18,21,29,.55);backdrop-filter:blur(3px);z-index:220;\n  display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s}\n.rpt-modal-veil.on{opacity:1}\n.rpt-modal{position:relative;background:#faf7f2;border-radius:18px;max-width:640px;width:100%;max-height:88vh;overflow:auto;\n  padding:30px 30px 24px;box-shadow:0 30px 80px rgba(18,21,29,.4);transform:translateY(16px) scale(.97);transition:transform .3s cubic-bezier(.2,.9,.3,1.15)}\n.rpt-modal-veil.on .rpt-modal{transform:none}\n.rpt-m-x{position:absolute;top:12px;right:14px;appearance:none;background:none;border:0;font-size:26px;line-height:1;\n  color:rgba(32,36,46,.45);cursor:pointer;padding:6px}\n.rpt-m-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#c15428}\n.rpt-m-h{font-family:'Playfair Display',serif;font-size:1.7rem;margin:6px 0 18px;color:#20242e}\n.rpt-m-btns{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}\n@media(max-width:600px){.rpt-m-btns{grid-template-columns:1fr}}\n.rpt-m-btn{display:block;background:#c15428;border-radius:12px;padding:15px 16px;text-decoration:none;\n  box-shadow:0 10px 24px rgba(193,84,40,.3);transition:transform .15s,box-shadow .15s}\n.rpt-m-btn:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(193,84,40,.38)}\n.rpt-m-big{display:block;color:#fff;font-weight:700;font-size:15.5px}\n.rpt-m-small{display:block;color:rgba(255,255,255,.82);font-size:12px;margin-top:4px}\n.rpt-m-how{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:16px 18px}\n.rpt-m-how ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}\n.rpt-m-how li{font-size:13.5px;line-height:1.55;color:rgba(32,36,46,.8)}\n.rpt-m-note{font-size:12px;color:rgba(32,36,46,.5);margin:14px 0 0}/* condo: the preview's small labels, deepened for contrast (same hues) */\n.pp .pp-kind{color:#8a4a1f}.pp .pp-ok{color:#245f3d}.pp .pp-lbl{color:#5d6575}\n.pp .pp-tag.saf{color:#8a3f12}.pp .pp-tag.fut{color:#6b4d0b}.pp .pp-tag.ele{color:#245f3d}\n.lm-title{color:#f28c63}\n.lm-gate .lm-name{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;flex:none;font-size:16px;padding:15px 16px;border-radius:12px}\n.lm-done{padding:2px 0}.lm-done-k{font-family:\"JetBrains Mono\",monospace;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:#9a360c;margin:0 0 10px}\n.lm-done p{margin:0 0 10px;color:#1a1f2e;line-height:1.55;font-size:.98rem}.lm-done-i{display:flex;gap:10px}.lm-done-i>span:first-child{color:#245f3d;font-weight:700}\n.lm-done-n{color:#5d6575!important;font-size:.9rem!important;margin-top:4px!important}\n/* condo phone spacing (Tim, 27 Sep 2026): the papers sit inside their frame, with room above and below */\n@media(max-width:600px){\n  .lm{padding:40px 0 44px}\n  .lm-head h2{margin-bottom:10px}\n  .lm-stage{margin-top:26px;gap:30px}\n  .lm-vis{height:auto;min-height:0;padding:18px 0 22px;align-items:center;overflow:visible}\n  .lm-vis .pp{height:236px}\n  .lm-vis.two .pp-cma{--tx:-6px;--ty:4px;--rot:-1.5deg}\n  .lm-vis.two .pp-disc{--tx:12px;--ty:-4px;--rot:2deg}\n  .lm-vis .pp-kind{white-space:nowrap;font-size:9.5px;letter-spacing:.12em}\n  .lm-stats{grid-template-columns:repeat(2,1fr);gap:8px}\n  .lm-stats b{font-size:1.05rem}.lm-stats span{font-size:9.5px}\n}\n";
const LM_M = { id: 5, name: 'Condo Market SF', city: 'San Francisco', agent: { name: 'Tim McMullen', first: 'Tim', dre: '02016832', reviewImg: null } };
async function listingReportsSection(l) {
  const M = LM_M, KEY = RPT_KEY;
  if (!l.unit && String(l.address_raw || '').indexOf('#') === -1) return await listingRequestSection(l);
  let reportsBlock = '';
  // Surfaced in the title, description and schema below: this is the one thing
  // a portal cannot copy. A buyer searching an address sees Zillow, Redfin and
  // us; the snippet has to say why we are different before they click.
  let hasD = false, hasC = false, reviewRisk = null;
  try {
    const rr = await fetch('https://qinuukntpyulqjzndnho.supabase.co/rest/v1/rpc/ai_reports_for_property',
      { method: 'POST', headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_market_id: M.id, p_address: l.address_norm || l.address_raw }) });
    const reports = rr.ok ? await rr.json() : [];
    const real = Array.isArray(reports) ? reports.filter(x => x && x.kind === 'disclosure_review') : [];
    if (real.length) {
      hasD = real.some(x => x.kind === 'disclosure_review');
      hasC = real.some(x => x.kind === 'cma');
      reviewRisk = (real.find(x => x.kind === 'disclosure_review') || {}).risk_level || null;
      const what = hasD && hasC ? 'the disclosure cheat sheet and the Comp Report'
                 : hasD ? 'the disclosure cheat sheet' : 'the comparative market analysis';
      const items = real.map(x =>
        '<li><b>' + (x.kind === 'cma' ? 'Comp Report' : 'Disclosure Cheat Sheet') + '</b>' +
        (x.headline ? ' — ' + esc(x.headline) : '') +
        (x.risk_level ? ' <span class="rpt-risk">' + esc(x.risk_level) + '</span>' : '') + '</li>').join('');
      /* THE LEAD MAGNET (Tim, 24 Sep 2026). Says exactly which reports are
         finished for this home — a visitor should know what they are about to
         receive — and who prepared them, from the agent's own signature on the
         desk (name, title with DRE, photo, the stats they chose). Nothing here
         is invented: an agent with no stats shows none. */
      const card = await rptRpc('market_agent_card', { p_market_id: M.id });
      const A = (card && card.ok) ? card : { name: M.agent.name, dre: M.agent.dre, stats: [] };
      const aName = A.name || M.agent.name;
      const aTitle = A.title || (A.dre ? 'DRE #' + A.dre : '');
      const aPhoto = A.photo || M.agent.reviewImg || null;
      const aStats = (Array.isArray(A.stats) ? A.stats : []).filter(s => s && s.value && s.label).slice(0, 4);
      const aFirst = String(aName).split(' ')[0];
      const cmaRow = real.find(x => x.kind === 'cma');
      const dRow = real.find(x => x.kind === 'disclosure_review');
      const both = !!(cmaRow && dRow);
      const initials = esc(String(aName).split(' ').map(w => w[0]).join('').slice(0, 2));
      const pvPhoto = (Array.isArray(l.photos) && l.photos[0]) || l.rehosted_url || '';
      const pvAddr = esc(String(l.address_raw || '').split(',')[0]);
      const pvBy = 'Prepared by ' + esc(aName) + (A.dre ? ' \u00b7 DRE #' + esc(A.dre) : '');
      /* THE PREVIEW. A miniature of the document the visitor is asking for —
         crisp where the facts are already public (the document, the address,
         the listing photo, the preparer), blurred below. The blurred half holds
         NO figures at all, only the document's shapes: blur is not a lock, and
         anything in this markup can be read in the page source. The numbers are
         released by get_report_access, after the email. */
      const bars = [34, 52, 41, 63, 47, 58, 38];
      const cmaPaper = cmaRow ? `
      <figure class="pp pp-cma" aria-hidden="true">
        <div class="pp-head"><span class="pp-kind">Comp Report</span><span class="pp-ok">\u2713 Completed</span></div>
        <div class="pp-addr">${pvAddr}</div>
        <div class="pp-by">${pvBy}</div>
        ${pvPhoto ? `<div class="pp-photo" style="background-image:url('${esc(pvPhoto)}')"></div>` : ''}
        <div class="pp-veil">
          <div class="pp-lbl">What the recorded sales imply</div>
          <div class="pp-range"><i></i><b></b><i></i></div>
          <svg class="pp-chart" viewBox="0 0 210 70" preserveAspectRatio="none">${bars.map((h, n) =>
            `<rect x="${n * 30 + 4}" y="${70 - h}" width="20" height="${h}" rx="3"></rect>`).join('')}</svg>
          ${[78, 64, 71, 58].map(w => `<div class="pp-row"><i style="width:${w}%"></i><b></b></div>`).join('')}
        </div>
      </figure>` : '';
      const dPaper = dRow ? `
      <figure class="pp pp-disc" aria-hidden="true">
        <div class="pp-head"><span class="pp-kind">Disclosure Review</span><span class="pp-ok">\u2713 Completed</span></div>
        <div class="pp-addr">${pvAddr}</div>
        <div class="pp-by">${pvBy}</div>
        <div class="pp-veil">
          <div class="pp-score"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26"></circle><circle class="arc" cx="32" cy="32" r="26"></circle></svg>
            <div><div class="pp-lbl">Condition score</div><div class="pp-row"><i style="width:70%"></i></div></div></div>
          ${[['Safety', 'saf', 72], ['Known future', 'fut', 60], ['Known future', 'fut', 66], ['Elective', 'ele', 54], ['Elective', 'ele', 62]].map(r =>
            `<div class="pp-led"><span class="pp-tag ${r[1]}">${r[0]}</span><i style="width:${r[2]}%"></i><b></b></div>`).join('')}
        </div>
      </figure>` : '';
      const heading = both ? `A Comp Report and a disclosure review, <em>done for this home.</em>`
        : cmaRow ? `An agent\u2019s Comp Report, <em>done for this home.</em>`
        : `The disclosure package, <em>read for this home.</em>`;
      const btnLabel = both ? 'Send me both' : cmaRow ? 'Send me the Comp Report' : 'Send me the review';
      const inside = [
        ...(cmaRow ? ['Recorded sales near this home, chosen one by one by ' + esc(aFirst) + ' \u2014 not an automated estimate',
                      'The range those sales imply, beside the asking price, with every comparable on a map'] : []),
        ...(dRow ? ['A condition score and a repair budget: what to fix first, what can wait',
                    'Every finding tied to the report and page it came from'] : [])];
      reportsBlock = `
<section class="lm" id="reviewed"><div class="wrap">
  <div class="lm-head">
    <span class="lm-eyebrow">Prepared for ${esc(l.address_raw || 'this home')} \u00b7 free</span>
    <h2>${heading}</h2>
    <p class="lm-sub">${both ? 'Two documents' : 'A document'} most buyers never get to see before they write an offer \u2014 prepared by a licensed agent for this address, not generated for every listing on the internet.</p>
  </div>
  <div class="lm-stage">
    <div class="lm-vis${both ? ' two' : ''}">
      ${dPaper}${cmaPaper}
      <div class="pp-lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>
        The full ${both ? 'documents unlock' : (cmaRow ? 'Comp Report unlocks' : 'review unlocks')} with your email</div>
    </div>
    <div class="lm-side">
      <ul class="lm-inside">${inside.map(t => `<li>${t}</li>`).join('')}</ul>
      <div class="lm-gate">
        <div class="lm-gate-copy"><b>${both ? 'Get both, free.' : 'Get it free.'}</b> Opens on this screen the moment you enter your email \u2014 and a copy goes to your inbox.</div>
        <input type="text" class="rpt-in lm-name" data-rpt-name placeholder="Your name" autocomplete="name" aria-label="Your name" required>
        <div class="rpt-form lm-form" data-rpt>
          <input type="email" class="rpt-in" data-rpt-email data-cta="gate:email_focus" placeholder="you@email.com" autocomplete="email" aria-label="Your email">
          <button class="rpt-btn" data-rpt-go data-cta="gate:unlock_reports">${btnLabel} \u2192</button>
        </div>
        <p class="rpt-note">No call required.</p>
        <div class="rpt-out" data-rpt-out hidden></div>
      </div>
      <div class="lm-agent">
        ${aPhoto ? `<img src="${esc(aPhoto)}" alt="${esc(aName)}" width="56" height="56" loading="lazy">` : `<div class="lm-mono">${initials}</div>`}
        <div class="lm-who"><div class="lm-by">Prepared by</div><div class="lm-name">${esc(aName)}</div>${aTitle ? `<div class="lm-title">${esc(aTitle)}</div>` : ''}</div>
        ${aStats.length ? `<div class="lm-stats">${aStats.map(s => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
      </div>
    </div>
  </div>
</div></section>
<style>
.lm{background:#161a24;color:#ece7db;padding:72px 0 80px;position:relative;overflow:hidden;scroll-margin-top:60px}
.lm:before{content:"";position:absolute;inset:0;background:radial-gradient(900px 480px at 20% 110%,rgba(232,93,42,.16),transparent 60%),radial-gradient(700px 380px at 90% -10%,rgba(232,93,42,.12),transparent 60%);pointer-events:none}
.lm:after{content:"";position:absolute;inset:0;pointer-events:none;opacity:var(--glow,0);transition:opacity .5s ease;
  background:radial-gradient(520px circle at var(--mx,80%) var(--my,10%),rgba(232,93,42,.16),rgba(232,93,42,.05) 40%,transparent 70%)}
.lm .wrap{position:relative;z-index:1}
.lm-eyebrow{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#e85d2a}
.lm h2{font-family:'Playfair Display',serif;font-size:clamp(2rem,4.2vw,3.1rem);line-height:1.08;color:#fff;margin:12px 0 12px;max-width:20ch}
.lm h2 em{color:#e85d2a}
.lm-sub{font-size:1.02rem;line-height:1.6;color:rgba(236,231,219,.78);max-width:62ch;margin:0}
.lm-stage{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:56px;margin-top:40px;align-items:center}
/* the document, in miniature */
.lm-vis{position:relative;min-height:480px;display:flex;align-items:center;justify-content:center}
.pp{position:relative;width:min(420px,100%);background:#fbf8f2;color:#1a1f2e;border-radius:14px;padding:22px 22px 0;margin:0;
  box-shadow:0 30px 70px rgba(0,0,0,.45),0 2px 0 rgba(255,255,255,.6) inset;overflow:hidden;height:460px;
  transform:perspective(1000px) rotate(var(--rot,0deg)) translate(var(--tx,0px),var(--ty,0px)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(var(--lift,0px));
  transition:transform .35s cubic-bezier(.2,.7,.2,1);will-change:transform}
.pp:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:var(--shine,0);transition:opacity .35s ease;
  background:radial-gradient(360px circle at var(--cx,50%) var(--cy,50%),rgba(255,255,255,.6),transparent 55%);mix-blend-mode:soft-light;z-index:2}
.lm-vis .pp-cma{--rot:-2.5deg;z-index:2}
.lm-vis.two .pp-cma{--tx:-26px;--ty:14px}
.lm-vis .pp-disc{--rot:3deg;z-index:1}
.lm-vis.two .pp-disc{position:absolute;--tx:46px;--ty:-18px;opacity:.97}
.lm-vis:not(.two) .pp-disc{--rot:-2.5deg}
.pp-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.pp-kind{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#b0632a}
.pp-ok{font-size:11px;font-weight:700;color:#2f7a4f;background:rgba(47,122,79,.12);border-radius:999px;padding:4px 9px;white-space:nowrap}
.pp-addr{font-family:'Playfair Display',serif;font-size:1.55rem;line-height:1.15;margin:12px 0 4px}
.pp-by{font-size:12px;color:#6b7180}
.pp-photo{height:132px;border-radius:10px;margin:14px 0 0;background:#e9e3d6 center/cover no-repeat}
.pp-veil{padding:16px 0 30px;filter:blur(3.6px);-webkit-mask-image:linear-gradient(#000 55%,transparent);mask-image:linear-gradient(#000 55%,transparent);user-select:none}
.pp-lbl{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#8a8f9a;margin-bottom:8px}
.pp-range{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.pp-range i{height:22px;flex:1;border-radius:6px;background:#1a1f2e}
.pp-range b{width:18px;height:3px;background:#b0632a}
.pp-chart{width:100%;height:62px;margin-bottom:12px}
.pp-chart rect{fill:#d9a441}
.pp-chart rect:nth-child(4){fill:#b0632a}
.pp-row{display:flex;gap:10px;align-items:center;margin:9px 0}
.pp-row i{display:block;height:10px;border-radius:5px;background:#cfc7b8}
.pp-row b{display:block;width:62px;height:10px;border-radius:5px;background:#1a1f2e;margin-left:auto}
.pp-score{display:flex;gap:14px;align-items:center;margin:4px 0 14px}
.pp-score svg{width:64px;height:64px;flex:0 0 64px}
.pp-score circle{fill:none;stroke:#e5dfd2;stroke-width:7}
.pp-score circle.arc{stroke:#2f7a4f;stroke-dasharray:130 164;transform:rotate(-90deg);transform-origin:center;stroke-linecap:round}
.pp-score > div{flex:1}
.pp-led{display:flex;gap:9px;align-items:center;margin:10px 0}
.pp-led i{height:10px;border-radius:5px;background:#cfc7b8;flex:0 0 auto}
.pp-led b{width:54px;height:10px;border-radius:5px;background:#1a1f2e;margin-left:auto}
.pp-tag{font-size:9px;font-weight:700;border-radius:5px;padding:3px 6px;white-space:nowrap}
.pp-tag.saf{background:rgba(176,99,42,.16);color:#b0632a}.pp-tag.fut{background:rgba(217,164,65,.2);color:#8a6310}.pp-tag.ele{background:rgba(47,122,79,.14);color:#2f7a4f}
.pp-lock{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:8px;white-space:nowrap;
  background:#1a1f2e;color:#fff;font-size:13px;font-weight:600;border-radius:999px;padding:10px 16px;box-shadow:0 12px 30px rgba(0,0,0,.4)}
.pp-lock svg{width:16px;height:16px;fill:none;stroke:#e85d2a;stroke-width:2;stroke-linecap:round}
/* the ask */
.lm-inside{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:10px}
.lm-inside li{position:relative;padding-left:26px;font-size:.98rem;line-height:1.5;color:rgba(236,231,219,.88)}
.lm-inside li:before{content:"\\2713";position:absolute;left:0;top:0;color:#e85d2a;font-weight:700}
.lm-gate{background:#faf7f1;color:#20242e;border-radius:18px;padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.3)}
.lm-gate-copy{font-size:1rem;margin-bottom:12px}
.lm-gate-copy b{font-family:'Playfair Display',serif;font-size:1.25rem;margin-right:6px}
.lm-form .rpt-in{font-size:16px;padding:15px 16px;border-radius:12px}
.lm-form .rpt-btn{font-size:16px;padding:15px 24px;border-radius:12px;transition:transform .2s ease,box-shadow .2s ease}
.lm-form .rpt-btn:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(193,84,40,.35)}
.lm .rpt-note{color:#6b7180;margin-top:10px}
.lm-agent{display:grid;grid-template-columns:56px 1fr;column-gap:14px;align-items:center;margin-top:16px;padding:14px 16px;border-radius:16px;
  background:rgba(255,255,255,.05);border:1px solid rgba(236,231,219,.14)}
.lm-agent img,.lm-mono{width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid rgba(232,93,42,.6)}
.lm-mono{display:flex;align-items:center;justify-content:center;background:#2a3040;font-family:'Playfair Display',serif;font-size:1.2rem;color:#e85d2a}
.lm-by{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(236,231,219,.55)}
.lm-name{font-family:'Playfair Display',serif;font-size:1.2rem;color:#fff}
.lm-title{font-size:.8rem;color:#e85d2a}
.lm-stats{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.lm-stats div{background:rgba(255,255,255,.06);border-radius:10px;padding:8px 4px;text-align:center}
.lm-stats b{display:block;font-family:'Playfair Display',serif;font-size:1.1rem;color:#fff}
.lm-stats span{font-size:9.5px;color:rgba(236,231,219,.62);text-transform:uppercase;letter-spacing:.06em}
@media(max-width:900px){.lm-stage{grid-template-columns:1fr;gap:28px}.lm-vis{min-height:400px}.pp{height:400px}}
/* PHONE: the preview on top, the ask right under it, the agent last. */
@media(max-width:600px){
  .lm{padding:22px 0 26px}
  .lm-eyebrow{font-size:9.5px;letter-spacing:.12em}
  .lm h2{font-size:1.5rem;line-height:1.12;margin:6px 0 0;max-width:none}
  .lm-sub,.lm-inside{display:none}
  .lm-stage{margin-top:14px;gap:12px}
  .lm-vis{min-height:0;height:232px;align-items:flex-start;overflow:visible}
  .pp{height:232px;padding:14px 15px 0;border-radius:12px;width:calc(100% - 26px)}
  .lm-vis .pp-cma{--rot:-1.5deg}
  .lm-vis.two .pp-cma{--tx:-10px;--ty:6px}
  .lm-vis.two .pp-disc{--tx:18px;--ty:-6px;--rot:2.5deg}
  .pp-addr{font-size:1.15rem;margin:8px 0 2px}
  .pp-by{font-size:10.5px}
  .pp-photo{height:62px;margin-top:9px}
  .pp-veil{padding-top:10px}
  .pp-chart{height:40px}
  .pp-lock{bottom:14px;font-size:11.5px;padding:8px 12px}
  .lm-gate{padding:13px;border-radius:14px}
  .lm-gate-copy{font-size:.82rem;margin-bottom:8px}
  .lm-gate-copy b{font-size:1.02rem}
  .lm-form{flex-direction:column;gap:7px}
  .lm-form .rpt-in{width:100%;min-width:0;padding:12px 13px}
  .lm-form .rpt-btn{width:100%;font-size:15px;padding:13px 16px}
  .lm .rpt-note{margin-top:6px;font-size:11px}
  .lm-agent{grid-template-columns:44px 1fr;padding:10px 12px;margin-top:10px}
  .lm-agent img,.lm-mono{width:44px;height:44px;font-size:1rem}
  .lm-stats{gap:6px;margin-top:9px}
  .lm-stats b{font-size:.95rem}
  .lm-stats span{font-size:8px}
}
@media (prefers-reduced-motion: reduce){.lm:after{display:none}.pp{transition:none}}
/* condo: small labels deepened for contrast (same hues) */
.pp .pp-kind{color:#8a4a1f}.pp .pp-ok{color:#245f3d}.pp .pp-lbl{color:#5d6575}.pp .pp-tag.saf{color:#8a3f12}.pp .pp-tag.fut{color:#6b4d0b}.pp .pp-tag.ele{color:#245f3d}.lm-title{color:#f28c63}.lm-gate .lm-name{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;flex:none;font-size:16px;padding:15px 16px;border-radius:12px}@media(max-width:600px){.lm{padding:40px 0 44px}.lm-head h2{margin-bottom:10px}.lm-stage{margin-top:26px;gap:30px}.lm-vis{height:auto;min-height:0;padding:18px 0 22px;align-items:center;overflow:visible}.lm-vis .pp{height:236px}.lm-vis.two .pp-cma{--tx:-6px;--ty:4px;--rot:-1.5deg}.lm-vis.two .pp-disc{--tx:12px;--ty:-4px;--rot:2deg}.lm-vis .pp-kind{white-space:nowrap;font-size:9.5px;letter-spacing:.12em}.lm-stats{grid-template-columns:repeat(2,1fr);gap:8px}.lm-stats b{font-size:1.05rem}.lm-stats span{font-size:9.5px}}
</style>
<script>
/* Pointer tracking for the lead magnet. A fine pointer only (no touch, where
   a tilt would fight scrolling), and nothing for visitors who ask the system
   to reduce motion. One requestAnimationFrame per move; no library. */
(function(){
  var sec = document.querySelector('.lm');
  if (!sec || !window.matchMedia) return;
  if (!matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var cards = [].slice.call(sec.querySelectorAll('.pp,.lm-agent'));
  var raf = 0, ev = null;
  function frame(){
    raf = 0; if (!ev) return;
    var r = sec.getBoundingClientRect();
    sec.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
    sec.style.setProperty('--my', (ev.clientY - r.top) + 'px');
    cards.forEach(function(c){
      var b = c.getBoundingClientRect();
      var inside = ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom;
      if (!inside) { c.style.setProperty('--rx','0deg'); c.style.setProperty('--ry','0deg'); c.style.setProperty('--lift','0px');
        c.style.setProperty('--shine','0'); c.classList.remove('is-tilt'); return; }
      var px = (ev.clientX - b.left) / b.width, py = (ev.clientY - b.top) / b.height;
      c.style.setProperty('--ry', ((px - .5) * 7).toFixed(2) + 'deg');
      c.style.setProperty('--rx', ((.5 - py) * 6).toFixed(2) + 'deg');
      c.style.setProperty('--lift', '-4px');
      c.style.setProperty('--cx', (px * 100).toFixed(1) + '%');
      c.style.setProperty('--cy', (py * 100).toFixed(1) + '%');
      c.style.setProperty('--shine', '1');
      c.classList.add('is-tilt');
    });
  }
  sec.addEventListener('pointermove', function(e){ ev = e; sec.style.setProperty('--glow','1'); if (!raf) raf = requestAnimationFrame(frame); });
  sec.addEventListener('pointerleave', function(){
    ev = null; sec.style.setProperty('--glow','0');
    cards.forEach(function(c){ ['--rx','--ry'].forEach(function(k){ c.style.setProperty(k,'0deg'); });
      c.style.setProperty('--lift','0px'); c.style.setProperty('--shine','0'); c.classList.remove('is-tilt'); });
  });
})();
</script>
<style>
.rpt-grid{display:grid;grid-template-columns:300px minmax(0,640px);gap:40px;align-items:start}
.rpt-grid--solo{grid-template-columns:minmax(0,640px)}
@media(max-width:840px){.rpt-grid{grid-template-columns:1fr}.rpt-agent{max-width:240px}}
.rpt-agent img{width:100%;height:auto;border-radius:18px;border:1px solid rgba(32,36,46,.13);box-shadow:0 10px 30px rgba(18,21,29,.10);display:block}
.rpt-agent-cap{font-size:13px;line-height:1.55;color:rgba(32,36,46,.62);margin-top:12px}
.rpt-section .rpt-card{background:#fff;border:1px solid rgba(32,36,46,.13);border-radius:14px;padding:24px}
.rpt-list li{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rpt-list{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:8px;font-size:14.5px}
.rpt-risk{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  background:rgba(193,84,40,.08);color:#c15428;border-radius:999px;padding:2px 9px;margin-left:6px}
.rpt-form{display:flex;gap:8px;flex-wrap:wrap}
.rpt-in{flex:1;min-width:200px;border:1px solid rgba(32,36,46,.16);border-radius:10px;padding:11px 13px;font:inherit;font-size:14.5px}
.rpt-in:focus{outline:none;border-color:#c15428}
.rpt-btn{appearance:none;background:#c15428;color:#fff;border:0;border-radius:10px;padding:11px 20px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}
.rpt-btn[disabled]{opacity:.5}
.rpt-note{font-size:12px;color:rgba(32,36,46,.45);margin-top:10px}
.rpt-out{margin-top:14px;font-size:14.5px}
.rpt-out a{display:block;color:#c15428;font-weight:600;text-decoration:none;margin-top:6px}
.rpt-unlocked{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px}
@media(max-width:700px){.rpt-unlocked{grid-template-columns:1fr}}
.rpt-doc{display:block;background:#fff;border:1.5px solid #c15428;border-radius:14px;padding:18px 18px 16px;
  text-decoration:none;color:inherit;box-shadow:0 12px 32px rgba(193,84,40,.16);
  animation:rptPop .45s cubic-bezier(.2,.9,.3,1.2) both;transition:transform .15s,box-shadow .15s}
.rpt-doc:hover{transform:translateY(-3px);box-shadow:0 18px 40px rgba(193,84,40,.24)}
.rpt-doc-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  color:#c15428;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.rpt-doc p{font-size:13.5px;line-height:1.55;color:rgba(32,36,46,.78);margin:0 0 10px;
  display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.rpt-score{font-size:12.5px;color:rgba(32,36,46,.6);margin-bottom:10px}
.rpt-open{font-weight:700;font-size:14px;color:#c15428}
@keyframes rptPop{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
.rpt-modal-veil{position:fixed;inset:0;background:rgba(18,21,29,.55);backdrop-filter:blur(3px);z-index:220;
  display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s}
.rpt-modal-veil.on{opacity:1}
.rpt-modal{position:relative;background:#faf7f2;border-radius:18px;max-width:640px;width:100%;max-height:88vh;overflow:auto;
  padding:30px 30px 24px;box-shadow:0 30px 80px rgba(18,21,29,.4);transform:translateY(16px) scale(.97);transition:transform .3s cubic-bezier(.2,.9,.3,1.15)}
.rpt-modal-veil.on .rpt-modal{transform:none}
.rpt-m-x{position:absolute;top:12px;right:14px;appearance:none;background:none;border:0;font-size:26px;line-height:1;
  color:rgba(32,36,46,.45);cursor:pointer;padding:6px}
.rpt-m-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#c15428}
.rpt-m-h{font-family:'Playfair Display',serif;font-size:1.7rem;margin:6px 0 18px;color:#20242e}
.rpt-m-btns{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}
@media(max-width:600px){.rpt-m-btns{grid-template-columns:1fr}}
.rpt-m-btn{display:block;background:#c15428;border-radius:12px;padding:15px 16px;text-decoration:none;
  box-shadow:0 10px 24px rgba(193,84,40,.3);transition:transform .15s,box-shadow .15s}
.rpt-m-btn:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(193,84,40,.38)}
.rpt-m-big{display:block;color:#fff;font-weight:700;font-size:15.5px}
.rpt-m-small{display:block;color:rgba(255,255,255,.82);font-size:12px;margin-top:4px}
.rpt-m-how{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:16px 18px}
.rpt-m-how ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.rpt-m-how li{font-size:13.5px;line-height:1.55;color:rgba(32,36,46,.8)}
.rpt-m-note{font-size:12px;color:rgba(32,36,46,.5);margin:14px 0 0}
</style>
<script>
(function(){
  var box=document.querySelector('[data-rpt]'); if(!box) return;
  var input=document.querySelector('[data-rpt-email]'), btn=document.querySelector('[data-rpt-go]'),
      out=document.querySelector('[data-rpt-out]');
  function vid(){ try{return localStorage.getItem('cb_vid')||null;}catch(e){return null;} }
  btn.addEventListener('click', function(){
    var email=(input.value||'').trim(), nmEl=document.querySelector('[data-rpt-name]'), name=((nmEl&&nmEl.value)||'').trim();
    if(name.length<2){ if(nmEl){ nmEl.style.borderColor='#a8431f'; nmEl.focus(); } return; }
    if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){ input.style.borderColor='#a8431f'; return; }
    btn.disabled=true; btn.textContent='One moment\u2026';
    if(window.CBTrack) CBTrack.event('cta_click',{cta:'report_access',mls:'${l.mls_number}'});
    try{ localStorage.setItem('cm_email', email); }catch(e){}
    fetch('${SUPABASE_URL}/functions/v1/listing-report-request',{
      method:'POST',
      headers:{'apikey':'${SUPABASE_ANON_KEY}','Authorization':'Bearer ${SUPABASE_ANON_KEY}','Content-Type':'application/json'},
      body:JSON.stringify({mode:'deliver',name:name,email:email,address:document.querySelector('[data-rpt]').getAttribute('data-addr'),mls:'${l.mls_number}',
        building_slug:${JSON.stringify(l.building_slug || null)},building_name:${JSON.stringify(l.building_name || '')},unit_label:${JSON.stringify(l.unit || null)}})
    }).then(function(r){return r.json();}).then(function(j){
      if(j&&j.ok&&j.reports&&j.reports.length){
        // The conversion itself. Without this the funnel ended at "popup shown".
        try{ window.CBTrack && window.CBTrack.track
          ? window.CBTrack.track('gate_unlocked',{docs:j.reports.length})
          : fetch(SB+'/rest/v1/site_events',{method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({event_name:'gate_unlocked',page_path:location.pathname,host:location.hostname,market_id:${M.id},meta:{docs:j.reports.length}})}); }catch(e){}
        out.hidden=false;
        function eshtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        out.innerHTML='<div class="rpt-unlocked">'+j.reports.map(function(x,i){
          var isCma=x.kind==='cma';
          var href=x.url;
          var eyebrow=isCma?'Comp Report':'Disclosure Cheat Sheet';
          var badge=!isCma&&x.risk_level?'<span class="rpt-risk">'+eshtml(x.risk_level)+' risk</span>':'';
          var lead=isCma
            ? (x.n_comps?('<p>'+x.n_comps+' recorded sales, selected and adjusted to this exact home \u2014 beds, baths, and square footage accounted for.</p>'):'<p>Recorded comparable sales, selected and adjusted to this exact home.</p>')
            : (x.headline?('<p>'+eshtml(x.headline)+'</p>'):'<p>Every finding sourced to the report it came from, with a repair budget.</p>');
          var scoreLine=(!isCma&&x.score!=null)?'<div class="rpt-score">Condition score <b>'+x.score+'</b> / 100</div>':'';
          return '<a class="rpt-doc" style="animation-delay:'+(i*120)+'ms" href="'+href+'">'+
            '<div class="rpt-doc-k">'+eyebrow+badge+'</div>'+lead+scoreLine+
            '<span class="rpt-open">Open it \u2192</span></a>';
        }).join('')+'</div>';
        box.hidden=true;
        // Unlock modal: the moment of delivery + why these documents are different.
        var mv=document.createElement('div');
        mv.className='rpt-modal-veil';
        var hasDisc=j.reports.some(function(x){return x.kind!=='cma';}), hasCma=j.reports.some(function(x){return x.kind==='cma';});
        var docBtns=j.reports.map(function(x){
          var isCma=x.kind==='cma';
          var href=x.url;
          var big=isCma?'Open the Comp Report':'Open the Disclosure Cheat Sheet';
          var small=isCma
            ? ((x.n_comps?x.n_comps+' recorded sales':'Recorded sales')+', adjusted to this exact home')
            : ((x.risk_level?x.risk_level.charAt(0).toUpperCase()+x.risk_level.slice(1)+' risk':'Sourced findings')+(x.score!=null?' \u00b7 condition score '+x.score+'/100':''));
          return '<a class="rpt-m-btn" href="'+href+'"><span class="rpt-m-big">'+big+' \u2192</span><span class="rpt-m-small">'+eshtml(small)+'</span></a>';
        }).join('');
        mv.innerHTML='<div class="rpt-modal" role="dialog" aria-label="Your documents">'+
          '<button class="rpt-m-x" aria-label="Close">&times;</button>'+
          '<div class="rpt-m-k">Unlocked</div>'+
          '<h3 class="rpt-m-h">'+(j.reports.length>1?'Both documents are yours.':'It\u2019s yours.')+'</h3>'+
          '<div class="rpt-m-btns">'+docBtns+'</div>'+
          '<div class="rpt-m-how"><div class="rpt-m-k" style="margin-bottom:8px">How these were made</div>'+
            '<ul>'+
            /* Only what was delivered. A Comp Report alone is never described as a
               disclosure review, and the Comp Report is described as what it is. */
            (hasDisc?'<li><b>The disclosure package, reviewed.</b> ${M.agent.first} reviewed the seller\u2019s disclosure package for this home \u2014 inspections, pest, permits and the seller\u2019s own statements.</li>'+
            '<li><b>Every finding names its source.</b> Each item on the cheat sheet cites the report and section it came from. Nothing unsourced gets published.</li>'+
            '<li><b>A condition score and a repair budget.</b> The 0\u2013100 score summarizes the package; the budget is grouped by what needs doing first and what can wait.</li>':'')+
            (hasCma?'<li><b>A Comp Report from recorded sales.</b> Each comparable is a closed sale chosen for this home, with the arithmetic shown \u2014 not an automated estimate, and not an appraisal.</li>':'')+
            '</ul></div>'+
          '<p class="rpt-m-note">These links stay on this page too \u2014 come back to them anytime.</p>'+
        '</div>';
        document.body.appendChild(mv);
        requestAnimationFrame(function(){ mv.classList.add('on'); });
        function closeModal(){ mv.classList.remove('on'); setTimeout(function(){ if(mv.parentNode) mv.parentNode.removeChild(mv); }, 250); }
        mv.addEventListener('click', function(e){ if(e.target===mv) closeModal(); });
        mv.querySelector('.rpt-m-x').addEventListener('click', closeModal);
        document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ closeModal(); document.removeEventListener('keydown', esc); } });
        if(window.CBTrack) CBTrack.event('conversion',{kind:'report_access',mls:'${l.mls_number}'});
      } else {
        btn.disabled=false; btn.textContent='Try again';
        out.hidden=false; out.textContent='That did not go through ('+((j&&j.error)||'error')+'). Please try again.';
        // A gate that silently fails is worse than one that never existed.
        try{ fetch(SB+'/rest/v1/site_events',{method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({event_name:'gate_failed',page_path:location.pathname,host:location.hostname,market_id:${M.id},meta:{reason:(j&&j.error)||'unknown'}})}); }catch(e){}
      }
    }).catch(function(){ btn.disabled=false; btn.textContent='Try again';
      out.hidden=false; out.textContent='Network hiccup \u2014 please try again.'; });
  });
})();
</script>`;
      // the address the RPC will match on, attached as data so the inline JS
      // never needs server-side string interpolation of free text
      reportsBlock = reportsBlock.replace('data-rpt>', 'data-rpt data-addr="' + esc(l.address_norm || l.address_raw) + '">');
    } else {
      reportsBlock = await listingRequestSection(l);
    }
  } catch (e) { reportsBlock = ''; }
  return reportsBlock;
}

async function listingRequestSection(l) {
  const M = LM_M;
  const card = await rptRpc('market_agent_card', { p_market_id: M.id });
  const A = (card && card.ok) ? card : { name: M.agent.name, dre: M.agent.dre, stats: [] };
  const aName = A.name || M.agent.name, aFirst = String(aName).split(' ')[0];
  const aTitle = A.title || (A.dre ? 'DRE #' + A.dre : '');
  const aPhoto = A.photo || null;
  const aStats = (Array.isArray(A.stats) ? A.stats : []).filter(s => s && s.value && s.label).slice(0, 4);
  const initials = esc(String(aName).split(' ').map(w => w[0]).join('').slice(0, 2));
  const pvPhoto = (Array.isArray(l.photos) && l.photos[0]) || '';
  const pvAddr = esc(String(l.address_raw || '').split(',')[0]);
  const pvBy = 'Prepared by ' + esc(aName) + (A.dre ? ' \u00b7 DRE #' + esc(A.dre) : '');
  const bars = [34, 52, 41, 63, 47, 58, 38];
  const req = '<span class="pp-ok pp-req">On request</span>';
  const cmaPaper = `
      <figure class="pp pp-cma" aria-hidden="true">
        <div class="pp-head"><span class="pp-kind">Comp Report</span>${req}</div>
        <div class="pp-addr">${pvAddr}</div><div class="pp-by">${pvBy}</div>
        ${pvPhoto ? `<div class="pp-photo" style="background-image:url('${esc(pvPhoto)}')"></div>` : ''}
        <div class="pp-veil"><div class="pp-lbl">What the recorded sales imply</div><div class="pp-range"><i></i><b></b><i></i></div>
          <svg class="pp-chart" viewBox="0 0 210 70" preserveAspectRatio="none">${bars.map((h, n) => `<rect x="${n * 30 + 4}" y="${70 - h}" width="20" height="${h}" rx="3"></rect>`).join('')}</svg>
          ${[78, 64, 71, 58].map(w => `<div class="pp-row"><i style="width:${w}%"></i><b></b></div>`).join('')}</div>
      </figure>`;
  const dPaper = `
      <figure class="pp pp-disc" aria-hidden="true">
        <div class="pp-head"><span class="pp-kind">Disclosure Review</span>${req}</div>
        <div class="pp-addr">${pvAddr}</div><div class="pp-by">${pvBy}</div>
        <div class="pp-veil"><div class="pp-score"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26"></circle><circle class="arc" cx="32" cy="32" r="26"></circle></svg>
            <div><div class="pp-lbl">Condition score</div><div class="pp-row"><i style="width:70%"></i></div></div></div>
          ${[['Safety', 'saf', 72], ['Known future', 'fut', 60], ['Elective', 'ele', 54], ['Elective', 'ele', 62]].map(r => `<div class="pp-led"><span class="pp-tag ${r[1]}">${r[0]}</span><i style="width:${r[2]}%"></i><b></b></div>`).join('')}</div>
      </figure>`;
  const inside = ['Recorded sales near this home, chosen one by one by ' + esc(aFirst) + ' \u2014 not an automated estimate',
    'The range those sales imply, beside the asking price',
    'The disclosure package read for you: a condition score and a repair budget \u2014 what to fix first, what can wait',
    'For a condo, the HOA side too: dues, reserves, special assessments and litigation'];
  const payload = { building_slug: l.building_slug || null, building_name: l.building_name || '', unit_label: l.unit || null, mls: l.mls_number || '', address: l.address_raw || '' };
  return `
<section class="lm lm--req" id="reviewed"><div class="wrap">
  <div class="lm-head">
    <span class="lm-eyebrow">For ${esc(l.address_raw || 'this home')} \u00b7 free</span>
    <h2>A Comp Report and a disclosure review, <em>before you write.</em></h2>
    <p class="lm-sub">Two documents most buyers never get to see before they make an offer \u2014 prepared by a licensed agent for this address, not generated for every listing on the internet. Ask, and ${esc(aFirst)} prepares them for this home.</p>
  </div>
  <div class="lm-stage">
    <div class="lm-vis two">${dPaper}${cmaPaper}
      <div class="pp-lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>Prepared for this home on request</div>
    </div>
    <div class="lm-side">
      <ul class="lm-inside">${inside.map(t => `<li>${t}</li>`).join('')}</ul>
      <div class="lm-gate" data-req>
        <div class="lm-gate-copy"><b>Request them, free.</b> Choose what you want and where to send it.</div>
        <div class="lm-pick"><label><input type="checkbox" data-req-cma checked> The Comp Report</label><label><input type="checkbox" data-req-disc checked> The disclosure review</label></div>
        <input type="text" class="rpt-in lm-name" data-req-name placeholder="Your name" autocomplete="name" aria-label="Your name" required>
        <div class="rpt-form lm-form">
          <input type="email" class="rpt-in" data-req-email placeholder="you@email.com" autocomplete="email" aria-label="Your email">
          <button class="rpt-btn" data-req-go data-cta="listing:request_reports">Request them \u2192</button>
        </div>
        <p class="rpt-note">No call required. The disclosure review needs the seller\u2019s package from the listing agent \u2014 if it isn\u2019t released, you\u2019ll be told.</p>
        <div class="rpt-out" data-req-out hidden></div>
      </div>
      <div class="lm-agent">
        ${aPhoto ? `<img src="${esc(aPhoto)}" alt="${esc(aName)}" width="56" height="56" loading="lazy">` : `<div class="lm-mono">${initials}</div>`}
        <div class="lm-who"><div class="lm-by">Prepared by</div><div class="lm-name">${esc(aName)}</div>${aTitle ? `<div class="lm-title">${esc(aTitle)}</div>` : ''}</div>
        ${aStats.length ? `<div class="lm-stats">${aStats.map(s => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
      </div>
    </div>
  </div>
</div></section>
<style>${LM_CSS}
.pp-req{background:rgba(232,93,42,.14)!important;color:#9a360c!important}
.lm-pick{display:flex;gap:18px;flex-wrap:wrap;margin:4px 0 12px;font-size:.92rem;color:#1a1f2e}
.lm-pick label{display:flex;align-items:center;gap:7px;cursor:pointer}
.lm-pick input{width:16px;height:16px;accent-color:#C2410C}
</style>
<script>
(function(){
  var box=document.querySelector('[data-req]'); if(!box) return;
  var P=${JSON.stringify(payload).replace(/</g, '\\u003c')};
  var input=box.querySelector('[data-req-email]'), btn=box.querySelector('[data-req-go]'), out=box.querySelector('[data-req-out]');
  btn.addEventListener('click', function(){
    var email=(input.value||'').trim(), c=box.querySelector('[data-req-cma]').checked, d=box.querySelector('[data-req-disc]').checked;
    var nmEl=box.querySelector('[data-req-name]'), name=((nmEl&&nmEl.value)||'').trim();
    if(name.length<2){ nmEl.style.borderColor='#a8431f'; nmEl.focus(); out.hidden=false; out.textContent='Please add your name.'; return; }
    if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){ input.style.borderColor='#a8431f'; return; }
    if(!c && !d){ out.hidden=false; out.textContent='Choose at least one document.'; return; }
    btn.disabled=true; btn.textContent='One moment\\u2026';
    if(window.cmTrack) try{ cmTrack('cta_click',{cta:'listing:request_reports',mls:P.mls}); }catch(e){}
    fetch('${SUPABASE_URL}/functions/v1/listing-report-request',{method:'POST',
      headers:{'apikey':'${SUPABASE_ANON_KEY}','Authorization':'Bearer ${SUPABASE_ANON_KEY}','Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({mode:'request',name:name,email:email,want_cma:c,want_disclosure:d},P))})
    .then(function(r){return r.json();}).then(function(j){
      if(j&&j.ok){
        /* What happens next (Tim, 26 Sep 2026): the Comp Report within 24 hours; the disclosures requested now. */
        var first=(name.split(' ')[0]||'').replace(/</g,'&lt;');
        box.innerHTML='<div class="lm-done"><div class="lm-done-k">Request received</div>'+
          '<p><b>Thanks'+(first?', '+first:'')+'.</b> Here is what happens next:</p>'+
          (c?'<p class="lm-done-i"><span>\u2713</span><span><b>Your Comp Report will be delivered within 24 hours</b> to '+email.replace(/</g,'&lt;')+'.</span></p>':'')+
          (d?'<p class="lm-done-i"><span>\u2713</span><span><b>The disclosure package has been requested</b> from the listing agent for review. The review follows as soon as it arrives.</span></p>':'')+
          '<p class="lm-done-n">A confirmation is in your inbox now.</p></div>';
      } else { btn.disabled=false; btn.textContent='Try again'; out.hidden=false; out.textContent='That did not go through ('+((j&&j.error)||'error')+'). Please try again.'; }
    }).catch(function(){ btn.disabled=false; btn.textContent='Try again'; out.hidden=false; out.textContent='Network hiccup \\u2014 please try again.'; });
  });
})();
</script>`;
}


/* ---------------------------------------------------------------------------
   /listing/{mls}  - the City Markets listing page, for condos (26 Sep 2026).
   Same structure as the city /for-sale/ page, with the one thing condos add:
   a condo lives IN a building, and buyers choose the condo, then the building.
   So the unit comes first, then its building - a card with the building's
   photo when it is one of ours, and the building intelligence, linking back.
   ------------------------------------------------------------------------- */
const CITY_FOOT_CACHE = {};
async function cityFooterData(domain) {
  const c = CITY_FOOT_CACHE[domain];
  if (c && Date.now() - c.t < 3600e3) return c.v;
  let v = { buildings: [], hoods: [] };
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/offmarket_page_payload', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_market_domain: domain }),
    });
    if (r.ok) { const p = await r.json(); v = { buildings: (p.buildings || []).slice(0, 12), hoods: (p.hoods || []).slice(0, 12), totals: p.totals }; }
  } catch (e) {}
  CITY_FOOT_CACHE[domain] = { t: Date.now(), v };
  return v;
}

async function listingBuildingCard(slug) {
  if (!slug) return null;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/buildings?slug=eq.' + encodeURIComponent(slug) +
      '&select=slug,display_name,canonical_address,hero_image_url,unit_count,year_built,neighborhood,map_hood,is_catalogued,published_at&limit=1', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (e) { return null; }
}

function cityMortgageCalc(price) {
  var p = Math.round(price || 1000000);
  return '<div class="mz-card" style="max-width:none"><span class="eyebrow">Estimate the monthly payment</span>'
    + '<div class="mtg-grid">'
    + '<label>Home price<input id="mtgPrice" inputmode="numeric" value="$' + p.toLocaleString() + '"></label>'
    + '<label>Down payment<input id="mtgDown" value="20%"></label>'
    + '<label>Interest rate<input id="mtgRate" value="6.5%"></label>'
    + '<label>Term<select id="mtgTerm"><option value="30">30 years</option><option value="15">15 years</option></select></label>'
    + '</div>'
    + '<div class="mtg-out"><div class="mtg-big" id="mtgPay">&mdash;</div><div class="mtg-sub" id="mtgSub">Principal &amp; interest &middot; estimate only, not a loan offer.</div></div>'
    + '</div>'
    + '<script>(function(){'
    + 'function num(v){return parseFloat((""+v).replace(/[^0-9.]/g,""))||0;}'
    + 'function fmt(x){return "$"+Math.round(x).toLocaleString();}'
    + 'function calc(){'
    + 'var price=num(document.getElementById("mtgPrice").value);'
    + 'var dpRaw=num(document.getElementById("mtgDown").value);'
    + 'var down=dpRaw<=100?price*dpRaw/100:dpRaw;'
    + 'var P=Math.max(0,price-down);'
    + 'var r=num(document.getElementById("mtgRate").value)/100/12;'
    + 'var nM=(num(document.getElementById("mtgTerm").value)||30)*12;'
    + 'var M=r>0?P*r*Math.pow(1+r,nM)/(Math.pow(1+r,nM)-1):P/nM;'
    + 'document.getElementById("mtgPay").textContent=fmt(M)+"/mo";'
    + 'document.getElementById("mtgSub").textContent="Principal & interest on "+fmt(P)+" financed \\u00b7 estimate only";'
    + '}'
    + '["mtgPrice","mtgDown","mtgRate","mtgTerm"].forEach(function(id){var e=document.getElementById(id);if(e){e.addEventListener("input",calc);e.addEventListener("change",calc);}});'
    + 'calc();})();</script>';
}

/* Switched OFF 29 Sep 2026. Supabase bills every stored photo it resizes ($5 per 1,000 origin
   images after 100 a month): the listing strips sent 3,443 over the allowance in their first
   day. Photos are served as stored until thumbnails are made once, at rehost time, or by
   Cloudflare image resizing. Keep the call sites; only this function decides. */
function cmThumbUrl(u, w, h) {
  return u;
}

function renderListingCity(d, B, foot, reportsHtml) {
  const E = cityEsc;
  const money = (n) => (n == null ? '' : '$' + Math.round(n).toLocaleString('en-US'));
  const short = (n) => { if (n == null) return ''; if (n >= 1e6) return '$' + (n / 1e6).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'M'; return '$' + Math.round(n / 1000) + 'K'; };
  const num = (n) => Number(n).toLocaleString('en-US');
  const domain = 'sanfranciscocondomarket.com', region = 'San Francisco';
  const mls = String(d.mls || '');
  const price = d.price != null ? Number(d.price) : null;
  const beds = d.beds != null && d.beds !== '' ? Number(d.beds) : null;
  const baths = d.baths != null && d.baths !== '' ? Number(d.baths) : null;
  const sqft = d.sqft != null && d.sqft !== '' ? Number(d.sqft) : null;
  const ppsf = price != null && sqft ? Math.round(price / sqft) : null;
  const unit = d.unit ? String(d.unit) : '';
  const addr = String(d.address || '');
  const hood = d.neighborhood || (B && (B.map_hood || B.neighborhood)) || '';
  const bSlug = d.building_slug || '';
  const bName = d.building_name || (B && B.display_name) || '';
  const bOurs = !!(B && B.is_catalogued && B.published_at);
  const bUrl = bSlug ? '/building/' + bSlug + '/' : '';
  const year = d.year_built || (B && B.year_built) || null;
  const st = d.building_stats || {};
  const photos = Array.isArray(d.photos) ? d.photos.map((p) => p && p.url).filter(Boolean) : [];
  const fullAddr = addr + (addr.indexOf(region) === -1 ? ', ' + region + ', CA' + (d.zip ? ' ' + d.zip : '') : '');
  const spec = [beds != null ? beds + ' bd' : '', baths != null ? baths + ' ba' : '', sqft ? num(sqft) + ' sf' : '', year ? 'built ' + year : ''].filter(Boolean).join(' &middot; ');
  const title = addr + (unit && addr.indexOf('#') === -1 ? ' #' + unit : '') + ' — Condo For Sale' + (bName ? ' in ' + bName : '') + ' | Condo Market SF';
  const desc = addr + ' is for sale' + (price != null ? ' at ' + money(price) : '') + (beds != null ? ' — ' + beds + ' bed' : '') + (baths != null ? ', ' + baths + ' bath' : '') +
    (sqft ? ', ' + num(sqft) + ' sq ft' : '') + (bName ? ' in ' + bName : '') + (hood ? ', ' + hood : '') + ', San Francisco. Every recorded sale in the building, free.';
  const canonical = 'https://www.' + domain + '/listing/' + encodeURIComponent(mls);
  const lat = d.lat != null ? Number(d.lat) : null, lng = d.lng != null ? Number(d.lng) : null;

  const gallery =
    '<div class="ld-gallery"><div class="ld-main" id="ldMain" title="' + (photos.length > 1 ? 'Click for next photo' : '') + '">' +
    (photos.length ? '<img id="ldImg" src="' + E(photos[0]) + '" alt="' + E(addr) + '" onerror="this.remove()">'
      : (bOurs && B.hero_image_url ? '<img id="ldImg" src="' + E(B.hero_image_url) + '" alt="' + E(bName) + '" onerror="this.remove()"><span class="ld-bphoto">The building &middot; ' + E(bName) + '</span>'
        : '<div class="ld-nophoto">Photos coming soon</div>')) +
    (price != null ? '<span class="price-chip"><span class="dot"></span>' + short(price) + '</span>' : '') +
    (photos.length > 1 ? '<span class="ld-count" id="ldCount">1 / ' + photos.length + '</span>' +
      '<button type="button" class="ld-nav ld-prev" id="ldPrev" aria-label="Previous photo">&#8249;</button>' +
      '<button type="button" class="ld-nav ld-next" id="ldNext" aria-label="Next photo">&#8250;</button>' : '') +
    '</div></div>' +
    /* Thumbnails are the storage service's resized copy (~7 KB, not ~200 KB): twenty full-size photos
       requested at once is what left some thumbnails as bare labels. A failed thumb retries twice,
       then falls back to the full photo, then to a plain tile - never a broken image or its label. */
    (photos.length > 1 ? '<div class="ld-thumbs">' + photos.map((u, i) =>
      '<button type="button" class="' + (i === 0 ? 'on' : '') + '" aria-label="Photo ' + (i + 1) + '"><img loading="lazy" src="' + E(cmThumbUrl(u, 240, 160)) + '" data-full="' + E(u) + '" alt="" onerror="cmThumbRetry(this)"></button>').join('') + '</div>' +
      '<script>function cmThumbRetry(im){var n=+(im.getAttribute("data-try")||0)+1;im.setAttribute("data-try",n);' +
      'if(n<=2){setTimeout(function(){var u=im.src.replace(/([?&])r=\\d+/,"");im.src=u+(u.indexOf("?")<0?"?":"&")+"r="+n;},700*n);return;}' +
      'if(n===3&&im.getAttribute("data-full")){im.src=im.getAttribute("data-full");return;}' +
      'im.onerror=null;im.style.visibility="hidden";if(im.parentNode)im.parentNode.style.background="#e0e5ed";}</script>' : '');

  const head =
    '<div class="ld-head"><div>' +
    '<div class="ld-price">' + (price != null ? short(price) : 'Price on request') + '</div>' +
    '<div class="ld-addr">' + E(fullAddr) + '</div>' +
    '<div class="ld-sub">' + spec + (bName ? ' &middot; in <a href="' + bUrl + '">' + E(bName) + '</a>' : '') + '</div>' +
    '</div><div class="ld-head-cta">' +
    '<button type="button" class="btn btn-gold" data-cm-offer-trigger data-building-slug="' + E(bSlug) + '" data-unit-label="' + E(unit) + '" data-suggested-price="' + (price != null ? price : '') + '" data-cta="listing:offer">Make an offer &rarr;</button>' +
    '<a class="btn btn-line" href="#tour">Tour this home</a>' +
    '</div></div>';

  const specs = [];
  if (beds != null) specs.push([String(beds), 'Beds']);
  if (baths != null) specs.push([String(baths), 'Baths']);
  if (sqft) specs.push([num(sqft), 'Sq Ft']);
  if (unit) specs.push([E(unit), 'Unit']);
  if (year) specs.push([String(year), 'Built']);
  if (ppsf) specs.push([money(ppsf), 'Per Sq Ft']);
  const specband = specs.length ? '<div class="ld-specband">' + specs.map((s) => '<div><div class="sv">' + s[0] + '</div><div class="sl">' + s[1] + '</div></div>').join('') + '</div>' : '';

  /* THE BUILDING: the second thing a condo buyer weighs. The photo shows only for a
     building of ours; the intelligence shows whenever the listing sits in a building. */
  let building = '';
  if (bSlug) {
    const tiles = [];
    if (st.sold_12mo != null) tiles.push([num(st.sold_12mo), 'Sales, last 12 mo']);
    if (st.median_psf_12mo) tiles.push([money(st.median_psf_12mo), 'Median $/sq ft']);
    if (st.median_price_12mo) tiles.push([money(st.median_price_12mo), 'Median sale price']);
    const vs = (ppsf && st.median_psf_12mo) ? Math.round((ppsf / st.median_psf_12mo - 1) * 100) : null;
    building =
      '<section class="pg ld-bsec" id="building"><div class="wrap">' +
      '<div class="section-head"><span class="eyebrow">The building</span>' +
      '<h2>' + E(bName) + ' <em>by the numbers.</em></h2>' +
      '<p class="sub">A condo is bought twice: the unit, then the building it sits in. Here is the building behind this listing &mdash; its recorded sales, and what units in it trade for.</p></div>' +
      '<a class="bcard' + (bOurs && B.hero_image_url ? '' : ' bcard--noimg') + '" href="' + bUrl + '" data-cta="listing:building_card">' +
      (bOurs && B.hero_image_url ? '<div class="bcard-img"><img src="' + E(B.hero_image_url) + '" alt="' + E(bName) + ', San Francisco" loading="lazy" onerror="this.parentNode.remove()"></div>' : '') +
      '<div class="bcard-bd">' +
      '<span class="bcard-k">' + (hood ? E(hood) + ' &middot; ' : '') + 'San Francisco</span>' +
      '<div class="bcard-name">' + E(bName) + '</div>' +
      '<div class="bcard-meta">' + [B && B.unit_count ? num(B.unit_count) + ' homes' : '', (B && B.year_built) || year ? 'built ' + ((B && B.year_built) || year) : '', B && B.canonical_address && B.canonical_address !== bName ? E(B.canonical_address) : ''].filter(Boolean).join(' &middot; ') + '</div>' +
      (tiles.length ? '<div class="bcard-stats">' + tiles.map((t) => '<div><div class="sv">' + t[0] + '</div><div class="sl">' + t[1] + '</div></div>').join('') + '</div>' : '') +
      (vs != null ? '<p class="bcard-vs">This unit is asking <b>' + money(ppsf) + '/sq ft</b> &mdash; ' + (vs === 0 ? 'in line with' : Math.abs(vs) + '% ' + (vs > 0 ? 'above' : 'below')) + ' the building&rsquo;s median over the last twelve months (' + num(st.sold_12mo || 0) + ' sale' + (st.sold_12mo === 1 ? '' : 's') + ').</p>' : '') +
      '<span class="bcard-go">See all sales &amp; trends at ' + E(bName) + ' &rarr;</span>' +
      '</div></a>' +
      '</div></section>';
  }

  const map = (lat != null && lng != null)
    ? '<section class="pg" style="padding-top:0"><div class="wrap"><div id="ldMap" style="height:340px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#eef1f6"></div>' +
      '<p class="map-note">' + (bName ? 'The pin is ' + E(bName) + '. ' : '') + 'Location from public records. Not a survey, and not a representation of boundaries.</p></div></section>'
    : '';

  const remarkText = d.listing_description || '';
  const remark = remarkText ? '<div class="ld-remarks">&ldquo;' + E(remarkText.slice(0, 320)) + (remarkText.length > 320 ? '&hellip;' : '') + '&rdquo;<span class="src">Listing remarks (excerpt) &middot; via the MLS</span></div>' : '';
  const ctx = [];
  if (bSlug) ctx.push('<div class="tile"><div class="eyebrow" style="margin-bottom:6px">The building</div><h3 style="font-size:1.05rem;margin-bottom:6px"><a href="' + bUrl + '" style="color:var(--ivory)">' + E(bName) + ' &rarr;</a></h3><p style="font-size:.85rem;color:var(--slate)">Every recorded sale, price per foot against the neighborhood, and the HOA figures.</p></div>');
  if (hood) ctx.push('<div class="tile"><div class="eyebrow" style="margin-bottom:6px">The neighborhood</div><h3 style="font-size:1.05rem;margin-bottom:6px"><a href="/neighborhood/' + citySlug(hood) + '/" style="color:var(--ivory)">' + E(hood) + ' &rarr;</a></h3><p style="font-size:.85rem;color:var(--slate)">Every condo building in ' + E(hood) + ', with recorded sales and prices per foot.</p></div>');
  const context = '<section class="pg" style="padding-top:0"><div class="wrap">' + remark +
    (ctx.length ? '<div class="ld-context">' + ctx.join('') + '</div>' : '') +
    '<p class="map-note">Listing data deemed reliable but not guaranteed. Buyers should verify all information independently. The listing agent and brokerage of record represent the seller; Condo Market SF is not the listing brokerage unless stated. MLS# ' + E(mls) + '.</p>' +
    '</div></section>';

  const ICO_DOC = "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='9' y1='13' x2='15' y2='13'/><line x1='9' y1='17' x2='15' y2='17'/></svg>";
  const ICO_CHART = "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='20' x2='18' y2='10'/><line x1='12' y1='20' x2='12' y2='4'/><line x1='6' y1='20' x2='6' y2='14'/></svg>";
  const card = (ico, t, lead, list, label, href, cta) => '<div class="feat-card"><div class="feat-ico">' + ico + '</div><h3>' + t + '</h3><p>' + lead + '</p><ul class="feat-list">' +
    list.map((li) => '<li>' + li + '</li>').join('') + '</ul><a class="btn btn-gold" href="' + href + '" data-cta="' + cta + '">' + label + ' &rarr;</a></div>';
  const app = 'https://app.' + domain;
  const edge = '<section class="pg"><div class="wrap"><div class="section-head"><span class="eyebrow">Before you make an offer</span>' +
    '<h2>Get the edge <em>before you write.</em></h2><p class="sub">Two free tools that tell you what this home is really worth &mdash; and what the disclosures actually say.</p></div>' +
    '<div class="feat-grid">' +
    card(ICO_DOC, 'Disclosure review from Tim', 'Send Tim this listing and get a personal read within 24 hours &mdash; the fine print that matters, before you write.',
      ['A plain-English cheat sheet: HOA dues, reserves, special assessments, litigation', 'A detailed Comp Report &mdash; what it&rsquo;s really worth vs. the asking price', 'What a compelling, winning offer looks like here'],
      'Request a disclosure review', app + '/tools/review', 'listing:request_review') +
    card(ICO_CHART, 'Build your own Comp Report', 'Price it like an agent. Pull this home and the real comps around it for an instant value range &mdash; in two minutes.',
      ['Search every recent San Francisco condo sale as a comp', 'An instant $/sf value range against the asking price', 'Free &mdash; save it, and Tim can sanity-check your number'],
      'Build a Comp Report', app + '/tools/cma', 'listing:build_cma') +
    '</div></div></section>';

  const mortgage = price != null ? '<section class="pg"><div class="wrap"><div class="section-head"><span class="eyebrow">Run the numbers</span>' +
    '<h2>What would this cost <em>per month?</em></h2><p class="sub">A quick estimate on this home&rsquo;s asking price. Adjust the down payment, rate, and term to see your payment move. HOA dues are extra.</p></div>' +
    cityMortgageCalc(price) + '</div></section>' : '';

  /* Touring: the same two routes as the building page's "Talk it through with Tim" card - the
     booking calendar, or an email that records a tour_request lead with this listing's context. */
  const CAL_URL = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ3Ro-mJuYsbPWaLPZXUTo6gEa9qxdTVMpdX1E88E529PAUTuDC2CXdwNgjQrDsOJGo8IZRD8og5?gv=true';
  const tour = '<section class="pg" id="tour"><div class="wrap"><div class="section-head"><span class="eyebrow">Book time with Tim</span>' +
    '<h2>Tour it, or talk it <em>through.</em></h2><p class="sub">A private showing, a second opinion on the price, or a walk through the building&rsquo;s HOA documents.</p></div>' +
    '<div class="mz-card" style="max-width:none;padding:26px 24px;text-align:center">' +
    '<button type="button" class="btn btn-gold" id="ldCalOpen" style="display:inline-block;padding:15px 34px;font-size:1.02rem" data-cta="listing:book_showing">Book a time &rarr;</button>' +
    '<form id="ldTourForm" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:16px auto 0;max-width:460px">' +
    '<input type="email" required placeholder="&hellip;or leave your email" aria-label="Your email" style="flex:1 1 220px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;font:inherit;background:#fff;color:var(--ink)">' +
    '<button type="submit" class="btn btn-line" style="padding:12px 20px">Request a showing</button></form>' +
    '<p id="ldTourDone" hidden style="margin:12px 0 0;color:#2f6b40;font-weight:600">&#10003; Thanks &mdash; Tim will be in touch about a showing.</p>' +
    '<p style="font-size:.86rem;color:var(--slate);margin:14px auto 0;max-width:46ch;line-height:1.5">Every offer is personally reviewed by Tim before drafting. A valid offer needs lender pre-approval and proof of funds, uploaded securely during the offer flow.</p>' +
    '<div id="ldCalWrap" hidden style="margin-top:18px"><iframe data-src="' + CAL_URL + '" style="border:0;width:100%;height:620px;border-radius:12px;background:#fff" title="Schedule with Tim"></iframe></div>' +
    '</div></div></section>' +
    '<script>(function(){var co=document.getElementById("ldCalOpen"),w=document.getElementById("ldCalWrap");' +
    'if(co&&w)co.addEventListener("click",function(){var f=w.querySelector("iframe");if(f&&!f.src)f.src=f.getAttribute("data-src");w.hidden=false;w.scrollIntoView({behavior:"smooth",block:"center"});});' +
    'var fm=document.getElementById("ldTourForm");if(!fm)return;fm.addEventListener("submit",function(e){e.preventDefault();' +
    'var em=fm.querySelector("input").value.trim(),bt=fm.querySelector("button");if(!em)return;bt.disabled=true;bt.textContent="Sending\u2026";' +
    'var AK="' + SUPABASE_ANON_KEY + '";' +
    'fetch("' + SUPABASE_URL + '/rest/v1/rpc/capture_lead",{method:"POST",headers:{"Content-Type":"application/json","apikey":AK,"Authorization":"Bearer "+AK},' +
    'body:JSON.stringify({p_email:em,p_building_slug:' + JSON.stringify(bSlug || null) + ',p_intent:"tour_request",p_source:"listing_tour_form",' +
    'p_unit_label:' + JSON.stringify(unit || null) + ',p_message:' + JSON.stringify('Showing request for ' + addr + ' (MLS# ' + mls + ')').replace(/</g, '\\u003c') + '})})' +
    '.then(function(r){if(r.ok){fm.hidden=true;document.getElementById("ldTourDone").hidden=false;}else{bt.disabled=false;bt.textContent="Try again";}})' +
    '.catch(function(){bt.disabled=false;bt.textContent="Try again";});});})();</script>';

  const exit = '<section class="pg" style="padding-top:0"><div class="wrap"><div class="tile" style="padding:20px 22px"><div class="eyebrow" style="margin-bottom:6px">The market</div>' +
    '<h3 style="font-size:1.1rem;margin-bottom:6px"><a href="/active-listings/" style="color:var(--ivory)">All San Francisco condos for sale &rarr;</a></h3>' +
    '<p style="font-size:.86rem;color:var(--slate)">Every condo on the market in San Francisco, and <a href="/off-market/">the off-market prices</a> owners have named.</p></div></div></section>';

  const jsonLd = { '@context': 'https://schema.org', '@type': 'RealEstateListing', name: addr, url: canonical,
    description: d.descriptor || undefined,
    address: { '@type': 'PostalAddress', streetAddress: addr, addressLocality: 'San Francisco', postalCode: d.zip || undefined, addressRegion: 'CA', addressCountry: 'US' },
    geo: lat != null && lng != null ? { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } : undefined,
    offers: price != null ? { '@type': 'Offer', price: price, priceCurrency: 'USD', availability: 'https://schema.org/InStock' } : undefined };

  const css = '<style>' +
    '.ld-main{position:relative}.ld-main img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.ld-count{position:absolute;right:14px;bottom:14px;background:rgba(18,21,29,.72);color:#ece7db;font:500 .72rem "JetBrains Mono",monospace;padding:5px 10px;border-radius:999px}' +
    '.ld-bphoto{position:absolute;left:14px;top:14px;background:rgba(18,21,29,.72);color:#ece7db;font:500 .68rem "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;padding:6px 11px;border-radius:999px}' +
    '.ld-sub a{color:var(--apricot);text-decoration:none;border-bottom:1px solid rgba(194,65,12,.35)}' +
    '.bcard{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 1px 2px rgba(26,31,46,.04),0 14px 36px rgba(26,31,46,.07);transition:transform .2s,box-shadow .2s}' +
    '.bcard:hover{transform:translateY(-2px);box-shadow:0 2px 4px rgba(26,31,46,.05),0 20px 44px rgba(26,31,46,.10)}' +
    '.bcard--noimg{grid-template-columns:1fr}' +
    '.bcard-img{position:relative;min-height:300px;background:#eef1f6}.bcard-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}' +
    '.bcard-bd{padding:30px 32px;display:flex;flex-direction:column;gap:10px}' +
    '.bcard-k{font-family:"JetBrains Mono",monospace;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--apricot)}' +
    '.bcard-name{font-family:"Playfair Display",Georgia,serif;font-size:clamp(1.7rem,3vw,2.3rem);line-height:1.1;color:var(--ink)}' +
    '.bcard-meta{color:var(--slate);font-size:.92rem}' +
    '.bcard-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:10px 0 4px}' +
    '.bcard-stats>div{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px 12px;text-align:center}' +
    '.bcard-stats .sv{font-family:"Playfair Display",Georgia,serif;font-size:1.45rem;color:var(--ink)}' +
    '.bcard-stats .sl{font-size:.74rem;color:var(--slate);margin-top:2px}' +
    '.bcard-vs{font-size:.9rem;color:var(--ink-dim,#4c5261);line-height:1.55;margin:4px 0 0}' +
    '.bcard-go{margin-top:auto;color:var(--apricot);font-weight:600;font-size:.95rem}' +
    '@media(max-width:760px){.bcard{grid-template-columns:1fr}.bcard-img{min-height:220px}.bcard-bd{padding:24px 22px}.bcard-stats .sv{font-size:1.2rem}}' +
    '</style>';

  const script = (lat != null && lng != null ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>' +
    '<script>(function(){var el=document.getElementById("ldMap");if(!el||!window.L)return;' +
    'var m=L.map(el,{scrollWheelZoom:false}).setView([' + lat + ',' + lng + '],16);' +
    'var k=(document.querySelector(\'meta[name="carto-key"]\')||{}).content||"";' +
    'L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"+(k&&k.indexOf("__")!==0?"?key="+encodeURIComponent(k):""),{attribution:"&copy; OpenStreetMap &copy; CARTO",subdomains:"abcd",maxZoom:19}).addTo(m);' +
    'L.circleMarker([' + lat + ',' + lng + '],{radius:10,color:"#9a3412",weight:2,fillColor:"#C2410C",fillOpacity:.9}).addTo(m)' + (bName ? '.bindTooltip(' + JSON.stringify(bName).replace(/</g, '\\u003c') + ',{permanent:false})' : '') + ';})();</script>' : '') +
    (photos.length > 1 ? '<script>(function(){var photos=' + JSON.stringify(photos).replace(/</g, '\\u003c') + ';' +
      'var main=document.getElementById("ldImg"),thumbs=document.querySelectorAll(".ld-thumbs button"),idx=0;' +
      'function show(i){if(!photos.length||!main)return;idx=(i+photos.length)%photos.length;main.src=photos[idx];' +
      'var c=document.getElementById("ldCount");if(c)c.textContent=(idx+1)+" / "+photos.length;' +
      'thumbs.forEach(function(b,bi){b.classList.toggle("on",bi===idx);});' +
      'var strip=document.querySelector(".ld-thumbs"),t=thumbs[idx];if(strip&&t)strip.scrollTo({left:t.offsetLeft-strip.clientWidth/2+t.clientWidth/2,behavior:"smooth"});}' +
      'thumbs.forEach(function(b,bi){b.addEventListener("click",function(){show(bi);});});' +
      'var mw=document.getElementById("ldMain");if(mw){mw.style.cursor="pointer";mw.addEventListener("click",function(){show(idx+1);});}' +
      'var pv=document.getElementById("ldPrev"),nx=document.getElementById("ldNext");' +
      'if(pv)pv.addEventListener("click",function(e){e.stopPropagation();show(idx-1);});' +
      'if(nx)nx.addEventListener("click",function(e){e.stopPropagation();show(idx+1);});' +
      'var sx=null;if(mw){mw.addEventListener("touchstart",function(e){sx=e.touches[0].clientX;},{passive:true});' +
      'mw.addEventListener("touchend",function(e){if(sx==null)return;var dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>40){e.preventDefault();show(idx+(dx<0?1:-1));}});}' +
      'document.addEventListener("keydown",function(e){if(e.target&&/input|select|textarea/i.test(e.target.tagName))return;if(e.key==="ArrowLeft")show(idx-1);if(e.key==="ArrowRight")show(idx+1);});' +
      '})();</script>' : '') +
    '<script type="module" src="/assets/cm-offer-modal.js"></script>\n' +
    '<script type="application/ld+json">' + JSON.stringify(jsonLd).replace(/</g, '\\u003c') + '</script>\n';

  const body =
    '<header class="page-hero" style="padding-bottom:26px"><div class="wrap">' +
    '<div class="crumbs"><a href="/">Condo Market SF</a> / <a href="/active-listings/">For sale</a>' + (bName ? ' / <a href="' + bUrl + '">' + E(bName) + '</a>' : '') + '</div>' +
    '<span class="eyebrow"><span class="live-dot"></span>Active listing &middot; MLS# ' + E(mls) + ' &middot; Condo' + (unit ? ' &middot; Unit ' + E(unit) : '') + '</span>' +
    '</div></header>' +
    '<section class="pg" style="padding-top:6px"><div class="wrap">' + gallery + head + specband + '</div></section>' +
    building + (reportsHtml || '') + map + context + edge + mortgage + tour + exit;

  const leaflet = (lat != null && lng != null) ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">\n' : '';
  const ogImg = photos[0] || (bOurs && B.hero_image_url) || '';
  return cityHead(title, desc, canonical, leaflet + css + (ogImg ? '<meta property="og:image" content="' + E(ogImg) + '">\n' : '')) +
    cityNav('forsale') + body + cityFooter(foot || {}) + cityTail(script);
}

/* ACTIVE LISTINGS - the City Markets page (campbell-market renderActiveListings), ported
   26 Sep 2026. Fed the condo platform's own active listings inline (every card has a live
   /listing/ page); each card names the building the unit is in. Recently sold reads the
   condo recorded sales (sold_listings_map_condo) and links to the building. */
function renderActiveListingsCity(M, AL, foot) {
  const mktDerived = () => ({ homes: M.homes });
  const title = `Homes For Sale in ${M.city}, CA ${M.zipsLabel} — Live | ${M.name}`;
  const desc = `Every home for sale in ${M.city}, CA ${M.zipsLabel} right now — available and pending, live from the MLS, refreshed twice daily, filterable by status, type, price, and bedrooms, each linked to its full home record.`;
  const clientJs = `
(function(){
  var SB='https://qinuukntpyulqjzndnho.supabase.co';
  var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
  function num(n){return n==null?'':Number(n).toLocaleString('en-US');}
  function money(n){if(n==null)return '';if(n>=1e6){var s=(n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'');return '$'+s+'M';}return '$'+Math.round(n/1000)+'K';}
  function photoOf(l,size){
    return l.rehosted_url||null;
  }
  var ALL=[], RV={}, MAP=null, LAYER=null, SOLDLAYER=null, PINS={}, ACTIVE=null;
  var SOLD=[], SOLDON=false, SOLDMO=3;
  /* Bounds filtering. FITTING guards the programmatic fitBounds so it cannot
     trigger a moveend, re-filter, re-fit loop. */
  var BOUNDS=null, FITTING=false, FITTED=false;
  var F={type:'all',price:'all',beds:'all',stage:'all',minP:null,maxP:null,
         minSf:null,maxSf:null,minYr:null,maxYr:null,maxHoa:null,
         reviewedOnly:false,withPhotos:false,noPending:false};
  var SORT='reviewed_price';
  function isPend(l){ return l.status==='Pending'; }
  // Days in contract is a fact about the listing, not an opinion about it.
  function pendDays(l){
    if(!l.pending_since) return null;
    var d=Math.round((Date.now()-Date.parse(l.pending_since+'T00:00:00Z'))/86400000);
    return (d>=0&&d<400)?d:null;
  }
  function specsOf(l){
    var s=[];
    if(l.beds)s.push(l.beds+' bd');
    if(l.baths)s.push(l.baths+' ba');
    if(l.sqft)s.push(num(l.sqft)+' sf');
    if(l.year_built)s.push('built '+l.year_built);
    if(l.price&&l.sqft)s.push('$'+num(Math.round(l.price/l.sqft))+'/sf');
    return s.join(' \u00b7 ');
  }
  /* Two bubbles, one per report actually published: a Comp Report is never labelled
     a disclosure review. Either one lifts the home to the top of the list. */
  function rvBadges(rv){
    if(!rv) return '';
    return '<span class="rv-stack">'+(rv.cma?'<span class="rv-badge rv-cma">\u2713 Comp Report</span>':'')+
      (rv.sheet?'<span class="rv-badge">\u2713 Disclosures reviewed</span>':'')+'</span>';
  }
  function rvCta(rv){
    return rv.cma&&rv.sheet ? 'Get the free Comp Report + disclosure review' : (rv.cma ? 'Get the free Comp Report' : 'Get the free disclosure review');
  }
  function cardHtml(l,i){
    var img=photoOf(l,'640x400');
    var rv=RV[l.mls_number];
    var pend=isPend(l), pd=pend?pendDays(l):null;
    var domTxt = (l.dom==null) ? '' :
      (l.dom<=1 ? 'New today' : (l.dom<=7 ? l.dom+' days on market' : l.dom+' days on market'));
    var domBadge = (pend || !domTxt) ? ''
      : ('<span class="al-dom'+(l.dom<=7?' fresh':'')+'">'+domTxt+'</span>');
    var inner='<div class="ph al-cardphoto">'+domBadge+(img?('<img loading="lazy" onerror="this.parentNode.querySelector(\\'.price-chip\\')&&0;this.remove()" src="'+img+'" alt="'+l.address_raw+', ${M.city} CA">'):'')+
      '<span class="price-chip'+(pend?' pending':'')+'"><span class="dot"></span>'+money(l.price)+'</span>'+
      (pend?('<span class="pend-badge">Pending'+(pd!=null?(' \u00b7 '+pd+'d'):'')+'</span>'):'')+
      rvBadges(rv)+'</div>'+
      '<div class="bd"><div class="ad">'+l.address_raw+'</div>'+(l.building?'<div class="al-bldg">in '+l.building+'</div>':'')+
      '<div class="sp">'+specsOf(l)+(pend?(' \u00b7 in contract'+(pd!=null?(' '+pd+'d'):'')):'')+'</div>'+
      (rv?'<div class="tr rv-cta" data-cta="grid:reviewed_card">'+rvCta(rv)+' \u2192</div>':'<div class="tr">View listing \u2192</div>')+'</div>';
    var href='/listing/'+l.mls_number+''+(rv?'#reviewed':'');
    return '<a data-mls="'+l.mls_number+'" class="listing-card'+(rv?' listing-card--rv':'')+(pend?' listing-card--pend':'')+'" style="animation-delay:'+Math.min(i*60,420)+'ms" href="'+href+'">'+inner+'</a>';
  }
  function spotlightHtml(l){
    var img=photoOf(l,'900x600');
    var rv=RV[l.mls_number];
    return '<a class="al-spot'+(rv?' listing-card--rv':'')+'" href="/listing/'+l.mls_number+''+(rv?'#reviewed':'')+'">'+
      '<div class="ph">'+(img?('<img src="'+img+'" alt="'+l.address_raw+', ${M.city} CA">'):'')+
      rvBadges(rv)+'</div>'+
      '<div class="bd"><div class="fk">\u25cf Featured \u00b7 highest ask in ${M.city}</div>'+
      '<div class="pr">'+money(l.price)+'</div>'+
      '<div class="ad">'+l.address_raw+', ${M.city}</div>'+
      '<div class="sp">'+specsOf(l)+'</div>'+
      '<div class="ctas"><span class="btn btn-gold">View listing \u2192</span>'+
      (rv?'<span class="btn rv-btn">'+rvCta(rv).replace('Get the free','Free')+' \u2192</span>':'')+'</div>'+
      '</div></a>';
  }
  function current(){
    var rows=ALL.filter(function(l){
      if(F.type!=='all'){
        var t=(l.prop_type||'').toLowerCase();
        if(F.type==='house'   && t.indexOf('single')<0) return false;
        if(F.type==='condo'   && t.indexOf('condo')<0) return false;
        if(F.type==='town'    && t.indexOf('town')<0) return false;
        if(F.type==='multi'   && t.indexOf('multi')<0) return false;
      }
      if(F.stage==='available' && isPend(l)) return false;
      if(F.stage==='pending'  && !isPend(l)) return false;
      if(F.noPending && isPend(l)) return false;
      if(F.beds!=='all' && (l.beds||0) < Number(F.beds)) return false;
      if(F.minP!=null && (l.price||0) < F.minP) return false;
      if(F.maxP!=null && (l.price||0) > F.maxP) return false;
      if(F.minSf!=null && (l.sqft||0) < F.minSf) return false;
      if(F.maxSf!=null && (l.sqft||0) > F.maxSf) return false;
      if(F.minYr!=null && (l.year_built||0) < F.minYr) return false;
      if(F.maxYr!=null && (l.year_built||0) > F.maxYr) return false;
      if(F.reviewedOnly && !(l.reviewed||l.has_cma)) return false;
      if(F.withPhotos && !(l.photos>0||l.rehosted_url)) return false;
      return true;
    });
    /* Only what is on the map, the way every search map behaves. Listings with
       no coordinates cannot be in view and are excluded while a viewport is
       set — the count line says how many those are. */
    if(BOUNDS){
      rows = rows.filter(function(l){
        return l.lat!=null && l.lng!=null && BOUNDS.contains([l.lat,l.lng]);
      });
    }
    rows.sort(function(a,b){
      /* Default: disclosures reviewed first, then price high to low. The
         reviewed ones are the whole point of the platform, so they lead. */
      if(SORT==='reviewed_price'){
        /* both reports lead, then either one, then price */
        var ar=(a.reviewed?1:0)+(a.has_cma?1:0), br=(b.reviewed?1:0)+(b.has_cma?1:0);
        if(ar!==br) return br-ar;
        return (b.price||0)-(a.price||0);
      }
      if(SORT==='price_asc')  return (a.price||0)-(b.price||0);
      if(SORT==='price_desc') return (b.price||0)-(a.price||0);
      if(SORT==='dom_asc')    return (a.dom||0)-(b.dom||0);
      if(SORT==='dom_desc')   return (b.dom||0)-(a.dom||0);
      if(SORT==='sqft_desc')  return (b.sqft||0)-(a.sqft||0);
      if(SORT==='ppsf_desc')  return ((b.price&&b.sqft)?b.price/b.sqft:0)-((a.price&&a.sqft)?a.price/a.sqft:0);
      if(SORT==='ppsf_asc')   return ((a.price&&a.sqft)?a.price/a.sqft:1e9)-((b.price&&b.sqft)?b.price/b.sqft:1e9);
      return (b.price||0)-(a.price||0);
    });
    return rows;
  }

  /* ---------- map ---------- */
  function pinLabel(l){
    if(l.price==null) return '\u2014';
    if(l.price>=1e6){var v=(l.price/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'');return '$'+v+'M';}
    return '$'+Math.round(l.price/1000)+'K';
  }
  function ensureMap(cb){
    if(window.L&&window.L.map){cb();return;}
    if(!document.querySelector('link[href*="leaflet.min.css"]')){
      var lk=document.createElement('link');lk.rel='stylesheet';
      lk.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(lk);
    }
    var sc=document.createElement('script');
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    sc.onload=cb;document.head.appendChild(sc);
  }
  function drawMap(rows){
    var el=document.getElementById('alMap'); if(!el) return;
    ensureMap(function(){
      if(!MAP){
        MAP=window.L.map(el,{zoomControl:true,scrollWheelZoom:true,preferCanvas:false})
              .setView([${M.center[0]},${M.center[1]}],13.2);
        window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=__CARTO_KEY__',
          {maxZoom:19,attribution:'\u00a9 OpenStreetMap \u00a9 CARTO'}).addTo(MAP);
        /* Pan or zoom re-filters the feed. Guarded so our own fitBounds does
           not bounce it. */
        MAP.on('moveend zoomend', function(){
          if(FITTING) return;
          BOUNDS = MAP.getBounds();
          render();
        });
      }
      if(LAYER) MAP.removeLayer(LAYER);
      LAYER=window.L.layerGroup().addTo(MAP); PINS={};
      var pts=[];
      rows.forEach(function(l){
        if(l.lat==null||l.lng==null) return;
        var cls='al-pin'+(l.reviewed||l.has_cma?' rv':'')+(isPend(l)?' pend':'');
        var mk=window.L.marker([l.lat,l.lng],{icon:window.L.divIcon({
          className:'al-pinwrap', html:'<span class="'+cls+'">'+pinLabel(l)+'</span>',
          iconSize:null, iconAnchor:[26,13]})});
        mk.on('click',function(){ focusCard(l.mls_number); });
        mk.addTo(LAYER); PINS[l.mls_number]=mk; pts.push([l.lat,l.lng]);
      });
      /* Fit to what is actually shown, so filtering re-frames the map. */
      if(pts.length && !FITTED){
        FITTING=true; FITTED=true;
        MAP.fitBounds(pts,{padding:[38,38],maxZoom:16});
        setTimeout(function(){ FITTING=false; BOUNDS=MAP.getBounds(); render(); }, 260);
      }
      if(SOLDON) drawSold();
      var miss=rows.length-pts.length;
      var nm=document.getElementById('alNoMap');
      if(nm) nm.textContent = miss ? (miss+' of '+rows.length+' not on the map \u00b7 no coordinates on record') : '';
    });
  }
  function focusCard(mls){
    var card=document.querySelector('[data-mls="'+mls+'"]');
    if(card){ card.scrollIntoView({behavior:'smooth',block:'center'});
      card.style.outline='2px solid var(--apricot)';
      setTimeout(function(){card.style.outline='';},1600); }
    highlight(mls);
  }
  function highlight(mls){
    if(ACTIVE&&PINS[ACTIVE]){var p=PINS[ACTIVE].getElement();if(p){var q=p.querySelector('.al-pin');if(q)q.classList.remove('on');}}
    ACTIVE=mls;
    if(PINS[mls]){var e=PINS[mls].getElement();if(e){var t=e.querySelector('.al-pin');if(t)t.classList.add('on');}}
  }


  /* If a listing is live on the Exchange, show it blurred rather than a bare
     CTA — a real property beats a promise. If none is, the CTA stands alone
     and claims nothing that is not there. */
  (function(){
    var slot=document.getElementById('alIxSlot'); if(!slot) return;
    fetch(SB+'/rest/v1/rpc/exchange_public_teaser',{method:'POST',
      headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_market_id:${M.id}})})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(d){
        var rows=(d&&d.listings)||[];
        if(!rows.length) return;
        var l=rows[0];
        var spec=[l.beds?l.beds+' bd':null,l.baths?l.baths+' ba':null,
                  l.sqft?Number(l.sqft).toLocaleString('en-US')+' sf':null].filter(Boolean).join(' \u00b7 ');
        var el=document.createElement('a');
        el.className='al-ixcard'; el.style.display='block'; el.style.textDecoration='none';
        el.href='/investor-exchange/';
        el.setAttribute('data-cta','forsale:exchange_card');
        el.innerHTML='<div class="al-ixshot ph"></div><div class="al-ixbody">'
          +'<span class="al-ixtag">'+esc2(l.area||'')+' \u00b7 '+esc2(l.property_type||'')+'</span>'
          +'<div class="al-ixaddr">'+esc2(l.address||'')+'</div>'
          +'<div class="al-ixspec">'+spec+(l.hoa_fee_monthly?' \u00b7 HOA $'+Number(l.hoa_fee_monthly).toLocaleString('en-US')+'/mo':'')+'</div>'
          +'<div class="al-ixlock"><span class="al-ixblur">$\u2588\u2588\u2588,\u2588\u2588\u2588</span>'
          +'<span class="al-ixtag">\uD83D\uDD12 Members</span></div></div>';
        slot.appendChild(el);
        if(rows.length>1){
          var more=document.createElement('div');
          more.className='al-ixtag'; more.style.marginTop='10px';
          more.textContent='and '+(rows.length-1)+' more available to investor accounts';
          slot.appendChild(more);
        }
        /* Cover photos live in a private bucket; sign the one we show. */
        if(l.cover){
          fetch(SB+'/storage/v1/object/sign/exchange-photos/'+encodeURI(l.cover),{
            method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
            body:JSON.stringify({expiresIn:3600})})
            .then(function(r){return r.ok?r.json():null;}).then(function(x){
              if(!x||!x.signedURL) return;
              var sh=el.querySelector('.al-ixshot');
              sh.style.backgroundImage='url('+SB+'/storage/v1'+x.signedURL+')';
              sh.className='al-ixshot';
            }).catch(function(){});
        }
      }).catch(function(){});
  })();
  function esc2(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }


  /* Recent sales on the same map. A distinct pin — slate, dashed — because a
     closed price and an asking price are different claims and must not read
     alike. */
  function drawSold(){
    if(!MAP||!window.L) return;
    if(SOLDLAYER){ MAP.removeLayer(SOLDLAYER); SOLDLAYER=null; }
    var note=document.getElementById('alSoldNote');
    if(!SOLDON){ if(note) note.textContent=''; return; }
    SOLDLAYER=window.L.layerGroup().addTo(MAP);
    var shown=0;
    SOLD.forEach(function(x){
      if(x.lat==null||x.lng==null) return;
      var mk=window.L.marker([x.lat,x.lng],{icon:window.L.divIcon({
        className:'al-pinwrap',
        html:'<span class="al-pin sold">'+pinLabel(x)+'</span>',
        iconSize:null, iconAnchor:[26,13]})});
      mk.bindPopup('<b>'+String(x.addr||'').replace(/</g,'&lt;')+'</b><br>'
        +'Sold '+pinLabel(x)+(x.psf?' \u00b7 $'+x.psf+'/sf':'')+'<br>'
        +new Date(x.sold_on+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}));
      mk.addTo(SOLDLAYER); shown++;
    });
    if(note) note.textContent = shown+' sold in the last '+SOLDMO+(SOLDMO===1?' month':' months')
      + (SOLD.length>shown ? ' \u00b7 '+(SOLD.length-shown)+' without coordinates' : '');
  }
  function loadSold(){
    var note=document.getElementById('alSoldNote');
    if(note) note.textContent='Loading sales\u2026';
    fetch('${SUPABASE_URL}/rest/v1/rpc/sold_listings_map_condo',{method:'POST',
      headers:{'apikey':'${SUPABASE_ANON_KEY}','Authorization':'Bearer ${SUPABASE_ANON_KEY}','Content-Type':'application/json'},
      body:JSON.stringify({p_market_domain:'${M.domain}',p_months:SOLDMO})})
      .then(function(r){return r.ok?r.json():[];})
      .then(function(rows){ SOLD=rows||[]; drawSold(); render(); })
      .catch(function(){ SOLD=[]; if(note) note.textContent='Could not load recent sales.'; });
  }


  /* A sold card is a different object from a listing: the price is a closed
     price, there is no days-on-market, and there is nothing to enquire about.
     Rendering it through cardHtml would dress a sale up as an opportunity. */
  function soldCardHtml(x){
    var img = x.photo ? '<img src="'+x.photo+'" alt="" loading="lazy">' : '';
    var when = new Date(x.sold_on+'T12:00:00')
      .toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var facts = [x.beds?x.beds+' bd':null, x.baths?x.baths+' ba':null,
                 x.sqft?Number(x.sqft).toLocaleString('en-US')+' sf':null,
                 x.year?'built '+x.year:null,
                 x.psf?'$'+Number(x.psf).toLocaleString('en-US')+'/sf':null]
                .filter(Boolean).join(' \u00b7 ');
    var href = x.slug ? '/building/'+x.slug+'/' : '#';
    return '<a class="listing-card listing-card--sold" href="'+href+'" data-mls="'+(x.mls||'')+'">'
      +'<div class="ph al-cardphoto">'
        +'<span class="al-dom sold">Sold '+when+'</span>'+img
        +'<span class="al-soldprice">'+money(x.price)+'</span>'
      +'</div>'
      +'<div class="bd"><h3>'+esc2(String(x.addr||'').split(',')[0])+'</h3>'
      +'<p class="meta">'+facts+'</p>'
      +'<span class="go">See the record \u2192</span></div></a>';
  }


  /* Price: commas as you type, and a two-handle slider bound to the same
     values. 300000 and 3000000 are indistinguishable at a glance without them. */
  function commafy(el){
    var digits=(el.value||'').replace(/\D/g,'');
    el.value = digits ? Number(digits).toLocaleString('en-US') : '';
  }
  function priceOf(id){
    var el=document.getElementById(id); if(!el) return null;
    var d=(el.value||'').replace(/\D/g,'');
    return d ? Number(d) : null;
  }
  function wirePrice(){
    var lo=document.getElementById('pLo'), hi=document.getElementById('pHi'),
        fill=document.getElementById('pFill'),
        minI=document.getElementById('fMinP'), maxI=document.getElementById('fMaxP');
    if(!lo||!hi) return;
    var LOW=Number(lo.min), HIGH=Number(lo.max), SPAN=HIGH-LOW;
    function paint(){
      var a=Number(lo.value), b=Number(hi.value);
      fill.style.left=((a-LOW)/SPAN*100)+'%';
      fill.style.width=((b-a)/SPAN*100)+'%';
    }
    function fromSlider(){
      /* handles may not cross */
      if(Number(lo.value) > Number(hi.value)-Number(lo.step)) lo.value=Number(hi.value)-Number(lo.step);
      if(Number(hi.value) < Number(lo.value)+Number(lo.step)) hi.value=Number(lo.value)+Number(lo.step);
      minI.value = Number(lo.value)===LOW ? '' : Number(lo.value).toLocaleString('en-US');
      maxI.value = Number(hi.value)===HIGH ? '' : Number(hi.value).toLocaleString('en-US');
      paint();
    }
    function fromInputs(){
      var a=priceOf('fMinP'), b=priceOf('fMaxP');
      lo.value = a==null ? LOW : Math.min(Math.max(a,LOW),HIGH);
      hi.value = b==null ? HIGH : Math.max(Math.min(b,HIGH),LOW);
      paint();
    }
    lo.addEventListener('input',fromSlider);
    hi.addEventListener('input',fromSlider);
    [minI,maxI].forEach(function(el){
      el.addEventListener('input',function(){ commafy(el); fromInputs(); });
    });
    /* dragging is a filter change; applying on release keeps it responsive
       without re-rendering on every pixel */
    [lo,hi].forEach(function(el){
      el.addEventListener('change',function(){ readPanels(); markActive(); render(); });
    });
    paint();
  }

  function render(){
    var rows=current();
    Array.prototype.forEach.call(document.querySelectorAll('.al-count'),function(n){n.textContent = SOLDON ? SOLD.length : rows.length;});
    var np=0; for(var pi=0;pi<rows.length;pi++){ if(isPend(rows[pi])) np++; }
    Array.prototype.forEach.call(document.querySelectorAll('.al-what'),function(w){
      w.textContent = SOLDON ? 'recently sold in ' : 'homes for sale in ';
    });
    var offMap = BOUNDS ? ALL.filter(function(l){return l.lat==null||l.lng==null;}).length : 0;
    var rc=document.getElementById('alResult');
    if(rc)rc.innerHTML = SOLDON
      ? ('<b>'+SOLD.length+'</b> recorded sales')
      : ('<b>'+rows.length+'</b> of '+ALL.length+(BOUNDS?' in this view':' listings')
         +(np?(' \u00b7 '+np+' pending'):'')
         +(offMap?(' \u00b7 '+offMap+' unmapped'):''));
    var spot=document.getElementById('alSpot');
    var grid=document.getElementById('alGrid');
    var noFilters=(F.type==='all'&&F.price==='all'&&F.beds==='all'&&SORT==='price_desc');
    if(!rows.length){
      spot.innerHTML='';
      if(BOUNDS && ALL.length){
        grid.innerHTML='<div class="filter-empty">Nothing in this part of the map. '
          +'<button class="al-zoomout" id="alZoomOut">Zoom out to see more &rarr;</button></div>';
        var zo=document.getElementById('alZoomOut');
        if(zo) zo.addEventListener('click',function(){ if(MAP) MAP.zoomOut(2); });
        drawMap(rows); return;
      }
      grid.innerHTML='<div class="filter-empty">No listings match those filters right now \u2014 which is exactly why Make Me Move exists. <a href="/make-me-move/" style="color:var(--apricot)" data-cta="owner:make_me_move">Name your number \u2192</a></div>';
      return;
    }
    if(noFilters && rows.length>3){
      var hero=null;
      for(var si=0;si<rows.length;si++){ if(!isPend(rows[si])){ hero=rows[si]; break; } }
      if(hero){
        spot.innerHTML=spotlightHtml(hero);
        grid.innerHTML=rows.filter(function(r){return r!==hero;}).map(cardHtml).join('');
      } else {
        spot.innerHTML='';
        grid.innerHTML=rows.map(cardHtml).join('');
      }
    } else {
      spot.innerHTML='';
      grid.innerHTML=rows.map(cardHtml).join('');
    }
    /* Recently sold replaces the feed rather than appending to it — mixing
       closed prices into a for-sale list is how a buyer misreads one for the
       other. The map keeps both layers. */
    if(SOLDON){
      grid.innerHTML = SOLD.length
        ? SOLD.map(soldCardHtml).join('')
        : '<p class="al-empty">No recorded sales in that window.</p>';
    }
    drawMap(rows);
    /* Hovering a card lights its pin, the way every search map behaves. */
    Array.prototype.forEach.call(grid.querySelectorAll('[data-mls]'),function(c){
      c.addEventListener('mouseenter',function(){highlight(c.getAttribute('data-mls'));});
    });
  }
  function wireSeg(id,key){
    var el=document.getElementById(id); if(!el) return;
    el.addEventListener('click',function(e){
      if(e.target.tagName!=='BUTTON') return;
      Array.prototype.forEach.call(el.querySelectorAll('button'),function(b){b.classList.remove('on');});
      e.target.classList.add('on');
      F[key]=e.target.getAttribute('data-v');
      markActive(); render();
    });
  }
  function numOrNull(id){
    /* The price fields carry thousands separators now, so Number('3,000,000')
       would be NaN and the filter would silently do nothing. Strip first. */
    var v=(document.getElementById(id)||{}).value;
    if(v===''||v==null) return null;
    var d=String(v).replace(/[^0-9.]/g,'');
    if(d==='') return null;
    var n=Number(d); return isFinite(n)?n:null;
  }
  function readPanels(){
    F.minP=numOrNull('fMinP'); F.maxP=numOrNull('fMaxP');
    F.minSf=numOrNull('fMinSf'); F.maxSf=numOrNull('fMaxSf');
    F.minYr=numOrNull('fMinYr'); F.maxYr=numOrNull('fMaxYr');
    F.reviewedOnly=!!(document.getElementById('fReviewed')||{}).checked;
    F.withPhotos=!!(document.getElementById('fPhotos')||{}).checked;
    F.noPending=!!(document.getElementById('fNoPending')||{}).checked;
  }
  /* A filter button that looks untouched while filtering is the silent-state
     problem in miniature — mark the ones actually doing something. */
  function markActive(){
    function set(btn,on){var b=document.querySelector('[data-panel="'+btn+'"]'); if(b) b.classList.toggle('on',!!on);}
    set('pType', F.type!=='all');
    set('pPrice', F.minP!=null||F.maxP!=null);
    set('pBeds', F.beds!=='all');
    set('pStatus', F.stage!=='all');
    set('pMore', F.minSf!=null||F.maxSf!=null||F.minYr!=null||F.maxYr!=null||
                 F.reviewedOnly||F.withPhotos||F.noPending);
  }
  function closePanels(){
    Array.prototype.forEach.call(document.querySelectorAll('.al-panel'),function(p){p.classList.remove('open');});
  }
  function wireDropdowns(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'),function(b){
      b.addEventListener('click',function(e){
        e.stopPropagation();
        var id=b.getAttribute('data-panel');
        var p=document.getElementById(id);
        var wasOpen=p.classList.contains('open');
        closePanels();
        if(!wasOpen) p.classList.add('open');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.al-panel'),function(p){
      p.addEventListener('click',function(e){ e.stopPropagation(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-apply]'),function(b){
      b.addEventListener('click',function(){ readPanels(); markActive(); closePanels(); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'),function(b){
      b.addEventListener('click',closePanels);
    });
    document.addEventListener('click',closePanels);
    var rs=document.getElementById('alReset');
    if(rs) rs.addEventListener('click',function(){
      F={type:'all',price:'all',beds:'all',stage:'all',minP:null,maxP:null,minSf:null,maxSf:null,
         minYr:null,maxYr:null,maxHoa:null,reviewedOnly:false,withPhotos:false,noPending:false};
      SORT='reviewed_price';
      ['fMinP','fMaxP','fMinSf','fMaxSf','fMinYr','fMaxYr'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.value='';
      });
      ['fReviewed','fPhotos','fNoPending'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.checked=false;
      });
      ['fType','fBeds','fStage'].forEach(function(id){
        var el=document.getElementById(id); if(!el) return;
        Array.prototype.forEach.call(el.querySelectorAll('button'),function(b,ix){
          b.classList.toggle('on', ix===0);
        });
      });
      var lo=document.getElementById('pLo'), hi=document.getElementById('pHi');
      if(lo) lo.value=lo.min; if(hi) hi.value=hi.max;
      var fill=document.getElementById('pFill');
      if(fill){ fill.style.left='0%'; fill.style.width='100%'; }
      var so=document.getElementById('alSort'); if(so) so.value='reviewed_price';
      markActive(); render();
    });
  }
  wireSeg('fType','type'); wireSeg('fBeds','beds'); wireSeg('fStage','stage'); wireDropdowns(); wirePrice();
  var sc=document.getElementById('alSold'), sm=document.getElementById('alSoldMo');
  if(sc) sc.addEventListener('change',function(){
    SOLDON=sc.checked;
    if(sm) sm.disabled=!SOLDON;
    if(SOLDON) loadSold(); else { drawSold(); render(); }
  });
  if(sm) sm.addEventListener('change',function(){ SOLDMO=Number(sm.value)||3; if(SOLDON) loadSold(); });
  document.getElementById('alSort').addEventListener('change',function(e){ SORT=e.target.value; render(); });
  Promise.resolve(window.__AL__||[])
    .then(function(rows){
      ALL=(rows||[]).map(function(x){
        return {mls_number:x.mls, address_raw:x.addr, property_slug:x.slug,
                price:x.price, beds:x.beds, baths:x.baths, sqft:x.sqft, lot_sqft:x.lot,
                year_built:x.year, prop_type:x.type, status:x.status,
                rehosted_url:x.photo, photos:x.photos,
                lat:x.lat, lng:x.lng, dom:x.dom, pending_days:x.pending_days,
                reviewed:!!x.reviewed, has_cma:!!x.has_cma, risk_level:x.risk,
                building:x.bldg, building_slug:x.bslug};
      });
      ALL.forEach(function(l){ if(l.reviewed||l.has_cma) RV[l.mls_number]={risk_level:l.risk_level,sheet:l.reviewed,cma:l.has_cma}; });
      render();
    })
})();
`;
  const body = `

<style>
.listing-card--sold{border-color:rgba(90,107,140,.4)}
.listing-card--sold .go{color:#5a6b8c}
.al-dom.sold{background:#5a6b8c;color:#fff}
.al-soldprice{position:absolute;left:12px;bottom:12px;z-index:2;background:rgba(18,21,29,.9);
  color:#fff;border-radius:999px;padding:7px 15px;font-family:'Playfair Display',serif;font-size:1.16rem}
.al-empty{padding:34px 6px;color:var(--slate);font-size:.95rem}
.al-soldwrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.al-soldtoggle{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:600;cursor:pointer;
  background:#fff;border:1px solid rgba(32,36,46,.2);border-radius:8px;padding:7px 13px}
.al-soldtoggle:hover{border-color:var(--apricot)}
.al-soldtoggle input{width:15px;height:15px;accent-color:#5a6b8c}
.al-soldmo{border:1px solid rgba(32,36,46,.2);border-radius:8px;padding:7px 11px;font:inherit;
  font-size:14px;background:#fff}
.al-soldmo:disabled{opacity:.42}
.al-pin.sold{background:#5a6b8c;color:#fff;border-style:dashed;border-color:rgba(255,255,255,.7)}
.al-soldnote{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.1em;
  text-transform:uppercase;color:#5a6b8c;margin-top:6px}
.al-sec{border-top:1px solid var(--line);position:relative;z-index:2;background:var(--bg)}
.al-zoomout{background:none;border:0;color:var(--apricot);font:inherit;font-weight:600;
  text-decoration:underline;cursor:pointer;padding:0}
/* ---- mobile: map on top, card sheet below, as Zillow does ---- */
@media(max-width:1000px){
  .al-mapwrap{height:56vh}
  .al-listpane{border-radius:18px 18px 0 0;margin-top:-18px;position:relative;z-index:4;
    background:var(--bg);box-shadow:0 -8px 24px rgba(18,21,29,.12);padding-top:0}
  .al-listpane:before{content:'';display:block;width:44px;height:5px;border-radius:3px;
    background:rgba(32,36,46,.26);margin:10px auto 4px}
  .al-listhead{padding-top:10px}
  .al-listhead h2{font-size:1.18rem}
  .al-sortrow{gap:8px}
  .al-soldwrap{width:100%}
  .al-sort{flex:1;min-width:0}
}
/* ---------- below the listings ---------- */
.al-below{border-top:1px solid var(--line);margin-top:34px;padding-top:30px}
.al-blk{border:1px solid var(--line);border-radius:16px;padding:26px;margin-bottom:16px;background:#fff}
.al-blk.dark{background:var(--chrome);color:var(--chrome-ink);border-color:rgba(236,231,219,.16)}
.al-blk .eyebrow{font-family:'JetBrains Mono',monospace;font-size:.56rem;letter-spacing:.16em;
  text-transform:uppercase;color:var(--apricot)}
.al-blk.dark .eyebrow{color:var(--apricot-soft)}
.al-blk h3{font-family:'Playfair Display',serif;font-size:1.5rem;margin:8px 0 8px;line-height:1.2}
.al-blk p{font-size:.94rem;line-height:1.7;margin:0;max-width:60ch;color:var(--slate)}
.al-blk.dark p{color:#b9c4d6}
.al-btn{display:inline-block;margin-top:18px;background:var(--apricot);color:#12151d;
  border-radius:999px;padding:11px 22px;font-weight:700;text-decoration:none;font-size:.92rem}
.al-btn.ghost{background:transparent;border:1px solid rgba(236,231,219,.4);color:var(--chrome-ink)}
.al-ixwhy{margin:16px 0 0;padding:0}
.al-ixwhy li{list-style:none;position:relative;padding-left:19px;margin-bottom:9px;
  font-size:.92rem;line-height:1.65;color:#b9c4d6;max-width:60ch}
.al-ixwhy li:before{content:'\\2192';position:absolute;left:0;color:var(--apricot-soft)}
.al-ixwhy b{color:var(--chrome-ink);font-weight:600}
.al-ixcard{border:1px solid rgba(236,231,219,.2);border-radius:14px;overflow:hidden;margin-top:18px;
  max-width:340px;cursor:pointer;background:rgba(236,231,219,.05)}
.al-ixshot{height:150px;background-size:cover;background-position:center;background:linear-gradient(135deg,rgba(217,154,78,.22),rgba(236,231,219,.05))}
.al-ixshot.ph{filter:blur(9px);transform:scale(1.06)}
.al-ixbody{padding:16px 18px}
.al-ixaddr{font-family:'Playfair Display',serif;font-size:1.12rem;color:var(--chrome-ink);margin-top:4px}
.al-ixspec{font-size:.84rem;color:rgba(236,231,219,.6);margin-top:4px}
.al-ixlock{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;
  padding-top:12px;border-top:1px solid rgba(236,231,219,.14)}
.al-ixblur{font-family:'Playfair Display',serif;font-size:1.3rem;color:var(--apricot-soft);
  filter:blur(5px);user-select:none}
.al-ixtag{font-family:'JetBrains Mono',monospace;font-size:.54rem;letter-spacing:.14em;
  text-transform:uppercase;color:rgba(236,231,219,.6)}
.al-tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:20px}
.al-tool{border:1px solid var(--line);border-radius:12px;padding:16px 18px;text-decoration:none;display:block}
.al-tool:hover{border-color:var(--apricot)}
.al-tool b{display:block;font-family:'Playfair Display',serif;font-size:1.06rem;color:var(--ink)}
.al-tool span{display:block;font-size:.82rem;color:var(--slate);margin-top:3px}
/* ---------- for-sale: map + list, Zillow-shaped ---------- */
.al-shell{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);
  gap:0;height:calc(100vh - var(--nav-h));position:relative}
@media(max-width:1000px){.al-shell{grid-template-columns:1fr;height:auto}}
.al-mapwrap{position:sticky;top:var(--nav-h);height:calc(100vh - var(--nav-h));
  border-right:1px solid var(--chrome-line);background:#e4e8ef}
@media(max-width:1000px){.al-mapwrap{position:relative;top:0;height:56vh;border-right:0;
  border-bottom:1px solid var(--chrome-line)}}
#alMap{position:absolute;inset:0}
.al-listpane{overflow-y:auto;height:calc(100vh - var(--nav-h));padding:0 22px 40px}
@media(max-width:1000px){.al-listpane{height:auto;overflow:visible;padding:0 20px 40px}}
.al-listhead{position:sticky;top:0;background:var(--bg);padding:20px 0 14px;z-index:6;
  border-bottom:1px solid var(--line);box-shadow:0 6px 12px -10px rgba(0,0,0,.35)}
.al-listpane .listing-grid{margin-top:16px}
.al-listhead h2{font-family:'Playfair Display',serif;font-size:1.35rem;line-height:1.2}
.al-listhead .n{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--slate);
  letter-spacing:.08em;margin-top:4px}
.al-sortrow{display:flex;align-items:center;justify-content:space-between;gap:12px;
  flex-wrap:wrap;margin-top:10px}

/* map pins */
.al-pin{background:#12151d;color:#fff;border-radius:999px;padding:5px 11px;font-weight:700;
  font-size:12.5px;white-space:nowrap;border:1.5px solid rgba(255,255,255,.85);
  box-shadow:0 2px 7px rgba(0,0,0,.32);cursor:pointer;font-family:'DM Sans',sans-serif}
.al-pin.rv{background:var(--apricot);color:#12151d;border-color:#fff}
.al-pin.pend{background:#6f7684}
.al-pin.on{background:#fff;color:#12151d;border-color:var(--apricot);transform:scale(1.09)}
.leaflet-marker-icon.al-pinwrap{background:none;border:0}

/* the card grid becomes one column inside the pane */
/* Sized against the PANE, not the viewport. The pane is about half the window,
   so a viewport breakpoint left one column on screens with plenty of room.
   auto-fill gives two whenever the pane itself can hold them. */
.al-listpane .listing-grid{grid-template-columns:repeat(auto-fill,minmax(244px,1fr));gap:14px}
@media(max-width:560px){.al-listpane .listing-grid{grid-template-columns:1fr}}

/* days on market, top-left of the photo — Zillow's position */
.al-dom{position:absolute;top:10px;left:10px;z-index:2;background:rgba(255,255,255,.94);
  color:#20242e;border-radius:6px;padding:4px 9px;font-size:11.5px;font-weight:600;
  box-shadow:0 1px 4px rgba(0,0,0,.18)}
.al-dom.fresh{background:#12151d;color:#fff}
.al-cardphoto{position:relative}

/* filter bar */
.al-bar{position:sticky;top:var(--nav-h);margin-top:var(--nav-h);z-index:20;background:var(--bg);
  border-bottom:1px solid var(--line);padding:10px 22px}
/* No hero above it, so the shell fills the window from the nav down.
   The shell is sticky as well as tall: without it the document scrolls the whole
   shell upward, and the list head — which is sticky to the PANE — pins to an
   edge already above the viewport, so its heading and count get clipped. */
.al-shell{height:calc(100vh - var(--nav-h) - 57px);position:sticky;
  top:calc(var(--nav-h) + 57px);align-items:start;
  /* Opaque, and beneath what follows. A sticky element with no background lets
     everything that scrolls past show straight through it. */
  background:var(--bg);z-index:1}
.al-mapwrap,.al-listpane{height:calc(100vh - var(--nav-h) - 57px)}
.al-mapwrap{top:0}
@media(max-width:1000px){
  .al-shell{height:auto;position:static}
  .al-listpane{height:auto}
  .al-mapwrap{height:56vh;top:0}
}
.al-bar-inner{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
@media(max-width:1000px){
  .al-bar{padding:8px 0}
  .al-bar-inner{flex-wrap:nowrap;overflow-x:auto;overflow-y:visible;
    scrollbar-width:none;-webkit-overflow-scrolling:touch;
    padding:2px 14px;scroll-padding-left:14px}
  .al-bar-inner::-webkit-scrollbar{display:none}
  .al-drop{flex:0 0 auto}
  .al-dbtn{white-space:nowrap;padding:7px 12px;font-size:13.5px}
  .al-reset{flex:0 0 auto;white-space:nowrap;padding-right:14px}
  /* a dropdown inside a scrolling row would be clipped; pin it to the bar */
  .al-panel{position:fixed;left:12px;right:12px;top:calc(var(--nav-h) + 52px);
    min-width:0;max-height:66vh;overflow-y:auto}
}
.al-drop{position:relative}
.al-dbtn{background:#fff;border:1px solid rgba(32,36,46,.2);border-radius:8px;padding:8px 14px;
  font:inherit;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:7px}
.al-dbtn:hover{border-color:var(--apricot)}
.al-dbtn.on{border-color:var(--apricot);box-shadow:0 0 0 1px var(--apricot)}
.al-dbtn i{font-style:normal;font-size:9px;opacity:.5}
.al-panel{display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:40;background:#fff;
  border:1px solid rgba(32,36,46,.16);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.16);
  padding:16px;min-width:268px}
.al-panel.open{display:block}
.al-panel h4{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.14em;
  text-transform:uppercase;color:var(--slate);margin-bottom:8px}
.al-seg{display:flex;flex-wrap:wrap;gap:6px}
.al-seg button{background:#fff;border:1px solid rgba(32,36,46,.18);border-radius:999px;
  padding:6px 13px;font:inherit;font-size:13.5px;cursor:pointer}
.al-seg button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
/* Dual-handle range. Two stacked inputs with transparent tracks: the browser
   has no native two-thumb control, and this keeps keyboard access. */
.al-slider{position:relative;height:30px;margin:6px 2px 2px}
.al-track{position:absolute;top:13px;left:0;right:0;height:4px;border-radius:2px;
  background:rgba(32,36,46,.16)}
.al-fill{position:absolute;top:0;height:4px;border-radius:2px;background:var(--apricot)}
.al-slider input[type=range]{position:absolute;top:0;left:0;width:100%;height:30px;margin:0;
  background:none;pointer-events:none;-webkit-appearance:none;appearance:none}
.al-slider input[type=range]:focus{outline:none}
.al-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;
  width:19px;height:19px;border-radius:50%;background:#fff;border:2px solid var(--apricot);
  box-shadow:0 1px 4px rgba(0,0,0,.24);cursor:grab}
.al-slider input[type=range]::-webkit-slider-thumb:active{cursor:grabbing}
.al-slider input[type=range]::-moz-range-thumb{pointer-events:auto;width:19px;height:19px;
  border-radius:50%;background:#fff;border:2px solid var(--apricot);
  box-shadow:0 1px 4px rgba(0,0,0,.24);cursor:grab}
.al-slider input[type=range]::-moz-range-track{background:none}
.al-sliderends{display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;
  font-size:.6rem;letter-spacing:.08em;color:var(--slate);margin-bottom:12px}
.al-panel .row{display:flex;gap:10px;align-items:center;margin-top:10px}
.al-panel input[type=number]{width:100%;border:1px solid rgba(32,36,46,.2);border-radius:8px;
  padding:8px 10px;font:inherit;font-size:14px}
.al-check{display:flex;align-items:center;gap:9px;margin-top:9px;font-size:14px;cursor:pointer}
.al-check input{width:16px;height:16px;accent-color:var(--apricot)}
.al-apply{width:100%;margin-top:14px;background:var(--apricot);color:#12151d;border:0;
  border-radius:999px;padding:10px;font:inherit;font-weight:700;cursor:pointer}
.al-reset{background:none;border:0;color:var(--slate);font:inherit;font-size:13px;
  text-decoration:underline;cursor:pointer;padding:0}
.al-nomap{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.1em;
  text-transform:uppercase;color:var(--slate);margin-top:8px}
.listing-card--rv{border-color:var(--apricot);box-shadow:0 0 0 1.5px var(--apricot),0 10px 28px rgba(193,84,40,.14)}
.listing-card--rv:hover{box-shadow:0 0 0 1.5px var(--apricot),0 14px 34px rgba(193,84,40,.2)}
.rv-stack{position:absolute;top:12px;right:12px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;z-index:2}
.rv-stack .rv-badge{position:static}
.rv-badge.rv-cma{background:#e2b04a;color:#1a1f2e;font-weight:700;box-shadow:0 4px 14px rgba(18,21,29,.35),0 0 0 1px rgba(255,255,255,.35) inset}
.rv-badge{position:absolute;top:12px;right:12px;background:var(--apricot);color:#fff;font-family:'JetBrains Mono',monospace;font-size:.56rem;letter-spacing:.1em;text-transform:uppercase;border-radius:999px;padding:5px 11px;box-shadow:0 4px 12px rgba(18,21,29,.25)}
.listing-card .ph,.al-spot .ph{position:relative}
.rv-cta{color:var(--apricot);font-weight:600}
.rv-btn{border:1.5px solid var(--apricot);color:var(--apricot);background:transparent}
</style>
<div class="al-bar">
  <div class="al-bar-inner">
    <div class="al-drop"><button class="al-dbtn" data-panel="pType">Property type <i>&#9660;</i></button>
      <div class="al-panel" id="pType">
        <h4>Home type</h4>
        <div class="al-seg" id="fType">
          <button class="on" data-v="all">All</button><button data-v="house">House</button>
          <button data-v="condo">Condo</button><button data-v="town">Townhome</button>
          <button data-v="multi">Multi-family</button>
        </div>
        <button class="al-apply" data-close>Done</button>
      </div></div>

    <div class="al-drop"><button class="al-dbtn" data-panel="pPrice">Price <i>&#9660;</i></button>
      <div class="al-panel" id="pPrice">
        <h4>Price range</h4>
        <div class="al-slider">
          <div class="al-track"><div class="al-fill" id="pFill"></div></div>
          <input type="range" id="pLo" min="${M.priceBand.min}" max="${M.priceBand.max}"
                 step="${M.priceBand.step}" value="${M.priceBand.min}" aria-label="Minimum price">
          <input type="range" id="pHi" min="${M.priceBand.min}" max="${M.priceBand.max}"
                 step="${M.priceBand.step}" value="${M.priceBand.max}" aria-label="Maximum price">
        </div>
        <div class="al-sliderends"><span>$${(M.priceBand.min/1000000).toFixed(1)}M</span>
          <span>$${(M.priceBand.max/1000000).toFixed(1)}M+</span></div>
        <div class="row"><input type="text" id="fMinP" placeholder="No min" inputmode="numeric"
            autocomplete="off">
          <span>&ndash;</span><input type="text" id="fMaxP" placeholder="No max" inputmode="numeric"
            autocomplete="off"></div>
        <button class="al-apply" data-apply>Apply</button>
      </div></div>

    <div class="al-drop"><button class="al-dbtn" data-panel="pBeds">Beds &amp; baths <i>&#9660;</i></button>
      <div class="al-panel" id="pBeds">
        <h4>Bedrooms</h4>
        <div class="al-seg" id="fBeds">
          <button class="on" data-v="all">Any</button><button data-v="1">1+</button>
          <button data-v="2">2+</button><button data-v="3">3+</button>
          <button data-v="4">4+</button><button data-v="5">5+</button>
        </div>
        <button class="al-apply" data-close>Done</button>
      </div></div>

    <div class="al-drop"><button class="al-dbtn" data-panel="pStatus">Status <i>&#9660;</i></button>
      <div class="al-panel" id="pStatus">
        <h4>Listing status</h4>
        <div class="al-seg" id="fStage">
          <button class="on" data-v="all">All</button><button data-v="available">Available</button>
          <button data-v="pending">Pending</button>
        </div>
        <button class="al-apply" data-close>Done</button>
      </div></div>

    <div class="al-drop"><button class="al-dbtn" data-panel="pMore">More <i>&#9660;</i></button>
      <div class="al-panel" id="pMore">
        <h4>Square feet</h4>
        <div class="row"><input type="number" id="fMinSf" placeholder="No min" inputmode="numeric">
          <span>&ndash;</span><input type="number" id="fMaxSf" placeholder="No max" inputmode="numeric"></div>
        <h4 style="margin-top:14px">Year built</h4>
        <div class="row"><input type="number" id="fMinYr" placeholder="Any" inputmode="numeric">
          <span>&ndash;</span><input type="number" id="fMaxYr" placeholder="Any" inputmode="numeric"></div>
        <label class="al-check"><input type="checkbox" id="fReviewed"> With a Comp Report or disclosure review</label>
        <label class="al-check"><input type="checkbox" id="fPhotos"> Has photographs</label>
        <label class="al-check"><input type="checkbox" id="fNoPending"> Hide pending</label>
        <button class="al-apply" data-apply>Apply</button>
      </div></div>

    <button class="al-reset" id="alReset">Reset all filters</button>
  </div>
</div>

<div class="al-shell">
  <div class="al-mapwrap"><div id="alMap"></div></div>
  <div class="al-listpane">
    <div class="al-listhead">
      <h2><span class="al-count">&mdash;</span> <span class="al-what">homes for sale in </span>${M.city}</h2>
      <div class="n" id="alResult"></div>
      <div class="al-sortrow">
        <select class="al-sort" id="alSort" aria-label="Sort listings">
          <option value="reviewed_price">Comp Report &amp; disclosures first</option>
          <option value="price_desc">Price &middot; high to low</option>
          <option value="price_asc">Price &middot; low to high</option>
          <option value="dom_asc">Newest on market</option>
          <option value="dom_desc">Longest on market</option>
          <option value="ppsf_asc">$/sf &middot; low to high</option>
          <option value="ppsf_desc">$/sf &middot; high to low</option>
          <option value="sqft_desc">Largest first</option>
        </select>
        <div class="al-soldwrap">
          <label class="al-soldtoggle"><input type="checkbox" id="alSold"> Recently sold</label>
          <select id="alSoldMo" class="al-soldmo" aria-label="Sold within" disabled>
            <option value="1">Last month</option>
            <option value="3" selected>Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
          </select>
        </div>
        <span class="al-nomap" id="alNoMap"></span>
        <span class="al-soldnote" id="alSoldNote"></span>
      </div>
    </div>
    <div id="alSpot"></div>
    <div class="listing-grid" id="alGrid"></div>
    <p class="map-note" style="margin-top:22px">Listing data from MLSListings, deemed reliable but not
      guaranteed. Days on market is measured from when this feed first saw the listing. Buyers should
      verify all information independently.</p>
  </div>
</div>

<section class="pg al-sec"><div class="wrap">
    
      <div class="al-blk dark" id="alIx">
        <span class="eyebrow">Investor Exchange</span>
        <h3>Buy a revenue-generating rental.</h3>
        <p>${M.city} rentals with a tenant already in place &mdash; you take title subject to the
           lease, so the rent starts the day you close. Not on the MLS or any portal.</p>
        <div id="alIxSlot"></div>
        <a class="al-btn" href="/investor-exchange/" data-cta="forsale:exchange">
          See what&rsquo;s on the Exchange &rarr;</a>
      </div>

      <div class="al-blk">
        <span class="eyebrow">Free account</span>
        <h3>Save the ones you like. Watch what happens to them.</h3>
        <p>Track any listing in ${M.zipsLabel}, get told when the price moves or it goes pending, and
           read the disclosure cheat sheet on every home ${M.agent.first} has reviewed &mdash; what the
           inspection found, what the HOA minutes say, what it would cost to fix. Free, and there is
           nothing to cancel.</p>
        <a class="al-btn" href="https://app.${M.domain}/signin?mode=signup"
           data-cta="forsale:create_account">Create a free account &rarr;</a>
      </div>

      <div class="al-blk">
        <span class="eyebrow">Be your own agent</span>
        <h3>The tools an agent would run for you.</h3>
        <p>Every number here comes with the sample behind it. Run them yourself before you talk to anyone.</p>
        <div class="al-tools">
          <a class="al-tool" href="https://app.${M.domain}/tools/cma" data-cta="forsale:tool_cma">
            <b>Build a Comp Report</b><span>What the comparables actually say</span></a>
          <a class="al-tool" href="https://app.${M.domain}/tools/net-sheet" data-cta="forsale:tool_net">
            <b>Seller net sheet</b><span>What you keep after costs</span></a>
          <a class="al-tool" href="https://app.${M.domain}/tools/compare" data-cta="forsale:tool_compare">
            <b>Compare homes</b><span>Side by side, same measures</span></a>
          <a class="al-tool" href="https://app.${M.domain}/tools/review" data-cta="forsale:tool_review">
            <b>Disclosure review</b><span>${M.agent.first} reads the package</span></a>
        
</div></section>
  </div>
</div>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <div class="split">
    <div>
      <span class="eyebrow">Not seeing it?</span>
      <h2>The home you want probably <em>isn't listed.</em></h2>
      <p class="sub" style="margin-top:14px">A few dozen listings — out of ${mktDerived().homes.toLocaleString('en-US')} homes. The one you actually want is in the index, and its owner has a number. <a href="/how-it-works/" style="color:var(--apricot)">Here's how to pursue it \u2192</a></p>
    </div>
    ${toolCta({
      eyebrow: "Before you make an offer",
      lead: `Weighing one of these? Get a complete disclosure review from ${M.agent.first} within 24 hours, and run the comps before you write.`,
      actions: [
        { label: "Request a disclosure review", href: `https://app.${M.domain}/tools/review` },
        { label: "Build a Comp Report", href: `https://app.${M.domain}/tools/cma` }
      ],
      note: `Reviewed personally by ${M.agent.first}, usually within 24 hours · free · no obligation.`
    })}
  </div>
</div></section>
<script>${clientJs}</script>`;
  return cityHead(title, desc, 'https://www.' + M.domain + '/active-listings/', '<style>.al-bldg{font-size:.8rem;color:var(--apricot);font-weight:600;margin:2px 0 4px}</style>\n') +
    cityNav('forsale') + '<script>window.__AL__=' + JSON.stringify(AL).replace(/</g, '\\u003c') + ';</script>\n' +
    body + cityFooter(foot || {}) + cityTail('');
}


function toolCta(o) {   // the City Markets helper, verbatim but for the note colour (contrast)
  var acts = (o.actions || []).map(function(a, i) {
    return i === 0
      ? '<a href="' + a.href + '" class="btn btn-gold">' + cityEsc(a.label) + ' &rarr;</a>'
      : '<a href="' + a.href + '" class="btn" style="background:transparent;border:1px solid rgba(0,0,0,.16);color:inherit">' + cityEsc(a.label) + ' &rarr;</a>';
  }).join('');
  return '<div class="method-card" style="max-width:640px">'
    + '<span class="eyebrow">' + cityEsc(o.eyebrow) + '</span>'
    + '<p style="margin-bottom:2px">' + o.lead + '</p>'
    + '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px">' + acts + '</div>'
    + '<p style="font-size:.72rem;color:#5d6575;margin-top:14px;margin-bottom:0">' + (o.note || 'Free and instant \u00b7 save your work with a free account \u00b7 no obligation.') + '</p>'
    + '</div>';
}
function condoActiveListingsMarket(mk, rows, foot) {
  const prices = rows.map((r) => r.price).filter((p) => p > 0).sort((a, b) => a - b);
  const q = (f) => prices.length ? prices[Math.min(prices.length - 1, Math.floor(f * prices.length))] : 0;
  const lo = Math.max(100000, Math.floor(q(0.03) / 50000) * 50000), hi = Math.max(lo + 500000, Math.ceil(q(0.97) / 250000) * 250000);
  return { id: 5, city: mk.region || 'San Francisco', domain: mk.domain, name: mk.brand || 'Condo Market SF', zipsLabel: mk.region || 'San Francisco',
           agent: { first: 'Tim' }, center: [37.782, -122.415], priceBand: { min: lo, max: hi, step: hi - lo > 3e6 ? 50000 : 25000 },
           homes: (foot && foot.totals && foot.totals.homes) || 15620 };
}
function condoActiveListingsRows(listings) {
  const now = Date.now();
  return (listings || []).map((l) => ({
    mls: l.mls, addr: l.unit_address || l.building_name || '', slug: null, price: l.price, beds: l.beds, baths: l.baths, sqft: l.sqft, lot: null,
    year: l.year_built, type: 'Condominium', status: 'Active', photo: l.photo ? cmThumbUrl(l.photo, 720, 0) : null, photos: null, lat: l.lat, lng: l.lng,   // a 720px copy, not the full photo
    dom: l.listed_at ? Math.max(0, Math.round((now - Date.parse(l.listed_at)) / 86400000)) : null, pending_days: null,
    reviewed: false, has_cma: false, risk: null, bldg: l.building_name || null, bslug: l.building_slug || null,
  }));
}

export default {
  async fetch(request, env) {
    CARTO_KEY = (env && env.CARTO_KEY) ? String(env.CARTO_KEY) : '';
    return withFavicon(await handleRequest(request, env));
  },
};

async function handleRequest(request, env) {
    const url = new URL(request.url);
    const hostMk = resolveMarket(url.hostname);

    // The homepage lives at the domain root. The page is buildings/index.html,
    // and "/" used to bounce there (a 302, then a meta refresh in a stub), so
    // the root was never the homepage. The root is answered as /buildings/ is —
    // same page, same market swaps for every domain this worker serves — with
    // the root URL kept. The page itself forwards magic-link tokens to
    // /auth-callback.html, the job the old stub did. /buildings/ keeps working
    // for every existing link; the page declares "/" as its canonical.
    // (_redirects rules do not apply to a site routed through _worker.js,
    // which is why a 200 rewrite there had no effect.)
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const inner = new URL(request.url);
      inner.pathname = '/buildings/';
      return handleRequest(new Request(inner.toString(), request), env);
    }

    // Expired-listing QR codes already in the post.
    //
    // Four expired letters were mailed carrying
    // sanfranciscocondomarket.com/proposal/{page_token}/. This worker has never
    // had a /proposal/ route, so all four scanned to a 404 — the only host of
    // the fifty-six sent that was outright dead.
    //
    // Every expired page is now served from mcmullenresidential.com whatever
    // market the property sits in, so this forwards rather than renders: there
    // is one renderer for these pages and it is not here.
    //
    // A printed QR cannot be recalled. THIS ROUTE IS PERMANENT — it must
    // outlive the campaign, the templates and anyone's memory of why it exists.
    // 301 because /expired/{token} is where the page genuinely lives now.
    {
      const prop = url.pathname.match(/^\/proposal\/([^\/]+)\/?$/);
      if (prop) {
        const code = String(prop[1] || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (code) {
          return Response.redirect(
            'https://mcmullenresidential.com/expired/' + code, 301);
        }
      }
    }

    // /r/<CODE> — printed letter QR codes.
    //
    // Letters for this market print https://sanfranciscocondomarket.com/r/<CODE>,
    // and this worker never had the route, so every one of them was a 404. The
    // codes live in the city database, which also decides where each goes and on
    // which site (qr_resolve). This records the scan there and redirects. A
    // printed code cannot be recalled: an unknown code still lands on the home
    // page, never on a 404. THIS ROUTE IS PERMANENT.
    {
      const qrM = url.pathname.match(/^\/r\/([A-Za-z0-9]{4,12})\/?$/);
      if (qrM) {
        const code = qrM[1].toUpperCase();
        const hint = url.searchParams.get('h') || null;
        let host = url.host;
        let target = '/';
        try {
          const K = 'sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
          const r = await fetch('https://qinuukntpyulqjzndnho.supabase.co/rest/v1/rpc/record_qr_scan', {
            method: 'POST',
            headers: { 'apikey': K, 'Authorization': 'Bearer ' + K, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              p_code: code, p_recipient: hint,
              p_visitor: url.searchParams.get('v') || null,
              p_ua: request.headers.get('user-agent') || null,
              p_ref: request.headers.get('referer') || null,
            }),
          });
          if (r.ok) {
            const j = await r.json();
            if (j && j.ok && j.target) {
              target = String(j.target);
              if (j.domain && /^[a-z0-9.-]+$/i.test(j.domain)
                  && j.domain.replace(/^www\./, '') !== url.host.replace(/^www\./, '')) host = j.domain;
            }
          }
        } catch (e) { /* tracking must never break the redirect */ }
        if (!target.startsWith('/')) target = '/';
        const dest = 'https://' + host + target + (target.includes('?') ? '&' : '?')
          + 'qr=' + code + (hint ? '&qh=' + encodeURIComponent(hint) : '');
        return new Response(null, { status: 302, headers: { 'Location': dest, 'Cache-Control': 'no-store' } });
      }
    }

    // robots.txt — per-host, points at this host's sitemap.
    if (url.pathname === '/robots.txt') {
      // Open to AI training and answer engines by design — this is a public
      // record of a city's condo market, and being quotable is the point.
      // The Disallow lines are crawl-budget hygiene, not secrecy: parameterised
      // URLs all canonicalise to the same three pages, and Google was spending
      // 243 fetches a cycle on them while 42 real building pages sat
      // discovered-but-never-crawled.
      const aiAgents = [
        'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
        'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
        'Google-Extended', 'PerplexityBot', 'Perplexity-User',
        'meta-externalagent', 'FacebookBot', 'Applebot', 'Applebot-Extended',
        'Amazonbot', 'Bytespider', 'CCBot', 'Diffbot',
        'cohere-ai', 'omgili', 'Timpibot', 'YouBot', 'AI2Bot'
      ];
      const body =
        'User-agent: *\nAllow: /\n'
        + 'Disallow: /*?auth=\nDisallow: /*?address=\nDisallow: /*?offer=\nDisallow: /*?ref=\nDisallow: /*?return=\n\n'
        + aiAgents.map(a => 'User-agent: ' + a + '\nAllow: /\n').join('\n')
        + '\nSitemap: https://www.' + hostMk.domain + '/sitemap.xml\n';
      return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    }

    // llms.txt — a plain-text map of the site for AI assistants, generated from
    // the same catalogue the building pages read (24 Sep 2026). Public facts only.
    if (url.pathname === '/llms.txt') {
      return renderLlmsTxt(hostMk);
    }

    // sitemap.xml — lists THIS market's live building pages + key static pages,
    // all on this host's domain, so each domain's Search Console owns its own URLs.
    if (url.pathname === '/sitemap.xml') {
      return renderSitemap(hostMk);
    }

    if (hostMk && hostMk.tag !== 'sf' && isPetitionPath(url.pathname)) {
      return Response.redirect('https://www.' + hostMk.domain + '/buildings/', 302);
    }

    // Evergreen data hub: condo rankings (root-level slug, Miami-flat pattern).
    // Server-rendered from report RPCs at the edge, cached; stays current as
    // sales data grows with no regeneration. Indexable, JSON-LD, internal-links
    // into every building page it names.
    if (request.method === 'GET' &&
        (url.pathname === '/san-francisco-condo-rankings' ||
         url.pathname === '/san-francisco-condo-rankings/')) {
      return renderRankingsHub(hostMk);
    }

    // Local news and monthly market reports. The articles live on the city
    // platform (news_articles, market 5 = SF, 6 = SV); this site renders them.
    if (request.method === 'GET' && (url.pathname === '/news' || url.pathname === '/news/')) {
      return renderCondoNewsIndex(hostMk);
    }
    {
      const nm = url.pathname.match(/^\/news\/([a-z0-9-]+)\/?$/);
      if (request.method === 'GET' && nm) return renderCondoNewsArticle(hostMk, nm[1]);
    }

    // Evergreen data hub: citywide market stats (trailing-12mo pulse + YoY).
    if (request.method === 'GET' &&
        (url.pathname === '/san-francisco-condo-market-stats' ||
         url.pathname === '/san-francisco-condo-market-stats/')) {
      return renderStatsHub(hostMk);
    }

    // Evergreen master hub: full buildings directory, grouped by neighborhood.
    // The top-level internal-link hub pointing into every building page.
    if (request.method === 'GET' &&
        (url.pathname === '/san-francisco-condos' ||
         url.pathname === '/san-francisco-condos/')) {
      return renderBuildingsDirectory(hostMk);
    }

    // Neighborhoods hub.
    if (request.method === 'GET' &&
        (url.pathname === '/neighborhoods' || url.pathname === '/neighborhoods/')) {
      return renderNeighborhoodsHub(hostMk);
    }
    // Neighborhood detail: /neighborhood/<slug>
    const nbM = url.pathname.match(/^\/neighborhood\/([^\/]+)\/?$/);
    if (nbM && request.method === 'GET') {
      return renderNeighborhoodDetail(hostMk, decodeURIComponent(nbM[1]));
    }

    /* /pending/<slug>/ — proxied, not rendered.
       I first wrote a second pending page here. It was 5KB against the city
       page's 130KB: no nav, no photographs, no seven-day terms, no commission
       comparison. Two pages claiming to be the same thing, and the second one
       would have rotted.
       The city worker owns renderPendingPage and exposes it at /_ooa/pending/,
       the same arrangement /_ooa/expired/ already uses. Every future
       improvement to the pending page lands here for free. */
    const pendM = url.pathname.match(/^\/pending\/([a-z0-9][a-z0-9-]{2,120})\/?$/i);
    if (pendM && request.method === 'GET') {
      if (!url.pathname.endsWith('/')) {
        return new Response(null, { status: 301, headers: {
          'Location': url.pathname + '/' + url.search, 'Cache-Control': 'public, max-age=3600' } });
      }
      /* CONTENT FROM THE CITY WORKER, CHROME FROM HERE.
         Proxying the whole page rendered Campbell's registry entry — nav, name,
         ZIP — onto this domain, because the city worker picks its market from
         the request host and the proxy call arrives on a city host. So it now
         returns a fragment (styles + body, no <html>, no nav) and this worker
         wraps it in nbChrome, the same shell the neighbourhood pages use.
         One renderer for the content, each site supplying its own frame. */
      const slug = decodeURIComponent(pendM[1]).trim().toLowerCase();
      let frag = null;
      try {
        const upstream = await fetch(
          'https://campbellrealestatemarket.com/_ooa/pending/' + encodeURIComponent(slug),
          { cf: { cacheTtl: 300 } });
        if (upstream.ok) frag = await upstream.json();
      } catch (e) { frag = null; }

      if (!frag || frag.ok !== true || !frag.body) {
        return wrapStaticWithSwaps(request, env, hostMk);
      }

      const base = 'https://' + url.host;

      /* Put the reader's own building in the nav. That is the one link they
         actually want: the page is about their building, and a click through
         is the whole point of sending them here.
         Only when the building is catalogued and its page really serves —
         9 of the 29 SF pending addresses match one. A nav item that 404s is
         worse than no nav item, and today has been a long argument for
         checking rather than assuming. */
      let bldgNav = '', bldg = null;
      try {
        const bRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/building_by_address', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                     'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ p_address: frag.address || '' }),
        });
        if (bRes.ok) {
          const bj = await bRes.json();
          if (bj && bj.ok === true && bj.slug) {
            bldg = bj;
            bldgNav = '<a href="' + base + '/building/' + encodeURIComponent(bj.slug)
              + '/" style="color:#e8a33d">' + esc(bj.name || 'Your building') + '</a>';
          }
        }
      } catch (e) { bldgNav = ''; bldg = null; }

      /* NO BUILDING, NO PAGE.
         This market is a catalogue of buildings. A pending unit in a building
         that is not in the catalogue has nothing to stand on here: no building
         page to click through to, no stack to compare against, and a reader
         who arrives finds a page about somewhere the site does not cover.
         It falls through to the site rather than publishing a page the market
         cannot support. Cataloguing the building makes it appear, with no code
         change. */
      if (!bldg) return wrapStaticWithSwaps(request, env, hostMk);

      const html = nbChrome(
        frag.title || 'A unit in your building just accepted an offer',
        frag.desc || '',
        base + '/pending/' + slug + '/',
        /* nbChrome injects this straight into a ld+json script tag, so null
           would emit `<script type="application/ld+json">null</script>` —
           invalid structured data on every page. A minimal WebPage object is
           both valid and true; the page is noindex either way. */
        JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage',
          name: frag.title || '', url: base + '/pending/' + slug + '/' }),
        base,
        (frag.css || '') + frag.body)
        /* nbChrome has a fixed nav, so the building link is spliced into it
           rather than nbChrome growing a parameter every page would ignore. */
        .replace('<nav class="nav">', '<nav class="nav">' + bldgNav);

      return new Response(html, { status: 200, headers: {
        'content-type': 'text/html;charset=utf-8',
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow' } });
    }

    // /building/<slug>/report → 301 to building page #market section.
    // The dedicated report page is consolidated into the building page's
    // market analysis section; this preserves email-link integrity.
    const reportM = url.pathname.match(/^\/building\/([^\/]+)\/report\/?$/);
    if (reportM && request.method === 'GET') {
      const target = 'https://' + url.host + '/building/' + reportM[1] + '/#market';
      return new Response(null, { status: 301, headers: { 'Location': target, 'Cache-Control': 'public, max-age=3600' } });
    }

    // ── Legacy-site 301s ───────────────────────────────────────────────────
    // 53 URLs from the previous site still crawled by Google and returning 404:
    // 26 blog posts, 17 neighborhood pages, 10 misc. Each held age and links,
    // and each has an exact successor here. 404ing them throws that away;
    // 301 moves it onto the page we want ranking. Sourced from the Search
    // Console "Not found (404)" export, 2026-07-31.
    const LEGACY_BLOG = {
      'the-knox-a-fusion-of-artistic-living-and-urban-convenience-in-san-franciscos-dogpatch': '/building/the-knox',
      'the-rowan-industrial-elegance-in-san-franciscos-mission-district': '/building/the-rowan',
      '733-front-the-epitome-of-sophisticated-living-in-jackson-square-ed128': '/building/733-front',
      'the-allure-of-loft-living-embracing-space-and-style-at-200-brannan': '/building/200-brannan',
      'the-residences-at-mira': '/building/mira',
      '400-grove-modern-living-in-the-heart-of-hayes-valley': '/building/400-grove',
      'the-hayes-the-essence-of-modern-living-in-hayes-valley': '/building/the-hayes',
      'the-pacific-redefining-luxury-in-pacific-heights': '/building/the-pacific',
      'arden-luxury-amenities-in-the-heart-of-the-city': '/building/arden',
      'the-belvedere-redefining-luxury-living-in-cow-hollow': '/building/the-belvedere',
      'maison-au-pont-a-fusion-of-modernity-and-french-elegance-in-san-franciscos-marina-district': '/building/maison-au-pont',
      'maison-au-pont-modern-living-meets-french-elegance-in-san-franciscos-marina-district': '/building/maison-au-pont',
      'park-terrace-the-perfect-fusion-of-urban-living-and-natural-splendor-in-mission-bay': '/building/park-terrace',
      'the-tower-at-four-seasons-private-residences': '/building/four-seasons-private-residences',
      'the-washingtonian-a-jewel-in-the-heart-of-pacific-heights-b217d': '/building/the-washingtonian',
      'parc-telegraph-a-haven-of-modern-comfort-in-the-historic-telegraph-hill-4e17b': '/building/parc-telegraph',
      'marina-chateau-where-historical-charm-meets-contemporary-living-in-cow-hollow': '/building/marina-chateau',
      'unionsf-the-epitome-of-modern-living-in-san-franciscos-mission-district': '/building/unionsf',
      'broderick-place-urban-comfort-and-convenience-in-nopa-51d0b': '/building/broderick-place',
      'jackson-towers-a-blend-of-luxury-and-prime-location-in-san-francisco': '/building/jackson-towers',
      'the-comstock-a-beacon-of-mid-century-modern-luxury-in-nob-hill': '/building/the-comstock',
      '2100-green-where-historical-elegance-meets-modern-cow-hollow-living': '/building/2100-green',
      '255-berry-the-epitome-of-urban-serenity-in-mission-bay': '/building/330-berry-st',
    };
    // Legacy pages with no exact successor go to the buildings directory rather
    // than 404 — a relevant hub beats a dead end, and never a redirect loop.
    const LEGACY_PATH = {
      '/homes': '/buildings/', '/about': '/how-it-works/', '/contact': '/how-it-works/',
      '/invest': '/san-francisco-condo-rankings',
      '/affiliate': '/how-it-works/', '/mo': '/', '/condos-in-san-francisco': '/san-francisco-condos',
    };
    if (request.method === 'GET') {
      const clean = url.pathname.replace(/\/+$/, '') || '/';
      const blogM = clean.match(/^\/blog\/(.+)$/);
      if (blogM) {
        const t = LEGACY_BLOG[blogM[1]] || '/san-francisco-condos';
        return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + hostMk.domain + t, 'Cache-Control': 'public, max-age=86400' } });
      }
      // Old plural /neighborhoods/<slug> → current singular /neighborhood/<slug>
      const hoodM = clean.match(/^\/neighborhoods\/(.+)$/);
      if (hoodM) {
        const s = hoodM[1].replace(/-\d+$/, '').replace(/-[0-9a-f]{5}$/, '');
        return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + hostMk.domain + '/neighborhood/' + s, 'Cache-Control': 'public, max-age=86400' } });
      }
      if (LEGACY_PATH[clean]) {
        return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + hostMk.domain + LEGACY_PATH[clean], 'Cache-Control': 'public, max-age=86400' } });
      }
      // Old unit URL shape from the previous site.
      const oldHome = clean.match(/^\/homes\/(.+)$/);
      if (oldHome) {
        return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + hostMk.domain + '/buildings/', 'Cache-Control': 'public, max-age=86400' } });
      }
    }

    // Merged-building 301s. 250 King St + 260 King St were merged into one
    // 595-unit development, "The Beacon" (2026-07-01). Preserve inbound links,
    // saved references, and SEO by 301-ing the retired slugs to the canonical.
    const MERGED_SLUGS = { '250-king-st': 'the-beacon', '260-king-st': 'the-beacon' };
    const mergedM = url.pathname.match(/^\/building\/([^\/]+)\/?$/);
    if (mergedM && request.method === 'GET') {
      const canonical = MERGED_SLUGS[mergedM[1].toLowerCase()];
      if (canonical) {
        const target = 'https://' + url.host + '/building/' + canonical + '/' + url.search + url.hash;
        return new Response(null, { status: 301, headers: { 'Location': target, 'Cache-Control': 'public, max-age=3600' } });
      }
    }

/* ─────────────────────────────────────────────────────────────────────────
   (A) ROUTE HANDLER  — paste inside fetch() before the building route match
   ───────────────────────────────────────────────────────────────────────── */

    // /active-listings → server-rendered market grid + map enhancement.
    /* Disclosure reviews published on the city platform (the agent desk) open here; any other
       token falls through to the condo platform's own viewer. */
    if ((url.pathname === '/disclosure' || url.pathname === '/disclosure/') && url.searchParams.get('token')) {
      const tk = url.searchParams.get('token').trim();
      if (/^[A-Za-z0-9_-]{8,120}$/.test(tk)) {
        let page = null;
        try { page = await renderDisclosureSheet(tk); } catch (e) { page = null; }
        if (page) return new Response(page, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex' } });
      }
    }

    /* Off Market (City Markets UI): counts only - never a price. */
    if (url.pathname === '/off-market' || url.pathname === '/off-market/') {
      let payload = { buildings: [], totals: {}, hoods: [] };
      try {
        const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/offmarket_page_payload', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ p_market_domain: hostMk.domain }),
        });
        if (r.ok) payload = (await r.json()) || payload;
      } catch (e) {}
      const html = applyMarketSwaps(renderOffMarket(payload), hostMk);
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    }

    /* City Markets UI: the city Active Listings page on the condo's own listings. */
    if (url.pathname === '/active-listings' || url.pathname === '/active-listings/') {
      let listings = [];
      try {
        const alRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/active_listings_page', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ p_market_slug: hostMk.slug }),
        });
        if (alRes.ok) { const p = await alRes.json(); listings = (p && p.listings) ? p.listings : []; }
      } catch (e) { listings = []; }
      const foot = await cityFooterData(hostMk.domain);
      const rows = condoActiveListingsRows(listings);
      const html = applyMarketSwaps(renderActiveListingsCity(condoActiveListingsMarket(hostMk, rows, foot), rows, foot), hostMk);
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120' } });
    }


    // /listing/<mls> → server-rendered standalone active-listing page.
    const lm = url.pathname.match(/^\/listing\/([^\/]+)\/?$/);
    if (lm) {
      const mls = decodeURIComponent(lm[1]).trim().toUpperCase();
      let d = null;
      try {
        const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/listing_detail', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ p_mls: mls }),
        });
        if (res.ok) d = await res.json();
      } catch (e) { d = null; }

      // No live listing → fall through to static (avoids dead-end 404).
      if (!d || !d.mls) {
        return wrapStaticWithSwaps(request, env, hostMk);
      }

      // Cross-domain canonical: a listing whose market differs from the host
      // 301s to its correct domain, mirroring the building rule.
      const lMkt = (d.market_slug && MARKETS) ? (d.market_slug.indexOf('silicon') !== -1 ? MARKETS.sv : MARKETS.sf) : null;
      const lMktDomain = lMkt ? lMkt.domain : null;
      const hostIsKnownMarketL = Object.prototype.hasOwnProperty.call(MARKET_BY_HOST, url.hostname.toLowerCase());
      if (hostIsKnownMarketL && lMktDomain && lMktDomain !== hostMk.domain) {
        const target = 'https://www.' + lMktDomain + '/listing/' + encodeURIComponent(mls) + url.search;
        return new Response(null, { status: 301, headers: { 'Location': target, 'Cache-Control': 'public, max-age=600' } });
      }

      /* City Markets UI: the unit, then its building. */
      const lmPhotos = Array.isArray(d.photos) ? d.photos.map((p) => p && p.url).filter(Boolean) : [];
      const [bcard, foot, reportsHtml] = await Promise.all([
        listingBuildingCard(d.building_slug), cityFooterData(hostMk.domain),
        listingReportsSection({ mls_number: d.mls, address_raw: d.address || '', address_norm: d.address || '', photos: lmPhotos,
          building_slug: d.building_slug || null, building_name: d.building_name || '', unit: d.unit || null }).catch(() => ''),
      ]);
      const listingHtml = applyMarketSwaps(renderListingCity(d, bcard, foot, reportsHtml), hostMk);
      return new Response(listingHtml, {
        status: 200,
        headers: {
          'content-type': 'text/html;charset=utf-8',
          'cache-control': 'public, max-age=120, s-maxage=300',
        },
      });
    }

    // Location SEO pages: /condos-in-<city>, /buy-a-condo-in-<city>, /sell-a-condo-in-<city>
    const cityM = url.pathname.match(/^\/(condos-in|buy-a-condo-in|sell-a-condo-in)\/?([^\/]+)\/?$/)
               || url.pathname.match(/^\/(condos-in|buy-a-condo-in|sell-a-condo-in)-([^\/]+)\/?$/);
    if (cityM) {
      const intentMap = { 'condos-in': 'browse', 'buy-a-condo-in': 'buy', 'sell-a-condo-in': 'sell' };
      const intent = intentMap[cityM[1]];
      const citySlug = decodeURIComponent(cityM[2]).trim().toLowerCase();
      const cityData = await fetchCityData(citySlug, hostMk);
      if (!cityData) {
        return wrapStaticWithSwaps(request, env, hostMk);
      }
      // Cross-domain: city belongs to a market different from host → 301.
      if (cityData.market && cityData.market.domain && cityData.market.domain !== hostMk.domain &&
          Object.prototype.hasOwnProperty.call(MARKET_BY_HOST, url.hostname.toLowerCase())) {
        const target = 'https://www.' + cityData.market.domain + url.pathname + url.search;
        return new Response(null, { status: 301, headers: { 'Location': target, 'Cache-Control': 'public, max-age=3600' } });
      }
      const html = applyMarketSwaps(renderCityPage(hostMk, cityData, intent, await fetchFooterData(hostMk)), hostMk);
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
    }

    // Investor Exchange — the tenant-occupied marketplace.
    if (url.pathname === '/investor-exchange' || url.pathname === '/investor-exchange/') {
      if (url.pathname === '/investor-exchange' && request.method === 'GET') {
        return new Response(null, { status: 301, headers: { 'Location': '/investor-exchange/' + url.search, 'cache-control': 'public, max-age=3600' } });
      }
      const html = applyMarketSwaps(renderInvestorExchange(hostMk, await fetchFooterData(hostMk)), hostMk);
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
    }

    // Market-level buy / sell hubs.
    if (url.pathname === '/buy' || url.pathname === '/buy/' || url.pathname === '/sell' || url.pathname === '/sell/') {
      const intent = (url.pathname.indexOf('buy') !== -1) ? 'buy' : 'sell';
      const cities = await fetchMarketCities(hostMk);
      const html = applyMarketSwaps(renderBuySellHub(hostMk, cities, intent, await fetchFooterData(hostMk)), hostMk);
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
    }

    const m = url.pathname.match(/^\/building\/([^\/]+)\/?$/);

    if (!m) {
      if (request.method === 'GET') {
        if (isHomePath(url.pathname))  return renderChrome(request, env, 'home');
        if (isIntelPath(url.pathname)) return renderChrome(request, env, 'intel');
        return wrapStaticWithSwaps(request, env, hostMk);
      }
      return env.ASSETS.fetch(request);
    }

    const slug = decodeURIComponent(m[1]).trim().toLowerCase();

    let payload = null;
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/building_page_payload', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ p_slug: slug }),
      });
      if (res.ok) payload = await res.json();
    } catch (e) {
      payload = null;
    }

    if (!payload || payload.is_live !== true) {
      return wrapStaticWithSwaps(request, env, hostMk);
    }

    /* Disclosure teaser and Exchange teaser from Platform A, in parallel.
     * Non-blocking by design: if A is slow or down the building page renders
     * exactly as it does today, minus the blocks A feeds. Both are worth having;
     * neither is worth a 500 on the page.
     *
     * building_exchange_teaser says that a unit here is on the Investor Exchange
     * and never which one: no unit address, no listing slug, no member link come
     * back, only size and the cover photo. What the page blurs is placeholder
     * text, so nothing hidden is ever in the HTML. */
    let disclosure = null;
    let exchange = null;
    const aMarketId = A_MARKET_ID_BY_TAG[hostMk.tag];
    if (aMarketId) {
      const aRpc = function (fn, body) {
        return fetch(SB_A_URL + '/rest/v1/rpc/' + fn, {
          method: 'POST',
          headers: {
            'apikey': SB_A_KEY,
            'Authorization': 'Bearer ' + SB_A_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(body),
        }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      };
      const both = await Promise.all([
        aRpc('building_disclosure_teaser', { p_market_id: aMarketId, p_tract_slug: slug }),
        aRpc('building_exchange_teaser', { p_market_id: aMarketId, p_slug: slug }),
      ]);
      if (both[0] && both[0].has_review === true) disclosure = both[0];
      if (both[1] && Array.isArray(both[1].listings) && both[1].listings.length) exchange = both[1];
    }
    payload.disclosure = disclosure;
    payload.exchange = exchange;

    // Cross-domain canonical enforcement: if this building belongs to a different
    // market than the host being requested, 301 to the correct domain. This is
    // what moves SV buildings out of the SF domain's index (and vice versa).
    // Only redirect when the current host is a KNOWN market host, so Cloudflare
    // preview URLs (*.pages.dev) and unknown hosts render in place without looping.
    const bMktDomain = payload.market && payload.market.domain;
    const hostIsKnownMarket = Object.prototype.hasOwnProperty.call(MARKET_BY_HOST, url.hostname.toLowerCase());
    if (hostIsKnownMarket && bMktDomain && bMktDomain !== hostMk.domain) {
      const target = 'https://www.' + bMktDomain + '/building/' + payload.slug + url.search;
      return new Response(null, { status: 301, headers: { 'Location': target, 'Cache-Control': 'public, max-age=3600' } });
    }

    payload.footerData = await fetchFooterData(hostMk);
    const bodyHtml = applyMarketSwaps(renderBuilding(payload), hostMk);
    return new Response(bodyHtml, {
      status: 200,
      headers: {
        'content-type': 'text/html;charset=utf-8',
        'cache-control': 'public, max-age=120, s-maxage=300',
      },
    });
}

/* ----------------------------- helpers ----------------------------------- */
async function renderSitemap(mk) {
  const base = 'https://www.' + mk.domain;
  let rows = [];
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/sitemap_buildings', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ p_market_tag: mk.tag }),
    });
    if (res.ok) rows = await res.json();
  } catch (e) { rows = []; }

  // '/buildings/' is not listed: it is the home page, and declares '/' as its canonical.
  const staticUrls = ['/', '/intelligence/', '/how-it-works/', '/active-listings', '/off-market/', '/buy', '/sell'];
  if (mk.tag === 'sf') staticUrls.push('/san-francisco-condo-rankings');
  if (mk.tag === 'sf') staticUrls.push('/san-francisco-condo-market-stats');
  if (mk.tag === 'sf') staticUrls.push('/san-francisco-condos');
  if (mk.tag === 'sf') staticUrls.push('/neighborhoods');
  // per-neighborhood detail URLs (SF)
  let nbRows = [];
  if (mk.tag === 'sf') {
    nbRows = await callReportRpc('neighborhoods_index', { p_market_domain: mk.domain });
  }
  // City + buy/sell intent pages for every city in this market.
  const footerData = await fetchFooterData(mk);
  const cityList = (footerData && footerData.cities) ? footerData.cities : [];
  // Active listing pages for this market.
  let activeListings = [];
  try {
    const alRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/active_listings_page', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ p_market_slug: mk.slug }),
    });
    if (alRes.ok) { const p = await alRes.json(); activeListings = (p && p.listings) ? p.listings : []; }
  } catch (e) { activeListings = []; }

  const today = new Date().toISOString().slice(0, 10);
  const urlsXml = [];
  // News: the index plus every published article for this market.
  const newsIdx = await aNewsRpc('get_news_index', { p_market_id: A_MARKET_ID_BY_TAG[mk.tag] || 5, p_limit: 50, p_offset: 0 });
  const newsArts = (newsIdx && newsIdx.ok && Array.isArray(newsIdx.articles)) ? newsIdx.articles : [];
  urlsXml.push('<url><loc>' + base + '/news/</loc><lastmod>' + (newsArts[0] && newsArts[0].published_at ? String(newsArts[0].published_at).slice(0, 10) : today) + '</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>');
  for (const n of newsArts) {
    urlsXml.push('<url><loc>' + base + '/news/' + n.slug + '/</loc><lastmod>' + String(n.published_at || today).slice(0, 10) + '</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>');
  }
  for (const u of staticUrls) {
    urlsXml.push('<url><loc>' + base + u + '</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>');
  }
  // City pages (browse + buy + sell). Not for San Francisco: SF is served by
  // /san-francisco-condos, /buy and /sell (listed above), and its city pages
  // 404 or redirect — a sitemap must list only URLs that answer 200 (24 Sep 2026).
  for (const c of (mk.tag === 'sf' ? [] : cityList)) {
    urlsXml.push('<url><loc>' + base + '/condos-in-' + c.slug + '</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>');
    urlsXml.push('<url><loc>' + base + '/buy-a-condo-in-' + c.slug + '</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>');
    urlsXml.push('<url><loc>' + base + '/sell-a-condo-in-' + c.slug + '</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>');
  }
  for (const r of (rows || [])) {
    const lm = r.updated_at ? String(r.updated_at).slice(0, 10) : today;
    // No trailing slash: this must match the canonical the building page emits
    // ('/building/<slug>'). Listing the slashed form made Google crawl both,
    // file 91 pages as "alternate page with proper canonical", and split
    // impressions across two URLs on the site's highest-volume query.
    urlsXml.push('<url><loc>' + base + '/building/' + r.slug + '</loc><lastmod>' + lm + '</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>');
  }
  // Active listing detail pages (fresh — listings change often).
  for (const a of activeListings) {
    // No lastmod: stamping every URL with today's date teaches Google to ignore lastmod site-wide.
    if (a && a.mls) urlsXml.push('<url><loc>' + base + '/listing/' + a.mls + '</loc><changefreq>daily</changefreq><priority>0.6</priority></url>');
  }
  for (const n of (nbRows || [])) {
    urlsXml.push('<url><loc>' + base + '/neighborhood/' + hoodSlug(n.neighborhood) + '</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>');
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urlsXml.join('\n') + '\n</urlset>\n';
  return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=86400' } });
}

/* ----------------------- data hub: neighborhoods ------------------------ */
function hoodSlug(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function renderNeighborhoodsHub(mk) {
  const DOMAIN = 'sanfranciscocondomarket.com';
  if (mk.tag !== 'sf') {
    return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + DOMAIN + '/neighborhoods', 'Cache-Control': 'public, max-age=3600' } });
  }
  const base = 'https://www.' + DOMAIN;
  const canonical = base + '/neighborhoods';
  const updated = new Date().toISOString().slice(0, 10);
  const rows = await callReportRpc('neighborhoods_index', { p_market_domain: DOMAIN });
  const list = Array.isArray(rows) ? rows : [];

  const cards = list.map(function (n) {
    const stat = n.is_thin
      ? '<div class="nstat thin">Limited recent sales</div>'
      : '<div class="nstat">' + (money(n.median_psf) || '\u2014') + '<span>/sqft median</span></div>';
    return '<a class="ncard" href="' + base + '/neighborhood/' + hoodSlug(n.neighborhood) + '">' +
      '<div class="nname">' + esc(n.neighborhood) + '</div>' + stat +
      '<div class="nmeta">' + intc(n.building_count) + ' building' + (n.building_count == 1 ? '' : 's') +
      ' \u00b7 ' + intc(n.sales_12mo) + ' sales / 12mo</div></a>';
  }).join('');

  const itemListEls = list.map(function (n, i) {
    return { '@type': 'ListItem', position: i + 1, url: base + '/neighborhood/' + hoodSlug(n.neighborhood), name: n.neighborhood };
  });
  const jsonld = { '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'San Francisco Condo Neighborhoods', numberOfItems: list.length, itemListElement: itemListEls };

  const title = 'San Francisco Condo Market by Neighborhood';
  const desc  = 'Condo market data for ' + intc(list.length) + ' San Francisco neighborhoods\u2014median price per square foot, sales volume, and the buildings in each. Compare neighborhoods side by side.';

  const html = nbChrome(title, desc, canonical, jsonld, base,
    '<div class="hero"><div class="wrap">' +
    '<p class="kick">San Francisco · Neighborhoods</p>' +
    '<h1>San Francisco Condos by Neighborhood</h1>' +
    '<p class="lede">The condo market varies block to block. Here\u2019s every San Francisco neighborhood we catalog\u2014its median price per square foot, recent sales activity, and the buildings within it. Tap any neighborhood for the full breakdown, or compare two side by side on the intelligence page.</p>' +
    '<p class="upd">' + intc(list.length) + ' neighborhoods · updated ' + updated + '</p></div></div>' +
    '<div class="wrap"><p class="links"><a href="' + base + '/intelligence/">Compare neighborhoods \u2192</a><a href="' + base + '/san-francisco-condo-rankings">Rankings \u2192</a></p>' +
    '<div class="ngrid">' + cards + '</div>' +
    '<p class="method">Median price per square foot is computed from recorded sales over the trailing twelve months; neighborhoods with fewer than five recent sales show activity counts only, not a median. McMullen Properties LLC \u00b7 CA DRE #02016832.</p>' +
    '<div style="height:50px"></div></div>');
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
}

// Fetch a city's catalogued buildings (+ derive simple aggregates) via embedded filter.
async function fetchCityData(citySlug, hostMk) {
  try {
    // City meta
    const cRes = await fetch(SUPABASE_URL + '/rest/v1/cities?slug=eq.' + encodeURIComponent(citySlug) +
      '&select=slug,display_name,state,domain,market_status&limit=1',
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Accept': 'application/json' } });
    if (!cRes.ok) return null;
    const cArr = await cRes.json();
    if (!Array.isArray(cArr) || !cArr.length) return null;
    const city = cArr[0];

    // Buildings in the city (embedded cities.slug filter; buildings_public_select = true)
    const bRes2 = await fetch(SUPABASE_URL + '/rest/v1/buildings?select=slug,display_name,neighborhood,unit_count,year_built,hero_image_url,cities!inner(slug)&cities.slug=eq.' +
      encodeURIComponent(citySlug) + '&is_catalogued=eq.true&slug=not.like.*-eichlers&display_name=not.ilike.*eichler*&order=unit_count.desc.nullslast',
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Accept': 'application/json' } });
    let buildings = [];
    if (bRes2.ok) buildings = await bRes2.json();
    if (!Array.isArray(buildings) || !buildings.length) return null;

    // Group by neighborhood
    const byHood = {};
    let units = 0;
    buildings.forEach(function (b) {
      if (b.unit_count) units += Number(b.unit_count);
      const h = b.neighborhood || '';
      (byHood[h] = byHood[h] || []).push(b);
    });

    // Determine market for cross-domain + branding
    const mkt = (city.domain && MARKET_BY_HOST[city.domain]) ? MARKETS[MARKET_BY_HOST[city.domain]]
              : (citySlug === 'san-francisco' ? MARKETS.sf : MARKETS.sv);

    return { city: city, buildings: buildings, byHood: byHood, totalUnits: units, market: mkt };
  } catch (e) { return null; }
}

// All cities in a market that have catalogued buildings (for buy/sell hubs + footer).
async function fetchMarketCities(hostMk) {
  try {
    // Cities whose buildings are catalogued; simplest: pull catalogued buildings w/ city, aggregate.
    const res = await fetch(SUPABASE_URL + '/rest/v1/buildings?select=cities!inner(slug,display_name,domain)&is_catalogued=eq.true&slug=not.like.*-eichlers&display_name=not.ilike.*eichler*&limit=2000',
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const rows = await res.json();
    const counts = {};
    (rows || []).forEach(function (r) {
      const c = r.cities; if (!c || !c.slug) return;
      // market filter by domain
      const cMkt = (c.domain && MARKET_BY_HOST[c.domain]) ? MARKET_BY_HOST[c.domain] : (c.slug === 'san-francisco' ? 'sf' : 'sv');
      if (cMkt !== hostMk.tag) return;
      if (!counts[c.slug]) counts[c.slug] = { slug: c.slug, name: c.display_name, n: 0 };
      counts[c.slug].n++;
    });
    return Object.keys(counts).map(function (k) { return counts[k]; }).sort(function (a, b) { return b.n - a.n; });
  } catch (e) { return []; }
}


/* ── (C) RENDER FUNCTIONS — paste near renderNeighborhoodDetail() ────────── */

function renderCityPage(mk, data, intent, footerData) {
  // SF defaults; applyMarketSwaps recolors/renames for SV.
  const region   = 'San Francisco';
  const tag      = 'sf';
  const domain   = 'sanfranciscocondomarket.com';
  const brand    = 'Condo Market SF';

  const city     = data.city;
  const cityName = esc(city.display_name);
  const citySlug = esc(city.slug);
  const bldgs    = data.buildings;
  const byHood   = data.byHood;
  const nBldgs   = bldgs.length;
  const nUnits   = data.totalUnits;
  const nHoods   = Object.keys(byHood).filter(function (h) { return h; }).length;

  // Intent-specific copy
  let kicker, h1, lede, intentPath, ctaLabel, ctaHref;
  if (intent === 'buy') {
    kicker = 'Buy a condo in ' + cityName;
    h1 = 'Buy a condo in <em>' + cityName + '</em>';
    lede = 'Every condo building in ' + cityName + ', with ten years of sale history, owner tenure, and live activity \u2014 so you can buy with the full picture, not just what\u0027s listed. On Condo Market, every unit is available for the right price, listed or not.';
    intentPath = 'buy-a-condo-in-';
    ctaLabel = 'Browse active listings';
    ctaHref = '/active-listings';
  } else if (intent === 'sell') {
    kicker = 'Sell a condo in ' + cityName;
    h1 = 'Sell a condo in <em>' + cityName + '</em>';
    lede = 'Thinking of selling in ' + cityName + '? See exactly what your building has sold for, what owners are asking, and reach buyers who are searching your building by name \u2014 without listing publicly until you choose to.';
    intentPath = 'sell-a-condo-in-';
    ctaLabel = 'Calculate your payout';
    ctaHref = '/calculate-payout-from-condo-sale';
  } else {
    kicker = 'Condos in ' + cityName;
    h1 = 'Condos in <em>' + cityName + '</em>';
    lede = 'Every condominium building in ' + cityName + ' \u2014 ' + intc(nBldgs) + ' building' + (nBldgs === 1 ? '' : 's') + (nUnits ? ', ' + intc(nUnits) + ' homes' : '') + ' \u2014 with ten years of sales, owner tenure, and live market intelligence.';
    intentPath = 'condos-in-';
    ctaLabel = 'Browse active listings';
    ctaHref = '/active-listings';
  }

  // Building cards grouped by neighborhood (or flat if no hoods)
  const hoodNames = Object.keys(byHood).sort(function (a, b) {
    if (!a) return 1; if (!b) return -1; return byHood[b].length - byHood[a].length;
  });
  function bldgCard(b) {
    const img = b.hero_image_url
      ? '<img class="cl-card-img" src="' + esc(b.hero_image_url) + '" alt="' + esc(b.display_name) + '" loading="lazy" onerror="this.style.display=\'none\';">'
      : '<div class="cl-card-img cl-card-img--ph"></div>';
    const meta = [];
    if (b.unit_count != null) meta.push(intc(b.unit_count) + ' units');
    if (b.year_built != null) meta.push('Built ' + b.year_built);
    return '<a class="cl-card" href="/building/' + esc(b.slug) + '/">' + img +
      '<div class="cl-card-body"><div class="cl-card-name">' + esc(b.display_name) + '</div>' +
      (b.neighborhood ? '<div class="cl-card-hood">' + esc(b.neighborhood) + '</div>' : '') +
      (meta.length ? '<div class="cl-card-meta">' + meta.join(' \u00b7 ') + '</div>' : '') +
      '</div></a>';
  }
  let bldgSections = '';
  const realHoods = hoodNames.filter(function (h) { return h; });
  if (realHoods.length > 1) {
    bldgSections = realHoods.map(function (h) {
      return '<div class="cl-hood-group"><h3 class="cl-hood-title">' + esc(h) + ' <span class="cl-hood-count">' + byHood[h].length + '</span></h3>' +
        '<div class="cl-grid">' + byHood[h].map(bldgCard).join('') + '</div></div>';
    }).join('');
    if (byHood['']) bldgSections += '<div class="cl-hood-group"><div class="cl-grid">' + byHood[''].map(bldgCard).join('') + '</div></div>';
  } else {
    bldgSections = '<div class="cl-grid">' + bldgs.map(bldgCard).join('') + '</div>';
  }

  // Cross-intent links (buy ↔ sell ↔ browse) for this city
  const crossLinks =
    '<div class="cl-cross">' +
    (intent !== 'browse' ? '<a href="/condos-in-' + citySlug + '">All condos in ' + cityName + '</a>' : '') +
    (intent !== 'buy'    ? '<a href="/buy-a-condo-in-' + citySlug + '">Buy a condo in ' + cityName + '</a>' : '') +
    (intent !== 'sell'   ? '<a href="/sell-a-condo-in-' + citySlug + '">Sell a condo in ' + cityName + '</a>' : '') +
    '</div>';

  // SEO
  const title = (intent === 'buy' ? 'Buy a Condo in ' + cityName : intent === 'sell' ? 'Sell a Condo in ' + cityName : 'Condos in ' + cityName) +
    ' \u00b7 ' + brand;
  const metaDesc = esc(
    (intent === 'buy' ? 'Buy a condo in ' + city.display_name + ': ' : intent === 'sell' ? 'Sell a condo in ' + city.display_name + ': ' : 'Condos in ' + city.display_name + ': ') +
    intc(nBldgs) + ' buildings' + (nUnits ? ', ' + intc(nUnits) + ' homes' : '') + ', ten years of sales history, owner tenure, and live market intelligence on Condo Market.'
  );
  const canonical = 'https://www.' + domain + '/' + (intent === 'buy' ? 'buy-a-condo-in-' : intent === 'sell' ? 'sell-a-condo-in-' : 'condos-in-') + citySlug;

  // JSON-LD: CollectionPage + ItemList of buildings + breadcrumb
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': title,
    'url': canonical,
    'description': metaDesc,
    'about': { '@type': 'Place', 'name': city.display_name + ', CA' },
    'mainEntity': {
      '@type': 'ItemList',
      'numberOfItems': nBldgs,
      'itemListElement': bldgs.slice(0, 25).map(function (b, i) {
        return { '@type': 'ListItem', 'position': i + 1, 'name': b.display_name, 'url': 'https://www.' + domain + '/building/' + b.slug + '/' };
      }),
    },
  };
  const jsonLdScript = '<script type="application/ld+json">' + JSON.stringify(jsonLd).replace(/</g, '\\u003c') + '</script>';

  const CL_CSS =
    '.cl-hero{padding:48px 0 8px}' +
    '.cl-kick{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C2410C;font-weight:700;margin:0 0 10px}' +
    '.cl-h1{font-family:"Playfair Display",Georgia,serif;font-size:44px;line-height:1.08;color:#22262f;margin:0;letter-spacing:-.015em}' +
    '.cl-h1 em{font-style:italic;color:#C2410C}' +
    '.cl-lede{font-size:16px;line-height:1.6;color:#5d6575;max-width:680px;margin:18px 0 0}' +
    '.cl-stats{display:flex;gap:32px;margin:28px 0 0;flex-wrap:wrap}' +
    '.cl-stat .cl-stat-v{font-family:"Playfair Display",Georgia,serif;font-size:28px;color:#22262f;font-weight:700}' +
    '.cl-stat .cl-stat-l{font-size:12px;color:#5d6575;letter-spacing:.04em}' +
    '.cl-ctarow{display:flex;gap:14px;flex-wrap:wrap;margin:26px 0 0}' +
    '.cl-btn{display:inline-block;background:#9fb4d8;color:#ffffff;font-weight:600;font-size:14px;padding:13px 26px;border-radius:999px;text-decoration:none}' +
    '.cl-btn-ghost{display:inline-block;border:1px solid rgba(34,38,47,0.28);color:#22262f;font-weight:600;font-size:14px;padding:13px 26px;border-radius:999px;text-decoration:none}' +
    '.cl-cross{display:flex;gap:18px;flex-wrap:wrap;margin:22px 0 0}' +
    '.cl-cross a{font-size:13px;color:#C2410C;text-decoration:none;font-weight:600}' +
    '.cl-cross a:hover{text-decoration:underline}' +
    '.cl-hood-group{margin:40px 0 0}' +
    '.cl-hood-title{font-family:"Playfair Display",Georgia,serif;font-size:22px;color:#22262f;margin:0 0 16px;display:flex;align-items:center;gap:10px}' +
    '.cl-hood-count{font-size:12px;color:#C2410C;background:rgba(34,38,47,0.072);border-radius:999px;padding:2px 10px;font-family:"DM Sans",sans-serif}' +
    '.cl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}' +
    '.cl-card{display:block;background:rgba(34,38,47,0.03);border:1px solid rgba(34,38,47,0.084);border-radius:14px;overflow:hidden;text-decoration:none;transition:border-color .15s,transform .15s}' +
    '.cl-card:hover{border-color:rgba(34,38,47,0.28);transform:translateY(-2px)}' +
    '.cl-card-img{width:100%;height:150px;object-fit:cover;display:block;background:rgba(34,38,47,0.048)}' +
    '.cl-card-img--ph{background:linear-gradient(135deg,rgba(34,38,47,0.072),rgba(34,38,47,0.02))}' +
    '.cl-card-body{padding:13px 15px 15px}' +
    '.cl-card-name{font-size:15px;color:#22262f;font-weight:600}' +
    '.cl-card-hood{font-size:12px;color:#C2410C;margin-top:3px}' +
    '.cl-card-meta{font-size:12px;color:#5d6575;margin-top:6px}' +
    '.cl-about{margin:48px 0 0;max-width:720px}' +
    '.cl-about h2{font-family:"Playfair Display",Georgia,serif;font-size:26px;color:#22262f;margin:0 0 14px}' +
    '.cl-about p{font-size:15px;line-height:1.7;color:#5d6575;margin:0 0 14px}';

  const statsRow =
    '<div class="cl-stats">' +
    '<div class="cl-stat"><div class="cl-stat-v">' + intc(nBldgs) + '</div><div class="cl-stat-l">Building' + (nBldgs === 1 ? '' : 's') + '</div></div>' +
    (nUnits ? '<div class="cl-stat"><div class="cl-stat-v">' + intc(nUnits) + '</div><div class="cl-stat-l">Homes</div></div>' : '') +
    (nHoods ? '<div class="cl-stat"><div class="cl-stat-v">' + intc(nHoods) + '</div><div class="cl-stat-l">Neighborhood' + (nHoods === 1 ? '' : 's') + '</div></div>' : '') +
    '</div>';

  // Intent-tailored "about" prose (original, factual, content for SEO/AIO)
  let aboutBody;
  if (intent === 'buy') {
    aboutBody = '<p>Buying a condo in ' + cityName + ' means more than scrolling active listings. On Condo Market you can see every building in ' + cityName + ', what each has sold for over the past decade, how long owners typically hold, and where prices are moving \u2014 before you ever make an offer.</p>' +
      '<p>Because every owner on the platform can name a price whether or not they\u0027re publicly listed, the inventory you can pursue in ' + cityName + ' is far larger than what shows on the MLS. Find the building you want, and make an offer on a home that was never listed.</p>';
  } else if (intent === 'sell') {
    aboutBody = '<p>Selling a condo in ' + cityName + ' starts with knowing what your home is worth. Condo Market shows you exactly what units in your building have sold for, current asking prices, and the depth of buyer demand searching your building by name.</p>' +
      '<p>You don\u0027t have to list publicly to test the market. Set a price, reach qualified buyers privately, and only go public when it makes sense for you. See your estimated payout, then decide.</p>';
  } else {
    aboutBody = '<p>' + cityName + ' is home to ' + intc(nBldgs) + ' condominium building' + (nBldgs === 1 ? '' : 's') + (nUnits ? ' totaling roughly ' + intc(nUnits) + ' homes' : '') + (nHoods ? ' across ' + intc(nHoods) + ' neighborhoods' : '') + '. Condo Market tracks each one with ten years of sale history, owner tenure patterns, and live market activity.</p>' +
      '<p>Browse the buildings below to see per-building sales, current active listings, and price trends \u2014 or explore whether to <a href="/buy-a-condo-in-' + citySlug + '" style="color:#e85d2a">buy</a> or <a href="/sell-a-condo-in-' + citySlug + '" style="color:#e85d2a">sell</a> in ' + cityName + '.</p>';
  }

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="description" content="' + metaDesc + '">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:type" content="website">\n<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + metaDesc + '">\n<meta property="og:url" content="' + canonical + '">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">\n' +
    jsonLdScript + '\n' +
    '<style>' + CSS + '</style>\n<style>' + EXTRA_CSS + '</style>\n<style>' + CL_CSS + '</style>\n' +
    '</head>\n<body>\n' +
    CM_MASTHEAD(tag) +
    '<div class="wrap"><div class="crumb">' +
    '<a href="/">Condo Market</a><span class="sep">/</span>' +
    '<a href="/buildings/">Buildings</a><span class="sep">/</span>' + cityName +
    '</div></div>\n\n' +
    '<main><div class="wrap">' +
    '<div class="cl-hero">' +
    '<p class="cl-kick">' + esc(kicker) + '</p>' +
    '<h1 class="cl-h1">' + h1 + '</h1>' +
    '<p class="cl-lede">' + lede + '</p>' +
    statsRow +
    '<div class="cl-ctarow"><a class="cl-btn" href="' + ctaHref + '">' + ctaLabel + '</a>' +
    '<a class="cl-btn-ghost" href="/buildings/">All buildings</a></div>' +
    crossLinks +
    '</div>' +
    '<div class="cl-about"><h2>' + (intent === 'buy' ? 'Buying in ' + cityName : intent === 'sell' ? 'Selling in ' + cityName : 'About ' + cityName) + '</h2>' + aboutBody + '</div>' +
    '<section style="margin:48px 0 0"><div class="section-head"><div class="section-kicker">The buildings</div>' +
    '<h2 class="section-title">Every condo building in <em>' + cityName + '</em></h2></div>' +
    bldgSections +
    '</section>' +
    '</div></main>\n\n' +
    CM_FOOTER(footerData) +
    '</body>\n</html>';
}

// Investor Exchange — the marketplace for tenant-occupied condos.
// Region/brand/domain are written as San Francisco and swapped per market by
// applyMarketSwaps(), which is how every other page here works. The market
// slug is NOT swappable text, so it is interpolated from mk directly.
function renderInvestorExchange(mk, footerData) {
  const region = 'San Francisco';
  const tag = 'sf';
  const domain = 'sanfranciscocondomarket.com';
  const brand = 'Condo Market SF';
  const slug = (mk && mk.slug) || 'san-francisco-condo-market';

  const title = 'Investor Exchange \u00b7 ' + region + ' Rental Condo Marketplace';
  const metaDesc = esc('A marketplace to buy and sell tenant-occupied condos in ' + region +
    '. Owners publish price, rent and lease terms; investors hold an account to browse. The tenancy transfers untouched.');
  const canonical = 'https://www.' + domain + '/investor-exchange/';

  const IX_CSS =
    '.ix-wrap{padding:52px 0 12px}' +
    '.ix-kick{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C2410C;font-weight:700;margin:0 0 12px}' +
    '.ix-h1{font-family:"Playfair Display",Georgia,serif;font-size:clamp(34px,6vw,54px);color:#22262f;margin:0;letter-spacing:-.015em;line-height:1.04}' +
    '.ix-tag{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-size:clamp(19px,3vw,28px);color:#C2410C;margin:10px 0 0}' +
    '.ix-sub{max-width:60ch;color:#5d6575;margin:20px 0 0;font-size:16.5px;line-height:1.65}' +
    '.ix-cta{display:flex;gap:12px;flex-wrap:wrap;margin:30px 0 0}' +
    '.ix-btn{display:inline-block;background:#9fb4d8;color:#ffffff;border-radius:999px;padding:13px 24px;font-weight:700;text-decoration:none}' +
    '.ix-btn.ghost{background:transparent;color:#22262f;border:1px solid rgba(34,38,47,0.224)}' +
    '.ix-lock{display:grid;grid-template-columns:1fr 1.05fr;gap:36px;align-items:center;margin:46px 0 0;' +
      'border:1px solid rgba(34,38,47,0.112);border-radius:22px;padding:clamp(22px,4vw,40px);background:rgba(34,38,47,0.028)}' +
    '@media(max-width:900px){.ix-lock{grid-template-columns:1fr;gap:24px}}' +
    '.ix-count{font-family:"Playfair Display",Georgia,serif;font-size:clamp(42px,8vw,68px);line-height:1;color:#C2410C;font-variant-numeric:tabular-nums;transition:opacity .18s}' +
    '.ix-count.load{opacity:.35}' +
    '.ix-cl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5d6575;margin-top:9px;max-width:34ch;line-height:1.6}' +
    '.ix-frow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}' +
    '.ix-flab{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#5d6575;width:46px;flex:0 0 46px}' +
    '.ix-pill{background:rgba(34,38,47,0.048);border:1px solid rgba(34,38,47,0.144);color:#22262f;border-radius:999px;' +
      'padding:6px 14px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}' +
    '.ix-pill:hover{border-color:#C2410C}' +
    '.ix-pill.on{background:#9fb4d8;border-color:#C2410C;color:#ffffff}' +
    '.ix-mapf{position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(34,38,47,0.128);aspect-ratio:4/3;background:#ffffff}' +
    '@media(max-width:900px){.ix-mapf{aspect-ratio:1/1}}' +
    '.ix-map{position:absolute;inset:0;transform:scale(1.03);filter:blur(2.6px) saturate(1.05) brightness(1.5) contrast(1.1)}' +
    '.ix-veil{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,rgba(34,38,47,0.02) 0%,rgba(34,38,47,0.063) 55%,rgba(34,38,47,0.203) 92%)}' +
    '.ix-mcta{position:absolute;left:0;right:0;bottom:16px;text-align:center;pointer-events:none;' +
      'font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#5d6575}' +
    '.ix-note{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#5d6575;margin-top:10px;text-align:center}' +
    '.ix-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin:44px 0 0}' +
    '.ix-card{border:1px solid rgba(34,38,47,0.112);border-radius:16px;padding:22px}' +
    '.ix-card h3{font-family:"Playfair Display",Georgia,serif;font-size:21px;color:#22262f;margin:8px 0 8px}' +
    '.ix-card p{color:#5d6575;font-size:14.5px;line-height:1.6;margin:0}' +
    '.ix-num{font-size:11px;letter-spacing:.18em;color:#C2410C;font-weight:700}' +
    '.ix-terms{margin:44px 0 60px;border-top:1px solid rgba(34,38,47,0.112);padding-top:26px}' +
    '.ix-terms li{color:#5d6575;font-size:14.5px;line-height:1.75;margin-bottom:6px}';

  const IX_JS =
    '<script>(function(){' +
    'var SB="https://kfqphwerygccpzntbbif.supabase.co";' +
    'var KEY=' + JSON.stringify(SUPABASE_ANON_KEY) + ';' +
    'var SLUG=' + JSON.stringify(slug) + ';' +
    'var types=[],beds=null,map=null,layer=null,seq=0;' +
    'var elC=document.getElementById("ixCount"),elN=document.getElementById("ixNote"),elM=document.getElementById("ixMap");' +
    'if(!elC||!elM)return;' +
    'function rpc(fn,body){return fetch(SB+"/rest/v1/rpc/"+fn,{method:"POST",headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});}' +
    'function args(){return {p_market_slug:SLUG,p_property_types:types.length?types:null,p_min_beds:beds,p_max_price:null};}' +
    'function leaflet(cb){if(!document.querySelector(\'link[href*="leaflet.min.css"]\')){var l=document.createElement("link");l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);}' +
      'if(window.L&&window.L.map){cb();return;}var sc=document.createElement("script");sc.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";sc.onload=cb;document.head.appendChild(sc);}' +
    'function paint(cells){if(!window.L||!cells.length)return;' +
      'if(!map){var lat=0,lng=0;cells.forEach(function(c){lat+=c[0];lng+=c[1];});' +
      'map=window.L.map(elM,{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false}).setView([lat/cells.length,lng/cells.length],12.4);' +
      'window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=__CARTO_KEY__",{maxZoom:19}).addTo(map);}' +
      'if(layer)map.removeLayer(layer);layer=window.L.layerGroup().addTo(map);' +
      'var max=1;cells.forEach(function(c){if(c[2]>max)max=c[2];});' +
      'cells.forEach(function(c){var w=c[2]/max;window.L.circleMarker([c[0],c[1]],{radius:4+Math.round(w*9),stroke:false,fillColor:"#9fb4d8",fillOpacity:0.44+w*0.44}).addTo(layer);});}' +
    'function refresh(){var mine=++seq;elC.className="ix-count load";' +
      'Promise.all([rpc("exchange_research_count",args()),rpc("exchange_research_density",args())]).then(function(r){' +
      'if(mine!==seq)return;elC.className="ix-count";' +
      'elC.textContent=(r[0]==null?"\\u2014":Number(r[0]).toLocaleString("en-US"));' +
      'if(r[1]&&r[1].cells){leaflet(function(){paint(r[1].cells);});' +
      'if(elN)elN.textContent=r[1].cells.length?("Density preview \\u00b7 "+r[1].cells.length+" clusters \\u00b7 addresses withheld"):"No matches in that shape";}' +
      '}).catch(function(){elC.className="ix-count";});}' +
    'Array.prototype.forEach.call(document.querySelectorAll(".ix-pill[data-type]"),function(b){b.addEventListener("click",function(){' +
      'var v=b.getAttribute("data-type").split(","),on=b.className.indexOf("on")>-1;' +
      'v.forEach(function(x){var i=types.indexOf(x);if(on){if(i>=0)types.splice(i,1);}else if(i<0){types.push(x);}});' +
      'b.className="ix-pill"+(on?"":" on");refresh();});});' +
    'Array.prototype.forEach.call(document.querySelectorAll(".ix-pill[data-beds]"),function(b){b.addEventListener("click",function(){' +
      'Array.prototype.forEach.call(document.querySelectorAll(".ix-pill[data-beds]"),function(x){x.className="ix-pill";});' +
      'b.className="ix-pill on";var v=b.getAttribute("data-beds");beds=v?parseInt(v,10):null;refresh();});});' +
    'refresh();})();</script>';

  const body =
    '<main><div class="wrap">' +

    '<div class="ix-wrap">' +
      '<p class="ix-kick">Investor Exchange \u00b7 ' + region + '</p>' +
      '<h1 class="ix-h1">Investor Exchange</h1>' +
      '<p class="ix-tag">A marketplace to buy &amp; sell rental condos.</p>' +
      '<p class="ix-sub">A tenant in place is an asset to the right buyer and an obstacle to everyone else. ' +
        'The Exchange puts the two sides in one room: owners who would sell at the right number, and investors ' +
        'who buy occupied property on purpose. <strong>No showings, no vacancy, no termination notice.</strong></p>' +
      '<div class="ix-cta">' +
        '<a class="ix-btn" href="#signin" data-cm-auth="login">List a rental you\u2019d sell \u2192</a>' +
        '<a class="ix-btn ghost" href="#signin" data-cm-auth="login">Create an investor account</a>' +
      '</div>' +
    '</div>' +

    '<div class="ix-lock">' +
      '<div>' +
        '<p class="ix-kick">Members only</p>' +
        '<div class="ix-count" id="ixCount">&mdash;</div>' +
        '<div class="ix-cl">' + region + ' condos matching \u00b7 public records suggest not owner-occupied</div>' +
        '<div class="ix-frow"><span class="ix-flab">Type</span>' +
          '<button class="ix-pill" data-type="Condominium,Townhouse">Condo</button>' +
          '<button class="ix-pill" data-type="Single Family">House</button>' +
          '<button class="ix-pill" data-type="Multi-family">Multi-family</button></div>' +
        '<div class="ix-frow"><span class="ix-flab">Beds</span>' +
          '<button class="ix-pill on" data-beds="">Any</button>' +
          '<button class="ix-pill" data-beds="1">1+</button>' +
          '<button class="ix-pill" data-beds="2">2+</button>' +
          '<button class="ix-pill" data-beds="3">3+</button></div>' +
        '<div class="ix-cta"><a class="ix-btn" href="#signin" data-cm-auth="login">Unlock the map \u2192</a></div>' +
        '<p class="ix-sub" style="font-size:13px;margin-top:14px">Free account. The signal is an inference from ' +
          'public records \u2014 it also catches second homes, trusts and estates. It is not a statement that any of ' +
          'them is for sale, and owner names are never shown.</p>' +
      '</div>' +
      '<div>' +
        '<div class="ix-mapf"><div id="ixMap" class="ix-map"></div><div class="ix-veil"></div>' +
          '<div class="ix-mcta">\uD83D\uDD12 Members see exact addresses</div></div>' +
        '<div class="ix-note" id="ixNote">Density preview \u00b7 addresses withheld</div>' +
      '</div>' +
    '</div>' +

    '<div class="ix-cards">' +
      '<div class="ix-card"><div class="ix-num">01</div><h3>You state the facts</h3>' +
        '<p>Address, asking price, current rent, lease remaining, photos. Your figures, published as stated by you.</p></div>' +
      '<div class="ix-card"><div class="ix-num">02</div><h3>Tim reviews it</h3>' +
        '<p>He adds an opinion of value and positioning, signed in his own name and licence \u2014 never something the platform computes.</p></div>' +
      '<div class="ix-card"><div class="ix-num">03</div><h3>It goes live</h3>' +
        '<p>Only to account-holding investors in this market. You can withdraw at any point before a purchase agreement is signed.</p></div>' +
      '<div class="ix-card"><div class="ix-num">04</div><h3>An investor writes</h3>' +
        '<p>Offers reach you through Tim. If you\u2019re exchanging, he refers a qualified intermediary and an agent in the market you\u2019re buying into.</p></div>' +
    '</div>' +

    '<div class="ix-terms">' +
      '<p class="ix-kick">Terms, stated plainly</p>' +
      '<ul>' +
        '<li>Listing on the Exchange is not a listing agreement. No fee to publish, no obligation to sell.</li>' +
        '<li>If a pairing closes, a 3% transaction fee applies. Tim McMullen handles the transaction as agent of record.</li>' +
        '<li>Exchanging into another property: he refers a qualified intermediary for the 1031 and a commercial agent in whatever market you\u2019re buying into.</li>' +
        '<li>The 1031 material on this site is general education. Whether a specific exchange qualifies, and what a deadline means for your transaction, is a question for your intermediary and your CPA.</li>' +
        '<li>A buyer takes title subject to the lease in place. Nothing here changes your tenant\u2019s rights.</li>' +
      '</ul>' +
    '</div>' +

    '</div></main>';

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<meta name="description" content="' + metaDesc + '">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + metaDesc + '"><meta property="og:url" content="' + canonical + '">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">\n' +
    '<style>' + CSS + '</style>\n<style>' + EXTRA_CSS + '</style>\n<style>' + IX_CSS + '</style>\n' +
    '</head>\n<body>\n' +
    CM_MASTHEAD(tag) +
    '<div class="wrap"><div class="crumb"><a href="/">Condo Market</a><span class="sep">/</span>Investor Exchange</div></div>\n' +
    body +
    CM_FOOTER(footerData) +
    IX_JS +
    '\n</body>\n</html>';
}

function renderBuySellHub(mk, cities, intent, footerData) {
  const region = 'San Francisco';
  const tag    = 'sf';
  const domain = 'sanfranciscocondomarket.com';
  const brand  = 'Condo Market SF';
  const verb   = (intent === 'buy') ? 'Buy' : 'Sell';
  const pathPre = (intent === 'buy') ? 'buy-a-condo-in-' : 'sell-a-condo-in-';

  const cityCards = (cities || []).map(function (c) {
    return '<a class="cl-card" href="/' + pathPre + esc(c.slug) + '" style="padding:18px 20px;display:flex;justify-content:space-between;align-items:center;">' +
      '<span class="cl-card-name">' + esc(c.name) + '</span>' +
      '<span class="cl-card-meta">' + c.n + ' building' + (c.n === 1 ? '' : 's') + ' \u2192</span></a>';
  }).join('');

  const title = verb + ' a Condo in ' + region + ' \u00b7 ' + brand;
  const metaDesc = esc(verb + ' a condo anywhere in the ' + region + ' market. Browse every city and building with ten years of sales, owner tenure, and live market intelligence on Condo Market.');
  const canonical = 'https://www.' + domain + '/' + (intent === 'buy' ? 'buy' : 'sell');

  const HUB_CSS =
    '.cl-hero{padding:48px 0 8px}' +
    '.cl-kick{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C2410C;font-weight:700;margin:0 0 10px}' +
    '.cl-h1{font-family:"Playfair Display",Georgia,serif;font-size:44px;color:#22262f;margin:0;letter-spacing:-.015em}' +
    '.cl-h1 em{font-style:italic;color:#C2410C}' +
    '.cl-lede{font-size:16px;line-height:1.6;color:#5d6575;max-width:680px;margin:18px 0 0}' +
    '.cl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin:36px 0 0}' +
    '.cl-card{background:rgba(34,38,47,0.03);border:1px solid rgba(34,38,47,0.084);border-radius:14px;text-decoration:none;transition:border-color .15s}' +
    '.cl-card:hover{border-color:rgba(34,38,47,0.28)}' +
    '.cl-card-name{font-size:16px;color:#22262f;font-weight:600}' +
    '.cl-card-meta{font-size:12px;color:#C2410C}';

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<meta name="description" content="' + metaDesc + '">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + metaDesc + '"><meta property="og:url" content="' + canonical + '">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">\n' +
    '<style>' + CSS + '</style>\n<style>' + EXTRA_CSS + '</style>\n<style>' + HUB_CSS + '</style>\n' +
    '</head>\n<body>\n' +
    CM_MASTHEAD(tag) +
    '<div class="wrap"><div class="crumb"><a href="/">Condo Market</a><span class="sep">/</span>' + verb + '</div></div>\n' +
    '<main><div class="wrap"><div class="cl-hero">' +
    '<p class="cl-kick">' + verb + ' a condo</p>' +
    '<h1 class="cl-h1">' + verb + ' a condo in <em>' + region + '</em></h1>' +
    '<p class="cl-lede">Choose your city to see every building, ten years of sales, and live market intelligence \u2014 then ' + (intent === 'buy' ? 'make an offer on any unit, listed or not' : 'see what your home is worth and reach buyers privately') + '.</p>' +
    '<div class="cl-grid">' + cityCards + '</div>' +
    '</div></div></main>\n' +
    CM_FOOTER(footerData) +
    '</body>\n</html>';
}


async function renderNeighborhoodDetail(mk, rawSlug) {
  const DOMAIN = 'sanfranciscocondomarket.com';
  if (mk.tag !== 'sf') {
    return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + DOMAIN + '/neighborhoods', 'Cache-Control': 'public, max-age=3600' } });
  }
  const base = 'https://www.' + DOMAIN;
  const slug = hoodSlug(rawSlug);

  // Resolve slug -> canonical neighborhood name via the index.
  const idx = await callReportRpc('neighborhoods_index', { p_market_domain: DOMAIN });
  const match = (Array.isArray(idx) ? idx : []).find(function (n) { return hoodSlug(n.neighborhood) === slug; });
  if (!match) {
    return new Response(null, { status: 302, headers: { 'Location': base + '/neighborhoods' } });
  }
  const hood = match.neighborhood;
  const canonical = base + '/neighborhood/' + slug;
  const updated = new Date().toISOString().slice(0, 10);

  const [detRows, bldRows] = await Promise.all([
    callReportRpc('neighborhood_detail', { p_market_domain: DOMAIN, p_neighborhood: hood }),
    callReportRpc('neighborhood_buildings', { p_market_domain: DOMAIN, p_neighborhood: hood }),
  ]);
  const d = (detRows && detRows[0]) ? detRows[0] : {};
  const blds = Array.isArray(bldRows) ? bldRows : [];

  const dPsf  = pctDelta(d.cur_median_psf, d.prior_median_psf);
  const dPrice = pctDelta(d.cur_median_price, d.prior_median_price);

  // stat cards: full mode vs honest thin mode
  let statBlock;
  if (d.is_thin) {
    statBlock = '<div class="thinnote"><strong>' + esc(hood) + '</strong> has ' + intc(d.building_count) +
      ' cataloged building' + (d.building_count == 1 ? '' : 's') + ' and ' + intc(d.cur_sales) +
      ' recorded sale' + (d.cur_sales == 1 ? '' : 's') + ' in the past year\u2014too few for a reliable median. ' +
      'See the buildings below, or the citywide stats for context.</div>';
  } else {
    const c = function (label, val, dd, inv) {
      return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-val">' + (val || '\u2014') +
        '</div><div class="stat-sub">' + (dd != null ? deltaSpan(dd, inv) + ' YoY' : '') + '</div></div>';
    };
    statBlock = '<div class="grid">' +
      c('Median $/Sq Ft', money(d.cur_median_psf), dPsf, false) +
      c('Median Price', money(d.cur_median_price), dPrice, false) +
      '<div class="stat"><div class="stat-label">Sales / 12mo</div><div class="stat-val">' + intc(d.cur_sales) +
      '</div><div class="stat-sub">' + intc(d.building_count) + ' buildings</div></div></div>';
  }

  const bRows = blds.map(function (b) {
    const psf = b.median_psf ? money(b.median_psf) : '\u2014';
    return '<tr><td><a href="' + base + '/building/' + esc(b.slug) + '/">' + esc(b.display_name) + '</a></td>' +
      '<td class="num">' + (b.year_built || '\u2014') + '</td><td class="num">' + (b.unit_count ? intc(b.unit_count) : '\u2014') +
      '</td><td class="num">' + psf + '</td></tr>';
  }).join('');

  const jsonld = { '@context': 'https://schema.org', '@type': 'Dataset',
    name: hood + ' San Francisco Condo Market', url: canonical, dateModified: updated,
    creator: { '@type': 'RealEstateAgent', name: 'McMullen Properties LLC' } };

  const title = hood + ' Condos \u2014 Market Data, Prices & Buildings | San Francisco';
  const desc  = (d.is_thin
    ? hood + ' San Francisco condo buildings and recent sales activity.'
    : hood + ' San Francisco condos: median ' + (money(d.cur_median_psf) || '') + '/sqft across ' +
      intc(d.building_count) + ' buildings, ' + intc(d.cur_sales) + ' recent sales. Year built, size, and price per building.');

  const body =
    '<div class="hero"><div class="wrap">' +
    '<p class="kick"><a href="' + base + '/neighborhoods" style="color:inherit;text-decoration:none">San Francisco Neighborhoods</a> · ' + esc(hood) + '</p>' +
    '<h1>' + esc(hood) + ' Condo Market</h1>' +
    '<p class="lede">Recorded sales, pricing, and the cataloged condo buildings in ' + esc(hood) + ', San Francisco\u2014measured over the trailing twelve months.</p>' +
    '<p class="upd">Updated ' + updated + '</p></div></div>' +
    '<div class="wrap">' + statBlock +
    '<section><h2>Buildings in ' + esc(hood) + '</h2>' +
    '<table><thead><tr><th>Building</th><th class="num">Built</th><th class="num">Units</th><th class="num">Median $/sqft</th></tr></thead><tbody>' +
    (bRows || '<tr><td colspan="4">No cataloged buildings.</td></tr>') + '</tbody></table></section>' +
    '<p class="links"><a href="' + base + '/neighborhoods">\u2190 All neighborhoods</a><a href="' + base + '/intelligence/">Compare neighborhoods \u2192</a></p>' +
    '<p class="method">Per-building price per square foot is the median of recorded sales over the trailing twelve months, shown where sales exist. Neighborhood medians are suppressed below five recent sales. McMullen Properties LLC \u00b7 CA DRE #02016832.</p>' +
    '<div style="height:50px"></div></div>';

  const html = nbChrome(title, desc, canonical, jsonld, base, body);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
}

/* ---------------------------------------------------------------------------
   LOCAL NEWS. Articles and monthly market reports are written and published on
   the city platform's desk; this site only renders them. The markdown subset is
   the city worker's newsInline/newsBlockHtml, carried over unchanged so an
   article reads the same on every site that shows it.
--------------------------------------------------------------------------- */
const CM_NEWS_MEDIA = SB_A_URL + '/storage/v1/object/public/news/';
const cmNewsMedia = p => /^https?:\/\//i.test(String(p || '')) ? String(p) : CM_NEWS_MEDIA + p;

async function aNewsRpc(name, body) {
  try {
    const res = await fetch(SB_A_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': SB_A_KEY, 'Authorization': 'Bearer ' + SB_A_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return await res.json();
  } catch (e) { /* fall through */ }
  return null;
}
function cmNewsInline(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, h) => /^\//.test(h)
      ? '<a href="' + h + '">' + t + '</a>'
      : '<a href="' + h + '" rel="nofollow noopener" target="_blank">' + t + '</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function cmNewsBlocks(md) {
  return String(md || '').replace(/\r/g, '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
}
/* [[payment price=... rate=... asof=...]] becomes a payment calculator, the same
   block the city platform renders, so one article body works on either site. */
function cmPaymentCalcHtml(attrs) {
  const n = k => { const m = attrs.match(new RegExp(k + '=([0-9.]+)')); return m ? Number(m[1]) : null; };
  const price = n('price'), rate = n('rate') || 6.9, down = n('down') || 20;
  if (!price) return '';
  const asof = (attrs.match(/asof=([0-9-]+)/) || [])[1] || '';
  const id = 'pc' + Math.random().toString(36).slice(2, 8);
  return `<div class="nw-calc" id="${id}">
    <div class="nw-calc-h">What it would cost a month</div>
    <div class="nw-calc-grid">
      <label>Price <input type="number" data-f="price" value="${price}" step="5000"></label>
      <label>Down payment <span class="nw-dp"></span> <input type="range" data-f="down" min="0" max="50" step="5" value="${down}"></label>
      <label>Rate % <input type="number" data-f="rate" value="${rate}" step="0.05"></label>
      <label>Term <select data-f="term"><option value="30">30 years</option><option value="15">15 years</option></select></label>
    </div>
    <div class="nw-calc-out"><b class="nw-pay"></b><span class="nw-calc-sub"></span></div>
    <p class="nw-calc-note">Principal and interest only, on the ${rate}% average 30-year rate${asof ? ' published ' + asof : ''} (Freddie Mac). Property taxes, insurance and homeowners' dues are on top, and your own rate will depend on your lender, credit and deposit.</p>
  </div>
  <script>(function(){var r=document.getElementById('${id}');if(!r)return;
    var f=function(k){var e=r.querySelector('[data-f='+k+']');return e?Number(e.value):0};
    var usd=function(v){return '$'+Math.round(v).toLocaleString('en-US')};
    function calc(){var p=f('price'),d=f('down'),rt=f('rate')/100/12,t=f('term')*12,L=p*(1-d/100);
      var m=rt>0?L*rt/(1-Math.pow(1+rt,-t)):L/t;
      r.querySelector('.nw-dp').textContent=d+'% ('+usd(p*d/100)+')';
      r.querySelector('.nw-pay').textContent=usd(m)+' a month';
      r.querySelector('.nw-calc-sub').textContent=usd(L)+' borrowed over '+f('term')+' years';}
    r.querySelectorAll('input,select').forEach(function(e){e.addEventListener('input',calc)});calc();})();</script>`;
}
function cmNewsBlockHtml(b) {
  const pay = b.match(/^\[\[payment\s+([^\]]+)\]\]$/);
  if (pay) return cmPaymentCalcHtml(pay[1]);
  if (/^\|/.test(b)) {
    const rows = b.split('\n').filter(r => r.trim() && !/^\|[\s:|-]+\|$/.test(r.trim()));
    const cells = rows.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    if (!cells.length) return '';
    return '<div class="nw-tblw"><table><thead><tr>'
      + cells[0].map(c => '<th>' + cmNewsInline(c) + '</th>').join('')
      + '</tr></thead><tbody>'
      + cells.slice(1).map(r => '<tr>' + r.map(c => '<td>' + cmNewsInline(c) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table></div>';
  }
  if (/^###\s/.test(b))   return '<h3>' + cmNewsInline(b.replace(/^###\s/, '')) + '</h3>';
  if (/^##\s/.test(b))    return '<h2>' + cmNewsInline(b.replace(/^##\s/, '')) + '</h2>';
  if (/^>\s?/.test(b))    return '<blockquote>' + cmNewsInline(b.replace(/^>\s?/gm, '')) + '</blockquote>';
  if (/^[-*]\s/.test(b))  return '<ul>' + b.split('\n').map(l => '<li>' + cmNewsInline(l.replace(/^[-*]\s/, '')) + '</li>').join('') + '</ul>';
  if (/^\d+\.\s/.test(b)) return '<ol>' + b.split('\n').map(l => '<li>' + cmNewsInline(l.replace(/^\d+\.\s+/, '')) + '</li>').join('') + '</ol>';
  if (/^---+$/.test(b))   return '<hr>';
  return '<p>' + cmNewsInline(b).replace(/\n/g, '<br>') + '</p>';
}
function cmNewsDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' }); }
  catch (e) { return String(iso).slice(0, 10); }
}
const CM_NEWS_CSS = '<style>' +
'.nw-list{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;padding:26px 0 40px}@media(max-width:760px){.nw-list{grid-template-columns:1fr}}' +
'.nw-card{display:block;border:1px solid rgba(194,65,12,.16);border-radius:12px;overflow:hidden;text-decoration:none;color:#22262f;transition:border-color .15s}.nw-card:hover{border-color:#C2410C}' +
'.nw-card .ph img{display:block;width:100%;height:190px;object-fit:cover}.nw-card .bd{padding:16px 18px}' +
'.nw-kind{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#C2410C}' +
'.nw-card h2{font-family:"Playfair Display",serif;font-size:20px;line-height:1.25;margin:6px 0 8px}.nw-card p{color:#5d6575;font-size:14.5px;margin:0}' +
'.nw-meta{font-size:12.5px;color:#5d6575;margin-top:10px}' +
'.nw-empty{border:1px solid rgba(194,65,12,.16);border-radius:12px;padding:22px;color:#5d6575;margin:28px 0 40px}' +
'.nw-art{max-width:720px;margin:0 auto;padding:40px 0 60px}' +
'.nw-crumb{font-size:13px;color:#5d6575;margin-bottom:14px}.nw-crumb a{color:#5d6575;text-decoration:none}.nw-crumb a:hover{color:#c2410c}' +
'.nw-dek{font-size:18px;color:#5d6575;margin:0 0 14px}.nw-by{font-size:13px;color:#5d6575;margin-bottom:26px}' +
'.nw-hero{margin:0 0 26px}.nw-hero img{width:100%;border-radius:12px;display:block}.nw-hero figcaption,.nw-fig figcaption{font-size:12.5px;color:#5d6575;margin-top:8px}' +
'.nw-fig{margin:10px 0 24px}.nw-fig img{width:100%;border-radius:10px;display:block}' +
'.nw-body{font-size:17px;line-height:1.7}.nw-body p{margin:0 0 18px}' +
'.nw-body h2{font-family:"Playfair Display",serif;font-size:25px;margin:36px 0 12px}.nw-body h3{font-size:19px;margin:28px 0 10px}' +
'.nw-body a{color:#c2410c}.nw-body ul,.nw-body ol{margin:0 0 18px 22px}.nw-body li{margin-bottom:6px}' +
'.nw-body blockquote{border-left:3px solid #C2410C;padding-left:16px;margin:0 0 18px;color:#5d6575}' +
'.nw-body hr{border:0;border-top:1px solid rgba(194,65,12,.16);margin:28px 0}' +
'.nw-tblw{overflow-x:auto;margin:0 0 22px}.nw-calc{border:1px solid #e0e5ed;border-radius:12px;padding:18px 20px;margin:0 0 24px;background:#fff}.nw-calc-h{font:600 12px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#5d6575;margin-bottom:12px}.nw-calc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px 18px}.nw-calc-grid label{display:block;font-size:13px;font-weight:600}.nw-calc-grid input,.nw-calc-grid select{width:100%;margin-top:4px;padding:8px 10px;border:1px solid #e0e5ed;border-radius:7px;font:inherit;font-size:15px;background:#fff}.nw-calc-grid input[type=range]{padding:0}.nw-calc-out{margin-top:16px;padding-top:14px;border-top:1px solid #e0e5ed;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline}.nw-pay{font:700 26px/1.2 Georgia,serif}.nw-calc-sub{font-size:13px;color:#5d6575}.nw-calc-note{font-size:12.5px;line-height:1.6;color:#5d6575;margin:12px 0 0}@media(max-width:620px){.nw-calc-grid{grid-template-columns:1fr}}.nw-body table{font-size:15px}.nw-body th{white-space:nowrap}' +
'.nw-src{margin-top:30px;padding:16px 18px;border:1px solid rgba(194,65,12,.16);border-radius:12px;font-size:14px;color:#5d6575}.nw-src b{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#5d6575;margin-bottom:8px}.nw-src a{color:#c2410c}' +
'.nw-share{display:flex;gap:9px;flex-wrap:wrap;margin-top:24px}.nw-share a{font-size:13px;padding:8px 14px;border:1px solid rgba(194,65,12,.16);border-radius:99px;text-decoration:none;color:#22262f}.nw-share a:hover{border-color:#C2410C}' +
'.nw-legal{font-size:12.5px;color:#5d6575;margin-top:30px}' +
'</style>';

async function renderCondoNewsIndex(mk) {
  const marketId = A_MARKET_ID_BY_TAG[mk.tag] || 5;
  const base = 'https://www.' + mk.domain;
  const canonical = base + '/news/';
  const data = await aNewsRpc('get_news_index', { p_market_id: marketId, p_limit: 30, p_offset: 0 });
  const arts = (data && data.ok && Array.isArray(data.articles)) ? data.articles : [];
  const title = mk.region + ' condo news & monthly market reports \u2014 ' + mk.brand;
  const desc = 'What is moving the ' + mk.region + ' condo market: recorded sales, building by building, and a monthly report with the sample behind every number.';
  const cards = arts.map(a => {
    const img = a.hero_path ? '<div class="ph"><img src="' + attr(cmNewsMedia(a.hero_path)) + '" alt="' + attr(a.hero_alt || a.headline) + '" loading="lazy"></div>' : '';
    return '<a class="nw-card" href="' + base + '/news/' + attr(a.slug) + '/">' + img + '<div class="bd">' +
      '<div class="nw-kind">' + (a.kind === 'market_review' ? 'Monthly market report' : 'Local news') + '</div>' +
      '<h2>' + esc(a.headline) + '</h2>' + (a.dek ? '<p>' + esc(a.dek) + '</p>' : '') +
      '<div class="nw-meta">' + esc(cmNewsDate(a.published_at)) + (a.word_count ? ' \u00b7 ' + Math.max(1, Math.round(a.word_count / 220)) + ' min read' : '') + '</div>' +
      '</div></a>';
  }).join('');
  const jsonld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: canonical, description: desc,
    hasPart: arts.slice(0, 20).map(a => ({ '@type': 'NewsArticle', headline: a.headline, url: base + '/news/' + a.slug + '/', datePublished: a.published_at })) };
  const body = CM_NEWS_CSS +
    '<div class="hero"><div class="wrap"><p class="kick">' + esc(mk.region) + ' \u00b7 Local news</p>' +
    '<h1>' + esc(mk.region) + ' condo news</h1>' +
    '<p class="lede">What actually moved the market, from the recorded sales. A monthly report on the first of every month, and coverage of anything notable in between.</p></div></div>' +
    '<div class="wrap">' + (cards ? '<div class="nw-list">' + cards + '</div>'
      : '<div class="nw-empty">No articles are published here yet. The monthly report for the month just ended goes up in the first days of each month.</div>') + '</div>';
  const html = nbChrome(title, desc, canonical, jsonld, base, body);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=900' } });
}

async function renderCondoNewsArticle(mk, slug) {
  const marketId = A_MARKET_ID_BY_TAG[mk.tag] || 5;
  const base = 'https://www.' + mk.domain;
  const data = await aNewsRpc('get_news_article', { p_market_id: marketId, p_slug: slug });
  if (!data || !data.ok || !data.article) {
    const body = CM_NEWS_CSS + '<div class="wrap"><div class="nw-art"><p class="nw-crumb"><a href="' + base + '/news/">News</a></p>' +
      '<h1>That article isn\u2019t here</h1><p class="nw-dek">It may have been moved or taken down. <a style="color:#e85d2a" href="' + base + '/news/">See all ' + esc(mk.region) + ' news</a>.</p></div></div>';
    return new Response(nbChrome('Not found \u2014 ' + mk.brand, 'Article not found.', base + '/news/', {}, base, body),
      { status: 404, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=60' } });
  }
  const a = data.article;
  const canonical = base + '/news/' + a.slug + '/';
  const imgs = Array.isArray(data.images) ? data.images : [];
  const blocks = cmNewsBlocks(a.body_md);
  let bodyHtml = '';
  blocks.forEach((b, i) => {
    bodyHtml += cmNewsBlockHtml(b);
    imgs.filter(im => Number(im.after_block) === i + 1).forEach(im => {
      bodyHtml += '<figure class="nw-fig"><img src="' + attr(cmNewsMedia(im.storage_path)) + '" alt="' + attr(im.alt || im.caption || '') + '" loading="lazy">' +
        (im.caption ? '<figcaption>' + esc(im.caption) + '</figcaption>' : '') + '</figure>';
    });
  });
  imgs.filter(im => Number(im.after_block) > blocks.length).forEach(im => {
    bodyHtml += '<figure class="nw-fig"><img src="' + attr(cmNewsMedia(im.storage_path)) + '" alt="' + attr(im.alt || im.caption || '') + '" loading="lazy">' +
      (im.caption ? '<figcaption>' + esc(im.caption) + '</figcaption>' : '') + '</figure>';
  });
  const hero = a.hero_path ? '<figure class="nw-hero"><img src="' + attr(cmNewsMedia(a.hero_path)) + '" alt="' + attr(a.hero_alt || a.headline) + '">' +
    (a.hero_caption ? '<figcaption>' + esc(a.hero_caption) + '</figcaption>' : '') + '</figure>' : '';
  const au = a.author || {};
  const sources = (a.sources || []).filter(x => x && x.url);
  const src = sources.length ? '<div class="nw-src"><b>What this piece is reacting to</b><ul>' +
    sources.map(x => '<li><a href="' + attr(x.url) + '" target="_blank" rel="nofollow noopener">' + esc(x.title || x.url) + '</a>' + (x.publisher ? ' \u00b7 ' + esc(x.publisher) : '') + '</li>').join('') + '</ul></div>' : '';
  const shareText = a.share_text || a.headline;
  const share = '<div class="nw-share">' +
    '<a href="https://x.com/intent/post?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(canonical) + '" target="_blank" rel="noopener">Share on X</a>' +
    '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(canonical) + '" target="_blank" rel="noopener">Facebook</a>' +
    '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(canonical) + '" target="_blank" rel="noopener">LinkedIn</a></div>';
  const title = a.meta_title || a.headline;
  const desc = a.meta_description || a.dek || '';
  const jsonld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: a.headline, description: desc, url: canonical,
    datePublished: a.published_at, dateModified: a.updated_at || a.published_at,
    image: a.hero_path ? [cmNewsMedia(a.hero_path)] : undefined,
    author: au.name ? { '@type': 'Person', name: au.name } : undefined,
    publisher: { '@type': 'Organization', name: mk.brand } };
  const body = CM_NEWS_CSS + '<div class="wrap"><article class="nw-art">' +
    '<p class="nw-crumb"><a href="' + base + '/">' + esc(mk.brand) + '</a> \u203a <a href="' + base + '/news/">News</a></p>' +
    '<h1>' + esc(a.headline) + '</h1>' + (a.dek ? '<p class="nw-dek">' + esc(a.dek) + '</p>' : '') +
    '<div class="nw-by">' + (au.name ? 'By ' + esc(au.name) + ' \u00b7 ' : '') + esc(cmNewsDate(a.published_at)) + '</div>' +
    hero + '<div class="nw-body">' + bodyHtml + '</div>' + src + share +
    '<p class="nw-legal">' + (au.name ? esc(au.name) + (au.dre ? ', CA DRE #' + esc(au.dre) : '') + '. ' : '') +
      (au.brokerage ? 'Real estate services provided by ' + esc(au.brokerage) + (au.brokerage_dre ? ', CA DRE #' + esc(au.brokerage_dre) : '') + '. ' : '') +
      'Figures are from recorded sales; nothing here is an opinion of the value of any home.</p>' +
    '</article></div>';
  const html = nbChrome(title, desc, canonical, jsonld, base, body);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=900' } });
}

// shared chrome for neighborhood pages (header/nav/styles)
function nbChrome(title, desc, canonical, jsonld, base, body) {
  return '<!doctype html><html lang="en"><head>' +
'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + esc(title) + '</title><meta name="description" content="' + attr(desc) + '">' +
'<link rel="canonical" href="' + canonical + '">' +
'<meta property="og:title" content="' + attr(title) + '"><meta property="og:description" content="' + attr(desc) + '">' +
'<meta property="og:url" content="' + canonical + '"><meta property="og:type" content="website">' +
'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
'<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
'<script type="application/ld+json">' + JSON.stringify(jsonld) + '</script>' +
'<style>' +
':root{--dark:#f5f7fa;--orange:#C2410C;--orange-bright:#e85d2a;--ivory:#22262f;--dim:#5d6575;--line:#e0e5ed;--up:#2f6b40;--down:#b4532a}' +
'*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#22262f;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6}' +
'.wrap{max-width:1040px;margin:0 auto;padding:0 24px}' +
'header.cm{border-bottom:1px solid rgba(194,65,12,.16);background:#12151d}header.cm .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}' +
'.wm{font-family:"Playfair Display",serif;font-style:italic;font-size:21px;color:#e8e3d8;text-decoration:none}.wm b{color:#e85d2a;font-style:normal;font-weight:700}' +
'.nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:0 22px;min-width:0}' +
'.nav a{color:#8893a6;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-left:0}.nav a:hover{color:#e85d2a}' +
'@media(max-width:720px){header.cm .wrap{height:auto;flex-wrap:wrap;gap:10px;padding-top:12px;padding-bottom:12px}.nav{gap:6px 14px;justify-content:flex-start;width:100%}}' +
'.hero{padding:56px 0 28px;border-bottom:1px solid rgba(194,65,12,.16)}' +
'.kick{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#C2410C;margin:0 0 14px}' +
'h1{font-family:"Playfair Display",serif;font-weight:700;font-size:clamp(28px,5vw,44px);line-height:1.1;margin:0 0 16px}' +
'.lede{font-size:17px;color:#5d6575;max-width:700px;margin:0}.upd{font-size:12px;color:#5d6575;margin-top:16px}' +
'.links{padding:22px 0}.links a{color:#c2410c;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(194,65,12,.16);margin-right:22px;font-size:14px}' +
'.ngrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:14px 0 30px}@media(max-width:820px){.ngrid{grid-template-columns:repeat(2,1fr)}}@media(max-width:540px){.ngrid{grid-template-columns:1fr}}' +
'.ncard{display:block;border:1px solid rgba(194,65,12,.16);border-radius:12px;padding:18px;text-decoration:none;transition:border-color .15s}.ncard:hover{border-color:#C2410C}' +
'.nname{font-family:"Playfair Display",serif;font-size:20px;font-weight:700;color:#22262f}' +
'.nstat{font-size:22px;font-weight:700;color:#c2410c;margin-top:8px;font-variant-numeric:tabular-nums}.nstat span{font-size:12px;color:#5d6575;font-weight:500;margin-left:4px}.nstat.thin{font-size:14px;color:#5d6575;font-weight:600}' +
'.nmeta{font-size:12.5px;color:#5d6575;margin-top:6px}' +
'.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:34px 0}@media(max-width:720px){.grid{grid-template-columns:1fr}}' +
'.stat{border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px}.stat-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5d6575;font-weight:700;margin-bottom:10px}' +
'.stat-val{font-family:"Playfair Display",serif;font-size:32px;font-weight:700;font-variant-numeric:tabular-nums}.stat-sub{font-size:13px;color:#5d6575;margin-top:8px}' +
'.d{font-weight:700}.d.up{color:#2f6b40}.d.down{color:#b4532a}.d.flat{color:#5d6575}' +
'.thinnote{border:1px solid rgba(194,65,12,.16);border-radius:12px;padding:20px;color:#5d6575;font-size:15px;margin:30px 0}' +
'section{padding:18px 0 10px;border-top:1px solid rgba(194,65,12,.16)}h2{font-family:"Playfair Display",serif;font-size:23px;font-weight:700;margin:24px 0 16px}' +
'table{width:100%;border-collapse:collapse;font-size:15px}th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5d6575;font-weight:700;padding:0 12px 10px;border-bottom:1px solid rgba(194,65,12,.16)}' +
'th.num,td.num{text-align:right}td{padding:12px;border-bottom:1px solid rgba(34,38,47,0.096);font-variant-numeric:tabular-nums}td a{color:#22262f;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(194,65,12,.16)}td a:hover{color:#c2410c}' +
'.method{color:#5d6575;font-size:13px;max-width:760px;margin-top:26px}' +
'</style></head><body>' +
'<header class="cm"><div class="wrap"><a class="wm" href="' + base + '/">Condo <b>Market</b> · sf</a>' +
'<nav class="nav"><a href="' + base + '/neighborhoods">Neighborhoods</a><a href="' + base + '/san-francisco-condo-rankings">Rankings</a><a href="' + base + '/san-francisco-condo-market-stats">Stats</a><a href="' + base + '/news/">News</a></nav></div></header>' +
body + '</body></html>';
}

/* ---- intel page: neighborhood comparison widget (client-rendered) ---- */
function homeActiveTeaser(pl, mk) {
  const count = (pl && pl.count != null) ? Number(pl.count) : 0;
  const listings = (pl && Array.isArray(pl.listings)) ? pl.listings : [];
  if (count <= 0 || !listings.length) return '';   // no empty teaser on the homepage
  const top = listings.slice(0, 3);
  const region = mk.region || 'San Francisco';

  const cards = top.map(function (a) {
    const aMls   = esc(a.mls || '');
    const aName  = esc(a.building_name || 'Building');
    const aUnit  = a.unit ? esc(a.unit) : '';
    const aAddr  = esc(a.unit_address || '');
    const aPrice = (a.price != null) ? money(Number(a.price)) : 'Price on request';
    const aBeds  = (a.beds != null && a.beds !== '') ? Number(a.beds) : null;
    const aBaths = (a.baths != null && a.baths !== '') ? Number(a.baths) : null;
    const aSqft  = (a.sqft != null && a.sqft !== '') ? Number(a.sqft) : null;
    const specBits = [];
    if (aBeds  != null) specBits.push(aBeds + ' bd');
    if (aBaths != null) specBits.push(aBaths + ' ba');
    if (aSqft  != null) specBits.push(intc(aSqft) + ' sf');
    const spec = specBits.length ? '<div class="hat-card-spec">' + specBits.join(' \u00b7 ') + '</div>' : '';
    const media = a.photo
      ? '<img class="hat-card-img" src="' + esc(a.photo) + '" alt="' + aAddr + '" loading="lazy" onerror="this.classList.add(\'hat-card-img--ph\');this.removeAttribute(\'src\');">'
      : '<div class="hat-card-img hat-card-img--ph" role="img" aria-label="' + aAddr + '"></div>';
    return '<a class="hat-card" href="/listing/' + aMls + '">' + media +
      '<div class="hat-card-body"><div class="hat-card-price">' + aPrice + '</div>' +
      '<div class="hat-card-bldg">' + aName + (aUnit ? ' \u00b7 #' + aUnit : '') + '</div>' + spec +
      '</div></a>';
  }).join('');

  return '<style>' +
    '.hat-wrap{background:#f5f7fa;padding:64px 0}' +
    '.hat-inner{max-width:1280px;margin:0 auto;padding:0 32px}' +
    '.hat-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:26px}' +
    '.hat-title{font-family:"Playfair Display",Georgia,serif;font-size:30px;color:#22262f;margin:0}' +
    '.hat-title em{font-style:italic;color:#C2410C}' +
    '.hat-link{font-size:13px;color:#C2410C;text-decoration:none;font-weight:600;white-space:nowrap}' +
    '.hat-link:hover{text-decoration:underline}' +
    '.hat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:22px}' +
    '.hat-card{display:block;background:rgba(34,38,47,0.03);border:1px solid rgba(34,38,47,0.084);border-radius:16px;overflow:hidden;text-decoration:none;transition:border-color .15s,transform .15s}' +
    '.hat-card:hover{border-color:rgba(34,38,47,0.28);transform:translateY(-2px)}' +
    '.hat-card-img{width:100%;height:170px;object-fit:cover;display:block;background:rgba(34,38,47,0.048)}' +
    '.hat-card-img--ph{background:linear-gradient(135deg,rgba(34,38,47,0.06),rgba(34,38,47,0.02))}' +
    '.hat-card-body{padding:14px 16px 16px}' +
    '.hat-card-price{font-family:"Playfair Display",Georgia,serif;font-size:21px;color:#22262f;font-weight:700}' +
    '.hat-card-bldg{font-size:13px;color:#22262f;margin-top:4px}' +
    '.hat-card-spec{font-size:12px;color:#5d6575;margin-top:8px}' +
    '</style>' +
    '<section class="hat-wrap"><div class="hat-inner">' +
    '<div class="hat-head">' +
    '<h2 class="hat-title">' + count + ' active ' + (count === 1 ? 'listing' : 'listings') + ' <em>for sale now</em></h2>' +
    '<a class="hat-link" href="/active-listings">View all active listings \u2192</a>' +
    '</div>' +
    '<div class="hat-grid">' + cards + '</div>' +
    '</div></section>';
}

function neighborhoodCompareWidget(mk) {
  var SB = SUPABASE_URL, AK = SUPABASE_ANON_KEY;
  return '' +
'<section id="cm-nb-compare" style="background:#f5f7fa;color:#22262f"><div style="max-width:1040px;margin:0 auto;padding:64px 24px;font-family:\'DM Sans\',sans-serif">' +
'<p style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#C2410C;margin:0 0 12px">Neighborhood Data</p>' +
'<h2 style="font-family:\'Playfair Display\',serif;font-size:27px;font-weight:700;margin:0 0 8px;color:#22262f">Compare two neighborhoods</h2>' +
'<p style="color:#5d6575;font-size:15px;max-width:680px;margin:0 0 22px">Pick any two San Francisco neighborhoods to compare median price per square foot, sale price, and recent activity side by side. For the full picture on any one, visit its <a href="https://www.sanfranciscocondomarket.com/neighborhoods" style="color:#c2410c;text-decoration:none;border-bottom:1px solid rgba(194,65,12,.16)">neighborhood page</a>.</p>' +
'<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px">' +
'<select id="cmNbA" style="flex:1;min-width:200px;background:#eef1f6;color:#22262f;border:1px solid rgba(194,65,12,.3);border-radius:10px;padding:12px 14px;font-size:15px;font-family:inherit"></select>' +
'<select id="cmNbB" style="flex:1;min-width:200px;background:#eef1f6;color:#22262f;border:1px solid rgba(194,65,12,.3);border-radius:10px;padding:12px 14px;font-size:15px;font-family:inherit"></select>' +
'</div><div id="cmNbOut"></div></div></section>' +
'<script>(function(){' +
'var SB="' + SB + '",AK="' + AK + '";' +
'var elA=document.getElementById("cmNbA"),elB=document.getElementById("cmNbB"),out=document.getElementById("cmNbOut");' +
'if(!elA)return;' +
'function money(n){return(n==null||isNaN(n))?"\\u2014":"$"+Number(n).toLocaleString("en-US");}' +
'function intc(n){return(n==null)?"0":Number(n).toLocaleString("en-US");}' +
'function slug(s){return String(s||"").toLowerCase().trim().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}' +
'fetch(SB+"/rest/v1/rpc/neighborhoods_index",{method:"POST",headers:{apikey:AK,Authorization:"Bearer "+AK,"Content-Type":"application/json"},body:JSON.stringify({p_market_domain:"sanfranciscocondomarket.com"})})' +
'.then(function(r){return r.json();}).then(function(rows){' +
'var data={};rows.forEach(function(n){data[n.neighborhood]=n;});' +
'var opts=rows.map(function(n){return \'<option value="\'+n.neighborhood.replace(/"/g,"")+\'">\'+n.neighborhood+\'</option>\';}).join("");' +
'elA.innerHTML=opts;elB.innerHTML=opts;' +
'if(rows.length>1){elA.selectedIndex=0;elB.selectedIndex=1;}' +
'function cell(n){if(!n)return "";' +
'var psf=n.is_thin?\'<span style="color:#5d6575;font-size:14px">Limited recent sales</span>\':money(n.median_psf);' +
'var price=n.is_thin?"\\u2014":money(n.median_price);' +
'return \'<div style="flex:1;min-width:220px;border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px">\'' +
'+\'<div style="font-family:\\\'Playfair Display\\\',serif;font-size:21px;font-weight:700;color:#22262f;margin-bottom:16px">\'+n.neighborhood+\'</div>\'' +
'+\'<div style="margin-bottom:12px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5d6575;font-weight:700">Median $/sqft</div><div style="font-size:26px;font-weight:700;color:#c2410c;font-variant-numeric:tabular-nums">\'+psf+\'</div></div>\'' +
'+\'<div style="margin-bottom:12px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5d6575;font-weight:700">Median price</div><div style="font-size:20px;font-weight:700;color:#22262f;font-variant-numeric:tabular-nums">\'+price+\'</div></div>\'' +
'+\'<div style="margin-bottom:14px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5d6575;font-weight:700">Sales / 12mo</div><div style="font-size:20px;font-weight:700;color:#22262f">\'+intc(n.sales_12mo)+\' <span style="font-size:13px;color:#5d6575;font-weight:500">/ \'+intc(n.building_count)+\' buildings</span></div></div>\'' +
'+\'<a href="https://www.sanfranciscocondomarket.com/neighborhood/\'+slug(n.neighborhood)+\'" style="color:#c2410c;text-decoration:none;font-size:13px;font-weight:600">View \'+n.neighborhood+\' \\u2192</a></div>\';}' +
'function render(){var a=data[elA.value],b=data[elB.value];out.innerHTML=\'<div style="display:flex;gap:14px;flex-wrap:wrap">\'+cell(a)+cell(b)+\'</div>\';}' +
'elA.addEventListener("change",render);elB.addEventListener("change",render);render();' +
'}).catch(function(){out.innerHTML=\'<p style="color:#5d6575">Neighborhood data is loading\\u2014refresh in a moment.</p>\';});' +
'})();</script>';
}

/* ---- intel page: price movement widget (1/3/5/10yr, client-rendered) ---- */
function priceMovementWidget(mk) {
  var SB = SUPABASE_URL, AK = SUPABASE_ANON_KEY;
  return '' +
'<section id="cm-pm" style="background:#f5f7fa;color:#22262f"><div style="max-width:1040px;margin:0 auto;padding:8px 24px 64px;font-family:\'DM Sans\',sans-serif">' +
'<p style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#C2410C;margin:0 0 12px">How Prices Have Moved</p>' +
'<h2 style="font-family:\'Playfair Display\',serif;font-size:27px;font-weight:700;margin:0 0 8px;color:#22262f">Price movement by neighborhood</h2>' +
'<p style="color:#5d6575;font-size:15px;max-width:680px;margin:0 0 22px">Choose a neighborhood and a time horizon to see how the median price per square foot has moved. Horizons without enough recorded sales to be reliable are marked accordingly.</p>' +
'<select id="cmPmNb" style="width:100%;max-width:420px;background:#eef1f6;color:#22262f;border:1px solid rgba(194,65,12,.3);border-radius:10px;padding:12px 14px;font-size:15px;font-family:inherit;margin-bottom:18px"></select>' +
'<div id="cmPmTabs" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px"></div>' +
'<div id="cmPmOut"></div></div></section>' +
'<script>(function(){' +
'var SB="' + SB + '",AK="' + AK + '";' +
'var sel=document.getElementById("cmPmNb"),tabs=document.getElementById("cmPmTabs"),out=document.getElementById("cmPmOut");' +
'if(!sel)return;' +
'var HORIZONS=[1,3,5,10],active=1,cache={};' +
'function money(n){return(n==null||isNaN(n))?"\\u2014":"$"+Number(n).toLocaleString("en-US");}' +
'function hdr(h){return h+(h===1?" Year":" Years");}' +
'function drawTabs(){tabs.innerHTML=HORIZONS.map(function(h){' +
'var on=h===active;return \'<button data-h="\'+h+\'" style="background:\'+(on?"#C2410C":"transparent")+\';color:\'+(on?"#fff":"#8893a6")+\';border:1px solid \'+(on?"#C2410C":"rgba(194,65,12,.3)")+\';border-radius:8px;padding:9px 18px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">\'+hdr(h)+\'</button>\';}).join("");' +
'Array.prototype.forEach.call(tabs.querySelectorAll("button"),function(b){b.addEventListener("click",function(){active=Number(b.getAttribute("data-h"));drawTabs();render();});});}' +
'function render(){var rows=cache[sel.value];if(!rows){out.innerHTML="";return;}' +
'var r=null;for(var i=0;i<rows.length;i++){if(rows[i].horizon_years===active)r=rows[i];}' +
'if(!r||r.pct_change==null){out.innerHTML=\'<div style="border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:24px;color:#5d6575;font-size:15px">Not enough recorded sales in \'+sel.value+\' over this \'+hdr(active).toLowerCase()+\' window to report a reliable change.</div>\';return;}' +
'var up=r.pct_change>=0,col=up?"#4f9d5d":"#c46a4a",arr=up?"\\u25B2":"\\u25BC";' +
'out.innerHTML=\'<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:stretch">\'' +
'+\'<div style="flex:1;min-width:160px;border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5d6575;font-weight:700">\'+hdr(active)+\' Ago</div><div style="font-size:28px;font-weight:700;color:#22262f;font-variant-numeric:tabular-nums">\'+money(r.median_then)+\'</div><div style="font-size:12px;color:#5d6575;margin-top:4px">median $/sqft</div></div>\'' +
'+\'<div style="flex:1;min-width:160px;border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5d6575;font-weight:700">Today</div><div style="font-size:28px;font-weight:700;color:#c2410c;font-variant-numeric:tabular-nums">\'+money(r.median_now)+\'</div><div style="font-size:12px;color:#5d6575;margin-top:4px">median $/sqft</div></div>\'' +
'+\'<div style="flex:1;min-width:160px;border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5d6575;font-weight:700">Change</div><div style="font-size:28px;font-weight:700;color:\'+col+\';font-variant-numeric:tabular-nums">\'+arr+\' \'+Math.abs(r.pct_change)+\'%</div><div style="font-size:12px;color:#5d6575;margin-top:4px">over \'+hdr(active).toLowerCase()+\'</div></div></div>\';}' +
'function loadNb(){var nb=sel.value;if(cache[nb]){render();return;}' +
'fetch(SB+"/rest/v1/rpc/neighborhood_price_movement",{method:"POST",headers:{apikey:AK,Authorization:"Bearer "+AK,"Content-Type":"application/json"},body:JSON.stringify({p_market_domain:"sanfranciscocondomarket.com",p_neighborhood:nb})})' +
'.then(function(r){return r.json();}).then(function(rows){cache[nb]=rows;render();});}' +
'fetch(SB+"/rest/v1/rpc/neighborhoods_index",{method:"POST",headers:{apikey:AK,Authorization:"Bearer "+AK,"Content-Type":"application/json"},body:JSON.stringify({p_market_domain:"sanfranciscocondomarket.com"})})' +
'.then(function(r){return r.json();}).then(function(rows){' +
'sel.innerHTML=rows.map(function(n){return \'<option value="\'+n.neighborhood.replace(/"/g,"")+\'">\'+n.neighborhood+\'</option>\';}).join("");' +
'sel.addEventListener("change",loadNb);drawTabs();loadNb();' +
'}).catch(function(){out.innerHTML=\'<p style="color:#5d6575">Price data is loading\\u2014refresh in a moment.</p>\';});' +
'})();</script>';
}

/* -------------------- data hub: buildings directory --------------------- */
async function renderBuildingsDirectory(mk) {
  const DOMAIN = 'sanfranciscocondomarket.com';
  if (mk.tag !== 'sf') {
    return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + DOMAIN + '/san-francisco-condos', 'Cache-Control': 'public, max-age=3600' } });
  }
  const base = 'https://www.' + DOMAIN;
  const canonical = base + '/san-francisco-condos';
  const updated = new Date().toISOString().slice(0, 10);

  const rows = await callReportRpc('directory_buildings', { p_market_domain: DOMAIN });
  const list = Array.isArray(rows) ? rows : [];

  // group by neighborhood (RPC already sorts by hood, then name)
  const groups = [];
  let cur = null;
  for (const r of list) {
    const hood = r.neighborhood || 'Other';
    if (!cur || cur.hood !== hood) { cur = { hood: hood, items: [] }; groups.push(cur); }
    cur.items.push(r);
  }

  const bUrl = function (slug) { return base + '/building/' + esc(slug) + '/'; };
  const cardHtml = function (r) {
    const facts = [];
    if (r.year_built) facts.push('Built ' + r.year_built);
    if (r.unit_count) facts.push(intc(r.unit_count) + ' units');
    if (r.median_psf) facts.push(money(r.median_psf) + '/sqft');
    return '<a class="bcard" href="' + bUrl(r.slug) + '">' +
      '<div class="bname">' + esc(r.display_name) + '</div>' +
      '<div class="baddr">' + esc(r.canonical_address || '') + '</div>' +
      (facts.length ? '<div class="bfacts">' + facts.join(' \u00b7 ') + '</div>' : '') +
      '</a>';
  };

  const sections = groups.map(function (g) {
    return '<section class="hoodsec"><h2>' + esc(g.hood) + ' <span class="hoodn">' + intc(g.items.length) + '</span></h2>' +
      '<div class="bgrid">' + g.items.map(cardHtml).join('') + '</div></section>';
  }).join('');

  const itemListEls = list.map(function (r, i) {
    return { '@type': 'ListItem', position: i + 1, url: bUrl(r.slug), name: r.display_name };
  });
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'San Francisco Condo Buildings Directory',
    numberOfItems: list.length, itemListElement: itemListEls
  };

  const title = 'San Francisco Condo Buildings Directory \u2014 Every Building by Neighborhood';
  const desc  = 'A complete directory of ' + intc(list.length) + ' San Francisco condo buildings by neighborhood, with year built, unit count, and current price per square foot. Each links to a full building profile.';

  const html =
'<!doctype html><html lang="en"><head>' +
'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + esc(title) + '</title>' +
'<meta name="description" content="' + attr(desc) + '">' +
'<link rel="canonical" href="' + canonical + '">' +
'<meta property="og:title" content="' + attr(title) + '"><meta property="og:description" content="' + attr(desc) + '">' +
'<meta property="og:url" content="' + canonical + '"><meta property="og:type" content="website">' +
'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
'<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
'<script type="application/ld+json">' + JSON.stringify(jsonld) + '</script>' +
'<style>' +
':root{--dark:#f5f7fa;--orange:#C2410C;--orange-bright:#e85d2a;--ivory:#22262f;--dim:#5d6575;--line:#e0e5ed}' +
'*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#22262f;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6}' +
'.wrap{max-width:1080px;margin:0 auto;padding:0 24px}' +
'header.cm{border-bottom:1px solid rgba(194,65,12,.16);background:#12151d}header.cm .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}' +
'.wm{font-family:"Playfair Display",serif;font-style:italic;font-size:21px;color:#e8e3d8;text-decoration:none}.wm b{color:#e85d2a;font-style:normal;font-weight:700}' +
'.nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:0 22px;min-width:0}' +
'.nav a{color:#8893a6;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-left:0}.nav a:hover{color:#e85d2a}' +
'@media(max-width:720px){header.cm .wrap{height:auto;flex-wrap:wrap;gap:10px;padding-top:12px;padding-bottom:12px}.nav{gap:6px 14px;justify-content:flex-start;width:100%}}' +
'.hero{padding:58px 0 28px;border-bottom:1px solid rgba(194,65,12,.16)}' +
'.kick{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#C2410C;margin:0 0 14px}' +
'h1{font-family:"Playfair Display",serif;font-weight:700;font-size:clamp(30px,5vw,44px);line-height:1.1;margin:0 0 16px}' +
'.lede{font-size:17px;color:#5d6575;max-width:700px;margin:0}.upd{font-size:12px;color:#5d6575;margin-top:16px}' +
'.links{padding:22px 0 6px}.links a{color:#c2410c;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(194,65,12,.16);margin-right:22px;font-size:14px}' +
'.hoodsec{padding:30px 0;border-bottom:1px solid rgba(194,65,12,.16)}' +
'h2{font-family:"Playfair Display",serif;font-size:23px;font-weight:700;margin:0 0 18px}.hoodn{color:#5d6575;font-size:15px;font-weight:500}' +
'.bgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:820px){.bgrid{grid-template-columns:repeat(2,1fr)}}@media(max-width:540px){.bgrid{grid-template-columns:1fr}}' +
'.bcard{display:block;border:1px solid rgba(194,65,12,.16);border-radius:12px;padding:16px 18px;text-decoration:none;transition:border-color .15s}' +
'.bcard:hover{border-color:#C2410C}' +
'.bname{font-family:"Playfair Display",serif;font-size:18px;font-weight:700;color:#22262f}' +
'.baddr{font-size:13px;color:#5d6575;margin-top:3px}' +
'.bfacts{font-size:12.5px;color:#c2410c;margin-top:8px;font-variant-numeric:tabular-nums}' +
'.method{color:#5d6575;font-size:13px;max-width:760px;padding:34px 0 70px}' +
'</style></head><body>' +
'<header class="cm"><div class="wrap"><a class="wm" href="' + base + '/">Condo <b>Market</b> · sf</a>' +
'<nav class="nav"><a href="' + canonical + '">Directory</a><a href="' + base + '/san-francisco-condo-rankings">Rankings</a><a href="' + base + '/san-francisco-condo-market-stats">Stats</a></nav></div></header>' +
'<div class="hero"><div class="wrap">' +
'<p class="kick">San Francisco · Building Directory</p>' +
'<h1>San Francisco Condo Buildings</h1>' +
'<p class="lede">Every cataloged San Francisco condo building, organized by neighborhood\u2014with the year it was built, its size, and the current median price per square foot from recorded sales. Tap any building for its full profile, sales history, and ownership detail.</p>' +
'<p class="upd">' + intc(list.length) + ' buildings across ' + intc(groups.length) + ' neighborhoods · updated ' + updated + '</p>' +
'</div></div>' +
'<div class="wrap">' +
'<p class="links"><a href="' + base + '/san-francisco-condo-rankings">View rankings \u2192</a><a href="' + base + '/san-francisco-condo-market-stats">Market stats \u2192</a></p>' +
sections +
'<p class="method">Directory of cataloged San Francisco condo buildings. Year built and unit counts reflect public building records; price per square foot is the median of recorded sales over the trailing twelve months, shown where sales exist. McMullen Properties LLC \u00b7 CA DRE #02016832.</p>' +
'</div></body></html>';

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' },
  });
}

/* ----------------------- data hub: market stats ------------------------- */
function pctDelta(cur, prior) {
  if (cur == null || prior == null || Number(prior) === 0) return null;
  return Math.round(((Number(cur) - Number(prior)) / Number(prior)) * 1000) / 10; // 1 dp
}
function deltaSpan(d, invertGood) {
  if (d == null) return '<span class="d flat">—</span>';
  const up = d > 0;
  const good = invertGood ? !up : up;
  const arrow = up ? '\u25B2' : (d < 0 ? '\u25BC' : '\u2013');
  const cls = d === 0 ? 'flat' : (good ? 'up' : 'down');
  return '<span class="d ' + cls + '">' + arrow + ' ' + Math.abs(d) + '%</span>';
}

async function renderStatsHub(mk) {
  const DOMAIN = 'sanfranciscocondomarket.com';
  if (mk.tag !== 'sf') {
    return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + DOMAIN + '/san-francisco-condo-market-stats', 'Cache-Control': 'public, max-age=3600' } });
  }
  const base = 'https://www.' + DOMAIN;
  const canonical = base + '/san-francisco-condo-market-stats';
  const updated = new Date().toISOString().slice(0, 10);

  const rows = await callReportRpc('report_market_pulse', { p_market_domain: DOMAIN });
  const p = (rows && rows[0]) ? rows[0] : {};

  const dVol  = pctDelta(p.cur_sales, p.prior_sales);
  const dPrice = pctDelta(p.cur_median_price, p.prior_median_price);
  const dPsf  = pctDelta(p.cur_median_psf, p.prior_median_psf);

  const card = function (label, val, d, invertGood, sub) {
    return '<div class="stat"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-val">' + (val || '\u2014') + '</div>' +
      '<div class="stat-sub">' + (d != null ? deltaSpan(d, invertGood) + ' vs prior 12 mo' : (sub || '')) + '</div></div>';
  };

  // honest divergence narrative, computed not invented
  let narrative = 'Drawn from recorded condo sales in cataloged San Francisco buildings over the trailing twelve months, compared with the prior twelve.';
  if (dVol != null && dPrice != null && dPsf != null) {
    narrative = 'Over the trailing twelve months, recorded condo sales ' +
      (dVol >= 0 ? 'rose ' : 'fell ') + Math.abs(dVol) + '% versus the prior year, while the median sale price ' +
      (dPrice >= 0 ? 'rose ' : 'eased ') + Math.abs(dPrice) + '% and the median price per square foot ' +
      (dPsf >= 0 ? 'climbed ' : 'declined ') + Math.abs(dPsf) + '%. ' +
      ((dPrice < 0 && dPsf > 0) ? 'Lower headline prices alongside higher per-foot values points to a shift in what is trading\u2014smaller or more efficient units changing hands\u2014rather than a falling market.' : 'Read price and price-per-foot together: they can move in different directions as the mix of what sells changes.');
  }

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Dataset',
    name: 'San Francisco Condo Market Statistics',
    description: 'Trailing-twelve-month sales volume, median price, and median price per square foot for cataloged San Francisco condos, with year-over-year comparison.',
    url: canonical, dateModified: updated,
    creator: { '@type': 'RealEstateAgent', name: 'McMullen Properties LLC' }
  };

  const title = 'San Francisco Condo Market Stats — Sales Volume, Median Price & $/Sq Ft';
  const desc  = 'San Francisco condo market statistics: ' + (intc(p.cur_sales) || '') + ' recorded sales, median ' +
    (money(p.cur_median_price) || '') + ', ' + (money(p.cur_median_psf) || '') + '/sqft over the trailing 12 months, with year-over-year change.';

  const html =
'<!doctype html><html lang="en"><head>' +
'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + esc(title) + '</title>' +
'<meta name="description" content="' + attr(desc) + '">' +
'<link rel="canonical" href="' + canonical + '">' +
'<meta property="og:title" content="' + attr(title) + '"><meta property="og:description" content="' + attr(desc) + '">' +
'<meta property="og:url" content="' + canonical + '"><meta property="og:type" content="website">' +
'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
'<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
'<script type="application/ld+json">' + JSON.stringify(jsonld) + '</script>' +
'<style>' +
':root{--dark:#f5f7fa;--orange:#C2410C;--orange-bright:#e85d2a;--ivory:#22262f;--dim:#5d6575;--line:#e0e5ed;--up:#2f6b40;--down:#b4532a}' +
'*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#22262f;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6}' +
'.wrap{max-width:1040px;margin:0 auto;padding:0 24px}' +
'header.cm{border-bottom:1px solid rgba(194,65,12,.16);background:#12151d}header.cm .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}' +
'.wm{font-family:"Playfair Display",serif;font-style:italic;font-size:21px;color:#e8e3d8;text-decoration:none}.wm b{color:#e85d2a;font-style:normal;font-weight:700}' +
'.nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:0 22px;min-width:0}' +
'.nav a{color:#8893a6;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-left:0}.nav a:hover{color:#e85d2a}' +
'@media(max-width:720px){header.cm .wrap{height:auto;flex-wrap:wrap;gap:10px;padding-top:12px;padding-bottom:12px}.nav{gap:6px 14px;justify-content:flex-start;width:100%}}' +
'.hero{padding:60px 0 30px;border-bottom:1px solid rgba(194,65,12,.16)}' +
'.kick{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#C2410C;margin:0 0 14px}' +
'h1{font-family:"Playfair Display",serif;font-weight:700;font-size:clamp(30px,5vw,46px);line-height:1.1;margin:0 0 16px}' +
'.lede{font-size:17px;color:#5d6575;max-width:700px;margin:0}.upd{font-size:12px;color:#5d6575;margin-top:18px;letter-spacing:.03em}' +
'.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:46px 0}' +
'@media(max-width:720px){.grid{grid-template-columns:1fr}}' +
'.stat{border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:24px}' +
'.stat-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5d6575;font-weight:700;margin-bottom:10px}' +
'.stat-val{font-family:"Playfair Display",serif;font-size:34px;font-weight:700;font-variant-numeric:tabular-nums}' +
'.stat-sub{font-size:13px;color:#5d6575;margin-top:8px}' +
'.d{font-weight:700}.d.up{color:#2f6b40}.d.down{color:#b4532a}.d.flat{color:#5d6575}' +
'section{padding:10px 0 50px;border-top:1px solid rgba(194,65,12,.16)}' +
'h2{font-family:"Playfair Display",serif;font-size:25px;font-weight:700;margin:34px 0 10px}' +
'p.body{color:#5d6575;font-size:16px;max-width:760px}' +
'.links a{color:#c2410c;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(194,65,12,.16);margin-right:22px}' +
'.cta{background:#C2410C;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;display:inline-block;margin-top:18px;font-size:14px}' +
'.method{color:#5d6575;font-size:13px;max-width:760px;margin-top:30px}' +
'</style></head><body>' +
'<header class="cm"><div class="wrap"><a class="wm" href="' + base + '/">Condo <b>Market</b> · sf</a>' +
'<nav class="nav"><a href="' + base + '/buildings/">Buildings</a><a href="' + base + '/san-francisco-condo-rankings">Rankings</a><a href="' + canonical + '">Stats</a></nav></div></header>' +
'<div class="hero"><div class="wrap">' +
'<p class="kick">San Francisco · Market Statistics</p>' +
'<h1>San Francisco Condo Market Stats</h1>' +
'<p class="lede">The San Francisco condo market in three numbers, measured against the prior year. Computed from recorded sales across our cataloged buildings\u2014medians, not averages, so outliers don\u2019t skew the picture.</p>' +
'<p class="upd">Updated ' + updated + ' · trailing 12 months vs prior 12 months</p>' +
'</div></div>' +
'<div class="wrap">' +
'<div class="grid">' +
card('Recorded Sales', intc(p.cur_sales), dVol, false) +
card('Median Sale Price', money(p.cur_median_price), dPrice, false) +
card('Median Price / Sq Ft', money(p.cur_median_psf), dPsf, false) +
'</div>' +
'<section><h2>What the numbers say</h2><p class="body">' + esc(narrative) + '</p>' +
'<p class="body" style="margin-top:14px">Across ' + (intc(p.catalogued_buildings) || 'our') + ' active buildings in ' + (intc(p.active_neighborhoods) || 'several') + ' neighborhoods. For the building-by-building and neighborhood breakdown, see the rankings.</p>' +
'<p class="links" style="margin-top:20px"><a href="' + base + '/san-francisco-condo-rankings">View full rankings \u2192</a><a href="' + base + '/buildings/">Browse buildings \u2192</a></p>' +
'</section>' +
'<p class="method">Figures are computed from recorded sale transactions in cataloged San Francisco condo buildings, comparing the trailing twelve months with the twelve months prior. Price and price-per-square-foot are medians. McMullen Properties LLC \u00b7 CA DRE #02016832.</p>' +
'<a class="cta" href="' + base + '/buildings/">Explore all buildings \u2192</a>' +
'<div style="height:60px"></div>' +
'</div></body></html>';

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' },
  });
}


function CM_MASTHEAD(tag) {
  return '<header class="masthead"><div class="wrap"><div class="masthead-row">' +
    '<a href="/" class="wordmark">Condo <em>Market</em> \u00b7 ' + tag + '</a>' +
    '<nav class="nav-meta">' +
    '<a href="/buildings/">Buildings</a><a href="/intelligence/">Intelligence</a>' +
    '<a href="/active-listings">Active Listings</a><a href="/buy">Buy</a><a href="/sell">Sell</a>' +
    '<a href="/how-it-works/">How it works</a>' +
    '<a href="/news/">Local News</a>' +
         '<a href="/investor-exchange/">Investor Exchange</a>' +
    '<a href="#signin" data-cm-auth="login" class="signin-btn">Sign in</a>' +
    '</nav></div></div></header>\n\n';
}

// footerData = { byCityHood: { city: { hood: [ {slug,name} ] } }, cities: [ {slug,name,n} ] }
function CM_FOOTER(footerData) {
  const fd = footerData || { byCityHood: {}, cities: [] };
  const cities = fd.cities || [];
  const byCityHood = fd.byCityHood || {};

  // Building columns grouped by neighborhood (within each city).
  let bldgCols = '';
  const cityNames = Object.keys(byCityHood);
  cityNames.forEach(function (cityName) {
    const hoods = byCityHood[cityName];
    const hoodNames = Object.keys(hoods).sort();
    // For multi-city markets (SV), header each city; for single-city (SF) skip city header.
    if (cityNames.length > 1) {
      bldgCols += '<div class="cf-city-head">' + esc(cityName) + '</div>';
    }
    hoodNames.forEach(function (h) {
      const list = hoods[h];
      bldgCols += '<div class="cf-group">' +
        '<h5 class="cf-group-title">' + (h ? esc(h) : esc(cityName)) + '</h5><ul>' +
        list.map(function (b) { return '<li><a href="/building/' + esc(b.slug) + '/">' + esc(b.name) + '</a></li>'; }).join('') +
        '</ul></div>';
    });
  });

  // City link column (buy/sell intent)
  const cityLinks = cities.map(function (c) {
    return '<li><a href="/condos-in-' + esc(c.slug) + '">Condos in ' + esc(c.name) + '</a></li>';
  }).join('');
  const buyLinks = cities.map(function (c) {
    return '<li><a href="/buy-a-condo-in-' + esc(c.slug) + '">Buy in ' + esc(c.name) + '</a></li>';
  }).join('');
  const sellLinks = cities.map(function (c) {
    return '<li><a href="/sell-a-condo-in-' + esc(c.slug) + '">Sell in ' + esc(c.name) + '</a></li>';
  }).join('');

  return '<footer class="cf"><div class="wrap">' +
    // Top: brand + primary nav
    '<div class="cf-top">' +
    '<div class="cf-brand">' +
    '<div class="wordmark" style="font-size:20px;margin-bottom:12px;">Condo <em>Market</em> \u00b7 sf</div>' +
    '<p class="cf-tag">A private marketplace for every condo in San Francisco. Ten years of sales, owner tenure, live activity \u2014 every unit available for the right price.</p>' +
    '<div class="cf-primary">' +
    '<a href="/buildings/">All buildings</a><a href="/active-listings">Active listings</a>' +
    '<a href="/intelligence/">Intelligence</a><a href="/buy">Buy a condo</a>' +
    '<a href="/sell">Sell a condo</a><a href="/how-it-works/">How it works</a>' +
    '</div></div>' +
    /* Three headed columns is the right shape for Silicon Valley, which has
       several cities in each. San Francisco has exactly one — so BY CITY, BUY
       and SELL each held a single link, all three about the same city, under
       three separate headings. That is what reserved half the footer width for
       about forty pixels of text. One city gets one column. */
    (cities.length > 1
      ? '<div class="cf-intent">' +
        '<div class="cf-intent-col"><h5 class="cf-group-title">By city</h5><ul>' + cityLinks + '</ul></div>' +
        '<div class="cf-intent-col"><h5 class="cf-group-title">Buy</h5><ul>' + buyLinks + '</ul></div>' +
        '<div class="cf-intent-col"><h5 class="cf-group-title">Sell</h5><ul>' + sellLinks + '</ul></div>' +
        '</div>'
      : '<div class="cf-intent">' +
        '<div class="cf-intent-col"><h5 class="cf-group-title">' + esc((cities[0] && cities[0].name) || 'This market') + '</h5><ul>' +
        cityLinks + buyLinks + sellLinks + '</ul></div></div>') +
    '</div>' +
    // Building directory (comprehensive, grouped)
    '<div class="cf-dir-head">Browse every building</div>' +
    '<div class="cf-dir">' + bldgCols + '</div>' +
    // Fine print
    '<div class="cf-fine">\u00a9 2026 Condo Market SF \u00b7 Platform operated by McMullen Properties LLC, which is not a real estate brokerage \u00b7 Real estate services provided by Tim McMullen, Broker, CA DRE #02016832. ' +
    'Condo Market SF is a marketing platform and is not a real estate brokerage. ' +
    '<a href="/methodology/">Methodology</a> \u00b7 <a href="/how-it-works/">How it works</a> \u00b7 <a href="tel:+14156919272">415-691-9272</a></div>' +
    '</div></footer>\n' +
    '<script type="module" src="/assets/cm-auth-nav.js"></script>\n' +
    CM_FOOTER_CSS;
}

const CM_FOOTER_CSS =
  '<style>' +
  '.cf{background:#12151d;border-top:1px solid rgba(159,180,216,.12);padding:48px 0 32px;margin-top:0;color:rgba(232,227,216,.6)}' +
  /* The footer ships its own container.

     CM_FOOTER emits <div class="wrap">, and .wrap is defined only in the
     worker's building-page stylesheet. Every STATIC page — /buildings/,
     /intelligence/, /how-it-works/, /history/ — uses .cm-container and has no
     .wrap rule at all, so on those pages the footer was an unstyled div: full
     bleed, no max-width, no side padding. That is why the brand sat flush
     against the window edge and the right-hand column ran off it.
     A component that is injected into pages it does not control cannot depend
     on a class those pages happen to define. Vars first so a building page
     still matches its own gutter exactly; literals as the fallback. */
  '.cf .wrap{max-width:var(--page-max,1280px);margin:0 auto;padding:0 var(--gutter,32px)}' +
  '@media(max-width:720px){.cf .wrap{padding:0 var(--gutter,20px)}}' +
  '.cf .wordmark{color:#fff}.cf .wordmark em{color:#e85d2a;font-style:italic}' +
  /* Was grid 1.4fr / 2fr. The second track took 58% of the footer whatever was
     in it, and grid items stretch by default — so a column holding one line of
     links was drawn 200px tall and 700px wide, which is the empty band. Flex
     with flex-start sizes both to their content and lets the gap do the work. */
  '.cf-top{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:32px 64px;padding-bottom:32px;border-bottom:1px solid rgba(159,180,216,.1)}' +
  '.cf-brand{flex:1 1 420px;min-width:0;max-width:560px}' +
  /* 38ch wrapped the blurb to three lines in a column with room for far more. */
  '.cf-tag{font-size:13px;line-height:1.6;max-width:56ch;margin:0 0 16px}' +
  '.cf-primary{display:flex;flex-wrap:wrap;gap:8px 18px}' +
  '.cf-primary a{font-size:13px;color:#e85d2a;text-decoration:none;font-weight:600}' +
  '.cf-primary a:hover{text-decoration:underline}' +
  '.cf-intent{display:flex;flex-wrap:wrap;gap:24px 56px;flex:0 1 auto}' +
  '.cf-intent-col{min-width:132px}' +
  '.cf-intent-col ul{list-style:none;padding:0;margin:0}' +
  '.cf-intent-col li{margin-bottom:7px}' +
  '.cf-intent-col a{font-size:12.5px;color:rgba(232,227,216,.62);text-decoration:none}' +
  '.cf-intent-col a:hover{color:#e85d2a}' +
  '.cf-group-title{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#e85d2a;margin:0 0 12px;font-weight:700}' +
  '.cf-dir-head{font-family:"Playfair Display",Georgia,serif;font-size:18px;color:#fff;margin:28px 0 18px}' +
  '.cf-dir{column-count:4;column-gap:32px}' +
  '@media(max-width:980px){.cf-dir{column-count:2}.cf-top{gap:28px 40px}.cf-brand{flex:1 1 100%}}' +
  '@media(max-width:560px){.cf-dir{column-count:1}.cf-intent{gap:20px 32px}}' +
  '.cf-city-head{font-family:"Playfair Display",Georgia,serif;font-size:15px;color:#fff;margin:6px 0 12px;break-inside:avoid;border-bottom:1px solid rgba(159,180,216,.12);padding-bottom:6px}' +
  '.cf-group{break-inside:avoid;margin-bottom:20px}' +
  '.cf-group ul{list-style:none;padding:0;margin:0}' +
  '.cf-group li{margin-bottom:6px}' +
  '.cf-group a{font-size:12.5px;color:rgba(232,227,216,.58);text-decoration:none;line-height:1.35}' +
  '.cf-group a:hover{color:#e85d2a}' +
  '.cf-fine{font-size:11px;line-height:1.6;color:#93a3b8;border-top:1px solid rgba(159,180,216,.1);padding-top:24px;margin-top:36px}' +
  '.cf-fine a{color:rgba(232,227,216,.55);text-decoration:none}.cf-fine a:hover{color:#e85d2a}' +
  '</style>';

// Fetch all catalogued buildings for the host market, grouped city → neighborhood,
// plus the city list. One embedded-filter query; cached via page cache-control.
async function fetchFooterData(hostMk) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/buildings?select=slug,display_name,neighborhood,cities!inner(slug,display_name,domain)&is_catalogued=eq.true&slug=not.like.*-eichlers&display_name=not.ilike.*eichler*&order=display_name.asc&limit=2000',
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Accept': 'application/json' } });
    if (!res.ok) return { byCityHood: {}, cities: [] };
    const rows = await res.json();
    const byCityHood = {};
    const cityCounts = {};
    (rows || []).forEach(function (b) {
      const c = b.cities; if (!c || !c.slug) return;
      const cMkt = (c.domain && MARKET_BY_HOST[c.domain]) ? MARKET_BY_HOST[c.domain] : (c.slug === 'san-francisco' ? 'sf' : 'sv');
      if (cMkt !== hostMk.tag) return;
      const cityName = c.display_name;
      const hood = b.neighborhood || '';
      byCityHood[cityName] = byCityHood[cityName] || {};
      (byCityHood[cityName][hood] = byCityHood[cityName][hood] || []).push({ slug: b.slug, name: b.display_name });
      if (!cityCounts[c.slug]) cityCounts[c.slug] = { slug: c.slug, name: cityName, n: 0 };
      cityCounts[c.slug].n++;
    });
    const cities = Object.keys(cityCounts).map(function (k) { return cityCounts[k]; }).sort(function (a, b) { return b.n - a.n; });
    return { byCityHood: byCityHood, cities: cities };
  } catch (e) { return { byCityHood: {}, cities: [] }; }
}


async function renderLlmsTxt(mk) {
  const base = 'https://www.' + mk.domain;
  let dir = null;
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/llms_directory', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ p_market_tag: mk.tag }),
    });
    if (res.ok) dir = await res.json();
  } catch (e) { dir = null; }
  const bl = (dir && Array.isArray(dir.buildings)) ? dir.buildings : [];
  const byHood = {};
  bl.forEach(function (b) { const h = b.neighborhood || 'Other'; (byHood[h] = byHood[h] || []).push(b); });
  const hoods = Object.keys(byHood).sort(function (x, y) { return x === 'Other' ? 1 : y === 'Other' ? -1 : x.localeCompare(y); });
  const lines = [];
  lines.push('# ' + mk.brand);
  lines.push('');
  lines.push('> A public record of the ' + mk.region + ' condominium market: ' + bl.length + ' buildings across ' + hoods.filter(function (h) { return h !== 'Other'; }).length +
    ' neighborhoods, each with its recorded sales, price per square foot, owner tenure and current listings. Operated by a licensed California real estate agent.');
  lines.push('');
  lines.push('Every building page reports recorded sales and the sample behind each figure. The site does not estimate the value of individual homes; value questions are routed to the licensed agent.');
  lines.push('');
  lines.push('## Key pages');
  lines.push('- [All buildings](' + base + '/): every condominium building, searchable');
  lines.push('- [Neighborhoods](' + base + '/neighborhoods): buildings and market data by neighborhood');
  lines.push('- [Active listings](' + base + '/active-listings): every condo currently for sale');
  lines.push('- [Market intelligence](' + base + '/intelligence/): citywide price per square foot, sales and trends');
  if (mk.tag === 'sf') {
    lines.push('- [Condo rankings](' + base + '/san-francisco-condo-rankings): buildings ranked by price and activity');
    lines.push('- [Market stats](' + base + '/san-francisco-condo-market-stats): the ' + mk.region + ' condo market in numbers');
  }
  lines.push('- [News](' + base + '/news/): daily and monthly market reports');
  lines.push('- [How it works](' + base + '/how-it-works/)');
  lines.push('');
  lines.push('## Buildings by neighborhood');
  hoods.forEach(function (h) {
    lines.push('');
    lines.push('### ' + (h === 'Other' ? 'Other' : '[' + h + '](' + base + '/neighborhood/' + hoodSlug(h) + ')'));
    byHood[h].forEach(function (b) {
      const facts = [];
      if (b.address && b.address !== b.name) facts.push(b.address);
      if (b.units != null) facts.push(b.units + ' units');
      if (b.year != null) facts.push('built ' + b.year);
      lines.push('- [' + (b.name || b.address) + '](' + base + '/building/' + b.slug + ')' + (facts.length ? ': ' + facts.join(', ') : ''));
    });
  });
  lines.push('');
  return new Response(lines.join('\n'), { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=86400' } });
}

async function callReportRpc(name, body) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return await res.json();
  } catch (e) { /* fall through */ }
  return [];
}

async function renderRankingsHub(mk) {
  // SF is the data engine; this hub is SF-scoped. On SV host, 301 to SF domain.
  const DOMAIN = 'sanfranciscocondomarket.com';
  if (mk.tag !== 'sf') {
    return new Response(null, { status: 301, headers: { 'Location': 'https://www.' + DOMAIN + '/san-francisco-condo-rankings', 'Cache-Control': 'public, max-age=3600' } });
  }
  const base = 'https://www.' + DOMAIN;
  const canonical = base + '/san-francisco-condo-rankings';

  const [psf, volume, turnover] = await Promise.all([
    callReportRpc('report_neighborhood_psf',   { p_market_domain: DOMAIN, p_months: 12 }),
    callReportRpc('report_volume_leaders',      { p_market_domain: DOMAIN, p_months: 12, p_limit: 15 }),
    callReportRpc('report_turnover_leaders',    { p_market_domain: DOMAIN, p_min_units: 10, p_limit: 12 }),
  ]);

  const bLink = (slug, name) => '<a href="' + base + '/building/' + esc(slug) + '/">' + esc(name) + '</a>';
  const topHood = (psf && psf[0]) ? psf[0] : null;
  const topVol  = (volume && volume[0]) ? volume[0] : null;
  const updated = new Date().toISOString().slice(0, 10);

  // ── neighborhood $/sqft table
  const psfRows = (psf || []).map(function (r, i) {
    return '<tr><td class="rank">' + (i + 1) + '</td><td>' + esc(r.neighborhood) +
      '</td><td class="num">' + (money(r.median_psf) || '—') +
      '</td><td class="num">' + (money(r.median_price) || '—') +
      '</td><td class="num dim">' + intc(r.n) + '</td></tr>';
  }).join('');

  // ── volume leaders table (every row links into a building page)
  const volRows = (volume || []).map(function (r, i) {
    return '<tr><td class="rank">' + (i + 1) + '</td><td>' + bLink(r.slug, r.display_name) +
      '<span class="hood">' + esc(r.neighborhood || '') + '</span></td><td class="num">' + intc(r.sales_count) +
      '</td><td class="num">' + (money(r.median_price) || '—') +
      '</td><td class="num">' + (money(r.median_psf) || '—') + '</td></tr>';
  }).join('');

  // ── turnover leaders table (honest framing: recorded turnover, not asserted tenure)
  const turnRows = (turnover || []).map(function (r, i) {
    return '<tr><td class="rank">' + (i + 1) + '</td><td>' + bLink(r.slug, r.display_name) +
      '<span class="hood">' + esc(r.neighborhood || '') + '</span></td><td class="num">' +
      esc(r.median_years_since_sale) + ' yrs</td><td class="num dim">' + intc(r.units_tracked) + '</td></tr>';
  }).join('');

  // ── JSON-LD: Dataset + ItemList of the ranked buildings
  const itemListEls = (volume || []).map(function (r, i) {
    return { '@type': 'ListItem', position: i + 1, url: base + '/building/' + r.slug + '/', name: r.display_name };
  });
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Dataset', name: 'San Francisco Condo Market Rankings',
        description: 'Median price per square foot by neighborhood, most-active buildings, and lowest-turnover buildings across cataloged San Francisco condo buildings, based on recorded sales over the trailing twelve months.',
        url: canonical, dateModified: updated, creator: { '@type': 'RealEstateAgent', name: 'McMullen Properties LLC' } },
      { '@type': 'ItemList', name: 'Most Active San Francisco Condo Buildings', itemListElement: itemListEls }
    ]
  };

  const title = 'San Francisco Condo Rankings — Price per Sq Ft, Most Active & Longest-Held Buildings';
  const desc  = 'San Francisco condos ranked by neighborhood price per square foot, sales volume, and owner turnover' +
    (topHood ? '. ' + esc(topHood.neighborhood) + ' leads at ' + money(topHood.median_psf) + '/sqft' : '') +
    '. Updated from recorded sales.';

  const html =
'<!doctype html><html lang="en"><head>' +
'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + esc(title) + '</title>' +
'<meta name="description" content="' + attr(desc) + '">' +
'<link rel="canonical" href="' + canonical + '">' +
'<meta property="og:title" content="' + attr(title) + '">' +
'<meta property="og:description" content="' + attr(desc) + '">' +
'<meta property="og:url" content="' + canonical + '"><meta property="og:type" content="website">' +
'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
'<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
'<script type="application/ld+json">' + JSON.stringify(jsonld) + '</script>' +
'<style>' +
':root{--dark:#f5f7fa;--soft:#eef1f6;--navy:#ffffff;--orange:#C2410C;--orange-bright:#e85d2a;--ivory:#22262f;--dim:#5d6575;--line:#e0e5ed}' +
'*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#22262f;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6}' +
'.wrap{max-width:1040px;margin:0 auto;padding:0 24px}' +
'header.cm{border-bottom:1px solid rgba(194,65,12,.16);background:#12151d}' +
'header.cm .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}' +
'.wm{font-family:"Playfair Display",serif;font-style:italic;font-size:21px;color:#e8e3d8;text-decoration:none}.wm b{color:#e85d2a;font-style:normal;font-weight:700}' +
'.nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:0 22px;min-width:0}' +
'.nav a{color:#8893a6;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-left:0}.nav a:hover{color:#e85d2a}' +
'@media(max-width:720px){header.cm .wrap{height:auto;flex-wrap:wrap;gap:10px;padding-top:12px;padding-bottom:12px}.nav{gap:6px 14px;justify-content:flex-start;width:100%}}' +
'.hero{padding:60px 0 30px;border-bottom:1px solid rgba(194,65,12,.16)}' +
'.kick{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#C2410C;margin:0 0 14px}' +
'h1{font-family:"Playfair Display",serif;font-weight:700;font-size:clamp(30px,5vw,46px);line-height:1.1;margin:0 0 16px}' +
'.lede{font-size:17px;color:#5d6575;max-width:680px;margin:0}' +
'.upd{font-size:12px;color:#5d6575;margin-top:18px;letter-spacing:.03em}' +
'section{padding:46px 0;border-bottom:1px solid rgba(194,65,12,.16)}' +
'h2{font-family:"Playfair Display",serif;font-size:27px;font-weight:700;margin:0 0 6px}' +
'.sub{color:#5d6575;font-size:14px;margin:0 0 22px;max-width:680px}' +
'table{width:100%;border-collapse:collapse;font-size:15px}' +
'th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5d6575;font-weight:700;padding:0 14px 10px;border-bottom:1px solid rgba(194,65,12,.16)}' +
'th.num,td.num{text-align:right}td{padding:13px 14px;border-bottom:1px solid rgba(34,38,47,0.096);vertical-align:top}' +
'td.rank{color:#C2410C;font-weight:700;width:38px}td.num{font-variant-numeric:tabular-nums;font-weight:600}td.dim{color:#5d6575;font-weight:500}' +
'td a{color:#22262f;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(194,65,12,.16)}td a:hover{color:#c2410c}' +
'.hood{display:block;color:#5d6575;font-size:12px;font-weight:500;margin-top:2px}' +
'.method{padding:40px 0 70px}.method p{color:#5d6575;font-size:13.5px;max-width:760px}' +
'.cta{background:#C2410C;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;display:inline-block;margin-top:8px;font-size:14px}' +
'a.bld{color:#c2410c}' +
'</style></head><body>' +
'<header class="cm"><div class="wrap"><a class="wm" href="' + base + '/">Condo <b>Market</b> · sf</a>' +
'<nav class="nav"><a href="' + base + '/san-francisco-condos">Directory</a><a href="' + base + '/san-francisco-condo-market-stats">Stats</a><a href="' + canonical + '">Rankings</a></nav></div></header>' +
'<div class="hero"><div class="wrap">' +
'<p class="kick">San Francisco · Data Rankings</p>' +
'<h1>San Francisco Condo Rankings</h1>' +
'<p class="lede">How San Francisco\u2019s condo buildings rank on the three numbers that actually move a decision: price per square foot by neighborhood, which buildings trade most, and which buildings owners hold longest. Built from recorded sales across our cataloged buildings\u2014not listing hype.</p>' +
'<p class="upd">Updated ' + updated + ' · trailing 12 months of recorded sales</p>' +
'</div></div>' +

'<section><div class="wrap">' +
'<h2>Price per Square Foot, by Neighborhood</h2>' +
'<p class="sub">Median closed-sale price per square foot over the trailing twelve months. Neighborhoods with fewer than five recorded sales are omitted so every number rests on a real sample.</p>' +
'<table><thead><tr><th>#</th><th>Neighborhood</th><th class="num">Median $/sqft</th><th class="num">Median price</th><th class="num">Sales</th></tr></thead><tbody>' +
(psfRows || '<tr><td colspan="5">Data refreshing.</td></tr>') + '</tbody></table>' +
'</div></section>' +

'<section><div class="wrap">' +
'<h2>Most Active Buildings</h2>' +
'<p class="sub">The buildings with the most recorded sales over the trailing twelve months\u2014where liquidity is highest and comparable pricing is clearest. Each links to its full building profile.</p>' +
'<table><thead><tr><th>#</th><th>Building</th><th class="num">Sales</th><th class="num">Median price</th><th class="num">Median $/sqft</th></tr></thead><tbody>' +
(volRows || '<tr><td colspan="5">Data refreshing.</td></tr>') + '</tbody></table>' +
'</div></section>' +

'<section><div class="wrap">' +
'<h2>Lowest Turnover \u2014 Buildings Owners Hold Longest</h2>' +
'<p class="sub">Ranked by the median time since each unit\u2019s most recent recorded sale. A high figure signals owners who stay\u2014though it can also reflect buildings with longer recorded history. Read it as relative turnover, not exact ownership length.</p>' +
'<table><thead><tr><th>#</th><th>Building</th><th class="num">Median since last sale</th><th class="num">Units tracked</th></tr></thead><tbody>' +
(turnRows || '<tr><td colspan="4">Data refreshing.</td></tr>') + '</tbody></table>' +
'</div></section>' +

'<div class="method"><div class="wrap">' +
'<h2 style="font-size:20px">How this is built</h2>' +
'<p>Figures are computed from recorded sale transactions in cataloged San Francisco condo buildings. Price-per-square-foot and price figures are medians (not averages) to resist distortion from outlier sales. The minimum sample-size guard (five sales per neighborhood, three per building, ten units per building for turnover) means a thin slice is left out rather than shown with a misleading number. ' +
(topVol ? esc(topVol.display_name) + ' led recorded activity with ' + intc(topVol.sales_count) + ' sales. ' : '') +
'McMullen Properties LLC · CA DRE #02016832.</p>' +
'<a class="cta" href="' + base + '/buildings/">Browse all buildings \u2192</a>' +
'</div></div>' +
'</body></html>';

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html;charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
}


function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function money(n)  { return (n == null || isNaN(n)) ? null : '$' + Number(n).toLocaleString('en-US'); }
function intc(n)   { return (n == null || isNaN(n)) ? null : Number(n).toLocaleString('en-US'); }
function decade(y) { return y ? (Math.floor(y / 10) * 10) + "'s" : null; }
function tierLabel(u, layout) {
  if (layout === 'townhomes') return 'Townhome community';
  if (u == null) return '';
  if (u >= 200) return 'Large residential tower';
  if (u >= 30)  return 'Mid-size building';
  return 'Boutique building';
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return esc(iso);
  return MONTHS[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10) + ', ' + m[1];
}
function paragraphs(text) {
  return String(text).split(/\n\s*\n/).map(function (blk) {
    return '<p>' + esc(blk.trim()).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

/* --------------------------- page renderer ------------------------------- */
// Reads the backend contract view v_active_listings_display (Active/Pending/Contingent,
// building-matched, Sold excluded, status normalized). Scopes to this market by first
// resolving the market's building slugs (buildings→cities→markets), then filtering the
// view to those slugs. No backend change needed; lights up Pending/Contingent automatically.
async function fetchActiveListingsView(hostMk) {
  const H = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Accept': 'application/json' };
  try {
    // 1. building slugs in this market. Resolve market reliably via the
    //    buildings→cities→markets join (city.domain is null for SV, so we use
    //    markets.wordmark_tag, embedded in the select and filtered in JS).
    const bRes = await fetch(SUPABASE_URL + '/rest/v1/buildings?select=slug,cities!inner(markets!inner(wordmark_tag))&is_catalogued=eq.true&slug=not.like.*-eichlers&limit=3000', { headers: H });
    let slugs = [];
    if (bRes.ok) {
      const brows = await bRes.json();
      (brows || []).forEach(function (b) {
        const tag = b && b.cities && b.cities.markets && b.cities.markets.wordmark_tag;
        if (tag === hostMk.tag) slugs.push(b.slug);
      });
    }
    if (!slugs.length) return { count: 0, listings: [] };
    // 2. view rows for those slugs
    const inList = '(' + slugs.map(function (s) { return '"' + s.replace(/"/g, '') + '"'; }).join(',') + ')';
    const vRes = await fetch(SUPABASE_URL + '/rest/v1/v_active_listings_display?select=*&building_slug=in.' + encodeURIComponent(inList) + '&order=first_listed_at.desc&limit=1000', { headers: H });
    if (!vRes.ok) return { count: 0, listings: [] };
    const rows = await vRes.json();
    /* Listings in buildings we hold no page for (2-4 unit buildings, or buildings
       awaiting a page) are shown too, so the grid is every active listing in
       the market (Tim, 24 Sep 2026). A failure here never empties the grid. */
    try {
      if (hostMk && hostMk.domain) {
        const nRes = await fetch(SUPABASE_URL + '/rest/v1/v_buildingless_listings_display?select=*&market_domain=eq.' + encodeURIComponent(hostMk.domain) + '&order=first_listed_at.desc&limit=1000', { headers: H });
        if (nRes.ok) { const extra = await nRes.json(); if (Array.isArray(extra)) extra.forEach(function (r) { rows.push(r); }); }
      }
    } catch (e) { /* building rows still render */ }
    return { count: (rows || []).length, listings: rows || [] };
  } catch (e) { return { count: 0, listings: [] }; }
}

function renderActiveListings(p, hostMk) {
  const mk     = hostMk || { tag:'sf', region:'San Francisco', brand:'Condo Market SF', domain:'sanfranciscocondomarket.com' };
  const region = mk.region;
  const tag    = mk.tag;
  const domain = mk.domain;
  const brand  = mk.brand;

  const count = (p && p.count != null) ? Number(p.count) : 0;
  const listings = (p && Array.isArray(p.listings)) ? p.listings : [];

  // Status badge from display_status (already normalized by the view).
  function statusBadge(s) {
    const v = (s || 'Active').toString();
    if (v === 'Pending')    return '<span class="al-badge al-badge--pending">Pending</span>';
    if (v === 'Contingent') return '<span class="al-badge al-badge--contingent">Contingent</span>';
    return ''; // Active = no badge (design default)
  }

  // Sort: Active first, then Pending/Contingent; newest first within each.
  const order = { 'Active': 0, 'Pending': 1, 'Contingent': 1 };
  const sorted = listings.slice().sort(function (a, b) {
    const oa = order[a.display_status] != null ? order[a.display_status] : 2;
    const ob = order[b.display_status] != null ? order[b.display_status] : 2;
    if (oa !== ob) return oa - ob;
    return (new Date(b.first_listed_at || 0)) - (new Date(a.first_listed_at || 0));
  });

  // Server-rendered cards (crawlable). Each links to /listing/<mls>.
  const cards = sorted.map(function (a) {
    const aMls   = esc(a.mls_number || '');
    const aSlug  = esc(a.building_slug || '');
    const aUnit  = a.unit_label ? esc(a.unit_label) : '';
    const aAddr  = esc(a.unit_address || a.building_address || '');
    const aPrice = (a.price != null) ? money(Number(a.price)) : 'Price on request';
    const aBeds  = (a.beds != null && a.beds !== '') ? Number(a.beds) : null;
    const aBaths = (a.baths != null && a.baths !== '') ? Number(a.baths) : null;
    const aSqft  = (a.sqft != null && a.sqft !== '') ? Number(a.sqft) : null;
    const badge  = statusBadge(a.display_status);
    // Prefer re-hosted Supabase storage cover over the MLS MediaServer URL in
    // photo_url (hotlink-protected). Cover is always listing-photos/<mls>/00.jpg.
    const aPhoto = aMls
      ? SUPABASE_URL + '/storage/v1/object/public/listing-photos/' + encodeURIComponent(aMls) + '/00.jpg'
      : (a.photo_url || '');
    const specBits = [];
    if (aBeds  != null) specBits.push(aBeds + ' bd');
    if (aBaths != null) specBits.push(aBaths + ' ba');
    if (aSqft  != null) specBits.push(intc(aSqft) + ' sf');
    const spec = specBits.length ? '<div class="al-card-spec">' + specBits.join(' \u00b7 ') + '</div>' : '';
    const media = aPhoto
      ? '<img class="al-card-img" src="' + esc(aPhoto) + '" alt="' + aAddr + '" loading="lazy" onerror="this.classList.add(\'al-card-img--ph\');this.removeAttribute(\'src\');">'
      : '<div class="al-card-img al-card-img--ph" role="img" aria-label="' + aAddr + '"></div>';
    return '<a class="al-card" href="/listing/' + aMls + '" data-mls="' + aMls + '" data-price="' + (a.price != null ? a.price : '') + '">' +
      '<div class="al-card-media">' + media + (badge ? '<div class="al-card-badge-wrap">' + badge + '</div>' : '') + '</div>' +
      '<div class="al-card-body">' +
      '<div class="al-card-price">' + aPrice + '</div>' +
      '<div class="al-card-bldg">' + esc(a.building_address || aSlug) + (aUnit ? ' \u00b7 #' + aUnit : '') + '</div>' +
      (a.city ? '<div class="al-card-hood">' + esc(a.city) + '</div>' : '') +
      spec +
      '</div></a>';
  }).join('');

  const grid = count > 0
    ? '<div class="al-grid" id="al-grid">' + cards + '</div>'
    : '<div class="al-empty"><p>No active listings right now \u2014 the market moves fast. Check back soon, or browse buildings to set up alerts.</p>' +
      '<a class="btn-primary" href="/buildings/">Browse buildings</a></div>';

  const title = 'Active Condo Listings for Sale \u00b7 ' + brand;
  const metaDesc = esc('Every active condo listing in ' + region + ' tracked to its building \u2014 ' + (count > 0 ? count + ' currently for sale. ' : '') + 'Live MLS data, building-matched, with full per-unit detail.');
  const canonical = 'https://www.' + domain + '/active-listings';

  const AL_CSS =
    '.al-wrap-head{padding:36px 0 8px}' +
    '.al-count{font-family:"Playfair Display",Georgia,serif;font-style:italic;color:#C2410C;font-size:15px}' +
    '.al-layout{display:grid;grid-template-columns:1fr;gap:24px;margin-top:8px}' +
    '#al-map{width:100%;height:0;border-radius:16px;overflow:hidden;transition:height .2s;background:rgba(34,38,47,0.036)}' +
    '#al-map.is-on{height:380px;margin-bottom:8px}' +
    '.al-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:22px}' +
    '.al-card{display:block;background:rgba(34,38,47,0.03);border:1px solid rgba(34,38,47,0.084);border-radius:16px;overflow:hidden;text-decoration:none;transition:border-color .15s,transform .15s}' +
    '.al-card:hover{border-color:rgba(34,38,47,0.28);transform:translateY(-2px)}' +
    '.al-card-img{width:100%;height:180px;object-fit:cover;display:block;background:rgba(34,38,47,0.048)}' +
    '.al-card-media{position:relative}' +
    '.al-card-badge-wrap{position:absolute;top:12px;left:12px}' +
    '.al-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 11px;border-radius:6px;backdrop-filter:blur(6px)}' +
    '.al-badge--pending{background:rgba(217,119,6,.92);color:#fff}' +
    '.al-badge--contingent{background:rgba(217,119,6,.92);color:#fff}' +
    '.al-card-img--ph{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(34,38,47,0.06),rgba(34,38,47,0.02))}' +
    '.al-card-body{padding:15px 17px 17px}' +
    '.al-card-price{font-family:"Playfair Display",Georgia,serif;font-size:22px;color:#22262f;font-weight:700}' +
    '.al-card-bldg{font-size:13px;color:#22262f;margin-top:4px}' +
    '.al-card-hood{font-size:12px;color:#C2410C;margin-top:2px}' +
    '.al-card-spec{font-size:12px;color:#5d6575;margin-top:8px}' +
    '.al-empty{text-align:center;padding:60px 20px;color:#5d6575}' +
    '.al-empty .btn-primary{margin-top:18px}' +
    '.btn-primary{display:inline-block;background:#9fb4d8;color:#ffffff;font-weight:600;font-size:14px;padding:13px 26px;border-radius:999px;text-decoration:none}';

  // Map enhancement: only initializes if listings carry lat/lng (pending CRO5 RPC field).
  // Reads data-lat/data-lng off the server-rendered cards — no extra fetch.
  const mapScript =
    '<script>(function(){' +
    'var cards=[].slice.call(document.querySelectorAll(".al-card[data-lat][data-lng]"));' +
    'if(!cards.length)return;' +              // no coords yet → map stays hidden, grid stands alone
    'var box=document.getElementById("al-map");if(!box)return;' +
    'var css=document.createElement("link");css.rel="stylesheet";css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(css);' +
    'var js=document.createElement("script");js.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";' +
    'js.onload=function(){' +
    'box.classList.add("is-on");' +
    'var map=L.map(box,{scrollWheelZoom:false}).setView([37.78,-122.41],12);' +
    'L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=__CARTO_KEY__",{attribution:"\\u00a9 OpenStreetMap, \\u00a9 CARTO",maxZoom:19}).addTo(map);' +
    'var pts=[];' +
    'cards.forEach(function(c){var la=parseFloat(c.getAttribute("data-lat")),ln=parseFloat(c.getAttribute("data-lng"));if(isNaN(la)||isNaN(ln))return;' +
    'var pr=c.getAttribute("data-price"),href=c.getAttribute("href");' +
    'var m=L.circleMarker([la,ln],{radius:8,fillColor:"#9fb4d8",color:"#0a0d12",weight:2,fillOpacity:.9}).addTo(map);' +
    'm.on("click",function(){window.location.href=href;});' +
    'pts.push([la,ln]);});' +
    'if(pts.length)map.fitBounds(pts,{padding:[40,40],maxZoom:14});' +
    '};document.head.appendChild(js);' +
    '})();</script>';

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="description" content="' + metaDesc + '">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + metaDesc + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">\n' +
    '<style>' + CSS + '</style>\n<style>' + EXTRA_CSS + '</style>\n<style>' + AL_CSS + '</style>\n' +
    '</head>\n<body>\n' +
    '<header class="masthead"><div class="wrap"><div class="masthead-row">' +
    '<a href="/" class="wordmark">Condo <em>Market</em> \u00b7 ' + tag + '</a>' +
    '<nav class="nav-meta">' +
    '<a href="/buildings/">Buildings</a><a href="/intelligence/">Intelligence</a>' +
    '<a href="/active-listings">Active Listings</a><a href="/how-it-works/">How it works</a>' +
    '<a href="/news/">Local News</a>' +
    '<a href="#signin" data-cm-auth="login" class="signin-btn">Sign in</a>' +
    '</nav></div></div></header>\n\n' +
    '<div class="wrap"><div class="crumb">' +
    '<a href="/">Condo Market</a><span class="sep">/</span>Active Listings' +
    '</div></div>\n\n' +
    '<main><div class="wrap">' +
    '<div class="al-wrap-head">' +
    '<div class="section-kicker">For sale now</div>' +
    '<h1 style="font-family:\'Playfair Display\',Georgia,serif;font-size:40px;color:#22262f;margin:6px 0 0;">Active <em style="color:#C2410C;font-style:italic;">Listings</em></h1>' +
    '<p class="al-count">' + (count > 0 ? count + ' active in ' + region + ', tracked to their buildings.' : 'Live MLS, building-matched.') + '</p>' +
    '</div>' +
    '<div class="al-layout"><div id="al-map"></div>' + grid + '</div>' +
    '</div></main>\n\n' +
    leadToolsSection('', null, mk) +
    CM_FOOTER(p.footerData) +
    mapScript + '\n' +
    '</body>\n</html>';
}


function renderListing(d, footerData) {
  // Reads the listing_detail(p_mls) RPC payload. SF defaults; applyMarketSwaps()
  // recolors/renames for SV at serve time.
  const mlsBrand = 'Condo Market SF';
  const region   = 'San Francisco';
  const tag      = 'sf';
  const domain   = 'sanfranciscocondomarket.com';

  const mls       = esc(d.mls);
  const bSlug     = esc(d.building_slug || '');
  const bName     = esc(d.building_name || 'Building');
  const hood      = d.neighborhood ? esc(d.neighborhood) : '';
  const unitAddr  = esc(d.address || '');
  const unitLabel = d.unit ? esc(d.unit) : '';
  const city      = esc(d.city || region);
  const zip       = esc(d.zip || '');
  const priceNum  = (d.price != null) ? Number(d.price) : null;
  const beds      = (d.beds != null && d.beds !== '') ? Number(d.beds) : null;
  const baths     = (d.baths != null && d.baths !== '') ? Number(d.baths) : null;
  const sqft      = (d.sqft != null && d.sqft !== '') ? Number(d.sqft) : null;
  const yearBuilt = (d.year_built != null) ? d.year_built : null;
  const lat       = (d.lat != null) ? Number(d.lat) : null;
  const lng       = (d.lng != null) ? Number(d.lng) : null;
  const descriptor = d.descriptor ? esc(d.descriptor) : '';
  const bStats    = d.building_stats || {};
  const buildingUrl = '/building/' + bSlug;
  const ppsf      = (priceNum != null && sqft) ? Math.round(priceNum / sqft) : null;
  const priceDisp = (priceNum != null) ? money(priceNum) : 'Price on request';

  // Photos: photos[] is 1..N. Single photo → hero only; many → gallery grid.
  const photos = Array.isArray(d.photos) ? d.photos.map(function (p) { return p && p.url; }).filter(Boolean) : [];
  const heroSrc = photos.length ? photos[0] : '';
  const heroMedia = heroSrc
    ? '<img class="hero-img" src="' + esc(heroSrc) + '" alt="' + unitAddr + '" loading="eager" ' +
      'onerror="this.classList.add(\'hero-img--ph\');this.removeAttribute(\'src\');">'
    : '<div class="hero-img hero-img--ph" role="img" aria-label="' + unitAddr + '"></div>';

  let gallerySection = '';
  if (photos.length > 1) {
    const items = photos.map(function (u, i) {
      return '<div class="lg-item' + (i === 0 ? ' lg-item--lead' : '') + '">' +
        '<img src="' + esc(u) + '" alt="' + unitAddr + ' \u2014 photo ' + (i + 1) + '" loading="' + (i < 2 ? 'eager' : 'lazy') + '" ' +
        'onerror="this.parentNode.style.display=\'none\';"></div>';
    }).join('');
    gallerySection =
      '<section class="section" id="gallery"><div class="wrap">' +
      '<div class="section-head"><div class="section-kicker">Photography</div>' +
      '<h2 class="section-title">' + photos.length + ' <em>photos</em></h2></div>' +
      '<div class="lg-grid">' + items + '</div>' +
      '</div></section>\n';
  }

  // Hero stat tiles (hide nulls).
  const hstats = [];
  if (beds  != null) hstats.push('<div><div class="hstat-label">Beds</div><div class="hstat-val">' + beds + '</div></div>');
  if (baths != null) hstats.push('<div><div class="hstat-label">Baths</div><div class="hstat-val">' + baths + '</div></div>');
  if (sqft  != null) hstats.push('<div><div class="hstat-label">Sq Ft</div><div class="hstat-val">' + intc(sqft) + '</div></div>');
  if (ppsf  != null) hstats.push('<div><div class="hstat-label">$/sf</div><div class="hstat-val"><span class="peri">' + money(ppsf) + '</span></div></div>');
  const heroStats = hstats.length ? '<div class="hero-stats">' + hstats.join('') + '</div>' : '';

  // Facts block.
  const facts = [];
  if (bSlug) facts.push(['Building', '<a href="' + buildingUrl + '" style="color:inherit;text-decoration:underline;">' + bName + '</a>']);
  if (hood)      facts.push(['Neighborhood', hood]);
  if (unitLabel) facts.push(['Unit', unitLabel]);
  facts.push(['Address', unitAddr]);
  if (city)      facts.push(['City', city + (zip ? ' ' + zip : '')]);
  if (priceNum != null) facts.push(['List price', money(priceNum)]);
  if (beds  != null) facts.push(['Bedrooms', String(beds)]);
  if (baths != null) facts.push(['Bathrooms', String(baths)]);
  if (sqft  != null) facts.push(['Interior', intc(sqft) + ' sq ft']);
  if (ppsf  != null) facts.push(['Price / sq ft', money(ppsf)]);
  if (yearBuilt != null) facts.push(['Year built', String(yearBuilt)]);
  facts.push(['Status', 'Active']);
  facts.push(['MLS #', mls]);
  const factsBlock =
    '<div class="dossier-card"><div class="facts">' +
    facts.map(function (f) { return '<div class="fact"><div class="fact-label">' + f[0] + '</div><div class="fact-val">' + f[1] + '</div></div>'; }).join('') +
    '</div></div>';

  // About this home — generated factual descriptor (always present; our own prose).
  const aboutSection = descriptor
    ? '<section class="section" id="about"><div class="wrap">' +
      '<div class="section-head"><div class="section-kicker">About this home</div>' +
      '<h2 class="section-title">The <em>residence</em></h2></div>' +
      '<div class="prose"><p>' + descriptor + '</p></div>' +
      '</div></section>\n'
    : '';

  // Building intelligence panel — the differentiator. From building_stats.
  let intelSection = '';
  const bPsf  = (bStats.median_psf_12mo   != null) ? Number(bStats.median_psf_12mo)   : null;
  const bMed  = (bStats.median_price_12mo != null) ? Number(bStats.median_price_12mo) : null;
  const bSold = (bStats.sold_12mo         != null) ? Number(bStats.sold_12mo)         : null;
  if (bPsf != null || bMed != null || bSold != null) {
    const tiles = [];
    if (bSold != null) tiles.push('<div class="bi-tile"><div class="bi-val">' + intc(bSold) + '</div><div class="bi-lab">Sales, last 12 mo</div></div>');
    if (bPsf  != null) tiles.push('<div class="bi-tile"><div class="bi-val">' + money(bPsf) + '</div><div class="bi-lab">Median $/sq ft</div></div>');
    if (bMed  != null) tiles.push('<div class="bi-tile"><div class="bi-val">' + money(bMed) + '</div><div class="bi-lab">Median sale price</div></div>');
    intelSection =
      '<section class="section" id="intel"><div class="wrap">' +
      '<div class="section-head"><div class="section-kicker">Building intelligence</div>' +
      '<h2 class="section-title">' + bName + ' <em>by the numbers</em></h2>' +
      '<p class="section-sub">Our proprietary read on the building behind this listing \u2014 ten years of sales, tenure, and trend.</p></div>' +
      '<div class="bi-grid">' + tiles.join('') + '</div>' +
      '<a class="bi-link" href="' + buildingUrl + '">See all sales &amp; trends at ' + bName + ' \u2192</a>' +
      '</div></section>\n';
  }

  // Map (single marker).
  let mapSection = '';
  if (lat != null && lng != null) {
    mapSection =
      '<section class="section" id="map"><div class="wrap">' +
      '<div id="cm-listing-map" data-lat="' + lat + '" data-lng="' + lng + '"></div>' +
      '</div></section>\n';
  }

  // Tools: Schedule Showing + Create Offer (hooks for the offer workflow).
  const toolsSection =
    '<section class="section" id="tools"><div class="wrap">' +
    '<div class="section-head"><div class="section-kicker">Make a move</div>' +
    '<h2 class="section-title">Interested in <em>' + (unitLabel ? ('Unit ' + unitLabel) : 'this home') + '</em>?</h2>' +
    '<p class="section-sub">Schedule a showing, or start an offer. Every offer is personally reviewed by Tim on a short video call before drafting.</p></div>' +
    '<div class="cta-row">' +
    '<a class="btn-primary" href="#" data-cm-offer data-mls="' + mls + '" data-building="' + bSlug + '" data-unit="' + unitLabel + '" data-price="' + (priceNum != null ? priceNum : '') + '">Create an offer</a>' +
    '<a class="btn-ghost" href="#" data-cm-showing data-mls="' + mls + '" data-building="' + bSlug + '">Schedule a showing</a>' +
    '</div>' +
    '<p class="tools-fineprint">A valid offer requires lender pre-approval and proof of funds, uploaded securely during the offer flow.</p>' +
    '</div></section>';

  // MLS attribution (building-level; per-listing agent attribution arrives with API access).
  const attribution =
    '<section class="section" id="attribution"><div class="wrap">' +
    '<p class="mls-attribution">Listing data deemed reliable but not guaranteed. ' +
    'Active-listing information is displayed as a courtesy; the listing agent and brokerage of record represent the seller. ' +
    (bSlug ? bName + ' \u00b7 ' : '') + mls + '.</p>' +
    '</div></section>';

  // JSON-LD.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    'name': (unitAddr || bName) + (unitLabel && unitAddr.indexOf('#') === -1 ? ' #' + unitLabel : ''),
    'url': 'https://www.' + domain + '/listing/' + mls,
    'description': d.descriptor || undefined,
    'address': { '@type': 'PostalAddress', 'streetAddress': unitAddr, 'addressLocality': city, 'postalCode': zip, 'addressRegion': 'CA', 'addressCountry': 'US' },
    'geo': (lat != null && lng != null) ? { '@type': 'GeoCoordinates', 'latitude': lat, 'longitude': lng } : undefined,
    'offers': (priceNum != null) ? { '@type': 'Offer', 'price': priceNum, 'priceCurrency': 'USD', 'availability': 'https://schema.org/InStock' } : undefined,
  };
  const jsonLdScript = '<script type="application/ld+json">' + JSON.stringify(jsonLd).replace(/</g, '\\u003c') + '</script>';

  const title = (unitAddr || bName) + (unitLabel && unitAddr.indexOf('#') === -1 ? ' #' + unitLabel : '') + ' \u00b7 For Sale \u00b7 ' + mlsBrand;
  const metaDesc = esc(
    (unitAddr || bName) + ' is for sale' +
    (priceNum != null ? ' at ' + money(priceNum) : '') +
    (beds != null ? ' \u2014 ' + beds + ' bed' : '') +
    (baths != null ? ', ' + baths + ' bath' : '') +
    (sqft != null ? ', ' + intc(sqft) + ' sq ft' : '') +
    (bSlug ? ' in ' + bName + (hood ? ', ' + hood : '') : (hood ? ' in ' + hood : '')) + ', ' + region + '.'
  );
  const canonical = 'https://www.' + domain + '/listing/' + mls;

  const LISTING_CSS =
    '.cta-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}' +
    '.btn-primary{display:inline-block;background:#9fb4d8;color:#ffffff;font-weight:600;font-size:14px;padding:14px 28px;border-radius:999px;text-decoration:none;transition:filter .15s}' +
    '.btn-primary:hover{filter:brightness(1.08)}' +
    '.btn-ghost{display:inline-block;border:1px solid rgba(34,38,47,0.28);color:#22262f;font-weight:600;font-size:14px;padding:14px 28px;border-radius:999px;text-decoration:none;transition:border-color .15s}' +
    '.btn-ghost:hover{border-color:#C2410C}' +
    '.tools-fineprint{font-size:12px;color:#5d6575;margin-top:16px}' +
    '.mls-attribution{font-size:11px;line-height:1.6;color:#5d6575}' +
    '.listing-price{font-family:"Playfair Display",Georgia,serif;font-size:34px;color:#22262f;margin:8px 0 0}' +
    '.lg-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}' +
    '.lg-item{border-radius:12px;overflow:hidden;background:rgba(34,38,47,0.036);aspect-ratio:4/3}' +
    '.lg-item--lead{grid-column:1 / -1;aspect-ratio:16/9}' +
    '.lg-item img{width:100%;height:100%;object-fit:cover;display:block}' +
    '@media(min-width:760px){.lg-grid{grid-template-columns:repeat(3,1fr)}.lg-item--lead{grid-column:1 / -1;aspect-ratio:21/9}}' +
    '.bi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}' +
    '.bi-tile{background:rgba(34,38,47,0.036);border:1px solid rgba(34,38,47,0.098);border-radius:14px;padding:22px 20px;text-align:center}' +
    '.bi-val{font-family:"Playfair Display",Georgia,serif;font-size:30px;color:#22262f;font-weight:700}' +
    '.bi-lab{font-size:12px;color:#5d6575;margin-top:6px;letter-spacing:.04em}' +
    '.bi-link{display:inline-block;margin-top:20px;color:#C2410C;font-weight:600;font-size:14px;text-decoration:none}' +
    '.bi-link:hover{text-decoration:underline}' +
    '#cm-listing-map{width:100%;height:340px;border-radius:16px;overflow:hidden;background:rgba(34,38,47,0.036)}';

  const mapScript = (lat != null && lng != null)
    ? '<script>(function(){var box=document.getElementById("cm-listing-map");if(!box)return;' +
      'var la=parseFloat(box.getAttribute("data-lat")),ln=parseFloat(box.getAttribute("data-lng"));if(isNaN(la)||isNaN(ln))return;' +
      'var css=document.createElement("link");css.rel="stylesheet";css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(css);' +
      'var js=document.createElement("script");js.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";' +
      'js.onload=function(){var map=L.map(box,{scrollWheelZoom:false,zoomControl:true}).setView([la,ln],15);' +
      'L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=__CARTO_KEY__",{attribution:"\\u00a9 OpenStreetMap, \\u00a9 CARTO",maxZoom:19}).addTo(map);' +
      'L.circleMarker([la,ln],{radius:9,fillColor:"#9fb4d8",color:"#0a0d12",weight:2,fillOpacity:.95}).addTo(map);};document.head.appendChild(js);' +
      '})();</script>'
    : '';

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="description" content="' + metaDesc + '">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + metaDesc + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n' +
    (heroSrc ? '<meta property="og:image" content="' + esc(heroSrc) + '">\n' : '') +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">\n' +
    jsonLdScript + '\n' +
    '<style>' + CSS + '</style>\n' +
    '<style>' + EXTRA_CSS + '</style>\n' +
    '<style>' + LISTING_CSS + '</style>\n' +
    '</head>\n<body>\n' +
    '<header class="masthead"><div class="wrap"><div class="masthead-row">' +
    '<a href="/" class="wordmark">Condo <em>Market</em> \u00b7 ' + tag + '</a>' +
    '<nav class="nav-meta">' +
    '<a href="/buildings/">Buildings</a><a href="/intelligence/">Intelligence</a>' +
    '<a href="/active-listings">Active Listings</a><a href="/how-it-works/">How it works</a>' +
    '<a href="/news/">Local News</a>' +
    '<a href="#signin" data-cm-auth="login" class="signin-btn">Sign in</a>' +
    '</nav></div></div></header>\n\n' +
    '<div class="wrap"><div class="crumb">' +
    '<a href="/">Condo Market</a><span class="sep">/</span>' +
    '<a href="/active-listings">Active Listings</a><span class="sep">/</span>' +
    (bSlug ? '<a href="' + buildingUrl + '">' + bName + '</a><span class="sep">/</span>' : '') + (unitLabel || mls) +
    '</div></div>\n\n' +
    '<main>\n' +
    '<section class="hero"><div class="wrap"><div class="hero-head"><div>' +
    (hood ? '<div class="hero-kicker">' + hood + ' \u00b7 For Sale</div>' : '<div class="hero-kicker">For Sale</div>') +
    '<h1>' + (unitAddr || bName) + '<em>.</em></h1>' +
    '<div class="listing-price">' + priceDisp + '</div>' +
    heroStats +
    '</div><div class="hero-img-wrap">' +
    (hood ? '<span class="hero-badge">' + hood + '</span>' : '') +
    heroMedia +
    '</div></div></div></section>\n' +
    gallerySection +
    aboutSection +
    '<section class="section"><div class="wrap">' +
    '<div class="section-head"><div class="section-kicker">The unit</div>' +
    '<h2 class="section-title">Details <em>&amp; facts</em></h2></div>' +
    factsBlock +
    '</div></section>\n' +
    intelSection +
    mapSection +
    toolsSection +
    attribution +
    '</main>\n\n' +
    CM_FOOTER(footerData) +
    '<script src="/assets/cm-supabase.js" defer></script>\n' +
    '<script src="/assets/cm-actions.js" defer></script>\n' +
    mapScript + '\n' +
    '</body>\n</html>';
}

// ── Lead-capture tools section: HOA cheat-sheet, video market review, and a
// funnel-aware "talk to Tim" capture + Google Calendar scheduler. Rendered on
// building pages and active-listing pages. Submits to capture_lead / hoa-doc-request.
function leadToolsSection(slug, buildingName, mk) {
  var hasBuilding = !!(slug && String(slug).length);
  var nm = esc(buildingName || (mk && mk.region ? mk.region : 'this market'));
  var s  = esc(slug || '');
  var market = (mk && mk.tag === 'sv') ? 'sv' : 'sf';
  var calUrl = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ3Ro-mJuYsbPWaLPZXUTo6gEa9qxdTVMpdX1E88E529PAUTuDC2CXdwNgjQrDsOJGo8IZRD8og5?gv=true';
  var heading = hasBuilding ? ('Get the inside view on <em>' + nm + '</em>') : ('Get the inside view on the <em>' + nm + '</em> market');
  var videoCopy = hasBuilding
    ? ('A short video walkthrough of recent sales in ' + nm + ' and the buildings around it \u2014 what\u2019s moving, and what it means for value.')
    : ('A short video walkthrough of what\u2019s selling across ' + nm + ' right now \u2014 the buildings to watch and what it means for value.');
  return ''
  + '<section class="section" id="resources"><div class="wrap">'
  + '<div class="section-head"><div class="section-kicker">Go deeper</div>'
  + '<h2 class="section-title">' + heading + '</h2>'
  + '<p class="section-sub">' + (hasBuilding ? 'Three ways' : 'A couple of ways') + ' to learn more \u2014 no account required. Tell us where to send it and it\u2019s on its way.</p></div>'
  + '<div class="lt-grid' + (hasBuilding ? '' : ' lt-grid--2') + '">'
  // Tool 1: Video market review
  + '<div class="lt-card" data-lt-tool="video_review">'
  + '<div class="lt-ic">\u25B6</div>'
  + '<h3>Watch the market review</h3>'
  + '<p>' + videoCopy + '</p>'
  + '<form class="lt-form" data-lt-form="video_review"><input type="email" required placeholder="you@email.com" aria-label="Your email"><button type="submit">Send me the video \u2192</button></form>'
  + '<div class="lt-done" hidden>\u2713 On its way \u2014 check your inbox shortly.</div>'
  + '</div>'
  // Tool 2: HOA / CC&R cheat sheet (building pages only \u2014 needs a specific building)
  + (hasBuilding ? (
      '<div class="lt-card" data-lt-tool="hoa_docs">'
    + '<div class="lt-ic">\u25A4</div>'
    + '<h3>HOA &amp; CC&amp;R cheat sheet</h3>'
    + '<p>A plain-English summary of ' + nm + '\u2019s rules, fees, rental policy, and the fine print that actually matters \u2014 delivered within 24 hours.</p>'
    + '<form class="lt-form" data-lt-form="hoa_docs"><input type="email" required placeholder="you@email.com" aria-label="Your email"><button type="submit">Email me the summary \u2192</button></form>'
    + '<div class="lt-done" hidden>\u2713 Got it \u2014 your summary arrives within 24 hours.</div>'
    + '</div>'
    ) : '')
  // Tool 3: Talk to Tim (funnel-aware: high intent)
  + '<div class="lt-card lt-card--cal" data-lt-tool="tour_request">'
  + '<div class="lt-ic">\u25C9</div>'
  + '<h3>Talk it through with Tim</h3>'
  + '<p>Ready to go deeper? Grab a time directly \u2014 or leave your email and Tim will reach out.</p>'
  + '<button type="button" class="lt-cal-open" data-cal-open>Book a time \u2192</button>'
  + '<form class="lt-form lt-form--inline" data-lt-form="tour_request"><input type="email" required placeholder="\u2026or leave your email" aria-label="Your email"><button type="submit">Send</button></form>'
  + '<div class="lt-done" hidden>\u2713 Thanks \u2014 Tim will be in touch.</div>'
  + '</div>'
  + '</div>'
  // Calendar drawer (hidden until opened)
  + '<div class="lt-cal-wrap" id="lt-cal-wrap" hidden><iframe src="' + calUrl + '" style="border:0" width="100%" height="600" frameborder="0" title="Schedule with Tim"></iframe></div>'
  + '</div>'
  + '<style>'
  + '.lt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:8px}'
  + '.lt-grid--2{grid-template-columns:repeat(2,1fr);max-width:720px}'
  + '.lt-card{background:#ffffff;border:1px solid rgba(34,38,47,0.112);border-radius:16px;padding:26px 24px;display:flex;flex-direction:column}'
  + '.lt-ic{width:42px;height:42px;border-radius:11px;background:rgba(34,38,47,0.084);color:#C2410C;display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:16px}'
  + '.lt-card h3{font-family:inherit;font-size:18px;margin:0 0 8px;color:#22262f}'
  + '.lt-card p{font-size:14px;line-height:1.55;color:#5d6575;margin:0 0 18px;flex:1}'
  + '.lt-form{display:flex;flex-direction:column;gap:8px}'
  + '.lt-form--inline{margin-top:10px}'
  + '.lt-form input{background:rgba(34,38,47,0.077);border:1px solid rgba(34,38,47,0.154);border-radius:9px;padding:11px 13px;color:#22262f;font-family:inherit;font-size:14px}'
  + '.lt-form input:focus{outline:none;border-color:#C2410C}'
  + '.lt-form button,.lt-cal-open{background:#9fb4d8;color:#ffffff;border:none;border-radius:9px;padding:11px 16px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:filter .15s}'
  + '.lt-form button:hover,.lt-cal-open:hover{filter:brightness(1.06)}'
  + '.lt-cal-open{width:100%;margin-bottom:4px}'
  + '.lt-done{font-size:13px;color:#C2410C;font-weight:600;padding-top:6px}'
  + '.lt-cal-wrap{margin-top:22px;background:#fff;border-radius:14px;overflow:hidden}'
  + '@media(max-width:760px){.lt-grid{grid-template-columns:1fr}}'
  + '</style>'
  + '<script>(function(){'
  + 'var SB="' + SUPABASE_URL + '",AK="' + SUPABASE_ANON_KEY + '",SLUG="' + s + '",NM="' + nm.replace(/"/g,'\\"') + '",MK="' + market + '";'
  + 'function track(t,m){try{if(window.cmTrack)window.cmTrack(t,m);}catch(e){}}'
  + 'var capIntent={video_review:"video_review",tour_request:"tour_request"};'
  + 'document.querySelectorAll("[data-lt-form]").forEach(function(f){'
  + 'f.addEventListener("submit",function(e){e.preventDefault();'
  + 'var tool=f.getAttribute("data-lt-form");var email=(f.querySelector("input")||{}).value;'
  + 'if(!email)return;var btn=f.querySelector("button");if(btn){btn.disabled=true;btn.textContent="Sending\u2026";}'
  + 'var done=function(){var d=f.parentNode.querySelector(".lt-done");if(d){f.style.display="none";d.hidden=false;}track("cta_click",{tool:tool,action:"lead_captured",building:SLUG});};'
  + 'var fail=function(){if(btn){btn.disabled=false;btn.textContent="Try again";}};'
  + 'if(tool==="hoa_docs"){'
  + 'fetch(SB+"/functions/v1/hoa-doc-request",{method:"POST",headers:{"Content-Type":"application/json","apikey":AK,"Authorization":"Bearer "+AK},body:JSON.stringify({email:email,building_slug:SLUG,building_name:NM,market:MK})}).then(function(r){return r.json();}).then(function(j){if(j&&j.ok)done();else fail();}).catch(fail);'
  + '}else{'
  + 'fetch(SB+"/rest/v1/rpc/capture_lead",{method:"POST",headers:{"Content-Type":"application/json","apikey":AK,"Authorization":"Bearer "+AK},body:JSON.stringify({p_email:email,p_building_slug:SLUG,p_intent:capIntent[tool]||"interest",p_source:tool+"_form",p_message:tool+" request for "+NM})}).then(function(r){if(r.ok)done();else fail();}).catch(fail);'
  + '}});});'
  + 'var co=document.querySelector("[data-cal-open]");if(co){co.addEventListener("click",function(){var w=document.getElementById("lt-cal-wrap");if(w){w.hidden=false;w.scrollIntoView({behavior:"smooth",block:"center"});track("cta_click",{tool:"calendar",action:"opened",building:SLUG});}});}'
  + '})();</script>'
  + '</section>';
}

function renderBuilding(p) {
  const name = esc(p.name);
  const slug = esc(p.slug);
  const hood = p.neighborhood ? esc(p.neighborhood) : '';
  const addr = p.address ? esc(p.address) : '';
  const st   = p.stats || {};
  const mk       = p.market || {};
  const mkBrand  = mk.brand  || 'Condo Market SF';
  const mkRegion = mk.region || 'San Francisco';
  const mkTag    = mk.tag    || 'sf';
  const mkEmail  = mk.email  || 'tim@sanfranciscocondomarket.com';
  const mkDomain = mk.domain || 'sanfranciscocondomarket.com';
  const psf  = (st.median_psf_12mo != null) ? Number(st.median_psf_12mo) : null;
  const medPrice = (st.median_price_12mo != null) ? Number(st.median_price_12mo) : null;

  const layout     = p.layout_kind || 'tower';
  const isTownhomes = layout === 'townhomes';
  const countWord  = isTownhomes ? 'home' : 'unit';
  const countWordPl = isTownhomes ? 'Homes' : 'Units';
  const countCardLabel = isTownhomes ? 'Home count' : 'Unit count';
  const dossierTitleSuffix = isTownhomes ? 'home by <em>home</em>' : 'by the <em>numbers</em>';
  const enhancedCtaCopy = isTownhomes
    ? 'Home-level sale history, owner tenure patterns, price trajectories, sale-to-list ratios, and off-market activity signals \u2014 all available to members. Free to sign up.'
    : 'Unit-level sale history, owner tenure patterns, price trajectories, sale-to-list ratios, and off-market activity signals \u2014 all available to members. Free to sign up.';
  const propertyKind = isTownhomes ? 'townhome community' : 'condominium building';

  /* HERO */
  const hstats = [];
  if (p.unit_count != null) hstats.push('<div><div class="hstat-label">' + countWordPl + '</div><div class="hstat-val">' + intc(p.unit_count) + '</div></div>');
  if (p.year_built != null) hstats.push('<div><div class="hstat-label">Built</div><div class="hstat-val">' + p.year_built + '</div></div>');
  if (p.floors != null)     hstats.push('<div><div class="hstat-label">Floors</div><div class="hstat-val">' + p.floors + '</div></div>');
  if (psf != null)          hstats.push('<div><div class="hstat-label">Median $/sf</div><div class="hstat-val"><span class="peri">' + money(psf) + '</span></div></div>');
  const heroStats = hstats.length ? '<div class="hero-stats">' + hstats.join('') + '</div>' : '';

  const heroMedia = p.hero_url
    ? '<img class="hero-img" src="' + esc(p.hero_url) + '" alt="' + name + '" loading="eager">'
    : '<div class="hero-img hero-img--ph" role="img" aria-label="' + name + '"></div>';

  /* HERO ASK (T8)
   * Every offer CTA on this page sat below the fold, and only ~15% of visitors
   * scroll past 50% - so for most traffic the page never made an ask at all.
   * Platform-wide that produced 5 CTA clicks from 5,269 humans.
   * This ask is bound to the building being viewed and quotes its median $/sf
   * where known, so the question is concrete rather than generic.
   * data-cta drives cta_click tracking without touching the modal handler. */
  const heroAskLine = (psf != null)
    ? 'Units here trade around ' + money(psf) + '/sq ft. What would yours sell for?'
    : 'Every unit here is open to an offer \u2014 listed or not.';
  /* DISCLOSURE CTA (T9)
   * The strongest reason to open an account on a building page: we have read
   * this association's HOA documents and written them up.
   *
   * Two rules hold this together.
   *
   * 1. NO REVIEW, NO CLAIM. `p.disclosure` is null unless Platform A returned
   *    has_review, so the block cannot render a promise we cannot keep. There
   *    is deliberately no "request a review" variant — inviting a signup for
   *    documents nobody has read is the fabrication the platform forbids.
   *
   * 2. THE DATE IS ALWAYS SHOWN. Reviews never expire and are never hidden, so
   *    an archival review is offered on the same terms as a current one, with
   *    its age stated plainly. A member deciding whether a 2024 budget is
   *    useful is better served than a member shown nothing at all.
   */
  let disclosureCta = '';
  if (p.disclosure && p.disclosure.has_review) {
    const d = p.disclosure;
    const docs = Array.isArray(d.doc_types) ? d.doc_types.filter(Boolean) : [];
    const asOf = d.latest_as_of
      ? new Date(String(d.latest_as_of) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : null;
    const ageNote = (d.age_label === 'current')
      ? 'The most recent documents we hold'
      : (d.age_label === 'dated')
        ? 'The most recent documents we hold \u2014 read them with their date in mind'
        : 'An older record, kept because it is the last one anyone outside the board has seen';
    const docLine = docs.length
      ? 'Covering ' + esc(docs.slice(0, 4).join(', ')) + (docs.length > 4 ? ' and more' : '') + '.'
      : '';
    const heldLine = (Number(d.review_count) > 1)
      ? '<p class="disc-cta-held">' + Number(d.review_count) + ' reviews on file for this building \u2014 the archive shows how the dues, the reserve and the litigation moved.</p>'
      : '';
    disclosureCta =
      '<div class="disc-cta">'
      + '<div class="disc-cta-kicker">HOA documents \u2014 reviewed</div>'
      + '<p class="disc-cta-line">We have read this association\u2019s HOA documents and written up what is in them'
      +   (asOf ? ', as of ' + esc(asOf) : '') + '. ' + docLine + '</p>'
      + heldLine
      + '<a class="disc-cta-btn" data-cm-auth="signup" data-cta="building-disclosure-signup" href="#signup">'
      +   'Create a free account to read the review \u2192</a>'
      + '<p class="disc-cta-note">' + esc(ageNote) + '. Prepared by a licensed agent from the disclosure package of a listing in this building. '
      +   'It describes the association, not any one unit.</p>'
      + '</div>';
  }


  /* ON THE INVESTOR EXCHANGE. A unit in this building is for sale to investors.
   * Shown: that it exists, its size, the cover photo. Held back behind a free
   * account: which unit, the asking price, the rent and the cap rate. The
   * blurred values are placeholders; the real ones are never sent to this page
   * (building_exchange_teaser does not return them). */
  let exchangeBand = '';
  if (p.exchange && Array.isArray(p.exchange.listings) && p.exchange.listings.length) {
    const xl = p.exchange.listings;
    const xn = xl.length;
    const xCta = esc(p.exchange.cta_url || '#signup');
    const xCards = xl.map(function (l) {
      const facts = [];
      if (l.beds != null) facts.push(l.beds + (l.beds === 1 ? ' bed' : ' beds'));
      if (l.baths) facts.push(l.baths + (Number(l.baths) === 1 ? ' bath' : ' baths'));
      if (l.sqft) facts.push(intc(l.sqft) + ' sq ft');
      if (l.photo_count) facts.push(l.photo_count + (l.photo_count === 1 ? ' photo' : ' photos'));
      return '<div class="xb-card">'
        + '<div class="xb-shot"' + (l.cover ? ' data-xb-cover="' + esc(l.cover) + '"' : '') + ' role="img" aria-label="Unit photograph"></div>'
        + '<div class="xb-body">'
        +   '<div class="xb-facts">' + facts.join(' \u00b7 ') + '</div>'
        +   '<div class="xb-lock" role="group" aria-label="Unit number, asking price, rent and cap rate are shown to investor accounts">'
        +     '<div><span>Unit</span><b aria-hidden="true">#0000</b></div>'
        +     '<div><span>Asking</span><b aria-hidden="true">$000,000</b></div>'
        +     '<div><span>Rent</span><b aria-hidden="true">$0,000</b></div>'
        +     '<div><span>Cap rate</span><b aria-hidden="true">0.00%</b></div>'
        +   '</div>'
        +   '<a class="xb-btn" href="' + xCta + '" data-cta="building-exchange-signup">Create a free account to see this listing \u2192</a>'
        + '</div></div>';
    }).join('');
    exchangeBand =
      '<section class="section xb-section" id="exchange"><div class="wrap">'
      + '<div class="xb-kicker">On the Investor Exchange</div>'
      + '<h2 class="xb-title">' + (xn === 1 ? 'A unit' : xn + ' units') + ' in ' + name + ' ' + (xn === 1 ? 'is' : 'are') + ' for sale to investors.</h2>'
      + '<p class="xb-line">Rentals offered by their owners, each with a licensed agent\u2019s signed opinion of value. '
      + 'Which unit, the price, the rent and the cap rate open with a free investor account.</p>'
      + '<div class="xb-grid">' + xCards + '</div>'
      + '</div></section>\n'
      + '<script>(function(){var U="' + SB_A_URL + '",K="' + SB_A_KEY + '";'
      + 'document.querySelectorAll("[data-xb-cover]").forEach(function(el){'
      + 'fetch(U+"/storage/v1/object/sign/exchange-photos/"+encodeURI(el.getAttribute("data-xb-cover")),{method:"POST",'
      + 'headers:{"apikey":K,"Authorization":"Bearer "+K,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})})'
      + '.then(function(r){return r.ok?r.json():null}).then(function(x){if(x&&x.signedURL)el.style.backgroundImage="url("+U+"/storage/v1"+x.signedURL+")"})'
      + '.catch(function(){})})})();</script>\n';
  }

  const heroCta =
    '<div class="hero-ask">'
    + '<p class="hero-ask-line">' + heroAskLine + '</p>'
    + '<a class="hero-ask-btn" data-cm-offer-trigger data-building-slug="' + slug + '"'
    +   ' data-cta="building-hero-offer" href="#offer">Make an offer on any unit \u2192</a>'
    + '<a class="hero-ask-alt" data-cm-auth="signup" data-cta="building-hero-signup" href="#signup">'
    +   'See every sale in this building \u2014 free</a>'
    + '</div>'
    /* ── Watch this building ────────────────────────────────────────────
       An email address, one press, no account.

       The existing watchlist needs a user_id, which is why it holds one row
       against 6,776 monthly building-page visitors. It is also the only
       browsing signal honest enough to describe to an owner later: 6,758 of
       those visitors never came back, so a page view is traffic, whereas
       somebody who types an address to be notified has said so in writing.

       Placed after the hero rather than in a popup. The intent popup was
       shown to 6,033 visitors last month and 24 chose a door; interrupting
       someone mid-read is not the moment to ask. */
    + '<div class="watch-wrap" id="watchBox" data-slug="' + esc(slug) + '">'
    +   '<div class="watch-head">Tell me when something happens here</div>'
    +   '<p class="watch-sub">A unit lists, a sale records, the HOA figures change. '
    +     'No account, and one click to stop.</p>'
    +   '<div class="watch-row">'
    +     '<input id="watchEmail" type="email" autocomplete="email" '
    +       'placeholder="you@example.com" aria-label="Email address">'
    +     '<button id="watchGo" type="button">Watch this building</button>'
    +   '</div>'
    +   '<p class="watch-msg" id="watchMsg" role="status"></p>'
    + '</div>'
    + disclosureCta;

  /* GALLERY */
  const imgs = Array.isArray(p.images) ? p.images.filter(function (i) { return i && i.url && i.role !== 'og'; }) : [];
  /* ACTIVE LISTINGS in this building (from building_page_payload: active_count, active_listings) */
  let activeSection = '';
  const activeCount = (p.active_count != null) ? Number(p.active_count) : 0;
  const activeArr = Array.isArray(p.active_listings) ? p.active_listings : [];
  if (activeCount > 0 && activeArr.length) {
    const cards = activeArr.map(function (a) {
      const aMls   = esc(a.mls || '');
      const aUnit  = a.unit ? esc(a.unit) : '';
      const aAddr  = esc(a.address || '');
      const aPrice = (a.price != null) ? money(Number(a.price)) : 'Price on request';
      const aBeds  = (a.beds != null && a.beds !== '') ? Number(a.beds) : null;
      const aBaths = (a.baths != null && a.baths !== '') ? Number(a.baths) : null;
      const aSqft  = (a.sqft != null && a.sqft !== '') ? Number(a.sqft) : null;
      const specBits = [];
      if (aBeds  != null) specBits.push(aBeds + ' bd');
      if (aBaths != null) specBits.push(aBaths + ' ba');
      if (aSqft  != null) specBits.push(intc(aSqft) + ' sf');
      const spec = specBits.length ? '<div class="al-card-spec">' + specBits.join(' \u00b7 ') + '</div>' : '';
      // Photo: prefer the re-hosted Supabase storage cover (stable, no hotlink
      // protection) over the raw MLS MediaServer URL in a.photo, which the MLS
      // host blocks when hotlinked. Cover is always listing-photos/<mls>/00.jpg.
      const aPhoto = aMls
        ? SUPABASE_URL + '/storage/v1/object/public/listing-photos/' + encodeURIComponent(aMls) + '/00.jpg'
        : (a.photo || '');
      const media = aPhoto
        ? '<img class="al-card-img" src="' + esc(aPhoto) + '" alt="' + aAddr + '" loading="lazy" onerror="this.classList.add(\'al-card-img--ph\');this.removeAttribute(\'src\');">'
        : '<div class="al-card-img al-card-img--ph" role="img" aria-label="' + aAddr + '"></div>';
      return '<a class="al-card" href="/listing/' + aMls + '">' +
        media +
        '<div class="al-card-body">' +
        '<div class="al-card-price">' + aPrice + '</div>' +
        (aUnit ? '<div class="al-card-unit">Unit ' + aUnit + '</div>' : '') +
        spec +
        '</div></a>';
    }).join('');
    const plural = activeCount === 1 ? 'listing' : 'listings';
    activeSection =
      '<section class="section" id="active"><div class="wrap">' +
      '<div class="section-head"><div class="section-kicker">For sale now</div>' +
      '<h2 class="section-title">' + activeCount + ' active ' + plural + ' in <em>this building</em></h2>' +
      '<p class="section-sub">Currently on the market. Tap any unit for full detail \u2014 or make an offer.</p></div>' +
      '<div class="al-grid">' + cards + '</div>' +
      '</div></section>\n';
  }

  let gallerySection = '';
  if (imgs.length === 1) {
    gallerySection =
      '<section class="section" id="gallery"><div class="wrap">' +
      '<div class="section-head"><div class="section-kicker">Photography</div>' +
      '<h2 class="section-title">The <em>building</em></h2></div>' +
      '<div class="gallery" style="grid-template-columns:1fr;">' +
      '<div class="gallery-item" style="aspect-ratio:16/9;"><img src="' + esc(imgs[0].url) + '" alt="' + esc(imgs[0].alt || imgs[0].caption || p.name) + '" loading="lazy"></div>' +
      '</div></div></section>';
  } else if (imgs.length > 1) {
    const items = imgs.map(function (im, i) {
      return '<div class="gallery-item' + (i === 0 ? ' main' : '') + '"><img src="' + esc(im.url) + '" alt="' + esc(im.alt || im.caption || p.name) + '" loading="lazy"></div>';
    }).join('');
    gallerySection =
      '<section class="section" id="gallery"><div class="wrap">' +
      '<div class="section-head"><div class="section-kicker">Photography</div>' +
      '<h2 class="section-title">The <em>building</em></h2>' +
      '<p class="section-sub">A visual survey of ' + name + '.</p></div>' +
      '<div class="gallery">' + items + '</div></div></section>';
  }

  /* ABOUT */
  let aboutBody;
  if (p.description && String(p.description).trim()) {
    aboutBody = '<div class="prose">' + paragraphs(p.description) + '</div>';
  } else {
    const bits = [];
    bits.push(p.name +
      ' is a ' + (p.unit_count != null ? intc(p.unit_count) + '-' + countWord + ' ' : '') +
      propertyKind +
      (hood ? ' in ' + p.neighborhood + ', ' + mkRegion : ' in ' + mkRegion) +
      (p.year_built != null ? ', built in ' + p.year_built : '') + '.');
    if (psf != null) bits.push('Over the last 12 months, ' + countWord + 's here have traded at a median of ' + money(psf) + ' per square foot.');
    aboutBody = '<div class="prose"><p>' + esc(bits.join(' ')) + '</p></div>';
  }
  const facts = [];
  if (hood)                 facts.push(['Neighborhood', hood]);
  facts.push(['Property type', isTownhomes ? 'Townhome' : 'Condo']);
  if (p.year_built != null) facts.push(['Built', String(p.year_built)]);
  if (p.unit_count != null) facts.push([countWordPl, intc(p.unit_count)]);
  const factGrid = '<div class="fact-grid" style="margin-top:40px;">' +
    facts.map(function (f) { return '<div class="fact"><div class="fact-label">' + f[0] + '</div><div class="fact-val">' + f[1] + '</div></div>'; }).join('') +
    '</div>';
  const aboutSection =
    '<section class="section" id="about"><div class="wrap">' +
    '<div class="section-head"><div class="section-kicker">About</div>' +
    '<h2 class="section-title">About <em>' + name + '</em></h2></div>' +
    aboutBody + factGrid + '</div></section>';

  /* AMENITIES */
  const feats = Array.isArray(p.features) ? p.features.filter(Boolean) : [];
  let amenitiesSection = '';
  if (feats.length) {
    const chips = feats.map(function (f) { return '<span class="amenity-chip">' + esc(f) + '</span>'; }).join('');
    amenitiesSection =
      '<section class="section" id="amenities"><div class="wrap">' +
      '<div class="section-head"><div class="section-kicker">What\u2019s inside</div>' +
      '<h2 class="section-title">Interior &amp; <em>amenities</em></h2></div>' +
      '<div class="amenity-chips">' + chips + '</div></div></section>';
  }

  /* DOSSIER */
  function card(label, val, sub, peri) {
    return '<div class="dossier-card">' +
      '<div class="dossier-metric-label">' + label + '</div>' +
      '<div class="dossier-metric-val' + (peri ? ' peri' : '') + '">' + val + '</div>' +
      '<div class="dossier-metric-sub">' + sub + '</div></div>';
  }
  const dcards = [];
  if (psf != null)      dcards.push(card('Median $/sf', money(psf), 'Per square foot \u00b7 last 12 months of sales', true));
  if (medPrice != null) dcards.push(card('Median price', money(medPrice), 'Median closed price \u00b7 last 12 months'));
  if (st.sold_12mo != null) dcards.push(card('Sold (12\u202fmo)', intc(st.sold_12mo), 'Closed sales in the last 12 months'));
  const ls = st.last_sale;
  if (ls && ls.price != null) dcards.push(card('Last sale', money(ls.price), (ls.unit ? 'Unit ' + esc(ls.unit) + ' \u00b7 ' : '') + fmtDate(ls.date)));
  if (p.unit_count != null) dcards.push(card(countCardLabel, intc(p.unit_count), tierLabel(p.unit_count, layout)));
  if (p.year_built != null) dcards.push(card('Built', String(p.year_built), (p.floors ? p.floors + ' floors \u00b7 ' : '') + (decade(p.year_built) || '')));
  const cmpRows = [];
  if (hood && st.psf_vs_hood_pct != null && st.median_psf_hood != null) {
    const dH = Number(st.psf_vs_hood_pct);
    cmpRows.push('<div class="psf-compare-row"><span>vs ' + hood + ' median (' + money(st.median_psf_hood) + '/sf)</span><span class="' + (dH >= 0 ? 'up' : 'dn') + '">' + (dH >= 0 ? '+' : '') + dH + '%</span></div>');
  }
  if (st.psf_vs_city_pct != null && st.median_psf_city != null) {
    const dC = Number(st.psf_vs_city_pct);
    cmpRows.push('<div class="psf-compare-row"><span>vs ' + mkRegion + ' median (' + money(st.median_psf_city) + '/sf)</span><span class="' + (dC >= 0 ? 'up' : 'dn') + '">' + (dC >= 0 ? '+' : '') + dC + '%</span></div>');
  }
  const psfCompare = cmpRows.length ? '<div class="psf-compare">' + cmpRows.join('') + '</div>' : '';

  let dossierSection = '';
  if (dcards.length) {
    dossierSection =
      '<section class="dossier-section" id="dossier"><div class="wrap">' +
      '<div class="dossier-head"><div class="dossier-kicker">The Dossier</div>' +
      '<h2 class="dossier-title">' + name + ', ' + dossierTitleSuffix + '</h2></div>' +
      '<div class="dossier-grid">' + dcards.join('') + '</div>' +
      psfCompare +
      '<div class="dossier-enhanced-cta">' +
      '<h4>Sign in to see the <em style="color:#C2410C;">full dossier</em></h4>' +
      '<p>' + enhancedCtaCopy + '</p>' +
      '<a class="btn-primary" href="#signup" data-cm-auth="signup" data-cm-cta="unlock-enhanced-data">Unlock enhanced data \u2192</a></div>' +
      '<div class="cm-inline-cta" style="margin-top:32px;text-align:center;">' +
      '<a href="#offer" data-cm-offer-trigger data-building-slug="' + slug + '" class="cm-inline-cta-link" style="display:inline-flex;align-items:center;gap:8px;color:#8f5d1c;font-family:var(--cm-ff-mono, \'JetBrains Mono\', monospace);font-size:12px;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;padding:10px 20px;border:1px solid rgba(212, 165, 116, 0.4);border-radius:999px;transition:all 150ms ease;">See a number worth acting on? Make an offer \u2192</a></div>' +
      '</div></section>';
  }

  /* MARKET (new — placeholder hydrated by cm-market.js) */
  const marketSection =
    '<section class="section" id="market"><div class="wrap">' +
    '<div class="section-head"><div class="section-kicker">Market analysis</div>' +
    '<h2 class="section-title">How <em>' + name + '</em> compares</h2>' +
    '<p class="section-sub">Trailing-12-month performance against the half-mile surroundings and the broader market, plus quarter-by-quarter $/ft\u00b2 history.</p></div>' +
    '<div id="cm-market-root"></div>' +
    '</div></section>';

  /* COMPARE (peer ranking, unchanged) */
  const peers = Array.isArray(p.peers) ? p.peers.filter(function (x) { return x && x.median_psf != null; }) : [];
  let compareSection = '';
  if (peers.length) {
    const crows = peers.map(function (pe) {
      return { slug: pe.slug, name: pe.name, psf: Number(pe.median_psf), units: pe.unit_count, year: pe.year_built, self: false };
    });
    if (psf != null) crows.push({ slug: p.slug, name: p.name, psf: psf, units: p.unit_count, year: p.year_built, self: true });
    crows.sort(function (a, b) { return b.psf - a.psf; });
    const crowHtml = crows.map(function (r) {
      const meta = (r.units != null ? intc(r.units) + ' units' : '') + (r.year != null ? ((r.units != null ? ' \u00b7 ' : '') + r.year) : '');
      const nameCell = '<div class="nb-name">' + esc(r.name) + (r.self ? '<span class="nb-badge">This building</span>' : '') + '</div>';
      const metaCell = '<div class="nb-meta" style="font-size:13px;color:#5d6575;font-family:var(--ff-mono);letter-spacing:0.02em;">' + meta + '</div>';
      const psfCell  = '<div class="nb-psf">' + money(r.psf) + ' <span class="nb-unit">/sf</span></div>';
      return r.self
        ? '<div class="nb-row nb-row--self">' + nameCell + metaCell + psfCell + '</div>'
        : '<a class="nb-row" href="/building/' + esc(r.slug) + '">' + nameCell + metaCell + psfCell + '</a>';
    }).join('');
    compareSection =
      '<section class="section" id="compare"><div class="wrap">' +
      '<div class="section-head"><div class="section-kicker">How it compares</div>' +
      '<h2 class="section-title">' + (hood ? hood : 'The neighborhood') + ', by <em>$/sf</em></h2>' +
      '<p class="section-sub">Median price per square foot across ' + (hood ? hood : 'nearby') + ' buildings \u2014 last 12 months of closed sales. ' + name + ' is highlighted.</p></div>' +
      '<div class="nb-grid">' + crowHtml + '</div></div></section>';
  }

  /* MORTGAGE */
  const defPrice = (medPrice != null) ? medPrice : 950000;
  const defPriceFmt = Number(defPrice).toLocaleString('en-US');
  const sliderVal = Math.min(Math.max(defPrice, 500000), 10000000);
  const mortgageSection =
    '<section class="section" id="mortgage"><div class="wrap">' +
    '<div class="section-head"><div class="section-kicker">Run the numbers</div>' +
    '<h2 class="section-title">Mortgage <em>calculator</em></h2>' +
    '<p class="section-sub">Back-of-envelope monthly cost for a purchase at ' + name + '. Defaults use the building\u2019s recent median price and conservative market assumptions.</p></div>' +
    '<div class="mortgage-grid"><div class="mortgage-inputs">' +
    '<div class="mort-field full"><div class="mort-field-label">Purchase price</div>' +
    '<div class="mort-field-val"><span class="prefix">$</span><input id="m-price" type="text" value="' + defPriceFmt + '" inputmode="numeric"></div>' +
    '<input type="range" class="mort-slider" id="m-price-slider" min="500000" max="10000000" step="50000" value="' + sliderVal + '"></div>' +
    '<div class="mort-field"><div class="mort-field-label">Down payment</div><div class="mort-field-val"><input id="m-down" type="text" value="20" inputmode="decimal"><span class="suffix">%</span></div></div>' +
    '<div class="mort-field"><div class="mort-field-label">Interest rate</div><div class="mort-field-val"><input id="m-rate" type="text" value="7.1" inputmode="decimal"><span class="suffix">%</span></div></div>' +
    '<div class="mort-field"><div class="mort-field-label">Term</div><div class="mort-field-val"><input id="m-term" type="text" value="30" inputmode="numeric"><span class="suffix">yrs</span></div></div>' +
    '<div class="mort-field"><div class="mort-field-label">Est. HOA</div><div class="mort-field-val"><span class="prefix">$</span><input id="m-hoa" type="text" value="1,400" inputmode="numeric"><span class="suffix">/mo</span></div></div>' +
    '</div><div class="mort-result"><div class="mort-result-label">Est. monthly</div>' +
    '<div class="mort-result-val" id="m-total">$\u2014</div><div class="mort-result-sub">Principal + interest + HOA</div>' +
    '<div class="mort-breakdown">' +
    '<div class="mort-breakdown-row"><span>Principal &amp; interest</span><span class="v" id="m-pi">$\u2014</span></div>' +
    '<div class="mort-breakdown-row"><span>Est. property tax</span><span class="v" id="m-tax">$\u2014</span></div>' +
    '<div class="mort-breakdown-row"><span>HOA</span><span class="v" id="m-hoa-out">$\u2014</span></div>' +
    '<div class="mort-breakdown-row"><span>Down payment</span><span class="v" id="m-down-out">$\u2014</span></div>' +
    '<div class="mort-breakdown-row"><span>Loan amount</span><span class="v" id="m-loan">$\u2014</span></div>' +
    '</div></div></div>' +
    '<div style="margin-top:32px;text-align:center;padding-top:28px;border-top:1px solid var(--cm-rule, rgba(34,38,47,0.112));">' +
    '<p style="color:var(--cm-ivory-dim, #5d6575);font-size:14px;margin-bottom:14px;">Numbers add up?</p>' +
    '<a href="#offer" id="mortgage-offer-cta" data-cm-offer-trigger data-building-slug="' + slug + '" data-suggested-price="' + defPrice + '" style="display:inline-flex;align-items:center;gap:8px;background:#c2410c;color:#ffffff;padding:13px 26px;border-radius:999px;font-family:inherit;font-size:14px;font-weight:500;text-decoration:none;transition:transform 150ms ease;">Make this offer \u00b7 <span id="mortgage-offer-amt">$' + defPriceFmt + '</span> \u2192</a></div>' +
    '<script>' + MORT_SYNC + '</script>' +
    '</div></section>';

  /* OFFER */
  const offerSection =
    '<section class="section" id="offer"><div class="wrap">' +
    '<div class="section-head"><div class="section-kicker">Every unit is for sale</div>' +
    '<h2 class="section-title">Buy at or sell at <em>' + name + '</em></h2>' +
    '<p class="section-sub">You don\u2019t need a unit to be listed to make a move. Submit an offer on any unit in the building, or name a price your own unit would sell for.</p></div>' +
    '<div class="offer-panel">' +
    '<div class="offer-option"><h3>Buy \u2014 submit an offer</h3>' +
    '<p>Name the unit, the price, and your terms. We route it to the owner through standard channels and track the response in your dashboard.</p>' +
    '<a class="btn-primary" data-cm-offer-trigger data-building-slug="' + slug + '" style="cursor:pointer;">Make an offer \u2192</a></div>' +
    '<div class="offer-option"><h3>Sell \u2014 name your price</h3>' +
    '<p>Set a Make-Me-Move number, not a listing. Keep living in your unit. We notify you only when a buyer\u2019s offer matches your number.</p>' +
    '<a class="btn-ghost" data-cm-cta="set-your-price" href="/owner-signup/?address=' + encodeURIComponent(p.address || '') + '">Set your price \u2192</a></div></div>' +
    '<p style="margin-top:24px;font-size:13px;color:#5d6575;">All offers require a free account. <a href="#signin" data-cm-auth="login" style="color:#C2410C;">Already have one? Sign in.</a></p>' +
    '</div></section>';

  /* STICKY NAV — Market added between Dossier and Compare */
  const nav = [];
  if (imgs.length)  nav.push('<a href="#gallery">Gallery</a>');
  nav.push('<a href="#about">About</a>');
  if (feats.length) nav.push('<a href="#amenities">Amenities</a>');
  if (dcards.length) nav.push('<a href="#dossier">Dossier</a>');
  nav.push('<a href="#market">Market</a>');
  if (peers.length) nav.push('<a href="#compare">Compare</a>');
  nav.push('<a href="#mortgage">Mortgage</a>');
  nav.push('<a href="#offer">Buy or sell</a>');
  const stickyNav =
    '<div class="sticky-nav"><div class="wrap"><div class="sticky-nav-row">' + nav.join('') + '</div></div></div>';

  /* SEO */
  const seo = p.seo || {};
  const title = esc(seo.title || (p.name + ' \u00b7 ' + mkBrand));
  const descPlain = seo.description ||
    (p.name + ' \u2014 ' + (p.unit_count != null ? intc(p.unit_count) + ' ' + countWord + 's' : (isTownhomes ? 'townhomes' : 'condominiums')) +
      (hood ? ' in ' + p.neighborhood + ', ' + mkRegion : ' in ' + mkRegion) +
      (p.year_built != null ? ', built ' + p.year_built : '') +
      '. Sales, $/ft, owner tenure, and live offer activity.');
  const desc = esc(descPlain);
  const ogImg = seo.og_image ? '<meta property="og:image" content="' + esc(seo.og_image) + '">' : '';
  const canonical = esc(p.canonical_url || ('https://www.' + mkDomain + '/building/' + p.slug));
  const jsonLd = p.json_ld
    ? '<script type="application/ld+json">' + JSON.stringify(p.json_ld).replace(/</g, '\\u003c') + '</script>'
    : '';

  /* assemble */
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + title + '</title>\n' +
    '<meta name="description" content="' + desc + '">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + esc((p.name || '') + ' \u00b7 ' + mkBrand) + '">\n' +
    '<meta property="og:description" content="' + desc + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n' +
    ogImg + '\n' +
    '<link rel="icon" href="/favicon.svg">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n' +
    '<script type="module" src="/assets/cm-auth-nav.js"></script>\n' +
    '<script src="/assets/cm-track.js?v=' + TRACK_VER + '" defer></script>\n' +
    '<script src="/assets/cm-watch-prompt.js?v=' + TRACK_VER + '" defer></script>\n' +
    jsonLd + '\n' +
    '<style>' + CSS + '</style>\n' +
    '<style>' + EXTRA_CSS + '</style>\n' +
    '<style>' +
    '.al-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}' +
    '.al-card{display:block;background:rgba(34,38,47,0.03);border:1px solid rgba(34,38,47,0.084);border-radius:14px;overflow:hidden;text-decoration:none;transition:border-color .15s,transform .15s}' +
    '.al-card:hover{border-color:rgba(34,38,47,0.28);transform:translateY(-2px)}' +
    '.al-card-img{width:100%;height:170px;object-fit:cover;display:block;background:rgba(34,38,47,0.048)}' +
    '.al-card-img--ph{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(34,38,47,0.06),rgba(34,38,47,0.02))}' +
    '.al-card-body{padding:14px 16px 16px}' +
    '.al-card-price{font-family:\"Playfair Display\",Georgia,serif;font-size:21px;color:#22262f;font-weight:700}' +
    '.al-card-unit{font-size:12px;color:#C2410C;margin-top:3px;letter-spacing:.04em}' +
    '.al-card-spec{font-size:12px;color:#5d6575;margin-top:8px}' +
    '</style>\n' +
    '</head>\n<body>\n\n' +
    '<header class="masthead"><div class="wrap"><div class="masthead-row">' +
    '<a href="/" class="wordmark">Condo <em>Market</em> \u00b7 ' + mkTag + '</a>' +
    '<nav class="nav-meta">' +
    '<a href="/buildings/">Buildings</a><a href="/intelligence/">Intelligence</a>' +
    '<a href="/history/">History</a><a href="/how-it-works/">How it works</a>' +
    '<a href="#signin" data-cm-auth="login" class="signin-btn">Sign in</a>' +
    '</nav></div></div></header>\n\n' +
    '<div class="wrap"><div class="crumb">' +
    '<a href="/">Condo Market</a><span class="sep">/</span>' +
    '<a href="/buildings/">Buildings</a><span class="sep">/</span>' + name +
    '</div></div>\n\n' +
    '<main>\n' +
    '<section class="hero"><div class="wrap"><div class="hero-head"><div>' +
    (hood ? '<div class="hero-kicker">' + hood + '</div>' : '') +
    '<h1>' + name + '<em>.</em></h1>' +
    (addr ? '<div class="hero-addr">' + addr + '</div>' : '') +
    heroStats +
    heroCta +
    '</div><div class="hero-img-wrap">' +
    (hood ? '<span class="hero-badge">' + hood + '</span>' : '') +
    heroMedia +
    '</div></div></div></section>\n' +
    exchangeBand +
    '<section class="section" id="featured-mmm"><div class="wrap">' +
    '<div data-cm-featured data-building="' + slug + '"></div>' +
    '</div></section>\n' +
    activeSection +
    stickyNav + '\n' +
    gallerySection +
    aboutSection +
    amenitiesSection +
    dossierSection +
    marketSection +
    compareSection +
    mortgageSection +
    offerSection +
    leadToolsSection(slug, name, mk) +
    '</main>\n\n' +
    CM_FOOTER(p.footerData) +
    '<script>' + MORT_CALC + '</script>\n' +
    '<script>var SB_URL=' + JSON.stringify(SUPABASE_URL)
      + ',SB_KEY=' + JSON.stringify(SUPABASE_ANON_KEY) + ';</script>\n' +
    '<script>' + WATCH_JS + '</script>\n' +
    '<script type="module" src="/assets/cm-featured.js"></script>\n' +
    '<script type="module" src="/assets/cm-actions.js"></script>\n' +
    '<script type="module" src="/assets/cm-offer-modal.js"></script>\n' +
    '<script type="module" src="/assets/cm-dossier.js"></script>\n' +
    '<script type="module" src="/assets/cm-market.js"></script>\n' +
    '</body>\n</html>';
}

/* additive styles */
/* Watch this building — client half.

   Anon RPC, no account, no confirmation step. Returns the live watcher count
   so the press is rewarded immediately: "you and 4 others" is both the value
   to the person and the thing that makes the next visitor more likely to
   press it.

   The visitor token is passed when cm-track.js has set one, which stitches
   this action to everything else that visitor did — including the browsing
   they had already done before deciding to watch. */
const WATCH_JS = `
(function () {
  var box = document.getElementById('watchBox');
  if (!box) return;
  var input = document.getElementById('watchEmail');
  var btn   = document.getElementById('watchGo');
  var msg   = document.getElementById('watchMsg');
  var slug  = box.getAttribute('data-slug') || (location.pathname.split('/')[2] || '');

  function tok() {
    try { return localStorage.getItem('cm_visitor_token') || null; } catch (e) { return null; }
  }
  function say(t, bad) {
    msg.textContent = t;
    msg.className = 'watch-msg' + (bad ? ' bad' : '');
  }

  async function go() {
    var email = (input.value || '').trim();
    if (!email || email.indexOf('@') < 1) { say('Please add an email address.', true); return; }
    btn.disabled = true; say('Saving\u2026');
    try {
      var r = await fetch(SB_URL + '/rest/v1/rpc/watch_building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY,
                   Authorization: 'Bearer ' + SB_KEY },
        body: JSON.stringify({ p_building_slug: slug, p_email: email,
                               p_visitor_token: tok(), p_source: 'building_page' })
      });
      var d = await r.json();
      if (!d || d.ok !== true) {
        say(d && d.error === 'email_invalid'
              ? 'That address does not look right.'
              : 'That did not save. Try again in a moment.', true);
        btn.disabled = false;
        return;
      }
      box.classList.add('done');
      var n = Number(d.watchers || 0);
      /* Never name the other people, and never imply anything about demand
         below the point where the number means something. */
      say(n > 1
        ? 'Done. You and ' + (n - 1) + (n === 2 ? ' other person are' : ' others are')
          + ' watching this building. Nothing else needed.'
        : 'Done. You will hear from us when something happens here.');
      if (window.cmTrack) window.cmTrack('watchlist_add', { building_slug: slug });
    } catch (e) {
      say('That did not save. Try again in a moment.', true);
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', go);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
})();
`;

const EXTRA_CSS =
  '.nb-meta{font-size:13px;color:#5d6575;font-family:var(--ff-mono);}' +
  '.nb-row--self{background:rgba(34,38,47,0.042);padding-left:12px;padding-right:12px;}' +
  '.nb-row--self::after{content:"";opacity:0;}' +
  '.nb-badge{display:inline-block;margin-left:10px;font-family:var(--ff-mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;background:#9fb4d8;padding:2px 8px;border-radius:999px;vertical-align:middle;}' +
  '.hero-img--ph{position:absolute;inset:0;width:100%;height:100%;' +
  'background:radial-gradient(120% 90% at 30% 15%,rgba(194,65,12,0.08),transparent 58%),' +
  'linear-gradient(165deg,#ffffff 0%,#eef1f6 58%,#e0e5ed 100%);}' +
  '.hero-img--ph::after{content:"";position:absolute;left:50%;bottom:0;transform:translateX(-50%);' +
  'width:74%;height:64%;opacity:.5;background-repeat:no-repeat;background-position:center bottom;background-size:contain;' +
  'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 300 200\'%3E%3Cg fill=\'%239fb4d8\'%3E%3Crect x=\'66\' y=\'70\' width=\'40\' height=\'130\'/%3E%3Crect x=\'116\' y=\'40\' width=\'52\' height=\'160\'/%3E%3Crect x=\'178\' y=\'86\' width=\'34\' height=\'114\'/%3E%3C/g%3E%3Cg fill=\'%230f131d\'%3E%3Crect x=\'74\' y=\'82\' width=\'8\' height=\'10\'/%3E%3Crect x=\'90\' y=\'82\' width=\'8\' height=\'10\'/%3E%3Crect x=\'74\' y=\'102\' width=\'8\' height=\'10\'/%3E%3Crect x=\'90\' y=\'102\' width=\'8\' height=\'10\'/%3E%3Crect x=\'126\' y=\'54\' width=\'9\' height=\'11\'/%3E%3Crect x=\'144\' y=\'54\' width=\'9\' height=\'11\'/%3E%3Crect x=\'126\' y=\'76\' width=\'9\' height=\'11\'/%3E%3Crect x=\'144\' y=\'76\' width=\'9\' height=\'11\'/%3E%3Crect x=\'126\' y=\'98\' width=\'9\' height=\'11\'/%3E%3Crect x=\'144\' y=\'98\' width=\'9\' height=\'11\'/%3E%3Crect x=\'186\' y=\'98\' width=\'7\' height=\'9\'/%3E%3Crect x=\'199\' y=\'98\' width=\'7\' height=\'9\'/%3E%3C/g%3E%3C/svg%3E");}';

const CSS = `
  :root {
    --cm-navy: #ffffff;
    --cm-navy-deep: #f5f7fa;
    --cm-peri: #C2410C;
    --cm-peri-dim: #5d6575;
    --cm-ivory: #22262f;
    --cm-ivory-dim: #5d6575;
    --cm-ivory-faint: rgba(26,31,46,.45);
    --cm-rule: #e0e5ed;
    --cm-accent: #d4a574;
    --cm-gain: #2f6b40;
    --cm-loss: #b4532a;
    --ff-display: 'Playfair Display', Georgia, serif;
    --ff-body: 'DM Sans', -apple-system, sans-serif;
    --ff-mono: 'JetBrains Mono', ui-monospace, monospace;
    --page-max: 1280px;
    --gutter: clamp(20px, 4vw, 56px);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: #f5f7fa; color: #22262f;
    font-family: var(--ff-body); font-weight: 300;
    font-size: 16px; line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  body::before {
    content: ''; position: fixed; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.035 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    pointer-events: none; z-index: 1; mix-blend-mode: overlay;
  }
  main { position: relative; z-index: 2; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: var(--page-max); margin: 0 auto; padding: 0 var(--gutter); }
  .masthead { padding: 22px 0; border-bottom: 1px solid rgba(232, 227, 216, 0.14); position: relative; }
  .cm-burger { display: none; }
  .masthead-row { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .wordmark { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 22px; color: #e8e3d8; text-decoration: none; }
  .wordmark em { color: #e85d2a; }
  /* flex-wrap is the fix. Six items at 11px with 22px gaps measure ~520px;
     a nowrap flex row cannot shrink below its content, so on a 380px phone it
     pushed the document 140px wider than the viewport and the whole page
     scrolled sideways. .masthead-row already wrapped - the nav inside it did
     not, so wrapping the outer row achieved nothing. */
  .nav-meta { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(232, 227, 216, 0.64); display: flex; flex-wrap: wrap; gap: 22px; align-items: center; min-width: 0; justify-content: flex-end; }
  .nav-meta a { color: rgba(232, 227, 216, 0.64); text-decoration: none; transition: color 0.15s; }
  .nav-meta a:hover { color: #e8e3d8; }
  .signin-btn { color: #e8e3d8 !important; border: 1px solid rgba(232, 227, 216, 0.14); padding: 7px 14px; border-radius: 999px; }
  .signin-btn:hover { border-color: #9fb4d8; color: #e85d2a !important; }
  @media (max-width: 720px) {
    .masthead { padding: 16px 0; }
    .masthead-row { align-items: center; gap: 12px; }
    .wordmark { font-size: 19px; }
    .nav-meta { gap: 14px; row-gap: 10px; justify-content: flex-start; width: 100%; }

    /* Collapsed: wordmark, the auth pill, and the burger. One row. */
    .cm-burger {
      display: inline-flex; align-items: center; justify-content: center;
      width: 38px; height: 38px; flex: 0 0 auto; padding: 0;
      background: transparent; border: 1px solid rgba(232, 227, 216, 0.14); border-radius: 10px;
      color: #e8e3d8; font-size: 16px; line-height: 1; cursor: pointer;
    }
    .masthead-row.cm-nav-collapsed { flex-wrap: nowrap; gap: 10px; }
    .masthead-row.cm-nav-collapsed .wordmark {
      flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
    .masthead-row.cm-nav-collapsed .nav-meta {
      flex: 0 0 auto; width: auto; gap: 10px; justify-content: flex-end;
    }
    /* Selector, not DOM surgery — the Save button is injected after load. */
    .masthead-row.cm-nav-collapsed .nav-meta > *:not(.signin-btn) { display: none; }

    .masthead-row.cm-nav-collapsed.is-open .nav-meta {
      position: absolute; top: 100%; left: 0; right: 0; z-index: 80;
      flex-direction: column; align-items: stretch; gap: 0; width: auto;
      background: #12151d; border-bottom: 1px solid rgba(232, 227, 216, 0.14);
      box-shadow: 0 12px 28px rgba(10,13,18,.4);
    }
    .masthead-row.cm-nav-collapsed.is-open .nav-meta > * {
      display: block; padding: 14px 20px; border-top: 1px solid rgba(232, 227, 216, 0.14);
      border-radius: 0; text-align: left;
    }
    .crumb { overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
    .crumb::-webkit-scrollbar { display: none; }
  }
  .crumb { padding: 18px 0 0; font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #5d6575; }
  .crumb a { color: #5d6575; }
  .crumb a:hover { color: #C2410C; }
  .crumb span.sep { margin: 0 10px; }
  .hero { padding: 32px 0 56px; }
  .hero-head { display: grid; grid-template-columns: 1fr; gap: 36px; }
  @media (min-width: 900px) { .hero-head { grid-template-columns: 1.2fr 1fr; align-items: end; } }
  .hero-kicker { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #C2410C; margin-bottom: 18px; }
  .hero h1 { font-family: var(--ff-display); font-weight: 500; font-size: clamp(44px, 6vw, 78px); line-height: 1.02; letter-spacing: -0.02em; color: #22262f; margin-bottom: 12px; }
  .hero h1 em { font-style: italic; color: #C2410C; }
  .hero-addr { font-family: var(--ff-body); font-size: 17px; color: #5d6575; margin-bottom: 32px; }
  .hero-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 20px; border-top: 1px solid rgba(34,38,47,0.112); border-bottom: 1px solid rgba(34,38,47,0.112); padding: 24px 0; }
  .hstat-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #5d6575; margin-bottom: 6px; }
  .hstat-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 28px; color: #22262f; line-height: 1; }
  .hstat-val .peri { color: #C2410C; }
  .hero-ask { margin-top: 22px; padding-top: 20px; border-top: 1px solid rgba(34,38,47,0.112); }
  .hero-ask-line { font-family: var(--cm-ff-serif, Georgia, serif); font-size: 17px; line-height: 1.45; color: #22262f; margin: 0 0 14px; max-width: 42ch; }
  .hero-ask-btn { display: inline-flex; align-items: center; gap: 8px; background: #c2410c; color: #ffffff; padding: 13px 26px; border-radius: 999px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; transition: transform 150ms ease; }
  .hero-ask-btn:hover { transform: translateY(-1px); }
  .hero-ask-alt { display: block; margin-top: 12px; font-family: var(--cm-ff-mono, 'JetBrains Mono', monospace); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #5d6575; text-decoration: none; }
  .hero-ask-alt:hover { color: #8f5d1c; }

  /* Watch this building. Sits in the page, not over it. */
  .watch-wrap { margin: 26px auto 0; max-width: 620px; padding: 22px 24px;
    border: 1px solid rgba(212,165,116,.34); border-radius: 14px;
    background: rgba(194,65,12,0.07); text-align: left; }
  .watch-head { font-family: var(--cm-ff-serif, Georgia, serif); font-size: 19px;
    color: #22262f; margin-bottom: 6px; }
  .watch-sub { font-size: 13.5px; line-height: 1.55; color: #5d6575; margin: 0 0 14px; }
  .watch-row { display: flex; gap: 9px; flex-wrap: wrap; }
  .watch-row input { flex: 1 1 240px; min-width: 0; padding: 12px 14px; font: inherit;
    font-size: 15px; border-radius: 10px; border: 1px solid rgba(34,38,47,0.192);
    background: rgba(34,38,47,0.077); color: #22262f; }
  .watch-row input:focus { outline: none; border-color: #d4a574; }
  .watch-row button { flex: 0 0 auto; padding: 12px 22px; font: inherit; font-size: 15px;
    font-weight: 600; border: 0; border-radius: 10px; cursor: pointer;
    background: #c2410c; color: #ffffff; }
  .watch-row button:disabled { opacity: .55; cursor: default; }
  .watch-msg { margin: 11px 0 0; font-size: 13.5px; line-height: 1.5; min-height: 1px;
    color: #5d6575; }
  .watch-msg.bad { color: #b4532a; }
  .watch-wrap.done .watch-row { display: none; }
  @media (max-width: 560px) {
    .watch-row input, .watch-row button { flex: 1 1 100%; }
  }
  @media (max-width: 720px) { .hero-ask-btn { width: 100%; justify-content: center; } }

  /* Disclosure CTA. Sits inside the hero, below the offer ask, and is styled as
     a distinct card rather than a third link: it is a different kind of offer
     (read something we made) and should not read as another way to transact. */
  .disc-cta { margin-top: 18px; padding: 18px 18px 16px; border: 1px solid rgba(212,165,116,.34); border-radius: 12px; background: rgba(194,65,12,0.06); }
  .disc-cta-kicker { font-family: var(--cm-ff-mono, 'JetBrains Mono', monospace); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #8f5d1c; margin-bottom: 8px; }
  .disc-cta-line { margin: 0 0 10px; font-size: 15px; line-height: 1.5; color: #22262f; }
  .disc-cta-held { margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: #5d6575; }
  .disc-cta-btn { display: inline-flex; align-items: center; gap: 8px; background: #c2410c; color: #ffffff; font-weight: 600; font-size: 14px; padding: 11px 18px; border-radius: 999px; text-decoration: none; transition: transform 150ms ease; }
  .disc-cta-btn:hover { transform: translateY(-1px); }
  .disc-cta-note { margin: 12px 0 0; font-size: 11.5px; line-height: 1.55; color: #5d6575; }
.xb-section { padding-top: 28px; padding-bottom: 28px; border-top: 1px solid rgba(212,165,116,.22); border-bottom: 1px solid rgba(212,165,116,.22); background: rgba(194,65,12,0.05); }
.xb-kicker { font-family: var(--cm-ff-mono, 'JetBrains Mono', monospace); font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: #8f5d1c; margin-bottom: 8px; }
.xb-title { font-family: 'Playfair Display', Georgia, serif; font-weight: 600; font-size: clamp(22px, 3vw, 28px); line-height: 1.2; color: #22262f; margin: 0 0 8px; }
.xb-line { margin: 0 0 18px; font-size: 15px; line-height: 1.55; color: #22262f; max-width: 68ch; }
.xb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 16px; max-width: 880px; }
.xb-card { display: grid; grid-template-columns: 220px minmax(0, 1fr); border: 1px solid rgba(212,165,116,.34); border-radius: 12px; overflow: hidden; background: rgba(255,255,255,0.6); }
.xb-shot { min-height: 200px; background: #ffffff center/cover no-repeat; }
.xb-body { padding: 16px 18px 18px; display: flex; flex-direction: column; min-width: 0; }
.xb-facts { font-size: 14px; color: #22262f; font-weight: 600; }
.xb-lock { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 14px; padding: 10px 0; border-top: 1px solid rgba(212,165,116,.2); border-bottom: 1px solid rgba(212,165,116,.2); }
.xb-lock span { display: block; white-space: nowrap; font-family: var(--cm-ff-mono, 'JetBrains Mono', monospace); font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: #5d6575; }
.xb-lock b { display: block; margin-top: 4px; font-size: 14px; font-weight: 600; color: #22262f; filter: blur(5px); user-select: none; -webkit-user-select: none; }
.xb-btn { margin-top: auto; display: inline-flex; justify-content: center; align-items: center; background: #c2410c; color: #ffffff; font-weight: 600; font-size: 14px; padding: 11px 16px; border-radius: 999px; text-decoration: none; align-self: flex-start; max-width: 100%; }
.xb-btn:hover { filter: brightness(1.06); }
.xb-btn:focus-visible { outline: 2px solid #e0e5ed; outline-offset: 2px; }
@media (max-width: 560px) { .xb-card { grid-template-columns: 1fr; } .xb-shot { min-height: 190px; } .xb-lock { grid-template-columns: repeat(2, 1fr); } .xb-btn { align-self: stretch; } }
  @media (max-width: 720px) { .disc-cta-btn { width: 100%; justify-content: center; } }
  .hero-img-wrap { position: relative; border-radius: 12px; overflow: hidden; background: #ffffff; aspect-ratio: 3/2; max-height: 460px; }
  .hero-img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(1.04) contrast(1.02); }
  .hero-img-wrap::after { content: ""; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 60px rgba(10,13,18,0.098); border-radius: 12px; z-index: 2; }
  .hero-badge { position: absolute; top: 16px; left: 16px; background: rgba(255,255,255,0.85); color: #C2410C; padding: 6px 12px; border-radius: 4px; font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; backdrop-filter: blur(8px); }
  .sticky-nav { position: sticky; top: 0; z-index: 50; background: #eef1f6; border-top: 1px solid rgba(34,38,47,0.112); border-bottom: 1px solid rgba(34,38,47,0.112); }
  .sticky-nav-row { display: flex; gap: 28px; overflow-x: auto; padding: 14px 0; scrollbar-width: none; }
  .sticky-nav-row::-webkit-scrollbar { display: none; }
  .sticky-nav-row a { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #5d6575; white-space: nowrap; padding-bottom: 4px; border-bottom: 1px solid transparent; transition: all 0.15s; }
  .sticky-nav-row a:hover { color: #C2410C; border-bottom-color: #C2410C; }
  .section { padding: 64px 0; border-bottom: 1px solid rgba(34,38,47,0.112); }
  .section:last-child { border-bottom: none; }
  .section-head { margin-bottom: 32px; }
  .section-kicker { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #C2410C; margin-bottom: 14px; }
  .section-title { font-family: var(--ff-display); font-weight: 500; font-size: clamp(32px, 4vw, 48px); line-height: 1.1; letter-spacing: -0.015em; margin-bottom: 12px; color: #22262f; }
  .section-title em { font-style: italic; color: #C2410C; }
  .section-sub { font-size: 17px; color: #5d6575; max-width: 56ch; }
  .gallery { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-top: 36px; }
  .gallery-item { border-radius: 10px; overflow: hidden; background: #ffffff; aspect-ratio: 1; }
  .gallery-item.main { grid-row: span 2; aspect-ratio: 1/1.05; }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s; }
  .gallery-item:hover img { transform: scale(1.03); }
  @media (max-width: 720px) { .gallery { grid-template-columns: 1fr 1fr; } .gallery-item.main { grid-column: span 2; grid-row: span 1; aspect-ratio: 16/10; } }
  .prose { max-width: 68ch; color: #22262f; font-size: 17px; line-height: 1.75; }
  .prose p { margin-bottom: 20px; }
  .prose ul { padding-left: 20px; margin-bottom: 20px; }
  .prose li { margin-bottom: 10px; color: #22262f; }
  .prose strong { color: #22262f; font-weight: 500; }
  .fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 24px; margin-top: 12px; }
  .fact { border-left: 2px solid #C2410C; padding: 4px 0 4px 18px; }
  .fact-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #5d6575; margin-bottom: 8px; }
  .fact-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; color: #22262f; }
  .amenity-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
  .amenity-chip { background: rgba(34,38,47,0.048); border: 1px solid rgba(34,38,47,0.112); color: #22262f; padding: 8px 16px; border-radius: 999px; font-size: 13px; }
  .dossier-section { background: #ffffff; padding: 72px 0; border-bottom: 1px solid rgba(34,38,47,0.112); }
  .dossier-head { text-align: center; margin-bottom: 48px; }
  .dossier-kicker { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #C2410C; margin-bottom: 20px; }
  .dossier-title { font-family: var(--ff-display); font-weight: 500; font-size: clamp(38px, 5vw, 56px); letter-spacing: -0.015em; line-height: 1.05; color: #22262f; }
  .dossier-title em { font-style: italic; color: #C2410C; }
  .dossier-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; margin-bottom: 48px; }
  .dossier-card { background: #eef1f6; border: 1px solid rgba(34,38,47,0.112); border-radius: 10px; padding: 28px 26px; }
  .dossier-metric-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #5d6575; margin-bottom: 10px; }
  .dossier-metric-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 40px; color: #22262f; line-height: 1; margin-bottom: 8px; }
  .dossier-metric-val.peri { color: #C2410C; }
  .dossier-metric-sub { font-size: 12px; color: #5d6575; font-family: var(--ff-mono); }
  .psf-compare { margin-top: 12px; padding-top: 14px; border-top: 1px solid rgba(34,38,47,0.112); }
  .psf-compare-row { display: flex; justify-content: space-between; font-size: 12px; color: #5d6575; padding: 4px 0; font-family: var(--ff-mono); }
  .psf-compare-row .up { color: #2f6b40; }
  .psf-compare-row .dn { color: #b4532a; }
  .dossier-enhanced-cta { text-align: center; padding: 32px; background: rgba(34,38,47,0.03); border: 1px dashed #C2410C; border-radius: 12px; margin-top: 40px; }
  .dossier-enhanced-cta h4 { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; color: #22262f; margin-bottom: 10px; }
  .dossier-enhanced-cta p { color: #5d6575; margin-bottom: 20px; max-width: 48ch; margin-left: auto; margin-right: auto; }
  .unit-map-cta { margin: 48px 0 0; padding: 28px 32px; background: rgba(34,38,47,0.036); border: 1px solid #C2410C; border-radius: 12px; display: flex; align-items: center; gap: 28px; flex-wrap: wrap; justify-content: space-between; }
  .unit-map-cta h3 { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 22px; color: #22262f; margin-bottom: 6px; }
  .unit-map-cta p { color: #5d6575; font-size: 14px; max-width: 44ch; margin: 0; }
  .nb-grid { display: grid; grid-template-columns: 1fr; gap: 0; margin-top: 28px; border-top: 1px solid rgba(34,38,47,0.112); }
  .nb-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr auto; gap: 20px; align-items: center; padding: 18px 0; border-bottom: 1px solid rgba(34,38,47,0.112); transition: background 0.15s; }
  .nb-row:hover { background: rgba(34,38,47,0.02); padding-left: 12px; padding-right: 12px; }
  .nb-row::after { content: '→'; color: #C2410C; font-size: 16px; opacity: 0; transition: all 0.15s; }
  .nb-row:hover::after { opacity: 1; transform: translateX(4px); }
  .nb-name { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 20px; color: #22262f; }
  .nb-psf { font-family: var(--ff-display); font-weight: 500; font-size: 20px; color: #C2410C; }
  .nb-psf .nb-unit { color: #5d6575; font-size: 13px; margin-left: 2px; }
  .nb-units { font-family: var(--ff-mono); font-size: 12px; color: #5d6575; letter-spacing: 0.04em; }
  .mortgage-grid { display: grid; grid-template-columns: 1fr; gap: 32px; margin-top: 36px; }
  @media (min-width: 820px) { .mortgage-grid { grid-template-columns: 1.2fr 1fr; gap: 48px; } }
  .mortgage-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .mortgage-inputs .full { grid-column: span 2; }
  .mort-field { border: 1px solid rgba(34,38,47,0.112); border-radius: 10px; padding: 14px 18px; background: #ffffff; }
  .mort-field-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #5d6575; margin-bottom: 6px; }
  .mort-field-val { display: flex; align-items: baseline; gap: 4px; }
  .mort-field-val .prefix { color: #5d6575; font-size: 14px; }
  .mort-field-val input { background: transparent; border: none; color: #22262f; font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; width: 100%; outline: none; }
  .mort-field-val input:focus { color: #C2410C; }
  .mort-field-val .suffix { color: #5d6575; font-size: 14px; }
  .mort-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 2px; background: rgba(34,38,47,0.112); margin-top: 12px; cursor: pointer; }
  .mort-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: #9fb4d8; border-radius: 50%; cursor: pointer; }
  .mort-slider::-moz-range-thumb { width: 16px; height: 16px; background: #9fb4d8; border-radius: 50%; border: none; cursor: pointer; }
  .mort-result { background: rgba(34,38,47,0.036); border: 1px solid #C2410C; border-radius: 12px; padding: 36px; text-align: center; display: flex; flex-direction: column; justify-content: center; }
  .mort-result-label { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #5d6575; margin-bottom: 12px; }
  .mort-result-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: clamp(40px, 6vw, 64px); color: #22262f; line-height: 1; margin-bottom: 8px; }
  .mort-result-sub { font-family: var(--ff-mono); font-size: 12px; color: #5d6575; }
  .mort-breakdown { margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(34,38,47,0.112); text-align: left; }
  .mort-breakdown-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #5d6575; }
  .mort-breakdown-row .v { color: #22262f; font-family: var(--ff-mono); }
  .offer-panel { background: #ffffff; border: 1px solid #C2410C; border-radius: 12px; padding: 36px; display: grid; grid-template-columns: 1fr; gap: 28px; margin-top: 36px; }
  @media (min-width: 780px) { .offer-panel { grid-template-columns: 1fr 1fr; } }
  .offer-option h3 { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; color: #22262f; margin-bottom: 12px; }
  .offer-option p { color: #5d6575; margin-bottom: 20px; font-size: 15px; }
  .video-wrap { aspect-ratio: 16/9; border-radius: 10px; overflow: hidden; background: #ffffff; }
  .video-wrap iframe { width: 100%; height: 100%; border: none; }
  .btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #9fb4d8; color: #ffffff; padding: 13px 28px; border-radius: 999px; font-weight: 500; font-size: 14px; cursor: pointer; border: none; font-family: inherit; transition: opacity 0.15s; text-decoration: none; }
  .btn-primary:hover { opacity: 0.88; }
  .btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #22262f; padding: 13px 28px; border-radius: 999px; font-weight: 500; font-size: 14px; cursor: pointer; border: 1px solid rgba(34,38,47,0.112); font-family: inherit; transition: all 0.15s; text-decoration: none; }
  .btn-ghost:hover { border-color: #C2410C; color: #C2410C; }
  footer { padding: 48px 0 40px; background: #12151d; color: rgba(232, 227, 216, 0.64); font-size: 13px; border-top: 1px solid rgba(232, 227, 216, 0.14); }
  .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 32px; }
  @media (max-width: 760px) { .footer-grid { grid-template-columns: 1fr 1fr; } }
  footer h5 { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #e8e3d8; margin-bottom: 14px; font-weight: 500; }
  footer ul { list-style: none; }
  footer li { padding: 4px 0; }
  footer a { color: rgba(232, 227, 216, 0.64); }
  footer a:hover { color: #e85d2a; }
  .footer-fine { padding-top: 28px; margin-top: 28px; border-top: 1px solid rgba(232, 227, 216, 0.14); font-size: 12px; opacity: 0.7; text-align: center; }
`;
const MORT_SYNC = `
        (function () {
          var priceInput = document.getElementById('m-price');
          var amtSpan    = document.getElementById('mortgage-offer-amt');
          var ctaLink    = document.getElementById('mortgage-offer-cta');
          if (!priceInput || !amtSpan || !ctaLink) return;
          function syncAmt() {
            var raw = (priceInput.value || '').replace(/[^0-9]/g, '');
            if (!raw) return;
            var n = parseInt(raw, 10);
            amtSpan.textContent = '$' + n.toLocaleString('en-US');
          }
          priceInput.addEventListener('input', syncAmt);
          var slider = document.getElementById('m-price-slider');
          if (slider) slider.addEventListener('input', syncAmt);
          function syncSuggested() {
            var raw = (priceInput.value || '').replace(/[^0-9]/g, '');
            if (raw) ctaLink.dataset.suggestedPrice = raw;
          }
          priceInput.addEventListener('input', syncSuggested);
          if (slider) slider.addEventListener('input', syncSuggested);
          syncSuggested();
          syncAmt();
        })();
      `;
const MORT_CALC = `
  (function() {
    const fmt = (n) => '$' + Math.round(n).toLocaleString();
    const parse = (s) => parseFloat(String(s).replace(/[^0-9.-]/g, '')) || 0;
    const els = {
      price: document.getElementById('m-price'),
      priceSlider: document.getElementById('m-price-slider'),
      down: document.getElementById('m-down'),
      rate: document.getElementById('m-rate'),
      term: document.getElementById('m-term'),
      hoa: document.getElementById('m-hoa'),
      total: document.getElementById('m-total'),
      pi: document.getElementById('m-pi'),
      tax: document.getElementById('m-tax'),
      hoaOut: document.getElementById('m-hoa-out'),
      downOut: document.getElementById('m-down-out'),
      loan: document.getElementById('m-loan'),
    };
    function compute() {
      const price = parse(els.price.value);
      const downPct = parse(els.down.value);
      const rate = parse(els.rate.value) / 100;
      const term = parse(els.term.value);
      const hoa = parse(els.hoa.value);
      const downAmt = price * (downPct / 100);
      const loan = price - downAmt;
      const monthlyRate = rate / 12;
      const n = term * 12;
      const pi = monthlyRate > 0
        ? loan * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
        : loan / n;
      const tax = price * 0.0118 / 12;
      const total = pi + tax + hoa;
      els.total.textContent = fmt(total) + '/mo';
      els.pi.textContent = fmt(pi);
      els.tax.textContent = fmt(tax);
      els.hoaOut.textContent = fmt(hoa);
      els.downOut.textContent = fmt(downAmt);
      els.loan.textContent = fmt(loan);
    }
    function formatInput(el) {
      const val = parse(el.value);
      el.value = val.toLocaleString();
    }
    [els.price, els.down, els.rate, els.term, els.hoa].forEach(el => {
      el.addEventListener('input', compute);
      if (el === els.price || el === els.hoa) {
        el.addEventListener('blur', () => formatInput(el));
      }
    });
    els.priceSlider.addEventListener('input', () => {
      els.price.value = parseInt(els.priceSlider.value).toLocaleString();
      compute();
    });
    els.price.addEventListener('input', () => {
      const v = parse(els.price.value);
      if (v >= 500000 && v <= 10000000) els.priceSlider.value = v;
    });
    compute();
  })();
`;
