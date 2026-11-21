/* =====================================================================
   pt-vehicle-pairs.js - staggered sets (front + rear tire sizes).

   window.PTVehiclePairs.url({ front, rear, seasons, stockAll })
     THE one builder for a pair-mode results URL (staggered plan, resolution
     11). Every vehicle search that knows a front + rear pair goes through
     it, so the results page (assets/pt-rd-results.js, pair mode) always
     reads the same format:

       /collections/tires-{frontRim}-inch
         ?filter.p.m.custom.tire_width=W
         &filter.p.m.custom.tire_profile=A
         &filter.p.m.custom.rim_diameter=R
         [&filter.p.m.custom.seasonality=S ...]
         &filter.v.availability=1          (or stock=all when stockAll)
         &rear=W%2FARR                      (no P / LT prefix: the class
                                             comes from the front tire)

     front, rear: a size string ("245/40R18", "LT275/65R18", "245/40ZR18",
       "35X12.50R20") or { w, a, r[, kind] }.
     rear: optional. Left out, or the same size as the front: the plain
       front-size URL (no rear param). Given but not a tire size: null.
     seasons: optional season value or list ("Winter", "All-Season" ...).
     stockAll: true = include sold-out (stock=all), like "Hide sold out" off.

     Returns null when the front rim has no tires-NN-inch collection
     (window.PTRim.tires, snippets/pt-rim-route): the caller then shows the
     single sizes. It never routes to /collections/tires, which ignores every
     filter (more than 5,000 products).

     brand: optional vendor ("Michelin"), kept as filter.p.vendor.

   window.PTVehiclePairs.lookup({ year, make, model, trim, sizes })
     -> Promise<answer | null>. GET https://app.princetires.ca/api/vehicle-pairs
     (princetires-app src/app/api/vehicle-pairs/route.ts + src/lib/fitment/
     vehicle-pairs.ts): which factory front + rear pairs the trim came with.
     `sizes` MUST be the trim's own size list from the year file
     (pt-vehicle-YYYY.json): the server only returns a pair whose two sizes
     are both in it ("SS 1LE Pkg." would get the plain SS pair from its name
     alone). Fewer than 2 distinct sizes: no request, resolves null.
     2.5 s timeout. Resolves null on ANY error, timeout, non-200 (429, 503),
     or a malformed answer: the caller then does exactly what it did before.
     The answer (only sizes: no prices, stock or supplier names):
       { vehicle, match, basis, confident, staggered,
         pairs: [{ front, rear, rimFront, rimRear, oe: 'standard'|'option' }],
         sameSize: ['225/50R17'],      server: on all four wheels (may
                                       also be a size a pair uses: a car
                                       sold both square and staggered)
         others: ['245/45R19'],        sent sizes neither in a pair nor
                                       sameSize (shown only as single sizes)
         mayDiffer: true|false,        an `others` size may be only the
                                       front or only the rear size: the
                                       server said so, a pair was dropped
                                       here, the car is staggered (its
                                       leftovers are never "your size"),
                                       or there is no set and sameSize
                                       does not cover every sent size
                                       (then sameSize is emptied into
                                       others: nothing says "all four";
                                       not for LT / flotation sizes)
         sizes: [...] }                what was sent
     pairs keeps only the ones url() can open (the front rim has a
     tires-NN-inch collection); a dropped pair's sizes move to `others`.
     staggered = pairs.length > 0; confident is false when there are none
     or a pair was dropped.

   window.PTVehiclePairs.only(answer) -> the one pair to route straight to,
     or null. Only when the server is confident (model or trim-name match),
     there is exactly ONE pair, it is a standard (is_stock) fitment, and every
     size the trim lists belongs to it (no sameSize, no others).
   window.PTVehiclePairs.label(pair) -> "245/40R20 front · 275/35R20 rear"
   window.PTVehiclePairs.sentence(answer, car)   (owner decision 8)
     only(answer)        -> "Your <car> uses 245/40R20 front and 275/35R20 rear."
     confident, several  -> "Your car came with one of these — check the
                             sticker in the driver's door."
     not confident       -> "These sizes usually go front and rear — check
                             the sticker in the driver's door."
     no set, mayDiffer   -> "Front and rear may differ on this car — check
                             the sticker in the driver's door."
     (never "uses" without only(); '' when not staggered and not mayDiffer)
   window.PTVehiclePairs.note -> "Staggered tires can't be rotated front to back."

   Loaded by sections/pt-collection-grid.liquid, sections/hero-smart-search,
   snippets/pt-tire-search and snippets/pt-collection-research-strip (each
   with its own asset_url tag; running it twice is harmless).
   ===================================================================== */
