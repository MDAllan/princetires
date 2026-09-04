# Phase 6 — Inventory Management (multi-location + bins)

**Date:** 2026-06-01
**Status:** Design — not started.
**Pairs with:** Phase 5 (Wholesale Platform — both share Shopify Location concept and the catalog regenerator).

## Goal

Give staff a clear, accurate, navigable view of **where every tire physically is** and **how to receive / pick / count it** — replacing the current model where every SKU is just "at 42nd Ave" regardless of which container, rack, room, or supplier it actually lives in.

Three concrete problems this solves:

1. **Trail Tire Supply inventory pollution.** Today the external Trail Tire Supply auto-sync drops new SKUs into 42nd Ave's Shopify Location. That makes 42nd Ave's stock look 3-4× larger than it is, and ops has to mentally subtract "what's actually here" from "what TTS could ship to us." Fix: a dedicated **Trail Tire Supply** Shopify Location (non-fulfillable), so the storefront still shows the stock as available, but ops sees the true split.

2. **No sub-location granularity.** Inside 42nd Ave / Edmonton Trail / Warehouse there's no concept of "which rack, which room, which container." Stocktake is guesswork. Picking is "ask whoever last touched it." Receiving has no slot. Fix: a **bins** layer inside our app, mapped 1:N under each Shopify Location.

3. **Greenfield inventory UI.** `src/app/admin/(shell)/` currently has no inventory page at all. Fix: build one.

## Architecture decisions

### 1. Shopify Locations = buildings/zones (4 of them, fixed). Bins live in our app.

Shopify treats every Location as a fulfillable warehouse with its own inventory levels per variant. Basic plan caps active Locations at 10. We have headroom but no reason to spend it on bin granularity — Shopify staff (POS, fulfillment) only need to see *which building* something is in, and ops on princetires-app sees the bin.

The four Shopify Locations:

| # | Name | Fulfillable | Notes |
|---|---|---|---|
| 1 | **42nd Ave Calgary** | ✓ | Retail + back stock. Existing. |
| 2 | **Edmonton Trail** | ✓ | Existing. Single building, multiple bins (racks + rooms). |
| 3 | **Warehouse Containers** | ✓ | ~10 containers on yard. Likely already exists; if not, create. |
| 4 | **Trail Tire Supply (Supplier)** | **✗ non-fulfillable** | New. The customer-facing storefront aggregates total available across all 4 Locations, so customer doesn't see "out of stock at 42nd Ave, in stock at supplier" — they just see "in stock." Ops sees the breakdown internally. When a TTS-sourced unit is part of a booking, the workflow is "order from TTS → arrives at 42nd Ave → inventory record moves Location." |

Why non-fulfillable for Trail Tire Supply: Shopify won't allow it to be picked as a default fulfillment Location, so a customer-facing checkout flow won't accidentally route an order to "ship from supplier." It still counts toward storefront availability via `inventoryItem.tracked` + aggregated `inventoryLevels`.

### 2. Bins are a flat list under each Location, typed by storage shape.

```
inventory_bins
  id                  uuid PRIMARY KEY
  shopify_location_id bigint NOT NULL      -- the Shopify Location this bin lives in
  code                text NOT NULL        -- machine code: "RACK-A1", "CONTAINER-07", "ROOM-2"
  display_name        text NOT NULL        -- human label: "Rack A1", "Container 7 (front row)"
  type                text NOT NULL        -- 'rack' | 'room' | 'container' | 'floor' | 'pallet' | 'other'
  sort_order          int DEFAULT 0
  active              boolean DEFAULT true
  notes               text
  created_at, updated_at timestamptz

  UNIQUE (shopify_location_id, code)        -- "RACK-A1" can exist at both 42nd Ave AND Edmonton
```

