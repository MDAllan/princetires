# Services Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/pages/services` as one canonical, conversion-led, content-backed services hub and redirect the two duplicate services pages into it.

**Architecture:** A new JSON page template (`templates/page.services.json`) stacks 11 theme sections. Six are reused as-is, one (`pt-all-services`) is rebuilt for deep-linked booking, two are new (`pt-services-hero`, `pt-free-gift`), and one snippet emits `Service` + `BreadcrumbList` JSON-LD. Two 301 redirects and the page's SEO metadata are applied via the Shopify Admin API.

**Tech Stack:** Shopify Liquid (sections/blocks/snippets, `{% schema %}`), JSON templates, Shopify Admin GraphQL API (`2026-04`), Node one-off scripts run with `node --env-file`.

**Design spec:** `princetires/docs/services-page-redesign-spec-2026-05-18.md`

---

## Conventions for every task

- Theme files live under `princetires/` (the Shopify theme). Run theme validation with the `shopify-dev-mcp` `validate_theme` tool, or `shopify theme check` from inside `princetires/`.
- Admin API scripts run from `princetires-app/`: `node --env-file=.env.local <script>` (Node 25+, native fetch). Store: `prince-tires-5560.myshopify.com`.
- Validate every GraphQL operation with the `shopify-dev-mcp` `validate_graphql_codeblocks` tool before running it.
- Constraints (from the spec): no emoji anywhere; monochrome inline SVG icons only; "every major brand" not "wholesale prices"; no "lifetime rotation" claim; never name surrounding towns; brand colors black / white / red `#dc2626`, fonts Barlow Condensed (display) + Outfit (body).
- Commit after each task with the message shown in its final step.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `princetires/sections/pt-services-hero.liquid` | Create | Section 1 — black hero: H1, value prop, rating, Book + Call CTAs; renders the schema snippet |
| `princetires/sections/pt-free-gift.liquid` | Create | Section 7 — free branded-gift callout |
| `princetires/snippets/pt-services-schema.liquid` | Create | `Service` + `BreadcrumbList` JSON-LD for the services page |
| `princetires/sections/pt-all-services.liquid` | Modify | Section 4 — service grid rebuilt with deep-linked Book buttons, prices, Book/Shop block types |
| `princetires/templates/page.services.json` | Create | The page template — stacks all 11 sections with default content |
| `/tmp/services-redirects.mjs` | Create | One-off: creates the two 301 redirects |
| `/tmp/services-page-update.mjs` | Create | One-off: sets the page template suffix + SEO title/meta |

Reused unchanged (configured via `page.services.json` only): `trust-strip`, `trusted-brands`, `about-process`, `multicolumn`, `testimonials`, `faq`, `cta-banner`, `pt-contact-editorial`.

---

## Task 1: Create the 301 redirects

Redirect the two duplicate services pages to the canonical one. Done first so the consolidation is live regardless of theme timing.

**Files:**
- Create: `/tmp/services-redirects.mjs`

- [ ] **Step 1: Validate the mutation**

Use the `shopify-dev-mcp` `validate_graphql_codeblocks` tool (api: `admin`) on:

```graphql
mutation CreateRedirect($redirect: UrlRedirectInput!) {
  urlRedirectCreate(urlRedirect: $redirect) {
    urlRedirect { id path target }
    userErrors { field message }
  }
}
```

Expected: VALID. If `UrlRedirectInput` / `urlRedirectCreate` differ, search the docs and adjust.

- [ ] **Step 2: Write the script**

Create `/tmp/services-redirects.mjs`:

```js
const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const version = process.env.SHOPIFY_API_VERSION ?? "2026-04";
const endpoint = `https://${domain}/admin/api/${version}/graphql.json`;

const MUTATION = `
  mutation CreateRedirect($redirect: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $redirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }
`;

const redirects = [
  { path: "/pages/all-services", target: "/pages/services" },
  { path: "/pages/services-overview", target: "/pages/services" },
];

