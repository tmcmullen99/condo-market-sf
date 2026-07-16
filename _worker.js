/* ============================================================
   THE CAMPBELL MARKET — _worker.js (Cloudflare Pages Advanced Mode)
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

const HOMEPAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Campbell Market — Every Home in Campbell, CA 95008, Indexed and Analyzed</title>
<meta name="description" content="The complete record of Campbell, California real estate: 6,609 homes, 498 streets, and 634 named tracts in 95008 — every sale, every value, every neighborhood, indexed and analyzed.">
<link rel="canonical" href="https://campbellrealestatemarket.com/">
<meta property="og:title" content="The Campbell Market">
<meta property="og:description" content="Every home in Campbell, CA. Every street. Every tract. Indexed and analyzed.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://campbellrealestatemarket.com/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css">
<link rel="stylesheet" href="/assets/cb.css?v=3">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent","name":"The Campbell Market","url":"https://campbellrealestatemarket.com","areaServed":{"@type":"City","name":"Campbell","address":{"@type":"PostalAddress","addressLocality":"Campbell","addressRegion":"CA","postalCode":"95008"}},"parentOrganization":{"@type":"Organization","name":"McMullen Properties LLC"}}
</script>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a class="wordmark" href="/"><b>The Campbell</b> Market<span class="tag">95008</span></a>
    <div class="nav-links">
      <a href="#map">The Map</a>
      <a href="/tracts/">Tracts</a>
      <a href="/streets/">Streets</a>
      <a href="/intelligence/">Intelligence</a>
      <a href="/how-it-works/">How it works</a>
      <a href="/make-me-move/">Make me move</a>
    </div>
    <div class="nav-right">
      <a class="nav-cta" href="#contact">Get your home's number</a>
    </div>
    <button class="burger" aria-label="Open menu" aria-expanded="false" id="burger">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="drawer" id="drawer">
  <a href="#map">The Map</a>
  <a href="/tracts/">Tracts</a>
  <a href="/streets/">Streets</a>
  <a href="/intelligence/">Intelligence</a>
  <a href="/how-it-works/">How it works</a>
  <a href="/make-me-move/">Make me move</a>
  <a href="/methodology/">Methodology</a>
  <a class="nav-cta" href="#contact">Get your home's number</a>
</div>

<div class="ticker" id="cbticker"></div>

<header class="hero">
  <div class="wrap hero-inner">
    <span class="eyebrow">Campbell, California · The Orchard City · 95008</span>
    <h1>Every home in Campbell. <em>Every street. Every tract.</em></h1>
    <p class="sub">The complete public record of one city's real estate — every parcel indexed, every sale on file, every neighborhood measured. Not a portal. A ledger.</p>
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
      <h2>All 6,609 parcels of 95008, <em>on one map.</em></h2>
      <p class="sub">Every dot is a home in the index. Click any one for its record — type, size, year, and last recorded sale.</p>
    </div>
    <div id="cbmap" class="reveal"></div>
    <p class="map-note">Parcel locations from Santa Clara County records. Values are estimates from public data — see methodology.</p>
  </div>
</section>

<section id="numbers">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">Market Intelligence</span>
      <h2>The Campbell market, <em>measured.</em></h2>
      <p class="sub">Every recorded sale in 95008 — tracked, ranked, and updated as new sales close. <a href="/intelligence/" style="color:var(--apricot)">Full intelligence &rarr;</a></p>
    </div>
    <div class="mz-grid reveal">
      <div class="mz-card">
        <div class="mz-eyebrow"><span class="dot"></span>Live sales feed</div>
        <div class="mz-sub">The most recent Campbell closings on record, priced first.</div>
        <div id="mzFeed"></div>
      </div>
      <div class="mz-card mz-chart">
        <div class="mz-eyebrow">$/SF Trajectory <span class="mz-delta" id="mzDelta"></span></div>
        <div class="mz-sub">Median price per square foot, by quarter, across all of 95008.</div>
        <div id="mzChart"></div>
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

<section id="tracts">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">The Tracts</span>
      <h2>A mid-century city of <em>named neighborhoods.</em></h2>
      <p class="sub">Campbell was built tract by tract — Los Ranchitos Gardens, Fairlands, Latimer Park, White Oaks Manor. Each has its own record here: its streets, its era, its numbers.</p>
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
        <p class="sub" style="margin-top:16px">Everything on this site traces to a public source: Santa Clara County assessor and recorder data, recorded deeds, and county parcel records for the 95008 zip code. No estimates without a basis, no trend arrows on one sale.</p>
      </div>
      <div class="method-card reveal" id="contact">
        <span class="eyebrow">Your home is in this index</span>
        <p>Every one of the 6,609 homes here has a file — including yours. Ask for your home's current record and what the recent sales around it actually mean. Direct from a licensed Campbell-area broker associate — no listing required, no obligation.</p>
        <form class="cb-capture" data-intent="valuation" data-source="homepage_valuation" data-cta="Request your home's record">
          <input type="text" name="name" placeholder="Your name" autocomplete="name">
          <input type="email" name="email" placeholder="Email address" required autocomplete="email">
          <textarea name="message" placeholder="Your Campbell address (so we pull the right record)"></textarea>
          <button type="submit" class="btn btn-gold">Request your home's record</button>
        </form>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="wordmark" href="/"><b>The Campbell</b> Market<span class="tag">95008</span></a>
        <p style="color:var(--slate-dim);font-size:.84rem;margin-top:12px;max-width:36ch">The complete record of Campbell, California real estate.</p>
      </div>
      <div>
        <h4>Index</h4>
        <a href="/tracts/">Tracts</a>
        <a href="/streets/">Streets</a>
        <a href="/intelligence/">Intelligence</a>
        <a href="/how-it-works/">How it works</a>
        <a href="/make-me-move/">Make me move</a>
      </div>
      <div>
        <h4>Contact</h4>
        <a href="mailto:tim@campbellrealestatemarket.com">tim@campbellrealestatemarket.com</a>
        <a href="/methodology/">Methodology</a>
      </div>
    </div>
    <p class="disclosure">© 2026 The Campbell Market · McMullen Properties LLC · Tim McMullen, CA DRE #02016832 · Operating under Real Broker, DRE #02228473. Property information is compiled from Santa Clara County public records and other sources; it is deemed reliable but not guaranteed and should be independently verified. Estimated values are computational estimates, not appraisals. The Campbell Market is an independent service and is not affiliated with the City of Campbell.</p>
  </div>
</footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js"></script>
<script src="/assets/cb-track.js"></script>
<script src="/assets/cb-lead.js"></script>
<script>
(function(){
  var money = function(n){ return n==null ? '—' : '$'+(n>=1e6 ? (n/1e6).toFixed(2).replace(/\.?0+$/,'')+'M' : Math.round(n/1000)+'K'); };
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
  fetch('/assets/cb-market-stats.json').then(function(r){ return r.json(); }).then(function(S){
    var c = S.city;
    document.querySelectorAll('#ledger [data-k]').forEach(function(el){
      var v = c[el.getAttribute('data-k')];
      el.textContent = el.getAttribute('data-fmt')==='money' ? money(v) : num(v);
    });
    var grid = document.getElementById('tractGrid');
    grid.innerHTML = S.top_tracts.slice(0,12).map(function(t){
      return '<a class="tract-card" href="/tract/'+t.slug+'/" style="display:block"><h3>'+t.name+'</h3>'+
        '<div class="meta">'+t.n+' homes · est. '+(t.yr||'—')+' · '+(t.type||'')+'</div>'+
        '<div class="mv">'+money(t.mv)+' <span>median value</span></div></a>';
    }).join('');
  });

  /* market intelligence */
  fetch('/assets/cb-market-intel.json').then(function(r){ return r.json(); }).then(function(I){
    var T = I.totals;
    document.getElementById('tiles').innerHTML = [
      [num(T.sales_on_record), 'Campbell sales on record'],
      ['$'+num(T.median_ppsf), 'Median price / sq ft, last 24 months'],
      [money(T.median_price_12mo), 'Median sale price, last 12 months'],
      [num(T.tracts_tracked), 'Tracts tracked across 95008']
    ].map(function(t){ return '<div class="tile"><div class="n">'+t[0]+'</div><div class="l">'+t[1]+'</div></div>'; }).join('');

    document.getElementById('mzFeed').innerHTML = I.feed.slice(0,7).map(function(f){
      return '<div class="feed-row"><div><div class="fa">'+(f.s?('<a href="/home/'+f.s+'/">'+f.a+'</a>'):f.a)+'</div>'+
        '<div class="fm">'+(f.tract?f.tract+' · ':'')+(f.sf?num(f.sf)+' sf · ':'')+(f.ppsf?'$'+num(f.ppsf)+'/sf':'')+'</div></div>'+
        '<div style="text-align:right"><div class="fp">'+money(f.p)+'</div><div class="fd">'+f.d+'</div></div></div>';
    }).join('');

    var qs = I.quarters.filter(function(q){ return q.ppsf; });
    if(qs.length > 1){
      var vals = qs.map(function(q){ return q.ppsf; });
      var min = Math.min.apply(null,vals), max = Math.max.apply(null,vals), pad=(max-min)*0.12||1;
      var W=560, H=230;
      var pts = vals.map(function(v,i){
        var x = 8 + i*(W-16)/(vals.length-1);
        var y = H-14 - (v-min+pad)/(max-min+2*pad)*(H-28);
        return [Math.round(x*10)/10, Math.round(y*10)/10];
      });
      var line = pts.map(function(p){return p[0]+','+p[1];}).join(' ');
      var area = '8,'+(H-6)+' '+line+' '+pts[pts.length-1][0]+','+(H-6);
      document.getElementById('mzChart').innerHTML =
        '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">'+
        '<polygon points="'+area+'" fill="rgba(217,154,78,.12)"/>'+
        '<polyline points="'+line+'" fill="none" stroke="#d99a4e" stroke-width="2"/>'+
        '<circle cx="'+pts[pts.length-1][0]+'" cy="'+pts[pts.length-1][1]+'" r="3.5" fill="#d99a4e"/></svg>';
      var q16 = qs.slice(-16);
      var delta = Math.round((q16[q16.length-1].ppsf/q16[0].ppsf - 1)*100);
      document.getElementById('mzDelta').textContent = (delta>=0?'▲ +':'▼ ')+delta+'% over '+(q16.length-1)+' quarters';
      document.getElementById('mzCapL').innerHTML = qs[0].q+' <b>$'+num(qs[0].ppsf)+'</b>';
      document.getElementById('mzCapR').innerHTML = qs[qs.length-1].q+' <b>$'+num(qs[qs.length-1].ppsf)+'</b>';
    }

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
        '<p>At <b>$'+num(I.spread.hi.ppsf)+'/sf</b>, '+I.spread.hi.name+' commands roughly <b>'+I.spread.ratio+'&times;</b> the per-foot price of '+I.spread.lo.name+' (<b>$'+num(I.spread.lo.ppsf)+'/sf</b>) — the widest value gap among Campbell tracts.</p>'+
        '<p style="margin-top:12px"><a href="/tract/'+I.spread.hi.slug+'/" style="color:var(--apricot)">See '+I.spread.hi.name+' &rarr;</a></p></div>';
    }
    if(I.by_bed){
      var beds = Object.keys(I.by_bed).map(function(b){
        return '<div class="bedrow"><span>'+b+'-bedroom</span><b>'+money(I.by_bed[b])+'</b></div>';
      }).join('');
      ins += '<div class="insight-card"><span class="eyebrow" style="margin-bottom:0">Price by bedroom &middot; 24 mo</span>'+
        '<h3>What Campbell homes trade for</h3>'+beds+'</div>';
    }
    if(I.most_active){
      ins += '<div class="insight-card"><span class="eyebrow" style="margin-bottom:0">Most active tract</span>'+
        '<h3>'+I.most_active.name+'</h3>'+
        '<p>With <b>'+num(I.most_active.vol)+' recorded sales</b>, '+I.most_active.name+' is the most-traded tract in Campbell — a median <b>$'+num(I.most_active.ppsf)+'/sf</b> and <b>'+money(I.most_active.price)+'</b> sale price.</p>'+
        '<p style="margin-top:12px"><a href="/tract/'+I.most_active.slug+'/" style="color:var(--apricot)">Browse tract &rarr;</a></p></div>';
    }
    document.getElementById('mzInsights').innerHTML = ins;
  });