No tree / nested bins (a Rack doesn't contain Pallets which contain Boxes). Real WMS systems sometimes go deeper, but at Prince Tires' scale the bin code itself can carry the granularity ("RACK-A1-SHELF-3" if needed) — and a flat list keeps the UI scannable. Type field exists so the UI can render an appropriate icon (📦 container, 🗄 rack, 🏠 room) and so analytics can answer "how much stock is in containers vs racks."

### 3. Variant ↔ Bin assignments. Many-to-many. Counts live on the assignment.

```
inventory_bin_assignments
  shopify_variant_id  bigint NOT NULL
  bin_id              uuid REFERENCES inventory_bins(id) ON DELETE CASCADE
  qty                 int NOT NULL DEFAULT 0
  last_counted_at     timestamptz
  last_counted_by     text                 -- staff email
  created_at, updated_at timestamptz

  PRIMARY KEY (shopify_variant_id, bin_id)
```

One variant can live in many bins (e.g. 4 P225/65R17 on Rack A1, 8 of the same SKU in Container 3 — multi-bin is normal). The sum of `qty` for a given variant across all bins **at one Shopify Location** is what we expect Shopify's `inventoryLevels` to report for that (variant, location) pair. Drift between the two = staff need to count.

We don't FK to a local `variants` table because we don't have one. `shopify_variant_id bigint` is the source of truth, same pattern `db/024-quotes.sql` already uses (`variant_id bigint`).

### 4. Movements log — append-only audit trail.

```
inventory_movements
  id                  uuid PRIMARY KEY
  shopify_variant_id  bigint NOT NULL
  from_bin_id         uuid                 -- null = "from outside the system" (receiving)
  to_bin_id           uuid                 -- null = "left the system" (sold/transferred out)
  qty_delta           int NOT NULL         -- signed: +n on receive, -n on pick, both on transfer (2 rows)
  reason              text NOT NULL        -- 'receive_supplier' | 'pick_for_order' | 'pick_for_booking' | 'transfer' | 'stocktake_adjust' | 'damage' | 'return'
  reference_type      text                 -- 'booking' | 'order' | 'supplier_po' | 'stocktake_session' | null
  reference_id        text                 -- the id of the referenced thing
  actor_email         text NOT NULL
  notes               text
  created_at          timestamptz NOT NULL DEFAULT now()
```

Every change to `qty` on an assignment goes through here. Lets staff answer "what happened to the 4 tires that were in Container 3 last Tuesday?" — and lets us reconcile against Shopify when things drift. Transfers between bins write **two** rows (one negative on `from_bin_id`, one positive on `to_bin_id`) so a sum is consistent.

### 5. Source of truth: Shopify for the aggregate count, our app for the bin split.

Shopify's `inventoryLevels` already track `(variant, location) → quantity`. We don't try to replace that — that's what POS, the storefront, and Shopify-side automations read. **Our `bin_assignments` are a sub-ledger** that explains how the Shopify number breaks down across bins inside a Location.

The contract:

- For every `(variant, shopify_location_id)` pair, `sum(qty)` across our bins **should equal** Shopify's `inventoryLevels.quantity`.
- Drift triggers an audit-log entry + a staff banner ("12 SKUs out of sync — count needed").
- When staff edits a bin count in our app, we **write back to Shopify** to update its level. When Shopify-side changes happen (POS sale, manual edit), the next sync detects the diff and either auto-allocates the change to a configured "default bin" per Location, or flags for staff to resolve.

Defaulting Location: each Location has a "uncounted bin" (e.g. `42ND-UNKNOWN`, `EDM-UNKNOWN`, `WAREHOUSE-UNKNOWN`) where any unattributed inventory lands. Stocktake walks the uncounted bin to zero over time as staff find where things actually are.

### 6. The Trail Tire Supply sync — not ours, but reroutable.

The external auto-sync (likely a Shopify app since no code exists in `princetires-app/` or the theme repo) currently writes to 42nd Ave's Location. **Phase 6.1 doesn't replace it; it just reconfigures it.** Three possible paths, in order of preference:

a) **The Shopify app / vendor portal has a "destination Location" setting.** Staff opens the app, switches the destination from 42nd Ave to "Trail Tire Supply (Supplier)." One-time fix, done in the Shopify Admin or vendor portal. Most likely path — almost every reputable Shopify inventory-sync app has this.

b) **The sync writes to multiple Locations via app config.** Same as (a) but staff specifies "send TTS-sourced SKUs to TTS Location." If the app's tag/metafield-based routing supports it.

