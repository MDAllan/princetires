# Prince Tires — Master Enhancement Plan

> Two repos working together: **princetires** (Shopify theme) · **princetires-app** (Next.js backend at `app.princetires.ca`)

The old `prince-tires-ai` and `prince-tires-booking` Vercel projects were folded into `princetires-app` and deleted (commit `eed70c6`). All theme code now points at `https://app.princetires.ca`.

---

## How the repos connect

```
Customer lands on princetires.ca (Shopify theme)
  │
  ├─> "Book installation" / sticky bar / service modal
  │     └─> POST app.princetires.ca/api/availability
  │     └─> POST app.princetires.ca/api/book
  │           └─ Neon: bookings table (unique partial idx prevents double-book)
  │           └─ Resend: customer confirmation + owner notification
  │
  ├─> Wholesale apply page (Shopify form)
  │     └─> fire-and-forget POST app.princetires.ca/api/wholesale/register
  │           └─ Neon: wholesale_applications
  │           └─ Resend: applicant confirmation + branded owner email
  │
  └─> My Garage  /pages/garage  (signed-in customers)
        └─ vehicle records + (planned) upcoming bookings panel

Staff
  └─> app.princetires.ca/admin  (Better Auth, single owner account)
        ├─ /bookings  (list, detail, status changes)
        ├─ /customers (aggregated from bookings + Shopify Admin API)
        ├─ /wholesale (review B2B apps → Shopify customer tag)
        ├─ /email-failures (Resend send failures, retryable)
        ├─ /exports (CSV — bookings + customers)
        └─ /settings (block whole days, change password)
```

---

## ✅ Shipped — princetires-app (Next.js 16 + Neon + Better Auth + Resend + Sentry)

### Booking
- `POST /api/book`, `GET /api/availability` (Edmonton TZ throughout)
- Lunch block (12:00 + 12:30), past-slot guard, Trial-inventory rules
- Unique partial index on `(scheduled_date, scheduled_time)` for active rows → API returns 409 on double-book
- Owner notification email on every booking (`princetires111@gmail.com`)
- Resend booking confirmation with cancel link → `/api/cancel`

### Admin portal `/admin/(shell)`
- Bookings list + detail + status workflow
- Customers list + per-customer detail (joined from bookings + Shopify Admin)
- Block-dates UI → `shop_blocks` table feeds `/api/availability`
- Email-failures log surfaced from `email_failures` table
- CSV export endpoints for bookings and customers
- Settings: change password, block days
- Logout, dashboard pulls real Shopify orders + revenue + customer count

### Auth + security
- Better Auth on Postgres
- Atomic first-admin gate via `app_bootstrap` flag (no count(*) race)
- Forgot/reset password via Resend
- Strict CORS allowlist, Upstash rate-limit per IP + per email
- Sentry error tracking + light tracing

### Wholesale (B2B)
- `POST /api/wholesale/register` from Shopify theme form
- Staff review UI; approval tags Shopify customer (tier + `wholesale`)
- `wholesale_tag_retries` queue + admin banner for failed tag ops
- Branded confirmation emails to applicant and owner

---

## ✅ Shipped — princetires (Shopify theme)

- Brands page redesign (grid overview + 10 individual brand pages)
- Tangerine event color, season badge on product cards
- Sticky book bar with next-available slot fetch
- Garage widget, My Garage personal dashboard with stats + activity feed
- Hero smart search with phone CTA
- Brand carousels (CSS keyframe marquee)
- SEO: GTM tracking, GeoCoreAI snippets present (some not yet rendered)
- Login page redesign
- AI chat tab removed from product page (will be rebuilt as agent in `princetires-app`)

---

## 🚧 Planned — `princetires-app`

- **Booking caps**: max bookings per day; "next available" hint when full
- **Cancellation page**: customer enters email + booking id to view/cancel
- **My Garage upcoming bookings endpoint** — wire UI in theme once route exists
- **AI agent route** — replace removed product-page chat with `/api/agent` + new theme tab

---

## 🚧 Planned — `princetires` (theme)

### Product pages
- Tire spec table (size, load, speed rating, 3PMSF badge from metafields)
- Fitment "will this fit?" callout
- Reintegrate AI tab once `/api/agent` exists in the app

### Collection / search
- Filter by season (all-season, winter, summer, all-weather)
- Filter by vehicle type (SUV, sedan, truck, minivan)
- "Fits my vehicle" filter (year/make/model)

### SEO / GEO
- Wire in `snippets/schema-local-business.liquid` on homepage
- FAQ schema on product pages
- Seasonal landing pages ("Winter tires Calgary 2025")
- Review snippet on product + collection cards

### Trust & conversion
- "X sold this month" social proof badge
- Warranty km badge on product cards

---

## File map — what to touch

| Enhancement | File(s) |
|------------|---------|
| Booking caps | `princetires-app/src/app/api/availability/route.ts` |
| Cancellation page | `princetires-app/src/app/cancel/page.tsx` (new) |
| My Garage bookings panel | `princetires/sections/my-garage.liquid` + matching app endpoint |
| AI agent route | `princetires-app/src/app/api/agent/route.ts` (new) + new tab in `pt-product.liquid` |
| Tire spec table | `princetires/sections/pt-product.liquid` |
| Season / vehicle filters | `princetires/sections/pt-collection-grid.liquid` |
| LocalBusiness schema | `princetires/snippets/schema-local-business.liquid` (exists, render in layout) |
| Review snippets | `princetires/snippets/schema-review.liquid` (exists) |

---

## Next quick wins

1. **AI agent stub** in `princetires-app` — even a thin Anthropic-backed `/api/agent` lets the product-page tab come back with real intelligence
2. **My Garage bookings panel** — straightforward once the customer-bookings endpoint exists in the app
3. **LocalBusiness schema render** — snippet exists, one-line layout add
4. **Tire spec table** — pure Liquid, reads from existing metafields

---

## Development rules (from AGENTS.md / CLAUDE.md)

- Use the `shopify-liquid-themes` skill before touching `.liquid` files
- Use the `ui-ux-pro-max` skill (stack: `html-tailwind`) before any design/UI work
- Every user-facing string uses `{{ 'key' | t }}` with a key in `locales/en.default.json`
- Validate section schema against `schemas/section.json`
- Shopify page handles: garage (`/pages/garage`), services (`/pages/all-services`), wholesale portal (`/pages/wholesale-portal`)
- Never `shopify theme push --live --allow-live`; promote via Admin API `role=main` or the Shopify admin UI
