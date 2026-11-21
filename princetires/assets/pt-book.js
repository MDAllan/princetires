/*
 * pt-book.js - the ONE booking form (storefront redesign, 2026-11-13).
 *
 * Replaces the three booking surfaces (pt-booking-modal, pt-service-booking-
 * modal, pt-booking-page) and the package builder's request dialog with one
 * component: a full-screen sheet on phones, a centred dialog on desktop, or
 * an inline form (the /pages/booking page and the package quote lane).
 *
 *   PTBook.open(ctx)        open the sheet (ctx below)
 *   PTBook.openFrom(el)     open from a button's data-* attributes
 *   PTBook.mount(host, ctx) render inline (page / package quote)
 *   PTBook.renderCallback(host, o)   the "Request this day" panel anywhere
 *   [data-book] [data-book-install] [data-book-service] clicks are delegated
 *   openBookingModal(btn) / openServiceModal(btn) / closeBookingModal() /
 *   closeServiceModal() stay as thin aliases so old buttons keep working.
 *
 * ctx: { kind?: 'package'|'package_quote', service?: slug or alias,
 *        serviceName?: free text (keyword match), product?: {...},
 *        location?: slug, from?: analytics source, qty?, vehicleType?,
 *        vehicle?: {year,make,model,trim}, tireSize?, pkg?: adapter,
 *        set?: {kind:'staggered', key, lines:[{position:'front'|'rear', product}]} }
 *   A set card's button ([data-book-set="staggered"]) opens SET mode: 2 front
 *   + 2 rear in one request (see "Staggered sets" in the model).
 *
 * SERVER CONTRACT: the request bodies are built by the pure functions in
 * the model below (M.productBody / M.serviceBody / M.callbackBody /
 * M.packageInstallBody / M.packageQuoteBody). They reproduce exactly the
 * fields the old surfaces posted to /api/book, /api/appointment-request and
 * /api/package/request. A Node self-check (outside the theme) compares them
 * field by field with the old shapes. Change them only with the server.
 *
 * The model has no DOM access, so the same file loads in Node for the test
 * (module.exports). The UI part runs only when `document` exists.
 *
 * Shopify serves this file minified: verify a push by behaviour, never by
 * exact formatting.
 */
