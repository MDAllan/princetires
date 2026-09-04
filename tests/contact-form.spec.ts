import { test, expect } from '@playwright/test';
import { SHOULD_SUBMIT_FORMS } from './helpers';

/**
 * Contact form (/pages/contact, form#PTContactForm).
 *
 * Fields (Shopify contact form): contact[Name], contact[Company],
 * contact[Phone number], contact[email], contact[Subject], contact[Comment].
 *
 * By default this test FILLS the form and verifies it is valid + submittable,
 * but does NOT perform the real POST (which would email the store). Set
 * SUBMIT_FORMS=1 to do a true end-to-end submit and assert the success state.
 */
test.describe('Contact form', () => {
  test('fills and submits the contact form', async ({ page }) => {
    await page.goto('/pages/contact', { waitUntil: 'domcontentloaded' });

    const form = page.locator('form#PTContactForm');
    await expect(form, 'contact form should be present').toBeVisible();

    await form.locator('input[name="contact[Name]"]').fill('Test Tester');
    await form.locator('input[name="contact[Company]"]').fill('QA Automation');
    await form.locator('input[name="contact[Phone number]"]').fill('403-555-0123');
    await form.locator('input[name="contact[email]"]').fill('test@example.com');
    await form.locator('input[name="contact[Subject]"]').fill('Automated test — please ignore');
    await form
      .locator('textarea[name="contact[Comment]"]')
      .fill('This is an automated Playwright smoke test. No action needed.');

    const submit = form.locator('button[type="submit"], .pt-contact__send').first();
    await expect(submit, 'submit button should be present').toBeVisible();

    // The native form should now report itself as valid (all required fields ok).
    const isValid = await form.evaluate((f: HTMLFormElement) => f.checkValidity());
    expect(isValid, 'contact form should pass HTML5 validation once filled').toBeTruthy();

    if (!SHOULD_SUBMIT_FORMS) {
      // Safe mode: confirm the form is ready to send, then stop (no email sent).
      await expect(submit).toBeEnabled();
      test.info().annotations.push({
        type: 'note',
        description: 'SUBMIT_FORMS not set — verified form validity without sending.',
      });
      return;
    }

    // Real submit: Shopify redirects back with ?contact_posted=true and a notice.
    await submit.click();
    await page.waitForLoadState('domcontentloaded');
    const posted =
      /contact_posted=true/i.test(page.url()) ||
      (await page
        .getByText(/thanks|thank you|message has been sent|successfully/i)
        .first()
        .isVisible()
        .catch(() => false));
    expect(posted, 'expected a contact-form success confirmation').toBeTruthy();
  });
});
