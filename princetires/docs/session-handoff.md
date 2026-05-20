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

- **Code-review backlog (2026-05-15)** — `docs/code-review-2026-05-15.md`. SEC-2 (Gemini key in the browser) **RESOLVED** this session. **SEC-1 still live** — Shopify Admin API token printed into a public HTML page by `princetires-app/src/app/api/auth/shopify/callback/route.ts`; delete that route (`PROJECT_PLAN.md:60` says it can go). Plus the 7 critical / 16 high issues (collection sidebar Stud filter never renders, AJAX cart badge wrong target, 3 conflicting Product JSON-LD blocks, competing LocalBusiness schemas, contradictory hours, review-count mismatch).
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
- **`/search` page redirects to homepage instead of showing results** — flagged in earlier sessions, still not fixed. The universal header search now falls through to `/search?q=…` for non-shortcut queries (per user's choice), so this needs to be addressed — likely a `templates/search.json` issue. Verify the search template renders results, not redirects.

## Don't rebuild (tried + reverted)

- "Popular models" pill row on the collection page — user found it visually busy.
- `tire-knowledge.md` full spec scaffold — maintenance trap (specs belong on manufacturer sites / Shopify metafields).
- `active-promos.md` — user decided a hand-maintained promo file isn't needed.
- **Vehicle-based install pricing in `pt-booking-modal.liquid`** (removed 2026-05-19) — install price is now per-product via the `custom.install_price` metafield; vehicle only drives appointment duration. The `vehs[].price` table, the `$120` trailer flat, the `$40` low-profile floor, and the low-profile add-on row are all gone. The OTHER two booking surfaces (`pt-booking-page.liquid`, `pt-service-booking-modal.liquid`) still use by-vehicle because they have no product to read from. See the `booking-install-pricing` memory + the Exception note in the `prince-tires-booking` skill.
- **Cherry-picking booking fix `2a8a170` to master** (2026-05-19) — `master` is 11 commits behind `phase-4-wholesale-portal`; would conflict on 3 of 5 files. Let phase-4 merge naturally.
- **Aggressive mobile auto-scroll on input focus** (2026-05-20) — first attempt fired `scrollIntoView` on focus + on every keystroke, anchoring the input flush with viewport top (12px). User found it too aggressive ("scrolls up too much"). Reverted to **visualViewport.resize-only**, with a 30%-comfort-band skip and a softer 50px landing target. Don't re-add focus-based scroll or onInput re-anchor — `visualViewport.resize` is the only correct trigger.
- **Aggressive header overlay mobile `margin-top: 14px`** (2026-05-20) — same complaint family. Reverted to `24px`. Don't push it lower.

---

# Session Log

## 2026-05-20 — Search overhaul: partial-query chips · trim pulse · arrow-CTA fixes · universal header search · mobile keyboard · recent + popular

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
