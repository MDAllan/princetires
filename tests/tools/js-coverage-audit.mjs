// JS coverage + LCP audit for the live site under mobile emulation.
// Attributes the PageSpeed "unused JavaScript" finding to concrete scripts.
//   node tests/tools/js-coverage-audit.mjs [url]
import { chromium, devices } from "playwright";

const url = process.argv[2] || "https://princetires.ca/";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices["Pixel 7"],
  // real-browser UA matters on Shopify's edge (bot-UA tier serves stale)
});
const page = await ctx.newPage();

await page.addInitScript(() => {
  window.__lcp = [];
  try {
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) =>
        window.__lcp.push({
          t: Math.round(e.startTime),
          size: e.size,
          url: e.url || null,
          tag: e.element ? e.element.tagName + "." + (e.element.className || "").toString().slice(0, 60) : null,
        })
      )
    ).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
});

await page.coverage.startJSCoverage({ resetOnNavigation: false });
// analytics-heavy pages never reach networkidle — settle on load + fixed wait
await page.goto(url, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
const cov = await page.coverage.stopJSCoverage();
const lcp = await page.evaluate(() => window.__lcp);

const rows = [];
for (const entry of cov) {
  const total = entry.source ? entry.source.length : 0;
  if (!total) continue;
  // V8 ranges: count>0 = executed
  // V8 precise coverage: count==0 ranges are the authoritative NOT-executed
  // spans (they nest inside executed outer ranges) — unused = their union.
  const dead = [];
  for (const fn of entry.functions || [])
    for (const r of fn.ranges || []) if (r.count === 0) dead.push([r.startOffset, r.endOffset]);
  dead.sort((a, b) => a[0] - b[0]);
  let unused = 0, end = -1;
  for (const [s, e] of dead) {
    if (e <= end) continue;
    unused += e - Math.max(s, end);
    end = e;
  }
  rows.push({ url: entry.url, total, unused });
}

function bucket(u) {
  if (!u.startsWith("http")) return "inline";
  if (u.includes("/cdn/shop/t/") && u.includes("/assets/")) return "THEME asset";
  if (u.includes("cdn.shopify.com") || u.includes("/cdn/shopifycloud/") || u.includes("/cdn/shop/s/")) return "Shopify platform";
  if (u.includes("googletagmanager") || u.includes("google-analytics") || u.includes("gtag")) return "Google tags";
  if (u.includes("/cdn/shop/")) return "Shopify (other)";
  return "third-party: " + new URL(u).host;
}

rows.sort((a, b) => b.unused - a.unused);
const kb = (n) => (n / 1024).toFixed(1).padStart(8);
console.log("UNUSED    TOTAL     %UNUSED  BUCKET               URL");
let sums = {};
for (const r of rows) {
  const b = bucket(r.url);
  sums[b] = sums[b] || { unused: 0, total: 0 };
  sums[b].unused += r.unused;
  sums[b].total += r.total;
  if (r.unused > 5 * 1024)
    console.log(`${kb(r.unused)}K ${kb(r.total)}K  ${String(Math.round((100 * r.unused) / r.total)).padStart(5)}%  ${b.padEnd(20)} ${r.url.slice(0, 110)}`);
}
console.log("\n── By bucket ──");
for (const [b, s] of Object.entries(sums).sort((a, b) => b[1].unused - a[1].unused))
  console.log(`${kb(s.unused)}K unused of ${kb(s.total)}K  ${b}`);
const grand = rows.reduce((a, r) => a + r.unused, 0);
console.log(`\nTOTAL UNUSED: ${(grand / 1024).toFixed(0)} KB across ${rows.length} scripts`);
console.log("\n── LCP candidates ──");
for (const e of lcp) console.log(`  ${e.t}ms size=${e.size} ${e.tag || ""} ${e.url || ""}`);

await browser.close();
