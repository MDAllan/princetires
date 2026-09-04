# Phase 8 — Demand Planning & Reordering (QuickBooks-fed)

**Date:** 2026-06-10
**Status:** Design — not started. **Blocked on QuickBooks data-grain discovery (Phase 8.0).**
**Lives in:** `princetires-app` (staff admin), under `/admin/inventory/reorder` + `/admin/inventory/demand`.
**Depends on:** Phase 6 inventory engine (on-hand per Location/bin) · Phase 7 import shipments (inbound qty + lead time) · **QuickBooks sales history** (the demand signal) · Phase 6.6 PO module (a reorder flag drafts a PO).

## Goal

Two deliverables the user asked for:

1. **A ranked list of tire sizes by annual volume** — "which sizes do we actually sell, and how many a year." With %-of-total, YoY trend, and an **ABC class** (A = the vital few sizes that drive most volume; C = the long tail). This is the buyer's cheat-sheet for what to keep deep stock of.
2. **A reorder-flagging system** — for each size/SKU, know *when to order* before you run out, accounting for the long China lead time and seasonal demand, and how much to order.

## The two insights that make this tire-specific

### 1. Lead time means you reorder *months* before empty

A domestic fill from Trail Tire Supply lands next-day. A **China import is ~8–10 weeks** on the water (Phase 7). So a reorder point can't be "stock is low" — it must be **"stock will hit zero before a replacement container can arrive, given how fast this size sells during that window."**

```
Reorder Point (ROP) = demand-during-lead-time + safety-stock
```

For an imported size with a 70-day lead time selling 2/day, you must trigger the order while you still have ~140+ units on hand — not when you're down to 10.

### 2. Demand is seasonal — order winter stock in summer

Calgary tire demand spikes hard: winter tires Oct 15–Nov 15, all-season in spring. A **flat average** demand rate would tell the buyer to order winter inventory in October — two months too late given the import lead time. So demand is modelled with a **monthly seasonal index per size**, and "demand during lead time" uses the forecast for *the specific calendar window the lead time spans*, not a yearly average.

Practical effect: in **June–July**, the system flags *"order winter sizes now — last chance to land before the rush."*

### 3. Dual sourcing per SKU

Most sizes can come **either** from TTS (1-day, higher unit cost) **or** a China import (70-day, cheaper in bulk). Each SKU carries both lead times; the reorder engine evaluates against the *intended* source and recommends accordingly — quick TTS top-ups for the tail, bulk imports for the A-items. A "reorder now (import)" flag drafts a PO → which becomes a Phase 7 shipment; a "reorder now (TTS)" flag drafts a quick domestic PO.

## Data sources — and the make-or-break question

| Source | Gives us | Caveat |
|---|---|---|
| **QuickBooks** (sales history) | The real demand signal — units sold per item per period. The business runs on in-person + bookings, **not** online checkout, so this is the authoritative volume record. | ⚠️ **Grain unknown.** If QB items are per-SKU/size, this is plug-and-play. If they're generic (`"New Tire"`, size in a memo), size-level volume must be parsed or sourced elsewhere. **Phase 8.0 resolves this.** |
| **Shopify** (catalog + inventory) | Structured size taxonomy (`custom.tire_width`, aspect, rim metafields), current on-hand per Location, barcodes for matching. | Only ~7 online orders ever — **useless as a demand source**, excellent as the size taxonomy + on-hand source. |
| **Phase 6 inventory** | On-hand per bin/Location, movements. | — |
| **Phase 7 shipments / POs** | Inbound (on-the-water) qty + per-source lead times. | — |

**The join:** QuickBooks gives *volume*, Shopify gives the *structured size* + *on-hand*. Matching key = SKU/barcode if QB items carry one, else a fuzzy name match (QB item name → Shopify variant). The quality of this join is the project's main risk.

### Phase 8.0 — QuickBooks data-grain discovery (do this first, ~1 hr)

