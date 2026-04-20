# Prince Tires — Master Enhancement Plan

> All four repos working together: **princetires** (Shopify theme) · **prince-tires-ai** (chat) · **prince-tires-booking** (booking) · **prince-tires-ai/kb** (knowledge base)

---

## How the repos connect

```
Customer lands on princetires.ca (Shopify theme)
  │
  ├─> AI Chat widget on product page
  │     └─> prince-tires-ai/api/chat.js → Gemini → Google Sheets log
  │
  ├─> "Book Installation" button → prince-tires-booking (Vercel)
  │     └─> availability.js → Google Calendar (read)
  │     └─> book.js → creates calendar event + sends Resend email
  │     └─> customer-bookings.js → My Garage upcoming appointments
  │
  └─> My Garage (signed-in customers)  /pages/garage
        └─> vehicle records, upcoming bookings, order history
  └─> Wholesale Portal (wholesale tag)  /pages/wholesale-portal
```

---

## ✅ Completed

| Item | Repo | Notes |
|------|------|-------|
| Email confirmation on booking | `prince-tires-booking/api/book.js` | Resend integration, fires on every booking |
| Block lunch (12:00 + 12:30 PM) | `prince-tires-booking/api/availability.js` | Both slots blocked every day |
| Null crash fix (timeParts) | `prince-tires-booking/api/book.js` | Returns 400 on bad time format |
| JSON.parse try-catch | `book.js`, `availability.js`, `admin-bookings.js` | Graceful 500 on bad service account key |
| Method validation | `admin-bookings.js` | Rejects non-GET requests with 405 |
| Remove duplicate vercel.json entry | `vercel.json` | `admin-customer.js` deduplicated |
| SHEETS_URL to env var | `prince-tires-ai/api/chat.js` | Reads `GOOGLE_SHEETS_WEBHOOK_URL` first |
| Navbar redesign | `sections/pt-header.liquid` | Single row, logo left, 16px links, garage pill |
| Wholesale portal nav link | `sections/pt-header.liquid` | Wholesale users → `/pages/wholesale-portal` |
| Fix broken nav defaults | `sections/pt-navbar.liquid`, `pt-header.liquid` | `/pages/garage`, `/pages/all-services` |
| `customer-bookings.js` endpoint | `prince-tires-booking/api/` | Exists — ready to wire into My Garage |
| `admin-booking-manage.js` endpoint | `prince-tires-booking/api/` | Exists — admin can edit/cancel bookings |

---

## Priority 1 — AI Chat Knowledge Base (prince-tires-ai)

The KB lives in `prince-tires-ai/kb/data/`. Expanding it makes the AI far more accurate.

### KB modules — status

| File | Status | What goes in it |
|------|--------|----------------|
| `kb/data/seasonal.js` | 🔄 In progress | Winter/all-season/summer timing, 7°C rule, Alberta advice |
| `kb/data/faqs.js` | ⬜ Todo | Top 20 customer questions with ideal short answers |
| `kb/data/brands.js` | ⬜ Todo | Michelin, Bridgestone, Goodyear, Hankook, Nexen — strengths |
| `kb/data/services.js` | ⬜ Todo | Installation, TPMS, balancing, disposal — pricing range |
| `kb/data/policies.js` | ⬜ Todo | Return policy, warranty, what to bring in |
| `kb/data/guides.js` | ⬜ Todo | How to read tire size, load index, speed rating |
| `kb/data/vehicles.js` | ⬜ Todo | Common vehicle → recommended tire size table |

### Wire KB into knowledge.js

```js
import seasonal from './kb/data/seasonal.js';
import faqs     from './kb/data/faqs.js';
// ...
export default [base, seasonal, faqs, brands, services, policies, guides].join('\n\n');
```

### AI chat improvements (api/chat.js)

- [ ] Wire in `vehicle.js` — AI can use detected vehicle type in its answer
- [ ] Booking CTA — when AI detects buy intent, append "Ready to book? Hit Book Installation above."
- [ ] Seasonal trigger — Oct–Nov and Mar–Apr auto-inject seasonal urgency into system prompt

---

## Priority 2 — My Garage ↔ Booking sync (HIGH VALUE — endpoint already exists)

`customer-bookings.js` is live on Vercel. Wire it into the theme.

### Steps
- [ ] **My Garage upcoming bookings panel** — `GET /api/customer-bookings?email=X` → show next appointment date/time/tire in `my-garage.liquid` + `my-garage.js`
- [ ] **Quick re-book** — "Book again" button pre-filled with last vehicle info
- [ ] **Tire record per vehicle** — store last tire size bought, show "time to swap?" banner seasonally

### Files
- `sections/my-garage.liquid`
- `assets/my-garage.js`

