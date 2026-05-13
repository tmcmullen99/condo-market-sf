// Cloudflare Pages Function — handles /buildings/{slug}
// Tries the static HTML file first (existing hand-coded buildings keep working).
// On 404, proxies to the Supabase building-page edge function with explicit
// Content-Type so the browser renders the HTML (rather than displaying source).
//
// Path: functions/buildings/[slug].js

const SUPABASE_BUILDING_PAGE = 'https://kfqphwerygccpzntbbif.supabase.co/functions/v1/building-page';

export async function onRequest(context) {
  const { next, params } = context;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  // 1. Try the static asset / existing route first
  const staticResp = await next();
  if (staticResp.status !== 404) {
    return staticResp;
  }

  // 2. No static file → fetch from Supabase building-page renderer
  const upstreamUrl = `${SUPABASE_BUILDING_PAGE}?slug=${encodeURIComponent(slug)}`;
  const upstream = await fetch(upstreamUrl);

  // 3. Read body as text and return with EXPLICIT headers.
  //    Do NOT pass through upstream headers — Cloudflare's response
  //    transformation can strip Content-Type. Setting it ourselves is
  //    the only reliable way to get the browser to render HTML.
  const body = await upstream.text();

  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  headers.set('X-Building-Source', 'cmsf-dynamic-v2');

  return new Response(body, { status: upstream.status, headers });
}
