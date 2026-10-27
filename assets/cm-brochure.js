/* cm-brochure.js — a property's page as a downloadable brochure (Tim, 27 Oct 2026: "Every for sale listing, coming
   soon listing, exchange, make me move, etc has a button for a downloadable brochure page > web page gets converted into
   a pdf > download directly from property listing page").

   One generator for every listing-type page on both platforms. The page hands over what it already shows (address,
   price, facts, photos, the description, the page's own URL, the agent) and this draws a letter-size PDF in the browser
   and downloads it: no server, no print dialog. Text is real text (selectable, sharp at any zoom); photographs are
   cropped to their frames; a QR code goes back to the live page.

   It states nothing the page does not: the price shown is the page's own (an asking price, an owner's number), with
   the page's own label; it never computes a value. Listings from the MLS carry their listing courtesy line when the page
   has one.

   API
     CMBrochure.download(data)         → Promise, resolves when the file has been handed to the browser
     CMBrochure.button(el, getData, opts?) → wires a button: label swap while building, error shown in place

   data = { kind, title, sub, price, priceLabel, facts: [[k,v]], photos: [url], body, highlights: [text], url,
            market: { name, domain }, agent: { name, phone, email, dre, brokerage, photo }, courtesy, fine, filename,
            accent }                                                                                                  */
