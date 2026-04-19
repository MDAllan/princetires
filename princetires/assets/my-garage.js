class MyGarage extends HTMLElement {
  constructor() {
    super();
    const configEl = document.querySelector('[data-garage-config]');
    this.config = configEl ? JSON.parse(configEl.textContent) : {};
    this.vehicleCache = {};
    this._syncTimer = null;

    this.yearSelect = this.querySelector('[data-garage-year]');
    this.makeSelect = this.querySelector('[data-garage-make]');
    this.modelSelect = this.querySelector('[data-garage-model]');
    this.trimSelect = this.querySelector('[data-garage-trim]');
    this.sizePreview = this.querySelector('[data-garage-size-preview]');
    this.saveBtn = this.querySelector('[data-garage-save]');
    this.cancelBtn = this.querySelector('[data-garage-cancel]');
    this.toggleBtn = this.querySelector('[data-garage-toggle-add]');
    this.addForm = this.querySelector('#garage-add-form');
    this.vehicleList = this.querySelector('[data-garage-list]');
    this.emptyState = this.querySelector('[data-garage-empty]');
    this.maxMessage = this.querySelector('[data-garage-max]');
    this.statsEl = this.querySelector('[data-garage-stats]');
    this.seasonalEl = this.querySelector('[data-garage-seasonal]');
    this.activityEl = this.querySelector('[data-garage-activity]');
    this.activityListEl = this.querySelector('[data-garage-activity-list]');
    this.historyListEl = this.querySelector('[data-garage-history-list]');
  }

  connectedCallback() {
    this.vehicles = this.loadFromStorage();
    this.populateYearSelect();
    this.bindEvents();
    this.initTabs();
    this.renderSeasonalTip();
    this.renderVehicles();
    this.publishGarageUpdate();
  }

  get storageKey() {
    return 'pt-garage-' + this.config.customerId;
  }

  loadFromStorage() {
    try {
      var raw = localStorage.getItem(this.storageKey);
      var parsed = raw ? JSON.parse(raw) : [];
      var todayBase = new Date();
      todayBase.setHours(0, 0, 0, 0);
      // Migrate legacy vehicles and refresh stale reminder dates
      return parsed.map(function(v) {
        if (!v.maintenance) v.maintenance = [];
        if (!v.reminders) v.reminders = null; // will be set on first service log
        if (v.reminders) {
          // Push any past reminder dates to the next reasonable future date
          var rotDate = v.reminders.nextRotation ? new Date(v.reminders.nextRotation) : null;
          if (rotDate && rotDate < todayBase) {
            var nextRot = new Date(todayBase);
            nextRot.setMonth(nextRot.getMonth() + 6);
            v.reminders.nextRotation = nextRot.toISOString().split('T')[0];
          }
          var wswDate = v.reminders.nextWinterSwap ? new Date(v.reminders.nextWinterSwap) : null;
          if (wswDate && wswDate < todayBase) {
            var ws = new Date(todayBase.getFullYear(), 9, 1); // Oct 1
            if (ws <= todayBase) ws.setFullYear(ws.getFullYear() + 1);
            v.reminders.nextWinterSwap = ws.toISOString().split('T')[0];
          }
          var sswDate = v.reminders.nextSummerSwap ? new Date(v.reminders.nextSummerSwap) : null;
          if (sswDate && sswDate < todayBase) {
            var ss = new Date(todayBase.getFullYear(), 4, 1); // May 1
            if (ss <= todayBase) ss.setFullYear(ss.getFullYear() + 1);
            v.reminders.nextSummerSwap = ss.toISOString().split('T')[0];
          }
        }
        return v;
      });
    } catch (e) {
      return [];
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.vehicles));
    } catch (e) {}
    this.publishGarageUpdate();
  }

  publishGarageUpdate() {
    var defaultVehicle = this.vehicles.find(function(v) { return v.isDefault; }) || this.vehicles[0] || null;
    window.__ptDefaultVehicle = defaultVehicle;
    document.dispatchEvent(new CustomEvent('garageReady', {
      bubbles: true,
      detail: { vehicles: this.vehicles, defaultVehicle: defaultVehicle }
    }));
    if (typeof publish === 'function') {
      publish(PUB_SUB_EVENTS.garageUpdate, { vehicles: this.vehicles });
    }
  }

  /* ---- Vehicle CRUD ---- */

  addVehicle(data) {
    if (this.vehicles.length >= (this.config.maxVehicles || 10)) return;

    var vehicle = {
      id: crypto.randomUUID(),
      nickname: '',
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      tireSize: data.tireSize,
      isDefault: this.vehicles.length === 0,
      addedAt: new Date().toISOString(),
      maintenance: [],
      reminders: this.getDefaultReminders()
    };

    this.vehicles.push(vehicle);
    this.saveToStorage();
    this.renderVehicles();
    this.toggleAddForm(false);
    this.resetForm();
  }

  getDefaultReminders() {
    var now = new Date();
    var rotationDate = new Date(now);
    rotationDate.setMonth(rotationDate.getMonth() + 6);
    var winterSwap = new Date(now.getFullYear(), 9, 1); // Oct 1
    if (winterSwap <= now) winterSwap.setFullYear(winterSwap.getFullYear() + 1);
    var summerSwap = new Date(now.getFullYear(), 3, 15); // Apr 15
    if (summerSwap <= now) summerSwap.setFullYear(summerSwap.getFullYear() + 1);
    return {
      nextRotation: rotationDate.toISOString().split('T')[0],
      nextWinterSwap: winterSwap.toISOString().split('T')[0],
      nextSummerSwap: summerSwap.toISOString().split('T')[0]
    };
  }

  removeVehicle(id) {
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (!vehicle) return;

    var label = vehicle.year + ' ' + vehicle.make + ' ' + vehicle.model;
    if (!confirm('Remove ' + label + ' from your garage?')) return;

    var wasDefault = vehicle.isDefault;
    this.vehicles = this.vehicles.filter(function(v) { return v.id !== id; });

    if (wasDefault && this.vehicles.length > 0) {
      this.vehicles[0].isDefault = true;
    }

    this.saveToStorage();
    this.renderVehicles();
  }

  setDefault(id) {
    this.vehicles.forEach(function(v) { v.isDefault = false; });
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (vehicle) vehicle.isDefault = true;
    this.saveToStorage();
    this.renderVehicles();
  }

  setNickname(id) {
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (!vehicle) return;
    var current = vehicle.nickname || '';
    var name = prompt('Enter a nickname for this vehicle (max 20 characters):', current);
    if (name === null) return;
    vehicle.nickname = name.substring(0, 20).trim();
    this.saveToStorage();
    this.renderVehicles();
  }

  /* ---- Maintenance Tracking ---- */

  saveMaintenanceEntry(id) {
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (!vehicle) return;
    if (!vehicle.maintenance) vehicle.maintenance = [];

    var card = this.vehicleList.querySelector('[data-vehicle-id="' + id + '"]');
    if (!card) return;

    var typeEl = card.querySelector('[data-maint-type]');
    var dateEl = card.querySelector('[data-maint-date]');
    var mileageEl = card.querySelector('[data-maint-mileage]');

    var type = typeEl ? typeEl.value : 'other';
    var date = dateEl ? dateEl.value : new Date().toISOString().split('T')[0];
    var mileage = mileageEl ? parseInt(mileageEl.value) || 0 : 0;

    var entry = {
      id: crypto.randomUUID(),
      type: type,
      date: date,
      mileage: mileage
    };

    vehicle.maintenance.unshift(entry);
    if (vehicle.maintenance.length > 20) vehicle.maintenance = vehicle.maintenance.slice(0, 20);

    // Update next reminder based on service type
    if (!vehicle.reminders) vehicle.reminders = this.getDefaultReminders();
    if (type === 'rotation' || type === 'installation') {
      var nextRot = new Date(date);
      nextRot.setMonth(nextRot.getMonth() + 6);
      vehicle.reminders.nextRotation = nextRot.toISOString().split('T')[0];
    }
    if (type === 'winter_install') {
      var nextWsw = new Date(date);
      nextWsw.setFullYear(nextWsw.getFullYear() + 1);
      vehicle.reminders.nextWinterSwap = nextWsw.toISOString().split('T')[0];
    }
    if (type === 'summer_install') {
      var nextSsw = new Date(date);
      nextSsw.setFullYear(nextSsw.getFullYear() + 1);
      vehicle.reminders.nextSummerSwap = nextSsw.toISOString().split('T')[0];
    }

    this.saveToStorage();
    this.renderVehicles();
  }

  /* ---- Status + Reminders ---- */

  getStatusForVehicle(vehicle) {
    if (!vehicle.reminders) return 'good';
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);

    var rotDate = vehicle.reminders.nextRotation ? new Date(vehicle.reminders.nextRotation) : null;
    var wswDate = vehicle.reminders.nextWinterSwap ? new Date(vehicle.reminders.nextWinterSwap) : null;
    var sswDate = vehicle.reminders.nextSummerSwap ? new Date(vehicle.reminders.nextSummerSwap) : null;

    var overdue = (rotDate && rotDate < today) || this.isSeasonalOverdue(wswDate, sswDate, today);
    if (overdue) return 'overdue';

    var dueSoon = (rotDate && rotDate <= in30) || this.isSeasonalDueSoon(wswDate, sswDate, in30);
    if (dueSoon) return 'due-soon';

    return 'good';
  }

  isSeasonalOverdue(wswDate, sswDate, today) {
    var month = today.getMonth();
    if (month >= 9 && month <= 10 && wswDate && wswDate < today) return true;
    if (month >= 2 && month <= 3 && sswDate && sswDate < today) return true;
    return false;
  }

  isSeasonalDueSoon(wswDate, sswDate, in30) {
    var now = new Date();
    var month = now.getMonth();
    if (month >= 8 && month <= 9 && wswDate && wswDate <= in30) return true;
    if (month >= 1 && month <= 2 && sswDate && sswDate <= in30) return true;
    return false;
  }

  getActiveReminders(vehicle) {
    var reminders = [];
    if (!vehicle.reminders) return reminders;

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    var month = today.getMonth();

    var rotDate = vehicle.reminders.nextRotation ? new Date(vehicle.reminders.nextRotation) : null;
    if (rotDate && rotDate <= in30) {
      reminders.push({
        type: 'rotation',
        label: rotDate < today ? 'Tire rotation overdue' : 'Rotation due ' + this.formatShortDate(rotDate),
        urgency: rotDate < today ? 'overdue' : 'soon',
        serviceType: 'rotation'
      });
    }

    var wswDate = vehicle.reminders.nextWinterSwap ? new Date(vehicle.reminders.nextWinterSwap) : null;
    if ((month >= 8 && month <= 10) && wswDate && wswDate <= in30) {
      reminders.push({
        type: 'winter_swap',
        label: wswDate < today ? 'Winter tire swap overdue!' : 'Winter swap by ' + this.formatShortDate(wswDate),
        urgency: wswDate < today ? 'overdue' : 'soon',
        serviceType: 'winter_install'
      });
    }

    var sswDate = vehicle.reminders.nextSummerSwap ? new Date(vehicle.reminders.nextSummerSwap) : null;
    if ((month >= 1 && month <= 3) && sswDate && sswDate <= in30) {
      reminders.push({
        type: 'summer_swap',
        label: sswDate < today ? 'Summer tire swap overdue!' : 'Summer swap by ' + this.formatShortDate(sswDate),
        urgency: sswDate < today ? 'overdue' : 'soon',
        serviceType: 'summer_install'
      });
    }

    return reminders;
  }

  formatShortDate(date) {
    return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  formatServiceType(type) {
    var map = {
      rotation: 'Tire rotation',
      installation: 'New tires installed',
      winter_install: 'Winter tires installed',
      summer_install: 'Summer/A-S tires installed',
      balance: 'Wheel balance',
      alignment: 'Wheel alignment',
      inspection: 'Tire inspection',
      tpms: 'TPMS service',
      other: 'Service'
    };
    return map[type] || type;
  }

  /* ---- Bookings tab ---- */

  async loadBookings() {
    var listEl = this.querySelector('[data-gbk-list]');
    var subEl  = this.querySelector('[data-gbk-sub]');
    if (!listEl) return;

    var apiUrl = this.config.bookingApiUrl;
    var email  = this.config.customerEmail;

    if (!apiUrl || !email) {
      listEl.innerHTML = '<div class="gbk-configure">'
        + '<p class="gbk-configure-title">Not configured</p>'
        + '<p class="gbk-configure-sub">Set the Booking API URL in the theme editor to show your appointments.</p>'
        + '</div>';
      return;
    }

    // Show loading state
    listEl.innerHTML = '<div class="gbk-loading"><div class="gbk-spinner"></div><span>Loading your bookings\u2026</span></div>';

    try {
      // A01: include HMAC lookup token stored at booking time to prevent IDOR.
      // Token is stored by the booking form after a successful POST /api/book.
      var lookupToken = localStorage.getItem('pt-book-token-' + email.toLowerCase()) || '';
      var bookingUrl  = apiUrl.replace(/\/$/, '') + '/api/book?email=' + encodeURIComponent(email);
      if (lookupToken) bookingUrl += '&token=' + encodeURIComponent(lookupToken);
      var res = await fetch(bookingUrl);
      var data = await res.json();
      // If token rejected, clear stale token from storage
      if (res.status === 401) { localStorage.removeItem('pt-book-token-' + email.toLowerCase()); data = { bookings: [] }; }
      var bookings = data.bookings || [];

      if (!bookings.length) {
        if (subEl) subEl.textContent = 'No upcoming appointments';
        listEl.innerHTML = '<div class="gbk-empty">'
          + '<p class="gbk-empty-title">No upcoming bookings</p>'
          + '<p class="gbk-empty-sub">You don\u2019t have any scheduled installations at the moment.</p>'
          + '<a href="/pages/services" class="gbk-cta">Book an installation</a>'
          + '</div>';
        return;
      }

      if (subEl) subEl.textContent = bookings.length + ' upcoming ' + (bookings.length === 1 ? 'appointment' : 'appointments');

      listEl.innerHTML = bookings.map(function(bk) {
        var parts = bk.date.split(', ');
        var dayPart  = parts.length >= 2 ? parts[1] : bk.date; // e.g. "Apr 19"
        var dateParts = dayPart.trim().split(' ');
        var month = dateParts[0] || '';
        var day   = dateParts[1] || '';
        var statusClass = 'gbk-status--' + (bk.status === 'tentative' ? 'tentative' : bk.status === 'cancelled' ? 'cancelled' : 'confirmed');
        var statusLabel = bk.status === 'tentative' ? 'Pending' : bk.status === 'cancelled' ? 'Cancelled' : 'Confirmed';

        return '<div class="gbk-card gbk-card--' + (bk.status === 'tentative' ? 'tentative' : bk.status === 'cancelled' ? 'cancelled' : 'confirmed') + '">'
          + '<div class="gbk-date-col">'
            + '<div class="gbk-date-day">' + this.escapeHtml(day) + '</div>'
            + '<div class="gbk-date-month">' + this.escapeHtml(month) + '</div>'
          + '</div>'
          + '<div class="gbk-info">'
            + '<p class="gbk-title-text">' + this.escapeHtml((bk.summary || 'Installation').replace(/^🛞\s*/, '')) + '</p>'
            + '<div class="gbk-meta">'
              + '<span class="gbk-meta-item">'
                + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
                + this.escapeHtml(bk.time)
              + '</span>'
              + '<span class="gbk-meta-item">'
                + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                + this.escapeHtml(bk.location)
              + '</span>'
            + '</div>'
          + '</div>'
          + '<span class="gbk-status ' + statusClass + '">' + statusLabel + '</span>'
          + (bk.cancelUrl && bk.status !== 'cancelled'
            ? '<a href="' + this.escapeHtml(bk.cancelUrl) + '" class="gbk-cancel-btn" target="_blank" rel="noopener">Cancel</a>'
            : '')
        + '</div>';
      }.bind(this)).join('');
    } catch (e) {
      listEl.innerHTML = '<div class="gbk-empty">'
        + '<p class="gbk-empty-title">Couldn\u2019t load bookings</p>'
        + '<p class="gbk-empty-sub">Please try again or contact us directly.</p>'
        + '</div>';
    }
  }

  /* ---- Booking integration ---- */

  bookInstallForVehicle(id) {
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (!vehicle || typeof openBookingModal !== 'function') return;
    var fakeBtn = {
      dataset: {
        tireName: vehicle.year + ' ' + vehicle.make + ' ' + vehicle.model + ' — ' + vehicle.trim,
        tireSize: vehicle.tireSize,
        tirePrice: '0',
        vehicleType: ''
      }
    };
    openBookingModal(fakeBtn);
  }

  /* ---- Cascading Selects ---- */

  populateYearSelect() {
    var max = this.config.maxYear || 2026;
    var min = this.config.minYear || 2001;
    for (var y = max; y >= min; y--) {
      var opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      this.yearSelect.appendChild(opt);
    }
  }

  async loadVehicleData(year) {
    if (this.vehicleCache[year]) return this.vehicleCache[year];
    var numYear = parseInt(year);
    if (numYear < (this.config.minYear || 2001) || numYear > (this.config.maxYear || 2026)) return null;
    try {
      var url = this.config.assetUrlBase + 'pt-vehicle-' + year + '.json';
      var resp = await fetch(url);
      if (!resp.ok) return null;
      var data = await resp.json();
      this.vehicleCache[year] = data;
      return data;
    } catch (e) {
      return null;
    }
  }

  resetSelect(select) {
    select.innerHTML = '';
    var opt = document.createElement('option');
    opt.value = '';
    opt.textContent = select.dataset.placeholder || 'Select...';
    select.appendChild(opt);
    select.disabled = true;
  }

  async onYearChange() {
    this.resetSelect(this.makeSelect);
    this.resetSelect(this.modelSelect);
    this.resetSelect(this.trimSelect);
    this.sizePreview.hidden = true;
    this.saveBtn.disabled = true;

    var year = this.yearSelect.value;
    if (!year) return;

    var data = await this.loadVehicleData(year);
    if (!data || !data.makes) return;

    data.makes.forEach(function(make) {
      var opt = document.createElement('option');
      opt.value = make;
      opt.textContent = make;
      this.makeSelect.appendChild(opt);
    }.bind(this));
    this.makeSelect.disabled = false;
  }

  async onMakeChange() {
    this.resetSelect(this.modelSelect);
    this.resetSelect(this.trimSelect);
    this.sizePreview.hidden = true;
    this.saveBtn.disabled = true;

    var year = this.yearSelect.value;
    var make = this.makeSelect.value;
    if (!make) return;

    var data = await this.loadVehicleData(year);
    if (!data || !data.models || !data.models[make]) return;

    var models = Object.keys(data.models[make]).sort();
    models.forEach(function(model) {
      var opt = document.createElement('option');
      opt.value = model;
      opt.textContent = model;
      this.modelSelect.appendChild(opt);
    }.bind(this));
    this.modelSelect.disabled = false;
  }

  async onModelChange() {
    this.resetSelect(this.trimSelect);
    this.sizePreview.hidden = true;
    this.saveBtn.disabled = true;

    var year = this.yearSelect.value;
    var make = this.makeSelect.value;
    var model = this.modelSelect.value;
    if (!model) return;

    var data = await this.loadVehicleData(year);
    if (!data || !data.models || !data.models[make] || !data.models[make][model]) return;

    var trims = Object.keys(data.models[make][model]).sort();
    trims.forEach(function(trim) {
      var opt = document.createElement('option');
      opt.value = trim;
      opt.textContent = trim;
      this.trimSelect.appendChild(opt);
    }.bind(this));
    this.trimSelect.disabled = false;
  }

  onTrimChange() {
    this.sizePreview.hidden = true;
    this.saveBtn.disabled = true;

    var year = this.yearSelect.value;
    var make = this.makeSelect.value;
    var model = this.modelSelect.value;
    var trim = this.trimSelect.value;
    if (!trim) return;

    var data = this.vehicleCache[year];
    if (!data || !data.models[make] || !data.models[make][model] || !data.models[make][model][trim]) return;

    var sizes = data.models[make][model][trim];
    this.currentTireSize = sizes[0];
    this.sizePreview.textContent = 'Tire size: ' + this.currentTireSize;
    this.sizePreview.hidden = false;
    this.saveBtn.disabled = false;
  }

  /* ---- Form Controls ---- */

  toggleAddForm(forceState) {
    var show = typeof forceState === 'boolean' ? forceState : this.addForm.hidden;
    this.addForm.hidden = !show;
    this.toggleBtn.setAttribute('aria-expanded', String(show));
    if (!show) this.resetForm();
  }

  resetForm() {
    this.yearSelect.value = '';
    this.resetSelect(this.makeSelect);
    this.resetSelect(this.modelSelect);
    this.resetSelect(this.trimSelect);
    this.sizePreview.hidden = true;
    this.saveBtn.disabled = true;
    this.currentTireSize = null;
  }

  onSaveVehicle() {
    var year = this.yearSelect.value;
    var make = this.makeSelect.value;
    var model = this.modelSelect.value;
    var trim = this.trimSelect.value;
    var tireSize = this.currentTireSize;
    if (!year || !make || !model || !trim || !tireSize) return;
    this.addVehicle({ year: parseInt(year), make: make, model: model, trim: trim, tireSize: tireSize });
  }

  /* ---- Vehicle Icon ---- */

  getVehicleIcon(vehicle) {
    if (this.config.customImage) {
      return '<img src="' + this.config.customImage + '" class="garage__vehicle-icon garage__vehicle-icon--custom" alt="" aria-hidden="true">';
    }

    var model = (vehicle.model || '').toLowerCase();
    var tireSize = (vehicle.tireSize || '').toLowerCase();

    var isTruck = /f-?150|f-?250|f-?350|silverado|sierra|ram\b|tundra|tacoma|ridgeline|frontier|colorado|canyon|titan|ranger|maverick|gladiator/.test(model)
               || /^lt/.test(tireSize);

    var isSUV = !isTruck && /cr-?v|rav4|pilot|pathfinder|rogue|explorer|escape|equinox|traverse|highlander|4runner|murano|outback|forester|cx-?5|tucson|santa.?fe|sportage|xc60|xc90|q5|q7|x3|x5|gls|gle|glc|grand.?cherokee|wrangler|cherokee|sequoia|suburban|yukon|tahoe|expedition|navigator|edge|flex|odyssey|sienna|armada|qx/.test(model);

    if (isTruck) {
      return '<svg class="garage__vehicle-icon" viewBox="0 0 80 34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 24 L12 14 L32 11 L44 11 L56 14 L72 18 L76 22 L76 26 L4 26 Z"/><circle cx="18" cy="27.5" r="5.5"/><circle cx="62" cy="27.5" r="5.5"/><path d="M4 22 L12 22 L12 14"/><path d="M44 11 L44 22 M32 11 L32 22"/></svg>';
    }
    if (isSUV) {
      return '<svg class="garage__vehicle-icon" viewBox="0 0 80 34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 24 L10 11 L24 9 L56 9 L68 14 L76 20 L76 26 L4 26 Z"/><circle cx="18" cy="27.5" r="5.5"/><circle cx="62" cy="27.5" r="5.5"/><path d="M10 23 L10 11 L56 9 L56 23"/></svg>';
    }
    return '<svg class="garage__vehicle-icon" viewBox="0 0 80 30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20 L12 13 L22 9 L58 9 L68 13 L76 17 L76 22 L4 22 Z"/><circle cx="18" cy="24" r="5"/><circle cx="62" cy="24" r="5"/><path d="M22 9 L18 21 M58 9 L62 21"/></svg>';
  }

  /* ---- Rendering ---- */

  renderVehicles() {
    var max = this.config.maxVehicles || 10;
    var atMax = this.vehicles.length >= max;

    if (this.vehicles.length === 0) {
      this.vehicleList.innerHTML = '';
      this.emptyState.hidden = false;
    } else {
      this.emptyState.hidden = true;
      this.vehicleList.innerHTML = this.vehicles.map(this.renderCard.bind(this)).join('');
      this.bindCardEvents();
      this.loadOrderHistory();
    }

    if (this.maxMessage) this.maxMessage.hidden = !atMax;
    this.toggleBtn.disabled = atMax;

    this.renderStats();
    this.renderActivityFeed();
    this.renderHistoryPanel();
  }

  renderCard(vehicle) {
    var status = this.getStatusForVehicle(vehicle);
    var statusLabels = { good: 'All good', 'due-soon': 'Service due', overdue: 'Action needed' };
    var title = this.escapeHtml(vehicle.year + ' ' + vehicle.make + ' ' + vehicle.model);
    var icon = this.getVehicleIcon(vehicle);
    var reminders = this.getActiveReminders(vehicle);
    var nickname = vehicle.nickname
      ? vehicle.nickname.replace(/\b\w/g, function(c) { return c.toUpperCase(); })
      : '';

    var reminderHtml = reminders.map(function(r) {
      return '<div class="garage__reminder garage__reminder--' + r.urgency + '">'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
        + '<span>' + this.escapeHtml(r.label) + '</span>'
        + '<button type="button" class="garage__reminder-book" data-action="book-install" data-id="' + this.escapeAttr(vehicle.id) + '">Book now</button>'
        + '</div>';
    }.bind(this)).join('');

    var lastMaintHtml = (vehicle.maintenance && vehicle.maintenance.length)
      ? '<p class="garage__last-service">Last: ' + this.escapeHtml(this.formatServiceType(vehicle.maintenance[0].type)) + ' &mdash; ' + this.escapeHtml(vehicle.maintenance[0].date) + '</p>'
      : '';

    var maintHtml = this.renderMaintenancePanel(vehicle);
    var orderHistoryHtml = '<div class="garage__orders" data-orders-panel data-vehicle-size="' + this.escapeAttr(vehicle.tireSize) + '" hidden></div>';

    // Default badge: solid red pill if default, subtle clickable outline if not
    var defaultBadge = vehicle.isDefault
      ? '<span class="garage__badge garage__badge--active">Default</span>'
      : '<button type="button" class="garage__badge garage__badge--inactive" data-action="default" data-id="' + this.escapeAttr(vehicle.id) + '">Set default</button>';

    return '<li class="garage__card' + (vehicle.isDefault ? ' garage__card--default' : '') + '" data-vehicle-id="' + this.escapeAttr(vehicle.id) + '">'

      // ── Identity ──
      + '<div class="garage__card-identity">'
        + '<div class="garage__card-icon-wrap">' + icon + '</div>'
        + '<div class="garage__card-meta">'
          + '<div class="garage__card-row1">'
            + '<h3 class="garage__card-title">' + title + '</h3>'
            + '<span class="garage__status garage__status--' + status + '">' + this.escapeHtml(statusLabels[status]) + '</span>'
          + '</div>'
          + (nickname ? '<p class="garage__card-nickname">\u201c' + this.escapeHtml(nickname) + '\u201d</p>' : '')
          + '<p class="garage__card-trim">' + this.escapeHtml(vehicle.trim) + '</p>'
          + '<div class="garage__card-footer-row">'
            + '<span class="garage__size-chip">' + this.escapeHtml(vehicle.tireSize) + '</span>'
            + defaultBadge
          + '</div>'
        + '</div>'
      + '</div>'

      // ── Reminders ──
      + (reminderHtml ? '<div class="garage__reminders">' + reminderHtml + '</div>' : '')

      // ── Actions ──
      + '<div class="garage__card-actions">'

        // Row 1: two equal primary CTAs
        + '<div class="garage__actions-primary">'
          + '<a href="/collections/tires?filter.p.m.custom.tire_size=' + encodeURIComponent(vehicle.tireSize) + '" class="garage__action-btn garage__action-btn--red">'
            + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>'
            + 'Shop tires'
          + '</a>'
          + '<a href="#" class="garage__action-btn garage__action-btn--outline" data-action="book-install" data-id="' + this.escapeAttr(vehicle.id) + '">'
            + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
            + 'Book install'
          + '</a>'
        + '</div>'

        // Row 2: always exactly 4 chips
        + '<div class="garage__actions-secondary">'
          + '<button type="button" class="garage__action-chip" data-action="toggle-maint" data-id="' + this.escapeAttr(vehicle.id) + '">'
            + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'
            + 'Log service'
          + '</button>'
          + '<button type="button" class="garage__action-chip" data-action="toggle-orders" data-id="' + this.escapeAttr(vehicle.id) + '">'
            + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>'
            + 'Orders'
          + '</button>'
          + '<button type="button" class="garage__action-chip" data-action="nickname" data-id="' + this.escapeAttr(vehicle.id) + '">'
            + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
            + (nickname ? 'Rename' : 'Name it')
          + '</button>'
          + '<button type="button" class="garage__action-chip garage__action-chip--danger" data-action="remove" data-id="' + this.escapeAttr(vehicle.id) + '">'
            + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
            + 'Remove'
          + '</button>'
        + '</div>'

      + '</div>'

      + lastMaintHtml
      + maintHtml
      + orderHistoryHtml

    + '</li>';
  }

  renderMaintenancePanel(vehicle) {
    var today = new Date().toISOString().split('T')[0];
    var historyHtml = (vehicle.maintenance && vehicle.maintenance.length)
      ? vehicle.maintenance.slice(0, 8).map(function(e) {
          return '<li class="garage__maint-entry">'
            + '<span class="garage__maint-type-label">' + this.escapeHtml(this.formatServiceType(e.type)) + '</span>'
            + '<span class="garage__maint-date-label">' + this.escapeHtml(e.date) + '</span>'
            + (e.mileage ? '<span class="garage__maint-km-label">' + e.mileage.toLocaleString() + ' km</span>' : '')
          + '</li>';
        }.bind(this)).join('')
      : '<li class="garage__maint-entry garage__maint-entry--empty">No service history yet</li>';

    return '<div class="garage__maint-panel" data-maint-panel hidden>'
      + '<div class="garage__maint-log-form">'
        + '<p class="garage__maint-form-title">Log a service</p>'
        + '<div class="garage__maint-fields">'
          + '<select data-maint-type class="garage__maint-select">'
            + '<option value="rotation">Tire rotation</option>'
            + '<option value="installation">New tires installed</option>'
            + '<option value="winter_install">Winter tire swap (in)</option>'
            + '<option value="summer_install">Summer/A-S swap (in)</option>'
            + '<option value="balance">Wheel balance</option>'
            + '<option value="alignment">Wheel alignment</option>'
            + '<option value="inspection">Tire inspection</option>'
            + '<option value="tpms">TPMS service</option>'
            + '<option value="other">Other service</option>'
          + '</select>'
          + '<input type="date" data-maint-date value="' + today + '" class="garage__maint-input">'
          + '<input type="number" data-maint-mileage placeholder="Odometer km" class="garage__maint-input" min="0" max="999999">'
        + '</div>'
        + '<div class="garage__maint-form-actions">'
          + '<button type="button" class="garage__maint-save" data-action="save-maint" data-id="' + this.escapeAttr(vehicle.id) + '">Save entry</button>'
          + '<button type="button" class="garage__maint-cancel" data-action="toggle-maint" data-id="' + this.escapeAttr(vehicle.id) + '">Cancel</button>'
        + '</div>'
      + '</div>'
      + '<ul class="garage__maint-history">' + historyHtml + '</ul>'
    + '</div>';
  }

  /* ---- Order History (populated from window.__ptOrders injected by Liquid) ---- */

  loadOrderHistory() {
    var ordersEl = document.getElementById('pt-order-history');
    if (!ordersEl) return;
    try {
      window.__ptOrders = JSON.parse(ordersEl.textContent);
    } catch (e) {
      window.__ptOrders = [];
    }
  }

  renderOrderHistory(vehicleId) {
    var vehicle = this.vehicles.find(function(v) { return v.id === vehicleId; });
    if (!vehicle) return;

    var card = this.vehicleList.querySelector('[data-vehicle-id="' + vehicleId + '"]');
    if (!card) return;

    var panel = card.querySelector('[data-orders-panel]');
    if (!panel) return;

    var orders = window.__ptOrders || [];
    var tireSize = vehicle.tireSize;

    // Find orders that have line items with matching tire size
    var matching = [];
    orders.forEach(function(order) {
      order.items.forEach(function(item) {
        if (item.tire_size && item.tire_size === tireSize) {
          matching.push({ order: order, item: item });
        }
      });
    });

    if (!matching.length) {
      panel.innerHTML = '<p class="garage__orders-empty">No previous orders found for ' + this.escapeHtml(tireSize) + ' tires.</p>';
      return;
    }

    panel.innerHTML = '<p class="garage__orders-title">Previous orders for this vehicle</p>'
      + matching.slice(0, 4).map(function(m) {
          return '<div class="garage__order-row">'
            + '<div class="garage__order-info">'
              + '<span class="garage__order-name">' + this.escapeHtml(m.item.title) + '</span>'
              + '<span class="garage__order-meta">' + this.escapeHtml(m.order.date) + ' · ' + this.escapeHtml(m.item.price) + '</span>'
            + '</div>'
            + '<a href="' + this.escapeAttr(m.item.product_url) + '" class="garage__order-reorder">Buy again</a>'
          + '</div>';
        }.bind(this)).join('');
  }

  /* ---- Card Event Binding ---- */

  bindCardEvents() {
    var self = this;
    this.vehicleList.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = btn.dataset.action;
        var id = btn.dataset.id;
        if (action === 'default') self.setDefault(id);
        else if (action === 'nickname') self.setNickname(id);
        else if (action === 'remove') self.removeVehicle(id);
        else if (action === 'book-install') self.bookInstallForVehicle(id);
        else if (action === 'toggle-maint') self.togglePanel(id, '[data-maint-panel]');
        else if (action === 'save-maint') self.saveMaintenanceEntry(id);
        else if (action === 'toggle-orders') {
          self.togglePanel(id, '[data-orders-panel]');
          self.renderOrderHistory(id);
        }
      });
    });
  }

  togglePanel(vehicleId, selector) {
    var card = this.vehicleList.querySelector('[data-vehicle-id="' + vehicleId + '"]');
    if (!card) return;
    var panel = card.querySelector(selector);
    if (panel) panel.hidden = !panel.hidden;
  }

  /* ---- Event Binding ---- */

  bindEvents() {
    this.toggleBtn.addEventListener('click', this.toggleAddForm.bind(this, undefined));
    this.yearSelect.addEventListener('change', this.onYearChange.bind(this));
    this.makeSelect.addEventListener('change', this.onMakeChange.bind(this));
    this.modelSelect.addEventListener('change', this.onModelChange.bind(this));
    this.trimSelect.addEventListener('change', this.onTrimChange.bind(this));
    this.saveBtn.addEventListener('click', this.onSaveVehicle.bind(this));
    this.cancelBtn.addEventListener('click', this.toggleAddForm.bind(this, false));
  }

  initTabs() {
    var self = this;
    var tabs   = Array.from(this.querySelectorAll('[data-garage-tab]'));
    var panels = Array.from(this.querySelectorAll('[data-tab-panel]'));
    if (!tabs.length || !panels.length) return;

    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var target = tab.dataset.garageTab;
        // update active class
        tabs.forEach(function(t) { t.classList.remove('g-tab--active'); });
        tab.classList.add('g-tab--active');
        // show matching panel, hide rest
        panels.forEach(function(p) {
          p.hidden = (p.dataset.tabPanel !== target);
        });
        // populate panels on demand
        if (target === 'history') self.renderHistoryPanel();
        if (target === 'bookings') self.loadBookings();
      });
    });
  }

  /* ---- Dashboard ---- */

  renderStats() {
    if (!this.statsEl) return;
    var total = this.vehicles.length;
    var alerts = this.vehicles.filter(function(v) {
      var s = this.getStatusForVehicle(v);
      return s === 'overdue' || s === 'due-soon';
    }.bind(this)).length;

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var nextService = null;
    this.vehicles.forEach(function(v) {
      if (!v.reminders) return;
      ['nextRotation', 'nextWinterSwap', 'nextSummerSwap'].forEach(function(key) {
        if (!v.reminders[key]) return;
        var d = new Date(v.reminders[key]);
        if (d >= today && (!nextService || d < nextService.date)) {
          nextService = { date: d, label: this.formatShortDate(d) };
        }
      }.bind(this));
    }.bind(this));

    var orders = this.config.ordersCount || 0;
    var nextLabel = nextService ? this.escapeHtml(nextService.label) : '—';
    var alertMod = alerts > 0 ? ' garage__stat-card--alert' : '';

    function card(num, label, mod) {
      return '<div class="garage__stat-card' + (mod || '') + '">'
        + '<span class="garage__stat-num">' + num + '</span>'
        + '<span class="garage__stat-label">' + label + '</span>'
        + '</div>';
    }

    this.statsEl.innerHTML =
      card(total, 'Vehicles') +
      card(alerts, 'Alerts', alertMod) +
      card(nextLabel, 'Next service', ' garage__stat-card--next') +
      card(orders, 'Orders');
  }

  renderSeasonalTip() {
    if (!this.seasonalEl) return;
    var month = new Date().getMonth(); // 0 = Jan
    var tip = null;

    if (month === 9 || month === 10) {
      tip = {
        icon: '❄️',
        label: 'Winter tire season approaching',
        sub: 'Calgary roads get icy fast. Book your winter swap early — slots fill up by late October.',
        cta: 'Book swap',
        href: '/pages/services'
      };
    } else if (month === 4 || month === 5) {
      tip = {
        icon: '🌱',
        label: 'Summer swap season',
        sub: 'Temps are holding above 7°C — time to switch back to summer or all-season tires.',
        cta: 'Book swap',
        href: '/pages/services'
      };
    } else if (month === 11 || month === 0 || month === 1 || month === 2) {
      tip = {
        icon: '🧊',
        label: 'Cold weather tip',
        sub: 'Check tire pressure monthly — every 10°C drop loses ~1 PSI. Keep tires inflated to spec.',
        cta: null,
        href: null
      };
    } else {
      tip = {
        icon: '☀️',
        label: 'Summer maintenance',
        sub: 'Hot pavement accelerates wear. Rotate every 10,000–12,000 km and check tread before road trips.',
        cta: 'Shop tires',
        href: '/collections/tires'
      };
    }

    var ctaHtml = tip.cta
      ? '<a href="' + tip.href + '" class="garage__seasonal-tip-action">' + tip.cta + '</a>'
      : '';

    this.seasonalEl.innerHTML = '<span class="garage__seasonal-tip-icon">' + tip.icon + '</span>'
      + '<div class="garage__seasonal-tip-text">'
        + '<div class="garage__seasonal-tip-label">' + this.escapeHtml(tip.label) + '</div>'
        + '<div class="garage__seasonal-tip-sub">' + this.escapeHtml(tip.sub) + '</div>'
      + '</div>'
      + ctaHtml;
    this.seasonalEl.hidden = false;
  }

  renderActivityFeed() {
    if (!this.activityEl || !this.activityListEl) return;

    var entries = [];
    this.vehicles.forEach(function(v) {
      var label = v.year + ' ' + v.make + ' ' + (v.nickname ? '"' + v.nickname + '"' : v.model);
      (v.maintenance || []).forEach(function(e) {
        entries.push({ type: e.type, date: e.date, mileage: e.mileage, vehicle: label });
      });
    });

    if (entries.length === 0) {
      this.activityEl.hidden = true;
      return;
    }

    entries.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    this.activityEl.hidden = false;
    this.activityListEl.innerHTML = entries.slice(0, 8).map(function(e) {
      var kmHtml = e.mileage
        ? '<span class="garage__activity-km">' + e.mileage.toLocaleString() + ' km</span>'
        : '';
      return '<li class="garage__activity-item">'
        + '<span class="garage__activity-dot"></span>'
        + '<div class="garage__activity-info">'
          + '<div class="garage__activity-what">' + this.escapeHtml(this.formatServiceType(e.type)) + '</div>'
          + '<div class="garage__activity-vehicle">' + this.escapeHtml(e.vehicle) + '</div>'
        + '</div>'
        + kmHtml
        + '<span class="garage__activity-when">' + this.escapeHtml(e.date) + '</span>'
      + '</li>';
    }.bind(this)).join('');
  }

  renderHistoryPanel() {
    if (!this.historyListEl) return;

    var entries = [];
    this.vehicles.forEach(function(v) {
      var label = v.year + ' ' + v.make + ' ' + v.model;
      if (v.nickname) label += ' \u201c' + v.nickname + '\u201d';
      (v.maintenance || []).forEach(function(e) {
        entries.push({ type: e.type, date: e.date, mileage: e.mileage, vehicle: label });
      });
    });

    if (!entries.length) {
      this.historyListEl.innerHTML = '<p class="garage__history-empty-msg">No service records yet. Use \u201cLog service\u201d on any vehicle card to get started.</p>';
      return;
    }

    entries.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    this.historyListEl.innerHTML = entries.map(function(e) {
      return '<div class="garage__history-entry">'
        + '<div class="garage__history-entry-left">'
          + '<span class="garage__history-type">' + this.escapeHtml(this.formatServiceType(e.type)) + '</span>'
          + '<span class="garage__history-vehicle">' + this.escapeHtml(e.vehicle) + '</span>'
        + '</div>'
        + '<div class="garage__history-entry-right">'
          + (e.mileage ? '<span class="garage__history-km">' + e.mileage.toLocaleString() + ' km</span>' : '')
          + '<span class="garage__history-date">' + this.escapeHtml(e.date) + '</span>'
        + '</div>'
      + '</div>';
    }.bind(this)).join('');
  }

  /* ---- Helpers ---- */

  escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

customElements.define('my-garage', MyGarage);
