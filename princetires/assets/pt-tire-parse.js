/* Prince Tires — shared tire-size parser + search analytics.
   Single source of truth. Loaded globally; exposes window.PTTireParse. */
(function (root) {
  'use strict';

  // Flotation section width -> canonical NN.NN  ("12.5"/"1250"/"12.50" -> "12.50")
  function normalizeSection(t) {
    t = String(t).replace(',', '.');
    var n;
    if (t.indexOf('.') !== -1) n = parseFloat(t);
    else if (t.length >= 3) n = parseInt(t, 10) / 100;
    else n = parseInt(t, 10);
    return isNaN(n) ? '' : n.toFixed(2);
  }

  // Parse a tire size from any string.
  // Returns { width, profile, rim, flotation, canonical } or null.
  function parseSize(s) {
    if (!s) return null;
    var up = String(s).toUpperCase();

    // Flotation: 35X12.50R20, 35x1250r20, 33×12.50R20, LT35X12.50R20
    var fl = up.match(/(\d{2})\s*[X×]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*R?\s*(\d{2})/);
    if (fl) {
      var fw = String(+fl[1]), fp = normalizeSection(fl[2]), fr = String(+fl[3]);
      return { width: fw, profile: fp, rim: fr, flotation: true, canonical: fw + 'X' + fp + 'R' + fr };
    }
    // Metric: 225/65R17, P225/65R17, LT265/70R16, 245/35ZR19, 205/55ZRF16
    var m = up.match(/(\d{3})\s*\/?\s*(\d{2,3})\s*[A-Z]{0,2}R[A-Z]?\s*(\d{2})/);
    if (m) {
      var mw = String(+m[1]), mp = String(+m[2]), mr = String(+m[3]);
      return { width: mw, profile: mp, rim: mr, flotation: false, canonical: mw + '/' + mp + 'R' + mr };
    }
    // Euro-metric, no aspect ratio: 145R12, 185R14, 155R12C
    var eu = up.match(/(?:^|\s)(\d{3})\s*[A-Z]?R\s*(\d{2})[A-Z]?(?:\s|$)/);
    if (eu) {
      var ew = String(+eu[1]), er = String(+eu[2]);
      return { width: ew, profile: '', rim: er, flotation: false, canonical: ew + 'R' + er };
    }
    // Compact size embedded in free text: "33125020 lt", "2055515 cooper tires"
    var efl = up.match(/\b(\d{2})(\d{2})(\d{2})(\d{2})\b/);
    if (efl) {
      var ew2 = String(+efl[1]), ep2 = efl[2] + '.' + efl[3], er2 = String(+efl[4]);
      return { width: ew2, profile: ep2, rim: er2, flotation: true, canonical: ew2 + 'X' + ep2 + 'R' + er2 };
    }
    var emt = up.match(/\b(\d{3})(\d{2})(\d{2})\b/);
    if (emt) {
      var mw2 = String(+emt[1]), mp2 = String(+emt[2]), mr2 = String(+emt[3]);
      return { width: mw2, profile: mp2, rim: mr2, flotation: false, canonical: mw2 + '/' + mp2 + 'R' + mr2 };
    }
    // Compact digits-only: strip separators, then 8-digit flotation or 7-digit metric
    var compact = up.replace(/[\s/\-X×R.]/g, '');
    var fdm = compact.match(/^(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (fdm) {
      var cw = String(+fdm[1]), cp = fdm[2] + '.' + fdm[3], cr = String(+fdm[4]);
      return { width: cw, profile: cp, rim: cr, flotation: true, canonical: cw + 'X' + cp + 'R' + cr };
    }
    var dm = compact.match(/^(?:P|LT|ST)?(\d{3})(\d{2})(\d{2})$/);
    if (dm) {
      var dw = String(+dm[1]), dp = String(+dm[2]), dr = String(+dm[3]);
      return { width: dw, profile: dp, rim: dr, flotation: false, canonical: dw + '/' + dp + 'R' + dr };
    }
    // Spaced metric: "225 55 17"
    var sp = up.match(/(\d{3})\s+(\d{2})\s+(\d{2})/);
    if (sp) {
      var sw = String(+sp[1]), spp = String(+sp[2]), sr = String(+sp[3]);
      return { width: sw, profile: spp, rim: sr, flotation: false, canonical: sw + '/' + spp + 'R' + sr };
    }
    return null;
  }

  // Build Shopify collection size-filter params for a parsed size.
  function sizeFilterParams(parsed) {
    var p = new URLSearchParams();
    if (!parsed) return p;
    if (parsed.width)   p.set('filter.p.m.custom.tire_width', parsed.width);
    if (parsed.profile) p.set('filter.p.m.custom.tire_profile', parsed.profile);
    if (parsed.rim)     p.set('filter.p.m.custom.rim_diameter', parsed.rim);
    return p;
  }

  // Push a standardized search event to GTM's dataLayer. Never throws.
  function track(props) {
    try {
      root.dataLayer = root.dataLayer || [];
      root.dataLayer.push(Object.assign({ event: 'pt_search' }, props || {}));
    } catch (e) { /* analytics must never break a widget */ }
  }

  // Synonym map: keys are lowercase tokens/phrases to replace, values are the
  // canonical strings the intent parsers recognise.  Only genuine gaps are listed —
  // season words (winter, snow, ice, all-season, all-weather, summer, performance)
  // and every vendor-catalogue brand are already handled by the parsers directly.
  var SYNONYM_MAP = {
    // Brand abbreviations not present as a vendor name token
    'bfg':              'BFGoodrich',
    // Wheels/rims — normalised so intent parsers that key on 'rim' still fire
    'wheels':           'rims',
    'wheel':            'rim',
    // Mud-terrain shorthands (the service-type detector already handles LT/ST;
    // these let a query like "MT tires" or "M/T tires" surface as a season-neutral
    // brand-neutral search rather than silently doing nothing)
    'm/t':              'mud terrain',
    'm-t':              'mud terrain',
    // All-terrain shorthands
    'a/t':              'all terrain',
    'a-t':              'all terrain',
    // Highway-terrain shorthand
    'h/t':              'highway terrain',
    'h-t':              'highway terrain'
  };

  // Expand synonym aliases in a query string.
  // Returns the query with any recognised alias tokens replaced by their
  // canonical equivalents, lower-cased key, exact word-boundary match.
  // The parsers should call this at the top of their intent-detection logic.
  function expandSynonyms(query) {
    if (!query) return query;
    var result = query;
    var keys = Object.keys(SYNONYM_MAP);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), SYNONYM_MAP[k]);
    }
    return result;
  }

  root.PTTireParse = {
    parseSize: parseSize,
    normalizeSection: normalizeSection,
    sizeFilterParams: sizeFilterParams,
    track: track,
    expandSynonyms: expandSynonyms,
    version: 1
  };
})(window);
