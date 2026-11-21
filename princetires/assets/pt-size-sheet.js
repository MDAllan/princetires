/* =====================================================================
   pt-size-sheet.js - "Find your size" sheet (redesign 2026-11-14,
   mockup SizeSheet.dc.html). Config + loader: snippets/pt-size-sheet.liquid.

   One question at a time:
     By tire size: Width -> Aspect -> Rim, then an optional season.
     By vehicle:   Year -> Make -> Model -> Trim -> the trim's tire size(s).
   Each answer folds into a line ("Width 225 · Change"). The red button says
   how many tires the search finds ("Show 46 tires"), counted by Shopify for
   the exact URL it opens (sections/pt-rd-count). When that number cannot be
   known (the request failed, or the collection is too big for Shopify's
   filters) it says "Show tires" - never a made-up number.

   Opened by any [data-pt-size-sheet] element (delegated click). Public:
     window.PTSizeSheet.open({ opener, tab: 'size' | 'vehicle' })
     window.PTSizeSheet.close()
     window.PTSizeSheet.inline(host, { reset, surface })  -> the same search
       drawn inside another popup (no backdrop, title or close of its own).
       Used by the booking popup's "New tires or wheels" (assets/pt-book.js).
       One node, moved into `host` on every call; `reset` starts it over.
   The destination URL is the one the existing size searches build:
   <collection>?filter.p.m.custom.tire_width=W&...tire_profile=A&...rim_diameter=R
   (+ season), routed by window.PTRim.route into the rim's own collection,
   with the in-stock filter the results page would add on arrival.

   Staggered sets (2026-11-15): after a full size, "+ Add a rear size" opens
   a second Width / Aspect / Rim (the results bar and this sheet; not the
   booking popup). A complete rear that differs from the front adds
   rear=W%2FARR to the URL (the format window.PTVehiclePairs.url builds)
   and the button reads "Show sets" with no number: the results page pairs
   the two sizes (assets/pt-rd-results.js, pair mode).

   Vehicle pairs (stage 8): when a trim lists 2+ sizes, By vehicle asks
   window.PTVehiclePairs.lookup (assets/pt-vehicle-pairs.js) with the trim's
   own sizes. A staggered answer shows the factory front + rear sets first
   (owner decision 8 wording via PTVehiclePairs.sentence); picking one fills
   the front AND rear trios, so the search is the same pair search as typing
   both sizes. No answer (helper not on the page, endpoint down, timeout,
   not staggered) = the old list of single sizes, exactly as before. Not in
   the booking popup (no rear there).

   Tire results v16 (2026-11-15, FINAL spec section 3): a COMPACT, field-
   first view used only on tire results pages - the desktop "Change size"
   popover (PTSizeSheet.pop(anchor), surface results_bar), the quiet search
   row on pages with no size (inline id 'quiet'), and the phone sheet when
   it opens on a results page (bottom sheet, "Change size"). One prefilled
   field with a clear x, Recent as a listbox dropdown on focus (each row
   removable), links "Pick width, aspect, rim" / "Rear size differs?" /
   "Where's my size?", one ink "Show tires" button, no season pills, never
   "Show all N". The booking popup (inline 'pop') and every other page keep
   the views above unchanged (view.compact is false there).
   ===================================================================== */
