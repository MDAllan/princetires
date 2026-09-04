# Phase 7 — Import Shipment Tracking (overseas procurement portal)

**Date:** 2026-06-10
**Status:** Design — not started.
**Lives in:** `princetires-app` (staff admin), under `/admin/inventory/shipments`.
**Depends on:** Phase 6 inventory engine (built: bins, assignments, movements, receiving wizard) + the Phase 6.6 **Purchase Order module** (designed, *not yet built* — this phase needs it first; see [Prerequisite](#prerequisite-the-po-module-must-land-first)).
**Subsumes:** the previously-vague "Phase 7 — QuickBooks reconcile" reference in `docs/phase-6-inventory-management.md` — landed-cost reconcile is folded in here as Phase 7.6.
**Feeds into:** Phase 8 (`docs/phase-8-demand-reordering.md`) — the *reorder* side. Phase 7 tracks a shipment you've decided to order; Phase 8 tells you *when and how much* to order, drafting the PO that becomes a Phase 7 shipment. Phase 7 also feeds **actual observed transit times** back to Phase 8's import lead-time default.

## Goal

Give staff a single portal to track a tire shipment **from the overseas supplier (China) all the way onto a rack** — and to know what it truly cost per tire once freight, duty, and exchange are baked in.

Four concrete jobs, all chosen by the user (2026-06-10):

1. **Track in-transit ETA** — a live status timeline per shipment: booked → on the water → arrived at port → customs → delivered → received. Departure/arrival ports, container #, bill of lading, vessel, ETD/ETA with revision history.
2. **Tie shipments to POs** — each shipment links to one or more purchase-order lines, so "what's on the water" is always answerable, and a PO can split across containers (or a container can carry several POs).
3. **Receive into inventory** — when a container lands, receive its tires into bins/Locations using the **existing Phase 6 receiving wizard**, writing `inventory_movements` and pushing Shopify levels — no parallel inventory system.
4. **Landed-cost / margin** — capture FOB unit cost + freight + duty + brokerage + insurance + FX, allocate the ancillary costs across the lines, and compute a true **landed unit cost** per tire. This is the basis for gross-margin reporting and the eventual QuickBooks bill-match.

### Why this is its own thing (and not just "another PO")

A domestic PO to Trail Tire Supply is "order → it shows up tomorrow → receive." An import from China is **8–10 weeks of transit you need visibility into**, with costs that arrive *after* the goods (the freight invoice, the customs/duty bill, the broker fee) and an exchange rate that isn't known until you pay. A PO captures *what you ordered*; a shipment captures *the journey and the true cost*. They reference each other but model different things.

## Architecture decisions

### 1. A shipment is a layer **above** the PO, linked at the line level.

```
purchase_order ──< purchase_order_line ──┐
                                          │ (nullable FK)
import_shipment ──< import_shipment_line ─┘
```

- A `import_shipment_line` may reference a `purchase_order_line_id` (the normal case: "this container is fulfilling these PO lines") **or** stand alone (ad-hoc import with no formal PO).
- Many-to-many falls out naturally: PO #12's lines can be spread across shipments SHIP-1 and SHIP-2, and SHIP-1 can carry lines from PO #12 and PO #15. No join table needed — the line-level FK does it.
- `qty` lives on the shipment line (what's *physically* in this container), independent of the PO's `qty_ordered`. A PO line for 200 tires can ship as 120 now + 80 later.

### 2. Status is an explicit lifecycle, with an append-only event log for the timeline.

```
draft → booked → in_transit → arrived_port → customs → delivered → receiving → received → closed
                                                                                         ↘ cancelled
```

- The current status is a column on `import_shipments` (fast to filter/board).
- Every transition, ETA revision, doc upload, or note writes a row to `import_shipment_events` — that's what renders the **timeline** on the detail page and answers "when did the ETA slip and why."
- `receiving` is the in-progress state while staff works the receiving wizard; `received` once all lines are committed to bins; `closed` once costs are reconciled (Phase 7.6).

### 3. Costs are captured as they arrive, in CAD, with the FX rate snapshotted per shipment.

China factories quote **FOB in USD**. The store operates in **CAD**. So:
- `goods_currency` (default `USD`) + `fx_rate_to_cad` (snapshotted when the invoice is paid) convert the FOB goods value to CAD.
- Ancillary costs (`freight`, `duty`, `brokerage`, `insurance`, `other`) are entered in CAD as their invoices land — they trickle in *after* the goods, so each is nullable and timestamped.
- All money stored as integer cents (matches the codebase convention — `total_cost_cents`, `unit_cost_cents` in the PO design, GST rounding rule in the theme).

### 4. Landed cost = FOB(CAD) + allocated ancillaries, allocated by a configurable basis.

When the shipment is costed, an allocation engine spreads the ancillary total across lines and writes a `landed_unit_cost_cents` per line:

```
landed_unit_cost = (fob_unit_cost_usd × fx_rate_to_cad)
                 + (line's share of total ancillaries ÷ line qty)
```

Allocation **basis** is configurable per shipment (default = **by goods value**, the most common for tires; alternatives = **by qty**, **by weight**, **by CBM/volume**). Freight is most fairly split by volume/weight; duty by value. v1 keeps it to a single chosen basis for the whole ancillary pool to stay simple; v2 can split per-cost-type if the user wants the precision.

The landed unit cost becomes the **unit cost on the inventory movement** at receive time → feeds gross-margin reporting (retail − landed) and the QuickBooks reconcile.

### 5. Receiving reuses Phase 6 — zero new inventory plumbing.

When a shipment hits the yard, "Receive" launches the **existing `/admin/inventory/receiving` wizard**, pre-filled from the shipment lines (variant + expected qty + destination Location). On commit it writes the same `inventory_bin_assignments` + Shopify `inventoryLevels` + `inventory_movements` rows as any other receive — only the movement's `reference_type='import_shipment'`, `reference_id=<shipment_id>`, and `unit_cost_cents=landed_unit_cost` differ. Imports are net-new stock (no supplier Location to decrement, unlike the TTS flow).

### 6. Container tracking: **manual ETA entry in v1**, optional carrier API later.

At Prince Tires' volume (a handful of containers in transit at a time), manual ETD/ETA + status updates are realistic and free. A live carrier/sea-freight tracking API (Vizion, SeaRates, project44, or a freight-forwarder portal) is a **Phase 7.5 optional enhancement** — the data model already carries `container_no`, `bill_of_lading`, `vessel`, and `carrier`, so wiring an API later is additive, not a refactor. Don't pay for tracking until the manual flow proves the need.

## Data model

Two-ish new migrations (numbering is manual in this repo — next free numbers after the existing `034-*` are `035`, `036`; the PO module takes one, shipments the next):

- `db/035-purchase-orders.sql` — the Phase 6.6 PO module (prerequisite, see below).
- `db/036-import-shipments.sql` — this phase.

```sql
-- db/036-import-shipments.sql

create table import_shipments (
  id                    uuid primary key default gen_random_uuid(),
  shipment_number       text not null unique,            -- 'SHIP-2026-0001', sequential, resets per year (matches PO numbering)
  supplier              text not null,                   -- 'china:<factory name>' | 'other:<name>' — free-text discriminator
  status                text not null default 'draft'
                          check (status in ('draft','booked','in_transit','arrived_port',
                                            'customs','delivered','receiving','received','closed','cancelled')),

  -- logistics / tracking
  incoterm              text,                            -- 'FOB' | 'CIF' | 'DDP' | 'EXW' | ...
  origin_port           text,                            -- 'Ningbo' | 'Shanghai' | 'Qingdao'
  destination_port      text,                            -- 'Vancouver' | 'Prince Rupert'
  carrier               text,                            -- shipping line / forwarder
  vessel                text,
  container_no          text,
  bill_of_lading        text,
  etd                   date,                            -- estimated departure
  atd                   date,                            -- actual departure
  eta                   date,                            -- estimated arrival (current best)
  ata                   date,                            -- actual arrival at destination port
  customs_cleared_at    date,
  delivered_at          date,                            -- arrived at our yard / Location

  -- where it lands
  destination_location_id bigint not null,               -- Shopify Location it receives into (e.g. Warehouse Containers)

  -- costing (cents = integer; goods in goods_currency, ancillaries in CAD)
  goods_currency        text not null default 'USD',
  fx_rate_to_cad        numeric(10,5),                   -- snapshotted when goods invoice is paid; null until known
  goods_value_cents     int,                             -- FOB goods value in goods_currency cents (sum of line fob × qty)
  freight_cost_cents    int,                             -- CAD
  duty_cost_cents       int,                             -- CAD
  brokerage_cost_cents  int,                             -- CAD
  insurance_cost_cents  int,                             -- CAD
  other_cost_cents      int,                             -- CAD (storage, demurrage, drayage, etc.)
  allocation_basis      text not null default 'value'
                          check (allocation_basis in ('value','qty','weight','cbm')),

  notes                 text,
  created_by            text not null,                   -- staff email
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on import_shipments (status);
create index on import_shipments (eta);

create table import_shipment_lines (
  id                     uuid primary key default gen_random_uuid(),
  shipment_id            uuid not null references import_shipments(id) on delete cascade,
  purchase_order_line_id uuid references purchase_order_lines(id),  -- nullable: link to a PO line, or ad-hoc
  shopify_variant_id     bigint not null,                -- source of truth; no local variants table (same as quotes/movements)
  qty                    int not null,                   -- units in THIS container (may differ from the PO's qty_ordered)
  qty_received           int not null default 0,
  fob_unit_cost_cents    int,                            -- in goods_currency
  unit_weight_g          int,                            -- for weight-basis allocation (optional)
  unit_cbm_cm3           int,                            -- for cbm-basis allocation (optional)
  landed_unit_cost_cents int,                            -- computed at costing time, in CAD
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on import_shipment_lines (shipment_id);
create index on import_shipment_lines (purchase_order_line_id);
create index on import_shipment_lines (shopify_variant_id);

create table import_shipment_events (
  id            uuid primary key default gen_random_uuid(),
  shipment_id   uuid not null references import_shipments(id) on delete cascade,
  kind          text not null,                           -- 'status_change' | 'eta_revision' | 'doc_uploaded' | 'cost_added' | 'note' | 'received'
  from_status   text,                                    -- for status_change
  to_status     text,
  detail        text,                                    -- human description / new ETA / cost type+amount
  actor_email   text not null,
  created_at    timestamptz not null default now()
);
create index on import_shipment_events (shipment_id, created_at desc);
```

> **Document storage** (commercial invoice, packing list, B/L, customs entry): store files on Shopify CDN via the existing `src/lib/shopify/files.ts`, keep the URL in an event's `detail` (or a small `import_shipment_docs` table if richer metadata is wanted in v2). v1 keeps it light: doc upload = an event with a file URL.

### Reused, not rebuilt

- `inventory_movements` — receiving writes here with `reference_type='import_shipment'`. The enum already anticipates extension; no schema change beyond accepting the new reference value.
- `/admin/inventory/receiving` wizard + `<BarcodeScanner>` — pre-filled from shipment lines.
- `src/lib/shopify/admin.ts` (Admin API), `files.ts` (doc upload), `auth/proxy-or-session.ts` (route gating), `audit_log` (high-level actions), `admin-nav.tsx` (nav).
- Sequential year-based numbering helper (built for `PO-2026-0001`) reused for `SHIP-2026-0001`.

## Admin surfaces (`/admin/inventory/shipments`)

### `/admin/inventory/shipments` — board + list

A status board (columns = `booked` · `in_transit` · `arrived_port` · `customs` · `delivered`) of shipment cards, plus a filterable table view toggle.

```
┌─ IN TRANSIT (3) ─────────────┐  ┌─ AT PORT (1) ────────────────┐
│ SHIP-2026-0007  Ningbo→YVR   │  │ SHIP-2026-0005  Qingdao→YVR  │
│ 1×40HC · 880 tires           │  │ customs hold · 2 days        │
│ ETA Jun 24 (in 14 days)      │  │ broker: ABC Logistics        │
│ PO-2026-0012, -0013          │  │ ⚠ duty invoice pending       │
└──────────────────────────────┘  └──────────────────────────────┘
```

Each card: shipment #, route, container/qty, **ETA + countdown**, linked POs, and a cost-completeness flag (⚠ if ancillary invoices are still missing).

### `/admin/inventory/shipments/[id]` — detail

- **Timeline** (from `import_shipment_events`): every status hop, ETA revision, doc, and cost entry, newest first.
- **Lines** table: variant, qty, qty_received, FOB unit cost, landed unit cost, linked PO line.
- **Cost panel**: goods value (USD → CAD at the snapshotted FX), freight, duty, brokerage, insurance, other → **total landed cost** + **landed cost per tire**. Editable as invoices arrive; recomputes the per-line landed cost on save.
- **Actions**: advance status, revise ETA, upload doc, **Receive** (launches the receiving wizard), **Link PO line**, **Cost / re-allocate**, cancel.

### `/admin/inventory/shipments/new` — draft

Pick supplier + destination Location → add lines (variant + qty + FOB cost; "import from PO" to pull lines off an open PO) → save draft. Logistics fields (ports, container, B/L, ETA) fill in as they're known.

### Dashboard widget (inventory root + admin home)

On `/admin/inventory` and the admin dashboard: **"N containers in transit · next ETA in D days · M tires inbound"** — the at-a-glance signal ops actually wants.

## Workflows (narrative)

### Booking and tracking an import

1. Staff drafts `SHIP-2026-0007`, supplier `china:Shandong Linglong`, destination `Warehouse Containers`.
2. Pulls lines from open POs (`PO-2026-0012`, `-0013`) — variant + qty auto-fill; FOB unit cost carries from the PO line.
3. As the forwarder confirms: enter container #, B/L, vessel, origin/destination ports, ETD/ETA → status `booked` → `in_transit`. Each save logs an event.
4. Forwarder pushes the ETA back a week → "Revise ETA" → new ETA + a reason → timeline shows the slip.
5. Vessel berths → status `arrived_port`; broker clears customs → `customs` → `delivered`.

### Costing (true landed cost)

1. Goods invoice paid at 1.37 USD→CAD → set `fx_rate_to_cad`, `goods_value_cents`.
2. Freight invoice ($6,200), customs/duty bill ($4,800), broker fee ($350) arrive over the next two weeks → entered as they land; each writes a `cost_added` event.
3. "Re-allocate" with basis = **value** → engine spreads $11,350 ancillaries across lines proportional to goods value → writes `landed_unit_cost_cents` per line.
4. Now each tire shows retail − landed = gross margin.

### Receiving the container

1. Container arrives at the yard → "Receive" on the shipment.
2. Existing receiving wizard opens, pre-filled with the shipment's lines + destination Location; staff scans/confirms each SKU into a container bin (e.g. `CONTAINER-07`).
3. Commit writes `inventory_bin_assignments` + Shopify `inventoryLevels` + `inventory_movements` (`reference_type='import_shipment'`, `unit_cost_cents=landed_unit_cost`). `qty_received` on each shipment line updates; status → `received`.
4. Partial container (some SKUs short) → `qty_received < qty`, line flagged, shipment stays open until reconciled.

### Reconcile (Phase 7.6)

Match the shipment's total cost against the supplier + freight + broker bills in QuickBooks (the QuickBooks MCP is already connected) → status `closed`. Discrepancies flagged for AP.

## Phasing

**Prerequisite — Phase 6.6 PO module (1 day).** `purchase_orders` + `purchase_order_lines` + list/detail/new UI, per `docs/phase-6-inventory-management.md`. This phase links to PO lines, so it lands first. *(If the user prefers, shipments can ship ad-hoc-only first and POs follow — but linking is a core requested feature, so PO-first is recommended.)*

**Phase 7.1 — Data model + read-only portal (½ day)**
- Migration `db/036-import-shipments.sql`.
- Shipments board + list, detail (timeline + lines + cost panel), nav entry under Inventory.

**Phase 7.2 — Draft / edit + status lifecycle (½ day)**
- New/edit shipment, "import lines from PO," status transitions, ETA revisions, event logging, doc upload via Shopify Files.

**Phase 7.3 — Landed-cost allocation engine (½ day)**
- `src/lib/inventory/landed-cost.ts` — allocate ancillaries by value/qty/weight/CBM, write `landed_unit_cost_cents`. Cost panel UI + recompute-on-save.

**Phase 7.4 — Receive-into-inventory (½ day)**
- Wire the "Receive" action to the existing receiving wizard, pre-filled from lines; movements carry `reference_type='import_shipment'` + landed unit cost; update `qty_received` + status.

**Phase 7.5 — Dashboard widgets + optional carrier-tracking API (½–1 day)**
- "Containers in transit" widget. *Optional:* integrate a sea-freight tracking API keyed on `container_no`/`bill_of_lading` to auto-update ETA/status. Manual entry stays the fallback.

**Phase 7.6 — QuickBooks reconcile (later)**
- Match shipment cost totals to QuickBooks bills via the connected QuickBooks MCP; close shipments; gross-margin report (retail − landed).

**Total greenfield: ~2.5–3 days** for 7.1–7.4 (plus 1 day for the PO prerequisite). 7.5 (API) and 7.6 (QB) are additive.

## Open questions to confirm before build

| # | Question | Why it matters |
|---|---|---|
| 1 | **Incoterm** you buy on — FOB, CIF, or DDP? | Decides which ancillary costs *you* bear vs the supplier. DDP means duty/freight are baked into the supplier price (fewer cost fields to track); FOB means you track them all. |
| 2 | **Invoice currency** — USD assumed. Always? | If suppliers ever invoice CNY/CAD, the FX field needs to flex. Default `USD` is set; confirm. |
| 3 | **Customs broker** — do you use one, and do they give an ETA/tracking feed? | If the broker has a portal/API, Phase 7.5 can pull status automatically instead of manual entry. |
| 4 | **Allocation basis preference** — split freight/duty by goods value (default), or by weight/CBM? | Tires are bulky-but-light, so volume-based freight allocation can be fairer. Default is `value`; easy to change per shipment. |
| 5 | **Automated container tracking** — worth paying for a tracking API, or is manual ETA fine for now? | Drives whether 7.5 is in-scope v1 or deferred. Recommendation: manual first. |
| 6 | **PO-first or shipments-first?** | Linking shipments to POs is a requested feature, so the PO module should land first. Confirm you want both, in that order. |
| 7 | **Who books the freight** — you, or a freight forwarder? | If a forwarder, they likely already provide a tracking link — we can store/deep-link it rather than rebuild tracking. |

## Risks / non-goals

**Out of scope for Phase 7:**
- Customs/HS-code classification or duty *calculation* — we record the duty bill, we don't compute it.
- Multi-currency accounting beyond a single FX snapshot per shipment (no daily revaluation).
- Supplier-side PO issuance/EDI to the factory — POs here are internal records.
- Lot/DOT-code tracking per tire (still a later phase if warranty tracebacks are needed).

**Risks:**
- **Costs arrive after the goods.** The model must tolerate a shipment that's `received` but not yet fully costed — landed cost is provisional until the last invoice lands, then re-allocate. The UI flags "costs incomplete."
- **ETA drift is the norm**, not the exception. The event log + countdown must make slippage visible without implying the date is firm.
- **PO module is a hard dependency.** If the user wants shipments before POs, ship ad-hoc-line-only first and add PO linking when the PO module lands.
```
