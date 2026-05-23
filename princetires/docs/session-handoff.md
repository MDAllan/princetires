# Prince Tires — Session Handoff Log

> Running log of work sessions. Hand the path to this file (or paste it) at the
> start of a new session so the agent picks up full context.
>
> **Structure:** stable project facts up top, then a living "Open loose ends"
> list, then an append-only **Session Log** (newest first).
> New sessions: add your entry to the TOP of the Session Log and update
> "Open loose ends".

---

## Project constants (rarely change)

- **Live theme:** "Copy of Dawn" `#186307215635` on `prince-tires-5560.myshopify.com` → princetires.ca
- **Theme repo:** `princetires/` — Shopify Liquid theme
- **Admin app:** `princetires-app/` — separate Next.js app, own git repo, Shopify Admin API token in `.env.local` (used for bulk product/metafield writes)
- **Push command:**
  `shopify theme push --theme=186307215635 --only=<file> --allow-live --store=prince-tires-5560.myshopify.com --no-color`
- **Cache:** storefront edge cache flips in 1–15 min. Poll a URL for a marker before testing live.
- **Inventory scale:** ~3,878 tire products, ~62 vendors, ~849 models.
- **Reference file:** `princetires/docs/tire-catalog.json` — inventory snapshot (vendors / models / sizes / specs). Regenerate with `princetires-app/db/build-tire-catalog.mjs`.
- **Status + code maps:** `docs/PROJECT-STATE.md` (build-status dashboard — what's done, what's left), `princetires-app/ARCHITECTURE.md` + `princetires/ARCHITECTURE.md` (per-repo code maps, kept in sync with code). Read these first to orient.
- **App deploy:** `princetires-app` auto-deploys to Vercel on push to `main`. Requires `GEMINI_API_KEY` env var (server-side Gemini proxy). DB = Neon; migrations in `db/NNN-*.sql` are applied manually (no runner).
- **GitHub auth:** `princetires111-oss` has Write on both `MDAllan/princetires` (theme) + `malla762/princetires-app` (app).
- **Tests:** Playwright specs in `princetires/tests/`. Run: `npx playwright test tests/<spec> --project=chromium`.
- **Ubersuggest MCP:** connected at user scope (`~/.claude.json`) — `https://ubersuggest-mcp.neilpatelapi.com/mcp`, OAuth. 37 SEO tools (`ubersuggest__*`: domain / keyword / backlink / site-audit / rank-tracking). Tools load into a session only after a window reload following the connect. The OAuth token expires between sessions — when a session reports "token expired", re-authorize in the browser, then **reload the window**: an already-running session won't pick up the refreshed token in place, even after a successful browser auth.
- **Product metafield `custom.install_price`** (`number_decimal`, dollars; added 2026-05-19) — drives the install total in `pt-booking-modal.liquid` (`data-install-price` attribute). Set on all 3,883 tire products. Backfill / repair via `princetires-app/db/backfill-install-price.mjs` (idempotent; dry-run by default, `--apply` to write).
- **Next.js 16 dynamic rendering** — route segment config `export const dynamic` / `revalidate` / `fetchCache` were removed in v16 (when Cache Components is enabled). Use `await connection()` from `next/server` to opt a page out of prerendering. Reference: `princetires-app/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`.

## Open loose ends (update every session)

