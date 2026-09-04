# Off-site SEO checklist — August 2026

Companion to [seo-audit-ubersuggest-2026-08.md](seo-audit-ubersuggest-2026-08.md). These are the
items only a human with account access can finish. Everything on-site/data-side is handled in the
fix session (2026-08-16).

## 1. Disavow the PBN spam cluster (needs GSC access)

~24 of the 47 referring domains are link-selling spam. Ubersuggest's backlink-list API is broken,
so the domain names must come from Search Console:

1. GSC → princetires.ca property → **Links** → "Top linking sites" → **Export**.
2. Identify the spam domains. Fingerprints — their pages link with these exact anchors:
   - "high quality dofollow backlinks da 50 pa 40 premium pbn network service princetires.ca …buy backlinks online cheap" (9 domains)
   - same anchor naming **prince.tires** (8 domains)
   - same anchor naming **tireshopcalgary.ca** (7 domains)
   - "best pinterest tool sitetosocial.com…" (1 domain)
   Spot-check each candidate domain by visiting one linking page (they're auto-generated
   link-catalog pages). If a domain looks like a genuine directory/blog, KEEP it.
3. Do NOT disavow: bonified.com, any yellowpages/411/BBB-style directory, anything with a real
   "prince tires" branded anchor, supplier/dealer pages.
4. Build the file (one line per domain):
   ```
   # princetires.ca disavow — PBN link-seller cluster, 2026-08
   domain:example-pbn-1.com
   domain:example-pbn-2.net
   ```
5. Submit at https://search.google.com/search-console/disavow-links (select princetires.ca).
6. Re-check quarterly — the cluster has minted new entries before.

Context: Google mostly ignores such links, but with only ~20 genuine referring domains the spam
dominates the profile. Disavow is cheap insurance, not a rescue.

## 2. Ubersuggest AI-visibility (AISV) config — 15 min in the Ubersuggest app

The current 0%-visibility number is measuring the wrong thing:

1. **Rename the brand**: AISV settings → brand name is literally "tire shop" → change to
   **Prince Tires**; add alias group: Prince Tires Calgary, princetires.ca, Prince Tire.
2. **Localize prompts**: all 10 prompts are "near me" phrasings scoped Canada-national. Budget is
   5 prompt edits per monthly cycle (last updated 2026-08-04). Replace the 5 weakest first:
   - "best tire shop in Calgary"
   - "where to buy winter tires in Calgary"
   - "cheap winter tire change Calgary"
   - "best place to buy tires in Calgary"
   - "tire shop Calgary open Sunday"
3. **Add competitors** to the AISV brand config (0 of 100 operations used): Kal Tire, Fountain
   Tire, Good Tire Calgary, Tiremaxx, KMJ Tire.
4. **Verify Gemini collection**: the Gemini flag is on but no Gemini/AI-Overview data arrives —
   check the collection status in the app; contact support if it stays empty next cycle.
5. Ignore the current "0 mentions" baseline until one full monthly cycle runs with the fixed config.

(The SEO-project competitor slots were already reshuffled via API on 2026-08-16: now
goodtirecalgary.ca, tiremaxx.ca, blackcircles.ca, 4tires.ca, quattrotires.com.)

## 3. Citations & listings (NAP: 111 42 Ave SW, Calgary, AB T2G 0A4 · (403) 452-4283)

Existing tracker: [local-citations-tracker.md](local-citations-tracker.md). Priority order:

- [ ] **Reclaim/recreate the Bonified listing** — bonified.com dropped its Prince Tires listing
      2026-08-13 (it was DA 31 and still pointed at legacy prince.tires). Recreate with
      princetires.ca.
- [ ] **YellowPages postal fix**: 1Y2 → **T2G 0A4**.
- [ ] **BBB website fix**: prince.tires → princetires.ca.
- [ ] **Yelp**: claim the profile (still unclaimed — Tier 1 item).
- [ ] **Facebook name**: standardize "Prince Tires LTD" → "Prince Tires".
- [ ] **New free profiles**: Crunchbase company page, TrustBurn, yellowpages.ca (verify),
      411.ca (verify). All link princetires.ca with "Prince Tires" anchor.
- [ ] **GBP hours** — update to the new hours (Mon–Sat 9:00–5:00, Sun 9:00–2:00) so GBP, site
      footer, and schema all match. This also feeds the "open now / open sunday" query cluster.
- [ ] Tire-brand dealer locators (Michelin/Bridgestone/Toyo/Yokohama/BFGoodrich) — request
      dealer-page listings; DA 70+ links plus AI-answer authority.

Zero new referring domains in the last 60 days — target ~10 genuine new domains per quarter
(47 now → ~150 for competitor parity).

## 3b. Homepage title — admin UI edit required (30 seconds)

The new homepage title was written via API to the shop metafield but Shopify's homepage renderer
reads **Online Store → Preferences** directly (verified: API write doesn't propagate). In admin:
Online Store → Preferences → set:
- Title: `Tire Shop Calgary 2026 | Tires for Sale, 4.9★ | Prince Tires`
- Meta description: `Shop tires for sale in Calgary at Prince Tires. ✔️ Wholesale prices ✔️ Price Match Guarantee ✔️ 4.9★ Google rating. Call (403) 452-4283 or shop online.`

## 4. Search Console checks (5 min)

- [ ] Core Web Vitals report → confirm **field INP** status (Ubersuggest's PageSpeed didn't
      return it; lab TBT 210ms suggests it's near the line on mobile).
- [ ] URL Inspection → request re-indexing for `/collections/vendors?q=haida` (now canonicals to
      /collections/haida) and the winter-changeover article once its rewrite is applied.
- [ ] Links report export (feeds item 1).

## 5. Watch dates

- **2026-08-22** — Ubersuggest rank refresh: re-check the winter-timing cluster, 'tires for
  sale' (5→18), 'cheap tire shop near me' (4→NR) before treating July's drops as structural.
- **September** — winter-collection content + refreshed changeover blog must be live before the
  search wave starts; booking rush window Oct 15–Nov 15.
