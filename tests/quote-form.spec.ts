import { test, expect } from '@playwright/test';
import { SHOULD_SUBMIT_FORMS } from './helpers';

/**
 * Wheel quote request form (/pages/wheel-quote, form#WheelQuoteForm).
 *
 * Required text fields: contact[Name] (#WheelQuote-name),
 * contact[email] (#WheelQuote-email). Optional: contact[Phone] (#WheelQuote-phone),
 * vehicle year/make/model, and several wheel-spec <select> dropdowns.
 *
 * Like the contact test, this FILLS + validates by default and only performs a
 * real submission when SUBMIT_FORMS=1.
 */
test.describe('Quote form (wheel quote request)', () => {
  test('fills and submits the wheel-quote form', async ({ page }) => {
    const response = await page.goto('/pages/wheel-quote', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status(), 'wheel-quote page should exist').toBeLessThan(400);

    const form = page.locator('form#WheelQuoteForm');
    await expect(form, 'wheel-quote form should be present').toBeVisible();

    // Required contact fields.
    await form.locator('#WheelQuote-name').fill('Test Tester');
    await form.locator('#WheelQuote-email').fill('test@example.com');

    // Optional fields — fill if present.
    const phone = form.locator('#WheelQuote-phone');
    if (await phone.count()) await phone.fill('403-555-0123');
    const year = form.locator('#WheelQuote-year');
    if (await year.count()) await year.fill('2021');
    const make = form.locator('#WheelQuote-make');
    if (await make.count()) await make.fill('Ford');
    const vModel = form.locator('input[name="contact[Vehicle Model]"]');
    if (await vModel.count()) await vModel.fill('F-150');
    const notes = form.locator('textarea');
    if (await notes.count())
      await notes.first().fill('Automated Playwright smoke test — please ignore.');

    const submit = form
      .locator('button[type="submit"], input[type="submit"]')
      .first();
    await expect(submit, 'submit button should be present').toBeVisible();

    const isValid = await form.evaluate((f: HTMLFormElement) => f.checkValidity());
    expect(isValid, 'quote form should pass HTML5 validation once filled').toBeTruthy();

    if (!SHOULD_SUBMIT_FORMS) {
      await expect(submit).toBeEnabled();
      test.info().annotations.push({
        type: 'note',
        description: 'SUBMIT_FORMS not set — verified form validity without sending.',
      });
      return;
    }

    await submit.click();
    await page.waitForLoadState('domcontentloaded');
    const posted =
      /contact_posted=true/i.test(page.url()) ||
      (await page
        .getByText(/thanks|thank you|received|successfully|in touch/i)
        .first()
        .isVisible()
        .catch(() => false));
    expect(posted, 'expected a quote-form success confirmation').toBeTruthy();
  });
});
