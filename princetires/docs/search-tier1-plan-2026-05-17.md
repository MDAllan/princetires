# Search Tier-1 Improvements — Implementation Plan

> **For agentic workers:** implement task-by-task; each task ends with verification + a push to the live theme. Steps use checkbox (`- [ ]`) syntax for tracking. Do not start Task N+1 until Task N verifies green.

**Goal:** Remove the duplicated tire-size parser, instrument search analytics, give the header search tire intelligence, and add a synonym layer — the four Tier-1 items from `search-audit-2026-05-17.md`.

**Architecture:** A new `assets/pt-tire-parse.js` becomes the single source of truth for tire-size parsing + a search-analytics helper. Every search surface calls it instead of its own copy. The header search form is *enhanced* (intercept submit, not replaced). Synonyms live in the shared module + Shopify's native Search & Discovery app.

**Tech stack:** Shopify Liquid theme (Copy of Dawn, #186307215635), vanilla JS, GTM `dataLayer`, Playwright (`princetires/tests/`), Node scripts in `princetires-app/db/`.

---

## Scope

**In:** R1 size-parser consolidation · R2 search analytics · R3 header search intelligence · R4 synonym layer.
**Out (Tier 2+, separate plan):** vehicle/intent parser consolidation, license-plate lookup, relevance ranking, content search. R1 deliberately consolidates only the **size** parser (the part that drifted and caused bugs) — not the vehicle/intent parsers — to keep regression risk bounded.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `assets/pt-tire-parse.js` | **Create** | Single source of truth: `PTTireParse.parseSize/normalizeSection/sizeFilterParams` + `PTTireParse.track` (dataLayer search events) |
| `layout/theme.liquid` | Modify | Load `pt-tire-parse.js` once, globally, before other search scripts |
| `sections/hero-smart-search.liquid` | Modify | Replace inline `normalizeTireSize`/`normalizeSection` with `PTTireParse`; add `track` calls |
| `sections/pt-collection-grid.liquid` | Modify | Same — replace `normalizeTireSize`/`normSection`/`ptgNormSection`; add `track` calls |
| `snippets/pt-tire-search.liquid` | Modify | Replace `parseSize`/`normalizeSection` with `PTTireParse`; add `track` on submit |
| `snippets/pt-collection-research-strip.liquid` | Modify | Replace inline `parseSize` with `PTTireParse` |
| `snippets/pt-header-search-enhance.liquid` | **Create** | Intercepts the header search form; routes tire queries to the filtered collection |
| `layout/theme.liquid` | Modify | Render `pt-header-search-enhance` |
| `snippets/header-search.liquid` | **Delete** | Dead code — superseded by `pt-header-search-enhance` |
| `tests/parser-shared-module.spec.js` | **Create** | Playwright spec asserting `PTTireParse.parseSize` against a battery of inputs |
| `docs/search-synonyms.md` | **Create** | Synonym-group list for the user to enter in Shopify Search & Discovery |

## Verification model

This theme has no unit-test runner; verification per task is: (a) `node --check` on the extracted JS, (b) `shopify theme push --theme=186307215635 --only=<files> --allow-live --store=prince-tires-5560.myshopify.com --no-color`, (c) Playwright against live `princetires.ca`, (d) the existing `db/audit-*` scripts where relevant. Push + verify after every task; commit when the owner approves.

---

## Task 1: Create the shared parser + analytics module

**Files:** Create `assets/pt-tire-parse.js`, `tests/parser-shared-module.spec.js`; modify `layout/theme.liquid`.

- [ ] **Step 1 — Write `assets/pt-tire-parse.js`** with this exact content:

```js
/* Prince Tires — shared tire-size parser + search analytics.
   Single source of truth. Loaded globally; exposes window.PTTireParse. */
(function (root) {
  'use strict';

  // Flotation section width -> canonical NN.NN  ("12.5"/"1250"/"12.50" -> "12.50")
  function normalizeSection(t) {
    t = String(t).replace(',', '.');
    var n;
    if (t.indexOf('.') !== -1) n = parseFloat(t);
    else if (t.length >= 3) n = parseInt(t, 10) / 100;
    else n = parseInt(t, 10);
    return isNaN(n) ? '' : n.toFixed(2);
  }

  // Parse a tire size from any string.
  // Returns { width, profile, rim, flotation, canonical } or null.
  function parseSize(s) {
    if (!s) return null;
    var up = String(s).toUpperCase();

    // Flotation: 35X12.50R20, 35x1250r20, 33×12.50R20, LT35X12.50R20
    var fl = up.match(/(\d{2})\s*[X×]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*R?\s*(\d{2})/);
    if (fl) {
      var fw = String(+fl[1]), fp = normalizeSection(fl[2]), fr = String(+fl[3]);
      return { width: fw, profile: fp, rim: fr, flotation: true, canonical: fw + 'X' + fp + 'R' + fr };
    }
    // Metric: 225/65R17, P225/65R17, LT265/70R16, 245/35ZR19, 205/55ZRF16
    var m = up.match(/(\d{3})\s*\/?\s*(\d{2,3})\s*[A-Z]{0,2}R[A-Z]?\s*(\d{2})/);
    if (m) {
      var mw = String(+m[1]), mp = String(+m[2]), mr = String(+m[3]);
      return { width: mw, profile: mp, rim: mr, flotation: false, canonical: mw + '/' + mp + 'R' + mr };
    }
    // Compact digits-only: strip separators, then 8-digit flotation or 7-digit metric
    var compact = up.replace(/[\s/\-X×R.]/g, '');
    var fdm = compact.match(/^(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (fdm) {
      var cw = String(+fdm[1]), cp = fdm[2] + '.' + fdm[3], cr = String(+fdm[4]);
      return { width: cw, profile: cp, rim: cr, flotation: true, canonical: cw + 'X' + cp + 'R' + cr };
    }
    var dm = compact.match(/^(?:P|LT|ST)?(\d{3})(\d{2})(\d{2})$/);
    if (dm) {
      var dw = String(+dm[1]), dp = String(+dm[2]), dr = String(+dm[3]);
      return { width: dw, profile: dp, rim: dr, flotation: false, canonical: dw + '/' + dp + 'R' + dr };
    }
    // Spaced metric: "225 55 17"
    var sp = up.match(/(\d{3})\s+(\d{2})\s+(\d{2})/);
    if (sp) {
      var sw = String(+sp[1]), spp = String(+sp[2]), sr = String(+sp[3]);
      return { width: sw, profile: spp, rim: sr, flotation: false, canonical: sw + '/' + spp + 'R' + sr };
    }
    return null;
  }

  // Build Shopify collection size-filter params for a parsed size.
  function sizeFilterParams(parsed) {
    var p = new URLSearchParams();
    if (!parsed) return p;
    if (parsed.width)   p.set('filter.p.m.custom.tire_width', parsed.width);
    if (parsed.profile) p.set('filter.p.m.custom.tire_profile', parsed.profile);
    if (parsed.rim)     p.set('filter.p.m.custom.rim_diameter', parsed.rim);
    return p;
  }

  // Push a standardized search event to GTM's dataLayer. Never throws.
  function track(props) {
    try {
      root.dataLayer = root.dataLayer || [];
      root.dataLayer.push(Object.assign({ event: 'pt_search' }, props || {}));
    } catch (e) { /* analytics must never break a widget */ }
  }

  root.PTTireParse = {
    parseSize: parseSize,
    normalizeSection: normalizeSection,
    sizeFilterParams: sizeFilterParams,
    track: track,
    version: 1
  };
})(window);
```

- [ ] **Step 2 — Verify it parses.** Run `node --check assets/pt-tire-parse.js` → expect no output (pass).

- [ ] **Step 3 — Load it globally.** In `layout/theme.liquid`, in `<head>` (before other scripts), add:

```liquid
<script src="{{ 'pt-tire-parse.js' | asset_url }}" defer="defer"></script>
```

Place it above any existing search-related `<script src>` so `window.PTTireParse` exists when section scripts run. (Section scripts run on `DOMContentLoaded`; a `defer` asset is guaranteed ready by then.)

- [ ] **Step 4 — Write `tests/parser-shared-module.spec.js`** — a Playwright spec that loads any page, then asserts `PTTireParse.parseSize` via `page.evaluate` for: `225/65R17` → metric 225/65/17; `35X12.50R20`, `35x1250r20`, `33×12.50R20`, `30X9.50R15` → flotation; `35125020` → flotation; `225 55 17` → metric spaced; `LT265/70R16` → metric; garbage → `null`.

- [ ] **Step 5 — Push + run the spec.**

```
shopify theme push --theme=186307215635 --only=assets/pt-tire-parse.js --only=layout/theme.liquid --allow-live --store=prince-tires-5560.myshopify.com --no-color
npx playwright test tests/parser-shared-module.spec.js --project=chromium
```
Expected: theme push success; all parser assertions pass.

---

## Task 2: Rewire `hero-smart-search.liquid` to the shared module

**Files:** Modify `sections/hero-smart-search.liquid`.

- [ ] **Step 1 — Replace the parser.** Delete the section's inline `normalizeTireSize(query)` body and replace it with a thin adapter that calls the shared module (keeps the existing return shape its callers expect — `{ width, aspect, rim, size, flotation }`):

```js
normalizeTireSize(query) {
  var p = window.PTTireParse && window.PTTireParse.parseSize(query);
  if (!p) return null;
  return { width: p.width, aspect: p.profile, rim: p.rim, size: p.canonical, flotation: p.flotation };
}
```

Leave `parseSearchIntent`, `tryDirectParse`, `recognizeVehicle`, vehicle lookup, and rendering untouched — Task 1 only owns *size* parsing.

- [ ] **Step 2 — Add analytics.** In `search(query)`, after a size match call `window.PTTireParse.track({ surface: 'homepage', search_query: query, search_type: 'size', search_outcome: 'match' })`; in `handleVehicleQuery` add `search_type: 'vehicle'`; in `showFallback` add `search_outcome: 'no_match'`.

- [ ] **Step 3 — Verify.** Extract the `<script>` block, `node --check`. Push the file. On `princetires.ca`, type `225/65R17`, `35x1250r20`, and `2019 honda civic` into the hero search — confirm suggestions render and route correctly. Confirm `dataLayer` receives `pt_search` events (`window.dataLayer.filter(e=>e.event==='pt_search')`).

---

## Task 3: Rewire `pt-collection-grid.liquid` smart search

**Files:** Modify `sections/pt-collection-grid.liquid`.

- [ ] **Step 1 — Replace the parser.** Replace the section's `normalizeTireSize` body with the same adapter as Task 2 Step 1. Remove the now-unused `normSection` and `ptgNormSection` *only if no other code references them* — grep first; `ptgNormSection` is used by the editable-size handler, so keep it or repoint it to `PTTireParse.normalizeSection`.

- [ ] **Step 2 — Repoint `ptgNormSection`.** Replace its body with `return window.PTTireParse.normalizeSection(t);`.

- [ ] **Step 3 — Add analytics.** In the smart-search `search()` / keydown-submit, add `PTTireParse.track({ surface: 'collection', ... })` mirroring Task 2.

- [ ] **Step 4 — Verify.** `node --check` the extracted `<script>`. Push. On `/collections/tires`, type `35 1250 20` and `225/65R17` in the collection search box — confirm correct redirect. Run `npx playwright test tests/generic-search-routing.spec.js tests/parser-edge-cases.spec.js --project=chromium`.

---

## Task 4: Rewire `pt-tire-search.liquid` + `pt-collection-research-strip.liquid`

**Files:** Modify both snippets.

- [ ] **Step 1 — `pt-tire-search.liquid`.** Replace the inline `parseSize` body with `return window.PTTireParse.parseSize(s);` then adapt callers — the file expects `{width, aspect, rim}`; the shared module returns `{width, profile, rim}`. Add a one-line adapter: `var p = window.PTTireParse.parseSize(s); return p && { width: p.width, aspect: p.profile, rim: p.rim, raw: s, flotation: p.flotation };`. Delete the now-unused inline `normalizeSection`.

- [ ] **Step 2 — `pt-collection-research-strip.liquid`.** Replace its inline `parseSize` (metric-only, used for vehicle OEM sizes) with the shared call, same adapter shape (`{w, a, r}` → map from `{width, profile, rim}`).

- [ ] **Step 3 — Verify.** `node --check` both extracted blocks. Push both. Playwright: `npx playwright test tests/collection-research-strip-v2.spec.js --project=chromium`; manually exercise the booking-page size + vehicle pickers.

---

## Task 5: Header search tire intelligence

**Files:** Create `snippets/pt-header-search-enhance.liquid`; modify `layout/theme.liquid`; delete `snippets/header-search.liquid`.

- [ ] **Step 1 — Identify the live header form.** Inspect the rendered header on `princetires.ca`: the header search is Dawn's predictive search — a `<form action="/search">` inside the header search modal. Record its selector (expected `form[action*="/search"]` within the header / `predictive-search`).

- [ ] **Step 2 — Create `snippets/pt-header-search-enhance.liquid`** — a `{% doc %}`-headed snippet whose script, on `DOMContentLoaded`, finds the header search form and intercepts `submit` (and Enter): read the query, `var p = window.PTTireParse.parseSize(q)`; if `p`, `e.preventDefault()` and redirect to `/collections/tires?` + `PTTireParse.sizeFilterParams(p)`; else let the form submit normally to `/search`. Call `PTTireParse.track({ surface: 'header', ... })` either way. (This is the behavior the dead `header-search.liquid` attempted — now pointed at the shared module and actually wired in.)

- [ ] **Step 3 — Wire it in.** In `layout/theme.liquid`, add `{% render 'pt-header-search-enhance' %}` near the closing `</body>`.

- [ ] **Step 4 — Delete dead code.** `git rm princetires/snippets/header-search.liquid` (confirmed unused — nothing renders it).

- [ ] **Step 5 — Verify.** Push. On `princetires.ca`, open the header search, type `225/65R17` → lands on the filtered collection; type `winter tires` → still goes to normal `/search`; type a brand → routes sensibly. Confirm `pt_search` events fire with `surface: 'header'`.

---

## Task 6: Synonym layer

**Files:** Modify `assets/pt-tire-parse.js` (or the intent parsers); create `docs/search-synonyms.md`.

- [ ] **Step 1 — Parser-side synonyms.** Add a `SYNONYMS` normalization step applied to queries before intent parsing in `hero-smart-search.liquid` and `pt-collection-grid.liquid`'s `parseSearchIntent`/`parseIntent` — e.g. `snow|ice → winter`, `all weather → all-season`, `mud|m/t → mud-terrain`, `rims → wheels`. Keep it a small map; do not over-build.

- [ ] **Step 2 — Native synonyms doc.** Create `docs/search-synonyms.md` listing synonym groups for the owner to enter in **Shopify admin → Search & Discovery → Synonyms** (covers the `/search` results page, which is server-side and outside theme code). Groups: winter/snow/ice; all-season/all season; all-weather/all weather; mud-terrain/mud/MT/M-T; all-terrain/AT/A-T; light truck/LT; rims/wheels.

- [ ] **Step 3 — Verify.** Push. Search "snow tires" and "mud tires" on the homepage — confirm they resolve to the right season/type filters. (The native-synonym step is a manual owner action; the doc is the deliverable.)

---

## Self-review

- **Spec coverage:** R1 → Tasks 1–4. R2 → `track` helper (Task 1) + instrumentation (Tasks 2,3,5). R3 → Task 5. R4 → Task 6. All four Tier-1 items covered.
- **Type consistency:** the shared module returns `{ width, profile, rim, flotation, canonical }`; every rewire (Tasks 2–4) adapts to its file's existing local shape — adapters spelled out per task.
- **Risk:** highest is Tasks 2–4 (regression on a live search surface). Mitigation: one file per task, push + Playwright after each, never batch.

---

## Sequencing

Task 1 → then 2, 3, 4 (independent of each other, all depend on 1) → 5 → 6. Stop and verify between each.
