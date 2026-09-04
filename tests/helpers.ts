import { Page, expect } from '@playwright/test';

/**
 * Shared helpers for the Prince Tires live-site test suite.
 */

/** Set SUBMIT_FORMS=1 to have the contact/quote tests perform a REAL submit
 *  (which sends an actual email to the store). Off by default so the daily
 *  scheduled run does not spam the inbox — see README-TESTS.md. */
export const SHOULD_SUBMIT_FORMS = process.env.SUBMIT_FORMS === '1';

/**
 * Console / page-error noise we deliberately ignore. Live Shopify storefronts
 * always emit some third-party chatter (analytics, pixels, ad blockers, the
 * occasional 404 on an optional asset) that does not indicate a real bug.
 */
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /favicon/i,
  /ResizeObserver loop/i,
  /google|gtag|gtm|analytics|doubleclick|facebook|fbevents|tiktok|hotjar|clarity/i,
  /the server responded with a status of 4\d\d/i, // third-party asset 4xx
  /net::ERR_/i,
  /Failed to load resource/i,
  /preloaded using link preload/i,
  /Cookie .* has been rejected/i, // Firefox third-party cookie warnings (_fbp, _shopify_test)
  /partitioned cookie|cross-site|SameSite/i, // browser cookie-policy chatter
  // Transient cross-origin failures from the separate booking app subdomain
  // (app.princetires.ca/api/*). These are an app-integration concern, not a
  // storefront rendering bug — tracked/reported separately, not here.
  /app\.princetires\.ca/i,
  /Access-Control-Allow-Origin|access control checks|CORS/i,
  // Shopify's own Shop-app iframe being blocked by Shopify's own CSP
  // (frame-ancestors). Platform-generated, intermittent, outside theme control.
  /shop\.app.*Content Security Policy|Content Security Policy.*shop\.app/i,
];

/**
 * Attach console + page-error listeners and return a getter for the genuine
 * (non-ignored) errors collected so far.
 */
export function collectConsoleErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return;
    errors.push(`console.error: ${text}`);
  });
  page.on('pageerror', (err) => {
    const text = err.message;
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return;
    errors.push(`pageerror: ${text}`);
  });
  return () => errors;
}

/**
 * Find the URL of the first real product via the search results page.
 * Returns a clean /products/<handle> path.
 */
export async function firstProductUrl(page: Page): Promise<string> {
  await page.goto('/search?q=tire', { waitUntil: 'domcontentloaded' });
  const productLink = page.locator('a[href*="/products/"]').first();
  await expect(productLink).toBeVisible({ timeout: 15_000 });
  const href = await productLink.getAttribute('href');
  expect(href, 'expected a /products/ link on the search page').toBeTruthy();
  // Strip query params (?_pos=…&_sid=…) to get a stable product URL.
  return (href as string).split('?')[0];
}

/**
 * Open the first product and add it to the cart. Returns the product URL used.
 * Throws (failing the test) if no purchasable product / add-to-cart can be found.
 */
export async function addFirstProductToCart(page: Page): Promise<string> {
  const productUrl = await firstProductUrl(page);
  await page.goto(productUrl, { waitUntil: 'domcontentloaded' });

  // The Add-to-cart control varies by theme; try the common forms in order.
  const addButton = page
    .locator(
      'form[action*="/cart/add"] button[name="add"], ' +
        'form[action*="/cart/add"] [type="submit"], ' +
        'button[name="add"]'
    )
    .first();

  await expect(
    addButton,
    'no add-to-cart button found on the product page'
  ).toBeVisible({ timeout: 15_000 });
  await addButton.scrollIntoViewIfNeeded();
  await addButton.click();

  // Give the cart (drawer or page) a moment to register the line item.
  await page.waitForTimeout(2000);
  return productUrl;
}