c) **We replace the sync with our own.** Build `src/lib/inventory/trail-tire-sync.ts` that polls TTS (CSV upload? API?) and writes `inventoryLevels` to the new Location. Larger build; only justified if (a) and (b) are off the table.

Discovery step before Phase 6.1: identify which Shopify app is currently doing the sync (Shopify Admin → Apps), and confirm whether its settings expose a destination-Location toggle.

### 7. UI lives in `src/app/admin/(shell)/inventory/`.

A new top-level admin section. New nav entry in `admin-nav.tsx` between "Customers" and "Bookings" (left of where ops normally focus). Read-only first, then receiving, then picking hints on existing booking detail pages.

## Data model summary

Three new tables, all in a single migration `db/025-inventory-bins.sql`:

```sql
create table inventory_bins (
  id uuid primary key default gen_random_uuid(),
  shopify_location_id bigint not null,
  code text not null,
  display_name text not null,
  type text not null check (type in ('rack','room','container','floor','pallet','other')),
  sort_order int not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shopify_location_id, code)
);
create index on inventory_bins (shopify_location_id) where active;

create table inventory_bin_assignments (
  shopify_variant_id bigint not null,
  bin_id uuid not null references inventory_bins(id) on delete cascade,
  qty int not null default 0 check (qty >= 0),
  last_counted_at timestamptz,
  last_counted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shopify_variant_id, bin_id)
);
create index on inventory_bin_assignments (bin_id);
create index on inventory_bin_assignments (shopify_variant_id);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  shopify_variant_id bigint not null,
  from_bin_id uuid references inventory_bins(id),
  to_bin_id uuid references inventory_bins(id),
  qty_delta int not null,
  reason text not null,
  reference_type text,
  reference_id text,
  actor_email text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index on inventory_movements (shopify_variant_id, created_at desc);
create index on inventory_movements (created_at desc);
```

