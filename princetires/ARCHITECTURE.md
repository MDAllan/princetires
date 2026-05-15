# princetires — Theme Architecture Map

> **What this is:** the Prince Tires storefront — a customized Shopify **Dawn**
> theme. Live theme: "Copy of Dawn".
> **What this doc is for:** a map of the *custom* layer on top of Dawn — where
> Prince Tires code lives and how it talks to the backend app.
> **Anti-rot rule:** any structural change (new section/template/snippet/asset)
> updates this file *in the same commit*. Code wins over this doc.
> Last verified: 2026-05-15.

## How it relates to the backend

The theme is the storefront; `princetires-app` is the backend. They talk two ways:

- **App Proxy** — theme JS calls `princetires.ca/apps/api/*`, which Shopify
  HMAC-signs and forwards to `app.princetires.ca/api/proxy/*`. Used by the
  customer garage (`my-garage.js` → `/apps/api/vehicles`).
- **Direct CORS fetch** — theme booking forms POST straight to
  `app.princetires.ca/api/book` and GET `/api/availability`.

## Convention

Everything custom is prefixed **`pt-`** (sections, snippets, assets). Anything
without that prefix is stock Dawn — don't document or modify it here.

## Templates → pages (`templates/`)

JSON templates compose sections. Notable custom pages:

| Template | Page |
|---|---|
| `index.json` | Home |
| `collection.json` · `product.json` | Tire collection grid · product page (rebuilt) |
| `page.garage.json` | Customer "My Garage" |
| `page.booking.json` | Booking page |
| `page.brands.json` · `page.brand-*.json` | Brands index + ~20 per-brand pages |
| `page.about` · `page.contact` · `page.service` · `page.all-services` | Marketing pages |
| `page.wholesale*.json` | Wholesale portal / register / landing |
| `page.*-calgary.json` | Local-SEO service pages (winter tires, fleet, TPMS, installation, all-season) |
| `page.privacy-policy` · `page.returns-policy` · `page.terms-of-use` | Policy pages |
| `404.json` | Rebuilt 404 |

## Custom sections (`sections/pt-*` + `my-garage`)

`sections/` holds 106 files; the custom ones:

| Section | Used by |
|---|---|
| `pt-header.liquid` · `pt-footer.liquid` | Site chrome (live header/footer) |
| `pt-collection-grid` · `-header` · `-faq` | Tire collection page |
| `pt-product` · `pt-related-products` · `pt-recently-viewed` · `pt-tire-comparison` | Product page |
| `pt-brands-grid` · `pt-brand-detail` | Brands index · per-brand pages |
| `pt-calgary-service` · `pt-service-detail` · `pt-all-services` | Service / local-SEO pages |
| `pt-booking-page` | Booking page |
| `my-garage.liquid` | My Garage page |
| `pt-contact-editorial` · `pt-social-proof` · `pt-performance-radar` · `pt-sticky-book-bar` · `pt-cart` | Misc storefront UI |
| `pt-policy-privacy` · `pt-policy-returns` · `pt-policy-terms` | Policy pages |

⚠️ **Likely orphans** (referenced by no template — candidates for deletion):
`pt-navbar.liquid`, `pt-brands-hero.liquid`. Verify before removing.

## Custom snippets (`snippets/pt-*`)

| Snippet | Purpose |
|---|---|
| `pt-booking-modal` · `pt-booking-modal-trigger` | Tire-install booking modal |
| `pt-service-booking-modal` | Service booking modal (rotation, balance, repair…) |
| `pt-garage-widget` | Garage widget (vehicle picker) |
| `pt-tire-search` · `pt-fitment-badge` | Tire search + fitment indicator |
| `pt-collection-*` (card, compare, empty, sidebar, garage-banner, overrides, research-strip) | Collection-page building blocks |
| `pt-supplier-tier` · `pt-wholesale-savings` | Supplier-tier + wholesale pricing UI |
| `pt-analytics` | GTM / dataLayer event helper |

## Custom assets (`assets/`)

| Asset | Purpose |
|---|---|
| `my-garage.js` | Customer garage — App-Proxy vehicle CRUD (Phase 1) + bookings list (Phase 2) |
| `pt-fitment-badge.js` | Tire fitment badge logic |
| `component-pt-button.css` | Custom button styles |
| `prince-tires-logo.svg` | Logo |
| `pt-vehicle-2001.json` … `pt-vehicle-2026.json` | Vehicle fitment data, one file per model year |
| `pt-brand-products.json` | Brand → products mapping data |

## See also
- [../princetires-app/ARCHITECTURE.md](../princetires-app/ARCHITECTURE.md) — the backend app
- [../docs/PROJECT-STATE.md](../docs/PROJECT-STATE.md) — current build status
