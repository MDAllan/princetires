# Phase 1 — Customer Car Management — Design Decisions

**Date:** 2026-05-08
**Skill used:** `grill-me` (11 questions, all resolved)
**Status:** Design locked. Ready to implement.
**Phase:** 1 of 6 (per [princetires-app/PROJECT_PLAN.md](../princetires-app/PROJECT_PLAN.md))
**Estimated work:** ~1.5 weeks (per plan), now de-risked via grilling.

## Scope summary

Replace localStorage-only customer garage with a synced backend. 4 App Proxy routes, schema additions, theme migration, booking modal prefill rewrite. **No per-vehicle image upload** (deferred per Q9).

## Locked decisions

### Q1 — Tire size schema
**Single `tire_size text` column** on `vehicles`. Drop the 3 existing int columns (`tire_width`, `tire_aspect`, `tire_diameter`) — they were a premature decomposition; tire sizes ("225/45R17 91W RF") don't fit cleanly into ints. Theme already uses a single string, so migration is trivial.

### Q2 — Stub-customer handling
**Run customer backfill before Phase 1 ships** (~50-line one-time script paginating Shopify Admin API → existing `upsertCustomerFromShopify()`). Then on-demand fetch+upsert via Shopify Admin API for residual misses (new customers between backfill and webhook).

### Q3 — Vehicle ID source
**Hybrid.** POST accepts optional `id` (UUID v4 validated). Server falls back to `gen_random_uuid()` if omitted. Existing my-garage.js generates UUID v4 client-side; preserving those IDs through migration makes it idempotent.

### Q4 — localStorage migration strategy
**Always migrate idempotently.** First authenticated load: POST each local vehicle (with its UUID) to API. Server uses `INSERT ... ON CONFLICT (id) DO NOTHING`. Then refresh from API and replace local cache. Flag `pt-garage-{id}:migrated = '1'` to skip on subsequent loads. On failure: keep local intact, retry next page load. No silent data loss.

