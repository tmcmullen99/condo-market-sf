/**
 * cm-building-intel.js — Per-building intelligence panel
 *
 * Auto-mounts on /building/[slug]/ pages. Inserts a new <section id="intelligence">
 * between the existing #dossier and #compare sections, populated with real data:
 *
 *   1. Position card — this building's median $/sf, sales (36mo), last sale,
 *      with comparators vs citywide / same neighborhood / same decade, and a
 *      rank readout (e.g. "8th of 64 by $/sf").
 *   2. Trajectory — quarterly $/sf line chart for this building, with the
 *      citywide median overlaid for context. Lazily loads Chart.js.
 *   3. Recent activity — 8 most recent sales in this building.
 *
 * Data sources:
 *   - buildings.json (cached) — name/hood/decade/units/year metadata
 *   - homepage_aggregates RPC — citywide stats
 *   - homepage_building_cards RPC — every building's 36mo medians (rank source)
 *   - building_psf_quarterly RPC — this building's quarterly time series
 *   - building_recent_sales RPC — this building's recent sales
 *   - intelligence_psf_quarterly RPC — citywide quarterly overlay
 *
 * Loaded by cm-actions.js via a dynamic import. Renders for both signed-in
 * and signed-out users; no auth required.
 */

const SUPABASE_URL = 'https://kfqphwerygccpzntbbif.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

const STYLE_ID = 'cm-intel-styles';
const STYLE_CSS = `
  .cm-intel-section {
    padding: 64px 0;
    border-bottom: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));
    background: var(--cm-navy-deep, #0f131d);
    position: relative; z-index: 2;
  }
  .cm-intel-wrap {
    max-width: var(--page-max, 1280px);
    margin: 0 auto;
    padding: 0 var(--gutter, clamp(20px, 4vw, 56px));
  }
  .cm-intel-head {
    margin-bottom: 36px;
    display: flex; justify-content: space-between; align-items: end;
    flex-wrap: wrap; gap: 16px;
  }
  .cm-intel-kicker {
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 11px; letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--cm-peri, #9fb4d8); margin-bottom: 14px;
  }
  .cm-intel-title {
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
    font-weight: 500; font-size: clamp(32px, 4vw, 48px);
    line-height: 1.1; letter-spacing: -0.015em;
    color: var(--cm-ivory, #e8e3d8);
  }
  .cm-intel-title em {
    font-style: italic; color: var(--cm-peri, #9fb4d8);
  }
  .cm-intel-sub {
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 11px; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(232, 227, 216, 0.64);
  }
  .cm-intel-grid {
    display: grid; grid-template-columns: 1fr; gap: 24px;
  }
  @media (min-width: 920px) {
    .cm-intel-grid { grid-template-columns: 1fr 1.4fr; }
  }
  .cm-intel-card {
    background: rgba(159, 180, 216, 0.04);
    border: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));
    border-radius: 12px; padding: 28px 30px;
  }
  .cm-intel-card h3 {
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500; font-size: 20px;
    color: var(--cm-ivory, #e8e3d8); margin-bottom: 6px;
  }
  .cm-intel-card .cm-intel-card-sub {
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(232, 227, 216, 0.64);
    margin-bottom: 22px;
  }

  /* Position card */
  .cm-pos-hero {
    display: flex; align-items: baseline; gap: 14px; margin-bottom: 18px;
  }
  .cm-pos-psf {
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: 48px; line-height: 1; color: var(--cm-peri, #9fb4d8);
  }
  .cm-pos-psf-unit {
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 12px; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(232, 227, 216, 0.64);
  }
  .cm-pos-rank {
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 12px; color: var(--cm-ivory, #e8e3d8);
    background: rgba(159, 180, 216, 0.08);
    padding: 6px 12px; border-radius: 999px;
    border: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));
  }
  .cm-pos-compare-row {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 12px 0;
    border-bottom: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 13px;
  }
  .cm-pos-compare-row:last-child { border-bottom: none; }
  .cm-pos-compare-label {
    color: rgba(232, 227, 216, 0.64);
    font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .cm-pos-compare-val {
    color: var(--cm-ivory, #e8e3d8);
  }
  .cm-pos-compare-delta {
    margin-left: 8px; font-size: 11px;
    padding: 2px 8px; border-radius: 999px;
    background: rgba(159, 180, 216, 0.08);
  }
  .cm-pos-compare-delta.up { color: var(--cm-gain, #8fb97a); }
  .cm-pos-compare-delta.dn { color: var(--cm-loss, #c97865); }
  .cm-pos-compare-delta.neutral { color: rgba(232, 227, 216, 0.5); }

  .cm-pos-stats {
    margin-top: 22px; padding-top: 22px;
    border-top: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  }
  .cm-pos-stat-label {
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 10px; letter-spacing: 0.12em;
    text-transform: uppercase; color: rgba(232, 227, 216, 0.64);
    margin-bottom: 6px;
  }
  .cm-pos-stat-val {
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500;
    font-size: 22px; color: var(--cm-ivory, #e8e3d8); line-height: 1.1;
  }

  /* Trajectory card */
  .cm-traj-canvas-wrap {
    position: relative; height: 260px; margin-bottom: 16px;
  }
  .cm-traj-bookends {
    display: flex; justify-content: space-between;
    padding-top: 14px;
    border-top: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 11px; color: rgba(232, 227, 216, 0.64);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .cm-traj-bookend-val {
    color: var(--cm-peri, #9fb4d8); margin-left: 6px;
  }
  .cm-traj-empty {
    text-align: center; padding: 60px 20px;
    color: rgba(232, 227, 216, 0.5);
    font-style: italic;
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
  }
  .cm-traj-legend {
    display: flex; gap: 18px; margin-bottom: 14px; flex-wrap: wrap;
  }
  .cm-traj-legend-item {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 11px; letter-spacing: 0.06em;
    color: rgba(232, 227, 216, 0.7);
  }
  .cm-traj-legend-swatch {
    width: 16px; height: 2px; border-radius: 2px;
  }

  /* Recent activity */
  .cm-recent-list {
    display: grid; grid-template-columns: 1fr; gap: 10px;
  }
  .cm-recent-item {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 16px; align-items: baseline;
    padding: 14px 0;
    border-bottom: 1px solid var(--cm-rule, rgba(232, 227, 216, 0.14));
  }
  .cm-recent-item:last-child { border-bottom: none; }
  .cm-recent-addr {
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
    font-style: italic; font-weight: 500; font-size: 16px;
    color: var(--cm-ivory, #e8e3d8);
  }
  .cm-recent-addr-unit { color: var(--cm-peri, #9fb4d8); margin-left: 4px; }
  .cm-recent-meta {
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    color: rgba(232, 227, 216, 0.64);
    letter-spacing: 0.06em;
    margin-top: 2px;
  }
  .cm-recent-price {
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
    font-weight: 500; font-size: 16px;
    color: var(--cm-peri, #9fb4d8);
  }
  .cm-recent-date {
    font-family: var(--ff-mono, 'JetBrains Mono', monospace);
    font-size: 11px; color: rgba(232, 227, 216, 0.5);
    text-align: right; min-width: 60px;
  }
  .cm-recent-empty {
    text-align: center; padding: 40px 20px;
    color: rgba(232, 227, 216, 0.5);
    font-style: italic;
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
  }

  .cm-intel-loading {
    color: rgba(232, 227, 216, 0.5);
    font-style: italic;
    font-family: var(--ff-display, 'Playfair Display', Georgia, serif);
    text-align: center; padding: 30px 0;
  }
`;

