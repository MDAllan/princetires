# Code Review Backlog — 2026-05-15

> Findings from a deep multi-agent review of both repos (theme + app).
> Tracked here as a checklist. Check items off as they ship. Tags: `[app]` = princetires-app, `[theme]` = princetires.
> Severity: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low.

---

## 🔥 Do today — leaked credentials

- [x] **SEC-1 `[app]`** — Shopify Admin API token rendered into a public HTML page. **Fixed 2026-05-18** — route deleted, deployed (returns 404).
  `src/app/api/auth/shopify/callback/route.ts` (lines 81–104) prints `access_token` + scopes into `<pre>`. The token is full Admin API access. `PROJECT_PLAN.md:60` already flagged this route as deletable. **Fix: delete the route.**
- [ ] **SEC-2 `[theme]`** — Gemini API key shipped to every browser.
  `sections/pt-collection-grid.liquid:74`, `hero-smart-search.liquid:195` emit `{{ settings.gemini_api_key | json }}`; `hero-smart-search.liquid:1413` puts it in the request URL. **Fix today:** add HTTP-referrer restrictions to the key in Google Cloud Console. **Proper fix:** proxy Gemini calls through a server endpoint.

---

## 🔴 Critical

- [x] **C1 `[theme]`** — Fixed 2026-05-18: the 5 active-filter vars are now computed from `collection.filters` inside `pt-collection-sidebar.liquid`. — Collection sidebar reads 5 Liquid variables that are never assigned (`active_vendor`, `active_season`, `active_type`, `active_price_min/max`). The **Stud Option filter never renders**; run-flat/stud links silently drop the customer's active filters. `snippets/pt-collection-sidebar.liquid` — compute these from `collection.current_filters` in the section and pass as `render` params.
- [x] **C2 `[theme]`** — Fixed 2026-05-18: live header confirmed = `pt-header` (`header-group.json`); the 3 AJAX call sites now update `.pt-header__cart-count`. — AJAX cart badge updates target `#cart-icon-bubble`, which exists only in `pt-navbar.liquid`. If `pt-header.liquid` is the live header, add-to-cart shows **no cart feedback**. `pt-collection-grid.liquid:2470`, `pt-product.liquid:1365`, `pt-cart.liquid:367` — target both selectors, or settle on one header (see H6).
- [x] **C3 `[theme]`** — Fixed 2026-05-18: `geo-meta.liquid` is now the single Product node (given a stable `@id`); dead `schema-review.liquid` deleted; the `product-reviews` section no longer emits a duplicate Product node — its theme-editor review blocks aren't verified per-product reviews, so they emit no rating schema (the reviews still render visually). — Product pages emit up to 3 conflicting `Product` JSON-LD blocks with different `aggregateRating` values. `geo-meta.liquid`, `product-reviews.liquid`, `schema-review.liquid` — keep `geo-meta.liquid` as the single Product node, fold the review array into it, delete the others' output.
- [ ] **C4 `[theme]`** — Competing LocalBusiness entities: a global `AutoRepair` node with no rating + separate rated nodes on brand/about pages, no shared `@id`. `schema-local-business.liquid` vs `about-hero.liquid` / `pt-brand-detail.liquid` — one business entity, stable `@id`, sections reference it.
- [x] **C5 `[theme]`** — Fixed 2026-05-18: about-page schema corrected to Mon–Sat 09:30–17:30 / Sun 10:00–15:30 (was 08:00–18:00 / Sun 00:00–00:00) in `about-hero.liquid` defaults + `page.about.json`; brand schema was already correct. — Opening hours contradict across 3 places (about schema 08:00–18:00 / brand schema 09:30–17:30 / visible 404 text 9:30–5:30); Sunday emits invalid `00:00–00:00`. Reconcile to one correct set.
- [x] **C6 `[theme]`** — Fixed 2026-05-18: standardised on 562 (`about-hero.liquid` stale `320` default corrected; `page.about.json` was already 562). The "300+" was a product count, not a review count. — Review count is 320 / 562 / "300+" in different places. Schema `reviewCount` not matching visible copy is a Google policy violation. `about-hero.liquid:61`, `page.about.json:51`, `about.json:182` — pick one number.
- [ ] **C7 `[theme]`** — Garage-banner "Yes, filter" button reportedly unclickable. **Not isolated from static reading** — needs a live repro. Strongest candidate: `pt-collection-garage-banner.liquid` reads each vehicle's size as `v.tireSize`/`v.sizes[0]`, but if `my-garage.js` writes `v.size`, the `.filter(v => v.size)` at line 189 drops every vehicle and the banner stays hidden. Verify the actual localStorage shape.

---

## 🟠 High

