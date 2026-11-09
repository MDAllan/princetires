import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for end-to-end testing of the LIVE
 * Prince Tires storefront (https://princetires.ca).
 *
 * These tests run against the production site — they are read-only smoke
 * tests and never submit a payment. See README-TESTS.md for details.
 *
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',

  /* Run tests in files in parallel. */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only (2 retries); no retries locally. */
  retries: process.env.CI ? 2 : 0,

  /* Limit workers on CI to keep load on the live site gentle. */
  workers: process.env.CI ? 2 : undefined,

  /* HTML report — generated for every run, served via `npx playwright show-report`. */
  reporter: [['html', { open: 'never' }], ['list']],

  /* Shared settings for all projects. https://playwright.dev/docs/api/class-testoptions */
  use: {
    /* All page.goto('/...') calls are resolved against this base URL. */
    baseURL: 'https://princetires.ca',

    /* Capture a trace on the first retry of a failing test. */
    trace: 'on-first-retry',

    /* Screenshot only when a test fails. */
    screenshot: 'only-on-failure',

    /* Keep video only for failing tests. */
    video: 'retain-on-failure',

    /* Be patient with the occasional slow production page. */
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  /* Per-test timeout — Lighthouse runs can be slow, so give room. */
  timeout: 90_000,

  expect: {
    timeout: 10_000,
  },

  /* Configure projects for the three major browser engines. */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
