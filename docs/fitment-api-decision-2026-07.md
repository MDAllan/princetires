# Fitment API Alternatives — Decision Doc (July 2026)

Context: wheel-size.com sandbox key suspended 2026-07-01 (production usage). Researched 10+ alternatives with fact-checking. Full audit context: agent-chat-audit-2026-07.md.

## Recommendation

Pay wheel-size.com the $750/yr Business plan — and harden against them at the same time. The market check is conclusive: Business is genuinely the cheapest product anywhere that covers priorities 1–4 (fitment incl. staggered US/CA, bolt pattern/offsets, reverse lookup, AND tire ratings) on one self-serve key with zero code changes, and TiresVote is literally the only commercially-licensed ratings API in existence — every alternative either lacks ratings entirely (RideStyler, AutoSync, DriveRight/TGP, Vehicle Databases), costs 2–13x once a sales rep is involved (RideStyler ~$1,440+/yr historic floor, TireConnect ~$9,800 first year, Vehicle Databases $2,880–6,000 at real volume), or covers zero requirements (CarAPI). Alongside the renewal, do three cheap things: (a) this week, ship the free bridge — re-point vehicle→size at the local pt-vehicle-*.json and precompute the reverse index (already demoed working) so search and 'Fits N vehicles' come back before the new key even arrives; (b) keep that local-first path permanently as a cache/failover so upstream usage falls to dozens of hits/day and a future suspension degrades gracefully instead of blanking the site; (c) email TGP Solutions for a tgpSize+tgpMount flat-file quote — if it lands near $750–1,500/yr, owning the fitment+bolt-pattern data in Postgres becomes the better long-term play and also cleans up the unknown licensing of the existing static dataset. Skip the $1,570 Configurator plan for now: the visualizer is the lowest-priority need, and the upgrade is a self-serve toggle later if usage data justifies it.

## Runner-up

The free/DIY stack (own dataset + computed reverse index + vPIC + UTQG, ~$0–215/yr) — but only if the shop consciously accepts amputating three shipped features: bolt-pattern/rim answers in the SMS agent (no free or cheap North-American source exists, verified), TiresVote stars/pros-cons (UTQG letter grades are a visibly weaker substitute), and the rim visualizer. It covers needs 1 and 3 completely and immediately, which is why it should be built as the bridge/failover layer regardless of which paid path is chosen. Honorable mention if the visualizer becomes strategic: the wheel-size Configurator plan at $1,570/yr beats RideStyler/AutoSync on price certainty and zero switching cost — only take a RideStyler sales call if they'll quote a bundled all-in at or below ~$1,500/yr, and even then you'd still need wheel-size or nothing for ratings.

## Key caveats

1) Configurator-plan pricing is inclusive: $1,570/yr contains all Business features — do not budget $750+$1,570. 2) The '+$800 USD per additional website or app' fee appears only on the Configurator plan description with no billing period stated; whether the SMS agent, storefront, and admin app count as separate applications is UNCONFIRMED — get it in writing before purchase (they already showed enforcement willingness by suspending the sandbox key). 3) Business caps /search/by_model reverse lookups at 15,000/day within the 30k quota — fine at current volume, relevant if 'Fits N vehicles' is precomputed via bulk crawling (prefer building that index from the local dataset instead). 4) The local pt-vehicle-*.json has no license to point to (TireSize.com-scrape lineage); enforcement risk is low for internal lookup, but a TGP license would fix it — and the files conflate staggered with optional OE sizes in unlabeled arrays, so any local-first fitment path needs the rim-diameter-mismatch heuristic plus a human-verify flag before quoting sizes to installation customers. 5) Several rival claims remain unverified without sales contact: AutoSync per-trim bolt pattern, RideStyler staggered/trim granularity and reverse lookup, Vehicle Databases' bolt-pattern marketing claim ($50 test pack would settle it), and all TGP/DriveRight pricing. 6) TiresVote scores are themselves aggregated from scraped shop reviews — opaque provenance is a background risk even on the incumbent. 7) TireConnect's enterprise-API figures are from a 2020 sheet (Capterra confirms the base fee is current; the $2,000/$500 numbers may have changed — likely upward).

## Comparison

### Wheel-Size Business (incumbent) — $750/yr (30,000 hits/day; billed yearly)

