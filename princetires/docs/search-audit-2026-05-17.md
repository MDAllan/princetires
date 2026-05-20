# Prince Tires — Search Audit &amp; Improvement Plan

**Date:** 2026-05-17
**Scope:** every customer-facing search surface — homepage smart search, collection-page search, the dropdown pickers, the header search, and collection filtering.
**Basis:** full code audit + competitive research — Baymard Institute site-search studies, leading tire-retailer analysis, the Shopify search-app landscape, and 2025–26 AI-search industry reporting.

---

## 1. Verdict

Prince Tires' search is **structurally strong for a tire shop**. It already does what the tire-industry leaders (Tire Rack, SimpleTire, Discount Tire, Kal Tire) do: a dual *"by vehicle / by size"* model, fitment lookup (year/make/model → OEM size), AI-assisted vehicle recognition, and demand capture on failed searches. It is **not broken and not behind the pack**.

The real opportunities are about **consistency, measurement, and reach**:
- it's **fragmented** — five separate copies of the tire-size parser, two unequal "smart search" engines;
- the **header magnifying-glass has no tire intelligence**;
- there's **no license-plate shortcut** (every major tire retailer has one);
- **search is barely measured**, so you can't see what's failing.

**Top 5, in priority order:**
1. Consolidate the 5 duplicated tire-size parsers into one shared module.
2. Instrument search analytics — today you can't see what customers search or what fails.
3. Give the header magnifying-glass the same tire intelligence as the homepage.
4. Add a synonym layer (snow↔winter, rims↔wheels, M/T↔mud-terrain, …).
5. Add license-plate lookup — the lowest-friction way for a customer to find their fit.

---

## 2. Current architecture — 6 search surfaces

| # | Surface | File | What it does |
|---|---|---|---|
| 1 | Homepage hero smart-search | `sections/hero-smart-search.liquid` | Free-text box + autocomplete dropdown. Parses tire sizes, vehicle Y/M/M, brand, season; **AI (Gemini) vehicle recognition** fallback via `app.princetires.ca/api/vehicle-parse`; captures every no-match query to a webhook. Most capable surface. |
| 2 | Collection-page smart-search | inside `sections/pt-collection-grid.liquid` | Free-text box + autocomplete. A **lighter copy** of the homepage logic — **no AI vehicle recognition**. |
| 3 | Collection re-search strip | `snippets/pt-collection-research-strip.liquid` | Size + vehicle dropdown pickers at the top of the tires collection. |
| 4 | Booking tire-search widget | `snippets/pt-tire-search.liquid` | Size + vehicle dropdown pickers on the booking flow. |
| 5 | Header magnifying-glass | Dawn native predictive search | Stock Shopify search — **no tire-specific parsing**. (`snippets/header-search.liquid` exists but is not wired in.) |
| 6 | Collection filtering | `pt-collection-grid.liquid` + `pt-collection-sidebar.liquid` | Shopify URL filters (`filter.p.m.custom.*`) + a custom faceted sidebar. |

**How it works overall:** all paths *parse the query → build a `/collections/tires?filter…` URL → redirect*. The search **filters the catalogue**; it does not run a ranked search index.

---

## 3. What's working — keep it

- **Genuinely smart size parsing** — metric (`225/65R17`) and flotation (`35X12.50R20`), across many messy formats. Ahead of most Shopify stores.
- **Dual vehicle/size model** — matches the tire-industry gold standard.
- **AI vehicle recognition** (homepage) — Gemini parses free-text like "tires for my 2019 F-150", with a safe client-side fallback.
- **Fitment lookup** — year/make/model → OEM size, including staggered front/rear handling.
- **Demand capture** — every failed homepage search is POSTed to the missing-vehicle pipeline. This is genuinely good practice most shops skip.
- **Accessible autocomplete** — keyboard navigation + ARIA on the homepage dropdown.

---

## 4. Gaps — benchmarked against best practice

| # | Gap | Best-practice benchmark | Severity |
|---|---|---|---|
| 1 | **Five-plus duplicated size parsers**, drifting apart | One source of truth | **High** — maintainability |
| 2 | **Two unequal smart-search engines** — homepage has AI vehicle recognition, the collection-page box doesn't | Consistent experience | Medium |
| 3 | **Header search has no tire intelligence** — stock Shopify search | Baymard: the header field is a primary entry point; 96% of leading sites give it real autocomplete | **High** |
| 4 | **Search redirects, doesn't rank** — results = a price-sorted collection | Baymard: best practice ranks by match quality + in-stock + bestseller; 24% of sites fail to default to relevance | Medium |
| 5 | **No license-plate or VIN shortcut** | Tire Rack, Discount Tire, Kal Tire all offer plate and/or VIN lookup — the lowest-friction vehicle entry | Medium-High — conversion |
| 6 | **Partial typo tolerance** — vehicle *makes* get fuzzy-matching; brands &amp; free text don't ("michellin" fails) | Baymard: 56% of search engines fail basic misspellings — and the good ones don't | Medium |
| 7 | **No synonym layer** | Baymard calls synonyms "the most underused lever in e-commerce search" | Medium |
| 8 | **Search is barely measured** — no-match queries are captured, but query volume, zero-result rate, and suggestion click-through are not | Baymard: instrumenting search + fixing the top 10–20 failed queries can *halve* the zero-result rate. Best-in-class zero-result rate is &lt;2%; typical is 10–15% | **High** — it's the prerequisite for everything else |
| 9 | **Zero-results recovery is inconsistent** — homepage has a good fallback; other surfaces weaker; no "did you mean" / relaxed-query | Baymard: 68% of sites dead-end on no-results; the fix is category links, popular products, spelling correction, query persistence | Medium |
| 10 | **Products only** — service pages, FAQ, blog aren't searchable | Customers search "tire rotation", "warranty", "hours" | Low-Medium |

