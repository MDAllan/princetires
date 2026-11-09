import { test, expect } from '@playwright/test';

/**
 * Product search: search for "tire" and verify results come back.
 */
test.describe('Product search', () => {
  test('searching "tire" returns product results', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Drive search via the URL the site's form actually targets (action="/search",
    // input name="q"). This avoids fighting the header's expand/collapse UI.
    await page.goto('/search?q=tire', { waitUntil: 'domcontentloaded' });

    // The results page reports a count in its title, e.g.
    // 'Search: 1002 results found for "tire" – Prince Tires'.
    await expect(page).toHaveTitle(/results found for|search/i);

    // At least one product card should link to a /products/ page.
    const productLinks = page.locator('a[href*="/products/"]');
    await expect(productLinks.first()).toBeVisible({ timeout: 15_000 });
    expect(await productLinks.count()).toBeGreaterThan(0);

    // And the query should be reflected back somewhere on the page.
    await expect(page.locator('body')).toContainText(/tire/i);
  });

  test('search box on the homepage submits to the results page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const input = page.locator('form[action="/search"] input[name="q"]').first();
    await expect(input).toBeAttached();

    // The header search input lives inside a collapsed panel and isn't visible
    // until toggled, so set its value and submit the form via the DOM directly.
    await input.evaluate((el: HTMLInputElement) => {
      el.value = 'tire';
      el.form?.submit();
    });

    await page.waitForURL(/\/search\?.*q=tire/i, { timeout: 20_000 });
    await expect(page.locator('a[href*="/products/"]').first()).toBeVisible({ timeout: 15_000 });
  });
});
