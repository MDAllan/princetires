/*
 * pt-package-builder.js: the wheel + tire package builder (sections/pt-package-builder.liquid).
 *
 * Spec: docs/package-builder-v1-spec.md §5 + §7 (app repo). UX: the owner-approved
 * guided prototype (2026-10-23): ONE page, no stepper.
 *
 *  1. "Find your wheels" comes first: question chips the customer answers in any
 *     order (What's this set for? / What look? / Wheel size) and a whole-package
 *     BUDGET slider (installed, incl. GST). Answers filter the server's wheel list
 *     in the browser; over-budget wheels are dimmed with "$X over", never hidden.
 *     "Not sure? Start with our picks" (the server's Good/Better/Best) is a
 *     secondary shortcut.
 *  2. "Now pick tires for these wheels" appears once a wheel is picked:
 *     "What matters most?" (data-backed sorts only), "Your budget leaves about
 *     $X for 4 tires", and a "Your set" card with the wheel and tire side by side.
 *  3. A live package summary (sticky; a bottom bar + sheet on phones), Undo log,
 *     Why? toggles, "Fit my budget", and ONE request form (day + time chips,
 *     name, mobile, email, recap, Send request).
 *
 *  - Price, included items and the change log recompute in the browser from the
 *    vehicle bundle (PTPackagePrice, a mirror of the app's priceQuote());
 *    POST /api/package/price is the authority and is re-checked before every
 *    request (409 if it moved). Card prices are the SERVER's (fromTotalCents,
 *    preset quotes) plus the exact pricer delta of the customer's options.
 *  - "See it on my car" calls the app's /api/configurator/render ON CLICK ONLY
 *    (never on load, never per card), caches per vehicle + wheel image in the
 *    page, and falls back to the wheel photo + "Preview unavailable".
 *  - Nothing is removed silently: every automatic change goes to the change log
 *    with Undo and is announced in the role=status region.
 *  - Copy rules: "Request" / "Send request" / "Request sent — we'll confirm".
 *    No alignment, no used tires, no towns outside Calgary. TPMS has exactly two
 *    choices on direct-sensor vehicles (new sensors, or no sensors).
 *  - When the app says the builder is off, the catalogue is not ready, or the
 *    vehicle is outside v1, the quote form shows instead (mode: "quote").
 *
 * Vanilla ES5-style IIFE, no framework. Exposes window.PTPackageBuilder and
 * window.PTPackagePrice (the pricer is pure so tests/package-builder-pricer.test.js
 * can run it in node).
 */
