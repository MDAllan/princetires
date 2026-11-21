/* ==========================================================================
   Prince Tires — Seasonal hero scene (pt-hero-scene.js)

   Dresses the EXISTING hero. sections/hero-smart-search.liquid is not touched:
   its markup, its 128KB search engine and its styles all keep working exactly
   as they do today. This only adds scenery behind them and a line of copy above
   them, the same way pt-motion.js adds its depth layers.

   What it does, in order:
     1. Works out the season from the date (same windows as pt-hero-seasonal)
     2. Injects the layered scene - sky plate, road plate, tire cut-outs,
        two snow planes, a front road plate - behind the hero content
     3. Injects the season pill and the live-conditions pill above the H1
     4. Fetches current Calgary conditions from Open-Meteo (free, no API key)

   If any of it fails the hero is exactly the hero you have now.
   Image URLs are written by pt-hero-scene.css.liquid as CSS custom properties,
   so the artwork resolves through Shopify's file_url filter rather than being
   hardcoded here.
   ========================================================================== */
(function () {
  'use strict';

  var hero = document.querySelector('.hero-smart-search');
  if (!hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) var REDUCED = true;

  /* ---- 1. Season ------------------------------------------------------- */
  var d = new Date();
  var mmdd = (d.getMonth() + 1) * 100 + d.getDate();
  var season =
      (mmdd >= 901  && mmdd <= 1010) ? 'preseason'   :
      (mmdd >= 1011 && mmdd <= 1130) ? 'changeover'  :
      (mmdd >= 1201 || mmdd <= 310)  ? 'deep_winter' :
      (mmdd >= 311  && mmdd <= 430)  ? 'spring'      : 'summer';

  var SEASONS = {
    preseason:   { road: 'summer', lead: 'winter',     snow: true,  warm: false,
                   eyebrow: 'Winter tire season is coming' },
    changeover:  { road: 'winter', lead: 'winter',     snow: true,  warm: false,
                   eyebrow: 'Winter tire season is here' },
    deep_winter: { road: 'winter', lead: 'winter',     snow: true,  warm: false,
                   eyebrow: 'Winter tire trouble?' },
    spring:      { road: 'summer', lead: 'allseason',  snow: false, warm: true,
                   eyebrow: 'Time to swap back' },
    summer:      { road: 'summer', lead: 'allterrain', snow: false, warm: true,
                   eyebrow: 'Summer, truck & trailer' }
  };
  var S = SEASONS[season];

  // The season's tire leads; the rest fill in behind it.
  var ORDER = {
    winter:     ['winter', 'allweather', 'allseason', 'allterrain'],
    allseason:  ['allseason', 'allweather', 'allterrain', 'winter'],
    allterrain: ['allterrain', 'allseason', 'allweather', 'winter']
  }[S.lead];

  hero.classList.add('pt-scene', 'pt-scene--' + season);
  if (S.warm) hero.classList.add('pt-scene--warm');
  if (S.snow) hero.classList.add('pt-scene--snowy');
  hero.classList.add('pt-scene--road-' + S.road);

  /* ---- 2. Scene layers ------------------------------------------------- */
  var container = hero.querySelector('.hero-smart-search__container');
  if (container && !hero.querySelector('.pt-scene__sky')) {
    var frag = document.createDocumentFragment();
    function layer(cls, extra) {
      var el = document.createElement('div');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      if (extra) extra(el);
      frag.appendChild(el);
      return el;
    }
    layer('pt-scene__sky');
    layer('pt-scene__road pt-scene__road--far');
    layer('pt-scene__haze');
    if (S.snow && !REDUCED) layer('pt-scene__snow pt-scene__snow--far');
    layer('pt-scene__tires', function (el) {
      ORDER.forEach(function (kind, i) {
        var t = document.createElement('div');
        t.className = 'pt-scene__tire pt-scene__tire--' + (i + 1) + ' pt-scene__tire--' + kind;
        el.appendChild(t);
      });
    });
    if (S.snow && !REDUCED) layer('pt-scene__snow pt-scene__snow--near');
    layer('pt-scene__road pt-scene__road--near');
    layer('pt-scene__glow');
    layer('pt-scene__vignette');
    hero.insertBefore(frag, container);
  }

  /* ---- 3. Season + live-conditions pills ------------------------------- */
  var content = hero.querySelector('.hero-smart-search__content');
  var heading = hero.querySelector('.hero-smart-search__heading');
  var wxHost = null;
  if (content && heading && !hero.querySelector('.pt-scene__meta')) {
    var meta = document.createElement('div');
    meta.className = 'pt-scene__meta';

    var pill = document.createElement('p');
    pill.className = 'pt-scene__eyebrow';
    pill.innerHTML = '<span class="pt-scene__pulse" aria-hidden="true"></span>';
    pill.appendChild(document.createTextNode(S.eyebrow));
    meta.appendChild(pill);

    wxHost = document.createElement('p');
    wxHost.className = 'pt-scene__wx';
    wxHost.hidden = true;
    wxHost.innerHTML =
      '<span class="pt-scene__wx-dot" aria-hidden="true"></span>' +
      '<span data-pt-temp></span>' +
      '<span class="pt-scene__wx-sep" aria-hidden="true"></span>' +
      '<span class="pt-scene__wx-note" data-pt-condition hidden></span>';
    meta.appendChild(wxHost);

    content.insertBefore(meta, heading);
  }

  /* ---- 4. Live Calgary conditions -------------------------------------- */
  if (!wxHost) return;

  var LAT = 51.0227, LON = -114.0729;          // 111 42 Ave SW
  var KEY = 'pt-weather-v1', TTL = 30 * 60 * 1000;
  var URL = 'https://api.open-meteo.com/v1/forecast'
          + '?latitude=' + LAT + '&longitude=' + LON
          + '&current=temperature_2m,weather_code,snowfall'
          + '&timezone=America%2FEdmonton';
  var SNOW_CODES = [71, 73, 75, 77, 85, 86];
  var ICE_CODES  = [56, 57, 66, 67];

  function cached() {
    try {
      var o = JSON.parse(sessionStorage.getItem(KEY));
      return (o && Date.now() - o.t < TTL) ? o.d : null;
    } catch (e) { return null; }
  }
  function store(x) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: x })); } catch (e) {}
  }

  function paint(cur) {
    if (!cur || typeof cur.temperature_2m !== 'number') return;
    var temp = Math.round(cur.temperature_2m);
    var snowing  = SNOW_CODES.indexOf(cur.weather_code) > -1 || cur.snowfall > 0;
    var icy      = ICE_CODES.indexOf(cur.weather_code) > -1;
    var freezing = temp <= 0;

    // Shown as measured - this is the current air temperature, nothing else.
    var out = wxHost.querySelector('[data-pt-temp]');
    if (out) out.textContent = temp + '°C in Calgary';

    // A condition line only when there is something real to say. Ice outranks snow.
    var note = wxHost.querySelector('[data-pt-condition]');
    if (note) {
      var msg = icy ? 'freezing rain right now'
              : snowing ? 'snowing right now'
              : freezing ? 'below freezing' : '';
      note.textContent = msg;
      note.hidden = !msg;
    }
    wxHost.hidden = false;
    hero.classList.toggle('is-snowing', !!(snowing || icy));
    hero.classList.toggle('is-freezing', freezing);
  }

  var hit = cached();
  if (hit) { paint(hit); return; }

  var ctrl = ('AbortController' in window) ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
  fetch(URL, ctrl ? { signal: ctrl.signal } : undefined)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      clearTimeout(timer);
      if (!j || !j.current) return;
      store(j.current);
      paint(j.current);
    })
    .catch(function () { clearTimeout(timer); });   // silent by design
})();