---

## Priority 3 — Booking System (prince-tires-booking)

### Customer-facing
- [ ] **24h reminder email** via Vercel cron job (`vercel.json` schedule)
- [ ] **Cancellation link** in confirmation email → new `api/cancel.js` endpoint
- [ ] **Booking status page** — customer enters email + booking ID to check status
- [ ] **Link booking to Shopify customer ID** — capture at booking time, store in calendar description

### Admin portal (public/admin)
- [ ] **Search bar** on bookings list (by name, phone, tire size)
- [ ] **Week date filter** — show bookings for a specific week
- [ ] **Export to CSV** — download booking data
- [ ] **Block-off time** — mark slots unavailable without a real calendar event

### Availability
- [ ] **Max bookings per day cap** (e.g., 8) — prevent overbooking
- [ ] **Show next available** when a slot is full

---

## Priority 4 — Shopify Theme (princetires)

### Product pages
- [ ] **Tire spec table** — size, load, speed rating, 3PMSF badge
- [ ] **Fitment guide callout** — "Will this fit?" → AI chat or size guide
- [ ] **Season badge** — winter/all-season/summer visual tag on product image

### Collection / search
- [ ] **Filter by season** (all-season, winter, summer, all-weather)
- [ ] **Filter by vehicle type** (SUV, sedan, truck, minivan)
- [ ] **"Fits my vehicle" filter** — year/make/model → narrows collection

### SEO / GEO (use GeoCoreAI at `C:\Users\madih\geocoreai-open`)
- [ ] **LocalBusiness schema** on homepage — `snippets/schema-local-business.liquid` exists, wire it in
- [ ] **FAQ schema** on product pages — pulls from `kb/data/faqs.js`
- [ ] **Seasonal landing pages** — "Winter tires Calgary 2025"
- [ ] **GEO signals** — answer-style headings, FAQ sections on collection pages

### Trust & conversion
- [ ] **Review snippets** on product + collection pages — `snippets/schema-review.liquid` exists
- [ ] **"X sold this month"** social proof badge
- [ ] **Warranty badge** — km warranty on product cards

---

## Priority 5 — Cross-repo integrations

### AI chat → Booking handoff
When customer says "I want to book":
1. Chat sends `{ intent: 'book', product: p }` postMessage to parent Shopify page
2. Shopify page scrolls to "Book Installation" section
3. Booking form pre-fills tire name + size

### Analytics (future)
- Google Sheets: every AI question + product → build read-only dashboard
- Google Calendar: all bookings → peak days, most booked sizes

---

## File map — what to touch for each next step

| Enhancement | File(s) |
|------------|---------|
| KB seasonal module | `prince-tires-ai/kb/data/seasonal.js` 🔄 |
| KB faqs module | `prince-tires-ai/kb/data/faqs.js` |
| KB brands/services/policies | `prince-tires-ai/kb/data/*.js` |
| Wire KB into chat | `prince-tires-ai/knowledge.js` |
| Vehicle.js in chat | `prince-tires-ai/api/chat.js` |
| My Garage bookings panel | `sections/my-garage.liquid` + `assets/my-garage.js` |
| 24h reminder email | `prince-tires-booking/vercel.json` + new `api/remind.js` |
| Cancellation endpoint | `prince-tires-booking/api/cancel.js` |
| Admin search/filter | `prince-tires-booking/public/admin/index.html` |
| Product spec table | `sections/pt-product.liquid` or `sections/main-product.liquid` |
| Season badges | `sections/featured-tires.liquid` + `snippets/card-product.liquid` |
| Collection filters | `sections/pt-collection-grid.liquid` |
| SEO schema | `snippets/schema-local-business.liquid` (exists — wire in) |

---

## Next quick wins

1. **Finish `kb/data/seasonal.js`** — already started, wire into knowledge.js
2. **My Garage upcoming bookings** — endpoint exists (`customer-bookings.js`), just needs UI
3. **KB faqs.js** — 30 min, feeds both AI chat quality and future FAQ schema
4. **Season badge on product cards** — visual impact, helps customers filter
5. **LocalBusiness schema on homepage** — snippet already exists, just needs rendering

---

## Development rules (from CLAUDE.md)

- Run `python3 ui-ux-pro-max-skill/src/ui-ux-pro-max/scripts/search.py "<query>" --domain style` before any UI work
- Push only to Dawn theme (#185559220499) with `--allow-live` flag
- Every user-facing string must use `{{ 'key' | t }}` with a key in `locales/en.default.json`
- Validate section schema against `schemas/section.json`
- Shopify page handles: garage (`/pages/garage`), services (`/pages/all-services`), wholesale portal (`/pages/wholesale-portal`)
