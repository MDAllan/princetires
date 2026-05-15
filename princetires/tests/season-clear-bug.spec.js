// @ts-check
/**
 * Regression test for the "can't clear seasons" bug.
 *
 * Symptoms:
 *   1. Visit /collections/tires — auto-default applies All-Season + All-Weather (Mar-Sep)
 *   2. Click x on All-Season chip — navigates, but the next page load re-applies it
 *   3. Same for Winter (Oct-Feb)
 *
 * Fix: auto-default writes a sessionStorage marker so it only runs once per tab.
 *
 * Run: npx playwright test tests/season-clear-bug.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test.beforeEach(async ({ page, context }) => {
  // Each test starts with a clean sessionStorage so the auto-default is allowed
  // to fire on the very first visit.
  await context.clearCookies();
});

test('1. Auto-default fires on first visit (in-season month)', async ({ page }) => {
  // Land at the bare collection URL — should be redirected to a URL with seasonality params
  await page.goto(COLLECTION);
  // After redirect, URL should contain at least one seasonality param
  // (Winter in Oct-Feb, All-Season + All-Weather Mar-Sep)
  const url = page.url();
  expect(url).toMatch(/filter\.p\.m\.custom\.seasonality=/);
});

test('2. Auto-default does NOT re-fire after user clears a season', async ({ page }) => {
  // First visit — auto-default applies seasons
  await page.goto(COLLECTION);
  const firstUrl = page.url();
  expect(firstUrl).toMatch(/filter\.p\.m\.custom\.seasonality=/);

  // Now simulate "user clicked x on the season chip" — navigate to bare URL
  // (this is what the chip's href produces — it just strips the param).
  // The fix should NOT re-apply the season because the sessionStorage marker
  // was set on the first visit.
  await page.goto(COLLECTION);
  const secondUrl = page.url();
  expect(secondUrl).not.toMatch(/filter\.p\.m\.custom\.seasonality=/);
});

test('3. sessionStorage marker is set after first auto-default', async ({ page }) => {
  await page.goto(COLLECTION);
  // After auto-default has run (and possibly redirected), the marker should be set
  const marker = await page.evaluate(() => sessionStorage.getItem('ptg_auto_seeded_tires'));
  expect(marker).toBe('1');
});

test('4. Arriving with an explicit filter respects user intent + marks seeded', async ({ page }) => {
  // Land with a vendor filter (no seasonality)
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  // Auto-default should NOT apply seasonality, since hasUserFilter is true
  const url = page.url();
  expect(url).not.toMatch(/filter\.p\.m\.custom\.seasonality=/);
  expect(url).toContain('filter.p.vendor=Michelin');

  // Marker should now be set so a subsequent navigation to the bare URL doesn't auto-seed either
  const marker = await page.evaluate(() => sessionStorage.getItem('ptg_auto_seeded_tires'));
  expect(marker).toBe('1');

  await page.goto(COLLECTION);
  const url2 = page.url();
  expect(url2).not.toMatch(/filter\.p\.m\.custom\.seasonality=/);
});

test('5. Active filter chip x for All-Season removes it and it stays removed', async ({ page }) => {
  // Land on the collection (auto-default applies seasons)
  await page.goto(COLLECTION);
  const chipBar = page.locator('[data-active-filters-sidebar]');
  await expect(chipBar).toBeVisible();

  // Chips are rendered as <button class="ptg__active-tag" data-rk="..." data-rv="...">
  const allSeasonChip = chipBar.locator('button[data-rk="filter.p.m.custom.seasonality"][data-rv="All-Season"]');
  const count = await allSeasonChip.count();
  if (count === 0) {
    test.skip(true, 'Not in All-Season auto-default window');
  }

  await allSeasonChip.first().click();
  await page.waitForLoadState('domcontentloaded');
  const url = page.url();
  expect(url).not.toMatch(/seasonality=All-Season(?!-Weather)/);

  // Re-load the same URL — the auto-default must NOT re-add All-Season
  await page.goto(url);
  const reloaded = page.url();
  expect(reloaded).not.toMatch(/seasonality=All-Season(?!-Weather)/);
});