(function(){
  var SB='https://qinuukntpyulqjzndnho.supabase.co';
  var KEY='sb_publishable_1CzH1AWkEzy1WjMvZqwlhA_xiay_wJ2';
  function money(n){return n==null?'':'$'+(n>=1e6?(n/1e6).toFixed(2).replace(/\.?0+$/,'')+'M':Math.round(n/1000)+'K');}
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
  fetch(SB+'/rest/v1/mls_feed_listings?status=eq.Sold&order=price.desc&limit=8&select=address_raw,property_slug,price,sqft',
    {headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){return r.ok?r.json():[];})
    .then(build).catch(function(){});
})();


  /* map */
  var map = L.map('cbmap', {scrollWheelZoom:false}).setView([37.2872,-121.9500],14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom:19
  }).addTo(map);
  map.on('focus click', function(){ map.scrollWheelZoom.enable(); });

  fetch('/assets/cb-props.json').then(function(r){ return r.json(); }).then(function(P){
    var cluster = L.markerClusterGroup({chunkedLoading:true, maxClusterRadius:52, disableClusteringAtZoom:17});
    P.forEach(function(p){
      var m = L.circleMarker([p.y,p.x], {radius:5, color:'#d99a4e', weight:1, fillColor:'#d99a4e', fillOpacity:.55});
      var spec = [];
      if(p.b) spec.push(p.b+' bd');
      if(p.ba) spec.push(p.ba+' ba');
      if(p.sf) spec.push(p.sf.toLocaleString()+' sf');
      if(p.yb) spec.push('built '+p.yb);
      var sale = p.sp ? '<div class="pp-s">Last sale '+money(p.sp)+(p.sd?' · '+p.sd.slice(0,4):'')+'</div>' : '';
      var slug = '/home/'+p.s+'/';
      var GKEY = 'AIzaSyAh6mb44KilwxY-QTINnCYqxAx4VF-FWyo';
      var img = GKEY ? '<span class="pp-imgwrap"><img loading="lazy" onerror="this.parentNode.remove()" src="https://maps.googleapis.com/maps/api/streetview?size=320x180&location='+encodeURIComponent(p.a+', Campbell, CA 95008')+'&fov=72&source=outdoor&key='+GKEY+'"></span>' : '';
      m.bindPopup('<a href="'+slug+'" style="display:block">'+img+'<div class="pp-a">'+p.a+'</div></a><div class="pp-m">'+(TYPE[p.t]||'')+(spec.length?' · '+spec.join(' · '):'')+'</div>'+sale+'<a class="pp-link" href="'+slug+'">View home record →</a>',
        {maxWidth:290, keepInView:true, autoPanPaddingTopLeft:L.point(28,110), autoPanPaddingBottomRight:L.point(28,28)});
      cluster.addLayer(m);
    });
    map.addLayer(cluster);
  });
})();
</script>
</body>
</html>
`;

let DATA = null;

async function loadData(env, origin) {
  if (DATA) return DATA;
  const [props, tracts, streets] = await Promise.all([
    env.ASSETS.fetch(origin + '/assets/cb-props.json').then(r => r.json()),
    env.ASSETS.fetch(origin + '/assets/cb-tracts.json').then(r => r.json()),
    env.ASSETS.fetch(origin + '/assets/cb-streets.json').then(r => r.json()),
  ]);
  const bySlug = new Map(), byTract = new Map(), byStreet = new Map();
  for (const p of props) {
    bySlug.set(p.s, p);
    if (p.ts) { if (!byTract.has(p.ts)) byTract.set(p.ts, []); byTract.get(p.ts).push(p); }
    if (p.st) { if (!byStreet.has(p.st)) byStreet.set(p.st, []); byStreet.get(p.st).push(p); }
  }
  DATA = { props, tracts, streets, bySlug, byTract, byStreet };
  return DATA;
}

/* ---------- helpers ---------- */
const GMAPS_KEY = 'AIzaSyAh6mb44KilwxY-QTINnCYqxAx4VF-FWyo';  // Street View Static API key (HTTP-referrer restricted)

function photoUrl(p, size) {
  if (p.ph) return p.ph;                          // MLS/listing photo always wins
  if (!GMAPS_KEY) return null;
  return 'https://maps.googleapis.com/maps/api/streetview?size=' + (size || '800x480')
    + '&location=' + encodeURIComponent(p.a + ', Campbell, CA 95008')
    + '&fov=72&pitch=0&source=outdoor&key=' + GMAPS_KEY;
}

const TYPE = { sf: 'Single family', co: 'Condo / townhome', mf: 'Multi-family', mh: 'Mobile home', vl: 'Vacant land', ot: 'Property' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  if (n == null) return '—';
  return '$' + (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(n / 1000) + 'K');
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

function shell(title, desc, canonicalPath, body, jsonld, extraHead) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://campbellrealestatemarket.com${canonicalPath}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://campbellrealestatemarket.com${canonicalPath}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/cb.css?v=3">
<style>${PAGE_CSS}</style>
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}
${extraHead || ''}
</head>
<body>
<nav class="nav">
  <div class="nav-inner">
    <a class="wordmark" href="/"><b>The Campbell</b> Market<span class="tag">95008</span></a>
    <div class="nav-links">
      <a href="/#map">The Map</a>
      <a href="/tracts/">Tracts</a>
      <a href="/streets/">Streets</a>
      <a href="/intelligence/">Intelligence</a>
      <a href="/how-it-works/">How it works</a>
      <a href="/make-me-move/">Make me move</a>
    </div>
    <div class="nav-right">
      <a class="nav-cta" href="/#contact">Get your home's number</a>
    </div>
    <button class="burger" aria-label="Open menu" aria-expanded="false" id="burger"><span></span><span></span><span></span></button>
  </div>
</nav>
<div class="drawer" id="drawer">
  <a href="/#map">The Map</a>
  <a href="/tracts/">Tracts</a>
  <a href="/streets/">Streets</a>
  <a href="/intelligence/">Intelligence</a>
  <a href="/how-it-works/">How it works</a>
  <a href="/make-me-move/">Make me move</a>
  <a href="/methodology/">Methodology</a>
  <a class="nav-cta" href="/#contact">Get your home's number</a>
</div>
${body}
<footer>
  <div class="wrap">
    <p class="disclosure">© 2026 The Campbell Market · McMullen Properties LLC · Tim McMullen, CA DRE #02016832 · Operating under Real Broker, DRE #02228473. Property information is compiled from Santa Clara County public records and other sources; it is deemed reliable but not guaranteed and should be independently verified. Estimated values are computational estimates, not appraisals. The Campbell Market is an independent service and is not affiliated with the City of Campbell.</p>
  </div>
</footer>
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
  function mm(n){return n==null?'':'$'+(n>=1e6?(n/1e6).toFixed(2).replace(/\.?0+$/,'')+'M':Math.round(n/1000)+'K');}
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
  fetch(SB+'/rest/v1/mls_feed_listings?status=eq.Sold&order=price.desc&limit=8&select=address_raw,property_slug,price,sqft',
    {headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){return r.ok?r.json():[];})
    .then(build).catch(function(){});
})();
</script>
</body>
</html>`;
}

