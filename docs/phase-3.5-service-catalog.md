# Phase 3.5 — Service Catalog

**Date:** 2026-05-15
**Status:** Complete — Stage 1 + Stage 2 live (2026-05-17)
**Phase:** 3.5 of 6

## Goal

Make the shop's service catalog — names, descriptions, the full per-vehicle-type
price matrix, add-ons, durations, active/inactive — editable from the admin app,
instead of being hardcoded. One source of truth.

## Current state (verified 2026-05-15)

The catalog is **hardcoded JavaScript** in the theme:

- `snippets/pt-service-booking-modal.liquid` — `sbServices` (6 services),
  `sbInstallPrices` / `sbOnRimsPrices` (per-vehicle matrices), `sbAddonsList`,
  and `sbCalcPrice()`.
- The pricing comment says it is **"Mirrored in `sections/pt-booking-page.liquid`
  + `snippets/pt-booking-modal.liquid` — keep in sync."** → the same numbers are
  copy-pasted across 3 files. Changing a price means editing 3 files.
- There is **no `services` table** and **no per-service duration** — booking
  length is currently derived only from vehicle size (`booking/duration.ts`,
  30 or 60 min).

### The 6 services + 2 add-ons (current values)

| slug | name | pricing_mode | values |
|---|---|---|---|
| `installation_off` | Tire Installation | `per_unit_by_vehicle` (tire) | passenger 25, suv/van/electric 30, truck 35, largetruck 40, dually 45, trailer **flat 120**; low-profile floor 40 |
| `installation_on` | Seasonal Swap | `flat_by_vehicle` | passenger/suv/van/electric 60, truck/largetruck 80, dually 90, trailer 120 |
| `balancing` | Wheel Balancing | `per_unit_flat` (wheel) | 20 |
| `rotation` | Tire Rotation | `flat_by_vehicle` | 60, dually/largetruck 100 |
| `flat_repair` | Flat Repair | `per_unit_flat` (tire) | 50 |
| `tpms` | TPMS Service | `per_unit_flat` (sensor) | 75 |
| `addon_tpms` | TPMS sensors | `per_unit_flat` (sensor) | 75 |
| `addon_disposal` | Tire disposal | `per_unit_flat` (tire) | 5 |

## Data model — `services` table (migration 015)

One table, both services and add-ons (`kind` column). Pricing lives in a `prices`
JSONB whose shape depends on `pricing_mode`:

| `pricing_mode` | `prices` shape |
|---|---|
| `per_unit_by_vehicle` | `{ "byVehicle": {8 types}, "lowProfileFloor": 40, "flatOverride": {"trailer": 120} }` |
| `flat_by_vehicle` | `{ "byVehicle": {8 types} }` |
| `per_unit_flat` | `{ "amount": N }` |

The 8 vehicle types: `passenger, suv, truck, van, electric, dually, largetruck, trailer`.

`slug` is the stable key the theme + bookings reference — never changes.
The migration seeds the 8 rows with `on conflict (slug) do nothing`, so re-running
it never clobbers admin edits.

## Stage 1 — DB + API + Admin (no storefront risk)

1. **`db/015-services.sql`** — `services` table + seed.
2. **`src/lib/services/catalog.ts`** — row/API types, `toApiService()` serializer.
3. **`GET /api/services`** — public, CORS, returns the active catalog as JSON
   (the shape the theme will consume in Stage 2). Mirrors `/api/availability`.
4. **`/admin/services`** — page + `actions.ts` (`updateService` server action)
   + `service-editor.tsx` client component. Edit name, description, duration,
   active, and every price. Writes to `audit_log` like other admin mutations.
5. **Nav** — add "Services" to the admin shell.

After Stage 1: the merchant can edit the catalog and the API serves it — but the
**storefront still uses its hardcoded values** (Stage 2 connects them).

## Stage 2 — theme rewire ✅ done (2026-05-17)

All three booking surfaces now fetch `GET /api/services` and drive their service
list + price calc from the catalog — admin edits reach customers:

- `snippets/pt-service-booking-modal.liquid` — service modal (`sbApplyCatalog`)
- `snippets/pt-booking-modal.liquid` — tire-install modal (`bkApplyCatalog`)
- `sections/pt-booking-page.liquid` — `/pages/booking` page (`bpApplyCatalog`)

**Catalog-with-fallback:** each file keeps its hardcoded values as a fallback —
if `/api/services` fails, booking still works on the old prices. The price calc
was rewritten generic (per-vehicle / flat / per-unit) and verified live via
Playwright to produce identical numbers. The 3-file price duplication is gone;
the DB is the single source of truth.

## Per-service duration

✅ Wired (2026-05-17). `/api/book` sets a booking's length to
`max(service catalog duration, vehicle-size minimum)` — editing a service's
duration in `/admin/services` changes how much calendar time it blocks.
`/api/availability` already expands each booking to the 30-min slots it covers,
and the Google Calendar event length follows the same `duration_minutes`. See
`effectiveDuration()` in `booking/duration.ts`.

## Add / delete ✅ done (2026-05-17)

`/admin/services` can now **create and delete** services + add-ons, not just
edit the seeded set — `createService` / `deleteService` server actions + a
collapsible "Add" form. New services flow to the storefront automatically: the
service modal and the booking page both rebuild their service list from
`GET /api/services`.

## Out of scope (Phase 3.5)

- Server-authoritative pricing — `/api/book` still trusts client-sent totals;
  making the server recompute price from the catalog is a later hardening pass.
- Wiring per-service `duration_minutes` into the booking calendar.
