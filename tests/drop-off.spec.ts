import { test, expect, Page, Route } from '@playwright/test';

/**
 * Drop-off for the day (live site) — owner, 2026-10-29.
 *
 * Customers BUYING tires can choose "Drop off for the day" instead of picking
 * a time: they bring the car any time the shop is open and pick it up later.
 * Each shop takes a set number of drop-offs a day (Settings → Locations in the
 * app, default 5); a full day is refused with a 400, never a 409.
 *
 * Where the choice shows:
 *   - the product booking modal, opened from a tire's page or a collection
 *     card (both carry data-product-handle + a tire size), and the cart's
 *     "Book install" button
 *   - the package builder's install request dialog
 * Where it must NOT show: the service modal, the booking page, My Garage
 * (opens the modal with no product handle) and a bare wheel (no tire size).
 *
 * SAFE ON THE LIVE SITE: every POST to /api/book and /api/package/request is
 * intercepted in beforeEach and answered with a mocked 201 — nothing reaches
 * the app, no booking is created, no text or email goes out. Availability
 * calls that ask for drop_off=1 are answered with a fixed open (or full) day so
 * the result does not depend on how busy the shop is today.
 *
 * Pre-deploy check of the package builder only: set PT_THEME_ASSETS_DIR to a
 * folder holding assets/pt-package-builder.js and assets/pt-booking-core.js
 * and the live page loads those instead (the booking modal is inline Liquid
 * and can only be tested after the theme push).
 */

const APP = 'https://app.princetires.ca';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const DROP_INFO = /Bring your car any time we're open that day\. We'll text you when it's ready\./;
const DROP_DONE = /Bring your car any time we're open; we'll text you when it's ready\./;
const LONG_DAY = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]+ \d{1,2}/;

type Posted = { url: string; body: Record<string, unknown> };

/** Intercept every booking POST. Never lets one through. */
async function guardBookingPosts(page: Page): Promise<Posted[]> {
  const posted: Posted[] = [];
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() !== 'POST') return route.fallback();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* keep {} */ }
    posted.push({ url: req.url(), body });
    return route.fulfill({
      status: 201,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, id: 'playwright-mock', autoConfirmed: false, fitCheck: false }),
    });
  };
  await page.route(`${APP}/api/book**`, handler);
  await page.route(`${APP}/api/package/request**`, handler);
  return posted;
}