function mapScript(points) {
  return `
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" defer></script>
<script>
document.addEventListener('DOMContentLoaded',function(){
  var pts=${JSON.stringify(points)};
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
    <p style="font-size:.72rem;color:var(--slate-dim);margin-top:12px;margin-bottom:0">Direct to Tim McMullen, CA DRE #02016832. No listing required, no obligation, no spam.</p>
  </div>`;
}

/* ---------- page renderers ---------- */

function renderHome(p, D) {
  const tract = p.ts ? D.tracts[p.ts] : null;
  const street = p.st ? D.streets[p.st] : null;
  const title = `${p.a}, Campbell, CA 95008 — Home Record | The Campbell Market`;
  const descBits = [TYPE[p.t] || 'Home'];
  if (p.b) descBits.push(p.b + ' bed');
  if (p.ba) descBits.push(p.ba + ' bath');
  if (p.sf) descBits.push(num(p.sf) + ' sq ft');
  if (p.yb) descBits.push('built ' + p.yb);
  const desc = `${p.a}, Campbell CA 95008: ${descBits.join(', ')}.` +
    (p.sp ? ` Last recorded sale ${moneyFull(p.sp)}${p.sd ? ' in ' + p.sd.slice(0, 4) : ''}.` : '') +
    (tract ? ` Located in the ${tract.name} tract.` : '') + ' Full public record on The Campbell Market.';

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

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'SingleFamilyResidence',
    name: p.a + ', Campbell, CA 95008',
    address: { '@type': 'PostalAddress', streetAddress: p.a, addressLocality: 'Campbell', addressRegion: 'CA', postalCode: '95008' },
    geo: { '@type': 'GeoCoordinates', latitude: p.y, longitude: p.x },
    ...(p.b ? { numberOfBedrooms: p.b } : {}), ...(p.sf ? { floorSize: { '@type': 'QuantitativeValue', value: p.sf, unitCode: 'FTK' } } : {}),
  });

  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a> / ${tract ? `<a href="/tract/${p.ts}/">${esc(tract.name)}</a> / ` : ''}${street ? `<a href="/street/${p.st}/">${esc(street.name)}</a>` : ''}</div>
  <span class="eyebrow">Home record</span>
  <h1>${esc(p.a)}<em>, Campbell</em></h1>
  <p class="sub">${esc(descBits.join(' · '))}${p.sp ? ` · Last recorded sale ${moneyFull(p.sp)}${p.sd ? ' (' + p.sd.slice(0, 4) + ')' : ''}` : ''}</p>
  <div class="rec-grid">${recs}</div>
  ${(() => { const u = photoUrl(p); return u ? `<img class="home-photo" src="${u}" alt="${esc(p.a)}, Campbell, CA" loading="lazy" onerror="this.remove()">` : ''; })()}
  <div id="pgmap"></div>
</div></header>
${comps.length ? `<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">${tract ? esc(tract.name) : street ? esc(street.name) : 'Nearby'}</span>
  <h2>Recent recorded sales <em>around this home.</em></h2></div>
  ${homesTable(comps)}
</div></section>` : ''}
<section class="pg"><div class="wrap">
  ${captureCard({
    eyebrow: 'This record, explained',
    lead: `What is ${esc(p.a)} worth today, and what do these comps actually mean for it? Ask for the full record and the current number.`,
    intent: 'valuation',
    property: p.s,
    tract: p.ts || null,
    source: 'home_page_valuation',
    cta: "Request this home's record",
    placeholder: 'Are you the owner, a neighbor, or a buyer? (optional)'
  })}
