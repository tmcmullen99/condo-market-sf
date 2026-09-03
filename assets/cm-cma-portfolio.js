/* cm-cma-portfolio.js — multi-unit CMA deliverable for /cma/?token=…
 * ---------------------------------------------------------------------------
 * A cma_portfolios row groups N cma_reports under ONE public token, so an owner
 * of several units gets a single link instead of one per unit.
 *
 * SELF-BOOTSTRAPPING BY DESIGN. This module runs on import, reads ?token, and
 * calls get_cma_portfolio_by_token. If the token IS a portfolio it takes over
 * the page. If it is not — the overwhelmingly common single-unit case — it
 * returns silently and the existing load() in cma/index.html renders as before.
 * That is why adding it costs exactly one <script> tag and cannot regress the
 * single-unit path.
 *
 * Everything rendered here is row data. Nothing is hardcoded to a property:
 *   portfolio.shared_snapshot.goal_table                  → goal band table
 *   portfolio.shared_snapshot.lower_floor_1bd             → lead comps
 *   portfolio.shared_snapshot.upper_floor_context         → context comps
 *   portfolio.shared_snapshot.active_now                  → live listings
 *   portfolio.shared_snapshot.value_retention_south_beach → building retention
 *   portfolio.shared_snapshot.breakeven                   → break-even callout
 *   portfolio.credit_amount_usd                           → credit panel
 *   units[].mmm_range_low / high                          → Make Me Move hints
 *
 * Any block whose data is absent simply does not render. No placeholders, no
 * invented numbers — a section without a sample size does not appear.
 */

import { sb, CM } from './cm-supabase.js';

const BOOKING_URL = 'https://calendar.app.google/m126oXA4MjDrMNnV8';

/* ---------------------------------------------------------------- helpers */
const money = (n) => n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-US');
const psf   = (n) => n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-US');
const num   = (n) => n == null ? '—' : Number(n).toLocaleString('en-US');
const esc   = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const pct   = (n) => n == null ? '—' : (Number(n) > 0 ? '+' : '') + Number(n).toFixed(1) + '%';
const dt    = (s) => s ? new Date(s + (String(s).length === 10 ? 'T12:00:00' : ''))
                  .toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';

