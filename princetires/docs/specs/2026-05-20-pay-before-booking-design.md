# Pay Before Booking — Design Spec

**Date:** 2026-05-20
**Status:** Approved spec — implementation deferred until traffic justifies it.
**Author:** Brainstormed with Claude (Opus 4.7).

## Why

Today every booking is saved as `pending` and the customer pays at the shop. The shop absorbs three risks:

1. **No-shows.** No commitment beyond the customer's word. Lost slot, lost tech time.
2. **Tier B exposure.** When the customer's tires must be special-ordered from Trail Tire (Tier B), Prince commits to the supplier *before* the customer is paid. A no-show leaves Prince stuck with the order.
3. **Cash flow + price disputes.** Revenue is captured only when the customer arrives. Tire prices can change between booking and install; the conversation at the counter is uncomfortable.

Pay-before-booking solves all three — but only for the customers who choose it.

## Goals

- Let customers **optionally** pay upfront when booking.
- Commit Tier B customers financially before the supplier order goes out.
- Pre-collect deposit revenue for Tier A bookings to deter no-shows.
- Keep the existing "book free, pay at shop" path intact — additive, not replacement.
- Reuse Shopify Payments + Shopify checkout. No new payment processor.

## Non-goals

- Not removing the "pay at shop" path. Customers who prefer the old way keep it.
- Not changing the standalone tire-purchase flow on product pages.
- Not adding Stripe, in-modal card capture, or any new PCI surface.
- Not building loyalty / store credit / gift card mechanics — Shopify gift cards already work through checkout if needed later.

## High-level model

The final step of the booking modal offers two buttons:

| Button | Path | Booking status after click |
|---|---|---|
| **Book — pay at the shop** | Today's flow, unchanged | `pending` (owner manually confirms) |
| **Pay now & confirm** | New flow (this spec) | `pending_payment` → `confirmed` on Shopify order |

The "Book — pay at shop" path is untouched; everything below describes the new "Pay now" path only.

## Pricing model — what the customer pays

Tier-differentiated to match the asymmetric risk:

- **Tier B** (supplier-ordered tires): **full payment** — tires + per-tire install fee + add-ons (TPMS, disposal) + 5% GST. The customer fully commits before Prince commits to the supplier.
- **Tier A** (in-stock at Prince Tires): **deposit** — proposed default `$50/tire` (e.g., 4 tires = $200). Configurable via a theme setting (`section.settings.booking_deposit_per_tire`) so the value can be tuned without a code deploy. The balance is paid at the shop.

Both tiers redirect to Shopify checkout — same payment UX. The line items differ.

## Architecture

```
┌────────────────────┐    POST /api/book                                    ┌──────────────┐
│ pt-booking-modal   │  ─────────────────────────────────────────────────►  │ princetires- │
│  (theme, customer) │    { ...bookingFields, intent: "pay_now" }           │     app      │
└────────────────────┘  ◄─────────────────────────────────────────────────  └──────┬───────┘
        │                  { bookingId, shopifyCheckoutUrl }                       │
        │                                                                          │ Neon
        │  302 redirect                                                            │ insert booking row
        ▼                                                                          │ status = "pending_payment"
┌────────────────────┐                                                             │ shopify_order_id = null
│ Shopify checkout   │                                                             ▼
│  (hosted)          │                                                      ┌──────────────┐
└─────────┬──────────┘                                                      │   bookings   │
          │ pays                                                            │  (Neon DB)   │
          ▼                                                                 └──────────────┘
┌────────────────────┐    POST orders/create webhook
│  Shopify orders/   │  ─────────────────────────────────────────────────►  princetires-app
│  create webhook    │    cart attributes include booking_id                /api/webhooks/shopify/orders-create
└────────────────────┘                                                      │
                                                                            ▼
                                                              UPDATE bookings SET
                                                                status = "confirmed",
                                                                shopify_order_id = ...
                                                              + send confirmation email
                                                              + insert Google Calendar event
```

## Detailed design

### 1. Booking modal (theme)

**File:** `snippets/pt-booking-modal.liquid`.

Step-3 ("Details") gets two action buttons instead of one:

```liquid
<button id="bk-submit-pay-at-shop" class="bk-secondary-btn">
  Book — pay at the shop
</button>
<button id="bk-submit-pay-now" class="bk-primary-btn">
  Pay now & confirm  →
</button>
```

