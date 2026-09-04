# Prince Tires SEO Audit — Ubersuggest (2026-08-16)

Full-stack audit via Ubersuggest MCP: 1,000-page site crawl + domain/traffic, keywords/rankings,
backlinks, competitor, PageSpeed, and AI-visibility datasets (Canada, locId 2124). Live-site claims
spot-verified with browser-UA curl.

## Snapshot

| Metric | Value | Note |
|---|---|---|
| Site health score | **99/100** (was 86) | 1,000 pages crawled, 0 broken/blocked/redirected |
| Est. organic traffic | 1,248/mo (Jul 2026) | ~0 in Feb 2026 → strong growth, but ~70% branded ("prince tires" = 870) |
| Organic keywords (CA) | 1,391 | only 7 in top-3; 98 at pos 4–10; 621 at 11–50 |
| Domain authority | 12 | goodtirecalgary 22, tiremaxx 23 |
| Referring domains | 47 (≈24 are PBN spam) | competitors: 278 / 296 |
| AI answer visibility | 0% | tracking also misconfigured (see §6) |
| Tracked keywords (125) 30-day | top-10 34→28, not-ranking 22→26 | net negative month; next refresh 2026-08-22 |

---

## 1. Technical crawl issues (29 total — site is otherwise clean)

Zero: broken links, 4xx, missing H1/title/meta, slow-load flags, sitemap/SSL problems.

### 1a. Duplicate titles — 6 pages = 3 known Trail-Tire `-1` duplicate pairs (HIGH)
Verified all three `-1` URLs still live (HTTP 200):
- `/products/195-65r15-ecopia-ep422-plus-91h` + `-1` (Bridgestone Ecopia — also the 2 duplicate meta descriptions)
- `/products/235-55r19-crugen-premium-kl33-a-s-101h` + `-1`
- `/products/245-55r19-dimax-a-s-as-8-107v-xl` + `-1`

→ Recurring Trail Tire Supply auto-sync issue. Tag `duplicate-review`, run `db/fix-seo-titles.mjs`
(princetires-app repo). Don't blind-delete (different SKU/price).

### 1b. Long titles — 17 product pages, 66–70 chars (MEDIUM, easy)
All winter/trailer/MT products with internal SKU codes in the product name, e.g.
`225/50R18 [D] EVOLUTION WINTER Studable 95T (9-34623) – Prince Tires`.
→ Strip `(9-xxxxx)` / `RNC0083` / `(2040S/1820D)` codes and `[D]` markers from product titles
(or set SEO title_tag metafields). Full URL list in Ubersuggest audit report.

### 1c. Non-SEO-friendly URLs — 4 products (LOW — skip)
`steel-wheel-17x7-5x112-cb-57-1`, `steel-wheel-18x7-5x114-3-cb-67-1`, `tpms-sensors`,
`trailer-wheel-15x6-6x139-7-cb-108`. Renaming URLs costs redirects for no real gain. Ignore.

### 1d. Parameter-URL index bloat — /collections/vendors?q= (MEDIUM, verified live)
`/collections/vendors?q=haida` **self-canonicalizes with the query param**
(`<link rel="canonical" href=".../collections/vendors?q=haida">`). Google indexes these as separate
pages (they appear in top-pages: ?q=centara, ?q=mileking, ?q=bearway, ?q=haida) competing with the
real brand collections. → Theme fix: canonical the vendors ?q= view to the matching brand
collection, or noindex the parameter variant.

### 1e. Redirect chain (LOW — external-link hygiene only)
Canonical host `https://princetires.ca` (apex). `http://www` pays 2 hops (standard Shopify).
PageSpeed charged 630ms mobile for this. → No site fix needed; point citations/ads/GBP links
directly at `https://princetires.ca/...`.

---

## 2. Rankings — losses to recover (most urgent, seasonal deadline)