function css() {
  return `
  .pf-wrap{max-width:1100px;margin:0 auto;padding:0 28px}
  .pf sec,.pf section{display:block}
  .pf-sec{padding:46px 0;border-bottom:1px solid var(--cream-14,rgba(232,227,216,.14))}
  .pf-eyebrow{font-family:var(--mono,monospace);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--cream-58,rgba(232,227,216,.58))}
  .pf h1,.pf h2,.pf h3{font-family:var(--serif,Georgia,serif);font-weight:500;letter-spacing:-.015em}
  .pf-sec h2{font-size:clamp(24px,3.4vw,34px);margin:10px 0 14px;line-height:1.15}
  .pf-lead{color:var(--cream-78,rgba(232,227,216,.78));max-width:76ch}
  .pf-lead+.pf-lead{margin-top:13px}
  .pf-hero{padding:44px 0 34px;border-bottom:1px solid var(--cream-14,rgba(232,227,216,.14))}
  .pf-hero h1{font-size:clamp(32px,4.6vw,48px);line-height:1.07;margin-bottom:10px}
  .pf-hero h1 em{font-style:italic;color:var(--blue-gray,#9fb4d8)}
  .pf-sub{font-family:var(--mono,monospace);font-size:13px;color:var(--cream-58,rgba(232,227,216,.58));margin-bottom:22px}
  .pf-credit{background:linear-gradient(135deg,rgba(212,165,116,.16),rgba(212,165,116,.05));border:1px solid rgba(212,165,116,.4);border-radius:14px;padding:26px 28px;margin-top:24px}
  .pf-credit .amt{font-family:var(--serif,Georgia,serif);font-size:44px;color:var(--gold,#d4a574);line-height:1}
  .pf-credit p{color:var(--cream-78,rgba(232,227,216,.78));max-width:68ch;margin-top:10px;font-size:14.5px}
  .pf-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:16px;margin-top:24px}
  .pf-stat{background:var(--bg-card,#1a1f2e);border:1px solid var(--cream-14,rgba(232,227,216,.14));border-radius:12px;padding:20px 22px}
  .pf-stat .v{font-family:var(--serif,Georgia,serif);font-size:29px;line-height:1.05}
  .pf-stat .l{font-family:var(--mono,monospace);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cream-58,rgba(232,227,216,.58));margin-top:8px}
  .pf-grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px}
  .pf-card{background:var(--bg-card-lift,#222837);border:1px solid var(--cream-14,rgba(232,227,216,.14));border-radius:12px;padding:24px}
  .pf-card h3{font-size:21px;margin-bottom:4px}
  .pf-card .sub{font-family:var(--mono,monospace);font-size:11.5px;color:var(--cream-58,rgba(232,227,216,.58));margin-bottom:16px}
  .pf-card .big{font-family:var(--serif,Georgia,serif);font-size:36px;line-height:1.05}
  .pf-kv{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid rgba(232,227,216,.08);font-size:14px}
  .pf-kv:last-of-type{border-bottom:0}
  .pf-kv span:first-child{color:var(--cream-58,rgba(232,227,216,.58))}
  .pf-kv b{font-weight:500;font-family:var(--mono,monospace);font-size:13.5px}
  .pf-note{font-size:13.5px;color:var(--cream-78,rgba(232,227,216,.78));margin-top:14px;padding-top:14px;border-top:1px solid var(--cream-14,rgba(232,227,216,.14))}
  .pf-tw{overflow-x:auto;border:1px solid var(--cream-14,rgba(232,227,216,.14));border-radius:12px;background:var(--bg-card,#1a1f2e);margin-top:20px}
  .pf table{width:100%;border-collapse:collapse;font-size:13.5px}
  .pf th,.pf td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--cream-14,rgba(232,227,216,.14));white-space:nowrap}
  .pf th:first-child,.pf td:first-child{text-align:left}
  .pf th{font-family:var(--mono,monospace);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--cream-58,rgba(232,227,216,.58));font-weight:500}
  .pf tr.hi td{background:rgba(159,180,216,.10);font-weight:500}
  .pf tr.ctx td{color:var(--cream-58,rgba(232,227,216,.58));font-style:italic}
  .pf-small{font-size:12.5px;color:var(--cream-58,rgba(232,227,216,.58));margin-top:14px;max-width:90ch}
  .pf-pos{color:var(--green,#84d9a0)}.pf-neg{color:var(--red,#e57373)}
  .pf-flag{border-left:3px solid var(--amber,#d9a44b);background:rgba(217,164,75,.07);border-radius:0 10px 10px 0;padding:20px 24px;margin-top:24px}
  .pf-flag h3{font-size:18px;color:var(--amber,#d9a44b);margin-bottom:8px}
  .pf-flag p{font-size:14.5px;color:var(--cream-78,rgba(232,227,216,.78));max-width:80ch}
  .pf-flag p+p{margin-top:10px}
  .pf-ladder{display:grid;gap:16px;margin-top:24px}
  .pf-rung{background:var(--bg-card,#1a1f2e);border:1px solid var(--cream-14,rgba(232,227,216,.14));border-radius:12px;padding:24px 26px;position:relative}
  .pf-rung.rec{border-color:rgba(212,165,116,.5);background:var(--bg-card-lift,#222837)}
  .pf-rung .badge{position:absolute;top:-11px;right:22px;background:var(--gold,#d4a574);color:#1a1f2e;font-family:var(--mono,monospace);font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 12px;border-radius:999px}
  .pf-rung .tier{font-family:var(--mono,monospace);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold,#d4a574);margin-bottom:6px}
  .pf-rung h3{font-size:22px;margin-bottom:6px}
  .pf-rung p{color:var(--cream-78,rgba(232,227,216,.78));font-size:14.5px}
  .pf-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:16px;margin-top:18px;padding-top:16px;border-top:1px solid var(--cream-14,rgba(232,227,216,.14))}
  .pf-facts .l{font-family:var(--mono,monospace);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--cream-58,rgba(232,227,216,.58))}
  .pf-facts .v{font-family:var(--serif,Georgia,serif);font-size:20px;margin-top:4px}
  .pf-mmm{background:var(--bg-card-lift,#222837);border:1px solid rgba(212,165,116,.34);border-radius:14px;padding:28px 30px;margin-top:24px}
  .pf-mmm h3{font-size:23px;margin-bottom:8px}
  .pf-mmm p{color:var(--cream-78,rgba(232,227,216,.78));font-size:14.5px;max-width:70ch}
  .pf-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
  .pf-fld label{display:block;font-family:var(--mono,monospace);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cream-58,rgba(232,227,216,.58));margin-bottom:7px}
  .pf-fld input,.pf-fld select,.pf-fld textarea{width:100%;background:var(--bg,#0f131d);border:1px solid var(--cream-14,rgba(232,227,216,.14));border-radius:9px;color:var(--cream,#e8e3d8);font-family:var(--sans,sans-serif);font-size:16px;padding:13px 15px}
  .pf-fld input:focus,.pf-fld select:focus,.pf-fld textarea:focus{outline:none;border-color:var(--gold,#d4a574)}
  .pf-fld .hint{font-size:12px;color:var(--cream-38,rgba(232,227,216,.38));margin-top:6px}
  .pf-btn{display:inline-block;padding:14px 26px;border-radius:10px;font-family:var(--sans,sans-serif);font-size:15px;font-weight:500;cursor:pointer;border:0;background:var(--gold,#d4a574);color:#1a1f2e}
  .pf-btn:hover{background:#e8b985;text-decoration:none}
  .pf-btn-line{background:transparent;border:1px solid var(--gold,#d4a574);color:var(--gold,#d4a574)}
  .pf-msg{margin-top:16px;font-size:14px;display:none}
  .pf-next{display:none;margin-top:24px;padding-top:22px;border-top:1px solid var(--cream-14,rgba(232,227,216,.14))}
  .pf-foot{padding:42px 0 60px;color:var(--cream-58,rgba(232,227,216,.58));font-size:13px}
  .pf-foot .nm{font-family:var(--serif,Georgia,serif);font-size:20px;color:var(--cream,#e8e3d8);margin-bottom:8px}
  .pf-disc{margin-top:20px;padding-top:18px;border-top:1px solid var(--cream-14,rgba(232,227,216,.14));max-width:92ch;line-height:1.65;font-size:12.5px;color:var(--cream-38,rgba(232,227,216,.38))}
  @media(max-width:760px){.pf-grid2,.pf-row{grid-template-columns:1fr}}
  `;
}

