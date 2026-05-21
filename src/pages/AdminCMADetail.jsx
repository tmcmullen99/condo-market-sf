// src/pages/AdminCMADetail.jsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { theme, fmt } from '@/lib/cmaTheme';

export default function AdminCMADetail() {
  const { id } = useParams();
  const [cma, setCma]     = useState(null);
  const [views, setViews] = useState(null);

  useEffect(() => {
    (async () => {
      const [{ data: cmaRow }, { data: viewRows }] = await Promise.all([
        supabase.from('v_cma_activity_dashboard').select('*').eq('cma_id', id).single(),
        supabase.from('cma_views').select('*').eq('cma_id', id).order('opened_at', { ascending: false }),
      ]);
      setCma(cmaRow); setViews(viewRows || []);
    })();
  }, [id]);

  if (!cma) return <Center>Loading…</Center>;

  return (
    <div style={{ background: theme.bg, color: theme.text, fontFamily: theme.sans, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Link to="/admin/cmas" style={{ color: theme.textMuted, fontFamily: theme.mono,
          fontSize: 12, textDecoration: 'none' }}>← All CMAs</Link>

        <div style={{ marginTop: 16, marginBottom: 32 }}>
          <div style={{ color: theme.textMuted, fontSize: 11, fontFamily: theme.mono,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            CMA · {(cma.service_tier || '').replace('_', ' ')}
          </div>
          <h1 style={{ fontFamily: theme.serif, fontStyle: 'italic', fontSize: 36, margin: '0 0 8px', fontWeight: 400 }}>
            {cma.client_first_name} {cma.client_last_name} · {cma.unit_label}
          </h1>
          <div style={{ color: theme.textMuted, fontSize: 14 }}>
            {cma.property_address} ·{' '}
            <a href={`/cma/${cma.public_token}`} target="_blank" rel="noreferrer"
              style={{ color: theme.accent, fontFamily: theme.mono, fontSize: 13 }}>
              /cma/{cma.public_token?.slice(0, 12)}…
            </a>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 40 }}>
          <Stat label="Total views"      value={cma.total_views || 0} />
          <Stat label="Unique sessions"  value={cma.unique_sessions || 0} />
          <Stat label="Client views"     value={cma.client_views || 0} accent={cma.client_views > 0} />
          <Stat label="Total engagement" value={fmt.duration(cma.total_engagement_seconds)} />
        </div>

        <div style={{ color: theme.accent, fontSize: 11, fontFamily: theme.mono,
          letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>View log</div>

        {views.length === 0 ? (
          <div style={{ color: theme.textMuted, fontFamily: theme.mono, fontSize: 14, padding: '32px 0' }}>
            No views yet. Send the link.
          </div>
        ) : views.map((v) => (
          <div key={v.id} style={{
            background: theme.surface, border: `1px solid ${theme.border}`,
            borderLeft: `3px solid ${v.is_client_match ? theme.success : (v.notified_at ? theme.warn : theme.borderHi)}`,
            padding: '14px 18px', borderRadius: 4, marginBottom: 8,
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, fontSize: 12, fontFamily: theme.mono,
          }}>
            <div>
              <div style={{ color: theme.textDim, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Viewer</div>
              <div style={{ color: v.is_client_match ? theme.success : theme.text, marginTop: 2 }}>
                {v.viewer_email || <span style={{ color: theme.textDim }}>anonymous</span>}
              </div>
              <div style={{ color: theme.textDim, fontSize: 10 }}>
                {v.is_client_match ? '✓ verified client' : v.is_authenticated ? 'authenticated' : 'public link'}
              </div>
            </div>
            <div>
              <div style={{ color: theme.textDim, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Engagement</div>
              <div style={{ marginTop: 2 }}>{fmt.duration(v.duration_seconds)} · {v.max_scroll_pct}% scroll</div>
              <div style={{ color: theme.textDim, fontSize: 10 }}>
                {v.mmm_slider_interactions} toggle · {v.comp_clicks} comp clicks
              </div>
            </div>
            <div>
              <div style={{ color: theme.textDim, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>MMM Explored</div>
              <div style={{ marginTop: 2 }}>
                {v.lowest_mmm_price_viewed ? fmt.moneyK(v.lowest_mmm_price_viewed) : '—'}
                {' → '}
                {v.highest_mmm_price_viewed ? fmt.moneyK(v.highest_mmm_price_viewed) : '—'}
              </div>
              <div style={{ color: theme.textDim, fontSize: 10 }}>
                {v.notified_at ? <span style={{ color: theme.warn }}>✓ notified</span> : 'not notified'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: theme.textDim, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Opened</div>
              <div style={{ marginTop: 2 }}>{fmt.dateTime(v.opened_at)}</div>
              <div style={{ color: theme.textDim, fontSize: 10 }}>{v.notification_reason || ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`,
      borderTop: accent ? `3px solid ${theme.accent}` : `1px solid ${theme.border}`,
      padding: '14px 16px', borderRadius: 4 }}>
      <div style={{ color: theme.textMuted, fontSize: 10, fontFamily: theme.mono,
        textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: theme.serif, fontSize: 26, color: accent ? theme.accent : theme.text }}>
        {value}
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ background: theme.bg, color: theme.textMuted, fontFamily: theme.mono,
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
  );
}
