# Winter-tire rankings deep dive — 2026-08-18

Sources: Ubersuggest tracked positions (window Jul 18 → Aug 15 — PRE-dates the Aug 16 fix batch),
fresh SERP pulls (Aug 18), keyword-universe expansion (128 terms, ~185k/mo combined, locId 2124).
Next tracker refresh **Aug 22** is the first read on the Aug 16 changes.

## 1. Our winter footprint — 37 tracked terms (old → new position)

**Healthy / improving**
| Term | Vol | Pos | URL |
|---|---|---|---|
| calgary winter tire change | 90 | 4 → **3** | cost-guide blog |
| tire change over calgary | 720 | 5 → **4** | cost-guide blog |
| snow tire sales near me | 390 | 10 → **8** | homepage |
| calgary snow tires | 1,000 | 17 → **15** | changeover blog |
| snow tires calgary | 1,000 | 18 → **16** | /pages/winter-tires-calgary |
| haida hd687 | 140 | 26 → **18** | product page |
| haida hd617 review | 110 | 17 → **16** | product page (new review post now targets this) |

**The timing-cluster damage (the blog rewrite targets exactly these)**
| Term | Vol | Pos | Note |
|---|---|---|---|
| when should you put on winter tires | 880 | 20 → NR | was ranking via HOMEPAGE — homepage stopped ranking for timing queries |
| when change winter tires | 720 | 32 → NR | same (homepage) |
| when to take off winter tires | 390 | 22 → NR | same |
| when should you change your winter tires | 210 | 31 → NR | same |
| when to put winter tires on | 880 | NR → 33 | came BACK via the blog |
| when to change winter tires | 720 | 23 → 34 | blog, slipping |
| when to change winter tires in alberta | 70 | 10 → 22 | ranks the SPRING post — cannibalization confirmed |

Pattern: every loss is a homepage-ranked timing query; every hold/recovery is blog-ranked. Google
stopped treating the homepage as a timing answer — correct behavior, and the Aug 16 blog rewrite
consolidates the cluster on the blog where it belongs.

**Never ranked (tracked)**: haida winter tire review (590 — new post published Aug 16), winter
tires exchange (390), 245 65r17 winter tires (260), winterforce (210), used winter tires calgary,
winter tire 225/45r17, winter tire 215/60r16, grenlander winter tires.

**Also notable**: `haida winter tires` (1,000/mo, SD 9!) ranks p48 via `/collections/vendors` —
which since Aug 16 canonicalizes to /collections/haida. Watch for a jump.

## 2. SERP anatomy — the 8 money terms (fresh, Aug 18; absolute positions incl. local pack)