/* ------------------------------------------------------------- fragments */

function heroHTML(p) {
  const credit = p.credit_amount_usd
    ? `<div class="pf-credit">
         <div class="pf-eyebrow" style="color:var(--gold,#d4a574)">Credit claimed · applied at close of escrow</div>
         <div class="amt">${money(p.credit_amount_usd)}</div>
         <p>Credited off commission at the close of escrow when you sell through Condo Market. Already attached to your account — it applies to a sale of any residence below, and it is deducted on the settlement statement rather than invoiced.</p>
       </div>` : '';
  const name = [p.client_first_name, p.client_last_name].filter(Boolean).join(' ');
  return `<header class="pf-hero"><div class="pf-wrap">
    <div class="pf-eyebrow">Comparative Market Analysis · ${esc(p.unit_count)} residences</div>
    <h1>${esc(p.title)}</h1>
    <div class="pf-sub">${esc(p.subtitle || '')}${name ? ' · prepared for ' + esc(name) : ''}</div>
    ${credit}
  </div></header>`;
}

function statsHTML(p, units) {
  const cards = [];
  if (p.combined_value_mid != null)
    cards.push(`<div class="pf-stat"><div class="v">${money(p.combined_value_mid)}</div><div class="l">Combined · at comp average</div></div>`);
  units.forEach(u => cards.push(
    `<div class="pf-stat"><div class="v">${money(u.estimated_value_midpoint)}</div><div class="l">${esc(u.unit_label)} · projected</div></div>`));
  if (p.goal_psf_low && p.goal_psf_high)
    cards.push(`<div class="pf-stat"><div class="v">${psf(p.goal_psf_low)}–${psf(p.goal_psf_high)}</div><div class="l">Goal band · per square foot</div></div>`);
  const ret = p.shared_snapshot && p.shared_snapshot.value_retention_south_beach;
  if (ret && ret.brannan_rank)
    cards.push(`<div class="pf-stat"><div class="v">${ret.brannan_rank} of ${ret.brannan_of}</div><div class="l">Building value retention rank</div></div>`);
  return cards.length ? `<div class="pf-stats">${cards.join('')}</div>` : '';
}