/* ═════════════════════════════════════════════════════════════════════════════
   Section reveal on scroll
   ────────────────────────────────────────────────────────────────────────────
   Lives in this file deliberately. It is a second, separate concern from the
   hero scene, but this asset is already loaded with `defer` on every page, so
   putting it here means layout/theme.liquid is not touched at all - and
   theme.liquid is the one file whose breakage takes down every page on the
   store. A second <script> tag was not worth that risk for twenty lines.

   Why it earns its place: the homepage runs seventeen full-width sections and
   exactly one section in the whole theme uses the reveal machinery the theme
   already ships (assets/animations.js, the `scroll-trigger` class, Dawn's
   `animate--fade-in`) - and that one is main-page.liquid, which the homepage
   never renders. So everything arrives flat, and a long page of flat slabs
   reads as a list rather than as a composed page.

   Technique taken from Magic UI's Blur Fade: rise + fade + a short blur
   burn-off, which is what separates it from the usual fade-in - the blur is
   what makes it read as depth instead of opacity.

   Timing: .45s rise, .38s blur burn-off, 13px of travel. The first cut ran at
   .62s and read as sluggish over seventeen sections - the travel came down
   with the duration so the faster curve does not turn into a jump.

   SAFETY: the hidden state is applied from JS, never from a stylesheet. If
   this script fails, is blocked, or the browser has no IntersectionObserver,
   every section renders normally and fully visible. Nothing can get stuck
   invisible, which matters for customers and for Google alike.
   ═════════════════════════════════════════════════════════════════════════════ */
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.Shopify && Shopify.designMode) return;   // editor: show everything at once

  var CSS =
    '.pt-reveal{opacity:0;transform:translateY(13px);filter:blur(6px);' +
    'will-change:opacity,transform,filter}' +
    '.pt-reveal-in{opacity:1;transform:none;filter:none;' +
    'transition:opacity .45s cubic-bezier(.22,1,.36,1),' +
    'transform .45s cubic-bezier(.22,1,.36,1),' +
    'filter .38s cubic-bezier(.22,1,.36,1)}';

  function start() {
    var all = document.querySelectorAll('.shopify-section');
    if (!all.length) return;

    var targets = [];
    for (var i = 0; i < all.length; i++) {
      var s = all[i];
      // The hero animates itself, and anything already on screen at load must
      // not flash in - only sections below the fold are candidates.
      if (s.querySelector('.hero-smart-search')) continue;
      var rect = s.getBoundingClientRect();
      // A zero-height wrapper - a section whose content is position:fixed, like
      // the mobile tab bar - can never satisfy threshold 0.04, so it would sit
      // at opacity 0 forever. Worse, the marker's transform + will-change make
      // the wrapper a containing block, which breaks position:fixed for its
      // children. Never reveal-wrap one.
      if (!rect.height) continue;
      if (rect.top < window.innerHeight * 0.9) continue;
      targets.push(s);
    }
    if (!targets.length) return;

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var io = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        if (!entries[j].isIntersecting) continue;
        entries[j].target.classList.add('pt-reveal-in');
        io.unobserve(entries[j].target);
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.04 });

    for (var k = 0; k < targets.length; k++) {
      targets[k].classList.add('pt-reveal');
      io.observe(targets[k]);
    }

    // Belt and braces. A blanket timeout would be wrong here - it would reveal
    // sections while they are still far below the fold, so they would already
    // be shown by the time the customer scrolled to them. This instead sweeps
    // once after load and reveals only what is actually on screen, which
    // covers the case where late-loading images shifted the layout and a
    // section was pushed past its own trigger point.
    window.addEventListener('load', function () {
      setTimeout(function () {
        for (var m = 0; m < targets.length; m++) {
          var r = targets[m].getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) {
            targets[m].classList.add('pt-reveal-in');
            io.unobserve(targets[m]);
          }
        }
      }, 400);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