- **Self-serve:** yes
- **Covers:** 4 of 5: (1) vehicle→tire size incl. staggered, US/CA; (2) bolt pattern/rim sizes/offsets per trim; (3) size→vehicles reverse search (by_model capped 15k hits/day); (4) TiresVote ratings — star score, pros/cons, price segment — on the SAME key and host (/v2/tires). Only self-serve API on the market that includes tire ratings at all.
- **Gaps:** No rim visualizer at this tier (Configurator requires the $1,570/yr plan). Vendor has demonstrated enforcement willingness (suspended the sandbox key). TiresVote data provenance is scraped-review aggregation.
- **Switching effort:** Zero — every existing call site (fitment route, tools.ts, tiresvote.ts) already speaks this API; only /api/configurator/render stays dark unless upgraded.

### Wheel-Size Wheel Configurator plan (incumbent, full) — $1,570/yr (40,000 hits/day; INCLUDES all Business features + Configurator — it is not additive on top of $750). +$800 per additional website/app per the plan page.

- **Self-serve:** yes
- **Covers:** All 5 needs: fitment, wheel specs, reverse lookup, TiresVote ratings, and the server-rendered rim visualizer that /api/configurator/render already consumes.
- **Gaps:** Price is 2.1x the benchmark. The '+$800 USD per additional website or app' clause is ambiguous (period unstated; could arguably count SMS agent / storefront / admin app separately — confirm in writing). Single-vendor lock-in for all five features.
- **Switching effort:** Zero — restores the codebase exactly as shipped, configurator.ts included.

### CarAPI (carapi.app) — $199–$299/yr ($199 Base 1,500 calls/day; $599/yr Data Feed CSV)

- **Self-serve:** yes
- **Covers:** 0 of 5. Verified against its full OpenAPI spec and live demo calls: it is a year/make/model/trim/engine/VIN spec database with NO tire sizes, NO bolt patterns/offsets, NO reverse lookup, NO ratings, NO visualizer. Its one strength (trim hierarchy) duplicates the local pt-vehicle-*.json without the tire sizes that file already has. US-market only.
- **Gaps:** Everything Prince Tires needs. The prompt's 'CarAPI for fitment' hybrid is not actually possible — fact-check confirms zero fitment data.
- **Switching effort:** Moot — there is nothing to switch to. At most a redundant VIN/trim enrichment source that free NHTSA vPIC already covers.

### RideStyler (Burkson) — UNPUBLISHED; last public tiers (2017) were $120–$1,000/mo, i.e. $1,440–$12,000/yr — treat 2026 price as unknown but likely 2–5x the $750 benchmark

- **Self-serve:** no (sales call)
- **Covers:** (1) OE tire sizes, 84k+ configs, US+Canada; (2) excellent wheel specs — bolt pattern, hub bore, offsets, lug torque; (5) arguably the best photo-real visualizer in the segment (real photos, lift/lower, paint). Staggered and trim-level granularity: unconfirmed publicly.
- **Gaps:** No consumer ratings (UTQG-style tech specs only) — TiresVote feature dies. Reverse size→vehicles lookup undocumented — 'Fits N vehicles' badge at risk. Docs not publicly browsable pre-contract. ~4-employee vendor. Mandatory sales call.
- **Switching effort:** High — full adapter rewrite of every wheel-size-shaped call (JSON-RPC-style Vehicle/GetFitmentProfile model); tiresvote.ts deleted; /api/fits-vehicles possibly orphaned; visualizer gets easier (drop-in widget) but configurator.ts still rewritten.

### AutoSync Corp — UNPUBLISHED, sales-call only (no self-serve key, no trial); dealer/enterprise clientele suggests at or above $750

- **Self-serve:** no (sales call)
- **Covers:** (1) OE/optional/plus-size fitments, staggered first-class, US+CA regions, VIN + free-text vehicle query (nice for the SMS agent); (2) claimed at trim level but UNCONFIRMED without a key (vendor marketing only); (5) industry-best visualizer assets (powers Discount Tire) via client-side compositing.
- **Gaps:** No reverse lookup (forward-only API). No ratings anywhere in the spec. Response payload shapes untestable before a sales call. ICP mismatch: they monetize dealer visualizer + brand-catalog syndication, not raw fitment JSON.
- **Switching effort:** Medium-high — fitment normalization rewrite; /api/fits-vehicles has no upstream; tiresvote.ts dies; visualizer rebuilt from server-render to client-side compositing.