(function () {
  'use strict';
  var P = window.PTVehiclePairs = window.PTVehiclePairs || {};
  if (P.lookup) return; // already loaded on this page

  function sane(z) {
    var w = +z.w, a = parseFloat(z.a), r = +z.r;
    if (z.kind === 'flot') return w >= 26 && w <= 44 && a >= 7 && a <= 18 && r >= 14 && r <= 26;
    return w >= 125 && w <= 395 && a >= 25 && a <= 95 && r >= 12 && r <= 26;
  }
  function dec2(a) {
    var p = String(a).split('.');
    var d = p[1] || '00';
    if (d.length === 1) d += '0';
    return p[0] + '.' + d;
  }
  // A size string or { w, a, r[, kind] } -> { kind, w, a, r } | null.
  function parse(s) {
    var z = null;
    if (s && typeof s === 'object') {
      var w = String(s.w || '').trim(), a = String(s.a || '').trim(), r = String(s.r || '').trim();
      if (!/^\d{2,3}$/.test(w) || !/^\d{1,3}(?:\.\d{1,2})?$/.test(a) || !/^\d{2}$/.test(r)) return null;
      var flot = s.kind === 'flot' || w.length === 2 || a.indexOf('.') !== -1;
      z = flot ? { kind: 'flot', w: w, a: dec2(a), r: r } : { kind: 'metric', w: w, a: a, r: r };
    } else {
      var t = String(s || '').trim().toUpperCase();
      var m = /^(?:P|LT|ST|T)?\s*(\d{3})\s*[\/\-\s]\s*(\d{2,3})\s*(?:Z?R|[\/\-\s])\s*(\d{2})(?![\d.])/.exec(t);
      if (m) z = { kind: 'metric', w: m[1], a: m[2], r: m[3] };
      else {
        m = /^(\d{2})\s*[X×]\s*(\d{1,2}(?:\.\d{1,2})?)\s*Z?R\s*(\d{2})(?![\d.])/.exec(t);
        if (m) z = { kind: 'flot', w: m[1], a: dec2(m[2]), r: m[3] };
      }
    }
    return z && sane(z) ? z : null;
  }
  function fmt(z) { return z.w + (z.kind === 'flot' ? 'X' : '/') + z.a + 'R' + z.r; }

  P.url = function (o) {
    o = o || {};
    var f = parse(o.front);
    if (!f) return null;
    var map = (window.PTRim && window.PTRim.tires) || {};
    if (!(map[f.r] > 0)) return null;
    var r = null;
    if (o.rear != null && o.rear !== '') {
      r = parse(o.rear);
      if (!r || r.kind !== f.kind) return null;
      if (fmt(r) === fmt(f)) r = null; // same size all round: a plain search
    }
    var p = new URLSearchParams();
    p.set('filter.p.m.custom.tire_width', f.w);
    p.set('filter.p.m.custom.tire_profile', f.a);
    p.set('filter.p.m.custom.rim_diameter', f.r);
    var ss = o.seasons == null ? [] : [].concat(o.seasons);
    ss.forEach(function (x) { x = String(x || '').trim(); if (x) p.append('filter.p.m.custom.seasonality', x); });
    (o.brand == null ? [] : [].concat(o.brand)).forEach(function (x) { x = String(x || '').trim(); if (x) p.append('filter.p.vendor', x); });
    if (o.stockAll) p.set('stock', 'all');
    else p.append('filter.v.availability', '1');
    if (r) p.set('rear', fmt(r));
    // Owner 2026-11-17: a tire size search lands cheapest first.
    p.set('sort_by', o.sortBy || 'price-ascending');
    return '/collections/tires-' + f.r + '-inch?' + p.toString();
  };

  /* ── lookup: GET /api/vehicle-pairs ── */
  var ENDPOINT = 'https://app.princetires.ca/api/vehicle-pairs';
  var TIMEOUT_MS = 2500;
  var SS_PREFIX = 'pt-vpairs:';
  var mem = {};
  function key(z) { return fmt(z); }
  function ssGet(k) { try { var v = window.sessionStorage.getItem(SS_PREFIX + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(SS_PREFIX + k, JSON.stringify(v)); } catch (e) {} }

  // The server's answer -> what the theme uses, or null when it is not the
  // shape we know. Pairs url() cannot open are dropped (their sizes become
  // single sizes); the server's front / rear labels are kept as given.
  function settle(j, sent) {
    if (!j || typeof j !== 'object' || !Array.isArray(j.pairs) || typeof j.confident !== 'boolean') return null;
    var pairs = [], used = {}, dropped = {};
    j.pairs.forEach(function (x) {
      if (!x || typeof x.front !== 'string' || typeof x.rear !== 'string') return;
      var f = parse(x.front), r = parse(x.rear);
      if (!f || !r || f.kind !== r.kind || key(f) === key(r)) return;
      if (!P.url({ front: f, rear: r })) { dropped[key(f)] = 1; dropped[key(r)] = 1; return; }
      if (pairs.some(function (y) { return y._k === key(f) + '>' + key(r); })) return;
      pairs.push({ front: x.front, rear: x.rear, rimFront: +f.r, rimRear: +r.r, oe: x.oe === 'standard' ? 'standard' : 'option', _k: key(f) + '>' + key(r) });
      used[key(f)] = 1; used[key(r)] = 1;
    });
    var same = [], sameK = {};
    (Array.isArray(j.sameSize) ? j.sameSize : []).forEach(function (s) {
      var z = typeof s === 'string' ? parse(s) : null;
      // A size a pair also uses stays: the server lists it only when the car
      // is ALSO sold with it on all four wheels (curated squareSizes).
      if (!z || sameK[key(z)]) return;
      sameK[key(z)] = 1; same.push(s);
    });
    var others = [];
    sent.forEach(function (s) {
      var k = key(parse(s));
      if (!used[k] && !sameK[k]) others.push(s);
    });
    pairs.forEach(function (x) { delete x._k; });
    var lost = Object.keys(dropped).length > 0;
    /* Belt and braces (2026-11-15 review): no set, and 2+ different sizes
       that "same size on all four" does not fully cover. Some size is left
       that nothing placed, so ANY of them may be one end of a staggered set
       (an older answer put a Boss 302's FRONT size on all four). Then no
       size says "all four": every size is offered as "front or rear only?"
       with the "may differ" line. Not for truck sizes (LT or flotation),
       which are never searched as front + rear sets. */
    var truck = sent.some(function (s) { var z = parse(s); return !z || z.kind === 'flot' || /^\s*LT/i.test(s); });
    var belt = !pairs.length && others.length > 0 && sent.length > 1 && !truck;
    if (belt) { others = sent.filter(function (s) { return !used[key(parse(s))]; }); same = []; }
    return {
      vehicle: j.vehicle || null, match: String(j.match || ''), basis: String(j.basis || ''),
      confident: !!j.confident && pairs.length > 0 && !lost, staggered: pairs.length > 0,
      pairs: pairs, sameSize: same, others: others, sizes: sent.slice(), dropped: lost,
      // A dropped pair's halves are front-only / rear-only sizes; a staggered
      // car's leftovers are never "one size for all four" either.
      mayDiffer: others.length > 0 && (!!j.mayDiffer || lost || pairs.length > 0 || belt)
    };
  }

  P.lookup = function (o) {
    o = o || {};
    // The trim's own sizes, one per real size (245/40R20 = 245/40ZR20).
    var sent = [], seen = {};
    [].concat(o.sizes || []).forEach(function (s) {
      if (typeof s !== 'string') s = s && (s.size || s.front) || '';
      var z = parse(s);
      if (!z || seen[key(z)] || String(s).length > 24) return;
      seen[key(z)] = 1; sent.push(String(s).trim());
    });
    var year = String(o.year || '').trim(), make = String(o.make || '').trim(), model = String(o.model || '').trim();
    var trim = String(o.trim || '').trim();
    if (sent.length < 2 || !/^\d{4}$/.test(year) || !make || !model || !window.fetch) return Promise.resolve(null);
    var q = new URLSearchParams();
    q.set('year', year); q.set('make', make); q.set('model', model);
    if (trim) q.set('trim', trim);
    q.set('sizes', sent.slice(0, 12).join(','));
    // Answer version: bumping it skips every browser / sessionStorage copy of
    // the older answers (2026-11-15: whole-make pairs removed server-side).
    q.set('v', '2');
    var k = q.toString();
    // The raw answer is what is remembered; it is checked against url() on
    // every call (which rims have a collection can't go stale that way).
    function out(raw) { return raw.then(function (j) { return j ? settle(j, sent) : null; }); }
    if (mem[k]) return out(mem[k]);
    var hit = ssGet(k);
    if (hit) { mem[k] = Promise.resolve(hit); return out(mem[k]); }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = null;
    var raw = new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (done) return; done = true; clearTimeout(timer); resolve(v); }
      timer = setTimeout(function () { if (ctl) { try { ctl.abort(); } catch (e) {} } finish(null); }, TIMEOUT_MS);
      var init = { method: 'GET', mode: 'cors', credentials: 'omit' };
      if (ctl) init.signal = ctl.signal;
      try {
        window.fetch(ENDPOINT + '?' + k, init)
          .then(function (r) { return r && r.status === 200 ? r.json() : null; })
          .then(function (j) { finish(j && settle(j, sent) ? j : null); }, function () { finish(null); });
      } catch (e) { finish(null); }
    });
    mem[k] = raw;
    // A failure is never remembered: the next pick asks again.
    raw.then(function (j) { if (j) ssSet(k, j); else delete mem[k]; });
    return out(raw);
  };

  P.only = function (a) {
    if (!a || !a.staggered || !a.confident || a.pairs.length !== 1) return null;
    if ((a.sameSize || []).length || (a.others || []).length) return null;
    return a.pairs[0].oe === 'standard' ? a.pairs[0] : null;
  };
  P.label = function (x) { return x ? x.front + ' front \u00b7 ' + x.rear + ' rear' : ''; };
  P.sentence = function (a, car) {
    if (a && !a.staggered && a.mayDiffer) return 'Front and rear may differ on this car \u2014 check the sticker in the driver\u2019s door.';
    if (!a || !a.staggered) return '';
    if (!a.confident) return 'These sizes usually go front and rear \u2014 check the sticker in the driver\u2019s door.';
    var one = P.only(a);
    if (one) return 'Your ' + (String(car || '').trim() || 'car') + ' uses ' + one.front + ' front and ' + one.rear + ' rear.';
    return 'Your car came with one of these \u2014 check the sticker in the driver\u2019s door.';
  };
  P.note = 'Staggered tires can\u2019t be rotated front to back.';
})();