`bk-submit-pay-at-shop` calls the existing submit handler (today's flow). `bk-submit-pay-now` calls a new `submitAndCheckout()` handler that:

1. Validates the form (reuses existing validation).
2. POSTs to `/api/book` with `{ ...todaysPayload, intent: "pay_now" }`.
3. On 201 response, reads `data.shopifyCheckoutUrl` and `window.location.href = data.shopifyCheckoutUrl`.
4. On error, surfaces it inline (no redirect).

Visual hierarchy: "Pay now" is the primary CTA (filled, brand red). "Pay at shop" is secondary (outlined). This nudges new customers toward pay-now without taking the option away.

Mirror the same buttons in `snippets/pt-service-booking-modal.liquid` and `sections/pt-booking-page.liquid` if/when pay-now is extended to those surfaces — out of scope for v1 (product modal only).

### 2. `POST /api/book` — add the `intent` branch

**File:** `princetires-app/src/app/api/book/route.ts`.

The existing schema gets one new optional field:

```ts
intent: z.enum(["pay_at_shop", "pay_now"]).optional().nullable(),
```

When `intent === "pay_now"`:

1. Insert the booking row with `status = 'pending_payment'` instead of `'pending'`. Same fields as today otherwise.
2. **Don't** send the customer "booking received" email (premature — they haven't paid yet).
3. **Don't** insert a Google Calendar event yet (premature — slot isn't paid).
4. Compute the Shopify checkout permalink (see §3) — return it in the response.

```ts
return NextResponse.json({
  id: bookingId,
  lookupToken,
  status: "pending_payment",
  shopifyCheckoutUrl,           // ← new
}, { status: 201, headers });
```

Rate limits stay the same. Server-side validation (`validateBookingRules`) runs identically — payment doesn't unlock past-date bookings or lead-time violations.

### 3. Shopify checkout permalink builder

**New file:** `princetires-app/src/lib/booking/checkout-link.ts`.

```ts
buildCheckoutLink({
  storeDomain,                       // "prince-tires-5560.myshopify.com"
  tireVariantId,                     // from booking.productHandle → product API
  tireQty,                           // booking.qty
  installServiceVariantId,           // from per-vehicle service map (§3a)
  installServiceQty,                 // booking.qty
  tpms: boolean,                     // adds tpms variant if true
  disposal: boolean,                 // adds disposal variant if true
  isTierA_deposit: boolean,          // if true, swap full install line for deposit product
  attributes: {                      // cart attributes carry booking metadata
    booking_id, booking_date, booking_time, supplier_tier,
    vehicle_type, customer_name, customer_phone, customer_email,
    lookup_token,
  }
}) → URL
```

Permalink format (Shopify cart syntax):

```
https://prince-tires-5560.myshopify.com/cart/<v1>:<q1>,<v2>:<q2>?attributes[booking_id]=<uuid>&attributes[booking_date]=2026-05-22&attributes[booking_time]=10:30%20AM&...&return_to=/account/orders
```

Cart attributes flow through to the order's `note_attributes`, which we read in the webhook.

#### 3a. Install-service variant map

The Shopify catalog already has unlisted Service products (`Off Rim Installation`, `Truck Installation`, `Heavy Truck Installation`, `Balancing`, `Mounting and Balancing - Sedan & SUVs`, `administrative fee`, `On Rim Swap`). Each is a single-variant product.

**Open question for implementation time:** these products have legacy pricing that may not match the per-tire `custom.install_price` metafield model introduced 2026-05-19. Options:

- **A.** Use each product as-is at its current Shopify price. Simplest; means the install fee on Shopify checkout may differ from what the modal shows. **Don't ship like this** — price mismatch confuses customers.
- **B.** Reconcile each service product's price with the modal's metafield-driven price by adding a per-product price override at cart-build time (`line_items[].properties[]` or a draft order). Complex.
- **C. (Recommended)** Create a single new Shopify product **"Tire Installation"** with a `Custom price` variant scheme, set price at cart-build time to match the modal's metafield total. Cleanest; one variant id to remember.
- **D.** Reuse the existing products and update their per-variant prices to match the metafield bands (passenger / SUV / truck etc.). Decision deferred.

The deposit product (Tier A path) is its own new product: **"Booking deposit"**, variant price = `deposit_per_tire × qty`. Same shape question — pick at implementation time.

### 4. `orders/create` webhook

**File:** `princetires-app/src/app/api/webhooks/shopify/orders-create/route.ts` (today: HMAC stub).

Add the business logic:

```ts
// 1. Verify HMAC (already done in the stub).
// 2. Parse the order JSON.
// 3. Read note_attributes for booking_id + lookup_token.
// 4. If no booking_id → it's a regular tire purchase, ignore (return 200).
// 5. Atomically:
//    - Find booking by id; verify lookup_token matches (prevents forged webhooks).
//    - Verify status == "pending_payment".
//    - UPDATE bookings SET status='confirmed', shopify_order_id=<order.id>, updated_at=now() WHERE id=... AND status='pending_payment';
//      (the WHERE clause prevents double-processing if Shopify retries.)
// 6. Fire the existing customer + owner confirmation emails (the same ones used today on insert).
// 7. Insert Google Calendar event.
// 8. Return 200.
```