</div></section>`;

  return shell(title, desc, `/home/${p.s}/`, body, jsonld,
    mapScript([[p.y, p.x, esc(p.a)]]));
}

function renderStreet(slug, D) {
  const s = D.streets[slug];
  const homes = (D.byStreet.get(slug) || []).slice().sort((a, b) => a.a.localeCompare(b.a, 'en', { numeric: true }));
  const mv = median(homes.map(h => h.ev));
  const sales = homes.filter(h => h.sp);
  const tractSlugs = [...new Set(homes.map(h => h.ts).filter(Boolean))];
  const title = `${s.name}, Campbell, CA 95008 — Every Home & Sale | The Campbell Market`;
  const desc = `${s.name} in Campbell, CA 95008: ${homes.length} homes indexed, ${sales.length} recorded sales, median estimated value ${money(mv)}. Every address on ${s.name}, with full records.`;

  const recs = [
    [num(homes.length), 'Homes on this street'],
    [num(sales.length), 'Recorded sales'],
    [money(mv), 'Median est. value'],
    [tractSlugs.length ? num(tractSlugs.length) : '—', 'Tracts touched'],
  ].map(r => `<div class="rec"><div class="n">${r[0]}</div><div class="l">${r[1]}</div></div>`).join('');

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Place', name: s.name + ', Campbell, CA 95008',
    address: { '@type': 'PostalAddress', addressLocality: 'Campbell', addressRegion: 'CA', postalCode: '95008' },
  });

  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a> / <a href="/streets/">Streets</a></div>
  <span class="eyebrow">Street record · Campbell 95008</span>
  <h1>${esc(s.name)}<em>, indexed.</em></h1>
  <p class="sub">Every home on ${esc(s.name)}, with its record — specs, values, and recorded sales from Santa Clara County public data.</p>
  <div class="rec-grid">${recs}</div>
  ${tractSlugs.length ? `<div class="chip-row">${tractSlugs.map(t => D.tracts[t] ? `<a class="chip" href="/tract/${t}/">${esc(D.tracts[t].name)}</a>` : '').join('')}</div>` : ''}
  <div id="pgmap"></div>
</div></header>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">The homes</span><h2>All ${num(homes.length)} homes on <em>${esc(s.name)}.</em></h2></div>
  ${homesTable(homes)}
</div></section>
<section class="pg"><div class="wrap">
  ${captureCard({
    eyebrow: 'Live on ' + esc(s.name) + '?',
    lead: `Get the ${esc(s.name)} report: what each recent sale on this street means for your home's number.`,
    intent: 'interest',
    tract: tractSlugs[0] || null,
    source: 'street_page_report',
    cta: 'Send me the street report'
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
  const title = `${t.name} — Campbell, CA 95008 Tract Guide & Home Values | The Campbell Market`;
  const desc = `${t.name} in Campbell, CA 95008: ${homes.length} homes${t.yr ? ', built around ' + t.yr : ''}, median estimated value ${money(mv)}. Every home, street, and recorded sale in the ${t.name} tract.`;

  const recs = [
    [num(homes.length), 'Homes in tract'],
    [money(mv), 'Median est. value'],
    [t.yr || '—', 'Typical year built'],
    [num(streetSlugs.length), 'Streets'],
  ].map(r => `<div class="rec"><div class="n">${r[0]}</div><div class="l">${r[1]}</div></div>`).join('');

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Place', name: t.name + ', Campbell, CA 95008',
    description: desc,
    address: { '@type': 'PostalAddress', addressLocality: 'Campbell', addressRegion: 'CA', postalCode: '95008' },
  });

  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a> / <a href="/tracts/">Tracts</a></div>
  <span class="eyebrow">Tract record · ${t.type ? esc(t.type) + ' · ' : ''}Campbell 95008</span>
  <h1>${esc(t.name)}<em>, measured.</em></h1>
  <p class="sub">${esc(t.name)} is a ${t.yr ? 'circa-' + t.yr + ' ' : ''}Campbell tract of ${num(homes.length)} homes${t.hoa ? ', with ' + esc(t.hoa) : ''}. Every home and recorded sale in it is indexed below.</p>
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
  ${captureCard({
    eyebrow: 'Own a home in ' + esc(t.name) + '?',
    lead: `Get the ${esc(t.name)} tract report: every recent sale, the current median, and what it means for your home specifically.`,
    intent: 'interest',
    tract: slug,
    source: 'tract_page_report',
    cta: 'Send me the tract report'
  })}
</div></section>`;

  return shell(title, desc, `/tract/${slug}/`, body, jsonld,
    mapScript(homes.map(h => [h.y, h.x, esc(h.a)])));
}

function renderTractsIndex(D) {
  const entries = Object.entries(D.tracts).sort((a, b) => b[1].n - a[1].n);
  const named = entries.filter(e => !e[1].numbered);
  const numbered = entries.filter(e => e[1].numbered);
  const title = 'Campbell, CA 95008 Tracts & Neighborhoods — The Complete Index | The Campbell Market';
  const desc = `Every recorded tract and subdivision in Campbell, CA 95008 — ${named.length} named tracts and ${numbered.length} numbered tracts, each with its homes, streets, values, and sales.`;
  const link = e => `<a href="/tract/${e[0]}/">${esc(e[1].name)} <span>· ${e[1].n} homes${e[1].mv ? ' · ' + money(e[1].mv) : ''}</span></a>`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a></div>
  <span class="eyebrow">The tract index</span>
  <h1>Every tract in Campbell, <em>on the record.</em></h1>
  <p class="sub">${named.length} named tracts and ${numbered.length} numbered county tracts. Campbell was built subdivision by subdivision — this is the full list.</p>
</div></header>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Named tracts</span><h2>The named neighborhoods.</h2></div>
  <div class="idx-cols">${named.map(link).join('')}</div>
</div></section>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Numbered tracts</span><h2>County-numbered tracts.</h2></div>
  <div class="idx-cols">${numbered.map(link).join('')}</div>
</div></section>`;
  return shell(title, desc, '/tracts/', body, null, null);
}

function renderStreetsIndex(D) {
  const entries = Object.entries(D.streets).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const title = 'Campbell, CA 95008 Streets — Every Street Indexed | The Campbell Market';
  const desc = `All ${entries.length} streets in Campbell, CA 95008, each with every home, estimated value, and recorded sale on file.`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a></div>
  <span class="eyebrow">The street index</span>
  <h1>All ${entries.length} streets of 95008, <em>A to Z.</em></h1>
  <p class="sub">Every street in Campbell has its own record: its homes, its values, its sales.</p>
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
  return shell('Page not found — The Campbell Market', 'Page not found.', '/404', body, null, null);
}


/* ---------- public pages ---------- */

const FEE_DISCLAIMER = `<p style="font-size:.74rem;color:var(--slate-dim);line-height:1.7;max-width:64ch;margin-top:18px">Real estate commissions are fully negotiable and are not set by law or by any association. Any fee shown reflects McMullen Properties' own offering only; your actual costs depend on the terms you negotiate.</p>`;

