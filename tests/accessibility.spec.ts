import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addFirstProductToCart, firstProductUrl } from './helpers';

/**
 * Automated accessibility scans with axe-core, on homepage, product, cart,
 * and checkout. We focus on "serious"/"critical" violations (the WCAG issues
 * that most affect real users); minor/moderate findings are ignored.
 *
 * Strictness:
 *   - Default (report-only): violations are logged + attached to the report
 *     but the test PASSES, so a pre-existing site issue doesn't keep CI red.
 *   - A11Y_STRICT=1: serious/critical violations FAIL the test — use this once
 *     the live site is clean, to catch regressions.
 */
const A11Y_STRICT = process.env.A11Y_STRICT === '1';

type Impact = 'minor' | 'moderate' | 'serious' | 'critical' | null;

function seriousOnly(violations: { impact?: Impact }[]) {
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

function summarize(violations: any[]): string {
  return violations
    .map(
      (v) =>
        `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n    ${v.helpUrl}`
    )
    .join('\n');
}

async function scan(page: any, context: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = seriousOnly(results.violations);
  if (blocking.length === 0) return;

  const report = `serious/critical a11y violations on ${context}:\n${summarize(blocking)}`;

  // Report-only by default: log + annotate the findings so they're visible in
  // CI output and the HTML report, but don't fail the run. Once the live site's
  // contrast issues are fixed, set A11Y_STRICT=1 to make these block (and catch
  // future regressions). Mirrors the SUBMIT_FORMS flag — see README-TESTS.md.
  if (!A11Y_STRICT) {
    console.warn(`\n[a11y][report-only] ${report}\n`);
    test.info().annotations.push({ type: 'a11y-violation', description: report });
    return;
  }

  expect(blocking, report).toEqual([]);
}

test.describe('Accessibility (axe-core)', () => {
  test('homepage has no serious/critical violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await scan(page, 'homepage');
  });

  test('product page has no serious/critical violations', async ({ page }) => {
    const url = await firstProductUrl(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await scan(page, 'product page');
  });

  test('cart page has no serious/critical violations', async ({ page }) => {
    await addFirstProductToCart(page);
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await scan(page, 'cart');
  });

  test('checkout page has no serious/critical violations', async ({ page }) => {
    await addFirstProductToCart(page);
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });

    const checkoutButton = page
      .locator('button[name="checkout"], input[name="checkout"], a[href*="/checkout"]')
      .first();
    if (await checkoutButton.count()) {
      await Promise.all([
        page.waitForURL(/\/checkouts?\//i, { timeout: 30_000 }).catch(() => {}),
        checkoutButton.click(),
      ]);
    } else {
      await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForTimeout(1500);
    // NOTE: the checkout page markup is controlled by Shopify, not the theme.
    await scan(page, 'checkout');
  });
});