let failed = 0;
for (const redirect of redirects) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: MUTATION, variables: { redirect } }),
  });
  const json = await res.json();
  const r = json.data?.urlRedirectCreate;
  if (json.errors || r?.userErrors?.length) {
    failed++;
    console.log(`FAIL ${redirect.path}:`, JSON.stringify(json.errors || r.userErrors));
  } else {
    console.log(`OK ${r.urlRedirect.path} -> ${r.urlRedirect.target}`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Run it**

Run: `cd princetires-app && node --env-file=.env.local /tmp/services-redirects.mjs`
Expected: `OK /pages/all-services -> /pages/services` and `OK /pages/services-overview -> /pages/services`.

- [ ] **Step 4: Verify**

Run: `curl -sI https://princetires.ca/pages/all-services | head -1`
Expected: `HTTP/2 301` (or 302). Repeat for `/pages/services-overview`.

- [ ] **Step 5: Commit** — no repo files changed (script is in `/tmp`); nothing to commit for this task. Note completion in the PR description instead.

---

## Task 2: Build the services hero section

**Files:**
- Create: `princetires/sections/pt-services-hero.liquid`

- [ ] **Step 1: Create the section file**

Create `princetires/sections/pt-services-hero.liquid`:

```liquid
{%- comment -%} PrinceTires - Services hub hero {%- endcomment -%}

<div class="ptsh">
  <div class="ptsh__inner">
    {%- if section.settings.eyebrow != blank -%}
      <span class="ptsh__eyebrow">{{ section.settings.eyebrow }}</span>
    {%- endif -%}
    <h1 class="ptsh__title">{{ section.settings.heading | default: page.title }}</h1>
    {%- if section.settings.subtitle != blank -%}
      <p class="ptsh__subtitle">{{ section.settings.subtitle }}</p>
    {%- endif -%}

    {%- if section.settings.rating != blank -%}
      <p class="ptsh__rating">
        <span class="ptsh__stars" aria-hidden="true">
          {%- for i in (1..5) -%}
            <svg viewBox="0 0 24 24" width="14" height="14" fill="#dc2626"><path d="M12 2l2.9 6 6.6.6-5 4.3 1.5 6.5L12 16.5 5.5 19.4 7 12.9 2 8.6l6.6-.6z"/></svg>
          {%- endfor -%}
        </span>
        <strong>{{ section.settings.rating }}</strong>
        {%- if section.settings.review_count != blank -%}
          <span class="ptsh__reviews">{{ section.settings.review_count }}</span>
        {%- endif -%}
      </p>
    {%- endif -%}

    <div class="ptsh__cta">
      <a href="{{ section.settings.book_url | default: '/pages/booking' }}" class="ptsh__btn ptsh__btn--primary">
        {{ section.settings.book_label | default: 'Book a Service' }}
      </a>
      {%- if section.settings.phone != blank -%}
        <a href="tel:{{ section.settings.phone | remove: ' ' | remove: '(' | remove: ')' | remove: '-' }}" class="ptsh__btn ptsh__btn--ghost">
          {{ section.settings.phone_label | default: 'Call' }} {{ section.settings.phone }}
        </a>
      {%- endif -%}
    </div>
  </div>
</div>

{%- render 'pt-services-schema' -%}

{% stylesheet %}
  .ptsh { background: #0e0e0e; padding: 6rem 0; }
  .ptsh__inner { max-width: 1100px; margin: 0 auto; padding: 0 2rem; text-align: center; }
  .ptsh__eyebrow { display: block; font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase; color: #dc2626; margin-bottom: 0.8rem; }
  .ptsh__title { font-family: 'Barlow Condensed', sans-serif; font-size: 4rem; font-weight: 700;
    line-height: 1.05; color: #fff; margin: 0 0 1rem; }
  .ptsh__subtitle { font-family: 'Outfit', sans-serif; font-size: 1.25rem; font-weight: 300;
    color: #9ca3af; max-width: 620px; margin: 0 auto 1.4rem; line-height: 1.6; }
  .ptsh__rating { font-family: 'Outfit', sans-serif; color: #9ca3af; font-size: 1rem; margin: 0 0 2rem; }
  .ptsh__rating strong { color: #fff; }
  .ptsh__stars { display: inline-flex; gap: 1px; vertical-align: middle; margin-right: 0.4rem; }
  .ptsh__cta { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
  .ptsh__btn { font-family: 'Outfit', sans-serif; font-size: 1.05rem; font-weight: 600;
    padding: 0.95rem 2.2rem; border-radius: 8px; text-decoration: none; transition: all 0.2s; }
  .ptsh__btn--primary { background: #dc2626; color: #fff; }
  .ptsh__btn--primary:hover { background: #b91c1c; }
  .ptsh__btn--ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.25); }
  .ptsh__btn--ghost:hover { border-color: rgba(255,255,255,0.6); }
  @media (max-width: 749px) {
    .ptsh { padding: 4rem 0; }
    .ptsh__title { font-size: 2.8rem; }
    .ptsh__subtitle { font-size: 1.1rem; }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "Services hero",
  "tag": "section",
  "class": "section",
  "settings": [
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "Prince Tires - Calgary" },
    { "type": "text", "id": "heading", "label": "Heading (H1)", "info": "Defaults to the page title.", "default": "Tire Services in Calgary" },
    { "type": "textarea", "id": "subtitle", "label": "Subtitle", "default": "Winter changeovers, installs, flat repairs and more - booked online, done same-day at our SE Calgary shop." },
    { "type": "text", "id": "rating", "label": "Rating value", "default": "4.9" },
    { "type": "text", "id": "review_count", "label": "Review count text", "default": "562+ Google reviews" },
    { "type": "text", "id": "book_label", "label": "Book button label", "default": "Book a Service" },
    { "type": "url", "id": "book_url", "label": "Book button link", "info": "Defaults to /pages/booking." },
    { "type": "text", "id": "phone_label", "label": "Phone button label", "default": "Call" },
    { "type": "text", "id": "phone", "label": "Phone number", "default": "(403) 452-4283" }
  ],
  "presets": [{ "name": "Services hero" }]
}
{% endschema %}
```

- [ ] **Step 2: Validate the theme**

Use the `shopify-dev-mcp` `validate_theme` tool on `princetires/sections/pt-services-hero.liquid` (or run `shopify theme check` in `princetires/`).
Expected: no errors. The `{% render 'pt-services-schema' %}` will warn about a missing snippet until Task 4 — that is expected; resolve it by completing Task 4.

- [ ] **Step 3: Commit**

```bash
git add princetires/sections/pt-services-hero.liquid
git commit -m "feat(services): add services hub hero section"
```

---

## Task 3: Build the free-gift section

**Files:**
- Create: `princetires/sections/pt-free-gift.liquid`

- [ ] **Step 1: Create the section file**

Create `princetires/sections/pt-free-gift.liquid`. Gift items are blocks so the owner can edit the list in the theme editor.

```liquid
{%- comment -%} PrinceTires - Free gift callout {%- endcomment -%}

<div class="ptfg">
  <div class="ptfg__inner">
    {%- if section.settings.eyebrow != blank -%}
      <span class="ptfg__eyebrow">{{ section.settings.eyebrow }}</span>
    {%- endif -%}
    <h2 class="ptfg__title">{{ section.settings.heading }}</h2>
    {%- if section.settings.body != blank -%}
      <p class="ptfg__body">{{ section.settings.body }}</p>
    {%- endif -%}
    {%- if section.blocks.size > 0 -%}
      <ul class="ptfg__list">
        {%- for block in section.blocks -%}
          <li class="ptfg__item" {{ block.shopify_attributes }}>{{ block.settings.label }}</li>
        {%- endfor -%}
      </ul>
    {%- endif -%}
  </div>
</div>

{% stylesheet %}
  .ptfg { background: #fff; padding: 3rem 0; }
  .ptfg__inner { max-width: 1100px; margin: 0 auto; padding: 2.6rem 2rem; text-align: center;
    background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; }
  .ptfg__eyebrow { display: block; font-family: 'Outfit', sans-serif; font-size: 0.8rem; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase; color: #dc2626; margin-bottom: 0.6rem; }
  .ptfg__title { font-family: 'Barlow Condensed', sans-serif; font-size: 2.4rem; font-weight: 700;
    color: #111; margin: 0 0 0.6rem; }
  .ptfg__body { font-family: 'Outfit', sans-serif; font-size: 1.15rem; font-weight: 300; color: #6b7280;
    max-width: 560px; margin: 0 auto 1.2rem; line-height: 1.6; }
  .ptfg__list { list-style: none; display: flex; gap: 0.6rem; justify-content: center;
    flex-wrap: wrap; padding: 0; margin: 0; }
  .ptfg__item { font-family: 'Outfit', sans-serif; font-size: 0.95rem; font-weight: 600; color: #111;
    background: #fff; border: 1px solid #fecaca; border-radius: 999px; padding: 0.45rem 1rem; }
  @media (max-width: 749px) {
    .ptfg__inner { padding: 2rem 1.2rem; }
    .ptfg__title { font-size: 2rem; }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "Free gift",
  "tag": "section",
  "class": "section",
  "settings": [
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "No charge" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "A free gift with every visit" },
    { "type": "textarea", "id": "body", "label": "Body", "default": "Every customer drives off with a Prince Tires gift." }
  ],
  "blocks": [
    {
      "type": "gift",
      "name": "Gift item",
      "settings": [
        { "type": "text", "id": "label", "label": "Gift name", "default": "Branded air freshener" }
      ]
    }
  ],
  "presets": [{ "name": "Free gift" }]
}
{% endschema %}
```

- [ ] **Step 2: Validate the theme**

Use `validate_theme` on `princetires/sections/pt-free-gift.liquid`.
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add princetires/sections/pt-free-gift.liquid
git commit -m "feat(services): add free-gift callout section"
```

---

## Task 4: Build the services schema snippet

Emits `Service` + `BreadcrumbList` JSON-LD. **No `LocalBusiness`** (avoids deepening the site-wide schema conflict) and **no `FAQPage`** (`faq.liquid` already emits it).

**Files:**
- Create: `princetires/snippets/pt-services-schema.liquid`

- [ ] **Step 1: Create the snippet**

Create `princetires/snippets/pt-services-schema.liquid`:

```liquid
{% doc %}
  Emits Service + BreadcrumbList JSON-LD for the services hub page.
  No params. Render once, from the services hero section.
{% enddoc %}

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      "name": "Tire Services in Calgary",
      "serviceType": "Tire installation, seasonal changeover, wheel balancing, tire rotation, flat repair, TPMS service",
      "provider": {
        "@type": "AutoRepair",
        "name": "Prince Tires",
        "telephone": "+1-403-452-4283",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "111 42 Ave SW",
          "addressLocality": "Calgary",
          "addressRegion": "AB",
          "postalCode": "T2G 0A4",
          "addressCountry": "CA"
        }
      },
      "areaServed": { "@type": "City", "name": "Calgary" },
      "url": "{{ shop.url }}{{ page.url }}"
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "{{ shop.url }}/" },
        { "@type": "ListItem", "position": 2, "name": "{{ page.title | escape }}", "item": "{{ shop.url }}{{ page.url }}" }
      ]
    }
  ]
}
</script>
```

- [ ] **Step 2: Validate the theme**

Use `validate_theme` on the snippet and re-run it on `pt-services-hero.liquid` (the `{% render %}` warning from Task 2 should now be gone).
Expected: no errors.

- [ ] **Step 3: Sanity-check the JSON-LD**

After the page is live (Task 8), paste the rendered `<script type="application/ld+json">` into Google's Rich Results Test. For now, confirm the Liquid produces valid JSON by eye — no trailing commas, all braces balanced.

- [ ] **Step 4: Commit**

```bash
git add princetires/snippets/pt-services-schema.liquid
git commit -m "feat(services): add Service + BreadcrumbList JSON-LD snippet"
```

---

## Task 5: Rebuild the service grid section

Rebuild `pt-all-services.liquid` with two block types — `book_service` (deep-linked Book button + price + detail link) and `shop_link` (links to a collection). This fixes the booking deep-link bug.

**Files:**
- Modify: `princetires/sections/pt-all-services.liquid` (full rewrite)

- [ ] **Step 1: Rewrite the section**

Replace the entire contents of `princetires/sections/pt-all-services.liquid` with:

```liquid
{%- comment -%} PrinceTires - Service grid (book + shop) {%- endcomment -%}

