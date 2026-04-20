# Prompt for Claude Code — Build Prince Tires Homepage

Copy everything below the line and paste it into Claude Code in VS Code.

---

Build the complete homepage for my Prince Tires Shopify theme. Read the CLAUDE.md file first — it contains all the architecture rules you must follow. Also read HOMEPAGE-BRIEF.md for the full design spec.

## What to build

Build the homepage as Shopify Liquid sections, blocks, and snippets. The design is minimal — black hero, white content sections, red accents. Here is the exact section-by-section breakdown:

### Section 1: Hero (`sections/hero-banner.liquid`)

Black background (`#000`). No gradients, no glow — just clean black.

Layout (all centered):
- Heading: "Calgary's Trusted Tire Shop" — "Tire Shop" is red (`#DC2626`). Use wide letter-spacing. Font size ~48px, bold.
- Subtitle: "The right tires at the right price" — gray (`#6B7280`), ~16px
- Search bar: pill/rounded shape, transparent background with a subtle border (`#525252`). Placeholder text: "e.g. 2025 Toyota RAV4 or 225/65R17". Red arrow button (`#DC2626`) on the right inside the input.
- Three pill buttons below the search bar: "SHOP ALL TIRES", "SHOP ALL WHEEL", "CONTACT US" — uppercase, ~12px, semibold, letter-spacing, bordered pills with subtle border. Each has a small icon to the left of the text (tire icon, wheel icon, phone icon — use simple SVG or text).

Make the heading text, subtitle, search placeholder, and button labels all editable via schema settings. The pill buttons should be blocks so merchants can add/remove/reorder them.

### Section 2: Trust Strip (`sections/trust-strip.liquid`)

White background. Single horizontal row with four trust points:
- Free tire Inspection
- Price Match
- Same-Day Service
- Life-Time Tire Rotation

Each trust point should be a block with an editable text field. No icons — just text. Separated from the next section with a light bottom border (`#F3F4F6`).

### Section 3: Trusted Brands (`sections/trusted-brands.liquid`)

White background.

- Heading: "OUR TRUSTED BRANDS" — "BRANDS" in red. Bold, uppercase.
- Subtitle: "Browse our Top Brands and their models" — gray text
- Row of brand name pills/badges: Toyo, BFGoodrich, Kumho, Pirelli, Continental, Goodyear, Yokohama, Toyo Tires. Each brand should be a block with a text setting and optional image setting (for logo).
- Below the brands: a 4-column grid of product cards. Each card has:
  - Tire image area (top, gray background placeholder)
  - Product info area (middle, white)
  - Red CTA button (bottom, full-width within the card)
  - Light border around the entire card
- Product cards should be blocks with settings for: image, title, subtitle, button text, button URL.
- Add pagination dots below the grid (static for now, can be wired up later).

All headings and subtitles must use translation keys.

### Section 4: Services (`sections/services.liquid`)

White background. Heading: "Services". Subtitle: "Everything your vehicle needs".

4-column grid with these services (each as a block):
- Installation — "Professional mounting and balancing"
- Rotation — "Extend your tire lifespan"
- Wholesale — "Competitive pricing for dealers"
- Price match — "We'll beat any local price"

Each block: small icon (centered), title, one-line description below. Very minimal, lots of spacing.

### Section 5: Testimonials (`sections/testimonials.liquid`)

White background. Heading: "What customers say".

3-column grid. Each testimonial is a block with:
- Star rating (red filled stars)
- Quote text
- Customer name

No card borders — just clean text with spacing between columns.

### Section 6: CTA Banner (`sections/cta-banner.liquid`)

Black background. Centered layout:
- Heading: "Need help finding the right tires?" — white, bold
- Subtitle: "Our experts are ready to help" — gray
- Two buttons side by side: "Call us" (red filled, rounded) and "Get a quote" (white border/outline, rounded)

All text and button labels editable via schema.

### Section 7: Footer (`sections/footer.liquid`)

Black background. 4-column grid:
1. Brand — P logo + "Prince Tires" + short description + Calgary, Alberta
2. Shop links — All-Season, Winter, Performance, Truck & SUV, Wheels
3. Company links — About, Services, Wholesale, Brands, Contact
4. Contact — Phone, email, hours

Copyright bar at the bottom. All links and text editable via schema/blocks.

## CSS Rules

- Use `{% stylesheet %}` tags inside each section/block/snippet — no external CSS files
- Keep CSS minimal. Use CSS variables for spacing and colors
- Mobile responsive: stack columns on small screens
- Font: Inter via Google Fonts (add to layout), fallback to system sans-serif
- No animations or transitions — keep it fast and simple

## Translation Rules

- Every user-facing string must use `{{ 'key' | t }}`
- Update `locales/en.default.json` with all new keys
- Use hierarchical keys like `sections.hero.heading`, `sections.trust_strip.item_1`, etc.

## Important

- Do NOT build a layout file or navigation — I already have those
- Do NOT touch existing files unless necessary
- Follow every rule in CLAUDE.md exactly
- Keep the code clean and minimal, matching the minimal design
