// _worker.js  (Cloudflare Pages — Advanced Mode)
// =============================================================================
// Condo Market SF — dynamic building pages + static passthrough
// -----------------------------------------------------------------------------
// This single root worker intercepts ALL requests (Advanced Mode). It edge-
// renders /building/<slug> from the Supabase RPC building_page_payload(), and
// forwards everything else to the static asset pipeline via env.ASSETS.fetch(),
// which still applies your _redirects and _headers rules.
//
// Why Advanced Mode (a root _worker.js) and not a /functions folder:
//   Cloudflare drag-and-drop (Direct Upload) deployments do NOT compile a
//   /functions folder — only Wrangler does. A root _worker.js IS supported by
//   drag-and-drop, so it works with your full-ZIP deploy.
//
// Routing:
//   /building/<slug>          -> dynamic page (this worker)   [single segment]
//   /building/<slug>/...       -> passthrough (hoa-pitch, petition, unit-map…)
//   everything else            -> passthrough (static + _redirects + _headers)
//
// A live DB building always renders dynamically. If the slug is not a live
// catalogued building, we fall through to ASSETS so any legacy static page
// still serves (no regression); if none exists, Pages serves /404.html (404).
// =============================================================================

const SUPABASE_URL      = 'https://kfqphwerygccpzntbbif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