{%- assign book_blocks = section.blocks | where: 'type', 'book_service' -%}
{%- assign shop_blocks = section.blocks | where: 'type', 'shop_link' -%}

<div class="ptsg">
  <div class="ptsg__container">
    <div class="ptsg__head">
      {%- if section.settings.eyebrow != blank -%}
        <span class="ptsg__eyebrow">{{ section.settings.eyebrow }}</span>
      {%- endif -%}
      <h2 class="ptsg__heading">{{ section.settings.heading }}</h2>
    </div>

    {%- if book_blocks.size > 0 -%}
      <p class="ptsg__group-label">{{ section.settings.book_group_label }}</p>
      <div class="ptsg__grid">
        {%- for block in book_blocks -%}
          <div class="ptsg__card" {{ block.shopify_attributes }}>
            <div class="ptsg__icon">{% render 'pt-service-icon', icon: block.settings.icon %}</div>
            <h3 class="ptsg__card-title">{{ block.settings.title }}</h3>
            <p class="ptsg__card-desc">{{ block.settings.description }}</p>
            {%- if block.settings.price != blank -%}
              <span class="ptsg__price">{{ block.settings.price }}</span>
            {%- endif -%}
            <div class="ptsg__actions">
              <a href="/pages/booking?service={{ block.settings.booking_slug }}" class="ptsg__btn">Book</a>
              {%- if block.settings.detail_url != blank -%}
                <a href="{{ block.settings.detail_url }}" class="ptsg__link">Learn more</a>
              {%- endif -%}
            </div>
          </div>
        {%- endfor -%}
      </div>
    {%- endif -%}

    {%- if shop_blocks.size > 0 -%}
      <p class="ptsg__group-label">{{ section.settings.shop_group_label }}</p>
      <div class="ptsg__grid ptsg__grid--shop">
        {%- for block in shop_blocks -%}
          <a href="{{ block.settings.shop_url }}" class="ptsg__card ptsg__card--shop" {{ block.shopify_attributes }}>
            <div class="ptsg__icon">{% render 'pt-service-icon', icon: block.settings.icon %}</div>
            <h3 class="ptsg__card-title">{{ block.settings.title }}</h3>
            <p class="ptsg__card-desc">{{ block.settings.description }}</p>
            <span class="ptsg__link">{{ block.settings.button_label | default: 'Shop' }}</span>
          </a>
        {%- endfor -%}
      </div>
    {%- endif -%}
  </div>
