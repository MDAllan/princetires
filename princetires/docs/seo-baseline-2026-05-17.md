# Prince Tires — SEO Program (Workstreams 1–3)

> Captured **2026-05-17** via the Ubersuggest MCP (Canada / en, locId 2124).
> W1 = baseline (reference point for W6 rank-tracking — re-pull the same metrics and
> diff against this file). W2 = competitor intel. W3 = keyword universe + build list.

## Domain metrics

| Metric | Value | Note |
|---|---|---|
| Organic keywords | 551 | down from 1,073 peak (Nov 2025) — winter-seasonal |
| Organic traffic | ~643 / mo | GA + GSC-connected (real data, not modeled) |
| Paid traffic | ~175 / mo | Google Ads is running (tag `AW-16608706686`) |
| Domain Authority | 11 / 100 | low |
| Backlinks | 6,023 | inflated by few-domain bulk links |
| Referring domains | 36 | the honest authority figure — very thin |
| Gov/Edu ref domains | 0 | |
| Page-1 keywords (pos 1–3) | ~4 | almost all branded |

### Keyword count trend (monthly)

| Month | Keywords | Month | Keywords |
|---|---|---|---|
| 2025-07 | 10 | 2025-12 | 814 |
| 2025-08 | 441 | 2026-01 | 635 |
| 2025-09 | 576 | 2026-02 | 914 |
| 2025-10 | 849 | 2026-03 | 874 |
| 2025-11 | 1,073 (peak) | 2026-04 | 551 |

## Traffic concentration — the headline finding

**~99% of organic traffic is branded.**

| Keyword | Pos | Volume | Est. traffic |
|---|---|---|---|
| prince tires | 1 | 1,600 | 550 |
| prince tires calgary | 1 | 210 | 88 |
| *all 549 other keywords combined* | — | — | ~5 |

### Striking-distance cluster (homepage, pos 6–15, non-brand Calgary commercial)

| Keyword | Pos | Volume |
|---|---|---|
| tires for sale calgary | 6 | 720 |
| cheapest tires calgary | 7 | 880 |
| best tire shop calgary | 9 | 170 |
| tires shop calgary | 10 | 2,900 |
| cheap tires calgary | 10 | 880 |
| tire sale calgary | 10 | 720 |
| tire stores calgary | 11 | 2,900 |
| tire deals calgary | 11 | 720 |
| best tires calgary | 11 | 110 |

