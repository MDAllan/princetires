# Prince Tires — Services Page Redesign · Design Spec

**Date:** 2026-05-18
**Status:** Approved design — ready for implementation planning
**Page:** `/pages/services` (princetires.ca)

---

## 1. Background

`/pages/services` is currently a thin, single-section page (hero + 8-card grid + dark CTA box). An audit found:

- **Booking CTAs are broken for intent** — all "Book" links point to plain `/pages/booking`, dropping customers on the installation-oriented pathway chooser instead of their service. Violates the `prince-tires-booking` deep-link rule.
- **No meta description**; weak H1 ("Our Services") and a title tag that ignores the brand template.
- **Three competing services pages exist:** `/pages/services` (`all-services` template), `/pages/all-services` (same template — near-duplicate), `/pages/services-overview` (`services` template) — keyword cannibalization.

SEO context (Ubersuggest, 2026-05-17/18): "tire services calgary" = 260 vol/mo, difficulty 42 — modest but winnable (Zee Tire ranks #5 for it on a DA-10 site; Prince is DA 11). The hub's real value is funnelling authority to the higher-volume service pages and earning AI-search/GEO citations. Competitors (Fountain Tire, Kal Tire, Big O, Discount Tire) all ship thin hubs with **no schema** — the opening.

## 2. Goal & scope

- **Scope (owner-chosen, option "B"):** Rebuild `/pages/services` as one canonical, conversion-led, content-backed services hub; 301-redirect `/pages/all-services` and `/pages/services-overview` into it.
- **Primary job (owner-chosen, option "C"):** Conversion-led, content-backed — booking-focused above the fold, content/SEO/GEO layer below.
- **Out of scope:** broader page-sprawl cleanup (duplicate brand pages, old `service`-template pages, junk pages); building/upgrading the individual service detail pages; a standalone merch/gifts page; fixing the existing site-wide LocalBusiness/review-count schema conflict (tracked in `code-review-2026-05-15.md`).

## 3. Constraints & decisions

- **No emojis anywhere** — page content, icons, and meta description. Icons are monochrome inline SVG (the theme's existing per-service icon set; owner will refine icons later — keep current set as default).
- **Differentiator messaging is "every major brand," not "wholesale prices."**
- **No "lifetime rotation" claim.**
- **Never list surrounding towns** (Airdrie, Okotoks, Cochrane, Chestermere, Strathmore, Carstairs, High River) as service areas — anywhere on the page, FAQ, meta, or schema. Calgary and Calgary neighbourhoods are fine.
- **Brand:** black / white / red (`#dc2626`), theme fonts Barlow Condensed (display) + Outfit (body), minimal, generous whitespace, near-flat surfaces.
- **Booking deep-link rule:** every "Book" CTA must carry `/pages/booking?service=<slug>`.

## 4. Page layout — 11 sections

| # | Section | Purpose | Source |
|---|---|---|---|
| 1 | Hero (black) | H1, value prop, 4.9★ + 562 reviews inline, Book + Call CTAs | New section (or adapt `about-hero`) |
| 2 | Trust strip | 4.9/562 reviews · family-owned 2021 · price match · warranties | Reuse `trust-strip.liquid` |
| 3 | Brand strip | "We carry every major tire brand" + brand logos | Reuse `trusted-brands.liquid` |
| 4 | Service grid | 6 bookable services + 2 shop tiles | **Rebuild `pt-all-services.liquid`** |
| 5 | Why Prince Tires | 4 differentiators + real shop/team photo | New (or `multicolumn` / `about-values`) |
| 6 | How booking works | 3-step visual | Reuse/adapt `about-process.liquid` |
| 7 | Free gift | Prince Tires branded merch (air fresheners, lanyards…) | New small section |
| 8 | Customer reviews | 3 real Google quotes + aggregate | Reuse `testimonials.liquid` |
| 9 | FAQ | 7 Q&As + FAQPage schema | Reuse `faq.liquid` (verify schema) |
| 10 | Location & hours | Map embed, address, hours, phone — no service-area towns | New small section (or `pt-contact-editorial`) |
| 11 | Final CTA (black) | "Ready to book?" + Book + Call | Reuse `cta-banner.liquid` |

Real shop/team photography is woven into sections 1, 5, and 6 — not its own section.

## 5. Content & SEO

- **URL:** `/pages/services` stays canonical.
- **H1:** `Tire Services in Calgary` (keyword-front; replaces "Our Services").
- **Title tag:** `Tire Services Calgary 2026 | Same-Day, Price Match | Prince Tires` (~58 chars).
- **Meta description (plain — no emoji, per constraint):** `Book tire services in Calgary at Prince Tires — installs, seasonal changeovers, flat repair and TPMS. Same-day, price match, 4.9-star rated. Call (403) 452-4283.`
  - Note: this diverges from sibling service pages that use ✔️ checkmarks in the meta; the no-emoji rule takes precedence.
- **Schema:** `Service` + `FAQPage` + `BreadcrumbList` JSON-LD via one snippet. **No new `LocalBusiness`** — avoids deepening the existing site-wide schema conflict.
- **Copy:** brand voice — plainspoken, second person, Calgary-specific, short paragraphs, no AI-tell words. ~700–900 words total across section intros + FAQ answers. Runs through the `prince-tires-content` quality checklist before ship.

### FAQ — 7 questions (drives FAQPage schema + AI citations)

1. How much do tire services cost in Calgary?
2. Do I need an appointment, or do you take walk-ins?
3. How long does a seasonal tire changeover take?
4. Can I book a tire service online?
5. Where is Prince Tires located, and what are your hours?
6. Do you service trucks and trailers too?
7. Do your tire services come with a warranty?

### Service grid — services, slugs, prices

| Card | Booking slug | Price shown |
|---|---|---|
| Tire Installation | `installation_off` | per tire, by vehicle (theme setting / catalog) |
| Seasonal Changeover | `installation_on` | flat, from $60 |
| Wheel Balancing | `balancing` | per wheel — **price TBD from owner** |
| Tire Rotation | `rotation` | flat rate — **price TBD from owner** |
| Flat Repair | `flat_repair` | $50 / tire |
| TPMS Service | `tpms` | sensors from $60 |
| Tires (shop tile) | — | links to `/collections/tires` |
| Wheels & Rims (shop tile) | — | links to `/collections/wheels` |

Each service card also links to its full detail page (e.g. `/pages/tire-repair-calgary`).

## 6. Build architecture

- **Template:** `templates/page.services.json` — a JSON template stacking the 11 sections in order. All sections keep their `{% schema %}` settings so the merchant can edit copy, prices, reviews, and order in the theme editor.
- **Reuse (6):** `trust-strip`, `trusted-brands`, `about-process`, `testimonials`, `faq`, `cta-banner`. Each verified against its current schema during planning; `faq.liquid` checked for FAQPage schema output (add if missing).
- **Rebuild (1):** `pt-all-services.liquid` → the service grid, with per-card deep-linked Book buttons, prices, and the Book/Shop grouping.
- **New or adapted (up to 4):** services hero, the Why-Prince-Tires section (likely the existing `multicolumn`), free-gift block, location/map block — each built only where no existing section fits cleanly; checked against the theme first during planning.
- **Booking wiring:** each Book button → `/pages/booking?service=<slug>` using the slugs in §5. Slugs verified against the booking catalog (`015-services.sql`).
- **Schema:** one snippet emitting `Service` + `FAQPage` + `BreadcrumbList`.
- **Redirects:** `/pages/all-services` and `/pages/services-overview` → 301 → `/pages/services`, created via the Shopify Admin API (`urlRedirectCreate`).
- **Liquid architecture:** follows the theme `CLAUDE.md` — sections/blocks/snippets, `{% schema %}`, `{% stylesheet %}`, translation keys in `locales/en.default.json`.

## 7. Open items (owner input needed before/during build)

- **Free-gift section (7):** full branded-merch list — owner sending.
- **Customer reviews (8):** 3 Google review quotes to feature (owner provides, or approve a pulled set).
- **Prices:** exact figures for Wheel Balancing and Tire Rotation.
- **FAQ schema:** confirm whether `faq.liquid` already emits FAQPage JSON-LD.

## 8. Testing & validation

- Shopify theme check / `validate_theme` before ship.
- Every Book deep-link resolves and pre-selects the correct booking pathway.
- Schema passes Google's Rich Results Test.
- The two redirects return 301 to `/pages/services`.
- Responsive check at mobile / tablet / desktop breakpoints.

## 9. Non-visible deliverables

- Two 301 redirects (§6).
- `Service` + `FAQPage` + `BreadcrumbList` schema (§5).