function renderHowItWorks() {
  const title = 'How It Works — The Campbell Market';
  const desc = 'Every Campbell home, open for offers. How buyers pursue any home in 95008 — listed or not — and how owners come to market on a ladder, not a cliff: Make Me Move, Coming Soon, or Active Listing.';
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
    <div class="crumbs" style="color:var(--chrome-soft)"><a href="/" style="color:var(--chrome-soft)">Campbell 95008</a></div>
    <span class="eyebrow" style="color:var(--apricot-soft)">How The Campbell Market works</span>
    <h1 style="max-width:16ch">Every Campbell home. <em style="color:var(--apricot-soft)">Open for offers.</em></h1>
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
  <p class="sub only-buyer" style="margin-top:14px">Only a few dozen Campbell homes are on the market at any moment — out of 6,609. The one you want is probably owned by someone who'd sell for the right number. Portals can't reach them. We can.</p>
  <div class="tiles" style="margin-top:36px">
    <div class="tile"><div class="eyebrow" style="margin-bottom:6px">01</div><h3 style="font-size:1.1rem;margin-bottom:8px">Listing is a one-way door</h3><p style="font-size:.9rem;color:var(--slate)">Once you're on Zillow, your home has a public price history. Pull it without a sale and "stale listing" follows you on every future agent's screen for years.</p></div>
    <div class="tile"><div class="eyebrow" style="margin-bottom:6px">02</div><h3 style="font-size:1.1rem;margin-bottom:8px">You don't actually know your price</h3><p style="font-size:.9rem;color:var(--slate)">An agent quotes a range built on citywide comps. Your tract's actual recent $/sf — Fairlands is not White Oaks Manor is not the Hamilton condos — tells a more honest story. We give you both, side by side.</p></div>
    <div class="tile"><div class="eyebrow" style="margin-bottom:6px">03</div><h3 style="font-size:1.1rem;margin-bottom:8px">The right buyer is already here</h3><p style="font-size:.9rem;color:var(--slate)">Serious buyers are watching specific Campbell tracts right now. Most will never see your home unless you float a number and let them find you first.</p></div>
  </div>
  <div class="band-dark">
    <div><div class="n">6,609</div><div class="l">Homes indexed</div></div>
    <div><div class="n">4,969</div><div class="l">Recorded sales tracked</div></div>
    <div><div class="n">740</div><div class="l">Tracts catalogued</div></div>
    <div><div class="n gold">$8.9B</div><div class="l">Total value indexed</div></div>
  </div>
</div></section>

<section class="pg" id="data" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">The data</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">Every tract, <em>by the numbers.</em></h2>
  <p class="sub" style="margin-top:14px">Know what your tract, your street, and your era of construction actually command. Median $/sf by tract, every recorded sale, and estimates that always show their basis — the full workbench is on the <a href="/intelligence/" style="color:var(--apricot)">intelligence page</a>, free, no account.</p>
  <div class="tiles" style="margin-top:30px">
    <div class="tile"><div class="n">$1,070</div><div class="l">Median $/sf citywide, last 24 months</div></div>
    <div class="tile"><div class="n">$635\u2013$1,212</div><div class="l">Tract-level $/sf spread — your tract matters</div></div>
    <div class="tile"><div class="n">149</div><div class="l">Sales recorded in the last 12 months</div></div>
  </div>
</div></section>

<section class="pg only-buyer" id="how"><div class="wrap">
  <span class="eyebrow">The marketplace \u00b7 for buyers</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">Every home. Every tract. <em>Open to an offer.</em></h2>
  <p class="sub" style="margin-top:14px">This isn't inventory — it's the whole city. Find the home, read its record, and if you're serious, we approach the owner discreetly on your behalf. No pressure on them, no exposure for you.</p>
  <div class="steps" style="max-width:680px;margin-top:20px">
    <div class="step"><div><h4>Find it</h4><p>Browse <a href="/#map" style="color:var(--apricot)">the map</a>, <a href="/tracts/" style="color:var(--apricot)">the tracts</a>, or <a href="/streets/" style="color:var(--apricot)">the streets</a> — every one of 6,609 homes has a record: specs, last sale, tract context.</p></div></div>
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

<section class="pg" id="playbooks"><div class="wrap">
  <span class="eyebrow">Special situations</span>
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem);max-width:24ch">Tenant in place? <em>Investor exit?</em> There's a playbook.</h2>
  <p class="sub" style="margin-top:14px;margin-bottom:34px">Two deeper guides for owners whose Campbell home is a rental — how to sell with a tenant in place (or unlock a compliant vacancy), and how a 1031 exchange rolls the proceeds into a hands-off asset with the tax deferred.</p>
  <div class="playbook-grid">
    <div class="playbook"><div class="pk">Owner guide</div><h3>Sell with a tenant</h3>
      <p>A tenant isn't a problem — it's a strategy. Occupied-vs-vacant math, compliant paths to possession, and direct access to the investors who already own rentals in Campbell.</p>
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
  <h2 style="font-size:clamp(1.8rem,3.8vw,2.7rem)">Frequently asked, <em>Campbell edition.</em></h2>
  <div class="faq" style="max-width:760px;margin-top:26px">
    <details><summary>Is my home "listed" because it appears on this site?</summary><div class="a">No. Your home appears in the index because it exists in Santa Clara County public records — the same records anyone can look up. Nothing on this site states or implies your home is for sale unless you choose to make it so.</div></details>
    <details><summary>Is my data private?</summary><div class="a">Make Me Move numbers and buyer interest are never public — not on Zillow, Redfin, the MLS, or anywhere on this site. Buyer identity reaches an owner only when a real expression of interest is submitted, and owner identity is never shared with buyers browsing the index.</div></details>
    <details><summary>Do I need to sign anything to set a Make Me Move number?</summary><div class="a">No. It's Tier 1 — no listing agreement, no commitment to sell at that price, no obligation to respond to anyone. Adjust, pause, or withdraw the number anytime.</div></details>
    <details><summary>How is this different from a Zestimate?</summary><div class="a">Two ways. The data here is tract-specific — what Fairlands or Rancho Del Prado actually traded for, not a citywide algorithm; Campbell tracts range from roughly $635/sf to $1,212/sf, and averages hide that. And a Make Me Move number is matched against actual buyer demand, not a passive estimate.</div></details>
    <details><summary>Can I pursue a home that isn't listed?</summary><div class="a">Yes — that's the point. Every one of the 6,609 homes in the index accepts an expression of interest. The owner doesn't need a listing or an agent for you to raise your hand. If your number compels them, you'll hear back.</div></details>
    <details><summary>What if I already have an agent?</summary><div class="a">Bring them. The index and the records are open; your agent can work alongside everything here and represent you through any eventual transaction.</div></details>
    <details><summary>Where do the numbers come from?</summary><div class="a">Santa Clara County assessor and recorder data, plus MLS sale records, refreshed twice daily. Estimates are computational, not appraisals — the full sourcing is on the <a href="/methodology/" style="color:var(--apricot)">methodology page</a>.</div></details>
  </div>
</div></section>

<section class="pg" id="signup"><div class="wrap">
  ${captureCard({
    eyebrow: 'Ready when you are',
    lead: 'Start with your own record — the file, the comps, and the current number for one specific Campbell home: yours.',
    intent: 'valuation',
    source: 'how_it_works_page',
    cta: "Request your home's record",
    placeholder: 'Your Campbell address'
  })}