Webhook is idempotent — Shopify will retry on non-200, and the `WHERE status='pending_payment'` guard means a retry that lands after success is a no-op.

If the webhook fires for an order that has no `booking_id` (someone bought tires standalone), it returns 200 with `{ ignored: true }`. The stub already returns 200 on success.

### 5. DB schema

**Migration:** `princetires-app/db/017-bookings-payment.sql`.

```sql
-- Allow a new lifecycle state.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS shopify_order_id TEXT;

CREATE INDEX IF NOT EXISTS bookings_shopify_order_idx
  ON bookings (shopify_order_id) WHERE shopify_order_id IS NOT NULL;

-- 'pending_payment' is a new value of the status column; if status is a CHECK constraint, widen it.
-- (Inspect the current constraint at implementation time — could be a CHECK or just a free-text TEXT.)
```

Status values used by the system:
- `pending` — pay-at-shop booking, awaiting owner confirmation. (Today.)
- `pending_payment` — pay-now booking, awaiting Shopify webhook. (New.)
- `confirmed` — staff confirmed (pay-at-shop) OR payment landed (pay-now).
- `cancelled` — staff or customer cancelled.

### 6. Abandoned checkout cleanup

A booking sitting in `pending_payment` blocks its time slot (the `bookings_active_slot_unique` constraint already prevents double-booking). If the customer abandons the Shopify checkout, that row needs to expire so the slot frees up.

**Approach:** a Vercel cron route at `princetires-app/src/app/api/cron/cleanup-pending-payments/route.ts` running every 5 min:

```sql
DELETE FROM bookings
WHERE status = 'pending_payment'
  AND created_at < now() - interval '30 minutes';
```

`vercel.json` schedules it. 30 min covers the Shopify checkout flow comfortably (most customers finish or abandon inside 10 min). Webhook ordering caveat: if Shopify is unusually slow and a successful payment webhook arrives AFTER the cleanup deleted the row, the webhook returns "booking not found" — log + alert the owner so they can recover (manual booking from the order).

### 7. Cancellation + refund flow

Policy: **always refundable until the appointment.**

#### Customer-initiated refund

The customer confirmation email includes a "Cancel & refund" link:

```
https://app.princetires.ca/cancel/<lookup_token>
```

`/cancel/[token]/page.tsx` already exists (handles the cancellation UI). Extend it:

1. If booking.status == 'confirmed' AND booking.shopify_order_id IS NOT NULL → present "Cancel & refund $X.XX" button.
2. On click: call Shopify Admin GraphQL `refundCreate` (full refund of the order); set booking.status = 'cancelled'.
3. Send customer cancellation email (already exists: `sendCustomerCancellation`).

#### Staff-initiated refund

`/admin/bookings/[id]` already has a cancel action (`updateBookingStatus`). Extend `bookings/[id]/actions.ts`:

- If the booking has `shopify_order_id`, call Shopify `refundCreate` as part of cancellation.
- Surface the refund result in the admin UI ("$X.XX refunded to original payment method").

#### Tier B caveat — supplier already committed

If a Tier B booking is cancelled AFTER the Trail Tire supplier order has been placed, refunding the tire portion may not be possible (supplier restocking fees, non-returnable orders). For v1, the design treats this as a **manual exception**:

- The cancellation flow proceeds with the full Shopify refund (customer is made whole).
- The owner reviews case-by-case via the admin booking detail page, which displays a warning when a cancelled booking has `supplier_tier='B'` AND was cancelled after the supplier cutoff (using existing `nextBusinessDayAfter1230` math from `validateBookingRules`).
- Long-term: an "auto refund minus tire cost" option could be added, but it's not in scope for v1.

### 8. UX edge cases

- **Slot held during checkout.** From the moment `pending_payment` is inserted, the time slot is locked by the `bookings_active_slot_unique` constraint. Other customers see it as taken in `/api/availability`. If the first customer abandons, the slot frees after 30 min (§6).
- **Network / webhook delay.** After redirect-from-checkout, the customer lands on a Shopify success page. The webhook may arrive seconds later. The customer's email arrives when the webhook fires. No client-side polling needed — async is acceptable.
- **Payment partially captured / disputed.** Out of scope for v1. Shopify Payments handles disputes through its own UI; staff handle case-by-case.
- **Discount codes / gift cards.** Free with Shopify checkout. If the discount drives the order total to $0, the webhook still fires and the booking still confirms — Shopify treats $0 paid orders the same.

### 9. Telemetry

Send GTM dataLayer events from the modal (existing pattern; the memory `analytics_setup` documents that GTM is the dataLayer convention):

