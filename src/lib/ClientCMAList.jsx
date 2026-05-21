// src/pages/ClientCMAList.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { theme, fmt } from '@/lib/cmaTheme';

export default function ClientCMAList() {
  const [cmas, setCmas]   = useState(null);
  const [user, setUser]   = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) { setCmas([]); return; }
      const { data } = await supabase
        .from('v_client_cmas').select('*')
        .ilike('client_email', user.email)
        .order('created_at', { ascending: false });
      setCmas(data || []);
    })();
  }, []);

  if (cmas === null) return <Center>Loading…</Center>;
  if (!user)         return <Center>Please sign in to view your CMAs.</Center>;

  return (
    <div style={{ background: theme.bg, color: theme.text, fontFamily: theme.sans, minHeight: '100vh', padding: '48px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: 11, fontFamily: theme.mono,
          letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Your account</div>
        <h1 style={{ fontFamily: theme.serif, fontStyle: 'italic', fontSize: 40, margin: '0 0 32px', fontWeight: 400 }}>
          Your CMAs
        </h1>

        {cmas.length === 0 ? (
          <div style={{ color: theme.textMuted, fontFamily: theme.mono, fontSize: 14, padding: '32px 0' }}>
            No CMAs yet. Your broker will create one and it'll appear here.
          </div>
        ) : (
          cmas.map((c) => (
            <Link key={c.id} to={`/cma/${c.public_token}`}
              style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: theme.surface, border: `1px solid ${theme.border}`,
                borderLeft: `3px solid ${theme.accent}`,
                padding: '18px 20px', borderRadius: 4, marginBottom: 12,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer', transition: 'border-color 0.15s',
              }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.borderHi}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}>
                <div>
                  <div style={{ fontFamily: theme.serif, fontSize: 20, marginBottom: 4 }}>
                    {c.property_address}
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: 13, fontFamily: theme.mono }}>
                    {c.unit_label} · {c.bedrooms}bd/{c.baths}ba · {c.sqft?.toLocaleString()} sqft ·{' '}
                    <span style={{ color: theme.accent }}>{(c.service_tier||'').replace('_',' ')}</span>
                    {c.client_last_viewed_at && <> · last viewed {fmt.dateTime(c.client_last_viewed_at)}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: theme.serif, fontSize: 22, color: theme.accent }}>
                    {fmt.money(c.recommended_list_price)}
                  </div>
                  <div style={{ color: theme.textDim, fontSize: 11, fontFamily: theme.mono }}>
                    review →
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ background: theme.bg, color: theme.textMuted, fontFamily: theme.mono,
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}