No FK to a `variants` table (we don't have one). Same approach as `quotes.variant_id`.

## UI surfaces

### `/admin/inventory` — root dashboard

Shows the 4 Shopify Locations as cards:

```
┌───────────────────────────┐  ┌───────────────────────────┐
│ 42nd Ave Calgary          │  │ Edmonton Trail            │
│ 12 bins · 847 units       │  │ 8 bins · 312 units        │
│ Last counted: 3 days ago  │  │ Last counted: 1 week ago  │
│ Drift: 0                  │  │ Drift: 4 SKUs ⚠           │
└───────────────────────────┘  └───────────────────────────┘
┌───────────────────────────┐  ┌───────────────────────────┐
│ Warehouse Containers      │  │ Trail Tire Supply (Supp.) │
│ 10 bins · 1,432 units     │  │ 1 bin · 3,891 units       │
│ Last counted: never       │  │ Auto-synced               │
│ Drift: —                  │  │ Drift: —                  │
└───────────────────────────┘  └───────────────────────────┘
```

Click a card → location detail.

### `/admin/inventory/locations/[shopifyLocationId]`

Manage bins inside one Location. Bin list (sortable by code / type / qty / last counted), "+ Add bin" button, click-row to see variants in that bin.

Each bin row shows: code, display name, type icon, unit count, # of unique SKUs, last counted, "open" link.

### `/admin/inventory/bins/[binId]`

Variants in this bin. Searchable, sortable. Edit qty inline (writes a movement). "Move to another bin" action.

Columns: SKU, product title, variant title, qty, last counted, [edit] [move].

### `/admin/inventory/variants/[shopifyVariantId]`

"Where is this product?" view. List of bins holding this variant, with qty in each + Shopify's reported total + drift indicator if they don't match.

### `/admin/inventory/receiving`

A receiving wizard:

1. Pick supplier (Trail Tire Supply, direct from manufacturer, etc.) — drives later analytics.
2. Pick destination Shopify Location.
3. Scan/select SKU → enter qty → pick bin (autocomplete).
4. Repeat. Running total shown on the side.
5. "Commit" — writes the movements + updates assignments + pushes the new levels to Shopify.

Designed for **bulk** flows (a truck arrives with 80 tires across 12 SKUs).

### `/admin/inventory/stocktake`

Cycle-count flow:

1. Pick a bin.
2. App displays the EXPECTED list of (variant, qty).
3. Staff enters ACTUAL count per row, or scans to confirm.
4. Discrepancies highlighted in red. Notes field per row.
5. Commit → writes `stocktake_adjust` movements, updates assignments, syncs to Shopify.

### `/admin/inventory/movements`

Append-only feed (filterable by SKU, bin, actor, date, reason). The "what happened" forensic view.

### Picking hints on existing booking / order detail

When a booking gets confirmed, show staff:

```
PICK LIST
  4× P225/65R17 Haida HD921    → Rack A1 (4 in stock at 42nd Ave)
  1× P225/65R17 spare           → Container 3 (12 in stock at Warehouse)
```

Calculated by `inventory_bin_assignments` at the booking's serving Location. If a booking is across multiple Locations (rare — tires usually all come from one place), show the split.

## Workflows (narrative)

### Receiving a truck from Trail Tire Supply

1. Truck arrives at 42nd Ave with 6 SKUs that we previously ordered from TTS.
2. Staff opens `/admin/inventory/receiving`.
3. Picks supplier = "Trail Tire Supply", destination = "42nd Ave Calgary".
4. Scans each tire, enters qty, picks a bin.
5. On commit:
   - **Subtract** from TTS Location (`inventoryLevels` write) — the supplier no longer needs to ship us this.
   - **Add** to the bin at 42nd Ave (`inventory_bin_assignments` write + Shopify `inventoryLevels` write at 42nd Ave).
   - Movement rows: `from_bin=TTS-FLOOR, to_bin=42ND-RACK-A1, qty=4, reason=receive_supplier, reference_type=supplier_po, reference_id=...`.

### Receiving a direct shipment from manufacturer

Same flow but supplier = "Direct" — TTS Location is not involved. Shopify's TTS level is unchanged.

### Customer orders a tire that's only at TTS

1. Customer places an order on princetires.ca for a SKU whose only stock is at Trail Tire Supply.
2. Shopify routes the order to a fulfillable Location (one of the 3 internal ones). But that Location has 0 of this SKU.
3. Our booking detail page surfaces this as a **needs-supplier-order** state: "0 in stock locally, 12 at Trail Tire Supply."
4. Ops triggers a supplier order to TTS.
5. When the tire arrives at 42nd Ave, ops runs the receiving wizard above. Inventory moves TTS → 42nd Ave.
6. The booking can now fulfill.

This decouples the customer-facing "in stock" signal from the ops-side "I need to call TTS" task — both are handled, neither steps on the other.

### Inter-bin transfer (within one Location)

E.g. consolidating Container 3 into Container 7 to make room.

1. Open Container 3's bin page.
2. Multi-select SKUs.
3. "Move to → Container 7."
4. Single SQL transaction writes two movement rows per SKU and updates assignments. **No Shopify call** — same Location, same level.

### Inter-location transfer

E.g. moving 8 tires from Warehouse Containers to 42nd Ave.

1. `/admin/inventory/transfers/new` (Phase 6.3+).
2. Pick from-Location + to-Location, multi-select SKUs and qty.
3. On commit: writes movements, adjusts bins on BOTH sides, and writes Shopify `inventoryLevels` on both Locations.

### Stocktake cycle

1. Staff picks a bin to count (or picks "all bins at 42nd Ave" for a full count).
2. App shows the expected list; staff counts physically and enters actuals.
3. Discrepancies are written as `stocktake_adjust` movements with notes.
4. Drift indicator on the location dashboard clears for that bin.

## Phasing

**Phase 6.0 — Trail Tire Supply Location (1 hr)**
- Create the "Trail Tire Supply (Supplier)" Shopify Location via Admin API (or UI).
- Mark non-fulfillable.
- Identify the external sync app currently writing to 42nd Ave.
- Reconfigure it (or ask the vendor) to write to the new Location.
- One-shot script to **move existing TTS-sourced inventory** off 42nd Ave into TTS Location. Heuristic: SKUs that were created by the sync (likely tagged or with a specific vendor pattern — the existing `seo_duplicate_products` memory mentions TTS auto-sync creates `-1` duplicates, which suggests there's a recognizable signature).

**Phase 6.1 — Data model + read-only UI (½ day)**
- Migration `db/025-inventory-bins.sql`.
- `/admin/inventory` dashboard (4 location cards).
- `/admin/inventory/locations/[id]` (bin list, no edit yet).
- `/admin/inventory/bins/[id]` (read-only variant list — pulls from Shopify inventoryLevels until we have bin assignments).
- Nav link in `admin-nav.tsx`.

**Phase 6.2 — Bin CRUD + assignment management (½ day)**
- Add/edit/delete bins per Location.
- Edit qty inline on a bin (writes a `stocktake_adjust` movement + Shopify level update).
- Move-between-bins form.
- `/admin/inventory/variants/[id]` — "where is this product?" with drift indicator.

**Phase 6.3 — Receiving flow (½ day)**
- `/admin/inventory/receiving` multi-line wizard.
- Bulk Shopify level updates on commit.
- Movements written with `reason=receive_supplier`.

**Phase 6.4 — Picking hints + booking integration (½ day)**
- On existing booking detail page (`src/app/admin/(shell)/bookings/[id]/`), show "Pick from: [Bin] (n in stock)" derived from current assignments.
- Auto-decrement on booking status → `fulfilled` (movement reason `pick_for_booking`).

**Phase 6.5 — Stocktake + movements log (½ day)**
- `/admin/inventory/stocktake` cycle-count wizard.
- `/admin/inventory/movements` filterable feed.
- Drift detection cron (`/api/cron/inventory-drift-check`): compare sum-of-bin-qty to Shopify levels, flag mismatches.

**Phase 6.6 — Inter-location transfers (later)**
- Transfers screen.
- Multi-bin moves between Locations with Shopify-level updates on both sides.

Total greenfield work: **~2.5 days** for Phases 6.0–6.5. 6.6 is a nice-to-have.

## User decisions captured (2026-06-01)

| # | Question | Answer | Impact on design |
|---|---|---|---|
| 1 | Which Shopify app is doing TTS sync? | **Unknown — and there may be problems with it.** | Phase 6.0 leads with a *discovery* sub-step: open Shopify Admin → Apps, list what's installed, identify which one writes inventory. If broken or absent, escalate to "build our own TTS sync." Until resolved, every other piece can still proceed. |
| 2 | Existing Shopify Locations today? | **Only 2 Locations** exist (likely 42nd Ave + Edmonton — needs confirmation). | Phase 6.0 creates **2 new Locations** (Warehouse Containers + Trail Tire Supply), not 1. Basic plan's 10-location ceiling still has ~6 of headroom. |
| 3 | Barcode scanning? | **Yes — staff already scans with their phone in Shopify.** | New `<BarcodeScanner>` component using HTML5 `BarcodeDetector` API (native on Android Chrome, iOS 17+), ZXing-js as fallback. Integrated into receiving + stocktake wizards. Camera permission prompt the first time. |
| 4 | Mobile-friendly? | **Yes — required.** | Receiving + stocktake + bin views are designed mobile-first. Forms are stack-layout, big tap targets, scanner is a full-screen modal. Admin dashboard stays desktop-friendly but works on phone. |
| 5 | TTS-sourced product identifier? | **Tag-based: products imported from TTS are tagged with a TTS tag.** SKUs sometimes also come from the supplier directly. | Migration script (Phase 6.0): find all products with the TTS tag, set their inventory levels to the new TTS Location instead of 42nd Ave. Needs the exact tag name confirmed (probably `trail-tire-supply` or `Trail Tire Supply` — see follow-up Q1 below). |
| 6 | Negative inventory? | **Allowed — staff wants to see where mistakes happened.** | Drop the `CHECK (qty >= 0)` constraint. UI shows red/warning when qty < 0 ("This bin has more outflow than inflow — count needed"), but doesn't block. |
| 7 | Supplier PO tracking? | **Inside princetires-app, not external.** | Phase 6.X adds a `purchase_orders` + `purchase_order_lines` data model. PO flow: staff drafts a PO → marks sent → tire arrives → PO line-item receive (mirrors receiving wizard) writes inventory + closes the line. See [PO module](#purchase-order-module) below. |

## Purchase Order module

Adds two tables and a small flow:

```sql
create table purchase_orders (
  id                   uuid primary key default gen_random_uuid(),
  po_number            text not null unique,              -- 'PO-2026-0001', sequential
  supplier             text not null,                     -- 'trail_tire_supply' | 'manufacturer:michelin' | 'other:<name>'
  status               text not null,                     -- 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  destination_location_id bigint not null,                -- which Shopify Location it'll land in when received
  notes                text,
  total_cost_cents     int,                                -- sum of lines × unit cost, snapshot on send
  ordered_by           text not null,                      -- staff email
  ordered_at           timestamptz,
  expected_arrival_at  date,
  received_at          timestamptz,
  created_at, updated_at timestamptz
);

create table purchase_order_lines (
  id                   uuid primary key default gen_random_uuid(),
  po_id                uuid not null references purchase_orders(id) on delete cascade,
  shopify_variant_id   bigint not null,
  qty_ordered          int not null,
  qty_received         int not null default 0,
  unit_cost_cents      int,
  notes                text,
  created_at, updated_at timestamptz
);
create index on purchase_order_lines (po_id);
```

The flow:

1. **Draft PO.** `/admin/inventory/purchase-orders/new` — pick supplier, add lines (variant + qty + cost). Save as draft.
2. **Send.** "Mark as Sent" — the PO is "out in the world." Inventory at the supplier's Shopify Location (if it's TTS) can be *reserved* against this PO for visibility, but doesn't change stock yet.
3. **Receive.** When tires arrive: open the PO → "Receive" → enter actuals per line (default = qty_ordered). The same code path as the bin-receiving wizard is reused: writes assignments + Shopify levels + movements with `reference_type=purchase_order, reference_id=<po_id>`.
4. **Partial / overage.** If only 6 of 8 arrived, `qty_received < qty_ordered`, status flips to `partial`, the PO stays open. If 10 arrived instead of 8, write the 10 (with a note) and status closes.
5. **Reconcile** later (Phase 7): match PO totals against actual supplier invoices in QuickBooks.

### PO surfaces

- `/admin/inventory/purchase-orders` — list (filter by status, supplier, date)
- `/admin/inventory/purchase-orders/[id]` — detail + receive action
- `/admin/inventory/purchase-orders/new` — draft form
- On a booking detail page where stock is at TTS-only: a "Create PO from this booking" shortcut.

## Updated phasing

Same as before but with PO module slotted in and Phase 6.0 expanded:

**Phase 6.0 — Foundation (1 day)**
- Discovery: identify TTS sync app in Shopify Admin → Apps. Document the situation.
- Create "Warehouse Containers" + "Trail Tire Supply (Supplier)" Shopify Locations.
- Reconfigure (or replace) TTS sync to write to the new Location.
- One-shot migration: walk all products with the TTS tag → set their inventory at 42nd Ave to 0 → set the same qty at TTS Location.

**Phase 6.1 — Data model + read-only UI (½ day)** — unchanged.

**Phase 6.2 — Bin CRUD + assignment management (½ day)** — unchanged.

**Phase 6.3 — Receiving flow (½ day)** — adds the `<BarcodeScanner>` component; mobile-first layout.

**Phase 6.4 — Picking hints on bookings (½ day)** — unchanged.

**Phase 6.5 — Stocktake + movements log (½ day)** — adds scanner to stocktake; mobile-first.

**Phase 6.6 — Purchase Orders (1 day)** — the PO module above.

**Phase 6.7 — Inter-location transfers (later)** — unchanged.

Total: ~4 days of focused work for 6.0–6.6.

## Barcode scanner component

A reusable `<BarcodeScanner onScan={fn}>` wrapping a feature-detect chain:

```ts
if ('BarcodeDetector' in window) {
  // Native: Chrome on Android, iOS 17+. Fast, no JS bundle weight.
  const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','code_128','code_39','qr_code'] });
  // Loop: getUserMedia → drawImage to canvas → detect() → on hit, callback
} else {
  // Fallback: ZXing-js (~150KB gz). Slightly slower but universal.
  const reader = new BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(undefined, videoEl, (result, err) => {
    if (result) onScan(result.getText());
  });
}
```

UI: full-screen modal, viewport on top, sticky "Cancel" button bottom. Auto-closes on successful scan. Permission prompt the first time; if denied, falls back to manual entry input. Scanner sound on hit (matches Shopify POS UX).

Storage: the variant's barcode lives on Shopify (`productVariant.barcode`). Map scanned code → variant via an Admin API query on first scan, cache the result locally so subsequent scans of the same code are instant. The variant query already exists in `src/lib/shopify/admin.ts` patterns.

## Follow-ups resolved (2026-06-01)

| # | Question | Answer |
|---|---|---|
| 1 | TTS product tag | `trail-tire-supply` (lowercase, hyphenated). Confirmed via live query: **3,496 products** carry this tag. |
| 2 | Current Shopify Locations | Live audit found 3: **42 Ave Store** (active, fulfills + ships) at 111 42 Ave SW; **Warehouse Inventory** (active, non-shipping) at 6920 40 St NE; **Warehouse** (inactive, orphan) at "Airport". Phase 6.0 will (a) leave the orphan Warehouse alone, (b) optionally rename "Warehouse Inventory" → "Warehouse Containers" for clarity. |
| 3 | Edmonton Trail | **Yes — add as a new active Shopify Location.** Brings the active count to 4 (5 total counting the orphan). |
| 4 | PO numbering | **Sequential year-based:** `PO-2026-0001`, …, resets each calendar year. |
| 5 | Unit cost on PO lines | **Mandatory.** Unlocks gross-margin reporting. |

## Final Location list after Phase 6.0

| # | Shopify Location | Status | Role | Bins in our app |
|---|---|---|---|---|
| 1 | 42 Ave Store | active, ships + fulfills | Main retail store at 111 42 Ave SW | Racks (A1–An, B1–Bn, etc.) |
| 2 | Warehouse Containers (renamed from "Warehouse Inventory") | active, non-shipping | Container yard at 6920 40 St NE | ~10 containers (CONTAINER-01 … CONTAINER-10) |
| 3 | **Edmonton Trail** *(new)* | active, ships + fulfills | Edmonton physical location | Racks + Rooms |
| 4 | **Trail Tire Supply (Supplier)** *(new)* | active, non-shipping, non-fulfillable | Virtual: supplier's stock that counts toward our storefront availability | 1 catch-all bin ("supplier floor") |

Total active: 4 (well under Basic's 10-location cap). The legacy inactive "Warehouse" at the Airport stays as-is unless you want to delete it for tidiness.

## Reused infrastructure (no duplication)

- `src/lib/shopify/admin.ts` — already exists, handles Admin API auth + GraphQL.
- `src/lib/shopify/markets.ts` — pattern for marketUpdate / location queries; the inventory module copies this style.
- `src/lib/auth/proxy-or-session.ts` — already gates admin API routes via Better Auth.
- `audit_log` table — `inventory_movements` is more specific so it lives separately, but high-level admin actions (creating/deleting a Location, bulk migration, etc.) still write to `audit_log`.
- `admin-nav.tsx` — extend with the new "Inventory" item.
- The Shopify Bulk Operations API for `inventoryLevels` writes when staff commits large stocktakes (one bulk write beats N individual calls).

## Risks / non-goals

**Out of scope for Phase 6:**
- Lot tracking (DOT codes on tires for warranty tracebacks) — Phase 7 if needed.
- Per-bin photos.
- Customer-facing "in stock at your location" indicator (the storefront already aggregates).
- Returns receiving (Phase 7).
- Supplier PO workflow with line-item receiving + bill matching — bigger lift, Phase 7+.

**Risks:**
- **Drift between Shopify and our bin counts is inevitable.** The system has to be tolerant of "Shopify says 5, our bins sum to 7." Resolution = staff count. The UI should make this visible and non-blocking.
- **The TTS sync is third-party code.** Phase 6.0 may run into "the app doesn't expose a destination Location setting" — in which case we either escalate to the vendor's support, OR (worst case) build our own sync. Discovery first, then commit.
- **Bin renaming**: if staff renames a rack, every printed picking slip pointing at the old name is stale. Keep `code` immutable in v1 (or only changeable when the bin is empty); allow `display_name` to change freely.