### DriveRight Data (Infopro) / TGP Solutions (ex-Tire Guides) — UNPUBLISHED, contact-sales; class typically lands in the thousands/yr. One Auto API side-door (£0.03–0.15/call) is UK-plate-based, likely useless for NA.

- **Self-serve:** no (sales call)
- **Covers:** The canonical highest-quality OE dataset: (1) OE + optional + winter-downsize fitments, staggered; (2) tgpMount explicitly has bolt circle, offset, hub, lug torque — US AND Canada confirmed for tgpSize; (3) achievable via flat-file license loaded into Neon (not a documented API endpoint); DRD also sells a real visualizer (separate enterprise contract).
- **Gaps:** No consumer ratings on any product. Pricing opaque; both companies mid-reorganization (Infopro acquisition, Tire Guides→TGP migration). Silver lining: a TGP license would retroactively legitimize the provenance-unknown pt-vehicle-*.json dataset.
- **Switching effort:** High one-time (ingest licensed tables into Postgres, serve locally) but then zero upstream quotas forever; tiresvote.ts and configurator.ts still lose their source.

### TireConnect by Bridgestone — ~$9,800 first year per its own 2020 sheet ($150 setup + $135/mo + Enterprise API $2,000 setup + $500/mo retainer); quota 1,000 req/hr

- **Self-serve:** no (sales call)
- **Covers:** Only (1), partially — vehicle years/makes/models/trims/tireSizes + byCarTireDouble (staggered), Canada-friendly — but oriented to sellable distributor inventory, not raw data.
- **Gaps:** No wheel specs (zero bolt/offset endpoints in the Swagger), no reverse lookup, no ratings, visualizer is a widget-only add-on. API is self-labeled 'Legacy' (v1 already decommissioned). Pricing rewards featuring Bridgestone — a conflict for a shop selling its own imported brands. ~13x the benchmark.
- **Switching effort:** Very high and mostly pointless — you must become a TireConnect dealer; only the YMM→tireSizes flow maps.

### Vehicle Databases (vehicledatabases.com) — $840/yr Starter (but only ~16 credits/day) up to $2,880–$6,000/yr at real few-hundred-hits/day volume; $50 test pack available

- **Self-serve:** yes
- **Covers:** (1) per-trim front/rear tire size by VIN or YMM, 1981–2026, staggered structurally supported; wheel diameter. Self-serve with published pricing — the only credible spec-API in the VIN-provider lane.
- **Gaps:** Bolt pattern/center bore appears only on a marketing page, NOT in documented responses (unverified). Canadian trim coverage unconfirmed. No reverse lookup, no ratings, no visualizer. Credit economics punish real-time traffic: 4–8x the benchmark at realistic volume; caching-into-own-DB rights unconfirmed.
- **Switching effort:** Moderate rewrite of the fitment layer (flat spec fields vs wheel-size fitment objects); /api/fits-vehicles, tiresvote.ts, configurator.ts all orphaned.

### RapidAPI 'Tire Size API' (APIcodex) — $120/yr (Pro $9.99/mo, 10,000 req/mo; free tier 100 req/mo)

- **Self-serve:** yes
- **Covers:** (1) YMM→OEM + alternate sizes and (3) size→vehicles reverse search — the exact 'Fits N vehicles' shape. Trivial integration (nearly the same shape as pt-vehicle-*.json).
- **Gaps:** 1 subscriber, 0 reviews, listed June 2026, unknown data provenance (suspiciously mirrors scraped datasets like the one the shop already holds), no SLA, staggered handling unclear, Canadian coverage unconfirmed. No wheel specs, ratings, or visualizer. Fine as a $10/mo failover; dangerous as primary.
- **Switching effort:** Trivial — but it adds almost nothing over the local JSON + a computed reverse index, which cost $0.

### Free/DIY stack (own pt-vehicle dataset + vPIC + UTQG) — $0 core; optional $215/yr Teoalida/DatabaseAtlas refresh for new model years

