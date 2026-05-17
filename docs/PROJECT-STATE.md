# Prince Tires — Project State Snapshot

> **Purpose:** single ground-truth dashboard. Created after a full codebase + store + docs deep-dig.
> **This supersedes the status claims in all other plan docs.** When a plan doc disagrees with this file, this file is right (it was built from the actual code, git, and live store).
> Last verified: deep-dig of both repos + Shopify Admin API.

## 📍 Start here — code maps

New to the codebase (or a future session)? Read these first:

- [princetires-app/ARCHITECTURE.md](../princetires-app/ARCHITECTURE.md) — the backend + staff-admin app (Next.js 16).
- [princetires/ARCHITECTURE.md](../princetires/ARCHITECTURE.md) — the storefront theme (customized Dawn).

These are *maps* (where things live), kept in sync with code via the
"update the doc in the same commit" rule. **This file** is the *status* dashboard
(what's done, what's left). New feature work should also get a short design doc in
`docs/`.

## ⚠️ Headline finding: the code is far ahead of the plans

Every planning doc (`PROJECT_PLAN.md`, `PLAN.md`, the design-decisions doc) describes **Phase 1 as "to build."** It is not. **Phase 1 is fully built and wired**, backend + theme. `princetires/assets/my-garage.js` line 38 even carries the comment `// Phase 1 — Q4 + Q11: cache-then-refresh from /apps/api/vehicles.` — the grilled design decisions were already implemented.

**Do not re-implement Phase 1.** Treat the plans as historical intent, not a to-do list. This file is the to-do list.

## Build status — verified against actual code + store

| Phase | Plan says | Reality | Evidence |
|---|---|---|---|
| **0 — Foundation** | mostly done | ✅ **DONE & LIVE** | Partners app `356062658561`, App Proxy signed, 3 webhooks delivering, Admin API verified |
| **1 — Customer vehicles** | "to build" | ✅ **BUILT & WIRED** | 5 routes `api/proxy/vehicles/**`, libs `vehicles/{ownership,validation}.ts` + `customers/ensure.ts`, migrations `011-vehicles-extras.sql` + `012-vehicles-image.sql`, `my-garage.js` calls `/apps/api/vehicles` (11×), `extensions/garage-block` customer-account extension |
| **1 — `custom_image`** | design doc Q9 said "skip" | ✅ **BUILT anyway** | `db/012-vehicles-image.sql` + `api/proxy/vehicles/[id]/image/route.ts` exist. The Q9 "defer" decision was reversed. |
| **2 — Customer bookings surface** | "to build" | ✅ **BUILT 2026-05-15** | `api/proxy/bookings` GET route + booking serializer + theme garage panel rewired (`loadBookings()`). Cancel page already existed. ⏳ Needs migration 014 applied + app deploy. Booking caps still deferred. See `docs/phase-2-bookings-surface.md`. |
| **3 — Staff customer management** | "to build" | ❌ NOT built | `/admin/customers` still thin email-aggregated list |
| **3.5 — Service catalog** | "to build" | ✅ **BUILT 2026-05-17** | DB `services` table + `/admin/services` editor — edit, **add, delete** services/add-ons — + `GET /api/services` (Stage 1); all 3 booking surfaces read the catalog (Stage 2). Admin edits reach customers. Remaining: wire per-service duration into the booking calendar. See `docs/phase-3.5-service-catalog.md`. |
| **4 — Wholesale portal data** | "to build" | ❌ NOT built | |
| **5 — Staff B2B cockpit** | "to build" | ❌ NOT built | `orders-create` webhook is an HMAC-only stub |
| **6 — Inventory & containers** | "to build" | ❌ NOT built | |
| **Tire-search (Projects A/B/C/D)** | separate roadmap | ✅ **SHIPPED** | Committed Playwright specs `tests/project-{a,b,c,d1}-*.spec.js`; collection-page rebuild done |

## What's actually left to build

1. ~~**Phase 2 remainder** — `api/proxy/bookings` customer bookings surface~~ — ✅ built 2026-05-15 (`docs/phase-2-bookings-surface.md`); needs migration 014 + deploy. Remaining: booking caps + "next available" hint.
2. **Phase 3** — staff customer management (CRM-lite in `/admin/customers`).
3. **Phase 3.5** — service catalog (DB-driven service prices/durations).
4. **Phase 4** — wholesale portal data wiring.
5. **Phase 5** — staff B2B cockpit (`orders-create` webhook still a stub).
6. **Phase 6** — inventory & container procurement.

