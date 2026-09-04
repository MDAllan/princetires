# Automated Testing — princetires.ca

End-to-end, performance, accessibility, and broken-link tests for the **live**
Prince Tires storefront, built on a 100% free stack:

| Tool | Purpose |
| --- | --- |
| [Playwright](https://playwright.dev) | E2E tests across Chromium, Firefox, WebKit |
| [@axe-core/playwright](https://github.com/dequelabs/axe-core-npm) | Automated accessibility scans |
| [playwright-lighthouse](https://github.com/abhinaba-ghosh/playwright-lighthouse) + [lighthouse](https://github.com/GoogleChrome/lighthouse) | Performance & a11y scoring |
| [GitHub Actions](https://docs.github.com/actions) | CI on push, PRs, and a daily schedule |

> These tests run against **production** (`https://princetires.ca`). They are
> read-only smoke tests. **The checkout test always stops before payment**, and
> **no real credit-card data exists anywhere in this repo.**

---

## What's covered

| File | What it checks |
| --- | --- |
| `tests/homepage.spec.ts` | Loads, title, no console errors, key nav links present |
| `tests/product-search.spec.ts` | Searching "tire" returns product results |
| `tests/checkout-flow.spec.ts` | Product → add to cart → cart → checkout page loads (**stops before payment**) |
| `tests/contact-form.spec.ts` | Fills the contact form and verifies it submits |
| `tests/quote-form.spec.ts` | Fills the wheel-quote form and verifies it submits |
| `tests/performance.spec.ts` | Lighthouse on homepage, product, contact — performance ≥ 70, accessibility ≥ 90 |
| `tests/accessibility.spec.ts` | axe-core on homepage, product, cart, checkout — fails on serious/critical |
| `tests/broken-links.spec.ts` | Crawls homepage links and asserts none return 4xx/5xx |
| `tests/helpers.ts` | Shared utilities (not a test file) |

---

## Running tests locally

First-time setup (installs the browser binaries):

```bash
npm ci
npx playwright install
```

Run the **full suite** (all three browsers):

```bash
npx playwright test
```

Run a **single test file**:

```bash
npx playwright test tests/checkout-flow.spec.ts
```

Run in **one browser only** (faster while iterating):

```bash
npx playwright test --project=chromium
```

Run in **headed / UI mode** (watch it happen, great for debugging):

```bash
npx playwright test --headed
npx playwright test --ui
```

Run a single test by **name**:

```bash
npx playwright test -g "no console errors"
```

---

## Forms: real submit vs. safe mode

The contact and quote tests **fill and validate the forms but do _not_ send a
real submission by default** — this keeps the daily CI run from emailing the
store every morning.

To perform a true end-to-end submission (sends a real email to the store):

```bash
SUBMIT_FORMS=1 npx playwright test tests/contact-form.spec.ts tests/quote-form.spec.ts
```

---

## Accessibility: report-only vs. strict

`tests/accessibility.spec.ts` scans for serious/critical axe-core violations.
By default it runs **report-only** — it logs and attaches any findings to the
report but **passes**, so a pre-existing site issue doesn't keep CI permanently
red. The live site currently has `color-contrast` violations that show up here.

Once the contrast is fixed, make these violations **fail** the build (to catch
future regressions):

```bash
A11Y_STRICT=1 npx playwright test tests/accessibility.spec.ts
```

To enforce it in CI, add `A11Y_STRICT: '1'` to the `env:` block in
`.github/workflows/tests.yml`.

---

## Viewing the HTML report

After any run, open the report:

```bash
npx playwright show-report
```

It includes traces (on first retry), screenshots (on failure), and videos (on
failure) for every test.

---

## Viewing results on GitHub

1. Push to `main`/`master` or open a pull request (the workflow also runs daily
   at **06:00 UTC** and can be triggered manually).
2. Go to the repo's **Actions** tab → **Playwright Tests (princetires.ca)**.
3. Open a run to see pass/fail per browser.
4. Download the **`playwright-report`** artifact (bottom of the run page) and
   open `index.html` locally — or run `npx playwright show-report path/to/unzipped`.

**Failure notifications:** GitHub automatically emails the commit author and
repo watchers when a run fails (no extra setup). Manage this under your GitHub
**Settings → Notifications → Actions**.

---

## Configuration

All settings live in `playwright.config.ts`:

- `baseURL`: `https://princetires.ca`
- Projects: `chromium`, `firefox`, `webkit`
- Retries: **2 on CI**, **0 locally**
- Reporters: HTML + list
- Trace on first retry, screenshot on failure, video on failure

---

## ✅ Run the tests after every new feature

**Whenever you build or change a customer-facing feature (theme section,
template, checkout/cart, forms, search, navigation), run the suite before you
consider the work done.** This catches regressions on the live site early.

Quick checklist:

1. **Smoke-check fast** (one browser, ~1 min):
   ```bash
   npm run test:chromium
   ```
2. **If the feature touches a flow already covered, run that file directly:**
   ```bash
   npx playwright test tests/checkout-flow.spec.ts   # cart/checkout changes
   npx playwright test tests/product-search.spec.ts  # search changes
   npx playwright test tests/contact-form.spec.ts    # form changes
   ```
3. **Before merging / pushing**, run the full cross-browser suite:
   ```bash
   npm test
   ```
4. **Add a test for the new feature** (see below) so it's covered going forward.
5. Open the report if anything failed: `npm run test:report`.

> CI also runs the whole suite automatically on every push/PR and daily at
> 06:00 UTC — but running locally first means you catch breakage before it ships.

---

## Adding new tests

1. Create a file in `tests/` ending in `.spec.ts`.
2. Start from this skeleton:

   ```ts
   import { test, expect } from '@playwright/test';

   test.describe('My feature', () => {
     test('does the thing', async ({ page }) => {
       await page.goto('/some-path'); // resolved against baseURL
       await expect(page.getByRole('heading', { name: /hello/i })).toBeVisible();
     });
   });
   ```

3. Prefer **role/label/text** selectors (`getByRole`, `getByLabel`, `getByText`)
   over brittle CSS classes — they survive theme tweaks.
4. Reuse helpers from `tests/helpers.ts` (e.g. `addFirstProductToCart`,
   `firstProductUrl`, `collectConsoleErrors`).
5. Run it: `npx playwright test tests/my-feature.spec.ts`.

> Tip: generate selectors interactively with `npx playwright codegen https://princetires.ca`.