/* --------------------- multi-market chrome (per-Host) -------------------- */
// Hostname -> market. This map drives ONLY the crawler-facing <head>
// (title/description/canonical/OG) and the window.__CM_MARKET__ slug the client
// uses to pick which market to fetch. All *visible* chrome is rendered by the
// page itself from home_page_payload(); this is purely for SEO + bootstrap.
// Unknown hosts fall back to San Francisco, matching the in-file defaults.
const MARKET_BY_HOST = {
  'sanfranciscocondomarket.com':      'sf',
  'www.sanfranciscocondomarket.com':  'sf',
  'siliconvalleycondomarket.com':     'sv',
  'www.siliconvalleycondomarket.com': 'sv',
};
const MARKETS = {
  sf: { slug: 'san-francisco-condo-market',  brand: 'Condo Market SF',             region: 'San Francisco', domain: 'sanfranciscocondomarket.com', accent: '#C2410C', accentDeep: '#9A3412', accentRgb: '194,65,12' },
  sv: { slug: 'silicon-valley-condo-market', brand: 'Condo Market Silicon Valley', region: 'Silicon Valley', domain: 'siliconvalleycondomarket.com', heroImage: 'https://images.unsplash.com/photo-1719290227108-ea72b5728ec7?w=2400&q=85&auto=format&fit=crop', accent: '#00A8B5', accentDeep: '#006D75', accentRgb: '0,168,181' },
};
function resolveMarket(hostname) {
  return MARKETS[MARKET_BY_HOST[(hostname || '').toLowerCase()] || 'sf'];
}
function isHomePath(p)  { return p === '/buildings' || p === '/buildings/' || p === '/buildings/index.html'; }
function isIntelPath(p) { return p === '/intelligence' || p === '/intelligence/' || p === '/intelligence/index.html'; }
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
    url:   www + '/buildings/',
  };
}
// Fetch the static asset, then inject the market bootstrap + per-Host SEO.
// Non-HTML responses (the / -> /buildings/ redirect, 404s) pass straight through.
async function renderChrome(request, env, kind) {
  const res = await env.ASSETS.fetch(request);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('text/html')) return res;

  const mk = resolveMarket(new URL(request.url).hostname);
  const c  = chromeFor(mk, kind);
  let html = await res.text();

  const inject =
    '\n<script>window.__CM_MARKET__=' + JSON.stringify(mk.slug) + ';</script>' +
    '\n<link rel="canonical" href="' + attr(c.url) + '">';
  html = html.replace('<head>', '<head>' + inject);

  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>' + attr(c.title) + '</title>')
    .replace(/<meta\s+name="description"[^>]*>/i, '<meta name="description" content="' + attr(c.desc) + '">')
    .replace(/<meta\s+property="og:title"[^>]*>/i, '<meta property="og:title" content="' + attr(c.title) + '">')
    .replace(/<meta\s+property="og:description"[^>]*>/i, '<meta property="og:description" content="' + attr(c.desc) + '">')
    .replace(/<meta\s+property="og:url"[^>]*>/i, '<meta property="og:url" content="' + attr(c.url) + '">');

  // Per-market hero image: swap the homepage hero <img> and its LCP preload, so a
  // non-SF market never flashes the SF skyline. Markets without heroImage are untouched.
  if (kind === 'home' && mk.heroImage) {
    const hero = attr(mk.heroImage);
    html = html
      .replace(/(<img class="cm-hero-img" src=")[^"]*(")/i, function (m, a, b) { return a + hero + b; })
      .replace(/(<link rel="preload" as="image" href=")[^"]*(")/i, function (m, a, b) { return a + hero + b; });
  }

  // Per-market accent (team colors): recolor the periwinkle accent tokens in the
  // served CSS. Markets without an accent are left untouched (default periwinkle).
  if (mk.accent) {
    html = html
      .replace(/#9fb4d8/gi, mk.accent)
      .replace(/#91a1ba/gi, mk.accent)
      .replace(/#5a73a8/gi, mk.accentDeep || mk.accent)
      .replace(/159,180,216/g, mk.accentRgb);
  }

  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('content-type', 'text/html;charset=utf-8');
  return new Response(html, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // /building/<slug>/report -> static shell that boots cm-report.js (client-
    // rendered market report). Matched before the single-segment building match
    // below so it isn't swallowed by the ASSETS passthrough. The report's gold
    // palette is market-independent by design, so no accent recolor here.
    const reportM = url.pathname.match(/^\/building\/([^\/]+)\/report\/?$/);
    if (reportM && request.method === 'GET') {
      return new Response(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<meta name="robots" content="noindex">' +
        '<title>Market Report \u00b7 Condo Market</title>' +
        '<link rel="icon" href="/favicon.svg">' +
        '<link rel="preconnect" href="https://fonts.googleapis.com">' +
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
        '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500;1,600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">' +
        '</head><body><div id="cm-report-root"></div>' +
        '<script type="module" src="/assets/cm-report.js"></script>' +
        '<script type="module" src="/assets/offer.js"></script>' +
        '</body></html>',
        {
          status: 200,
          headers: {
            'content-type': 'text/html;charset=utf-8',
            'cache-control': 'public, max-age=60, s-maxage=120',
          },
        }
      );
    }
    const m = url.pathname.match(/^\/building\/([^\/]+)\/?$/);

    // Home + intel: serve the static asset with per-Host chrome + market bootstrap.
    // Everything else (and non-GET) -> static pipeline (redirects, _headers, etc.).
    if (!m) {
      if (request.method === 'GET') {
        if (isHomePath(url.pathname))  return renderChrome(request, env, 'home');
        if (isIntelPath(url.pathname)) return renderChrome(request, env, 'intel');
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

    // Not a live catalogued building: serve a legacy static page if one exists
    // at this path, otherwise Pages' own 404.html (with a 404 status).
    if (!payload || payload.is_live !== true) {
      return env.ASSETS.fetch(request);
    }

    // Per-market accent on the dynamic building page: recolor the periwinkle
    // tokens to the market's team color, exactly as renderChrome does for static pages.
    const mkB = resolveMarket(new URL(request.url).hostname);
    let bodyHtml = renderBuilding(payload);
    if (mkB.accent) {
      bodyHtml = bodyHtml
        .replace(/#9fb4d8/gi, mkB.accent)
        .replace(/#91a1ba/gi, mkB.accent)
        .replace(/#5a73a8/gi, mkB.accentDeep || mkB.accent)
        .replace(/#6a7fa3/gi, mkB.accentDeep || mkB.accent)
        .replace(/159,180,216/g, mkB.accentRgb);
    }
    return new Response(bodyHtml, {
      status: 200,
      headers: {
        'content-type': 'text/html;charset=utf-8',
        'cache-control': 'public, max-age=120, s-maxage=300',
      },
    });
  },
};

/* ----------------------------- helpers ----------------------------------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function money(n)  { return (n == null || isNaN(n)) ? null : '$' + Number(n).toLocaleString('en-US'); }
function intc(n)   { return (n == null || isNaN(n)) ? null : Number(n).toLocaleString('en-US'); }
function decade(y) { return y ? (Math.floor(y / 10) * 10) + "'s" : null; }
function tierLabel(u) {
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

  /* ---- HERO ---- */
  const hstats = [];
  if (p.unit_count != null) hstats.push('<div><div class="hstat-label">Units</div><div class="hstat-val">' + intc(p.unit_count) + '</div></div>');
  if (p.year_built != null) hstats.push('<div><div class="hstat-label">Built</div><div class="hstat-val">' + p.year_built + '</div></div>');
  if (p.floors != null)     hstats.push('<div><div class="hstat-label">Floors</div><div class="hstat-val">' + p.floors + '</div></div>');
  if (psf != null)          hstats.push('<div><div class="hstat-label">Median $/sf</div><div class="hstat-val"><span class="peri">' + money(psf) + '</span></div></div>');
  const heroStats = hstats.length ? '<div class="hero-stats">' + hstats.join('') + '</div>' : '';

  const heroMedia = p.hero_url
    ? '<img class="hero-img" src="' + esc(p.hero_url) + '" alt="' + name + '" loading="eager">'
    : '<div class="hero-img hero-img--ph" role="img" aria-label="' + name + '"></div>';

  /* ---- GALLERY (hide when no images) ---- */
  const imgs = Array.isArray(p.images) ? p.images.filter(function (i) { return i && i.url && i.role !== 'og'; }) : [];
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

  /* ---- ABOUT (always; synthesize when no description) ---- */
  let aboutBody;
  if (p.description && String(p.description).trim()) {
    aboutBody = '<div class="prose">' + paragraphs(p.description) + '</div>';
  } else {
    const bits = [];
    bits.push(p.name +
      ' is a ' + (p.unit_count != null ? intc(p.unit_count) + '-unit ' : '') +
      'condominium building' +
      (hood ? ' in ' + p.neighborhood + ', ' + mkRegion : ' in ' + mkRegion) +
      (p.year_built != null ? ', built in ' + p.year_built : '') + '.');
    if (psf != null) bits.push('Over the last 12 months, units here have traded at a median of ' + money(psf) + ' per square foot.');
    aboutBody = '<div class="prose"><p>' + esc(bits.join(' ')) + '</p></div>';
  }
  const facts = [];
  if (hood)                 facts.push(['Neighborhood', hood]);
  facts.push(['Property type', 'Condo']);
  if (p.year_built != null) facts.push(['Built', String(p.year_built)]);
  if (p.unit_count != null) facts.push(['Units', intc(p.unit_count)]);
  const factGrid = '<div class="fact-grid" style="margin-top:40px;">' +
    facts.map(function (f) { return '<div class="fact"><div class="fact-label">' + f[0] + '</div><div class="fact-val">' + f[1] + '</div></div>'; }).join('') +
    '</div>';
  const aboutSection =
    '<section class="section" id="about"><div class="wrap">' +
    '<div class="section-head"><div class="section-kicker">About</div>' +
    '<h2 class="section-title">About <em>' + name + '</em></h2></div>' +
    aboutBody + factGrid + '</div></section>';

  /* ---- AMENITIES (hide when no features) ---- */
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

  /* ---- DOSSIER (only cards with real data) ---- */
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
  if (p.unit_count != null) dcards.push(card('Unit count', intc(p.unit_count), tierLabel(p.unit_count)));
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
      '<h2 class="dossier-title">' + name + ', by the <em>numbers</em></h2></div>' +
      '<div class="dossier-grid">' + dcards.join('') + '</div>' +
      psfCompare +
      '<div class="dossier-enhanced-cta">' +
      '<h4>Sign in to see the <em style="color:var(--cm-peri);">full dossier</em></h4>' +
      '<p>Unit-level sale history, owner tenure patterns, price trajectories, sale-to-list ratios, and off-market activity signals \u2014 all available to members. Free to sign up.</p>' +
      '<a class="btn-primary" href="#signup" data-cm-auth="signup">Unlock enhanced data \u2192</a></div>' +
      '<div class="cm-inline-cta" style="margin-top:32px;text-align:center;">' +
      '<a href="#offer" data-cm-offer-trigger data-building-slug="' + slug + '" class="cm-inline-cta-link" style="display:inline-flex;align-items:center;gap:8px;color:var(--cm-bronze, #d4a574);font-family:var(--cm-ff-mono, \'JetBrains Mono\', monospace);font-size:12px;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;padding:10px 20px;border:1px solid rgba(212, 165, 116, 0.4);border-radius:999px;transition:all 150ms ease;">See a number worth acting on? Make an offer \u2192</a></div>' +
      '</div></section>';
  }

  /* ---- COMPARE (neighborhood peers by $/sf; hide when none) ---- */
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
      const metaCell = '<div class="nb-meta" style="font-size:13px;color:var(--cm-ivory-dim);font-family:var(--ff-mono);letter-spacing:0.02em;">' + meta + '</div>';
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

  /* ---- MORTGAGE (always; defaults from this building) ---- */
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
    '<div style="margin-top:32px;text-align:center;padding-top:28px;border-top:1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));">' +
    '<p style="color:var(--cm-ivory-dim, rgba(232, 227, 216, 0.64));font-size:14px;margin-bottom:14px;">Numbers add up?</p>' +
    '<a href="#offer" id="mortgage-offer-cta" data-cm-offer-trigger data-building-slug="' + slug + '" data-suggested-price="' + defPrice + '" style="display:inline-flex;align-items:center;gap:8px;background:var(--cm-bronze, #d4a574);color:var(--cm-navy, #1a1f2e);padding:13px 26px;border-radius:999px;font-family:inherit;font-size:14px;font-weight:500;text-decoration:none;transition:transform 150ms ease;">Make this offer \u00b7 <span id="mortgage-offer-amt">$' + defPriceFmt + '</span> \u2192</a></div>' +
    '<script>' + MORT_SYNC + '</script>' +
    '</div></section>';

  /* ---- BUY OR SELL (always) ---- */
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
    '<a class="btn-ghost" href="/owner-signup/?address=' + encodeURIComponent(p.address || '') + '">Set your price \u2192</a></div></div>' +
    '<p style="margin-top:24px;font-size:13px;color:var(--cm-ivory-dim);">All offers require a free account. <a href="#signin" data-cm-auth="login" style="color:var(--cm-peri);">Already have one? Sign in.</a></p>' +
    '</div></section>';

  /* ---- STICKY NAV (only links to sections that render) ---- */
  const nav = [];
  if (imgs.length)  nav.push('<a href="#gallery">Gallery</a>');
  nav.push('<a href="#about">About</a>');
  if (feats.length) nav.push('<a href="#amenities">Amenities</a>');
  if (dcards.length) nav.push('<a href="#dossier">Dossier</a>');
  if (peers.length) nav.push('<a href="#compare">Compare</a>');
  nav.push('<a href="#mortgage">Mortgage</a>');
  nav.push('<a href="#offer">Buy or sell</a>');
  const stickyNav =
    '<div class="sticky-nav"><div class="wrap"><div class="sticky-nav-row">' + nav.join('') + '</div></div></div>';

  /* ---- SEO head ---- */
  const seo = p.seo || {};
  const title = esc(seo.title || (p.name + ' · ' + mkBrand));
  const descPlain = seo.description ||
    (p.name + ' \u2014 ' + (p.unit_count != null ? intc(p.unit_count) + ' units' : 'condominiums') +
      (hood ? ' in ' + p.neighborhood + ', ' + mkRegion : ' in ' + mkRegion) +
      (p.year_built != null ? ', built ' + p.year_built : '') +
      '. Sales, $/ft, owner tenure, and live offer activity.');
  const desc = esc(descPlain);
  const ogImg = seo.og_image ? '<meta property="og:image" content="' + esc(seo.og_image) + '">' : '';
  const canonical = esc(p.canonical_url || ('https://www.' + mkDomain + '/building/' + p.slug));
  const jsonLd = p.json_ld
    ? '<script type="application/ld+json">' + JSON.stringify(p.json_ld).replace(/</g, '\\u003c') + '</script>'
    : '';

  /* ---- assemble ---- */
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + title + '</title>\n' +
    '<meta name="description" content="' + desc + '">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + esc((p.name || '') + ' · ' + mkBrand) + '">\n' +
    '<meta property="og:description" content="' + desc + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n' +
    ogImg + '\n' +
    '<link rel="icon" href="/favicon.svg">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n' +
    '<script type="module" src="/assets/cm-auth-nav.js"></script>\n' +
    jsonLd + '\n' +
    '<style>' + CSS + '</style>\n' +
    '<style>' + EXTRA_CSS + '</style>\n' +
    '</head>\n<body>\n\n' +
    '<header class="masthead"><div class="wrap"><div class="masthead-row">' +
    '<a href="/" class="wordmark">Condo <em>Market</em> · ' + mkTag + '</a>' +
    '<nav class="nav-meta">' +
    '<a href="/buildings/">Buildings</a><a href="/intelligence/">Intelligence</a>' +
    '<a href="/history/">History</a><a href="/how-it-works/">How it works</a>' +
    '<a href="/refer/">Refer</a>' +
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
    '</div><div class="hero-img-wrap">' +
    (hood ? '<span class="hero-badge">' + hood + '</span>' : '') +
    heroMedia +
    '</div></div></div></section>\n' +
    '<section class="section" id="featured-mmm"><div class="wrap">' +
    '<div data-cm-featured data-building="' + slug + '"></div>' +
    '</div></section>\n' +
    stickyNav + '\n' +
    gallerySection +
    aboutSection +
    amenitiesSection +
    dossierSection +
    compareSection +
    mortgageSection +
    offerSection +
    '</main>\n\n' +
    '<footer><div class="wrap"><div class="footer-grid">' +
    '<div><div class="wordmark" style="margin-bottom:14px;">Condo <em>Market</em> · ' + mkTag + '</div>' +
    '<p style="max-width:42ch;">A private exchange for every condo in ' + mkRegion + '. Live offer signals, editorial dossiers.</p></div>' +
    '<div><h5>Explore</h5><ul>' +
    '<li><a href="/buildings/">All buildings</a></li><li><a href="/intelligence/">Intelligence</a></li>' +
    '<li><a href="/history/">History</a></li><li><a href="/refer/">Refer</a></li></ul></div>' +
    '<div><h5>Account</h5><ul>' +
    '<li><a href="#signin" data-cm-auth="login">Sign in</a></li>' +
    '<li><a href="#signup" data-cm-auth="signup">Create account</a></li>' +
    '<li><a href="/dashboard/">Dashboard</a></li></ul></div>' +
    '<div><h5>About</h5><ul>' +
    '<li><a href="/methodology/">Methodology</a></li><li><a href="/how-it-works/">How it works</a></li>' +
    '<li><a href="tel:+14156919272">415-691-9272</a></li>' +
    '<li><a href="mailto:' + mkEmail + '">Contact</a></li></ul></div>' +
    '</div><div class="footer-fine">\u00a9 2026 ' + mkBrand + ' \u00b7 McMullen Properties \u00b7 DRE #02016832</div>' +
    '</div></footer>\n\n' +
    '<script>' + MORT_CALC + '</script>\n' +
    '<script type="module" src="/assets/cm-featured.js"></script>\n' +
    '<script type="module" src="/assets/cm-actions.js"></script>\n' +
    '<script type="module" src="/assets/cm-offer-modal.js"></script>\n' +
    '<script type="module" src="/assets/cm-dossier.js"></script>\n' +
    '<script type="module" src="/assets/cm-dossier.js"></script>\n' +
'<script type="module" src="/assets/offer.js"></script>\n' +
    '</body>\n</html>';
}

/* Small additive styles: hero placeholder for buildings with no hero image,
   and a graceful single-image gallery. Everything else is the proven CSS. */
const EXTRA_CSS =
  '.nb-meta{font-size:13px;color:var(--cm-ivory-dim);font-family:var(--ff-mono);}' +
  '.nb-row--self{background:rgba(159,180,216,0.07);padding-left:12px;padding-right:12px;}' +
  '.nb-row--self::after{content:"";opacity:0;}' +
  '.nb-badge{display:inline-block;margin-left:10px;font-family:var(--ff-mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--cm-navy);background:var(--cm-peri);padding:2px 8px;border-radius:999px;vertical-align:middle;}' +
  '.hero-img--ph{position:absolute;inset:0;width:100%;height:100%;' +
  'background:radial-gradient(120% 90% at 30% 15%,rgba(159,180,216,0.22),transparent 58%),' +
  'linear-gradient(165deg,#2a3247 0%,#171d2a 58%,#0f131d 100%);}' +
  '.hero-img--ph::after{content:"";position:absolute;left:50%;bottom:0;transform:translateX(-50%);' +
  'width:74%;height:64%;opacity:.5;background-repeat:no-repeat;background-position:center bottom;background-size:contain;' +
  'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 300 200\'%3E%3Cg fill=\'%239fb4d8\'%3E%3Crect x=\'66\' y=\'70\' width=\'40\' height=\'130\'/%3E%3Crect x=\'116\' y=\'40\' width=\'52\' height=\'160\'/%3E%3Crect x=\'178\' y=\'86\' width=\'34\' height=\'114\'/%3E%3C/g%3E%3Cg fill=\'%230f131d\'%3E%3Crect x=\'74\' y=\'82\' width=\'8\' height=\'10\'/%3E%3Crect x=\'90\' y=\'82\' width=\'8\' height=\'10\'/%3E%3Crect x=\'74\' y=\'102\' width=\'8\' height=\'10\'/%3E%3Crect x=\'90\' y=\'102\' width=\'8\' height=\'10\'/%3E%3Crect x=\'126\' y=\'54\' width=\'9\' height=\'11\'/%3E%3Crect x=\'144\' y=\'54\' width=\'9\' height=\'11\'/%3E%3Crect x=\'126\' y=\'76\' width=\'9\' height=\'11\'/%3E%3Crect x=\'144\' y=\'76\' width=\'9\' height=\'11\'/%3E%3Crect x=\'126\' y=\'98\' width=\'9\' height=\'11\'/%3E%3Crect x=\'144\' y=\'98\' width=\'9\' height=\'11\'/%3E%3Crect x=\'186\' y=\'98\' width=\'7\' height=\'9\'/%3E%3Crect x=\'199\' y=\'98\' width=\'7\' height=\'9\'/%3E%3C/g%3E%3C/svg%3E");}';

/* ---------- verbatim blocks from the proven page (do not edit) ---------- */
const CSS = `
  :root {
    --cm-navy: #1a1f2e;
    --cm-navy-deep: #0f131d;
    --cm-peri: #9fb4d8;
    --cm-peri-dim: #6a7fa3;
    --cm-ivory: #e8e3d8;
    --cm-ivory-dim: rgba(232, 227, 216, 0.64);
    --cm-ivory-faint: rgba(232, 227, 216, 0.28);
    --cm-rule: rgba(232, 227, 216, 0.14);
    --cm-accent: #d4a574;
    --cm-gain: #8fb97a;
    --cm-loss: #c97865;
    --ff-display: 'Playfair Display', Georgia, serif;
    --ff-body: 'DM Sans', -apple-system, sans-serif;
    --ff-mono: 'JetBrains Mono', ui-monospace, monospace;
    --page-max: 1280px;
    --gutter: clamp(20px, 4vw, 56px);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: var(--cm-navy-deep); color: var(--cm-ivory);
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

  /* Masthead */
  .masthead { padding: 22px 0; border-bottom: 1px solid var(--cm-rule); }
  .masthead-row { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .wordmark { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 22px; color: var(--cm-ivory); text-decoration: none; }
  .wordmark em { color: var(--cm-peri); }
  .nav-meta { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cm-ivory-dim); display: flex; gap: 22px; align-items: center; }
  .nav-meta a { color: var(--cm-ivory-dim); text-decoration: none; transition: color 0.15s; }
  .nav-meta a:hover { color: var(--cm-ivory); }
  .signin-btn { color: var(--cm-ivory) !important; border: 1px solid var(--cm-rule); padding: 7px 14px; border-radius: 999px; }
  .signin-btn:hover { border-color: var(--cm-peri); color: var(--cm-peri) !important; }

  /* Breadcrumb */
  .crumb { padding: 18px 0 0; font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cm-ivory-dim); }
  .crumb a { color: var(--cm-ivory-dim); }
  .crumb a:hover { color: var(--cm-peri); }
  .crumb span.sep { margin: 0 10px; }

  /* HERO */
  .hero { padding: 32px 0 56px; }
  .hero-head { display: grid; grid-template-columns: 1fr; gap: 36px; }
  @media (min-width: 900px) { .hero-head { grid-template-columns: 1.2fr 1fr; align-items: end; } }
  .hero-kicker { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--cm-peri); margin-bottom: 18px; }
  .hero h1 { font-family: var(--ff-display); font-weight: 500; font-size: clamp(44px, 6vw, 78px); line-height: 1.02; letter-spacing: -0.02em; color: var(--cm-ivory); margin-bottom: 12px; }
  .hero h1 em { font-style: italic; color: var(--cm-peri); }
  .hero-addr { font-family: var(--ff-body); font-size: 17px; color: var(--cm-ivory-dim); margin-bottom: 32px; }

  /* Hero stat row */
  .hero-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 20px; border-top: 1px solid var(--cm-rule); border-bottom: 1px solid var(--cm-rule); padding: 24px 0; }
  .hstat-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--cm-ivory-dim); margin-bottom: 6px; }
  .hstat-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 28px; color: var(--cm-ivory); line-height: 1; }
  .hstat-val .peri { color: var(--cm-peri); }

  .hero-img-wrap { position: relative; border-radius: 12px; overflow: hidden; background: var(--cm-navy); min-height: 340px; aspect-ratio: 4/5; }
  .hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero-badge { position: absolute; top: 16px; left: 16px; background: rgba(26,31,46,0.85); color: var(--cm-peri); padding: 6px 12px; border-radius: 4px; font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; backdrop-filter: blur(8px); }

  /* Sticky inner nav */
  .sticky-nav { position: sticky; top: 0; z-index: 50; background: var(--cm-navy-deep); border-top: 1px solid var(--cm-rule); border-bottom: 1px solid var(--cm-rule); }
  .sticky-nav-row { display: flex; gap: 28px; overflow-x: auto; padding: 14px 0; scrollbar-width: none; }
  .sticky-nav-row::-webkit-scrollbar { display: none; }
  .sticky-nav-row a { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--cm-ivory-dim); white-space: nowrap; padding-bottom: 4px; border-bottom: 1px solid transparent; transition: all 0.15s; }
  .sticky-nav-row a:hover { color: var(--cm-peri); border-bottom-color: var(--cm-peri); }

  /* Sections */
  .section { padding: 64px 0; border-bottom: 1px solid var(--cm-rule); }
  .section:last-child { border-bottom: none; }
  .section-head { margin-bottom: 32px; }
  .section-kicker { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--cm-peri); margin-bottom: 14px; }
  .section-title { font-family: var(--ff-display); font-weight: 500; font-size: clamp(32px, 4vw, 48px); line-height: 1.1; letter-spacing: -0.015em; margin-bottom: 12px; color: var(--cm-ivory); }
  .section-title em { font-style: italic; color: var(--cm-peri); }
  .section-sub { font-size: 17px; color: var(--cm-ivory-dim); max-width: 56ch; }

  /* Gallery */
  .gallery { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-top: 36px; }
  .gallery-item { border-radius: 10px; overflow: hidden; background: var(--cm-navy); aspect-ratio: 1; }
  .gallery-item.main { grid-row: span 2; aspect-ratio: 1/1.05; }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s; }
  .gallery-item:hover img { transform: scale(1.03); }
  @media (max-width: 720px) { .gallery { grid-template-columns: 1fr 1fr; } .gallery-item.main { grid-column: span 2; grid-row: span 1; aspect-ratio: 16/10; } }

  /* Description */
  .prose { max-width: 68ch; color: var(--cm-ivory); font-size: 17px; line-height: 1.75; }
  .prose p { margin-bottom: 20px; }
  .prose ul { padding-left: 20px; margin-bottom: 20px; }
  .prose li { margin-bottom: 10px; color: var(--cm-ivory); }
  .prose strong { color: var(--cm-ivory); font-weight: 500; }

  /* Fact grid */
  .fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 24px; margin-top: 12px; }
  .fact { border-left: 2px solid var(--cm-peri); padding: 4px 0 4px 18px; }
  .fact-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--cm-ivory-dim); margin-bottom: 8px; }
  .fact-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; color: var(--cm-ivory); }

  /* Amenity chips */
  .amenity-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
  .amenity-chip { background: rgba(159,180,216,0.08); border: 1px solid var(--cm-rule); color: var(--cm-ivory); padding: 8px 16px; border-radius: 999px; font-size: 13px; }

  /* DOSSIER (second-fold feature) */
  .dossier-section { background: var(--cm-navy); padding: 72px 0; border-bottom: 1px solid var(--cm-rule); }
  .dossier-head { text-align: center; margin-bottom: 48px; }
  .dossier-kicker { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--cm-peri); margin-bottom: 20px; }
  .dossier-title { font-family: var(--ff-display); font-weight: 500; font-size: clamp(38px, 5vw, 56px); letter-spacing: -0.015em; line-height: 1.05; color: var(--cm-ivory); }
  .dossier-title em { font-style: italic; color: var(--cm-peri); }
  .dossier-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; margin-bottom: 48px; }
  .dossier-card { background: var(--cm-navy-deep); border: 1px solid var(--cm-rule); border-radius: 10px; padding: 28px 26px; }
  .dossier-metric-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--cm-ivory-dim); margin-bottom: 10px; }
  .dossier-metric-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 40px; color: var(--cm-ivory); line-height: 1; margin-bottom: 8px; }
  .dossier-metric-val.peri { color: var(--cm-peri); }
  .dossier-metric-sub { font-size: 12px; color: var(--cm-ivory-dim); font-family: var(--ff-mono); }
  .psf-compare { margin-top: 12px; padding-top: 14px; border-top: 1px solid var(--cm-rule); }
  .psf-compare-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--cm-ivory-dim); padding: 4px 0; font-family: var(--ff-mono); }
  .psf-compare-row .up { color: var(--cm-gain); }
  .psf-compare-row .dn { color: var(--cm-loss); }
  .dossier-enhanced-cta { text-align: center; padding: 32px; background: rgba(159,180,216,0.05); border: 1px dashed var(--cm-peri); border-radius: 12px; margin-top: 40px; }
  .dossier-enhanced-cta h4 { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; color: var(--cm-ivory); margin-bottom: 10px; }
  .dossier-enhanced-cta p { color: var(--cm-ivory-dim); margin-bottom: 20px; max-width: 48ch; margin-left: auto; margin-right: auto; }

  /* Unit map CTA */
  .unit-map-cta { margin: 48px 0 0; padding: 28px 32px; background: rgba(159,180,216,0.06); border: 1px solid var(--cm-peri); border-radius: 12px; display: flex; align-items: center; gap: 28px; flex-wrap: wrap; justify-content: space-between; }
  .unit-map-cta h3 { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 22px; color: var(--cm-ivory); margin-bottom: 6px; }
  .unit-map-cta p { color: var(--cm-ivory-dim); font-size: 14px; max-width: 44ch; margin: 0; }

  /* Neighbor comparison */
  .nb-grid { display: grid; grid-template-columns: 1fr; gap: 0; margin-top: 28px; border-top: 1px solid var(--cm-rule); }
  .nb-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr auto; gap: 20px; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--cm-rule); transition: background 0.15s; }
  .nb-row:hover { background: rgba(159,180,216,0.03); padding-left: 12px; padding-right: 12px; }
  .nb-row::after { content: '→'; color: var(--cm-peri); font-size: 16px; opacity: 0; transition: all 0.15s; }
  .nb-row:hover::after { opacity: 1; transform: translateX(4px); }
  .nb-name { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 20px; color: var(--cm-ivory); }
  .nb-psf { font-family: var(--ff-display); font-weight: 500; font-size: 20px; color: var(--cm-peri); }
  .nb-psf .nb-unit { color: var(--cm-ivory-dim); font-size: 13px; margin-left: 2px; }
  .nb-units { font-family: var(--ff-mono); font-size: 12px; color: var(--cm-ivory-dim); letter-spacing: 0.04em; }

  /* Mortgage calculator */
  .mortgage-grid { display: grid; grid-template-columns: 1fr; gap: 32px; margin-top: 36px; }
  @media (min-width: 820px) { .mortgage-grid { grid-template-columns: 1.2fr 1fr; gap: 48px; } }
  .mortgage-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .mortgage-inputs .full { grid-column: span 2; }
  .mort-field { border: 1px solid var(--cm-rule); border-radius: 10px; padding: 14px 18px; background: var(--cm-navy); }
  .mort-field-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--cm-ivory-dim); margin-bottom: 6px; }
  .mort-field-val { display: flex; align-items: baseline; gap: 4px; }
  .mort-field-val .prefix { color: var(--cm-ivory-dim); font-size: 14px; }
  .mort-field-val input { background: transparent; border: none; color: var(--cm-ivory); font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; width: 100%; outline: none; }
  .mort-field-val input:focus { color: var(--cm-peri); }
  .mort-field-val .suffix { color: var(--cm-ivory-dim); font-size: 14px; }
  .mort-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 2px; background: var(--cm-rule); margin-top: 12px; cursor: pointer; }
  .mort-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: var(--cm-peri); border-radius: 50%; cursor: pointer; }
  .mort-slider::-moz-range-thumb { width: 16px; height: 16px; background: var(--cm-peri); border-radius: 50%; border: none; cursor: pointer; }
  .mort-result { background: rgba(159,180,216,0.06); border: 1px solid var(--cm-peri); border-radius: 12px; padding: 36px; text-align: center; display: flex; flex-direction: column; justify-content: center; }
  .mort-result-label { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--cm-ivory-dim); margin-bottom: 12px; }
  .mort-result-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: clamp(40px, 6vw, 64px); color: var(--cm-ivory); line-height: 1; margin-bottom: 8px; }
  .mort-result-sub { font-family: var(--ff-mono); font-size: 12px; color: var(--cm-ivory-dim); }
  .mort-breakdown { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--cm-rule); text-align: left; }
  .mort-breakdown-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: var(--cm-ivory-dim); }
  .mort-breakdown-row .v { color: var(--cm-ivory); font-family: var(--ff-mono); }

  /* Offer card */
  .offer-panel { background: var(--cm-navy); border: 1px solid var(--cm-peri); border-radius: 12px; padding: 36px; display: grid; grid-template-columns: 1fr; gap: 28px; margin-top: 36px; }
  @media (min-width: 780px) { .offer-panel { grid-template-columns: 1fr 1fr; } }
  .offer-option h3 { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; color: var(--cm-ivory); margin-bottom: 12px; }
  .offer-option p { color: var(--cm-ivory-dim); margin-bottom: 20px; font-size: 15px; }

  /* Video */
  .video-wrap { aspect-ratio: 16/9; border-radius: 10px; overflow: hidden; background: var(--cm-navy); }
  .video-wrap iframe { width: 100%; height: 100%; border: none; }

  /* CTAs */
  .btn-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--cm-peri); color: var(--cm-navy); padding: 13px 28px; border-radius: 999px; font-weight: 500; font-size: 14px; cursor: pointer; border: none; font-family: inherit; transition: opacity 0.15s; text-decoration: none; }
  .btn-primary:hover { opacity: 0.88; }
  .btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: var(--cm-ivory); padding: 13px 28px; border-radius: 999px; font-weight: 500; font-size: 14px; cursor: pointer; border: 1px solid var(--cm-rule); font-family: inherit; transition: all 0.15s; text-decoration: none; }
  .btn-ghost:hover { border-color: var(--cm-peri); color: var(--cm-peri); }

  /* Footer */
  footer { padding: 48px 0 40px; background: var(--cm-navy); color: var(--cm-ivory-dim); font-size: 13px; border-top: 1px solid var(--cm-rule); }
  .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 32px; }
  @media (max-width: 760px) { .footer-grid { grid-template-columns: 1fr 1fr; } }
  footer h5 { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--cm-ivory); margin-bottom: 14px; font-weight: 500; }
  footer ul { list-style: none; }
  footer li { padding: 4px 0; }
  footer a { color: var(--cm-ivory-dim); }
  footer a:hover { color: var(--cm-peri); }
  .footer-fine { padding-top: 28px; margin-top: 28px; border-top: 1px solid var(--cm-rule); font-size: 12px; opacity: 0.7; text-align: center; }
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
          // Sync the suggested price as the slider moves so the modal opens with the right amount
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
  // Mortgage calculator
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
      // SF effective property tax rate ~1.18%
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
