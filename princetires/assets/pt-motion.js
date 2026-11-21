/* ==========================================================================
   Prince Tires — Motion System (pt-motion.js)
   Pairs with pt-motion.css. Responsibilities:
     1. Tag homepage elements for scroll reveals (no per-section markup needed)
     2. Drive an IntersectionObserver that flips .is-in
     3. Hero: layered parallax (scroll) + pointer depth (mouse) + intro
     4. Stay out of the way: reduced motion, theme editor, old browsers
   The <html class="pt-motion"> gate is set by an inline script in theme.liquid
   so CSS can hide reveal targets before first paint without a flash.
   ========================================================================== */
(function () {
  'use strict';

  var html = document.documentElement;
  if (!html.classList.contains('pt-motion')) return;          // gate not set (reduced motion / no-JS)
  if (!('IntersectionObserver' in window)) { html.classList.remove('pt-motion'); return; }

  var designMode = !!(window.Shopify && window.Shopify.designMode);
  var isDesktop = function () { return window.matchMedia('(min-width: 769px)').matches; };
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ------------------------------------------------------------------------
     1. Reveal map — selector -> options
        variant : up | fade | left | right | scale | clip
        stagger : reveal direct children in sequence (each child becomes a target)
        limit   : only stagger the first N children (marquee/slider rows)
        lift    : add .pt-lift hover to the matched element(s)
     ------------------------------------------------------------------------ */
  var REVEALS = [
    // Section headers: eyebrow -> heading -> subtitle
    { sel: '.pti__header, .tst__header, .ptr__header, .ptcl__header, .wheel-brands__header, .svc__header, .sbc__header, .fbp__header, .faq-home__header, .trusted-brands__header, .inv-pulse__header',
      variant: 'up', stagger: true },

    // Trust strip + live inventory stats
    { sel: '.trust-strip__container', variant: 'fade', stagger: true },
    { sel: '.inv-pulse__stat', variant: 'up' },

    // Tabs + product panels + CTAs
    { sel: '.pti__tabs, .ptcl__tabs, .wheel-brands__tabs', variant: 'fade' },
    { sel: '.pti__panel, .ptcl__panel', variant: 'up' },
    { sel: '.pti__cta-wrap, .ptcl__cta-wrap, .tst__cta-wrap, .svc__cta, .faq-home__cta, .wheel-brands__cta', variant: 'fade' },

    // Moving rows reveal as one piece (their own marquee handles the rest)
    { sel: '.trusted-brands__track, .tst__marquee, .ptr__marquee, .svc__track', variant: 'fade', fadeEdges: true },
    { sel: '.wheel-brands__track', variant: 'up', stagger: true, limit: 4, lift: true },
    { sel: '.fbp__track', variant: 'up', stagger: true, limit: 4, lift: true },

    // Grids
    { sel: '.sbc__grid', variant: 'scale', stagger: true, lift: true },
    { sel: '.faq-home__grid', variant: 'up', stagger: true }
  ];

  // Sections that get a self-drawing red hairline at their top edge
  var SEAMS = '.pt-rebates, .ptr, .sbc, .faq-home';

  function tag(el, variant, index) {
    if (el.hasAttribute('data-pt-reveal')) return;
    el.setAttribute('data-pt-reveal', variant);
    if (typeof index === 'number') el.style.setProperty('--pt-i', index);
  }

  function applyRevealMap(root) {
    REVEALS.forEach(function (r) {
      var nodes = root.querySelectorAll(r.sel);
      Array.prototype.forEach.call(nodes, function (el) {
        if (r.fadeEdges) el.classList.add('pt-fade-edges');
        if (r.stagger) {
          var kids = Array.prototype.filter.call(el.children, function (k) {
            return k.nodeType === 1 && k.tagName !== 'SCRIPT' && k.tagName !== 'STYLE' && k.tagName !== 'TEMPLATE';
          });
          kids.forEach(function (k, i) {
            if (r.limit && i >= r.limit) return;
            tag(k, r.variant, i);
            if (r.lift) k.classList.add('pt-lift');
          });
        } else {
          tag(el, r.variant);
          if (r.lift) el.classList.add('pt-lift');
        }
      });
    });

    Array.prototype.forEach.call(root.querySelectorAll(SEAMS), function (el) {
      el.setAttribute('data-pt-seam', '');
    });

    // Accent word underline sweep on section headings
    Array.prototype.forEach.call(
      root.querySelectorAll('.pti__accent, .ptcl__accent, .tst__heading em, .ptr__heading em, .wheel-brands__heading em, .trusted-brands__heading em, .sbc__heading em, .faq-home__heading em'),
      function (el) { el.classList.add('pt-accent-sweep'); }
    );
  }

  /* ------------------------------------------------------------------------
     2. Observer
     ------------------------------------------------------------------------ */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add('is-in');
      io.unobserve(el);
      // release will-change after the transition (+ stagger) has finished
      var delay = 1400 + (parseFloat(el.style.getPropertyValue('--pt-i')) || 0) * 90;
      setTimeout(function () { el.classList.add('is-settled'); }, delay);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  function observeAll(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-pt-reveal]:not(.is-in), [data-pt-seam]:not(.is-in)'), function (el) {
      if (el.__ptObserved) return;
      el.__ptObserved = true;
      var r = el.getBoundingClientRect();
      if ((r.top < window.innerHeight * 0.9 && r.bottom > 0) || (r.bottom <= 0 && r.height > 0)) {
        // Already on screen (or already scrolled past — deep link / restored scroll):
        // show instantly with no transition so nothing blinks or stays hidden
        showInstant(el);
      } else {
        io.observe(el);
        pending.push(el);
      }
    });
  }
  var pending = [];
  function showInstant(el) {
    el.classList.add('pt-instant', 'is-in', 'is-settled');
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove('pt-instant'); }); });
  }
  // Safety net: a fast scroll, anchor jump or back-navigation can move an element
  // straight past the viewport without it ever intersecting. Anything that ends up
  // above the fold is shown instantly so no content is left invisible.
  var sweepTick = false;
  function sweep() {
    if (sweepTick) return;
    sweepTick = true;
    requestAnimationFrame(function () {
      sweepTick = false;
      if (!pending.length) return;
      var keep = [];
      for (var i = 0; i < pending.length; i++) {
        var el = pending[i];
        if (el.classList.contains('is-in')) continue;
        var r = el.getBoundingClientRect();
        if (r.bottom <= 0 && r.height > 0) { io.unobserve(el); showInstant(el); }
        else keep.push(el);
      }
      pending = keep;
    });
  }
  window.addEventListener('scroll', sweep, { passive: true });

  /* ------------------------------------------------------------------------
     3. Hero — layers
     ------------------------------------------------------------------------ */
  function initHero() {
    var hero = document.querySelector('.hero-smart-search');
    if (!hero) return;

    var slideshow = hero.querySelector('.hero-smart-search__slideshow');
    var container = hero.querySelector('.hero-smart-search__container');
    var card = hero.querySelector('.hero-smart-search__search-wrapper');

    // Inject the decorative depth layers (kept out of the Liquid so the hero
    // section file stays untouched). Order matters: they sit between the
    // slideshow and the content container in the stacking order.
    if (container && !hero.querySelector('.hero-smart-search__atmo')) {
      var frag = document.createDocumentFragment();
      function layer(cls, inner) {
        var d = document.createElement('div');
        d.className = cls;
        d.setAttribute('aria-hidden', 'true');
        if (inner) d.innerHTML = inner;
        frag.appendChild(d);
        return d;
      }
      layer('hero-smart-search__atmo', '<div class="hero-smart-search__atmo-glow"></div><div class="hero-smart-search__atmo-grain"></div>');
      layer('hero-smart-search__bokeh', '<i></i><i></i><i></i><i></i><i></i>');
      layer('hero-smart-search__floor');
      layer('hero-smart-search__cue');
      hero.insertBefore(frag, container);
    }
    var bokeh = hero.querySelector('.hero-smart-search__bokeh');

    // Intro
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { hero.classList.add('is-loaded'); });
    });
    setTimeout(function () { hero.classList.add('is-settled'); }, 2600);

    // Theme editor: the layers and the intro are what the merchant needs to see.
    // Scroll parallax and pointer tilt are skipped so the editor's own scrolling
    // and section re-rendering never fight the transforms.
    if (designMode) return;

    // Scroll parallax — only while the hero is on screen
    var heroVisible = true;
    new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; }, { threshold: 0 }).observe(hero);

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY || window.pageYOffset;
        hero.classList.toggle('is-scrolled', y > 40);
        if (!heroVisible) return;
        var h = hero.offsetHeight || 1;
        var p = Math.min(1, Math.max(0, y / h));           // 0..1 progress through the hero
        var desktop = isDesktop();
        if (slideshow) {
          slideshow.style.setProperty('--pt-y', (y * (desktop ? 0.28 : 0.16)).toFixed(1) + 'px');
          slideshow.style.setProperty('--pt-hero-scale', (1 + p * 0.04).toFixed(3));
        }
        if (container) {
          container.style.setProperty('--pt-y', (y * (desktop ? -0.10 : -0.05)).toFixed(1) + 'px');
          container.style.setProperty('--pt-o', (1 - p * 1.15).toFixed(3));
        }
        if (bokeh) {
          bokeh.style.setProperty('--pt-y', (y * (desktop ? 0.48 : 0.30)).toFixed(1) + 'px');
        }
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Pointer depth — bokeh drifts opposite the pointer, card tilts toward it
    if (finePointer && isDesktop()) {
      var rect = null;
      var raf = 0, lastX = 0, lastY = 0;
      function measure() { rect = hero.getBoundingClientRect(); }
      measure();
      window.addEventListener('resize', measure);

      hero.addEventListener('pointermove', function (e) {
        lastX = e.clientX; lastY = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          if (!rect) measure();
          var nx = (lastX - rect.left) / rect.width - 0.5;    // -0.5..0.5
          var ny = (lastY - rect.top) / rect.height - 0.5;
          if (bokeh) {
            bokeh.style.setProperty('--pt-mx', (nx * -28).toFixed(1) + 'px');
            bokeh.style.setProperty('--pt-my', (ny * -18).toFixed(1) + 'px');
          }
          if (card) {
            card.style.setProperty('--pt-ry', (nx * 4).toFixed(2) + 'deg');
            card.style.setProperty('--pt-rx', (ny * -3).toFixed(2) + 'deg');
          }
        });
      });
      hero.addEventListener('pointerleave', function () {
        if (bokeh) { bokeh.style.setProperty('--pt-mx', '0px'); bokeh.style.setProperty('--pt-my', '0px'); }
        if (card) { card.style.setProperty('--pt-rx', '0deg'); card.style.setProperty('--pt-ry', '0deg'); }
      });
      // Don't tilt while the visitor is typing — keeps the results list stable
      hero.addEventListener('focusin', function (e) {
        if (card && card.contains(e.target)) { card.style.setProperty('--pt-rx', '0deg'); card.style.setProperty('--pt-ry', '0deg'); card.classList.add('is-focused'); }
      });
      hero.addEventListener('focusout', function () { if (card) card.classList.remove('is-focused'); });
    }
  }

  /* ------------------------------------------------------------------------
     4. Boot
     ------------------------------------------------------------------------ */
  function boot() {
    if (designMode) {
      // Editor: reveal everything, skip parallax so merchants see the real layout
      applyRevealMap(document);
      Array.prototype.forEach.call(document.querySelectorAll('[data-pt-reveal], [data-pt-seam]'), function (el) { el.classList.add('is-in', 'is-settled'); });
      initHero();
      return;
    }
    applyRevealMap(document);
    observeAll(document);
    initHero();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Sections that render lazily (deferred product panels) — tag & observe them as they appear
  var mo = new MutationObserver(function (muts) {
    var added = false;
    muts.forEach(function (m) {
      if (!m.addedNodes || !m.addedNodes.length) return;
      // The hero rewrites its own DOM constantly (typewriter, results) — ignore it
      if (m.target && m.target.closest && m.target.closest('.hero-smart-search, .pt-header, header')) return;
      added = true;
    });
    if (!added) return;
    clearTimeout(mo._t);
    mo._t = setTimeout(function () { applyRevealMap(document); observeAll(document); }, 120);
  });
  if (!designMode) mo.observe(document.body, { childList: true, subtree: true });

  if (designMode) {
    document.addEventListener('shopify:section:load', boot);
  }
})();