- `booking_pay_now_clicked`
- `booking_pay_at_shop_clicked`
- `booking_payment_completed` (fired in the webhook → not browser-side, but logged for analytics export)
- `booking_payment_abandoned` (inferred from cleanup cron)

Per-tier conversion is the metric to watch in the first 30 days post-launch.

### 10. Testing

- **Unit:** `buildCheckoutLink` (permalink format + URL-encoding of attributes); webhook handler (idempotency, missing booking_id, status guard).
- **Integration (Playwright, new spec at `princetires/tests/pay-before-booking.spec.js`):**
  - Modal renders both buttons.
  - "Pay at shop" path still works identically to today (no regression).
  - "Pay now" POSTs `intent: pay_now`, gets a checkout URL, redirects.
  - Stub the Shopify checkout in the test environment; simulate the `orders/create` webhook hitting the app; assert booking flips to `confirmed`.
- **Manual:** end-to-end pay-now flow on a hidden preview theme, refund flow on a $1 test product.

## Rollout plan

1. **Build behind a feature flag.** Theme setting `booking_pay_now_enabled` (default `false`) hides the "Pay now" button. Ship the code; the button stays invisible until the flag is flipped.
2. **Internal test.** Owner runs a $1 booking through the full flow (Tier A and Tier B) on a hidden preview theme.
3. **Soft launch.** Enable the flag on the live theme. Monitor the GTM conversion split for a week — does pay-now adoption look healthy? Are there refund spikes? Webhook failures?
4. **Tune.** Adjust the Tier A deposit amount based on first-month no-show data. Refine modal copy if customers seem confused.
5. **Optional next step (not v1).** Extend pay-now to `pt-service-booking-modal.liquid` and the `/pages/booking` service flows.

## Pieces already in place

- `orders/create` webhook (`princetires-app/src/app/api/webhooks/shopify/orders-create/route.ts`) — HMAC-verified stub waiting for business logic.
- `/cancel/[token]/page.tsx` — already handles cancellation; needs the Shopify-refund branch added.
- `/admin/bookings/[id]` — already cancels bookings via `updateBookingStatus`; needs the Shopify-refund call hooked in.
- Booking emails (`princetires-app/src/lib/email/booking-emails.ts`) — `sendCustomerConfirmation` + `sendCustomerCancellation` exist; the "cancel & refund" link is the only new copy.
- 7 unlisted Service products in the Shopify catalog — usable as install-fee line items (subject to the §3a price-reconciliation decision).
- Shopify Payments — already processing standalone tire sales.

## Open questions (decide at implementation time)

1. **Install-service product strategy** (§3a) — A / B / C / D. Recommendation: **C** (single new product with cart-time price override).
2. **Tier A deposit amount** — defaulting to `$50/tire` in this spec; final value confirmed at launch.
3. **Tier B "already-ordered" refund handling** — manual exception flag in v1; consider auto-refund-minus-supplier-cost in v2.
4. **Pay-now extension to service modal + booking page** — deferred; v1 covers only the product booking modal.
5. **Visual hierarchy of the two buttons** — design review (frontend-design skill) before launch to confirm "Pay now" is primary without burying "pay at shop."

## Files this will touch (when implemented)

**Theme (`princetires/`):**
- `snippets/pt-booking-modal.liquid` — two buttons + new `submitAndCheckout()` handler.

**App (`princetires-app/`):**
- `src/app/api/book/route.ts` — `intent` field, branch for `pay_now`.
- `src/app/api/webhooks/shopify/orders-create/route.ts` — business logic on top of the stub.
- `src/app/api/cron/cleanup-pending-payments/route.ts` — NEW.
- `src/app/cancel/[token]/page.tsx` — Shopify-refund branch.
- `src/app/admin/(shell)/bookings/[id]/actions.ts` — Shopify-refund on staff cancellation.
- `src/lib/booking/checkout-link.ts` — NEW.
- `db/017-bookings-payment.sql` — NEW.
- `vercel.json` — cron schedule.

**Shopify admin (manual setup at launch):**
- One new product: "Tire Installation" (custom-price variant) per §3a-C.
- One new product: "Booking deposit" (custom-price variant) for the Tier A path.
- Both UNLISTED — never visible on the storefront.
- Set `SENTRY_AUTH_TOKEN` in Vercel (existing loose end).

## Out of scope

- Subscription / recurring billing.
- In-modal card capture (Stripe Elements).
- Loyalty points / store credit issuance.
- Pay-now for service-only bookings (rotation, balancing, flat repair) — design generalizes naturally; deferred to v2.
- Auto-detecting Tier A vs Tier B from the customer's chosen tire — already handled by the existing `data-supplier-tier` attribute.

---

**Status when written:** approved by owner pending review of this document. Implementation deferred until website traffic grows.