</div></section>
<script>${personaJs}</script>`;
  return shell(title, desc, '/how-it-works/', body, null, null);
}

function renderSellWithTenants() {
  const title = 'Sell a Tenant-Occupied Home in Campbell — The Playbook | The Campbell Market';
  const desc = "A tenant isn't a problem — it's a strategy. How Campbell rental owners sell with a tenant in place, unlock a compliant vacancy, or hand the keys to an investor who wants the tenant to stay.";
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a> / <a href="/how-it-works/">How it works</a></div>
  <span class="eyebrow">Owner guide \u00b7 Tenant-occupied</span>
  <h1 style="max-width:18ch">A tenant isn't a problem. <em>It's a strategy.</em></h1>
  <p class="sub">Most agents treat a tenant as an obstacle to clear before the sign goes up. The right buyer treats a good tenant as the asset — in-place income from day one. This playbook covers both roads.</p>
</div></header>
<section class="pg"><div class="wrap">
  <span class="eyebrow">The math first</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">What is your rental <em>actually yielding?</em></h2>
  <p class="sub" style="margin-top:14px">The median Campbell home is now worth about $1.88M. Run your own numbers: a year of your current rent, minus taxes, insurance, maintenance, and vacancies, divided by what the home would sell for today. For many long-held Campbell rentals that figure lands painfully low — the equity has outgrown the rent. That's the moment this playbook exists for.</p>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">The two roads</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">Two paths. One goal: <em>your top dollar.</em></h2>
  <div class="playbook-grid" style="margin-top:30px">
    <div class="playbook"><div class="pk">Path A</div><h3>Sell occupied, to an investor</h3>
      <p>The buyer wants the tenant. No vacancy, no make-ready costs, no showings circus — the lease and the income transfer with the deed. Campbell's index shows 2,187 absentee-owned homes: a real, reachable pool of investors who already own rentals here and understand the asset.</p></div>
    <div class="playbook"><div class="pk">Path B</div><h3>Unlock a compliant vacancy, sell retail</h3>
      <p>When the retail premium justifies it: a lawful, properly-noticed path to possession — California and any local tenant-protection rules followed to the letter, relocation obligations handled openly — then prepare and sell to an owner-occupant at full retail.</p></div>
  </div>
  <p class="sub" style="margin-top:26px">Which road nets more is arithmetic, not philosophy — occupied price versus retail price minus vacancy cost, make-ready, time, and any relocation obligation. We run both columns before recommending either.</p>
</div></section>
<section class="pg"><div class="wrap">
  <span class="eyebrow">The buyers</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">We don't list and hope. <em>We already know the buyers.</em></h2>
  <p class="sub" style="margin-top:14px">The Campbell index maps every absentee-owned home in 95008 — the investors who already own here and add when the numbers work. A tenant-occupied sale can move quietly, owner to owner, without a public listing ever existing.</p>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">The tax question</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">Don't hand the gain <em>to the IRS.</em></h2>
  <p class="sub" style="margin-top:14px">Selling a long-held rental can trigger a six-figure capital-gains bill — unless the proceeds roll forward through a 1031 exchange into new investment property, tax deferred. If exiting landlording is the real goal, read the companion guide: <a href="/how-it-works/1031-exchange/" style="color:var(--apricot)">the 1031 exchange path \u2192</a></p>
</div></section>
<section class="pg"><div class="wrap">
  ${captureCard({
    eyebrow: 'Own a Campbell rental?',
    lead: 'Get both columns run for your property — occupied value, retail value, and the honest math between them. Private, no obligation.',
    intent: 'valuation',
    source: 'tenant_playbook_page',
    cta: 'Run my numbers',
    placeholder: 'The rental property address'
  })}
  <p style="font-size:.72rem;color:var(--slate-dim);margin-top:18px;max-width:70ch">This guide is general information, not legal or tax advice. Tenancy terminations are governed by California law and any applicable local ordinances; consult a landlord-tenant attorney before acting, and a CPA or qualified intermediary on any tax matter.</p>
</div></section>`;
  return shell(title, desc, '/how-it-works/sell-with-tenants/', body, null, null);
}

function render1031() {
  const title = 'The 1031 Exchange Path for Campbell Rental Owners | The Campbell Market';
  const desc = 'Stop being a landlord, keep the equity working: how a 1031 exchange sells your Campbell rental, defers every dollar of capital-gains tax, and rolls the proceeds into hands-off real estate.';
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a> / <a href="/how-it-works/">How it works</a></div>
  <span class="eyebrow">Owner guide \u00b7 1031 exchange</span>
  <h1 style="max-width:18ch">Stop being a landlord. <em>Start being an investor.</em></h1>
  <p class="sub">Being a landlord is a job you didn't mean to take. Your Campbell rental's equity doesn't have to keep employing you — a 1031 exchange moves it, tax-deferred, into real estate that doesn't call at midnight.</p>
</div></header>
<section class="pg"><div class="wrap">
  <span class="eyebrow">What it does</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">Everything a 1031 exchange <em>actually does.</em></h2>
  <p class="sub" style="margin-top:14px">Section 1031 of the tax code lets you sell investment property and reinvest the proceeds in like-kind investment property while deferring capital-gains tax — federal and California — that would otherwise come due at sale. On a long-held Campbell rental, that deferral routinely keeps six figures working for you instead of leaving in April.</p>
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
    <div class="step"><div><h4>Sell the Campbell rental</h4><p>Occupied or vacant — the tenant playbook and this one work together. Proceeds go straight to the QI.</p></div></div>
    <div class="step"><div><h4>Identify within 45 days</h4><p>Name the replacement property (or DST) in writing under the identification rules.</p></div></div>
    <div class="step"><div><h4>Close within 180 days</h4><p>The QI funds the purchase; the gain rides forward, deferred in full.</p></div></div>
  </div>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  ${captureCard({
    eyebrow: 'Thinking about the exit?',
    lead: 'Start with the two numbers that drive everything: what your Campbell rental would sell for today, and what the deferred tax is worth to you. Private, no obligation.',
    intent: 'valuation',
    source: '1031_playbook_page',
    cta: 'Start the conversation',
    placeholder: 'The rental property address'
  })}
  <p style="font-size:.72rem;color:var(--slate-dim);margin-top:18px;max-width:70ch">This guide is general information, not tax or investment advice. 1031 exchanges have strict rules and deadlines; DSTs are securities offered through licensed channels and involve risk. Engage a qualified intermediary and consult your CPA before acting.</p>
</div></section>`;
  return shell(title, desc, '/how-it-works/1031-exchange/', body, null, null);
}

function renderMakeMeMove() {
  const title = 'Make Me Move — Name Your Price | The Campbell Market';
  const desc = 'Set the price you would actually sell your Campbell home for. Private, non-binding, never listed. If a qualified buyer meets your number, you decide.';
  const body = `
<header class="page-hero" style="background:radial-gradient(900px 460px at 78% -10%,rgba(217,154,78,.16),transparent 60%),var(--chrome);color:var(--chrome-ink);padding-bottom:64px"><div class="wrap">
  <div class="crumbs" style="color:var(--chrome-soft)"><a href="/" style="color:var(--chrome-soft)">Campbell 95008</a> / <a href="/how-it-works/" style="color:var(--chrome-soft)">How it works</a></div>
  <span class="eyebrow" style="color:var(--apricot-soft)">Make me move</span>
  <h1 style="max-width:17ch">Name the price you'd <em style="color:var(--apricot-soft)">actually sell for.</em></h1>
  <p class="sub" style="color:#c6cbd6">Not "thinking about selling." Not "testing the market." A private number: if someone paid this, I'd move. Never listed, never public, never binding — and it costs nothing.</p>
  <p style="margin-top:28px"><a class="btn btn-gold" href="#mmm-form">Set my private price \u2193</a></p>
</div></header>
<section class="pg"><div class="wrap">
  <span class="eyebrow">How Make Me Move works</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">Three steps. <em>Zero commitment.</em></h2>
  <div class="steps" style="max-width:680px;margin-top:20px">
    <div class="step"><div><h4>Name it</h4><p>Tell us your number privately. No sign, no listing, no showings — nothing about your home changes anywhere.</p></div></div>
    <div class="step"><div><h4>We watch</h4><p>Your number is matched quietly against real buyer demand for your tract and street — the people already watching Campbell.</p></div></div>
    <div class="step"><div><h4>You decide</h4><p>A qualified buyer at or above your number? You hear about it first, privately — and you choose. Declining costs nothing.</p></div></div>
  </div>
</div></section>
<section class="pg" style="background:var(--bg-2)"><div class="wrap">
  <span class="eyebrow">From offer to close</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">If your number gets met, <em>here's what happens.</em></h2>
  <div class="steps" style="max-width:680px;margin-top:20px">
    <div class="step"><div><h4>The interest arrives</h4><p>A written expression of interest — the buyer's number and terms — presented to you privately by a licensed broker associate.</p></div></div>
    <div class="step"><div><h4>You take your time</h4><p>Accept, counter, or pass. There is no clock and no obligation; your number was an invitation, not a contract.</p></div></div>
    <div class="step"><div><h4>Close on your terms</h4><p>Say yes and it becomes a standard California purchase transaction — escrow, title, disclosures — handled start to finish.</p></div></div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  <span class="eyebrow">Fees</span>
  <h2 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">One flat fee. <em>Only if you sell.</em></h2>
  <p class="sub" style="margin-top:14px">A flat 3% total commission at closing, covering the entire transaction. Setting a Make Me Move price is free, changing it is free, and saying no is free — the fee exists only if you actually sell.</p>
  ${FEE_DISCLAIMER}
</div></section>
<section class="pg" id="mmm-form" style="background:var(--bg-2)"><div class="wrap">
  <div class="method-card" style="max-width:620px">
    <span class="eyebrow">Set your Make-Me-Move price</span>
    <p>Private and non-binding. Tim confirms every submission personally before anything else happens.</p>
    <form class="cb-capture" data-intent="mmm_price" data-source="make_me_move_page" data-cta="Set my private price">
      <input type="text" name="name" placeholder="Your name" autocomplete="name">
      <input type="email" name="email" placeholder="Email address" required autocomplete="email">
      <input type="text" name="target_price" placeholder="Your number \u2014 e.g. $2,400,000 or 2.4M" inputmode="decimal">
      <textarea name="message" placeholder="Your Campbell address"></textarea>
      <button type="submit" class="btn btn-gold">Set my private price</button>
    </form>
    <p style="font-size:.72rem;color:var(--slate-dim);margin-top:12px;margin-bottom:0">Direct to Tim McMullen, CA DRE #02016832. Never shared, never listed, withdraw any time.</p>
  </div>
</div></section>`;
  return shell(title, desc, '/make-me-move/', body, null, null);
}

function renderMethodology() {
  const title = 'Methodology — Where Every Number Comes From | The Campbell Market';
  const desc = "The Campbell Market's data sources: Santa Clara County assessor and recorder records, recorded deeds, and MLS sale data for the 95008 zip code. Estimates, not appraisals — and how to correct an error.";
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a></div>
  <span class="eyebrow">Methodology</span>
  <h1>Here is the number, <em>and how we got it.</em></h1>
  <p class="sub">Transparency is the product. Every figure on this site traces to a named public source — and where a number is an estimate, it says so.</p>
</div></header>
<section class="pg"><div class="wrap">
  <div class="tiles">
    <div class="tile"><div class="n serif">01. County records</div><div class="l" style="margin-top:8px">Santa Clara County Assessor and Recorder data: parcels, characteristics (beds, baths, square footage, year built), recorded deeds, and sale prices for every parcel in the 95008 zip code.</div></div>
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
  <p class="sub" style="margin-top:26px">See an error in your home's record? Email <a href="mailto:tim@campbellrealestatemarket.com" style="color:var(--apricot)">tim@campbellrealestatemarket.com</a> with the address and the correction — records are fixed at the source, usually within a day.</p>
</div></section>`;
  return shell(title, desc, '/methodology/', body, null, null);
}


