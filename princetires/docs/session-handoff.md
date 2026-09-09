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

- **Road Hazard upsell cron is OFF (2026-09-08)** — owner flips it on in **Admin → Agent Console → "Road Hazard upsell reminder"** when ready (`agent_config.road_hazard_upsell_enabled`). Reply-"YES" is MVP (flows to SMS console, staff add at the counter) — a fully-automated yes→add flow is the next upgrade. All Road Hazard pricing (per-term % + floor/cap) is retunable in **Admin → Services** with no migration.
- **GBP: ~32 pending review replies (2026-06-03)** — clear via `/admin/gbp` → "Reply to pending reviews now" (25/run) or let the daily cron finish. Most of the 580 were already replied to manually.
- **GBP: Edmonton Trail location not automated** — `locations/61550430212629158` (9 reviews). To automate it too: add multi-location support, or set `GBP_V4_PARENT` env to switch the single target.
- **GBP: stock the photo library + queue (2026-06-03)** — upload real shop photos at `/admin/gbp/posts` (Photo library) so posts stop using AI images; load Aug–Oct seasonal posts (winter-tire run-up) into the queue.
- **About-page theme fixes still pending (2026-06-03; updated 2026-09-08)** — the About template ("Pages / about") section settings still show **"10+ Years in Calgary"** (false — est. 2022 ≈ 4 yrs) and **"300+" reviews** in one block (vs 562 elsewhere). Fix in the theme customizer — live-theme API writes are blocked. (The old "optional road hazard coverage" flag here is RESOLVED — road hazard is now a real, sellable add-on as of 2026-09-08.) The SEO meta title was already fixed via API.
- **Citation fixes (owner action, 2026-06-03)** — YellowPages postal `1Y2`→`0A4` + add website link; BBB website `prince.tires`→`princetires.ca`; Facebook name "Prince Tires LTD"→"Prince Tires". Then work the directory checklist in `docs/local-citations-tracker.md` (Yelp/Bing/Apple + Tier-2 Canadian directories).
- **Code-review backlog (2026-05-15)** — `docs/code-review-2026-05-15.md`. SEC-1 + SEC-2 both **RESOLVED**. Still open: 7 critical / 16 high issues (collection sidebar Stud filter never renders, AJAX cart badge wrong target, 3 conflicting Product JSON-LD blocks, competing LocalBusiness schemas, contradictory hours, review-count mismatch).
- **Roadmap Phases 4–6 not started** — Phase 4 wholesale portal data, Phase 5 staff B2B cockpit (`orders-create` webhook is still an HMAC-only stub), Phase 6 inventory & containers. Phases 0–3 + 3.5 all built + live. See `docs/PROJECT-STATE.md`.
- **Untested (need staff login)** — `/admin/services` add/delete and the rebuilt `/admin/customers` CRM compile + deploy clean but weren't click-tested.
- **Old Gemini key** — confirm the pre-rotation key is deleted in Google AI Studio (the new key is live in Vercel as `GEMINI_API_KEY`).
- **Deferred** — booking caps + "next available" hint (Phase 2 follow-up); housekeeping (archive stale plan docs to `docs/archive/`).
- **Ubersuggest SEO program — W4–W6 pending** — W1–W3 done (`docs/seo-baseline-2026-05-17.md`). Remaining: W4 content/AEO calendar, W5 backlink-gap → directory submissions, W6 rank-tracking project. Also pending: W2 local-independent competitor profiling; Tier-2/Tier-3 from the W3 build list.
- **Service-page cleanup leftover** — Update the Shopify nav-menu links to point at the canonical `/pages/services` directly (the new 301 from `all-services` catches old links, but direct is cleaner). (`services-overview` + `all-services` are now both 301'd as of 2026-05-23.)
- **Optimize `/collections/tires` + `/collections/wheels` SEO copy** — they receive `tire-sales` / `wheels-and-rims` redirects and should rank for "tire sale calgary" / "wheels and rims calgary" (W3 Tier-2). `/collections/winter-tires` was done 2026-05-23 (snow-tires copy + title_tag/description_tag).
- **`page.fleet-tires-calgary.json`** renders "Starting from Contact us for fleet pricing" — blank its `price_range` (badge then hides) or reword.
- 2 stale failing tests — `collection-phase1.spec.js` #4 (rim-pill) + #5 (results count). Test UI removed in earlier sessions. Fix or delete.
- 84 tires still missing `custom.tire_model` — re-run `princetires-app/db/fill-tire-models.mjs`.
- Garage-banner "Yes filter" button reported unclickable by the user — tested headless, worked; never confirmed the user's browser/context.
- `greenmax` vendor casing + `Durun`/`Durutun` possible duplicate — left as-is deliberately (judgment calls).
- Compare is hidden on mobile — deferred to a future PDP-based compare flow.
- **Sentry source-map upload still requires Vercel env vars (2026-05-19, partially fixed 2026-05-23)** — code-side **fixed** in `princetires-app/next.config.ts`: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` now read from env, and `sourcemaps: { disable: true }` short-circuits the upload when any are missing (no more "Project not found" build warnings). **Owner action remaining:** set the real org/project slugs from `sentry.io/organizations/<ORG>/projects/<PROJECT>/...` + add `SENTRY_AUTH_TOKEN` (scopes: `project:releases` + `project:read`) in Vercel env vars. Until then, source maps stay un-uploaded and runtime stack traces are minified.
- **Verify Neon autosuspend is on (2026-05-19)** — newly on Launch (usage-based, ~$15/mo typical). Confirm the production compute's autosuspend is ~5 min (Neon dashboard → Branches → click compute → "Suspend after"). Disabled autosuspend = compute runs 24/7 and the Launch bill balloons.
- **Shopify CLI auth dropped (2026-05-20)** — workaround in place: `princetires-app/db/push-theme-assets.mjs` (no CLI required). Re-login at convenience.
- **Manual QA: Garage Add by VIN flow (2026-05-20)** — 8-scenario checklist in `princetires/tests/garage-vin-add-MANUAL.md`. Requires login.
- **Commit + push uncommitted work (2026-05-20 → 2026-05-26)** — theme branch `phase-4-wholesale-portal` and app are both still accumulating. After 2026-05-26 the theme has: `layout/theme.liquid` (utility-page noindex + favicon expansion), `sections/pt-product.liquid` (data-variant-id + season-tag metafield-first), `sections/pt-featured-inventory.liquid` (season-tag metafield-first), `sections/main-search.liquid` (season-tag metafield-first), `snippets/pt-booking-modal.liquid` (step-zero install vs tires-only + custom add-ons render), `snippets/pt-collection-card.liquid` (data-variant-id + strict metafield-only season pill), `templates/page.all-weather-tires-calgary.json` (BFGoodrich Advantage Control card). Plus prior uncommitted from earlier sessions still in tree. App branch has uncommitted: `src/app/api/services/route.ts` (try/catch), `src/app/api/book/route.ts` (customAddons schema + notes append), `next.config.ts` (Sentry env-vared), `.env.local.example` (SENTRY_* + WHEEL_SIZE_API_KEY documented), plus `db/audit-*`/`debug-*`/`check-*` one-shot scripts still untracked.
- **Vercel env vars to set** — `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `WHEEL_SIZE_API_KEY` (rotate the leaked one first).
- **Bulk fleet VIN batch decode (deferred 2026-05-20)** — vPIC use-case #3 from the `nhtsa-vpic` skill.
- **Wheel storefront filters need manual enable (2026-05-20)** — 60-second checklist in `princetires/docs/wheel-storefront-filters-MANUAL.md`.
- **1 wheel straggler remaining** — `Armed Offroad Havoc Wheels` (no specs available — supplier sheet needed or de-list).
- **`/search` page redirects to homepage instead of showing results** — likely a `templates/search.json` issue. Verify the search template renders results, not redirects.
- **Pay-before-booking spec drafted (2026-05-20)** — implementation deferred. Spec at `princetires/docs/specs/2026-05-20-pay-before-booking-design.md`.
- **Footer visual QA (2026-05-21)** — eyeball across breakpoints once CDN flushes; tighten media queries in `sections/pt-footer.liquid` if cramped.
- **Optional Phase 2 brand-page links (2026-05-20)** — Cooper, Firestone, General brand templates could get contextual landing-page links.
- **`/pages/wheels-and-rims-calgary` — copy could be deeper** — page exists with full schema (LocalBusiness + AggregateRating + FAQPage). Per 2026-05-23 audit, schema is fine — copy could be expanded to better attack Good Tire's 9 "wheels/rims calgary" rankings.
- **Avada HTML sitemap pages (2026-05-21)** — 5 pages still 200, decision pending (keep or delete).
- **Verify rich-results validator (2026-05-21)** — once CDN flushes, paste representative URLs into https://search.google.com/test/rich-results.
- **Google Calendar OAuth — user mid-flight** — code shipped (commits `dc14729` + `b020b95`). User must (1) add `princetires111@gmail.com` under Audience → Test users at https://console.cloud.google.com/auth/audience?project=prince-tires-auth, (2) click Connect on /admin/settings, (3) smoke-test by adding a calendar event tomorrow + booking against it. Last seen blocker: `Error 403: access_denied` — that fix is the test-user-add step.
- **Policy pages — three loose ends**: (a) user needs to **create the three Shopify Pages** in admin (`privacy-policy`, `terms-of-use`, `returns-policy` handles, pointing at the matching `templates/page.X.json` template suffixes); token lacks `write_content` so can't be done via API. (b) Paste the same policy text into **Settings → Policies** so checkout's native `/policies/*` URLs work too. (c) Have an **Alberta lawyer review** before relying on these in a dispute (~$300–600). (d) Delete the orphaned `/pages/wheel-alignment-calgary` Page resource in admin (template was deleted from theme but the Page resource itself still exists).
- **Server-side CASL consent capture** — currently client-only gated in `sections/main-register.liquid`. Logged in `princetires/PLAN.md` under "Planned — princetires-app" → add a `customers/create` Shopify webhook handler that writes `{shopify_customer_id, email, terms_accepted, accepts_marketing, consent_ts, ip, user_agent}` to a new `consent_log` table.
- **Seasonality metafield is sparse** — only ~40% of products have it set. The collection-page auto-filter (added this session) will hide products without the metafield. Either backfill via `princetires-app/db/...` or accept that customers will sometimes need to clear the season filter manually. Also one `'All-Season '` (trailing space) data-quality typo to clean up.
- **Booking add-ons: consider promoting to a JSONB column (2026-05-26)** — custom add-ons currently fold into the `bookings.notes` text field. Fine for now, but if you ever need to query "how many tire bags sold this month" or report on add-on revenue, add a `custom_addons jsonb` column to `bookings` and dual-write from `/api/book`.
- **`pt-featured-inventory.liquid` + `pt-product.liquid` + `main-search.liquid` — align with strict-metafield pattern (2026-05-26)** — `pt-collection-card.liquid` is now **strict metafield-only** (no tag/type fallback) after seasonality backfill hit 97% coverage. The other 3 files still keep the tag fallback as a safety net for the ~3% with missing seasonality. Either backfill the last 3% and remove all fallbacks, or accept the inconsistency.
- **`sections/pt-brands-hero.liquid` is unreferenced (2026-05-23)** — 345 lines of dead code, no template or section renders it. Safe to delete; held back pending owner OK because Shopify theme-editor presets could reference it via server-side state not visible in repo.
- **Drizzle in deps but unused (2026-05-23)** — `drizzle-orm` + `drizzle-kit` are in `package.json` but no `schema.ts` or `drizzle.config.*`. Project uses hand-rolled SQL migrations in `db/*.sql` + the Neon `sql` template tag. Remove from deps to reduce bundle, or commit to writing the Drizzle schema.

## Don't rebuild (tried + reverted)

- "Popular models" pill row on the collection page — user found it visually busy.
- `tire-knowledge.md` full spec scaffold — maintenance trap (specs belong on manufacturer sites / Shopify metafields).
- `active-promos.md` — user decided a hand-maintained promo file isn't needed.
- **Vehicle-based install pricing in `pt-booking-modal.liquid`** (removed 2026-05-19) — install price is now per-product via the `custom.install_price` metafield; vehicle only drives appointment duration. The `vehs[].price` table, the `$120` trailer flat, the `$40` low-profile floor, and the low-profile add-on row are all gone. The OTHER two booking surfaces (`pt-booking-page.liquid`, `pt-service-booking-modal.liquid`) still use by-vehicle because they have no product to read from. See the `booking-install-pricing` memory + the Exception note in the `prince-tires-booking` skill.
- **Cherry-picking booking fix `2a8a170` to master** (2026-05-19) — `master` is 11 commits behind `phase-4-wholesale-portal`; would conflict on 3 of 5 files. Let phase-4 merge naturally.
- **Aggressive mobile auto-scroll on input focus** (2026-05-20) — first attempt fired `scrollIntoView` on focus + on every keystroke, anchoring the input flush with viewport top (12px). User found it too aggressive ("scrolls up too much"). Reverted to **visualViewport.resize-only**, with a 30%-comfort-band skip and a softer 50px landing target. Don't re-add focus-based scroll or onInput re-anchor — `visualViewport.resize` is the only correct trigger.
- **Aggressive header overlay mobile `margin-top: 14px`** (2026-05-20) — same complaint family. Reverted to `24px`. Don't push it lower.
- **Tire-type links in header nav** (2026-05-21) — added 3 nav_link blocks (Winter / All-Weather / All-Season) to `sections/header-group.json` between Services and Brands; user decided 9 items was too crowded and the existing inbound footprint (footer + homepage cards + brand-page contextual links + reciprocal landing-page links + comparison blog) was already strong enough. Reverted same session. Don't re-add to the header — rely on footer + homepage discovery instead.
- **Vehicle-tier pricing in `pt-booking-modal.liquid`** (re-introduced this session 2026-05-26, then later superseded) — this session put back the `vehs[].price` table, trailer flat $120, low-profile addon, etc. in the product-page install modal. That conflicts with the **2026-05-19 fix** that replaced vehicle-tier pricing with the `custom.install_price` product metafield. File was further modified post-this-session per system-reminder file-modified notes; the current state of `pt-booking-modal.liquid` is whatever the post-session edits left it as, NOT this session's snapshot. Don't re-revert to vehicle-tier in the product modal — keep `install_price` metafield as the source of truth there. The OTHER two surfaces (`pt-booking-page.liquid`, `pt-service-booking-modal.liquid`) DO still use vehicle-tier pricing because there's no single product context to read from.
- **GBP automation on the droplet (2026-06-03)** — first designed as a standalone Node service for the tools droplet (a `gbp-automation/` folder exists at the workspace root). Abandoned: this Mac has no SSH to the droplet, and the app was already on Vercel Pro with a cron convention. The **Vercel version in `princetires-app` is the live one**; the `gbp-automation/` folder is only an optional laptop-run backfill tool. Don't deploy the droplet version.
- **Google Drive folder sync for post photos (2026-06-03)** — considered a Drive drop-folder → auto-sync for real photos; skipped because it needs another Google API + auth. Used the in-app **Shopify-CDN photo library** instead.
- **Temporary GBP diagnostic endpoints (2026-06-03)** — `/api/gbp-env-check` and `/api/gbp-reply-test` were added to debug env vars + the 2-location issue, then **removed**. Don't expect them to exist.
- **Road Hazard single-plan / 15% pricing (2026-09-08)** — first shipped as a single 36-month plan at 15% ($15–$60/tire), then re-scoped to a **1/2/3-year term picker** at 10/15/20% ($12–$90) after the owner said 15% felt cheap. Don't revert to a single plan or the 15% rate. The details page was briefly collapsed to one plan then re-expanded to 3 terms — the 3-term version is current. Pricing is catalog-driven (Admin → Services / `db/036`), so change rates there, not in code.

---

# Session Log

## 2026-09-08 — Road Hazard Protection add-on: booking-modal term picker, details page, PDP + modal cross-sells, upsell cron · new `per_unit_percent` pricing mode

Full build shipping Road Hazard Protection as a sellable, self-serve add-on. All verified live (Playwright + real-UA curl). Theme pushed via REST PUT to `#186307215635` and committed to `phase-4-wholesale-portal` (`39b6115`). App changes merged to `main` via 3 clean PRs, each staged in a worktree off `origin/main` so the app's in-progress `phase-0-ci` branch stayed untouched: **#26** (percent mode), **#30** (term tiers), **#33** (upsell cron). DB migrations `db/035`–`db/037` applied to live Neon.

**Booking modal add-on** (`snippets/pt-booking-modal.liquid`) — Road Hazard renders in the custom-addons area (`bkRenderCustomAddons`) with a **1/2/3-year term dropdown** that reprices live (`bkAddonRate`/`bkAddonUnitPrice`/`bkTermLabel`), a grey benefit note under the row (`BK_ADDON_NOTES`), and a "What's covered?" link (`BK_ADDON_LINKS`). Pricing = **% of tire price, per tire, clamped $min/$max, by term** — read from the catalog, never hardcoded. Term baked into the addon `name` in the payload (`bkAddonDisplayName`) so it lands in `bookings.notes` with no `route.ts` change. Also fixed a pre-existing gap: custom add-ons were missing from the step-4 review summary (`renderSummary`).

**New pricing mode `per_unit_percent`** (4th mode, end-to-end) — `princetires-app/src/lib/services/catalog.ts` (`ServicePrices.percent/min/max` + optional `terms[]`/`defaultMonths`, `PriceTerm`, `termLabel()`); parsed/saved in `services/actions.ts`; edited in `services/service-editor.tsx` (single %/floor/cap fields + a per-term table + default-term picker); quoted by the SMS agent in `lib/sms/config.ts` (`fmtPrice`). `/api/services` passes `prices` verbatim (no route change). **Owner retunes all rates in Admin → Services with NO migration.**

**Pricing (final):** 1yr 10% ($12–$50) · 2yr 15% ($15–$70) · 3yr 20% ($20–$90), default 3yr. Seeded by `db/035` (initial single-plan) + `db/036` (term tiers + final pricing). Evolution: 15% single-plan → owner felt cheap → 3-term 10/15/20% (see Don't rebuild).

**Details page** `/pages/road-hazard-protection` (Page id `109663944979`, Admin API `body_html`) — bespoke dark HTML page (`.rhp`); the 3 plan cards now show 1/2/3-year with real per-term %/floor/cap + $200-tire examples; hero/stats/FAQ/disclaimer updated. (Briefly collapsed to a single 36-mo plan, then re-expanded to 3 terms — 3-term is current.)

**PDP cross-sell** (`sections/pt-product.liquid`, Warranty tab) — new item immediately after the "standard warranty does not cover road hazards" line, linking to the page. Turns a dead hook into a warm lead.

**Upsell reminder cron (OFF by default)** — daily `/api/cron/road-hazard-upsell` (16:00 UTC ≈ 10am Edmonton) texts customers who booked a tire install *yesterday* without road hazard, appointment still upcoming, once each, opt-outs skipped. Mirrors the review-request lifecycle. `lib/sms/lifecycle.ts sendRoadHazardUpsell()`; GSM-7-safe copy in NEW `lib/sms/messages.ts` (unit-tested); gated by `agent_config.road_hazard_upsell_enabled` (default false) via a new Agent Console toggle (`agent/road-hazard-upsell-toggle.tsx` + `setRoadHazardUpsell`); `db/037` adds `bookings.rh_upsell_sent_at` + the flag; `vercel.json` cron added. Reply "YES" flows to the SMS console (staff add at counter) — no auto-flow yet.

**Detection of "didn't add it":** booking has `tire_name` set + `notes not ilike '%road hazard%'` + `scheduled_date >= today` + created yesterday (Edmonton). Add-ons live in `bookings.notes` (no structured column), so notes-text is the signal.

**Tests** — `princetires/tests/road-hazard-addon.spec.ts` (live Playwright: term dropdown + reprice + term-labelled order line); `princetires-app/tests/unit/road-hazard-upsell.test.ts` (GSM-7 + copy). Fixed a flaky pre-existing test: `tests/quote-button.spec.ts` `gotoFirstProduct` grabbed a hidden prefetch `<a>` via `a[href*="/products/"].first()` → now `a.ptg__card:visible` (verified 3× green). App: typecheck ✓, lint 0 errors, unit **59/59**. Theme JS node-checked. Latest prod deploy (#33) confirmed `READY`.

**Also:** MCP setup question (Perplexity `claude mcp add`) at session start — not actioned into config.

## 2026-06-03 — Google Business Profile automation + admin dashboard (in princetires-app) · local-SEO citation audit

**GBP automation (NEW — all in `princetires-app`, NOT the theme; live on app.princetires.ca, $0/mo).** Self-running Google Business Profile manager: auto-replies to reviews daily + auto-posts weekly via Vercel Cron, with a full admin control panel. Confirmed working end-to-end (a real reply posted to a live review during testing).
- Code: `src/lib/gbp/*` — `auth.ts` (refresh→access token), `client.ts` (v4 + v1 REST wrappers + `getV4Parent`), `replies.ts` (star+keyword reply matcher, word-boundary regex so "price"≠"ice", no emojis, Calgary-local, 1–3★→phone), `posts.ts` (seed posts), `store.ts` (Redis queue + activity log + photo library), `run.ts` (shared run logic for cron + run-now), `controls.ts` (pause flag).
- Cron routes `src/app/api/cron/gbp-{post,reply}/route.ts`; schedules in `vercel.json` (reply `0 15 * * *`, post `0 16 * * 2`), CRON_SECRET-gated.
- Admin `src/app/admin/(shell)/gbp/page.tsx` (status, review stats, activity log, pause/resume, run-now) + post manager `…/gbp/posts/` (compose/schedule/enable/disable/delete, "post now", photo library: batch-upload real photos → Shopify CDN via `@/lib/shopify/files`, pick per post). Nav added in `admin-nav.tsx`. Auth via `auth.api.getSession`; audited to `audit_log` (entity_type 'gbp').
- **GBP API:** access approved 2026-04-20. OAuth "Web application" client in GCP project **`prince-tires-reviews`** (NOT `prince-tires-auth` — that's the Calendar OAuth). Scope `business.manage`; refresh token via OAuth Playground.
- **Env (Vercel Production):** `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN`. `GBP_V4_PARENT` deliberately unset (resolved in code).
- **TWO GBP locations** on account `102182792573327289524`: main **"Prince Tires"** `locations/10386355589506872333` (580 reviews, 42 Ave SW — the automated one, hardcoded `PRIMARY_LOCATION` in `client.ts`) + **"Prince Tires Edmonton Trail"** `locations/61550430212629158` (9 reviews — NOT automated).
- **Data = Upstash Redis** (no DB migration): `gbp:posts`, `gbp:runs`, `gbp:automation:paused`, `gbp:images`.

**Local-SEO citation audit (earlier; docs in root `docs/`).** New: `docs/local-citations-tracker.md` (NAP audit + directory checklist), `docs/gbp-optimization-checklist.md`, `docs/gbp-post-calendar.md`, `docs/gbp-review-replies.md`. Found NAP mismatches: YellowPages postal **1Y2 → should be 0A4** (0A4 confirmed canonical), BBB website = `prince.tires` (should be princetires.ca), About page **"Since 2021" → 2022**.
- **Fixed:** About-page SEO meta title via Shopify `metafieldsSet` (`global.title_tag` on `gid://shopify/Page/176109846803`): "Family-Owned Since 2021" → "Since 2022".

## 2026-05-26 — Policy pages live · booking pricing/UX rewrite · seasonal collection routing · Google Calendar two-way sync (code shipped, OAuth user-action pending) · mobile polish

Long session spanning legal compliance, booking-system overhaul, and Google Calendar integration. All theme work pushed to dev `186318684435` + live `186307215635` via Shopify CLI. App-side committed and deployed to Vercel.

**Legal / policy pages** — `sections/pt-policy-privacy.liquid`, `pt-policy-terms.liquid`, `pt-policy-returns.liquid` (PIPEDA + CASL + Alberta PIPA + AB Sale of Goods Act + AB CPA compliant; 12–15 sections each); templates `templates/page.privacy-policy.json`, `terms-of-use.json`, `returns-policy.json`. Footer legal-links bar added in `sections/pt-footer.liquid`. CASL consent + Terms required-checkbox added to `sections/main-register.liquid` + `wholesale-register.liquid`. All `privacy@` / `returns@` references swapped to `info@princetires.ca` for now. User has to create the three Shopify Pages in admin (token lacks `write_content`).

**Booking pricing realign** — Across `snippets/pt-booking-modal.liquid` + `pt-service-booking-modal.liquid` + `sections/pt-booking-page.liquid`: per-tire $25 sedan / $30 SUV+van+electric / $40 half-ton truck / $45 large-cube + dually + trailer fallback. Trailer special-cased to **flat $120** regardless of qty. Low-profile / run-flat addon = `max(base, $40)`. Seasonal swap = same per-tire as install. Rotation = $60 flat (**$100 dually + large/cube**). Balancing $20/wheel. Flat repair $50 patch (plug removed). TPMS $75/sensor. NOTE: this conflicts with the 2026-05-19 "vehicle-based pricing removed" fix — files in this session were modified again post-this-session (see `system-reminder` file-modified notes); current behavior is the post-this-session state, not this session's snapshot.

**Tier-aware lead times** — `installation_off` Tier A (Prince Tires / Imported Tires collection / Haida-Tesche-Composal-Suretrac-Sierra-Bearway brands) = 2 hr. Tier B (Trail Tire Supply tag) = earliest slot 12:30 PM next business day (Sundays skipped). Winter rush Oct 15 → Nov 15 = adds 24-hr-from-now floor for Tier B. Service-only / install-with-own-tires = 2 hr always. Enforced both client (booking page + 2 modals via `data-supplier-tier` injected by new `snippets/pt-supplier-tier.liquid`) AND server (`princetires-app/src/app/api/book/route.ts` validator). Old 6-hour blanket rule removed everywhere.

**Booking page rewrite** (`sections/pt-booking-page.liquid`) — full replace. White theme (was dark). 4-step wizard (5 with done): pathway picker (buy / own / other) → service config → date/time → contact. Working calendar (14-day strip, half-hour slots, fetches `/api/availability`, blocks past + lead-time + booked slots). Imports the canonical pricing engine inline. Deep-link via `?service=installation_off` etc. supported.

**New `pt-tire-search` snippet** — 2-tab dropdown UI for the "I'm buying tires" path. Tab A: width/aspect/rim dropdowns. Tab B: cascading year → make → model → trim using `assets/pt-vehicle-YYYY.json` (existing fitment data, years 2001–2026). Staggered fitments (same rim, different widths) labelled Front + Rear. Multiple-OEM-size trims get a 5th OEM dropdown. localStorage save under key `pt-tire-search-vehicle`. Submits to `/collections/imported-tires?filter.p.m.custom.tire_width=...&sort_by=price-ascending` (or `/collections/winter-tires` in winter season Sep 20 → Apr 15).

**Saved-vehicle banner on booking page** — appears within 24 h of tire-search submission. "Yes, book install →" auto-detects vehicle tier via `detectTier(saved)` (regex over make/model + tire-size hints; handles Tesla/Rivian → electric, F-250+/2500+ → largetruck, Sprinter/cube → largetruck, low-profile rim ≥ 21 → largetruck, default → passenger) and **skips step 2 entirely**, landing on date/time. If user goes back to step 2, a green "Auto-picked X from your Honda Civic LX" strip appears with manual-override behavior (touching a tile clears the hint). Important CSS bug fixed mid-session: `display: flex` was overriding the `hidden` attribute → added explicit `.bp-saved[hidden] { display: none !important }`.

**Collection-page seasonal auto-defaults** (`sections/pt-collection-grid.liquid`) — on `/collections/tires` + `/collections/imported-tires` only (skipped on already-seasonal collections), first-visit redirect adds `sort_by=price-ascending` + season filter: Oct–Feb → `filter.p.m.custom.seasonality=Winter`, Mar–Sep → `All-Season + All-Weather` multi-value. Watch-outs documented: seasonality metafield is sparse (~40% coverage) so seasonality filter hides products without the metafield set; one `'All-Season '` (trailing space) data-quality issue.

**Deleted `/pages/wheel-alignment-calgary`** — `templates/page.wheel-alignment-calgary.json` deleted from local + dev + live. Service no longer offered. Grep'd + cleaned alignment + storage references in `sections/about-hero.liquid`, `pt-policy-privacy.liquid`, `pt-policy-terms.liquid`, `templates/page.about.json`, `templates/page.winter-tires-calgary.json`. The actual Shopify Page resource at /pages/wheel-alignment-calgary still exists in admin (template gone, page now renders default page.json layout) — user must delete it via Shopify admin (token lacks `write_content`).

**Google Calendar two-way sync** — code complete and deployed; awaiting user OAuth click-through. New `db/010-integrations.sql` migration applied to Neon (`integrations` table + `bookings.google_event_id` column). New `princetires-app/src/lib/google-calendar.ts` (pure-fetch client, no `googleapis` library): `oauthConsentUrl`, `exchangeCodeForTokens`, `getActiveIntegration`, `saveIntegration`, `deleteIntegration`, refresh-on-call access tokens (5-min safety margin), `listBusySlots(dateISO)` with DST-safe Edmonton offset + slot-overlap detection, `insertEvent(...)`, `listUpcomingEvents(daysAhead)`. New `/api/admin/google/connect` + `/api/admin/google/callback` routes with HMAC state cookie. `/admin/(shell)/settings/page.tsx` got a "Google Calendar" card (Connect / Disconnect with audit log). `/api/availability` extended via `Promise.allSettled` to merge Google busy slots (graceful fallback to Neon-only on Google failure). `/api/book` writes new bookings as calendar events (fire-and-forget, never blocks). `/admin/bookings/page.tsx` rewritten to merge customer bookings + upcoming calendar entries in one timeline (deduped by `google_event_id`; calendar-only rows clearly badged "calendar"). Env vars added to `.env.local.example`: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`. Commit `dc14729` + follow-up `b020b95` pushed to Vercel.

**Google OAuth setup (user-action mid-flight)** — user creating OAuth client in the existing "Prince Tires Auth" Google Cloud Console project. Has client ID/secret in hand. Last known state: stuck at `Error 403: access_denied` because `princetires111@gmail.com` not yet added to **Audience → Test users**. Once added, the Connect button in /admin/settings will succeed. Then smoke-test by adding a Google Calendar event tomorrow + checking the booking page slots, and submitting a booking + checking Google Calendar for the event.

**UI fixes**
- Header desktop nav `Contact → Book` (`sections/header-group.json`); points to `/pages/booking`.
- Header desktop nav typography upgrade in `sections/pt-header.liquid` (1.05rem, weight 600, `#e4e4e7` for contrast, red underline accent on hover, active-page indicator) — visible legibility win.
- Mobile sticky-bar **Cart → Call** in `sections/pt-sticky-book-bar.liquid` (cart icon removed, phone-dialer link added).
- `/pages/wheel-quote` mobile responsive rebuilt — horizontal-scroll trust signals → stacked, tighter inputs, smaller padding on <480px.
- Hero slideshow on mobile: `object-fit: cover` → `object-fit: contain` (`sections/hero-smart-search.liquid`) so wheel/tire photos aren't cropped at the edges.

**Server-side consent-capture TODO logged** — `princetires/PLAN.md` updated to track the future webhook handler (`customers/create`) that would persist CASL/Terms consent timestamp + IP to a new `consent_log` table. Still client-side gated only.

**Memory saved**: `booking_lead_times.md` (tier rules + winter rush + UI copy). Also re-confirmed the `booking_durations.md` and `shopify_admin_api.md` memories are still valid.

Big multi-day session spanning content, audit, feature, and bug-fix work. All theme changes were pushed via `db/push-theme-assets.mjs` (Shopify CLI still logged out). App-side changes uncommitted in the working tree. Always verified with `Mozilla` UA after pushing (see new `shopify_cdn_bot_ua` memory).

**Trailer-tires guide rewrite (2026-05-21)** — replaced thin 650-word April 2024 post at `/blogs/news/where-to-find-trailer-tires-in-calgary` with a ~1,800-word data-backed guide. Article handle preserved (no backlink loss). Body now ~21 KB with **5 stacked JSON-LD schemas in one `<script type="application/ld+json">` block** embedded in body_html: Article + FAQPage (7 Q&A) + HowTo (4 steps for DOT date-code) + SpeakableSpecification + BreadcrumbList. New SEO metafields: `global.title_tag` → *Trailer Tires in Calgary: A Data-Backed Guide (2026) | Prince Tires*; `global.description_tag` → industry-data + 105 km/h ST hook. Three inbound contextual links appended via Admin API: `/pages/trailer-tires` (template already had a contextual link → goal met), `/blogs/news/trailer-tires-and-load-ranges-...`, `/blogs/news/best-tires-for-alberta-highway-...-2026`. Confirmed: Shopify article body_html DOES preserve embedded `<script type="application/ld+json">` blocks (the theme renders its own Article schema alongside without conflict).

**Full codebase audit (2026-05-22)** — read-only audit across both repos (theme + princetires-app) written to `/Users/mohamad/.claude/plans/exploer-the-fiull-code-glittery-bonbon.md`. Cross-checked every "Open loose end" in this log. **Several big-ticket items came back as RESOLVED** (handoff was stale): SEC-1 (callback route is gone, replaced by better-auth `[...all]`), SEC-2 (no `NEXT_PUBLIC_GEMINI*`), all 6 Shopify webhooks HMAC-validated via `verifyWebhookJson` helper, NAP T2G 1Y2 (no occurrences in repo), `/pages/tpms-service` 301, `/pages/tires-1` 301, `/pages/services-overview` 301, BFGoodrich brand template AW model block (was already present), `/collections/tires` "Shop by season" callout (all 4 season pages linked), 15 new tire-category pages all in sitemap, llms.txt → 301 to `/agents.md` (file is implemented under a different name). Audit grep had one false-positive regex (`"@type":"X"` vs the site's `"@type": "X"` with space) — `/pages/wheels-and-rims-calgary` does in fact render full schema (AggregateRating + AutoRepair + FAQPage + SpeakableSpecification + WebPage).

**Audit-driven fixes shipped (2026-05-23)** —
- `princetires-app/src/app/api/services/route.ts` wrapped in try/catch (hot path — every booking modal mount calls it; raw `sql` with no catch was leaking stack on DB hiccup).
- `princetires-app/next.config.ts` Sentry config: `org` / `project` / `authToken` now read from env (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`); `sourcemaps: { disable: true }` short-circuits when any are missing — no more "Project not found" CI warnings. Documented in `.env.local.example` alongside `WHEEL_SIZE_API_KEY`.
- `princetires/layout/theme.liquid` — added `<meta name="robots" content="noindex, follow">` for the 6 utility-page handles (`garage`, `sign-in`, `wheel-quote`, `find-tires`, `data-deletion`, `rapid-search-results`). Verified live on all 6 with Mozilla UA; non-utility pages unaffected.
- `/collections/winter-tires` collection body_html rewritten to target **"snow tires calgary"** (pos 24, vol 1,000/mo — biggest unrealized winter-tire keyword) — 13× "snow tire" + 10× "3PMSF" mentions, brand list (Michelin X-Ice Snow / Blizzak / VikingContact / Observe GSi-6 / iceGUARD / Cooper True North / Firestone Winterforce 2 / Radar Dimax Alpine / Tesche Sun-Snow). Set `global.title_tag` → *Snow Tires & Winter Tires Calgary 2026 | 3PMSF Brands | Prince Tires*; `global.description_tag` → matches.
- `/pages/all-services` unpublished via Admin API (id `176897720595`, `published: false`) so the existing `/admin/redirects/593426448659` (already `/pages/all-services` → `/pages/services`) actually fires. Verified: 301 → 200 at `/pages/services`. Owner action: update Shopify nav menu to point directly at `/pages/services`.
- `princetires/templates/page.all-weather-tires-calgary.json` — added `brand_bfgoodrich` block to the brand grid (was the actual gap; handoff had this inverted): "BFGoodrich Advantage Control — Sole 3PMSF all-weather pick in the BFG lineup". Inserted in block_order after Continental.

**Booking flow Phase 1: install opt-out + custom add-ons (2026-05-23 → 2026-05-24)** —
- **`snippets/pt-booking-modal.liquid`** — new step-zero choice radio cards at top of step 1: **"Tires + installation (Recommended)"** vs **"Tires only"**. Picking "Tires only" hides everything install-time (vehicle row, add-ons, stepper steps 2/3) via `bk-install-only` containers + a `bk-flow-tires-only` modal class, then swaps the CTA from "Pick a time →" to "Add to cart →". The cart-add path calls `POST /cart/add.js` with the variant id + qty, then redirects to `/cart`. No appointment is created in this flow.
- **Dynamic add-ons** — `bkApplyCatalog` now captures any `kind: 'addon'` row from `/api/services` beyond the hardcoded TPMS+disposal (e.g. owner-created "Tire bag set of 4 — $20", "Nitrogen — $15"). `bkRenderCustomAddons` mounts them as checkbox rows in `#bk-custom-addons`. Selected add-ons flow into `calcPrice()` (× qty) and the booking payload as `customAddons: [{slug, name, qty, amount}]`.
- **PDP wiring** — `sections/pt-product.liquid` (book button line 438 + sticky button line 904) + `snippets/pt-collection-card.liquid` (Book Install button) now pass `data-variant-id="{{ product.selected_or_first_available_variant.id }}"`. Required by the tires-only cart-add path.
- **Booking API** — `princetires-app/src/app/api/book/route.ts` schema accepts `customAddons` (max 10, zod-validated). Server appends an "Add-ons:" summary block to the `bookings.notes` column so staff see them in `/admin/bookings` + email + Google Calendar event. Backward-compat: existing modal/service-modal payloads without `customAddons` still work.
- **Admin add-on creator** — already shipped at `/admin/services` (Phase 3.5 — May 17). Owner clicks "Add an add-on" → fills name/description/unit/price → it appears in the booking modal within ~5 min of CDN flush. Zero theme changes needed.

**Season-badge bug fix (2026-05-24)** — user screenshotted the BFGoodrich All-Terrain T/A KO3 labeled "SUMMER" on a tire grid (should have been All-Weather). Root cause: 4 files (`sections/pt-featured-inventory.liquid`, `snippets/pt-collection-card.liquid`, `sections/pt-product.liquid`, `sections/main-search.liquid`) had a `for tag in product.tags` loop with `if/elsif/elsif` reassigning `season_tag` each iteration — the **last** matching tag wins, not the first. The Trail Tire supplier feed dumps every imported product with a stray `"Summer"` tag on top of the correct `"all-weather-rated"` / `"all-season"` ones. So the BFG KO3 (tags: `2756518, all-weather-rated, …, Summer, trail-tire-supply, type-LT`) matched `'all-weather'` first then got overwritten by `'summer'`. Fix: read `product.metafields.custom.seasonality` (canonical, set by the import + admin) **first**, fall back to the tag heuristic only when blank. Color derivation pulled into a single `case season_tag` block. Verified live on BFG KO3 + Radar Dimax Classic — both now correctly show "All-Weather". **Follow-up by user:** further hardened `snippets/pt-collection-card.liquid` to be **strict metafield-only** (no tag/type fallback) after running a seasonality backfill that hit 97% coverage. The other 3 files still have the tag fallback as a safety net — see Open loose ends.

**Skill + memory updates (2026-05-22)** —
- New Section 17 in `~/.claude/skills/prince-tires-content/SKILL.md` — "Shopify Admin API workflows for content updates". Covers (17.1) rewriting articles while preserving the handle, (17.2) SEO metafield GET-then-PUT/POST pattern, (17.3) `<script type="application/ld+json">` blocks DO survive in `body_html`, (17.4) **section-only template gotcha** — `pt-calgary-service` and similar don't render `page.content`, so body_html appends are stored-but-invisible, (17.5) **Shopify CDN bot-UA cache trap** — always verify with `Mozilla` UA, never naked curl, (17.6) the "data-backed rewrite" template (lead stat → "we've spent N seasons" → comparison table → "what we've learned" patterns → spec table → HowTo → 7-Q FAQ → sources cited → embedded JSON-LD).
- New memory file `shopify_cdn_bot_ua.md` — Shopify edge CDN serves a separate cache tier for default-UA curl that can lag the real-browser tier by hours. Reproduced 2026-05-21 on the trailer-tires rewrite (bot-UA curl showed old H1 for 10+ hours; Mozilla-UA curl showed new content immediately). Always pass `-A "Mozilla/5.0 ..."` when verifying storefront deploys.

**Permissions allowlist (2026-05-22)** — added 7 read-only patterns to `.claude/settings.json` → `permissions.allow` (224 → 231 entries): `Bash(curl *)` (177 obs), `mcp__shopify-dev-mcp__search_docs_chunks` (43), `Bash(git -C *)` (13), 4 Ubersuggest MCP tools (5–9 obs each). Auto-allowed commands (cd, grep, sed, find, gh pr view, git status, etc.) skipped — they never prompt.

**Misc** — cloned `garrytan/gstack` to `/Users/mohamad/Desktop/VS Projects/princetires/gstack/` (Garry Tan's agent/AI tooling stack — `AGENTS.md`, `autoplan/`, `benchmark-models/`). Not part of the live theme/app, just a reference checkout.

**Brand-page cannibalization fix — 8 × 301 redirects + source unpublish (2026-05-26)** — closed the duplicate-brand-page loop diagnosed in the 2026-05-20 competitor audit. Created 8 Shopify URL redirects via Admin API (`/admin/api/2025-01/redirects.json`) and unpublished each source page (kept content for reversibility — no deletes). Verified live: `curl -sI` returns `HTTP/2 301` with correct `Location` for `/pages/toyo-tires` → `/pages/brand-toyo` and `/pages/all-weather` → `/pages/all-weather-tires-calgary`. Pairs shipped:
- `/pages/toyo-tires` → `/pages/brand-toyo`
- `/pages/bridgestone` → `/pages/brand-bridgestone`
- `/pages/continental` → `/pages/brand-continental`
- `/pages/nexen` → `/pages/brand-nexen`
- `/pages/falken-tires` → `/pages/brand-falken`
- `/pages/radar` → `/pages/brand-radar`
- `/pages/all-weather` → `/pages/all-weather-tires-calgary`
- `/pages/all-weather-tires` → `/pages/all-weather-tires-calgary`

Skipped intentionally (no canonical `/pages/brand-*` equivalent exists): `/pages/pirelli`, `/pages/hankook`, `/pages/goodyear-tires`, `/pages/aplus`, `/pages/fortune`. (Note: per the 2026-05-21 entry, `aplus` / `pirelli` / `hankook` / `goodyear-tires` were already deleted as empty pages — only `/pages/fortune` is still a live no-canonical-keeper.) Token used: `SHOPIFY_ADMIN_ACCESS_TOKEN` from `princetires-app/.env.local` (admin domain `prince-tires-5560.myshopify.com`, not `princetires.myshopify.com` as the original request guessed). Script saved at `/tmp/shopify-redirects.sh` — idempotent (re-runs report "already redirected, skipped").

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