function retentionHTML(p) {
  const r = p.shared_snapshot && p.shared_snapshot.value_retention_south_beach;
  if (!r || !Array.isArray(r.rows) || !r.rows.length) return '';
  const best = r.rows.reduce((a, b) => (Number(b.pct) > Number(a.pct) ? b : a));
  const rows = r.rows.map(x => {
    const hi = /brannan/i.test(x.building) && Number(x.pct) === Number(
      (r.rows.find(y => /^the brannan$/i.test(y.building)) || {}).pct);
    return `<tr class="${hi ? 'hi' : ''}"><td>${esc(x.building)}</td><td>${psf(x.peak_psf)}</td><td>${psf(x.now_psf)}</td>
      <td class="${Number(x.pct) > -18 ? 'pf-pos' : 'pf-neg'}">${pct(x.pct)}</td></tr>`;
  }).join('');
  return `<section class="pf-sec"><div class="pf-wrap">
    <div class="pf-eyebrow">The building</div>
    <h2>How this building held its value.</h2>
    <p class="pf-lead">One-bedroom price per square foot in the ${esc(r.window_peak)} market against ${esc(r.window_now)}. Only <strong>${esc(best.building)}</strong> held more.</p>
    <div class="pf-tw"><table>
      <thead><tr><th>Building</th><th>1BR $/sf, ${esc(r.window_peak)}</th><th>1BR $/sf, now</th><th>Change</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="pf-small">${esc(r.basis || '')} Medians throughout. Every building is measured the same unmatched way so the comparison is like-for-like. Recent-window sample sizes are small for several buildings and these medians will move as more sales close.</p>
  </div></section>`;
}

