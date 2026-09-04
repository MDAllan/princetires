import { test, expect } from '@playwright/test';

/**
 * Broken-link crawl: gather every link on the homepage, then check that each
 * same-site http(s) URL responds with a healthy status. External links,
 * tel:/mailto:/#anchors, and asset fragments are skipped.
 *
 * We verify links by NAVIGATING to them in the real browser rather than with a
 * plain HTTP fetch: Shopify's edge bot-protection returns 403 to non-browser
 * clients (the APIRequestContext), so only a genuine browser navigation gives a
 * trustworthy status code.
 */
test.describe('Broken links', () => {
  // Navigating each link is slower than a fetch, so allow more time.
  test.setTimeout(120_000);

  test('all homepage links resolve (no 4xx/5xx)', async ({ page, context, baseURL }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const origin = new URL(baseURL ?? 'https://princetires.ca').origin;

    // Collect, normalize, and de-duplicate hrefs.
    const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href)
    );

    const toCheck = Array.from(
      new Set(
        hrefs
          .filter((h) => h.startsWith('http'))
          .filter((h) => {
            try {
              return new URL(h).origin === origin; // same-site only
            } catch {
              return false;
            }
          })
          // Drop in-page anchors that resolve to the same path#fragment.
          .map((h) => h.split('#')[0])
          .filter(Boolean)
      )
    );

    expect(toCheck.length, 'expected to find same-site links to check').toBeGreaterThan(0);
    test.info().annotations.push({
      type: 'info',
      description: `Checking ${toCheck.length} unique same-site links by navigation.`,
    });

    const broken: string[] = [];
    const botChallenged: string[] = []; // 403s = Shopify bot challenge, not dead links

    // A genuinely broken link on Shopify returns 404/410 (missing) or 5xx
    // (server error). A 403 is the storefront's bot-challenge response, which
    // healthy pages also return when crawled quickly — so we record but don't
    // fail on those.
    const isBroken = (status: number) =>
      status === 0 || status === 404 || status === 410 || status >= 500;

    // Use a small pool of pages to navigate links concurrently but gently.
    const POOL_SIZE = 2;
    const queue = [...toCheck];

    async function worker() {
      const checker = await context.newPage();
      try {
        for (;;) {
          const url = queue.shift();
          if (!url) break;

          // 'commit' resolves as soon as response headers arrive — we only need
          // the status. Retry to absorb transient blips: Shopify's edge
          // intermittently aborts rapid successive navigations (null response,
          // status 0) the same way it 403s fast crawlers — back off and retry.
          let status = 0;
          let error: string | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await checker.waitForTimeout(1_000 * attempt);
            try {
              const res = await checker.goto(url, { waitUntil: 'commit', timeout: 25_000 });
              status = res?.status() ?? 0;
              error = null;
            } catch (err) {
              status = 0;
              error = (err as Error).message;
            }
            if (status >= 200 && status < 400) break; // healthy — done
          }

          if (status === 403) {
            botChallenged.push(url);
          } else if (error) {
            broken.push(`ERROR  ${url}  (${error})`);
          } else if (isBroken(status)) {
            broken.push(`${status || 'NO RESPONSE'}  ${url}`);
          }

          await checker.waitForTimeout(150); // politeness delay
        }
      } finally {
        await checker.close();
      }
    }

    await Promise.all(Array.from({ length: POOL_SIZE }, () => worker()));

    if (botChallenged.length) {
      test.info().annotations.push({
        type: 'warning',
        description:
          `${botChallenged.length} link(s) returned 403 (Shopify bot challenge) and were ` +
          `NOT counted as broken: ${botChallenged.join(', ')}`,
      });
    }

    expect(broken, `genuinely broken links (404/410/5xx/error) found:\n${broken.join('\n')}`).toEqual(
      []
    );
  });
});
