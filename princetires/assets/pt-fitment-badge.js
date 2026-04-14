(function () {
  'use strict';

  function normalizeTireSize(size) {
    // Strip spaces, uppercase, remove prefix letters like P/LT/ST
    return (size || '').toUpperCase().replace(/\s/g, '').replace(/^[A-Z]{1,2}(?=\d)/, '');
  }

  function getSizeWidth(normalized) {
    // e.g. "225/50R17" → "225"
    var match = normalized.match(/^(\d{3})/);
    return match ? match[1] : null;
  }

  function checkFitment(productSize, vehicleSize) {
    var ps = normalizeTireSize(productSize);
    var vs = normalizeTireSize(vehicleSize);
    if (!ps || !vs) return null;
    if (ps === vs) return 'fits';
    // Same width family (e.g. both 225-series)
    if (getSizeWidth(ps) && getSizeWidth(ps) === getSizeWidth(vs)) return 'may-fit';
    return null;
  }

  function updateBadges(defaultVehicle) {
    document.querySelectorAll('[data-fitment-badge]').forEach(function (el) {
      var productDataEl = el.querySelector('[data-fitment-product]');
      if (!productDataEl) return;

      var productSize;
      try {
        productSize = JSON.parse(productDataEl.textContent).tireSize;
      } catch (e) {
        return;
      }

      if (!productSize || !defaultVehicle) {
        el.hidden = true;
        return;
      }

      var result = checkFitment(productSize, defaultVehicle.tireSize);
      if (!result) {
        el.hidden = true;
        return;
      }

      var textEl = el.querySelector('.pt-fitment-badge__text');
      var vehicleLabel = defaultVehicle.year + ' ' + defaultVehicle.make + ' ' + defaultVehicle.model;

      el.classList.remove('pt-fitment-badge--fits', 'pt-fitment-badge--may-fit');

      if (result === 'fits') {
        el.classList.add('pt-fitment-badge--fits');
        if (textEl) textEl.textContent = 'Fits your ' + vehicleLabel;
      } else {
        el.classList.add('pt-fitment-badge--may-fit');
        if (textEl) textEl.textContent = 'Verify fit for your ' + vehicleLabel;
      }

      el.hidden = false;
    });
  }

  // Listen for garageReady event (fired by my-garage.js on every update)
  document.addEventListener('garageReady', function (e) {
    var defaultVehicle = e.detail && e.detail.defaultVehicle;
    updateBadges(defaultVehicle || null);
  });

  // If garage already loaded (e.g. script loaded late), check window.__ptDefaultVehicle
  if (window.__ptDefaultVehicle !== undefined) {
    updateBadges(window.__ptDefaultVehicle);
  }

  // Also re-run if localStorage changes (other tab / page)
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.startsWith('pt-garage-')) {
      try {
        var vehicles = JSON.parse(e.newValue || '[]');
        var def = vehicles.find(function (v) { return v.isDefault; }) || vehicles[0] || null;
        updateBadges(def);
      } catch (ex) {}
    }
  });
})();