(function (root, factory) {
  "use strict";
  var M = factory();
  if (typeof module === "object" && module.exports) module.exports = M;
  if (root && root.document) M.__ui(root);
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // ════════════════════════════════════════════════════════════════════
  // MODEL (pure)
  // ════════════════════════════════════════════════════════════════════
  var M = {};

  M.BOOK_API = "https://app.princetires.ca/api/book";
  M.AVAIL_API = "https://app.princetires.ca/api/availability";
  M.SERVICES_API = "https://app.princetires.ca/api/services";

  var LEVY_SLUG = "fee_environmental";
  // The name /api/book has always received for the levy line (body contract).
  var LEVY_API_NAME = "Alberta tire recycling levy";
  var PROTECTION_SLUG = "addon_road_hazard";
  var RF_SLUG = "addon_road_force";
  var TPMS_SLUG = "addon_tpms";
  var DISPOSAL_SLUG = "addon_disposal";
  M.LEVY_SLUG = LEVY_SLUG; M.PROTECTION_SLUG = PROTECTION_SLUG; M.RF_SLUG = RF_SLUG;

  // One order everywhere (plan step 2).
  M.VEHICLES = [
    { id: "passenger", name: "Sedan" },
    { id: "suv", name: "SUV / CUV" },
    { id: "truck", name: "Truck" },
    { id: "van", name: "Van" },
    { id: "electric", name: "Electric" },
    { id: "dually", name: "Dually" },
    { id: "largetruck", name: "Large / Cube / 21\"+" },
    { id: "trailer", name: "Trailer" }
  ];
  M.NO_TRAILER = ["balancing", "road_force_balancing", "rotation"];
  M.vehicleName = function (id) {
    for (var i = 0; i < M.VEHICLES.length; i++) if (M.VEHICLES[i].id === id) return M.VEHICLES[i].name;
    return "";
  };
  M.isVehicle = function (id) { return !!M.vehicleName(id); };

  // The live /api/services answer (2026-11-13), kept in sync with it: the form
  // prices from the live catalogue and uses this only until it lands or when
  // it cannot be reached.
  M.FALLBACK_SERVICES = [{"slug":"installation_off","kind":"service","name":"Tire Installation","description":"Mount your new (or loose) tires onto your rims, balance all wheels, reset TPMS sensors, torque to spec, and get you road-ready. For tires that are NOT yet on rims.","pricingMode":"per_unit_by_vehicle","unit":"tire","prices":{"byVehicle":{"suv":30,"van":35,"truck":35,"dually":45,"trailer":30,"electric":30,"passenger":30,"largetruck":40},"flatOverride":{"trailer":120},"lowProfileFloor":40,"withTiresByVehicle":{"electric":30,"passenger":30}},"allowedVendors":[],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":30},{"slug":"installation_on","kind":"service","name":"Seasonal Swap","description":"Swap your stored seasonal tires — already mounted on their own rims — onto your vehicle, torque to spec. Tires must be pre-mounted on rims.","pricingMode":"per_unit_by_vehicle","unit":"tire","prices":{"byVehicle":{"suv":15,"van":15,"truck":20,"dually":15,"trailer":25,"electric":15,"passenger":15,"largetruck":20},"flatOverride":{"trailer":100}},"allowedVendors":[],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":30},{"slug":"balancing","kind":"service","name":"Wheel Balancing","description":"We spin each wheel on a balancer, detect heavy spots, and add weights so there's no vibration at highway speed.","pricingMode":"per_unit_flat","unit":"wheel","prices":{"amount":20},"allowedVendors":[],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":30},{"slug":"road_force_balancing","kind":"service","name":"Road Force Balancing","description":"The balancer presses a load roller against the spinning tire to measure how it rides under the weight of the car, finds stiff spots and runout a standard spin balance cannot see, and matches the tire to the wheel so a vibration that would not go away finally does. Edmonton Trail NE only.","pricingMode":"per_unit_flat","unit":"wheel","prices":{"amount":35},"allowedVendors":[],"locations":["ne"],"mandatory":false,"staffOnly":false,"durationMinutes":45},{"slug":"rotation","kind":"service","name":"Tire Rotation","description":"We move your tires to different positions so they wear evenly, extending their life and keeping handling balanced.","pricingMode":"per_unit_by_vehicle","unit":"tire","prices":{"byVehicle":{"suv":15,"van":15,"truck":20,"dually":20,"trailer":15,"electric":15,"passenger":15,"largetruck":20}},"allowedVendors":[],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":30},{"slug":"flat_repair","kind":"service","name":"Flat Repair","description":"Patch repair: we dismount the tire and apply a permanent internal patch. (We don't do exterior plug repairs — they're not safe long-term.)","pricingMode":"per_unit_flat","unit":"tire","prices":{"amount":50},"allowedVendors":[],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":30},{"slug":"tpms","kind":"service","name":"TPMS Service","description":"We replace or reprogram tire pressure monitoring system (TPMS) sensors so your tire pressure warning light works properly. TPMS sensor replacement is $60 per sensor. Reprogramming rates depend on the vehicle and issue, so please check with our team for pricing.","pricingMode":"per_unit_flat","unit":"sensor","prices":{"amount":60},"allowedVendors":[],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":30},{"slug":"addon_tpms","kind":"addon","name":"TPMS sensors","description":"Replacement TPMS sensors, priced per sensor.","pricingMode":"per_unit_flat","unit":"sensor","prices":{"amount":60},"allowedVendors":[],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":0},{"slug":"addon_disposal","kind":"addon","name":"Tire disposal","description":"Eco-friendly disposal of your old tires, priced per tire.","pricingMode":"per_unit_flat","unit":"tire","prices":{"amount":5},"allowedVendors":[],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":0},{"slug":"addon_road_hazard","kind":"addon","name":"Protection Plan","description":"36-month coverage (or until 2/32\" tread): unlimited flat repairs plus prorated replacement for punctures, potholes, and sidewall damage. Priced at 15% of the tire price per tire.","pricingMode":"per_unit_percent","unit":"tire","prices":{"max":50,"min":12,"terms":[{"max":50,"min":12,"months":12,"percent":10}],"percent":10,"defaultMonths":12},"allowedVendors":["Kumho","Rotalla","Radar","Haida"],"locations":[],"mandatory":false,"staffOnly":false,"durationMinutes":0},{"slug":"addon_road_force","kind":"addon","name":"Road force balancing upgrade","description":"Upgrade the standard balance included with your installation to a road force balance, per tire. Edmonton Trail NE only.","pricingMode":"per_unit_flat","unit":"tire","prices":{"amount":20},"allowedVendors":[],"locations":["ne"],"mandatory":false,"staffOnly":false,"durationMinutes":0},{"slug":"fee_environmental","kind":"addon","name":"Tire recycling fee","description":"Provincial tire recycling fee, charged per tire on every tire sale and remitted to Alberta Recycling.","pricingMode":"per_unit_flat","unit":"tire","prices":{"amount":5},"allowedVendors":[],"locations":[],"mandatory":true,"staffOnly":false,"durationMinutes":0}];

  // Labels for the price lines (plan summary_panel), by catalogue slug.
  var LINE_LABEL = {
    installation_off: "Tire installation (off rims)",
    installation_on: "Seasonal swap",
    balancing: "Wheel balancing",
    road_force_balancing: "Road force balancing",
    rotation: "Tire rotation",
    flat_repair: "Flat repair",
    tpms: "TPMS service"
  };
  // Customer-facing service names (sentence case), by slug.
  var SVC_NAME = {
    installation_off: "Tire installation (off rims)",
    installation_on: "Seasonal swap (on rims)",
    balancing: "Wheel balancing",
    road_force_balancing: "Road force balancing",
    rotation: "Tire rotation",
    flat_repair: "Flat repair",
    tpms: "TPMS service"
  };

  function num(n) { return typeof n === "number" && isFinite(n); }
  function cents(d) { return Math.round(Number(d) * 100); }
  function shopsOf(row) {
    var raw = row && row.locations, out = [];
    if (!Array.isArray(raw)) return out;
    for (var i = 0; i < raw.length; i++) if (typeof raw[i] === "string" && raw[i].trim()) out.push(raw[i].trim().toLowerCase());
    return out;
  }

  // Normalise a /api/services list. Prices stay in dollars (the catalogue
  // unit); every price calculation below converts to integer cents.
  M.catalog = function (services, live) {
    var list = Array.isArray(services) && services.length ? services : M.FALLBACK_SERVICES;
    var c = { live: !!live && list !== M.FALLBACK_SERVICES, services: {}, order: [], addons: {}, extras: [], fees: [], promos: null };
    list.forEach(function (s) {
      if (!s || !s.slug || s.active === false) return;
      var p = s.prices || {};
      if (s.kind === "service") {
        c.services[s.slug] = {
          slug: s.slug, name: s.name || s.slug, description: s.description || "",
          mode: s.pricingMode, unit: s.unit || "unit", prices: p,
          locations: shopsOf(s), staffOnly: s.staffOnly === true,
          durationMinutes: num(s.durationMinutes) ? s.durationMinutes : null
        };
        c.order.push(s.slug);
      } else if (s.kind === "addon") {
        if (s.mandatory === true || /^fee_/.test(s.slug)) {
          if (num(p.amount)) c.fees.push({ slug: s.slug, apiName: s.slug === LEVY_SLUG ? LEVY_API_NAME : (s.name || s.slug), label: s.name || "Tire recycling fee", amount: p.amount });
          return;
        }
        var terms = Array.isArray(p.terms) ? p.terms.filter(function (t) { return t && num(t.months) && num(t.percent); }) : null;
        var a = {
          slug: s.slug, name: s.name || s.slug, description: s.description || "", unit: s.unit || "tire",
          amount: num(p.amount) ? p.amount : null,
          percent: num(p.percent) ? p.percent : null,
          min: num(p.min) ? p.min : null, max: num(p.max) ? p.max : null,
          terms: terms && terms.length ? terms : null,
          defaultMonths: num(p.defaultMonths) ? p.defaultMonths : (terms && terms.length ? terms[terms.length - 1].months : null),
          // Set mode's pre-selected term (the server's one term rule,
          // set-price.ts pricesAtTerm): defaultMonths only when it names a
          // term, else none (= the row's own top-level percent / min / max).
          setDefaultMonths: num(p.defaultMonths) && terms && terms.some(function (t) { return t.months === p.defaultMonths; }) ? p.defaultMonths : null,
          allowedVendors: Array.isArray(s.allowedVendors) ? s.allowedVendors : [],
          locations: shopsOf(s)
        };
        if (a.amount === null && a.percent === null) return;
        c.addons[s.slug] = a;
        if (s.slug !== TPMS_SLUG && s.slug !== DISPOSAL_SLUG) c.extras.push(a);
      }
    });
    return c;
  };

  // ── Slugs, aliases, keyword match ─────────────────────────────────────
  M.ALIASES = {
    installation: "installation_off", install: "installation_off", "tire-install": "installation_off",
    "tire-installation": "installation_off", mount: "installation_off", "off-rims": "installation_off",
    swap: "installation_on", seasonal: "installation_on", changeover: "installation_on", "on-rims": "installation_on",
    "seasonal-swap": "installation_on", "tire-swap": "installation_on",
    balance: "balancing", "wheel-balancing": "balancing", "tire-balancing": "balancing",
    "road-force": "road_force_balancing", roadforce: "road_force_balancing",
    repair: "flat_repair", flat: "flat_repair", patch: "flat_repair", "tire-repair": "flat_repair",
    sensor: "tpms", sensors: "tpms", rotate: "rotation", "tire-rotation": "rotation"
  };
  // A ?service= value -> a live catalogue slug, or null (step 1). A row the
  // catalogue does not list, or lists as staff-only, is never resolved.
  M.resolveSlug = function (raw, cat) {
    var s = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!s) return null;
    var ok = function (slug) { var r = cat.services[slug]; return r && !r.staffOnly ? slug : null; };
    var hit = ok(s) || ok(s.replace(/-/g, "_"));
    if (hit) return hit;
    var a = M.ALIASES[s] || M.ALIASES[s.replace(/_/g, "-")];
    return a ? ok(a) : null;
  };
  // Free-text button label -> slug (the old service modal's map, same order).
  M.KEYWORDS = [
    ["installation_on", ["season", "changeover", "swap", "on rim", "on-rim"]],
    ["installation_off", ["install", "mount", "changeover-off", "off rim", "off-rim"]],
    ["road_force_balancing", ["road force", "road-force", "roadforce"]],
    ["balancing", ["balanc"]],
    ["rotation", ["rotat"]],
    ["flat_repair", ["flat", "patch", "repair", "puncture", "leak"]],
    ["tpms", ["tpms", "sensor"]]
  ];
  M.keywordService = function (text) {
    var pre = String(text || "").toLowerCase(), out = null;
    if (!pre) return null;
    M.KEYWORDS.forEach(function (e) { e[1].forEach(function (kw) { if (!out && pre.indexOf(kw) > -1) out = e[0]; }); });
    return out;
  };
  M.kindForService = function (slug) {
    return slug === "installation_off" ? "own_tires" : slug === "installation_on" ? "swap" : "service";
  };
  M.serviceName = function (slug, cat) {
    return SVC_NAME[slug] || ((cat && cat.services[slug]) ? cat.services[slug].name : "Service");
  };

  // ── Router ──────────────────────────────────────────────────────────────
  // Picks the kind and the visible steps. Steps are named: service, details,
  // time, you, quote. Rotation folds its vehicle chips into the time step.
  M.stepsFor = function (kind, service, withService) {
    var s;
    if (kind === "package") s = ["time", "you"];
    else if (kind === "package_quote") s = ["quote"];
    else if (!kind) s = ["service", "details", "time", "you"];
    else if (service === "rotation") s = ["time", "you"];
    else s = ["details", "time", "you"];
    if (withService && kind && kind !== "package" && kind !== "package_quote" && s[0] !== "service") s = ["service"].concat(s);
    return s;
  };
  M.STEP_NAME = { service: "Service", details: "Details", time: "Time", you: "You", quote: "Details" };

  M.route = function (ctx, cat) {
    ctx = ctx || {};
    var r = { kind: null, service: null, note: "" };
    if (ctx.kind === "package" || ctx.kind === "package_quote") { r.kind = ctx.kind; }
    else if (ctx.product) {
      var p = ctx.product;
      r.kind = (String(p.tireSize || "").trim() || p.isWheel === false) ? "product_tire" : "product_wheel";
      r.service = "installation_off";
    } else {
      var slug = ctx.service ? M.resolveSlug(ctx.service, cat) : null;
      if (!slug && ctx.serviceName) slug = M.resolveSlug(M.keywordService(ctx.serviceName), cat);
      if (slug) { r.kind = M.kindForService(slug); r.service = slug; }
      else if (ctx.service) r.note = "Pick the service you need.";
    }
    r.steps = M.stepsFor(r.kind, r.service, false);
    return r;
  };

  // ── Vehicle detection ──────────────────────────────────────────────────
  // From the saved garage vehicle first, then the tire size (old modal).
  M.autoDetectVehicle = function (tireSize, garage) {
    if (garage && (garage.make || garage.model)) {
      var mk = String(garage.make || "").toLowerCase(), md = String(garage.model || "").toLowerCase(), i;
      var evMakes = ["tesla", "rivian", "lucid", "polestar"];
      var evModels = ["bolt", "leaf", "ioniq", "mustang mach", "id.4", "id.3", "taycan", "e-tron"];
      var truckWords = ["f-150", "f150", "f-250", "f250", "f-350", "f350", "ranger", "maverick", "sierra", "silverado", "ram", "tundra", "tacoma", "titan", "frontier", "colorado", "canyon", "ridgeline", "pickup", "truck"];
      var suvWords = ["suv", "explorer", "tahoe", "suburban", "highlander", "4runner", "pathfinder", "pilot", "rav4", "cr-v", "rogue", "murano", "escape", "edge", "bronco", "equinox", "traverse", "blazer", "wrangler", "cherokee", "durango", "tucson", "santa fe", "cx-", "sportage", "sorento", "telluride", "forester", "outback", "crosstrek", "armada", "expedition", "sequoia"];
      var vanWords = ["sienna", "odyssey", "pacifica", "carnival", "transit", "sprinter", "promaster", "quest", "van"];
      if (evMakes.indexOf(mk) > -1) return "electric";
      for (i = 0; i < evModels.length; i++) if (md.indexOf(evModels[i]) > -1) return "electric";
      for (i = 0; i < truckWords.length; i++) if (md.indexOf(truckWords[i]) > -1) return "truck";
      for (i = 0; i < vanWords.length; i++) if (md.indexOf(vanWords[i]) > -1) return "van";
      for (i = 0; i < suvWords.length; i++) if (md.indexOf(suvWords[i]) > -1) return "suv";
      if (md.indexOf("3500") > -1 || md.indexOf("dually") > -1) return "dually";
      return "passenger";
    }
    var sz = String(tireSize || "").toUpperCase();
    if (sz.indexOf("ST") === 0) return "trailer";
    if (sz.indexOf("LT") === 0 || sz.indexOf("/LT") > -1) return "truck";
    var rimM = sz.match(/R(\d+)/);
    if (rimM && parseInt(rimM[1], 10) >= 21) return "largetruck";
    return "passenger";
  };
  // Owner 2026-11-10: a Sedan / SUV booking for a pickup / SUV, or on big
  // tires (265 mm+ wide, 50+ aspect), is priced up - same as the app's
  // big-tire-tier.ts. Only moves a type UP, never after a hand pick.
  var PICKUP_RX = /\b(f-?150|silverado|sierra|ram 1500|tundra|tacoma|titan|frontier|colorado|canyon|ridgeline|ranger|maverick|gladiator|pickup)\b/;
  var SUV_RX = /\b(suv|explorer|tahoe|yukon|suburban|escalade|highlander|4runner|pathfinder|pilot|rav4|cr-?v|rogue|murano|escape|edge|bronco|equinox|traverse|blazer|wrangler|cherokee|grand cherokee|durango|tucson|santa fe|palisade|sportage|sorento|telluride|forester|outback|crosstrek|ascent|armada|expedition|navigator|sequoia|land cruiser|wagoneer|mdx|rdx)\b/;
  var SUV_CODES = { lexus: /\b(rx|lx|nx|gx|ux|tx)\b/, bmw: /\bx[3-7]\b/, audi: /\bq[5-8]\b/, "mercedes-benz": /\b(gle|glc|gls)\b/, mercedes: /\b(gle|glc|gls)\b/, infiniti: /\bqx\d*\b/ };
  M.classFromModel = function (make, model) {
    var mk = String(make || "").toLowerCase().trim(), md = String(model || "").toLowerCase().replace(/\s+/g, " ").trim();
    var t = (mk + " " + md).trim();
    if (!t) return null;
    if (PICKUP_RX.test(t)) return "truck";
    if (SUV_RX.test(t)) return "suv";
    if (SUV_CODES[mk] && SUV_CODES[mk].test(md)) return "suv";
    return null;
  };
  // tireWidthAspect / isBigTire / tireSizeInText, as in big-tire-tier.ts.
  M.tireWidthAspect = function (size) {
    if (!size) return null;
    var s = String(size).toUpperCase().replace(/\s+/g, " ").trim();
    var m = /(?:^|[^0-9])(\d{3})\s*[/ -]\s*(\d{2})\s*(?:[A-Z]{0,2}|-|\s)\s*(\d{2})(?:[^0-9]|$)/.exec(s) || /^(?:P|LT)?(\d{3})(\d{2})(\d{2})$/.exec(s.replace(/[^0-9A-Z]/g, ""));
    if (!m) return null;
    var width = +m[1], aspect = +m[2];
    if (width < 125 || width > 405 || aspect < 20 || aspect > 95) return null;
    return { width: width, aspect: aspect };
  };
  M.isBigTire = function (size) {
    var t = M.tireWidthAspect(size);
    return !!t && t.width >= 265 && t.aspect >= 50;
  };
  M.tireSizeInText = function (text) {
    var m = /(?:P|LT)?\d{3}\s?\/\s?\d{2}\s?Z?R\s?\d{2}/i.exec(text || "");
    return m ? m[0] : null;
  };
  M.bigTireIn = function (text) { return M.isBigTire(M.tireSizeInText(text)); };
  // /api/book pricingVehicleType: the size is the posted tireSize, else the
  // first size in the notes ("Tire size: X" from the Year/Make/Model pick).
  M.autoTier = function (o) {
    if (o.picked || (o.vehicle !== "passenger" && o.vehicle !== "suv")) return o.vehicle;
    var t = o.vehicle;
    if (t === "passenger") t = M.classFromModel(o.make, o.model) || t;
    var size = String(o.tireSize || "").trim() ? o.tireSize : M.tireSizeInText(o.notes);
    if ((t === "passenger" || t === "suv") && M.isBigTire(size)) t = "truck";
    return t;
  };

  // ── Quantity rules ──────────────────────────────────────────────────────
  M.qtyRule = function (kind, service, maxQty) {
    var r = { show: true, max: 8, unit: "tire", label: "How many tires?", capped: false };
    if (kind === "product_tire" || kind === "product_wheel") {
      if (kind === "product_wheel") { r.unit = "wheel"; r.label = "How many wheels?"; }
      if (maxQty > 0 && maxQty < 8) { r.max = maxQty; r.capped = true; }
      return r;
    }
    if (service === "rotation") { r.show = false; return r; }
    if (service === "tpms") { r.max = 4; r.unit = "sensor"; r.label = "How many sensors?"; }
    else if (service === "balancing" || service === "road_force_balancing") { r.max = 4; r.unit = "wheel"; r.label = "How many wheels?"; }
    else if (service === "flat_repair") { r.max = 4; r.unit = "tire"; r.label = "How many tires to patch?"; }
    return r;
  };
  M.defaultQty = function (kind, service, vehicle) {
    if (service === "flat_repair" && kind === "service") return 1;
    if ((kind === "swap" || service === "rotation") && vehicle === "dually") return 6;
    return 4;
  };
  // The count a price or the request uses. Rotation is priced per tire since
  // 2026-11-13 (live pt-booking-page bpQty / pt-service-booking-modal sbQty)
  // but is always the whole set - 4, or 6 on a dually - so it has no qty box.
  M.qtyFor = function (st) {
    if (st.service === "rotation" && st.kind === "service") return st.vehicle === "dually" ? 6 : 4;
    return st.qty;
  };

  // ── Install promotions (live 2026-11-13) ────────────────────────────────
  // The page shows a promo from snippets/pt-install-promo.liquid and puts it
  // on the booking button (data-install-price = promo price, data-install-was
  // = the regular price, data-install-promo-id/-label/-style). Same rule as
  // live pt-booking-modal bkCheckPromo: the promo holds only while
  // GET /api/services still lists it in installPromos (null = not loaded yet,
  // trust the page) and covers this booking's vehicle (default sedan, EV and
  // SUV; "largetruck" counts as a car - the form picks it from an R21+ rim
  // alone). Otherwise the regular price applies. /api/book prices the booking
  // itself either way (web-install-promo.ts).
  M.PROMO_DEFAULT_VEHICLES = ["passenger", "electric", "suv"];
  M.promoApplies = function (p, vehicle, promos) {
    if (!p || !p.promoId) return false;
    var types = M.PROMO_DEFAULT_VEHICLES;
    if (Array.isArray(promos)) {
      var hit = null;
      for (var i = 0; i < promos.length; i++) if (promos[i] && promos[i].id === p.promoId) hit = promos[i];
      if (!hit) return false;
      if (Array.isArray(hit.vehicleTypes) && hit.vehicleTypes.length) types = hit.vehicleTypes;
    }
    var v = vehicle || "passenger";
    if (v === "largetruck") v = "passenger";
    return types.indexOf(v) !== -1;
  };
  // Install per tire (cents) for a product booking, and the promo when it holds.
  M.productInstall = function (st, cat) {
    var p = st.product;
    if (M.promoApplies(p, st.vehicle, cat && cat.promos)) return { cents: p.installCents, promo: { id: p.promoId, label: p.promoLabel || "Install promo", style: p.promoStyle, wasCents: p.installWasCents } };
    return { cents: p.promoId && p.installWasCents > 0 ? p.installWasCents : p.installCents, promo: null };
  };
  // Is the promo NAMED on screen? A "plain" promo (live 2026-11-14) only
  // lowers the price: no label, no chip, no strike.
  M.promoShown = function (promo) { return !!promo && promo.style !== "plain"; };

  // ── Staggered sets (2026-11-15) ─────────────────────────────────────────
  // One request for 2 front + 2 rear tires of different sizes, from a set
  // card's "Request install" button. The button carries the agreed contract:
  //   data-book-set="staggered" data-from="set_card" data-set-key data-vehicle-type
  //   data-front-* / data-rear-*  (each axle's .ptg__card-book attributes,
  //   prefixed) + data-front-lead / data-rear-lead (today|1-2|order|out)
  // and NO unprefixed tire attributes (an old cached form then finds no
  // product and opens the plain menu, never 4 front tires). Every set branch
  // below is behind st.set, so single bookings post exactly what they did.
  // Prices mirror the server's priceSet (app src/lib/booking/set-price.ts);
  // /api/book reprices the set itself and the done screen shows its total.
  //
  // Owner 2026-11-15 (6a-6d): a set installs at the catalogue Truck rate
  // (installation_off byVehicle.truck, $35 today) on ALL 4 tires when EITHER
  // size is 265 mm or wider - width only, low-profile included (NOT the
  // #341 aspect rule) - WHATEVER vehicle type is picked (6d, round 3:
  // passenger, suv, electric, largetruck, truck, van, dually, trailer or
  // unknown; it supersedes the 6a car-only list). Per line: max(that tire's
  // regular install, truck). A promo never applies to a set on the truck
  // rate, otherwise only when BOTH tires carry the same promo. No truck rate
  // in the live catalogue -> the call screen (never a guessed price; server
  // no_truck_rate). Mirrors setTruckRateApplies (app big-tire-tier.ts).
  M.SET_TRUCK_MIN_WIDTH_MM = 265;
  M.SET_QTY = 2; // tires per axle, fixed (no stepper)
  // The vehicle is accepted for the callers' sake and deliberately not read (6d).
  M.setTruck = function (vehicle, sizes) {
    return (sizes || []).some(function (z) { var t = M.tireWidthAspect(z); return !!t && t.width >= M.SET_TRUCK_MIN_WIDTH_MM; });
  };
  // The catalogue's Truck install rate (cents), null when it lists no
  // positive one (the server then refuses the set: no_truck_rate). The
  // offline FALLBACK_SERVICES list carries $35, and a fallback catalogue can
  // never post a set (setsOpen needs the live one).
  M.truckInstallCents = function (cat) {
    var row = cat && cat.services ? cat.services.installation_off : null;
    var bv = row && row.prices && row.prices.byVehicle;
    return bv && num(bv.truck) && bv.truck > 0 ? cents(bv.truck) : null;
  };
  // The vehicle a set's install promo is judged for: the server's
  // webPromoVehicleType (web-install-promo.ts) - the posted type, read as a
  // car when unknown or "largetruck"; a pickup by make / model is a truck
  // whatever was posted; a Sedan typed as an SUV is an SUV; a Sedan / SUV on
  // a big front tire (#341) is a truck.
  var SET_SUV_EXTRA = { "mercedes-benz": /\b(g-class|g ?\d{3})\b/, mercedes: /\b(g-class|g ?\d{3})\b/ };
  M.setPromoVehicle = function (st) {
    var veh = (st && st.veh) || {}, v = String((st && st.vehicle) || "");
    var t = M.isVehicle(v) && v !== "largetruck" ? v : "passenger";
    var cls = M.classFromModel(veh.make, veh.model);
    if (!cls) {
      var mk = String(veh.make || "").toLowerCase().trim(), md = String(veh.model || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (SET_SUV_EXTRA[mk] && SET_SUV_EXTRA[mk].test(md)) cls = "suv";
    }
    if (cls === "truck") return "truck";
    if (t === "passenger" && cls) t = cls;
    var front = st && st.lines && st.lines[0] && st.lines[0].product ? st.lines[0].product.tireSize : "";
    if ((t === "passenger" || t === "suv") && M.isBigTire(front)) t = "truck";
    return t;
  };
  M.regularInstallCents = function (p) { return p.promoId && p.installWasCents > 0 ? p.installWasCents : p.installCents; };
  // Install per tire for each line, in line order: [{cents, promo, truck}].
  M.setInstall = function (st, cat) {
    var lines = st.lines || [];
    var truck = M.setTruck(st.vehicle, lines.map(function (l) { return l.product.tireSize; }));
    var tc = M.truckInstallCents(cat);
    var pid = lines.length ? lines[0].product.promoId : "";
    var pv = truck ? "" : M.setPromoVehicle(st);
    var promo = !truck && !!pid && lines.every(function (l) { return l.product.promoId === pid && M.promoApplies(l.product, pv, cat && cat.promos); });
    return lines.map(function (l) {
      var p = l.product, reg = M.regularInstallCents(p);
      // cents null = the truck rate is not known: never priced (call screen).
      if (truck) return { cents: tc == null ? null : Math.max(reg, tc), promo: null, truck: true };
      if (promo) return { cents: p.installCents, promo: { id: p.promoId, label: p.promoLabel || "Install promo", style: p.promoStyle, wasCents: p.installWasCents }, truck: false };
      return { cents: reg, promo: null, truck: false };
    });
  };
  // Tier B when either tire is Tier B (the later earliest day wins).
  M.setTier = function (lines) { return (lines || []).some(function (l) { return l.product.supplierTier !== "A"; }) ? "B" : "A"; };
  // Tires that pay the levy: the lines whose price does not already carry it.
  M.setLevyQty = function (st, cat) {
    return (st.lines || []).reduce(function (n, l) { return n + (M.levyApplies(l.product, cat) ? l.qty : 0); }, 0);
  };
  // Lead time of the set = the slower tire's (lead only, never a count).
  M.LEAD_RANK = { today: 0, "1-2": 1, order: 2, out: 3 };
  M.LEAD_TEXT = { today: "Ready today", "1-2": "Ready in 1–2 business days", order: "Order in" };
  M.setLead = function (lines) {
    var worst = "today";
    (lines || []).forEach(function (l) {
      var v = l && l.product && Object.prototype.hasOwnProperty.call(M.LEAD_RANK, l.product.lead) ? l.product.lead : "out";
      if (M.LEAD_RANK[v] > M.LEAD_RANK[worst]) worst = v;
    });
    return (lines && lines.length) ? worst : "out";
  };
  // "245/40ZR19" / "P245/40R19" -> "245/40R19" (same tire size?).
  M.normSize = function (z) {
    var s = String(z || "").toUpperCase().replace(/\s+/g, "");
    var m = /(\d{3})\/?(\d{2})Z?R(\d{2})/.exec(s);
    return m ? m[1] + "/" + m[2] + "R" + m[3] : s.replace(/^(P|LT)/, "");
  };
  // Does a tire name already print its size (normalised: "245/40ZR20" in
  // the name = "245/40R20")? Then "(size)" is not added after it again.
  M.nameHasSize = function (name, size) {
    var want = M.normSize(size);
    if (!want) return true;
    var n = String(name || "").toUpperCase().replace(/\s+/g, ""), re = /\d{3}\/?\d{2}Z?R\d{2}/g, m;
    while ((m = re.exec(n))) if (M.normSize(m[0]) === want) return true;
    return n.indexOf(String(size).toUpperCase().replace(/\s+/g, "")) !== -1;
  };
  M.nameWithSize = function (name, size) { return name + (size && !M.nameHasSize(name, size) ? " (" + size + ")" : ""); };
  // '' when the set can be requested online, else a reason code (never a
  // count): lines | tire | price | same | vendor | out | qty.
  M.setCheck = function (set) {
    var L = set && Array.isArray(set.lines) ? set.lines : null;
    if (!L || L.length !== 2 || !L[0] || !L[1] || L[0].position !== "front" || L[1].position !== "rear" || L[0].qty !== M.SET_QTY || L[1].qty !== M.SET_QTY || !L[0].product || !L[1].product) return "lines";
    var f = L[0].product, r = L[1].product, code = "";
    [f, r].forEach(function (p) {
      if (code) return;
      if (!String(p.tireSize || "").trim() || p.isWheel === true) code = "tire";
      else if (!(p.tirePriceCents > 0) || !String(p.productHandle || "").trim() || !String(p.variantId || "").trim()) code = "price";
      // The levy flag unread: a total without a mandatory fee is never shown
      // (the server refuses a set whose levy it cannot read, too).
      else if (p.levyInPrice !== true && p.levyInPrice !== false) code = "price";
    });
    if (code) return code;
    if (String(f.variantId) === String(r.variantId) || M.normSize(f.tireSize) === M.normSize(r.tireSize)) return "same";
    if (String(f.vendor || "").trim().toLowerCase() !== String(r.vendor || "").trim().toLowerCase()) return "vendor";
    if (f.soldOut || r.soldOut || M.setLead(L) === "out") return "out";
    if ((f.maxQty > 0 && f.maxQty < M.SET_QTY) || (r.maxQty > 0 && r.maxQty < M.SET_QTY)) return "qty";
    return "";
  };
  // What the live catalogue adds to setCheck: '' or "price" when the set
  // needs the truck rate (width, any vehicle) and the catalogue lists none.
  M.setCatCheck = function (st, cat) {
    var L = (st && st.lines) || [];
    var truck = M.setTruck(st && st.vehicle, L.map(function (l) { return l && l.product ? l.product.tireSize : ""; }));
    return truck && M.truckInstallCents(cat) == null ? "price" : "";
  };
  // One product block from a button's data-* (the old openBookingModal).
  // pre "" reads exactly the single keys; "front" / "rear" the prefixed ones.
  M.productFromData = function (d, pre) {
    d = d || {};
    var g = function (n) { return d[pre ? pre + n.charAt(0).toUpperCase() + n.slice(1) : n]; };
    if (g("tireName") == null && g("tireSize") == null && g("productHandle") == null && g("tirePrice") == null) return null;
    var flag = function (v) { v = String(v || "").trim(); return v === "true" ? true : v === "false" ? false : null; };
    var install = parseFloat(g("installPrice"));
    return {
      tireName: g("tireName") || "Tire", vendor: g("vendor") || "", tireSize: g("tireSize") || "",
      tirePriceCents: parseInt(g("tirePrice") || "0", 10) || 0,
      installCents: Math.round((install > 0 ? install : 30) * 100),
      // Install promo the page showed: installPrice is the promo's, installWas the regular one.
      promoId: String(g("installPromoId") || ""),
      installWasCents: g("installPromoId") && parseFloat(g("installWas")) > 0 ? Math.round(parseFloat(g("installWas")) * 100) : 0,
      // Style as live pt-booking-modal (2026-11-14): "strike", "plain" (no
      // label, no strike - Competition Act: the promo price IS the install
      // price) or "save"; a plain promo carries no label.
      promoLabel: g("installPromoId") && g("installPromoStyle") !== "plain" ? String(g("installPromoLabel") || "Install promo") : "",
      promoStyle: !g("installPromoId") ? "save" : g("installPromoStyle") === "strike" ? "strike" : g("installPromoStyle") === "plain" ? "plain" : "save",
      levyInPrice: flag(g("levyInPrice")), isWheel: flag(g("isWheel")),
      productHandle: g("productHandle") || "", variantId: g("variantId") || "",
      maxQty: parseInt(g("maxQty"), 10) || 0, soldOut: g("soldOut") === "true",
      supplierTier: g("supplierTier") === "A" ? "A" : "B",
      inventorySource: g("inventorySource") === "trial" ? "trial" : "store",
      vehicleType: g("vehicleType") || "", image: g("image") || ""
    };
  };
  // The set a [data-book-set] button describes (qty is fixed: any data-qty
  // or ctx.qty is ignored), or null for an unknown set type.
  M.setFromData = function (d) {
    d = d || {};
    if (d.bookSet !== "staggered") return null;
    var line = function (pos) {
      var p = M.productFromData(d, pos);
      if (p) p.lead = String(d[pos + "Lead"] || "");
      return { position: pos, product: p, qty: M.SET_QTY };
    };
    return { kind: "staggered", key: String(d.setKey || "").slice(0, 200), lines: [line("front"), line("rear")] };
  };
  // ctx for a set (button or PTBook.open({set})): the front product drives
  // every existing tire rule; blocked = the setCheck code when it fails.
  M.setCtx = function (set, base) {
    var ctx = {};
    for (var k in (base || {})) if (k !== "qty" && k !== "product" && k !== "set" && k !== "blocked") ctx[k] = base[k];
    // 2 + 2 always: a qty on the lines (or ctx.qty / data-qty) never counts.
    if (set && Array.isArray(set.lines)) set = { kind: set.kind, key: set.key || "", lines: set.lines.map(function (l) { return l ? { position: l.position, product: l.product, qty: M.SET_QTY } : l; }) };
    var code = M.setCheck(set);
    ctx.set = set || null;
    ctx.product = set && set.lines && set.lines[0] && set.lines[0].product ? set.lines[0].product : null;
    if (code) ctx.blocked = code;
    return ctx;
  };

  // ── Money (integer cents) ───────────────────────────────────────────────
  // GST on integer cents, half-up: the PDP's Liquid "Installed total"
  // (installed_subtotal | times: 0.05 | round) gives the same cent.
  M.gstCents = function (sub) { return Math.round((Math.max(0, Math.round(sub)) * 5) / 100); };
  M.money = function (c) {
    var neg = c < 0; c = Math.abs(Math.round(c));
    var s = (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-$" : "$") + s;
  };
  // "$30" for whole dollars, "$189.99" otherwise (unit prices in labels).
  M.moneyShort = function (c) { return c % 100 === 0 ? "$" + String(c / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : M.money(c); };
  M.dollars = function (c) { return c == null ? null : Math.round(c) / 100; };

  // Add-on rate for its picked term (percent add-ons), else the flat row.
  // topLevel (set mode only): months that name no term -> the row's own
  // top-level percent / min / max (the server's set-price.ts pricesAtTerm),
  // instead of the last term (single bookings, unchanged).
  M.addonRate = function (a, months, topLevel) {
    if (a && a.terms && a.terms.length) {
      for (var i = 0; i < a.terms.length; i++) if (a.terms[i].months === months) return a.terms[i];
      return topLevel ? a : a.terms[a.terms.length - 1];
    }
    return a;
  };
  // A set's term: the months when they name one of the row's terms, else null.
  M.setTerm = function (a, months) {
    if (!a || !a.terms || !a.terms.length || !num(months)) return null;
    for (var i = 0; i < a.terms.length; i++) if (a.terms[i].months === months) return months;
    return null;
  };
  // Per-unit cents for a catalogue add-on: a flat amount, or percent of the
  // tire price clamped to [min, max]; 0 for a percent add-on with no price.
  M.addonUnitCents = function (a, tireCents, months, topLevel) {
    if (!a) return 0;
    if (num(a.amount)) return cents(a.amount);
    if (num(a.percent)) {
      if (!(tireCents > 0)) return 0;
      var r = M.addonRate(a, months, topLevel);
      var v = Math.round(tireCents * r.percent / 100);
      if (num(r.min) && v < cents(r.min)) v = cents(r.min);
      if (num(r.max) && v > cents(r.max)) v = cents(r.max);
      return v;
    }
    return 0;
  };
  // Set mode: an add-on's per-unit cents at THE set term rule.
  M.setAddonUnitCents = function (a, tireCents, months) { return M.addonUnitCents(a, tireCents, M.setTerm(a, months), true); };
  M.termLabel = function (months) {
    var y = months / 12;
    if (y === Math.floor(y)) return y + (y === 1 ? " year" : " years");
    return months + " months";
  };
  // The name /api/book stores for an add-on: the term rides on the name
  // (the server drops termMonths / termLabel), e.g. "Protection Plan (1 year)".
  M.addonApiName = function (a, months) {
    if (a && a.terms && a.terms.length && num(months)) return a.name + " (" + M.termLabel(months) + ")";
    return a ? a.name : "";
  };
  M.addonLabel = function (a, months) {
    if (a && a.terms && a.terms.length && num(months)) return a.name + " (" + months + " months)";
    return a ? a.name : "";
  };

  // Which catalogue add-ons a product booking can offer (old product modal):
  // brand allowlist, a price for percent rows, and a bookable shop.
  M.productExtras = function (cat, vendor, tireCents, bookableSlugs) {
    var v = String(vendor || "").trim().toLowerCase();
    return cat.extras.filter(function (a) {
      if (a.allowedVendors && a.allowedVendors.length) {
        if (!v || !a.allowedVendors.some(function (x) { return String(x).trim().toLowerCase() === v; })) return false;
      }
      if (num(a.percent) && !(tireCents > 0)) return false;
      if (a.locations && a.locations.length && bookableSlugs && !a.locations.some(function (s) { return bookableSlugs.indexOf(s) > -1; })) return false;
      return true;
    });
  };
  // Road force upgrade: any job but balancing / road force itself, once the
  // catalogue has it and a bookable shop offers it.
  M.roadForceOffered = function (cat, service, bookableSlugs) {
    var a = cat.addons[RF_SLUG];
    if (!a || service === "balancing" || service === "road_force_balancing") return false;
    if (a.locations && a.locations.length && bookableSlugs && !a.locations.some(function (s) { return bookableSlugs.indexOf(s) > -1; })) return false;
    return true;
  };

  // The levy rules (old bkIsTire / bkFeesApply): a TIRE is one with a size or
  // one the PDP called not-a-wheel; charged only when the tire price does not
  // already carry it (levyInPrice false); a null flag charges nothing here.
  M.isTire = function (p) { return !!String(p.tireSize || "").trim() || p.isWheel === false; };
  M.levyApplies = function (p, cat) { return cat.fees.length > 0 && M.isTire(p) && p.levyInPrice === false; };
  M.tireBuyer = function (p) { return !!String(p.productHandle || "").trim() && p.tirePriceCents > 0; };
  M.asksOldTires = function (st) {
    if (st.kind === "own_tires") return true;
    if (st.kind === "product_tire" || st.kind === "product_wheel") return !!String(st.product.tireSize || "").trim();
    return false;
  };
  M.dropOffOffered = function (st) {
    if (st.kind === "package") return true;
    return (st.kind === "product_tire" || st.kind === "product_wheel") && !!st.product.productHandle && !!String(st.product.tireSize || "").trim();
  };
  M.isDropOff = function (st) { return st.visit === "drop_off" && M.dropOffOffered(st); };

  // Price lines for the "Your request" panel and the request body.
  //   { lines: [{label, cents|null, note, included}], subtotal, gst, total,
  //     priced: false when a service has no price (lines say "Priced at the shop") }
  M.price = function (st, cat) {
    var L = [], sub = 0, priced = true, q = M.qtyFor(st);
    function add(label, c, extra) {
      var o = { label: label, cents: c };
      if (extra) for (var k in extra) o[k] = extra[k];
      L.push(o);
      if (num(c)) sub += c;
    }
    var tpmsA = cat.addons[TPMS_SLUG], dispA = cat.addons[DISPOSAL_SLUG];
    var tpmsC = tpmsA ? M.addonUnitCents(tpmsA, 0) : 6000;
    var dispC = dispA ? M.addonUnitCents(dispA, 0) : 500;
    if (st.set && st.lines && st.kind === "product_tire") {
      // Staggered set: per-line tires, install and Protection Plan; job-level
      // TPMS / flat add-ons x 4; levy on the tires that do not carry it; GST
      // once on the job subtotal (never summed per line).
      var SL = st.lines, ins = M.setInstall(st, cat), n4 = SL.reduce(function (n, l) { return n + l.qty; }, 0);
      var posName = function (l) { return l.position === "rear" ? "rear" : "front"; };
      SL.forEach(function (l) {
        add((l.position === "rear" ? "Rear" : "Front") + " tires · " + l.qty + " × " + M.moneyShort(l.product.tirePriceCents), l.product.tirePriceCents * l.qty);
      });
      // Never a set total with a guessed part: no truck rate in the catalogue,
      // or a tire whose levy flag is unread -> unpriced (the call screen).
      if (ins.some(function (u) { return u.cents == null; }) || SL.some(function (l) { return l.product.levyInPrice !== true && l.product.levyInPrice !== false; })) {
        return { lines: L, subtotal: null, gst: null, total: null, priced: false };
      }
      var same = ins.every(function (u) { return u.cents === ins[0].cents && !!u.promo === !!ins[0].promo; });
      if (same) {
        var u0 = ins[0], was = 0;
        if (u0.promo && u0.promo.style === "strike") SL.forEach(function (l, i) { was += (ins[i].promo.wasCents > ins[i].cents ? ins[i].promo.wasCents : ins[i].cents) * l.qty; });
        add("Installation" + (u0.truck ? " (truck rate)" : M.promoShown(u0.promo) ? " (" + u0.promo.label + ")" : "") + " · " + n4 + " × " + M.moneyShort(u0.cents), u0.cents * n4,
          was > u0.cents * n4 ? { wasCents: was } : null);
      } else {
        SL.forEach(function (l, i) {
          add("Installation, " + posName(l) + (ins[i].truck ? " (truck rate)" : "") + " · " + l.qty + " × " + M.moneyShort(ins[i].cents), ins[i].cents * l.qty);
        });
      }
      if (st.add.tpms) add("TPMS sensors · " + n4 + " × " + M.moneyShort(tpmsC), tpmsC * n4);
      var buyers = SL.every(function (l) { return M.tireBuyer(l.product); });
      if (M.asksOldTires(st) && st.oldTires === "dispose" && buyers) add("Old tires scrapped and recycled", 0, { included: true });
      if (M.asksOldTires(st) && st.oldTires === "dispose" && !buyers) add("Old tires scrapped · " + n4 + " × " + M.moneyShort(dispC), dispC * n4);
      (st.extras || []).forEach(function (a) {
        if (!st.add[a.slug]) return;
        if (num(a.percent)) {
          SL.forEach(function (l) {
            var u = M.setAddonUnitCents(a, l.product.tirePriceCents, st.terms[a.slug]);
            add(M.addonLabel(a, M.setTerm(a, st.terms[a.slug])) + ", " + posName(l) + " · " + l.qty + " × " + M.moneyShort(u), u * l.qty);
          });
        } else {
          var uf = M.setAddonUnitCents(a, 0, st.terms[a.slug]);
          add(M.addonLabel(a, M.setTerm(a, st.terms[a.slug])) + " · " + n4 + " × " + M.moneyShort(uf), uf * n4);
        }
      });
      var lq = M.setLevyQty(st, cat);
      if (lq > 0) cat.fees.forEach(function (f) { add(f.label + " · " + lq + " × " + M.moneyShort(cents(f.amount)), cents(f.amount) * lq); });
      var inPrice = SL.filter(function (l) { return M.isTire(l.product) && l.product.levyInPrice === true; });
      if (inPrice.length && cat.fees.length) add(cat.fees[0].label, 0, { included: true, note: inPrice.length === SL.length ? "In tire price" : "In " + posName(inPrice[0]) + " tire price" });
    } else if (st.kind === "product_tire" || st.kind === "product_wheel") {
      var p = st.product, unit = st.kind === "product_wheel" ? "Wheels" : "Tires";
      if (p.tirePriceCents > 0) add(unit + " · " + q + " × " + M.moneyShort(p.tirePriceCents), p.tirePriceCents * q);
      var inst = M.productInstall(st, cat);
      add("Installation" + (M.promoShown(inst.promo) ? " (" + inst.promo.label + ")" : "") + " · " + q + " × " + M.moneyShort(inst.cents), inst.cents * q,
        inst.promo && inst.promo.style === "strike" && inst.promo.wasCents > inst.cents ? { wasCents: inst.promo.wasCents * q } : null);
      if (st.add.tpms) add("TPMS sensors · " + q + " × " + M.moneyShort(tpmsC), tpmsC * q);
      if (M.asksOldTires(st) && st.oldTires === "dispose" && M.tireBuyer(p)) add("Old tires scrapped and recycled", 0, { included: true });
      if (M.asksOldTires(st) && st.oldTires === "dispose" && !M.tireBuyer(p)) add("Old tires scrapped · " + q + " × " + M.moneyShort(dispC), dispC * q);
      (st.extras || []).forEach(function (a) {
        if (!st.add[a.slug]) return;
        var u = M.addonUnitCents(a, p.tirePriceCents, st.terms[a.slug]);
        add(M.addonLabel(a, st.terms[a.slug]) + " · " + q + " × " + M.moneyShort(u), u * q);
      });
      if (M.levyApplies(p, cat)) {
        cat.fees.forEach(function (f) { add(f.label + " · " + q + " × " + M.moneyShort(cents(f.amount)), cents(f.amount) * q); });
      } else if (M.isTire(p) && p.levyInPrice === true && cat.fees.length) {
        add(cat.fees[0].label, 0, { included: true, note: "In tire price" });
      }
    } else if (st.service) {
      var row = cat.services[st.service], v = st.vehicle, label = LINE_LABEL[st.service] || (row ? row.name : "Service");
      var pr = row ? row.prices || {} : {};
      if (!row) { priced = false; add(label, null, { note: "Priced at the shop" }); }
      else if (row.mode === "per_unit_by_vehicle") {
        if (pr.flatOverride && pr.flatOverride[v] != null) {
          var flatC = cents(pr.flatOverride[v]);
          add(label.replace(/ \(off rims\)$/, "") + ", " + (M.vehicleName(v) || v).toLowerCase() + " · " + M.moneyShort(flatC), flatC);
        } else {
          var base = (pr.byVehicle && pr.byVehicle[v] != null) ? pr.byVehicle[v] : 30;
          var per = (st.add.lowProfile && st.service === "installation_off" && num(pr.lowProfileFloor)) ? Math.max(base, pr.lowProfileFloor) : base;
          add(label + " · " + q + " × " + M.moneyShort(cents(per)), cents(per) * q, per > base ? { note: "low-profile rate" } : null);
        }
      } else if (row.mode === "flat_by_vehicle") {
        var fv = (pr.byVehicle && pr.byVehicle[v] != null) ? pr.byVehicle[v] : 0;
        add(label + " · " + M.moneyShort(cents(fv)), cents(fv));
      } else if (row.mode === "per_unit_flat") {
        add(label + " · " + q + " × " + M.moneyShort(cents(pr.amount || 0)), cents(pr.amount || 0) * q);
      } else { priced = false; add(label, null, { note: "Priced at the shop" }); }
      if ((st.service === "installation_off" || st.service === "installation_on") && st.add.tpms && tpmsA) add("TPMS sensors · " + q + " × " + M.moneyShort(tpmsC), tpmsC * q);
      if (st.service === "installation_off" && st.oldTires === "dispose" && dispA) add("Old tires scrapped · " + q + " × " + M.moneyShort(dispC), dispC * q);
      if (st.add[RF_SLUG] && st.service !== "road_force_balancing" && st.service !== "balancing" && cat.addons[RF_SLUG]) {
        var rfc = M.addonUnitCents(cat.addons[RF_SLUG], 0);
        add("Road force upgrade · " + q + " × " + M.moneyShort(rfc), rfc * q);
      }
    } else {
      return { lines: [], subtotal: null, gst: null, total: null, priced: false, empty: true };
    }
    if (!priced) return { lines: L, subtotal: null, gst: null, total: null, priced: false };
    var g = M.gstCents(sub);
    return { lines: L, subtotal: sub, gst: g, total: sub + g, priced: true };
  };

  // ── Request bodies (the fixed server contract) ─────────────────────────
  // Selected catalogue add-ons, as /api/book takes them (old product modal).
  M.productAddons = function (st, cat) {
    var p = st.product, out = [];
    if (st.set && st.lines) {
      // Set: a percent add-on (Protection Plan) is one entry PER LINE at that
      // tire's own rate; a flat add-on one entry for all 4; the levy once at
      // the leviable count (skipped when 0).
      var n4 = st.lines.reduce(function (n, l) { return n + l.qty; }, 0);
      (st.extras || []).forEach(function (a) {
        if (!st.add[a.slug]) return;
        // THE set term rule (server pricesAtTerm): termMonths only when it
        // names a term; otherwise none, priced at the row's top-level rate.
        var m = M.setTerm(a, st.terms[a.slug]);
        var one = function (qty, tireCents) {
          var o = { slug: a.slug, name: M.addonApiName(a, m), qty: qty, amount: M.setAddonUnitCents(a, tireCents, m) / 100 };
          if (m != null) { o.termMonths = m; o.termLabel = M.termLabel(m); }
          out.push(o);
        };
        if (num(a.percent)) st.lines.forEach(function (l) { one(l.qty, l.product.tirePriceCents); });
        else one(n4, 0);
      });
      var lq = M.setLevyQty(st, cat);
      if (lq > 0) cat.fees.forEach(function (f) { out.push({ slug: f.slug, name: f.apiName, qty: lq, amount: f.amount }); });
      return out;
    }
    (st.extras || []).forEach(function (a) {
      if (!st.add[a.slug]) return;
      var m = st.terms[a.slug];
      var o = { slug: a.slug, name: M.addonApiName(a, m), qty: st.qty, amount: M.addonUnitCents(a, p.tirePriceCents, m) / 100 };
      if (a.terms && a.terms.length && num(m)) { o.termMonths = m; o.termLabel = M.termLabel(m); }
      out.push(o);
    });
    if (M.levyApplies(p, cat)) cat.fees.forEach(function (f) { out.push({ slug: f.slug, name: f.apiName, qty: st.qty, amount: f.amount }); });
    return out;
  };
  M.serviceAddons = function (st, cat) {
    var out = [], a = cat.addons[RF_SLUG];
    if (st.service === "road_force_balancing") return out;
    if (a && st.add[RF_SLUG] && num(a.amount)) out.push({ slug: RF_SLUG, name: a.name, qty: M.qtyFor(st), amount: a.amount });
    return out;
  };
  // The trim to send: the one picked in the Year/Make/Model/Trim dropdowns
  // while the Model box still holds the model the picker wrote (live
  // /pages/booking sends only window.ptPickedTrim), else the saved vehicle's
  // while make + model still match it (live product / service modals).
  M.bookTrim = function (st) {
    var pk = st.picked;
    if (pk && pk.trim && String(st.veh.model || "").trim() === pk.model) return String(pk.trim).slice(0, 60);
    return M.matchingTrim(st.veh, st.savedVehicle);
  };
  // Year / Make / Model / Trim picker (live snippets/pt-booking-ymm.liquid on
  // /pages/booking, 2026-11-14): the vehicle type a picked trim sets - same
  // regexes, same order - and the label the live result line shows.
  var YMM_PICKUP = /F-?\d{3}|Super Duty|Silverado|Sierra|\bRam\b|\b[1-5]500\b|Tundra|Tacoma|Titan|Frontier|Colorado|Canyon|Ranger|Ridgeline|Gladiator|Maverick|Santa Cruz|Lightning|Cybertruck|R1T|Hummer EV Pickup|Avalanche|Dakota|Raider|Mark LT|Escalade EXT|Sport Trac|Baja|Hardbody/i;
  var YMM_EV = /^(Tesla|Polestar|Rivian|Lucid)$/i;
  M.ymmType = function (make, model, trim, sizes) {
    var lt = (sizes || []).some(function (z) { return /^LT|LT\b/i.test(z); });
    if (YMM_PICKUP.test(String(model || "")) || lt) {
      var du = /DRW|Dual Rear|Dually/i.test(String(trim || ""));
      return { type: du ? "dually" : "truck", label: du ? "Dually pickup" : "Pickup truck" };
    }
    if (YMM_EV.test(String(make || ""))) return { type: "electric", label: "Electric" };
    return { type: "passenger", label: "Car / SUV" };
  };
  // The factory size rides in the notes as live does: one "Tire size: X" line
  // at the top, replacing an earlier one ("" removes it). /api/book's
  // big-tire rule reads it there (tireSizeInText) when no tireSize is posted.
  M.notesWithSize = function (notes, size) {
    var n = String(notes == null ? "" : notes).replace(/^Tire size: .*\n?/m, "");
    return (size ? "Tire size: " + size + (n ? "\n" + n : "") : n).slice(0, 1000);
  };
  // The saved vehicle's trim rides along only while make + model still match it.
  M.matchingTrim = function (veh, saved) {
    if (!saved || !saved.trim) return "";
    var same = function (a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); };
    return same(veh.make, saved.make) && same(veh.model, saved.model) ? String(saved.trim) : "";
  };
  // Mileage -> whole km (commas, spaces, "km" stripped); "" -> null; else NaN.
  M.parseKm = function (raw) {
    var s = String(raw == null ? "" : raw).replace(/km\.?$/i, "").replace(/[\s,]/g, "");
    if (s === "") return null;
    if (!/^\d{1,7}$/.test(s)) return NaN;
    var n = parseInt(s, 10);
    return n <= 2000000 ? n : NaN;
  };
  M.validYear = function (y) {
    y = String(y || "").trim();
    if (y === "") return true;
    if (!/^\d{4}$/.test(y)) return false;
    var n = parseInt(y, 10);
    return n >= 1900 && n <= new Date().getFullYear() + 2;
  };
  M.phoneDigits = function (p) {
    var d = String(p || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    return d;
  };
  M.validEmail = function (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim()); };

  // One contact validator (plan step 4); emailRequired per kind.
  // strictPhone: the package paths keep the old builder's 10-digit rule
  // (pt-package-builder validate); /api/book keeps the old modals' loose rule.
  M.validateContact = function (c, emailRequired, strictPhone) {
    var e = {}, name = String(c.name || "").trim(), phone = String(c.phone || "").trim(), email = String(c.email || "").trim();
    // e.missing only when a field is actually empty (a short name gets its own line).
    if (!name || !phone || (emailRequired && !email)) e.missing = "Please fill in your name, mobile number" + (emailRequired ? " and email." : ".");
    if (name && name.length < 2) e.name = "Please enter your full name.";
    if (name.length > 80) e.name = "Please shorten your name to 80 characters.";
    // Same rule as the old surfaces (the server checks 7+ characters):
    // allow 7-15 digits so extensions and international numbers still book.
    var pd = M.phoneDigits(phone).length;
    if (phone && strictPhone && pd !== 10) e.phone = "Enter a 10-digit mobile number, like 403 555 0123.";
    else if (phone && (pd < 7 || pd > 15)) e.phone = "Please check your mobile number, like 403 555 0123.";
    if (email && !M.validEmail(email)) e.email = "Please check your email address.";
    if (emailRequired && !email) e.emailMissing = true;
    if (!name) e.nameMissing = true;
    if (!phone) e.phoneMissing = true;
    return e;
  };

  // POST /api/book for a product (tire or wheel) - the old product modal body.
  M.productBody = function (st, cat) {
    var p = st.product, pr = M.price(st, cat), km = M.parseKm(st.veh.odo);
    var asks = M.asksOldTires(st), drop = M.isDropOff(st);
    var b = {
      name: st.contact.name, phone: st.contact.phone, email: st.contact.email, notes: String(st.notes || "").slice(0, 1000),
      vehicleType: st.vehicle,
      vehicleYear: st.veh.year, vehicleMake: st.veh.make, vehicleModel: st.veh.model,
      vehicleTrim: M.bookTrim(st),
      odometerKm: (num(km)) ? km : null,
      tireName: p.tireName, tireSize: p.tireSize, qty: st.qty, tpms: !!st.add.tpms,
      // A tire buyer leaves old tires with us at no charge (oldTires
      // 'dispose', disposal false); only own tires pay disposal.
      disposal: asks && st.oldTires === "dispose" && !M.tireBuyer(p),
      oldTires: asks ? st.oldTires : null,
      customAddons: M.productAddons(st, cat),
      serviceId: "installation_off", mountState: "off",
      // The install per tire this page charged, and the promo it showed:
      // /api/book compares them with its own price (never trusted alone).
      installPerTireCents: M.tireBuyer(p) ? M.productInstall(st, cat).cents : null,
      installPromoId: M.tireBuyer(p) && M.productInstall(st, cat).promo ? p.promoId : null,
      location_id: st.location || "sw",
      supplierTier: p.supplierTier, productHandle: p.productHandle,
      variantId: p.variantId || null, inventorySource: p.inventorySource,
      date: st.date, time: drop ? null : st.time,
      waitOrDrop: M.dropOffOffered(st) ? (drop ? "drop_off" : "wait") : null,
      subtotal: M.dollars(pr.subtotal), gst: M.dollars(pr.gst), total: M.dollars(pr.total),
      company_website: st.hp || ""
    };
    if (st.set && st.lines) {
      // Staggered set (contract with /api/book, plan resolution 3): the top
      // level is the FRONT line (qty 2 = the front count) plus its price;
      // `rear` marks the set. The server derives tier / supply / lead time
      // for both lines itself and prices the whole set (priceSet).
      var F = st.lines[0], R = st.lines[1], ins = M.setInstall(st, cat);
      b.qty = F.qty;
      b.installPerTireCents = ins[0].cents;
      b.installPromoId = ins[0].promo && ins[1].promo ? F.product.promoId : null;
      b.tirePriceCents = F.product.tirePriceCents;
      b.rear = {
        variantId: R.product.variantId || null, productHandle: R.product.productHandle,
        tireName: R.product.tireName, tireSize: R.product.tireSize, qty: R.qty,
        tirePriceCents: R.product.tirePriceCents, installPerTireCents: ins[1].cents
      };
      b.notes = M.setNotes(st.notes, R);
    }
    return b;
  };
  // A set's notes: the customer's own, then a backup line naming the rear
  // tires ("Rear: 2 × <name>", "(<size>)" added when the name lacks it) so staff still see them if `rear`
  // were ever dropped - the whole within the server's 1,000-character cap
  // (the customer's text is cut, never the rear line).
  M.SET_NOTES_MAX = 1000;
  M.setNotes = function (notes, R) {
    var p = (R && R.product) || {};
    var rl = ("Rear: " + (R && R.qty) + " × " + M.nameWithSize(p.tireName || "Tire", p.tireSize)).slice(0, M.SET_NOTES_MAX);
    var keep = M.SET_NOTES_MAX - rl.length - 1, own = String(notes || "");
    return own && keep > 0 ? own.slice(0, keep) + "\n" + rl : rl;
  };
  // POST /api/book for own tires, swaps and services (old service modal body,
  // the superset of the booking page's).
  M.serviceBody = function (st, cat) {
    var pr = M.price(st, cat), km = M.parseKm(st.veh.odo), s = st.service;
    var own = s === "installation_off", ack = s === "installation_off" || s === "installation_on";
    var row = cat.services[s];
    var b = {
      bookType: "service", location_id: st.location || "",
      serviceName: row ? row.name : "Service", serviceId: s,
      mountState: own ? "off" : s === "installation_on" ? "on" : "",
      repairType: s === "flat_repair" ? "patch" : "",
      qty: M.qtyFor(st), tpms: !!st.add.tpms,
      disposal: own && st.oldTires === "dispose",
      oldTires: own ? st.oldTires : null,
      tireConditionAck: ack ? !!st.ack : null,
      lowProfile: !!(own && st.add.lowProfile),
      customAddons: M.serviceAddons(st, cat),
      name: st.contact.name, phone: st.contact.phone, email: st.contact.email, notes: String(st.notes || "").slice(0, 1000),
      vehicleType: st.vehicle,
      vehicleYear: st.veh.year, vehicleMake: st.veh.make, vehicleModel: st.veh.model,
      vehicleTrim: M.bookTrim(st),
      odometerKm: num(km) ? km : null,
      date: st.date, time: st.time,
      subtotal: M.dollars(pr.subtotal), gst: M.dollars(pr.gst), total: M.dollars(pr.total),
      company_website: st.hp || ""
    };
    // The tire size the customer typed (own tires / swap): /api/book's
    // big-tire rule reads it. Sent only when given, so the body is otherwise
    // exactly the old one.
    var ts = String(st.tireSize || "").trim();
    if (ts && (s === "installation_off" || s === "installation_on")) b.tireSize = ts.slice(0, 60);
    return b;
  };
  M.bookBody = function (st, cat) {
    return (st.kind === "product_tire" || st.kind === "product_wheel") ? M.productBody(st, cat) : M.serviceBody(st, cat);
  };
  // What staff read on a "Request this day" call-back for this booking.
  M.callbackService = function (st, cat) {
    if (st.set && st.lines) return ("Tire install (staggered set): " + st.lines.map(function (l) { return l.qty + " × " + M.nameWithSize(l.product.tireName, l.product.tireSize) + " " + l.position; }).join(" + ")).slice(0, 200);
    if (st.kind === "product_tire" || st.kind === "product_wheel") return "Tire install" + (st.product.tireName ? ": " + st.qty + " × " + st.product.tireName : "");
    if (st.kind === "package") return "Wheel & tire package install";
    var row = st.service ? cat.services[st.service] : null;
    return row ? row.name : null;
  };
  // POST /api/appointment-request (PTBookingCore.renderRequestPanel's body).
  M.callbackBody = function (o) {
    var t = function (v) { return String(v == null ? "" : v).trim(); };
    return {
      date: o.dateISO, name: t(o.name), phone: t(o.phone),
      email: t(o.email) || null, preferredTime: t(o.preferredTime) || null, notes: t(o.notes) || null,
      service: o.service || null, vehicle: o.vehicle || null, location: o.locationSlug || null
    };
  };
  // POST /api/package/request, mode install (old builder sendRequest body).
  M.packageInstallBody = function (o) {
    var body = {
      mode: "install", selection: o.selection,
      contact: { name: String(o.name || "").slice(0, 80), phone: String(o.phone || "").slice(0, 30), email: String(o.email || "").slice(0, 120) },
      date: o.date, notes: String(o.notes || "").slice(0, 1000),
      shownTotalCents: o.quote.totalCents, shownLinesDigest: o.quote.linesDigest,
      company_website: o.hp || "", elapsedMs: o.elapsedMs, requestId: o.requestId
    };
    body.waitOrDrop = o.drop ? "drop_off" : "wait";
    if (!o.drop) body.time = o.time;
    return body;
  };
  // POST /api/package/request, mode quote (old builder sendQuote body).
  M.packageQuoteBody = function (o) {
    var body = {
      mode: "quote", vehicle: o.vehicle, vehicleType: o.vehicleType || null, lift: o.lift || null,
      liftInches: o.liftInches != null ? o.liftInches : null, shop: o.shop, hints: o.hints || {},
      scopeReasons: o.scopeReasons || [],
      contact: { name: String(o.name || "").slice(0, 80), phone: String(o.phone || "").slice(0, 30) },
      notes: String(o.notes || "").slice(0, 1000),
      company_website: o.hp || "", elapsedMs: o.elapsedMs
    };
    if (o.email) body.contact.email = String(o.email).slice(0, 120);
    return body;
  };
  // The vehicle block of a quote: the builder's resolved vehicle, else typed text.
  M.quoteVehicle = function (ref, typed, S) {
    if (ref && ref.makeSlug) return { ref: { year: ref.year, make: ref.make, model: ref.model, makeSlug: ref.makeSlug, modelSlug: ref.modelSlug, trim: ref.trim || (S && S.tr) || "" } };
    S = S || {};
    var vy = typed.year || S.y || "", vm = typed.make || S.mk || "", vd = typed.model || S.md || "", vt = typed.trim || S.tr || "";
    if (!(vy || vm || vd)) return null;
    var v = { text: { year: String(vy).slice(0, 60), make: String(vm).slice(0, 60), model: String(vd).slice(0, 60) } };
    if (vt) v.text.trim = String(vt).slice(0, 60);
    return v;
  };

  // ── Server answers -> what the customer reads ──────────────────────────
  // Plan step 4: keyed on status + data.code; supplier / warehouse wording
  // from the server is replaced by the neutral earliest line.
  M.errorFor = function (status, data, o) {
    data = data || {}; o = o || {};
    var phone = o.phone || "(403) 452-4283", shop = o.shopName || "the shop";
    var msg = typeof data.error === "string" ? data.error : "";
    if (status === 0) return { msg: "We couldn’t reach our booking server. Try another browser or call " + shop + " at " + phone + ".", to: null };
    if (status === 429) return { msg: "Too many requests from this device. Please wait a minute and try again.", to: null };
    if ((status === 400 || status === 409) && (data.code === "online_full" || msg === "online_full")) {
      var ph = (typeof data.phone === "string" && data.phone) || phone;
      return { msg: "Online requests for that day are full. Call " + shop + " at " + ph + " to book this one.", to: null, call: true };
    }
    if (status === 409) return { msg: "That time was just taken. Please pick another.", to: "time", retime: true };
    if (status === 402 || status >= 500) return { msg: "Online requests are not working right now. Please call " + shop + " at " + phone + ".", to: null };
    // Staggered set: the server's machine code -> fixed, count-free wording
    // with the shop phone. The server's own text is NEVER shown in set mode
    // (a stock sentence could carry a count or a supplier name).
    if (o.set) {
      // The machine code first; text patterns only for an answer without one
      // (stock before lead: a stock sentence may also name a warehouse).
      var code = typeof data.code === "string" ? data.code : "";
      var SET_STOCK = { msg: "We can’t book this set online right now. Call " + shop + " at " + phone + " and we’ll find you options.", to: null, call: true, code: "set_stock" };
      var SET_LEAD = { msg: "That time is earlier than we can have this set ready. Please pick a later time.", to: "time", retime: true, code: "set_lead" };
      if (code === "set_stock") return SET_STOCK;
      if (code === "set_unidentified") return { msg: "We couldn’t confirm both tires in this set online. Call " + shop + " at " + phone + " and we’ll book it for you.", to: null, call: true, code: code };
      if (code === "set_unavailable") return { msg: "Online requests for this set aren’t open yet. Call " + shop + " at " + phone + " to book it.", to: null, call: true, code: code };
      if (code === "set_lead") return SET_LEAD;
      if (status === 400 && /drop-offs are full/i.test(msg)) return { msg: "Drop-offs are full that day. Please pick another day, or choose a time and wait.", to: "time", dropFull: true };
      if (status === 400 && /left in stock|in stock|only (one|two|three|\d+)\b|can.?t book that many/i.test(msg)) return SET_STOCK;
      if (status >= 400 && /supplier|warehouse|lead time|winter rush|earliest|ordered in/i.test(msg)) return SET_LEAD;
      return { msg: "That didn’t go through. Please try again or call " + shop + " at " + phone + ".", to: null };
    }
    if (status === 400 && /drop-offs are full/i.test(msg)) return { msg: msg.replace(/[—–]/g, ","), to: "time", dropFull: true };
    if (status >= 400 && /supplier|warehouse|lead time|winter rush|earliest/i.test(msg)) {
      return { msg: "That time is earlier than we can have your " + (o.unit || "tire") + "s ready. Please pick a later time.", to: "time", retime: true };
    }
    // Stock guard (server stock-guard.ts): "We only have N of these left in
    // stock..." - never show a stock count. Neutral line, back to details so
    // the customer can lower the quantity. The count-free server wording
    // (2026-11-15, "We can't book that many online right now...") maps here too.
    if (status === 400 && /left in stock|in stock|only (one|two|three|\d+)\b|can.?t book that many/i.test(msg)) {
      return { msg: "We can’t book that many online. Pick fewer, or call " + shop + " at " + phone + " and we’ll get more in.", to: "details", qty: true };
    }
    if (msg) return { msg: msg, to: null };
    return { msg: "That didn’t go through. Please try again or call " + shop + " at " + phone + ".", to: null };
  };

  // ── Hours + slots ─────────────────────────────────────────────────────
  function toMin(s) { var p = String(s || "").split(":"); var v = parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0); return isNaN(v) ? null : v; }
  // The appointment window for a day at a shop (store_hours metaobject):
  // first slot, close, last slot (close - cutoff) and the Friday lunch gap.
  M.hoursFor = function (HOURS, slug, d) {
    var H = (HOURS && (HOURS[slug] || HOURS.sw)) || {};
    var dow = d.getDay(), open, close, gap = null;
    if (dow === 0) { open = toMin(H.hours_sun_open); close = toMin(H.hours_sun_close); }
    else if (dow === 5 && toMin(H.hours_fri_final_close) !== null) {
      open = toMin(H.hours_fri_open); close = toMin(H.hours_fri_final_close);
      var gc = toMin(H.hours_fri_close), gr = toMin(H.hours_fri_reopen);
      if (gc !== null && gr !== null && gr > gc) gap = [gc, gr];
    } else { open = toMin(H.hours_mon_sat_open); close = toMin(H.hours_mon_sat_close); }
    if (open === null) open = dow === 0 ? 600 : 540;
    if (close === null) close = dow === 0 ? 840 : 1020;
    return { open: open, close: close, last: close - (parseInt(H.booking_cutoff_minutes, 10) || 30), gap: gap };
  };
  M.minsToSlot = function (mins) {
    var h = Math.floor(mins / 60), m = mins % 60, hr = h > 12 ? h - 12 : h;
    return hr + ":" + (m < 10 ? "0" : "") + m + " " + (h >= 12 ? "PM" : "AM");
  };
  M.slotToMins = function (slot) {
    var m = String(slot || "").match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    var h = parseInt(m[1], 10), mn = parseInt(m[2], 10);
    if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + mn;
  };
  // "9 AM", "2:30 PM"
  M.clock = function (mins) {
    var h = Math.floor(mins / 60), m = mins % 60, hr = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return hr + (m ? ":" + (m < 10 ? "0" : "") + m : "") + " " + (h >= 12 ? "PM" : "AM");
  };
  M.localISO = function (d) {
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  };
  M.parseISO = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null; };
  // The client floor for a product when the server has not answered yet
  // (old bkEarliestDate): Tier A today (2 h lead); Tier B the next business
  // day at 12:30 PM (Sundays skipped), and Oct 15 - Nov 15 at least 24 h.
  // The server's earliest (availability) replaces it as soon as it lands.
  M.localFloor = function (tier, now) {
    if (tier === "A") return null;
    var e = new Date(now);
    e.setDate(e.getDate() + 1);
    if (e.getDay() === 0) e.setDate(e.getDate() + 1);
    e.setHours(12, 30, 0, 0);
    var m = now.getMonth(), d = now.getDate();
    if ((m === 9 && d >= 15) || (m === 10 && d <= 15)) {
      var rush = new Date(now.getTime() + 24 * 3600 * 1000);
      if (rush.getTime() > e.getTime()) e = rush;
    }
    return { dateISO: M.localISO(e), mins: e.getHours() * 60 + e.getMinutes() };
  };
  // Slot list for one day at one shop with the reason each closed slot is
  // closed: lunch gap, past, 2 h same-day notice, before the floor, taken.
  // `need` = consecutive free half-hours (package duration).
  M.grid = function (o) {
    var H = o.hours, iso = o.iso, out = [], booked = o.booked || [], need = Math.max(1, o.need || 1);
    var free = {};
    for (var m0 = H.open; m0 <= H.last; m0 += 30) {
      var inGap0 = H.gap && m0 >= H.gap[0] && m0 < H.gap[1];
      free[m0] = !inGap0 && booked.indexOf(M.minsToSlot(m0)) === -1;
    }
    for (var m = H.open; m <= H.last; m += 30) {
      var label = M.minsToSlot(m), why = "";
      if (H.gap && m >= H.gap[0] && m < H.gap[1]) why = "Closed " + M.clock(H.gap[0]) + " – " + M.clock(H.gap[1]);
      else if (o.isToday && m <= o.nowMins) why = "Time has passed";
      else if (o.floor && iso < o.floor.dateISO) why = "early";
      else if (o.floor && iso === o.floor.dateISO && m < o.floor.mins) why = "early";
      else if (o.isToday && o.lead && m < o.nowMins + o.lead) why = "Same-day requests need 2 hours’ notice";
      else if (booked.indexOf(label) > -1) why = "Already requested";
      else if (need > 1) { for (var k = 1; k < need; k++) { if (!free[m + 30 * k]) { why = "Not enough time before the next booking"; break; } } }
      out.push({ t: label, mins: m, ok: !why, why: why });
    }
    return out;
  };
  // "Tue, Nov 18"
  M.shortDay = function (d) { return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
  M.longDay = function (d) { return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); };

  // ════════════════════════════════════════════════════════════════════
  // UI
  // ════════════════════════════════════════════════════════════════════
  M.__ui = function (win) {
    var doc = win.document;
    if (win.PTBook && win.PTBook.__real) return;
    var Core = function () { return win.PTBookingCore; };
    var DATA = (function () { try { var el = doc.getElementById("pt-book-data"); return el ? JSON.parse(el.textContent) : {}; } catch (e) { return {}; } })();
    var YMM = { m: null, y: {}, mv: null, dv: {}, failed: false }; // promises + their loaded values
    var HOURS = DATA.hours || {};
    var CONFIRM_BY = DATA.confirmBy || "by email";
    var CUSTOMER = DATA.customer || win.__bkCustomer || {};
    var CAT = M.catalog(null, false);
    var catLoaded = false, catWaiters = [];
    var instances = [];
    var uid = 0;
    // Set "Add the set to cart": off until the cart groups a set's lines by
    // _set (plan stage 8/9). The owner does not sell online at launch.
    var SET_CART = false;

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function lsGet(k) { try { return win.localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { win.localStorage.setItem(k, v); } catch (e) {} }
    function ssGet(k) { try { return win.sessionStorage.getItem(k); } catch (e) { return null; } }
    function ssSet(k, v) { try { win.sessionStorage.setItem(k, v); } catch (e) {} }
    function ssDel(k) { try { win.sessionStorage.removeItem(k); } catch (e) {} }
    function track(ev, data) {
      try {
        if (win.pt && typeof win.pt.track === "function") return win.pt.track(ev, data || {});
        win.dataLayer = win.dataLayer || [];
        var o = { event: ev }; for (var k in (data || {})) o[k] = data[k];
        win.dataLayer.push(o);
      } catch (e) {}
    }
    function isPhone() { try { return win.matchMedia("(max-width: 749px)").matches; } catch (e) { return false; } }

    // Icons (pt-icon set: 24 grid, 1.75 stroke, round caps). Inline because
    // the form is drawn by JS; same paths as snippets/pt-icon.liquid.
    var ICON = {
      back: '<path d="M15 5l-7 7 7 7"/>',
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
      chevron: '<path d="M6 9l6 6 6-6"/>',
      up: '<path d="M6 15l6-6 6 6"/>',
      left: '<path d="M15 5l-7 7 7 7"/>',
      right: '<path d="M9 5l7 7-7 7"/>',
      phone: '<path d="M5 3.5h3.2l1.6 4-2 1.3a11 11 0 005.4 5.4l1.3-2 4 1.6V17a2.5 2.5 0 01-2.5 2.5A15.5 15.5 0 012.5 6 2.5 2.5 0 015 3.5z"/>',
      calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
      minus: '<path d="M6 12h12"/>',
      plus: '<path d="M12 6v12M6 12h12"/>',
      tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
      shield: '<path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
      gauge: '<path d="M4.6 17.5a8.5 8.5 0 1114.8 0"/><path d="M12 14l3.5-4.5"/><circle cx="12" cy="14.2" r="1.3"/><path d="M7.2 9.3l1 .8M12 6.5v1.3"/>',
      balance: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.2"/><path d="M2.5 9v6M5 10.5v3M21.5 9v6M19 10.5v3"/>',
      wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="2.3"/><path d="M12 9.7V5.8M14.2 11.3l3.7-1.2M13.4 13.9l2.2 3.1M10.6 13.9l-2.2 3.1M9.8 11.3l-3.7-1.2"/>'
    };
    function ico(name, size) {
      return '<svg class="rd-ico" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (name === "check" ? 2.25 : 1.75) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICON[name] + "</svg>";
    }

    // ── Catalogue (GET /api/services, once per page) ────────────────────
    function loadCatalog() {
      if (loadCatalog.p) return loadCatalog.p;
      loadCatalog.p = win.fetch(M.SERVICES_API).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d && Array.isArray(d.services) && d.services.length) {
          CAT = M.catalog(d.services, true);
          // Install promos running now (live bkLivePromoIds): a list once the
          // catalogue answered, even an empty one; null = unknown (trust the page).
          CAT.promos = Array.isArray(d.installPromos) ? d.installPromos.filter(function (x) { return x && x.id; }) : [];
          // Server capabilities (staggered sets: true only once /api/book,
          // /api/availability and the bookings table know the rear line).
          CAT.features = d.features && typeof d.features === "object" ? d.features : {};
        }
        catLoaded = true;
        instances.forEach(function (b) { b.onCatalog(); });
      }).catch(function () {
        catLoaded = true;
        // A set open while the catalogue cannot be reached: the call screen.
        instances.forEach(function (b) { if (b.st && b.st.set) b.onCatalog(); });
      });
      return loadCatalog.p;
    }
    // Online set requests are open only when the live catalogue says so.
    function setsOpen() { return !!(CAT.live && CAT.features && CAT.features.staggeredSets === true); }

    // ── Locations ───────────────────────────────────────────────────────
    function locs() {
      var c = Core();
      if (c && c.loadLocations) return c.loadLocations();
      try { var el = doc.getElementById("pt-locations-data"); var all = el ? JSON.parse(el.textContent) : []; return { all: all, bookable: all.filter(function (l) { return l && l.bookable === true; }) }; } catch (e) { return { all: [], bookable: [] }; }
    }
    function shortName(l) { return String((l && (l.public_name || l.name)) || "Prince Tires").replace(/^Prince Tires\s*[—–-]\s*/i, ""); }
    function street(l) { return (l && (l.street || l.address)) || ""; }
    var SW = { slug: "sw", name: "42 Ave SW", public_name: "Prince Tires — 42 Ave SW", street: "111 42 Ave SW", address: "111 42 Ave SW, Calgary", address_full: "111 42 Ave SW, Calgary, AB T2G 0A4", phone: "(403) 452-4283", phone_href: "+14034524283", is_primary: true };
    function telHref(l) { return "tel:" + ((l && l.phone_href) || String((l && l.phone) || SW.phone).replace(/[^\d+]/g, "")); }

    // ── Saved vehicle / contact ─────────────────────────────────────────
    function garageDefault() {
      try {
        var keys = Object.keys(win.localStorage).filter(function (k) { return k.indexOf("pt-garage-") === 0; });
        for (var i = 0; i < keys.length; i++) {
          var vs = JSON.parse(win.localStorage.getItem(keys[i]));
          var d = (vs || []).filter(function (v) { return v && v.isDefault; })[0];
          if (d) return d;
        }
      } catch (e) {}
      return null;
    }
    function savedSearchVehicle() {
      try {
        var s = JSON.parse(lsGet("pt-tire-search-vehicle") || "null");
        if (s && s.tireSize && Date.now() - new Date(s.savedAt || 0).getTime() < 24 * 3600 * 1000) return s;
      } catch (e) {}
      return null;
    }
    function savedContact() {
      var saved = null; try { saved = JSON.parse(lsGet("pt-booking-contact") || "null"); } catch (e) {}
      return { name: CUSTOMER.name || (saved && saved.name) || "", phone: CUSTOMER.phone || (saved && saved.phone) || "", email: CUSTOMER.email || (saved && saved.email) || "" };
    }

    // ── Product block from a button's data-* (the old openBookingModal) ──
    function productFrom(btn) { return M.productFromData(btn.dataset || {}, ""); }
    function fromOf(btn) {
      var d = btn.dataset || {};
      if (d.from) return d.from;
      if (d.fromCart === "1") return "cart";
      var cls = btn.className || "";
      if (typeof cls === "string") {
        if (cls.indexOf("sticky") > -1) return "pdp_sticky";
        if (cls.indexOf("ptp__") > -1) return "pdp";
      }
      if (btn.closest && btn.closest(".ptg__card, .rd-card, [data-pt-card]")) return "card";
      return "button";
    }
    function ctxFrom(btn) {
      if (!btn) return {};
      var d = btn.dataset || {};
      // A set card's button (data-book-set): 2 front + 2 rear, qty fixed.
      if (d.bookSet !== undefined) {
        var sb = { from: fromOf(btn), location: d.location || "" };
        if (d.vehicleType) sb.vehicleType = d.vehicleType;
        return M.setCtx(M.setFromData(d), sb);
      }
      var ctx = { from: fromOf(btn), location: d.location || "" };
      if (d.book && d.book !== "true" && d.book !== "") ctx.service = d.book;
      if (d.service) ctx.service = d.service;
      if (d.bookKind) ctx.kind = d.bookKind;
      if (d.serviceName) ctx.serviceName = d.serviceName;
      if (d.qty) ctx.qty = parseInt(d.qty, 10) || 0;
      if (d.vehicleType) ctx.vehicleType = d.vehicleType;
      if (d.tireSizeHint) ctx.tireSize = d.tireSizeHint;
      if (!ctx.service && !ctx.serviceName && !ctx.kind && d.bookService === undefined) {
        var p = productFrom(btn);
        if (p) ctx.product = p;
      }
      if (d.bookService !== undefined && !ctx.service && !ctx.serviceName) ctx.serviceName = d.serviceName || "";
      return ctx;
    }

    // ══════════════════════════════════════════════════════════════════
    // One booking form instance
    // ══════════════════════════════════════════════════════════════════
    function Book(mode, host) {
      this.mode = mode;          // 'sheet' | 'page' | 'inline'
      this.id = "ptb" + (++uid);
      this.host = host || null;
      this.seq = 0;              // availability render ticket
      this.hist = 0;             // history entries pushed by this sheet
      instances.push(this);
      this.build();
    }
    var B = Book.prototype;

    B.build = function () {
      var id = this.id, sheet = this.mode === "sheet";
      var html =
        (sheet ? '<div class="rd-sheet__backdrop" data-ptb="close"></div>' : "") +
        '<div class="rd-sheet__panel ptb__panel"' + (sheet ? ' role="dialog" aria-modal="true" aria-labelledby="' + id + '-title" tabindex="-1"' : ' role="region" aria-labelledby="' + id + '-title"') + ">" +
          '<div class="rd-sheet__top ptb__top">' +
            '<button type="button" class="rd-iconbtn rd-sheet__back" data-ptb="back" aria-label="Back">' + ico("back") + "</button>" +
            '<div class="rd-sheet__heading"><div class="rd-sheet__title" id="' + id + '-title"></div><div class="rd-sheet__step" data-ptb-steplabel></div><div class="rd-progress rd-hide-lg"><span data-ptb-prog></span></div></div>' +
            '<ol class="rd-steps rd-hide-sm" aria-label="Steps" data-ptb-steps></ol>' +
            (sheet ? '<button type="button" class="rd-iconbtn rd-iconbtn--bare rd-sheet__close" data-ptb="close" aria-label="Close">' + ico("close") + "</button>" : "") +
          "</div>" +
          '<div class="rd-sheet__grid ptb__grid">' +
            '<div class="rd-sheet__main ptb__main">' +
              '<div class="rd-sheet__body ptb__body" data-ptb-body></div>' +
              '<div class="rd-sheet__foot ptb__foot" data-ptb-foot></div>' +
            "</div>" +
            '<aside class="rd-summary ptb__sum" aria-label="Your request" data-ptb-sum></aside>' +
          "</div>" +
          '<div class="ptb__live rd-sr" aria-live="polite" data-ptb-live></div>' +
        "</div>";
      var el = doc.createElement("div");
      el.className = sheet ? "rd-sheet rd ptb ptb--sheet" : "rd ptb ptb--" + this.mode;
      if (sheet) el.hidden = true;
      el.innerHTML = html;
      this.el = el;
      if (sheet) doc.body.appendChild(el);
      else { this.host.innerHTML = ""; this.host.appendChild(el); }
      this.panel = el.querySelector(".ptb__panel");
      this.bodyEl = el.querySelector("[data-ptb-body]");
      this.footEl = el.querySelector("[data-ptb-foot]");
      this.sumEl = el.querySelector("[data-ptb-sum]");
      this.liveEl = el.querySelector("[data-ptb-live]");
      this.bind();
    };

    // ── State ─────────────────────────────────────────────────────────
    B.reset = function (ctx) {
      ctx = ctx || {};
      var r = M.route(ctx, CAT);
      var L = locs();
      var p = ctx.product || null;
      var garage = garageDefault();
      var st = {
        ctx: ctx, from: ctx.from || this.mode, kind: r.kind, service: r.service, note: r.note,
        steps: r.steps, step: 0, canChangeService: this.mode === "page" || (!p && ctx.kind !== "package" && ctx.kind !== "package_quote"),
        product: p, path: null, vehicle: "passenger", vehiclePicked: false, vehOpen: !p, vehMode: "ymm", ymm: null, picked: null, ymmSizes: null, ymmSize: "", ymmType: "",
        qty: 4, qtyByHand: false, tireSize: ctx.tireSize || "", oldTires: null,
        add: {}, terms: {}, extras: [], accCar: false, accInfo: false,
        location: null, locPinnedBy: "", visit: "wait", date: null, time: null, userPickedDate: false,
        serverEarliest: null, wk: 0, dropFull: {}, avail: null, alt: null, grid: null,
        contact: savedContact(), veh: { year: "", make: "", model: "", odo: "" }, notes: "", ack: false, hp: "",
        savedVehicle: garage, sending: false, error: "", errorTo: null, done: null, tried: false,
        pkg: ctx.pkg || null, quote: null, quoteState: "", conflict: null, requestId: null, callback: null
      };
      this.st = st;
      this._pssFresh = true; // the size search starts over with each request
      // ...and so does the wheel search (back to its By vehicle tab).
      ["wheels", "packages"].forEach(function (k) { var w = wsNode(k), t = w && w.querySelector('[data-pt-ws-tab="vehicle"]'); if (t && !t.classList.contains("is-active")) t.click(); });
      if (this.ymmOn()) ymmManifest().catch(function () { YMM.failed = true; });
      // Vehicle seed: the button's type, then the garage vehicle, then the tire size.
      var vt = ctx.vehicleType || (p && p.vehicleType) || "";
      if (M.isVehicle(vt)) st.vehicle = vt;
      else st.vehicle = M.autoDetectVehicle(p ? p.tireSize : (ctx.tireSize || ""), ctx.vehicle || garage);
      // Vehicle details (step 4): from the garage vehicle; mileage blank.
      var gv = ctx.vehicle || garage;
      if (gv) {
        st.veh.year = /^\d{4}$/.test(String(gv.year || "")) ? String(gv.year) : "";
        st.veh.make = gv.make ? String(gv.make) : "";
        st.veh.model = gv.model ? String(gv.model) : "";
        if (ctx.vehicle && ctx.vehicle.trim) st.savedVehicle = { year: gv.year, make: gv.make, model: gv.model, trim: ctx.vehicle.trim };
      }
      if (!st.tireSize && (r.kind === "own_tires" || r.kind === "swap" || !r.kind)) {
        var ss = savedSearchVehicle();
        st.tireSize = (gv && gv.tireSize) || (ss && ss.tireSize) || "";
      }
      // Quantity seed: cart line / button qty, else 4 (6 for a dually swap).
      st.qty = ctx.qty > 0 ? ctx.qty : M.defaultQty(r.kind, r.service, st.vehicle);
      // Staggered set: 2 front + 2 rear, whatever ctx.qty / data-qty say.
      st.set = ctx.set && !ctx.blocked && r.kind === "product_tire" ? "staggered" : null;
      st.lines = st.set ? ctx.set.lines.map(function (l) { return { position: l.position, product: l.product, qty: M.SET_QTY }; }) : null;
      st.setKey = st.set ? ctx.set.key || "" : "";
      if (st.set) st.qty = st.lines.reduce(function (n, l) { return n + l.qty; }, 0);
      // Shop seed: ?location=, data-location, last choice, booking_default, primary.
      var slug = String(ctx.location || (Core() && Core().queryLocationSlug ? Core().queryLocationSlug() : "") || lsGet("pt-booking-location") || "").toLowerCase();
      var pick = Core() && Core().pickLocation ? Core().pickLocation(L.bookable, slug) : (L.bookable[0] || null);
      st.location = pick ? pick.slug : (L.bookable[0] ? L.bookable[0].slug : "");
      st.locExplicit = !!(ctx.location || (Core() && Core().queryLocationSlug && Core().queryLocationSlug()));
      if (r.kind === "package" && st.pkg) st.location = st.pkg.shop();
      if (p) this.seedProduct();
      this.syncLocation();
      if (!ctx.vehicle && (CUSTOMER.email || CUSTOMER.name)) this.refreshGarage();
    };
    // Cache-then-refresh (old surfaces): the signed-in customer's default
    // vehicle from the app proxy; fills only blank fields, never typed ones.
    B.refreshGarage = function () {
      var self = this, st = this.st;
      if (!win.fetch) return;
      win.fetch("/apps/api/vehicles", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !Array.isArray(d.vehicles) || st !== self.st) return;
        var v = d.vehicles.filter(function (x) { return x && x.isDefault; })[0] || d.vehicles[0];
        if (!v) return;
        st.savedVehicle = { year: v.year, make: v.make, model: v.model, trim: v.trim || "", tireSize: v.tireSize || "" };
        var fill = { year: /^\d{4}$/.test(String(v.year || "")) ? String(v.year) : "", make: v.make || "", model: v.model || "" };
        Object.keys(fill).forEach(function (k) {
          if (st.veh[k] || !fill[k]) return;
          st.veh[k] = fill[k];
          var i = self.bodyEl.querySelector('[data-ptb-v="' + k + '"]');
          if (i && !i.value) i.value = fill[k];
        });
        if (!st.tireSize && v.tireSize && (st.kind === "own_tires" || st.kind === "swap")) st.tireSize = v.tireSize;
        self.renderSum();
      }).catch(function () {});
    };
    B.seedProduct = function () {
      var st = this.st, p = st.product;
      if (st.set && st.lines) {
        // A set never takes the front tire's max-qty cap (no stepper): 2 + 2.
        st.qty = st.lines.reduce(function (n, l) { return n + l.qty; }, 0);
      } else {
        var rule = M.qtyRule(st.kind, st.service, p.maxQty);
        if (st.qty > rule.max) st.qty = rule.max;
        if (st.qty < 1) st.qty = 1;
      }
      var L = locs();
      st.extras = M.productExtras(CAT, p.vendor, p.tirePriceCents, L.bookable.map(function (l) { return l.slug; }));
      // Set: a percent add-on needs a price on BOTH tires.
      if (st.set && st.lines && st.lines.some(function (l) { return !(l.product.tirePriceCents > 0); })) st.extras = st.extras.filter(function (a) { return !num(a.percent); });
      // Protection Plan: product_tire only (owner decision 3: tires only).
      if (st.kind !== "product_tire") st.extras = st.extras.filter(function (a) { return a.slug !== PROTECTION_SLUG; });
      // A set pre-selects only a defaultMonths that names a term (else none =
      // the row's top-level rate), as the server prices it.
      st.extras.forEach(function (a) { if (a.terms) st.terms[a.slug] = st.set && st.lines ? a.setDefaultMonths : a.defaultMonths; });
    };
    B.loc = function (slug) {
      var L = locs(), s = slug || this.st.location;
      var c = Core();
      return (c && c.bySlug ? c.bySlug(L.all, s) : null) || L.bookable[0] || SW;
    };
    // Shop restrictions: the service's shops and every ticked add-on's shops.
    B.restrictions = function () {
      var st = this.st, lists = [], named = [];
      if (st.kind === "package") return { lists: [], named: [] };
      var svc = st.service && !(st.kind === "product_tire" || st.kind === "product_wheel") ? CAT.services[st.service] : null;
      if (svc && svc.locations.length) { lists.push(svc.locations); named.push({ slug: svc.slug, name: svc.name, shops: svc.locations }); }
      Object.keys(st.add).forEach(function (k) {
        var a = CAT.addons[k];
        if (st.add[k] && a && a.locations && a.locations.length) { lists.push(a.locations); named.push({ slug: k, name: a.name, shops: a.locations }); }
      });
      return { lists: lists, named: named };
    };
    B.allowed = function () {
      var L = locs(), c = Core(), r = this.restrictions();
      return c && c.allowedLocations ? c.allowedLocations(L.bookable, r.lists) : L.bookable;
    };
    B.syncLocation = function () {
      var st = this.st, allowed = this.allowed();
      st.locPinnedBy = "";
      if (st.kind === "package") return;
      var r = this.restrictions();
      if (r.lists.length) st.locPinnedBy = r.named[0].slug;
      if (allowed.length && !allowed.some(function (l) { return l.slug === st.location; })) {
        st.location = allowed[0].slug; st.time = null;
      }
    };

    // ── Open / close ──────────────────────────────────────────────────
    B.open = function (ctx) {
      var self = this, at = 0;
      ctx = ctx || {};
      // ctx.opener: Safari does not focus a clicked button, so the booking
      // page passes the tile itself for focus to return to on close.
      this.opener = ctx.opener || doc.activeElement;
      this.reset(ctx);
      // Booking page (2026-11-14): its tiles open this sheet on one path
      // (ctx.path) and step 1 shows only that path; "Pick up where you left
      // off" opens it on the saved draft (ctx.resume).
      if (ctx.resume) { at = this.restoreDraft() || 0; this.st.pathLocked = !!this.st.path; }
      else if (ctx.path && !this.st.service && /^(buy|own|svc)$/.test(ctx.path)) { this.st.path = ctx.path; this.st.pathLocked = true; }
      // A set that cannot be requested online (setCheck failed, or the live
      // catalogue says sets are not open): the call screen, no steps.
      var setWhy = Object.prototype.hasOwnProperty.call(ctx, "set") ? (ctx.blocked || (!this.st.set ? "lines" : catLoaded && !setsOpen() ? "closed" : catLoaded ? M.setCatCheck(this.st, CAT) : "")) : "";
      if (setWhy) this.setCall(setWhy);
      else if (this.st.set) track("open_booking_modal", { source: this.st.from, kind: this.st.kind || "menu", set: "staggered", setKey: this.st.setKey });
      else track("open_booking_modal", { source: this.st.from, kind: this.st.kind || "menu" });
      if (this.mode === "sheet") {
        this.el.hidden = false;
        doc.documentElement.classList.add("rd-lock");
        this.hist = 0;
        this.pushHist();
        this.watchViewport(true);
      }
      this.go(at, { first: true });
      if (this.mode === "sheet") setTimeout(function () { try { self.panel.focus({ preventScroll: true }); } catch (e) { self.panel.focus(); } }, 30);
      if (this.st.kind === "package") this.loadPackageQuote();
    };
    // The "Call us to book this set" screen (no POST): why = a setCheck code,
    // or "closed" when the live catalogue has not opened online set requests.
    B.setCall = function (why) {
      var st = this.st, loc = this.loc();
      var L = st.lines || (st.ctx && st.ctx.set && st.ctx.set.lines) || [];
      var rows = L.filter(function (l) { return l && l.product; }).map(function (l) {
        return { k: l.position === "rear" ? "Rear" : "Front", v: M.SET_QTY + " × " + M.nameWithSize(l.product.tireName, l.product.tireSize) };
      });
      var lines = why === "closed"
        ? ["Online requests for staggered sets aren’t open yet.", "Call us and we’ll book this set for you."]
        : ["We can’t book this set online.", "Call us and we’ll find you options."];
      st.done = { call: true, title: "Call us to book this set", lines: lines, rows: rows, shopName: shortName(loc), shopPhone: loc.phone || SW.phone, tel: telHref(loc) };
      st.sending = false;
      track("booking_set_blocked", { reason: why });
    };
    // A set still in its steps: once the catalogue has loaded, re-check what
    // can change after open (sets closed, the truck rate the vehicle type now
    // needs). Switches to the call screen and returns true when blocked.
    B.setGate = function () {
      var st = this.st;
      if (!st || !st.set || !st.lines || st.done || st.sending || !catLoaded) return false;
      var why = !setsOpen() ? "closed" : (M.setCheck({ lines: st.lines }) || M.setCatCheck(st, CAT));
      if (!why) return false;
      this.setCall(why); this.render();
      return true;
    };
    B.close = function (fromPop) {
      if (this.mode !== "sheet" || this.el.hidden) return;
      var self = this;
      this.el.hidden = true;
      doc.documentElement.classList.remove("rd-lock");
      this.watchViewport(false);
      this.el.classList.remove("ptb--sumopen");
      if (!fromPop && this.hist > 0) { var n = this.hist; this.hist = 0; this.ignorePop = true; try { win.history.go(-n); } catch (e) {} }
      this.hist = 0;
      if (this.st && this.st.pkg && this.st.pkg.onClose) { try { this.st.pkg.onClose(); } catch (e) {} }
      else if (this.opener && this.opener.focus) { try { this.opener.focus({ preventScroll: true }); } catch (e) {} }
      // The booking page redraws its "Pick up where you left off" card.
      if (this.onClosed) { try { this.onClosed(); } catch (e) {} }
      void self;
    };
    B.pushHist = function () {
      if (this.mode !== "sheet") return;
      try { win.history.pushState({ ptb: this.id, step: this.st.step }, ""); this.hist++; } catch (e) {}
    };
    B.watchViewport = function (on) {
      var vv = win.visualViewport, self = this;
      if (!vv) return;
      if (!this._vv) this._vv = function () {
        if (!isPhone()) { self.panel.style.height = ""; return; }
        self.panel.style.height = vv.height + "px";
        self.panel.style.top = vv.offsetTop + "px";
      };
      if (on) { vv.addEventListener("resize", this._vv); vv.addEventListener("scroll", this._vv); }
      else { vv.removeEventListener("resize", this._vv); vv.removeEventListener("scroll", this._vv); this.panel.style.height = ""; this.panel.style.top = ""; }
    };

    // ── Steps ───────────────────────────────────────────────────────────
    B.stepName = function () { var st = this.st; return st.done ? "done" : st.steps[st.step]; };
    B.go = function (i, o) {
      o = o || {};
      var st = this.st, prev = st.step;
      st.step = Math.max(0, Math.min(i, st.steps.length - 1));
      st.error = ""; st.errorTo = null; st.tried = false;
      var name = st.steps[st.step];
      if (name === "time") this.enterTime();
      if (name === "you") this.autoTier();
      if (!o.first && !o.fromPop && st.step > prev) this.pushHist();
      this.render();
      this.saveDraft();
      if (!o.first) {
        this.liveSay("Step " + (st.step + 1) + " of " + st.steps.length + ", " + M.STEP_NAME[name]);
        var h = this.bodyEl.querySelector(".rd-sheet__h");
        if (h) { h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (e) {} }
        this.scrollTop();
      }
    };
    B.scrollTop = function () {
      try {
        if (this.mode === "sheet") {
          var sc = isPhone() ? this.el.querySelector(".ptb__grid") : this.el.querySelector(".ptb__main");
          if (sc) sc.scrollTop = 0;
        } else {
          var r = this.el.getBoundingClientRect();
          if (r.top < 0 || r.top > win.innerHeight * 0.6) this.el.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      } catch (e) {}
    };
    B.back = function () {
      var st = this.st;
      if (st.done) { this.close(); return; }
      if (st.step > 0) {
        if (this.mode === "sheet" && this.hist > 1) { try { win.history.back(); return; } catch (e) {} }
        this.go(st.step - 1, { fromPop: true });
      } else this.close();
    };
    B.onPop = function (e) {
      if (this.ignorePop) { this.ignorePop = false; return; }
      if (this.mode !== "sheet" || this.el.hidden) return;
      // Find your size / Search by vehicle open on top of this sheet (booking
      // page) push no history: the phone's back closes that one, and this
      // sheet keeps its step (the entry the back used is put back).
      var kid = doc.querySelector(".pss:not([hidden])"), kv = doc.querySelector(".ptvs.is-open");
      if (kid || kv) {
        if (kid && win.PTSizeSheet && win.PTSizeSheet.close) { try { win.PTSizeSheet.close(); } catch (er) {} }
        if (kv) { var kx = kv.querySelector("[data-close]"); if (kx) kx.click(); }
        try { win.history.pushState({ ptb: this.id, step: this.st.step }, ""); } catch (er) {}
        return;
      }
      var s = e.state;
      this.hist = Math.max(0, this.hist - 1);
      if (this.st.done) { this.close(true); return; }
      if (s && s.ptb === this.id && typeof s.step === "number" && s.step < this.st.step) { this.go(s.step, { fromPop: true }); return; }
      if (this.st.step > 0 && s && s.ptb === this.id) { this.go(this.st.step - 1, { fromPop: true }); return; }
      this.close(true);
    };
    // Change service: step 1 is put in front (or shown again).
    B.toService = function () {
      var st = this.st;
      st.path = st.kind === "own_tires" || st.kind === "swap" ? "own" : st.kind === "service" ? "svc" : st.path;
      if (st.steps[0] !== "service") st.steps = ["service"].concat(st.steps);
      this.go(0);
    };
    B.pickService = function (slug) {
      var st = this.st;
      st.service = slug; st.kind = M.kindForService(slug); st.note = "";
      st.add = {}; st.oldTires = null;
      st.steps = M.stepsFor(st.kind, slug, true);
      st.qty = M.defaultQty(st.kind, slug, st.vehicle); st.qtyByHand = false;
      if (M.NO_TRAILER.indexOf(slug) > -1 && st.vehicle === "trailer") st.vehicle = "passenger";
      st.vehOpen = true;
      this.syncLocation();
    };

    // ── Validation per step ───────────────────────────────────────────
    B.check = function () {
      var st = this.st, name = this.stepName();
      if (name === "service") return st.service ? "" : "Pick a service to continue.";
      if (name === "details") {
        if (M.asksOldTires(st) && !st.oldTires) return "Please choose what we should do with your old tires.";
        if (!this.allowed().length) return "Call us to book this one.";
        return "";
      }
      if (name === "time") {
        if (!this.allowed().length && st.kind !== "package") return "Call us to book this one.";
        if (M.isDropOff(st)) return st.dropOk ? "" : (st.dropMsg || "Pick a day for your drop-off.");
        return st.time ? "" : "Pick a time to continue.";
      }
      return "";
    };
    B.next = function () {
      var st = this.st, msg = this.check();
      if (msg) {
        st.tried = true; st.error = msg; this.renderFoot();
        if (this.stepName() === "details" && M.asksOldTires(st) && !st.oldTires) {
          var g = this.bodyEl.querySelector("[data-ptb-old]"); if (g) { g.classList.add("ptb-err-box"); try { g.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {} var f = g.querySelector("button"); if (f) f.focus(); }
        }
        this.liveSay(msg);
        return;
      }
      if (this.stepName() === "you") { this.send(); return; }
      if (this.stepName() === "quote") { this.sendQuote(); return; }
      this.go(st.step + 1);
    };

    // ── Rendering ─────────────────────────────────────────────────────
    B.render = function () {
      var st = this.st, name = this.stepName();
      // Booking page "New tires or wheels": a search, not a request yet, so
      // no step count or stepper (that path leaves for the tire pages).
      var buyOnly = !st.done && name === "service" && st.path === "buy" && st.pathLocked;
      var title = st.done ? st.done.title : buyOnly ? "New tires or wheels" : st.kind === "package" ? "Request install" : st.kind === "package_quote" ? "Request a package quote" : "Request an appointment";
      this.el.querySelector("#" + this.id + "-title").textContent = title;
      var label = st.done ? (st.done.call ? "Call to book" : "We have your request") : "Step " + (st.step + 1) + " of " + st.steps.length + " · " + M.STEP_NAME[name];
      this.el.querySelector("[data-ptb-steplabel]").textContent = !buyOnly && (st.steps.length > 1 || st.done) ? label : "";
      var prog = this.el.querySelector("[data-ptb-prog]");
      prog.style.width = st.done ? "100%" : Math.round(((st.step + 1) / st.steps.length) * 100) + "%";
      // The set call screen is not a sent request: no steps, no progress.
      var callScr = !!(st.done && st.done.call);
      prog.parentNode.hidden = buyOnly || callScr || (st.steps.length < 2 && !st.done);
      var ol = this.el.querySelector("[data-ptb-steps]");
      ol.innerHTML = !buyOnly && !callScr && st.steps.length > 1 ? st.steps.map(function (s, i) {
        var cls = st.done || i < st.step ? " is-done" : i === st.step ? " is-current" : "";
        return '<li class="rd-steps__item' + cls + '"' + (i === st.step && !st.done ? ' aria-current="step"' : "") + ">" + M.STEP_NAME[s] + "</li>";
      }).join("") : "";
      var backBtn = this.el.querySelector("[data-ptb='back']");
      backBtn.hidden = !!st.done || st.step === 0;
      this.el.classList.toggle("ptb--done", !!st.done);
      this.el.classList.toggle("ptb--nosum", st.kind === "package_quote" || !!st.done);
      this.renderBody();
      this.renderSum();
      this.renderFoot();
    };
    B.liveSay = function (t) { var el = this.liveEl; el.textContent = ""; setTimeout(function () { el.textContent = t; }, 40); };

    B.renderBody = function () {
      var st = this.st, name = this.stepName(), h;
      if (st.done) h = this.vDone();
      else if (name === "service") h = this.vService();
      else if (name === "details") h = this.vDetails();
      else if (name === "time") h = this.vTime();
      else if (name === "you") h = this.vYou();
      else if (name === "quote") h = this.vQuote();
      this.bodyEl.innerHTML = h;
      // "New tires or wheels": the site's own Find your size search, drawn
      // inline (assets/pt-size-sheet.js). The same node moves into each
      // redraw's slot, so answers survive Back / path changes; a new request
      // starts it over.
      var slot = this.bodyEl.querySelector("[data-ptb-buyslot]");
      if (slot && hasSizeSearch()) {
        win.PTSizeSheet.inline(slot, { reset: !!this._pssFresh, surface: "booking_popup" });
        this._pssFresh = false;
      }
      var wslot = this.bodyEl.querySelector("[data-ptb-wsslot]"), wn = wslot && wsNode(wslot.getAttribute("data-ptb-wsslot"));
      if (wn && wn.parentNode !== wslot) wslot.appendChild(wn);
      // "New tires or wheels" is a search, not a request yet: no summary
      // column beside it (path changes redraw only the body, so it is here).
      this.el.classList.toggle("ptb--nosum", st.kind === "package_quote" || !!st.done || (name === "service" && st.path === "buy"));
      if (name === "time" && !st.done) { this.paintGrid(); this.stripToDay(); }
      if (!st.done) this.ymmFill();
    };
    // Phones show ~5 days: keep the picked (or first open) day in view.
    B.stripToDay = function () {
      var strip = this.bodyEl.querySelector(".ptb-days__strip");
      if (!strip || strip.scrollWidth <= strip.clientWidth) return;
      var d = strip.querySelector(".ptb-day.is-on") || strip.querySelector(".ptb-day:not(.is-off)");
      if (d) strip.scrollLeft = Math.max(0, d.offsetLeft - strip.offsetLeft - 4);
    };

    // Step 1 - Service. The three paths (also the booking page's tiles).
    var PATHS = [
      ["buy", "New tires or wheels", "Find tires by size or vehicle, then request installation on the tire’s page."],
      ["own", "My own tires", "Swap tires on rims, or mount tires you bring."],
      ["svc", "Repair or service", "Balancing, rotation, flat repair, TPMS. Road force is at Edmonton Trail NE."]
    ];
    // Heading + line when the sheet opens on one path (booking page tiles).
    var PATH_HEAD = {
      buy: ["New tires or wheels", "Search by tire size, or by your vehicle."],
      own: ["My own tires", "Are your tires already on rims?"],
      svc: ["Repair or service", "Pick the service you need."]
    };
    B.vService = function () {
      var st = this.st, self = this;
      var h = this.savedBanner();
      var paths = PATHS;
      // Only on the booking page (its tiles / deep links); other Book popups
      // keep the short "Tire size or vehicle" box.
      var buyInline = st.path === "buy" && !!(st.ctx && st.ctx.pageFlow) && hasSizeSearch();
      if (buyInline && st.pathLocked) {
        // Booking page "New tires or wheels": the title bar already says it,
        // so straight to the two searches.
      } else if (st.pathLocked && st.path && PATH_HEAD[st.path]) {
        // Opened from one of the booking page's tiles: that path only (the
        // tiles stay on the page behind; closing the sheet goes back to them).
        h += '<div class="ptb-head"><div><h2 class="rd-sheet__h">' + esc(PATH_HEAD[st.path][0]) + '</h2><p class="rd-sheet__sub">' + esc(PATH_HEAD[st.path][1]) + "</p></div></div>";
        if (st.note) h += '<p class="rd-note">' + esc(st.note) + "</p>";
      } else {
        h += '<div class="ptb-head"><h2 class="rd-sheet__h">What can we help with?</h2></div>';
        if (st.note) h += '<p class="rd-note">' + esc(st.note) + "</p>";
        h += '<div class="ptb-tiles" role="group" aria-label="What can we help with?">' + paths.map(function (p) {
          var on = st.path === p[0];
          return '<button type="button" class="ptb-tile' + (on ? " is-on" : "") + '" aria-pressed="' + on + '" data-ptb="path" data-v="' + p[0] + '"><b>' + p[1] + "</b><span>" + p[2] + "</span></button>";
        }).join("") + "</div>";
      }
      if (buyInline) {
        // Owner 2026-11-14: the same two searches as the site (by tire size,
        // by vehicle), one tap at a time; the red button opens the tire list.
        // Owner 2026-11-14 "what if they want wheels": Tires / Wheels /
        // Packages like the home search. Wheels + Packages are the home's
        // wheel search (sections/pt-booking-page renders them hidden).
        var tabs = [["tires", "Tires"]];
        if (wsNode("wheels")) tabs.push(["wheels", "Wheels"]);
        if (wsNode("packages")) tabs.push(["packages", "Packages"]);
        var bt = st.buyTab && tabs.some(function (t) { return t[0] === st.buyTab; }) ? st.buyTab : "tires";
        if (tabs.length > 1) {
          h += '<div class="ptb-buytabs" role="tablist" aria-label="Shop for">' + tabs.map(function (t) {
            var on = t[0] === bt;
            return '<button type="button" class="ptb-buytab' + (on ? " is-on" : "") + '" role="tab" id="' + self.id + '-bt-' + t[0] + '" aria-selected="' + on + '" aria-controls="' + self.id + '-bp" tabindex="' + (on ? 0 : -1) + '" data-ptb="buytab" data-v="' + t[0] + '">' + t[1] + "</button>";
          }).join("") + "</div>";
        }
        h += '<div class="ptb-buypanel" id="' + this.id + '-bp"' + (tabs.length > 1 ? ' role="tabpanel" aria-labelledby="' + this.id + "-bt-" + bt + '"' : "") + ">";
        if (bt === "tires") h += '<div class="ptb-buyslot" data-ptb-buyslot></div>';
        else if (bt === "wheels") h += '<div class="ptb-wsslot" data-ptb-wsslot="wheels"></div>';
        else h += '<p class="ptb-buylede">Wheels, tires, sensors and install, one price.</p><div class="ptb-wsslot" data-ptb-wsslot="packages"></div>';
        h += "</div>";
        h += '<p class="ptb-buynext">' + (bt === "packages" ? "We build the package for your car, then you pick a time." : "Then pick one and tap <b>Request installation</b> on its page.") + "</p>";
      } else if (st.path === "buy") {
        h += '<div class="ptb-panelbox"><p class="ptb-lead">Pick a tire, then press <b>Request installation</b> on its page. You can wait or drop your car off for the day.</p>';
        h += '<form class="ptb-find" data-ptb-find role="search"><label class="rd-sr" for="' + this.id + '-find">Tire size or vehicle</label><input class="ptb-input" id="' + this.id + '-find" name="q" placeholder="Tire size, e.g. 215/50R17, or your vehicle" autocomplete="off"><button class="rd-btn rd-btn--primary" type="submit">Find tires</button></form>';
        h += '<a class="ptb-link" href="/pages/wheel-package">Build a wheel + tire package</a></div>';
      } else if (st.path === "own") {
        var on = CAT.services.installation_on, off = CAT.services.installation_off;
        var opts = [];
        if (on && !on.staffOnly) opts.push(["installation_on", "On rims · seasonal swap", "Tires already mounted on their own rims.", fromPrice(on)]);
        if (off && !off.staffOnly) opts.push(["installation_off", "Off rims · mount and balance", "We mount tires you bring onto your rims.", fromPrice(off)]);
        h += '<div class="ptb-tiles ptb-tiles--2" role="group" aria-label="Are your tires on rims?">' + opts.map(function (o) {
          var on2 = st.service === o[0];
          return '<button type="button" class="ptb-tile' + (on2 ? " is-on" : "") + '" aria-pressed="' + on2 + '" data-ptb="svc" data-v="' + o[0] + '"><b>' + o[1] + "</b><span>" + o[2] + (o[3] ? " " + esc(o[3].replace(/^from/, "From")) + "." : "") + "</span></button>";
        }).join("") + "</div>";
        h += this.includedAcc();
      } else if (st.path === "svc") {
        var L = locs();
        h += '<div class="ptb-chips" role="group" aria-label="Pick the service">' + CAT.order.filter(function (s) { return s !== "installation_on" && s !== "installation_off" && !CAT.services[s].staffOnly; }).map(function (s) {
          var row = CAT.services[s], on3 = st.service === s;
          var only = row.locations.length ? onlyAt(row.locations, L.all) : "";
          return '<button type="button" class="ptb-chip' + (on3 ? " is-on" : "") + '" aria-pressed="' + on3 + '" data-ptb="svc" data-v="' + s + '">' + esc(M.serviceName(s, CAT)) + ' <span class="ptb-chip__p">' + esc(fromPrice(row)) + "</span>" + (only ? ' <span class="rd-badge">' + esc(only) + "</span>" : "") + "</button>";
        }).join("") + "</div>";
        h += this.includedAcc();
      }
      void self;
      return h;
    };
    B.includedAcc = function () {
      var st = this.st, row = st.service ? CAT.services[st.service] : null;
      if (!row || !row.description) return "";
      var id = this.id + "-inc";
      return '<div class="ptb-acc"><button type="button" class="ptb-acc__h" data-ptb="acc" data-v="accInfo" aria-expanded="' + !!st.accInfo + '" aria-controls="' + id + '"><span>What’s included</span>' + ico(st.accInfo ? "up" : "chevron", 18) + '</button><div class="ptb-acc__b" id="' + id + '"' + (st.accInfo ? "" : " hidden") + "><p>" + esc(row.description) + "</p></div></div>";
    };
    function fromPrice(row) {
      var pr = row.prices || {}, u = row.unit || "unit";
      if (row.mode === "per_unit_flat") return num(pr.amount) ? "$" + pr.amount + "/" + u : "";
      var vals = [];
      if (pr.byVehicle) Object.keys(pr.byVehicle).forEach(function (k) {
        if (row.mode === "per_unit_by_vehicle" && pr.flatOverride && pr.flatOverride[k] != null) return;
        if (num(pr.byVehicle[k])) vals.push(pr.byVehicle[k]);
      });
      if (!vals.length) return "";
      return "from $" + Math.min.apply(null, vals) + (row.mode === "flat_by_vehicle" ? "" : "/" + u);
    }
    function onlyAt(slugs, all) {
      var c = Core();
      if (c && c.onlyAtLabel) return c.onlyAtLabel(slugs, all);
      return slugs.map(function (s) { return s.toUpperCase(); }).join(" or ") + " only";
    }
    B.savedBanner = function () {
      if (this.mode !== "page" || this.st.savedDismissed) return "";
      var s = savedSearchVehicle();
      if (!s) return "";
      var label = [s.year, s.make, s.model, s.trim].filter(Boolean).join(" ") || "car";
      var m = /(\d{3})\s*\/?\s*(\d{2})\s*Z?R?\s*(\d{2})/i.exec(String(s.tireSize || ""));
      var url = "/search?q=" + encodeURIComponent(s.tireSize) + "&type=product";
      if (m) {
        url = "/collections/tires?filter.p.m.custom.tire_width=" + m[1] + "&filter.p.m.custom.tire_profile=" + m[2] + "&filter.p.m.custom.rim_diameter=" + m[3];
        if (win.PTRim && win.PTRim.route) { try { url = win.PTRim.route(url); } catch (e) {} }
      }
      return '<div class="ptb-saved"><p class="ptb-saved__t">Welcome back. Still shopping for your ' + esc(label) + '?</p><div class="ptb-saved__a"><a class="rd-btn rd-btn--line" href="' + esc(url) + '">See tires in ' + esc(s.tireSize) + " →</a>" +
        '<button type="button" class="rd-btn rd-btn--text" data-ptb="saved-own">Installing your own tires? →</button><button type="button" class="rd-btn rd-btn--text" data-ptb="saved-x">Not this car</button></div></div>';
    };

    // Step 2 - Details
    B.vDetails = function () {
      var st = this.st, p = st.product, h = "";
      var isProd = st.kind === "product_tire" || st.kind === "product_wheel";
      var unit = st.kind === "product_wheel" ? "wheel" : "tire";
      h += '<div class="ptb-head"><div><h2 class="rd-sheet__h">Your job</h2><p class="rd-sheet__sub">' + (st.set ? "Installation for the staggered set you picked." : isProd ? "Installation for the " + unit + "s you picked." : esc(M.serviceName(st.service, CAT))) + "</p></div>" +
        (!isProd && st.canChangeService ? '<button type="button" class="rd-btn rd-btn--text" data-ptb="change-svc">Change service</button>' : "") + "</div>";
      if (st.set && st.lines) {
        // Staggered set: one item per axle, fixed 2 + 2 (no stepper).
        var ins = M.setInstall(st, CAT), self0 = this;
        st.lines.forEach(function (l, i) {
          var lp = l.product, u = ins[i];
          h += '<div class="ptb-item">' + (lp.image ? '<img class="ptb-item__img" src="' + esc(lp.image) + '" alt="" width="64" height="64" loading="lazy">' : '<span class="ptb-item__img ptb-item__img--glyph" aria-hidden="true">' + ico("tire", 30) + "</span>") +
            '<div class="ptb-item__t"><div class="ptb-item__brand">' + (l.position === "rear" ? "Rear" : "Front") + (lp.vendor ? " · " + esc(lp.vendor) : "") + '</div><div class="ptb-item__name">' + esc(lp.tireName) + "</div>" +
            '<div class="ptb-item__p">' + l.qty + " × " + esc(M.money(lp.tirePriceCents)) + "/tire · install " +
            (u.promo && u.promo.style === "strike" && u.promo.wasCents > u.cents ? '<s class="ptb-was">' + esc(M.moneyShort(u.promo.wasCents)) + "</s> " : "") + (u.cents == null ? "priced by phone" : esc(M.moneyShort(u.cents)) + "/tire") +
            (M.promoShown(u.promo) ? ' <span class="ptb-promo">' + esc(u.promo.label) + "</span>" : "") + (u.truck ? ' <span class="ptb-promo">Truck rate</span>' : "") +
            (lp.tireSize ? ' <span class="ptb-badge">' + esc(lp.tireSize) + "</span>" : "") + "</div></div>" +
            (i === 0 && self0.mode === "sheet" ? '<button type="button" class="rd-btn rd-btn--text" data-ptb="close">Change</button>' : "") + "</div>";
        });
        var lead = M.setLead(st.lines);
        h += '<div class="ptb-row"><span><b>Tires:</b> 2 front + 2 rear</span>' + (M.LEAD_TEXT[lead] ? '<span class="rd-lead rd-lead--' + (lead === "today" ? "today" : lead === "1-2" ? "days" : "order") + '">' + esc(M.LEAD_TEXT[lead]) + "</span>" : "") + "</div>";
        h += '<p class="ptb-muted">Staggered set: front and rear sizes differ, so these tires can’t be rotated front to back.</p>';
        if (ins[0] && ins[0].truck) h += '<p class="ptb-muted">Installed at our truck rate: a tire in this set is 265 mm or wider.</p>';
        if (SET_CART && (st.from === "card" || st.from === "set_card") && st.lines.every(function (l) { return !!l.product.variantId; })) h += '<button type="button" class="rd-btn rd-btn--text ptb-cartonly" data-ptb="cart-only">Just the tires? Add the set to cart</button>';
      } else if (isProd) {
        h += '<div class="ptb-item">' + (p.image ? '<img class="ptb-item__img" src="' + esc(p.image) + '" alt="" width="64" height="64" loading="lazy">' : '<span class="ptb-item__img ptb-item__img--glyph" aria-hidden="true">' + ico(st.kind === "product_wheel" ? "wheel" : "tire", 30) + "</span>") +
          '<div class="ptb-item__t">' + (p.vendor ? '<div class="ptb-item__brand">' + esc(p.vendor) + "</div>" : "") + '<div class="ptb-item__name">' + esc(p.tireName) + "</div>" +
          '<div class="ptb-item__p">' + (p.tirePriceCents > 0 ? esc(M.money(p.tirePriceCents)) + "/" + unit + " · " : "") + "install " + (function () { var ins = M.productInstall(st, CAT); return (ins.promo && ins.promo.style === "strike" && ins.promo.wasCents > ins.cents ? '<s class="ptb-was">' + esc(M.moneyShort(ins.promo.wasCents)) + "</s> " : "") + esc(M.moneyShort(ins.cents)) + "/" + unit + (M.promoShown(ins.promo) ? ' <span class="ptb-promo">' + esc(ins.promo.label) + "</span>" : ""); })() + (p.tireSize ? ' <span class="ptb-badge">' + esc(p.tireSize) + "</span>" : "") + "</div></div>" +
          (this.mode === "sheet" ? '<button type="button" class="rd-btn rd-btn--text" data-ptb="close">Change</button>' : "") + "</div>";
        if (st.from === "card" && p.variantId) h += '<button type="button" class="rd-btn rd-btn--text ptb-cartonly" data-ptb="cart-only">Just the ' + unit + "s? Add to cart</button>";
      }
      h += this.vVehicle(isProd);
      var rule = M.qtyRule(st.kind, st.service, p ? p.maxQty : 0);
      if (rule.show && !st.set) {
        h += '<div class="ptb-row"><span class="rd-sheet__lab ptb-row__lab" id="' + this.id + '-qty">' + rule.label + "</span>" +
          '<div class="rd-stepper" role="group" aria-labelledby="' + this.id + '-qty">' +
          '<button type="button" class="rd-stepper__btn" data-ptb="qty" data-v="-1" aria-label="Fewer"' + (st.qty <= 1 ? " disabled" : "") + ">" + ico("minus") + "</button>" +
          '<output class="rd-stepper__val" aria-live="polite">' + st.qty + "</output>" +
          '<button type="button" class="rd-stepper__btn" data-ptb="qty" data-v="1" aria-label="More"' + (st.qty >= rule.max ? " disabled" : "") + ">" + ico("plus") + "</button></div>" +
          (rule.capped && st.qty >= rule.max ? '<span class="ptb-muted">Need more? Call ' + esc(shortName(this.loc())) + " at " + esc(this.loc().phone || SW.phone) + "</span>" : "") + "</div>";
      }
      if (st.kind === "own_tires" || st.kind === "swap") {
        h += '<label class="rd-field ptb-size">Tire size <span class="ptb-opt-t">(optional)</span><input data-ptb-in="tireSize" value="' + esc(st.tireSize) + '" placeholder="e.g. 265/70R17" autocomplete="off" maxlength="40"></label>';
      }
      if (M.asksOldTires(st)) h += this.vOldTires();
      h += this.vAddons();
      return h;
    };
    // The vehicle: Year / Make / Model / Trim first (live /pages/booking,
    // snippets/pt-booking-ymm.liquid), with "Can't find your vehicle? Pick a
    // type instead" for the type chips. No vehicle data -> the chips alone.
    // Product flows show one collapsed line; "Change" opens the same thing.
    B.ymmOn = function () { return !!DATA.vehicleManifest && !YMM.failed; };
    B.vVehicle = function (collapsed) {
      var st = this.st, id = this.id;
      var picked = st.ymmType && st.ymm && st.ymm.tr ? [st.ymm.y, st.ymm.mk, st.ymm.md, st.ymm.tr].filter(Boolean).join(" ") : "";
      if (collapsed && !st.vehOpen) {
        return '<div class="ptb-row"><span><b>Vehicle:</b> ' + esc(picked ? picked + " · " + this.ymmLabel() : M.vehicleName(st.vehicle)) + '</span><button type="button" class="rd-btn rd-btn--text" data-ptb="veh-open" aria-expanded="false">Change</button></div>';
      }
      var list = M.VEHICLES.filter(function (v) { return !(v.id === "trailer" && M.NO_TRAILER.indexOf(st.service) > -1 && !(st.kind === "product_tire" || st.kind === "product_wheel")); });
      var ymm = this.ymmOn(), typeMode = !ymm || st.vehMode === "type";
      var chips = '<div class="ptb-vehtype" id="' + id + '-vehchips"' + (typeMode ? "" : " hidden") + '><span class="rd-sheet__lab" id="' + id + '-veh">' + (ymm ? "Vehicle type" : "Vehicle") + '</span><div class="ptb-chips ptb-chips--veh" role="radiogroup" aria-labelledby="' + id + '-veh">' + list.map(function (v) {
        var on = st.vehicle === v.id;
        return '<button type="button" class="ptb-chip' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '" data-ptb="veh" data-v="' + v.id + '">' + esc(v.name) + "</button>";
      }).join("") + "</div>" +
        (ymm ? '<button type="button" class="rd-btn rd-btn--text ptb-ymm__alt" data-ptb="veh-mode" data-v="ymm">Use year / make / model instead</button>' : "") + "</div>";
      return '<div class="ptb-veh" id="' + id + '-vehbox">' + (typeMode ? "" : this.vYmm()) + chips + "</div>";
    };
    B.vOldTires = function () {
      var st = this.st, buyer = st.product ? M.tireBuyer(st.product) : false;
      var disp = CAT.addons[DISPOSAL_SLUG], dispC = disp ? M.addonUnitCents(disp, 0) : 500;
      var opts = (st.kind === "product_tire" || st.kind === "product_wheel") && buyer
        ? [["dispose", "Scrap them, we recycle them", "Included", "Thrown out for recycling. Not stored, can’t be returned."], ["keep", "I’ll take them home", "", "You take them with you."]]
        : [["keep", "Keep them, I’ll take them home", "Free", "You take them with you."], ["dispose", "Scrap them, we recycle them", "+" + M.moneyShort(dispC) + "/tire", "Thrown out for recycling. Not stored, can’t be returned."]];
      var err = st.tried && !st.oldTires;
      return '<div data-ptb-old class="' + (err ? "ptb-err-box" : "") + '"><div class="ptb-oldlab"><span class="rd-sheet__lab" id="' + this.id + '-old">What should we do with your old tires?</span>' +
        // Owner 2026-11-21: customers read "leave them with us" as storage. The i explains it is scrapping.
        '<button type="button" class="ptb-info" data-ptb="acc" data-v="oldInfo" aria-expanded="' + !!st.oldInfo + '" aria-controls="' + this.id + '-oldinfo" aria-label="What happens to tires we recycle?">i</button></div>' +
        (st.oldInfo ? '<p class="ptb-infobox" id="' + this.id + '-oldinfo">Tires you leave with us are <strong>scrapped</strong>, not stored. They go out for recycling and can’t be returned later. We don’t hold them for next season. Want to keep them? Choose “I’ll take them home”.</p>' : "") +
        '<div class="ptb-opts ptb-opts--2" role="radiogroup" aria-labelledby="' + this.id + '-old" aria-required="true">' + opts.map(function (o) {
          var on = st.oldTires === o[0];
          return '<button type="button" class="ptb-opt' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '" data-ptb="old" data-v="' + o[0] + '"><span class="ptb-dot" aria-hidden="true"></span><span class="ptb-opt__t">' + o[1] + '<span class="ptb-opt__d">' + o[3] + '</span></span><span class="ptb-opt__p">' + o[2] + "</span></button>";
        }).join("") + "</div>" + (err ? '<p class="rd-field__error" role="alert">Please choose what we should do with your old tires.</p>' : "") + "</div>";
    };
    B.addonRows = function () {
      var st = this.st, rows = [], L = locs(), slugs = L.bookable.map(function (l) { return l.slug; });
      var isProd = st.kind === "product_tire" || st.kind === "product_wheel";
      var tpms = CAT.addons[TPMS_SLUG];
      if (tpms && (isProd || st.kind === "own_tires" || st.kind === "swap")) rows.push({ key: "tpms", ic: "gauge", tone: "orange", t: "TPMS sensors", d: "New sensors, programmed to your car", p: "+" + M.moneyShort(M.addonUnitCents(tpms, 0)) + "/sensor" });
      if (st.kind === "own_tires") {
        var off = CAT.services.installation_off, lp = off && off.prices ? off.prices.lowProfileFloor : 40;
        rows.push({ key: "lowProfile", ic: "tire", tone: "ink", t: "Low-profile or run-flat tires", d: "Raises installation to $" + (lp || 40) + "/tire", p: "install $" + (lp || 40) + "/tire min" });
      }
      if (isProd) {
        st.extras.forEach(function (a) {
          var u = M.addonUnitCents(a, st.product.tirePriceCents, st.terms[a.slug]);
          var ne = a.locations && a.locations.length ? onlyAt(a.locations, L.all) : "";
          var pp = a.slug === PROTECTION_SLUG;
          var pTxt = "+" + M.moneyShort(u) + "/" + (a.unit || "tire"), allTxt = pp && st.qty > 1 ? M.moneyShort(u * st.qty) + " for all " + st.qty + " tires" : "";
          if (st.set && st.lines && num(a.percent)) {
            // Set: each tire's own rate (same sum as the price lines).
            var us = st.lines.map(function (l) { return M.setAddonUnitCents(a, l.product.tirePriceCents, st.terms[a.slug]); });
            var lo = Math.min.apply(null, us), hi = Math.max.apply(null, us), tot = 0;
            st.lines.forEach(function (l, i) { tot += us[i] * l.qty; });
            pTxt = "+" + (lo === hi ? M.moneyShort(lo) : M.moneyShort(lo) + "–" + M.moneyShort(hi)) + "/" + (a.unit || "tire");
            allTxt = pp ? M.moneyShort(tot) + " for all " + st.qty + " tires" : "";
          }
          rows.push({ key: a.slug, ic: pp ? "shield" : a.slug === RF_SLUG ? "balance" : a.slug === TPMS_SLUG ? "gauge" : "plus", tone: pp ? "green" : a.slug === RF_SLUG ? "red" : a.slug === TPMS_SLUG ? "orange" : "ink", all: allTxt, t: a.slug === PROTECTION_SLUG ? M.addonLabel(a, st.set && st.lines ? M.setTerm(a, st.terms[a.slug]) : st.terms[a.slug]) : a.name, d: a.slug === RF_SLUG ? "Finds vibration a normal balance misses" : a.slug === PROTECTION_SLUG ? "Road hazard cover" : (a.description || ""), p: pTxt, ne: ne, link: a.slug === PROTECTION_SLUG ? "/pages/road-hazard-protection" : "", addon: a });
        });
      } else if (M.roadForceOffered(CAT, st.service, slugs)) {
        var rf = CAT.addons[RF_SLUG];
        rows.push({ key: RF_SLUG, ic: "balance", tone: "red", t: "Road force balancing upgrade", d: "Finds vibration a normal balance misses", p: "+" + M.moneyShort(M.addonUnitCents(rf, 0)) + "/" + (rf.unit || "tire"), ne: rf.locations.length ? onlyAt(rf.locations, L.all) : "" });
      }
      return rows;
    };
    B.vAddons = function () {
      var st = this.st, rows = this.addonRows(), self = this;
      if (!rows.length) return "";
      var id = this.id + "-add";
      // Always open: every add-on is visible with its own coloured icon.
      var h = '<div class="ptb-adds" role="group" aria-labelledby="' + id + '-h"><span class="rd-sheet__lab" id="' + id + '-h">Add-ons <span class="ptb-opt-t">(optional)</span></span>' +
        '<div class="ptb-opts" id="' + id + '">' + rows.map(function (r) {
          var checked = !!st.add[r.key];
          var term = "";
          if (r.addon && r.addon.terms && r.addon.terms.length > 1) {
            // A set with no term picked (no defaultMonths that names one) is
            // priced at the row's standard rate: the select says so.
            var noTerm = !!(st.set && st.lines) && M.setTerm(r.addon, st.terms[r.key]) == null;
            term = '<select class="rd-select ptb-term" data-ptb-term="' + r.key + '" aria-label="Coverage term">' + (noTerm ? '<option value="" selected>Standard term</option>' : "") + r.addon.terms.map(function (t) { return '<option value="' + t.months + '"' + (t.months === st.terms[r.key] ? " selected" : "") + ">" + t.months + " months</option>"; }).join("") + "</select>";
          }
          return '<div class="ptb-addrow"><button type="button" class="ptb-opt ptb-add' + (checked ? " is-on" : "") + '" role="checkbox" aria-checked="' + checked + '" data-ptb="add" data-v="' + r.key + '">' +
            '<span class="ptb-add__ic ptb-add__ic--' + (r.tone || "ink") + '" aria-hidden="true">' + ico(r.ic || "plus", 22) + "</span>" +
            '<span class="ptb-opt__t"><span class="ptb-add__t">' + esc(r.t) + "</span>" + (r.d ? '<span class="ptb-opt__d">' + esc(r.d) + "</span>" : "") +
            '<span class="ptb-add__meta"><b class="ptb-add__p">' + esc(r.p) + "</b>" + (r.all ? '<span class="ptb-add__all">' + esc(r.all) + "</span>" : "") + (r.ne ? '<span class="rd-badge">' + esc(r.ne) + "</span>" : "") + "</span></span>" +
            '<span class="ptb-box" aria-hidden="true">' + ico("check", 14) + "</span></button>" +
            (r.link ? '<a class="ptb-link ptb-addrow__link" href="' + r.link + '" target="_blank" rel="noopener">What’s covered?</a>' : "") + term + "</div>";
        }).join("") + "</div></div>";
      void self;
      return h;
    };

    // Step 3 - Time
    B.vTime = function () {
      var st = this.st, h = '<div class="ptb-head"><h2 class="rd-sheet__h">Pick a time</h2></div>', L = locs(), self = this;
      if (st.service === "rotation" && st.kind === "service") {
        h += this.vVehicle(false);
        var rows = this.addonRows();
        if (rows.length) h += this.vAddons();
      }
      if (st.kind === "package") {
        var q = st.quote;
        if (st.quoteState === "loading") return h + '<p class="ptb-muted" role="status">Checking today’s price…</p>';
        if (st.quoteState === "error") return h + '<div class="rd-err" role="alert">' + esc(st.quoteError) + " Call " + esc(st.pkg.shopName()) + ' at <a href="tel:' + esc(st.pkg.shopPhoneHref()) + '">' + esc(st.pkg.shopPhone()) + "</a> and we’ll sort it out.</div>";
        if (q) h += '<div class="ptb-lock" role="status">Price locked at ' + esc(st.lockedAt || "") + " · " + esc(M.money(q.totalCents)) + " incl. GST</div>";
        h += '<div class="ptb-row"><span><b>Shop:</b> ' + esc(st.pkg.shopName()) + '</span><span class="ptb-muted">Change it in your package.</span></div>';
      } else {
        var allowed = this.allowed();
        var r = this.restrictions();
        if (!allowed.length) {
          var only = r.named.length ? (Core() && Core().bySlug ? Core().bySlug(L.all, r.named[0].shops[0]) : null) : null;
          return h + '<div class="rd-note">' + esc((r.named[0] && r.named[0].name) || "This service") + " is only available at our " + esc(onlyAt(r.named[0] ? r.named[0].shops : [], L.all).replace(/ only$/, "")) + " shop." + (only && only.phone ? ' Call <a href="' + telHref(only) + '">' + esc(only.phone) + "</a> to book it." : "") + "</div>";
        }
        if (L.bookable.length > 1) {
          h += '<div><span class="rd-sheet__lab" id="' + this.id + '-shop">Which shop?</span><div class="ptb-opts ptb-opts--2" role="radiogroup" aria-labelledby="' + this.id + '-shop">' + L.bookable.map(function (l) {
            var ok = allowed.some(function (a) { return a.slug === l.slug; }), on = st.location === l.slug;
            return '<button type="button" class="ptb-opt' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '"' + (ok ? "" : ' aria-disabled="true"') + ' data-ptb="shop" data-v="' + l.slug + '"><span class="ptb-dot" aria-hidden="true"></span><span class="ptb-opt__t"><span>' + esc(shortName(l)) + '</span><span class="ptb-opt__d">' + esc(street(l)) + "</span></span></button>";
          }).join("") + "</div>";
          if (st.locPinnedBy) {
            var pinLoc = this.loc();
            var pinName = (st.locPinnedBy === "road_force_balancing" || st.locPinnedBy === RF_SLUG) ? "Road force balancing" : (r.named[0] ? r.named[0].name : "This service");
            h += '<p class="rd-note ptb-mt">' + esc(pinName) + " is done at our " + esc(shortName(pinLoc)) + " shop, so we’ve picked it.</p>";
          } else {
            var cur = this.loc(), other = L.bookable.filter(function (l) { return l.slug !== st.location; })[0];
            if (cur && cur.is_primary && other && !st.locExplicit) h += '<p class="ptb-muted ptb-mt">Also open: <button type="button" class="rd-btn rd-btn--text ptb-inline" data-ptb="shop" data-v="' + other.slug + '">' + esc(shortName(other)) + "</button>, " + esc(street(other)) + ".</p>";
          }
          h += "</div>";
        }
      }
      if (M.dropOffOffered(st)) {
        h += '<div><span class="rd-sheet__lab" id="' + this.id + '-visit">How do you want to visit?</span><div class="ptb-opts ptb-opts--2" role="radiogroup" aria-labelledby="' + this.id + '-visit">' + [["wait", "Wait while we work", "Stay with your car while we work."], ["drop_off", "Drop off for the day", "Leave your car and pick it up that day. We’ll text you when it’s ready."]].map(function (v) {
          var on = (st.visit || "wait") === v[0];
          return '<button type="button" class="ptb-opt' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '" data-ptb="visit" data-v="' + v[0] + '"><span class="ptb-dot" aria-hidden="true"></span><span class="ptb-opt__t"><span>' + v[1] + '</span><span class="ptb-opt__d">' + v[2] + "</span></span></button>";
        }).join("") + "</div></div>";
      }
      h += '<div><div class="ptb-row ptb-row--base"><span class="rd-sheet__lab ptb-row__lab" id="' + this.id + '-day">Day</span><span class="ptb-muted" data-ptb-earliest>' + esc(this.earliestNote()) + "</span></div>" + this.vDays() + '<p class="ptb-muted ptb-dayreason" data-ptb-dayreason aria-live="polite"></p></div>';
      if (M.isDropOff(st)) {
        h += '<div class="ptb-panelbox" data-ptb-drop><p>Bring your car any time we’re open on <b>' + esc(st.date ? M.longDay(M.parseISO(st.date)) : "the day you pick") + "</b>. We’ll text you when it’s ready.</p><p class=\"ptb-muted\" data-ptb-hours>" + esc(this.hoursLine()) + '</p><p class="ptb-dropmsg" data-ptb-dropmsg role="status"></p></div>';
      } else {
        h += '<div><div class="ptb-row ptb-row--base"><span class="rd-sheet__lab ptb-row__lab" id="' + this.id + '-tl">Time</span><span class="ptb-muted" data-ptb-hours>' + esc(this.hoursLine()) + '</span></div><div class="ptb-slots" role="group" aria-labelledby="' + this.id + '-tl" data-ptb-grid></div></div>';
      }
      void self;
      return h;
    };
    B.vDays = function () {
      var st = this.st, today = new Date(); today.setHours(0, 0, 0, 0);
      var start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + st.wk * 7);
      var h = '<div class="ptb-days"><button type="button" class="ptb-wk" data-ptb="wk" data-v="-1" aria-label="Earlier week"' + (st.wk <= 0 ? " disabled" : "") + ">" + ico("left", 18) + '</button><div class="ptb-days__strip" role="group" aria-labelledby="' + this.id + '-day">';
      for (var i = 0; i < 7; i++) {
        var d = new Date(start); d.setDate(start.getDate() + i);
        var iso = M.localISO(d), why = this.dayWhy(d, today);
        var on = st.date === iso && !why;
        h += '<button type="button" class="ptb-day' + (why ? " is-off" : "") + (on ? " is-on" : "") + (d.getTime() === today.getTime() ? " is-today" : "") + '" data-ptb="day" data-v="' + iso + '" aria-pressed="' + on + '"' + (why ? ' aria-disabled="true" data-why="' + esc(why) + '"' : "") + ' aria-label="' + esc(M.longDay(d)) + (why ? ", " + esc(why) : "") + '"><span>' + d.toLocaleDateString("en-US", { weekday: "short" }) + "</span><b>" + d.getDate() + "</b></button>";
      }
      return h + '</div><button type="button" class="ptb-wk" data-ptb="wk" data-v="1" aria-label="Later week">' + ico("right", 18) + "</button></div>";
    };
    B.unitWord = function () {
      var st = this.st;
      return st.kind === "product_wheel" ? "wheels" : st.kind === "package" ? "package" : "tires";
    };
    // Why a day cannot be picked ('' = it can).
    B.dayWhy = function (d, today) {
      var st = this.st, iso = M.localISO(d);
      if (d < today) return "This day has passed";
      var floor = this.floor();
      if (floor && iso < floor.dateISO) {
        var fd = M.parseISO(floor.dateISO);
        return st.kind === "package" ? "Earliest for your package is " + M.shortDay(fd) : (st.kind === "product_tire" || st.kind === "product_wheel") ? "Earliest for these " + this.unitWord() + " is " + M.shortDay(fd) : "Not available";
      }
      if (M.isDropOff(st) && st.dropFull[st.location + "|" + iso]) return "Drop-offs are full this day";
      if (d.getTime() === today.getTime()) {
        var now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), H = M.hoursFor(HOURS, st.location, d);
        if (M.isDropOff(st)) { if (nm >= H.close) return "We’re closed for the rest of today"; }
        else if (floor && floor.dateISO === iso) { if (nm >= H.last || floor.mins > H.last) return "No times left today"; }
        else if (nm + 120 > H.last) return "Same-day requests need 2 hours’ notice";
      }
      return "";
    };
    // The floor this booking cannot start before: the server's earliest,
    // else the package's ready-by, else the product's client tier rule.
    B.floor = function () {
      var st = this.st;
      if (st.kind === "package") {
        var f = st.pkg && st.pkg.floor ? st.pkg.floor() : null;
        if (!f || !f.dateISO) return null;
        return { dateISO: f.dateISO, mins: f.time ? M.slotToMins(f.time) : 0, label: "", dropDateOnly: true };
      }
      if (st.serverEarliest && st.serverEarliest.date) return { dateISO: st.serverEarliest.date, mins: st.serverEarliest.time ? M.slotToMins(st.serverEarliest.time) : 0 };
      if (st.set && st.lines) return M.localFloor(M.setTier(st.lines), new Date());
      if (st.kind === "product_tire" || st.kind === "product_wheel") return M.localFloor(st.product.supplierTier, new Date());
      return null;
    };
    B.earliestNote = function () {
      var st = this.st, f = this.floor();
      if ((st.kind === "product_tire" || st.kind === "product_wheel" || st.kind === "package") && f) {
        var d = M.parseISO(f.dateISO);
        if (M.isDropOff(st)) return "Earliest drop-off for these " + this.unitWord() + ": " + M.shortDay(d) + ".";
        return "Earliest time for " + (st.kind === "package" ? "your package" : "these " + this.unitWord()) + ": " + M.shortDay(d) + (f.mins ? ", " + M.minsToSlot(f.mins) : "") + ".";
      }
      if (M.isDropOff(st)) return "";
      return "Same-day requests need 2 hours’ notice.";
    };
    B.hoursLine = function () {
      var st = this.st;
      if (!st.date) return "";
      var d = M.parseISO(st.date), H = M.hoursFor(HOURS, st.location, d);
      var span = H.gap ? M.clock(H.open) + " – " + M.clock(H.gap[0]) + ", " + M.clock(H.gap[1]) + " – " + M.clock(H.close) : M.clock(H.open) + " – " + M.clock(H.close);
      var name = st.kind === "package" && st.pkg ? st.pkg.shopName() : shortName(this.loc());
      return name + " · " + d.toLocaleDateString("en-US", { weekday: "short" }) + " " + span;
    };
    // Entering step 3: open on the first day that can actually be booked.
    B.enterTime = function () {
      var st = this.st;
      if (st.date) return;
      var today = new Date(); today.setHours(0, 0, 0, 0);
      for (var i = 0; i < 28; i++) {
        var d = new Date(today); d.setDate(today.getDate() + i);
        if (!this.dayWhy(d, today)) { st.date = M.localISO(d); break; }
      }
      if (!st.date) st.date = M.localISO(today);
      st.wk = this.weekOffset(M.parseISO(st.date));
    };
    B.weekOffset = function (d) {
      var mon = function (x) { var m = new Date(x); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
      var t = new Date(); return Math.round((mon(d).getTime() - mon(t).getTime()) / 604800000);
    };
    B.availExtra = function () {
      var st = this.st;
      if (st.set && st.lines) {
        // Both tires at 2 each: the server returns the LATER earliest day.
        var F = st.lines[0].product, R = st.lines[1].product;
        var se = { product_handle: F.productHandle, variant_id: F.variantId, qty: st.lines[0].qty, rear_product_handle: R.productHandle, rear_variant_id: R.variantId, rear_qty: st.lines[1].qty, book_type: "tire_install" };
        if (M.isDropOff(st)) se.drop_off = 1;
        return se;
      }
      if (st.kind === "product_tire" || st.kind === "product_wheel") {
        var e = { product_handle: st.product.productHandle, variant_id: st.product.variantId, qty: st.qty, book_type: "tire_install" };
        if (M.isDropOff(st)) e.drop_off = 1;
        return e;
      }
      if (st.kind === "package") return { drop_off: 1 };
      // Live 2026-11-18 (#469): /api/availability needs the service so a
      // service staff closed online (own-tire install / swap) reads as taken.
      if (st.service) return { service: st.service };
      return null;
    };
    B.fetchAvail = function (iso, slug) {
      var c = Core();
      var url = (this.st.pkg && this.st.pkg.availApi) || M.AVAIL_API;
      if (c && c.fetchAvailability) return c.fetchAvailability(url, iso, slug, this.availExtra());
      return Promise.resolve({ booked: [], allDayBlocked: false, unavailable: true });
    };
    // Paint the time grid (or the drop-off check) for the picked day + shop.
    B.paintGrid = function () {
      var self = this, st = this.st, seq = ++this.seq;
      var gridEl = this.bodyEl.querySelector("[data-ptb-grid]");
      var dropEl = this.bodyEl.querySelector("[data-ptb-dropmsg]");
      if (st.kind === "package" && !st.quote) return;
      if (!st.date) return;
      if (!this.allowed().length && st.kind !== "package") return;
      var iso = st.date, slug = st.location, d = M.parseISO(iso);
      var drop = M.isDropOff(st);
      st.dropOk = false;
      if (gridEl) gridEl.innerHTML = '<p class="ptb-muted ptb-span" role="status">Checking availability…</p>';
      if (dropEl) dropEl.textContent = "Checking that day…";
      this.fetchAvail(iso, slug).then(function (res) {
        if (seq !== self.seq || st !== self.st) return;
        var loc = self.loc(slug), phone = st.kind === "package" && st.pkg ? st.pkg.shopPhone() : (loc.phone || SW.phone), shop = st.kind === "package" && st.pkg ? st.pkg.shopName() : shortName(loc);
        if (res.unavailable) { self.gridMsg("Online requests are not working right now. Please call " + shop + " at " + phone + ", or try again in a few minutes.", true); return; }
        if (res.earliest && st.kind !== "package") {
          var had = st.serverEarliest && st.serverEarliest.date === res.earliest.date && st.serverEarliest.time === res.earliest.time;
          st.serverEarliest = res.earliest;
          if (!st.userPickedDate && iso < res.earliest.date) { st.date = res.earliest.date; st.wk = self.weekOffset(M.parseISO(st.date)); st.time = null; self.renderBody(); return; }
          if (!had) self.repaintDays();
        }
        if (res.onlineFull || res.noOnlinePromise) { self.gridMsg("Call " + shop + " at " + phone + " to book this one.", false, true); return; }
        if (res.allDayBlocked) { self.gridMsg(neutral(res.blockedReason) || "Not available this day. Please pick another.", true); return; }
        if (drop) {
          var floor = self.floor();
          if (floor && iso < floor.dateISO) { self.dropSay("The earliest day we can have your " + self.unitWord() + " is " + M.shortDay(M.parseISO(floor.dateISO)) + ". Pick that day or later."); return; }
          var now = new Date();
          if (iso === M.localISO(now) && now.getHours() * 60 + now.getMinutes() >= M.hoursFor(HOURS, slug, d).close) { self.dropSay("We’re closed for the rest of today. Pick another day."); return; }
          var key = slug + "|" + iso;
          if (res.dropOff && res.dropOff.full) {
            var known = !!st.dropFull[key]; st.dropFull[key] = true;
            if (!known) self.repaintDays();
            self.dropSay("Drop-offs are full on " + M.shortDay(d) + ". Pick another day, or choose a time and wait.");
            return;
          }
          if (st.dropFull[key]) { delete st.dropFull[key]; self.repaintDays(); }
          st.dropOk = true; st.dropMsg = "";
          self.dropSay("");
          self.renderFoot();
          return;
        }
        var here = self.slots(iso, slug, res);
        var openHere = here.filter(function (s) { return s.ok; });
        // The other shop's open times, merged in (tapping one switches shop).
        self.altTimes(iso, slug, d).then(function (alt) {
          if (seq !== self.seq || st !== self.st) return;
          var altSet = alt ? alt.times : [];
          st.alt = alt;
          if (!openHere.length && !altSet.length) {
            var H = M.hoursFor(HOURS, slug, d), now2 = new Date(), nm = now2.getHours() * 60 + now2.getMinutes();
            var isToday = iso === M.localISO(now2);
            var floor2 = self.floor();
            if (floor2 && iso < floor2.dateISO) { self.gridMsg("Earliest for these " + self.unitWord() + " is " + M.shortDay(M.parseISO(floor2.dateISO)) + ". Please pick that day or later.", false); return; }
            if (isToday && nm + 120 > H.last) { self.gridMsg("Same-day requests need 2 hours’ notice, and the last one today is " + M.minsToSlot(H.last) + ". Pick another day, or call " + shop + " at " + phone + " to ask about a walk-in.", false); return; }
            if (res.dayFull) { self.renderCallbackInGrid(); return; }
            self.gridMsg("Fully booked this day. Please pick another day.", false);
            return;
          }
          var all = here.slice();
          altSet.forEach(function (t) { if (!all.some(function (s) { return s.t === t; })) all.push({ t: t, mins: M.slotToMins(t), ok: false, why: "" }); });
          all.sort(function (a, b) { return a.mins - b.mins; });
          if (st.time && !openHere.some(function (s) { return s.t === st.time; })) st.time = null;
          var altName = alt ? shortName(alt.shop) : "";
          gridEl.innerHTML = all.map(function (s) {
            if (s.ok) return '<button type="button" class="ptb-slot' + (st.time === s.t ? " is-on" : "") + '" data-ptb="time" data-v="' + s.t + '" aria-pressed="' + (st.time === s.t) + '">' + s.t.replace(/ (AM|PM)$/, "") + '<span class="rd-sr"> ' + s.t.slice(-2) + "</span></button>";
            if (altSet.indexOf(s.t) > -1) return '<button type="button" class="ptb-slot ptb-slot--alt" data-ptb="time" data-v="' + s.t + '" data-alt="' + alt.shop.slug + '" aria-label="' + esc(s.t + " at " + altName) + '">' + s.t.replace(/ (AM|PM)$/, "") + '<span class="ptb-slot__at">' + esc(altName) + "</span></button>";
            var why = s.why === "early" ? "Earliest for these " + self.unitWord() + " is later" : s.why;
            return '<button type="button" class="ptb-slot is-off" aria-disabled="true" data-ptb="slot-off" data-why="' + esc(why) + '" aria-label="' + esc(s.t + ", " + why) + '">' + s.t.replace(/ (AM|PM)$/, "") + "</button>";
          }).join("");
          self.renderFoot();
        });
      });
    };
    function neutral(t) { if (!t) return ""; return /supplier|warehouse/i.test(t) ? "" : t; }
    B.slots = function (iso, slug, res) {
      var st = this.st, d = M.parseISO(iso), now = new Date();
      var isToday = iso === M.localISO(now);
      var floor = this.floor();
      var lead = 120;
      if (st.kind === "package" && floor) lead = 0;
      if ((st.kind === "product_tire" || st.kind === "product_wheel") && floor && floor.dateISO < iso) lead = 120;
      var need = 1;
      if (st.kind === "package" && st.pkg && st.pkg.durationMinutes) need = Math.max(1, Math.ceil(st.pkg.durationMinutes() / 30));
      return M.grid({ hours: M.hoursFor(HOURS, slug, d), iso: iso, booked: res.booked, isToday: isToday, nowMins: now.getHours() * 60 + now.getMinutes(), floor: floor, lead: lead, need: need });
    };
    // Conservative: the other shop's hours, what the server says is booked
    // there and its own floor. It may undercount; never offers a time that is
    // not there. Only when no add-on / service pins the shop.
    B.altTimes = function (iso, slug, d) {
      var st = this.st, self = this, L = locs();
      if (st.kind === "package" || L.bookable.length < 2 || this.restrictions().lists.length) return Promise.resolve(null);
      var other = L.bookable.filter(function (l) { return l.slug !== slug; })[0];
      if (!other) return Promise.resolve(null);
      return this.fetchAvail(iso, other.slug).then(function (res) {
        if (!res || res.unavailable || res.allDayBlocked || res.onlineFull || res.noOnlinePromise) return null;
        var floor = res.earliest && res.earliest.date ? { dateISO: res.earliest.date, mins: M.slotToMins(res.earliest.time || "") } : (self.st.set && self.st.lines ? M.localFloor(M.setTier(self.st.lines), new Date()) : self.st.kind === "product_tire" || self.st.kind === "product_wheel" ? M.localFloor(self.st.product.supplierTier, new Date()) : null);
        var now = new Date();
        var g = M.grid({ hours: M.hoursFor(HOURS, other.slug, d), iso: iso, booked: res.booked, isToday: iso === M.localISO(now), nowMins: now.getHours() * 60 + now.getMinutes(), floor: floor, lead: 120, need: 1 });
        var t = g.filter(function (s) { return s.ok; }).map(function (s) { return s.t; });
        return t.length ? { shop: other, times: t } : null;
      }, function () { return null; });
    };
    B.gridMsg = function (text, warn, call) {
      var g = this.bodyEl.querySelector("[data-ptb-grid]"), dm = this.bodyEl.querySelector("[data-ptb-dropmsg]");
      var html = '<p class="' + (warn ? "rd-err" : call ? "rd-note" : "ptb-muted") + ' ptb-span" role="status">' + esc(text) + "</p>";
      if (g) g.innerHTML = html; else if (dm) dm.textContent = text;
      this.st.dropOk = false; this.st.dropMsg = text;
      this.renderFoot();
    };
    B.dropSay = function (t) {
      var dm = this.bodyEl.querySelector("[data-ptb-dropmsg]");
      this.st.dropMsg = t;
      if (dm) { dm.textContent = t; dm.className = "ptb-dropmsg" + (t ? " rd-err" : ""); }
      this.renderFoot();
    };
    B.repaintDays = function () {
      var host = this.bodyEl.querySelector(".ptb-days");
      if (!host) return;
      var tmp = doc.createElement("div"); tmp.innerHTML = this.vDays();
      host.parentNode.replaceChild(tmp.firstChild, host);
      this.stripToDay();
      var en = this.bodyEl.querySelector("[data-ptb-earliest]"); if (en) en.textContent = this.earliestNote();
    };
    B.renderCallbackInGrid = function () {
      var g = this.bodyEl.querySelector("[data-ptb-grid]"), st = this.st;
      if (!g) return;
      var veh = [st.veh.year, st.veh.make, st.veh.model].filter(Boolean).join(" ");
      renderCallback(g, {
        dateISO: st.date, dateLabel: M.shortDay(M.parseISO(st.date)), locationSlug: st.location || null,
        prefill: st.contact, service: M.callbackService(st, CAT), vehicle: veh || null,
        onDone: function () {}
      });
      st.time = null;
      this.renderFoot();
    };

    // Step 4 - You
    B.vYou = function () {
      var st = this.st, id = this.id, h = "";
      var pkg = st.kind === "package";
      if (isPhone()) h += '<div class="ptb-suminline">' + this.sumHTML(true) + "</div>";
      h += '<div class="ptb-head"><div><h2 class="rd-sheet__h">Your details</h2><p class="rd-sheet__sub">We send your request and our confirmation here.</p></div></div>';
      if (st.conflict) h += this.vConflict();
      h += '<form class="ptb-form" data-ptb-form novalidate autocomplete="on" onsubmit="return false">' +
        '<div class="ptb-grid2">' +
        field(id + "-name", "Name", '<input id="' + id + '-name" data-ptb-c="name" autocomplete="name" maxlength="80" placeholder="Jane Smith" value="' + esc(st.contact.name) + '" required>', "ptb-span") +
        field(id + "-phone", "Mobile number", '<input id="' + id + '-phone" data-ptb-c="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="(403) 555-0123" value="' + esc(st.contact.phone) + '" required>') +
        field(id + "-email", "Email", '<input id="' + id + '-email" data-ptb-c="email" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="jane@email.com" value="' + esc(st.contact.email) + '" required>') +
        "</div>";
      if (pkg) {
        var vl = st.pkg.vehicleLabel ? st.pkg.vehicleLabel() : "";
        if (vl) h += '<p class="ptb-row"><span><b>Vehicle:</b> ' + esc(vl) + "</span></p>";
        if (st.quote && st.quote.verdict === "fit_check") h += '<p class="rd-note">The ' + esc(st.pkg.shopName()) + " manager checks fit on your " + esc(st.pkg.vehicleModel()) + " before anything is mounted. The price won’t change.</p>";
      } else {
        var cid = id + "-car";
        h += '<div class="ptb-acc"><button type="button" class="ptb-acc__h" data-ptb="acc" data-v="accCar" aria-expanded="' + !!st.accCar + '" aria-controls="' + cid + '"><span>Your vehicle <span class="ptb-opt-t">(optional, helps us prepare)</span></span>' +
          (!st.accCar && (st.veh.year || st.veh.make || st.veh.model) ? '<span class="ptb-acc__sum">' + esc([st.veh.year, st.veh.make, st.veh.model].filter(Boolean).join(" ")) + "</span>" : "") + ico(st.accCar ? "up" : "chevron", 18) + "</button>" +
          '<div class="ptb-acc__b" id="' + cid + '"' + (st.accCar ? "" : " hidden") + ">" + '<div class="ptb-grid4">' +
          field(id + "-vy", "Year", '<input id="' + id + '-vy" data-ptb-v="year" inputmode="numeric" maxlength="4" placeholder="2019" autocomplete="off" value="' + esc(st.veh.year) + '">') +
          field(id + "-vm", "Make", '<input id="' + id + '-vm" data-ptb-v="make" maxlength="60" placeholder="Toyota" autocomplete="off" value="' + esc(st.veh.make) + '">') +
          field(id + "-vd", "Model", '<input id="' + id + '-vd" data-ptb-v="model" maxlength="60" placeholder="RAV4" autocomplete="off" value="' + esc(st.veh.model) + '">') +
          field(id + "-vo", "Mileage (km)", '<input id="' + id + '-vo" data-ptb-v="odo" inputmode="numeric" maxlength="12" placeholder="e.g. 84,500" autocomplete="off" value="' + esc(st.veh.odo) + '">') +
          "</div></div></div>";
      }
      h += field(id + "-notes", "Notes <span class=\"ptb-opt-t\">(optional)</span>", '<textarea id="' + id + '-notes" data-ptb-c="notes" maxlength="1000" rows="3" placeholder="Anything we should know…">' + esc(st.notes) + "</textarea>");
      if (st.kind === "own_tires" || st.kind === "swap") {
        var bad = st.tried && !st.ack;
        h += '<label class="ptb-ack' + (bad ? " ptb-err-box" : "") + '"><input type="checkbox" data-ptb-ack' + (st.ack ? " checked" : "") + ' aria-describedby="' + id + '-ackerr" required><span>I’ve checked the tires I’m bringing: at least 4/32" (3 mm) of tread, and the date code on the sidewall (the last 4 digits of the DOT code, e.g. 2321 = week 23 of 2021). I understand Prince Tires may decline to install tires that are worn, damaged or too old.</span></label>' +
          '<p class="rd-field__error" id="' + id + '-ackerr"' + (bad ? ' role="alert"' : " hidden") + ">Please tick the box to confirm you’ve checked the tread and date code.</p>";
      }
      h += "</form>";
      // Bot trap: a person never sees or fills it; its own form keeps autofill off it.
      h += '<form class="pt-hp ptb-hp" aria-hidden="true" onsubmit="return false" autocomplete="off"><label for="' + id + '-hp">Leave this empty</label><input type="text" id="' + id + '-hp" name="company_website" value="" tabindex="-1" autocomplete="off" aria-hidden="true" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" data-ptb-hp></form>';
      h += '<p class="ptb-fine">This is a request. Nothing is final until we confirm ' + (pkg ? "by text" : esc(CONFIRM_BY)) + ". You pay at the shop.</p>";
      return h;
    };
    // Year / Make / Model / Trim (live snippets/pt-booking-ymm.liquid on
    // /pages/booking, same data: pt-vehicle-manifest.json +
    // pt-vehicle-<year>.json). Picking a trim does what live does:
    //   - sets the vehicle type (M.ymmType: pickup / LT tires -> Truck, DRW ->
    //     Dually, Tesla/Polestar/Rivian/Lucid -> Electric, else Sedan), as a
    //     guess, not a hand pick: on a service priced by vehicle the same rule
    //     /api/book applies then raises it (CR-V -> SUV, a Yukon XL on
    //     P275/55R20 -> Truck), so the summary shows what the server charges;
    //   - fills the You step's Year / Make / Model boxes (model only; the trim
    //     rides along as vehicleTrim via M.bookTrim, like live ptPickedTrim);
    //   - service flows: puts "Tire size: <factory size>" at the top of the
    //     notes (tap another size when the trim has several). Tire / wheel page
    //     bookings leave the notes alone, as live pt-popup-ymm does: the size
    //     being bought may differ from the factory one.
    // The boxes stay editable, so a car that is not listed can be typed.
    B.vYmm = function () {
      var st = this.st, id = this.id, pk = st.ymm || {}, m = YMM.mv, d = pk.y ? YMM.dv[pk.y] : null, models = (d && d.models) || {};
      var lists = {
        y: m ? (m.years || []).map(String).slice().reverse() : [],
        mk: d ? ymmKeys(models) : [],
        md: d && pk.mk ? ymmKeys(models[pk.mk]) : [],
        tr: d && pk.mk && pk.md ? ymmKeys((models[pk.mk] || {})[pk.md]) : []
      };
      var sel = function (k, label) {
        var L = lists[k];
        return '<select id="' + id + "-ymm-" + k + '" data-ptb-ymm="' + k + '" aria-label="' + label + '"' + (L.length ? "" : " disabled") + '><option value="">' + label + "</option>" +
          L.map(function (x) { return "<option" + (x === pk[k] ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select>";
      };
      return '<div class="ptb-ymm" data-ptb-ymm-row role="group" aria-labelledby="' + id + '-ymmt"><p class="ptb-ymm__t" id="' + id + '-ymmt">Your vehicle</p><div class="ptb-ymm__g">' +
        sel("y", "Year") + sel("mk", "Make") + sel("md", "Model") + sel("tr", "Trim") + "</div>" + this.vYmmResult() +
        '<button type="button" class="rd-btn rd-btn--text ptb-ymm__alt" data-ptb="veh-mode" data-v="type">Can’t find your vehicle? Pick a type instead</button></div>';
    };
    B.vYmmResult = function () {
      var st = this.st, id = this.id, pk = st.ymm || {};
      if (!pk.tr || !st.ymmType) return "";
      var sizes = st.ymmSizes || [];
      var h = '<div class="ptb-ymm__r"><p class="ptb-ymm__veh"><b>' + esc([pk.y, pk.mk, pk.md, pk.tr].join(" ")) + "</b> · " + esc(this.ymmLabel()) + "</p>";
      if (sizes.length === 1) h += '<p class="ptb-ymm__szl">Factory tire size: <b>' + esc(sizes[0]) + "</b></p>";
      else if (sizes.length > 1) {
        h += '<p class="ptb-ymm__szl" id="' + id + '-ymmsz">Factory tire size (tap yours):</p><div class="ptb-ymm__sz" role="radiogroup" aria-labelledby="' + id + '-ymmsz">' + sizes.map(function (z) {
          var on = z === st.ymmSize;
          return '<button type="button" class="ptb-chip' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '" data-ptb="ymm-size" data-v="' + esc(z) + '">' + esc(z) + "</button>";
        }).join("") + "</div>";
      }
      return h + "</div>";
    };
    function ymmFile(name) { return String(DATA.vehicleManifest).split("?")[0].replace("pt-vehicle-manifest.json", name); }
    function ymmManifest() {
      return YMM.m || (YMM.m = win.fetch(DATA.vehicleManifest).then(function (r) { if (!r.ok) throw new Error("manifest"); return r.json(); }).then(function (m) { YMM.mv = m; return m; }));
    }
    function ymmYear(y) {
      return YMM.y[y] || (YMM.y[y] = win.fetch(ymmFile("pt-vehicle-" + y + ".json")).then(function (r) { if (!r.ok) throw new Error("year"); return r.json(); }).then(function (d) { YMM.dv[y] = d; return d; }));
    }
    function ymmKeys(o) { return o ? Object.keys(o).filter(Boolean).sort(function (a, b) { return a.localeCompare(b); }) : []; }
    function ymmOpts(el, list, ph, val) {
      if (!el || (el.options.length > 1 && list.length)) return; // already drawn from the cache
      el.innerHTML = '<option value="">' + esc(ph) + "</option>" + list.map(function (x) { return "<option" + (x === val ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("");
      el.disabled = list.length === 0;
    }
    // Load what the dropdowns still need and fill them in place.
    B.ymmFill = function () {
      var self = this, st = this.st, row = this.bodyEl.querySelector("[data-ptb-ymm-row]");
      if (!row || row.closest("[hidden]")) return;
      var S = {}; ["y", "mk", "md", "tr"].forEach(function (k) { S[k] = row.querySelector('[data-ptb-ymm="' + k + '"]'); });
      var pk = st.ymm || {};
      ymmManifest().then(function (m) {
        if (self.st !== st || !row.isConnected) return;
        ymmOpts(S.y, (m.years || []).map(String).slice().reverse(), "Year", pk.y);
        if (!pk.y) return;
        return ymmYear(pk.y).then(function (d) {
          if (self.st !== st || !row.isConnected) return;
          var models = d.models || {};
          ymmOpts(S.mk, ymmKeys(models), "Make", pk.mk);
          if (pk.mk) ymmOpts(S.md, ymmKeys(models[pk.mk]), "Model", pk.md);
          if (pk.mk && pk.md) ymmOpts(S.tr, ymmKeys((models[pk.mk] || {})[pk.md]), "Trim", pk.tr);
        });
      }).catch(function () {
        // No vehicle data: the type chips, as before.
        YMM.failed = true;
        if (self.st === st && row.isConnected) { var f = row.contains(doc.activeElement); self.renderBody(); if (f) self.refocus('[data-ptb="veh"][aria-checked="true"]'); }
      });
    };
    B.ymmPick = function (k, val) {
      var st = this.st, self = this, pk = st.ymm = st.ymm || {}, mine = st.ymmMine = st.ymmMine || {};
      var put = function (f, v) { st.veh[f] = v; };
      var clearIfMine = function (f) { if (mine[f] != null && st.veh[f] === mine[f]) put(f, ""); mine[f] = null; };
      // A new pick drops the last one's size line (only while it is still ours).
      var unpick = function () {
        if (st.ymmSize && new RegExp("^Tire size: " + st.ymmSize.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "$", "m").test(st.notes || "")) st.notes = M.notesWithSize(st.notes, "");
        st.ymmSizes = null; st.ymmSize = ""; st.ymmType = "";
      };
      if (k === "y") { st.ymm = pk = { y: val }; unpick(); clearIfMine("make"); clearIfMine("model"); st.picked = null; if (val) put("year", val); }
      else if (k === "mk") { pk.mk = val; pk.md = ""; pk.tr = ""; unpick(); clearIfMine("model"); st.picked = null; if (val) { put("make", val); mine.make = val; } }
      else if (k === "md") { pk.md = val; pk.tr = ""; unpick(); if (val) { put("model", val); mine.model = val; st.picked = { model: val, trim: "" }; } }
      else if (k === "tr") {
        pk.tr = val; unpick();
        if (pk.md) { put("model", pk.md); mine.model = pk.md; st.picked = { model: pk.md, trim: val }; }
        var d = YMM.dv[pk.y], sizes = val && d ? ((((d.models || {})[pk.mk] || {})[pk.md] || {})[val] || []) : [];
        if (val && pk.mk && pk.md) {
          var vt = M.ymmType(pk.mk, pk.md, val, sizes);
          st.ymmSizes = sizes.map(String); st.ymmSize = st.ymmSizes[0] || ""; st.ymmType = vt.label;
          // live save(): Year, Make and Model boxes, then the size line.
          if (pk.y) put("year", pk.y);
          put("make", pk.mk); mine.make = pk.mk;
          if (!this.isProduct()) st.notes = M.notesWithSize(st.notes, st.ymmSize);
          this.ymmVehicle(vt.type);
        }
      }
      // One trim only: picked for them (live does the same).
      if (k === "md" && val) {
        var dd = YMM.dv[pk.y], trims = dd ? ymmKeys(((dd.models || {})[pk.mk] || {})[val]) : [];
        if (trims.length === 1) { this.ymmPick("tr", trims[0]); this.refocus('[data-ptb-ymm="md"]'); return; }
      }
      this.autoTier(k === "tr");
      this.renderBody(); this.refocus('[data-ptb-ymm="' + k + '"]');
      this.renderSum(); this.renderFoot(); this.saveDraftSoon();
      if (k === "tr" && st.ymmType) this.liveSay("Vehicle type set to " + this.ymmLabel() + ".");
    };
    // Focus the Year box, or the link while the years are still loading.
    B.focusYmm = function () { this.refocus(this.bodyEl.querySelector('[data-ptb-ymm="y"]:not([disabled])') ? '[data-ptb-ymm="y"]' : '[data-ptb="veh-mode"][data-v="type"]'); };
    B.ymmSize = function (z) {
      var st = this.st;
      if (!st.ymmSizes || st.ymmSizes.indexOf(z) < 0) return;
      var was = st.vehicle, base = this.ymmBase();
      st.ymmSize = z;
      if (!this.isProduct()) st.notes = M.notesWithSize(st.notes, z);
      // Back to the trim's own type, then the big-tire rule for this size
      // (a smaller size goes back to the car price). A hand-picked type stays.
      if (!st.vehiclePicked && base) this.ymmVehicle(base);
      this.renderBody(); this.refocus('[data-ptb="ymm-size"][aria-checked="true"]'); this.renderSum(); this.renderFoot(); this.saveDraftSoon();
      if (st.vehicle !== was) this.liveSay("Vehicle type set to " + this.ymmLabel() + ".");
    };
    B.isProduct = function () { var k = this.st.kind; return k === "product_tire" || k === "product_wheel"; };
    // The type the picked trim gives (M.ymmType), or "" with no trim picked.
    B.ymmBase = function () {
      var st = this.st, pk = st.ymm || {};
      return pk.tr && st.ymmType ? M.ymmType(pk.mk, pk.md, pk.tr, st.ymmSizes || []).type : "";
    };
    // What to call the vehicle after a trim pick: the live label ("Car / SUV",
    // "Pickup truck", ...) while the type is still the trim's own, else the
    // type it is priced as (SUV / Truck after the big-tire rule, or a chip).
    B.ymmLabel = function () {
      var st = this.st, b = this.ymmBase();
      return b && st.vehicle === b && st.ymmType ? st.ymmType : M.vehicleName(st.vehicle);
    };
    // A type that comes from a trim pick: a guess, like a typed make / model,
    // so the big-tire rule still runs. Only the type chips are a hand pick.
    B.ymmVehicle = function (v) {
      var st = this.st;
      if (!M.isVehicle(v)) return;
      st.vehicle = v; st.vehiclePicked = false;
      this.autoTier(true);
      if (st.kind === "swap" && !st.qtyByHand) st.qty = M.defaultQty("swap", st.service, st.vehicle);
    };
    // A vehicle type the customer chose by hand (a type chip).
    B.setVehicle = function (v) {
      var st = this.st;
      if (!M.isVehicle(v)) return;
      st.vehicle = v; st.vehiclePicked = true;
      if (st.kind === "swap" && !st.qtyByHand) st.qty = M.defaultQty("swap", st.service, v);
    };
    function field(id, label, control, cls) {
      // Required-field mark (owner 2026-11-15): a red * on every field the form requires.
      var req = /\srequired[\s>]/.test(control) ? '<span class="pt-req-mark" aria-hidden="true">*</span>' : "";
      return '<div class="rd-field' + (cls ? " " + cls : "") + '"><label for="' + id + '">' + label + req + "</label>" + control + "</div>";
    }
    B.vConflict = function () {
      var c = this.st.conflict;
      if (c.kind === "price") return '<div class="rd-err" role="alert"><p>The price changed from ' + esc(M.money(c.from)) + " to " + esc(M.money(c.to)) + ' since you started.</p><button type="button" class="rd-btn rd-btn--primary ptb-mt" data-ptb="accept-price">Send request at ' + esc(M.money(c.to)) + "</button></div>";
      return '<div class="rd-err" role="alert"><p>' + esc(c.itemLabel) + " can’t be supplied as a set of 4 any more." + (c.ready ? " Earliest is now " + esc(c.ready) + "." : "") + '</p><button type="button" class="rd-btn rd-btn--line ptb-mt" data-ptb="new-time">Pick a new time</button></div>';
    };

    // Screen Q - package quote (single screen, no time step)
    B.vQuote = function () {
      var st = this.st, a = st.pkg || {}, id = this.id, info = a.info ? a.info() : {};
      if (st.done) return this.vDone();
      var h = '<div class="ptb-head"><div><h2 class="rd-sheet__h">Request a package quote</h2><p class="rd-sheet__sub">' + esc(info.intro || "Tell us about your vehicle and the look you want. We’ll text you package options with installed prices.") + "</p></div></div>";
      if (info.reasons && info.reasons.length > 1) h += "<ul class=\"ptb-list\">" + info.reasons.slice(1).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
      if (info.hintLine) h += '<p class="ptb-muted">Wheel you asked about: <b>' + esc(info.hintLine) + "</b></p>";
      h += '<form class="ptb-form" data-ptb-form novalidate onsubmit="return false">';
      if (info.vehicleText) h += field(id + "-qv", "Vehicle", '<input id="' + id + '-qv" value="' + esc(info.vehicleText) + '" readonly>');
      else {
        var t = info.typed || {};
        h += '<div class="ptb-grid4">' +
          field(id + "-qy", "Year", '<input id="' + id + '-qy" data-ptb-q="year" inputmode="numeric" maxlength="4" value="' + esc(t.year || "") + '">') +
          field(id + "-qm", "Make", '<input id="' + id + '-qm" data-ptb-q="make" maxlength="60" value="' + esc(t.make || "") + '">') +
          field(id + "-qd", "Model", '<input id="' + id + '-qd" data-ptb-q="model" maxlength="60" value="' + esc(t.model || "") + '">') +
          field(id + "-qt", "Trim <span class=\"ptb-opt-t\">(optional)</span>", '<input id="' + id + '-qt" data-ptb-q="trim" maxlength="60" value="' + esc(t.trim || "") + '">') + "</div>";
      }
      var shops = a.shops || {};
      h += '<div><span class="rd-sheet__lab" id="' + id + '-qshop">Closest shop</span><div class="ptb-opts ptb-opts--2" role="radiogroup" aria-labelledby="' + id + '-qshop">' + ["sw", "ne"].filter(function (s) { return shops[s]; }).map(function (s) {
        var on = st.location === s;
        return '<button type="button" class="ptb-opt' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '" data-ptb="qshop" data-v="' + s + '"><span class="ptb-dot" aria-hidden="true"></span><span class="ptb-opt__t"><span>' + esc(shops[s].name) + '</span><span class="ptb-opt__d">' + esc(shops[s].address || "") + "</span></span></button>";
      }).join("") + "</div></div>";
      h += '<div class="ptb-grid2">' +
        field(id + "-name", "Name", '<input id="' + id + '-name" data-ptb-c="name" autocomplete="name" maxlength="80" placeholder="Jane Smith" value="' + esc(st.contact.name) + '" required>', "ptb-span") +
        field(id + "-phone", "Mobile number <span class=\"ptb-opt-t\">(we text you here)</span>", '<input id="' + id + '-phone" data-ptb-c="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="(403) 555-0123" value="' + esc(st.contact.phone) + '" required>') +
        field(id + "-email", "Email <span class=\"ptb-opt-t\">(optional)</span>", '<input id="' + id + '-email" data-ptb-c="email" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="jane@email.com" value="' + esc(st.contact.email) + '">') +
        "</div>";
      h += field(id + "-notes", "Anything else? <span class=\"ptb-opt-t\">(optional)</span>", '<textarea id="' + id + '-notes" data-ptb-c="notes" maxlength="1000" rows="3" placeholder="Sizes, finish, budget…">' + esc(st.notes) + "</textarea>");
      h += "</form>";
      h += '<form class="pt-hp ptb-hp" aria-hidden="true" onsubmit="return false" autocomplete="off"><label for="' + id + '-hp">Company website</label><input type="text" id="' + id + '-hp" name="company_website" value="" tabindex="-1" autocomplete="off" aria-hidden="true" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" data-ptb-hp></form>';
      h += '<p class="ptb-muted">No price yet: we’ll text you package options with installed prices.</p>';
      return h;
    };

    // Done
    B.vDone = function () {
      var d = this.st.done, h = "";
      h += '<div class="ptb-done"><span class="ptb-done__ok" aria-hidden="true">' + ico(d.call ? "phone" : "check", 28) + "</span>" +
        '<div><h2 class="rd-sheet__h" tabindex="-1">' + esc(d.title) + "</h2>" + d.lines.map(function (l, i) { return '<p class="ptb-done__p' + (i ? " ptb-done__p--2" : "") + '">' + esc(l) + "</p>"; }).join("") + "</div>";
      if (d.rows && d.rows.length) h += '<div class="ptb-done__card">' + d.rows.map(function (r) { return '<div class="ptb-done__row' + (r.total ? " ptb-done__row--total" : "") + '"><span>' + esc(r.k) + "</span><span>" + (r.html || esc(r.v)) + "</span></div>"; }).join("") + "</div>";
      h += '<div class="ptb-done__actions">' + (d.ics ? '<button type="button" class="rd-btn rd-btn--line" data-ptb="ics">Add to calendar</button>' : "") +
        (this.mode === "sheet" ? '<button type="button" class="rd-btn rd-btn--dark" data-ptb="close">Done</button>' : this.mode === "page" ? '<a class="rd-btn rd-btn--dark" href="/">Back to home</a>' : "") +
        (d.shopPhone ? '<a class="rd-btn rd-btn--text" href="' + esc(d.tel) + '">Call ' + esc(d.shopName) + ' · ' + esc(d.shopPhone) + '</a>' : "") + "</div>";
      if (d.ics) h += '<p class="ptb-muted">Your calendar entry reads “' + esc(d.icsTitle) + "”" + (d.confirmed ? "." : " until we confirm.") + "</p>";
      return h + "</div>";
    };

    // ── Summary panel ("Your request") ────────────────────────────────
    B.sumHTML = function (inline) {
      var st = this.st, rows = [], name = this.stepName();
      if (st.kind === "package_quote") return "";
      var isProd = st.kind === "product_tire" || st.kind === "product_wheel";
      var unit = st.kind === "product_wheel" ? "wheel" : "tire";
      if (st.set && st.lines) {
        rows.push(["What", "2 front + 2 rear tires, installed"]);
        st.lines.forEach(function (l) { rows.push([l.position === "rear" ? "Rear" : "Front", l.qty + " × " + l.product.tireSize]); });
      } else rows.push(["What", isProd ? st.qty + " " + unit + (st.qty === 1 ? "" : "s") + ", installed" : st.kind === "package" ? "Wheel & tire package" : st.service ? M.serviceName(st.service, CAT) : "—"]);
      var ti = st.steps.indexOf("time");
      if (st.step >= ti && ti > -1) rows.push(["Shop", st.kind === "package" && st.pkg ? st.pkg.shopName() : shortName(this.loc())]);
      if (st.step > ti && ti > -1 || (name === "time" && (st.time || M.isDropOff(st)))) rows.push(["When", this.whenText()]);
      if (st.kind !== "package") rows.push(["Vehicle", ([st.veh.year, st.veh.make, st.veh.model].filter(Boolean).join(" ") || M.vehicleName(st.vehicle))]);
      if (M.asksOldTires(st) && st.oldTires) rows.push(["Old tires", st.oldTires === "keep" ? "Taking them home" : "Scrapped and recycled (not stored)"]);
      if (st.kind === "package" && st.pkg && st.pkg.tpmsNone && st.pkg.tpmsNone()) rows.push(["TPMS", "No sensors (warning light stays on)"]);
      var h = '<h2 class="rd-summary__title">Your request</h2><div class="rd-summary__ctx">' + rows.map(function (r) { return "<div><span>" + esc(r[0]) + "</span><span>" + esc(r[1]) + "</span></div>"; }).join("") + "</div>";
      var lines, sub, gst, total, priced = true;
      if (st.kind === "package") {
        var q = st.quote;
        if (!q) return h + '<p class="rd-summary__empty">' + (st.quoteState === "error" ? "We couldn’t check today’s price." : "Checking today’s price…") + "</p>" + this.sumFoot();
        var hw = [], rest = [];
        (q.lines || []).forEach(function (l) { (/^(mount_balance|install|road_force|levy)/.test(l.key || "") ? rest : hw).push(l); });
        var hwTotal = hw.reduce(function (s, l) { return s + (l.totalCents || 0); }, 0);
        h += '<div class="rd-summary__lines"><details class="ptb-sumacc"><summary class="rd-summary__line"><span>Wheels, tires and hardware</span><span>' + esc(M.money(hwTotal)) + "</span></summary>" +
          hw.map(function (l) { return '<div class="rd-summary__line ptb-sub"><span>' + esc(l.label) + "</span><span>" + (l.included || !l.totalCents ? "Included" : esc(M.money(l.totalCents))) + "</span></div>"; }).join("") + "</details>" +
          rest.map(function (l) { return '<div class="rd-summary__line"><span>' + esc(l.label) + "</span><span>" + (l.included || !l.totalCents ? "Included" : esc(M.money(l.totalCents))) + "</span></div>"; }).join("");
        sub = q.subtotalCents; gst = q.gstCents; total = q.totalCents;
        h += '<div class="rd-summary__line rd-summary__line--sub"><span>Subtotal (before GST)</span><span>' + esc(M.money(sub)) + '</span></div><div class="rd-summary__line"><span>GST (5%)</span><span>' + esc(M.money(gst)) + '</span></div><div class="rd-summary__line rd-summary__line--total"><span>Estimated total<span class="rd-summary__incl">incl. GST</span></span><span>' + esc(M.money(total)) + "</span></div></div>";
        h += '<p class="rd-summary__note">Price locked' + (st.lockedAt ? " at " + esc(st.lockedAt) : "") + ". You pay at the shop.</p>";
        return h + this.sumFoot();
      }
      var pr = M.price(st, CAT);
      if (pr.empty) return h + '<p class="rd-summary__empty">Pick what you need and the price shows here.</p>' + this.sumFoot();
      lines = pr.lines; priced = pr.priced;
      h += '<div class="rd-summary__lines">' + lines.map(function (l) {
        var v = l.cents == null ? (l.note || "Priced at the shop") : l.included ? (l.note || "Included") : M.money(l.cents);
        return '<div class="rd-summary__line"><span>' + esc(l.label) + (l.note && l.cents != null && !l.included ? ' <span class="ptb-opt-t">(' + esc(l.note) + ")</span>" : "") + "</span><span>" + (l.wasCents && l.cents != null && !l.included ? '<s class="ptb-was"><span class="rd-sr">Regular </span>' + esc(M.money(l.wasCents)) + "</s> " : "") + esc(v) + "</span></div>";
      }).join("");
      if (priced) {
        h += '<div class="rd-summary__line rd-summary__line--sub"><span>Subtotal (before GST)</span><span>' + esc(M.money(pr.subtotal)) + '</span></div><div class="rd-summary__line"><span>GST (5%)</span><span>' + esc(M.money(pr.gst)) + '</span></div><div class="rd-summary__line rd-summary__line--total"><span>Estimated total<span class="rd-summary__incl">incl. GST</span></span><span>' + esc(M.money(pr.total)) + "</span></div>";
      }
      h += "</div>";
      h += '<p class="rd-summary__note">Estimate. Your price is confirmed when we confirm your request. Prices before GST unless marked.</p>';
      void inline;
      return h + this.sumFoot();
    };
    function callLine() {
      var L = locs().all, h = [];
      L.forEach(function (l) { if (l && l.phone) h.push(esc(shortName(l)) + ' <a href="' + telHref(l) + '">' + esc(l.phone) + "</a>"); });
      return h.length ? "Questions? Call " + h.join(" or ") + "." : "";
    }
    B.sumFoot = function () {
      var c = callLine();
      return c ? '<div class="rd-summary__foot">' + c + "</div>" : "";
    };
    B.renderSum = function () {
      var st = this.st;
      if (st.done || st.kind === "package_quote") { this.sumEl.innerHTML = ""; this.sumEl.hidden = true; return; }
      this.sumEl.hidden = false;
      this.sumEl.innerHTML = (isPhone() ? '<button type="button" class="rd-iconbtn rd-iconbtn--bare ptb__sumclose" data-ptb="sum" aria-label="Close summary">' + ico("close") + "</button>" : "") + this.sumHTML(false);
      var inl = this.bodyEl.querySelector(".ptb-suminline");
      if (inl) inl.innerHTML = this.sumHTML(true);
    };
    B.totalText = function () {
      var st = this.st;
      if (st.kind === "package") return st.quote ? M.money(st.quote.totalCents) : "";
      var pr = M.price(st, CAT);
      return pr.priced && pr.total != null ? M.money(pr.total) : "";
    };
    B.whenText = function () {
      var st = this.st;
      if (!st.date) return "—";
      var d = M.parseISO(st.date);
      if (M.isDropOff(st)) return "Drop-off, " + M.shortDay(d);
      return st.time ? M.shortDay(d) + ", " + st.time : "—";
    };
    B.renderFoot = function () {
      var st = this.st, name = this.stepName();
      // Every set change (vehicle type, catalogue) ends with a footer paint:
      // a set that can no longer be priced goes to the call screen.
      if (st.set && !st.done && this.setGate()) return;
      if (st.done || (st.kind === "package" && name === "time" && st.quoteState === "error")) { this.footEl.innerHTML = ""; this.footEl.hidden = true; return; }
      this.footEl.hidden = false;
      var label = name === "service" ? "Next →" : name === "details" ? "Pick a time →" : name === "time" ? "Your details →" : st.sending ? "Sending request…" : (st.kind === "package" && st.conflict && st.conflict.kind === "price") ? "Send request at " + M.money(st.conflict.to) : "Send request";
      var hideNext = name === "service" && st.path === "buy";
      var total = this.totalText();
      var msg = st.error || (st.tried ? this.check() : "");
      var chip = (isPhone() && st.kind !== "package_quote" && total) ? '<button type="button" class="ptb-chipprice" data-ptb="sum" aria-expanded="' + this.el.classList.contains("ptb--sumopen") + '"><span>Estimated total</span><span><b>' + esc(total) + "</b> incl. GST " + ico("up", 16) + "</span></button>" : "";
      this.footEl.innerHTML = chip + '<p class="rd-sheet__msg ptb-msg" role="' + (msg ? "alert" : "status") + '">' + (msg ? esc(msg) : "") + "</p>" +
        (hideNext ? "" : '<button type="button" class="rd-btn rd-btn--primary rd-btn--lg ptb-next" data-ptb="next"' + (st.sending ? " disabled" : "") + ">" + esc(label) + "</button>");
      // New tires: nothing to continue to, so no empty footer bar either.
      if (hideNext && !chip && !msg) this.footEl.hidden = true;
    };

    // ── Events ────────────────────────────────────────────────────────
    B.bind = function () {
      var self = this, el = this.el;
      el.addEventListener("click", function (e) {
        var t = e.target.closest("[data-ptb]");
        if (!t || !el.contains(t)) return;
        var act = t.getAttribute("data-ptb"), v = t.getAttribute("data-v");
        if (t.tagName === "A") return;
        e.preventDefault();
        self.act(act, v, t);
      });
      el.addEventListener("input", function (e) {
        var t = e.target, st = self.st;
        if (!st) return;
        if (t.hasAttribute("data-ptb-c")) { var k = t.getAttribute("data-ptb-c"); if (k === "notes") st.notes = t.value; else st.contact[k] = t.value; self.saveDraftSoon(); }
        else if (t.hasAttribute("data-ptb-v")) { st.veh[t.getAttribute("data-ptb-v")] = t.getAttribute("data-ptb-v") === "year" ? t.value.replace(/\D/g, "") : t.value; if (t.getAttribute("data-ptb-v") === "year" && /\D/.test(t.value)) t.value = st.veh.year; self.renderSum(); self.saveDraftSoon(); }
        else if (t.hasAttribute("data-ptb-in")) { st.tireSize = t.value; self.saveDraftSoon(); }
        else if (t.hasAttribute("data-ptb-q")) { st.qTyped = st.qTyped || {}; st.qTyped[t.getAttribute("data-ptb-q")] = t.value; }
        else if (t.hasAttribute("data-ptb-hp")) { st.hp = t.value; }
        if (t.getAttribute("aria-invalid") === "true") t.removeAttribute("aria-invalid");
      });
      el.addEventListener("change", function (e) {
        var t = e.target, st = self.st;
        if (t.hasAttribute("data-ptb-ack")) { st.ack = t.checked; if (t.checked) { var er = self.bodyEl.querySelector("#" + self.id + "-ackerr"); if (er) er.hidden = true; t.closest(".ptb-ack").classList.remove("ptb-err-box"); } }
        else if (t.hasAttribute("data-ptb-term")) { var tv = parseInt(t.value, 10); st.terms[t.getAttribute("data-ptb-term")] = st.set && !(tv > 0) ? null : tv; self.renderBody(); self.renderSum(); self.renderFoot(); }
        else if (t.hasAttribute("data-ptb-ymm")) { self.ymmPick(t.getAttribute("data-ptb-ymm"), t.value); }
        else if (t.hasAttribute("data-ptb-v") || t.hasAttribute("data-ptb-c")) { self.autoTier(); }
      });
      el.addEventListener("submit", function (e) {
        var f = e.target;
        if (f.hasAttribute("data-ptb-find")) { e.preventDefault(); findTires(f.querySelector("input").value); }
      });
      var keys = function (e) {
        if (self.mode === "sheet" && el.hidden) return;
        // Find your size / Search by vehicle can open on top of the sheet:
        // their own Escape and focus trap apply, not this sheet's.
        // (.ptvs stays unhidden ~420 ms while it slides away; is-open is the live state.)
        if (self.mode === "sheet" && doc.querySelector(".pss:not([hidden]),.ptvs.is-open")) return;
        if (e.key === "Escape" && self.mode === "sheet") {
          e.preventDefault();
          if (el.classList.contains("ptb--sumopen")) { self.act("sum"); return; }
          self.back();
          return;
        }
        // Tires / Wheels / Packages: arrow keys, Home and End (ARIA tabs).
        var tb = e.target && e.target.closest && e.target.closest('[data-ptb="buytab"]');
        if (tb && /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(e.key)) {
          var all = Array.prototype.slice.call(tb.parentNode.querySelectorAll('[data-ptb="buytab"]')), i = all.indexOf(tb);
          i = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + all.length) % all.length;
          e.preventDefault();
          self.act("buytab", all[i].getAttribute("data-v"), all[i]);
          return;
        }
        if (e.key === "Tab" && self.mode === "sheet") trapTab(e, self.panel);
        if (e.key === "Enter" && e.target && e.target.tagName === "INPUT" && e.target.closest && e.target.closest("[data-ptb-form]") && el.contains(e.target)) { e.preventDefault(); self.next(); }
      };
      // The sheet listens on the document (focus may still be on the opener).
      if (this.mode === "sheet") doc.addEventListener("keydown", keys); else el.addEventListener("keydown", keys);
    };
    function trapTab(e, panel) {
      var f = Array.prototype.filter.call(panel.querySelectorAll('button:not([disabled]),a[href],input:not([type="hidden"]):not([tabindex="-1"]),select,textarea,[tabindex="0"]'), function (x) { return x.offsetParent !== null || x === doc.activeElement; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (doc.activeElement === first || doc.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    // The site's Find your size search (assets/pt-size-sheet.js, every page).
    // The page's wheel searches (sections/pt-booking-page), kept by reference
    // so they survive each redraw of the popup body.
    var WS = {};
    function wsNode(kind) {
      if (WS[kind] && WS[kind].isConnected !== undefined) return WS[kind];
      var n = doc.querySelector('[data-ptb-ws="' + kind + '"] [data-pt-ws]');
      if (n) WS[kind] = n;
      return WS[kind] || null;
    }
    function hasSizeSearch() { return !!(win.PTSizeSheet && typeof win.PTSizeSheet.inline === "function"); }
    function findTires(q) {
      q = String(q || "").trim();
      if (!q) return;
      var m = /(\d{3})\s*\/?\s*(\d{2})\s*Z?R?\s*(\d{2})/i.exec(q), url;
      if (m) {
        url = "/collections/tires?filter.p.m.custom.tire_width=" + m[1] + "&filter.p.m.custom.tire_profile=" + m[2] + "&filter.p.m.custom.rim_diameter=" + m[3];
        if (win.PTRim && win.PTRim.route) { try { url = win.PTRim.route(url); } catch (e) {} }
      } else url = "/search?q=" + encodeURIComponent(q) + "&type=product";
      win.location.href = url;
    }
    B.refocus = function (sel) {
      var el = sel ? this.bodyEl.querySelector(sel) : null;
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
    };
    B.act = function (act, v, t) {
      var st = this.st, self = this, key = t && t.getAttribute("data-ptb") + '"][data-v="' + (v || "");
      var sel = t && v != null ? '[data-ptb="' + key + '"]' : null;
      switch (act) {
        case "close": this.close(); return;
        case "back": this.back(); return;
        case "next": this.next(); return;
        case "sum": this.el.classList.toggle("ptb--sumopen"); this.renderFoot(); if (this.el.classList.contains("ptb--sumopen")) { var c = this.sumEl.querySelector(".ptb__sumclose"); if (c) c.focus(); } else this.refocus(".ptb-chipprice"); return;
        case "path": st.path = v; if (v === "buy") { st.service = null; st.kind = null; } else if (st.service && (v === "own") !== (st.kind === "own_tires" || st.kind === "swap")) { st.service = null; st.kind = null; } st.steps = st.service ? M.stepsFor(st.kind, st.service, true) : M.stepsFor(null); st.error = ""; this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus(sel); this.saveDraft(); return;
        case "svc": this.pickService(v); st.accInfo = false; st.error = ""; this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus(sel); this.saveDraft(); return;
        case "change-svc": this.toService(); return;
        case "saved-own": st.path = "own"; var ss = savedSearchVehicle(); if (ss) { st.tireSize = ss.tireSize || st.tireSize; if (!st.veh.make) { st.veh.year = /^\d{4}$/.test(String(ss.year || "")) ? String(ss.year) : st.veh.year; st.veh.make = ss.make || ""; st.veh.model = ss.model || ""; } } this.renderBody(); this.renderFoot(); return;
        case "saved-x": st.savedDismissed = true; try { win.localStorage.removeItem("pt-tire-search-vehicle"); } catch (e) {} this.renderBody(); return;
        case "buytab":
          st.buyTab = v; this.renderBody(); this.refocus('[data-ptb="buytab"][data-v="' + v + '"]'); return;
        case "acc": st[v] = !st[v]; this.renderBody(); this.renderFoot(); this.refocus('[data-ptb="acc"][data-v="' + v + '"]'); return;
        case "veh-open": st.vehOpen = true; this.renderBody(); this.ymmOn() && st.vehMode !== "type" ? this.focusYmm() : this.refocus('[data-ptb="veh"][aria-checked="true"]'); return;
        case "veh-mode":
          st.vehMode = v === "type" ? "type" : "ymm";
          this.renderBody(); if (st.vehMode === "type") this.refocus('[data-ptb="veh"][aria-checked="true"]'); else this.focusYmm(); this.saveDraft(); return;
        case "ymm-size": this.ymmSize(v); return;
        case "veh":
          this.setVehicle(v);
          this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus(sel); this.saveDraft(); return;
        case "qty":
          if (st.set) return; // a set is always 2 + 2
          var rule = M.qtyRule(st.kind, st.service, st.product ? st.product.maxQty : 0);
          st.qty = Math.max(1, Math.min(rule.max, st.qty + parseInt(v, 10))); st.qtyByHand = true;
          this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus(sel + ":not([disabled])") ; if (doc.activeElement === doc.body) this.refocus(".rd-stepper__btn:not([disabled])"); this.saveDraft(); return;
        case "old": st.oldTires = v; st.error = ""; this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus(sel); this.saveDraft(); return;
        case "add":
          st.add[v] = !st.add[v];
          this.syncLocation();
          if (this.stepName() === "time") { st.time = null; }
          this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus('[data-ptb="add"][data-v="' + v + '"].ptb-opt'); this.saveDraft(); return;
        case "shop":
          if (t.getAttribute("aria-disabled") === "true") { var n = this.bodyEl.querySelector(".rd-note"); this.liveSay(n ? n.textContent : "This shop can’t do this job."); return; }
          if (st.location !== v) { st.location = v; st.time = null; lsSet("pt-booking-location", v); st.locExplicit = true; }
          this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus('[data-ptb="shop"][data-v="' + v + '"]'); this.saveDraft(); return;
        case "qshop": st.location = v; this.renderBody(); this.refocus(sel); return;
        case "visit": st.visit = v; st.time = null; st.dropOk = false; this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus(sel); return;
        case "wk": st.wk = Math.max(0, st.wk + parseInt(v, 10)); this.repaintDays(); this.refocus('[data-ptb="wk"][data-v="' + v + '"]'); return;
        case "day":
          if (t.getAttribute("aria-disabled") === "true") { var r = this.bodyEl.querySelector("[data-ptb-dayreason]"); if (r) r.textContent = t.getAttribute("data-why") || ""; return; }
          st.date = v; st.time = null; st.userPickedDate = true; st.error = "";
          this.renderBody(); this.renderSum(); this.renderFoot(); this.refocus('[data-ptb="day"][data-v="' + v + '"]'); this.saveDraft(); return;
        case "time":
          var alt = t.getAttribute("data-alt");
          st.time = v; st.error = "";
          if (alt) { st.location = alt; lsSet("pt-booking-location", alt); st.locExplicit = true; this.liveSay("Switched to " + shortName(this.loc(alt)) + ", " + v + "."); this.renderBody(); }
          else { this.bodyEl.querySelectorAll(".ptb-slot.is-on").forEach(function (b) { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); }); t.classList.add("is-on"); t.setAttribute("aria-pressed", "true"); }
          this.renderSum(); this.renderFoot(); this.saveDraft(); return;
        case "slot-off": this.liveSay(t.getAttribute("data-why") || "Not available"); var rr = this.bodyEl.querySelector("[data-ptb-dayreason]"); if (rr) rr.textContent = (t.textContent || "") + ": " + (t.getAttribute("data-why") || "not available"); return;
        case "cart-only": this.cartOnly(t); return;
        case "ics": this.ics(); return;
        case "accept-price": st.quote = st.conflictQuote || st.quote; st.conflict = null; this.send(); return;
        case "new-time": st.conflict = null; st.time = null; this.go(st.steps.indexOf("time")); return;
      }
      void self;
    };
    // /api/book reprices a bookType "service" request whose service is priced
    // by vehicle (pricingVehicleType); the summary does the same here. quiet:
    // the caller announces the type itself.
    B.autoTier = function (quiet) {
      var st = this.st, row = st.service && CAT.services ? CAT.services[st.service] : null;
      if (this.isProduct() || /^package/.test(String(st.kind || "")) || !row || !/by_vehicle$/.test(String(row.mode || ""))) return;
      // The tire size serviceBody posts (own tires / swap only), else the notes.
      var posted = st.service === "installation_off" || st.service === "installation_on" ? st.tireSize : "";
      var t = M.autoTier({ vehicle: st.vehicle, picked: st.vehiclePicked, make: st.veh.make, model: st.veh.model, notes: st.notes, tireSize: posted });
      if (t !== st.vehicle) { st.vehicle = t; this.renderSum(); this.renderFoot(); if (!quiet) this.liveSay("Vehicle type set to " + M.vehicleName(t) + " for your vehicle."); }
    };
    B.onCatalog = function () {
      var st = this.st;
      if (!st) return;
      // A slug the live catalogue no longer lists -> step 1, never the fallback.
      if (st.service && !(st.kind === "product_tire" || st.kind === "product_wheel") && (!CAT.services[st.service] || CAT.services[st.service].staffOnly)) {
        st.service = null; st.kind = null; st.steps = M.stepsFor(null); st.step = 0; st.note = "Pick the service you need.";
      }
      if (st.product) { var keep = st.add; this.seedProduct(); st.add = keep; }
      this.syncLocation();
      // A set opened before the catalogue landed: online set requests not
      // open (or the catalogue unreachable) -> the call screen, no POST.
      if (this.setGate()) return;
      if (!st.done && !st.sending) { this.renderBody(); this.renderSum(); this.renderFoot(); }
    };

    // ── Tires only (collection cards) ─────────────────────────────────
    // Never Shopify's own error text (it can quote a stock count): one fixed
    // line with the shop phone.
    B.cartFail = function () {
      var loc = this.loc();
      return "We couldn’t add that to your cart. Please try again, or call " + shortName(loc) + " at " + (loc.phone || SW.phone) + ".";
    };
    B.cartOnly = function (btn) {
      var p = this.st.product, q = this.st.qty, self = this;
      if (this.st.set) { this.setCartOnly(btn); return; }
      btn.disabled = true; btn.textContent = "Adding…";
      win.fetch("/cart/add.js", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ id: p.variantId, quantity: q }) })
        .then(function (r) { if (!r.ok) throw new Error("cart"); win.location.href = "/cart"; })
        .catch(function () { btn.disabled = false; btn.textContent = "Just the tires? Add to cart"; win.alert(self.cartFail()); });
    };
    // The set's "Add the set to cart" (hidden while SET_CART is false, until
    // the cart groups a set's lines - plan stage 8/9): the ONE shared helper
    // window.PTSetCart.add(front, rear) (items[] with Position/_set and
    // rollback, results JS). Without it, the fixed message.
    B.setCartOnly = function (btn) {
      var st = this.st, self = this;
      var F = st.lines[0].product, R = st.lines[1].product;
      var helper = win.PTSetCart && typeof win.PTSetCart.add === "function" ? win.PTSetCart : null;
      if (!helper) { win.alert(this.cartFail()); return; }
      btn.disabled = true; btn.textContent = "Adding…";
      var undo = function () { btn.disabled = false; btn.textContent = "Just the tires? Add the set to cart"; win.alert(self.cartFail()); };
      try {
        Promise.resolve(helper.add({ variantId: F.variantId, qty: st.lines[0].qty, title: F.tireName }, { variantId: R.variantId, qty: st.lines[1].qty, title: R.tireName }))
          .then(function (ok) { track("set_cart_add", { ok: ok !== false }); if (ok === false) undo(); else win.location.href = "/cart"; }, function () { track("set_cart_add", { ok: false }); undo(); });
      } catch (e) { undo(); }
    };

    // ── Send (/api/book or the package adapter) ───────────────────────
    B.readForm = function () {
      var st = this.st, f = this.bodyEl;
      f.querySelectorAll("[data-ptb-c]").forEach(function (i) { var k = i.getAttribute("data-ptb-c"); if (k === "notes") st.notes = i.value.trim(); else st.contact[k] = i.value.trim(); });
      f.querySelectorAll("[data-ptb-v]").forEach(function (i) { st.veh[i.getAttribute("data-ptb-v")] = i.value.trim(); });
      f.querySelectorAll("[data-ptb-q]").forEach(function (i) { st.qTyped = st.qTyped || {}; st.qTyped[i.getAttribute("data-ptb-q")] = i.value.trim(); });
      var hp = f.querySelector("[data-ptb-hp]"); st.hp = hp ? String(hp.value || "") : "";
      var ack = f.querySelector("[data-ptb-ack]"); if (ack) st.ack = ack.checked;
    };
    B.validate = function (emailRequired, strictPhone) {
      var st = this.st, e = M.validateContact(st.contact, emailRequired, strictPhone), msgs = [], first = null, self = this;
      var mark = function (k, bad) { var i = self.bodyEl.querySelector('[data-ptb-c="' + k + '"]'); if (i) { if (bad) { i.setAttribute("aria-invalid", "true"); if (!first) first = i; } else i.removeAttribute("aria-invalid"); } };
      mark("name", e.nameMissing || e.name); mark("phone", e.phoneMissing || e.phone); mark("email", e.emailMissing || e.email);
      if (e.missing) msgs.push(e.missing);
      else { if (e.name) msgs.push(e.name); if (e.phone) msgs.push(e.phone); if (e.email) msgs.push(e.email); }
      if (!e.missing && e.phone && msgs.indexOf(e.phone) < 0) msgs.push(e.phone);
      if (st.kind !== "package" && st.kind !== "package_quote") {
        var vi = function (k) { return self.bodyEl.querySelector('[data-ptb-v="' + k + '"]'); };
        if (!M.validYear(st.veh.year)) { msgs.push("Please enter the year as 4 digits (e.g. 2019), or leave it blank."); st.accCar = true; var y = vi("year"); if (y) { y.setAttribute("aria-invalid", "true"); first = first || y; } }
        if (num(M.parseKm(st.veh.odo)) === false && M.parseKm(st.veh.odo) !== null) { msgs.push("Please enter the mileage as a whole number of km (e.g. 84,500), or leave it blank."); st.accCar = true; var o = vi("odo"); if (o) { o.setAttribute("aria-invalid", "true"); first = first || o; } }
      }
      if ((st.kind === "own_tires" || st.kind === "swap") && !st.ack) msgs.push("Please tick the box to confirm you’ve checked the tread and date code.");
      return { ok: !msgs.length, msg: msgs.join(" "), first: first };
    };
    B.fail = function (msg, to, first) {
      var st = this.st;
      st.sending = false; st.error = msg; st.tried = true;
      if (to) { var i = st.steps.indexOf(to); if (i > -1) { if (to === "time") st.time = null; this.go(i); st.error = msg; this.renderFoot(); this.liveSay(msg); return; } }
      if (this.stepName() === "you") {
        var hadCar = st.accCar;
        this.renderBody(); this.renderSum();
        if (!hadCar && st.accCar) { /* opened to show the field */ }
      }
      this.renderFoot();
      this.liveSay(msg);
      if (first) { var el = this.bodyEl.querySelector('[data-ptb-c="' + first.getAttribute("data-ptb-c") + '"]') || this.bodyEl.querySelector('[data-ptb-v="' + first.getAttribute("data-ptb-v") + '"]'); if (el) try { el.focus(); } catch (e) {} }
      else if (st.tried && (st.kind === "own_tires" || st.kind === "swap") && !st.ack) { var a = this.bodyEl.querySelector("[data-ptb-ack]"); if (a) { try { a.focus(); a.scrollIntoView({ block: "center" }); } catch (e) {} } }
    };
    B.send = function () {
      var st = this.st, self = this;
      if (st.sending || st.waitCat) return;
      this.readForm();
      if (st.set) {
        // The main guard against a half-booked set: POST only when the live
        // catalogue (re-checked now) says the server takes the rear line,
        // and only for a set that still passes setCheck.
        if (!catLoaded) { st.waitCat = true; loadCatalog().then(function () { st.waitCat = false; if (self.st === st) self.send(); }); return; }
        if (!setsOpen()) { this.setCall("closed"); this.render(); return; }
        var sc = M.setCheck({ lines: st.lines }) || M.setCatCheck(st, CAT);
        if (sc) { this.setCall(sc); this.render(); return; }
      }
      if (M.asksOldTires(st) && !st.oldTires) { var di = st.steps.indexOf("details"); st.tried = true; if (di > -1) { this.go(di); st.tried = true; st.error = "Please choose what we should do with your old tires."; this.renderBody(); this.renderFoot(); } return; }
      if (st.kind === "package") return this.sendPackage();
      var v = this.validate(true);
      if (!v.ok) { this.fail(v.msg, null, v.first); return; }
      if (!st.date || (!st.time && !M.isDropOff(st))) { this.fail("Please pick a day and time before sending your request.", "time"); return; }
      this.autoTier();
      st.sending = true; st.error = ""; this.renderFoot();
      var body = M.bookBody(st, CAT);
      // Live 2026-11-17 (#466): ?ref=muse / ?ref=marketplace tags the booking.
      try { var ptRef = Core() && Core().bookingRef ? Core().bookingRef() : null; if (ptRef) body.ref = ptRef; } catch (e) {}
      var loc = this.loc(), phone = loc.phone || SW.phone;
      if (st.set) track("submit_booking", { service: body.serviceId || "installation_off", vehicle: st.vehicle, kind: st.kind, set: "staggered" });
      else track("submit_booking", { service: body.serviceId || "installation_off", vehicle: st.vehicle, kind: st.kind });
      var res;
      win.fetch(M.BOOK_API, { method: "POST", mode: "cors", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { res = r; return r.json().catch(function () { return {}; }); }, function () { res = { status: 0, ok: false }; return {}; })
        .then(function (data) {
          if (!res.ok) {
            var e = M.errorFor(res.status, data, st.set ? { phone: phone, shopName: shortName(loc), unit: "tire", set: true } : { phone: phone, shopName: shortName(loc), unit: st.kind === "product_wheel" ? "wheel" : "tire" });
            if (e.dropFull && st.date) st.dropFull[st.location + "|" + st.date] = true;
            if (st.set) track("booking_error", { error: res.status + "", set: "staggered", code: e.code || "" });
            else track("booking_error", { error: res.status + "" });
            // A set the server will not take online: the call screen.
            if (st.set && e.call && e.code && /^set_/.test(e.code)) { self.setCall(e.code === "set_unavailable" ? "closed" : e.code); self.render(); return; }
            self.fail(e.msg, e.to);
            return;
          }
          self.done(body, data || {});
        });
    };
    B.done = function (body, data) {
      var st = this.st, loc = this.loc(), nap = Core() && Core().napOf ? Core().napOf(loc) : { address: loc.address, addressFull: loc.address_full, phone: loc.phone };
      try {
        if (data.lookupToken && st.contact.email) lsSet("pt-book-token-" + st.contact.email.toLowerCase(), data.lookupToken);
        lsSet("pt-booking-contact", JSON.stringify({ name: st.contact.name, phone: st.contact.phone, email: st.contact.email, savedAt: new Date().toISOString() }));
        lsSet("pt-booking-vehicle", st.vehicle);
        if ((st.kind === "product_tire" || st.kind === "product_wheel") && !st.set) lsSet("pt-booking-qty", String(st.qty));
      } catch (e) {}
      var drop = M.isDropOff(st), d = M.parseISO(st.date), shop = shortName(loc), str = street(loc);
      // A set is ALWAYS a request (SPEC): never "You're booked", whatever the answer says.
      var confirmed = !st.set && data.autoConfirmed === true && !drop;
      var isProd = st.kind === "product_tire" || st.kind === "product_wheel";
      var svcName = isProd ? (st.kind === "product_wheel" ? "Wheel installation" : "Tire installation") : M.serviceName(st.service, CAT);
      var when = M.shortDay(d) + " at " + st.time;
      var title, lines;
      if (drop) { title = "Drop-off requested"; lines = ["Drop-off requested for " + M.longDay(d) + " at Prince Tires " + shop + ". Bring your car any time we’re open that day; we’ll text you when it’s ready.", "It isn’t booked yet: we’ll confirm " + CONFIRM_BY + ", usually within the day."]; }
      else if (confirmed) { title = "You’re booked"; lines = ["Confirmed for " + when + " at Prince Tires " + shop + ", " + str + ". We’ve sent the details by text and email."]; }
      else { title = "Request sent"; lines = ["We have your request for " + when + " at Prince Tires " + shop + ", " + str + ".", "It isn’t booked yet. We’ll confirm " + CONFIRM_BY + ", usually within the day. If that time doesn’t work, we’ll suggest another."]; }
      var rows = [];
      if (st.set && st.lines) {
        rows.push({ k: "What", v: "Staggered set, installed" });
        st.lines.forEach(function (l) { rows.push({ k: l.position === "rear" ? "Rear" : "Front", v: l.qty + " × " + l.product.tireName + " (" + l.product.tireSize + ")" }); });
      } else {
        rows.push({ k: "What", v: isProd ? st.qty + " " + (st.kind === "product_wheel" ? "wheel" : "tire") + (st.qty === 1 ? "" : "s") + ", installed" : svcName });
      }
      rows.push({ k: "When", v: drop ? "Drop-off, " + M.longDay(d) : M.longDay(d) + ", " + st.time });
      rows.push({ k: "Where", html: esc(nap.addressFull || nap.address) + ' · <a href="' + telHref(loc) + '">' + esc(loc.phone || SW.phone) + "</a>" });
      var vl = [st.veh.year, st.veh.make, st.veh.model, M.bookTrim(st)].filter(Boolean).join(" ");
      rows.push({ k: "Vehicle", v: vl || M.vehicleName(st.vehicle) });
      var km = M.parseKm(st.veh.odo);
      if (num(km)) rows.push({ k: "Mileage", v: String(km).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " km" });
      if (M.asksOldTires(st) && st.oldTires) rows.push({ k: "Old tires", v: st.oldTires === "keep" ? "Taking them home" : "Scrapped and recycled (not stored)" });
      var saved = data.pricing && num(data.pricing.total) ? data.pricing : null;
      // A set the server did not save with its rear line: its total may be
      // the front tires only - show the set total this page priced instead.
      if (st.set && !(data.set && data.set.saved === true)) saved = null;
      if (saved) rows.push({ k: "Estimated total (incl. GST)", v: M.money(Math.round(saved.total * 100)), total: true });
      else if (num(body.total)) rows.push({ k: "Estimated total (incl. GST)", v: M.money(Math.round(body.total * 100)), total: true });
      var setOk = true;
      if (st.set) {
        // The server prices a set itself; its total above is the one that counts.
        if (saved && num(body.total) && Math.abs(saved.total - body.total) >= 0.005) rows.push({ k: "", v: "Total updated to today’s prices for your set." });
        // The 201 echo: a server that did not save the rear line (deploy
        // mistake) - staff will confirm the rear tires by phone.
        setOk = !!(data.set && data.set.saved === true);
        if (!setOk) rows.push({ k: "", v: "We’ll confirm your rear tires when we contact you." });
      } else {
        if (saved && !saved.repriced && num(body.total) && Math.abs(saved.total - body.total) >= 0.005) rows.push({ k: "", v: "Total updated for your vehicle and tire." });
        if (saved && saved.repriced && M.isVehicle(saved.vehicleType)) rows.push({ k: "", v: "Priced as " + M.vehicleName(saved.vehicleType) + " for your vehicle and tire size." });
      }
      var dur = isProd ? Math.ceil(st.qty * 0.5) * 60 : ((CAT.services[st.service] && CAT.services[st.service].durationMinutes) || 60);
      var icsTitle = drop ? "Requested: tire drop-off at Prince Tires" : (confirmed ? "" : "Requested: ") + svcName + " at Prince Tires";
      var ics = Core() && Core().buildICS ? (drop
        ? Core().buildICS({ dateISO: st.date, allDay: true, summary: icsTitle, description: svcName + ": requested. Not final until Prince Tires confirms. Bring your car any time we’re open; we’ll text you when it’s ready.", location: nap.addressFull })
        : Core().buildICS({ dateISO: st.date, time: st.time, durationMinutes: dur, summary: icsTitle, description: confirmed ? svcName + ": confirmed." : svcName + ": requested. Not final until Prince Tires confirms.", location: nap.addressFull })) : null;
      st.done = { title: title, lines: lines, rows: rows, ics: ics, icsTitle: icsTitle, confirmed: confirmed, shopName: shop, shopPhone: loc.phone || SW.phone, tel: telHref(loc) };
      st.sending = false;
      this.clearDraft();
      if (st.set) {
        track("booking_success", { service: body.serviceId || "installation_off", vehicle: st.vehicle, date: st.date, kind: st.kind, autoConfirmed: confirmed, set: "staggered" });
        if (!setOk) track("booking_set_unconfirmed", {});
      } else {
        track("booking_success", { service: body.serviceId || "installation_off", vehicle: st.vehicle, date: st.date, kind: st.kind, autoConfirmed: confirmed });
      }
      this.render();
      var h = this.bodyEl.querySelector(".rd-sheet__h"); if (h) try { h.focus(); } catch (e) {}
      if (this.mode === "sheet") { try { win.history.replaceState({ ptb: this.id, step: "done" }, ""); } catch (e) {} }
    };
    B.ics = function () {
      var d = this.st.done;
      if (d && d.ics && Core() && Core().downloadICS) Core().downloadICS(d.ics, "prince-tires-request.ics");
    };

    // ── Package (adapter from pt-package-builder.js) ──────────────────
    B.loadPackageQuote = function () {
      var st = this.st, self = this, a = st.pkg;
      st.quoteState = "loading";
      st.requestId = a.newRequestId ? a.newRequestId() : String(Date.now());
      Promise.resolve(a.quote()).then(function (q) {
        if (st !== self.st) return;
        if (!q) { st.quoteState = "error"; st.quoteError = a.unavailableReason ? a.unavailableReason() : "We couldn’t check today’s price."; }
        else { st.quote = q; st.quoteState = "ok"; st.lockedAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
        st.date = null; self.enterTime();
        self.render();
      });
    };
    B.sendPackage = function () {
      var st = this.st, self = this, a = st.pkg;
      var v = this.validate(true, true);
      if (!v.ok) { this.fail(v.msg, null, v.first); return; }
      var drop = M.isDropOff(st);
      if (!st.date || (!drop && !st.time)) { this.fail("Pick a time.", "time"); return; }
      if (!st.quote) return;
      st.sending = true; st.error = ""; this.renderFoot();
      var body = M.packageInstallBody({ selection: a.selection(), name: st.contact.name, phone: st.contact.phone, email: st.contact.email, date: st.date, time: st.time, drop: drop, notes: st.notes, quote: st.quote, hp: st.hp, elapsedMs: a.nowMs ? a.nowMs() : 0, requestId: st.requestId });
      st.requestId = body.requestId;
      Promise.resolve(a.send(body)).then(function (r) {
        st.sending = false;
        var d = (r && r.data) || {};
        var phone = a.shopPhone(), shop = a.shopName();
        if (r && r.ok) {
          var dd = M.parseISO(st.date);
          var when = drop ? M.longDay(dd) : M.shortDay(dd) + ", " + st.time;
          var lines = drop
            ? ["Drop-off requested for " + M.longDay(dd) + " at Prince Tires " + shop + ". Bring your car any time we’re open that day; we’ll text you when it’s ready.", "It isn’t booked yet: we’ll text you to confirm."]
            : [when + " at " + shop + ", " + a.shopAddress() + "."];
          if (d.fitCheck || (st.quote && st.quote.verdict === "fit_check")) lines.push("Our " + shop + " manager checks fit on your " + a.vehicleModel() + " before anything is mounted. The price won’t change.");
          lines.push(drop ? "You pay at the shop." : "We’ll text you to confirm your time. You pay at the shop.");
          var icsTitle = drop ? "Requested: wheel & tire package drop-off at Prince Tires" : "Requested: wheel & tire package at Prince Tires";
          var core = Core(), ics = null;
          try {
            if (core && core.buildICS) ics = drop
              ? core.buildICS({ dateISO: st.date, allDay: true, summary: icsTitle, description: "Wheel & tire package: requested. Not final until Prince Tires confirms.", location: a.shopAddress() })
              : core.buildICS({ dateISO: st.date, time: st.time, durationMinutes: (a.durationMinutes && a.durationMinutes()) || 60, summary: icsTitle, description: "Wheel & tire package: requested. Not final until Prince Tires confirms.", location: a.shopAddress() });
          } catch (e) {}
          st.done = { title: drop ? "Drop-off requested" : "Request sent", lines: lines, ics: ics, icsTitle: icsTitle, shopName: shop, shopPhone: phone, tel: "tel:" + a.shopPhoneHref(),
            rows: [{ k: "What", v: "Wheel & tire package" }, { k: "When", v: drop ? "Drop-off, " + M.longDay(dd) : when }, { k: "Estimated total (incl. GST)", v: M.money(st.quote.totalCents), total: true }] };
          if (a.track) a.track("pkg_request_ok", { mode: "install", fitCheck: !!d.fitCheck, total: st.quote.totalCents });
          if (a.onDone) try { a.onDone(d); } catch (e) {}
          self.render();
          return;
        }
        if (r && r.status === 409 && d.quote) {
          if (d.error === "price_changed") {
            st.conflict = { kind: "price", from: st.quote.totalCents, to: d.quote.totalCents }; st.conflictQuote = d.quote;
            if (a.track) a.track("pkg_price_changed", { from: st.quote.totalCents, to: d.quote.totalCents });
          } else {
            var lbl = d.item === "wheel" ? "Your wheels" : d.item === "tire" ? "Your tires" : "An item in your package";
            var rb = (d.quote.readyBy || {})[a.shop()];
            st.conflict = { kind: "stock", itemLabel: lbl, ready: rb && rb.dateISO ? M.shortDay(M.parseISO(rb.dateISO)) + (rb.time ? ", " + rb.time : "") : "" };
            st.quote = d.quote; st.date = null;
          }
          if (a.onConflict) a.onConflict(d);
          self.renderBody(); self.renderSum(); self.renderFoot();
          return;
        }
        if (r && r.status === 409 && d.unavailable) {
          if (a.onUnavailable) a.onUnavailable(d);
          self.fail((d.unavailable.reason ? String(d.unavailable.reason).replace(/in stock/gi, "available") : "One of your items can’t be supplied as a set of 4 any more.") + " Call " + shop + " at " + phone + ".");
          return;
        }
        if (r && r.status === 429) { self.fail("Too many requests from this device. Please wait a minute and try again."); return; }
        if (r && r.status >= 400 && r.status < 500 && d.error) {
          if (drop && r.status === 400 && /drop-offs are full/i.test(String(d.error))) { st.dropFull[a.shop() + "|" + st.date] = true; self.fail(String(d.error), "time"); return; }
          self.fail(String(d.error)); return;
        }
        if (!r || r.status === 0) { self.fail("We may have your request. Check your email and texts; if nothing arrives in a few minutes, call " + shop + " at " + phone + "."); return; }
        self.fail("Online requests are not working right now. Please call " + shop + " at " + phone + ".");
      });
    };
    B.sendQuote = function () {
      var st = this.st, self = this, a = st.pkg;
      this.readForm();
      var e = M.validateContact(st.contact, false, true);
      var msg = e.missing || e.name || e.phone || e.email;
      if (msg) { this.fail(msg); return; }
      var info = a.info ? a.info() : {};
      st.sending = true; st.error = ""; this.renderFoot();
      var body = M.packageQuoteBody({
        vehicle: M.quoteVehicle(info.vehicleRef, st.qTyped || {}, info.S), vehicleType: info.vehicleType, lift: info.lift, liftInches: info.liftInches,
        shop: st.location, hints: info.hints, scopeReasons: info.scopeReasons, name: st.contact.name, phone: st.contact.phone, email: st.contact.email,
        notes: st.notes, hp: st.hp, elapsedMs: a.nowMs ? a.nowMs() : 0
      });
      if (a.track) a.track("pkg_request", { mode: "quote" });
      Promise.resolve(a.send(body)).then(function (r) {
        st.sending = false;
        var sh = (a.shops || {})[st.location] || (a.shops || {}).sw || { name: "42 Ave SW", phone: SW.phone, phoneHref: SW.phone_href };
        if (r && r.ok) {
          if (a.track) a.track("pkg_request_ok", { mode: "quote" });
          st.done = { title: "Request sent", lines: ["We’ll text you package options with installed prices.", "Questions in the meantime? Call " + sh.name + " at " + sh.phone + "."], rows: [], shopName: sh.name, shopPhone: sh.phone, tel: "tel:" + sh.phoneHref };
          self.render();
          return;
        }
        if (r && r.status === 429) { self.fail("Too many requests from this device. Please wait a minute and try again."); return; }
        if (r && r.status >= 400 && r.status < 500 && r.data && r.data.error) { self.fail(String(r.data.error)); return; }
        self.fail("We couldn’t send that. Call " + sh.name + " at " + sh.phone + ".");
      });
    };

    // ── Draft autosave (sessionStorage, 24 h, page only) ───────────────
    var DRAFT_KEY = "pt-booking-draft-v2";
    B.saveDraft = function () {
      // Page mode, or the sheet when the booking page opened it (pageFlow).
      if (!this.st || this.st.done || !(this.mode === "page" || (this.st.ctx && this.st.ctx.pageFlow))) return;
      var st = this.st;
      // A tile opened on the page with nothing picked yet must not wipe the
      // saved "Pick up where you left off" request (only Start over does).
      if (this.mode === "sheet" && !st.service) return;
      try {
        ssSet(DRAFT_KEY, JSON.stringify({ v: 2, savedAt: Date.now(), key: (st.kind || "menu") + "|" + (st.service || ""), step: st.steps[st.step],
          s: { path: st.path, kind: st.kind, service: st.service, vehicle: st.vehicle, vehiclePicked: st.vehiclePicked, qty: st.qty, qtyByHand: st.qtyByHand, tireSize: st.tireSize, oldTires: st.oldTires, add: st.add, location: st.location, visit: st.visit, date: st.date, time: st.time, contact: st.contact, veh: st.veh, notes: st.notes,
            vehMode: st.vehMode, ymm: st.ymm, picked: st.picked, ymmSizes: st.ymmSizes, ymmSize: st.ymmSize, ymmType: st.ymmType } }));
      } catch (e) {}
    };
    B.saveDraftSoon = function () { var self = this; clearTimeout(this._dt); this._dt = setTimeout(function () { self.saveDraft(); }, 500); };
    B.clearDraft = function () { ssDel(DRAFT_KEY); ssDel("pt-booking-draft-v1"); };
    B.restoreDraft = function () {
      var raw = ssGet(DRAFT_KEY), st = this.st, d = null;
      try { d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; }
      if (d && (d.v !== 2 || Date.now() - (d.savedAt || 0) > 24 * 3600 * 1000)) { ssDel(DRAFT_KEY); d = null; }
      if (!d) {
        // A draft from the old booking page (v1): carry its choices over.
        try { var o = JSON.parse(ssGet("pt-booking-draft-v1") || "null"); if (o && o.v === 1 && Date.now() - (o.savedAt || 0) < 24 * 3600 * 1000 && o.state) {
          var s1 = o.state, c1 = o.contact || {};
          d = { s: { path: s1.pathway === "other" ? "svc" : s1.pathway, service: s1.service, kind: s1.service ? M.kindForService(s1.service) : null, vehicle: s1.vehicle, qty: s1.qty, qtyByHand: s1.qtyByHand, oldTires: s1.oldTires || null, add: s1.addons && s1.addons.roadForce ? { addon_road_force: true } : {}, location: s1.locationId, contact: { name: c1.name, phone: c1.phone, email: c1.email }, veh: { year: c1.vehYear || "", make: c1.vehMake || "", model: c1.vehModel || "", odo: c1.odometer || "" }, notes: c1.notes || "" }, step: ["service", "details", "time", "you"][Math.max(0, Math.min(3, (o.step || 1) - 1))] };
          if (s1.addons) { if (s1.addons.tpms) d.s.add.tpms = true; if (s1.addons.lowProfile) d.s.add.lowProfile = true; }
        } } catch (e) {}
      }
      if (!d || !d.s) return false;
      var s = d.s;
      if (s.service && CAT.services[s.service] && !CAT.services[s.service].staffOnly) { st.service = s.service; st.kind = M.kindForService(s.service); st.steps = M.stepsFor(st.kind, st.service, true); }
      st.path = s.path || (st.kind === "own_tires" || st.kind === "swap" ? "own" : st.kind ? "svc" : null);
      if (M.isVehicle(s.vehicle)) st.vehicle = s.vehicle;
      st.vehiclePicked = !!s.vehiclePicked;
      if (s.qty >= 1 && s.qty <= 8) st.qty = s.qty;
      st.qtyByHand = !!s.qtyByHand;
      st.tireSize = s.tireSize || st.tireSize;
      st.oldTires = s.oldTires === "keep" || s.oldTires === "dispose" ? s.oldTires : null;
      st.add = s.add || {};
      if (s.location && locs().bookable.some(function (l) { return l.slug === s.location; })) st.location = s.location;
      st.visit = "wait";
      var today = M.localISO(new Date());
      if (s.date && s.date >= today) { st.date = s.date; st.time = s.time || null; st.wk = this.weekOffset(M.parseISO(st.date)); }
      ["name", "phone", "email"].forEach(function (k) { if (s.contact && s.contact[k] && !st.contact[k]) st.contact[k] = s.contact[k]; });
      if (s.veh) ["year", "make", "model", "odo"].forEach(function (k) { if (s.veh[k] && !st.veh[k]) st.veh[k] = s.veh[k]; });
      st.notes = s.notes || "";
      // The Year / Make / Model / Trim pick, so the dropdowns show it again.
      st.vehMode = s.vehMode === "type" ? "type" : "ymm";
      if (s.ymm && typeof s.ymm === "object" && /^\d{4}$/.test(String(s.ymm.y || ""))) {
        st.ymm = { y: String(s.ymm.y), mk: String(s.ymm.mk || ""), md: String(s.ymm.md || ""), tr: String(s.ymm.tr || "") };
        if (s.picked && s.picked.model) st.picked = { model: String(s.picked.model), trim: String(s.picked.trim || "") };
        if (Array.isArray(s.ymmSizes) && st.ymm.tr) { st.ymmSizes = s.ymmSizes.map(String).slice(0, 40); st.ymmSize = String(s.ymmSize || ""); st.ymmType = String(s.ymmType || ""); }
      }
      this.syncLocation();
      var idx = st.steps.indexOf(d.step);
      return idx > 0 ? idx : 0;
    };

    // ── Page mode (/pages/booking) ─────────────────────────────────────
    B.mountPage = function (ctx) {
      this.reset(ctx);
      var at = 0;
      var deep = !!(ctx.service);
      if (!deep) at = this.restoreDraft() || 0;
      if (deep && this.st.kind) { this.st.steps = M.stepsFor(this.st.kind, this.st.service, false); }
      track("open_booking_modal", { source: deep ? "deep_link" : "page", kind: this.st.kind || "menu" });
      this.go(at, { first: true });
    };

    // ══════════════════════════════════════════════════════════════════
    // "Request this day" (call-back request) - any host
    // ══════════════════════════════════════════════════════════════════
    function renderCallback(host, o) {
      if (!host || !o || !o.dateISO) return;
      var url = String(o.apiBase || M.AVAIL_API).replace(/\/availability\/?$/, "/appointment-request");
      var p = o.prefill || {}, id = "ptbcb" + (++uid);
      var day = o.dateLabel || (function () { var d = M.parseISO(o.dateISO); return d ? M.shortDay(d) : o.dateISO; })();
      host.innerHTML =
        '<div class="ptb-cb rd" role="region" aria-labelledby="' + id + '-t">' +
        '<h3 class="ptb-cb__t" id="' + id + '-t">' + esc(day) + " is fully booked</h3>" +
        '<p class="ptb-cb__lead">Leave your number and we’ll call you to fit you in, or pick another day.</p>' +
        '<form class="ptb-cb__form" novalidate>' +
        field(id + "-n", "Name", '<input id="' + id + '-n" name="name" autocomplete="name" required maxlength="120" placeholder="Jane Smith" value="' + esc(p.name) + '">') +
        field(id + "-p", "Mobile number", '<input id="' + id + '-p" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="40" placeholder="(403) 555-0123" value="' + esc(p.phone) + '">') +
        field(id + "-e", "Email <span class=\"ptb-opt-t\">(optional)</span>", '<input id="' + id + '-e" name="email" type="email" inputmode="email" autocomplete="email" maxlength="200" value="' + esc(p.email) + '">') +
        field(id + "-w", "When works best? <span class=\"ptb-opt-t\">(optional)</span>", '<input id="' + id + '-w" name="preferredTime" maxlength="120" placeholder="e.g. after 2 PM">') +
        field(id + "-x", "Anything else? <span class=\"ptb-opt-t\">(optional)</span>", '<textarea id="' + id + '-x" name="notes" rows="2" maxlength="2000"></textarea>', "ptb-span") +
        '<p class="rd-field__error ptb-span" aria-live="polite" data-cb-err></p>' +
        '<button type="submit" class="rd-btn rd-btn--primary rd-btn--block ptb-span" data-cb-btn>Request ' + esc(day) + "</button>" +
        '<p class="ptb-muted ptb-span">This isn’t an appointment yet. We’ll call you to set a time.</p>' +
        "</form></div>";
      var form = host.querySelector("form"), err = host.querySelector("[data-cb-err]"), btn = host.querySelector("[data-cb-btn]");
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var f = form.elements;
        var name = String(f.name.value || "").trim(), phone = String(f.phone.value || "").trim();
        if (!name) { err.textContent = "Please tell us your name."; f.name.focus(); return; }
        if (M.phoneDigits(phone).length < 10) { err.textContent = "Please give us a phone number so we can call you back."; f.phone.focus(); return; }
        err.textContent = ""; btn.disabled = true; btn.textContent = "Sending…";
        var payload = M.callbackBody({ dateISO: o.dateISO, name: name, phone: phone, email: f.email.value, preferredTime: f.preferredTime.value, notes: f.notes.value, service: o.service, vehicle: o.vehicle, locationSlug: o.locationSlug });
        var post = Core() && Core().postBooking ? Core().postBooking(url, payload) : win.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j }; }, function () { return { ok: r.ok, status: r.status, data: null }; }); });
        post.then(function (r) {
          if (r.ok) {
            var again = r.data && r.data.duplicate;
            host.innerHTML = '<div class="ptb-cb ptb-cb--done rd" role="status"><span class="ptb-done__ok" aria-hidden="true">' + ico("check", 22) + '</span><div><h3 class="ptb-cb__t">' + (again ? "You’ve already asked for " + esc(day) : "Request sent for " + esc(day)) + '</h3><p class="ptb-cb__lead">We’ll call you at ' + esc(phone) + " to find a time. This isn’t an appointment until we do.</p></div></div>";
            track("callback_request", { date: o.dateISO, duplicate: !!again });
            if (o.onDone) o.onDone();
          } else {
            btn.disabled = false; btn.textContent = "Request " + day;
            err.textContent = (r.status === 429 ? "Too many requests from this device. Please wait a minute and try again." : (r.data && r.data.error) || "That didn’t go through. Please call us instead.");
          }
        }, function () { btn.disabled = false; btn.textContent = "Request " + day; err.textContent = "That didn’t go through. Please call us instead."; });
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // Public API
    // ══════════════════════════════════════════════════════════════════
    var sheet = null, lastOpen = 0;
    function sheetInst() { if (!sheet) sheet = new Book("sheet"); return sheet; }
    function soldOutNotice(p) {
      var L = locs(), slug = lsGet("pt-booking-location"), c = Core();
      var l = (c && c.pickLocation ? c.pickLocation(L.bookable, slug) : null) || SW;
      win.alert("This one is sold out, so there is nothing to book yet.\n\nCall " + shortName(l) + " at " + (l.phone || SW.phone) + " and we’ll tell you what we can get in.");
      void p;
    }
    var API = {
      __real: true,
      model: M,
      open: function (ctx) {
        ctx = ctx || {};
        if (Date.now() - lastOpen < 400 && sheet && !sheet.el.hidden) return;
        lastOpen = Date.now();
        // A set (button or PTBook.open({set})): qty fixed, checked here; a
        // sold-out tire in it gets the set's call screen, not the alert.
        if (Object.prototype.hasOwnProperty.call(ctx, "set")) ctx = M.setCtx(ctx.set, ctx);
        else if (ctx.product && ctx.product.soldOut) { soldOutNotice(ctx.product); return; }
        loadCatalog();
        sheetInst().open(ctx);
      },
      openFrom: function (btn) { API.open(ctxFrom(btn)); },
      // This form takes staggered sets (PTBook.open({ set: {kind, key, lines} })).
      supportsSets: true,
      close: function () { if (sheet) sheet.close(); },
      mount: function (host, ctx) {
        if (!host) return null;
        loadCatalog();
        var b = new Book(ctx && ctx.mode === "page" ? "page" : "inline", host);
        if (ctx && ctx.mode === "page") b.mountPage(ctx);
        else { b.reset(ctx || {}); if (b.st.kind === "package_quote") { b.st.location = (ctx.pkg && ctx.pkg.shop && ctx.pkg.shop()) || b.st.location; var inf = ctx.pkg && ctx.pkg.info ? ctx.pkg.info() : {}; if (inf.notes) b.st.notes = inf.notes; } b.go(0, { first: true }); }
        return b;
      },
      renderCallback: renderCallback,
      // Same call as the loader stub's: the real form is ready now.
      whenReady: function (ok) { if (typeof ok === "function") ok(); },
      ctxFrom: ctxFrom
    };
    win.PTBook = API;
    win.openBookingModal = function (btn) { if (btn && btn.dataset) API.openFrom(btn); else API.open({}); };
    win.openServiceModal = function (btn) {
      var d = (btn && btn.dataset) || {};
      API.open({ serviceName: d.serviceName || "", service: d.service || "", location: d.location || "", from: d.from || "service_button" });
    };
    win.closeBookingModal = API.close;
    win.closeServiceModal = API.close;
    win.__bkCustomer = win.__bkCustomer || CUSTOMER;

    // Popstate (Android back) goes back one step in the open sheet.
    win.addEventListener("popstate", function (e) { if (sheet) sheet.onPop(e); });
    win.addEventListener("resize", function () { if (sheet && !sheet.el.hidden) { sheet.renderSum(); sheet.renderFoot(); } });

    // Delegated triggers (the stub binds them too; whichever runs first wins).
    if (!win.__ptbDelegated) {
      win.__ptbDelegated = true;
      doc.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-book],[data-book-install],[data-book-service],[data-book-set]");
        if (!b || b.closest(".ptb")) return;
        e.preventDefault();
        API.openFrom(b);
      });
    }

    // ── Booking page (/pages/booking) ───────────────────────────────────
    // Owner 2026-11-14: the page keeps the three choices; picking one opens
    // the booking sheet (the same popup every Book button opens) on that
    // choice, and the whole request happens in there. ?service= deep links
    // open the sheet straight at that job. The page's old inline form
    // (page mode, mountPage) stays in this file for API.mount callers.
    function draftInfo() {
      var d = null;
      try { d = JSON.parse(ssGet(DRAFT_KEY) || "null"); } catch (e) { d = null; }
      if (!d || d.v !== 2 || !d.s || Date.now() - (d.savedAt || 0) > 24 * 3600 * 1000) return null;
      var s = d.s.service, row = s && CAT.services[s];
      if (!row || row.staffOnly) return null;
      return { service: s, step: d.step };
    }
    function pagePathFor(slug) {
      var k = slug ? M.kindForService(slug) : null;
      return k === "own_tires" || k === "swap" ? "own" : "svc";
    }
    function bootPage(host, q) {
      var sh = sheetInst();
      var id = "ptbpick" + (++uid), tilesTop;
      host.innerHTML = '<div class="rd ptb ptb--pick">' +
        '<div class="ptb-pick__top" data-ptb-pick-top></div>' +
        '<div class="ptb-head"><h2 class="rd-sheet__h" id="' + id + '-h">What can we help with?</h2></div>' +
        '<div class="ptb-tiles" role="group" aria-labelledby="' + id + '-h">' + PATHS.map(function (p) {
          return '<button type="button" class="ptb-tile ptb-tile--go" aria-haspopup="dialog" data-ptb-pick="' + p[0] + '"><b>' + p[1] + "</b><span>" + p[2] + '</span><i class="ptb-tile__go" aria-hidden="true">' + ico("chevron", 18) + "</i></button>";
        }).join("") + "</div>" +
        '<p class="ptb-pick__call">' + callLine() + "</p>" +
        "</div>";
      tilesTop = host.querySelector("[data-ptb-pick-top]");
      function tile(p) { return host.querySelector('[data-ptb-pick="' + p + '"]'); }
      // "Pick up where you left off" (the draft the sheet saves) and the
      // home search's "Welcome back" car, above the tiles.
      function paintTop() {
        var h = "", dr = draftInfo(), s = savedSearchVehicle();
        if (dr) {
          h += '<div class="ptb-saved ptb-resume"><p class="ptb-saved__t">Pick up where you left off: ' + esc(M.serviceName(dr.service, CAT)) + '</p><div class="ptb-saved__a">' +
            '<button type="button" class="rd-btn rd-btn--dark" aria-haspopup="dialog" data-ptb-pick="resume">Continue your request</button>' +
            '<button type="button" class="rd-btn rd-btn--text" data-ptb-pick="restart">Start over</button></div></div>';
        }
        if (s && !dr) {
          var label = [s.year, s.make, s.model, s.trim].filter(Boolean).join(" ") || "car";
          var m = /(\d{3})\s*\/?\s*(\d{2})\s*Z?R?\s*(\d{2})/i.exec(String(s.tireSize || ""));
          var url = "/search?q=" + encodeURIComponent(s.tireSize) + "&type=product";
          if (m) {
            url = "/collections/tires?filter.p.m.custom.tire_width=" + m[1] + "&filter.p.m.custom.tire_profile=" + m[2] + "&filter.p.m.custom.rim_diameter=" + m[3];
            if (win.PTRim && win.PTRim.route) { try { url = win.PTRim.route(url); } catch (e) {} }
          }
          h += '<div class="ptb-saved"><p class="ptb-saved__t">Welcome back. Still shopping for your ' + esc(label) + '?</p><div class="ptb-saved__a"><a class="rd-btn rd-btn--line" href="' + esc(url) + '">See tires in ' + esc(s.tireSize) + " →</a>" +
            '<button type="button" class="rd-btn rd-btn--text" aria-haspopup="dialog" data-ptb-pick="saved-own">Installing your own tires? →</button><button type="button" class="rd-btn rd-btn--text" data-ptb-pick="saved-x">Not this car</button></div></div>';
        }
        tilesTop.innerHTML = h;
        tilesTop.hidden = !h;
      }
      paintTop();
      host.addEventListener("click", function (e) {
        var t = e.target.closest && e.target.closest("[data-ptb-pick]");
        if (!t || !host.contains(t)) return;
        var v = t.getAttribute("data-ptb-pick");
        e.preventDefault();
        if (v === "restart") { ssDel(DRAFT_KEY); ssDel("pt-booking-draft-v1"); paintTop(); try { tile("buy").focus(); } catch (er) {} return; }
        if (v === "saved-x") { try { win.localStorage.removeItem("pt-tire-search-vehicle"); } catch (er) {} paintTop(); try { tile("buy").focus(); } catch (er) {} return; }
        var ctx = { from: "page", pageFlow: true, location: q.location, opener: t };
        if (v === "resume") { ctx.resume = true; ctx.opener = tile(pagePathFor(draftInfo() && draftInfo().service)); }
        else if (v === "saved-own") { var ss = savedSearchVehicle() || {}; ctx.path = "own"; ctx.tireSize = ss.tireSize || ""; ctx.vehicle = ss; ctx.opener = tile("own"); }
        else ctx.path = v;
        API.open(ctx);
      });
      // Back on the page: the draft may have changed (or been sent).
      sh.onClosed = paintTop;
      if (!catLoaded) loadCatalog().then(function () { if (sh.el.hidden) paintTop(); });
      // ?service=<slug or alias>: straight to that job (an unknown slug opens
      // step 1 with "Pick the service you need."); ?location= picks the shop.
      if (q.service) {
        // Closing the popup leaves the plain booking page: a reload shows the
        // tiles, not the same popup again. Other params (e.g. a theme
        // preview) stay.
        try {
          var u = new URL(win.location.href);
          u.searchParams.delete("service"); u.searchParams.delete("location");
          win.history.replaceState(win.history.state, "", u.pathname + u.search + u.hash);
        } catch (er) {}
        var slug = M.resolveSlug(q.service, CAT);
        API.open({ service: q.service, location: q.location, from: "deep_link", pageFlow: true, opener: tile(slug ? pagePathFor(slug) : "svc") });
      }
    }

    // Booking page host.
    function boot() {
      var host = doc.querySelector("[data-ptb-page]");
      if (host && !host.__ptb) {
        host.__ptb = true;
        var q = {};
        try { var sp = new URLSearchParams(win.location.search); q.service = sp.get("service") || ""; q.location = sp.get("location") || ""; } catch (e) {}
        loadCatalog();
        bootPage(host, q);
      }
      var Q = win.__ptbQ || [];
      win.__ptbQ = { push: function (fn) { try { fn(); } catch (e) { if (win.console) console.error(e); } } };
      Q.forEach(function (fn) { try { fn(); } catch (e) { if (win.console) console.error(e); } });
    }
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot); else boot();
  };

  return M;
});
