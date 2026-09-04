import { test, expect } from '@playwright/test';
import { addFirstProductToCart } from './helpers';

/**
 * Checkout flow: open a product, add to cart, go to the cart, proceed to
 * checkout, and verify the checkout page loads.
 *
 * IMPORTANT: this test STOPS at the checkout information page. It never enters
 * payment details and never completes an order. No real purchase is made.
 */
test.describe('Checkout flow (stops before payment)', () => {
  test('add to cart → cart → checkout page loads', async ({ page }) => {
    // 1. Open a product and add it to the cart.
    await addFirstProductToCart(page);

    // 2. Go to the cart page directly (works whether or not a drawer opened).
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });

    // The cart should contain at least one line item (a link back to a product).
    await expect(
      page.locator('a[href*="/products/"]').first(),
      'cart should contain a line item'
    ).toBeVisible({ timeout: 15_000 });

    // 3. Proceed to checkout. The button is usually name="checkout" (Shopify
    //    standard); fall back to any control whose text says "Checkout".
    const checkoutButton = page
      .locator(
        'button[name="checkout"], input[name="checkout"], ' +
          'a[href*="/checkout"], [href="/checkout"]'
      )
      .first();

    if (await checkoutButton.count()) {
      await checkoutButton.scrollIntoViewIfNeeded();
      await Promise.all([
        page.waitForURL(/\/checkouts?\//i, { timeout: 30_000 }).catch(() => {}),
        checkoutButton.click(),
      ]);
    } else {
      // Last resort: navigate to the checkout endpoint directly.
      await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    }

    // 4. Verify we reached a checkout page — and STOP. We assert on the URL or
    //    on hallmark checkout content (contact/shipping), never touching payment.
    const onCheckoutUrl = /\/checkouts?\//i.test(page.url());
    const hasCheckoutContent = await page
      .getByText(/contact|shipping address|delivery|email/i)
      .first()
      .isVisible()
      .catch(() => false);

    expect(
      onCheckoutUrl || hasCheckoutContent,
      `expected to land on a checkout page; was at ${page.url()}`
    ).toBeTruthy();

    // Explicitly confirm we did NOT proceed to a completed-order/thank-you page.
    expect(page.url()).not.toMatch(/thank[_-]?you|orders\//i);
  });
});
