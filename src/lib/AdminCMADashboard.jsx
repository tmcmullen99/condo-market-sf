// src/pages/AdminCMADashboard.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { theme, fmt } from '@/lib/cmaTheme';

export default function AdminCMADashboard() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('v_cma_activity_dashboard').select('*');
      setRows(data || []);
    })();
  }, []);

  if (rows === null) return <Center>Loading CMAs…</Center>;

  const filtered = rows.filter(r => {
    if (filter === 'engaged') return (r.total_views || 0) > 0;
    if (filter === 'client_viewed') return (r.client_views || 0) > 0;
    return true;
  });

  return (
    <div style={{ background: theme.bg, color: theme.text, fontFamily: theme.sans, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: 11, fontFamily: theme.mono,
          letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Listings · CMAs</div>
        <h1 style={{ fontFamily: theme.serif, fontStyle: 'italic', fontSize: 40, margin: '0 0 8px', fontWeight: 400 }}>
          CMA activity
        </h1>
        <p style={{ color: theme.textMuted, marginBottom: 24, fontSize: 14 }}>
          All published CMAs and who's reviewing them.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <FilterPill active={filter === 'all'}           onClick={() => setFilter('all')}           label="All"            count={rows.length} />
          <FilterPill active={filter === 'engaged'}       onClick={() => setFilter('engaged')}       label="Has views"      count={rows.filter(r => (r.total_views || 0) > 0).length} />
          <FilterPill active={filter === 'client_viewed'} onClick={() => setFilter('client_viewed')} label="Client viewed"  count={rows.filter(r => (r.client_views || 0) > 0).length} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ color: theme.textMuted, fontFamily: theme.mono, fontSize: 14, padding: '32px 0' }}>
            No CMAs match this filter.
          </div>
        ) : filtered.map((r) => {
          const hot = (r.client_views || 0) > 0;
          const warm = !hot && (r.total_views || 0) > 0;
          const borderColor = hot ? theme.success : warm ? theme.warn : theme.border;
          return (
            <Link key={r.cma_id} to={`/admin/cma/${r.cma_id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: theme.surface, border: `1px solid ${theme.border}`,
                borderLeft: `3px solid ${borderColor}`,
                padding: '16px 20px', borderRadius: 4, marginBottom: 10,
                display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 16,
                alignItems: 'center', cursor: 'pointer',
              }}>
                <div>
                  <div style={{ fontFamily: theme.serif, fontSize: 17 }}>
                    {r.client_first_name} {r.client_last_name}
                    <span style={{ color: theme.textMuted, fontSize: 13, fontFamily: theme.mono, marginLeft: 8 }}>
                      {r.unit_label}
                    </span>
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: 12, fontFamily: theme.mono, marginTop: 2 }}>
                    {r.client_email || <span style={{ color: theme.danger }}>no email</span>}
                  </div>
                </div>
                <div>
                  <div style={{ color: theme.textDim, fontSize: 11, fontFamily: theme.mono,
                    textTransform: 'uppercase', letterSpacing: 1 }}>List</div>
                  <div style={{ fontFamily: theme.mono, fontSize: 14, color: theme.accent }}>
                    {fmt.money(r.recommended_list_price)}
                  </div>
                  <div style={{ color: theme.textDim, fontSize: 11, fontFamily: theme.mono }}>
                    {(r.service_tier || '').replace('_', ' ')}
                  </div>
                </div>
                <div>
                  <div style={{ color: theme.textDim, fontSize: 11, fontFamily: theme.mono,
                    textTransform: 'uppercase', letterSpacing: 1 }}>Activity</div>
                  <div style={{ fontFamily: theme.mono, fontSize: 13 }}>
                    {r.total_views || 0} views ·{' '}
                    <span style={{ color: hot ? theme.success : theme.textMuted }}>
                      {r.client_views || 0} client
                    </span>
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: 11, fontFamily: theme.mono }}>
                    {fmt.duration(r.total_engagement_seconds)} engaged · {r.max_scroll_pct || 0}% scroll
                  </div>
                </div>
                <div style={{ color: theme.textDim, fontFamily: theme.mono, fontSize: 11, textAlign: 'right' }}>
                  {r.last_view_at ? fmt.dateTime(r.last_view_at) : <span style={{ color: theme.textDim }}>never opened</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FilterPill({ label, count, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 999,
      background: active ? theme.accent : 'transparent',
      color: active ? theme.bg : theme.textMuted,
      border: `1px solid ${active ? theme.accent : theme.border}`,
      fontFamily: theme.mono, fontSize: 12, cursor: 'pointer',
      letterSpacing: 0.5, textTransform: 'lowercase',
    }}>
      {label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
    </button>
  );
}

function Center({ children }) {
  return (
    <div style={{ background: theme.bg, color: theme.textMuted, fontFamily: theme.mono,
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
  );
}
