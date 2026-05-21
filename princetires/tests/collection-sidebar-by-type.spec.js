// @ts-check
/**
 * Verify that the collection-page sidebar adapts per collection:
 * - /collections/tires shows tire-only filters (Season, Tire type, Aspect
 *   ratio, Tire width, Stud, Run flat) and NOT wheel-only filters
 * - /collections/wheels shows wheel-only filters (Bolt pattern, Rim width,
 *   Offset, Center bore) and NOT tire-only filters
 * - Rim diameter + Brand stay shared on both
 *
 * Run: npx playwright test tests/collection-sidebar-by-type.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

// Helper: grab all visible filter-group labels (the <summary> in each <details>).
async function sidebarFilterLabels(page) {
  const labels = await page.locator('.ptg__sidebar .ptg__filter-label').allTextContents();
  return labels.map(s => s.trim()).filter(Boolean);
}

test('/collections/tires sidebar — tire filters present, wheel filters absent', async ({ page }) => {
  await page.goto(`${BASE}/collections/tires`);
  await page.locator('.ptg__sidebar').first().waitFor({ state: 'visible', timeout: 15000 });

  const labels = (await sidebarFilterLabels(page)).join(' | ').toLowerCase();

  // Tire-only must be present
  expect(labels).toMatch(/season/);
  expect(labels).toMatch(/tire type/);
  expect(labels).toMatch(/aspect ratio/);
  expect(labels).toMatch(/tire width/);

  // Wheel-only must NOT be present
  expect(labels).not.toMatch(/bolt pattern/);
  expect(labels).not.toMatch(/center bore/);
  expect(labels).not.toMatch(/\boffset\b/);

  // Shared filters still there
  expect(labels).toMatch(/brand/);
  expect(labels).toMatch(/rim diameter/);
});

test('/collections/wheels sidebar — wheel filters present, tire filters absent', async ({ page }) => {
  await page.goto(`${BASE}/collections/wheels`);
  await page.locator('.ptg__sidebar').first().waitFor({ state: 'visible', timeout: 15000 });

  const labels = (await sidebarFilterLabels(page)).join(' | ').toLowerCase();

  // Wheel-only must be present (data was bulk-filled today, so the fallback
  // scan picks them up even without the Search & Discovery admin toggle)
  expect(labels).toMatch(/bolt pattern/);
  expect(labels).toMatch(/rim width/);
  expect(labels).toMatch(/offset/);        // matches "Offset (ET)"
  expect(labels).toMatch(/center bore/);

  // Tire-only must NOT be present
  expect(labels).not.toMatch(/season/);
  expect(labels).not.toMatch(/tire type/);
  expect(labels).not.toMatch(/aspect ratio/);
  expect(labels).not.toMatch(/tire width/);
  expect(labels).not.toMatch(/run flat/);

  // Shared filters still there
  expect(labels).toMatch(/brand/);
  expect(labels).toMatch(/rim diameter/);
});

test('/collections/wheels Bolt pattern filter has real values from the catalog', async ({ page }) => {
  await page.goto(`${BASE}/collections/wheels`);
  await page.locator('.ptg__sidebar').first().waitFor({ state: 'visible', timeout: 15000 });

  // Find the Bolt pattern <details>
  const bolt = page.locator('.ptg__filter', { has: page.locator('.ptg__filter-label', { hasText: /bolt pattern/i }) }).first();
  await expect(bolt).toBeVisible();
  // Open it if collapsed
  await bolt.locator('summary').click().catch(() => {});

  // The audit confirmed 38/41 wheels have bolt_pattern — common values are
  // 5x114.3, 5x100, 5x112, 6x139.7, etc. Assert at least one well-known
  // value is rendered as a clickable link.
  const links = bolt.locator('.ptg__filter-link');
  const linkTexts = (await links.allTextContents()).join(' ');
  expect(linkTexts).toMatch(/5x114\.3/);
});

test('/collections/tires tire-size editor still renders (tire-only)', async ({ page }) => {
  await page.goto(`${BASE}/collections/tires`);
  await page.locator('.ptg__sidebar').first().waitFor({ state: 'visible', timeout: 15000 });
  await expect(page.locator('[data-size-display]').first()).toBeVisible();
});

test('/collections/wheels tire-size editor is NOT rendered', async ({ page }) => {
  await page.goto(`${BASE}/collections/wheels`);
  await page.locator('.ptg__sidebar').first().waitFor({ state: 'visible', timeout: 15000 });
  // Either the element isn't in the DOM, or it is but hidden — assert count 0
  await expect(page.locator('[data-size-display]')).toHaveCount(0);
});