Before any build, pull and inspect:
- `qbo_accounting_get_product_service_list` — how are tire items structured? Per-SKU? Per-size? Generic? Do they carry a SKU/barcode?
- `qbo_accounting_get_sales_by_product_summary` (LAST_YEAR + LAST_12_MONTHS, `split_by=Month` for seasonality) — does the report break down by size, and is there enough history?

**Three possible outcomes:**
- **(A) Per-size/SKU items** → demand ranking is a direct report; matching to Shopify is clean. Best case.
- **(B) Generic items, size in description/memo** → parse descriptions to extract size; lower confidence; may need a one-time mapping table.
- **(C) Too generic to recover size** → fall back to: (i) booking/quote history in princetires-app, or (ii) a manual "expected annual volume" seed per A-size that the system refines over time.

The rest of Phase 8 assumes (A); the doc notes where (B)/(C) change the plan.

## Data model

Migration `db/037-demand-reordering.sql` (next free number after the Phase 7 `036-*`):

```sql
-- Aggregated demand, one row per (size or variant) per month. Refreshed from QuickBooks.
create table demand_history (
  id                 uuid primary key default gen_random_uuid(),
  period_month       date not null,                 -- first of month, e.g. 2025-11-01
  size_key           text,                          -- normalized size 'P225/65R17' (planning grain)
  shopify_variant_id bigint,                         -- SKU grain when matched (nullable)
  units_sold         int not null default 0,
  revenue_cents      int not null default 0,
  source             text not null default 'quickbooks',  -- 'quickbooks' | 'bookings' | 'manual'
  confidence         text not null default 'high',  -- 'high' (per-SKU) | 'parsed' (from desc) | 'estimated'
  created_at         timestamptz not null default now(),
  unique (period_month, size_key, shopify_variant_id, source)
);
create index on demand_history (size_key, period_month);
create index on demand_history (shopify_variant_id, period_month);

-- Per size/SKU reorder configuration. Sparse: only rows you choose to manage.
create table reorder_settings (
  id                  uuid primary key default gen_random_uuid(),
  size_key            text,
  shopify_variant_id  bigint,
  preferred_source    text not null default 'tts',   -- 'tts' | 'import' — drives which lead time applies
  lead_time_days_tts  int not null default 1,
  lead_time_days_import int not null default 70,
  safety_days         int not null default 14,        -- days of cover buffer (A-items higher)
  reorder_point_units int,                            -- computed; manual override allowed
  target_stock_units  int,                            -- order-up-to level
  min_order_qty       int,                            -- supplier MOQ / container-fill multiple
  abc_class           text,                           -- 'A' | 'B' | 'C' (computed, cached)
  active              boolean not null default true,
  notes               text,
  created_at, updated_at timestamptz not null default now(),
  unique (size_key, shopify_variant_id)
);

-- Snapshot of reorder flags per run, so "when did this go red" is answerable.
create table reorder_flags (
  id                  uuid primary key default gen_random_uuid(),
  run_at              timestamptz not null default now(),
  size_key            text,
  shopify_variant_id  bigint,
  on_hand             int not null,                   -- from Phase 6 / Shopify levels
  inbound             int not null,                   -- open import shipments + POs
  net_available       int not null,                   -- on_hand + inbound - allocated
  reorder_point       int not null,
  status              text not null,                  -- 'ok' | 'order_soon' | 'order_now' | 'overstock' | 'stockout'
  suggested_qty       int,
  suggested_source    text,                           -- 'tts' | 'import'
  reason              text,                           -- human: "winter spike + 70d lead → order now"
  created_at          timestamptz not null default now()
);
create index on reorder_flags (run_at desc);
create index on reorder_flags (status, run_at desc);
```

> `size_key` is the **planning grain** (buy decisions are made by size, then brand chosen). `shopify_variant_id` is the **execution grain** (the actual SKU you reorder). Rows can carry either or both. Same "no local variants table" pattern as the rest of the app.