</div>

{% stylesheet %}
  .ptsg { background: #fff; padding: 4rem 0; }
  .ptsg__container { max-width: 1400px; margin: 0 auto; padding: 0 6rem; }
  .ptsg__head { margin-bottom: 2rem; }
  .ptsg__eyebrow { display: block; font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 600;
    letter-spacing: 0.12em; text-transform: uppercase; color: #dc2626; margin-bottom: 0.4rem; }
  .ptsg__heading { font-family: 'Barlow Condensed', sans-serif; font-size: 2.6rem; font-weight: 700;
    color: #111; margin: 0; line-height: 1.1; }
  .ptsg__group-label { font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; margin: 1.6rem 0 0.9rem; }
  .ptsg__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.4rem; }
  .ptsg__grid--shop { grid-template-columns: repeat(2, 1fr); }
  .ptsg__card { display: flex; flex-direction: column; padding: 1.8rem; background: #fafafa;
    border: 1px solid #e5e7eb; border-radius: 12px; text-decoration: none; color: inherit; }
  .ptsg__card--shop { transition: border-color 0.2s; }
  .ptsg__card--shop:hover { border-color: #dc2626; }
  .ptsg__icon { width: 3rem; height: 3rem; border-radius: 10px; background: #fef2f2; color: #dc2626;
    display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; }
  .ptsg__card-title { font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 600;
    color: #111; margin: 0 0 0.35rem; }
  .ptsg__card-desc { font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 300;
    color: #6b7280; margin: 0 0 0.8rem; line-height: 1.5; flex: 1; }
  .ptsg__price { align-self: flex-start; font-family: 'Outfit', sans-serif; font-size: 0.85rem;
    font-weight: 700; color: #dc2626; background: #fef2f2; border-radius: 6px; padding: 0.2rem 0.6rem;
    margin-bottom: 1rem; }
  .ptsg__actions { display: flex; align-items: center; gap: 1rem; }
  .ptsg__btn { font-family: 'Outfit', sans-serif; font-size: 0.95rem; font-weight: 600; color: #fff;
    background: #dc2626; border-radius: 7px; padding: 0.6rem 1.4rem; text-decoration: none; }
  .ptsg__btn:hover { background: #b91c1c; }
  .ptsg__link { font-family: 'Outfit', sans-serif; font-size: 0.95rem; font-weight: 600; color: #dc2626;
    text-decoration: none; }
  @media (max-width: 989px) {
    .ptsg__container { padding: 0 2rem; }
    .ptsg__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 749px) {
    .ptsg__grid, .ptsg__grid--shop { grid-template-columns: 1fr; }
    .ptsg__heading { font-size: 2.1rem; }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "Service grid",
  "tag": "section",
  "class": "section",
  "settings": [
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "What we do" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Pick a service, book online" },
    { "type": "text", "id": "book_group_label", "label": "Book group label", "default": "Book a service" },
    { "type": "text", "id": "shop_group_label", "label": "Shop group label", "default": "Shop" }
  ],
  "blocks": [
    {
      "type": "book_service",
      "name": "Bookable service",
      "settings": [
        { "type": "select", "id": "icon", "label": "Icon",
          "options": [
            { "value": "wrench", "label": "Wrench" },
            { "value": "seasonal", "label": "Seasonal" },
            { "value": "balance", "label": "Balance" },
            { "value": "rotation", "label": "Rotation" },
            { "value": "repair", "label": "Repair" },
            { "value": "sensor", "label": "Sensor" }
          ], "default": "wrench" },
        { "type": "text", "id": "title", "label": "Title", "default": "Service" },
        { "type": "text", "id": "description", "label": "Description", "default": "Service description." },
        { "type": "text", "id": "price", "label": "Price label", "info": "Leave blank to hide." },
        { "type": "select", "id": "booking_slug", "label": "Booking service slug",
          "info": "Must match the booking catalog exactly.",
          "options": [
            { "value": "installation_off", "label": "Tire Installation" },
            { "value": "installation_on", "label": "Seasonal Changeover" },
            { "value": "balancing", "label": "Wheel Balancing" },
            { "value": "rotation", "label": "Tire Rotation" },
            { "value": "flat_repair", "label": "Flat Repair" },
            { "value": "tpms", "label": "TPMS Service" }
          ], "default": "installation_off" },
        { "type": "url", "id": "detail_url", "label": "Full service page link" }
      ]
    },
    {
      "type": "shop_link",
      "name": "Shop tile",
      "settings": [
        { "type": "select", "id": "icon", "label": "Icon",
          "options": [
            { "value": "tire", "label": "Tire" },
            { "value": "wheel", "label": "Wheel" }
          ], "default": "tire" },
        { "type": "text", "id": "title", "label": "Title", "default": "Tires" },
        { "type": "text", "id": "description", "label": "Description", "default": "Every major brand, all sizes." },
        { "type": "url", "id": "shop_url", "label": "Collection link" },
        { "type": "text", "id": "button_label", "label": "Button label", "default": "Shop" }
      ]
    }
  ],
  "presets": [{ "name": "Service grid" }]
}
{% endschema %}
```

- [ ] **Step 2: Extract the icon snippet**

The old `pt-all-services.liquid` held the per-service SVG icons inline in a `{% case %}`. Move that `{% case %}` into a new snippet so both block types can use it. Create `princetires/snippets/pt-service-icon.liquid`:

```liquid
{% doc %}
  Renders a monochrome SVG service icon.
  @param {string} icon - one of: tire, wrench, balance, rotation, repair, sensor, seasonal, wheel
{% enddoc %}
{%- case icon -%}
  {%- when 'tire' -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/></svg>
  {%- when 'wrench' -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
  {%- when 'balance' -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6a1 1 0 011 1v4h2a1 1 0 110 2h-3a1 1 0 01-1-1V8a1 1 0 011-1z"/></svg>
  {%- when 'rotation' -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1 .25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
  {%- when 'repair' -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h10v2h2V3a2 2 0 00-2-2H7a2 2 0 00-2 2v4h2V5zM3 11v8a2 2 0 002 2h14a2 2 0 002-2v-8a2 2 0 00-2-2H5a2 2 0 00-2 2zm9 7a3 3 0 110-6 3 3 0 010 6z"/></svg>
  {%- when 'sensor' -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0012 4c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61z"/></svg>
  {%- when 'seasonal' -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 11h-4.17l3.24-3.24-1.41-1.42L15 11h-2V9l4.66-4.66-1.42-1.41L13 6.17V2h-2v4.17L7.76 2.93 6.34 4.34 11 9v2H9L4.34 6.34 2.93 7.76 6.17 11H2v2h4.17l-3.24 3.24 1.41 1.42L9 13h2v2l-4.66 4.66 1.42 1.41L11 17.83V22h2v-4.17l3.24 3.24 1.42-1.41L13 15v-2h2l4.66 4.66 1.41-1.42L17.83 13H22z"/></svg>
  {%- when 'wheel' -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg>
  {%- else -%}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>
{%- endcase -%}
```

- [ ] **Step 3: Validate the theme**

Use `validate_theme` on `pt-all-services.liquid` and `pt-service-icon.liquid`.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add princetires/sections/pt-all-services.liquid princetires/snippets/pt-service-icon.liquid
git commit -m "feat(services): rebuild service grid with deep-linked booking + prices"
```

---

## Task 6: Build the page template

Stack all 11 sections in `templates/page.services.json` with default content. Reused sections use their existing setting/block IDs — confirm each against the section's `{% schema %}` if a key is rejected by the theme editor.

**Files:**
- Create: `princetires/templates/page.services.json`

- [ ] **Step 1: Create the template**

Create `princetires/templates/page.services.json`. Section order: hero, trust-strip, trusted-brands, pt-all-services, multicolumn, about-process, pt-free-gift, testimonials, faq, pt-contact-editorial, cta-banner.

```json
{
  "sections": {
    "hero": { "type": "pt-services-hero", "settings": {} },
    "trust": { "type": "trust-strip", "blocks": {
      "b1": { "type": "trust_item", "settings": { "text": "4.9 - 562+ Google reviews" } },
      "b2": { "type": "trust_item", "settings": { "text": "Family-owned since 2021" } },
      "b3": { "type": "trust_item", "settings": { "text": "Price Match Guarantee" } },
      "b4": { "type": "trust_item", "settings": { "text": "Warranties included" } }
    }, "block_order": ["b1", "b2", "b3", "b4"], "settings": {} },
    "brands": { "type": "trusted-brands", "settings": { "heading": "We carry every major tire brand" } },
    "grid": { "type": "pt-all-services", "blocks": {
      "s1": { "type": "book_service", "settings": { "icon": "wrench", "title": "Tire Installation", "description": "Mount and balance loose tires.", "price": "", "booking_slug": "installation_off", "detail_url": "/pages/tire-installation-calgary" } },
      "s2": { "type": "book_service", "settings": { "icon": "seasonal", "title": "Seasonal Changeover", "description": "Winter and summer swap.", "price": "Flat, from $60", "booking_slug": "installation_on", "detail_url": "/pages/seasonal-tire-change-calgary" } },
      "s3": { "type": "book_service", "settings": { "icon": "balance", "title": "Wheel Balancing", "description": "Kill vibration, even out wear.", "price": "", "booking_slug": "balancing", "detail_url": "/pages/tire-balancing" } },
      "s4": { "type": "book_service", "settings": { "icon": "rotation", "title": "Tire Rotation", "description": "Even out tread wear.", "price": "", "booking_slug": "rotation", "detail_url": "/pages/tire-rotation" } },
      "s5": { "type": "book_service", "settings": { "icon": "repair", "title": "Flat Repair", "description": "Permanent internal patch.", "price": "$50 / tire", "booking_slug": "flat_repair", "detail_url": "/pages/tire-repair-calgary" } },
      "s6": { "type": "book_service", "settings": { "icon": "sensor", "title": "TPMS Service", "description": "Sensor diagnosis and service.", "price": "Sensors from $60", "booking_slug": "tpms", "detail_url": "/pages/tpms-service" } },
      "s7": { "type": "shop_link", "settings": { "icon": "tire", "title": "Tires", "description": "Every major brand, all sizes.", "shop_url": "/collections/tires", "button_label": "Shop tires" } },
      "s8": { "type": "shop_link", "settings": { "icon": "wheel", "title": "Wheels & Rims", "description": "XF, RTX, ENVY and more.", "shop_url": "/collections/wheels", "button_label": "Shop wheels" } }
    }, "block_order": ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"], "settings": {} },
    "why": { "type": "multicolumn", "settings": {} },
    "process": { "type": "about-process", "settings": {} },
    "gift": { "type": "pt-free-gift", "blocks": {
      "g1": { "type": "gift", "settings": { "label": "Branded air freshener" } },
      "g2": { "type": "gift", "settings": { "label": "Prince Tires lanyard" } }
    }, "block_order": ["g1", "g2"], "settings": {} },
    "reviews": { "type": "testimonials", "settings": {} },
    "faq": { "type": "faq", "settings": {} },
    "location": { "type": "pt-contact-editorial", "settings": {} },
    "cta": { "type": "cta-banner", "settings": { "heading": "Ready to book?", "subtitle": "Same-day service, 7 days a week, in SE Calgary." } }
  },
  "order": ["hero", "trust", "brands", "grid", "why", "process", "gift", "reviews", "faq", "location", "cta"]
}
```

- [ ] **Step 2: Reconcile reused-section settings**

For `trust-strip`, `trusted-brands`, `multicolumn`, `about-process`, `testimonials`, `faq`, `pt-contact-editorial`, `cta-banner`: open each section file and confirm the setting/block IDs used above exist. If a block type or setting ID differs (e.g. `trust-strip` uses `label` not `text`), correct the JSON. Leave `"settings": {}` where defaults are fine — the owner fills real content (the 7 FAQ questions, 3 reviews, why-us columns, brand logos, map) in the theme editor.

- [ ] **Step 3: Validate the theme**

Use `validate_theme` on `princetires/templates/page.services.json`.
Expected: no errors; every `type` resolves to an existing section.

- [ ] **Step 4: Commit**

```bash
git add princetires/templates/page.services.json
git commit -m "feat(services): add page.services.json template assembling the hub"
```

---

## Task 7: Point the page at the new template and set SEO

Reassign `/pages/services` to the `services` template and set its SEO title + meta description via the Admin API.

**Files:**
- Create: `/tmp/services-page-update.mjs`

- [ ] **Step 1: Find the page ID and validate the mutation**

Query the page ID:

```graphql
query { pages(first: 5, query: "handle:services") { nodes { id handle templateSuffix } } }
```

Then validate the update mutation with `validate_graphql_codeblocks` (api: `admin`):

```graphql
mutation UpdatePage($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) {
    page { id templateSuffix }
    userErrors { field message }
  }
}
```

Expected: VALID. If `pageUpdate` / `PageUpdateInput` / the `seo` field differ in `2026-04`, use `search_docs_chunks` to find the correct shape and adjust the script.

- [ ] **Step 2: Write the script**

Create `/tmp/services-page-update.mjs`:

```js
const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const version = process.env.SHOPIFY_API_VERSION ?? "2026-04";
const endpoint = `https://${domain}/admin/api/${version}/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const found = await gql(`query { pages(first: 5, query: "handle:services") { nodes { id handle } } }`);
const page = found.data.pages.nodes.find((p) => p.handle === "services");
if (!page) { console.log("FAIL: /pages/services not found"); process.exit(1); }

const MUTATION = `
  mutation UpdatePage($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id templateSuffix }
      userErrors { field message }
    }
  }
`;
const input = {
  templateSuffix: "services",
  title: "Tire Services",
  seo: {
    title: "Tire Services Calgary 2026 | Same-Day, Price Match | Prince Tires",
    description: "Book tire services in Calgary at Prince Tires - installs, seasonal changeovers, flat repair and TPMS. Same-day, price match, 4.9-star rated. Call (403) 452-4283."
  }
};
const out = await gql(MUTATION, { id: page.id, page: input });
const r = out.data?.pageUpdate;
if (out.errors || r?.userErrors?.length) {
  console.log("FAIL:", JSON.stringify(out.errors || r.userErrors));
  process.exit(1);
}
console.log(`OK: /pages/services -> template '${r.page.templateSuffix}', SEO set`);
```

- [ ] **Step 3: Run it (after the theme files are deployed/previewable)**

Run: `cd princetires-app && node --env-file=.env.local /tmp/services-page-update.mjs`
Expected: `OK: /pages/services -> template 'services', SEO set`.

- [ ] **Step 4: Commit** — no repo files changed; record completion in the PR description.

---

## Task 8: Validate and ship

- [ ] **Step 1: Full theme check**

Run `shopify theme check` in `princetires/` (or `validate_theme` over the changed files).
Expected: no errors introduced by this work.

- [ ] **Step 2: Verify booking deep-links**

On the rendered `/pages/services`, click each of the 6 Book buttons. Each must land on `/pages/booking?service=<slug>` and pre-select that service (not the generic Step-1 chooser). Slugs: `installation_off`, `installation_on`, `balancing`, `rotation`, `flat_repair`, `tpms`.

- [ ] **Step 3: Verify schema**

View source on `/pages/services`, copy each `application/ld+json` block into Google's Rich Results Test. Expected types: `Service`, `BreadcrumbList`, `FAQPage` (from `faq`), `Review`/`AggregateRating` (from `testimonials`), `HowTo` (from `about-process`). No `LocalBusiness` from this page. No JSON errors.

- [ ] **Step 4: Verify redirects**

Run: `curl -sI https://princetires.ca/pages/all-services | head -1` and `curl -sI https://princetires.ca/pages/services-overview | head -1`
Expected: `301` to `/pages/services`.

- [ ] **Step 5: Responsive check**

Load `/pages/services` at 375px, 768px, 1280px. Confirm the service grid collapses (3 → 2 → 1 columns), the hero scales, and nothing overflows.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(services): services hub redesign complete"
```

---

## Open items (owner-provided content — entered in the theme editor, not blockers for the build)

- Free-gift section: final branded-merch list (replace the `gift` block defaults).
- `testimonials`: 3 real Google review quotes; keep the rating count at 4.9 / 562 to stay consistent with other schema on the site.
- Service grid: exact price labels for Wheel Balancing and Tire Rotation (the `price` setting is blank by default — page works without them).
- `multicolumn` (why-us), `faq` (the 7 questions from the spec), `trusted-brands` logos, `pt-contact-editorial` map/address: populate in the theme editor.
