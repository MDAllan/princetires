# Phase 5 — Wholesale Platform (v2)

**Date:** 2026-05-20
**Status:** Design — not started.
**Supersedes / extends:** the Phase 5 sketch in [princetires-app/PROJECT_PLAN.md](../princetires-app/PROJECT_PLAN.md).
**Depends on:** Phase 0 (App Proxy), Phase 3 (customers CRM), Phase 4 (customer wholesale portal — built 2026-05-17). Pairs with Phase 6 (inventory).

## Goal

Turn `princetires-app` into the **Prince Tires B2B platform**:

1. A per-tier × per-brand discount **matrix** that lets staff set, for example, "Tier 1 customers get 30% off Michelin and 25% off Bridgestone."
2. A customer-facing wholesale portal where B2B customers see their **own** prices, **live inventory**, place orders, reorder from history, request quotes on bulk, and see their AR balance.
3. A **wheel section** with fitment search by vehicle (YMM), tire size, or wheel spec (bolt pattern / offset / hub bore / diameter).

Today the Phase 4 portal shows a B2B customer their tier + business profile, but nothing about pricing, inventory, or wheels.

## Architecture decisions

### 1. The app is the source of truth; Shopify is the render vehicle

`princetires-app` owns the pricing matrix, the catalog regenerator, the order/quote workflow, the inventory state, the AR view. Shopify hosts the storefront the customer browses, the cart, and checkout — but **prices are computed in the app and pushed into Shopify catalogs**, not configured in Shopify by hand.

This sidesteps the non-Plus 3-catalog limit as a hard constraint: the matrix is unbounded inside the app; we just need to fit the *output* into the catalogs Shopify allows.

### 2. The matrix model — `tier × brand → discount%`, with per-customer overrides

