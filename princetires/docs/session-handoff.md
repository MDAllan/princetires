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
- **Tests:** Playwright specs in `princetires/tests/`. Run: `npx playwright test tests/<spec> --project=chromium`.
- **Ubersuggest MCP:** connected at user scope (`~/.claude.json`) — `https://ubersuggest-mcp.neilpatelapi.com/mcp`, OAuth. 37 SEO tools (`ubersuggest__*`: domain / keyword / backlink / site-audit / rank-tracking). Tools load into a session only after a window reload following the connect. The OAuth token expires between sessions — when a session reports "token expired", re-authorize in the browser, then **reload the window**: an already-running session won't pick up the refreshed token in place, even after a successful browser auth.

## Open loose ends (update every session)

- **Code-review backlog (2026-05-15)** — deep review found 2 leaked credentials + 7 critical + 16 high issues across both repos. Full checklist: `docs/code-review-2026-05-15.md`. Still top priority — the 2 leaked credentials are live exposure.
- **Ubersuggest SEO program — W4–W6 pending** — W1–W3 done (`docs/seo-baseline-2026-05-17.md`). Remaining: W4 content/AEO calendar, W5 backlink-gap → directory submissions, W6 rank-tracking project. Also pending: W2 local-independent competitor profiling; Tier-2 (optimize winter/all-season collections) + Tier-3 (programmatic size pages) from the W3 build list.
- **`page.fleet-tires-calgary.json`** renders "Starting from Contact us for fleet pricing" — blank its `price_range` (badge then hides) or reword.
- **`princetires-app` work direction undecided** — 3 options were offered (app security fixes from the review / finish Phase 2 customer-bookings / start Phase 3 staff CRM); user pivoted to the Ubersuggest setup before choosing. Still open.
- 2 stale failing tests — `collection-phase1.spec.js` #4 (rim-pill) + #5 (results count). Test UI removed in earlier sessions. Fix or delete.
- 84 tires still missing `custom.tire_model` — re-run `princetires-app/db/fill-tire-models.mjs`.
- Garage-banner "Yes filter" button reported unclickable by the user — tested headless, worked; never confirmed the user's browser/context.
- `greenmax` vendor casing + `Durun`/`Durutun` possible duplicate — left as-is deliberately (judgment calls).
- Compare is hidden on mobile — deferred to a future PDP-based compare flow.

## Don't rebuild (tried + reverted)

- "Popular models" pill row on the collection page — user found it visually busy.
- `tire-knowledge.md` full spec scaffold — maintenance trap (specs belong on manufacturer sites / Shopify metafields).
- `active-promos.md` — user decided a hand-maintained promo file isn't needed.

---

# Session Log

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
