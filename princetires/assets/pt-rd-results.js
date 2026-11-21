/* =====================================================================
   pt-rd-results.js - tire + wheel RESULTS pages (redesign 2026-11-13)
   Loaded (defer) by sections/pt-collection-grid.liquid. Markup:
   sections/pt-collection-header.liquid, snippets/pt-collection-sidebar,
   pt-rd-results-facet, pt-collection-card.

   What it does
   - Filters: every option is already a working Shopify filter link. Here:
     multi-value options (data-vs), "Hide sold out" (stock=all, the contract
     pt-collection-stock reads), price presets and Min/Max, accordions that
     remember what the shopper opened, option search, "Show more", sorting.
   - Phone drawer: taps are collected, the count is fetched from the header
     section (Section Rendering API, data-rd-count) and one "Show N tires"
     button applies them all (replaces pt-filter-ux's batching).
   - Header: Change size / Find your size opens the Find your size sheet
     (assets/pt-size-sheet.js) - or, if that did not load, the old size
     panel; Shop by vehicle (wheels) opens the panel. Tabs keep other
     filters (and tags), size title from the URL when the collection has no
     size facets.
   - Phones: floating "Filters · N | Sort" pill (SizeSheet.dc.html board 2).
   - Drawer: "Show N tires" counts the pending picks with sections/pt-rd-count
     and greys out options that would give 0 (counts are never shown).
   - Wheel Finish / Wheel type fallback: tags in the collection URL
     (/collections/wheels/gloss-black), see snippets/pt-rd-results-tagfacet.
   - Kept from the old grid script: sort, AJAX add to cart, "Fits your
     vehicle" check, scroll restoration, the navigation progress bar.
   - Phones: "Show more tires" appends the next page (not for wholesale
     customers: their prices are filled in by pt-header on page load only).
   - Staggered sets ("pair mode", 2026-11-15): with rear=275%2F35R18 in the
     URL, both sizes are fetched (Section Rendering, same filters) and the
     same tire model in both sizes becomes one set card (2 front + 2 rear).
     Tabs: Sets (front + rear) | Front only | Rear only. See the block at
     the end of this file.
   Every URL built here goes through window.PTRim.route (snippets/pt-rim-route).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__rdResults) return;
  window.__rdResults = true;

  var html = document.documentElement;
  var root = document.querySelector('[data-rd-results]');
  var head = document.querySelector('[data-rd-rhead]');
  var side = document.querySelector('[data-rd-filters]');
  var cfg = {};
  try { cfg = JSON.parse((document.querySelector('[data-rd-results-config]') || {}).textContent || '{}'); } catch (e) {}

  var MQ_DESK = window.matchMedia('(min-width: 990px)');
  var MQ_PHONE = window.matchMedia('(max-width: 749px)');
  var AV = 'filter.v.availability';
  var GTE = 'filter.v.price.gte';
  var LTE = 'filter.v.price.lte';
  var RIM = 'filter.p.m.custom.rim_diameter';
  var SEASON = 'filter.p.m.custom.seasonality';
  var pairMode = false; // staggered sets, set by the pair-mode block at the end
  var brandPair = null; // brand row hook for pair mode, set by the Shop by brand block
  var rerestore = null; // scroll restoration, run again after the pair render
  var unitOne = (root && root.getAttribute('data-unit')) || cfg.one || 'tire';
  var unitMany = (root && root.getAttribute('data-units')) || cfg.many || 'tires';

  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function cur() { return new URLSearchParams(window.location.search); }
  // v16 fix1: the inline flag (pt-collection-grid) holds the Liquid grid,
  // foot and Season items back while staggered sets may load (no jump).
  function pairDone() { if (root) root.classList.remove('rd-pairwait'); }
  function rimRoute(u) {
    try { return window.PTRim && window.PTRim.route ? window.PTRim.route(u) : u; } catch (e) { return u; }
  }
  /* Tags in the path: /collections/<handle>/<tag>+<tag> (collection tag URL,
     the wheel Finish / Wheel type fallback). cfg.collectionUrl has no tags. */
  var TAG_BASE = cfg.collectionUrl || '';
  function curTags() { return (cfg.tags || []).slice(); }
  function basePath() {
    var here = window.location.pathname;
    if (TAG_BASE && (here === TAG_BASE || here.indexOf(TAG_BASE + '/') === 0)) return TAG_BASE;
    return here;
  }
  function withTags(url, tags) {
    if (!tags || !tags.length) return url;
    var i = url.search(/[?#]/);
    var path = i === -1 ? url : url.slice(0, i);
    return path.replace(/\/$/, '') + '/' + tags.join('+') + (i === -1 ? '' : url.slice(i));
  }
  // tags: undefined = keep the page's tags, [] = none.
  function urlFor(p, path, tags) {
    var qs = p.toString();
    var t = tags === undefined ? curTags() : tags;
    return withTags(rimRoute((path || basePath()) + (qs ? '?' + qs : '')), t);
  }
  function modified(e) { return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button && e.button !== 0); }
  function progress() {
    if (document.querySelector('.rd-navprog')) return;
    var bar = document.createElement('div');
    bar.className = 'rd-navprog';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }
  function go(url) { progress(); window.location.href = url; }
  function plural(n) { return n === 1 ? unitOne : unitMany; }

  /* ── Sticky offsets: the site header (.pt-header) is position:fixed ── */
  (function () {
    var hdr = document.querySelector('.pt-header');
    if (!hdr || !root) return;
    function set() {
      var h = 0;
      // Bottom edge, not height: on desktop the scrolled header floats a
      // little below the top of the screen. A header slid out of view counts 0.
      try { if (getComputedStyle(hdr).position === 'fixed') h = Math.max(0, Math.round(hdr.getBoundingClientRect().bottom)); } catch (e) {}
      root.style.setProperty('--rd-res-sticky-top', h + 'px');
      // fix2: the page's scroll-padding-top (keyboard focus clears the header).
      if (root.classList.contains('rd-res--v16')) document.documentElement.style.setProperty('--rd-sp-top', h + 'px');
    }
    set();
    window.addEventListener('resize', set);
    window.addEventListener('scroll', function () { if (set.t) return; set.t = setTimeout(function () { set.t = 0; set(); }, 200); }, { passive: true });
  })();

  /* ── Desktop size search ──
     Tire pages (v16): a page WITH a size shows no search band at all (the
     H1 + "Change size" popover do the job). A page with NO size gets one
     quiet search row under the head (PTSizeSheet.inline, compact). The old
     header band ([data-rd-sizebar]) is no longer mounted on tire pages. */
  var MQ_SIDE = window.matchMedia('(min-width: 1200px)');
  var IS_TIRES = !!(root && root.getAttribute('data-kind') === 'tires' && root.classList.contains('rd-res--v16'));
  (function () {
    if (!IS_TIRES) return;
    var q = document.querySelector('[data-rd-quiet]');
    if (!q) return;
    var qh = q.querySelector('[data-rd-quiet-host]');
    // The sheet's stylesheet loads async (media=print swap): mount only once
    // it applies, so the row never paints unstyled first (layout shift).
    var css = document.querySelector('link[data-pss-css]');
    function cssReady() { return !css || css.media === 'all' || !!(css.sheet && css.media !== 'print'); }
    if (css && !cssReady()) css.addEventListener('load', function () { setTimeout(sync, 0); });
    function ready() { return !!(window.PTSizeSheet && typeof window.PTSizeSheet.inline === 'function') && cssReady(); }
    function sync() {
      var on = MQ_DESK.matches && ready();
      if (on && !q.hasAttribute('data-on')) {
        var compact = typeof window.PTSizeSheet.pop === 'function';
        window.PTSizeSheet.inline(qh, compact ? { id: 'quiet', compact: true, prefill: true, surface: 'results_bar' } : { id: 'bar', prefill: true, surface: 'results_bar' });
        q.setAttribute('data-on', '');
      }
      on = on && q.hasAttribute('data-on');
      q.hidden = !on;
      root.classList.toggle('rd-res--quiet', on);
    }
    sync();
    if (!ready()) window.addEventListener('load', sync);
    if (MQ_DESK.addEventListener) MQ_DESK.addEventListener('change', sync); else if (MQ_DESK.addListener) MQ_DESK.addListener(sync);
  })();
  (function () {
    if (IS_TIRES) return;
    var bar = document.querySelector('[data-rd-sizebar]');
    var rh = document.querySelector('[data-rd-rhead]');
    if (!bar || !rh) return;
    var host = bar.querySelector('[data-rd-sizebar-host]');
    function ready() { return !!(window.PTSizeSheet && typeof window.PTSizeSheet.inline === 'function'); }
    function sync() {
      var on = MQ_DESK.matches && ready();
      if (on && !bar.hasAttribute('data-on')) {
        window.PTSizeSheet.inline(host, { id: 'bar', prefill: true, surface: 'results_bar' });
        bar.setAttribute('data-on', '');
      }
      on = on && bar.hasAttribute('data-on');
      bar.hidden = !on;
      rh.classList.toggle('rd-rh--bar', on);
    }
    sync();
    if (!ready()) window.addEventListener('load', sync);
    if (MQ_DESK.addEventListener) MQ_DESK.addEventListener('change', sync); else if (MQ_DESK.addListener) MQ_DESK.addListener(sync);
  })();

  /* ── Header: size title from the URL when the collection has no size facets ── */
  var panel = document.querySelector('[data-rd-panel]');
  var toggles = $all('[data-rd-panel-toggle]');
  // v16 buttons keep their icon: the words live in [data-rd-size-label].
  function setLabel(b, text) {
    var sp = b.querySelector('[data-rd-size-label]');
    if (sp) sp.textContent = text; else b.textContent = text;
  }
  (function () {
    var t = document.querySelector('[data-rd-size-fallback]');
    if (!t) return;
    var p = cur();
    var w = p.get('filter.p.m.custom.tire_width');
    var pr = p.get('filter.p.m.custom.tire_profile');
    var r = p.get(RIM);
    var size = '';
    if (w && pr && r) size = w + ((pr.indexOf('.') !== -1 || w.length <= 2) ? 'X' : '/') + pr + 'R' + r;
    else if (p.get('filter.p.m.custom.tire_size')) size = p.get('filter.p.m.custom.tire_size');
    if (!size) return;
    t.textContent = size;
    toggles.forEach(function (b) { b.setAttribute('data-label-closed', 'Change size'); setLabel(b, 'Change size'); });
    if (panel) panel.setAttribute('data-default-open', 'no');
  })();

  /* ── Header: Change size / Shop by vehicle panel ── */
  function setPanel(open, focus) {
    if (!panel) return;
    panel.hidden = !open;
    toggles.forEach(function (b) {
      b.setAttribute('aria-expanded', String(open));
      setLabel(b, open ? (b.getAttribute('data-label-open') || 'Close') : (b.getAttribute('data-label-closed') || b.textContent));
    });
    if (open && focus) {
      var f = panel.querySelector('select:not([disabled]), input, button:not([disabled])');
      if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
      panel.scrollIntoView({ block: 'nearest' });
    }
  }
  // Tires: the Find your size sheet takes the button (its own document click
  // listener opens it). The panel stays as the fallback when the sheet's
  // script is missing.
  function sheetFor(b) { return !!(window.PTSizeSheet && b && b.hasAttribute('data-pt-size-sheet')); }
  var sheetTakes = toggles.some(sheetFor);
  toggles.forEach(function (b) {
    if (sheetFor(b)) { b.removeAttribute('aria-controls'); b.setAttribute('aria-haspopup', 'dialog'); }
    b.addEventListener('click', function () {
      if (sheetFor(b)) return;
      setPanel(panel ? panel.hidden : false, true);
    });
  });
  if (panel && !sheetTakes && panel.getAttribute('data-default-open') === 'desktop' && MQ_DESK.matches) setPanel(true, false);

  /* ── Wheels: fit confirmation after a by-vehicle search (WheelResults) ──
     snippets/pt-wheel-search saves the car and the bolt values it applied
     (sessionStorage 'pt-ws-fit'). Shown, and the H1 says "Wheels for your
     2021 Honda CR-V", only while the bolt filter is still exactly that set. */
  (function () {
    if (!root || root.getAttribute('data-kind') !== 'wheels') return;
    var slot = document.querySelector('[data-rd-ws-msg]');
    if (!slot) return;
    var v = null;
    try { v = JSON.parse(sessionStorage.getItem('pt-ws-fit') || 'null'); } catch (e) { v = null; }
    if (!v || !v.label || !v.bolt || !v.bolts || !v.bolts.length) return;
    var have = cur().getAll('filter.p.m.custom.bolt_pattern');
    if (have.length !== v.bolts.length || !v.bolts.every(function (b) { return have.indexOf(b) !== -1; })) return;
    var box = document.createElement('p');
    box.className = 'rd-rh__fit';
    box.setAttribute('role', 'status');
    box.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' +
      '<span>Showing wheels with the <b></b> bolt pattern your <span></span> uses. We check fit again before we mount them.</span>';
    box.querySelector('b').textContent = String(v.bolt);
    box.querySelector('span span').textContent = String(v.label);
    slot.insertBefore(box, slot.firstChild);
    var h1 = document.querySelector('[data-rd-title]');
    if (h1) h1.textContent = 'Wheels for your ' + v.label;
  })();

  /* ── Header tabs keep the shopper's other filters ── */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-rd-tabs] a[data-rd-tab]');
    if (!a || modified(e)) return;
    var nav = a.closest('[data-rd-tabs]');
    var kind = nav.getAttribute('data-rd-tabs');
    var v = a.getAttribute('data-rd-tab');
    var p = cur();
    p.delete('page');
    e.preventDefault();
    if (kind === 'season') {
      p.delete(SEASON);
      if (v) p.append(SEASON, v);
      go(urlFor(p));
    } else if (kind === 'rimfacet') {
      p.delete(RIM);
      if (v) p.append(RIM, v);
      go(urlFor(p));
    } else {
      // Wheel diameter: the whole catalogue, routed into wheels-NN-inch.
      p.delete(RIM);
      if (v) p.append(RIM, v);
      go(urlFor(p, '/collections/wheels'));
    }
  });

  /* ── Filters: accordions (remember what the shopper opened) ── */
  var OPEN_KEY = 'rd_fopen:' + window.location.pathname;
  var openState = {};
  try { openState = JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}') || {}; } catch (e) { openState = {}; }
  $all('.rd-fside .rd-fgroup').forEach(function (g) {
    var id = g.getAttribute('data-rd-group');
    var btn = g.querySelector('.rd-acc__head');
    if (!btn) return;
    var hasActive = !!g.querySelector('[aria-checked="true"]');
    if (id && Object.prototype.hasOwnProperty.call(openState, id) && !hasActive) {
      btn.setAttribute('aria-expanded', openState[id] ? 'true' : 'false');
    }
    // v16 fix1: a picked brand leaves the Brand group closed beside the
    // brand slider (>= 1200; its summary names the brand). The phone sheet
    // and the 990-1199 drawer still open on it. Liquid renders it closed.
    if (IS_TIRES && id === 'brand' && hasActive) {
      var brandOpen = function () {
        if (Object.prototype.hasOwnProperty.call(openState, id)) btn.setAttribute('aria-expanded', openState[id] ? 'true' : 'false');
        else btn.setAttribute('aria-expanded', MQ_SIDE.matches ? 'false' : 'true');
      };
      brandOpen();
      if (MQ_SIDE.addEventListener) MQ_SIDE.addEventListener('change', brandOpen); else if (MQ_SIDE.addListener) MQ_SIDE.addListener(brandOpen);
    }
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      if (id) {
        openState[id] = open;
        try { sessionStorage.setItem(OPEN_KEY, JSON.stringify(openState)); } catch (e) {}
      }
    });
  });

  /* ── Filters: sort options, "Show more", option search ── */
  $all('[data-rd-opts]').forEach(function (box) {
    // data-rd-optsort (v16; was data-rd-sort, which the Sort handler also binds).
    var mode = box.getAttribute('data-rd-optsort') || box.getAttribute('data-rd-sort');
    var items = $all(':scope > a', box);
    if (mode && items.length > 1) {
      var key = mode === 'n' ? 'data-n' : mode === 'num' ? 'data-num' : 'data-ord';
      items.sort(function (a, b) {
        var x = parseFloat(a.getAttribute(key)) || 0;
        var y = parseFloat(b.getAttribute(key)) || 0;
        return mode === 'n' ? y - x : x - y;
      });
      items.forEach(function (el) { box.appendChild(el); });
    }
    var limit = parseInt(box.getAttribute('data-rd-limit'), 10) || 0;
    var group = box.closest('.rd-fgroup') || box.parentNode;
    var more = group.querySelector('[data-rd-more]');
    var search = group.querySelector('[data-rd-fsearch]');
    var expanded = false;
    function applyLimit() {
      var over = 0;
      items.forEach(function (el, i) {
        var hide = !expanded && limit > 0 && i >= limit && el.getAttribute('aria-checked') !== 'true';
        el.classList.toggle('is-hidden', hide);
        if (hide) over++;
      });
      if (!more) return;
      if (limit <= 0 || items.length <= limit) { more.hidden = true; return; }
      more.hidden = false;
      var noun = more.getAttribute('data-noun') || 'options';
      if (expanded) more.textContent = 'Show fewer';
      else if (more.getAttribute('data-kind') === 'all') more.textContent = 'Show all ' + items.length + ' ' + noun;
      else if (more.getAttribute('data-kind') === 'plain') more.textContent = 'Show all ' + noun;
      else more.textContent = 'Show ' + over + ' more ' + noun;
      more.setAttribute('aria-expanded', String(expanded));
      if (!expanded && over === 0) more.hidden = true;
    }
    applyLimit();
    if (more) more.addEventListener('click', function () { expanded = !expanded; applyLimit(); });
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase();
        if (!q) { applyLimit(); return; }
        items.forEach(function (el) {
          var t = (el.getAttribute('data-label') || el.textContent || '').toLowerCase();
          el.classList.toggle('is-hidden', t.indexOf(q) === -1);
        });
        if (more) more.hidden = true;
      });
    }
  });

  /* ── Filters: state, phone batching ── */
  var pend = null;
  var pendTags = null; // tag handles picked in the drawer, not applied yet
  var opener = null;
  var applyBtn = document.querySelector('[data-rd-apply]');
  var openBtns = $all('[data-rd-fopen]');
  var countTimer = null;
  var countCtl = null;
  function drawerOpen() { return !!(side && side.classList.contains('is-open')); }
  function pending() { if (!pend) pend = cur(); return pend; }
  function pendingTags() { if (!pendTags) pendTags = curTags(); return pendTags; }
  function tagsNow() { return pendTags || curTags(); }
  // A tag option: toggle its handle; one tag per exclusive group (data-tag-x)
  // because Shopify ANDs the tags in the path.
  function applyTag(a, tags) {
    var h = a.getAttribute('data-tag');
    var i = tags.indexOf(h);
    if (i !== -1) { tags.splice(i, 1); return tags; }
    var x = a.getAttribute('data-tag-x');
    if (x && side) {
      $all('a[data-tag-x="' + x + '"]', side).forEach(function (o) {
        var j = tags.indexOf(o.getAttribute('data-tag'));
        if (j !== -1) tags.splice(j, 1);
      });
    }
    tags.push(h);
    return tags;
  }
  function checked(a) { return a.getAttribute('aria-checked') === 'true'; }
  // Filter options: checkboxes, the v16 price presets (radio) and the sold-out switch.
  var OPT_SEL = 'a[role="checkbox"], a[role="radio"], a[role="switch"]';
  function setChecked(a, on) { a.setAttribute('aria-checked', on ? 'true' : 'false'); }
  function valuesOf(a) {
    var vs = a.getAttribute('data-vs');
    return vs ? vs.split('|') : [a.getAttribute('data-v')];
  }
  // "$1,200.50" -> "1200". Whole dollars: Min rounds down, Max rounds up, so
  // a typed 99.99 never becomes 9999.
  function dollars(s, up) {
    var n = parseFloat(String(s || '').replace(/[$,\s]/g, ''));
    if (!isFinite(n) || n < 0) return '';
    return String(up ? Math.ceil(n) : Math.floor(n));
  }

  function applyOption(a, p) {
    p.delete('page');
    var on = checked(a);
    if (a.hasAttribute('data-rd-instock')) {
      p.delete(AV);
      // v16 switch "Show sold-out tires": checked = showing them (stock=all).
      var showAll = a.hasAttribute('data-rd-switch') ? !on : on;
      if (showAll) { p.set('stock', 'all'); }
      else { p.delete('stock'); p.append(AV, '1'); }
      return;
    }
    if (a.hasAttribute('data-rd-preset')) {
      p.delete(GTE); p.delete(LTE);
      if (!on) {
        if (a.getAttribute('data-gte')) p.set(GTE, a.getAttribute('data-gte'));
        if (a.getAttribute('data-lte')) p.set(LTE, a.getAttribute('data-lte'));
      }
      return;
    }
    var k = a.getAttribute('data-k');
    if (!k) return;
    var vs = valuesOf(a);
    var all = p.getAll(k);
    p.delete(k);
    if (on) {
      // Bolt patterns share values ("5x127/5x139.7" is in both 5x127 and
      // 5x139.7): unticking one keeps what another ticked option still needs.
      var keep = [];
      var box = a.closest('[data-rd-opts]');
      if (box) $all('a[role="checkbox"][aria-checked="true"]', box).forEach(function (o) {
        if (o !== a && o.getAttribute('data-k') === k) valuesOf(o).forEach(function (v) { keep.push(v); });
      });
      all = all.filter(function (x) { return vs.indexOf(x) === -1 || keep.indexOf(x) !== -1; });
    } else vs.forEach(function (v) { if (all.indexOf(v) === -1) all.push(v); });
    all.forEach(function (x) { p.append(k, x); });
  }

  // Paint every option, summary and the price boxes from a set of params.
  function syncUI(p) {
    if (!side) return;
    var tg = tagsNow();
    $all(OPT_SEL, side).forEach(function (a) {
      var on;
      if (a.hasAttribute('data-tag')) on = tg.indexOf(a.getAttribute('data-tag')) !== -1;
      else if (a.hasAttribute('data-rd-instock')) {
        on = p.getAll(AV).indexOf('1') !== -1;
        if (a.hasAttribute('data-rd-switch')) on = !on;
      }
      else if (a.hasAttribute('data-rd-preset')) on = (p.get(GTE) || '') === (a.getAttribute('data-gte') || '') && (p.get(LTE) || '') === (a.getAttribute('data-lte') || '') && !!(p.get(GTE) || p.get(LTE));
      else {
        var have = p.getAll(a.getAttribute('data-k'));
        var has = function (v) { return have.indexOf(v) !== -1; };
        // data-all (bolt patterns): on only when every value of the pattern is
        // applied, and a pattern with no single value of its own (data-exact
        // missing, e.g. 8x170) is not on when ticked patterns pulled it in.
        if (a.hasAttribute('data-all')) {
          on = valuesOf(a).every(has);
          if (on && !a.hasAttribute('data-exact')) {
            var box = a.closest('[data-rd-opts]');
            var pulled = [];
            if (box) $all('a[data-all][data-exact]', box).forEach(function (o) {
              if (o.getAttribute('data-k') === a.getAttribute('data-k') && valuesOf(o).every(has)) pulled = pulled.concat(valuesOf(o));
            });
            if (valuesOf(a).every(function (v) { return pulled.indexOf(v) !== -1; })) on = false;
          }
        } else on = valuesOf(a).some(has);
      }
      setChecked(a, on);
    });
    var mn = side.querySelector('[data-rd-pmin]');
    var mx = side.querySelector('[data-rd-pmax]');
    if (mn) mn.value = p.get(GTE) || '';
    if (mx) mx.value = p.get(LTE) || '';
    $all('.rd-fgroup', side).forEach(function (g) {
      var sum = g.querySelector('[data-rd-sum]');
      if (!sum) return;
      var txt;
      if (g.getAttribute('data-rd-group') === 'price') {
        var a = p.get(GTE), b = p.get(LTE);
        var tiresUp = root && root.getAttribute('data-kind') === 'tires' && !(b === '150' && !a);
        txt = a && b ? '$' + a + ' – $' + b : a ? '$' + a + ' and up' : b ? (tiresUp ? 'Up to $' : 'Under $') + b : '';
      } else {
        txt = $all('a[aria-checked="true"]', g).map(function (o) { return o.getAttribute('data-label') || o.textContent.trim(); }).join(', ');
      }
      if (!txt && IS_TIRES) sum.innerHTML = '<span class="rd-acc__any">Any</span>';
      else sum.textContent = txt || sum.getAttribute('data-any') || 'Any';
    });
  }

  function label(n) {
    if (!applyBtn) return;
    applyBtn.classList.toggle('is-zero', n === 0);
    if (n === 0) applyBtn.textContent = 'No ' + unitMany + ' match, try fewer filters';
    // Pair mode: the number of sets is only known once both sizes are
    // paired, so no number (never the front count passed off as sets).
    else if (pairMode) applyBtn.textContent = 'Show sets';
    else if (n == null) applyBtn.textContent = 'Show ' + unitMany;
    else applyBtn.textContent = 'Show ' + Number(n).toLocaleString('en-CA') + ' ' + (n === 1 ? 'result' : 'results');
  }
  // Counts for the pending picks come from sections/pt-rd-count (a few
  // hundred bytes): the total for the button, and Shopify's own count per
  // filter value, used ONLY to grey out options that would give 0. If that
  // section is missing, the header section's data-rd-count still gives the
  // total.
  function readCountJson(t) {
    var m = /<script[^>]*data-rd-count-json[^>]*>([\s\S]*?)<\/script>/.exec(t || '');
    if (!m) return null;
    try { var j = JSON.parse(m[1]); return j && typeof j.n === 'number' ? j : null; } catch (e) { return null; }
  }
  function countFetch(url, sid) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'section_id=' + encodeURIComponent(sid);
    return fetch(url, countCtl ? { signal: countCtl.signal, credentials: 'same-origin' } : { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; });
  }
  function countLater() {
    if (!applyBtn || !pend) return;
    applyBtn.textContent = 'Updating…';
    applyBtn.setAttribute('aria-busy', 'true');
    clearTimeout(countTimer);
    countTimer = setTimeout(function () {
      var url = urlFor(pend, null, tagsNow());
      if (countCtl) { try { countCtl.abort(); } catch (e) {} }
      countCtl = window.AbortController ? new AbortController() : null;
      var sid = head && head.getAttribute('data-section-id');
      countFetch(url, 'pt-rd-count')
        .then(function (t) {
          var j = readCountJson(t);
          if (j) { grey(j); return j.n; }
          if (!sid) return null;
          return countFetch(url, sid).then(function (t2) {
            var m = /data-rd-count="(\d+)"/.exec(t2 || '');
            return m ? parseInt(m[1], 10) : null;
          });
        })
        .then(function (n) { applyBtn.removeAttribute('aria-busy'); label(n); })
        .catch(function (err) { if (!err || err.name !== 'AbortError') { applyBtn.removeAttribute('aria-busy'); label(null); } });
    }, 250);
  }
  // Grey out (aria-disabled) every unticked option whose values would give 0
  // with the pending picks. Groups where nothing is left say "None match".
  function grey(j) {
    if (!side) return;
    var map = {};
    (j.f || []).forEach(function (f) {
      var m = {};
      (f[1] || []).forEach(function (v) { m[String(v[0])] = +v[1] || 0; });
      map[f[0]] = m;
    });
    $all('.rd-fgroup', side).forEach(function (g) {
      var opts = $all('a[role="checkbox"][data-k]', g);
      if (!opts.length) return;
      var left = 0, known = 0;
      opts.forEach(function (a) {
        var m = map[a.getAttribute('data-k')];
        var zero = false;
        if (m && !checked(a)) {
          known++;
          zero = valuesOf(a).reduce(function (s, v) { return s + (m[v] || 0); }, 0) === 0;
        }
        if (!zero) left++;
        a.classList.toggle('is-zero', zero);
        if (zero) a.setAttribute('aria-disabled', 'true'); else a.removeAttribute('aria-disabled');
      });
      var none = known > 0 && left === 0;
      g.classList.toggle('is-none', none);
      var sum = g.querySelector('[data-rd-sum]');
      if (sum && none) sum.textContent = 'None match';
    });
  }
  function ungrey() {
    if (!side) return;
    $all('.is-zero', side).forEach(function (a) { a.classList.remove('is-zero'); a.removeAttribute('aria-disabled'); });
    $all('.rd-fgroup.is-none', side).forEach(function (g) { g.classList.remove('is-none'); });
  }

  var backdrop = document.querySelector('.rd-fdrawer__backdrop');
  function openDrawer() {
    if (!side) return;
    opener = document.activeElement;
    if (backdrop && IS_TIRES) backdrop.hidden = false;
    side.classList.add('is-open');
    side.setAttribute('role', 'dialog');
    side.setAttribute('aria-modal', 'true');
    html.classList.add('rd-lock', 'rd-filters-open');
    openBtns.forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    var x = side.querySelector('.rd-fside__close');
    if (x) x.focus();
  }
  function closeDrawer(discard) {
    if (!drawerOpen()) return;
    side.classList.remove('is-open');
    if (backdrop && IS_TIRES) backdrop.hidden = true;
    side.removeAttribute('role');
    side.removeAttribute('aria-modal');
    html.classList.remove('rd-lock', 'rd-filters-open');
    openBtns.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    if (discard && (pend || pendTags)) { pend = null; pendTags = null; ungrey(); syncUI(cur()); label(countNow()); }
    if (opener && opener.focus) opener.focus();
  }
  function countNow() {
    var c = head && head.querySelector('[data-rd-count]');
    return c ? parseInt(c.getAttribute('data-rd-count'), 10) : null;
  }
  openBtns.forEach(function (b) { b.addEventListener('click', openDrawer); });
  $all('[data-rd-fclose]').forEach(function (b) { b.addEventListener('click', function () { closeDrawer(true); }); });
  if (applyBtn) applyBtn.addEventListener('click', function () {
    if (!pend && !pendTags) { closeDrawer(false); return; }
    if (applyBtn.classList.contains('is-zero')) return;
    applyBtn.textContent = 'Loading…';
    go(urlFor(pend || cur(), null, tagsNow()));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawerOpen()) { closeDrawer(true); return; }
    // Keep Tab inside the open drawer.
    if (e.key === 'Tab' && drawerOpen()) {
      var f = $all('a[href]:not(.is-hidden), button:not([disabled]):not([hidden]), input:not([type="hidden"]), select', side).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // Tire pages fold the sidebar into the sheet below 1200px (v16), other pages below 990px.
  var MQ_DRAWER_OFF = IS_TIRES ? MQ_SIDE : MQ_DESK;
  var onMq = function () { if (MQ_DRAWER_OFF.matches) closeDrawer(true); };
  if (MQ_DRAWER_OFF.addEventListener) MQ_DRAWER_OFF.addEventListener('change', onMq); else if (MQ_DRAWER_OFF.addListener) MQ_DRAWER_OFF.addListener(onMq);

  // Option links: navigate now (desktop) or collect (phone drawer).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-rd-filters] a[role="checkbox"], [data-rd-filters] a[role="radio"], [data-rd-filters] a[role="switch"]');
    if (!a || modified(e)) return;
    e.preventDefault();
    var batch = drawerOpen();
    if (batch && a.getAttribute('aria-disabled') === 'true') return; // would give 0
    var p = batch ? pending() : cur();
    if (a.hasAttribute('data-tag')) {
      p.delete('page');
      var tags = applyTag(a, batch ? pendingTags() : curTags());
      if (batch) { syncUI(p); countLater(); }
      else { setChecked(a, !checked(a)); go(urlFor(p, null, tags)); }
      return;
    }
    applyOption(a, p);
    if (batch) { syncUI(p); countLater(); }
    else { setChecked(a, !checked(a)); go(urlFor(p)); }
  });
  // role="checkbox" answers the Space key too.
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Spacebar') return;
    var a = e.target.closest && e.target.closest('[data-rd-filters] a[role="checkbox"], [data-rd-filters] a[role="radio"], [data-rd-filters] a[role="switch"]');
    if (!a) return;
    e.preventDefault();
    a.click();
  });

  // v16 tires: "Custom range" reveals the Min / Max form.
  $all('[data-rd-custom]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = document.getElementById(b.getAttribute('aria-controls'));
      if (!f) return;
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      f.hidden = !open;
      if (open) { var i = f.querySelector('input:not([type="hidden"])'); if (i) i.focus(); }
    });
  });

  // Price Min / Max.
  $all('[data-rd-price]').forEach(function (form) {
    var mn = form.querySelector('[data-rd-pmin]');
    var mx = form.querySelector('[data-rd-pmax]');
    function setPrice(p) {
      var a = dollars(mn && mn.value, false), b = dollars(mx && mx.value, true);
      if (a && b && parseInt(a, 10) > parseInt(b, 10)) { var t = a; a = b; b = t; }
      p.delete(GTE); p.delete(LTE); p.delete('page');
      if (a) p.set(GTE, a);
      if (b) p.set(LTE, b);
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var batch = drawerOpen();
      var p = batch ? pending() : cur();
      setPrice(p);
      if (batch) { syncUI(p); countLater(); } else go(urlFor(p));
    });
    [mn, mx].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('change', function () {
        if (!drawerOpen()) return;
        var p = pending();
        setPrice(p);
        syncUI(p);
        countLater();
      });
    });
  });

  // Clear all: drawer = clear the picks; page = reload with only the sort.
  // The tire size / wheel diameter stay: they are the black header's (title,
  // Change size, diameter tabs), not drawer filters, and dropping the rim on
  // a tires-NN-inch page would route to the 5,000+ /collections/tires.
  // rear (a staggered set's rear size) stays too: it is part of the size.
  var KEEP_ON_CLEAR = ['filter.p.m.custom.tire_width', 'filter.p.m.custom.tire_profile', RIM, 'filter.p.m.custom.tire_size', 'rear', 'view'];
  $all('[data-rd-clear]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (modified(e)) return;
      e.preventDefault();
      var c = cur();
      var p = new URLSearchParams();
      KEEP_ON_CLEAR.forEach(function (k) { c.getAll(k).forEach(function (v) { p.append(k, v); }); });
      if (c.get('sort_by')) p.set('sort_by', c.get('sort_by'));
      // The stock choice stays: "Show sold-out tires" on = stock=all.
      if (IS_TIRES && c.get('stock') === 'all') p.set('stock', 'all');
      else p.append(AV, '1'); // the site default (pt-collection-stock)
      if (drawerOpen()) { pend = p; pendTags = []; syncUI(p); countLater(); return; }
      go(urlFor(p, null, []));
    });
  });

  // Sidebar "Find your size" (collections too big for Shopify's filters).
  $all('[data-rd-panel-open]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      closeDrawer(true);
      if (sheetFor(b)) {
        e.stopPropagation(); // the sheet's own listener would open it a second time
        window.PTSizeSheet.open({ opener: document.activeElement });
        return;
      }
      setPanel(true, true);
    });
  });

  /* ── Phones / tablets: floating "Filters · N | Sort" pill ──
     Shown by JS only (the sticky bar above works without it), sits above the
     mobile tab bar (#pt-sticky-bar) when that is on screen. */
  (function () {
    var fab = document.querySelector('[data-rd-fab]');
    if (!fab || !root) return;
    fab.hidden = false;
    root.classList.add('rd-res--fab');
    var bar = document.getElementById('pt-sticky-bar');
    var pwa = document.getElementById('pt-pwa-install');
    function place() {
      var h = 0;
      if (bar) {
        try {
          var cs = getComputedStyle(bar);
          if (cs.display !== 'none' && cs.visibility !== 'hidden') h = Math.round(bar.getBoundingClientRect().height);
        } catch (e) {}
      }
      // v16 fix1: the "Install Prince Tires" banner (fixed, bottom 12) sits
      // over the tab bar; while it is open the pill rides above it.
      if (pwa && IS_TIRES) {
        try {
          var ps = getComputedStyle(pwa);
          if (!pwa.hidden && pwa.classList.contains('is-open') && ps.display !== 'none' && ps.visibility !== 'hidden') {
            h = Math.max(h, Math.round(pwa.offsetHeight + (parseFloat(ps.bottom) || 0)));
          }
        } catch (e) {}
      }
      root.style.setProperty('--rd-fab-bottom', h + 'px');
      // fix2: the page's scroll-padding-bottom follows the pill (WCAG 2.4.11).
      if (IS_TIRES) document.documentElement.style.setProperty('--rd-sp-bot', h + 'px');
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    if (pwa && IS_TIRES && window.MutationObserver) {
      try { new MutationObserver(place).observe(pwa, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] }); } catch (e) {}
    }
  })();

  /* ── v16 tire pages: sticky phone head, quick row ── */
  (function () {
    if (!IS_TIRES) return;
    // Phone head sticks to the top; once stuck it gets a hairline and a
    // smaller H1 (the count line hides). A sentinel just above it says when.
    var headEl = document.querySelector('[data-rd-head]');
    var sentinel = document.querySelector('[data-rd-head-sentinel]');
    if (headEl && sentinel && window.IntersectionObserver) {
      try {
        new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            var stick = !en.isIntersecting && en.boundingClientRect.top < 0;
            if (stick === headEl.classList.contains('is-stuck')) return;
            // v16 fix1: the stuck head is shorter (60); the height it loses
            // becomes bottom margin, so the cards below never jump.
            var h0 = headEl.offsetHeight;
            headEl.classList.toggle('is-stuck', stick);
            if (stick && !MQ_DESK.matches) {
              var d = h0 - headEl.offsetHeight;
              headEl.style.marginBottom = d > 0 ? d + 'px' : '';
            } else headEl.style.marginBottom = '';
          });
        }, { rootMargin: '0px', threshold: 0 }).observe(sentinel);
      } catch (e) {}
    }
    // Season quick items are links with role="button" + aria-pressed: Space works too.
    document.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Spacebar') return;
      var a = e.target.closest && e.target.closest('.rd-q[role="button"]');
      if (!a) return;
      e.preventDefault();
      a.click();
    });
    function track(ev, d) { try { if (window.PTTrack && window.PTTrack.push) window.PTTrack.push(ev, d); } catch (e) {} }
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-rd-quick] .rd-q--season, [data-rd-quick] .rd-brand');
      if (!a || modified(e) || e.defaultPrevented) return;
      if (MQ_DESK.matches) return;
      var season = a.hasAttribute('data-rd-qseason');
      track('pt_quick_filter', { kind: season ? 'season' : 'brand', value: season ? a.getAttribute('data-rd-qseason') : (a.getAttribute('data-rd-brand') || ''), surface: 'phone_quick_row' });
      progress();
    });
  })();

  /* ── Sort ── */
  $all('[data-rd-sort]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var p = cur();
      p.set('sort_by', sel.value);
      p.delete('page');
      go(urlFor(p));
    });
  });

  /* ── Shop by brand (snippets/pt-rd-brand-row, owner 2026-11-15) ──
     One brand at a time. Each tile's link is rebuilt from the address bar
     so every other param stays (filters, sort, rear, view, stock, tags):
     a brand replaces any other brand, the picked brand's tile (and "All
     brands") removes it. Desktop: one sliding row (owner: "slide them to
     the left on desktop too"): Previous / Next arrows when there is more
     to see, a fade on that side, trackpad / shift+wheel (native) and
     click-and-drag; it gets its own line when less than about two tiles
     fit beside the title. Phones: the swipe row. Both: the picked tile is
     scrolled into view (the row only, never the page). */
  (function () {
    var box = document.querySelector('[data-rd-brands]');
    if (!box) return;
    var VENDOR = 'filter.p.vendor';
    var track = box.querySelector('[data-rd-brands-track]');
    var prev = box.querySelector('[data-rd-brands-prev]');
    var next = box.querySelector('[data-rd-brands-next]');
    var links = $all('a[data-rd-brand]', box);
    function brandUrl(v) {
      var p = cur();
      p.delete(VENDOR);
      p.delete('page');
      if (v) p.append(VENDOR, v);
      return urlFor(p);
    }
    // Again just before use: pair mode changes view= in the address bar after load.
    function refresh(a) {
      var v = a.getAttribute('data-rd-brand') || '';
      a.setAttribute('href', brandUrl(a.classList.contains('is-on') ? '' : v));
    }
    links.forEach(function (a) {
      refresh(a);
      ['pointerdown', 'focus', 'contextmenu'].forEach(function (ev) { a.addEventListener(ev, function () { refresh(a); }); });
      a.addEventListener('click', function (e) {
        refresh(a);
        if (modified(e) || e.defaultPrevented) return;
        progress();
      });
    });
    if (!track) return;
    box.classList.add('is-ready');
    var sortEl = document.querySelector('.rd-res__toolbar .rd-res__sort');
    var headEl = document.querySelector('.rd-res__toolbar .rd-toolbar__head');
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function smooth() { return reduce && reduce.matches ? 'auto' : 'smooth'; }
    function px(el, prop) { return parseFloat(getComputedStyle(el)[prop]) || 0; }
    function shown() { return $all('.rd-brand', track).filter(function (t) { return t.offsetWidth > 0; }); }
    function maxLeft() { return Math.max(0, track.scrollWidth - track.clientWidth); }
    // Arrows + fade: only on the side that has more.
    function arrows() {
      var desk = MQ_DESK.matches && !box.hidden;
      var max = maxLeft();
      var atStart = !desk || max <= 1 || track.scrollLeft <= 1;
      var atEnd = !desk || max <= 1 || track.scrollLeft >= max - 1;
      track.classList.toggle('has-prev', !atStart);
      track.classList.toggle('has-next', !atEnd);
      [[prev, atStart, next], [next, atEnd, prev]].forEach(function (x) {
        var b = x[0];
        if (!b || b.hidden === x[1]) return;
        // Hiding the focused arrow: keep focus on the other one (or the row).
        var had = document.activeElement === b;
        b.hidden = x[1];
        if (had) { if (x[2] && !x[2].hidden) x[2].focus(); else { var f = shown()[0]; if (f) f.focus({ preventScroll: true }); } }
      });
    }
    function fit() {
      box.classList.remove('is-wrap');
      if (MQ_DESK.matches && !box.hidden) {
        // Less than two whole tiles between BOTH arrows (as in the middle
        // of the row) or Sort was pushed down: the row gets its own line
        // under the title and Sort.
        var t = shown();
        var two = t.length > 1 ? t[0].offsetWidth + t[1].offsetWidth + px(track, 'columnGap') : 0;
        var room = track.clientWidth - padL() - padR();
        var sortDown = sortEl && headEl && sortEl.getBoundingClientRect().top >= headEl.getBoundingClientRect().bottom - 1;
        if ((maxLeft() > 1 && room < two - 1) || sortDown) box.classList.add('is-wrap');
      }
      arrows();
    }
    // The left edge a tile lands on: after the Previous arrow when it shows.
    function padL() { return px(track, 'scrollPaddingLeft'); }
    function padR() { return px(track, 'scrollPaddingRight'); }
    function into(t, how) {
      var l = t.offsetLeft, r = l + t.offsetWidth, x = track.scrollLeft;
      if (MQ_DESK.matches) {
        // To a snap point (a tile's start), or the snap would pull it back
        // under the arrow: the first one that shows the whole tile.
        var pl = padL(), pr = padR();
        if (l - pl < x) x = l - pl;
        else if (r + pr > x + track.clientWidth) {
          var need = r + pr - track.clientWidth;
          x = l - pl;
          shown().some(function (o) {
            var p0 = o.offsetLeft - pl;
            if (p0 >= need - 1) { x = Math.min(p0, l - pl); return true; }
            return false;
          });
        }
      } else {
        // Phones / tablets: as before, the tile to the row's left edge.
        var pad = px(track, 'paddingLeft');
        if (l - pad < x || r + pad > x + track.clientWidth) x = l - pad - 8;
      }
      // fix2: the first / last tile go to the true ends, so no arrow sits
      // over them (End used to stop one snap short, under Next).
      var ends = shown();
      if (ends.length && t === ends[ends.length - 1]) x = maxLeft();
      else if (ends.length && t === ends[0]) x = 0;
      x = Math.max(0, Math.min(maxLeft(), Math.round(x)));
      atEndOn(x);
      if (Math.abs(x - track.scrollLeft) > 1) {
        if (track.scrollTo) track.scrollTo({ left: x, behavior: how || 'auto' }); else track.scrollLeft = x;
      }
    }
    // fix2: the true end is not a snap point (the last tile's start is one
    // snap short): no snap while the row is sent there.
    function atEndOn(x) {
      if (MQ_DESK.matches && maxLeft() > 1 && x >= maxLeft() - 1) track.classList.add('is-end');
      else track.classList.remove('is-end');
    }
    ['pointerdown', 'wheel', 'touchstart'].forEach(function (ev) {
      track.addEventListener(ev, function () { track.classList.remove('is-end'); }, { passive: true });
    });
    // The Previous arrow shows on the way and narrows the row, so the end
    // moves by its width: once the slide stops, finish it to the new end.
    function endFix() {
      if (!track.classList.contains('is-end')) return;
      var m = maxLeft();
      if (track.scrollLeft < m - 1) track.scrollTo({ left: m, behavior: smooth() });
    }
    if ('onscrollend' in window) track.addEventListener('scrollend', endFix);
    else track.addEventListener('scroll', function () { clearTimeout(endFix.t); endFix.t = setTimeout(endFix, 150); }, { passive: true });
    function showPicked() {
      var on = track.querySelector('.rd-brand.is-on:not(.rd-brand--all)');
      if (on && on.offsetWidth) into(on);
      arrows();
    }
    // Next / Previous: straight to a snap point (a tile's start), so the
    // mandatory snap never rounds past a brand. Next: the first tile not
    // fully clear of the Next arrow lands just after the Previous arrow.
    // Previous: the last tile hidden on the left lands just before Next.
    function page(dir) {
      var t = shown();
      if (!t.length) return;
      var x = track.scrollLeft, pl = padL(), pr = padR(), w = track.clientWidth;
      var max = maxLeft(), target = null, i;
      if (dir > 0) {
        var edge = x + w - pr;
        for (i = 0; i < t.length; i++) {
          var s = t[i].offsetLeft - pl;
          if (t[i].offsetLeft + t[i].offsetWidth > edge + 1 && s > x + 1) { target = s; break; }
        }
        if (target === null) target = max;
      } else {
        var lead = x + pl, hid = null;
        for (i = t.length - 1; i >= 0; i--) {
          if (t[i].offsetLeft < lead - 1) { hid = t[i]; break; }
        }
        if (!hid) target = 0;
        else {
          // The smallest snap point that still shows the whole hidden tile.
          var need = hid.offsetLeft + hid.offsetWidth + pr - w;
          target = hid.offsetLeft - pl;
          for (i = 0; i < t.length; i++) {
            var p0 = t[i].offsetLeft - pl;
            if (p0 >= need - 1) { target = Math.min(p0, target); break; }
          }
          if (target >= x - 1) target = hid.offsetLeft - pl;
        }
      }
      target = Math.max(0, Math.min(max, Math.round(target)));
      atEndOn(target);
      if (Math.abs(target - x) > 1) track.scrollTo({ left: target, behavior: smooth() });
    }
    // Shift + mouse wheel: macOS and Windows Chrome turn it sideways
    // themselves (deltaX); where it still arrives as deltaY, slide here.
    track.addEventListener('wheel', function (e) {
      if (!e.shiftKey || e.deltaX || !e.deltaY || !MQ_DESK.matches || maxLeft() <= 1) return;
      var d = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? track.clientWidth : 1);
      if ((d < 0 && track.scrollLeft <= 1) || (d > 0 && track.scrollLeft >= maxLeft() - 1)) return;
      e.preventDefault();
      track.scrollBy({ left: d, behavior: smooth() });
    }, { passive: false });
    if (prev) prev.addEventListener('click', function () { page(-1); });
    if (next) next.addEventListener('click', function () { page(1); });
    // v16: the row is ONE tab stop (roving tabindex). Arrow keys move
    // between the tiles and slide the focused one into view; Home / End
    // jump to the ends. Hidden tiles (pair mode) are skipped.
    function rove(t) {
      shownAll().forEach(function (o) { o.setAttribute('tabindex', o === t ? '0' : '-1'); });
    }
    function shownAll() { return $all('.rd-brand', track).filter(function (t) { return !t.classList.contains('is-out'); }); }
    function roveReset() {
      var list = shownAll();
      var cur0 = list.filter(function (t) { return t.getAttribute('tabindex') !== '-1'; })[0];
      rove(cur0 || list[0]);
      $all('.rd-brand.is-out', track).forEach(function (o) { o.setAttribute('tabindex', '-1'); });
    }
    track.addEventListener('keydown', function (e) {
      var t = e.target.closest && e.target.closest('.rd-brand');
      if (!t) return;
      var list = shownAll();
      var i = list.indexOf(t), j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(list.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = list.length - 1;
      if (j === -1) return;
      e.preventDefault();
      var n = list[j];
      if (!n) return;
      rove(n);
      try { n.focus({ preventScroll: true }); } catch (err) { n.focus(); }
      if (MQ_DESK.matches) into(n, smooth());
      else if (n.scrollIntoView) { try { n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) {} }
    });
    track.addEventListener('focusin', function (e) {
      var t = e.target.closest && e.target.closest('.rd-brand');
      if (t && t.getAttribute('tabindex') === '-1') rove(t);
    });
    var sRaf = 0;
    track.addEventListener('scroll', function () {
      if (sRaf) return;
      sRaf = window.requestAnimationFrame(function () { sRaf = 0; arrows(); });
    }, { passive: true });
    // Keyboard: a tile tabbed to slides fully into view (past the arrow).
    var byPointer = false;
    track.addEventListener('focusin', function (e) {
      if (byPointer) return;
      var t = e.target.closest && e.target.closest('.rd-brand');
      if (t && MQ_DESK.matches) into(t, smooth());
    });
    // Mouse click-and-drag (desktop). Touch and pen scroll natively. A
    // drag never opens the tile it started on.
    var drag = null, eat = false;
    track.addEventListener('dragstart', function (e) { e.preventDefault(); });
    track.addEventListener('pointerdown', function (e) {
      byPointer = true;
      setTimeout(function () { byPointer = false; }, 0);
      // Never carry a drag over from an earlier press.
      drag = null;
      track.classList.remove('is-drag');
      if (e.pointerType !== 'mouse' || e.button !== 0 || !MQ_DESK.matches || maxLeft() <= 1) return;
      drag = { id: e.pointerId, x: e.clientX, left: track.scrollLeft, on: false };
    });
    track.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      // The button was let go somewhere we did not hear about.
      if ((e.buttons & 1) === 0) { endDrag(e); return; }
      var dx = e.clientX - drag.x;
      if (!drag.on) {
        if (Math.abs(dx) < 6) return;
        drag.on = true;
        track.classList.add('is-drag');
        try { track.setPointerCapture(drag.id); } catch (err) {}
      }
      track.scrollLeft = drag.left - dx;
      e.preventDefault();
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var was = drag.on;
      drag = null;
      if (!was) { track.classList.remove('is-drag'); return; }
      eat = true;
      setTimeout(function () { eat = false; }, 0);
      try { if (e) track.releasePointerCapture(e.pointerId); } catch (err) {}
      // Land on the nearest tile, then let the snap take over again.
      var x = track.scrollLeft, best = x, d = Infinity, pl = padL();
      shown().forEach(function (t) {
        var s = Math.max(0, Math.min(maxLeft(), t.offsetLeft - pl));
        if (Math.abs(s - x) < d) { d = Math.abs(s - x); best = s; }
      });
      if (Math.abs(maxLeft() - x) < d) best = maxLeft();
      track.classList.remove('is-drag');
      track.scrollLeft = x;
      if (Math.abs(best - x) > 1) track.scrollTo({ left: best, behavior: smooth() });
      arrows();
    }
    // On the window: a press that leaves the row before it becomes a drag
    // is let go outside it (no capture yet), and must still end here.
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    window.addEventListener('blur', function () { if (drag) endDrag(null); });
    track.addEventListener('lostpointercapture', function (e) { if (drag && drag.on) endDrag(e); });
    track.addEventListener('click', function (e) {
      if (!eat) return;
      eat = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    var raf = 0;
    function later() {
      if (raf) return;
      // When the row moves to / from its own line, bring the picked tile back into view.
      var run = function () {
        raf = 0;
        var w0 = box.classList.contains('is-wrap');
        fit();
        if (box.classList.contains('is-wrap') !== w0) showPicked();
      };
      raf = window.requestAnimationFrame ? window.requestAnimationFrame(run) : setTimeout(run, 16);
    }
    // Staggered sets: the Brand facet is the FRONT size's, so most of its
    // brands can dead-end in the Sets tab. The pair block calls this with
    // 'wait' (sets loading: row hidden), a list of vendors (only those, plus
    // the picked one) or null (the facet as is). Fewer than 2: row hidden.
    brandPair = function (vendors) {
      var allow = null;
      if (vendors && vendors !== 'wait') {
        allow = {};
        vendors.forEach(function (v) { if (v) allow[String(v).toLowerCase()] = true; });
      }
      var n = 0;
      links.forEach(function (a) {
        var v = (a.getAttribute('data-rd-brand') || '').toLowerCase();
        var out = !!(v && allow && !allow[v] && !a.classList.contains('is-on'));
        a.classList.toggle('is-out', out);
        if (v && !out) n++;
      });
      // v16 fix1: while sets load the row keeps its space (no jump).
      box.classList.toggle('is-wait', vendors === 'wait' && IS_TIRES);
      box.hidden = (vendors === 'wait' && !IS_TIRES) || (vendors !== 'wait' && n < 2);
      roveReset();
      // A new set of tiles starts at the left (the snap would otherwise
      // follow the tile it was on to its new place).
      if (MQ_DESK.matches) track.scrollLeft = 0;
      fit();
      showPicked();
    };
    fit();
    showPicked();
    window.addEventListener('resize', later);
    window.addEventListener('load', function () { fit(); showPicked(); });
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(later); } catch (e) {}
    if (window.ResizeObserver) { try { new ResizeObserver(function () { arrows(); }).observe(track); } catch (e) {} }
    var onMq = function () { fit(); showPicked(); };
    if (MQ_DESK.addEventListener) MQ_DESK.addEventListener('change', onMq); else if (MQ_DESK.addListener) MQ_DESK.addListener(onMq);
  })();

  /* ── v16 fix2: 1200-1439 the chat bubble sits bottom-left, over the
     filter column. The sticky column ends 8 px above it (its bottom edge
     follows the screen), so no filter is ever under the bubble. Only when
     the results are taller than the filters (then the column's height
     moves nothing else on the page). ── */
  (function () {
    if (!IS_TIRES || !root || !root.classList.contains('rd-res--v16')) return;
    var side = root.querySelector('.rd-fside');
    var main = root.querySelector('.rd-res__main');
    if (!side || !main || !window.matchMedia) return;
    var mq = window.matchMedia('(min-width: 1200px) and (max-width: 1439px)');
    var raf = 0;
    function fit() {
      raf = 0;
      if (!mq.matches || main.offsetHeight <= side.scrollHeight) { side.style.maxHeight = ''; return; }
      var top = side.getBoundingClientRect().top;
      var mh = Math.round(window.innerHeight - Math.max(top, 0) - 80);
      side.style.maxHeight = Math.max(240, mh) + 'px';
    }
    function later() { if (!raf) raf = window.requestAnimationFrame ? requestAnimationFrame(fit) : setTimeout(fit, 16); }
    fit();
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    window.addEventListener('load', later);
    side.addEventListener('transitionend', later);
    if (mq.addEventListener) mq.addEventListener('change', later); else if (mq.addListener) mq.addListener(later);
    if (window.ResizeObserver) { try { new ResizeObserver(later).observe(main); } catch (e) {} }
  })();

  /* ── v16 fix1: chip ×, quick season items and the "Remove X" links are
     Shopify's own filter URLs, which drop the stock choice (stock=all) and
     the set tab (view=). Put them back (on load, and again on click, since
     the set tabs change view= in the address bar). ── */
  (function () {
    if (!IS_TIRES) return;
    // fix2: the page links too (Shopify's paginate URL drops stock=all).
    var SEL = '.rd-chip--link, .rd-q--season, .rd-widen a[href], .rd-pages a[href]';
    function fix(a) {
      var c = cur();
      var all = c.get('stock') === 'all';
      var view = c.get('rear') ? c.get('view') : null;
      if (!all && !view) return;
      try {
        var u = new URL(a.getAttribute('href'), window.location.origin);
        if (all) { u.searchParams.delete(AV); u.searchParams.set('stock', 'all'); }
        if (view && u.searchParams.get('rear')) u.searchParams.set('view', view);
        a.setAttribute('href', u.pathname + u.search + u.hash);
      } catch (e) {}
    }
    $all(SEL).forEach(fix);
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest(SEL);
      if (a) fix(a);
    }, true);
  })();

  /* ── Progress bar on chip / page / tab links ── */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.rd-chip--link, .rd-pages a, .rd-tabs a, .rd-widen a, .rd-q--season');
    if (!a || modified(e) || e.defaultPrevented) return;
    progress();
  });

  /* ── AJAX add to cart (from the old grid script) ── */
  (function () {
    function updateBadge(count) {
      $all('.pt-header__cart-count').forEach(function (el) { el.textContent = count; });
    }
    function readBadge() {
      var el = document.querySelector('.pt-header__cart-count');
      var n = el ? parseInt(el.textContent, 10) : 0;
      return isNaN(n) ? 0 : n;
    }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.ptg__card-cart');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      var variantId = btn.getAttribute('data-variant');
      if (!variantId) return;
      var label0 = btn.getAttribute('aria-label') || '';
      var prior = readBadge();
      // Optimistic: success state now, roll back if Shopify says no.
      btn.disabled = true;
      btn.classList.add('ptg__card-cart--success');
      btn.setAttribute('aria-label', 'Added to cart');
      updateBadge(prior + 1);
      function fail() {
        btn.classList.remove('ptg__card-cart--success');
        btn.classList.add('ptg__card-cart--error');
        btn.setAttribute('aria-label', 'Could not add to cart. Try again.');
        updateBadge(prior);
        setTimeout(function () { btn.classList.remove('ptg__card-cart--error'); btn.disabled = false; btn.setAttribute('aria-label', label0); }, 1600);
      }
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ id: variantId, quantity: 1 })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.status) { fail(); return; }
          fetch('/cart.js', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.json(); })
            .then(function (cart) { updateBadge(cart.item_count); })
            .catch(function () {});
          setTimeout(function () { btn.classList.remove('ptg__card-cart--success'); btn.disabled = false; btn.setAttribute('aria-label', label0); }, 2000);
        })
        .catch(fail);
    });
  })();

  /* ── "Fits your vehicle" on tire cards (default saved car's sizes) ── */
  function fitment(scope) {
    var badges = $all('[data-card-fitment]', scope);
    if (!badges.length) return;
    try {
      var sizes = [];
      var keys = Object.keys(localStorage).filter(function (k) { return k.indexOf('pt-garage-') === 0; });
      for (var i = 0; i < keys.length; i++) {
        var vehicles = JSON.parse(localStorage.getItem(keys[i]));
        var def = (vehicles || []).filter(function (v) { return v && v.isDefault; })[0];
        if (def && def.sizes) { sizes = def.sizes; break; }
      }
      if (!sizes.length) return;
      $all('.ptg__card[data-tire-size]', scope).forEach(function (card) {
        var s = card.getAttribute('data-tire-size');
        if (s && sizes.indexOf(s) !== -1) {
          var b = card.querySelector('[data-card-fitment]');
          if (b) b.hidden = false;
        }
      });
    } catch (e) {}
  }
  fitment(document);

  /* ── Scroll restoration (from the old grid script) ──
     Also remembers how many phone "Show more" pages were appended (m): on a
     Back without bfcache only page 1 is in the HTML, so those pages are
     loaded again before scrolling to the product the shopper opened. */
  var more = null; // set by the "Show more" block below: { pages, load() }
  (function () {
    if (!('sessionStorage' in window)) return;
    var KEY = 'ptg_scroll:' + (window.location.pathname || '/');
    var TTL = 30 * 60 * 1000;
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
    function save(handle) {
      try { sessionStorage.setItem(KEY, JSON.stringify({ y: window.scrollY, at: Date.now(), s: window.location.search, h: handle || null, m: more ? more.pages : 0 })); } catch (e) {}
    }
    // The first VISIBLE link (pair mode keeps the original grid, hidden).
    function find(h) {
      if (!h) return null;
      var all = document.querySelectorAll('.ptg__grid a[href*="/products/' + h + '"], .rd-pair a[href*="/products/' + h + '"]');
      for (var i = 0; i < all.length; i++) if (all[i].offsetParent !== null) return all[i];
      return null;
    }
    function restore() {
      var raw;
      try { raw = sessionStorage.getItem(KEY); } catch (e) { return; }
      if (!raw) return;
      try {
        var p = JSON.parse(raw);
        if (!p || Date.now() - (p.at || 0) > TTL) return;
        if ((p.s || '') !== (window.location.search || '')) return;
        var link = find(p.h);
        if (link) { link.scrollIntoView({ block: 'center', behavior: 'auto' }); return; }
        var want = parseInt(p.m, 10) || 0;
        if (want > 0 && more && more.pages < want) {
          // Re-append the pages the shopper had loaded, then find the product.
          var step = function () {
            if (more.pages >= want) return Promise.resolve();
            return more.load({ quiet: true }).then(function (ok) { return ok ? step() : null; });
          };
          step().then(function () {
            var l = find(p.h);
            if (l) l.scrollIntoView({ block: 'center', behavior: 'auto' });
            else if (more.btn) more.btn.scrollIntoView({ block: 'center', behavior: 'auto' });
          }, function () {});
          return;
        }
        if (want > 0) return; // the long list is gone: stay at the top rather than land mid-page
        window.scrollTo({ top: p.y || 0, behavior: 'auto' });
      } catch (e) {}
    }
    rerestore = restore;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.ptg__grid a[href*="/products/"], .rd-pair a[href*="/products/"], .rd-pages a');
      if (!a) return;
      var m = (a.getAttribute('href') || '').match(/\/products\/([a-z0-9-]+)/i);
      save(m ? m[1] : null);
    });
    window.addEventListener('pageshow', function (e) { setTimeout(restore, e.persisted ? 0 : 60); });
  })();

  /* ── Phones: "Show more tires" appends the next page ── */
  (function () {
    var wrap = document.querySelector('[data-rd-more-wrap]');
    var btn = document.querySelector('[data-rd-more-page]');
    var grid = document.querySelector('[data-rd-grid]');
    var countEl = document.querySelector('[data-rd-more-count]');
    if (!wrap || !btn || !grid || cfg.b2b || !MQ_PHONE.matches || !window.DOMParser || !cfg.sectionId) return;
    wrap.hidden = false;
    if (root) root.classList.add('has-more');
    var label0 = btn.textContent;
    more = { pages: 0, btn: btn, load: load };
    btn.addEventListener('click', function () { load({}); });
    // Resolves true when a page was appended, false when there is nothing to load.
    function load(opt) {
      var next = btn.getAttribute('data-next');
      if (!next || btn.disabled || btn.hidden) return Promise.resolve(false);
      btn.disabled = true;
      btn.textContent = 'Loading…';
      var url = next + (next.indexOf('?') === -1 ? '?' : '&') + 'section_id=' + encodeURIComponent(cfg.sectionId);
      return fetch(url, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) {
          var doc = new DOMParser().parseFromString(t, 'text/html');
          var cards = $all('[data-rd-grid] > .rd-card', doc);
          var firstNew = null;
          cards.forEach(function (c) {
            var n = document.importNode(c, true);
            grid.appendChild(n);
            if (!firstNew) firstNew = n;
          });
          fitment(grid);
          var nb = doc.querySelector('[data-rd-more-page]');
          var nn = nb && nb.getAttribute('data-next');
          var shown = grid.querySelectorAll('.rd-card').length;
          if (countEl) countEl.textContent = 'Showing ' + shown.toLocaleString('en-CA') + ' of ' + Number(cfg.total || shown).toLocaleString('en-CA') + (IS_TIRES ? ' results' : '');
          if (nn) { btn.setAttribute('data-next', nn); btn.disabled = false; btn.textContent = label0; }
          else { btn.hidden = true; }
          more.pages++;
          if (firstNew && !opt.quiet) {
            var link = firstNew.querySelector('.rd-card__link');
            if (link) { try { link.focus({ preventScroll: true }); } catch (e) { link.focus(); } }
          }
          return true;
        })
        .catch(function () {
          if (opt.quiet) { btn.disabled = false; btn.textContent = label0; return false; }
          // Fall back to the next page itself.
          window.location.href = next;
          return false;
        });
    }
  })();

  /* ── Staggered sets: "pair mode" (staggered plan stage 7) ──────────────
     URL: the front size exactly as today (W / A / R filters, or one
     tire_size, on the front rim collection) plus rear=W%2FARR, e.g.
       /collections/tires-18-inch?filter.p.m.custom.tire_width=245
         &filter.p.m.custom.tire_profile=40&filter.p.m.custom.rim_diameter=18
         &rear=275%2F35R18
     (window.PTVehiclePairs.url builds the same.) Without JS, Shopify ignores
     rear and the page is the normal front-size grid.

     Here: count both sizes (sections/pt-rd-count, with the same sidebar
     filters, checking Shopify applied every filter), fetch every page of
     both (Section Rendering of this grid section, capped), and pair the
     same tire model across the two sizes:
       key = vendor | model | season | studded | run-flat | P/LT class
     (a miss is acceptable, a wrong match is not: never across season,
     studs, run-flat or class; no key without a model and a season).
     Per key and axle the best card wins: bookable, then the faster lead,
     then the lower price.
     Tabs: Sets (front + rear) | Front only | Rear only - NO numbers.
     Set card: Front and Rear rows (size, load / speed, price per tire),
     "Set of 4 (2 + 2)" total before GST from cents, the SLOWER lead (the
     card's own lead spans, cloned), and "Request install" only when the
     booking form can book sets (window.PTBookSets, the pt-book stub);
     otherwise "Call us to book this set". Not bookable (either tire cannot
     supply 2): greyed, "Call us for options", no reason, no count.
     Customer rules: lead time only, no counts, no supplier names; prices
     before GST (GST only in the booking form's Installed total).
     Off for wholesale customers (their prices come from pt-header).
  */
  (function () {
    var SET_CART = false;   // set card cart icon: hidden until pt-cart groups _set lines (stage 9)
    var MAX_PAGES = 8;      // grid pages per size (8 x 24 = 192 tires)
    var MAX_REQ = 18;       // requests per search (2 counts + pages)
    var CONC = 3;           // parallel requests
    var SETS_STEP = 12, GRID_STEP = 24;
    var P_W = 'filter.p.m.custom.tire_width', P_A = 'filter.p.m.custom.tire_profile', P_TS = 'filter.p.m.custom.tire_size';
    var LEAD_RANK = { today: 0, '1-2': 1, order: 2, out: 3 };
    var VT_ORDER = ['passenger', 'suv', 'largetruck', 'van', 'truck', 'trailer'];
    var BOOK_ONCLICK = "event.preventDefault();event.stopPropagation();if(typeof openBookingModal==='function')openBookingModal(this)";

    /* ---- pure helpers (window.PTRdPair, for tests) ---- */
    function sane(z) {
      var w = +z.w, a = parseFloat(z.a), r = +z.r;
      if (z.kind === 'flot') return w >= 26 && w <= 44 && a >= 7 && a <= 18 && r >= 14 && r <= 26;
      return w >= 125 && w <= 395 && a >= 25 && a <= 95 && r >= 12 && r <= 26;
    }
    function dec2(a) { var p = String(a).split('.'); var d = p[1] || '00'; if (d.length === 1) d += '0'; return p[0] + '.' + d; }
    // "245/40R18", "245/40ZR18", "LT275/65R18", "275/35/18", "275-35-18", "35X12.50R20LT"
    function parseSize(s) {
      var t = String(s || '').trim().toUpperCase();
      var z = null;
      var m = /^(?:P|LT|ST|T)?\s*(\d{3})\s*[\/\-\s]\s*(\d{2,3})\s*(?:Z?R|[\/\-\s])\s*(\d{2})(?![\d.])/.exec(t);
      if (m) z = { kind: 'metric', w: m[1], a: m[2], r: m[3] };
      else {
        m = /^(\d{2})\s*[X×]\s*(\d{1,2}(?:\.\d{1,2})?)\s*Z?R\s*(\d{2})(?![\d.])/.exec(t);
        if (m) z = { kind: 'flot', w: m[1], a: dec2(m[2]), r: m[3] };
      }
      return z && sane(z) ? z : null;
    }
    function fmt(z) { return z ? z.w + (z.kind === 'flot' ? 'X' : '/') + z.a + 'R' + z.r : ''; }
    function normSize(s) { return fmt(parseSize(s)); }
    function words(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function attr(el, k) { return (el && el.getAttribute(k)) || ''; }
    // Model: custom.tire_model ("[D] " prefix dropped), else the title minus
    // the brand, size, load / speed and marking tokens. Lower-case words.
    function normModel(model, title, vendor) {
      var m = String(model || '').replace(/^\s*\[[^\]]*\]\s*/, '');
      if (words(m)) return words(m);
      var t = ' ' + String(title || '').toUpperCase().replace(/^\s*\[[^\]]*\]\s*/, '') + ' ';
      if (vendor) t = t.replace(new RegExp('(^|[^A-Z0-9])' + reEsc(String(vendor).toUpperCase()) + '(?=[^A-Z0-9]|$)', 'g'), '$1 ');
      t = t
        .replace(/\b(?:P|LT|ST|T)?\d{3}\s*\/\s*\d{2,3}\s*Z?R\s*\d{2}(?:\.\d)?(?:LT)?\b/g, ' ')
        .replace(/\b\d{2}(?:\.\d+)?\s*[X×]\s*\d{1,2}(?:\.\d{1,2})?\s*Z?R\s*\d{2}(?:LT)?\b/g, ' ')
        .replace(/\(?\b\d{2,3}(?:\/\d{2,3})?[A-Z]\b\)?/g, ' ')
        .replace(/M\s*\+\s*S|\b3PMSF\b/g, ' ')
        .replace(/\b(?:XL|SL|RF|RFT|ROF|ZP|ZPS|SSR|EMT|DSST|HRS|RUN\s*-?\s*FLAT|RUNFLAT|EXTRA\s+LOAD|REINFORCED|BSW|OWL|RWL|BLK|LOAD\s+RANGE\s+[A-F]|LR\s*[A-F]|\d{1,2}\s*-?\s*PLY|\d{1,2}\s*PR)\b/g, ' ');
      return words(t);
    }
    // What the set card calls the tire: the model metafield ("[D] " prefix
    // dropped), else the card's name minus brand, size and load / speed
    // (the card's own strip misses ZR sizes: "245/40ZR18 97W Haida HD927").
    function displayName(model, name, brand) {
      var m = String(model || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim();
      if (m) return m;
      var t = ' ' + String(name || '').replace(/^\s*\[[^\]]*\]\s*/, '') + ' ';
      if (brand) t = t.replace(new RegExp('(^|\\s)' + reEsc(brand) + '(?=\\s)', 'gi'), '$1');
      t = t.replace(/\b(?:P|LT|ST|T)?\d{3}\s*\/\s*\d{2,3}\s*Z?R\s*\d{2}(?:LT)?\b/gi, ' ')
        .replace(/\b\d{2}(?:\.\d+)?\s*[X×]\s*\d{1,2}(?:\.\d{1,2})?\s*Z?R\s*\d{2}(?:LT)?\b/gi, ' ')
        .replace(/\(?\b\d{2,3}(?:\/\d{2,3})?[A-Z]\b\)?/g, ' ')
        .replace(/\bXL\b/g, ' ').replace(/\s+/g, ' ').trim();
      return t || String(name || '').trim();
    }
    function isRunflat(mf, title) {
      var v = String(mf || '').trim().toLowerCase();
      if (v && !/^(no|n|false|0|none|n\/a|na|-|standard|non[- ]?run[- ]?flat)$/.test(v)) return true;
      return /\b(?:RFT|ROF|RUN\s*-?\s*FLAT|RUNFLAT|ZP|ZPS|SSR|EMT|DSST|HRS)\b/i.test(String(title || ''));
    }
    function tireClass(mf, size, title) {
      var v = String(mf || '').trim().toUpperCase();
      if (v === 'P' || v === 'LT' || v === 'ST') return v;
      var s = String(size || '').trim().toUpperCase();
      if (/^LT/.test(s) || /\dLT$/.test(s)) return 'LT';
      if (/^ST/.test(s)) return 'ST';
      var t = String(title || '').toUpperCase();
      if (/\bLT\d{3}\s*\//.test(t) || /R\d{2}\s*LT\b/.test(t)) return 'LT';
      if (/\bST\d{3}\s*\//.test(t)) return 'ST';
      return 'P';
    }
    // facts = { vendor, brand, model, title, season, studded, runflat, cls, size }
    function pairKey(f) {
      var model = normModel(f.model, f.title, f.brand);
      var season = String(f.season || '').trim().toLowerCase();
      if (!model || model.length < 2 || !season || !f.vendor) return null;
      return [String(f.vendor).toLowerCase(), model, season, f.studded === '1' ? 'studded' : 'nostud',
        isRunflat(f.runflat, f.title) ? 'rf' : 'std', tireClass(f.cls, f.size, f.title)].join('|');
    }
    // Per key and axle: bookable, then the faster lead, then cheaper, then page order.
    function better(a, b) {
      if (a.ok !== b.ok) return a.ok ? a : b;
      if (a.rank !== b.rank) return a.rank < b.rank ? a : b;
      if (a.cents !== b.cents) return a.cents < b.cents ? a : b;
      return a.idx <= b.idx ? a : b;
    }
    function bestByKey(list) {
      var m = {};
      list.forEach(function (x) { if (x.key) m[x.key] = m[x.key] ? better(m[x.key], x) : x; });
      return m;
    }
    function buildSets(fronts, rears, sortBy) {
      var F = bestByKey(fronts), R = bestByKey(rears);
      var out = [];
      Object.keys(F).forEach(function (k) {
        if (!R[k]) return;
        var f = F[k], r = R[k];
        out.push({ key: k, f: f, r: r, ok: !!(f.ok && r.ok), rank: Math.max(f.rank, r.rank), cents: 2 * f.cents + 2 * r.cents, idx: f.idx });
      });
      out.sort(function (a, b) {
        if (a.ok !== b.ok) return a.ok ? -1 : 1;
        if (sortBy === 'price-ascending' && a.cents !== b.cents) return a.cents - b.cents;
        if (sortBy === 'price-descending' && a.cents !== b.cents) return b.cents - a.cents;
        return a.idx - b.idx;
      });
      return out;
    }
    // Integer cents -> "$1,234.56" (no floating point).
    function money(c) {
      c = Math.round(+c || 0);
      var d = Math.floor(c / 100), r = c % 100;
      return '$' + String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + (r < 10 ? '0' : '') + r;
    }
    function higherVt(a, b) {
      var x = VT_ORDER.indexOf(a), y = VT_ORDER.indexOf(b);
      if (x === -1 && y === -1) return a || b || 'passenger';
      return (x >= y ? a : b) || 'passenger';
    }
    // The set button's vehicle type: a card's 'largetruck' is only a guess
    // from an R21+ rim (pt-collection-card.liquid), never the customer's, so
    // it reads as a car here; metafield / LT types (suv, van, truck,
    // trailer) still win. The booking form and the server would read it as
    // a car for a set anyway (SPEC round 2).
    function setVt(a, b) {
      var car = function (v) { return v === 'largetruck' ? 'passenger' : v; };
      return higherVt(car(a), car(b));
    }
    // The axle's Request install data-* copied with a front- / rear- prefix
    // (data-tire-name -> data-front-tire-name) plus data-<axle>-lead. No
    // unprefixed tire attributes: an older booking form then opens its
    // generic menu instead of booking 4 of the front tire.
    function prefixed(book, axle, lead) {
      var out = [];
      if (book) Array.prototype.forEach.call(book.attributes, function (at) {
        if (at.name.indexOf('data-') !== 0 || at.name === 'data-qty' || at.name === 'data-stagger-axle') return;
        out.push(['data-' + axle + '-' + at.name.slice(5), at.value]);
      });
      out.push(['data-' + axle + '-lead', lead || '']);
      return out;
    }
    window.PTRdPair = { parseSize: parseSize, normSize: normSize, normModel: normModel, displayName: displayName, pairKey: pairKey, isRunflat: isRunflat, tireClass: tireClass, buildSets: buildSets, better: better, money: money, prefixed: prefixed, higherVt: higherVt, setVt: setVt };

    /* ---- activation ---- */
    var host = document.querySelector('[data-rd-pair]');
    var q0 = cur();
    var rearRaw = q0.get('rear');
    // Not a set page after all: the inline flag and H1 go back to normal.
    function notPair() {
      pairDone();
      var h = document.querySelector('[data-rd-title][data-rd-h1-orig]');
      if (h) { h.innerHTML = h.getAttribute('data-rd-h1-orig'); h.classList.remove('is-pair'); h.removeAttribute('data-rd-h1-orig'); }
    }
    if (!host || !rearRaw || !root || root.getAttribute('data-kind') !== 'tires' || cfg.b2b) { notPair(); return; }
    if ((cfg.tags || []).length || !window.DOMParser || !window.fetch || !cfg.sectionId) { notPair(); return; }
    var front = null;
    var ws = q0.getAll(P_W), as = q0.getAll(P_A), rs = q0.getAll(RIM), ts = q0.getAll(P_TS);
    if (ws.length === 1 && as.length === 1 && rs.length === 1 && !ts.length) {
      front = parseSize(ws[0] + ((ws[0].length <= 2 || as[0].indexOf('.') !== -1) ? 'X' : '/') + as[0] + 'R' + rs[0]);
    } else if (!ws.length && !as.length && ts.length === 1 && rs.length <= 1) {
      front = parseSize(ts[0]);
      if (front && rs.length && rs[0] !== front.r) front = null;
    }
    var rear = parseSize(rearRaw);
    if (!front || !rear || rear.kind !== front.kind || fmt(rear) === fmt(front)) { notPair(); return; }
    var FRONT = fmt(front), REAR = fmt(rear);
    pairMode = true;
    root.classList.add('rd-res--pair');
    if (brandPair) brandPair('wait');
    // v16 tire pages: the pill says "Filters" + an applied-filters badge
    // (Liquid), never a result count, so pair mode needs nothing here.
    if (!IS_TIRES) (function () {
      var f = document.querySelector('[data-rd-fab] .rd-fab__f');
      if (!f) return;
      var sp = f.querySelector('span[aria-hidden]');
      if (sp) sp.textContent = 'Filters';
      f.setAttribute('aria-label', (f.getAttribute('aria-label') || 'Filters').replace(/\.\s*[\d,]+\s+\S+\s*$/, ''));
    })();

    var grid = document.querySelector('[data-rd-grid]');
    var moreWrap = document.querySelector('[data-rd-more-wrap]');
    var pagesNav = document.querySelector('[data-rd-pages]');
    var emptyEl = document.querySelector('.rd-res__main > [data-ptg-empty]');
    var h1 = document.querySelector('[data-rd-title]');
    var shown = document.querySelector('[data-rd-shown]');
    var h1Orig = h1 ? (h1.getAttribute('data-rd-h1-orig') || h1.innerHTML) : '';
    var shownOrig = shown ? shown.innerHTML : '';
    var perPage = parseInt(cfg.perPage, 10) || 24;
    var onPage1 = !(parseInt(cfg.page, 10) > 1);
    // v16 fix1: no sort in the address (the collection's own order) lists
    // the sets by total, low to high, like every mock.
    var sortBy = q0.get('sort_by') || (IS_TIRES ? 'price-ascending' : '');
    var ctl = null, tStart = 0, reqs = 0, run = 0;
    var tel = (function () {
      var a = document.querySelector('.rd-card a[href^="tel:"]');
      return a ? a.getAttribute('href').slice(4) : '+14034524283';
    })();
    function track(ev, d) { try { if (window.PTTrack) window.PTTrack.push(ev, d); } catch (e) {} }
    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    function hideLiquid(on) {
      [grid, moreWrap, pagesNav, emptyEl].forEach(function (x) { if (x) x.hidden = on; });
      if (on) { more = null; if (root) root.classList.remove('has-more'); }
    }
    // Sets view: "6 matching sets" ("sets", so it never reads as stock;
    // "matching", so it reads as a match count). Front / Rear only: results.
    function setShown(n, sets) {
      if (!shown) return;
      if (n == null) { shown.textContent = ''; return; }
      shown.innerHTML = '<strong data-rd-shown-n></strong> ' + (sets ? (n === 1 ? 'matching set' : 'matching sets') : (n === 1 ? 'result' : 'results'));
      shown.querySelector('strong').textContent = Number(n).toLocaleString('en-CA');
    }
    // H1: "245/40R18 front · 275/35R18 rear" (phones: two lines).
    function pairTitle() {
      if (!h1) return;
      h1.classList.add('is-pair');
      // Same markup as the inline H1 in pt-collection-grid (no reflow when both run).
      h1.innerHTML = '<span class="rd-rhd__ax"><span></span><small> front</small></span><span class="rd-rhd__dot" aria-hidden="true">·</span><span class="rd-rhd__ax"><span></span><small> rear</small></span>';
      var sp = h1.querySelectorAll('.rd-rhd__ax > span');
      sp[0].textContent = FRONT; sp[1].textContent = REAR;
    }

    // Shopify's own links drop rear (chips, quick season items, the
    // widen panel): put it back on every one. v16 tire pages: no "Rear ×"
    // chip (it repeated the H1; the rear size is changed in Change size).
    (function () {
      $all('.rd-chip--link, .rd-q--season, .rd-widen a').forEach(function (a) {
        try {
          var u = new URL(a.getAttribute('href'), window.location.origin);
          u.searchParams.set('rear', REAR);
          a.setAttribute('href', u.pathname + u.search + u.hash);
        } catch (e) {}
      });
      if (IS_TIRES) return;
      var bar = document.querySelector('.rd-res__toolbar');
      if (!bar) return;
      var box = bar.querySelector('.rd-chips');
      if (!box) {
        box = el('div', 'rd-chips rd-res__chips');
        box.setAttribute('aria-label', 'Active filters');
        var sort = bar.querySelector('.rd-toolbar__sort');
        bar.insertBefore(box, sort || null);
      }
      var p = cur(); p.delete('rear'); p.delete('view'); p.delete('page');
      var chip = el('a', 'rd-chip rd-chip--link');
      chip.setAttribute('href', urlFor(p));
      chip.setAttribute('rel', 'nofollow');
      chip.setAttribute('data-rd-rear-chip', '');
      chip.setAttribute('aria-label', 'Remove rear size ' + REAR);
      chip.innerHTML = '<span></span><span class="rd-chip__x" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></span>';
      chip.firstChild.textContent = 'Rear ' + REAR;
      box.insertBefore(chip, box.firstChild);
    })();

    /* ---- URLs ---- */
    function frontUrl() {
      var p = cur(); p.delete('rear'); p.delete('view'); p.delete('page');
      return urlFor(p, null, []);
    }
    // The rear size with the same sidebar filters; on the rear rim's own
    // collection (tire pages), else the same collection (a brand page).
    // null = the rear rim has no tire collection: not carried.
    function rearUrl() {
      var p = cur();
      [P_W, P_A, RIM, P_TS, 'page', 'rear', 'view'].forEach(function (k) { p.delete(k); });
      p.set(P_W, rear.w); p.set(P_A, rear.a); p.set(RIM, rear.r);
      var fam = null;
      try { fam = window.PTRim && window.PTRim.family ? window.PTRim.family(window.location.pathname) : null; } catch (e) {}
      if (fam && fam.kind === 'tires') {
        if (!(((window.PTRim && window.PTRim.tires) || {})[rear.r] > 0)) return null;
        return '/collections/tires-' + rear.r + '-inch?' + p.toString();
      }
      return window.location.pathname + '?' + p.toString();
    }
    function withParam(url, k, v) {
      var u = new URL(url, window.location.origin);
      u.searchParams.set(k, v);
      return u.pathname + u.search;
    }
    function get(url, sid) {
      reqs++;
      var u = url + (url.indexOf('?') === -1 ? '?' : '&') + 'section_id=' + encodeURIComponent(sid);
      return fetch(u, { signal: ctl ? ctl.signal : undefined, credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    }
    // Count for a URL, 0 when Shopify ignored any product filter in it (a
    // value it does not know = no product has it); null = no answer.
    function count(url) {
      if (!url) return Promise.resolve(0);
      return get(url, 'pt-rd-count').then(function (t) {
        var j = readCountJson(t);
        if (!j) return null;
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
        return ok ? j.n : 0;
      });
    }
    function pool(tasks) {
      return new Promise(function (resolve, reject) {
        var out = new Array(tasks.length), next = 0, done = 0, dead = false;
        if (!tasks.length) { resolve(out); return; }
        function go1() {
          if (dead || next >= tasks.length) return;
          var k = next++;
          tasks[k]().then(function (v) {
            out[k] = v; done++;
            if (done === tasks.length) resolve(out); else go1();
          }, function (e) { dead = true; reject(e); });
        }
        for (var i = 0; i < Math.min(CONC, tasks.length); i++) go1();
      });
    }
    function cardsOf(html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      return $all('[data-rd-grid] > .rd-card', doc);
    }
    // Every page of one size: [card elements] in collection order.
    function pagesOf(url, n, reuse) {
      var pages = Math.ceil(n / perPage);
      var tasks = [];
      for (var i = reuse ? 2 : 1; i <= pages; i++) (function (pg) {
        tasks.push(function () { return get(withParam(url, 'page', String(pg)), cfg.sectionId).then(cardsOf); });
      })(i);
      return pool(tasks).then(function (lists) {
        var all = reuse ? $all('[data-rd-grid] > .rd-card') : [];
        lists.forEach(function (l) { all = all.concat(l); });
        return all;
      });
    }
    function facts(card, idx, size) {
      var link = card.querySelector('.rd-card__link');
      var brandEl = card.querySelector('.rd-card__brand');
      var book = card.querySelector('.ptg__card-book');
      var lead = attr(card, 'data-pt-lead') || 'out';
      var cents = parseInt(attr(card, 'data-price-cents'), 10);
      var f = {
        el: card, idx: idx, book: book, handle: attr(card, 'data-product-handle'),
        vendor: attr(card, 'data-vendor'), brand: brandEl ? brandEl.textContent.trim() : '',
        model: attr(card, 'data-pair-model'), title: attr(card, 'data-pair-title'), display: attr(card, 'data-pair-display'),
        season: attr(card, 'data-season'), studded: attr(card, 'data-studded'), runflat: attr(card, 'data-runflat'),
        cls: attr(card, 'data-class'), size: attr(card, 'data-tire-size'), spec: attr(card, 'data-spec'),
        vtype: attr(card, 'data-vtype') || (book && attr(book, 'data-vehicle-type')) || 'passenger',
        url: link ? link.getAttribute('href') : '', name: link ? link.textContent.trim() : '',
        lead: lead, rank: Object.prototype.hasOwnProperty.call(LEAD_RANK, lead) ? LEAD_RANK[lead] : 3,
        cents: isFinite(cents) ? cents : 0
      };
      f.ok = attr(card, 'data-pair-ok') === '1' && !!book && f.cents > 0;
      f.key = f.cents > 0 && normSize(f.size) === size ? pairKey(f) : null;
      return f;
    }
    // Keep the cards of exactly this size (a second guard against an
    // ignored filter), one per product.
    function axleList(cards, size) {
      var seen = {}, out = [];
      cards.forEach(function (c) {
        var h = attr(c, 'data-product-handle');
        if (!h || seen[h] || normSize(attr(c, 'data-tire-size')) !== size) return;
        seen[h] = 1;
        out.push(facts(c, out.length, size));
      });
      return out;
    }

    /* ---- render ---- */
    var TABS = [['sets', 'Sets (front + rear)'], ['front', 'Front only'], ['rear', 'Rear only']];
    var state = null;
    function status(text, busy) {
      host.hidden = false;
      host.innerHTML = '';
      var s = el('p', 'rd-pair__status' + (busy ? ' is-busy' : ''), text);
      s.setAttribute('role', 'status');
      s.setAttribute('aria-live', 'polite');
      host.appendChild(s);
      return s;
    }
    // The shops' call buttons, from the same location data the booking form
    // reads (#pt-locations-data): 'Call 42 Ave SW · (403) 452-4283'. The
    // fixed pair is only the fallback when that data is missing.
    var CALLS_FALLBACK = [['+14034524283', 'Call 42 Ave SW · (403) 452-4283'], ['+18253954024', 'Call Edmonton Trail NE · (825) 395-4024']];
    function shopCalls() {
      try {
        var node = document.getElementById('pt-locations-data');
        var all = node ? JSON.parse(node.textContent) : null;
        if (Array.isArray(all)) {
          var out = all.filter(function (l) { return l && l.name && l.phone && String(l.phone_href || l.phone).replace(/[^\d+]/g, '').length >= 10; })
            .sort(function (a, b) { return (b.is_primary === true) - (a.is_primary === true); })
            .map(function (l) { return [String(l.phone_href || l.phone).replace(/[^\d+]/g, ''), 'Call ' + String(l.name).replace(/^Prince Tires\s*[—–-]\s*/i, '') + ' · ' + l.phone]; });
          if (out.length) return out;
        }
      } catch (e) {}
      return CALLS_FALLBACK;
    }
    function callLinks() {
      var w = el('div', 'rd-pair__calls');
      shopCalls().forEach(function (c) {
        var a = el('a', 'rd-btn rd-btn--line', c[1]);
        a.href = 'tel:' + c[0];
        w.appendChild(a);
      });
      return w;
    }
    function emptyBox(title, sub, actions) {
      var b = el('div', 'rd-empty rd-pair__empty');
      b.appendChild(el('p', 'rd-empty__title', title));
      if (sub) b.appendChild(el('p', 'rd-empty__sub', sub));
      var acts = el('div', 'rd-empty__actions');
      (actions || []).forEach(function (a) { acts.appendChild(a); });
      b.appendChild(acts);
      b.appendChild(callLinks());
      return b;
    }
    function tabBtn(view, text) {
      var b = el('button', 'rd-btn rd-btn--line', text);
      b.type = 'button';
      b.setAttribute('data-rd-pair-goto', view);
      return b;
    }
    // "Clear season and brand" keeps the sizes, the rear, the sort and the stock choice.
    function clearLink() {
      var c = cur(), p = new URLSearchParams(), extra = false;
      c.forEach(function (v, k) {
        if (KEEP_ON_CLEAR.indexOf(k) !== -1 || k === 'sort_by' || k === 'stock' || (k === AV && v === '1')) p.append(k, v);
        else if (k.indexOf('filter.') === 0) extra = true;
      });
      if (!extra) return null;
      var a = el('a', 'rd-btn rd-btn--line', 'Clear the other filters');
      a.href = urlFor(p, null, []);
      return a;
    }
    function setCard(s, i) {
      var f = s.f, r = s.r;
      var a = el('article', 'rd-set' + (s.ok ? '' : ' rd-set--call'));
      a.setAttribute('data-set-key', s.key);
      a.setAttribute('aria-labelledby', 'rd-set-t-' + i);
      var tile = el('div', 'rd-set__img');
      var img = f.el.querySelector('.rd-card__tile img') || r.el.querySelector('.rd-card__tile img');
      if (img) {
        var ci = document.importNode(img, true);
        ci.className = 'rd-set__pic';
        ci.removeAttribute('fetchpriority');
        ci.setAttribute('loading', 'lazy');
        ci.setAttribute('sizes', '(max-width: 749px) 88px, 120px');
        ci.setAttribute('alt', '');
        tile.appendChild(ci);
      } else {
        tile.classList.add('rd-set__img--ph');
        tile.appendChild(el('span', 'rd-set__ph', f.brand));
      }
      a.appendChild(tile);

      var body = el('div', 'rd-set__body');
      var head = el('div', 'rd-set__head');
      head.appendChild(el('div', 'rd-card__brand', f.brand));
      var h = el('h3', 'rd-set__title');
      h.id = 'rd-set-t-' + i;
      var hl = el('a', 'rd-set__link', displayName(f.model, f.name, f.brand) || f.brand);
      hl.href = f.url;
      h.appendChild(hl);
      head.appendChild(h);
      var sea = f.el.querySelector('.rd-card__season');
      if (sea) {
        var mod = (sea.className.match(/rd-card__season--[a-z0-9-]+/) || [''])[0];
        head.appendChild(el('span', 'rd-set__season ' + mod, sea.textContent.trim()));
      }
      body.appendChild(head);

      var rows = el('div', 'rd-set__rows');
      [['Front', f], ['Rear', r]].forEach(function (x) {
        var t = x[1];
        var row = el('div', 'rd-set__row');
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', x[0] + ' tires');
        row.appendChild(el('span', 'rd-set__pos', x[0]));
        var sz = el('span', 'rd-set__size');
        var sl = el('a', null, t.size);
        sl.href = t.url;
        sl.setAttribute('aria-label', x[0] + ' ' + t.size + ', ' + (t.brand + ' ' + displayName(t.model, t.name, t.brand)).trim());
        sz.appendChild(sl);
        if (t.spec) sz.appendChild(el('span', 'rd-set__spec', t.spec));
        row.appendChild(sz);
        var each = el('span', 'rd-set__each', money(t.cents));
        each.appendChild(el('span', 'rd-set__unit', '/tire'));
        row.appendChild(each);
        rows.appendChild(row);
      });
      body.appendChild(rows);

      if (s.ok) {
        // The slower of the two, in the card's own words (Liquid lead spans).
        var slow = f.rank >= r.rank ? f : r;
        var lw = slow.el.querySelector('.rd-card__lead');
        if (lw) {
          var lead = el('div', 'rd-set__lead');
          Array.prototype.forEach.call(lw.children, function (c) { lead.appendChild(document.importNode(c, true)); });
          body.appendChild(lead);
        }
      }

      var tot = el('div', 'rd-set__total');
      tot.appendChild(el('span', 'rd-set__total-k', 'Set of 4 (2 + 2)'));
      tot.appendChild(el('b', 'rd-set__total-v', money(s.cents)));
      tot.appendChild(el('span', 'rd-set__total-n', 'before GST'));
      body.appendChild(tot);

      var acts = el('div', 'rd-set__actions');
      if (s.ok && window.PTBookSets === true) {
        var b = el('button', 'rd-btn rd-btn--primary rd-set__book', 'Request install');
        b.type = 'button';
        b.setAttribute('data-book-set', 'staggered');
        b.setAttribute('data-from', 'set_card');
        b.setAttribute('data-set-key', s.key);
        b.setAttribute('data-vehicle-type', setVt(f.vtype, r.vtype));
        prefixed(f.book, 'front', f.lead).concat(prefixed(r.book, 'rear', r.lead)).forEach(function (kv) { b.setAttribute(kv[0], kv[1]); });
        b.setAttribute('aria-label', 'Request install: 2 front and 2 rear, ' + (f.brand + ' ' + displayName(f.model, f.name, f.brand)).trim());
        b.setAttribute('onclick', BOOK_ONCLICK);
        acts.appendChild(b);
        if (SET_CART) {
          var cb = el('button', 'rd-iconbtn rd-set__cart');
          cb.type = 'button';
          cb.setAttribute('data-rd-set-cart', '');
          cb.setAttribute('data-front-variant', attr(f.el, 'data-variant-id'));
          cb.setAttribute('data-rear-variant', attr(r.el, 'data-variant-id'));
          cb.setAttribute('aria-label', 'Add the set to cart');
          cb.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.7l2.4 11.6h11.2l2-8.1H6.3"/></svg>';
          acts.appendChild(cb);
        }
      } else {
        var c = el('a', 'rd-btn rd-btn--line rd-set__book', s.ok ? 'Call us to book this set' : 'Call us for options');
        c.href = 'tel:' + tel;
        acts.appendChild(c);
      }
      body.appendChild(acts);
      a.appendChild(body);
      return a;
    }
    // v16 set card: the tire card's anatomy (photo with the season tag
    // CLONED, icon included; brand; model), a Front / Rear table on one
    // 40px | 1fr | auto grid, "Set of 4 (2 front + 2 rear)", the set total
    // as the headline price, the slower lead, one full-width Request
    // install. Same data-book-set / front- / rear- data as before.
    // v16 fix2: the set card's model name is the card's own cleaned name
    // (data-pair-display, from pt-collection-card), as on Front only.
    function nm16(t) { return t.display || displayName(t.model, t.name, t.brand); }
    function setCard16(s, i) {
      var f = s.f, r = s.r;
      var a = el('article', 'rd-set rd-set--v16' + (s.ok ? '' : ' rd-set--call'));
      a.setAttribute('data-set-key', s.key);
      a.setAttribute('aria-labelledby', 'rd-set-t-' + i);
      var tile = el('div', 'rd-set__img');
      var img = f.el.querySelector('.rd-card__tile img') || r.el.querySelector('.rd-card__tile img');
      if (img) {
        var ci = document.importNode(img, true);
        ci.className = 'rd-set__pic';
        ci.removeAttribute('fetchpriority');
        ci.setAttribute('loading', 'lazy');
        ci.setAttribute('sizes', '(max-width: 749px) 92vw, 320px');
        ci.setAttribute('alt', '');
        tile.appendChild(ci);
      } else {
        tile.classList.add('rd-set__img--ph');
        tile.appendChild(el('span', 'rd-set__ph', f.brand));
      }
      var sea = f.el.querySelector('.rd-card__season');
      if (sea) tile.appendChild(document.importNode(sea, true));
      a.appendChild(tile);
      var body = el('div', 'rd-set__body');
      body.appendChild(el('p', 'rd-set__brand', f.brand));
      var h = el('h3', 'rd-set__title');
      h.id = 'rd-set-t-' + i;
      var hl = el('a', 'rd-set__link', nm16(f) || f.brand);
      hl.href = f.url;
      h.appendChild(hl);
      body.appendChild(h);
      var rows = el('div', 'rd-set__rows');
      [['Front', f], ['Rear', r]].forEach(function (x) {
        var t = x[1];
        var row = el('div', 'rd-set__row');
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', x[0] + ' tires');
        row.appendChild(el('span', 'rd-set__pos', x[0]));
        var sz = el('span', 'rd-set__size');
        var sl = el('a', null, t.size);
        sl.href = t.url;
        sl.setAttribute('aria-label', x[0] + ' ' + t.size + ', ' + (t.brand + ' ' + nm16(t)).trim());
        sz.appendChild(sl);
        if (t.spec) sz.appendChild(el('small', 'rd-set__spec', t.spec));
        row.appendChild(sz);
        var each = el('b', 'rd-set__each', money(t.cents));
        each.appendChild(el('small', 'rd-set__unit', ' /tire'));
        row.appendChild(each);
        rows.appendChild(row);
      });
      body.appendChild(rows);
      body.appendChild(el('p', 'rd-set__total-k', 'Set of 4 (2 front + 2 rear)'));
      body.appendChild(el('p', 'rd-set__total-v', money(s.cents)));
      if (s.ok) {
        var slow = f.rank >= r.rank ? f : r;
        var lw = slow.el.querySelector('.rd-card__lead');
        if (lw) {
          var lead = el('div', 'rd-set__lead');
          Array.prototype.forEach.call(lw.children, function (c) { lead.appendChild(document.importNode(c, true)); });
          body.appendChild(lead);
        }
      }
      var acts = el('div', 'rd-set__actions');
      if (s.ok && window.PTBookSets === true) {
        var b = el('button', 'rd-btn rd-btn--primary rd-set__book', 'Request install');
        b.type = 'button';
        b.setAttribute('data-book-set', 'staggered');
        b.setAttribute('data-from', 'set_card');
        b.setAttribute('data-set-key', s.key);
        b.setAttribute('data-vehicle-type', setVt(f.vtype, r.vtype));
        prefixed(f.book, 'front', f.lead).concat(prefixed(r.book, 'rear', r.lead)).forEach(function (kv) { b.setAttribute(kv[0], kv[1]); });
        b.setAttribute('aria-label', 'Request install: 2 front and 2 rear, ' + (f.brand + ' ' + nm16(f)).trim());
        b.setAttribute('onclick', BOOK_ONCLICK);
        acts.appendChild(b);
      } else {
        var c = el('a', 'rd-btnout rd-set__book', s.ok ? 'Call us to book this set' : 'Call us for options');
        c.href = 'tel:' + tel;
        acts.appendChild(c);
      }
      body.appendChild(acts);
      a.appendChild(body);
      return a;
    }
    // v16: the Season filter and the phone season items come from the
    // FRONT size's facet. In the Sets tab they show only when the sets
    // themselves have 2+ seasons (or one is picked), so a summer-only list
    // offers no dead-end winter link.
    function seasonsFor(view) {
      var hide = false;
      if (view === 'sets' && state) {
        var seen = {};
        state.sets.forEach(function (x) { if (x.f && x.f.season) seen[x.f.season] = 1; });
        hide = Object.keys(seen).length < 2 && !cur().getAll(SEASON).length;
      }
      $all('[data-rd-quick] .rd-q--season').forEach(function (a) { a.hidden = hide; });
      var g = side && side.querySelector('[data-rd-group="season"]');
      if (g) g.hidden = hide;
    }
    function axleCard(f, axle) {
      var n = document.importNode(f.el, true);
      var b = n.querySelector('.ptg__card-book');
      if (b) { b.setAttribute('data-qty', '2'); b.setAttribute('data-stagger-axle', axle); }
      return n;
    }
    function moreBtn(text, onClick) {
      var w = el('div', 'rd-pair__more');
      var b = el('button', 'rd-btn rd-btn--line rd-btn--block', text);
      b.type = 'button';
      b.addEventListener('click', onClick);
      w.appendChild(b);
      return w;
    }
    // Draw `step` more items into box; focus the first new one.
    function page(box, list, make, step, label, focus) {
      var have = box.children.length;
      var first = null;
      list.slice(have, have + step).forEach(function (x, i) {
        var n = make(x, have + i);
        box.appendChild(n);
        if (!first) first = n;
      });
      var wrap = box.nextElementSibling && box.nextElementSibling.classList.contains('rd-pair__more') ? box.nextElementSibling : null;
      if (box.children.length < list.length) {
        if (!wrap) {
          wrap = moreBtn(label, function () { page(box, list, make, step, label, true); });
          box.parentNode.insertBefore(wrap, box.nextSibling);
        }
      } else if (wrap) wrap.parentNode.removeChild(wrap);
      if (focus && first) {
        var l = first.querySelector('.rd-set__link, .rd-card__link');
        if (l) { try { l.focus({ preventScroll: false }); } catch (e) { l.focus(); } }
      }
    }
    function render() {
      var st = state;
      host.innerHTML = '';
      host.hidden = false;
      pairDone();
      var tabs = el('div', 'rd-tabs rd-tabs--light rd-pair__tabs');
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Show');
      var panels = {};
      TABS.forEach(function (t) {
        var b = el('button', 'rd-tab', t[1]);
        b.type = 'button';
        b.id = 'rd-pair-tab-' + t[0];
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-controls', 'rd-pair-panel-' + t[0]);
        b.setAttribute('data-rd-pair-tab', t[0]);
        tabs.appendChild(b);
        var p = el('div', 'rd-pair__panel');
        p.id = 'rd-pair-panel-' + t[0];
        p.setAttribute('role', 'tabpanel');
        p.setAttribute('aria-labelledby', b.id);
        p.tabIndex = -1;
        // A visually hidden h2 per panel: H1 -> h2 (the tab's name) -> the
        // h3 card titles, so heading navigation never skips a level.
        p.appendChild(el('h2', 'rd-pair__sr', t[1]));
        panels[t[0]] = p;
      });
      if (IS_TIRES) {
        // v16: the rotation note sits at the end of the tab row (phones: one line under it).
        var trow = el('div', 'rd-pair__tabrow');
        trow.appendChild(tabs);
        if (st.sets.length) {
          var nt = el('p', 'rd-pair__rot');
          nt.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg><span></span>';
          nt.querySelector('span').textContent = 'Sizes differ front to rear, so these tires can\'t be rotated.';
          trow.appendChild(nt);
        }
        host.appendChild(trow);
      } else host.appendChild(tabs);
      var live = el('p', 'rd-pair__sr');
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      host.appendChild(live);

      // Sets
      var ps = panels.sets;
      if (!st.nF || !st.nR) {
        var miss = !st.nF && !st.nR ? FRONT + ' or ' + REAR : !st.nF ? FRONT : REAR;
        var other = !st.nF && st.nR ? tabBtn('rear', 'See ' + REAR + ' only') : st.nF && !st.nR ? tabBtn('front', 'See ' + FRONT + ' only') : null;
        var cl = clearLink();
        ps.appendChild(emptyBox('We don\'t carry ' + miss + ' right now', cl ? 'Try fewer filters, or call us and we\'ll find a set.' : 'Call us and we\'ll find a set that fits.', [other, cl].filter(Boolean)));
      } else if (!st.sets.length) {
        var cl2 = clearLink();
        ps.appendChild(emptyBox('No tire model comes in both sizes' + (cl2 ? ' with these filters' : ''), 'You can still see each size on its own, or call us and we\'ll find a set.', [tabBtn('front', 'See front only'), tabBtn('rear', 'See rear only'), cl2].filter(Boolean)));
      } else {
        if (!IS_TIRES) ps.appendChild(el('p', 'rd-pair__note', 'Front and rear sizes differ, so these tires can\'t be rotated front to back.'));
        var sb = el('div', 'rd-sets');
        sb.setAttribute('data-rd-sets', '');
        ps.appendChild(sb);
        page(sb, st.sets, IS_TIRES ? setCard16 : setCard, SETS_STEP, 'Show more sets', false);
      }
      // Front only / Rear only: every tire of that size (sets included).
      [['front', st.fronts, FRONT, st.nF], ['rear', st.rears, REAR, st.nR]].forEach(function (x) {
        var p = panels[x[0]];
        if (!x[1].length) {
          p.appendChild(emptyBox('We don\'t carry ' + x[2] + ' right now', 'Call us and we\'ll find them.', []));
          return;
        }
        var g = el('div', 'rd-grid ptg__grid rd-pair__grid');
        g.setAttribute('data-rd-pair-grid', x[0]);
        p.appendChild(g);
        page(g, x[1], function (f) { return axleCard(f, x[0]); }, GRID_STEP, 'Show more tires', false);
        fitment(g);
      });
      TABS.forEach(function (t) { host.appendChild(panels[t[0]]); });
      select(st.view, false, true);
      setTimeout(function () { live.textContent = st.sets.length ? 'Sets for ' + FRONT + ' front and ' + REAR + ' rear are shown.' : 'No sets found for ' + FRONT + ' front and ' + REAR + ' rear.'; }, 50);
    }
    function select(view, focus, initial) {
      if (!state) return;
      if (['sets', 'front', 'rear'].indexOf(view) === -1) view = 'sets';
      state.view = view;
      $all('[data-rd-pair-tab]', host).forEach(function (b) {
        var on = b.getAttribute('data-rd-pair-tab') === view;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle('is-on', on);
        if (on && focus) b.focus();
      });
      TABS.forEach(function (t) {
        var p = document.getElementById('rd-pair-panel-' + t[0]);
        if (p) p.hidden = t[0] !== view;
      });
      setShown(view === 'sets' ? state.sets.length : view === 'front' ? state.fronts.length : state.rears.length, view === 'sets' && IS_TIRES);
      // fix2: no sort in the address lists the sets by total, low to high:
      // Sort says so on Sets (Front / Rear only keep the page's order).
      if (IS_TIRES && !q0.get('sort_by')) {
        $all('[data-rd-sort]').forEach(function (sl) {
          if (!sl.hasAttribute('data-rd-sort0')) sl.setAttribute('data-rd-sort0', sl.value);
          sl.value = view === 'sets' ? 'price-ascending' : sl.getAttribute('data-rd-sort0');
        });
      }
      if (brandPair) brandPair(view === 'front' ? null : view === 'sets' ? state.brands.s : state.brands.r);
      if (IS_TIRES) seasonsFor(view);
      try {
        var p = cur();
        if (view === 'sets') p.delete('view'); else p.set('view', view);
        var qs = p.toString();
        history.replaceState(history.state, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
      } catch (e) {}
      if (!initial) track('pt_stagger_tab', { tab: view, front_size: FRONT, rear_size: REAR });
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-rd-pair-tab]');
      if (t) { select(t.getAttribute('data-rd-pair-tab'), false); return; }
      var g = e.target.closest && e.target.closest('[data-rd-pair-goto]');
      if (g) {
        select(g.getAttribute('data-rd-pair-goto'), true);
        return;
      }
      var r = e.target.closest && e.target.closest('[data-rd-pair-retry]');
      if (r) { load(); return; }
    });
    // Capture: the button's own onclick stops the click from bubbling.
    host.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-book-set]');
      if (b) track('pt_stagger_request_install', { pair_key: b.getAttribute('data-set-key'), front_handle: b.getAttribute('data-front-product-handle'), rear_handle: b.getAttribute('data-rear-product-handle'), front_size: FRONT, rear_size: REAR });
    }, true);
    host.addEventListener('keydown', function (e) {
      var t = e.target.closest && e.target.closest('[data-rd-pair-tab]');
      if (!t) return;
      var order = TABS.map(function (x) { return x[0]; });
      var i = order.indexOf(t.getAttribute('data-rd-pair-tab'));
      var j = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1;
      if (j === -1) return;
      e.preventDefault();
      select(order[j], true);
    });

    // Not paired: the normal grid comes back, with a note.
    function fallback(note, retry) {
      hideLiquid(false);
      pairDone();
      if (brandPair) brandPair(null);
      if (h1) { h1.innerHTML = h1Orig; h1.classList.remove('is-pair'); }
      if (shown) shown.innerHTML = shownOrig;
      host.hidden = false;
      host.innerHTML = '';
      var p = el('p', 'rd-note rd-pair__fallback', note);
      p.setAttribute('role', 'status');
      if (retry) {
        var b = el('button', 'rd-btn rd-btn--line rd-pair__retry', 'Try again');
        b.type = 'button';
        b.setAttribute('data-rd-pair-retry', '');
        p.appendChild(document.createTextNode(' '));
        p.appendChild(b);
      }
      host.appendChild(p);
    }

    // Brands for the brand row: { s: brands that make a set, r: brands in
    // the rear size }. With a brand picked the fetches only hold that
    // brand, so the lists from this pair's last unpicked load are reused
    // (sessionStorage, this tab only; without them only the picked brand).
    function pairBrands(sets, rears) {
      function uniq(list) {
        var seen = {}, out = [];
        list.forEach(function (x) { var k = String(x || '').toLowerCase(); if (k && !seen[k]) { seen[k] = true; out.push(x); } });
        return out;
      }
      var b = { s: uniq(sets.map(function (x) { return x.f.vendor; })), r: uniq(rears.map(function (x) { return x.vendor; })) };
      var p = cur();
      var picked = p.getAll('filter.p.vendor');
      ['filter.p.vendor', 'view', 'page'].forEach(function (k) { p.delete(k); });
      if (p.sort) p.sort();
      var key = 'rdPairBrands:' + window.location.pathname + '?' + p.toString();
      try {
        if (!picked.length) window.sessionStorage.setItem(key, JSON.stringify(b));
        else {
          var c = JSON.parse(window.sessionStorage.getItem(key) || 'null');
          if (c && c.s && c.r) b = { s: uniq(c.s.concat(b.s)), r: uniq(c.r.concat(b.r)) };
        }
      } catch (e) {}
      return b;
    }

    function load() {
      var me = ++run;
      if (ctl) { try { ctl.abort(); } catch (e) {} }
      ctl = window.AbortController ? new AbortController() : null;
      reqs = 0;
      tStart = Date.now();
      hideLiquid(true);
      if (h1) { if (IS_TIRES) pairTitle(); else h1.textContent = FRONT + ' front + ' + REAR + ' rear'; }
      setShown(null);
      status('Finding sets for ' + FRONT + ' front + ' + REAR + ' rear…', true);
      var fu = frontUrl(), ru = rearUrl();
      var reuse = onPage1 && !!grid;
      var info = { front_size: FRONT, rear_size: REAR };
      Promise.all([count(fu), count(ru)]).then(function (n) {
        if (me !== run) return null;
        var nF = n[0], nR = n[1];
        if (nF == null || nR == null) throw new Error('count');
        var pF = Math.ceil(nF / perPage), pR = Math.ceil(nR / perPage);
        var need = reqs + Math.max(0, pF - (reuse ? 1 : 0)) + pR;
        if (pF > MAX_PAGES || pR > MAX_PAGES || need > MAX_REQ) {
          fallback('Narrow by season or brand to see sets for ' + FRONT + ' front + ' + REAR + ' rear.', false);
          track('pt_stagger_results', Object.assign({ outcome: 'capped', capped: true, ms: Date.now() - tStart }, info));
          return null;
        }
        return Promise.all([nF ? pagesOf(fu, nF, reuse && nF > 0) : Promise.resolve([]), nR ? pagesOf(ru, nR, false) : Promise.resolve([])])
          .then(function (lists) { return { nF: nF, nR: nR, lists: lists, pages: pF + pR }; });
      }).then(function (got) {
        if (!got || me !== run) return;
        // The URL may have changed meanwhile (only view= may differ).
        var now = cur();
        if (now.get('rear') !== q0.get('rear')) return;
        var fronts = axleList(got.lists[0], FRONT), rears = axleList(got.lists[1], REAR);
        var sets = buildSets(fronts, rears, sortBy);
        var v = now.get('view');
        state = { nF: fronts.length, nR: rears.length, fronts: fronts, rears: rears, sets: sets, brands: pairBrands(sets, rears), view: v === 'front' || v === 'rear' ? v : 'sets' };
        render();
        if (rerestore) setTimeout(rerestore, 0);
        track('pt_stagger_results', Object.assign({
          outcome: !rears.length ? 'rear_not_carried' : !fronts.length ? 'front_not_carried' : sets.length ? 'sets' : 'no_sets',
          sets: sets.length, front_n: fronts.length, rear_n: rears.length, pages: got.pages, requests: reqs, capped: false, ms: Date.now() - tStart
        }, info));
      }).catch(function (err) {
        if (me !== run || (err && err.name === 'AbortError')) return;
        fallback('We couldn\'t load the rear size, so these are the front tires only.', true);
        track('pt_stagger_results', Object.assign({ outcome: 'error', ms: Date.now() - tStart }, info));
      });
    }
    window.addEventListener('pagehide', function () { if (ctl) { try { ctl.abort(); } catch (e) {} } });
    load();
  })();

  /* ── Set cart (2 front + 2 rear in one /cart/add.js) ──
     window.PTSetCart.add({ variantId }, { variantId }) -> Promise<{ ok, count }>.
     Both lines carry Position (Front / Rear) and a fresh _set id, so a
     failed add removes exactly its own lines again (/cart.js +
     /cart/change.js) and never touches anything else in the cart. The error
     text is fixed: Shopify's own description can quote stock counts.
     Not wired to any button yet (SET_CART above; stage 9 with pt-cart). */
  if (!window.PTSetCart) window.PTSetCart = {
    error: 'We couldn\'t add this set to your cart. Call us and we\'ll sort it out.',
    add: function (fr, rr) {
      var id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      var H = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
      function cartCount() {
        return fetch('/cart.js', { headers: H, credentials: 'same-origin' }).then(function (r) { return r.json(); });
      }
      function rollback() {
        return cartCount().then(function (cart) {
          var lines = ((cart && cart.items) || []).filter(function (it) { return it && it.properties && it.properties._set === id; });
          return lines.reduce(function (p, it) {
            return p.then(function () {
              return fetch('/cart/change.js', { method: 'POST', headers: H, credentials: 'same-origin', body: JSON.stringify({ id: it.key, quantity: 0 }) });
            });
          }, Promise.resolve()).then(cartCount);
        }).then(function (c) { return { ok: false, count: c && c.item_count, error: window.PTSetCart.error }; },
          function () { return { ok: false, count: null, error: window.PTSetCart.error }; });
      }
      if (!fr || !rr || !fr.variantId || !rr.variantId) return Promise.resolve({ ok: false, count: null, error: window.PTSetCart.error });
      return fetch('/cart/add.js', {
        method: 'POST', headers: H, credentials: 'same-origin',
        body: JSON.stringify({ items: [
          { id: +fr.variantId, quantity: 2, properties: { Position: 'Front', _set: id } },
          { id: +rr.variantId, quantity: 2, properties: { Position: 'Rear', _set: id } }
        ] })
      }).then(function (r) {
        return r.json().then(function (j) { return { r: r, j: j }; }, function () { return { r: r, j: null }; });
      }).then(function (x) {
        var items = (x.j && x.j.items) || [];
        if (!x.r.ok || !x.j || x.j.status || items.length < 2) return rollback();
        return cartCount().then(function (c) { return { ok: true, count: c && c.item_count }; }, function () { return { ok: true, count: null }; });
      }, rollback);
    }
  };
})();