function compsHTML(p, units) {
  const s = p.shared_snapshot || {};
  const lead = s.lower_floor_1bd;
  if (!lead || !Array.isArray(lead.comps)) return '';
  const row = (c, cls, priceCell, statusCell) =>
    `<tr class="${cls}"><td>${esc(c.unit)}</td><td>${c.floor ?? '—'}</td><td>${num(c.sqft)}</td>
     <td>${priceCell}</td><td>${psf(c.psf)}</td><td>${statusCell}</td></tr>`;
  const leadRows = lead.comps.map(c => row(c, '', money(c.sale_price), esc(c.sale_date || '')));
  const subjRows = units.map(u => row(
    { unit: u.unit_label + ' — subject', floor: null, sqft: u.sqft, psf: u.estimated_value_psf },
    'hi', money(u.estimated_value_midpoint) + ' proj.', 'projection'));
  const actRows = (s.active_now || []).map(c => row(c, 'ctx', money(c.list_price) + ' ask', 'on market'));
  const upRows  = (s.upper_floor_context || []).map(c => row(
    c, 'ctx', money(c.sale_price), esc(c.sale_date || '')));
  return `<section class="pf-sec"><div class="pf-wrap">
    <div class="pf-eyebrow">The comparables</div>
    <h2>${esc(lead.label || 'Lead comparables')} carry the number.</h2>
    <p class="pf-lead">The lead set averages <strong>${psf(lead.avg_psf)} per square foot</strong> across ${esc(lead.sales_count)} sales. Context rows are shown in italics and are excluded from the conclusion.</p>
    <div class="pf-tw"><table>
      <thead><tr><th>Residence</th><th>Floor</th><th>Sq ft</th><th>Price</th><th>$/sf</th><th>Status</th></tr></thead>
      <tbody>${leadRows.join('')}${subjRows.join('')}${actRows.join('')}${upRows.join('')}</tbody></table></div>
    <p class="pf-small">Subject rows are projections at the lead-set average price per foot, not transactions, and are labelled as such. Listing brokerages omitted.</p>
  </div></section>`;
}

function unitCardsHTML(units) {
  if (!units.length) return '';
  const cards = units.map(u => {
    const rows = [];
    if (u.estimated_value_low != null && u.estimated_value_high != null)
      rows.push(`<div class="pf-kv"><span>Supported range</span><b>${money(u.estimated_value_low)} – ${money(u.estimated_value_high)}</b></div>`);
    if (u.purchase_price != null)
      rows.push(`<div class="pf-kv"><span>Purchased ${dt(u.purchase_date)}</span><b>${money(u.purchase_price)}</b></div>`);
    if (u.purchase_price != null && u.estimated_value_midpoint != null) {
      const d = (Number(u.estimated_value_midpoint) / Number(u.purchase_price) - 1) * 100;
      rows.push(`<div class="pf-kv"><span>Change to projection</span><b class="${d >= 0 ? 'pf-pos' : 'pf-neg'}">${pct(d)}</b></div>`);
    }
    if (u.recommended_list_price != null)
      rows.push(`<div class="pf-kv"><span>Recommended list</span><b>${money(u.recommended_list_price)}</b></div>`);
    return `<div class="pf-card">
      <h3>${esc(u.property_address || u.unit_label)}</h3>
      <div class="sub">${num(u.sqft)} sq ft · ${u.bedrooms ?? '—'} bd / ${u.baths ?? '—'} ba · built ${u.year_built ?? '—'}</div>
      <div class="big">${money(u.estimated_value_midpoint)}</div>
      <div style="font-family:var(--mono,monospace);font-size:12.5px;color:var(--cream-58,rgba(232,227,216,.58));margin:8px 0 16px">at ${psf(u.estimated_value_psf)} per square foot</div>
      ${rows.join('')}
      ${u.list_price_rationale ? `<p class="pf-note">${esc(u.list_price_rationale)}</p>` : ''}
    </div>`;
  }).join('');
  return `<section class="pf-sec"><div class="pf-wrap">
    <div class="pf-eyebrow">Each residence</div>
    <h2>Unit by unit.</h2>
    <div class="pf-grid2">${cards}</div>
  </div></section>`;
}

