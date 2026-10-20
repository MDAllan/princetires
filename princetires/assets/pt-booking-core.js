/*
 * pt-booking-core.js — shared booking utilities for the 3 booking surfaces
 * (pt-booking-modal, pt-service-booking-modal, pt-booking-page).
 *
 * These are the DOM-INDEPENDENT pieces that were duplicated across all three:
 * reading the #pt-locations-data island, picking the location, the local-date
 * helper, the availability fetch, the .ics builder, and the NAP formatter.
 *
 * Surface-specific logic (steps, fields, payload construction, price/tier rules,
 * DOM wiring) stays in each surface. Each surface builds its own payload and owns
 * its own DOM — this module only shares the stable plumbing.
 *
 * Loaded synchronously in the <head> (layout/theme.liquid) so window.PTBookingCore
 * exists before any inline booking script runs.
 */
(function () {
  "use strict";

  var SW_FALLBACK = {
    address: "111 42 Ave SW, Calgary",
    addressFull: "111 42 Ave SW, Calgary, AB T2G 0A4",
    phone: "(403) 452-4283",
  };

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  var Core = {
    SW_FALLBACK: SW_FALLBACK,

    // Local YYYY-MM-DD (never UTC — toISOString would shift the day). Matches the
    // old bkLocalISO + the inline copies in the other two surfaces.
    localISO: function (d) {
      return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    },

    // Parse the global #pt-locations-data island -> { all, bookable }. Defensive:
    // any missing island / parse error yields empty arrays so booking never breaks.
    loadLocations: function () {
      try {
        var el = document.getElementById("pt-locations-data");
        var all = el ? JSON.parse(el.textContent) : [];
        if (!Array.isArray(all)) all = [];
        return {
          all: all,
          bookable: all.filter(function (l) { return l && l.bookable === true; }),
        };
      } catch (e) {
        return { all: [], bookable: [] };
      }
    },

    bySlug: function (locs, slug) {
      for (var i = 0; i < (locs || []).length; i++) {
        if (locs[i] && locs[i].slug === slug) return locs[i];
      }
      return null;
    },

    // Pick the initial location from a list of BOOKABLE locations:
    // an explicit slug (data-location / ?location=) -> the primary shop -> first.
    pickLocation: function (bookable, slug) {
      bookable = bookable || [];
      if (slug) {
        var hit = Core.bySlug(bookable, slug);
        if (hit) return hit;
      }
      // The shop a booking STARTS on, which is not the same question as which
      // shop is the main business. booking_default wins; is_primary is the
      // fallback so a theme that never sets one behaves exactly as before.
      for (var i = 0; i < bookable.length; i++) {
        if (bookable[i] && bookable[i].booking_default) return bookable[i];
      }
      for (var j = 0; j < bookable.length; j++) {
        if (bookable[j] && bookable[j].is_primary) return bookable[j];
      }
      return bookable[0] || null;
    },

    // The deep-link slug from ?location= (or null).
    queryLocationSlug: function () {
      try {
        return new URLSearchParams(window.location.search).get("location");
      } catch (e) {
        return null;
      }
    },

    // NAP for a location with the SW fallback baked in — the surfaces inject these
    // into their own (differently-id'd) done cards.
    napOf: function (loc) {
      loc = loc || {};
      return {
        publicName: loc.public_name || "Prince Tires",
        address: loc.address || SW_FALLBACK.address,
        addressFull: loc.address_full || loc.address || SW_FALLBACK.addressFull,
        phone: loc.phone || SW_FALLBACK.phone,
      };
    },

    // GET availability. `apiBase` is the surface's AVAILABILITY_API constant;
    // `locationSlug` is the selected shop's slug (or falsy for single-location).
    // `extra` (optional) names the product being booked — product_handle,
    // variant_id, qty, book_type — so the server can answer that product's
    // EARLIEST bookable slot with the same rules /api/book refuses with. The
    // storefront cannot know a tire is coming from the supplier's Edmonton
    // warehouse; only the feed does. Without this, a customer was offered a day
    // the POST then refused at the last step of the form.
    //
    // Always resolves, never rejects:
    //   { booked: string[], allDayBlocked: boolean,
    //     blockedReason: string|null,            // why, when allDayBlocked
    //     earliest: {date,time,label,reason}|null } // this product's floor
    fetchAvailability: function (apiBase, dateISO, locationSlug, extra) {
      var url = apiBase + "?date=" + encodeURIComponent(dateISO);
      if (locationSlug) url += "&location_id=" + encodeURIComponent(locationSlug);
      if (extra) {
        Object.keys(extra).forEach(function (k) {
          var v = extra[k];
          if (v !== undefined && v !== null && v !== "") url += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(v);
        });
      }
      return fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var e = d && d.earliest && d.earliest.date ? d.earliest : null;
          return {
            booked: Array.isArray(d && d.booked) ? d.booked : [],
            allDayBlocked: !!(d && d.allDayBlocked),
            blockedReason: (d && typeof d.blockedReason === "string" && d.blockedReason) || null,
            earliest: e ? { date: String(e.date), time: String(e.time || ""), label: String(e.label || ""), reason: String(e.reason || "") } : null,
          };
        })
        .catch(function () { return { booked: [], allDayBlocked: false, blockedReason: null, earliest: null }; });
    },

    // POST a booking. The SURFACE builds the payload (shapes differ per surface);
    // this only shares the fetch mechanics. Resolves { ok, status, data }.
    postBooking: function (apiBase, payload) {
      return fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (r) {
        return r.json().then(
          function (j) { return { ok: r.ok, status: r.status, data: j }; },
          function () { return { ok: r.ok, status: r.status, data: null }; }
        );
      });
    },

    // Build an .ics string. Parameterized for the per-surface differences:
    //   { dateISO:'YYYY-MM-DD', time:'9:30 AM', durationMinutes, summary, description, location }
    // Returns the ICS string, or null if the time can't be parsed.
    buildICS: function (o) {
      o = o || {};
      var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((o.time || "").trim());
      if (!m || !o.dateISO) return null;
      var h = parseInt(m[1], 10), min = parseInt(m[2], 10), ap = m[3].toUpperCase();
      if (ap === "PM" && h !== 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
      var ds = o.dateISO.replace(/-/g, "");
      var ts = pad2(h) + pad2(min) + "00";
      var endTotal = h * 60 + min + (o.durationMinutes || 60);
      var te = pad2(Math.floor(endTotal / 60) % 24) + pad2(endTotal % 60) + "00";
      var esc = function (s) {
        return String(s == null ? "" : s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
      };
      return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prince Tires//Booking//EN",
        "BEGIN:VEVENT",
        "DTSTART;TZID=America/Edmonton:" + ds + "T" + ts,
        "DTEND;TZID=America/Edmonton:" + ds + "T" + te,
        "SUMMARY:" + esc(o.summary || "Prince Tires appointment"),
        "LOCATION:" + esc(o.location || SW_FALLBACK.addressFull),
        "DESCRIPTION:" + esc(o.description || ""),
        "END:VEVENT", "END:VCALENDAR",
      ].join("\r\n");
    },

    // Trigger a download of an .ics string.
    downloadICS: function (ics, filename) {
      var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || "prince-tires.ics";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 0);
    },
  };

  window.PTBookingCore = Core;
})();
