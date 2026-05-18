# Phase 4 — Wholesale Portal Data

**Date:** 2026-05-17
**Status:** Stage 1 (backend) built — needs migration 017 applied + app deploy. Stage 2 (theme) pending.
**Depends on:** Phase 0 (App Proxy), Phase 1 (customer auth pattern), Phase 3 (`customers` CRM table)
**Phase:** 4 of 6 (per [princetires-app/PROJECT_PLAN.md](../princetires-app/PROJECT_PLAN.md))

## Goal

The customer-facing wholesale portal at `/pages/wholesale-portal` stays in the
theme. What changes is its **data source**: stop regex-parsing `customer.note`
for the B2B business profile, stop inferring application status from
`customer.tags` — pull real data from the app via the App Proxy. Add a
self-service "edit my business info" path that writes back to the app.

## Current state (verified by survey, 2026-05-17)

- The portal (`sections/wholesale-landing.liquid`) reads the business profile
  from a `data-wh-note` attribute and a client-side regex over `customer.note`
  (`WHOLESALE:business=…|type=…|gst=…`) — see lines ~2421-2440. Fragile, and
  the note is only ever populated by the *guest* register flow.
- `sections/wholesale-register.liquid:777-789` infers "already applied / already
  wholesale" from `customer.tags` + `customer.note contains 'WHOLESALE:'`.
- Order/savings stats in the portal are computed **client-side from Liquid
  `customer.orders`** — that is real, live Shopify order data, not the note.
- The app has `wholesale_applications` (intake records), a staff approval flow
  that assigns a `pricing_tier` + writes Shopify tags, and `customers` (the
  Phase 3 CRM mirror with `is_b2b` / `b2b_pricing_tier` / `b2b_company_name`).
- There was **no `api/proxy/wholesale/*` route**.

## Two bugs this phase surfaced

1. **Two conflicting tier systems.** The app assigns staff-decided tiers
   `tier_1 / tier_2 / tier_3 / tier_pro` (5 / 10 / 15 / 20 %), tagged in Shopify
   as `wholesale-tier-N`. The theme portal instead renders a *fabricated*
   `Bronze → Silver → Gold → Platinum → Elite` ladder (5/10/15/20/25 %) derived
   from `customer.orders_count` with a "progress to next tier" bar. Those
   percentages are **not** what the customer is actually charged — pricing is
   the staff-assigned tier. Phase 4 makes the portal show the **real assigned
   tier**; the fake order-count ladder + progress bar are retired.
2. **`b2b_pricing_tier` never populated.** `customers/upsert.ts`'s
   `TIER_TAG_RE` matches `tier_N`, but the real Shopify tags are
   `wholesale-tier-N` — so the regex never fired and `customers.b2b_pricing_tier`
   was always `null`. Fixed here.

## Decisions

- **Stats stay in Liquid (no orders mirror).** B2B-portal best practice is one
  authoritative order source with no drift; Shopify *is* that source and
  `customer.orders` reads it live. Mirroring orders into Neon is Phase 5 scope
  (`orders-create` is still a stub). Phase 4 does only its stated job — kill the
  `customer.note` regex — and leaves the already-correct order numbers alone.
- **Business profile lives on `customers`, not `wholesale_applications`.** The
  application is an immutable *intake record*; editing it to double as a live
  profile would corrupt history. Migration 017 adds the missing B2B columns to
  `customers` and backfills them from each customer's most-recent application.
  The Phase 3 staff CRM (`/admin/customers/[id]`) already reads `customers`, so
  staff and the portal see the same row.
- **Real assigned tier, honestly.** `/wholesale/me` returns the staff-assigned
  `tier_*`. A customer with no assigned tier (manually tagged, no application)
  gets `tier: null` — the portal shows "Wholesale partner" with no fabricated %.
- **`nextTier` dropped from the contract.** Tiers are staff-assigned, not
  volume-earned — there is no threshold/gap to compute. The plan's
  `nextTier: { slug, threshold, gap }` assumed an auto-progression ladder that
  does not exist.
- **Auth — reuse Phase 1/2.** Same `requireAuthedCustomer()` resolver (App Proxy
  HMAC or customer-account session-token).
- **`/wholesale/me` works for any authed customer**, wholesale or not — the
  register page calls it to show a pending applicant their real status.

## Backend (Stage 1 — built)

1. **`db/017-wholesale-b2b-profile.sql`** — adds `customers.b2b_business_type`,
   `b2b_tax_number`, `b2b_business_address`, `b2b_monthly_volume`,
   `b2b_profile_updated_at`. Backfills those + `b2b_company_name` + `phone` +
   `b2b_pricing_tier` from each customer's most-recent wholesale application
   (approved wins over pending; newest within a status). Idempotent — `coalesce`
   never overwrites an existing value.