function renderIntelligence() {
  const title = 'Campbell Market Intelligence — Every Sale, Every Tract, Measured | The Campbell Market';
  const desc = 'The complete Campbell, CA 95008 market dashboard: the citywide $/sf trend by quarter, live recent sales, tract-by-tract price movement over 1, 3, 5, and 10 years, and side-by-side tract comparison — all built on recorded sales.';
  const clientJs = `
(function(){
  function num(n){return n==null?'\u2014':Number(n).toLocaleString('en-US');}
  function money(n){return n==null?'\u2014':'$'+(n>=1e6?(n/1e6).toFixed(2).replace(/\\.?0+$/,'')+'M':Math.round(n/1000)+'K');}
  fetch('/assets/cb-market-intel.json').then(function(r){return r.json();}).then(function(I){
    var T=I.totals;
    document.getElementById('izBand').innerHTML=[
      ['$'+num(T.median_ppsf),'Median $/sf \u00b7 24 mo'],
      [num(T.homes_indexed),'Homes indexed'],
      [num(T.sales_on_record),'Sales on record'],
      [num(T.sales_12mo),'Sales \u00b7 12 mo'],
      [num(T.tracts_tracked),'Tracts tracked']
    ].map(function(t){return '<div class="rec"><div class="n">'+t[0]+'</div><div class="l">'+t[1]+'</div></div>';}).join('');

    document.getElementById('izFeed').innerHTML=I.feed.map(function(f){
      return '<div class="feed-row"><div><div class="fa">'+(f.s?('<a href="/home/'+f.s+'/">'+f.a+'</a>'):f.a)+'</div>'+
        '<div class="fm">'+(f.tract?f.tract+' \u00b7 ':'')+(f.sf?num(f.sf)+' sf \u00b7 ':'')+(f.ppsf?'$'+num(f.ppsf)+'/sf':'')+'</div></div>'+
        '<div style="text-align:right"><div class="fp">'+money(f.p)+'</div><div class="fd">'+f.d+'</div></div></div>';
    }).join('');

    var qs=I.quarters.filter(function(q){return q.ppsf;});
    if(qs.length>1){
      var vals=qs.map(function(q){return q.ppsf;});
      var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals),pad=(max-min)*0.12||1;
      var W=980,H=260;
      var pts=vals.map(function(v,i){
        var x=8+i*(W-16)/(vals.length-1);
        var y=H-14-(v-min+pad)/(max-min+2*pad)*(H-28);
        return [Math.round(x*10)/10,Math.round(y*10)/10];
      });
      var line=pts.map(function(p){return p[0]+','+p[1];}).join(' ');
      var area='8,'+(H-6)+' '+line+' '+pts[pts.length-1][0]+','+(H-6);
      document.getElementById('izChart').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">'+
        '<polygon points="'+area+'" fill="rgba(217,154,78,.12)"/>'+
        '<polyline points="'+line+'" fill="none" stroke="#d99a4e" stroke-width="2"/>'+
        '<circle cx="'+pts[pts.length-1][0]+'" cy="'+pts[pts.length-1][1]+'" r="4" fill="#d99a4e"/></svg>';
      document.getElementById('izCapL').innerHTML=qs[0].q+' <b>$'+num(qs[0].ppsf)+'</b>';
      document.getElementById('izCapR').innerHTML=qs[qs.length-1].q+' <b>$'+num(qs[qs.length-1].ppsf)+'</b>';
    }

    var slugs=Object.keys(I.tracts).sort(function(a,b){return I.tracts[a].name.localeCompare(I.tracts[b].name);});
    function opts(sel){
      slugs.forEach(function(s){
        var o=document.createElement('option'); o.value=s; o.textContent=I.tracts[s].name+' ('+I.tracts[s].all_n+' sales)';
        sel.appendChild(o);
      });
    }
    var mvSel=document.getElementById('izTract'); opts(mvSel);
    var horizon='h3';
    function drawMove(){
      var t=I.tracts[mvSel.value]; if(!t)return;
      var hz=t[horizon]||{};
      var nowP=t.h1&&t.h1.ppsf?t.h1.ppsf:(t.h3?t.h3.ppsf:null);
      var rows=[
        ['Median $/sf over horizon', hz.ppsf?'$'+num(hz.ppsf)+'/sf':'\u2014 (not enough sales)'],
        ['Median $/sf \u00b7 last 12 mo', nowP?'$'+num(nowP)+'/sf':'\u2014 (not enough sales)'],
        ['Median sale price over horizon', hz.price?money(hz.price):'\u2014'],
        ['Recorded sales in horizon', num(hz.n)],
        ['Typical year built', t.yr||'\u2014']
      ];
      document.getElementById('izMove').innerHTML=rows.map(function(r){
        return '<div class="cmp-stat"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>';
      }).join('')+'<p class="horizon-note">Horizons without enough recorded sales to be reliable are marked. Full record: <a style="color:var(--apricot)" href="/tract/'+mvSel.value+'/">'+t.name+' tract page \u2192</a></p>';
    }
    mvSel.addEventListener('change',drawMove);
    document.getElementById('izHorizons').addEventListener('click',function(e){
      if(e.target.tagName!=='BUTTON')return;
      horizon=e.target.getAttribute('data-h');
      document.querySelectorAll('#izHorizons .pill-t').forEach(function(b){b.classList.toggle('on',b===e.target);});
      drawMove();
    });
    mvSel.value=slugs[0]; drawMove();

    var selA=document.getElementById('izCmpA'), selB=document.getElementById('izCmpB');
    opts(selA); opts(selB);
    function card(slug){
      var t=I.tracts[slug]; if(!t)return '';
      var h=t.h3||{};
      return '<div class="cmp-stat"><span>Median $/sf \u00b7 3y</span><b>'+(h.ppsf?'$'+num(h.ppsf)+'/sf':'\u2014')+'</b></div>'+
        '<div class="cmp-stat"><span>Median sale \u00b7 3y</span><b>'+(h.price?money(h.price):'\u2014')+'</b></div>'+
        '<div class="cmp-stat"><span>Sales \u00b7 3y</span><b>'+num(h.n)+'</b></div>'+
        '<div class="cmp-stat"><span>Sales on record</span><b>'+num(t.all_n)+'</b></div>'+
        '<div class="cmp-stat"><span>Typical year built</span><b>'+(t.yr||'\u2014')+'</b></div>'+
        '<p class="horizon-note"><a style="color:var(--apricot)" href="/tract/'+slug+'/">'+t.name+' tract page \u2192</a></p>';
    }
    function drawCmp(){
      document.getElementById('izCmpAOut').innerHTML=card(selA.value);
      document.getElementById('izCmpBOut').innerHTML=card(selB.value);
    }
    selA.addEventListener('change',drawCmp); selB.addEventListener('change',drawCmp);
    selA.value=slugs[0]; selB.value=slugs[1]||slugs[0]; drawCmp();
  });
})();
`;
  const body = `
<header class="page-hero"><div class="wrap">
  <div class="crumbs"><a href="/">Campbell 95008</a></div>
  <span class="eyebrow">Market intelligence</span>
  <h1>Every sale. Every tract. <em>Measured.</em></h1>
  <p class="sub">The Campbell market dashboard — the citywide trend, live activity, and tract-by-tract movement, all built on recorded sales. No trend arrows on one sale.</p>
  <div class="rec-grid" id="izBand"></div>
</div></header>
<section class="pg"><div class="wrap">
  <div class="mz-grid">
    <div class="mz-card">
      <div class="mz-eyebrow"><span class="dot"></span>Live sales feed</div>
      <div class="mz-sub">The most recent Campbell closings on record.</div>
      <div id="izFeed"></div>
    </div>
    <div class="mz-card mz-chart">
      <div class="mz-eyebrow">$/SF Trajectory &middot; 10 years</div>
      <div class="mz-sub">Median price per square foot, by quarter, across all of 95008.</div>
      <div id="izChart"></div>
      <div class="cap"><span id="izCapL"></span><span id="izCapR"></span></div>
    </div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">How prices have moved</span>
  <h2>Price movement by <em>tract.</em></h2>
  <p class="sub">Choose a tract and a time horizon to see how its numbers have moved. Only tracts with 8+ recorded sales are listed.</p></div>
  <div class="mz-card" style="max-width:680px">
    <select class="cb-select" id="izTract"></select>
    <div class="pillbar" id="izHorizons" style="margin-bottom:16px">
      <button class="pill-t" data-h="h1">1 Year</button>
      <button class="pill-t on" data-h="h3">3 Years</button>
      <button class="pill-t" data-h="h5">5 Years</button>
      <button class="pill-t" data-h="h10">10 Years</button>
    </div>
    <div id="izMove"></div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Tract data</span>
  <h2>Compare two <em>tracts.</em></h2>
  <p class="sub">Pick any two Campbell tracts to compare median price per square foot, sale price, and recent activity side by side.</p></div>
  <div class="cmp-grid">
    <div class="mz-card"><select class="cb-select" id="izCmpA"></select><div id="izCmpAOut"></div></div>
    <div class="mz-card"><select class="cb-select" id="izCmpB"></select><div id="izCmpBOut"></div></div>
  </div>
</div></section>
<section class="pg"><div class="wrap">
  ${captureCard({
    eyebrow: 'Want your home measured?',
    lead: 'Every number on this page can be run for one specific home: yours. Ask for the record and the current figure.',
    intent: 'valuation',
    source: 'intelligence_page',
    cta: "Request your home's record"
  })}
</div></section>
<script>${clientJs}</script>`;
  return shell(title, desc, '/intelligence/', body, null, null);
}

