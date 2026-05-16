// Cloudflare Pages Function — handles /partners/{slug} and /partners/{slug}/
// Always serves /partners/index.html so the SPA can extract the slug from
// window.location.pathname client-side. The browser URL stays unchanged.
//
// Path: functions/partners/[slug].js
//
// Why a Function rather than _redirects: in CF Pages projects with Functions
// configured (e.g. functions/buildings/[slug].js), _redirects rewrites for
// paths overlapping with the Functions namespace behave unreliably. Functions
// run first and deterministically.

export async function onRequest({ env, request }) {
  const url = new URL(request.url);
  url.pathname = '/partners/index.html';

  const resp = await env.ASSETS.fetch(new Request(url.toString(), request));
  const body = await resp.text();

  // Force explicit Content-Type so the browser renders HTML — same defensive
  // pattern as functions/buildings/[slug].js (Cloudflare can strip Content-Type
  // on response transformation).
  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  headers.set('X-Partner-Source', 'cmsf-partner-fn-v1');

  return new Response(body, { status: resp.status, headers });
}