2. **`src/lib/customers/upsert.ts`** — `TIER_TAG_RE` fixed to match
   `wholesale-tier-N` → `tier_N`. New approvals now populate
   `customers.b2b_pricing_tier` correctly via the `customers/update` webhook.
3. **`src/lib/wholesale/tiers.ts`** — new `tierDiscount(id)` accessor.
4. **`src/lib/wholesale/profile.ts`** — `WholesaleProfileRow` type, the
   `loadWholesaleProfile()` query (merges `customers` + latest application),
   `toApiWholesale()` serializer, and the `wholesaleProfileInput` Zod schema.
5. **`src/lib/shopify/customer.ts`** — `updateShopifyCustomer()` — `customerUpdate`
   GraphQL wrapper for firstName / lastName / phone. Best-effort: returns
   `{ ok, error }`, never throws.
6. **`wholesale_read` / `wholesale_write` rate limiters** in `src/lib/rate-limit.ts`
   (60/min and 10/min per customer).
7. **`src/app/api/proxy/wholesale/me/route.ts`** — `GET` + `OPTIONS`.
8. **`src/app/api/proxy/wholesale/profile/route.ts`** — `POST` + `OPTIONS`.
   Writes `customers`, best-effort-syncs name/phone to Shopify, writes `audit_log`.

## API contract

`GET /apps/api/wholesale/me` (App Proxy) → `200 { wholesale: ApiWholesale }`

```
ApiWholesale = {
  isWholesale,                      // customers.is_b2b
  status,                           // 'approved' | 'pending' | 'rejected' | 'none'
  tier,                             // 'tier_1'|'tier_2'|'tier_3'|'tier_pro'|null
  tierLabel,                        // "Tier 2 — 10% off" | null
  discountPct,                      // 10 | null
  businessName, contactName, phone,
  businessType, taxNumber, businessAddress, monthlyVolume,
  application: { status, submittedAt, reviewedAt } | null
}
```

`POST /apps/api/wholesale/profile` (App Proxy) → `200 { wholesale: ApiWholesale, shopifySynced: boolean }`

Body (all optional, all trimmed; empty string → cleared):
`businessName, contactName, phone, businessType, taxNumber, businessAddress, monthlyVolume`

Status codes mirror the other proxy routes: `401` not logged in, `400`
validation, `429` rate limited.

## Theme (Stage 2 — built)

- `sections/wholesale-landing.liquid` — the portal JS now loads
  `GET /apps/api/wholesale/me` instead of regex-parsing `data-wh-note`. It
  populates the hero, the business-detail list, and the tier badge / discount
  from the response. The fabricated order-count tier ladder + progress bar are
  retired; the discount-tiers table is the 4 real tiers with the customer's row
  marked `is-current`. The "Update business info" form was rewired from a
  Shopify `contact` form (which only emailed staff) to a real
  `POST /apps/api/wholesale/profile` call that updates the displayed values
  in place. Order history + stats stay on Liquid `customer.orders`; the
  "Est. savings" stat is computed with the real discount once the API resolves.
- `sections/wholesale-register.liquid` — the unreliable
  `customer.note contains 'WHOLESALE:'` pending check is replaced by a hidden
  notice revealed via `/apps/api/wholesale/me` (`status === 'pending'`). The
  reliable `customer.tags contains 'wholesale'` approved check is unchanged.

### my-garage banner — dropped (obsolete)

The plan's "add a wholesale banner to `sections/my-garage.liquid`" is moot:
`my-garage.liquid:44` already **redirects** wholesale-tagged customers off the
garage to `/pages/wholesale-portal` (added 2026-05-15, after the plan was
written). A banner there would never render. Portal discoverability is already
covered by that redirect plus the header's conditional "My portal" link.

## Out of scope (Phase 4)

- Shopify orders mirror + order-derived stats — Phase 5.
- Quote requests / AR snapshot in the portal — Phase 5.
- Staff B2B cockpit (`/admin/b2b/*`) — Phase 5.

## Smoke tests

1. Logged-in wholesale customer opens `/pages/wholesale-portal` → business
   profile + real tier render from the API, not the note regex.
2. Edit business name in the portal → reload → persists; `/admin/customers/[id]`
   shows the new name; `audit_log` has a `wholesale.profile_self_updated` row.
3. Pending applicant visits `/pages/wholesale-register` → sees real "under
   review" status from the API.
4. Customer with no assigned tier → portal shows "Wholesale partner", no `%`.
5. Logged-out / non-wholesale → `/wholesale/me` still `200`s with
   `isWholesale: false`; portal page redirects as before.
