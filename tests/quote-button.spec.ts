import { test, expect } from '@playwright/test';

/**
 * "Send a quote" button on the product page.
 *
 * The button (.ptp__quote-btn), the quote modal (#ptq-overlay) and the
 * window.openQuoteModal handler are gated to staff OR wholesale accounts
 * (`customer.tags contains 'staff'` / `customer.b2b?` / `wholesale`) in
 * sections/pt-product.liquid + snippets/pt-quote-modal.liquid. A logged-out
 * visitor — neither staff nor B2B — must NEVER see any of it, which is the
 * boundary this verifies. (The live suite can't hold a staff/B2B session, so
 * the authenticated send-path is covered by the princetires-app route tests.)
 *
 * This holds true both before and after deploy, so it's safe in the daily run.
 */
test.describe('Quote button (staff/wholesale gating)', () => {
  async function gotoFirstProduct(page: import('@playwright/test').Page) {
    const res = await page.goto('/collections/tires', { waitUntil: 'domcontentloaded' });
    expect(res?.status(), '/collections/tires should exist').toBeLessThan(400);
    const firstProduct = page.locator('a[href*="/products/"]').first();
    await expect(firstProduct, 'a product link should be present').toBeVisible();
    const href = await firstProduct.getAttribute('href');
    expect(href, 'product link should have an href').toBeTruthy();
    const pres = await page.goto(href as string, { waitUntil: 'domcontentloaded' });
    expect(pres?.status(), 'product page should load').toBeLessThan(400);
  }

  test('logged-out visitor sees no quote button, modal, or handler', async ({ page }) => {
    await gotoFirstProduct(page);

    // The primary CTA stack is present (sanity: we're on a real PDP).
    await expect(
      page.locator('.ptp__book-btn').first(),
      'Book installation CTA should render on the PDP',
    ).toBeVisible();

    // Staff-only affordances must be absent for an anonymous visitor.
    await expect(
      page.locator('.ptp__quote-btn'),
      'staff Send-a-quote button must be hidden from the public',
    ).toHaveCount(0);
    await expect(
      page.locator('#ptq-overlay'),
      'quote modal must not render for the public',
    ).toHaveCount(0);

    const hasHandler = await page.evaluate(
      () => typeof (window as unknown as { openQuoteModal?: unknown }).openQuoteModal,
    );
    expect(hasHandler, 'openQuoteModal must not be exposed to the public').toBe('undefined');
  });
});