### Q5 — Ownership verification
**Atomic SQL `WHERE id = $1 AND customer_id = $2`** for both PATCH and DELETE. If 0 rows → 404 (not 403 — don't leak UUID existence). Encode once in `src/lib/vehicles/ownership.ts` with `updateVehicleIfOwned` and `deleteVehicleIfOwned` helpers.

### Q6 — `is_default` enforcement
**Single-statement set + partial unique index.**

```sql
-- migration
alter table vehicles add column is_default boolean not null default false;
create unique index vehicles_one_default_per_customer
  on vehicles (customer_id) where is_default = true;

-- set-default operation
update vehicles
set is_default = (id = $target_id), updated_at = now()
where customer_id = $customer_id
returning *;
```

Dedicated route `PATCH /api/proxy/vehicles/[id]/default` (no body, or `{ isDefault: false }` to clear without setting another). Keeps regular PATCH route's contract simple. POST autopromotes first vehicle to default.

### Q7 — Vehicle deletion
**Hard delete + server-side auto-promote.** Single transaction: delete the row, and if it was the default, promote the oldest remaining vehicle. Booking history preserved by existing `bookings.vehicle_id ON DELETE SET NULL` + snapshot columns. DELETE returns the refreshed vehicle list so client can replace cache atomically.

### Q8 — maintenance/reminders validation
**Zod with `.strict()` outer object + `.passthrough()` on nested objects.** Concrete schema:

```ts
const maintenanceEntry = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(64),  // not enum-locked — forward compat
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mileage: z.number().int().min(0).max(2_000_000),
}).passthrough();

const maintenance = z.array(maintenanceEntry).max(50);  // server cap > client cap

const reminders = z.object({}).catchall(
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
).refine(o => Object.keys(o).length <= 20);

export const vehicleInput = z.object({
  id: z.string().uuid().optional(),
  nickname: z.string().max(40).optional(),
  year: z.number().int().min(1900).max(2100),
  make: z.string().min(1).max(40),
  model: z.string().min(1).max(40),
  trim: z.string().max(40).optional(),
  tireSize: z.string().max(40).optional(),
  isDefault: z.boolean().optional(),
  maintenance: maintenance.optional().default([]),
  reminders: reminders.optional().default({}),
}).strict();   // typo-catching at top level
```

### Q9 — `custom_image` column
**Skipped.** The plan invented this from a misread of theme code. The theme has a merchant-set section setting (one image used as fallback for ALL vehicles), not per-vehicle photos. No UX exists for "upload a photo of my Civic." Defer until there's a real customer ask. Strike from PROJECT_PLAN.md schema list.

### Q10 — Rate limiting
**Per-customer-id only** (App Proxy hides real client IPs). Reuse existing Upstash limiter pattern in `src/lib/rate-limit.ts`. New limiter ids:

| Limiter | Limit | Routes |
|---|---|---|
| `vehicles_read` | 60 req / min | GET /vehicles |
| `vehicles_write` | 20 req / min | POST, PATCH, DELETE /vehicles |
| `vehicles_default` | 20 req / min | PATCH /vehicles/[id]/default |

429 with `Retry-After` header. Theme code: catch 429, show toast, exponential backoff retry.

### Q11 — Booking modal prefill timing
**Cache-then-refresh.** Render modal instantly from localStorage cache. Fire `/apps/api/vehicles` API call in parallel. Silent swap when API returns. Existing forceVehicle (clicked-from-vehicle-card) and `pt-booking-vehicle` (last-used) overrides layer on top. Edge cases: first-ever load shows empty state until API responds; API failure keeps cached state visible + Sentry log.

## Status code map (all 4 routes)

| Situation | Code | Body |
|---|---|---|
| Unsigned App Proxy | 401 | `{"error":"missing shop"}` |
| Authenticated but customerId null | 401 | `{"error":"not logged in"}` |
| Vehicle exists & owned | 200 | `{"vehicle": {...}}` or `{"vehicles": [...]}` |
| Vehicle missing or wrong owner | 404 | `{"error":"not found"}` |
| Validation failure | 400 | `{"error":"validation","issues":[...]}` |
| Rate limited | 429 + `Retry-After` header | |

## Schema migration (`db/010-vehicles-extras.sql`)

```sql
-- Phase 1 schema additions
alter table vehicles add column tire_size text;
alter table vehicles add column is_default boolean not null default false;
alter table vehicles add column maintenance jsonb not null default '[]';
alter table vehicles add column reminders jsonb not null default '{}';

-- enforce at-most-one-default-per-customer (Q6)
create unique index vehicles_one_default_per_customer
  on vehicles (customer_id) where is_default = true;

-- cleanup of premature decomposition (Q1) — safe because table is empty
alter table vehicles drop column tire_width;
alter table vehicles drop column tire_aspect;
alter table vehicles drop column tire_diameter;
```

## Implementation steps (in order)

### 1. Customer backfill (Q2, prereq)
- New file: `db/backfill-customers.mjs`
- Paginate Shopify Admin API: `customers(first: 250, after: $cursor)`
- For each: call `upsertCustomerFromShopify()` from existing `src/lib/customers/upsert.ts`
- Idempotent (re-runnable) by virtue of upsert
- Run once: `node --env-file=.env.local db/backfill-customers.mjs`
- Verify: `select count(*) from customers` = 468

### 2. Schema migration
- New file: `db/010-vehicles-extras.sql` (above)
- Apply: existing pattern in `db/apply-schema.mjs` or directly to Neon

### 3. App Proxy routes + supporting libs
**Libs first:**
- `src/lib/vehicles/validation.ts` — Zod schemas (Q8)
- `src/lib/vehicles/ownership.ts` — `updateVehicleIfOwned`, `deleteVehicleIfOwned` (Q5)
- `src/lib/customers/ensure.ts` — `ensureCustomerFromAppProxy(customerId)`: SELECT then on-miss fetch from Shopify Admin API + upsert (Q2 fallback path)

**Routes:**
- `src/app/api/proxy/vehicles/route.ts` — GET (list), POST (create) (Q3 + Q6 first-becomes-default)
- `src/app/api/proxy/vehicles/[id]/route.ts` — PATCH (update), DELETE (with auto-promote) (Q5 + Q7)
- `src/app/api/proxy/vehicles/[id]/default/route.ts` — PATCH (set default) (Q6)

**Common pattern in each route:**
```ts
const ctx = await verifyAppProxy(request);    // throws AppProxyError on bad signature
if (!ctx.customerId) return new Response(JSON.stringify({error:"not logged in"}), {status:401});

const rl = await checkRateLimit("vehicles_write", String(ctx.customerId));
if (!rl.allowed) return new NextResponse(JSON.stringify({error:"rate limited"}), {status:429, headers:rateLimitHeaders(rl)});

const customer = await ensureCustomerFromAppProxy(ctx.customerId);  // uuid

// ... actual work
```

### 4. Rate limiter additions
- Edit `src/lib/rate-limit.ts` LimiterId union to add `vehicles_read`, `vehicles_write`, `vehicles_default` (Q10)
- Add cases in `makeLimiter` switch

### 5. Theme migration (parallel workstream after API is live)
- `princetires/assets/my-garage.js` — replace localStorage-only logic with cache-then-refresh fetch (Q4 + Q11)
- `princetires/snippets/pt-booking-modal.liquid` — extend prefill chain (Q11)
- `princetires/sections/my-garage.liquid` — possibly remove `booking_api_url` setting (no longer needed; routes are App Proxy now)

## Smoke tests after deploy

1. **Add a vehicle on desktop** (logged in, on storefront My Garage) → log in on phone → vehicle appears.
2. **Delete the localStorage entry** in browser devtools → reload My Garage → vehicles still show (API-backed).
3. **Open booking modal from product page** → garage default vehicle prefills the form.
4. **Set a vehicle as default on Device A** → open booking modal on Device B → default reflects (within cache TTL).
5. **DELETE the default vehicle** → next vehicle becomes default automatically.
6. **Two devices race to set different defaults** → final state has exactly one default (last-write-wins).

## Out of scope for Phase 1 (intentional)

- Per-vehicle photo upload (Q9 — defer until customer asks)
- Cross-tab cache invalidation (eventually consistent via Q11)
- Pagination (vehicles are 1-3 per customer; cap at 10 per existing config)
- Soft delete + restore UX (Q7 — can revisit if customer support ever asks)
