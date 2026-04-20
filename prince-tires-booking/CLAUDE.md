# Prince Tires Booking API

Use the `prince-tires-domain` skill at the start of any session in this repo.

## Quick facts

- **Runtime:** Node.js CJS serverless functions (Vercel Hobby plan)
- **Function limit:** 12 max — currently at exactly 12. Do not add new functions without merging or removing one.
- **Deploy:** `cd c:\Users\madih\prince-tires-booking && vercel --prod`
- **Security helpers:** `api/_lib/security.js` — `setCorsHeaders`, `setSecurityHeaders`, `rateLimit`, `verifyAdminAuth`, `generateCancelToken`, `verifyCancelToken`, `sanitize`

## Function list (12/12)

| File | Purpose |
|------|---------|
| `api/book.js` | Create booking |
| `api/availability.js` | Get available slots |
| `api/cancel.js` | Cancel via HMAC link |
| `api/admin-login.js` | Admin JWT auth |
| `api/admin-bookings.js` | List bookings |
| `api/admin-booking-manage.js` | Reschedule/cancel booking |
| `api/admin-all-customers.js` | Customers list + wholesale mode |
| `api/admin-approve.js` | Approve wholesale application |
| `api/admin-customer.js` | Single customer detail |
| `api/admin-stats.js` | Dashboard stats |
| `api/admin-orders.js` | Orders list |
| `api/admin-products.js` | Products list |

## Adding a new function

You CANNOT add a 13th function on the Hobby plan. Options:
1. Merge functionality into an existing function using a `?mode=` or `?action=` query param
2. Upgrade to Vercel Pro (not recommended right now)

## Key patterns

- Always call `verifyAdminAuth(req)` before any admin data access
- Always call `rateLimit(req, res, limit, windowMs)` after auth
- Sanitize all query params with `sanitize(value, maxLength)`
- Time zone: always use `America/Edmonton` for date/time display