let _buildingsCache = null;
let _chartJsPromise = null;

async function rpc(name, body) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error('rpc ' + name + ' ' + r.status);
  return r.json();
}

async function loadBuildings() {
  if (_buildingsCache) return _buildingsCache;
  try {
    const r = await fetch('/assets/buildings.json', { cache: 'force-cache' });
    if (r.ok) _buildingsCache = await r.json();
  } catch (e) {}
  return _buildingsCache || [];
}

function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (_chartJsPromise) return _chartJsPromise;
  _chartJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = () => reject(new Error('chart.js load failed'));
    document.head.appendChild(s);
  });
  return _chartJsPromise;
}

function getCurrentBuildingSlug() {
  const m = window.location.pathname.match(/\/building\/([^\/]+)/);
  if (!m) return null;
  if (m[1].startsWith('_')) return null; // skip /building/_coming-soon/
  return m[1];
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = STYLE_CSS;
  document.head.appendChild(s);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function fmtMoney(n) { return n != null ? '$' + Math.round(n).toLocaleString() : '—'; }
function fmtMoneyShort(n) {
  if (n == null) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + n;
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return (dt.getMonth() + 1) + '/' + dt.getDate() + '/' + String(dt.getFullYear()).slice(2);
}

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function deltaPill(thisVal, ref) {
  if (thisVal == null || ref == null || ref === 0) {
    return '<span class="cm-pos-compare-delta neutral">—</span>';
  }
  const pct = Math.round(((thisVal - ref) / ref) * 100);
  if (pct === 0) return '<span class="cm-pos-compare-delta neutral">flat</span>';
  const klass = pct > 0 ? 'up' : 'dn';
  const sign = pct > 0 ? '+' : '';
  return '<span class="cm-pos-compare-delta ' + klass + '">' + sign + pct + '%</span>';
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function buildPanelHTML(ctx) {
  const {
    bldg, thisCard, agg, neighborhoodMedian, decadeMedian,
    rankIdx, rankTotal, recentSales, hasTrajectory
  } = ctx;
  const psf = thisCard.median_psf_36mo;
  const sales = thisCard.sales_36mo;
  const lastDate = thisCard.most_recent_sale_date;
  const lastPrice = thisCard.most_recent_sale_price;
  const totalUnits = bldg.units || thisCard.unit_count;

  const recentHTML = recentSales.length === 0
    ? '<div class="cm-recent-empty">No recorded sales in this building yet.</div>'
    : recentSales.map(r => {
        const psfRow = (r.sale_price && r.sqft) ? Math.round(r.sale_price / r.sqft) : null;
        return '<div class="cm-recent-item">' +
          '<div>' +
            '<div class="cm-recent-addr">' + escapeHtml(r.unit_address) +
              (r.unit_label ? '<span class="cm-recent-addr-unit">' + escapeHtml(r.unit_label) + '</span>' : '') +
            '</div>' +
            '<div class="cm-recent-meta">' +
              (r.sqft ? r.sqft.toLocaleString() + ' sf' : '—') +
              (psfRow ? ' · $' + psfRow.toLocaleString() + '/sf' : '') +
              (r.beds ? ' · ' + r.beds + ' bed' : '') +
            '</div>' +
          '</div>' +
          '<div class="cm-recent-price">' + fmtMoneyShort(r.sale_price) + '</div>' +
          '<div class="cm-recent-date">' + fmtDateShort(r.sale_date) + '</div>' +
        '</div>';
      }).join('');

  return `
    <div class="cm-intel-wrap">
      <div class="cm-intel-head">
        <div>
          <div class="cm-intel-kicker">Market intelligence</div>
          <h2 class="cm-intel-title">Where ${escapeHtml(bldg.name)} <em>stands</em></h2>
        </div>
        <span class="cm-intel-sub">Live · last 36 months</span>
      </div>
      <div class="cm-intel-grid">
        <div class="cm-intel-card cm-pos-card">
          <h3>Position</h3>
          <div class="cm-intel-card-sub">$/sf vs the rest of the market</div>
          <div class="cm-pos-hero">
            <div class="cm-pos-psf">${psf != null ? '$' + psf.toLocaleString() : '—'}</div>
            <div class="cm-pos-psf-unit">/sf median</div>
          </div>
          ${rankIdx ? `<div style="margin-bottom:18px;"><span class="cm-pos-rank">${ordinal(rankIdx)} of ${rankTotal} buildings</span></div>` : ''}
          <div>
            <div class="cm-pos-compare-row">
              <span class="cm-pos-compare-label">vs Citywide median</span>
              <span><span class="cm-pos-compare-val">$${(agg.median_psf_36mo || 0).toLocaleString()}</span>${deltaPill(psf, agg.median_psf_36mo)}</span>
            </div>
            ${neighborhoodMedian != null ? `
            <div class="cm-pos-compare-row">
              <span class="cm-pos-compare-label">vs ${escapeHtml(bldg.hood || 'neighborhood')} median</span>
              <span><span class="cm-pos-compare-val">$${Math.round(neighborhoodMedian).toLocaleString()}</span>${deltaPill(psf, neighborhoodMedian)}</span>
            </div>` : ''}
            ${decadeMedian != null ? `
            <div class="cm-pos-compare-row">
              <span class="cm-pos-compare-label">vs ${escapeHtml(bldg.decade || 'cohort')} cohort</span>
              <span><span class="cm-pos-compare-val">$${Math.round(decadeMedian).toLocaleString()}</span>${deltaPill(psf, decadeMedian)}</span>
            </div>` : ''}
          </div>
          <div class="cm-pos-stats">
            <div>
              <div class="cm-pos-stat-label">Sales · 36mo</div>
              <div class="cm-pos-stat-val">${sales != null ? sales.toLocaleString() : '—'}</div>
            </div>
            <div>
              <div class="cm-pos-stat-label">Total units</div>
              <div class="cm-pos-stat-val">${totalUnits != null ? totalUnits.toLocaleString() : '—'}</div>
            </div>
            <div>
              <div class="cm-pos-stat-label">Last sale</div>
              <div class="cm-pos-stat-val">${fmtMoneyShort(lastPrice)}</div>
            </div>
            <div>
              <div class="cm-pos-stat-label">on</div>
              <div class="cm-pos-stat-val">${fmtDate(lastDate)}</div>
            </div>
          </div>
        </div>

        <div class="cm-intel-card cm-traj-card">
          <h3>Trajectory</h3>
          <div class="cm-intel-card-sub">$/sf by quarter, last 10 years</div>
          ${hasTrajectory ? `
            <div class="cm-traj-legend">
              <span class="cm-traj-legend-item"><span class="cm-traj-legend-swatch" style="background:var(--cm-peri, #9fb4d8);"></span>${escapeHtml(bldg.name)}</span>
              <span class="cm-traj-legend-item"><span class="cm-traj-legend-swatch" style="background:rgba(232,227,216,0.4);"></span>Citywide</span>
            </div>
            <div class="cm-traj-canvas-wrap"><canvas id="cm-intel-chart"></canvas></div>
            <div class="cm-traj-bookends">
              <span id="cm-traj-start">—</span>
              <span id="cm-traj-end">—</span>
            </div>
          ` : `
            <div class="cm-traj-empty">Not enough sales in this building to chart a trajectory yet.</div>
          `}
        </div>
      </div>

      <div class="cm-intel-card" style="margin-top:24px;">
        <h3>Recent activity</h3>
        <div class="cm-intel-card-sub">Most recent recorded sales in ${escapeHtml(bldg.name)}</div>
        <div class="cm-recent-list">${recentHTML}</div>
      </div>
    </div>
  `;
}

async function init() {
  const slug = getCurrentBuildingSlug();
  if (!slug) return;

  const dossier = document.getElementById('dossier');
  if (!dossier) return; // template doesn't have the standard dossier section, bail

  ensureStyles();

  let buildings, agg, cards, psfTimeline, recentSales, citywideTimeline;
  try {
    buildings = await loadBuildings();
    [agg, cards, psfTimeline, recentSales, citywideTimeline] = await Promise.all([
      rpc('homepage_aggregates').then(r => r[0] || {}),
      rpc('homepage_building_cards'),
      rpc('building_psf_quarterly', { p_slug: slug }),
      rpc('building_recent_sales', { p_slug: slug, p_limit: 8 }),
      rpc('intelligence_psf_quarterly')
    ]);
  } catch (e) {
    console.warn('cm-building-intel: data fetch failed', e);
    return;
  }

  const bldg = buildings.find(b => {
    const s = (b.href || '').replace(/\/$/, '').split('/').pop();
    return s === slug;
  });
  if (!bldg) return;

  const thisCard = cards.find(c => c.building_slug === slug);
  if (!thisCard) return;

  // Compute neighborhood / decade cohort medians and rank — client-side
  const allWithCards = buildings.map(b => {
    const s = (b.href || '').replace(/\/$/, '').split('/').pop();
    const c = cards.find(x => x.building_slug === s) || {};
    return { ...b, slug: s, median_psf_36mo: c.median_psf_36mo };
  });

  const sameHood = allWithCards.filter(x => x.hood === bldg.hood && x.slug !== slug && x.median_psf_36mo);
  const neighborhoodMedian = sameHood.length >= 2 ? median(sameHood.map(x => x.median_psf_36mo)) : null;

  const sameDecade = allWithCards.filter(x => x.decade === bldg.decade && x.slug !== slug && x.median_psf_36mo);
  const decadeMedian = sameDecade.length >= 2 ? median(sameDecade.map(x => x.median_psf_36mo)) : null;

  const ranked = allWithCards.filter(x => x.median_psf_36mo).sort((a, b) => b.median_psf_36mo - a.median_psf_36mo);
  const rankIdx = ranked.findIndex(x => x.slug === slug) + 1;
  const rankTotal = ranked.length;

  const hasTrajectory = psfTimeline.length >= 4;

  // Build and insert section
  const section = document.createElement('section');
  section.id = 'intelligence';
  section.className = 'cm-intel-section';
  section.innerHTML = buildPanelHTML({
    bldg, thisCard, agg, neighborhoodMedian, decadeMedian,
    rankIdx: rankIdx > 0 ? rankIdx : null, rankTotal,
    recentSales, hasTrajectory
  });

  dossier.parentNode.insertBefore(section, dossier.nextSibling);

  // Add the new anchor to the sticky nav (if present)
  const stickyNav = document.querySelector('.sticky-nav-row');
  if (stickyNav && !stickyNav.querySelector('a[href="#intelligence"]')) {
    const dossierLink = stickyNav.querySelector('a[href="#dossier"]');
    const newLink = document.createElement('a');
    newLink.href = '#intelligence';
    newLink.textContent = 'Intelligence';
    if (dossierLink && dossierLink.nextSibling) {
      stickyNav.insertBefore(newLink, dossierLink.nextSibling);
    } else {
      stickyNav.appendChild(newLink);
    }
  }

  // Render trajectory chart if there's enough data
  if (hasTrajectory) {
    try {
      const Chart = await loadChartJs();
      const ctx = section.querySelector('#cm-intel-chart');
      if (!ctx || !Chart) return;

      const buildingByQuarter = new Map(psfTimeline.map(q => [q.quarter_start, q.median_psf]));
      const cityByQuarter = new Map(citywideTimeline.map(q => [q.quarter_start, q.median_psf]));

      // Use union of quarters (citywide is the reference, building data fills in)
      const quarters = citywideTimeline.map(q => q.quarter_start);
      const labels = quarters.map(q => {
        const d = new Date(q + 'T00:00:00');
        const qn = Math.floor(d.getMonth() / 3) + 1;
        return 'Q' + qn + ' ' + d.getFullYear();
      });

      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: bldg.name,
              data: quarters.map(q => buildingByQuarter.get(q) || null),
              borderColor: '#9fb4d8',
              backgroundColor: 'rgba(159,180,216,0.10)',
              borderWidth: 2.5, tension: 0.32, fill: true,
              pointRadius: 0, pointHoverRadius: 5,
              pointHoverBackgroundColor: '#9fb4d8',
              pointHoverBorderColor: '#0f131d',
              spanGaps: true
            },
            {
              label: 'Citywide',
              data: quarters.map(q => cityByQuarter.get(q) || null),
              borderColor: 'rgba(232,227,216,0.42)',
              backgroundColor: 'transparent',
              borderWidth: 1.5, tension: 0.32, fill: false,
              borderDash: [4, 4],
              pointRadius: 0, pointHoverRadius: 4,
              pointHoverBackgroundColor: 'rgba(232,227,216,0.7)',
              spanGaps: true
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1a1f2e',
              borderColor: 'rgba(232,227,216,0.14)', borderWidth: 1,
              titleColor: '#e8e3d8', bodyColor: '#9fb4d8',
              titleFont: { family: 'JetBrains Mono', size: 11 },
              bodyFont: { family: 'JetBrains Mono', size: 13 },
              padding: 12, displayColors: true, boxPadding: 4,
              callbacks: {
                label: (c) => c.dataset.label + ': $' + (c.parsed.y || 0).toLocaleString() + '/sf'
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(232,227,216,0.05)' },
              ticks: {
                color: 'rgba(232,227,216,0.50)',
                font: { family: 'JetBrains Mono', size: 10 },
                maxRotation: 0, autoSkip: true, autoSkipPadding: 28
              }
            },
            y: {
              grid: { color: 'rgba(232,227,216,0.05)' },
              ticks: {
                color: 'rgba(232,227,216,0.50)',
                font: { family: 'JetBrains Mono', size: 10 },
                callback: (v) => '$' + v.toLocaleString()
              }
            }
          }
        }
      });

      // Bookends
      const first = psfTimeline[0];
      const last = psfTimeline[psfTimeline.length - 1];
      const startEl = section.querySelector('#cm-traj-start');
      const endEl = section.querySelector('#cm-traj-end');
      if (startEl && first) {
        const dStart = new Date(first.quarter_start + 'T00:00:00');
        const qStart = Math.floor(dStart.getMonth() / 3) + 1;
        startEl.innerHTML = 'Q' + qStart + ' ' + dStart.getFullYear() +
          '<span class="cm-traj-bookend-val">$' + first.median_psf.toLocaleString() + '/sf</span>';
      }
      if (endEl && last) {
        const dEnd = new Date(last.quarter_start + 'T00:00:00');
        const qEnd = Math.floor(dEnd.getMonth() / 3) + 1;
        endEl.innerHTML = 'Q' + qEnd + ' ' + dEnd.getFullYear() +
          '<span class="cm-traj-bookend-val">$' + last.median_psf.toLocaleString() + '/sf</span>';
      }
    } catch (e) {
      console.warn('cm-building-intel: chart render failed', e);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
