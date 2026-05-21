// src/pages/CMAViewer.jsx
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { theme, fmt } from '@/lib/cmaTheme';
import { useCMATracking } from '@/lib/useCMATracking';

export default function CMAViewer() {
  const { token } = useParams();
  const [cma, setCma]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const { recordMMMInteraction, recordCompClick } = useCMATracking(token);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_cma_by_token', { p_public_token: token });
      if (error || !data?.ok) {
        setError(data?.error || error?.message || 'unknown'); setLoading(false); return;
      }
      setCma(data.cma); setLoading(false);
    })();
  }, [token]);

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error)   return <CenteredMessage>This CMA is unavailable. ({error})</CenteredMessage>;

  return (
    <div style={{ background: theme.bg, color: theme.text, fontFamily: theme.sans, minHeight: '100vh' }}>
      <Header cma={cma} />
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px 80px' }}>
        <HeroMetrics cma={cma} />
        <Section title="Listing Strategy" html={cma.listing_analysis_html} />
        <MMMSlider cma={cma} onInteract={recordMMMInteraction} />
        <Section title="Market Headwind" html={cma.market_challenges_html} />
        <Section title="Demand Engine" html={cma.surrounding_market_html} />
        <Section title="The Comp Walk-Through" html={cma.comp_walkthrough_html} />
        <DirectComps cma={cma} onCompClick={recordCompClick} />
        <PeerBuildings cma={cma} />
        <ComingSoonTimeline cma={cma} />
        <Footer cma={cma} />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function Header({ cma }) {
  return (
    <div style={{ borderBottom: `1px solid ${theme.border}`, padding: '20px 24px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      maxWidth: 920, margin: '0 auto' }}>
      <div>
        <span style={{ fontFamily: theme.serif, fontStyle: 'italic', fontSize: 22 }}>
          Condo <span style={{ color: theme.accent }}>Market</span>
        </span>
        <span style={{ marginLeft: 14, color: theme.textDim, fontSize: 12,
          fontFamily: theme.mono, letterSpacing: 1, textTransform: 'uppercase' }}>
          CMA · {(cma.service_tier || '').replace('_', ' ')}
        </span>
      </div>
      <div style={{ color: theme.textMuted, fontSize: 13, fontFamily: theme.mono }}>
        Prepared {fmt.dateTime(cma.created_at)}
      </div>
    </div>
  );
}

function HeroMetrics({ cma }) {
  const tierLabel = {
    make_me_move: 'Make Me Move',
    coming_soon: 'Coming Soon',
    live_listing: 'Live Listing',
  }[cma.service_tier] || cma.service_tier;
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ color: theme.textMuted, fontFamily: theme.mono, fontSize: 11,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
        Comparative Market Analysis · {tierLabel}
      </div>
      <h1 style={{ fontFamily: theme.serif, fontStyle: 'italic', fontSize: 48,
        margin: '0 0 8px', fontWeight: 400 }}>
        {cma.property_address}
      </h1>
      <div style={{ color: theme.textMuted, fontSize: 15, marginBottom: 32 }}>
        {cma.bedrooms} bed · {cma.baths} bath · {cma.sqft?.toLocaleString()} sqft · built {cma.year_built}
        {cma.client_first_name && <> · prepared for <span style={{ color: theme.text }}>
          {cma.client_first_name} {cma.client_last_name}
        </span></>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Metric label="Purchased" sub={fmt.date(cma.purchase_date)}
          value={fmt.money(cma.purchase_price)} />
        <Metric label="Estimated Value" sub={`${fmt.moneyK(cma.estimated_value_low)} – ${fmt.moneyK(cma.estimated_value_high)}`}
          value={fmt.money(cma.estimated_value_midpoint)} />
        <Metric label="Recommended List" sub={tierLabel} accent
          value={fmt.money(cma.recommended_list_price)} />
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }) {
  return (
    <div style={{
      background: theme.surface, border: `1px solid ${theme.border}`,
      borderLeft: accent ? `3px solid ${theme.accent}` : `1px solid ${theme.border}`,
      padding: '18px 18px 16px', borderRadius: 4,
    }}>
      <div style={{ color: theme.textMuted, fontSize: 11, fontFamily: theme.mono,
        textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: theme.serif, fontSize: 28, fontWeight: 500,
        color: accent ? theme.accent : theme.text }}>{value}</div>
      <div style={{ color: theme.textDim, fontSize: 12, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Section({ title, html }) {
  if (!html) return null;
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{ color: theme.accent, fontSize: 11, fontFamily: theme.mono,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: theme.text }}
        dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// MMM Slider — interactive component, the centerpiece widget
function MMMSlider({ cma, onInteract }) {
  const low  = Number(cma.mmm_range_low  ?? cma.estimated_value_low  ?? 700000);
  const high = Number(cma.mmm_range_high ?? cma.recommended_list_price ?? 1000000);
  const [price, setPrice] = useState(Number(cma.recommended_list_price ?? high));
  const rate = Number(cma.mortgage_rate_assumption ?? 6.875);
  const dpPct = Number(cma.downpayment_pct_assumption ?? 20);
  const hoa  = Number(cma.hoa_monthly ?? 1200);
  const taxPctAnnual = Number(cma.property_tax_pct_annual ?? 1.18);

  const calc = useMemo(() => {
    const dp = price * (dpPct / 100);
    const loan = price - dp;
    const r = (rate / 100) / 12;
    const n = 360;
    const pi = (loan * r) / (1 - Math.pow(1 + r, -n));
    const tax = (price * (taxPctAnnual / 100)) / 12;
    const monthly = pi + hoa + tax;
    const incomeAt28 = (monthly * 12) / 0.28;
    return { dp, loan, pi, tax, monthly, incomeAt28 };
  }, [price, rate, dpPct, hoa, taxPctAnnual]);

  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`,
      borderRadius: 4, padding: '24px 24px 20px', marginBottom: 56 }}>
      <div style={{ color: theme.accent, fontSize: 11, fontFamily: theme.mono,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Make-Me-Move</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontFamily: theme.serif, fontStyle: 'italic', fontSize: 24 }}>
          What would a buyer pay at…
        </div>
        <div style={{ fontFamily: theme.serif, fontSize: 36, color: theme.accent }}>
          {fmt.money(price)}
        </div>
      </div>
      <input type="range" min={low} max={high} step={5000} value={price}
        onChange={(e) => { const p = Number(e.target.value); setPrice(p); onInteract?.(p); }}
        style={{ width: '100%', accentColor: theme.accent, marginBottom: 6 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between',
        color: theme.textDim, fontSize: 11, fontFamily: theme.mono, marginBottom: 24 }}>
        <span>{fmt.money(low)}</span><span>{fmt.money(high)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <MMMCell label={`${dpPct}% down`}     value={fmt.money(calc.dp)} />
        <MMMCell label={`P&I @ ${rate}%/30yr`} value={fmt.money(calc.pi)+'/mo'} />
        <MMMCell label="HOA + tax"             value={fmt.money(hoa + calc.tax)+'/mo'} />
        <MMMCell label="Total monthly"         value={fmt.money(calc.monthly)+'/mo'} accent />
      </div>
      <div style={{ color: theme.textMuted, fontSize: 13, fontFamily: theme.mono,
        paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
        Buyer income needed at 28% DTI: <span style={{ color: theme.text }}>
          {fmt.money(calc.incomeAt28)}/yr
        </span>
      </div>
    </div>
  );
}

function MMMCell({ label, value, accent }) {
  return (
    <div>
      <div style={{ color: theme.textDim, fontSize: 10, fontFamily: theme.mono,
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: theme.mono, fontSize: 15,
        color: accent ? theme.accent : theme.text }}>{value}</div>
    </div>
  );
}

// Direct comps table
function DirectComps({ cma, onCompClick }) {
  const comps = cma.comp_snapshot?.direct_comps || [];
  if (comps.length === 0) return null;
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{ color: theme.accent, fontSize: 11, fontFamily: theme.mono,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Direct Comparables</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: theme.mono, fontSize: 13 }}>
        <thead>
          <tr style={{ color: theme.textMuted, textAlign: 'left' }}>
            <th style={{ padding: '10px 8px', borderBottom: `1px solid ${theme.border}` }}>Unit</th>
            <th style={{ padding: '10px 8px', borderBottom: `1px solid ${theme.border}` }}>Floor</th>
            <th style={{ padding: '10px 8px', borderBottom: `1px solid ${theme.border}` }}>Sold</th>
            <th style={{ padding: '10px 8px', borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>Price</th>
            <th style={{ padding: '10px 8px', borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>$/sqft</th>
          </tr>
        </thead>
        <tbody>
          {comps.map((c, i) => (
            <tr key={i} onClick={onCompClick} style={{ cursor: 'pointer' }}>
              <td style={{ padding: '12px 8px', borderBottom: `1px solid ${theme.border}` }}>{c.unit}</td>
              <td style={{ padding: '12px 8px', borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{c.floor}</td>
              <td style={{ padding: '12px 8px', borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{fmt.date(c.sale_date)}</td>
              <td style={{ padding: '12px 8px', borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>{fmt.money(c.sale_price)}</td>
              <td style={{ padding: '12px 8px', borderBottom: `1px solid ${theme.border}`, textAlign: 'right', color: theme.textMuted }}>${c.psf}</td>
            </tr>
          ))}
          <tr style={{ background: theme.surface }}>
            <td style={{ padding: '12px 8px', color: theme.accent }}>{cma.unit_label} ★</td>
            <td style={{ padding: '12px 8px', color: theme.textMuted }}>—</td>
            <td style={{ padding: '12px 8px', color: theme.textMuted, fontStyle: 'italic' }}>subject</td>
            <td style={{ padding: '12px 8px', textAlign: 'right', color: theme.accent }}>{fmt.money(cma.estimated_value_midpoint)}</td>
            <td style={{ padding: '12px 8px', textAlign: 'right', color: theme.textMuted }}>${Math.round(cma.estimated_value_psf)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Peer-building bar chart
function PeerBuildings({ cma }) {
  const peers = (cma.comp_snapshot?.peer_buildings_1bd_12mo || []).filter(p => p.median);
  if (peers.length === 0) return null;
  const max = Math.max(...peers.map(p => p.median));
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{ color: theme.accent, fontSize: 11, fontFamily: theme.mono,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>Peer Buildings · 1-Bedroom · 12-month</div>
      {peers.map((p, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontFamily: theme.mono, fontSize: 13, marginBottom: 4 }}>
            <span>{p.building}</span>
            <span style={{ color: theme.textMuted }}>
              {fmt.money(p.median)} median · ${p.avg_psf}/sqft · {p.sales} sales
            </span>
          </div>
          <div style={{ height: 6, background: theme.surface, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: ((p.median / max) * 100) + '%',
              background: p.building === 'The Harrison' ? theme.accent : theme.borderHi }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Coming Soon strategy timeline
function ComingSoonTimeline({ cma }) {
  if (cma.service_tier !== 'coming_soon') return null;
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{ color: theme.accent, fontSize: 11, fontFamily: theme.mono,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>Coming Soon Strategy</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <TimelineStep day="Day 0" title="List at $950K Coming Soon"
          desc="Visible to 10,000+ MLS agents — never to Zillow or Redfin." />
        <TimelineStep day="Day 0-30" title="Test the asymmetric price"
          desc="Qualified agent interest tracked. Cash buyers from the AI cluster are the target." />
        <TimelineStep day="Day 30 decision" title="Hold, adjust, or go Live"
          desc="If traction: transition to Live MLS. If not: reposition $849K-$899K before public exposure." />
      </div>
    </div>
  );
}

function TimelineStep({ day, title, desc }) {
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`,
      borderTop: `3px solid ${theme.accent}`, padding: '16px 16px 14px', borderRadius: 4 }}>
      <div style={{ color: theme.accent, fontFamily: theme.mono, fontSize: 11,
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{day}</div>
      <div style={{ fontFamily: theme.serif, fontSize: 17, marginBottom: 6 }}>{title}</div>
      <div style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function Footer({ cma }) {
  return (
    <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 24, marginTop: 24,
      color: theme.textDim, fontSize: 12, fontFamily: theme.mono, textAlign: 'center' }}>
      Prepared by Tim McMullen · DRE #02016832 · tim@sanfranciscocondomarket.com
    </div>
  );
}

function CenteredMessage({ children }) {
  return (
    <div style={{ background: theme.bg, color: theme.textMuted, fontFamily: theme.mono,
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}