## The reorder math

Computed by a nightly cron (`/api/cron/reorder-scan`) + on-demand recompute:

```
daily_rate(size, month)   = base_daily_rate(size) × seasonal_index(size, month)
demand_during_lead_time   = Σ daily_rate(size, m) over the lead-time window   ← season-aware, not flat
safety_stock              = safety_days × daily_rate(size, current_or_upcoming_month)
reorder_point (ROP)       = demand_during_lead_time + safety_stock

net_available             = on_hand + inbound − allocated
suggested_qty             = max(0, target_stock − net_available), rounded up to min_order_qty
  where target_stock      = demand over (lead_time + review_period) + safety_stock
```

**Flag states:**
- `net_available ≤ ROP` → **order_now**
- projected to cross ROP within (lead_time + buffer) → **order_soon** (the early-warning that catches seasonal spikes)
- `net_available > target × overstock_factor` → **overstock** (tie up less cash / promote it)
- `net_available ≤ 0` → **stockout**
- else → **ok**

**Seasonal index** per size derived from `demand_history` (12+ months) — the monthly share of annual volume. Sparse-history sizes fall back to their *type's* curve (winter / all-season / all-weather / summer), which the theme already classifies via `custom.seasonality`.

## ABC ranking & the "most common sizes" deliverable

A `size_velocity` view/report over `demand_history`:

| Rank | Size | Units / yr | % of total | Cum % | ABC | YoY | Season profile |
|---|---|---|---|---|---|---|---|
| 1 | P265/70R17 | 820 | 9.1% | 9.1% | A | +12% | 60% AT / 30% winter |
| 2 | P225/65R17 | 740 | 8.2% | 17.3% | A | +4% | mixed |
| … | … | … | … | … | … | … | … |

