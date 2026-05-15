# Phase 2 — Customer Bookings Surface

**Date:** 2026-05-15
**Status:** Built — needs migration 014 applied + app deploy
**Depends on:** Phase 0 (App Proxy), Phase 1 (customer auth pattern)
**Phase:** 2 of 6 (per [princetires-app/PROJECT_PLAN.md](../princetires-app/PROJECT_PLAN.md))

## Goal

A logged-in storefront customer can see a list of **their own bookings** on the
garage page ("My Bookings"), and cancel an upcoming one via the existing
token-based cancel page.

## Current state (verified by survey, 2026-05-15)

- Bookings are created by `POST /api/book` — a public, CORS endpoint. It stores
  `customer_email` as text. `bookings.customer_id` (FK → `customers`) exists in
  the schema but is **never populated**.
- The only customer-facing booking access today is `/cancel/[token]` — a
  per-booking `lookup_token` delivered in the confirmation email.
- The theme garage page **already has a Bookings tab + panel + `gbk-*` CSS + a
  `loadBookings()` method**. But `loadBookings()` fetched a phantom
  `GET /api/book?email=&token=` endpoint that was never built (`/api/book` only
  handles `POST`). So the UI existed and silently failed — **not** a missing UI,
  a mis-wired one.
- There was **no `api/proxy/bookings` route** on the backend.

## Decisions

- **Customer linkage — fix it properly.** Populate `bookings.customer_id` rather
  than matching on email forever. A one-time backfill migration links existing
  rows; `/api/book` is patched to set `customer_id` on every new booking. The
  surface query still also matches by email, to catch bookings a customer made
  *before* they had an account.
- **Read-only surface.** The proxy route is `GET`-only. Cancellation reuses the
  existing `/cancel/[token]` page — the bookings list renders a cancel link from
  each booking's `lookup_token`. No new mutation endpoint in Phase 2.
- **UI home — the existing garage Bookings panel.** `sections/my-garage.liquid`
  already has the panel + `gbk-*` CSS, and `my-garage.js` already has
  `loadBookings()`. No new snippet — `loadBookings()` is rewired from the phantom
  `/api/book?email=` call to the new App Proxy route, and its render is remapped
  to the API shape.
- **Auth — reuse Phase 1.** Same `requireAuthedCustomer()` resolver (App Proxy
  HMAC or customer-account session-token).

## Backend

1. **`db/014-booking-customer-link.sql`** — backfill `customer_id` from
   `customers` by lowercased-email match. Idempotent (`where customer_id is null`).
2. **`/api/book/route.ts` patch** — on insert, look up `customers` by lowercased
   email; populate `customer_id` when found. Best-effort: guests (no account)
   stay `null`, and the booking never fails because of this lookup.
3. **`bookings_read` rate limiter** — `src/lib/rate-limit.ts`, 60 req/min per
   customer (mirrors `vehicles_read`).
4. **`src/lib/booking/serialize.ts`** — `BookingRow` type + `toApiBooking()`
   row→API mapper (snake_case row → camelCase contract).
5. **`src/app/api/proxy/bookings/route.ts`** — `GET` lists the authed customer's
   bookings; `OPTIONS` preflight. Query:
   `where customer_id = $uuid or lower(customer_email) = lower(<account email>)`.

## API contract

`GET /apps/api/bookings` (App Proxy) → `200 { "bookings": ApiBooking[] }`

```
ApiBooking = {
  id, status,                       // status ∈ pending|confirmed|in_progress|completed|cancelled|no_show
  bookType,                         // 'tire_install' | 'service'
  serviceLabel,                     // human label (service name, or tire-install summary)
  vehicleSummary,                   // "2019 Honda Civic"
  scheduledDate, scheduledTime,     // "2026-05-20", "10:30 AM"
  durationMinutes,
  totalCents,                       // nullable
  lookupToken,                      // for the /cancel/<token> link
  createdAt
}
```

Sorted newest `scheduled_date` first. Status codes mirror the vehicles routes:
`401 not logged in`, `429 rate limited`.

## Theme

6. **`assets/my-garage.js` — `loadBookings()` rewired.** Now calls
   `GET /apps/api/bookings` via the existing `api()` App Proxy helper (no email
   or lookup token sent from the client — Shopify's HMAC signature authenticates
   the customer). The render is remapped to the `ApiBooking` shape; two helpers
   were added (`formatBookingDate`, `bookingStatusUi`). The old phantom
   `/api/book?email=` fetch and the now-irrelevant "not configured" branch are
   removed. `booking_api_url` is still read — for the `/cancel/<token>` link host.
7. **`sections/my-garage.liquid`** — panel header text updated
   ("Upcoming appointments" → "Your bookings"). The panel + CSS were already there.

## Out of scope (Phase 2)

- Booking cancellation / reschedule via API — reuses the token page.
- Booking caps (per-day max) + "next available" hint — separate, smaller follow-up.
- Admin-side changes — the `/admin/bookings` pages already exist.

## Smoke tests

1. Logged-in customer whose account email matches a past booking → it appears.
2. New booking via the modal while logged in → `customer_id` populated → shows in list.
3. Logged out → garage shows its logged-out state; no bookings request fires.
4. Cancel link → `/cancel/<token>` → cancels → re-loading the list shows
   `cancelled` status.
