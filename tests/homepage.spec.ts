import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

/**
 * Homepage smoke test: loads, has the right title, no genuine console errors,
 * and the key navigation links are present.
 */
test.describe('Homepage', () => {
  test('loads with correct title and no console errors', async ({ page }) => {
    const getErrors = collectConsoleErrors(page);

    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status(), 'homepage should return 2xx').toBeLessThan(400);

    // Title check.
    await expect(page).toHaveTitle(/prince tires/i);

    // Let late scripts run, then assert no genuine console errors.
    await page.waitForLoadState('load');
    await page.waitForTimeout(1500);
    const errors = getErrors();
    expect(errors, `unexpected console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('key navigation links are present', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Each key destination should be linked at least once somewhere on the page
    // (header nav or footer). We assert presence in the DOM, not visibility,
    // because some links live inside a collapsed mobile menu.
    const expectedHrefs = [
      '/pages/about',
      '/pages/services',
      '/pages/brands',
      '/pages/wholesale',
      '/pages/booking',
    ];

    for (const href of expectedHrefs) {
      const link = page.locator(`a[href*="${href}"]`);
      await expect(
        link.first(),
        `expected a link to ${href}`
      ).toBeAttached();
    }

    // The search form should also be present.
    await expect(page.locator('form[action="/search"] input[name="q"]').first()).toBeAttached();
  });
});
