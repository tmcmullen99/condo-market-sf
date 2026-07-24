/* ============================================================
   cm-psf-chart.js — the single $/sf chart for Condo Market.

   Both the homepage and the Intelligence page mount this. There is
   deliberately no second implementation: two charts drifting apart is
   the bug this replaces.

   Data comes from one RPC, market_psf_series, which:
     - excludes the in-progress period
     - holds back periods still inside the county recording lag
     - suppresses any point below a minimum sale count
     - supports month or quarter anchors and a trailing smoothing window

   Smoothing is chosen for the user, not by the user. Thin neighbourhoods
   need a wider window to be honest; asking a visitor to understand that
   would be a worse product. The applied window is always disclosed in
   the subtitle.
   ============================================================ */
(function (global) {
  'use strict';

  var SUPABASE_URL = global.__CM_SUPABASE_URL__ || 'https://kfqphwerygccpzntbbif.supabase.co';
  var SUPABASE_ANON = global.__CM_SUPABASE_ANON__ || '';

  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('rpc ' + name + ' ' + r.status);
      return r.json();
    });
  }

  function $(sel, root) {
    if (!sel) return null;
    if (typeof sel !== 'string') return sel;
    return (root || document).querySelector(sel);
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  function windowLabel(months, grain) {
    if (!months) return '';
    if ((grain === 'month' && months === 1) || (grain === 'quarter' && months === 3)) return '';
    return months === 12 ? '12-month rolling median'
         : months === 24 ? '24-month rolling median'
         : months + '-month rolling median';
  }

  var RANGES = [
    { years: 1,  label: '1 Year'   },
    { years: 3,  label: '3 Years'  },
    { years: 5,  label: '5 Years'  },
    { years: 10, label: '10 Years' }
  ];

  // Styles ship with the module rather than living in two stylesheets,
  // so the homepage and Intelligence controls cannot drift apart.
  var STYLE_ID = 'cm-psf-chart-css';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.cmp-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 18px}',
      '.cmp-controls select,.cmp-seg{font-family:var(--ff-mono,"JetBrains Mono",monospace);font-size:11px;letter-spacing:.06em;text-transform:uppercase}',
      '.cmp-hood{color:inherit;background:transparent;border:1px solid currentColor;border-radius:999px;padding:8px 16px;cursor:pointer;opacity:.85}',
      '.cmp-seg{display:inline-flex;border:1px solid rgba(128,128,128,.28);border-radius:999px;overflow:hidden}',
      '.cmp-seg button{font:inherit;letter-spacing:inherit;text-transform:inherit;background:transparent;color:inherit;border:0;padding:8px 14px;cursor:pointer;opacity:.6;transition:opacity .15s,background .15s}',
      '.cmp-seg button:hover:not(:disabled){opacity:.9}',
      '.cmp-seg button.on{background:var(--cm-accent,#c2410c);color:#fff;opacity:1}',
      '.cmp-seg button:disabled,.cmp-seg button.is-disabled{opacity:.25;cursor:not-allowed}',
      '.cmp-empty{font-family:var(--ff-mono,"JetBrains Mono",monospace);font-size:12px;opacity:.6;padding:32px 0;text-align:center}'
    ].join('');
    document.head.appendChild(s);
  }

  function CMPsfChart(opts) {
    this.o = opts || {};
    this.market = this.o.market || 'san-francisco-condo-market';
    this.accent = this.o.accent || '#c2410c';
    this.grid = this.o.grid || 'rgba(0,0,0,0.06)';
    this.tick = this.o.tick || '#6b7280';
    this.state = {
      hood: (this.o.defaults && this.o.defaults.hood) || '',
      grain: (this.o.defaults && this.o.defaults.grain) || 'quarter',
      years: (this.o.defaults && this.o.defaults.years) || 10
    };
    this.hoods = [];
    this.chart = null;
    this.canvas = $(this.o.canvas);
    this.controlsHost = $(this.o.controls);
    this.subtitleEl = $(this.o.subtitle);
    this.startEl = $(this.o.bookendStart);
    this.endEl = $(this.o.bookendEnd);
    this.emptyEl = $(this.o.empty);
  }

  CMPsfChart.prototype.init = function () {
    var self = this;
    if (!this.canvas) return Promise.resolve(this);
    injectStyles();
    return rpc('market_neighborhood_options', { p_market_slug: this.market })
      .then(function (rows) { self.hoods = rows || []; })
      .catch(function () { self.hoods = []; })
      .then(function () {
        if (self.controlsHost) self.renderControls();
        return self.load();
      })
      .then(function () { return self; });
  };

  // Only neighbourhoods the data can actually carry appear in the selector.
  // A dropdown that offers a chart it cannot draw is worse than a shorter list.
  CMPsfChart.prototype.renderControls = function () {
    var self = this;
    var h = [];
    h.push('<div class="cmp-controls">');

    h.push('<select class="cmp-hood" aria-label="Neighborhood">');
    h.push('<option value="">All San Francisco</option>');
    this.hoods.forEach(function (n) {
      h.push('<option value="' + n.neighborhood.replace(/"/g, '&quot;') + '">' +
             n.neighborhood + '</option>');
    });
    h.push('</select>');

    h.push('<div class="cmp-seg cmp-grain" role="group" aria-label="Interval">');
    h.push('<button type="button" data-grain="month">Monthly</button>');
    h.push('<button type="button" data-grain="quarter" class="on">Quarterly</button>');
    h.push('</div>');

    h.push('<div class="cmp-seg cmp-range" role="group" aria-label="Range">');
    RANGES.forEach(function (r) {
      h.push('<button type="button" data-years="' + r.years + '"' +
             (r.years === self.state.years ? ' class="on"' : '') + '>' + r.label + '</button>');
    });
    h.push('</div>');
    h.push('</div>');

    this.controlsHost.innerHTML = h.join('');

    var sel = this.controlsHost.querySelector('.cmp-hood');
    sel.value = this.state.hood;
    sel.addEventListener('change', function () {
      self.state.hood = this.value;
      self.syncGrainAvailability();
      self.load();
    });

    this.controlsHost.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-grain], button[data-years]');
      if (!b || b.disabled) return;
      if (b.hasAttribute('data-grain')) {
        self.state.grain = b.getAttribute('data-grain');
        setOn(b, '.cmp-grain');
      } else {
        self.state.years = parseInt(b.getAttribute('data-years'), 10);
        setOn(b, '.cmp-range');
      }
      self.load();
    });

    function setOn(btn, groupSel) {
      var g = btn.closest(groupSel);
      Array.prototype.forEach.call(g.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
      btn.classList.add('on');
    }

    this.syncGrainAvailability();
  };

  // Monthly is only offered where a month actually holds enough sales.
  // Everywhere else the button is disabled rather than allowed to draw noise.
  CMPsfChart.prototype.syncGrainAvailability = function () {
    if (!this.controlsHost) return;
    var rec = this.recFor(this.state.hood);
    var monthlyOk = this.state.hood === '' || (rec && rec.supports_monthly);
    var mBtn = this.controlsHost.querySelector('button[data-grain="month"]');
    if (!mBtn) return;
    mBtn.disabled = !monthlyOk;
    mBtn.title = monthlyOk ? '' : 'Not enough monthly sales in this neighborhood to chart honestly';
    mBtn.classList.toggle('is-disabled', !monthlyOk);
    if (!monthlyOk && this.state.grain === 'month') {
      this.state.grain = 'quarter';
      var qBtn = this.controlsHost.querySelector('button[data-grain="quarter"]');
      mBtn.classList.remove('on');
      if (qBtn) qBtn.classList.add('on');
    }
  };

  CMPsfChart.prototype.recFor = function (hood) {
    if (!hood) return null;
    for (var i = 0; i < this.hoods.length; i++) {
      if (this.hoods[i].neighborhood === hood) return this.hoods[i];
    }
    return null;
  };

  CMPsfChart.prototype.load = function () {
    var self = this;
    var rec = this.recFor(this.state.hood);
    var win = null;
    if (rec) win = this.state.grain === 'month' ? Math.max(1, rec.rec_window_months / 3 | 0) : rec.rec_window_months;

    var body = {
      p_market_slug: this.market,
      p_neighborhood: this.state.hood || null,
      p_grain: this.state.grain,
      p_years: this.state.years
    };
    if (win) body.p_window_months = win;

    if (typeof this.o.onChange === 'function') {
      try { this.o.onChange({ hood: this.state.hood, grain: this.state.grain, years: this.state.years }); }
      catch (e) { /* a host-page callback must never break the chart */ }
    }
    return rpc('market_psf_series', body)
      .then(function (rows) { self.render(rows || []); })
      .catch(function (err) {
        self.showEmpty('Chart data unavailable — ' + (err && err.message ? err.message : 'request failed'));
      });
  };

  CMPsfChart.prototype.showEmpty = function (msg) {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    if (this.emptyEl) { this.emptyEl.textContent = msg; this.emptyEl.style.display = ''; }
    if (this.canvas) this.canvas.style.display = 'none';
    if (this.startEl) this.startEl.textContent = '—';
    if (this.endEl) this.endEl.textContent = '—';
  };

  CMPsfChart.prototype.render = function (rows) {
    var self = this;
    if (!rows.length || rows.length < 3) {
      this.showEmpty('Not enough recorded sales to chart this selection.');
      return;
    }
    if (this.emptyEl) this.emptyEl.style.display = 'none';
    if (this.canvas) this.canvas.style.display = '';

    var labels = rows.map(function (r) { return r.label; });
    var data = rows.map(function (r) { return r.median_psf; });
    var counts = rows.map(function (r) { return r.sale_count; });
    var prices = rows.map(function (r) { return r.median_price; });

    if (this.subtitleEl) {
      var wl = windowLabel(rows[0].window_months, this.state.grain);
      var scope = this.state.hood || 'All San Francisco';
      var base = 'Median $/sf · ' + scope + ' · by ' + (this.state.grain === 'month' ? 'month' : 'quarter');
      this.subtitleEl.textContent = wl ? base + ' · ' + wl : base;
    }

    if (this.startEl) this.startEl.innerHTML = labels[0] + ' <b>' + money(data[0]) + '</b>';
    if (this.endEl) this.endEl.innerHTML = labels[labels.length - 1] + ' <b>' + money(data[data.length - 1]) + '</b>';

    if (this.chart) { this.chart.destroy(); this.chart = null; }
    if (!global.Chart) return;

    var ctx = this.canvas.getContext ? this.canvas : this.canvas;
    this.chart = new global.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Median $/sf',
          data: data,
          borderColor: this.accent,
          backgroundColor: hexA(this.accent, 0.10),
          borderWidth: 2.5,
          tension: 0.32,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: this.accent
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            padding: 12,
            displayColors: false,
            titleFont: { family: 'JetBrains Mono', size: 11 },
            bodyFont: { family: 'JetBrains Mono', size: 13 },
            callbacks: {
              // Sample size sits in every tooltip. A median is only as
              // good as the count behind it, and hiding that is how the
              // old chart got away with plotting 15 sales as a quarter.
              label: function (c) {
                var i = c.dataIndex;
                return [
                  money(data[i]) + '/sf',
                  'Median price ' + money(prices[i]),
                  counts[i] + ' sale' + (counts[i] === 1 ? '' : 's')
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: self.grid },
            ticks: { color: self.tick, font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 28 }
          },
          y: {
            grid: { color: self.grid },
            ticks: { color: self.tick, font: { family: 'JetBrains Mono', size: 10 }, callback: function (v) { return '$' + v.toLocaleString(); } }
          }
        }
      }
    });
  };

  function hexA(hex, a) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return 'rgba(194,65,12,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }

  global.CMPsfChart = {
    mount: function (opts) { return new CMPsfChart(opts).init(); }
  };
})(window);