The B2B pricing space is a matrix, not a slider, in every serious wholesale industry (see Virto's [B2B pricing guide](https://virtocommerce.com/blog/b2b-ecommerce-pricing), [42signals on price matrices](https://www.42signals.com/blog/price-matrix-benefits-for-business/)). For Prince Tires the meaningful axes are **tier × brand** — that's what aligns with how tire margins actually work (premium brands carry tighter discounts than value brands because of MAP / supplier floors).

```
                       Michelin   Bridgestone   BFG   Cooper   Radar   Linglong   …
Tier 1  (Bronze)        20%          18%        20%    22%     28%      30%
Tier 2  (Silver)        22%          20%        22%    24%     30%      32%
Tier 3  (Gold)          25%          23%        25%    27%     33%      35%
Tier Pro                28%          26%        28%    30%     36%      38%
```

A row + a column = one cell = the discount off retail. **Per-customer overrides** sit on top: a specific Company can carry a "Michelin = 30%" override that beats their tier row.

### 3. Not every SKU is wholesale-able — two-layered eligibility

Some brands or individual SKUs aren't wholesalable: MAP restrictions, limited
stock, special-order items, or a deliberate retail-only positioning. Eligibility
sits on **two layers**:

- **Brand default** — staff flip each brand on/off in the matrix UI. A disabled
  brand means no tier catalog includes any of its SKUs.
- **Per-SKU override** — a Shopify product metafield `custom.wholesale_eligible`
  (boolean). When set, it wins over the brand default for that specific SKU —
  letting staff carve exceptions in either direction ("wholesale all Michelin
  except these 3" or "Pirelli is retail-only except this one SKU").

The catalog regenerator includes a SKU in a tier catalog only when:

```
  product.metafields.custom.wholesale_eligible = true
  OR (
    product.metafields.custom.wholesale_eligible IS NULL
    AND b2b_brand_settings.wholesale_eligible = true
  )
```

A newly-detected brand defaults to **eligible**. Prince stocks 60+ brands and
the vast majority should be open to B2B — flipping a handful off is faster
than enabling 60 by hand.

### 4. Catalog regeneration, not catalog editing

Native Shopify B2B catalogs ([docs](https://help.shopify.com/en/manual/b2b/catalogs/creating-catalogs)) support "overall % adjustment" and "fixed prices per product/variant" — *not* per-collection rules. So per-brand discounts can't be expressed natively; they have to be **materialized as per-SKU fixed prices**.

The app's `princetires-app/db/regenerate-b2b-catalog.mjs` (new) walks every SKU, looks up `(tier, brand) → discount%`, computes `retail × (1 − discount)`, and writes the price list via `priceListFixedPricesAdd`. Idempotent. Triggered on:

- Matrix edit (a row or cell changes).
- New SKU added in a covered brand.
- Manual "sync now" button.
- Nightly cron as a safety net.

One catalog per tier (Tier 1 / Tier 2 / Tier 3). Tier Pro = the same Tier 3 catalog + a per-customer override catalog assigned to specific companies, OR a 4th catalog if we add Markets. Fits inside the 3-catalog/non-Plus limit comfortably.

### 5. Customer portal stays in the theme; the app supplies the data

Phase 4 already wired the theme portal to `/apps/api/wholesale/me` via App Proxy. We extend the same channel — add proxy routes for inventory, RFQ, AR, reorder. The portal page itself stays as a Shopify theme page (no app-side customer login needed; the App Proxy HMAC handles auth).

This is the same pattern the plan committed to: *"customer identity stays in Shopify, no app-side customer login."*

### 6. Wheels — a real product category in Shopify, with fitment metafields, searched via Wheel Size API

Build wheels as Shopify products (the existing `/collections/wheels` exists). Add fitment metafields: `bolt_pattern`, `offset`, `hub_bore`, `diameter`, `width`, `backspacing`, `finish`. The customer-facing search calls the [Wheel Size API](https://developer.wheel-size.com/) (60,000+ vehicle modifications, OE + aftermarket) and filters Shopify wheel SKUs against the returned fitment range.

The 3 entry points everyone serious offers ([Wheel-Size.com PCD](https://www.wheel-size.com/pcd/), [TireSize](https://tiresize.com/bolt-pattern-finder/), [WheelsASAP](https://wheelsasap.com/custom-wheel-offset-search/)):

1. **By vehicle (YMM)** — year/make/model → OE spec → compatible wheels in stock.
2. **By tire size** — 225/65R17 → wheels with matching diameter + width.
3. **By wheel spec** — diameter, bolt pattern, offset/backspacing range, hub bore.

All three funnel into the same filtered grid.

## Data model (Neon)

New tables in `princetires-app/db/018-b2b-platform.sql`:

```sql
b2b_tiers
  id (text PK, e.g. 'tier_1'), label, display_order, active

b2b_brand_settings                              -- eligibility (decision 3)
  brand text PRIMARY KEY,                       -- 'Michelin', 'BFGoodrich', ...
  wholesale_eligible boolean NOT NULL DEFAULT true,
  notes text,                                   -- staff context ("MAP restricted")
  updated_at

b2b_brand_discounts
  id, tier_id (FK tiers), brand text,            -- 'Michelin'
  discount_pct numeric(5,2),                     -- e.g. 25.00
  updated_at,
  unique(tier_id, brand)

b2b_customer_overrides                            -- per-Company brand override
  id, shopify_company_id bigint, brand text,
  discount_pct numeric(5,2),
  notes text, updated_at,
  unique(shopify_company_id, brand)

b2b_catalog_sync_state                            -- the regenerator's bookkeeping
  tier_id PK, shopify_catalog_id, shopify_price_list_id,
  last_synced_at, last_sync_status, last_sync_error,
  sku_count int, generated_prices_count int

b2b_quotes
  id, shopify_company_id, requested_by_email, line_items jsonb,
  status enum('requested','priced','sent','accepted','rejected','expired'),
  expires_at, draft_order_id bigint, notes, timestamps
```

Phase 6 will add inventory tables (`inventory`, `inventory_movements`, `containers`).

Wheels — Shopify product metafields, no new app tables. Vehicle fitment cache: `wheel_fitment_cache(vehicle_key, payload jsonb, expires_at)` keyed by `year_make_model_submodel` to avoid hammering the Wheel Size API.

## App routes

### Staff cockpit (Better Auth — `/admin/b2b/*`)

| Path | Purpose |
|---|---|
| `/admin/b2b` | KPI dashboard — companies, MTD B2B revenue, pending quotes, AR aging |
| `/admin/b2b/pricing-matrix` | **The matrix.** Editable grid of `tier × brand → %` with a per-brand eligibility toggle on the row header. Save triggers regen. |
| `/admin/b2b/eligibility` | Per-SKU eligibility overrides — searchable product list with bulk "set eligible / ineligible / revert to brand default" actions; writes `custom.wholesale_eligible` metafield via Admin API. |
| `/admin/b2b/companies` | List + detail (buyers, locations, terms, AR, orders, quotes) |
| `/admin/b2b/companies/[id]/overrides` | Per-customer brand overrides |
| `/admin/b2b/applications` | (Folds existing `/admin/wholesale` — approval workflow) |
| `/admin/b2b/quotes` | Quote queue (Requested → Priced → Sent → Accepted) |
| `/admin/b2b/orders` | Order-review queue (Shopify Order Review Rules holds) |
| `/admin/b2b/sync` | Catalog regenerator state + "Sync now" + error log |
| `/admin/b2b/reports` | Revenue by tier / company / month; AR aging; CSV export |

### Customer proxy (App Proxy — `/api/proxy/*`)

| Method · Path | Purpose |
|---|---|
| GET · `wholesale/me` | (Phase 4 — already live) tier + profile |
| GET · `wholesale/inventory?variant_ids=` | Live stock for a list of variants |
| GET · `wholesale/orders` | This customer's order history |
| POST · `wholesale/reorder/[order_id]` | Add an old order's lines back to cart |
| GET · `wholesale/ar` | Outstanding balance + aging buckets + next-due |
| POST · `wholesale/quote` | Submit an RFQ (lines + notes) |
| GET · `wholesale/wheels/fitment?year=&make=&model=&submodel=` | YMM → compatible wheel specs (cached) |
| GET · `wholesale/wheels/by-tire-size?size=225/65R17` | Tire size → matching wheel diameters/widths |

## Phasing (sized roughly)

The user's three asks map onto three sub-phases, each independently shippable.

### Phase 5A — Pricing matrix + eligibility (the foundation) · ~2.5 weeks
- Migration 018: `b2b_tiers`, **`b2b_brand_settings`**, `b2b_brand_discounts`, `b2b_customer_overrides`, `b2b_catalog_sync_state`.
- Shopify metafield definition for `custom.wholesale_eligible` (boolean, product-level) — one-time setup.
- `src/app/admin/(shell)/b2b/pricing-matrix/page.tsx` — the editable grid + per-brand eligibility toggle on the row header.
- `src/app/admin/(shell)/b2b/eligibility/page.tsx` — per-SKU override manager (search, filter by current state, bulk actions).
- `src/lib/b2b/regenerator.ts` — the catalog regenerator: filter by eligibility (`b2b_brand_settings` ∪ per-product metafield), then walk eligible SKUs, compute prices, write `priceListFixedPricesAdd`.
- Shopify Companies API integration (`src/lib/shopify/b2b.ts`): create Company from approved wholesale application, assign tier catalog.
- One-time migration: backfill `b2b_brand_settings` from the existing distinct vendor list (all default eligible). Convert the 4 existing wholesale-tagged customers → Companies + tier catalog assignment.
- Verification: (1) flip a brand off in the matrix → regen runs → that brand's SKUs disappear from B2B customers' PDPs. (2) change a cell → background sync → a B2B customer reloads `/products/...` and sees the new price.

### Phase 5B — Customer portal enrichments · ~1.5 weeks
- App Proxy routes: `/inventory`, `/orders`, `/reorder`, `/ar`, `/quote`.
- Theme additions to `sections/wholesale-landing.liquid` (the portal section we just wired in Phase 4):
  - **Live inventory** chips on the dashboard "shop tires" links.
  - **Reorder** action on each row of the order history table.
  - **RFQ widget**: a "Request a bulk quote" tile + form.
  - **AR snapshot** card: outstanding balance + next-due, with a download-invoice link.
- Staff `/admin/b2b/quotes` queue + quote-to-draft-order conversion.

### Phase 5C — Wheels + fitment search · ~2 weeks
- Wheel product metafields (`bolt_pattern`, `offset`, `hub_bore`, `diameter`, `width`, `backspacing`, `finish`). One-time backfill from supplier data where possible.
- Wheel Size API integration (`src/lib/wheels/wheel-size.ts`) + fitment cache.
- New theme section `sections/pt-wheels-search.liquid` rendered at `/pages/wholesale-wheels`:
  - YMM picker (year → make → model → submodel) — populated from Wheel Size API.
  - "By tire size" + "By spec" tabs feeding the same result grid.
  - Result grid = wheel collection products filtered by the returned fitment.
- Cross-sell: when a YMM lookup happens, surface the matching **tires** for that vehicle's OE size alongside the wheels.

### Phase 5D — Staff B2B cockpit polish · ~1.5 weeks (already half-scoped in PROJECT_PLAN)
- Companies list + detail tabs (buyers, locations, catalogs, terms, orders, AR, quotes, audit).
- Order-review queue (Shopify holds via Order Review Rules).
- Reports + CSV exports.
- Webhooks: `companies/*`, `orders/cancelled`.

Total: ~7 weeks if sequential, ~4–5 if 5A and 5C run in parallel (different domains).

## Open decisions

1. **Tier Pro fits where?** Three real options: (a) collapse Pro into Tier 3 + per-customer overrides (simplest, hits the 3-catalog cap with breathing room); (b) ship a 4th catalog using Markets (works on most plans now); (c) accept the constraint on non-Plus and re-evaluate. Default: **(a)** until volume forces (b).
2. **Order placement path for B2B.** Native Shopify checkout (customer pays in cart) vs. quote-first / Net-N terms (staff prices → customer pays an invoice). I'd ship **both**: small orders go through native checkout against the tier catalog; orders over $X auto-route through the quote queue.
3. **Wheel inventory model.** Does Prince stock wheels in-house at SKU level, or is it special-order / dropship from a distributor? This drives whether wheel stock comes from Shopify inventory (in-house) or from the distributor's feed (dropship) — and whether Phase 6 needs to cover wheels too.
4. **Per-customer override granularity.** Per-brand-per-customer (what's specced) covers ~99% of real wholesale cases. Per-SKU-per-customer (rarely needed; e.g. "this customer gets a special on this one Michelin SKU") is doable on the same table — just store `brand=null, sku_or_variant_id=…`. Adding it now is cheap; deferring is also cheap.
5. **Pricing visibility on the public storefront.** Should non-B2B browsers see retail (current behavior) or "Sign in to see your price" CTAs? B2B-tagged customers see their price natively — that part's solved.
6. **Quote → order conversion.** Stripe payment-link / Shopify draft-order invoice / manual? Probably Shopify draft-order invoice — Shopify already emails the customer, and the order lands in the existing pipeline.

## Smoke tests (per sub-phase)

- **5A** — staff edits `Tier 2 / BFG` from 22% to 25% → catalog regenerator runs → a Tier 2 customer reloads a BFG PDP within 60s and sees the new price.
- **5B** — B2B customer opens `/pages/wholesale-portal` → inventory pill shows live stock; clicks "Reorder" on a past order → cart filled with the same lines at the customer's current tier prices.
- **5C** — B2B customer enters "2019 Ford F-150" → grid shows the matching wheels + OE tire sizes; switching to "By spec" with `6×135 / 18″ / offset −12 to +25` filters the same grid.
- **5D** — Approve a pending wholesale application → Shopify Company created → tier catalog assigned → customer's first PDP load shows wholesale prices natively, no theme change required.

## Files to touch (master list, indicative)

### App
- `src/app/admin/(shell)/b2b/**` (new — overview, pricing-matrix, companies, applications, quotes, orders, sync, reports)
- `src/app/api/proxy/wholesale/inventory/route.ts`, `/orders/route.ts`, `/reorder/[id]/route.ts`, `/ar/route.ts`, `/quote/route.ts`, `/wheels/fitment/route.ts`, `/wheels/by-tire-size/route.ts` (new)
- `src/lib/b2b/regenerator.ts` (new — the catalog write engine)
- `src/lib/b2b/pricing.ts` (new — `priceFor(customerId, variantId)`; the single function everything else calls)
- `src/lib/shopify/b2b.ts` (new — Companies, Catalogs, PriceLists, DraftOrders helpers)
- `src/lib/wheels/wheel-size.ts` (new — Wheel Size API client + fitment cache)
- `db/018-b2b-platform.sql` (new) — Phase 5A
- `db/019-quotes.sql` (new) — Phase 5B
- `db/020-wheel-fitment-cache.sql` (new) — Phase 5C
- `vercel.json` — cron entries for nightly catalog regen + AR refresh

### Theme
- `sections/wholesale-landing.liquid` — extend the portal with the inventory / reorder / RFQ / AR tiles (the Phase 4 file we already enhanced).
- `sections/pt-wheels-search.liquid` (new) — the wheel/fitment search.
- `templates/page.wholesale-wheels.json` (new).
- `snippets/pt-b2b-price-badge.liquid` (new) — small "Tier 2 · 22% off" badge for product cards / PDPs.

## References

- Shopify B2B native — [catalogs overview](https://help.shopify.com/en/manual/b2b/catalogs) · [creating catalogs](https://help.shopify.com/en/manual/b2b/catalogs/creating-catalogs) · [Manage B2B catalogs dev docs](https://shopify.dev/docs/apps/build/b2b/manage-catalogs).
- Industry context — [U.S. AutoForce](https://www.usautoforce.com/) (hub-and-spoke + dealer programs), [Tireweb Wholesale](https://www.tireweb.com/product/tireweb-wholesale) (the SaaS most independents resell), [ATD Online](https://atdonline.com/login).
- Pricing model — [Virto B2B pricing guide](https://virtocommerce.com/blog/b2b-ecommerce-pricing), [42signals on matrix pricing](https://www.42signals.com/blog/price-matrix-benefits-for-business/).
- Fitment data — [Wheel Size API](https://developer.wheel-size.com/) (chosen), alternatives: [SEMA Data Co-op](https://wordpress.org/plugins/sema-api/), [Convermax](https://convermax.com/integrations).
- UX patterns — [Wheel-Size PCD finder](https://www.wheel-size.com/pcd/), [WheelsASAP offset finder](https://wheelsasap.com/custom-wheel-offset-search/).