### App
- [ ] **H1 `[app]`** — Double-book guard covers only the start slot. A 60-min (truck) booking at 11:00 blocks 11:30 in the availability view, but a direct POST for 11:30 inserts with no unique-constraint conflict. `api/book/route.ts:131–165` — re-check `slotsCovered` against existing bookings before insert.
- [ ] **H2 `[app]`** — `supplierTier` is client-controlled; a tampered POST with `supplierTier:"A"` bypasses the next-day / winter-rush lead time. `api/book/route.ts` (has a `TODO(security)`) — re-derive the tier server-side from the product.
- [ ] **H3 `[app]`** — Missing Shopify GDPR webhooks (`customers/redact`, `shop/redact`, `customers/data_request`). Required for any app touching customer PII; absence can get the app suspended. Add the 3 HMAC-verified handlers.
- [ ] **H4 `[app]`** — `/api/inventory-stats` is public, unauthenticated, and expensive (~31 Shopify Admin calls on a cache miss; no cache if Redis is unconfigured). Add IP rate limiting and/or make it cache-read-only.

### Theme
- [ ] **H5 `[theme]`** — Auto-seed redirect forces every first-time visitor to `/collections/tires` through a full `location.replace()` round-trip before paint — bad LCP. `pt-collection-grid.liquid:10–60` — do seasonal defaulting server-side in Liquid.
- [ ] **H6 `[theme]`** — Two complete header implementations ship side-by-side (`pt-header.liquid` + `pt-navbar.liquid`, ~50KB duplicated). Delete one — root cause of C2.
- [ ] **H7 `[theme]`** — Collection smart-search duplicates ~400 lines of the hero search's vehicle parser, already drifted (hero handles flotation sizes, collection doesn't). Extract to a shared `assets/pt-smart-search.js`.
- [ ] **H8 `[theme]`** — Hero LCP image missing `fetchpriority="high"`. `hero-smart-search.liquid:32` — add it to the first slide.
- [ ] **H9 `[theme]`** — Invalid CSS selector `section-template--*-padding` kills the rule. `pt-collection-overrides.liquid:17` — remove it; verify the whole snippet isn't dead Dawn CSS.
- [ ] **H10 `[theme]`** — Year misparse: `tryDirectParse` accepts 2-digit values as years and uses a hardcoded `1990` floor instead of `config.minYear`. `pt-collection-grid.liquid:2259–2266`.
- [ ] **H11 `[theme]`** — Global LocalBusiness schema missing `openingHoursSpecification` + `aggregateRating`. `schema-local-business.liquid` — add both so every page carries complete data.
- [ ] **H12 `[theme]`** — Brand page `<title>`/meta built via `capitalize` on the handle → "Gt radial" for any brand not manually special-cased. `layout/theme.liquid:33–38,65–70` — read brand name from a metafield/section setting.
- [ ] **H13 `[theme]`** — `og:image` uses `http:`; no global OG/Twitter image fallback (homepage/brand pages share with no card). `meta-tags.liquid:22–27` — use `https:`, add a `default_share_image` setting.
- [ ] **H14 `[theme]`** — Multiple `FAQPage` JSON-LD blocks can co-exist on one URL; product FAQ schema can diverge from visible `<details>`. One FAQPage per URL, schema mirrors visible content.
- [ ] **H15 `[theme]`** — Collection pages have no `<h1>` fallback in the grid section; `pt-collection-header.liquid:21` hides breadcrumbs site-wide via collection CSS. Guarantee an h1 in the grid; reconsider the breadcrumb hide.
- [ ] **H16 `[theme]`** — `schema-review.liquid` and `geo-meta.liquid` read different metafield shapes for the same rating data — one is always empty. Standardize on Shopify's `reviews.rating` + `reviews.rating_count`.

---

## 🟡 Medium