1. **Winter-timing cluster wiped from top 100 in last 30 days** (CRITICAL before Sept):
   'when should you put on winter tires' (880/mo) 20→NR; 'when change winter tires' (720) 32→NR;
   'when to take off winter tires' (390) 22→NR; 'when should you change your winter tires' (210)
   31→NR. All ranked via `/blogs/news/when-to-change-to-winter-tires-in-calgary` — which still has
   a **"…Calgary 2023?" title**. → Refresh to 2026-27 season, FAQ schema, de-cannibalize vs the
   2026 spring-changeover post. Feeds the Oct 15–Nov 15 booking rush.
2. **'tires for sale' (6,600/mo) pos 5 → 18** mid-July. Also Ubersuggest's #1 quick-win.
   Investigate what homepage/title change coincided; consider pointing this intent at
   `/collections/tires` instead of homepage.
3. **'cheap tire shop near me' (390) pos 4 → NR** and 'all weather tires near me' (140) 9→NR.
4. Re-check all of the above after the 2026-08-22 rank refresh before concluding trend vs blip.

## 3. Rankings — striking-distance wins (pos 4–10, homepage-ranked)

'tire stores calgary' p6 (2,900) · 'tire shops calgary' p8 (2,900) · 'cheapest tires near me' p7
(1,300) · 'cheapest tires in calgary' p6 (880) · 'tire deals calgary' p4 (720) · 'calgary tire
sales' p9 (720) · 'buy tires' p11 (880). 40 quick-wins flagged in total; 719 keywords at pos 4–50.
→ Homepage title/H1 alignment on "tire shop Calgary", LocalBusiness review rich results, exact-
anchor internal links from blog posts.

## 4. Structural content issues

- **Homepage cannibalizes category pages**: /collections/winter-tires = 4 visits/mo,
  /pages/winter-tires-calgary = 2, all-season/all-weather/tires pages = 0, while the homepage ranks
  for their queries. Continue collection-canonical consolidation: one URL per intent + internal
  links with exact anchors.