- **Code-review backlog (2026-05-15)** — `docs/code-review-2026-05-15.md`. SEC-1 + SEC-2 both **RESOLVED** (SEC-1 was deleted in princetires-app commit `757db83`; remaining 3 token-using files all consume server-side, no leak into responses — verified 2026-05-23). Still open: 7 critical / 16 high issues (collection sidebar Stud filter never renders, AJAX cart badge wrong target, 3 conflicting Product JSON-LD blocks, competing LocalBusiness schemas, contradictory hours, review-count mismatch).
- **Roadmap Phases 4–6 not started** — Phase 4 wholesale portal data, Phase 5 staff B2B cockpit (`orders-create` webhook is still an HMAC-only stub), Phase 6 inventory & containers. Phases 0–3 + 3.5 all built + live. See `docs/PROJECT-STATE.md`.
- **Untested (need staff login)** — `/admin/services` add/delete and the rebuilt `/admin/customers` CRM compile + deploy clean but weren't click-tested.
- **Old Gemini key** — confirm the pre-rotation key is deleted in Google AI Studio (the new key is live in Vercel as `GEMINI_API_KEY`).
- **Deferred** — booking caps + "next available" hint (Phase 2 follow-up); housekeeping (archive stale plan docs to `docs/archive/`, triage ~15 loose `princetires-app/db/*.mjs` scripts).
- **Ubersuggest SEO program — W4–W6 pending** — W1–W3 done (`docs/seo-baseline-2026-05-17.md`). Remaining: W4 content/AEO calendar, W5 backlink-gap → directory submissions, W6 rank-tracking project. Also pending: W2 local-independent competitor profiling; Tier-2/Tier-3 from the W3 build list.
- **Service-page cleanup leftovers** — (a) **3 competing hub pages** — `services` / `all-services` / `services-overview` — collapse to one (`/pages/services`). (b) Update the Shopify nav-menu links to point at the canonical service pages / collections directly (the 301s catch old links, but direct is cleaner). (c) Optimize `/collections/tires` + `/collections/wheels` with proper SEO copy — they now receive the `tire-sales` / `wheels-and-rims` redirects and should rank for "tire sale calgary" / "wheels and rims calgary" (W3 Tier-2).
- **`page.fleet-tires-calgary.json`** renders "Starting from Contact us for fleet pricing" — blank its `price_range` (badge then hides) or reword.
- 2 stale failing tests — `collection-phase1.spec.js` #4 (rim-pill) + #5 (results count). Test UI removed in earlier sessions. Fix or delete.
- 84 tires still missing `custom.tire_model` — re-run `princetires-app/db/fill-tire-models.mjs`.
- Garage-banner "Yes filter" button reported unclickable by the user — tested headless, worked; never confirmed the user's browser/context.
- `greenmax` vendor casing + `Durun`/`Durutun` possible duplicate — left as-is deliberately (judgment calls).
- Compare is hidden on mobile — deferred to a future PDP-based compare flow.
- **Sentry source-map upload failing (2026-05-19)** — `princetires-app/next.config.ts` has `org: "tire-sync", project: "princetires-app"` which Sentry's API rejects ("Project not found"). Need the real org/project slugs from `sentry.io/organizations/<ORG>/projects/<PROJECT>/...`, plus `SENTRY_AUTH_TOKEN` set in Vercel env vars (only `NEXT_PUBLIC_SENTRY_DSN` is set). Non-fatal — builds succeed; error stack traces stay minified.
- **Verify Neon autosuspend is on (2026-05-19)** — newly on Launch (usage-based, ~$15/mo typical). Confirm the production compute's autosuspend is ~5 min (Neon dashboard → Branches → click compute → "Suspend after"). Disabled autosuspend = compute runs 24/7 and the Launch bill balloons.
- **Shopify CLI auth dropped (2026-05-20)** — I ran `shopify auth logout` mid-session in response to a transient 401 (which was actually a Shopify API blip, not an auth problem). CLI now needs `shopify login --store=prince-tires-5560.myshopify.com` to be re-established. **Workaround already in place** — new `princetires-app/db/push-theme-assets.mjs` pushes any theme file via the Admin API token (no CLI required); use this until the CLI is back.
- **Manual QA: Garage Add by VIN flow (2026-05-20)** — 8-scenario checklist in `princetires/tests/garage-vin-add-MANUAL.md`. Requires login at https://princetires.ca/account/login. The Playwright spec skips when logged-out (4 specs skipped, expected).
- **Commit + push today's search session (2026-05-20)** — theme branch `phase-4-wholesale-portal` has uncommitted: `sections/hero-smart-search.liquid`, `sections/pt-header.liquid`, `sections/my-garage.liquid`, `snippets/pt-header-search-enhance.liquid`, `templates/index.json`, `assets/my-garage.js`, 4 new specs (`tires-wheels-tabs`, `wheel-fitment-card`, `vin-paste-search`, `garage-vin-add`), plus the manual-QA `.md`. App branch (`princetires-app`) has uncommitted: `src/app/api/decode-vin/route.ts`, `src/app/api/wheel-fitment/route.ts`, `src/lib/rate-limit.ts`, `db/push-theme-assets.mjs`. The app needs the `WHEEL_SIZE_API_KEY` env var added to Vercel (rotate the leaked key first), then a deploy.
- **Bulk fleet VIN batch decode (deferred 2026-05-20)** — vPIC use-case #3 from the `nhtsa-vpic` skill. Wholesale/B2B customers paste up to 50 VINs at once; we call `decodevinvaluesbatch` and bulk-add them to the customer's garage. Skill has the endpoint + cache pattern; no code yet.
- **Wheel storefront filters need manual enable (2026-05-20)** — 4 new metafields (`bolt_pattern`, `rim_width`, `rim_offset`, `center_bore`) are populated on 38-39/41 wheels but NOT yet shown as storefront filters. Shopify Admin API doesn't expose the Search & Discovery filter toggle — must be done manually. 60-second checklist in `princetires/docs/wheel-storefront-filters-MANUAL.md`. Until enabled, the smart-search "Wheels that fit your car" CTA URL parameter is silently ignored. `adminFilterable` capability HAS been enabled via API on all 4.
- **1 wheel straggler remaining** — `Armed Offroad Havoc Wheels` (no specs in title or body — admin body just says "Brand: Armed Offroad · Vehicle Firmament: Light Trucks"). Merchant needs to look up the supplier spec sheet (or de-list). The other 2 stragglers (Envy FF-1 18x8 + Envy 546GM EV-5 16") were filled 2026-05-22 by `db/fill-wheel-stragglers.mjs` which parses the body-HTML spec lines pasted by the merchant. After today's fill: 40/41 bolt_pattern · 40/41 rim_diameter+width · 39/41 center_bore · 25/41 rim_offset (steel/trailer wheels rarely list ET — accurate, not a gap).
- **`/search` page redirects to homepage instead of showing results** — flagged in earlier sessions, still not fixed. The universal header search now falls through to `/search?q=…` for non-shortcut queries (per user's choice), so this needs to be addressed — likely a `templates/search.json` issue. Verify the search template renders results, not redirects.
- **Pay-before-booking spec drafted (2026-05-20)** — design approved + committed at `princetires/docs/specs/2026-05-20-pay-before-booking-design.md`. Implementation deferred until traffic justifies it. Two-button modal ("Book — pay at shop" stays / "Pay now & confirm" is new); pay-now POSTs to `/api/book` with `intent: "pay_now"`, redirects to Shopify checkout with `booking_id` cart attribute; `orders/create` webhook flips status `pending_payment` → `confirmed`. Tier B = full pay, Tier A = `$50/tire` deposit (configurable). Always-refundable via Shopify `refundCreate` from both `/cancel/[token]` and `/admin/bookings/[id]`. Pieces already in place: the `orders/create` webhook stub, the 7 unlisted Service products, the `/cancel/[token]` page, Shopify Payments.
- **Footer visual QA (2026-05-21)** — restructured into 3 content columns (All Tires / Services / Popular pages) plus Contact + Newsletter = 5 right-side cols at 1300+ desktop. Between 1100–1299px the grid collapses to 4 cols and newsletter wraps to row 2. Eyeball across breakpoints once CDN flushes; tighten media queries in `sections/pt-footer.liquid` if the 5-col row looks cramped.
- **BFGoodrich brand template gap (2026-05-20)** — `templates/page.brand-bfgoodrich.json` has no `season: "All-Weather"` model block, but BFG Advantage Control IS in the new `/pages/all-weather-tires-calgary` brand grid (and BFG is in the all-season brand grid). Either add an "Advantage Control" AW model block to the BFG template (matches the pattern of e.g. Cooper's Traction Command block), or remove BFG from the AW landing-page brand grid. ~10-min decision.
- **Push commits to origin** — branch `phase-4-wholesale-portal` has `edff591` (2026-05-20 landing-page network) + `90575df` (2026-05-20 footer + tpms-calgary) + next commit (2026-05-21 aggregateRating + footer enrichment) all unpushed. User hasn't asked yet. Push (or merge to `master`) when ready.
- **Optional Phase 2 brand-page links (2026-05-20)** — Cooper, Firestone, General brand templates have W + AW models registered and could get contextual landing-page links in their `intro_richtext` / `calgary_richtext` per the same pattern used on the top 5 (Michelin · Bridgestone · Toyo · Continental · Yokohama). Skipped today because diminishing returns past 5 brand-page sources. Do if you want a complete brand-page coverage story.
- **BUILD `/pages/wheels-and-rims-calgary` — biggest unrealized SEO opportunity (2026-05-20)** — Good Tire's `/wheels-rims-calgary/` page owns ~2,993 monthly organic visits across 9+ wheel/rim keywords ("rim calgary", "rims calgary", "wheels calgary", "calgary wheels rims", "tires and wheels calgary", "tires rims calgary", "calgary rim shop", "wheels and rims calgary" — all pos 4 at vol 720 each). Prince has zero presence. Use the same 5-section template pattern from this session (`pt-calgary-service` → `pt-tire-explainer` → `pt-tire-brands` → `pt-tire-fit-guide`) but populate brand cards with wheel brands: XF Off-Road · Armed Offroad · RTX · ENVY · RSSW (the 5 confirmed wheel brands in inventory per `prince-tires-content` skill). Plus optional `/pages/used-tires-calgary` (Good Tire owns "used tires calgary" pos 4 vol 880) — only if Prince actually sells used tires (verify with owner; not in current inventory).
- **Spot-check schema rendering on the 3 new tire landing pages (2026-05-20)** — `main-page.liquid` doesn't read `custom.schema_jsonld`, so the schema is auto-rendered via `snippets/schema-local-business.liquid` (global) + `schema-faq` (inside pt-calgary-service). Confirm via View Source on each new page that LocalBusiness + AggregateRating + FAQPage all appear on `/pages/winter-tires-calgary` · `/pages/all-weather-tires-calgary` · `/pages/all-season-tires-calgary`. Earlier check on the live homepage showed `Organization, AutoRepair, FAQPage, AggregateRating with 6 Review entries` — strong; the landing pages should at minimum match the AutoRepair + FAQPage portion.
- **`/collections/tires` collection description (2026-05-20)** — original linking plan included adding a "Shop by season" callout in the collection description, linking to all 3 tire-type landing pages. Not done. Mid-effort (the collection page sees traffic from every tire-product crawl + the main shop nav).
- **`/pages/tpms-service` legacy duplicate (2026-05-21)** — 914-byte page covering TPMS, predates the new `/pages/tpms-calgary` (created 2026-05-21). Footer now links to the new canonical. Set up a 301 redirect from `/pages/tpms-service` → `/pages/tpms-calgary` via Shopify Admin → Online Store → Navigation → URL Redirects, then delete the legacy page. Same treatment for `/pages/tires-1` (207-byte draft duplicate of `/pages/tires`).
- **Avada HTML sitemap pages (2026-05-21)** — 5 pages (`avada-sitemap`, `-articles`, `-blogs`, `-collections`, `-pages`) totaling ~25k bytes, generated by an old Avada SEO app. Indexed by Google and provide some internal-linking value, but no longer auto-updated. Decision: keep as-is OR delete + replace with a hand-maintained `/pages/sitemap` (low priority — `/sitemap.xml` already covers SEO).
- **Meta still missing on 6 utility pages (2026-05-21)** — `garage`, `sign-in`, `wheel-quote`, `find-tires`, `data-deletion`, `rapid-search-results`. Internal/non-SEO purposes. Skip unless you want 100% coverage.
- **Verify rich-results validator (2026-05-21)** — once CDN flushes, paste 2–3 representative URLs into https://search.google.com/test/rich-results to confirm: AutoRepair + AggregateRating + FAQPage all detected. Manual user step.

## Don't rebuild (tried + reverted)

- "Popular models" pill row on the collection page — user found it visually busy.
- `tire-knowledge.md` full spec scaffold — maintenance trap (specs belong on manufacturer sites / Shopify metafields).
- `active-promos.md` — user decided a hand-maintained promo file isn't needed.
- **Vehicle-based install pricing in `pt-booking-modal.liquid`** (removed 2026-05-19) — install price is now per-product via the `custom.install_price` metafield; vehicle only drives appointment duration. The `vehs[].price` table, the `$120` trailer flat, the `$40` low-profile floor, and the low-profile add-on row are all gone. The OTHER two booking surfaces (`pt-booking-page.liquid`, `pt-service-booking-modal.liquid`) still use by-vehicle because they have no product to read from. See the `booking-install-pricing` memory + the Exception note in the `prince-tires-booking` skill.
- **Cherry-picking booking fix `2a8a170` to master** (2026-05-19) — `master` is 11 commits behind `phase-4-wholesale-portal`; would conflict on 3 of 5 files. Let phase-4 merge naturally.
- **Aggressive mobile auto-scroll on input focus** (2026-05-20) — first attempt fired `scrollIntoView` on focus + on every keystroke, anchoring the input flush with viewport top (12px). User found it too aggressive ("scrolls up too much"). Reverted to **visualViewport.resize-only**, with a 30%-comfort-band skip and a softer 50px landing target. Don't re-add focus-based scroll or onInput re-anchor — `visualViewport.resize` is the only correct trigger.
- **Aggressive header overlay mobile `margin-top: 14px`** (2026-05-20) — same complaint family. Reverted to `24px`. Don't push it lower.
- **Tire-type links in header nav** (2026-05-21) — added 3 nav_link blocks (Winter / All-Weather / All-Season) to `sections/header-group.json` between Services and Brands; user decided 9 items was too crowded and the existing inbound footprint (footer + homepage cards + brand-page contextual links + reciprocal landing-page links + comparison blog) was already strong enough. Reverted same session. Don't re-add to the header — rely on footer + homepage discovery instead.

---

# Session Log

## 2026-05-21 — Site-wide SEO meta sweep · aggregateRating in JSON-LD · footer restructure · TPMS page · 9 empty-page deletes

Continuation of yesterday's landing-page network session. Focus shifted from page creation to site-wide SEO hygiene: meta tags, JSON-LD upgrade, navigation cleanup, and page-cruft removal. Commits to ship after this session entry: `pt-footer.liquid` (4 new links) + `snippets/schema-local-business.liquid` (aggregateRating).

**JSON-LD aggregateRating — global upgrade** — `snippets/schema-local-business.liquid` now emits an `AggregateRating` block (4.9 / 562 reviews) inside the AutoRepair object. Placed after `priceRange` and before `currenciesAccepted`. No Liquid conditional wrapping — renders on EVERY page that includes this snippet (homepage, brand pages, services hub, service detail, all 4 tire-type landing pages, collection pages). Verified via curl + JSON-LD parse on 6 sample pages. Big LLM/AI-SEO win — AI engines that scrape the AutoRepair entity now see the rating signal alongside address/hours/etc.

**SEO meta sweep — 49 pages set with custom `global.title_tag` + `global.description_tag`** — coverage went from 11/74 (15%) → 52/65 (80%). Equivalent to the Shopify Admin UI "Search engine listing preview" fields (same data, two ways to write it).
- **4 tire-type landing pages** (winter / all-weather / all-season / tpms-calgary — most of these were already set yesterday)
- **20 brand pages** — bulk-generated from each brand's template; titles "{Brand} Tires Calgary | Price Match & 4.9★ | Prince Tires" (or Wheels for ENVY/RTX/XF Off-Road); descriptions mention top 2 model names pulled from the brand template's model blocks (e.g. Michelin → "CrossClimate2, X-Ice Snow and more"). All under 65 chars title / 158 chars description.
- **11 core service + booking pages** — about, contact, booking, services, all-services, brands, tire-installation-calgary, tire-repair-calgary, tire-rotation, tire-balancing, seasonal-tire-change-calgary. Some hand-written, some templated.
- **14 tire-category + wholesale + legal + hubs** — summer-tires, performance-tires, light-truck-tires, trailer-tires, wholesale, wholesale-register, wholesale-portal, privacy-policy, terms-of-use, returns-policy, returns-warranty, road-hazard-protection, faq, tires.
- 4 descriptions ran 161–168 chars on first POST; tightened to ≤159 in a follow-up PUT. All now Google-safe.

**Footer "TPMS Service" link + new page** — `templates/page.tpms-calgary.json` existed but was orphaned (no page assigned). Created `/pages/tpms-calgary` via Admin API (id `177684775187`) with title_tag + description_tag metafields, then added to footer Services column. CTA in template normalized from "Book TPMS service" → "Book now" to match the all-weather/winter/all-season pattern. Note: there's a SEPARATE legacy `/pages/tpms-service` page (914 bytes content) — recommend 301 redirect to the new canonical, see Open loose ends.

**Footer restructure — 3 content columns instead of 1** — `sections/pt-footer.liquid` previously had one hardcoded "Popular pages" column with 5 flat links. Replaced with three structured columns:
- **All Tires** (6 items): Winter / All-Weather / All-Season / Summer / Performance / Shop all tires
- **Services** (7 items): Tire Installation / Tire Repair / Tire Rotation / Tire Balancing / Seasonal Tire Change / TPMS Service / Road Hazard Protection
- **Popular pages** (6 items): Brands / Booking / About / Contact / Wholesale / FAQ
- Removed the redundant "Company" `link_column` block from `sections/footer-group.json` (it pointed at `main-menu` — duplicated header nav content).
- Grid CSS bumped: now `repeat(N, 1fr)` at 2 / 3 / 4 / 5 cols at 700/1100/1300px breakpoints. At 1100–1299px width the 5-col layout collapses to 4 cols and newsletter wraps to row 2 (graceful degradation).
- Footer now has 17 unique `/pages/` links — strong site-wide internal-linking footprint.

**Header nav — tried + reverted** — added Winter/All-Weather/All-Season as flat `nav_link` blocks between Services and Brands in `sections/header-group.json`; user decided 9 items was too crowded. Reverted. See "Don't rebuild" section.

**9 empty-page cleanup** — deleted via Admin API DELETE on `/pages/{id}.json`: `aplus` / `new` / `pirelli` / `hankook` / `goodyear-tires` / `shop-name-brand-tires` / `tire-brands` / `services-overview` / `shopify_w`. All were 0–235 bytes (truly empty or near-empty). Total page count: 88 → 79. No 301 redirects auto-created — if Google had cached any of these, they'll 404 (acceptable given zero inbound link footprint per audit).

**Push helper used** — same Admin REST + Python pattern as yesterday. `write_themes` + `write_theme_code` + `write_online_store_pages` scopes on the env-var token cover everything. Asset PUTs land instantly; storefront CDN refreshes within ~5–15 min.

**Final continuation — `/pages/tires` hub + heroes on 5 pages + Related cross-links network-wide.** Built the missing main `/pages/tires` hub (was empty: template_suffix `tires` pointed at non-existent template file). New 4-section template lists all 8 tire-type categories as brand cards (each card links to its respective landing page). Hero images set on winter, all-weather, light-truck, tpms. Footer "All Tires" column now opens with bold "**All tire types**" link to `/pages/tires`. Internal-linking network: every tire-type page now links to 3–4 related categories + the hub via a "Related" line at the bottom of its install/warranty explainer. Total network: hub → 8 outbound, 8 tire-type pages → 28 cross-links between them (avg 3.5 each), plus footer × site-wide + brand pages + blog cleanup from earlier. Fleet + tpms are single-section service pages, intentionally skipped on the cross-link pass.

**Continued — 5 missing pages built + trailer-tires flagship** (after commit `86ba7ab`). User explicitly asked to build the missing tire-category + wheel pages. Picked top 5: wheels-and-rims-calgary, summer-tires, performance-tires, light-truck-tires, fleet-tires-calgary. Then a follow-up flagship trailer-tires build with extra research (WebSearch + prince-tires-content skill — Ubersuggest MCP token expired mid-session, can't re-auth without window reload).
- **NEW templates** (5): `templates/page.wheels-and-rims-calgary.json` (11k), `templates/page.summer-tires.json` (14k), `templates/page.high-performance-tires.json` (13k), `templates/page.lt-truck-tires.json` (14k), `templates/page.trailer-tires.json` (21k — flagship, 6 sections, 7 FAQs).
- **NEW pages via Admin API**: `/pages/wheels-and-rims-calgary` (id `177729274131`), `/pages/fleet-tires-calgary` (id `177729306899`). The other 4 already existed but had their template_suffix pointing at non-existent template files — page rendered empty until the template files landed.
- **trailer-tires brand strategy** — organized by CONSTRUCTION TYPE (Standard ST Radial / All-Steel ST Radial / Bias-Ply / Complete Wheel Assemblies / Trailer Steel Rims) instead of brand names, per user's explicit ask + because trailer shoppers don't search by brand. Specific brands cited: CargoMax + Radar (both on prince-tires-content skill's approved Tier-4 directory list); other major lines (Carlisle, Maxxis, Trailer King, Goodyear Endurance) framed as "we can source" in the footnote.
- **trailer-tires inbound links** — 6 contextual sources: footer (All Tires column), 4 trailer-relevant blog articles (`where-to-find-trailer-tires-in-calgary` — replaced broken `/collections/trial-tires` typo URL, `trailer-tires-and-load-ranges-the-expert-guide`, `expert-tips-for-choosing-the-right-trailer-tires`, `best-tires-for-trucks-and-suvs-in-calgary-2026` — wrapped "tow a trailer to Sylvan Lake" anchor), and `templates/page.lt-truck-tires.json` (good-fit bullet "Tow a trailer, fifth-wheel, or boat").
- **trailer-tires hero image** — set via `hero_image` setting to `shopify://shop_images/mrkt22_RV_trial_camping_clear_background_*.png` (1536×1024 landscape, AI-generated RV camping shot from existing shop library; the library has 45 trailer-related images, plenty of options for additional placements).
- **Footer All Tires column** now 9 items: Winter / All-Weather / All-Season / Summer / Performance / Light Truck / Trailer / Wheels & Rims / Shop all.
- **Footer Popular pages** now 7 items: Brands / Booking / About / Contact / Wholesale / **Fleet Tires** / FAQ.
- **Refreshed meta** on 3 tire-category pages (summer / performance / light-truck) — descriptions now reference the actual rich content. Set new meta on wheels-and-rims + fleet via the page-create POST; refreshed trailer-tires meta after the build.

## 2026-05-20 — Tire landing-page network · footer + homepage cross-links · site-wide blog cleanup (315 edits across 22 articles)

Built out three sibling tire-type landing pages (winter / all-weather / all-season) using a shared 5-section template pattern. Then connected them via the footer, homepage Shop-by-category cards, brand pages, and cleaned up internal links across 22 winter-related blog posts in one bulk run. **Commit `edff591` on `phase-4-wholesale-portal`** — 13 files, 1069 insertions, 93 deletions. NOT pushed.

**Tire landing pages — full content build for all three** — established pattern: `pt-calgary-service` (hero+pricing+FAQ+CTA) → `pt-tire-explainer` (chemistry/concept) → `pt-tire-brands` (brand cards) → `pt-tire-fit-guide` (when-to-choose vs. when-not) → `pt-tire-explainer` (install/warranty).
- **NEW** `/pages/all-weather-tires-calgary` (page id `177674780947`, template `page.all-weather-tires-calgary.json`). 6 brand cards (Michelin CrossClimate2 · Bridgestone WeatherPeak · Toyo Celsius II · Continental TrueContact · General Altimax 365 AW · BFG Advantage Control).
- **REBUILT** `/pages/winter-tires-calgary` (page id `176897786131`). Was thin 5-FAQ page; now ~1500 words with 8 brand cards (X-Ice Snow · Blizzak WS90 · Observe GSi-6 · iceGUARD · VikingContact 7 · True North · Winter T/A KSI · AltiMAX Arctic 12) and 9 fit-guide bullets.
- **NEW** `/pages/all-season-tires-calgary` (page id `177682252051`). Template was orphaned (template file existed, no page assigned). Created via Admin API + same template build with 6 touring all-season cards (Defender 2 · TrueContact Tour · Turanza QuietTrack · Goodyear Assurance · Hankook Kinergy · Nexen N'Priz).
- All three: `global.title_tag` + `global.description_tag` metafields set. No `custom.schema_jsonld` — verified `main-page.liquid` doesn't read it; LocalBusiness + FAQPage JSON-LD already auto-render via `snippets/schema-local-business.liquid` (global) and `schema-faq` (inside pt-calgary-service).

**3 new reusable theme sections** — kept the design language consistent with `pt-calgary-service` (Barlow Condensed headings, Outfit body, `#E8251D` accent, max-width 900px containers, 64px vertical padding). Each is preset-installable from the theme editor.
- `sections/pt-tire-explainer.liquid` — H2 heading + richtext intro + bullet blocks (lead + text) + optional outro + white/light bg toggle. Used twice on each tire page (concept + install/warranty).
- `sections/pt-tire-brands.liquid` — heading + intro + grid of `brand` blocks (brand_name + description + link_url + link_text) + optional footnote richtext. Auto-fill grid (auto-fill min 260px).
- `sections/pt-tire-fit-guide.liquid` — heading + 2 columns (`good_fit` and `not_fit` block types, each with bullet text) + closing summary richtext. **Renamed from `pt-tire-comparison` mid-session** to avoid collision with existing `sections/pt-tire-comparison.liquid` (an unrelated radar-chart product-page widget).
- Block-name limit gotcha: Shopify caps schema block `name` at 25 chars. First version of `pt-tire-fit-guide` used "Good-fit bullet (left column)" (28 chars) and failed asset upload with 422 — shortened to "Left column bullet" / "Right column bullet".

**`pt-calgary-service.liquid` — surrounding-towns chips removed** — hardcoded `<span>Airdrie</span><span>Chestermere</span><span>Okotoks</span><span>Cochrane</span>` in the service-areas grid (lines 77-81) deleted, leaving only the 4 Calgary quadrants. Pre-existing violation of the `no_surrounding_towns` memory rule that affected `/pages/winter-tires-calgary` + `/pages/all-season-tires-calgary` (and would have affected the new all-weather page). Single edit fixes all 3.

**Today's content rules applied across all 3 tire pages** — codified for future work:
- "best prices" instead of "wholesale pricing" (per user mid-session feedback)
- CTA `"Book now"` instead of `"Book installation"` / `"Book tire installation"`
- No emoji (`✔️ / ★`) in meta descriptions — keep `4.9★` as the brand/SERP signal but drop all checkmarks
- No surrounding towns (Airdrie / Cochrane / Okotoks / Chestermere / Bragg Creek / Sundre / Strathmore) in service-area claims, JSON-LD `areaServed`, or body copy — genericize to "rural Alberta back roads / mountain highways"
- All internal URLs canonical and relative (no 301 redirects, no absolute princetires.ca prefix)

**Footer "Popular pages" column** — `sections/pt-footer.liquid:106` — hardcoded a static column between the dynamic `link_column` block loop and the newsletter column. 5 links site-wide: Winter Tires Calgary · All-Weather Tires · Tire Installation · Tire Repair · Seasonal Tire Change. Hardcoded (not a `link_column` block backed by a Shopify menu) because the 5 links are stable strategic anchors. If editing flexibility is wanted later, ~10-min refactor to a new block type.

**Homepage Shop-by-category cards — redirected to landing pages** — `templates/index.json` (Shopify-side, edited via Admin REST). The 3 cards titled "Winter Tires" / "All-Season Tires" / "All-Weather Tires" used to link to `/collections/tires?filter.p.m.custom.seasonality=…`. Set `link` to the canonical landing-page URL on each and cleared `filter_url` (since `pt-shop-by-category.liquid:14-17` prefers `filter_url` over `link`). Other 3 cards (Performance · Truck & SUV · Wheels) untouched.

**5 brand pages — 7 contextual links to W/AW landing pages** — Michelin, Bridgestone, Toyo, Continental, Yokohama. Edits applied via JSON-parse-and-modify in `intro_richtext` / `calgary_richtext` settings. Anchor variety used: "dedicated winter tire" · "tired of swapping twice a year" · "one tire all year" · "dedicated winter" · "Calgary's -30°C January nights" · "budget-friendly winter pick". First batch had wrong `<strong>`-tag find strings (the rendered bold I saw in raw output didn't match actual JSON content); re-ran with corrected finds and all 5 succeeded.

**SITE-WIDE blog cleanup — 22 articles, 315 edits in one bulk run** — audit started with 6 articles from the linking plan, but a wider sweep found 22 articles with the same broken patterns. All cleaned via one ordered regex pipeline (path-specific replacements first, host-stripping last):
- **`prince.tires` domain typo fixed in 13 articles, 134 instances total** — separate domain that returns 200 on homepage but 404 on internal pages. All instances retargeted to `princetires.ca`.
- **`/pages/request-an-appointment` → `/pages/booking`** (11 articles, 12 instances) — was 404.
- **`/pages/contact-us` → `/pages/contact`** (10 articles) — was 404.
- **`/pages/copy-of-winter-tires-for-calgary-icy-roads` → `/pages/winter-tires-calgary`** (2 articles, 5 instances) — draft handle leftovers.
- **Slug normalizations**: `/pages/all-weather-tires` → `-calgary`, `/pages/tire-installation` → `-calgary`, `/pages/tire-repair` → `-calgary`, `/pages/seasonal-tire-changeover` → `/pages/seasonal-tire-change-calgary`. Each used negative lookahead `(?!-calgary)` to avoid double-suffix.
- **Collection-URL → landing-page swaps**: `/collections/winter-tires` → `/pages/winter-tires-calgary` (the original collection returns 200, but landing page has better SEO/UX), `/collections/all-weather-tires` → `/pages/all-weather-tires-calgary`.
- **Absolute URLs stripped to relative**: `href="https?://(www\.)?princetires\.ca` → `href="`.

**Comparison blog post (`winter-tire-vs-all-season-vs-all-weather-the-calgary-drivers-guide`) — 5 internal links cleaned and 1 reciprocal added** — was previously the highest-relevance internal-linking target. URL kept being 404'd in earlier sessions; was 200 today.

**3 articles got targeted contextual link additions** — `how-to-store-winter-tires` (1 W link on "winter tires" intro phrase) · `best-tires-for-alberta-highway-driving-and-road-trips-2026` (1 W + 1 AW + 1 AS, all on natural in-prose anchors) · `are-all-season-tires-enough-for-calgary-winters` (1 AW link as closing paragraph — natural conclusion: "want one tire all year without the swap → see all-weather guide").

**Inbound contextual-link tally after today's work:**

- `/pages/winter-tires-calgary` — footer (site-wide) · homepage Shop-by-category card · comparison blog · all-weather reciprocal fit-guide · Michelin · Bridgestone · Toyo · Continental · Yokohama · 13× from `when-to-change-to-winter-tires-in-calgary` · 4× from `why-winter-tires-are-essential` · 5× from `tips-for-driving-on-calgarys-icy-roads` · 3× from `why-tires-go-flat-in-cold-weather` · plus all the other blog-post collection-URL redirects. Strong footprint.
- `/pages/all-weather-tires-calgary` — footer · homepage card · winter page reciprocal · comparison blog · Michelin · Toyo · misc blog mentions. Solid but lighter than winter (fewer natural AW mentions in older blog content — expected).
- `/pages/all-season-tires-calgary` — footer · homepage card · `best-tires-for-alberta-highway` contextual. Sparse — newest of the three.

**Push helper used** — `princetires-app/db/push-theme-assets.mjs` (from yesterday's session) was the path of least resistance. Shopify CLI auth was still dropped (from yesterday's `shopify auth logout` blip). Direct Admin REST via the env-var token worked for all 13 theme files + the 22 blog article edits + the 2 page-creation + 4 metafield-create + 1 metafield-update calls + the homepage index.json edit. Token has `write_themes` + `write_theme_code` + `write_online_store_pages` + content-create scopes.

**Strategic context — competitor audit motivated all of today's work** — full SEO + on-page audit of 4 Calgary tire-shop sites (Prince + 3 competitors) ran in parallel to the build. Findings drove the priority order:
- **KMJ Tire (calgaryrimandtire.ca)** — DA 54 is fake. Top backlink anchor texts are "746383. aewheel.com" (1,120 ref domains), "swmototires.com" variants (~100), "Matt's smoking bible" (6) — anchor profile points to OTHER unrelated businesses. Domain was almost certainly purchased aftermarket with inherited PBN links from American Eagle Wheels / Southwest Moto Tires. ZERO schema on the entire site, NAP inconsistency (two phone numbers on homepage), "5-Star Rated" claim is false. One Google link-spam update halves their DA. Not replicable, not worth fearing.
- **Good Tire (goodtirecalgary.ca)** — the REAL competitor. DA 23, **27,970/mo organic** (32× Prince), clean branded backlink profile, strong schema. Got hit -63% by helpful-content algorithm Nov 2024 but stabilizing. Owns wheels/rims/used-tires clusters Prince has zero presence in. Mobile lab LCP 23s (worst of the 4) is their soft spot.
- **Tire Pirates (tirepirates.ca)** — wounded leader. -79% traffic decline from Oct 2024 peak (30,916 → 6,253). Broken robots.txt + sitemap. Helpful-content classifier eroding them month over month. Their tire pages are weak and vulnerable.
- **Prince Tires diagnosis** — has MORE content than any competitor (20 brand pages, 5 location pages) but 779/829 organic visits come from the homepage alone. The problem was never "build more pages" — it was: (1) **cannibalization** (8 duplicate brand pages like `/pages/toyo-tires` vs `/pages/brand-toyo`, plus 3 duplicate all-weather pages), (2) thin location pages (winter-tires-calgary was 311 words), (3) **no inter-page linking** (brand pages orphaned from money pages). All three diagnosed problems were fixed today.
- **Competitor profiles + audit lessons saved to memory** — 8 markdown files at `/Users/mohamad/.claude/projects/-Users-mohamad/memory/` indexed in MEMORY.md: `competitor-calgary-rim-and-tire.md`, `competitor-goodtirecalgary.md`, `competitor-tirepirates.md`, `feedback-prince-tires-free-benefits.md` (only re-torque is free — don't claim lifetime rotations/re-balance/seasonal swap/etc.), `project-prince-tires-page-inventory.md` (actual page inventory; pulled-from-sitemap NOT homepage nav), `feedback-audit-sitemap-first.md` (always sitemap-first when auditing), `reference-prince-tires-shopify-api.md` (admin domain is `prince-tires-5560.myshopify.com` and env var is `SHOPIFY_ADMIN_ACCESS_TOKEN` — both common guess-traps).

**Biggest unrealized opportunity surfaced by the audit — `/pages/wheels-and-rims-calgary`** — Good Tire owns 2,993 monthly organic visits on this URL (positions 4 across "rim calgary", "rims calgary", "wheels calgary", "calgary wheels rims", "tires and wheels calgary", etc., total ~9 keywords). Prince Tires has ZERO presence — no /pages/wheels-and-rims-calgary, no /pages/rims-calgary, nothing. Same template pattern as the new tire landing pages would work (pt-calgary-service → pt-tire-explainer → pt-tire-brands but for wheel brands: XF Off-Road, Armed Offroad, RTX, ENVY, RSSW). High-priority for next session.



Long search-focused session. All work shipped to live theme `186307215635`, verified via Playwright against princetires.ca. **30 specs total green** across 6 new + extended files. Mid-session, the Shopify CLI auth dropped (own-goal: `shopify auth logout` in response to a transient 401) — wrote a new Admin-API push helper as a workaround.

**Homepage smart-search — partial-query guidance + reframed fallback** — when a customer types something that can't fully resolve to a vehicle/size, we used to dead-end at "We couldn't find a match." Now:
- `detectPartialQuery(query)` returns `{type:'year-only'|'year-make'|'make-only', …}`. Detection fires in 3 places: top of `handleVehicleQuery`, the `!vehicle` branch, and in `onSubmit`.
- `renderGuidance(partial)` shows: year-only → "Got 2012 — what car?" + **8 popular-make chips** (Honda · Toyota · Ford · Chevrolet · GMC · RAM · Hyundai · Jeep) that fill `<year> <make>` on click and re-run search · year-make → "Almost — what model?" · make-only → "Looking for Honda tires?" + `/collections/brand-honda` link.
- `showFallback` rewritten: title "Tell us what you're looking for", 4 clickable example chips (`225/65R17` · `2020 Honda Civic` · `tire rotation` · `Michelin`), phone CTA demoted.
- `popularMakes` list lives on the `SmartSearch` class instance (`sections/hero-smart-search.liquid:1187`).
- Chip clicks emit `pt_search` with `search_type: 'guidance_chip'`.

**Trim picker attention cue** — fixed the "I clicked the arrow but nothing happened" UX. When `awaitingTrim` is true and the customer clicks the red CTA, the old `showPrompt` appended an orange "↑ Please select trim above" line at the BOTTOM of an internally-scrollable trim list — invisible below the fold on a 6-row list. Rewrote `showPrompt`:
- Inserts the inline cue ("Pick one to continue ↓") **inside the `.hero-smart-search__trim-header`** — top of the dropdown where the customer is looking.
- Pulses the whole header with orange glow (`--attention` class, `hero-trim-header-pulse` keyframes, 1.4s, 2 pulses).
- Scrolls `this.results.scrollTop = 0` so the header is visible.
- Smooth-scrolls the dropdown into the page viewport if it's off-screen.
- Auto-highlights the first trim row so Enter immediately picks it.

**Arrow-CTA navigation bug — single resolved vehicle** — customer types "2012 Honda Civic DX", dropdown resolves to one `result-item` row with `P195/65R15` and a `data-url`. Clicking the red arrow used to fall through to the "couldn't find a match" fallback (the user suspected the leading "P" — wrong; `parseSize` handles it). Real cause: `onSubmit` checked `awaitingTrim` but ignored `awaitingSelection`, then re-parsed the raw "2012 honda civc dx" query as a tire size and failed. Fix: `onSubmit` now checks `awaitingSelection` + `items.length > 0` + a `dataset.url` on `items[0]`, and calls `selectResult(items[0])` to navigate. Lives in `sections/hero-smart-search.liquid:2519-2525`.

**Don't navigate to "Browse all tires" before trim is known** — per user rule. Path 3 (vehicle resolved, no trim data) used to render a clickable "Browse all tires" row with a brand-only filter URL. Replaced with new `showNeedsTrimGuidance(vehicleLabel, originalQuery)`:
- Renders an orange-tinted guidance card "Got [year make model] — what trim?" with examples (LX, EX, Touring) — NO `data-url`, so the arrow CTA does nothing useful and the customer is forced to refine.
- Also fires the missing-vehicle webhook (`source: 'homepage_smart_search_needs_trim'`) so we don't lose the lead.
- New `.hero-smart-search__guidance--needs-trim` CSS variant.

**No-space typo normalize** — "2012honda civic" → "2012 honda civic" reflected back into the input before parsing. Lives at the top of `search()` (`sections/hero-smart-search.liquid:1581-1591`). Handles both `(year)(letter)` and `(letter)(year)` orderings.

**Universal header search** — the magnifying-glass overlay was previously inert except for hard-coded service/size routing. Built a real predictive dropdown via Shopify's `/search/suggest.json`:
- Pinned **⚡ Quick action** row at top when the query matches a tire-size / service-keyword / season / rims pattern (links to the appropriate filtered collection / service page).
- 4 grouped sections — **Products** (4) · **Collections** (3) · **Pages** (3) · **Articles** (3) — populated from Shopify's predictive search. Empty sections collapse.
- 280ms debounce + `AbortController` for stale requests.
- Footer "See all results for <query> →" links to `/search?q=…&type=product,article,page`.
- Keyboard nav: ↑/↓ · Enter · Esc.
- `pt_search` analytics fire on every chip / result click + on submit.
- Fail-safe: if PTTireParse missing or suggest API errors, the form submits to `/search` natively.
- Lives in the rewritten `snippets/pt-header-search-enhance.liquid` (186 → 460 lines after the recent-search work) + ~165 lines of CSS in `sections/pt-header.liquid`'s `{% stylesheet %}`.

**Mobile keyboard scroll handling** — the soft keyboard was hiding the dropdown. Initial attempt scrolled on focus + on every keystroke to flush-top; user said "too aggressive." Final design:
- Homepage: new `keepInputVisible()` method on `SmartSearch`. ONLY fires on `visualViewport.resize` (the keyboard-state change). Skips if `(window.innerHeight - vv.height) <= 150` (no keyboard). Skips if the input is already in the upper 30% of visible area. When it does scroll, target = 50px from visual viewport top (comfortable, not flush). Lives at `sections/hero-smart-search.liquid:1593-1611`.
- Header overlay: uses CSS var `--pt-visual-vh` set by JS on `visualViewport.resize` / `scroll`. `.pt-header__search-overlay` `height` resolves to this var (falls back to `100vh`). Overlay is `overflow-y: auto` so panel+dropdown scroll as a unit inside the visible area. Mobile `margin-top` softened to `24px`.

**Recent + popular searches on empty focus** — new "autocomplete" pattern matching Amazon / Tire Rack style. When the input is empty and focused, the dropdown shows:
- **Popular** section: 4 curated chips (`225/65R17` · `2020 Honda Civic` · `tire rotation` · `Michelin`).
- **Recent searches** section (orange-tinted, ↻ icon): up to 5 most-recent queries from `localStorage` under key `pt-recent-searches` (deduplicated case-insensitively, capped at 5). Includes a `Clear` link to wipe.
- Save fires on: successful tire-size match in `onSubmit`, brand/season match, service match, `selectResult` (any clicked row), and header overlay submit + result clicks.
- Same `localStorage` key on BOTH surfaces → one customer, one shared search history across homepage hero + header overlay.
- Chip clicks fill the input and re-run search; analytics: `search_type: 'recent_chip'` or `'popular_chip'`.

**New: Admin-API theme push helper** — `princetires-app/db/push-theme-assets.mjs`. Usage:
```
node --env-file=.env.local db/push-theme-assets.mjs \
  ../princetires/sections/hero-smart-search.liquid \
  ../princetires/sections/pt-header.liquid \
  ../princetires/snippets/pt-header-search-enhance.liquid
```
Uses the `SHOPIFY_ADMIN_ACCESS_TOKEN` already in `.env.local`. Hits `PUT /admin/api/<version>/themes/<id>/assets.json` per file. Pure REST, no OAuth. Use this whenever the Shopify CLI is being weird about auth.

**Files touched (theme, 4)** — `sections/hero-smart-search.liquid` (the most), `sections/pt-header.liquid` (overlay CSS + visualViewport + empty-state chip styles), `snippets/pt-header-search-enhance.liquid` (full rewrite for predictive + recent/popular). One new helper: `princetires-app/db/push-theme-assets.mjs`.

**Tests** — 6 new spec files in `princetires/tests/`:
- `year-only-make-chips.spec.js` — 5 specs
- `trim-attention-cue.spec.js` — 5 specs
- `arrow-cta-and-needs-trim.spec.js` — 4 specs
- `header-predictive-search.spec.js` — 5 specs
- `mobile-keyboard-scroll.spec.js` — 5 specs (chromium with mobile viewport; uses `visible=true` filter to handle dual mobile/desktop search triggers)
- `recent-popular-searches.spec.js` — 6 specs

All 30 green (one flaky on retry — the network-race `/search?q=` fallthrough). Note: **don't use `addInitScript` to clear localStorage in `beforeEach`** — it fires on every navigation, including the submit-triggered nav, which wipes anything the page just saved. Use `page.evaluate` after `goto` instead.

**Decisions noted** — (a) **Inline ghost-text autocomplete declined** — duplicates mobile OS keyboards, low ROI vs the dropdown. (b) **Brand fuzzy matching deferred** — recommended (`michellin → Michelin`) but not built; user prioritized recent+popular instead. (c) Highlight matched terms in dropdown also deferred. (d) User-facing CSS keeps the existing color tokens (orange `#F5820B` for homepage chips, red `#dc2626` for header chips) to match each surface's existing palette.

**Tires / Wheels tabs above smart search** — orange "Search by tire size or vehicle" badge replaced with two red pill tabs (Tires default, Wheels). Selected mode persists in `localStorage` (`pt-search-mode`). `buildCollectionUrl()` is mode-aware — Tires → `/collections/tires?<width+profile+rim+season+service>`, Wheels → `/collections/wheels?<rim_diameter+vendor>` only. Typewriter cycles mode-aware placeholder phrases. `btn_tires` + `btn_wheels` action buttons removed from `templates/index.json`'s `block_order` (preserved in `blocks` for easy restore). Service-keyword routing (e.g. "tire rotation") still wins regardless of mode.

**Wheel-size.com integration · Phase 1 — vehicle → fitment card** — wheel-size.com API integrated for OEM bolt pattern + wheel sizes + tire sizes per vehicle. NEW `princetires-app/src/app/api/wheel-fitment/route.ts` server-side proxy, key in `WHEEL_SIZE_API_KEY` (Canada region `cdm`, Upstash 30-day cache by year+make+model), new `wheel_fitment` rate limiter (10/min/IP). Theme — Wheels-mode branch in `handleVehicleQuery` renders a red-bordered fitment card with bolt pattern + center bore + lugs row, OEM wheel-size chips (`7J×17 ET45`), OEM tire-size chips, diameter CTAs, and an OEM tires CTA. Falls back to a "No wheel fitment data" guidance card on null response. 7 specs in `tests/wheel-fitment-card.spec.js`.

**Wheel-size.com · Phase 2 — wheel catalog enrichment** — 4 new product metafield definitions created via Admin API: `custom.bolt_pattern`, `custom.rim_width`, `custom.rim_offset`, `custom.center_bore` (all `single_line_text_field`). Bulk-fill script `db/fill-wheel-fitment.mjs` parses titles like `Alloy Wheel 17x7.5 - 5x114.3 - ET:35 - CB:60.1` via PCD heuristic (second number ≥ 95mm = bolt pattern, anything smaller = wheel width). Handles dual-pattern wheels (`12x135/139.7` → keeps `12x135`), hyphen variants (`5-127`), trailing-offset format (`6x135/139.7-44`). **Result: 178/178 fields written across 40 of 41 wheels.** Final populated counts: rim_diameter 40 · bolt_pattern 38 · rim_width 39 · rim_offset 24 (steel wheels mostly universal-fit, no ET in titles) · center_bore 37. 2 stragglers flagged: "Armed Offroad Havoc Wheels", "Envy 546GM EV-5". Smart-search wheel-fitment card now has a PRIMARY full-width CTA "**⚙️ Wheels that fit your [Model]**" that combines bolt_pattern + all OEM diameters in one URL. New scripts: `db/audit-wheels-fitment.mjs`, `db/define-wheel-fitment-metafields.mjs`, `db/fill-wheel-fitment.mjs`, `db/enable-wheel-filter-capabilities.mjs`. Storefront filter for bolt_pattern must be enabled manually (Search & Discovery channel app, no Admin API toggle — confirmed via shopify-dev-mcp). Click-path in `princetires/docs/wheel-storefront-filters-MANUAL.md`. `adminFilterable` capability HAS been enabled programmatically on all 4 defs.

**NHTSA vPIC VIN decode** — new `princetires-app/src/app/api/decode-vin/route.ts` server-side proxy: validates VIN format (`/^[A-HJ-NPR-Z0-9]{17}$/`, excludes I/O/Q), hits NHTSA's free `decodevinvalues` endpoint, normalizes 69 fields → 10. Upstash 90-day cache by VIN (VINs are immutable). NHTSA needs no API key. New `vin_decode` rate limiter (20/min/IP). Theme — `recognizeVehicle()` has a VIN fast-path at the top: strips spaces/hyphens, regex-checks, calls `/api/decode-vin`, returns `{year, make, model, trim}` straight to the existing vehicle flow. Bypasses Gemini for 100% accurate trim recognition. Verified live with real VIN `2HGFC2F69LH567890` → `{2020 HONDA Civic LX, engine:{cylinders:4, displacement_l:2.0, fuel_type:Gasoline}, drive_type:4x2, plant_country:CANADA, plant_city:ALLISTON}`. Fires `pt_search` with `search_type: 'vin'`. 5 specs in `tests/vin-paste-search.spec.js`.

**My Garage · Add by VIN** — VIN paste row added at the top of the add-vehicle form in `sections/my-garage.liquid`. Customer types/pastes a 17-char VIN, clicks Decode → calls `/api/decode-vin` → cascading Year/Make/Model/Trim dropdowns auto-fill via case-insensitive option matching (`selectByText` helper). Input strips spaces + hyphens + lower-case as typed. Spinner during decode, green status row on success, red error states for invalid format / NHTSA no-match / make-or-model-not-in-our-list. Manual cascade still works for fallback. Garage is customer-account-gated, so Playwright spec (`tests/garage-vin-add.spec.js`) auto-skips when logged-out; full manual QA checklist at `tests/garage-vin-add-MANUAL.md`.

**NHTSA vPIC skill + memory saved** — `~/.claude/skills/nhtsa-vpic/SKILL.md` and `memory/nhtsa_vpic.md` (indexed in MEMORY.md). Documents the API endpoint surface, when-to-use-vs-Gemini matrix, the 6 use cases for princetires (VIN paste, garage add, bulk fleet, validate Gemini, regenerate make lists, chain to wheel-size for OEM tire+wheel). Skill triggers on "decode VIN", "VIN lookup", "vehicle by VIN", "vPIC", "NHTSA vehicle API".

**Final test matrix (against live princetires.ca, end-of-session)** — 9 spec files, 47 specs run, **43 passed + 4 skipped** (garage specs require login):
- tests/wheel-fitment-card.spec.js (7) · tests/tires-wheels-tabs.spec.js (7) · tests/vin-paste-search.spec.js (5) · tests/recent-popular-searches.spec.js (6) · tests/year-only-make-chips.spec.js (5) · tests/trim-attention-cue.spec.js (5) · tests/arrow-cta-and-needs-trim.spec.js (4) · tests/header-predictive-search.spec.js (5) · tests/garage-vin-add.spec.js (4 skipped — login-gated)

## 2026-05-19 — Booking modal: date + price fixes · Neon outage handled · Next 16 build resilience

Two user-reported bugs in the product booking modal — fixed, deployed live, Playwright-verified. Theme commit `2a8a170` on `phase-4-wholesale-portal`; deployed via per-file `shopify theme push --only` to live theme `186307215635`. Separate Neon outage hit mid-session and was handled.

**Booking date off-by-one** — `snippets/pt-booking-modal.liquid` formatted dates with `toISOString()` (UTC), rolling the calendar back for devices at/ahead of UTC. Replaced all 4 date-output sites with new `bkLocalISO()` helper; parse switched to `new Date(d + 'T12:00:00')` (local noon). The other two booking surfaces were already correct. Verified live: picked `2026-05-22` → summary "Friday, May 22 at 10:30 AM"; `data-date` attrs are plain local `YYYY-MM-DD`. Fix is TZ-independent by construction (no `toISOString` left in the date path) — couldn't reproduce ahead-of-UTC in Playwright (no TZ override), proof is structural.

**Per-device install price → per-product metafield** — old code: install = `vehs[].price * qty`, vehicle remembered per-device in `localStorage['pt-booking-vehicle']` → different total per device for the same product (the reported "$120 vs $140"). New: install = `st.installPrice * qty` from a new product metafield. Removed `vehPrice()`, the `vehs[].price` table, the `$120` trailer flat, the `$40` low-profile floor, the low-profile add-on row. Vehicle picker stays — drives appointment duration only. Backend `/api/book` doesn't recompute price → no server change. Verified live across 5 simulated `pt-booking-vehicle` localStorage values (passenger / suv / truck / dually / cleared) → all $35/tire / $140 (deterministic).

**Metafield `custom.install_price`** — NEW definition (`number_decimal`, PRODUCT, dollars) created via Admin GraphQL `metafieldDefinitionCreate`. Backfilled on 3,883 tire products via NEW `princetires-app/db/backfill-install-price.mjs` (idempotent; dry-run by default, `--apply` writes). Tiers from product TITLE: passenger / car $25 (3,015), trailer ST ≤15" $25 (42), ST ≥16" $30 (28), light-truck LT $35 (684), big flotation ≥35" $40 (114). Modal falls back to $30 if metafield empty.

**Files touched (theme, 5)** — `snippets/pt-booking-modal.liquid` (rewrite + `bkLocalISO`), `sections/pt-product.liquid` (both CTAs emit `data-install-price`; "Installed total" reads the metafield), `sections/pt-cart.liquid`, `snippets/pt-collection-card.liquid`, `snippets/pt-booking-modal-trigger.liquid`.

**Neon outage (mid-session)** — Neon hit its free-tier compute-time quota (HTTP 402). Live booking APIs (`/api/availability`, `/api/services`, `/api/book`) all 500ing; Vercel build also failed (`/admin/setup` prerender threw on its DB query). Not caused by this session's work — pre-existing usage. User upgraded Neon Free → **Launch** (usage-based, ~$15/mo typical) — APIs back to 200, builds back to green.

**Next.js 16 build resilience** — `/admin/setup` was statically prerendered + queried the DB at build time. Added `await connection()` (from `next/server`, stable since v15) so it renders on-demand. Local build confirmed `/admin/setup` now `ƒ` (Dynamic), not `○` (Static). `princetires-app` commit `a3f7df7`, Vercel green. **Next 16 gotcha**: `export const dynamic` / `revalidate` / `fetchCache` are removed when Cache Components is enabled — `connection()` is the documented replacement, works either way. Rest of `/admin/*` is already dynamic via `(shell)/layout.tsx`'s `headers()` call.

**Shopify API version bump** — `src/lib/shopify/{admin,storefront}.ts` + `src/app/api/inventory-stats/route.ts` had `?? "2025-01"` as fallback. `SHOPIFY_API_VERSION` is unset on Vercel → production ran on a deprecated API version (build warned). Bumped fallback to `"2026-04"` (matches `.env.local`, currently supported). `princetires-app` commit `6dcd8c1`, Vercel green.

**Browser test gotcha worth remembering** — Playwright Chrome initially rendered OLD theme code despite cache-busters + `no-store` fetches; curl returned NEW. Root cause: the persistent MCP profile had a stale `_shopify_pt` preview cookie pinning it to unpublished theme `186817446163` ("Services Hub Preview"). `Shopify.theme.id` confirmed the wrong-theme render. Reset by navigating to `?preview_theme_id=186307215635`. **Rule of thumb**: when a Playwright test against the live storefront disagrees with `curl`, check `Shopify.theme.id` for a stale preview cookie.

**Skill doc + memory** — `~/.claude/skills/prince-tires-booking/SKILL.md`: `installation_off` row updated for the dual pricing model + Exception note under Booking surfaces clarifying the product modal uses the metafield, not catalog `byVehicle`. NEW memory `booking-install-pricing` so future sessions don't reintroduce vehicle pricing in the product modal.

**Decisions noted** — (a) theme → master cherry-pick **declined**: `master` is 11 commits behind `phase-4-wholesale-portal`, conflicts on 3 of 5 files; let phase-4 merge naturally — the fix is already live on the theme. (b) Sentry source-map upload fix **deferred** — needs correct org/project slug + `SENTRY_AUTH_TOKEN` from user (see Open loose ends).

**Tests** — Playwright via MCP against the live storefront (after preview-theme reset). Both bugs verified end-to-end. No specs added; existing booking spec not re-run.

## 2026-05-17 — princetires-app: Phases 2 / 3 / 3.5 + Gemini fix + booking emails

Marathon backend session. Everything below is built, deployed (Vercel + live theme),
and pushed to both repos. Migrations 014/015 applied by the user, 016 applied via
script. New docs: `docs/PROJECT-STATE.md` (status dashboard), per-repo
`ARCHITECTURE.md` maps, `docs/phase-{2,3,3.5}-*.md` design docs.

**Phase 2 — customer bookings surface** — done.
- NEW `GET /api/proxy/bookings` (App-Proxy) + `src/lib/booking/serialize.ts` + `bookings_read` rate limiter.
- migration `014-booking-customer-link.sql` — backfills `bookings.customer_id` by email; `/api/book` patched to set `customer_id` on insert.
- Theme: `my-garage.js` `loadBookings()` was wired to a phantom `GET /api/book?email=` endpoint that never existed — rewired to `/apps/api/bookings` via the App-Proxy `api()` helper.

**Phase 3 — customer CRM** — done.
- `/admin/customers` was 100% derived from the `bookings` table — rebuilt off the `customers` table (every synced customer, not just bookers). Detail page rekeyed `[email]` → `[id]`; shows real garage (`vehicles` table), B2B status, bookings, editable staff notes.
- migration `016-customer-notes.sql` — `customers.staff_notes` (preserved across Shopify syncs — `upsertCustomerFromShopify`'s `on conflict` doesn't list it).
- NEW `customers/actions.ts` (`updateCustomerNotes`) + `[id]/notes-editor.tsx`.

**Phase 3.5 — service catalog** — done, all stages.
- migration `015-services.sql` — `services` table + seed (6 services + 2 add-ons).
- NEW `src/lib/services/catalog.ts`, `GET /api/services` (public), `/admin/services` — edit + add + delete services/add-ons (`page.tsx`, `actions.ts`, `service-editor.tsx`, `new-service-form.tsx`).
- Stage 2: 3 booking surfaces read the catalog, catalog-with-fallback — `pt-service-booking-modal.liquid` (`sbApplyCatalog`), `pt-booking-modal.liquid` (`bkApplyCatalog`), `pt-booking-page.liquid` (`bpApplyCatalog`). Price calc rewritten generic; verified live via Playwright.
- Per-service durations → calendar: `effectiveDuration()` in `booking/duration.ts`; `/api/book` sets `duration_minutes = max(service catalog duration, vehicle floor)`.

**Gemini security fix (code-review SEC-2)** — RESOLVED.
- The Gemini API key was shipped to every browser. NEW server-side proxy `POST /api/vehicle-parse` (key in `GEMINI_API_KEY` Vercel env) + `vehicle_parse` rate limiter.
- Theme: `hero-smart-search.liquid` `recognizeVehicle()` calls the proxy; `geminiKey` dropped from both smart-search config blocks; `gemini_api_key` setting removed from `settings_schema.json` + value scrubbed from `settings_data.json`.
- User rotated the key (new key live in Vercel); verified via curl. Old key should be deleted in Google AI Studio.

**Booking notification emails** — `src/lib/email/booking-emails.ts`.
- NEW `sendCustomerAppointmentConfirmed` — customer emailed when staff confirm (pending→confirmed only). Fired from `bookings/[id]/actions.ts` `updateBookingStatus`.
- NEW `sendCustomerCancellation` — customer emailed when staff cancel.
- Owner new-booking email got an "Open booking" button → `/admin/bookings/<id>`.
- `email/track.ts` — new `booking_confirmed` / `booking_cancelled` failure types.

**Garage polish (theme)** — `my-garage.liquid` / `my-garage.js`.
- Booking-card mobile layout fix (`.gbk-info` flex-basis — title was crushed).
- Tab order: My Vehicles · Bookings · Service history · Order history · Account.
- "Remember the Bookings tab" — `initBookingDefault()` + per-customer localStorage flag.

## 2026-05-17 — Ubersuggest SEO Workstreams 1–3 + service-page build

**SEO program — Workstreams 1–3 run** (W4–W6 pending). All findings in `docs/seo-baseline-2026-05-17.md` — re-pull the same metrics later to diff for W6 rank-tracking.
- W1 baseline: DA 11, 36 referring domains, ~643 organic visits/mo, ~99% branded. Site audit scores 96/100 but can't see the schema criticals (code-review C3–C6). PageSpeed field-data FAST; lab mobile dragged by ~891 KB unused JS (4 Google tag containers + 2 good-apps.co apps). Junk URL `/pages/copy-of-winter-tires-for-calgary-icy-roads` holds 94 backlinks.
- W2 competitor intel: Kal Tire DA 48 / Fountain Tire 42 / OK Tire 39 vs princetires 11. Fountain Tire is the direct Calgary organic threat (homepage ranks #4 for the "tires shop calgary" cluster; princetires ~#10). Head terms are link-bound. Local independents surfaced (Zee/Ward/Good/Integra/Tirecraft…) — not yet profiled.
- W3 keyword universe: ~2,500 keywords → tiered programmatic-SEO build list. Tier 1 cross-checked vs `princetires-app/db/015-services.sql`. Dropped "wheel alignment" (1,600/mo — not a service Prince offers); demoted rotation (30/mo) + TPMS (0/mo).

**Service-page build — 2 Tier-1 Calgary pages.** New page templates only; both reuse the existing `pt-calgary-service` section (no new `.liquid`).
- NEW `templates/page.seasonal-tire-change-calgary.json` — Seasonal Changeover (catalog `installation_on`; "tire changeover/swap" cluster ~1,200/mo).
- NEW `templates/page.tire-repair-calgary.json` — Tire Repair (catalog `flat_repair`, $50/tire; ~890/mo).
- Tier-1 now complete: `tire-installation-calgary` already existed; Wheel Balancing = `/pages/tire-balancing` exists (optimize, not build).
- Both Shopify **Pages created live** via the Admin API (`princetires-app/db/create-service-pages.mjs`, modeled on `create-data-deletion-page.mjs`) — `/pages/seasonal-tire-change-calgary` + `/pages/tire-repair-calgary`: published, custom templates assigned, SEO title/meta metafields set, verified HTTP 200.

**Bug fixes — existing service-page system** (8 edits).
- Wrong postal code `T2G 0G3` → `T2G 0A4` in 4 files: `sections/pt-calgary-service.liquid`, `snippets/pt-booking-modal.liquid`, `snippets/pt-service-booking-modal.liquid`, `sections/pt-booking-page.liquid` (last 3 = the booking calendar .ics export).
- Double "Starting from" — the section already prepends it; stripped the duplicate from `price_range` in `page.tire-installation-calgary.json`, `page.tpms-calgary.json`, `page.winter-tires-calgary.json`, `page.all-season-tires-calgary.json`.

**Brand skill corrected** (`~/.claude/skills/prince-tires-content/SKILL.md`).
- Pirelli/Hankook/Goodyear moved out of "Brands NOT carried" → new "Carried in-store — not yet in the Shopify catalog" section (owner-confirmed).
- Flat repair price corrected `$50–60` → `$50` (7 spots).

**Service-page consolidation.** The store had two generations of service pages — old thin ones (`service` template / `pt-service-detail`) duplicating new rich ones (`pt-calgary-service`).
- 301-redirected + unpublished the 3 old duplicates → canonical: `seasonal-tire-changeover` → `seasonal-tire-change-calgary`, `flat-tire-repair` → `tire-repair-calgary`, `tire-installation` → `tire-installation-calgary`. Done via `princetires-app/db/consolidate-service-pages.mjs`; old URLs verified returning 301.
- Wired the `/pages/services` hub — all 8 `pt-all-services` cards now link to their service page (`templates/page.all-services.json`); previously every card was a booking-modal trigger with no link, so the service pages were orphaned.
- Rebuilt 3 more old thin pages on the rich `pt-calgary-service` template, repointed in place (URLs + backlinks kept): `tire-balancing` ($20/wheel), `tire-rotation` ($60), and `tpms-service` (repointed at `page.tpms-calgary.json`; price left quote-before-work — the catalog splits TPMS ambiguously, $75 service + $75 sensor add-on). Broken duplicate `tpms-sensor-services` 301'd → `tpms-service`. Via `princetires-app/db/upgrade-service-pages.mjs`.
- `tire-sales` + `wheels-and-rims` aren't bookable services → 301'd to `/collections/tires` + `/collections/wheels`, old pages unpublished. The services-hub cards link to `/pages/tire-sales` / `/pages/wheels-and-rims`, which now 301 to those collections.

**Booking flow fix.** Every `pt-calgary-service` service page's "Book" CTA linked to plain `/pages/booking` → the customer landed on the generic installation-centric pathway chooser ("I'm buying tires / I have my own tires") instead of their service. Fixed: each page's `booking_url` now deep-links `/pages/booking?service=<slug>` (the booking page already supported `?service=` — it just wasn't used). 6 service pages. New skill `~/.claude/skills/prince-tires-booking/` documents the booking system + the deep-link rule to stop this class of bug recurring.

## 2026-05-17

**Deep code review — both repos**
- Ran a 3-agent parallel review (backend / theme customer-flows / theme SEO). ~70 findings.
- Output: `docs/code-review-2026-05-15.md` — full checkbox backlog, 2 leaked credentials + 7 critical + 16 high + ~45 medium/low, tagged `[app]`/`[theme]`, severity-grouped.
- **Do-today (leaked credentials):** SEC-1 — Shopify Admin API token printed into a public HTML page by `princetires-app/src/app/api/auth/shopify/callback/route.ts` (delete the route; `PROJECT_PLAN.md:60` already says it can go). SEC-2 — Gemini API key shipped to the browser at `pt-collection-grid.liquid:74` + `hero-smart-search.liquid:195,1413` (referrer-lock the key in Google Cloud, then proxy it server-side).
- Other criticals: collection sidebar reads 5 never-assigned Liquid vars (Stud filter never renders), AJAX cart badge targets the wrong header, 3 conflicting Product JSON-LD blocks, competing LocalBusiness schemas, contradictory opening hours, review-count mismatch (320/562/300+).
- Pointers added to `PLAN.md` (top) and this file's Open loose ends.

**Ubersuggest MCP connected**
- Neil Patel / Ubersuggest MCP server added at **user scope** (`~/.claude.json`) → available in every project. Endpoint `https://ubersuggest-mcp.neilpatelapi.com/mcp`, HTTP transport, OAuth 2.0.
- User completed the `/mcp` OAuth login — panel shows `✓ Connected`, 37 tools listed.
- ⚠️ Tools do NOT load into an already-running session — a window reload is required after connecting. A fresh session picks them up automatically.

**Planned — Ubersuggest SEO program (agreed approach, not started)**
6 workstreams: (1) baseline — site audit + domain overview of princetires.ca, to quantify the code-review SEO findings; (2) competitor intel — domain/keyword/backlink pulls on Kal Tire, Fountain Tire, OK Tire, local independents; (3) keyword universe — batch keyword metrics for brand/size/service terms, cross-referenced against `tire-catalog.json`, scored to a prioritized programmatic-SEO build list; (4) content/AEO calendar; (5) backlink gap → directory submissions; (6) an Ubersuggest rank-tracking project for measurement. **Workstream 1 is the agreed first task for the next session.**

## 2026-05-15

**Collection page rebuild + refactor**
- Phase 1 + Phase 2 fixes (paginate, dynamic vendor list, filter-preserving rim pills, season list, brand search, width/aspect/rim filters, sticky mobile filter button, OOS overlay, Newest sort).
- Price filter fixed — was `filter.price.min/max`, now `filter.v.price.gte/lte`.
- Season-clear bug — auto-default now uses `sessionStorage` marker `ptg_auto_seeded_<handle>` (fires once per tab).
- Model filter added (`custom.tire_model`), open by default.
- Re-search strip (size + vehicle tabs), garage banner (saved-car one-click apply).
- Clear-all now drops every filter incl. tire size.
- Card images: responsive `srcset` + eager-load first 4 for LCP.
- Smart-search brand list made dynamic from `collection.filters` (collection page + homepage hero) — was a 28-brand hardcoded list.

**Refactor** — `pt-collection-grid.liquid` 3,893 → ~2,571 lines (−34%). New snippets: `pt-collection-compare.liquid`, `pt-collection-empty.liquid`, `pt-collection-sidebar.liquid`, `pt-collection-card.liquid`.

**Compare** — polished drawer + modal, added a hexagon radar chart (6 axes), prominent close button; fixed 2 latent bugs (`display:none !important` hid it entirely; `preventDefault` blocked the checkbox). Then hidden on mobile per user.

**Product page** — mobile sticky redesigned: 3-action bar (Phone / Add to Cart / **Book Install** primary, solid red). Generic `pt-tabbar` hidden on `/products/*`.

**Homepage** — `trusted-brands` CTAs link to dedicated `/collections/<brand>` pages.

**Garage / account** — wholesale customers no longer see garage UI; "View full garage" button on Order history tab; Shop-tires links strip `P/LT/ST` prefix; "My Garage" nav link added to Shopify Customer Account UI (admin setting).

**Data work (`princetires-app/db/`)**
- `fill-tire-models.mjs` — bulk-filled `custom.tire_model` on 3,795 products.
- `build-tire-catalog.mjs` → `tire-catalog.json` reference.
- `merge-vendors.mjs` — merged 25 duplicate-vendor products (SURETRAC→Suretrac, TRANSEAGLE→Transeagle, Royalblack→Royal Black, Lingling→Linglong).

**Other** — sidebar scrollbar made visible (3px → 8px); created the `push-back` skill (`~/.agents/skills/push-back/`); created this handoff log + the `session-handoff` skill that maintains it.