function goalHTML(p) {
  const g = p.shared_snapshot && p.shared_snapshot.goal_table;
  if (!Array.isArray(g) || !g.length) return '';
  const lo = p.goal_psf_low, hi = p.goal_psf_high;
  const rows = g.map((r, i) => `<tr class="${i === g.length - 1 ? 'hi' : ''}">
      <td>${esc(r.unit)}</td><td>${num(r.sqft)}</td><td>${money(r.at_950)}</td>
      <td>${money(r.at_avg)}</td><td>${money(r.at_1000)}</td></tr>`).join('');
  const be = p.shared_snapshot.breakeven;
  const beHTML = be ? `<div class="pf-flag">
      <h3>The break-even number</h3>
      <p><strong>${esc(be.unit)}</strong> was purchased for ${money(be.basis_price)} in ${dt(be.basis_date)}. It breaks even at <strong>${psf(be.breakeven_psf)} per square foot</strong> — above the top of the goal band, so even a best-case sale lands under basis. That is the central fact in any pricing conversation on this residence, and it is better raised now than discovered at offer stage.</p>
    </div>` : '';
  return `<section class="pf-sec"><div class="pf-wrap">
    <div class="pf-eyebrow">The target</div>
    <h2>Price to clear ${psf(lo)} to ${psf(hi)} a foot.</h2>
    <p class="pf-lead">Applied to recorded living area, with no adjustment for floor, outlook, condition or dues — each of which moves an individual result.</p>
    <div class="pf-tw"><table>
      <thead><tr><th>Residence</th><th>Sq ft</th><th>At ${psf(lo)}/sf</th><th>At comp average</th><th>At ${psf(hi)}/sf</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${beHTML}
  </div></section>`;
}

function ladderHTML() {
  return `<section class="pf-sec"><div class="pf-wrap">
    <div class="pf-eyebrow">The three tiers</div>
    <h2>A ladder, not a cliff.</h2>
    <p class="pf-lead">Three ways to come to market, each with progressively more reach, effort and commitment. You do not have to start at the top, and with more than one residence you can test one and hold the other.</p>
    <div class="pf-ladder">
      <div class="pf-rung rec"><div class="badge">Recommended start</div>
        <div class="tier">Tier 1 · Zero friction</div><h3>Make Me Move</h3>
        <p>Float the number you would actually sell for. No agreement, no obligation, no public footprint.</p>
        <div class="pf-facts">
          <div><div class="l">Reach</div><div class="v">~1,800</div></div>
          <div><div class="l">Agreement</div><div class="v">None</div></div>
          <div><div class="l">Cost</div><div class="v">Free</div></div>
        </div></div>
      <div class="pf-rung"><div class="tier">Tier 2 · Medium reach</div><h3>Coming Soon</h3>
        <p>Off-market in the MLS. Every California agent sees it. The public does not.</p>
        <div class="pf-facts">
          <div><div class="l">Reach</div><div class="v">~30,000</div></div>
          <div><div class="l">Agreement</div><div class="v">Required</div></div>
          <div><div class="l">Public</div><div class="v">No</div></div>
        </div></div>
      <div class="pf-rung"><div class="tier">Tier 3 · Maximum reach</div><h3>Active Listing</h3>
        <p>Zillow, Redfin, the works — and the only tier that starts a public days-on-market clock.</p>
        <div class="pf-facts">
          <div><div class="l">Reach</div><div class="v">~3M+</div></div>
          <div><div class="l">Agreement</div><div class="v">Full MLS</div></div>
          <div><div class="l">Best for</div><div class="v">Speed</div></div>
        </div></div>
    </div>
  </div></section>`;
}