(function () {
  'use strict';
  if (window.PTSizeSheet) return;

  var cfg = {};
  try { cfg = JSON.parse((document.getElementById('pt-size-sheet-config') || {}).textContent || '{}'); } catch (e) { cfg = {}; }

  var P_W = 'filter.p.m.custom.tire_width';
  var P_A = 'filter.p.m.custom.tire_profile';
  var P_R = 'filter.p.m.custom.rim_diameter';
  var P_S = 'filter.p.m.custom.seasonality';
  var P_AV = 'filter.v.availability';
  var KEEP = ['filter.p.vendor', 'filter.p.m.custom.service_type'];
  var SEASONS = [['Winter', 'Winter'], ['All-Weather', 'All-weather'], ['All-Season', 'All-season'], ['Summer', 'Summer']];
  var VEH_KEY = 'pt-tire-search-vehicle';
  var RECENT_KEY = 'pt-recent-searches';
  // Same fixed lists as the results-page size dropdowns
  // (snippets/pt-collection-research-strip), used only if the size index
  // cannot load.
  var FALLBACK = {
    metric: {
      w: '155,165,175,185,195,205,215,225,235,245,255,265,275,285,295,305,315,325'.split(','),
      a: '30,35,40,45,50,55,60,65,70,75,80,85'.split(','),
      r: '13,14,15,16,17,18,19,20,21,22,24,26'.split(',')
    },
    flot: {
      w: '27,30,31,33,35,37,38,39,40'.split(','),
      a: '8.50,9.50,10.00,10.50,12.50,13.50,15.50'.split(','),
      r: '14,15,17,18,20,22,24'.split(',')
    }
  };

  /* ── small helpers ── */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function num(n) { return Number(n).toLocaleString('en-CA'); }
  function byNum(a, b) { return parseFloat(a) - parseFloat(b); }

  // "225/65R17", "LT265/70R17", "P215/55ZR17 94V", "35X12.50R20LT", "33x12.5R18"
  function parseSize(s) {
    s = String(s || '').trim();
    var m = /^(?:P|LT|ST|T)?\s*(\d{3})\s*\/\s*(\d{2,3})\s*Z?R\s*(\d{2})(?![\d.])/i.exec(s);
    if (m) return { kind: 'metric', w: m[1], a: m[2], r: m[3] };
    m = /^(\d{2})\s*[xX×]\s*(\d{1,2})\.(\d{1,2})\s*R\s*(\d{2})(?![\d.])/i.exec(s);
    if (m) {
      var dec = m[3].length === 1 ? m[3] + '0' : m[3];
      return { kind: 'flot', w: m[1], a: m[2] + '.' + dec, r: m[4] };
    }
    return null;
  }
  function fmt(z) {
    if (!z || !z.w || !z.a || !z.r) return '';
    return z.w + (z.kind === 'flot' ? 'X' : '/') + z.a + 'R' + z.r;
  }

  // What a shopper types in the quick search: the strict sizes above, plus
  // "225 65 17", "2256517", "225/65/17", "225-65-17", "33 12.5 20".
  function parseTyped(s) {
    parseTyped.insane = false;
    s = String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
    // Drop endings one at a time (98H, XL, LT, 10PLY, 126/123R, C/D/E) until
    // the rest reads as a size.
    for (var i = 0; i < 4; i++) {
      var z = parseSize(s) || looseSize(s);
      if (z) { parseTyped.insane = !sane(z); return parseTyped.insane ? null : z; }
      var cut = s.replace(/(?:[\s-]+(?:\d+ ?PLY|\d{2,3}(?:\/\d{2,3})?[A-Z]?)|[\s-]*(?:LT|XL|SL|RFT|RF|C|D|E))$/, '');
      if (cut === s || !cut) break;
      s = cut;
    }
    return null;
  }
  function looseSize(s) {
    var t = s.replace(/^(?:LT|P|ST|T) ?/, '');
    var m = /^(\d{3})\D*(\d{2})\D*?Z?R?\D*(\d{2})$/.exec(t);
    if (m) return { kind: 'metric', w: m[1], a: m[2], r: m[3] };
    // 33x12.50R20, 33/12.5R20, 33 x 12.5 x 20, 33x12.50-20, 35 1250 20
    m = /^(\d{2}) ?[X×*\/ ] ?(\d{1,2})(?:\.(\d{1,2})|(\d{2}))? ?[XR\- ]* ?(\d{2})$/.exec(t);
    if (m) {
      var dec = m[3] || m[4] || '00'; if (dec.length === 1) dec += '0';
      return { kind: 'flot', w: m[1], a: m[2] + '.' + dec, r: m[5] };
    }
    return null;
  }
  // Numbers a real tire can have (a typo like 225/65R71 is not a size).
  function sane(z) {
    var w = +z.w, a = parseFloat(z.a), r = +z.r;
    if (z.kind === 'flot') return w >= 26 && w <= 44 && a >= 7 && a <= 18 && r >= 14 && r <= 26;
    return w >= 125 && w <= 395 && a >= 25 && a <= 95 && r >= 12 && r <= 26;
  }
  // In the size index? (Unknown until it loads, so true then.)
  function inIndex(z) {
    var t = sizeTree && sizeTree[z.kind];
    if (!t) return true;
    return !!(t[z.w] && t[z.w][z.a] && t[z.w][z.a][z.r]);
  }

  /* ── data: size index (which widths / aspects / rims exist) ── */
  var sizeTree = null;      // { metric: {w: {a: {r: units}}}, flot: {...} }
  var sizeTreeP = null;
  var popular = [];
  function loadSizes() {
    if (sizeTreeP) return sizeTreeP;
    sizeTreeP = new Promise(function (resolve) {
      if (!cfg.sizesUrl || !window.fetch) { resolve(null); return; }
      fetch(cfg.sizesUrl)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var raw = (j && j.sizes) || null;
          if (!raw) { resolve(null); return; }
          var t = { metric: {}, flot: {} };
          var tops = [];
          Object.keys(raw).forEach(function (k) {
            var z = parseSize(k);
            if (!z) return;
            var n = +raw[k] || 0;
            if (n <= 0) return;
            var b = t[z.kind];
            b[z.w] = b[z.w] || {};
            b[z.w][z.a] = b[z.w][z.a] || {};
            b[z.w][z.a][z.r] = (b[z.w][z.a][z.r] || 0) + n;
            if (z.kind === 'metric') tops.push([fmt(z), n, z]);
          });
          // Popular = the sizes the catalogue carries most of (the index's
          // own order). The numbers are never shown.
          tops.sort(function (a, b) { return b[1] - a[1]; });
          var seen = {};
          popular = tops.filter(function (x) { if (seen[x[0]]) return false; seen[x[0]] = 1; return true; }).slice(0, 6).map(function (x) { return x[2]; });
          sizeTree = t;
          resolve(t);
        })
        .catch(function () { resolve(null); });
    });
    return sizeTreeP;
  }
  function optsFor(step) {
    var kind = st.kind;
    var t = sizeTree && sizeTree[kind];
    var fb = FALLBACK[kind];
    if (step === 'w') return t ? Object.keys(t).sort(byNum) : fb.w;
    if (step === 'a') {
      if (t) return t[st.w] ? Object.keys(t[st.w]).sort(byNum) : [];
      return fb.a;
    }
    if (t) return t[st.w] && t[st.w][st.a] ? Object.keys(t[st.w][st.a]).sort(byNum) : [];
    return fb.r;
  }
  // The rear size: same index and same kind (metric / flotation) as the front.
  function optsForRear(step) {
    var t = sizeTree && sizeTree[st.kind];
    var fb = FALLBACK[st.kind];
    if (step === 'w') return t ? Object.keys(t).sort(byNum) : fb.w;
    if (step === 'a') {
      if (t) return t[st.rw] ? Object.keys(t[st.rw]).sort(byNum) : [];
      return fb.a;
    }
    if (t) return t[st.rw] && t[st.rw][st.ra] ? Object.keys(t[st.rw][st.ra]).sort(byNum) : [];
    return fb.r;
  }
  // Rear size helpers. rearSize() = the complete rear, or null.
  function rearSize() {
    if (!st || !st.rearOn || !st.rw || !st.ra || !st.rr) return null;
    return { kind: st.kind, w: st.rw, a: st.ra, r: st.rr };
  }
  function rearPartial() { return !!(st && st.rearOn && !rearSize()); }
  // A complete rear that differs from a complete front: the search is a set.
  function pairOn() {
    var z = rearSize();
    return !!(z && st.w && st.a && st.r && fmt(z) !== fmt(st));
  }
  // Rear trio offered in the results bar and the sheet, not the booking popup.
  function rearAllowed() { return !!(view && (!view.inline || view.bar || view.compact)); }
  function clearRear() { st.rearOn = false; st.rw = st.ra = st.rr = ''; }

  /* ── data: vehicles (same files as every vehicle search) ── */
  var yearData = {};
  function manifest() {
    var M = window.PTVehicleManifest;
    if (!M || !cfg.manifestUrl) return Promise.resolve(null);
    return M.ready(cfg.manifestUrl, 1500);
  }
  function years() {
    return manifest().then(function (m) {
      var M = window.PTVehicleManifest;
      var ys = M ? M.yearsDesc(m, cfg.minYear || 2001, cfg.maxYear || 2026) : [];
      if (!ys.length) for (var y = +(cfg.maxYear || 2026); y >= +(cfg.minYear || 2001); y--) ys.push(y);
      return ys.map(String);
    });
  }
  function loadYear(y) {
    if (yearData[y]) return Promise.resolve(yearData[y]);
    return manifest().then(function (m) {
      var M = window.PTVehicleManifest;
      var url = M ? M.yearUrl(cfg.vehicleBase || '/', y, m, cfg.vehicleVersion || '')
        : (cfg.vehicleBase || '/') + 'pt-vehicle-' + y + '.json' + (cfg.vehicleVersion ? '?' + cfg.vehicleVersion : '');
      return fetch(url, { cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) { yearData[y] = d; return d; });
    });
  }
  function vModels() { return ((yearData[st.y] || {}).models) || {}; }

  /* ── data: where the shopper left off ── */
  function recents() {
    var out = [];
    var seen = {};
    function add(o) {
      var key = o.t + '|' + fmt(o.z);
      if (seen[key]) return;
      seen[key] = 1;
      out.push(o);
    }
    // 1. Last size searched (the history the home + header search share).
    try {
      var arr = JSON.parse(lsGet(RECENT_KEY) || '[]');
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          var x = arr[i];
          var q = typeof x === 'string' ? x : x && x.query;
          var mode = x && typeof x === 'object' ? x.mode : undefined;
          if (mode === 'wheels') continue;
          var z = parseSize(q);
          if (z) { add({ ic: 'recent', t: fmt(z), s: 'Your last search', z: z }); break; }
        }
      }
    } catch (e) {}
    // 2. My Garage default car, else its first car. Only the signed-in
    // customer's own garage (pt-garage-<customerId>, assets/my-garage.js),
    // so a shared device never shows the previous customer's car.
    try {
      var cars = [];
      var cid = cfg.customerId;
      if (cid) {
        var a = JSON.parse(lsGet('pt-garage-' + cid) || '[]');
        if (Array.isArray(a)) a.forEach(function (v) { if (v && v.year && v.make && v.model) cars.push(v); });
      }
      cars.sort(function (a, b) { return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0); });
      for (var j = 0; j < cars.length; j++) {
        var v = cars[j];
        var gz = parseSize(v.tireSize || (v.sizes && v.sizes[0]) || '');
        if (!gz) continue;
        add({ ic: 'car', t: v.nickname || (v.year + ' ' + v.make + ' ' + v.model), s: 'My Garage · ' + fmt(gz), z: gz });
        break;
      }
    } catch (e) {}
    // 3. The last vehicle searched on this device.
    try {
      var lv = JSON.parse(lsGet(VEH_KEY) || 'null');
      if (lv && lv.year && lv.make && lv.model) {
        var lz = parseSize((lv.sizes && lv.sizes[0]) || lv.tireSize || '');
        if (lz) add({ ic: 'car', t: lv.year + ' ' + lv.make + ' ' + lv.model, s: 'Your last vehicle · ' + fmt(lz), z: lz });
      }
    } catch (e) {}
    return out.slice(0, 3);
  }
  function remember(size) {
    try {
      var all = JSON.parse(lsGet(RECENT_KEY) || '[]');
      if (!Array.isArray(all)) all = [];
      all = all.filter(function (x) {
        var q = typeof x === 'string' ? x : x && x.query;
        var mode = x && typeof x === 'object' ? x.mode : undefined;
        return !(q && q.toLowerCase() === size.toLowerCase() && mode === 'tires');
      });
      all.unshift({ query: size, mode: 'tires' });
      lsSet(RECENT_KEY, JSON.stringify(all.slice(0, 10)));
    } catch (e) {}
  }

  /* ── where the search goes ── */
  // On a tire results page the search stays in that collection and keeps the
  // brand / tire type, like the old size dropdowns. Anywhere else: all tires.
  function context() {
    var rh = $('[data-rd-rhead][data-kind="tires"]');
    var here = new URLSearchParams(window.location.search);
    if (rh && /^\/collections\//.test(window.location.pathname)) {
      return { path: window.location.pathname, params: here, results: true };
    }
    return { path: cfg.tiresUrl || '/collections/tires', params: new URLSearchParams(), results: false };
  }
  // v16 fix1: the compact Change size keeps the page's Season filter (like
  // its brand) - there are no season pills in it, so st.seasons stays [].
  function seasonsOut() { return view && view.compact ? (st.pageSeasons || []) : st.seasons; }
  function destination() {
    var c = context();
    var p = new URLSearchParams();
    KEEP.forEach(function (k) { c.params.getAll(k).forEach(function (v) { p.append(k, v); }); });
    if (st.w) p.set(P_W, st.w);
    if (st.a) p.set(P_A, st.a);
    if (st.r) p.set(P_R, st.r);
    seasonsOut().forEach(function (s) { p.append(P_S, s); });
    // Compact (tire results): the page's sort stays; none = Price: low to high.
    // Owner 2026-11-17: every tire size search lands cheapest first. The
    // page's own sort is kept when the visitor already picked one.
    p.set('sort_by', (c.results && c.params.get('sort_by')) || 'price-ascending');
    if (c.params.get('stock') === 'all') p.set('stock', 'all');
    else p.append(P_AV, '1'); // what pt-collection-stock adds on arrival anyway
    // Staggered set: only a complete rear that differs from the front (a
    // half-picked or hidden rear is never sent). PTRim.route keeps it.
    if (rearAllowed() && pairOn()) p.set('rear', fmt(rearSize()));
    var qs = p.toString();
    var url = c.path + (qs ? '?' + qs : '');
    try { if (window.PTRim && window.PTRim.route) url = window.PTRim.route(url); } catch (e) {}
    return url;
  }
  // The rear size on its own (for the "do we carry it" check): the same
  // search with the rear numbers, no rear param, routed to the rear rim.
  // null when the rear rim has no tire collection of its own (the big
  // catalogue ignores filters, so it would say yes to anything).
  function rearDestination() {
    var z = rearSize();
    if (!z) return null;
    var c = context();
    var p = new URLSearchParams();
    KEEP.forEach(function (k) { c.params.getAll(k).forEach(function (v) { p.append(k, v); }); });
    p.set(P_W, z.w); p.set(P_A, z.a); p.set(P_R, z.r);
    seasonsOut().forEach(function (s) { p.append(P_S, s); });
    if (c.params.get('stock') === 'all') p.set('stock', 'all');
    else p.append(P_AV, '1');
    var url = c.path + '?' + p.toString();
    try {
      var fam = window.PTRim && window.PTRim.family ? window.PTRim.family(c.path) : null;
      if (fam && fam.kind === 'tires' && !((window.PTRim.tires || {})[z.r] > 0)) return null;
      if (window.PTRim && window.PTRim.route) url = window.PTRim.route(url);
    } catch (e) {}
    return url;
  }

  /* ── real counts (sections/pt-rd-count) ── */
  var countCache = {};
  var countCtl = null;
  function readCount(url, text) {
    var m = /<script[^>]*data-rd-count-json[^>]*>([\s\S]*?)<\/script>/.exec(text || '');
    if (!m) return null;
    var j;
    try { j = JSON.parse(m[1]); } catch (e) { return null; }
    if (!j || typeof j.n !== 'number') return null;
    // Every product filter in the URL must show as applied in the answer,
    // otherwise Shopify ignored it (collections over 5,000 products) and
    // the number would not be the tires this search finds.
    var asked = new URL(url, window.location.origin).searchParams;
    var have = {};
    (j.f || []).forEach(function (f) {
      var on = {};
      (f[1] || []).forEach(function (v) { if (v[2]) on[String(v[0]).toLowerCase()] = 1; });
      have[f[0]] = on;
    });
    var ok = true;
    asked.forEach(function (v, k) {
      if (k.indexOf('filter.p.') !== 0) return;
      if (!have[k] || !have[k][String(v).toLowerCase()]) ok = false;
    });
    return ok ? j.n : null;
  }
  function fetchCount(url) {
    if (Object.prototype.hasOwnProperty.call(countCache, url)) return Promise.resolve(countCache[url]);
    if (countCtl) { try { countCtl.abort(); } catch (e) {} }
    countCtl = window.AbortController ? new AbortController() : null;
    var u = url + (url.indexOf('?') === -1 ? '?' : '&') + 'section_id=pt-rd-count';
    return fetch(u, countCtl ? { signal: countCtl.signal, credentials: 'same-origin' } : { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { var n = readCount(url, t); countCache[url] = n; return n; });
  }

  // The rear count has its own request, so it never cancels the front's.
  var rearCtl = null;
  function fetchRearCount(url) {
    if (Object.prototype.hasOwnProperty.call(countCache, url)) return Promise.resolve(countCache[url]);
    if (rearCtl) { try { rearCtl.abort(); } catch (e) {} }
    rearCtl = window.AbortController ? new AbortController() : null;
    var u = url + (url.indexOf('?') === -1 ? '?' : '&') + 'section_id=pt-rd-count';
    return fetch(u, rearCtl ? { signal: rearCtl.signal, credentials: 'same-origin' } : { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { var n = readCount(url, t); countCache[url] = n; return n; });
  }

  /* ── state ── */
  var st = null;
  function fresh(tab) {
    return { tab: tab || 'size', kind: 'metric', w: '', a: '', r: '', rearOn: false, rw: '', ra: '', rr: '', seasons: [], y: '', mk: '', mo: '', tr: '', vErr: '', vLoading: false, n: undefined, nUrl: '', pairs: null, pLoading: false, pKey: '', pAll: false, pAns: null, pAsked: false };
  }
  function prefill() {
    var c = context();
    if (!c.results) return;
    var p = c.params;
    var w = p.get(P_W), a = p.get(P_A), r = p.get(P_R);
    if (w && a && r) {
      var z = parseSize(w + ((w.length <= 2 || a.indexOf('.') !== -1) ? 'X' : '/') + a + 'R' + r);
      if (z) { st.kind = z.kind; st.w = z.w; st.a = z.a; st.r = z.r; }
    } else if (p.get('filter.p.m.custom.tire_size')) {
      // One size (product page "Compare", garage links): 205/55R16.
      var zt = parseSize(p.get('filter.p.m.custom.tire_size')) || parseTyped(p.get('filter.p.m.custom.tire_size'));
      if (zt) { st.kind = zt.kind; st.w = zt.w; st.a = zt.a; st.r = zt.r; }
    }
    // rear=275/35R18 (a staggered set): open on both sizes.
    var rz = readRear(p.get('rear'));
    if (rz && st.w && rz.kind === st.kind && fmt(rz) !== fmt(st)) { st.rearOn = true; st.rw = rz.w; st.ra = rz.a; st.rr = rz.r; }
    st.seasons = p.getAll(P_S).filter(function (s) { return SEASONS.some(function (x) { return x[0] === s; }); });
    if (view && view.compact) {
      // The field shows the size on screen; the seasons stay the page's
      // (Season filter): they go into the destination via seasonsOut().
      st.pageSeasons = st.seasons.slice();
      st.seasons = [];
      st.findQ = st.w ? fmt(st) : '';
      st.rfindQ = st.rearOn ? fmt(rearSize()) : '';
      st.pristine = !!st.w;
      st.pageZ = st.w ? fmt(st) : '';
      st.pageRZ = st.rearOn ? fmt(rearSize()) : '';
    }
  }

  // The rear param: "275/35R18", also 275/35/18, 275-35-18, 35X12.50R20.
  function readRear(v) {
    if (!v) return null;
    var z = parseSize(v) || looseSize(String(v).trim().toUpperCase().replace(/\s+/g, ' '));
    return z && sane(z) ? z : null;
  }

  /* ── DOM ── */
  // Two views share this code: the modal sheet and the inline copy. The
  // functions below work on whichever is current (use()); every async
  // callback switches back to the view it started in before drawing.
  var root = null, panel = null, bodyEl = null, goBtn = null, hintEl = null, liveEl = null, backBtn = null;
  var view = null, modal = null, inls = {};
  function use(v) {
    if (!v) return;
    if (view && view !== v) view.st = st;
    view = v;
    root = v.root; panel = v.panel; bodyEl = v.bodyEl; goBtn = v.goBtn;
    hintEl = v.hintEl; liveEl = v.liveEl; backBtn = v.backBtn; st = v.st;
    lastSaid = v.lastSaid;
  }
  function pin(v) { use(v); return v; }
  function keep() { if (view) { view.st = st; view.lastSaid = lastSaid; } }
  function keepView() { keep(); }
  var opener = null;
  var backup = null; // visible fallback for focus on close
  var countTimer = null;
  var ICON = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    recent: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
    car: '<path d="M5 17H4a1 1 0 0 1-1-1v-4l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 5v4a1 1 0 0 1-1 1h-1"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5M3 12h18"/>'
  };
  function svg(name, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICON[name] + '</svg>';
  }
  function build() {
    if (modal) { use(modal); return; }
    var root = document.createElement('div');
    root.className = 'pss';
    root.hidden = true;
    root.innerHTML =
      '<div class="pss__backdrop" data-pss-close></div>' +
      '<div class="pss__panel" role="dialog" aria-modal="true" aria-labelledby="pss-title">' +
        '<div class="pss__top">' +
          '<button type="button" class="pss__x" data-pss-back aria-label="Back" hidden>' + svg('back') + '</button>' +
          '<h2 class="pss__title" id="pss-title">Find your tires</h2>' +
          '<button type="button" class="pss__x" data-pss-close aria-label="Close">' + svg('close') + '</button>' +
        '</div>' +
        '<div class="pss__seg" role="tablist" aria-label="Search by">' +
          '<button type="button" role="tab" id="pss-tab-size" aria-controls="pss-body" data-pss-tab="size">By tire size</button>' +
          '<button type="button" role="tab" id="pss-tab-vehicle" aria-controls="pss-body" data-pss-tab="vehicle">By vehicle</button>' +
        '</div>' +
        '<div class="pss__body" id="pss-body" role="tabpanel" tabindex="-1"></div>' +
        '<div class="pss__foot">' +
          '<button type="button" class="pss__go" data-pss-go>Show tires</button>' +
          '<div class="pss__hint" data-pss-hint></div>' +
          '<div class="pss__sr" aria-live="polite" data-pss-live></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    modal = makeView(root, false, 'pss', 'size_sheet');
    use(modal);
  }
  // Inline copy: the tabs, the questions and the red button, nothing else.
  // Inline copies: 'pop' (booking popup) and 'bar' (desktop results header,
  // owner 2026-11-14: "on desktop it should not be a popup", like DT's hub).
  function buildInline(id, compact) {
    id = id || 'pop';
    if (inls[id]) return inls[id];
    var pfx = id === 'pop' ? 'pssin' : 'pss' + id;
    var el = document.createElement('div');
    el.className = 'pss-in' + (id === 'bar' ? ' pss-bar' : '') + (compact ? ' pss-c' + (id === 'quiet' ? ' pss-quiet' : ' pss-pop') : '');
    el.setAttribute('data-pss-inline', id);
    el.innerHTML =
      '<div class="pss__seg" role="tablist" aria-label="Search by">' +
        '<button type="button" role="tab" id="' + pfx + '-tab-size" aria-controls="' + pfx + '-body" data-pss-tab="size">By tire size</button>' +
        '<button type="button" role="tab" id="' + pfx + '-tab-vehicle" aria-controls="' + pfx + '-body" data-pss-tab="vehicle">By vehicle</button>' +
      '</div>' +
      '<div class="pss__body" id="' + pfx + '-body" role="tabpanel" tabindex="-1"></div>' +
      '<div class="pss__foot">' +
        '<button type="button" class="pss__go" data-pss-go>Show tires</button>' +
        '<div class="pss__hint" data-pss-hint></div>' +
        '<div class="pss__sr" aria-live="polite" data-pss-live></div>' +
      '</div>' +
      // v16 fix1: compact inline views draw their links here, after the
      // button, so Tab reaches "Show tires" right after the size field.
      (compact ? '<div class="pss__tail" data-pss-tail></div>' : '');
    if (compact) { var sg = el.querySelector('.pss__seg'); if (sg) sg.setAttribute('aria-label', 'Change size by'); }
    var v = makeView(el, true, pfx, id === 'bar' || compact ? 'results_bar' : 'booking_popup');
    v.bar = id === 'bar';
    v.id = id;
    if (compact) { v.compact = true; wireCompact(v); }
    inls[id] = v;
    return v;
  }
  function makeView(el, isInline, pfx, surface) {
    var v = {
      root: el, inline: isInline, pfx: pfx, surface: surface,
      panel: isInline ? el : $('.pss__panel', el),
      bodyEl: $('.pss__body', el), goBtn: $('[data-pss-go]', el),
      hintEl: $('[data-pss-hint]', el), liveEl: $('[data-pss-live]', el),
      backBtn: $('[data-pss-back]', el), st: fresh('size'), lastSaid: null
    };
    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      use(v);
      if (t.closest('[data-pss-close]')) { close(); return; }
      if (t.closest('[data-pss-back]')) { back(); return; }
      var tab = t.closest('[data-pss-tab]');
      if (tab) { setTab(tab.getAttribute('data-pss-tab')); return; }
      if (t.closest('[data-pss-go]')) { go(); return; }
      if (t.closest('[data-pss-type]')) { typeIt(e); return; }
      var b = t.closest('[data-pss-act]');
      if (b && !b.disabled) act(b.getAttribute('data-pss-act'), b.getAttribute('data-v') || '', b);
    });
    el.addEventListener('change', function (e) {
      var sel = e.target && e.target.closest ? e.target.closest('[data-pss-sel]') : null;
      if (!sel) return;
      use(v);
      act(sel.getAttribute('data-pss-sel'), sel.value, sel);
    });
    el.addEventListener('keydown', function (e) {
      use(v);
      if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-pss-find]')) {
        e.preventDefault(); e.stopPropagation(); find(); return;
      }
      // Inline: Esc and Tab belong to the popup it sits in.
      if (!v.inline && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (!v.inline && e.key === 'Tab') {
        var f = $all('button:not([disabled]):not([hidden]), [href], input, select, [tabindex]:not([tabindex="-1"])', panel)
          .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === bodyEl)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      // Arrow keys move between the two tabs (ARIA tabs pattern).
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.getAttribute('role') === 'tab') {
        e.preventDefault();
        setTab(st.tab === 'size' ? 'vehicle' : 'size');
        var on = $('[data-pss-tab="' + st.tab + '"]', root);
        if (on) on.focus();
      }
    });
    return v;
  }

  function rows() {
    var r = [];
    if (st.tab === 'size') {
      // The three dropdowns show the answers themselves.
    } else if (!(view && (view.bar || view.compact))) {
      if (st.y) r.push(['y', 'Year', st.y]);
      if (st.mk) r.push(['mk', 'Make', st.mk]);
      if (st.mo) r.push(['mo', 'Model', st.mo]);
      if (st.tr) r.push(['tr', 'Trim', st.tr]);
    }
    return r;
  }
  function doneRow(x) {
    return '<button type="button" class="pss__done" data-pss-act="edit" data-v="' + x[0] + '" aria-label="' + esc(x[1] + ' ' + x[2] + '. Change') + '">' +
      '<span class="pss__done-k">' + esc(x[1]) + '</span><b class="pss__done-v">' + esc(x[2]) + '</b><u class="pss__done-c">Change</u></button>';
  }
  function chips(list, act, cls, label) {
    return '<div class="pss__chips' + (cls ? ' ' + cls : '') + '" role="group" aria-label="' + esc(label) + '">' +
      list.map(function (o) {
        var v = typeof o === 'string' ? o : o.v;
        var t = typeof o === 'string' ? o : o.t;
        var sub = typeof o === 'string' ? '' : o.sub || '';
        return '<button type="button" class="pss__chip" data-pss-act="' + act + '" data-v="' + esc(v) + '">' + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
  }
  function q(text, sub) {
    return '<h3 class="pss__q" tabindex="-1" data-pss-q>' + esc(text) + (sub ? ' <span>' + esc(sub) + '</span>' : '') + '</h3>';
  }

  // One screen: type the size, or pick the three numbers side by side like
  // they read on the sidewall. Season appears once the size is complete.
  function sel(step, label, opts, cur, off, unit, ph) {
    opts = opts.map(function (o) { return typeof o === 'object' ? o : { v: String(o), t: String(o) + (unit || '') }; });
    cur = cur == null ? '' : String(cur);
    if (cur && !opts.some(function (o) { return o.v === cur; })) opts = [{ v: cur, t: cur + (unit || '') }].concat(opts);
    return '<label class="pss__f"><span class="pss__fl">' + esc(label) + '</span><span class="pss__selwrap">' +
      '<select class="pss__select" data-pss-sel="' + step + '"' + (off ? ' disabled' : '') + '>' +
      '<option value="">' + esc(ph || (off ? '–' : 'Pick')) + '</option>' +
      opts.map(function (o) { return '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('') +
      '</select>' + svg('down', 16) + '</span></label>';
  }
  // Redraw the size tab around the field in use, never replacing it: a
  // dropdown keeps its type-ahead and a phone keeps its keyboard.
  function patchSize(keep) {
    if (!bodyEl || st.tab !== 'size' || !$('[data-pss-after]', bodyEl)) { render(false); return; }
    var tmp = document.createElement('div');
    tmp.innerHTML = view.compact ? renderSizeCompact() : renderSize();
    // A rear dropdown in use: patch both trios field by field (the rear
    // block stays). Otherwise the whole rear block is redrawn (the front
    // decides whether "+ Add a rear size" shows).
    var inRear = keep === 'rw' || keep === 'ra' || keep === 'rr';
    if (!inRear) {
      var orb = $('[data-pss-rear]', bodyEl), nrb = $('[data-pss-rear]', tmp);
      if (orb && nrb) orb.parentNode.replaceChild(nrb, orb);
    }
    (inRear ? ['w', 'a', 'r', 'rw', 'ra', 'rr'] : ['w', 'a', 'r']).forEach(function (k) {
      var o = $('[data-pss-sel="' + k + '"]', bodyEl), n = $('[data-pss-sel="' + k + '"]', tmp);
      if (k === keep) {
        // The field in use stays; only its list is brought up to date.
        if (o && n && o.options.length !== n.options.length) { var val = o.value; o.innerHTML = n.innerHTML; o.value = val; }
        return;
      }
      if (o && n) { var of = o.closest('.pss__f'), nf = n.closest('.pss__f'); of.parentNode.replaceChild(nf, of); }
    });
    ['[data-pss-rec]', '[data-pss-after]'].forEach(function (q) {
      var o = $(q, bodyEl), n = $(q, tmp);
      if (o && n) o.innerHTML = n.innerHTML;
    });
    var fi = $('[data-pss-find]', bodyEl);
    if (fi) {
      if (st.findErr) { fi.setAttribute('aria-invalid', 'true'); fi.setAttribute('aria-describedby', view.pfx + '-find-err'); }
      else { fi.removeAttribute('aria-invalid'); fi.removeAttribute('aria-describedby'); }
    }
    foot();
    keepView();
  }
  // The size list landed: refresh the options without touching the field
  // the shopper is in.
  function refreshSize() {
    if (st.tab !== 'size') return;
    var ae = document.activeElement;
    if (ae && bodyEl && bodyEl.contains(ae) && ae.matches && ae.matches('[data-pss-find],[data-pss-sel]')) patchSize(ae.getAttribute('data-pss-sel'));
    else render(false);
  }
  function renderSize() {
    var h = '', flot = st.kind === 'flot';
    h += '<div class="pss__find" role="search">' +
      '<label class="pss__sr" for="' + view.pfx + '-find">Type your tire size</label>' +
      '<span class="pss__find-ic">' + svg('search', 20) + '</span>' +
      '<input class="pss__input" id="' + view.pfx + '-find" type="text" data-pss-find autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="search" placeholder="' + (flot ? 'Size, e.g. 33X12.50R20' : 'Your size, e.g. 225/65R17') + '" value="' + esc(st.findQ || '') + '"' + (st.findErr ? ' aria-invalid="true" aria-describedby="' + view.pfx + '-find-err"' : '') + '>' +
      '<button type="button" class="pss__find-go" data-pss-act="find">Go</button>' +
      '</div>';
    h += '<div data-pss-rec>';
    if (st.findErr) h += '<p class="pss__err" id="' + view.pfx + '-find-err" role="alert">' + esc(st.findErr) + '</p>';
    if (!st.w) {
      var rec = recents();
      st._rec = rec;
      if (rec.length) {
        h += '<div class="pss__recents" role="group" aria-label="Recent"><span class="pss__rl">Recent</span>' + rec.map(function (o, i) {
          return '<button type="button" class="pss__rchip" data-pss-act="recent" data-v="' + i + '">' + svg(o.ic, 16) +
            '<span>' + esc(o.t === fmt(o.z) ? o.t : o.t + ' · ' + fmt(o.z)) + '</span></button>';
        }).join('') + '</div>';
      }
    }
    h += '</div>';
    h += '<div class="pss__or"><span>' + (view && view.bar ? 'or' : 'or choose it') + '</span></div>';
    var withRear = rearAllowed() && st.rearOn;
    h += '<div class="pss__trio' + (flot ? ' pss__trio--flot' : '') + '" role="group" aria-label="' + (withRear ? 'Front tire size' : 'Tire size') + '">' +
      (withRear ? '<span class="pss__axle" aria-hidden="true">Front</span>' : '') +
      sel('w', flot ? 'Diameter' : 'Width', optsFor('w'), st.w, false, flot ? '″' : '') +
      '<span class="pss__sep" aria-hidden="true">' + (flot ? 'X' : '/') + '</span>' +
      sel('a', flot ? 'Width' : 'Aspect', st.w ? optsFor('a') : [], st.a, !st.w) +
      '<span class="pss__sep" aria-hidden="true">R</span>' +
      sel('r', 'Rim', st.w && st.a ? optsFor('r') : [], st.r, !(st.w && st.a), '″') +
      '</div>';
    h += '<div class="pss__rear" data-pss-rear>' + renderRear(flot) + '</div>';
    h += '<div data-pss-after>';
    if (st.w && !optsFor('a').length) h += '<p class="pss__empty">We don\'t carry that width right now. Pick another, or call us and we\'ll find them.</p>';
    if (st.w && st.a && st.r && !(view && view.bar)) {
      h += '<div class="pss__seasons"><span class="pss__fl">Season <span>(optional)</span></span><div class="pss__pills" role="group" aria-label="Season">' + SEASONS.map(function (s) {
        var on = st.seasons.length === 1 && st.seasons[0] === s[0];
        return '<button type="button" class="pss__pill" data-pss-act="season" data-v="' + s[0] + '" aria-pressed="' + on + '">' + s[1] + '</button>';
      }).join('') + '</div></div>';
    }
    var rz = rearSize();
    if (rearAllowed() && rz && st.w && st.a && st.r && fmt(rz) === fmt(st)) h += '<p class="pss__note">Front and rear are the same size, so this is a regular search.</p>';
    h += '<p class="pss__help">It\'s on the tire\'s sidewall, e.g. <b>' + (flot ? '33X12.50R20' : '225/65R17') + '</b>. <button type="button" class="pss__help-link" data-pss-act="kind">' + (flot ? 'Regular size?' : 'Off-road size?') + '</button></p>';
    h += '</div>';
    return h;
  }

  // "+ Add a rear size" (after a full front size), or the rear trio.
  function renderRear(flot) {
    if (!rearAllowed() || !(st.w && st.a && st.r)) return '';
    if (!st.rearOn) {
      return '<button type="button" class="pss__help-link pss__addrear" data-pss-act="rearon">+ Add a rear size</button>';
    }
    return '<div class="pss__trio pss__trio--rear' + (flot ? ' pss__trio--flot' : '') + '" role="group" aria-label="Rear tire size">' +
        '<span class="pss__axle" aria-hidden="true">Rear</span>' +
        sel('rw', flot ? 'Diameter' : 'Width', optsForRear('w'), st.rw, false, flot ? '″' : '') +
        '<span class="pss__sep" aria-hidden="true">' + (flot ? 'X' : '/') + '</span>' +
        sel('ra', flot ? 'Width' : 'Aspect', st.rw ? optsForRear('a') : [], st.ra, !st.rw) +
        '<span class="pss__sep" aria-hidden="true">R</span>' +
        sel('rr', 'Rim', st.rw && st.ra ? optsForRear('r') : [], st.rr, !(st.rw && st.ra), '″') +
      '</div>' +
      '<button type="button" class="pss__help-link pss__rmrear" data-pss-act="rearoff">Remove rear size</button>';
  }

  function renderVehicle() {
    var h = '';
    if (st.vLoading) return '<p class="pss__wait" role="status">Loading…</p>';
    if (st.vErr) h += '<p class="pss__empty" role="alert">' + esc(st.vErr) + '</p>';
    var models = vModels();
    if (view && (view.bar || view.compact)) {
      // Year / Make / Model / Trim side by side, like DT's hub.
      var makes = st.y && !st.vLoading ? ((yearData[st.y] || {}).makes || Object.keys(models)).slice().sort() : [];
      var mos = st.mk ? Object.keys(models[st.mk] || {}).sort() : [];
      var trs = st.mo ? Object.keys((models[st.mk] || {})[st.mo] || {}).sort() : [];
      h += '<div class="pss__trio pss__trio--veh" role="group" aria-label="Your vehicle">' +
        sel('y', 'Year', st._years || [], st.y, false) +
        sel('mk', 'Make', makes, st.mk, !st.y || st.vLoading, '', st.vLoading ? 'Loading…' : '') +
        sel('mo', 'Model', mos, st.mo, !st.mk) +
        sel('tr', 'Trim', trs, st.tr, !st.mo);
      if (st.tr) {
        var vs = vehicleSizes();
        if (vs.length > 1 && st.pLoading) h += sel('vsize', 'Tire size', [], '', true, '', 'Checking…');
        else if (vs.length > 1 && st.pairs) h += sel('vsize', 'Tire size', pairOpts(vs), '', false);
        else if (vs.length > 1) h += sel('vsize', 'Tire size', vs.map(function (z, i) { var sub = sizeSub(z); return { v: String(i), t: fmt(z) + (sub ? ' \u00b7 ' + sub : '') }; }), '', false);
      }
      h += '</div>';
      if (st.tr && st.pairs && !st.pLoading) h += '<p class="pss__note" data-pss-pair-say>' + esc(pairSay()) + ' ' + esc(window.PTVehiclePairs.note) + '</p>';
      else if (st.tr && pairHedge()) h += '<p class="pss__note" data-pss-pair-say>' + esc(pairHedge()) + '</p>';
      if (st.tr && !vehicleSizes().length) h += '<p class="pss__empty" role="alert">We don\'t have the tire size for this trim. Search by tire size (it\'s on the sidewall), or call us.</p>';
      return h;
    }
    if (!st.y) {
      h += q('Year');
      h += chips(st._years || [], 'y', '', 'Year');
    } else if (!st.mk) {
      var makes = ((yearData[st.y] || {}).makes || Object.keys(models)).slice().sort();
      h += q('Make');
      h += makes.length ? chips(makes, 'mk', 'pss__chips--3', 'Make') : '';
    } else if (!st.mo) {
      h += q('Model');
      h += chips(Object.keys(models[st.mk] || {}).sort(), 'mo', 'pss__chips--2', 'Model');
    } else if (!st.tr) {
      h += q('Trim');
      h += chips(Object.keys((models[st.mk] || {})[st.mo] || {}).sort(), 'tr', 'pss__chips--2', 'Trim');
    } else {
      var sizes = vehicleSizes();
      if (!sizes.length) {
        h += '<p class="pss__empty" role="alert">We don\'t have the tire size for this trim. Search by tire size (it\'s on the sidewall), or call us.</p>';
      } else if (st.pLoading && sizes.length > 1) {
        h += q('Your ' + st.y + ' ' + st.mk + ' ' + st.mo + ' takes');
        h += '<p class="pss__wait" role="status">Checking front and rear sizes…</p>';
      } else if (st.pairs && !st.pAll && sizes.length > 1) {
        h += renderPairs(sizes);
      } else {
        h += q('Your ' + st.y + ' ' + st.mk + ' ' + st.mo + ' takes');
        /* 2+ sizes the check could not place (mayDiffer, or the check
           failed): the "may differ" line comes first, and each size says
           whether it is on all four or may be one end only. */
        if (!st.pairs && pairHedge()) h += '<p class="pss__note" data-pss-pair-say>' + esc(pairHedge()) + '</p>';
        h += chips(sizes.map(function (z, i) { return { v: String(i), t: fmt(z), sub: sizeSub(z) }; }), 'vsize', 'pss__chips--2', 'Tire sizes');
        if (st.pairs && st.pAll) h += '<p class="pss__note"><button type="button" class="pss__help-link" data-pss-act="vsets">Show front + rear sets</button></p>';
      }
    }
    return h;
  }
  // The trim's factory front + rear sets (PTVehiclePairs.lookup answer):
  // sets first, then sizes the data shows on all four wheels. Every size of
  // the trim stays one tap away ("Shop one size instead": half sets allowed).
  function carName() { return [st.y, st.mk, st.mo].join(' ').replace(/\s+/g, ' ').trim(); }
  function pairSay() { return window.PTVehiclePairs.sentence(st.pairs, carName()); }
  // No set to offer, but 2+ sizes that may not all go on all four wheels:
  // the server said mayDiffer, the car is staggered but this view can't
  // search a set, or the check failed. '' otherwise.
  var MAY_DIFFER = 'Front and rear may differ on this car \u2014 check the sticker in the driver\u2019s door.';
  function pairHedge() {
    if (st.pLoading || !st.pAsked || vehicleSizes().length < 2) return '';
    var a = st.pAns;
    if (!a) return 'We couldn\u2019t check front and rear sizes. ' + MAY_DIFFER;
    if (st.pairs) return '';
    return a.staggered || a.mayDiffer ? MAY_DIFFER : '';
  }
  // A size chip's small line from the answer: on all four (server sameSize),
  // or maybe one end only (a size the server could not place).
  function sizeSub(z) {
    if (st.pLoading || !st.pAsked || vehicleSizes().length < 2) return '';
    var a = st.pAns;
    if (!a) return 'Front or rear only?'; // the check failed: any size may be one end only
    var k = fmt(z), inList = function (l) { return (l || []).some(function (s) { var y = parseSize(s); return y && fmt(y) === k; }); };
    if (inList(a.sameSize)) return 'On all four';
    // A staggered car this view can't offer sets for: every other size.
    if (a.staggered && !st.pairs) return 'Front or rear only?';
    return a.mayDiffer && inList(a.others) ? 'Front or rear only?' : '';
  }

  function sizeIndex(vs, s) {
    var z = parseSize(s);
    if (!z) return -1;
    for (var i = 0; i < vs.length; i++) if (fmt(vs[i]) === fmt(z)) return i;
    return -1;
  }
  function pairOpts(vs) {
    var a = st.pairs, o = [];
    a.pairs.forEach(function (x, i) { o.push({ v: 'p' + i, t: x.front + ' front + ' + x.rear + ' rear' }); });
    a.sameSize.forEach(function (s) { var i = sizeIndex(vs, s); if (i !== -1) o.push({ v: String(i), t: fmt(vs[i]) + ' on all four' }); });
    a.others.forEach(function (s) { var i = sizeIndex(vs, s); if (i !== -1) o.push({ v: String(i), t: fmt(vs[i]) }); });
    return o;
  }
  function renderPairs(vs) {
    var a = st.pairs, h = q(pairSay());
    h += '<div class="pss__chips" style="grid-template-columns:minmax(0,1fr)" role="group" aria-label="Front and rear sets">' +
      a.pairs.map(function (x, i) {
        return '<button type="button" class="pss__chip" data-pss-act="vpair" data-v="' + i + '">' + esc(x.front) + ' front + ' + esc(x.rear) + ' rear<small>Front + rear set</small></button>';
      }).join('') + '</div>';
    var same = [];
    a.sameSize.forEach(function (s) { var i = sizeIndex(vs, s); if (i !== -1) same.push({ v: String(i), t: fmt(vs[i]), sub: 'On all four' }); });
    if (same.length) h += '<div style="margin-top:.8rem">' + chips(same, 'vsize', 'pss__chips--2', 'Same size on all four') + '</div>';
    h += '<p class="pss__note">' + esc(window.PTVehiclePairs.note) + ' <button type="button" class="pss__help-link" data-pss-act="vall">Shop one size instead</button></p>';
    return h;
  }
  function vehicleSizes() {
    var raw = (((vModels()[st.mk] || {})[st.mo] || {})[st.tr]) || [];
    var out = [], seen = {};
    raw.forEach(function (s) {
      var z = parseSize(typeof s === 'string' ? s : (s && (s.size || s.front)) || '');
      if (!z || seen[fmt(z)]) return;
      seen[fmt(z)] = 1;
      out.push(z);
    });
    return out;
  }

  function render(focusQ) {
    var size = st.tab === 'size';
    $all('[data-pss-tab]', root).forEach(function (b) {
      var on = b.getAttribute('data-pss-tab') === st.tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-on', on);
    });
    bodyEl.setAttribute('aria-labelledby', view.pfx + (size ? '-tab-size' : '-tab-vehicle'));
    var rs = rows();
    if (backBtn) backBtn.hidden = rs.length === 0;
    // A re-render (e.g. the size list landing) keeps what is being typed.
    var fi = $('[data-pss-find]', bodyEl), typing = fi && document.activeElement === fi;
    if (fi) st.findQ = fi.value;
    bodyEl.innerHTML = rs.map(doneRow).join('') + (size ? (view.compact ? renderSizeCompact() : renderSize()) : renderVehicle());
    if (view.compact && root) { root.classList.toggle('is-veh', !size); root.classList.toggle('is-trio', !!(size && st.trio)); }
    if (view.compact && view.inline) moveTail();
    if (typing && !focusQ) { var nf = $('[data-pss-find]', bodyEl); if (nf) { nf.focus(); try { nf.setSelectionRange(nf.value.length, nf.value.length); } catch (e) {} } }
    foot();
    if (focusQ) {
      // The one-screen size tab has no step heading: the next thing to
      // answer gets focus (season once the size is complete, else width).
      var qh = $('[data-pss-q]', bodyEl) || (st.tab === 'size' && ($('[data-pss-act="season"]', bodyEl) || $('[data-pss-sel="w"]', bodyEl)));
      if (!qh || (st.tab === 'vehicle')) {
        var empty = $all('select[data-pss-sel]:not([disabled])', bodyEl).filter(function (x) { return !x.value; })[0];
        if (empty) qh = empty;
      }
      if (qh) { try { qh.focus({ preventScroll: false }); } catch (e) { qh.focus(); } }
      bodyEl.scrollTop = 0;
    }
    keep();
  }

  function foot() {
    var size = st.tab === 'size';
    var full = !!(st.w && st.a && st.r);
    // Vehicle tab after it found the size: the button still opens that size.
    if (!size && !(st.fromVehicle && full)) {
      setGo(false, 'Show tires', 'We match your vehicle to its tire sizes');
      return;
    }
    if (view.compact && size && !st.trio && !full) {
      // Field-first: the button reads the field when pressed (go()). A
      // part-typed or wrong size never reads "Show tires".
      var fv = $('[data-pss-find]', bodyEl);
      var typedTxt = String(fv ? fv.value : (st.findQ || '')).trim();
      setGo(true, typedTxt ? 'Finish the size' : 'Show tires', '');
      announce(null);
      return;
    }
    if (view.compact && size && st.pristine && full && !rearPartial()) {
      // The size already on screen: no count, no "Show N" (it is this page).
      setGo(true, rearAllowed() && pairOn() ? 'Show sets' : 'Show tires', '');
      announce(null);
      return;
    }
    var url = destination();
    var label = fmt(st);
    var seasonTxt = st.seasons.length === 1 ? SEASONS.filter(function (s) { return s[0] === st.seasons[0]; })[0][1] : '';
    // A rear size that is only half picked: nothing to open yet (a hidden
    // or partial rear is never sent).
    if (full && rearAllowed() && rearPartial()) {
      setGo(false, !st.rw ? 'Pick the rear size' : st.ra ? 'Pick the rear rim size' : 'Pick the rear aspect and rim', 'Or remove the rear size');
      announce(null);
      return;
    }
    if (full && rearAllowed() && pairOn()) label = label + ' front + ' + fmt(rearSize()) + ' rear';
    var hint = full ? label + (seasonTxt ? ' · ' + seasonTxt : ' · all seasons')
      : st.w ? 'You can stop here; more answers narrow it down'
      : '';
    if (view.compact) hint = ''; // the field already says the size
    if (st.nUrl === url && st.n !== undefined) { paint(url, st.n, full, hint); return; }
    if (Object.prototype.hasOwnProperty.call(countCache, url)) {
      st.n = countCache[url]; st.nUrl = url;
      paint(url, st.n, full, hint);
      return;
    }
    if (view.compact) setGo(true, rearAllowed() && pairOn() ? 'Show sets' : 'Show tires', hint, true);
    else setGo(false, 'Counting tires…', hint, true);
    clearTimeout(countTimer);
    var v = view;
    countTimer = setTimeout(function () {
      fetchCount(url).then(function (n) {
        use(v);
        if (destination() !== url) return;
        st.n = n; st.nUrl = url;
        paint(url, n, full, hint);
      }, function (err) {
        if (err && err.name === 'AbortError') return;
        use(v);
        if (destination() !== url) return;
        st.n = null; st.nUrl = url;
        paint(url, null, full, hint);
      });
    }, 180);
  }
  function paint(url, n, full, hint) {
    // "results", not "tires": a count of matching listings must never read
    // like stock on hand (owner 2026-11-15, after "191 in stock").
    var unit = n === 1 ? 'result' : 'results';
    if (n === 0) {
      var so = seasonsOut();
      if (so.length) setGo(false, 'No ' + (so.length === 1 ? SEASONS.filter(function (s) { return s[0] === so[0]; })[0][1].toLowerCase() + ' ' : '') + 'tires in this size', 'Try another season, or call us and we\'ll order them in.');
      else setGo(false, 'No tires in this size yet', 'Call 403-452-4283 and we\'ll order them in.');
      announce(0);
      return;
    }
    if (!st.w && view.compact) {
      setGo(true, 'Show tires', hint);
    } else if (!st.w) {
      setGo(true, n == null ? 'Show all tires' : 'Show all ' + num(n) + ' ' + unit, hint);
    } else if (n == null && full && !inIndex(st)) {
      // Shopify ignores a filter value it has never seen and would list every
      // tire under this size's name.
      setGo(false, 'No tires in this size yet', 'Check the sidewall, or call 403-452-4283 and we\'ll order them in.');
    } else if (n == null && !full) {
      // A part size with no count would open an unfiltered page.
      setGo(false, st.a ? 'Pick a rim size' : 'Pick the aspect and rim', 'Most tires need all three numbers');
    } else if (full && rearAllowed() && pairOn()) {
      // Front + rear: how many SETS there are is only known once the
      // results page pairs them, so no number (never a made-up one).
      setGo(true, 'Show sets', hint);
      checkRear(url);
      announce(null);
      return;
    } else {
      setGo(true, n == null ? 'Show tires' : 'Show ' + num(n) + ' ' + unit, hint);
    }
    announce(n);
  }
  // Say so when the rear size is not carried (its count is 0, or Shopify
  // did not know the size). The front size still opens.
  function checkRear(url) {
    var z = rearSize();
    if (!z) return;
    var msg = 'We don\'t carry ' + fmt(z) + ' right now. You\'ll still see the front size.';
    var ru = rearDestination();
    if (!ru) { hintEl.textContent = msg; return; }
    var v = view;
    fetchRearCount(ru).then(function (n) {
      use(v);
      if (destination() !== url || !pairOn()) return;
      if (n === 0 || n == null) hintEl.textContent = msg;
    }, function () {});
  }
  function setGo(enabled, text, hint, busy) {
    goBtn.disabled = !enabled;
    goBtn.classList.toggle('is-off', !enabled);
    goBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
    goBtn.textContent = text;
    hintEl.textContent = hint || '';
  }
  var lastSaid = null;
  function announce(n) {
    if (!liveEl || n === lastSaid) return;
    lastSaid = n;
    keep();
    liveEl.textContent = n == null ? '' : n === 0 ? 'No tires match' : num(n) + (n === 1 ? ' tire matches' : ' tires match');
  }

  /* ── actions ── */
  function setTab(t) {
    if (t !== 'size' && t !== 'vehicle') return;
    st.tab = t;
    if (t === 'vehicle' && !st._years) {
      st.vLoading = true;
      render(false);
      var v = view, mine = st;
      years().then(function (ys) {
        use(v);
        if (st !== mine) return; // started over meanwhile
        st._years = ys; st.vLoading = false;
        // Arrow keys on the tabs: focus stays on the tab (ARIA tabs pattern).
        var ae = document.activeElement;
        render(!(ae && ae.getAttribute && ae.getAttribute('role') === 'tab' && root.contains(ae)));
      });
      return;
    }
    render(false);
  }
  // One size (a recent search, a vehicle size, a typed size): the rear goes.
  function setSize(z, rear) {
    st.kind = z.kind; st.w = z.w; st.a = z.a; st.r = z.r;
    clearRear();
    if (rear && rear.kind === z.kind && fmt(rear) !== fmt(z)) { st.rearOn = true; st.rw = rear.w; st.ra = rear.a; st.rr = rear.r; }
    st.tab = 'size';
    if (view && view.compact) {
      st.findQ = fmt(z); st.rfindQ = st.rearOn ? fmt(rearSize()) : ''; st.pristine = false; st.trio = false;
    }
  }
  function act(kind, v, btn) {
    if (view && view.compact && compactAct(kind, v, btn)) return;
    // A vehicle dropdown set back to its placeholder clears it and what follows.
    if (!v && (kind === 'y' || kind === 'mk' || kind === 'mo' || kind === 'tr' || kind === 'vsize')) { if (kind !== 'vsize') edit(kind); return; }
    switch (kind) {
      case 'w': case 'a': case 'r':
        st[kind] = v; st.findErr = ''; st.fromVehicle = null;
        if (kind === 'w' && (!v || optsFor('a').indexOf(st.a) === -1)) st.a = '';
        if (kind !== 'r' && (!st.a || optsFor('r').indexOf(st.r) === -1)) st.r = '';
        // Redraw around this dropdown, which keeps focus and type-ahead
        // (typing 2-2-5 on a closed list must reach 225, not stop at 205).
        patchSize(kind);
        return;
      case 'rw': case 'ra': case 'rr':
        st[kind] = v; st.findErr = '';
        if (kind === 'rw' && (!v || optsForRear('a').indexOf(st.ra) === -1)) st.ra = '';
        if (kind !== 'rr' && (!st.ra || optsForRear('r').indexOf(st.rr) === -1)) st.rr = '';
        patchSize(kind);
        return;
      case 'rearon':
        st.rearOn = true; st.rw = st.ra = st.rr = '';
        render(false);
        var rw = $('[data-pss-sel="rw"]', bodyEl);
        if (rw) rw.focus();
        return;
      case 'rearoff':
        clearRear();
        render(false);
        var ar = $('[data-pss-act="rearon"]', bodyEl);
        if (ar) ar.focus();
        return;
      case 'season':
        st.seasons = (st.seasons.length === 1 && st.seasons[0] === v) ? [] : [v];
        render(false);
        var again = $('[data-pss-act="season"][data-v="' + v + '"]', bodyEl);
        if (again) again.focus();
        return;
      case 'kind':
        st.kind = st.kind === 'flot' ? 'metric' : 'flot'; st.w = st.a = st.r = ''; st.findErr = ''; clearRear();
        render(false);
        var kb = $('[data-pss-act="kind"]', bodyEl);
        if (kb) kb.focus();
        return;
      case 'recent': var o = (st._rec || [])[+v]; if (o) setSize(o.z); break;
      case 'find': find(); return;
      case 'edit': edit(v); return;
      case 'y':
        st.y = v; st.mk = st.mo = st.tr = ''; st.vErr = ''; st.vLoading = true; clearPairs();
        render(false);
        var vw = view;
        loadYear(v).then(function () { use(vw); if (st.y !== v) return; st.vLoading = false; render(true); }, function () {
          use(vw);
          if (st.y !== v) return;
          st.vLoading = false; st.y = '';
          st.vErr = 'We couldn\'t load vehicles for ' + v + '. Try another year, or search by tire size.';
          track('vehicle', 'data_error', { year: v });
          render(true);
        });
        return;
      case 'mk': st.mk = v; st.mo = st.tr = ''; clearPairs(); break;
      case 'mo':
        st.mo = v; st.tr = ''; clearPairs();
        var trims = Object.keys((vModels()[st.mk] || {})[st.mo] || {});
        if (trims.length === 1) { st.tr = trims[0]; return afterTrim(); }
        break;
      case 'tr': st.tr = v; return afterTrim();
      case 'vsize':
        // The bar's one dropdown also lists the sets ('p0', 'p1' ...).
        if (/^p\d+$/.test(v)) { pickVehiclePair(+v.slice(1)); return; }
        pickVehicleSize(+v); return;
      case 'vpair': pickVehiclePair(+v); return;
      case 'vall': st.pAll = true; break;
      case 'vsets': st.pAll = false; break;
    }
    render(true);
  }
  // Quick search: a whole size fills in all three answers; anything else
  // says what to type.
  function find() {
    var inp = $('[data-pss-find]', bodyEl);
    var raw = inp ? inp.value : '';
    st.findQ = raw;
    // Two sizes ("245/40R18 275/35R18", "245/40R18 + 275/35R18"): front + rear.
    var two = rearAllowed() ? typedPair(raw) : null;
    var z = two ? two[0] : parseTyped(raw);
    if (!z) {
      var ex = st.kind === 'flot' ? '33X12.50R20' : '225/65R17';
      st.findErr = !String(raw).trim() ? 'Type your tire size, like ' + ex + '.'
        : parseTyped.insane ? String(raw).trim().toUpperCase() + ' isn\'t a tire size. Check the numbers on the sidewall, like ' + ex + '.'
        : 'Type all three numbers, like ' + ex + ' (it\'s on the tire\'s sidewall).';
      render(false);
      var again = $('[data-pss-find]', bodyEl);
      if (again) again.focus();
      return;
    }
    st.findQ = ''; st.findErr = '';
    if (inp) inp.value = '';
    st.fromVehicle = null;
    setSize(z, two ? two[1] : null);
    render(false);
    var sp = $('[data-pss-act="season"]', bodyEl);
    if (sp) sp.focus();
  }
  // "245/40R18 275/35R18", "245/40R18+275/35R18", "245/40/18, 275/35/18":
  // two whole sizes -> [front, rear]; anything else -> null (one size).
  function typedPair(raw) {
    var t = String(raw || '').trim().toUpperCase();
    var parts = t.split(/\s*(?:\+|&|,|\bAND\b|\bFRONT\b|\bREAR\b)\s*/).filter(Boolean);
    if (parts.length !== 2) {
      var m = t.match(/(?:LT|P|ST)?\d{3}\s*\/\s*\d{2,3}\s*Z?R\s*\d{2}|\d{2}\s*X\s*\d{1,2}(?:\.\d{1,2})?\s*R\s*\d{2}/g);
      if (!m || m.length !== 2) return null;
      parts = m;
    }
    var a = parseTyped(parts[0]), b = parseTyped(parts[1]);
    if (!a || !b || a.kind !== b.kind) return null;
    return [a, b];
  }
  function clearPairs() { st.pairs = null; st.pLoading = false; st.pKey = ''; st.pAll = false; st.pAns = null; st.pAsked = false; }
  function vehKey() { return [st.y, st.mk, st.mo, st.tr].join('|'); }
  // Vehicle pairs need the helper on the page and a view with a rear size.
  function canPair() {
    return rearAllowed() && !!(window.PTVehiclePairs && typeof window.PTVehiclePairs.lookup === 'function' && window.PTVehiclePairs.url);
  }
  function afterTrim() {
    var sizes = vehicleSizes();
    clearPairs();
    if (sizes.length === 1) { pickVehicleSize(0); return; }
    if (!sizes.length) track('vehicle', 'no_sizes', { year: st.y, make: st.mk, model: st.mo, trim: st.tr });
    var VP = window.PTVehiclePairs;
    if (sizes.length > 1 && VP && typeof VP.lookup === 'function') {
      // Ask which sizes go front and rear; until the answer, no size can be
      // picked (a rear size must not be bought as four by accident). A view
      // that can't search a rear size (inline, no bar) still asks, so its
      // size chips carry the "may differ" line instead of saying nothing.
      var raw = (((vModels()[st.mk] || {})[st.mo] || {})[st.tr]) || [];
      var k = vehKey(), v = view, mine = st, sets = canPair();
      st.pLoading = true; st.pKey = k; st.pAsked = true;
      render(true);
      var settle = function (ans) {
        use(v);
        if (st !== mine || st.pKey !== k || vehKey() !== k) return; // changed meanwhile
        st.pLoading = false;
        st.pAns = ans || null;
        st.pairs = sets && ans && ans.staggered && ans.pairs && ans.pairs.length ? ans : null;
        render(true);
      };
      var p;
      try { p = window.PTVehiclePairs.lookup({ year: st.y, make: st.mk, model: st.mo, trim: st.tr, sizes: raw }); } catch (e) { p = null; }
      if (!p || typeof p.then !== 'function') { settle(null); return; }
      p.then(settle, function () { settle(null); });
      return;
    }
    render(true);
  }
  // A factory front + rear set: both trios filled, so the search (button,
  // URL, results page) is the same as typing the two sizes.
  function pickVehiclePair(i) {
    var x = st.pairs && st.pairs.pairs[i];
    var zf = x && parseSize(x.front), zr = x && parseSize(x.rear);
    if (!zf || !zr || zf.kind !== zr.kind || fmt(zf) === fmt(zr)) return;
    var raw = (((vModels()[st.mk] || {})[st.mo] || {})[st.tr]) || [];
    // Additive `pair` field: the garage pill / banner and pt-book keep reading sizes / tireSize.
    lsSet(VEH_KEY, JSON.stringify({ year: st.y, make: st.mk, model: st.mo, trim: st.tr, sizes: raw, pair: { front: x.front, rear: x.rear }, savedAt: new Date().toISOString() }));
    st.fromVehicle = { year: st.y, make: st.mk, model: st.mo, trim: st.tr, sizes_count: vehicleSizes().length, pair: true };
    st.seasons = [];
    setSize(zf, zr);
    render(true);
  }
  function pickVehicleSize(i) {
    var sizes = vehicleSizes();
    var z = sizes[i];
    if (!z) return;
    var raw = (((vModels()[st.mk] || {})[st.mo] || {})[st.tr]) || [];
    lsSet(VEH_KEY, JSON.stringify({ year: st.y, make: st.mk, model: st.mo, trim: st.tr, sizes: raw, savedAt: new Date().toISOString() }));
    st.fromVehicle = { year: st.y, make: st.mk, model: st.mo, trim: st.tr, sizes_count: sizes.length };
    st.seasons = []; // a season picked for another size does not carry over
    setSize(z);
    render(true);
  }
  function edit(k) {
    var order = st.tab === 'size' ? ['w', 'a', 'r'] : ['y', 'mk', 'mo', 'tr'];
    var i = order.indexOf(k);
    if (i === -1) return;
    for (var j = i; j < order.length; j++) st[order[j]] = '';
    if (st.tab !== 'size') clearPairs();
    if (st.tab === 'size') st.fromVehicle = null;
    // Changing the vehicle drops the size it gave (the button waits again).
    else if (st.fromVehicle) { st.fromVehicle = null; st.w = st.a = st.r = ''; st.seasons = []; }
    render(true);
  }
  function back() {
    var rs = rows();
    if (rs.length) edit(rs[rs.length - 1][0]);
  }

  function track(method, outcome, d) {
    if (!window.PTTrack) return;
    d = d || {};
    var payload = { surface: (view && view.surface) || 'size_sheet', method: method, year: d.year, make: d.make, model: d.model, trim: d.trim, size: d.size, rear_size: d.rear_size };
    var key = 'pss|' + payload.surface + '|' + [method, outcome, d.year, d.make, d.model, d.trim, d.size, d.rear_size].join('|');
    try {
      window.PTTrack.once(key + '|s', 'pt_search_submit', payload);
      window.PTTrack.once(key + '|r', 'pt_search_result', Object.assign({ outcome: outcome, sizes_count: d.sizes_count || (d.size ? 1 : 0) }, payload));
    } catch (e) {}
  }
  function go() {
    if (goBtn.disabled) return;
    if (view.compact && st.tab === 'size' && !st.trio && !readFields()) return;
    var url = destination();
    var size = fmt(st);
    if (size) {
      remember(size);
      var fv = st.fromVehicle || {};
      var rs = rearAllowed() && pairOn() ? fmt(rearSize()) : undefined;
      track(st.fromVehicle ? 'vehicle' : 'size_steps', 'sizes', { year: fv.year, make: fv.make, model: fv.model, trim: fv.trim, size: size, rear_size: rs, sizes_count: fv.sizes_count || 1 });
    }
    goBtn.textContent = 'Loading…';
    if (window.PTTrack && typeof window.PTTrack.go === 'function') window.PTTrack.go(url);
    else window.location.href = url;
  }

  /* ── v16 compact view (tire results only) ──────────────────────────── */
  ICON.x = '<path d="M7 7l10 10M17 7L7 17"/>';
  ICON.clock = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>';
  // Recent rows for the dropdown: every size searched (newest first), the
  // signed-in customer's My Garage car, the last vehicle searched. Max 5.
  function recentList() {
    var out = [], seen = {};
    function add(o) { var k = o.t + '|' + fmt(o.z); if (seen[k]) return; seen[k] = 1; out.push(o); }
    try {
      var arr = JSON.parse(lsGet(RECENT_KEY) || '[]');
      if (Array.isArray(arr)) arr.forEach(function (x) {
        var q = typeof x === 'string' ? x : x && x.query;
        if (x && typeof x === 'object' && x.mode === 'wheels') return;
        var z = parseSize(q) || parseTyped(q);
        if (z) add({ ic: 'clock', t: fmt(z), z: z, src: 'size' });
      });
    } catch (e) {}
    try {
      var lv = JSON.parse(lsGet(VEH_KEY) || 'null');
      if (lv && lv.year && lv.make && lv.model) {
        var lz = parseSize((lv.pair && lv.pair.front) || (lv.sizes && (typeof lv.sizes[0] === 'string' ? lv.sizes[0] : (lv.sizes[0] && (lv.sizes[0].size || lv.sizes[0].front)))) || lv.tireSize || '');
        var lr = lv.pair && lv.pair.rear ? parseSize(lv.pair.rear) : null;
        if (lz) add({ ic: 'car', t: lv.year + ' ' + lv.make + ' ' + lv.model, z: lz, rz: lr, src: 'vehicle' });
      }
    } catch (e) {}
    try {
      var cid = cfg.customerId;
      if (cid) {
        var cars = JSON.parse(lsGet('pt-garage-' + cid) || '[]');
        if (Array.isArray(cars)) {
          cars.sort(function (a, b) { return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0); });
          for (var j = 0; j < cars.length; j++) {
            var v = cars[j];
            var gz = v && parseSize(v.tireSize || (v.sizes && v.sizes[0]) || '');
            if (gz) { add({ ic: 'car', t: v.nickname || (v.year + ' ' + v.make + ' ' + v.model), z: gz, src: 'garage' }); break; }
          }
        }
      }
    } catch (e) {}
    // fix2 (results pages): the size already on screen is no choice. Drop a
    // size row equal to the page's one size, and a vehicle row whose front
    // + rear are the page's set.
    if (view && view.compact && st && st.pageZ) {
      out = out.filter(function (o) {
        if (o.src === 'size') return !(!st.pageRZ && fmt(o.z) === st.pageZ);
        if (o.src === 'vehicle' && o.rz) return !(st.pageRZ && fmt(o.z) === st.pageZ && fmt(o.rz) === st.pageRZ);
        return true;
      });
    }
    return out.slice(0, 5);
  }
  function forget(o) {
    if (!o) return;
    if (o.src === 'size') {
      try {
        var all = JSON.parse(lsGet(RECENT_KEY) || '[]');
        if (Array.isArray(all)) {
          all = all.filter(function (x) {
            var q = typeof x === 'string' ? x : x && x.query;
            var z = parseSize(q) || parseTyped(q);
            return !(z && fmt(z) === fmt(o.z) && !(x && typeof x === 'object' && x.mode === 'wheels'));
          });
          lsSet(RECENT_KEY, JSON.stringify(all));
        }
      } catch (e) {}
    } else if (o.src === 'vehicle') {
      try { window.localStorage.removeItem(VEH_KEY); } catch (e) {}
    }
  }
  function renderSizeCompact() {
    var h = '', flot = st.kind === 'flot', pf = view.pfx, quiet = view.id === 'quiet';
    if (st.trio) {
      // "Pick width, aspect, rim": the three numbers (and the rear trio).
      var withRear = st.rearOn;
      h += '<div class="pss__trio' + (flot ? ' pss__trio--flot' : '') + '" role="group" aria-label="' + (withRear ? 'Front tire size' : 'Tire size') + '">' +
        (withRear ? '<span class="pss__axle" aria-hidden="true">Front</span>' : '') +
        sel('w', flot ? 'Diameter' : 'Width', optsFor('w'), st.w, false, flot ? '″' : '') +
        '<span class="pss__sep" aria-hidden="true">' + (flot ? 'X' : '/') + '</span>' +
        sel('a', flot ? 'Width' : 'Aspect', st.w ? optsFor('a') : [], st.a, !st.w) +
        '<span class="pss__sep" aria-hidden="true">R</span>' +
        sel('r', 'Rim', st.w && st.a ? optsFor('r') : [], st.r, !(st.w && st.a), '″') +
        '</div>';
      h += '<div class="pss__rear" data-pss-rear>' + (st.rearOn ? renderRear(flot) : '') + '</div>';
      h += '<div data-pss-rec></div>';
    } else {
      var lbl = st.rearOn ? 'Front tire size' : 'Tire size';
      h += '<label class="pss__lab' + (quiet ? ' pss__sr' : '') + '" for="' + pf + '-find">' + (st.rearOn ? 'Front' : 'Tire size') + '</label>';
      h += '<div class="pss__field" data-pss-field>' +
        (quiet ? '<span class="pss__find-ic">' + svg('search', 18) + '</span>' : '') +
        '<input class="pss__input" id="' + pf + '-find" type="text" data-pss-find role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + pf + '-rec" aria-label="' + lbl + '" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="search" placeholder="' + (quiet ? 'Your size, e.g. 225/65R17' : (flot ? 'e.g. 33X12.50R20' : 'e.g. 225/65R17')) + '" value="' + esc(st.findQ || '') + '"' + (st.findErr ? ' aria-invalid="true" aria-describedby="' + pf + '-find-err"' : '') + '>' +
        '<button type="button" class="pss__clear" data-pss-act="clearfind" aria-label="Clear the size"' + (st.findQ ? '' : ' hidden') + '>' + svg('x', 18) + '</button>' +
        (quiet ? '<div class="pss__drop" id="' + pf + '-rec" role="listbox" aria-label="Recent searches" data-pss-drop hidden></div>' : '') +
        '</div>';
      if (!quiet) h += '<div class="pss__drop" id="' + pf + '-rec" role="listbox" aria-label="Recent searches" data-pss-drop hidden></div>';
      h += '<div data-pss-rec>' + (st.findErr ? '<p class="pss__err" id="' + pf + '-find-err" role="alert">' + esc(st.findErr) + '</p>' : '') + '</div>';
      if (st.rearOn && !quiet) {
        h += '<div class="pss__rearf" data-pss-rear>' +
          '<label class="pss__lab" for="' + pf + '-findr">Rear</label>' +
          '<div class="pss__field">' +
          '<input class="pss__input" id="' + pf + '-findr" type="text" data-pss-findr autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. 275/35R18" value="' + esc(st.rfindQ || '') + '"' + (st.rfindErr ? ' aria-invalid="true" aria-describedby="' + pf + '-findr-err"' : '') + '>' +
          '<button type="button" class="pss__rmr" data-pss-act="rearoff">Remove rear size</button>' +
          '</div>' +
          (st.rfindErr ? '<p class="pss__err" id="' + pf + '-findr-err" role="alert">' + esc(st.rfindErr) + '</p>' : '') +
          '</div>';
      }
    }
    h += '<div class="pss__lnks">';
    if (!quiet) {
      h += '<button type="button" class="pss__lnk" data-pss-act="trio">' + (st.trio ? 'Type the size instead' : 'Pick width, aspect, rim') + '</button>';
      if (!st.rearOn) h += '<button type="button" class="pss__lnk" data-pss-act="rearon">Rear size differs?</button>';
      if (st.trio) h += '<button type="button" class="pss__lnk" data-pss-act="kind">' + (flot ? 'Regular size?' : 'Off-road size?') + '</button>';
    }
    h += '<button type="button" class="pss__lnk" data-pss-act="help" aria-expanded="' + (st.help ? 'true' : 'false') + '" aria-controls="' + pf + '-help">Where\'s my size?</button>';
    var helpP = '<p class="pss__helpx" id="' + pf + '-help"' + (st.help ? '' : ' hidden') + '>It\'s on the tire\'s sidewall, e.g. <b>' + (flot ? '33X12.50R20' : '225/65R17') + '</b>. Most cars also list it on the sticker inside the driver\'s door.</p>';
    if (quiet) h += helpP;
    h += '</div>';
    if (!quiet) h += helpP;
    h += '<div data-pss-after>';
    var rz = rearSize();
    if (rz && st.w && st.a && st.r && fmt(rz) === fmt(st)) h += '<p class="pss__note">Front and rear are the same size, so this is a regular search.</p>';
    if (st.trio && st.w && !optsFor('a').length) h += '<p class="pss__empty">We don\'t carry that width right now. Pick another, or call us and we\'ll find them.</p>';
    h += '</div>';
    return h;
  }
  // Read the typed field(s) into the state. false = said what is wrong.
  function readFields() {
    var inp = $('[data-pss-find]', bodyEl), rin = $('[data-pss-findr]', bodyEl);
    if (!inp) return true;
    var raw = inp.value;
    st.findQ = raw;
    var two = typedPair(raw);
    var z = two ? two[0] : parseTyped(raw);
    var ex = st.kind === 'flot' ? '33X12.50R20' : '225/65R17';
    if (!z) {
      st.findErr = !String(raw).trim() ? 'Type your tire size, like ' + ex + '.'
        : parseTyped.insane ? String(raw).trim().toUpperCase() + ' isn\'t a tire size. Check the numbers on the sidewall, like ' + ex + '.'
        : 'Type all three numbers, like ' + ex + ' (it\'s on the tire\'s sidewall).';
      render(false);
      var again = $('[data-pss-find]', bodyEl);
      if (again) again.focus();
      return false;
    }
    var rz = two ? two[1] : null;
    if (!rz && st.rearOn && rin) {
      st.rfindQ = rin.value;
      if (String(rin.value).trim()) {
        rz = parseTyped(rin.value);
        if (!rz) {
          st.rfindErr = 'Type the rear size, like 275/35R18.';
          render(false);
          var ra = $('[data-pss-findr]', bodyEl);
          if (ra) ra.focus();
          return false;
        }
      }
    }
    st.findErr = ''; st.rfindErr = '';
    var keepRear = st.rearOn && !rz && !two;
    setSize(z, rz);
    if (keepRear) st.rearOn = true;
    return true;
  }
  // Live: a whole size typed updates the button's count (no redraw of the field).
  function typed() {
    var inp = $('[data-pss-find]', bodyEl), rin = $('[data-pss-findr]', bodyEl);
    if (!inp) return;
    st.findQ = inp.value;
    if (rin) st.rfindQ = rin.value;
    st.pristine = false;
    var x = $('[data-pss-act="clearfind"]', bodyEl);
    if (x) x.hidden = !inp.value;
    var two = typedPair(inp.value);
    var z = two ? two[0] : parseTyped(inp.value);
    if (z) {
      st.kind = z.kind; st.w = z.w; st.a = z.a; st.r = z.r;
      var rz = two ? two[1] : (rin && String(rin.value).trim() ? parseTyped(rin.value) : null);
      if (rz && rz.kind === z.kind) { st.rearOn = true; st.rw = rz.w; st.ra = rz.a; st.rr = rz.r; }
      else if (st.rearOn && rin && !String(rin.value).trim()) { st.rw = st.ra = st.rr = ''; }
    } else { st.w = st.a = st.r = ''; }
    foot();
    keepView();
  }
  // The Recent dropdown (listbox) under the field.
  function dropShow(on) {
    var d = $('[data-pss-drop]', bodyEl), inp = $('[data-pss-find]', bodyEl);
    if (!d || !inp) return;
    var list = on ? recentList() : [];
    st._rlist = list;
    st._ract = -1;
    if (!list.length) { d.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); return; }
    d.innerHTML = '<p class="pss__droph" aria-hidden="true">Recent</p>' + list.map(function (o, i) {
      var txt = o.t === fmt(o.z) ? o.t : o.t + ' · ' + fmt(o.z) + (o.rz ? ' + ' + fmt(o.rz) : '');
      return '<div class="pss__opt" role="option" id="' + view.pfx + '-ro-' + i + '" aria-selected="false" data-pss-act="rpick" data-v="' + i + '">' +
        svg(o.ic, 18) + '<span>' + esc(txt) + '</span>' +
        (o.src === 'garage' ? '' : '<button type="button" class="pss__optx" tabindex="-1" data-pss-act="rforget" data-v="' + i + '" aria-label="Remove ' + esc(txt) + ' from recent searches">' + svg('x', 16) + '</button>') +
        '</div>';
    }).join('');
    d.hidden = false;
    inp.setAttribute('aria-expanded', 'true');
  }
  function dropMove(dir) {
    var list = st._rlist || [];
    if (!list.length) return;
    var i = st._ract == null ? -1 : st._ract;
    i = dir === 'home' ? 0 : dir === 'end' ? list.length - 1 : (i + dir + list.length) % list.length;
    st._ract = i;
    var inp = $('[data-pss-find]', bodyEl);
    $all('.pss__opt', bodyEl).forEach(function (o, j) { o.setAttribute('aria-selected', j === i ? 'true' : 'false'); o.classList.toggle('is-act', j === i); });
    if (inp) inp.setAttribute('aria-activedescendant', view.pfx + '-ro-' + i);
  }
  function dropOpen() { var d = $('[data-pss-drop]', bodyEl); return !!(d && !d.hidden); }
  function pickRecent(i) {
    var o = (st._rlist || [])[+i];
    if (!o) return;
    st.fromVehicle = null;
    setSize(o.z, o.rz || null);
    st.findQ = fmt(o.z); st.pristine = false;
    go2();
  }
  // Open the search without waiting for a count (a recent pick).
  function go2() {
    var url = destination();
    var size = fmt(st);
    if (size) {
      remember(size);
      var rs = rearAllowed() && pairOn() ? fmt(rearSize()) : undefined;
      track('size_steps', 'sizes', { size: size, rear_size: rs, sizes_count: 1 });
    }
    goBtn.textContent = 'Loading…';
    if (window.PTTrack && typeof window.PTTrack.go === 'function') window.PTTrack.go(url);
    else window.location.href = url;
  }
  function compactAct(kind, v, btn) {
    switch (kind) {
      case 'clearfind':
        var inp = $('[data-pss-find]', bodyEl);
        if (inp) { inp.value = ''; typed(); inp.focus(); dropShow(true); }
        return true;
      case 'trio':
        if (!st.trio) readFieldsQuiet();
        st.trio = !st.trio;
        if (!st.trio) { st.findQ = st.w ? fmt(st) : ''; st.rfindQ = rearSize() ? fmt(rearSize()) : ''; }
        render(false);
        var t1 = st.trio ? $('[data-pss-sel="w"]', bodyEl) : $('[data-pss-find]', bodyEl);
        if (t1) t1.focus();
        return true;
      case 'help':
        st.help = !st.help;
        var hp = $('#' + view.pfx + '-help', root), hb = btn;
        if (hp) hp.hidden = !st.help;
        if (hb) hb.setAttribute('aria-expanded', String(!!st.help));
        keepView();
        return true;
      case 'rearon':
        readFieldsQuiet();
        st.rearOn = true; st.rw = st.ra = st.rr = ''; st.rfindQ = '';
        render(false);
        var rf = $(st.trio ? '[data-pss-sel="rw"]' : '[data-pss-findr]', bodyEl);
        if (rf) rf.focus();
        return true;
      case 'rearoff':
        readFieldsQuiet();
        clearRear(); st.rfindQ = ''; st.rfindErr = '';
        render(false);
        var rb = $('[data-pss-act="rearon"]', root);
        if (rb) rb.focus();
        return true;
      case 'rpick': pickRecent(v); return true;
      case 'rforget':
        var o = (st._rlist || [])[+v];
        forget(o);
        dropShow(true);
        var fi = $('[data-pss-find]', bodyEl);
        if (fi) fi.focus();
        return true;
    }
    return false;
  }
  // Compact inline views: the links (and the "Where's my size?" note) go
  // after the Show tires button in the DOM; the CSS keeps the layout.
  function moveTail() {
    var t = $('[data-pss-tail]', root);
    if (!t || !bodyEl) return;
    t.innerHTML = '';
    ['.pss__lnks', '.pss__helpx'].forEach(function (q) { var n = $(q, bodyEl); if (n) t.appendChild(n); });
  }
  // Keep what is typed when the view redraws (links, rear on / off).
  function readFieldsQuiet() {
    var inp = $('[data-pss-find]', bodyEl), rin = $('[data-pss-findr]', bodyEl);
    if (inp) st.findQ = inp.value;
    if (rin) st.rfindQ = rin.value;
    var z = inp ? parseTyped(inp.value) : null;
    if (z) { st.kind = z.kind; st.w = z.w; st.a = z.a; st.r = z.r; }
    var rz = rin && String(rin.value).trim() ? parseTyped(rin.value) : null;
    if (rz) { st.rw = rz.w; st.ra = rz.a; st.rr = rz.r; }
  }
  function wireCompact(v) {
    var el = v.root;
    el.addEventListener('input', function (e) {
      if (!e.target.matches || !e.target.matches('[data-pss-find], [data-pss-findr]')) return;
      use(v);
      typed();
      if (e.target.matches('[data-pss-find]')) dropShow(!e.target.value);
    });
    el.addEventListener('focusin', function (e) {
      if (!e.target.matches || !e.target.matches('[data-pss-find]')) return;
      use(v);
      if (!e.target.value || st.pristine) dropShow(true);
    });
    el.addEventListener('focusout', function (e) {
      if (!e.target.matches || !e.target.matches('[data-pss-find]')) return;
      var to = e.relatedTarget;
      setTimeout(function () {
        use(v);
        var d = $('[data-pss-drop]', bodyEl);
        if (d && to && d.contains(to)) return;
        if (d && d.contains(document.activeElement)) return;
        // fix2: the field's own clear (x) puts focus straight back and
        // opens Recent: don't hide it again.
        if (to && to.matches && to.matches('[data-pss-act="clearfind"]')) return;
        var ae = document.activeElement;
        if (ae && ae.matches && ae.matches('[data-pss-find]') && el.contains(ae)) return;
        dropShow(false);
      }, 120);
    });
    // fix2: a click on the empty, already focused field opens Recent too.
    el.addEventListener('click', function (e) {
      if (!e.target.matches || !e.target.matches('[data-pss-find]')) return;
      use(v);
      if (!e.target.value && !dropOpen()) dropShow(true);
    });
    // Pointer on a recent row: keep the field's focus (the pick happens on click).
    el.addEventListener('mousedown', function (e) {
      if (e.target.closest && e.target.closest('[data-pss-drop]')) e.preventDefault();
    });
    el.addEventListener('keydown', function (e) {
      if (!e.target.matches || !e.target.matches('[data-pss-find], [data-pss-findr]')) return;
      use(v);
      var isMain = e.target.matches('[data-pss-find]');
      if (isMain && dropOpen()) {
        if (e.key === 'ArrowDown') { e.preventDefault(); dropMove(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); dropMove(-1); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dropShow(false); return; }
        if (e.key === 'Enter' && st._ract != null && st._ract >= 0) { e.preventDefault(); e.stopPropagation(); pickRecent(st._ract); return; }
      } else if (isMain && e.key === 'ArrowDown') { e.preventDefault(); dropShow(true); dropMove(1); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); }
    }, true);
  }

  /* ── open / close ── */
  function open(opts) {
    opts = opts || {};
    build();
    opener = opts.opener || document.activeElement;
    backup = null;
    // v16: on a tire results page the sheet is the compact "Change size"
    // bottom sheet (field first, Recent in the dropdown, no season pills).
    var onResults = !!document.querySelector('.rd-res--v16[data-kind="tires"]') && context().results;
    if (onResults && !modal.compactWired) { wireCompact(modal); modal.compactWired = true; }
    modal.compact = onResults;
    root.classList.toggle('pss--c', onResults);
    var ttl = $('#pss-title', root);
    if (ttl) {
      if (!ttl.getAttribute('data-t0')) ttl.setAttribute('data-t0', ttl.textContent);
      var hasSize = !!document.querySelector('[data-rd-head]:not(.rd-rhd--nosize)');
      ttl.textContent = onResults ? (hasSize ? 'Change size' : 'Find your size') : ttl.getAttribute('data-t0');
    }
    st = fresh(opts.tab === 'vehicle' ? 'vehicle' : 'size');
    modal.st = st;
    prefill();
    // v16 fix1: render() keeps a typed value from the field on screen; a
    // new opening starts from the page's size, never last time's typing.
    if (modal.compact && bodyEl) bodyEl.innerHTML = '';
    root.hidden = false;
    document.documentElement.classList.add('pss-lock');
    $all('[data-pt-size-sheet]').forEach(function (b) { if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', 'true'); });
    if (st.tab === 'vehicle') setTab('vehicle'); else render(false);
    loadSizes().then(function () { use(modal); if (!root.hidden) refreshSize(); });
    var t = $('[data-pss-tab="' + st.tab + '"]', root);
    setTimeout(function () {
      // Compact: focus starts in the size field (caret at the end).
      var f = modal.compact && st.tab === 'size' ? $('[data-pss-find]', root) : null;
      if (f) { try { f.focus({ preventScroll: true }); f.setSelectionRange(f.value.length, f.value.length); } catch (e) { f.focus(); } }
      else if (t) t.focus();
    }, 30);
  }

  /* ── v16 desktop "Change size" popover (tire results) ──
     440 wide, 8 under the button, no scrim. role="dialog"; Esc, a click
     outside or focus leaving it close it, and focus returns to the button. */
  var popWrap = null, popAnchor = null;
  var TABBABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';
  function tabbables(box) {
    return $all(TABBABLE, box).filter(function (el) {
      if (el.tabIndex < 0 || el.hidden) return false;
      if (el.closest && el.closest('[hidden], [inert]')) return false;
      return el.offsetParent !== null || el === document.activeElement;
    });
  }
  // The first control after `anc` in the page's own Tab order (the popover itself excluded).
  function afterInPage(anc) {
    if (!anc) return null;
    var all = tabbables(document).filter(function (el) { return !(popWrap && popWrap.contains(el)); });
    for (var i = 0; i < all.length; i++) {
      if (all[i] !== anc && (anc.compareDocumentPosition(all[i]) & Node.DOCUMENT_POSITION_FOLLOWING) && !anc.contains(all[i])) return all[i];
    }
    return null;
  }
  function popPlace() {
    if (!popWrap || !popAnchor) return;
    var r = popAnchor.getBoundingClientRect();
    var w = popWrap.offsetWidth || 440;
    var left = Math.max(16, Math.min(r.left, document.documentElement.clientWidth - w - 16));
    popWrap.style.top = Math.round(r.bottom + window.scrollY + 8) + 'px';
    popWrap.style.left = Math.round(left + window.scrollX) + 'px';
  }
  function popClose(refocus) {
    if (!popWrap || popWrap.hidden) return;
    popWrap.hidden = true;
    clearTimeout(countTimer);
    if (popAnchor) {
      popAnchor.setAttribute('aria-expanded', 'false');
      if (refocus !== false && popAnchor.focus) { try { popAnchor.focus({ preventScroll: true }); } catch (e) { popAnchor.focus(); } }
    }
  }
  function pop(anchor, opts) {
    opts = opts || {};
    if (popWrap && !popWrap.hidden && popAnchor === anchor) { popClose(); return; }
    if (!popWrap) {
      popWrap = document.createElement('div');
      popWrap.className = 'pss-popwrap';
      popWrap.setAttribute('role', 'dialog');
      popWrap.setAttribute('aria-label', 'Change size');
      popWrap.hidden = true;
      document.body.appendChild(popWrap);
      popWrap.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); popClose(); return; }
        // v16 fix1: the popover sits at the end of <body>, so Tab past its
        // last control (or Shift+Tab before its first) closes it and goes
        // on from the Change size button, as if it sat right after it.
        if (e.key !== 'Tab') return;
        var f = tabbables(popWrap);
        if (!f.length) return;
        var a = document.activeElement;
        if (e.shiftKey && (a === f[0] || a === popWrap)) {
          e.preventDefault();
          popClose(true);
        } else if (!e.shiftKey && a === f[f.length - 1]) {
          e.preventDefault();
          var anc = popAnchor;
          popClose(false);
          var nx = afterInPage(anc);
          if (nx) { try { nx.focus(); } catch (x) {} } else if (anc) anc.focus();
        }
      });
      var popDown = false;
      document.addEventListener('mousedown', function (e) {
        if (!popWrap || popWrap.hidden) return;
        if (popWrap.contains(e.target) || (popAnchor && popAnchor.contains(e.target))) { popDown = true; setTimeout(function () { popDown = false; }, 400); return; }
        popClose(false);
      }, true);
      popWrap.addEventListener('focusout', function (e) {
        var to = e.relatedTarget;
        if (to && !popWrap.contains(to) && !(popAnchor && popAnchor.contains(to))) { popClose(false); return; }
        // Focus went nowhere (e.g. to the page): close, unless a click inside
        // or a redraw (the focused control left the DOM) caused it.
        if (!to) {
          var gone = e.target && !document.contains(e.target);
          setTimeout(function () {
            if (!popWrap || popWrap.hidden || popDown || gone) return;
            var ae = document.activeElement;
            if (ae && (popWrap.contains(ae) || (popAnchor && popAnchor.contains(ae)))) return;
            popClose(false);
          }, 0);
        }
      });
      window.addEventListener('resize', function () { if (popWrap && !popWrap.hidden) popPlace(); });
    }
    popAnchor = anchor;
    var v = buildInline('rpop', true);
    v.used = true;
    if (v.root.parentNode !== popWrap) popWrap.appendChild(v.root);
    use(v);
    v.surface = opts.surface || 'results_bar';
    st = fresh(opts.tab === 'vehicle' ? 'vehicle' : 'size');
    v.st = st;
    lastSaid = null;
    prefill();
    if (bodyEl) bodyEl.innerHTML = ''; // start from the page's size (fix1)
    popWrap.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    if (st.tab === 'vehicle' && !st._years) setTab('vehicle'); else render(false);
    popPlace();
    loadSizes().then(function () { use(v); if (!popWrap.hidden) refreshSize(); });
    setTimeout(function () {
      use(v);
      var f = $('[data-pss-find]', v.root) || $('[data-pss-tab="' + st.tab + '"]', v.root);
      if (f) { try { f.focus({ preventScroll: true }); if (f.setSelectionRange) f.setSelectionRange(f.value.length, f.value.length); } catch (e) { f.focus(); } }
    }, 20);
    return v.root;
  }
  // The search icon a shopper can actually see (desktop or phone header).
  function visibleSearchTrigger() {
    var list = $all('[data-pt-search-trigger]');
    for (var i = 0; i < list.length; i++) if (list[i].offsetParent !== null) return list[i];
    return null;
  }
  // "Don't see your size? Type it": hand over to the header search box,
  // which reads any typed size. Without it, follow the link to the hub.
  function typeIt(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Inside another popup the header search is underneath it: just follow
    // the link (the Shop by size hub, which has its own size box).
    if (view && view.inline) return;
    var trig = visibleSearchTrigger();
    if (!trig || !document.getElementById('pt-header-search-overlay')) return;
    e.preventDefault();
    opener = null;
    backup = null;
    close();
    trig.click();
  }
  function close() {
    if (!modal) return;
    use(modal);
    if (!root || root.hidden) return;
    root.hidden = true;
    document.documentElement.classList.remove('pss-lock');
    clearTimeout(countTimer);
    if (countCtl) { try { countCtl.abort(); } catch (e) {} }
    $all('[data-pt-size-sheet]').forEach(function (b) { if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', 'false'); });
    var back = opener;
    opener = null;
    if (!(back && back.focus && document.contains(back) && back.offsetParent !== null)) back = backup;
    backup = null;
    if (back && back.focus && document.contains(back) && back.offsetParent !== null) back.focus();
  }

  // Any [data-pt-size-sheet] opens the sheet. Ctrl / cmd-click on a link keeps
  // the browser's own behaviour (its href is the Shop by size hub).
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-pt-size-sheet]');
    if (!t) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button && e.button !== 0)) return;
    e.preventDefault();
    var op = t;
    // From the header search overlay: close it first. Its close() focuses
    // the FIRST search icon, which is hidden on phones, so the opener is the
    // search icon the shopper can see (desktop or phone header).
    var ov = t.closest('#pt-header-search-overlay');
    if (ov) {
      var x = ov.querySelector('[data-pt-search-close]');
      if (x) x.click();
      op = visibleSearchTrigger() || t;
    }
    if (t.hasAttribute('data-pss-pop') && window.matchMedia && window.matchMedia('(min-width: 990px)').matches) {
      pop(t, { surface: 'results_bar' });
      return;
    }
    open({ opener: op, tab: t.getAttribute('data-pt-size-sheet') === 'vehicle' ? 'vehicle' : 'size' });
    // If the opener is hidden by the time the sheet closes (e.g. a link
    // inside a panel that closed), focus goes to the visible search icon.
    backup = visibleSearchTrigger();
  });
  // Warm the size index on first touch of a trigger so the first tap is fast.
  ['pointerdown', 'focusin'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (e.target.closest && e.target.closest('[data-pt-size-sheet]')) loadSizes();
    }, { passive: true });
  });

  function inline(host, opts) {
    opts = opts || {};
    var v = buildInline(opts.id, !!opts.compact);
    var first = !v.used;
    v.used = true;
    if (host && v.root.parentNode !== host) host.appendChild(v.root);
    use(v);
    if (opts.surface) v.surface = opts.surface;
    if (first || opts.reset) {
      st = fresh(opts.tab === 'vehicle' ? 'vehicle' : 'size');
      v.st = st;
      lastSaid = null;
      if (opts.prefill) prefill(); // the results bar opens on the size shown
    }
    if (st.tab === 'vehicle' && !st._years) setTab('vehicle'); else render(false);
    loadSizes().then(function () { use(v); if (document.contains(v.root)) refreshSize(); });
    return v.root;
  }

  window.PTSizeSheet = { open: open, close: close, inline: inline, pop: pop, closePop: popClose, parseSize: parseSize, formatSize: fmt };
  // Size helpers for the staggered-set code (stage 8 vehicle pairs):
  // parse("245/40ZR18 97W") -> { kind, w, a, r } | null, format(z) -> "245/40R18".
  if (!window.PTPair) window.PTPair = { parse: function (s) { return parseTyped(s); }, format: fmt };
})();
