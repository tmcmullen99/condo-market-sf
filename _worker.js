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

/* --------------------- multi-market chrome (per-Host) -------------------- */
const MARKET_BY_HOST = {
  'sanfranciscocondomarket.com':      'sf',
  'www.sanfranciscocondomarket.com':  'sf',
  'siliconvalleycondomarket.com':     'sv',
  'www.siliconvalleycondomarket.com': 'sv',
};
const MARKETS = {
  sf: { tag: 'sf', slug: 'san-francisco-condo-market',  brand: 'Condo Market SF',             region: 'San Francisco', domain: 'sanfranciscocondomarket.com',  email: 'tim@sanfranciscocondomarket.com',  accent: '#C2410C', accentDeep: '#9A3412', accentRgb: '194,65,12' },
  sv: { tag: 'sv', slug: 'silicon-valley-condo-market', brand: 'Condo Market Silicon Valley', region: 'Silicon Valley', domain: 'siliconvalleycondomarket.com', email: 'tim@siliconvalleycondomarket.com', heroImage: 'https://images.unsplash.com/photo-1719290227108-ea72b5728ec7?w=2400&q=85&auto=format&fit=crop', accent: '#00A8B5', accentDeep: '#006D75', accentRgb: '0,168,181' },
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
    url:   www + '/buildings/',
  };
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
    '\n<link rel="canonical" href="' + attr(c.url) + '">';
  html = html.replace('<head>', '<head>' + inject);

  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>' + attr(c.title) + '</title>')
    .replace(/<meta\s+name="description"[^>]*>/i, '<meta name="description" content="' + attr(c.desc) + '">')
    .replace(/<meta\s+property="og:title"[^>]*>/i, '<meta property="og:title" content="' + attr(c.title) + '">')
    .replace(/<meta\s+property="og:description"[^>]*>/i, '<meta property="og:description" content="' + attr(c.desc) + '">')
    .replace(/<meta\s+property="og:url"[^>]*>/i, '<meta property="og:url" content="' + attr(c.url) + '">');

  if (kind === 'home' && mk.heroImage) {
    const hero = attr(mk.heroImage);
    html = html
      .replace(/(<img class="cm-hero-img" src=")[^"]*(")/i, function (m, a, b) { return a + hero + b; })
      .replace(/(<link rel="preload" as="image" href=")[^"]*(")/i, function (m, a, b) { return a + hero + b; });
  }

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
  const headers = new Headers(resp.headers);
  headers.delete('content-length');
  return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostMk = resolveMarket(url.hostname);

    // robots.txt — per-host, points at this host's sitemap.
    if (url.pathname === '/robots.txt') {
      const body = 'User-agent: *\nAllow: /\nSitemap: https://www.' + hostMk.domain + '/sitemap.xml\n';
      return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
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

    // /building/<slug>/report → 301 to building page #market section.
    // The dedicated report page is consolidated into the building page's
    // market analysis section; this preserves email-link integrity.
    const reportM = url.pathname.match(/^\/building\/([^\/]+)\/report\/?$/);
    if (reportM && request.method === 'GET') {
      const target = 'https://' + url.host + '/building/' + reportM[1] + '/#market';
      return new Response(null, { status: 301, headers: { 'Location': target, 'Cache-Control': 'public, max-age=3600' } });
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

    const bodyHtml = applyMarketSwaps(renderBuilding(payload), hostMk);
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

  const staticUrls = ['/buildings/', '/intelligence/', '/how-it-works/'];
  if (mk.tag === 'sf') staticUrls.push('/san-francisco-condo-rankings');
  if (mk.tag === 'sf') staticUrls.push('/san-francisco-condo-market-stats');
  if (mk.tag === 'sf') staticUrls.push('/san-francisco-condos');
  if (mk.tag === 'sf') staticUrls.push('/neighborhoods');
  // per-neighborhood detail URLs (SF)
  let nbRows = [];
  if (mk.tag === 'sf') {
    nbRows = await callReportRpc('neighborhoods_index', { p_market_domain: mk.domain });
  }
  const today = new Date().toISOString().slice(0, 10);
  const urlsXml = [];
  for (const u of staticUrls) {
    urlsXml.push('<url><loc>' + base + u + '</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>');
  }
  for (const r of (rows || [])) {
    const lm = r.updated_at ? String(r.updated_at).slice(0, 10) : today;
    urlsXml.push('<url><loc>' + base + '/building/' + r.slug + '/</loc><lastmod>' + lm + '</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>');
  }
  for (const n of (nbRows || [])) {
    urlsXml.push('<url><loc>' + base + '/neighborhood/' + hoodSlug(n.neighborhood) + '</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>');
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
':root{--dark:#0a0d12;--orange:#C2410C;--orange-bright:#e85d2a;--ivory:#e8e3d8;--dim:#8893a6;--line:rgba(194,65,12,.16);--up:#4f9d5d;--down:#c46a4a}' +
'*{box-sizing:border-box}body{margin:0;background:var(--dark);color:var(--ivory);font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6}' +
'.wrap{max-width:1040px;margin:0 auto;padding:0 24px}' +
'header.cm{border-bottom:1px solid var(--line);background:rgba(10,13,18,.9)}header.cm .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}' +
'.wm{font-family:"Playfair Display",serif;font-style:italic;font-size:21px;color:var(--ivory);text-decoration:none}.wm b{color:var(--orange);font-style:normal;font-weight:700}' +
'.nav a{color:var(--dim);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-left:22px}.nav a:hover{color:var(--orange-bright)}' +
'.hero{padding:56px 0 28px;border-bottom:1px solid var(--line)}' +
'.kick{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--orange);margin:0 0 14px}' +
'h1{font-family:"Playfair Display",serif;font-weight:700;font-size:clamp(28px,5vw,44px);line-height:1.1;margin:0 0 16px}' +
'.lede{font-size:17px;color:#c3ccd9;max-width:700px;margin:0}.upd{font-size:12px;color:var(--dim);margin-top:16px}' +
'.links{padding:22px 0}.links a{color:var(--orange-bright);text-decoration:none;font-weight:600;border-bottom:1px solid var(--line);margin-right:22px;font-size:14px}' +
'.ngrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:14px 0 30px}@media(max-width:820px){.ngrid{grid-template-columns:repeat(2,1fr)}}@media(max-width:540px){.ngrid{grid-template-columns:1fr}}' +
'.ncard{display:block;border:1px solid var(--line);border-radius:12px;padding:18px;text-decoration:none;transition:border-color .15s}.ncard:hover{border-color:var(--orange)}' +
'.nname{font-family:"Playfair Display",serif;font-size:20px;font-weight:700;color:var(--ivory)}' +
'.nstat{font-size:22px;font-weight:700;color:var(--orange-bright);margin-top:8px;font-variant-numeric:tabular-nums}.nstat span{font-size:12px;color:var(--dim);font-weight:500;margin-left:4px}.nstat.thin{font-size:14px;color:var(--dim);font-weight:600}' +
'.nmeta{font-size:12.5px;color:var(--dim);margin-top:6px}' +
'.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:34px 0}@media(max-width:720px){.grid{grid-template-columns:1fr}}' +
'.stat{border:1px solid var(--line);border-radius:14px;padding:22px}.stat-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);font-weight:700;margin-bottom:10px}' +
'.stat-val{font-family:"Playfair Display",serif;font-size:32px;font-weight:700;font-variant-numeric:tabular-nums}.stat-sub{font-size:13px;color:var(--dim);margin-top:8px}' +
'.d{font-weight:700}.d.up{color:var(--up)}.d.down{color:var(--down)}.d.flat{color:var(--dim)}' +
'.thinnote{border:1px solid var(--line);border-radius:12px;padding:20px;color:#c3ccd9;font-size:15px;margin:30px 0}' +
'section{padding:18px 0 10px;border-top:1px solid var(--line)}h2{font-family:"Playfair Display",serif;font-size:23px;font-weight:700;margin:24px 0 16px}' +
'table{width:100%;border-collapse:collapse;font-size:15px}th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);font-weight:700;padding:0 12px 10px;border-bottom:1px solid var(--line)}' +
'th.num,td.num{text-align:right}td{padding:12px;border-bottom:1px solid rgba(136,147,166,.12);font-variant-numeric:tabular-nums}td a{color:var(--ivory);text-decoration:none;font-weight:600;border-bottom:1px solid var(--line)}td a:hover{color:var(--orange-bright)}' +
'.method{color:var(--dim);font-size:13px;max-width:760px;margin-top:26px}' +
'</style></head><body>' +
'<header class="cm"><div class="wrap"><a class="wm" href="' + base + '/">Condo <b>Market</b> · sf</a>' +
'<nav class="nav"><a href="' + base + '/neighborhoods">Neighborhoods</a><a href="' + base + '/san-francisco-condo-rankings">Rankings</a><a href="' + base + '/san-francisco-condo-market-stats">Stats</a></nav></div></header>' +
body + '</body></html>';
}

/* ---- intel page: neighborhood comparison widget (client-rendered) ---- */
function neighborhoodCompareWidget(mk) {
  var SB = SUPABASE_URL, AK = SUPABASE_ANON_KEY;
  return '' +
'<section id="cm-nb-compare" style="background:#0a0d12;color:#e8e3d8"><div style="max-width:1040px;margin:0 auto;padding:64px 24px;font-family:\'DM Sans\',sans-serif">' +
'<p style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#C2410C;margin:0 0 12px">Neighborhood Data</p>' +
'<h2 style="font-family:\'Playfair Display\',serif;font-size:27px;font-weight:700;margin:0 0 8px;color:#e8e3d8">Compare two neighborhoods</h2>' +
'<p style="color:#8893a6;font-size:15px;max-width:680px;margin:0 0 22px">Pick any two San Francisco neighborhoods to compare median price per square foot, sale price, and recent activity side by side. For the full picture on any one, visit its <a href="https://www.sanfranciscocondomarket.com/neighborhoods" style="color:#e85d2a;text-decoration:none;border-bottom:1px solid rgba(194,65,12,.16)">neighborhood page</a>.</p>' +
'<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px">' +
'<select id="cmNbA" style="flex:1;min-width:200px;background:#0d111a;color:#e8e3d8;border:1px solid rgba(194,65,12,.3);border-radius:10px;padding:12px 14px;font-size:15px;font-family:inherit"></select>' +
'<select id="cmNbB" style="flex:1;min-width:200px;background:#0d111a;color:#e8e3d8;border:1px solid rgba(194,65,12,.3);border-radius:10px;padding:12px 14px;font-size:15px;font-family:inherit"></select>' +
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
'var psf=n.is_thin?\'<span style="color:#8893a6;font-size:14px">Limited recent sales</span>\':money(n.median_psf);' +
'var price=n.is_thin?"\\u2014":money(n.median_price);' +
'return \'<div style="flex:1;min-width:220px;border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px">\'' +
'+\'<div style="font-family:\\\'Playfair Display\\\',serif;font-size:21px;font-weight:700;color:#e8e3d8;margin-bottom:16px">\'+n.neighborhood+\'</div>\'' +
'+\'<div style="margin-bottom:12px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8893a6;font-weight:700">Median $/sqft</div><div style="font-size:26px;font-weight:700;color:#e85d2a;font-variant-numeric:tabular-nums">\'+psf+\'</div></div>\'' +
'+\'<div style="margin-bottom:12px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8893a6;font-weight:700">Median price</div><div style="font-size:20px;font-weight:700;color:#e8e3d8;font-variant-numeric:tabular-nums">\'+price+\'</div></div>\'' +
'+\'<div style="margin-bottom:14px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8893a6;font-weight:700">Sales / 12mo</div><div style="font-size:20px;font-weight:700;color:#e8e3d8">\'+intc(n.sales_12mo)+\' <span style="font-size:13px;color:#8893a6;font-weight:500">/ \'+intc(n.building_count)+\' buildings</span></div></div>\'' +
'+\'<a href="https://www.sanfranciscocondomarket.com/neighborhood/\'+slug(n.neighborhood)+\'" style="color:#e85d2a;text-decoration:none;font-size:13px;font-weight:600">View \'+n.neighborhood+\' \\u2192</a></div>\';}' +
'function render(){var a=data[elA.value],b=data[elB.value];out.innerHTML=\'<div style="display:flex;gap:14px;flex-wrap:wrap">\'+cell(a)+cell(b)+\'</div>\';}' +
'elA.addEventListener("change",render);elB.addEventListener("change",render);render();' +
'}).catch(function(){out.innerHTML=\'<p style="color:#8893a6">Neighborhood data is loading\\u2014refresh in a moment.</p>\';});' +
'})();</script>';
}

/* ---- intel page: price movement widget (1/3/5/10yr, client-rendered) ---- */
function priceMovementWidget(mk) {
  var SB = SUPABASE_URL, AK = SUPABASE_ANON_KEY;
  return '' +
'<section id="cm-pm" style="background:#0a0d12;color:#e8e3d8"><div style="max-width:1040px;margin:0 auto;padding:8px 24px 64px;font-family:\'DM Sans\',sans-serif">' +
'<p style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#C2410C;margin:0 0 12px">How Prices Have Moved</p>' +
'<h2 style="font-family:\'Playfair Display\',serif;font-size:27px;font-weight:700;margin:0 0 8px;color:#e8e3d8">Price movement by neighborhood</h2>' +
'<p style="color:#8893a6;font-size:15px;max-width:680px;margin:0 0 22px">Choose a neighborhood and a time horizon to see how the median price per square foot has moved. Horizons without enough recorded sales to be reliable are marked accordingly.</p>' +
'<select id="cmPmNb" style="width:100%;max-width:420px;background:#0d111a;color:#e8e3d8;border:1px solid rgba(194,65,12,.3);border-radius:10px;padding:12px 14px;font-size:15px;font-family:inherit;margin-bottom:18px"></select>' +
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
'if(!r||r.pct_change==null){out.innerHTML=\'<div style="border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:24px;color:#8893a6;font-size:15px">Not enough recorded sales in \'+sel.value+\' over this \'+hdr(active).toLowerCase()+\' window to report a reliable change.</div>\';return;}' +
'var up=r.pct_change>=0,col=up?"#4f9d5d":"#c46a4a",arr=up?"\\u25B2":"\\u25BC";' +
'out.innerHTML=\'<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:stretch">\'' +
'+\'<div style="flex:1;min-width:160px;border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8893a6;font-weight:700">\'+hdr(active)+\' Ago</div><div style="font-size:28px;font-weight:700;color:#e8e3d8;font-variant-numeric:tabular-nums">\'+money(r.median_then)+\'</div><div style="font-size:12px;color:#8893a6;margin-top:4px">median $/sqft</div></div>\'' +
'+\'<div style="flex:1;min-width:160px;border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8893a6;font-weight:700">Today</div><div style="font-size:28px;font-weight:700;color:#e85d2a;font-variant-numeric:tabular-nums">\'+money(r.median_now)+\'</div><div style="font-size:12px;color:#8893a6;margin-top:4px">median $/sqft</div></div>\'' +
'+\'<div style="flex:1;min-width:160px;border:1px solid rgba(194,65,12,.16);border-radius:14px;padding:22px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8893a6;font-weight:700">Change</div><div style="font-size:28px;font-weight:700;color:\'+col+\';font-variant-numeric:tabular-nums">\'+arr+\' \'+Math.abs(r.pct_change)+\'%</div><div style="font-size:12px;color:#8893a6;margin-top:4px">over \'+hdr(active).toLowerCase()+\'</div></div></div>\';}' +
'function loadNb(){var nb=sel.value;if(cache[nb]){render();return;}' +
'fetch(SB+"/rest/v1/rpc/neighborhood_price_movement",{method:"POST",headers:{apikey:AK,Authorization:"Bearer "+AK,"Content-Type":"application/json"},body:JSON.stringify({p_market_domain:"sanfranciscocondomarket.com",p_neighborhood:nb})})' +
'.then(function(r){return r.json();}).then(function(rows){cache[nb]=rows;render();});}' +
'fetch(SB+"/rest/v1/rpc/neighborhoods_index",{method:"POST",headers:{apikey:AK,Authorization:"Bearer "+AK,"Content-Type":"application/json"},body:JSON.stringify({p_market_domain:"sanfranciscocondomarket.com"})})' +
'.then(function(r){return r.json();}).then(function(rows){' +
'sel.innerHTML=rows.map(function(n){return \'<option value="\'+n.neighborhood.replace(/"/g,"")+\'">\'+n.neighborhood+\'</option>\';}).join("");' +
'sel.addEventListener("change",loadNb);drawTabs();loadNb();' +
'}).catch(function(){out.innerHTML=\'<p style="color:#8893a6">Price data is loading\\u2014refresh in a moment.</p>\';});' +
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
':root{--dark:#0a0d12;--orange:#C2410C;--orange-bright:#e85d2a;--ivory:#e8e3d8;--dim:#8893a6;--line:rgba(194,65,12,.16)}' +
'*{box-sizing:border-box}body{margin:0;background:var(--dark);color:var(--ivory);font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6}' +
'.wrap{max-width:1080px;margin:0 auto;padding:0 24px}' +
'header.cm{border-bottom:1px solid var(--line);background:rgba(10,13,18,.9)}header.cm .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}' +
'.wm{font-family:"Playfair Display",serif;font-style:italic;font-size:21px;color:var(--ivory);text-decoration:none}.wm b{color:var(--orange);font-style:normal;font-weight:700}' +
'.nav a{color:var(--dim);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-left:22px}.nav a:hover{color:var(--orange-bright)}' +
'.hero{padding:58px 0 28px;border-bottom:1px solid var(--line)}' +
'.kick{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--orange);margin:0 0 14px}' +
'h1{font-family:"Playfair Display",serif;font-weight:700;font-size:clamp(30px,5vw,44px);line-height:1.1;margin:0 0 16px}' +
'.lede{font-size:17px;color:#c3ccd9;max-width:700px;margin:0}.upd{font-size:12px;color:var(--dim);margin-top:16px}' +
'.links{padding:22px 0 6px}.links a{color:var(--orange-bright);text-decoration:none;font-weight:600;border-bottom:1px solid var(--line);margin-right:22px;font-size:14px}' +
'.hoodsec{padding:30px 0;border-bottom:1px solid var(--line)}' +
'h2{font-family:"Playfair Display",serif;font-size:23px;font-weight:700;margin:0 0 18px}.hoodn{color:var(--dim);font-size:15px;font-weight:500}' +
'.bgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:820px){.bgrid{grid-template-columns:repeat(2,1fr)}}@media(max-width:540px){.bgrid{grid-template-columns:1fr}}' +
'.bcard{display:block;border:1px solid var(--line);border-radius:12px;padding:16px 18px;text-decoration:none;transition:border-color .15s}' +
'.bcard:hover{border-color:var(--orange)}' +
'.bname{font-family:"Playfair Display",serif;font-size:18px;font-weight:700;color:var(--ivory)}' +
'.baddr{font-size:13px;color:var(--dim);margin-top:3px}' +
'.bfacts{font-size:12.5px;color:var(--orange-bright);margin-top:8px;font-variant-numeric:tabular-nums}' +
'.method{color:var(--dim);font-size:13px;max-width:760px;padding:34px 0 70px}' +
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
':root{--dark:#0a0d12;--orange:#C2410C;--orange-bright:#e85d2a;--ivory:#e8e3d8;--dim:#8893a6;--line:rgba(194,65,12,.16);--up:#4f9d5d;--down:#c46a4a}' +
'*{box-sizing:border-box}body{margin:0;background:var(--dark);color:var(--ivory);font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6}' +
'.wrap{max-width:1040px;margin:0 auto;padding:0 24px}' +
'header.cm{border-bottom:1px solid var(--line);background:rgba(10,13,18,.9)}header.cm .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}' +
'.wm{font-family:"Playfair Display",serif;font-style:italic;font-size:21px;color:var(--ivory);text-decoration:none}.wm b{color:var(--orange);font-style:normal;font-weight:700}' +
'.nav a{color:var(--dim);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-left:22px}.nav a:hover{color:var(--orange-bright)}' +
'.hero{padding:60px 0 30px;border-bottom:1px solid var(--line)}' +
'.kick{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--orange);margin:0 0 14px}' +
'h1{font-family:"Playfair Display",serif;font-weight:700;font-size:clamp(30px,5vw,46px);line-height:1.1;margin:0 0 16px}' +
'.lede{font-size:17px;color:#c3ccd9;max-width:700px;margin:0}.upd{font-size:12px;color:var(--dim);margin-top:18px;letter-spacing:.03em}' +
'.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:46px 0}' +
'@media(max-width:720px){.grid{grid-template-columns:1fr}}' +
'.stat{border:1px solid var(--line);border-radius:14px;padding:24px}' +
'.stat-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);font-weight:700;margin-bottom:10px}' +
'.stat-val{font-family:"Playfair Display",serif;font-size:34px;font-weight:700;font-variant-numeric:tabular-nums}' +
'.stat-sub{font-size:13px;color:var(--dim);margin-top:8px}' +
'.d{font-weight:700}.d.up{color:var(--up)}.d.down{color:var(--down)}.d.flat{color:var(--dim)}' +
'section{padding:10px 0 50px;border-top:1px solid var(--line)}' +
'h2{font-family:"Playfair Display",serif;font-size:25px;font-weight:700;margin:34px 0 10px}' +
'p.body{color:#c3ccd9;font-size:16px;max-width:760px}' +
'.links a{color:var(--orange-bright);text-decoration:none;font-weight:600;border-bottom:1px solid var(--line);margin-right:22px}' +
'.cta{background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;display:inline-block;margin-top:18px;font-size:14px}' +
'.method{color:var(--dim);font-size:13px;max-width:760px;margin-top:30px}' +
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
':root{--dark:#0a0d12;--soft:#0d111a;--navy:#1a1f2e;--orange:#C2410C;--orange-bright:#e85d2a;--ivory:#e8e3d8;--dim:#8893a6;--line:rgba(194,65,12,.16)}' +
'*{box-sizing:border-box}body{margin:0;background:var(--dark);color:var(--ivory);font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6}' +
'.wrap{max-width:1040px;margin:0 auto;padding:0 24px}' +
'header.cm{border-bottom:1px solid var(--line);background:rgba(10,13,18,.9)}' +
'header.cm .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}' +
'.wm{font-family:"Playfair Display",serif;font-style:italic;font-size:21px;color:var(--ivory);text-decoration:none}.wm b{color:var(--orange);font-style:normal;font-weight:700}' +
'.nav a{color:var(--dim);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-left:22px}.nav a:hover{color:var(--orange-bright)}' +
'.hero{padding:60px 0 30px;border-bottom:1px solid var(--line)}' +
'.kick{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--orange);margin:0 0 14px}' +
'h1{font-family:"Playfair Display",serif;font-weight:700;font-size:clamp(30px,5vw,46px);line-height:1.1;margin:0 0 16px}' +
'.lede{font-size:17px;color:#c3ccd9;max-width:680px;margin:0}' +
'.upd{font-size:12px;color:var(--dim);margin-top:18px;letter-spacing:.03em}' +
'section{padding:46px 0;border-bottom:1px solid var(--line)}' +
'h2{font-family:"Playfair Display",serif;font-size:27px;font-weight:700;margin:0 0 6px}' +
'.sub{color:var(--dim);font-size:14px;margin:0 0 22px;max-width:680px}' +
'table{width:100%;border-collapse:collapse;font-size:15px}' +
'th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);font-weight:700;padding:0 14px 10px;border-bottom:1px solid var(--line)}' +
'th.num,td.num{text-align:right}td{padding:13px 14px;border-bottom:1px solid rgba(136,147,166,.12);vertical-align:top}' +
'td.rank{color:var(--orange);font-weight:700;width:38px}td.num{font-variant-numeric:tabular-nums;font-weight:600}td.dim{color:var(--dim);font-weight:500}' +
'td a{color:var(--ivory);text-decoration:none;font-weight:600;border-bottom:1px solid var(--line)}td a:hover{color:var(--orange-bright)}' +
'.hood{display:block;color:var(--dim);font-size:12px;font-weight:500;margin-top:2px}' +
'.method{padding:40px 0 70px}.method p{color:var(--dim);font-size:13.5px;max-width:760px}' +
'.cta{background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;display:inline-block;margin-top:8px;font-size:14px}' +
'a.bld{color:var(--orange-bright)}' +
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

  /* GALLERY */
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
      '<h4>Sign in to see the <em style="color:var(--cm-peri);">full dossier</em></h4>' +
      '<p>' + enhancedCtaCopy + '</p>' +
      '<a class="btn-primary" href="#signup" data-cm-auth="signup">Unlock enhanced data \u2192</a></div>' +
      '<div class="cm-inline-cta" style="margin-top:32px;text-align:center;">' +
      '<a href="#offer" data-cm-offer-trigger data-building-slug="' + slug + '" class="cm-inline-cta-link" style="display:inline-flex;align-items:center;gap:8px;color:var(--cm-bronze, #d4a574);font-family:var(--cm-ff-mono, \'JetBrains Mono\', monospace);font-size:12px;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;padding:10px 20px;border:1px solid rgba(212, 165, 116, 0.4);border-radius:999px;transition:all 150ms ease;">See a number worth acting on? Make an offer \u2192</a></div>' +
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
    '<div style="margin-top:32px;text-align:center;padding-top:28px;border-top:1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));">' +
    '<p style="color:var(--cm-ivory-dim, rgba(232, 227, 216, 0.64));font-size:14px;margin-bottom:14px;">Numbers add up?</p>' +
    '<a href="#offer" id="mortgage-offer-cta" data-cm-offer-trigger data-building-slug="' + slug + '" data-suggested-price="' + defPrice + '" style="display:inline-flex;align-items:center;gap:8px;background:var(--cm-bronze, #d4a574);color:var(--cm-navy, #1a1f2e);padding:13px 26px;border-radius:999px;font-family:inherit;font-size:14px;font-weight:500;text-decoration:none;transition:transform 150ms ease;">Make this offer \u00b7 <span id="mortgage-offer-amt">$' + defPriceFmt + '</span> \u2192</a></div>' +
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
    '<a class="btn-ghost" href="/owner-signup/?address=' + encodeURIComponent(p.address || '') + '">Set your price \u2192</a></div></div>' +
    '<p style="margin-top:24px;font-size:13px;color:var(--cm-ivory-dim);">All offers require a free account. <a href="#signin" data-cm-auth="login" style="color:var(--cm-peri);">Already have one? Sign in.</a></p>' +
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
    jsonLd + '\n' +
    '<style>' + CSS + '</style>\n' +
    '<style>' + EXTRA_CSS + '</style>\n' +
    '</head>\n<body>\n\n' +
    '<header class="masthead"><div class="wrap"><div class="masthead-row">' +
    '<a href="/" class="wordmark">Condo <em>Market</em> \u00b7 ' + mkTag + '</a>' +
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
    marketSection +
    compareSection +
    mortgageSection +
    offerSection +
    '</main>\n\n' +
    '<footer><div class="wrap"><div class="footer-grid">' +
    '<div><div class="wordmark" style="margin-bottom:14px;">Condo <em>Market</em> \u00b7 ' + mkTag + '</div>' +
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
    '<script type="module" src="/assets/cm-market.js"></script>\n' +
    '<script type="module" src="/assets/offer.js"></script>\n' +
    '</body>\n</html>';
}

/* additive styles */
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
  .masthead { padding: 22px 0; border-bottom: 1px solid var(--cm-rule); }
  .masthead-row { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .wordmark { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 22px; color: var(--cm-ivory); text-decoration: none; }
  .wordmark em { color: var(--cm-peri); }
  .nav-meta { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cm-ivory-dim); display: flex; gap: 22px; align-items: center; }
  .nav-meta a { color: var(--cm-ivory-dim); text-decoration: none; transition: color 0.15s; }
  .nav-meta a:hover { color: var(--cm-ivory); }
  .signin-btn { color: var(--cm-ivory) !important; border: 1px solid var(--cm-rule); padding: 7px 14px; border-radius: 999px; }
  .signin-btn:hover { border-color: var(--cm-peri); color: var(--cm-peri) !important; }
  .crumb { padding: 18px 0 0; font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cm-ivory-dim); }
  .crumb a { color: var(--cm-ivory-dim); }
  .crumb a:hover { color: var(--cm-peri); }
  .crumb span.sep { margin: 0 10px; }
  .hero { padding: 32px 0 56px; }
  .hero-head { display: grid; grid-template-columns: 1fr; gap: 36px; }
  @media (min-width: 900px) { .hero-head { grid-template-columns: 1.2fr 1fr; align-items: end; } }
  .hero-kicker { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--cm-peri); margin-bottom: 18px; }
  .hero h1 { font-family: var(--ff-display); font-weight: 500; font-size: clamp(44px, 6vw, 78px); line-height: 1.02; letter-spacing: -0.02em; color: var(--cm-ivory); margin-bottom: 12px; }
  .hero h1 em { font-style: italic; color: var(--cm-peri); }
  .hero-addr { font-family: var(--ff-body); font-size: 17px; color: var(--cm-ivory-dim); margin-bottom: 32px; }
  .hero-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 20px; border-top: 1px solid var(--cm-rule); border-bottom: 1px solid var(--cm-rule); padding: 24px 0; }
  .hstat-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--cm-ivory-dim); margin-bottom: 6px; }
  .hstat-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 28px; color: var(--cm-ivory); line-height: 1; }
  .hstat-val .peri { color: var(--cm-peri); }
  .hero-img-wrap { position: relative; border-radius: 12px; overflow: hidden; background: var(--cm-navy); min-height: 340px; aspect-ratio: 4/5; }
  .hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero-badge { position: absolute; top: 16px; left: 16px; background: rgba(26,31,46,0.85); color: var(--cm-peri); padding: 6px 12px; border-radius: 4px; font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; backdrop-filter: blur(8px); }
  .sticky-nav { position: sticky; top: 0; z-index: 50; background: var(--cm-navy-deep); border-top: 1px solid var(--cm-rule); border-bottom: 1px solid var(--cm-rule); }
  .sticky-nav-row { display: flex; gap: 28px; overflow-x: auto; padding: 14px 0; scrollbar-width: none; }
  .sticky-nav-row::-webkit-scrollbar { display: none; }
  .sticky-nav-row a { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--cm-ivory-dim); white-space: nowrap; padding-bottom: 4px; border-bottom: 1px solid transparent; transition: all 0.15s; }
  .sticky-nav-row a:hover { color: var(--cm-peri); border-bottom-color: var(--cm-peri); }
  .section { padding: 64px 0; border-bottom: 1px solid var(--cm-rule); }
  .section:last-child { border-bottom: none; }
  .section-head { margin-bottom: 32px; }
  .section-kicker { font-family: var(--ff-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--cm-peri); margin-bottom: 14px; }
  .section-title { font-family: var(--ff-display); font-weight: 500; font-size: clamp(32px, 4vw, 48px); line-height: 1.1; letter-spacing: -0.015em; margin-bottom: 12px; color: var(--cm-ivory); }
  .section-title em { font-style: italic; color: var(--cm-peri); }
  .section-sub { font-size: 17px; color: var(--cm-ivory-dim); max-width: 56ch; }
  .gallery { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-top: 36px; }
  .gallery-item { border-radius: 10px; overflow: hidden; background: var(--cm-navy); aspect-ratio: 1; }
  .gallery-item.main { grid-row: span 2; aspect-ratio: 1/1.05; }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s; }
  .gallery-item:hover img { transform: scale(1.03); }
  @media (max-width: 720px) { .gallery { grid-template-columns: 1fr 1fr; } .gallery-item.main { grid-column: span 2; grid-row: span 1; aspect-ratio: 16/10; } }
  .prose { max-width: 68ch; color: var(--cm-ivory); font-size: 17px; line-height: 1.75; }
  .prose p { margin-bottom: 20px; }
  .prose ul { padding-left: 20px; margin-bottom: 20px; }
  .prose li { margin-bottom: 10px; color: var(--cm-ivory); }
  .prose strong { color: var(--cm-ivory); font-weight: 500; }
  .fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 24px; margin-top: 12px; }
  .fact { border-left: 2px solid var(--cm-peri); padding: 4px 0 4px 18px; }
  .fact-label { font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--cm-ivory-dim); margin-bottom: 8px; }
  .fact-val { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; color: var(--cm-ivory); }
  .amenity-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
  .amenity-chip { background: rgba(159,180,216,0.08); border: 1px solid var(--cm-rule); color: var(--cm-ivory); padding: 8px 16px; border-radius: 999px; font-size: 13px; }
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
  .unit-map-cta { margin: 48px 0 0; padding: 28px 32px; background: rgba(159,180,216,0.06); border: 1px solid var(--cm-peri); border-radius: 12px; display: flex; align-items: center; gap: 28px; flex-wrap: wrap; justify-content: space-between; }
  .unit-map-cta h3 { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 22px; color: var(--cm-ivory); margin-bottom: 6px; }
  .unit-map-cta p { color: var(--cm-ivory-dim); font-size: 14px; max-width: 44ch; margin: 0; }
  .nb-grid { display: grid; grid-template-columns: 1fr; gap: 0; margin-top: 28px; border-top: 1px solid var(--cm-rule); }
  .nb-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr auto; gap: 20px; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--cm-rule); transition: background 0.15s; }
  .nb-row:hover { background: rgba(159,180,216,0.03); padding-left: 12px; padding-right: 12px; }
  .nb-row::after { content: '→'; color: var(--cm-peri); font-size: 16px; opacity: 0; transition: all 0.15s; }
  .nb-row:hover::after { opacity: 1; transform: translateX(4px); }
  .nb-name { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 20px; color: var(--cm-ivory); }
  .nb-psf { font-family: var(--ff-display); font-weight: 500; font-size: 20px; color: var(--cm-peri); }
  .nb-psf .nb-unit { color: var(--cm-ivory-dim); font-size: 13px; margin-left: 2px; }
  .nb-units { font-family: var(--ff-mono); font-size: 12px; color: var(--cm-ivory-dim); letter-spacing: 0.04em; }
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
  .offer-panel { background: var(--cm-navy); border: 1px solid var(--cm-peri); border-radius: 12px; padding: 36px; display: grid; grid-template-columns: 1fr; gap: 28px; margin-top: 36px; }
  @media (min-width: 780px) { .offer-panel { grid-template-columns: 1fr 1fr; } }
  .offer-option h3 { font-family: var(--ff-display); font-style: italic; font-weight: 500; font-size: 24px; color: var(--cm-ivory); margin-bottom: 12px; }
  .offer-option p { color: var(--cm-ivory-dim); margin-bottom: 20px; font-size: 15px; }
  .video-wrap { aspect-ratio: 16/9; border-radius: 10px; overflow: hidden; background: var(--cm-navy); }
  .video-wrap iframe { width: 100%; height: 100%; border: none; }
  .btn-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--cm-peri); color: var(--cm-navy); padding: 13px 28px; border-radius: 999px; font-weight: 500; font-size: 14px; cursor: pointer; border: none; font-family: inherit; transition: opacity 0.15s; text-decoration: none; }
  .btn-primary:hover { opacity: 0.88; }
  .btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: var(--cm-ivory); padding: 13px 28px; border-radius: 999px; font-weight: 500; font-size: 14px; cursor: pointer; border: 1px solid var(--cm-rule); font-family: inherit; transition: all 0.15s; text-decoration: none; }
  .btn-ghost:hover { border-color: var(--cm-peri); color: var(--cm-peri); }
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