- [ ] **M1 `[app]`** — Public POST routes accept any `Origin`; no CSRF/bot defense beyond rate limiting. Add Origin enforcement, consider hCaptcha on `/api/book` + `/api/wholesale/register`.
- [ ] **M2 `[app]`** — Webhook error classification uses a regex on `/missing/i` against the error message — brittle. Throw a typed `SkipWebhookError` instead.
- [ ] **M3 `[app]`** — `/api/availability` accepts arbitrary far-future/past dates. Clamp to a sane booking window.
- [ ] **M4 `[app]`** — `csvResponse` interpolates `filename` into `Content-Disposition` unsanitized — header-injection footgun. Whitelist `[A-Za-z0-9._-]`.
- [ ] **M5 `[app]`** — `bookings.customer_id`/`vehicle_id` are never populated; the `customers` table is effectively unused — "customers" reconstructed by `GROUP BY email`. Link bookings to `customers`, or formally drop the dependency.
- [ ] **M6 `[app]`** — Better Auth password-reset email send isn't failure-tracked (every other email path is). `src/lib/auth.ts:41–66` — wrap in try/catch + `recordEmailFailure`.
- [ ] **M7 `[theme]`** — Sidebar filter count badges only count the current 24-product page, overwriting accurate native facet counts. `pt-collection-grid.liquid:1993–2011`.
- [ ] **M8 `[theme]`** — Mobile filter-drawer re-open is inconsistent — some controls set the `ptg_filter_open` marker, some don't. Centralize navigation through one helper.
- [ ] **M9 `[theme]`** — Pervasive hardcoded user-facing strings bypass the `{{ 'key' | t }}` i18n rule mandated by `CLAUDE.md`. Big batch migration; low urgency (en-only store).
- [ ] **M10 `[theme]`** — `research-strip.liquid` pre-seeds the vehicle cascade via a `setTimeout` poll instead of awaiting the fetch — can miss on slow networks. Make `onYearChange` return its promise and `await` it.
- [ ] **M11 `[theme]`** — Duplicate `BreadcrumbList` JSON-LD on product pages (`breadcrumbs.liquid` microdata + `pt-product.liquid` JSON-LD). Render once.
- [ ] **M12 `[theme]`** — `pt-product.liquid` heading hierarchy jumps h1 → h3. Use `<h2>` for spec/warranty panel headings.
- [ ] **M13 `[theme]`** — Newsletter success/error messages have no `aria-live`/`role="status"`. `pt-footer.liquid:134–143`.
- [ ] **M14 `[theme]`** — Brand title brand-name special-cases are duplicated in both the `<title>` and meta-description blocks. Single source.
- [ ] **M15 `[theme]`** — `format-detection telephone=yes` can wrongly linkify tire sizes/postal codes. `sxo-performance.liquid:71` — consider `telephone=no`.
- [ ] **M16 `[theme]`** — `parseInt` without radix throughout; `chipLabel` switch missing `seasonality`/`vendor` cases. Minor consistency cleanups.

---

## ⚪ Low

- [ ] **L1 `[theme]`** — Product cards fabricate star ratings from the vendor name, rendered identically to real ones. Trust/policy risk — at minimum don't make fake look real. `pt-collection-card.liquid:126–140`.
- [ ] **L2 `[theme]`** — First-4 cards eager-load images, but mobile grid is 2-up — cards 3–4 are below the fold competing with the LCP. Tune to `forloop.index <= 2`.
- [ ] **L3 `[theme]`** — Hardcoded hex everywhere (brand red as `#dc2626`/`#b91c1c`/`#8b1a1a`); should be CSS variables.
- [ ] **L4 `[theme]`** — Empty `{% if show_trust_bar %}{% endif %}` block + 4 dead theme settings clutter the editor. `pt-collection-grid.liquid:112`.
- [ ] **L5 `[theme]`** — Oversized files: `pt-product.liquid` (111KB), `my-garage.liquid` (88KB), `pt-collection-grid.liquid` (2,632 lines). Extract CSS/JS.
- [ ] **L6 `[theme]`** — Stale comment in `theme.liquid:124` ("Inter + Rubik" — actually loads Barlow Condensed + Outfit).
- [ ] **L7 `[theme]`** — `priceValidUntil` always end of current year (`geo-meta.liquid:117`); `WPHeader` JSON-LD is schema noise (`sxo-performance.liquid:81`); `twitter:site` split is fragile for `x.com` URLs.
- [ ] **L8 `[app]`** — `console.error` logs full booking PII on validation failure (`api/book/route.ts:87`); `clientIp()` trusts `X-Forwarded-For` blindly; login `from` param used unchecked (open-redirect-ish); money via `Math.round(dollars*100)` is float-lossy; two identically-named `corsHeaders` helpers.

---

## Operational follow-ups (not code)

- [ ] Set a **301 redirect** in Shopify admin for the deleted `/pages/wheel-alignment-calgary` → `/pages/services`. (No internal links remain — clean.)
- [ ] Verify `templates/robots.txt.liquid` doesn't disallow `/collections/` or `/products/`.
- [ ] Confirm which header (`pt-header` vs `pt-navbar`) is actually live before fixing C2/H6.

---

## What was done well (don't "fix")

- Backend security fundamentals: consistent timing-safe HMAC verification, IDOR closed on every vehicle op, all SQL parameterized, atomic admin-bootstrap, `tsc --noEmit` clean.
- `geo-meta.liquid` Product schema is genuinely strong (AggregateOffer, return policy, tire-specific properties) — once de-duplicated.
- Theme resilience: localStorage/webhook handling consistently try/catches with mailto fallbacks; conversion-minded 404; accessibility fundamentals (skip link, aria states, focus-visible) in place.