/* ---------- router ---------- */
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

    // homepage: worker-rendered (source of truth; immune to asset-upload mishaps)
    if (path === '/' || path === '/index.html') {
      return htmlResponse(HOMEPAGE);
    }

    // dynamic routes: /tract/x /street/x /home/x (+ index hubs)
    const m = path.match(/^\/(tract|street|home)\/([a-z0-9-]+)\/?$/);
    const isHub = path === '/tracts' || path === '/tracts/' || path === '/streets' || path === '/streets/';
    const staticPage = path.match(/^\/(how-it-works|make-me-move|methodology|intelligence)\/?$/)
      || path.match(/^\/(how-it-works\/(?:sell-with-tenants|1031-exchange))\/?$/);

    if (staticPage) {
      if (!path.endsWith('/') && request.method === 'GET') {
        return new Response(null, { status: 301, headers: { 'Location': path + '/' + url.search, 'Cache-Control': 'public, max-age=3600' } });
      }
      if (path === '/intelligence/') return htmlResponse(renderIntelligence());
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
      const D = await loadData(env, url.origin);
      if (path === '/tracts/') return htmlResponse(renderTractsIndex(D));
      if (path === '/streets/') return htmlResponse(renderStreetsIndex(D));
      const [, kind, slug] = m;
      if (kind === 'home') {
        const p = D.bySlug.get(slug);
        return p ? htmlResponse(renderHome(p, D)) : htmlResponse(render404(), 404);
      }
      if (kind === 'street') {
        return D.streets[slug] ? htmlResponse(renderStreet(slug, D)) : htmlResponse(render404(), 404);
      }
      if (kind === 'tract') {
        return D.tracts[slug] ? htmlResponse(renderTract(slug, D)) : htmlResponse(render404(), 404);
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
