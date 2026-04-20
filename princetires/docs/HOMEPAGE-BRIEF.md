# Prince Tires — Homepage Build Brief

Use this document + the screenshots to build the homepage for the Prince Tires Shopify theme. Follow the CLAUDE.md instructions for Liquid architecture (sections, blocks, snippets, schema tags, translations, etc).

---

## Design Direction

Minimal. Clean. Black + white + red. No clutter. Lots of whitespace. Small type. Let the content breathe.

---

## Color Palette

- **Background (hero, nav, footer, CTA):** `#000000` (pure black)
- **Background (content sections):** `#FFFFFF` (white)
- **Accent:** `#DC2626` (red — used on "Tire Shop" text, search button, CTA buttons)
- **Text primary:** `#111111` (near-black, used on white sections)
- **Text secondary:** `#6B7280` (gray-500, subtitles/descriptions)
- **Text on dark:** `#FFFFFF` (white) and `#9CA3AF` (gray-400, nav links)
- **Borders:** `#404040` (neutral-700, on dark) / `#E5E7EB` (gray-200, on white)

---

## Typography

- Font: Inter (or system sans-serif)
- Hero heading: ~48px, bold, wide letter-spacing
- Section headings: ~24px, bold
- Body/descriptions: ~14px, regular
- Buttons/pills: ~12px, semibold, uppercase, tracked

---

## Page Sections (top to bottom)

### 1. Navigation (black)
- Centered P logo (white circle with black "P" letter)
- Nav links: About, Services, Brands, Wholesale (centered)
- Right side: user account icon + cart icon
- Minimal, no background effects

### 2. Hero Section (black background)
- NO purple glow (the earlier screenshot had it but the latest design removes it — keep it clean black)
- Centered heading: "Calgary's Trusted **Tire Shop**" (Tire Shop in red)
- Subtitle: "The right tires at the right price" (gray text)
- Search bar: rounded/pill shape, dark transparent background, light border, placeholder "e.g. 2025 Toyota RAV4 or 225/65R17"
- Red arrow button inside the search bar (right side)
- Three pill buttons below: "SHOP ALL TIRES", "SHOP ALL WHEEL", "CONTACT US" — uppercase, small, bordered pills with small icons
- Generous vertical padding (lots of space above and below)

### 3. Trust Strip (white background)
- Single row, four items evenly spaced:
  - Free tire Inspection
  - Price Match
  - Same-Day Service
  - Life-Time Tire Rotation
- Simple text only, no icons, minimal styling
- Light bottom border to separate from next section

### 4. Our Trusted Brands (white background)
- Heading: "OUR TRUSTED **BRANDS**" (BRANDS in red), bold, uppercase
- Subtitle: "Browse our Top Brands and their models"
- Row of brand logos: Toyo, BFGoodrich, Kumho, Pirelli, Continental, Goodyear, Yokohama, Toyoti (use actual brand names as text if no logos available)
- Below brands: 4-column product card grid
  - Each card: tire image (top), product info area (middle), red CTA button (bottom)
  - Cards have light border, clean white background
- Pagination dots below the cards (indicating a carousel/slider)

### 5. Additional sections to build (continuing below the fold)

#### Services Section (white background)
- Minimal layout, 4 columns
- Services: Installation, Rotation, Wholesale, Price Match
- Small icon + title + one-line description each

#### Testimonials (white background)
- 3 column grid
- Star ratings (red stars), quote text, customer name
- Clean, no card borders — just text

#### CTA Section (black background)
- "Need help finding the right tires?"
- Subtitle: "Our experts are ready to help"
- Two buttons: "Call us" (red, filled) and "Get a quote" (bordered/outline)

#### Footer (black background)
- 4 columns: Brand info, Shop links, Company links, Contact info
- Minimal text, small font sizes
- Copyright bar at bottom

---

## Technical Notes for Claude Code

- Build each major section as a Shopify **section** (`.liquid` file in `sections/`)
- Use **blocks** for repeatable items (brand logos, product cards, testimonials, service items)
- Use **snippets** for reusable elements (search bar, pill buttons, star rating)
- All user-facing text must use translation keys (`{{ 'key' | t }}`) — update `locales/en.default.json`
- Use `{% stylesheet %}` tags for CSS within each section/block/snippet (no external CSS files)
- Use `{% schema %}` tags to make sections customizable in the theme editor
- Follow the CLAUDE.md architecture guidelines exactly
- The vehicle JSON data files (2001–2026) are in the project root — these will be used later for the search functionality, not needed for this initial build

---

## Reference Files

- `princetires-homepage.jsx` — React prototype with similar structure (for reference only, build in Liquid)
- `CLAUDE.md` — Theme architecture rules (MUST follow)
- Screenshots provided in this conversation show the exact design