function mmmHTML(p, units) {
  const opts = units.map(u =>
    `<option value="${esc(u.property_address || u.unit_label)}" data-lo="${u.mmm_range_low || ''}" data-hi="${u.mmm_range_high || ''}">${esc(u.property_address || u.unit_label)} — ${num(u.sqft)} sf</option>`).join('');
  const first = units[0] || {};
  const hint = (first.mmm_range_low && first.mmm_range_high)
    ? `Analysis supports ${money(first.mmm_range_low)} – ${money(first.mmm_range_high)}.` : '';
  return `<section class="pf-sec" id="pf-mmm-sec"><div class="pf-wrap">
    <div class="pf-eyebrow">Your number</div>
    <h2>What would actually make you move?</h2>
    <div class="pf-mmm">
      <h3>Set a Make Me Move price</h3>
      <p>Name the number you would sell at today. It is saved to your Condo Market account and shown only to verified buyers inside the Private Marketplace — never on the MLS, never on Zillow, never publicly. Change or remove it at any time.</p>
      <div class="pf-row">
        <div class="pf-fld"><label for="pf-unit">Residence</label><select id="pf-unit">${opts}</select></div>
        <div class="pf-fld"><label for="pf-price">Your number</label>
          <input id="pf-price" type="text" inputmode="numeric" autocomplete="off" placeholder="${money(first.mmm_range_high || 1000000)}">
          <div class="hint" id="pf-hint">${hint}</div></div>
      </div>
      <div class="pf-fld" style="margin-top:16px"><label for="pf-notes">Anything a buyer should know (optional)</label>
        <textarea id="pf-notes" rows="2" placeholder="Timing, tenant status, parking, storage…"></textarea></div>
      <div style="margin-top:20px"><button class="pf-btn" id="pf-save">Save my number →</button></div>
      <div class="pf-msg" id="pf-msg"></div>
      <div class="pf-next" id="pf-next">
        <h3>Saved. Want to talk it through?</h3>
        <p>Twenty minutes over Google Meet — the numbers, which tier suits each residence, and how the credit applies at close. No pressure and no listing pitch.</p>
        <div style="margin-top:16px"><a class="pf-btn pf-btn-line" href="${BOOKING_URL}" target="_blank" rel="noopener">Schedule a Google Meet →</a></div>
      </div>
    </div>
  </div></section>`;
}

function footerHTML(p) {
  return `<footer class="pf-foot"><div class="pf-wrap">
    <div class="nm">Tim McMullen</div>
    <div>Condo Market SF · McMullen Properties LLC · Tim McMullen, Broker · DRE #02016832</div>
    <div style="margin-top:6px"><a href="mailto:tim@mcmullen.properties">tim@mcmullen.properties</a> · 415-691-9272</div>
    <div class="pf-disc">This comparative market analysis is an opinion of value prepared by a licensed real estate agent to inform a selling decision. It is not an appraisal and is not a substitute for one. Sale prices, square footage, dues and dates are taken from MLS comparable-property exports, public records and Condo Market building sales history; they are deemed reliable but are not guaranteed. Projections apply a stated rate to recorded living area and make no adjustment for floor, outlook, condition or dues. Sample sizes are disclosed throughout and are small in places. Any credit shown is applied against commission at the close of escrow on a sale transacted through Condo Market and is subject to the terms of the offer as claimed on your account. Verify all figures independently before acting.</div>
  </div></footer>`;
}

/* --------------------------------------------------------- Make Me Move */