## 🔴 Top risk — unpushed work

| Repo | Risk |
|---|---|
| `princetires/` (theme) | **58 commits ahead of `origin/master`, never pushed** + 19 modified files of real WIP (404-page rebuild, brands-page expansion, 5 new brand templates). If this repo is re-cloned from origin, **all of it is lost.** |
| `princetires-app/` | 2 commits ahead of `origin/main`, unpushed + 3 modified files (framer-motion dep + garage-block extension link). |
| both | Theme repo has BOTH `origin/main` and `origin/master` — clarify which is canonical before pushing. |

**Action before any new work: commit + push both repos.** This is the single highest-priority cleanup.

## Plan docs — canonical vs archive

**Canonical (keep, trust):**
- `princetires-app/PROJECT_PLAN.md` — phase scope/architecture reference. **But its status claims are stale — use THIS file for status.**
- `princetires/docs/superpowers/specs/2026-05-10-tire-search-roadmap.md` + its 4 project plans — tire-search (already shipped; now historical record).
- `princetires/docs/session-handoff.md` — running session log.
- `docs/PROJECT-STATE.md` — this file — for current status.

**Archive (stale, misleading — move to `docs/archive/`):**
- All six `docs/superpowers/plans/2026-04-28-*.md` — superseded 5-phase audit plan.
- `docs/2026-05-08-phase-1-design-decisions.md` — Phase 1 is built; this is now a historical design record, not a to-do.
- `princetires/docs/CLAUDE-CODE-PROMPT.md`, `HOMEPAGE-BRIEF.md` — homepage long since built.

**Reconcile:** `princetires/PLAN.md` overstates the booking cancel-link as shipped — partly stale; demote below this file.

## Dead code / cruft to clean (low priority)

- `service_slots` table + `db/seed-slots.mjs` — abandoned; booking system uses `scheduled_date`/`scheduled_time`. `bookings.slot_id` is a vestigial nullable FK.
- `src/lib/shopify/storefront.ts` — wired but zero importers.
- Theme orphans — `sections/pt-navbar.liquid`, `sections/pt-brands-hero.liquid` (no template references them), `snippets/schema-review.liquid` (rendered nowhere).
- `db/fix-tires-collection-rules.mjs` + `-v2` + `-v3` — three versions of one script; keep v3, delete v1/v2.
- `.theme-backups/` — 4 full Dawn snapshots; archive off-repo.
- No DB migration runner — `apply-schema.mjs` runs only `schema.sql`; migrations 002–013 are manual.

## 🔐 Security

- `princetires/config/settings_data.json` is tracked in git and contains a **live `gemini_api_key`**. Rotate it and move the key server-side.

## Store reality (Shopify Admin API, live)

- **3,930 products · 78 collections · 476 customers · 7 orders** — big catalog, low online-order volume (business runs on bookings + in-person, not online checkout).
- **50+ pages** — messy accumulation (avada-sitemap-*, many brand pages, duplicate `tires`/`tires-1`, etc.). Worth a page audit someday.
- **18+ themes** — live theme is "Copy of Dawn" `#186307215635`; rest are unpublished dev copies. The local `princetires/` repo's exact theme linkage is unconfirmed (no `.shopify/` config).
- 3 webhooks registered + delivering: `customers/create`, `customers/update`, `orders/create`.

## Recommended next actions (in order)

1. **Commit + push both repos.** Theme: 58 commits + WIP. App: 2 commits + WIP. Resolve `origin/main` vs `origin/master`. Nothing else until this is safe.
2. **Update `PROJECT_PLAN.md` status** — mark Phases 0, 1, tire-search as done; strike the stale "to build" language.
3. **Archive the stale plan docs** (list above) into `docs/archive/`.
4. **Pick the real next phase** — Phase 2 remainder (customer bookings surface) is the smallest and unblocks the most.
5. Rotate the leaked `gemini_api_key`.
6. Dead-code cleanup — opportunistic, not blocking.
