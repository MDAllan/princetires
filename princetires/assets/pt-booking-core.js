/*
 * pt-booking-core.js — shared booking utilities for the 3 booking surfaces
 * (pt-booking-modal, pt-service-booking-modal, pt-booking-page).
 *
 * These are the DOM-INDEPENDENT pieces that were duplicated across all three:
 * reading the #pt-locations-data island, picking the location, the local-date
 * helper, the availability fetch, the .ics builder, the NAP formatter, and the
 * "offered at these shops only" rule a restricted service (road force
 * balancing, Edmonton Trail NE) applies to the location picker.
 *
 * Surface-specific logic (steps, fields, payload construction, price/tier rules,
 * DOM wiring) stays in each surface. Each surface builds its own payload and owns
 * its own DOM — this module only shares the stable plumbing.
 *
 * Loaded synchronously in the <head> (layout/theme.liquid) so window.PTBookingCore
 * exists before any inline booking script runs.
 *
 * Shopify serves this file MINIFIED from its CDN (comments stripped, whitespace
 * collapsed — about 45% of this source). Verify a push by behaviour in a real
 * browser or by tokens/string literals, never by exact formatting or by size.
 */
(function () {
  "use strict";

  var SW_FALLBACK = {
    address: "111 42 Ave SW, Calgary",
    addressFull: "111 42 Ave SW, Calgary, AB T2G 0A4",
    phone: "(403) 452-4283",
  };

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // Facebook Marketplace tag (owner, 2026-11-17). Meta's Muse assistant answers
  // the shop's Marketplace buyers and links them here with ?ref=muse (Muse books
  // it itself) or ?ref=marketplace (the buyer books). The tag is kept for 7 days
  // on this device so it survives browsing to another page before booking, and
  // every booking screen sends it to /api/book, which stores it so the shop's
  // board shows "Muse" or "Marketplace". Anything else is ignored.
  var REF_KEY = "pt_booking_ref";
  var REF_DAYS = 7;
  var REF_VALUES = { muse: 1, marketplace: 1 };
  try {
    var refParam = new URLSearchParams(window.location.search).get("ref");
    if (refParam && REF_VALUES[refParam]) {
      window.localStorage.setItem(REF_KEY, JSON.stringify({ v: refParam, t: Date.now() }));
    }
  } catch (e) { /* private mode / storage blocked: a plain website booking */ }

  function bookingRef() {
    try {
      var raw = window.localStorage.getItem(REF_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !REF_VALUES[o.v] || !(Date.now() - o.t < REF_DAYS * 86400000)) {
        window.localStorage.removeItem(REF_KEY);
        return null;
      }
      return o.v;
    } catch (e) { return null; }
  }

  var Core = {
    SW_FALLBACK: SW_FALLBACK,

    // The Marketplace tag for /api/book's `ref`, or null (see REF_KEY above).
    bookingRef: bookingRef,

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
      // Where a booking STARTS, which is not the same question as which shop is
      // the main business. booking_default wins; is_primary stays the fallback.
      for (var i = 0; i < bookable.length; i++) {
        if (bookable[i] && bookable[i].booking_default) return bookable[i];
      }
      for (var j = 0; j < bookable.length; j++) {
        if (bookable[j] && bookable[j].is_primary) return bookable[j];
      }
      return bookable[0] || null;
    },

    // ── Services that only some shops offer ──────────────────────────────
    // GET /api/services carries `locations` per row: [] = every shop, else the
    // slugs of the shops that offer it (the road force balancer is at Edmonton
    // Trail NE only). The three surfaces narrow their location picker to those
    // shops when such a service or add-on is chosen; /api/book refuses the
    // others, so this is the courtesy and the server is the fence.

    // The slugs a catalog row is offered at, normalised. [] = everywhere.
    serviceShops: function (row) {
      var raw = row && row.locations;
      if (!Array.isArray(raw)) return [];
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        if (typeof raw[i] === "string" && raw[i].trim()) out.push(raw[i].trim().toLowerCase());
      }
      return out;
    },

    // The bookable shops that satisfy EVERY restriction in `lists` (an array of
    // slug arrays; empty lists mean "no restriction" and are ignored).
    allowedLocations: function (bookable, lists) {
      bookable = bookable || [];
      var active = (lists || []).filter(function (l) { return Array.isArray(l) && l.length; });
      if (!active.length) return bookable.slice();
      return bookable.filter(function (loc) {
        var slug = loc && loc.slug ? String(loc.slug).toLowerCase() : "";
        for (var i = 0; i < active.length; i++) {
          if (active[i].indexOf(slug) === -1) return false;
        }
        return true;
      });
    },

    // "Prince Tires — Edmonton Trail NE" -> "Edmonton Trail NE".
    shortShopName: function (loc) {
      var n = (loc && (loc.public_name || loc.name)) || "Prince Tires";
      return n.replace(/^Prince Tires\s*[—–-]\s*/i, "");
    },

    // "Edmonton Trail NE only" — the badge for a restricted service. `all` is
    // the full island list so a shop that is not bookable online still names
    // itself; falls back to the upper-cased slug.
    onlyAtLabel: function (slugs, all) {
      var names = [];
      for (var i = 0; i < (slugs || []).length; i++) {
        var hit = Core.bySlug(all || [], slugs[i]);
        names.push(hit ? Core.shortShopName(hit) : String(slugs[i]).toUpperCase());
      }
      if (!names.length) return "";
      return names.join(" or ") + " only";
    },

    // The sentence under the picker, mirroring the server's refusal wording.
    onlyAtNote: function (serviceName, slugs, all) {
      var label = Core.onlyAtLabel(slugs, all);
      if (!label) return "";
      return serviceName + " is only available at our " + label.replace(/ only$/, "") + " shop.";
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
    //     earliest: {date,time,label,reason}|null, // this product's floor
    //     dropOff: {cap,taken,full}|null }       // only when extra.drop_off=1
    //
    // Drop-offs (owner, 2026-10-29): a surface asks with extra { drop_off: 1 }
    // and the server adds ONE key, dropOff, with that shop's daily cap for the
    // day. Without drop_off=1 the request URL is exactly what it was before.
    // A server that does not send the key yet gives dropOff: null — the surface
    // then lets the customer try, and /api/book is the authority.
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
        .then(function (r) {
          // A non-2xx is the platform refusing — a billing stop (402), a crash
          // (5xx), a rate limit (429) — not "nothing is booked today". For a
          // whole hour on 2026-10-19 every request came back 402 and this
          // function, swallowing it, drew a wide-open grid that then failed at
          // the last step. Refusals are reported as `unavailable` so the
          // surfaces can say so and point at the phone.
          if (!r.ok) throw new Error("availability HTTP " + r.status);
          return r.json();
        })
        .then(function (d) {
          var e = d && d.earliest && d.earliest.date ? d.earliest : null;
          var dk = d && d.dropOff && typeof d.dropOff === "object" ? d.dropOff : null;
          return {
            booked: Array.isArray(d && d.booked) ? d.booked : [],
            allDayBlocked: !!(d && d.allDayBlocked),
            blockedReason: (d && typeof d.blockedReason === "string" && d.blockedReason) || null,
            earliest: e ? { date: String(e.date), time: String(e.time || ""), label: String(e.label || ""), reason: String(e.reason || "") } : null,
            dropOff: dk ? { cap: Number(dk.cap) || 0, taken: Number(dk.taken) || 0, full: dk.full === true } : null,
            // The shop is OPEN that day but every slot is taken. Not the same as
            // allDayBlocked (closed): only a full day is worth requesting. The
            // server answers false whenever it is unsure, so a lookup hiccup can
            // never turn the page into request-only.
            dayFull: !!(d && d.dayFull === true),
            // The shop's online requests for that day are used up, or the
            // server will not promise this one online: the form says "call".
            // (Additive keys, 2026-11-13: false whenever the server is silent.)
            onlineFull: !!(d && (d.onlineFull === true || d.code === "online_full")),
            noOnlinePromise: !!(d && d.noOnlinePromise === true),
            unavailable: false,
          };
        })
        .catch(function () { return { booked: [], allDayBlocked: false, blockedReason: null, earliest: null, dropOff: null, dayFull: false, onlineFull: false, noOnlinePromise: false, unavailable: true }; });
    },

    // ── "Request this day" (owner, 2026-10-12 + 2026-11-13) ────────────────
    // When a day is open but every time is taken, the surfaces call this
    // instead of leaving a dead end of greyed-out times. It draws a small
    // form INTO `host` and posts to /api/appointment-request, which lands in
    // the staff queue (Bookings → Requests) and texts the shop.
    //
    // It is a REQUEST, never a booking, and every word says so — the shop
    // calls back to find a time. Shared here so the three booking surfaces
    // cannot drift apart in wording or behaviour.
    //
    //   host       element to draw into (its contents are replaced)
    //   o.apiBase  the surface's availability URL; the request URL sits beside it
    //   o.dateISO, o.dateLabel ("Fri, Nov 14"), o.locationSlug
    //   o.prefill  { name, phone, email } already typed, if any
    //   o.service, o.vehicle  what the customer was booking, for staff
    renderRequestPanel: function (host, o) {
      if (!host || !o || !o.dateISO) return;
      // Redesign 2026-11-13: the one booking form draws this panel in its own
      // tokens (same fields, same POST body). This copy stays as the fallback.
      if (window.PTBook && window.PTBook.__real && typeof window.PTBook.renderCallback === "function") return window.PTBook.renderCallback(host, o);
      Core._requestStyles();
      Core.req.styles();
      var url = String(o.apiBase || "").replace(/\/availability\/?$/, "/appointment-request");
      var p = o.prefill || {};
      var day = o.dateLabel || (function () {
        var d = new Date(o.dateISO + "T12:00:00");
        return isNaN(d) ? o.dateISO : d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
      })();
      var esc = function (s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
      };
      host.innerHTML =
        '<div class="pt-req" role="region" aria-label="Request this day">' +
        '<p class="pt-req__title">' + esc(day) + ' is fully booked</p>' +
        '<p class="pt-req__lead">Leave your details and we’ll call you to fit you in — or pick another day.</p>' +
        '<form class="pt-req__form" novalidate>' +
        '<p class="pt-req-note pt-req__wide"><span class="pt-req-mark" aria-hidden="true">*</span>required</p>' +
        '<label class="pt-req__field"><span>Name<span class="pt-req-mark" aria-hidden="true">*</span></span><input name="name" autocomplete="name" required aria-required="true" maxlength="120" value="' + esc(p.name) + '"></label>' +
        '<label class="pt-req__field"><span>Phone<span class="pt-req-mark" aria-hidden="true">*</span></span><input name="phone" type="tel" autocomplete="tel" required aria-required="true" maxlength="40" value="' + esc(p.phone) + '"></label>' +
        '<label class="pt-req__field"><span>Email <em>(optional)</em></span><input name="email" type="email" autocomplete="email" maxlength="200" value="' + esc(p.email) + '"></label>' +
        '<label class="pt-req__field"><span>When works best? <em>(optional)</em></span><input name="preferredTime" maxlength="120" placeholder="Any time, mornings, after 3…"></label>' +
        '<label class="pt-req__field pt-req__field--wide"><span>Anything else? <em>(optional)</em></span><textarea name="notes" rows="2" maxlength="2000"></textarea></label>' +
        '<p class="pt-req__err" aria-live="polite"></p>' +
        '<button type="submit" class="pt-req__btn">Request ' + esc(day) + '</button>' +
        '<p class="pt-req__small">This isn’t a confirmed appointment yet — we’ll call you to set a time.</p>' +
        '</form></div>';
      var form = host.querySelector("form");
      var err = host.querySelector(".pt-req__err");
      var btn = host.querySelector(".pt-req__btn");
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var f = form.elements;
        var name = String(f.name.value || "").trim();
        var phone = String(f.phone.value || "").trim();
        // Name + phone are what /api/appointment-request requires; email is
        // optional there but must be a real address when typed.
        if (!Core.req.check(form, Core.req.contactRules(f.name, f.phone, f.email, true))) { err.textContent = ""; return; }
        err.textContent = "";
        btn.disabled = true;
        btn.textContent = "Sending…";
        var payload = {
          date: o.dateISO,
          name: name,
          phone: phone,
          email: String(f.email.value || "").trim() || null,
          preferredTime: String(f.preferredTime.value || "").trim() || null,
          notes: String(f.notes.value || "").trim() || null,
          service: o.service || null,
          vehicle: o.vehicle || null,
          location: o.locationSlug || null,
        };
        Core.postBooking(url, payload).then(function (r) {
          if (r.ok) {
            var again = r.data && r.data.duplicate;
            host.innerHTML =
              '<div class="pt-req pt-req--done" role="status">' +
              '<p class="pt-req__title">' + (again ? "You’ve already asked for " + esc(day) : "Request sent for " + esc(day)) + '</p>' +
              '<p class="pt-req__lead">We’ll call you at ' + esc(phone) + ' to find a time. This isn’t a confirmed appointment until we do.</p>' +
              '</div>';
          } else {
            btn.disabled = false;
            btn.textContent = "Request " + day;
            err.textContent = (r.data && r.data.error) || "That didn’t go through — please call us instead.";
          }
        }, function () {
          btn.disabled = false;
          btn.textContent = "Request " + day;
          err.textContent = "That didn’t go through — please call us instead.";
        });
      });
    },

    // One <style> for the request panel, added the first time it is drawn.
    // Storefront palette (red / orange / black), not the admin app's blue.
    _requestStyles: function () {
      if (document.getElementById("pt-req-styles")) return;
      // Sizes are in em so the panel takes the font size of whichever surface
      // it is drawn into (they differ), and it spans every column of the time
      // grid it replaces — those grids are 4 columns, and without
      // grid-column:1/-1 the panel was squeezed into one.
      var css =
        ".pt-req{grid-column:1/-1;margin:.5em 0;padding:1em 1.1em;border:1px solid #e5e5e5;border-left:4px solid #e4572e;border-radius:10px;background:#fff8f5;color:#111;text-align:left;font-size:1em;line-height:1.4}" +
        ".pt-req--done{border-left-color:#16a34a;background:#f0fdf4}" +
        ".pt-req__title{margin:0 0 .3em;font-weight:700;font-size:1.1em}" +
        ".pt-req__lead{margin:0 0 .8em;font-size:.95em}" +
        ".pt-req__form{display:grid;grid-template-columns:1fr 1fr;gap:.6em .8em}" +
        ".pt-req__field{display:flex;flex-direction:column;gap:.25em;font-size:.9em;font-weight:600}" +
        ".pt-req__field em{font-weight:400;font-style:normal;color:#6b7280}" +
        ".pt-req__field input,.pt-req__field textarea{font:inherit;font-weight:400;font-size:1.05em;padding:.55em .65em;border:1.5px solid #e5e7eb;border-radius:7px;background:#fff;color:#111}" +
        ".pt-req__field input:focus,.pt-req__field textarea:focus{outline:none;border-color:#dc2626}" +
        ".pt-req__field--wide,.pt-req__wide,.pt-req__err,.pt-req__btn,.pt-req__small,.pt-req__form>.pt-fsum{grid-column:1/-1}" +
        ".pt-req__err{margin:0;min-height:1em;color:#b91c1c;font-size:.9em}" +
        ".pt-req__btn{padding:.75em;border:0;border-radius:8px;background:#dc2626;color:#fff;font-weight:700;font-size:1em;cursor:pointer}" +
        ".pt-req__btn:hover{background:#b91c1c}" +
        ".pt-req__btn:disabled{opacity:.6;cursor:default}" +
        ".pt-req__small{margin:0;font-size:.85em;color:#4b5563}" +
        "@media (max-width:520px){.pt-req__form{grid-template-columns:1fr}}";
      var el = document.createElement("style");
      el.id = "pt-req-styles";
      el.textContent = css;
      document.head.appendChild(el);
    },

    // ── Required fields: mark them, and say what is missing (owner, 2026-11-15) ──
    // "When a customer tries to continue, show them which items are required."
    // Before this, a step's Next button sat greyed out with no reason, and the
    // contact step printed one sentence at the bottom. Shared here so the three
    // surfaces and the request panel look and behave the same.
    //
    // A rule is { el, msg, ok, kind, after }:
    //   el    the input, or the group (time grid, radiogroup) that is wrong
    //   msg   one line under it ("Enter your phone number", "Pick a time")
    //   ok()  true once fixed: the error clears itself on the next input /
    //         change / click inside `el`
    //   kind  'missing' (default) or 'invalid', for the summary wording
    //   after (optional) the node the message goes after; default: the end of
    //         the input's .bk-field wrapper, or straight after a group
    //   useEl (optional) an existing hidden message element to show instead
    //         of a new line (the old-tires and tire-check messages already
    //         have one, and live tests look for them)
    //
    // The rules for WHAT is required mirror POST /api/book (name 2+, phone 7+,
    // valid email, date, time) and /api/appointment-request (name, phone).
    req: (function () {
      var seq = 0;
      var live = []; // { rule, msgEl, scope, off }

      function isControl(el) { return /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el && el.tagName); }
      function describe(el, id, on) {
        var cur = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
        cur = cur.filter(function (x) { return x !== id; });
        if (on) cur.push(id);
        if (cur.length) el.setAttribute("aria-describedby", cur.join(" "));
        else el.removeAttribute("aria-describedby");
      }
      function drop(rec) {
        var el = rec.rule.el;
        if (rec.rule.useEl) rec.msgEl.hidden = true;
        else if (rec.msgEl && rec.msgEl.parentNode) rec.msgEl.parentNode.removeChild(rec.msgEl);
        if (el) {
          el.classList.remove("pt-ferr-on");
          el.removeAttribute("aria-invalid");
          if (!rec.hadDesc) describe(el, rec.msgEl.id, false);
          var wrap = el.closest && el.closest(".bk-field, .pt-req__field");
          if (wrap) wrap.classList.remove("pt-ferr-field");
          if (rec.off) rec.off();
        }
      }
      function summaryOf(scope) { return scope && scope.querySelector(":scope > .pt-fsum"); }
      function summaryText(list) {
        var n = list.length;
        var missing = list.filter(function (r) { return r.kind !== "invalid"; }).length;
        if (missing === n) return "Please fill in " + n + " required " + (n === 1 ? "field" : "fields") + " to continue.";
        return "Please fix " + n + " " + (n === 1 ? "thing" : "things") + " to continue.";
      }
      function paintSummary(scope) {
        var box = summaryOf(scope);
        var open = live.filter(function (r) { return r.scope === scope; });
        if (!open.length) { if (box) box.parentNode.removeChild(box); return; }
        if (!box) return;
        box.querySelector(".pt-fsum__t").textContent = summaryText(open.map(function (r) { return r.rule; }));
        var ul = box.querySelector(".pt-fsum__l");
        ul.innerHTML = "";
        open.forEach(function (r) {
          var li = document.createElement("li");
          li.textContent = r.rule.msg;
          ul.appendChild(li);
        });
      }
      function focusFirst(el) {
        var target = isControl(el) ? el : el.querySelector("input:not([type=hidden]):not([disabled]), select, textarea, button:not([disabled]), [tabindex]");
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
        if (target) { try { target.focus({ preventScroll: true }); } catch (e) {} return true; }
        return false;
      }

      var R = {
        // The shared look. Storefront palette (red / black); rem on the theme's
        // 62.5% root (1rem = 10px), so 1.3rem is 13px. base.css is untouched.
        styles: function () {
          if (document.getElementById("pt-ferr-styles")) return;
          var css =
            // !important on sizes only: the surfaces size every <p> in their
            // card with high-specificity rules (e.g. .pt-bp .pt-bp__card p).
            ".pt-req-mark{color:#dc2626;font-weight:700;margin-left:.2rem}" +
            ".pt-req-note{margin:0 0 1rem;font-size:1.3rem!important;line-height:1.4;color:#6b7280}" +
            ".pt-req-note .pt-req-mark{margin:0 .2rem 0 0}" +
            ".pt-ferr{margin:.5rem 0 0;font-size:1.3rem!important;line-height:1.35;font-weight:500;color:#b91c1c}" +
            "input.pt-ferr-on,select.pt-ferr-on,textarea.pt-ferr-on{border-color:#dc2626!important;background:#fef2f2!important;box-shadow:0 0 0 1px #dc2626!important}" +
            "div.pt-ferr-on,label.pt-ferr-on{outline:2px solid #dc2626;outline-offset:3px;border-radius:8px}" +
            "input[type=checkbox].pt-ferr-on,input[type=radio].pt-ferr-on{outline:2px solid #dc2626;outline-offset:2px}" +
            ".pt-fsum{margin:0 0 1.2rem;padding:1rem 1.2rem;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:8px;background:#fef2f2;color:#7f1d1d;font-size:1.4rem;line-height:1.4;text-align:left}" +
            ".pt-fsum:focus{outline:2px solid #dc2626;outline-offset:2px}" +
            ".pt-fsum__t{margin:0;font-weight:700;font-size:1.4rem!important}" +
            ".pt-fsum__l{margin:.4rem 0 0;padding-left:1.8rem}" +
            ".pt-fsum__l li{margin:.15rem 0}" +
            // A step button that is waiting on something stays clickable (it
            // explains on click) but reads as not-ready-yet, not as broken.
            ".pt-soft-off{opacity:.75}";
          var el = document.createElement("style");
          el.id = "pt-ferr-styles";
          el.textContent = css;
          document.head.appendChild(el);
        },

        // Remove every message, outline and summary inside `scope`.
        clear: function (scope) {
          live = live.filter(function (r) {
            if (scope && !scope.contains(r.rule.el) && r.scope !== scope) return true;
            drop(r);
            return false;
          });
          var boxes = (scope || document).querySelectorAll(".pt-fsum");
          Array.prototype.forEach.call(boxes, function (b) { b.parentNode.removeChild(b); });
        },

        // Show `rules` (the failing ones) in `scope` (the step's container):
        // a message under each, a summary at the top, focus on the first.
        // Returns how many were shown.
        show: function (scope, rules) {
          R.styles();
          R.clear(scope);
          rules = (rules || []).filter(function (r) { return r && r.el; });
          if (!rules.length) return 0;
          rules.forEach(function (rule) {
            var el = rule.el;
            var wrap = isControl(el) && el.closest ? el.closest(".bk-field, .pt-req__field") : null;
            var m;
            if (rule.useEl) {
              m = rule.useEl;
              if (!m.id) m.id = "pt-ferr-" + (++seq);
              m.hidden = false;
            } else {
              m = document.createElement("p");
              m.className = "pt-ferr";
              m.id = "pt-ferr-" + (++seq);
              m.textContent = rule.msg;
              if (rule.after) rule.after.insertAdjacentElement("afterend", m);
              else if (wrap) wrap.appendChild(m);
              else el.insertAdjacentElement("afterend", m);
            }
            var hadDesc = (" " + (el.getAttribute("aria-describedby") || "") + " ").indexOf(" " + m.id + " ") > -1;
            el.classList.add("pt-ferr-on");
            if (wrap) wrap.classList.add("pt-ferr-field");
            if (isControl(el) || /^(radiogroup|group|listbox)$/.test(el.getAttribute("role") || "")) el.setAttribute("aria-invalid", "true");
            describe(el, m.id, true);
            var rec = { rule: rule, msgEl: m, scope: scope, hadDesc: hadDesc };
            var check = function () {
              setTimeout(function () {
                var fixed = false;
                try { fixed = rule.ok ? !!rule.ok() : (isControl(el) && String(el.value || "").trim() !== ""); } catch (e) {}
                if (!fixed || live.indexOf(rec) < 0) return;
                live.splice(live.indexOf(rec), 1);
                drop(rec);
                paintSummary(scope);
              }, 0);
            };
            el.addEventListener("input", check);
            el.addEventListener("change", check);
            el.addEventListener("click", check);
            rec.off = function () {
              el.removeEventListener("input", check);
              el.removeEventListener("change", check);
              el.removeEventListener("click", check);
            };
            live.push(rec);
          });
          var box = document.createElement("div");
          box.className = "pt-fsum";
          box.setAttribute("role", "alert");
          box.tabIndex = -1;
          box.innerHTML = '<p class="pt-fsum__t"></p><ul class="pt-fsum__l"></ul>';
          scope.insertBefore(box, scope.firstChild);
          paintSummary(scope);
          if (!focusFirst(rules[0].el)) { try { box.focus({ preventScroll: true }); } catch (e) {} }
          return rules.length;
        },

        // Run `rules` (all of them, each with ok()) and show the failing ones.
        // true = all good, carry on.
        check: function (scope, rules) {
          var bad = (rules || []).filter(function (r) { try { return r && r.el && !r.ok(); } catch (e) { return false; } });
          if (!bad.length) { R.clear(scope); return true; }
          R.show(scope, bad);
          return false;
        },

        // Put a step button in charge of explaining itself.
        //   btn       the Next / Continue button
        //   scope     the step container the summary goes at the top of
        //   rules()   returns this step's rules (each with ok()); called on click
        //   o.soft    true: the surface's own `btn.disabled = x` no longer greys
        //             the button out. The button stays clickable, carries
        //             aria-disabled while the surface considers it blocked, and a
        //             click explains instead of doing nothing. Only for step
        //             buttons — never a Send button (its disabled = "sending").
        //   o.blockedMsg(el) optional: when the surface says blocked but no rule
        //             fails (e.g. a picked time stopped being free), the rule to show.
        // The check runs in the CAPTURE phase on `scope`, so it runs before the
        // button's own onclick and can stop it.
        gate: function (btn, scope, rules, o) {
          if (!btn || !scope || btn.__ptGate) return;
          o = o || {};
          btn.__ptGate = true;
          var blocked = false;
          if (o.soft) {
            blocked = btn.hasAttribute("disabled");
            btn.removeAttribute("disabled");
            var paint = function () {
              if (blocked) btn.setAttribute("aria-disabled", "true");
              else btn.removeAttribute("aria-disabled");
              btn.classList.toggle("pt-soft-off", blocked);
            };
            try {
              Object.defineProperty(btn, "disabled", {
                configurable: true,
                get: function () { return blocked; },
                set: function (v) { blocked = !!v; paint(); },
              });
            } catch (e) { return; }
            paint();
          }
          scope.addEventListener("click", function (ev) {
            var hit = ev.target && ev.target.closest ? ev.target.closest("button, [role=button]") : null;
            if (hit !== btn) return;
            if (!o.soft && btn.hasAttribute("disabled")) return;
            var list = [];
            try { list = rules() || []; } catch (e) { list = []; }
            var bad = list.filter(function (r) { try { return r && r.el && !r.ok(); } catch (e) { return false; } });
            if (!bad.length && blocked && o.blockedMsg) {
              var extra = o.blockedMsg();
              if (extra && extra.el) bad = [extra];
            }
            if (!bad.length && !blocked) { R.clear(scope); return; }
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
            if (bad.length) R.show(scope, bad);
            else R.show(scope, [{ el: btn, after: btn, msg: "Please finish this step to continue.", ok: function () { return !blocked; } }]);
          }, true);
        },

        // The message for a time grid with nothing picked. A full day (the
        // request panel is showing) or a day with no free times says so, rather
        // than "pick a time" when there is none to pick.
        timeRule: function (grid, hasTime) {
          return {
            el: grid,
            ok: hasTime,
            get msg() {
              if (grid && grid.querySelector(".pt-req")) return "This day is full. Pick another day, or send the request below.";
              var free = grid ? grid.querySelectorAll(".bk-time-slot:not(.bk-time-slot--booked):not([disabled])").length : 0;
              if (grid && !free) return "No times are free on this day. Pick another day.";
              return "Pick a time";
            },
          };
        },

        // Same rules as the server, worded for a person.
        nameOk: function (v) { return String(v || "").trim().length >= 2; },
        // /api/book needs 7+ characters; a real Canadian number is 10 digits
        // (11 with the leading 1). 10–15 digits also lets an overseas number by.
        phoneOk: function (v) { var d = String(v || "").replace(/\D/g, ""); return d.length >= 10 && d.length <= 15; },
        emailOk: function (v) { return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(String(v || "").trim()); },

        // The standard rules for a Name / Phone / Email block. `emailOptional`
        // for the request panel, where the server takes no email.
        contactRules: function (nameEl, phoneEl, emailEl, emailOptional) {
          var out = [];
          if (nameEl) out.push({
            el: nameEl,
            get kind() { return String(nameEl.value || "").trim() ? "invalid" : "missing"; },
            get msg() { return String(nameEl.value || "").trim() ? "Enter your full name (at least 2 letters)" : "Enter your name"; },
            ok: function () { return R.nameOk(nameEl.value); },
          });
          if (phoneEl) out.push({
            el: phoneEl,
            get kind() { return String(phoneEl.value || "").trim() ? "invalid" : "missing"; },
            get msg() { return String(phoneEl.value || "").trim() ? "Enter a full phone number, e.g. (403) 555-0123" : "Enter your phone number"; },
            ok: function () { return R.phoneOk(phoneEl.value); },
          });
          if (emailEl) out.push({
            el: emailEl,
            get kind() { return String(emailEl.value || "").trim() ? "invalid" : "missing"; },
            get msg() { return String(emailEl.value || "").trim() ? "Enter a valid email, e.g. jane@email.com" : "Enter your email address"; },
            ok: function () { var v = String(emailEl.value || "").trim(); return (emailOptional && !v) || R.emailOk(v); },
          });
          return out;
        },
      };
      return R;
    })(),

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
    //
    // { dateISO, allDay: true, summary, description, location } builds an
    // ALL-DAY event instead (a drop-off has a day, not a time: the customer
    // brings the car any time the shop is open). DTEND is the next day, as
    // RFC 5545 makes an all-day end exclusive. A timed call is unchanged.
    buildICS: function (o) {
      o = o || {};
      var esc = function (s) {
        return String(s == null ? "" : s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
      };
      if (o.allDay) {
        var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(o.dateISO || ""));
        if (!dm) return null;
        var next = new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3] + 1));
        var nd = next.getUTCFullYear() + pad2(next.getUTCMonth() + 1) + pad2(next.getUTCDate());
        return [
          "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prince Tires//Booking//EN",
          "BEGIN:VEVENT",
          "DTSTART;VALUE=DATE:" + dm[1] + dm[2] + dm[3],
          "DTEND;VALUE=DATE:" + nd,
          "TRANSP:TRANSPARENT",
          "SUMMARY:" + esc(o.summary || "Prince Tires drop-off"),
          "LOCATION:" + esc(o.location || SW_FALLBACK.addressFull),
          "DESCRIPTION:" + esc(o.description || ""),
          "END:VEVENT", "END:VCALENDAR",
        ].join("\r\n");
      }
      var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((o.time || "").trim());
      if (!m || !o.dateISO) return null;
      var h = parseInt(m[1], 10), min = parseInt(m[2], 10), ap = m[3].toUpperCase();
      if (ap === "PM" && h !== 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
      var ds = o.dateISO.replace(/-/g, "");
      var ts = pad2(h) + pad2(min) + "00";
      var endTotal = h * 60 + min + (o.durationMinutes || 60);
      var te = pad2(Math.floor(endTotal / 60) % 24) + pad2(endTotal % 60) + "00";
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
