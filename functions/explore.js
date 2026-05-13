// Cloudflare Pages Function — proxies /explore to the dynamic buildings directory.
// Path: functions/explore.js

const SUPABASE_INDEX = 'https://kfqphwerygccpzntbbif.supabase.co/functions/v1/buildings-index';

export async function onRequest() {
  const upstream = await fetch(SUPABASE_INDEX);
  const body = await upstream.text();

  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=120, s-maxage=120');
  headers.set('X-Content-Source', 'buildings-index-proxy');

  return new Response(body, { status: upstream.status, headers });
}