/** Answer drop_off=1 availability with an open day (or a full one). */
async function mockDropOffDay(page: Page, opts: { full?: boolean } = {}) {
  await page.route(`${APP}/api/availability**`, async (route) => {
    const url = route.request().url();
    if (!/[?&]drop_off=1\b/.test(url)) return route.fallback();
    let real: Record<string, unknown> = {};
    try {
      const res = await route.fetch();
      if (res.ok()) real = await res.json();
    } catch { /* synthetic below */ }
    const body = {
      ...real,
      booked: Array.isArray(real.booked) ? real.booked : [],
      allDayBlocked: false,
      blockedReason: null,
      dropOff: { cap: 5, taken: opts.full ? 5 : 1, full: !!opts.full },
    };
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

/** Swap in local theme assets (pre-deploy check). */
async function maybeUseLocalAssets(page: Page) {
  const dir = process.env.PT_THEME_ASSETS_DIR;
  if (!dir) return;
  for (const name of ['pt-package-builder.js', 'pt-booking-core.js']) {
    await page.route(new RegExp(`/assets/${name.replace('.', '\\.')}(\\?|$)`), (route) =>
      route.fulfill({ path: `${dir}/assets/${name}`, contentType: 'application/javascript' }),
    );
  }
}

const TIRE_BOOK_BTN = '.ptp__book-btn[data-product-handle]:not([disabled])';

/** A tire product page whose book button carries a handle and a tire size.
 *  The collection cards already name the handle and size, so this costs two
 *  page loads, not a crawl (Shopify rate-limits a crawl with a 429 page). */
async function gotoTireProduct(page: Page) {
  await page.goto('/collections/tires', { waitUntil: 'domcontentloaded' });
  const handles: string[] = await page
    .locator('.ptg__card-book[data-product-handle]:not([data-tire-size=""])')
    .evaluateAll((els) => Array.from(new Set(els.map((e) => (e as HTMLElement).dataset.productHandle || '').filter(Boolean))));
  for (const handle of handles.slice(0, 4)) {
    await page.goto(`/products/${handle}`, { waitUntil: 'domcontentloaded' });
    const btn = page.locator(TIRE_BOOK_BTN).first();
    if ((await btn.count()) === 0) continue;
    if (((await btn.getAttribute('data-tire-size')) || '').trim()) return btn;
  }
  throw new Error('no bookable tire product with a tire size found from /collections/tires');
}

/** Step 1 → step 2 of the product booking modal. */
async function continueToStep2(page: Page) {
  await expect(page.locator('#bk-overlay')).toBeVisible({ timeout: 15_000 });
  const keep = page.locator('#bk-oldtires input[value="keep"]');
  if (await keep.isVisible()) {
    await keep.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  await page.locator('#bk-step1-cta').click();
  // The one-time "protect your tires?" nudge on eligible brands.
  const skip = page.locator('#bk-nudge-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.locator('#bk-page-2')).toBeVisible();
}

/** Choose drop-off, then a day in NEXT week (never "today after closing"). */
async function chooseDropOffDay(page: Page) {
  await page.locator('#bk-visit-grid [data-visit="drop_off"]').click();
  await expect(page.locator('#bk-time-grid')).toBeHidden();
  await expect(page.locator('#bk-drop')).toContainText(DROP_INFO);
  await page.locator('#bk-next-week').click();
  const day = page.locator('.bk-day-card:not(.bk-day-card--past)').nth(1);
  const iso = await day.getAttribute('data-date');
  await day.click();
  return iso as string;
}

test.describe('Drop off for the day', () => {
  let posted: Posted[] = [];

  test.beforeEach(async ({ page }) => {
    posted = await guardBookingPosts(page);
    await maybeUseLocalAssets(page);
  });

  test('tire product page offers the choice, and the request carries waitOrDrop drop_off with no time', async ({ page }) => {
    await mockDropOffDay(page);
    const btn = await gotoTireProduct(page);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await continueToStep2(page);

    // Default is "Wait while we work" with the time grid showing.
    await expect(page.locator('#bk-visit')).toBeVisible();
    await expect(page.locator('#bk-visit-grid input[value="wait"]')).toBeChecked();
    await expect(page.locator('#bk-visit')).toContainText('Leave your car with us and pick it up later that day.');
    await expect(page.locator('#bk-time-grid')).toBeVisible();

    const iso = await chooseDropOffDay(page);
    await expect(page.locator('#bk-next-2')).toBeEnabled({ timeout: 15_000 });
    await expect(page.locator('#bk-hours-note')).toContainText(/^Open \d/);
    await page.locator('#bk-next-2').click();

    await expect(page.locator('#bk-summary')).toContainText(/Drop-off/);
    await page.locator('#bk-name').fill('Playwright Test');
    await page.locator('#bk-phone').fill('(403) 555-0123');
    await page.locator('#bk-email').fill('playwright@example.com');
    await page.locator('#bk-confirm-btn').click();

    await expect(page.locator('#bk-page-done')).toBeVisible({ timeout: 15_000 });
    expect(posted, 'exactly one (mocked) booking POST').toHaveLength(1);
    const body = posted[0].body;
    expect(posted[0].url).toContain('/api/book');
    expect(body.waitOrDrop).toBe('drop_off');
    expect(body.time ?? null, 'a drop-off sends no time').toBeNull();
    expect(body.date).toBe(iso);
    expect(String(body.productHandle || '')).not.toBe('');

    // Done card: still a request (no finality before the shop confirms).
    await expect(page.locator('#bk-done-title')).toHaveText('Request sent');
    const sub = page.locator('#bk-done-sub');
    await expect(sub).toContainText(/^Drop-off requested for /);
    await expect(sub).toContainText(LONG_DAY);
    await expect(sub).toContainText(DROP_DONE);
    await expect(sub).toContainText(/isn’t final until you hear from us/);
  });

  test('the mobile sticky Book button carries the same tire as the main one', async ({ page }) => {
    const btn = await gotoTireProduct(page);
    const sticky = page.locator('.ptp__sticky-book').first();
    await expect(sticky).toHaveCount(1);
    for (const attr of ['data-product-handle', 'data-variant-id', 'data-tire-size', 'data-supplier-tier']) {
      const v = await btn.getAttribute(attr);
      expect(v, `${attr} on the main Book button`).not.toBeNull();
      await expect(sticky).toHaveAttribute(attr, v as string);
    }
    expect(await sticky.getAttribute('data-product-handle')).not.toBe('');
  });

  test('a full day says so and cannot continue', async ({ page }) => {
    await mockDropOffDay(page, { full: true });
    const btn = await gotoTireProduct(page);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await continueToStep2(page);
    await chooseDropOffDay(page);
    await expect(page.locator('#bk-drop-msg')).toContainText(
      /^Drop-offs are full on [A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}\. Pick another day, or choose a time and wait\.$/,
      { timeout: 15_000 },
    );
    await expect(page.locator('#bk-next-2')).toBeDisabled();
    // Switching back to a timed visit brings the grid back.
    await page.locator('#bk-visit-grid [data-visit="wait"]').click();
    await expect(page.locator('#bk-time-grid')).toBeVisible();
    await expect(page.locator('#bk-drop')).toBeHidden();
    expect(posted).toHaveLength(0);
  });

  test('a collection card offers the choice', async ({ page }) => {
    await page.goto('/collections/tires', { waitUntil: 'domcontentloaded' });
    const card = page.locator('.ptg__card-book[data-product-handle]:not([data-tire-size=""])').first();
    await expect(card, 'a tire card with a Request install button').toBeVisible({ timeout: 15_000 });
    await card.click();
    await continueToStep2(page);
    await expect(page.locator('#bk-visit')).toBeVisible();
    await expect(page.locator('#bk-visit-grid [data-visit="drop_off"]')).toContainText('Drop off for the day');
  });

  test('My Garage (no product) and a bare wheel (no tire size) do not get the choice', async ({ page }) => {
    await gotoTireProduct(page);
    // Exactly how my-garage.js opens the modal: a vehicle name, no handle.
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.dataset.tireName = '2019 Toyota RAV4';
      b.dataset.tireSize = '225/65R17';
      b.dataset.tirePrice = '0';
      (window as unknown as { openBookingModal: (el: HTMLElement) => void }).openBookingModal(b);
    });
    await continueToStep2(page);
    await expect(page.locator('#bk-visit')).toBeHidden();
    await expect(page.locator('#bk-time-grid')).toBeVisible();
    await page.evaluate(() => (window as unknown as { closeBookingModal: () => void }).closeBookingModal());

    // A wheel: a real product handle but no tire size.
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.dataset.tireName = 'Test wheel';
      b.dataset.tireSize = '';
      b.dataset.tirePrice = '20000';
      b.dataset.productHandle = 'test-wheel';
      (window as unknown as { openBookingModal: (el: HTMLElement) => void }).openBookingModal(b);
    });
    await continueToStep2(page);
    await expect(page.locator('#bk-visit')).toBeHidden();
  });

  test('the service modal never offers drop-off', async ({ page }) => {
    // The service modal is in the layout on every page. Use a real trigger
    // when the page has one on screen, else open it the way they do.
    await page.goto('/pages/services', { waitUntil: 'domcontentloaded' });
    const trigger = page.locator('[data-book-service]:visible').first();
    if (await trigger.count()) {
      await trigger.click();
    } else {
      await page.waitForFunction(() => typeof (window as unknown as { openServiceModal?: unknown }).openServiceModal === 'function');
      await page.evaluate(() => {
        const b = document.createElement('button');
        b.dataset.serviceName = 'Tire rotation';
        (window as unknown as { openServiceModal: (el: HTMLElement) => void }).openServiceModal(b);
      });
    }
    const overlay = page.locator('#sb-overlay');
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay.locator('[name="bk-visit"]')).toHaveCount(0);
    await expect(overlay.getByText('Drop off for the day')).toHaveCount(0);
  });

  test('the booking page never offers drop-off, and sends tire buyers to the tire page', async ({ page }) => {
    await page.goto('/pages/booking', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-bp-path="buy"]').click();
    await expect(page.locator('#bp-buy')).toContainText(/press Book install on the tire's page to book\. You can drop your car off for the day there\./);

    await page.goto('/pages/booking?service=rotation', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#bp-next-1')).toBeEnabled({ timeout: 15_000 });
    await page.locator('#bp-next-1').click();
    // The tire modal (#bk-overlay) is on every page, closed; it offers drop-off only once opened
    // for a tire. What matters here is that nothing on the booking page itself shows it.
    await expect(page.getByText('Drop off for the day')).toBeHidden();
    await expect(page.locator('#bp-root [name="bk-visit"], main [name="bk-visit"]:not(#bk-overlay *)')).toHaveCount(0);
  });

  test('cart Book install carries the tire for the server and offers the choice', async ({ page }) => {
    // Puts one tire in THIS test's own cart (a throwaway browser context) —
    // nothing is ordered. The button only renders with a tire in the cart.
    const btn = await gotoTireProduct(page);
    const variantId = await btn.getAttribute('data-variant-id');
    const handle = await btn.getAttribute('data-product-handle');
    expect(variantId).toBeTruthy();
    const add = await page.request.post('/cart/add.js', { data: { id: Number(variantId), quantity: 1 } });
    test.skip(!add.ok(), `could not add the tire to the cart (HTTP ${add.status()})`);
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    const install = page.locator('.ptc__install-btn');
    await expect(install).toBeVisible({ timeout: 15_000 });
    await expect(install).toHaveAttribute('data-product-handle', handle as string);
    await expect(install).toHaveAttribute('data-variant-id', variantId as string);
    await expect(install).toHaveAttribute('data-from-cart', '1');
    await install.click();
    // The tires are already in the cart: no "Tires only" choice, so the
    // modal can never add a second set.
    await expect(page.locator('#bk-flow-grid')).toBeHidden();
    await expect(page.locator('#bk-flow-label')).toBeHidden();
    await continueToStep2(page);
    await expect(page.locator('#bk-visit')).toBeVisible();
  });

  test('package builder request dialog offers drop-off and sends no time', async ({ page }) => {
    await mockDropOffDay(page);
    await page.goto('/pages/wheel-package', { waitUntil: 'load' });
    const builder = page.locator('.ptpb').first();
    await expect(builder).toBeVisible({ timeout: 15_000 });
    for (const tile of [/^\s*2020\s*$/, /^\s*Toyota\s*$/, /^\s*RAV4\s*$/, /^\s*LE\b/]) {
      const t = page.locator('.ptpb button:visible', { hasText: tile }).first();
      await expect(t).toBeVisible({ timeout: 15_000 });
      await t.click();
    }
    await expect(page.locator('.ptpb__wcard').first()).toBeVisible({ timeout: 20_000 });
    // Pick the first wheel; the builder then settles a tire that fits.
    await page.locator('input[name="ptpb-wheel"]').first().evaluate((el: HTMLInputElement) => el.click());
    const request = page.locator('.ptpb [data-act="request"]:visible:not([disabled])').first();
    // Leaving the sensors off asks for an acknowledgement first.
    const ack = page.locator('#ptpb-ack');
    if (await ack.isVisible().catch(() => false)) await ack.check();
    await expect(request, 'Request install becomes available once a tire is settled').toBeVisible({ timeout: 25_000 });
    await request.click();

    const dlg = page.locator('dialog[open]').filter({ has: page.locator('#ptpb-dlg-title') });
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await expect(dlg.locator('#ptpb-visit-wait')).toBeChecked({ timeout: 20_000 });
    await expect(dlg).toContainText('Leave your car with us and pick it up later that day.');

    await dlg.locator('label:has(#ptpb-visit-drop_off)').click();
    await expect(dlg.locator('#ptpb-visit-drop_off')).toBeChecked();
    await expect(dlg.locator('.ptpb__slot')).toHaveCount(0);
    await expect(dlg.locator('#ptpb-r-drop')).toContainText(DROP_INFO, { timeout: 15_000 });
    // Wait for the day check (the mocked open day) before sending.
    await expect(dlg.locator('#ptpb-r-drop')).not.toContainText('Checking that day', { timeout: 20_000 });
    await expect(dlg.locator('#ptpb-r-time-err')).toBeHidden();

    await dlg.locator('#ptpb-r-name').fill('Playwright Test');
    await dlg.locator('#ptpb-r-phone').fill('403 555 0123');
    await dlg.locator('#ptpb-r-email').fill('playwright@example.com');
    await dlg.locator('button[type="submit"]').click();

    await expect(dlg.locator('.ptpb__done')).toBeVisible({ timeout: 15_000 });
    expect(posted).toHaveLength(1);
    expect(posted[0].url).toContain('/api/package/request');
    expect(posted[0].body.waitOrDrop).toBe('drop_off');
    expect('time' in posted[0].body, 'a drop-off request leaves time out').toBe(false);
    await expect(dlg.locator('.ptpb__done')).toContainText(/Drop-off requested for /);
    await expect(dlg.locator('.ptpb__done')).toContainText(LONG_DAY);
    await expect(dlg.locator('.ptpb__done')).toContainText(DROP_DONE);
    await expect(dlg.locator('.ptpb__done')).toContainText(/Request sent — we’ll confirm/);
  });
});
