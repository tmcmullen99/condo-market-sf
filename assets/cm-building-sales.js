/* =============================================================================
 * Condo Market SF — Building Sales Section (cm-building-sales.js)
 * -----------------------------------------------------------------------------
 * Drop-in ES module. Lazy-loaded by cm-auth-nav.js on /building/<slug>/ pages.
 *
 * What it does:
 *   1. Reads slug from URL: /building/<slug>/
 *   2. Fetches building meta from /assets/buildings.json + sales rows from Supabase
 *   3. Auto-injects a "Sales & pricing" section before the page footer
 *   4. Renders public layer for anonymous visitors (stats + bar chart + sign-in CTA)
 *   5. Renders enhanced layer for signed-in users (full table + trend chart + YoY)
 *   6. Listens for `cm-auth-change` to swap views without reload
 *
 * Citywide benchmarks (refresh quarterly via the same SQL used in HOA pitch deck).
 * ========================================================================== */

import { CM, sb } from '/assets/cm-supabase.js';
import { openAuthModal } from '/assets/cm-auth.js';

// ─── Bootstrap: only run on building pages ─────────────────────────────────
const slugMatch = window.location.pathname.match(/^\/building\/([^/]+)\/?$/);
if (!slugMatch) {
  // Not a building page — abort silently.
  // (cm-auth-nav.js bootstraps this only when it matches, but double-check.)
} else {
  init(slugMatch[1]).catch(err => {
    console.warn('[cm-building-sales] init failed:', err);
  });
}

// ─── Constants ─────────────────────────────────────────────────────────────
const CITYWIDE = { median_psf: 1295, median_price: 1385000 };
const ENHANCED_PAGE_SIZE = 50;

// ─── Module-scoped state ───────────────────────────────────────────────────
let SLUG = null;
let buildingMeta = null;
let salesAll = [];
let salesInWindow = [];
let isAuthed = false;
let chartCadence = null;
let chartTrend = null;
let displayLimit = ENHANCED_PAGE_SIZE;
let unitFilter = '';

