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

## Open loose ends (update every session)

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