- **A** = sizes making up the top ~80% of volume (stock deep, worth importing in bulk).
- **B** = next ~15%.
- **C** = the long tail ~5% (source from TTS on demand, don't tie up import cash).

This *is* the buyer's list. Exportable to CSV/xlsx; also drives default `safety_days` and `min_order_qty` per class.

## UI surfaces

### `/admin/inventory/demand` — the size velocity board
The ABC-ranked size table above. Filters by season/type, year selector, YoY toggle, CSV export. Click a size → its monthly trend + the SKUs (brands) that sell in it.

### `/admin/inventory/reorder` — the reorder worklist
The actionable screen. A filtered list of everything flagged `order_now` / `order_soon`, sorted by urgency:

```
🔴 ORDER NOW
  P265/70R17  · on-hand 48 · inbound 0 · sells ~3.1/day (winter ramp)
  ROP 280 · 70-day import lead → order 320  [Draft import PO]

🟠 ORDER SOON (seasonal)
  P225/45R18 winter · on-hand 60 · ROP in ~3 wks
  Last window to import before Nov rush  [Draft import PO]  [Quick TTS top-up]
```

Each row: on-hand, inbound, demand rate + season context, ROP, suggested qty + source, and a one-click **"Draft PO"** (→ Phase 6.6 PO → import becomes a Phase 7 shipment). A "snooze / ignore" per row with a reason.

### Dashboard widget (inventory root + admin home)
**"N sizes need ordering · M seasonal last-calls this month."** The signal the buyer checks weekly.

## Workflows (narrative)

### Building the size list (one-time + ongoing)
1. Phase 8.0 confirms QB grain → `src/lib/demand/quickbooks-sync.ts` pulls Sales-by-Product (split by month, last 2–3 yrs) → normalizes item → `size_key` → writes `demand_history`.
2. A monthly cron refreshes the trailing window. The `size_velocity` view recomputes ABC + seasonal indices.

### A seasonal reorder catch
1. It's late June. Winter-size `P225/45R18` on-hand looks fine (60 units) for *today's* demand.
2. But the season-aware forecast sees the Sept–Nov ramp + the 70-day import lead → projects a November stockout.
3. Nightly scan flags it **order_soon — "last window to land before the rush."**
4. Buyer clicks "Draft import PO" → PO drafted → consolidated into a China shipment (Phase 7) → lands in September → received into a Warehouse Container bin (Phase 6). Crisis averted in June.

### A routine top-up
1. A-size `P265/70R17` net-available dips below ROP mid-season.
2. Flagged **order_now**; suggested source = TTS (fast) since there's no time to import.
3. One-click domestic PO; lands next day.

## Phasing

**Phase 8.0 — QuickBooks data-grain discovery (~1 hr).** Pull product list + sales-by-product; determine grain (A/B/C above); confirm matching key to Shopify. **Gates the rest.**

**Phase 8.1 — Demand sync + size velocity (½–1 day).** `quickbooks-sync.ts`, `demand_history` (migration `037`), `size_velocity` view, `/admin/inventory/demand` board + CSV export. *Delivers the "most common sizes" list.*

**Phase 8.2 — Reorder engine + worklist (1 day).** Seasonal index, ROP math, `reorder_settings` + `reorder_flags`, nightly `/api/cron/reorder-scan`, `/admin/inventory/reorder` worklist + dashboard widget.

**Phase 8.3 — Draft-PO integration (½ day).** "Draft PO" from a flag → Phase 6.6 PO (→ Phase 7 shipment for imports). Closes the loop demand → order → in-transit → receive.

**Phase 8.4 — Tuning (later).** Per-class safety stock, overstock alerts, forecast accuracy tracking (predicted vs actual), optional statistical safety-stock (z-score on demand variance).

**Total: ~2.5–3 days** for 8.1–8.3, after the 1-hr discovery gate.

## Open questions to confirm

| # | Question | Why it matters |
|---|---|---|
| 1 | **QuickBooks item grain** — per-SKU, per-size, or generic? | The make-or-break. Resolved by Phase 8.0. If generic, add a parse/mapping step. |
| 2 | **Years of QB history** available? | 2–3 yrs lets us separate seasonality from noise and compute YoY. 1 yr works but no trend. |
| 3 | **Reorder grain** — flag at size level, exact SKU/brand, or both? | Spec supports both; defaulting to size for planning, SKU for execution. Confirm the buyer's mental model. |
| 4 | **Confirmed China import lead time** (door-to-door weeks)? | Drives every import ROP. Spec assumes ~70 days; tighten with your real number (Phase 7 will track actuals over time). |
| 5 | **Do you reorder the same brands/models repeatedly**, or opportunistic by price? | If opportunistic, SKU-level reorder points matter less than size-level "keep N of this size across any brand." |
| 6 | **Does QB carry the Shopify SKU/barcode** on items? | Clean join key vs fuzzy name match. Phase 8.0 checks. |
| 7 | **Min order qty / container-fill** rules per supplier? | `suggested_qty` rounds to these. Needed for realistic order sizes. |

## Risks / non-goals

**Out of scope:**
- Statistical/ML forecasting (ARIMA, etc.) — v1 uses seasonal-index × base-rate, which is plenty for this scale. Revisit only if accuracy tracking (8.4) shows it's needed.
- Auto-placing orders — the system *recommends and drafts*; a human always confirms.
- Per-brand demand prediction within a size — v1 plans by size, buyer picks brand.

**Risks:**
- **QB grain (the big one).** If sales aren't size-resolvable, the size ranking degrades to estimates — call this out before promising precision. Phase 8.0 de-risks it up front.
- **QB↔Shopify matching.** No shared key = fuzzy matching = some mismatches. A one-time mapping table + a "review unmatched" screen handles the tail.
- **Sparse seasonality history** for slow sizes — fall back to the type-level seasonal curve.
- **Garbage-in on lead times.** A wrong import lead time silently mis-times every seasonal reorder. Phase 7 should feed *actual* observed transit times back into the default over time.
```
