# Automated Testing — princetires.ca

End-to-end, performance, accessibility, and broken-link tests for the **live**
Prince Tires storefront, built on a 100% free stack:

| Tool | Purpose |
| --- | --- |
| [Playwright](https://playwright.dev) | E2E tests (Chromium daily; Firefox/WebKit on demand) |
| [@axe-core/playwright](https://github.com/dequelabs/axe-core-npm) | Automated accessibility scans |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) via `scripts/lighthouse-budget.mjs` | Mobile performance budget (ratchet against `tests/perf-baseline.json`) |
| [GitHub Actions](https://docs.github.com/actions) | CI on push, PRs, and a daily schedule (`.github/workflows/tests.yml` on `main`) |

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
| `tests/contact-form.spec.ts` | Fills the contact form and checks it is valid (sends only with `SUBMIT_FORMS=1`) |
| `tests/quote-form.spec.ts` | `/pages/wheel-quote` and `/pages/wheel-package` render the package builder with priced packages (the old quote form was retired 2026-10-29) |
| `tests/quote-button.spec.ts` | The staff/wholesale "Send a quote" button never shows to the public |
| `tests/road-force-balancing.spec.ts` | Road force page, `?service=road_force_balancing` deep link, NE-only shop pin |
| `tests/road-hazard-addon.spec.ts` | Protection Plan add-on: brand-gated, price, nudge |
| `tests/drop-off.spec.ts` | "Drop off for the day" in the tire modal, cart and package builder; **every booking POST is mocked** and any other write to the app is aborted |
| `tests/accessibility.spec.ts` | axe-core on homepage, product, cart, checkout — report-only unless `A11Y_STRICT=1` |
| `tests/broken-links.spec.ts` | Crawls homepage links and asserts none return 4xx/5xx |
| `tests/helpers.ts` | Shared utilities (not a test file) |
| `scripts/lighthouse-budget.mjs` + `tests/perf-baseline.json` | Lighthouse mobile budget, run as its own CI job (see below) |

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

To enforce it in CI, add `A11Y_STRICT: '1'` to the `env:` block of the
`functional` job in `.github/workflows/tests.yml`.

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

The workflow lives on the **default branch (`main`)** — GitHub only runs
scheduled workflows from there. It has two independent jobs:

| Job | Runs | Browsers |
| --- | --- | --- |
| **Playwright** (functional) | push to `main`, every PR, daily 06:00 UTC, manual | Chromium (manual run: pick `all` for Firefox + WebKit too) |
| **Lighthouse budget** | the same triggers (manual: untick to skip) | Google Chrome, mobile emulation |

1. Go to the repo's **Actions** tab → **Live site checks (princetires.ca)**.
2. Open a run. The Lighthouse job writes its table to the run summary.
3. Download the **`playwright-report`** artifact and open `index.html` — or
   run `npx playwright show-report path/to/unzipped`. Lighthouse numbers are
   in the **`lighthouse-results`** artifact.

**Failure notifications:** for scheduled runs GitHub emails the person who
last changed the `cron:` line in `tests.yml` (Settings → Notifications →
Actions → "Only notify for failed workflows"). On a public repo GitHub pauses
scheduled workflows after 60 days with no commits; re-enable them from the
Actions tab if that happens.

---

## Performance budget (Lighthouse ratchet)

The old check (a fixed "performance ≥ 70") was red from day one — the home
page scores in the low 60s on mobile — so it was ignored. It is replaced by a
**ratchet**:

- `scripts/lighthouse-budget.mjs` audits 5 pages (home, a tire product,
  `/collections/tires`, `/pages/booking`, `/pages/contact`) **3 times each**
  with Lighthouse's default mobile settings (the same as PageSpeed Insights)
  and takes the **median** of every metric. One noisy run can't fail it.
- Each median is compared with `tests/perf-baseline.json`. The job fails only
  when a page got **worse than its baseline by more than the tolerance** in the
  same file (e.g. score −8, LCP +20 % / +0.5 s, CLS +0.05, HTML +10 %).
- The plan's targets (P3-1: LCP ≤ 2.5 s, CLS ≤ 0.05, TBT ≤ 200 ms; home
  LCP ≤ 4 s and HTML ≤ 900 KB for now) are in the same file under `goals`.
  They are shown as "met / not yet" and never fail the job.
- Every run writes `perf-results/baseline.candidate.json`: the baseline
  tightened to every metric that improved. Commit it to lock in a gain.

```bash
npm run perf                 # measure + compare (~15 min)
node scripts/lighthouse-budget.mjs --pages home,contact --runs 3
npm run perf:baseline        # re-measure and REPLACE the baseline
```

The baseline was first measured on a laptop. GitHub's runners are a different
machine, so if the first CI runs are red on TBT only, run the workflow by hand
with **write_baseline** ticked and commit the `perf-baseline.json` from the
`lighthouse-results` artifact. Lighthouse needs a real Google Chrome (set
`CHROME_PATH` to override); Playwright's Chrome for Testing paints nothing
under Lighthouse on macOS.

---

## Configuration

All settings live in `playwright.config.ts`:

- `baseURL`: `https://princetires.ca`
- `baseURL`: override with `PLAYWRIGHT_BASE_URL`
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

> CI also runs the suite (Chromium) automatically on every push/PR and daily at
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