- **Winter intent split across 3 URLs**: homepage ('winter tires calgary' p16),
  /pages/winter-tires-calgary ('snow tires calgary' p16), /collections/winter-tires ('winter tires
  price' p19; but p76 for 'winter tires' 27,100/mo and p76–88 for 'winter tire sale' 5,400×3).
  Pick one Calgary winter target before September.
- **Blog outranks service pages** (keep blogs, add exact-anchor links + CTAs): tire-swap cost guide
  ranks p4–9 for changeover/installation queries while /pages/tire-installation-calgary sits p27
  and /pages/seasonal-tire-change-calgary p49.
- **Trailer intent split**: blog p3 'calgary trailer tires', /pages/trailer-tires only p54 for
  'trailer tires' (2,900/mo); 12/17 opportunity split between page and collection — Google can't
  pick a canonical. Make /pages/trailer-tires the hub.
- **/collections/wheels holds 314 keyword opportunities** but ranks p20–104 for all of them. Split
  into intent subcollections (steel, trailer rims, tire+rim packages, by-brand) and push
  /pages/wheels-and-rims-calgary for Calgary terms.
- **Stale titles on ranking pages**: winter blog "…2023?"; /pages/brand-cooper titled "C Cooper"
  (check it's in the brand→collection 301 set, same for /pages/fortune).

## 5. Content gaps (competitor-proven, low difficulty)

- **Tire balancing service cluster ~20,000/mo combined, SD 8–11**: goodtirecalgary p2–7 and
  tiremaxx p4–9 on 'wheel/tire balancing service' (3,600×4) + 'balancing near me' (1,600×3);
  /pages/tire-balancing only ranks question-phrasing (p9, 170/mo) and sits p34–38 for 'wheel
  balance price'/'tire balancing cost' (1,600×2, SD 14–23). → Rebuild page: exact-match title/H1,
  price table, FAQ.
- **Wheel alignment + rotation**: 'wheel alignment service' 9,900/mo SD 8 (best local rank is
  tiremaxx p24 — open field), 'tire rotation service' 4,400 SD 12, 'tire alignment cost' 3,600
  SD 18. No Prince Tires page ranks. → Ship /pages/wheel-alignment-calgary + tire-rotation pricing
  pages in the cost-guide format.
- **18 tracked keywords never ranked** = missing pages: envy wheels (1,300), steel 17 inch wheels
  (1,000), haida winter tire review (590, SD 12), light truck tires (590), price for flat tire
  repair (390), winter tires exchange (390), 245 65r17 winter tires (260), winterforce tires (210).
- **Budget-brand review play**: tiremaxx owns 'firemax review' cluster p1–2; Prince ranks p20 for
  'haida hd617' (390) with a bare product page. → "Haida HD617 review: are Haida winter tires good
  for Calgary?" post.
- **Hours-intent cluster ceded** (~3,190/mo, goodtirecalgary p3–6): 'tire shop open now', 'open
  sunday' etc. → Visible hours block + openingHoursSpecification (schema-local-business.liquid),
  pristine GBP hours.
- **Used-tires cluster** (14,100/mo, SD 9–17) — only if strategy fits: intercept page "Used vs new
  budget tires in Calgary" routing to Haida-class new inventory.

## 6. Backlinks (weakest area)

- **~24 of 47 referring domains are PBN/link-selling spam** (anchors: "high quality dofollow
  backlinks…buy backlinks online cheap" naming princetires.ca / prince.tires / tireshopcalgary.ca).
  → Build disavow file, but cross-check against GSC Links report first so no legit domain is
  disavowed on anchor pattern alone.
- **0 new referring domains in 60 days**; bonified.com (DA 31) listing lost 2026-08-13 (still
  pointed at legacy prince.tires). → Reclaim/recreate with princetires.ca NAP.
- **Only 1 domain uses a "prince tires" branded anchor**; legacy prince.tires/princetires.com
  anchors persist — verify 301s from legacy domains remain live.
- **Realistic gap targets**: Crunchbase, BBB Alberta, TrustBurn, yellowpages.ca, Rumble/YouTube,
  r/Calgary participation, Calgary Herald/LiveWire seasonal pitch. Do NOT chase
  calgaryrimandtire.ca's DA-90+ referrers (spam artifacts — DA 54 with 707 traffic/mo proves
  authority-without-content fails anyway).
- Target: 47 → ~150 genuine referring domains (competitor parity) at ~10/quarter.

## 7. Performance (field CWV passes; mobile lab is the risk)

- Mobile lab: **LCP 5.3s** (good ≤2.5s), TTI 17.3s, TBT 210ms. Desktop: LCP 1.1s (fine).
- **913 KB unused JS** on every load (biggest lever — audit app embeds, gate theme JS per
  template); 77 KB unused CSS; 11 KB unminified JS.
- Field INP not returned — verify in Search Console CWV report.
- Hero: mobile-sized WebP/AVIF + fetchpriority=high.

## 8. AI visibility (0% — but the measurement itself is broken)

Fix config BEFORE investing in content:
1. Brand name in Ubersuggest AISV is literally **"tire shop"**, no aliases → rename to
   "Prince Tires" + alias group. Current 0-mention figure isn't trustworthy.
2. All 10 prompts are "near me" phrasing scoped **Canada-national** → rewrite to Calgary intent
   (limit: 5 prompt updates per monthly cycle; last updated 2026-08-04).
3. 0 competitors configured (0 of 100 operations used) → add the 4 Calgary rivals.
4. Only OpenAI data present despite Gemini flag on; 7 of 10 prompts have zero answers — verify
   collection in the Ubersuggest app.
Meanwhile Kal Tire / Fountain Tire / KMJ appear in 66.7% of answers.

## 9. Competitor tracking hygiene

Ubersuggest surfaces bigger overlapping threats than the tracked set: blackcircles.ca (690 common
keywords, 87.9k traffic), 4tires.ca (405, 69.9k), quattrotires.com (294, 117k) vs best-tracked
goodtirecalgary at 372 common. → Add those three; consider dropping canadatirepro (195 common,
mostly Edmonton/misspell traffic). Keep goodtirecalgary + tiremaxx for local service benchmarks.

---

## Priority order

**This week (pre-season + defects)**
1. Refresh winter-changeover blog (2023 title!) + recover winter-timing cluster — deadline Sept.
2. Fix 3 `-1` duplicate product pairs (known sync issue, script exists).
3. Fix Ubersuggest AISV brand config (name/aliases/Calgary prompts/competitors) — 15 min, unblocks measurement.
4. Investigate 'tires for sale' 5→18 drop.

**This month**
5. Striking-distance sprint on homepage Calgary terms (title/H1, review schema, internal anchors).
6. vendors?q= canonical theme fix; strip SKU codes from 17 long product titles.
7. Rebuild /pages/tire-balancing for 'service'+price terms; ship wheel-alignment page.
8. Disavow spam cluster (after GSC cross-check); reclaim Bonified; Crunchbase/BBB/TrustBurn/YP profiles.

**This quarter**
9. Winter-URL consolidation (one canonical target) + /collections/winter-tires content before Oct.
10. Unused-JS audit (913 KB) to fix mobile LCP/TTI.
11. Content gaps: Haida review, envy wheels, light-truck collection, flat-repair pricing page.
12. Wheels collection split; add blackcircles/4tires/quattro to tracked competitors.
13. Sustained link building: ~10 genuine referring domains/quarter toward 150.

*Data: Ubersuggest tier1 account (princetires111@gmail.com), project f99358b3…, crawl task
08160917-1221 (1,000 pages, 2026-08-16). Rank data window 2026-07-18→08-15; next refresh 08-22.*

---

## Executed 2026-08-16 (same-day fix session)

**Theme (live, MAIN 186307215635):** vendors ?q= canonical fix (+noindex fallback, verified on
Haida/Mileking/Centara); pt-booking-core.js deferred everywhere except /pages/book (was
render-blocking site-wide); article related-services block (metafield `custom.related_links` +
tag fallback) live on all posts; rebuilt tire-balancing / tire-repair / tire-rotation templates
(price-led H1s + literal-query FAQs). Incident during deploy: theme.liquid pull-through exposed
two undeployed local dependencies (pt-locations.liquid, pt-booking-core.js) — pushed both,
Liquid error resolved, full suite re-verified.

**Product data:** 3 Trail-Tire `-1` duplicate pairs differentiated + tagged duplicate-review
(fix-seo-titles.mjs gained effective-title dup detection + HANDLES scoping); store-wide
long-title sweep via new db/strip-sku-seo-titles.mjs — 1,230 over-65-char titles found (audit
crawl saw only 17), 1,222 rewritten with load-index-preserving clamp + collision resolution
(0 new dup titles; 8 unresolvable = true dups left for duplicate-review).

**Content:** winter-changeover blog rewritten in place (2023 title gone; 7°C-rule structure,
7-FAQ schema, URL preserved, backup saved); NEW Haida HD617 review post published; winter +
light-truck collection content/FAQ layers (buy-intent) live; homepage title_tag → "Tire Shop
Calgary 2026 | Tires for Sale, 4.9★ | Prince Tires" (set; edge cache lagging at time of writing);
related_links wired on 5 posts; /collections/fortune created + /pages/fortune 301'd
(brand-canonical pattern completed). ENVY collection skipped — only 2 active products.

**Measurement:** Ubersuggest competitors swapped to goodtirecalgary / tiremaxx / blackcircles /
4tires / quattrotires; legacy-domain 301s verified live; AISV fix steps + disavow prep + citations
in [seo-offsite-checklist-2026-08.md](seo-offsite-checklist-2026-08.md).

**Held / pending:** footer visible hours + two-location schema (entangled with the unshipped
NE-location NAP refactor — ships once NE geo/GBP confirmed; NOTE live schema still says the old
9:30–5:30 hours while real hours are now 9:00–5:00/Sun 9:00–2:00); 913KB unused-JS attribution;
wheels-collection split; homepage-title cache flip re-check; Aug 22 rank-refresh review.
