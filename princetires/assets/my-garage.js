class MyGarage extends HTMLElement {
  constructor() {
    super();
    const configEl = document.querySelector('[data-garage-config]');
    this.config = configEl ? JSON.parse(configEl.textContent) : {};
    this.vehicleCache = {};
    this._syncTimer = null;
    this._syncing = false;

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

    // Phase 1 — Q4 + Q11: cache-then-refresh from /apps/api/vehicles.
    // Local cache rendered above is the instant-paint state; this bg sync
    // migrates legacy localStorage vehicles up to the server (idempotent
    // INSERT ON CONFLICT DO NOTHING) and then swaps the local cache for the
    // canonical server list.
    if (this.config.customerId) {
      this.startApiSync();
    }
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

  /* ---- API layer (Phase 1) ---- */

  // Generic fetch wrapper. Throws on non-2xx with .status set on the error.
  async api(method, path, body) {
    var opts = { method: method, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(path, opts);
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error('API ' + method + ' ' + path + ' -> ' + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // Convert local vehicle shape -> API request body. Empty strings become
  // undefined so optional fields don't trip Zod's .strict() outer object.
  localToApiBody(v, opts) {
    var body = {
      year: typeof v.year === 'number' ? v.year : parseInt(v.year, 10),
      make: v.make,
      model: v.model
    };
    if (v.id) body.id = v.id;
    if (v.nickname) body.nickname = v.nickname;
    if (v.trim) body.trim = v.trim;
    if (v.tireSize) body.tireSize = v.tireSize;
    if (Array.isArray(v.maintenance)) body.maintenance = v.maintenance;
    if (v.reminders) body.reminders = v.reminders;
    // isDefault: caller decides (migration suppresses, explicit add follows local)
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'isDefault')) {
      body.isDefault = opts.isDefault;
    } else if (typeof v.isDefault === 'boolean') {
      body.isDefault = v.isDefault;
    }
    return body;
  }

  // Convert API response vehicle -> local vehicle shape.
  apiToLocal(api) {
    return {
      id: api.id,
      nickname: api.nickname || '',
      year: api.year,
      make: api.make,
      model: api.model,
      trim: api.trim || '',
      tireSize: api.tireSize || '',
      isDefault: !!api.isDefault,
      addedAt: api.createdAt,
      maintenance: Array.isArray(api.maintenance) ? api.maintenance : [],
      reminders: api.reminders && Object.keys(api.reminders).length ? api.reminders : null,
      imageUrl: api.imageUrl || null
    };
  }

  /* ---- Photo upload (Phase 1.6) ---- */

  // Lazily creates a hidden file input (shared across vehicles). Called the
  // first time the user taps the Photo action on any vehicle card.
  ensurePhotoInput() {
    if (this._photoInput) return this._photoInput;
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/jpeg,image/png,image/webp';
    inp.capture = 'environment'; // hint mobile to open the rear camera
    inp.style.display = 'none';
    inp.addEventListener('change', this.onPhotoSelected.bind(this));
    document.body.appendChild(inp);
    this._photoInput = inp;
    return inp;
  }

  triggerPhotoUpload(id) {
    if (!this.config.customerId) {
      alert('Please log in to add a photo.');
      return;
    }
    this._pendingPhotoVehicleId = id;
    var inp = this.ensurePhotoInput();
    inp.value = ''; // reset so picking the same file twice still fires change
    inp.click();
  }

  async onPhotoSelected(e) {
    var file = e.target.files && e.target.files[0];
    var id = this._pendingPhotoVehicleId;
    this._pendingPhotoVehicleId = null;
    if (!file || !id) return;

    var MAX = 8 * 1024 * 1024;
    if (file.size > MAX) {
      alert('Image is too large. Maximum size is 8 MB.');
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      alert('Unsupported image type. Use JPEG, PNG, or WEBP.');
      return;
    }

    // Optimistic loading state on the card.
    var card = this.vehicleList && this.vehicleList.querySelector('[data-vehicle-id="' + id + '"]');
    if (card) card.classList.add('garage__card--uploading');

    var fd = new FormData();
    fd.append('image', file);
    try {
      var res = await fetch('/apps/api/vehicles/' + encodeURIComponent(id) + '/image', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || ('upload failed (' + res.status + ')'));
      var idx = this.vehicles.findIndex(function(v) { return v.id === id; });
      if (idx >= 0 && data.vehicle) {
        this.vehicles[idx] = this.apiToLocal(data.vehicle);
        this.saveToStorage();
        this.renderVehicles();
      }
    } catch (err) {
      console.error('[my-garage] photo upload failed', err);
      alert('Could not upload photo: ' + (err.message || 'unknown error'));
      if (card) card.classList.remove('garage__card--uploading');
    }
  }

  /* Lightbox — tap photo banner to view full-size. Single shared overlay
     element appended to <body> on first use. */
  ensureLightbox() {
    if (this._lightbox) return this._lightbox;
    var box = document.createElement('div');
    box.className = 'garage__lightbox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Vehicle photo');
    box.innerHTML = '<button type="button" class="garage__lightbox-close" aria-label="Close">&times;</button>'
      + '<img class="garage__lightbox-img" src="" alt="">';
    var close = box.querySelector('.garage__lightbox-close');
    var self = this;
    var hide = function() { self.closePhotoLightbox(); };
    box.addEventListener('click', function(e) {
      // Click on the dim background closes; click on the image itself does not.
      if (e.target === box || e.target === close) hide();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !box.hidden) hide();
    });
    document.body.appendChild(box);
    this._lightbox = box;
    return box;
  }

  openPhotoLightbox(id) {
    var v = this.vehicles.find(function(x) { return x.id === id; });
    if (!v || !v.imageUrl) return;
    var box = this.ensureLightbox();
    var img = box.querySelector('.garage__lightbox-img');
    img.src = v.imageUrl;
    img.alt = v.year + ' ' + v.make + ' ' + v.model;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  closePhotoLightbox() {
    if (!this._lightbox) return;
    this._lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  async removeVehiclePhoto(id) {
    if (!this.config.customerId) return;
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (!vehicle || !vehicle.imageUrl) return;
    if (!confirm('Remove this photo?')) return;
    try {
      var res = await fetch('/apps/api/vehicles/' + encodeURIComponent(id) + '/image', {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || ('remove failed (' + res.status + ')'));
      var idx = this.vehicles.findIndex(function(v) { return v.id === id; });
      if (idx >= 0 && data.vehicle) {
        this.vehicles[idx] = this.apiToLocal(data.vehicle);
        this.saveToStorage();
        this.renderVehicles();
      }
    } catch (err) {
      console.error('[my-garage] photo remove failed', err);
      alert('Could not remove photo: ' + (err.message || 'unknown error'));
    }
  }

  // Q4 — top-level sync. Migrates legacy localStorage on first run, then
  // refreshes from the server. Best-effort; failures fall back to local.
  async startApiSync() {
    if (this._syncing) return;
    this._syncing = true;
    try {
      var migrationKey = this.storageKey + ':migrated';
      var alreadyMigrated = localStorage.getItem(migrationKey) === '1';

      if (!alreadyMigrated) {
        if (this.vehicles.length === 0) {
          // Nothing to migrate; mark done so we don't retry on every page load.
          localStorage.setItem(migrationKey, '1');
        } else {
          var allOk = await this.migrateLocalToApi();
          if (allOk) localStorage.setItem(migrationKey, '1');
        }
      }

      await this.refreshFromApi();
    } catch (err) {
      if (err && err.status === 401) {
        // Logged out / signature mismatch — stay on localStorage. No migration flag.
        return;
      }
      console.error('[my-garage] api sync failed', err);
    } finally {
      this._syncing = false;
    }
  }

  // Q4 — POST every local vehicle (idempotent: server uses ON CONFLICT DO
  // NOTHING). Always sends isDefault=false so we don't trip the
  // partial-unique index when local data has multiple flagged defaults.
  // After all POSTs land, set the (single) chosen default explicitly.
  // Returns true iff every individual POST succeeded.
  async migrateLocalToApi() {
    var allOk = true;
    var localDefault = this.vehicles.find(function(v) { return v.isDefault; })
                    || this.vehicles[0]
                    || null;

    for (var i = 0; i < this.vehicles.length; i++) {
      var v = this.vehicles[i];
      try {
        await this.api('POST', '/apps/api/vehicles', this.localToApiBody(v, { isDefault: false }));
      } catch (err) {
        if (err && err.status === 401) throw err;
        allOk = false;
        console.warn('[my-garage] migrate skipped vehicle', v && v.id, err);
      }
    }

    if (localDefault) {
      try {
        await this.api('PATCH', '/apps/api/vehicles/' + encodeURIComponent(localDefault.id) + '/default');
      } catch (err) {
        if (err && err.status === 401) throw err;
        // Non-fatal — refreshFromApi will reflect whatever default the server holds.
        console.warn('[my-garage] post-migrate set-default failed', err);
      }
    }
    return allOk;
  }

  // Q11 — pull canonical server list and replace local cache. No-op if the
  // GET fails or the customer isn't logged in.
  async refreshFromApi() {
    var data = await this.api('GET', '/apps/api/vehicles');
    if (!data || !Array.isArray(data.vehicles)) return;
    this.vehicles = data.vehicles.map(this.apiToLocal);
    this.saveToStorage();
    this.renderVehicles();
  }

  /* ---- Vehicle CRUD ---- */

  async addVehicle(data) {
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

    // Optimistic local insert + render
    this.vehicles.push(vehicle);
    this.saveToStorage();
    this.renderVehicles();
    this.toggleAddForm(false);
    this.resetForm();

    if (!this.config.customerId) return;

    try {
      var resp = await this.api('POST', '/apps/api/vehicles', this.localToApiBody(vehicle));
      if (resp && resp.vehicle) {
        var idx = this.vehicles.findIndex(function(v) { return v.id === vehicle.id; });
        if (idx >= 0) {
          this.vehicles[idx] = this.apiToLocal(resp.vehicle);
          this.saveToStorage();
          this.renderVehicles();
        }
      }
    } catch (err) {
      console.error('[my-garage] addVehicle failed', err);
      // Keep optimistic local state; user can retry the action that depends on this row.
    }
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

  async removeVehicle(id) {
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (!vehicle) return;

    var label = vehicle.year + ' ' + vehicle.make + ' ' + vehicle.model;
    if (!confirm('Remove ' + label + ' from your garage?')) return;

    var snapshot = this.vehicles.slice();
    var wasDefault = vehicle.isDefault;
    this.vehicles = this.vehicles.filter(function(v) { return v.id !== id; });

    if (wasDefault && this.vehicles.length > 0) {
      this.vehicles[0].isDefault = true;
    }

    this.saveToStorage();
    this.renderVehicles();

    if (!this.config.customerId) return;

    try {
      var resp = await this.api('DELETE', '/apps/api/vehicles/' + encodeURIComponent(id));
      if (resp && Array.isArray(resp.vehicles)) {
        // Q7 — server returned the refreshed list; replace cache atomically.
        this.vehicles = resp.vehicles.map(this.apiToLocal);
        this.saveToStorage();
        this.renderVehicles();
      }
    } catch (err) {
      if (err && err.status === 404) {
        // Already gone server-side — keep the local removal.
        return;
      }
      console.error('[my-garage] removeVehicle failed', err);
      // Roll back so the user doesn't lose data on a transient API failure.
      this.vehicles = snapshot;
      this.saveToStorage();
      this.renderVehicles();
    }
  }

  async setDefault(id) {
    var snapshot = this.vehicles.slice().map(function(v) { return Object.assign({}, v); });
    this.vehicles.forEach(function(v) { v.isDefault = false; });
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (vehicle) vehicle.isDefault = true;
    this.saveToStorage();
    this.renderVehicles();

    if (!this.config.customerId) return;

    try {
      var resp = await this.api('PATCH', '/apps/api/vehicles/' + encodeURIComponent(id) + '/default');
      if (resp && Array.isArray(resp.vehicles)) {
        this.vehicles = resp.vehicles.map(this.apiToLocal);
        this.saveToStorage();
        this.renderVehicles();
      }
    } catch (err) {
      console.error('[my-garage] setDefault failed', err);
      this.vehicles = snapshot;
      this.saveToStorage();
      this.renderVehicles();
    }
  }

  async setNickname(id) {
    var vehicle = this.vehicles.find(function(v) { return v.id === id; });
    if (!vehicle) return;
    var current = vehicle.nickname || '';
    var name = prompt('Enter a nickname for this vehicle (max 20 characters):', current);
    if (name === null) return;
    var trimmed = name.substring(0, 20).trim();

    var snapshotNick = vehicle.nickname;
    vehicle.nickname = trimmed;
    this.saveToStorage();
    this.renderVehicles();

    if (!this.config.customerId) return;

    try {
      await this.api('PATCH', '/apps/api/vehicles/' + encodeURIComponent(id), {
        nickname: trimmed || null
      });
    } catch (err) {
      console.error('[my-garage] setNickname failed', err);
      vehicle.nickname = snapshotNick;
      this.saveToStorage();
      this.renderVehicles();
    }
  }

  /* ---- Maintenance Tracking ---- */

  async saveMaintenanceEntry(id) {
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

    var snapshotMaint = (vehicle.maintenance || []).slice();
    var snapshotRem = vehicle.reminders ? Object.assign({}, vehicle.reminders) : null;

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

    if (!this.config.customerId) return;

    try {
      await this.api('PATCH', '/apps/api/vehicles/' + encodeURIComponent(id), {
        maintenance: vehicle.maintenance,
        reminders: vehicle.reminders
      });
    } catch (err) {
      console.error('[my-garage] saveMaintenanceEntry failed', err);
      vehicle.maintenance = snapshotMaint;
      vehicle.reminders = snapshotRem;
      this.saveToStorage();
      this.renderVehicles();
    }
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
    listEl.innerHTML = '<div class="gbk-loading"><div class="gbk-spinner"></div><span>Loading your bookings…</span></div>';

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
          + '<p class="gbk-empty-sub">You don’t have any scheduled installations at the moment.</p>'
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
        + '<p class="gbk-empty-title">Couldn’t load bookings</p>'
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
    // Per-vehicle uploaded photo wins over everything.
    if (vehicle.imageUrl) {
      return '<img src="' + this.escapeAttr(vehicle.imageUrl) + '" class="garage__vehicle-icon garage__vehicle-icon--photo" alt="" aria-hidden="true">';
    }
    // Section-level merchant fallback image. Skipped on phones — the
    // customImage tends to be the shop logo, which competes with the
    // vehicle title without communicating anything new about the car.
    // The type-aware SVG silhouette is the smarter no-photo state on
    // mobile (CSS `:has(--custom)` rule alone wasn't reliable across
    // Safari versions, hence the JS check).
    var isPhone = typeof window !== 'undefined' && window.innerWidth <= 768;
    if (this.config.customImage && !isPhone) {
      return '<img src="' + this.config.customImage + '" class="garage__vehicle-icon garage__vehicle-icon--custom" alt="" aria-hidden="true">';
    }
    return this.getVehicleSvg(this.detectVehicleType(vehicle));
  }

  detectVehicleType(vehicle) {
    var make = (vehicle.make || '').toLowerCase();
    var model = (vehicle.model || '').toLowerCase();
    var trim = (vehicle.trim || '').toLowerCase();
    var tireSize = (vehicle.tireSize || '').toLowerCase();
    var hay = make + ' ' + model + ' ' + trim;

    // LT-prefix tire sizes (e.g. LT265/70R17) are the giveaway for light trucks.
    if (/^lt/.test(tireSize)) return 'truck';

    // Pickup trucks
    if (/\bf-?(150|250|350|450)\b|silverado|sierra|\bram\b|tundra|tacoma|ridgeline|frontier|colorado|canyon|titan|ranger|maverick|gladiator|cybertruck|rivian.*r1t|\br1t\b|hummer ev pickup/.test(hay)) {
      return 'truck';
    }

    // Vans / minivans (more specific than SUV — check first)
    if (/odyssey|sienna|pacifica|caravan|town.?and.?country|carnival|sedona|metris|transit\b|sprinter|express\b|savana|promaster|nv200|nv\d|quest\b/.test(hay)) {
      return 'van';
    }

    // SUVs / crossovers
    if (/cr-?v|hr-?v|rav4|pilot|passport|pathfinder|rogue|kicks|murano|armada|qx\d|explorer|escape|expedition|edge|flex|bronco\b|equinox|traverse|tahoe|suburban|blazer\b|yukon|highlander|4runner|venza|sequoia|outback|forester|ascent|crosstrek|cx-?\d|tucson|santa.?fe|kona|sportage|telluride|sorento|seltos|x[1-7]\b|q[3-8]\b|gl[abces]|gle|glc|gls|wrangler|cherokee|grand.?cherokee|wagoneer|patriot|compass|renegade|navigator|aviator|nautilus|corsair|eclipse cross|outlander|escalade|xt[456]|xc\d{2}|envision|enclave|trailblazer|trax|ev6|ioniq.?5|model.?[xy]|mach-?e|id\.?4|bz4x|defender|range rover|discovery|evoque|velar/.test(hay)) {
      return 'suv';
    }

    // Coupes / sports cars (sleek silhouette)
    if (/\bm[2-8]\b|amg|gt-?[rs]|gt[1234]|corvette|mustang|camaro|challenger|charger.*hellcat|hellcat|demon|nsx|gtr\b|supra|brz|gr86|miata|mx-?5|cayman|boxster|911|panamera|718|f-?type|aston|huracan|aventador|ferrari|lamborghini|porsche|maserati|type.?[rs]|civic.?si|wrx|sti|elantra.?n\b|veloster\b|integra type|rs[3-7]\b|s[3-8]\b|dbs?\b|vantage|continental.?gt/.test(hay)) {
      return 'coupe';
    }

    return 'sedan';
  }

  getVehicleSvg(type) {
    var common = 'class="garage__vehicle-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (type === 'truck') {
      // Tall cab + open bed + chunky tires
      return '<svg ' + common + ' viewBox="0 0 80 34"><path d="M4 24 L12 14 L32 11 L44 11 L56 14 L72 18 L76 22 L76 26 L4 26 Z"/><circle cx="18" cy="27.5" r="5.5"/><circle cx="62" cy="27.5" r="5.5"/><path d="M4 22 L12 22 L12 14"/><path d="M44 11 L44 22 M32 11 L32 22"/></svg>';
    }
    if (type === 'suv') {
      // Tall greenhouse, big quarter window
      return '<svg ' + common + ' viewBox="0 0 80 34"><path d="M4 24 L10 11 L24 9 L56 9 L68 14 L76 20 L76 26 L4 26 Z"/><circle cx="18" cy="27.5" r="5.5"/><circle cx="62" cy="27.5" r="5.5"/><path d="M10 23 L10 11 L56 9 L56 23"/></svg>';
    }
    if (type === 'van') {
      // Boxy single-volume profile, sliding-door hint
      return '<svg ' + common + ' viewBox="0 0 80 34"><path d="M4 26 L4 11 L62 11 L72 16 L76 22 L76 26 Z"/><circle cx="18" cy="27.5" r="5.5"/><circle cx="62" cy="27.5" r="5.5"/><path d="M4 22 L72 22"/><path d="M30 11 L30 22 M50 11 L50 22"/></svg>';
    }
    if (type === 'coupe') {
      // Low fastback roofline
      return '<svg ' + common + ' viewBox="0 0 80 30"><path d="M4 22 L10 17 L26 11 L52 9 L66 12 L76 17 L76 22 L4 22 Z"/><circle cx="18" cy="24" r="5"/><circle cx="62" cy="24" r="5"/><path d="M26 11 L24 19 L60 19 L66 12"/></svg>';
    }
    // Default: sedan (3-box silhouette)
    return '<svg ' + common + ' viewBox="0 0 80 30"><path d="M4 20 L12 13 L22 9 L58 9 L68 13 L76 17 L76 22 L4 22 Z"/><circle cx="18" cy="24" r="5"/><circle cx="62" cy="24" r="5"/><path d="M22 9 L18 21 M58 9 L62 21"/></svg>';
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

    // When a customer photo is uploaded, render it as a full-width banner
    // above the identity row (instead of the small inline icon). The banner
    // is a button so taps open the lightbox to enlarge.
    var photoBannerHtml = '';
    if (vehicle.imageUrl) {
      photoBannerHtml = '<button type="button" class="garage__photo-banner" data-action="open-photo" data-id="'
        + this.escapeAttr(vehicle.id) + '" aria-label="View photo full size">'
        + '<img src="' + this.escapeAttr(vehicle.imageUrl) + '" alt="" loading="lazy">'
        + '</button>';
    }

    return '<li class="garage__card' + (vehicle.isDefault ? ' garage__card--default' : '')
      + (vehicle.imageUrl ? ' garage__card--has-photo' : '')
      + '" data-vehicle-id="' + this.escapeAttr(vehicle.id) + '">'

      // ── Photo banner (when uploaded) ──
      + photoBannerHtml

      // ── Identity ──
      + '<div class="garage__card-identity">'
        // The small icon-wrap is suppressed when a photo banner is present;
        // banner replaces it as the visual identifier.
        + (vehicle.imageUrl ? '' : '<div class="garage__card-icon-wrap">' + icon + '</div>')
        + '<div class="garage__card-meta">'
          + '<div class="garage__card-row1">'
            + '<h3 class="garage__card-title">' + title + '</h3>'
            + '<span class="garage__status garage__status--' + status + '">' + this.escapeHtml(statusLabels[status]) + '</span>'
          + '</div>'
          + (nickname ? '<p class="garage__card-nickname">“' + this.escapeHtml(nickname) + '”</p>' : '')
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
          + '<button type="button" class="garage__action-chip" data-action="photo" data-id="' + this.escapeAttr(vehicle.id) + '">'
            + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
            + (vehicle.imageUrl ? 'Replace photo' : 'Add photo')
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
        else if (action === 'photo') self.triggerPhotoUpload(id);
        else if (action === 'open-photo') self.openPhotoLightbox(id);
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
    // Both the toolbar "Add vehicle" button and the empty-state "Add your
    // first vehicle" button share the same data-garage-toggle-add hook.
    // querySelectorAll catches both; the original querySelector grabbed
    // only the first, leaving the empty-state button silently dead.
    var self = this;
    this.querySelectorAll('[data-garage-toggle-add]').forEach(function(btn) {
      btn.addEventListener('click', function() { self.toggleAddForm(undefined); });
    });
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
        cta: 'Book service',
        href: '/pages/booking'
      };
    } else if (month === 4 || month === 5) {
      tip = {
        icon: '🌱',
        label: 'Summer swap season',
        sub: 'Temps are holding above 7°C — time to switch back to summer or all-season tires.',
        cta: 'Book service',
        href: '/pages/booking'
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
      if (v.nickname) label += ' “' + v.nickname + '”';
      (v.maintenance || []).forEach(function(e) {
        entries.push({ type: e.type, date: e.date, mileage: e.mileage, vehicle: label });
      });
    });

    if (!entries.length) {
      this.historyListEl.innerHTML = '<p class="garage__history-empty-msg">No service records yet. Use “Log service” on any vehicle card to get started.</p>';
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