(function (root) {
  "use strict";

  // ══════════════════════════════════════════════════════════════════════
  // PTPackagePrice: client mirror of priceQuote() (spec §3.6). Pure.
  // ══════════════════════════════════════════════════════════════════════
  var GST_RATE_BPS = 500;

  function gstCents(subtotalCents) {
    return Math.round((Math.max(0, Math.round(subtotalCents)) * GST_RATE_BPS) / 10000);
  }

  // The server picks the valve per TIRE (load range, OE pressure); until it has
  // said which, the label stays neutral rather than guessing rubber.
  function valveLabel(kind) {
    if (kind === "metal") return "High-pressure metal valve stems";
    if (kind === "rubber") return "Rubber valve stems";
    return "Valve stems matched to your tires";
  }

  // Install by tire size class (owner 2026-10-23), mirror of the app's
  // install-band.ts. The server sends each tire's own class (installClass) and
  // whether its price already carries the levy (levyIncluded); the size
  // fallback below only runs for a tire card that predates those fields.
  var MM_PER_IN = 25.4;
  function odInFromSize(size) {
    var k = String(size || "").toUpperCase().replace(/\s+/g, "");
    var m = /^(?:P|LT)?(\d{3})\/(\d{2})Z?R(\d{2}(?:\.\d)?)/.exec(k);
    if (m) return Math.round(((2 * +m[1] * +m[2]) / 100 / MM_PER_IN + parseFloat(m[3])) * 100) / 100;
    m = /^(?:LT)?(\d{2}(?:\.\d{1,2})?)X\d/.exec(k);
    return m ? parseFloat(m[1]) : null;
  }
  function tireClassOf(bands, t) {
    if (t.installClass !== undefined) return t.installClass;
    var size = t.size || String(t.title || "").split(/\s+/)[0];
    // Server: the 33"/35" bands are for LT tires; P-metric only with sizeBandsForPMetric.
    var lt = /^LT|^\d{2}(\.\d+)?X|LT$/i.test(String(size || "").replace(/\s+/g, "")) || /\b\d{2,3}\/\d{2,3}[A-Z]\b/.test(String(t.title || ""));
    if (lt || bands.sizeBandsForPMetric) {
      var od = odInFromSize(size);
      if (od != null && od >= bands.class35MinOdIn) return "class35";
      if (od != null && od >= bands.class33MinOdIn) return "class33";
    }
    return lt ? "lt" : null;
  }
  // The vehicle type the install band is priced with: never lower than the trim
  // data (server: profile.installBandVehicleType). An SUV by our data that the
  // customer called a car still pays the truck & SUV band.
  function bandVehicleType(bands, chosen, suggested) {
    var st = (bands && bands.suvTruckVehicleTypes) || [];
    return suggested && st.indexOf(suggested) !== -1 && st.indexOf(chosen) === -1 ? suggested : chosen;
  }
  function installBandOf(bands, t, vt) {
    var c = tireClassOf(bands, t || {});
    if (c) return c;
    return (bands.suvTruckVehicleTypes || []).indexOf(vt) !== -1 ? "suv_truck" : "car";
  }
  var BAND_LABEL = { car: "car tires", suv_truck: "truck & SUV tires", lt: "LT tires", class33: "33-inch class tires", class35: "35- and 37-inch class tires" };
  var LEVY_INCLUDED_LABEL = "Alberta tire recycling levy — included in tire price";

  function seatLabel(seat) {
    return { cone60: "cone", ball: "ball", flat: "flat", mag: "mag" }[seat] || "matching";
  }

  /**
   * pricing: the /vehicle bundle's `pricing` block.
   * sel: { shop, vehicleType, model?, wheel, tire, tpms: "new"|"none"|"not_needed",
   *        options: { roadForce, roadHazard } }
   *   wheel: { title, priceCents, mapCents?, acc: { kit, rings, valve, valveWhy } }
   *   tire:  { title, priceCents }
   * Returns { lines, subtotalCents, gstCents, totalCents, perTireInstalledCents, dropped[] }.
   */
  function compute(pricing, sel) {
    pricing = pricing || {};
    sel = sel || {};
    var lines = [];
    var dropped = [];
    var inc = pricing.included || {};
    var w = sel.wheel || {};
    var t = sel.tire || {};
    var acc = w.acc || {};
    var opts = sel.options || {};
    var model = sel.model || "vehicle";
    var vt = sel.vehicleType || "passenger";

    function add(key, qty, unit, o) {
      o = o || {};
      unit = Math.round(unit || 0);
      lines.push({
        key: key, label: o.label || key, qty: qty, unitCents: unit, totalCents: qty * unit,
        included: !!o.included, why: o.why || null, removable: !!o.removable
      });
    }

    add("wheel", 4, Math.max(Math.round(w.priceCents || 0), Math.round(w.mapCents || 0)), { label: "Wheels", why: null });
    add("tire", 4, t.priceCents || 0, { label: "Tires" });

    if (sel.tpms === "new") {
      add("tpms", 4, pricing.tpmsUnitCents || 0, {
        label: "TPMS sensors, programmed and installed",
        // Only a CONFIRMED direct system is stated as fact; unknown is hedged.
        why: sel.tpmsType === "direct"
          ? "Your " + model + " checks tire pressure with a sensor inside each wheel. New wheels need their own sensors, so 4 are included and programmed to your vehicle."
          : "Most vehicles like your " + model + " have a pressure sensor in each wheel. We’ve included 4 new ones, programmed, and we’ll confirm at the shop.",
        removable: !sel.tpmsLocked
      });
    } else if (sel.tpms === "none") {
      add("tpms_none", 1, 0, {
        label: "No TPMS sensors (your choice)",
        why: "Your tire-pressure warning light will stay on. This is legal in Canada and we note your choice on the work order."
      });
    } else if (sel.tpmsType !== "none") {
      add("tpms_reset", 1, 0, {
        label: "TPMS reset, no sensors needed", included: true,
        why: "Your " + model + " checks pressure through the wheel-speed sensors, so no sensors go in the wheels. We reset the system."
      });
    }

    var bands = pricing.installBands || null;
    if (bands) {
      // The install band IS mount & balance: no separate line (server: same).
    } else if (inc.mountBalance) {
      add("mount_balance", 4, 0, { label: "Mount & balance", included: true,
        why: "Every package is mounted and balanced on our machines before it goes on your vehicle." });
    } else {
      // Server: pricing.mountBalanceByVehicle (per tire, by vehicle type) when the
      // owner turns "included" off; null/missing row = not priced (staff note).
      var mbv = pricing.mountBalanceByVehicle || {};
      var mb = mbv[vt] != null ? mbv[vt] : pricing.mountBalanceCents;
      if (mb != null) add("mount_balance", 4, mb, { label: "Mount & balance" });
    }

    if (sel.tpms !== "new" && inc.valveStems) {
      add("valve_stems", 4, 0, {
        label: valveLabel(acc.valve),
        included: true, why: acc.valveWhy || "Valve stems rated for your tires. Included."
      });
    }

    var kit = acc.kit;
    if (kit && kit.required && inc.lugKit) {
      add("lug_kit", 1, 0, {
        label: "Lug kit: " + (kit.count || 20) + " × " + (kit.thread || "") + " " + seatLabel(kit.seat) + "-seat nuts",
        included: true, why: kit.why || null
      });
    }

    if (acc.rings && inc.hubRings) {
      add("hub_rings", 1, 0, {
        label: "Hub rings " + acc.rings.fromMm + " → " + acc.rings.toMm + " mm (set of 4)",
        included: true, why: acc.rings.why || null
      });
    }

    if (bands) {
      var band = installBandOf(bands, t, bandVehicleType(bands, vt, sel.suggestedVehicleType));
      add("install", 1, (bands.cents || {})[band] || 0, {
        label: "Install — mount & balance, set of 4 (" + ((bands.labels || {})[band] || BAND_LABEL[band]) + ")",
        why: "One price for the set, by tire size: we mount and balance all 4, fit them to your vehicle and torque every wheel to spec."
      });
    } else {
      var ibv = pricing.installByVehicle || {};
      add("install", 1, ibv[vt] != null ? ibv[vt] : (ibv.passenger || 0), {
        label: "Package install",
        why: "We fit the package to your vehicle and torque every wheel to spec."
      });
    }

    var rf = pricing.roadForce || {};
    if (opts.roadForce) {
      if ((rf.shops || []).indexOf(sel.shop) !== -1) {
        add("road_force", 4, rf.unitCents || 0, { label: "Road force balancing", removable: true,
          why: "A roller presses on each tire like the road does, to find vibration a regular balance misses." });
      } else {
        dropped.push("road_force");
      }
    }

    var rh = pricing.roadHazard || {};
    var rhVendors = (rh.vendors || []).map(function (v) { return String(v).toLowerCase(); });
    if (opts.roadHazard && rh.offered && rhVendors.length && rhVendors.indexOf(String(t.brand || "").toLowerCase()) === -1) {
      dropped.push("road_hazard"); // the Protection Plan only covers the listed brands (server: allowedVendors)
    } else if (opts.roadHazard && rh.offered) {
      var unit = Math.round((Math.max(0, Math.round(t.priceCents || 0)) * (rh.percent || 0)) / 100);
      if (rh.minCents != null) unit = Math.max(unit, rh.minCents);
      if (rh.maxCents != null) unit = Math.min(unit, rh.maxCents);
      add("road_hazard", 4, unit, { label: "Road hazard protection", removable: true,
        why: "Covers a tire damaged by a pothole, nail or debris." });
    }

    // The levy is charged ONCE: a tire whose price already carries it shows $0.
    var levySlug = pricing.levySlug || "fee_environmental";
    (pricing.levy || []).forEach(function (lv) {
      if (t.levyIncluded && lv.slug === levySlug) {
        add("levy", 4, 0, { label: LEVY_INCLUDED_LABEL, included: true,
          why: "Alberta's $5 tire recycling levy is already in this tire's price, so we don't charge it again." });
        return;
      }
      add("levy", 4, lv.unitCents || 0, { label: lv.label || "Alberta tire recycling levy",
        why: "Alberta's tire recycling levy, charged on every new tire." });
    });

    var sub = 0;
    for (var i = 0; i < lines.length; i++) sub += lines[i].totalCents;
    var g = gstCents(sub);
    return {
      lines: lines, subtotalCents: sub, gstCents: g, totalCents: sub + g,
      perTireInstalledCents: Math.round((sub + g) / 4), dropped: dropped
    };
  }

  root.PTPackagePrice = { compute: compute, gstCents: gstCents, valveLabel: valveLabel, installBandOf: installBandOf, bandVehicleType: bandVehicleType, odInFromSize: odInFromSize };

  // Node (the pricer test) stops here: no DOM.
  if (typeof document === "undefined" || !root.document) return;


  // ══════════════════════════════════════════════════════════════════════
  // Small helpers
  // ══════════════════════════════════════════════════════════════════════
  var doc = root.document;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function money(c) {
    c = Math.round(c || 0);
    var neg = c < 0; c = Math.abs(c);
    var d = Math.floor(c / 100), r = c % 100;
    return (neg ? "−" : "") + "$" + commas(d) + "." + (r < 10 ? "0" : "") + r;
  }
  function moneyWhole(c) { return "$" + commas(Math.round((c || 0) / 100)); }
  function moneyPhrase(c) {
    c = Math.round(c || 0);
    var d = Math.floor(c / 100), r = c % 100;
    return commas(d) + " dollars" + (r ? " and " + r + " cents" : "");
  }
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function localISO(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function timeToMins(s) {
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s || "").trim());
    if (!m) return null;
    var h = +m[1] % 12; if (m[3].toUpperCase() === "PM") h += 12;
    return h * 60 + +m[2];
  }
  function minsToTime(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    var hr = h % 12 === 0 ? 12 : h % 12;
    return hr + ":" + pad2(m) + " " + (h >= 12 ? "PM" : "AM");
  }
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayLabel(d) { return DOW[d.getDay()] + " " + MON[d.getMonth()] + " " + d.getDate(); }
  var DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function readyKey(r) { return r ? r.dateISO + " " + pad2(Math.floor((timeToMins(r.time) || 0) / 60)) + pad2((timeToMins(r.time) || 0) % 60) : ""; }
  function laterReady(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return readyKey(a) >= readyKey(b) ? a : b;
  }
  function readyText(r) {
    if (!r) return "Today, with 2 hours' notice";
    if (r.label) return r.label;
    var d = parseISO(r.dateISO);
    return d ? dayLabel(d) + (r.time ? ", " + r.time : "") : "";
  }
  function readyDay(r) { return readyText(r).replace(/, \d{1,2}:\d{2} [AP]M$/, "").replace(/, with 2 hours' notice$/, ""); }
  function readJSON(id) {
    try { var el = doc.getElementById(id); return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; }
  }
  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function track(event, data) {
    try {
      root.dataLayer = root.dataLayer || [];
      var o = { event: event };
      for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) o[k] = data[k];
      root.dataLayer.push(o);
    } catch (e) { /* analytics must never break the page */ }
  }
  function newRequestId() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    return "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }
  function nowMs() { try { return Math.round(root.performance.now()); } catch (e) { return 0; } }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function reducedMotion() { try { return root.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function smoothTo(el, block) { if (el) { try { el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: block || "start" }); } catch (e) { el.scrollIntoView(); } } }
  function focusQuiet(el) { if (!el) return; try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  function visible(el) { return el && el.offsetParent !== null ? el : null; }

  var ICON = {
    ok: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    warn: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    no: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m6 6 12 12" stroke="currentColor" stroke-width="2.2"/></svg>',
    clock: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    phone: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    shop: '<svg class="ptpb__i" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6.5L3.2 2h9.6L14 6.5M2.8 7v7h10.4V7M6.5 14v-4h3v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    snow: '<svg class="ptpb__i" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 14.5L6 5.5l2.6 4.2L10.4 7l4.6 7.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M11.5 1v4.4M9.6 2.1l3.8 2.2M13.4 2.1L9.6 4.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    wheel: '<svg class="ptpb__i" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="4 2.6"/><circle cx="20" cy="20" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    car: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15v-3l2-5h14l2 5v3h-2M7 15h10M3 15h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7" cy="16" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="16" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    garage: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    vin: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    pin: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    // "What's this set for?" tile icons (palette colours via currentColor; never light blue).
    flake: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5M3.6 10.4l3.4.9-.9 3.4M20.4 13.6l-3.4-.9.9-3.4M6.1 9.3l.9 3.4-3.4.9M17.9 14.7l-.9-3.4 3.4-.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    road: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 4 21M15 3l5 18M12 4v2.5M12 10v3M12 16.5V20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    spark: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3l1.6 4.9L16.5 9.5l-4.9 1.6L10 16l-1.6-4.9L3.5 9.5l4.9-1.6zM18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    truck: '<svg class="ptpb__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 16v-4l2-4h7v4h9l2 2v2h-2M2 16h2M9 16h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="16.5" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="16.5" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
  };

  // ══════════════════════════════════════════════════════════════════════
  // Constants (copy)
  // ══════════════════════════════════════════════════════════════════════
  var VEHICLE_TYPES = [
    ["passenger", "Car"], ["suv", "SUV or crossover"], ["van", "Van or minivan"],
    ["truck", "Pickup truck"], ["largetruck", "Heavy-duty pickup"], ["electric", "Electric vehicle"], ["dually", "Dually"]
  ];
  var TRUCKISH = ["truck", "largetruck"];
  // The vehicle card's tap tiles: a shortlist in a popular-in-Calgary order.
  // Anything not listed (or not in that year's file) stays one tap away in the
  // "All N ›" select, so every vehicle is reachable. Names are matched to the
  // year file case-insensitively; missing ones are skipped and the rest of the
  // list fills the tiles. TODO(owner): make this list admin-editable (app
  // setting → section setting) instead of a constant here.
  var VEHICLE_SHORTLIST = {
    makes: ["Ford", "Toyota", "Chevrolet", "RAM", "Honda", "GMC", "Hyundai", "Jeep", "Nissan", "Kia", "Mazda", "Subaru", "Dodge", "Volkswagen", "Tesla", "Lexus"],
    models: {
      Toyota: ["RAV4", "Corolla", "Camry", "Highlander", "Tacoma", "4Runner", "Sienna", "Tundra"],
      Ford: ["F-150", "Escape", "Explorer", "Edge", "Bronco Sport", "Ranger", "F-250 Super Duty", "Expedition"],
      Chevrolet: ["Silverado 1500", "Equinox", "Malibu", "Traverse", "Tahoe", "Colorado", "Silverado 2500 HD", "Trax"],
      RAM: ["1500", "1500 Classic", "2500", "3500", "ProMaster 2500"],
      Honda: ["CR-V", "Civic", "Pilot", "Accord", "HR-V", "Odyssey", "Ridgeline", "Passport"],
      GMC: ["Sierra 1500", "Terrain", "Acadia", "Yukon", "Sierra 2500 HD", "Canyon", "Yukon XL", "Savana 2500"],
      Hyundai: ["Tucson", "Santa Fe", "Elantra", "Kona", "Palisade", "Sonata", "Ioniq 5", "Venue"],
      Jeep: ["Grand Cherokee", "Wrangler", "Cherokee", "Compass", "Gladiator", "Renegade", "Grand Cherokee L", "Wagoneer"],
      Nissan: ["Rogue", "Pathfinder", "Frontier", "Murano", "Sentra", "Altima", "Kicks", "Titan"],
      Kia: ["Sportage", "Sorento", "Telluride", "Seltos", "Forte", "Soul", "Carnival", "Niro"],
      Mazda: ["CX-5", "CX-30", "3", "CX-9", "CX-50", "CX-90", "MX-5 Miata"],
      Subaru: ["Forester", "Outback", "Crosstrek", "Ascent", "Impreza", "WRX", "Legacy"],
      Tesla: ["Model Y", "Model 3", "Model S", "Model X"]
    },
    tiles: 8
  };
  var VFIELDS = [
    { k: "y", id: "ptpb-year", label: "Year", noun: "years", next: "Pick your year" },
    { k: "mk", id: "ptpb-make", label: "Make", noun: "makes", next: "Tap your make" },
    { k: "md", id: "ptpb-model", label: "Model", noun: "models", next: "Tap your model" },
    { k: "tr", id: "ptpb-trim", label: "Trim", noun: "trims", next: "Tap your trim" }
  ];
  var SHEET_MQ = "(max-width: 1023px)"; // the summary is a bottom sheet below this width (CSS: same breakpoint)
  // "What's this set for?" — each answer is a server package_type.
  var PACKAGE_TYPES = [
    { id: "winter", chip: "Winter", sub: "Snow-rated tires", noun: "winter", icon: "flake" },
    { id: "all_season", chip: "Everyday", sub: "All-season, quiet ride", noun: "all-season", icon: "road" },
    { id: "look", chip: "New look", sub: "Bigger wheels, style first", noun: "three-season", icon: "spark" },
    { id: "truck", chip: "Truck & trail", sub: "Tough, all-terrain tires", noun: "truck", truckOnly: true, icon: "truck" }
  ];
  var PRESET_NAMES = {
    winter: { good: "Budget winter", better: "Most popular winter", best: "Best ice grip" },
    all_season: { good: "Value all-season", better: "Keep my factory look", best: "Premium all-season" },
    look: { good: "Value upgrade", better: "Most popular upgrade", best: "Premium upgrade" },
    truck: { good: "Work-ready value", better: "Most popular work-ready", best: "Best traction" }
  };
  // "What look do you like?" — derived from the wheel's finish text only.
  var LOOKS = [
    { id: "any", label: "Any", short: "Any" },
    { id: "black", label: "Black", short: "Black" },
    { id: "machined", label: "Machined & two-tone", short: "Machined" },
    { id: "bronze", label: "Bronze", short: "Bronze" },
    { id: "silver", label: "Silver & chrome", short: "Silver" },
    { id: "steel", label: "Steel", short: "Steel" }
  ];
  var LOOK_WORD = { black: "Black", machined: "Machined / two-tone", bronze: "Bronze", silver: "Silver", steel: "Steel" };
  var WSIZES = ["any", "oe", "plus1", "max", "minus"];
  // "What matters most?" — sorts on data we actually hold (tier, price, brand tier, ready date).
  var PRIOS = [
    { id: "pick", label: "Our pick", sub: "our recommended tier first" },
    { id: "price", label: "Lowest price", sub: "cheapest first" },
    { id: "premium", label: "Premium brands", sub: "top brands first" },
    { id: "soon", label: "Ready soonest", sub: "earliest install first" }
  ];
  var TIER_PICK = { mid: 0, value: 1, premium: 2 };
  var BRAND_RANK = { premium: 0, mid: 1, value: 2 };
  var TIER_WORD = { value: "Good", mid: "Better", premium: "Best" };
  var SEASON_LABEL = { "winter": "Winter", "all-weather": "All-weather", "all-season": "All-season", "all-terrain": "All-terrain", "summer": "Summer" };
  var REVIEW_LINE = "We'll confirm fit before your install. The price won't change.";
  var FIT_RANK = { fits: 0, fits_warn: 0, fit_check: 1 };

  function looksOf(w) {
    if (!w) return [];
    if (w.__looks) return w.__looks;
    var f = String(w.finish || "").toLowerCase(), out = [];
    if (/steel/.test(f) || w.material === "steel") out.push("steel");
    if (/bronze/.test(f)) out.push("bronze");
    if (/polish|silver|chrome/.test(f) && !/black/.test(f)) out.push("silver");
    if (/machin|milled|face|gunmetal|tint|clear coat|\+/.test(f)) out.push("machined");
    if (/black/.test(f)) out.push("black");
    w.__looks = out;
    return out;
  }
  function tireName(t) {
    return [t.brand, t.model].filter(function (x) { return x && x !== "null"; }).join(" ") || t.title || "";
  }
  // The app's wheel cards carry no model, only the catalogue title
  // ("Armed Street Outlaw 17x8 5x114.3/5x127 ET+20 Gloss Black"): cut it at
  // the size so names read "Armed Street Outlaw" (finish and specs show apart).
  function wheelName(w) {
    if (!w) return "";
    if (w.model) return w.model;
    var t = String(w.title || ""), cut = t.search(/\s\d{2}(?:\.\d)?\s*x\s*\d/i);
    return (cut > 0 ? t.slice(0, cut) : t).trim();
  }
  // Clean display names for the big condensed type: the app's displayName when
  // it sends one, else the catalogue model without the brand repeated, stock
  // codes, "3PMS" (shown as a badge) or stud counts. Logs, alt text and the
  // request keep the full names (tireName / wheelName).
  function tidy(x) {
    return String(x || "").replace(/\([^)]*\)/g, " ").replace(/\b\d{6,}\b/g, " ").replace(/\b3PMSF?\b/gi, " ")
      .replace(/\b\d+\s*studs?\b/gi, " ").replace(/\s*[-–]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  }
  function wheelShow(w) {
    if (!w) return "";
    if (w.displayName) return w.displayName;
    var m = wheelName(w), b = String(w.brand || "");
    if (b && m.toLowerCase().indexOf(b.toLowerCase() + " ") === 0 && m.length > b.length + 1) m = m.slice(b.length + 1);
    return tidy(m) || wheelName(w);
  }
  function tireShow(t) {
    if (!t) return "";
    if (t.displayName) return t.displayName;
    var m = tidy(t.model);
    if (m) return m;
    // No model: the title without its size, load/speed and XL.
    return tidy(String(t.title || "").replace(/^\s*(?:P|LT)?\d{2,3}\/\d{2}Z?R\d{2}(?:\.\d)?\s*/i, "").replace(/\s+\d{2,3}(?:\/\d{2,3})?[A-Z]{1,2}(?:\s+XL)?\s*$/, "")) || tireName(t);
  }
  // Small tread pictures by tire type (Concept B graft), so types read before words.
  var TREAD = {
    "winter": '<path d="M3 3h6v5H3zM12 3h7v5h-7zM6 10h6v5H6zM15 10h6v5h-6zM3 17h6v5H3zM12 17h7v5h-7zM5 4.5v2M15 4.5v2M8 11.5v2M18 11.5v2M5 18.5v2M15 18.5v2" fill="currentColor" stroke="#fff" stroke-width=".8"/>',
    "all-weather": '<path d="M2 4l5 4 5-4 5 4 5-4M2 10l5 4 5-4 5 4 5-4M2 16l5 4 5-4 5 4 5-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
    "all-season": '<path d="M4 2v20M9.5 2v20M14.5 2v20M20 2v20" fill="none" stroke="currentColor" stroke-width="3"/><path d="M4 7h5.5M14.5 12H20M4 17h5.5" stroke="currentColor" stroke-width="1.4"/>',
    "summer": '<path d="M5 2v20M12 2v20M19 2v20" fill="none" stroke="currentColor" stroke-width="4.2"/>',
    "all-terrain": '<path d="M2 3h8v6H2zM14 3h8v6h-8zM6 12h7v5H6zM2 19h6v3H2zM16 13h6v9h-6z" fill="currentColor"/>'
  };
  function treadIcon(season) {
    var k = TREAD[season] ? season : (season === "summer" ? "summer" : null);
    if (!k) return "";
    return '<svg class="ptpb__tread ptpb__tread--' + k + '" viewBox="0 0 24 24" aria-hidden="true">' + TREAD[k] + "</svg>";
  }
  // Shopify CDN photos at the size they are shown (2-up grid ≈ 180 css px).
  function imgW(u, px) {
    u = String(u || "");
    if (!/cdn\.shopify\.com|\/cdn\/shop\//.test(u) || /[?&]width=/.test(u)) return u;
    return u + (u.indexOf("?") === -1 ? "?" : "&") + "width=" + px;
  }
  function seasonWord(s) { return SEASON_LABEL[s] || (s ? String(s).replace("-", " ") : ""); }

  // ══════════════════════════════════════════════════════════════════════
  // Builder
  // ══════════════════════════════════════════════════════════════════════
  function Builder(rootEl) {
    this.root = rootEl;
    this.app = $("[data-ptpb-app]", rootEl);
    this.liveEl = $("[data-ptpb-live]", rootEl);
    this.cfg = readJSON("ptpb-config") || {};
    this.hours = readJSON("pt-pkg-hours") || {};
    this.apiBase = String(this.cfg.apiBase || "https://app.princetires.ca").replace(/\/+$/, "");
    this.shops = this.cfg.shops || {
      sw: { slug: "sw", name: "42 Ave SW", phone: "(403) 452-4283", phoneHref: "+14034524283", address: "111 42 Ave SW, Calgary, AB T2G 0A4" },
      ne: { slug: "ne", name: "Edmonton Trail NE", phone: "(825) 395-4024", phoneHref: "+18253954024", address: "Unit 101, 3928 Edmonton Trail NE, Calgary, AB T2E 3P6" }
    };
    this.ctrl = {};          // AbortControllers per channel
    this.seq = {};           // response sequence per channel
    this.yearCache = {};
    this.tiresCache = {};
    this.vizCache = {};      // "year|make|model|rim" → { state: loading|ok|none|busy|error, img, at }
    this.log = [];
    this.lane = "pick";
    this.D = { bundle: null, wheels: null, serverQuote: null, serverKey: "", priceState: "idle", unavailable: null, priceNote: "" };
    this.req = { date: null, time: null, sending: false, error: "", done: null, conflict: null };
    this.whyOpen = {};
    this.myTire = null;      // the tire the CUSTOMER chose (re-solved from on a wheel change)
    this.keepTire = null;    // "Keep my tire, pick a different wheel"
    // Progressive disclosure (owner 2026-10-27): once a wheel is picked, the
    // answers and the wheel list fold into one "Your wheel" row so the tires sit
    // right under it. "Change wheel" / "Edit answers" set this to true. A link
    // that restores a wheel opens folded (this starts false). Never in the URL.
    this.expanded = false;
    // The "What do you drive?" card: open until the vehicle is complete, then a
    // vehicle chip + size chip + "Change". vTab = the field whose tiles show
    // (null: the first one still missing).
    this.vOpen = false;
    this.vTab = null;
    this.S = this.readUrl();
    this.preview = this.S._preview || this.cfg.previewToken || "";
    this.init();
  }

  var P = Builder.prototype;

  // ── URL state (§7.4.8 + the guided answers) ─────────────────────────────
  // lk = look, ws = wheel size, bg = budget (whole dollars), pr = "What matters
  // most?", ta = 1 when the tire on screen was OUR automatic choice.
  var URL_KEYS = ["y", "mk", "md", "tr", "vt", "lift", "li", "pt", "s", "w", "t", "sz", "tp", "rf", "rh", "brand", "lk", "ws", "bg", "pr", "ta"];

  P.readUrl = function () {
    var q;
    try { q = new URLSearchParams(root.location.search); } catch (e) { q = { get: function () { return null; } }; }
    var S = {};
    URL_KEYS.forEach(function (k) { var v = q.get(k); if (v != null && v !== "") S[k] = v; });
    S.rf = S.rf === "1"; S.rh = S.rh === "1"; S.ta = S.ta === "1";
    if (S.s !== "sw" && S.s !== "ne") S.s = (q.get("location") === "ne" ? "ne" : null);
    if (["new", "none", "not_needed"].indexOf(S.tp) === -1) delete S.tp;
    if (!LOOKS.some(function (l) { return l.id === S.lk; })) S.lk = "any";
    if (WSIZES.indexOf(S.ws) === -1) S.ws = "any";
    if (!PRIOS.some(function (p) { return p.id === S.pr; })) S.pr = "pick";
    S.bg = /^\d{2,6}$/.test(S.bg || "") ? +S.bg : null;
    var wheel = q.get("wheel");
    if (wheel && /^\d+$/.test(wheel)) S._focus = "shopify:" + wheel;
    S._preview = q.get("preview") || "";
    // Old /pages/wheel-quote links: ?brand=&model=&style=&sizes= (wheel model, not vehicle).
    S._hints = {};
    ["brand", "model", "style"].forEach(function (k) { var v = q.get(k); if (v) S._hints[k] = v.slice(0, 80); });
    var sizes = q.get("sizes"); if (sizes) S._hintSizes = sizes.slice(0, 80);
    // The hero CTA passes the vehicle the customer just searched.
    if (!S.y && q.get("year")) S.y = q.get("year");
    return S;
  };

  P.writeUrl = function () {
    var S = this.S;
    var q;
    try { q = new URLSearchParams(root.location.search); } catch (e) { return; }
    URL_KEYS.forEach(function (k) { q.delete(k); });
    ["wheel", "year", "location"].forEach(function (k) { q.delete(k); });
    URL_KEYS.forEach(function (k) {
      var v = S[k];
      if (k === "rf" || k === "rh" || k === "ta") { if (v) q.set(k, "1"); return; }
      if ((k === "lk" || k === "ws") && v === "any") return;
      if (k === "pr" && v === "pick") return;
      if (v != null && v !== "" && v !== false) q.set(k, String(v));
    });
    var qs = q.toString();
    try { root.history.replaceState(root.history.state, "", root.location.pathname + (qs ? "?" + qs : "") + root.location.hash); } catch (e) { /* sandboxed */ }
    if (S.y && S.mk && S.md) lsSet("pt-pkg-last", qs);
  };

  // ── API ──────────────────────────────────────────────────────────────
  // Resolves { ok, status, data, network, aborted, stale }. Never rejects.
  P.api = function (path, o) {
    o = o || {};
    var self = this;
    var channel = o.channel || path;
    var params = o.params || {};
    if (this.preview) params.preview = this.preview;
    var qs = Object.keys(params).filter(function (k) {
      return params[k] !== undefined && params[k] !== null && params[k] !== "";
    }).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); }).join("&");
    var url = this.apiBase + "/api/package/" + path + (qs ? "?" + qs : "");
    if (this.ctrl[channel] && !o.keep) { try { this.ctrl[channel].abort(); } catch (e) {} }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    this.ctrl[channel] = ctrl;
    var mySeq = (this.seq[channel] = (this.seq[channel] || 0) + 1);
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, o.timeout || 15000);
    var init = { method: o.method || "GET", headers: {}, signal: ctrl ? ctrl.signal : undefined };
    if (o.body) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(o.body); }
    return root.fetch(url, init).then(function (r) {
      return r.json().then(function (j) { return j; }, function () { return null; }).then(function (data) {
        clearTimeout(timer);
        return { ok: r.ok, status: r.status, data: data, stale: mySeq !== self.seq[channel] };
      });
    }, function (err) {
      clearTimeout(timer);
      var aborted = err && err.name === "AbortError";
      return { ok: false, status: 0, data: null, network: true, aborted: aborted && mySeq !== self.seq[channel], stale: mySeq !== self.seq[channel] };
    });
  };

  // ── announce (role=status, debounced 500 ms, never assertive) ─────────
  // lead = true: this message stays at the front of whatever is queued inside
  // the debounce ("Wheel picked: … Showing tires that fit." + the new total).
  // kind: "log" (an automatic change, e.g. "Tires changed to …": every distinct
  // one is read), "total" (the package total: only the latest), or none (any
  // other message: only the latest). Read as lead + queued, in order.
  P.announce = function (text, lead, kind) {
    var self = this;
    if (lead) this._annLead = text;
    else {
      var key = kind === "log" ? "log:" + text : (kind || "msg");
      this._annQ = (this._annQ || []).filter(function (x) { return x.k !== key; });
      this._annQ.push({ k: key, text: text });
    }
    clearTimeout(this._annT);
    this._annT = setTimeout(function () {
      var out = (self._annLead ? [self._annLead] : []).concat((self._annQ || []).map(function (x) { return x.text; })).join(" ");
      self._annLead = null; self._annQ = [];
      if (!self.liveEl || !out) return;
      self.liveEl.textContent = "";
      setTimeout(function () { self.liveEl.textContent = out; }, 30);
    }, 500);
  };

  // Re-render a region without losing keyboard focus (WCAG 3.2.2): remember
  // the focused element's id and put focus back on the new node.
  P.paint = function (el, html) {
    if (!el) return;
    if (el.__ptpbHtml === html) return;   // nothing changed: keep the DOM (no image flicker)
    el.__ptpbHtml = html;
    var a = doc.activeElement;
    var id = a && el.contains(a) ? a.id : null;
    var act = !id && a && el.contains(a) && a.getAttribute ? a.getAttribute("data-act") : null;
    var actId = act ? a.getAttribute("data-id") || a.getAttribute("data-key") || "" : "";
    el.innerHTML = html;
    var n = id ? doc.getElementById(id) : null;
    if (!n && act) n = $('[data-act="' + act + '"]' + (actId ? '[data-id="' + actId + '"],[data-act="' + act + '"][data-key="' + actId + '"]' : ""), el);
    if (n && (id || act)) focusQuiet(n);
  };

  // ══════════════════════════════════════════════════════════════════════
  // Init + shell
  // ══════════════════════════════════════════════════════════════════════
  P.init = function () {
    var self = this;
    var S = this.S;
    if (!S.s) {
      var core = root.PTBookingCore;
      var pick = null;
      try { if (core) pick = core.pickLocation(core.loadLocations().bookable, null); } catch (e) {}
      S.s = pick && (pick.slug === "ne" || pick.slug === "sw") ? pick.slug : "sw";
    }
    if (!S.pt) {
      var m = new Date().getMonth();
      S.pt = (m >= 8 || m <= 2) ? "winter" : "all_season";
      S._ptDefault = true;
    }
    this.renderShell();
    this.bindEvents();
    this.watchBottomBar();
    track("pkg_view", { entry: S._focus ? "wheel" : (S.brand ? "brand" : (S.y ? "vehicle" : "direct")) });

    if (this.cfg.entryMode === "quote_only") {
      this.prefillVehicle().then(function () { self.setLane("quote", { reasons: [] }); });
      return;
    }
    this.prefillVehicle().then(function () {
      self.fillYears().then(function () {
        if (self.vehicleComplete()) self.loadBundle();
        else { self.setLane("pick"); self.probe(); }
      });
    });
  };

  // Before a vehicle is picked: is the builder on at all? While it is off (or
  // the catalogue isn't ready) the page goes straight to the quote form, so
  // /pages/wheel-quote never loses its form. A failed probe changes nothing.
  P.probe = function () {
    var self = this;
    this.api("vehicle", { params: { probe: "1" }, channel: "probe", timeout: 8000 }).then(function (r) {
      if (!r.ok || !r.data || r.data.available !== false) return;
      if (self.lane === "pick") self.setLane("quote", { reason: r.data.reason });
    });
  };

  P.renderShell = function () {
    var S = this.S;
    // "Install at" as two shop cards (name + address); "Road force here" is
    // filled in from the bundle (pricing.roadForce.shops) once it is known.
    var shopCards = ["sw", "ne"].map(function (slug) {
      var sh = this.shops[slug] || {};
      return '<label class="ptpb__shop"><input type="radio" name="ptpb-shop" id="ptpb-shop-' + slug + '" value="' + slug + '"' +
        (S.s === slug ? " checked" : "") + '><span class="ptpb__shop-ck" aria-hidden="true">' + ICON.ok + "</span>" +
        '<b class="ptpb__shop-n">' + esc(sh.name || slug) + "</b>" +
        '<small class="ptpb__shop-a">' + esc(String(sh.address || "").replace(/,\s*Calgary.*$/i, "")) + "</small>" +
        '<span class="ptpb__shop-rf" data-ptpb-rf="' + slug + '" hidden>Road force here</span></label>';
    }, this).join("");
    // The four vehicle fields: a tab each inside the card, one panel each with
    // tap tiles + the native "All N ›" select (the fallback that reaches every
    // vehicle; it is never repainted, so focus and the chosen value stay put).
    var panels = VFIELDS.map(function (f) {
      return '<div class="ptpb__vpanel" data-ptpb-vpanel="' + f.k + '" role="group" aria-label="' + f.label + '" hidden>' +
        '<div class="ptpb__vtiles"><span class="ptpb__vtiles-in" data-ptpb-vtiles="' + f.k + '"></span>' +
          '<label class="ptpb__vall"><span class="ptpb__vh">All ' + f.noun + "</span>" +
          '<select id="' + f.id + '" data-v="' + f.k + '"' + (f.k === "y" ? "" : " disabled") + '><option value="">' + f.label + "</option></select></label>" +
        "</div></div>";
    }).join("");
    this.app.innerHTML =
      '<div class="ptpb__vbar"><div class="ptpb__wrap ptpb__vbar-in">' +
        '<div class="ptpb__garage" data-ptpb-garage role="group" aria-labelledby="ptpb-vq">' +
          '<span class="ptpb__garage-tread" aria-hidden="true"></span>' +
          '<div class="ptpb__garage-top"><h2 class="ptpb__garage-h" id="ptpb-vq">What do you drive?</h2></div>' +
          '<div class="ptpb__plate" data-ptpb-plate></div>' +
          '<div class="ptpb__vtabs" data-ptpb-vtabs></div>' +
          panels +
          '<p class="ptpb__trim-hint" data-ptpb-trimhint hidden></p>' +
          '<div class="ptpb__vquick" data-ptpb-vquick></div>' +
        "</div>" +
        '<div class="ptpb__vsum" data-ptpb-vsum hidden></div>' +
        '<div class="ptpb__vrow">' +
          '<div class="ptpb__field ptpb__shops-f"><span class="ptpb__lab" id="ptpb-shop-lab">Install at</span>' +
            '<div class="ptpb__shops" role="radiogroup" aria-labelledby="ptpb-shop-lab">' + shopCards + "</div></div>" +
          '<div class="ptpb__field" data-ptpb-vtfield hidden><label for="ptpb-vt">Vehicle type</label><select id="ptpb-vt"></select></div>' +
          '<div class="ptpb__vspec" data-ptpb-vspec></div>' +
        "</div>" +
        '<div class="ptpb__lift" data-ptpb-lift hidden></div>' +
      "</div></div>" +
      '<div class="ptpb__wrap" data-ptpb-lane></div>' +
      '<div class="ptpb__toast" data-ptpb-toast hidden></div>' +
      '<div class="ptpb__scrim" data-ptpb-scrim hidden></div>' +
      '<dialog class="ptpb__dlg" data-ptpb-dlg aria-labelledby="ptpb-dlg-title"><div class="ptpb__dlg-in" data-ptpb-dlgbody></div></dialog>' +
      '<dialog class="ptpb__dlg" data-ptpb-cardlg aria-labelledby="ptpb-car-title"><div class="ptpb__dlg-in" data-ptpb-carbody></div></dialog>';
    this.laneEl = $("[data-ptpb-lane]", this.app);
    this.toastEl = $("[data-ptpb-toast]", this.app);
    this.dlg = $("[data-ptpb-dlg]", this.app);
    this.dlgBody = $("[data-ptpb-dlgbody]", this.app);
    this.carDlg = $("[data-ptpb-cardlg]", this.app);
    this.carBody = $("[data-ptpb-carbody]", this.app);
    this.scrim = $("[data-ptpb-scrim]", this.app);
    // "Your next set, installed." — the word after the last comma takes the red accent.
    var h1 = $(".ptpb__title", this.root);
    var m = h1 ? /^(.*,)\s*([^,]+)$/.exec(h1.textContent.trim()) : null;
    if (m && !$("span", h1)) h1.innerHTML = esc(m[1]) + " <span>" + esc(m[2]) + "</span>";
  };

  // The site's phone tab bar (#pt-sticky-bar) is fixed to the bottom and its
  // red Book circle sticks up above it. Our summary pill sits above BOTH:
  // dock = the distance from the bottom of the screen to the bar's top (its
  // own safe-area padding included, so we never add the safe area twice) +
  // whatever pokes out above it (the circle). Re-measured whenever the bar
  // changes size, is shown or hidden, the window or visual viewport resizes,
  // the page comes back into view, or the builder changes lane.
  P.measureDock = function () {
    var bar = doc.getElementById("pt-sticky-bar"), dock = 0, vh = root.innerHeight || doc.documentElement.clientHeight;
    if (bar) {
      var cs = root.getComputedStyle(bar), r = bar.getBoundingClientRect();
      if (cs.display !== "none" && cs.visibility !== "hidden" && r.height > 0 && r.top < vh) {
        var top = r.top;
        $all("*", bar).forEach(function (el) {
          var er = el.getBoundingClientRect();
          if (er.height > 0 && er.top < top) top = er.top;
        });
        dock = Math.max(0, vh - top);
      }
    }
    var px = Math.round(dock) + "px";
    if (this._dock !== px) {
      this._dock = px;
      this.root.style.setProperty("--ptpb-dock", px);
      doc.documentElement.style.setProperty("--ptpb-dock", px);
      if (dock > 0) this.root.setAttribute("data-dock", ""); else this.root.removeAttribute("data-dock");
    }
    return dock;
  };
  P.watchBottomBar = function () {
    var self = this, raf = 0;
    var measure = function () {
      if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
      raf = root.requestAnimationFrame ? root.requestAnimationFrame(function () { raf = 0; self.measureDock(); }) : (self.measureDock(), 0);
    };
    this.measureDock();
    root.addEventListener("resize", measure);
    root.addEventListener("orientationchange", measure);
    root.addEventListener("pageshow", measure);
    doc.addEventListener("visibilitychange", measure);
    if (root.visualViewport) root.visualViewport.addEventListener("resize", measure);
    var watched = null, ro = null, mo = null;
    var watch = function () {
      var bar = doc.getElementById("pt-sticky-bar");
      if (!bar || bar === watched) return;
      watched = bar;
      if (root.ResizeObserver) { if (ro) ro.disconnect(); ro = new root.ResizeObserver(measure); ro.observe(bar); }
      if (root.MutationObserver) {
        if (mo) mo.disconnect();
        mo = new root.MutationObserver(measure);
        mo.observe(bar, { attributes: true, attributeFilter: ["class", "style", "hidden"], subtree: true });
      }
      measure();
    };
    watch();
    // A bar added after the builder (a late section render) is picked up too.
    if (root.MutationObserver && doc.body) new root.MutationObserver(function () { if (!watched || !doc.body.contains(watched)) { watched = null; watch(); } })
      .observe(doc.body, { childList: true });
    this._watchDock = function () { watch(); measure(); };
  };

  // ── Vehicle pickers ──────────────────────────────────────────────────
  P.prefillVehicle = function () {
    var S = this.S;
    var self = this;
    // A signed-in customer's saved vehicle feeds the card's "From your garage"
    // shortcut even when the page already has a vehicle (fetched in the background).
    var acct = this.cfg.loggedIn ? root.fetch("/apps/api/vehicles", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var v = d && Array.isArray(d.vehicles) ? (d.vehicles.filter(function (x) { return x.isDefault; })[0] || d.vehicles[0]) : null;
        if (v && v.year && v.make && v.model) self._acctVehicle = { y: String(v.year), mk: v.make, md: v.model, tr: v.trim || null };
        self.renderCard();
        return v;
      })
      .catch(function () { return null; }) : Promise.resolve(null);
    doc.addEventListener("garageReady", function () { self.renderCard(); });
    if (S.y && S.mk && S.md) return Promise.resolve();
    var g = root.__ptDefaultVehicle;
    if (g && g.year && g.make && g.model) {
      S.y = String(g.year); S.mk = g.make; S.md = g.model; if (g.trim) S.tr = g.trim;
      return Promise.resolve();
    }
    var last = lsGet("pt-pkg-last");
    if (last && !S.y) {
      try {
        var q = new URLSearchParams(last);
        ["y", "mk", "md", "tr", "vt"].forEach(function (k) { if (q.get(k)) S[k] = q.get(k); });
      } catch (e) {}
    }
    if (S.y || !this.cfg.loggedIn) return Promise.resolve();
    return acct.then(function () {
      var v = self._acctVehicle;
      if (v && !S.y) { S.y = v.y; S.mk = v.mk; S.md = v.md; if (v.tr) S.tr = v.tr; }
      self.writeUrl();
    });
  };

  P.loadYear = function (year) {
    var self = this;
    if (this.yearCache[year]) return Promise.resolve(this.yearCache[year]);
    var base = this.cfg.vehicleAssetBase || "";
    if (!base) return Promise.resolve(null);
    var M = root.PTVehicleManifest;
    var url = M && this._manifest ? M.yearUrl(base, year, this._manifest, "") : base + "pt-vehicle-" + year + ".json";
    return root.fetch(url).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { self.yearCache[year] = d; return d; })
      .catch(function () { return null; });
  };

  P.fillYears = function () {
    var self = this;
    var M = root.PTVehicleManifest;
    var p = M && this.cfg.manifestUrl ? M.ready(this.cfg.manifestUrl, 1500) : Promise.resolve(null);
    return p.then(function (man) {
      self._manifest = man;
      var years = man && M ? M.yearsDesc(man, 1990, 2027) : null;
      if (!years) { years = []; for (var y = 2027; y >= 1990; y--) years.push(y); }
      fillSelect($("#ptpb-year", self.app), years.map(String), "Year", self.S.y);
      return self.cascade(true);
    });
  };

  function fillSelect(sel, values, placeholder, value, labels) {
    if (!sel) return;
    // A vehicle field's select is the card's "All N ›" fallback.
    var f = VFIELDS.filter(function (x) { return x.id === sel.id && x.label === placeholder; })[0];
    if (f && values.length) placeholder = "All " + values.length + " ›";
    var h = '<option value="">' + esc(placeholder) + "</option>";
    values.forEach(function (v, i) {
      h += '<option value="' + esc(v) + '"' + (String(v) === String(value) ? " selected" : "") + ">" + esc(labels ? labels[i] : v) + "</option>";
    });
    sel.innerHTML = h;
    sel.disabled = values.length === 0;
  }

  // Rebuild make/model/trim selects from the year file, keeping S values when valid.
  P.cascade = function (initial) {
    var self = this, S = this.S;
    var mkSel = $("#ptpb-make", this.app), mdSel = $("#ptpb-model", this.app), trSel = $("#ptpb-trim", this.app);
    if (!S.y) {
      fillSelect(mkSel, [], "Make"); fillSelect(mdSel, [], "Model"); fillSelect(trSel, [], "Trim");
      return Promise.resolve();
    }
    return this.loadYear(S.y).then(function (data) {
      if (!data || !data.models) {
        fillSelect(mkSel, [], "Make"); fillSelect(mdSel, [], "Model"); fillSelect(trSel, [], "Trim");
        return;
      }
      var makes = (data.makes || Object.keys(data.models)).slice();
      var mk = matchCI(makes, S.mk);
      S.mk = mk;
      fillSelect(mkSel, makes, "Make", mk || "");
      var models = mk ? Object.keys(data.models[mk] || {}).sort() : [];
      var md = matchCI(models, S.md);
      S.md = md;
      fillSelect(mdSel, models, "Model", md || "");
      var trims = md ? Object.keys(data.models[mk][md] || {}) : [];
      var labels = trims.map(function (t) {
        var sizes = data.models[mk][md][t] || [];
        return sizes.length ? t + " · " + sizes[0] : t;
      });
      var tr = matchCI(trims, S.tr);
      // A shared link may carry a trim the server named (not in this file):
      // keep it visible rather than silently dropping it.
      if (!tr && initial && S.tr && md) { trims.push(S.tr); labels.push(S.tr); tr = S.tr; }
      if (!tr && trims.length === 1) tr = trims[0];
      if (!self._serverTrims) {
        S.tr = tr || null;
        fillSelect(trSel, trims, "Trim", tr || "", labels);
      }
      self.renderCard();
    });
  };

  function matchCI(list, v) {
    if (!v) return null;
    var lv = String(v).toLowerCase().replace(/\s+/g, " ").trim();
    for (var i = 0; i < list.length; i++) if (String(list[i]).toLowerCase() === lv) return list[i];
    return null;
  }

  P.vehicleComplete = function () { var S = this.S; return !!(S.y && S.mk && S.md && S.tr); };

  // ── "What do you drive?" card ─────────────────────────────────────────
  P.cardOpen = function () { return this.vOpen || !this.vehicleComplete() || !!(this._serverTrims && !this.S.tr); };
  P.curTab = function () {
    var S = this.S;
    if (this.vTab && (this.vTab === "y" || S[VFIELDS[VFIELDS.map(function (f) { return f.k; }).indexOf(this.vTab) - 1].k])) return this.vTab;
    for (var i = 0; i < VFIELDS.length; i++) if (!S[VFIELDS[i].k]) return VFIELDS[i].k;
    return "y";
  };
  function vfield(k) { return VFIELDS.filter(function (f) { return f.k === k; })[0]; }
  // The tiles for one field: its shortlist (in order) topped up from the
  // select's own list, at most VEHICLE_SHORTLIST.tiles. Read from the select,
  // so a tile can never offer what the "All N" list doesn't have.
  P.vehicleTiles = function (k) {
    var sel = doc.getElementById(vfield(k).id), S = this.S;
    if (!sel || sel.disabled) return [];
    var opts = $all("option", sel).filter(function (o) { return o.value; });
    var vals = opts.map(function (o) { return o.value; });
    var want = [];
    if (k === "mk") want = VEHICLE_SHORTLIST.makes;
    if (k === "md" && S.mk) {
      var mkKey = matchCI(Object.keys(VEHICLE_SHORTLIST.models), S.mk);
      want = mkKey ? VEHICLE_SHORTLIST.models[mkKey] : [];
    }
    var out = [];
    want.forEach(function (v) { var m = matchCI(vals, v); if (m && out.indexOf(m) === -1) out.push(m); });
    vals.forEach(function (v) { if (out.length < VEHICLE_SHORTLIST.tiles && out.indexOf(v) === -1) out.push(v); });
    out = out.slice(0, VEHICLE_SHORTLIST.tiles);
    return out.map(function (v) { var o = opts[vals.indexOf(v)]; return { v: v, text: o ? o.textContent : v }; });
  };
  // The factory tire for the chosen trim: the server's (with load + speed) once
  // the bundle is in, else the year file's first size.
  P.factorySize = function () {
    var b = this.D.bundle, S = this.S;
    var oe = b && b.spec && ((b.spec.oeSizes || []).filter(function (o) { return o.stock; })[0] || (b.spec.oeSizes || [])[0]);
    if (oe) return { size: oe.size, li: oe.loadIndex ? oe.loadIndex + (oe.speed || "") : "" };
    var d = this.yearCache[S.y];
    var sizes = d && d.models && S.mk && S.md && S.tr && d.models[S.mk] && d.models[S.mk][S.md] ? d.models[S.mk][S.md][S.tr] : null;
    return sizes && sizes.length ? { size: sizes[0], li: "" } : null;
  };
  P.garageVehicle = function () {
    var g = root.__ptDefaultVehicle;
    if (g && g.year && g.make && g.model) return { y: String(g.year), mk: g.make, md: g.model, tr: g.trim || null };
    return this._acctVehicle || null;
  };
  P.renderCard = function () {
    var S = this.S, self = this;
    var card = $("[data-ptpb-garage]", this.app), sum = $("[data-ptpb-vsum]", this.app);
    if (!card || !sum) return;
    var open = this.cardOpen(), tab = this.curTab();
    this.syncSelects();
    card.hidden = !open;
    sum.hidden = open;
    var fs = this.factorySize();
    if (!open) {
      var name = [S.y, S.md, S.tr].filter(Boolean).join(" ");
      this.paint(sum, '<span class="ptpb__vchip">' + '<i aria-hidden="true">' + ICON.car + "</i><span><span class=\"ptpb__vh\">Your vehicle: </span>" + esc(name) + "</span></span>" +
        (fs ? '<span class="ptpb__sidewall ptpb__sidewall--lg"><span class="ptpb__vh">Factory tire </span>' + esc(fs.size) + (fs.li ? " <em>" + esc(fs.li) + "</em>" : "") + "</span>" : "") +
        '<button type="button" class="ptpb__linkbtn ptpb__vchange" data-act="vchange" aria-expanded="false" aria-controls="ptpb-vq">Change<span class="ptpb__vh"> vehicle</span></button>');
      return;
    }
    // Licence plate: the vehicle spelled out as it is built; a blinking slot for the next part.
    var parts = [S.y, S.mk, S.md].filter(Boolean).map(function (x) { return esc(String(x).toUpperCase()); });
    var missing = !S.y || !S.mk || !S.md;
    var bot = missing ? vfield(tab === "tr" ? "md" : tab).next : (S.tr ? esc(S.tr.toUpperCase()) + (fs ? " · " + esc(fs.size) : "") : "Tap your trim");
    this.paint($("[data-ptpb-plate]", card), '<span class="ptpb__plate-top" aria-hidden="true">Prince Tires · Calgary</span>' +
      '<span class="ptpb__plate-num"><span class="ptpb__vh">Your vehicle so far: </span>' + parts.join(" ") + (missing ? '<i aria-hidden="true"></i>' : "") + "</span>" +
      '<span class="ptpb__plate-bot">' + bot + "</span>");
    this.paint($("[data-ptpb-vtabs]", card), VFIELDS.map(function (f, i) {
      var v = S[f.k], ok = i === 0 || !!S[VFIELDS[i - 1].k], on = f.k === tab;
      return '<button type="button" class="ptpb__vtab' + (on ? " is-on" : "") + (v ? " is-done" : "") + '" data-act="vtab" data-key="' + f.k + '" aria-pressed="' + on + '"' + (ok ? "" : " disabled") + ">" +
        "<small>" + f.label + "</small><span>" + (v ? ICON.ok + esc(v) : (on ? "Pick…" : "—")) + "</span></button>";
    }).join(""));
    VFIELDS.forEach(function (f) {
      var panel = $('[data-ptpb-vpanel="' + f.k + '"]', card);
      if (panel) panel.hidden = f.k !== tab;
      if (f.k !== tab) return;
      self.paint($('[data-ptpb-vtiles="' + f.k + '"]', card), self.vehicleTiles(f.k).map(function (t) {
        var on = String(S[f.k] || "") === t.v, pr = String(t.text).split(" · ");
        return '<button type="button" class="ptpb__vtile' + (on ? " is-on" : "") + (f.k === "tr" || f.k === "y" ? "" : " ptpb__vtile--disp") + '" data-act="vpick" data-key="' + f.k + '" data-id="' + esc(t.v) + '" aria-pressed="' + on + '">' +
          (f.k === "tr" && pr[1] ? "<b>" + esc(pr[0]) + '</b><small class="ptpb__mono">' + esc(pr[1]) + "</small>" : esc(t.v)) + "</button>";
      }).join(""));
    });
    // Shortcuts: the saved garage vehicle (only when one exists and isn't the
    // one on screen), a VIN lookup, and the way back when "Change" opened it.
    var gv = this.garageVehicle();
    var same = gv && String(gv.y) === String(S.y) && matchCI([S.mk || ""], gv.mk) && matchCI([S.md || ""], gv.md) && (!gv.tr || matchCI([S.tr || ""], gv.tr));
    var q = '<p class="ptpb__or"><span>or skip the typing</span></p><div class="ptpb__qrow">' +
      (gv && !same ? '<button type="button" class="ptpb__qbtn" data-act="vgarage">' + ICON.garage + "<span><b>" + esc([gv.y, gv.md, gv.tr].filter(Boolean).join(" ")) + "</b><small>From your garage</small></span></button>" : "") +
      '<button type="button" class="ptpb__qbtn" data-act="vinopen" aria-expanded="' + !!this.vinOpen + '" aria-controls="ptpb-vinform">' + ICON.vin + "<span><b>Use my VIN</b><small>17 characters</small></span></button></div>" +
      '<div class="ptpb__vinform" id="ptpb-vinform"' + (this.vinOpen ? "" : " hidden") + '><label for="ptpb-vvin">Your VIN <small>(on your registration, insurance card or driver’s door)</small></label>' +
        '<div class="ptpb__inline"><input id="ptpb-vvin" maxlength="17" autocomplete="off" spellcheck="false" autocapitalize="characters" value="' + esc(this.vinDraft || "") + '"' +
        (this.vinErr ? ' aria-invalid="true" aria-describedby="ptpb-vvin-err"' : "") + '><button type="button" class="ptpb__btn ptpb__btn--primary" data-act="vinlookup">' + (this.vinBusy ? "Looking up…" : "Look up") + "</button></div>" +
        (this.vinErr ? '<p class="ptpb__err" id="ptpb-vvin-err">' + esc(this.vinErr) + "</p>" : "") + "</div>" +
      (this.vehicleComplete() && this.vOpen ? '<button type="button" class="ptpb__btn ptpb__btn--onblack" data-act="vkeep">Keep my ' + esc([S.y, S.md, S.tr].join(" ")) + "</button>" : "");
    this.paint($("[data-ptpb-vquick]", card), q);
  };

  // The "All N ›" selects follow the vehicle however it was picked (tile, VIN,
  // garage), so the fallback, the plate and a screen reader all agree, and
  // choosing a value from the select always fires "change".
  P.syncSelects = function () {
    var S = this.S;
    VFIELDS.forEach(function (f) {
      var sel = doc.getElementById(f.id);
      if (!sel) return;
      var want = S[f.k] ? String(S[f.k]) : "";
      if (sel.value === want) return;
      var has = !want || $all("option", sel).some(function (o) { return o.value === want; });
      if (!has && f.k === "y") {
        var o = doc.createElement("option"); o.value = want; o.textContent = want;
        var after = $all("option", sel).filter(function (x) { return x.value && Number(x.value) < Number(want); })[0];
        sel.insertBefore(o, after || null);
        has = true;
      }
      if (has) sel.value = want;
    });
  };

  // One vehicle field chosen (a tile or the "All N" select).
  // opt.stay: a keyboard step through a closed select (Windows fires "change"
  // on every arrow key / type-ahead letter): update the vehicle, the plate and
  // the tabs but keep that select on screen and focused (WCAG 3.2.2); the next
  // field opens on Enter or when focus leaves the select (commitSelectStep).
  P.setVehicleField = function (k, v, opt) {
    var self = this, S = this.S;
    opt = opt || {};
    v = v || null;
    var idx = VFIELDS.map(function (f) { return f.k; }).indexOf(k);
    // The value already chosen (e.g. the highlighted tile after "Change"): a
    // confirmation, never a reset that would wipe the wheel, tire and undo log.
    if (v && v === S[k]) {
      if (opt.stay) return;
      if (k === "tr") { this.vTab = null; this.vOpen = false; } else this.vTab = VFIELDS[idx + 1].k;
      this.renderCard(); this.focusCard(); this.announceField();
      return;
    }
    var keepVin = k === "tr" ? S._vin : null;   // a trim picked after a VIN lookup is the same car
    if (k === "y") { S.y = v; S.mk = null; S.md = null; S.tr = null; }
    if (k === "mk") { S.mk = v; S.md = null; S.tr = null; }
    if (k === "md") { S.md = v; S.tr = null; }
    if (k === "tr") S.tr = v;
    this.vTab = opt.stay ? k : null;
    this.vOpen = !!opt.stay;   // closes once the vehicle is complete (a keyboard step waits for its commit)
    this._selStay = !!opt.stay;
    var after = function () {
      self.writeUrl();
      self.renderCard();
      if (!opt.stay) { self.focusCard(); self.announceField(); }
      if (self.vehicleComplete()) self.loadBundle(); else self.setLane("pick");
    };
    if (k === "tr") {
      this.resetVehicle(true);
      if (keepVin) S._vin = keepVin;
      after();
      return;
    }
    this.resetVehicle();
    this.cascade(false).then(after);
  };
  // Enter on (or focus leaving) a select that was stepped with the keyboard:
  // the card moves on to the next field, like a tile tap.
  P.commitSelectStep = function (moveFocus) {
    if (!this._selStay) return;
    this._selStay = false;
    this.vTab = null; this.vOpen = false;
    this.renderCard();
    var a = doc.activeElement;
    if (moveFocus || !a || a === doc.body || !visible(a)) this.focusCard();
    this.announceField();
  };
  // The one status region says what was just picked and what comes next
  // (a complete vehicle is announced by focusCard).
  P.announceField = function () {
    var S = this.S;
    if (this.vehicleComplete() && !this.cardOpen()) return;
    var so = [S.y, S.mk, S.md, S.tr].filter(Boolean).join(" ");
    this.announce((so ? so + ". " : "") + vfield(this.curTab()).next + ".");
  };
  // After a pick: the next field's first tile, or (card closed) its "Change".
  P.focusCard = function () {
    var card = $("[data-ptpb-garage]", this.app);
    var t = this.cardOpen() ? ($(".ptpb__vpanel:not([hidden]) .ptpb__vtile.is-on", card) || $(".ptpb__vpanel:not([hidden]) .ptpb__vtile", card) || $(".ptpb__vpanel:not([hidden]) select", card))
      : $('[data-act="vchange"]', this.app);
    if (this.vehicleComplete() && !this.cardOpen()) this.announce("Vehicle: " + [this.S.y, this.S.mk, this.S.md, this.S.tr].join(" ") + ". Finding wheels that fit.", true);
    focusQuiet(t);
  };
  // "Use my VIN": the app's /api/decode-vin (public, CORS) fills the card with
  // whatever matches our vehicle list; anything that doesn't stays open to tap.
  P.lookupVin = function () {
    var self = this, S = this.S;
    var raw = (doc.getElementById("ptpb-vvin") || {}).value || "";
    var vin = raw.replace(/\s+/g, "").toUpperCase();
    this.vinDraft = raw;
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      this.vinErr = vin.length !== 17 ? "A VIN has 17 letters and numbers. You entered " + vin.length + "." : "A VIN never has the letters I, O or Q.";
      this.renderCard(); focusQuiet(doc.getElementById("ptpb-vvin")); this.announce(this.vinErr);
      return Promise.resolve(null);
    }
    this.vinErr = ""; this.vinBusy = true; this.renderCard();
    var fail = function (msg) {
      self.vinBusy = false; self.vinErr = msg; self.renderCard(); focusQuiet(doc.getElementById("ptpb-vvin")); self.announce(msg); return null;
    };
    return root.fetch(this.apiBase + "/api/decode-vin?vin=" + encodeURIComponent(vin)).then(function (r) {
      if (r.status === 429) return { tooMany: true };
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (d && d.tooMany) return fail("Too many lookups — please wait a minute, or pick your vehicle above.");
      var v = d && d.vehicle;
      if (!v || !v.year || !v.make) return fail("We couldn’t read that VIN. Check it, or pick your vehicle above.");
      return self.loadYear(String(v.year)).then(function (yd) {
        var mk = yd && yd.models ? matchCI(yd.makes || Object.keys(yd.models), v.make) : null;
        var noMake = "We found a " + v.year + " " + v.make + ", but it isn’t in our fitment list. Pick the closest match above, or request a quote.";
        if (!mk) {
          // Keep what did match (the year) when no vehicle is on screen yet; a
          // complete vehicle the customer already has is never wiped by a miss.
          if (!yd || !yd.models || self.vehicleComplete()) return fail(noMake);
          if (String(S.y) !== String(v.year)) { S.y = String(v.year); S.mk = null; S.md = null; S.tr = null; self.resetVehicle(); }
          self.vTab = null;
          return self.cascade(false).then(function () { self.writeUrl(); self.setLane("pick"); return fail(noMake); });
        }
        var md = matchCI(Object.keys(yd.models[mk] || {}), v.model);
        var tr = md ? matchCI(Object.keys(yd.models[mk][md] || {}), v.trim) : null;
        self.vinBusy = false; self.vinOpen = false; self.vinDraft = "";
        S.y = String(v.year); S.mk = mk; S.md = md; S.tr = tr;
        self.resetVehicle();
        S._vin = vin;
        self.vTab = null; self.vOpen = false;
        return self.cascade(false).then(function () {
          self.writeUrl();
          self.renderCard();
          self.focusCard();
          if (!self.vehicleComplete()) self.announce("From your VIN: " + [S.y, mk, md].filter(Boolean).join(" ") + ". " + vfield(self.curTab()).next + ".");
          if (self.vehicleComplete()) self.loadBundle(); else self.setLane("pick");
          return v;
        });
      });
    }, function () { return fail("We couldn’t look that up right now. Pick your vehicle above."); });
  };

  // ══════════════════════════════════════════════════════════════════════
  // Data loading
  // ══════════════════════════════════════════════════════════════════════
  P.loadBundle = function (pvIn) {
    var self = this, S = this.S;
    this.cancelSettle();
    if (this.cfg.entryMode === "quote_only") { this.setLane("quote", { reasons: [] }); return; }
    if (!this.vehicleComplete()) { this.setLane("pick"); return; }
    // A reload of the same vehicle (type, VIN, sensor claim) keeps the builder
    // on screen, dimmed and aria-busy: focus and scroll stay where they are.
    this.busyOrLoading();
    var pv = pvIn || this.capturePrev();
    var params = { year: S.y, make: S.mk, model: S.md, trim: S.tr, vehicle_type: S.vt || "" };
    if (S._vin) params.vin = S._vin;
    if (S._tpmsClaim) params.tpms_claim = "indirect";
    this.api("vehicle", { params: params, channel: "vehicle" }).then(function (r) {
      if (r.stale || r.aborted) return;
      self.setBusy(false);
      if (!r.ok || !r.data) { self.setLane("error", { status: r.status }); return; }
      var b = r.data;
      if (b.available === false) { self.setLane("quote", { reason: b.reason }); return; }
      if (!b.vehicle && b.trimMatched !== false) { self.setLane("quote", { reasons: (b.scope && b.scope.reasons) || [] }); return; }
      self.D.bundle = b;
      if (b.trimMatched === false) { self.showServerTrims(b.trims || []); return; }
      self.hideServerTrims();
      if (b.scope && b.scope.lane === "quote") { self.setLane("quote", { reasons: b.scope.reasons || [] }); return; }
      if (!S.vt) S.vt = b.suggestedVehicleType || "passenger";
      // A pickup by our data is priced and booked as one (the server floors it too).
      if (TRUCKISH.indexOf(b.suggestedVehicleType) !== -1 && TRUCKISH.indexOf(S.vt) === -1) S.vt = b.suggestedVehicleType;
      // "What's this set for?" starts on truck tires for a pickup (unless a link said otherwise).
      if (S._ptDefault && TRUCKISH.indexOf(S.vt) !== -1) S.pt = "truck";
      if (S.pt === "truck" && TRUCKISH.indexOf(S.vt) === -1) S.pt = "winter";
      var tp = b.tpms || {};
      // The server says which TPMS choices this vehicle has: keep the
      // customer's if it is one of them, else take the server's default.
      var choices = tp.choices || ["new", "none"];
      if (!S.tp || choices.indexOf(S.tp) === -1) S.tp = tp.default || choices[0] || "new";
      self.renderVehicleExtras();
      track("pkg_vehicle", { year: S.y, make: S.mk, model: S.md, trim: S.tr });
      self.loadWheels(pv);
    });
  };

  P.showServerTrims = function (trims) {
    var trSel = $("#ptpb-trim", this.app);
    this._serverTrims = trims;
    this.S.tr = null;
    fillSelect(trSel, trims, "Pick your trim", "");
    this.vOpen = true; this.vTab = "tr";
    var h = $("[data-ptpb-trimhint]", this.app);
    h.hidden = false;
    h.textContent = "Pick the trim that matches your vehicle. Our fitment list names it differently.";
    this.setLane("pick", { trim: true });
    var t1 = $('[data-ptpb-vtiles="tr"] .ptpb__vtile', this.app);
    try { (t1 || trSel).focus({ preventScroll: false }); } catch (e) {}
  };
  P.hideServerTrims = function () {
    var h = $("[data-ptpb-trimhint]", this.app);
    if (h) h.hidden = true;
  };

  P.wheelParams = function () {
    var S = this.S;
    var p = { year: S.y, make: S.mk, model: S.md, trim: S.tr, vehicle_type: S.vt, lift: S.lift || "stock",
      lift_in: S.lift === "lifted" ? (S.li || "") : "", package_type: S.pt, shop: S.s };
    if (S.brand) p.brand = S.brand;
    if (S._focus) p.wheel_id = S._focus;
    // Every "Packages from $X" and the budget range are priced by the SERVER with
    // the customer's current choices — TPMS, road force, road hazard (its brand
    // allow-list too) — at this shop. The browser never estimates them.
    p.tpms = S.tp || "";
    p.road_force = S.rf ? "1" : "0";
    p.road_hazard = S.rh ? "1" : "0";
    return p;
  };
  // What the current wheel list was priced with (the server's fromTotalCents basis).
  P.pricedWith = function () { var S = this.S; return [S.s, S.tp || "", S.rf ? 1 : 0, S.rh ? 1 : 0].join("|"); };
  // A choice that changes package prices (TPMS, road force, road hazard, shop):
  // re-ask /wheels quietly so every card, the slider and "Fit my budget" stay exact.
  P.refreshWheelPrices = function () {
    var self = this;
    if (!this.D.wheels || this.D.wheelsBasis === this.pricedWith()) return;
    clearTimeout(this._wpT);
    this._wpT = setTimeout(function () {
      var basis = self.pricedWith(), token = self.D.wheels;
      if (!token || self.D.wheelsBasis === basis) return;
      self.wheelPricesPending = true;
      self.api("wheels", { params: self.wheelParams(), channel: "wheelprices" }).then(function (r) {
        if (r.stale || r.aborted) return;
        self.wheelPricesPending = false;
        // A full reload replaced the list meanwhile, or the choices moved on: drop it.
        if (self.D.wheels !== token || self.pricedWith() !== basis) { self.refreshWheelPrices(); return; }
        if (!r.ok || !r.data || !r.data.wheels) { self.renderBudgetDeps(); return; }
        var byId = {};
        r.data.wheels.forEach(function (w) { byId[w.id] = w; });
        var fresh = function (w) {
          var n = w && byId[w.id];
          if (!n) return;
          w.fromTotalCents = n.fromTotalCents; w.fromTireId = n.fromTireId; w.fromSize = n.fromSize;
        };
        (token.wheels || []).forEach(fresh);
        if (token.focus && token.focus.wheel) fresh(token.focus.wheel);
        token.budgetRange = r.data.budgetRange || null;
        self.D.wheelsBasis = basis;
        self.renderBudgetDeps();
      });
    }, 250);
  };

  // What the customer had before a reload changes the tire list (package type,
  // vehicle type, height): used to keep their tire, or say what changed.
  P.capturePrev = function () {
    var S = this.S;
    if (!S.w) return null;
    var h = this.tireById(S.t, S.w);
    var cur = h ? h.tire : null;
    var mine = S.ta ? cur : (this.myTire || cur);
    // Nothing loaded yet (first load from a link): the URL's tire is kept as is.
    if (!mine) return null;
    return { snap: null, tireObj: mine, auto: !!S.ta, wheel: S.w, wheelName: wheelName(this.wheelById(S.w)) };
  };

  P.loadWheels = function (pv) {
    var self = this, S = this.S;
    this.cancelSettle();
    this.busyOrLoading();
    var basis = this.pricedWith();
    this.api("wheels", { params: this.wheelParams(), channel: "wheels" }).then(function (r) {
      if (r.stale || r.aborted) return;
      self.setBusy(false);
      if (!r.ok || !r.data) { self.setLane("error", { status: r.status }); return; }
      var d = r.data;
      if (d.available === false) { self.setLane("quote", { reason: d.reason }); return; }
      if (d.scope && d.scope.lane === "quote") { self.setLane("quote", { reasons: d.scope.reasons || [] }); return; }
      self.D.wheels = d;
      self.D.wheelsBasis = basis;
      self.tiresCache = {};
      // Normalise a budget from a link: $50 steps, inside the range.
      var rg = self.budgetRange();
      if (S.bg != null) {
        if (!rg) S.bg = null;
        else { S.bg = Math.round(S.bg / 50) * 50; if (S.bg < rg.min) S.bg = rg.min; if (S.bg >= rg.max) S.bg = null; }
      }
      // No wheel is pre-picked: the customer finds one through the questions.
      // A wheel from the URL stays; a ?wheel= that fits is pre-selected.
      var have = S.w && self.wheelById(S.w);
      if (!have) {
        if (S.w && pv) self.pushLog("No " + self.typeNoun() + " tires fit the " + (pv.wheelName || "chosen") + " wheels for your vehicle, so we cleared your wheel. Pick one below.", null);
        S.w = null; S.t = null; S.sz = null; S.ta = false; self.myTire = null;
        var f = d.focus;
        if (f && f.wheel && ["fits", "fits_warn", "fit_check"].indexOf(f.verdict) !== -1) { S.w = f.wheel.id; S.ta = true; pv = null; }
      }
      // Already on screen: repaint in place (paint() keeps focus by id).
      if (self.lane === "builder") self.render(); else self.setLane("builder");
      self.writeUrl();
      var pvOk = pv && pv.wheel === S.w ? pv : null;
      if (S.w) self.ensureTires(S.w).then(function (t) { if (t) self.settleTire(pvOk, pvOk && pvOk.reason); });
    });
  };
  P.typeNoun = function () {
    var t = PACKAGE_TYPES.filter(function (x) { return x.id === this.S.pt; }, this)[0];
    return t ? t.noun : "";
  };

  // The builder stays on screen while it reloads (dimmed, aria-busy); only the
  // first load shows the full-lane spinner.
  P.busyOrLoading = function () {
    if (this.lane === "builder") { this.setBusy(true); this.announce("Updating packages…"); }
    else this.setLane("loading");
  };
  P.setBusy = function (on) {
    this.busy = !!on;
    var main = this.laneEl ? $(".ptpb__layout", this.laneEl) : null;
    if (!main) return;
    main.setAttribute("aria-busy", on ? "true" : "false");
    if (on) main.classList.add("is-busy"); else main.classList.remove("is-busy");
  };

  P.allWheels = function () { return (this.D.wheels && this.D.wheels.wheels) || []; };
  P.wheelById = function (id) {
    var d = this.D.wheels;
    if (!d || !id) return null;
    var ws = d.wheels || [];
    for (var i = 0; i < ws.length; i++) if (ws[i].id === id) return ws[i];
    if (d.focus && d.focus.wheel && d.focus.wheel.id === id && d.focus.verdict !== "blocked" && d.focus.verdict !== "excluded") return d.focus.wheel;
    return null;
  };
  // The wheels the questions work on: the list, plus a fitting ?wheel= focus.
  P.okWheels = function () {
    var ws = this.allWheels().slice(), d = this.D.wheels;
    if (d && d.focus && d.focus.wheel && ["fits", "fits_warn", "fit_check"].indexOf(d.focus.verdict) !== -1 &&
        !ws.some(function (w) { return w.id === d.focus.wheel.id; })) ws.push(d.focus.wheel);
    return ws;
  };

  P.ensureTires = function (wheelId) {
    var self = this, S = this.S;
    var key = wheelId + "|" + S.pt;
    if (this.tiresCache[key]) return Promise.resolve(this.tiresCache[key]);
    var p = this.wheelParams();
    p.wheel_id = wheelId;
    delete p.brand; delete p.tpms; delete p.road_force; delete p.road_hazard;
    this.tiresLoading = wheelId;
    this.renderTires();
    return this.api("tires", { params: p, channel: "tires" }).then(function (r) {
      if (r.stale || r.aborted) return null;
      self.tiresLoading = null;
      if (!r.ok || !r.data || r.data.available === false) {
        self.tiresError = true;
        self.renderTires();
        return null;
      }
      self.tiresError = false;
      self.tiresCache[key] = r.data;
      return r.data;
    });
  };

  P.tiresFor = function (wheelId) { return this.tiresCache[(wheelId || this.S.w) + "|" + this.S.pt] || null; };

  P.tireById = function (id, wheelId) {
    var t = this.tiresFor(wheelId);
    if (!t || !id) return null;
    for (var i = 0; i < (t.sizes || []).length; i++) {
      var s = t.sizes[i];
      for (var j = 0; j < (s.tires || []).length; j++) if (s.tires[j].id === id) return { tire: s.tires[j], size: s };
    }
    return null;
  };

  // ══════════════════════════════════════════════════════════════════════
  // Guided finder: answers, package prices, budget
  // ══════════════════════════════════════════════════════════════════════
  // "Packages from $X" for a wheel: the server's cheapest complete package with
  // the customer's choices (wheelParams sends TPMS, road force and road hazard).
  // null = no complete package online for this wheel (never "in budget").
  // For the moment between a choice and the quiet /wheels refresh, a TPMS or
  // road force change is bridged by the exact pricer difference (it is the same
  // for every package); road hazard depends on the tire, so it waits for the server.
  P.optionDelta = function () {
    var b = this.D.bundle, S = this.S, basis = String(this.D.wheelsBasis || "").split("|");
    if (!b || !b.pricing || basis.length < 4) return 0;
    var tp = b.tpms || {};
    var zw = { priceCents: 0, acc: {} }, zt = { priceCents: 0 };
    var then = { shop: basis[0] || S.s, vehicleType: S.vt, suggestedVehicleType: b.suggestedVehicleType, model: S.md, wheel: zw, tire: zt, tpms: basis[1] || tp.default || "new", tpmsType: tp.type, options: { roadForce: basis[2] === "1" } };
    var now = { shop: S.s, vehicleType: S.vt, suggestedVehicleType: b.suggestedVehicleType, model: S.md, wheel: zw, tire: zt, tpms: S.tp || tp.default || "new", tpmsType: tp.type, options: { roadForce: !!S.rf } };
    return compute(b.pricing, now).totalCents - compute(b.pricing, then).totalCents;
  };
  P.pkgFrom = function (w) {
    if (!w || w.fromTotalCents == null) return null;
    return w.fromTotalCents + this.optionDelta();
  };
  // A wheel's place against the budget: 0 in budget, 1 over, 2 no online package price.
  P.wheelBudget = function (w) {
    var v = this.pkgFrom(w);
    if (v == null) return 2;
    return this.inBudget(v) ? 0 : 1;
  };
  // One complete package with every current option, priced by the local pricer.
  P.tireTotal = function (w, t) {
    var b = this.D.bundle, S = this.S;
    if (!b || !b.pricing || !w || !t) return null;
    return compute(b.pricing, { shop: S.s, vehicleType: S.vt, suggestedVehicleType: b.suggestedVehicleType, model: S.md, wheel: w, tire: t, tpms: S.tp || "new",
      tpmsType: b.tpms ? b.tpms.type : null, tpmsLocked: !!(b.tpms && b.tpms.locked),
      options: { roadForce: !!S.rf, roadHazard: !!S.rh && this.hazardCovers(t) } }).totalCents;
  };
  // Slider range: the cheapest .. dearest complete package, in $50 steps.
  P.budgetRange = function () {
    var d = this.D.wheels;
    if (!d) return null;
    var delta = this.optionDelta(), lo = null, hi = null;
    if (d.budgetRange && d.budgetRange.minCents != null && d.budgetRange.maxCents != null) {
      lo = d.budgetRange.minCents + delta; hi = d.budgetRange.maxCents + delta;
    } else {
      var self = this;
      this.okWheels().forEach(function (w) {
        var v = self.pkgFrom(w);
        if (v == null) return;
        lo = lo == null ? v : Math.min(lo, v); hi = hi == null ? v : Math.max(hi, v);
      });
    }
    if (lo == null) return null;
    var min = Math.ceil(Math.round(lo / 100) / 50) * 50, max = Math.ceil(Math.round(hi / 100) / 50) * 50;
    if (max <= min) max = min + 50;
    return { min: min, max: max, lo: lo, hi: hi };
  };
  // The budget the customer set is kept as set (S.bg). It only counts as "no
  // limit" while it sits at or above the top of the current range.
  P.bud = function () {
    var S = this.S;
    if (S.bg == null) return null;
    var r = this.budgetRange();
    return (!r || S.bg >= r.max) ? null : S.bg;
  };
  function dollars(c) { return Math.round(c / 100); }
  // In CENTS: $1,500.49 is over a $1,500 budget. No price (null) is unknown, not
  // "in budget" — it only passes while no budget is set.
  P.inBudget = function (c) { var b = this.bud(); if (b == null) return true; return c != null && c <= b * 100; };
  P.overText = function (c) { return "$" + commas(Math.max(1, Math.ceil((c - this.bud() * 100) / 100))); };
  P.answered = function () { var S = this.S; return S.lk !== "any" || S.ws !== "any" || this.bud() != null; };

  // The real inches behind each "Wheel size" answer, for this trim.
  P.sizeTargets = function () {
    var b = this.D.bundle || {}, sp = b.spec || {};
    var oeRow = (sp.oeSizes || []).filter(function (o) { return o.stock; })[0] || (sp.oeSizes || [])[0];
    var oe = oeRow && oeRow.diameterIn ? oeRow.diameterIn : ((sp.oeDiameters || []).length ? Math.min.apply(null, sp.oeDiameters) : 17);
    var ds = this.okWheels().map(function (w) { return w.d; });
    var maxD = ds.length ? Math.max.apply(null, ds) : oe;
    var smaller = ds.filter(function (d) { return d < oe; });
    var sMin = smaller.length ? Math.min.apply(null, smaller) : null, sMax = smaller.length ? Math.max.apply(null, smaller) : null;
    // A smaller wheel the server ruled out (brakes): say why instead of hiding it.
    // The one closest to the factory size (the server sorts ascending), with its own reason.
    var blockedSmall = ((this.D.wheels && this.D.wheels.diameters) || []).filter(function (c) { return c.enabled === false && c.in < oe; }).slice(-1)[0] || null;
    return { oe: oe, plus1: oe + 1, max: maxD, minusOK: smaller.length > 0, minusLabel: smaller.length ? (sMin === sMax ? sMax + "″" : sMin + "–" + sMax + "″") : "",
      minusReason: blockedSmall ? blockedSmall.reason : null, minusBlockedIn: blockedSmall ? blockedSmall.in : null };
  };
  P.sizeMatch = function (w, ans) {
    var T = this.sizeTargets(), d = w.d;
    if (ans === "oe") return d === T.oe;
    if (ans === "plus1") return d === T.plus1;
    if (ans === "max") return d === T.max;
    if (ans === "minus") return d < T.oe;
    return true;
  };
  P.lookMatch = function (w, ans) { return ans === "any" || looksOf(w).indexOf(ans) !== -1; };
  P.matches = function (w) { return this.lookMatch(w, this.S.lk) && this.sizeMatch(w, this.S.ws); };
  P.preferredDia = function () {
    var ds = this.okWheels().map(function (w) { return w.d; }), T = this.sizeTargets();
    if (!ds.length) return T.oe;
    if (this.S.pt === "winter") return Math.min.apply(null, ds);
    if (this.S.pt === "look") return ds.indexOf(T.oe + 1) !== -1 ? T.oe + 1 : Math.max.apply(null, ds);
    return T.oe;
  };
  P.sizePhrase = function (w) {
    var T = this.sizeTargets(), d = w.d;
    if (d === T.oe) return "factory size";
    if (d === T.plus1) return "one size up";
    if (d === T.max) return "biggest that fits";
    if (d < T.oe) return this.S.pt === "winter" ? "smaller for winter" : "smaller size";
    return d + "″";
  };
  P.matchText = function (w) {
    var S = this.S, parts = [];
    if (S.lk !== "any") parts.push(LOOK_WORD[S.lk] || w.finish);
    if (S.ws !== "any") parts.push(this.sizePhrase(w));
    if (this.bud() != null && this.wheelBudget(w) === 0) parts.push("in budget");
    var s = parts.join(" · ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // "Best match" order: takes their kept tire → in budget → fits (before fit
  // check) → the size the answers/use suggest → ready soonest → price.
  P.rankWheels = function () {
    var self = this, S = this.S, pref = this.preferredDia(), kept = this.keepTire;
    var takes = function (w) { return kept && (w.sizes || []).some(function (z) { return z.size === kept.size; }) ? 1 : 0; };
    // 0 in budget · 1 over · 2 no online package price (always last, never "in budget")
    var ib = function (w) { var r = self.wheelBudget(w); return self.bud() == null && r === 1 ? 0 : r; };
    var dd = function (w) { return S.ws === "any" ? Math.abs(w.d - pref) : 0; };
    var rk = function (w) { return readyKey((w.readyBy || {})[S.s]); };
    var price = function (w) { var v = self.pkgFrom(w); return v == null ? (w.priceCents || 0) * 4 : v; };
    var cmp = function (a, b) {
      return takes(b) - takes(a) || ib(a) - ib(b) || (FIT_RANK[a.verdict] || 0) - (FIT_RANK[b.verdict] || 0) ||
        dd(a) - dd(b) || (rk(a) < rk(b) ? -1 : rk(a) > rk(b) ? 1 : 0) || price(a) - price(b);
    };
    var ok = this.okWheels();
    return {
      ok: ok, takes: takes, ib: ib, kept: kept,
      match: ok.filter(function (w) { return self.matches(w) || w.id === S.w; }).sort(cmp),
      rest: ok.filter(function (w) { return !self.matches(w) && w.id !== S.w; }).sort(cmp)
    };
  };

  // Tire order for "What matters most?" — data-backed sorts only.
  P.tireCmp = function (prio) {
    var S = this.S;
    var pref = S.pt === "winter" ? "winter" : (S.pt === "truck" ? "all-terrain" : null);
    var vr = function (t) { return t.verdict === "fits" ? 0 : (t.verdict === "fits_warn" ? 1 : 2); };
    var lr = function (t) { return readyKey((t.readyBy || {})[S.s]); };
    var sp = function (t) { return pref && t.season !== pref ? 1 : 0; };
    var tp = function (t) { var r = TIER_PICK[t.tier]; return r == null ? 3 : r; };
    var br = function (t) { var r = BRAND_RANK[t.tier]; return r == null ? 3 : r; };
    var ready = function (a, b) { var x = lr(a), y = lr(b); return x < y ? -1 : x > y ? 1 : 0; };
    return function (a, b) {
      if (prio === "price") return a.priceCents - b.priceCents || vr(a) - vr(b);
      if (prio === "premium") return br(a) - br(b) || a.priceCents - b.priceCents;
      if (prio === "soon") return ready(a, b) || a.priceCents - b.priceCents;
      return sp(a) - sp(b) || tp(a) - tp(b) || vr(a) - vr(b) || ready(a, b) || a.priceCents - b.priceCents;
    };
  };
  // Tire sizes for a wheel in fit order: factory first, then "fits", then the rest.
  P.sortedSizes = function (tires) {
    var rows = ((tires && tires.sizes) || []).filter(function (s) { return (s.tires || []).length; });
    return rows.slice().sort(function (a, b) {
      return (b.oe ? 1 : 0) - (a.oe ? 1 : 0) || (a.verdict === "fits" ? 0 : 1) - (b.verdict === "fits" ? 0 : 1);
    });
  };
  // The automatic tire for a wheel: sizes in fit order, "What matters most?"
  // order inside each size. With a budget, the first tire in ANY fitting size
  // that keeps the package inside it wins; only when none can does it fall back.
  // o.onlySize limits it to one size; o.mustFit returns null instead of falling back.
  P.autoTire = function (w, o) {
    o = o || {};
    var self = this, tires = this.tiresFor(w && w.id);
    if (!w || !tires) return null;
    var sizes = this.sortedSizes(tires);
    if (o.onlySize) sizes = sizes.filter(function (s) { return s.size === o.onlySize; });
    var cmp = this.tireCmp(this.S.pr), first = null, b = this.bud() != null;
    for (var i = 0; i < sizes.length; i++) {
      var list = sizes[i].tires.slice().sort(cmp);
      if (!list.length) continue;
      if (!first) first = { tire: list[0], size: sizes[i] };
      if (!b) return first;
      var fit = list.filter(function (t) { return self.inBudget(self.tireTotal(w, t)); })[0];
      if (fit) return { tire: fit, size: sizes[i] };
    }
    return o.mustFit ? null : first;
  };

  // "Fit my budget": keep their wheel when it has an in-budget package, else the
  // best-matching wheel whose cheapest package fits.
  P.budgetFix = function () {
    if (this.bud() == null) return null;
    var self = this, S = this.S, w = this.wheelById(S.w);
    if (w && this.tiresFor(w.id)) {
      var t = this.autoTire(w, { mustFit: true });
      if (t) return { wheel: w.id, tire: t };
    }
    var R = this.rankWheels();
    var cand = R.match.concat(R.rest).filter(function (x) { return x.id !== S.w && self.wheelBudget(x) === 0; });
    return cand.length ? { wheel: cand[0].id, tire: null, cands: cand.map(function (x) { return x.id; }) } : null;
  };

  // ══════════════════════════════════════════════════════════════════════
  // Selection + conflict rules (live-ux §3.4)
  // ══════════════════════════════════════════════════════════════════════
  P.snapshot = function () {
    var S = this.S;
    return { w: S.w, t: S.t, sz: S.sz, tp: S.tp, rf: S.rf, rh: S.rh, s: S.s, ta: S.ta, _myTire: this.myTire };
  };

  P.pushLog = function (text, prev) {
    var e = { id: "c" + Date.now() + Math.floor(Math.random() * 1000), text: text, prev: prev };
    this.log.unshift(e);
    if (this.log.length > 4) this.log.length = 4;
    this._logged = true;
    this.toast(e);
    this.announce(text, false, "log");
    return e;
  };
  // Any later choice makes the last automatic change history: undoing it would
  // also wipe what the customer did since.
  P.staleUndo = function () {
    if (this.log.length && !this.log[0].stale && this.log[0].prev) { this.log[0].stale = true; this.hideToast(); }
  };

  P.undo = function (id) {
    if (!this.log.length || this.log[0].id !== id || this.log[0].stale || !this.log[0].prev) return;
    this.cancelSettle();
    var e = this.log.shift();
    this.log.forEach(function (x) { x.stale = true; });
    var S = this.S;
    var prevW = S.w;
    for (var k in e.prev) if (Object.prototype.hasOwnProperty.call(e.prev, k) && k !== "_myTire") S[k] = e.prev[k];
    this.myTire = e.prev._myTire || null;
    // Undo of a wheel change is a wheel change: the restored wheel shows in the
    // folded "Your wheel" row (no jump, focus goes to the summary title).
    if (S.w && S.w !== prevW) this.expanded = false;
    this.hideToast();
    this.announce("Undone: " + e.text, false, "log");
    var self = this;
    this.conflict = null;
    this._logged = true;
    // The Undo button is gone after this: put focus on the summary title (or,
    // on a phone with the sheet closed, the bar's toggle), as the prototype does.
    if (S.w && S.w !== prevW) this.ensureTires(S.w).then(function () { self._logged = true; self.changed(); self.focusSummaryTitle(); });
    else { this.changed(); this.focusSummaryTitle(); }
  };

  // After the wheel (or the tire list) changes:
  //  - the tire was OUR automatic choice → re-pick it for these wheels by
  //    "What matters most?" and the budget, so a wheel fills in the package its
  //    card promised;
  //  - the customer chose it → keep it when it fits, else the same model in the
  //    new size, else the nearest tire at the same tier and season, else stop and
  //    ask (conflict panel). Every automatic change is logged with Undo.
  P.settleTire = function (prev, reason) {
    var S = this.S, self = this;
    var tires = this.tiresFor(S.w);
    var w = this.wheelById(S.w);
    if (!tires || !w) { this.changed(); return; }
    reason = reason || (w.d + "″ wheels");
    var hit = this.tireById(S.t, S.w);
    var set = function (x, auto) { S.t = x.tire.id; S.sz = x.size.size; S.ta = !!auto; self.conflict = null; };
    if (!prev) {
      if (hit) {
        S.sz = hit.size.size; this.conflict = null;
        if (!S.ta && !this.myTire) this.myTire = hit.tire;
      } else {
        var a = this.autoTire(w);
        if (a) set(a, true); else { S.t = null; S.sz = null; }
      }
      this.changed();
      return;
    }
    var mine = prev.tireObj;
    if (!mine || prev.auto) {
      var nt = this.autoTire(w);
      if (!nt) { S.t = null; S.sz = null; this.changed(); return; }
      set(nt, true);
      this.myTire = null;
      if (mine && mine.id !== nt.tire.id) {
        var same = mine.brand === nt.tire.brand && mine.model === nt.tire.model;
        this.pushLog(same ? tireName(nt.tire) + ": size changed to " + nt.size.size + " to fit " + reason + "."
          : "Tires changed to " + tireName(nt.tire) + " " + nt.size.size + ", our pick for " + reason + (this.bud() != null ? " within your budget" : "") + ".", prev.snap);
      }
      this.changed();
      return;
    }
    var sizes = this.sortedSizes(tires), pick = null, i, j;
    // 1. their tire, as is
    for (i = 0; i < sizes.length && !pick; i++) for (j = 0; j < sizes[i].tires.length; j++) if (sizes[i].tires[j].id === mine.id) { pick = { tire: sizes[i].tires[j], size: sizes[i] }; break; }
    if (pick) {
      set(pick, false);
      if (prev.t && prev.t !== mine.id) this.pushLog("Back to your " + tireName(mine) + ": it fits these " + reason + ".", prev.snap);
      this.changed();
      return;
    }
    // 2. the same model in a size that fits these wheels
    for (i = 0; i < sizes.length && !pick; i++) sizes[i].tires.forEach(function (t) { if (!pick && t.brand === mine.brand && t.model === mine.model && t.model) pick = { tire: t, size: sizes[i] }; });
    if (pick) {
      set(pick, false);
      this.pushLog(tireName(pick.tire) + ": size changed to " + pick.size.size + " to fit " + reason + ".", prev.snap);
      this.changed();
      return;
    }
    // 3. the nearest at the same tier AND season, by price
    var best = null;
    sizes.forEach(function (s) {
      s.tires.forEach(function (t) {
        if (t.tier !== mine.tier || t.season !== mine.season) return;
        var dl = Math.abs((t.priceCents || 0) - (mine.priceCents || 0));
        if (!best || dl < best.d) best = { tire: t, size: s, d: dl };
      });
    });
    if (best) {
      set(best, false);
      this.pushLog(tireName(mine) + " doesn’t come in a size for " + reason + ". Showing " + tireName(best.tire) + " " + best.size.size +
        " (also " + (TIER_WORD[mine.tier] || mine.tier || "") + ", " + seasonWord(mine.season).toLowerCase() + "). Go back to a wheel that fits and yours returns.", prev.snap);
      this.changed();
      return;
    }
    // 4. stop and explain
    var any = null;
    sizes.forEach(function (s) {
      s.tires.forEach(function (t) {
        var dl = (t.season === mine.season ? 0 : 1e9) + Math.abs((t.priceCents || 0) - (mine.priceCents || 0));
        if (!any || dl < any.d) any = { tire: t, size: s, d: dl };
      });
    });
    this.conflict = { kind: sizes.length ? "no_tier" : "no_tires", prev: prev, tier: mine.tier, season: mine.season, mine: mine, suggest: any, reason: reason };
    S.t = null; S.sz = any ? any.size.size : null; S.ta = false;
    this.pushLog(tireName(mine) + " doesn’t fit " + reason + ". Choose how to continue.", prev.snap);
    this.changed();
  };

  P.chooseWheel = function (id, opts) {
    opts = opts || {};
    var S = this.S, self = this;
    this.cancelSettle();
    if (id === S.w) return;
    var had = !!S.w;
    var prevWheel = this.wheelById(S.w);
    var prevHit = this.tireById(S.t, S.w);
    var cur = prevHit ? prevHit.tire : null;
    var mine = this.conflict && this.conflict.mine ? this.conflict.mine : (S.ta ? cur : (this.myTire || cur));
    var prev = { snap: this.snapshot(), t: S.t, tireObj: mine, auto: !!S.ta && !(this.conflict && this.conflict.mine) };
    S.w = id;
    this.conflict = null;
    if (this.D.unavailable && this.D.unavailable.item === "wheel") { this.D.unavailable = null; if (this.D.priceState === "unavailable") this.D.priceState = "idle"; }
    var w = this.wheelById(id);
    track("pkg_wheel", { wheel: id, verdict: w ? w.verdict : "" });
    // Hardware lines appear or disappear with an explanation.
    if (prevWheel && w) {
      var hadR = !!(prevWheel.acc && prevWheel.acc.rings), hasR = !!(w.acc && w.acc.rings);
      if (hadR !== hasR) {
        this.pushLog(hasR ? "Hub rings added: these wheels' centre hole is " + w.acc.rings.fromMm + " mm and your hub is " + w.acc.rings.toMm + " mm."
          : "Hub rings removed: these wheels fit your hub exactly.", prev.snap);
      }
    }
    // A committed pick (click, tap, Space / Enter, "Pick these wheels") folds the
    // list into "Your wheel" and brings the tires into view, EVERY time. An
    // arrow-key move (opts.commit unset) only changes the selection.
    if (opts.commit) this.showTires(opts.commit, "Wheel picked: " + wheelName(w) + " " + (w ? w.d + "″" : "") + ". Showing tires that fit.");
    else this.render();
    this.ensureTires(id).then(function (t) {
      if (t) self.settleTire(had ? prev : (mine ? prev : null), opts.reason || null);
      if (opts.commit) self.relandTires();
    });
  };

  P.chooseSize = function (size) {
    var S = this.S;
    if (size === S.sz && S.t) return;
    var tires = this.tiresFor(S.w);
    if (!tires) return;
    var row = (tires.sizes || []).filter(function (s) { return s.size === size; })[0];
    if (!row || !(row.tires || []).length) return;
    var prevHit = this.tireById(S.t, S.w);
    var prevT = prevHit ? prevHit.tire : (this.conflict && this.conflict.mine) || null;
    var snap = this.snapshot();
    var pick = null;
    if (prevT) row.tires.forEach(function (t) { if (!pick && t.brand === prevT.brand && t.model === prevT.model && t.model) pick = t; });
    if (!pick && prevT) {
      var best = null;
      row.tires.forEach(function (t) {
        var dl = (t.tier === prevT.tier && t.season === prevT.season ? 0 : 1e9) + Math.abs(t.priceCents - prevT.priceCents);
        if (!best || dl < best.d) best = { t: t, d: dl };
      });
      pick = best.t;
    }
    if (!pick) pick = row.tires.slice().sort(this.tireCmp(S.pr))[0];
    S.sz = size; S.t = pick.id; S.ta = false; this.myTire = pick; this.conflict = null; this.keepTire = null;
    if (prevT && pick.id !== prevT.id && !(prevT.brand === pick.brand && prevT.model === pick.model)) {
      this.pushLog(tireName(prevT) + " doesn’t come in " + size + ", so we picked " + tireName(pick) + " (" + (TIER_WORD[pick.tier] || pick.tier || "") + ", closest price).", snap);
    }
    this.changed();
  };

  P.chooseTire = function (id) {
    var hit = this.tireById(id, this.S.w);
    if (!hit) return;
    this.S.t = id; this.S.sz = hit.size.size; this.S.ta = false;
    this.myTire = hit.tire; this.keepTire = null; this.conflict = null;
    if (this.D.unavailable && this.D.unavailable.item === "tire") { this.D.unavailable = null; if (this.D.priceState === "unavailable") this.D.priceState = "idle"; }
    track("pkg_tire", { tire: id });
    this.changed();
  };

  P.applyPreset = function (tier, how) {
    var d = this.D.wheels;
    var p = (d && d.presets || []).filter(function (x) { return x.tier === tier; })[0];
    if (!p) return;
    this.cancelSettle();
    var S = this.S, self = this;
    var snap = this.snapshot();
    var custom = S.w && !(this.presetOn(p));
    S.w = p.wheelId; S.t = p.tireId; S.sz = p.size; S.ta = false; this.myTire = null; this.conflict = null; this.keepTire = null;
    var name = (PRESET_NAMES[S.pt] || PRESET_NAMES.winter)[tier];
    if (custom) this.pushLog("Switched to our " + name.toLowerCase() + " pick (your wheel and tire were replaced).", snap);
    var pw = this.wheelById(p.wheelId);
    var msg = "Picked our " + name.toLowerCase() + " package" + (pw ? ": " + wheelName(pw) + " " + pw.d + "″" : "") + ".";
    track("pkg_preset", { tier: tier });
    // A click / tap / Space / Enter commits (fold + tires). An arrow key only
    // selects: the list stays open (never folds away under the focused radio).
    if (how) this.showTires(how, msg + " Showing tires that fit.");
    else { this.expanded = true; this.render(); this.announce(msg + " Press Enter to see tires for it.", true); }
    this.ensureTires(p.wheelId).then(function () { self.settleTire(null, null); });
  };
  P.presetOn = function (p) { return this.S.w === p.wheelId && this.S.t === p.tireId; };

  P.setShop = function (slug) {
    var S = this.S;
    if (slug === S.s) return;
    var snap = this.snapshot();
    S.s = slug;
    var b = this.D.bundle;
    var shops = b && b.pricing && b.pricing.roadForce ? b.pricing.roadForce.shops || [] : [];
    if (S.rf && shops.indexOf(slug) === -1) {
      S.rf = false;
      this.pushLog("Road force balancing removed: it's offered at Edmonton Trail NE only.", snap);
    }
    this.req.date = null; this.req.time = null;
    this.changed();
  };

  P.setPrio = function (prio) {
    var S = this.S, snap = this.snapshot();
    S.pr = prio;
    var w = this.wheelById(S.w), hit = this.tireById(S.t, S.w);
    var label = PRIOS.filter(function (p) { return p.id === prio; })[0].label;
    // Re-sort; only swap the tire when it was our automatic choice (never theirs).
    if (w && hit && S.ta && !this.conflict) {
      var nt = this.autoTire(w, { onlySize: hit.size.size });
      if (nt && nt.tire.id !== hit.tire.id) {
        S.t = nt.tire.id;
        this.pushLog("Sorted by " + label.toLowerCase() + ": tires changed to " + tireName(nt.tire) + ".", snap);
      }
    }
    if (!this._logged) this.announce("Tires sorted: " + label + ".");
    this.changed();
  };

  P.fitBudget = function () {
    var fx = this.budgetFix(), S = this.S, self = this;
    if (!fx) return;
    this.cancelSettle();
    var snap = this.snapshot(), b = this.bud();
    if (fx.tire) {
      S.t = fx.tire.tire.id; S.sz = fx.tire.size.size; S.ta = true; this.myTire = null; this.conflict = null;
      this.pushLog("Fit to your $" + commas(b) + " budget: tires changed to " + tireName(fx.tire.tire) + " " + fx.tire.size.size + ".", snap);
      this.changed();
      this.focusSummaryTitle();
      return;
    }
    // Try the in-budget wheels in order: the first whose tires really make an
    // in-budget package (with every current option, road hazard included) wins.
    // Never land over budget: with no such wheel, say so and change nothing.
    var cands = (fx.cands || [fx.wheel]).slice(0, 6), i = 0;
    var prevW = S.w;
    var tryNext = function () {
      if (i >= cands.length) {
        S.w = prevW;
        self.announce("Nothing that fits your " + self.vehicleModel() + " comes in under your $" + commas(b) + " budget with these choices.");
        self.render();
        return;
      }
      var id = cands[i++], w = self.wheelById(id);
      if (!w) return tryNext();
      self.ensureTires(id).then(function (tl) {
        var nt = tl ? self.autoTire(w, { mustFit: true }) : null;
        if (!nt) return tryNext();
        S.w = id; S.t = nt.tire.id; S.sz = nt.size.size; S.ta = true; self.myTire = null; self.conflict = null;
        self.pushLog("Fit to your $" + commas(b) + " budget: " + wheelName(w) + " " + w.d + "″ wheels with " + tireName(nt.tire) + " " + nt.size.size + ".", snap);
        self.expanded = false;
        self.changed();
        // A new wheel: fold the list and bring the tires into view; focus stays
        // on the summary the customer is reading.
        if (id !== prevW) self.showTires("quiet");
        self.focusSummaryTitle();
      });
    };
    tryNext();
  };
  // Is the wheel section folded into the "Your wheel" row? Only while a wheel
  // from the list is picked and still available (a wheel /price says is gone
  // opens the list so another can be picked).
  P.folded = function () {
    var S = this.S;
    if (this.lane !== "builder" || this.expanded || !S.w || !this.wheelById(S.w)) return false;
    return !this.wheelGone();
  };
  // /price says the picked wheel is gone: it can't be kept, only replaced.
  P.wheelGone = function () {
    return !!(this.D.unavailable && this.D.unavailable.item === "wheel" && this.D.priceState === "unavailable");
  };
  // Drop a pending arrow-key pick (500 ms settle) so it can never override a
  // choice made after it (a click, Keep, our picks, Fit my budget, Undo, a reload).
  P.cancelSettle = function () { clearTimeout(this._wkT); this._wkT = null; };
  // Fold the answers + wheel list and bring "Now pick tires" into view.
  //  how "pointer": smooth scroll (instant under prefers-reduced-motion; the
  //    section's scroll-margin-top clears the sticky header), and focus moves
  //    quietly to the tire heading so it never falls to <body> when the clicked
  //    card folds away;
  //  how "key" (Space / Enter): the same, focus on the tire heading;
  //  how "quiet" (Fit my budget): scroll only, focus stays where it is.
  //  Scroll target: the folded "Your wheel" row (its scroll-margin-top clears
  //  the sticky header), so the row, the tire heading and the first tires are
  //  all on screen ("Your set" sits after the tire list).
  P.showTires = function (how, msg) {
    this.cancelSettle();
    this.expanded = false;
    this.render();
    if (msg) this.announce(msg, true);
    var self = this;
    if (how !== "quiet") focusQuiet(doc.getElementById("ptpb-h-tire"));
    this._landAt = Date.now();
    setTimeout(function () { self.landTires(); }, 30);
  };
  // The tires arrived after the land (first load for this wheel): land again
  // with their real position, unless the customer has scrolled, swiped or
  // typed since (never fight the customer), or it took too long.
  P.relandTires = function () {
    var at = this._landAt;
    this._landAt = 0;
    if (!at || Date.now() - at > 4000 || (this._userAt || 0) > at + 60) return;
    var self = this;
    setTimeout(function () { if (!((self._userAt || 0) > at + 60)) self.landTires(); }, 30);
  };
  // Where a pick lands: the highest of "Edit answers", the "Your wheel" row,
  // the tire heading or the first tire that still leaves the first tire
  // (TIRE_SHOWS px of it) above the phone pill / the bottom of the screen. On a
  // short phone that is the tire heading, so a tire is always in view.
  var TIRE_SHOWS = 100;
  P.landTires = function () {
    var row = this.folded() && visible($(".ptpb__wrow", this.app));
    var sec = doc.getElementById("ptpb-sec-tire");
    if (!row) { smoothTo(sec); return; }
    var y0 = root.scrollY || root.pageYOffset || 0, vh = root.innerHeight;
    var top = function (el) { return el ? el.getBoundingClientRect().top + y0 : null; };
    var margin = parseFloat(root.getComputedStyle(row).scrollMarginTop) || 90;
    var bar = visible($(".ptpb__bar", this.app)), limit = bar ? bar.getBoundingClientRect().top : vh;
    var first = top($(".ptpb__tlist > *", this.laneEl)) || top(sec);
    var ans = $(".ptpb__answers", this.app), ansR = ans ? ans.getBoundingClientRect() : null;
    // The site's fixed header: "Edit answers" is never left half under it.
    var hd = doc.querySelector("[data-pt-header]"), hb = 0;
    if (hd) { var hr = hd.getBoundingClientRect(), hcs = root.getComputedStyle(hd); if ((hcs.position === "fixed" || hcs.position === "sticky") && hr.top <= 1 && hr.bottom > 0) hb = hr.bottom; }
    var rowY = top(row) - margin;
    if (ansR && hb) { var aTop = ansR.top + y0 - rowY, aBot = ansR.bottom + y0 - rowY; if (aTop < hb && aBot > hb) rowY = ansR.bottom + y0 - hb; }
    var wh = doc.getElementById("ptpb-h-wheel");
    var cands = [wh ? top(wh) - margin : null, ansR ? ansR.top + y0 - margin : null, rowY, top(doc.getElementById("ptpb-h-tire")) - margin, first - margin].filter(function (x) { return x != null && !isNaN(x); });
    var y = first - margin;
    for (var i = 0; i < cands.length; i++) {
      if (first + TIRE_SHOWS - cands[i] <= limit) { y = cands[i]; break; }
    }
    try { root.scrollTo({ top: Math.max(0, y), behavior: reducedMotion() ? "auto" : "smooth" }); } catch (e) { root.scrollTo(0, Math.max(0, y)); }
  };
  // "Change wheel" / "Edit answers": unfold everything as it was (answers,
  // budget, the "more wheels" groups' open state are all kept), then land on
  // the picked card with focus on its radio, or on the section heading.
  P.unfold = function (toCard) {
    var S = this.S;
    this.cancelSettle();
    this.closeSheet();
    this.expanded = true;
    this.render();
    var wr = toCard && S.w ? $('input[name="ptpb-wheel"][value="' + S.w + '"]', this.laneEl) : null;
    var card = wr && wr.closest ? visible(wr.closest(".ptpb__wcard")) : null;
    var h = doc.getElementById("ptpb-h-wheel");
    if (card) { smoothTo(card); focusQuiet(wr); }
    else { smoothTo(doc.getElementById("ptpb-sec-wheel")); focusQuiet(h); }
    var w = this.wheelById(S.w);
    this.announce(toCard && w ? "Showing every wheel. " + wheelName(w) + " is selected." : "Your answers are open. " + this.answerMsg());
  };

  P.focusSummaryTitle = function () {
    var t = visible(doc.getElementById("ptpb-sum-title")) || visible($('.ptpb__bar [data-act="sheet-open"]', this.laneEl));
    focusQuiet(t);
  };

  // ══════════════════════════════════════════════════════════════════════
  // Pricing (local instant + server authority)
  // ══════════════════════════════════════════════════════════════════════
  P.currentObjects = function () {
    var w = this.wheelById(this.S.w);
    var hit = this.tireById(this.S.t, this.S.w);
    return { wheel: w, tire: hit ? hit.tire : null, sizeRow: hit ? hit.size : null };
  };

  P.selectionKey = function () {
    var S = this.S;
    return [S.y, S.mk, S.md, S.tr, S.vt, S.lift, S.li, S.pt, S.s, S.w, S.t, S.sz, S.tp, S.rf ? 1 : 0, S.rh ? 1 : 0, S._tpmsClaim ? 1 : 0].join("|");
  };

  P.selectionBody = function () {
    var S = this.S;
    var body = {
      vehicle: { year: +S.y, make: S.mk, model: S.md, trim: S.tr },
      vehicleType: S.vt, lift: S.lift || "stock", liftInches: S.lift === "lifted" && S.li ? +S.li : null,
      shop: S.s, packageType: S.pt, wheelId: S.w, tireId: S.t, size: S.sz, tpms: S.tp || "new",
      options: { roadForce: !!S.rf, roadHazard: !!S.rh }
    };
    if (S._vin) body.vin = S._vin;
    if (S._tpmsClaim) body.tpmsClaim = "indirect";
    return body;
  };

  P.localQuote = function () {
    var b = this.D.bundle, o = this.currentObjects(), S = this.S;
    if (!b || !b.pricing || !o.wheel || !o.tire) return null;
    var q = compute(b.pricing, {
      shop: S.s, vehicleType: S.vt, suggestedVehicleType: b.suggestedVehicleType, model: S.md, wheel: o.wheel, tire: o.tire, tpms: S.tp || "new",
      tpmsType: b.tpms ? b.tpms.type : null, tpmsLocked: !!(b.tpms && b.tpms.locked), options: { roadForce: S.rf, roadHazard: S.rh }
    });
    q.lines.forEach(function (l) {
      if (l.key === "wheel") l.label = "Wheels: " + o.wheel.title;
      if (l.key === "tire") l.label = "Tires: " + o.tire.title;
    });
    q.verdict = this.localVerdict(o);
    q.readyBy = { sw: laterReady(o.wheel.readyBy && o.wheel.readyBy.sw, o.tire.readyBy && o.tire.readyBy.sw),
                  ne: laterReady(o.wheel.readyBy && o.wheel.readyBy.ne, o.tire.readyBy && o.tire.readyBy.ne) };
    q.notices = [];
    q.reviewReasons = [];
    var push = function (rs) {
      (rs || []).forEach(function (r) {
        if (r.mode === "WARN" && q.notices.indexOf(r.reason) === -1) q.notices.push(r.reason);
        if (r.mode === "REVIEW" && q.reviewReasons.indexOf(r.reason) === -1) q.reviewReasons.push(r.reason);
      });
    };
    push(o.wheel.reasons); push(o.tire.reasons);
    if (S.tp === "none") q.notices.push("No sensors: your tire-pressure warning light will stay on. This is legal in Canada and we'll note your choice on the work order.");
    q.local = true;
    return q;
  };

  // The browser's verdict reads ONLY the server's signals (reviewGaps, the
  // wheel/tire/size verdicts, TPMS review) so it never disagrees with /price.
  P.localVerdict = function (o) {
    var b = this.D.bundle || {};
    var vs = [o.wheel && o.wheel.verdict, o.tire && o.tire.verdict, o.sizeRow && o.sizeRow.verdict];
    var review = vs.indexOf("fit_check") !== -1 || (b.tpms && b.tpms.review) || (b.reviewGaps || []).length > 0 ||
      !!this.S._tpmsClaim || this.S.lift === "levelled" || this.S.lift === "lifted";
    if (review) return "fit_check";
    if (vs.indexOf("fits_warn") !== -1 || this.S.tp === "none") return "fits_warn";
    return "fits";
  };

  // The quote the summary shows: the server's when it is for this exact
  // selection, else the local instant one.
  P.shownQuote = function () {
    var local = this.localQuote();
    var sq = this.D.serverQuote;
    if (sq && this.D.serverKey === this.selectionKey()) {
      if (local && local.totalCents !== sq.totalCents) this.D.priceNote = "Updated to today's price.";
      return sq;
    }
    if (local) return local;
    // Before the tires arrive, the preset's own server quote can stand in.
    var d = this.D.wheels, S = this.S;
    var pr = d && (d.presets || []).filter(function (p) { return p.wheelId === S.w && p.tireId === S.t; })[0];
    if (pr && pr.quote && S.tp === "new" && !S.rf && !S.rh && S.s === "sw") return pr.quote;
    return null;
  };

  P.schedulePrice = function () {
    var self = this;
    clearTimeout(this._priceT);
    var o = this.currentObjects();
    if (!o.wheel || !o.tire || !this.D.bundle) { if (this.D.priceState !== "unavailable") this.D.priceState = "idle"; return; }
    if (this.D.serverKey === this.selectionKey() && this.D.serverQuote) {
      // Back on a selection the server already priced (an Undo, or a pick
      // re-made while another price was in flight): settle here.
      if (this.D.priceState === "pending") { this.D.priceState = "fresh"; this.renderSummary(); }
      return;
    }
    this.D.priceState = "pending";
    this._priceT = setTimeout(function () { self.fetchPrice(); }, 400);
  };

  P.fetchPrice = function () {
    var self = this;
    var key = this.selectionKey();
    this.D.priceState = "pending";
    this.renderSummary();
    var p = this.api("price", { method: "POST", body: this.selectionBody(), channel: "price" }).then(function (r) {
      if (r.stale || r.aborted) return null;
      if (key !== self.selectionKey()) return null;
      if (!r.ok || !r.data) { self.D.priceState = "error"; self.renderSummary(); return null; }
      var d = r.data;
      if (d.available === false) { self.setLane("quote", { reason: d.reason }); return null; }
      if (!d.quote) {
        self.D.unavailable = d.unavailable || { item: "tire", reason: "No longer in stock as a set of 4." };
        self.D.serverQuote = null; self.D.serverKey = "";
        self.D.priceState = "unavailable";
        self.render();
        return null;
      }
      self.D.unavailable = null;
      var local = self.localQuote();
      self.D.serverQuote = d.quote; self.D.serverKey = key; self.D.priceState = "fresh";
      self.D.priceNote = local && local.totalCents !== d.quote.totalCents ? "Updated to today's price." : "";
      (d.quote.changes || []).forEach(function (c) {
        if (c && c.what) self.pushLog(c.what + (c.to ? ": " + c.to : ""), null);
      });
      self._logged = false;
      track("pkg_price", { total: d.quote.totalCents, verdict: d.quote.verdict });
      self.renderSummary();
      self.renderFold(); self.renderSet();   // the package verdict (fit check) shows on the wheel too
      // Read the total again only when /price changed it (the local estimate was already read).
      self.announceTotal(true);
      return d.quote;
    });
    this._pricePromise = p;
    return p;
  };

  P.announceTotal = function (onlyIfNew) {
    var q = this.shownQuote();
    if (!q || (onlyIfNew && q.totalCents === this._annTotal)) return;
    this._annTotal = q.totalCents;
    this.announce("Package total " + moneyPhrase(q.totalCents) + " including GST.", false, "total");
  };

  // Road hazard protection covers only the brands the Protection Plan row lists
  // (bundle pricing.roadHazard.vendors; the server drops it otherwise).
  P.hazardVendors = function () {
    var rh = (this.D.bundle && this.D.bundle.pricing && this.D.bundle.pricing.roadHazard) || {};
    return rh.vendors || [];
  };
  P.hazardCovers = function (tire) {
    var vs = this.hazardVendors();
    if (!vs.length || !tire) return true;
    var b = String(tire.brand || "").toLowerCase();
    return vs.some(function (v) { return String(v).toLowerCase() === b; });
  };

  // Any selection change: URL, render, local price, server price.
  P.changed = function () {
    var S = this.S;
    if (S.rh) {
      var cur = this.currentObjects();
      if (cur.tire && !this.hazardCovers(cur.tire)) {
        S.rh = false;
        this.pushLog("Road hazard protection removed: it covers " + this.hazardVendors().join(", ") + " tires only.", this._lastSnap || null);
      }
    }
    if (!this._logged) this.staleUndo();
    this._logged = false;
    this._lastSnap = this.snapshot();
    this.writeUrl();
    this.render();
    this.announceTotal();
    this.schedulePrice();
    this.refreshWheelPrices();
  };

  // ══════════════════════════════════════════════════════════════════════
  // Lanes
  // ══════════════════════════════════════════════════════════════════════
  P.setLane = function (lane, info) {
    this.lane = lane;
    this.laneInfo = info || {};
    this.root.setAttribute("data-lane", lane);
    if (this._watchDock) this._watchDock();
    this.closeSheet();
    var boot = $("[data-ptpb-boot]", this.root);
    if (boot) boot.remove();
    if (lane === "builder") {
      this.laneEl.innerHTML =
        '<div class="ptpb__layout">' +
          '<div class="ptpb__main">' +
            '<section class="ptpb__block" id="ptpb-sec-wheel" aria-labelledby="ptpb-h-wheel">' +
              '<div class="ptpb__shead"><h2 id="ptpb-h-wheel" tabindex="-1">Find your wheels</h2><p>Answer any of these, in any order. Skip what you don’t mind.</p>' +
                '<button type="button" class="ptpb__linkbtn ptpb__jump-top" data-act="jump" data-key="top" data-r="jumptop"></button></div>' +
              '<div class="ptpb__fold" data-r="fold"></div>' +
              '<div class="ptpb__wopen" id="ptpb-wheel-list">' +
              '<div class="ptpb__keepw" data-r="keepwheel"></div>' +
              '<div data-r="focus"></div>' +
              '<div class="ptpb__finder">' +
                '<fieldset class="ptpb__q"><legend data-r="q-use-l">What’s this set for?</legend><div class="ptpb__tiles" data-r="q-use"></div></fieldset>' +
                '<fieldset class="ptpb__q" data-r-wrap="look"><legend>Look <small>Pick any</small></legend><div class="ptpb__swatches" data-r="q-look"></div></fieldset>' +
                '<fieldset class="ptpb__q"><legend data-r="q-size-l">Wheel size</legend><div class="ptpb__rims" data-r="q-size"></div><p class="ptpb__rimnote" data-r="q-size-note" hidden></p></fieldset>' +
                '<div class="ptpb__q ptpb__budget" data-r-wrap="budget" hidden>' +
                  '<label class="ptpb__qlab" for="ptpb-budget">Your budget <small>the whole package: 4 wheels + 4 tires, installed, incl. GST</small></label>' +
                  '<div class="ptpb__budget-row"><output class="ptpb__budget-val" id="ptpb-budget-out" for="ptpb-budget">No limit</output><span class="ptpb__budget-fit" id="ptpb-budget-fit"></span></div>' +
                  '<input type="range" class="ptpb__rng" id="ptpb-budget" min="0" max="100" step="50" value="100" aria-describedby="ptpb-budget-fit">' +
                  '<div class="ptpb__budget-ends" aria-hidden="true"><span id="ptpb-budget-min"></span><span>No limit</span></div>' +
                "</div>" +
                '<button type="button" class="ptpb__jump" data-act="jump" data-key="main" data-r="jump"></button>' +
                '<div class="ptpb__picks" data-r-wrap="picks"><div class="ptpb__picks-head"><b>Not sure? Start with our picks</b><span data-r="picks-note"></span></div>' +
                  '<fieldset class="ptpb__fs"><legend class="ptpb__vh">Our picks</legend><div class="ptpb__pickrow" data-r="picks"></div></fieldset></div>' +
              "</div>" +
              '<div class="ptpb__results-head" id="ptpb-results" tabindex="-1" data-r="results"></div>' +
              '<div data-r="wheels"></div>' +
              "</div>" +
            "</section>" +
            '<section class="ptpb__block" id="ptpb-sec-tire" aria-labelledby="ptpb-h-tire">' +
              '<div class="ptpb__shead"><h2 id="ptpb-h-tire" tabindex="-1">Now pick <span>tires</span> for these wheels</h2><p data-r="tirecount"></p></div>' +
              '<div data-r="tires"></div>' +
            "</section>" +
            '<section class="ptpb__block" id="ptpb-sec-needs" aria-labelledby="ptpb-h-needs"><div class="ptpb__shead"><h2 id="ptpb-h-needs">What else you need</h2><p>We picked these. Here’s why.</p></div><div data-r="needs"></div></section>' +
            '<section class="ptpb__block" aria-labelledby="ptpb-h-extras"><div class="ptpb__shead"><h2 id="ptpb-h-extras">Optional extras</h2></div><div data-r="extras"></div></section>' +
            '<section class="ptpb__block" aria-labelledby="ptpb-h-finish"><div class="ptpb__shead"><h2 id="ptpb-h-finish">Finish</h2></div><div data-r="finish"></div></section>' +
            '<p class="ptpb__fine">Prices are before GST unless marked “installed”. The installed total includes 5% GST. Many Alberta insurers offer a winter-tire discount; ask yours. Your Prince Tires invoice is your proof.</p>' +
          "</div>" +
          '<aside class="ptpb__summary" data-r="summary" aria-labelledby="ptpb-sum-title"></aside>' +
        "</div>";
      this.render();
    } else if (lane === "quote") {
      this.renderQuoteLane();
    } else if (lane === "error") {
      this.renderErrorLane();
    } else if (lane === "loading") {
      this.laneEl.innerHTML = '<div class="ptpb__state"><span class="ptpb__spin" aria-hidden="true"></span><p>Finding wheels and tires that fit…</p></div>';
    } else {
      var trimMsg = this.laneInfo.trim ? "Pick your trim above to see packages that fit." :
        "Pick your vehicle above. We'll show wheel and tire packages that fit it, priced installed.";
      this.laneEl.innerHTML = '<div class="ptpb__state ptpb__state--pick">' + this.focusTeaser() + "<p>" + esc(trimMsg) + "</p>" +
        '<p class="ptpb__pickq">Can’t find your vehicle, or want us to build it for you? <button type="button" class="ptpb__linkbtn" data-act="toquote">Request a quote</button></p></div>';
    }
    this.renderVehicleExtras();
  };

  // Before a vehicle is chosen, a ?wheel= link shows that wheel first.
  P.focusTeaser = function () {
    if (!this.S._focus) return "";
    return '<p class="ptpb__teaser">You picked a wheel. Tell us your vehicle and we’ll check it fits.</p>';
  };

  P.renderErrorLane = function () {
    var S = this.S, sh = this.shops[S.s] || this.shops.sw, other = this.shops[S.s === "ne" ? "sw" : "ne"];
    var r429 = this.laneInfo.status === 429;
    this.laneEl.innerHTML =
      '<div class="ptpb__state ptpb__state--error" role="alert">' +
        "<h2>" + (r429 ? "Too many tries — please wait a minute." : "We couldn’t load packages right now.") + "</h2>" +
        "<p>Call us and we’ll build your package over the phone.</p>" +
        '<div class="ptpb__btnrow">' +
          '<a class="ptpb__btn ptpb__btn--primary" href="tel:' + esc(sh.phoneHref) + '">' + ICON.phone + " Call " + esc(sh.name) + " · " + esc(sh.phone) + "</a>" +
          '<a class="ptpb__btn ptpb__btn--ghost" href="tel:' + esc(other.phoneHref) + '">' + esc(other.name) + " · " + esc(other.phone) + "</a>" +
          '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="retry">Try again</button>' +
        "</div>" +
      "</div>";
  };

  // ══════════════════════════════════════════════════════════════════════
  // Render (builder lane)
  // ══════════════════════════════════════════════════════════════════════
  P.r = function (name) { return $('[data-r="' + name + '"]', this.laneEl); };

  P.render = function () {
    if (this.lane !== "builder") { this.renderVehicleExtras(); return; }
    this.renderVehicleExtras();
    this.renderFocus();
    this.renderQuestions();
    this.renderBudget();
    this.renderPicks();
    var n = this.renderWheels();
    this.renderJump(n);
    this.renderFold();
    this.renderTires();
    this.renderNeeds();
    this.renderExtras();
    this.renderFinish();
    this.renderSummary();
    this.renderLog();
  };
  // Budget slider drags: everything that depends on the budget, nothing else
  // (the slider itself is updated in place, never re-rendered).
  P.renderBudgetDeps = function () {
    if (this.lane !== "builder") return;
    this.renderBudget();
    this.renderPicks();
    this.renderJump(this.renderWheels());
    this.renderFold();
    this.renderTires();
    this.renderSummary();
    this.renderLog();
  };

  P.renderVehicleExtras = function () {
    var S = this.S, b = this.D.bundle;
    // The shop control lives in the shell; keep it in step with S (Undo, URL).
    var shopEl = doc.getElementById("ptpb-shop-" + S.s);
    if (shopEl && !shopEl.checked) shopEl.checked = true;
    this.renderCard();
    var rfShops = b && b.pricing && b.pricing.roadForce ? b.pricing.roadForce.shops || [] : [];
    $all("[data-ptpb-rf]", this.app).forEach(function (el) { el.hidden = rfShops.indexOf(el.getAttribute("data-ptpb-rf")) === -1; });
    var vtf = $("[data-ptpb-vtfield]", this.app), vtSel = $("#ptpb-vt", this.app);
    if (b && b.vehicle && this.lane !== "pick") {
      vtf.hidden = false;
      var pickup = TRUCKISH.indexOf(b.suggestedVehicleType) !== -1;
      var vtKey = pickup ? "pickup" : "any";
      if (!vtSel.options.length || vtSel.getAttribute("data-k") !== vtKey) {
        // Our data says pickup: car / SUV / van types would under-price the
        // install and under-book the bay, so only pickup types are offered.
        vtSel.innerHTML = VEHICLE_TYPES.map(function (v) {
          var off = pickup && TRUCKISH.indexOf(v[0]) === -1 && v[0] !== "dually";
          return '<option value="' + v[0] + '"' + (off ? " disabled" : "") + ">" + esc(v[1]) + "</option>";
        }).join("");
        vtSel.setAttribute("data-k", vtKey);
      }
      vtSel.value = S.vt || b.suggestedVehicleType || "passenger";
      var sp = b.spec || {};
      var vspec = $("[data-ptpb-vspec]", this.app);
      var open = $("details", vspec) && $("details", vspec).open;
      var vh = '<details class="ptpb__tech"' + (open ? " open" : "") + '><summary>Tech specs</summary><div class="ptpb__techbody">' +
          (sp.bolt ? "<span>Bolt pattern <b>" + esc(sp.bolt.replace("x", "×")) + "</b></span>" : "") +
          (sp.hubBoreMm ? "<span>Hub <b>" + esc(sp.hubBoreMm) + " mm</b></span>" : "") +
          (sp.thread ? "<span>Lug thread <b>" + esc(sp.thread.replace("x", "×")) + "</b></span>" : "") +
          (sp.torqueNm ? "<span>Torque <b>" + esc(sp.torqueNm) + " Nm</b></span>" : "") +
        "</div></details>";
      this.paint(vspec, vh);
    } else {
      vtf.hidden = true;
      this.paint($("[data-ptpb-vspec]", this.app), "");
    }
    var lift = $("[data-ptpb-lift]", this.app);
    var showLift = b && b.vehicle && TRUCKISH.indexOf(S.vt) !== -1 && this.lane !== "pick";
    lift.hidden = !showLift;
    if (showLift) {
      var cur = S.lift || "stock";
      var html = '<fieldset class="ptpb__fs"><legend class="ptpb__lab">Truck height</legend><div class="ptpb__seg">' +
        [["stock", "Stock height"], ["levelled", "Levelled"], ["lifted", "Lifted"]].map(function (o) {
          return '<label class="ptpb__seg-opt"><input type="radio" name="ptpb-lift" id="ptpb-lift-' + o[0] + '" value="' + o[0] + '"' + (cur === o[0] ? " checked" : "") + "><span>" + o[1] + "</span></label>";
        }).join("") + "</div>" +
        (cur === "lifted" ? '<label class="ptpb__inline" for="ptpb-li">Lift height (inches) <input id="ptpb-li" type="number" inputmode="decimal" min="0" max="12" step="0.5" value="' + esc(S.li || "") + '"></label>' : "") +
        "</fieldset>";
      if (lift.getAttribute("data-k") !== cur + "|" + (S.li || "")) {
        this.paint(lift, html);
        lift.setAttribute("data-k", cur + "|" + (S.li || ""));
      }
    }
  };

  P.vehicleModel = function () { var b = this.D.bundle; return b && b.vehicle ? b.vehicle.model : (this.S.md || "vehicle"); };

  P.renderFocus = function () {
    var el = this.r("focus");
    var d = this.D.wheels, S = this.S;
    var html = "";
    var model = this.vehicleModel();
    if (d && d.focus && d.focus.wheel && (d.focus.verdict === "blocked" || d.focus.verdict === "excluded")) {
      var f = d.focus;
      var why = (f.reasons || []).map(function (r) { return "<li>" + esc(r.reason) + "</li>"; }).join("");
      html = '<div class="ptpb__alert ptpb__alert--bad" role="group" aria-labelledby="ptpb-focus-h">' +
        (f.wheel.img ? '<img src="' + esc(f.wheel.img) + '" alt="" width="64" height="64" loading="lazy">' : "") +
        '<div><h3 id="ptpb-focus-h">' + ICON.no + " This wheel doesn’t fit your " + esc(model) + "</h3>" +
        "<p>" + esc(f.wheel.title) + "</p>" + (why ? "<ul>" + why + "</ul>" : "") +
        "<p>Here are wheels that do fit.</p></div></div>";
    } else if (d && d.focus && d.focus.verdict === "not_found") {
      html = '<div class="ptpb__alert ptpb__alert--warn"><p>We couldn’t find that wheel any more. Here are wheels that fit your vehicle.</p></div>';
    }
    if (d && d.brandEmpty) {
      html += '<div class="ptpb__alert ptpb__alert--warn" role="group"><p>No ' + esc(S.brand) + " wheels fit your " + esc(model) + ' right now.</p><button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="allbrands">Show all brands</button></div>';
    } else if (S.brand && d) {
      html += '<p class="ptpb__chipnote">Showing ' + esc(S.brand) + ' wheels only. <button type="button" class="ptpb__linkbtn" data-act="allbrands">Show all brands</button></p>';
    }
    this.paint(el, html);
  };

  function chip(name, id, value, checked, disabled, b, small, extra) {
    return '<label class="ptpb__chip"><input type="radio" name="' + name + '" id="' + id + '" value="' + esc(value) + '"' +
      (checked ? " checked" : "") + (disabled ? " disabled" : "") + (extra || "") + "><b>" + b + "</b>" + (small ? "<small>" + small + "</small>" : "") + "</label>";
  }

  // "What's this set for?" (2×2 icon tiles) / Look (finish swatches) / Wheel
  // size (rim rings that grow with the size): answered in any order; each
  // count is the wheels that fit AND match the other answers. Every option is
  // a real radio inside its label, so arrows, Space and screen readers work.
  P.renderQuestions = function () {
    var self = this, S = this.S, truck = TRUCKISH.indexOf(S.vt) !== -1, model = this.vehicleModel();
    this.paint(this.r("q-use"), PACKAGE_TYPES.map(function (t) {
      var dis = t.truckOnly && !truck, on = S.pt === t.id;
      return '<label class="ptpb__tile' + (dis ? " is-off" : "") + '"><input type="radio" name="ptpb-pt" id="ptpb-pt-' + t.id + '" value="' + t.id + '"' + (on ? " checked" : "") + (dis ? " disabled" : "") + ">" +
        '<span class="ptpb__tile-ic">' + ICON[t.icon] + '</span><span class="ptpb__tile-ck" aria-hidden="true">' + ICON.ok + "</span>" +
        "<b>" + esc(t.chip) + "</b><small>" + (dis ? "For pickup trucks — your " + esc(model) + " isn’t one" : esc(t.sub)) + "</small></label>";
    }).join(""));
    var dType = truck ? "truck" : "winter";
    var dChip = PACKAGE_TYPES.filter(function (t) { return t.id === dType; })[0];
    this.paint(this.r("q-use-l"), "What’s this set for?" + (S._ptDefault && S.pt === dType ? " <small>Set to " + esc(dChip.chip.toLowerCase()) + " to start. Change it any time.</small>" : ""));

    var ok = this.okWheels();
    var bySize = ok.filter(function (w) { return self.sizeMatch(w, S.ws); });
    var byLook = ok.filter(function (w) { return self.lookMatch(w, S.lk); });
    // Looks with no wheel for this vehicle at all are left out, so the row stays short.
    var looks = LOOKS.filter(function (L) { return L.id === "any" || S.lk === L.id || ok.some(function (w) { return self.lookMatch(w, L.id); }); });
    this.paint(this.r("q-look"), looks.map(function (L) {
      var nAll = L.id === "any" ? ok.length : ok.filter(function (w) { return self.lookMatch(w, L.id); }).length;
      var n = L.id === "any" ? bySize.length : bySize.filter(function (w) { return self.lookMatch(w, L.id); }).length;
      var dis = !nAll && S.lk !== L.id;
      return '<label class="ptpb__sw"><input type="radio" name="ptpb-lk" id="ptpb-lk-' + L.id + '" value="' + L.id + '"' + (S.lk === L.id ? " checked" : "") + (dis ? " disabled" : "") +
        ' aria-label="' + esc(L.label + ", " + (nAll ? n + " match" : "none for your " + model)) + '">' +
        '<i class="ptpb__sw-dot ptpb__sw--' + L.id + '" aria-hidden="true">' + (L.id === "any" ? "Any" : "") + "</i>" +
        '<b aria-hidden="true">' + esc(L.short) + '</b><small aria-hidden="true">' + (nAll ? n : "none") + "</small></label>";
    }).join(""));
    var wrapLook = $('[data-r-wrap="look"]', this.laneEl);
    if (wrapLook) wrapLook.hidden = looks.length <= 1;

    var T = this.sizeTargets();
    var opts = [{ id: "any", b: "Any", cap: "any" }, { id: "oe", b: "Factory size", d: T.oe, cap: "factory" }, { id: "plus1", b: "A bit bigger", d: T.plus1, cap: "+1" }];
    if (T.max > T.plus1) opts.push({ id: "max", b: "Biggest that fits", d: T.max, cap: "+" + (T.max - T.oe) });
    // Smaller wheels are a winter idea (more sidewall, cheaper tires); offered
    // only where the brake rule allows (the server leaves the others out). A
    // ruled-out size stays on screen, crossed out, with the reason as text.
    if (S.pt === "winter" || S.ws === "minus") {
      if (T.minusOK) opts.splice(1, 0, { id: "minus", b: "Smaller for winter", dl: T.minusLabel, d: T.oe - 1, cap: "smaller" });
      else if (T.minusReason) opts.splice(1, 0, { id: "minus", b: "Smaller for winter", d: T.minusBlockedIn || T.oe - 1, cap: "won’t fit", reason: T.minusReason });
    }
    var sized = opts.filter(function (o) { return o.d; }), dMin = Math.min.apply(null, sized.map(function (o) { return o.d; }));
    var ring = function (o) { return (4.4 + Math.min(4, Math.max(0, o.d - dMin)) * 0.7).toFixed(1) + "rem"; };
    var note = "";
    this.paint(this.r("q-size"), opts.map(function (o) {
      var face = o.id === "any" ? "Any" : (o.dl || o.d + "″");
      if (o.reason) {
        note = (o.d) + "″ is out: " + o.reason;
        return '<label class="ptpb__rim is-off" style="--ring:' + ring(o) + '"><input type="radio" name="ptpb-ws" id="ptpb-ws-minus" value="minus" disabled aria-label="' + esc(o.b) + ', won’t fit" aria-describedby="ptpb-ws-minus-r">' +
          '<i aria-hidden="true">' + esc(face) + '</i><small aria-hidden="true">' + esc(o.cap) + "</small></label>";
      }
      var nAll = o.id === "any" ? ok.length : ok.filter(function (w) { return self.sizeMatch(w, o.id); }).length;
      var n = o.id === "any" ? byLook.length : byLook.filter(function (w) { return self.sizeMatch(w, o.id); }).length;
      var dis = !nAll && S.ws !== o.id;
      return '<label class="ptpb__rim' + (o.id === "oe" ? " is-fac" : "") + (o.id === "any" ? " is-any" : "") + (dis ? " is-off" : "") + '" style="--ring:' + (o.id === "any" ? "4.4rem" : ring(o)) + '">' +
        '<input type="radio" name="ptpb-ws" id="ptpb-ws-' + o.id + '" value="' + o.id + '"' + (S.ws === o.id ? " checked" : "") + (dis ? " disabled" : "") +
        ' aria-label="' + esc(o.b + (o.d ? ", " + face : "") + ", " + (nAll ? n + " match" : "none fit")) + '">' +
        '<i aria-hidden="true">' + esc(face) + '</i><small aria-hidden="true">' + esc(o.cap) + " · " + (nAll ? n : 0) + "</small></label>";
    }).join(""));
    var nt = this.r("q-size-note");
    if (nt) { nt.hidden = !note; nt.id = note ? "ptpb-ws-minus-r" : ""; if (nt.textContent !== note) nt.textContent = note; }
    var tr = S.tr || (this.D.bundle && this.D.bundle.vehicle && this.D.bundle.vehicle.trim) || "";
    this.paint(this.r("q-size-l"), "Wheel size <small>your " + esc(tr || model) + " came on " + T.oe + "″</small>");
  };

  // Budget slider: updated in place (never re-rendered) so dragging and focus
  // are never interrupted.
  P.renderBudget = function () {
    var wrap = $('[data-r-wrap="budget"]', this.laneEl), el = doc.getElementById("ptpb-budget");
    if (!wrap || !el) return;
    var r = this.budgetRange();
    wrap.hidden = !r;
    if (!r) return;
    var b = this.bud(), val = b == null ? r.max : b;
    var lo = b != null ? Math.min(r.min, b) : r.min;   // keep a budget they set even if prices moved under it
    if (+el.min !== lo) el.min = lo;
    if (+el.max !== r.max) el.max = r.max;
    if (+el.value !== val) el.value = val;
    el.style.setProperty("--pct", ((val - lo) / Math.max(1, r.max - lo) * 100).toFixed(1) + "%");
    var dl = commas(val);
    doc.getElementById("ptpb-budget-out").textContent = b == null ? "No limit" : "Up to $" + dl;
    el.setAttribute("aria-valuetext", b == null ? "No limit" : "Up to " + dl + " dollars");
    doc.getElementById("ptpb-budget-min").textContent = "$" + commas(lo);
    var self = this;
    var n = this.okWheels().filter(function (w) { return self.matches(w) && self.wheelBudget(w) === 0; }).length;
    var fit = doc.getElementById("ptpb-budget-fit");
    var m = this.okWheels().filter(function (w) { return self.matches(w); }).length;
    var fh = b == null ? "Packages from <b>" + moneyWhole(r.lo) + "</b>" : "<b>" + n + "</b> of " + m + " wheel" + (m === 1 ? "" : "s") + " fit" + (n === 1 && m === 1 ? "s" : "") + " your budget";
    if (fit.innerHTML !== fh) fit.innerHTML = fh;
  };

  // Phone: a live "See 7 wheels" jump right under the questions.
  P.renderJump = function (n) {
    var self = this, b = this.bud();
    var inb = b == null ? n : this.okWheels().filter(function (w) { return self.matches(w) && self.wheelBudget(w) === 0; }).length;
    this.paint(this.r("jump"), (n ? "See " + plural(n, "wheel") + (b != null ? " (" + inb + " in budget)" : "") : "See the wheels") + ' <span aria-hidden="true">↓</span>');
    this.paint(this.r("jumptop"), (n ? "Skip to the " + plural(n, "wheel") : "Skip to the wheels") + ' <span aria-hidden="true">↓</span>');
  };

  // "Not sure? Start with our picks": the server's Good / Better / Best, a
  // shortcut secondary to the questions. Totals follow the customer's options.
  P.renderPicks = function () {
    var d = this.D.wheels, S = this.S, self = this;
    var wrap = $('[data-r-wrap="picks"]', this.laneEl);
    var ps = (d && d.presets) || [];
    // When two picks are the same package, show it once (Better wins).
    var get = function (t) { return ps.filter(function (x) { return x.tier === t; })[0]; };
    var same = function (a, b) { return a && b && a.wheelId === b.wheelId && a.tireId === b.tireId; };
    var show = ["good", "better", "best"].filter(function (t) {
      var p = get(t);
      if (!p) return false;
      if (t === "good") return !same(p, get("better"));
      if (t === "best") return !same(p, get("better")) && !same(p, get("good"));
      return true;
    });
    if (wrap) wrap.hidden = !show.length;
    if (!show.length) { this.paint(this.r("picks"), ""); return; }
    var names = PRESET_NAMES[S.pt] || PRESET_NAMES.winter;
    this.paint(this.r("picks"), show.map(function (tier) {
      var p = get(tier);
      var w = self.wheelById(p.wheelId) || {};
      var tl = ((p.quote || {}).lines || []).filter(function (l) { return l.key === "tire"; })[0];
      var tHit = self.tireById(p.tireId, p.wheelId);
      var tname = tHit ? tireName(tHit.tire) : (tl ? String(tl.label || "").replace(/^Tires:\s*/, "") : p.size);
      var tot = self.presetTotal(p, w, tHit ? tHit.tire : null);
      var over = !self.inBudget(tot);
      var label = tier === "better" ? names.better : (tier === "good" ? "Good" : "Best") + " · " + names[tier];
      return '<label class="ptpb__pick' + (p.recommended || tier === "better" ? " ptpb__pick--rec" : "") + (over ? " is-over" : "") + '">' +
        '<input type="radio" name="ptpb-preset" id="ptpb-preset-' + tier + '" value="' + tier + '"' + (self.presetOn(p) ? " checked" : "") + ">" +
        (w.img ? '<img src="' + esc(w.img) + '" alt="" width="44" height="44" loading="lazy">' : '<span class="ptpb__noimg"></span>') +
        '<span class="ptpb__pk-t">' + esc(label) + "</span>" +
        '<span class="ptpb__pk-n">' + esc((w.d ? w.d + "″ " : "") + wheelName(w) + " · " + tname) + "</span>" +
        '<span class="ptpb__pk-p">' + (tot ? moneyWhole(tot) : "") + " <small>" + (over ? '<span class="ptpb__pk-over">' + self.overText(tot) + " over budget</span>" : "installed, incl. GST") + "</small></span>" +
        "</label>";
    }).join(""));
    this.paint(this.r("picks-note"), (this.answered() ? "Built for your vehicle. Change anything after." : "A complete package in one tap. Change anything after.") +
      (show.length < 3 && ps.length >= 3 ? " Picks that came out the same are shown once." : ""));
  };

  // A pick card's total WITH the customer's current choices (TPMS, road force,
  // road hazard, shop): the server's preset quote (default TPMS, no extras) plus
  // the difference the pricer sees between the two option sets.
  P.presetTotal = function (p, w, t) {
    var q = p.quote || {}, b = this.D.bundle, S = this.S;
    if (!q.totalCents || !b || !b.pricing) return q.totalCents || 0;
    var tireLine = (q.lines || []).filter(function (l) { return l.key === "tire"; })[0] || {};
    var vendors = this.hazardVendors();
    var tire = t || { title: tireLine.label, priceCents: tireLine.unitCents || 0,
      brand: vendors.filter(function (v) { return String(tireLine.label || "").toLowerCase().indexOf(String(v).toLowerCase()) !== -1; })[0] || "" };
    var wheel = (w && w.id) ? w : { priceCents: ((q.lines || []).filter(function (l) { return l.key === "wheel"; })[0] || {}).unitCents || 0, acc: {} };
    var tp = b.tpms || {};
    var base = { shop: S.s, vehicleType: S.vt, suggestedVehicleType: b.suggestedVehicleType, model: S.md, wheel: wheel, tire: tire, tpms: tp.default || "new",
      tpmsType: tp.type, tpmsLocked: !!tp.locked, options: { roadForce: false, roadHazard: false } };
    var cur = {}; for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) cur[k] = base[k];
    cur.tpms = S.tp || base.tpms;
    cur.options = { roadForce: !!S.rf, roadHazard: !!S.rh && this.hazardCovers(tire) };
    return q.totalCents + (compute(b.pricing, cur).totalCents - compute(b.pricing, base).totalCents);
  };

  function verdictBadge(v, shopName) {
    if (v === "fits") return '<span class="ptpb__badge ptpb__badge--ok">' + ICON.ok + " Fits</span>";
    if (v === "fits_warn") return '<span class="ptpb__badge ptpb__badge--ok">' + ICON.ok + " Fits · see note</span>";
    if (v === "fit_check") return '<span class="ptpb__badge ptpb__badge--review">' + ICON.check + " <span>Fit check by the " + esc(shopName || "shop") + " manager</span></span>";
    return "";
  }

  P.renderWheels = function () {
    var self = this, S = this.S, d = this.D.wheels;
    var shop = this.shops[S.s] || this.shops.sw;
    var mo = this.r("wheels") && $("#ptpb-more-wheels", this.r("wheels")); if (mo) this._moreOpen = mo.open;
    var oo = this.r("wheels") && $("#ptpb-off-wheels", this.r("wheels")); if (oo) this._offOpen = oo.open;
    var R = this.rankWheels(), ans = this.answered(), b = this.bud(), model = this.vehicleModel();
    var inb = R.match.filter(function (w) { return R.ib(w) === 0; }), ovr = R.match.filter(function (w) { return R.ib(w) === 1; });
    // No complete package online (no tire makes one at this shop): never counted
    // or labelled as "in budget". With a budget they get their own group, dimmed.
    var unp = b != null ? R.match.filter(function (w) { return R.ib(w) === 2; }) : [];
    if (b == null) inb = R.match;
    // A 2-up photo card: an orange "Packages from" price sticker, the rim-size
    // puck and the fit badge on the photo; the whole card is the radio label,
    // with a visible "Choose" (→ "Selected") and "See it on my car" under it.
    // The photo rolls in only the first time a wheel appears (for this vehicle),
    // not on every repaint a budget step, look or size change causes.
    var now = Date.now(), seen = this._seenW || (this._seenW = {});
    var fresh = function (id) { if (seen[id] == null) seen[id] = now; return now - seen[id] < 700; };
    var card = function (w) {
      var on = S.w === w.id, from = self.pkgFrom(w), over = R.ib(w) === 1, unpriced = from == null;
      // List re-opened with this wheel picked: the way back to the tires sits on the card.
      var keep = on && self.expanded && !self.wheelGone();
      var rb = (w.readyBy || {})[S.s];
      var body = "";
      if (over) body += '<span class="ptpb__overtxt">' + ICON.warn + "<span>" + self.overText(from) + " over your budget</span></span>";
      else if (unpriced) body += '<span class="ptpb__overtxt ptpb__unpriced">' + ICON.warn + "<span>No online package price — call us</span></span>";
      if (!self.matches(w)) body += '<span class="ptpb__wavail">Your current pick (not in your answers)</span>';
      else if (ans && !over && (!unpriced || S.lk !== "any" || S.ws !== "any")) body += '<span class="ptpb__wmatch">' + ICON.ok + "<span>" + esc(self.matchText(w)) + "</span></span>";
      if (R.takes(w)) body += '<span class="ptpb__wmatch">' + ICON.ok + "<span>Takes your " + esc(tireName(R.kept)) + "</span></span>";
      body += '<span class="ptpb__wavail">' + ICON.clock + " " + esc(((w.stock && w.stock.label) ? w.stock.label + " · " : "") + "Earliest " + readyDay(rb)) + "</span>";
      var sticker = from != null ? '<span class="ptpb__wpkg ptpb__sticker' + (over ? " is-over" : "") + '"><small>Packages from</small> <b>' + moneyWhole(from) + "</b></span>" : "";
      return '<div class="ptpb__wcard' + (on ? " is-on" : "") + (over || (unpriced && b != null) ? " is-over" : "") + '"><label>' +
        '<input type="radio" name="ptpb-wheel" id="ptpb-w-' + esc(w.variantId || w.id) + '" value="' + esc(w.id) + '"' + (on ? " checked" : "") + ">" +
        '<span class="ptpb__wph">' + (w.img ? '<img' + (fresh(w.id) ? ' class="is-new"' : "") + ' src="' + esc(imgW(w.img, 400)) + '" alt="" width="200" height="200" loading="lazy">' : '<span class="ptpb__noimg"></span>') +
          sticker + '<span class="ptpb__dia" aria-hidden="true">' + esc(w.d + "″") + "</span>" +
          '<span class="ptpb__wfit">' + (w.verdict === "fit_check" ? "" : verdictBadge(w.verdict, shop.name)) + "</span></span>" +
        '<span class="ptpb__wbd">' +
          (w.brand ? '<span class="ptpb__wbr">' + esc(w.brand) + "</span> " : "") +
          '<span class="ptpb__wname">' + esc(wheelShow(w)) + "</span>" +
          '<span class="ptpb__wfin">' + esc(w.finish || "") + "</span>" +
          '<span class="ptpb__wspec">' + esc(w.d + "″ × " + w.w + "″ wide" + (w.et != null ? " · ET" + (w.et > 0 ? "+" : "") + w.et : "") + (w.material === "steel" ? " · steel" : "")) + "</span>" +
          '<span class="ptpb__wprice"><b>' + money(w.priceCents) + "</b><span>each · " + moneyWhole(w.setCents || w.priceCents * 4) + " for 4</span></span>" +
          (w.verdict === "fit_check" ? verdictBadge(w.verdict, shop.name) : "") +
          body +
          '<span class="ptpb__choose" aria-hidden="true"><span class="ptpb__choose-off">Choose</span><span class="ptpb__choose-on">' + ICON.ok + " Selected</span></span>" +
        "</span></label>" +
        // Phones: "Choose" moves down beside "See it" so a card stays about
        // 300 px tall and two rows fit. A pointer shortcut for the card's own
        // radio (the radio stays the one keyboard / screen-reader control).
        '<div class="ptpb__wfoot' + (w.img ? "" : " ptpb__wfoot--pick") + '"><span class="ptpb__wpick" data-act="pickw" data-id="' + esc(w.id) + '" aria-hidden="true">' +
          '<span class="ptpb__wpick-off">Choose</span><span class="ptpb__wpick-on">' + ICON.ok + " Selected</span></span>" +
          (w.img ? '<button type="button" data-act="vizcar" data-id="' + esc(w.id) + '">' + ICON.car + ' <span>See it</span><span class="ptpb__wsee-r"> on my ' + esc(model) + "</span></button>" : "") + "</div>" +
        (keep ? '<div class="ptpb__wfoot ptpb__wkeep"><button type="button" data-act="fold" data-key="card" aria-expanded="true" aria-controls="ptpb-wheel-list">Keep this wheel, show tires <span aria-hidden="true">↓</span></button></div>' : "") +
        "</div>";
    };
    var html = "";
    var gone = this.D.unavailable && this.D.unavailable.item === "wheel" && this.D.priceState === "unavailable";
    if (gone) html += '<div class="ptpb__alert ptpb__alert--bad" role="alert"><p>' + ICON.warn + " " + esc(this.D.unavailable.reason || "This wheel isn’t available any more.") + " Pick another wheel below.</p></div>";
    if (!R.ok.length) {
      html += d && !d.brandEmpty ? '<div class="ptpb__empty"><p>No wheels fit your ' + esc(model) + ' for this package right now. Try another answer above, or <button type="button" class="ptpb__linkbtn" data-act="toquote">send us a quote request</button>.</p></div>' : "";
    } else if (!R.match.length) {
      html += '<div class="ptpb__empty"><p>No wheels match all your answers for your ' + esc(model) + ". Loosen one:</p><div class=\"ptpb__btnrow\">" +
        (S.lk !== "any" ? '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="clear" data-key="lk">Any look</button>' : "") +
        (S.ws !== "any" ? '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="clear" data-key="ws">Any size</button>' : "") + "</div></div>";
    } else {
      if (inb.length) html += '<div class="ptpb__wgrid">' + inb.map(card).join("") + "</div>";
      else if (!ovr.length) html += '<div class="ptpb__empty"><p>None of the matching wheels has a complete package price online. Call us and we’ll quote one.</p></div>';
      else html += '<div class="ptpb__empty"><p>Every matching wheel is over your budget. The closest is shown first; move the budget slider up to see more.</p></div>';
      if (ovr.length) html += '<p class="ptpb__subhead">Over your budget (' + ovr.length + ')</p><div class="ptpb__wgrid">' + ovr.map(card).join("") + "</div>";
      if (unp.length) html += '<p class="ptpb__subhead">No complete package online — ask us (' + unp.length + ')</p><div class="ptpb__wgrid">' + unp.map(card).join("") + "</div>";
    }
    if (R.rest.length) html += '<details class="ptpb__more" id="ptpb-more-wheels"' + (this._moreOpen ? " open" : "") + "><summary>" + plural(R.rest.length, "more wheel") + " fit" + (R.rest.length === 1 ? "s" : "") + " but " + (R.rest.length === 1 ? "doesn’t" : "don’t") + " match your answers</summary><div class=\"ptpb__wgrid\">" + R.rest.map(card).join("") + "</div></details>";
    // Sizes the server ruled out stay visible with the reason, folded away.
    var off = ((d && d.diameters) || []).filter(function (c) { return c.enabled === false && c.reason; });
    if (off.length) html += '<details class="ptpb__more" id="ptpb-off-wheels"' + (this._offOpen ? " open" : "") + "><summary>Wheel sizes that don’t fit your " + esc(model) + " — see why</summary><ul class=\"ptpb__offlist\">" +
      off.map(function (c) { return '<li><span class="ptpb__why-off">' + ICON.no + "<span><b>" + esc(c.in + "″") + "</b>: " + esc(c.reason) + "</span></span></li>"; }).join("") + "</ul></details>";
    this.paint(this.r("wheels"), html);
    // Results head: the honest fit count (a fit-check wheel never counts as "fits").
    var nMatch = R.ok.filter(function (w) { return self.matches(w); }).length;
    var head = '<b data-r="wheelcount">' + esc(this.wheelCountText(R.ok)) + "</b>";
    if (ans) head += '<span class="ptpb__results-sub">' + esc(plural(nMatch, "wheel") + " match" + (nMatch === 1 ? "es" : "") + " your answers" + (b != null ? " · " + inb.length + " within budget" : "")) + "</span>" +
      '<button type="button" class="ptpb__linkbtn" data-act="reset-answers">Clear answers</button>';
    this.paint(this.r("results"), head);
    return nMatch;
  };

  // "12 wheels for your 2020 RAV4 LE · 3 fit as listed, 9 need a quick
  // fit check": a fit-check wheel is never counted as one that fits.
  P.wheelCountText = function (ws) {
    if (!ws.length) return "";
    var b = this.D.bundle, S = this.S;
    var v = b && b.vehicle ? [b.vehicle.year, b.vehicle.model, S.tr].filter(Boolean).join(" ") : [S.y, S.md, S.tr].filter(Boolean).join(" ") || "vehicle";
    var check = ws.filter(function (w) { return w.verdict === "fit_check"; }).length;
    var fit = ws.length - check;
    var n = function (x, one, many) { return x + " " + (x === 1 ? one : many); };
    if (!check) return n(ws.length, "wheel fits", "wheels fit") + " your " + v + ".";
    if (!fit) return n(ws.length, "wheel", "wheels") + " for your " + v + " · each gets a quick fit check by our staff.";
    return n(ws.length, "wheel", "wheels") + " for your " + v + " · " + fit + " fit" + (fit === 1 ? "s" : "") + " as listed, " + check + " need" + (check === 1 ? "s" : "") + " a quick fit check by our staff.";
  };

  // ── Folded wheel section: the answers in one line + the "Your wheel" row ──
  P.answersLine = function () {
    var self = this, S = this.S, T = this.sizeTargets();
    var pt = PACKAGE_TYPES.filter(function (x) { return x.id === S.pt; })[0];
    var lk = LOOKS.filter(function (x) { return x.id === S.lk; })[0];
    var sz = { oe: "Factory size " + T.oe + "″", plus1: "A bit bigger " + T.plus1 + "″", max: "Biggest " + T.max + "″", minus: "Smaller " + (T.minusLabel || "") }[S.ws];
    var b = this.bud();
    var n = this.okWheels().filter(function (w) { return self.matches(w); }).length;
    return [pt ? pt.chip : "", S.lk !== "any" && lk ? lk.label : "Any look", sz || "Any size",
      b != null ? "Up to $" + commas(b) : "No budget limit", plural(n, "wheel") + " match" + (n === 1 ? "es" : "")].filter(Boolean).join(" · ");
  };
  // The badge next to the picked wheel: the package's fit check once it is
  // known (never a green "Fits" beside a summary that says "Fit check").
  P.setVerdict = function (w) {
    var q = this.shownQuote();
    return q && q.verdict === "fit_check" ? "fit_check" : w.verdict;
  };
  P.renderFold = function () {
    var sec = doc.getElementById("ptpb-sec-wheel");
    if (!sec) return;
    var S = this.S, f = this.folded(), w = this.wheelById(S.w);
    sec.classList.toggle("is-folded", f);
    var list = doc.getElementById("ptpb-wheel-list");
    if (list && list.hidden !== f) list.hidden = f;
    var h = doc.getElementById("ptpb-h-wheel"), ht = f ? "Your wheels" : "Find your wheels";
    if (h && h.textContent !== ht) h.textContent = ht;
    // Open with a wheel picked (after Change wheel / Edit answers): a way back
    // to the tires without re-picking.
    this.paint(this.r("keepwheel"), !f && w && !this.wheelGone() ? '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="fold" aria-expanded="true" aria-controls="ptpb-wheel-list">' +
      "Keep " + esc(wheelName(w) + " " + w.d + "″") + " and show tires " + '<span aria-hidden="true">↓</span></button>' : "");
    if (!f) { this.paint(this.r("fold"), ""); return; }
    var shop = this.shops[S.s] || this.shops.sw;
    var set = w.setCents || w.priceCents * 4;
    var html = '<div class="ptpb__answers"><p><span class="ptpb__vh">Your answers: </span>' + esc(this.answersLine()) + "</p>" +
        '<button type="button" class="ptpb__linkbtn" data-act="expand" aria-expanded="false" aria-controls="ptpb-wheel-list">Edit answers</button></div>' +
      '<div class="ptpb__wrow" role="group" aria-label="Your wheel">' +
        '<span class="ptpb__wrow-th">' + (w.img ? '<img src="' + esc(imgW(w.img, 240)) + '" alt="" width="96" height="96" loading="lazy">' : '<span class="ptpb__noimg"></span>') +
          '<i aria-hidden="true">' + ICON.ok + "</i></span>" +
        '<div class="ptpb__wrow-main">' +
          '<span class="ptpb__wrow-eb">Your wheel</span>' +
          '<b class="ptpb__wname">' + esc(wheelName(w)) + "</b>" +
          '<span class="ptpb__wspec">' + esc((w.finish ? w.finish + " · " : "") + w.d + "″ × " + w.w + "″" + (w.et != null ? " · ET" + (w.et > 0 ? "+" : "") + w.et : "")) + "</span>" +
          '<span class="ptpb__wprice"><b>' + money(w.priceCents) + "</b><span>each · " + moneyWhole(set) + " for 4</span></span>" +
          verdictBadge(this.setVerdict(w), shop.name) +
        "</div>" +
        '<div class="ptpb__wrow-acts">' +
          (w.img ? '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="vizcar" data-id="' + esc(w.id) + '">' + ICON.car + " See it on my car</button>" : "") +
          '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="change-wheel" data-key="row" aria-expanded="false" aria-controls="ptpb-wheel-list">Change wheel</button>' +
        "</div>" +
      "</div>";
    this.paint(this.r("fold"), html);
  };

  // ── "Your set" + visualizer ─────────────────────────────────────────────
  P.vizKey = function (w) {
    var b = this.D.bundle;
    if (!w || !b || !b.vehicle || !w.img) return null;
    return [b.vehicle.year, b.vehicle.make, b.vehicle.model, this.rimUrl(w)].join("|");
  };
  P.rimUrl = function (w) { var rim = String((w && w.img) || ""); return rim.indexOf("//") === 0 ? "https:" + rim : rim; };

  // The stage: a loading state, the render, or the wheel photo + "Preview unavailable".
  P.vizStage = function (w) {
    var b = this.D.bundle, key = this.vizKey(w), v = key ? this.vizCache[key] : null;
    var vname = b && b.vehicle ? b.vehicle.year + " " + b.vehicle.make + " " + b.vehicle.model : "your vehicle";
    if (!v || v.state === "loading") {
      return '<div class="ptpb__stage is-loading" aria-busy="true"><span class="ptpb__spin" aria-hidden="true"></span><p>Putting these wheels on a ' + esc(vname) + "…</p></div>";
    }
    if (v.state === "ok") {
      return '<figure class="ptpb__stage"><img src="' + esc(v.img) + '" alt="' + esc("Preview: a " + vname + " with " + w.d + "-inch " + (w.finish || "") + " " + wheelName(w) + " wheels") + '">' +
        '<figcaption class="ptpb__fine">A computer preview of a ' + esc(vname) + ". Colour and stance on your vehicle may differ.</figcaption></figure>";
    }
    return '<div class="ptpb__stage is-fallback">' + (w.img ? '<img src="' + esc(w.img) + '" alt="' + esc(w.d + "-inch " + wheelName(w) + " wheel in " + (w.finish || "") + ", product photo") + '">' : "") +
      '<p class="ptpb__stamp" role="status">' + esc(v.state === "none" ? "Preview unavailable for your " + vname + ". Here’s the wheel on its own." : "Preview unavailable right now. Here’s the wheel on its own — try again in a minute.") + "</p></div>";
  };

  // Render ONLY on click. Cached per vehicle + wheel image for the page's life
  // only when the answer is a FACT about the vehicle (reason "no_template" or
  // "unknown_vehicle"). The shared daily cap ("capped"), an empty render
  // ("render_failed"), any other null, a 429 or a network error is temporary:
  // "Preview unavailable right now", retried on the next click after a minute.
  // The app route Redis-caches 30 days and is IP-limited.
  P.loadViz = function (w) {
    var self = this, key = this.vizKey(w), b = this.D.bundle;
    if (!key) return Promise.resolve(null);
    var v = this.vizCache[key];
    if (v && (v.state === "ok" || v.state === "none" || v.state === "loading")) return v.promise || Promise.resolve(v);
    if (v && (v.state === "busy" || v.state === "error") && Date.now() - v.at < 60000) return Promise.resolve(v);
    var url = this.apiBase + "/api/configurator/render?year=" + encodeURIComponent(b.vehicle.year) + "&make=" + encodeURIComponent(b.vehicle.make) +
      "&model=" + encodeURIComponent(b.vehicle.model) + "&rim=" + encodeURIComponent(this.rimUrl(w));
    var ent = { state: "loading", at: Date.now() };
    this.vizCache[key] = ent;
    track("pkg_viz", { wheel: w.id });
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    ent.promise = root.fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
      clearTimeout(timer);
      if (r.status === 429) return { state: "busy" };
      if (!r.ok) return { state: "error" };
      return r.json().then(function (d) {
        if (d && d.image) return { state: "ok", img: d.image };
        var why = d && d.reason;
        return why === "no_template" || why === "unknown_vehicle" ? { state: "none" } : { state: why === "capped" ? "busy" : "error" };
      }, function () { return { state: "error" }; });
    }, function () { clearTimeout(timer); return { state: "error" }; }).then(function (res) {
      res.at = Date.now();
      self.vizCache[key] = res;
      self.renderSet();
      self.renderCarDialog();
      return res;
    });
    return ent.promise;
  };

  P.renderSet = function () {
    var el = this.r("set");
    if (!el) return;
    var S = this.S, w = this.wheelById(S.w);
    if (!w) { this.paint(el, ""); return; }
    var hit = this.tireById(S.t, S.w), t = hit ? hit.tire : null;
    var b = this.D.bundle, shop = this.shops[S.s] || this.shops.sw;
    var vname = b && b.vehicle ? b.vehicle.year + " " + b.vehicle.model + (S.tr ? " " + S.tr : "") : "";
    var showViz = this.vizShown === w.id && this.vizKey(w);
    var html = '<div class="ptpb__preview">' +
      '<span class="ptpb__eyebrow">Your set · on your ' + esc(vname) + "</span>" +
      '<div class="ptpb__set">' +
        '<div class="ptpb__set-item">' + (w.img ? '<img src="' + esc(w.img) + '" alt="' + esc(w.d + "-inch " + wheelName(w) + " wheel in " + (w.finish || "")) + '">' : '<span class="ptpb__set-ph">No photo</span>') +
          '<span class="ptpb__eyebrow">Wheels</span><b>' + esc(wheelName(w)) + "</b><small>" + esc((w.finish ? w.finish + " · " : "") + w.d + "″ × " + w.w + "″") + "</small>" +
          '<button type="button" class="ptpb__linkbtn" data-act="change-wheel" data-key="set" aria-expanded="' + !this.folded() + '" aria-controls="ptpb-wheel-list">Change wheel</button></div>' +
        '<span class="ptpb__set-plus" aria-hidden="true">+</span>' +
        '<div class="ptpb__set-item">' + (t ? (t.img ? '<img src="' + esc(t.img) + '" alt="' + esc(tireName(t) + " tire, " + S.sz) + '">' : '<span class="ptpb__set-ph">No photo</span>') +
          '<span class="ptpb__eyebrow">Tires</span><b>' + esc(tireName(t)) + "</b><small>" + esc(S.sz + (t.season ? " · " + seasonWord(t.season).toLowerCase() : "")) + "</small>" +
          '<button type="button" class="ptpb__linkbtn" data-act="change-tire">Change tire</button>'
          : '<span class="ptpb__set-ph">' + (this.tiresLoading === w.id ? "Loading tires…" : "Pick a tire above") + '</span><span class="ptpb__eyebrow">Tires</span><b>Not picked yet</b>') + "</div>" +
      "</div>" +
      (showViz ? '<div class="ptpb__vizwrap">' + this.vizStage(w) + "</div>" : "") +
      '<div class="ptpb__set-foot">' + verdictBadge(this.setVerdict(w), shop.name) +
        (w.img && b && b.vehicle ? '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="viz" aria-expanded="' + (showViz ? "true" : "false") + '">' + ICON.car + " " + (showViz ? "Hide preview" : "See it on my car") + "</button>" : "") +
        '<details class="ptpb__tech"' + (this._setTechOpen ? " open" : "") + ' data-key="settech"><summary>Wheel tech specs</summary><div class="ptpb__techbody"><span class="ptpb__mono">' + esc(w.d + "×" + w.w + (w.et != null ? " ET" + w.et : "")) + "</span>" +
          (w.cb ? "<span>Centre bore " + esc(w.cb) + " mm</span>" : "") + ((w.bolts || []).length ? "<span>Bolt " + esc(w.bolts.join(" / ").replace(/x/g, "×")) + "</span>" : "") + "</div></details>" +
      "</div></div>";
    this.paint(el, html);
  };

  P.openCar = function (id) {
    var w = this.wheelById(id);
    if (!w || !this.carDlg) return;
    this.carWheel = id;
    this._carOpener = doc.activeElement;
    this.loadViz(w);
    this.renderCarDialog(true);
    try { this.carDlg.showModal(); } catch (e) { this.carDlg.setAttribute("open", ""); }
    var h = doc.getElementById("ptpb-car-title"); if (h) focusQuiet(h);
  };
  P.renderCarDialog = function (force) {
    if (!this.carDlg || !this.carWheel || (!force && !this.carDlg.open)) return;
    var w = this.wheelById(this.carWheel), b = this.D.bundle;
    if (!w) return;
    var vname = b && b.vehicle ? b.vehicle.year + " " + b.vehicle.model : "";
    var on = this.S.w === w.id;
    this.paint(this.carBody, '<div class="ptpb__dlg-head"><div><span class="ptpb__eyebrow">See it on my car</span><h2 id="ptpb-car-title" tabindex="-1">' + esc(vname + " with " + w.d + "″ " + wheelName(w)) + "</h2></div>" +
      '<button type="button" class="ptpb__x" data-act="car-close" aria-label="Close">✕</button></div>' +
      '<div class="ptpb__dlg-body">' + this.vizStage(w) +
      "<p>" + esc((w.finish ? w.finish + " · " : "") + w.d + "×" + w.w + (w.et != null ? " ET" + w.et : "")) + " · " + money(w.priceCents) + " each" + (this.pkgFrom(w) != null ? " · packages from " + moneyWhole(this.pkgFrom(w)) : "") + "</p>" +
      '<div class="ptpb__btnrow">' + (on ? '<span class="ptpb__badge ptpb__badge--ok">' + ICON.ok + " Your wheels</span>" : '<button type="button" class="ptpb__btn ptpb__btn--primary" data-act="car-pick" data-id="' + esc(w.id) + '">Pick these wheels</button>') +
      '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="car-close">Close</button></div></div>');
  };
  P.closeCar = function () {
    try { this.carDlg.close(); } catch (e) { this.carDlg.removeAttribute("open"); }
    this.carWheel = null;
    if (this._carOpener && visible(this._carOpener)) focusQuiet(this._carOpener);
  };

  P.renderTires = function () {
    var el = this.r("tires");
    if (!el) return;
    var self = this, S = this.S;
    var sec = doc.getElementById("ptpb-sec-tire");
    var w = this.wheelById(S.w);
    if (sec) sec.classList.toggle("is-inactive", !w);
    if (!w) {
      this.paint(this.r("tirecount"), "");
      this.paint(el, '<div class="ptpb__waiting">' + ICON.wheel + "<p>Pick a wheel above and we’ll show tires that fit it.</p></div>");
      return;
    }
    // The set card keeps its own region so a visualizer image never re-paints
    // with the list. It comes AFTER the tires: right after a wheel pick the
    // folded "Your wheel" row, the tire heading and the first tires share the
    // screen (owner 2026-10-27: land on the tires, no hunting).
    if (!this.r("set")) {
      this.paint(el, '<div data-r="tirebody"></div><div data-r="set"></div>');
    }
    this.renderSet();
    var body = this.r("tirebody");
    if (!body) { el.__ptpbHtml = null; this.paint(el, '<div data-r="tirebody"></div><div data-r="set"></div>'); this.renderSet(); body = this.r("tirebody"); }
    var tires = this.tiresFor(S.w);
    var shop = this.shops[S.s] || this.shops.sw;
    if (this.tiresLoading === S.w && !tires) { this.paint(this.r("tirecount"), ""); this.paint(body, '<div class="ptpb__state ptpb__state--inline"><span class="ptpb__spin" aria-hidden="true"></span><p>Loading tires for these wheels…</p></div>'); return; }
    if (!tires) {
      this.paint(body, this.tiresError ? '<div class="ptpb__alert ptpb__alert--warn"><p>We couldn’t load tires just now. <button type="button" class="ptpb__linkbtn" data-act="retrytires">Try again</button> or call ' + esc(shop.phone) + ".</p></div>" : "");
      return;
    }
    var html = "";
    if (this.conflict) {
      var c = this.conflict, sug = c.suggest;
      var tierW = TIER_WORD[c.tier] || c.tier || "", seas = seasonWord(c.season).toLowerCase();
      html += '<div class="ptpb__conflict" role="group" aria-labelledby="ptpb-cf-h"><h3 id="ptpb-cf-h">' + ICON.warn + " Your tire doesn’t fit these wheels</h3>" +
        "<p>" + (c.kind === "no_tires" ? "We don’t have tires in stock for these wheels right now."
          : esc(tireName(c.mine) + " (" + tierW + ", " + seas + ") doesn’t come in a size for " + c.reason + ", and no other " + tierW + " " + seas + " tire does either. ") +
            (sug ? esc("If you keep these wheels, the closest match is " + tireName(sug.tire) + " " + sug.size.size + " (" + (TIER_WORD[sug.tire.tier] || sug.tire.tier || "") + ", " + seasonWord(sug.tire.season).toLowerCase() + ", " + money(sug.tire.priceCents) + " each).") : "Pick any tire below to continue.")) + "</p>" +
        '<div class="ptpb__btnrow">' + (sug ? '<button type="button" class="ptpb__btn ptpb__btn--primary" data-act="use-suggest">Use ' + esc(tireName(sug.tire)) + "</button>" : "") +
        '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="keeptire">Keep my tire, pick a different wheel</button></div></div>';
    }
    if (this.D.unavailable && this.D.unavailable.item === "tire") {
      html += '<div class="ptpb__alert ptpb__alert--bad"><p>' + ICON.warn + " " + esc(this.D.unavailable.reason || "That tire is no longer in stock as a set of 4.") + " Pick another tire below.</p></div>";
    }
    html += '<fieldset class="ptpb__q"><legend>What matters most?</legend><div class="ptpb__chips ptpb__chips--scroll">' + PRIOS.map(function (p) {
      return chip("ptpb-pr", "ptpb-pr-" + p.id, p.id, S.pr === p.id, false, esc(p.label), esc(p.sub));
    }).join("") + "</div></fieldset>";
    var sizes = tires.sizes || [];
    var row = sizes.filter(function (s) { return s.size === S.sz; })[0];
    var list = row ? (row.tires || []).slice().sort(this.tireCmp(S.pr)) : [];
    var tot = {};
    list.forEach(function (t) { tot[t.id] = self.tireTotal(w, t); });
    var inT = list.filter(function (t) { return self.inBudget(tot[t.id]); }), overT = list.filter(function (t) { return !self.inBudget(tot[t.id]); });
    var ourPick = list.slice().sort(this.tireCmp("pick"))[0];
    // Budget left for tires = budget − everything in this package except the 4
    // tires (and the GST on them).
    var bc = this.bud();
    if (bc != null && list.length) {
      var cur = this.tireById(S.t, S.w);
      var ref = cur && tot[cur.tire.id] != null ? cur.tire : list[0];
      var withGst = Math.round(ref.priceCents * 4 * 1.05);
      var left = bc * 100 - (tot[ref.id] - withGst);
      var other = null;
      if (!inT.length) this.sortedSizes(tires).forEach(function (z) {
        if (other || z.size === S.sz) return;
        var n = z.tires.filter(function (t) { return self.inBudget(self.tireTotal(w, t)); }).length;
        if (n) other = { size: z.size, n: n };
      });
      html += '<p class="ptpb__bnote">' + (left > 0 ? "Your budget leaves about <b>" + moneyWhole(left) + "</b> for 4 tires (incl. GST) on these wheels. " + esc(plural(inT.length, "tire") + " in " + S.sz + " fit" + (inT.length === 1 ? "s" : "") + " it.") +
          (other ? " Size <b>" + esc(other.size) + "</b> has " + other.n + " that do" + (other.n === 1 ? "es" : "") + "." : "")
        : "These wheels already use your whole budget, so every tire puts the package over. Move the budget up or pick a lower-priced wheel.") + "</p>";
    }
    // Tire sizes as sidewall chips (the chosen one black with a red ring), one swipeable row on a phone.
    var sizeChips = sizes.map(function (s) {
      var none = !(s.tires || []).length;
      var id = "ptpb-sz-" + s.size.replace(/[^0-9a-z]/gi, "");
      var sub = none ? "No tires in stock in this size" : (s.oe ? "factory size" : (s.label || "")) + (s.verdict === "fit_check" ? " · fit check" : "");
      return '<label class="ptpb__chip ptpb__chip--size"><input type="radio" name="ptpb-sz" id="' + id + '" value="' + esc(s.size) + '"' + (S.sz === s.size ? " checked" : "") + (none ? " disabled" : "") + ">" +
        '<b class="ptpb__mono">' + esc(s.size) + "</b><small>" + esc(sub) + "</small></label>";
    }).join("");
    html += '<fieldset class="ptpb__fs"><legend class="ptpb__q-l">Tire size</legend><div class="ptpb__chips ptpb__chips--scroll">' + sizeChips + "</div></fieldset>";
    // Each row: brand + Good/Better/Best, the clean model name, a tread picture
    // by type, the severe-snow badge, the sidewall code, the price per tire and
    // what picking it does to the package total ("+$67", "−$17", "In your package").
    var curHit = this.tireById(S.t, S.w), curTot = curHit && tot[curHit.tire.id] != null ? tot[curHit.tire.id] : null;
    var trow = function (t) {
      var on = S.t === t.id, over = !self.inBudget(tot[t.id]);
      var rb = (t.readyBy || {})[S.s];
      var notes = (t.reasons || []).map(function (r) { return '<span class="ptpb__tnote">' + (r.mode === "REVIEW" ? ICON.check : ICON.warn) + " " + esc(r.reason) + "</span>"; }).join("");
      if (over) notes += '<span class="ptpb__overtxt">' + ICON.warn + "<span>+" + self.overText(tot[t.id]) + " over budget</span></span>";
      var delta = "";
      if (on) delta = '<span class="ptpb__tdelta is-in">In your package</span>';
      else if (curTot != null && tot[t.id] != null) {
        var dd = Math.round(tot[t.id] / 100) - Math.round(curTot / 100);   // the two whole-dollar totals shown, so they add up
        delta = '<span class="ptpb__tdelta' + (dd > 0 ? " is-up" : dd < 0 ? " is-down" : "") + '" data-delta="' + dd + '">' +
          (dd === 0 ? "Same total" : (dd > 0 ? "+" : "−") + "$" + commas(Math.abs(dd)) + '<span class="ptpb__vh"> on your package total</span>') + "</span>";
      }
      var pick = ourPick && t.id === ourPick.id;
      return '<label class="ptpb__trow' + (on ? " is-on" : "") + (over ? " is-over" : "") + (pick ? " is-pick" : "") + '"><input type="radio" name="ptpb-tire" id="ptpb-t-' + esc(t.variantId || t.id) + '" value="' + esc(t.id) + '"' + (on ? " checked" : "") + ">" +
        (pick ? '<span class="ptpb__tflag">Our pick</span>' : "") +
        '<span class="ptpb__tim">' + (t.img ? '<img src="' + esc(imgW(t.img, 160)) + '" alt="" width="64" height="64" loading="lazy">' : '<span class="ptpb__noimg"></span>') + "</span>" +
        '<span class="ptpb__tinfo"><span class="ptpb__tbr">' + esc(t.brand || "") + ' <span class="ptpb__tier-tag">' + esc(TIER_WORD[t.tier] || t.tier || "") + "</span></span>" +
          '<span class="ptpb__tname">' + esc(tireShow(t)) + "</span>" +
          '<span class="ptpb__tmeta">' + (t.season ? '<span class="ptpb__badge ptpb__badge--tread">' + treadIcon(t.season) + esc(seasonWord(t.season)) + "</span>" : "") +
            (t.threePmsf === true ? '<span class="ptpb__badge ptpb__badge--snow" title="Three-peak mountain snowflake (3PMSF)">' + ICON.snow + " Severe-snow rated</span>" : "") +
            (t.runflat ? '<span class="ptpb__badge ptpb__badge--warn">Run-flat</span>' : "") +
            '<span class="ptpb__sidewall">' + esc(row.size + (t.li ? " " + t.li + (t.speed || "") : "") + (t.xl ? " XL" : "")) + "</span>" +
          "</span>" +
          '<span class="ptpb__tmeta ptpb__tready">' + ICON.clock + "<span>" + (t.stock && t.stock.label ? '<span class="ptpb__tsrc">' + esc(t.stock.label) + " · </span>" : "") + esc("Earliest " + readyDay(rb)) + "</span></span>" +
          notes +
        "</span>" +
        '<span class="ptpb__tprice"><b>' + money(t.priceCents) + '</b><span><span class="ptpb__tpe">each · </span>' + moneyWhole(t.setCents || t.priceCents * 4) + " for 4</span>" + delta +
          (tot[t.id] != null ? '<span class="ptpb__tpk">Package ' + moneyWhole(tot[t.id]) + "</span>" : "") + "</span>" +
        "</label>";
    };
    if (row && list.length) {
      html += '<fieldset class="ptpb__fs"><legend class="ptpb__vh">Pick a tire</legend><div class="ptpb__tlist">' + inT.map(trow).join("") +
        (overT.length ? (inT.length ? '<p class="ptpb__subhead">Over your budget (' + overT.length + ")</p>" : "") + overT.map(trow).join("") : "") + "</div></fieldset>";
    } else if (!this.conflict) {
      html += '<p class="ptpb__muted">' + (row ? "No " + esc(this.typeNoun()) + " tires in stock in " + esc(S.sz) + ". Try another size or wheel." : "Pick a tire size above.") + "</p>";
    }
    if (row && row.blockedCount) {
      html += '<p class="ptpb__hint">' + row.blockedCount + " more tire" + (row.blockedCount === 1 ? "" : "s") + " in this size don’t meet your vehicle’s load or speed rating, so we left them out.</p>";
    }
    this.paint(body, html);
    // "5 tires for winter in 225/65R17 (3 winter, 2 all-weather)"
    var bySeason = {};
    list.forEach(function (t) { bySeason[t.season] = (bySeason[t.season] || 0) + 1; });
    var parts = Object.keys(bySeason).map(function (k) { return bySeason[k] + " " + seasonWord(k).toLowerCase(); });
    this.paint(this.r("tirecount"), esc((list.length ? plural(list.length, "tire") : "No tires") + (S.pt === "winter" ? " for winter" : S.pt === "truck" ? " for your truck" : "") + (S.sz ? " in " + S.sz : "") + (parts.length > 1 ? " (" + parts.join(", ") + ")" : "")));
  };

  P.whyBlock = function (key, text) {
    if (!text) return "";
    var open = !!this.whyOpen[key];
    return '<button type="button" class="ptpb__whybtn" data-act="why" data-key="' + esc(key) + '" aria-expanded="' + open + '" aria-controls="ptpb-why-' + esc(key) + '">Why?</button>' +
      '<p class="ptpb__whytext" id="ptpb-why-' + esc(key) + '"' + (open ? "" : " hidden") + ">" + esc(text) + "</p>";
  };

  P.renderNeeds = function () {
    var b = this.D.bundle || {}, S = this.S, tp = b.tpms || {};
    var w = this.wheelById(S.w);
    var acc = (w && w.acc) || {};
    var inc = (b.pricing && b.pricing.included) || {};
    var model = b.vehicle ? b.vehicle.model : S.md;
    var self = this;
    var tpUnit = (b.pricing && b.pricing.tpmsUnitCents) || 0;
    var html = '<div class="ptpb__panel ptpb__needs">';

    // TPMS: the server's `choices` decide. ["not_needed"] = indirect (or no
    // TPMS): a static reset line. Otherwise exactly two: new sensors or none.
    var choices = tp.choices || ["new", "none"];
    var resetOnly = choices.length === 1 && choices[0] === "not_needed";
    var newOnly = choices.length === 1 && choices[0] === "new";
    html += '<div class="ptpb__need"><span class="ptpb__ic' + (tp.review ? " ptpb__ic--rv" : (S.tp === "none" ? " ptpb__ic--wn" : "")) + '">' + (tp.review ? ICON.check : (S.tp === "none" ? ICON.warn : ICON.ok)) + "</span><div>" +
      "<h3>Tire-pressure sensors (TPMS)</h3>";
    if (resetOnly) {
      html += "<p>" + (tp.type === "none" ? "No sensors needed." : "No sensors needed. Your " + esc(model) + " checks pressure through the wheel-speed sensors. We reset the system.") + "</p>";
      if (tp.review) html += '<p class="ptpb__hint">' + ICON.check + " We’ll check your tire-pressure system before your install, and fit sensors only if it needs them.</p>";
    } else {
      var known = tp.type === "direct";
      html += '<fieldset class="ptpb__fs"><legend class="ptpb__vh">Tire-pressure sensors</legend><div class="ptpb__radios">' +
        '<label class="ptpb__radio"><input type="radio" name="ptpb-tp" id="ptpb-tp-new" value="new"' + (S.tp === "new" ? " checked" : "") + ">" +
          "<span><b>New sensors, programmed and installed</b><small>" +
          (known ? "Recommended. Your " + esc(model) + " has a sensor inside each wheel. New wheels need their own, so 4 go in and we program them. Your current sensors stay with your factory wheels."
                 : "Most vehicles like your " + esc(model) + " have a sensor in each wheel. We’ve included 4 new ones and will confirm at the shop.") +
          "</small></span>" +
          '<span class="ptpb__rp">' + money(tpUnit) + "/sensor</span></label>" +
        '<label class="ptpb__radio"><input type="radio" name="ptpb-tp" id="ptpb-tp-none" value="none"' + (S.tp === "none" ? " checked" : "") + (newOnly ? ' disabled aria-describedby="ptpb-tp-lock"' : "") + ">" +
          "<span><b>No sensors</b><small>The warning light on your dash stays on.</small></span><span class=\"ptpb__rp\">$0</span></label>" +
        "</div></fieldset>";
      if (newOnly) html += '<p class="ptpb__hint" id="ptpb-tp-lock">Your car came with run-flat tires and no spare, so it needs working sensors.</p>';
      if (S.tp === "none") {
        html += '<div class="ptpb__alert ptpb__alert--warn">' + ICON.warn + "<div><p>Your tire-pressure warning light will stay on, and you won’t be warned about a low tire. This is legal in Canada and we note your choice on the work order.</p>" +
          '<label class="ptpb__ack"><input type="checkbox" id="ptpb-ack"' + (S._ack ? " checked" : "") + "><span>I understand the warning light stays on.</span></label></div></div>";
      }
      if (tp.review || tp.type === "unknown") {
        html += '<p class="ptpb__hint">' + ICON.check + " We’ll confirm your sensors at the shop.</p>";
      }
    }
    // The "no sensors" claim stays visible (ticked) after the customer makes it,
    // so it can be undone; the VIN lookup shows while the type is still unknown.
    var claimed = tp.source === "customer" || !!S._tpmsClaim;
    if (claimed || tp.source === "unknown" || tp.type === "unknown") {
      html += '<div class="ptpb__vin"><label class="ptpb__ack"><input type="checkbox" id="ptpb-claim"' + (S._tpmsClaim ? " checked" : "") + "><span>My vehicle has no sensors in the wheels</span></label>";
      if (!claimed) {
        var vinErr = S._vinErr || "";
        html += '<div class="ptpb__vinrow"><label for="ptpb-vin">Have your VIN? We’ll look up your sensors.</label><div class="ptpb__inline"><input id="ptpb-vin" maxlength="17" autocomplete="off" spellcheck="false" value="' + esc(S._vinDraft != null ? S._vinDraft : (S._vin || "")) + '" placeholder="17 characters"' +
          (vinErr ? ' aria-invalid="true" aria-describedby="ptpb-vin-err"' : "") + '><button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="vin">Look up</button></div>' +
          (vinErr ? '<p class="ptpb__err" id="ptpb-vin-err">' + esc(vinErr) + "</p>" : "") + "</div>";
      }
      html += "</div>";
    }
    html += "</div></div>";

    if (!w) {
      html += '<p class="ptpb__hint ptpb__hint--pad">Once you pick a wheel, we list what it needs to fit your ' + esc(model) + " (lug kit, hub rings, valve stems) and why.</p>";
    } else {
      var hardware = [];
      if (b.pricing && b.pricing.installBands) {
        var ib = b.pricing.installBands, curT = this.tireById(S.t, S.w);
        var bandKey = curT ? installBandOf(ib, curT.tire, S.vt) : null;
        hardware.push(["mb", "Mount, balance & install", bandKey ? moneyWhole(ib.cents[bandKey]) + " per set" : "By tire size",
          "One price for the set of 4, by tire size: " + moneyWhole(ib.cents.car) + " car, " + moneyWhole(ib.cents.suv_truck) + " truck & SUV, " +
          moneyWhole(ib.cents.lt) + " LT, " + moneyWhole(ib.cents.class33) + " 33-inch, " + moneyWhole(ib.cents.class35) + " 35- and 37-inch tires."]);
      } else if (inc.mountBalance) hardware.push(["mb", "Mount & balance", "Included", "Every package is mounted and balanced on our machines. Always included."]);
      if (acc.kit && acc.kit.required) hardware.push(["kit", "Lug kit: " + (acc.kit.count || 20) + " nuts, " + (acc.kit.thread || "") + " " + seatLabel(acc.kit.seat) + " seat", "Included", acc.kit.why]);
      else hardware.push(["kit", "Your factory lug nuts", "Reused", "These factory-style wheels take your existing lug nuts, so no new hardware is needed."]);
      if (acc.rings) hardware.push(["rings", "Hub rings " + acc.rings.fromMm + " → " + acc.rings.toMm + " mm", "Included", acc.rings.why]);
      if (S.tp !== "new") {
        // The server's quote names the valve it priced for THIS tire; use it when we have it.
        var sq = this.D.serverQuote && this.D.serverKey === this.selectionKey() ? this.D.serverQuote : null;
        var vl = sq ? (sq.lines || []).filter(function (l) { return l.key === "valve_stems"; })[0] : null;
        hardware.push(["valve", vl ? vl.label : valveLabel(acc.valve), "Included", (vl && vl.why) || acc.valveWhy || "Valve stems rated for your tires. Included."]);
      }
      hardware.forEach(function (h) {
        html += '<div class="ptpb__need"><span class="ptpb__ic">' + ICON.ok + "</span><div><h3>" + esc(h[1]) + "</h3>" + self.whyBlock(h[0], h[3]) + '</div><div class="ptpb__nprice ptpb__inc">' + esc(h[2]) + "</div></div>";
      });
    }
    html += "</div>";
    this.paint(this.r("needs"), html);
  };

  P.renderExtras = function () {
    var b = this.D.bundle || {}, S = this.S, pr = b.pricing || {};
    var o = this.currentObjects();
    var html = '<div class="ptpb__panel">';
    var rf = pr.roadForce || {};
    if ((rf.shops || []).indexOf(S.s) !== -1) {
      html += '<label class="ptpb__check"><input type="checkbox" id="ptpb-rf"' + (S.rf ? " checked" : "") + ">" +
        "<span><b>Road force balancing (+" + money(rf.unitCents) + "/tire) — Edmonton Trail NE</b><small>A roller presses on each tire like the road does, to find vibration a regular balance misses.</small></span>" +
        '<span class="ptpb__rp">+' + money((rf.unitCents || 0) * 4) + "</span></label>";
    }
    var rh = pr.roadHazard || {};
    var covered = this.hazardCovers(o.tire);
    if (rh.offered && !covered) {
      html += '<p class="ptpb__hint">Road hazard protection covers ' + esc(this.hazardVendors().join(", ")) + " tires. Pick one of those brands to add it.</p>";
    } else if (rh.offered) {
      var unit = 0;
      if (o.tire) {
        unit = Math.round((o.tire.priceCents * (rh.percent || 0)) / 100);
        if (rh.minCents != null) unit = Math.max(unit, rh.minCents);
        if (rh.maxCents != null) unit = Math.min(unit, rh.maxCents);
      }
      html += '<label class="ptpb__check"><input type="checkbox" id="ptpb-rh"' + (S.rh ? " checked" : "") + (o.tire ? "" : " disabled") + ">" +
        "<span><b>Road hazard protection</b><small>" + (o.tire ? "Covers a tire damaged by a pothole, nail or debris. " + esc((rh.percent || 0) + "% of the tire price") + "." : "Pick a tire first.") + "</small></span>" +
        '<span class="ptpb__rp">' + (o.tire ? "+" + money(unit * 4) : "—") + "</span></label>";
    }
    if ((rf.shops || []).indexOf(S.s) === -1 && (rf.shops || []).length) {
      html += '<p class="ptpb__hint">Road force balancing is offered at our Edmonton Trail NE shop. Switch “Install at” to add it.</p>';
    }
    html += "</div>";
    this.paint(this.r("extras"), html);
  };

  P.canRequest = function () {
    var q = this.shownQuote();
    return !!q && this.D.priceState !== "unavailable";
  };

  P.renderFinish = function () {
    var S = this.S, shop = this.shops[S.s] || this.shops.sw, can = this.canRequest();
    var hint = !S.w ? "Pick a wheel and a tire first. Then send the package to " + shop.name + " as an install request."
      : !can ? "Pick a tire that fits to send an install request."
      : (S.tp === "none" && !S._ack) ? "Tick the sensor warning box above to send an install request."
      : "Send this package to " + shop.name + ". The manager confirms fit, stock and your time, then texts you. Nothing is final until we confirm, and you pay at the shop.";
    this.paint(this.r("finish"), '<div class="ptpb__panel"><p class="ptpb__hint">' + esc(hint) + "</p>" +
      '<div class="ptpb__btnrow"><button type="button" class="ptpb__btn ptpb__btn--primary" data-act="request" data-key="finish"' + (can ? "" : " disabled") + ">Request install</button>" +
      '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="copy" data-key="finish"' + (S.w ? "" : " disabled") + ">Copy link</button></div></div>");
  };

  // ── Summary panel + mobile bar ────────────────────────────────────────
  P.budgetLine = function (q) {
    var b = this.bud();
    if (b == null || !q) return "";
    if (this.inBudget(q.totalCents)) return '<div class="ptpb__bline is-ok">' + ICON.ok + "<span>Within your $" + commas(b) + " budget</span></div>";
    var fx = this.budgetFix();
    return '<div class="ptpb__bline is-over">' + ICON.warn + "<span><b>" + this.overText(q.totalCents) + " over</b> your $" + commas(b) + " budget." +
      (fx ? "" : " Nothing that fits your " + esc(this.vehicleModel()) + " comes in under it.") + "</span>" +
      (fx ? '<button type="button" class="ptpb__btn ptpb__btn--ghost ptpb__bfix" data-act="fit-budget">Fit my budget</button>' : "") + "</div>";
  };

  P.renderSummary = function () {
    var el = this.r("summary");
    if (!el) return;
    var S = this.S, b = this.D.bundle || {};
    var q = this.shownQuote();
    var shop = this.shops[S.s] || this.shops.sw;
    var vname = b.vehicle ? b.vehicle.year + " " + b.vehicle.model + (S.tr ? " " + S.tr : "") : "";
    var self = this;
    var pending = this.D.priceState === "pending";
    var w = this.wheelById(S.w), hitT = this.tireById(S.t, S.w), t = hitT ? hitT.tire : null;
    var rg = this.budgetRange();
    // The head (title + Close) sits above the scrolling body, never inside it:
    // on a short phone screen the body can shrink but Close stays on screen.
    var html = '<div class="ptpb__sum-head"><h2 id="ptpb-sum-title" tabindex="-1">Your package</h2><span>' + ICON.shop + " " + esc(shop.name) + "</span>" +
      '<button type="button" class="ptpb__linkbtn ptpb__sheet-x" data-act="sheet-close">Close</button></div>' +
      '<div class="ptpb__sum-body" id="ptpb-sum-body">';
    if (w) {
      html += '<div class="ptpb__sumset">' + (w.img ? '<img src="' + esc(w.img) + '" alt="">' : '<span class="ptpb__ph"></span>') + '<span aria-hidden="true">+</span>' +
        (t && t.img ? '<img src="' + esc(t.img) + '" alt="">' : '<span class="ptpb__ph" aria-hidden="true"></span>') +
        "<div>" + esc(w.d + "″ " + wheelShow(w)) + "<br>" + esc(t ? [t.brand, tireShow(t)].filter(Boolean).join(" ") : "Pick a tire") +
        '<br><button type="button" class="ptpb__linkbtn" data-act="change-wheel" data-key="sum" aria-expanded="' + !this.folded() + '" aria-controls="ptpb-wheel-list">Change wheel</button></div></div>';
    }
    var gone = this.D.priceState === "unavailable" && this.D.unavailable ? this.D.unavailable : null;
    if (gone) {
      var goneSec = gone.item === "wheel" ? "ptpb-sec-wheel" : "ptpb-sec-tire";
      html += '<div class="ptpb__alert ptpb__alert--bad" role="alert"><p>' + ICON.warn + " " + esc(gone.reason || "One of your items is no longer in stock as a set of 4.") + "</p>" +
        '<button type="button" class="ptpb__linkbtn" data-act="goto" data-target="' + goneSec + '">Pick another ' + (gone.item === "wheel" ? "wheel" : "tire") + "</button></div>";
    }
    if (!q) {
      if (!w) {
        html += '<div class="ptpb__fit ptpb__fit--rv"><p class="ptpb__fl">' + ICON.check + " Pick a wheel to start</p><p>Everything here is checked against your " + esc(vname) + ". Your package builds up here as you choose.</p></div>";
        html += rg ? '<div class="ptpb__totals"><div class="ptpb__grand"><span>Packages from</span><b>' + moneyWhole(rg.lo) + '</b></div><div class="ptpb__per"><span>4 wheels + 4 tires, installed, incl. GST</span></div></div>' : "";
      } else {
        html += '<p class="ptpb__muted">' + (this.conflict ? "Choose how to continue in the tire section." : "Pick a tire to see your installed total.") + "</p>";
      }
    } else {
      // 1. Fit status
      var v = q.verdict, rr = q.reviewReasons || [];
      if (v === "fit_check") {
        html += '<div class="ptpb__fit ptpb__fit--rv"><p class="ptpb__fl">' + ICON.check + " Fit check by the " + esc(shop.name) + " manager</p>" +
          "<p>" + esc(REVIEW_LINE) + " We check within one business day.</p>" +
          (rr.length ? '<details><summary>What the manager checks (' + rr.length + ")</summary><ul>" + rr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>" : "") + "</div>";
      } else {
        html += '<div class="ptpb__fit ptpb__fit--ok"><p class="ptpb__fl">' + ICON.ok + " Fits your " + esc(vname) + "</p>" +
          (b.spec ? '<p class="ptpb__fs-specs">' + esc([b.spec.bolt, b.spec.hubBoreMm ? b.spec.hubBoreMm + " mm hub" : ""].filter(Boolean).join(" · ")) + "</p>" : "") + "</div>";
      }
      (q.notices || []).forEach(function (n) { html += '<p class="ptpb__notice">' + ICON.warn + " " + esc(n) + "</p>"; });
      // 2. Lines
      var dim = pending || !!gone;
      html += '<ul class="ptpb__lines' + (dim ? " is-pending" : "") + '">' + (q.lines || []).map(function (l) {
        var key = "l-" + l.key;
        // The levy already in the tire's price shows as $0.00, not "Included" (owner 2026-10-23).
        var levyIn = l.key === "levy" && l.included;
        var price = l.included && !levyIn ? '<span class="ptpb__lt ptpb__inc">Included</span>' : '<span class="ptpb__lt">' + money(l.totalCents) + "</span>";
        var rm = "";
        if (l.key === "road_force" || l.key === "road_hazard") rm = '<button type="button" class="ptpb__linkbtn" data-act="rm" data-key="' + l.key + '">Remove</button>';
        else if (l.key === "tpms" && l.removable !== false && !(b.tpms && b.tpms.locked)) rm = '<button type="button" class="ptpb__linkbtn" data-act="rm" data-key="tpms">Remove</button>';
        return '<li class="ptpb__line"><span class="ptpb__ln">' + esc(l.label) + (l.qty > 1 ? ' <span class="ptpb__lq">' + (l.included && !levyIn ? "× " + l.qty : l.qty + " × " + money(l.unitCents)) + "</span>" : "") + "</span>" + price +
          ((l.why || rm) ? '<span class="ptpb__lw">' + self.whyBlock(key, l.why) + rm + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
      // 3. Totals (+ the budget, which holds all the way through)
      html += '<div class="ptpb__totals' + (dim ? " is-pending" : "") + '">' +
        "<div><span>Subtotal</span><span>" + money(q.subtotalCents) + "</span></div>" +
        "<div><span>GST 5%</span><span>" + money(q.gstCents) + "</span></div>" +
        '<div class="ptpb__grand"><span>Installed total</span><b>' + money(q.totalCents) + "</b></div>" +
        '<div class="ptpb__per"><span>' + money(q.perTireInstalledCents || Math.round(q.totalCents / 4)) + " per wheel &amp; tire, installed</span></div>" +
        (pending ? '<p class="ptpb__pending"><span class="ptpb__spin ptpb__spin--sm" aria-hidden="true"></span> Checking today’s price…</p>' : "") +
        (this.D.priceNote && !pending ? '<p class="ptpb__pnote">' + esc(this.D.priceNote) + "</p>" : "") +
        (this.D.priceState === "error" ? '<p class="ptpb__pnote">We couldn’t check today’s price. We’ll check it again before you send your request.</p>' : "") +
        this.budgetLine(q) +
        "</div>";
      // 4. Availability
      var rb = (q.readyBy || {})[S.s];
      var o = this.currentObjects();
      var stockLine = o.wheel && o.tire ? (o.tire.stock && o.wheel.stock ? (o.wheel.stock.label === o.tire.stock.label ? o.wheel.stock.label : "Wheels: " + o.wheel.stock.label + ". Tires: " + o.tire.stock.label) : "") : "";
      html += '<div class="ptpb__ready">' + ICON.clock + "<div><b>Request install from " + esc(readyText(rb)) + " — we’ll confirm</b>" +
        (stockLine ? "<p>" + esc(stockLine) + ".</p>" : "") +
        (rb && rb.reason ? "<p>" + esc(rb.reason) + "</p>" : "") + "</div></div>";
    }
    var logHtml = this.logHtml();
    html += '<div data-r="log" class="ptpb__log">' + logHtml + "</div>";
    html += '<div class="ptpb__sum-more"><div class="ptpb__btnrow ptpb__btnrow--2"><button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="copy" data-key="summore">Copy link</button>' +
      '<a class="ptpb__btn ptpb__btn--ghost" href="tel:' + esc(shop.phoneHref) + '">Ask a question</a></div>' +
      '<p class="ptpb__fine">You pay at the shop. We confirm your time and fit before anything is ordered or installed.</p></div>';
    html += "</div>";
    // 6. Actions
    var can = this.canRequest();
    // Before a wheel the body already shows "Packages from": the footer doesn't
    // repeat it, and its button is a neutral "Pick a wheel to start", not a faded red one.
    var footLabel = q ? "Installed total<br>incl. GST" : "";
    var footVal = q ? money(q.totalCents) : "";
    html += '<div class="ptpb__sum-foot">' +
      (footVal ? '<div class="ptpb__ft"><span>' + footLabel + "</span><b>" + footVal + "</b></div>" : "") +
      (w ? '<button type="button" class="ptpb__btn ptpb__btn--primary ptpb__btn--block" data-act="request" data-key="sum"' + (can ? "" : " disabled") + ">Request install</button>"
        : '<button type="button" class="ptpb__btn ptpb__btn--wait ptpb__btn--block" data-act="request" data-key="sum" disabled>Pick a wheel to start</button>') +
      '<div class="ptpb__btnrow ptpb__btnrow--2"><button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="copy" data-key="sum">Copy link</button>' +
      '<a class="ptpb__btn ptpb__btn--ghost" href="tel:' + esc(shop.phoneHref) + '">Ask a question</a></div>' +
      '<p class="ptpb__fine">You pay at the shop. We confirm your time and fit before anything is ordered or installed.</p>' +
      "</div>";
    // Phone + tablet (< 1024 px): a black pill above the site's tab bar — the
    // orange installed total (tap it for the receipt sheet), a line naming the
    // package, and ONE red "Request install". Before a wheel: "Packages from"
    // and "See wheels ↓".
    var bOver = q && this.bud() != null && !this.inBudget(q.totalCents);
    var exp = el.classList.contains("is-open") ? "true" : "false";
    var chev = '<svg class="ptpb__i ptpb__bar-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var pkgName = w ? w.d + "″ " + wheelShow(w) + " + " + (t ? [t.brand, tireShow(t)].filter(Boolean).join(" ") : "pick a tire") : "";
    var sub;
    if (q) {
      sub = (gone ? esc(gone.reason || "An item is no longer in stock.") + " · "
        : (bOver ? '<span class="ptpb__sb-over">' + this.overText(q.totalCents) + " over budget</span> · " : "") +
          (q.verdict === "fit_check" ? "Fit check · " : "✓ Fits · ") + esc(pkgName) + " · Earliest " + esc(readyDay((q.readyBy || {})[S.s])));
    } else sub = w ? esc(pkgName) : "incl. GST · Pick a wheel to start";
    html += '<div class="ptpb__bar' + (q ? " has-q" : "") + '">' +
      '<button type="button" class="ptpb__bar-toggle" data-act="sheet-open" aria-expanded="' + exp + '" aria-controls="ptpb-sum-body">' +
        (q ? '<span class="ptpb__bar-lab">installed · incl. GST ' + chev + '<span class="ptpb__vh">, view your package</span></span><span class="ptpb__bar-total">' + money(q.totalCents) + "</span>"
          : '<span class="ptpb__bar-lab">' + (rg && !w ? "Packages from" : "Your package") + " " + chev + '<span class="ptpb__vh">, view your package</span></span>' +
            '<span class="ptpb__bar-total">' + (rg && !w ? moneyWhole(rg.lo) : (w ? "Pick a tire" : "")) + "</span>") +
        '<span class="ptpb__bar-sub">' + sub + "</span>" +
      "</button>" +
      (q || w ? '<button type="button" class="ptpb__btn ptpb__btn--primary ptpb__bar-go" data-act="request" data-key="bar"' + (can ? "" : " disabled") + '>Request install <span aria-hidden="true">→</span></button>'
        : '<button type="button" class="ptpb__btn ptpb__bar-see" data-act="jump" data-key="bar">See wheels <span aria-hidden="true">↓</span></button>') +
      "</div>";
    this.paint(el, html);
    var lg = this.r("log");
    if (lg) lg.__ptpbHtml = logHtml; // painted with the summary: no second paint to lose focus in
  };

  P.logHtml = function () {
    return this.log.length ? '<span class="ptpb__eyebrow">What changed</span>' + this.log.map(function (e, i) {
      var live = i === 0 && e.prev && !e.stale;
      return '<div class="ptpb__entry' + (live ? "" : " is-old") + '"><span>' + esc(e.text) + "</span>" +
        (live ? '<button type="button" class="ptpb__linkbtn" data-act="undo" data-id="' + e.id + '">Undo</button>' : "<span></span>") + "</div>";
    }).join("") : "";
  };
  P.renderLog = function () {
    var el = this.r("log");
    if (!el) return;
    this.paint(el, this.logHtml());
  };

  P.toast = function (e) {
    var t = this.toastEl, self = this;
    if (!t) return;
    t.innerHTML = "<span>" + esc(e.text) + "</span>" + (e.prev ? '<button type="button" class="ptpb__linkbtn" data-act="undo" data-id="' + e.id + '">Undo</button>' : "");
    t.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(function () { self.hideToast(); }, 7000);
  };
  P.hideToast = function () { if (this.toastEl) this.toastEl.hidden = true; };

  // Everything a keyboard or screen reader could reach behind the open sheet:
  // the siblings of the summary and of each of its ancestors up to <body>
  // (vehicle bar, wheel and tire sections, the site around the builder) — never
  // the scrim, the dialogs or anything already inert.
  P.sheetBehind = function (s) {
    var out = [], node = s, self = this;
    while (node && node.parentNode && node !== doc.body) {
      var parent = node.parentNode;
      for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
        if (c === node || c === self.scrim || c.tagName === "DIALOG" || c.tagName === "SCRIPT" || c.tagName === "STYLE" || c.hasAttribute("inert") || c.hasAttribute("aria-live")) continue;
        if (c.querySelector && c.querySelector("dialog[open]")) continue;
        out.push(c);
      }
      node = parent;
    }
    return out;
  };
  P.openSheet = function () {
    var s = this.r("summary");
    if (!s) return;
    if (root.matchMedia && !root.matchMedia(SHEET_MQ).matches) return; // desktop: the summary is a sidebar, not a sheet
    // The sheet never runs under the site's fixed header or off the top.
    var hd = doc.querySelector("[data-pt-header]"), head = 0;
    if (hd) { var hr = hd.getBoundingClientRect(), hcs = root.getComputedStyle(hd); if ((hcs.position === "fixed" || hcs.position === "sticky") && hr.top <= 1 && hr.bottom > 0) head = Math.round(hr.bottom); }
    this.root.style.setProperty("--ptpb-head", head + "px");
    this.measureDock();
    s.classList.add("is-open");
    this.scrim.hidden = false;
    doc.documentElement.classList.add("ptpb-sheet-open");
    // Modal (as the prototype): the page behind is inert while the sheet is open.
    this._inerted = this.sheetBehind(s);
    this._inerted.forEach(function (el) { el.setAttribute("inert", ""); });
    s.setAttribute("role", "dialog");
    s.setAttribute("aria-modal", "true");
    var tg = $('[data-act="sheet-open"]', s); if (tg) tg.setAttribute("aria-expanded", "true");
    var t = $("#ptpb-sum-title", s);
    if (t) t.focus();
  };
  P.closeSheet = function (returnFocus) {
    var s = this.r && this.laneEl ? this.r("summary") : null;
    var wasOpen = !!(s && s.classList.contains("is-open"));
    if (s) s.classList.remove("is-open");
    if (this.scrim) this.scrim.hidden = true;
    doc.documentElement.classList.remove("ptpb-sheet-open");
    (this._inerted || []).forEach(function (el) { el.removeAttribute("inert"); });
    this._inerted = null;
    if (s) { s.removeAttribute("role"); s.removeAttribute("aria-modal"); }
    var tg = s ? $('[data-act="sheet-open"]', s) : null;
    if (tg) tg.setAttribute("aria-expanded", "false");
    if (wasOpen && returnFocus && tg) focusQuiet(tg);
  };

  // ══════════════════════════════════════════════════════════════════════
  // Quote lane (§5.6b): out-of-scope vehicles, builder off, catalogue not ready
  // ══════════════════════════════════════════════════════════════════════
  P.renderQuoteLane = function () {
    // Redesign 2026-11-13: the quote lane is the one booking form's quote
    // screen (same shell and contact fields); the markup below is the fallback.
    // Gated on the real form: while pt-book.js is still loading the lane shows
    // a short wait line, and if it cannot load (PTBook.__failed) the legacy
    // markup below draws instead.
    if (root.PTBook && typeof root.PTBook.mount === "function" && !root.PTBook.__failed && !this.cfg.legacyRequest && !this.quoteDone) {
      var selfQ = this;
      if (root.PTBook.__real || typeof root.PTBook.whenReady !== "function") {
        root.PTBook.mount(this.laneEl, { kind: "package_quote", from: "package", pkg: this.quoteAdapter() });
        return;
      }
      if (this.laneEl) this.laneEl.innerHTML = '<p class="ptpb__chipnote" role="status">Loading the request form…</p>';
      root.PTBook.whenReady(function () {
        if (selfQ.lane !== "quote") return; // the customer moved on while it loaded
        root.PTBook.mount(selfQ.laneEl, { kind: "package_quote", from: "package", pkg: selfQ.quoteAdapter() });
      }, function () { if (selfQ.lane === "quote") selfQ.renderQuoteLane(); });
      return;
    }
    var S = this.S, info = this.laneInfo || {}, b = this.D.bundle;
    var reasons = info.reasons || [];
    var intro;
    if (info.reason === "disabled" || info.reason === "catalog_not_ready" || this.cfg.entryMode === "quote_only") {
      intro = "Tell us about your vehicle and the look you want. We’ll text you package options with installed prices.";
    } else if (reasons.length) {
      intro = reasons[0];
    } else {
      intro = "Send us a quote request and we’ll text you options.";
    }
    var h = S._hints || {};
    var hintLine = [h.brand, h.model, h.style].filter(Boolean).join(" ");
    var veh = b && b.vehicle ? b.vehicle.year + " " + b.vehicle.make + " " + b.vehicle.model + (b.vehicle.trim ? " " + b.vehicle.trim : "") : "";
    var shopOpts = ["sw", "ne"].map(function (slug) {
      var sh = this.shops[slug];
      return '<label class="ptpb__seg-opt"><input type="radio" name="ptpb-qshop" id="ptpb-qshop-' + slug + '" value="' + slug + '"' + (S.s === slug ? " checked" : "") + "><span>" + esc(sh.name) + "</span></label>";
    }, this).join("");
    var done = this.quoteDone;
    if (done) {
      var sh = this.shops[done.shop] || this.shops.sw;
      this.laneEl.innerHTML = '<div class="ptpb__qwrap"><div class="ptpb__done" role="status">' + ICON.ok +
        '<div><h2 tabindex="-1" id="ptpb-qdone">Request sent — we’ll text you options.</h2><p>Our ' + esc(sh.name) + " manager will reply within one business day. Questions in the meantime? Call " +
        '<a class="ptpb__link" href="tel:' + esc(sh.phoneHref) + '">' + esc(sh.phone) + "</a>.</p></div></div></div>";
      var hd = $("#ptpb-qdone", this.laneEl); if (hd) hd.focus();
      return;
    }
    this.laneEl.innerHTML =
      '<div class="ptpb__qwrap"><form class="ptpb__panel ptpb__qform" data-ptpb-qform novalidate>' +
        "<h2>Request a package quote</h2>" +
        "<p>" + esc(intro) + "</p>" +
        (reasons.length > 1 ? "<ul>" + reasons.slice(1).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" : "") +
        (hintLine ? '<p class="ptpb__chipnote">Wheel you asked about: <b>' + esc(hintLine) + "</b></p>" : "") +
        (veh ? '<p class="ptpb__chipnote">Vehicle: <b>' + esc(veh) + '</b></p>' :
          '<div class="ptpb__grid2">' +
            qfield("ptpb-q-year", "Year", '<input id="ptpb-q-year" inputmode="numeric" maxlength="4" value="' + esc(S.y || "") + '">') +
            qfield("ptpb-q-make", "Make", '<input id="ptpb-q-make" maxlength="60" value="' + esc(S.mk || "") + '">') +
            qfield("ptpb-q-model", "Model", '<input id="ptpb-q-model" maxlength="60" value="' + esc(S.md || "") + '">') +
            qfield("ptpb-q-trim", "Trim (optional)", '<input id="ptpb-q-trim" maxlength="60" value="' + esc(S.tr || "") + '">') +
          "</div>") +
        '<div class="ptpb__field"><span class="ptpb__lab" id="ptpb-qshop-lab">Closest shop</span><div class="ptpb__seg" role="radiogroup" aria-labelledby="ptpb-qshop-lab">' + shopOpts + "</div></div>" +
        '<div class="ptpb__grid2">' +
          qfield("ptpb-q-name", "Name", '<input id="ptpb-q-name" autocomplete="name" required maxlength="80">') +
          qfield("ptpb-q-phone", "Phone (we text you here)", '<input id="ptpb-q-phone" type="tel" autocomplete="tel" required maxlength="30">') +
          qfield("ptpb-q-email", "Email (optional)", '<input id="ptpb-q-email" type="email" autocomplete="email" maxlength="120">') +
        "</div>" +
        qfield("ptpb-q-notes", "Anything else? (optional)", '<textarea id="ptpb-q-notes" rows="3" maxlength="1000" placeholder="Style, budget, winter or all-season, lift height…">' + (S._hintSizes ? "Sizes: " + esc(S._hintSizes) : "") + "</textarea>") +
        '<div class="ptpb__hp" aria-hidden="true"><label for="ptpb-q-hp">Company website</label><input id="ptpb-q-hp" name="company_website" tabindex="-1" autocomplete="off"></div>' +
        '<p class="ptpb__err" data-ptpb-qerr role="alert" hidden></p>' +
        '<button type="submit" class="ptpb__btn ptpb__btn--primary ptpb__btn--block" data-ptpb-qsend>Send request</button>' +
        '<p class="ptpb__fine">Prefer to talk? Call 42 Ave SW at <a class="ptpb__link" href="tel:' + esc(this.shops.sw.phoneHref) + '">' + esc(this.shops.sw.phone) +
          '</a> or Edmonton Trail NE at <a class="ptpb__link" href="tel:' + esc(this.shops.ne.phoneHref) + '">' + esc(this.shops.ne.phone) + "</a>.</p>" +
      "</form></div>";

    function qfield(id, label, control) {
      return '<div class="ptpb__field"><label for="' + id + '">' + esc(label) + "</label>" + control + "</div>";
    }
  };

  P.sendQuote = function () {
    var self = this, S = this.S, b = this.D.bundle, f = $("[data-ptpb-qform]", this.laneEl);
    if (!f) return;
    var errEl = $("[data-ptpb-qerr]", f), btn = $("[data-ptpb-qsend]", f);
    function val(id) { var e = doc.getElementById(id); return e ? String(e.value || "").trim() : ""; }
    var name = val("ptpb-q-name"), phone = val("ptpb-q-phone"), email = val("ptpb-q-email");
    var shopEl = $('input[name="ptpb-qshop"]:checked', f);
    var shop = shopEl ? shopEl.value : S.s;
    var err = "";
    if (!name) err = "Please add your name.";
    else if (phone.replace(/\D/g, "").length < 10) err = "Please add a phone number we can text.";
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err = "That email doesn’t look right.";
    if (err) { errEl.hidden = false; errEl.textContent = err; return; }
    errEl.hidden = true;
    var vehicle = null;
    if (b && b.vehicle && b.vehicle.makeSlug) {
      vehicle = { ref: { year: b.vehicle.year, make: b.vehicle.make, model: b.vehicle.model, makeSlug: b.vehicle.makeSlug, modelSlug: b.vehicle.modelSlug, trim: b.vehicle.trim || S.tr || "" } };
    } else {
      var vy = val("ptpb-q-year") || S.y || "", vm = val("ptpb-q-make") || S.mk || "", vd = val("ptpb-q-model") || S.md || "", vt = val("ptpb-q-trim") || S.tr || "";
      if (vy || vm || vd) {
        vehicle = { text: { year: vy.slice(0, 60), make: vm.slice(0, 60), model: vd.slice(0, 60) } };
        if (vt) vehicle.text.trim = vt.slice(0, 60);
      }
    }
    var hints = {};
    var h = S._hints || {};
    ["brand", "model", "style"].forEach(function (k) { if (h[k]) hints[k] = h[k]; });
    if (S._focus) hints.wheelId = S._focus;
    if (S.w) hints.wheelId = S.w;
    if (S.t) hints.tireId = S.t;
    if (S.sz) hints.size = S.sz;
    if (S.pt) hints.packageType = S.pt;
    var body = {
      mode: "quote", vehicle: vehicle, vehicleType: S.vt || null, lift: S.lift || null,
      liftInches: S.lift === "lifted" && S.li ? +S.li : null, shop: shop, hints: hints,
      scopeReasons: (this.laneInfo && this.laneInfo.reasons) || [],
      contact: { name: name.slice(0, 80), phone: phone.slice(0, 30) },
      notes: val("ptpb-q-notes").slice(0, 1000),
      company_website: val("ptpb-q-hp"),
      elapsedMs: nowMs()
    };
    if (email) body.contact.email = email.slice(0, 120);
    btn.disabled = true; btn.textContent = "Sending…";
    this.api("request", { method: "POST", body: body, channel: "request" }).then(function (r) {
      btn.disabled = false; btn.textContent = "Send request";
      var sh = self.shops[shop] || self.shops.sw;
      if (r.ok) {
        self.quoteDone = { shop: shop };
        track("pkg_request_ok", { mode: "quote" });
        self.renderQuoteLane();
        return;
      }
      errEl.hidden = false;
      if (r.status === 429) errEl.textContent = "Too many tries — please wait a minute and send again.";
      else if (r.status >= 400 && r.status < 500 && r.data && r.data.error) errEl.textContent = r.data.error;
      else errEl.innerHTML = "We couldn’t send that — call " + esc(sh.name) + ' at <a class="ptpb__link" href="tel:' + esc(sh.phoneHref) + '">' + esc(sh.phone) + "</a>.";
    });
    track("pkg_request", { mode: "quote" });
  };

  // ══════════════════════════════════════════════════════════════════════
  // Request install: ONE short form (no steps) — §7.4.7
  // ══════════════════════════════════════════════════════════════════════
  P.hoursFor = function (slug, d) {
    var H = this.hours[slug] || this.hours.sw || {};
    var toMin = function (s) {
      var p = String(s || "").split(":");
      var v = parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0);
      return isNaN(v) ? null : v;
    };
    var dow = d.getDay(), open, close, gap = null;
    if (dow === 0) { open = toMin(H.hours_sun_open); close = toMin(H.hours_sun_close); }
    else if (dow === 5 && toMin(H.hours_fri_final_close) !== null) {
      open = toMin(H.hours_fri_open); close = toMin(H.hours_fri_final_close);
      var gc = toMin(H.hours_fri_close), gr = toMin(H.hours_fri_reopen);
      if (gc !== null && gr !== null && gr > gc) gap = [gc, gr];
    } else { open = toMin(H.hours_mon_sat_open); close = toMin(H.hours_mon_sat_close); }
    if (open === null) open = dow === 0 ? 600 : 540;
    if (close === null) close = dow === 0 ? 840 : 1020;
    var cut = parseInt(H.booking_cutoff_minutes, 10) || 30;
    return { open: open, close: close, last: close - cut, gap: gap };
  };

  P.openRequest = function () {
    var self = this, S = this.S;
    if (S.tp === "none" && !S._ack) {
      this.renderNeeds();
      var ack = doc.getElementById("ptpb-ack");
      this.closeSheet();
      if (ack) { ack.scrollIntoView({ block: "center" }); ack.focus(); }
      this.announce("Please tick that you understand the warning light stays on.");
      return;
    }
    this._reqOpener = doc.activeElement;
    // Redesign 2026-11-13: "Request install" opens the ONE booking form
    // (assets/pt-book.js) at its Time step with this package's locked price.
    // The builder stays the picker; the adapter below carries the server quote,
    // the selection, the shop and the request id, and posts through this.api
    // exactly as sendRequest() does. The dialog below is the fallback only.
    // Gated on the real form; if pt-book.js cannot load (PTBook.__failed) this
    // runs again and the builder's own request dialog below opens instead.
    if (root.PTBook && typeof root.PTBook.open === "function" && !root.PTBook.__failed && !this.cfg.legacyRequest) {
      var selfR = this;
      var goNew = function () {
        selfR.closeSheet();
        track("pkg_request", { mode: "install" });
        var q0 = selfR.D.serverKey === selfR.selectionKey() && selfR.D.serverQuote ? Promise.resolve(selfR.D.serverQuote) : (clearTimeout(selfR._priceT), selfR.fetchPrice());
        root.PTBook.open({ kind: "package", from: "package", pkg: selfR.bookAdapter(q0) });
      };
      if (root.PTBook.__real || typeof root.PTBook.whenReady !== "function") { goNew(); return; }
      root.PTBook.whenReady(goNew, function () { selfR.openRequest(); });
      return;
    }
    // visit: "wait" (pick a time) or "drop_off" (a day, no time). Every
    // package has a tire, so the drop-off choice is always offered here.
    this.req = { date: null, time: null, visit: "wait", sending: false, error: "", done: null, conflict: null, avail: null, requestId: newRequestId(), err: {} };
    this.closeSheet();
    track("pkg_request", { mode: "install" });
    var ready = this.D.serverKey === this.selectionKey() && this.D.serverQuote ? Promise.resolve(this.D.serverQuote) : (clearTimeout(this._priceT), this.fetchPrice());
    this.renderRequest(true);
    try { this.dlg.showModal(); } catch (e) { this.dlg.setAttribute("open", ""); }
    ready.then(function (q) {
      if (!q) {
        self.req.error = self.D.priceState === "unavailable" ? (self.D.unavailable && self.D.unavailable.reason) || "One of your items is no longer in stock as a set of 4." : "We couldn’t check today’s price.";
        self.req.fatal = true;
      }
      self.renderRequest();
      if (q) self.pickFirstDay();
    });
  };

  // The one booking form's view of this package (see openRequest).
  P.bookAdapter = function (ready) {
    var self = this, S = this.S;
    var shop = function () { return self.shops[S.s] || self.shops.sw; };
    return {
      quote: function () { return ready; },
      unavailableReason: function () {
        return self.D.priceState === "unavailable" ? (self.D.unavailable && self.D.unavailable.reason) || "One of your items can't be supplied as a set of 4 any more." : "We couldn't check today's price.";
      },
      selection: function () { return self.selectionBody(); },
      shop: function () { return S.s; },
      shopName: function () { return shop().name; },
      shopPhone: function () { return shop().phone; },
      shopPhoneHref: function () { return shop().phoneHref; },
      shopAddress: function () { return shop().address; },
      floor: function () { return self.reqFloor(); },
      durationMinutes: function () { return (self.D.bundle && self.D.bundle.durationMinutes) || 30; },
      vehicleModel: function () { return self.vehicleModel(); },
      vehicleLabel: function () {
        var b = self.D.bundle;
        return b && b.vehicle ? [b.vehicle.year, b.vehicle.make, b.vehicle.model, b.vehicle.trim].filter(Boolean).join(" ") : [S.y, S.mk, S.md, S.tr].filter(Boolean).join(" ");
      },
      tpmsNone: function () { return S.tp === "none"; },
      availApi: this.apiBase + "/api/availability",
      newRequestId: newRequestId,
      nowMs: nowMs,
      track: track,
      send: function (body) { return self.api("request", { method: "POST", body: body, channel: "request", timeout: 25000 }); },
      onConflict: function (d) { self.D.serverQuote = d.quote; self.D.serverKey = self.selectionKey(); self.render(); },
      onUnavailable: function (d) { self.D.unavailable = d.unavailable; self.D.serverQuote = null; self.D.serverKey = ""; self.render(); },
      onDone: function () { self.announce("Request sent. We'll confirm."); },
      onClose: function () {
        var btn = visible(self._reqOpener) || visible($('.ptpb__sum-foot [data-act="request"]', self.laneEl)) || visible($('.ptpb__bar [data-act="request"]', self.laneEl));
        if (btn) focusQuiet(btn);
      }
    };
  };

  // The quote lane's view of this builder, for the one form's quote screen.
  P.quoteAdapter = function () {
    var self = this, S = this.S, info = this.laneInfo || {}, b = this.D.bundle;
    var reasons = info.reasons || [];
    var intro;
    if (info.reason === "disabled" || info.reason === "catalog_not_ready" || this.cfg.entryMode === "quote_only") intro = "Tell us about your vehicle and the look you want. We'll text you package options with installed prices.";
    else if (reasons.length) intro = reasons[0];
    else intro = "Send us a quote request and we'll text you options.";
    var h = S._hints || {};
    var hints = {};
    ["brand", "model", "style"].forEach(function (k) { if (h[k]) hints[k] = h[k]; });
    if (S._focus) hints.wheelId = S._focus;
    if (S.w) hints.wheelId = S.w;
    if (S.t) hints.tireId = S.t;
    if (S.sz) hints.size = S.sz;
    if (S.pt) hints.packageType = S.pt;
    return {
      shops: this.shops,
      shop: function () { return S.s || "sw"; },
      info: function () {
        return {
          intro: intro, reasons: reasons, hintLine: [h.brand, h.model, h.style].filter(Boolean).join(" "),
          vehicleText: b && b.vehicle ? b.vehicle.year + " " + b.vehicle.make + " " + b.vehicle.model + (b.vehicle.trim ? " " + b.vehicle.trim : "") : "",
          vehicleRef: b && b.vehicle && b.vehicle.makeSlug ? { year: b.vehicle.year, make: b.vehicle.make, model: b.vehicle.model, makeSlug: b.vehicle.makeSlug, modelSlug: b.vehicle.modelSlug, trim: b.vehicle.trim || S.tr || "" } : null,
          typed: { year: S.y || "", make: S.mk || "", model: S.md || "", trim: S.tr || "" },
          S: S, vehicleType: S.vt || null, lift: S.lift || null, liftInches: S.lift === "lifted" && S.li ? +S.li : null,
          hints: hints, scopeReasons: reasons, notes: S._hintSizes ? "Sizes: " + S._hintSizes : ""
        };
      },
      nowMs: nowMs,
      track: track,
      send: function (body) { return self.api("request", { method: "POST", body: body, channel: "request" }); }
    };
  };

  P.closeRequest = function () {
    try { this.dlg.close(); } catch (e) { this.dlg.removeAttribute("open"); }
    var btn = visible(this._reqOpener) || visible($('.ptpb__sum-foot [data-act="request"]', this.laneEl)) || visible($('.ptpb__bar [data-act="request"]', this.laneEl));
    if (btn) focusQuiet(btn);
  };

  P.reqFloor = function () {
    var q = this.D.serverQuote, S = this.S;
    return q && q.readyBy ? q.readyBy[S.s] : null;
  };

  P.dayList = function () {
    var out = [], today = new Date(); today.setHours(0, 0, 0, 0);
    for (var i = 0; i < 21; i++) { var d = new Date(today); d.setDate(today.getDate() + i); out.push(d); }
    return out;
  };

  P.dayAllowed = function (d) {
    var floor = this.reqFloor(), fd = floor ? parseISO(floor.dateISO) : null;
    if (fd && d < fd) return false;
    var H = this.hoursFor(this.S.s, d);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) {
      var now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
      // A drop-off needs no slot: today is fine until closing. The floor is a
      // DATE for a drop-off (the parts' day; its time doesn't apply to a car
      // that is already with us).
      if (this.isDropOff()) return nm < H.close;
      if (nm + 120 > H.last) return false;
    }
    return true;
  };

  // ── Drop-off (owner, 2026-10-29) ─────────────────────────────────────────
  // A day and no time: the customer leaves the car any time we're open and
  // picks it up later that day. Each shop takes a set number a day; the
  // availability answer carries {cap, taken, full} when asked with drop_off=1.
  // The server is the authority: no dropOff key means "let them try".
  P.isDropOff = function () { return !!this.req && this.req.visit === "drop_off"; };

  P.dropStatus = function () {
    var R = this.req, a = R.avail || {}, shop = this.shops[this.S.s] || this.shops.sw;
    if (!R.date) return { ok: false, msg: "Pick a day." };
    if (a.loading) return { ok: false, loading: true, msg: "" };
    var d = parseISO(R.date);
    if (a.unavailable) return { ok: false, msg: "Online requests aren’t working right now. Call " + shop.name + " at " + shop.phone + "." };
    if (a.allDayBlocked) return { ok: false, msg: a.blockedReason || "We’re closed on " + dayLabel(d) + ". Pick another day." };
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) {
      var now = new Date();
      if (now.getHours() * 60 + now.getMinutes() >= this.hoursFor(this.S.s, d).close) return { ok: false, msg: "We’re closed for the rest of today. Pick another day." };
    }
    if (a.dropOff && a.dropOff.full) return { ok: false, full: true, msg: "Drop-offs are full on " + dayLabel(d) + ". Pick another day, or choose a time and wait." };
    return { ok: true, msg: "" };
  };

  var DROP_CHECKING = "One moment, we're still checking that day.";

  // "Tuesday, November 4"
  function longDay(d) {
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  // The day chips: the next 6 open days from the package's earliest date.
  P.reqDays = function () {
    var self = this;
    return this.dayList().filter(function (d) { return self.dayAllowed(d); }).slice(0, 6);
  };

  P.pickFirstDay = function () {
    var days = this.reqDays();
    if (days.length) this.selectDay(localISO(days[0]));
  };

  P.selectDay = function (iso) {
    var self = this, S = this.S;
    this.captureForm();
    this.req.date = iso; this.req.time = null; this.req.avail = { loading: true };
    // A drop-off's day message comes from this answer; drop the old one.
    if (this.isDropOff() && this.req.err) this.req.err.time = "";
    this.renderRequest();
    var url = this.apiBase + "/api/availability";
    var core = root.PTBookingCore;
    // drop_off=1 on every request from this dialog: it only ADDS the dropOff
    // key ({cap, taken, full}), so one answer serves both "wait" and
    // "drop off" and switching between them needs no second fetch.
    var p = core && core.fetchAvailability ? core.fetchAvailability(url, iso, S.s, { drop_off: 1 }) :
      root.fetch(url + "?date=" + encodeURIComponent(iso) + "&location_id=" + encodeURIComponent(S.s) + "&drop_off=1")
        .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
        .then(function (d) { return { booked: d.booked || [], allDayBlocked: !!d.allDayBlocked, blockedReason: d.blockedReason || null, dropOff: d.dropOff && typeof d.dropOff === "object" ? d.dropOff : null, unavailable: false }; })
        .catch(function () { return { booked: [], allDayBlocked: false, dropOff: null, unavailable: true }; });
    var seq = (this._availSeq = (this._availSeq || 0) + 1);
    p.then(function (a) {
      if (seq !== self._availSeq || self.req.date !== iso) return;
      self.req.avail = a;
      // "Still checking" (from a press of Send while this loaded) is answered now.
      if (self.req.err && self.req.err.time === DROP_CHECKING) self.req.err.time = "";
      self.captureForm();
      self.renderRequest();
    });
  };

  // Start times with `durationMinutes` of consecutive free half-hours inside
  // the day's hours, at or after the package floor (incl. the fit-check floor).
  P.slotsFor = function (iso, avail) {
    var d = parseISO(iso), S = this.S;
    var H = this.hoursFor(S.s, d);
    var dur = (this.D.bundle && this.D.bundle.durationMinutes) || 30;
    var need = Math.max(1, Math.ceil(dur / 30));
    var booked = (avail && avail.booked) || [];
    var all = [];
    for (var m = H.open; m <= H.last; m += 30) all.push(m);
    var free = {};
    all.forEach(function (m) {
      var inGap = H.gap && m >= H.gap[0] && m < H.gap[1];
      free[m] = !inGap && booked.indexOf(minsToTime(m)) === -1;
    });
    var floor = this.reqFloor();
    var floorMin = floor && floor.dateISO === iso ? timeToMins(floor.time) : null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var isToday = d.getTime() === today.getTime();
    var now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
    return all.map(function (m) {
      var ok = true, why = "";
      for (var k = 0; k < need; k++) { if (!free[m + 30 * k]) { ok = false; why = "Taken"; break; } }
      if (ok && floorMin != null && m < floorMin) { ok = false; why = "Too early"; }
      if (ok && isToday && !floor && m < nm + 120) { ok = false; why = "Needs 2 hours’ notice"; }
      if (ok && isToday && floor && m <= nm) { ok = false; why = "Passed"; }
      return { time: minsToTime(m), ok: ok, why: why };
    });
  };

  function ferr(id, msg) { return '<p class="ptpb__ferr" id="' + id + '"' + (msg ? "" : " hidden") + ">" + (msg ? ICON.warn + " " + esc(msg) : "") + "</p>"; }

  P.renderRequest = function (focusHead) {
    var self = this, S = this.S, R = this.req, E = R.err || {};
    var shop = this.shops[S.s] || this.shops.sw;
    var q = this.D.serverQuote && this.D.serverKey === this.selectionKey() ? this.D.serverQuote : null;
    var head = '<div class="ptpb__dlg-head"><div><span class="ptpb__eyebrow">Install request · ' + esc(shop.name) + "</span>" +
      '<h2 id="ptpb-dlg-title" tabindex="-1">' + (R.done ? "Request sent — we’ll confirm" : "Request install") + "</h2></div>" +
      '<button type="button" class="ptpb__x" data-act="dlg-close" aria-label="Close">✕</button></div>';
    var body = "";
    if (R.done) {
      var ics = R.done.ics ? '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="ics">Add to calendar</button>' : "";
      body = '<div class="ptpb__done" role="status">' + ICON.ok + "<div><p><b>Request sent — we’ll confirm.</b></p>" +
        (R.done.dropOff
          ? "<p>Drop-off requested for " + esc(R.done.when) + " at " + esc(shop.name) + ". Bring your car any time we're open; we'll text you when it's ready.</p>" +
            "<p>" + esc(shop.address) + ".</p>"
          : "<p>" + esc(R.done.when) + " at " + esc(shop.name) + ", " + esc(shop.address) + ".</p>") +
        (R.done.fitCheck ? "<p>Fit check: our " + esc(shop.name) + " manager will confirm fit within one business day.</p>" : "") +
        "<p>" + (R.done.dropOff ? "We’ll text you to confirm." : "We’ll text you to confirm your time.") + " You pay at the shop. Questions? Call " + '<a class="ptpb__link" href="tel:' + esc(shop.phoneHref) + '">' + esc(shop.phone) + "</a>.</p></div></div>" +
        '<div class="ptpb__btnrow">' + ics + '<button type="button" class="ptpb__btn ptpb__btn--primary" data-act="dlg-close">Done</button></div>';
    } else if (R.conflict) {
      var c = R.conflict;
      body = '<div class="ptpb__alert ptpb__alert--warn" role="alert"><div>' +
        (c.kind === "price" ? "<p>The price changed from " + money(c.from) + " to " + money(c.to) + " since you started.</p>" :
          "<p>" + esc(c.itemLabel) + " is no longer in stock here. Earliest is now " + esc(readyText(c.ready)) + ".</p>") +
        "</div></div>" +
        '<div class="ptpb__btnrow">' +
          (c.kind === "price" ? '<button type="button" class="ptpb__btn ptpb__btn--primary" data-act="accept-price">Send request at ' + money(c.to) + "</button>" :
            '<button type="button" class="ptpb__btn ptpb__btn--primary" data-act="new-time">Pick a new time</button>') +
          '<button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="dlg-close">Back to my package</button></div>';
    } else if (R.fatal) {
      body = '<div class="ptpb__alert ptpb__alert--bad" role="alert"><p>' + esc(R.error) + "</p></div>" +
        '<p>Call ' + esc(shop.name) + ' at <a class="ptpb__link" href="tel:' + esc(shop.phoneHref) + '">' + esc(shop.phone) + "</a> and we’ll sort it out.</p>" +
        '<div class="ptpb__btnrow"><button type="button" class="ptpb__btn ptpb__btn--ghost" data-act="dlg-close">Back to my package</button></div>';
    } else if (!q) {
      body = '<div class="ptpb__state ptpb__state--inline"><span class="ptpb__spin" aria-hidden="true"></span><p>Checking today’s price…</p></div>';
    } else {
      var floor = this.reqFloor();
      var o = this.currentObjects();
      var tpWord = S.tp === "new" ? "4 new sensors" : S.tp === "none" ? "no sensors" : "sensor reset";
      var days = this.reqDays().map(function (d) {
        var iso = localISO(d);
        return '<button type="button" id="ptpb-day-' + iso + '" class="ptpb__chip ptpb__day' + (R.date === iso ? " is-on" : "") + '" data-act="day" data-date="' + iso + '" aria-pressed="' + (R.date === iso) + '"><b>' + esc(dayLabel(d)) + "</b></button>";
      }).join("");
      var grid = "", drop = this.isDropOff(), dropMsg = "";
      if (drop) {
        // No time to pick: what to expect, that day's hours, and whether the
        // day can take another drop-off.
        var dst = this.dropStatus();
        if (R.date) {
          var dd = parseISO(R.date), DH = this.hoursFor(S.s, dd);
          var span = DH.gap ? minsToTime(DH.open) + " – " + minsToTime(DH.gap[0]) + " and " + minsToTime(DH.gap[1]) + " – " + minsToTime(DH.close)
            : minsToTime(DH.open) + " – " + minsToTime(DH.close);
          grid = "<p>Bring your car any time we're open that day. We'll text you when it's ready.</p>" +
            '<p class="ptpb__muted">' + esc(shop.name) + " is open " + esc(span) + " on " + esc(DOW_LONG[dd.getDay()]) + ".</p>" +
            (dst.loading ? '<p class="ptpb__muted">Checking that day…</p>' : "");
        }
        dropMsg = E.time || (dst.loading || !R.date ? "" : dst.msg);
      } else if (R.date) {
        var a = R.avail || {};
        if (a.loading) grid = '<p class="ptpb__muted">Checking open times…</p>';
        else if (a.unavailable) grid = '<p class="ptpb__err">Online requests aren’t working right now. Call ' + esc(shop.name) + ' at <a class="ptpb__link" href="tel:' + esc(shop.phoneHref) + '">' + esc(shop.phone) + "</a>.</p>";
        else if (a.allDayBlocked) grid = '<p class="ptpb__err">' + esc(a.blockedReason || "Not available this day. Please pick another.") + "</p>";
        else {
          var open = this.slotsFor(R.date, a).filter(function (s) { return s.ok; });
          grid = open.length ? open.map(function (s) {
            return '<button type="button" id="ptpb-slot-' + s.time.replace(/[^0-9APM]/gi, "") + '" class="ptpb__chip ptpb__slot' + (R.time === s.time ? " is-on" : "") + '" data-act="time" data-time="' + s.time + '" aria-pressed="' + (R.time === s.time) + '"><b>' + s.time + "</b></button>";
          }).join("") : '<p class="ptpb__muted">No open times this day. Please pick another day.</p>';
        }
      }
      body = '<div class="ptpb__recap"><span>' + esc((o.wheel ? wheelName(o.wheel) + " " + o.wheel.d + "″" : "") + (o.tire ? " · " + tireName(o.tire) + " " + S.sz : "") + " · " + tpWord) + "</span>" +
          "<b>Installed total " + money(q.totalCents) + " incl. GST</b></div>" +
        '<form data-ptpb-rform novalidate>' +
          "<p>" + (floor ? "Earliest is " + esc(drop ? (floor.dateISO ? dayLabel(parseISO(floor.dateISO)) : readyDay(floor)) : readyText(floor)) + (floor.reason ? ". " + esc(String(floor.reason).replace(/[.\s]+$/, "")) : "") + ". " : "") + "The " + esc(shop.name) + " manager confirms " + (drop ? "your drop-off" : "the time") + " by text.</p>" +
          '<fieldset class="ptpb__fs"><legend class="ptpb__eyebrow ptpb__legend">Your visit</legend><div class="ptpb__seg">' +
            ["wait", "drop_off"].map(function (v) {
              return '<label class="ptpb__seg-opt"><input type="radio" name="ptpb-visit" id="ptpb-visit-' + v + '" value="' + v + '"' + ((R.visit || "wait") === v ? " checked" : "") + "><span>" + (v === "wait" ? "Wait while we work" : "Drop off for the day") + "</span></label>";
            }).join("") + '</div><p class="ptpb__hint">Leave your car with us and pick it up later that day.</p></fieldset>' +
          '<fieldset class="ptpb__fs"><legend class="ptpb__eyebrow ptpb__legend">Day</legend><div class="ptpb__slots" role="group" aria-label="Day">' + (days || '<p class="ptpb__muted">No open days in the next three weeks. Call ' + esc(shop.phone) + ".</p>") + "</div></fieldset>" +
          (drop
            ? '<fieldset class="ptpb__fs" aria-describedby="ptpb-r-time-err"><legend class="ptpb__eyebrow ptpb__legend">Drop-off</legend><div class="ptpb__dropinfo" id="ptpb-r-drop">' + grid + "</div>" + ferr("ptpb-r-time-err", dropMsg) + "</fieldset>"
            : '<fieldset class="ptpb__fs" aria-describedby="ptpb-r-time-err"><legend class="ptpb__eyebrow ptpb__legend">Time</legend><div class="ptpb__slots" role="group" aria-label="Start times" id="ptpb-r-slots">' + grid + "</div>" + ferr("ptpb-r-time-err", E.time) + "</fieldset>") +
          '<div class="ptpb__grid2">' +
            rfield("ptpb-r-name", "Your name", '<input id="ptpb-r-name" autocomplete="name" required maxlength="80" value="' + esc(R.name || "") + '" aria-describedby="ptpb-r-name-err"' + (E.name ? ' aria-invalid="true"' : "") + ">" + ferr("ptpb-r-name-err", E.name)) +
            rfield("ptpb-r-phone", "Mobile number", '<input id="ptpb-r-phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(403) 555-0123" required maxlength="30" value="' + esc(R.phone || "") + '" aria-describedby="ptpb-r-phone-err"' + (E.phone ? ' aria-invalid="true"' : "") + ">" + ferr("ptpb-r-phone-err", E.phone)) +
          "</div>" +
          rfield("ptpb-r-email", "Email (for your confirmation)", '<input id="ptpb-r-email" type="email" autocomplete="email" required maxlength="120" value="' + esc(R.email || "") + '" aria-describedby="ptpb-r-email-err"' + (E.email ? ' aria-invalid="true"' : "") + ">" + ferr("ptpb-r-email-err", E.email)) +
          '<details class="ptpb__more ptpb__more--sm"' + (R.notes ? " open" : "") + "><summary>Add a note (optional)</summary>" + rfield("ptpb-r-notes", "Note", '<textarea id="ptpb-r-notes" rows="2" maxlength="1000">' + esc(R.notes || "") + "</textarea>") + "</details>" +
          '<div class="ptpb__hp" aria-hidden="true"><label for="ptpb-r-hp">Company website</label><input id="ptpb-r-hp" name="company_website" tabindex="-1" autocomplete="off"></div>' +
          (q.verdict === "fit_check" ? "<p>The " + esc(shop.name) + " manager checks fit on your " + esc(this.vehicleModel()) + " before anything is mounted. The price won’t change.</p>" : "") +
          (R.error ? '<p class="ptpb__err" role="alert">' + R.error + "</p>" : "") +
          '<p class="ptpb__fine">This is a request. Nothing is final until we confirm. You pay at the shop.</p>' +
          '<div class="ptpb__btnrow"><button type="submit" class="ptpb__btn ptpb__btn--primary ptpb__btn--block"' + (R.sending ? " disabled" : "") + ">" + (R.sending ? "Sending…" : "Send request") + "</button></div>" +
        "</form>";
    }
    this.paint(this.dlgBody, head + '<div class="ptpb__dlg-body">' + body + "</div>");
    if (focusHead || R.done) { var h = $("#ptpb-dlg-title", this.dlgBody); if (h) h.focus(); }

    function rfield(id, label, control) {
      return '<div class="ptpb__field"><label for="' + id + '">' + esc(label) + "</label>" + control + "</div>";
    }
  };

  P.captureForm = function () {
    var R = this.req;
    if (!doc.getElementById("ptpb-r-name")) return;
    function v(id) { var e = doc.getElementById(id); return e ? String(e.value || "").trim() : ""; }
    R.name = v("ptpb-r-name"); R.phone = v("ptpb-r-phone"); R.email = v("ptpb-r-email"); R.notes = v("ptpb-r-notes");
    R.hp = v("ptpb-r-hp");
  };

  P.sendRequest = function () {
    var self = this, S = this.S, R = this.req;
    this.captureForm();
    var digits = String(R.phone || "").replace(/\D/g, "");
    if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
    var drop = this.isDropOff(), dst = drop ? this.dropStatus() : null;
    var E = {
      // A drop-off has no time: it needs an open day that isn't full instead.
      time: drop ? (dst.ok ? "" : dst.loading ? DROP_CHECKING : dst.msg) : (R.time ? "" : "Pick a time."),
      name: R.name ? "" : "Enter your name.",
      phone: digits.length === 10 ? "" : "Enter a 10-digit mobile number, like 403 555 0123.",
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(R.email || "") ? "" : "Enter your email so we can send your confirmation."
    };
    R.err = E; R.error = "";
    if (E.time || E.name || E.phone || E.email) {
      this.renderRequest();
      var first = E.time ? ((!drop && $(".ptpb__slot", this.dlgBody)) || $(".ptpb__day.is-on", this.dlgBody) || $(".ptpb__day", this.dlgBody)) : E.name ? doc.getElementById("ptpb-r-name") : E.phone ? doc.getElementById("ptpb-r-phone") : doc.getElementById("ptpb-r-email");
      if (first) first.focus();
      return;
    }
    var q = this.D.serverQuote;
    if (!q) return;
    R.sending = true;
    this.renderRequest();
    var shop = this.shops[S.s] || this.shops.sw;
    var body = {
      mode: "install", selection: this.selectionBody(),
      contact: { name: R.name.slice(0, 80), phone: R.phone.slice(0, 30), email: R.email.slice(0, 120) },
      date: R.date, notes: (R.notes || "").slice(0, 1000),
      shownTotalCents: q.totalCents, shownLinesDigest: q.linesDigest,
      company_website: R.hp || "", elapsedMs: nowMs(), requestId: R.requestId || newRequestId()
    };
    // Drop-off: no time at all (the server allows that only for waitOrDrop
    // "drop_off"); a timed request says "wait" and carries its time.
    body.waitOrDrop = drop ? "drop_off" : "wait";
    if (!drop) body.time = R.time;
    R.requestId = body.requestId; // a retry resends the same id (the server also dedupes the booking)
    this.api("request", { method: "POST", body: body, channel: "request", timeout: 25000 }).then(function (r) {
      R.sending = false;
      var d = r.data || {};
      if (r.ok) {
        var when = drop ? longDay(parseISO(R.date)) : dayLabel(parseISO(R.date)) + ", " + R.time;
        var ics = null;
        try {
          var core = root.PTBookingCore;
          if (core && core.buildICS) ics = drop
            ? core.buildICS({ dateISO: R.date, allDay: true,
              summary: "Prince Tires: wheel & tire package drop-off (request, we'll confirm)", description: "Drop-off request at " + shop.name + ". Bring your car any time we're open; we'll text you when it's ready.", location: shop.address })
            : core.buildICS({ dateISO: R.date, time: R.time, durationMinutes: (self.D.bundle || {}).durationMinutes || 60,
              summary: "Prince Tires: wheel & tire package (request, we'll confirm)", description: "Install request at " + shop.name + ". We'll text you to confirm.", location: shop.address });
        } catch (e) {}
        R.done = { when: when, dropOff: drop, fitCheck: !!d.fitCheck, ics: ics, id: d.id };
        track("pkg_request_ok", { mode: "install", fitCheck: !!d.fitCheck, total: q.totalCents });
        self.announce("Request sent. We'll confirm.");
        self.renderRequest(true);
        return;
      }
      if (r.status === 409 && d.quote) {
        var key = self.selectionKey();
        if (d.error === "price_changed") {
          R.conflict = { kind: "price", from: q.totalCents, to: d.quote.totalCents };
          track("pkg_price_changed", { from: q.totalCents, to: d.quote.totalCents });
        } else {
          var lbl = d.item === "wheel" ? "Your wheels" : (d.item === "tire" ? "Your tires" : "An item in your package");
          R.conflict = { kind: "stock", itemLabel: lbl, ready: (d.quote.readyBy || {})[S.s] };
        }
        self.D.serverQuote = d.quote; self.D.serverKey = key;
        self.render();
        self.renderRequest(true);
        return;
      }
      if (r.status === 409 && d.unavailable) {
        R.fatal = true; R.error = d.unavailable.reason || "One of your items is no longer in stock as a set of 4.";
        self.D.unavailable = d.unavailable; self.D.serverQuote = null; self.D.serverKey = "";
        self.render(); self.renderRequest(true);
        return;
      }
      if (r.status === 429) R.error = "Too many tries — please wait a minute and send again.";
      else if (r.status >= 400 && r.status < 500 && d.error) {
        R.error = esc(d.error);
        // Drop-offs filled while they typed (a 400 — 409 means "slot taken").
        if (drop && r.status === 400 && /drop-offs are full/i.test(String(d.error)) && R.avail) R.avail.dropOff = { cap: 0, taken: 0, full: true };
      }
      else if (r.status === 0) {
        // Timed out or the connection dropped: the request may well have
        // landed. Don't invite a blind resend (a resend is deduped, but say so).
        R.error = "We may have received your request — check your email and texts. If nothing arrives in a few minutes, call " + esc(shop.name) + ' at <a class="ptpb__link" href="tel:' + esc(shop.phoneHref) + '">' + esc(shop.phone) + "</a> before sending again.";
      }
      else R.error = "We couldn’t send that — call " + esc(shop.name) + ' at <a class="ptpb__link" href="tel:' + esc(shop.phoneHref) + '">' + esc(shop.phone) + "</a>.";
      self.renderRequest();
    });
  };

  // ══════════════════════════════════════════════════════════════════════
  // Events (delegated)
  // ══════════════════════════════════════════════════════════════════════
  P.bindEvents = function () {
    var self = this, app = this.app;
    // How the last choice was made: an arrow key on a wheel (or one of our
    // picks) only selects; ANY other change commits it (fold + tires into view):
    // a click, a tap, Space / Enter, and a screen reader's browse-mode
    // activation (a plain click with no pointerdown or keydown).
    var lastArrow = 0;
    var ARROWS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Up: 1, Down: 1, Left: 1, Right: 1 };
    var byArrow = function () { return Date.now() - lastArrow < 500; };
    app.addEventListener("pointerdown", function () { lastArrow = 0; }, true);
    app.addEventListener("keydown", function (e) {
      var t = e.target;
      lastArrow = ARROWS[e.key] && t && (t.name === "ptpb-wheel" || t.name === "ptpb-preset") ? Date.now() : 0;
    }, true);
    // Space / Enter on a wheel (or one of our picks) commits it: fold the list,
    // bring the tires into view, focus the tire heading. Arrow keys only select.
    app.addEventListener("keydown", function (e) {
      var t = e.target;
      if (!t || (t.name !== "ptpb-wheel" && t.name !== "ptpb-preset") || t.disabled) return;
      if ((e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      t.checked = true;
      if (t.name === "ptpb-wheel") {
        self.cancelSettle();
        var kw = self.wheelById(t.value);
        if (t.value !== self.S.w) self.chooseWheel(t.value, { commit: "key" });
        else if (self.wheelGone()) self.announce("This wheel isn't available any more. Pick another wheel.");
        else self.showTires("key", kw ? "Wheel picked: " + wheelName(kw) + " " + kw.d + "″. Showing tires that fit." : "");
        return;
      }
      var p = ((self.D.wheels && self.D.wheels.presets) || []).filter(function (x) { return x.tier === t.value; })[0];
      if (p && !self.presetOn(p)) self.applyPreset(t.value, "key");
      else self.showTires("key", "Showing tires for our pick.");
    });

    app.addEventListener("keydown", function (e) {
      if (e.target && e.target.id === "ptpb-vvin" && e.key === "Enter") { e.preventDefault(); self.lookupVin(); }
      // An "All N" select driven by the keyboard: arrows / letters step through
      // it (focus stays); Enter commits and moves on to the next field.
      var sf = e.target && VFIELDS.filter(function (f) { return f.id === e.target.id; })[0];
      if (sf) {
        if (e.key === "Enter") { if (self._selStay) { e.preventDefault(); self._selKey = null; self.commitSelectStep(true); } }
        else if (e.key !== "Tab" && e.key !== "Shift" && e.key !== "Escape") self._selKey = e.target.id;
      }
    });
    // The customer's own scrolling / typing (relandTires never overrides it).
    ["wheel", "touchmove", "keydown"].forEach(function (ev) {
      root.addEventListener(ev, function () { self._userAt = Date.now(); }, { passive: true, capture: true });
    });
    app.addEventListener("pointerdown", function (e) {
      if (e.target && VFIELDS.some(function (f) { return f.id === e.target.id; })) self._selKey = null;
    });
    app.addEventListener("focusout", function (e) {
      if (!e.target || !VFIELDS.some(function (f) { return f.id === e.target.id; })) return;
      self._selKey = null;
      if (self._selStay) setTimeout(function () { self.commitSelectStep(false); }, 0);
    });
    app.addEventListener("input", function (e) { if (e.target && e.target.id === "ptpb-vvin") self.vinDraft = e.target.value; });

    app.addEventListener("change", function (e) {
      var t = e.target, S = self.S;
      if (!t) return;
      var id = t.id || "", name = t.name || "";
      if (id === "ptpb-budget") { self.writeUrl(); return; }   // live on input
      var vf = VFIELDS.filter(function (f) { return f.id === id; })[0];
      if (vf) { self.setVehicleField(vf.k, t.value, { stay: self._selKey === id }); return; }
      if (id === "ptpb-vt") { var pv = self.capturePrev(); S.vt = t.value; S.lift = TRUCKISH.indexOf(S.vt) === -1 ? null : S.lift; if (S.pt === "truck" && TRUCKISH.indexOf(S.vt) === -1) S.pt = "winter"; self.writeUrl(); self.loadBundle(pv); return; }
      if (name === "ptpb-shop") { self.setShop(t.value); return; }
      if (name === "ptpb-lift") { var pl = self.capturePrev(); S.lift = t.value; if (S.lift !== "lifted") S.li = null; self.writeUrl(); self.renderVehicleExtras(); if (S.lift !== "lifted" || S.li) self.loadWheels(pl); return; }
      if (id === "ptpb-li") { var pi = self.capturePrev(); S.li = t.value; self.writeUrl(); if (S.li) self.loadWheels(pi); return; }
      if (name === "ptpb-pt") {
        var pp = self.capturePrev();
        S.pt = t.value; S._ptDefault = false;
        if (pp) pp.reason = "these wheels for " + (PACKAGE_TYPES.filter(function (x) { return x.id === S.pt; })[0] || {}).chip.toLowerCase();
        self.writeUrl(); self.loadWheels(pp);
        return;
      }
      if (name === "ptpb-lk" || name === "ptpb-ws") {
        S[name === "ptpb-lk" ? "lk" : "ws"] = t.value;
        self.staleUndo();
        self.writeUrl(); self.render();
        self.announce(self.answerMsg());
        return;
      }
      if (name === "ptpb-pr") { self.setPrio(t.value); return; }
      if (name === "ptpb-preset") { self.applyPreset(t.value, byArrow() ? null : "pointer"); return; }
      if (name === "ptpb-wheel") {
        self.cancelSettle();
        if (!byArrow()) { self.chooseWheel(t.value, { commit: "pointer" }); return; }
        // Arrow keys move the checked radio (native radio behaviour; the card's
        // "Selected" look follows :checked at once). The pick settles 500 ms
        // after the last arrow press, so browsing never re-prices or logs on
        // every key, and it never folds the list or moves focus: Space / Enter
        // does that (keydown below).
        // The list stays open even on a first pick (no wheel yet), so the
        // focused radio never folds away.
        var kv = t.value, kw = self.wheelById(kv), rid = t.id, w0 = S.w;
        self.expanded = true;
        if (kw) self.announce(wheelName(kw) + " " + kw.d + "″ selected. Press Enter to see tires for it.", true);
        self._wkT = setTimeout(function () {
          self._wkT = null;
          // Only if nothing else chose a wheel meanwhile and this radio is still the checked one.
          var r = doc.getElementById(rid);
          if (self.S.w !== w0 || !r || !r.checked) return;
          self.expanded = true;
          self.chooseWheel(kv);
        }, 500);
        return;
      }
      if (name === "ptpb-sz") { self.chooseSize(t.value); return; }
      if (name === "ptpb-tire") { self.chooseTire(t.value); return; }
      if (name === "ptpb-tp") { S.tp = t.value; if (S.tp !== "none") S._ack = false; self.changed(); return; }
      if (id === "ptpb-ack") { S._ack = t.checked; self.renderFinish(); return; }
      if (id === "ptpb-claim") { S._tpmsClaim = t.checked; self.D.serverKey = ""; self.loadBundle(); return; }
      if (id === "ptpb-rf") { S.rf = t.checked; self.changed(); return; }
      if (id === "ptpb-rh") { S.rh = t.checked; self.changed(); return; }
      if (name === "ptpb-qshop") { S.s = t.value; self.writeUrl(); return; }
      if (name === "ptpb-visit" && self.req) {
        // Wait ↔ drop off. One availability answer serves both (drop_off=1);
        // only the allowed days can differ (a drop-off can be today until close).
        self.captureForm();
        var Rq = self.req;
        Rq.visit = t.value === "drop_off" ? "drop_off" : "wait";
        if (Rq.err) Rq.err.time = "";
        Rq.error = "";
        var dOk = Rq.date && self.reqDays().some(function (x) { return localISO(x) === Rq.date; });
        if (dOk) self.renderRequest();
        else { Rq.date = null; Rq.time = null; self.renderRequest(); self.pickFirstDay(); }
        return;
      }
    });

    // Budget slider: live while dragging, one render per frame.
    app.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || t.id !== "ptpb-budget") return;
      var r = self.budgetRange(); if (!r) return;
      var v = +t.value;
      self.S.bg = v >= r.max ? null : v;
      self.staleUndo();
      if (root.cancelAnimationFrame) root.cancelAnimationFrame(self._bgRaf);
      var run = function () {
        self.renderBudgetDeps();
        self.announce((self.S.bg == null ? "No budget limit. " : "Budget up to " + commas(self.S.bg) + " dollars. ") + self.answerMsg());
      };
      self._bgRaf = root.requestAnimationFrame ? root.requestAnimationFrame(run) : (run(), 0);
      clearTimeout(self._bgUrlT); self._bgUrlT = setTimeout(function () { self.writeUrl(); }, 250);
    });

    app.addEventListener("toggle", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-key") === "settech") self._setTechOpen = t.open;
    }, true);

    app.addEventListener("click", function (e) {
      // Clicking the wheel (or pick) that is already chosen, with the list open:
      // keep it and go back to the tires (no change event fires for it).
      var tg = e.target;
      if (tg && (tg.name === "ptpb-wheel" || tg.name === "ptpb-preset") && self.expanded && self.S.w && !byArrow() && !self.wheelGone()) {
        var same = tg.name === "ptpb-wheel" ? tg.value === self.S.w :
          ((self.D.wheels && self.D.wheels.presets) || []).some(function (x) { return x.tier === tg.value && self.presetOn(x); });
        if (same) { self.showTires("pointer", "Kept your wheel. Showing tires that fit."); return; }
      }
      var a = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      if (!a || !app.contains(a)) return;
      var act = a.getAttribute("data-act"), S = self.S;
      if (act === "why") {
        var k = a.getAttribute("data-key");
        self.whyOpen[k] = !self.whyOpen[k];
        var p = doc.getElementById("ptpb-why-" + k);
        if (p) p.hidden = !self.whyOpen[k];
        a.setAttribute("aria-expanded", String(!!self.whyOpen[k]));
      } else if (act === "undo") self.undo(a.getAttribute("data-id"));
      else if (act === "rm") {
        var key = a.getAttribute("data-key"), snap = self.snapshot();
        if (key === "road_force") { S.rf = false; self.pushLog("Road force balancing removed.", snap); }
        if (key === "road_hazard") { S.rh = false; self.pushLog("Road hazard protection removed.", snap); }
        if (key === "tpms") { S.tp = "none"; self.pushLog("TPMS sensors removed: your warning light will stay on.", snap); }
        self.changed();
      }
      else if (act === "request") self.openRequest();
      else if (act === "copy") self.copyLink(a);
      else if (act === "sheet-open") self.openSheet();
      else if (act === "sheet-close") self.closeSheet(true);
      else if (act === "goto") { var sec = doc.getElementById(a.getAttribute("data-target")); self.closeSheet(); if (sec) { sec.scrollIntoView({ block: "start" }); var hh = $("h2", sec); if (hh) { hh.setAttribute("tabindex", "-1"); hh.focus({ preventScroll: true }); } } }
      else if (act === "toquote") self.setLane("quote", { reasons: [] });
      else if (act === "retry") { if (self.D.bundle && self.D.bundle.vehicle) self.loadWheels(); else self.loadBundle(); }
      else if (act === "retrytires") { self.tiresError = false; self.ensureTires(S.w).then(function () { self.settleTire(null, null); }); }
      else if (act === "allbrands") { S.brand = null; self.writeUrl(); self.loadWheels(); }
      else if (act === "keeptire") {
        self.cancelSettle();
        var c = self.conflict;
        if (c && c.mine) {
          var ksz = c.prev && c.prev.snap && c.prev.snap.t === c.mine.id ? c.prev.snap.sz : (c.mineSize || null);
          self.keepTire = { id: c.mine.id, size: ksz, brand: c.mine.brand, model: c.mine.model, title: c.mine.title };
          if (c.prev && c.prev.snap) {
            var prevW = c.prev.snap.w;
            for (var kk in c.prev.snap) if (Object.prototype.hasOwnProperty.call(c.prev.snap, kk) && kk !== "_myTire") S[kk] = c.prev.snap[kk];
            self.myTire = c.mine;
            self.conflict = null;
            if (self.log.length && self.log[0].prev === c.prev.snap) self.log.shift();
            self.pushLog("Kept your " + tireName(c.mine) + ". Wheels that take it are listed first.", null);
            self.expanded = true;   // they pick a different wheel next: open the list
            self.ensureTires(prevW).then(function () { self.changed(); var h = doc.getElementById("ptpb-h-wheel"); smoothTo(doc.getElementById("ptpb-sec-wheel")); focusQuiet(h); });
          }
        }
      }
      else if (act === "use-suggest") {
        self.cancelSettle();
        var sg = self.conflict && self.conflict.suggest;
        if (sg) {
          S.t = sg.tire.id; S.sz = sg.size.size; S.ta = false; self.myTire = sg.tire; self.conflict = null;
          self.pushLog("Now on " + tireName(sg.tire) + " " + sg.size.size + ".", null);
          self.changed();
          focusQuiet(doc.getElementById("ptpb-t-" + (sg.tire.variantId || sg.tire.id)));
        }
      }
      else if (act === "clear") { S[a.getAttribute("data-key")] = "any"; self.writeUrl(); self.render(); self.announce(self.answerMsg()); focusQuiet(doc.getElementById("ptpb-h-wheel")); }
      else if (act === "reset-answers") { S.lk = "any"; S.ws = "any"; S.bg = null; self.writeUrl(); self.render(); self.announce("Answers cleared. " + self.answerMsg()); focusQuiet(doc.getElementById("ptpb-h-wheel")); }
      else if (act === "fit-budget") self.fitBudget();
      else if (act === "vpick") self.setVehicleField(a.getAttribute("data-key"), a.getAttribute("data-id"));
      else if (act === "vtab") { self.vTab = a.getAttribute("data-key"); self.renderCard(); var vp = '[data-ptpb-vpanel="' + self.vTab + '"] '; focusQuiet($(vp + ".ptpb__vtile.is-on", self.app) || $(vp + ".ptpb__vtile", self.app) || $(vp + "select", self.app) || a); }
      else if (act === "vchange") { self.vOpen = true; self.vTab = "y"; self.renderCard(); var vq = doc.getElementById("ptpb-vq"); smoothTo($("[data-ptpb-garage]", self.app)); focusQuiet($('.ptpb__vtab[data-key="y"]', self.app) || vq); }
      else if (act === "vkeep") { self.vOpen = false; self.vTab = null; self.vinOpen = false; self.renderCard(); focusQuiet($('[data-act="vchange"]', self.app)); }
      else if (act === "vinopen") { self.vinOpen = !self.vinOpen; self.vinErr = ""; self.renderCard(); if (self.vinOpen) focusQuiet(doc.getElementById("ptpb-vvin")); }
      else if (act === "vinlookup") self.lookupVin();
      else if (act === "vgarage") {
        var gv = self.garageVehicle();
        if (gv) {
          S.y = gv.y; S.mk = gv.mk; S.md = gv.md; S.tr = gv.tr || null;
          self.resetVehicle(); self.vOpen = false; self.vTab = null;
          self.cascade(true).then(function () { self.writeUrl(); self.renderCard(); self.focusCard(); if (self.vehicleComplete()) self.loadBundle(); else self.setLane("pick"); });
        }
      }
      else if (act === "jump") { var rh = doc.getElementById("ptpb-results"); smoothTo(rh); focusQuiet(rh); }
      else if (act === "change-wheel") self.unfold(true);
      else if (act === "expand") self.unfold(false);
      else if (act === "fold") { if (self.wheelGone()) return; var fw = self.wheelById(S.w); self.showTires("pointer", fw ? "Kept " + wheelName(fw) + ". Showing tires that fit." : ""); }
      else if (act === "change-tire") {
        var tl = $(".ptpb__tlist", self.laneEl);
        smoothTo(tl || doc.getElementById("ptpb-sec-tire"));
        var tr = S.t && $('input[name="ptpb-tire"][value="' + S.t + '"]', self.laneEl);
        focusQuiet(tr || doc.getElementById("ptpb-h-tire"));
      }
      else if (act === "viz") {
        var vw = self.wheelById(S.w);
        if (!vw) return;
        if (self.vizShown === vw.id) { self.vizShown = null; self.renderSet(); return; }
        self.vizShown = vw.id;
        self.loadViz(vw);
        self.renderSet();
      }
      else if (act === "vizcar") self.openCar(a.getAttribute("data-id"));
      else if (act === "pickw") { var pr = $('input[name="ptpb-wheel"][value="' + a.getAttribute("data-id") + '"]', self.laneEl); if (pr) pr.click(); }
      else if (act === "car-close") self.closeCar();
      else if (act === "car-pick") { var cid = a.getAttribute("data-id"); self.closeCar(); self.chooseWheel(cid, { commit: "pointer" }); }
      else if (act === "vin") {
        var raw = (doc.getElementById("ptpb-vin") || {}).value || "";
        var vin = raw.replace(/\s+/g, "").toUpperCase();
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
          S._vinDraft = raw;
          S._vinErr = vin.length !== 17 ? "A VIN has 17 letters and numbers. You entered " + vin.length + "." : "A VIN never has the letters I, O or Q.";
          self.renderNeeds();
          var vi = doc.getElementById("ptpb-vin"); if (vi) vi.focus();
          self.announce(S._vinErr);
          return;
        }
        S._vinErr = ""; S._vinDraft = null;
        S._vin = vin; self.loadBundle();
      }
      // request dialog
      else if (act === "dlg-close") self.closeRequest();
      else if (act === "day") self.selectDay(a.getAttribute("data-date"));
      else if (act === "time") {
        self.captureForm();
        self.req.time = a.getAttribute("data-time");
        if (self.req.err) self.req.err.time = "";
        self.renderRequest();
      }
      else if (act === "accept-price") { self.req.conflict = null; self.sendRequest(); }
      else if (act === "new-time") { self.req.conflict = null; self.req.time = null; self.renderRequest(); if (self.req.date) self.selectDay(self.req.date); }
      else if (act === "ics") { try { root.PTBookingCore.downloadICS(self.req.done.ics, "prince-tires-package.ics"); } catch (e2) {} }
    });

    app.addEventListener("submit", function (e) {
      var f = e.target;
      if (f.hasAttribute("data-ptpb-qform")) { e.preventDefault(); self.sendQuote(); }
      if (f.hasAttribute("data-ptpb-rform")) { e.preventDefault(); self.sendRequest(); }
    });

    this.scrim && this.scrim.addEventListener("click", function () { self.closeSheet(true); });
    // Rotating or widening to desktop with the sheet open: close it (and lift the inert page).
    var mq = root.matchMedia ? root.matchMedia(SHEET_MQ) : null;
    var onMq = function () { if (!mq.matches && doc.documentElement.classList.contains("ptpb-sheet-open")) self.closeSheet(false); };
    if (mq) { if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq); }
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && doc.documentElement.classList.contains("ptpb-sheet-open") && !$("dialog[open]", self.app)) self.closeSheet(true);
    });
    this.carDlg && this.carDlg.addEventListener("close", function () { self.carWheel = null; });
  };

  P.answerMsg = function () {
    var self = this;
    var m = this.okWheels().filter(function (w) { return self.matches(w); });
    var n = m.length, inb = m.filter(function (w) { return self.wheelBudget(w) === 0; }).length;
    return plural(n, "wheel") + " match" + (n === 1 ? "es" : "") + (this.bud() != null ? ", " + inb + " within your budget" : "") + ".";
  };

  P.resetVehicle = function (keepTrims) {
    this.D.bundle = null; this.D.wheels = null; this.D.serverQuote = null; this.D.serverKey = "";
    this.tiresCache = {}; this.log = []; this._seenW = {}; this.conflict = null; this.vizShown = null; this.myTire = null; this.keepTire = null;
    this.expanded = false; this.cancelSettle();
    var S = this.S;
    S.w = null; S.t = null; S.sz = null; S.ta = false; S.vt = null; S.lift = null; S.li = null; S._vin = null; S._tpmsClaim = false; S._ack = false;
    if (!keepTrims) { this._serverTrims = null; this.hideServerTrims(); }
    var vtSel = $("#ptpb-vt", this.app); if (vtSel) vtSel.innerHTML = "";
  };

  P.copyLink = function (btn) {
    var url = root.location.href;
    var orig = btn.textContent;
    var done = function () { btn.textContent = "Link copied"; setTimeout(function () { btn.textContent = orig; }, 2000); };
    try {
      if (root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(url).then(done, function () { root.prompt("Copy this link:", url); }); return; }
    } catch (e) {}
    root.prompt("Copy this link:", url);
  };

  // ══════════════════════════════════════════════════════════════════════
  // Boot
  // ══════════════════════════════════════════════════════════════════════
  function boot() {
    $all("[data-ptpb]").forEach(function (el) {
      if (el.__ptpb) return;
      el.__ptpb = new Builder(el);
    });
  }
  root.PTPackageBuilder = { Builder: Builder, boot: boot, compute: compute, looksOf: looksOf };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : this);
