/* ==========================================================================
   Prince Tires — live Calgary conditions (pt-weather.js)

   Progressive enhancement for the season-planes hero. The hero's season state
   is resolved server-side in Liquid and is ALREADY correct without this file —
   this only adds the live temperature line and lets real snowfall intensify the
   decorative snow. If the request fails, is blocked, or is slow, nothing
   changes and nothing is logged to the customer.

   Source: Open-Meteo (open-meteo.com) — free, no API key, no signup, CORS
   enabled, commercial use permitted. Coordinates are 42 Ave SW.

   Cached in sessionStorage for 30 minutes so browsing the site is one request.
   ========================================================================== */
(function () {
  'use strict';

  var HOST = document.querySelector('[data-pt-weather]');
  if (!HOST) return;

  var LAT = 51.0227, LON = -114.0729;           // Calgary — 111 42 Ave SW
  var KEY = 'pt-weather-v1';
  var TTL = 30 * 60 * 1000;                     // 30 minutes

  var URL = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + LAT + '&longitude=' + LON
    + '&current=temperature_2m,apparent_temperature,weather_code,snowfall'
    + '&timezone=America%2FEdmonton';

  // WMO weather codes that mean frozen precipitation is falling right now
  var SNOW_CODES = [71, 73, 75, 77, 85, 86];
  // …and the ones that mean freezing rain / ice pellets: worse than snow for traction
  var ICE_CODES = [56, 57, 66, 67];

  function read() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || (Date.now() - o.t) > TTL) return null;
      return o.d;
    } catch (e) { return null; }
  }

  function write(d) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
  }

  function paint(cur) {
    if (!cur || typeof cur.temperature_2m !== 'number') return;

    var temp = Math.round(cur.temperature_2m);
    var code = cur.weather_code;
    var snowing = SNOW_CODES.indexOf(code) > -1 || (cur.snowfall > 0);
    var icy = ICE_CODES.indexOf(code) > -1;
    var freezing = temp <= 0;

    // The temperature always reads as measured. No rounding games, no "feels like"
    // swapped in silently — if we show a number it is the current air temperature.
    var out = HOST.querySelector('[data-pt-temp]');
    if (out) out.textContent = temp + '°C in Calgary';

    // A condition line only appears when there is something real to say. Order
    // matters: ice is the most dangerous and outranks snow.
    var note = HOST.querySelector('[data-pt-condition]');
    if (note) {
      var msg = '';
      if (icy) msg = 'freezing rain right now';
      else if (snowing) msg = 'snowing right now';
      else if (freezing) msg = 'below freezing';
      note.textContent = msg;
      note.hidden = !msg;
    }

    HOST.hidden = false;

    // Let the hero react: heavier snow planes while it is actually snowing.
    var hero = HOST.closest('.psp');
    if (hero) {
      hero.classList.toggle('is-snowing', snowing || icy);
      hero.classList.toggle('is-freezing', freezing);
    }
  }

  var cached = read();
  if (cached) { paint(cached); return; }

  // Never let a slow third party hold anything up.
  var ctrl = ('AbortController' in window) ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);

  fetch(URL, ctrl ? { signal: ctrl.signal } : undefined)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      clearTimeout(timer);
      if (!j || !j.current) return;
      write(j.current);
      paint(j.current);
    })
    .catch(function () { clearTimeout(timer); });   // silent by design
})();