1. **winter tires calgary (1,000; 3,600 in Oct-Nov)** — Prince is **#2 in the local pack** but
   organic surfaces our HOMEPAGE at ~16-23, not the landing page. Winner: goodtirecalgary's
   dedicated /winter-tires/ landing. Page-type matches what we have; ours needs strength +
   Google needs to pick the right URL. → Homepage must link /pages/winter-tires-calgary with the
   exact anchor "winter tires Calgary" (gap: this link doesn't exist yet).
2. **snow tires calgary (1,000)** — our landing page DOES rank here (16-25). Same fix as #1.
3. **winter tire sale (5,400)** — fully national big-box SERP (Costco wins). Unwinnable head
   term; the play is **"winter tire sale calgary"** (320/mo) — exactly what the new collection
   layer's title targets. Correctly aimed; wait for indexing.
4. **winter tires (27,100)** — national category SERP + gov pages. Ignore.
5. **cheap winter tires calgary (140)** — goodtire's landing wins; we're 16 via homepage. Angle
   is covered by the winter collection's budget-tier pricing content.
6. **used winter tires calgary (70)** — dedicated used-tires landing wins; we don't sell used.
   Skip (or a small "used vs new budget" intercept later; low volume).
7. **winter tire change calgary (90, $2.92 CPC)** — our best SERP: blog at organic ~#7 AND local
   pack. But the winning page TYPE is a chain service landing (Fountain/Kal). →
   /pages/seasonal-tire-change-calgary should get the same price-led retarget treatment
   balancing/repair/rotation got on Aug 16 (it didn't).
8. **studded tires calgary (110)** — Reddit #1 (info intent), KMJ's studding service is first
   commercial. Our /pages/studded-tires-calgary EXISTS but doesn't rank top-20 → needs internal
   links (winter page/collection/blog) + FAQ tuned to "are studded tires legal/worth it in
   Alberta" (the Reddit question).

## 3. The universe we're not touching (~185k/mo across 128 terms)

| Cluster | ~Vol/mo | Our status | Play |
|---|---|---|---|
| Retailer/brand (costco/CT snow tires…) | 42k | n/a | Ignore competitors' brand queries. But: **haida snow tires 1,000 SD 10** + haida winter tires 1,000 SD 9 = our brand cluster, now served by review post + /collections/haida |
| Best-of research (best winter tires canada…) | 27k | absent | One "best winter tires for Calgary 2026-27" editorial (we have the format proven) |
| Sale/price/cheap/used | 22k | collection layer just shipped | Watch Aug 22+ |
| **Size-specific (225/65r17 snow tires 2,400 SD 19; 205 55 r16 2,400 SD 22; 195/65 r15 1,300 SD 14…16 sizes)** | **16k** | **absent — biggest untapped winter cluster** | Programmatic winter×size pages (size collections exist; needs a September build decision) |
| Studded | 13k (mostly national) | page exists, unranked | Strengthen for the 110/mo Calgary term only |
| Rims/packages (winter tires and rims 3,600; steel wheels for snow tires 1,300) | 11k | '225 65 r17 winter' p39 via a package product | Winter tire+rim package collection page — pairs with wheels-split backlog |
| Changeover/service | 10k | blog strong, service page weak | Seasonal-change page retarget |
| Local Calgary | 4.5k | pack strong, organic mid | Items 1-2 above |

## 4. What the Aug 16 batch already aimed at this (validated by the SERP data)

Blog rewrite → timing cluster · collection layer → sale/price terms · related-links + homepage
title → local terms · Haida review post → haida review cluster · vendors?q= canonical →
haida winter tires. The SERP anatomy confirms every one of these was the right page-type call.

## 5. New actions surfaced by this deep dive (not yet done)

1. **Homepage → /pages/winter-tires-calgary exact-anchor link** ("winter tires Calgary") — the
   one missing interlink; Google currently ranks the homepage for the term.
2. **Retarget /pages/seasonal-tire-change-calgary** like balancing/repair/rotation ($60,
   literal-query FAQs) — the changeover SERP wants a service landing and we're already #7+pack.
3. **Strengthen /pages/studded-tires-calgary** — internal links from winter surfaces + an
   "are studded tires worth it/legal in Alberta" FAQ block.
4. **"Best winter tires for Calgary 2026-27" editorial** (27k cluster; interlinks the collection).
5. **September decision: winter×size programmatic pages** (16k/mo, SD 13-36, near-zero
   competition — the largest untapped cluster).
6. Watch `haida winter tires`/`haida snow tires` (2,000/mo combined, SD 9-10) — canonical fix +
   review post should move these; if not by mid-Sept, build /collections/haida winter content.

Skip list (confirmed unwinnable/wrong-fit): winter tires (27k), winter tire sale (5.4k head),
snow tires in bc/quebec, used-winter terms (don't stock), costco/CT brand queries.

*Caveat: tracker positions predate the Aug 16 fixes; SERP pulls are fresh. Competitor-footprint
pull failed on session limits — goodtirecalgary /winter-tires/ + tirepirates snow-winter
collection identified as the local winners via SERP anatomy instead.*