~10,000 searches/mo, all 1–2 positions off the top 5. Moving the homepage ~10 → ~5 here
is the single biggest organic lever. Blog posts already rank page 1 for informational
terms (`michelin-vs-bridgestone` #9, `trailer-tires-load-range` #4, `tire-swap-cost` #7).

## Site audit — 1,000 pages crawled, health score 96/100

| Issue | Count | Type |
|---|---|---|
| Over-length `<title>` | 104 | warning |
| Duplicate `<title>` | 19 | error |
| Non-friendly URLs | 7 | warning |
| Duplicate meta descriptions | 4 | error |
| Empty meta descriptions | 3 | warning |
| Broken / blocked / redirected pages | 0 | — |

**The 96 score is misleading** — Ubersuggest's crawler does shallow on-page checks and
does NOT validate structured data. Every code-review schema critical (C3–C6, H11, H13,
H14 in `docs/code-review-2026-05-15.md`) is invisible to it.

Notable URL: `/pages/copy-of-winter-tires-for-calgary-icy-roads` is live with a "copy-of"
junk slug and holds 94 backlinks — editorial-debt URL leaking link equity.

## PageSpeed

| | Desktop | Mobile |
|---|---|---|
| Field data (CrUX — real users) | FAST | FAST |
| Lab LCP | 1.2s | 5.4s |
| Lab TBT | 365ms | 769ms |
| Lab TTI | 3.7s | 20.3s |
| Unused JS | ~891 KB | ~891 KB |

Real users are fine (field data passes). Lab mobile is dragged down by ~891 KB unused JS,
mostly **four separate Google tag loads** (GTM `GTM-KZ2D39VQ` + GA4 `G-JL0R6XZPEM` +
Google Ads `AW-16608706686` + tag `GT-WR4L7KZN`) and two `good-apps.co` Shopify apps
(wholesale + sticky add-to-cart). The 4-way Google tagging is likely redundant.

## Cross-reference vs. code-review backlog

- **Confirmed by the audit:** the title/meta debt — H12 (brand `<title>` via `capitalize`)
  and M14. Quantified at 19 duplicate + 104 over-length titles.
- **Invisible to the audit, still open:** C3 (3 conflicting Product JSON-LD), C4 (competing
  LocalBusiness), C5 (contradictory opening hours), C6 (review count 320/562/"300+"),
  H13 (`og:image` on `http:`). C6 is a Google policy violation that risks all rich results.

---

# Workstream 2 — Competitor intel (national chains)

| Domain | DA | Ref domains | Organic kw | Organic traffic/mo |
|---|---:|---:|---:|---:|
| princetires.ca | 11 | 36 | 551 | ~643 |
| kaltire.com | 48 | 6,530 | 95,889 | ~1,377,000 |
| fountaintire.com | 42 | 2,713 | 51,917 | ~547,000 |
| oktire.com | 39 | 2,600 | 47,029 | ~292,000 |

- **Fountain Tire is the direct organic threat in Calgary** — its homepage ranks #4 for
  "tires shop calgary" / "tire stores calgary" / "tires calgary"; princetires' homepage
  sits ~6 spots lower. Same page type — the gap is DA 42 vs 11.
- Head terms ("tire shop calgary" etc.) are **link-bound** → Workstream 5, not content.
- The chains rank generic national pages + one thin store page per city. They do **not**
  compete at the Calgary-qualified service / long-tail level. That is the opening.
- Local Calgary independents surfaced via keyword data (DA-peer comparison, not yet
  profiled): Zee Tire, Ward Tire, Good Tire, Integra Tires, Tirecraft, Megatire,
  Country Tire, Grizzly Tires, Limitless Tire, Surplus Tire, AB Tire.

---

# Workstream 3 — Keyword universe & programmatic-SEO build list

~2,500 keywords pulled (service / category / brand / size seeds, Calgary + Canada).

## Tier 1 — Calgary service pages (BUILD)

Cross-checked against the service catalog (`princetires-app/db/015-services.sql` — 6 services).

| Page | Catalog service | Target keywords | Vol/mo | SEO diff. | Action |
|---|---|---|---:|---:|---|
| Seasonal swap / winter changeover | `installation_on` | tire changeover/swap, winter tire changeover calgary | ~1,200 | 25–35 | **build — top priority** |
| Tire repair / flat repair | `flat_repair` | tire repair calgary, flat tire repair calgary | ~890 | 32–37 | build |
| Tire installation / mounting | `installation_off` | tire installation/mounting calgary | ~410 | 29–35 | build |
| Wheel balancing | `balancing` | tire balancing calgary | ~210 | 29–35 | **exists** `/pages/tire-balancing` (#26) — optimize |

Dropped / demoted:
- **Wheel alignment** (1,600 vol) — NOT offered by Prince Tires (not in catalog). Dropped.
- **Tire rotation** (30 vol) + **TPMS service** (0 vol) — offered but ~no search demand;
  fold into a services hub, no standalone pages.
- **Tire storage** (260 vol, SD 34) — Prince Tires does **not** offer tire storage
  (confirmed with owner). Dropped.

## Tier 2 — Seasonal collections (OPTIMIZE, don't build)

- `/collections/winter-tires` ranks #30 for "winter tires calgary" (~2,000 vol incl.
  "snow tires calgary") — optimize title / content / schema.
- All-season collection — exists, optimize.
- Winter-deals page candidate — "winter tire sale calgary" cluster ~460 vol.

## Tier 3 — Programmatic size pages (the SCALE play)

- Size queries have major national volume: `225/65R17` 4,400, `+ winter tires` 2,400 —
  one size of 371.
- Inventory supports it: **90 sizes ≥15 models, 124 ≥10 models** (794/849 models in stock).
- SEO difficulty 36–50, national competition (Costco / Canadian Tire / Walmart) —
  hardest tier, biggest build.
- Ride the existing collection filter system + the deep-linking sub-project. Phase:
  top ~30 sizes (≥30 models) → 90–124.

## Tier 4 — Brand pages, Calgary (LOW priority)

michelin / toyo / firestone tires calgary 170–210 vol; pages exist; optimize the ~8 top
consumer brands opportunistically.

## Not a build — link-bound (Workstream 5)

"tire shop calgary" / "tires calgary" / "cheap tires calgary" — homepage, authority-gated.

---

# Recommended next steps

1. **Build the 3 Tier-1 service pages** (Seasonal Swap, Tire Repair, Tire Installation) —
   fastest ROI, lowest difficulty, the national chains are absent here.
2. Optimize Tier 2 collections — overlaps the C3–C6 schema fixes in `code-review-2026-05-15.md`.
3. Phase the Tier 3 size pages.
4. Finish W2 — profile 2–3 local Calgary independents for a DA-peer comparison.

---

# Deploy — Shopify Pages (DONE 2026-05-17)

Both service-page templates were pushed live to the theme, and both Shopify **Pages**
were created via the Admin API (`princetires-app/db/create-service-pages.mjs`) —
published, custom templates assigned, SEO title/meta set, verified HTTP 200. Live at
`/pages/seasonal-tire-change-calgary` and `/pages/tire-repair-calgary`. Values used,
kept for reference:

**Seasonal Changeover**
- Handle / URL: `seasonal-tire-change-calgary`
- Theme template: `seasonal-tire-change-calgary`
- Body content: leave blank (the `pt-calgary-service` section provides everything)
- SEO page title: `Tire Changeover Calgary 2026 | Same-Day | Prince Tires`
- SEO meta description: `Seasonal tire changeover in Calgary at Prince Tires. ✔️ Same-day service ✔️ Flat rate from $60 ✔️ 4.9★ from 562+ reviews. Call (403) 452-4283 or book online.`

**Tire Repair**
- Handle / URL: `tire-repair-calgary`
- Theme template: `tire-repair-calgary`
- Body content: leave blank
- SEO page title: `Tire Repair Calgary 2026 | Same-Day | Prince Tires`
- SEO meta description: `Flat tire repair in Calgary at Prince Tires. ✔️ Permanent internal patch ✔️ $50 per tire ✔️ Same-day service. Call (403) 452-4283 or book online.`
