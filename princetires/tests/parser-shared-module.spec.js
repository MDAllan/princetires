// @ts-check
/**
 * Verify that window.PTTireParse is loaded on the live site and that
 * parseSize correctly handles all canonical input formats.
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  // Wait until PTTireParse is available (deferred script is ready by DOMContentLoaded,
  // but add a short poll as a safety net for slow CDN edge nodes).
  await page.waitForFunction(() => typeof window.PTTireParse !== 'undefined', { timeout: 15000 });
});

test('PTTireParse module is exposed on window', async ({ page }) => {
  const version = await page.evaluate(() => window.PTTireParse.version);
  expect(version).toBe(1);
});

test('225/65R17 → metric 225/65/17', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('225/65R17'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('225');
  expect(result.profile).toBe('65');
  expect(result.rim).toBe('17');
  expect(result.flotation).toBe(false);
  expect(result.canonical).toBe('225/65R17');
});

test('35X12.50R20 → flotation 35/12.50/20', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('35X12.50R20'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('35');
  expect(result.profile).toBe('12.50');
  expect(result.rim).toBe('20');
  expect(result.flotation).toBe(true);
  expect(result.canonical).toBe('35X12.50R20');
});

test('35x1250r20 (no dot) → flotation 35/12.50/20', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('35x1250r20'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('35');
  expect(result.profile).toBe('12.50');
  expect(result.rim).toBe('20');
  expect(result.flotation).toBe(true);
  expect(result.canonical).toBe('35X12.50R20');
});

test('33×12.50R20 (Unicode ×) → flotation 33/12.50/20', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('33×12.50R20'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('33');
  expect(result.profile).toBe('12.50');
  expect(result.rim).toBe('20');
  expect(result.flotation).toBe(true);
  expect(result.canonical).toBe('33X12.50R20');
});

test('30X9.50R15 → flotation 30/9.50/15', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('30X9.50R15'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('30');
  expect(result.profile).toBe('9.50');
  expect(result.rim).toBe('15');
  expect(result.flotation).toBe(true);
  expect(result.canonical).toBe('30X9.50R15');
});

test('35125020 (8-digit compact) → flotation 35/12.50/20', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('35125020'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('35');
  expect(result.profile).toBe('12.50');
  expect(result.rim).toBe('20');
  expect(result.flotation).toBe(true);
  expect(result.canonical).toBe('35X12.50R20');
});

test('"225 55 17" (spaced) → metric 225/55/17', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('225 55 17'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('225');
  expect(result.profile).toBe('55');
  expect(result.rim).toBe('17');
  expect(result.flotation).toBe(false);
  expect(result.canonical).toBe('225/55R17');
});

test('LT265/70R16 → metric 265/70/16', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('LT265/70R16'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('265');
  expect(result.profile).toBe('70');
  expect(result.rim).toBe('16');
  expect(result.flotation).toBe(false);
  expect(result.canonical).toBe('265/70R16');
});

test('145R12 (Euro-metric, no aspect) → 145/-/12', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('145R12'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('145');
  expect(result.profile).toBe('');
  expect(result.rim).toBe('12');
  expect(result.flotation).toBe(false);
  expect(result.canonical).toBe('145R12');
});

test('"2055515 cooper tires" (compact size embedded in text) → metric 205/55/15', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('2055515 cooper tires'));
  expect(result).not.toBeNull();
  expect(result.width).toBe('205');
  expect(result.profile).toBe('55');
  expect(result.rim).toBe('15');
  expect(result.flotation).toBe(false);
  expect(result.canonical).toBe('205/55R15');
});

test('"hello world" → null', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseSize('hello world'));
  expect(result).toBeNull();
});
