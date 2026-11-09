import { test, expect } from '@playwright/test';

/**
 * /pages/wheel-quote — formerly the wheel-quote contact form (form#WheelQuoteForm).
 *
 * Since the package builder launched (2026-10-29) this page renders the wheel +
 * tire package builder (.ptpb) instead of a form, and /pages/wheel-package is
 * the builder's own page. Old links to /pages/wheel-quote must keep landing on
 * a working builder, so this pins both URLs: the builder renders and picking a
 * vehicle returns priced packages from the app (GET app.princetires.ca/api/package/*).
 *
 * Read-only: it never opens the request dialog, so nothing is sent. (The
 * request path is covered, fully mocked, in drop-off.spec.ts.)
 */
test.describe('Wheel quote page (now the package builder)', () => {
  for (const path of ['/pages/wheel-quote', '/pages/wheel-package']) {
    test(`${path} shows the builder with priced packages`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'load' });
      expect(response?.status(), `${path} should exist`).toBeLessThan(400);

      const builder = page.locator('.ptpb').first();
      await expect(builder, 'package builder should render').toBeVisible({ timeout: 15_000 });
      // The retired form must not come back alongside the builder.
      await expect(page.locator('form#WheelQuoteForm')).toHaveCount(0);

      // Year / make / model / trim tiles.
      for (const tile of [/^\s*2020\s*$/, /^\s*Toyota\s*$/, /^\s*RAV4\s*$/, /^\s*LE\b/]) {
        const btn = page.locator('.ptpb button:visible', { hasText: tile }).first();
        await expect(btn, `tile ${tile} should be offered`).toBeVisible({ timeout: 15_000 });
        await btn.click();
      }

      await expect(page.locator('.ptpb__wcard').first(), 'wheel packages should load').toBeVisible({
        timeout: 20_000,
      });
    });
  }
});