function wireMMM(p, units) {
  const unitEl  = document.getElementById('pf-unit');
  const priceEl = document.getElementById('pf-price');
  const notesEl = document.getElementById('pf-notes');
  const msgEl   = document.getElementById('pf-msg');
  const nextEl  = document.getElementById('pf-next');
  const btn     = document.getElementById('pf-save');
  if (!unitEl || !btn) return;

  const say = (text, tone) => {
    msgEl.style.display = 'block';
    msgEl.style.color = tone === 'bad' ? 'var(--red,#e57373)' : tone === 'good' ? 'var(--green,#84d9a0)' : 'var(--cream-78,rgba(232,227,216,.78))';
    msgEl.textContent = text;
  };

  unitEl.addEventListener('change', () => {
    const o = unitEl.selectedOptions[0];
    const lo = o && o.dataset.lo, hi = o && o.dataset.hi;
    document.getElementById('pf-hint').textContent =
      (lo && hi) ? `Analysis supports ${money(lo)} – ${money(hi)}.` : '';
  });

  priceEl.addEventListener('input', e => {
    const d = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = d ? '$' + Number(d).toLocaleString('en-US') : '';
  });

  async function save(userId, unitAddress, targetPrice, notes) {
    try {
      await sb.from('make_me_move')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('unit_address', unitAddress).eq('is_active', true);
      const { error } = await sb.from('make_me_move').insert({
        user_id: userId,
        building_slug: p.building_slug || null,
        unit_address: unitAddress,
        target_price: targetPrice,
        notes: notes || null,
        is_active: true
      });
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('[pf-mmm] save failed', err);
      say('Could not save that just now. Email tim@mcmullen.properties and it will be set manually.', 'bad');
      return false;
    }
  }

  btn.addEventListener('click', async () => {
    const price = Number((priceEl.value || '').replace(/[^0-9]/g, ''));
    if (!price || price < 100000) { say('Enter the price you would sell at — anything above $100,000.', 'bad'); priceEl.focus(); return; }
    btn.disabled = true; say('Saving…');
    let user = null;
    try { user = await CM.getUser(); } catch (_) {}
    if (!user) {
      try { sessionStorage.setItem('cm_pending_mmm', JSON.stringify({ unit: unitEl.value, price, notes: notesEl.value || null })); } catch (_) {}
      btn.disabled = false;
      say('One step first — create a free account so the number is saved to you. Redirecting…');
      window.location.href = '/?auth=signup&return=' + encodeURIComponent(location.pathname + location.search + '#pf-mmm-sec');
      return;
    }
    const ok = await save(user.id, unitEl.value, price, notesEl.value || null);
    btn.disabled = false;
    if (ok) {
      say('Saved. Your number is live in the Private Marketplace and visible only to verified buyers.', 'good');
      nextEl.style.display = 'block';
      nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Resume a submission interrupted by signup.
  (async () => {
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('cm_pending_mmm') || 'null'); } catch (_) {}
    if (!pending) return;
    let user = null;
    try { user = await CM.getUser(); } catch (_) {}
    if (!user) return;
    sessionStorage.removeItem('cm_pending_mmm');
    unitEl.value = pending.unit;
    priceEl.value = '$' + Number(pending.price).toLocaleString('en-US');
    if (pending.notes) notesEl.value = pending.notes;
    if (await save(user.id, pending.unit, pending.price, pending.notes)) {
      say('Saved. Your number is live in the Private Marketplace and visible only to verified buyers.', 'good');
      nextEl.style.display = 'block';
    }
  })();
}

/* ------------------------------------------------------------------ mount */

function mount(p, units) {
  const style = document.createElement('style');
  style.textContent = css();
  document.head.appendChild(style);

  // Stand down the single-unit view.
  ['loading', 'error', 'main'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const sub = document.getElementById('nav-sub');
  if (sub) sub.textContent = `CMA · ${p.unit_count} residences`;
  document.title = `${p.title} · CMA · Condo Market SF`;

  const host = document.createElement('div');
  host.className = 'pf';
  host.innerHTML =
    heroHTML(p) +
    `<section class="pf-sec"><div class="pf-wrap">${statsHTML(p, units)}</div></section>` +
    (p.overview_html ? `<section class="pf-sec"><div class="pf-wrap"><div class="pf-lead">${p.overview_html}</div></div></section>` : '') +
    retentionHTML(p) +
    compsHTML(p, units) +
    unitCardsHTML(units) +
    goalHTML(p) +
    ladderHTML() +
    mmmHTML(p, units) +
    footerHTML(p);

  document.body.appendChild(host);
  wireMMM(p, units);
}

/* --------------------------------------------------------------- bootstrap
 * Runs on import. Silent no-op unless the token resolves to a portfolio, so
 * the single-unit path in cma/index.html is completely unaffected.
 * ------------------------------------------------------------------------ */
(async function bootstrap() {
  try {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;
    const { data, error } = await sb.rpc('get_cma_portfolio_by_token', { p_public_token: token });
    if (error || !data || data.ok !== true) return;      // not a portfolio — stand aside
    const units = Array.isArray(data.units) ? data.units : [];
    mount(data.portfolio, units);
  } catch (err) {
    console.warn('[cm-cma-portfolio] bootstrap skipped', err);
  }
})();

export default { mount };