// ─── Helpers ───────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtMoney = (n) => n ? '$' + Number(n).toLocaleString('en-US') : '—';
const fmtMoneyM = (n) => n ? '$' + (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M' : '—';
const fmtMoneyShort = (n) => {
  if (!n) return '—';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  return '$' + Math.round(n / 1000) + 'K';
};
const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtYearMonth = (s) => {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
const median = (arr) => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};

// ─── Styles (injected once on init) ────────────────────────────────────────
const CSS = `
.cm-sales {
  --cm-navy: #1a1f2e; --cm-navy-deep: #0f131d; --cm-peri: #9fb4d8;
  --cm-bronze: #d4a574; --cm-ivory: #e8e3d8; --cm-ivory-dim: rgba(232, 227, 216, 0.64);
  --cm-ivory-faint: rgba(232, 227, 216, 0.36); --cm-rule: rgba(232, 227, 216, 0.14);
  --cm-rule-soft: rgba(232, 227, 216, 0.07);
  --cm-gain: #8fb97a; --cm-loss: #c97865;
  font-family: 'DM Sans', -apple-system, sans-serif; font-weight: 300;
  color: var(--cm-ivory); padding: 80px 0 40px; max-width: 1080px;
  margin: 0 auto;
}
.cm-sales-head { padding: 0 clamp(20px, 4vw, 56px); margin-bottom: 40px; border-top: 1px solid var(--cm-rule); padding-top: 64px; }
.cm-sales-kicker { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--cm-bronze); margin-bottom: 14px; }
.cm-sales-title { font-family: 'Playfair Display', Georgia, serif; font-weight: 500; font-size: clamp(34px, 4.5vw, 48px); line-height: 1.1; letter-spacing: -0.015em; color: var(--cm-ivory); }
.cm-sales-title em { font-style: italic; color: var(--cm-peri); }
.cm-sales-lede { font-size: 16px; line-height: 1.6; color: var(--cm-ivory-dim); max-width: 56ch; margin-top: 18px; }
.cm-sales-body { padding: 0 clamp(20px, 4vw, 56px); }
.cm-sales-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
.cm-sales-stat { background: rgba(159,180,216,0.04); border: 1px solid var(--cm-rule); border-radius: 10px; padding: 24px 22px; }
.cm-sales-stat .lbl { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--cm-ivory-dim); margin-bottom: 12px; }
.cm-sales-stat .val { font-family: 'Playfair Display', Georgia, serif; font-weight: 500; font-style: italic; font-size: 36px; line-height: 1; color: var(--cm-peri); }
.cm-sales-stat .meta { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color: var(--cm-ivory-dim); margin-top: 8px; }
.cm-sales-citywide { padding: 16px 22px; background: rgba(212, 165, 116, 0.06); border-left: 2px solid var(--cm-bronze); border-radius: 4px; font-size: 14px; color: var(--cm-ivory); margin-bottom: 28px; line-height: 1.55; }
.cm-sales-citywide em { font-family: 'Playfair Display', Georgia, serif; font-style: italic; color: var(--cm-bronze); }
.cm-sales-chart { background: rgba(159,180,216,0.04); border: 1px solid var(--cm-rule); border-radius: 12px; padding: 28px 24px; margin-bottom: 28px; }
.cm-sales-chart-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.cm-sales-chart-title { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--cm-ivory-dim); }
.cm-sales-chart-meta { font-size: 12px; color: var(--cm-ivory-faint); font-family: 'JetBrains Mono', ui-monospace, monospace; }
.cm-sales-chart canvas { display: block; height: 240px !important; max-height: 240px; }

/* Public CTA — sign-in prompt */
.cm-sales-cta {
  margin-top: 32px; padding: 36px 32px; text-align: center;
  background: linear-gradient(180deg, rgba(159,180,216,0.06) 0%, rgba(212,165,116,0.04) 100%);
  border: 1px solid var(--cm-rule); border-radius: 12px;
}
.cm-sales-cta h3 { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 500; font-size: 26px; line-height: 1.2; color: var(--cm-ivory); margin-bottom: 10px; }
.cm-sales-cta h3 em { color: var(--cm-peri); }
.cm-sales-cta p { font-size: 15px; color: var(--cm-ivory-dim); max-width: 56ch; margin: 0 auto 22px; }
.cm-sales-cta button {
  background: var(--cm-peri); color: var(--cm-navy); border: none;
  padding: 14px 28px; border-radius: 999px; font-weight: 500; font-size: 14px;
  letter-spacing: 0.02em; cursor: pointer; font-family: inherit;
}
.cm-sales-cta button:hover { opacity: 0.88; }

/* Enhanced — YoY strip */
.cm-sales-yoy { display: flex; gap: 4px; flex-wrap: wrap; padding: 18px 22px; background: rgba(159,180,216,0.04); border: 1px solid var(--cm-rule); border-radius: 10px; margin-bottom: 28px; align-items: stretch; }
.cm-yoy-cell { flex: 1 1 90px; min-width: 90px; padding: 6px 8px; }
.cm-yoy-cell .yr { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 10px; letter-spacing: 0.12em; color: var(--cm-ivory-dim); }
.cm-yoy-cell .v { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 14px; color: var(--cm-ivory); margin-top: 2px; }
.cm-yoy-cell .v .delta { font-size: 11px; margin-left: 6px; color: var(--cm-ivory-faint); }
.cm-yoy-cell .v .delta.up { color: var(--cm-gain); }
.cm-yoy-cell .v .delta.down { color: var(--cm-loss); }

/* Enhanced — table */
.cm-sales-table-frame { background: rgba(159,180,216,0.03); border: 1px solid var(--cm-rule); border-radius: 12px; overflow: hidden; }
.cm-sales-table-head { padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; border-bottom: 1px solid var(--cm-rule); }
.cm-sales-table-head h4 { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 500; font-size: 22px; color: var(--cm-ivory); }
.cm-sales-table-head input {
  background: var(--cm-navy); color: var(--cm-ivory); border: 1px solid var(--cm-rule);
  padding: 8px 12px; border-radius: 6px; font-family: inherit; font-size: 13px; font-weight: 300; min-width: 160px;
}
.cm-sales-table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12.5px; }
.cm-sales-table thead th { text-align: left; padding: 12px 16px; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--cm-ivory-dim); font-weight: 500; background: rgba(159,180,216,0.02); }
.cm-sales-table thead th.num { text-align: right; }
.cm-sales-table tbody td { padding: 13px 16px; border-bottom: 1px solid var(--cm-rule-soft); color: var(--cm-ivory); }
.cm-sales-table tbody tr:last-child td { border-bottom: none; }
.cm-sales-table .col-unit { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 15px; color: var(--cm-ivory); }
.cm-sales-table .col-num { text-align: right; }
.cm-sales-table .col-num.psf { color: var(--cm-peri); }
.cm-sales-table .col-date { color: var(--cm-ivory-dim); }
.cm-sales-table .empty td { text-align: center; padding: 60px; color: var(--cm-ivory-dim); font-style: italic; }
.cm-sales-loadmore { padding: 16px; text-align: center; border-top: 1px solid var(--cm-rule); }
.cm-sales-loadmore button {
  background: transparent; color: var(--cm-peri); border: 1px solid var(--cm-rule);
  padding: 10px 24px; border-radius: 999px; cursor: pointer; font-family: inherit;
  font-size: 13px; transition: border-color 0.18s;
}
.cm-sales-loadmore button:hover { border-color: var(--cm-peri); }

@media (max-width: 720px) {
  .cm-sales { padding: 60px 0 24px; }
  .cm-sales-head { padding-top: 48px; }
  .cm-sales-stats { gap: 12px; }
  .cm-sales-stat { padding: 18px 18px; }
  .cm-sales-stat .val { font-size: 28px; }
  .cm-sales-table { font-size: 11.5px; }
  .cm-sales-table thead th, .cm-sales-table tbody td { padding: 10px 12px; }
}
`;

// ─── Init ──────────────────────────────────────────────────────────────────
async function init(slug) {
  SLUG = slug;

  // Inject styles once
  if (!document.getElementById('cm-sales-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'cm-sales-styles';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  // Wait for DOM ready, then mount
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  const mount = findOrCreateMount();
  mount.innerHTML = '';

  // Fetch data (parallel)
  try {
    const [bldgs, salesRes] = await Promise.all([
      fetch('/assets/buildings.json', { cache: 'no-cache' }).then(r => r.json()),
      sb.from('building_sales')
        .select('unit_address,unit_label,sale_date,sale_price,sqft,beds')
        .eq('building_slug', slug)
        .order('sale_date', { ascending: false, nullsFirst: false })
        .limit(2000),
    ]);
    if (salesRes.error) throw salesRes.error;
    buildingMeta = bldgs.find(b => slug === (b.href || '').replace(/^\/building\//, '').replace(/\/$/, ''));
    salesAll = salesRes.data || [];
  } catch (err) {
    console.warn('[cm-building-sales] data fetch failed:', err);
    return;
  }

  if (!salesAll.length) {
    // No sales on file for this building — render nothing rather than empty state
    return;
  }

  // Pre-compute the 10-yr window slice (used in both views)
  salesInWindow = salesAll.filter(s =>
    s.sale_date && s.sale_date >= '2016-01-01' && s.sale_date <= '2025-12-31' &&
    s.sale_price && s.sale_price >= 100000 && s.sale_price <= 30000000
  );

  // Initial auth check
  const session = await CM.getSession().catch(() => null);
  isAuthed = !!session?.user;

  await loadChartJs();
  render();

  // Re-render when auth state changes
  window.addEventListener('cm-auth-change', async () => {
    const s = await CM.getSession().catch(() => null);
    const newAuthed = !!s?.user;
    if (newAuthed !== isAuthed) {
      isAuthed = newAuthed;
      displayLimit = ENHANCED_PAGE_SIZE; // reset pagination
      unitFilter = '';
      render();
    }
  });
}

// ─── Mount-point detection ─────────────────────────────────────────────────
function findOrCreateMount() {
  // Allow explicit override if anyone added one to a page later
  let el = document.getElementById('cm-sales-section');
  if (el) { el.classList.add('cm-sales'); return el; }

  // Inject into <main> just before <footer>; fall back to body
  const main = document.querySelector('main');
  const footer = document.querySelector('footer');
  el = document.createElement('section');
  el.id = 'cm-sales-section';
  el.className = 'cm-sales';

  if (footer && footer.parentElement) {
    footer.parentElement.insertBefore(el, footer);
  } else if (main) {
    main.appendChild(el);
  } else {
    document.body.appendChild(el);
  }
  return el;
}

// ─── Chart.js loader ───────────────────────────────────────────────────────
async function loadChartJs() {
  if (window.Chart) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Chart.js load failed'));
    document.head.appendChild(s);
  });
}

// ─── Render dispatcher ─────────────────────────────────────────────────────
function render() {
  const mount = document.getElementById('cm-sales-section');
  if (!mount) return;

  // Tear down any existing charts before re-render
  if (chartCadence) { chartCadence.destroy(); chartCadence = null; }
  if (chartTrend) { chartTrend.destroy(); chartTrend = null; }

  const stats = computeStats();
  if (isAuthed) {
    mount.innerHTML = renderHead() + renderEnhanced(stats);
    drawCadenceChart('cm-cadence-chart', stats.yearCounts);
    if (stats.yearMedianPsf && Object.keys(stats.yearMedianPsf).length >= 3) {
      drawTrendChart('cm-trend-chart', stats.yearMedianPsf);
    }
    wireEnhancedHandlers();
  } else {
    mount.innerHTML = renderHead() + renderPublic(stats);
    drawCadenceChart('cm-cadence-chart', stats.yearCounts);
    wirePublicHandlers();
  }
}

// ─── Stats computation ─────────────────────────────────────────────────────
function computeStats() {
  const recentSale = salesInWindow.find(s => s.sale_date && s.sale_price);
  const psfArr = salesInWindow
    .filter(s => s.sqft && s.sqft > 0)
    .map(s => s.sale_price / s.sqft)
    .filter(v => v >= 400 && v <= 5000);
  const medianPsf = median(psfArr);
  const psfDelta = medianPsf ? Math.round(((medianPsf - CITYWIDE.median_psf) / CITYWIDE.median_psf) * 100) : 0;

  // Bar chart data: sales per year 2016-2025
  const yearCounts = {};
  for (let y = 2016; y <= 2025; y++) yearCounts[y] = 0;
  salesInWindow.forEach(s => {
    const y = parseInt(s.sale_date.slice(0, 4), 10);
    if (yearCounts[y] !== undefined) yearCounts[y]++;
  });

  // Year-by-year median $/sf for trend chart
  const yearPsfMap = {};
  salesInWindow.forEach(s => {
    if (!s.sqft || s.sqft <= 0) return;
    const psf = s.sale_price / s.sqft;
    if (psf < 400 || psf > 5000) return;
    const y = parseInt(s.sale_date.slice(0, 4), 10);
    (yearPsfMap[y] = yearPsfMap[y] || []).push(psf);
  });
  const yearMedianPsf = {};
  Object.keys(yearPsfMap).forEach(y => { yearMedianPsf[y] = Math.round(median(yearPsfMap[y])); });

  return {
    totalUnits: salesAll.length,
    salesCount: salesInWindow.length,
    recentSale,
    medianPsf,
    psfDelta,
    yearCounts,
    yearMedianPsf,
    medianSalePrice: median(salesInWindow.map(s => s.sale_price).filter(Boolean)),
    tenureMedianYears: buildingMeta?.tenure_median_years,
  };
}

// ─── Renderers ─────────────────────────────────────────────────────────────
function renderHead() {
  return `
    <div class="cm-sales-head">
      <div class="cm-sales-kicker">Sales & Pricing</div>
      <h2 class="cm-sales-title">A decade of <em>transactions</em>.</h2>
      <p class="cm-sales-lede">Closed sales drawn from public records and MLS, 2016–2025. Filtered to remove bulk transfers and outliers.</p>
    </div>
  `;
}

function renderPublic(s) {
  let citywidePhrase;
  if (s.psfDelta >= 5) citywidePhrase = `<em>${Math.abs(s.psfDelta)}% above</em> the citywide median of $${CITYWIDE.median_psf.toLocaleString()}/sf`;
  else if (s.psfDelta <= -5) citywidePhrase = `<em>${Math.abs(s.psfDelta)}% below</em> the citywide median of $${CITYWIDE.median_psf.toLocaleString()}/sf`;
  else citywidePhrase = `<em>in line with</em> the citywide median of $${CITYWIDE.median_psf.toLocaleString()}/sf`;

  return `
    <div class="cm-sales-body">
      <div class="cm-sales-stats">
        <div class="cm-sales-stat">
          <div class="lbl">Most recent sale</div>
          <div class="val">${s.recentSale ? fmtMoneyShort(s.recentSale.sale_price) : '—'}</div>
          <div class="meta">${s.recentSale ? fmtDate(s.recentSale.sale_date) : '—'}</div>
        </div>
        <div class="cm-sales-stat">
          <div class="lbl">Median $/sf</div>
          <div class="val">${s.medianPsf ? '$' + Math.round(s.medianPsf).toLocaleString() : '—'}</div>
          <div class="meta">10-year window</div>
        </div>
        <div class="cm-sales-stat">
          <div class="lbl">Sales · 10y</div>
          <div class="val">${s.salesCount}</div>
          <div class="meta">${s.totalUnits} units tracked</div>
        </div>
      </div>
      ${s.medianPsf ? `<div class="cm-sales-citywide">${esc(buildingMeta?.name || 'This building')} sits ${citywidePhrase}.</div>` : ''}
      <div class="cm-sales-chart">
        <div class="cm-sales-chart-head">
          <div class="cm-sales-chart-title">Sales by year</div>
          <div class="cm-sales-chart-meta">2016–2025</div>
        </div>
        <canvas id="cm-cadence-chart"></canvas>
      </div>
      <div class="cm-sales-cta">
        <h3>See <em>all ${s.salesCount}</em> transactions</h3>
        <p>Sign in to unlock the full sale-by-sale history — unit numbers, dates, prices, $/sf, year-over-year price trend, and owner tenure.</p>
        <button type="button" class="cm-sales-cta-btn">Sign in for free</button>
      </div>
    </div>
  `;
}

function renderEnhanced(s) {
  // YoY strip — last 5 years where we have data
  const years = Object.keys(s.yearMedianPsf).map(Number).sort((a, b) => b - a);
  let yoyHtml = '';
  if (years.length >= 2) {
    const recent = years.slice(0, 5).reverse(); // ascending so the deltas read forward
    yoyHtml = `<div class="cm-sales-yoy">${recent.map((y, i) => {
      const v = s.yearMedianPsf[y];
      let deltaHtml = '';
      if (i > 0) {
        const prev = s.yearMedianPsf[recent[i-1]];
        if (prev) {
          const pct = Math.round(((v - prev) / prev) * 100);
          if (pct !== 0) {
            const cls = pct > 0 ? 'up' : 'down';
            deltaHtml = `<span class="delta ${cls}">${pct > 0 ? '+' : ''}${pct}%</span>`;
          }
        }
      }
      return `<div class="cm-yoy-cell"><div class="yr">${y}</div><div class="v">$${v.toLocaleString()}/sf${deltaHtml}</div></div>`;
    }).join('')}</div>`;
  }

  // Trend chart only if we have 3+ years
  const trendChartHtml = years.length >= 3 ? `
    <div class="cm-sales-chart">
      <div class="cm-sales-chart-head">
        <div class="cm-sales-chart-title">Median $/sf trend</div>
        <div class="cm-sales-chart-meta">By year of sale</div>
      </div>
      <canvas id="cm-trend-chart"></canvas>
    </div>
  ` : '';

  // Filtered + paginated sales list
  const filtered = salesAll.filter(row => {
    if (!unitFilter) return true;
    const u = (row.unit_label || row.unit_address || '').toLowerCase();
    return u.includes(unitFilter.toLowerCase());
  });
  const visible = filtered.slice(0, displayLimit);
  const hasMore = filtered.length > visible.length;

  const tenureCard = s.tenureMedianYears ? `
    <div class="cm-sales-stat">
      <div class="lbl">Owner tenure median</div>
      <div class="val">${s.tenureMedianYears}<span style="font-size: 22px;"> yrs</span></div>
      <div class="meta">Time since last purchase</div>
    </div>` : '';

  let citywidePhrase;
  if (s.psfDelta >= 5) citywidePhrase = `<em>${Math.abs(s.psfDelta)}% above</em> the citywide median of $${CITYWIDE.median_psf.toLocaleString()}/sf`;
  else if (s.psfDelta <= -5) citywidePhrase = `<em>${Math.abs(s.psfDelta)}% below</em> the citywide median of $${CITYWIDE.median_psf.toLocaleString()}/sf`;
  else citywidePhrase = `<em>in line with</em> the citywide median of $${CITYWIDE.median_psf.toLocaleString()}/sf`;

  return `
    <div class="cm-sales-body">
      <div class="cm-sales-stats">
        <div class="cm-sales-stat">
          <div class="lbl">Median sale price</div>
          <div class="val">${fmtMoneyM(s.medianSalePrice)}</div>
          <div class="meta">10-year window · ${s.salesCount} sales</div>
        </div>
        <div class="cm-sales-stat">
          <div class="lbl">Median $/sf</div>
          <div class="val">${s.medianPsf ? '$' + Math.round(s.medianPsf).toLocaleString() : '—'}</div>
          <div class="meta">With sqft data</div>
        </div>
        <div class="cm-sales-stat">
          <div class="lbl">Most recent sale</div>
          <div class="val">${s.recentSale ? fmtMoneyShort(s.recentSale.sale_price) : '—'}</div>
          <div class="meta">${s.recentSale ? fmtDate(s.recentSale.sale_date) : '—'}</div>
        </div>
        ${tenureCard}
      </div>
      ${s.medianPsf ? `<div class="cm-sales-citywide">${esc(buildingMeta?.name || 'This building')} sits ${citywidePhrase}.</div>` : ''}
      <div class="cm-sales-chart">
        <div class="cm-sales-chart-head">
          <div class="cm-sales-chart-title">Sales by year</div>
          <div class="cm-sales-chart-meta">2016–2025</div>
        </div>
        <canvas id="cm-cadence-chart"></canvas>
      </div>
      ${yoyHtml}
      ${trendChartHtml}
      <div class="cm-sales-table-frame">
        <div class="cm-sales-table-head">
          <h4>${salesAll.length} closings on file</h4>
          <input type="search" id="cm-unit-filter" placeholder="Filter by unit..." value="${esc(unitFilter)}">
        </div>
        <table class="cm-sales-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Closed</th>
              <th class="num">Price</th>
              <th class="num">$/sf</th>
              <th class="num">Sqft</th>
              <th class="num">Beds</th>
            </tr>
          </thead>
          <tbody>
            ${visible.length === 0
              ? `<tr class="empty"><td colspan="6">No sales match this filter.</td></tr>`
              : visible.map(row => `
                <tr>
                  <td class="col-unit">${esc(row.unit_label || row.unit_address || '—')}</td>
                  <td class="col-date">${fmtDate(row.sale_date)}</td>
                  <td class="col-num">${row.sale_price ? fmtMoney(row.sale_price) : '—'}</td>
                  <td class="col-num psf">${row.sale_price && row.sqft ? '$' + Math.round(row.sale_price / row.sqft).toLocaleString() : '—'}</td>
                  <td class="col-num">${row.sqft ? row.sqft.toLocaleString() : '—'}</td>
                  <td class="col-num">${row.beds ?? '—'}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
        ${hasMore ? `<div class="cm-sales-loadmore"><button data-action="load-more">Load ${Math.min(ENHANCED_PAGE_SIZE, filtered.length - visible.length)} more</button></div>` : ''}
      </div>
    </div>
  `;
}

// ─── Charts ────────────────────────────────────────────────────────────────
function drawCadenceChart(canvasId, yearCounts) {
  const c = document.getElementById(canvasId);
  if (!c || !window.Chart) return;
  chartCadence = new Chart(c.getContext('2d'), {
    type: 'bar',
    data: {
      labels: Object.keys(yearCounts),
      datasets: [{ data: Object.values(yearCounts), backgroundColor: '#9fb4d8', borderRadius: 3, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1f2e', titleColor: '#e8e3d8', bodyColor: '#9fb4d8',
          borderColor: 'rgba(232,227,216,0.14)', borderWidth: 1, padding: 10,
          titleFont: { family: 'JetBrains Mono', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 13 },
          callbacks: { label: (c) => c.parsed.y + ' sales' }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(232,227,216,0.64)', font: { family: 'JetBrains Mono', size: 11 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(232,227,216,0.08)' }, ticks: { color: 'rgba(232,227,216,0.64)', font: { family: 'JetBrains Mono', size: 11 } } }
      }
    }
  });
}

function drawTrendChart(canvasId, yearMedianPsf) {
  const c = document.getElementById(canvasId);
  if (!c || !window.Chart) return;
  const years = Object.keys(yearMedianPsf).map(Number).sort((a, b) => a - b);
  const data = years.map(y => yearMedianPsf[y]);
  chartTrend = new Chart(c.getContext('2d'), {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        data, borderColor: '#d4a574', backgroundColor: 'rgba(212, 165, 116, 0.10)',
        borderWidth: 2, tension: 0.32, pointRadius: 4, pointBackgroundColor: '#d4a574', fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1f2e', titleColor: '#e8e3d8', bodyColor: '#d4a574',
          borderColor: 'rgba(232,227,216,0.14)', borderWidth: 1, padding: 10,
          titleFont: { family: 'JetBrains Mono', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 13 },
          callbacks: { label: (c) => '$' + c.parsed.y.toLocaleString() + '/sf' }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(232,227,216,0.64)', font: { family: 'JetBrains Mono', size: 11 } } },
        y: { grid: { color: 'rgba(232,227,216,0.08)' }, ticks: { color: 'rgba(232,227,216,0.64)', font: { family: 'JetBrains Mono', size: 11 }, callback: (v) => '$' + v } }
      }
    }
  });
}

// ─── Event handlers ────────────────────────────────────────────────────────
function wirePublicHandlers() {
  const ctaBtn = document.querySelector('.cm-sales-cta-btn');
  if (ctaBtn) {
    ctaBtn.addEventListener('click', () => {
      try { openAuthModal('signup'); }
      catch (err) { console.warn('[cm-building-sales] openAuthModal failed:', err); }
    });
  }
}

function wireEnhancedHandlers() {
  const filter = document.getElementById('cm-unit-filter');
  if (filter) {
    filter.addEventListener('input', (e) => {
      unitFilter = e.target.value;
      displayLimit = ENHANCED_PAGE_SIZE; // reset on new filter
      render();
      // Restore focus
      const f2 = document.getElementById('cm-unit-filter');
      if (f2) { f2.focus(); f2.setSelectionRange(unitFilter.length, unitFilter.length); }
    });
  }
  document.querySelectorAll('[data-action="load-more"]').forEach(btn => {
    btn.addEventListener('click', () => {
      displayLimit += ENHANCED_PAGE_SIZE;
      render();
    });
  });
}