- **Self-serve:** yes
- **Covers:** (1) trim-level vehicle→size, 2001–2026, 72 makes, US/CA, staggered present (audited: 10,663 YMM rows, 39,634 trims); (3) fully solved — reverse index built from own files in <2s, demoed working; VIN decode via already-integrated free vPIC; (4) weakly, via free public-domain UTQG grades (treadwear/traction/temp — not stars).
- **Gaps:** Fatal: NO wheel specs anywhere free (vPIC has zero bolt-pattern/offset fields; wheel diameter blank on 11/15 test VINs). No visualizer. Staggered vs optional sizes conflated in unlabeled arrays — a liability for a tire installer. Dataset provenance unknown (TireSize.com-scrape lineage); goes stale each fall without a refresh source.
- **Switching effort:** ~1 day to re-point fitment at local data + hours for the reverse index; 1–2 days for a UTQG downgrade of the star features; bolt-pattern answers and visualizer simply removed.

## Hybrid strategies

### RECOMMENDED — Wheel-Size Business + local-first resilience layer — $750/yr

- **Get:** All 4 non-visualizer needs exactly as shipped, zero code rewrite, plus immunity to the failure mode that just happened: serve vehicle→size and the 'Fits N vehicles' badge from the local pt-vehicle-*.json + a precomputed reverse index FIRST, hitting wheel-size only for wheel specs, TiresVote ratings, and cache misses. Upstream usage drops from hundreds/day to dozens/day, and a future key suspension degrades the site gracefully (search and badges keep working; only bolt-pattern answers and stars pause) instead of blanking it.
- **Lose:** The rim visualizer stays dark (Configurator not included at $750). ~2–3 days of engineering for the local-first lookup, staggered-disambiguation heuristic, and fallback wiring.
- **Effort:** Low-medium: no API contract changes; add a local-lookup path in the fitment route + a build-time reverse-index JSON; keep tools.ts/tiresvote.ts untouched.

### Full-stack incumbent: Wheel-Size Configurator plan — $1,570/yr (includes Business features — replaces, not adds to, the $750)

- **Get:** All 5 needs restored with literally zero code changes — configurator.ts, tiresvote.ts, and the fitment route light back up on one key. Still add the local-first layer above for resilience.
- **Lose:** $820/yr premium for a nice-to-have visualizer; exposure to the ambiguous +$800-per-additional-app clause; deeper single-vendor lock-in.
- **Effort:** Zero code. Only buy if analytics show the rim visualizer actually drives engagement/sales.

### Free/DIY bridge (deploy NOW regardless, while the key is suspended) — $0 (optionally +$215/yr Teoalida refresh)

- **Get:** Vehicle→size search and 'Fits N vehicles' back online in ~1 day from owned local data; vPIC keeps VIN decode. As a permanent play it also zeroes the subscription.
- **Lose:** As permanent: bolt-pattern/rim answers in the SMS agent (no free source exists), TiresVote stars (UTQG grades are a visibly weaker substitute needing fuzzy matching), the visualizer, and staggered-vs-optional certainty. Three shipped, customer-facing features amputated or degraded, plus annual staleness risk and unresolved dataset licensing.
- **Effort:** ~1 day for fitment + hours for reverse index (already demoed); 1–2 more days if downgrading stars to UTQG.

### Own-the-data long game: local dataset + TGP flat-file license (tgpSize + tgpMount) — UNKNOWN until quoted — worth pursuing only if it lands ≤ ~$1,500/yr

- **Get:** Needs 1–3 served entirely from your own Neon Postgres with zero upstream quotas: confirmed US+Canada OE sizes since 1980 PLUS the missing bolt circle/offset/hub/torque data, staggered labeled properly, and retroactive licensing legitimacy for the existing static JSON. One email to start (sales contact, not enterprise procurement).
- **Lose:** Ratings and visualizer still need wheel-size (or get dropped); a real one-time ingestion build; both vendors are mid-reorganization (Infopro acquisition, Tire Guides→TGP migration) so contracting may be slow.
- **Effort:** Medium-high one-time (schema + ingest + serve locally), then near-zero ongoing. Send the quote request in parallel with renewing wheel-size — costs nothing to ask.

### Cheap failover only: local dataset + APIcodex Tire Size API — $120/yr (or $0 on the 100-req/mo free tier as pure emergency fallback)

