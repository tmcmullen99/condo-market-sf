// src/lib/useCMATracking.js
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

function getOrCreateSessionId(token) {
  const key = 'cma_session_' + token;
  let sid = sessionStorage.getItem(key);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(key, sid);
  }
  return sid;
}

export function useCMATracking(publicToken) {
  const [viewId, setViewId] = useState(null);
  const [isClientMatch, setIsClientMatch] = useState(false);
  const startedAt = useRef(Date.now());
  const stats = useRef({
    duration: 0, scrollPct: 0, mmmInteractions: 0, compClicks: 0,
    mmmLow: null, mmmHigh: null,
  });

  // Page load: open the view, get logged-in user if any
  useEffect(() => {
    if (!publicToken) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('open_cma_view', {
        p_public_token: publicToken,
        p_session_id:   getOrCreateSessionId(publicToken),
        p_viewer_email: user?.email ?? null,
        p_user_agent:   navigator.userAgent,
        p_referrer:     document.referrer || null,
        p_is_authenticated: !!user,
      });
      if (error) { console.error('open_cma_view', error); return; }
      if (data?.ok) {
        setViewId(data.view_id);
        setIsClientMatch(!!data.is_client_match);
      }
    })();
  }, [publicToken]);

  // Scroll tracking
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const pct = Math.min(100, Math.round(
        ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100
      ));
      if (pct > stats.current.scrollPct) stats.current.scrollPct = pct;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Heartbeat every 15s
  useEffect(() => {
    if (!viewId) return;
    const flush = async () => {
      stats.current.duration = Math.round((Date.now() - startedAt.current) / 1000);
      const { error } = await supabase.rpc('update_cma_view_engagement', {
        p_view_id:           viewId,
        p_duration_seconds:  stats.current.duration,
        p_max_scroll_pct:    stats.current.scrollPct,
        p_mmm_interactions:  stats.current.mmmInteractions,
        p_comp_clicks:       stats.current.compClicks,
        p_lowest_mmm_price:  stats.current.mmmLow,
        p_highest_mmm_price: stats.current.mmmHigh,
      });
      if (error) console.error('update_cma_view_engagement', error);
    };
    const interval = setInterval(flush, 15000);
    const onUnload = () => flush();
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', onUnload);
      flush();
    };
  }, [viewId]);

  // Public methods to record interactions
  const recordMMMInteraction = (price) => {
    stats.current.mmmInteractions += 1;
    if (stats.current.mmmLow == null || price < stats.current.mmmLow)   stats.current.mmmLow  = price;
    if (stats.current.mmmHigh == null || price > stats.current.mmmHigh) stats.current.mmmHigh = price;
  };
  const recordCompClick = () => { stats.current.compClicks += 1; };

  return { viewId, isClientMatch, recordMMMInteraction, recordCompClick };
}