(function () {
  if (window.CMBrochure) return;
  var JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var QR = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  var loaded = {};
  function load(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (ok, bad) {
      var s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { ok(); }; s.onerror = function () { delete loaded[src]; bad(new Error('Could not load ' + src.split('/').slice(-2, -1)[0])); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  /* A photograph, cropped to a frame of w×h points, as a JPEG data URL — or null (cross-origin refusal, 404, timeout).
     A brochure with one missing photo is still a brochure. */
  function photo(url, w, h) {
    return new Promise(function (ok) {
      if (!url) return ok(null);
      var done = false, t = setTimeout(function () { if (!done) { done = true; ok(null); } }, 12000);
      var img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
      img.onload = function () {
        if (done) return; done = true; clearTimeout(t);
        try {
          var scale = 2.2, cw = Math.round(w * scale), ch = Math.round(h * scale);
          var c = document.createElement('canvas'); c.width = cw; c.height = ch;
          var g = c.getContext('2d'), r = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
          var dw = img.naturalWidth * r, dh = img.naturalHeight * r;
          g.fillStyle = '#eee'; g.fillRect(0, 0, cw, ch);
          g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
          ok(c.toDataURL('image/jpeg', 0.84));
        } catch (e) { ok(null); }
      };
      img.onerror = function () { if (!done) { done = true; clearTimeout(t); ok(null); } };
      img.src = url;
    });
  }
  function qrData(url) {
    try {
      var q = window.qrcode(0, 'M'); q.addData(url); q.make();
      var n = q.getModuleCount(), px = 8, c = document.createElement('canvas');
      c.width = c.height = (n + 2) * px;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111';
      for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + 1) * px, (r + 1) * px, px, px);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  }
  /* jsPDF's standard fonts are WinAnsi: keep the typographic marks it has, swap the rest. */
  function clean(s) {
    return String(s == null ? '' : s).replace(/[‐-‒−]/g, '-').replace(/ | | /g, ' ')
      .replace(/[→➔➜]/g, '>').replace(/✓|✔/g, '').replace(/[^\x00-\xff–—‘’“”•…€]/g, '');
  }
  function money(n) { return n == null || n === '' || isNaN(Number(n)) ? '' : '$' + Math.round(Number(n)).toLocaleString('en-US'); }
  function hex(c) { c = String(c || '').replace('#', ''); if (c.length === 3) c = c.replace(/./g, '$&$&'); var n = parseInt(c, 16); return isNaN(n) ? [176, 111, 36] : [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function slug(s) { return String(s || 'brochure').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'brochure'; }

  async function download(d) {
    d = d || {};
    await load(JSPDF); await load(QR).catch(function () {});
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) throw new Error('The PDF library did not load.');
    var W = 612, H = 792, M = 40, IW = W - 2 * M;
    var ink = [26, 31, 46], slate = [96, 104, 120], rule = [226, 221, 210], acc = hex(d.accent);
    var doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
    var photos = (d.photos || []).filter(Boolean);
    var shots = await Promise.all([photo(photos[0], IW, 300)].concat(photos.slice(1, 4).map(function (u) { return photo(u, (IW - 16) / 3, 104); })));
    var hero = shots[0], strip = shots.slice(1).filter(Boolean);
    var mk = d.market || {}, ag = d.agent || {};

    var page = 1;
    function header() {
      doc.setFillColor(ink[0], ink[1], ink[2]); doc.rect(0, 0, W, 34, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('times', 'normal'); doc.setFontSize(13);
      doc.text(clean(mk.name || ''), M, 22);
      if (d.kind) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        var k = clean(String(d.kind).toUpperCase()), kw = doc.getTextWidth(k) + 16;
        doc.setFillColor(acc[0], acc[1], acc[2]); doc.roundedRect(W - M - kw, 10, kw, 15, 7.5, 7.5, 'F');
        doc.setTextColor(255, 255, 255); doc.text(k, W - M - kw / 2, 20.5, { align: 'center' });
      }
    }
    function footer() {
      var y = H - 30;
      doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.6); doc.line(M, y - 10, W - M, y - 10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(slate[0], slate[1], slate[2]);
      var f = clean(d.fine || 'Information from public records and the listing; deemed reliable but not guaranteed. Not an appraisal.');
      doc.text(doc.splitTextToSize(f, IW - 40).slice(0, 2), M, y);
      doc.text(String(page), W - M, y, { align: 'right' });
    }
    function newPage() { footer(); doc.addPage(); page++; header(); return 56; }

    header();
    var y = 48;
    if (hero) { doc.addImage(hero, 'JPEG', M, y, IW, 300, undefined, 'FAST'); y += 300 + 18; }
    else { y += 6; }

    /* the address and the price */
    doc.setTextColor(ink[0], ink[1], ink[2]); doc.setFont('times', 'normal'); doc.setFontSize(25);
    var tl = doc.splitTextToSize(clean(d.title || ''), IW - 170);
    doc.text(tl, M, y + 6); var ty = y + 6 + (tl.length - 1) * 27;
    if (d.price != null && d.price !== '') {
      doc.setFont('times', 'normal'); doc.setFontSize(23);
      doc.text(typeof d.price === 'number' ? money(d.price) : clean(d.price), W - M, y + 6, { align: 'right' });
      if (d.priceLabel) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(slate[0], slate[1], slate[2]); doc.text(clean(d.priceLabel), W - M, y + 20, { align: 'right' }); }
    }
    if (d.sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(slate[0], slate[1], slate[2]); doc.text(clean(d.sub), M, ty + 17); ty += 17; }
    y = ty + 18;

    /* the facts, as a ruled row */
    var facts = (d.facts || []).filter(function (f) { return f && f[1] != null && String(f[1]).trim() !== '' && String(f[1]) !== '—'; }).slice(0, 8);
    if (facts.length) {
      var per = Math.min(facts.length, 4), cw = IW / per, rows = Math.ceil(facts.length / per);
      doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.6);
      for (var r = 0; r < rows; r++) {
        doc.line(M, y, W - M, y);
        for (var i = 0; i < per; i++) {
          var f = facts[r * per + i]; if (!f) continue;
          var x = M + i * cw;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(slate[0], slate[1], slate[2]);
          doc.text(clean(String(f[0]).toUpperCase()), x, y + 13);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(ink[0], ink[1], ink[2]);
          doc.text(doc.splitTextToSize(clean(f[1]), cw - 8)[0], x, y + 29);
        }
        y += 38;
      }
      doc.line(M, y, W - M, y); y += 16;
    }

    /* three more photographs */
    if (strip.length) {
      var sw = (IW - 16) / 3;
      if (y + 104 > H - 60) y = newPage();
      strip.forEach(function (s, i) { doc.addImage(s, 'JPEG', M + i * (sw + 8), y, sw, 104, undefined, 'FAST'); });
      y += 104 + 18;
    }

    /* highlights, then the description, flowing onto a second page when it is long */
    function para(text, size, color, font, gap) {
      doc.setFont(font || 'helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
      var lines = doc.splitTextToSize(clean(text), IW), lh = size * 1.42;
      lines.forEach(function (ln) {
        if (y + lh > H - 52) { y = newPage(); doc.setFont(font || 'helvetica', 'normal'); doc.setFontSize(size); }
        doc.setTextColor(color[0], color[1], color[2]); doc.text(ln, M, y); y += lh;
      });
      y += gap || 0;
    }
    (d.highlights || []).filter(Boolean).slice(0, 6).forEach(function (h) {
      doc.setFillColor(acc[0], acc[1], acc[2]); doc.circle(M + 3, y - 3.2, 2.2, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(ink[0], ink[1], ink[2]);
      var ls = doc.splitTextToSize(clean(h), IW - 14);
      ls.forEach(function (ln) {
        if (y + 15 > H - 52) { y = newPage(); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); }
        doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(ln, M + 12, y); y += 14.5;
      });
    });
    if ((d.highlights || []).length) y += 8;
    if (d.body) {
      String(d.body).split(/\n{2,}/).forEach(function (p) { if (p.trim()) para(p.replace(/\s*\n\s*/g, ' ').trim(), 10.5, ink, 'helvetica', 7); });
    }
    /* LISTING DETAILS (27 Oct 2026): every further fact the page holds, as a ruled two-column list. */
    var det = (d.details || []).filter(function (r) { return r && r[1] != null && String(r[1]).trim() !== ''; });
    if (det.length) {
      if (y + 40 > H - 52) y = newPage();
      y += 4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(slate[0], slate[1], slate[2]);
      doc.text('LISTING DETAILS', M, y); y += 8;
      var colW = (IW - 20) / 2, rowH = 0, half = Math.ceil(det.length / 2);
      for (var di = 0; di < half; di++) {
        var pair = [det[di], det[di + half]], hts = [];
        doc.setFontSize(9);
        pair.forEach(function (r) { if (r) hts.push(doc.splitTextToSize(clean(r[1]), colW - 108).length); });
        rowH = 8 + 12 * Math.max.apply(null, hts.concat([1]));
        if (y + rowH > H - 52) { y = newPage(); }
        doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.5);
        pair.forEach(function (r, ci) {
          if (!r) return;
          var x = M + ci * (colW + 20);
          doc.line(x, y, x + colW, y);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(slate[0], slate[1], slate[2]);
          doc.text(clean(r[0]), x, y + 12);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(ink[0], ink[1], ink[2]);
          doc.text(doc.splitTextToSize(clean(r[1]), colW - 108), x + 104, y + 12);
        });
        y += rowH;
      }
      y += 10;
    }
    if (d.courtesy) para(d.courtesy, 8.5, slate, 'helvetica', 4);

    /* the agent and the way back to the live page */
    var boxH = 92;
    if (y + boxH + 14 > H - 44) y = newPage();
    y = Math.max(y + 6, H - 44 - boxH - 8);
    doc.setFillColor(248, 246, 241); doc.setDrawColor(rule[0], rule[1], rule[2]); doc.roundedRect(M, y, IW, boxH, 8, 8, 'FD');
    var qx = W - M - boxH + 8, qr = d.url && window.qrcode ? qrData(d.url) : null;
    if (qr) doc.addImage(qr, 'PNG', qx, y + 8, boxH - 16, boxH - 16);
    var ax = M + 16, aimg = ag.photo ? await photo(ag.photo, 60, 60) : null;
    if (aimg) { doc.addImage(aimg, 'JPEG', ax, y + 16, 60, 60, undefined, 'FAST'); ax += 74; }
    doc.setTextColor(ink[0], ink[1], ink[2]); doc.setFont('times', 'normal'); doc.setFontSize(15);
    doc.text(clean(ag.name || mk.name || ''), ax, y + 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(slate[0], slate[1], slate[2]);
    var al = [ [ag.phone, ag.email].filter(Boolean).join('  ·  '), [ag.dre ? 'DRE #' + ag.dre : '', ag.brokerage].filter(Boolean).join('  ·  ') ].filter(Boolean);
    al.forEach(function (l, i) { doc.text(clean(l), ax, y + 47 + i * 13); });
    if (d.url) {
      doc.setTextColor(acc[0], acc[1], acc[2]); doc.setFontSize(8.5);
      var u = clean(String(d.url).replace(/^https?:\/\//, '').replace(/\?.*$/, ''));
      doc.textWithLink(doc.splitTextToSize(u, qx - ax - 12)[0], ax, y + boxH - 12, { url: d.url });
    }
    footer();

    var name = (d.filename || slug(d.title) + '-brochure').replace(/\.pdf$/i, '') + '.pdf';
    doc.setProperties({ title: clean(d.title || 'Brochure'), subject: clean(d.kind || ''), creator: clean(mk.name || '') });
    doc.save(name);
    try { if (window.CBTrack) window.CBTrack.event('cta_click', { cta: 'brochure:' + slug(d.kind || 'home') }); } catch (e) {}
    return { ok: true, file: name, photos: shots.filter(Boolean).length };
  }

  function button(el, getData, opts) {
    if (!el || el.__cmb) return; el.__cmb = 1;
    var label = el.textContent;
    el.addEventListener('click', function (e) {
      e.preventDefault(); if (el.disabled) return;
      /* ACCOUNT HOLDERS ONLY (Tim, 27 Oct 2026): opts.gate answers whether this visitor is signed in, and
         opts.signup sends them to make an account when they are not. */
      if (opts && opts.gate) {
        Promise.resolve().then(opts.gate).then(function (ok) { if (ok) run(); else if (opts.signup) opts.signup(); }, function () { if (opts.signup) opts.signup(); });
        return;
      }
      run();
    });
    function run() {
      el.disabled = true; el.textContent = (opts && opts.busy) || 'Making the PDF…';
      Promise.resolve().then(getData).then(download)
        .then(function () { el.disabled = false; el.textContent = label; })
        .catch(function (err) { el.disabled = false; el.textContent = 'Did not download: ' + ((err && err.message) || 'try again'); setTimeout(function () { el.textContent = label; }, 5000); });
    }
  }
  window.CMBrochure = { download: download, button: button, version: '2' };
})();
