// Cloudflare Pages Function — handles /buildings/{slug}
// Tries the static HTML file first (existing hand-coded buildings keep working).
// On 404, falls through to the Supabase building-page edge function (new
// data-driven buildings).
//
// Deploy: commit this file at functions/buildings/[slug].js
// CF Pages will auto-detect and route /buildings/* through this handler.

const SUPABASE_BUILDING_PAGE = 'https://kfqphwerygccpzntbbif.supabase.co/functions/v1/building-page';

export async function onRequest(context) {
  const { request, next, params } = context;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  // 1. Try the static asset / existing route first
  const staticResp = await next();
  if (staticResp.status !== 404) {
    return staticResp;
  }

  // 2. No static file → fetch from Supabase building-page renderer
  const upstreamUrl = `${SUPABASE_BUILDING_PAGE}?slug=${encodeURIComponent(slug)}`;
  const upstream = await fetch(upstreamUrl, {
    cf: { cacheTtl: 300, cacheEverything: true }
  });

  // 3. Pass through with our own cache + identifying headers
  const headers = new Headers(upstream.headers);
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  headers.set('X-Building-Source', 'cmsf-dynamic');
  headers.delete('content-encoding'); // CF re-encodes

  return new Response(upstream.body, { status: upstream.status, headers });
}