- **Get:** A second independent source for vehicle→size + reverse lookup so no future suspension ever blanks search again; trivial integration.
- **Lose:** Adds almost nothing over the free local index; unknown provenance, 1 subscriber, no SLA — insurance, not a provider. No wheel specs/ratings/visualizer.
- **Effort:** Hours.

### NOT VIABLE — 'CarAPI for fitment + drop ratings' — $199/yr (wasted)

- **Get:** Nothing needed: fact-check confirmed via full OpenAPI scan + live calls that CarAPI has zero tire sizes, wheel specs, reverse lookup, ratings, or visualizer. Its trim hierarchy duplicates the local JSON minus the tire sizes.
- **Lose:** All five needs would still be unmet; $199/yr for data vPIC gives free.
- **Effort:** N/A — eliminated on capability, not price.

## Candidate verdicts (fact-checked)

### CarAPI (carapi.app)

CarAPI is real, alive, cheap ($199-$299/yr, cheaper than wheel-size's $750), self-serve, and genuinely well-documented — but it is the wrong product. It is a year/make/model/trim/engine/VIN spec database, not a fitment database: verified against its full OpenAPI spec, live API responses, and its own attributes endpoint, it contains no OE tire sizes, no staggered fitments, no bolt patterns, no rim sizes/offsets, no tire-size-to-vehicle reverse lookup, no tire ratings, and no visualizer — i.e., zero of Prince Tires' five requirements. Its one strength (trim hierarchy) merely duplicates the local pt-vehicle-*.json dataset without the tire sizes that dataset already has. Do not switch to CarAPI as a wheel-size replacement; at most it is a complementary VIN/trim enrichment source (largely redundant with free NHTSA vPIC), and paying $199 for it would still leave you needing wheel-size.com or another true fitment provider for everything that actually broke.

*Fact-check notes:* NONE. Both decision-critical claims re-verified independently on 2026-07-05. (1) Fitment data: fresh download of the OpenAPI spec (v2.2.2) shows 0 hits for tire/bolt/offset/stagger; all "wheel" hits are wheel_base/front_track/rear_track; 0 non-trim "rim" hits; the 2 "lug" hits are "plug-in hybrid". Live calls confirm: /api/trims/v2 (2018 F-150) returns trims+MSRP only; /api/bodies/v2 returns chassis dimensions only; /api/vehicle-attributes enumerates only bodies.type + engines.* — no tire sizes, bolt patterns, rim/offset, reverse lookup, ratings, or visualizer anywhere. (2) Pricing: carapi.app/pricing confirms Base $199/yr = 1,500 calls/day, Plus $249/yr = 3,000/day (page literally says "Equivalent to $20.75 per month"), Premium $299/yr = 6,000/day; all tiers include YMM 1900-2027, submode

### RideStyler (Burkson LLC, Wilsonville OR — ridestyler.com / RideStyler Showcase)

RideStyler is alive and legitimate in 2026 — actively maintained API, US+Canada vehicle catalog, excellent bolt-pattern/offset/hub data, and probably the best photo-real rim visualizer in the segment — but it is a poor like-for-like swap for wheel-size at this budget. It has no self-serve signup, no published pricing (last public tiers in 2017 started at $120–$300/mo, i.e. $1,440–$3,600/yr, already 2–5x the $750 benchmark), no consumer tire ratings to replace TiresVote, an unconfirmed reverse lookup for the "Fits N vehicles" badge, and a full adapter rewrite for every wheel-size-shaped call. Bottom line: paying wheel-size $750/yr keeps 4 of 5 requirements (or all 5 at $1,570 with Configurator) with zero code changes; RideStyler is only worth the 24-hour sales call if the photo-real visualizer becomes a genuine priority and they will quote a bundled all-in price at or below ~$1,500/yr — and even then Prince Tires would need a second source for tire ratings.

*Fact-check notes:* Both key claims verified against primary sources; essentially all checks out. PRICING — CONFIRMED VERBATIM: live ridestyler.com/pricing returns 404 today; Wayback CDX shows /pricing 200s historically with first 302 capture 2017-05-26 (matches "May 2017 onward"); the cited Apr 25, 2017 snapshot shows exactly In Store $120/mo (kiosk, 1 location), Web $300/mo (up to 5 locations, 1,000 Web Visualizer Credits), Web Premium $1,000/mo (up to 5 locations, 5,000 credits), Enterprise = Call (unlimited locations), monthly billing, no setup fees, cancel anytime. Researcher's caveat that these are 2017 visualizer-plan prices (not current API pricing) is correct. FITMENT DATA — CONFIRMED: live /data/vehicles/ states 84,000+ vehicles, 80+ makes, U.S. and Canadian, coverage into the 1940s, "both standard 

### AutoSync (AutoSync Corp — autosynccorp.com / api.autosyncstudio.com; NOT autosync.com, which is a parked GoDaddy for-sale domain, and NOT the unrelated $19/mo Shopify app "AutoSync" by ARK Solutions UK)

AutoSync Corp is real, alive, and technically credible in 2026 — a well-documented REST API with trim-level US+Canada vehicle data, OE/optional/plus-size fitments, staggered support, VIN decode, and the best wheel visualizer assets in the industry (it powers Discount Tire's visualizer). But it is the wrong shape for Prince Tires as a wheel-size replacement: pricing is unpublished and sales-call-only (no self-serve key, no trial), its business model is dealer visualizer + wheel/tire brand-catalog syndication rather than à-la-carte fitment data, it has NO tire ratings (TiresVote has no equivalent) and NO tire-size→vehicles reverse lookup, so two of the five required capabilities die outright and the visualizer/fitment code would need rewrites, not adapter swaps. Bottom line: do not switch to AutoSync to save money — it almost certainly won't be cheaper than $750/yr once a sales rep is involved, and it deletes features. The only scenario where a demo call is worth it: if the rim visualizer becomes a strategic priority and $1,570/yr for wheel-size Business+Configurator feels steep, AutoSync's visualizer (possibly bundled via a distributor program like The Wheel Group, or via TireConnect) could be the one thing they do better — treat it as a visualizer-only add-on conversation, not a fitment-API replacement.

*Fact-check notes:* Both decision-relevant claims verified against primary sources. PRICING — CONFIRMED: autosynccorp.com has no pricing/trial content (CTAs = inquiry form, phone 714-584-8584, Calendly); /pricing/ probes 404; portal.autosyncstudio.com has login only, no registration (no self-serve confirmed); X-Cart "no separate license, no add-on fees" quote verified verbatim; Shopify-app disambiguation verified exactly — "AutoSync" by ARK Solutions, Derby, England at $19/$49/$99/$179 PER MONTH (with a 7-day free trial, a detail the claim omitted), unrelated YMME parts-mapping app. FITMENT — CONFIRMED structurally: downloaded the live OpenAPI spec (19 endpoints as claimed); GET /vehicles has f-year/f-make/f-model/f-submodel, f-region US|CA, f-vin ("Requires VIN lookup to be activated"), f-query, ACES IDs, an

### DriveRight Data (Infopro Digital) / Tire Guides Inc (now TGP Solutions LLC) — and — TireConnect by Bridgestone

Neither option beats paying wheel-size.com $750/yr for what Prince Tires actually uses. TireConnect is alive and even Canada-friendly, but it is a Bridgestone dealer storefront/ordering platform, not a fitment-data API: its enterprise API costs ~$2,000 setup + ~$635/mo all-in (10x the benchmark, per its own 2020 sheet), rides on a self-described 'Legacy' API, and covers only requirement #1 (vehicle→tire size) — no bolt patterns, no reverse lookup, no ratings, no render API. DriveRight/Tire Guides is the opposite problem: it is the canonical, highest-quality OE dataset and genuinely covers requirements #1–#3 (TGP's tgpSize+tgpMount explicitly include US+Canada, staggered, bolt circle, offsets, torque; DRD adds a real visualizer product), but everything is UNPUBLISHED contact-sales pricing through companies in mid-reorganization (Infopro acquisition; Tire Guides→TGP migration), and neither offers TiresVote-style ratings. Practical recommendation: renew wheel-size Business at $750/yr (it uniquely covers 4 of 5 needs on one key with self-serve billing), and in parallel email TGP Solutions for a tgpSize+tgpMount flat-file quote — if it comes in anywhere near $750–1,500/yr it is the better long-term play (own the data locally in Postgres, kill per-call quotas, add the missing bolt-pattern/rim specs, and clean up the licensing of the existing static JSON dataset). Skip TireConnect unless the shop later wants distributor-connected e-commerce checkout rather than data.

*Fact-check notes:* NONE material — both decision-critical claims verified against primary sources. (1) TireConnect pricing: the cited 2020 PDF was fetched and read page-by-page; it confirms $150 account setup, Standard Retail $135/mo ($100/mo with Bridgestone featured in top 2), $40/mo extra locations, $10/loc/mo logo removal, $10/loc/mo Wheel Visualizer Integration, and Enterprise API integration = $2,000 initial setup + $500 maintenance retainer "over and above applicable monthly fees" with API quota of exactly 20 req/s / 240 req/min / 1,000 req/hr. Capterra confirms current starting price CA$135 per user per month, no free trial, updated March 13, 2026. Two minor nuances: (a) the $500 retainer is implied monthly ("no monthly rollover", "over and above applicable monthly fees") but not printed as "$500/mo"

### VIN/vehicle-data provider group: DataOne Software, VinAudit, CarMD, Vehicle Databases (vehicledatabases.com), + RapidAPI marketplace ('Tire Size API' by APIcodex; wheel-size.com NOT on RapidAPI)

Within the VIN/vehicle-data-provider lane, nothing replaces wheel-size Business at $750/yr. The only provider with confirmed per-trim front/rear tire size + wheel size and self-serve published pricing is Vehicle Databases, but at $0.05-0.25/credit even a few hundred upstream hits/day costs $2,880-$6,000/yr, it lacks reverse lookup, ratings, and the visualizer, and its bolt-pattern claim is unverified in the docs; its cheap RapidAPI Pro tier ($14.99/mo) caps out around 40 calls/day. DataOne and VinAudit both have real per-trim tire data (DataOne with explicit US+Canada coverage) but sell via unpublished custom quotes and sales calls — an enterprise cycle for a small shop. CarMD is a diagnostics API with zero tire/wheel data and a currently unreachable developer portal — eliminate. The RapidAPI marketplace offers no wheel-size listing (no monthly undercut exists), only a brand-new one-subscriber 'Tire Size API' at $9.99-29.99/mo that duplicates what Prince Tires' local pt-vehicle-*.json already does plus reverse-by-size. Bottom line: pay wheel-size the $750/yr — it is genuinely the cheapest thing on the market that covers priorities 1-4 on one key; optionally keep the local JSON + the $9.99/mo APIcodex API as a failover so a future suspension never blanks the search again, and only revisit Vehicle Databases (via a $50 test pack) if wheel-size raises prices or the bolt-pattern claim proves out at Starter-tier volumes.

*Fact-check notes:* Both decision-relevant claims verify against live sources. (1) PRICING — all confirmed exactly: wheel-size Basic $450/yr (5k hits/day), Business $750/yr (30k hits/day + TiresVote REST API access), Premium $2,000/yr, Configurator $1,570/yr (40k daily, +$800 USD per additional site); Vehicle Databases pricing PDF matches every quoted figure (test packs $50/200 + $100/450 one-time; monthly $100/$180/$360/$500/$800/$2,500 with 500/1,200/3,000/5,000/10,000/50,000 credits and $0.24 Starter overage; yearly $840/$1,440/$2,880/$4,200/$6,000 with 6,000/14,400/36,000/60,000/120,000 credits per YEAR; PAYG $0.25 down to $0.10/credit); RapidAPI APIcodex Tire Size API confirmed via page-embedded JSON: free 100 req/mo HARD cap, Pro $9.99/mo 10,000, Ultra $29.99/mo 100,000, Mega $99.99/mo 500,000 (all mont

### Free/DIY stack: NHTSA vPIC (VIN/vehicle identity) + shop's own pt-vehicle dataset (fitment) + NHTSA UTQG (ratings), optionally topped up with a $215 one-time Teoalida/DatabaseAtlas purchase

The free path genuinely covers needs 1 and 3 today — the shop's own 2001-2026 dataset plus a precomputed reverse index handles vehicle→tire-size (trim-level, staggered-ish, US/Canada) and 'Fits N vehicles' entirely offline, and vPIC (free, already integrated) keeps VIN decode. But be clear-eyed about the rest: vPIC contributes zero fitment data (no tire-size or bolt-pattern fields exist; even wheel diameter was blank on 11 of 15 test VINs), no open-source OE fitment or bolt-pattern dataset exists, UTQG is only a weak stand-in for TiresVote stars, and nothing replaces the rim visualizer. So going free means: accept dropping/downgrading needs 2, 4 and 5 (all shipped, customer-facing features), take on an annual ~$215 Teoalida refresh (unconfirmed license) or re-scrape to stay current, and live with unlabeled staggered-vs-optional size ambiguity — legally probably tolerable, operationally a real downgrade. As a bridge or emergency fallback while the wheel-size key is suspended it's excellent (needs 1+3 can be re-pointed at local data in ~a day); as a permanent answer it only beats $750/yr if the shop is willing to amputate the wheel-spec answers, star ratings and visualizer it just shipped. If those stay in scope, the free stack is best used to slash wheel-size API usage (local-first lookup, upstream only for wheel specs/ratings), not to eliminate the subscription.

*Fact-check notes:* NONE material — both decision-relevant claims re-verified against primary sources. (1) Pricing confirmed exactly: DatabaseAtlas tires-by-vehicle $214.58 USD one-time / tires-by-brand $121.47 / both $299.00, all with "FREE updates for 1 year" stated on-page; coverage counts (70 makes, 1,571 models, 15,208 years, 53,645 trims) and the "12 March 2026" update with 2026 models match verbatim; TireSize.com scrape origin and front/rear flagging confirmed on-page; teoalida.com/cardatabase/tiresize/ 301s to databaseatlas.com. TyresAddict confirmed: Fitment DB $95 incl. 1 year of updates, renewal updates $50 (Fitment DB line on updates price list), pack $180, Tyre DB $88 / Wheel DB $75, PCD/centerbore/offset/nut/bolt fields, payment "will be convert to RUR", Russia/Ukraine/Belarus site focus; NA cov

### Tire model ratings/reviews API alternatives (TiresVote replacement): Tire Rack, SimpleTire, TireBuyer, Discount Tire, 1010tires, Consumer Reports, aggregators — vs. TiresVote via Wheel-Size Business plan

Verified: there is no clean, self-serve, commercially-licensed alternative to TiresVote for tire model ratings via API. Tire Rack, Discount Tire (Treadwell), SimpleTire, and 1010tires publish no API or data-licensing program at all; TireBuyer is defunct (rebranded Treadsy, swept into ATD's Oct 2024 bankruptcy); Consumer Reports prohibits commercial use and its RapidAPI listing is an unofficial scraper; cheap spec databases (TyresAddict, $88-90/yr) explicitly exclude ratings; and aggregators like Datafiniti sell raw scraped review text, not the curated star-score/pros-cons/price-segment shape your product cards and PDP badges consume. TiresVote itself is NOT sold standalone or via RapidAPI — the only path is the Wheel-Size Business plan at $750/yr (30k hits/day), which is simultaneously the fitment plan covering priorities 1-3. Bottom line: if the star ratings/pros-cons/segment feature stays, the $750/yr Business plan is not just competitive — it is the only turnkey option on the market, and it buys the fitment stack in the same purchase; the alternatives are dropping ratings, generating them editorially/with an LLM (no licensing cost, but no third-party authority), or a bespoke licensing conversation with Tyre Reviews/1010tires with unpublished pricing and real integration work.

*Fact-check notes:* Both decision-critical claims verified against primary sources; two sub-details downgraded to UNCONFIRMED.

VERIFIED — Pricing (api-demo.wheel-size.com/api-plans/, corroborated by developer.wheel-size.com): Sandbox free 300 hits/day (testing only); Basic $450/yr 5,000 hits/day with /upsteps/ but NO TiresVote; Business $750/yr 30,000 hits/day explicitly listing "Access to Tiresvote.com REST APIs" (swagger link api.wheel-size.com/v2/tires/swagger/, matching the zero-rewrite same-host /v2/tires claim); Premium $2,000/yr 150,000 hits/day; Wheel Configurator $1,570/yr 40,000 hits/day (all Business features + Configurator). All billing is yearly with no monthly option, and no standalone TiresVote/tires-only plan exists on the page. So Business $750/yr is confirmed as the minimum ratings tier.

V
