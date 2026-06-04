# SEO Cannibalization Redirect Log — 2026-06-04

Store: prince-tires-5560.myshopify.com (https://princetires.ca)
Operator: Claude (Admin API, 2025-01). All actions reversible.
Online Store publication id: `gid://shopify/Publication/106617274643`

---

## ✅ EXECUTED — Phase 1 (verified-clean exact duplicates only)

Only the **2 of 7** Phase-1 pairs that passed every safety check (100% product overlap, true
duplicates) were redirected. The other 5 were **held** — see the next section for why.

| # | Loser path | → Target | Redirect ID | Loser collection unpublished (Online Store) | Verified firing |
|---|-----------|----------|-------------|---------------------------------------------|-----------------|
| 1 | `/collections/235-1` | `/collections/235` | `gid://shopify/UrlRedirect/593975279891` | `gid://shopify/Collection/491069735187` (still on 8 other channels) | ✅ 301 observed |
| 2 | `/collections/trailer-tire` | `/collections/trailer-tires` | `gid://shopify/UrlRedirect/593975312659` | `gid://shopify/Collection/522144547091` (was Online-Store-only) | ✅ 301 observed |

**Evidence supporting these two:**
- **235-1 → 235**: both smart collections, 71 products each, **100% product overlap**, *identical* SEO
  title `235 Tires in Calgary | Size 235 | Prince Tires`. 235-1 is a pure numbered duplicate. Not in
  any nav menu; **zero references anywhere in the theme** (incl. JS/JSON assets) → size-browse system
  does not depend on it.
- **trailer-tire → trailer-tires**: loser = 3 products (manual), winner = 91 products (smart, optimized
  title `Trailer Tires in Calgary | ST Tires | Prince Tires`, 189-word description). **All 3 loser
  products exist in the winner (100% overlap)** → no merchandising loss. Not in nav, not referenced in theme.

**Reversal procedure (if ever needed):**
1. Re-publish the collection to Online Store: `publishablePublish(id, input:[{publicationId:"gid://shopify/Publication/106617274643"}])`.
2. Delete the redirect: `urlRedirectDelete(id: "<redirect id above>")`.

**Propagation note:** after creating each redirect the loser still returned HTTP 200 (Shopify only fires
a redirect when the path would otherwise 404, so the still-published collection won). Unpublishing the
loser from the Online Store channel makes the 301 take over. Both 301s were then observed firing; full
edge consistency follows as Shopify's per-PoP caches expire (minutes–hours). `cf-cache-status: DYNAMIC`
confirmed it is origin publication-propagation, not a hard CDN cache.

**Internal links / nav:** no theme files referenced any of the 7 Phase-1 loser handles, and no loser was
in a nav menu (only the *winner* `light-truck-tires` is linked) → no theme/menu edits were required.

---

## ⏸️ HELD — Phase 1 pairs that are NOT clean duplicates (need your decision)

The task framed these as "clear-cut, low risk," but the **live product data contradicts that premise.**
These losers are **not** thin versions of the winners — they hold a *different, legitimate* product set
(predominantly Trail-Tire-Supply–sourced inventory) that is largely **absent** from the winner. Per the
methodology ("products must also exist in the winner… if signals conflict, STOP and ask"), I did **not**
redirect them.

| Loser → proposed winner | Loser prods | Winner prods | Overlap (loser∩winner) | Loser prods missing from winner |
|--------------------------|------------:|-------------:|-----------------------:|--------------------------------:|
| `/collections/winter` → `/collections/winter-tires` | 119 | 347 | **37%** | 75 |
| `/collections/all-weather` → `/collections/all-weather-tires` | 128 | 691 | **0%** | 128 |
| `/collections/passenger` → `/collections/passenger-tires` | 104 | 1091 | **0%** | 104 |
| `/collections/light-truck` → `/collections/light-truck-tires` | 295 | 1174 | **0%** | 295 |
| `/collections/performance` → `/collections/performance-tires` | 7 | 80 | **0%** | 7 |

**What's actually going on:** the bare losers are populated by the Trail-Tire-Supply sync; the optimized
"-tires" winners contain a different/broader catalog slice. They share the keyword/intent (genuine SEO
cannibalization — both indexable, both self-canonical, twin titles) but **not** the products.

**Are products orphaned if redirected?** No — every sampled loser product also lives in `tires` (master),
its **brand** collection (michelin/bridgestone/toyo/…), `all-terrain-tires`, the relevant **size**
collection, and search. So a 301 would not break the catalog. The *downside* is that the winner landing
page would not display the loser's products, shifting merchandising coverage.

**Recommended options (pick one per pair, or one policy for all 5):**
- **Option A — Merge then redirect (recommended).** Convert the winner to a smart collection (or widen its
  rule / add the loser's products) so it contains the union of both sets, *then* 301 the loser → winner.
  One canonical URL, full product coverage, full SEO consolidation. (Winners `winter-tires` & `trailer-tires`
  are already smart; `all-weather-tires`, `passenger-tires`, `light-truck-tires`, `performance-tires` are
  manual and would need rule conversion or a product merge.)
- **Option B — Redirect now, accept coverage shift.** Products aren't orphaned, so 301 immediately for the
  SEO win and let brand/size/master collections carry the Trail-Tire products. Fastest; minor merchandising loss.
- **Option C — Keep both, differentiate.** If the two sets are intentionally distinct, de-cannibalize by
  re-titling/canonicalizing instead of redirecting. (Least likely; the twin titles suggest they're not intended to coexist.)

My recommendation: **Option A** for the high-volume seasonal/type pages (these are valuable, browsable
landing pages and worth getting a complete merged collection), executed as a follow-up. Awaiting your call.

---

## ✅ EXECUTED — Phase 2A: Brand pages → brand collections (collection-canonical)

**Decision (approved):** collection-canonical. For each brand the `/collections/<brand>` URL is the
winner; the legacy `/pages/brand-<brand>` editorial is condensed and migrated into the collection,
then the page is unpublished and 301'd to the collection.

### Theme infrastructure (deployed to live theme 186307215635 via REST PUT — surgical)

Collections in this theme only rendered a 160-char description teaser + an empty FAQ, so rich content
could not live on a collection without a theme change. Added a **metafield-driven, opt-in** content layer
(inert on every collection until the collection sets the flag, so zero impact on non-migrated collections):

| File | Change |
|------|--------|
| `sections/pt-collection-content.liquid` (new) | Renders the collection's full `descriptionHtml` below the product grid, **only when `collection.metafields.custom.show_guide.value == true`**. |
| `sections/pt-collection-faq.liquid` (edited) | Now also renders a FAQ + `FAQPage` JSON-LD from `collection.metafields.custom.faq` (JSON list of `{q,a}`) when no theme-editor blocks are set. Existing block path untouched. |
| `templates/collection.json` (edited) | Section order → `header, grid, content, faq`. |

Per-collection content storage (no per-collection templates needed):
- `descriptionHtml` = condensed editorial (~250–520 words: brand overview, "why we recommend", model
  shortlist with hardcoded prices stripped, Calgary performance, CTA). Header still shows the 160-char teaser.
- metafield `custom.show_guide` (boolean `true`) — gates the below-grid content section.
- metafield `custom.faq` (JSON) — the 6 migrated FAQ Q&As (drives the on-page FAQ + FAQPage schema).

### Brand redirects (17 brands)

All 17 have content migrated (description + show_guide + 6-item FAQ) and a 301 `/pages/brand-<brand>` →
`/collections/<brand>`. **Safe ordering:** a brand page is unpublished only *after* its migrated content
is confirmed rendering live, so no page is ever 301'd to a collection that lacks its content.

bfgoodrich, bridgestone, continental, cooper, dunlop, falken, firestone, general, haida, kumho,
michelin, mickey-thompson, nexen, radar, rotalla, toyo, yokohama
→ each `/pages/brand-X` → `/collections/X` (301), page `isPublished:false` (reversible), collection
shows migrated content + FAQ + products.

> Note: Shopify edge propagation was slow during this run; a few brands' 301s flip a few minutes after
> their page is unpublished (data layer is correct immediately). `yokohama` page stays published until its
> migrated content finishes propagating to the storefront — intentionally, so it is never orphaned.

**Reversal (per brand):** `pageUpdate(id, page:{isPublished:true})` to restore the page;
`urlRedirectDelete(id)` to drop the 301. Original brand-page content is untouched in
`templates/page.brand-<brand>.json`. Migrated collection content can be cleared by unsetting
`descriptionHtml` + the two metafields.

(Side effect, beneficial: the brand pages carried a self-serving `4.9/562 aggregateRating` in their
`pt-brand-detail` section; unpublishing them removes that markup from the live site.)

---

## ⏸️ PENDING your sign-off — Phase 2B/C/D (page-vs-collection) + special cases

- **B — `/pages/tires` → `/collections/tires`:** target collection uses a **custom template that exists
  only on the live theme** (not in the repo). Needs: pull that template, add the content section there,
  migrate `/pages/tires` content, and **retitle** `/collections/tires` to lean transactional
  (e.g. "Shop All Tires in Calgary — Buy Online | Prince Tires") to avoid competing with the homepage
  (which ranks ~#4 for "tires calgary"). Bespoke — recommend a focused follow-up.
- **C — `/pages/{trailer-tires, performance-tires, light-truck-tires}` → collections:** these collections
  use the default template (content section works). Their page content lives in `pt-calgary-service` /
  `pt-tire-explainer` / `pt-tire-brands` sections (~400–600 words). Feasible follow-up (different content
  generator than brands).
- **C — `summer-tires`: ⚠️ DO NOT redirect as-is.** `/collections/summer-tires` has only **4 products** —
  too thin to be the canonical. Recommend keeping `/pages/summer-tires` or building the collection first.
- **D — `/pages/tire-sales` (~130 backlinks) → `/collections/tires`:** the page already renders the tires
  collection and **already canonicalizes to `/collections/tires`**. The sale collections suggested
  (`tires-on-sale` = 1 product, `clearance` = 2) are too thin for 130 backlinks. Recommend `/collections/tires`.
- **Orphan "brands" (no tire collection): Envy, XF Off-Road, RTX.** These are **wheel** brands, not tires —
  Envy/XF products are rims (in `/collections/wheels`); RTX has no products under that vendor. Recommend
  `/pages/brand-{envy,xf-off-road}` → `/collections/wheels`; `brand-rtx` → `/collections/wheels` or leave.