---

## 5. Recommendations — prioritized roadmap

### Tier 1 — Quick wins (low effort, high leverage)

**R1. Consolidate the size parsers into one shared module.**
Today the same tire-size parsing regex lives in `hero-smart-search.liquid`, `pt-collection-grid.liquid`, `pt-tire-search.liquid`, `pt-collection-research-strip.liquid`, and `header-search.liquid` — and they have drifted. (This session, the same flotation bug had to be fixed in 4 files separately.) Move it to one `assets/pt-tire-parse.js` and have every surface import it. Eliminates an entire recurring bug class.

**R2. Instrument search analytics.** GTM is already on the site — push a `dataLayer` event for every search: the query text, what it parsed to (size / vehicle / brand / nothing), whether it dead-ended, and whether a suggestion was clicked. Without this you are flying blind; with it, gap #8's "fix the top 10–20 failing queries" becomes possible.

**R3. Give the header search tire intelligence.** Route the magnifying-glass through the same size/vehicle parser the homepage uses (this is what `header-search.liquid` was clearly intended for — wire it in or fold the logic into the live header). A customer who types `225/65R17` in the header should land on the filtered collection, not a generic Shopify search page.

**R4. Add a synonym layer.** Two places: (a) Shopify's free *Search &amp; Discovery* app for the header/results page, (b) the smart-search parser. Cover snow↔winter, rims↔wheels, mud↔M/T, all-weather↔all-season, etc.

### Tier 2 — Medium projects

**R5. License-plate lookup.** Add a third entry mode beside "by size / by vehicle": enter plate + province → reverse-lookup returns year/make/model → OEM size. The lowest-friction path and it cuts quote errors. Needs a plate→vehicle data provider (e.g. a fitment-data vendor with a plate API).

**R6. Unify the two smart-search engines.** Bring the collection-page search to parity with the homepage (AI vehicle recognition) — ideally by making them one shared component, which also serves R1.

**R7. Consistent zero-results recovery.** Every search that returns nothing should recover the same way: keep the query visible, offer "did you mean", show popular sizes, and surface the missing-vehicle form. Not just the homepage.

**R8. Brand/model typo tolerance.** Extend the Levenshtein fuzzy matching (currently vehicle-makes only) to tire brands and model names.

### Tier 3 — Strategic (evaluate with data)

**R9. Relevance ranking.** Move from "redirect to a price-sorted collection" toward results ranked by match quality, in-stock status, and bestseller signal. This is the biggest change — evaluate once analytics (R2) show whether ranking is actually a pain point.

**R10. Content search** — let search surface service pages / FAQ / blog, not just products.

**R11. Re-evaluate a third-party search app** — only if R2's analytics show general keyword search is a real failing path. See §6.

---

## 6. Should you buy a search app?

**Short answer: not yet.** Your custom search is a genuine asset — it solves the one thing Shopify's native search *can't*: tire fitment lives in **metafields**, and Shopify's native predictive-search **does not index metafields**. Your parser sidesteps that by parsing the query and building metafield-filter URLs directly.

The honest landscape for a ~3,900-product catalogue:
- **Shopify Search &amp; Discovery** (free, first-party) — worth enabling now for **synonyms + filters** (R4). Limits: max 25 filters; no metafield indexing in autocomplete.
- **Boost AI Search &amp; Discovery** (~$29/mo, priced on sales not catalog size), **Searchanise** (~$19/mo), **Rapid Search** (~$19/mo) — all affordable here, all add semantic search, typo tolerance, and metafield-aware autocomplete.
- **Algolia / Klevu / Searchspring** — over-scoped and over-priced for a single tire store.

A paid app would mainly help **general keyword search** (the header, non-size/non-vehicle queries) and **relevance ranking**. It would *not* replace the tire-specific smart search. **Verdict:** ship the Tier-1 quick wins first — they deliver most of the value at near-zero cost — then revisit an app only if analytics justify it.

---

## 7. Should you add AI / semantic search?

**Lower priority for a tire shop.** Semantic/vector search shines on fuzzy, descriptive queries ("comfortable winter boots"). Tire queries are mostly **precise tokens** — sizes, vehicle names, brands — which exact parsing already handles *better* than vector search (industry consensus: pure vector search degrades on exact SKUs/sizes; "hybrid" keyword+semantic is the real bar).

You already use AI in exactly the right, targeted spot: **Gemini for free-text vehicle recognition**. That's the high-value use. Don't chase general vector search — it would add cost and complexity for a query mix it doesn't suit. Reported semantic-search uplift is a moderate 8–20% *and only on clean catalogs* — and it amplifies messy data rather than fixing it.

---

## 8. Research sources

- Baymard Institute — e-commerce search research (327-site benchmark, 4,400+ test sessions): autocomplete design, the 8 query types, no-results pages, default sort, mobile search.
- Tire-retailer analysis — Tire Rack, SimpleTire, Discount Tire, Kal Tire, Costco, 1010Tires (vehicle/size/plate entry, staggered fitment, fitment guarantees).
- Shopify search-app landscape — native Search &amp; Discovery, Boost, Searchanise, Fast Simon, Algolia, Klevu, Rapid Search, Doofinder.
- 2025–26 AI-search reporting — semantic/hybrid search ROI, LLM query understanding, conversational commerce, personalization.

Full research digest is available in the session transcript.
