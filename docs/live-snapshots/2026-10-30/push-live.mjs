// node --env-file=<app>/.env.local push-live.mjs <themeRoot> <key> [key...]   PUT to the role=main theme, read back.
import { readFileSync } from "node:fs";
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN, S = process.env.SHOPIFY_STORE_DOMAIN, V = process.env.SHOPIFY_API_VERSION || "2026-04";
const H = { "X-Shopify-Access-Token": T, "Content-Type": "application/json" };
const [root, ...keys] = process.argv.slice(2);
const main = (await (await fetch(`https://${S}/admin/api/${V}/themes.json`, { headers: H })).json()).themes.find((t) => t.role === "main");
console.log(`main theme ${main.id} "${main.name}"`);
for (const key of keys) {
  const value = readFileSync(`${root}/${key}`, "utf8");
  const r = await fetch(`https://${S}/admin/api/${V}/themes/${main.id}/assets.json`, { method: "PUT", headers: H, body: JSON.stringify({ asset: { key, value } }) });
  if (!r.ok) { console.error(`  ✗ ${key} → ${r.status} ${await r.text()}`); process.exitCode = 2; continue; }
  const j = await r.json(); console.log(`  ✓ ${key} (${value.length} chars, updated ${j.asset?.updated_at})`);
  await new Promise((res) => setTimeout(res, 600));
}
