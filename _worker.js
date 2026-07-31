/* ============================================================
   CITY MARKETS — _worker.js (Cloudflare Pages Advanced Mode; one worker, every market)
   Server-renders:
     /tracts/            tract index hub
     /streets/           street index hub
     /tract/{slug}/      729 tract pages
     /street/{slug}/     498 street pages
     /home/{slug}/       6,609 address pages
   Everything else falls through to static assets (env.ASSETS).
   Data: /assets/cb-props.json + cb-tracts.json + cb-streets.json,
   memoized per isolate.
   ============================================================ */

/* ---------- CITY MARKETS registry (A4) ----------
   ONE worker serves every market. The market is resolved from the request
   hostname with a hard Campbell fallback. Adding a city = one entry here
   (+ market_config/market_settings rows + per-market /assets/<prefix>* files
   + attach the apex domain to this same Pages project). */
const MARKETS_BY_HOST = {
  'campbellrealestatemarket.com': {
    id: 1, slug: 'campbell-market', name: 'The Campbell Market', city: 'Campbell',
    zip: '95008', zips: ['95008'], zipsLabel: '95008', county: 'Santa Clara',
    domain: 'campbellrealestatemarket.com', assetPrefix: 'cb-',
    center: [37.2872, -121.95],
    agent: { first: 'Tim', name: 'Tim McMullen', dre: '02016832', reviewImg: '/assets/tim-review.jpg' },
    nickname: 'The Orchard City',
    ogImage: '/assets/og-campbell.png', heroImage: '/assets/hero-campbell.jpg',
    creditUsd: 10000,
    priceBand: { min: 600000, max: 3250000, default: 1725000, step: 25000 },
    mmmTeaser: { ex: '21 N 2nd St #406', mask: '$1,4██,███' },
  },
  'losgatosrealestatemarket.com': {
    id: 2, slug: 'losgatos-market', name: 'The Los Gatos Market', city: 'Los Gatos',
    zip: '95030', zips: ['95030','95032','95033'], zipsLabel: '95030/95032/95033', county: 'Santa Clara',
    domain: 'losgatosrealestatemarket.com', assetPrefix: 'lg-',
    center: [37.2266, -121.9747],
    agent: { first: 'Tim', name: 'Tim McMullen', dre: '02016832', reviewImg: '/assets/tim-review.jpg' },
    nickname: 'Gem City of the Foothills',
    ogImage: '/assets/og-los-gatos.png', heroImage: '/assets/hero-los-gatos.jpg',
    creditUsd: 10000,
    priceBand: { min: 600000, max: 5250000, default: 2200000, step: 50000 },
  },
  'saratogarealestatemarket.com': {
    id: 3, slug: 'saratoga-market', name: 'The Saratoga Market', city: 'Saratoga',
    zip: '95070', zips: ['95070'], zipsLabel: '95070', county: 'Santa Clara',
    domain: 'saratogarealestatemarket.com', assetPrefix: 'sr-',
    center: [37.2638, -122.0230],
    agent: { first: 'Tim', name: 'Tim McMullen', dre: '02016832', reviewImg: '/assets/tim-review.jpg' },
    nickname: 'Historic Estate-Style Living',
    ogImage: '/assets/og-saratoga.png', heroImage: '/assets/hero-saratoga.jpg',
    creditUsd: 10000,
    priceBand: { min: 1100000, max: 6500000, default: 3725000, step: 50000 },
  },
  'penngroverealestatemarket.com': {
    id: 4, slug: 'penngrove-market', name: 'The Penngrove Market', city: 'Penngrove',
    zip: '94951', zips: ['94951'], zipsLabel: '94951', county: 'Sonoma',
    domain: 'penngroverealestatemarket.com', assetPrefix: 'pg-',
    center: [38.2996, -122.6664],
    agent: { first: 'Jake', name: 'Jake Taylor', dre: '02070119' },
    nickname: 'The Biggest Little Town',
    ogImage: '/assets/og-penngrove.png', heroImage: '/assets/hero-penngrove.jpg',
    creditUsd: 5000,
    priceBand: { min: 500000, max: 2250000, default: 1100000, step: 25000 },
    segmentation: { axis: 'lot' },
    unincorporated: true,
  },
};
const DEFAULT_MARKET_HOST = 'campbellrealestatemarket.com';
function resolveMarket(hostname) {
  const bare = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return MARKETS_BY_HOST[bare] || MARKETS_BY_HOST[DEFAULT_MARKET_HOST];
}
// Current request's market. Set FIRST THING in fetch(); read by the synchronous
// render functions. Async functions take M as a parameter instead (race-safe).
let M = MARKETS_BY_HOST[DEFAULT_MARKET_HOST];



function homepage() { return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${M.name} — Every Home in ${M.city}, CA ${M.zipsLabel}, Indexed and Analyzed</title>
<meta name="description" content="The complete record of ${M.city}, California real estate: ${mktDerived().homes.toLocaleString('en-US')} homes, ${mktDerived().streets} streets, and ${mktDerived().named} named tracts in ${M.zipsLabel} — every sale, every value, every neighborhood, indexed and analyzed.">
<link rel="canonical" href="https://${M.domain}/">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${M.name}">
<meta property="og:title" content="${M.name} — Every Home in ${M.city}, CA ${M.zipsLabel}">
<meta property="og:description" content="The complete public record of one community's real estate — every parcel indexed, every sale on file, every neighborhood measured. Not a portal. A ledger.">
<meta property="og:url" content="https://${M.domain}/">
<meta property="og:image" content="https://${M.domain}${M.ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://${M.domain}${M.ogImage}">
<meta property="og:description" content="Every home in ${M.city}, CA. Every street. Every tract. Indexed and analyzed.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://${M.domain}/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css">
<style>
/* ============================================================
   ${M.name.toUpperCase()} — v2 skin
   Structure mirrors Eichler Market / SFCM: dark chrome (nav,
   ticker, footer) over light editorial content, ${M.city}'s
   orchard-apricot accent. Playfair Display + DM Sans + JetBrains Mono.
   ============================================================ */
:root{
  /* light content */
  --bg:#faf8f3;
  --bg-2:#f3eee4;
  --card:#ffffff;
  --card-2:#f5f0e6;
  --line:#e8e1d2;
  --ivory:#22262f;            /* primary ink (kept var name for compatibility) */
  --ivory-dim:#4c5261;
  --slate:#5d6575;
  --slate-dim:#989fac;
  --apricot:#b06f24;          /* accent on light */
  --apricot-soft:#d99a4e;     /* fills, bars, buttons */
  /* dark chrome */
  --chrome:#12151d;
  --chrome-2:#0c0f15;
  --chrome-line:#262c3a;
  --chrome-ink:#ece7db;
  --chrome-soft:#93a3b8;
  --nav-h:56px;
  --max:1180px;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{overflow-x:clip;background:var(--bg);color:var(--ivory);font-family:'DM Sans',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}

h1,h2,h3,.serif{font-family:'Playfair Display',Georgia,serif;font-weight:500;line-height:1.15}
h1 em,h2 em,.serif em{font-style:italic;color:var(--apricot)}
.eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.68rem;letter-spacing:.18em;text-transform:uppercase;color:var(--apricot);display:block;margin-bottom:14px}
.sub{color:var(--slate);max-width:56ch}

.wrap{max-width:var(--max);margin:0 auto;padding:0 24px}
section{padding:88px 0}
.section-head{margin-bottom:44px}
.section-head h2{font-size:clamp(1.7rem,3.4vw,2.5rem);max-width:24ch}

/* ---------- nav (dark chrome) ---------- */
.nav{position:fixed;top:0;left:0;right:0;height:var(--nav-h);z-index:900;display:flex;align-items:center;background:rgba(18,21,29,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--chrome-line);color:var(--chrome-ink)}
.nav-inner{max-width:var(--max);margin:0 auto;padding:0 24px;width:100%;display:flex;align-items:center;gap:28px}
.wordmark{font-family:'Playfair Display',serif;font-size:1.06rem;letter-spacing:.01em;white-space:nowrap;color:var(--chrome-ink)}
.wordmark b{font-weight:600}
.wordmark .tag{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.16em;color:var(--apricot-soft);vertical-align:super;margin-left:4px}
.nav-links{display:flex;gap:22px;margin-left:auto}
.nav-links a{font-size:.86rem;color:var(--chrome-soft);transition:color .15s}
.nav-links a:hover{color:var(--chrome-ink)}
.nav-right{display:flex;align-items:center;gap:14px}
.nav-cta{font-size:.82rem;font-weight:600;color:#171310;background:var(--apricot-soft);padding:8px 16px;border-radius:999px;white-space:nowrap;transition:background .15s}
.nav-cta:hover{background:#e8b878}
.burger{display:none;background:none;border:0;cursor:pointer;padding:8px;margin-left:auto;flex:0 0 auto}
.burger span{display:block;width:20px;height:2px;background:var(--chrome-ink);margin:4px 0}
.drawer{display:none;position:fixed;top:var(--nav-h);left:0;right:0;background:var(--chrome-2);border-bottom:1px solid var(--chrome-line);z-index:899;padding:18px 24px 26px;flex-direction:column;gap:4px}
.drawer.open{display:flex}
.drawer a{padding:11px 0;border-bottom:1px solid var(--chrome-line);font-size:.95rem;color:var(--chrome-soft)}
.drawer a:last-child{border-bottom:0}
.drawer .nav-cta{margin-top:14px;text-align:center;color:#171310}

/* ---------- live sold ticker (dark chrome) ---------- */
.ticker{position:fixed;top:var(--nav-h);left:0;right:0;height:34px;z-index:890;background:var(--chrome-2);border-bottom:1px solid var(--chrome-line);overflow:hidden;display:none;align-items:center}
.ticker.on{display:flex}
.ticker-label{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:0 16px;font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;color:var(--chrome-soft);text-transform:uppercase;border-right:1px solid var(--chrome-line);height:100%;background:var(--chrome-2);position:relative;z-index:2;white-space:nowrap}
.ticker-label .dot{width:7px;height:7px;border-radius:50%;background:#4ade80;animation:cbpulse 2s infinite}
@keyframes cbpulse{0%,100%{opacity:1}50%{opacity:.35}}
.ticker-track{display:flex;gap:44px;white-space:nowrap;animation:cbtick 55s linear infinite;padding-left:22px;will-change:transform}
.ticker:hover .ticker-track{animation-play-state:paused}
@keyframes cbtick{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.tick-item{display:flex;align-items:baseline;gap:9px;font-size:.78rem;color:var(--chrome-soft);flex:0 0 auto}
.tick-item .js{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;color:#5d6b80;text-transform:uppercase}
.tick-item a{color:var(--chrome-ink)}
.tick-item a:hover{color:var(--apricot-soft)}
.tick-item .pr{font-family:'Playfair Display',serif;font-style:italic;color:var(--apricot-soft);font-size:.9rem}
@media (prefers-reduced-motion:reduce){.ticker-track{animation:none}}
body.has-ticker .hero-inner{padding-top:178px}
body.has-ticker .page-hero{padding-top:170px}

/* ---------- hero (photo + dark overlay, chrome ink) ---------- */
.hero{min-height:96svh;display:flex;align-items:flex-end;position:relative;overflow:hidden;color:var(--chrome-ink);background:
  radial-gradient(1100px 520px at 82% -10%,rgba(217,154,78,.14),transparent 60%),
  linear-gradient(180deg,rgba(12,15,21,.78) 0%,rgba(12,15,21,.55) 45%,rgba(12,15,21,.92) 100%),
  url('${M.heroImage}') center 38%/cover no-repeat,
  var(--chrome)}
.hero::before{content:"";position:absolute;inset:0;background-image:
  linear-gradient(rgba(236,231,219,.25) 1px,transparent 1px),
  linear-gradient(90deg,rgba(236,231,219,.25) 1px,transparent 1px);
  background-size:72px 72px;opacity:.07;mask-image:radial-gradient(ellipse at 70% 30%,black 0%,transparent 70%)}
.hero .eyebrow{color:var(--apricot-soft)}
.hero h1 em{color:var(--apricot-soft)}
.hero .sub{color:#c6cbd6}
.hero-inner{position:relative;padding-top:150px;padding-bottom:64px;width:100%}
.hero h1{font-size:calc(clamp(2.3rem,5.6vw,4.1rem) * var(--hs,1));max-width:17ch;margin:0 0 20px}
.hero-city{white-space:nowrap}
.hero .sub{font-size:1.06rem;margin-bottom:34px}
.hero-ctas{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:56px}
.btn{display:inline-block;padding:13px 26px;border-radius:999px;font-size:.92rem;font-weight:600;transition:background .15s,border-color .15s;cursor:pointer}
.btn-gold{background:var(--apricot-soft);color:#171310;border:0}
.btn-gold:hover{background:#e8b878}
.btn-line{border:1px solid rgba(236,231,219,.4);color:var(--chrome-ink)}
.btn-line:hover{border-color:var(--chrome-ink)}
.ledger{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(236,231,219,.22)}
.ledger div{padding:22px 18px 4px;border-left:1px solid rgba(236,231,219,.22)}
.ledger div:first-child{border-left:0;padding-left:0}
.ledger .n{font-family:'Playfair Display',serif;font-size:clamp(1.5rem,3vw,2.2rem);color:var(--chrome-ink)}
.ledger .l{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--chrome-soft);margin-top:6px}

/* ---------- map ---------- */
.map-section{padding-top:88px}
#cbmap{height:560px;border:1px solid var(--line);border-radius:10px;background:var(--bg-2)}
.map-note{font-size:.8rem;color:var(--slate-dim);margin-top:12px}
.leaflet-container{font-family:'DM Sans',sans-serif}
.iz-tract-grid{display:grid;grid-template-columns:1fr;gap:16px}
@media(min-width:960px){.iz-tract-grid{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
#izTractMap{height:440px;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#efece4}
@media(max-width:700px){#izTractMap{height:320px}}
.leaflet-top,.leaflet-bottom{z-index:400!important}
.leaflet-popup-content-wrapper{background:var(--card);color:var(--ivory);border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 40px rgba(28,26,20,.18)}
.leaflet-popup-tip{background:var(--card)}
.leaflet-popup-content{margin:14px 16px;line-height:1.45}
.pp-imgwrap{display:block;width:100%;height:150px;overflow:hidden;border-radius:6px;margin-bottom:9px;background:var(--card-2)}
.pp-imgwrap img{width:100%;height:100%;object-fit:cover;display:block}
.pp-a{font-family:'Playfair Display',serif;font-size:1.02rem;margin-bottom:2px;color:var(--ivory)}
.pp-m{font-family:'JetBrains Mono',monospace;font-size:.64rem;letter-spacing:.08em;color:var(--slate);text-transform:uppercase}
.pp-s{color:var(--apricot);font-weight:600;margin-top:6px;font-size:.9rem}
.pp-link{display:inline-block;margin-top:8px;color:var(--apricot);font-size:.82rem;font-weight:600}
.marker-cluster-small,.marker-cluster-medium,.marker-cluster-large{background:rgba(217,154,78,.3)!important}
.marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div{background:rgba(176,111,36,.92)!important;color:#fff!important;font-weight:600;font-family:'DM Sans',sans-serif}

/* ---------- stat tiles ---------- */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px 22px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.tile .n{font-family:'Playfair Display',serif;font-size:1.9rem}
.tile .l{font-size:.82rem;color:var(--slate);margin-top:4px}

/* ---------- tract grid ---------- */
.tract-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:14px}
.tract-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px;transition:border-color .15s,transform .15s,box-shadow .15s;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.tract-card:hover{border-color:var(--apricot-soft);transform:translateY(-2px);box-shadow:0 8px 24px rgba(28,26,20,.08)}
.tract-card h3{font-size:1.14rem;margin-bottom:8px}
.tract-card .meta{font-family:'JetBrains Mono',monospace;font-size:.64rem;letter-spacing:.1em;text-transform:uppercase;color:var(--slate-dim);margin-bottom:12px}
.tract-card .mv{color:var(--apricot);font-weight:600;font-size:.94rem}
.tract-card .mv span{color:var(--slate);font-weight:400;font-size:.8rem}

/* ---------- split / method card ---------- */
.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start}
.method-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:30px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.method-card p{color:var(--slate);font-size:.94rem;margin-bottom:14px}
.method-card p:last-child{margin-bottom:0}

/* ---------- capture forms ---------- */
form.cb-capture{display:flex;flex-direction:column;gap:10px;margin-top:16px}
form.cb-capture input,form.cb-capture textarea{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px 14px;color:var(--ivory);font-family:'DM Sans',sans-serif;font-size:.92rem;width:100%}
form.cb-capture input:focus,form.cb-capture textarea:focus{outline:none;border-color:var(--apricot-soft)}
form.cb-capture textarea{min-height:74px;resize:vertical}
form.cb-capture button{border:0;cursor:pointer}
.cb-ok{color:var(--ivory);font-size:.95rem}
.cb-err{color:#b3452e;font-size:.84rem}

/* ---------- measured / intelligence modules ---------- */
.mz-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:900px){.mz-grid{grid-template-columns:1fr}}
.mz-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:26px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.mz-eyebrow{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--apricot);display:flex;align-items:center;gap:8px;margin-bottom:6px}
.mz-eyebrow .dot{width:7px;height:7px;border-radius:50%;background:#3fbf6f;animation:cbpulse 2s infinite}
.mz-sub{font-size:.85rem;color:var(--slate-dim);margin-bottom:18px}
.feed-row{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:12px 0;border-bottom:1px solid var(--line)}
.feed-row:last-child{border-bottom:0}
.feed-row .fa{font-family:'Playfair Display',serif;font-size:1.02rem}
.feed-row .fa a{color:var(--ivory)}.feed-row .fa a:hover{color:var(--apricot)}
.feed-row .fm{font-size:.78rem;color:var(--slate-dim);margin-top:2px}
.feed-row .fp{font-family:'Playfair Display',serif;font-size:1.05rem;color:var(--apricot);white-space:nowrap}
.feed-row .fd{font-size:.72rem;color:var(--slate-dim);text-align:right}
.mz-chart svg{width:100%;height:auto;display:block}
.mz-chart .cap{display:flex;justify-content:space-between;font-size:.78rem;color:var(--slate-dim);margin-top:10px}
.mz-chart .cap b{font-family:'Playfair Display',serif;font-style:italic;color:var(--apricot);font-weight:500;font-size:.95rem}
.mz-delta{font-size:.76rem;color:#2f9e5c;margin-left:auto}
.rank-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.pillbar{display:flex;gap:6px;flex-wrap:wrap}
.pill-t{border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:.76rem;color:var(--slate);cursor:pointer;background:var(--card);font-family:'DM Sans',sans-serif}
.pill-t.on{background:var(--ivory);color:#fff;border-color:var(--ivory);font-weight:600}
.rank-row{display:grid;grid-template-columns:22px minmax(120px,200px) 1fr auto auto;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:.86rem}
.rank-row:last-child{border-bottom:0}
.rank-row .ri{font-family:'JetBrains Mono',monospace;font-size:.66rem;color:var(--slate-dim)}
.rank-row .rn a{color:var(--ivory)}.rank-row .rn a:hover{color:var(--apricot)}
.rank-row .rbar{height:6px;border-radius:3px;background:var(--card-2);overflow:hidden}
.rank-row .rbar i{display:block;height:100%;background:linear-gradient(90deg,var(--apricot-soft),#e8b878);border-radius:3px}
.rank-row .rv{font-family:'JetBrains Mono',monospace;font-size:.74rem;color:var(--apricot);white-space:nowrap}
.rank-row .rc{font-size:.7rem;color:var(--slate-dim);white-space:nowrap}
@media(max-width:640px){.rank-row{grid-template-columns:18px 1fr auto}.rank-row .rbar,.rank-row .rc{display:none}}
.insight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:16px}
.insight-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.insight-card h3{font-size:1.16rem;margin:6px 0 10px}
.insight-card p{font-size:.88rem;color:var(--slate)}
.insight-card p b{color:var(--ivory)}
.insight-card .bedrow{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:.88rem;color:var(--slate)}
.insight-card .bedrow:last-child{border-bottom:0}
.insight-card .bedrow b{font-family:'Playfair Display',serif;color:var(--ivory);font-weight:500}
.cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:700px){.cmp-grid{grid-template-columns:1fr}}
select.cb-select{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 12px;color:var(--ivory);font-family:'DM Sans',sans-serif;font-size:.9rem;margin-bottom:14px}
.cmp-stat{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:.88rem;color:var(--slate)}
.cmp-stat:last-child{border-bottom:0}
.cmp-stat b{font-family:'Playfair Display',serif;color:var(--ivory);font-weight:500}
.horizon-note{font-size:.72rem;color:var(--slate-dim);margin-top:10px}

/* ---------- live dot + active listings ---------- */
.live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#4ade80;margin-right:6px;vertical-align:1px;animation:cbpulse 2s infinite}
.listing-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.listing-card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(28,26,20,.04);transition:transform .15s,box-shadow .15s,border-color .15s;display:block}
.listing-card:hover{transform:translateY(-2px);border-color:var(--apricot-soft);box-shadow:0 10px 28px rgba(28,26,20,.1)}
.listing-card .ph{height:200px;background:var(--card-2);overflow:hidden}
.listing-card .ph img{width:100%;height:100%;object-fit:cover;display:block}
.listing-card .bd{padding:18px 20px 20px}
.listing-card .pr{font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ivory)}
.listing-card .pr .st{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#2f9e5c;margin-left:10px;vertical-align:3px}
.listing-card .ad{font-size:.98rem;color:var(--ivory);margin-top:4px}
.listing-card .sp{font-size:.8rem;color:var(--slate-dim);margin-top:4px}
.listing-card .tr{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:var(--apricot);margin-top:10px}
.filter-bar{display:flex;gap:26px;flex-wrap:wrap;margin:6px 0 30px;padding:18px 22px;background:var(--card);border:1px solid var(--line);border-radius:14px}
.filter-group .fl{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--slate-dim);margin-bottom:8px}
.filter-empty{color:var(--slate);padding:26px;border:1px dashed var(--line);border-radius:12px;font-size:.92rem}

/* ---------- active listings v2 ---------- */
.al-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:22px}
.al-count{font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim)}
.al-count b{color:var(--apricot);font-size:.8rem}
select.al-sort{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:9px 36px 9px 16px;color:var(--ivory);font-family:'DM Sans',sans-serif;font-size:.82rem;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23b06f24' fill='none' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;cursor:pointer}
.al-spot{display:grid;grid-template-columns:1.25fr 1fr;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;margin-bottom:34px;box-shadow:0 2px 6px rgba(28,26,20,.05)}
@media(max-width:860px){.al-spot{grid-template-columns:1fr}}
.al-spot .ph{position:relative;min-height:340px;background:var(--card-2);overflow:hidden}
.al-spot .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
.al-spot:hover .ph img{transform:scale(1.04)}
.al-spot .bd{padding:36px;display:flex;flex-direction:column;justify-content:center}
.al-spot .fk{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:var(--apricot);margin-bottom:12px}
.al-spot .pr{font-family:'Playfair Display',serif;font-size:2.6rem;line-height:1}
.al-spot .ad{font-family:'Playfair Display',serif;font-size:1.3rem;margin:12px 0 6px}
.al-spot .sp{font-size:.9rem;color:var(--slate)}
.al-spot .ctas{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
.price-chip{position:absolute;left:14px;bottom:14px;background:rgba(12,15,21,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:var(--chrome-ink);border-radius:999px;padding:7px 14px;font-family:'Playfair Display',serif;font-size:1.02rem;display:flex;align-items:center;gap:8px;z-index:2}
.price-chip .dot{width:7px;height:7px;border-radius:50%;background:#4ade80;animation:cbpulse 2s infinite}
.listing-card .ph{position:relative}
.listing-card .ph img{transition:transform .45s ease}
.listing-card:hover .ph img{transform:scale(1.05)}
.listing-card .bd .tr{transition:letter-spacing .2s ease}
.listing-card:hover .bd .tr{letter-spacing:.18em}
.listing-card{animation:al-in .45s ease both}
@keyframes al-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.listing-card{animation:none}.al-spot .ph img,.listing-card .ph img{transition:none}}

/* ---------- off-market locked showcase ---------- */
.om-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.om-card{background:rgba(236,231,219,.05);border:1px solid rgba(236,231,219,.16);border-radius:14px;padding:22px;position:relative;overflow:hidden}
.om-card .om-ad{font-family:'Playfair Display',serif;font-size:1.15rem;color:var(--chrome-ink)}
.om-card .om-sp{font-size:.8rem;color:var(--chrome-soft);margin-top:4px}
.om-card .om-lock{display:flex;align-items:center;justify-content:space-between;margin-top:18px;padding-top:16px;border-top:1px solid rgba(236,231,219,.14)}
.om-card .om-blur{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--apricot-soft);filter:blur(5px);user-select:none;letter-spacing:1px}
.om-card .om-tag{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--apricot-soft);white-space:nowrap}

/* ---------- listing detail (/for-sale/) ---------- */
.ld-gallery{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:8px}
.ld-main{position:relative;border-radius:16px;overflow:hidden;background:var(--card-2);aspect-ratio:3/2}
.ld-main img{width:100%;height:100%;object-fit:cover;display:block}
.ld-main .price-chip{font-size:1.2rem;padding:9px 18px}
.ld-count{position:absolute;right:14px;bottom:14px;background:rgba(12,15,21,.78);backdrop-filter:blur(6px);color:var(--chrome-ink);border-radius:999px;padding:6px 13px;font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.08em}
.ld-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.ld-thumbs button{border:2px solid transparent;border-radius:10px;overflow:hidden;padding:0;cursor:pointer;background:var(--card-2);aspect-ratio:4/3}
.ld-thumbs button img{width:100%;height:100%;object-fit:cover;display:block;opacity:.82;transition:opacity .15s}
.ld-thumbs button:hover img{opacity:1}
.ld-thumbs button.on{border-color:var(--apricot)}
.ld-thumbs button.on img{opacity:1}
.ld-head{display:flex;justify-content:space-between;gap:22px;align-items:flex-start;flex-wrap:wrap;margin:26px 0 6px}
.ld-price{font-family:'Playfair Display',serif;font-size:clamp(2rem,4.5vw,3rem);line-height:1}
.ld-addr{font-family:'Playfair Display',serif;font-size:clamp(1.2rem,2.4vw,1.6rem);margin-top:8px}
.ld-sub{color:var(--slate);font-size:.92rem;margin-top:6px}
.ld-specband{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin:26px 0}
.ld-specband .sv{font-family:'Playfair Display',serif;font-size:1.5rem}
.ld-specband .sl{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim);margin-top:4px}
.ld-remarks{background:var(--card);border-left:3px solid var(--apricot-soft);border-radius:0 12px 12px 0;padding:20px 24px;margin:8px 0 26px;font-size:1rem;color:var(--ivory);font-style:italic;max-width:70ch}
.ld-remarks .src{display:block;font-style:normal;font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim);margin-top:10px}
.ld-context{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:10px 0 26px}
@media(max-width:700px){.ld-thumbs{grid-template-columns:repeat(4,1fr)}.ld-main{aspect-ratio:4/3}}

/* ---------- chart hover ---------- */
#mzChart,#izChart{position:relative}
.cb-tip{position:absolute;pointer-events:none;background:var(--chrome);color:var(--chrome-ink);font-size:.74rem;padding:7px 11px;border-radius:8px;box-shadow:0 8px 22px rgba(10,12,18,.35);transform:translate(-50%,-130%);white-space:nowrap;z-index:5;display:none}
.cb-tip b{color:var(--apricot-soft);font-family:'Playfair Display',serif;font-style:italic}

/* ---------- footer (dark chrome) ---------- */
footer{border-top:1px solid var(--chrome-line);padding:52px 0 64px;background:var(--chrome);color:var(--chrome-soft)}
footer .wordmark{color:var(--chrome-ink)}
.foot-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:40px;margin-bottom:36px}
.foot-grid h4{font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:#5d6b80;margin-bottom:14px}
.foot-grid a{display:block;font-size:.88rem;color:var(--chrome-soft);padding:4px 0}
.foot-grid a:hover{color:var(--chrome-ink)}
.disclosure{font-size:.74rem;color:#6b7484;line-height:1.7;border-top:1px solid var(--chrome-line);padding-top:24px}

/* ---------- motion ---------- */
.reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .reveal{opacity:1;transform:none;transition:none}
  .tract-card:hover{transform:none}
}

/* ---------- responsive ---------- */
@media (max-width:900px){
  .split{grid-template-columns:1fr;gap:32px}
  .foot-grid{grid-template-columns:1fr 1fr}
}
@media (max-width:700px){
  :root{--nav-h:52px}
  .nav-inner{gap:12px}
  .wordmark{font-size:calc(1.06rem * var(--bs,1))}
  .wordmark .tag{font-size:calc(.58rem * var(--bs,1))}
  .nav-links{display:none}
  .nav-right .nav-cta{display:none}
  .burger{display:block}
  section{padding:56px 0}
  .hero-inner{padding-top:126px;padding-bottom:48px}
  body.has-ticker .hero-inner{padding-top:160px}
  .ledger{grid-template-columns:1fr 1fr}
  .ledger div{padding:16px 12px 2px}
  .ledger div:nth-child(odd){border-left:0;padding-left:0}
  #cbmap{height:440px}
  .page-hero{padding:112px 0 40px}
  body.has-ticker .page-hero{padding-top:150px}
  .mms-hero{padding:118px 18px 54px}
  body.has-ticker .mms-hero{padding-top:154px}
  .section-head{margin-bottom:30px}
  /* iOS: inputs under 16px trigger focus zoom */
  form.cb-capture input,form.cb-capture textarea,.mms-f input,.mms-f textarea,select.cb-select{font-size:16px}
  table.cb{font-size:.78rem;min-width:560px}
  table.cb th{padding:9px 10px}
  table.cb td{padding:8px 10px}
  .tbl-wrap{-webkit-overflow-scrolling:touch}
  .feed-row{flex-wrap:wrap}
  .band-dark{grid-template-columns:1fr 1fr;padding:26px 22px}
  .mms-modal{padding:26px 20px}
  .persona-bar .inner{gap:10px}
  .home-photo{max-height:280px}
  .fee-always{padding:24px 20px;gap:16px}
  .fee-always-pct{font-size:2.6rem}
}
@media (max-width:480px){
  .ticker-label{padding:0 10px}
  .hero h1{font-size:calc(2.15rem * var(--hs,1))}
  .mms-hero-title{font-size:2.2rem}
  .hero-ctas .btn,.hero-ctas .btn-line{width:100%;text-align:center}
  .mms-hero-ctas{flex-direction:column}
  .mms-hero-ctas .btn,.mms-hero-ctas .btn-ghost{width:100%}
}

/* ---------- how-it-works: persona system ---------- */
.persona-bar{position:sticky;top:calc(var(--nav-h) + 34px);z-index:600;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;font-size:.82rem}
body:not(.has-ticker) .persona-bar{top:var(--nav-h)}
.persona-bar .inner{max-width:var(--max);margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.persona-bar .who{color:var(--slate)}
.persona-bar .who strong{color:var(--ivory)}
.persona-bar .anchors{display:flex;gap:16px;flex-wrap:wrap}
.persona-bar .anchors a{color:var(--slate);font-size:.8rem}
.persona-bar .anchors a:hover{color:var(--apricot)}
.persona-bar .switch{margin-left:auto;color:var(--apricot);font-weight:600;cursor:pointer;font-size:.8rem;background:none;border:0;font-family:'DM Sans',sans-serif}
@media(max-width:700px){.persona-bar .anchors{display:none}}
.persona-picker{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:760px;margin-top:34px}
@media(max-width:700px){.persona-picker{grid-template-columns:1fr}}
.persona-card{border-radius:14px;padding:26px;cursor:pointer;border:1px solid rgba(236,231,219,.28);background:rgba(12,15,21,.55);color:var(--chrome-ink);transition:transform .15s,border-color .15s;position:relative}
.persona-card:hover{transform:translateY(-2px);border-color:var(--apricot-soft)}
.persona-card .im{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--apricot-soft)}
.persona-card h3{font-size:1.7rem;margin:6px 0 10px}
.persona-card p{font-size:.9rem;color:#c6cbd6}
.persona-card.sel{background:var(--apricot-soft);border-color:var(--apricot-soft);color:#171310}
.persona-card.sel p{color:#3c2f1c}
.persona-card.sel .im{color:#6b4a1a}
.persona-card .tick{position:absolute;top:14px;right:16px;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.85);color:#8a5a17;display:none;align-items:center;justify-content:center;font-size:.75rem;font-weight:700}
.persona-card.sel .tick{display:flex}
body[data-persona="buyer"] .only-seller{display:none!important}
body[data-persona="seller"] .only-buyer{display:none!important}

/* dark stat band */
.band-dark{background:var(--chrome);color:var(--chrome-ink);border-radius:16px;padding:34px 30px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:22px;margin-top:40px}
.band-dark .n{font-family:'Playfair Display',serif;font-size:2rem}
.band-dark .n.gold{color:var(--apricot-soft)}
.band-dark .l{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--chrome-soft);margin-top:6px}

/* tier ladder */
.tier{border:1px solid var(--line);border-radius:16px;padding:32px;margin-bottom:18px;background:var(--card)}
.tier.dark{background:var(--chrome);border-color:var(--chrome);color:var(--chrome-ink)}
.tier .tk{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--apricot)}
.tier.dark .tk{color:var(--apricot-soft)}
.tier h3{font-size:1.7rem;margin:8px 0 10px}
.tier p{color:var(--slate);font-size:.95rem;padding-bottom:16px;border-bottom:1px solid var(--line)}
.tier.dark p{color:#c6cbd6;border-color:rgba(236,231,219,.18)}
.tier .specs{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:18px;padding-top:16px}
.tier .specs .sl{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim)}
.tier.dark .specs .sl{color:var(--chrome-soft)}
.tier .specs .sv{font-family:'Playfair Display',serif;font-size:1.4rem;margin-top:4px}
.tier .specs .sd{font-size:.74rem;color:var(--slate-dim);margin-top:2px}
.tier.dark .specs .sd{color:var(--chrome-soft)}

/* playbook cards */
.playbook-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:700px){.playbook-grid{grid-template-columns:1fr}}
.playbook{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.playbook .pk{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--apricot)}
.playbook h3{font-size:1.4rem;margin:8px 0 10px}
.playbook p{font-size:.9rem;color:var(--slate)}
.playbook a.more{display:inline-block;margin-top:14px;color:var(--apricot);font-weight:600;font-size:.88rem}

/* FAQ accordion */
.faq details{border-bottom:1px solid var(--line);padding:4px 0}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:14px;padding:16px 0;font-family:'Playfair Display',serif;font-size:1.08rem;color:var(--ivory)}
.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:'+';font-family:'DM Sans',sans-serif;color:var(--apricot);font-size:1.3rem;line-height:1}
.faq details[open] summary:after{content:'−'}
.faq .a{color:var(--slate);font-size:.92rem;padding:0 0 18px;max-width:64ch}

/* numbered steps / timeline */
.steps{counter-reset:st}
.step{display:grid;grid-template-columns:52px 1fr;gap:18px;padding:20px 0;border-bottom:1px solid var(--line)}
.step:last-child{border-bottom:0}
.step:before{counter-increment:st;content:counter(st,decimal-leading-zero);font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--apricot)}
.step h4{font-size:1.06rem;margin-bottom:4px;font-family:'Playfair Display',serif;font-weight:500}
.step p{font-size:.9rem;color:var(--slate)}

.mmm-locked-card{background:rgba(236,231,219,.05);border:1px solid rgba(236,231,219,.16);border-radius:16px;padding:26px}
.mmm-locked-card .mlc-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(236,231,219,.12)}
.mmm-locked-card .mlc-ad{font-family:"Playfair Display",serif;font-size:1.05rem;color:var(--chrome-ink)}
.mmm-locked-card .mlc-pr{font-family:"Playfair Display",serif;font-size:1.3rem;color:var(--apricot-soft);filter:blur(4px);letter-spacing:1px;user-select:none}
.mmm-locked-card .mlc-lock{margin-top:16px;text-align:center;font-family:"JetBrains Mono",monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--apricot-soft)}

/* ---------- $10k credit calculator ---------- */
.credit-calc{background:rgba(236,231,219,.05);border:1px solid rgba(236,231,219,.16);border-radius:18px;padding:32px;margin-top:30px}
.cc-price{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--chrome-ink);margin-bottom:18px}
.cc-price span{color:var(--apricot-soft)}
.cc-slider{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;outline:none;margin:6px 0 26px;background:linear-gradient(to right,var(--apricot) 0%,var(--apricot) var(--pct,18%),rgba(236,231,219,.2) var(--pct,18%),rgba(236,231,219,.2) 100%)}
.cc-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:var(--apricot-soft);cursor:pointer;border:3px solid var(--chrome);box-shadow:0 2px 8px rgba(10,12,18,.4)}
.cc-slider::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--apricot-soft);cursor:pointer;border:3px solid var(--chrome)}
.cc-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
@media(max-width:600px){.cc-grid{grid-template-columns:1fr}}
.cc-cell{background:rgba(12,15,21,.35);border-radius:12px;padding:18px 20px}
.cc-cell.net{background:var(--apricot-soft)}
.cc-k{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--chrome-soft)}
.cc-cell.net .cc-k{color:#6b4a1a}
.cc-v{font-family:'Playfair Display',serif;font-size:1.8rem;margin-top:6px;color:var(--chrome-ink)}
.cc-v.gold{color:var(--apricot-soft)}
.cc-cell.net .cc-v{color:#171310}
.cc-note{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:#6b4a1a;margin-top:4px}
.cc-read{color:#c6cbd6;font-size:.92rem;margin-top:20px;text-align:center}
.cc-read b{color:var(--chrome-ink)}

/* ---------- how-it-works CMA + call ---------- */
.cma-split{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
@media(max-width:820px){.cma-split{grid-template-columns:1fr}}
.cma-call{background:var(--chrome);color:var(--chrome-ink);border-radius:14px;padding:32px}
.cma-call .eyebrow{color:var(--apricot-soft)}
.cma-call h3{font-family:'Playfair Display',serif;font-size:1.6rem;margin:8px 0 12px}
.cma-call h3 em{font-style:italic;color:var(--apricot-soft)}
.cma-call p{color:#c6cbd6;font-size:.92rem;margin-bottom:20px}
.cma-call .btn-line{border-color:rgba(236,231,219,.4);color:var(--chrome-ink)}
.cma-call .btn-line:hover{border-color:var(--chrome-ink);background:rgba(236,231,219,.06)}
.cma-call .cma-fine{font-size:.68rem;color:var(--chrome-soft);margin:16px 0 0}

/* ---------- credit comparison columns ---------- */
.cc-compare{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:600px){.cc-compare{grid-template-columns:1fr}}
.cc-col{border-radius:12px;padding:22px 20px;text-align:center}
.cc-col.trad{background:rgba(12,15,21,.35);opacity:.9}
.cc-col.cbm{background:var(--apricot-soft)}
.cc-col-h{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#6b4a1a}
.cc-col.trad .cc-col-h{color:var(--chrome-soft)}
.cc-col-rate{font-size:.8rem;margin-top:6px;color:#6b4a1a}
.cc-col.trad .cc-col-rate{color:var(--chrome-soft)}
.cc-col-v{font-family:'Playfair Display',serif;font-size:2.1rem;margin-top:10px;color:#171310}
.cc-col.trad .cc-col-v{color:var(--chrome-ink);text-decoration:line-through;text-decoration-color:rgba(217,154,78,.6);text-decoration-thickness:2px}
.cc-col-sub{font-size:.72rem;margin-top:4px;color:#6b4a1a}
.cc-col.trad .cc-col-sub{color:var(--chrome-soft)}
.cc-save{display:flex;align-items:baseline;justify-content:center;gap:12px;background:rgba(217,154,78,.12);border:1px solid var(--apricot-soft);border-radius:12px;padding:16px 22px;flex-wrap:wrap}
.cc-save-k{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--apricot-soft)}
.cc-save-v{font-family:'Playfair Display',serif;font-size:2rem;color:var(--apricot-soft)}
.cc-save-note{font-size:.85rem;color:var(--chrome-soft)}
/* light slider variant for bg-2 contexts (MMM) */
.cc-slider-light{background:linear-gradient(to right,var(--apricot) 0%,var(--apricot) var(--pct,18%),rgba(28,26,20,.15) var(--pct,18%),rgba(28,26,20,.15) 100%)}
.cc-slider-light::-webkit-slider-thumb{border-color:var(--bg-2)}
/* MMM light-context save + read overrides */
.credit-calc[style*="bg-2"] .cc-save-note{color:var(--slate)}
.credit-calc[style*="bg-2"] .cc-col.trad{background:var(--card)}
.credit-calc[style*="bg-2"] .cc-col.trad .cc-col-v{color:var(--ivory)}

/* ---------- home-page MMM badge ---------- */
.mmm-home-lock,.mmm-home-open{display:grid;grid-template-columns:1.4fr 1fr;gap:26px;align-items:center}
@media(max-width:760px){.mmm-home-lock,.mmm-home-open{grid-template-columns:1fr;gap:20px}}
.mmm-home-blur,.mmm-home-price{background:rgba(236,231,219,.05);border:1px solid rgba(236,231,219,.16);border-radius:16px;padding:30px;text-align:center}
.mhb-k{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--chrome-soft)}
.mhb-v{font-family:'Playfair Display',serif;font-size:2.4rem;margin-top:8px;color:var(--chrome-ink)}
.mmm-home-blur .mhb-v{filter:blur(7px);user-select:none;letter-spacing:2px;color:var(--apricot-soft)}

/* ---------- home-page listing gallery (pulled from sold/active MLS) ---------- */
.home-listing .lg-main{margin-top:8px;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--bg-2)}
.home-listing .lg-main img{width:100%;max-height:520px;object-fit:cover;display:block;cursor:pointer}
.home-listing .lg-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;margin-top:10px}
.home-listing .lg-t{padding:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:none;cursor:pointer;aspect-ratio:4/3}
.home-listing .lg-t img{width:100%;height:100%;object-fit:cover;display:block}
.home-listing .lg-t.on{border-color:var(--apricot);box-shadow:0 0 0 2px var(--apricot-soft)}
.home-listing .lg-count{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--slate-dim);margin-top:8px;letter-spacing:.08em}
.home-listing .lg-desc{margin-top:22px;max-width:70ch}
.home-listing .lg-desc p{font-size:1.02rem;line-height:1.7;color:var(--slate);margin:.5rem 0 0}
.home-listing .lg-attr{font-family:'JetBrains Mono',monospace;font-size:.66rem;color:var(--slate-dim);margin-top:10px;letter-spacing:.06em}

/* recent-sales sold chip */
.price-chip.sold{background:rgba(23,19,16,.9)!important;color:#e7c99a!important}
.price-chip.sold .dot{background:#7bbf7b!important}

/* listing-detail head CTA group (Tour + View on MLSListings) */
.ld-head-cta{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.ld-head-cta .btn{white-space:nowrap}
.ld-mls{font-size:.82rem}
@media(max-width:640px){.ld-head-cta{width:100%;align-items:stretch}.ld-head-cta .btn{text-align:center}}

/* listing photo placeholder (no MLS photo yet - avoids wrong Street View) */
.ph:empty,.listing-card .ph:empty{position:relative;background:linear-gradient(135deg,#1a1f2b,#12151d)}
.ph:empty::after{content:"Photos coming soon";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--apricot-soft);font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;opacity:.75}
.ld-nophoto{aspect-ratio:3/2;border-radius:14px;background:linear-gradient(135deg,#1a1f2b,#12151d);display:flex;align-items:center;justify-content:center;color:var(--apricot-soft);font-family:'JetBrains Mono',monospace;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase}

/* Be Your Own Agent toolkit */
.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.tool-link{text-decoration:none;color:inherit;display:block;height:100%}
.tool-tile{height:100%;background:var(--card,#fff);border:1px solid var(--line);border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:10px;transition:transform .16s,border-color .16s,box-shadow .16s}
.tool-link:hover .tool-tile:not(.is-soon){transform:translateY(-3px);border-color:var(--apricot);box-shadow:0 22px 55px -30px rgba(23,19,16,.4)}
.tool-tile.is-soon{opacity:.72}
.tt-top{display:flex;align-items:center;justify-content:space-between}
.tt-ico{width:44px;height:44px;border-radius:50%;background:rgba(176,111,36,.1);display:flex;align-items:center;justify-content:center;color:var(--apricot)}
.tt-ico svg{width:20px;height:20px}
.tt-arrow{color:var(--slate);font-size:1.1rem}
.tt-soon{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--slate-dim);border:1px solid var(--line);border-radius:20px;padding:3px 9px}
.tool-tile h3{font-family:'Playfair Display',serif;font-size:1.2rem;margin:6px 0 0}
.tool-tile p{font-size:.9rem;color:var(--slate);line-height:1.55;margin:0;flex:1}
.tt-tags{display:flex;gap:6px;margin-top:6px}
.tt-tag{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:var(--slate);background:rgba(23,19,16,.05);border-radius:20px;padding:3px 9px}
.tool-gate{margin-top:32px;background:var(--bg-2);border:1px solid var(--line);border-radius:20px;padding:30px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
.tool-gate>div{flex:1;min-width:280px}
/* Net sheet */
.ns-wrap{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}
.ns-inputs{display:flex;flex-direction:column;gap:16px}
.ns-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ns-field{display:flex;flex-direction:column;gap:5px}
.ns-lbl{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate)}
.ns-field input{font-family:'Playfair Display',serif;font-size:1.2rem;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);width:100%}
.ns-field input:focus{outline:none;border-color:var(--apricot)}
.ns-hint{font-size:.72rem;color:var(--slate-dim)}
.ns-note{font-size:.72rem;color:var(--slate-dim);line-height:1.5;margin:4px 0 0}
.ns-result{background:var(--chrome);color:var(--chrome-ink);border-radius:20px;padding:28px}
.ns-net-lbl{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--chrome-soft)}
.ns-net{font-family:'Playfair Display',serif;font-size:2.9rem;color:var(--apricot-soft);margin:6px 0 18px;line-height:1}
.ns-rows{display:flex;flex-direction:column;border-top:1px solid rgba(255,255,255,.12);padding-top:10px}
.ns-row{display:flex;justify-content:space-between;font-size:.9rem;padding:7px 0;color:#c6cbd6}
.ns-row.b{font-weight:600;color:var(--chrome-ink);border-top:1px solid rgba(255,255,255,.12);margin-top:6px;padding-top:12px}
.ns-row.g span:last-child{color:#8fbf8f}
.ns-compare{margin-top:16px;border-top:1px solid rgba(255,255,255,.12);padding-top:14px}
.ns-cmp-row{display:flex;justify-content:space-between;font-size:.9rem;padding:5px 0;color:#c6cbd6}
.ns-cmp-row.hi{color:var(--apricot-soft);font-weight:600;font-size:1rem}
@media(max-width:760px){.ns-wrap{grid-template-columns:1fr}}

</style>
<script type="application/ld+json">
${JSON.stringify({'@context':'https://schema.org','@graph':[
{'@type':'RealEstateAgent','@id':`https://${M.domain}/#org`,'name':M.name,'url':`https://${M.domain}`,
 'areaServed':{'@type':'City','name':M.city,'address':{'@type':'PostalAddress','addressLocality':M.city,'addressRegion':'CA','postalCode':M.zipsLabel}},
 'parentOrganization':{'@type':'Organization','name':'McMullen Properties LLC'},
 'employee':{'@id':`https://${M.domain}/#agent`}},
{'@type':'Person','@id':`https://${M.domain}/#agent`,'name':M.agent.name,
 'jobTitle':'Licensed California Real Estate Agent','identifier':`CA DRE #${M.agent.dre}`,
 'worksFor':{'@id':`https://${M.domain}/#org`},'knowsAbout':[`${M.city} real estate`,'residential property valuation','seller disclosure review','comparative market analysis']},
{'@type':'WebSite','@id':`https://${M.domain}/#website`,'url':`https://${M.domain}`,'name':M.name,
 'publisher':{'@id':`https://${M.domain}/#org`},'inLanguage':'en-US'},
{'@type':'Dataset','@id':`https://${M.domain}/#dataset`,
 'name':`${M.city} residential property and sales record`,
 'description':`Parcel-level property records and recorded sale history for ${M.city}, California (${M.zipsLabel}), compiled from county public records and MLS data.`,
 'url':`https://${M.domain}/intelligence/`,'spatialCoverage':{'@type':'Place','name':`${M.city}, California`},
 'creator':{'@id':`https://${M.domain}/#org`},'license':`https://${M.domain}/methodology/`,
 'isAccessibleForFree':true,'keywords':[M.city,'real estate','home prices','price per square foot','recorded sales']}
]})}
</script>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a class="wordmark" href="/" style="--bs:${Math.max(.72, Math.min(1, 22 / (M.name.length + .55 * M.zipsLabel.length))).toFixed(2)}"><b>The ${M.city}</b> Market<span class="tag">${M.zipsLabel}</span></a>
    <div class="nav-links">
      <a href="#map">The Map</a>
      <a href="/active-listings/"><span class="live-dot"></span>For sale</a>
      <a href="/recent-sales/">Recent sales</a>
      <a href="/tools/">Toolkit</a>
      <a href="/intelligence/">Intelligence</a>
      <a href="/how-it-works/">How it works</a>
      <a href="/make-me-move/">Make me move</a>
    </div>
    <div class="nav-right">
      <a class="nav-cta" href="https://app.${M.domain}/signin">Sign in</a>
    </div>
    <button class="burger" aria-label="Open menu" aria-expanded="false" id="burger">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="drawer" id="drawer">
  <a href="#map">The Map</a>
  <a href="/active-listings/"><span class="live-dot"></span>For sale</a>
  <a href="/recent-sales/">Recent sales</a>
  <a href="/tools/">Toolkit</a>
  <a href="/intelligence/">Intelligence</a>
  <a href="/how-it-works/">How it works</a>
  <a href="/make-me-move/">Make me move</a>
  <a href="/methodology/">Methodology</a>
  <a class="nav-cta" href="https://app.${M.domain}/signin">Sign in</a>
</div>

<div class="ticker" id="cbticker"></div>

<header class="hero">
  <div class="wrap hero-inner">
    <span class="eyebrow">${M.city}, California · ${M.nickname} · ${M.zipsLabel}</span>
    <h1 style="--hs:${Math.max(.7, Math.min(1, 10 / M.city.length)).toFixed(2)}">Every home in <span class="hero-city">${M.city}</span>. <em>Every street. Every tract.</em></h1>
    <p class="sub">The complete public record of one community's real estate — every parcel indexed, every sale on file, every neighborhood measured. Not a portal. A ledger.</p>
    <div class="hero-ctas">
      <a class="btn btn-gold" href="#map">Find your home on the map</a>
      <a class="btn btn-line" href="#tracts">Browse the tracts</a>
    </div>
    <div class="ledger" id="ledger">
      <div><div class="n" data-k="properties">—</div><div class="l">Homes indexed</div></div>
      <div><div class="n" data-k="streets">—</div><div class="l">Streets</div></div>
      <div><div class="n" data-k="named_tracts">—</div><div class="l">Named tracts</div></div>
      <div><div class="n" data-k="median_value" data-fmt="money">—</div><div class="l">Median home value</div></div>
    </div>
  </div>
</header>

<section class="map-section" id="map">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">The Map</span>
      <h2>All ${mktDerived().homes.toLocaleString('en-US')} parcels of ${M.zipsLabel}, <em>on one map.</em></h2>
      <p class="sub">Every dot is a home in the index. Click any one for its record — type, size, year, and last recorded sale.</p>
    </div>
    <div id="cbmap" class="reveal"></div>
    <p class="map-note">Parcel locations from ${M.county} County records. Values are estimates from public data — see methodology.</p>
  </div>
</section>

<section id="numbers">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">Market Intelligence</span>
      <h2>The ${M.city} market, <em>measured.</em></h2>
      <p class="sub">Every recorded sale in ${M.zipsLabel} — tracked, ranked, and updated as new sales close. <a href="/intelligence/" style="color:var(--apricot)">Full intelligence &rarr;</a></p>
    </div>
    <div class="mz-grid reveal">
      <div class="mz-card">
        <div class="mz-eyebrow"><span class="dot"></span>Live sales feed</div>
        <div class="mz-sub">The most recent ${M.city} closings on record — newest first.</div>
        <div id="mzFeed"></div>
      </div>
      <div class="mz-card mz-chart">
        <div class="mz-eyebrow">$/SF Trajectory <span class="mz-delta" id="mzDelta"></span></div>
        <div class="mz-sub">Median price per square foot, by quarter. Hover the line for any quarter's number.</div>
        <div class="pillbar" id="mzTypePills" style="margin:0 0 14px">
          <button class="pill-t on" data-k="ppsf">All</button>
          <button class="pill-t" data-k="sf_ppsf">Single family</button>
          ${mktDerived().hasCondos ? '<button class="pill-t" data-k="co_ppsf">Condo &amp; townhome</button>' : ''}
        </div>
        <div id="mzChart" style="position:relative"></div>
        <div class="cap"><span id="mzCapL"></span><span id="mzCapR"></span></div>
      </div>
    </div>
    <div class="tiles reveal" id="tiles"></div>
    <div class="mz-card reveal" style="margin-top:16px">
      <div class="rank-head">
        <div><div class="mz-eyebrow" style="margin-bottom:2px">Tracts ranked by value</div>
        <div class="mz-sub" style="margin-bottom:0">Every tract with 8+ recorded sales</div></div>
        <div class="pillbar" id="mzPills">
          <button class="pill-t on" data-m="ppsf">$/sf</button>
          <button class="pill-t" data-m="vol">Volume</button>
          <button class="pill-t" data-m="price">Median price</button>
        </div>
      </div>
      <div id="mzRank"></div>
      <p class="mz-sub" style="margin:14px 0 0">Showing the top tracts by the selected metric &middot; <a href="/tracts/" style="color:var(--apricot)">Explore all tracts &rarr;</a></p>
    </div>
    <div class="insight-grid reveal" id="mzInsights"></div>
  </div>
</section>

<section id="forsale" style="padding-top:0">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow"><span class="live-dot"></span>For sale right now</span>
      <h2>On the market in <em>${M.city}.</em></h2>
      <p class="sub">Live from the MLS, refreshed twice daily — each listing connected to its full home record. <a href="/active-listings/" style="color:var(--apricot)" id="fsAllLink">See all homes for sale →</a></p>
    </div>
    <div class="listing-grid reveal" id="fsGrid"></div>
  </div>
</section>

<section id="offmarket" style="background:var(--chrome);color:var(--chrome-ink)">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow" style="color:var(--apricot-soft)">Off-market · members only</span>
      <h2 style="color:var(--chrome-ink)">The prices you <em style="color:var(--apricot-soft)">can't see yet.</em></h2>
      <p class="sub" style="color:#c6cbd6">${M.city} owners have named private numbers they'd sell for — no listing, no Zillow. <b style="color:var(--chrome-ink)"><span id="omCount">—</span> live right now.</b> Create a free account to unlock every one.</p>
    </div>
    <div class="om-grid reveal" id="omGrid"></div>
    <div class="reveal" style="text-align:center;margin-top:30px">
      <button class="btn btn-gold" data-cb-auth="signup">Create a free account to see the numbers →</button>
      <p style="font-size:.78rem;color:var(--chrome-soft);margin-top:12px">Includes a <b style="color:var(--apricot-soft)">$${creditLabel()} credit</b> toward your commission · no obligation</p>
    </div>
  </div>
</section>

<section id="tracts">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">The Tracts</span>
      <h2>A mid-century city of <em>named neighborhoods.</em></h2>
      <p class="sub">${M.city} was built tract by tract — ${mktDerived().sf.slice(0,4).join(', ')}. Each has its own record here: its streets, its era, its numbers.</p>
    </div>
    <div class="tract-grid reveal" id="tractGrid"></div>
  </div>
</section>

<section id="method">
  <div class="wrap">
    <div class="split">
      <div class="reveal">
        <span class="eyebrow">Methodology</span>
        <h2>Here is the number, <em>and how we got it.</em></h2>
        <p class="sub" style="margin-top:16px">Everything on this site traces to a public source: ${M.county} County assessor and recorder data, recorded deeds, and county parcel records for the ${M.zipsLabel} zip code. No estimates without a basis, no trend arrows on one sale.</p>
      </div>
      <div class="method-card reveal" id="contact">
        <span class="eyebrow">Your home is in this index</span>
        <p>Every one of the ${mktDerived().homes.toLocaleString('en-US')} homes here has a file — including yours. Ask for your home's current record and what the recent sales around it actually mean. Direct from a licensed ${M.city}-area broker associate — no listing required, no obligation.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">
          <a href="https://app.${M.domain}/tools/cma" class="btn btn-gold">Value your home &rarr;</a>
          <a href="https://app.${M.domain}/tools/net-sheet" class="btn" style="background:transparent;border:1px solid rgba(0,0,0,.16);color:inherit">See your net sheet &rarr;</a>
        </div>
        <p style="font-size:.72rem;color:var(--slate-dim);margin-top:14px;margin-bottom:0">Free and instant &middot; save your work with a free account &middot; no obligation.</p>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="wordmark" href="/" style="--bs:${Math.max(.72, Math.min(1, 22 / (M.name.length + .55 * M.zipsLabel.length))).toFixed(2)}"><b>The ${M.city}</b> Market<span class="tag">${M.zipsLabel}</span></a>
        <p style="color:var(--slate-dim);font-size:.84rem;margin-top:12px;max-width:36ch">The complete record of ${M.city}, California real estate.</p>
      </div>
      <div>
        <h4>Index</h4>
        <a href="/active-listings/">For sale</a>
        <a href="/recent-sales/">Recent sales</a>
        <a href="/tools/">Toolkit</a>
      <a href="/tools/">Toolkit</a>
        <a href="/tracts/">Tracts</a>
        <a href="/streets/">Streets</a>
        <a href="/intelligence/">Intelligence</a>
        <a href="/how-it-works/">How it works</a>
        <a href="/make-me-move/">Make me move</a>
      </div>
      <div>
        <h4>Contact</h4>
        <a href="mailto:tim@${M.domain}">tim@${M.domain}</a>
        <a href="/methodology/">Methodology</a>
      </div>
    </div>
    <p class="disclosure">© 2026 ${M.name} · McMullen Properties LLC · ${M.agent.name}, CA DRE #${M.agent.dre} · Operating under Real Broker, DRE #02228473. Property information is compiled from ${M.county} County public records and other sources; it is deemed reliable but not guaranteed and should be independently verified. Estimated values are computational estimates, not appraisals. ${M.name} is an independent service and is not affiliated with the City of ${M.city}.</p>
  </div>
</footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js"></script>
<script>
/* Eichler Market — shared motion engine for static pages (homepage, how-it-works, make-me-move)
 * Vanilla JS, no deps. Injects its own CSS. Honors prefers-reduced-motion.
 * Hooks (add these attributes in markup):
 *   [data-reveal]              — container; on scroll-in, adds .is-in (children animate in, staggered)
 *   [data-reveal-child]        — child of a [data-reveal]; fades/slides up with stagger
 *   [data-reveal-self]         — element animates itself on scroll-in
 *   [data-count="1768"]        — number counts 0->target on scroll-in
 *        data-prefix="$"  data-suffix="/sf"  data-comma="1"  data-dec="1"
 *   [data-tw]                  — typewriter the element's text on scroll-in (gold caret)
 *   [data-parallax="0.15"]     — element drifts on scroll (hero photo); value = speed factor
 */
(function () {
  if (window.EMMotion) return;
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  // ---- CSS ----
  var css = ''
    + '[data-reveal-child]{opacity:0;transform:translateY(18px);transition:opacity .6s cubic-bezier(.2,.6,.2,1),transform .6s cubic-bezier(.2,.6,.2,1)}'
    + '[data-reveal].is-in [data-reveal-child]{opacity:1;transform:none}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(2){transition-delay:.07s}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(3){transition-delay:.14s}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(4){transition-delay:.21s}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(5){transition-delay:.28s}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(6){transition-delay:.35s}'
    + '[data-reveal-self]{opacity:0;transform:translateY(22px);transition:opacity .65s cubic-bezier(.2,.6,.2,1),transform .65s cubic-bezier(.2,.6,.2,1)}'
    + '[data-reveal-self].is-in{opacity:1;transform:none}'
    + '.em-tw-caret{display:inline-block;width:.06em;background:#c8a96e;margin-left:.04em;animation:em-tw-blink .9s steps(1) infinite;vertical-align:baseline}'
    + '@keyframes em-tw-blink{50%{opacity:0}}'
    + '@media(prefers-reduced-motion:reduce){'
    + '  [data-reveal-child],[data-reveal-self]{opacity:1!important;transform:none!important;transition:none!important}'
    + '  .em-tw-caret{display:none}'
    + '}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---- Animated counter ----
  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var comma = el.getAttribute('data-comma') === '1';
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    function fmt(v) { return prefix + (comma ? Math.round(v).toLocaleString() : v.toFixed(dec)) + suffix; }
    if (RM) { el.textContent = fmt(target); return; }
    var dur = 1500, t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = fmt(target * e);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(target);
    }
    requestAnimationFrame(step);
  }

  // ---- Typewriter ----
  function typewrite(el) {
    var full = el.getAttribute('data-tw-text') || el.textContent;
    el.setAttribute('data-tw-text', full);
    if (RM) { el.textContent = full; return; }
    el.textContent = '';
    var caret = document.createElement('span'); caret.className = 'em-tw-caret'; caret.textContent = '\u00A0';
    el.appendChild(caret);
    var i = 0, speed = 30;
    (function tick() {
      if (i <= full.length) {
        el.textContent = full.slice(0, i);
        el.appendChild(caret);
        i++; setTimeout(tick, speed);
      } else {
        setTimeout(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 700);
      }
    })();
  }

  function onIn(el) {
    el.classList.add('is-in');
    el.querySelectorAll('[data-count]').forEach(function (c) { if (!c.__counted) { c.__counted = 1; animateCount(c); } });
    el.querySelectorAll('[data-tw]').forEach(function (t) { if (!t.__tw) { t.__tw = 1; typewrite(t); } });
    if (el.hasAttribute('data-count') && !el.__counted) { el.__counted = 1; animateCount(el); }
    if (el.hasAttribute('data-tw') && !el.__tw) { el.__tw = 1; typewrite(el); }
  }

  function initReveals() {
    var nodes = document.querySelectorAll('[data-reveal],[data-reveal-self],[data-count],[data-tw]');
    if (!('IntersectionObserver' in window)) { nodes.forEach(onIn); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { onIn(en.target); io.unobserve(en.target); } });
    }, { threshold: .14, rootMargin: '-40px 0px' });
    nodes.forEach(function (el) {
      // avoid double-observing a counter that's inside an already-observed [data-reveal]
      if ((el.hasAttribute('data-count') || el.hasAttribute('data-tw')) && el.closest('[data-reveal]')) return;
      io.observe(el);
    });
    // Above-the-fold hero: reveal immediately so it never starts hidden
    setTimeout(function () {
      document.querySelectorAll('.hero [data-reveal],.hero[data-reveal],.mms-hero [data-reveal],.mms-hero[data-reveal]').forEach(function (el) {
        if (!el.classList.contains('is-in')) onIn(el);
      });
    }, 90);
  }

  // ---- Parallax drift (bolder-than-community extra) ----
  function initParallax() {
    if (RM) return;
    var els = [].slice.call(document.querySelectorAll('[data-parallax]'));
    if (!els.length) return;
    var ticking = false;
    function update() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.15;
        var r = el.getBoundingClientRect();
        // only when roughly in view
        if (r.bottom < -200 || r.top > vh + 200) return;
        var mid = r.top + r.height / 2;
        var off = (mid - vh / 2) * -speed;
        el.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0) scale(1.06)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  function boot() { initReveals(); initParallax(); }
  window.EMMotion = { rescan: initReveals };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

</script>
<script>window.MKT={id:${M.id},slug:'${M.slug}',city:'${M.city}',name:'${M.name}',domain:'${M.domain}',email:'tim@${M.domain}',source:'${M.slug.replace(/-market$/,"")}_web'};</script>
<script src="/assets/cb-track.js"></script>
<script src="/assets/cb-lead.js"></script>
<script>
(function(){
  var money = function(n){ return n==null ? '—' : '$'+(n>=1e6 ? (n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'')+'M' : Math.round(n/1000)+'K'); };
  var num = function(n){ return n==null ? '—' : n.toLocaleString('en-US'); };
  var TYPE = {sf:'Single family', co:'Condo / townhome', mf:'Multi-family', mh:'Mobile home', vl:'Vacant land', ot:'Property'};

  /* mobile drawer */
  var burger = document.getElementById('burger'), drawer = document.getElementById('drawer');
  burger.addEventListener('click', function(){
    var open = drawer.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  drawer.addEventListener('click', function(e){ if(e.target.tagName==='A') drawer.classList.remove('open'); });

  /* scroll reveals */
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:.12});
  document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });

  /* ledger + tract cards */
  fetch('/assets/${M.assetPrefix}market-stats.json').then(function(r){ return r.json(); }).then(function(S){
    var c = S.city;
    document.querySelectorAll('#ledger [data-k]').forEach(function(el){
      var v = c[el.getAttribute('data-k')];
      if(el.getAttribute('data-fmt')==='money' && v >= 1e6){
        el.setAttribute('data-count',(v/1e6).toFixed(2));
        el.setAttribute('data-prefix','$');
        el.setAttribute('data-suffix','M');
        el.setAttribute('data-dec','2');
        el.textContent = money(v);
      } else {
        el.setAttribute('data-count', v);
        el.setAttribute('data-comma','1');
        el.textContent = num(v);
      }
    });
    if(window.EMMotion) window.EMMotion.rescan();
    var grid = document.getElementById('tractGrid');
    grid.innerHTML = S.top_tracts.slice(0,12).map(function(t){
      return '<a class="tract-card" href="/tract/'+t.slug+'/" style="display:block"><h3>'+t.name+'</h3>'+
        '<div class="meta">'+t.n+' homes · est. '+(t.yr||'—')+' · '+(t.type||'')+'</div>'+
        '<div class="mv">'+money(t.mv)+' <span>median value</span></div></a>';
    }).join('');
  });

  /* off-market locked showcase */
  (function(){
    var SB='https://qinuukntpyulqjzndnho.supabase.co';
    var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
    function num(n){return n==null?'':Number(n).toLocaleString('en-US');}
    fetch(SB+'/rest/v1/mmm_public?market_id=eq.${M.id}&select=address_display,beds,baths,sqft&order=published_at.desc',
      {headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){return r.ok?r.json():[];})
    .then(function(rows){
      var sec=document.getElementById('offmarket');
      if(!rows||!rows.length){ if(sec)sec.style.display='none'; return; }
      document.getElementById('omCount').textContent=rows.length;
      var show=rows.slice(0,6);
      // pad to at least 6 tiles with generic locked placeholders for visual density
      var cards=show.map(function(m){
        var specs=[]; if(m.beds)specs.push(m.beds+' bd'); if(m.baths)specs.push(m.baths+' ba'); if(m.sqft)specs.push(num(m.sqft)+' sf');
        return '<div class="om-card"><div class="om-ad">'+m.address_display+'</div><div class="om-sp">'+specs.join(' \u00b7 ')+'</div><div class="om-lock"><span class="om-blur">$1,4\u2588\u2588,\u2588\u2588\u2588</span><span class="om-tag">\ud83d\udd12 Unlock</span></div></div>';
      }).join('');
      document.getElementById('omGrid').innerHTML=cards;
    }).catch(function(){ var s=document.getElementById('offmarket'); if(s)s.style.display='none'; });
  })();

  /* for-sale showcase */
  (function(){
    var SB='https://qinuukntpyulqjzndnho.supabase.co';
    var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
    var GK='AIzaSyAh6mb44KilwxY-QTINnCYqxAx4VF-FWyo';
    fetch(SB+'/rest/v1/mls_feed_listings?market_id=eq.${M.id}&status=eq.Active&order=price.desc&select=mls_number,address_raw,address_norm,property_slug,price,beds,baths,sqft,rehosted_url',
      {headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(rows){
      if(!rows || !rows.length){ document.getElementById('forsale').style.display='none'; return; }
      var link=document.getElementById('fsAllLink');
      if(link) link.textContent='See all '+rows.length+' homes for sale \u2192';
      document.getElementById('fsGrid').innerHTML = rows.slice(0,6).map(function(l){
        var img = l.rehosted_url || (GK ? ('https://maps.googleapis.com/maps/api/streetview?size=640x400&location='+encodeURIComponent((l.address_norm||l.address_raw)+', ${M.city}, CA ${M.zipsLabel}')+'&fov=72&source=outdoor&key='+GK) : null);
        var specs=[];
        if(l.beds)specs.push(l.beds+' bd');
        if(l.baths)specs.push(l.baths+' ba');
        if(l.sqft)specs.push(num(l.sqft)+' sf');
        var ppsf=(l.price&&l.sqft)?('$'+num(Math.round(l.price/l.sqft))+'/sf'):'';
        var inner='<div class="ph">'+(img?('<img loading="lazy" onerror="this.remove()" src="'+img+'" alt="'+l.address_raw+', ${M.city} CA">'):'')+'</div>'+
          '<div class="bd"><div class="pr">'+money(l.price)+'<span class="st">\u25cf For sale</span></div>'+
          '<div class="ad">'+l.address_raw+', ${M.city}</div>'+
          '<div class="sp">'+specs.join(' \u00b7 ')+(ppsf?(' \u00b7 '+ppsf):'')+'</div>'+
          '<div class="tr">View listing \u2192</div></div>';
        return '<a class="listing-card" href="/for-sale/'+l.mls_number+'/">'+inner+'</a>';
      }).join('');
    }).catch(function(){ document.getElementById('forsale').style.display='none'; });
  })();

  /* market intelligence */
  fetch('/assets/${M.assetPrefix}market-intel.json').then(function(r){ return r.json(); }).then(function(I){
    var T = I.totals;
    document.getElementById('tiles').innerHTML = [
      ['<span data-count="'+T.sales_on_record+'" data-comma="1">'+num(T.sales_on_record)+'</span>', '${M.city} sales on record'],
      ['<span data-count="'+T.median_ppsf+'" data-prefix="$" data-comma="1">$'+num(T.median_ppsf)+'</span>', 'Median price / sq ft, last 24 months'],
      ['<span data-count="'+(T.median_price_12mo/1e6).toFixed(2)+'" data-prefix="$" data-suffix="M" data-dec="2">'+money(T.median_price_12mo)+'</span>', 'Median sale price, last 12 months'],
      ['<span data-count="'+T.tracts_tracked+'">'+num(T.tracts_tracked)+'</span>', 'Named neighborhoods tracked']
    ].map(function(t){ return '<div class="tile"><div class="n">'+t[0]+'</div><div class="l">'+t[1]+'</div></div>'; }).join('');
    if(window.EMMotion) window.EMMotion.rescan();

    (function(){
      var SB='https://qinuukntpyulqjzndnho.supabase.co',AK='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
      var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      function fdate(iso){ if(!iso)return''; var p=(''+iso).split('-'); return MON[(+p[1])-1]+' '+(+p[2])+', '+p[0]; }
      function renderFeed(rows){
        if(!rows||!rows.length){ rows=I.feed; }
        document.getElementById('mzFeed').innerHTML = rows.slice(0,7).map(function(f){
          var addr=f.a||f.address, slug=f.s||f.slug, price=f.p||f.price, sf=f.sf||f.sqft, ppsf=f.ppsf;
          var tract=f.tract||((f.tract_slug&&I.tracts[f.tract_slug])?I.tracts[f.tract_slug].name:'');
          var d=f.d||fdate(f.sold_date);
          return '<div class="feed-row"><div><div class="fa">'+(slug?('<a href="/home/'+slug+'/">'+addr+'</a>'):addr)+'</div>'+
            '<div class="fm">'+(tract?tract+' \u00b7 ':'')+(sf?num(sf)+' sf \u00b7 ':'')+(ppsf?'$'+num(ppsf)+'/sf':'')+'</div></div>'+
            '<div style="text-align:right"><div class="fp">'+money(price)+'</div><div class="fd">'+d+'</div></div></div>';
        }).join('');
      }
      fetch(SB+'/rest/v1/recent_sales_public?market_id=eq.${M.id}&select=address,slug,price,sqft,ppsf,tract_slug,sold_date&order=sold_date.desc&limit=12',{headers:{apikey:AK,Authorization:'Bearer '+AK}})
        .then(function(r){return r.ok?r.json():Promise.reject();}).then(renderFeed).catch(function(){renderFeed(I.feed);});
    })();

    var chartKey = 'ppsf';
    var CNT = { ppsf:'n', sf_ppsf:'sf_n', co_ppsf:'co_n' };
    function drawTrajectory(){
      var key = chartKey;
      var host = document.getElementById('mzChart');
      var qs = I.quarters.filter(function(q){ return q[key]; });
      if(qs.length < 2){ host.innerHTML = '<p class="mz-sub">Not enough recorded sales in this segment to chart reliably.</p>'; document.getElementById('mzDelta').textContent=''; return; }
      var vals = qs.map(function(q){ return q[key]; });
      var min = Math.min.apply(null,vals), max = Math.max.apply(null,vals), pad=(max-min)*0.12||1;
      var W=560, H=230;
      var pts = vals.map(function(v,i){
        var x = 8 + i*(W-16)/(vals.length-1);
        var y = H-14 - (v-min+pad)/(max-min+2*pad)*(H-28);
        return [x, y];
      });
      var line = pts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ');
      var area = '8,'+(H-6)+' '+line+' '+pts[pts.length-1][0].toFixed(1)+','+(H-6);
      host.innerHTML =
        '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%">'+
        '<polygon points="'+area+'" fill="rgba(217,154,78,.12)"/>'+
        '<polyline points="'+line+'" fill="none" stroke="#d99a4e" stroke-width="2"/>'+
        '<line class="cb-guide" x1="0" x2="0" y1="10" y2="'+(H-6)+'" stroke="#b06f24" stroke-width="1" stroke-dasharray="3,3" style="display:none"/>'+
        '<circle class="cb-hoverdot" r="4.5" fill="#b06f24" style="display:none"/></svg>'+
        '<div class="cb-tip"></div>';
      var svg = host.querySelector('svg'), tip = host.querySelector('.cb-tip'),
          guide = host.querySelector('.cb-guide'), dot = host.querySelector('.cb-hoverdot');
      function onMove(e){
        var r = svg.getBoundingClientRect();
        var xr = (e.clientX - r.left) / r.width * W;
        var i = Math.round((xr - 8) / ((W-16)/(vals.length-1)));
        i = Math.max(0, Math.min(vals.length-1, i));
        var p = pts[i];
        guide.setAttribute('x1', p[0]); guide.setAttribute('x2', p[0]); guide.style.display='';
        dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.style.display='';
        tip.style.left = (p[0]/W*100)+'%';
        tip.style.top = (p[1]/H*100)+'%';
        tip.style.display = 'block';
        var nsales = qs[i][CNT[key]];
        tip.innerHTML = qs[i].q + ' \u00b7 <b>$' + num(vals[i]) + '/sf</b>' + (nsales ? ' \u00b7 ' + nsales + ' sales' : '');
      }
      svg.addEventListener('mousemove', onMove);
      svg.addEventListener('mouseleave', function(){ tip.style.display='none'; guide.style.display='none'; dot.style.display='none'; });
      svg.addEventListener('touchstart', function(e){ if(e.touches.length) onMove(e.touches[0]); }, {passive:true});
      svg.addEventListener('touchmove', function(e){ if(e.touches.length) onMove(e.touches[0]); }, {passive:true});
      var q16 = qs.slice(-16);
      var delta = Math.round((q16[q16.length-1][key]/q16[0][key] - 1)*100);
      document.getElementById('mzDelta').textContent = (delta>=0?'\u25B2 +':'\u25BC ')+delta+'% over '+(q16.length-1)+' quarters';
      document.getElementById('mzCapL').innerHTML = qs[0].q+' <b>$'+num(qs[0][key])+'</b>';
      document.getElementById('mzCapR').innerHTML = qs[qs.length-1].q+' <b>$'+num(qs[qs.length-1][key])+'</b>';
    }
    drawTrajectory();
    document.getElementById('mzTypePills').addEventListener('click', function(e){
      if(e.target.tagName !== 'BUTTON') return;
      chartKey = e.target.getAttribute('data-k');
      document.querySelectorAll('#mzTypePills .pill-t').forEach(function(b){ b.classList.toggle('on', b === e.target); });
      drawTrajectory();
    });

    var metric = 'ppsf';
    var fmt = { ppsf:function(r){return '$'+num(r.ppsf)+'/sf';}, vol:function(r){return num(r.vol)+' sales';}, price:function(r){return money(r.price);} };
    function drawRank(){
      var rows = I.rank.slice().sort(function(a,b){ return b[metric]-a[metric]; }).slice(0,10);
      var top = rows[0][metric];
      document.getElementById('mzRank').innerHTML = rows.map(function(r,i){
        return '<div class="rank-row"><span class="ri">'+(i+1)+'</span>'+
          '<span class="rn"><a href="/tract/'+r.slug+'/">'+r.name+'</a></span>'+
          '<span class="rbar"><i style="width:'+Math.max(6,Math.round(r[metric]/top*100))+'%"></i></span>'+
          '<span class="rv">'+fmt[metric](r)+'</span>'+
          '<span class="rc">'+num(r.vol)+' sales</span></div>';
      }).join('');
    }
    drawRank();
    document.getElementById('mzPills').addEventListener('click', function(e){
      if(e.target.tagName!=='BUTTON')return;
      metric = e.target.getAttribute('data-m');
      document.querySelectorAll('#mzPills .pill-t').forEach(function(b){ b.classList.toggle('on', b===e.target); });
      drawRank();
    });

    var ins = '';
    if(I.spread){
      ins += '<div class="insight-card"><span class="eyebrow" style="margin-bottom:0">Widest value spread</span>'+
        '<h3>'+I.spread.hi.name+' vs '+I.spread.lo.name+'</h3>'+
        '<p>At <b>$'+num(I.spread.hi.ppsf)+'/sf</b>, '+I.spread.hi.name+' commands roughly <b>'+I.spread.ratio+'&times;</b> the per-foot price of '+I.spread.lo.name+' (<b>$'+num(I.spread.lo.ppsf)+'/sf</b>) — the widest value gap among ${M.city} tracts.</p>'+
        '<p style="margin-top:12px"><a href="/tract/'+I.spread.hi.slug+'/" style="color:var(--apricot)">See '+I.spread.hi.name+' &rarr;</a></p></div>';
    }
    if(I.by_bed){
      var beds = Object.keys(I.by_bed).map(function(b){
        return '<div class="bedrow"><span>'+b+'-bedroom</span><b>'+money(I.by_bed[b])+'</b></div>';
      }).join('');
      ins += '<div class="insight-card"><span class="eyebrow" style="margin-bottom:0">Price by bedroom &middot; 24 mo</span>'+
        '<h3>What ${M.city} homes trade for</h3>'+beds+'</div>';
    }
    if(I.most_active){
      ins += '<div class="insight-card"><span class="eyebrow" style="margin-bottom:0">Most active tract</span>'+
        '<h3>'+I.most_active.name+'</h3>'+
        '<p>With <b>'+num(I.most_active.vol)+' recorded sales</b>, '+I.most_active.name+' is the most-traded tract in ${M.city} — a median <b>$'+num(I.most_active.ppsf)+'/sf</b> and <b>'+money(I.most_active.price)+'</b> sale price.</p>'+
        '<p style="margin-top:12px"><a href="/tract/'+I.most_active.slug+'/" style="color:var(--apricot)">Browse tract &rarr;</a></p></div>';
    }
    document.getElementById('mzInsights').innerHTML = ins;
  });

(function(){
  var SB='https://qinuukntpyulqjzndnho.supabase.co';
  var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
  function money(n){return n==null?'':'$'+(n>=1e6?(n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'')+'M':Math.round(n/1000)+'K');}
  function build(items){
    if(!items.length)return;
    var host=document.getElementById('cbticker'); if(!host)return;
    var html='';
    items.forEach(function(it){
      var ppsf=(it.price&&it.sqft)?Math.round(it.price/it.sqft):null;
      html+='<span class="tick-item"><span class="js">Just sold</span>'+
        (it.property_slug?('<a href="/home/'+it.property_slug+'/">'+it.address_raw+'</a>'):('<span style="color:var(--chrome-ink)">'+it.address_raw+'</span>'))+
        '<span class="pr">'+money(it.price)+'</span>'+(ppsf?('<span>'+ppsf.toLocaleString()+'/sf</span>'):'')+'</span>';
    });
    host.innerHTML='<div class="ticker-label"><span class="dot"></span>Live market</div><div class="ticker-track">'+html+html+'</div>';
    host.classList.add('on');document.body.classList.add('has-ticker');
  }
  fetch(SB+'/rest/v1/mls_feed_listings?market_id=eq.${M.id}&status=eq.Sold&order=price.desc&limit=8&select=address_raw,property_slug,price,sqft',
    {headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){return r.ok?r.json():[];})
    .then(build).catch(function(){});
})();


  /* map */
  var map = L.map('cbmap', {scrollWheelZoom:false}).setView([${M.center[0]},${M.center[1]}],14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom:19
  }).addTo(map);
  map.on('focus click', function(){ map.scrollWheelZoom.enable(); });

  fetch('/assets/${M.assetPrefix}props.json').then(function(r){ return r.json(); }).then(function(P){
    var cluster = L.markerClusterGroup({chunkedLoading:true, maxClusterRadius:52, disableClusteringAtZoom:17});
    P.forEach(function(p){
      if(p.y==null||p.x==null||isNaN(p.y)||isNaN(p.x)) return;
      var m = L.circleMarker([p.y,p.x], {radius:5, color:'#d99a4e', weight:1, fillColor:'#d99a4e', fillOpacity:.55});
      var spec = [];
      if(p.b) spec.push(p.b+' bd');
      if(p.ba) spec.push(p.ba+' ba');
      if(p.sf) spec.push(p.sf.toLocaleString()+' sf');
      if(p.yb) spec.push('built '+p.yb);
      var sale = p.sp ? '<div class="pp-s">Last sale '+money(p.sp)+(p.sd?' · '+p.sd.slice(0,4):'')+'</div>' : '';
      var slug = '/home/'+p.s+'/';
      var GKEY = 'AIzaSyAh6mb44KilwxY-QTINnCYqxAx4VF-FWyo';
      var img = GKEY ? '<span class="pp-imgwrap"><img loading="lazy" onerror="this.parentNode.remove()" src="https://maps.googleapis.com/maps/api/streetview?size=320x180&location='+encodeURIComponent(p.a+', ${M.city}, CA ${M.zipsLabel}')+'&fov=72&source=outdoor&key='+GKEY+'"></span>' : '';
      m.bindPopup('<a href="'+slug+'" style="display:block">'+img+'<div class="pp-a">'+p.a+'</div></a><div class="pp-m">'+(TYPE[p.t]||'')+(spec.length?' · '+spec.join(' · '):'')+'</div>'+sale+'<a class="pp-link" href="'+slug+'">View home record →</a>',
        {maxWidth:290, keepInView:true, autoPanPaddingTopLeft:L.point(28,110), autoPanPaddingBottomRight:L.point(28,28)});
      cluster.addLayer(m);
    });
    map.addLayer(cluster);
  });
})();
</script>
<script type="module" src="/assets/cb-auth-nav.js"></script>
<script src="/assets/mkt-chat.js?v=4" defer></script>
</body>
</html>
`; }

const INTEL_JSON = `{"generated":"2026-07-16","totals":{"sales_on_record":4969,"median_ppsf":1070,"median_price_12mo":1800000,"sales_12mo":149,"tracts_tracked":101,"homes_indexed":6609},"quarters":[{"q":"2016 Q4","ppsf":585,"n":55,"sf_ppsf":642,"sf_n":38,"co_ppsf":567,"co_n":13},{"q":"2017 Q1","ppsf":622,"n":31,"sf_ppsf":659,"sf_n":21,"co_ppsf":601,"co_n":8},{"q":"2017 Q2","ppsf":668,"n":87,"sf_ppsf":707,"sf_n":66,"co_ppsf":613,"co_n":17},{"q":"2017 Q3","ppsf":683,"n":56,"sf_ppsf":802,"sf_n":36,"co_ppsf":566,"co_n":15},{"q":"2017 Q4","ppsf":698,"n":58,"sf_ppsf":727,"sf_n":42,"co_ppsf":682,"co_n":15},{"q":"2018 Q1","ppsf":759,"n":35,"sf_ppsf":827,"sf_n":24,"co_ppsf":649,"co_n":9},{"q":"2018 Q2","ppsf":752,"n":71,"sf_ppsf":807,"sf_n":40,"co_ppsf":755,"co_n":23},{"q":"2018 Q3","ppsf":701,"n":51,"sf_ppsf":735,"sf_n":32,"co_ppsf":684,"co_n":15},{"q":"2018 Q4","ppsf":712,"n":34,"sf_ppsf":712,"sf_n":24,"co_ppsf":688,"co_n":10},{"q":"2019 Q1","ppsf":674,"n":39,"sf_ppsf":762,"sf_n":26,"co_ppsf":609,"co_n":10},{"q":"2019 Q2","ppsf":680,"n":56,"sf_ppsf":755,"sf_n":32,"co_ppsf":667,"co_n":19},{"q":"2019 Q3","ppsf":762,"n":37,"sf_ppsf":795,"sf_n":29,"co_ppsf":683,"co_n":6},{"q":"2019 Q4","ppsf":707,"n":44,"sf_ppsf":806,"sf_n":27,"co_ppsf":690,"co_n":13},{"q":"2020 Q1","ppsf":751,"n":49,"sf_ppsf":830,"sf_n":26,"co_ppsf":709,"co_n":17},{"q":"2020 Q2","ppsf":712,"n":44,"sf_ppsf":826,"sf_n":27,"co_ppsf":680,"co_n":16},{"q":"2020 Q3","ppsf":724,"n":61,"sf_ppsf":798,"sf_n":35,"co_ppsf":662,"co_n":24},{"q":"2020 Q4","ppsf":743,"n":76,"sf_ppsf":866,"sf_n":46,"co_ppsf":629,"co_n":23},{"q":"2021 Q1","ppsf":779,"n":78,"sf_ppsf":861,"sf_n":49,"co_ppsf":722,"co_n":24},{"q":"2021 Q2","ppsf":833,"n":104,"sf_ppsf":1010,"sf_n":59,"co_ppsf":733,"co_n":35},{"q":"2021 Q3","ppsf":798,"n":85,"sf_ppsf":956,"sf_n":42,"co_ppsf":708,"co_n":36},{"q":"2021 Q4","ppsf":892,"n":82,"sf_ppsf":1013,"sf_n":57,"co_ppsf":736,"co_n":19},{"q":"2022 Q1","ppsf":947,"n":35,"sf_ppsf":1145,"sf_n":14,"co_ppsf":822,"co_n":16},{"q":"2022 Q2","ppsf":1099,"n":68,"sf_ppsf":1219,"sf_n":44,"co_ppsf":909,"co_n":21},{"q":"2022 Q3","ppsf":1001,"n":53,"sf_ppsf":1074,"sf_n":38,"co_ppsf":825,"co_n":11},{"q":"2022 Q4","ppsf":921,"n":36,"sf_ppsf":999,"sf_n":22,"co_ppsf":774,"co_n":11},{"q":"2023 Q1","ppsf":966,"n":25,"sf_ppsf":1047,"sf_n":16,"co_ppsf":749,"co_n":6},{"q":"2023 Q2","ppsf":989,"n":43,"sf_ppsf":1129,"sf_n":32,"co_ppsf":721,"co_n":9},{"q":"2023 Q3","ppsf":954,"n":34,"sf_ppsf":1183,"sf_n":21,"co_ppsf":811,"co_n":9},{"q":"2023 Q4","ppsf":974,"n":35,"sf_ppsf":1029,"sf_n":24,"co_ppsf":781,"co_n":10},{"q":"2024 Q1","ppsf":972,"n":29,"sf_ppsf":1251,"sf_n":19,"co_ppsf":822,"co_n":8},{"q":"2024 Q2","ppsf":1040,"n":53,"sf_ppsf":1290,"sf_n":33,"co_ppsf":849,"co_n":13},{"q":"2024 Q3","ppsf":1062,"n":45,"sf_ppsf":1166,"sf_n":30,"co_ppsf":791,"co_n":14},{"q":"2024 Q4","ppsf":1038,"n":53,"sf_ppsf":1295,"sf_n":31,"co_ppsf":744,"co_n":17},{"q":"2025 Q1","ppsf":1308,"n":20,"sf_ppsf":1436,"sf_n":12,"co_ppsf":831,"co_n":8},{"q":"2025 Q2","ppsf":1084,"n":47,"sf_ppsf":1344,"sf_n":25,"co_ppsf":822,"co_n":19},{"q":"2025 Q3","ppsf":1144,"n":44,"sf_ppsf":1211,"sf_n":32,"co_ppsf":724,"co_n":10},{"q":"2025 Q4","ppsf":907,"n":23,"sf_ppsf":1277,"sf_n":12,"co_ppsf":795,"co_n":11},{"q":"2026 Q1","ppsf":1057,"n":28,"sf_ppsf":1227,"sf_n":21,"co_ppsf":639,"co_n":4},{"q":"2026 Q2","ppsf":982,"n":32,"sf_ppsf":1331,"sf_n":18,"co_ppsf":769,"co_n":10}],"feed":[{"a":"1049 Lucot Way","s":"1049-lucot-way","p":2085000,"sf":1040,"ppsf":2005,"tract":"Aquino Park","ts":"aquino-park","d":"Jul 20, 2026"},{"a":"1602 Sheffield Ave","s":"1602-sheffield-ave","p":2500000,"sf":2386,"ppsf":1048,"d":"Jul 2, 2026"},{"a":"399 Castro Ct","s":"399-castro-ct","p":1950000,"sf":1248,"ppsf":1563,"tract":"Los Ranchitos Gardens","ts":"los-ranchitos-gardens","d":"Jul 2, 2026"},{"a":"1676 Ebbetts Dr","s":"1676-ebbetts-dr","p":2450000,"sf":1651,"ppsf":1484,"d":"Jul 1, 2026"},{"a":"421 Manchester Ave","s":"421-manchester-ave","p":1601500,"sf":1615,"ppsf":992,"tract":"Hamilton Condos","ts":"hamilton-condos","d":"Jun 30, 2026"},{"a":"958 W Hacienda Ave","s":"958-w-hacienda-ave","p":1975000,"sf":2056,"ppsf":961,"d":"Jun 24, 2026"},{"a":"199 Shelley Ave","s":"199-shelley-ave","p":965000,"sf":1280,"ppsf":754,"d":"Jun 22, 2026"},{"a":"715 Cambrian Dr","s":"715-cambrian-dr","p":2800000,"sf":1525,"ppsf":1836,"tract":"Cambrian Village","ts":"cambrian-village","d":"Jun 18, 2026"},{"a":"404 Shamrock Dr","s":"404-shamrock-dr","p":2256000,"sf":1659,"ppsf":1360,"tract":"Ellen Acres","ts":"ellen-acres","d":"Jun 12, 2026"},{"a":"1130 Normandy Dr","s":"1130-normandy-dr","p":1680000,"sf":1235,"ppsf":1360,"tract":"Ellen Acres","ts":"ellen-acres","d":"Jun 11, 2026"}],"rank":[{"slug":"ellen-acres","name":"Ellen Acres","ppsf":1212,"vol":13,"price":1690000},{"slug":"husted-gardens","name":"Husted Gardens","ppsf":1186,"vol":8,"price":2400000},{"slug":"cameo-park-west","name":"Cameo Park West","ppsf":1177,"vol":14,"price":2200000},{"slug":"cameo-manor","name":"Cameo Manor","ppsf":1103,"vol":10,"price":1562500},{"slug":"los-ranchitos-gardens","name":"Los Ranchitos Gardens","ppsf":1091,"vol":46,"price":1506500},{"slug":"claralinda","name":"Claralinda","ppsf":1082,"vol":15,"price":1500000},{"slug":"latimer-park","name":"Latimer Park","ppsf":1079,"vol":27,"price":1455000},{"slug":"coventry-village","name":"Coventry Village","ppsf":1072,"vol":15,"price":1520000},{"slug":"sunnyhaven","name":"Sunnyhaven","ppsf":1038,"vol":11,"price":1530000},{"slug":"arroyo-seco-manor","name":"Arroyo Seco Manor","ppsf":1027,"vol":23,"price":1900000},{"slug":"westchester-park","name":"Westchester Park","ppsf":1010,"vol":16,"price":1742500},{"slug":"fairlands","name":"Fairlands","ppsf":967,"vol":34,"price":1480000},{"slug":"shady-acres","name":"Shady Acres","ppsf":941,"vol":18,"price":1612500},{"slug":"white-oaks-manor","name":"White Oaks Manor","ppsf":937,"vol":23,"price":1400000},{"slug":"sunnybrook-gardens","name":"Sunnybrook Gardens","ppsf":933,"vol":13,"price":1430000},{"slug":"sigal","name":"Sigal","ppsf":914,"vol":9,"price":1452000},{"slug":"lovell","name":"Lovell","ppsf":903,"vol":8,"price":1848250},{"slug":"chalet-woods-amd","name":"Chalet Woods Amd","ppsf":900,"vol":13,"price":1350000},{"slug":"annabelle","name":"Annabelle","ppsf":889,"vol":10,"price":1812500},{"slug":"aquino-park","name":"Aquino Park","ppsf":884,"vol":13,"price":1700000},{"slug":"pruneyard-villas","name":"Pruneyard Villas","ppsf":882,"vol":12,"price":951500},{"slug":"rancho-del-prado","name":"Rancho Del Prado","ppsf":870,"vol":16,"price":1472500},{"slug":"central-park","name":"Central Park","ppsf":858,"vol":16,"price":1482500},{"slug":"hyde-residence-park","name":"Hyde Residence Park","ppsf":857,"vol":9,"price":1625000},{"slug":"shadowbrook","name":"Shadowbrook","ppsf":853,"vol":9,"price":1495000},{"slug":"cherry-lane","name":"Cherry Lane","ppsf":840,"vol":14,"price":1944500},{"slug":"dry-creek-ranch","name":"Dry Creek Ranch","ppsf":839,"vol":9,"price":1850000},{"slug":"hazelwood","name":"Hazelwood","ppsf":837,"vol":9,"price":1830000},{"slug":"e-r-kennedy","name":"E R Kennedy","ppsf":828,"vol":8,"price":1381250},{"slug":"cambrian-village","name":"Cambrian Village","ppsf":821,"vol":13,"price":1630000},{"slug":"westmont-estates","name":"Westmont Estates","ppsf":820,"vol":8,"price":1507500},{"slug":"coral-manor","name":"Coral Manor","ppsf":819,"vol":11,"price":2200000},{"slug":"shadow-woods","name":"Shadow Woods","ppsf":795,"vol":10,"price":1587500},{"slug":"kuehnis-estates","name":"Kuehnis Estates","ppsf":794,"vol":14,"price":1285750},{"slug":"cedar-ridge","name":"Cedar Ridge","ppsf":768,"vol":10,"price":912500},{"slug":"valley-forge","name":"Valley Forge","ppsf":744,"vol":9,"price":625000},{"slug":"hamilton-condos","name":"Hamilton Condos","ppsf":741,"vol":69,"price":650000},{"slug":"whiteoaks-village","name":"Whiteoaks Village","ppsf":739,"vol":8,"price":980000},{"slug":"hidden-lane-condo","name":"Hidden Lane Condo","ppsf":735,"vol":8,"price":585000},{"slug":"los-palos","name":"Los Palos","ppsf":733,"vol":11,"price":1250000},{"slug":"fairmeadow","name":"Fairmeadow","ppsf":728,"vol":10,"price":881250},{"slug":"yates","name":"Yates","ppsf":712,"vol":13,"price":1200000},{"slug":"magnolia-lane","name":"Magnolia Lane","ppsf":645,"vol":8,"price":732500},{"slug":"kirkwood-plaza","name":"Kirkwood Plaza","ppsf":635,"vol":14,"price":2050000},{"slug":"cambrian-park-estates","name":"Cambrian Park Estates","ppsf":632,"vol":8,"price":1800000}],"tracts":{"annabelle":{"name":"Annabelle","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":889,"price":1812500,"n":10},"all_n":21,"yr":1948},"apricot-avenue-condominiums":{"name":"Apricot Avenue Condominiums","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":null,"price":null,"n":1},"all_n":10,"yr":1982},"aquino-park":{"name":"Aquino Park","h1":{"ppsf":null,"price":null,"n":2},"h3":{"ppsf":1621,"price":3400000,"n":4},"h5":{"ppsf":1145,"price":2200000,"n":7},"h10":{"ppsf":884,"price":1700000,"n":13},"all_n":30,"yr":1948},"arden-homesites":{"name":"Arden Homesites","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":1062,"price":1625000,"n":5},"h10":{"ppsf":917,"price":1582500,"n":6},"all_n":14,"yr":1947},"arroyo-seco-manor":{"name":"Arroyo Seco Manor","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":1349,"price":2623750,"n":4},"h5":{"ppsf":1350,"price":2375000,"n":11},"h10":{"ppsf":1027,"price":1900000,"n":23},"all_n":53,"yr":1955},"broadview-acres":{"name":"Broadview Acres","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":null,"price":null,"n":3},"all_n":9,"yr":1950},"brookside-court":{"name":"Brookside Court","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":1290,"price":1787500,"n":4},"h10":{"ppsf":1084,"price":1512500,"n":6},"all_n":10,"yr":1948},"brookside-manor":{"name":"Brookside Manor","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":738,"price":967500,"n":6},"all_n":17,"yr":1955},"cambrian-park-estates":{"name":"Cambrian Park Estates","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":621,"price":1800000,"n":7},"all_n":13,"yr":1952},"cambrian-village":{"name":"Cambrian Village","h1":{"ppsf":1274,"price":2277000,"n":5},"h3":{"ppsf":1241,"price":2248500,"n":6},"h5":{"ppsf":1207,"price":2247000,"n":7},"h10":{"ppsf":821,"price":1630000,"n":13},"all_n":33,"yr":1952},"cameo-lane":{"name":"Cameo Lane","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":853,"price":1830000,"n":5},"all_n":10,"yr":1961},"cameo-manor":{"name":"Cameo Manor","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":1201,"price":1632500,"n":6},"h10":{"ppsf":1103,"price":1562500,"n":10},"all_n":27,"yr":1963},"cameo-park-west":{"name":"Cameo Park West","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":1374,"price":2712500,"n":4},"h5":{"ppsf":1344,"price":2425000,"n":7},"h10":{"ppsf":1177,"price":2200000,"n":14},"all_n":33,"yr":1967},"campbell-gardens":{"name":"Campbell Gardens","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":904,"price":2100000,"n":6},"all_n":10,"yr":1949},"campbell-manor":{"name":"Campbell Manor","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":null,"price":null,"n":3},"all_n":11,"yr":1950},"campus-view":{"name":"Campus View","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":865,"price":1446000,"n":6},"all_n":8,"yr":1948},"cedar-ridge":{"name":"Cedar Ridge","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":768,"price":912500,"n":10},"all_n":16,"yr":1984},"central-park":{"name":"Central Park","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":1261,"price":1933250,"n":4},"h5":{"ppsf":1189,"price":2043000,"n":5},"h10":{"ppsf":858,"price":1482500,"n":16},"all_n":46,"yr":1962},"chalet-woods-amd":{"name":"Chalet Woods Amd","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":933,"price":1400000,"n":9},"h10":{"ppsf":900,"price":1350000,"n":13},"all_n":18,"yr":1995},"cherry-lane":{"name":"Cherry Lane","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":1145,"price":2496500,"n":6},"h10":{"ppsf":840,"price":1944500,"n":14},"all_n":31,"yr":1963},"claralinda":{"name":"Claralinda","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":1466,"price":1807250,"n":6},"h5":{"ppsf":1440,"price":1807250,"n":8},"h10":{"ppsf":1082,"price":1500000,"n":15},"all_n":53,"yr":1959},"cook":{"name":"Cook","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":1159,"price":1285000,"n":4},"all_n":11,"yr":1948},"coral-manor":{"name":"Coral Manor","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":1255,"price":2400000,"n":4},"h10":{"ppsf":819,"price":2200000,"n":11},"all_n":33,"yr":1951},"coventry-village":{"name":"Coventry Village","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":1276,"price":1870000,"n":7},"h10":{"ppsf":1072,"price":1520000,"n":15},"all_n":45,"yr":1960},"crystal-manor":{"name":"Crystal Manor","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":1080,"price":2422000,"n":6},"all_n":11,"yr":1950},"dahls":{"name":"Dahls","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":863,"price":1305000,"n":6},"all_n":16,"yr":1940},"dry-creek-place":{"name":"Dry Creek Place","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":692,"price":1220000,"n":7},"all_n":21,"yr":1980},"dry-creek-ranch":{"name":"Dry Creek Ranch","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":1372,"price":2575000,"n":4},"h10":{"ppsf":839,"price":1850000,"n":9},"all_n":21,"yr":1958},"e-n-parr":{"name":"E N Parr","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":1078,"price":1875000,"n":6},"all_n":19,"yr":1949},"e-r-kennedy":{"name":"E R Kennedy","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":828,"price":1381250,"n":8},"all_n":16,"yr":1949},"east-17-twnhs":{"name":"East 17 Twnhs","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":587,"price":892750,"n":6},"all_n":13,"yr":1984},"el-rancho-california":{"name":"El Rancho California","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":null,"price":null,"n":2},"all_n":9,"yr":1947},"el-solyo":{"name":"El Solyo","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":null,"price":null,"n":2},"all_n":12,"yr":1952},"ellen-acres":{"name":"Ellen Acres","h1":{"ppsf":null,"price":null,"n":3},"h3":{"ppsf":1360,"price":1950000,"n":6},"h5":{"ppsf":1360,"price":1900000,"n":8},"h10":{"ppsf":1212,"price":1690000,"n":13},"all_n":26,"yr":1951},"excelsior-manor":{"name":"Excelsior Manor","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":1045,"price":1350000,"n":5},"all_n":17,"yr":1956},"fairlands":{"name":"Fairlands","h1":{"ppsf":1576,"price":2128000,"n":5},"h3":{"ppsf":1421,"price":2020000,"n":7},"h5":{"ppsf":1236,"price":1870000,"n":18},"h10":{"ppsf":967,"price":1480000,"n":34},"all_n":73,"yr":1960},"fairmeadow":{"name":"Fairmeadow","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":728,"price":881250,"n":10},"all_n":40,"yr":1973},"fenley-park":{"name":"Fenley Park","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":863,"price":1550000,"n":5},"all_n":15,"yr":1951},"garrison":{"name":"Garrison","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":525,"price":1992750,"n":6},"all_n":9,"yr":1947},"green-bonnet-terrace":{"name":"Green Bonnet Terrace","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":948,"price":1850000,"n":5},"all_n":15,"yr":1953},"hacienda-village":{"name":"Hacienda Village","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":1286,"price":2060000,"n":6},"h10":{"ppsf":1283,"price":1720000,"n":7},"all_n":16,"yr":1960},"hamilton-condos":{"name":"Hamilton Condos","h1":{"ppsf":823,"price":665000,"n":6},"h3":{"ppsf":817,"price":684500,"n":24},"h5":{"ppsf":778,"price":667500,"n":42},"h10":{"ppsf":741,"price":650000,"n":69},"all_n":161,"yr":1971},"hazelwood":{"name":"Hazelwood","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":949,"price":1900000,"n":5},"h5":{"ppsf":1127,"price":1865000,"n":6},"h10":{"ppsf":837,"price":1830000,"n":9},"all_n":20,"yr":1959},"hedegard":{"name":"Hedegard","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":596,"price":1700000,"n":6},"all_n":20,"yr":1946},"hidden-lane-condo":{"name":"Hidden Lane Condo","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":735,"price":585000,"n":8},"all_n":19,"yr":1984},"husted-gardens":{"name":"Husted Gardens","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":1399,"price":2500000,"n":5},"h10":{"ppsf":1186,"price":2400000,"n":8},"all_n":16,"yr":1950},"hyde-residence-park":{"name":"Hyde Residence Park","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":1011,"price":1687500,"n":6},"h10":{"ppsf":857,"price":1625000,"n":9},"all_n":14,"yr":1937},"kirkwood-plaza":{"name":"Kirkwood Plaza","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":635,"price":2050000,"n":14},"all_n":15,"yr":1961},"kuehnis-estates":{"name":"Kuehnis Estates","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":865,"price":1350000,"n":5},"h10":{"ppsf":794,"price":1285750,"n":14},"all_n":35,"yr":1954},"latimer-manor":{"name":"Latimer Manor","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":569,"price":1145000,"n":4},"all_n":8,"yr":1950},"latimer-park":{"name":"Latimer Park","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":1488,"price":1962500,"n":4},"h5":{"ppsf":1303,"price":1696000,"n":12},"h10":{"ppsf":1079,"price":1455000,"n":27},"all_n":62,"yr":1957},"lawndale":{"name":"Lawndale","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":626,"price":1950000,"n":6},"h10":{"ppsf":626,"price":1950000,"n":6},"all_n":9,"yr":1958},"leigh-glen":{"name":"Leigh Glen","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":947,"price":2500000,"n":4},"all_n":13,"yr":1962},"los-palos":{"name":"Los Palos","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":733,"price":1250000,"n":11},"all_n":15,"yr":1947},"los-ranchitos-gardens":{"name":"Los Ranchitos Gardens","h1":{"ppsf":1186,"price":1569000,"n":4},"h3":{"ppsf":1281,"price":1975000,"n":14},"h5":{"ppsf":1246,"price":1925000,"n":20},"h10":{"ppsf":1091,"price":1506500,"n":46},"all_n":113,"yr":1957},"lovejoy":{"name":"Lovejoy","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":938,"price":1930000,"n":6},"all_n":16,"yr":1950},"lovell":{"name":"Lovell","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":1006,"price":2240000,"n":4},"h10":{"ppsf":903,"price":1848250,"n":8},"all_n":17,"yr":1956},"magnolia-lane":{"name":"Magnolia Lane","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":645,"price":732500,"n":8},"all_n":20,"yr":1979},"manchester-village":{"name":"Manchester Village","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":730,"price":1788000,"n":7},"all_n":13,"yr":1956},"mccbain":{"name":"Mccbain","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":805,"price":1794000,"n":4},"all_n":9,"yr":1947},"oakhaven":{"name":"Oakhaven","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":640,"price":1180000,"n":4},"h10":{"ppsf":708,"price":1370000,"n":5},"all_n":13,"yr":1951},"parrview":{"name":"Parrview","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":939,"price":2300000,"n":7},"all_n":19,"yr":1949},"pepper-tree-terrace-condo":{"name":"Pepper Tree Terrace Condo","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":657,"price":775000,"n":7},"all_n":14,"yr":1988},"pruneyard-villas":{"name":"Pruneyard Villas","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":947,"price":975000,"n":7},"h10":{"ppsf":882,"price":951500,"n":12},"all_n":25,"yr":1979},"rancho-del-prado":{"name":"Rancho Del Prado","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":870,"price":1472500,"n":16},"all_n":59,"yr":1973},"rees":{"name":"Rees","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":1042,"price":1850000,"n":4},"all_n":19,"yr":1947},"rinconada-de-los-gatos":{"name":"Rinconada De Los Gatos","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":845,"price":2650000,"n":5},"all_n":10,"yr":1964},"rinconada-de-los-gatos-rho":{"name":"Rinconada De Los Gatos Rho","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":null,"price":null,"n":1},"all_n":17,"yr":1963},"ruckers":{"name":"Ruckers","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":694,"price":2250000,"n":6},"all_n":8,"yr":1940},"san-aquino":{"name":"San Aquino","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":null,"price":null,"n":2},"all_n":13,"yr":1947},"san-tomas-terrace":{"name":"San Tomas Terrace","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":null,"price":null,"n":1},"all_n":11,"yr":1963},"san-tomas-villas":{"name":"San Tomas Villas","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":943,"price":1642500,"n":6},"all_n":12,"yr":1952},"shadow-woods":{"name":"Shadow Woods","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":795,"price":1587500,"n":10},"all_n":34,"yr":1956},"shadowbrook":{"name":"Shadowbrook","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":853,"price":1495000,"n":9},"all_n":20,"yr":1958},"shady-acres":{"name":"Shady Acres","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":1170,"price":1935000,"n":6},"h5":{"ppsf":1262,"price":2000000,"n":7},"h10":{"ppsf":941,"price":1612500,"n":18},"all_n":40,"yr":1953},"shady-dale":{"name":"Shady Dale","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":null,"price":null,"n":2},"all_n":9,"yr":1953},"sigal":{"name":"Sigal","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":914,"price":1452000,"n":9},"all_n":25,"yr":1955},"strom":{"name":"Strom","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":1446,"price":1515000,"n":5},"all_n":9,"yr":1929},"sunberry-gardens":{"name":"Sunberry Gardens","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":1036,"price":1182500,"n":6},"all_n":13,"yr":1954},"sunnybrook-gardens":{"name":"Sunnybrook Gardens","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":1243,"price":1650000,"n":4},"h10":{"ppsf":933,"price":1430000,"n":13},"all_n":24,"yr":1959},"sunnyhaven":{"name":"Sunnyhaven","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":1197,"price":2000000,"n":5},"h10":{"ppsf":1038,"price":1530000,"n":11},"all_n":39,"yr":1962},"sunnylane":{"name":"Sunnylane","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":1207,"price":1725000,"n":5},"all_n":11,"yr":1947},"sunnyoak-manor":{"name":"Sunnyoak Manor","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":3},"h10":{"ppsf":890,"price":1571000,"n":4},"all_n":11,"yr":1950},"sunnyoaks":{"name":"Sunnyoaks","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":null,"price":null,"n":2},"all_n":8,"yr":1968},"sunnyoaks-meadows":{"name":"Sunnyoaks Meadows","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":558,"price":1900000,"n":5},"all_n":10,"yr":1962},"sunnyside":{"name":"Sunnyside","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":1044,"price":1890000,"n":4},"h10":{"ppsf":849,"price":1685000,"n":6},"all_n":12,"yr":1944},"townhouse-west":{"name":"Townhouse West","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":null,"price":null,"n":3},"all_n":10,"yr":1981},"valley-forge":{"name":"Valley Forge","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":726,"price":610000,"n":4},"h10":{"ppsf":744,"price":625000,"n":9},"all_n":19,"yr":1964},"virginia-manor":{"name":"Virginia Manor","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":1028,"price":3400000,"n":4},"h10":{"ppsf":1073,"price":3300000,"n":5},"all_n":10,"yr":1952},"vista-de-las-montanas":{"name":"Vista De Las Montanas","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":712,"price":2130000,"n":5},"all_n":11,"yr":1977},"w-j-parr":{"name":"W J Parr","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":652,"price":1590000,"n":4},"all_n":13,"yr":1966},"walnut-dell":{"name":"Walnut Dell","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":null,"price":null,"n":3},"all_n":8,"yr":1952},"west-willow-glen-gardens":{"name":"West Willow Glen Gardens","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":2},"h5":{"ppsf":null,"price":null,"n":2},"h10":{"ppsf":842,"price":1685000,"n":6},"all_n":15,"yr":1955},"westchester-park":{"name":"Westchester Park","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":1168,"price":2147000,"n":6},"h5":{"ppsf":1129,"price":2075000,"n":7},"h10":{"ppsf":1010,"price":1742500,"n":16},"all_n":43,"yr":1955},"western-manor":{"name":"Western Manor","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":1350,"price":1825000,"n":5},"all_n":16,"yr":1947},"westmont-estates":{"name":"Westmont Estates","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":0},"h10":{"ppsf":820,"price":1507500,"n":8},"all_n":19,"yr":1966},"westmont-park":{"name":"Westmont Park","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":0},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":null,"price":null,"n":3},"all_n":11,"yr":1967},"white-oaks-manor":{"name":"White Oaks Manor","h1":{"ppsf":1481,"price":2120000,"n":4},"h3":{"ppsf":1409,"price":1960000,"n":6},"h5":{"ppsf":1229,"price":1805000,"n":10},"h10":{"ppsf":937,"price":1400000,"n":23},"all_n":60,"yr":1955},"whiteoaks-village":{"name":"Whiteoaks Village","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":817,"price":1084000,"n":4},"h10":{"ppsf":739,"price":980000,"n":8},"all_n":18,"yr":1980},"winchester-villa":{"name":"Winchester Villa","h1":{"ppsf":null,"price":null,"n":0},"h3":{"ppsf":null,"price":null,"n":1},"h5":{"ppsf":null,"price":null,"n":1},"h10":{"ppsf":891,"price":1620000,"n":5},"all_n":9,"yr":1949},"yates":{"name":"Yates","h1":{"ppsf":null,"price":null,"n":1},"h3":{"ppsf":null,"price":null,"n":3},"h5":{"ppsf":977,"price":2269000,"n":4},"h10":{"ppsf":712,"price":1200000,"n":13},"all_n":29,"yr":1949}},"by_bed":{"2":1680000,"3":1950000,"4":2248000,"5":3000000},"spread":{"hi":{"slug":"ellen-acres","name":"Ellen Acres","ppsf":1212,"vol":13,"price":1690000},"lo":{"slug":"kirkwood-plaza","name":"Kirkwood Plaza","ppsf":635,"vol":14,"price":2050000},"ratio":1.9},"most_active":{"slug":"hamilton-condos","name":"Hamilton Condos","ppsf":741,"vol":69,"price":650000}}`;
const TRACTS_JSON = `{"hamilton-condos":{"name":"Hamilton Condos","n":215,"type":"Condominium","mv":656000,"yr":1971,"hoa":"Hamilton Downs Homeowners Association","numbered":false},"los-ranchitos-gardens":{"name":"Los Ranchitos Gardens","n":155,"type":"Single Family","mv":1763000,"yr":1957,"hoa":null,"numbered":false},"fairlands":{"name":"Fairlands","n":105,"type":"Single Family","mv":2007000,"yr":1960,"hoa":null,"numbered":false},"latimer-park":{"name":"Latimer Park","n":97,"type":"Single Family","mv":2075000,"yr":1957,"hoa":null,"numbered":false},"white-oaks-manor":{"name":"White Oaks Manor","n":84,"type":"Single Family","mv":1990500,"yr":1955,"hoa":null,"numbered":false},"rancho-del-prado":{"name":"Rancho Del Prado","n":83,"type":"Single Family","mv":2020000,"yr":1973,"hoa":null,"numbered":false},"claralinda":{"name":"Claralinda","n":78,"type":"Single Family","mv":1896000,"yr":1959,"hoa":null,"numbered":false},"arroyo-seco-manor":{"name":"Arroyo Seco Manor","n":70,"type":"Single Family","mv":2545000,"yr":1955,"hoa":null,"numbered":false},"coventry-village":{"name":"Coventry Village","n":69,"type":"Single Family","mv":2048000,"yr":1960,"hoa":null,"numbered":false},"shady-acres":{"name":"Shady Acres","n":62,"type":"Single Family","mv":2045000,"yr":1953,"hoa":null,"numbered":false},"kuehnis-estates":{"name":"Kuehnis Estates","n":60,"type":"Single Family","mv":1816500,"yr":1954,"hoa":null,"numbered":false},"central-park":{"name":"Central Park","n":60,"type":"Single Family","mv":1919000,"yr":1962,"hoa":null,"numbered":false},"fairmeadow":{"name":"Fairmeadow","n":56,"type":"Condominium","mv":1208500,"yr":1973,"hoa":"Fairmeadow Homeowners Association","numbered":false},"westchester-park":{"name":"Westchester Park","n":52,"type":"Single Family","mv":2111500,"yr":1955,"hoa":null,"numbered":false},"coral-manor":{"name":"Coral Manor","n":51,"type":"Single Family","mv":2262000,"yr":1951,"hoa":null,"numbered":false},"cambrian-village":{"name":"Cambrian Village","n":50,"type":"Single Family","mv":2286500,"yr":1952,"hoa":null,"numbered":false},"sunnyhaven":{"name":"Sunnyhaven","n":47,"type":"Single Family","mv":2055000,"yr":1962,"hoa":null,"numbered":false},"aquino-park":{"name":"Aquino Park","n":47,"type":"Single Family","mv":2444000,"yr":1948,"hoa":null,"numbered":false},"shadow-woods":{"name":"Shadow Woods","n":46,"type":"Single Family","mv":1936000,"yr":1956,"hoa":null,"numbered":false},"yates":{"name":"Yates","n":42,"type":"Single Family","mv":1725500,"yr":1948,"hoa":null,"numbered":false},"cameo-park-west":{"name":"Cameo Park West","n":40,"type":"Single Family","mv":2386000,"yr":1967,"hoa":null,"numbered":false},"cherry-lane":{"name":"Cherry Lane","n":40,"type":"Single Family","mv":2605500,"yr":1964,"hoa":null,"numbered":false},"sigal":{"name":"Sigal","n":38,"type":"Single Family","mv":2020000,"yr":1955,"hoa":null,"numbered":false},"ellen-acres":{"name":"Ellen Acres","n":38,"type":"Single Family","mv":1975000,"yr":1950,"hoa":null,"numbered":false},"hedegard":{"name":"Hedegard","n":35,"type":"Single Family","mv":2033000,"yr":1946,"hoa":null,"numbered":false},"cameo-manor":{"name":"Cameo Manor","n":35,"type":"Single Family","mv":2003000,"yr":1961,"hoa":null,"numbered":false},"sunnybrook-gardens":{"name":"Sunnybrook Gardens","n":33,"type":"Single Family","mv":1811000,"yr":1959,"hoa":null,"numbered":false},"westmont-estates":{"name":"Westmont Estates","n":30,"type":"Single Family","mv":2096500,"yr":1966,"hoa":"Latimer Condominium Association","numbered":false},"pruneyard-villas":{"name":"Pruneyard Villas","n":30,"type":"Condominium","mv":1074000,"yr":1979,"hoa":"Pruneyard Villas","numbered":false},"hazelwood":{"name":"Hazelwood","n":29,"type":"Single Family","mv":2364000,"yr":1949,"hoa":null,"numbered":false},"excelsior-manor":{"name":"Excelsior Manor","n":28,"type":"Single Family","mv":1690000,"yr":1956,"hoa":null,"numbered":false},"annabelle":{"name":"Annabelle","n":27,"type":"Single Family","mv":2008000,"yr":1948,"hoa":null,"numbered":false},"e-n-parr":{"name":"E N Parr","n":27,"type":"Single Family","mv":2235000,"yr":1949,"hoa":null,"numbered":false},"brookside-manor":{"name":"Brookside Manor","n":27,"type":"Single Family","mv":1789000,"yr":1955,"hoa":null,"numbered":false},"dry-creek-place":{"name":"Dry Creek Place","n":26,"type":"Single Family","mv":1286000,"yr":1980,"hoa":"Dry Creek Place Homeowners Association","numbered":false},"dry-creek-ranch":{"name":"Dry Creek Ranch","n":25,"type":"Single Family","mv":2584000,"yr":1958,"hoa":null,"numbered":false},"hacienda-village":{"name":"Hacienda Village","n":25,"type":"Single Family","mv":2222000,"yr":1960,"hoa":"Hacienda Village Hoa","numbered":false},"rees":{"name":"Rees","n":25,"type":"Single Family","mv":1904000,"yr":1947,"hoa":null,"numbered":false},"lovell":{"name":"Lovell","n":24,"type":"Single Family","mv":2235000,"yr":1954,"hoa":"Hestia Residences Owners Association","numbered":false},"rinconada-de-los-gatos-rho":{"name":"Rinconada De Los Gatos Rho","n":24,"type":"Single Family","mv":2396500,"yr":1962,"hoa":null,"numbered":false},"shadowbrook":{"name":"Shadowbrook","n":24,"type":"Single Family","mv":2057000,"yr":1958,"hoa":null,"numbered":false},"hidden-lane-condo":{"name":"Hidden Lane Condo","n":24,"type":"Condominium","mv":599500,"yr":1984,"hoa":"Hidden Lane","numbered":false},"e-r-kennedy":{"name":"E R Kennedy","n":24,"type":"Single Family","mv":1717500,"yr":1949,"hoa":null,"numbered":false},"sunberry-gardens":{"name":"Sunberry Gardens","n":23,"type":"Single Family","mv":1748000,"yr":1954,"hoa":null,"numbered":false},"lovejoy":{"name":"Lovejoy","n":23,"type":"Single Family","mv":2163000,"yr":1950,"hoa":null,"numbered":false},"los-palos":{"name":"Los Palos","n":23,"type":"Single Family","mv":1827000,"yr":1947,"hoa":null,"numbered":false},"valley-forge":{"name":"Valley Forge","n":22,"type":"Condominium","mv":642000,"yr":1964,"hoa":"Valley Forge Ii Hoa","numbered":false},"parrview":{"name":"Parrview","n":22,"type":"Single Family","mv":2650000,"yr":1949,"hoa":null,"numbered":false},"hyde-residence-park":{"name":"Hyde Residence Park","n":22,"type":"Single Family","mv":1895000,"yr":1929,"hoa":null,"numbered":false},"green-bonnet-terrace":{"name":"Green Bonnet Terrace","n":22,"type":"Single Family","mv":1981500,"yr":1953,"hoa":null,"numbered":false},"arden-homesites":{"name":"Arden Homesites","n":21,"type":"Single Family","mv":2258000,"yr":1947,"hoa":null,"numbered":false},"san-tomas-terrace":{"name":"San Tomas Terrace","n":21,"type":"Multi-family","mv":1841000,"yr":1963,"hoa":null,"numbered":false},"dahls":{"name":"Dahls","n":20,"type":"Single Family","mv":1697000,"yr":1940,"hoa":null,"numbered":false},"whiteoaks-village":{"name":"Whiteoaks Village","n":20,"type":"Condominium","mv":1019000,"yr":1980,"hoa":"White Oaks Village","numbered":false},"magnolia-lane":{"name":"Magnolia Lane","n":20,"type":"Condominium","mv":776500,"yr":1979,"hoa":"Magnolia Lane","numbered":false},"husted-gardens":{"name":"Husted Gardens","n":20,"type":"Single Family","mv":2426000,"yr":1951,"hoa":null,"numbered":false},"cedar-ridge":{"name":"Cedar Ridge","n":20,"type":"Condominium","mv":1059500,"yr":1984,"hoa":"Vistamont","numbered":false},"fenley-park":{"name":"Fenley Park","n":20,"type":"Single Family","mv":2026000,"yr":1951,"hoa":null,"numbered":false},"w-j-parr":{"name":"W J Parr","n":20,"type":"Single Family","mv":2496000,"yr":1954,"hoa":null,"numbered":false},"sunnyoak-manor":{"name":"Sunnyoak Manor","n":20,"type":"Single Family","mv":1917500,"yr":1950,"hoa":null,"numbered":false},"chalet-woods-amd":{"name":"Chalet Woods Amd","n":19,"type":"Condominium","mv":1537000,"yr":1995,"hoa":"Chalet Woods Of Campbell Hoa","numbered":false},"western-manor":{"name":"Western Manor","n":19,"type":"Single Family","mv":2027000,"yr":1947,"hoa":null,"numbered":false},"san-tomas-villas":{"name":"San Tomas Villas","n":19,"type":"Single Family","mv":2089000,"yr":1952,"hoa":"Twin Oaks Community Association","numbered":false},"west-willow-glen-gardens":{"name":"West Willow Glen Gardens","n":19,"type":"Single Family","mv":2182000,"yr":1955,"hoa":null,"numbered":false},"leigh-glen":{"name":"Leigh Glen","n":19,"type":"Single Family","mv":2688000,"yr":1962,"hoa":null,"numbered":false},"oakhaven":{"name":"Oakhaven","n":18,"type":"Single Family","mv":2201000,"yr":1951,"hoa":null,"numbered":false},"manchester-village":{"name":"Manchester Village","n":17,"type":"Single Family","mv":2271000,"yr":1956,"hoa":null,"numbered":false},"sunnylane":{"name":"Sunnylane","n":17,"type":"Single Family","mv":2626000,"yr":1947,"hoa":null,"numbered":false},"san-aquino":{"name":"San Aquino","n":17,"type":"Single Family","mv":2234000,"yr":1947,"hoa":null,"numbered":false},"kirkwood-plaza":{"name":"Kirkwood Plaza","n":16,"type":"Multi-family","mv":2400500,"yr":1961,"hoa":null,"numbered":false},"east-17-twnhs":{"name":"East 17 Twnhs","n":16,"type":"Condominium","mv":1308000,"yr":1984,"hoa":"East 17 Town House Hoa","numbered":false},"el-solyo":{"name":"El Solyo","n":16,"type":"Single Family","mv":2575500,"yr":1950,"hoa":null,"numbered":false},"campbell-manor":{"name":"Campbell Manor","n":16,"type":"Single Family","mv":2125500,"yr":1950,"hoa":"Campbell Manor","numbered":false},"pepper-tree-terrace-condo":{"name":"Pepper Tree Terrace Condo","n":16,"type":"Condominium","mv":934000,"yr":1988,"hoa":"Pepper Tree Terrace Condo","numbered":false},"shady-dale":{"name":"Shady Dale","n":15,"type":"Single Family","mv":2611000,"yr":1953,"hoa":null,"numbered":false},"ruckers":{"name":"Ruckers","n":15,"type":"Other","mv":1561722,"yr":1976,"hoa":"Madison Townhomes","numbered":false},"sunnyoaks-meadows":{"name":"Sunnyoaks Meadows","n":15,"type":"Multi-family","mv":1852000,"yr":1962,"hoa":null,"numbered":false},"mccbain":{"name":"Mccbain","n":15,"type":"Single Family","mv":1866000,"yr":1947,"hoa":null,"numbered":false},"campbell-gardens":{"name":"Campbell Gardens","n":15,"type":"Single Family","mv":2579000,"yr":1949,"hoa":null,"numbered":false},"vista-de-las-montanas":{"name":"Vista De Las Montanas","n":15,"type":"Single Family","mv":2815000,"yr":1958,"hoa":null,"numbered":false},"crystal-manor":{"name":"Crystal Manor","n":15,"type":"Single Family","mv":2375000,"yr":1950,"hoa":null,"numbered":false},"brookside-court":{"name":"Brookside Court","n":14,"type":"Single Family","mv":1708000,"yr":1947,"hoa":null,"numbered":false},"cambrian-park-estates":{"name":"Cambrian Park Estates","n":14,"type":"Single Family","mv":2264000,"yr":1952,"hoa":null,"numbered":false},"sunnyside":{"name":"Sunnyside","n":14,"type":"Single Family","mv":1800500,"yr":1955,"hoa":"Kennedy Manor Hoa","numbered":false},"westmont-park":{"name":"Westmont Park","n":14,"type":"Single Family","mv":1843000,"yr":1967,"hoa":null,"numbered":false},"garrison":{"name":"Garrison","n":14,"type":"Single Family","mv":2898500,"yr":1947,"hoa":null,"numbered":false},"winchester-villa":{"name":"Winchester Villa","n":14,"type":"Single Family","mv":1719000,"yr":1948,"hoa":null,"numbered":false},"hacienda-heights-twnhms":{"name":"Hacienda Heights Twnhms","n":13,"type":"Single Family","mv":1926000,"yr":1995,"hoa":"Hacienda Townhomes Of San Jose","numbered":false},"cook":{"name":"Cook","n":13,"type":"Single Family","mv":2080000,"yr":1948,"hoa":null,"numbered":false},"arroyo-gardens":{"name":"Arroyo Gardens","n":13,"type":"Single Family","mv":2240000,"yr":1957,"hoa":null,"numbered":false},"apricot-avenue-condominiums":{"name":"Apricot Avenue Condominiums","n":12,"type":"Condominium","mv":766000,"yr":1982,"hoa":"Apricot Avenue Condominium","numbered":false},"rinconada-de-los-gatos":{"name":"Rinconada De Los Gatos","n":12,"type":"Single Family","mv":2524500,"yr":1972,"hoa":null,"numbered":false},"townhouse-west":{"name":"Townhouse West","n":12,"type":"Condominium","mv":1455000,"yr":1981,"hoa":"Townhouse West Homeowners Association","numbered":false},"el-rancho-california":{"name":"El Rancho California","n":12,"type":"Single Family","mv":2164500,"yr":1947,"hoa":"Bear Creek Canyon Road Association Inc","numbered":false},"sunnyoaks":{"name":"Sunnyoaks","n":11,"type":"Single Family","mv":1928000,"yr":1965,"hoa":"Sunnyoaks","numbered":false},"strom":{"name":"Strom","n":11,"type":"Single Family","mv":1725000,"yr":1922,"hoa":null,"numbered":false},"lawndale":{"name":"Lawndale","n":11,"type":"Multi-family","mv":1840000,"yr":1958,"hoa":null,"numbered":false},"latimer-manor":{"name":"Latimer Manor","n":11,"type":"Single Family","mv":2125000,"yr":1950,"hoa":null,"numbered":false},"broadview-acres":{"name":"Broadview Acres","n":11,"type":"Single Family","mv":2180000,"yr":1950,"hoa":null,"numbered":false},"cameo-lane":{"name":"Cameo Lane","n":11,"type":"Single Family","mv":2052000,"yr":1961,"hoa":null,"numbered":false},"classics-at-kilmer-park":{"name":"Classics At Kilmer Park","n":10,"type":"Single Family","mv":2264000,"yr":2006,"hoa":"Classics At Kilmer Park","numbered":false},"virginia-manor":{"name":"Virginia Manor","n":10,"type":"Single Family","mv":2618000,"yr":1952,"hoa":null,"numbered":false},"walnut-dell":{"name":"Walnut Dell","n":10,"type":"Single Family","mv":1863500,"yr":1952,"hoa":null,"numbered":false},"mazzone":{"name":"Mazzone","n":10,"type":"Single Family","mv":1760500,"yr":1941,"hoa":null,"numbered":false},"campus-view":{"name":"Campus View","n":10,"type":"Single Family","mv":2567000,"yr":1948,"hoa":null,"numbered":false}}`;
const STATS_JSON = `{"generated":"2026-07-15","city":{"properties":6609,"streets":498,"tracts":740,"named_tracts":105,"median_value":1882000,"median_year_built":1963,"sfh":4428,"condo":1589,"multi":341,"sales_12mo":126,"median_price_12mo":1775000,"owner_occupied_pct":67},"sfh_median_by_beds":{"2":1823000,"3":1948000,"4":2179000,"5":2601500},"top_tracts":[{"slug":"hamilton-condos","name":"Hamilton Condos","n":215,"type":"Condominium","mv":656000,"yr":1971},{"slug":"los-ranchitos-gardens","name":"Los Ranchitos Gardens","n":155,"type":"Single Family","mv":1763000,"yr":1957},{"slug":"fairlands","name":"Fairlands","n":105,"type":"Single Family","mv":2007000,"yr":1960},{"slug":"latimer-park","name":"Latimer Park","n":97,"type":"Single Family","mv":2075000,"yr":1957},{"slug":"white-oaks-manor","name":"White Oaks Manor","n":84,"type":"Single Family","mv":1990500,"yr":1955},{"slug":"rancho-del-prado","name":"Rancho Del Prado","n":83,"type":"Single Family","mv":2020000,"yr":1973},{"slug":"claralinda","name":"Claralinda","n":78,"type":"Single Family","mv":1896000,"yr":1959},{"slug":"arroyo-seco-manor","name":"Arroyo Seco Manor","n":70,"type":"Single Family","mv":2545000,"yr":1955},{"slug":"coventry-village","name":"Coventry Village","n":69,"type":"Single Family","mv":2048000,"yr":1960},{"slug":"shady-acres","name":"Shady Acres","n":62,"type":"Single Family","mv":2045000,"yr":1953},{"slug":"kuehnis-estates","name":"Kuehnis Estates","n":60,"type":"Single Family","mv":1816500,"yr":1954},{"slug":"central-park","name":"Central Park","n":60,"type":"Single Family","mv":1919000,"yr":1962},{"slug":"fairmeadow","name":"Fairmeadow","n":56,"type":"Condominium","mv":1208500,"yr":1973},{"slug":"westchester-park","name":"Westchester Park","n":52,"type":"Single Family","mv":2111500,"yr":1955},{"slug":"coral-manor","name":"Coral Manor","n":51,"type":"Single Family","mv":2262000,"yr":1951},{"slug":"cambrian-village","name":"Cambrian Village","n":50,"type":"Single Family","mv":2286500,"yr":1952},{"slug":"sunnyhaven","name":"Sunnyhaven","n":47,"type":"Single Family","mv":2055000,"yr":1962},{"slug":"aquino-park","name":"Aquino Park","n":47,"type":"Single Family","mv":2444000,"yr":1948},{"slug":"shadow-woods","name":"Shadow Woods","n":46,"type":"Single Family","mv":1936000,"yr":1956},{"slug":"yates","name":"Yates","n":42,"type":"Single Family","mv":1725500,"yr":1948},{"slug":"cameo-park-west","name":"Cameo Park West","n":40,"type":"Single Family","mv":2386000,"yr":1967},{"slug":"cherry-lane","name":"Cherry Lane","n":40,"type":"Single Family","mv":2605500,"yr":1964},{"slug":"sigal","name":"Sigal","n":38,"type":"Single Family","mv":2020000,"yr":1955},{"slug":"ellen-acres","name":"Ellen Acres","n":38,"type":"Single Family","mv":1975000,"yr":1950}],"sales_by_year":{"2014":179,"2015":175,"2016":177,"2017":233,"2018":191,"2019":176,"2020":234,"2021":349,"2022":196,"2023":138,"2024":180,"2025":135,"2026":64}}`;

// Per-market embedded datasets. Phase B adds the Los Gatos entries.
const LG_INTEL_JSON = "{\"generated\":\"2026-07-21\",\"totals\":{\"sales_on_record\":5934,\"median_ppsf\":1144,\"median_price_12mo\":2325000,\"sales_12mo\":219,\"tracts_tracked\":125,\"homes_indexed\":7989},\"quarters\":[{\"q\":\"2016 Q3\",\"ppsf\":673,\"n\":66,\"sf_ppsf\":737,\"sf_n\":50,\"co_ppsf\":616,\"co_n\":12},{\"q\":\"2016 Q4\",\"ppsf\":606,\"n\":62,\"sf_ppsf\":729,\"sf_n\":44,\"co_ppsf\":505,\"co_n\":9},{\"q\":\"2017 Q1\",\"ppsf\":851,\"n\":38,\"sf_ppsf\":874,\"sf_n\":33,\"co_ppsf\":null,\"co_n\":3},{\"q\":\"2017 Q2\",\"ppsf\":827,\"n\":72,\"sf_ppsf\":862,\"sf_n\":62,\"co_ppsf\":494,\"co_n\":5},{\"q\":\"2017 Q3\",\"ppsf\":872,\"n\":64,\"sf_ppsf\":919,\"sf_n\":51,\"co_ppsf\":696,\"co_n\":9},{\"q\":\"2017 Q4\",\"ppsf\":785,\"n\":62,\"sf_ppsf\":802,\"sf_n\":50,\"co_ppsf\":711,\"co_n\":10},{\"q\":\"2018 Q1\",\"ppsf\":811,\"n\":62,\"sf_ppsf\":845,\"sf_n\":47,\"co_ppsf\":743,\"co_n\":13},{\"q\":\"2018 Q2\",\"ppsf\":881,\"n\":71,\"sf_ppsf\":916,\"sf_n\":57,\"co_ppsf\":851,\"co_n\":10},{\"q\":\"2018 Q3\",\"ppsf\":902,\"n\":55,\"sf_ppsf\":908,\"sf_n\":39,\"co_ppsf\":843,\"co_n\":11},{\"q\":\"2018 Q4\",\"ppsf\":801,\"n\":44,\"sf_ppsf\":824,\"sf_n\":35,\"co_ppsf\":784,\"co_n\":5},{\"q\":\"2019 Q1\",\"ppsf\":908,\"n\":48,\"sf_ppsf\":926,\"sf_n\":38,\"co_ppsf\":568,\"co_n\":6},{\"q\":\"2019 Q2\",\"ppsf\":799,\"n\":67,\"sf_ppsf\":858,\"sf_n\":45,\"co_ppsf\":791,\"co_n\":14},{\"q\":\"2019 Q3\",\"ppsf\":793,\"n\":59,\"sf_ppsf\":894,\"sf_n\":48,\"co_ppsf\":683,\"co_n\":9},{\"q\":\"2019 Q4\",\"ppsf\":763,\"n\":63,\"sf_ppsf\":771,\"sf_n\":45,\"co_ppsf\":794,\"co_n\":11},{\"q\":\"2020 Q1\",\"ppsf\":699,\"n\":41,\"sf_ppsf\":755,\"sf_n\":25,\"co_ppsf\":685,\"co_n\":6},{\"q\":\"2020 Q2\",\"ppsf\":821,\"n\":52,\"sf_ppsf\":876,\"sf_n\":41,\"co_ppsf\":755,\"co_n\":8},{\"q\":\"2020 Q3\",\"ppsf\":898,\"n\":97,\"sf_ppsf\":936,\"sf_n\":76,\"co_ppsf\":770,\"co_n\":12},{\"q\":\"2020 Q4\",\"ppsf\":907,\"n\":83,\"sf_ppsf\":989,\"sf_n\":66,\"co_ppsf\":736,\"co_n\":11},{\"q\":\"2021 Q1\",\"ppsf\":902,\"n\":89,\"sf_ppsf\":976,\"sf_n\":71,\"co_ppsf\":744,\"co_n\":10},{\"q\":\"2021 Q2\",\"ppsf\":1011,\"n\":130,\"sf_ppsf\":1056,\"sf_n\":105,\"co_ppsf\":773,\"co_n\":16},{\"q\":\"2021 Q3\",\"ppsf\":1060,\"n\":116,\"sf_ppsf\":1199,\"sf_n\":78,\"co_ppsf\":844,\"co_n\":27},{\"q\":\"2021 Q4\",\"ppsf\":1132,\"n\":102,\"sf_ppsf\":1185,\"sf_n\":66,\"co_ppsf\":884,\"co_n\":18},{\"q\":\"2022 Q1\",\"ppsf\":1166,\"n\":71,\"sf_ppsf\":1320,\"sf_n\":41,\"co_ppsf\":1083,\"co_n\":23},{\"q\":\"2022 Q2\",\"ppsf\":1156,\"n\":90,\"sf_ppsf\":1238,\"sf_n\":55,\"co_ppsf\":879,\"co_n\":21},{\"q\":\"2022 Q3\",\"ppsf\":1136,\"n\":76,\"sf_ppsf\":1237,\"sf_n\":42,\"co_ppsf\":1090,\"co_n\":29},{\"q\":\"2022 Q4\",\"ppsf\":1051,\"n\":51,\"sf_ppsf\":1060,\"sf_n\":32,\"co_ppsf\":1054,\"co_n\":16},{\"q\":\"2023 Q1\",\"ppsf\":1110,\"n\":49,\"sf_ppsf\":1215,\"sf_n\":37,\"co_ppsf\":964,\"co_n\":10},{\"q\":\"2023 Q2\",\"ppsf\":1097,\"n\":81,\"sf_ppsf\":1267,\"sf_n\":59,\"co_ppsf\":946,\"co_n\":17},{\"q\":\"2023 Q3\",\"ppsf\":1032,\"n\":61,\"sf_ppsf\":1237,\"sf_n\":39,\"co_ppsf\":995,\"co_n\":20},{\"q\":\"2023 Q4\",\"ppsf\":1086,\"n\":64,\"sf_ppsf\":1255,\"sf_n\":44,\"co_ppsf\":1023,\"co_n\":13},{\"q\":\"2024 Q1\",\"ppsf\":1022,\"n\":63,\"sf_ppsf\":1239,\"sf_n\":36,\"co_ppsf\":1001,\"co_n\":20},{\"q\":\"2024 Q2\",\"ppsf\":1054,\"n\":94,\"sf_ppsf\":1314,\"sf_n\":58,\"co_ppsf\":978,\"co_n\":23},{\"q\":\"2024 Q3\",\"ppsf\":1230,\"n\":79,\"sf_ppsf\":1290,\"sf_n\":52,\"co_ppsf\":912,\"co_n\":19},{\"q\":\"2024 Q4\",\"ppsf\":1132,\"n\":84,\"sf_ppsf\":1287,\"sf_n\":52,\"co_ppsf\":1002,\"co_n\":24},{\"q\":\"2025 Q1\",\"ppsf\":1236,\"n\":40,\"sf_ppsf\":1356,\"sf_n\":29,\"co_ppsf\":1071,\"co_n\":9},{\"q\":\"2025 Q2\",\"ppsf\":1121,\"n\":73,\"sf_ppsf\":1257,\"sf_n\":51,\"co_ppsf\":920,\"co_n\":16},{\"q\":\"2025 Q3\",\"ppsf\":1124,\"n\":73,\"sf_ppsf\":1283,\"sf_n\":46,\"co_ppsf\":965,\"co_n\":20},{\"q\":\"2025 Q4\",\"ppsf\":1157,\"n\":46,\"sf_ppsf\":1282,\"sf_n\":37,\"co_ppsf\":971,\"co_n\":6},{\"q\":\"2026 Q1\",\"ppsf\":1099,\"n\":51,\"sf_ppsf\":1203,\"sf_n\":35,\"co_ppsf\":865,\"co_n\":12},{\"q\":\"2026 Q2\",\"ppsf\":1194,\"n\":59,\"sf_ppsf\":1401,\"sf_n\":41,\"co_ppsf\":984,\"co_n\":11},{\"q\":\"2026 Q3\",\"ppsf\":1274,\"n\":12,\"sf_ppsf\":1295,\"sf_n\":9,\"co_ppsf\":null,\"co_n\":1}],\"feed\":[{\"a\":\"233 Belmont Ave\",\"s\":\"233-belmont-ave\",\"p\":4600000,\"sf\":3002,\"ppsf\":1532,\"tract\":\"Glen Rdg Terrace\",\"ts\":\"glen-rdg-terrace\",\"d\":\"Jul 14, 2026\"},{\"a\":\"19730 Black Rd\",\"s\":\"19730-black-rd\",\"p\":1139000,\"sf\":1008,\"ppsf\":1130,\"tract\":\"Iron Pipe\",\"ts\":\"iron-pipe\",\"d\":\"Jul 14, 2026\"},{\"a\":\"156 Massol Ave\",\"s\":\"156-massol-ave\",\"p\":3645000,\"sf\":2861,\"ppsf\":1274,\"tract\":\"Almond Grove & Add\",\"ts\":\"almond-grove-add\",\"d\":\"Jul 10, 2026\"},{\"a\":\"100 Heintz Ct\",\"s\":\"100-heintz-ct\",\"p\":4900000,\"sf\":4195,\"ppsf\":1168,\"tract\":\"9127 Summerhill Blossom\",\"ts\":\"9127-summerhill-blossom\",\"d\":\"Jul 10, 2026\"},{\"a\":\"16371 Aztec Ridge Dr\",\"s\":\"16371-aztec-ridge-dr\",\"p\":6000000,\"sf\":4622,\"ppsf\":1298,\"tract\":\"Montezuma Hills\",\"ts\":\"montezuma-hills\",\"d\":\"Jul 9, 2026\"},{\"a\":\"17960 Apache Trl\",\"s\":\"17960-apache-trl\",\"p\":710000,\"sf\":1450,\"ppsf\":490,\"tract\":\"Redwood Estates Map 02\",\"ts\":\"redwood-estates-map-02\",\"d\":\"Jul 8, 2026\"},{\"a\":\"15515 Corinne Dr\",\"s\":\"15515-corinne-dr\",\"p\":2725000,\"sf\":2039,\"ppsf\":1336,\"tract\":\"Chirco Sub\",\"ts\":\"chirco-sub\",\"d\":\"Jul 6, 2026\"},{\"a\":\"118 Verde Ct\",\"s\":\"118-verde-ct\",\"p\":1650000,\"sf\":2000,\"ppsf\":825,\"tract\":null,\"ts\":null,\"d\":\"Jul 6, 2026\"},{\"a\":\"200 Surmont Dr\",\"s\":\"200-surmont-dr\",\"p\":3950000,\"sf\":3050,\"ppsf\":1295,\"tract\":\"2463 Surmont\",\"ts\":\"2463-surmont\",\"d\":\"Jul 6, 2026\"},{\"a\":\"Verde Ct\",\"s\":\"verde-ct\",\"p\":1650000,\"sf\":0,\"ppsf\":null,\"tract\":null,\"ts\":null,\"d\":\"Jul 6, 2026\"}],\"rank\":[{\"slug\":\"almond-grove-add\",\"name\":\"Almond Grove & Add\",\"ppsf\":1503,\"vol\":19,\"price\":3600000},{\"slug\":\"johnsons-add\",\"name\":\"Johnsons Add\",\"ppsf\":1425,\"vol\":9,\"price\":2350000},{\"slug\":\"alta-heights\",\"name\":\"Alta Heights\",\"ppsf\":1383,\"vol\":9,\"price\":2355000},{\"slug\":\"highland-oaks\",\"name\":\"Highland Oaks\",\"ppsf\":1368,\"vol\":12,\"price\":1750000},{\"slug\":\"nuevo-mundo\",\"name\":\"Nuevo Mundo\",\"ppsf\":1304,\"vol\":9,\"price\":3505000},{\"slug\":\"tract-no-1520\",\"name\":\"Tract No 1520\",\"ppsf\":1300,\"vol\":9,\"price\":1850000},{\"slug\":\"ridgewoode\",\"name\":\"Ridgewoode\",\"ppsf\":1296,\"vol\":8,\"price\":2950000},{\"slug\":\"kenwood-acres\",\"name\":\"Kenwood Acres\",\"ppsf\":1285,\"vol\":16,\"price\":3600000},{\"slug\":\"blossom-hill-manor\",\"name\":\"Blossom Hill Manor\",\"ppsf\":1258,\"vol\":60,\"price\":2687000},{\"slug\":\"los-gatos-terrace\",\"name\":\"Los Gatos Terrace\",\"ppsf\":1242,\"vol\":8,\"price\":2405000},{\"slug\":\"m-s-gardner-estate\",\"name\":\"M S Gardner Estate\",\"ppsf\":1239,\"vol\":8,\"price\":2700000},{\"slug\":\"loma-vista-tr\",\"name\":\"Loma Vista Tr\",\"ppsf\":1232,\"vol\":16,\"price\":2380000},{\"slug\":\"cherry-blossom-lane\",\"name\":\"Cherry Blossom Lane\",\"ppsf\":1214,\"vol\":15,\"price\":2450000},{\"slug\":\"crescent-hill\",\"name\":\"Crescent Hill\",\"ppsf\":1208,\"vol\":9,\"price\":5350000},{\"slug\":\"rio-rinconada\",\"name\":\"Rio Rinconada\",\"ppsf\":1205,\"vol\":13,\"price\":1675000},{\"slug\":\"cameo-park\",\"name\":\"Cameo Park\",\"ppsf\":1186,\"vol\":31,\"price\":1770000},{\"slug\":\"glen-rdg-park\",\"name\":\"Glen Rdg Park\",\"ppsf\":1183,\"vol\":18,\"price\":2600000},{\"slug\":\"los-gatos\",\"name\":\"Los Gatos\",\"ppsf\":1161,\"vol\":15,\"price\":2480000},{\"slug\":\"rinconada-de-los-gatos-rho\",\"name\":\"Rinconada De Los Gatos Rho\",\"ppsf\":1150,\"vol\":30,\"price\":3000000},{\"slug\":\"english-oaks\",\"name\":\"English Oaks\",\"ppsf\":1136,\"vol\":10,\"price\":2900000},{\"slug\":\"saratoga-highlands\",\"name\":\"Saratoga Highlands\",\"ppsf\":1136,\"vol\":20,\"price\":1900000},{\"slug\":\"villa-felice\",\"name\":\"Villa Felice\",\"ppsf\":1125,\"vol\":11,\"price\":3020000},{\"slug\":\"foothill-farms\",\"name\":\"Foothill Farms\",\"ppsf\":1095,\"vol\":10,\"price\":1970000},{\"slug\":\"los-gatos-creekside-village\",\"name\":\"Los Gatos Creekside Village\",\"ppsf\":1065,\"vol\":15,\"price\":1600000},{\"slug\":\"tract-no-2869\",\"name\":\"Tract No 2869\",\"ppsf\":1054,\"vol\":11,\"price\":1830000},{\"slug\":\"chirco-sub\",\"name\":\"Chirco Sub\",\"ppsf\":1031,\"vol\":10,\"price\":2300000},{\"slug\":\"fairview-add\",\"name\":\"Fairview Add\",\"ppsf\":1013,\"vol\":8,\"price\":2250000},{\"slug\":\"los-gatos-village\",\"name\":\"Los Gatos Village\",\"ppsf\":1003,\"vol\":24,\"price\":1200000},{\"slug\":\"surmont\",\"name\":\"Surmont\",\"ppsf\":1000,\"vol\":12,\"price\":2311000},{\"slug\":\"la-rinconada-knolls\",\"name\":\"La Rinconada Knolls\",\"ppsf\":992,\"vol\":9,\"price\":3992500},{\"slug\":\"belwood-of-los-gatos\",\"name\":\"Belwood Of Los Gatos\",\"ppsf\":981,\"vol\":53,\"price\":2260000},{\"slug\":\"ambassador-estates\",\"name\":\"Ambassador Estates\",\"ppsf\":980,\"vol\":8,\"price\":2100000},{\"slug\":\"charter-oaks\",\"name\":\"Charter Oaks\",\"ppsf\":952,\"vol\":15,\"price\":1500000},{\"slug\":\"wooded-view-acres\",\"name\":\"Wooded View Acres\",\"ppsf\":942,\"vol\":8,\"price\":2575000},{\"slug\":\"villa-de-los-gatos-amd\",\"name\":\"Villa De Los Gatos Amd\",\"ppsf\":931,\"vol\":11,\"price\":1130000},{\"slug\":\"espana-oaks\",\"name\":\"Espana Oaks\",\"ppsf\":879,\"vol\":8,\"price\":1400000},{\"slug\":\"six-hundred-pennsylvania-ave-c\",\"name\":\"Six Hundred Pennsylvania Ave C\",\"ppsf\":877,\"vol\":11,\"price\":1025000},{\"slug\":\"davis-cowell\",\"name\":\"Davis & Cowell\",\"ppsf\":875,\"vol\":12,\"price\":2540000},{\"slug\":\"vasona-terrace\",\"name\":\"Vasona Terrace\",\"ppsf\":842,\"vol\":13,\"price\":1515000},{\"slug\":\"rinconada-hills\",\"name\":\"Rinconada Hills\",\"ppsf\":839,\"vol\":92,\"price\":1600000},{\"slug\":\"los-gatos-woods\",\"name\":\"Los Gatos Woods\",\"ppsf\":835,\"vol\":44,\"price\":1320000},{\"slug\":\"vasona-venture\",\"name\":\"Vasona Venture\",\"ppsf\":814,\"vol\":35,\"price\":1525000},{\"slug\":\"rancho-de-los-gatos-town-house\",\"name\":\"Rancho De Los Gatos Town House\",\"ppsf\":808,\"vol\":17,\"price\":1500000},{\"slug\":\"parcel-map\",\"name\":\"Parcel Map\",\"ppsf\":706,\"vol\":11,\"price\":2459000},{\"slug\":\"lake-canyon\",\"name\":\"Lake Canyon\",\"ppsf\":705,\"vol\":9,\"price\":780000},{\"slug\":\"redwood-estates-map-03\",\"name\":\"Redwood Estates Map 03\",\"ppsf\":705,\"vol\":14,\"price\":890000},{\"slug\":\"redwood-estates-map-04\",\"name\":\"Redwood Estates Map 04\",\"ppsf\":686,\"vol\":10,\"price\":1275000},{\"slug\":\"chemeketa-park\",\"name\":\"Chemeketa Park\",\"ppsf\":680,\"vol\":16,\"price\":895000},{\"slug\":\"los-gatos-commons\",\"name\":\"Los Gatos Commons\",\"ppsf\":647,\"vol\":14,\"price\":600000},{\"slug\":\"arroyo-rinconada\",\"name\":\"Arroyo Rinconada\",\"ppsf\":643,\"vol\":12,\"price\":1385000},{\"slug\":\"redwood-estates-01\",\"name\":\"Redwood Estates 01\",\"ppsf\":629,\"vol\":8,\"price\":850000},{\"slug\":\"amended\",\"name\":\"Amended\",\"ppsf\":589,\"vol\":11,\"price\":550000},{\"slug\":\"wedgewood-manor-condo\",\"name\":\"Wedgewood Manor Condo\",\"ppsf\":559,\"vol\":36,\"price\":520000},{\"slug\":\"las-cumbres-tr-600\",\"name\":\"Las Cumbres Tr #600\",\"ppsf\":505,\"vol\":11,\"price\":1400000},{\"slug\":\"soquel-augmentation-rho\",\"name\":\"Soquel Augmentation Rho\",\"ppsf\":456,\"vol\":33,\"price\":1225000}],\"tracts\":{\"adobe-manor\":{\"name\":\"Adobe Manor\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1173,\"price\":2700000,\"n\":5},\"h10\":{\"ppsf\":1172,\"price\":2700000,\"n\":6},\"all_n\":16,\"yr\":1963},\"aldercroft-heights\":{\"name\":\"Aldercroft Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":514,\"price\":1120000,\"n\":5},\"all_n\":13,\"yr\":1939},\"almond-grove-add\":{\"name\":\"Almond Grove & Add\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":1861,\"price\":3100000,\"n\":6},\"h5\":{\"ppsf\":1538,\"price\":3645000,\"n\":15},\"h10\":{\"ppsf\":1503,\"price\":3600000,\"n\":19},\"all_n\":47,\"yr\":1908},\"alta-heights\":{\"name\":\"Alta Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1383,\"price\":2355000,\"n\":9},\"all_n\":13,\"yr\":1925},\"alta-vista\":{\"name\":\"Alta Vista\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":1},\"all_n\":9,\"yr\":1985},\"ambassador-estates\":{\"name\":\"Ambassador Estates\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":980,\"price\":2100000,\"n\":8},\"all_n\":14,\"yr\":1961},\"amended\":{\"name\":\"Amended\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":649,\"price\":580000,\"n\":6},\"h10\":{\"ppsf\":589,\"price\":550000,\"n\":11},\"all_n\":19,\"yr\":1987},\"arroya-vista\":{\"name\":\"Arroya Vista\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":905,\"price\":2100000,\"n\":5},\"all_n\":13,\"yr\":1946},\"arroyo-rinconada\":{\"name\":\"Arroyo Rinconada\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":643,\"price\":1385000,\"n\":12},\"all_n\":20,\"yr\":1984},\"belwood-of-los-gatos\":{\"name\":\"Belwood Of Los Gatos\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":1236,\"price\":3025000,\"n\":15},\"h5\":{\"ppsf\":1236,\"price\":2780000,\"n\":25},\"h10\":{\"ppsf\":981,\"price\":2260000,\"n\":53},\"all_n\":103,\"yr\":1965},\"big-redwood-park-01\":{\"name\":\"Big Redwood Park 01\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":540,\"price\":745000,\"n\":4},\"h10\":{\"ppsf\":540,\"price\":745000,\"n\":7},\"all_n\":12,\"yr\":1973},\"blossom-hill-manor\":{\"name\":\"Blossom Hill Manor\",\"h1\":{\"ppsf\":1903,\"price\":4055000,\"n\":5},\"h3\":{\"ppsf\":1781,\"price\":3389000,\"n\":17},\"h5\":{\"ppsf\":1639,\"price\":3200000,\"n\":30},\"h10\":{\"ppsf\":1258,\"price\":2687000,\"n\":60},\"all_n\":172,\"yr\":1953},\"brunskull\":{\"name\":\"Brunskull\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":8,\"yr\":1950},\"buena-vista-heights\":{\"name\":\"Buena Vista Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":8,\"yr\":1965},\"cameo-park\":{\"name\":\"Cameo Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":1481,\"price\":2060000,\"n\":8},\"h5\":{\"ppsf\":1401,\"price\":2060000,\"n\":18},\"h10\":{\"ppsf\":1186,\"price\":1770000,\"n\":31},\"all_n\":78,\"yr\":1964},\"canyon-view-terrace\":{\"name\":\"Canyon View Terrace\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":1448,\"price\":2798000,\"n\":4},\"h5\":{\"ppsf\":1448,\"price\":2798000,\"n\":4},\"h10\":{\"ppsf\":1433,\"price\":2798000,\"n\":5},\"all_n\":11,\"yr\":1952},\"castleview-heights\":{\"name\":\"Castleview Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1204,\"price\":3475000,\"n\":6},\"all_n\":8,\"yr\":1958},\"charter-oaks\":{\"name\":\"Charter Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":1086,\"price\":1600000,\"n\":5},\"h5\":{\"ppsf\":1122,\"price\":1580000,\"n\":8},\"h10\":{\"ppsf\":952,\"price\":1500000,\"n\":15},\"all_n\":35,\"yr\":1973},\"chemeketa-park\":{\"name\":\"Chemeketa Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":685,\"price\":1090000,\"n\":5},\"h5\":{\"ppsf\":759,\"price\":1000000,\"n\":9},\"h10\":{\"ppsf\":680,\"price\":895000,\"n\":16},\"all_n\":31,\"yr\":1946},\"cherry-blossom-lane\":{\"name\":\"Cherry Blossom Lane\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":1417,\"price\":2410000,\"n\":4},\"h5\":{\"ppsf\":1507,\"price\":2890000,\"n\":6},\"h10\":{\"ppsf\":1214,\"price\":2450000,\"n\":15},\"all_n\":37,\"yr\":1961},\"chirco-sub\":{\"name\":\"Chirco Sub\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1031,\"price\":2300000,\"n\":10},\"all_n\":18,\"yr\":1951},\"coombs\":{\"name\":\"Coombs\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":9,\"yr\":1940},\"crescent-hill\":{\"name\":\"Crescent Hill\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1208,\"price\":5350000,\"n\":5},\"h10\":{\"ppsf\":1208,\"price\":5350000,\"n\":9},\"all_n\":11,\"yr\":1964},\"crestvue-acres\":{\"name\":\"Crestvue Acres\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":953,\"price\":3510000,\"n\":5},\"all_n\":11,\"yr\":1964},\"davis-cowell\":{\"name\":\"Davis & Cowell\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":875,\"price\":2540000,\"n\":12},\"all_n\":23,\"yr\":1969},\"el-gato-terrace\":{\"name\":\"El Gato Terrace\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":997,\"price\":1690000,\"n\":7},\"all_n\":21,\"yr\":1955},\"el-rancho-padre-sub\":{\"name\":\"El Rancho Padre Sub\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":826,\"price\":3190000,\"n\":4},\"all_n\":8,\"yr\":1999},\"el-sombroso\":{\"name\":\"El Sombroso\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":761,\"price\":2800000,\"n\":6},\"all_n\":12,\"yr\":1968},\"english-oaks\":{\"name\":\"English Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":1308,\"price\":3520000,\"n\":4},\"h5\":{\"ppsf\":1308,\"price\":3520000,\"n\":4},\"h10\":{\"ppsf\":1136,\"price\":2900000,\"n\":10},\"all_n\":20,\"yr\":1977},\"espana-oaks\":{\"name\":\"Espana Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":885,\"price\":1420000,\"n\":7},\"h10\":{\"ppsf\":879,\"price\":1400000,\"n\":8},\"all_n\":23,\"yr\":1969},\"fairview-add\":{\"name\":\"Fairview Add\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1013,\"price\":2250000,\"n\":8},\"all_n\":12,\"yr\":1961},\"fillmer\":{\"name\":\"Fillmer\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1157,\"price\":2400000,\"n\":5},\"all_n\":9,\"yr\":1946},\"flintridge\":{\"name\":\"Flintridge\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":1504,\"price\":2415000,\"n\":4},\"h5\":{\"ppsf\":1504,\"price\":2415000,\"n\":4},\"h10\":{\"ppsf\":1491,\"price\":2415000,\"n\":7},\"all_n\":15,\"yr\":1955},\"foothill-farms\":{\"name\":\"Foothill Farms\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1095,\"price\":1970000,\"n\":10},\"all_n\":21,\"yr\":1957},\"forbes-mill\":{\"name\":\"Forbes Mill\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":761,\"price\":1175000,\"n\":5},\"all_n\":16,\"yr\":1981},\"gion-homesites-thomas\":{\"name\":\"Gion Homesites Thomas\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":972,\"price\":2220000,\"n\":7},\"all_n\":11,\"yr\":1950},\"glen-rdg-park\":{\"name\":\"Glen Rdg Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1394,\"price\":5050000,\"n\":5},\"h10\":{\"ppsf\":1183,\"price\":2600000,\"n\":18},\"all_n\":26,\"yr\":1942},\"glen-una-park\":{\"name\":\"Glen Una Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1236,\"price\":3900000,\"n\":6},\"all_n\":10,\"yr\":1957},\"hallmark\":{\"name\":\"Hallmark\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1114,\"price\":2450000,\"n\":7},\"all_n\":22,\"yr\":1963},\"hannah-sacketts-twin-oaks\":{\"name\":\"Hannah Sacketts Twin Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":2131,\"price\":2370000,\"n\":4},\"h10\":{\"ppsf\":2112,\"price\":2500000,\"n\":5},\"all_n\":22,\"yr\":1947},\"highland-oaks\":{\"name\":\"Highland Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1467,\"price\":2200000,\"n\":8},\"h10\":{\"ppsf\":1368,\"price\":1750000,\"n\":12},\"all_n\":33,\"yr\":1957},\"homeport-highlands\":{\"name\":\"Homeport Highlands\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":766,\"price\":3000000,\"n\":5},\"all_n\":9,\"yr\":1960},\"j-g-follett\":{\"name\":\"J G Follett\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":1261,\"price\":2000000,\"n\":7},\"all_n\":9,\"yr\":1927},\"j-w-lyndons\":{\"name\":\"J W Lyndons\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1482,\"price\":3036000,\"n\":4},\"all_n\":8,\"yr\":1906},\"johnsons-add\":{\"name\":\"Johnsons Add\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":1897,\"price\":2350000,\"n\":4},\"h5\":{\"ppsf\":1628,\"price\":3100000,\"n\":6},\"h10\":{\"ppsf\":1425,\"price\":2350000,\"n\":9},\"all_n\":20,\"yr\":1954},\"kennedy-add\":{\"name\":\"Kennedy Add\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":8,\"yr\":1925},\"kenwood-acres\":{\"name\":\"Kenwood Acres\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":1624,\"price\":3128000,\"n\":6},\"h5\":{\"ppsf\":1427,\"price\":3426000,\"n\":12},\"h10\":{\"ppsf\":1285,\"price\":3600000,\"n\":16},\"all_n\":33,\"yr\":1949},\"la-rinconada-knolls\":{\"name\":\"La Rinconada Knolls\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":992,\"price\":3992500,\"n\":9},\"all_n\":20,\"yr\":1957},\"lake-canyon\":{\"name\":\"Lake Canyon\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":782,\"price\":610000,\"n\":5},\"h10\":{\"ppsf\":705,\"price\":780000,\"n\":9},\"all_n\":14,\"yr\":1930},\"lake-canyon-map-02\":{\"name\":\"Lake Canyon Map 02\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":9,\"yr\":1936},\"las-cumbres\":{\"name\":\"Las Cumbres\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":441,\"price\":1408500,\"n\":5},\"all_n\":10,\"yr\":1978},\"las-cumbres-tr-600\":{\"name\":\"Las Cumbres Tr #600\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":573,\"price\":1400000,\"n\":5},\"h5\":{\"ppsf\":524,\"price\":1400000,\"n\":8},\"h10\":{\"ppsf\":505,\"price\":1400000,\"n\":11},\"all_n\":15,\"yr\":1979},\"loma-vista-tr\":{\"name\":\"Loma Vista Tr\",\"h1\":{\"ppsf\":1509,\"price\":2300000,\"n\":5},\"h3\":{\"ppsf\":1509,\"price\":2300000,\"n\":7},\"h5\":{\"ppsf\":1320,\"price\":2450000,\"n\":11},\"h10\":{\"ppsf\":1232,\"price\":2380000,\"n\":16},\"all_n\":35,\"yr\":1948},\"los-gatos\":{\"name\":\"Los Gatos\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":1343,\"price\":4600000,\"n\":5},\"h5\":{\"ppsf\":1252,\"price\":4400000,\"n\":6},\"h10\":{\"ppsf\":1161,\"price\":2480000,\"n\":15},\"all_n\":35,\"yr\":1979},\"los-gatos-commons\":{\"name\":\"Los Gatos Commons\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":716,\"price\":655000,\"n\":5},\"h5\":{\"ppsf\":690,\"price\":655000,\"n\":8},\"h10\":{\"ppsf\":647,\"price\":600000,\"n\":14},\"all_n\":23,\"yr\":1978},\"los-gatos-creekside-village\":{\"name\":\"Los Gatos Creekside Village\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1065,\"price\":1600000,\"n\":15},\"all_n\":38,\"yr\":2005},\"los-gatos-terrace\":{\"name\":\"Los Gatos Terrace\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1371,\"price\":2900000,\"n\":5},\"h10\":{\"ppsf\":1242,\"price\":2405000,\"n\":8},\"all_n\":26,\"yr\":1958},\"los-gatos-town-manor\":{\"name\":\"Los Gatos Town Manor\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1226,\"price\":1400000,\"n\":7},\"all_n\":17,\"yr\":1961},\"los-gatos-uplands\":{\"name\":\"Los Gatos Uplands\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":973,\"price\":2675000,\"n\":5},\"all_n\":8,\"yr\":1959},\"los-gatos-villa\":{\"name\":\"Los Gatos Villa\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":9,\"yr\":1941},\"los-gatos-village\":{\"name\":\"Los Gatos Village\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":1026,\"price\":1355000,\"n\":9},\"h5\":{\"ppsf\":1117,\"price\":1260000,\"n\":15},\"h10\":{\"ppsf\":1003,\"price\":1200000,\"n\":24},\"all_n\":65,\"yr\":1972},\"los-gatos-woods\":{\"name\":\"Los Gatos Woods\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":908,\"price\":1503000,\"n\":12},\"h5\":{\"ppsf\":886,\"price\":1410000,\"n\":22},\"h10\":{\"ppsf\":835,\"price\":1320000,\"n\":44},\"all_n\":103,\"yr\":1972},\"m-s-gardner-estate\":{\"name\":\"M S Gardner Estate\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1287,\"price\":2700000,\"n\":5},\"h10\":{\"ppsf\":1239,\"price\":2700000,\"n\":8},\"all_n\":14,\"yr\":1962},\"massol\":{\"name\":\"Massol\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":14,\"yr\":1920},\"mccullagh\":{\"name\":\"Mccullagh\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1698,\"price\":3850000,\"n\":4},\"all_n\":9,\"yr\":1900},\"melody-park\":{\"name\":\"Melody Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":673,\"price\":1250000,\"n\":7},\"all_n\":14,\"yr\":1953},\"montclair-oaks\":{\"name\":\"Montclair Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1081,\"price\":2515000,\"n\":4},\"all_n\":13,\"yr\":1962},\"montezuma-hills\":{\"name\":\"Montezuma Hills\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1068,\"price\":4250000,\"n\":5},\"all_n\":9,\"yr\":1978},\"mountain-spgs\":{\"name\":\"Mountain Spgs\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":538,\"price\":1480000,\"n\":6},\"all_n\":10,\"yr\":1964},\"nott\":{\"name\":\"Nott\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":990,\"price\":1725000,\"n\":7},\"all_n\":19,\"yr\":1961},\"nuevo-mundo\":{\"name\":\"Nuevo Mundo\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1380,\"price\":3795000,\"n\":6},\"h10\":{\"ppsf\":1304,\"price\":3505000,\"n\":9},\"all_n\":16,\"yr\":1966},\"oak-hill\":{\"name\":\"Oak Hill\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":1},\"all_n\":15,\"yr\":1966},\"oak-hill-sub\":{\"name\":\"Oak Hill Sub\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1269,\"price\":2529000,\"n\":4},\"h10\":{\"ppsf\":1080,\"price\":2715000,\"n\":7},\"all_n\":10,\"yr\":1964},\"oak-park-estates\":{\"name\":\"Oak Park Estates\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":1},\"all_n\":8,\"yr\":1960},\"oakwood\":{\"name\":\"Oakwood\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":11,\"yr\":1973},\"office-condo-dev\":{\"name\":\"Office Condo Dev\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":11062,\"price\":4300000,\"n\":10},\"h10\":{\"ppsf\":11062,\"price\":4300000,\"n\":10},\"all_n\":10,\"yr\":1985},\"parcel-map\":{\"name\":\"Parcel Map\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":706,\"price\":2459000,\"n\":11},\"all_n\":21,\"yr\":1982},\"penn-national-tr\":{\"name\":\"Penn National Tr\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1454,\"price\":1950000,\"n\":5},\"all_n\":9,\"yr\":1960},\"placer-oaks\":{\"name\":\"Placer Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1308,\"price\":2950000,\"n\":5},\"all_n\":18,\"yr\":1967},\"pollard-oaks-amd\":{\"name\":\"Pollard Oaks Amd\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":1},\"all_n\":9,\"yr\":1984},\"rancho-de-los-gatos-town-house\":{\"name\":\"Rancho De Los Gatos Town House\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":868,\"price\":1625000,\"n\":6},\"h5\":{\"ppsf\":848,\"price\":1550000,\"n\":9},\"h10\":{\"ppsf\":808,\"price\":1500000,\"n\":17},\"all_n\":27,\"yr\":1967},\"rancho-rinconada-de-los-gatos\":{\"name\":\"Rancho Rinconada De Los Gatos\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":888,\"price\":2400000,\"n\":7},\"all_n\":10,\"yr\":1971},\"redwood-estates\":{\"name\":\"Redwood Estates\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":798,\"price\":221800,\"n\":4},\"h10\":{\"ppsf\":756,\"price\":226500,\"n\":7},\"all_n\":17,\"yr\":1950},\"redwood-estates-01\":{\"name\":\"Redwood Estates 01\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":629,\"price\":850000,\"n\":8},\"all_n\":19,\"yr\":1932},\"redwood-estates-map-03\":{\"name\":\"Redwood Estates Map 03\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":757,\"price\":895000,\"n\":5},\"h10\":{\"ppsf\":705,\"price\":890000,\"n\":14},\"all_n\":34,\"yr\":1950},\"redwood-estates-map-04\":{\"name\":\"Redwood Estates Map 04\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":686,\"price\":1275000,\"n\":10},\"all_n\":27,\"yr\":1974},\"redwood-estates-map-3\":{\"name\":\"Redwood Estates Map #3\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":815,\"price\":1100000,\"n\":4},\"h5\":{\"ppsf\":815,\"price\":1100000,\"n\":5},\"h10\":{\"ppsf\":815,\"price\":1100000,\"n\":5},\"all_n\":9,\"yr\":1954},\"ridgewoode\":{\"name\":\"Ridgewoode\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1439,\"price\":3404000,\"n\":5},\"h10\":{\"ppsf\":1296,\"price\":2950000,\"n\":8},\"all_n\":18,\"yr\":1962},\"rinconada-de-los-gatos-rho\":{\"name\":\"Rinconada De Los Gatos Rho\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":1275,\"price\":3800000,\"n\":13},\"h5\":{\"ppsf\":1323,\"price\":3325000,\"n\":18},\"h10\":{\"ppsf\":1150,\"price\":3000000,\"n\":30},\"all_n\":83,\"yr\":1955},\"rinconada-hills\":{\"name\":\"Rinconada Hills\",\"h1\":{\"ppsf\":990,\"price\":1750000,\"n\":12},\"h3\":{\"ppsf\":1010,\"price\":1800000,\"n\":34},\"h5\":{\"ppsf\":971,\"price\":1700000,\"n\":52},\"h10\":{\"ppsf\":839,\"price\":1600000,\"n\":92},\"all_n\":182,\"yr\":1974},\"rinconada-oaks\":{\"name\":\"Rinconada Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1016,\"price\":2425000,\"n\":5},\"all_n\":11,\"yr\":1960},\"rio-rinconada\":{\"name\":\"Rio Rinconada\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1359,\"price\":2300000,\"n\":7},\"h10\":{\"ppsf\":1205,\"price\":1675000,\"n\":13},\"all_n\":34,\"yr\":1962},\"rolling-green\":{\"name\":\"Rolling Green\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1050,\"price\":1870000,\"n\":4},\"all_n\":11,\"yr\":1977},\"santa-rosa-heights\":{\"name\":\"Santa Rosa Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1012,\"price\":2525000,\"n\":4},\"all_n\":11,\"yr\":1977},\"saratoga-highlands\":{\"name\":\"Saratoga Highlands\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":1480,\"price\":2375000,\"n\":6},\"h5\":{\"ppsf\":1461,\"price\":2300000,\"n\":8},\"h10\":{\"ppsf\":1136,\"price\":1900000,\"n\":20},\"all_n\":54,\"yr\":1961},\"six-hundred-pennsylvania-ave-c\":{\"name\":\"Six Hundred Pennsylvania Ave C\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":930,\"price\":1025000,\"n\":4},\"h5\":{\"ppsf\":931,\"price\":1025000,\"n\":6},\"h10\":{\"ppsf\":877,\"price\":1025000,\"n\":11},\"all_n\":16,\"yr\":1962},\"soquel-augmentation\":{\"name\":\"Soquel Augmentation\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":8,\"yr\":1958},\"soquel-augmentation-rho\":{\"name\":\"Soquel Augmentation Rho\",\"h1\":{\"ppsf\":673,\"price\":1150000,\"n\":4},\"h3\":{\"ppsf\":613,\"price\":1360000,\"n\":13},\"h5\":{\"ppsf\":464,\"price\":1360000,\"n\":20},\"h10\":{\"ppsf\":456,\"price\":1225000,\"n\":33},\"all_n\":78,\"yr\":1974},\"southridge\":{\"name\":\"Southridge\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1013,\"price\":2150000,\"n\":6},\"all_n\":12,\"yr\":1965},\"stewart-add-02\":{\"name\":\"Stewart Add 02\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":696,\"price\":840000,\"n\":6},\"all_n\":10,\"yr\":1935},\"stony-brook\":{\"name\":\"Stony Brook\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":1021,\"price\":2525000,\"n\":6},\"all_n\":15,\"yr\":1959},\"surmont\":{\"name\":\"Surmont\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1234,\"price\":3050000,\"n\":6},\"h10\":{\"ppsf\":1000,\"price\":2311000,\"n\":12},\"all_n\":28,\"yr\":1963},\"surrey-farm\":{\"name\":\"Surrey Farm\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1484,\"price\":4040000,\"n\":5},\"all_n\":26,\"yr\":1961},\"terreno-del-sol\":{\"name\":\"Terreno Del Sol\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":15,\"yr\":1951},\"tobey\":{\"name\":\"Tobey\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":1760,\"price\":1800000,\"n\":4},\"h5\":{\"ppsf\":1760,\"price\":1800000,\"n\":4},\"h10\":{\"ppsf\":1662,\"price\":1800000,\"n\":5},\"all_n\":9,\"yr\":1948},\"tract-no-1520\":{\"name\":\"Tract No 1520\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":1536,\"price\":1900000,\"n\":4},\"h10\":{\"ppsf\":1300,\"price\":1850000,\"n\":9},\"all_n\":17,\"yr\":1958},\"tract-no-1855\":{\"name\":\"Tract No 1855\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":1075,\"price\":1480000,\"n\":7},\"all_n\":18,\"yr\":1958},\"tract-no-1945\":{\"name\":\"Tract No 1945\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":751,\"price\":2425000,\"n\":5},\"all_n\":15,\"yr\":1958},\"tract-no-1985\":{\"name\":\"Tract No 1985\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1281,\"price\":1950000,\"n\":4},\"all_n\":8,\"yr\":1959},\"tract-no-2869\":{\"name\":\"Tract No 2869\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1054,\"price\":1830000,\"n\":11},\"all_n\":20,\"yr\":1964},\"tract-no-2938\":{\"name\":\"Tract No 2938\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1070,\"price\":1875000,\"n\":5},\"all_n\":16,\"yr\":1962},\"tract-no-3798\":{\"name\":\"Tract No 3798\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1357,\"price\":3375000,\"n\":4},\"h10\":{\"ppsf\":1104,\"price\":2880000,\"n\":7},\"all_n\":9,\"yr\":1968},\"tract-no-5257\":{\"name\":\"Tract No 5257\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":757,\"price\":735000,\"n\":4},\"all_n\":8,\"yr\":1970},\"tract-no-8820\":{\"name\":\"Tract No 8820\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1052,\"price\":1710000,\"n\":5},\"all_n\":8,\"yr\":1997},\"vasona-heights\":{\"name\":\"Vasona Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1514,\"price\":4110000,\"n\":5},\"all_n\":9,\"yr\":1953},\"vasona-park\":{\"name\":\"Vasona Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":9,\"yr\":2005},\"vasona-terrace\":{\"name\":\"Vasona Terrace\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":866,\"price\":1558000,\"n\":6},\"h10\":{\"ppsf\":842,\"price\":1515000,\"n\":13},\"all_n\":28,\"yr\":1972},\"vasona-venture\":{\"name\":\"Vasona Venture\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":825,\"price\":1700000,\"n\":9},\"h5\":{\"ppsf\":825,\"price\":1676000,\"n\":17},\"h10\":{\"ppsf\":814,\"price\":1525000,\"n\":35},\"all_n\":53,\"yr\":1977},\"villa-de-los-gatos-amd\":{\"name\":\"Villa De Los Gatos Amd\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":984,\"price\":1200000,\"n\":5},\"h10\":{\"ppsf\":931,\"price\":1130000,\"n\":11},\"all_n\":25,\"yr\":1973},\"villa-felice\":{\"name\":\"Villa Felice\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1201,\"price\":3125000,\"n\":8},\"h10\":{\"ppsf\":1125,\"price\":3020000,\"n\":11},\"all_n\":16,\"yr\":2007},\"vineyard\":{\"name\":\"Vineyard\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":10,\"yr\":1905},\"vista-estates\":{\"name\":\"Vista Estates\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":9,\"yr\":1959},\"vista-heights\":{\"name\":\"Vista Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1131,\"price\":2845000,\"n\":4},\"all_n\":8,\"yr\":1973},\"wedgewood-manor-condo\":{\"name\":\"Wedgewood Manor Condo\",\"h1\":{\"ppsf\":484,\"price\":475000,\"n\":6},\"h3\":{\"ppsf\":517,\"price\":490000,\"n\":13},\"h5\":{\"ppsf\":555,\"price\":515000,\"n\":22},\"h10\":{\"ppsf\":559,\"price\":520000,\"n\":36},\"all_n\":60,\"yr\":1963},\"wooded-view-acres\":{\"name\":\"Wooded View Acres\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":942,\"price\":2575000,\"n\":8},\"all_n\":16,\"yr\":1975}},\"by_bed\":{\"2\":1450000,\"3\":2098000,\"4\":3000000,\"5\":3808000},\"spread\":{\"hi\":{\"slug\":\"almond-grove-add\",\"name\":\"Almond Grove & Add\",\"ppsf\":1503,\"vol\":19,\"price\":3600000},\"lo\":{\"slug\":\"soquel-augmentation-rho\",\"name\":\"Soquel Augmentation Rho\",\"ppsf\":456,\"vol\":33,\"price\":1225000},\"ratio\":3.3},\"most_active\":{\"slug\":\"rinconada-hills\",\"name\":\"Rinconada Hills\",\"ppsf\":839,\"vol\":92,\"price\":1600000}}";
const LG_TRACTS_JSON = "{\"blossom-hill-manor\":{\"name\":\"Blossom Hill Manor\",\"n\":231,\"type\":\"Single Family\",\"mv\":3182000,\"yr\":1953,\"hoa\":null,\"numbered\":false},\"rinconada-hills\":{\"name\":\"Rinconada Hills\",\"n\":216,\"type\":\"Condominium\",\"mv\":1920000,\"yr\":1974,\"hoa\":\"Rinconada Hills\",\"numbered\":false},\"belwood-of-los-gatos\":{\"name\":\"Belwood Of Los Gatos\",\"n\":135,\"type\":\"Single Family\",\"mv\":2896000,\"yr\":1965,\"hoa\":\"Belwood Of Los Gatos Homes Assn\",\"numbered\":false},\"los-gatos-woods\":{\"name\":\"Los Gatos Woods\",\"n\":125,\"type\":\"Condominium\",\"mv\":1514000,\"yr\":1972,\"hoa\":\"Los Gatos Woods\",\"numbered\":false},\"rinconada-de-los-gatos-rho\":{\"name\":\"Rinconada De Los Gatos Rho\",\"n\":117,\"type\":\"Single Family\",\"mv\":3143000,\"yr\":1952,\"hoa\":null,\"numbered\":false},\"soquel-augmentation-rho\":{\"name\":\"Soquel Augmentation Rho\",\"n\":114,\"type\":\"Single Family\",\"mv\":1415000,\"yr\":1973,\"hoa\":\"Laurel Community League Inc\",\"numbered\":false},\"cameo-park\":{\"name\":\"Cameo Park\",\"n\":108,\"type\":\"Single Family\",\"mv\":2178500,\"yr\":1964,\"hoa\":\"Innsbrooke Homeowners Association Inc\",\"numbered\":false},\"los-gatos-village\":{\"name\":\"Los Gatos Village\",\"n\":77,\"type\":\"Condominium\",\"mv\":1364000,\"yr\":1972,\"hoa\":\"Los Gatos Village\",\"numbered\":false},\"almond-grove-add\":{\"name\":\"Almond Grove Add\",\"n\":75,\"type\":\"Single Family\",\"mv\":2907000,\"yr\":1910,\"hoa\":null,\"numbered\":false},\"saratoga-highlands\":{\"name\":\"Saratoga Highlands\",\"n\":65,\"type\":\"Single Family\",\"mv\":2461000,\"yr\":1961,\"hoa\":null,\"numbered\":false},\"wedgewood-manor-condo\":{\"name\":\"Wedgewood Manor Condo\",\"n\":64,\"type\":\"Condominium\",\"mv\":570500,\"yr\":1963,\"hoa\":\"Wedgewood Manor\",\"numbered\":false},\"vasona-venture\":{\"name\":\"Vasona Venture\",\"n\":57,\"type\":\"Condominium\",\"mv\":1712000,\"yr\":1977,\"hoa\":\"Wimbledon Place\",\"numbered\":false},\"cherry-blossom-lane\":{\"name\":\"Cherry Blossom Lane\",\"n\":52,\"type\":\"Single Family\",\"mv\":3129500,\"yr\":1961,\"hoa\":null,\"numbered\":false},\"highland-oaks\":{\"name\":\"Highland Oaks\",\"n\":46,\"type\":\"Single Family\",\"mv\":2135000,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"kenwood-acres\":{\"name\":\"Kenwood Acres\",\"n\":45,\"type\":\"Single Family\",\"mv\":3303000,\"yr\":1948,\"hoa\":null,\"numbered\":false},\"redwood-estates-map-03\":{\"name\":\"Redwood Estates Map 03\",\"n\":42,\"type\":\"Single Family\",\"mv\":1127000,\"yr\":1938,\"hoa\":\"Redwood Estates Services Association\",\"numbered\":false},\"rio-rinconada\":{\"name\":\"Rio Rinconada\",\"n\":42,\"type\":\"Single Family\",\"mv\":2380000,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"loma-vista-tr\":{\"name\":\"Loma Vista Tr\",\"n\":41,\"type\":\"Single Family\",\"mv\":2628000,\"yr\":1948,\"hoa\":null,\"numbered\":false},\"charter-oaks\":{\"name\":\"Charter Oaks\",\"n\":40,\"type\":\"Condominium\",\"mv\":1609000,\"yr\":1973,\"hoa\":\"Charter Oaks Townhouse\",\"numbered\":false},\"los-gatos-creekside-village\":{\"name\":\"Los Gatos Creekside Village\",\"n\":38,\"type\":\"Single Family\",\"mv\":1844500,\"yr\":2005,\"hoa\":\"Creekside Village Of Los Gatos\",\"numbered\":false},\"chemeketa-park\":{\"name\":\"Chemeketa Park\",\"n\":37,\"type\":\"Single Family\",\"mv\":973000,\"yr\":1945,\"hoa\":null,\"numbered\":false},\"glen-rdg-park\":{\"name\":\"Glen Rdg Park\",\"n\":37,\"type\":\"Single Family\",\"mv\":3497000,\"yr\":1942,\"hoa\":null,\"numbered\":false},\"surmont\":{\"name\":\"Surmont\",\"n\":36,\"type\":\"Single Family\",\"mv\":2981500,\"yr\":1963,\"hoa\":null,\"numbered\":false},\"nott\":{\"name\":\"Nott\",\"n\":34,\"type\":\"Single Family\",\"mv\":3032000,\"yr\":1953,\"hoa\":null,\"numbered\":false},\"redwood-estates-map-04\":{\"name\":\"Redwood Estates Map 04\",\"n\":34,\"type\":\"Single Family\",\"mv\":1426000,\"yr\":1973,\"hoa\":\"Redwood Estates Services Association\",\"numbered\":false},\"surrey-farm\":{\"name\":\"Surrey Farm\",\"n\":34,\"type\":\"Single Family\",\"mv\":4159000,\"yr\":1961,\"hoa\":null,\"numbered\":false},\"vasona-terrace\":{\"name\":\"Vasona Terrace\",\"n\":34,\"type\":\"Condominium\",\"mv\":1660000,\"yr\":1972,\"hoa\":\"Vasona Terrace\",\"numbered\":false},\"davis-cowell\":{\"name\":\"Davis Cowell\",\"n\":33,\"type\":\"Single Family\",\"mv\":3663000,\"yr\":1968,\"hoa\":null,\"numbered\":false},\"rancho-de-los-gatos-town-house\":{\"name\":\"Rancho De Los Gatos Town House\",\"n\":33,\"type\":\"Condominium\",\"mv\":1587000,\"yr\":1967,\"hoa\":\"Rancho De Los Gatos Townhouses\",\"numbered\":false},\"chirco-sub\":{\"name\":\"Chirco Sub\",\"n\":32,\"type\":\"Single Family\",\"mv\":2576500,\"yr\":1950,\"hoa\":null,\"numbered\":false},\"los-gatos-terrace\":{\"name\":\"Los Gatos Terrace\",\"n\":32,\"type\":\"Single Family\",\"mv\":3251000,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"el-gato-terrace\":{\"name\":\"El Gato Terrace\",\"n\":31,\"type\":\"Single Family\",\"mv\":2781000,\"yr\":1955,\"hoa\":null,\"numbered\":false},\"hallmark\":{\"name\":\"Hallmark\",\"n\":29,\"type\":\"Single Family\",\"mv\":2703000,\"yr\":1963,\"hoa\":null,\"numbered\":false},\"espana-oaks\":{\"name\":\"Espana Oaks\",\"n\":28,\"type\":\"Condominium\",\"mv\":1520500,\"yr\":1969,\"hoa\":\"Espana Oaks Town\",\"numbered\":false},\"johnsons-add\":{\"name\":\"Johnsons Add\",\"n\":28,\"type\":\"Single Family\",\"mv\":3173500,\"yr\":1954,\"hoa\":null,\"numbered\":false},\"villa-de-los-gatos-amd\":{\"name\":\"Villa De Los Gatos Amd\",\"n\":28,\"type\":\"Condominium\",\"mv\":1473000,\"yr\":1973,\"hoa\":\"Villa De Los Gatos Association\",\"numbered\":false},\"english-oaks\":{\"name\":\"English Oaks\",\"n\":27,\"type\":\"Single Family\",\"mv\":3663000,\"yr\":1977,\"hoa\":\"English Oaks\",\"numbered\":false},\"los-gatos-commons\":{\"name\":\"Los Gatos Commons\",\"n\":27,\"type\":\"Condominium\",\"mv\":670000,\"yr\":1978,\"hoa\":\"Los Gatos Commons\",\"numbered\":false},\"placer-oaks\":{\"name\":\"Placer Oaks\",\"n\":27,\"type\":\"Single Family\",\"mv\":2868000,\"yr\":1967,\"hoa\":null,\"numbered\":false},\"foothill-farms\":{\"name\":\"Foothill Farms\",\"n\":26,\"type\":\"Single Family\",\"mv\":2235500,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"ridgewoode\":{\"name\":\"Ridgewoode\",\"n\":26,\"type\":\"Single Family\",\"mv\":3639000,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"hannah-sacketts-twin-oaks\":{\"name\":\"Hannah Sacketts Twin Oaks\",\"n\":25,\"type\":\"Single Family\",\"mv\":2489000,\"yr\":1949,\"hoa\":null,\"numbered\":false},\"oak-hill\":{\"name\":\"Oak Hill\",\"n\":25,\"type\":\"Single Family\",\"mv\":3243000,\"yr\":1960,\"hoa\":null,\"numbered\":false},\"la-rinconada-knolls\":{\"name\":\"La Rinconada Knolls\",\"n\":24,\"type\":\"Single Family\",\"mv\":4624000,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"los-gatos-town-manor\":{\"name\":\"Los Gatos Town Manor\",\"n\":24,\"type\":\"Single Family\",\"mv\":2084500,\"yr\":1961,\"hoa\":null,\"numbered\":false},\"redwood-estates-01\":{\"name\":\"Redwood Estates 01\",\"n\":24,\"type\":\"Single Family\",\"mv\":1010000,\"yr\":1936,\"hoa\":\"Redwood Estates Services Association\",\"numbered\":false},\"terreno-del-sol\":{\"name\":\"Terreno Del Sol\",\"n\":24,\"type\":\"Single Family\",\"mv\":2645000,\"yr\":1948,\"hoa\":null,\"numbered\":false},\"arroyo-rinconada\":{\"name\":\"Arroyo Rinconada\",\"n\":22,\"type\":\"Condominium\",\"mv\":1726500,\"yr\":1984,\"hoa\":\"Arroyo Rinconada\",\"numbered\":false},\"redwood-estates\":{\"name\":\"Redwood Estates\",\"n\":22,\"type\":\"Single Family\",\"mv\":1102000,\"yr\":1950,\"hoa\":null,\"numbered\":false},\"montclair-oaks\":{\"name\":\"Montclair Oaks\",\"n\":21,\"type\":\"Single Family\",\"mv\":3239000,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"tract-no-2869\":{\"name\":\"Tract No 2869\",\"n\":21,\"type\":\"Single Family\",\"mv\":2584000,\"yr\":1964,\"hoa\":\"Strathmore Swim Club\",\"numbered\":false},\"villa-felice\":{\"name\":\"Villa Felice\",\"n\":21,\"type\":\"Single Family\",\"mv\":3405000,\"yr\":2007,\"hoa\":\"Bella Vista Of Los Gatos\",\"numbered\":false},\"lake-canyon\":{\"name\":\"Lake Canyon\",\"n\":20,\"type\":\"Single Family\",\"mv\":1096000,\"yr\":1930,\"hoa\":null,\"numbered\":false},\"stony-brook\":{\"name\":\"Stony Brook\",\"n\":20,\"type\":\"Single Family\",\"mv\":3625500,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"tract-no-2938\":{\"name\":\"Tract No 2938\",\"n\":20,\"type\":\"Single Family\",\"mv\":2569500,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"adobe-manor\":{\"name\":\"Adobe Manor\",\"n\":19,\"type\":\"Single Family\",\"mv\":3134000,\"yr\":1963,\"hoa\":null,\"numbered\":false},\"amended\":{\"name\":\"Amended\",\"n\":19,\"type\":\"Condominium\",\"mv\":646000,\"yr\":1987,\"hoa\":\"576 West Parr Ave\",\"numbered\":false},\"big-redwood-park-01\":{\"name\":\"Big Redwood Park 01\",\"n\":19,\"type\":\"Single Family\",\"mv\":786000,\"yr\":1967,\"hoa\":\"Big Redwood Park\",\"numbered\":false},\"brunskull\":{\"name\":\"Brunskull\",\"n\":19,\"type\":\"Single Family\",\"mv\":2320000,\"yr\":1950,\"hoa\":null,\"numbered\":false},\"crestvue-acres\":{\"name\":\"Crestvue Acres\",\"n\":19,\"type\":\"Single Family\",\"mv\":3631000,\"yr\":1964,\"hoa\":null,\"numbered\":false},\"fairview-add\":{\"name\":\"Fairview Add\",\"n\":19,\"type\":\"Single Family\",\"mv\":3233000,\"yr\":1940,\"hoa\":null,\"numbered\":false},\"flintridge\":{\"name\":\"Flintridge\",\"n\":19,\"type\":\"Single Family\",\"mv\":2666000,\"yr\":1955,\"hoa\":null,\"numbered\":false},\"foothills-of-los-gatos\":{\"name\":\"Foothills Of Los Gatos\",\"n\":19,\"type\":\"Multi-family\",\"mv\":1988000,\"yr\":1967,\"hoa\":\"Foothills Of Los Gatos Homeowners Assoc.\",\"numbered\":false},\"nuevo-mundo\":{\"name\":\"Nuevo Mundo\",\"n\":19,\"type\":\"Single Family\",\"mv\":3806000,\"yr\":1967,\"hoa\":null,\"numbered\":false},\"tract-no-1855\":{\"name\":\"Tract No 1855\",\"n\":19,\"type\":\"Single Family\",\"mv\":2249000,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"massol\":{\"name\":\"Massol\",\"n\":18,\"type\":\"Single Family\",\"mv\":3269972,\"yr\":1924,\"hoa\":null,\"numbered\":false},\"office-condo\":{\"name\":\"Office Condo\",\"n\":18,\"type\":\"Other\",\"mv\":262438,\"yr\":1981,\"hoa\":null,\"numbered\":false},\"six-hundred-pennsylvania-ave-c\":{\"name\":\"Six Hundred Pennsylvania Ave C\",\"n\":18,\"type\":\"Condominium\",\"mv\":1185000,\"yr\":1962,\"hoa\":\"600 Pennsylvania Avenue Homeowners\",\"numbered\":false},\"tract-no-1945\":{\"name\":\"Tract No 1945\",\"n\":18,\"type\":\"Single Family\",\"mv\":2263500,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"forbes-mill\":{\"name\":\"Forbes Mill\",\"n\":17,\"type\":\"Condominium\",\"mv\":1713000,\"yr\":1981,\"hoa\":\"Forbes Mill Condominium Association\",\"numbered\":false},\"las-cumbres-tr-600\":{\"name\":\"Las Cumbres Tr 600\",\"n\":17,\"type\":\"Single Family\",\"mv\":1735000,\"yr\":1979,\"hoa\":\"Las Cumbres Conservation Corporation\",\"numbered\":false},\"melody-park\":{\"name\":\"Melody Park\",\"n\":17,\"type\":\"Single Family\",\"mv\":1529000,\"yr\":1956,\"hoa\":null,\"numbered\":false},\"oakwood\":{\"name\":\"Oakwood\",\"n\":17,\"type\":\"Single Family\",\"mv\":3894000,\"yr\":1973,\"hoa\":\"Evelyn Glen Owners' Association\",\"numbered\":false},\"tract-no-1520\":{\"name\":\"Tract No 1520\",\"n\":17,\"type\":\"Single Family\",\"mv\":2247000,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"vista-estates\":{\"name\":\"Vista Estates\",\"n\":17,\"type\":\"Single Family\",\"mv\":2682000,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"wooded-view-acres\":{\"name\":\"Wooded View Acres\",\"n\":17,\"type\":\"Single Family\",\"mv\":3747000,\"yr\":1976,\"hoa\":\"Crimson Homeowners Association\",\"numbered\":false},\"arroya-vista\":{\"name\":\"Arroya Vista\",\"n\":16,\"type\":\"Single Family\",\"mv\":3183500,\"yr\":1946,\"hoa\":null,\"numbered\":false},\"gion-homesites-thomas\":{\"name\":\"Gion Homesites Thomas\",\"n\":16,\"type\":\"Single Family\",\"mv\":3490000,\"yr\":1950,\"hoa\":null,\"numbered\":false},\"mccullagh\":{\"name\":\"Mccullagh\",\"n\":16,\"type\":\"Single Family\",\"mv\":3765500,\"yr\":1900,\"hoa\":null,\"numbered\":false},\"rancho-rinconada-de-los-gatos\":{\"name\":\"Rancho Rinconada De Los Gatos\",\"n\":16,\"type\":\"Single Family\",\"mv\":3369500,\"yr\":1973,\"hoa\":null,\"numbered\":false},\"southridge\":{\"name\":\"Southridge\",\"n\":16,\"type\":\"Single Family\",\"mv\":2632000,\"yr\":1965,\"hoa\":\"Compass Management Group\",\"numbered\":false},\"aldercroft-heights\":{\"name\":\"Aldercroft Heights\",\"n\":15,\"type\":\"Single Family\",\"mv\":1193000,\"yr\":1944,\"hoa\":\"North Aldercroft Association\",\"numbered\":false},\"alta-heights\":{\"name\":\"Alta Heights\",\"n\":15,\"type\":\"Single Family\",\"mv\":2993000,\"yr\":1924,\"hoa\":null,\"numbered\":false},\"ambassador-estates\":{\"name\":\"Ambassador Estates\",\"n\":15,\"type\":\"Single Family\",\"mv\":3013000,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"el-sombroso\":{\"name\":\"El Sombroso\",\"n\":15,\"type\":\"Single Family\",\"mv\":3574000,\"yr\":1973,\"hoa\":null,\"numbered\":false},\"rinconada-oaks\":{\"name\":\"Rinconada Oaks\",\"n\":15,\"type\":\"Single Family\",\"mv\":3365000,\"yr\":1960,\"hoa\":null,\"numbered\":false},\"santa-rosa-heights\":{\"name\":\"Santa Rosa Heights\",\"n\":15,\"type\":\"Single Family\",\"mv\":5445000,\"yr\":1995,\"hoa\":null,\"numbered\":false},\"vineyard\":{\"name\":\"Vineyard\",\"n\":15,\"type\":\"Single Family\",\"mv\":2936000,\"yr\":1930,\"hoa\":null,\"numbered\":false},\"alta-vista\":{\"name\":\"Alta Vista\",\"n\":14,\"type\":\"Single Family\",\"mv\":4602500,\"yr\":1986,\"hoa\":\"Alta Vista\",\"numbered\":false},\"fillmer\":{\"name\":\"Fillmer\",\"n\":14,\"type\":\"Single Family\",\"mv\":3088000,\"yr\":1946,\"hoa\":null,\"numbered\":false},\"glen-una-park\":{\"name\":\"Glen Una Park\",\"n\":14,\"type\":\"Single Family\",\"mv\":4053000,\"yr\":1960,\"hoa\":null,\"numbered\":false},\"m-s-gardner-estate\":{\"name\":\"M S Gardner Estate\",\"n\":14,\"type\":\"Single Family\",\"mv\":4688000,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"penn-national-tr\":{\"name\":\"Penn National Tr\",\"n\":14,\"type\":\"Single Family\",\"mv\":2264500,\"yr\":1960,\"hoa\":null,\"numbered\":false},\"redwood-estates-map-4\":{\"name\":\"Redwood Estates Map 4\",\"n\":14,\"type\":\"Single Family\",\"mv\":1145000,\"yr\":1962,\"hoa\":\"Redwood Estates Services Association\",\"numbered\":false},\"vasona-park\":{\"name\":\"Vasona Park\",\"n\":14,\"type\":\"Single Family\",\"mv\":2312000,\"yr\":2005,\"hoa\":\"Classics At Vasona Ranch\",\"numbered\":false},\"canyon-view-terrace\":{\"name\":\"Canyon View Terrace\",\"n\":13,\"type\":\"Single Family\",\"mv\":3007000,\"yr\":1951,\"hoa\":null,\"numbered\":false},\"castleview-heights\":{\"name\":\"Castleview Heights\",\"n\":13,\"type\":\"Single Family\",\"mv\":3943000,\"yr\":1958,\"hoa\":\"Rinconada Hills\",\"numbered\":false},\"coombs\":{\"name\":\"Coombs\",\"n\":13,\"type\":\"Single Family\",\"mv\":2950000,\"yr\":1937,\"hoa\":null,\"numbered\":false},\"las-cumbres\":{\"name\":\"Las Cumbres\",\"n\":13,\"type\":\"Single Family\",\"mv\":1526000,\"yr\":1979,\"hoa\":null,\"numbered\":false},\"rolling-green\":{\"name\":\"Rolling Green\",\"n\":13,\"type\":\"Single Family\",\"mv\":2590000,\"yr\":1977,\"hoa\":null,\"numbered\":false},\"homeport-highlands\":{\"name\":\"Homeport Highlands\",\"n\":12,\"type\":\"Single Family\",\"mv\":4559000,\"yr\":1960,\"hoa\":null,\"numbered\":false},\"j-w-lyndons\":{\"name\":\"J W Lyndons\",\"n\":12,\"type\":\"Single Family\",\"mv\":3189500,\"yr\":1902,\"hoa\":null,\"numbered\":false},\"los-gatos-villa\":{\"name\":\"Los Gatos Villa\",\"n\":12,\"type\":\"Single Family\",\"mv\":3056000,\"yr\":1938,\"hoa\":null,\"numbered\":false},\"montezuma-hills\":{\"name\":\"Montezuma Hills\",\"n\":12,\"type\":\"Single Family\",\"mv\":3919000,\"yr\":1977,\"hoa\":null,\"numbered\":false},\"oak-hill-sub\":{\"name\":\"Oak Hill Sub\",\"n\":12,\"type\":\"Single Family\",\"mv\":3213500,\"yr\":1964,\"hoa\":null,\"numbered\":false},\"soquel-augmentation\":{\"name\":\"Soquel Augmentation\",\"n\":12,\"type\":\"Single Family\",\"mv\":1330500,\"yr\":1970,\"hoa\":null,\"numbered\":false},\"vista-heights\":{\"name\":\"Vista Heights\",\"n\":12,\"type\":\"Single Family\",\"mv\":3693000,\"yr\":1972,\"hoa\":null,\"numbered\":false},\"blossom-meadow\":{\"name\":\"Blossom Meadow\",\"n\":11,\"type\":\"Single Family\",\"mv\":3229000,\"yr\":1960,\"hoa\":null,\"numbered\":false},\"buena-vista-heights\":{\"name\":\"Buena Vista Heights\",\"n\":11,\"type\":\"Single Family\",\"mv\":3661000,\"yr\":1965,\"hoa\":null,\"numbered\":false},\"crescent-hill\":{\"name\":\"Crescent Hill\",\"n\":11,\"type\":\"Single Family\",\"mv\":4272000,\"yr\":1964,\"hoa\":\"Villa Cornet\",\"numbered\":false},\"harris\":{\"name\":\"Harris\",\"n\":11,\"type\":\"Single Family\",\"mv\":2534000,\"yr\":1951,\"hoa\":null,\"numbered\":false},\"hillcrest-estates-01\":{\"name\":\"Hillcrest Estates 01\",\"n\":11,\"type\":\"Single Family\",\"mv\":3254000,\"yr\":1988,\"hoa\":null,\"numbered\":false},\"lake-canyon-map-02\":{\"name\":\"Lake Canyon Map 02\",\"n\":11,\"type\":\"Single Family\",\"mv\":1161000,\"yr\":1936,\"hoa\":null,\"numbered\":false},\"los-gatos-uplands\":{\"name\":\"Los Gatos Uplands\",\"n\":11,\"type\":\"Single Family\",\"mv\":4216000,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"rinconada-highlands\":{\"name\":\"Rinconada Highlands\",\"n\":11,\"type\":\"Single Family\",\"mv\":4587000,\"yr\":1963,\"hoa\":null,\"numbered\":false},\"tract-no-1985\":{\"name\":\"Tract No 1985\",\"n\":11,\"type\":\"Single Family\",\"mv\":2353000,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"vasona-heights\":{\"name\":\"Vasona Heights\",\"n\":11,\"type\":\"Single Family\",\"mv\":4052000,\"yr\":1953,\"hoa\":null,\"numbered\":false},\"englewood\":{\"name\":\"Englewood\",\"n\":10,\"type\":\"Single Family\",\"mv\":4100000,\"yr\":1952,\"hoa\":null,\"numbered\":false},\"idylwild\":{\"name\":\"Idylwild\",\"n\":10,\"type\":\"Single Family\",\"mv\":1177000,\"yr\":1944,\"hoa\":null,\"numbered\":false},\"mountain-spgs\":{\"name\":\"Mountain Spgs\",\"n\":10,\"type\":\"Single Family\",\"mv\":1589000,\"yr\":1964,\"hoa\":null,\"numbered\":false},\"oakmont\":{\"name\":\"Oakmont\",\"n\":10,\"type\":\"Single Family\",\"mv\":1025500,\"yr\":1931,\"hoa\":null,\"numbered\":false},\"office-condo-dev\":{\"name\":\"Office Condo Dev\",\"n\":10,\"type\":\"Other\",\"mv\":438808,\"yr\":1985,\"hoa\":null,\"numbered\":false},\"pollard-oaks-amd\":{\"name\":\"Pollard Oaks Amd\",\"n\":10,\"type\":\"Condominium\",\"mv\":1404500,\"yr\":1984,\"hoa\":\"Pollard Oaks Homeowner Association\",\"numbered\":false},\"redwood-estates-map-3\":{\"name\":\"Redwood Estates Map 3\",\"n\":10,\"type\":\"Single Family\",\"mv\":1154000,\"yr\":1954,\"hoa\":\"Redwood Estates Services Association\",\"numbered\":false},\"rinconada-estates\":{\"name\":\"Rinconada Estates\",\"n\":10,\"type\":\"Single Family\",\"mv\":3715500,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"sereno-knolls\":{\"name\":\"Sereno Knolls\",\"n\":10,\"type\":\"Single Family\",\"mv\":3394000,\"yr\":1974,\"hoa\":null,\"numbered\":false},\"stewart-add-02\":{\"name\":\"Stewart Add 02\",\"n\":10,\"type\":\"Single Family\",\"mv\":1101000,\"yr\":1936,\"hoa\":null,\"numbered\":false},\"stewart-add-03\":{\"name\":\"Stewart Add 03\",\"n\":10,\"type\":\"Single Family\",\"mv\":872000,\"yr\":1940,\"hoa\":\"Aldercroft Heights\",\"numbered\":false},\"vineyard-lts\":{\"name\":\"Vineyard Lts\",\"n\":10,\"type\":\"Single Family\",\"mv\":2778500,\"yr\":1934,\"hoa\":null,\"numbered\":false}}";
const LG_STATS_JSON = "{\"generated\":\"2026-07-21\",\"city\":{\"properties\":7989,\"streets\":913,\"tracts\":1175,\"named_tracts\":129,\"median_value\":2462500,\"median_year_built\":1966,\"sfh\":5944,\"condo\":1157,\"multi\":232,\"sales_12mo\":219,\"median_price_12mo\":2325000,\"owner_occupied_pct\":72},\"sfh_median_by_beds\":{\"2\":1880000,\"3\":2579500,\"4\":3214000,\"5\":3876000},\"top_tracts\":[{\"slug\":\"blossom-hill-manor\",\"name\":\"Blossom Hill Manor\",\"n\":231,\"type\":\"Single Family\",\"mv\":3182000,\"yr\":1953},{\"slug\":\"rinconada-hills\",\"name\":\"Rinconada Hills\",\"n\":216,\"type\":\"Condominium\",\"mv\":1920000,\"yr\":1974},{\"slug\":\"belwood-of-los-gatos\",\"name\":\"Belwood Of Los Gatos\",\"n\":135,\"type\":\"Single Family\",\"mv\":2896000,\"yr\":1965},{\"slug\":\"los-gatos-woods\",\"name\":\"Los Gatos Woods\",\"n\":125,\"type\":\"Condominium\",\"mv\":1514000,\"yr\":1972},{\"slug\":\"rinconada-de-los-gatos-rho\",\"name\":\"Rinconada De Los Gatos Rho\",\"n\":117,\"type\":\"Single Family\",\"mv\":3143000,\"yr\":1952},{\"slug\":\"soquel-augmentation-rho\",\"name\":\"Soquel Augmentation Rho\",\"n\":114,\"type\":\"Single Family\",\"mv\":1415000,\"yr\":1973},{\"slug\":\"cameo-park\",\"name\":\"Cameo Park\",\"n\":108,\"type\":\"Single Family\",\"mv\":2178500,\"yr\":1964},{\"slug\":\"los-gatos-village\",\"name\":\"Los Gatos Village\",\"n\":77,\"type\":\"Condominium\",\"mv\":1364000,\"yr\":1972},{\"slug\":\"almond-grove-add\",\"name\":\"Almond Grove Add\",\"n\":75,\"type\":\"Single Family\",\"mv\":2907000,\"yr\":1910},{\"slug\":\"saratoga-highlands\",\"name\":\"Saratoga Highlands\",\"n\":65,\"type\":\"Single Family\",\"mv\":2461000,\"yr\":1961},{\"slug\":\"wedgewood-manor-condo\",\"name\":\"Wedgewood Manor Condo\",\"n\":64,\"type\":\"Condominium\",\"mv\":570500,\"yr\":1963},{\"slug\":\"vasona-venture\",\"name\":\"Vasona Venture\",\"n\":57,\"type\":\"Condominium\",\"mv\":1712000,\"yr\":1977},{\"slug\":\"cherry-blossom-lane\",\"name\":\"Cherry Blossom Lane\",\"n\":52,\"type\":\"Single Family\",\"mv\":3129500,\"yr\":1961},{\"slug\":\"highland-oaks\",\"name\":\"Highland Oaks\",\"n\":46,\"type\":\"Single Family\",\"mv\":2135000,\"yr\":1957},{\"slug\":\"kenwood-acres\",\"name\":\"Kenwood Acres\",\"n\":45,\"type\":\"Single Family\",\"mv\":3303000,\"yr\":1948},{\"slug\":\"redwood-estates-map-03\",\"name\":\"Redwood Estates Map 03\",\"n\":42,\"type\":\"Single Family\",\"mv\":1127000,\"yr\":1938},{\"slug\":\"rio-rinconada\",\"name\":\"Rio Rinconada\",\"n\":42,\"type\":\"Single Family\",\"mv\":2380000,\"yr\":1962},{\"slug\":\"loma-vista-tr\",\"name\":\"Loma Vista Tr\",\"n\":41,\"type\":\"Single Family\",\"mv\":2628000,\"yr\":1948},{\"slug\":\"charter-oaks\",\"name\":\"Charter Oaks\",\"n\":40,\"type\":\"Condominium\",\"mv\":1609000,\"yr\":1973},{\"slug\":\"los-gatos-creekside-village\",\"name\":\"Los Gatos Creekside Village\",\"n\":38,\"type\":\"Single Family\",\"mv\":1844500,\"yr\":2005},{\"slug\":\"chemeketa-park\",\"name\":\"Chemeketa Park\",\"n\":37,\"type\":\"Single Family\",\"mv\":973000,\"yr\":1945},{\"slug\":\"glen-rdg-park\",\"name\":\"Glen Rdg Park\",\"n\":37,\"type\":\"Single Family\",\"mv\":3497000,\"yr\":1942},{\"slug\":\"surmont\",\"name\":\"Surmont\",\"n\":36,\"type\":\"Single Family\",\"mv\":2981500,\"yr\":1963},{\"slug\":\"redwood-estates-map-04\",\"name\":\"Redwood Estates Map 04\",\"n\":34,\"type\":\"Single Family\",\"mv\":1426000,\"yr\":1973}],\"sales_by_year\":{\"2014\":214,\"2015\":214,\"2016\":234,\"2017\":236,\"2018\":232,\"2019\":237,\"2020\":273,\"2021\":437,\"2022\":288,\"2023\":255,\"2024\":320,\"2025\":232,\"2026\":122}}";
const SR_INTEL_JSON = "{\"generated\":\"2026-07-22\",\"totals\":{\"sales_on_record\":4514,\"median_ppsf\":1539,\"median_price_12mo\":4100000,\"sales_12mo\":115,\"tracts_tracked\":92,\"homes_indexed\":5973},\"quarters\":[{\"q\":\"2016 Q3\",\"ppsf\":812,\"n\":46,\"sf_ppsf\":812,\"sf_n\":42,\"co_ppsf\":762,\"co_n\":4},{\"q\":\"2016 Q4\",\"ppsf\":744,\"n\":41,\"sf_ppsf\":766,\"sf_n\":33,\"co_ppsf\":718,\"co_n\":8},{\"q\":\"2017 Q1\",\"ppsf\":800,\"n\":26,\"sf_ppsf\":835,\"sf_n\":21,\"co_ppsf\":734,\"co_n\":5},{\"q\":\"2017 Q2\",\"ppsf\":906,\"n\":54,\"sf_ppsf\":915,\"sf_n\":51,\"co_ppsf\":null,\"co_n\":3},{\"q\":\"2017 Q3\",\"ppsf\":875,\"n\":43,\"sf_ppsf\":885,\"sf_n\":37,\"co_ppsf\":739,\"co_n\":5},{\"q\":\"2017 Q4\",\"ppsf\":993,\"n\":41,\"sf_ppsf\":994,\"sf_n\":35,\"co_ppsf\":null,\"co_n\":3},{\"q\":\"2018 Q1\",\"ppsf\":993,\"n\":30,\"sf_ppsf\":1003,\"sf_n\":28,\"co_ppsf\":null,\"co_n\":1},{\"q\":\"2018 Q2\",\"ppsf\":989,\"n\":44,\"sf_ppsf\":1050,\"sf_n\":39,\"co_ppsf\":911,\"co_n\":4},{\"q\":\"2018 Q3\",\"ppsf\":1023,\"n\":30,\"sf_ppsf\":991,\"sf_n\":26,\"co_ppsf\":null,\"co_n\":2},{\"q\":\"2018 Q4\",\"ppsf\":887,\"n\":35,\"sf_ppsf\":907,\"sf_n\":30,\"co_ppsf\":798,\"co_n\":4},{\"q\":\"2019 Q1\",\"ppsf\":901,\"n\":19,\"sf_ppsf\":907,\"sf_n\":17,\"co_ppsf\":null,\"co_n\":1},{\"q\":\"2019 Q2\",\"ppsf\":991,\"n\":66,\"sf_ppsf\":1008,\"sf_n\":55,\"co_ppsf\":841,\"co_n\":11},{\"q\":\"2019 Q3\",\"ppsf\":1019,\"n\":43,\"sf_ppsf\":1024,\"sf_n\":40,\"co_ppsf\":null,\"co_n\":3},{\"q\":\"2019 Q4\",\"ppsf\":860,\"n\":45,\"sf_ppsf\":933,\"sf_n\":37,\"co_ppsf\":741,\"co_n\":6},{\"q\":\"2020 Q1\",\"ppsf\":1029,\"n\":29,\"sf_ppsf\":1084,\"sf_n\":25,\"co_ppsf\":725,\"co_n\":4},{\"q\":\"2020 Q2\",\"ppsf\":1029,\"n\":33,\"sf_ppsf\":1029,\"sf_n\":31,\"co_ppsf\":null,\"co_n\":1},{\"q\":\"2020 Q3\",\"ppsf\":952,\"n\":51,\"sf_ppsf\":995,\"sf_n\":44,\"co_ppsf\":889,\"co_n\":6},{\"q\":\"2020 Q4\",\"ppsf\":1023,\"n\":60,\"sf_ppsf\":1084,\"sf_n\":52,\"co_ppsf\":808,\"co_n\":7},{\"q\":\"2021 Q1\",\"ppsf\":1049,\"n\":51,\"sf_ppsf\":1118,\"sf_n\":41,\"co_ppsf\":722,\"co_n\":8},{\"q\":\"2021 Q2\",\"ppsf\":1212,\"n\":89,\"sf_ppsf\":1256,\"sf_n\":77,\"co_ppsf\":927,\"co_n\":11},{\"q\":\"2021 Q3\",\"ppsf\":1314,\"n\":76,\"sf_ppsf\":1319,\"sf_n\":74,\"co_ppsf\":null,\"co_n\":2},{\"q\":\"2021 Q4\",\"ppsf\":1184,\"n\":49,\"sf_ppsf\":1270,\"sf_n\":40,\"co_ppsf\":864,\"co_n\":7},{\"q\":\"2022 Q1\",\"ppsf\":1516,\"n\":25,\"sf_ppsf\":1542,\"sf_n\":23,\"co_ppsf\":null,\"co_n\":2},{\"q\":\"2022 Q2\",\"ppsf\":1418,\"n\":53,\"sf_ppsf\":1441,\"sf_n\":45,\"co_ppsf\":927,\"co_n\":8},{\"q\":\"2022 Q3\",\"ppsf\":1402,\"n\":38,\"sf_ppsf\":1407,\"sf_n\":34,\"co_ppsf\":null,\"co_n\":2},{\"q\":\"2022 Q4\",\"ppsf\":1220,\"n\":27,\"sf_ppsf\":1291,\"sf_n\":23,\"co_ppsf\":null,\"co_n\":3},{\"q\":\"2023 Q1\",\"ppsf\":1264,\"n\":20,\"sf_ppsf\":1271,\"sf_n\":17,\"co_ppsf\":null,\"co_n\":2},{\"q\":\"2023 Q2\",\"ppsf\":1354,\"n\":43,\"sf_ppsf\":1423,\"sf_n\":37,\"co_ppsf\":897,\"co_n\":4},{\"q\":\"2023 Q3\",\"ppsf\":1487,\"n\":26,\"sf_ppsf\":1508,\"sf_n\":23,\"co_ppsf\":null,\"co_n\":3},{\"q\":\"2023 Q4\",\"ppsf\":1372,\"n\":32,\"sf_ppsf\":1508,\"sf_n\":26,\"co_ppsf\":942,\"co_n\":4},{\"q\":\"2024 Q1\",\"ppsf\":1377,\"n\":34,\"sf_ppsf\":1556,\"sf_n\":25,\"co_ppsf\":925,\"co_n\":7},{\"q\":\"2024 Q2\",\"ppsf\":1458,\"n\":48,\"sf_ppsf\":1586,\"sf_n\":42,\"co_ppsf\":1008,\"co_n\":4},{\"q\":\"2024 Q3\",\"ppsf\":1455,\"n\":55,\"sf_ppsf\":1525,\"sf_n\":47,\"co_ppsf\":992,\"co_n\":8},{\"q\":\"2024 Q4\",\"ppsf\":1523,\"n\":47,\"sf_ppsf\":1593,\"sf_n\":40,\"co_ppsf\":1129,\"co_n\":6},{\"q\":\"2025 Q1\",\"ppsf\":1613,\"n\":37,\"sf_ppsf\":1635,\"sf_n\":29,\"co_ppsf\":1106,\"co_n\":8},{\"q\":\"2025 Q2\",\"ppsf\":1470,\"n\":56,\"sf_ppsf\":1498,\"sf_n\":46,\"co_ppsf\":1012,\"co_n\":9},{\"q\":\"2025 Q3\",\"ppsf\":1368,\"n\":31,\"sf_ppsf\":1601,\"sf_n\":24,\"co_ppsf\":933,\"co_n\":6},{\"q\":\"2025 Q4\",\"ppsf\":1533,\"n\":35,\"sf_ppsf\":1545,\"sf_n\":28,\"co_ppsf\":824,\"co_n\":5},{\"q\":\"2026 Q1\",\"ppsf\":1581,\"n\":18,\"sf_ppsf\":1617,\"sf_n\":15,\"co_ppsf\":null,\"co_n\":3},{\"q\":\"2026 Q2\",\"ppsf\":1579,\"n\":32,\"sf_ppsf\":1664,\"sf_n\":28,\"co_ppsf\":764,\"co_n\":4},{\"q\":\"2026 Q3\",\"ppsf\":1051,\"n\":7,\"sf_ppsf\":1930,\"sf_n\":4,\"co_ppsf\":null,\"co_n\":3}],\"feed\":[{\"a\":\"19908 Vineyard Ln\",\"s\":\"19908-vineyard-ln\",\"p\":1300000,\"sf\":1511,\"ppsf\":860,\"tract\":\"Vineyards Of Saratoga Ph 02\",\"ts\":\"vineyards-of-saratoga-ph-02\",\"d\":\"Jul 14, 2026\"},{\"a\":\"14575 Horseshoe Dr\",\"s\":\"14575-horseshoe-dr\",\"p\":5065000,\"sf\":2341,\"ppsf\":2164,\"tract\":\"Saratoga Acres\",\"ts\":\"saratoga-acres\",\"d\":\"Jul 14, 2026\"},{\"a\":\"20661 Oak Creek Ln\",\"s\":\"20661-oak-creek-ln\",\"p\":1900000,\"sf\":1807,\"ppsf\":1051,\"tract\":\"6393 Oak Crk\",\"ts\":\"6393-oak-crk\",\"d\":\"Jul 13, 2026\"},{\"a\":\"12820 Paseo Presada\",\"s\":\"12820-paseo-presada\",\"p\":5500000,\"sf\":1260,\"ppsf\":4365,\"tract\":\"El Quito Park\",\"ts\":\"el-quito-park\",\"d\":\"Jul 10, 2026\"},{\"a\":\"20740 4th St Apt 4\",\"s\":\"20740-4th-st-apt-4\",\"p\":600000,\"sf\":876,\"ppsf\":685,\"tract\":\"Gatehouse\",\"ts\":\"gatehouse\",\"d\":\"Jul 8, 2026\"},{\"a\":\"21842 Via Regina\",\"s\":\"21842-via-regina\",\"p\":4700000,\"sf\":4656,\"ppsf\":1009,\"tract\":null,\"ts\":null,\"d\":\"Jul 8, 2026\"},{\"a\":\"12637 Lido Way\",\"s\":\"12637-lido-way\",\"p\":4850000,\"sf\":2860,\"ppsf\":1696,\"tract\":\"Greenbrier\",\"ts\":\"greenbrier\",\"d\":\"Jul 1, 2026\"},{\"a\":\"14353 Saratoga Ave Apt A\",\"s\":\"14353-saratoga-ave-apt-a\",\"p\":900000,\"sf\":1429,\"ppsf\":630,\"tract\":\"Saratoga Inn Place\",\"ts\":\"saratoga-inn-place\",\"d\":\"Jun 30, 2026\"},{\"a\":\"20782 Verde Vista Ln\",\"s\":\"20782-verde-vista-ln\",\"p\":4175000,\"sf\":2531,\"ppsf\":1650,\"tract\":null,\"ts\":null,\"d\":\"Jun 30, 2026\"},{\"a\":\"19605 Glen Una Dr\",\"s\":\"19605-glen-una-dr\",\"p\":5488000,\"sf\":3149,\"ppsf\":1743,\"tract\":\"Glen Una Ranch Map 01\",\"ts\":\"glen-una-ranch-map-01\",\"d\":\"Jun 30, 2026\"}],\"rank\":[{\"slug\":\"blue-hills-of-saratoga\",\"name\":\"Blue Hills Of Saratoga\",\"ppsf\":1538,\"vol\":9,\"price\":3601000},{\"slug\":\"pheasant-ridge\",\"name\":\"Pheasant Ridge\",\"ppsf\":1510,\"vol\":10,\"price\":3725000},{\"slug\":\"uplands\",\"name\":\"Uplands\",\"ppsf\":1463,\"vol\":15,\"price\":3950000},{\"slug\":\"greenbrier\",\"name\":\"Greenbrier\",\"ppsf\":1392,\"vol\":24,\"price\":3150000},{\"slug\":\"arroyo-de-saratoga\",\"name\":\"Arroyo De Saratoga\",\"ppsf\":1377,\"vol\":32,\"price\":3600000},{\"slug\":\"saratoga-orchards\",\"name\":\"Saratoga Orchards\",\"ppsf\":1367,\"vol\":11,\"price\":3050500},{\"slug\":\"el-quito-park\",\"name\":\"El Quito Park\",\"ppsf\":1360,\"vol\":39,\"price\":2530000},{\"slug\":\"merrick-villa\",\"name\":\"Merrick Villa\",\"ppsf\":1348,\"vol\":9,\"price\":2810000},{\"slug\":\"argonaut-place\",\"name\":\"Argonaut Place\",\"ppsf\":1330,\"vol\":15,\"price\":3650000},{\"slug\":\"sunland-park\",\"name\":\"Sunland Park\",\"ppsf\":1320,\"vol\":34,\"price\":2215000},{\"slug\":\"westbrook-add\",\"name\":\"Westbrook Add\",\"ppsf\":1308,\"vol\":9,\"price\":3038000},{\"slug\":\"brookview\",\"name\":\"Brookview\",\"ppsf\":1278,\"vol\":29,\"price\":2650000},{\"slug\":\"mellowood\",\"name\":\"Mellowood\",\"ppsf\":1255,\"vol\":9,\"price\":2200000},{\"slug\":\"peremont-tr\",\"name\":\"Peremont Tr\",\"ppsf\":1245,\"vol\":16,\"price\":2000000},{\"slug\":\"saratoga-glen\",\"name\":\"Saratoga Glen\",\"ppsf\":1245,\"vol\":23,\"price\":3100000},{\"slug\":\"wildwood-heights\",\"name\":\"Wildwood Heights\",\"ppsf\":1224,\"vol\":14,\"price\":2757000},{\"slug\":\"villa-saratoga\",\"name\":\"Villa Saratoga\",\"ppsf\":1212,\"vol\":8,\"price\":2502000},{\"slug\":\"quito-rho\",\"name\":\"Quito Rho\",\"ppsf\":1211,\"vol\":32,\"price\":3700000},{\"slug\":\"prides-crossing\",\"name\":\"Prides Crossing\",\"ppsf\":1173,\"vol\":27,\"price\":2630000},{\"slug\":\"saratoga-woods\",\"name\":\"Saratoga Woods\",\"ppsf\":1165,\"vol\":20,\"price\":2500000},{\"slug\":\"saratoga-park\",\"name\":\"Saratoga Park\",\"ppsf\":1149,\"vol\":9,\"price\":2550000},{\"slug\":\"prides-crossing-south\",\"name\":\"Prides Crossing South\",\"ppsf\":1119,\"vol\":13,\"price\":2960000},{\"slug\":\"saratoga-gardens\",\"name\":\"Saratoga Gardens\",\"ppsf\":1106,\"vol\":23,\"price\":2700000},{\"slug\":\"georgetown-west\",\"name\":\"Georgetown West\",\"ppsf\":1088,\"vol\":14,\"price\":2825000},{\"slug\":\"la-saratoga-park\",\"name\":\"La Saratoga Park\",\"ppsf\":1087,\"vol\":15,\"price\":2758000},{\"slug\":\"riverdale\",\"name\":\"Riverdale\",\"ppsf\":1084,\"vol\":13,\"price\":2750000},{\"slug\":\"san-tomas-orchards\",\"name\":\"San Tomas Orchards\",\"ppsf\":1064,\"vol\":71,\"price\":2500000},{\"slug\":\"parker-ranch\",\"name\":\"Parker Ranch\",\"ppsf\":995,\"vol\":18,\"price\":4230000},{\"slug\":\"quito-road-rancho\",\"name\":\"Quito Road Rancho\",\"ppsf\":936,\"vol\":9,\"price\":2125000},{\"slug\":\"sara-hills\",\"name\":\"Sara Hills\",\"ppsf\":915,\"vol\":8,\"price\":2862500},{\"slug\":\"saratoga-oaks\",\"name\":\"Saratoga Oaks\",\"ppsf\":836,\"vol\":28,\"price\":1920000},{\"slug\":\"gatehouse\",\"name\":\"Gatehouse\",\"ppsf\":835,\"vol\":18,\"price\":850000},{\"slug\":\"vineyards-of-saratoga-ph-02\",\"name\":\"Vineyards Of Saratoga Ph 02\",\"ppsf\":823,\"vol\":8,\"price\":1240000},{\"slug\":\"subdivision-4892\",\"name\":\"Subdivision 4892\",\"ppsf\":812,\"vol\":16,\"price\":950000}],\"tracts\":{\"apricot-hill\":{\"name\":\"Apricot Hill\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1008,\"price\":3258000,\"n\":6},\"all_n\":8,\"yr\":1975},\"argonaut-glen\":{\"name\":\"Argonaut Glen\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1164,\"price\":3710000,\"n\":5},\"all_n\":13,\"yr\":1964},\"argonaut-place\":{\"name\":\"Argonaut Place\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1742,\"price\":4000000,\"n\":6},\"h10\":{\"ppsf\":1330,\"price\":3650000,\"n\":15},\"all_n\":82,\"yr\":1955},\"arroyo-de-arguello\":{\"name\":\"Arroyo De Arguello\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":8,\"yr\":1972},\"arroyo-de-saratoga\":{\"name\":\"Arroyo De Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":1688,\"price\":4478000,\"n\":11},\"h5\":{\"ppsf\":1617,\"price\":4350000,\"n\":15},\"h10\":{\"ppsf\":1377,\"price\":3600000,\"n\":32},\"all_n\":104,\"yr\":1965},\"azule-homesites\":{\"name\":\"Azule Homesites\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":16,\"yr\":1957},\"azule-homesites-02\":{\"name\":\"Azule Homesites 02\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1350,\"price\":2460000,\"n\":5},\"all_n\":21,\"yr\":1951},\"beaumont-heights\":{\"name\":\"Beaumont Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":8,\"yr\":1953},\"blossom-view-of-saratoga\":{\"name\":\"Blossom View Of Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":1058,\"price\":2000000,\"n\":4},\"all_n\":18,\"yr\":1965},\"blue-hills-of-saratoga\":{\"name\":\"Blue Hills Of Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":1650,\"price\":3920000,\"n\":4},\"h5\":{\"ppsf\":1608,\"price\":3780000,\"n\":6},\"h10\":{\"ppsf\":1538,\"price\":3601000,\"n\":9},\"all_n\":33,\"yr\":1965},\"blue-ridge\":{\"name\":\"Blue Ridge\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1338,\"price\":3939000,\"n\":5},\"h10\":{\"ppsf\":1332,\"price\":3890000,\"n\":7},\"all_n\":33,\"yr\":1963},\"brookview\":{\"name\":\"Brookview\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":1853,\"price\":3531000,\"n\":7},\"h5\":{\"ppsf\":1557,\"price\":3205000,\"n\":13},\"h10\":{\"ppsf\":1278,\"price\":2650000,\"n\":29},\"all_n\":88,\"yr\":1956},\"carnelian-glen\":{\"name\":\"Carnelian Glen\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":8,\"yr\":1978},\"country-squire-estates\":{\"name\":\"Country Squire Estates\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":1009,\"price\":2479000,\"n\":5},\"all_n\":14,\"yr\":1958},\"cunningham-acres\":{\"name\":\"Cunningham Acres\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1200,\"price\":2800000,\"n\":5},\"all_n\":18,\"yr\":1950},\"deerpark\":{\"name\":\"Deerpark\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":10,\"yr\":1962},\"donny-brook-manor\":{\"name\":\"Donny Brook Manor\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1472,\"price\":3905000,\"n\":4},\"h10\":{\"ppsf\":1472,\"price\":3905000,\"n\":4},\"all_n\":10,\"yr\":1968},\"eden-ranch\":{\"name\":\"Eden Ranch\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":10,\"yr\":1989},\"eichler-homes-of-saratoga\":{\"name\":\"Eichler Homes Of Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":931,\"price\":2575000,\"n\":4},\"all_n\":25,\"yr\":1969},\"el-quito-park\":{\"name\":\"El Quito Park\",\"h1\":{\"ppsf\":2259,\"price\":3025000,\"n\":4},\"h3\":{\"ppsf\":1589,\"price\":2905000,\"n\":15},\"h5\":{\"ppsf\":1425,\"price\":2905000,\"n\":25},\"h10\":{\"ppsf\":1360,\"price\":2530000,\"n\":39},\"all_n\":90,\"yr\":1950},\"farr-ranch\":{\"name\":\"Farr Ranch\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1258,\"price\":2240000,\"n\":4},\"all_n\":12,\"yr\":1966},\"gatehouse\":{\"name\":\"Gatehouse\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":743,\"price\":780000,\"n\":5},\"h5\":{\"ppsf\":864,\"price\":850000,\"n\":9},\"h10\":{\"ppsf\":835,\"price\":850000,\"n\":18},\"all_n\":47,\"yr\":1970},\"georgetown-west\":{\"name\":\"Georgetown West\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1496,\"price\":3650000,\"n\":4},\"h10\":{\"ppsf\":1088,\"price\":2825000,\"n\":14},\"all_n\":37,\"yr\":1967},\"glen-una-park\":{\"name\":\"Glen Una Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1211,\"price\":5630000,\"n\":7},\"all_n\":10,\"yr\":1948},\"greenbrier\":{\"name\":\"Greenbrier\",\"h1\":{\"ppsf\":1574,\"price\":4125000,\"n\":4},\"h3\":{\"ppsf\":1574,\"price\":4125000,\"n\":10},\"h5\":{\"ppsf\":1452,\"price\":4050000,\"n\":13},\"h10\":{\"ppsf\":1392,\"price\":3150000,\"n\":24},\"all_n\":64,\"yr\":1970},\"happy-valley\":{\"name\":\"Happy Valley\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1679,\"price\":3325000,\"n\":4},\"h10\":{\"ppsf\":1444,\"price\":3250000,\"n\":6},\"all_n\":17,\"yr\":1958},\"hills-of-saratoga\":{\"name\":\"Hills Of Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1206,\"price\":4325000,\"n\":6},\"all_n\":14,\"yr\":1961},\"kirkmont-of-saratoga\":{\"name\":\"Kirkmont Of Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1438,\"price\":3150000,\"n\":5},\"all_n\":24,\"yr\":1964},\"la-paloma-terrace\":{\"name\":\"La Paloma Terrace\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1729,\"price\":2850000,\"n\":5},\"all_n\":10,\"yr\":1952},\"la-saratoga-park\":{\"name\":\"La Saratoga Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":1390,\"price\":3300000,\"n\":4},\"h5\":{\"ppsf\":1447,\"price\":3400000,\"n\":5},\"h10\":{\"ppsf\":1087,\"price\":2758000,\"n\":15},\"all_n\":41,\"yr\":1962},\"las-haciendas-de-la-rinconada\":{\"name\":\"Las Haciendas De La Rinconada\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1307,\"price\":3900000,\"n\":7},\"all_n\":15,\"yr\":1950},\"mary-parker-homestead\":{\"name\":\"Mary Parker Homestead\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":824,\"price\":700000,\"n\":4},\"all_n\":8,\"yr\":1962},\"mellowood\":{\"name\":\"Mellowood\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1438,\"price\":2950000,\"n\":5},\"h10\":{\"ppsf\":1255,\"price\":2200000,\"n\":9},\"all_n\":26,\"yr\":1957},\"merrick-villa\":{\"name\":\"Merrick Villa\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1746,\"price\":3515000,\"n\":4},\"h10\":{\"ppsf\":1348,\"price\":2810000,\"n\":9},\"all_n\":25,\"yr\":1957},\"merrivale\":{\"name\":\"Merrivale\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1232,\"price\":3000000,\"n\":7},\"all_n\":19,\"yr\":1957},\"merrivale-add\":{\"name\":\"Merrivale Add\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":16,\"yr\":1958},\"montecito-heights\":{\"name\":\"Montecito Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":926,\"price\":4200000,\"n\":7},\"all_n\":18,\"yr\":1964},\"montecito-pines\":{\"name\":\"Montecito Pines\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1371,\"price\":4675000,\"n\":5},\"all_n\":8,\"yr\":1957},\"montewood\":{\"name\":\"Montewood\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":11,\"yr\":1969},\"mount-eden-estates\":{\"name\":\"Mount Eden Estates\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":1224,\"price\":5850000,\"n\":4},\"h5\":{\"ppsf\":1224,\"price\":5850000,\"n\":4},\"h10\":{\"ppsf\":1198,\"price\":4770000,\"n\":6},\"all_n\":9,\"yr\":1993},\"oakknoll-saratoga\":{\"name\":\"Oakknoll Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":1028,\"price\":2875000,\"n\":4},\"all_n\":9,\"yr\":1969},\"parcel-map\":{\"name\":\"Parcel Map\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":929,\"price\":2593000,\"n\":5},\"all_n\":15,\"yr\":1983},\"parker-ranch\":{\"name\":\"Parker Ranch\",\"h1\":{\"ppsf\":1246,\"price\":3825000,\"n\":4},\"h3\":{\"ppsf\":1181,\"price\":4655000,\"n\":8},\"h5\":{\"ppsf\":1124,\"price\":4700000,\"n\":11},\"h10\":{\"ppsf\":995,\"price\":4230000,\"n\":18},\"all_n\":42,\"yr\":1987},\"peremont-tr\":{\"name\":\"Peremont Tr\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":1585,\"price\":2628000,\"n\":4},\"h5\":{\"ppsf\":1572,\"price\":2703000,\"n\":5},\"h10\":{\"ppsf\":1245,\"price\":2000000,\"n\":16},\"all_n\":35,\"yr\":1958},\"pheasant-ridge\":{\"name\":\"Pheasant Ridge\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":1681,\"price\":4100000,\"n\":4},\"h5\":{\"ppsf\":1686,\"price\":4150000,\"n\":5},\"h10\":{\"ppsf\":1510,\"price\":3725000,\"n\":10},\"all_n\":28,\"yr\":1970},\"prides-crossing\":{\"name\":\"Prides Crossing\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1702,\"price\":3856000,\"n\":9},\"h10\":{\"ppsf\":1173,\"price\":2630000,\"n\":27},\"all_n\":82,\"yr\":1962},\"prides-crossing-add\":{\"name\":\"Prides Crossing Add\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1182,\"price\":2800000,\"n\":7},\"all_n\":23,\"yr\":1964},\"prides-crossing-estates\":{\"name\":\"Prides Crossing Estates\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":988,\"price\":2570000,\"n\":6},\"all_n\":23,\"yr\":1967},\"prides-crossing-south\":{\"name\":\"Prides Crossing South\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":1803,\"price\":4601000,\"n\":4},\"h5\":{\"ppsf\":1803,\"price\":4601000,\"n\":4},\"h10\":{\"ppsf\":1119,\"price\":2960000,\"n\":13},\"all_n\":43,\"yr\":1971},\"quito-rancho\":{\"name\":\"Quito Rancho\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1063,\"price\":3195000,\"n\":6},\"all_n\":14,\"yr\":1977},\"quito-rho\":{\"name\":\"Quito Rho\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":1449,\"price\":5099000,\"n\":11},\"h5\":{\"ppsf\":1467,\"price\":4728000,\"n\":18},\"h10\":{\"ppsf\":1211,\"price\":3700000,\"n\":32},\"all_n\":76,\"yr\":1970},\"quito-road-rancho\":{\"name\":\"Quito Road Rancho\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":936,\"price\":2125000,\"n\":9},\"all_n\":22,\"yr\":1958},\"rio-villa-terrace\":{\"name\":\"Rio Villa Terrace\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1142,\"price\":1850000,\"n\":5},\"all_n\":11,\"yr\":1957},\"riverdale\":{\"name\":\"Riverdale\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1372,\"price\":3020000,\"n\":6},\"h10\":{\"ppsf\":1084,\"price\":2750000,\"n\":13},\"all_n\":20,\"yr\":1963},\"san-tomas-orchards\":{\"name\":\"San Tomas Orchards\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":1726,\"price\":2977000,\"n\":14},\"h5\":{\"ppsf\":1416,\"price\":2977000,\"n\":27},\"h10\":{\"ppsf\":1064,\"price\":2500000,\"n\":71},\"all_n\":161,\"yr\":1951},\"sara-hills\":{\"name\":\"Sara Hills\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":915,\"price\":2862500,\"n\":8},\"all_n\":24,\"yr\":1966},\"saratoga\":{\"name\":\"Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":809,\"price\":1250000,\"n\":7},\"all_n\":15,\"yr\":1971},\"saratoga-acres\":{\"name\":\"Saratoga Acres\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":13,\"yr\":1966},\"saratoga-creek-townhomes\":{\"name\":\"Saratoga Creek Townhomes\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":933,\"price\":1925000,\"n\":4},\"all_n\":11,\"yr\":2012},\"saratoga-creekside\":{\"name\":\"Saratoga Creekside\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":679,\"price\":827000,\"n\":5},\"all_n\":10,\"yr\":1969},\"saratoga-estates\":{\"name\":\"Saratoga Estates\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1379,\"price\":3527000,\"n\":4},\"h10\":{\"ppsf\":1324,\"price\":3527000,\"n\":5},\"all_n\":16,\"yr\":1970},\"saratoga-forest\":{\"name\":\"Saratoga Forest\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1078,\"price\":3535000,\"n\":6},\"all_n\":8,\"yr\":1968},\"saratoga-gardens\":{\"name\":\"Saratoga Gardens\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h3\":{\"ppsf\":1397,\"price\":3800000,\"n\":5},\"h5\":{\"ppsf\":1393,\"price\":3398500,\"n\":8},\"h10\":{\"ppsf\":1106,\"price\":2700000,\"n\":23},\"all_n\":80,\"yr\":1954},\"saratoga-glen\":{\"name\":\"Saratoga Glen\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":1724,\"price\":4600000,\"n\":6},\"h5\":{\"ppsf\":1667,\"price\":4600000,\"n\":7},\"h10\":{\"ppsf\":1245,\"price\":3100000,\"n\":23},\"all_n\":74,\"yr\":1959},\"saratoga-manor\":{\"name\":\"Saratoga Manor\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":11,\"yr\":1968},\"saratoga-oaks\":{\"name\":\"Saratoga Oaks\",\"h1\":{\"ppsf\":877,\"price\":1850000,\"n\":4},\"h3\":{\"ppsf\":954,\"price\":2025000,\"n\":12},\"h5\":{\"ppsf\":925,\"price\":2000000,\"n\":17},\"h10\":{\"ppsf\":836,\"price\":1920000,\"n\":28},\"all_n\":50,\"yr\":1973},\"saratoga-orchards\":{\"name\":\"Saratoga Orchards\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":2030,\"price\":3205000,\"n\":7},\"h10\":{\"ppsf\":1367,\"price\":3050500,\"n\":11},\"all_n\":31,\"yr\":1954},\"saratoga-park\":{\"name\":\"Saratoga Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1149,\"price\":2550000,\"n\":9},\"all_n\":19,\"yr\":1972},\"saratoga-villa\":{\"name\":\"Saratoga Villa\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1342,\"price\":4400000,\"n\":6},\"all_n\":12,\"yr\":2003},\"saratoga-village\":{\"name\":\"Saratoga Village\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1117,\"price\":2888000,\"n\":7},\"all_n\":25,\"yr\":1959},\"saratoga-vista\":{\"name\":\"Saratoga Vista\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":13,\"yr\":2004},\"saratoga-woods\":{\"name\":\"Saratoga Woods\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":1490,\"price\":3000000,\"n\":8},\"h10\":{\"ppsf\":1165,\"price\":2500000,\"n\":20},\"all_n\":38,\"yr\":1959},\"shadow-oaks\":{\"name\":\"Shadow Oaks\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":11,\"yr\":1956},\"squirrel-hollow\":{\"name\":\"Squirrel Hollow\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":2},\"all_n\":10,\"yr\":1963},\"subdivision-4892\":{\"name\":\"Subdivision 4892\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":870,\"price\":960000,\"n\":4},\"h5\":{\"ppsf\":916,\"price\":1000000,\"n\":8},\"h10\":{\"ppsf\":812,\"price\":950000,\"n\":16},\"all_n\":25,\"yr\":1971},\"summerplace\":{\"name\":\"Summerplace\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":960,\"price\":3078000,\"n\":5},\"all_n\":18,\"yr\":1973},\"sunland-park\":{\"name\":\"Sunland Park\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":1750,\"price\":2688000,\"n\":7},\"h5\":{\"ppsf\":1535,\"price\":2510000,\"n\":16},\"h10\":{\"ppsf\":1320,\"price\":2215000,\"n\":34},\"all_n\":98,\"yr\":1956},\"tract-no-2543\":{\"name\":\"Tract No 2543\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":12,\"yr\":1960},\"tract-no-2988\":{\"name\":\"Tract No 2988\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":1390,\"price\":3600000,\"n\":5},\"all_n\":9,\"yr\":1962},\"tract-no-3145\":{\"name\":\"Tract No 3145\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h10\":{\"ppsf\":1267,\"price\":2575000,\"n\":6},\"all_n\":11,\"yr\":1965},\"tract-no-3738\":{\"name\":\"Tract No 3738\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":9,\"yr\":1968},\"tract-no-4344\":{\"name\":\"Tract No 4344\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":null,\"price\":null,\"n\":3},\"all_n\":9,\"yr\":1969},\"tract-no-5462\":{\"name\":\"Tract No 5462\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":1055,\"price\":1850000,\"n\":4},\"all_n\":9,\"yr\":1975},\"tract-no-6508\":{\"name\":\"Tract No 6508\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":1031,\"price\":1350000,\"n\":5},\"all_n\":10,\"yr\":1979},\"tract-no-8700\":{\"name\":\"Tract No 8700\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":901,\"price\":2695000,\"n\":6},\"all_n\":18,\"yr\":1996},\"uplands\":{\"name\":\"Uplands\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":1847,\"price\":4300000,\"n\":5},\"h5\":{\"ppsf\":1759,\"price\":4225000,\"n\":8},\"h10\":{\"ppsf\":1463,\"price\":3950000,\"n\":15},\"all_n\":37,\"yr\":1964},\"villa-saratoga\":{\"name\":\"Villa Saratoga\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":1355,\"price\":2800000,\"n\":6},\"h10\":{\"ppsf\":1212,\"price\":2502000,\"n\":8},\"all_n\":23,\"yr\":1955},\"vineyards-of-saratoga-ph-02\":{\"name\":\"Vineyards Of Saratoga Ph 02\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h5\":{\"ppsf\":842,\"price\":1245000,\"n\":4},\"h10\":{\"ppsf\":823,\"price\":1240000,\"n\":8},\"all_n\":19,\"yr\":1973},\"westbrook-add\":{\"name\":\"Westbrook Add\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1447,\"price\":3805000,\"n\":5},\"h10\":{\"ppsf\":1308,\"price\":3038000,\"n\":9},\"all_n\":30,\"yr\":1955},\"westview\":{\"name\":\"Westview\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h5\":{\"ppsf\":1677,\"price\":3250000,\"n\":4},\"h10\":{\"ppsf\":1416,\"price\":3150000,\"n\":6},\"all_n\":24,\"yr\":1958},\"wildwood-heights\":{\"name\":\"Wildwood Heights\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":2144,\"price\":2757000,\"n\":4},\"h5\":{\"ppsf\":1787,\"price\":2757000,\"n\":6},\"h10\":{\"ppsf\":1224,\"price\":2757000,\"n\":14},\"all_n\":54,\"yr\":1959},\"williams\":{\"name\":\"Williams\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":1251,\"price\":3200000,\"n\":6},\"all_n\":14,\"yr\":1977}},\"by_bed\":{\"2\":1305000,\"3\":3050000,\"4\":4065000,\"5\":4380000},\"spread\":{\"hi\":{\"slug\":\"blue-hills-of-saratoga\",\"name\":\"Blue Hills Of Saratoga\",\"ppsf\":1538,\"vol\":9,\"price\":3601000},\"lo\":{\"slug\":\"subdivision-4892\",\"name\":\"Subdivision 4892\",\"ppsf\":812,\"vol\":16,\"price\":950000},\"ratio\":1.9},\"most_active\":{\"slug\":\"san-tomas-orchards\",\"name\":\"San Tomas Orchards\",\"ppsf\":1064,\"vol\":71,\"price\":2500000}}";
const SR_TRACTS_JSON = "{\"san-tomas-orchards\":{\"name\":\"San Tomas Orchards\",\"n\":207,\"type\":\"Single Family\",\"mv\":3169000,\"yr\":1951,\"hoa\":null,\"numbered\":false},\"arroyo-de-saratoga\":{\"name\":\"Arroyo De Saratoga\",\"n\":134,\"type\":\"Single Family\",\"mv\":4289000,\"yr\":1965,\"hoa\":null,\"numbered\":false},\"sunland-park\":{\"name\":\"Sunland Park\",\"n\":124,\"type\":\"Single Family\",\"mv\":2747500,\"yr\":1956,\"hoa\":null,\"numbered\":false},\"argonaut-place\":{\"name\":\"Argonaut Place\",\"n\":118,\"type\":\"Single Family\",\"mv\":4425000,\"yr\":1955,\"hoa\":null,\"numbered\":false},\"el-quito-park\":{\"name\":\"El Quito Park\",\"n\":114,\"type\":\"Single Family\",\"mv\":2942500,\"yr\":1950,\"hoa\":null,\"numbered\":false},\"brookview\":{\"name\":\"Brookview\",\"n\":112,\"type\":\"Single Family\",\"mv\":3498000,\"yr\":1956,\"hoa\":null,\"numbered\":false},\"prides-crossing\":{\"name\":\"Prides Crossing\",\"n\":107,\"type\":\"Single Family\",\"mv\":4173000,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"quito-rho\":{\"name\":\"Quito Rho\",\"n\":103,\"type\":\"Single Family\",\"mv\":4566000,\"yr\":1964,\"hoa\":null,\"numbered\":false},\"saratoga-gardens\":{\"name\":\"Saratoga Gardens\",\"n\":103,\"type\":\"Single Family\",\"mv\":3489000,\"yr\":1954,\"hoa\":null,\"numbered\":false},\"saratoga-glen\":{\"name\":\"Saratoga Glen\",\"n\":97,\"type\":\"Single Family\",\"mv\":4418000,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"greenbrier\":{\"name\":\"Greenbrier\",\"n\":88,\"type\":\"Single Family\",\"mv\":3816500,\"yr\":1970,\"hoa\":\"Greenbriar Home Owner Association\",\"numbered\":false},\"wildwood-heights\":{\"name\":\"Wildwood Heights\",\"n\":80,\"type\":\"Single Family\",\"mv\":3375000,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"gatehouse\":{\"name\":\"Gatehouse\",\"n\":59,\"type\":\"Condominium\",\"mv\":1100000,\"yr\":1970,\"hoa\":\"Gatehouse Condominium\",\"numbered\":false},\"prides-crossing-south\":{\"name\":\"Prides Crossing South\",\"n\":58,\"type\":\"Single Family\",\"mv\":4288500,\"yr\":1971,\"hoa\":null,\"numbered\":false},\"saratoga-oaks\":{\"name\":\"Saratoga Oaks\",\"n\":56,\"type\":\"Condominium\",\"mv\":2023000,\"yr\":1975,\"hoa\":\"Saratoga Oaks Homeowners Assoc\",\"numbered\":false},\"parker-ranch\":{\"name\":\"Parker Ranch\",\"n\":55,\"type\":\"Single Family\",\"mv\":5398000,\"yr\":1988,\"hoa\":\"The Parker Ranch\",\"numbered\":false},\"la-saratoga-park\":{\"name\":\"La Saratoga Park\",\"n\":52,\"type\":\"Single Family\",\"mv\":3602500,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"peremont-tr\":{\"name\":\"Peremont Tr\",\"n\":48,\"type\":\"Single Family\",\"mv\":2755000,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"saratoga-woods\":{\"name\":\"Saratoga Woods\",\"n\":48,\"type\":\"Single Family\",\"mv\":3475500,\"yr\":1959,\"hoa\":\"Eagle Ridge Hoa\",\"numbered\":false},\"georgetown-west\":{\"name\":\"Georgetown West\",\"n\":47,\"type\":\"Single Family\",\"mv\":4079000,\"yr\":1967,\"hoa\":null,\"numbered\":false},\"uplands\":{\"name\":\"Uplands\",\"n\":46,\"type\":\"Single Family\",\"mv\":4476000,\"yr\":1964,\"hoa\":null,\"numbered\":false},\"westbrook-add\":{\"name\":\"Westbrook Add\",\"n\":44,\"type\":\"Single Family\",\"mv\":3444500,\"yr\":1955,\"hoa\":null,\"numbered\":false},\"eichler-homes-of-saratoga\":{\"name\":\"Eichler Homes Of Saratoga\",\"n\":41,\"type\":\"Single Family\",\"mv\":4007000,\"yr\":1969,\"hoa\":null,\"numbered\":false},\"blue-hills-of-saratoga\":{\"name\":\"Blue Hills Of Saratoga\",\"n\":40,\"type\":\"Single Family\",\"mv\":4038500,\"yr\":1965,\"hoa\":null,\"numbered\":false},\"blue-ridge\":{\"name\":\"Blue Ridge\",\"n\":39,\"type\":\"Single Family\",\"mv\":4484000,\"yr\":1963,\"hoa\":null,\"numbered\":false},\"saratoga-orchards\":{\"name\":\"Saratoga Orchards\",\"n\":37,\"type\":\"Single Family\",\"mv\":3737000,\"yr\":1954,\"hoa\":\"Pas\",\"numbered\":false},\"mellowood\":{\"name\":\"Mellowood\",\"n\":35,\"type\":\"Single Family\",\"mv\":3243000,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"saratoga-estates\":{\"name\":\"Saratoga Estates\",\"n\":34,\"type\":\"Single Family\",\"mv\":3864500,\"yr\":1970,\"hoa\":null,\"numbered\":false},\"merrick-villa\":{\"name\":\"Merrick Villa\",\"n\":33,\"type\":\"Single Family\",\"mv\":3966000,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"pheasant-ridge\":{\"name\":\"Pheasant Ridge\",\"n\":33,\"type\":\"Single Family\",\"mv\":4340000,\"yr\":1970,\"hoa\":null,\"numbered\":false},\"saratoga-village\":{\"name\":\"Saratoga Village\",\"n\":33,\"type\":\"Single Family\",\"mv\":4223000,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"prides-crossing-add\":{\"name\":\"Prides Crossing Add\",\"n\":32,\"type\":\"Single Family\",\"mv\":4039500,\"yr\":1964,\"hoa\":null,\"numbered\":false},\"prides-crossing-estates\":{\"name\":\"Prides Crossing Estates\",\"n\":32,\"type\":\"Single Family\",\"mv\":3904500,\"yr\":1967,\"hoa\":null,\"numbered\":false},\"sara-hills\":{\"name\":\"Sara Hills\",\"n\":32,\"type\":\"Single Family\",\"mv\":5026000,\"yr\":1966,\"hoa\":null,\"numbered\":false},\"kirkmont-of-saratoga\":{\"name\":\"Kirkmont Of Saratoga\",\"n\":30,\"type\":\"Single Family\",\"mv\":3961000,\"yr\":1964,\"hoa\":\"Espana Oaks Town Houses\",\"numbered\":false},\"villa-saratoga\":{\"name\":\"Villa Saratoga\",\"n\":28,\"type\":\"Single Family\",\"mv\":2697500,\"yr\":1955,\"hoa\":null,\"numbered\":false},\"westview\":{\"name\":\"Westview\",\"n\":28,\"type\":\"Single Family\",\"mv\":3459500,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"subdivision-4892\":{\"name\":\"Subdivision 4892\",\"n\":26,\"type\":\"Condominium\",\"mv\":1144500,\"yr\":1971,\"hoa\":\"The Vineyards Of Saratoga\",\"numbered\":false},\"azule-homesites-02\":{\"name\":\"Azule Homesites 02\",\"n\":25,\"type\":\"Single Family\",\"mv\":3874000,\"yr\":1951,\"hoa\":null,\"numbered\":false},\"montecito-heights\":{\"name\":\"Montecito Heights\",\"n\":24,\"type\":\"Single Family\",\"mv\":4582000,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"blossom-view-of-saratoga\":{\"name\":\"Blossom View Of Saratoga\",\"n\":23,\"type\":\"Single Family\",\"mv\":3808000,\"yr\":1964,\"hoa\":null,\"numbered\":false},\"hills-of-saratoga\":{\"name\":\"Hills Of Saratoga\",\"n\":23,\"type\":\"Single Family\",\"mv\":5615000,\"yr\":1961,\"hoa\":null,\"numbered\":false},\"quito-road-rancho\":{\"name\":\"Quito Road Rancho\",\"n\":23,\"type\":\"Single Family\",\"mv\":2785000,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"riverdale\":{\"name\":\"Riverdale\",\"n\":23,\"type\":\"Single Family\",\"mv\":3246000,\"yr\":1963,\"hoa\":null,\"numbered\":false},\"summerplace\":{\"name\":\"Summerplace\",\"n\":23,\"type\":\"Single Family\",\"mv\":3385000,\"yr\":1973,\"hoa\":null,\"numbered\":false},\"vineyards-of-saratoga-ph-02\":{\"name\":\"Vineyards Of Saratoga Ph 02\",\"n\":22,\"type\":\"Condominium\",\"mv\":1414000,\"yr\":1973,\"hoa\":\"The Vineyards Of Saratoga\",\"numbered\":false},\"azule-homesites\":{\"name\":\"Azule Homesites\",\"n\":21,\"type\":\"Single Family\",\"mv\":3736000,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"merrivale\":{\"name\":\"Merrivale\",\"n\":21,\"type\":\"Single Family\",\"mv\":4101000,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"merrivale-add\":{\"name\":\"Merrivale Add\",\"n\":21,\"type\":\"Single Family\",\"mv\":3845000,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"argonaut-glen\":{\"name\":\"Argonaut Glen\",\"n\":20,\"type\":\"Single Family\",\"mv\":4257000,\"yr\":1964,\"hoa\":null,\"numbered\":false},\"cunningham-acres\":{\"name\":\"Cunningham Acres\",\"n\":20,\"type\":\"Single Family\",\"mv\":4026000,\"yr\":1950,\"hoa\":null,\"numbered\":false},\"las-haciendas-de-la-rinconada\":{\"name\":\"Las Haciendas De La Rinconada\",\"n\":20,\"type\":\"Single Family\",\"mv\":5292500,\"yr\":1950,\"hoa\":null,\"numbered\":false},\"saratoga-park\":{\"name\":\"Saratoga Park\",\"n\":20,\"type\":\"Single Family\",\"mv\":3816500,\"yr\":1972,\"hoa\":\"Saratoga Park Hoa\",\"numbered\":false},\"country-squire-estates\":{\"name\":\"Country Squire Estates\",\"n\":19,\"type\":\"Single Family\",\"mv\":3977000,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"happy-valley\":{\"name\":\"Happy Valley\",\"n\":19,\"type\":\"Single Family\",\"mv\":3845000,\"yr\":1958,\"hoa\":null,\"numbered\":false},\"oakknoll-saratoga\":{\"name\":\"Oakknoll Saratoga\",\"n\":19,\"type\":\"Single Family\",\"mv\":4774000,\"yr\":1969,\"hoa\":null,\"numbered\":false},\"donny-brook-manor\":{\"name\":\"Donny Brook Manor\",\"n\":18,\"type\":\"Single Family\",\"mv\":3600000,\"yr\":1968,\"hoa\":null,\"numbered\":false},\"montewood\":{\"name\":\"Montewood\",\"n\":18,\"type\":\"Single Family\",\"mv\":4914500,\"yr\":1968,\"hoa\":null,\"numbered\":false},\"quito-rancho\":{\"name\":\"Quito Rancho\",\"n\":18,\"type\":\"Single Family\",\"mv\":4577500,\"yr\":1975,\"hoa\":null,\"numbered\":false},\"saratoga-acres\":{\"name\":\"Saratoga Acres\",\"n\":18,\"type\":\"Single Family\",\"mv\":5424500,\"yr\":1954,\"hoa\":null,\"numbered\":false},\"saratoga-villa\":{\"name\":\"Saratoga Villa\",\"n\":18,\"type\":\"Single Family\",\"mv\":4800000,\"yr\":1984,\"hoa\":null,\"numbered\":false},\"shadow-oaks\":{\"name\":\"Shadow Oaks\",\"n\":18,\"type\":\"Single Family\",\"mv\":5150000,\"yr\":1956,\"hoa\":null,\"numbered\":false},\"tract-no-8700\":{\"name\":\"Tract No 8700\",\"n\":18,\"type\":\"Single Family\",\"mv\":4642000,\"yr\":1996,\"hoa\":\"Rancho Verde Garden\",\"numbered\":false},\"arroyo-de-arguello\":{\"name\":\"Arroyo De Arguello\",\"n\":17,\"type\":\"Single Family\",\"mv\":4977000,\"yr\":1971,\"hoa\":null,\"numbered\":false},\"glen-una-park\":{\"name\":\"Glen Una Park\",\"n\":17,\"type\":\"Single Family\",\"mv\":5970000,\"yr\":1951,\"hoa\":null,\"numbered\":false},\"williams\":{\"name\":\"Williams\",\"n\":17,\"type\":\"Single Family\",\"mv\":4094000,\"yr\":1956,\"hoa\":null,\"numbered\":false},\"beaumont-heights\":{\"name\":\"Beaumont Heights\",\"n\":16,\"type\":\"Single Family\",\"mv\":4378000,\"yr\":1955,\"hoa\":null,\"numbered\":false},\"deerpark\":{\"name\":\"Deerpark\",\"n\":16,\"type\":\"Single Family\",\"mv\":4225000,\"yr\":1962,\"hoa\":null,\"numbered\":false},\"saratoga-vista\":{\"name\":\"Saratoga Vista\",\"n\":16,\"type\":\"Single Family\",\"mv\":4460500,\"yr\":1979,\"hoa\":null,\"numbered\":false},\"rio-villa-terrace\":{\"name\":\"Rio Villa Terrace\",\"n\":15,\"type\":\"Single Family\",\"mv\":3098000,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"farr-ranch\":{\"name\":\"Farr Ranch\",\"n\":14,\"type\":\"Single Family\",\"mv\":4322000,\"yr\":1966,\"hoa\":null,\"numbered\":false},\"mount-eden-estates\":{\"name\":\"Mount Eden Estates\",\"n\":14,\"type\":\"Single Family\",\"mv\":6234000,\"yr\":1995,\"hoa\":null,\"numbered\":false},\"saratoga-manor\":{\"name\":\"Saratoga Manor\",\"n\":14,\"type\":\"Single Family\",\"mv\":4614500,\"yr\":1968,\"hoa\":null,\"numbered\":false},\"tract-no-2543\":{\"name\":\"Tract No 2543\",\"n\":14,\"type\":\"Single Family\",\"mv\":4486000,\"yr\":1960,\"hoa\":null,\"numbered\":false},\"la-paloma-terrace\":{\"name\":\"La Paloma Terrace\",\"n\":13,\"type\":\"Single Family\",\"mv\":4164000,\"yr\":1959,\"hoa\":null,\"numbered\":false},\"saratoga-creekside\":{\"name\":\"Saratoga Creekside\",\"n\":13,\"type\":\"Condominium\",\"mv\":1162000,\"yr\":1969,\"hoa\":\"Saratoga Creekside\",\"numbered\":false},\"tract-no-3145\":{\"name\":\"Tract No 3145\",\"n\":13,\"type\":\"Single Family\",\"mv\":4205000,\"yr\":1965,\"hoa\":null,\"numbered\":false},\"lands-of-george-day\":{\"name\":\"Lands Of George Day\",\"n\":12,\"type\":\"Single Family\",\"mv\":5489000,\"yr\":1974,\"hoa\":null,\"numbered\":false},\"eden-ranch\":{\"name\":\"Eden Ranch\",\"n\":11,\"type\":\"Single Family\",\"mv\":5608000,\"yr\":1989,\"hoa\":null,\"numbered\":false},\"georgetown\":{\"name\":\"Georgetown\",\"n\":11,\"type\":\"Single Family\",\"mv\":3885000,\"yr\":1965,\"hoa\":null,\"numbered\":false},\"rose\":{\"name\":\"Rose\",\"n\":11,\"type\":\"Single Family\",\"mv\":4114000,\"yr\":1956,\"hoa\":null,\"numbered\":false},\"saratoga-creek-townhomes\":{\"name\":\"Saratoga Creek Townhomes\",\"n\":11,\"type\":\"Condominium\",\"mv\":2235000,\"yr\":2012,\"hoa\":\"Creekside At Saratoga Homeowners Assn\",\"numbered\":false},\"sunset-acres\":{\"name\":\"Sunset Acres\",\"n\":11,\"type\":\"Single Family\",\"mv\":3935000,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"terra-ladera\":{\"name\":\"Terra Ladera\",\"n\":11,\"type\":\"Single Family\",\"mv\":5262000,\"yr\":1973,\"hoa\":null,\"numbered\":false},\"tract-no-5462\":{\"name\":\"Tract No 5462\",\"n\":11,\"type\":\"Single Family\",\"mv\":3044000,\"yr\":1975,\"hoa\":null,\"numbered\":false},\"tract-no-6508\":{\"name\":\"Tract No 6508\",\"n\":11,\"type\":\"Condominium\",\"mv\":2003000,\"yr\":1979,\"hoa\":\"Park Saratoga\",\"numbered\":false},\"apricot-hill\":{\"name\":\"Apricot Hill\",\"n\":10,\"type\":\"Single Family\",\"mv\":5533500,\"yr\":1976,\"hoa\":null,\"numbered\":false},\"fairview-estates\":{\"name\":\"Fairview Estates\",\"n\":10,\"type\":\"Single Family\",\"mv\":4436500,\"yr\":1954,\"hoa\":null,\"numbered\":false},\"montecito-pines\":{\"name\":\"Montecito Pines\",\"n\":10,\"type\":\"Single Family\",\"mv\":4741000,\"yr\":1956,\"hoa\":null,\"numbered\":false},\"saratoga-forest\":{\"name\":\"Saratoga Forest\",\"n\":10,\"type\":\"Single Family\",\"mv\":4491500,\"yr\":1966,\"hoa\":null,\"numbered\":false},\"squirrel-hollow\":{\"name\":\"Squirrel Hollow\",\"n\":10,\"type\":\"Single Family\",\"mv\":4388500,\"yr\":1963,\"hoa\":null,\"numbered\":false},\"tract-no-4344\":{\"name\":\"Tract No 4344\",\"n\":10,\"type\":\"Single Family\",\"mv\":3996000,\"yr\":1969,\"hoa\":null,\"numbered\":false}}";
const SR_STATS_JSON = "{\"generated\":\"2026-07-22\",\"city\":{\"properties\":5973,\"streets\":707,\"tracts\":649,\"named_tracts\":92,\"median_value\":4064000,\"median_year_built\":1966,\"sfh\":5407,\"condo\":451,\"multi\":8,\"sales_12mo\":115,\"median_price_12mo\":4100000,\"owner_occupied_pct\":81},\"sfh_median_by_beds\":{\"2\":2981000,\"3\":3570000,\"4\":4148000,\"5\":4546500},\"top_tracts\":[{\"slug\":\"san-tomas-orchards\",\"name\":\"San Tomas Orchards\",\"n\":207,\"type\":\"Single Family\",\"mv\":3169000,\"yr\":1951},{\"slug\":\"arroyo-de-saratoga\",\"name\":\"Arroyo De Saratoga\",\"n\":134,\"type\":\"Single Family\",\"mv\":4289000,\"yr\":1965},{\"slug\":\"sunland-park\",\"name\":\"Sunland Park\",\"n\":124,\"type\":\"Single Family\",\"mv\":2747500,\"yr\":1956},{\"slug\":\"argonaut-place\",\"name\":\"Argonaut Place\",\"n\":118,\"type\":\"Single Family\",\"mv\":4425000,\"yr\":1955},{\"slug\":\"el-quito-park\",\"name\":\"El Quito Park\",\"n\":114,\"type\":\"Single Family\",\"mv\":2942500,\"yr\":1950},{\"slug\":\"brookview\",\"name\":\"Brookview\",\"n\":112,\"type\":\"Single Family\",\"mv\":3498000,\"yr\":1956},{\"slug\":\"prides-crossing\",\"name\":\"Prides Crossing\",\"n\":107,\"type\":\"Single Family\",\"mv\":4173000,\"yr\":1962},{\"slug\":\"saratoga-gardens\",\"name\":\"Saratoga Gardens\",\"n\":103,\"type\":\"Single Family\",\"mv\":3489000,\"yr\":1954},{\"slug\":\"quito-rho\",\"name\":\"Quito Rho\",\"n\":103,\"type\":\"Single Family\",\"mv\":4566000,\"yr\":1964},{\"slug\":\"saratoga-glen\",\"name\":\"Saratoga Glen\",\"n\":97,\"type\":\"Single Family\",\"mv\":4418000,\"yr\":1959},{\"slug\":\"greenbrier\",\"name\":\"Greenbrier\",\"n\":88,\"type\":\"Single Family\",\"mv\":3816500,\"yr\":1970},{\"slug\":\"wildwood-heights\",\"name\":\"Wildwood Heights\",\"n\":80,\"type\":\"Single Family\",\"mv\":3375000,\"yr\":1959},{\"slug\":\"gatehouse\",\"name\":\"Gatehouse\",\"n\":59,\"type\":\"Condominium\",\"mv\":1100000,\"yr\":1970},{\"slug\":\"prides-crossing-south\",\"name\":\"Prides Crossing South\",\"n\":58,\"type\":\"Single Family\",\"mv\":4288500,\"yr\":1971},{\"slug\":\"saratoga-oaks\",\"name\":\"Saratoga Oaks\",\"n\":56,\"type\":\"Condominium\",\"mv\":2023000,\"yr\":1975},{\"slug\":\"parker-ranch\",\"name\":\"Parker Ranch\",\"n\":55,\"type\":\"Single Family\",\"mv\":5398000,\"yr\":1988},{\"slug\":\"la-saratoga-park\",\"name\":\"La Saratoga Park\",\"n\":52,\"type\":\"Single Family\",\"mv\":3602500,\"yr\":1962},{\"slug\":\"peremont-tr\",\"name\":\"Peremont Tr\",\"n\":48,\"type\":\"Single Family\",\"mv\":2755000,\"yr\":1958},{\"slug\":\"saratoga-woods\",\"name\":\"Saratoga Woods\",\"n\":48,\"type\":\"Single Family\",\"mv\":3475500,\"yr\":1959},{\"slug\":\"georgetown-west\",\"name\":\"Georgetown West\",\"n\":47,\"type\":\"Single Family\",\"mv\":4079000,\"yr\":1967},{\"slug\":\"uplands\",\"name\":\"Uplands\",\"n\":46,\"type\":\"Single Family\",\"mv\":4476000,\"yr\":1964},{\"slug\":\"westbrook-add\",\"name\":\"Westbrook Add\",\"n\":44,\"type\":\"Single Family\",\"mv\":3444500,\"yr\":1955},{\"slug\":\"eichler-homes-of-saratoga\",\"name\":\"Eichler Homes Of Saratoga\",\"n\":41,\"type\":\"Single Family\",\"mv\":4007000,\"yr\":1969},{\"slug\":\"blue-hills-of-saratoga\",\"name\":\"Blue Hills Of Saratoga\",\"n\":40,\"type\":\"Single Family\",\"mv\":4038500,\"yr\":1965}],\"sales_by_year\":{\"2014\":150,\"2015\":171,\"2016\":149,\"2017\":164,\"2018\":139,\"2019\":173,\"2020\":173,\"2021\":265,\"2022\":143,\"2023\":121,\"2024\":184,\"2025\":159,\"2026\":57}}";
const PG_INTEL_JSON = "{\"generated\":\"2026-07-24\",\"totals\":{\"sales_on_record\":488,\"median_ppsf\":457,\"median_price_12mo\":1050000,\"sales_12mo\":24,\"tracts_tracked\":3,\"homes_indexed\":730},\"quarters\":[{\"q\":\"2016 Q3\",\"ppsf\":366,\"n\":5,\"sf_ppsf\":348,\"sf_n\":4,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2016 Q4\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":2,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2017 Q1\",\"ppsf\":null,\"n\":0,\"sf_ppsf\":null,\"sf_n\":0,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2017 Q2\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2017 Q3\",\"ppsf\":null,\"n\":0,\"sf_ppsf\":null,\"sf_n\":0,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2017 Q4\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2018 Q1\",\"ppsf\":null,\"n\":2,\"sf_ppsf\":null,\"sf_n\":0,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2018 Q2\",\"ppsf\":null,\"n\":2,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2018 Q3\",\"ppsf\":null,\"n\":2,\"sf_ppsf\":null,\"sf_n\":2,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2018 Q4\",\"ppsf\":532,\"n\":5,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2019 Q1\",\"ppsf\":601,\"n\":5,\"sf_ppsf\":561,\"sf_n\":4,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2019 Q2\",\"ppsf\":485,\"n\":5,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2019 Q3\",\"ppsf\":449,\"n\":5,\"sf_ppsf\":449,\"sf_n\":5,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2019 Q4\",\"ppsf\":null,\"n\":2,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2020 Q1\",\"ppsf\":560,\"n\":8,\"sf_ppsf\":573,\"sf_n\":5,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2020 Q2\",\"ppsf\":null,\"n\":1,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2020 Q3\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2020 Q4\",\"ppsf\":506,\"n\":5,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2021 Q1\",\"ppsf\":null,\"n\":2,\"sf_ppsf\":null,\"sf_n\":2,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2021 Q2\",\"ppsf\":638,\"n\":10,\"sf_ppsf\":638,\"sf_n\":10,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2021 Q3\",\"ppsf\":535,\"n\":6,\"sf_ppsf\":535,\"sf_n\":6,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2021 Q4\",\"ppsf\":594,\"n\":7,\"sf_ppsf\":732,\"sf_n\":5,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2022 Q1\",\"ppsf\":563,\"n\":6,\"sf_ppsf\":583,\"sf_n\":4,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2022 Q2\",\"ppsf\":577,\"n\":4,\"sf_ppsf\":577,\"sf_n\":4,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2022 Q3\",\"ppsf\":670,\"n\":5,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2022 Q4\",\"ppsf\":550,\"n\":5,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2023 Q1\",\"ppsf\":null,\"n\":1,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2023 Q2\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2023 Q3\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2023 Q4\",\"ppsf\":null,\"n\":2,\"sf_ppsf\":null,\"sf_n\":1,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2024 Q1\",\"ppsf\":603,\"n\":8,\"sf_ppsf\":597,\"sf_n\":4,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2024 Q2\",\"ppsf\":null,\"n\":2,\"sf_ppsf\":null,\"sf_n\":2,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2024 Q3\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2024 Q4\",\"ppsf\":535,\"n\":4,\"sf_ppsf\":535,\"sf_n\":4,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2025 Q1\",\"ppsf\":617,\"n\":7,\"sf_ppsf\":668,\"sf_n\":6,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2025 Q2\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":2,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2025 Q3\",\"ppsf\":629,\"n\":6,\"sf_ppsf\":669,\"sf_n\":4,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2025 Q4\",\"ppsf\":655,\"n\":4,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2026 Q1\",\"ppsf\":null,\"n\":0,\"sf_ppsf\":null,\"sf_n\":0,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2026 Q2\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0},{\"q\":\"2026 Q3\",\"ppsf\":null,\"n\":3,\"sf_ppsf\":null,\"sf_n\":3,\"co_ppsf\":null,\"co_n\":0}],\"feed\":[{\"a\":\"1952 Alice Dr\",\"s\":\"1952-alice-dr\",\"p\":1538422,\"sf\":2948,\"ppsf\":522,\"d\":\"Jul 23, 2026\"},{\"a\":\"125 Adobe Rd\",\"s\":\"125-adobe-rd\",\"p\":1480000,\"sf\":4096,\"ppsf\":361,\"d\":\"Jul 23, 2026\"},{\"a\":\"442 Ronsheimer Rd\",\"s\":\"442-ronsheimer-rd\",\"p\":1351000,\"sf\":2660,\"ppsf\":508,\"d\":\"Jul 23, 2026\"},{\"a\":\"1190 Dutch Ln\",\"s\":\"1190-dutch-ln\",\"p\":265000,\"sf\":1316,\"ppsf\":201,\"d\":\"Jun 11, 2026\"},{\"a\":\"9483 Old Redwood Hwy\",\"s\":\"9483-old-redwood-hwy\",\"p\":800000,\"sf\":962,\"ppsf\":832,\"tract\":\"Map Subdivision #2 Rancho Cotati\",\"ts\":\"map-subdivision-2-rancho-cotati\",\"d\":\"May 18, 2026\"},{\"a\":\"9989 Oak St\",\"s\":\"9989-oak-st\",\"p\":393500,\"sf\":2134,\"ppsf\":184,\"tract\":\"Penngrove\",\"ts\":\"penngrove\",\"d\":\"Apr 29, 2026\"},{\"a\":\"9699 Kelly Ln\",\"s\":\"9699-kelly-ln\",\"p\":1556000,\"sf\":1505,\"ppsf\":1034,\"d\":\"Apr 22, 2026\"},{\"a\":\"236 Adobe Rd\",\"s\":\"236-adobe-rd\",\"p\":1507000,\"sf\":3512,\"ppsf\":429,\"tract\":\"Map Mns 98-0114\",\"ts\":\"map-mns-98-0114\",\"d\":\"Apr 6, 2026\"},{\"a\":\"590 Elysian Ave\",\"s\":\"590-elysian-ave\",\"p\":1265000,\"sf\":1571,\"ppsf\":805,\"tract\":\"Rancho Roblar De La Miseria\",\"ts\":\"rancho-roblar-de-la-miseria\",\"d\":\"Dec 23, 2025\"},{\"a\":\"1809 Alice Dr\",\"s\":\"1809-alice-dr\",\"p\":1450000,\"sf\":3382,\"ppsf\":429,\"tract\":\"Canon Manor\",\"ts\":\"canon-manor\",\"d\":\"Nov 25, 2025\"}],\"rank\":[{\"slug\":\"cotati-rancho\",\"name\":\"Cotati Rancho\",\"ppsf\":667,\"vol\":4,\"price\":1045000},{\"slug\":\"canon-manor\",\"name\":\"Canon Manor\",\"ppsf\":453,\"vol\":26,\"price\":1110000},{\"slug\":\"phillips-acres\",\"name\":\"Phillips Acres\",\"ppsf\":436,\"vol\":4,\"price\":1020000}],\"tracts\":{\"canon-manor\":{\"name\":\"Canon Manor\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":2},\"h3\":{\"ppsf\":636,\"price\":1450000,\"n\":6},\"h5\":{\"ppsf\":617,\"price\":1450000,\"n\":9},\"h10\":{\"ppsf\":453,\"price\":1110000,\"n\":26},\"all_n\":92,\"yr\":1988},\"cotati-rancho\":{\"name\":\"Cotati Rancho\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":3},\"h10\":{\"ppsf\":667,\"price\":1045000,\"n\":4},\"all_n\":13,\"yr\":1965},\"phillips-acres\":{\"name\":\"Phillips Acres\",\"h1\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h3\":{\"ppsf\":null,\"price\":null,\"n\":0},\"h5\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h10\":{\"ppsf\":436,\"price\":1020000,\"n\":4},\"all_n\":13,\"yr\":1979}},\"by_bed\":{\"2\":900000,\"3\":1155000,\"4\":1351000},\"spread\":{\"hi\":{\"slug\":\"cotati-rancho\",\"name\":\"Cotati Rancho\",\"ppsf\":667,\"vol\":4,\"price\":1045000},\"lo\":{\"slug\":\"phillips-acres\",\"name\":\"Phillips Acres\",\"ppsf\":436,\"vol\":4,\"price\":1020000},\"ratio\":1.5},\"most_active\":{\"slug\":\"canon-manor\",\"name\":\"Canon Manor\",\"ppsf\":453,\"vol\":26,\"price\":1110000},\"bands\":{\"axis\":\"lot\",\"default_window\":\"h5\",\"rows\":[{\"key\":\"intown\",\"label\":\"In town\",\"n\":239,\"sales\":100,\"med_lot_sqft\":23540,\"med_sqft\":1980,\"ppsf\":422,\"price\":888000,\"med_value\":1170000,\"h1\":{\"ppsf\":515,\"price\":1351000,\"n\":6},\"h3\":{\"ppsf\":545,\"price\":995000,\"n\":18},\"h5\":{\"ppsf\":533,\"price\":995000,\"n\":34},\"h10\":{\"ppsf\":508,\"price\":995000,\"n\":57}},{\"key\":\"small\",\"label\":\"Small acreage\",\"n\":397,\"sales\":156,\"med_lot_sqft\":77972,\"med_sqft\":1826,\"ppsf\":480,\"price\":899000,\"med_value\":1331000,\"h1\":{\"ppsf\":706,\"price\":1295717,\"n\":7},\"h3\":{\"ppsf\":617,\"price\":1265000,\"n\":23},\"h5\":{\"ppsf\":596,\"price\":1295000,\"n\":41},\"h10\":{\"ppsf\":586,\"price\":1110000,\"n\":81}},{\"key\":\"large\",\"label\":\"Large acreage\",\"n\":93,\"sales\":28,\"med_lot_sqft\":378971,\"med_sqft\":1936,\"ppsf\":551,\"price\":1100000,\"med_value\":1508000,\"h1\":{\"ppsf\":null,\"price\":null,\"n\":1},\"h3\":{\"ppsf\":715,\"price\":1550000,\"n\":6},\"h5\":{\"ppsf\":715,\"price\":1525000,\"n\":10},\"h10\":{\"ppsf\":671,\"price\":1315000,\"n\":18}}],\"series\":{\"grain\":\"year\",\"window\":3,\"note\":\"Trailing 3-year median. Cells below n=6 are nulled.\",\"pills\":[{\"k\":\"ppsf\",\"label\":\"All\"},{\"k\":\"it_ppsf\",\"label\":\"In town\"},{\"k\":\"ac_ppsf\",\"label\":\"Acreage 1ac+\"}],\"rows\":[{\"y\":\"2017\",\"ppsf\":360,\"n\":36,\"it_ppsf\":309,\"it_n\":15,\"ac_ppsf\":426,\"ac_n\":21},{\"y\":\"2018\",\"ppsf\":406,\"n\":37,\"it_ppsf\":297,\"it_n\":11,\"ac_ppsf\":439,\"ac_n\":26},{\"y\":\"2019\",\"ppsf\":460,\"n\":43,\"it_ppsf\":444,\"it_n\":13,\"ac_ppsf\":478,\"ac_n\":30},{\"y\":\"2020\",\"ppsf\":490,\"n\":54,\"it_ppsf\":433,\"it_n\":16,\"ac_ppsf\":530,\"ac_n\":38},{\"y\":\"2021\",\"ppsf\":520,\"n\":67,\"it_ppsf\":492,\"it_n\":27,\"ac_ppsf\":548,\"ac_n\":40},{\"y\":\"2022\",\"ppsf\":548,\"n\":70,\"it_ppsf\":495,\"it_n\":28,\"ac_ppsf\":588,\"ac_n\":42},{\"y\":\"2023\",\"ppsf\":577,\"n\":59,\"it_ppsf\":524,\"it_n\":28,\"ac_ppsf\":596,\"ac_n\":31},{\"y\":\"2024\",\"ppsf\":573,\"n\":51,\"it_ppsf\":533,\"it_n\":22,\"ac_ppsf\":593,\"ac_n\":29},{\"y\":\"2025\",\"ppsf\":599,\"n\":50,\"it_ppsf\":574,\"it_n\":17,\"ac_ppsf\":617,\"ac_n\":33},{\"y\":\"2026\",\"ppsf\":574,\"n\":49,\"it_ppsf\":539,\"it_n\":17,\"ac_ppsf\":627,\"ac_n\":32}]}}}";
const PG_TRACTS_JSON = "{\"canon-manor\":{\"name\":\"Canon Manor\",\"n\":114,\"type\":\"Single Family\",\"mv\":1391000,\"yr\":1988,\"hoa\":null,\"numbered\":false},\"cotati-rancho\":{\"name\":\"Cotati Rancho\",\"n\":23,\"type\":\"Single Family\",\"mv\":1276000,\"yr\":1957,\"hoa\":null,\"numbered\":false},\"phillips-acres\":{\"name\":\"Phillips Acres\",\"n\":15,\"type\":\"Single Family\",\"mv\":1299000,\"yr\":1978,\"hoa\":null,\"numbered\":false},\"cotati-rho\":{\"name\":\"Cotati Rho\",\"n\":14,\"type\":\"Other\",\"mv\":1168230,\"yr\":1949,\"hoa\":null,\"numbered\":false},\"subdivision-2-rancho-cotati\":{\"name\":\"Subdivision #2 Rancho Cotati\",\"n\":10,\"type\":\"Single Family\",\"mv\":1378000,\"yr\":1933,\"hoa\":null,\"numbered\":false}}";
const PG_STATS_JSON = "{\"generated\":\"2026-07-24\",\"city\":{\"properties\":730,\"streets\":68,\"tracts\":237,\"named_tracts\":5,\"median_value\":1310000,\"median_year_built\":1974,\"sfh\":475,\"condo\":0,\"multi\":78,\"sales_12mo\":24,\"median_price_12mo\":1050000,\"owner_occupied_pct\":57},\"sfh_median_by_beds\":{\"2\":1097000,\"3\":1299000,\"4\":1401000,\"5\":1524000},\"top_tracts\":[{\"slug\":\"canon-manor\",\"name\":\"Canon Manor\",\"n\":114,\"type\":\"Single Family\",\"mv\":1391000,\"yr\":1988},{\"slug\":\"cotati-rancho\",\"name\":\"Cotati Rancho\",\"n\":23,\"type\":\"Single Family\",\"mv\":1276000,\"yr\":1957},{\"slug\":\"phillips-acres\",\"name\":\"Phillips Acres\",\"n\":15,\"type\":\"Single Family\",\"mv\":1299000,\"yr\":1978},{\"slug\":\"cotati-rho\",\"name\":\"Cotati Rho\",\"n\":14,\"type\":\"Other\",\"mv\":1168230,\"yr\":1949},{\"slug\":\"subdivision-2-rancho-cotati\",\"name\":\"Subdivision #2 Rancho Cotati\",\"n\":10,\"type\":\"Single Family\",\"mv\":1378000,\"yr\":1933}],\"sales_by_year\":{\"2014\":21,\"2015\":16,\"2016\":16,\"2017\":10,\"2018\":15,\"2019\":20,\"2020\":20,\"2021\":27,\"2022\":25,\"2023\":10,\"2024\":25,\"2025\":25,\"2026\":13}}";
const DATASETS = {
  'campbell-market': { intel: INTEL_JSON, tracts: TRACTS_JSON, stats: STATS_JSON },
  'losgatos-market': { intel: LG_INTEL_JSON, tracts: LG_TRACTS_JSON, stats: LG_STATS_JSON },
  'saratoga-market': { intel: SR_INTEL_JSON, tracts: SR_TRACTS_JSON, stats: SR_STATS_JSON },
  'penngrove-market': { intel: PG_INTEL_JSON, tracts: PG_TRACTS_JSON, stats: PG_STATS_JSON },
};
function DS(m) { return DATASETS[(m || M).slug] || DATASETS['campbell-market']; }

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#12151d"/><ellipse cx="30" cy="6" rx="46" ry="30" fill="#1e2028"/><g stroke="#d99a4e" stroke-width="3" fill="none" stroke-linecap="round"><path d="M32 8v3"/><path d="M17.5 20 32 11l14.5 9z"/><rect x="19" y="20" width="26" height="15" rx="4"/><path d="M19 29.3h26"/><path d="M16 35h32"/><path d="M23 35 15.5 56M41 35l7.5 21M32 35v21" stroke-width="2.6"/><path d="M20 43h24M17.5 50.5h29" stroke-width="2.2"/><path d="M23 35l15.5 15.5M41 35 25.5 50.5" stroke-width="1.8"/></g></svg>`;
const FAVICON_32_B64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAF2klEQVR4nK2XXWwcVxXHf+fOzH7MznptZ9eJ82E7ThMcWmKVoCQQtaUg2iCKQFVRgSIFgYR4QDz0AYnyUoF4gScQiGeUVoAEgqpqpUigVpEJKG2jljTg0HxUMXGT+Gu9a+/uzNy5l4ddu7Fj764Lf2m1mvt1/vecc//3XGEDDI2M2Y3a10Na/10NbuH6u5Ny5/eaj24Nr8C0RitpP64dkdWpWzUuAmlXARBqg93S7PdJqK0aF4GUq7gxH/Glo308eayPG/MRKVdt2RNDI2PW3YphJUKkDdW65viBgIfvzdPrO7x+rcbZfy+RTSmyKYWxtmuPSDe7FyBKLI3IsL3g8c2Hixwa8jk1McdMJebbny7xXjnm1MQck9MNsp7Cc6Sr5OxIQIDEWkp5jxPjBR4/0suOXo+/v7PM/JJGBAq+w/EDAUuh4dSZOV48X2ZhOUG6CEnnEAhYA0FW8fnDBUZKaSr1hIcOBrhO04JOoNpI6Mk6fOV4P29drzFTqZHypG0oRKQzAQEasaHXd6nWDU/94irZlCIxa1d2HUV5OebrD5X42N4cZyarZFIeySYMRIQ4jrvwAGAt5DOKWmSYuLREPqNYZx9HCTPVmM98pECQUZvuXESw1tJoNIi6JQBN0REg7QopVzYkkHYFR93dt2IYQGtNI4owSfJ+CFZYbQYlQhhbRgfS/PSpPXjO3fIrIjQiw/0jPi+/uYhqicLK2lprojhGaw0iq4TcWr2O67q4rou6o+NOQtpYPFe4Phfx7O+nyWWk5ZHWWCyOEuaXNM98YRA/pUgSi7WGMNJorUmMAWtX11+Ba4whDEOiKEIpheM4zZ9STfZALq2ItSHIKJ442oefViBgTFNwHEcQC4v1hPFhn5fOz2FNyNKyNA1Li+oG51L6S3tWt3rnrkUEx1HUI8ORfT388Mkh8lmXkVKKm+UIayCbViglLNcTlIJij8dMRTNbjfn+89c4d6VCkHExGyXFRgQ2grGWjOegE8N3PruL8eGAN65V+eVLN3jk/n7Gdvr87MUpnv7iEDqxfHi3z9O/voKxljC2HcVIte9uJqBODLOVmHu2Z3nuzC3+8o8FvvXoTkJtQOAbj+zklYtlnjtzi4GCR6QN9cigOq7eBQEAY6BY8CgVPK7Phvzt7TIT/1rkiaMlPvGhHs5OLvLKhQUWljVhbNk/6BNru67a+IAERCDShp19abIph8RaDo7m+ed/auR9h2o94dJ0jUPDAUHWoREb9g9mCbVZPSXt0FmKRYgSy0gpQ0/W4eSD28lnHfbtyFILDX05xR+/dx9Xb9WpLGkGCh57BzLNuZ0d0N1dEGnDR0cD/nRulmefv8qPT+7jV6en6c973DeU49W3yzx+rMgPTl3lsSNFTn5yB45qL24r6BgCay0pVzFSynBhaplnvryXc5ervDa5SH/epdd3eWNykXPvVPnR10a59F6dbFoxUEihk//xFIg0VbCY9xjsS/HAWIHTb87zwl9vgwiLtYSlMAHghbO3efn8PI8d3oa1lgODWRrx3cq3Hu1DIBBrS6nocXCXz2uXq/QFLl/91CDlmubIPXl296c5caxIf85jphJR8B0eGOvld2dn0MYgOB+cgCCE2nDvnhyXb9a5XYl58GAvibGEsWH3tjTFwGN8KCCTUozt8pmtRJx+a57x4YDfTNxua7wLAqATy/hIjj9fKPPzP7yLG6SwQLKkOfHxIoeGA37y22u4gddsr2kuHq7x3c/tJuWqjonYNgdWEnD/Dp8rN+tketJsy3sU8x7pHo+C75JLO7hBs21b4NLXn+bGQkSv7zBQ8Ih1+0TclIBIc/fFHg+l4OLUMq7TlOXE2JbWG2phgrGWxNjVrJ9eCLlZjhkdyBDq9okoAJtdSJZmpeOnFNX62irXWvBaFVAjMmv6jLXk0g6JgTA2bT3QMQcSY1msaZx1zx5pnZAIe9eLyBFhuZGASMfX0mp3u2tZ2NoLuNs58zNTa53TqTb4f2J+ZkoA/guK4o1cQghThwAAAABJRU5ErkJggg==';
const LG_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#12151d"/><ellipse cx="30" cy="6" rx="46" ry="30" fill="#1e2028"/><text x="32" y="44" text-anchor="middle" font-family="Lora, Georgia, 'Times New Roman', serif" font-size="34" fill="#d99a4e">LG</text></svg>`;
const LG_FAVICON_32_B64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFL0lEQVR4nL2XS4hcRRSGv1N1753O9DjJjJNJMtOZJCSaGDGKuJDsFUUjcSEu3CkoIorPveBSQfAFuvOxEHURHEUEQVDRhfhABU0Io85LTXomxpnpvo+qOi5ud2deHYx5/ItubnGr/v/8dercOkIJC/jR0T21KIkeVjiEsgeIAOH8oIBDOC4w7nL34szM8ek2p8BdFt71tR1XHrbGviwiI6qKqp4n70qICCKCqs764B+a/v3YEbjLCsD2XXsPGbHvo4pqcCCW8498NRTUi5gIEYL6O6Z+PTouY2P7tmH4QUSGVNVTWnMx4UXEqmqdwAGjwuNizKUiB7Cq6o21Qyrh8Qj0sIDqhbe8K0RE8izXNM8Oy+XDYz5JEhNHUTtJLiYxPgTyLKNwDiBEqmrSNKWwliSOiVpCQDlXLdL5oUy5FilACIEszymKAlVtj5uoo8x7mt5jrSWKIiJrsdYgCEFbK3aNDIwImQsUrnwvjgyJhawocM7hve8Qt0VBWWg69nSUZhm5CD4IxhqqlRiQFZPb22WNkBWBxdQxNpQwMpDgvGdmLmXizyU2VS1GBKesIF4joB2JD9DbY3nw5hF2b6nQEwkffjvPO1/VqcQGRFpWC0agkQWGN8Y8fU+Nzf0xP04ukuaBHTcOsJR6tg4kvPXZCT758RT9vREhrHTSLH9QBSOQ5YFXPp5lf61KQHj7y5NUYkNQJYSA854QPAvNgrGhmCNPXYUReOC1Yzzz3iTPjU/zxBsT/HYy4+ZrB8l9YJ3g1zrQEQIsNB2NPDAzn9HMA9Ue20kDI4IqxFZ46b4r+P1kxv2vHqNvg2WgGqGAqvLC+BTX7qyyqTfCh/UFmPWHwZrS4sSW/ysmGWGh6bnlukGu29nHs+9PkURCJTa4oPhQJltSsXz60980srBmjbM6sNqNbrjpwABT9ZRfZhpUEov3Z972QemrWD76fh6AasWu2X84iwNngw/KhsSwc7jCX6cLmnkZ4erlBcgKJSsC9v86sB5EwFohtkLhdUWCiUDhlC0bE+6/aRsjAwl9Fctbn5/gw2/n6E0My404ZwdEwHllKfWcWnRs2RhzWcteoTxJkRVOLRU8/8E0V2+vspB6Pvhmjt7EsnoXzkmAiJAVyv5alZ3DFb44eppdwxWu2VGlkQfsMp+DwmLqSfPAT5NLpPn6R7GrANVyr5cLNgKLDce+0Q3sH+3l7S9OML/oeOTWGpEVllJfnp5WyjfzQOGV2ErXOrBGgAAhKJXEMFiNsJ3SWwqqbe7h7oPDGBGmT6Q89eYEN+zu4/WH9rF1U8I/TcdC0+GDcnBvP7u3VDDd2AEZ3Ly9E6S0rIsj4bHbahzc28/MfM5kPSW2gg8wMpiwZ+sGnnxjgu9+WyAEuH5XH4/eXmO4P+bobIPTDU9PbChc4OfpBl9PLPDrXylxJGu+sCsEdAYFKrGhmQciK/REBkURhNwFcncm840prfdB2X55D9sGEnyAP//OmZnPWkfW0hOvJe8qgNY2GFNOCstmiqxTGVtqchfIfXkaYiskkUGknN/tbtG1DrQTSYROHnRDW2AcCUkktK8PQfXspbQlIPA/K+Jq/Ae+1QhGlQkQbQm5VAggqsqEETgi7UvgpYNKSXpEhobGtgX0B4wMcYkaE0QsQesGOWDq9ck/RLlXABGxgOPiuKGAExErgCj31uuTfxjAzs1NjTsf7lSYbfVuF75JEREREynMOh/unJubGoczX2kL+MHB0RqReViVQ8KFbc8Vjoswjgsvzs/PdNrzfwGoG232ZbspNAAAAABJRU5ErkJggg==';
const CB_TOUCH_B64 = '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';
const LG_TOUCH_B64 = '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';
const SR_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#12151d"/><ellipse cx="30" cy="6" rx="46" ry="30" fill="#1e2028"/><text x="32" y="45" text-anchor="middle" font-family="Lora, Georgia, 'Times New Roman', serif" font-size="38" fill="#d99a4e">S</text></svg>`;
const SR_FAVICON_32_B64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAADBklEQVRYhe2WzWsUZxjAf+87M5vdnajrNkZjSBQ1agKKH6jQVlSKIORSqoIFQSjUQ/8Ab4UcvXjzpDc99CLa4lFvHjRgtdBCpFbXj2TTdnfjbvZ75v3w0MQm2CY7QbOXPDCX932f9/d7Z56ZeUT/5p2WNoZsJ3xFYEVgRQDAjZwhHTZtTrKnO0anMBQKdR5nAvztKbZNFbkzaYjyYYkkIHyfb09v4KsuzaOxKk9rkr2HNvLdsGEy8CiPlrn78QQkh46u52SP5ub1V1wZnwGJKQY/28jFwx7lKKd5t2vLK+Mc2OJgKzUeZOec0mrG7ue4lV8CPZLAbEIyzq4uMX9QNxl9HqKXIOCsSXWNtLTSamT3Go72xNg9kMAt1nlSMKiZ6XymyN1s68/fWksQhjh+Z2pECgFCLJZCdiJg9ZZOBtMxdg+mOLHVQ1ZDMm80YYtgrEVpTaPZRGuN43X4I0r9cw4pJWIBERuGPPy1yivpsXW9R/faOPuHUgwPxAhzDZ5O//8dsNailKLZbBIq9W5cpNf1zctxXQfHcXEdZ0EZJ9HBkYOf8PV+n01xATrgzk/jXHqiMHOhWqO1Qqn/rpD3BOaGlPLfS0iEFMgZqVk5mejgy+Fezg+4iEqRC5cnGG0YjNEYs3hFLPgWGGNQShEEAY1QcvbcBr5w61RrNSrVKpVqlen8FNd+yPBj0SKTMXb4IUqpluCLCswPQSy+imPb3feTwoCXRcAaKs3Wd4woYNFWcvB4P2d6HeZWR7wnzfFeqLx4w71StBYz0r/AWEt2Osa580Oc+KPE45yCTp9Ph3yS2Rzf3ygwGbHFXbAI56902XcgzepMjgdhgj39CfpTHnEV8nK8zOjrgMYS+uvWBT5StL0hkUCpjfxpKeCXdtEF9pm02OvtErBC3haAm17X9wjYtcz8UujpbRJQ0ppTQGEZ4VYI+005m81LgHx+4ndhnM+BsWWAl4Swpwp/j98EcGZH6/Vivl7ru5r0m3+BTYFYBcQ/ELRi4TchxNXQ02eLf078PDvxFpL4OpPp8/idAAAAAElFTkSuQmCC';
const SR_TOUCH_B64 = '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';
const PG_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#12151d"/><ellipse cx="30" cy="6" rx="46" ry="30" fill="#1e2028"/><g stroke="#d99a4e" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 28V17h5v-4h5v-4h20v4h5v4h5v11" stroke-width="3.2"/><path d="M18 22h28" stroke-width="2.6"/><path d="M7 28h50" stroke-width="3.4"/><path d="M14 28v21M50 28v21" stroke-width="3"/><path d="M27 49V37h10v12" stroke-width="2.8"/><path d="M5 49h54" stroke-width="3.4"/></g><g fill="#d99a4e"><circle cx="22" cy="32.5" r="1.6"/><circle cx="32" cy="32.5" r="1.6"/><circle cx="42" cy="32.5" r="1.6"/></g></svg>`;
const PG_FAVICON_32_B64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAADdElEQVRYhc2VS2wbVRSGv3tn/EimSZ2HUZPGTaMGmkVAqBKPAAKVDVtaFSUSLFBViXVhgSpUKjZ0hWBfhBAvFSohEHtAkQoVEqGLAE4BpW6chDouTf2asWfmXhaprSS1J7aaxv13c++55//PPWf+K/btH9O0EbKd5PeFALPZwAe6TcYGO5qKTS7ZZHLe9go49eIA40PNCZhN25z8ZOHuBUghODTSSWdY0meZLN90+fCHbGDCE4f76bNMnh3rolRRzMyXULrxnAcKeHS4g7NTe2vfs2mb6WQ+UMCRx2OMD3Vw+ugAAG9+kWbmaqk1AdV+PzQQBeDLn29yZdkhuWQHkgOc/Wa5dnZyoodDIxa7okbDuagrYHO/Z+aLgVWsRybnkcnlKTg+kxM9TE70AI3noq6AiCFq/S5VFJdTW1e+GZdTNqfOL9IZlpw43E/EEHXjGs5AwfGZTuZ5+uAu3jqyp2UBAN//nmc6mWfq9i3Uw/1vRBfnClycK9wzAaL6GCX6wrx9dJCIKejvMpESio6iWFZ3RWBFJFZUohRk8x7FsuLdb5e5li1TcV2k53mwySgcV4OGaKj+4LSCaEiAvp0TAI3ve5RsG9d1Eb3xhJZCEAqFME0TIdZI33t5CIA3Pk8D8MSohQZ++btYS97MWjXP658t4HkerutucEYTQGlNuVKhXKlgmgaGYaKB9fW/8MhuQG8g22pNa71GpjXFUn0fuWMIPc/H83yU74MQOOUyUkrOXFhASIFAsK8/QjQsOX/pP7TWjO6J4FQUVzMOp79KoZTC932U0mgVPEPBf4HWeN5G+xyOR/jotf11w6c++IPUSiUwZWsC6iAaNgB450KK+RUHgJF4lDMvDdf27qmAKuZXHOYWm3sfgtB2J2y7ABPAkIKnDnYTWvdixay17jw/HttwYLA3AsBjB7rY2xNuuBaUx/U1P83l8JVeM6InH+zm/VcPbGtlW+Hkx/9w6a8cojeeWDWk2L35BqzI2kQXy/4dh2OWyWrR23KtUZ51N5ATffHEjxqe25ayWoRA/yY1+tN2kANoIb8TgNkbT8wAD+8w/y035I9KwJNaHQNu7CC5FkIfzy8tZSVANrt4RSjjGeDPHSC/JYQ+diOT/hqgZt62vZq1S4lznVb5OugYiC4guk2kBQ2zQohzbsh/ZfXfxV+rG/8DYoB8mzdmeKsAAAAASUVORK5CYII=';
const PG_TOUCH_B64 = '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';
const FAVICONS = {
  'campbell-market':  { svg: FAVICON_SVG,    png32: FAVICON_32_B64,    touch: CB_TOUCH_B64 },
  'losgatos-market':  { svg: LG_FAVICON_SVG, png32: LG_FAVICON_32_B64, touch: LG_TOUCH_B64 },
  'saratoga-market':  { svg: SR_FAVICON_SVG, png32: SR_FAVICON_32_B64, touch: SR_TOUCH_B64 },
  'penngrove-market': { svg: PG_FAVICON_SVG, png32: PG_FAVICON_32_B64, touch: PG_TOUCH_B64 },
};
function FV(m) { return FAVICONS[(m || M).slug] || FAVICONS['campbell-market']; }
function creditLabel() { return Number(M.creditUsd).toLocaleString('en-US'); }
// Prose form of the credit for headline copy ("minus five thousand").
// Price-band helpers. Slider bounds come from each market's own sale
// distribution (SFH P05/P95, median default) rather than a global default.
function pb() { return M.priceBand || { min: 600000, max: 3250000, default: 1725000, step: 25000 }; }
function pbTrad() { return Math.round(pb().default * 0.05); }
function pbNet()  { return Math.max(0, Math.round(pb().default * 0.03) - Number(M.creditUsd)); }
function usdShort(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
// Scales a large dollar total to B or M for the animated counters. Returns the
// pieces the counter script needs (data-count / data-suffix / data-dec) plus
// the pre-JS text, so SSR and the animated value always agree.
function bigValue(n) {
  n = Number(n) || 0;
  if (n >= 1e9) { const v = (n / 1e9).toFixed(1); return { v, suffix: 'B', dec: 1, text: '$' + v + 'B' }; }
  const v = String(Math.round(n / 1e6));
  return { v, suffix: 'M', dec: 0, text: '$' + v + 'M' };
}
function creditWords() {
  const w = { 5000:'five thousand', 10000:'ten thousand', 15000:'fifteen thousand',
              20000:'twenty thousand', 25000:'twenty-five thousand' };
  return w[M.creditUsd] || `$${creditLabel()}`;
}
// Third comparison in the "you don't know your price" tile. Condo markets
// contrast against condo stock; markets without condos contrast another tract.
// ── Lot-band comparison (country markets only) ────────────────────────────
// Renders only when the market's intel dataset carries a `bands` block, which
// the generator emits only for markets configured with segmentation.axis='lot'.
// Type-axis markets (Campbell, Los Gatos, Saratoga) have no `bands` key and
// this returns '' — their output is unchanged.
function bandsOf() { try { return JSON.parse(DS().intel).bands; } catch (e) { return null; } }
// The trajectory chart's pills and axis copy come from the dataset when a
// market ships a bands.series block; otherwise the type-axis path is unchanged.
function chartPills() {
  const B = bandsOf();
  if (B && B.series && B.series.pills && B.series.pills.length) {
    return B.series.pills.map((p, i) =>
      '<button class="pill-t' + (i === 0 ? ' on' : '') + '" data-k="' + p.k + '">' + p.label + '</button>'
    ).join('\n      ');
  }
  return '<button class="pill-t on" data-k="ppsf">All</button>\n      '
    + '<button class="pill-t" data-k="sf_ppsf">Single family</button>'
    + (mktDerived().hasCondos ? '\n      <button class="pill-t" data-k="co_ppsf">Condo &amp; townhome</button>' : '');
}
function chartSub() {
  const B = bandsOf();
  if (B && B.series && B.series.grain === 'year') {
    return `Median price per square foot across ${M.zipsLabel}, by year &mdash; each point is a trailing ${B.series.window}-year median, so thin years can&rsquo;t swing it. Hover the line for any year.`;
  }
  return `Median price per square foot across ${M.zipsLabel}, by quarter. Hover the line for any quarter.`;
}
function renderLotBands() {
  let B;
  try { B = JSON.parse(DS().intel).bands; } catch (e) { return ''; }
  if (!B || !B.rows || !B.rows.length) return '';
  const num = n => n == null ? '&mdash;' : Number(n).toLocaleString('en-US');
  const money = n => n == null ? '&mdash;' : (n >= 1e6
    ? '$' + (n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'') + 'M'
    : '$' + Math.round(n/1000) + 'K');
  const acres = sf => sf == null ? '&mdash;' : (sf/43560 >= 1
    ? (sf/43560).toFixed(sf/43560 >= 10 ? 0 : 1) + ' ac'
    : (sf/43560).toFixed(2) + ' ac');
  const w = B.default_window || 'h5';
  const rows = B.rows.map(r => {
    const win = r[w] || {};
    return '<tr>' +
      '<td class="lb-name">' + r.label + '</td>' +
      '<td>' + num(r.n) + '</td>' +
      '<td>' + acres(r.med_lot_sqft) + '</td>' +
      '<td>' + num(r.med_sqft) + ' sf</td>' +
      '<td class="lb-ppsf">' + (r.ppsf == null ? '&mdash;' : '$' + num(r.ppsf)) + '</td>' +
      '<td>' + money(r.price) + '</td>' +
      '<td class="lb-n">' + num(r.sales) + '</td>' +
    '</tr>';
  }).join('');
  return `
  <style>
.lb-wrap{overflow-x:auto;margin-top:14px}
table.lb{width:100%;border-collapse:collapse;font-size:.86rem}
table.lb th{text-align:right;font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim);font-weight:400;padding:0 0 10px;white-space:nowrap}
table.lb th:first-child{text-align:left}
table.lb td{text-align:right;padding:11px 0;border-top:1px solid var(--line);white-space:nowrap}
table.lb td:first-child{text-align:left}
table.lb td+td{padding-left:18px}
.lb-name{font-weight:600}
.lb-ppsf{color:var(--apricot);font-weight:600}
.lb-n{color:var(--slate-dim)}
.lb-foot{font-size:.72rem;color:var(--slate-dim);margin:12px 0 0}
@media(max-width:700px){table.lb{font-size:.78rem}table.lb td+td{padding-left:12px}}
  </style>
  <div class="mz-card" style="margin-top:16px">
    <div class="mz-eyebrow">Land tells the story</div>
    <div class="mz-sub">Every ${M.city} parcel grouped by lot size. House size barely moves across the three &mdash; price per square foot does.</div>
    <div class="lb-wrap">
      <table class="lb">
        <thead><tr>
          <th>Lot band</th><th>Parcels</th><th>Median lot</th><th>Median house</th>
          <th>Median $/sf</th><th>Median sale</th><th>Sales</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="lb-foot">Medians across all recorded sales. A dash means too few sales to report honestly.</p>
  </div>`;
}
function contrastPhrase() {
  const d = mktDerived();
  if (d.hasCondos) return `the ${d.condo} condos`;
  // No condo stock: contrast a *distinct* third tract. sf[] cycles modulo its
  // length, so with few tracts sf[1]/sf[3]/sf[5] can collide — pick the first
  // name that differs from the two already used, else drop the third clause.
  const names = d.sfAll || [];
  const used = [d.sf[1], d.sf[3]];
  const third = names.find(n => used.indexOf(n) === -1);
  return third || null;
}
const MKT_DERIVED_CACHE = {};
function mktDerived() {
  const key = M.slug;
  if (!MKT_DERIVED_CACHE[key]) {
    const tr = Object.values(JSON.parse(DS().tracts));
    const sfNames = tr.filter(t => t.type === 'Single Family').map(t => t.name);
    // Small markets may have fewer named tracts than the copy indexes into.
    // Cycle through what exists so every index resolves to a real tract name.
    const sf = sfNames.length
      ? new Proxy(sfNames, { get(a, p) {
          if (typeof p === 'string' && /^\d+$/.test(p)) return a[Number(p) % a.length];
          return a[p];
        } })
      : [];
    // Markets with no condo stock (rural/unincorporated) must not have
    // single-family tracts mislabelled as condos in comparison copy.
    const condoT = tr.find(t => t.type === 'Condominium');
    const S = JSON.parse(DS().stats);
    const I = JSON.parse(DS().intel);
    // Prefer the tract-rank spread; fall back to the observed quarterly
    // $/sf range when a market has too few ranked tracts to form a spread.
    let loPpsf = I.spread ? I.spread.lo.ppsf : null;
    let hiPpsf = I.spread ? I.spread.hi.ppsf : null;
    if (loPpsf == null || hiPpsf == null) {
      const qs = (I.quarters || []).map(q => q.ppsf).filter(v => v != null);
      if (qs.length) { loPpsf = Math.min.apply(null, qs); hiPpsf = Math.max.apply(null, qs); }
      else { loPpsf = I.totals.median_ppsf; hiPpsf = I.totals.median_ppsf; }
    }
    MKT_DERIVED_CACHE[key] = {
      sf,
      sfAll: sfNames,
      condo: ((condoT ? condoT.name : sfNames[0]) || '').replace(/\s+Condos?$/i, ''),
      hasCondos: !!condoT,
      homes: S.city.properties,
      streets: S.city.streets,
      named: S.city.named_tracts,
      loPpsf,
      hiPpsf,
      // Citywide figures for the how-it-works stat band and data tiles.
      // Previously hardcoded to Campbell's values on every market.
      sales: I.totals.sales_on_record,
      ppsf: I.totals.median_ppsf,
      sales12: I.totals.sales_12mo,
      // Total value indexed = parcel count x median assessed/estimated value.
      // Same derivation that produced Campbell's original $8.9B.
      totalValue: S.city.properties * S.city.median_value,
    };
  }
  return MKT_DERIVED_CACHE[key];
}

const DATA_CACHE = {};

async function loadData(env, origin, M) {
  if (DATA_CACHE[M.slug]) return DATA_CACHE[M.slug];
  const [props, streets] = await Promise.all([
    env.ASSETS.fetch(origin + '/assets/' + M.assetPrefix + 'props.json').then(r => r.json()),
    env.ASSETS.fetch(origin + '/assets/' + M.assetPrefix + 'streets.json').then(r => r.json()),
  ]);
  const tracts = JSON.parse(DS(M).tracts);
  const bySlug = new Map(), byTract = new Map(), byStreet = new Map();
  for (const p of props) {
    bySlug.set(p.s, p);
    if (p.ts) { if (!byTract.has(p.ts)) byTract.set(p.ts, []); byTract.get(p.ts).push(p); }
    if (p.st) { if (!byStreet.has(p.st)) byStreet.set(p.st, []); byStreet.get(p.st).push(p); }
  }
  DATA_CACHE[M.slug] = { props, tracts, streets, bySlug, byTract, byStreet };
  return DATA_CACHE[M.slug];
}

/* ---------- helpers ---------- */
const GMAPS_KEY = 'AIzaSyAh6mb44KilwxY-QTINnCYqxAx4VF-FWyo';  // Street View Static API key (HTTP-referrer restricted)

function photoUrl(p, size) {
  if (p.ph) return p.ph;                          // MLS/listing photo always wins
  if (!GMAPS_KEY) return null;
  return 'https://maps.googleapis.com/maps/api/streetview?size=' + (size || '800x480')
    + '&location=' + encodeURIComponent(p.a + `, ${M.city}, CA ${M.zipsLabel}`)
    + '&fov=72&pitch=0&source=outdoor&key=' + GMAPS_KEY;
}

const TYPE = { sf: 'Single family', co: 'Condo / townhome', mf: 'Multi-family', mh: 'Mobile home', vl: 'Vacant land', ot: 'Property' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  if (n == null) return '—';
  return '$' + (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'') + 'M' : Math.round(n / 1000) + 'K');
}
function moneyFull(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
function num(n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); }
function specLine(p) {
  const s = [];
  if (p.b) s.push(p.b + ' bd');
  if (p.ba) s.push(p.ba + ' ba');
  if (p.sf) s.push(num(p.sf) + ' sf');
  if (p.yb) s.push('built ' + p.yb);
  return s.join(' · ');
}
function median(arr) {
  const a = arr.filter(v => v != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/* ---------- shared shell ---------- */
function cbCss() { return `/* ============================================================
   ${M.name.toUpperCase()} — v2 skin
   Structure mirrors Eichler Market / SFCM: dark chrome (nav,
   ticker, footer) over light editorial content, ${M.city}'s
   orchard-apricot accent. Playfair Display + DM Sans + JetBrains Mono.
   ============================================================ */
:root{
  /* light content */
  --bg:#faf8f3;
  --bg-2:#f3eee4;
  --card:#ffffff;
  --card-2:#f5f0e6;
  --line:#e8e1d2;
  --ivory:#22262f;            /* primary ink (kept var name for compatibility) */
  --ivory-dim:#4c5261;
  --slate:#5d6575;
  --slate-dim:#989fac;
  --apricot:#b06f24;          /* accent on light */
  --apricot-soft:#d99a4e;     /* fills, bars, buttons */
  /* dark chrome */
  --chrome:#12151d;
  --chrome-2:#0c0f15;
  --chrome-line:#262c3a;
  --chrome-ink:#ece7db;
  --chrome-soft:#93a3b8;
  --nav-h:56px;
  --max:1180px;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{overflow-x:clip;background:var(--bg);color:var(--ivory);font-family:'DM Sans',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}

h1,h2,h3,.serif{font-family:'Playfair Display',Georgia,serif;font-weight:500;line-height:1.15}
h1 em,h2 em,.serif em{font-style:italic;color:var(--apricot)}
.eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.68rem;letter-spacing:.18em;text-transform:uppercase;color:var(--apricot);display:block;margin-bottom:14px}
.sub{color:var(--slate);max-width:56ch}

.wrap{max-width:var(--max);margin:0 auto;padding:0 24px}
section{padding:88px 0}
.section-head{margin-bottom:44px}
.section-head h2{font-size:clamp(1.7rem,3.4vw,2.5rem);max-width:24ch}

/* ---------- nav (dark chrome) ---------- */
.nav{position:fixed;top:0;left:0;right:0;height:var(--nav-h);z-index:900;display:flex;align-items:center;background:rgba(18,21,29,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--chrome-line);color:var(--chrome-ink)}
.nav-inner{max-width:var(--max);margin:0 auto;padding:0 24px;width:100%;display:flex;align-items:center;gap:28px}
.wordmark{font-family:'Playfair Display',serif;font-size:1.06rem;letter-spacing:.01em;white-space:nowrap;color:var(--chrome-ink)}
.wordmark b{font-weight:600}
.wordmark .tag{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.16em;color:var(--apricot-soft);vertical-align:super;margin-left:4px}
.nav-links{display:flex;gap:22px;margin-left:auto}
.nav-links a{font-size:.86rem;color:var(--chrome-soft);transition:color .15s}
.nav-links a:hover{color:var(--chrome-ink)}
.nav-right{display:flex;align-items:center;gap:14px}
.nav-cta{font-size:.82rem;font-weight:600;color:#171310;background:var(--apricot-soft);padding:8px 16px;border-radius:999px;white-space:nowrap;transition:background .15s}
.nav-cta:hover{background:#e8b878}
.burger{display:none;background:none;border:0;cursor:pointer;padding:8px;margin-left:auto;flex:0 0 auto}
.burger span{display:block;width:20px;height:2px;background:var(--chrome-ink);margin:4px 0}
.drawer{display:none;position:fixed;top:var(--nav-h);left:0;right:0;background:var(--chrome-2);border-bottom:1px solid var(--chrome-line);z-index:899;padding:18px 24px 26px;flex-direction:column;gap:4px}
.drawer.open{display:flex}
.drawer a{padding:11px 0;border-bottom:1px solid var(--chrome-line);font-size:.95rem;color:var(--chrome-soft)}
.drawer a:last-child{border-bottom:0}
.drawer .nav-cta{margin-top:14px;text-align:center;color:#171310}

/* ---------- live sold ticker (dark chrome) ---------- */
.ticker{position:fixed;top:var(--nav-h);left:0;right:0;height:34px;z-index:890;background:var(--chrome-2);border-bottom:1px solid var(--chrome-line);overflow:hidden;display:none;align-items:center}
.ticker.on{display:flex}
.ticker-label{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:0 16px;font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;color:var(--chrome-soft);text-transform:uppercase;border-right:1px solid var(--chrome-line);height:100%;background:var(--chrome-2);position:relative;z-index:2;white-space:nowrap}
.ticker-label .dot{width:7px;height:7px;border-radius:50%;background:#4ade80;animation:cbpulse 2s infinite}
@keyframes cbpulse{0%,100%{opacity:1}50%{opacity:.35}}
.ticker-track{display:flex;gap:44px;white-space:nowrap;animation:cbtick 55s linear infinite;padding-left:22px;will-change:transform}
.ticker:hover .ticker-track{animation-play-state:paused}
@keyframes cbtick{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.tick-item{display:flex;align-items:baseline;gap:9px;font-size:.78rem;color:var(--chrome-soft);flex:0 0 auto}
.tick-item .js{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;color:#5d6b80;text-transform:uppercase}
.tick-item a{color:var(--chrome-ink)}
.tick-item a:hover{color:var(--apricot-soft)}
.tick-item .pr{font-family:'Playfair Display',serif;font-style:italic;color:var(--apricot-soft);font-size:.9rem}
@media (prefers-reduced-motion:reduce){.ticker-track{animation:none}}
body.has-ticker .hero-inner{padding-top:178px}
body.has-ticker .page-hero{padding-top:170px}

/* ---------- hero (photo + dark overlay, chrome ink) ---------- */
.hero{min-height:96svh;display:flex;align-items:flex-end;position:relative;overflow:hidden;color:var(--chrome-ink);background:
  radial-gradient(1100px 520px at 82% -10%,rgba(217,154,78,.14),transparent 60%),
  linear-gradient(180deg,rgba(12,15,21,.78) 0%,rgba(12,15,21,.55) 45%,rgba(12,15,21,.92) 100%),
  url('${M.heroImage}') center 38%/cover no-repeat,
  var(--chrome)}
.hero::before{content:"";position:absolute;inset:0;background-image:
  linear-gradient(rgba(236,231,219,.25) 1px,transparent 1px),
  linear-gradient(90deg,rgba(236,231,219,.25) 1px,transparent 1px);
  background-size:72px 72px;opacity:.07;mask-image:radial-gradient(ellipse at 70% 30%,black 0%,transparent 70%)}
.hero .eyebrow{color:var(--apricot-soft)}
.hero h1 em{color:var(--apricot-soft)}
.hero .sub{color:#c6cbd6}
.hero-inner{position:relative;padding-top:150px;padding-bottom:64px;width:100%}
.hero h1{font-size:calc(clamp(2.3rem,5.6vw,4.1rem) * var(--hs,1));max-width:17ch;margin:0 0 20px}
.hero-city{white-space:nowrap}
.hero .sub{font-size:1.06rem;margin-bottom:34px}
.hero-ctas{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:56px}
.btn{display:inline-block;padding:13px 26px;border-radius:999px;font-size:.92rem;font-weight:600;transition:background .15s,border-color .15s;cursor:pointer}
.btn-gold{background:var(--apricot-soft);color:#171310;border:0}
.btn-gold:hover{background:#e8b878}
.btn-line{border:1px solid rgba(236,231,219,.4);color:var(--chrome-ink)}
.btn-line:hover{border-color:var(--chrome-ink)}
.ledger{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(236,231,219,.22)}
.ledger div{padding:22px 18px 4px;border-left:1px solid rgba(236,231,219,.22)}
.ledger div:first-child{border-left:0;padding-left:0}
.ledger .n{font-family:'Playfair Display',serif;font-size:clamp(1.5rem,3vw,2.2rem);color:var(--chrome-ink)}
.ledger .l{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--chrome-soft);margin-top:6px}

/* ---------- map ---------- */
.map-section{padding-top:88px}
#cbmap{height:560px;border:1px solid var(--line);border-radius:10px;background:var(--bg-2)}
.map-note{font-size:.8rem;color:var(--slate-dim);margin-top:12px}
.leaflet-container{font-family:'DM Sans',sans-serif}
.iz-tract-grid{display:grid;grid-template-columns:1fr;gap:16px}
@media(min-width:960px){.iz-tract-grid{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
#izTractMap{height:440px;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#efece4}
@media(max-width:700px){#izTractMap{height:320px}}
.leaflet-top,.leaflet-bottom{z-index:400!important}
.leaflet-popup-content-wrapper{background:var(--card);color:var(--ivory);border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 40px rgba(28,26,20,.18)}
.leaflet-popup-tip{background:var(--card)}
.leaflet-popup-content{margin:14px 16px;line-height:1.45}
.pp-imgwrap{display:block;width:100%;height:150px;overflow:hidden;border-radius:6px;margin-bottom:9px;background:var(--card-2)}
.pp-imgwrap img{width:100%;height:100%;object-fit:cover;display:block}
.pp-a{font-family:'Playfair Display',serif;font-size:1.02rem;margin-bottom:2px;color:var(--ivory)}
.pp-m{font-family:'JetBrains Mono',monospace;font-size:.64rem;letter-spacing:.08em;color:var(--slate);text-transform:uppercase}
.pp-s{color:var(--apricot);font-weight:600;margin-top:6px;font-size:.9rem}
.pp-link{display:inline-block;margin-top:8px;color:var(--apricot);font-size:.82rem;font-weight:600}
.marker-cluster-small,.marker-cluster-medium,.marker-cluster-large{background:rgba(217,154,78,.3)!important}
.marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div{background:rgba(176,111,36,.92)!important;color:#fff!important;font-weight:600;font-family:'DM Sans',sans-serif}

/* ---------- stat tiles ---------- */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px 22px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.tile .n{font-family:'Playfair Display',serif;font-size:1.9rem}
.tile .l{font-size:.82rem;color:var(--slate);margin-top:4px}

/* ---------- tract grid ---------- */
.tract-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:14px}
.tract-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px;transition:border-color .15s,transform .15s,box-shadow .15s;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.tract-card:hover{border-color:var(--apricot-soft);transform:translateY(-2px);box-shadow:0 8px 24px rgba(28,26,20,.08)}
.tract-card h3{font-size:1.14rem;margin-bottom:8px}
.tract-card .meta{font-family:'JetBrains Mono',monospace;font-size:.64rem;letter-spacing:.1em;text-transform:uppercase;color:var(--slate-dim);margin-bottom:12px}
.tract-card .mv{color:var(--apricot);font-weight:600;font-size:.94rem}
.tract-card .mv span{color:var(--slate);font-weight:400;font-size:.8rem}

/* ---------- split / method card ---------- */
.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start}
.method-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:30px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.method-card p{color:var(--slate);font-size:.94rem;margin-bottom:14px}
.method-card p:last-child{margin-bottom:0}

/* ---------- capture forms ---------- */
form.cb-capture{display:flex;flex-direction:column;gap:10px;margin-top:16px}
form.cb-capture input,form.cb-capture textarea{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px 14px;color:var(--ivory);font-family:'DM Sans',sans-serif;font-size:.92rem;width:100%}
form.cb-capture input:focus,form.cb-capture textarea:focus{outline:none;border-color:var(--apricot-soft)}
form.cb-capture textarea{min-height:74px;resize:vertical}
form.cb-capture button{border:0;cursor:pointer}
.cb-ok{color:var(--ivory);font-size:.95rem}
.cb-err{color:#b3452e;font-size:.84rem}

/* ---------- measured / intelligence modules ---------- */
.mz-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:900px){.mz-grid{grid-template-columns:1fr}}
.mz-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:26px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.mz-eyebrow{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--apricot);display:flex;align-items:center;gap:8px;margin-bottom:6px}
.mz-eyebrow .dot{width:7px;height:7px;border-radius:50%;background:#3fbf6f;animation:cbpulse 2s infinite}
.mz-sub{font-size:.85rem;color:var(--slate-dim);margin-bottom:18px}
.feed-row{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:12px 0;border-bottom:1px solid var(--line)}
.feed-row:last-child{border-bottom:0}
.feed-row .fa{font-family:'Playfair Display',serif;font-size:1.02rem}
.feed-row .fa a{color:var(--ivory)}.feed-row .fa a:hover{color:var(--apricot)}
.feed-row .fm{font-size:.78rem;color:var(--slate-dim);margin-top:2px}
.feed-row .fp{font-family:'Playfair Display',serif;font-size:1.05rem;color:var(--apricot);white-space:nowrap}
.feed-row .fd{font-size:.72rem;color:var(--slate-dim);text-align:right}
.mz-chart svg{width:100%;height:auto;display:block}
.mz-chart .cap{display:flex;justify-content:space-between;font-size:.78rem;color:var(--slate-dim);margin-top:10px}
.mz-chart .cap b{font-family:'Playfair Display',serif;font-style:italic;color:var(--apricot);font-weight:500;font-size:.95rem}
.mz-delta{font-size:.76rem;color:#2f9e5c;margin-left:auto}
.rank-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.pillbar{display:flex;gap:6px;flex-wrap:wrap}
.pill-t{border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:.76rem;color:var(--slate);cursor:pointer;background:var(--card);font-family:'DM Sans',sans-serif}
.pill-t.on{background:var(--ivory);color:#fff;border-color:var(--ivory);font-weight:600}
.rank-row{display:grid;grid-template-columns:22px minmax(120px,200px) 1fr auto auto;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:.86rem}
.rank-row:last-child{border-bottom:0}
.rank-row .ri{font-family:'JetBrains Mono',monospace;font-size:.66rem;color:var(--slate-dim)}
.rank-row .rn a{color:var(--ivory)}.rank-row .rn a:hover{color:var(--apricot)}
.rank-row .rbar{height:6px;border-radius:3px;background:var(--card-2);overflow:hidden}
.rank-row .rbar i{display:block;height:100%;background:linear-gradient(90deg,var(--apricot-soft),#e8b878);border-radius:3px}
.rank-row .rv{font-family:'JetBrains Mono',monospace;font-size:.74rem;color:var(--apricot);white-space:nowrap}
.rank-row .rc{font-size:.7rem;color:var(--slate-dim);white-space:nowrap}
@media(max-width:640px){.rank-row{grid-template-columns:18px 1fr auto}.rank-row .rbar,.rank-row .rc{display:none}}
.insight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:16px}
.insight-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.insight-card h3{font-size:1.16rem;margin:6px 0 10px}
.insight-card p{font-size:.88rem;color:var(--slate)}
.insight-card p b{color:var(--ivory)}
.insight-card .bedrow{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:.88rem;color:var(--slate)}
.insight-card .bedrow:last-child{border-bottom:0}
.insight-card .bedrow b{font-family:'Playfair Display',serif;color:var(--ivory);font-weight:500}
.cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:700px){.cmp-grid{grid-template-columns:1fr}}
select.cb-select{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 12px;color:var(--ivory);font-family:'DM Sans',sans-serif;font-size:.9rem;margin-bottom:14px}
.cmp-stat{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:.88rem;color:var(--slate)}
.cmp-stat:last-child{border-bottom:0}
.cmp-stat b{font-family:'Playfair Display',serif;color:var(--ivory);font-weight:500}
.horizon-note{font-size:.72rem;color:var(--slate-dim);margin-top:10px}

/* ---------- live dot + active listings ---------- */
.live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#4ade80;margin-right:6px;vertical-align:1px;animation:cbpulse 2s infinite}
.listing-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.listing-card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(28,26,20,.04);transition:transform .15s,box-shadow .15s,border-color .15s;display:block}
.listing-card:hover{transform:translateY(-2px);border-color:var(--apricot-soft);box-shadow:0 10px 28px rgba(28,26,20,.1)}
.listing-card .ph{height:200px;background:var(--card-2);overflow:hidden}
.listing-card .ph img{width:100%;height:100%;object-fit:cover;display:block}
.listing-card .bd{padding:18px 20px 20px}
.listing-card .pr{font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ivory)}
.listing-card .pr .st{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#2f9e5c;margin-left:10px;vertical-align:3px}
.listing-card .ad{font-size:.98rem;color:var(--ivory);margin-top:4px}
.listing-card .sp{font-size:.8rem;color:var(--slate-dim);margin-top:4px}
.listing-card .tr{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:var(--apricot);margin-top:10px}
.filter-bar{display:flex;gap:26px;flex-wrap:wrap;margin:6px 0 30px;padding:18px 22px;background:var(--card);border:1px solid var(--line);border-radius:14px}
.filter-group .fl{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--slate-dim);margin-bottom:8px}
.filter-empty{color:var(--slate);padding:26px;border:1px dashed var(--line);border-radius:12px;font-size:.92rem}

/* ---------- active listings v2 ---------- */
.al-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:22px}
.al-count{font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim)}
.al-count b{color:var(--apricot);font-size:.8rem}
select.al-sort{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:9px 36px 9px 16px;color:var(--ivory);font-family:'DM Sans',sans-serif;font-size:.82rem;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23b06f24' fill='none' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;cursor:pointer}
.al-spot{display:grid;grid-template-columns:1.25fr 1fr;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;margin-bottom:34px;box-shadow:0 2px 6px rgba(28,26,20,.05)}
@media(max-width:860px){.al-spot{grid-template-columns:1fr}}
.al-spot .ph{position:relative;min-height:340px;background:var(--card-2);overflow:hidden}
.al-spot .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
.al-spot:hover .ph img{transform:scale(1.04)}
.al-spot .bd{padding:36px;display:flex;flex-direction:column;justify-content:center}
.al-spot .fk{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:var(--apricot);margin-bottom:12px}
.al-spot .pr{font-family:'Playfair Display',serif;font-size:2.6rem;line-height:1}
.al-spot .ad{font-family:'Playfair Display',serif;font-size:1.3rem;margin:12px 0 6px}
.al-spot .sp{font-size:.9rem;color:var(--slate)}
.al-spot .ctas{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
.price-chip{position:absolute;left:14px;bottom:14px;background:rgba(12,15,21,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:var(--chrome-ink);border-radius:999px;padding:7px 14px;font-family:'Playfair Display',serif;font-size:1.02rem;display:flex;align-items:center;gap:8px;z-index:2}
.price-chip .dot{width:7px;height:7px;border-radius:50%;background:#4ade80;animation:cbpulse 2s infinite}
.listing-card .ph{position:relative}
.listing-card .ph img{transition:transform .45s ease}
.listing-card:hover .ph img{transform:scale(1.05)}
.listing-card .bd .tr{transition:letter-spacing .2s ease}
.listing-card:hover .bd .tr{letter-spacing:.18em}
.listing-card{animation:al-in .45s ease both}
@keyframes al-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.listing-card{animation:none}.al-spot .ph img,.listing-card .ph img{transition:none}}

/* ---------- off-market locked showcase ---------- */
.om-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.om-card{background:rgba(236,231,219,.05);border:1px solid rgba(236,231,219,.16);border-radius:14px;padding:22px;position:relative;overflow:hidden}
.om-card .om-ad{font-family:'Playfair Display',serif;font-size:1.15rem;color:var(--chrome-ink)}
.om-card .om-sp{font-size:.8rem;color:var(--chrome-soft);margin-top:4px}
.om-card .om-lock{display:flex;align-items:center;justify-content:space-between;margin-top:18px;padding-top:16px;border-top:1px solid rgba(236,231,219,.14)}
.om-card .om-blur{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--apricot-soft);filter:blur(5px);user-select:none;letter-spacing:1px}
.om-card .om-tag{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--apricot-soft);white-space:nowrap}

/* ---------- listing detail (/for-sale/) ---------- */
.ld-gallery{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:8px}
.ld-main{position:relative;border-radius:16px;overflow:hidden;background:var(--card-2);aspect-ratio:3/2}
.ld-main img{width:100%;height:100%;object-fit:cover;display:block}
.ld-main .price-chip{font-size:1.2rem;padding:9px 18px}
.ld-count{position:absolute;right:14px;bottom:14px;background:rgba(12,15,21,.78);backdrop-filter:blur(6px);color:var(--chrome-ink);border-radius:999px;padding:6px 13px;font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.08em}
.ld-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.ld-thumbs button{border:2px solid transparent;border-radius:10px;overflow:hidden;padding:0;cursor:pointer;background:var(--card-2);aspect-ratio:4/3}
.ld-thumbs button img{width:100%;height:100%;object-fit:cover;display:block;opacity:.82;transition:opacity .15s}
.ld-thumbs button:hover img{opacity:1}
.ld-thumbs button.on{border-color:var(--apricot)}
.ld-thumbs button.on img{opacity:1}
.ld-head{display:flex;justify-content:space-between;gap:22px;align-items:flex-start;flex-wrap:wrap;margin:26px 0 6px}
.ld-price{font-family:'Playfair Display',serif;font-size:clamp(2rem,4.5vw,3rem);line-height:1}
.ld-addr{font-family:'Playfair Display',serif;font-size:clamp(1.2rem,2.4vw,1.6rem);margin-top:8px}
.ld-sub{color:var(--slate);font-size:.92rem;margin-top:6px}
.ld-specband{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin:26px 0}
.ld-specband .sv{font-family:'Playfair Display',serif;font-size:1.5rem}
.ld-specband .sl{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim);margin-top:4px}
.ld-remarks{background:var(--card);border-left:3px solid var(--apricot-soft);border-radius:0 12px 12px 0;padding:20px 24px;margin:8px 0 26px;font-size:1rem;color:var(--ivory);font-style:italic;max-width:70ch}
.ld-remarks .src{display:block;font-style:normal;font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim);margin-top:10px}
.ld-context{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:10px 0 26px}
@media(max-width:700px){.ld-thumbs{grid-template-columns:repeat(4,1fr)}.ld-main{aspect-ratio:4/3}}

/* ---------- chart hover ---------- */
#mzChart,#izChart{position:relative}
.cb-tip{position:absolute;pointer-events:none;background:var(--chrome);color:var(--chrome-ink);font-size:.74rem;padding:7px 11px;border-radius:8px;box-shadow:0 8px 22px rgba(10,12,18,.35);transform:translate(-50%,-130%);white-space:nowrap;z-index:5;display:none}
.cb-tip b{color:var(--apricot-soft);font-family:'Playfair Display',serif;font-style:italic}

/* ---------- footer (dark chrome) ---------- */
footer{border-top:1px solid var(--chrome-line);padding:52px 0 64px;background:var(--chrome);color:var(--chrome-soft)}
footer .wordmark{color:var(--chrome-ink)}
.foot-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:40px;margin-bottom:36px}
.foot-grid h4{font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:#5d6b80;margin-bottom:14px}
.foot-grid a{display:block;font-size:.88rem;color:var(--chrome-soft);padding:4px 0}
.foot-grid a:hover{color:var(--chrome-ink)}
.disclosure{font-size:.74rem;color:#6b7484;line-height:1.7;border-top:1px solid var(--chrome-line);padding-top:24px}

/* ---------- motion ---------- */
.reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .reveal{opacity:1;transform:none;transition:none}
  .tract-card:hover{transform:none}
}

/* ---------- responsive ---------- */
@media (max-width:900px){
  .split{grid-template-columns:1fr;gap:32px}
  .foot-grid{grid-template-columns:1fr 1fr}
}
@media (max-width:700px){
  :root{--nav-h:52px}
  .nav-inner{gap:12px}
  .wordmark{font-size:calc(1.06rem * var(--bs,1))}
  .wordmark .tag{font-size:calc(.58rem * var(--bs,1))}
  .nav-links{display:none}
  .nav-right .nav-cta{display:none}
  .burger{display:block}
  section{padding:56px 0}
  .hero-inner{padding-top:126px;padding-bottom:48px}
  body.has-ticker .hero-inner{padding-top:160px}
  .ledger{grid-template-columns:1fr 1fr}
  .ledger div{padding:16px 12px 2px}
  .ledger div:nth-child(odd){border-left:0;padding-left:0}
  #cbmap{height:440px}
  .page-hero{padding:112px 0 40px}
  body.has-ticker .page-hero{padding-top:150px}
  .mms-hero{padding:118px 18px 54px}
  body.has-ticker .mms-hero{padding-top:154px}
  .section-head{margin-bottom:30px}
  /* iOS: inputs under 16px trigger focus zoom */
  form.cb-capture input,form.cb-capture textarea,.mms-f input,.mms-f textarea,select.cb-select{font-size:16px}
  table.cb{font-size:.78rem;min-width:560px}
  table.cb th{padding:9px 10px}
  table.cb td{padding:8px 10px}
  .tbl-wrap{-webkit-overflow-scrolling:touch}
  .feed-row{flex-wrap:wrap}
  .band-dark{grid-template-columns:1fr 1fr;padding:26px 22px}
  .mms-modal{padding:26px 20px}
  .persona-bar .inner{gap:10px}
  .home-photo{max-height:280px}
  .fee-always{padding:24px 20px;gap:16px}
  .fee-always-pct{font-size:2.6rem}
}
@media (max-width:480px){
  .ticker-label{padding:0 10px}
  .hero h1{font-size:calc(2.15rem * var(--hs,1))}
  .mms-hero-title{font-size:2.2rem}
  .hero-ctas .btn,.hero-ctas .btn-line{width:100%;text-align:center}
  .mms-hero-ctas{flex-direction:column}
  .mms-hero-ctas .btn,.mms-hero-ctas .btn-ghost{width:100%}
}

/* ---------- how-it-works: persona system ---------- */
.persona-bar{position:sticky;top:calc(var(--nav-h) + 34px);z-index:600;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;font-size:.82rem}
body:not(.has-ticker) .persona-bar{top:var(--nav-h)}
.persona-bar .inner{max-width:var(--max);margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.persona-bar .who{color:var(--slate)}
.persona-bar .who strong{color:var(--ivory)}
.persona-bar .anchors{display:flex;gap:16px;flex-wrap:wrap}
.persona-bar .anchors a{color:var(--slate);font-size:.8rem}
.persona-bar .anchors a:hover{color:var(--apricot)}
.persona-bar .switch{margin-left:auto;color:var(--apricot);font-weight:600;cursor:pointer;font-size:.8rem;background:none;border:0;font-family:'DM Sans',sans-serif}
@media(max-width:700px){.persona-bar .anchors{display:none}}
.persona-picker{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:760px;margin-top:34px}
@media(max-width:700px){.persona-picker{grid-template-columns:1fr}}
.persona-card{border-radius:14px;padding:26px;cursor:pointer;border:1px solid rgba(236,231,219,.28);background:rgba(12,15,21,.55);color:var(--chrome-ink);transition:transform .15s,border-color .15s;position:relative}
.persona-card:hover{transform:translateY(-2px);border-color:var(--apricot-soft)}
.persona-card .im{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--apricot-soft)}
.persona-card h3{font-size:1.7rem;margin:6px 0 10px}
.persona-card p{font-size:.9rem;color:#c6cbd6}
.persona-card.sel{background:var(--apricot-soft);border-color:var(--apricot-soft);color:#171310}
.persona-card.sel p{color:#3c2f1c}
.persona-card.sel .im{color:#6b4a1a}
.persona-card .tick{position:absolute;top:14px;right:16px;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.85);color:#8a5a17;display:none;align-items:center;justify-content:center;font-size:.75rem;font-weight:700}
.persona-card.sel .tick{display:flex}
body[data-persona="buyer"] .only-seller{display:none!important}
body[data-persona="seller"] .only-buyer{display:none!important}

/* dark stat band */
.band-dark{background:var(--chrome);color:var(--chrome-ink);border-radius:16px;padding:34px 30px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:22px;margin-top:40px}
.band-dark .n{font-family:'Playfair Display',serif;font-size:2rem}
.band-dark .n.gold{color:var(--apricot-soft)}
.band-dark .l{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--chrome-soft);margin-top:6px}

/* tier ladder */
.tier{border:1px solid var(--line);border-radius:16px;padding:32px;margin-bottom:18px;background:var(--card)}
.tier.dark{background:var(--chrome);border-color:var(--chrome);color:var(--chrome-ink)}
.tier .tk{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--apricot)}
.tier.dark .tk{color:var(--apricot-soft)}
.tier h3{font-size:1.7rem;margin:8px 0 10px}
.tier p{color:var(--slate);font-size:.95rem;padding-bottom:16px;border-bottom:1px solid var(--line)}
.tier.dark p{color:#c6cbd6;border-color:rgba(236,231,219,.18)}
.tier .specs{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:18px;padding-top:16px}
.tier .specs .sl{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim)}
.tier.dark .specs .sl{color:var(--chrome-soft)}
.tier .specs .sv{font-family:'Playfair Display',serif;font-size:1.4rem;margin-top:4px}
.tier .specs .sd{font-size:.74rem;color:var(--slate-dim);margin-top:2px}
.tier.dark .specs .sd{color:var(--chrome-soft)}

/* playbook cards */
.playbook-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:700px){.playbook-grid{grid-template-columns:1fr}}
.playbook{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.playbook .pk{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--apricot)}
.playbook h3{font-size:1.4rem;margin:8px 0 10px}
.playbook p{font-size:.9rem;color:var(--slate)}
.playbook a.more{display:inline-block;margin-top:14px;color:var(--apricot);font-weight:600;font-size:.88rem}

/* FAQ accordion */
.faq details{border-bottom:1px solid var(--line);padding:4px 0}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:14px;padding:16px 0;font-family:'Playfair Display',serif;font-size:1.08rem;color:var(--ivory)}
.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:'+';font-family:'DM Sans',sans-serif;color:var(--apricot);font-size:1.3rem;line-height:1}
.faq details[open] summary:after{content:'−'}
.faq .a{color:var(--slate);font-size:.92rem;padding:0 0 18px;max-width:64ch}

/* numbered steps / timeline */
.steps{counter-reset:st}
.step{display:grid;grid-template-columns:52px 1fr;gap:18px;padding:20px 0;border-bottom:1px solid var(--line)}
.step:last-child{border-bottom:0}
.step:before{counter-increment:st;content:counter(st,decimal-leading-zero);font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--apricot)}
.step h4{font-size:1.06rem;margin-bottom:4px;font-family:'Playfair Display',serif;font-weight:500}
.step p{font-size:.9rem;color:var(--slate)}

.mmm-locked-card{background:rgba(236,231,219,.05);border:1px solid rgba(236,231,219,.16);border-radius:16px;padding:26px}
.mmm-locked-card .mlc-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(236,231,219,.12)}
.mmm-locked-card .mlc-ad{font-family:"Playfair Display",serif;font-size:1.05rem;color:var(--chrome-ink)}
.mmm-locked-card .mlc-pr{font-family:"Playfair Display",serif;font-size:1.3rem;color:var(--apricot-soft);filter:blur(4px);letter-spacing:1px;user-select:none}
.mmm-locked-card .mlc-lock{margin-top:16px;text-align:center;font-family:"JetBrains Mono",monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--apricot-soft)}

/* ---------- $10k credit calculator ---------- */
.credit-calc{background:rgba(236,231,219,.05);border:1px solid rgba(236,231,219,.16);border-radius:18px;padding:32px;margin-top:30px}
.cc-price{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--chrome-ink);margin-bottom:18px}
.cc-price span{color:var(--apricot-soft)}
.cc-slider{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;outline:none;margin:6px 0 26px;background:linear-gradient(to right,var(--apricot) 0%,var(--apricot) var(--pct,18%),rgba(236,231,219,.2) var(--pct,18%),rgba(236,231,219,.2) 100%)}
.cc-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:var(--apricot-soft);cursor:pointer;border:3px solid var(--chrome);box-shadow:0 2px 8px rgba(10,12,18,.4)}
.cc-slider::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--apricot-soft);cursor:pointer;border:3px solid var(--chrome)}
.cc-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
@media(max-width:600px){.cc-grid{grid-template-columns:1fr}}
.cc-cell{background:rgba(12,15,21,.35);border-radius:12px;padding:18px 20px}
.cc-cell.net{background:var(--apricot-soft)}
.cc-k{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--chrome-soft)}
.cc-cell.net .cc-k{color:#6b4a1a}
.cc-v{font-family:'Playfair Display',serif;font-size:1.8rem;margin-top:6px;color:var(--chrome-ink)}
.cc-v.gold{color:var(--apricot-soft)}
.cc-cell.net .cc-v{color:#171310}
.cc-note{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:#6b4a1a;margin-top:4px}
.cc-read{color:#c6cbd6;font-size:.92rem;margin-top:20px;text-align:center}
.cc-read b{color:var(--chrome-ink)}

/* ---------- how-it-works CMA + call ---------- */
.cma-split{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
@media(max-width:820px){.cma-split{grid-template-columns:1fr}}
.cma-call{background:var(--chrome);color:var(--chrome-ink);border-radius:14px;padding:32px}
.cma-call .eyebrow{color:var(--apricot-soft)}
.cma-call h3{font-family:'Playfair Display',serif;font-size:1.6rem;margin:8px 0 12px}
.cma-call h3 em{font-style:italic;color:var(--apricot-soft)}
.cma-call p{color:#c6cbd6;font-size:.92rem;margin-bottom:20px}
.cma-call .btn-line{border-color:rgba(236,231,219,.4);color:var(--chrome-ink)}
.cma-call .btn-line:hover{border-color:var(--chrome-ink);background:rgba(236,231,219,.06)}
.cma-call .cma-fine{font-size:.68rem;color:var(--chrome-soft);margin:16px 0 0}

/* ---------- credit comparison columns ---------- */
.cc-compare{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:600px){.cc-compare{grid-template-columns:1fr}}
.cc-col{border-radius:12px;padding:22px 20px;text-align:center}
.cc-col.trad{background:rgba(12,15,21,.35);opacity:.9}
.cc-col.cbm{background:var(--apricot-soft)}
.cc-col-h{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#6b4a1a}
.cc-col.trad .cc-col-h{color:var(--chrome-soft)}
.cc-col-rate{font-size:.8rem;margin-top:6px;color:#6b4a1a}
.cc-col.trad .cc-col-rate{color:var(--chrome-soft)}
.cc-col-v{font-family:'Playfair Display',serif;font-size:2.1rem;margin-top:10px;color:#171310}
.cc-col.trad .cc-col-v{color:var(--chrome-ink);text-decoration:line-through;text-decoration-color:rgba(217,154,78,.6);text-decoration-thickness:2px}
.cc-col-sub{font-size:.72rem;margin-top:4px;color:#6b4a1a}
.cc-col.trad .cc-col-sub{color:var(--chrome-soft)}
.cc-save{display:flex;align-items:baseline;justify-content:center;gap:12px;background:rgba(217,154,78,.12);border:1px solid var(--apricot-soft);border-radius:12px;padding:16px 22px;flex-wrap:wrap}
.cc-save-k{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--apricot-soft)}
.cc-save-v{font-family:'Playfair Display',serif;font-size:2rem;color:var(--apricot-soft)}
.cc-save-note{font-size:.85rem;color:var(--chrome-soft)}
/* light slider variant for bg-2 contexts (MMM) */
.cc-slider-light{background:linear-gradient(to right,var(--apricot) 0%,var(--apricot) var(--pct,18%),rgba(28,26,20,.15) var(--pct,18%),rgba(28,26,20,.15) 100%)}
.cc-slider-light::-webkit-slider-thumb{border-color:var(--bg-2)}
/* MMM light-context save + read overrides */
.credit-calc[style*="bg-2"] .cc-save-note{color:var(--slate)}
.credit-calc[style*="bg-2"] .cc-col.trad{background:var(--card)}
.credit-calc[style*="bg-2"] .cc-col.trad .cc-col-v{color:var(--ivory)}

/* ---------- home-page MMM badge ---------- */
.mmm-home-lock,.mmm-home-open{display:grid;grid-template-columns:1.4fr 1fr;gap:26px;align-items:center}
@media(max-width:760px){.mmm-home-lock,.mmm-home-open{grid-template-columns:1fr;gap:20px}}
.mmm-home-blur,.mmm-home-price{background:rgba(236,231,219,.05);border:1px solid rgba(236,231,219,.16);border-radius:16px;padding:30px;text-align:center}
.mhb-k{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--chrome-soft)}
.mhb-v{font-family:'Playfair Display',serif;font-size:2.4rem;margin-top:8px;color:var(--chrome-ink)}
.mmm-home-blur .mhb-v{filter:blur(7px);user-select:none;letter-spacing:2px;color:var(--apricot-soft)}

/* ---------- home-page listing gallery (pulled from sold/active MLS) ---------- */
.home-listing .lg-main{margin-top:8px;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--bg-2)}
.home-listing .lg-main img{width:100%;max-height:520px;object-fit:cover;display:block;cursor:pointer}
.home-listing .lg-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;margin-top:10px}
.home-listing .lg-t{padding:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:none;cursor:pointer;aspect-ratio:4/3}
.home-listing .lg-t img{width:100%;height:100%;object-fit:cover;display:block}
.home-listing .lg-t.on{border-color:var(--apricot);box-shadow:0 0 0 2px var(--apricot-soft)}
.home-listing .lg-count{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--slate-dim);margin-top:8px;letter-spacing:.08em}
.home-listing .lg-desc{margin-top:22px;max-width:70ch}
.home-listing .lg-desc p{font-size:1.02rem;line-height:1.7;color:var(--slate);margin:.5rem 0 0}
.home-listing .lg-attr{font-family:'JetBrains Mono',monospace;font-size:.66rem;color:var(--slate-dim);margin-top:10px;letter-spacing:.06em}

/* recent-sales sold chip */
.price-chip.sold{background:rgba(23,19,16,.9)!important;color:#e7c99a!important}
.price-chip.sold .dot{background:#7bbf7b!important}

/* listing-detail head CTA group (Tour + View on MLSListings) */
.ld-head-cta{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.ld-head-cta .btn{white-space:nowrap}
.ld-mls{font-size:.82rem}
@media(max-width:640px){.ld-head-cta{width:100%;align-items:stretch}.ld-head-cta .btn{text-align:center}}

/* listing photo placeholder (no MLS photo yet - avoids wrong Street View) */
.ph:empty,.listing-card .ph:empty{position:relative;background:linear-gradient(135deg,#1a1f2b,#12151d)}
.ph:empty::after{content:"Photos coming soon";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--apricot-soft);font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;opacity:.75}
.ld-nophoto{aspect-ratio:3/2;border-radius:14px;background:linear-gradient(135deg,#1a1f2b,#12151d);display:flex;align-items:center;justify-content:center;color:var(--apricot-soft);font-family:'JetBrains Mono',monospace;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase}

/* Be Your Own Agent toolkit */
.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.tool-link{text-decoration:none;color:inherit;display:block;height:100%}
.tool-tile{height:100%;background:var(--card,#fff);border:1px solid var(--line);border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:10px;transition:transform .16s,border-color .16s,box-shadow .16s}
.tool-link:hover .tool-tile:not(.is-soon){transform:translateY(-3px);border-color:var(--apricot);box-shadow:0 22px 55px -30px rgba(23,19,16,.4)}
.tool-tile.is-soon{opacity:.72}
.tt-top{display:flex;align-items:center;justify-content:space-between}
.tt-ico{width:44px;height:44px;border-radius:50%;background:rgba(176,111,36,.1);display:flex;align-items:center;justify-content:center;color:var(--apricot)}
.tt-ico svg{width:20px;height:20px}
.tt-arrow{color:var(--slate);font-size:1.1rem}
.tt-soon{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--slate-dim);border:1px solid var(--line);border-radius:20px;padding:3px 9px}
.tool-tile h3{font-family:'Playfair Display',serif;font-size:1.2rem;margin:6px 0 0}
.tool-tile p{font-size:.9rem;color:var(--slate);line-height:1.55;margin:0;flex:1}
.tt-tags{display:flex;gap:6px;margin-top:6px}
.tt-tag{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:var(--slate);background:rgba(23,19,16,.05);border-radius:20px;padding:3px 9px}
.tool-gate{margin-top:32px;background:var(--bg-2);border:1px solid var(--line);border-radius:20px;padding:30px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
.tool-gate>div{flex:1;min-width:280px}
/* Net sheet */
.ns-wrap{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}
.ns-inputs{display:flex;flex-direction:column;gap:16px}
.ns-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ns-field{display:flex;flex-direction:column;gap:5px}
.ns-lbl{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate)}
.ns-field input{font-family:'Playfair Display',serif;font-size:1.2rem;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);width:100%}
.ns-field input:focus{outline:none;border-color:var(--apricot)}
.ns-hint{font-size:.72rem;color:var(--slate-dim)}
.ns-note{font-size:.72rem;color:var(--slate-dim);line-height:1.5;margin:4px 0 0}
.ns-result{background:var(--chrome);color:var(--chrome-ink);border-radius:20px;padding:28px}
.ns-net-lbl{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--chrome-soft)}
.ns-net{font-family:'Playfair Display',serif;font-size:2.9rem;color:var(--apricot-soft);margin:6px 0 18px;line-height:1}
.ns-rows{display:flex;flex-direction:column;border-top:1px solid rgba(255,255,255,.12);padding-top:10px}
.ns-row{display:flex;justify-content:space-between;font-size:.9rem;padding:7px 0;color:#c6cbd6}
.ns-row.b{font-weight:600;color:var(--chrome-ink);border-top:1px solid rgba(255,255,255,.12);margin-top:6px;padding-top:12px}
.ns-row.g span:last-child{color:#8fbf8f}
.ns-compare{margin-top:16px;border-top:1px solid rgba(255,255,255,.12);padding-top:14px}
.ns-cmp-row{display:flex;justify-content:space-between;font-size:.9rem;padding:5px 0;color:#c6cbd6}
.ns-cmp-row.hi{color:var(--apricot-soft);font-weight:600;font-size:1rem}
@media(max-width:760px){.ns-wrap{grid-template-columns:1fr}}

.feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px;margin-top:22px}
.feat-card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:18px;padding:26px;display:flex;flex-direction:column;transition:transform .18s,box-shadow .18s}
.feat-card:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(30,20,10,.10)}
.feat-ico{width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,#eccf98,#d99a4e);display:flex;align-items:center;justify-content:center;margin-bottom:18px;color:#fff}
.feat-card h3{font-family:Georgia,serif;font-size:1.18rem;margin:0 0 8px}
.feat-card>p{font-size:.9rem;color:var(--slate);margin:0 0 16px;line-height:1.55}
.feat-list{list-style:none;padding:0;margin:0 0 20px}
.feat-list li{font-size:.85rem;color:#413a30;padding-left:22px;position:relative;margin-bottom:9px;line-height:1.4}
.feat-list li:before{content:'';position:absolute;left:2px;top:4px;width:11px;height:6px;border-left:2px solid #c8892f;border-bottom:2px solid #c8892f;transform:rotate(-45deg)}
.feat-card .btn{margin-top:auto;align-self:flex-start}
.mtg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px;margin:18px 0}
.mtg-grid label{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:var(--slate)}
.mtg-grid input,.mtg-grid select{width:100%;margin-top:6px;padding:10px 12px;border:1px solid rgba(0,0,0,.15);border-radius:10px;font-size:1rem;font-family:inherit;background:#fff;color:inherit}
.mtg-out{border-top:1px solid rgba(0,0,0,.08);padding-top:16px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.mtg-big{font-family:Georgia,serif;font-size:2.3rem;color:#b06f24;line-height:1}
.mtg-sub{font-size:.8rem;color:var(--slate)}
`; }

const PAGE_CSS = `
.home-photo{width:100%;max-height:440px;object-fit:cover;border:1px solid var(--line);border-radius:10px;margin:26px 0 6px;display:block}
.crumbs{font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:var(--slate-dim);margin-bottom:18px}
.crumbs a{color:var(--slate)}.crumbs a:hover{color:var(--apricot)}
.page-hero{padding:132px 0 44px}
.page-hero h1{font-size:clamp(1.9rem,4.4vw,3rem);max-width:20ch;margin-bottom:14px}
.rec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:26px 0}
.rec{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
.rec .n{font-family:'Playfair Display',serif;font-size:1.3rem}
.rec .l{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim);margin-top:5px}
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px}
table.cb{width:100%;border-collapse:collapse;font-size:.88rem;min-width:640px}
table.cb th{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim);text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);background:var(--bg-2)}
table.cb td{padding:11px 14px;border-bottom:1px solid var(--line);color:var(--slate)}
table.cb tr:last-child td{border-bottom:0}
table.cb td a{color:var(--ivory)}table.cb td a:hover{color:var(--apricot)}
table.cb td.val{color:var(--apricot);font-weight:600;white-space:nowrap}
.chip-row{display:flex;flex-wrap:wrap;gap:8px}
.chip{border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:.82rem;color:var(--slate);transition:border-color .15s,color .15s}
.chip:hover{border-color:var(--apricot);color:var(--ivory)}
#pgmap{height:380px;border:1px solid var(--line);border-radius:10px;margin:30px 0 6px}
section.pg{padding:44px 0}
.idx-cols{columns:3;column-gap:28px}
@media(max-width:900px){.idx-cols{columns:2}}
@media(max-width:600px){.idx-cols{columns:1}}
.idx-cols a{display:block;break-inside:avoid;padding:7px 0;border-bottom:1px solid var(--line);font-size:.9rem;color:var(--slate)}
.idx-cols a:hover{color:var(--ivory)}
.idx-cols a span{color:var(--slate-dim);font-size:.76rem}
`;

function shell(title, desc, canonicalPath, body, jsonld, extraHead, ogImage) {
  const ogImg = ogImage || `https://${M.domain}${M.ogImage}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://${M.domain}${canonicalPath}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${M.name}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="https://${M.domain}${canonicalPath}">
<meta property="og:image" content="${esc(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(ogImg)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://${M.domain}${canonicalPath}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${cbCss()}
${PAGE_CSS}</style>
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}
${extraHead || ''}
</head>
<body>
<nav class="nav">
  <div class="nav-inner">
    <a class="wordmark" href="/" style="--bs:${Math.max(.72, Math.min(1, 22 / (M.name.length + .55 * M.zipsLabel.length))).toFixed(2)}"><b>The ${M.city}</b> Market<span class="tag">${M.zipsLabel}</span></a>
    <div class="nav-links">
      <a href="/#map">The Map</a>
      <a href="/active-listings/"><span class="live-dot"></span>For sale</a>
      <a href="/recent-sales/">Recent sales</a>
      <a href="/tools/">Toolkit</a>
      <a href="/intelligence/">Intelligence</a>
      <a href="/how-it-works/">How it works</a>
      <a href="/make-me-move/">Make me move</a>
    </div>
    <div class="nav-right">
      <a class="nav-cta" href="https://app.${M.domain}/signin">Sign in</a>
    </div>
    <button class="burger" aria-label="Open menu" aria-expanded="false" id="burger"><span></span><span></span><span></span></button>
  </div>
</nav>
<div class="drawer" id="drawer">
  <a href="/#map">The Map</a>
  <a href="/active-listings/"><span class="live-dot"></span>For sale</a>
  <a href="/recent-sales/">Recent sales</a>
  <a href="/tools/">Toolkit</a>
  <a href="/intelligence/">Intelligence</a>
  <a href="/how-it-works/">How it works</a>
  <a href="/make-me-move/">Make me move</a>
  <a href="/methodology/">Methodology</a>
  <a class="nav-cta" href="/#contact">Get your home's number</a>
</div>
${body}
<footer>
  <div class="wrap">
    <p class="disclosure">© 2026 ${M.name} · McMullen Properties LLC · ${M.agent.name}, CA DRE #${M.agent.dre} · Operating under Real Broker, DRE #02228473. Property information is compiled from ${M.county} County public records and other sources; it is deemed reliable but not guaranteed and should be independently verified. Estimated values are computational estimates, not appraisals. ${M.name} is an independent service and is not affiliated with the City of ${M.city}.</p>
  </div>
</footer>
<script>/* Eichler Market — shared motion engine for static pages (homepage, how-it-works, make-me-move)
 * Vanilla JS, no deps. Injects its own CSS. Honors prefers-reduced-motion.
 * Hooks (add these attributes in markup):
 *   [data-reveal]              — container; on scroll-in, adds .is-in (children animate in, staggered)
 *   [data-reveal-child]        — child of a [data-reveal]; fades/slides up with stagger
 *   [data-reveal-self]         — element animates itself on scroll-in
 *   [data-count="1768"]        — number counts 0->target on scroll-in
 *        data-prefix="$"  data-suffix="/sf"  data-comma="1"  data-dec="1"
 *   [data-tw]                  — typewriter the element's text on scroll-in (gold caret)
 *   [data-parallax="0.15"]     — element drifts on scroll (hero photo); value = speed factor
 */
(function () {
  if (window.EMMotion) return;
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  // ---- CSS ----
  var css = ''
    + '[data-reveal-child]{opacity:0;transform:translateY(18px);transition:opacity .6s cubic-bezier(.2,.6,.2,1),transform .6s cubic-bezier(.2,.6,.2,1)}'
    + '[data-reveal].is-in [data-reveal-child]{opacity:1;transform:none}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(2){transition-delay:.07s}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(3){transition-delay:.14s}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(4){transition-delay:.21s}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(5){transition-delay:.28s}'
    + '[data-reveal].is-in [data-reveal-child]:nth-child(6){transition-delay:.35s}'
    + '[data-reveal-self]{opacity:0;transform:translateY(22px);transition:opacity .65s cubic-bezier(.2,.6,.2,1),transform .65s cubic-bezier(.2,.6,.2,1)}'
    + '[data-reveal-self].is-in{opacity:1;transform:none}'
    + '.em-tw-caret{display:inline-block;width:.06em;background:#c8a96e;margin-left:.04em;animation:em-tw-blink .9s steps(1) infinite;vertical-align:baseline}'
    + '@keyframes em-tw-blink{50%{opacity:0}}'
    + '@media(prefers-reduced-motion:reduce){'
    + '  [data-reveal-child],[data-reveal-self]{opacity:1!important;transform:none!important;transition:none!important}'
    + '  .em-tw-caret{display:none}'
    + '}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---- Animated counter ----
  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var comma = el.getAttribute('data-comma') === '1';
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    function fmt(v) { return prefix + (comma ? Math.round(v).toLocaleString() : v.toFixed(dec)) + suffix; }
    if (RM) { el.textContent = fmt(target); return; }
    var dur = 1500, t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = fmt(target * e);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(target);
    }
    requestAnimationFrame(step);
  }

  // ---- Typewriter ----
  function typewrite(el) {
    var full = el.getAttribute('data-tw-text') || el.textContent;
    el.setAttribute('data-tw-text', full);
    if (RM) { el.textContent = full; return; }
    el.textContent = '';
    var caret = document.createElement('span'); caret.className = 'em-tw-caret'; caret.textContent = ' ';
    el.appendChild(caret);
    var i = 0, speed = 30;
    (function tick() {
      if (i <= full.length) {
        el.textContent = full.slice(0, i);
        el.appendChild(caret);
        i++; setTimeout(tick, speed);
      } else {
        setTimeout(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 700);
      }
    })();
  }

  function onIn(el) {
    el.classList.add('is-in');
    el.querySelectorAll('[data-count]').forEach(function (c) { if (!c.__counted) { c.__counted = 1; animateCount(c); } });
    el.querySelectorAll('[data-tw]').forEach(function (t) { if (!t.__tw) { t.__tw = 1; typewrite(t); } });
    if (el.hasAttribute('data-count') && !el.__counted) { el.__counted = 1; animateCount(el); }
    if (el.hasAttribute('data-tw') && !el.__tw) { el.__tw = 1; typewrite(el); }
  }

  function initReveals() {
    var nodes = document.querySelectorAll('[data-reveal],[data-reveal-self],[data-count],[data-tw]');
    if (!('IntersectionObserver' in window)) { nodes.forEach(onIn); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { onIn(en.target); io.unobserve(en.target); } });
    }, { threshold: .14, rootMargin: '-40px 0px' });
    nodes.forEach(function (el) {
      // avoid double-observing a counter that's inside an already-observed [data-reveal]
      if ((el.hasAttribute('data-count') || el.hasAttribute('data-tw')) && el.closest('[data-reveal]')) return;
      io.observe(el);
    });
    // Above-the-fold hero: reveal immediately so it never starts hidden
    setTimeout(function () {
      document.querySelectorAll('.hero [data-reveal],.hero[data-reveal],.mms-hero [data-reveal],.mms-hero[data-reveal]').forEach(function (el) {
        if (!el.classList.contains('is-in')) onIn(el);
      });
    }, 90);
  }

  // ---- Parallax drift (bolder-than-community extra) ----
  function initParallax() {
    if (RM) return;
    var els = [].slice.call(document.querySelectorAll('[data-parallax]'));
    if (!els.length) return;
    var ticking = false;
    function update() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.15;
        var r = el.getBoundingClientRect();
        // only when roughly in view
        if (r.bottom < -200 || r.top > vh + 200) return;
        var mid = r.top + r.height / 2;
        var off = (mid - vh / 2) * -speed;
        el.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0) scale(1.06)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  function boot() { initReveals(); initParallax(); }
  window.EMMotion = { rescan: initReveals };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>
<script type="module" src="/assets/cb-auth-nav.js"></script>
<script>window.MKT={id:${M.id},slug:'${M.slug}',city:'${M.city}',name:'${M.name}',domain:'${M.domain}',email:'tim@${M.domain}',source:'${M.slug.replace(/-market$/,"")}_web'};</script>
<script src="/assets/cb-track.js"></script>
<script src="/assets/cb-lead.js"></script>
<script>
(function(){
  var burger=document.getElementById('burger'),drawer=document.getElementById('drawer');
  if(burger){burger.addEventListener('click',function(){var o=drawer.classList.toggle('open');burger.setAttribute('aria-expanded',o);});
  drawer.addEventListener('click',function(e){if(e.target.tagName==='A')drawer.classList.remove('open');});}
})();

(function(){
  var SB='https://qinuukntpyulqjzndnho.supabase.co';
  var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
  function mm(n){return n==null?'':'$'+(n>=1e6?(n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'')+'M':Math.round(n/1000)+'K');}
  function build(items){
    if(!items.length)return;
    var host=document.getElementById('cbticker'); if(!host)return;
    var html='';
    items.forEach(function(it){
      var ppsf=(it.price&&it.sqft)?Math.round(it.price/it.sqft):null;
      html+='<span class="tick-item"><span class="js">Just sold</span>'+
        (it.property_slug?('<a href="/home/'+it.property_slug+'/">'+it.address_raw+'</a>'):('<span style="color:var(--chrome-ink)">'+it.address_raw+'</span>'))+
        '<span class="pr">'+mm(it.price)+'</span>'+(ppsf?('<span>'+ppsf.toLocaleString()+'/sf</span>'):'')+'</span>';
    });
    host.innerHTML='<div class="ticker-label"><span class="dot"></span>Live market</div><div class="ticker-track">'+html+html+'</div>';
    host.classList.add('on');document.body.classList.add('has-ticker');
  }
  fetch(SB+'/rest/v1/mls_feed_listings?market_id=eq.${M.id}&status=eq.Sold&order=price.desc&limit=8&select=address_raw,property_slug,price,sqft',
    {headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){return r.ok?r.json():[];})
    .then(build).catch(function(){});
})();
</script>
<script src="/assets/mkt-chat.js?v=4" defer></script>
</body>
</html>`;
}

function mapScript(points) {
  return `
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" defer></script>
<script>
document.addEventListener('DOMContentLoaded',function(){
  var pts=(${JSON.stringify(points)}).filter(function(p){
    return p&&p[0]!=null&&p[1]!=null&&!isNaN(p[0])&&!isNaN(p[1]);
  });
  if(!pts.length||!window.L)return;
  var map=L.map('pgmap',{scrollWheelZoom:false});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',maxZoom:19}).addTo(map);
  var g=L.featureGroup(pts.map(function(p){
    return L.circleMarker([p[0],p[1]],{radius:6,color:'#d99a4e',weight:1,fillColor:'#d99a4e',fillOpacity:.6}).bindPopup(p[2],{keepInView:true,autoPanPaddingTopLeft:L.point(24,104)});
  })).addTo(map);
  map.fitBounds(g.getBounds().pad(0.25),{maxZoom:17});
  map.on('focus click',function(){map.scrollWheelZoom.enable();});
});
</script>`;
}

function homesTable(list, opts) {
  opts = opts || {};
  const rows = list.map(p => `<tr>
<td><a href="/home/${p.s}/">${esc(p.a)}</a></td>
<td>${TYPE[p.t] || ''}</td>
<td>${esc(specLine(p)) || '—'}</td>
<td class="val">${p.ev ? money(p.ev) : '—'}</td>
<td>${p.sp ? money(p.sp) + (p.sd ? ' <span style="color:var(--slate-dim)">· ' + p.sd.slice(0, 4) + '</span>' : '') : '—'}</td>
</tr>`).join('');
  return `<div class="tbl-wrap"><table class="cb">
<thead><tr><th>Address</th><th>Type</th><th>Specs</th><th>Est. value</th><th>Last sale</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

function captureCard(o) {
  return `<div class="method-card" style="max-width:560px">
    <span class="eyebrow">${esc(o.eyebrow)}</span>
    <p>${o.lead}</p>
    <form class="cb-capture" data-intent="${esc(o.intent)}"${o.property ? ` data-property="${esc(o.property)}"` : ''}${o.tract ? ` data-tract="${esc(o.tract)}"` : ''} data-source="${esc(o.source)}" data-cta="${esc(o.cta)}">
      <input type="text" name="name" placeholder="Your name" autocomplete="name">
      <input type="email" name="email" placeholder="Email address" required autocomplete="email">
      <textarea name="message" placeholder="${esc(o.placeholder || 'Anything you want to add (optional)')}"></textarea>
      <button type="submit" class="btn btn-gold">${esc(o.cta)}</button>
    </form>
    <p style="font-size:.72rem;color:var(--slate-dim);margin-top:12px;margin-bottom:0">Direct to ${M.agent.name}, CA DRE #${M.agent.dre}. No listing required, no obligation, no spam.</p>
  </div>`;
}

// Action-driving CTA that sends people INTO the toolkit (CRO), not a generic form.
function toolCta(o) {
  var acts = (o.actions || []).map(function(a, i) {
    return i === 0
      ? '<a href="' + a.href + '" class="btn btn-gold">' + esc(a.label) + ' &rarr;</a>'
      : '<a href="' + a.href + '" class="btn" style="background:transparent;border:1px solid rgba(0,0,0,.16);color:inherit">' + esc(a.label) + ' &rarr;</a>';
  }).join('');
  return '<div class="method-card" style="max-width:640px">'
    + '<span class="eyebrow">' + esc(o.eyebrow) + '</span>'
    + '<p style="margin-bottom:2px">' + o.lead + '</p>'
    + '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px">' + acts + '</div>'
    + '<p style="font-size:.72rem;color:var(--slate-dim);margin-top:14px;margin-bottom:0">' + (o.note || 'Free and instant · save your work with a free account · no obligation.') + '</p>'
    + '</div>';
}

/* ---- CRO interactive cards + tools ---- */
const ICO = {
  doc: "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='9' y1='13' x2='15' y2='13'/><line x1='9' y1='17' x2='15' y2='17'/></svg>",
  chart: "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='20' x2='18' y2='10'/><line x1='12' y1='20' x2='12' y2='4'/><line x1='6' y1='20' x2='6' y2='14'/></svg>",
  home: "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/><polyline points='9 22 9 12 15 12 15 22'/></svg>",
  calc: "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='4' y='2' width='16' height='20' rx='2'/><line x1='8' y1='6' x2='16' y2='6'/><line x1='8' y1='10' x2='9' y2='10'/><line x1='12' y1='10' x2='16' y2='10'/><line x1='8' y1='14' x2='9' y2='14'/><line x1='12' y1='14' x2='16' y2='14'/><line x1='8' y1='18' x2='9' y2='18'/></svg>",
  tag: "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'/><line x1='7' y1='7' x2='7.01' y2='7'/></svg>"
};
function featureCards(cards) {
  return '<div class="feat-grid">' + cards.map(function(c){
    return '<div class="feat-card"><div class="feat-ico">' + c.icon + '</div>'
      + '<h3>' + c.title + '</h3><p>' + c.lead + '</p>'
      + '<ul class="feat-list">' + (c.list||[]).map(function(li){return '<li>'+li+'</li>';}).join('') + '</ul>'
      + '<a class="btn btn-gold" href="' + c.cta.href + '">' + c.cta.label + ' &rarr;</a></div>';
  }).join('') + '</div>';
}
function mortgageCalc(price) {
  var p = Math.round(price || 1000000);
  return '<div class="mz-card" style="max-width:none"><span class="eyebrow">Estimate the monthly payment</span>'
    + '<div class="mtg-grid">'
    + '<label>Home price<input id="mtgPrice" inputmode="numeric" value="$' + p.toLocaleString() + '"></label>'
    + '<label>Down payment<input id="mtgDown" value="20%"></label>'
    + '<label>Interest rate<input id="mtgRate" value="6.5%"></label>'
    + '<label>Term<select id="mtgTerm"><option value="30">30 years</option><option value="15">15 years</option></select></label>'
    + '</div>'
    + '<div class="mtg-out"><div class="mtg-big" id="mtgPay">&mdash;</div><div class="mtg-sub" id="mtgSub">Principal &amp; interest &middot; estimate only, not a loan offer.</div></div>'
    + '</div>'
    + '<script>(function(){'
    + 'function num(v){return parseFloat((""+v).replace(/[^0-9.]/g,""))||0;}'
    + 'function fmt(x){return "$"+Math.round(x).toLocaleString();}'
    + 'function calc(){'
    + 'var price=num(document.getElementById("mtgPrice").value);'
    + 'var dpRaw=num(document.getElementById("mtgDown").value);'
    + 'var down=dpRaw<=100?price*dpRaw/100:dpRaw;'
    + 'var P=Math.max(0,price-down);'
    + 'var r=num(document.getElementById("mtgRate").value)/100/12;'
    + 'var nM=(num(document.getElementById("mtgTerm").value)||30)*12;'
    + 'var M=r>0?P*r*Math.pow(1+r,nM)/(Math.pow(1+r,nM)-1):P/nM;'
    + 'document.getElementById("mtgPay").textContent=fmt(M)+"/mo";'
    + 'document.getElementById("mtgSub").textContent="Principal & interest on "+fmt(P)+" financed \u00b7 estimate only";'
    + '}'
    + '["mtgPrice","mtgDown","mtgRate","mtgTerm"].forEach(function(id){var e=document.getElementById(id);if(e){e.addEventListener("input",calc);e.addEventListener("change",calc);}});'
    + 'calc();})();</script>';
}
function bookingEmbed() {
  return '<div class="mz-card" style="max-width:none;padding:10px">'
    + '<iframe src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ0YmW2ewto5jxygaskoUd3FL7XJYw4hYFyNMN8X2yHZkXylLjCLgvUo2Hbxq2cVEmDX8l7VRm7Q?gv=true" style="border:0;border-radius:12px;display:block" width="100%" height="600" frameborder="0"></iframe>'
    + '</div>';
}

function tourWidget(l, addr) {
  var cfgJson = JSON.stringify({ mls: l.mls_number, addr: addr });
  return ''
  + '<style>'
  + '.tw-date{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 14px;border:1px solid rgba(0,0,0,.14);border-radius:12px;background:#fff;cursor:pointer;font:inherit}'
  + '.tw-date span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.6}'
  + '.tw-date strong{font-size:15px}'
  + '.tw-date.on{border-color:var(--gold,#b98a2f);box-shadow:0 0 0 2px var(--gold,#b98a2f) inset}'
  + '.tw-slot{padding:10px 6px;border:1px solid rgba(0,0,0,.14);border-radius:10px;background:#fff;cursor:pointer;font:inherit;font-size:14px}'
  + '.tw-slot.on{border-color:var(--gold,#b98a2f);box-shadow:0 0 0 2px var(--gold,#b98a2f) inset;font-weight:700}'
  + '.tw-in{display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:11px 12px;border:1px solid rgba(0,0,0,.16);border-radius:10px;font:inherit;font-size:15px;background:#fff}'
  + '.tw-sum{padding:10px 12px;border-radius:10px;background:rgba(185,138,47,.09);font-size:14px;margin-top:4px}'
  + '.tw-msg{color:#a33;font-size:13px;margin-top:8px;min-height:16px}'
  + '</style>'
  + '<div class="mz-card" style="max-width:none;padding:26px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;justify-content:space-between">'
  +   '<div style="min-width:240px;flex:1">'
  +     '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold,#b98a2f);font-weight:700">Private tour</div>'
  +     '<div style="font-family:var(--serif,Georgia,serif);font-size:22px;margin-top:2px">' + esc(addr) + '</div>'
  +     `<div style="font-size:13px;opacity:.75;margin-top:4px">Pick a time — it goes straight on ${M.agent.first}’s calendar with this address, and you’ll get an instant confirmation.</div>`
  +   '</div>'
  +   '<button class="btn btn-gold" id="twOpenInline" type="button">Pick a date &amp; time</button>'
  + '</div>'
  + '<div id="twOverlay" style="display:none;position:fixed;inset:0;background:rgba(20,18,14,.55);z-index:1000;align-items:flex-start;justify-content:center;overflow-y:auto;padding:4vh 12px">'
  +  '<div style="background:#faf7f2;border-radius:16px;max-width:600px;width:100%;padding:22px 22px 26px;box-shadow:0 24px 60px rgba(0,0,0,.35);position:relative">'
  +   '<button id="twClose" type="button" aria-label="Close" style="position:absolute;top:10px;right:14px;background:none;border:0;font-size:26px;line-height:1;cursor:pointer;opacity:.6">&times;</button>'
  +   '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold,#b98a2f);font-weight:700">Book a private tour</div>'
  +   '<div style="font-family:var(--serif,Georgia,serif);font-size:22px;margin:2px 0 4px">' + esc(addr) + '</div>'
  +   `<div style="font-size:13px;opacity:.7">30 minutes with ${M.agent.name} · times shown in Pacific</div>`
  +   '<div id="twDates" style="display:flex;gap:8px;overflow-x:auto;padding:14px 0 6px"></div>'
  +   '<div id="twSlots" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;margin-top:8px"></div>'
  +   '<div id="twContact" style="display:none;margin-top:16px"></div>'
  +   '<div id="twMsg" class="tw-msg"></div>'
  +   '<div id="twDone" style="display:none;margin-top:8px;text-align:center;padding:18px 6px"></div>'
  +  '</div>'
  + '</div>'
  + '<script>(function(){'
  + 'var CFG=' + cfgJson + ';var DAYS=14;'
  + 'var ov=document.getElementById("twOverlay");var st={date:null,dateEl:null,slot:null,busy:false,inited:false};'
  + 'function el(id){return document.getElementById(id);}'
  + 'function escH(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}'
  + 'function msg(t){el("twMsg").textContent=t||"";}'
  + 'function openM(){ov.style.display="flex";document.body.style.overflow="hidden";if(!st.inited){buildDates();st.inited=true;}}'
  + 'function closeM(){ov.style.display="none";document.body.style.overflow="";}'
  + 'el("twClose").addEventListener("click",closeM);'
  + 'ov.addEventListener("click",function(e){if(e.target===ov)closeM();});'
  + 'var ib=el("twOpenInline");if(ib)ib.addEventListener("click",openM);'
  + 'var hs=document.querySelectorAll("a[href=\\"#tour\\"]");for(var i=0;i<hs.length;i++){hs[i].addEventListener("click",function(e){e.preventDefault();openM();});}'
  + 'function pad(n){return n<10?"0"+n:""+n;}'
  + 'function member(){try{var m=document.cookie.match(/(?:^|; )cbm_member=([^;]*)/);if(!m)return null;var o=JSON.parse(atob(decodeURIComponent(m[1])));return(o&&o.e)?o:null;}catch(e){return null;}}'
  + 'function buildDates(){var w=el("twDates");w.innerHTML="";var t=new Date();'
  +  'for(var i=0;i<DAYS;i++){(function(i){var d=new Date(t.getFullYear(),t.getMonth(),t.getDate()+i);'
  +  'var key=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());'
  +  'var b=document.createElement("button");b.type="button";b.className="tw-date";'
  +  'b.innerHTML="<span>"+d.toLocaleDateString("en-US",{weekday:"short"})+"</span><strong>"+d.toLocaleDateString("en-US",{month:"short",day:"numeric"})+"</strong>";'
  +  'b.addEventListener("click",function(){selDate(key,b);});w.appendChild(b);if(i===0)selDate(key,b);})(i);}}'
  + 'function selDate(key,elm){st.date=key;st.slot=null;msg("");el("twContact").style.display="none";el("twDone").style.display="none";'
  +  'if(st.dateEl)st.dateEl.classList.remove("on");st.dateEl=elm;elm.classList.add("on");'
  +  'var s=el("twSlots");s.innerHTML="<div style=\\"grid-column:1/-1;opacity:.6;padding:8px 0\\">Loading times\u2026</div>";'
  +  'fetch("/api/tour-slots?date="+key).then(function(r){return r.json();}).then(function(res){'
  +   'if(st.date!==key)return;s.innerHTML="";'
  +   'if(!res.slots||!res.slots.length){s.innerHTML="<div style=\\"grid-column:1/-1;opacity:.6;padding:8px 0\\">No times left this day \u2014 try another date.</div>";return;}'
  +   'for(var i=0;i<res.slots.length;i++){(function(sl){var b=document.createElement("button");b.type="button";b.className="tw-slot";b.textContent=sl.label;'
  +   'b.addEventListener("click",function(){var on=s.querySelector(".tw-slot.on");if(on)on.classList.remove("on");b.classList.add("on");st.slot=sl;msg("");showContact();});'
  +   's.appendChild(b);})(res.slots[i]);}'
  +  '}).catch(function(){s.innerHTML="<div style=\\"grid-column:1/-1;opacity:.6;padding:8px 0\\">Couldn\u2019t load times \u2014 refresh and try again.</div>";});}'
  + 'function sumLine(){var d=new Date(st.slot.iso);var ds=d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});'
  +  'return "<strong>"+escH(st.slot.label)+" \u00b7 "+escH(ds)+"</strong><br>"+escH(CFG.addr);}'
  + 'function showContact(){var c=el("twContact");c.style.display="block";var m=member();'
  +  'if(m){c.innerHTML="<div class=\\"tw-sum\\">"+sumLine()+"</div>"'
  +   '+"<div style=\\"margin:10px 0;font-size:14px\\">Booking as <strong>"+escH(m.n||m.e)+"</strong> ("+escH(m.e)+") <a href=\\"#\\" id=\\"twNotYou\\" style=\\"margin-left:6px\\">Not you?</a></div>"'
  +   '+"<button class=\\"btn btn-gold\\" id=\\"twGo\\" type=\\"button\\" style=\\"width:100%\\">Schedule tour</button>";'
  +   'el("twNotYou").addEventListener("click",function(e){e.preventDefault();renderGuest(m);});'
  +   'el("twGo").addEventListener("click",function(){book(m.n||"",m.e,m.p||"",m.u||null);});'
  +  '}else{renderGuest(null);}}'
  + 'function renderGuest(pref){var c=el("twContact");'
  +  'c.innerHTML="<div class=\\"tw-sum\\">"+sumLine()+"</div>"'
  +  '+"<input id=\\"twN\\" class=\\"tw-in\\" autocomplete=\\"name\\" placeholder=\\"Full name\\" value=\\""+(pref&&pref.n?escH(pref.n):"")+"\\">"'
  +  '+"<input id=\\"twE\\" class=\\"tw-in\\" type=\\"email\\" autocomplete=\\"email\\" placeholder=\\"Email\\" value=\\""+(pref&&pref.e?escH(pref.e):"")+"\\">"'
  +  '+"<input id=\\"twP\\" class=\\"tw-in\\" type=\\"tel\\" autocomplete=\\"tel\\" placeholder=\\"Phone (optional)\\">"'
  +  '+"<button class=\\"btn btn-gold\\" id=\\"twGo\\" type=\\"button\\" style=\\"width:100%;margin-top:10px\\">Schedule tour</button>"'
  +  `+"<div style=\\"font-size:13px;opacity:.75;margin-top:10px;text-align:center\\">Have a ${M.city} Market account? <a href=\\"https://app.${M.domain}/signin\\">Sign in</a> and this fills itself in next time.</div>";`
  +  'el("twGo").addEventListener("click",function(){book(el("twN").value.trim(),el("twE").value.trim(),el("twP").value.trim(),null);});}'
  + 'function book(n,e,p,u){if(st.busy)return;if(!st.slot){msg("Pick a time first.");return;}'
  +  'if(!n){msg("Please enter your name.");return;}'
  +  'if(!/^\\S+@\\S+\\.\\S+$/.test(e)){msg("Please enter a valid email.");return;}'
  +  'st.busy=true;var g=el("twGo");if(g){g.disabled=true;g.textContent="Scheduling\u2026";}'
  +  'fetch("/api/book-tour",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mls:CFG.mls,start:st.slot.iso,name:n,email:e,phone:p,user_id:u})})'
  +  '.then(function(r){return r.json();}).then(function(res){st.busy=false;'
  +   'if(res.ok){showDone(res);return;}'
  +   'if(g){g.disabled=false;g.textContent="Schedule tour";}'
  +   'if(res.error==="slot_taken"){msg("That time was just taken \u2014 pick another.");if(st.dateEl)selDate(st.date,st.dateEl);}'
  +   `else{msg("Something went wrong — try another time, or email tim@${M.domain}.");}`
  +  '}).catch(function(){st.busy=false;if(g){g.disabled=false;g.textContent="Schedule tour";}msg("Network hiccup \u2014 please try again.");});}'
  + 'function showDone(res){el("twDates").style.display="none";el("twSlots").style.display="none";el("twContact").style.display="none";msg("");'
  +  'var d=el("twDone");d.style.display="block";'
  +  'd.innerHTML="<div style=\\"font-size:44px;line-height:1;color:var(--gold,#b98a2f)\\">\u2713</div>"'
  +  '+"<div style=\\"font-family:var(--serif,Georgia,serif);font-size:22px;margin-top:8px\\">You\u2019re booked</div>"'
  +  '+"<div style=\\"margin-top:6px;font-size:15px\\"><strong>"+escH(res.when)+"</strong> (Pacific)<br>"+escH(res.address)+"</div>"'
  +  `+"<div style=\\"margin-top:10px;font-size:13px;opacity:.75\\">It’s on ${M.agent.first}’s calendar — a confirmation email is on its way.</div>";}`
  + '})();</script>';
}



/* ---------- page renderers ---------- */

function homeGalleryScript(slug) {
  return `(function(){
    var SB='https://qinuukntpyulqjzndnho.supabase.co';
    var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
    var host=document.getElementById('homeGallery'); if(!host)return;
    var slug=${JSON.stringify(slug)};
    function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    // Pull the linked MLS listing (sold or active) with its rehosted gallery + description
    fetch(SB+'/rest/v1/mls_feed_listings?market_id=eq.${M.id}&property_slug=eq.'+encodeURIComponent(slug)+'&select=mls_number,status,price,beds,baths,sqft,description,photos,photo_count,first_seen&order=first_seen.desc',{headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){return r.ok?r.json():[];})
    .then(function(rows){
      if(!rows||!rows.length)return;
      // prefer a row that actually has photos
      var l=null;
      for(var i=0;i<rows.length;i++){ if(rows[i].photos&&rows[i].photos.length){l=rows[i];break;} }
      if(!l)l=rows[0];
      var photos=(l.photos&&l.photos.length)?l.photos:[];
      if(!photos.length&&!l.description)return; // nothing to add
      var isSold=(l.status==='Sold');

      // 1) Swap the hero: replace Street View 'no imagery' with the real cover
      if(photos.length){
        var hero=document.getElementById('homeHeroPhoto');
        if(hero){
          if(hero.tagName==='IMG'){ hero.src=photos[0]; hero.onerror=null; }
          else { hero.outerHTML='<img class="home-photo" id="homeHeroPhoto" src="'+photos[0]+'" alt="'+esc(slug)+'">'; }
        }
      }

      // 2) Build the gallery + description block (same spirit as the for-sale page)
      var html='<section class="pg home-listing"><div class="wrap">';
      html+='<div class="section-head"><span class="eyebrow">'+(isSold?'Sold listing · MLS '+esc(l.mls_number):'Listing · MLS '+esc(l.mls_number))+'</span>';
      html+='<h2>'+(isSold?'From the sale':'Listing gallery')+' <em>&mdash; as marketed.</em></h2></div>';

      if(photos.length>1){
        html+='<div class="lg-main"><img id="lgMain" src="'+photos[0]+'" alt="listing photo"></div>';
        html+='<div class="lg-thumbs">';
        for(var j=0;j<photos.length;j++){
          html+='<button class="lg-t'+(j===0?' on':'')+'" data-i="'+j+'"><img loading="lazy" src="'+photos[j]+'" alt=""></button>';
        }
        html+='</div>';
        html+='<div class="lg-count"><span id="lgN">1</span> / '+photos.length+'</div>';
      }
      if(l.description){
        html+='<div class="lg-desc"><span class="eyebrow">Listing remarks</span><p>'+esc(l.description)+'</p><div class="lg-attr">Marketing description via MLSListings, as originally published'+(isSold?' at time of sale.':'.')+'</div></div>';
      }
      html+='</div></section>';
      host.innerHTML=html;

      // 3) Wire the gallery swap
      if(photos.length>1){
        var main=document.getElementById('lgMain'), nEl=document.getElementById('lgN'), cur=0;
        function show(i){ cur=(i+photos.length)%photos.length; main.src=photos[cur]; if(nEl)nEl.textContent=cur+1;
          var ts=host.querySelectorAll('.lg-t'); for(var k=0;k<ts.length;k++)ts[k].className='lg-t'+(k===cur?' on':''); }
        host.querySelectorAll('.lg-t').forEach(function(b){ b.addEventListener('click',function(){show(parseInt(b.getAttribute('data-i')));}); });
        if(main)main.addEventListener('click',function(){show(cur+1);});
        document.addEventListener('keydown',function(e){ if(e.key==='ArrowRight')show(cur+1); if(e.key==='ArrowLeft')show(cur-1); });
      }
    }).catch(function(){});
  })();`;
}

function homeMmmScript(slug) {
  return `(function(){
    var SB='https://qinuukntpyulqjzndnho.supabase.co';
    var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
    var host=document.getElementById('homeMmm'); if(!host)return;
    var slug=${JSON.stringify(slug)};
    function money(n){if(n==null)return '';if(n>=1e6){return '$'+(n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'')+'M';}return '$'+Math.round(n/1000)+'K';}
    function esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}
    // 1. Does this home have a live number at all? (price-free public view)
    fetch(SB+'/rest/v1/mmm_public?market_id=eq.${M.id}&property_slug=eq.'+encodeURIComponent(slug)+'&select=address_display,beds,baths,sqft',{headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){return r.ok?r.json():[];})
    .then(function(rows){
      if(!rows||!rows.length)return; // no number on this home
      function locked(){
        host.innerHTML='<section class=\"pg\" style=\"background:var(--chrome);color:var(--chrome-ink)\"><div class=\"wrap\">'+
          '<div class=\"mmm-home-lock\"><div><span class=\"eyebrow\" style=\"color:var(--apricot-soft)\">Off-market \u00b7 Make Me Move</span>'+
          '<h2 style=\"color:var(--chrome-ink);font-size:clamp(1.5rem,3vw,2.1rem)\">The owner named a price <em style=\"color:var(--apricot-soft)\">they\u2019d sell for.</em></h2>'+
          '<p class=\"sub\" style=\"color:#c6cbd6\">This home isn\u2019t listed \u2014 but there\u2019s a private number on it. Create a free account to see it, plus every other Make Me Move price in ${M.city}.</p>'+
          '<p style=\"margin-top:18px\"><button class=\"btn btn-gold\" data-cb-auth=\"signup\">Unlock this number \u2192</button></p></div>'+
          '<div class=\"mmm-home-blur\"><div class=\"mhb-k\">Make Me Move price</div><div class=\"mhb-v\">$\u2588,\u2588\u2588\u2588,\u2588\u2588\u2588</div></div>'+
          '</div></div></section>';
        if(window.CBAuth){/* nav widget wires data-cb-auth */}
      }
      // 2. Use the official Supabase client (loaded by cb-auth-nav module) to check membership.
      function withClient(cb){
        if(window.CBAuth&&window.CBAuth.sb){cb(window.CBAuth.sb);return;}
        var tries=0,iv=setInterval(function(){
          if(window.CBAuth&&window.CBAuth.sb){clearInterval(iv);cb(window.CBAuth.sb);}
          else if(++tries>40){clearInterval(iv);cb(null);}
        },100);
      }
      withClient(function(sb){
        if(!sb){locked();return;}
        sb.auth.getUser().then(function(res){
          var user=res&&res.data?res.data.user:null;
          if(!user){locked();return;}
          sb.from('mmm_listings').select('address_display,price,beds,baths,sqft,note').eq('property_slug',slug).eq('status','live')
          .then(function(q){
            var mm=q&&q.data?q.data:[];
            if(!mm.length){locked();return;}
            var m=mm[0];
        host.innerHTML='<section class=\"pg\" style=\"background:var(--chrome);color:var(--chrome-ink)\"><div class=\"wrap\">'+
          '<div class=\"mmm-home-open\"><div><span class=\"eyebrow\" style=\"color:var(--apricot-soft)\">Off-market \u00b7 Make Me Move \u00b7 members</span>'+
          '<h2 style=\"color:var(--chrome-ink);font-size:clamp(1.6rem,3vw,2.3rem)\">The owner would sell for <em style=\"color:var(--apricot-soft)\">'+money(m.price)+'.</em></h2>'+
          (m.note?'<p class=\"sub\" style=\"color:#c6cbd6\">'+esc(m.note)+'</p>':'')+
          '<p class=\"sub\" style=\"color:#c6cbd6;margin-top:10px\">Not a listing \u2014 a private number. Want to make a move on it? ${M.agent.first} will present a discreet offer on your behalf.</p>'+
          '<p style=\"margin-top:18px\"><a class=\"btn btn-gold\" href=\"/make-me-move/\">Make an offer through ${M.agent.first} \u2192</a></p></div>'+
          '<div class=\"mmm-home-price\"><div class=\"mhb-k\">Make Me Move price</div><div class=\"mhb-v\" style=\"color:var(--apricot-soft)\">'+money(m.price)+'</div></div>'+
          '</div></div></section>';
          }).catch(locked);
        }).catch(locked);
      });
    }).catch(function(){});
  })();`;
}

/* ── Discoverability helpers ─────────────────────────────────────────────
   Search engines and answer engines cite pages that state a specific fact,
   name its scope, and can be placed in a hierarchy. These build both from
   real data only: every Q&A pair is dropped if the number behind it is
   missing, so a thin page emits no FAQ rather than an empty one. */
function crumbLd(M, trail) {
  return { '@type': 'BreadcrumbList', itemListElement: trail.map((t, i) => ({
    '@type': 'ListItem', position: i + 1, name: t.name,
    item: 'https://' + M.domain + t.path })) };
}
function faqLd(pairs) {
  const real = pairs.filter(p => p && p.a);
  if (real.length < 2) return null;      // two answers or it isn't an FAQ
  return { '@type': 'FAQPage', mainEntity: real.map(p => ({
    '@type': 'Question', name: p.q,
    acceptedAnswer: { '@type': 'Answer', text: p.a } })) };
}
/* Sale statistics must carry their window. A median mixing a 1998 sale with a
   2026 one is not what "what have homes sold for" means to a reader or to a
   model quoting the page. Prefer the last 5 years when 3+ sales support it;
   otherwise state the full span explicitly. */
function saleWindowStats(sales) {
  if (!sales || !sales.length) return null;
  const yr = (d) => Number(String(d).slice(0, 4));
  const thisYear = new Date().getUTCFullYear();
  const recent = sales.filter(x => x.sp && x.sd && yr(x.sd) >= thisYear - 5);
  const use = recent.length >= 3 ? recent : sales.filter(x => x.sp && x.sd);
  if (use.length < 3) return null;
  const years = use.map(x => yr(x.sd)).sort((a, b) => a - b);
  const ppsf = use.filter(x => x.sf > 0).map(x => Math.round(x.sp / x.sf));
  return {
    n: use.length,
    med: median(use.map(x => x.sp)),
    medPpsf: ppsf.length >= 3 ? median(ppsf) : null,
    from: years[0], to: years[years.length - 1],
    recent: recent.length >= 3,
  };
}

function ldGraph(nodes) {
  const real = nodes.filter(Boolean);
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': real });
}

function renderHome(p, D) {
  const tract = p.ts ? D.tracts[p.ts] : null;
  const street = p.st ? D.streets[p.st] : null;
  const title = `${p.a}, ${M.city}, CA ${M.zipsLabel} — Home Record | ${M.name}`;
  const descBits = [TYPE[p.t] || 'Home'];
  if (p.b) descBits.push(p.b + ' bed');
  if (p.ba) descBits.push(p.ba + ' bath');
  if (p.sf) descBits.push(num(p.sf) + ' sq ft');
  if (p.yb) descBits.push('built ' + p.yb);
  const desc = `${p.a}, ${M.city} CA ${M.zipsLabel}: ${descBits.join(', ')}.` +
    (p.sp ? ` Last recorded sale ${moneyFull(p.sp)}${p.sd ? ' in ' + p.sd.slice(0, 4) : ''}.` : '') +
    (tract ? ` Located in the ${tract.name} tract.` : '') + ` Full public record on ${M.name}.`;

  // comps: same tract (fallback street), most recent sales, excluding self
  const pool = (p.ts && D.byTract.get(p.ts)) || (p.st && D.byStreet.get(p.st)) || [];
  const comps = pool.filter(x => x.s !== p.s && x.sp && x.sd).sort((a, b) => b.sd.localeCompare(a.sd)).slice(0, 6);

  const recs = [
    [TYPE[p.t] || '—', 'Type'],
    [p.b || '—', 'Beds'], [p.ba || '—', 'Baths'],
    [p.sf ? num(p.sf) : '—', 'Square feet'],
    [p.yb || '—', 'Year built'],
    [p.ev ? money(p.ev) : '—', 'Est. value'],
  ].map(r => `<div class="rec"><div class="n">${r[0]}</div><div class="l">${r[1]}</div></div>`).join('');

  const crumbTrail = [{ name: `${M.city} ${M.zipsLabel}`, path: '/' }];
  if (tract) crumbTrail.push({ name: tract.name, path: `/tract/${p.ts}/` });
  if (street) crumbTrail.push({ name: street.name, path: `/street/${p.st}/` });
  crumbTrail.push({ name: p.a, path: `/home/${p.s}/` });
  const jsonld = ldGraph([
    { '@type': 'SingleFamilyResidence', '@id': `https://${M.domain}/home/${p.s}/#home`,
      name: p.a + `, ${M.city}, CA ${M.zipsLabel}`,
      address: { '@type': 'PostalAddress', streetAddress: p.a, addressLocality: `${M.city}`, addressRegion: 'CA', postalCode: `${M.zipsLabel}` },
      ...(p.y && p.x ? { geo: { '@type': 'GeoCoordinates', latitude: p.y, longitude: p.x } } : {}),
      ...(p.b ? { numberOfBedrooms: p.b } : {}),
      ...(p.ba ? { numberOfBathroomsTotal: p.ba } : {}),
      ...(p.yb ? { yearBuilt: p.yb } : {}),
      ...(p.sf ? { floorSize: { '@type': 'QuantitativeValue', value: p.sf, unitCode: 'FTK' } } : {}) },
    crumbLd(M, crumbTrail),
    faqLd([
      { q: `When did ${p.a} last sell, and for how much?`,
        a: (p.sp && p.sd) ? `${p.a} in ${M.city}, California last sold for ${moneyFull(p.sp)} on ${p.sd}, per ${M.county} County recorded sales.` : null },
      { q: `How big is ${p.a}?`,
        a: (p.sf || p.b) ? `${p.a} is ${[TYPE[p.t] ? (TYPE[p.t] || '').toLowerCase() : null, p.b ? p.b + ' bedroom' : null, p.ba ? p.ba + ' bathroom' : null, p.sf ? num(p.sf) + ' square feet' : null, p.yb ? 'built in ' + p.yb : null].filter(Boolean).join(', ')}.` : null },
      { q: `What neighborhood is ${p.a} in?`,
        a: tract ? `${p.a} is in the ${tract.name} tract of ${M.city}, California${street ? `, on ${street.name}` : ''}.` : null },
    ]),
  ]);

  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / ${tract ? `<a href="/tract/${p.ts}/">${esc(tract.name)}</a> / ` : ''}${street ? `<a href="/street/${p.st}/">${esc(street.name)}</a>` : ''}</div>
  <span class="eyebrow">Home record</span>
  <h1>${esc(p.a)}<em>, ${M.city}</em></h1>
  <p class="sub">${esc(descBits.join(' · '))}${p.sp ? ` · Last recorded sale ${moneyFull(p.sp)}${p.sd ? ' (' + p.sd.slice(0, 4) + ')' : ''}` : ''}</p>
  <div class="rec-grid">${recs}</div>
  ${(() => { const u = photoUrl(p); return u ? `<img class="home-photo" id="homeHeroPhoto" src="${u}" alt="${esc(p.a)}, ${M.city}, CA" loading="lazy" onerror="this.remove()">` : '<div id="homeHeroPhoto"></div>'; })()}
  <div id="homeGallery" data-slug="${esc(p.s)}"></div>
  <div id="pgmap"></div>
</div></header>
<div id="homeMmm" data-slug="${esc(p.s)}"></div>
${comps.length ? `<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">${tract ? esc(tract.name) : street ? esc(street.name) : 'Nearby'}</span>
  <h2>Recent recorded sales <em>around this home.</em></h2></div>
  ${homesTable(comps)}
</div></section>` : ''}
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Do more with this home</span>
  <h2>Put these numbers <em>to work.</em></h2>
  <p class="sub">Every tool an agent uses — free, instant, and saved to your account.</p></div>
  ${featureCards([
    { icon: ICO.chart, title: "Use this as a comp", lead: "Drop this exact sale into a CMA and see how your home stacks up against it.", list: ["This sale pre-loaded as a comparable", "Add more nearby sales in a click", "Instant $/sf value range for your home"], cta: { label: "Compare with a CMA", href: `https://app.${M.domain}/tools/cma` } },
    { icon: ICO.home, title: "Value your home", lead: `Build a full CMA on your own home against the freshest ${M.city} comps.`, list: [`Search every recent sale in ${M.zipsLabel}`, "Agent-style $/sf value range", "Saved to your free account"], cta: { label: "Value your home", href: `https://app.${M.domain}/tools/cma` } },
    { icon: ICO.calc, title: "See what you\'d net", lead: `Run a seller net sheet and see your real proceeds at close — with the $${creditLabel()} credit factored in.`, list: ["Every closing cost, itemized", `Your $${creditLabel()} commission credit applied`, "Know your walk-away number"], cta: { label: "Build a net sheet", href: `https://app.${M.domain}/tools/net-sheet` } },
    { icon: ICO.tag, title: "Set a Make Me Move price", lead: `Name the number that would make you sell — privately. Only ${M.agent.first} sees it. No listing, no obligation.`, list: ["A private price, held quietly", "No listing and no pressure", `${M.agent.first} reaches out only if it's real`], cta: { label: "Set your number", href: `https://app.${M.domain}/signin` } }
  ])}
</div></section>
<script>${homeMmmScript(p.s)}</script>
<script>${homeGalleryScript(p.s)}</script>`;

  return shell(title, desc, `/home/${p.s}/`, body, jsonld,
    mapScript([[p.y, p.x, esc(p.a)]]));
}

function renderStreet(slug, D) {
  const s = D.streets[slug];
  const homes = (D.byStreet.get(slug) || []).slice().sort((a, b) => a.a.localeCompare(b.a, 'en', { numeric: true }));
  const mv = median(homes.map(h => h.ev));
  const sales = homes.filter(h => h.sp);
  const tractSlugs = [...new Set(homes.map(h => h.ts).filter(Boolean))];
  const title = `${s.name}, ${M.city}, CA ${M.zipsLabel} — Every Home & Sale | ${M.name}`;
  const desc = `${s.name} in ${M.city}, CA ${M.zipsLabel}: ${homes.length} homes indexed, ${sales.length} recorded sales, median estimated value ${money(mv)}. Every address on ${s.name}, with full records.`;

  const recs = [
    [num(homes.length), 'Homes on this street'],
    [num(sales.length), 'Recorded sales'],
    [money(mv), 'Median est. value'],
    [tractSlugs.length ? num(tractSlugs.length) : '—', 'Tracts touched'],
  ].map(r => `<div class="rec"><div class="n">${r[0]}</div><div class="l">${r[1]}</div></div>`).join('');

  const sw = saleWindowStats(sales);
  const jsonld = ldGraph([
    { '@type': 'Place', '@id': `https://${M.domain}/street/${slug}/#place`,
      name: s.name + `, ${M.city}, CA ${M.zipsLabel}`,
      address: { '@type': 'PostalAddress', addressLocality: `${M.city}`, addressRegion: 'CA', postalCode: `${M.zipsLabel}` } },
    crumbLd(M, [{ name: `${M.city} ${M.zipsLabel}`, path: '/' }, { name: 'Streets', path: '/streets/' }, { name: s.name, path: `/street/${slug}/` }]),
    faqLd([
      { q: `How many homes are on ${s.name} in ${M.city}?`,
        a: homes.length ? `${num(homes.length)} homes are indexed on ${s.name} in ${M.city}, California, with ${num(sales.length)} recorded sale${sales.length === 1 ? '' : 's'} on file.` : null },
      { q: `What are homes worth on ${s.name}?`,
        a: mv ? `The median estimated value on ${s.name} is ${money(mv)} across ${num(homes.length)} homes. Estimated values are computational estimates, not appraisals.` : null },
      { q: `What have homes sold for on ${s.name}?`,
        a: sw ? `Across ${num(sw.n)} recorded sales on ${s.name} ${sw.recent ? `since ${sw.from}` : `spanning ${sw.from}\u2013${sw.to}`}, the median sale price is ${money(sw.med)}, per ${M.county} County records.` : null },
    ]),
  ]);

  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / <a href="/streets/">Streets</a></div>
  <span class="eyebrow">Street record · ${M.city} ${M.zipsLabel}</span>
  <h1>${esc(s.name)}<em>, indexed.</em></h1>
  <p class="sub">Every home on ${esc(s.name)}, with its record — specs, values, and recorded sales from ${M.county} County public data.</p>
  <div class="rec-grid">${recs}</div>
  ${tractSlugs.length ? `<div class="chip-row">${tractSlugs.map(t => D.tracts[t] ? `<a class="chip" href="/tract/${t}/">${esc(D.tracts[t].name)}</a>` : '').join('')}</div>` : ''}
  <div id="pgmap"></div>
</div></header>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">The homes</span><h2>All ${num(homes.length)} homes on <em>${esc(s.name)}.</em></h2></div>
  ${homesTable(homes)}
</div></section>
<section class="pg"><div class="wrap">
  ${toolCta({
      eyebrow: "Your home on this street",
      lead: "See what your home is worth against every sale on the street — value it with a CMA, or see what you’d net.",
      actions: [
        { label: "Value your home", href: `https://app.${M.domain}/tools/cma` },
        { label: "See your net sheet", href: `https://app.${M.domain}/tools/net-sheet` }
      ]
    })}
</div></section>`;

  return shell(title, desc, `/street/${slug}/`, body, jsonld,
    mapScript(homes.map(h => [h.y, h.x, esc(h.a)])));
}

function renderTract(slug, D) {
  const t = D.tracts[slug];
  const homes = (D.byTract.get(slug) || []).slice().sort((a, b) => a.a.localeCompare(b.a, 'en', { numeric: true }));
  const mv = median(homes.map(h => h.ev));
  const sales = homes.filter(h => h.sp && h.sd).sort((a, b) => b.sd.localeCompare(a.sd));
  const streetSlugs = [...new Set(homes.map(h => h.st).filter(Boolean))].sort((a, b) => (D.streets[a] ? D.streets[a].name : a).localeCompare(D.streets[b] ? D.streets[b].name : b));
  const title = `${t.name} — ${M.city}, CA ${M.zipsLabel} Tract Guide & Home Values | ${M.name}`;
  const desc = `${t.name} in ${M.city}, CA ${M.zipsLabel}: ${homes.length} homes${t.yr ? ', built around ' + t.yr : ''}, median estimated value ${money(mv)}. Every home, street, and recorded sale in the ${t.name} tract.`;

  const recs = [
    [num(homes.length), 'Homes in tract'],
    [money(mv), 'Median est. value'],
    [t.yr || '—', 'Typical year built'],
    [num(streetSlugs.length), 'Streets'],
  ].map(r => `<div class="rec"><div class="n">${r[0]}</div><div class="l">${r[1]}</div></div>`).join('');

  // Recorded-sale facts for this tract, stated only where the sample supports it.
  const tw = saleWindowStats(sales);
  const tLatest = sales.length ? sales[0] : null;
  const jsonld = ldGraph([
    { '@type': 'Place', '@id': `https://${M.domain}/tract/${slug}/#place`,
      name: t.name + `, ${M.city}, CA ${M.zipsLabel}`, description: desc,
      address: { '@type': 'PostalAddress', addressLocality: `${M.city}`, addressRegion: 'CA', postalCode: `${M.zipsLabel}` },
      containedInPlace: { '@type': 'City', name: `${M.city}`, address: { '@type': 'PostalAddress', addressLocality: `${M.city}`, addressRegion: 'CA' } } },
    crumbLd(M, [{ name: `${M.city} ${M.zipsLabel}`, path: '/' }, { name: 'Neighborhoods', path: '/tracts/' }, { name: t.name, path: `/tract/${slug}/` }]),
    faqLd([
      { q: `How many homes are in ${t.name}, ${M.city}?`,
        a: homes.length ? `${num(homes.length)} homes are on record in the ${t.name} tract of ${M.city}, California, across ${num(streetSlugs.length)} street${streetSlugs.length === 1 ? '' : 's'}.` : null },
      { q: `What is the median home value in ${t.name}?`,
        a: mv ? `The median estimated value in ${t.name} is ${money(mv)}, computed across ${num(homes.length)} indexed homes. Estimated values are computational estimates, not appraisals.` : null },
      { q: `What have homes sold for in ${t.name}?`,
        a: tw ? `Across ${num(tw.n)} recorded sales in ${t.name} ${tw.recent ? `since ${tw.from}` : `spanning ${tw.from}\u2013${tw.to}`}, the median sale price is ${money(tw.med)}${tw.medPpsf ? `, or about $${num(tw.medPpsf)} per square foot` : ''}. Figures come from ${M.county} County recorded sales.` : null },
      { q: `When was the most recent sale in ${t.name}?`,
        a: tLatest && tLatest.sd ? `The most recent recorded sale in ${t.name} closed on ${tLatest.sd} at ${moneyFull(tLatest.sp)} (${tLatest.a}).` : null },
      { q: `When was ${t.name} built?`,
        a: t.yr ? `Homes in ${t.name} were typically built around ${t.yr}.` : null },
    ]),
  ]);

  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / <a href="/tracts/">Tracts</a></div>
  <span class="eyebrow">Tract record · ${t.type ? esc(t.type) + ' · ' : ''}${M.city} ${M.zipsLabel}</span>
  <h1>${esc(t.name)}<em>, measured.</em></h1>
  <p class="sub">${esc(t.name)} is a ${t.yr ? 'circa-' + t.yr + ' ' : ''}${M.city} tract of ${num(homes.length)} homes${t.hoa ? ', with ' + esc(t.hoa) : ''}. Every home and recorded sale in it is indexed below.</p>
  <div class="rec-grid">${recs}</div>
  ${streetSlugs.length ? `<div class="chip-row">${streetSlugs.map(sl => D.streets[sl] ? `<a class="chip" href="/street/${sl}/">${esc(D.streets[sl].name)}</a>` : '').join('')}</div>` : ''}
  <div id="pgmap"></div>
</div></header>
${sales.length ? `<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Recorded sales</span><h2>Recent sales in <em>${esc(t.name)}.</em></h2></div>
  ${homesTable(sales.slice(0, 12))}
</div></section>` : ''}
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">The homes</span><h2>All ${num(homes.length)} homes in <em>${esc(t.name)}.</em></h2></div>
  ${homesTable(homes)}
</div></section>
<section class="pg"><div class="wrap">
  ${toolCta({
      eyebrow: "Your home in this neighborhood",
      lead: "Run this neighborhood’s numbers for your home — value it, and see what you’d walk away with.",
      actions: [
        { label: "Value your home", href: `https://app.${M.domain}/tools/cma` },
        { label: "See your net sheet", href: `https://app.${M.domain}/tools/net-sheet` }
      ]
    })}
</div></section>`;

  return shell(title, desc, `/tract/${slug}/`, body, jsonld,
    mapScript(homes.map(h => [h.y, h.x, esc(h.a)])));
}

function renderTractsIndex(D) {
  const entries = Object.entries(D.tracts).sort((a, b) => b[1].n - a[1].n);
  const named = entries.filter(e => !e[1].numbered);
  const numbered = entries.filter(e => e[1].numbered);
  const title = `${M.city}, CA ${M.zipsLabel} Neighborhoods & Tracts | ${M.name}`;
  const desc = `${M.city}'s ${named.length} named neighborhood tracts — ${mktDerived().sf.slice(0,4).join(', ')} and more — each with its homes, streets, values, and sales.`;
  const link = e => `<a href="/tract/${e[0]}/">${esc(e[1].name)} <span>· ${e[1].n} homes${e[1].mv ? ' · ' + money(e[1].mv) : ''}</span></a>`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a></div>
  <span class="eyebrow">The tract index</span>
  <h1>Every tract in ${M.city}, <em>on the record.</em></h1>
  <p class="sub">${named.length} named neighborhood tracts, every one with 10+ homes on record. ${M.city} was built subdivision by subdivision — these are the neighborhoods that matter.</p>
</div></header>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Named tracts</span><h2>The named neighborhoods.</h2></div>
  <div class="idx-cols">${named.map(link).join('')}</div>
</div></section>
${numbered.length ? `<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Numbered tracts</span><h2>County-numbered tracts.</h2></div>
  <div class="idx-cols">${numbered.map(link).join('')}</div>
</div></section>` : ''}`;
  return shell(title, desc, '/tracts/', body, null, null);
}

function renderStreetsIndex(D) {
  const entries = Object.entries(D.streets).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const title = `${M.city}, CA ${M.zipsLabel} Streets — Every Street Indexed | ${M.name}`;
  const desc = `All ${entries.length} streets in ${M.city}, CA ${M.zipsLabel}, each with every home, estimated value, and recorded sale on file.`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a></div>
  <span class="eyebrow">The street index</span>
  <h1>All ${entries.length} streets of ${M.zipsLabel}, <em>A to Z.</em></h1>
  <p class="sub">Every street in ${M.city} has its own record: its homes, its values, its sales.</p>
</div></header>
<section class="pg"><div class="wrap">
  <div class="idx-cols">${entries.map(e => `<a href="/street/${e[0]}/">${esc(e[1].name)} <span>· ${e[1].n} homes</span></a>`).join('')}</div>
</div></section>`;
  return shell(title, desc, '/streets/', body, null, null);
}

function render404() {
  const body = `
<header class="page-hero" style="min-height:70svh"><div class="wrap">
  <span class="eyebrow">404 · Not in the index</span>
  <h1>That page isn't <em>on the record.</em></h1>
  <p class="sub">The address, street, or tract you're looking for isn't at this URL. Start from the map or the indexes.</p>
  <div class="hero-ctas" style="margin-top:28px">
    <a class="btn btn-gold" href="/">Back to the map</a>
    <a class="btn btn-line" href="/tracts/">Browse tracts</a>
    <a class="btn btn-line" href="/streets/">Browse streets</a>
  </div>
</div></header>`;
  return shell(`Page not found — ${M.name}`, 'Page not found.', '/404', body, null, null);
}


/* ---------- public pages ---------- */

const FEE_DISCLAIMER = `<p style="font-size:.74rem;color:var(--slate-dim);line-height:1.7;max-width:64ch;margin-top:18px">Real estate commissions are fully negotiable and are not set by law or by any association. Any fee shown reflects McMullen Properties' own offering only; your actual costs depend on the terms you negotiate.</p>`;

function renderHowItWorks() {
  const title = `How It Works — ${M.name}`;
  const desc = `Every ${M.city} home, open for offers. How buyers pursue any home in ${M.zipsLabel} — listed or not — and how owners come to market on a ladder, not a cliff: Make Me Move, Coming Soon, or Active Listing.`;
  const personaJs = `
(function(){
  var body=document.body;
  function setP(p){
    body.setAttribute('data-persona',p);
    var el=document.getElementById('persona-name');
    if(el)el.textContent=(p==='buyer'?'Buyer view':'Seller view');
    document.querySelectorAll('.persona-card').forEach(function(c){c.classList.toggle('sel',c.getAttribute('data-p')===p);});
    try{sessionStorage.setItem('cb_persona',p);}catch(e){}
  }
  var init='seller';
  try{init=sessionStorage.getItem('cb_persona')||'seller';}catch(e){}
  setP(init);
  document.querySelectorAll('.persona-card').forEach(function(c){
    c.addEventListener('click',function(){setP(c.getAttribute('data-p'));
      var t=document.getElementById('problem'); if(t)t.scrollIntoView({behavior:'smooth'});});
  });
  var sw=document.getElementById('switch-persona');
  if(sw)sw.addEventListener('click',function(e){e.preventDefault();setP(body.getAttribute('data-persona')==='buyer'?'seller':'buyer');});
})();
`;
  const body = `
<header class="page-hero" style="background:radial-gradient(900px 460px at 78% -10%,rgba(217,154,78,.16),transparent 60%),var(--chrome);color:var(--chrome-ink);padding-bottom:64px">
  <div class="wrap">
    <div class="crumbs" style="color:var(--chrome-soft)"><a href="/" style="color:var(--chrome-soft)">${M.city} ${M.zipsLabel}</a></div>
    <span class="eyebrow" style="color:var(--apricot-soft)">How ${M.name} works</span>
    <h1 style="max-width:16ch">Every ${M.city} home. <em style="color:var(--apricot-soft)">Open for offers.</em></h1>
    <p class="sub" style="color:#c6cbd6">Whether you're hunting for the next one or quietly testing a number on the current one — the data, the doors, and the buyers are already here. Pick a side to see the path built for you.</p>
    <div class="persona-picker">
      <div class="persona-card" data-p="buyer"><span class="tick">\u2713</span>
        <div class="im">I'm</div><h3>Buying.</h3>
        <p>Show me every home in every tract, the data behind the price, and how to pursue anything — listed or not.</p>
      </div>
      <div class="persona-card" data-p="seller"><span class="tick">\u2713</span>
        <div class="im">I'm</div><h3>Selling.</h3>
        <p>Show me the three ways to come to market — and why floating a private number costs me nothing.</p>
      </div>
    </div>
  </div>
</header>
<div class="persona-bar"><div class="inner">
  <span class="who">Showing: <strong id="persona-name">\u2014</strong></span>
  <div class="anchors">
    <a href="#problem">The problem</a>
    <a href="#data">The data</a>
    <a href="#how">How it works</a>
    <a href="#playbooks">Playbooks</a>
    <a href="#faq">FAQ</a>
  </div>
  <button class="switch" id="switch-persona">Switch view \u21ba</button>
</div></div>

<section class="pg" id="problem"><div class="wrap">
  <span class="eyebrow">The problem</span>
  <h2 class="only-seller" style="font-size:clamp(1.8rem,3.8vw,2.7rem);max-width:22ch">You don't have to <em>wait until you list.</em></h2>
  <h2 class="only-buyer" style="font-size:clamp(1.8rem,3.8vw,2.7rem);max-width:22ch">You're shopping a market where <em>most homes never list.</em></h2>
  <p class="sub only-seller" style="margin-top:14px">By the time you've signed with an agent and hit the MLS, you've committed weeks, fees, and exposure. What if you could just float a number — the one you'd actually sell for today — and see who shows up?</p>
  <p class="sub only-buyer" style="margin-top:14px">Only a few dozen ${M.city} homes are on the market at any moment — out of ${mktDerived().homes.toLocaleString('en-US')}. The one you want is probably owned by someone who'd sell for the right number. Portals can't reach them. We can.</p>
  <div class="tiles" style="margin-top:36px">
    <div class="tile"><div class="eyebrow" style="margin-bottom:6px">01</div><h3 style="font-size:1.1rem;margin-bottom:8px">Listing is a one-way door</h3><p style="font-size:.9rem;color:var(--slate)">Once you're on Zillow, your home has a public price history. Pull it without a sale and "stale listing" follows you on every future agent's screen for years.</p></div>
    <div class="tile"><div class="eyebrow" style="margin-bottom:6px">02</div><h3 style="font-size:1.1rem;margin-bottom:8px">You don't actually know your price</h3><p style="font-size:.9rem;color:var(--slate)">An agent quotes a range built on citywide comps. Your tract's actual recent $/sf — ${mktDerived().sf[1]} is not ${mktDerived().sf[3]}${contrastPhrase() ? ` is not ${contrastPhrase()}` : ''} — tells a more honest story. We give you both, side by side.</p></div>
    <div class="tile"><div class="eyebrow" style="margin-bottom:6px">03</div><h3 style="font-size:1.1rem;margin-bottom:8px">The right buyer is already here</h3><p style="font-size:.9rem;color:var(--slate)">Serious buyers are watching specific ${M.city} tracts right now. Most will never see your home unless you float a number and let them find you first.</p></div>
  </div>
  <div class="band-dark" data-reveal>
    <div data-reveal-child><div class="n"><span data-count="${mktDerived().homes}" data-comma="1">${mktDerived().homes.toLocaleString('en-US')}</span></div><div class="l">Homes indexed</div></div>
    <div data-reveal-child><div class="n"><span data-count="${mktDerived().sales}" data-comma="1">${mktDerived().sales.toLocaleString('en-US')}</span></div><div class="l">Recorded sales tracked</div></div>
    <div data-reveal-child><div class="n"><span data-count="${mktDerived().named}">${mktDerived().named}</span></div><div class="l">Named neighborhoods</div></div>
    <div data-reveal-child><div class="n gold"><span data-count="${bigValue(mktDerived().totalValue).v}" data-prefix="$" data-suffix="${bigValue(mktDerived().totalValue).suffix}" data-dec="${bigValue(mktDerived().totalValue).dec}">${bigValue(mktDerived().totalValue).text}</span></div><div class="l">Total value indexed</div></div>
  </div>
</div></section>

<section class="pg" id="data" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">The data</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">Every tract, <em>by the numbers.</em></h2>
  <p class="sub" style="margin-top:14px">Know what your tract, your street, and your era of construction actually command. Median $/sf by tract, every recorded sale, and estimates that always show their basis — the full workbench is on the <a href="/intelligence/" style="color:var(--apricot)">intelligence page</a>, free, no account.</p>
  <div class="tiles" style="margin-top:30px">
    <div class="tile"><div class="n">${usdShort(mktDerived().ppsf)}</div><div class="l">Median $/sf citywide, last 24 months</div></div>
    <div class="tile"><div class="n">${usdShort(mktDerived().loPpsf)}\u2013${usdShort(mktDerived().hiPpsf)}</div><div class="l">Tract-level $/sf spread — your tract matters</div></div>
    <div class="tile"><div class="n">${mktDerived().sales12.toLocaleString('en-US')}</div><div class="l">Sales recorded in the last 12 months</div></div>
  </div>
</div></section>

<section class="pg only-buyer" id="how"><div class="wrap">
  <span class="eyebrow">The marketplace \u00b7 for buyers</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">Every home. Every tract. <em>Open to an offer.</em></h2>
  <p class="sub" style="margin-top:14px">This isn't inventory — it's the whole city. Find the home, read its record, and if you're serious, we approach the owner discreetly on your behalf. No pressure on them, no exposure for you.</p>
  <div class="steps" style="max-width:680px;margin-top:20px">
    <div class="step"><div><h4>Find it</h4><p>Browse <a href="/#map" style="color:var(--apricot)">the map</a>, <a href="/tracts/" style="color:var(--apricot)">the tracts</a>, or <a href="/streets/" style="color:var(--apricot)">the streets</a> — every one of ${mktDerived().homes.toLocaleString('en-US')} homes has a record: specs, last sale, tract context.</p></div></div>
    <div class="step"><div><h4>Read the record</h4><p>Request the full file on any home — the comps, the tract math, and what a compelling number actually looks like for that specific house.</p></div></div>
    <div class="step"><div><h4>Express interest</h4><p>An expression of interest, not a lowball: your number and terms, presented to the owner privately by a licensed broker associate. If it compels them, you'll hear back.</p></div></div>
  </div>
</div></section>

<section class="pg only-seller" id="how"><div class="wrap">
  <span class="eyebrow">The three tiers</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">A ladder, <em>not a cliff.</em></h2>
  <p class="sub" style="margin-top:14px;margin-bottom:38px">Three ways to put a home on the market — each with progressively more reach, effort, and commitment. You don't have to start at the top. Most sellers shouldn't.</p>
  <div class="tier">
    <div class="tk">Tier 1 \u00b7 Zero commitment</div>
    <h3>Make Me Move</h3>
    <p>A private number, visible to no one, matched quietly against real buyer demand for your tract. No sign, no listing, no agreement.</p>
    <div class="specs">
      <div><div class="sl">Public</div><div class="sv">No</div><div class="sd">Never on Zillow / Redfin / MLS</div></div>
      <div><div class="sl">Agreement</div><div class="sv">None</div><div class="sd">Adjust or withdraw anytime</div></div>
      <div><div class="sl">Best for</div><div class="sv">Testing</div><div class="sd">"I'd move for the right number"</div></div>
    </div>
    <p style="border:0;padding:16px 0 0;margin:0"><a href="/make-me-move/" style="color:var(--apricot);font-weight:600">Set a Make Me Move price \u2192</a></p>
  </div>
  <div class="tier">
    <div class="tk">Tier 2 \u00b7 Medium reach</div>
    <h3>Coming Soon</h3>
    <p>Off-market in the MLS. Every California agent sees it. The public doesn't.</p>
    <div class="specs">
      <div><div class="sl">Reach</div><div class="sv">~30,000</div><div class="sd">CA agents with MLS access</div></div>
      <div><div class="sl">Agreement</div><div class="sv">Required</div><div class="sd">Non-MLS listing agreement</div></div>
      <div><div class="sl">Public</div><div class="sv">No</div><div class="sd">Not on Zillow / Redfin</div></div>
    </div>
  </div>
  <div class="tier dark">
    <div class="tk">Tier 3 \u00b7 Maximum reach</div>
    <h3>Active Listing</h3>
    <p>Zillow, Redfin, Compass, the works. Roughly 100\u00d7 the reach of Coming Soon.</p>
    <div class="specs">
      <div><div class="sl">Reach</div><div class="sv">~3M+</div><div class="sd">Monthly portal visitors in market</div></div>
      <div><div class="sl">Agreement</div><div class="sv">Full MLS</div><div class="sd">Standard listing contract</div></div>
      <div><div class="sl">Best for</div><div class="sv">Speed</div><div class="sd">Maximum exposure, fastest path</div></div>
    </div>
  </div>
  <p class="sub" style="margin-top:24px">One flat 3% total commission when a sale closes, whichever tier it closes from. Floating a number costs nothing.</p>
  ${FEE_DISCLAIMER}
</div></section>

<section class="pg only-seller" style="background:var(--chrome);color:var(--chrome-ink)"><div class="wrap">
  <span class="eyebrow" style="color:var(--apricot-soft)">The no-brainer</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">Float a number. <em style="color:var(--apricot-soft)">Cost yourself nothing.</em></h2>
  <p class="sub" style="color:#c6cbd6;margin-top:14px">No agreement, no fee, no public record, no obligation to say yes. The only thing a Make Me Move number can do is find you a buyer you weren't going to meet otherwise.</p>
  <p style="margin-top:26px"><a class="btn btn-gold" href="/make-me-move/">Name your number \u2192</a></p>
</div></section>

<section class="pg" id="credit" style="background:var(--chrome);color:var(--chrome-ink)"><div class="wrap">
  <div class="section-head"><span class="eyebrow" style="color:var(--apricot-soft)">Members get $${creditLabel()}</span>
  <h2 style="color:var(--chrome-ink)">Your commission, <em style="color:var(--apricot-soft)">minus ${creditWords()}.</em></h2></div>
  <p class="sub" style="color:#c6cbd6;max-width:60ch">Create a free account and we credit <b style="color:var(--chrome-ink)">$${creditLabel()}</b> toward your next ${M.city} transaction. It parks in your account, never expires, and comes straight off a flat 3% commission when you buy or sell through ${M.name}. Drag to see it on any sale price.</p>
  <div class="credit-calc">
    <div class="cc-price">On a <span id="ccPrice">${usdShort(pb().default)}</span> sale</div>
    <input type="range" id="ccSlider" class="cc-slider" min="${pb().min}" max="${pb().max}" step="${pb().step}" value="${pb().default}" aria-label="Sale price">
    <div class="cc-compare">
      <div class="cc-col trad">
        <div class="cc-col-h">Traditional agent</div>
        <div class="cc-col-rate">5% commission</div>
        <div class="cc-col-v" id="ccTrad">${usdShort(pbTrad())}</div>
        <div class="cc-col-sub">out of your proceeds</div>
      </div>
      <div class="cc-col cbm">
        <div class="cc-col-h">${M.name}</div>
        <div class="cc-col-rate">3% − $${creditLabel()} credit</div>
        <div class="cc-col-v" id="ccNet">${usdShort(pbNet())}</div>
        <div class="cc-col-sub" id="ccNetSub">3% commission minus your credit</div>
      </div>
    </div>
    <div class="cc-save"><span class="cc-save-k">You keep</span><span class="cc-save-v" id="ccSave">${usdShort(pbTrad() - pbNet())}</span><span class="cc-save-note" id="ccSaveNote">more selling with ${M.agent.first}</span></div>
    <p class="cc-read" id="ccRead"></p>
    <div style="text-align:center;margin-top:24px"><button class="btn btn-gold" data-cb-auth="signup">Claim your $${creditLabel()} credit →</button>
    <p style="font-size:.72rem;color:var(--chrome-soft);margin-top:10px">Free account · credit never expires · no obligation to transact</p></div>
  </div>
  <p style="font-size:.68rem;color:var(--chrome-soft);margin-top:20px;max-width:74ch">The $${creditLabel()} is a platform account credit applied toward the costs of a real estate transaction completed through ${M.name} and ${M.agent.name} (CA DRE #${M.agent.dre}, McMullen Properties, under Real Broker). It is not cash, has no cash value, applies only at close, and one credit applies per transaction. Commission is negotiable and set by agreement; 3% is used here for illustration.</p>
</div></section>
<section class="pg only-seller" id="playbooks"><div class="wrap">
  <span class="eyebrow">Special situations</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem);max-width:24ch">Tenant in place? <em>Investor exit?</em> There's a playbook.</h2>
  <p class="sub" style="margin-top:14px;margin-bottom:34px">Two deeper guides for owners whose ${M.city} home is a rental — how to sell with a tenant in place (or unlock a compliant vacancy), and how a 1031 exchange rolls the proceeds into a hands-off asset with the tax deferred.</p>
  <div class="playbook-grid">
    <div class="playbook"><div class="pk">Owner guide</div><h3>Sell with a tenant</h3>
      <p>A tenant isn't a problem — it's a strategy. Occupied-vs-vacant math, compliant paths to possession, and direct access to the investors who already own rentals in ${M.city}.</p>
      <a class="more" href="/how-it-works/sell-with-tenants/">Read the playbook \u2192</a></div>
    <div class="playbook"><div class="pk">Owner guide</div><h3>The 1031 exchange path</h3>
      <p>Stop being a landlord. Roll your rental's full equity into steady, hands-off real estate — and defer every dollar of capital-gains tax along the way.</p>
      <a class="more" href="/how-it-works/1031-exchange/">See how it works \u2192</a></div>
  </div>
</div></section>

<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">The protocol</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">Expressions of Interest, <em>not lowballs.</em></h2>
  <p class="sub" style="margin-top:14px">Every approach runs through one licensed broker associate, privately. Owners see a real number and real terms from a vetted buyer — or they see nothing at all. No spam, no door-knocking, no "we buy houses" postcards. Declining costs nothing and closes nothing; the record stays private either way.</p>
</div></section>

<section class="pg" id="faq"><div class="wrap">
  <span class="eyebrow">Common questions</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">Frequently asked, <em>${M.city} edition.</em></h2>
  <div class="faq" style="max-width:760px;margin-top:26px">
    <details><summary>Is my home "listed" because it appears on this site?</summary><div class="a">No. Your home appears in the index because it exists in ${M.county} County public records — the same records anyone can look up. Nothing on this site states or implies your home is for sale unless you choose to make it so.</div></details>
    <details><summary>Is my data private?</summary><div class="a">Make Me Move numbers and buyer interest are never public — not on Zillow, Redfin, the MLS, or anywhere on this site. Buyer identity reaches an owner only when a real expression of interest is submitted, and owner identity is never shared with buyers browsing the index.</div></details>
    <details><summary>Do I need to sign anything to set a Make Me Move number?</summary><div class="a">No. It's Tier 1 — no listing agreement, no commitment to sell at that price, no obligation to respond to anyone. Adjust, pause, or withdraw the number anytime.</div></details>
    <details><summary>How is this different from a Zestimate?</summary><div class="a">Two ways. The data here is tract-specific — what ${mktDerived().sf[1]} or ${mktDerived().sf[4]} actually traded for, not a citywide algorithm; ${M.city} tracts range from roughly $${mktDerived().loPpsf.toLocaleString('en-US')}/sf to $${mktDerived().hiPpsf.toLocaleString('en-US')}/sf, and averages hide that. And a Make Me Move number is matched against actual buyer demand, not a passive estimate.</div></details>
    <details><summary>Can I pursue a home that isn't listed?</summary><div class="a">Yes — that's the point. Every one of the ${mktDerived().homes.toLocaleString('en-US')} homes in the index accepts an expression of interest. The owner doesn't need a listing or an agent for you to raise your hand. If your number compels them, you'll hear back.</div></details>
    <details><summary>What if I already have an agent?</summary><div class="a">Bring them. The index and the records are open; your agent can work alongside everything here and represent you through any eventual transaction.</div></details>
    <details><summary>Where do the numbers come from?</summary><div class="a">${M.county} County assessor and recorder data, plus MLS sale records, refreshed twice daily. Estimates are computational, not appraisals — the full sourcing is on the <a href="/methodology/" style="color:var(--apricot)">methodology page</a>.</div></details>
  </div>
</div></section>

<section class="pg only-seller" id="signup"><div class="wrap">
  <div class="cma-split">
    ${toolCta({
      eyebrow: "Try it yourself",
      lead: "Every tool an agent uses — free. Value your home, run the comps, and see your net sheet.",
      actions: [
        { label: "Value your home", href: `https://app.${M.domain}/tools/cma` },
        { label: "See your net sheet", href: `https://app.${M.domain}/tools/net-sheet` }
      ]
    })}
    <div class="cma-call">
      <span class="eyebrow">Prefer to talk it through?</span>
      <h3>Book 20 minutes with <em>${M.agent.first}.</em></h3>
      <p>Walk through your valuation live over Zoom — the numbers, your options across the three ways to come to market, and any questions. No pressure, no listing pitch.</p>
      <a class="btn btn-line" href="https://calendar.app.google/m126oXA4MjDrMNnV8" target="_blank" rel="noopener">Schedule a Zoom call →</a>
      <p class="cma-fine">${M.agent.name} · CA DRE #${M.agent.dre} · McMullen Properties, under Real Broker</p>
    </div>
  </div>
</div></section>
<section class="pg only-buyer" id="signup-buyer"><div class="wrap">
  ${toolCta({
      eyebrow: "Start with any home",
      lead: `Have your eye on a ${M.city} home — listed or not? Build a CMA to see what it’s worth, and get a disclosure review before you offer.`,
      actions: [
        { label: "Build a CMA", href: `https://app.${M.domain}/tools/cma` },
        { label: "Request a disclosure review", href: `https://app.${M.domain}/tools/review` }
      ]
    })}
</div></section>
<script>${personaJs}</script>\n<script>(function(){\n  var s=document.getElementById('ccSlider'); if(!s)return;\n  var CBM=0.03, TRAD=0.05, CREDIT=${M.creditUsd};\n  function money(n){return '$'+Math.round(n).toLocaleString('en-US');}\n  function upd(){\n    var pv=Number(s.value);\n    var trad=pv*TRAD, gross=pv*CBM, net=Math.max(0,gross-CREDIT), save=trad-net;\n    var pct=((pv-s.min)/(s.max-s.min))*100; s.style.setProperty('--pct',pct+'%');\n    document.getElementById('ccPrice').textContent=money(pv);\n    document.getElementById('ccTrad').textContent=money(trad);\n    document.getElementById('ccNet').textContent=money(net);\n    document.getElementById('ccSave').textContent=money(save);\n    var sub=document.getElementById('ccNetSub');\n    sub.textContent = (gross<=CREDIT) ? 'credit covers the full commission' : '3% commission minus your $${creditLabel()} credit';\n    var read=document.getElementById('ccRead');\n    read.innerHTML='A traditional 5% agent charges <b>'+money(trad)+'</b>. Through ${M.name} you pay <b>'+money(net)+'</b> — keeping <b>'+money(save)+'</b> more.';\n  }\n  s.addEventListener('input',upd); upd();\n})();</script>`;
  return shell(title, desc, '/how-it-works/', body, null, null);
}

function renderSellWithTenants() {
  const title = `Sell a Tenant-Occupied Home in ${M.city} — The Playbook | ${M.name}`;
  const desc = `A tenant isn't a problem — it's a strategy. How ${M.city} rental owners sell with a tenant in place, unlock a compliant vacancy, or hand the keys to an investor who wants the tenant to stay.`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / <a href="/how-it-works/">How it works</a></div>
  <span class="eyebrow">Owner guide \u00b7 Tenant-occupied</span>
  <h1 style="max-width:18ch">A tenant isn't a problem. <em>It's a strategy.</em></h1>
  <p class="sub">Most agents treat a tenant as an obstacle to clear before the sign goes up. The right buyer treats a good tenant as the asset — in-place income from day one. This playbook covers both roads.</p>
</div></header>
<section class="pg"><div class="wrap">
  <span class="eyebrow">The math first</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">What is your rental <em>actually yielding?</em></h2>
  <p class="sub" style="margin-top:14px">The median ${M.city} home is now worth about $1.88M. Run your own numbers: a year of your current rent, minus taxes, insurance, maintenance, and vacancies, divided by what the home would sell for today. For many long-held ${M.city} rentals that figure lands painfully low — the equity has outgrown the rent. That's the moment this playbook exists for.</p>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">The two roads</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">Two paths. One goal: <em>your top dollar.</em></h2>
  <div class="playbook-grid" style="margin-top:30px">
    <div class="playbook"><div class="pk">Path A</div><h3>Sell occupied, to an investor</h3>
      <p>The buyer wants the tenant. No vacancy, no make-ready costs, no showings circus — the lease and the income transfer with the deed. ${M.city}'s index shows 2,187 absentee-owned homes: a real, reachable pool of investors who already own rentals here and understand the asset.</p></div>
    <div class="playbook"><div class="pk">Path B</div><h3>Unlock a compliant vacancy, sell retail</h3>
      <p>When the retail premium justifies it: a lawful, properly-noticed path to possession — California and any local tenant-protection rules followed to the letter, relocation obligations handled openly — then prepare and sell to an owner-occupant at full retail.</p></div>
  </div>
  <p class="sub" style="margin-top:26px">Which road nets more is arithmetic, not philosophy — occupied price versus retail price minus vacancy cost, make-ready, time, and any relocation obligation. We run both columns before recommending either.</p>
</div></section>
<section class="pg"><div class="wrap">
  <span class="eyebrow">The buyers</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">We don't list and hope. <em>We already know the buyers.</em></h2>
  <p class="sub" style="margin-top:14px">The ${M.city} index maps every absentee-owned home in ${M.zipsLabel} — the investors who already own here and add when the numbers work. A tenant-occupied sale can move quietly, owner to owner, without a public listing ever existing.</p>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">The tax question</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">Don't hand the gain <em>to the IRS.</em></h2>
  <p class="sub" style="margin-top:14px">Selling a long-held rental can trigger a six-figure capital-gains bill — unless the proceeds roll forward through a 1031 exchange into new investment property, tax deferred. If exiting landlording is the real goal, read the companion guide: <a href="/how-it-works/1031-exchange/" style="color:var(--apricot)">the 1031 exchange path \u2192</a></p>
</div></section>
<section class="pg"><div class="wrap">
  ${toolCta({
      eyebrow: "Run your numbers",
      lead: `See the full picture on any ${M.city} property — value it, and model exactly what you’d net.`,
      actions: [
        { label: "Value your home", href: `https://app.${M.domain}/tools/cma` },
        { label: "See your net sheet", href: `https://app.${M.domain}/tools/net-sheet` }
      ]
    })}
  <p style="font-size:.72rem;color:var(--slate-dim);margin-top:18px;max-width:70ch">This guide is general information, not legal or tax advice. Tenancy terminations are governed by California law and any applicable local ordinances; consult a landlord-tenant attorney before acting, and a CPA or qualified intermediary on any tax matter.</p>
</div></section>`;
  return shell(title, desc, '/how-it-works/sell-with-tenants/', body, null, null);
}

function render1031() {
  const title = `The 1031 Exchange Path for ${M.city} Rental Owners | ${M.name}`;
  const desc = `Stop being a landlord, keep the equity working: how a 1031 exchange sells your ${M.city} rental, defers every dollar of capital-gains tax, and rolls the proceeds into hands-off real estate.`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / <a href="/how-it-works/">How it works</a></div>
  <span class="eyebrow">Owner guide \u00b7 1031 exchange</span>
  <h1 style="max-width:18ch">Stop being a landlord. <em>Start being an investor.</em></h1>
  <p class="sub">Being a landlord is a job you didn't mean to take. Your ${M.city} rental's equity doesn't have to keep employing you — a 1031 exchange moves it, tax-deferred, into real estate that doesn't call at midnight.</p>
</div></header>
<section class="pg"><div class="wrap">
  <span class="eyebrow">What it does</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">Everything a 1031 exchange <em>actually does.</em></h2>
  <p class="sub" style="margin-top:14px">Section 1031 of the tax code lets you sell investment property and reinvest the proceeds in like-kind investment property while deferring capital-gains tax — federal and California — that would otherwise come due at sale. On a long-held ${M.city} rental, that deferral routinely keeps six figures working for you instead of leaving in April.</p>
  <div class="tiles" style="margin-top:30px">
    <div class="tile"><div class="n">45 days</div><div class="l">To identify replacement property after your sale closes</div></div>
    <div class="tile"><div class="n">180 days</div><div class="l">To close on the replacement — hard federal deadlines</div></div>
    <div class="tile"><div class="n">100%</div><div class="l">Of the gain deferred when the exchange is done right</div></div>
  </div>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">Truly hands-off</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">Want passive? Exchange into a <em>Delaware Statutory Trust.</em></h2>
  <p class="sub" style="margin-top:14px">A DST is fractional ownership of institutional real estate — apartment communities, medical, industrial — that qualifies as 1031 replacement property. No tenants, no toilets, no 2am calls: distributions arrive, management is professional, and the deferral holds. It's how many long-time landlords finally retire from landlording without triggering the tax.</p>
</div></section>
<section class="pg"><div class="wrap">
  <span class="eyebrow">The process</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">How the exchange runs, <em>start to finish.</em></h2>
  <div class="steps" style="max-width:680px;margin-top:20px">
    <div class="step"><div><h4>Line up the exchange before you sell</h4><p>A qualified intermediary (QI) must be engaged before closing — proceeds can never touch your hands, or the exchange dies.</p></div></div>
    <div class="step"><div><h4>Sell the ${M.city} rental</h4><p>Occupied or vacant — the tenant playbook and this one work together. Proceeds go straight to the QI.</p></div></div>
    <div class="step"><div><h4>Identify within 45 days</h4><p>Name the replacement property (or DST) in writing under the identification rules.</p></div></div>
    <div class="step"><div><h4>Close within 180 days</h4><p>The QI funds the purchase; the gain rides forward, deferred in full.</p></div></div>
  </div>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  ${toolCta({
      eyebrow: "Run your numbers",
      lead: `See the full picture on any ${M.city} property — value it, and model exactly what you’d net.`,
      actions: [
        { label: "Value your home", href: `https://app.${M.domain}/tools/cma` },
        { label: "See your net sheet", href: `https://app.${M.domain}/tools/net-sheet` }
      ]
    })}
  <p style="font-size:.72rem;color:var(--slate-dim);margin-top:18px;max-width:70ch">This guide is general information, not tax or investment advice. 1031 exchanges have strict rules and deadlines; DSTs are securities offered through licensed channels and involve risk. Engage a qualified intermediary and consult your CPA before acting.</p>
</div></section>`;
  return shell(title, desc, '/how-it-works/1031-exchange/', body, null, null);
}

function renderMakeMeMove() {
  const mmD = mktDerived();
  const mmT = M.mmmTeaser;
  const mmEx  = mmT ? mmT.ex : 'a ' + mmD.sf[0] + ' 4-bed';
  const mmR1a = mmT ? mmT.ex : mmD.sf[0] + ' · 4 bd';
  const mmR1p = mmT ? mmT.mask : '$█,███,███';
  const mmR3a = (mmT ? mmD.sf[3].replace(/\s+Manor$/, '') : mmD.sf[1]) + ' · 4 bd';
  const title = `Make Me Move — Name Your Price | ${M.name}`;
  const desc = `Set a Make Me Move price on your ${M.city} home: the number you'd actually sell for. No listing, no lockbox, no open house — buyers see your price, never your name.`;

  const pageJs = `
function openMmsModal(){
  document.getElementById('mf-thanks').style.display='none';
  document.getElementById('mms-form-wrap').style.display='block';
  document.getElementById('mms-modal-bg').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeMmsModal(){
  document.getElementById('mms-modal-bg').classList.remove('open');
  document.body.style.overflow='';
}
document.getElementById('mms-modal-bg').addEventListener('click',function(e){if(e.target===this)closeMmsModal();});
function fmtMfP(inp){
  var n=parseInt(inp.value.replace(/\\D/g,''));
  if(!isNaN(n)&&n>0)inp.value='$'+n.toLocaleString();
}
function submitMms(){
  var name=document.getElementById('mf-name').value.trim();
  var email=document.getElementById('mf-email').value.trim();
  var addr=document.getElementById('mf-addr').value.trim();
  var beds=document.getElementById('mf-beds').value;
  var baths=document.getElementById('mf-baths').value;
  var sqft=document.getElementById('mf-sqft').value;
  var price=parseInt(document.getElementById('mf-price').value.replace(/\\D/g,''))||0;
  var notes=document.getElementById('mf-notes').value.trim();
  var err=document.getElementById('mf-err');
  err.style.display='none';
  if(!email||!addr||!price){err.textContent='Email, address, and your price are required.';err.style.display='block';return;}
  var btn=document.getElementById('mf-btn');
  btn.disabled=true;btn.textContent='Saving\u2026';
  var msg='MMM: '+addr+', ${M.city} ${M.zipsLabel}';
  if(beds)msg+=' \u00b7 '+beds+' bd';
  if(baths)msg+=' \u00b7 '+baths+' ba';
  if(sqft)msg+=' \u00b7 '+sqft+' sf';
  if(notes)msg+=' \u00b7 '+notes;
  window.CBLead.submit({email:email,name:name,intent:'mmm_price',target_price:price,message:msg,source:'make_me_move_page'})
    .then(function(){
      document.getElementById('mms-form-wrap').style.display='none';
      document.getElementById('mf-thanks').style.display='block';
      btn.disabled=false;btn.textContent='Set my price \u2192';
    })
    .catch(function(){
      err.textContent='That did not go through \u2014 check the email address and try again.';
      err.style.display='block';
      btn.disabled=false;btn.textContent='Set my price \u2192';
    });
}
document.getElementById('mf-btn').addEventListener('click',submitMms);
`;
  const mmsCss = `
.mms-hero{background:radial-gradient(900px 460px at 78% -10%,rgba(217,154,78,.18),transparent 60%),var(--chrome);color:var(--chrome-ink);padding:150px 24px 74px;text-align:center}
body.has-ticker .mms-hero{padding-top:184px}
.mms-hero-inner{max-width:820px;margin:0 auto}
.mms-hero-ey{font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.2em;text-transform:uppercase;color:var(--apricot-soft);margin-bottom:18px}
.mms-hero-title{font-size:clamp(2.3rem,6vw,4rem);line-height:1.08}
.mms-hero-title em{color:var(--apricot-soft);font-style:italic}
.mms-hero-sub{color:#c6cbd6;font-size:1.08rem;max-width:56ch;margin:22px auto 34px}
.mms-hero-ctas{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.btn-ghost{display:inline-block;padding:13px 26px;border-radius:999px;font-size:.92rem;font-weight:600;border:1px solid rgba(236,231,219,.4);color:var(--chrome-ink)}
.btn-ghost:hover{border-color:var(--chrome-ink)}
.mms-numbers{background:var(--chrome-2);border-top:1px solid var(--chrome-line);border-bottom:1px solid var(--chrome-line)}
.mms-nums-inner{max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:34px 24px}
@media(max-width:640px){.mms-nums-inner{grid-template-columns:1fr;text-align:center}}
.mms-num-v{font-family:'Playfair Display',serif;font-size:2.3rem;color:var(--chrome-ink)}
.mms-num-v span{color:var(--apricot-soft)}
.mms-num-l{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--chrome-soft);margin-top:6px}
.mms-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:36px}
.mms-step{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.mms-step .sn{font-family:'Playfair Display',serif;font-size:2rem;color:var(--apricot)}
.mms-step h3{font-size:1.14rem;margin:10px 0 8px}
.mms-step p{font-size:.9rem;color:var(--slate)}
.mms-tl{max-width:760px;margin-top:34px}
.mms-tl-row{display:grid;grid-template-columns:52px 1fr auto;gap:18px;padding:22px 0;border-bottom:1px solid var(--line);align-items:start}
.mms-tl-row:last-child{border-bottom:0}
.mms-tl-n{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--apricot)}
.mms-tl-row h4{font-family:'Playfair Display',serif;font-weight:500;font-size:1.08rem;margin-bottom:5px}
.mms-tl-row p{font-size:.9rem;color:var(--slate);max-width:56ch}
.mms-tl-when{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:var(--slate-dim);white-space:nowrap;padding-top:8px}
@media(max-width:600px){.mms-tl-row{grid-template-columns:44px 1fr}.mms-tl-when{display:none}}
.fee-wrap{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:36px}
@media(max-width:760px){.fee-wrap{grid-template-columns:1fr}}
.fee-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.fee-card .fp{font-family:'Playfair Display',serif;font-size:2.4rem;color:var(--apricot)}
.fee-card h4{font-size:1.05rem;margin:6px 0 8px;font-family:'Playfair Display',serif;font-weight:500}
.fee-card p{font-size:.88rem;color:var(--slate)}
.fee-always{background:var(--chrome);color:var(--chrome-ink);border-radius:14px;padding:30px;margin-top:18px;display:flex;gap:26px;align-items:center;flex-wrap:wrap}
.fee-always-pct{font-family:'Playfair Display',serif;font-size:3.4rem;color:var(--apricot-soft)}
.fee-always p{color:#c6cbd6;font-size:.92rem;max-width:56ch}
.mms-quotes{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:36px}
@media(max-width:700px){.mms-quotes{grid-template-columns:1fr}}
.mms-quote{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:30px;box-shadow:0 1px 2px rgba(28,26,20,.04)}
.mms-quote .qq{font-family:'Playfair Display',serif;font-size:2.4rem;color:var(--apricot);line-height:.5;display:block;margin-bottom:14px}
.mms-quote p{font-size:1rem;color:var(--ivory);font-family:'Playfair Display',serif;line-height:1.5}
.mms-quote .who{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--slate-dim);margin-top:16px}
.mms-modal-bg{position:fixed;inset:0;background:rgba(12,15,21,.72);z-index:1000;display:none;align-items:flex-start;justify-content:center;padding:6vh 18px;overflow-y:auto;backdrop-filter:blur(4px)}
.mms-modal-bg.open{display:flex}
.mms-modal{background:var(--card);border:1px solid var(--line);border-radius:16px;max-width:560px;width:100%;padding:34px;position:relative;box-shadow:0 30px 80px rgba(10,12,18,.4)}
.mms-modal .x{position:absolute;top:14px;right:18px;background:none;border:0;font-size:1.5rem;color:var(--slate-dim);cursor:pointer;line-height:1}
.mms-modal h3{font-size:1.5rem;margin-bottom:6px}
.mms-modal .ms{font-size:.86rem;color:var(--slate);margin-bottom:20px}
.mms-f{display:flex;flex-direction:column;gap:10px}
.mms-f input,.mms-f textarea{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px 14px;color:var(--ivory);font-family:'DM Sans',sans-serif;font-size:.92rem;width:100%}
.mms-f input:focus,.mms-f textarea:focus{outline:none;border-color:var(--apricot-soft)}
.mms-f3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.mms-f textarea{min-height:64px;resize:vertical}
`;
  const body = `
<style>` + mmsCss + `</style>
<section class="mms-hero" data-reveal>
  <div class="mms-hero-inner">
    <div class="mms-hero-ey" data-reveal-child>${M.name} · Make Me Move</div>
    <h1 class="mms-hero-title" data-reveal-child>Name the price<br>you'd <em data-tw>actually</em> sell for.</h1>
    <p class="mms-hero-sub" data-reveal-child>Set a Make Me Move price on your ${M.city} home. Signal you're open to the right offer — without a listing, lockbox, or open house.</p>
    <div class="mms-hero-ctas" data-reveal-child>
      <button class="btn btn-gold" onclick="openMmsModal()">Set my price →</button>
      <a href="/#map" class="btn-ghost">Browse ${M.city} homes</a>
    </div>
  </div>
</section>
<div class="mms-numbers">
  <div class="mms-nums-inner" data-reveal>
    <div class="mms-num" data-reveal-child><div class="mms-num-v"><span data-count="3" data-suffix="%">3%</span></div><div class="mms-num-l">Flat fee — always</div></div>
    <div class="mms-num" data-reveal-child><div class="mms-num-v"><span data-count="${mktDerived().homes}" data-comma="1">${mktDerived().homes.toLocaleString('en-US')}</span></div><div class="mms-num-l">${M.city} homes tracked</div></div>
    <div class="mms-num" data-reveal-child><div class="mms-num-v"><span data-count="0" data-prefix="$">$0</span></div><div class="mms-num-l">To list. No obligation.</div></div>
  </div>
</div>
<section class="pg" style="background:var(--chrome);color:var(--chrome-ink)"><div class="wrap">
  <div class="split">
    <div>
      <span class="eyebrow" style="color:var(--apricot-soft)">Members only</span>
      <h2 style="color:var(--chrome-ink)">See what ${M.city} owners <em style="color:var(--apricot-soft)">will sell for.</em></h2>
      <p class="sub" style="color:#c6cbd6;margin-top:14px">Named prices, off-market — including <b style="color:var(--chrome-ink)">${mmEx}</b> and every other home an owner has priced privately. Free account, <b style="color:var(--apricot-soft)">$${creditLabel()} credit</b>, numbers unlock instantly.</p>
      <p style="margin-top:22px"><button class="btn btn-gold" data-cb-auth="signup">Unlock the numbers →</button></p>
    </div>
    <div class="mmm-locked-card">
      <div class="mlc-row"><span class="mlc-ad">${mmR1a}</span><span class="mlc-pr">${mmR1p}</span></div>
      <div class="mlc-row"><span class="mlc-ad">Downtown · 3 bd</span><span class="mlc-pr">$█,███,███</span></div>
      <div class="mlc-row"><span class="mlc-ad">${mmR3a}</span><span class="mlc-pr">$█,███,███</span></div>
      <div class="mlc-lock">🔒 Members see real numbers</div>
    </div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  <span class="eyebrow">How Make Me Move works</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem);max-width:24ch">Your home is always for sale — <em>for the right price.</em></h2>
  <p class="sub" style="margin-top:14px">Make Me Move lets you put a number on that without committing to anything.</p>
  <div class="mms-steps" data-reveal>
    <div class="mms-step" data-reveal-child><div class="sn">1</div><h3>Set your price</h3><p>Enter the price you'd accept. Buyers see your number — not your name or contact details. Raise it, lower it, or remove it anytime. Never a commitment to sell.</p></div>
    <div class="mms-step" data-reveal-child><div class="sn">2</div><h3>Buyers find you</h3><p>Your number is matched against the buyers watching your tract on ${M.name} — seen alongside recent sales data for context, never with your identity.</p></div>
    <div class="mms-step" data-reveal-child><div class="sn">3</div><h3>Handled end-to-end</h3><p>When a buyer submits an offer, ${M.agent.name} (CA DRE #${M.agent.dre}) reviews it, schedules an offer call, and presents it to you — shielding your identity until there's mutual interest.</p></div>
  </div>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">The protocol</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">From offer <em>to close.</em></h2>
  <p class="sub" style="margin-top:14px">Every offer follows the same 5-step process — transparent, documented, protected under California law.</p>
  <div class="mms-tl">
    <div class="mms-tl-row" data-reveal-self><div class="mms-tl-n">1</div><div><h4>Offer submitted — LOI drafted</h4><p>The buyer's offer details are formatted into a non-binding Letter of Intent addressed to the home's owner of record per county tax records.</p></div><div class="mms-tl-when">Immediate</div></div>
    <div class="mms-tl-row" data-reveal-self><div class="mms-tl-n">2</div><div><h4>Offer review call</h4><p>A short call to review the offer terms with the buyer, align on price and conditions, and answer any questions — before anything moves forward.</p></div><div class="mms-tl-when">Within 24 hrs</div></div>
    <div class="mms-tl-row" data-reveal-self><div class="mms-tl-n">3</div><div><h4>LOI signed via Glide</h4><p>The finalized LOI is sent to the buyer for e-signature via Glide — authorizing McMullen Properties to formally present the offer on the buyer's behalf.</p></div><div class="mms-tl-when">After call</div></div>
    <div class="mms-tl-row" data-reveal-self><div class="mms-tl-n">4</div><div><h4>Offer delivered to you</h4><p>The signed LOI is presented directly to you. You see the offer price, terms, and financing — but not the buyer's contact information. McMullen Properties manages the dialogue until there's mutual interest.</p></div><div class="mms-tl-when">After signing</div></div>
    <div class="mms-tl-row" data-reveal-self><div class="mms-tl-n">5</div><div><h4>You decide — then a standard close</h4><p>Accept, counter, or pass; declining costs nothing. Accept, and it becomes a standard CAR purchase contract through escrow, handled start to finish.</p></div><div class="mms-tl-when">Your call</div></div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  <span class="eyebrow">Fees</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">One flat fee. <em>Always 3%.</em></h2>
  <div class="fee-wrap" data-reveal>
    <div class="fee-card" data-reveal-child>
      <div class="fp">3%</div>
      <h4>Platform fee</h4>
      <p>Covers full facilitation by McMullen Properties — LOI, CAR purchase contract, and close of escrow. Setting a price costs nothing; the fee exists only when a sale closes.</p>
    </div>
    <div class="fee-card" data-reveal-child>
      <div class="fp">1%</div>
      <h4>If the buyer nominates an agent</h4>
      <p>1% of the platform fee is allocated to the buyer's nominated agent. Your total cost as seller stays 3% — never added on top.</p>
    </div>
  </div>
  <div class="fee-always" data-reveal-self>
    <div class="fee-always-pct"><span data-count="3" data-suffix="%">3%</span></div>
    <div><h4 style="font-family:'Playfair Display',serif;font-weight:500;font-size:1.1rem;margin-bottom:6px">The fee is always 3%. The split just changes.</h4>
    <p>If the buyer nominates an agent, 1% of that 3% is paid to their agent. The seller always pays exactly 3%.</p></div>
  </div>
  <div class="credit-calc" style="background:var(--bg-2);border-color:var(--line);margin-top:30px">
    <div class="cc-price" style="color:var(--ivory)">On a <span id="mmPrice" style="color:var(--apricot)">${usdShort(pb().default)}</span> sale</div>
    <input type="range" id="mmSlider" class="cc-slider cc-slider-light" min="${pb().min}" max="${pb().max}" step="${pb().step}" value="${pb().default}" aria-label="Sale price">
    <div class="cc-compare">
      <div class="cc-col trad" style="background:var(--card)">
        <div class="cc-col-h" style="color:var(--slate-dim)">Traditional agent</div>
        <div class="cc-col-rate" style="color:var(--slate)">5% commission</div>
        <div class="cc-col-v" id="mmTrad" style="color:var(--ivory)">${usdShort(pbTrad())}</div>
        <div class="cc-col-sub" style="color:var(--slate-dim)">out of your proceeds</div>
      </div>
      <div class="cc-col cbm">
        <div class="cc-col-h">${M.name}</div>
        <div class="cc-col-rate">3% − $${creditLabel()} credit</div>
        <div class="cc-col-v" id="mmNet">${usdShort(pbNet())}</div>
        <div class="cc-col-sub" id="mmNetSub">3% commission minus your credit</div>
      </div>
    </div>
    <div class="cc-save"><span class="cc-save-k">You keep</span><span class="cc-save-v" id="mmSave">${usdShort(pbTrad() - pbNet())}</span><span class="cc-save-note">more selling with ${M.agent.first}</span></div>
    <p class="cc-read" id="mmRead" style="color:var(--slate)"></p>
    <div style="text-align:center;margin-top:24px"><button class="btn btn-gold" data-cb-auth="signup">Claim your $${creditLabel()} credit →</button>
    <p style="font-size:.72rem;color:var(--slate-dim);margin-top:10px">Free account · credit never expires · no obligation to transact</p></div>
  </div>
  ${FEE_DISCLAIMER}
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">Sold on your terms</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">It works because <em>nothing is forced.</em></h2>
  <div class="mms-quotes" data-reveal>
    <div class="mms-quote" data-reveal-child><span class="qq">“</span><p>I set the price I would sell for, and received an offer at that exact price two months later. Didn't have to move out or do a thing.</p><div class="who">Heather &amp; Jason · Sellers</div></div>
    <div class="mms-quote" data-reveal-child><span class="qq">“</span><p>We submitted an offer on a home that was never on the market and bought it without any competition. Awesome concept.</p><div class="who">Emily · Buyer</div></div>
  </div>
  <div style="margin-top:38px;display:flex;gap:14px;flex-wrap:wrap">
    <button class="btn btn-gold" onclick="openMmsModal()">Set my price →</button>
    <a href="/#map" class="btn-ghost" style="border-color:var(--line);color:var(--ivory)">Browse homes</a>
  </div>
</div></section>
<div class="mms-modal-bg" id="mms-modal-bg">
  <div class="mms-modal">
    <button class="x" onclick="closeMmsModal()" aria-label="Close">×</button>
    <div id="mms-form-wrap">
      <h3>Set your Make Me Move price</h3>
      <p class="ms">Private until there's a real offer. ${M.agent.first} confirms every submission personally. No listing, no obligation, withdraw anytime.</p>
      <div class="mms-f">
        <input type="text" id="mf-name" placeholder="Your name" autocomplete="name">
        <input type="email" id="mf-email" placeholder="Email address *" required autocomplete="email">
        <input type="text" id="mf-addr" placeholder="${M.city} address *" autocomplete="street-address">
        <div class="mms-f3">
          <input type="number" id="mf-beds" placeholder="Beds" min="0">
          <input type="number" id="mf-baths" placeholder="Baths" min="0" step="0.5">
          <input type="number" id="mf-sqft" placeholder="SqFt" min="0">
        </div>
        <input type="text" id="mf-price" placeholder="Your Make Me Move price *" inputmode="numeric" onblur="fmtMfP(this)">
        <textarea id="mf-notes" placeholder="Anything a buyer should know (optional)"></textarea>
        <p class="cb-err" id="mf-err" style="display:none"></p>
        <button class="btn btn-gold" id="mf-btn" type="button">Set my price →</button>
        <p style="font-size:.7rem;color:var(--slate-dim);margin:4px 0 0">Direct to ${M.agent.name}, CA DRE #${M.agent.dre} · McMullen Properties · under Real Broker.</p>
      </div>
    </div>
    <div id="mf-thanks" style="display:none;text-align:center;padding:26px 6px">
      <div style="font-family:'Playfair Display',serif;font-size:1.6rem;margin-bottom:10px">Your number is <em style="color:var(--apricot)">set.</em></div>
      <p class="sub" style="margin:0 auto 20px">${M.agent.first} will confirm it with you personally — usually within a day. Nothing is public, and nothing happens without your say-so.</p>
      <button class="btn btn-gold" onclick="closeMmsModal()">Done</button>
    </div>
  </div>
</div>
<script>${pageJs}</script>\n<script>(function(){\n  var s=document.getElementById('mmSlider'); if(!s)return;\n  var CBM=0.03, TRAD=0.05, CREDIT=${M.creditUsd};\n  function money(n){return '$'+Math.round(n).toLocaleString('en-US');}\n  function upd(){\n    var pv=Number(s.value);\n    var trad=pv*TRAD, gross=pv*CBM, net=Math.max(0,gross-CREDIT), save=trad-net;\n    var pct=((pv-s.min)/(s.max-s.min))*100; s.style.setProperty('--pct',pct+'%');\n    document.getElementById('mmPrice').textContent=money(pv);\n    document.getElementById('mmTrad').textContent=money(trad);\n    document.getElementById('mmNet').textContent=money(net);\n    document.getElementById('mmSave').textContent=money(save);\n    document.getElementById('mmNetSub').textContent=(gross<=CREDIT)?'credit covers the full commission':'3% commission minus your $${creditLabel()} credit';\n    document.getElementById('mmRead').innerHTML='A traditional 5% agent charges <b>'+money(trad)+'</b>. Through ${M.name} you pay <b>'+money(net)+'</b> — keeping <b>'+money(save)+'</b> more.';\n  }\n  s.addEventListener('input',upd); upd();\n})();</script>`;
  return shell(title, desc, '/make-me-move/', body, null, null);
}

function renderMethodology() {
  const title = `Methodology — Where Every Number Comes From | ${M.name}`;
  const desc = `${M.name}'s data sources: ${M.county} County assessor and recorder records, recorded deeds, and MLS sale data for the ${M.zipsLabel} zip code. Estimates, not appraisals — and how to correct an error.`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a></div>
  <span class="eyebrow">Methodology</span>
  <h1>Here is the number, <em>and how we got it.</em></h1>
  <p class="sub">Transparency is the product. Every figure on this site traces to a named public source — and where a number is an estimate, it says so.</p>
</div></header>
<section class="pg"><div class="wrap">
  <div class="tiles">
    <div class="tile"><div class="n serif">01. County records</div><div class="l" style="margin-top:8px">${M.county} County Assessor and Recorder data: parcels, characteristics (beds, baths, square footage, year built), recorded deeds, and sale prices for every parcel in the ${M.zipsLabel} zip code.</div></div>
    <div class="tile"><div class="n serif">02. MLS sale data</div><div class="l" style="margin-top:8px">Active and sold data from MLSListings feeds, refreshed twice daily as it comes online. MLS-sourced records are marked as such and deemed reliable but not guaranteed.</div></div>
    <div class="tile"><div class="n serif">03. Estimates</div><div class="l" style="margin-top:8px">Estimated values are computational estimates from public data — not appraisals, not offers. Medians are shown only where enough sales exist to support them; we do not put trend arrows on one sale.</div></div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Record types</span><h2>What comes from where.</h2></div>
  <div class="tbl-wrap"><table class="cb">
    <thead><tr><th>On the site</th><th>Source</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td><b>Home characteristics</b></td><td>County assessor rolls</td><td>Beds, baths, sqft, lot, year built as recorded; remodels may lag</td></tr>
      <tr><td><b>Recorded sales</b></td><td>County recorder / deeds</td><td>Price and date as recorded at close</td></tr>
      <tr><td><b>Recent sales & listings</b></td><td>MLSListings feeds</td><td>Refreshed twice daily; coming online now</td></tr>
      <tr><td><b>Tracts & subdivisions</b></td><td>Recorded subdivision maps</td><td>Names as they appear in county records</td></tr>
      <tr><td><b>Estimated values</b></td><td>Computed from the above</td><td>Estimates, not appraisals</td></tr>
    </tbody>
  </table></div>
  <p class="sub" style="margin-top:26px">See an error in your home's record? Email <a href="mailto:tim@${M.domain}" style="color:var(--apricot)">tim@${M.domain}</a> with the address and the correction — records are fixed at the source, usually within a day.</p>
</div></section>`;
  return shell(title, desc, '/methodology/', body, null, null);
}


function renderIntelligence() {
  const title = `${M.city} Market Intelligence — Every Sale, Every Tract, Measured | ${M.name}`;
  const desc = `The complete ${M.city}, CA ${M.zipsLabel} market dashboard: the citywide $/sf trend by quarter, live recent sales, tract-by-tract price movement over 1, 3, 5, and 10 years, and side-by-side tract comparison — all built on recorded sales.`;
  const clientJs = `
(function(){
  function num(n){return n==null?'\u2014':Number(n).toLocaleString('en-US');}
  function money(n){return n==null?'\u2014':'$'+(n>=1e6?(n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'')+'M':Math.round(n/1000)+'K');}
  fetch('/assets/${M.assetPrefix}market-intel.json').then(function(r){return r.json();}).then(function(I){
    var T=I.totals;
    document.getElementById('izBand').innerHTML=[
      ['<span data-count="'+T.median_ppsf+'" data-prefix="$" data-comma="1">$'+num(T.median_ppsf)+'</span>','Median $/sf \u00b7 24 mo'],
      ['<span data-count="'+T.homes_indexed+'" data-comma="1">'+num(T.homes_indexed)+'</span>','Homes indexed'],
      ['<span data-count="'+T.sales_on_record+'" data-comma="1">'+num(T.sales_on_record)+'</span>','Sales on record'],
      ['<span data-count="'+T.sales_12mo+'">'+num(T.sales_12mo)+'</span>','Sales \u00b7 12 mo'],
      ['<span data-count="'+T.tracts_tracked+'">'+num(T.tracts_tracked)+'</span>','Named neighborhoods']
    ].map(function(t){return '<div class="rec"><div class="n">'+t[0]+'</div><div class="l">'+t[1]+'</div></div>';}).join('');
    if(window.EMMotion) window.EMMotion.rescan();

    (function(){
      var SB='https://qinuukntpyulqjzndnho.supabase.co',AK='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
      var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      function fdate(iso){ if(!iso)return''; var p=(''+iso).split('-'); return MON[(+p[1])-1]+' '+(+p[2])+', '+p[0]; }
      function renderFeed(rows){
        if(!rows||!rows.length){ rows=I.feed; }
        document.getElementById('izFeed').innerHTML=rows.map(function(f){
          var addr=f.a||f.address, slug=f.s||f.slug, price=f.p||f.price, sf=f.sf||f.sqft, ppsf=f.ppsf;
          var tract=f.tract||((f.tract_slug&&I.tracts[f.tract_slug])?I.tracts[f.tract_slug].name:'');
          var d=f.d||fdate(f.sold_date);
          return '<div class="feed-row"><div><div class="fa">'+(slug?('<a href="/home/'+slug+'/">'+addr+'</a>'):addr)+'</div>'+
            '<div class="fm">'+(tract?tract+' \u00b7 ':'')+(sf?num(sf)+' sf \u00b7 ':'')+(ppsf?'$'+num(ppsf)+'/sf':'')+'</div></div>'+
            '<div style="text-align:right"><div class="fp">'+money(price)+'</div><div class="fd">'+d+'</div></div></div>';
        }).join('');
      }
      fetch(SB+'/rest/v1/recent_sales_public?market_id=eq.${M.id}&select=address,slug,price,sqft,ppsf,tract_slug,sold_date&order=sold_date.desc&limit=15',{headers:{apikey:AK,Authorization:'Bearer '+AK}})
        .then(function(r){return r.ok?r.json():Promise.reject();}).then(renderFeed).catch(function(){renderFeed(I.feed);});
    })();

    var BS=(I.bands&&I.bands.series&&I.bands.series.rows&&I.bands.series.rows.length)?I.bands.series:null;
    var SRC=BS?BS.rows:I.quarters;
    var LBL=BS?'y':'q';
    var UNIT=BS?'years':'quarters';
    var WIN=BS?SRC.length:16;
    var TIPL=BS?function(l){return BS.window+' yrs to '+l;}:function(l){return l;};
    var chartKey='ppsf';
    var CNT=BS?{ppsf:'n',it_ppsf:'it_n',ac_ppsf:'ac_n'}:{ppsf:'n',sf_ppsf:'sf_n',co_ppsf:'co_n'};
    function drawTrajectory(){
      var key=chartKey;
      var host=document.getElementById('izChart');
      var qs=SRC.filter(function(q){return q[key];});
      if(qs.length<2){host.innerHTML='<p class="mz-sub">Not enough recorded sales in this segment to chart reliably.</p>';document.getElementById('izDelta').textContent='';return;}
      var vals=qs.map(function(q){return q[key];});
      var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals),pad=(max-min)*0.12||1;
      var W=1200,H=440;
      var pts=vals.map(function(v,i){
        var x=8+i*(W-16)/(vals.length-1);
        var y=H-14-(v-min+pad)/(max-min+2*pad)*(H-28);
        return [x,y];
      });
      var line=pts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ');
      var area='8,'+(H-6)+' '+line+' '+pts[pts.length-1][0].toFixed(1)+','+(H-6);
      host.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%">'+
        '<polygon points="'+area+'" fill="rgba(217,154,78,.12)"/>'+
        '<polyline points="'+line+'" fill="none" stroke="#d99a4e" stroke-width="2"/>'+
        '<line class="cb-guide" x1="0" x2="0" y1="10" y2="'+(H-6)+'" stroke="#b06f24" stroke-width="1" stroke-dasharray="3,3" style="display:none"/>'+
        '<circle class="cb-hoverdot" r="4.5" fill="#b06f24" style="display:none"/></svg>'+
        '<div class="cb-tip"></div>';
      var svg=host.querySelector('svg'),tip=host.querySelector('.cb-tip'),
          guide=host.querySelector('.cb-guide'),dot=host.querySelector('.cb-hoverdot');
      function onMove(e){
        var r=svg.getBoundingClientRect();
        var xr=(e.clientX-r.left)/r.width*W;
        var i=Math.round((xr-8)/((W-16)/(vals.length-1)));
        i=Math.max(0,Math.min(vals.length-1,i));
        var p=pts[i];
        guide.setAttribute('x1',p[0]);guide.setAttribute('x2',p[0]);guide.style.display='';
        dot.setAttribute('cx',p[0]);dot.setAttribute('cy',p[1]);dot.style.display='';
        tip.style.left=(p[0]/W*100)+'%';
        tip.style.top=(p[1]/H*100)+'%';
        tip.style.display='block';
        var ns=qs[i][CNT[key]];
        tip.innerHTML=TIPL(qs[i][LBL])+' \u00b7 <b>$'+num(vals[i])+'/sf</b>'+(ns?' \u00b7 '+ns+' sales':'');
      }
      svg.addEventListener('mousemove',onMove);
      svg.addEventListener('mouseleave',function(){tip.style.display='none';guide.style.display='none';dot.style.display='none';});
      svg.addEventListener('touchstart',function(e){if(e.touches.length)onMove(e.touches[0]);},{passive:true});
      svg.addEventListener('touchmove',function(e){if(e.touches.length)onMove(e.touches[0]);},{passive:true});
      var q16=qs.slice(-WIN);
      var delta=Math.round((q16[q16.length-1][key]/q16[0][key]-1)*100);
      document.getElementById('izDelta').textContent=(delta>=0?'\u25B2 +':'\u25BC ')+delta+'% over '+(q16.length-1)+' '+UNIT;
      document.getElementById('izCapL').innerHTML=qs[0][LBL]+' <b>$'+num(qs[0][key])+'</b>';
      document.getElementById('izCapR').innerHTML=qs[qs.length-1][LBL]+' <b>$'+num(qs[qs.length-1][key])+'</b>';
    }
    drawTrajectory();
    document.getElementById('izTypePills').addEventListener('click',function(e){
      if(e.target.tagName!=='BUTTON')return;
      chartKey=e.target.getAttribute('data-k');
      document.querySelectorAll('#izTypePills .pill-t').forEach(function(b){b.classList.toggle('on',b===e.target);});
      drawTrajectory();
    });

    var TSB='https://qinuukntpyulqjzndnho.supabase.co',TAK='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
    var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function fdate(iso){ if(!iso)return''; var p=(''+iso).split('-'); return MON[(+p[1])-1]+' '+(+p[2])+', '+p[0]; }
    var TM={};
    var slugs=Object.keys(I.tracts).filter(function(s){return I.tracts[s].all_n>=8;}).sort(function(a,b){return I.tracts[a].name.localeCompare(I.tracts[b].name);});
    function opts(sel){ slugs.forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=I.tracts[s].name+' ('+I.tracts[s].all_n+' sales)';sel.appendChild(o);}); }
    function rowsFor(slug){
      var t=I.tracts[slug]||{}, m=TM[slug]||{};
      var vs=m.ppsf_vs_neighbors_pct;
      var vsTxt=(vs==null||vs===undefined)?'\u2014':((vs>=0?'+':'')+vs+'% vs nearby');
      var recent='\u2014';
      if(m.recent_sale_address){
        var a=m.recent_sale_slug?'<a href="/home/'+m.recent_sale_slug+'/" style="color:var(--apricot)">'+m.recent_sale_address+'</a>':m.recent_sale_address;
        recent=a+' \u00b7 '+money(m.recent_sale_price)+' \u00b7 '+fdate(m.recent_sale_date);
      }
      return [
        ['Most recent sale', recent],
        ['Most recent $/sf', m.recent_ppsf?('$'+num(m.recent_ppsf)+'/sf'):'\u2014'],
        ['$/sf \u00b7 last 3 sales', m.ppsf_last3?('$'+num(m.ppsf_last3)+'/sf'):'\u2014'],
        ['$/sf vs neighboring tracts', vsTxt],
        ['Typical year built', m.year_built_typical||t.yr||'\u2014'],
        ['Sales \u00b7 last 3 years', (m.sales_3yr!=null&&m.sales_3yr!==undefined)?num(m.sales_3yr):'\u2014']
      ];
    }
    function statHtml(slug){
      var t=I.tracts[slug]||{};
      return rowsFor(slug).map(function(r){return '<div class="cmp-stat"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>';}).join('')
        +'<p class="horizon-note"><a style="color:var(--apricot)" href="/tract/'+slug+'/">'+t.name+' tract page \u2192</a></p>';
    }
    var mvSel=document.getElementById('izTract'); opts(mvSel);
    var selA=document.getElementById('izCmpA'), selB=document.getElementById('izCmpB'); opts(selA); opts(selB);
    function drawMove(){ document.getElementById('izMove').innerHTML=statHtml(mvSel.value); }
    function drawCmp(){ document.getElementById('izCmpAOut').innerHTML=statHtml(selA.value); document.getElementById('izCmpBOut').innerHTML=statHtml(selB.value); }
    mvSel.addEventListener('change',function(){drawMove();paintTractSel();focusTract();}); selA.addEventListener('change',drawCmp); selB.addEventListener('change',drawCmp);
    mvSel.value=slugs[0]; selA.value=slugs[0]; selB.value=slugs[1]||slugs[0];
    function renderAll(){ drawMove(); drawCmp(); }
    document.getElementById('izMove').innerHTML='<p class="mz-sub">Loading tract data\u2026</p>';
    fetch(TSB+'/rest/v1/tract_metrics_public?market_id=eq.${M.id}&select=tract_slug,year_built_typical,sales_3yr,recent_sale_date,recent_sale_price,recent_sale_address,recent_sale_slug,recent_ppsf,ppsf_last3,ppsf_vs_neighbors_pct',{headers:{apikey:TAK,Authorization:'Bearer '+TAK}})
      .then(function(r){return r.ok?r.json():[];}).then(function(rows){rows.forEach(function(m){TM[m.tract_slug]=m;});renderAll();}).catch(renderAll);

    /* ---- selectable tract map ---- */
    var THP={}, tmap=null;
    function paintTractSel(){
      Object.keys(THP).forEach(function(sl){
        THP[sl].setStyle(sl===mvSel.value
          ?{color:'#d99a4e',weight:2.5,fillColor:'#d99a4e',fillOpacity:.3}
          :{color:'#8a7a55',weight:1.2,fillColor:'#d99a4e',fillOpacity:.06});
      });
    }
    function focusTract(){ if(tmap&&THP[mvSel.value]){ try{ tmap.fitBounds(THP[mvSel.value].getBounds().pad(1.8)); }catch(e){} } }
    function ensureLeafletJs(cb){
      if(!document.querySelector('link[href*="leaflet.min.css"]')){
        var l=document.createElement('link'); l.rel='stylesheet';
        l.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(l);
      }
      if(window.L&&window.L.map){cb();return;}
      var s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload=cb; document.head.appendChild(s);
    }
    (function initTractMap(){
      var el=document.getElementById('izTractMap'); if(!el) return;
      ensureLeafletJs(function(){
        fetch(TSB+'/rest/v1/tract_hulls?market_id=eq.${M.id}&select=tract_slug,ring',{headers:{apikey:TAK,Authorization:'Bearer '+TAK}})
          .then(function(r){return r.ok?r.json():[];})
          .then(function(rows){
            tmap=L.map('izTractMap',{scrollWheelZoom:false}).setView([${M.center[0]},${M.center[1]}],13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
              attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom:19
            }).addTo(tmap);
            tmap.on('focus click',function(){tmap.scrollWheelZoom.enable();});
            var ok={}; slugs.forEach(function(s){ok[s]=1;});
            rows.forEach(function(row){
              var sl=row.tract_slug;
              if(!ok[sl]||!row.ring||row.ring.length<4) return;
              // Skip geographically scattered "tracts" (rancho grants, mountain map filings):
              // a hull spanning more than half a mile is not a coherent neighborhood.
              var la=[],ln=[]; row.ring.forEach(function(p){la.push(p[0]);ln.push(p[1]);});
              var spanMi=Math.max(
                (Math.max.apply(null,la)-Math.min.apply(null,la))*69,
                (Math.max.apply(null,ln)-Math.min.apply(null,ln))*54.6);
              if(spanMi>0.5) return;
              var poly=L.polygon(row.ring,{});
              poly.bindTooltip(I.tracts[sl].name,{sticky:true,direction:'top'});
              poly.on('click',function(){ mvSel.value=sl; drawMove(); paintTractSel(); });
              poly.addTo(tmap); THP[sl]=poly;
            });
            paintTractSel();
            setTimeout(function(){ try{ tmap.invalidateSize(); }catch(e){} }, 250);
          })
          .catch(function(){ el.innerHTML='<p class="mz-sub" style="padding:16px">Tract map unavailable.</p>'; });
      });
    })();
  });
})();
`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a></div>
  <span class="eyebrow">Market intelligence</span>
  <h1>Every sale. Every tract. <em>Measured.</em></h1>
  <p class="sub">The ${M.city} market dashboard — the citywide trend, live activity, and tract-by-tract movement, all built on recorded sales. No trend arrows on one sale.</p>
  <div class="rec-grid" id="izBand"></div>
</div></header>
<section class="pg"><div class="wrap">
  <div class="mz-card mz-chart" style="max-width:none">
    <div class="mz-eyebrow">$/SF Trajectory &middot; 10 years <span class="mz-delta" id="izDelta"></span></div>
    <div class="mz-sub">${chartSub()}</div>
    <div class="pillbar" id="izTypePills" style="margin:0 0 16px">
      ${chartPills()}
    </div>
    <div id="izChart" style="position:relative"></div>
    <div class="cap"><span id="izCapL"></span><span id="izCapR"></span></div>
  </div>${renderLotBands()}
  <div class="mz-card" style="margin-top:16px">
    <div class="mz-eyebrow"><span class="dot"></span>Live sales feed</div>
    <div class="mz-sub">The most recent ${M.city} closings on record &mdash; newest first.</div>
    <div id="izFeed"></div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">How prices have moved</span>
  <h2>Price movement by <em>tract.</em></h2>
  <p class="sub">Pick any ${M.city} neighborhood for its latest sale, per-square-foot, how it stacks up against nearby tracts, and recent activity.</p></div>
  <div class="iz-tract-grid">
    <div class="mz-card">
      <select class="cb-select" id="izTract" style="margin-bottom:18px"></select>
      <div id="izMove"></div>
    </div>
    <div class="mz-card">
      <div class="mz-eyebrow">Or pick it on the map</div>
      <div class="mz-sub">Tap any outlined neighborhood &mdash; gold is the one selected.</div>
      <div id="izTractMap"></div>
    </div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Tract data</span>
  <h2>Compare two <em>tracts.</em></h2>
  <p class="sub">Pick any two ${M.city} neighborhoods to compare latest sale, $/sf, neighbor standing, and activity side by side.</p></div>
  <div class="cmp-grid">
    <div class="mz-card"><select class="cb-select" id="izCmpA"></select><div id="izCmpAOut"></div></div>
    <div class="mz-card"><select class="cb-select" id="izCmpB"></select><div id="izCmpBOut"></div></div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  ${toolCta({
      eyebrow: "Run these numbers for your home",
      lead: "Every figure on this page can be run for one home — yours. Value it, weigh an offer, and see exactly what you’d net.",
      actions: [
        { label: "Value your home", href: `https://app.${M.domain}/tools/cma` },
        { label: "See your net sheet", href: `https://app.${M.domain}/tools/net-sheet` }
      ]
    })}
</div></section>
<script>${clientJs}</script>`;
  return shell(title, desc, '/intelligence/', body, null, null);
}


function renderCampaignResult(url) {
  const s = (url.searchParams.get('s') || '').toLowerCase();
  const addr = (url.searchParams.get('addr') || 'the sale').slice(0, 80);
  const n = (url.searchParams.get('n') || '').replace(/[^0-9]/g, '');
  const eA = addr.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let head, body;
  if (s === 'approved') {
    head = 'Approved \u2014 sending';
    body = `<h1>Approved \u2014 <em>sending.</em></h1><p class="sub">${n ? n + ' validated neighbors of ' : 'The neighbors of '}<b>${eA}</b> are in the send queue. They go out under your daily cap and 14-day cooldown. You can close this tab.</p>`;
  } else if (s === 'rejected') {
    head = 'Rejected';
    body = `<h1>Rejected.</h1><p class="sub">Today\u2019s batch for <b>${eA}</b> was discarded. Nothing was sent.</p>`;
  } else if (s === 'already') {
    head = 'Already handled';
    body = `<h1>Already <em>handled.</em></h1><p class="sub">This campaign for <b>${eA}</b> was already actioned \u2014 nothing changed.</p>`;
  } else {
    head = 'Campaign';
    body = `<h1>Campaign not found.</h1><p class="sub">This link may have expired.</p>`;
  }
  const page = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${head} \u00b7 ${M.name}</title><style>${cbCss()}
  .cr-wrap{min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:var(--chrome);color:var(--chrome-ink)}
  .cr-wrap h1{font-family:'Playfair Display',serif;font-size:clamp(1.8rem,4vw,2.6rem);margin:0 0 14px}
  .cr-wrap h1 em{color:var(--apricot-soft);font-style:italic}
  .cr-wrap .sub{color:#c6cbd6;max-width:44ch;margin:0 auto;font-size:1.02rem;line-height:1.6}
  .cr-wrap .mark{font-family:'Playfair Display',serif;color:var(--apricot);font-size:1.1rem;margin-bottom:26px;letter-spacing:.02em}
  .cr-wrap a{color:var(--apricot-soft)}</style></head><body><div class="cr-wrap"><div><div class="mark">${M.name}</div>${body}<p style="margin-top:24px"><a href="/admin/">Go to admin \u2192</a></p></div></div></body></html>`;
  return page;
}

function renderToolsHub() {
  const title = `Be Your Own Agent — Free Real Estate Tools | ${M.name}`;
  const desc = `Every tool a realtor uses to price, compare, and sell a home in ${M.city} — open to you, free. Net sheet, CMA, comps, and off-market access.`;
  const tools = [
    { to:'/tools/net-sheet/', ico:'M3 3v18h18 M7 14l3-3 3 3 5-6', name:'Seller net sheet', blurb:`Estimate your real proceeds at closing. See exactly what you'd walk away with — and how the $${creditLabel()} credit changes the math.`, tags:['seller'], status:'live' },
    { to:'/make-me-move/', ico:'M3 12l9-9 9 9 M5 10v10h14V10', name:'Make Me Move', blurb:`Set a private number: the price that would actually make you sell. No listing, no obligation — ${M.agent.first} holds it quietly until it's real.`, tags:['seller'], status:'live' },
    { to:'/recent-sales/', ico:'M4 19h16 M7 16V9 M12 16V5 M17 16v-4', name:'See comps near you', blurb:`Every recent sale in ${M.city}, filterable by neighborhood, price, and beds — the comps an agent would pull for you.`, tags:['seller','investor'], status:'live' },
    { to:`https://app.${M.domain}/tools/cma`, ico:'M9 17V9 M15 17V5 M4 21h16', name:'Build your own CMA', blurb:'Pick your home and a few recent sales — get an instant value range, the way an agent prices a listing.', tags:['seller','investor'], status:'live' },
    { to:`https://app.${M.domain}/tools/compare`, ico:'M3 6h7v12H3z M14 6h7v12h-7z', name:'Compare homes', blurb:'Line up any two homes side by side — price, $/sqft, beds, baths, lot — and see which is the better buy.', tags:['buyer','investor'], status:'live' },
    { to:`https://app.${M.domain}/tools/review`, ico:'M8 3H5v18h14V8l-5-5z M8 12h8 M8 16h5', name:'Disclosure review', blurb:`Upload a disclosure packet or CMA and get a first-pass on what matters — then have ${M.agent.first} review it personally.`, tags:['buyer','seller'], status:'live' },
  ];
  const card = (t) => {
    const inner = `<div class="tool-tile ${t.status==='soon'?'is-soon':''}">
      <div class="tt-top">
        <span class="tt-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${t.ico}"/></svg></span>
        ${t.status==='soon'?'<span class="tt-soon">Soon</span>':'<span class="tt-arrow">→</span>'}
      </div>
      <h3>${t.name}</h3>
      <p>${t.blurb}</p>
      <div class="tt-tags">${t.tags.map(j=>`<span class="tt-tag">${j}</span>`).join('')}</div>
    </div>`;
    return t.status==='live' ? `<a class="tool-link" href="${t.to}">${inner}</a>` : `<div class="tool-link">${inner}</div>`;
  };
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / <a href="/tools/">Toolkit</a></div>
  <span class="eyebrow">Your toolkit</span>
  <h1>Be your own <em>agent.</em></h1>
  <p class="sub">Every tool a realtor uses to do the job — open to you, free. Run your net sheet, price your home, pull the comps, weigh an offer. Create an account when you want to save your work and unlock the full suite.</p>
</div></header>
<section class="pg"><div class="wrap">
  <div class="tool-grid">${tools.map(card).join('')}</div>
  <div class="tool-gate" data-reveal-self>
    <div>
      <span class="eyebrow">One free account</span>
      <h2 style="font-size:1.5rem;margin:6px 0 8px">Save your work — and your <em style="color:var(--apricot);font-style:italic">$${creditLabel()} credit.</em></h2>
      <p class="sub" style="margin:0">Keep your net sheets and CMAs, get agent review on any of them, and lock in ten thousand dollars off commission when you sell. No cost, no obligation.</p>
    </div>
    <a class="btn btn-gold" href="https://app.${M.domain}/signin">Create your account →</a>
  </div>
</div></section>`;
  return shell(title, desc, '/tools/', body, null, null);
}

function renderNetSheet() {
  const title = `Seller Net Sheet — What You Actually Walk Away With | ${M.name}`;
  const desc = `Estimate your real proceeds when you sell a home in ${M.city}. See commission, transfer tax, title, escrow, and how the $${creditLabel()} credit changes your net.`;
  const clientJs = `
(function(){
  function usd(n){return '$'+Math.round(n).toLocaleString('en-US');}
  var I={salePrice:${pb().default},payoff:0,commissionPct:5,transferPct:0.11,titlePct:0.5,escrow:1500,other:0};
  function compute(withCredit){
    var sp=I.salePrice||0;
    var commission=sp*(I.commissionPct/100);
    var credit=withCredit?${M.creditUsd}:0;
    var transfer=sp*(I.transferPct/100);
    var title=sp*(I.titlePct/100);
    var costs=I.payoff+commission-credit+transfer+title+I.escrow+I.other;
    return {sp:sp,commission:commission,credit:credit,transfer:transfer,title:title,costs:costs,net:sp-costs};
  }
  function render(){
    var base=compute(false), tim=compute(true);
    document.getElementById('nsNet').textContent=usd(tim.net);
    document.getElementById('nsRows').innerHTML=
      row('Sale price',usd(tim.sp),true)+
      (I.payoff>0?row('Mortgage payoff','– '+usd(I.payoff)):'')+
      row('Commission ('+I.commissionPct+'%)','– '+usd(tim.commission))+
      row('${M.city} Market credit','+ '+usd(10000),false,true)+
      row('County transfer tax ('+I.transferPct+'%)','– '+usd(tim.transfer))+
      row('Title insurance ('+I.titlePct+'%)','– '+usd(tim.title))+
      row('Escrow / settlement','– '+usd(I.escrow))+
      (I.other>0?row('Other costs','– '+usd(I.other)):'')+
      row('Total costs','– '+usd(tim.costs),true);
    document.getElementById('nsCompare').innerHTML=
      '<div class="ns-cmp-row"><span>Without the credit</span><b>'+usd(base.net)+'</b></div>'+
      '<div class="ns-cmp-row hi"><span>With your $${creditLabel()} credit</span><b>'+usd(tim.net)+'</b></div>';
  }
  function row(l,v,bold,gain){return '<div class="ns-row'+(bold?' b':'')+(gain?' g':'')+'"><span>'+l+'</span><span>'+v+'</span></div>';}
  function bind(id,key,pct){var el=document.getElementById(id);if(!el)return;el.addEventListener('input',function(){var v=parseFloat(el.value.replace(/[^0-9.]/g,''))||0;I[key]=v;render();});}
  bind('nsPrice','salePrice');bind('nsPayoff','payoff');bind('nsComm','commissionPct');bind('nsTransfer','transferPct');bind('nsTitle','titlePct');bind('nsEscrow','escrow');bind('nsOther','other');
  render();
})();`;
  const field = (id,label,val,hint) => `<label class="ns-field"><span class="ns-lbl">${label}</span><input id="${id}" type="text" inputmode="decimal" value="${val}">${hint?`<span class="ns-hint">${hint}</span>`:''}</label>`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / <a href="/tools/">Toolkit</a> / <a href="/tools/net-sheet/">Net sheet</a></div>
  <span class="eyebrow">Seller net sheet</span>
  <h1>Your net sheet, <em>your numbers.</em></h1>
  <p class="sub">What you actually walk away with when you sell — not the sale price. Adjust anything; the math updates live. The $${creditLabel()} ${M.city} Market credit is already working in your favor.</p>
</div></header>
<section class="pg"><div class="wrap"><div class="ns-wrap">
  <div class="ns-inputs">
    ${field('nsPrice','Sale price','1800000')}
    ${field('nsPayoff','Mortgage payoff','0','What you still owe')}
    <div class="ns-two">${field('nsComm','Agent commission %','5')}${field('nsTransfer','County transfer tax %','0.11')}</div>
    <div class="ns-two">${field('nsTitle','Title insurance %','0.5')}${field('nsEscrow','Escrow / settlement','1500')}</div>
    ${field('nsOther','Other costs','0','Repairs, staging, etc.')}
    <p class="ns-note">Defaults reflect typical ${M.county} County closings; adjust to your situation. Estimates only — not a guarantee of final figures.</p>
  </div>
  <div class="ns-result">
    <div class="ns-net-lbl">Estimated net proceeds</div>
    <div class="ns-net" id="nsNet">$0</div>
    <div class="ns-rows" id="nsRows"></div>
    <div class="ns-compare" id="nsCompare"></div>
    <a class="btn btn-gold" href="/join/" style="width:100%;text-align:center;margin-top:18px">Save this &amp; lock your $10K →</a>
  </div>
</div></div></section>
<script>${clientJs}</script>`;
  return shell(title, desc, '/tools/net-sheet/', body, null, null);
}

function renderRecentSales() {
  const title = `Recent Home Sales in ${M.city}, CA ${M.zipsLabel} | ${M.name}`;
  const desc = `Every recent home sale in ${M.city}, CA ${M.zipsLabel} — sortable and filterable by neighborhood, property type, price, and bedrooms, each linked to its full record with photos.`;
  const clientJs = `
(function(){
  var SB='https://qinuukntpyulqjzndnho.supabase.co';
  var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
  var GKEY='` + GMAPS_KEY + `';
  function num(n){return n==null?'':Number(n).toLocaleString('en-US');}
  function money(n){if(n==null)return '';if(n>=1e6){var s=(n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'');return '$'+s+'M';}return '$'+Math.round(n/1000)+'K';}
  function photoOf(l,size){
    return l.rehosted_url||null;
  }
  var ALL=[], TRACTS={}, F={area:'all',type:'all',price:'all',beds:'all'}, SORT='recent';
  function tractOf(l){ return (l.properties&&l.properties.tract_slug)||null; }
  function tractName(slug){ return (TRACTS[slug]&&TRACTS[slug].name)||''; }
  function specsOf(l){
    var s=[];
    if(l.beds)s.push(l.beds+' bd');
    if(l.baths)s.push(l.baths+' ba');
    if(l.sqft)s.push(num(l.sqft)+' sf');
    if(l.year_built)s.push('built '+l.year_built);
    if(l.price&&l.sqft)s.push('$'+num(Math.round(l.price/l.sqft))+'/sf');
    return s.join(' · ');
  }
  function cardHtml(l,i){
    var img=photoOf(l,'640x400');
    var tn=tractName(tractOf(l));
    var inner='<div class="ph">'+(img?('<img loading="lazy" onerror="this.remove()" src="'+img+'" alt="'+l.address_raw+', ${M.city} CA">'):'')+
      '<span class="price-chip sold"><span class="dot"></span>Sold '+money(l.price)+'</span></div>'+
      '<div class="bd"><div class="ad">'+l.address_raw+'</div>'+
      '<div class="sp">'+specsOf(l)+'</div>'+
      (tn?'<div class="tr" style="color:var(--slate-dim)">'+tn+'</div>':'')+
      '<div class="tr">View sale →</div></div>';
    var href=l.property_slug?('/home/'+l.property_slug+'/'):('/for-sale/'+l.mls_number+'/');
    return '<a class="listing-card" style="animation-delay:'+Math.min(i*60,420)+'ms" href="'+href+'">'+inner+'</a>';
  }
  function current(){
    var rows=ALL.filter(function(l){
      if(F.area!=='all' && tractOf(l)!==F.area) return false;
      if(F.type!=='all' && l.prop_type!==F.type) return false;
      if(F.beds!=='all' && (!l.beds || l.beds < parseInt(F.beds,10))) return false;
      if(F.price!=='all'){
        var p=F.price.split('-');
        var lo=parseInt(p[0],10)||0, hi=p[1]?parseInt(p[1],10):Infinity;
        if(!l.price || l.price < lo || l.price >= hi) return false;
      }
      return true;
    });
    rows.sort(function(a,b){
      if(SORT==='price_desc') return (b.price||0)-(a.price||0);
      if(SORT==='price_asc') return (a.price||0)-(b.price||0);
      if(SORT==='ppsf_desc') return ((b.price&&b.sqft)?b.price/b.sqft:0)-((a.price&&a.sqft)?a.price/a.sqft:0);
      // recent (default): last_seen desc
      return (new Date(b.last_seen||0))-(new Date(a.last_seen||0));
    });
    return rows;
  }
  function render(){
    var rows=current();
    var rc=document.getElementById('rsResult'); if(rc)rc.innerHTML='<b>'+rows.length+'</b> of '+ALL.length+' sales';
    var grid=document.getElementById('rsGrid');
    if(!rows.length){ grid.innerHTML='<p class="empty" style="grid-column:1/-1">No sales match those filters.</p>'; return; }
    grid.innerHTML=rows.map(cardHtml).join('');
  }
  function buildAreaFilter(){
    var counts={};
    ALL.forEach(function(l){ var t=tractOf(l); if(t)counts[t]=(counts[t]||0)+1; });
    var slugs=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];});
    var sel=document.getElementById('rsArea'); if(!sel)return;
    var opts='<option value="all">All neighborhoods</option>';
    slugs.forEach(function(s){ opts+='<option value="'+s+'">'+tractName(s)+' ('+counts[s]+')</option>'; });
    sel.innerHTML=opts;
    sel.addEventListener('change',function(){ F.area=sel.value; render(); });
  }
  function wirePills(id,key){
    var bar=document.getElementById(id); if(!bar)return;
    bar.querySelectorAll('.pill-t').forEach(function(b){
      b.addEventListener('click',function(){
        bar.querySelectorAll('.pill-t').forEach(function(x){x.className='pill-t';});
        b.className='pill-t on'; F[key]=b.getAttribute('data-v'); render();
      });
    });
  }
  Promise.all([
    fetch(SB+'/rest/v1/mls_feed_listings?market_id=eq.${M.id}&status=eq.Sold&select=mls_number,address_raw,address_norm,property_slug,price,beds,baths,sqft,year_built,rehosted_url,prop_type,last_seen,photo_count,properties(tract_slug)',{headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}}).then(function(r){return r.ok?r.json():[];}),
    fetch('/assets/${M.assetPrefix}tracts.json').then(function(r){return r.ok?r.json():{};})
  ]).then(function(res){
    ALL=res[0]||[]; TRACTS=res[1]||{};
    buildAreaFilter();
    wirePills('rsType','type'); wirePills('rsPrice','price'); wirePills('rsBeds','beds');
    var sortSel=document.getElementById('rsSort');
    if(sortSel)sortSel.addEventListener('change',function(){SORT=sortSel.value;render();});
    render();
  }).catch(function(){ var g=document.getElementById('rsGrid'); if(g)g.innerHTML='<p class="empty" style="grid-column:1/-1">Could not load sales right now.</p>'; });
})();`;

  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / <a href="/recent-sales/">Recent sales</a></div>
  <span class="eyebrow">Recent sales</span>
  <h1>Every recent sale <em>in ${M.city}.</em></h1>
  <p class="sub">A running record of homes sold in ${M.zipsLabel} — filter by neighborhood, type, price, or bedrooms. Each sale links to its full record, with photos and the marketing description.</p>
</div></header>
<section class="pg"><div class="wrap">
  <div class="filter-bar" data-reveal-self>
    <div class="filter-group"><div class="fl">Neighborhood</div>
      <select class="al-sort" id="rsArea" aria-label="Filter by neighborhood"><option value="all">All neighborhoods</option></select>
    </div>
    <div class="filter-group"><div class="fl">Property type</div>
      <div class="pillbar" id="rsType">
        <button class="pill-t on" data-v="all">All</button>
        <button class="pill-t" data-v="Single Family">House</button>
        <button class="pill-t" data-v="Condominium">Condo</button>
        <button class="pill-t" data-v="Townhouse">Townhome</button>
      </div></div>
    <div class="filter-group"><div class="fl">Price</div>
      <div class="pillbar" id="rsPrice">
        <button class="pill-t on" data-v="all">All</button>
        <button class="pill-t" data-v="0-2000000">Under $2M</button>
        <button class="pill-t" data-v="2000000-3000000">$2M–$3M</button>
        <button class="pill-t" data-v="3000000-">$3M+</button>
      </div></div>
    <div class="filter-group"><div class="fl">Bedrooms</div>
      <div class="pillbar" id="rsBeds">
        <button class="pill-t on" data-v="all">All</button>
        <button class="pill-t" data-v="2">2+</button>
        <button class="pill-t" data-v="3">3+</button>
        <button class="pill-t" data-v="4">4+</button>
        <button class="pill-t" data-v="5">5+</button>
      </div></div>
  </div>
  <div class="al-toolbar">
    <div class="al-count" id="rsResult"></div>
    <select class="al-sort" id="rsSort" aria-label="Sort sales">
      <option value="recent">Most recent</option>
      <option value="price_desc">Price · high to low</option>
      <option value="price_asc">Price · low to high</option>
      <option value="ppsf_desc">$/sf · high to low</option>
    </select>
  </div>
  <div class="listing-grid" id="rsGrid"></div>
  <p class="map-note" style="margin-top:22px">Sold data from MLSListings, deemed reliable but not guaranteed. Buyers should verify all information independently.</p>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <div class="split">
    <div>
      <span class="eyebrow">Curious what yours is worth?</span>
      <h2>A sale nearby moves <em>your</em> number too.</h2>
      <p class="sub" style="margin-top:14px">Every one of these sales resets the comps around it. Get a free, no-obligation valuation for your exact address. <a href="/how-it-works/#credit" style="color:var(--apricot)">See how it works →</a></p>
      <p class="sub" style="margin-top:10px">Thinking about selling? <a href="/tools/net-sheet/" style="color:var(--apricot)">Run your net sheet →</a> to see what you'd actually walk away with — or <a href="/tools/" style="color:var(--apricot)">open the full toolkit</a>.</p>
    </div>
    ${toolCta({
      eyebrow: "Compare to your home",
      lead: "These sales set the market. See exactly how yours stacks up — build a CMA against these comps in two minutes.",
      actions: [
        { label: "Compare with a CMA", href: `https://app.${M.domain}/tools/cma` },
        { label: "What you’d net selling", href: `https://app.${M.domain}/tools/net-sheet` }
      ]
    })}
  </div>
</div></section>
<script>${clientJs}</script>`;
  return shell(title, desc, '/recent-sales/', body, null, null);
}

function renderActiveListings() {
  const title = `Homes For Sale in ${M.city}, CA ${M.zipsLabel} — Live | ${M.name}`;
  const desc = `Every home actively for sale in ${M.city}, CA ${M.zipsLabel} right now — live from the MLS, refreshed twice daily, filterable by type, price, and bedrooms, each linked to its full home record.`;
  const clientJs = `
(function(){
  var SB='https://qinuukntpyulqjzndnho.supabase.co';
  var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
  var GKEY='` + GMAPS_KEY + `';
  function num(n){return n==null?'':Number(n).toLocaleString('en-US');}
  function money(n){if(n==null)return '';if(n>=1e6){var s=(n/1e6).toFixed(2).replace(/0+$/,'').replace(/[.]$/,'');return '$'+s+'M';}return '$'+Math.round(n/1000)+'K';}
  function photoOf(l,size){
    return l.rehosted_url||null;
  }
  var ALL=[], RV={}, F={type:'all',price:'all',beds:'all'}, SORT='price_desc';
  function specsOf(l){
    var s=[];
    if(l.beds)s.push(l.beds+' bd');
    if(l.baths)s.push(l.baths+' ba');
    if(l.sqft)s.push(num(l.sqft)+' sf');
    if(l.year_built)s.push('built '+l.year_built);
    if(l.price&&l.sqft)s.push('$'+num(Math.round(l.price/l.sqft))+'/sf');
    return s.join(' \u00b7 ');
  }
  function cardHtml(l,i){
    var img=photoOf(l,'640x400');
    var rv=RV[l.mls_number];
    var inner='<div class="ph">'+(img?('<img loading="lazy" onerror="this.parentNode.querySelector(\\'.price-chip\\')&&0;this.remove()" src="'+img+'" alt="'+l.address_raw+', ${M.city} CA">'):'')+
      '<span class="price-chip"><span class="dot"></span>'+money(l.price)+'</span>'+
      (rv?'<span class="rv-badge">\u2713 Disclosures reviewed</span>':'')+'</div>'+
      '<div class="bd"><div class="ad">'+l.address_raw+'</div>'+
      '<div class="sp">'+specsOf(l)+'</div>'+
      (rv?'<div class="tr rv-cta">Get the free cheat sheet'+(rv.cma?' + CMA':'')+' \u2192</div>':'<div class="tr">View listing \u2192</div>')+'</div>';
    var href='/for-sale/'+l.mls_number+'/'+(rv?'#reviewed':'');
    return '<a class="listing-card'+(rv?' listing-card--rv':'')+'" style="animation-delay:'+Math.min(i*60,420)+'ms" href="'+href+'">'+inner+'</a>';
  }
  function spotlightHtml(l){
    var img=photoOf(l,'900x600');
    var rv=RV[l.mls_number];
    return '<a class="al-spot'+(rv?' listing-card--rv':'')+'" href="/for-sale/'+l.mls_number+'/'+(rv?'#reviewed':'')+'">'+
      '<div class="ph">'+(img?('<img src="'+img+'" alt="'+l.address_raw+', ${M.city} CA">'):'')+
      (rv?'<span class="rv-badge">\u2713 Disclosures reviewed</span>':'')+'</div>'+
      '<div class="bd"><div class="fk">\u25cf Featured \u00b7 highest ask in ${M.city}</div>'+
      '<div class="pr">'+money(l.price)+'</div>'+
      '<div class="ad">'+l.address_raw+', ${M.city}</div>'+
      '<div class="sp">'+specsOf(l)+'</div>'+
      '<div class="ctas"><span class="btn btn-gold">View listing \u2192</span>'+
      (rv?'<span class="btn rv-btn">Free cheat sheet'+(rv.cma?' + CMA':'')+' \u2192</span>':'')+'</div>'+
      '</div></a>';
  }
  function current(){
    var rows=ALL.filter(function(l){
      if(F.type!=='all' && l.prop_type!==F.type) return false;
      if(F.beds!=='all' && (!l.beds || l.beds < parseInt(F.beds,10))) return false;
      if(F.price!=='all'){
        var p=F.price.split('-');
        var lo=parseInt(p[0],10)||0, hi=p[1]?parseInt(p[1],10):Infinity;
        if(!l.price || l.price < lo || l.price >= hi) return false;
      }
      return true;
    });
    rows.sort(function(a,b){
      if(SORT==='price_asc') return (a.price||0)-(b.price||0);
      if(SORT==='ppsf_desc') return ((b.price&&b.sqft)?b.price/b.sqft:0)-((a.price&&a.sqft)?a.price/a.sqft:0);
      if(SORT==='sqft_desc') return (b.sqft||0)-(a.sqft||0);
      return (b.price||0)-(a.price||0);
    });
    return rows;
  }
  function render(){
    var rows=current();
    var n=document.getElementById('alCount'); if(n)n.textContent=rows.length;
    var rc=document.getElementById('alResult'); if(rc)rc.innerHTML='<b>'+rows.length+'</b> of '+ALL.length+' listings';
    var spot=document.getElementById('alSpot');
    var grid=document.getElementById('alGrid');
    var noFilters=(F.type==='all'&&F.price==='all'&&F.beds==='all'&&SORT==='price_desc');
    if(!rows.length){
      spot.innerHTML='';
      grid.innerHTML='<div class="filter-empty">No active listings match those filters right now \u2014 which is exactly why Make Me Move exists. <a href="/make-me-move/" style="color:var(--apricot)">Name your number \u2192</a></div>';
      return;
    }
    if(noFilters && rows.length>3){
      spot.innerHTML=spotlightHtml(rows[0]);
      grid.innerHTML=rows.slice(1).map(cardHtml).join('');
    } else {
      spot.innerHTML='';
      grid.innerHTML=rows.map(cardHtml).join('');
    }
  }
  function wirePills(id,key){
    document.getElementById(id).addEventListener('click',function(e){
      if(e.target.tagName!=='BUTTON')return;
      F[key]=e.target.getAttribute('data-v');
      document.querySelectorAll('#'+id+' .pill-t').forEach(function(b){b.classList.toggle('on',b===e.target);});
      render();
    });
  }
  wirePills('fType','type'); wirePills('fPrice','price'); wirePills('fBeds','beds');
  document.getElementById('alSort').addEventListener('change',function(e){ SORT=e.target.value; render(); });
  fetch(SB+'/rest/v1/mls_feed_listings?market_id=eq.${M.id}&status=eq.Active&order=price.desc&select=mls_number,address_raw,address_norm,property_slug,price,beds,baths,sqft,year_built,rehosted_url,prop_type',
    {headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
  .then(function(r){return r.json();})
  .then(function(rows){ ALL=rows||[]; render();
    fetch(SB+'/rest/v1/rpc/reviewed_listings',{method:'POST',
      headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_market_id:${M.id}})})
    .then(function(r){return r.json();})
    .then(function(list){ (list||[]).forEach(function(x){ RV[x.mls_number]=x; }); if(Object.keys(RV).length) render(); })
    .catch(function(){});
  })
  .catch(function(){
    document.getElementById('alGrid').innerHTML='<p class="sub">Couldn\u2019t load live listings \u2014 refresh to try again.</p>';
  });
})();
`;
  const body = `
<header class="page-hero" style="padding-bottom:36px"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a></div>
  <span class="eyebrow"><span class="live-dot"></span>Live from the MLS \u00b7 refreshed twice daily</span>
  <h1><span id="alCount">\u2014</span> homes for sale in ${M.city} <em>right now.</em></h1>
  <p class="sub">Every active listing in ${M.zipsLabel}, each connected to its full record — the tract, the street, the sale history, and what the comps actually say about the price.</p>
</div></header>
<style>
.listing-card--rv{border-color:var(--apricot);box-shadow:0 0 0 1.5px var(--apricot),0 10px 28px rgba(193,84,40,.14)}
.listing-card--rv:hover{box-shadow:0 0 0 1.5px var(--apricot),0 14px 34px rgba(193,84,40,.2)}
.rv-badge{position:absolute;top:12px;right:12px;background:var(--apricot);color:#fff;font-family:'JetBrains Mono',monospace;font-size:.56rem;letter-spacing:.1em;text-transform:uppercase;border-radius:999px;padding:5px 11px;box-shadow:0 4px 12px rgba(18,21,29,.25)}
.listing-card .ph,.al-spot .ph{position:relative}
.rv-cta{color:var(--apricot);font-weight:600}
.rv-btn{border:1.5px solid var(--apricot);color:var(--apricot);background:transparent}
</style>
<section class="pg" style="padding-top:10px"><div class="wrap">
  <div class="filter-bar" data-reveal-self>
    <div class="filter-group"><div class="fl">Property type</div>
      <div class="pillbar" id="fType">
        <button class="pill-t on" data-v="all">All</button>
        <button class="pill-t" data-v="Single Family">House</button>
        <button class="pill-t" data-v="Condominium">Condo</button>
        <button class="pill-t" data-v="Townhouse">Townhome</button>
      </div></div>
    <div class="filter-group"><div class="fl">Price</div>
      <div class="pillbar" id="fPrice">
        <button class="pill-t on" data-v="all">All</button>
        <button class="pill-t" data-v="0-2000000">Under $2M</button>
        <button class="pill-t" data-v="2000000-3000000">$2M\u2013$3M</button>
        <button class="pill-t" data-v="3000000-">$3M+</button>
      </div></div>
    <div class="filter-group"><div class="fl">Bedrooms</div>
      <div class="pillbar" id="fBeds">
        <button class="pill-t on" data-v="all">All</button>
        <button class="pill-t" data-v="2">2+</button>
        <button class="pill-t" data-v="3">3+</button>
        <button class="pill-t" data-v="4">4+</button>
        <button class="pill-t" data-v="5">5+</button>
      </div></div>
  </div>
  <div class="al-toolbar">
    <div class="al-count" id="alResult"></div>
    <select class="al-sort" id="alSort" aria-label="Sort listings">
      <option value="price_desc">Price \u00b7 high to low</option>
      <option value="price_asc">Price \u00b7 low to high</option>
      <option value="ppsf_desc">$/sf \u00b7 high to low</option>
      <option value="sqft_desc">Largest first</option>
    </select>
  </div>
  <div id="alSpot"></div>
  <div class="listing-grid" id="alGrid"></div>
  <p class="map-note" style="margin-top:22px">Listing data from MLSListings, deemed reliable but not guaranteed. Buyers should verify all information independently.</p>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <div class="split">
    <div>
      <span class="eyebrow">Not seeing it?</span>
      <h2>The home you want probably <em>isn't listed.</em></h2>
      <p class="sub" style="margin-top:14px">A few dozen listings — out of ${mktDerived().homes.toLocaleString('en-US')} homes. The one you actually want is in the index, and its owner has a number. <a href="/how-it-works/" style="color:var(--apricot)">Here's how to pursue it \u2192</a></p>
    </div>
    ${toolCta({
      eyebrow: "Before you make an offer",
      lead: `Weighing one of these? Get a complete disclosure review from ${M.agent.first} within 24 hours, and run the comps before you write.`,
      actions: [
        { label: "Request a disclosure review", href: `https://app.${M.domain}/tools/review` },
        { label: "Build a CMA", href: `https://app.${M.domain}/tools/cma` }
      ],
      note: `Reviewed personally by ${M.agent.first}, usually within 24 hours · free · no obligation.`
    })}
  </div>
</div></section>
<script>${clientJs}</script>`;
  return shell(title, desc, '/active-listings/', body, null, null);
}


async function renderListingDetail(mls, D, M) {
  const REST = 'https://qinuukntpyulqjzndnho.supabase.co/rest/v1/mls_feed_listings';
  const KEY = 'sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
  let l = null;
  try {
    const r = await fetch(REST + '?mls_number=eq.' + encodeURIComponent(mls) + '&market_id=eq.' + M.id +
      '&select=mls_number,status,address_raw,address_norm,property_slug,price,beds,baths,sqft,lot_sqft,year_built,prop_type,description,photos,photo_count,rehosted_url,first_seen',
      { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } });
    const rows = await r.json();
    l = Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (e) { l = null; }
  if (!l) return null;

  /* ── Published CMA / disclosure cheat sheet for THIS address ──────────────
     Presence is checked server-side via ai_reports_for_property (anon-safe:
     metadata only, never tokens). Tokens are released ONLY by
     get_report_access after an email is captured — the block below renders
     nothing at all when no published report exists, so the promise is never
     made on a home that cannot keep it. */
  let reportsBlock = '';
  try {
    const rr = await fetch('https://qinuukntpyulqjzndnho.supabase.co/rest/v1/rpc/ai_reports_for_property',
      { method: 'POST', headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_market_id: M.id, p_address: l.address_norm || l.address_raw }) });
    const reports = rr.ok ? await rr.json() : [];
    const real = Array.isArray(reports) ? reports.filter(x => x && x.kind) : [];
    if (real.length) {
      const hasD = real.some(x => x.kind === 'disclosure_review');
      const hasC = real.some(x => x.kind === 'cma');
      const what = hasD && hasC ? 'the disclosure cheat sheet and the CMA'
                 : hasD ? 'the disclosure cheat sheet' : 'the comparative market analysis';
      const items = real.map(x =>
        '<li><b>' + (x.kind === 'cma' ? 'Comparative Market Analysis' : 'Disclosure Cheat Sheet') + '</b>' +
        (x.headline ? ' — ' + esc(x.headline) : '') +
        (x.risk_level ? ' <span class="rpt-risk">' + esc(x.risk_level) + '</span>' : '') + '</li>').join('');
      const portrait = M.agent.reviewImg
        ? `<div class="rpt-agent"><img src="${M.agent.reviewImg}" alt="${esc(M.agent.name)}, the agent who reviewed this package" width="300" height="300" loading="lazy">
           <p class="rpt-agent-cap">Reviewed personally by <b>${esc(M.agent.name)}</b><br>CA DRE #${esc(M.agent.dre)}</p></div>`
        : '';
      reportsBlock = `
<section class="pg rpt-section" id="reviewed" style="background:var(--bg-2)"><div class="wrap">
  <div class="rpt-grid${portrait ? '' : ' rpt-grid--solo'}">
    ${portrait}
    <div>
      <div class="section-head" style="margin-bottom:18px">
        <span class="eyebrow">Reviewed for this home</span>
        <h2>We read the paperwork <em>so you don't have to.</em></h2>
        <p class="sub" style="margin-top:12px">${M.agent.first} has prepared ${what} for this address. Every finding names the report it came from. One click and it's yours.</p>
      </div>
      <div class="rpt-card">
        <ul class="rpt-list">${items}</ul>
        <div class="rpt-form" data-rpt>
          <input type="email" class="rpt-in" data-rpt-email placeholder="you@email.com" autocomplete="email">
          <button class="rpt-btn" data-rpt-go>Get ${hasD && hasC ? 'both' : 'it'} free</button>
        </div>
        <p class="rpt-note">Sent to your screen immediately — no call required. ${M.agent.first} may follow up once.</p>
        <div class="rpt-out" data-rpt-out hidden></div>
      </div>
    </div>
  </div>
</div></section>
<style>
.rpt-grid{display:grid;grid-template-columns:300px minmax(0,640px);gap:40px;align-items:start}
.rpt-grid--solo{grid-template-columns:minmax(0,640px)}
@media(max-width:840px){.rpt-grid{grid-template-columns:1fr}.rpt-agent{max-width:240px}}
.rpt-agent img{width:100%;height:auto;border-radius:18px;border:1px solid rgba(32,36,46,.13);box-shadow:0 10px 30px rgba(18,21,29,.10);display:block}
.rpt-agent-cap{font-size:13px;line-height:1.55;color:rgba(32,36,46,.62);margin-top:12px}
.rpt-section .rpt-card{background:#fff;border:1px solid rgba(32,36,46,.13);border-radius:14px;padding:24px}
.rpt-list li{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rpt-list{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:8px;font-size:14.5px}
.rpt-risk{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  background:rgba(193,84,40,.08);color:#c15428;border-radius:999px;padding:2px 9px;margin-left:6px}
.rpt-form{display:flex;gap:8px;flex-wrap:wrap}
.rpt-in{flex:1;min-width:200px;border:1px solid rgba(32,36,46,.16);border-radius:10px;padding:11px 13px;font:inherit;font-size:14.5px}
.rpt-in:focus{outline:none;border-color:#c15428}
.rpt-btn{appearance:none;background:#c15428;color:#fff;border:0;border-radius:10px;padding:11px 20px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}
.rpt-btn[disabled]{opacity:.5}
.rpt-note{font-size:12px;color:rgba(32,36,46,.45);margin-top:10px}
.rpt-out{margin-top:14px;font-size:14.5px}
.rpt-out a{display:block;color:#c15428;font-weight:600;text-decoration:none;margin-top:6px}
.rpt-unlocked{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px}
@media(max-width:700px){.rpt-unlocked{grid-template-columns:1fr}}
.rpt-doc{display:block;background:#fff;border:1.5px solid #c15428;border-radius:14px;padding:18px 18px 16px;
  text-decoration:none;color:inherit;box-shadow:0 12px 32px rgba(193,84,40,.16);
  animation:rptPop .45s cubic-bezier(.2,.9,.3,1.2) both;transition:transform .15s,box-shadow .15s}
.rpt-doc:hover{transform:translateY(-3px);box-shadow:0 18px 40px rgba(193,84,40,.24)}
.rpt-doc-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  color:#c15428;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.rpt-doc p{font-size:13.5px;line-height:1.55;color:rgba(32,36,46,.78);margin:0 0 10px;
  display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.rpt-score{font-size:12.5px;color:rgba(32,36,46,.6);margin-bottom:10px}
.rpt-open{font-weight:700;font-size:14px;color:#c15428}
@keyframes rptPop{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
.rpt-modal-veil{position:fixed;inset:0;background:rgba(18,21,29,.55);backdrop-filter:blur(3px);z-index:220;
  display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s}
.rpt-modal-veil.on{opacity:1}
.rpt-modal{position:relative;background:#faf7f2;border-radius:18px;max-width:640px;width:100%;max-height:88vh;overflow:auto;
  padding:30px 30px 24px;box-shadow:0 30px 80px rgba(18,21,29,.4);transform:translateY(16px) scale(.97);transition:transform .3s cubic-bezier(.2,.9,.3,1.15)}
.rpt-modal-veil.on .rpt-modal{transform:none}
.rpt-m-x{position:absolute;top:12px;right:14px;appearance:none;background:none;border:0;font-size:26px;line-height:1;
  color:rgba(32,36,46,.45);cursor:pointer;padding:6px}
.rpt-m-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#c15428}
.rpt-m-h{font-family:'Playfair Display',serif;font-size:1.7rem;margin:6px 0 18px;color:#20242e}
.rpt-m-btns{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}
@media(max-width:600px){.rpt-m-btns{grid-template-columns:1fr}}
.rpt-m-btn{display:block;background:#c15428;border-radius:12px;padding:15px 16px;text-decoration:none;
  box-shadow:0 10px 24px rgba(193,84,40,.3);transition:transform .15s,box-shadow .15s}
.rpt-m-btn:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(193,84,40,.38)}
.rpt-m-big{display:block;color:#fff;font-weight:700;font-size:15.5px}
.rpt-m-small{display:block;color:rgba(255,255,255,.82);font-size:12px;margin-top:4px}
.rpt-m-how{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:16px 18px}
.rpt-m-how ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.rpt-m-how li{font-size:13.5px;line-height:1.55;color:rgba(32,36,46,.8)}
.rpt-m-note{font-size:12px;color:rgba(32,36,46,.5);margin:14px 0 0}
</style>
<script>
(function(){
  var box=document.querySelector('[data-rpt]'); if(!box) return;
  var input=document.querySelector('[data-rpt-email]'), btn=document.querySelector('[data-rpt-go]'),
      out=document.querySelector('[data-rpt-out]');
  function vid(){ try{return localStorage.getItem('cb_vid')||null;}catch(e){return null;} }
  btn.addEventListener('click', function(){
    var email=(input.value||'').trim();
    if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){ input.style.borderColor='#a8431f'; return; }
    btn.disabled=true; btn.textContent='One moment\u2026';
    if(window.CBTrack) CBTrack.event('cta_click',{cta:'report_access',mls:'${l.mls_number}'});
    fetch('https://qinuukntpyulqjzndnho.supabase.co/rest/v1/rpc/get_report_access',{
      method:'POST',
      headers:{'apikey':'${KEY}','Authorization':'Bearer ${KEY}','Content-Type':'application/json'},
      body:JSON.stringify({p_market_id:${M.id},p_address:${JSON.stringify('')}+document.querySelector('[data-rpt]').getAttribute('data-addr'),p_email:email,p_mls:'${l.mls_number}',p_visitor:vid()})
    }).then(function(r){return r.json();}).then(function(j){
      if(j&&j.ok&&j.reports&&j.reports.length){
        out.hidden=false;
        function eshtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        out.innerHTML='<div class="rpt-unlocked">'+j.reports.map(function(x,i){
          var isCma=x.kind==='cma';
          var href=(isCma?'/cma/':'/disclosure/')+'?token='+encodeURIComponent(x.token);
          var eyebrow=isCma?'Comparative Market Analysis':'Disclosure Cheat Sheet';
          var badge=!isCma&&x.risk_level?'<span class="rpt-risk">'+eshtml(x.risk_level)+' risk</span>':'';
          var lead=isCma
            ? (x.n_comps?('<p>'+x.n_comps+' recorded sales, selected and adjusted to this exact home \u2014 beds, baths, and square footage accounted for.</p>'):'<p>Recorded comparable sales, selected and adjusted to this exact home.</p>')
            : (x.headline?('<p>'+eshtml(x.headline)+'</p>'):'<p>Every finding sourced to the report it came from, with a repair budget.</p>');
          var scoreLine=(!isCma&&x.score!=null)?'<div class="rpt-score">Condition score <b>'+x.score+'</b> / 100</div>':'';
          return '<a class="rpt-doc" style="animation-delay:'+(i*120)+'ms" href="'+href+'">'+
            '<div class="rpt-doc-k">'+eyebrow+badge+'</div>'+lead+scoreLine+
            '<span class="rpt-open">Open it \u2192</span></a>';
        }).join('')+'</div>';
        box.hidden=true;
        // Unlock modal: the moment of delivery + why these documents are different.
        var mv=document.createElement('div');
        mv.className='rpt-modal-veil';
        var docBtns=j.reports.map(function(x){
          var isCma=x.kind==='cma';
          var href=(isCma?'/cma/':'/disclosure/')+'?token='+encodeURIComponent(x.token);
          var big=isCma?'Open the CMA':'Open the Disclosure Cheat Sheet';
          var small=isCma
            ? ((x.n_comps?x.n_comps+' recorded sales':'Recorded sales')+', adjusted to this exact home')
            : ((x.risk_level?x.risk_level.charAt(0).toUpperCase()+x.risk_level.slice(1)+' risk':'Sourced findings')+(x.score!=null?' \u00b7 condition score '+x.score+'/100':''));
          return '<a class="rpt-m-btn" href="'+href+'"><span class="rpt-m-big">'+big+' \u2192</span><span class="rpt-m-small">'+eshtml(small)+'</span></a>';
        }).join('');
        mv.innerHTML='<div class="rpt-modal" role="dialog" aria-label="Your documents">'+
          '<button class="rpt-m-x" aria-label="Close">&times;</button>'+
          '<div class="rpt-m-k">Unlocked</div>'+
          '<h3 class="rpt-m-h">Both documents are yours.</h3>'+
          '<div class="rpt-m-btns">'+docBtns+'</div>'+
          '<div class="rpt-m-how"><div class="rpt-m-k" style="margin-bottom:8px">How these were made</div>'+
            '<ul>'+
            '<li><b>Every page, actually read.</b> ${M.agent.first} reviewed the seller\u2019s full disclosure package \u2014 inspections, pest, roof, sewer, title, and the seller\u2019s own questionnaires \u2014 cover to cover.</li>'+
            '<li><b>Every finding names its source.</b> Each item on the cheat sheet cites the exact report, section, and page it came from. Nothing unsourced gets published.</li>'+
            '<li><b>A condition score you can compare.</b> The 0\u2013100 score summarizes the whole package, and the repair budget separates formal contractor bids from estimates \u2014 tiered by what needs money now versus later.</li>'+
            '<li><b>A CMA from recorded sales only.</b> Comparable homes are selected and adjusted for beds, baths, and square footage under fixed rules \u2014 the same discipline an appraiser uses, never a guess.</li>'+
            '</ul></div>'+
          '<p class="rpt-m-note">These links stay on this page too \u2014 come back to them anytime.</p>'+
        '</div>';
        document.body.appendChild(mv);
        requestAnimationFrame(function(){ mv.classList.add('on'); });
        function closeModal(){ mv.classList.remove('on'); setTimeout(function(){ if(mv.parentNode) mv.parentNode.removeChild(mv); }, 250); }
        mv.addEventListener('click', function(e){ if(e.target===mv) closeModal(); });
        mv.querySelector('.rpt-m-x').addEventListener('click', closeModal);
        document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ closeModal(); document.removeEventListener('keydown', esc); } });
        if(window.CBTrack) CBTrack.event('conversion',{kind:'report_access',mls:'${l.mls_number}'});
      } else {
        btn.disabled=false; btn.textContent='Try again';
        out.hidden=false; out.textContent='That did not go through ('+((j&&j.error)||'error')+'). Please try again.';
      }
    }).catch(function(){ btn.disabled=false; btn.textContent='Try again';
      out.hidden=false; out.textContent='Network hiccup \u2014 please try again.'; });
  });
})();
</script>`;
      // the address the RPC will match on, attached as data so the inline JS
      // never needs server-side string interpolation of free text
      reportsBlock = reportsBlock.replace('data-rpt>', 'data-rpt data-addr="' + esc(l.address_norm || l.address_raw) + '">');
    }
  } catch (e) { reportsBlock = ''; }
  if (l.status !== 'Active' && l.property_slug) {
    return { redirect: '/home/' + l.property_slug + '/' };
  }
  const sold = l.status !== 'Active';

  const photos = Array.isArray(l.photos) && l.photos.length ? l.photos
    : (l.rehosted_url ? [l.rehosted_url] : []);
  const cover = photos[0] || '';

  // record context from the index
  const p = l.property_slug ? D.bySlug.get(l.property_slug) : null;
  const tract = p && p.ts && D.tracts[p.ts] ? D.tracts[p.ts] : null;
  let tractPpsf = null, tractSales = null;
  if (p && p.ts) {
    try {
      const intel = JSON.parse(DS().intel);
      const ti = intel.tracts[p.ts];
      if (ti) {
        const h = ti.h3 && ti.h3.ppsf ? ti.h3 : (ti.h5 && ti.h5.ppsf ? ti.h5 : ti.h10);
        if (h && h.ppsf) { tractPpsf = h.ppsf; tractSales = h.n; }
      }
    } catch (e) {}
  }
  const ppsf = (l.price && l.sqft) ? Math.round(l.price / l.sqft) : null;
  const tractDelta = (ppsf && tractPpsf) ? Math.round((ppsf / tractPpsf - 1) * 100) : null;

  const addr = l.address_raw + `, ${M.city}, CA ${M.zipsLabel}`;
  const title = sold
    ? ('Sold ' + money(l.price) + ' \u2014 ' + l.address_raw + `, ${M.city}, CA ${M.zipsLabel} | Recent Sale | ${M.name}`)
    : (money(l.price) + ' \u2014 ' + l.address_raw + `, ${M.city}, CA ${M.zipsLabel} | For Sale | ${M.name}`);
  const desc = sold
    ? (`Recently sold in ${M.city}: ` + l.address_raw + ' \u2014 ' + [l.beds ? l.beds + ' bed' : '', l.baths ? l.baths + ' bath' : '', l.sqft ? num(l.sqft) + ' sq ft' : ''].filter(Boolean).join(', ') +
      (ppsf ? ' at $' + num(ppsf) + '/sf' : '') + '. Closed sale with photos, specs, and market context from the complete city record.')
    : (`For sale in ${M.city}: ` + l.address_raw + ' \u2014 ' + [l.beds ? l.beds + ' bed' : '', l.baths ? l.baths + ' bath' : '', l.sqft ? num(l.sqft) + ' sq ft' : ''].filter(Boolean).join(', ') +
      (ppsf ? ' at $' + num(ppsf) + '/sf' : '') + '. Live MLS listing with full photo gallery, tract context, and the complete home record.');

  const specs = [
    l.beds != null ? { v: l.beds, l: 'Beds' } : null,
    l.baths != null ? { v: l.baths, l: 'Baths' } : null,
    l.sqft ? { v: num(l.sqft), l: 'Sq Ft' } : null,
    l.lot_sqft ? { v: num(l.lot_sqft), l: 'Lot Sq Ft' } : null,
    l.year_built ? { v: l.year_built, l: 'Built' } : null,
    ppsf ? { v: '$' + num(ppsf), l: 'Per Sq Ft' } : null,
  ].filter(Boolean);

  const remark = l.description ? String(l.description).replace(/\.\.\.$|\u2026$/, '').trim() : null;

  const galleryJs = `
(function(){
  var photos = ` + JSON.stringify(photos) + `;
  var main = document.getElementById('ldMainImg');
  var thumbs = document.querySelectorAll('.ld-thumbs button');
  var idx = 0;
  function show(i){
    if(!photos.length) return;
    idx = (i + photos.length) % photos.length;
    main.src = photos[idx];
    var c = document.getElementById('ldCount');
    if(c) c.textContent = (idx+1) + ' / ' + photos.length;
    thumbs.forEach(function(b,bi){ b.classList.toggle('on', bi === idx); });
  }
  thumbs.forEach(function(b,bi){ b.addEventListener('click', function(){ show(bi); }); });
  var mainWrap = document.getElementById('ldMain');
  if(mainWrap) mainWrap.addEventListener('click', function(){ show(idx+1); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'ArrowRight') show(idx+1);
    if(e.key === 'ArrowLeft') show(idx-1);
  });
})();
`;

  const thumbsHtml = photos.length > 1
    ? '<div class="ld-thumbs">' + photos.map((u, i) =>
        `<button type="button" class="${i === 0 ? 'on' : ''}" aria-label="Photo ${i + 1}"><img loading="lazy" src="${u}" alt="${esc(l.address_raw)} photo ${i + 1}"></button>`).join('') + '</div>'
    : '';

  const contextTiles = [
    tract ? `<div class="tile"><div class="eyebrow" style="margin-bottom:6px">The tract</div><h3 style="font-size:1.05rem;margin-bottom:6px"><a href="/tract/${p.ts}/" style="color:var(--ivory)">${esc(tract.name)}</a></h3><p style="font-size:.85rem;color:var(--slate)">${tractPpsf ? 'Recent median $' + num(tractPpsf) + '/sf across ' + num(tractSales) + ' sales.' : num(tract.n) + ' homes on record in this tract.'}${tractDelta != null ? ' This asking price runs <b style="color:var(--apricot)">' + (tractDelta >= 0 ? '+' : '') + tractDelta + '%</b> vs the tract median $/sf.' : ''}</p></div>` : '',
    p ? `<div class="tile"><div class="eyebrow" style="margin-bottom:6px">The record</div><h3 style="font-size:1.05rem;margin-bottom:6px"><a href="/home/${l.property_slug}/" style="color:var(--ivory)">Full home record \u2192</a></h3><p style="font-size:.85rem;color:var(--slate)">County file, sale history, comps, and the street ledger for this exact parcel.</p></div>` : ''
  ].filter(Boolean).join('');
  // The only link that leaves this listing lives at the very bottom, after every
  // conversion path has been offered.
  const exitTile = `<section class="pg" style="padding-top:0"><div class="wrap">
  <div class="ld-context"><div class="tile"><div class="eyebrow" style="margin-bottom:6px">The market</div><h3 style="font-size:1.05rem;margin-bottom:6px"><a href="/active-listings/" style="color:var(--ivory)">All ${M.city} listings \u2192</a></h3><p style="font-size:.85rem;color:var(--slate)">Every home for sale in ${M.zipsLabel} right now, filterable by type, price, and beds.</p></div></div>
</div></section>`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'RealEstateListing',
    name: l.address_raw + `, ${M.city}, CA ${M.zipsLabel}`, url: `https://${M.domain}/for-sale/` + l.mls_number + '/',
    image: photos.slice(0, 5),
    offers: { '@type': 'Offer', price: l.price, priceCurrency: 'USD', availability: sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' },
    address: { '@type': 'PostalAddress', streetAddress: l.address_raw, addressLocality: `${M.city}`, addressRegion: 'CA', postalCode: `${M.zipsLabel}` }
  });

  const body = `
<header class="page-hero" style="padding-bottom:26px"><div class="wrap">
  <div class="crumbs"><a href="/">${M.city} ${M.zipsLabel}</a> / ${sold ? '<a href="/recent-sales/">Recent sales</a>' : '<a href="/active-listings/">For sale</a>'}</div>
  <span class="eyebrow">${sold ? '' : '<span class="live-dot"></span>'}${sold ? 'Sold' : 'Active listing'} \u00b7 MLS# ${esc(l.mls_number)}${l.prop_type ? ' \u00b7 ' + esc(l.prop_type) : ''}</span>
</div></header>
<section class="pg" style="padding-top:6px"><div class="wrap">
  <div class="ld-gallery">
    <div class="ld-main" id="ldMain" title="Click for next photo">
      ${cover ? `<img id="ldMainImg" src="${cover}" alt="${esc(addr)}">` : `<div class="ld-nophoto">Photos coming soon</div>`}
      <span class="price-chip"><span class="dot"></span>${sold ? 'Sold ' : ''}${money(l.price)}</span>
      ${photos.length > 1 ? `<span class="ld-count" id="ldCount">1 / ${photos.length}</span>` : ''}
    </div>
    ${thumbsHtml}
  </div>
  <div class="ld-head">
    <div>
      <div class="ld-price">${money(l.price)}</div>
      <div class="ld-addr">${esc(addr)}</div>
      <div class="ld-sub">${[l.beds ? l.beds + ' bd' : '', l.baths ? l.baths + ' ba' : '', l.sqft ? num(l.sqft) + ' sf' : '', l.year_built ? 'built ' + l.year_built : ''].filter(Boolean).join(' \u00b7 ')}</div>
    </div>
    <div class="ld-head-cta">
      <a class="btn btn-gold" href="#tour">${sold ? 'Ask ' + M.agent.first + ' about this sale' : 'Tour this home'} \u2192</a>
      <a class="btn btn-line ld-mls" href="https://search.mlslistings.com/Matrix/Public/Portal.aspx?ID=0-1125149115-00&agt=1&L=1" target="_blank" rel="noopener">View on MLSListings \u2197</a>
    </div>
  </div>
  <div class="ld-specband" data-reveal>
    ${specs.map(s => `<div data-reveal-child><div class="sv">${s.v}</div><div class="sl">${s.l}</div></div>`).join('')}
  </div>
</div></section>
${reportsBlock}
<section class="pg" style="padding-top:0"><div class="wrap">
  ${remark ? `<div class="ld-remarks">\u201c${esc(remark)}\u2026\u201d<span class="src">Listing remarks (excerpt) \u00b7 via MLSListings</span></div>` : ''}
  <div class="ld-context">${contextTiles}</div>
  <p class="map-note">Listing data and photographs from MLSListings, deemed reliable but not guaranteed. Buyers should verify all information independently. ${M.name} is not the listing brokerage unless stated.</p>
</div></section>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Before you make an offer</span>
  <h2>Get the edge <em>before you write.</em></h2>
  <p class="sub">Two free tools that tell you what this home is really worth &mdash; and what the disclosures actually say.</p></div>
  ${featureCards([
    { icon: ICO.doc, title: `Disclosure review from ${M.agent.first}`, lead: `Send ${M.agent.first} this listing and get a personal read within 24 hours — the fine print that matters, before you write.`, list: ["A plain-English cheat sheet: roof, foundation, permits, past repairs", "A detailed CMA — what it\'s really worth vs. the asking price", "What a compelling, winning offer looks like here"], cta: { label: "Request a disclosure review", href: `https://app.${M.domain}/tools/review` } },
    { icon: ICO.chart, title: "Build your own CMA", lead: "Price it like an agent. Pull this home and the real comps around it for an instant value range — in two minutes.", list: [`Search every recent ${M.city} sale as a comp`, "An instant $/sf value range against the asking price", `Free — save it, and ${M.agent.first} can sanity-check your number`], cta: { label: "Build a CMA", href: `https://app.${M.domain}/tools/cma` } }
  ])}
</div></section>
${sold ? '' : `<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Run the numbers</span>
  <h2>What would this cost <em>per month?</em></h2>
  <p class="sub">A quick estimate on this home\'s asking price. Adjust the down payment, rate, and term to see your payment move.</p></div>
  ${mortgageCalc(l.price)}
</div></section>`}
<section class="pg" id="tour"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Book time with ${M.agent.first}</span>
  <h2>Tour it, or talk it <em>through.</em></h2>
  <p class="sub">Grab a time that works — a private tour, a second opinion on the price, or a walk through the disclosures.</p></div>
  ${tourWidget(l, addr)}
</div></section>
${exitTile}
<script type="application/ld+json">${jsonLd}</script>
<script>${galleryJs}</script>`;
  return { html: shell(title, desc, '/for-sale/' + l.mls_number + '/', body, null, null, photos[0] || null) };
}

/* Dataset miss -> database. Returns the same row shape the dataset uses, so
   renderHome needs no new field handling. Any failure returns null and the
   caller renders the normal 404. */
async function fetchPropertyRecord(M, slug) {
  const row = await rptRpc('get_property_record', { p_market_id: M.id, p_slug: slug });
  return (row && row.s) ? row : null;
}

/* ---------- router ---------- */

/* ── PUBLIC REPORT PAGES — /disclosure/?token= and /cma/?token= ─────────────
   The pages the for-sale gate links to. Token is the whole credential;
   the RPCs return PUBLISHED reports only, and unsourced findings are
   filtered server-side. noindex + no-store: these are earned links, not SEO.
   Each cross-links its counterpart only when that counterpart is published. */

const RPT_KEY = 'sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
async function rptRpc(fn, body) {
  try {
    const r = await fetch('https://qinuukntpyulqjzndnho.supabase.co/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': RPT_KEY, 'Authorization': 'Bearer ' + RPT_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
function rptMoney(n) {
  if (n == null || n === '' || isNaN(Number(n))) return '\u2014';
  return '$' + Number(n).toLocaleString('en-US');
}
function rptCss() {
  return `
.rpt-page{max-width:880px;margin:0 auto;padding:36px 20px 90px}
.rpt-eyebrow{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--apricot);margin-bottom:10px}
.rpt-page h1{font-family:'Playfair Display',serif;font-size:clamp(1.7rem,4vw,2.5rem);line-height:1.12;margin:0 0 8px}
.rpt-sub{color:#5d6575;font-size:.95rem;margin-bottom:22px}
.rpt-strip{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 26px}
.rpt-chip{border:1px solid rgba(32,36,46,.14);border-radius:999px;padding:6px 14px;font-size:.82rem;background:#fff}
.rpt-chip b{font-weight:600}
.rpt-score{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:86px;height:86px;border-radius:50%;border:3px solid var(--apricot);background:#fff;font-family:'Playfair Display',serif}
.rpt-score .v{font-size:1.7rem;line-height:1}
.rpt-score .l{font-family:'JetBrains Mono',monospace;font-size:.44rem;letter-spacing:.14em;text-transform:uppercase;color:#5d6575;margin-top:3px}
.rpt-risk{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;border-radius:999px;padding:5px 13px}
.rpt-risk.low{background:rgba(63,125,78,.1);color:#3f7d4e}
.rpt-risk.moderate{background:rgba(176,125,36,.12);color:#8a6015}
.rpt-risk.elevated{background:rgba(168,67,31,.1);color:#a8431f}
.rpt-head{display:flex;gap:22px;align-items:center;margin-bottom:26px;flex-wrap:wrap}
.rpt-headline{font-size:1.06rem;line-height:1.55;font-weight:500;max-width:56ch}
.rpt-sec{margin:34px 0 0}
.rpt-sec h2{font-family:'Playfair Display',serif;font-size:1.28rem;margin:0 0 14px}
.rpt-sec h2 em{color:var(--apricot);font-style:italic}
.rpt-find{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:16px 18px;margin-bottom:11px}
.rpt-find h3{font-size:.98rem;margin:0 0 6px}
.rpt-find p{margin:0;font-size:.92rem;line-height:1.6;color:#3a3f4c}
.rpt-src{display:block;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:.62rem;color:#8a8f9c}
.rpt-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;overflow:hidden;font-size:.88rem}
.rpt-table th{font-family:'JetBrains Mono',monospace;font-size:.56rem;letter-spacing:.12em;text-transform:uppercase;color:#8a8f9c;text-align:left;padding:10px 14px;border-bottom:1px solid rgba(32,36,46,.1)}
.rpt-table td{padding:10px 14px;border-bottom:1px solid rgba(32,36,46,.07);color:#3a3f4c}
.rpt-table tr:last-child td{border-bottom:0}
.rpt-table .num{text-align:right;white-space:nowrap}
.rpt-table .subtotal td{font-weight:600;background:rgba(193,84,40,.05)}
.rpt-basis{font-family:'JetBrains Mono',monospace;font-size:.62rem;color:#8a8f9c}
.rpt-q{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:6px 18px}
.rpt-q li{margin:11px 0;font-size:.92rem;line-height:1.55;color:#3a3f4c}
.rpt-bottom{background:var(--chrome,#12151d);color:#ece7db;border-radius:14px;padding:24px 26px;margin-top:36px}
.rpt-bottom h2{font-family:'Playfair Display',serif;font-size:1.25rem;margin:0 0 10px;color:#fff}
.rpt-bottom p{margin:0;line-height:1.65;font-size:.95rem;color:#c6cbd6}
.rpt-cross{display:inline-block;margin-top:26px;background:var(--apricot);color:#fff;border-radius:11px;padding:13px 22px;font-weight:600;text-decoration:none}
.rpt-cross.ghost{background:transparent;border:1.5px solid var(--apricot);color:var(--apricot);margin-left:10px}
.rpt-meta{margin-top:34px;padding-top:18px;border-top:1px solid rgba(32,36,46,.12);font-size:.74rem;color:#8a8f9c;line-height:1.7}
.rpt-scatter{background:#fff;border:1px solid rgba(32,36,46,.12);border-radius:12px;padding:14px;margin-top:10px}
.rpt-scatter text{font-family:'JetBrains Mono',monospace;font-size:9px;fill:#8a8f9c}
@media print{
  header,footer,.rpt-cross,.site-header,.site-footer,nav{display:none !important}
  body{background:#fff}
  .rpt-page{padding:0;max-width:none}
  .rpt-find,.rpt-table,.rpt-q{break-inside:avoid;border-color:#ccc}
  .rpt-bottom{background:#fff;color:#111;border:2px solid #111}
  .rpt-bottom h2{color:#111}.rpt-bottom p{color:#333}
}`;
}

async function renderDisclosureSheet(token) {
  const d = await rptRpc('get_published_disclosure', { p_token: token });
  if (!d || d.ok !== true) return null;
  const F = Array.isArray(d.key_findings) ? d.key_findings : [];
  const bySec = (s) => F.filter((f) => (f.section || 'confirm') === s);
  const findCard = (f) =>
    `<div class="rpt-find"><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p><span class="rpt-src">${esc(f.source)}</span></div>`;
  const section = (title, em, list) => list.length
    ? `<section class="rpt-sec"><h2>${title} <em>${em}</em></h2>${list.map(findCard).join('')}</section>` : '';

  const flags = Array.isArray(d.financial_flags) ? d.financial_flags : [];
  const tierRows = (tier) => flags.filter((x) => (x.tier || 'near_term') === tier);
  const row = (x) => `<tr><td>${esc(x.item)}</td><td class="rpt-basis">${esc(x.basis || 'Estimate')}</td>` +
    `<td class="num">${rptMoney(x.low)}</td><td class="num">${rptMoney(x.high)}</td></tr>`;
  const sum = (list, k) => list.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const near = tierRows('near_term'), def = tierRows('deferrable'), cont = tierRows('contingent');
  let budget = '';
  if (flags.length) {
    budget = `<section class="rpt-sec"><h2>What to <em>budget for</em></h2>
<table class="rpt-table"><thead><tr><th>Item</th><th>Basis</th><th class="num">Low</th><th class="num">High</th></tr></thead><tbody>
${near.map(row).join('')}
${near.length ? `<tr class="subtotal"><td colspan="2">Near-term subtotal</td><td class="num">${rptMoney(sum(near,'low'))}</td><td class="num">${rptMoney(sum(near,'high'))}</td></tr>` : ''}
${def.map(row).join('')}${cont.map(row).join('')}
${flags.length > near.length ? `<tr class="subtotal"><td colspan="2">All items</td><td class="num">${rptMoney(sum(flags,'low'))}</td><td class="num">${rptMoney(sum(flags,'high'))}</td></tr>` : ''}
</tbody></table>
<p style="font-size:.76rem;color:#8a8f9c;margin-top:8px">Figures labeled "Formal bid" are the contractor's own numbers from the package. Everything else is a planning estimate — not a quote. Get trade bids before removing contingencies.</p></section>`;
  }

  const qs = Array.isArray(d.questions_to_ask) ? d.questions_to_ask : [];
  const questions = qs.length
    ? `<section class="rpt-sec"><h2>Confirm these <em>before you write</em></h2><ol class="rpt-q">${qs.map((q) => `<li>${esc(q)}</li>`).join('')}</ol></section>` : '';

  const cross = d.cma_token
    ? `<a class="rpt-cross" href="/cma/?token=${encodeURIComponent(d.cma_token)}">See the CMA — the recorded comps →</a>` : '';

  const body = `<div class="rpt-page">
<p class="rpt-eyebrow">Disclosure cheat sheet · ${esc(M.name)}</p>
<h1>${esc(d.address)}</h1>
<p class="rpt-sub">${esc(M.city)}, CA${d.mls ? ' · MLS ' + esc(d.mls) : ''} · reviewed ${esc(String(d.published_at || '').slice(0, 10))}</p>
<div class="rpt-head">
${d.condition_score != null ? `<div class="rpt-score"><span class="v">${Number(d.condition_score)}</span><span class="l">Condition</span></div>` : ''}
<div><div class="rpt-strip">${d.risk_level ? `<span class="rpt-risk ${esc(d.risk_level)}">${esc(d.risk_level)} risk</span>` : ''}</div>
<p class="rpt-headline">${esc(d.headline || '')}</p></div>
</div>
${d.property_summary ? `<p style="font-size:.95rem;line-height:1.65;color:#3a3f4c;max-width:64ch">${esc(d.property_summary)}</p>` : ''}
${section("What's genuinely", 'strong', bySec('strong'))}
${section('Verify before', 'you write', bySec('confirm'))}
${section('Looks alarming,', "isn't", bySec('calm'))}
${budget}
${questions}
${d.condition_summary ? `<div class="rpt-bottom"><h2>The bottom line</h2><p>${esc(d.condition_summary)}</p></div>` : ''}
${cross}
<p class="rpt-meta">Prepared by ${esc(d.prepared_by || M.agent.name)}${d.prepared_dre ? ', DRE #' + esc(d.prepared_dre) : ''} · ${esc(M.name)} · Sourced from the seller's disclosure package for ${esc(d.address)}; every finding above names the document it came from. This summary does not replace reading the full package, and nothing here is an appraisal or an opinion of value.</p>
</div>`;
  return shell('Disclosure Cheat Sheet \u00b7 ' + d.address, 'What the disclosure package for ' + d.address + ' actually says \u2014 sourced finding by finding.',
    '/disclosure/', body, null, '<meta name="robots" content="noindex,nofollow"><style>' + rptCss() + '</style>');
}

async function renderCmaReport(token) {
  const c = await rptRpc('get_published_cma', { p_token: token });
  if (!c || c.ok !== true) return null;
  const snap = c.comp_snapshot || {};
  const s = snap.subject || {};
  const comps = Array.isArray(snap.comps) ? snap.comps : [];

  const compRows = comps.map((x) =>
    `<tr><td><b>${esc(x.address)}</b></td><td>${esc(String(x.soldDate || '').slice(0, 10))}</td>` +
    `<td class="num">${rptMoney(x.soldPrice)}</td><td class="num">${x.pricePerSqft ? rptMoney(x.pricePerSqft) : '\u2014'}</td>` +
    `<td class="num">${x.beds ?? '\u2014'}</td><td class="num">${x.sqft ? Number(x.sqft).toLocaleString('en-US') : '\u2014'}</td></tr>`).join('');

  // $/sf scatter: x = sold date, y = $/sf. Server-rendered SVG, no JS.
  let scatter = '';
  const pts = comps.filter((x) => x.pricePerSqft && x.soldDate);
  if (pts.length >= 3) {
    const ts = pts.map((x) => new Date(x.soldDate).getTime());
    const ys = pts.map((x) => Number(x.pricePerSqft));
    const tMin = Math.min(...ts), tMax = Math.max(...ts), yMin = Math.min(...ys), yMax = Math.max(...ys);
    const W = 640, H = 220, L = 54, R = 16, T = 14, B = 30;
    const px = (t) => tMax === tMin ? (L + (W - L - R) / 2) : L + (t - tMin) / (tMax - tMin) * (W - L - R);
    const py = (y) => yMax === yMin ? (T + (H - T - B) / 2) : T + (1 - (y - yMin) / (yMax - yMin)) * (H - T - B);
    const dots = pts.map((x) =>
      `<circle cx="${px(new Date(x.soldDate).getTime()).toFixed(1)}" cy="${py(Number(x.pricePerSqft)).toFixed(1)}" r="5.5" fill="#c15428" opacity=".85"><title>${esc(x.address)} \u00b7 ${rptMoney(x.pricePerSqft)}/sf</title></circle>`).join('');
    const fmtD = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    scatter = `<div class="rpt-scatter"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sold comparables by date and price per square foot">
<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#d8d3c6"/>
<line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#d8d3c6"/>
<text x="${L - 6}" y="${py(yMax) + 3}" text-anchor="end">${rptMoney(yMax)}</text>
<text x="${L - 6}" y="${py(yMin) + 3}" text-anchor="end">${rptMoney(yMin)}</text>
<text x="${px(tMin)}" y="${H - B + 16}" text-anchor="middle">${fmtD(tMin)}</text>
<text x="${px(tMax)}" y="${H - B + 16}" text-anchor="middle">${fmtD(tMax)}</text>
${dots}</svg>
<p style="font-size:.72rem;color:#8a8f9c;margin:6px 0 0">Recorded sales only \u2014 $/sq ft by closing date. Hover a dot for the address.</p></div>`;
  }

  const priceBlock = (c.recommended_list_price || (c.mmm_range_low && c.mmm_range_high))
    ? `<div class="rpt-bottom" style="margin-top:26px"><h2>${esc(M.agent.first)}\u2019s read</h2><p>
${c.recommended_list_price ? 'Recommended list price: <b style="color:#fff">' + rptMoney(c.recommended_list_price) + '</b>. ' : ''}
${c.mmm_range_low && c.mmm_range_high ? 'Private-float range: <b style="color:#fff">' + rptMoney(c.mmm_range_low) + ' \u2013 ' + rptMoney(c.mmm_range_high) + '</b> \u2014 the band where a quiet, no-listing test makes sense.' : ''}
</p><p style="margin-top:8px;font-size:.8rem">This is ${esc(c.prepared_by || M.agent.name)}\u2019s professional opinion${c.prepared_dre ? ' (DRE #' + esc(c.prepared_dre) + ')' : ''}, not a computational estimate.</p></div>` : '';

  const cross = c.disclosure_token
    ? `<a class="rpt-cross" href="/disclosure/?token=${encodeURIComponent(c.disclosure_token)}">Read the Disclosure Cheat Sheet →</a>` : '';

  const body = `<div class="rpt-page">
<p class="rpt-eyebrow">Comparative market analysis · ${esc(M.name)}</p>
<h1>${esc(c.address)}</h1>
<p class="rpt-sub">${esc(M.city)}, CA${s.mls ? ' · MLS ' + esc(s.mls) : ''} · prepared ${esc(String(c.published_at || '').slice(0, 10))}</p>
<div class="rpt-strip">
${s.beds != null ? `<span class="rpt-chip"><b>${esc(s.beds)}</b> bed</span>` : ''}
${s.baths != null ? `<span class="rpt-chip"><b>${esc(s.baths)}</b> bath</span>` : ''}
${s.sqft ? `<span class="rpt-chip"><b>${Number(s.sqft).toLocaleString('en-US')}</b> sq ft</span>` : ''}
${s.lotSqft ? `<span class="rpt-chip">lot <b>${Number(s.lotSqft).toLocaleString('en-US')}</b></span>` : ''}
${s.yearBuilt ? `<span class="rpt-chip">built <b>${esc(s.yearBuilt)}</b></span>` : ''}
${s.listPrice ? `<span class="rpt-chip">asking <b>${rptMoney(s.listPrice)}</b></span>` : ''}
</div>
<section class="rpt-sec"><h2>The recorded <em>comparables</em></h2>
<table class="rpt-table"><thead><tr><th>Sold home</th><th>Closed</th><th class="num">Price</th><th class="num">$/sf</th><th class="num">Beds</th><th class="num">Sq ft</th></tr></thead>
<tbody>${compRows || '<tr><td colspan="6">No qualifying recorded sales in the window.</td></tr>'}</tbody></table>
${scatter}
<p style="font-size:.76rem;color:#8a8f9c;margin-top:8px">Comps are recorded ${esc(M.city)} sales${snap.rules_version ? ' \u00b7 selection rules: ' + esc(snap.rules_version) : ''}. Recorded prices are public record; they are facts, not an appraisal.</p></section>
${priceBlock}
${cross}
${c.disclosure_token ? '' : `<a class="rpt-cross ghost" href="/active-listings/">All active listings →</a>`}
<p class="rpt-meta">Prepared by ${esc(c.prepared_by || M.agent.name)}${c.prepared_dre ? ', DRE #' + esc(c.prepared_dre) : ''} · ${esc(M.name)} · Sale data compiled from ${esc(M.county)} County public records; deemed reliable, not guaranteed.</p>
</div>`;
  return shell('CMA \u00b7 ' + c.address, 'Recorded comparable sales for ' + c.address + ' \u2014 the facts behind the price conversation.',
    '/cma/', body, null, '<meta name="robots" content="noindex,nofollow"><style>' + rptCss() + '</style>');
}

function htmlResponse(html, status) {
  return new Response(html, {
    status: status || 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    M = resolveMarket(url.hostname);  // FIRST: everything below renders for this market

    // ── Native tour booking API (proxies the book-tour edge function) ──
    if (path === '/api/tour-slots' || path === '/api/book-tour' || path === '/api/tour-health') {
      const FN = 'https://qinuukntpyulqjzndnho.supabase.co/functions/v1/book-tour';
      const H = { 'x-cbm-key': 'sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2', 'Content-Type': 'application/json' };
      try {
        let up;
        if (path === '/api/tour-health') {
          up = await fetch(FN + '?action=health&market=' + M.id + '&deep=' + (url.searchParams.get('deep') || '0'), { headers: H });
        } else if (path === '/api/tour-slots') {
          const date = url.searchParams.get('date') || '';
          up = await fetch(FN + '?action=slots&market=' + M.id + '&date=' + encodeURIComponent(date), { headers: H });
        } else {
          if (request.method !== 'POST') return new Response('{"error":"method"}', { status: 405, headers: { 'Content-Type': 'application/json' } });
          up = await fetch(FN + '?action=book', { method: 'POST', headers: H, body: await request.text() });
        }
        return new Response(await up.text(), { status: up.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e) {
        return new Response('{"error":"upstream"}', { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ── The member app now lives on its own Cloudflare Pages project at ──
    // app.${M.domain} (built from source, native SPA routing).
    // Redirect all legacy /app, /account, /join paths there so old links keep working.
    const APP_ORIGIN = 'https://app.' + M.domain;
    if (path === '/app' || path === '/app/') return Response.redirect(APP_ORIGIN + '/', 301);
    if (path.startsWith('/app/')) return Response.redirect(APP_ORIGIN + '/' + path.slice(5), 301);
    if (path === '/account' || path === '/account/') return Response.redirect(APP_ORIGIN + '/', 301);
    if (path === '/join' || path === '/join/') return Response.redirect(APP_ORIGIN + '/signin', 301);

    // favicons (embedded, market-resolved; /favicon.ico auto-requests get the PNG)
    if (path === '/assets/favicon.svg') return new Response(FV().svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
    if (path === '/assets/favicon-32.png' || path === '/favicon.ico') {
      const bin = Uint8Array.from(atob(FV().png32), c => c.charCodeAt(0));
      return new Response(bin, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
    }
    if (path === '/assets/apple-touch-icon.png') {
      const bin = Uint8Array.from(atob(FV().touch), c => c.charCodeAt(0));
      return new Response(bin, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
    }

    // SEO: per-market robots + sitemap (generated; shadows any static files)
    if (path === '/robots.txt') {
      // Deliberately open to AI training and answer engines. This is a public
      // record of one city's real estate; being quotable in an AI answer is the
      // point, not a leak. Each agent is named explicitly because several check
      // for their own token, and because 'not blocked' reads weaker than
      // 'invited'. Token-gated report pages carry noindex on the page itself,
      // so they stay out of indexes without hiding them from a fetch.
      const aiAgents = [
        'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',              // OpenAI
        'ClaudeBot', 'Claude-User', 'Claude-SearchBot',          // Anthropic
        'Google-Extended',                                       // Gemini / Vertex training
        'PerplexityBot', 'Perplexity-User',                      // Perplexity
        'meta-externalagent', 'FacebookBot',                     // Meta
        'Applebot', 'Applebot-Extended',                         // Apple
        'Amazonbot', 'Bytespider', 'CCBot', 'Diffbot',           // Amazon, TikTok, Common Crawl
        'cohere-ai', 'omgili', 'Timpibot', 'YouBot', 'AI2Bot'
      ];
      const txt =
        'User-agent: *\nAllow: /\nDisallow: /campaign-result/\nDisallow: /api/\n\n'
        + aiAgents.map(a => 'User-agent: ' + a + '\nAllow: /\n').join('\n')
        + '\nSitemap: https://' + M.domain + '/sitemap.xml\n';
      return new Response(txt, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' } });
    }
    // llms.txt — the emerging convention for telling an AI system what a site
    // authoritatively covers, in the order a reader should take it.
    if (path === '/llms.txt') {
      const txt = `# ${M.name}

> The complete public record of residential real estate in ${M.city}, California (${M.zipsLabel}) — every parcel indexed, every recorded sale on file, every street and neighborhood measured. Maintained by ${M.agent.name}, a licensed California real estate broker associate (DRE #${M.agent.dre}).

## What this site is

${M.name} publishes parcel-level property records and recorded sale history for ${M.city}. Figures are computed from ${M.county} County public records and MLS data, and every statistic carries the sample it was drawn from. Estimated values are computational estimates, not appraisals.

## Primary sources

- [Market intelligence](https://${M.domain}/intelligence/): median price per square foot by quarter, tract rankings, and sale velocity for ${M.city}.
- [Homes for sale](https://${M.domain}/active-listings/): current listings, with seller disclosure reviews on selected homes.
- [Recent sales](https://${M.domain}/recent-sales/): closed sales with price, size, and price per square foot.
- [Neighborhoods](https://${M.domain}/tracts/): every named tract with its own price history.
- [Streets](https://${M.domain}/streets/): every street with property counts and sales on record.
- [Methodology](https://${M.domain}/methodology/): how each figure is calculated and what its limits are.

## Citation

Attribute figures to "${M.name}" and link the page the figure appears on. Data is refreshed as new sales close and new listings appear.
`;
      return new Response(txt, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
    }
    if (path === '/sitemap.xml') {
      const D = await loadData(env, url.origin, M);
      const base = 'https://' + M.domain;
      const staticPages = ['/', '/tracts/', '/streets/', '/active-listings/', '/recent-sales/', '/intelligence/', '/make-me-move/', '/tools/', '/tools/net-sheet/', '/how-it-works/', '/how-it-works/sell-with-tenants/', '/how-it-works/1031-exchange/', '/methodology/'];
      const urls = [];
      for (const p of staticPages) urls.push(base + p);
      for (const slug of Object.keys(D.tracts)) urls.push(base + '/tract/' + slug + '/');
      for (const slug of Object.keys(D.streets)) urls.push(base + '/street/' + slug + '/');
      for (const p of D.props) urls.push(base + '/home/' + p.s + '/');
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls.map(u => '<url><loc>' + u + '</loc></url>').join('\n')
        + '\n</urlset>';
      return new Response(xml, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } });
    }

    // embedded data endpoints (always current with the worker)
    if (path === '/assets/' + M.assetPrefix + 'market-intel.json') return new Response(DS().intel, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } });
    if (path === '/assets/' + M.assetPrefix + 'tracts.json')       return new Response(DS().tracts, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } });
    if (path === '/assets/' + M.assetPrefix + 'market-stats.json') return new Response(DS().stats, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } });

    // homepage: worker-rendered (source of truth; immune to asset-upload mishaps)
    if (path === '/' || path === '/index.html') {
      return htmlResponse(homepage());
    }

    // dynamic routes: /tract/x /street/x /home/x (+ index hubs)
    const m = path.match(/^\/(tract|street|home)\/([a-z0-9-]+)\/?$/);
    const isHub = path === '/tracts' || path === '/tracts/' || path === '/streets' || path === '/streets/';
    const forSale = path.match(/^\/for-sale\/([A-Za-z0-9]+)\/?$/);
    if (forSale) {
      const D = await loadData(env, url.origin, M);
      const out = await renderListingDetail(forSale[1], D, M);
      if (!out) return new Response(null, { status: 302, headers: { 'Location': '/active-listings/' } });
      if (out.redirect) return new Response(null, { status: 302, headers: { 'Location': out.redirect } });
      return htmlResponse(out.html);
    }

    // Public report pages — earned links from the for-sale gate. Token pages:
    // noindex, no-store, styled 404 on any miss (draft, bad, or absent token).
    if (path === '/cma' || path === '/cma/' || path === '/disclosure' || path === '/disclosure/') {
      const t = url.searchParams.get('token') || '';
      let html = null;
      if (t) html = path.startsWith('/cma') ? await renderCmaReport(t) : await renderDisclosureSheet(t);
      if (!html) return htmlResponse(render404(), 404);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
    }

    const staticPage = path.match(/^\/(how-it-works|make-me-move|methodology|intelligence|active-listings|recent-sales|campaign-result|tools|tools\/net-sheet)\/?$/)
      || path.match(/^\/(how-it-works\/(?:sell-with-tenants|1031-exchange))\/?$/);

    if (staticPage) {
      if (!path.endsWith('/') && request.method === 'GET') {
        return new Response(null, { status: 301, headers: { 'Location': path + '/' + url.search, 'Cache-Control': 'public, max-age=3600' } });
      }
      if (path === '/intelligence/') return htmlResponse(renderIntelligence());
      if (path === '/active-listings/') return htmlResponse(renderActiveListings());
      if (path === '/recent-sales/' || path === '/recent-sales') return htmlResponse(renderRecentSales());
      if (path === '/tools/' || path === '/tools') return htmlResponse(renderToolsHub());
      if (path === '/tools/net-sheet/' || path === '/tools/net-sheet') return htmlResponse(renderNetSheet());
      if (path === '/campaign-result/' || path === '/campaign-result') return htmlResponse(renderCampaignResult(url));
      if (path === '/how-it-works/sell-with-tenants/') return htmlResponse(renderSellWithTenants());
      if (path === '/how-it-works/1031-exchange/') return htmlResponse(render1031());
      if (path === '/how-it-works/') return htmlResponse(renderHowItWorks());
      if (path === '/make-me-move/') return htmlResponse(renderMakeMeMove());
      if (path === '/methodology/') return htmlResponse(renderMethodology());
    }

    if (m || isHub) {
      // canonical: trailing slash
      if (!path.endsWith('/') && request.method === 'GET') {
        return new Response(null, { status: 301, headers: { 'Location': path + '/' + url.search, 'Cache-Control': 'public, max-age=3600' } });
      }
      const D = await loadData(env, url.origin, M);
      if (path === '/tracts/') return htmlResponse(renderTractsIndex(D));
      if (path === '/streets/') return htmlResponse(renderStreetsIndex(D));
      const [, kind, slug] = m;
      if (kind === 'home') {
        let p = D.bySlug.get(slug);
        // The dataset file is a snapshot; parcels discovered by the MLS feeds
        // after the last build are not in it yet. Fall back to the database so
        // a stale dataset is slower, never broken.
        if (!p) p = await fetchPropertyRecord(M, slug);
        return p ? htmlResponse(renderHome(p, D)) : htmlResponse(render404(), 404);
      }
      if (kind === 'street') {
        return D.streets[slug] ? htmlResponse(renderStreet(slug, D)) : htmlResponse(render404(), 404);
      }
      if (kind === 'tract') {
        if (!D.tracts[slug]) {
          return new Response(null, { status: 301, headers: { 'Location': '/tracts/', 'Cache-Control': 'public, max-age=3600' } });
        }
        return htmlResponse(renderTract(slug, D));
      }
    }

    // everything else: static assets, with styled 404 fallback
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404 && request.headers.get('Accept') && request.headers.get('Accept').includes('text/html')) {
      return htmlResponse(render404(), 404);
    }
    return res;
  },
};
